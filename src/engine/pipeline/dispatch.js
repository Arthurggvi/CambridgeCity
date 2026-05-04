// ============================================================================
// Dispatch - UI 入口与管线协调器
// ============================================================================
// Dispatch 是用户交互的入口，协调整个 Action→Resolve→Commit 管线
// 
// 职责：
// 1. 防重入（正在处理时忽略新请求）
// 2. 创建 Action
// 3. 调用 resolve 生成 Plan
// 4. 调用 commit 执行 Plan
// 5. 打印结构化 report
// 6. 触发渲染
// 7. 触发自动存档检查
// ============================================================================

import { gameState } from "../state.js";
import { publishSignal } from "../achievement_signal_bus.js";
import { render } from "../renderer.js";
import { showConfirmDialog, showInputDialog, showNoticeDialog, showImportSaveDialog } from "../../ui/dialogs.js";
import { ensureCriticalStateNoticeRegistration } from "../../ui/critical_state_notice.js";
import { ensureDossierAttentionFeedbackRegistration } from "../../ui/dossier_attention_feedback.js";
import {
  ensureBayportClinicWardIntroGuideRegistration,
  prepareBayportClinicWardIntroGuideSessionFromCommitReport,
  syncBayportClinicWardIntroGuideSessionFromCommitReport
} from "../../ui/bayport_clinic_ward_intro_guide.js";
import {
  ensureProfilePageIntroGuideRegistration,
  prepareProfilePageIntroGuideSessionFromCommitReport,
  syncProfilePageIntroGuideSessionFromCommitReport
} from "../../ui/profile_page_intro_guide.js";
import {
  ensureWinddykeThermalGuideForCurrentState,
  ensureWinddykeThermalGuideRegistration,
  prepareWinddykeThermalGuideSessionFromCommitReport,
  syncWinddykeThermalGuideSessionFromCommitReport
} from "../../ui/winddyke_thermal_intro_guide.js";
import { ensureRecordUnlockFeedbackRegistration } from "../../ui/record_unlock_feedback.js";
import { getGovHallBusinessState } from "../gov_hall_business.js";
import { getCalendarViewFromTotalMinutes } from "../calendar_model.js";
import { clearRecordsAttention, notifyNewRecordAttention, syncRecordsAttentionState } from "../../ui/records_attention_controller.js";
import {
  clearToastMessageLedger,
  ensureDataDeltaToastRegistration
} from "../../ui/toast.js";
import { TRANSIENT_CLEAR_REASONS } from "../../ui/transient/transient_contract.js";
import { clearTransientRuntime, enqueueTransientIntents } from "../../ui/transient/transient_runtime.js";
import { makeActionFromUI, makeSystemAction, validateAction } from "./action_types.js";
import { resolve } from "./resolve.js";
import { commit } from "./commit.js";
import { getTransientIntentsFromCommitReport } from "./transient_intent_adapter.js";
import { collectWildernessMoveBlockedNoticeDialogs } from "../wilderness/wilderness_blocker.js";
import { validatePlan } from "./plan_types.js";
import {
  getTimeView,
  getWorldTimeContext,
  isSteelcrossMarketFamilyMapId,
  shouldForceExitSteelcrossMarket,
  STEELCROSS_MARKET_CLOSING_BLOCKER_ID
} from "../time.js";
import { loadMap } from "../loader.js";
import { settingsManager } from "../../save/settings_manager.js";
import { saveManager, validateAutoSaveGate } from "../../save/save_manager.js";
import {
  getAnimatedTable,
  getViewedTable,
  markAnimated,
  markViewed
} from "../scene_text_fx_state.js";
import { syncInventoryGainHighlights } from "../ui_overlay_controller.js";
import { getIllustrationAssetByKey } from "../ui/illustration_assets.js";
import {
  buildMoneyDeltaFxPayload,
  buildWorkPresentationPayload,
  isWorkPresentationAction
} from "../work_feedback_template.js";
import { getJobDefinitionBySourceActionId } from "../jobs/job_definitions.js";
import {
  buildJobAvailabilityRejectionMessage,
  getJobAvailabilityDialogTitle,
  resolveJobAvailability
} from "../jobs/job_availability_resolver.js";
import {
  billCentsToWalletMoney,
  formatBillCents,
  formatWalletMoney,
  formatWalletMoneyDelta,
  isClinicBillPaymentAction
} from "../medical_bill_money.js";
import { JOB_SESSION_STATUS, isJobSessionUiAction, normalizeJobSession } from "../jobs/job_session.js";
import { getInquiryDefinitionBySourceActionId } from "../inquiry/inquiry_definitions.js";
import { INQUIRY_SESSION_STATUS, isInquirySessionUiAction, normalizeInquirySession } from "../inquiry/inquiry_session.js";
import { hasUnlockedRecord } from "../records/record_service.js";
import {
  resolveTheseusBoardingEligibility,
  THESEUS_BOARDING_DIALOG_CANCEL_LABEL,
  THESEUS_BOARDING_DIALOG_CONFIRM_LABEL,
  THESEUS_BOARDING_DIALOG_MESSAGE,
  THESEUS_BOARDING_DIALOG_TITLE,
  THESEUS_CREW_ASK_BOARDING_ACTION_ID,
  THESEUS_CREW_OPEN_DENIED_ACTION_ID,
  THESEUS_CREW_CONFIRM_BOARDING_ACTION_ID,
  THESEUS_ENDING_MIDPOINT_ACTION_ID
} from "../theseus_boarding.js";
import { createMenuTransitionRuntimeOwner, createTransitionRuntimeOwnerAdapter } from "../transition_dom_ownership.js";
import { isMargSceneTransitionBlocker } from "../marg_transition_blocker_provider.js";
import { isTimedLocationClosureBlocker } from "../timed_location_runtime.js";
import {
  didCanonicalUiDeltaOccur,
  getUiActionStateSnapshot,
  getUiRouteSnapshot,
  pushUiActionDiff,
  pushUiOpenCallchain,
  pushUiOverlayTrace,
  pushUiRouteTrace,
  resolveUiSurface
} from "../ui_route.js";
import { getCanonicalMapId, setCanonicalMapContext } from "../map_context.js";
import {
  closeMenu as closeNightKitchenMenu,
  openMenu as openNightKitchenMenu,
  resolveNightKitchenMenuCatalog
} from "../night_kitchen_menu_controller.js";
import { buildInteractionUiFeedback, buildRuntimeActionViewModel } from "../map_content_runtime.js";
import { ensureCurrentSceneV2, getSceneByIdV2, isMapContentV2 } from "../map_content_v2.js";
import {
  closePanel as closeShopGoodsPanel,
  openPanel as openShopGoodsPanel
} from "../shop_goods_panel_controller.js";
import { resolveShopGoodsCatalog } from "../shop_goods_catalog.js";

/**
 * 防重入锁
 */
let isDispatching = false;
const INDUSTRIAL_FRONTLINE_MAP_IDS = new Set([
  "industrial_split",
  "industrial_warehouse_gate",
  "industrial_maintenance_gate"
]);
const REAR_ZONE_LODGING_CHECKOUT_BLOCKER_ID = "rear_zone_lodging_checkout_0900";
const REAR_ZONE_LODGING_CHECKOUT_DIALOGUE_MAP_ID = "rear_zone_lodging_checkout_0900";
const STEELCROSS_MARKET_RETURN_MAP_ID = "steelcross_port";
const STEELCROSS_MARKET_RECORD_ACTION_ID = "system_unlock_steelcross_port_market_record";
const STEELCROSS_MARKET_RECORD_ID = "steelcross_port_market_001";
const STEELCROSS_MARKET_ENTRY_MAP_ID = "steelcross_market_01";
const TUCSON_HOME_DEPART_ACTION_ID = "tucson_home_depart";
const THESEUS_ENDING_TRANSITION_RUNTIME_OWNER = createTransitionRuntimeOwnerAdapter(
  createMenuTransitionRuntimeOwner({
    inMs: 1600,
    holdMs: 220,
    outMs: 1100,
    owner: "runtime/theseus_ending_transition_owner"
  })
);

async function playTheseusEndingTransitionIn() {
  await THESEUS_ENDING_TRANSITION_RUNTIME_OWNER.playIn("menu_cinematic", {
    source: "theseus_ending_transition",
    stage: "play_in"
  });
}

async function playTheseusEndingTransitionOut() {
  await THESEUS_ENDING_TRANSITION_RUNTIME_OWNER.playOut("menu_cinematic", {
    source: "theseus_ending_transition",
    stage: "play_out"
  });
}

function isIndustrialFrontlineMapId(mapId) {
  return INDUSTRIAL_FRONTLINE_MAP_IDS.has(String(mapId || "").trim());
}

function shouldQueueSteelcrossMarketRecordUnlock(report, actionId) {
  if (String(actionId || "").trim() === STEELCROSS_MARKET_RECORD_ACTION_ID) {
    return false;
  }

  const beforeMapId = String(report?.before?.mapId || "").trim();
  const afterMapId = String(report?.after?.mapId || "").trim();
  if (afterMapId !== STEELCROSS_MARKET_ENTRY_MAP_ID || beforeMapId === afterMapId) {
    return false;
  }

  const loadMapSucceeded = (Array.isArray(report?.sysCalls) ? report.sysCalls : []).some((row) => {
    const callType = String(row?.call?.type || "").trim();
    const targetMapId = String(row?.call?.params?.mapId || row?.result?.mapId || "").trim();
    return callType === "LOAD_MAP"
      && targetMapId === STEELCROSS_MARKET_ENTRY_MAP_ID
      && row?.result?.ok === true;
  });

  if (!loadMapSucceeded) {
    return false;
  }

  return !hasUnlockedRecord({
    recordId: STEELCROSS_MARKET_RECORD_ID,
    recordsState: gameState?.player?.records
  });
}

export function markSceneTextFxAnimated(contentKey) {
  const key = String(contentKey || "").trim();
  if (!key) return { ok: false, reason: "empty_key" };
  try {
    const table = getAnimatedTable(gameState);
    if (Object.prototype.hasOwnProperty.call(table, key)) {
      return { ok: true, key, updated: false };
    }
    const nextState = markAnimated(gameState, key);
    gameState.sceneTextFxAnimated = nextState.sceneTextFxAnimated;
    return { ok: true, key, updated: true };
  } catch (error) {
    return { ok: false, key, reason: error?.message || String(error || "unknown_error") };
  }
}

export function markSceneTextFxViewed(contentKey) {
  const key = String(contentKey || "").trim();
  if (!key) return { ok: false, reason: "empty_key" };
  try {
    const table = getViewedTable(gameState);
    if (Object.prototype.hasOwnProperty.call(table, key)) {
      return { ok: true, key, updated: false };
    }
    const nextState = markViewed(gameState, key);
    gameState.sceneTextFxViewed = nextState.sceneTextFxViewed;
    return { ok: true, key, updated: true };
  } catch (error) {
    return { ok: false, key, reason: error?.message || String(error || "unknown_error") };
  }
}

const LOAD_FREEZE_TRACE_MAX = 200;

function getFreezeTraceBuffer() {
  if (typeof window === "undefined") return null;
  if (!Array.isArray(window.__LOAD_FREEZE_TRACE__)) {
    window.__LOAD_FREEZE_TRACE__ = [];
  }
  return window.__LOAD_FREEZE_TRACE__;
}

function pushLoadFreezeTrace(entry) {
  const trace = getFreezeTraceBuffer();
  if (!trace) return;
  trace.push({
    ts: new Date().toISOString(),
    ...entry
  });
  if (trace.length > LOAD_FREEZE_TRACE_MAX) {
    trace.splice(0, trace.length - LOAD_FREEZE_TRACE_MAX);
  }
}

function currentPageTypeFromState(state) {
  const mapId = String(state?.currentMapId || state?.world?.currentMapId || state?.currentMap?.id || "");
  if (!mapId) return "unknown";
  return isMenuMapId(mapId) ? "menu" : "map";
}

function pushOverlayLifecycleTrace({ source, actionId, prevRoute, nextRoute, resolvedRoute, violationCode = null, errorMessage = null }) {
  pushUiOverlayTrace({
    source,
    actionId,
    prevUiPage: prevRoute?.uiPage ?? null,
    nextUiPage: nextRoute?.uiPage ?? null,
    prevUiOverlay: prevRoute?.uiOverlay ?? null,
    nextUiOverlay: nextRoute?.uiOverlay ?? null,
    resolvedOverlay: resolvedRoute?.overlayType ?? null,
    renderedOverlay: null,
    hostId: resolvedRoute?.hostType ? String(resolvedRoute.hostType) : null,
    currentMapId: nextRoute?.currentMapId ?? null,
    currentSceneId: nextRoute?.currentSceneId ?? null,
    violationCode,
    errorMessage
  });
}

function isUiOpenAction(actionId) {
  return actionId === "ui_map_open"
    || actionId === "ui_tasks_open"
    || actionId === "ui_open_inventory"
    || actionId === "ui_memo_open";
}

function resolveTransientRuntimeClearReason(actionId, prevRoute, nextRoute) {
  const normalizedActionId = String(actionId || "").trim();
  if (normalizedActionId === "menu_new_game" || normalizedActionId === "new_game") {
    return TRANSIENT_CLEAR_REASONS.HARD_RESET;
  }
  if (!prevRoute || !nextRoute) return "";
  const didRouteChange = prevRoute.uiPage !== nextRoute.uiPage
    || prevRoute.uiOverlay !== nextRoute.uiOverlay
    || prevRoute.currentMapId !== nextRoute.currentMapId
    || prevRoute.currentSceneId !== nextRoute.currentSceneId;
  return didRouteChange ? TRANSIENT_CLEAR_REASONS.ROUTE_CHANGE : "";
}

function shouldClearToastMessageLedger(actionId) {
  const normalizedActionId = String(actionId || "").trim();
  return normalizedActionId === "menu_new_game"
    || normalizedActionId === "new_game"
    || normalizedActionId.startsWith("load_slot_")
    || normalizedActionId.startsWith("menu_load:")
    || normalizedActionId.startsWith("menu_import:");
}

