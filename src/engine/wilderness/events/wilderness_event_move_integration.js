import { getWildernessTerrainEventTags } from "./wilderness_event_registry.js";
import { rollWildernessEventPool } from "./wilderness_event_roll_service.js";
import { createWildernessEventFrame, enqueueWildernessEventFrame } from "./wilderness_event_queue.js";
import { drainWildernessEventQueue } from "./wilderness_event_queue_drain.js";
import {
  createDefaultWildernessEventQueue,
  normalizeWildernessEventQueue
} from "./wilderness_event_queue_state.js";
import { resolveWildernessEventTailContinuation } from "./wilderness_event_continuation.js";

/**
 * Resolve-only context for wilderness random events (no RNG, no queue writes).
 */
export function buildWildernessEventOpportunityContext({ movementPlan, plannedAtMinutes }) {
  const mp = movementPlan;
  // Bug3: a stamina-depleted attempt never reaches the cell it pointed at.
  // Treat it as a failed move opportunity so any downstream consumer that
  // inspects this context cannot mistakenly roll arrival events.
  const ok = mp?.ok === true && mp?.staminaInsufficient !== true;
  const to = mp?.to && typeof mp.to === "object" ? mp.to : { x: 0, y: 0 };
  const terrainId = mp?.terrainId != null && mp.terrainId !== "" ? String(mp.terrainId) : null;
  const tagsRaw = terrainId ? getWildernessTerrainEventTags(terrainId) : null;
  const terrainTags = tagsRaw ? [...tagsRaw] : [];
  const pm = Number(plannedAtMinutes);
  return {
    hook: "after_wilderness_move_success",
    areaId: String(mp?.areaId || "").trim(),
    targetX: Math.trunc(Number(to.x)),
    targetY: Math.trunc(Number(to.y)),
    terrainId,
    terrainTags,
    plannedAtMinutes: Number.isFinite(pm) ? Math.floor(pm) : 0,
    movementSucceeded: ok
  };
}

export function buildWildernessMoveFinalContinuationTail(movementPlan, _activeState) {
  const mp = movementPlan;
  const areaId = String(mp?.areaId || "").trim();
  const to = mp?.to && typeof mp.to === "object" ? mp.to : { x: 0, y: 0 };
  const x = Math.trunc(Number(to.x));
  const y = Math.trunc(Number(to.y));
  const gotoLandmarkId =
    mp?.landmarkIntercept && String(mp.landmarkIntercept.gotoMapId || "").trim()
      ? String(mp.landmarkIntercept.gotoMapId).trim()
      : "";

  if (gotoLandmarkId) {
    return {
      mode: "transition",
      areaId,
      settledWildernessX: x,
      settledWildernessY: y,
      targetMapId: gotoLandmarkId
    };
  }
  return {
    mode: "return_to_wilderness",
    areaId,
    mapId: "wilderness_runtime",
    x,
    y
  };
}

function mergeCooldownWrites(queue, patch) {
  const baseByEvent = queue.cooldowns?.byEventId && typeof queue.cooldowns.byEventId === "object" ? queue.cooldowns.byEventId : {};
  const baseByCell = queue.cooldowns?.byCellKey && typeof queue.cooldowns.byCellKey === "object" ? queue.cooldowns.byCellKey : {};
  return {
    ...queue,
    cooldowns: {
      byEventId: { ...baseByEvent, ...(patch.byEventId || {}) },
      byCellKey: { ...baseByCell, ...(patch.byCellKey || {}) }
    }
  };
}

/**
 * Commit-side hook: rolls pools (RNG isolated in roll service), may enqueue + drain; mutates activeState.world.wilderness.eventQueue.
 */
