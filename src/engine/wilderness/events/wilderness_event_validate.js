import { TERRAIN_BIOME_DEFS } from "../../../../data/wilderness/terrain/wilderness_terrain_defs.js";

const FORBIDDEN_EVENT_DEF_KEYS = new Set([
  "effects",
  "inventory",
  "money",
  "hp",
  "temperatureC",
  "currentMapId",
  "world",
  "player",
  "commit"
]);

function isNonEmptyString(x) {
  return typeof x === "string" && x.length > 0;
}

function collectForbiddenKeys(value, basePath, errors) {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectForbiddenKeys(value[i], `${basePath}[${i}]`, errors);
    }
    return;
  }
  for (const k of Object.keys(value)) {
    if (k === "resultIntents") continue;
    if (FORBIDDEN_EVENT_DEF_KEYS.has(k)) {
      errors.push(`event def ${basePath}: forbidden key "${k}"`);
    }
    collectForbiddenKeys(value[k], `${basePath}.${k}`, errors);
  }
}

function validateTagArray(tags, label, errors) {
  if (!Array.isArray(tags)) {
    errors.push(`${label}: must be an array`);
    return;
  }
  if (tags.length === 0) {
    errors.push(`${label}: must be a non-empty array`);
    return;
  }
  for (let i = 0; i < tags.length; i++) {
    if (!isNonEmptyString(tags[i])) {
      errors.push(`${label}[${i}]: must be a non-empty string`);
    }
  }
}

const RESULT_INTENT_GRANT_ITEM_FIELDS = new Set(["type", "itemId", "qty", "reason"]);
const RESULT_INTENT_PLAYER_DELTA_FIELDS = new Set(["type", "hp", "stamina", "reason"]);

function validateResultIntents(resultIntents, path, errors, itemDefsById) {
  if (!Array.isArray(resultIntents)) {
    errors.push(`${path}: must be an array`);
    return;
  }

  for (let i = 0; i < resultIntents.length; i++) {
    const intent = resultIntents[i];
    const ip = `${path}[${i}]`;
    if (intent == null || typeof intent !== "object" || Array.isArray(intent)) {
      errors.push(`${ip}: must be an object`);
      continue;
    }

    const type = String(intent.type || "").trim();
    if (type !== "grant_item" && type !== "apply_player_delta") {
      errors.push(`${ip}.type: unknown resultIntent type "${type || "(empty)"}"`);
      continue;
    }

    if (type === "grant_item") {
      for (const key of Object.keys(intent)) {
        if (!RESULT_INTENT_GRANT_ITEM_FIELDS.has(key)) {
          errors.push(`${ip}.${key}: unknown field`);
        }
      }

      const itemId = typeof intent.itemId === "string" ? intent.itemId.trim() : "";
      if (!itemId) {
        errors.push(`${ip}.itemId: must be a non-empty string`);
      } else if (itemDefsById?.get) {
        const itemDef = itemDefsById.get(itemId);
        if (!itemDef) {
          errors.push(`${ip}.itemId: unknown itemId "${itemId}"`);
        } else if (String(itemDef.category || "").trim() !== "material") {
          errors.push(`${ip}.itemId: grant_item must reference a material item`);
        }
      }

      if (intent.qty != null) {
        const qty = Number(intent.qty);
        if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
          errors.push(`${ip}.qty: must be an integer in 1..99 when present`);
        }
      }

      if (intent.reason != null && typeof intent.reason !== "string") {
        errors.push(`${ip}.reason: must be a string when present`);
      }
      continue;
    }

    for (const key of Object.keys(intent)) {
      if (!RESULT_INTENT_PLAYER_DELTA_FIELDS.has(key)) {
        errors.push(`${ip}.${key}: unknown field`);
      }
    }

    const hasHp = intent.hp != null;
    const hasStamina = intent.stamina != null;
    if (!hasHp && !hasStamina) {
      errors.push(`${ip}: apply_player_delta requires hp or stamina`);
    }
    if (hasHp && !Number.isFinite(Number(intent.hp))) {
      errors.push(`${ip}.hp: must be a finite number when present`);
    }
    if (hasStamina && !Number.isFinite(Number(intent.stamina))) {
      errors.push(`${ip}.stamina: must be a finite number when present`);
    }
    if (intent.reason != null && typeof intent.reason !== "string") {
      errors.push(`${ip}.reason: must be a string when present`);
    }
  }
}