function projectUiStateFromEffects(prevState, effects) {
  const projected = {
    ...(prevState || {}),
    uiPage: String(prevState?.uiPage || ""),
    uiOverlay: prevState?.uiOverlay ?? null,
    uiPanel: prevState?.uiPanel ?? null,
    legacyInventoryFlag: !!prevState?.legacyInventoryFlag,
    legacyTasksFlag: !!prevState?.legacyTasksFlag,
    legacyMemoFlag: !!prevState?.legacyMemoFlag,
    currentMapId: prevState?.currentMapId ?? null,
    currentSceneId: prevState?.currentSceneId ?? null
  };

  for (const effect of Array.isArray(effects) ? effects : []) {
    if (!effect || effect.op !== "set") continue;
    const path = String(effect.path || "").trim();
    if (path === "ui.page") projected.uiPage = String(effect.value || "");
    if (path === "ui.overlay") projected.uiOverlay = effect.value == null ? null : String(effect.value);
    if (path === "ui.panel") projected.uiPanel = effect.value == null ? null : String(effect.value);
    if (path === "ui.inventoryOpen") projected.legacyInventoryFlag = !!effect.value;
    if (path === "ui.tasksOpen") projected.legacyTasksFlag = !!effect.value;
    if (path === "ui.memoOpen") projected.legacyMemoFlag = !!effect.value;
  }
  return projected;
}

function pushActionDiffTrace({ stage, actionId, prevState, nextState, resolvedRoute = null, renderedRoute = null, violationCode = null, errorMessage = null }) {
  pushUiActionDiff({
    stage,
    actionId,
    prev: prevState,
    next: nextState,
    resolvedRoute,
    renderedRoute,
    didCanonicalDeltaOccur: didCanonicalUiDeltaOccur(prevState, nextState),
    violationCode,
    errorMessage
  });
}

function pushOpenCallchainTrace({
  source,
  actionId,
  actionType = null,
  prevState = null,
  nextState = null,
  resolveEntered = false,
  resolveExited = false,
  resolveResultType = null,
  resolveResultKeys = [],
  commitEntered = false,
  commitExited = false,
  canonicalSetterCalled = false,
  canonicalSelectorResult = null,
  renderedSurface = null,
  violationCode = null,
  errorMessage = null
}) {
  pushUiOpenCallchain({
    source,
    actionId,
    actionType,
    prev: prevState,
    next: nextState,
    resolveEntered,
    resolveExited,
    resolveResultType,
    resolveResultKeys,
    commitEntered,
    commitExited,
    canonicalSetterCalled,
    canonicalSelectorResult,
    renderedSurface,
    violationCode,
    errorMessage
  });
}

function isMenuMapId(mapId) {
  const id = String(mapId || "");
  return id === "menu" || id === "menu_more" || id.startsWith("menu_");
}

function pickJsonFileText() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json,text/plain";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) {
        input.remove();
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        input.remove();
        resolve(typeof reader.result === "string" ? reader.result : null);
      };
      reader.onerror = () => {
        input.remove();
        resolve(null);
      };
      reader.readAsText(file);
    }, { once: true });

    input.click();
  });
}

function parseSlotIdFromAction(actionId, prefix) {
  const raw = String(actionId || "").slice(prefix.length);
  if (raw === "auto") return "auto";
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function findSlotPreview(slotId) {
  const list = saveManager.listSlots();
  return list.find(s => s.slotId === slotId) || null;
}

const GOV_HALL_ENTRY_ACTION_ID = "to_gov_hall_entry";
const GOV_HALL_SIDE_CORRIDOR_ATTEMPT_ACTION_ID = "gov_c_try_to_d";
const GOV_HALL_RETURN_STREET_MAP_ID = "winddyke_street_corner_notice";
const GOV_HALL_MAP_IDS = new Set([
  "gov_hall_entry_split",
  "gov_hall_main_hall",
  "gov_hall_side_corridor",
  "gov_hall_window_1"
]);

function isGovHallMapId(mapId) {
  return GOV_HALL_MAP_IDS.has(String(mapId || "").trim());
}

function collectPushedLogLinesFromReport(report) {
  const appliedEffects = Array.isArray(report?.effects?.applied) ? report.effects.applied : [];
  return appliedEffects
    .filter((row) => row?.effect?.op === "push" && row?.effect?.path === "logLines")
    .map((row) => String(row?.effect?.value || "").trim())
    .filter(Boolean);
}

function syncSidebarMoneyDeltaFxFromReport(actionId, report) {
  if (!gameState.ui || typeof gameState.ui !== "object") {
    gameState.ui = {};
  }

  const beforeMoney = Number(report?.before?.money ?? gameState.world?.money ?? 0);
  const afterMoney = Number(report?.after?.money ?? gameState.world?.money ?? beforeMoney);
  const currencyDelta = afterMoney - beforeMoney;

  const moneyFx = buildMoneyDeltaFxPayload({
    sourceActionId: actionId,
    currencyDelta,
    balanceBefore: beforeMoney,
    balanceAfter: afterMoney
  });
  if (moneyFx) {
    if (isClinicBillPaymentAction(actionId)) {
      moneyFx.label = formatWalletMoneyDelta(currencyDelta);
    }
    gameState.ui.moneyDeltaFx = moneyFx;
  }
}

const MILLIONAIRE_ACHIEVEMENT_THRESHOLD = 1000000;
const SPRING_RETURN_TARGET_MONTH = 11;
const SPRING_RETURN_REGION_ID = "CambCity";

function didReachTargetMonthBetween(beforeCalendarView, afterCalendarView, targetMonth) {
  const beforeYear = Number(beforeCalendarView?.year);
  const beforeMonth = Number(beforeCalendarView?.month);
  const afterYear = Number(afterCalendarView?.year);
  const afterMonth = Number(afterCalendarView?.month);
  if (!Number.isFinite(beforeYear) || !Number.isFinite(beforeMonth) || !Number.isFinite(afterYear) || !Number.isFinite(afterMonth)) {
    return false;
  }
  if (afterYear < beforeYear) return false;
  if (afterYear === beforeYear) {
    return beforeMonth < targetMonth && afterMonth >= targetMonth;
  }
  if (afterYear === beforeYear + 1) {
    return beforeMonth < targetMonth || afterMonth >= targetMonth;
  }
  return true;
}

function publishAchievementSignalsFromReport(actionId, report) {
  const beforeMoney = Number(report.before.money);
  const afterMoney = Number(report.after.money);
  if (!(beforeMoney < MILLIONAIRE_ACHIEVEMENT_THRESHOLD && afterMoney >= MILLIONAIRE_ACHIEVEMENT_THRESHOLD)) {
  } else {
    publishSignal({
      type: "achievement.signal",
      key: "money_million_reached"
    }, {
      source: "action_commit",
      actionId: String(actionId || "").trim() || null,
      beforeMoney,
      afterMoney
    });
  }

  const afterRegionId = String(gameState?.world?.regionId || "").trim();
  if (afterRegionId !== SPRING_RETURN_REGION_ID) {
    return;
  }

  const beforeCalendarView = getCalendarViewFromTotalMinutes(Number(report.before.time), gameState.world);
  const afterCalendarView = getCalendarViewFromTotalMinutes(Number(report.after.time), gameState.world);
  if (!didReachTargetMonthBetween(beforeCalendarView, afterCalendarView, SPRING_RETURN_TARGET_MONTH)) {
    return;
  }

  publishSignal({
    type: "achievement.signal",
    key: "cambcity_november_reached"
  }, {
    source: "action_commit",
    actionId: String(actionId || "").trim() || null,
    regionId: afterRegionId,
    beforeCalendar: {
      year: beforeCalendarView.year,
      month: beforeCalendarView.month,
      day: beforeCalendarView.day
    },
    afterCalendar: {
      year: afterCalendarView.year,
      month: afterCalendarView.month,
      day: afterCalendarView.day
    }
  });
}

// Work actions use inline presentation in the scene body instead of modal notices.
function syncInlineWorkPresentationFromReport(actionId, report) {
  if (!isWorkPresentationAction(actionId)) return;
  const activeJobSession = normalizeJobSession(gameState?.ui?.jobSession);
  const activeInquirySession = normalizeInquirySession(gameState?.ui?.inquirySession);
  if (activeInquirySession && activeInquirySession.status === INQUIRY_SESSION_STATUS.ACTIVE) {
    return;
  }
  if (
    activeJobSession
    && String(activeJobSession.sourceActionId || "") === String(actionId || "")
    && activeJobSession.status === JOB_SESSION_STATUS.BRIEFING
  ) {
    // Source action now starts a job session briefing and should not emit execution feedback.
    return;
  }
  if (!gameState.ui || typeof gameState.ui !== "object") {
    gameState.ui = {};
  }

  const beforeMoney = Number(report?.before?.money ?? gameState.world?.money ?? 0);
  const afterMoney = Number(report?.after?.money ?? gameState.world?.money ?? beforeMoney);
  const currencyDelta = afterMoney - beforeMoney;
  const runtimeActionFeedback = String(report?.uiRuntime?.actionFeedback || "").trim();

  const payload = buildWorkPresentationPayload({
    actionId,
    mapId: String(gameState.currentMapId || gameState.world?.currentMapId || ""),
    totalMinutes: Number(gameState.time?.totalMinutes ?? 0),
    runtimeActionFeedback,
    pushedLogLines: collectPushedLogLinesFromReport(report),
    beforeMoney,
    afterMoney,
    currencyDelta
  });

  if (payload) {
    gameState.ui.workFeedback = payload;
  }
}

async function forceReturnFromGovHallToStreet() {
  const targetMapId = GOV_HALL_RETURN_STREET_MAP_ID;
  const map = await loadMap(targetMapId);
  if (!map) {
    console.error(`[Dispatch] 保安请离失败：无法加载地图 ${targetMapId}`);
    return false;
  }

  const previousMapId = getCanonicalMapId(gameState);
  gameState.previousMapId = previousMapId;
  setCanonicalMapContext(gameState, targetMapId, map, "dispatch:forceReturnFromGovHallToStreet");
  return true;
}

async function forceLoadMapTarget(target, source = "dispatch:forceLoadMapTarget") {
  const targetMapId = String(target?.mapId || target || "").trim();
  if (!targetMapId) return false;

  const map = await loadMap(targetMapId);
  if (!map) {
    console.error(`[Dispatch] 强制加载地图失败：无法加载地图 ${targetMapId}`);
    return false;
  }

  const previousMapId = getCanonicalMapId(gameState);
  gameState.previousMapId = previousMapId;
  setCanonicalMapContext(gameState, targetMapId, map, source);

  const targetSceneId = String(target?.sceneId || "").trim();
  if (targetSceneId && isMapContentV2(map)) {
    const targetScene = getSceneByIdV2(map, targetSceneId);
    if (targetScene) {
      gameState.currentSceneId = targetScene.id;
      gameState.currentScene = { ...targetScene };
      return true;
    }
  }

  ensureCurrentSceneV2(gameState, map, source);
  return true;
}

async function forceLoadMapById(targetMapId, source = "dispatch:forceLoadMapById") {
  return forceLoadMapTarget({ mapId: targetMapId }, source);
}

function applyPostHardStopCleanup(cleanup) {
  const scopes = Array.isArray(cleanup?.scopes) ? cleanup.scopes : [];
  const flags = Array.isArray(cleanup?.flags) ? cleanup.flags : [];

  for (const scope of scopes) {
    const normalizedScope = String(scope || "").trim();
    if (normalizedScope === "current_scene") {
      gameState.currentSceneId = null;
      gameState.currentScene = null;
    }
  }

  if (flags.length > 0) {
    if (!gameState.world || typeof gameState.world !== "object") {
      gameState.world = {};
    }
    if (!gameState.world.flags || typeof gameState.world.flags !== "object") {
      gameState.world.flags = {};
    }
    for (const flag of flags) {
      const key = String(flag || "").trim();
      if (!key) continue;
      delete gameState.world.flags[key];
      if (gameState.flags && typeof gameState.flags === "object") {
        delete gameState.flags[key];
      }
    }
  }
}

async function maybeHandleTimedLocationClosure(report, { suppressDialogs = false, suppressRender = false } = {}) {
  const advanceStop = report?.sysCalls?.find((row) => row?.call?.type === "ADVANCE_TIME")?.result?.blockedBy || null;
  if (!isTimedLocationClosureBlocker(advanceStop)) {
    return false;
  }

  if (!suppressDialogs && advanceStop?.notice) {
    await showNoticeDialog(advanceStop.notice);
  }

  applyPostHardStopCleanup(advanceStop?.cleanup);

  const moved = await forceLoadMapTarget(advanceStop?.fallback || null, "dispatch:timedLocationClosure");
  if (!moved) return true;

  if (report?.after && typeof report.after === "object") {
    report.after.mapId = String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || "");
  }

  if (!suppressRender) {
    render();
  }

  return true;
}

async function maybeHandleMargSceneTransitionBlocker(report, { suppressRender = false } = {}) {
  const advanceStop = report?.sysCalls?.find((row) => row?.call?.type === "ADVANCE_TIME")?.result?.blockedBy || null;
  if (!isMargSceneTransitionBlocker(advanceStop)) {
    return false;
  }

  if (!gameState.ui || typeof gameState.ui !== "object") {
    gameState.ui = {};
  }
  gameState.ui.margTransitionBlocker = {
    ...advanceStop
  };

  const moved = await forceLoadMapTarget(advanceStop?.fallback || null, "dispatch:margSceneTransitionBlocker");
  if (!moved) return true;

  if (report?.after && typeof report.after === "object") {
    report.after.mapId = String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || "");
  }

  if (!suppressRender) {
    render();
  }

  return true;
}

