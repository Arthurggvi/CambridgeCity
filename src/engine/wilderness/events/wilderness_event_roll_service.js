import { WILDERNESS_EVENT_POOLS } from "../../../../data/wilderness/events/wilderness_event_pools.js";

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function defaultRandom01() {
  return Math.random();
}

function poolMatchesContext(pool, context) {
  if (!pool || String(pool.hook || "").trim() !== String(context.hook || "").trim()) return false;
  const when = pool.when && typeof pool.when === "object" ? pool.when : {};
  const tagsAny = Array.isArray(when.terrainTagsAny) ? when.terrainTagsAny : [];
  const areasAny = Array.isArray(when.areaIdsAny) ? when.areaIdsAny : [];
  const terrainTags = Array.isArray(context.terrainTags) ? context.terrainTags : [];
  const areaId = String(context.areaId || "").trim();
  const tagOk = tagsAny.length === 0 || tagsAny.some((t) => terrainTags.includes(t));
  const areaOk = areasAny.length === 0 || areasAny.includes(areaId);
  return tagOk && areaOk;
}

function pickWeightedEntry(entries, rng) {
  const list = Array.isArray(entries) ? entries.filter((e) => e && typeof e.weight === "number" && e.weight > 0) : [];
  if (list.length === 0) return null;
  const total = list.reduce((s, e) => s + e.weight, 0);
  if (!(total > 0)) return null;
  let r = rng() * total;
  for (const e of list) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return list[list.length - 1];
}

function cellEventCooldownHit(queueBeforeEnqueue, pool, context, eventId) {
  const cd = pool?.cooldown;
  if (!cd || cd.sameCellOnce !== true) return false;
  const areaId = String(context.areaId || "").trim();
  const x = Math.trunc(Number(context.targetX));
  const y = Math.trunc(Number(context.targetY));
  const k = `${pool.id}:${areaId}:${x}:${y}:${eventId}`;
  const map = queueBeforeEnqueue?.cooldowns?.byCellKey && typeof queueBeforeEnqueue.cooldowns.byCellKey === "object"
    ? queueBeforeEnqueue.cooldowns.byCellKey
    : {};
  return Object.prototype.hasOwnProperty.call(map, k);
}

function stepsCooldownHit(queueBeforeEnqueue, pool, context, eventId) {
  const cd = pool?.cooldown;
  const stepsGap = Number(cd?.sameEventSteps);
  if (!Number.isFinite(stepsGap) || stepsGap <= 0) return false;
  const cur = Math.trunc(Number(context.stepsTakenAfterMove));
  const prevRaw = queueBeforeEnqueue?.cooldowns?.byEventId?.[eventId];
  const prev = Number(prevRaw);
  if (!Number.isFinite(prev)) return false;
  return cur - prev < stepsGap;
}

/**
 * @param {object} context
 * @param {object} [registries]
 * @param {{ random?: () => number }} [rngLike]
 * @param {object} queueBeforeEnqueue normalized event queue snapshot before enqueue
 */
export function rollWildernessEventPool(context, registries = {}, rngLike, queueBeforeEnqueue) {
  const pools = registries.pools != null ? registries.pools : WILDERNESS_EVENT_POOLS;
  const rng = typeof rngLike?.random === "function" ? rngLike.random.bind(rngLike) : defaultRandom01;

  const empty = {
    matchedPools: [],
    gateRolled: null,
    selectedPoolId: null,
    selectedEventId: null,
    enqueueFrameInput: null,
    reason: "invalid_context"
  };

  if (!isPlainObject(context) || context.movementSucceeded !== true) {
    return { ...empty, reason: "invalid_context" };
  }

  const matchedPools = [];
  for (const pid of Object.keys(pools)) {
    const pool = pools[pid];
    if (poolMatchesContext(pool, context)) matchedPools.push(pool);
  }

  if (matchedPools.length === 0) {
    return {
      matchedPools,
      gateRolled: null,
      selectedPoolId: null,
      selectedEventId: null,
      enqueueFrameInput: null,
      reason: "no_pool"
    };
  }

  const qSnap = isPlainObject(queueBeforeEnqueue) ? queueBeforeEnqueue : {};

  let lastGateRolled = null;

  for (const pool of matchedPools) {
    const gateRolled = rng();
    lastGateRolled = gateRolled;
    const gateChance = Number(pool.gateChance);
    const gc = Number.isFinite(gateChance) ? Math.max(0, Math.min(1, gateChance)) : 0;
    if (!(gateRolled < gc)) continue;

    const picked = pickWeightedEntry(pool.entries, rng);
    const eventId = picked && typeof picked.eventId === "string" && picked.eventId.trim() ? picked.eventId.trim() : null;
    if (!eventId) continue;

    if (cellEventCooldownHit(qSnap, pool, context, eventId)) {
      return {
        matchedPools,
        gateRolled,
        selectedPoolId: pool.id,
        selectedEventId: eventId,
        enqueueFrameInput: null,
        reason: "cooldown"
      };
    }
    if (stepsCooldownHit(qSnap, pool, context, eventId)) {
      return {
        matchedPools,
        gateRolled,
        selectedPoolId: pool.id,
        selectedEventId: eventId,
        enqueueFrameInput: null,
        reason: "cooldown"
      };
    }

    const seqBase = Math.max(0, Math.trunc(Number(context.queueSeqBeforeEnqueue ?? 0)));
    const occurredAt = Number(context.occurredAtMinutes);
    const occurredAtMinutes = Number.isFinite(occurredAt) ? Math.floor(occurredAt) : 0;

    return {
      matchedPools,
      gateRolled,
      selectedPoolId: pool.id,
      selectedEventId: eventId,
      enqueueFrameInput: {
        seq: seqBase + 1,
        createdAtMinutes: occurredAtMinutes,
        source: { poolId: pool.id },
        payload: {
          eventId,
          areaId: String(context.areaId || "").trim(),
          x: Math.trunc(Number(context.targetX)),
          y: Math.trunc(Number(context.targetY))
        }
      },
      reason: "hit"
    };
  }

  return {
    matchedPools,
    gateRolled: lastGateRolled,
    selectedPoolId: null,
    selectedEventId: null,
    enqueueFrameInput: null,
    reason: "gate_miss"
  };
}
