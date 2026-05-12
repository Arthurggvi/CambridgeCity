import { getWildernessEventDefById } from "./wilderness_event_registry.js";
import {
  createDefaultWildernessEventQueue,
  normalizeWildernessEventQueue,
  WILDERNESS_EVENT_FRAME_STATUSES
} from "./wilderness_event_queue_state.js";

function activeWildernessEventFrame(queueNorm) {
  const aid = queueNorm.activeFrameId != null && String(queueNorm.activeFrameId).trim()
    ? String(queueNorm.activeFrameId).trim()
    : null;
  if (!aid) return null;
  const fr = queueNorm.frames.find((f) => f.frameId === aid);
  if (!fr || fr.status !== WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE) return null;
  return fr;
}

/**
 * Read-only view-model for wilderness_event_runtime renderer (no state writes, no RNG).
 * @param {object} gameState
 */
export function buildWildernessEventViewModel(gameState) {
  const fallbackBase = {
    ok: false,
    reason: "no_active_frame",
    frameId: null,
    eventId: null,
    title: "",
    body: "",
    logLine: "",
    actions: []
  };

  if (!gameState || typeof gameState !== "object") {
    return { ...fallbackBase, reason: "missing_state" };
  }

  const wild = gameState.world?.wilderness && typeof gameState.world.wilderness === "object" ? gameState.world.wilderness : null;
  if (!wild || wild.active !== true) {
    return { ...fallbackBase, reason: "wilderness_inactive" };
  }

  const queueNorm = normalizeWildernessEventQueue(wild.eventQueue != null ? wild.eventQueue : createDefaultWildernessEventQueue());
  const frame = activeWildernessEventFrame(queueNorm);
  if (!frame) {
    return {
      ...fallbackBase,
      reason: "no_active_frame",
      title: "",
      body: "事件已经结束。",
      logLine: "",
      actions: []
    };
  }

  const eventId = String(frame.payload?.eventId || "").trim();
  if (!eventId) {
    return { ...fallbackBase, reason: "missing_event_id_on_frame", frameId: frame.frameId };
  }

  const def = getWildernessEventDefById(eventId);
  if (!def || typeof def !== "object") {
    return {
      ...fallbackBase,
      reason: "unknown_event_def",
      frameId: frame.frameId,
      eventId,
      body: "事件已经结束。"
    };
  }

  const presentation = def.presentation && typeof def.presentation === "object" ? def.presentation : {};
  const actions = Array.isArray(def.actions)
    ? def.actions.map((a) => ({
        id: String(a?.id || "").trim(),
        label: String(a?.label || "").trim() || String(a?.id || "").trim(),
        disabled: false
      }))
    : [];

  return {
    ok: true,
    reason: "",
    frameId: frame.frameId,
    eventId,
    title: String(def.title || "").trim(),
    body: String(presentation.body || "").trim(),
    logLine: String(presentation.logLine || "").trim(),
    actions
  };
}

/**
 * Pure: returns synthetic MAP rows for wilderness_event_runtime dispatch only.
 * Does not read/write map.actions on gameState (caller merges for render / overlay dispatch).
 * @param {object} gameState
 * @returns {object[]}
 */
export function buildWildernessEventRuntimeSyntheticActions(gameState) {
  const map = gameState?.currentMap;
  if (!map || String(map.id || "").trim() !== "wilderness_event_runtime") {
    return [];
  }

  const vm = buildWildernessEventViewModel(gameState);
  if (vm.ok) {
    const eid = String(vm.eventId || "").trim();
    const fid = String(vm.frameId || "").trim();
    const out = [];
    for (const act of Array.isArray(vm.actions) ? vm.actions : []) {
      const aid = String(act?.id || "").trim();
      if (!aid) continue;
      out.push({
        id: `wild_evt:${eid}:${aid}`,
        text: String(act.label || aid),
        kind: "WILDERNESS_EVENT_ACTION",
        payload: { frameId: fid, eventId: eid, actionId: aid }
      });
    }
    return out;
  }

  return [
    {
      id: "wild_evt_resume_tail",
      text: "继续",
      kind: "WILDERNESS_EVENT_ACTION",
      payload: { resumeTailOnly: true }
    }
  ];
}