function validateOutcomePayload(row, path, errors, requireOutcomeId, requireWeight, itemDefsById) {
  if (requireOutcomeId && !isNonEmptyString(row.outcomeId)) {
    errors.push(`${path}.outcomeId: must be a non-empty string`);
  }
  if (requireWeight) {
    if (typeof row.weight !== "number" || !Number.isFinite(row.weight) || row.weight <= 0) {
      errors.push(`${path}.weight: must be a finite number > 0`);
    }
  }
  if (!isNonEmptyString(row.resultText)) {
    errors.push(`${path}.resultText: must be a non-empty string`);
  }
  if (!isNonEmptyString(row.logLine)) {
    errors.push(`${path}.logLine: must be a non-empty string`);
  }
  validateResultIntents(row.resultIntents, `${path}.resultIntents`, errors, itemDefsById);
  if (row.continuation == null || typeof row.continuation !== "object" || Array.isArray(row.continuation)) {
    errors.push(`${path}.continuation: must be an object`);
  } else if (!isNonEmptyString(row.continuation.mode)) {
    errors.push(`${path}.continuation.mode: must be a non-empty string`);
  }
}

function validateEventDef(defId, def, errors, itemDefsById) {
  const base = `event "${defId}"`;
  if (!isNonEmptyString(def.id) || def.id !== defId) {
    errors.push(`${base}: object key must equal id field`);
  }
  collectForbiddenKeys(def, base, errors);

  if (!isNonEmptyString(def.title)) {
    errors.push(`${base}: title must be a non-empty string`);
  }
  if (def.presentation == null || typeof def.presentation !== "object") {
    errors.push(`${base}: presentation must be an object`);
  } else {
    if (!isNonEmptyString(def.presentation.body)) {
      errors.push(`${base}.presentation.body: must be a non-empty string`);
    }
    if (!isNonEmptyString(def.presentation.logLine)) {
      errors.push(`${base}.presentation.logLine: must be a non-empty string`);
    }
  }

  if (!Array.isArray(def.actions) || def.actions.length === 0) {
    errors.push(`${base}: actions must be a non-empty array`);
    return;
  }

  const actionIds = new Set();
  for (let ai = 0; ai < def.actions.length; ai++) {
    const act = def.actions[ai];
    const ap = `${base}.actions[${ai}]`;
    if (act == null || typeof act !== "object") {
      errors.push(`${ap}: must be an object`);
      continue;
    }
    if (!isNonEmptyString(act.id)) {
      errors.push(`${ap}.id: must be a non-empty string`);
    } else if (actionIds.has(act.id)) {
      errors.push(`${base}: duplicate action id "${act.id}"`);
    } else {
      actionIds.add(act.id);
    }
    if (!isNonEmptyString(act.label)) {
      errors.push(`${ap}.label: must be a non-empty string`);
    }
    if (act.timeCostMinutes != null) {
      if (typeof act.timeCostMinutes !== "number" || !Number.isFinite(act.timeCostMinutes) || act.timeCostMinutes < 0) {
        errors.push(`${ap}.timeCostMinutes: must be a finite number >= 0 when present`);
      }
    }

    const hasTable = act.outcomeTable != null;
    const hasOutcome = act.outcome != null;
    if (hasTable === hasOutcome) {
      errors.push(`${ap}: must have exactly one of outcomeTable or outcome`);
      continue;
    }
    if (hasTable) {
      if (!Array.isArray(act.outcomeTable) || act.outcomeTable.length === 0) {
        errors.push(`${ap}.outcomeTable: must be a non-empty array`);
        continue;
      }
      for (let oi = 0; oi < act.outcomeTable.length; oi++) {
        const row = act.outcomeTable[oi];
        const rp = `${ap}.outcomeTable[${oi}]`;
        if (row == null || typeof row !== "object") {
          errors.push(`${rp}: must be an object`);
          continue;
        }
        validateOutcomePayload(row, rp, errors, true, true, itemDefsById);
      }
    } else {
      validateOutcomePayload(act.outcome, `${ap}.outcome`, errors, false, false, itemDefsById);
    }
  }
}

