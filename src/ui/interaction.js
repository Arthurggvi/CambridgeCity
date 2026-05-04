import { gameState } from "../engine/state.js";
import { render } from "../engine/renderer.js";
import { dispatch } from "../engine/pipeline/dispatch.js";
import { dispatchWithMenuTransitionCoordinator, isMenuTransitionInputLocked } from "../engine/menu_transition_coordinator.js";
import {
  getSettingsOverlayUiState,
  handleInventoryLocalAction,
  isInventoryLocalAction,
  rememberSettingsOverlayScrollTop,
  setSettingsOverlayActiveTab,
} from "../engine/ui_overlay_controller.js";
import {
  closeRecordsOverlay,
  requestRecordsOverlayRender,
  setSelectedRecordId
} from "../engine/records_overlay_controller.js";
import {
  beginPurchase as beginNightKitchenMenuPurchase,
  closeMenu as closeNightKitchenMenu,
  finishPurchase as finishNightKitchenMenuPurchase,
  resolveNightKitchenMenuCatalog,
  selectCategory as selectNightKitchenMenuCategory,
  selectItem as selectNightKitchenMenuItem,
  subscribe as subscribeNightKitchenMenu
} from "../engine/night_kitchen_menu_controller.js";
import {
  beginPurchase as beginShopGoodsPanelPurchase,
  closePanel as closeShopGoodsPanel,
  finishPurchase as finishShopGoodsPanelPurchase,
  selectItem as selectShopGoodsItem,
  subscribe as subscribeShopGoodsPanel
} from "../engine/shop_goods_panel_controller.js";
import { formatBillCents } from "../engine/medical_bill_money.js";
import {
  clearQuestionnaireDraft,
  exportQuestionnaireCompleted,
  loadQuestionnaireDraft,
  openQuestionnaireInCredits,
  requestQuestionnaireExitCredits,
  requestQuestionnaireReturnToCredits,
  saveQuestionnaireDraft,
  selectQuestionnaireSection,
  setQuestionnaireAnswer,
  setQuestionnaireBugReportField,
  subscribeQuestionnaireMenu
} from "./questionnaire_menu_controller.js";
import { resolveShopGoodsCatalog } from "../engine/shop_goods_catalog.js";
import { closeTasksOverlay } from "../engine/tasks_overlay_controller.js";
import { getCurrentMapContent } from "../engine/map_content_runtime.js";
import { showInputDialog, showNoticeDialog } from "./dialogs.js";
import { openAchievementMenuDialog } from "./achievement_menu_dialog.js";
import { setupDebugFloatingTools } from "./debug_floating_tools.js";
import { ensureTransientRuntimeHost } from "./transient/transient_host.js";

let _interactionBound = false;
let _inventoryDetailCloseTimer = null;
let _collapseTickInFlight = false;
let _lastCriticalInteractionMode = "NORMAL";
let _sleepTransitionInFlight = false;
let _lastShopGoodsPanelRenderSnapshot = null;

subscribeNightKitchenMenu(() => {
  render();
});

function cloneShopGoodsPanelVisualState(source) {
  return source && typeof source === "object"
    ? {
        shellPhase: String(source.shellPhase || "closed"),
        detailTransitionPhase: String(source.detailTransitionPhase || "idle"),
        itemTransitioning: source.itemTransitioning === true,
        transitioningItemId: String(source.transitioningItemId || "") || null,
        purchasePending: source.purchasePending === true
      }
    : {
        shellPhase: "closed",
        detailTransitionPhase: "idle",
        itemTransitioning: false,
        transitioningItemId: null,
        purchasePending: false
      };
}

function cloneShopGoodsPanelRenderSnapshot(snapshot) {
  return {
    open: snapshot?.open === true,
    mapId: String(snapshot?.mapId || "") || null,
    itemId: String(snapshot?.itemId || "") || null,
    scrollTop: Math.max(0, Number(snapshot?.scrollTop || 0)),
    visualState: cloneShopGoodsPanelVisualState(snapshot?.visualState)
  };
}

function shouldRenderForShopGoodsPanelSnapshot(nextSnapshot) {
  const next = cloneShopGoodsPanelRenderSnapshot(nextSnapshot);
  const previous = _lastShopGoodsPanelRenderSnapshot;
  _lastShopGoodsPanelRenderSnapshot = next;
  if (!previous) return true;
  return previous.open !== next.open
    || previous.mapId !== next.mapId
    || previous.itemId !== next.itemId
    || previous.visualState.shellPhase !== next.visualState.shellPhase
    || previous.visualState.detailTransitionPhase !== next.visualState.detailTransitionPhase
    || previous.visualState.itemTransitioning !== next.visualState.itemTransitioning
    || previous.visualState.transitioningItemId !== next.visualState.transitioningItemId
    || previous.visualState.purchasePending !== next.visualState.purchasePending;
}

subscribeShopGoodsPanel((snapshot) => {
  if (!shouldRenderForShopGoodsPanelSnapshot(snapshot)) {
    return;
  }
  render();
});

subscribeQuestionnaireMenu(() => {
  render();
});

