import { buildWildernessEventViewModel } from "../wilderness/events/wilderness_event_view_model.js";
import { buildRuntimeActionViewModel } from "../map_content_runtime.js";
import { evaluateRequires } from "../requires.js";
import { readCriticalUiGateMode as resolveCriticalUiGateMode } from "../ui_route.js";
import { isMovementAction } from "./action_grouping.js";

function isWhitelistActionIdWildEvt(actionId) {
  const id = String(actionId || "").trim();
  if (!id) return false;
  if (id === "menu_go_settings" || id === "menu_go_load" || id === "menu_go_achievements" || id === "ui_open_save_menu" || id === "menu_exit_main" || id === "menu_back_main") return true;
  if (id === "ui_close_inventory" || id === "ui_tasks_close" || id === "ui_map_close" || id === "ui_profile_close" || id === "ui_records_close" || id === "ui_social_close") return true;
  if (id.startsWith("settings_set:") || id.startsWith("settings_toggle:") || id === "settings_reset_defaults") return true;
  if (id.startsWith("menu_load:") || id.startsWith("load_slot_")) return true;
  if (id === "COLLAPSE_TICK_10M") return true;
  return false;
}

function isCollapseHardDisabledActionIdWildEvt(actionId) {
  const id = String(actionId || "").trim();
  return id === "ui_open_inventory"
    || id === "ui_open_inventory_clothing"
    || id === "ui_tasks_open"
    || id === "ui_records_open"
    || id === "ui_social_open"
    || id === "ui_memo_open"
    || id === "sidebar_wait_confirm";
}

/**
 * Resolve legacy-style action entries for synthetic rows only (no map.actions mutation).
 * Mirrors buildResolvedActionViewModels legacy branch for the supplied raw rows.
 * @param {object} gameState
 * @param {object} map
 * @param {object[]} syntheticRawActions
 */
export function resolveWildernessEventRuntimeSyntheticEntries(gameState, map, syntheticRawActions) {
  const actions = [];
  const criticalMode = resolveCriticalUiGateMode(gameState);
  const isDeadMode = criticalMode === "DEAD";
  const isCollapseMode = criticalMode === "COLLAPSE";

  for (const rawAction of Array.isArray(syntheticRawActions) ? syntheticRawActions : []) {
    const actionId = String(rawAction?.id || "");
    if (!actionId) continue;

    let locked = false;
    let disabled = false;
    if (rawAction?.requires) {
      const requireResult = evaluateRequires(gameState, rawAction.requires);
      if (!requireResult.ok) {
        const lockedBehavior = rawAction?.ui?.lockedBehavior ?? "hide";
        if (lockedBehavior !== "show") {
          continue;
        }
        locked = true;
      }
    }

    if (!locked && rawAction?.ui?.disabledRequires) {
      const disabledResult = evaluateRequires(gameState, rawAction.ui.disabledRequires);
      if (disabledResult.ok) {
        disabled = true;
      }
    }

    const resolvedAction = buildRuntimeActionViewModel(String(map?.id || ""), rawAction, map);
    if (!resolvedAction) {
      continue;
    }

    const isMovement = isMovementAction(resolvedAction);
    let gateDisabled = false;
    let gateReason = null;
    let remapActionId = null;

    if (isDeadMode && !isWhitelistActionIdWildEvt(actionId)) {
      gateDisabled = true;
      gateReason = "dead_blocked";
    } else if (isCollapseMode) {
      if (isCollapseHardDisabledActionIdWildEvt(actionId)) {
        gateDisabled = true;
        gateReason = "collapse_disabled";
      } else if (!isWhitelistActionIdWildEvt(actionId)) {
        remapActionId = "COLLAPSE_TICK_10M";
      }
    }

    actions.push({
      action: resolvedAction,
      locked,
      disabled: disabled || gateDisabled,
      gateReason,
      remapActionId,
      criticalMode,
      isMovement,
      kindTag: isMovement ? "移动" : "动作"
    });
  }

  return actions;
}

/**
 * Temporary overlay map so resolve's map.actions.find sees the synthetic row without mutating canonical map.actions.
 * @param {object} gameState
 * @param {object} syntheticRow
 */
export async function dispatchWildernessEventRuntimeViaOverlay(gameState, syntheticRow, payloadForDispatch = null) {
  const prevMap = gameState?.currentMap;
  if (!prevMap || String(prevMap.id || "").trim() !== "wilderness_event_runtime") {
    return;
  }
  const baseActions = Array.isArray(prevMap.actions) ? prevMap.actions : [];
  const overlayMap = { ...prevMap, actions: [...baseActions, syntheticRow] };
  gameState.currentMap = overlayMap;
  try {
    const { dispatch } = await import("../pipeline/dispatch.js");
    const pl =
      payloadForDispatch && typeof payloadForDispatch === "object"
        ? { ...payloadForDispatch }
        : syntheticRow?.payload && typeof syntheticRow.payload === "object"
          ? { ...syntheticRow.payload }
          : {};
    await dispatch(String(syntheticRow.id || "").trim(), pl, {});
  } finally {
    gameState.currentMap = prevMap;
  }
}

/**
 * Capture-phase handler on #choices: wilderness_event_runtime synthetic buttons bypass bubbling interaction
 * and dispatch via overlay map (canonical map.actions unchanged).
 * @param {HTMLElement|null} choicesHost
 * @param {object} gameState
 */
export function ensureWildernessEventRuntimeChoicesOverlayDispatchBound(choicesHost, gameState) {
  if (typeof document === "undefined" || !choicesHost || choicesHost._wildernessEventOverlayCaptureBound) {
    return;
  }

  choicesHost.addEventListener(
    "click",
    async (event) => {
      const btn = event.target.closest("button[data-wilderness-event-dispatch-overlay='1']");
      if (!btn || !choicesHost.contains(btn)) return;
      event.preventDefault();
      event.stopPropagation();
      const actionId = String(btn.dataset.actionId || "").trim();
      if (!actionId) return;
      let payload = {};
      try {
        const raw = btn.dataset.wildernessEventPayload;
        if (raw) payload = JSON.parse(decodeURIComponent(raw));
      } catch (_e) {
        payload = {};
      }
      const syntheticRow = {
        id: actionId,
        text: String(btn.querySelector(".journal-action-label")?.textContent || actionId),
        kind: "WILDERNESS_EVENT_ACTION",
        payload
      };
      await dispatchWildernessEventRuntimeViaOverlay(gameState, syntheticRow, payload);
    },
    true
  );

  choicesHost._wildernessEventOverlayCaptureBound = true;
}

/**
 * @param {HTMLElement} articleEl
 * @param {ReturnType<typeof buildWildernessEventViewModel>} vm
 */
export function renderWildernessEventRuntime(articleEl, vm) {
  articleEl.textContent = "";
  articleEl.classList.add("map-panel", "map-panel-wilderness-event-runtime");

  const h1 = document.createElement("h1");
  h1.className = "map-name";
  h1.textContent = vm.ok ? String(vm.title || "").trim() || "野外事件" : "野外事件";
  articleEl.appendChild(h1);

  const body = document.createElement("div");
  body.className = "map-desc wilderness-event-runtime__body";
  body.textContent = String(vm.body || "");
  articleEl.appendChild(body);

  if (vm.ok && String(vm.logLine || "").trim()) {
    const logEl = document.createElement("p");
    logEl.className = "wilderness-event-runtime__log";
    logEl.textContent = String(vm.logLine || "").trim();
    articleEl.appendChild(logEl);
  }
}