async function maybeHandleSteelcrossMarketClosing(report, { suppressDialogs = false, suppressRender = false } = {}) {
  const advanceStop = report?.sysCalls?.find((row) => row?.call?.type === "ADVANCE_TIME")?.result?.blockedBy || null;
  const advanceStopId = String(advanceStop?.blockerId || "").trim();
  const fallbackApplies = shouldForceExitSteelcrossMarket(gameState);

  if (advanceStopId !== STEELCROSS_MARKET_CLOSING_BLOCKER_ID && !fallbackApplies) {
    return false;
  }

  if (!suppressDialogs) {
    await showNoticeDialog({
      title: "港集会",
      message: "集市已经结束了",
      actions: [{ id: "ok", label: "返回", kind: "primary" }]
    });
  }

  const moved = await forceLoadMapById(
    String(advanceStop?.targetMapId || STEELCROSS_MARKET_RETURN_MAP_ID).trim() || STEELCROSS_MARKET_RETURN_MAP_ID,
    advanceStopId === STEELCROSS_MARKET_CLOSING_BLOCKER_ID
      ? "dispatch:steelcrossMarketClosingBlocker"
      : "dispatch:steelcrossMarketClosingFallback"
  );

  if (!moved) return true;

  if (report?.after && typeof report.after === "object") {
    report.after.mapId = String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || STEELCROSS_MARKET_RETURN_MAP_ID);
  }

  if (!suppressRender) {
    render();
  }

  return true;
}

/**
 * Dispatch Action（UI 入口）
 * 
 * @param {string} actionId - 动作ID（来自 data-action-id）
 * @param {Object} payload - UI 采集的参数（可选）
 * @param {Object} options - 调试选项（可选）
 * @returns {Promise<boolean>} 是否成功处理
 */