const SLEEP_TRANSITION_TIMING = Object.freeze({
  inMs: 220,
  holdMs: 160,
  outMs: 260,
  reducedInMs: 70,
  reducedHoldMs: 80,
  reducedOutMs: 110
});

function resolveCriticalInteractionMode() {
  if (gameState?.player?.exposure?.dead === true) return "DEAD";
  const sleepMode = String(gameState?.player?.meta?.sleepEpisode?.mode || "").toUpperCase();
  if (sleepMode === "COLLAPSE") return "COLLAPSE";
  return "NORMAL";
}

function clearNonSystemUiOpenStates() {
  if (!gameState.ui || typeof gameState.ui !== "object") return;
  gameState.ui.overlay = null;
  gameState.ui.profileOpen = false;
  gameState.ui.recordsOpen = false;
  gameState.ui.socialOpen = false;
  gameState.ui.jobSession = null;
  gameState.ui.inquirySession = null;
}

function consumeCriticalUiEdge() {
  const mode = resolveCriticalInteractionMode();
  const enteredCritical = _lastCriticalInteractionMode === "NORMAL" && mode !== "NORMAL";
  _lastCriticalInteractionMode = mode;
  if (enteredCritical) {
    clearNonSystemUiOpenStates();
  }
  return mode;
}

function isWhitelistAction(actionId) {
  const id = String(actionId || "").trim();
  if (!id) return false;
  if (id === "menu_go_settings" || id === "menu_go_load" || id === "menu_go_achievements" || id === "menu_exit_main" || id === "menu_back_main") return true;
  if (id === "ui_close_inventory" || id === "ui_tasks_close" || id === "ui_map_close" || id === "ui_profile_close" || id === "ui_records_close" || id === "ui_social_close") return true;
  if (id.startsWith("settings_set:") || id.startsWith("settings_toggle:") || id === "settings_reset_defaults") return true;
  if (id.startsWith("menu_load:") || id.startsWith("load_slot_")) return true;
  if (id === "COLLAPSE_TICK_10M") return true;
  return false;
}

function isCollapseHardDisabledAction(actionId) {
  const id = String(actionId || "").trim();
  return id === "ui_open_inventory"
    || id === "ui_open_inventory_clothing"
    || id === "ui_tasks_open"
    || id === "ui_records_open"
    || id === "ui_social_open"
    || id === "ui_memo_open"
    || id === "sidebar_wait_confirm";
}

function shouldRemapToCollapseTick(actionId) {
  const id = String(actionId || "").trim();
  if (!id) return false;
  if (isWhitelistAction(id)) return false;
  if (isCollapseHardDisabledAction(id)) return false;
  if (id === "COLLAPSE_TICK_10M") return false;
  return true;
}

function isLiveUiTraceEnabled() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debugUi") === "1") return true;
    return window.localStorage?.getItem("cc:debugUi") === "1";
  } catch {
    return false;
  }
}

function emitLiveUiTrace(stage, payload) {
  if (!isLiveUiTraceEnabled()) return;
  console.info(`[LiveUITrace] ${stage}`, payload);
}

function getInteractionAuditStore() {
  if (typeof window === "undefined") return null;
  if (!window.__INTERACTION_AUDIT__) {
    window.__INTERACTION_AUDIT__ = {
      clicks: [],
      inspections: [],
      lastRoute: null,
      lastHandler: null,
      inspectElement,
      inspectSelector(selector) {
        return inspectElement(document.querySelector(selector));
      }
    };
  }
  return window.__INTERACTION_AUDIT__;
}

function clipHtml(text, maxLength = 240) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function snapshotDataset(el) {
  if (!el?.dataset) return {};
  return Object.fromEntries(Object.entries(el.dataset));
}

function snapshotElement(el) {
  if (!(el instanceof Element)) return null;
  const rect = typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null;
  const centerX = rect ? Math.round(rect.left + rect.width / 2) : null;
  const centerY = rect ? Math.round(rect.top + rect.height / 2) : null;
  const hitChain = centerX != null && centerY != null && typeof document.elementsFromPoint === "function"
    ? document.elementsFromPoint(centerX, centerY).slice(0, 6).map((node) => ({
        tag: node.tagName,
        id: node.id || null,
        className: String(node.className || "").trim() || null,
        dataset: snapshotDataset(node),
        pointerEvents: window.getComputedStyle(node).pointerEvents,
        zIndex: window.getComputedStyle(node).zIndex
      }))
    : [];
  return {
    tag: el.tagName,
    id: el.id || null,
    className: String(el.className || "").trim() || null,
    text: clipHtml(el.textContent || "", 120),
    outerHTML: clipHtml(el.outerHTML || "", 320),
    dataset: snapshotDataset(el),
    routeFields: {
      uiAction: el.getAttribute("data-ui-action"),
      actionId: el.getAttribute("data-action-id"),
      settingsTab: el.getAttribute("data-settings-tab"),
      localAction: el.getAttribute("data-local-action"),
      interactionDomain: el.getAttribute("data-interaction-domain")
    },
    rect: rect ? {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      centerX,
      centerY
    } : null,
    computed: {
      pointerEvents: window.getComputedStyle(el).pointerEvents,
      zIndex: window.getComputedStyle(el).zIndex,
      visibility: window.getComputedStyle(el).visibility,
      display: window.getComputedStyle(el).display
    },
    hitChain
  };
}

