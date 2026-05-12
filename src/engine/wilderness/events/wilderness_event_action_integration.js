import { advanceTimeMinutes, getTimeView } from "../../time.js";
import { applyTimeToPlayer } from "../../player.js";
import { getRegionConfigById, getPlaceProfileForMap } from "../../loader.js";
import { ensureItemsDbLoaded, getCapacityProfile } from "../../items_db.js";
import { grantInventoryItem } from "../../inventory/inventory_grant_helper.js";
import { getWildernessEventDefById } from "./wilderness_event_registry.js";
import {
  createDefaultWildernessEventQueue,
  normalizeWildernessEventQueue,
  WILDERNESS_EVENT_FRAME_STATUSES
} from "./wilderness_event_queue_state.js";
import { markWildernessEventFrameResolved } from "./wilderness_event_queue.js";
import { drainWildernessEventQueue } from "./wilderness_event_queue_drain.js";
import { resolveWildernessEventTailContinuation } from "./wilderness_event_continuation.js";

function defaultRandom01() {
  return Math.random();
}

function pickWeightedOutcomeRows(entries, rng) {
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

/**
 * RNG confined here for outcome tables (commit-time).
 */
export function rollWildernessEventOutcome(eventDef, actionId, rngLike) {
  const rng = typeof rngLike?.random === "function" ? rngLike.random.bind(rngLike) : defaultRandom01;
  const actions = Array.isArray(eventDef?.actions) ? eventDef.actions : [];
  const act = actions.find((a) => String(a?.id || "").trim() === String(actionId || "").trim());
  if (!act) {
    return { error: "missing_action" };
  }
  if (Array.isArray(act.outcomeTable)) {
    const picked = pickWeightedOutcomeRows(act.outcomeTable, rng);
    if (!picked) return { error: "empty_table" };
    const mode = picked.continuation?.mode;
    if (mode !== "resume") return { error: "unsupported_continuation" };
    return {
      outcomeId: String(picked.outcomeId || "").trim(),
      resultText: String(picked.resultText || ""),
      logLine: String(picked.logLine || ""),
      resultIntents: Array.isArray(picked.resultIntents) ? [...picked.resultIntents] : [],
      continuation: picked.continuation
    };
  }
  if (act.outcome && typeof act.outcome === "object") {
    const mode = act.outcome.continuation?.mode;
    if (mode !== "resume") return { error: "unsupported_continuation" };
    return {
      outcomeId: `fixed_${String(actionId || "").trim()}`,
      resultText: String(act.outcome.resultText || ""),
      logLine: String(act.outcome.logLine || ""),
      resultIntents: Array.isArray(act.outcome.resultIntents) ? [...act.outcome.resultIntents] : [],
      continuation: act.outcome.continuation
    };
  }
  return { error: "no_outcome" };
}

function buildWildernessEventPlayerTimeCtx(activeState) {
  const wx = activeState.world?.weather && typeof activeState.world.weather === "object" ? activeState.world.weather : {};
  const tEnvR = Number(wx.tEnv_region);
  const windLoc = Number(wx.windSpeed_local);
  const thermalEnvOverride = {};
  if (Number.isFinite(tEnvR)) thermalEnvOverride.tEnvRegionC = tEnvR;
  if (Number.isFinite(windLoc)) thermalEnvOverride.worldWindSpeed = windLoc;

  const regionCfg = getRegionConfigById(activeState.world?.regionId);
  const placeProfileRaw = getPlaceProfileForMap(activeState.currentMapId, activeState.currentMap);
  const placeProfile =
    placeProfileRaw && typeof placeProfileRaw === "object"
      ? {
          ...placeProfileRaw,
          space: String(placeProfileRaw.space || "outdoor"),
          exposureLevel: String(placeProfileRaw.exposureLevel || "Open")
        }
      : { space: "outdoor", exposureLevel: "Open", windShelter: 0, heatSource: 0, drying: 0 };

  const baseMoveCtx = { isSleeping: false, sessionCoverage: "NONE" };
  return {
    ...baseMoveCtx,
    world: activeState.world,
    currentMapId: activeState.currentMapId,
    currentMap: activeState.currentMap,
    timeView: getTimeView(activeState.time.totalMinutes),
    regionCfg,
    placeProfile,
    ...(Object.keys(thermalEnvOverride).length > 0 ? { thermalEnvOverride } : {})
  };
}

async function applyWildernessEventResultIntents(activeState, resultIntents, options = {}) {
  const intents = Array.isArray(resultIntents) ? resultIntents : [];
  if (intents.length === 0) return [];

  if (!activeState.player || typeof activeState.player !== "object") activeState.player = {};
  if (!activeState.player.physio || typeof activeState.player.physio !== "object") activeState.player.physio = {};
  if (!activeState.player.psycho || typeof activeState.player.psycho !== "object") activeState.player.psycho = {};

  let nextInventory = activeState.player.inventory;
  const results = [];
  let loadedItems = null;
  const baseHp = Number(options?.playerDeltaBase?.hp);
  const baseStamina = Number(options?.playerDeltaBase?.stamina);
  let playerDeltaHpBase = Number.isFinite(baseHp) ? Math.max(0, Math.min(100, baseHp)) : null;
  let playerDeltaStaminaBase = Number.isFinite(baseStamina) ? Math.max(0, Math.min(100, baseStamina)) : null;

  for (const intent of intents) {
    const type = String(intent?.type || "").trim();
    if (type === "grant_item") {
      if (!loadedItems) loadedItems = await ensureItemsDbLoaded();
      if (!loadedItems.ok) {
        results.push({
          type: "grant_item",
          itemId: String(intent?.itemId || "").trim(),
          qty: Math.max(1, Math.floor(Number(intent?.qty ?? 1) || 1)),
          granted: false,
          failureCode: "unknown",
          reason: typeof intent?.reason === "string" ? intent.reason : ""
        });
        continue;
      }

      const itemsById = loadedItems.byId;
      const capacityProfile = getCapacityProfile(activeState.player?.equipment, itemsById);
      const itemId = String(intent?.itemId || "").trim();
      const qty = Math.floor(Number(intent?.qty ?? 1));
      const reason = typeof intent?.reason === "string" ? intent.reason : "";
      const result = grantInventoryItem({
        inventory: nextInventory,
        itemId,
        qty,
        itemsById,
        capacityProfile
      });

      if (result.ok) {
        nextInventory = result.inventory;
        activeState.player.inventory = nextInventory;
        results.push({
          type: "grant_item",
          itemId: result.granted.itemId,
          qty: result.granted.qty,
          granted: true,
          failureCode: null,
          reason
        });
      } else {
        results.push({
          type: "grant_item",
          itemId,
          qty: Number.isFinite(qty) ? qty : 0,
          granted: false,
          failureCode: result.failureCode || "unknown",
          reason
        });
      }
      continue;
    }

    if (type === "apply_player_delta") {
      const hasHp = intent?.hp != null;
      const hasStamina = intent?.stamina != null;
      const hpDelta = hasHp ? Number(intent.hp) : 0;
      const staminaDelta = hasStamina ? Number(intent.stamina) : 0;
      const reason = typeof intent?.reason === "string" ? intent.reason : "";
      if ((!hasHp && !hasStamina) || (hasHp && !Number.isFinite(hpDelta)) || (hasStamina && !Number.isFinite(staminaDelta))) {
        results.push({
          type: "apply_player_delta",
          applied: false,
          failureCode: "invalid_delta",
          reason
        });
        continue;
      }

      const hpBeforeRaw = playerDeltaHpBase != null ? playerDeltaHpBase : Number(activeState.player.psycho.hp);
      const staminaBeforeRaw = playerDeltaStaminaBase != null ? playerDeltaStaminaBase : Number(activeState.player.physio.stamina);
      const hpBefore = Number.isFinite(hpBeforeRaw) ? Math.max(0, Math.min(100, hpBeforeRaw)) : 100;
      const staminaBefore = Number.isFinite(staminaBeforeRaw) ? Math.max(0, Math.min(100, staminaBeforeRaw)) : 100;
      const hpAfter = Math.max(0, Math.min(100, hpBefore + (hasHp ? hpDelta : 0)));
      const staminaAfter = Math.max(0, Math.min(100, staminaBefore + (hasStamina ? staminaDelta : 0)));

      activeState.player.psycho.hp = hpAfter;
      activeState.player.physio.stamina = staminaAfter;
      playerDeltaHpBase = hpAfter;
      playerDeltaStaminaBase = staminaAfter;
      results.push({
        type: "apply_player_delta",
        hpDelta: hasHp ? hpDelta : 0,
        staminaDelta: hasStamina ? staminaDelta : 0,
        hpBefore,
        hpAfter,
        staminaBefore,
        staminaAfter,
        applied: true,
        failureCode: null,
        reason
      });
    }
  }

  return results;
}

/**
 * Pure resolve-side validation for WILDERNESS_EVENT_ACTION (no RNG, no writes).
 */
export function validateWildernessEventActionResolve({ gameState, map, mapAction }) {
  const mapId = String(map?.id || "").trim();
  if (mapId !== "wilderness_event_runtime") {
    return {
      ok: false,
      rejection: {
        source: "wilderness_event",
        code: "WILDERNESS_EVENT_WRONG_MAP",
        reason: "野外事件动作仅允许在 wilderness_event_runtime",
        reasons: [`mapId=${mapId}`]
      }
    };
  }
  if (gameState?.world?.wilderness?.active !== true) {
    return {
      ok: false,
      rejection: {
        source: "wilderness_event",
        code: "WILDERNESS_EVENT_SESSION_INACTIVE",
        reason: "野外会话未激活",
        reasons: []
      }
    };
  }

  const payload = mapAction?.payload && typeof mapAction.payload === "object" ? mapAction.payload : {};
  if (payload.resumeTailOnly === true) {
    const queueProbe = normalizeWildernessEventQueue(
      gameState.world.wilderness.eventQueue != null
        ? gameState.world.wilderness.eventQueue
        : createDefaultWildernessEventQueue()
    );
    if (queueProbe.activeFrameId) {
      return {
        ok: false,
        rejection: {
          source: "wilderness_event",
          code: "WILDERNESS_EVENT_RESUME_BLOCKED",
          reason: "仍存在 active 事件帧，不能使用返回兜底",
          reasons: []
        }
      };
    }
    return {
      ok: true,
      eventActionPlan: { resumeTailOnly: true }
    };
  }

  const frameId = typeof payload.frameId === "string" ? payload.frameId.trim() : "";
  const eventId = typeof payload.eventId === "string" ? payload.eventId.trim() : "";
  const actionId = typeof payload.actionId === "string" ? payload.actionId.trim() : "";

  if (!frameId || !eventId || !actionId) {
    return {
      ok: false,
      rejection: {
        source: "wilderness_event",
        code: "WILDERNESS_EVENT_PAYLOAD_INCOMPLETE",
        reason: "缺少 frameId / eventId / actionId",
        reasons: []
      }
    };
  }

  const queue = normalizeWildernessEventQueue(
    gameState.world.wilderness.eventQueue != null
      ? gameState.world.wilderness.eventQueue
      : createDefaultWildernessEventQueue()
  );

  if (queue.activeFrameId !== frameId) {
    return {
      ok: false,
      rejection: {
        source: "wilderness_event",
        code: "WILDERNESS_EVENT_FRAME_MISMATCH",
        reason: "frameId 与当前 activeFrameId 不一致",
        reasons: [`expected=${queue.activeFrameId || ""} got=${frameId}`]
      }
    };
  }

  const frame = queue.frames.find((f) => f.frameId === frameId);
  if (!frame || frame.status !== WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE) {
    return {
      ok: false,
      rejection: {
        source: "wilderness_event",
        code: "WILDERNESS_EVENT_FRAME_NOT_ACTIVE",
        reason: "指定帧不是 active 状态",
        reasons: []
      }
    };
  }

  if (String(frame.payload?.eventId || "").trim() !== eventId) {
    return {
      ok: false,
      rejection: {
        source: "wilderness_event",
        code: "WILDERNESS_EVENT_EVENT_MISMATCH",
        reason: "eventId 与帧 payload 不一致",
        reasons: []
      }
    };
  }

  const def = getWildernessEventDefById(eventId);
  if (!def || !Array.isArray(def.actions)) {
    return {
      ok: false,
      rejection: {
        source: "wilderness_event",
        code: "WILDERNESS_EVENT_DEF_MISSING",
        reason: "未知事件定义",
        reasons: [eventId]
      }
    };
  }

  const actRow = def.actions.find((a) => String(a?.id || "").trim() === actionId);
  if (!actRow) {
    return {
      ok: false,
      rejection: {
        source: "wilderness_event",
        code: "WILDERNESS_EVENT_ACTION_UNKNOWN",
        reason: "动作不存在于事件定义",
        reasons: [actionId]
      }
    };
  }

  const timeCostMinutes =
    actRow.timeCostMinutes != null && Number.isFinite(Number(actRow.timeCostMinutes))
      ? Math.max(0, Math.trunc(Number(actRow.timeCostMinutes)))
      : 0;

  return {
    ok: true,
    eventActionPlan: {
      resumeTailOnly: false,
      frameId,
      eventId,
      actionId,
      timeCostMinutes
    }
  };
}

async function navigateWildernessEventQueueAfterDrain(activeState, queue, shouldResumeTail, deps) {
  const { loadMap, applyCommittedMapState, deriveTransitUiStateFromRuntimeTruth } = deps;
  const wild = activeState.world?.wilderness && typeof activeState.world.wilderness === "object" ? activeState.world.wilderness : null;
  if (!wild) {
    return { queue, nextMapId: null, resumedTail: false };
  }

  if (queue.activeFrameId) {
    const m = await loadMap("wilderness_event_runtime");
    if (m) {
      applyCommittedMapState(activeState, "wilderness_event_runtime", m, {
        clearOverlay: true,
        clearModal: true,
        resetScene: true
      });
      if (!activeState.ui || typeof activeState.ui !== "object") activeState.ui = {};
      activeState.ui.transit = deriveTransitUiStateFromRuntimeTruth(activeState);
    }
    return { queue, nextMapId: "wilderness_event_runtime", resumedTail: false };
  }

  if (shouldResumeTail) {
    const probe = resolveWildernessEventTailContinuation({ tailContinuation: queue.tailContinuation });
    let nextMapId = null;
    const clearedQueue = { ...queue, tailContinuation: null };

    if (!probe.ok || probe.mode === "none") {
      nextMapId = String(wild.runtimeMapId || "wilderness_runtime").trim() || "wilderness_runtime";
    } else if (probe.mode === "return_to_wilderness") {
      nextMapId =
        String(probe.tailContinuation?.mapId || "").trim() || "wilderness_runtime";
    } else if (probe.mode === "transition") {
      nextMapId = String(probe.tailContinuation?.targetMapId || "").trim();
    }

    if (nextMapId) {
      const nextMap = await loadMap(nextMapId);
      if (nextMap) {
        applyCommittedMapState(activeState, nextMapId, nextMap, {
          clearOverlay: true,
          clearModal: true,
          resetScene: true
        });
        if (!activeState.ui || typeof activeState.ui !== "object") activeState.ui = {};
        activeState.ui.transit = deriveTransitUiStateFromRuntimeTruth(activeState);
      }
    }

    wild.eventQueue = clearedQueue;

    return { queue: clearedQueue, nextMapId, resumedTail: true };
  }

  return { queue, nextMapId: null, resumedTail: false };
}

/**
 * @param {object} params
 * @param {object} params.activeState
 * @param {object} params.intent
 * @param {(id: string) => Promise<object|null>} params.loadMap
 * @param {typeof import("../../pipeline/commit.js").applyCommittedMapState} params.applyCommittedMapState
 * @param {(s: object) => object} params.deriveTransitUiStateFromRuntimeTruth
 * @param {{ random?: () => number }} [params.rngLike]
 * @param {(eventId: string) => object|null} [params.getEventDefById]
 */
export async function executeWildernessEventActionCommit({
  activeState,
  intent,
  loadMap,
  applyCommittedMapState,
  deriveTransitUiStateFromRuntimeTruth,
  rngLike,
  getEventDefById = getWildernessEventDefById
}) {
  const plan = intent?.eventActionPlan && typeof intent.eventActionPlan === "object" ? intent.eventActionPlan : null;
  const emptyReport = {
    frameId: null,
    eventId: null,
    actionId: null,
    outcomeId: null,
    resolved: false,
    resultText: "",
    logLine: "",
    grants: [],
    playerDeltas: [],
    resultIntentsApplied: [],
    queue: {
      activeFrameId: null,
      remainingFrames: 0,
      resumedTail: false,
      nextMapId: null
    }
  };

  const deps = { loadMap, applyCommittedMapState, deriveTransitUiStateFromRuntimeTruth };

  if (!activeState.world || typeof activeState.world !== "object") {
    activeState.world = {};
  }
  let wild = activeState.world.wilderness && typeof activeState.world.wilderness === "object" ? activeState.world.wilderness : null;
  if (!wild || wild.active !== true) {
    return { ok: false, type: "WILDERNESS_EVENT_ACTION", errors: ["wilderness inactive"], wildernessEventAction: emptyReport };
  }

  if (!plan || typeof plan !== "object") {
    return { ok: false, type: "WILDERNESS_EVENT_ACTION", errors: ["missing eventActionPlan"], wildernessEventAction: emptyReport };
  }

  let queue = normalizeWildernessEventQueue(wild.eventQueue != null ? wild.eventQueue : createDefaultWildernessEventQueue());

  if (plan.resumeTailOnly === true) {
    const drained = drainWildernessEventQueue(queue);
    queue = drained.queue;
    wild.eventQueue = queue;
    const nav = await navigateWildernessEventQueueAfterDrain(activeState, queue, drained.shouldResumeTail, deps);
    wild = activeState.world.wilderness;
    wild.eventQueue = nav.queue;

    return {
      ok: true,
      type: "WILDERNESS_EVENT_ACTION",
      wildernessEventAction: {
        frameId: null,
        eventId: null,
        actionId: null,
        outcomeId: null,
        resolved: false,
        resultText: "",
        logLine: "",
        grants: [],
        playerDeltas: [],
        resultIntentsApplied: [],
        queue: {
          activeFrameId: nav.queue.activeFrameId,
          remainingFrames: nav.queue.frames.length,
          resumedTail: nav.resumedTail,
          nextMapId: nav.nextMapId
        }
      }
    };
  }

  const frameId = String(plan.frameId || "").trim();
  const eventId = String(plan.eventId || "").trim();
  const actionId = String(plan.actionId || "").trim();

  if (queue.activeFrameId !== frameId) {
    return { ok: false, type: "WILDERNESS_EVENT_ACTION", errors: ["active frame lost"], wildernessEventAction: emptyReport };
  }

  const frame = queue.frames.find((f) => f.frameId === frameId);
  if (!frame || frame.status !== WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE) {
    return { ok: false, type: "WILDERNESS_EVENT_ACTION", errors: ["frame not active"], wildernessEventAction: emptyReport };
  }

  const def = typeof getEventDefById === "function" ? getEventDefById(eventId) : getWildernessEventDefById(eventId);
  if (!def) {
    return { ok: false, type: "WILDERNESS_EVENT_ACTION", errors: ["missing def"], wildernessEventAction: emptyReport };
  }

  const preActionHp = Number(activeState?.player?.psycho?.hp);
  const preActionStamina = Number(activeState?.player?.physio?.stamina);
  const playerDeltaBase = {
    hp: Number.isFinite(preActionHp) ? preActionHp : null,
    stamina: Number.isFinite(preActionStamina) ? preActionStamina : null
  };

  const mins = Math.max(0, Math.trunc(Number(plan.timeCostMinutes ?? 0)));
  if (mins > 0) {
    const timeRet = advanceTimeMinutes(mins, "wilderness_event_action", {
      isSleeping: false,
      sessionCoverage: "NONE"
    });
    const advanced = Math.max(0, Math.trunc(Number(timeRet?.advancedMinutes ?? mins)));
    if (!activeState.player || typeof activeState.player !== "object") activeState.player = {};
    applyTimeToPlayer(activeState.player, advanced, buildWildernessEventPlayerTimeCtx(activeState));
  }

  const rolled = rollWildernessEventOutcome(def, actionId, rngLike);
  if (rolled.error) {
    return {
      ok: false,
      type: "WILDERNESS_EVENT_ACTION",
      errors: [String(rolled.error)],
      wildernessEventAction: {
        ...emptyReport,
        frameId,
        eventId,
        actionId
      }
    };
  }

  if (!Array.isArray(activeState.logLines)) activeState.logLines = [];
  const logLine = String(rolled.logLine || "").trim();
  if (logLine) activeState.logLines.push(logLine);

  const mr = markWildernessEventFrameResolved(queue, frameId, {
    eventId,
    outcomeId: rolled.outcomeId,
    areaId: frame.payload.areaId,
    x: frame.payload.x,
    y: frame.payload.y,
    occurredAtMinutes: Math.max(0, Math.floor(Number(activeState.time?.totalMinutes ?? 0)))
  });

  if (!mr.ok) {
    return {
      ok: false,
      type: "WILDERNESS_EVENT_ACTION",
      errors: ["mark resolved failed"],
      wildernessEventAction: {
        ...emptyReport,
        frameId,
        eventId,
        actionId,
        outcomeId: rolled.outcomeId,
        resultText: rolled.resultText,
        logLine: rolled.logLine,
        resolved: false
      }
    };
  }

  queue = mr.queue;
  wild.eventQueue = queue;

  const intentResults = await applyWildernessEventResultIntents(activeState, rolled.resultIntents, { playerDeltaBase });
  const grantResults = intentResults.filter((row) => String(row?.type || "") === "grant_item");
  const playerDeltaResults = intentResults.filter((row) => String(row?.type || "") === "apply_player_delta");

  const drained = drainWildernessEventQueue(queue);
  queue = drained.queue;
  wild.eventQueue = queue;

  const nav = await navigateWildernessEventQueueAfterDrain(activeState, queue, drained.shouldResumeTail, deps);
  wild.eventQueue = nav.queue;

  return {
    ok: true,
    type: "WILDERNESS_EVENT_ACTION",
    resultIntentsApplied: intentResults,
    wildernessEventAction: {
      frameId,
      eventId,
      actionId,
      outcomeId: rolled.outcomeId,
      resolved: true,
      resultText: rolled.resultText,
      logLine: rolled.logLine,
      grants: grantResults,
      playerDeltas: playerDeltaResults,
      resultIntentsApplied: intentResults,
      queue: {
        activeFrameId: nav.queue.activeFrameId,
        remainingFrames: nav.queue.frames.length,
        resumedTail: nav.resumedTail,
        nextMapId: nav.nextMapId
      }
    }
  };
}
