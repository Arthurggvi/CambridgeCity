import { saveManager } from "../../save/save_manager.js";
import { settingsManager } from "../../save/settings_manager.js";
import { resolveMapRuntimeDescriptionResult, buildRuntimeActionViewModel, buildRuntimeInteractionViewModel } from "../map_content_runtime.js";
import { buildQuestionnaireCreditsViewModel } from "../../ui/questionnaire_menu_controller.js";
import { evaluateRequires } from "../requires.js";
import { getProfileViewModel } from "../profile/read.js";
import { resolveSceneTextFxPolicy, buildSceneTextContentSignature } from "../scene_text_fx_policy.js";
import { getAnimatedTable, getViewedTable } from "../scene_text_fx_state.js";
import { getGovHallBusinessState } from "../gov_hall_business.js";
import { getTimeView } from "../time.js";
import { getCanonicalMapId, getUiActionStateSnapshot, pushUiActionDiff, pushUiOpenCallchain, pushUiRouteTrace, readCriticalUiGateMode as resolveCriticalUiGateMode, resolveUiSurface } from "../ui_route.js";
import { BUS_ONBOARD_MAP_ID, getLineById, getRideDirectionLabel, getStopById } from "../transit/transit_service.js";
import { isMovementAction } from "./action_grouping.js";
import { createIgnitionActionViewModel } from "../ignition_tools.js";
import { buildStatusEffectTooltipVm, STATUS_EFFECT_DISPLAY_CHANNELS } from "../status_effect_view_models.js";
import {
  collectSceneInteractionsV2,
  isMapContentV2,
  resolveCurrentSceneV2,
  shouldRenderSceneInteractionV2
} from "../map_content_v2.js";

export const MENU_PAGE_IDS = new Set(["menu", "menu_more", "menu_main", "menu_load", "menu_settings", "menu_credits", "menu_achievements"]);

let _lastCriticalUiGateMode = "NORMAL";
let _lastStableRootRenderViewModel = null;

const GOV_HALL_WINDOW_HIDDEN_ACTION_IDS = new Set([
  "gov_c_queue_take_number",
  "gov_c_window_enter",
  "gov_c_try_to_d",
  "gov_c_back_a"
]);

export function isMenuPageId(mapId) {
  if (typeof mapId !== "string") return false;
  if (MENU_PAGE_IDS.has(mapId)) return true;
  return mapId.startsWith("menu_");
}

export function determinePageType(state) {
  return resolveUiSurface(state, { source: "determine_page_type" }).pageType;
}

function consumeCriticalUiStateOnEdge(state) {
  if (!state || typeof state !== "object") return;
  const ui = state.ui && typeof state.ui === "object" ? state.ui : null;
  if (!ui) return;

  const nextMode = resolveCriticalUiGateMode(state);
  const enteredCritical = _lastCriticalUiGateMode === "NORMAL" && nextMode !== "NORMAL";
  _lastCriticalUiGateMode = nextMode;
  if (!enteredCritical) return;

  // True-close non-system interaction state when formally entering DEAD/COLLAPSE.
  ui.overlay = null;
  ui.profileOpen = false;
  ui.recordsOpen = false;
  ui.socialOpen = false;
  ui.jobSession = null;
  ui.inquirySession = null;
}

function readStatePath(state, path) {
  const raw = String(path || "").trim();
  if (!raw) return undefined;

  const parts = raw.split(".");
  let cur = state;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

function renderDescriptionTemplate(state, text) {
  return String(text || "").replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_m, path) => {
    const value = readStatePath(state, path);
    return value == null ? "" : String(value);
  });
}

function getGovHallRuntimeState(state) {
  const businessState = getGovHallBusinessState(state);
  return {
    isDay: businessState.isDay,
    isOpen: businessState.isOpen,
    key: businessState.key
  };
}