function inspectElement(el) {
  const result = snapshotElement(el);
  const audit = getInteractionAuditStore();
  if (audit && result) {
    audit.inspections.push({
      timestamp: Date.now(),
      element: result
    });
  }
  return result;
}

function logInteractionAudit(partial) {
  const audit = getInteractionAuditStore();
  if (!audit) return;
  const entry = {
    timestamp: Date.now(),
    uiPage: String(gameState.ui?.page || ""),
    currentMapId: String(gameState.currentMapId || ""),
    inventoryOpen: !!document.querySelector(".inventory-overlay"),
    tasksOpen: !!document.querySelector(".tasks-overlay"),
    ...partial
  };
  audit.clicks.push(entry);
  audit.lastRoute = entry.route || audit.lastRoute;
  audit.lastHandler = entry.handler || audit.lastHandler;
}

function getInteractiveRoot() {
  return document;
}

function getEventElementTarget(event) {
  const direct = event?.target;
  if (direct instanceof Element) return direct;

  const path = typeof event?.composedPath === "function" ? event.composedPath() : null;
  if (!Array.isArray(path)) return null;
  for (const node of path) {
    if (node instanceof Element) return node;
  }
  return null;
}

function isDisabledElement(el) {
  if (!el) return true;
  if (el.matches("[disabled], [aria-disabled='true']")) return true;
  return !!el.closest("[disabled], [aria-disabled='true']");
}

function buildDispatchPayload(el) {
  const payload = {};
  const mapId = String(el?.dataset?.mapId || "").trim();
  const sceneId = String(el?.dataset?.sceneId || "").trim();
  const interactionId = String(el?.dataset?.interactionId || "").trim();
  if (mapId) payload.mapId = mapId;
  if (sceneId) payload.sceneId = sceneId;
  if (interactionId) payload.interactionId = interactionId;

  const payloadSource = el.dataset.payloadSource;
  if (!payloadSource) return payload;
  const sourceEl = document.getElementById(payloadSource);
  const raw = sourceEl ? sourceEl.value : "";
  const minutes = parseInt(raw, 10);
  payload.minutes = Number.isFinite(minutes) ? minutes : 0;
  return payload;
}

function decodeUiRuntimeModel(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(text));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function buildDispatchOptions(el) {
  const actionFeedback = String(el.dataset.actionFeedback || "").trim();
  const actionFeedbackModel = decodeUiRuntimeModel(el.dataset.actionFeedbackModel || "");
  const actionIllustrationKey = String(el.dataset.actionIllustrationKey || "").trim();
  const uiRuntime = {};
  if (actionFeedback) uiRuntime.actionFeedback = actionFeedback;
  if (actionFeedbackModel) uiRuntime.actionFeedbackModel = actionFeedbackModel;
  if (actionIllustrationKey) uiRuntime.actionIllustrationKey = actionIllustrationKey;
  return Object.keys(uiRuntime).length > 0 ? { uiRuntime } : {};
}

function getNightKitchenMenuCatalogForCurrentMap() {
  const mapId = String(gameState.currentMapId || gameState.currentMap?.id || "").trim();
  if (!mapId) return null;
  return resolveNightKitchenMenuCatalog(mapId, getCurrentMapContent(mapId));
}

function getShopGoodsCatalogForCurrentMap() {
  const mapId = String(gameState.currentMapId || gameState.currentMap?.id || "").trim();
  if (!mapId) return null;
  return resolveShopGoodsCatalog(mapId);
}

function resolveNightKitchenOpenMenuMode(actionId) {
  const normalizedActionId = String(actionId || "").trim();
  if (normalizedActionId === "night_kitchen_open_dine_menu") return "dine";
  if (normalizedActionId === "night_kitchen_open_takeout_menu") return "takeout";
  return null;
}

function resolveNightKitchenPurchaseFeedbackText(report, payload = {}) {
  const uiFeedback = report?.report?.uiFeedback;
  const uiFeedbackTitle = String(uiFeedback?.title || "").trim();
  const uiFeedbackMessage = String(uiFeedback?.message || "").trim();
  if (uiFeedbackTitle || uiFeedbackMessage) {
    if (String(uiFeedback?.variant || "").trim() === "reject") {
      return uiFeedbackMessage || uiFeedbackTitle || "当前不可购买";
    }
    return uiFeedbackTitle || uiFeedbackMessage;
  }

  const rejection = report?.report?.plan?.rejection;
  const businessOk = !!report?.ok && !rejection;
  if (businessOk) {
    return String(payload?.mode || "").trim() === "takeout" ? "已打包" : "已取餐";
  }

  const rejectionReason = String(rejection?.reason || rejection?.reasons?.[0] || "").trim();
  if (rejectionReason === "余额不足" || /余额不足/.test(rejectionReason)) {
    return "余额不足";
  }

  const reason = String(rejectionReason || report?.reason || report?.message || report?.error || "").trim().toLowerCase();
  if (/余额|不足|money|fund|cash|credit|insufficient/.test(reason)) {
    return "余额不足";
  }
  if (/售空|sold\s*out|soldout|out[_\s-]*of[_\s-]*stock/.test(reason)) {
    return "已售空";
  }
  if (/背包|inventory|capacity|上限|full|item/.test(reason)) {
    return "无法入包";
  }
  return "当前不可购买";
}