export async function dispatch(actionId, payload = {}, options = {}) {
  const routePrev = getUiRouteSnapshot(gameState);
  const uiStatePrev = getUiActionStateSnapshot(gameState);
  const actionIdText = String(actionId || "");
  const beforeMapIdSnapshot = String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || "");
  const beforeUiPageSnapshot = String(gameState?.ui?.page || "");
  const beforePageTypeSnapshot = currentPageTypeFromState(gameState);

  const returnReport = options?.returnReport === true;
  const suppressRender = options?.suppressRender === true;
  const suppressFeedback = options?.suppressFeedback === true;
  const suppressDialogs = options?.suppressDialogs === true;
  const uiRuntime = options?.uiRuntime && typeof options.uiRuntime === "object"
    ? { ...options.uiRuntime }
    : null;
  const makeReturn = (ok, extra = null) => {
    if (!returnReport) return ok;
    const base = {
      ok: !!ok,
      report: null,
      reason: null,
      error: null
    };
    return {
      ...base,
      ...(extra && typeof extra === "object" ? extra : {})
    };
  };
  let shouldPlayTheseusEndingTransition = false;
  let theseusEndingTransitionPlayed = false;

  // ========== 1. 防重入 ==========
  if (isDispatching) {
    console.warn(`[Dispatch] 忽略重复请求: ${actionId}（正在处理中）`);
    pushLoadFreezeTrace({
      stage: "dispatch_rejected",
      actionId: actionIdText,
      reason: "reentrant",
      mapId: String(gameState.currentMapId || ""),
      uiPage: String(gameState?.ui?.page || ""),
      pageType: currentPageTypeFromState(gameState)
    });
    return makeReturn(false, { reason: "reentrant" });
  }

  const traceCtx = {
    actionId: actionIdText,
    beforeMapId: beforeMapIdSnapshot,
    beforeUiPage: beforeUiPageSnapshot,
    beforePageType: beforePageTypeSnapshot,
    stage: "dispatch_start",
    freezeFlagged: false,
    startedAtMs: Date.now(),
    actionType: null,
    resolveEntered: false,
    resolveExited: false,
    commitEntered: false,
    commitExited: false
  };
  pushLoadFreezeTrace({
    stage: "dispatch_start",
    actionId: traceCtx.actionId,
    mapId: traceCtx.beforeMapId,
    uiPage: traceCtx.beforeUiPage,
    pageType: traceCtx.beforePageType
  });
  const routeAtStart = resolveUiSurface(gameState, {
    source: "dispatch_start",
    actionId: actionIdText,
    prev: routePrev,
    next: routePrev
  });
  pushUiRouteTrace({
    actionId: actionIdText,
    source: "dispatch_start",
    prevUiPage: routePrev.uiPage,
    nextUiPage: routePrev.uiPage,
    prevUiOverlay: routePrev.uiOverlay,
    nextUiOverlay: routePrev.uiOverlay,
    prevCurrentMapId: routePrev.currentMapId,
    nextCurrentMapId: routePrev.currentMapId,
    prevCurrentSceneId: routePrev.currentSceneId,
    nextCurrentSceneId: routePrev.currentSceneId,
    resolvedPageType: routeAtStart.pageType,
    resolvedOverlayType: routeAtStart.overlayType,
    renderHost: routeAtStart.hostType,
    violationCode: routeAtStart.violations.length > 0 ? "route_contract_violation" : null,
    errorMessage: routeAtStart.violations.length > 0 ? routeAtStart.violations.join(",") : null
  });
  pushActionDiffTrace({
    stage: "dispatch:start",
    actionId: actionIdText,
    prevState: uiStatePrev,
    nextState: uiStatePrev,
    resolvedRoute: {
      pageType: routeAtStart.pageType,
      overlayType: routeAtStart.overlayType,
      hostType: routeAtStart.hostType,
      mapId: routeAtStart.mapId
    }
  });
  pushOpenCallchainTrace({
    source: "dispatch:start",
    actionId: actionIdText,
    actionType: null,
    prevState: uiStatePrev,
    nextState: uiStatePrev,
    resolveEntered: false,
    resolveExited: false,
    commitEntered: false,
    commitExited: false
  });
  
  isDispatching = true;
  if (typeof window !== "undefined") {
    window.__LAST_DISPATCH_ACTION_ID__ = String(actionId || "");
  }

  const freezeWatchdog = setTimeout(() => {
    if (!isDispatching || traceCtx.freezeFlagged) return;
    traceCtx.freezeFlagged = true;
    pushLoadFreezeTrace({
      stage: "freeze_suspected",
      actionId: traceCtx.actionId,
      currentStage: traceCtx.stage,
      elapsedMs: Date.now() - traceCtx.startedAtMs,
      mapId: String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || ""),
      uiPage: String(gameState?.ui?.page || ""),
      pageType: currentPageTypeFromState(gameState)
    });
  }, 1500);
  
  const govBusinessAtStart = getGovHallBusinessState(gameState);
  const wasInGovHallAtDispatchStart = isGovHallMapId(beforeMapIdSnapshot);
  let govHallForcedExitApplied = false;
  const abortDispatch = (extra = null) => {
    const normalized = extra && typeof extra === "object"
      ? { reason: "aborted", ...extra }
      : { reason: "aborted" };
    return makeReturn(false, normalized);
  };

  try {
    if (!suppressRender && !suppressDialogs) {
      settingsManager.applyToDocument();
    }
    const settings = settingsManager.getSettings();

    if (actionId === "menu_go_load" && String(gameState.currentMapId || "") === "menu_main") {
      document.body.dataset.skipMapTransitionOnce = "1";
    }

    // ========== 0.0 预处理：导入存档（文件 + 槽位） ==========
    if (actionId === "menu_import_global") {
      if (suppressDialogs) return abortDispatch({ reason: "dialogs_suppressed" });
      const slots = saveManager.listSlots();
      const picked = await showImportSaveDialog({
        title: "导入存档",
        message: "选择存档文件并指定目标槽位（会覆盖目标槽位数据）。",
        slots
      });
      if (!picked) return abortDispatch();
      actionId = `menu_import:${picked.slotId}`;
      payload = { ...payload, jsonString: picked.jsonString };
    }

    if (typeof actionId === "string" && actionId.startsWith("menu_import:") && !payload?.jsonString) {
      if (suppressDialogs) return abortDispatch({ reason: "dialogs_suppressed" });
      const fixed = parseSlotIdFromAction(actionId, "menu_import:");
      if (!fixed || fixed === "auto") return abortDispatch();
      const slots = saveManager.listSlots();
      const picked = await showImportSaveDialog({
        title: "导入存档",
        message: `导入到 槽位 ${fixed}（会覆盖该槽位数据）。`,
        slots,
        fixedSlotId: fixed
      });
      if (!picked) return abortDispatch();
      payload = { ...payload, jsonString: picked.jsonString };
    }

    if (typeof actionId === "string" && actionId.startsWith("menu_rename:")) {
      if (suppressDialogs) return abortDispatch({ reason: "dialogs_suppressed" });
      const slotId = parseSlotIdFromAction(actionId, "menu_rename:");
      if (!slotId || slotId === "auto") return abortDispatch();
      const preview = findSlotPreview(slotId);
      const defaultName = String(preview?.displayName || `槽位 ${slotId}`);
      const renamed = await showInputDialog({
        title: "重命名槽位",
        message: `请为 槽位 ${slotId} 输入新名称（最多 24 字）。`,
        defaultValue: defaultName,
        placeholder: "例如：诊所夜班前",
        confirmLabel: "保存名称",
        cancelLabel: "取消"
      });
      if (renamed == null) return abortDispatch();
      payload = { ...payload, displayName: String(renamed || "").trim() };
    }

    // ========== 0.1 新建游戏确认 ==========
    if (actionId === "menu_new_game") {
      const inMenu = typeof gameState.currentMapId === "string" && gameState.currentMapId.startsWith("menu_");
      const hasProgress = (gameState.time?.totalMinutes || 0) > 0 || !inMenu;
      if (hasProgress && settings.confirmDangerous) {
        if (suppressDialogs) return abortDispatch({ reason: "dialogs_suppressed" });
        const ok = await showConfirmDialog({
          title: "新建游戏",
          message: "新建游戏会覆盖当前未保存进度（不影响已有存档）。继续？",
          confirmLabel: "继续",
          cancelLabel: "取消"
        });
        if (!ok) return abortDispatch();
      }
    }

    // ========== 0. 交互确认（删除）==========
    const isDelete = typeof actionId === "string"
      && (actionId.startsWith("delete_slot_") || actionId.startsWith("menu_delete:"));
    if (isDelete && settings.confirmDeleteSave) {
      if (suppressDialogs) return abortDispatch({ reason: "dialogs_suppressed" });
      const slotIdStr = actionId.startsWith("menu_delete:")
        ? actionId.replace("menu_delete:", "")
        : actionId.replace("delete_slot_", "");
      const slotLabel = slotIdStr === "auto" ? "自动存档" : `槽位 ${slotIdStr}`;
      const ok = await showConfirmDialog({
        title: "删除确认",
        message: `删除 ${slotLabel}？\n\n删除会移除槽位本身（不会留下空占位），且不可撤销。`,
        confirmLabel: "确认删除",
        cancelLabel: "取消"
      });
      if (!ok) return abortDispatch();
    }

    const isImport = typeof actionId === "string" && actionId.startsWith("menu_import:");
    if (isImport && settings.confirmDangerous) {
      if (suppressDialogs) return abortDispatch({ reason: "dialogs_suppressed" });
      const ok = await showConfirmDialog({
        title: "导入确认",
        message: "导入会覆盖目标槽位数据。继续？",
        confirmLabel: "继续导入",
        cancelLabel: "取消"
      });
      if (!ok) return abortDispatch();
    }

    const isLoad = typeof actionId === "string" && (actionId.startsWith("menu_load:") || actionId.startsWith("load_slot_"));
    if (isLoad) {
      if (suppressDialogs) return abortDispatch({ reason: "dialogs_suppressed" });
      const ok = await showConfirmDialog({
        title: "读取存档",
        message: "加载会覆盖当前进度。继续？",
        confirmLabel: "加载",
        cancelLabel: "取消"
      });
      if (!ok) return abortDispatch();
    }

    const isMenuSave = typeof actionId === "string" && actionId.startsWith("menu_save:");
    const isQuickSave = typeof actionId === "string" && actionId.startsWith("save_to_slot_");
    if (isMenuSave || isQuickSave) {
      const slotId = isMenuSave
        ? parseSlotIdFromAction(actionId, "menu_save:")
        : parseSlotIdFromAction(actionId, "save_to_slot_");

      if (slotId && slotId !== "auto") {
        const preview = saveManager.listSlots().find(s => s.slotId === slotId);
        const needsConfirm = !!preview && !preview.isEmpty && !preview.corrupted;
        if (needsConfirm && settings.confirmDangerous) {
          if (suppressDialogs) return abortDispatch({ reason: "dialogs_suppressed" });
          const ok = await showConfirmDialog({
            title: "覆盖存档",
            message: `槽位 ${slotId} 已有存档。\n\n保存会覆盖该槽位数据。继续？`,
            confirmLabel: "覆盖保存",
            cancelLabel: "取消"
          });
          if (!ok) return abortDispatch();
        }
      }
    }

    if (actionId === "settings_reset_defaults" && settings.confirmDangerous) {
      if (suppressDialogs) return abortDispatch({ reason: "dialogs_suppressed" });
      const ok = await showConfirmDialog({
        title: "恢复默认设置",
        message: "将清空本机设置并恢复默认值。继续？",
        confirmLabel: "恢复默认",
        cancelLabel: "取消"
      });
      if (!ok) return abortDispatch();
    }

    if (actionId === GOV_HALL_ENTRY_ACTION_ID && !getGovHallBusinessState(gameState).isOpen) {
      if (!suppressDialogs) {
        showNoticeDialog({
          title: "政务大厅",
          message: "大门已经锁上。",
          actions: [{ id: "ok", label: "返回", kind: "primary" }]
        });
      }
      return abortDispatch({ reason: "gov_hall_closed_entry" });
    }

    if (actionId === THESEUS_CREW_ASK_BOARDING_ACTION_ID) {
      const boardingEligibility = resolveTheseusBoardingEligibility(gameState);
      if (boardingEligibility.isEligible) {
        if (suppressDialogs) return abortDispatch({ reason: "dialogs_suppressed" });
        const ok = await showConfirmDialog({
          title: THESEUS_BOARDING_DIALOG_TITLE,
          message: THESEUS_BOARDING_DIALOG_MESSAGE,
          confirmLabel: THESEUS_BOARDING_DIALOG_CONFIRM_LABEL,
          cancelLabel: THESEUS_BOARDING_DIALOG_CANCEL_LABEL
        });
        if (!ok) return abortDispatch();
        actionId = THESEUS_CREW_CONFIRM_BOARDING_ACTION_ID;
        payload = {
          ...payload,
          confirmedFromActionId: THESEUS_CREW_ASK_BOARDING_ACTION_ID
        };
        shouldPlayTheseusEndingTransition = true;
      } else {
        actionId = THESEUS_CREW_OPEN_DENIED_ACTION_ID;
        payload = {
          ...payload,
          sourceActionId: THESEUS_CREW_ASK_BOARDING_ACTION_ID,
          deniedBecause: boardingEligibility.hasTicket ? "date_not_met" : "ticket_missing"
        };
      }
    }


    if (actionId === TUCSON_HOME_DEPART_ACTION_ID) {
      if (suppressDialogs) return abortDispatch({ reason: "dialogs_suppressed" });
      const ok = await showConfirmDialog({
        title: "图森 · 宅屋",
        message: "离开这里？",
        confirmLabel: "确定",
        cancelLabel: "返回"
      });
      if (!ok) return abortDispatch();
    }
    if (actionId === THESEUS_ENDING_MIDPOINT_ACTION_ID) {
      shouldPlayTheseusEndingTransition = true;
    }

    if (shouldPlayTheseusEndingTransition) {
      await playTheseusEndingTransitionIn();
      theseusEndingTransitionPlayed = true;
    }

    if (actionId === GOV_HALL_SIDE_CORRIDOR_ATTEMPT_ACTION_ID) {
      if (!suppressDialogs) {
        showNoticeDialog({
          title: "侧廊门禁",
          message: "门禁灯闪了两下红光，安保示意你退回大厅。",
          actions: [{ id: "ok", label: "返回", kind: "primary" }]
        });
      }
      return abortDispatch({ reason: "gov_hall_side_corridor_blocked" });
    }

    const currentMapId = String(gameState.currentMapId || gameState.world?.currentMapId || "").trim();
    const sourceJobDefinition = getJobDefinitionBySourceActionId(actionId, currentMapId);
    if (sourceJobDefinition) {
      const availability = resolveJobAvailability(gameState, sourceJobDefinition.availabilityPolicyId);
      if (!availability.available) {
        const runtimeRejectText = String(payload?.runtimeText?.actionFeedback || "").trim();
        if (!suppressDialogs) {
          showNoticeDialog({
            title: getJobAvailabilityDialogTitle(sourceJobDefinition),
            message: buildJobAvailabilityRejectionMessage(sourceJobDefinition, availability, actionId, runtimeRejectText),
            actions: [{ id: "ok", label: "返回", kind: "primary" }]
          });
        }
        return abortDispatch({ reason: `dispatch_shift_unavailable:${availability.status}` });
      }
    }

    // ========== 2. 创建 Action ==========
    const action = options?.systemAction === true
      ? makeSystemAction(actionId, payload, gameState)
      : makeActionFromUI(actionId, payload, gameState);
    traceCtx.actionType = String(action?.type || "") || null;
    pushOpenCallchainTrace({
      source: "dispatch:start",
      actionId: traceCtx.actionId,
      actionType: traceCtx.actionType,
      prevState: uiStatePrev,
      nextState: uiStatePrev,
      resolveEntered: false,
      resolveExited: false,
      commitEntered: false,
      commitExited: false
    });
    
    // 开发期验证
    try {
      validateAction(action);
    } catch (error) {
      console.error(`[Dispatch] Action 验证失败:`, error);
      return abortDispatch();
    }
    
    // ========== 3. Resolve（Action → Plan）==========
    traceCtx.resolveEntered = true;
    pushOpenCallchainTrace({
      source: "resolve:start",
      actionId: traceCtx.actionId,
      actionType: traceCtx.actionType,
      prevState: uiStatePrev,
      nextState: uiStatePrev,
      resolveEntered: true,
      resolveExited: false,
      commitEntered: false,
      commitExited: false
    });
    const plan = await resolve(action, gameState);
    traceCtx.resolveExited = true;
    traceCtx.stage = "resolve_end";
    pushLoadFreezeTrace({
      stage: "resolve_end",
      actionId: traceCtx.actionId,
      mapId: String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || ""),
      uiPage: String(gameState?.ui?.page || ""),
      pageType: currentPageTypeFromState(gameState),
      sysCallsCount: Array.isArray(plan?.sysCalls) ? plan.sysCalls.length : 0,
      effectsCount: Array.isArray(plan?.effects) ? plan.effects.length : 0
    });
    const routeAfterResolve = getUiRouteSnapshot(gameState);
    const resolvedRoute = resolveUiSurface(gameState, {
      source: "resolve_end",
      actionId: traceCtx.actionId,
      prev: routePrev,
      next: routeAfterResolve
    });
    pushUiRouteTrace({
      actionId: traceCtx.actionId,
      source: "resolve_end",
      prevUiPage: routePrev.uiPage,
      nextUiPage: routeAfterResolve.uiPage,
      prevUiOverlay: routePrev.uiOverlay,
      nextUiOverlay: routeAfterResolve.uiOverlay,
      prevCurrentMapId: routePrev.currentMapId,
      nextCurrentMapId: routeAfterResolve.currentMapId,
      prevCurrentSceneId: routePrev.currentSceneId,
      nextCurrentSceneId: routeAfterResolve.currentSceneId,
      resolvedPageType: resolvedRoute.pageType,
      resolvedOverlayType: resolvedRoute.overlayType,
      renderHost: resolvedRoute.hostType,
      violationCode: resolvedRoute.violations.length > 0 ? "route_contract_violation" : null,
      errorMessage: resolvedRoute.violations.length > 0 ? resolvedRoute.violations.join(",") : null
    });
    const uiStateProjectedAfterResolve = projectUiStateFromEffects(uiStatePrev, plan?.effects);
    pushActionDiffTrace({
      stage: "resolve:end",
      actionId: traceCtx.actionId,
      prevState: uiStatePrev,
      nextState: uiStateProjectedAfterResolve,
      resolvedRoute: {
        pageType: resolvedRoute.pageType,
        overlayType: resolvedRoute.overlayType,
        hostType: resolvedRoute.hostType,
        mapId: resolvedRoute.mapId
      },
      violationCode: resolvedRoute.violations.length > 0 ? "route_contract_violation" : null,
      errorMessage: resolvedRoute.violations.length > 0 ? resolvedRoute.violations.join(",") : null
    });
    pushOpenCallchainTrace({
      source: "resolve:end",
      actionId: traceCtx.actionId,
      actionType: traceCtx.actionType,
      prevState: uiStatePrev,
      nextState: uiStateProjectedAfterResolve,
      resolveEntered: true,
      resolveExited: true,
      resolveResultType: typeof plan,
      resolveResultKeys: plan && typeof plan === "object" ? Object.keys(plan) : [],
      commitEntered: false,
      commitExited: false,
      canonicalSelectorResult: {
        pageType: resolvedRoute.pageType,
        overlayType: uiStateProjectedAfterResolve.uiOverlay,
        hostType: resolvedRoute.hostType
      }
    });
    const routeProjectedAfterResolve = {
      uiPage: uiStateProjectedAfterResolve.uiPage,
      uiOverlay: uiStateProjectedAfterResolve.uiOverlay,
      currentMapId: routePrev.currentMapId,
      currentSceneId: routePrev.currentSceneId
    };
    const resolvedRouteProjected = {
      pageType: String(uiStateProjectedAfterResolve.uiPage || "") === "map" ? currentPageTypeFromState(gameState) : "unknown",
      overlayType: uiStateProjectedAfterResolve.uiOverlay,
      hostType: currentPageTypeFromState(gameState) === "menu" ? "menu_host" : "map_host",
      mapId: routePrev.currentMapId
    };
    pushOverlayLifecycleTrace({
      source: "resolve:end",
      actionId: traceCtx.actionId,
      prevRoute: routePrev,
      nextRoute: routeProjectedAfterResolve,
      resolvedRoute: resolvedRouteProjected,
      violationCode: resolvedRoute.violations.length > 0 ? "overlay_contract_violation" : null,
      errorMessage: resolvedRoute.violations.length > 0 ? resolvedRoute.violations.join(",") : null
    });
    if (routePrev.uiOverlay !== routeProjectedAfterResolve.uiOverlay && routeProjectedAfterResolve.uiOverlay) {
      pushOverlayLifecycleTrace({
        source: "overlay:request_open",
        actionId: traceCtx.actionId,
        prevRoute: routePrev,
        nextRoute: routeProjectedAfterResolve,
        resolvedRoute: resolvedRouteProjected
      });
      if (routePrev.uiOverlay && routePrev.uiOverlay !== routeProjectedAfterResolve.uiOverlay) {
        pushOverlayLifecycleTrace({
          source: "overlay:close_current",
          actionId: traceCtx.actionId,
          prevRoute: routePrev,
          nextRoute: routeProjectedAfterResolve,
          resolvedRoute: resolvedRouteProjected
        });
        pushOverlayLifecycleTrace({
          source: "overlay:replace",
          actionId: traceCtx.actionId,
          prevRoute: routePrev,
          nextRoute: routeProjectedAfterResolve,
          resolvedRoute: resolvedRouteProjected
        });
      }
    }
    if ((traceCtx.actionId === "ui_map_open" || traceCtx.actionId === "ui_open_inventory" || traceCtx.actionId === "ui_tasks_open" || traceCtx.actionId === "ui_memo_open")
      && routeProjectedAfterResolve.uiOverlay === routePrev.uiOverlay) {
      pushOverlayLifecycleTrace({
        source: "overlay:block",
        actionId: traceCtx.actionId,
        prevRoute: routePrev,
        nextRoute: routeProjectedAfterResolve,
        resolvedRoute: resolvedRouteProjected,
        violationCode: "overlay_request_blocked",
        errorMessage: "overlay request did not change canonical overlay"
      });
    }
    
    // 开发期验证
    try {
      validatePlan(plan);
    } catch (error) {
      console.error(`[Dispatch] Plan 验证失败:`, error);
      return abortDispatch();
    }

    // ========== 3.9 UI Commands (pre-commit) ==========
    // Some plans request UI dialogs (confirm/notice). These must be executed in dispatch (UI layer),
    // then re-dispatched as a second formal action, never inside resolve/commit.
    if (!suppressDialogs && Array.isArray(plan?.uiCommands) && plan.uiCommands.length > 0) {
      const supplyConfirm = plan.uiCommands.find((cmd) => String(cmd?.type || "") === "OPEN_SUPPLY_SUBMISSION_CONFIRM") || null;
      const notice = plan.uiCommands.find((cmd) => String(cmd?.type || "") === "OPEN_NOTICE_DIALOG") || null;

      if (notice) {
        await showNoticeDialog({
          title: String(notice.title || "通知"),
          message: String(notice.message || ""),
          actions: [{ id: "back", label: "返回", kind: "primary" }]
        });
        return abortDispatch({ reason: "ui_command_notice_consumed" });
      }

      if (supplyConfirm) {
        const preview = supplyConfirm.preview && typeof supplyConfirm.preview === "object" ? supplyConfirm.preview : null;
        const channel = String(supplyConfirm.channel || preview?.channel || "").trim();
        const expectedTotalValue = Math.max(0, Math.trunc(Number(preview?.totalValue ?? 0)));
        const entries = Array.isArray(preview?.entries)
          ? preview.entries
            .map((row) => ({
              itemId: String(row?.itemId || "").trim(),
              name: String(row?.name || "").trim(),
              qty: Math.max(0, Math.floor(Number(row?.qty ?? 0))),
              quality: String(row?.quality || "").trim(),
              totalValue: Math.max(0, Math.trunc(Number(row?.totalValue ?? 0)))
            }))
            .filter((row) => row.itemId && row.qty > 0)
          : [];

        const picked = await showNoticeDialog({
          title: String(supplyConfirm.title || "确认"),
          message: String(supplyConfirm.message || ""),
          customRenderer: ({ card, requestClose }) => {
            if (!card) return null;
            const host = document.createElement("div");
            host.className = "supply-submission-confirm-list";
            for (const row of entries) {
              const line = document.createElement("div");
              line.className = "supply-submission-confirm-row";

              const name = document.createElement("span");
              const quality = String(row.quality || "").trim();
              name.className = `supply-submission-confirm-item${quality ? ` item-quality-${quality}` : ""}`;
              name.textContent = `${row.name || row.itemId} ×${row.qty}　${row.totalValue}`;

              line.appendChild(name);
              host.appendChild(line);
            }
            card.appendChild(host);
            return { initialFocus: null, requestClose };
          },
          actions: [
            { id: "cancel", label: "取消", kind: "secondary" },
            { id: "confirm", label: "确认提交", kind: "primary" }
          ]
        });

        if (picked !== "confirm") {
          return abortDispatch({ reason: "ui_command_supply_confirm_cancelled" });
        }

        // Second formal action: same actionId, but with confirmation payload.
        return dispatch(actionId, {
          ...(payload && typeof payload === "object" ? payload : {}),
          supplySubmissionConfirm: {
            confirmed: true,
            channel,
            expectedTotalValue,
            entries: entries.map((row) => ({ itemId: row.itemId, qty: row.qty }))
          }
        }, options);
      }
    }
    
    // ========== 4. Commit（执行 Plan）==========
    pushActionDiffTrace({
      stage: "commit:start",
      actionId: traceCtx.actionId,
      prevState: getUiActionStateSnapshot(gameState),
      nextState: uiStateProjectedAfterResolve,
      resolvedRoute: {
        pageType: resolvedRoute.pageType,
        overlayType: resolvedRoute.overlayType,
        hostType: resolvedRoute.hostType,
        mapId: resolvedRoute.mapId
      }
    });
    traceCtx.commitEntered = true;
    pushOpenCallchainTrace({
      source: "commit:start",
      actionId: traceCtx.actionId,
      actionType: traceCtx.actionType,
      prevState: getUiActionStateSnapshot(gameState),
      nextState: uiStateProjectedAfterResolve,
      resolveEntered: true,
      resolveExited: true,
      resolveResultType: typeof plan,
      resolveResultKeys: plan && typeof plan === "object" ? Object.keys(plan) : [],
      commitEntered: true,
      commitExited: false
    });
    const { ok, report } = await commit(plan, gameState);
    traceCtx.commitExited = true;
    traceCtx.stage = "commit_end";

    // Post-commit supply submission feedback (UI layer only).
    if (!suppressDialogs) {
      const supplyResults = Array.isArray(report?.supplySubmission?.results) ? report.supplySubmission.results : [];
      const lastOk = supplyResults.findLast ? supplyResults.findLast((row) => row?.ok === true) : (supplyResults.slice().reverse().find((row) => row?.ok === true) || null);
      if (lastOk && Number.isFinite(Number(lastOk.totalValue))) {
        const totalValue = Math.max(0, Math.trunc(Number(lastOk.totalValue || 0)));
        await showNoticeDialog({
          title: "伊森",
          message: `伊森把东西收进物资箱，翻了下登记板。\n“行，这些还能派上用场。”\n你获得了 ${totalValue}。`,
          actions: [{ id: "ok", label: "返回", kind: "primary" }]
        });
      }

      const wildernessBlockedDialogs = collectWildernessMoveBlockedNoticeDialogs(report);
      for (const dlg of wildernessBlockedDialogs) {
        const actions = Array.isArray(dlg.actions) && dlg.actions.length > 0
          ? dlg.actions.map((a) => ({
              id: String(a.id || "stay").trim() || "stay",
              label: String(a.label || "停下").trim() || "停下",
              kind: String(a.id || "").trim() === "stay" ? "primary" : "secondary"
            }))
          : [{ id: "stay", label: "停下", kind: "primary" }];
        await showNoticeDialog({
          title: dlg.title,
          message: dlg.message,
          actions
        });
      }
    }

    pushLoadFreezeTrace({
      stage: "commit_end",
      actionId: traceCtx.actionId,
      ok: !!ok,
      mapId: String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || ""),
      uiPage: String(gameState?.ui?.page || ""),
      pageType: currentPageTypeFromState(gameState),
      commitDurationMs: Number(report?.durationMs || 0)
    });
    const routeAfterCommit = getUiRouteSnapshot(gameState);
    const transientRuntimeClearReason = resolveTransientRuntimeClearReason(traceCtx.actionId, routePrev, routeAfterCommit);
    if (transientRuntimeClearReason) {
      clearTransientRuntime(transientRuntimeClearReason);
      clearRecordsAttention();
    }
    if (shouldClearToastMessageLedger(traceCtx.actionId)) {
      clearToastMessageLedger();
    }
    const committedRoute = resolveUiSurface(gameState, {
      source: "commit_end",
      actionId: traceCtx.actionId,
      prev: routePrev,
      next: routeAfterCommit
    });
    pushUiRouteTrace({
      actionId: traceCtx.actionId,
      source: "commit_end",
      prevUiPage: routePrev.uiPage,
      nextUiPage: routeAfterCommit.uiPage,
      prevUiOverlay: routePrev.uiOverlay,
      nextUiOverlay: routeAfterCommit.uiOverlay,
      prevCurrentMapId: routePrev.currentMapId,
      nextCurrentMapId: routeAfterCommit.currentMapId,
      prevCurrentSceneId: routePrev.currentSceneId,
      nextCurrentSceneId: routeAfterCommit.currentSceneId,
      resolvedPageType: committedRoute.pageType,
      resolvedOverlayType: committedRoute.overlayType,
      renderHost: committedRoute.hostType,
      violationCode: committedRoute.violations.length > 0 ? "route_contract_violation" : null,
      errorMessage: committedRoute.violations.length > 0 ? committedRoute.violations.join(",") : null
    });
    const uiStateAfterCommit = getUiActionStateSnapshot(gameState);
    const canonicalDeltaAfterCommit = didCanonicalUiDeltaOccur(uiStatePrev, uiStateAfterCommit);
    let commitViolationCode = committedRoute.violations.length > 0 ? "route_contract_violation" : null;
    let commitErrorMessage = committedRoute.violations.length > 0 ? committedRoute.violations.join(",") : null;
    if (!commitViolationCode && isUiOpenAction(traceCtx.actionId) && !canonicalDeltaAfterCommit) {
      commitViolationCode = "UI_ACTION_NO_CANONICAL_DELTA";
      commitErrorMessage = "ui_*_open resolved but canonical ui route did not change after commit";
      pushOpenCallchainTrace({
        source: "UI_ACTION_NO_CANONICAL_DELTA",
        actionId: traceCtx.actionId,
        actionType: traceCtx.actionType,
        prevState: uiStatePrev,
        nextState: uiStateAfterCommit,
        resolveEntered: true,
        resolveExited: true,
        resolveResultType: typeof plan,
        resolveResultKeys: plan && typeof plan === "object" ? Object.keys(plan) : [],
        commitEntered: true,
        commitExited: true,
        canonicalSelectorResult: {
          pageType: committedRoute.pageType,
          overlayType: committedRoute.overlayType,
          hostType: committedRoute.hostType
        },
        violationCode: "UI_ACTION_NO_CANONICAL_DELTA",
        errorMessage: commitErrorMessage
      });
    }
    pushActionDiffTrace({
      stage: "commit:end",
      actionId: traceCtx.actionId,
      prevState: uiStatePrev,
      nextState: uiStateAfterCommit,
      resolvedRoute: {
        pageType: committedRoute.pageType,
        overlayType: committedRoute.overlayType,
        hostType: committedRoute.hostType,
        mapId: committedRoute.mapId
      },
      violationCode: commitViolationCode,
      errorMessage: commitErrorMessage
    });
    pushOverlayLifecycleTrace({
      source: "commit:end",
      actionId: traceCtx.actionId,
      prevRoute: routePrev,
      nextRoute: routeAfterCommit,
      resolvedRoute: committedRoute,
      violationCode: committedRoute.violations.length > 0 ? "overlay_contract_violation" : null,
      errorMessage: committedRoute.violations.length > 0 ? committedRoute.violations.join(",") : null
    });
    pushOpenCallchainTrace({
      source: "commit:end",
      actionId: traceCtx.actionId,
      actionType: traceCtx.actionType,
      prevState: uiStatePrev,
      nextState: uiStateAfterCommit,
      resolveEntered: true,
      resolveExited: true,
      resolveResultType: typeof plan,
      resolveResultKeys: plan && typeof plan === "object" ? Object.keys(plan) : [],
      commitEntered: true,
      commitExited: true,
      canonicalSelectorResult: {
        pageType: committedRoute.pageType,
        overlayType: committedRoute.overlayType,
        hostType: committedRoute.hostType
      },
      violationCode: commitViolationCode,
      errorMessage: commitErrorMessage
    });
    if (!ok) {
      console.error(`[Dispatch] Commit 失败:`, report);
      // 失败也尽量给用户反馈
      if (!suppressFeedback && !suppressDialogs) {
        showFeedbackFromReport(actionId, report, { includeGeneric: false });
      }
      return abortDispatch({ report, reason: "commit_failed" });
    }

    const afterCommitMapId = String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || "");

    const govBusinessAfterCommit = getGovHallBusinessState(gameState);
    const shouldForceExitGovHall = wasInGovHallAtDispatchStart
      && isGovHallMapId(afterCommitMapId)
      && govBusinessAtStart.isOpen
      && !govBusinessAfterCommit.isOpen;

    if (shouldForceExitGovHall) {
      const moved = await forceReturnFromGovHallToStreet();
      if (moved) {
        govHallForcedExitApplied = true;
        if (report?.after && typeof report.after === "object") {
          report.after.mapId = GOV_HALL_RETURN_STREET_MAP_ID;
        }
        if (Array.isArray(report?.notes)) {
          report.notes.push("GovHall: forced_exit_after_business_hours");
        }
      }
    }

    if (uiRuntime) {
      report.uiRuntime = uiRuntime;
    }

    syncSidebarMoneyDeltaFxFromReport(actionId, report);
  publishAchievementSignalsFromReport(actionId, report);
    syncInlineWorkPresentationFromReport(actionId, report);

    syncInventoryGainHighlights(gameState);
    
    // ========== 5. 打印结构化 Report ==========
    if (settings.showInternalLogs) {
      printReport(report);
    }

    // ========== 6. 触发渲染 ==========
    const advanceStop = report.sysCalls.find((row) => row?.call?.type === "ADVANCE_TIME")?.result?.blockedBy || null;
    const advanceStopId = String(advanceStop?.blockerId || "").trim();
    if (advanceStopId === REAR_ZONE_LODGING_CHECKOUT_BLOCKER_ID) {
      const checkoutMapId = String(advanceStop?.targetMapId || REAR_ZONE_LODGING_CHECKOUT_DIALOGUE_MAP_ID).trim()
        || REAR_ZONE_LODGING_CHECKOUT_DIALOGUE_MAP_ID;
      const moved = await forceLoadMapById(checkoutMapId, "dispatch:rearZoneLodgingCheckout");
      if (moved && report?.after && typeof report.after === "object") {
        report.after.mapId = checkoutMapId;
      }
    }

    if (!suppressRender) {
      render();
      traceCtx.stage = "render_end";
      pushLoadFreezeTrace({
        stage: "render_end",
        actionId: traceCtx.actionId,
        mapId: String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || ""),
        uiPage: String(gameState?.ui?.page || ""),
        pageType: currentPageTypeFromState(gameState)
      });
      const routeAfterRender = getUiRouteSnapshot(gameState);
      const renderedRoute = resolveUiSurface(gameState, {
        source: "render_end",
        actionId: traceCtx.actionId,
        prev: routePrev,
        next: routeAfterRender
      });
      pushUiRouteTrace({
        actionId: traceCtx.actionId,
        source: "render_end",
        prevUiPage: routePrev.uiPage,
        nextUiPage: routeAfterRender.uiPage,
        prevUiOverlay: routePrev.uiOverlay,
        nextUiOverlay: routeAfterRender.uiOverlay,
        prevCurrentMapId: routePrev.currentMapId,
        nextCurrentMapId: routeAfterRender.currentMapId,
        prevCurrentSceneId: routePrev.currentSceneId,
        nextCurrentSceneId: routeAfterRender.currentSceneId,
        resolvedPageType: renderedRoute.pageType,
        resolvedOverlayType: renderedRoute.overlayType,
        renderHost: renderedRoute.hostType,
        violationCode: renderedRoute.violations.length > 0 ? "route_contract_violation" : null,
        errorMessage: renderedRoute.violations.length > 0 ? renderedRoute.violations.join(",") : null
      });
    }

    syncUiCommandsFromReport(report);
  emitCurrentMapEntrySignals(routePrev, getUiRouteSnapshot(gameState));

    const afterMapId = String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || "");
    const afterUiPage = String(gameState?.ui?.page || "");
    const afterPageType = currentPageTypeFromState(gameState);
    if (
      traceCtx.beforeMapId !== afterMapId
      || traceCtx.beforeUiPage !== afterUiPage
      || traceCtx.beforePageType !== afterPageType
    ) {
      pushLoadFreezeTrace({
        stage: "page_switch",
        actionId: traceCtx.actionId,
        beforeMapId: traceCtx.beforeMapId,
        afterMapId,
        beforeUiPage: traceCtx.beforeUiPage,
        afterUiPage,
        beforePageType: traceCtx.beforePageType,
        afterPageType
      });
    }

    // ========== 6.1 用户反馈（alert）==========
    // 关键约束：读档/转场必须先完成主视图 commit，再显示反馈，避免成功弹窗挂在旧菜单壳子上。
    if (actionId === "ui_records_open") {
      clearRecordsAttention();
    } else {
      notifyNewRecordAttention(report);
      syncRecordsAttentionState();
    }

    const margSceneTransitionHandled = await maybeHandleMargSceneTransitionBlocker(report, {
      suppressRender
    });
    const timedLocationClosureHandled = !margSceneTransitionHandled && await maybeHandleTimedLocationClosure(report, {
      suppressDialogs,
      suppressRender
    });

    const steelcrossMarketClosingHandled = !timedLocationClosureHandled && await maybeHandleSteelcrossMarketClosing(report, {
      suppressDialogs,
      suppressRender
    });

    if (!timedLocationClosureHandled && !steelcrossMarketClosingHandled && !suppressFeedback && !suppressDialogs) {
      showFeedbackFromReport(actionId, report);
    }

    if (govHallForcedExitApplied && !suppressFeedback && !suppressDialogs) {
      showNoticeDialog({
        title: "保安",
        message: "不好意思，我们已经下班了。",
        actions: [{ id: "ok", label: "返回", kind: "primary" }]
      });
    }

    // ========== 7. 自动存档检查 ==========
    checkAndAutoSave();

    if (theseusEndingTransitionPlayed) {
      await playTheseusEndingTransitionOut();
      theseusEndingTransitionPlayed = false;
    }

    if (shouldQueueSteelcrossMarketRecordUnlock(report, actionId)) {
      const triggerActionId = String(report?.action?.id || actionId || "").trim() || null;
      const triggerSceneId = String(gameState?.currentScene?.id || gameState?.currentSceneId || "").trim() || null;
      setTimeout(() => {
        void dispatch(
          STEELCROSS_MARKET_RECORD_ACTION_ID,
          {
            triggerContext: {
              mapId: STEELCROSS_MARKET_ENTRY_MAP_ID,
              actionId: triggerActionId,
              sceneId: triggerSceneId,
              source: "route_enter"
            }
          },
          {
            systemAction: true,
            suppressRender,
            suppressFeedback,
            suppressDialogs
          }
        );
      }, 0);
    }
    
    return makeReturn(true, { report, reason: "ok" });
    
  } catch (error) {
    if (theseusEndingTransitionPlayed) {
      THESEUS_ENDING_TRANSITION_RUNTIME_OWNER.cancel("theseus_ending_transition_exception");
      theseusEndingTransitionPlayed = false;
    }
    console.error(`[Dispatch] 处理失败:`, actionId, error);
    return abortDispatch({ reason: "exception", error: error?.message || String(error) });
  } finally {
    if (isUiOpenAction(traceCtx.actionId) && traceCtx.resolveExited && !traceCtx.commitEntered) {
      pushOpenCallchainTrace({
        source: "UI_GLOBAL_ACTION_NO_COMMIT",
        actionId: traceCtx.actionId,
        actionType: traceCtx.actionType,
        prevState: uiStatePrev,
        nextState: getUiActionStateSnapshot(gameState),
        resolveEntered: traceCtx.resolveEntered,
        resolveExited: traceCtx.resolveExited,
        commitEntered: traceCtx.commitEntered,
        commitExited: traceCtx.commitExited,
        violationCode: "UI_GLOBAL_ACTION_NO_COMMIT",
        errorMessage: "resolve completed but commit was not entered"
      });
    }
    clearTimeout(freezeWatchdog);
    pushLoadFreezeTrace({
      stage: "dispatch_end",
      actionId: traceCtx.actionId,
      elapsedMs: Date.now() - traceCtx.startedAtMs,
      mapId: String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || ""),
      uiPage: String(gameState?.ui?.page || ""),
      pageType: currentPageTypeFromState(gameState)
    });
    isDispatching = false;
  }
}