function validatePool(poolId, pool, defIds, errors) {
  const base = `pool "${poolId}"`;
  if (!isNonEmptyString(pool.id) || pool.id !== poolId) {
    errors.push(`${base}: object key must equal id field`);
  }
  if (!isNonEmptyString(pool.hook)) {
    errors.push(`${base}: hook must be a non-empty string`);
  }
  if (typeof pool.gateChance !== "number" || !Number.isFinite(pool.gateChance) || pool.gateChance < 0 || pool.gateChance > 1) {
    errors.push(`${base}: gateChance must be a finite number in [0, 1]`);
  }
  if (pool.when != null && typeof pool.when === "object" && !Array.isArray(pool.when)) {
    if (pool.when.terrainTagsAny != null) {
      validateTagArray(pool.when.terrainTagsAny, `${base}.when.terrainTagsAny`, errors);
    }
    if (pool.when.areaIdsAny != null) {
      validateTagArray(pool.when.areaIdsAny, `${base}.when.areaIdsAny`, errors);
    }
  }
  if (!Array.isArray(pool.entries) || pool.entries.length === 0) {
    errors.push(`${base}: entries must be a non-empty array`);
    return;
  }
  for (let ei = 0; ei < pool.entries.length; ei++) {
    const ent = pool.entries[ei];
    const ep = `${base}.entries[${ei}]`;
    if (ent == null || typeof ent !== "object") {
      errors.push(`${ep}: must be an object`);
      continue;
    }
    if (!isNonEmptyString(ent.eventId)) {
      errors.push(`${ep}.eventId: must be a non-empty string`);
    } else if (!defIds.has(ent.eventId)) {
      errors.push(`${ep}.eventId: unknown event id "${ent.eventId}"`);
    }
    if (typeof ent.weight !== "number" || !Number.isFinite(ent.weight) || ent.weight <= 0) {
      errors.push(`${ep}.weight: must be a finite number > 0`);
    }
  }
}

/**
 * Validates wilderness random-event static data. Pure; no I/O and no RNG.
 * @param {object} params
 * @param {Record<string, unknown>} params.terrainTags - WILDERNESS_TERRAIN_EVENT_TAGS
 * @param {Record<string, unknown>} params.pools - WILDERNESS_EVENT_POOLS
 * @param {Record<string, unknown>} params.defs - WILDERNESS_EVENT_DEFS
 * @param {Record<string, unknown>} [params.terrainBiomeDefs] - defaults to imported TERRAIN_BIOME_DEFS
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateWildernessEventData({
  terrainTags,
  pools,
  defs,
  terrainBiomeDefs = TERRAIN_BIOME_DEFS,
  itemDefsById = null
}) {
  const errors = [];
  const terrainIds = new Set(Object.keys(terrainBiomeDefs || {}));

  if (terrainTags != null && typeof terrainTags === "object") {
    for (const terrainId of Object.keys(terrainTags)) {
      const tags = terrainTags[terrainId];
      const label = `terrain_event_tags["${terrainId}"]`;
      if (!terrainIds.has(terrainId)) {
        errors.push(`${label}: terrainId is not defined in wilderness terrain defs`);
      }
      validateTagArray(tags, label, errors);
    }
  } else {
    errors.push("terrainTags: must be an object");
  }

  const defIds = new Set();
  if (defs != null && typeof defs === "object") {
    for (const defId of Object.keys(defs)) {
      if (defIds.has(defId)) {
        errors.push(`duplicate event id key "${defId}"`);
      }
      defIds.add(defId);
      validateEventDef(defId, defs[defId], errors, itemDefsById);
    }
  } else {
    errors.push("defs: must be an object");
  }

  const poolIds = new Set();
  if (pools != null && typeof pools === "object") {
    for (const poolId of Object.keys(pools)) {
      if (poolIds.has(poolId)) {
        errors.push(`duplicate pool id key "${poolId}"`);
      }
      poolIds.add(poolId);
      validatePool(poolId, pools[poolId], defIds, errors);
    }
  } else {
    errors.push("pools: must be an object");
  }

  return { ok: errors.length === 0, errors };
}