function getSettingsContentScrollTop() {
  const content = document.querySelector("#settings-overlay-host .Content");
  return Math.max(0, Number(content?.scrollTop || 0));
}

function waitForMs(ms) {
  const delay = Math.max(0, Math.trunc(Number(ms ?? 0)));
  if (delay <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

function shouldUseReducedSleepTransitionMotion() {
  if (document.body?.classList?.contains("settings-reduce-motion")) return true;
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    return false;
  }
}

function getSleepTransitionTiming() {
  if (shouldUseReducedSleepTransitionMotion()) {
    return {
      inMs: SLEEP_TRANSITION_TIMING.reducedInMs,
      holdMs: SLEEP_TRANSITION_TIMING.reducedHoldMs,
      outMs: SLEEP_TRANSITION_TIMING.reducedOutMs
    };
  }
  return {
    inMs: SLEEP_TRANSITION_TIMING.inMs,
    holdMs: SLEEP_TRANSITION_TIMING.holdMs,
    outMs: SLEEP_TRANSITION_TIMING.outMs
  };
}

function ensureSleepTransitionOverlay() {
  const resolved = ensureTransientRuntimeHost({ documentRoot: document });
  const host = resolved?.host;
  const layer = resolved?.layer;
  if (!host || !layer) return null;

  let overlay = host.querySelector(":scope > .sleep-transition-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "sleep-transition-overlay";
    overlay.setAttribute("aria-hidden", "true");
    layer.appendChild(overlay);
  }

  return { host, overlay };
}

function cleanupSleepTransitionOverlay(host, overlay) {
  if (overlay?.parentElement) {
    overlay.remove();
  }

  if (!host) return;
  const hasOtherTransientNodes = host.querySelector(".transient-runtime-item, .sleep-transition-overlay") !== null;
  host.setAttribute("aria-hidden", hasOtherTransientNodes ? "false" : "true");
}

async function withSleepTransition(runCommit) {
  if (typeof runCommit !== "function") return;
  if (_sleepTransitionInFlight) return;

  _sleepTransitionInFlight = true;
  const resolved = ensureSleepTransitionOverlay();
  const host = resolved?.host || null;
  const overlay = resolved?.overlay || null;
  const timing = getSleepTransitionTiming();

  try {
    if (host && overlay) {
      host.setAttribute("aria-hidden", "false");
      overlay.setAttribute("aria-hidden", "false");
      overlay.style.setProperty("--sleep-transition-in-ms", `${timing.inMs}ms`);
      overlay.style.setProperty("--sleep-transition-out-ms", `${timing.outMs}ms`);
      requestAnimationFrame(() => {
        overlay.classList.add("sleep-transition-overlay--visible");
      });
      await waitForMs(timing.inMs);
    }

    await runCommit();

    if (overlay) {
      await waitForMs(timing.holdMs);
      overlay.classList.remove("sleep-transition-overlay--visible");
      overlay.classList.add("sleep-transition-overlay--closing");
      await waitForMs(timing.outMs);
    }
  } finally {
    cleanupSleepTransitionOverlay(host, overlay);
    _sleepTransitionInFlight = false;
  }
}

function isSleepTransitionActionElement(element) {
  return !!element?.closest?.(".sleep-duration-widget")
    && element?.classList?.contains("sleep-duration-widget__confirm") === true;
}

function setSleepWidgetBusy(element, busy) {
  const widget = element?.closest?.(".sleep-duration-widget");
  if (!widget) return;
  widget.classList.toggle("is-busy", !!busy);
  widget.setAttribute("aria-busy", busy ? "true" : "false");
  if (element instanceof HTMLElement) {
    element.disabled = !!busy;
    element.setAttribute("aria-disabled", busy ? "true" : "false");
  }
}

function clearInventoryDetailCloseTimer() {
  if (_inventoryDetailCloseTimer) {
    clearTimeout(_inventoryDetailCloseTimer);
    _inventoryDetailCloseTimer = null;
  }
}

function applyInventoryLocalActionRoute(route) {
  const { action, element } = route;
  clearInventoryDetailCloseTimer();
  const result = handleInventoryLocalAction(gameState, action, { element });
  if (!result?.handled) {
    return { handled: false, closeDetailDelayMs: 0 };
  }
  if (result.closeDetailDelayMs > 0) {
    _inventoryDetailCloseTimer = setTimeout(() => {
      _inventoryDetailCloseTimer = null;
      const finishResult = handleInventoryLocalAction(gameState, "finish-close-clothing-detail");
      if (finishResult?.handled && finishResult.shouldRender) {
        render();
      }
    }, result.closeDetailDelayMs);
  }
  if (result.shouldRender) {
    render();
  }
  return { handled: true, closeDetailDelayMs: result.closeDetailDelayMs || 0 };
}

function resolveInteractionRoute(event) {
  const target = getEventElementTarget(event);
  if (!target) return null;

  const settingsNavEl = target.closest("[data-settings-tab]");
  if (settingsNavEl && document.getElementById("settings-overlay-host")?.contains(settingsNavEl)) {
    return {
      domain: "settings_nav",
      element: settingsNavEl,
      disabled: isDisabledElement(settingsNavEl)
    };
  }

  const uiActionEl = target.closest("[data-ui-action]");
  if (uiActionEl) {
    return {
      domain: "ui_action",
      element: uiActionEl,
      action: String(uiActionEl.dataset.uiAction || "").trim(),
      disabled: isDisabledElement(uiActionEl)
    };
  }

  const localActionEl = target.closest("[data-local-action]");
  if (localActionEl) {
    const localActionInsideOverlay = document.getElementById("inventory-overlay-host")?.contains(localActionEl)
      || document.getElementById("records-overlay-host")?.contains(localActionEl);
    const localActionInsideNightKitchenMenu = document.getElementById("night-kitchen-menu-overlay-host")?.contains(localActionEl)
      && !!localActionEl.closest(".night-kitchen-menu-overlay");
    const localActionInsideShopGoodsPanel = document.getElementById("night-kitchen-menu-overlay-host")?.contains(localActionEl)
      && !!localActionEl.closest(".shop-goods-panel-overlay");
    const localActionInsideQuestionnaireMenu = !!localActionEl.closest(".questionnaire-menu-shell");
    const localActionInsideCreditsShell = !!localActionEl.closest(".menu-credits-shell");
    if (localActionInsideOverlay || localActionInsideNightKitchenMenu || localActionInsideShopGoodsPanel || localActionInsideQuestionnaireMenu || localActionInsideCreditsShell) {
      return {
        domain: "local_action",
        element: localActionEl,
        action: String(localActionEl.dataset.localAction || "").trim(),
        disabled: isDisabledElement(localActionEl)
      };
    }
  }

  const actionEl = target.closest("button[data-action-id], [data-action-id]");
  if (!actionEl) return null;

  const actionId = String(actionEl.dataset.actionId || "").trim();
  if (!actionId) return null;

  return {
    domain: "gameplay_action",
    element: actionEl,
    action: actionId,
    disabled: isDisabledElement(actionEl)
  };
}

function decodeQuestionnaireValue(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) return "";
  try {
    return JSON.parse(decodeURIComponent(text));
  } catch {
    return text;
  }
}