function routeActionScopedFeedbackFromReport(actionId, report) {
  if (!report) return;
  if (isWorkPresentationAction(actionId)) return;
  if (isJobSessionUiAction(actionId)) return;
  if (isInquirySessionUiAction(actionId)) return;

  if (!Array.isArray(report.sysCalls)) return;

  const showNotice = (message, title = "通知", options = {}) => {
    showNoticeDialog({
      title,
      message,
      illustration: options?.illustration || null,
      actions: Array.isArray(options?.actions)
        ? options.actions
        : [{ id: "ok", label: "返回", kind: "primary" }],
      closeTransition: String(options?.closeTransition || ""),
      visualVariant: String(options?.visualVariant || ""),
      contentModel: options?.contentModel && typeof options.contentModel === "object"
        ? { ...options.contentModel }
        : null,
      forceAnimation: !!options?.forceAnimation,
      nonModal: !!options?.nonModal,
      autoCloseMs: Number(options?.autoCloseMs || 0)
    });
  };

  const showRejectNotice = (message, title = "通知") => {
    showNotice(message, title);
  };

  const formalUiFeedback = report?.uiFeedback && typeof report.uiFeedback === "object"
    ? report.uiFeedback
    : null;
  if (formalUiFeedback) {
    const message = String(formalUiFeedback.message || "").trim();
    if (message) {
      showNotice(message, String(formalUiFeedback.title || "通知").trim() || "通知", {
        illustration: formalUiFeedback.illustrationKey
          ? getIllustrationAssetByKey(String(formalUiFeedback.illustrationKey || ""))
          : null,
        visualVariant: String(formalUiFeedback.variant || "").trim(),
        contentModel: formalUiFeedback.model && typeof formalUiFeedback.model === "object"
          ? { ...formalUiFeedback.model }
          : null
      });
      return;
    }
  }

  const runtimeActionFeedback = String(report?.uiRuntime?.actionFeedback || "").trim();
  const runtimeActionFeedbackModel = report?.uiRuntime?.actionFeedbackModel
    && typeof report.uiRuntime.actionFeedbackModel === "object"
    ? report.uiRuntime.actionFeedbackModel
    : null;
  const runtimeActionIllustrationKey = String(report?.uiRuntime?.actionIllustrationKey || "").trim();
  const runtimeIllustration = runtimeActionIllustrationKey
    ? getIllustrationAssetByKey(runtimeActionIllustrationKey)
    : null;
  const currentMapId = String(report?.after?.mapId || report?.before?.mapId || gameState.currentMapId || gameState.world?.currentMapId || "").trim();
  if (isSteelcrossMarketFamilyMapId(currentMapId) && shouldForceExitSteelcrossMarket(gameState)) {
    return;
  }
  const directRejection = report?.plan?.rejection && typeof report.plan.rejection === "object"
    ? report.plan.rejection
    : (report?.rejection && typeof report.rejection === "object" ? report.rejection : null);
  const currentMap = gameState?.currentMap && String(gameState.currentMap?.id || "").trim() === currentMapId
    ? gameState.currentMap
    : null;
  const resolveRejectionUiFeedback = () => {
    if (!currentMap || !actionId) return null;
    if (isMapContentV2(currentMap)) {
      const rawInteraction = Array.isArray(currentMap?.interactions)
        ? currentMap.interactions.find((row) => String(row?.id || "").trim() === String(actionId || "").trim())
        : null;
      return rawInteraction ? buildInteractionUiFeedback(currentMapId, rawInteraction, currentMap) : null;
    }

    const rawAction = Array.isArray(currentMap?.actions)
      ? currentMap.actions.find((row) => String(row?.id || "").trim() === String(actionId || "").trim())
      : null;
    if (!rawAction) return null;

    const resolvedAction = buildRuntimeActionViewModel(currentMapId, rawAction, currentMap) || rawAction;
    const declarativeFeedback = rawAction?.ui?.feedback && typeof rawAction.ui.feedback === "object"
      ? rawAction.ui.feedback
      : {};
    const message = String(
      resolvedAction?.ui?.runtimeActionFeedback
      || declarativeFeedback.message
      || ""
    ).trim();
    if (!message) return null;

    return {
      title: String(
        declarativeFeedback.title
        || resolvedAction?.text
        || rawAction?.text
        || rawAction?.id
        || "通知"
      ).trim() || "通知",
      message,
      model: resolvedAction?.ui?.runtimeActionFeedbackModel && typeof resolvedAction.ui.runtimeActionFeedbackModel === "object"
        ? { ...resolvedAction.ui.runtimeActionFeedbackModel }
        : null,
      variant: String(declarativeFeedback.variant || "").trim() || null,
      illustrationKey: String(declarativeFeedback.illustrationKey || "").trim() || null
    };
  };
  const rejectionUiFeedback = resolveRejectionUiFeedback();
  if (directRejection && (directRejection.source === "requires" || directRejection.source === "disabledRequires") && rejectionUiFeedback?.message) {
    showNotice(rejectionUiFeedback.message, rejectionUiFeedback.title || "通知", {
      illustration: rejectionUiFeedback.illustrationKey
        ? getIllustrationAssetByKey(String(rejectionUiFeedback.illustrationKey || ""))
        : null,
      visualVariant: String(rejectionUiFeedback.variant || "").trim(),
      contentModel: rejectionUiFeedback.model && typeof rejectionUiFeedback.model === "object"
        ? { ...rejectionUiFeedback.model }
        : null
    });
    return;
  }
  const activeInquirySession = normalizeInquirySession(gameState?.ui?.inquirySession);
  const inquiryDefinitionBySource = getInquiryDefinitionBySourceActionId(actionId);

  const tv = getTimeView();
  const m = tv.minuteOfDay;
  const appliedEffects = Array.isArray(report?.effects?.applied) ? report.effects.applied : [];

  const getPushedLogLines = () => appliedEffects
    .filter((row) => row?.effect?.op === "push" && row?.effect?.path === "logLines")
    .map((row) => String(row?.effect?.value || "").trim())
    .filter(Boolean);

  const inRange = (start, end) => {
    if (start <= end) return m >= start && m <= end;
    return m >= start || m <= end;
  };

  const pickByTime = (items, fallback) => {
    for (const it of items) {
      if (inRange(it.start, it.end)) return it.text;
    }
    return fallback;
  };

  // report.sysCalls: [{ call: {type, params}, result: {...}, index }]
  const getSlotLabel = (slotId) => (slotId === "auto" ? "自动存档" : `槽位 ${slotId}`);

  const govHallWindowNoticeActionIds = new Set([
    "gov_c_window_view_bill",
    "gov_c_window_pay_bill"
  ]);

  if (typeof actionId === "string" && govHallWindowNoticeActionIds.has(actionId)) {
    const lines = getPushedLogLines();
    if (lines.length > 0) {
      const titleMap = {
        gov_c_window_view_bill: "窗口账单",
        gov_c_window_pay_bill: "窗口缴费"
      };
      showNotice(lines.join("\n"), titleMap[actionId] || "窗口业务");
      return;
    }
  }

  if (actionId === "menu_add_slot") {
    const entry = report.sysCalls.find(x => x?.call?.type === "ADD_SLOT");
    if (!entry) return;
    if (entry.result?.ok) {
      showNotice(`✅ 已新增槽位：槽位 ${entry.result.slotId}`, "存档");
    } else {
      showNotice(`❌ 新增槽位失败：${entry.result?.error || "未知错误"}`, "存档");
    }
    return;
  }

  if (typeof actionId === "string" && actionId.startsWith("menu_rename:")) {
    const entry = report.sysCalls.find(x => x?.call?.type === "RENAME_SLOT");
    if (!entry) return;
    if (entry.result?.ok) {
      showNotice(`✅ 重命名成功：${entry.result.displayName || "已更新"}`, "存档");
    } else {
      showNotice(`❌ 重命名失败：${entry.result?.error || "未知错误"}`, "存档");
    }
    return;
  }

  // Save
  if (typeof actionId === "string" && actionId.startsWith("save_to_slot_")) {
    const entry = report.sysCalls.find(x => x?.call?.type === "SAVE_GAME");
    if (!entry) return;
    if (entry.result?.ok) {
      showNotice(`✅ 保存成功！\n${getSlotLabel(entry.result.slotId)}`, "存档");
    } else {
      showNotice(`❌ 保存失败：${entry.result?.error || "未知错误"}`, "存档");
    }
    return;
  }

  if (typeof actionId === "string" && actionId.startsWith("menu_save:")) {
    const entry = report.sysCalls.find(x => x?.call?.type === "SAVE_GAME");
    if (!entry) return;
    if (entry.result?.ok) {
      showNotice(`✅ 保存成功！\n${getSlotLabel(entry.result.slotId)}`, "存档");
    } else {
      showNotice(`❌ 保存失败：${entry.result?.error || "未知错误"}`, "存档");
    }
    return;
  }

  // Load
  if (typeof actionId === "string" && actionId.startsWith("load_slot_")) {
      const entry = report.sysCalls.find(x => x?.call?.type === "LOAD_SLOT");
    if (!entry) return;
    if (entry.result?.ok) {
      let msg = `✅ 加载成功！\n${getSlotLabel(entry.result.slotId)}`;
      if (entry.result.usedBackup) msg += "\n⚠️ 主存档损坏，已从备份恢复";
      if (entry.result.mapId) msg += `\n📍 场景：${entry.result.mapId}`;
      showNotice(msg, "读档", { closeTransition: "load-success", visualVariant: "load-success", forceAnimation: true, nonModal: true, autoCloseMs: 1600 });
    } else {
      // 为空的自动存档给更友好提示
      if (entry.result?.slotId === "auto" && String(entry.result?.error || "").includes("存档不存在")) {
        showNotice(`❌ 自动存档为空\n\n游戏会在每个新的一天自动保存。\n请先游戏至少一天后再尝试加载。`, "读档");
      } else {
        showNotice(`❌ 加载失败：${entry.result?.error || "未知错误"}`, "读档");
      }
    }
    return;
  }

  if (typeof actionId === "string" && actionId.startsWith("menu_load:")) {
    const entry = report.sysCalls.find(x => x?.call?.type === "LOAD_SLOT");
      if (!entry) return;
    if (entry.result?.ok) {
      let msg = `✅ 加载成功！\n${getSlotLabel(entry.result.slotId)}`;
      if (entry.result.usedBackup) msg += "\n⚠️ 主存档损坏，已从备份恢复";
      if (entry.result.mapId) msg += `\n📍 场景：${entry.result.mapId}`;
      showNotice(msg, "读档", { closeTransition: "load-success", visualVariant: "load-success", forceAnimation: true, nonModal: true, autoCloseMs: 1600 });
    } else {
      showNotice(`❌ 加载失败：${entry.result?.error || "未知错误"}`, "读档");
    }
    return;
  }

  if (actionId === "menu_continue_auto") {
    const entry = report.sysCalls.find(x => x?.call?.type === "LOAD_SLOT");
      if (!entry) return;
    if (entry.result?.ok) {
      const msg = entry.result.mapId
        ? `✅ 已继续自动存档。\n📍 场景：${entry.result.mapId}`
        : "✅ 已继续自动存档。";
      showNotice(msg, "继续游戏");
    } else {
      showNotice("自动存档损坏或缺失，已跳转到读取存档页面。", "继续游戏");
    }
    return;
  }

  // Delete
  if (typeof actionId === "string" && actionId.startsWith("delete_slot_")) {
    const entry = report.sysCalls.find(x => x?.call?.type === "DELETE_SLOT");
    if (!entry) return;
    if (entry.result?.ok) {
      showNotice(`✅ 删除成功！\n${getSlotLabel(entry.result.slotId)} 已移除`, "存档");
    } else {
      showNotice(`❌ 删除失败：${entry.result?.error || "未知错误"}`, "存档");
    }
    return;
  }

  if (typeof actionId === "string" && actionId.startsWith("menu_delete:")) {
    const entry = report.sysCalls.find(x => x?.call?.type === "DELETE_SLOT");
    if (!entry) return;
    if (entry.result?.ok) {
      showNotice(`✅ 删除成功！\n${getSlotLabel(entry.result.slotId)} 已移除`, "存档");
    } else {
      showNotice(`❌ 删除失败：${entry.result?.error || "未知错误"}`, "存档");
    }
    return;
  }

  if (typeof actionId === "string" && actionId.startsWith("menu_export:")) {
    const entry = report.sysCalls.find(x => x?.call?.type === "EXPORT_SLOT");
    if (!entry) return;
    if (!entry.result?.ok) {
      showNotice(`❌ 导出失败：${entry.result?.error || "未知错误"}`, "导出存档");
      return;
    }
    const text = String(entry.result?.jsonString || "");
    if (!text) {
      showNotice("❌ 导出失败：空数据", "导出存档");
      return;
    }

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => showNotice(`✅ 已复制 ${getSlotLabel(entry.result.slotId)} 到剪贴板。`, "导出存档"))
        .catch(() => showNotice("导出成功，但复制到剪贴板失败。", "导出存档"));
    } else {
      showNotice("导出成功，但当前环境不支持自动复制。", "导出存档");
    }
    return;
  }

  if (typeof actionId === "string" && actionId.startsWith("menu_import:")) {
    const entry = report.sysCalls.find(x => x?.call?.type === "IMPORT_SLOT");
    if (!entry) return;
    if (entry.result?.ok) {
      showNotice(`✅ 导入成功：${getSlotLabel(entry.result.slotId)}`, "导入存档");
    } else {
      showNotice(`❌ 导入失败：${entry.result?.error || "未知错误"}`, "导入存档");
    }
    return;
  }

  if (typeof actionId === "string" && (actionId.startsWith("settings_set:") || actionId.startsWith("settings_toggle:") || actionId === "settings_reset_defaults")) {
    const entry = report.sysCalls.find(x => x?.call?.type === "WRITE_SETTINGS");
    if (!entry) return;
    if (entry.result?.ok && actionId === "settings_reset_defaults") {
      showNotice("已恢复默认设置。", "设置");
    } else if (!entry.result?.ok) {
      showNotice(`❌ 设置保存失败：${entry.result?.error || "未知错误"}`, "设置");
    }
    return;
  }

  if (isIndustrialFrontlineMapId(currentMapId)) {
    const industrialFeedbackText = runtimeActionFeedback || getPushedLogLines().join("\n");
    if (inquiryDefinitionBySource) {
      const inquiryOpenedForCurrentAction = activeInquirySession
        && activeInquirySession.status === INQUIRY_SESSION_STATUS.ACTIVE
        && String(activeInquirySession.sourceActionId || "") === String(actionId || "")
        && String(activeInquirySession.sourceMapId || "") === currentMapId;

      if (inquiryOpenedForCurrentAction) {
        return;
      }

      if (directRejection && industrialFeedbackText) {
        showRejectNotice(industrialFeedbackText, "询问");
        return;
      }
    }

    const isAdvanceOnlyAction = report.sysCalls.length > 0
      && report.sysCalls.every((row) => String(row?.call?.type || "") === "ADVANCE_TIME");
    if (!directRejection && isAdvanceOnlyAction && industrialFeedbackText) {
      showNotice(industrialFeedbackText, String(gameState.currentMap?.name || "观察"), {
        illustration: runtimeIllustration
      });
      return;
    }
  }

  // Clinic: 观察位到点阻断反馈
  const adv = report.sysCalls.find(x => x?.call?.type === "ADVANCE_TIME");
  if (adv?.result?.blockedBy && (actionId === "obs_stay_30m" || actionId === "obs_stay_12h" || actionId === "sidebar_wait_confirm")) {
    const blockerId = String(adv.result.blockedBy.blockerId || "");
    if (blockerId.includes("obs_handover") || blockerId.includes("hard_stop")) {
      showRejectNotice("已到 06:00 白班接管节点。\n请先选择“转住院”或“不住院”，再继续其他操作。", "白班接管");
      return;
    }
  }

  // Clinic: 长椅交互反馈（按六时段）
  if (actionId === "bench_wait_lobby") {
    showNotice(pickByTime([
      {
        start: 360,
        end: 659,
        text: "你坐在铁长椅上，凉意隔着衣物透上来。门口偶尔开合，带进一阵咸湿的冷风。\n\n环顾四周：窗口前有一小段队伍；墙上公告贴得密；长椅这边的人多低头不说话。"
      },
      {
        start: 660,
        end: 839,
        text: "你坐下后，前厅更亮，但冷感没减。窗口前人更多，推进速度仍慢。\n\n环顾四周：队伍里有人攥着纸反复看；接待台上文件堆得高；窗外海湾灰白，近岸冰缘清晰。"
      },
      {
        start: 840,
        end: 1079,
        text: "你坐在长椅上，光线开始下滑，前厅声音更少。工作人员动作慢了，队伍时停时走。\n\n环顾四周：长椅上坐满了等的人；有人把背包放在脚边；走廊口偶尔有人被叫走。"
      },
      {
        start: 1080,
        end: 1259,
        text: "灯光被调暗，冷白灯把地面照得发硬。长椅空了不少，只剩零星几个人。\n\n环顾四周：窗口还开着但没人排队；夜班人员低头填表；窗外海面变黑，远处港口灯偶尔闪一下。"
      },
      {
        start: 1260,
        end: 1439,
        text: "前厅只剩必要照明，空气更冷。你坐下后能听见纸张翻动和笔尖划过的声音。\n\n环顾四周：长椅大多空着；文件摊在台面上没收；门关得很紧，外面的风声被隔住。"
      },
      {
        start: 0,
        end: 359,
        text: "前厅几乎没人，你坐下后更显空。灯还亮着，但亮度很低。\n\n环顾四周：窗口亮着却很少有人靠近；长椅一排排空着；窗外只有黑和偶尔的反光。"
      }
    ], "你在前厅长椅上短暂停留。"), "前厅长椅");
    return;
  }

  if (actionId === "clinic_rooftop_view_far") {
    showNotice(runtimeActionFeedback || "", "远方", {
      illustration: runtimeIllustration
    });
    return;
  }

  if (actionId === "clinic_rooftop_warning_light_test_init") {
    showNotice(runtimeActionFeedback || "", "屋顶警示灯");
    return;
  }

  if (actionId === "clinic_rooftop_warning_light_test_repeat") {
    showNotice(runtimeActionFeedback || "", "屋顶警示灯");
    return;
  }

  if (actionId === "bench_wait_2f") {
    showNotice(pickByTime([
      {
        start: 360,
        end: 1079,
        text: "你在铁长椅上坐下，冷意隔着衣物透上来。走廊里有人来回走两步又停下，盯着门牌和手里的纸。诊室门时不时开一下，里面的声音很短，听不清内容。\n\n环顾四周：走廊两侧都是诊室门；候诊区有人站着等号；转角处贴着分诊指示和门牌编号表。"
      },
      {
        start: 1080,
        end: 1439,
        text: "你坐在铁长椅上，冷得更明显。走廊里几乎没人走动，诊室门关着，只有远处偶尔传来轮子声。\n\n环顾四周：门牌编号从近到远排开；候诊区空着；分诊指示牌在灯下反光。"
      },
      {
        start: 0,
        end: 359,
        text: "你坐在铁长椅上，冷得更明显。走廊里几乎没人走动，诊室门关着，只有远处偶尔传来轮子声。\n\n环顾四周：门牌编号从近到远排开；候诊区空着；分诊指示牌在灯下反光。"
      }
    ], "你在二楼候诊区短暂停留。"), "二楼候诊区长椅");
    return;
  }

  if (actionId === "ward_corridor_bench") {
    showNotice(pickByTime([
      {
        start: 360,
        end: 1079,
        text: "你在走廊的铁长椅上坐下，冷意隔着衣物透上来。病房里的人声断断续续，护士推车来回穿行。\n\n环顾四周：床位号沿墙排开；护士站在转角；门口贴着出入与缴费提示。"
      },
      {
        start: 1080,
        end: 1439,
        text: "你坐在铁长椅上，走廊更冷也更空。帘子后大多没动静，只有远处偶尔响一下推车轮子声。\n\n环顾四周：护士站灯还亮；床头灯零星点着；门口提示牌在灯下反光。"
      },
      {
        start: 0,
        end: 359,
        text: "你坐在铁长椅上，走廊更冷也更空。帘子后大多没动静，只有远处偶尔响一下推车轮子声。\n\n环顾四周：护士站灯还亮；床头灯零星点着；门口提示牌在灯下反光。"
      }
    ], "你在病区走廊长椅短暂停留。"), "病区走廊长椅");
    return;
  }

  if (actionId === "check_reflector_number") {
    showNotice(runtimeActionFeedback || pickByTime([
      {
        start: 360,
        end: 1079,
        text: "你贴近路侧护栏，抬手把雪粒拂开反光杆。杆身编号是旧喷码：W2-C-17，底部又补了一层新漆，边缘还留着滴痕。\n\n环顾四周：诊所门前脚印杂乱；风把纸屑推成一条线；远处转角公告墙有人停了两秒又快步离开。"
      },
      {
        start: 1080,
        end: 1439,
        text: "你俯身看反光杆，手电在白雾里打出一小圈光。编号 W2-C-17 还能辨认，旁边钉过旧标牌的孔位已经锈黑。\n\n环顾四周：诊所外墙结了薄霜；风声沿街面回卷；路面只剩断续脚印和车辙硬边。"
      },
      {
        start: 0,
        end: 359,
        text: "你俯身看反光杆，手电在白雾里打出一小圈光。编号 W2-C-17 还能辨认，旁边钉过旧标牌的孔位已经锈黑。\n\n环顾四周：诊所外墙结了薄霜；风声沿街面回卷；路面只剩断续脚印和车辙硬边。"
      }
    ], "你确认了反光杆编号。"), "反光杆编号");
    return;
  }

  if (actionId === "shelter_by_dike") {
    showNotice(runtimeActionFeedback || pickByTime([
      {
        start: 360,
        end: 1079,
        text: "你退到堤侧背风位，风压立刻小了半截。衣摆不再被横向拉扯，呼吸也顺了些。\n\n环顾四周：从这个角度能看到诊所门口进出节奏；转角公告墙偶尔有人驻足；堤面结冰处被鞋底磨成灰白。"
      },
      {
        start: 1080,
        end: 1439,
        text: "你贴着堤侧停了一会儿，风从墙脊掠过去，背后终于不再直灌冷气。手指回暖很慢，但颤抖停了。\n\n环顾四周：街口灯把雪粉照成斜线；诊所门口只剩零星人影；远处围栏边的黄黑警示带拍打作响。"
      },
      {
        start: 0,
        end: 359,
        text: "你贴着堤侧停了一会儿，风从墙脊掠过去，背后终于不再直灌冷气。手指回暖很慢，但颤抖停了。\n\n环顾四周：街口灯把雪粉照成斜线；诊所门口只剩零星人影；远处围栏边的黄黑警示带拍打作响。"
      }
    ], "你在背风处短暂停留。"), "背侧避风");
    return;
  }

  if (actionId === "read_notice_wall_day" || actionId === "read_notice_wall_night") {
    const fallbackText = actionId === "read_notice_wall_day"
      ? "你靠近公告墙逐条读过去。最上层是当日通告：\n- 诊所窗口受理以分诊号为准；\n- 站前分流口 10:00 后改单向通行；\n- 工区段间歇封控，听从围栏引导。\n\n环顾四周：新旧纸张叠贴，边角被风掀起；导向牌箭头指向站前与工区；地面盐粒和雪泥混成浅灰带。"
      : "你把手电压低，公告墙上只照出一块一块潮斑。夜间补贴条写着：\n- 夜段仅保留主通行线；\n- 施工分流口改为人工放行；\n- 临时检修请避开围栏内侧。\n\n环顾四周：纸页边缘卷曲发硬；钉点处有锈色水痕；风一阵一阵把整面公告墙拍得轻响。";
    showNotice(runtimeActionFeedback || fallbackText, "公告墙");
    return;
  }

  if (actionId === "front_hall_check_notice_board") {
    showNotice(
      runtimeActionFeedback || "【前廊通行】\n请勿在门斗内停留闲谈\n湿衣、湿手套、工具袋不得挂靠墙面\n——值守处",
      "前廊告示板",
      {
        visualVariant: "front-hall-board",
        contentModel: runtimeActionFeedbackModel
      }
    );
    return;
  }

  if (actionId === "check_signage") {
    showNotice(runtimeActionFeedback || "你顺着导向牌看了一遍路线：左侧箭头指向站前交换区，右侧是工区分流段，回诊所要沿原路退回一个街口。牌面覆了薄霜，但关键字仍清楚。\n\n环顾四周：转角视野被围栏切成两段；公告墙前有人停下拍照留档；路边反光标识在风雪里断续闪一下。", "导向牌");
    return;
  }

  if (actionId === "inspect_ground_grit") {
    showNotice(runtimeActionFeedback || "你蹲下检查地面。雪泥里掺着粗盐和碎砂，靠墙一侧摩擦还行，中央通行线已经被踩成硬亮冰皮。\n\n环顾四周：鞋印方向大多朝站前；围栏底部有被拖拽过的浅沟；风把细雪重新扫回刚清出的边缘。", "地面检查");
    return;
  }

  if (actionId === "observe_split_flow") {
    showNotice(runtimeActionFeedback || "你在围栏旁观察分流口。人流被导向成两股：一股直行去站前，一股绕行去工区外沿。放行节奏并不稳定，偶尔会在围栏口形成短堵。\n\n环顾四周：警示带与金属围栏不断抖动；有人在口子前确认方向后才继续；地面有明显回头脚印，说明误走率不低。", "围栏分流口");
    return;
  }

  // Clinic: 失败/阻断提示，避免“无反馈”
  if (actionId === "night_emergency_reject") {
    showRejectNotice(
      runtimeActionFeedback || "夜里只受理急诊。你目前可自行行动，护士拒绝受理。\n请白班再办理住院流程。",
      "受理失败"
    );
    return;
  }

  if (actionId === "apply_treatment_not_needed") {
    showRejectNotice(runtimeActionFeedback || "护士看了你一眼：你当前状态不需要住院治疗，请勿占用床位。", "未通过");
    return;
  }

  if (actionId === "apply_treatment_reject") {
    showRejectNotice("你暂不办理住院。护士将表格收回：需要时可随时再来窗口申请。", "已取消");
    return;
  }

  if (actionId === "obs_try_leave") {
    showRejectNotice("夜里只留观，明早白班接管后再决定转住院或离开。", "暂不可离开");
    return;
  }

  if (actionId === "ward_leave_blocked") {
    showRejectNotice("你往门口走，护士抬头：先办出院。\n未办理出院时不可离开病房区。", "离开受限");
    return;
  }

  if (actionId === "ward_bed_24h") {
    showNotice("你重新躺回床位，住院继续，持续了一天。\n恢复 20 HP，住院费用 +200。", "住院推进");
    return;
  }

  if (actionId === "clinic_door_blocked") {
    showRejectNotice("医生：不是安排来的就别进来，别打扰病人休息。", "进入受限");
    return;
  }

  // Clinic: 账单/住院反馈
  const clinicStatusActions = new Set([
    "bill_query_day",
    "ward_query_status"
  ]);

  if (clinicStatusActions.has(actionId)) {
    const after = report.after || {};
    const hp = Number(after.hp ?? 0);
    const obs = Number(after.obsBillCents ?? 0);
    const ward = Number(after.wardBillCents ?? 0);
    const total = Number(after.totalBillCents ?? (obs + ward));
    const money = Number(after.money ?? 0);
    const needDays = Math.max(0, Math.ceil((80 - hp) / 20));
    const leadIn = runtimeActionFeedback ? `${runtimeActionFeedback}\n\n` : "";
    showNotice(
      `${leadIn}住院状态\n` +
      `HP：${hp.toFixed(0)}\n` +
      `预计还需住院：${needDays} 天（目标 80）\n` +
      `急诊账单：${formatBillCents(obs)}\n` +
      `住院账单：${formatBillCents(ward)}\n` +
      `待付总额：${formatBillCents(total)}\n` +
      `当前余额：${formatWalletMoney(money)}`,
      "住院状态"
    );
    return;
  }

  const clinicPayActions = new Set([
    "bill_pay_all_day",
    "bill_pay_200_day",
    "ward_pay_all",
    "ward_pay_200"
  ]);
  if (clinicPayActions.has(actionId)) {
    const before = report.before || {};
    const after = report.after || {};
    const paid = Number(before.totalBillCents ?? 0) - Number(after.totalBillCents ?? 0);
    if (paid > 0) {
      showNotice(
        `已缴费 ${formatWalletMoney(billCentsToWalletMoney(paid))}，剩余账单 ${formatBillCents(after.totalBillCents || 0)}`,
        "缴费成功"
      );
    } else {
      showNotice("未完成缴费（可能无账单或余额不足）。", "缴费失败");
    }
    return;
  }

  if (actionId === "ward_discharge_ready") {
    showNotice("已办理出院，可离开病房区。", "办理完成");
    return;
  }

  if (actionId === "ward_discharge_denied") {
    showRejectNotice("未达出院标准（HP < 80）。", "无法出院");
    return;
  }

  if (actionId === "obs_handover_to_ward") {
    showNotice("白班接管：已转入住院病房，后续按住院规则恢复与计费。", "白班接管");
    return;
  }

  if (actionId === "obs_handover_decline") {
    showNotice("白班接管：你选择不住院，已返回二楼大厅。", "白班接管");
    return;
  }

  if (actionId === "exit_to_winddyke_blocked") {
    showRejectNotice("你还没去窗口缴费，暂时不能直接离开。", "离开失败");
    return;
  }

  const notes = Array.isArray(report.notes) ? report.notes : [];
  const unknownActionFallback = notes.some((note) => String(note || "").includes("未识别的动作"));
  const legacyEntry = report.sysCalls.find((x) => x?.call?.type === "LEGACY");
  if (unknownActionFallback && legacyEntry) {
    showNotice(
      `检测到未识别操作：${String(actionId || "(空)")}\n\n系统已尝试兼容处理，但该操作可能无效。请检查按钮绑定或动作 ID。`,
      "操作未识别"
    );
  }
}