function pickMapTitle(state, map) {
  if (!map) return "";
  if (String(map.id || "") === "gov_hall_main_hall" && state?.world?.flags?.govHallWindowMenuOpen === true) {
    return "政务大厅 · 窗口";
  }
  return String(map.name || "");
}

function pickMapDescription(state, map) {
  const runtimeDescription = resolveMapRuntimeDescriptionResult(String(map?.id || ""), map);
  if (typeof runtimeDescription?.text === "string" && runtimeDescription.text.trim()) {
    return runtimeDescription.text;
  }

  if (map && String(map.id || "") === "gov_hall_main_hall") {
    if (state?.world?.flags?.govHallCDialogWindowRejected === true) {
      return "窗口业务员指了指叫号屏：\n\n“没有取号不要捣乱！”";
    }
    if (state?.world?.flags?.govHallCDialogQueueRejected === true) {
      return "业务员瞟了你一眼：\n\n“不要重复取号！”";
    }
    if (state?.world?.flags?.govHallCDialogQueueSuccess === true) {
      return renderDescriptionTemplate(state, "业务员按下取号键：\n\n“取号成功，你的号码为{{world.flags.govHallQueueNumber}}号”");
    }

    if (Array.isArray(map.descriptionByFlags)) {
      for (const row of map.descriptionByFlags) {
        const path = String(row?.path || "").trim();
        const expected = row?.equals;
        const text = String(row?.text || "").trim();
        if (!path || !text) continue;

        const cur = readStatePath(state, path);
        if (cur === expected) return renderDescriptionTemplate(state, text);
      }
    }

    if (state?.world?.flags?.govHallWindowMenuOpen === true) {
      return "你来到窗口处，业务员抬头扫了你一眼\n“你好，请出示你的证件。\n有什么能帮到你的？”";
    }
  }

  if (map && Array.isArray(map.descriptionByFlags)) {
    for (const row of map.descriptionByFlags) {
      const path = String(row?.path || "").trim();
      const expected = row?.equals;
      const text = String(row?.text || "").trim();
      if (!path || !text) continue;

      const cur = readStatePath(state, path);
      if (cur === expected) return renderDescriptionTemplate(state, text);
    }
  }

  if (map && map.descriptionByRuntimeState && typeof map.descriptionByRuntimeState === "object") {
    const { key } = getGovHallRuntimeState(state);
    const text = String(map.descriptionByRuntimeState[key] || "").trim();
    if (text) return text;
  }

  if (!map || !Array.isArray(map.descriptionByMinuteOfDay)) {
    return String(map?.description || "");
  }

  const tv = getTimeView();
  const minuteOfDay = Number(tv?.minuteOfDay ?? 0);

  for (const it of map.descriptionByMinuteOfDay) {
    const start = Number(it?.start);
    const end = Number(it?.end);
    const text = String(it?.text ?? "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || !text) continue;

    const hit = start <= end
      ? (minuteOfDay >= start && minuteOfDay <= end)
      : (minuteOfDay >= start || minuteOfDay <= end);
    if (hit) return text;
  }

  return String(map.description || "");
}

function isReducedMotionEnabled() {
  const settings = settingsManager.getSettings();
  if (settings?.reduceMotion === true) return true;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isWhitelistActionId(actionId) {
  const id = String(actionId || "").trim();
  if (!id) return false;
  if (id === "menu_go_settings" || id === "menu_go_load" || id === "menu_go_achievements" || id === "ui_open_save_menu" || id === "menu_exit_main" || id === "menu_back_main") return true;
  if (id === "ui_close_inventory" || id === "ui_tasks_close" || id === "ui_map_close" || id === "ui_profile_close" || id === "ui_records_close" || id === "ui_social_close") return true;
  if (id.startsWith("settings_set:") || id.startsWith("settings_toggle:") || id === "settings_reset_defaults") return true;
  if (id.startsWith("menu_load:") || id.startsWith("load_slot_")) return true;
  if (id === "COLLAPSE_TICK_10M") return true;
  return false;
}

function isCollapseHardDisabledActionId(actionId) {
  const id = String(actionId || "").trim();
  return id === "ui_open_inventory"
    || id === "ui_open_inventory_clothing"
    || id === "ui_tasks_open"
    || id === "ui_records_open"
    || id === "ui_social_open"
    || id === "ui_memo_open"
    || id === "sidebar_wait_confirm";
}

function extractStationStrip(rawText, fallbackStationName) {
  const source = String(rawText || "").replace(/\r\n?/g, "\n").trim();
  const fallbackName = String(fallbackStationName || "").trim();
  if (!source) {
    return {
      stationStrip: fallbackName ? { label: "当前站", value: fallbackName } : null,
      bodyText: ""
    };
  }

  const lines = source.split("\n");
  const firstLine = String(lines[0] || "").trim();
  const match = firstLine.match(/^当前站[：:]\s*(.+)$/);
  if (!match) {
    return {
      stationStrip: fallbackName ? { label: "当前站", value: fallbackName } : null,
      bodyText: source
    };
  }

  return {
    stationStrip: {
      label: "当前站",
      value: String(match[1] || "").trim() || fallbackName || "当前站"
    },
    bodyText: lines.slice(1).join("\n").trim()
  };
}

function buildBusMapPresentation(state, map, description) {
  if (String(map?.id || "") !== BUS_ONBOARD_MAP_ID) return null;

  const ride = state?.player?.transit?.ride || null;
  if (!ride) return null;

  const currentStop = getStopById(ride.currentStopId);
  const nextStop = getStopById(ride.nextStopId);
  const line = getLineById(ride.lineId);
  const currentStopName = String(currentStop?.displayName || currentStop?.name || "当前站").trim() || "当前站";
  const stationContent = extractStationStrip(description, currentStopName);
  const routeLabel = [
    String(line?.name || "西部二区接驳线").trim() || "西部二区接驳线",
    String(getRideDirectionLabel(ride) || "").trim()
  ].filter(Boolean).join(" · ");
  const nextStopLabel = String(nextStop?.displayName || nextStop?.name || "").trim() || null;

  return {
    pageDecorProfile: "bus",
    currentStationLabel: stationContent.stationStrip?.value || currentStopName,
    busRouteLabel: routeLabel,
    busNextStopLabel: nextStopLabel,
    description: stationContent.bodyText || description
  };
}

function buildResolvedActionViewModels(state, map) {
  if (isMapContentV2(map)) {
    const { scene, sceneId } = resolveCurrentSceneV2(state, map);
    const sceneInteractions = collectSceneInteractionsV2(state, map, scene)
      .filter((interaction) => shouldRenderSceneInteractionV2(interaction));
    const actions = [];
    const visibleActionIds = [];
    const hiddenReasons = [];
    let lockedCount = 0;
    const criticalMode = resolveCriticalUiGateMode(state);
    const isDeadMode = criticalMode === "DEAD";
    const isCollapseMode = criticalMode === "COLLAPSE";

    for (const rawInteraction of sceneInteractions) {
      const actionId = String(rawInteraction?.id || "");
      if (!actionId) continue;

      let locked = false;
      let disabled = false;
      if (rawInteraction?.requires) {
        const requireResult = evaluateRequires(state, rawInteraction.requires);
        if (!requireResult.ok) {
          const lockedBehavior = rawInteraction?.ui?.lockedBehavior ?? "hide";
          if (lockedBehavior !== "show") {
            hiddenReasons.push({ actionId, reason: "requires_hidden", details: requireResult.reason || null });
            continue;
          }
          locked = true;
        }
      }

      if (!locked && rawInteraction?.ui?.disabledRequires) {
        const disabledResult = evaluateRequires(state, rawInteraction.ui.disabledRequires);
        if (disabledResult.ok) {
          disabled = true;
        }
      }

      const resolvedInteraction = buildRuntimeInteractionViewModel(String(map?.id || ""), rawInteraction, map);
      if (!resolvedInteraction) {
        hiddenReasons.push({ actionId, reason: "runtime_resolution_failed" });
        continue;
      }

      resolvedInteraction.ui = resolvedInteraction.ui && typeof resolvedInteraction.ui === "object"
        ? { ...resolvedInteraction.ui }
        : { type: "button" };
      resolvedInteraction.ui.mapId = String(map?.id || "");
      resolvedInteraction.ui.sceneId = String(sceneId || "");
      resolvedInteraction.ui.interactionId = String(resolvedInteraction.id || "");

      const isMovement = String(resolvedInteraction.type || "") === "TRANSITION";
      let gateDisabled = false;
      let gateReason = null;
      let remapActionId = null;

      if (isDeadMode && !isWhitelistActionId(actionId)) {
        gateDisabled = true;
        gateReason = "dead_blocked";
      } else if (isCollapseMode) {
        if (isCollapseHardDisabledActionId(actionId)) {
          gateDisabled = true;
          gateReason = "collapse_disabled";
        } else if (!isWhitelistActionId(actionId)) {
          remapActionId = "COLLAPSE_TICK_10M";
        }
      }

      if (locked) lockedCount += 1;
      visibleActionIds.push(actionId);
      actions.push({
        action: resolvedInteraction,
        locked,
        disabled: disabled || gateDisabled,
        gateReason,
        remapActionId,
        criticalMode,
        isMovement,
        kindTag: isMovement ? "移动" : "动作"
      });

      const ignitionAction = createIgnitionActionViewModel({
        map,
        sceneId,
        interaction: resolvedInteraction,
        state
      });
      if (ignitionAction) {
        visibleActionIds.push(String(ignitionAction.id || ""));
        actions.push({
          action: ignitionAction,
          locked,
          disabled: disabled || gateDisabled,
          gateReason,
          remapActionId,
          criticalMode,
          isMovement: false,
          kindTag: "动作"
        });
      }
    }

    return {
      actions,
      diagnostics: {
        mapId: String(map?.id || ""),
        currentSceneId: String(sceneId || "") || null,
        rawCount: sceneInteractions.length,
        visibleCount: actions.length,
        lockedCount,
        hiddenCount: hiddenReasons.length,
        visibleActionIds,
        hiddenReasons
      }
    };
  }

  if (!Array.isArray(map?.actions)) {
    return {
      actions: [],
      diagnostics: {
        mapId: String(map?.id || ""),
        rawCount: 0,
        visibleCount: 0,
        lockedCount: 0,
        hiddenCount: 0,
        visibleActionIds: [],
        hiddenReasons: []
      }
    };
  }

  const actions = [];
  const visibleActionIds = [];
  const hiddenReasons = [];
  let lockedCount = 0;
  const criticalMode = resolveCriticalUiGateMode(state);
  const isDeadMode = criticalMode === "DEAD";
  const isCollapseMode = criticalMode === "COLLAPSE";

  for (const rawAction of map.actions) {
    const actionId = String(rawAction?.id || "");
    if (!actionId) continue;

    if (String(map?.id || "") === "gov_hall_main_hall"
      && state?.world?.flags?.govHallWindowMenuOpen === true
      && GOV_HALL_WINDOW_HIDDEN_ACTION_IDS.has(actionId)) {
      hiddenReasons.push({ actionId, reason: "gov_window_hidden" });
      continue;
    }

    if (actionId === "gov_b_window_intro") {
      const { isOpen } = getGovHallRuntimeState(state);
      if (!isOpen) {
        hiddenReasons.push({ actionId, reason: "gov_closed" });
        continue;
      }
    }

    let locked = false;
    let disabled = false;
    if (rawAction?.requires) {
      const requireResult = evaluateRequires(state, rawAction.requires);
      if (!requireResult.ok) {
        const lockedBehavior = rawAction?.ui?.lockedBehavior ?? "hide";
        if (lockedBehavior !== "show") {
          hiddenReasons.push({
            actionId,
            reason: "requires_hidden",
            details: requireResult.reason || null
          });
          continue;
        }
        locked = true;
      }
    }

    if (!locked && rawAction?.ui?.disabledRequires) {
      const disabledResult = evaluateRequires(state, rawAction.ui.disabledRequires);
      if (disabledResult.ok) {
        disabled = true;
      }
    }

    const resolvedAction = buildRuntimeActionViewModel(String(map?.id || ""), rawAction, map);
    if (!resolvedAction) {
      hiddenReasons.push({ actionId, reason: "runtime_resolution_failed" });
      continue;
    }

    const isMovement = isMovementAction(resolvedAction);
    let gateDisabled = false;
    let gateReason = null;
    let remapActionId = null;

    if (isDeadMode && !isWhitelistActionId(actionId)) {
      gateDisabled = true;
      gateReason = "dead_blocked";
    } else if (isCollapseMode) {
      if (isCollapseHardDisabledActionId(actionId)) {
        gateDisabled = true;
        gateReason = "collapse_disabled";
      } else if (!isWhitelistActionId(actionId)) {
        remapActionId = "COLLAPSE_TICK_10M";
      }
    }

    if (locked) lockedCount += 1;
    visibleActionIds.push(actionId);
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

  return {
    actions,
    diagnostics: {
      mapId: String(map?.id || ""),
      rawCount: map.actions.length,
      visibleCount: actions.length,
      lockedCount,
      hiddenCount: hiddenReasons.length,
      visibleActionIds,
      hiddenReasons
    }
  };
}

export function buildMenuViewModel(state) {
  const mapId = getCanonicalMapId(state);
  if (!isMenuPageId(mapId)) {
    throw new Error(`buildMenuViewModel expected menu page, got ${mapId || "unknown"}`);
  }

  if (mapId === "menu_main") {
    const menuMap = state?.currentMap && String(state.currentMap?.id || "") === "menu_main"
      ? state.currentMap
      : null;
    const slots = saveManager.listSlots();
    const autoSlot = slots.find((slot) => slot.slotId === "auto");
    const canContinue = !!autoSlot && !autoSlot.isEmpty && !autoSlot.corrupted;
    const mapActions = Array.isArray(menuMap?.actions) ? menuMap.actions : [];
    const actions = mapActions
      .filter((action) => canContinue || String(action?.id || "") !== "menu_continue_auto")
      .map((action) => ({
        id: String(action?.id || ""),
        text: String(action?.text || action?.id || ""),
        primary: String(action?.ui?.priority || "").trim() === "primary"
      }));

    return {
      pageType: "menu",
      pageId: mapId,
      variant: "menu_main",
      title: "寒武新纪",
      subtitle: "CAMBRIAN NEW ERA",
      description: "",
      actions,
      actionDiagnostics: {
        mapId,
        rawCount: actions.length,
        visibleCount: actions.length,
        lockedCount: 0,
        hiddenCount: 0,
        visibleActionIds: actions.map((action) => action.id),
        hiddenReasons: []
      }
    };
  }

  const map = state?.currentMap;
  if (!map || String(map.id || "") !== mapId) {
    throw new Error(`menu page map missing for ${mapId}`);
  }

  const menuViewModel = {
    pageType: "menu",
    pageId: mapId,
    variant: mapId,
    map,
    title: pickMapTitle(state, map),
    description: mapId === "menu_main" ? "" : pickMapDescription(state, map),
    actions: [],
    actionDiagnostics: {
      mapId,
      rawCount: Array.isArray(map.actions) ? map.actions.length : 0,
      visibleCount: null,
      lockedCount: 0,
      hiddenCount: 0,
      visibleActionIds: [],
      hiddenReasons: []
    }
  };

  if (mapId === "menu_credits") {
    menuViewModel.questionnaireHost = buildQuestionnaireCreditsViewModel();
  }

  return menuViewModel;
}

export function buildMapViewModel(state) {
  const map = state?.currentMap;
  if (!map || isMenuPageId(String(map.id || ""))) {
    throw new Error("buildMapViewModel expected a non-menu currentMap");
  }

  const resolved = buildResolvedActionViewModels(state, map);
  const runtimeDescription = resolveMapRuntimeDescriptionResult(String(map?.id || ""), map);
  const rawDescription = typeof runtimeDescription?.text === "string" && runtimeDescription.text.trim()
    ? runtimeDescription.text
    : pickMapDescription(state, map);
  const busPresentation = buildBusMapPresentation(state, map, rawDescription);
  const description = busPresentation?.description || rawDescription;
  const sceneTextAnchor = String(
    runtimeDescription?.sceneKey
    || state?.currentSceneId
    || map?.id
    || "main"
  ).trim() || String(map?.id || "main");
  const policy = resolveSceneTextFxPolicy({
    pageType: "map",
    uiPage: String(state?.ui?.page || ""),
    isOverlay: state?.ui?.overlay != null,
    mapId: String(map.id || ""),
    sceneAnchor: sceneTextAnchor,
    contentSignature: buildSceneTextContentSignature(description),
    animatedTable: getAnimatedTable(state),
    viewedTable: getViewedTable(state),
    reducedMotion: isReducedMotionEnabled()
  });

  return {
    pageType: "map",
    pageId: String(map.id || ""),
    map,
    title: pickMapTitle(state, map),
    description,
    pageDecorProfile: busPresentation?.pageDecorProfile || null,
    currentStationLabel: busPresentation?.currentStationLabel || null,
    busRouteLabel: busPresentation?.busRouteLabel || null,
    busNextStopLabel: busPresentation?.busNextStopLabel || null,
    sceneTextAnchor,
    actions: resolved.actions,
    actionDiagnostics: resolved.diagnostics,
    sceneTextFx: {
      ...policy
    }
  };
}

export function buildOverlayViewModel(state) {
  const route = resolveUiSurface(state, { source: "build_overlay_view_model" });
  const effectiveOverlay = String(route.overlayType || "").trim() || null;

  return {
    pageType: route.pageType,
    mapId: route.mapId,
    uiPage: route.uiPage,
    uiOverlay: effectiveOverlay,
    modal: state?.ui?.modal ?? null,
    showMapMiniMap: route.pageType === "map" && effectiveOverlay === "map_minimap",
    showInventory: route.pageType === "map" && effectiveOverlay === "inventory",
    showTasks: route.pageType === "map" && effectiveOverlay === "tasks",
    showSettingsOverlay: route.mapId === "menu_settings",
    hostType: route.hostType,
    violations: route.violations
  };
}

// Sidebar status must stay a read-only local surface.
// Tooltip channel routing lives in the VM layer, not in runtime truth.
export function buildSidebarStatusViewModel(state) {
  const satietyStatusEffectTooltipVm = buildStatusEffectTooltipVm(state, STATUS_EFFECT_DISPLAY_CHANNELS.FOOD);
  const healthStatusEffectTooltipVm = buildStatusEffectTooltipVm(state, STATUS_EFFECT_DISPLAY_CHANNELS.DRUG);
  return {
    satietyStatusEffectTooltipVm,
    healthStatusEffectTooltipVm
  };
}

export function buildRootRenderViewModel(state) {
  consumeCriticalUiStateOnEdge(state);
  const uiSnapshot = getUiActionStateSnapshot(state);
  const route = resolveUiSurface(state, { source: "build_root_render_view_model" });
  pushUiRouteTrace({
    source: "root_route_resolve",
    prevUiPage: null,
    nextUiPage: route.uiPage,
    prevUiOverlay: null,
    nextUiOverlay: route.overlayType,
    prevCurrentMapId: null,
    nextCurrentMapId: route.mapId,
    prevCurrentSceneId: null,
    nextCurrentSceneId: route.sceneId,
    resolvedPageType: route.pageType,
    resolvedOverlayType: route.overlayType,
    renderHost: route.hostType,
    violationCode: route.violations.length > 0 ? "route_contract_violation" : null,
    errorMessage: route.violations.length > 0 ? route.violations.join(",") : null
  });
  pushUiActionDiff({
    stage: "route:select",
    actionId: typeof window !== "undefined" ? String(window.__LAST_DISPATCH_ACTION_ID__ || "") : "",
    prev: uiSnapshot,
    next: uiSnapshot,
    resolvedRoute: {
      pageType: route.pageType,
      overlayType: route.overlayType,
      hostType: route.hostType,
      mapId: route.mapId
    },
    renderedRoute: null,
    didCanonicalDeltaOccur: false,
    violationCode: route.violations.length > 0 ? "route_contract_violation" : null,
    errorMessage: route.violations.length > 0 ? route.violations.join(",") : null
  });
  pushUiOpenCallchain({
    source: "ui_route:select",
    actionId: typeof window !== "undefined" ? String(window.__LAST_DISPATCH_ACTION_ID__ || "") : "",
    actionType: "GLOBAL_ACTION",
    resolveEntered: true,
    resolveExited: true,
    commitEntered: true,
    commitExited: true,
    prev: uiSnapshot,
    next: uiSnapshot,
    canonicalSetterCalled: false,
    canonicalSelectorResult: {
      pageType: route.pageType,
      overlayType: route.overlayType,
      hostType: route.hostType,
      mapId: route.mapId
    },
    renderedSurface: null,
    violationCode: route.violations.length > 0 ? "route_contract_violation" : null,
    errorMessage: route.violations.length > 0 ? route.violations.join(",") : null
  });

  if (!state?.currentMap) {
    const requestedMapId = String(route.mapId || getCanonicalMapId(state) || "");
    const traceMessage = `route_missing_current_map:${requestedMapId || "unknown"}`;
    pushUiRouteTrace({
      source: "build_root_render_view_model_guard",
      actionId: typeof window !== "undefined" ? String(window.__LAST_DISPATCH_ACTION_ID__ || "") : "",
      prevUiPage: uiSnapshot.uiPage,
      nextUiPage: uiSnapshot.uiPage,
      prevUiOverlay: uiSnapshot.uiOverlay,
      nextUiOverlay: uiSnapshot.uiOverlay,
      prevCurrentMapId: uiSnapshot.currentMapId,
      nextCurrentMapId: requestedMapId || null,
      prevCurrentSceneId: uiSnapshot.currentSceneId,
      nextCurrentSceneId: uiSnapshot.currentSceneId,
      resolvedPageType: route.pageType,
      resolvedOverlayType: route.overlayType,
      renderHost: route.hostType,
      violationCode: "route_missing_current_map",
      errorMessage: traceMessage
    });
    console.error("[RenderGuard] route selected without currentMap", {
      requestedMapId,
      uiPage: uiSnapshot.uiPage,
      uiOverlay: uiSnapshot.uiOverlay,
      currentSceneId: uiSnapshot.currentSceneId,
      lastStablePageType: _lastStableRootRenderViewModel?.pageType || null,
      lastStablePageId: _lastStableRootRenderViewModel?.page?.pageId || null
    });

    if (_lastStableRootRenderViewModel) {
      return _lastStableRootRenderViewModel;
    }

    throw new Error(traceMessage);
  }

  const rootViewModel = {
    pageType: route.pageType,
    page: route.pageType === "menu"
      ? buildMenuViewModel(state)
      : buildMapViewModel(state),
    overlay: buildOverlayViewModel(state),
    profile: getProfileViewModel(state?.player?.profile)
  };
  _lastStableRootRenderViewModel = rootViewModel;
  return rootViewModel;
}