function resolveQuestionnaireInputRoute(event) {
  const target = getEventElementTarget(event);
  if (!target) return null;
  const inputEl = target.closest("[data-questionnaire-input]");
  if (!inputEl || isDisabledElement(inputEl)) return null;
  return {
    element: inputEl,
    kind: String(inputEl.dataset.questionnaireInput || "").trim()
  };
}

function buildQuestionnaireInputPayload(element) {
  const questionId = String(element?.dataset?.questionId || "").trim();
  const questionType = String(element?.dataset?.questionType || "").trim();
  if (!questionId) return null;

  if (String(element?.dataset?.questionnaireInput || "") === "bug-report-field") {
    return {
      kind: "bug-report-field",
      questionId,
      fieldId: String(element?.dataset?.bugFieldId || "").trim(),
      value: String(element?.value || "")
    };
  }

  if (questionType === "multi") {
    const questionSelector = typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(questionId)
      : questionId.replace(/[^a-zA-Z0-9_-]/g, "");
    const checked = Array.from(
      document.querySelectorAll(`[data-questionnaire-input='answer-choice'][data-question-id='${questionSelector}']:checked`)
    );
    return {
      kind: "answer",
      questionId,
      value: checked.map((node) => decodeQuestionnaireValue(node.value))
    };
  }

  return {
    kind: "answer",
    questionId,
    value: questionType === "text" ? String(element?.value || "") : decodeQuestionnaireValue(element?.value)
  };
}

async function onDelegatedChange(event) {
  const route = resolveQuestionnaireInputRoute(event);
  if (!route) return;

  if (isMenuTransitionInputLocked()) {
    event.preventDefault();
    return;
  }

  const payload = buildQuestionnaireInputPayload(route.element);
  if (!payload) return;
  if (payload.kind === "bug-report-field") {
    setQuestionnaireBugReportField(payload.questionId, payload.fieldId, payload.value);
    return;
  }
  setQuestionnaireAnswer(payload.questionId, payload.value);
}

function describeRoute(route) {
  if (!route) return null;
  return {
    domain: route.domain,
    action: route.action || null,
    disabled: !!route.disabled,
    element: snapshotElement(route.element)
  };
}