function routeGenericFeedbackFromReport(report) {
  if (!report) return;

  ensureProfilePageIntroGuideRegistration();
  ensureBayportClinicWardIntroGuideRegistration();
  ensureWinddykeThermalGuideRegistration();
  ensureCriticalStateNoticeRegistration();
  ensureDossierAttentionFeedbackRegistration();
  ensureRecordUnlockFeedbackRegistration();
  ensureDataDeltaToastRegistration();
  prepareProfilePageIntroGuideSessionFromCommitReport(report);
  prepareBayportClinicWardIntroGuideSessionFromCommitReport(report);
  prepareWinddykeThermalGuideSessionFromCommitReport(report);
  enqueueTransientIntents(getTransientIntentsFromCommitReport(report));

  if (!Array.isArray(report.sysCalls)) return;
  syncProfilePageIntroGuideSessionFromCommitReport(report);
  syncBayportClinicWardIntroGuideSessionFromCommitReport(report);
  syncWinddykeThermalGuideSessionFromCommitReport(report);
  ensureWinddykeThermalGuideForCurrentState();
}

function showFeedbackFromReport(actionId, report, options = {}) {
  if (!report) return;

  const includeGeneric = options?.includeGeneric !== false;
  const includeActionScoped = options?.includeActionScoped !== false;

  if (includeGeneric) {
    routeGenericFeedbackFromReport(report);
  }

  if (includeActionScoped) {
    routeActionScopedFeedbackFromReport(actionId, report);
  }
}