export function integrateWildernessEventQueueAfterSuccessfulMove({
  activeState,
  intent,
  movementPlan,
  rngLike,
  registries
}) {
  const summaryBase = {
    rolled: false,
    hit: false,
    selectedPoolId: null,
    selectedEventId: null,
    enqueuedFrameId: null,
    activeFrameId: null,
    shouldResumeTail: false
  };

  if (!activeState.world || typeof activeState.world !== "object") {
    activeState.world = {};
  }
  const wild = activeState.world.wilderness && typeof activeState.world.wilderness === "object" ? activeState.world.wilderness : null;
  if (!wild) {
    return { ...summaryBase, rolled: false };
  }

  let queue = normalizeWildernessEventQueue(wild.eventQueue != null ? wild.eventQueue : createDefaultWildernessEventQueue());

  const ctxResolve =
    intent?.eventOpportunityContext ||
    buildWildernessEventOpportunityContext({
      movementPlan,
      plannedAtMinutes: Math.floor(Number(activeState?.time?.totalMinutes ?? 0))
    });

  const occurredAtMinutes = Math.max(0, Math.floor(Number(activeState?.time?.totalMinutes ?? 0)));
  const stepsTakenAfterMove = Math.max(0, Math.trunc(Number(wild.stepsTaken ?? 0)));

  const rollCtx = {
    ...ctxResolve,
    movementSucceeded: true,
    occurredAtMinutes,
    stepsTakenAfterMove,
    queueSeqBeforeEnqueue: queue.seq,
    hook: "after_wilderness_move_success"
  };

  const tailCandidate = buildWildernessMoveFinalContinuationTail(movementPlan, activeState);
  const tailProbePre = resolveWildernessEventTailContinuation({ tailContinuation: tailCandidate });
  const tailSafe = tailProbePre.ok ? tailCandidate : null;

  const roll = rollWildernessEventPool(rollCtx, registries || {}, rngLike, queue);

  let summary = { ...summaryBase, rolled: true };

  if (roll.reason !== "hit" || !roll.enqueueFrameInput) {
    const drainedNoEnqueue = drainWildernessEventQueue(queue);
    queue = drainedNoEnqueue.queue;
    summary.shouldResumeTail = drainedNoEnqueue.shouldResumeTail;
    summary.activeFrameId = queue.activeFrameId;
    wild.eventQueue = queue;
    return summary;
  }

  const frame = createWildernessEventFrame(roll.enqueueFrameInput);
  const en = enqueueWildernessEventFrame(queue, frame);
  queue = en.queue;

  const pool = roll.matchedPools.find((p) => p.id === roll.selectedPoolId);

  const cdPatch = { byEventId: {}, byCellKey: {} };
  const cd = pool?.cooldown && typeof pool.cooldown === "object" ? pool.cooldown : null;
  const sameSteps = Number(cd?.sameEventSteps);
  if (cd && Number.isFinite(sameSteps) && sameSteps > 0 && roll.selectedEventId) {
    cdPatch.byEventId[roll.selectedEventId] = stepsTakenAfterMove;
  }
  if (cd?.sameCellOnce === true && roll.selectedPoolId && roll.selectedEventId) {
    const k = `${roll.selectedPoolId}:${rollCtx.areaId}:${rollCtx.targetX}:${rollCtx.targetY}:${roll.selectedEventId}`;
    cdPatch.byCellKey[k] = stepsTakenAfterMove;
  }
  if (Object.keys(cdPatch.byEventId).length || Object.keys(cdPatch.byCellKey).length) {
    queue = mergeCooldownWrites(queue, cdPatch);
  }

  queue = { ...queue, tailContinuation: tailSafe };

  const drained = drainWildernessEventQueue(queue);
  queue = drained.queue;

  wild.eventQueue = queue;

  return {
    ...summary,
    hit: true,
    selectedPoolId: roll.selectedPoolId,
    selectedEventId: roll.selectedEventId,
    enqueuedFrameId: frame.frameId,
    activeFrameId: queue.activeFrameId,
    shouldResumeTail: drained.shouldResumeTail
  };
}