async function handleUiAction(route) {
  const { action, element } = route;
  logInteractionAudit({ handler: { name: "handleUiAction", action, element: snapshotElement(element), phase: "start" } });

  if (action === "sidebar-show-bills") {
    const obs = Number(gameState.world?.medical?.bills?.obsCents ?? 0);
    const ward = Number(gameState.world?.medical?.bills?.wardCents ?? 0);
    const total = obs + ward;
    await showNoticeDialog({
      title: "医疗账单",
      message:
        `急诊账单：${formatBillCents(obs)}\n` +
        `住院账单：${formatBillCents(ward)}\n` +
        `待付总额：${formatBillCents(total)}`,
      actions: [{ id: "ok", label: "返回", kind: "primary" }]
    });
    logInteractionAudit({ handler: { name: "handleUiAction", action, phase: "done", result: "notice-dialog" } });
    return;
  }

  if (action === "tasks-add") {
    const title = await showInputDialog({
      title: "新增备忘",
      message: "输入待办标题",
      placeholder: "例如：去政务大厅问身份证明",
      confirmLabel: "添加",
      cancelLabel: "取消"
    });
    if (title == null) return;
    await dispatch("tasks_add", { title });
    logInteractionAudit({ handler: { name: "handleUiAction", action, phase: "done", result: "tasks-add" } });
    return;
  }

  if (action === "inventory-backdrop-close") {
    await dispatch("ui_close_inventory");
    logInteractionAudit({ handler: { name: "handleUiAction", action, phase: "done", result: "ui_close_inventory" } });
    return;
  }

  if (action === "tasks-backdrop-close") {
    await closeTasksOverlay();
    logInteractionAudit({ handler: { name: "handleUiAction", action, phase: "done", result: "tasks_controller_close" } });
    return;
  }

  if (action === "records-close" || action === "records-backdrop-close") {
    const host = document.getElementById("records-overlay-host");
    await closeRecordsOverlay(host, {
      dispatchClose: () => dispatch("ui_records_close")
    });
    logInteractionAudit({ handler: { name: "handleUiAction", action, phase: "done", result: "records_controller_close" } });
    return;
  }

  logInteractionAudit({ handler: { name: "handleUiAction", action, phase: "noop" } });
}

async function handleSettingsNav(route) {
  logInteractionAudit({ handler: { name: "handleSettingsNav", action: route.element?.dataset?.settingsTab || null, phase: "start" } });
  const nextTab = String(route.element.dataset.settingsTab || "display") || "display";
  const current = getSettingsOverlayUiState().activeTab;
  rememberSettingsOverlayScrollTop(current, getSettingsContentScrollTop());
  setSettingsOverlayActiveTab(nextTab);
  render();
  logInteractionAudit({ handler: { name: "handleSettingsNav", action: nextTab, phase: "done" } });
}