function syncUiCommandsFromReport(report) {
  const commands = Array.isArray(report?.uiCommands) ? report.uiCommands : [];
  for (const command of commands) {
    const type = String(command?.type || "").trim();
    if (type === "OPEN_NIGHT_KITCHEN_MENU") {
      const mapId = String(command?.mapId || gameState.currentMapId || gameState.currentMap?.id || "").trim();
      const mode = String(command?.mode || "dine").trim() || "dine";
      const catalog = resolveNightKitchenMenuCatalog(mapId, null);
      if (!catalog) continue;
      closeShopGoodsPanel();
      openNightKitchenMenu({ mapId, mode, catalog });
      continue;
    }
    if (type === "OPEN_SHOP_GOODS_PANEL") {
      const mapId = String(command?.mapId || gameState.currentMapId || gameState.currentMap?.id || "").trim();
      const catalog = resolveShopGoodsCatalog(mapId);
      if (!catalog) continue;
      closeNightKitchenMenu();
      openShopGoodsPanel({ mapId, catalog });
      continue;
    }
    if (type === "CLOSE_NIGHT_KITCHEN_MENU") {
      closeNightKitchenMenu();
      continue;
    }
    if (type === "CLOSE_SHOP_GOODS_PANEL") {
      closeShopGoodsPanel();
      continue;
    }
  }
}

function emitCurrentMapEntrySignals(prevRoute, nextRoute) {
  const prevMapId = String(prevRoute?.currentMapId || "").trim();
  const nextMapId = String(nextRoute?.currentMapId || gameState.currentMapId || gameState.currentMap?.id || "").trim();
  if (!nextMapId || prevMapId === nextMapId) return;

  const currentMap = gameState?.currentMap;
  if (!currentMap || String(currentMap.id || "").trim() !== nextMapId) return;

  const entrySignals = Array.isArray(currentMap.entrySignals) ? currentMap.entrySignals : [];
  for (const signal of entrySignals) {
    publishSignal(signal, {
      source: "map_entry",
      mapId: nextMapId
    });
  }
}

/**
 * 打印结构化 Report
 * 
 * 使用 console.group 折叠，方便调试
 * 
 * @param {Object} report - commit 返回的 report
 */
function printReport(report) {
  const { action, plan, before, after, sysCalls, effects, events, durationMs } = report;
  
  // 判断是否有实质性变化
  const hasChanges = 
    before.time !== after.time ||
    before.hp !== after.hp ||
    before.satiety !== after.satiety ||
    before.mapId !== after.mapId;
  
  // 有变化时使用 console.group，无变化时使用 groupCollapsed
  const groupFn = hasChanges ? console.group : console.groupCollapsed;
  
  groupFn.call(console, `🎬 Action: ${action.id} (${durationMs}ms)`);
  
  // Action 信息
  console.log("📋 Action:", {
    id: action.id,
    type: action.type,
    payload: action.payload,
    mapId: action.meta.mapId
  });
  
  // Plan 摘要
  console.log("🗺️ Plan:", {
    sysCalls: plan.sysCallsCount,
    effects: plan.effectsCount,
    notes: plan.notes
  });
  
  // Before/After 对比
  if (hasChanges) {
    console.log("📊 State Changes:");
    console.table([
      { field: "Time", before: `${before.time}min`, after: `${after.time}min` },
      { field: "Map", before: before.mapId, after: after.mapId },
      { field: "HP", before: before.hp.toFixed(1), after: after.hp.toFixed(1) },
      { field: "Satiety", before: before.satiety.toFixed(1), after: after.satiety.toFixed(1) },
      { field: "Stamina", before: before.stamina.toFixed(1), after: after.stamina.toFixed(1) },
      { field: "Fatigue", before: before.fatigue.toFixed(1), after: after.fatigue.toFixed(1) }
    ]);
  }
  
  // SystemCalls 结果
  if (sysCalls.length > 0) {
    console.group("🔧 SystemCalls");
    sysCalls.forEach(({ call, result, index }) => {
      const status = result.ok ? "✅" : "❌";
      console.log(`${status} [${index}] ${call.type}:`, result);
    });
    console.groupEnd();
  }
  
  // Effects 结果
  if (effects.applied.length > 0 || effects.skipped.length > 0) {
    console.group("⚡ Effects");
    if (effects.applied.length > 0) {
      console.log(`✅ Applied (${effects.applied.length}):`, effects.applied);
    }
    if (effects.skipped.length > 0) {
      console.warn(`⚠️ Skipped (${effects.skipped.length}):`, effects.skipped);
    }
    console.groupEnd();
  }
  
  // 触发的事件
  if (events.length > 0) {
    console.log("🎭 Events Triggered:", events);
  }
  
  console.groupEnd();
}

/**
 * 检查并执行自动存档
 * 
 * 保持现有逻辑：每24小时（进入新游戏日）自动保存到 "auto" 槽位
 */
function checkAndAutoSave() {
  const settings = settingsManager.getSettings();
  if (!settings.autosaveEnabled) return;
  const mapId = String(gameState.currentMapId || "");
  if (mapId === "menu" || mapId === "menu_more" || mapId.startsWith("menu_")) return;

  const trigger = String(settings.autosaveTrigger || "interval");
  const interval = Number(settings.autosaveIntervalMin || 10);
  const currentDay = Math.floor(gameState.time.totalMinutes / 1440) + 1;
  const lastAutoSaveMinute = Number.isFinite(Number(gameState.meta.lastAutoSaveMinute))
    ? Number(gameState.meta.lastAutoSaveMinute)
    : 0;
  const currentTotalMinutes = Math.max(0, Number(gameState.time.totalMinutes || 0));

  const hpNow = Number(gameState.player?.psycho?.hp ?? gameState.player?.hp ?? 0);
  const moneyNow = Number(gameState.world?.money ?? 0);
  const criticalProbe = {
    mapId,
    hp: Number.isFinite(hpNow) ? hpNow : 0,
    money: Number.isFinite(moneyNow) ? moneyNow : 0
  };

  if (!gameState.meta.autoSaveCriticalBaseline || typeof gameState.meta.autoSaveCriticalBaseline !== "object") {
    gameState.meta.autoSaveCriticalBaseline = { ...criticalProbe };
  }

  let shouldSave = false;

  if (trigger === "critical") {
    const baseline = gameState.meta.autoSaveCriticalBaseline || criticalProbe;
    const locationChanged = String(baseline.mapId || "") !== String(criticalProbe.mapId || "");
    const largePayment = Number(baseline.money || 0) - Number(criticalProbe.money || 0) >= 100;
    const hpDrop = Number(baseline.hp || 0) - Number(criticalProbe.hp || 0) >= 20;
    shouldSave = locationChanged || largePayment || hpDrop;
  } else {
    shouldSave = currentTotalMinutes - lastAutoSaveMinute >= interval;
  }

  if (!shouldSave) return;
  const autoSaveGate = validateAutoSaveGate(gameState);
  if (!autoSaveGate.ok) {
    console.warn(`[自动存档] veto reason=${autoSaveGate.reasonCode}`, {
      trigger,
      currentDay,
      currentTotalMinutes,
      mapId,
      details: autoSaveGate.error
    });
    return;
  }
  
  import("../../save/save_manager.js").then(({ saveManager }) => {
    const result = saveManager.saveToSlot("auto", gameState, { sourceActionId: "autosave" });
    if (result.ok) {
      gameState.meta.lastAutoSaveDay = currentDay;
      gameState.meta.lastAutoSaveMinute = currentTotalMinutes;
      gameState.meta.autoSaveCriticalBaseline = { ...criticalProbe };
      console.log(`[自动存档] Day ${currentDay} 已自动保存`);
    } else {
      console.error(`[自动存档] 保存失败：${result.error}`);
    }
  });
}

export function debugDispatchFeedbackFromReport(actionId, report) {
  return showFeedbackFromReport(actionId, report);
}


export function getTransitionRuntimeOwnerSnapshot() {
  const host = typeof document !== "undefined"
    ? document.getElementById("menu-transition-overlay")
    : null;
  return {
    owner: "runtime/transition_owner",
    phase: "idle",
    hostExists: !!host,
    hostConnected: !!host?.isConnected,
    hostId: host?.id || "",
    hostCreatedCount: host ? 1 : 0,
    repeatedCreated: false,
    canCancel: true,
    cancelledAt: 0,
    cancelReason: ""
  };
}
/**
 * 获取当前是否正在处理
 * 
 * @returns {boolean}
 */
export function getIsDispatching() {
  return isDispatching;
}