async function handleLocalAction(route) {
  const { action, element } = route;
  logInteractionAudit({ handler: { name: "handleLocalAction", action, element: snapshotElement(element), phase: "start" } });

  if (action.startsWith("night-kitchen-menu-")) {
    const criticalMode = resolveCriticalInteractionMode();
    if (criticalMode !== "NORMAL") {
      logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "blocked", reason: `critical_mode:${criticalMode.toLowerCase()}` } });
      return;
    }
  }

  if (action === "night-kitchen-menu-select-category") {
    const catalog = getNightKitchenMenuCatalogForCurrentMap();
    selectNightKitchenMenuCategory(String(element.dataset.categoryId || "").trim(), { catalog });
    logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "done" } });
    return;
  }

  if (action === "night-kitchen-menu-select-item") {
    const catalog = getNightKitchenMenuCatalogForCurrentMap();
    selectNightKitchenMenuItem(String(element.dataset.itemId || "").trim(), { catalog });
    logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "done" } });
    return;
  }

  if (action === "night-kitchen-menu-close") {
    closeNightKitchenMenu();
    logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "done" } });
    return;
  }

  if (action === "night-kitchen-menu-purchase") {
    const purchaseActionId = String(element.dataset.purchaseActionId || "").trim();
    if (!purchaseActionId) {
      logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "noop", reason: "missing_purchase_action_id" } });
      return;
    }
    const payload = {
      itemId: String(element.dataset.itemId || "").trim(),
      categoryId: String(element.dataset.categoryId || "").trim(),
      mode: String(element.dataset.menuMode || "").trim()
    };
    const options = {
      ...buildDispatchOptions(element),
      returnReport: true,
      suppressFeedback: true
    };
    beginNightKitchenMenuPurchase();
    try {
      const report = await dispatchWithMenuTransitionCoordinator(purchaseActionId, payload, options);
      const businessOk = !!report?.ok && !report?.report?.plan?.rejection;
      finishNightKitchenMenuPurchase({
        ok: businessOk,
        text: resolveNightKitchenPurchaseFeedbackText(report, payload)
      });
      logInteractionAudit({
        handler: {
          name: "handleLocalAction",
          action,
          phase: "done",
          dispatchedActionId: purchaseActionId,
          businessOk,
          businessReason: report?.report?.plan?.rejection?.reason || report?.reason || null
        }
      });
    } catch (error) {
      finishNightKitchenMenuPurchase({ ok: false, text: "当前不可购买" });
      logInteractionAudit({
        handler: {
          name: "handleLocalAction",
          action,
          phase: "error",
          dispatchedActionId: purchaseActionId,
          error: String(error?.message || error || "unknown_error")
        }
      });
    }
    return;
  }

  if (action === "shop-goods-panel-select-item") {
    const catalog = getShopGoodsCatalogForCurrentMap();
    selectShopGoodsItem(String(element.dataset.itemId || "").trim(), { catalog });
    logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "done" } });
    return;
  }

  if (action === "shop-goods-panel-close") {
    closeShopGoodsPanel();
    logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "done" } });
    return;
  }

  if (action === "shop-goods-panel-purchase") {
    const purchaseActionId = String(element.dataset.purchaseActionId || "").trim();
    if (!purchaseActionId) {
      logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "noop", reason: "missing_purchase_action_id" } });
      return;
    }
    const payload = {
      type: "shop_goods_purchase",
      mapId: String(element.dataset.mapId || gameState.currentMapId || gameState.currentMap?.id || "").trim(),
      goodsId: String(element.dataset.goodsId || "").trim()
    };
    const options = {
      ...buildDispatchOptions(element),
      returnReport: true
    };
    beginShopGoodsPanelPurchase();
    try {
      const report = await dispatch(purchaseActionId, payload, options);
      const businessOk = !!report?.ok && !report?.report?.plan?.rejection;
      finishShopGoodsPanelPurchase();
      logInteractionAudit({
        handler: {
          name: "handleLocalAction",
          action,
          phase: "done",
          dispatchedActionId: purchaseActionId,
          businessOk,
          businessReason: report?.report?.plan?.rejection?.reason || report?.reason || null
        }
      });
    } catch (error) {
      finishShopGoodsPanelPurchase();
      const shopTitle = String(getShopGoodsCatalogForCurrentMap()?.title || gameState.currentMap?.name || "商铺货物").trim() || "商铺货物";
      showNoticeDialog({
        title: shopTitle,
        message: "该货物当前不可购买。",
        actions: [{ id: "ok", label: "返回", kind: "primary" }]
      });
      logInteractionAudit({
        handler: {
          name: "handleLocalAction",
          action,
          phase: "error",
          dispatchedActionId: purchaseActionId,
          error: String(error?.message || error || "unknown_error")
        }
      });
    }
    return;
  }

  if (isInventoryLocalAction(action)) {
    const result = applyInventoryLocalActionRoute(route);
    logInteractionAudit({
      handler: {
        name: "handleLocalAction",
        action,
        phase: result.handled ? "done" : "noop",
        result: result.handled ? "inventory_local_action_controller" : "inventory_local_action_unhandled"
      }
    });
    return;
  }

  if (action === "questionnaire-select-section") {
    selectQuestionnaireSection(String(element.dataset.sectionId || "").trim());
    logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "done" } });
    return;
  }

  if (action === "questionnaire-continue-draft") {
    await loadQuestionnaireDraft({ promptForDirectory: true });
    logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "done" } });
    return;
  }

  if (action === "questionnaire-open-credits") {
    openQuestionnaireInCredits();
    logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "done" } });
    return;
  }

  if (action === "questionnaire-save-draft") {
    await saveQuestionnaireDraft();
    logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "done" } });
    return;
  }

  if (action === "questionnaire-clear-draft") {
    await clearQuestionnaireDraft();
    logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "done" } });
    return;
  }

  if (action === "questionnaire-export-complete") {
    await exportQuestionnaireCompleted();
    logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "done" } });
    return;
  }

  if (action === "questionnaire-return-credits") {
    await requestQuestionnaireReturnToCredits();
    logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "done" } });
    return;
  }

  if (action === "credits-return-main") {
    await requestQuestionnaireExitCredits(() => dispatchWithMenuTransitionCoordinator("menu_back_main"));
    logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "done" } });
    return;
  }

  if (action === "records-select-record") {
    setSelectedRecordId(String(element.dataset.recordId || "").trim() || null);
    requestRecordsOverlayRender();
    logInteractionAudit({ handler: { name: "handleLocalAction", action, phase: "done" } });
  }
}

async function handleGameplayAction(route) {
  const { action, element } = route;
  const criticalMode = consumeCriticalUiEdge();
  const isDeadMode = criticalMode === "DEAD";
  const isCollapseMode = criticalMode === "COLLAPSE";
  let actionToDispatch = action;

  if (isDeadMode && !isWhitelistAction(action)) {
    logInteractionAudit({ handler: { name: "handleGameplayAction", action, phase: "blocked", reason: "dead_mode" } });
    return;
  }

  if (isCollapseMode) {
    if (isCollapseHardDisabledAction(action)) {
      logInteractionAudit({ handler: { name: "handleGameplayAction", action, phase: "blocked", reason: "collapse_hard_disabled" } });
      return;
    }
    const explicitRemapAction = String(element?.dataset?.remapActionId || "").trim();
    if (explicitRemapAction) {
      actionToDispatch = explicitRemapAction;
    } else if (shouldRemapToCollapseTick(action)) {
      actionToDispatch = "COLLAPSE_TICK_10M";
    }
  }

  const shouldTraceAction = actionToDispatch === "ui_open_inventory" || actionToDispatch === "ui_tasks_open" || actionToDispatch === "ui_records_open";
  if (shouldTraceAction) {
    emitLiveUiTrace("before", {
      action: actionToDispatch,
      uiPage: String(gameState.ui?.page || ""),
      modalOpen: document.body?.classList?.contains("modal-open") === true,
      noticeHidden: document.getElementById("notice-dialog-host")?.getAttribute("aria-hidden") ?? null,
      inventoryOpen: !!document.querySelector(".inventory-overlay"),
      tasksOpen: !!document.querySelector(".tasks-overlay"),
      target: snapshotElement(element)
    });
  }
  logInteractionAudit({
    handler: {
      name: "handleGameplayAction",
      action: actionToDispatch,
      phase: "start",
      element: snapshotElement(element),
      before: {
        uiPage: String(gameState.ui?.page || ""),
        inventoryOpen: !!document.querySelector(".inventory-overlay"),
        tasksOpen: !!document.querySelector(".tasks-overlay")
      }
    }
  });

  if (action.startsWith("tasks_delete:")) {
    const row = element.closest(".tasks-list-row");
    if (row) {
      row.classList.add("is-removing");
      window.setTimeout(() => {
        dispatch(action);
      }, 180);
      logInteractionAudit({ handler: { name: "handleGameplayAction", action, phase: "done", result: "tasks_delete_delayed" } });
      return;
    }
  }

  if (actionToDispatch === "menu_go_achievements") {
    await openAchievementMenuDialog();
    logInteractionAudit({ handler: { name: "handleGameplayAction", action: actionToDispatch, phase: "done", result: "achievement_notice_dialog" } });
    return;
  }

  const payload = buildDispatchPayload(element);
  const options = buildDispatchOptions(element);
  if (actionToDispatch === "COLLAPSE_TICK_10M") {
    if (_collapseTickInFlight) {
      logInteractionAudit({ handler: { name: "handleGameplayAction", action: actionToDispatch, phase: "blocked", reason: "collapse_tick_in_flight" } });
      return;
    }
    _collapseTickInFlight = true;
    try {
      await dispatchWithMenuTransitionCoordinator(actionToDispatch, payload, options);
    } finally {
      _collapseTickInFlight = false;
    }
  } else if (isSleepTransitionActionElement(element)) {
    if (_sleepTransitionInFlight) {
      logInteractionAudit({ handler: { name: "handleGameplayAction", action: actionToDispatch, phase: "blocked", reason: "sleep_transition_in_flight" } });
      return;
    }

    setSleepWidgetBusy(element, true);
    try {
      await withSleepTransition(() => dispatchWithMenuTransitionCoordinator(actionToDispatch, payload, options));
    } finally {
      setSleepWidgetBusy(element, false);
    }
  } else {
    await dispatchWithMenuTransitionCoordinator(actionToDispatch, payload, options);
  }
  if (shouldTraceAction) {
    emitLiveUiTrace("after", {
      action: actionToDispatch,
      uiPage: String(gameState.ui?.page || ""),
      modalOpen: document.body?.classList?.contains("modal-open") === true,
      noticeHidden: document.getElementById("notice-dialog-host")?.getAttribute("aria-hidden") ?? null,
      inventoryOpen: !!document.querySelector(".inventory-overlay"),
      tasksOpen: !!document.querySelector(".tasks-overlay"),
      topElement: snapshotElement(document.elementFromPoint(
        Math.max(0, Math.min(window.innerWidth - 1, Math.round(element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2))),
        Math.max(0, Math.min(window.innerHeight - 1, Math.round(element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2)))
      ))
    });
  }
  logInteractionAudit({
    handler: {
      name: "handleGameplayAction",
      action: actionToDispatch,
      phase: "done",
      payload,
      after: {
        uiPage: String(gameState.ui?.page || ""),
        inventoryOpen: !!document.querySelector(".inventory-overlay"),
        tasksOpen: !!document.querySelector(".tasks-overlay")
      }
    }
  });
}

async function onDelegatedClick(event) {
  const route = resolveInteractionRoute(event);
  logInteractionAudit({
    type: "click",
    target: snapshotElement(getEventElementTarget(event)),
    route: describeRoute(route)
  });
  if (!route || route.disabled) return;

  if (isMenuTransitionInputLocked()) {
    event.preventDefault();
    return;
  }

  if (route.domain === "settings_nav") {
    event.preventDefault();
    await handleSettingsNav(route);
    return;
  }

  if (route.domain === "ui_action") {
    event.preventDefault();
    await handleUiAction(route);
    return;
  }

  if (route.domain === "local_action") {
    event.preventDefault();
    await handleLocalAction(route);
    return;
  }

  if (route.domain === "gameplay_action") {
    event.preventDefault();
    await handleGameplayAction(route);
  }
}

/**
 * 绑定 UI 交互（目前只有选项按钮）
 * 只在页面初始化时调用一次
 */
export function setupInteraction() {
  if (_interactionBound) return;
  getInteractionAuditStore();
  // Debug-only floating tools are initialized here so they are outside normal gameplay UI layout.
  setupDebugFloatingTools();
  const root = getInteractiveRoot();
  root.addEventListener("click", onDelegatedClick);
  root.addEventListener("change", onDelegatedChange);
  if (typeof window !== "undefined") {
    window.__CC_INTERACTION_BINDING__ = {
      version: "2026-03-11.interaction.1",
      bound: true,
      at: new Date().toISOString()
    };
  }
  _interactionBound = true;
}
