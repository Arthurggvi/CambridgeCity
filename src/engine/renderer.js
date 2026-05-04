import { gameState } from "./state.js";
import { getTimeView, formatTimeHHMM, getWorldTimeContext, publishWorldTimeDebug } from "./time.js";
import { GetTimePhaseLabel } from "./time_phases.js";
import { computeIndoorWarmRecoveryEfficiencyMul, getPlayerDerived } from "./player.js";
import { PLAYER_DEFS } from "./player_defs.js";
import { evaluateRequires } from "./requires.js";
import { saveManager } from "../save/save_manager.js";
import { settingsManager } from "../save/settings_manager.js";
import { BUILD, formatAutoLastLine, formatVersionLine } from "../version.js";
import {
  showConfirmDialog as uiShowConfirmDialog,
  showInputDialog as uiShowInputDialog,
  showNoticeDialog as uiShowNoticeDialog
} from "../ui/dialogs.js";
import { formatMinutes } from "../ui/format_minutes.js";
import { renderSidebarToolIconSvg } from "../ui/sidebar_tool_icon_registry.js";
import { getHostClockTimeView, shouldUseHostClock } from "./render/menu_clock.js";
import {
  getMenuSnowRuntimeSnapshot,
  syncMenuSnowRuntime,
} from "./render/menu_snow_runtime.js";
import { syncBodySnowRuntime } from "./render/body_snow_runtime.js";
import { applySidebarLayout, cubicBezierScalar, resetLayoutInlineStylesForMenu, resolveSceneTextMountGeometry } from "./render/layout_math.js";
import { clamp01, getAtmospherePhaseKey } from "./render/atmosphere_utils.js";
import { escapeAttr, escapeHtml } from "./render/text_escape.js";
import { getLightPhaseLabel, getVisibilityBandLabel, SeasonProfile } from "./illumination.js";
import { forceWeatherEvent } from "./environment_weather.js";
import { resolveMapRuntimeDescriptionResult } from "./map_content_runtime.js";
import { buildRootRenderViewModel, buildSidebarStatusViewModel, isMenuPageId } from "./render/view_models.js";
import { buildWildernessViewModel } from "./wilderness/wilderness_view_model.js";
import { renderWildernessRuntime } from "./render/wilderness_runtime_fragments.js";
import { getProfileViewModel } from "./profile/read.js";
import { renderQuestionnaireCreditsLanding, renderQuestionnairePanel } from "./render/questionnaire_menu_page.js";
import {
  ensureRecordsOverlayHost,
  isRecordsOverlayClosing,
  renderActiveRecordsOverlay,
} from "./records_overlay_controller.js";
import {
  ensureSocialOverlayHost,
  isSocialOverlayClosing,
  renderActiveSocialOverlay,
} from "../ui/social_overlay_controller.js";
import { buildProfileOverlayViewModel, renderProfileOverlayPage } from "./render/profile_overlay_page.js";
import {
  getUiActionStateSnapshot,
  normalizeCanonicalUiState,
  UI_OVERLAY_TYPES,
  pushUiActionDiff,
  pushUiOpenCallchain,
  pushUiOverlayTrace,
  pushUiRouteTrace,
  resolveUiSurface
} from "./ui_route.js";
import { reconcileOverlayHostsFromCanonicalUi } from "./overlay_host_reconciler.js";
import { createOverlayTransitionManager } from "./overlay_transition_manager.js";
import { resolveTransitionPolicy } from "./transition_policy.js";
import {
  createRenderTransactionTargets,
  commitRenderTransaction,
  createHostRenderTransaction,
  commitHostRenderTransaction
} from "./render/render_transaction.js";
import {
  collectInventoryGainHighlightIds as collectInventoryGainHighlightIdsFromController,
  getSettingsOverlayUiState,
  readSettingsOverlayScrollTop,
  rememberSettingsOverlayScrollTop,
  setSettingsOverlayActiveTab,
} from "./ui_overlay_controller.js";
import {
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_SLOT_ORDER,
  INVENTORY_CATEGORIES,
  countKindsByCategory,
  getCapacityProfile,
  getCategoryDisplayName,
  getItemsById,
  getItemsDb,
  getToolTagLabel,
  isClothingItem,
  isToolEquipItem,
  normalizeEquipment,
  normalizeEquippedTools,
  normalizeInventory
} from "./items_db.js";
import { resolveThermalReadoutCapability } from "./thermal_readout_capability.js";
import { resolveTimeReadoutCapability, resolveTimeSenseState } from "./time_readout_capability.js";
import { createDefaultRefData, getTaskStatusLabel, normalizeTaskList, sortTaskEntries } from "./tasks.js";
import { getRegionConfigById, getPlaceProfileForMap } from "./loader.js";
import { getCanonicalCurrentMap, getCanonicalMapId } from "./map_context.js";
import {
  clearOnRouteChange as clearNightKitchenMenuOnRouteChange,
  getSnapshot as getNightKitchenMenuSnapshot,
  resolveNightKitchenMenuCatalog,
  setMenuScrollTop
} from "./night_kitchen_menu_controller.js";
import { renderNightKitchenFoodIconSvg } from "./night_kitchen_food_icon_registry.js";
import { buildNightKitchenMenuViewModel } from "./night_kitchen_menu_view_model.js";
import {
  clearOnRouteChange as clearShopGoodsPanelOnRouteChange,
  getSnapshot as getShopGoodsPanelSnapshot,
  setPanelScrollTop as setShopGoodsPanelScrollTop
} from "./shop_goods_panel_controller.js";
import { resolveShopGoodsCatalog } from "./shop_goods_catalog.js";
import { renderShopGoodsIconSvg } from "./shop_goods_icon_registry.js";
import { buildShopGoodsPanelViewModel } from "./shop_goods_panel_view_model.js";
import { buildConsumableDetailPresentation } from "./render/consumable_detail_presentation.js";
import {
  renderInventoryDossierPanel,
  renderInventoryEquipmentPanel,
  renderInventoryFooterPanel,
  renderInventoryManifestPanel
} from "./render/inventory_overlay_fragments.js";
import { buildInventoryOverlayViewModel } from "./render/inventory_overlay_view_model.js";
import {
  dispatch,
  getIsDispatching,
  markSceneTextFxAnimated,
  markSceneTextFxViewed
} from "./pipeline/dispatch.js";
import {
  closeProfileOverlay,
  isProfileOverlayClosing,
  showProfileOverlay
} from "./profile_overlay_controller.js";
import {
  closeTasksOverlay,
  ensureTasksOverlayHost,
  showTasksOverlay
} from "./tasks_overlay_controller.js";
import { resolveSceneTextFxPolicy, buildSceneTextContentSignature } from "./scene_text_fx_policy.js";
import { getAnimatedTable, getViewedTable } from "./scene_text_fx_state.js";
import { readDebugFlag, getDebugFlagSnapshot } from "./debug_flag_registry.js";
import { getUiSurfaceRegistry } from "./ui_surface_registry.js";
import {
  MINIMAP_SPECS,
  resolveMapMiniMapBranch,
  resolveSteelcrossMiniMapSpec,
  resolveTransitOnboardMiniMapSpec,
  resolveWinddykeMiniMapSpec
} from "./minimap/minimap_spec_registry.js";
import { BUS_ONBOARD_MAP_ID, readTransitOnboardMiniMapState } from "./transit/transit_service.js";
import { readMiniMapViewportSnapshot } from "./minimap/minimap_viewport_controller.js";
import { getJobDefinitionById } from "./jobs/job_definitions.js";
import { JOB_SESSION_STATUS, normalizeJobSession } from "./jobs/job_session.js";
import { getInquiryDefinitionById } from "./inquiry/inquiry_definitions.js";
import { INQUIRY_SESSION_STATUS, normalizeInquirySession } from "./inquiry/inquiry_session.js";
import {
  INLINE_SESSION_TRANSITION_PRESET,
  applyInlineSessionTransitionVars,
  getInlineSessionHostTimerMs
} from "./render/inline_session_transition_preset.js";
import { normalizeMoneyDeltaFxPayload, normalizeWorkPresentationPayload } from "./work_feedback_template.js";
import { formatBillCents, formatWalletMoney } from "./medical_bill_money.js";
import { buildInlineWorkFeedbackHtml } from "./render/work_feedback_presenter.js";
import { buildInlineSceneSessionHtml } from "./render/inline_scene_session_presenter.js";
import { isMovementAction } from "./render/action_grouping.js";
import {
  runSceneTextFxDom,
  runSceneTextFxSmoke,
  runSceneTextDomProbe,
  runSceneTextDomLocator,
  getSceneTextDomLocatorSnapshot,
  getSceneTextRuntimeRootSnapshot,
  getSceneTextBoundaryAuditSnapshot,
  stopSceneTextDomLocator
} from "./render/scene_text_fx_dom.js";
import {
  computeExpRecoverKPerHour,
  computeEnvTempC,
  computeEquipmentProtectionProfile,
  computeEffectiveEnvTempC,
  computeExposureCoolingRateMul,
  estimateCoreCoolingEtas,
  computeExposureDurations,
  computeLocalWind,
  computeEffectiveWarmth,
  getHypothermiaStage
} from "../systems/temperature/temperature_system.js";

let _lastRenderedMapId = null;
let _lastRenderedSceneSignature = null;

function getNightKitchenMenuCatalogForMap(mapId) {
  const normalizedMapId = String(mapId || "").trim();
  if (!normalizedMapId) return null;
  return resolveNightKitchenMenuCatalog(normalizedMapId, null);
}

function getNightKitchenTimePhase() {
  const phase = String(getWorldTimeContext()?.timePhase || "").trim().toLowerCase();
  return phase;
}

function createNightKitchenMenuIcon(iconDefOrId) {
  const icon = document.createElement("span");
  icon.className = "night-kitchen-menu__card-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = renderNightKitchenFoodIconSvg(iconDefOrId);
  return icon;
}

function ensureNightKitchenMenuOverlayHost() {
  let host = document.getElementById("night-kitchen-menu-overlay-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "night-kitchen-menu-overlay-host";
    host.setAttribute("aria-hidden", "true");
    host.hidden = true;
    document.body.appendChild(host);
  }

  if (host.parentElement !== document.body) {
    document.body.appendChild(host);
  }

  return host;
}

function hideNightKitchenMenuOverlay(host) {
  if (!host) return;
  if (typeof host._shopGoodsPanelCleanup === "function") {
    host._shopGoodsPanelCleanup();
    host._shopGoodsPanelCleanup = null;
  }
  host.innerHTML = "";
  host.setAttribute("aria-hidden", "true");
  host.hidden = true;
}

function renderNightKitchenMenuModule(map, hostContainer) {
  const currentMapId = String(map?.id || "").trim();
  const catalog = getNightKitchenMenuCatalogForMap(currentMapId);
  const snapshot = getNightKitchenMenuSnapshot();
  const viewModel = buildNightKitchenMenuViewModel({
    mapId: currentMapId,
    mapName: map?.name,
    catalog,
    snapshot,
    timePhase: getNightKitchenTimePhase()
  });
  if (!viewModel) return;

  const categories = viewModel.categories;
  const categoryItems = viewModel.items;
  const activeItem = viewModel.activeItem;
  const activeCategoryId = String(viewModel.activeCategoryId || "").trim();
  const purchaseActionId = String(viewModel.purchaseActionId || "").trim();
  const scrollTop = Math.max(0, Number(viewModel.scrollTop || 0));
  const title = String(viewModel.title || map?.name || "热食窗口菜单").trim() || "热食窗口菜单";
  const visualState = viewModel.visualState && typeof viewModel.visualState === "object" ? viewModel.visualState : {};
  const shellPhase = String(visualState.shellPhase || "open").trim() || "open";
  const bodyTransitionPhase = String(visualState.bodyTransitionPhase || "idle").trim() || "idle";
  const detailTransitionPhase = String(visualState.detailTransitionPhase || "idle").trim() || "idle";
  const purchasePending = visualState.purchasePending === true;
  const purchaseFeedback = String(visualState.purchaseFeedback || "").trim();
  const purchaseFeedbackText = String(visualState.purchaseFeedbackText || "").trim();
  const transitioningCategoryId = String(visualState.transitioningCategoryId || "").trim();
  const transitioningItemId = String(visualState.transitioningItemId || "").trim();

  const overlay = document.createElement("section");
  overlay.className = `night-kitchen-menu-overlay is-visible${shellPhase === "opening" ? " is-opening" : ""}${shellPhase === "closing" ? " is-closing" : ""}`;
  overlay.setAttribute("aria-label", title);

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = `night-kitchen-menu-backdrop${shellPhase === "opening" ? " is-opening" : ""}${shellPhase === "closing" ? " is-closing" : ""}`;
  backdrop.dataset.localAction = "night-kitchen-menu-close";
  backdrop.setAttribute("aria-label", "关闭热食窗口菜单");
  overlay.appendChild(backdrop);

  const shell = document.createElement("section");
  shell.className = `night-kitchen-menu${shellPhase === "opening" ? " is-opening" : ""}${shellPhase === "closing" ? " is-closing" : ""}`;
  shell.setAttribute("data-map-local-module", "night-kitchen-menu");
  shell.setAttribute("role", "dialog");
  shell.setAttribute("aria-modal", "true");
  shell.setAttribute("aria-label", title);

  const header = document.createElement("header");
  header.className = "night-kitchen-menu__header";
  header.innerHTML = `
    <div class="night-kitchen-menu__title-block">
      <div class="night-kitchen-menu__eyebrow">窗口菜单</div>
      <div class="night-kitchen-menu__title">${escapeHtml(title)}</div>
    </div>
  `;

  const categoryTabsWrap = document.createElement("div");
  categoryTabsWrap.className = `night-kitchen-menu__tabs${visualState.tabTransitioning === true ? " is-switching" : ""}`;
  const categoryTabs = document.createElement("div");
  categoryTabs.className = "night-kitchen-menu__categories";
  for (const category of categories) {
    const categoryId = String(category?.id || "").trim();
    if (!categoryId) continue;
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `night-kitchen-menu__category-tab${category.isActive ? " is-active" : ""}${visualState.tabTransitioning === true && categoryId === transitioningCategoryId ? " is-transitioning" : ""}`;
    tab.dataset.localAction = "night-kitchen-menu-select-category";
    tab.dataset.categoryId = categoryId;
    tab.textContent = String(category?.label || categoryId);
    categoryTabs.appendChild(tab);
  }
  categoryTabsWrap.appendChild(categoryTabs);
  header.appendChild(categoryTabsWrap);
  shell.appendChild(header);

  const body = document.createElement("div");
  body.className = `night-kitchen-menu__body${bodyTransitionPhase === "switch-out" ? " is-switching-out" : ""}${bodyTransitionPhase === "switch-in" ? " is-switching-in" : ""}`;

  const gridPanel = document.createElement("div");
  gridPanel.className = `night-kitchen-menu__grid-panel${bodyTransitionPhase !== "idle" ? " is-switching" : ""}`;
  const grid = document.createElement("div");
  grid.className = `night-kitchen-menu__grid${bodyTransitionPhase !== "idle" ? " is-switching" : ""}`;
  grid.scrollTop = scrollTop;
  grid.addEventListener("scroll", () => {
    setMenuScrollTop(activeCategoryId, grid.scrollTop);
  }, { passive: true });

  for (const item of categoryItems) {
    const itemId = String(item?.id || "").trim();
    if (!itemId) continue;
    const card = document.createElement("button");
    card.type = "button";
    const isSelected = item.isSelected === true;
    card.className = `night-kitchen-menu__item-card${isSelected ? " is-selected" : ""}${visualState.itemTransitioning === true && transitioningItemId === itemId ? " is-transitioning" : ""}`;
    card.dataset.localAction = "night-kitchen-menu-select-item";
    card.dataset.itemId = itemId;
    card.dataset.categoryId = activeCategoryId;
    const cardTop = document.createElement("span");
    cardTop.className = "night-kitchen-menu__card-top";
    cardTop.appendChild(createNightKitchenMenuIcon(item.icon));
    card.appendChild(cardTop);

    const textWrap = document.createElement("span");
    textWrap.className = "night-kitchen-menu__card-text";
    textWrap.innerHTML = `
      <span class="night-kitchen-menu__card-name">${escapeHtml(String(item?.name || itemId))}</span>
      <span class="night-kitchen-menu__card-price">${escapeHtml(String(item?.priceLabel || "--"))}</span>
    `;
    card.appendChild(textWrap);
    grid.appendChild(card);
  }

  gridPanel.appendChild(grid);
  body.appendChild(gridPanel);

  const detail = document.createElement("aside");
  detail.className = `night-kitchen-menu__detail${detailTransitionPhase === "switch-out" || detailTransitionPhase === "item-out" ? " is-switching-out" : ""}${detailTransitionPhase === "switch-in" || detailTransitionPhase === "item-in" ? " is-switching-in" : ""}`;

  const detailHeader = document.createElement("div");
  detailHeader.className = "night-kitchen-menu__detail-header";
  detailHeader.innerHTML = `
    <div class="night-kitchen-menu__detail-name">${escapeHtml(String(activeItem?.name || ""))}</div>
    <div class="night-kitchen-menu__detail-price">${escapeHtml(String(activeItem?.priceLabel || "--"))}</div>
  `;
  detail.appendChild(detailHeader);

  const detailCopy = document.createElement("div");
  detailCopy.className = "night-kitchen-menu__detail-copy";

  const detailSections = [
    {
      label: "套餐内容",
      value: String(activeItem?.contentsText || "").trim()
    },
    {
      label: "即时效果",
      value: String(activeItem?.instantEffectText || "").trim()
    },
    {
      label: "持续效果",
      value: String(activeItem?.durationEffectText || "").trim()
    }
  ].filter((section) => section.value);

  if (detailSections.length > 0) {
    const infoList = document.createElement("div");
    infoList.className = "night-kitchen-menu__detail-info-list";
    for (const section of detailSections) {
      const block = document.createElement("section");
      block.className = "night-kitchen-menu__detail-info";

      const heading = document.createElement("div");
      heading.className = "night-kitchen-menu__detail-info-label";
      heading.textContent = section.label;
      block.appendChild(heading);

      const body = document.createElement("p");
      body.className = "night-kitchen-menu__detail-info-value";
      body.textContent = section.value;
      block.appendChild(body);

      infoList.appendChild(block);
    }
    detailCopy.appendChild(infoList);
  }

  const detailDescText = String(activeItem?.description || "").trim();
  if (detailDescText) {
    const detailDesc = document.createElement("p");
    detailDesc.className = "night-kitchen-menu__detail-description";
    detailDesc.textContent = detailDescText;
    detailCopy.appendChild(detailDesc);
  }

  detail.appendChild(detailCopy);

  const chipsSection = document.createElement("div");
  chipsSection.className = "night-kitchen-menu__detail-tags";
  const chipsHeading = document.createElement("div");
  chipsHeading.className = "night-kitchen-menu__detail-section-title";
  chipsHeading.textContent = "标签";
  chipsSection.appendChild(chipsHeading);
  const chips = document.createElement("div");
  chips.className = "night-kitchen-menu__chips";
  const servingList = Array.isArray(activeItem?.serving) ? activeItem.serving.slice() : [];
  for (const serving of servingList) {
    const servingChip = document.createElement("span");
    servingChip.className = "night-kitchen-menu__chip night-kitchen-menu__chip--serving";
    servingChip.textContent = String(serving || "").trim();
    if (servingChip.textContent) {
      chips.appendChild(servingChip);
    }
  }
  const tagList = Array.isArray(activeItem?.tags) ? activeItem.tags.slice() : [];
  for (const tag of tagList) {
    const chip = document.createElement("span");
    chip.className = "night-kitchen-menu__chip";
    chip.textContent = String(tag || "").trim();
    chips.appendChild(chip);
  }
  chipsSection.appendChild(chips);
  detail.appendChild(chipsSection);

  body.appendChild(detail);
  shell.appendChild(body);

  const footer = document.createElement("footer");
  footer.className = "night-kitchen-menu__footer";

  if (purchaseFeedback && purchaseFeedbackText) {
    const feedback = document.createElement("div");
    feedback.className = `night-kitchen-menu__feedback is-${purchaseFeedback}`;
    feedback.textContent = purchaseFeedbackText;
    footer.appendChild(feedback);
  }

  const purchaseBtn = document.createElement("button");
  purchaseBtn.type = "button";
  purchaseBtn.className = `night-kitchen-menu__submit journal-action${purchasePending ? " is-pending" : ""}${purchaseFeedback === "success" ? " is-success" : ""}${purchaseFeedback === "fail" ? " is-fail" : ""}${visualState.purchaseFailShake === true ? " is-shaking" : ""}`;
  purchaseBtn.dataset.localAction = "night-kitchen-menu-purchase";
  purchaseBtn.dataset.purchaseActionId = purchaseActionId;
  purchaseBtn.dataset.itemId = String(activeItem?.selectedItemId || activeItem?.id || "");
  purchaseBtn.dataset.categoryId = activeCategoryId;
  purchaseBtn.dataset.menuMode = String(snapshot.mode || categories.find((category) => category.isActive)?.mode || "");
  purchaseBtn.textContent = purchasePending ? "处理中" : "购买";
  purchaseBtn.setAttribute("aria-busy", purchasePending ? "true" : "false");
  if (!purchaseActionId || purchasePending) {
    purchaseBtn.disabled = true;
    purchaseBtn.setAttribute("aria-disabled", "true");
  }
  footer.appendChild(purchaseBtn);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "night-kitchen-menu__close";
  closeBtn.dataset.localAction = "night-kitchen-menu-close";
  closeBtn.textContent = "关闭菜单";
  footer.appendChild(closeBtn);

  shell.appendChild(footer);
  overlay.appendChild(shell);

  hostContainer.innerHTML = "";
  hostContainer.appendChild(overlay);
  hostContainer.setAttribute("aria-hidden", "false");
  hostContainer.hidden = false;
}

function createShopGoodsPanelIcon(iconId) {
  const icon = document.createElement("span");
  icon.className = "shop-goods-panel__card-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = renderShopGoodsIconSvg(iconId);
  return icon;
}

function clampShopGoodsScrollValue(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function bindShopGoodsPanelLeftScroll({
  hostContainer,
  leftScrollHost,
  goodsGrid,
  scrollbar,
  scrollbarThumb,
  sessionId = 0,
  initialScrollTop = 0
} = {}) {
  if (!hostContainer || !leftScrollHost || !goodsGrid || !scrollbar || !scrollbarThumb) {
    return () => {};
  }

  let frameId = 0;
  let resizeObserver = null;
  let thumbPointerId = null;
  let dragStartY = 0;
  let dragStartThumbTop = 0;
  let suppressHostScrollStateSync = false;
  const normalizedSessionId = Math.max(0, Math.trunc(Number(sessionId || 0)));

  const setHostScrollTopSilently = (nextScrollTop) => {
    const normalizedScrollTop = Math.max(0, Number(nextScrollTop || 0));
    if (normalizedScrollTop === Number(leftScrollHost.scrollTop || 0)) {
      return;
    }
    suppressHostScrollStateSync = true;
    leftScrollHost.scrollTop = normalizedScrollTop;
  };

  const getMetrics = () => {
    const clientHeight = Math.max(0, Number(leftScrollHost.clientHeight || 0));
    const scrollHeight = Math.max(0, Number(leftScrollHost.scrollHeight || 0));
    const scrollbarStyle = typeof window !== "undefined" ? window.getComputedStyle(scrollbar) : null;
    const insetTop = Math.max(0, Number.parseFloat(scrollbarStyle?.top || "0") || 0);
    const insetBottom = Math.max(0, Number.parseFloat(scrollbarStyle?.bottom || "0") || 0);
    const fallbackTrackHeight = Math.max(0, Number(scrollbar.parentElement?.clientHeight || leftScrollHost.clientHeight || 0) - insetTop - insetBottom);
    const trackHeight = Math.max(0, Number(scrollbar.clientHeight || 0), fallbackTrackHeight);
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
    const thumbHeight = maxScrollTop > 0 && trackHeight > 0
      ? clampShopGoodsScrollValue(Math.round((clientHeight / scrollHeight) * trackHeight), 36, trackHeight)
      : 0;
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    return {
      trackHeight,
      maxScrollTop,
      thumbHeight,
      maxThumbTop,
      canScroll: maxScrollTop > 0 && trackHeight > 0
    };
  };

  const getThumbTopFromHost = (metrics) => {
    if (!metrics.canScroll || metrics.maxScrollTop <= 0 || metrics.maxThumbTop <= 0) {
      return 0;
    }
    return (Number(leftScrollHost.scrollTop || 0) / metrics.maxScrollTop) * metrics.maxThumbTop;
  };

  const syncScrollbar = () => {
    frameId = 0;
    const metrics = getMetrics();
    if (!metrics.canScroll) {
      if (Number(leftScrollHost.scrollTop || 0) !== 0) {
        setHostScrollTopSilently(0);
      }
      scrollbar.hidden = true;
      scrollbar.setAttribute("aria-hidden", "true");
      scrollbar.dataset.scrollEnabled = "false";
      scrollbarThumb.style.height = "0px";
      scrollbarThumb.style.transform = "translateY(0px)";
      return;
    }

    const nextScrollTop = clampShopGoodsScrollValue(Number(leftScrollHost.scrollTop || 0), 0, metrics.maxScrollTop);
    if (nextScrollTop !== Number(leftScrollHost.scrollTop || 0)) {
      setHostScrollTopSilently(nextScrollTop);
    }

    const thumbTop = clampShopGoodsScrollValue(getThumbTopFromHost(metrics), 0, metrics.maxThumbTop);
    scrollbar.hidden = false;
    scrollbar.setAttribute("aria-hidden", "false");
    scrollbar.dataset.scrollEnabled = "true";
    scrollbarThumb.style.height = `${metrics.thumbHeight}px`;
    scrollbarThumb.style.transform = `translateY(${thumbTop}px)`;
  };

  const scheduleSyncScrollbar = () => {
    if (frameId) return;
    frameId = requestAnimationFrame(syncScrollbar);
  };

  const applyThumbTop = (thumbTop) => {
    const metrics = getMetrics();
    if (!metrics.canScroll) {
      leftScrollHost.scrollTop = 0;
      return;
    }
    const nextThumbTop = clampShopGoodsScrollValue(thumbTop, 0, metrics.maxThumbTop);
    const nextScrollTop = metrics.maxThumbTop > 0
      ? (nextThumbTop / metrics.maxThumbTop) * metrics.maxScrollTop
      : 0;
    leftScrollHost.scrollTop = nextScrollTop;
    scheduleSyncScrollbar();
  };

  const handleHostScroll = () => {
    if (suppressHostScrollStateSync) {
      suppressHostScrollStateSync = false;
      scheduleSyncScrollbar();
      return;
    }
    hostContainer._shopGoodsPanelLiveScrollTop = Number(leftScrollHost.scrollTop || 0);
    hostContainer._shopGoodsPanelLiveScrollSessionId = normalizedSessionId;
    setShopGoodsPanelScrollTop(leftScrollHost.scrollTop, { silent: true });
    scheduleSyncScrollbar();
  };

  const handleTrackPointerDown = (event) => {
    if (event.button !== 0 || event.target === scrollbarThumb) return;
    const metrics = getMetrics();
    if (!metrics.canScroll) return;
    const trackRect = scrollbar.getBoundingClientRect();
    const pointerOffset = event.clientY - trackRect.top - metrics.thumbHeight / 2;
    applyThumbTop(pointerOffset);
    event.preventDefault();
  };

  const stopThumbDrag = (event) => {
    if (thumbPointerId == null) return;
    if (event && event.pointerId !== thumbPointerId) return;
    thumbPointerId = null;
    dragStartY = 0;
    dragStartThumbTop = 0;
    scrollbarThumb.classList.remove("is-dragging");
  };

  const handleThumbPointerDown = (event) => {
    if (event.button !== 0) return;
    const metrics = getMetrics();
    if (!metrics.canScroll) return;
    thumbPointerId = event.pointerId;
    dragStartY = event.clientY;
    dragStartThumbTop = getThumbTopFromHost(metrics);
    scrollbarThumb.classList.add("is-dragging");
    scrollbarThumb.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleThumbPointerMove = (event) => {
    if (event.pointerId !== thumbPointerId) return;
    const nextThumbTop = dragStartThumbTop + (event.clientY - dragStartY);
    applyThumbTop(nextThumbTop);
    event.preventDefault();
  };

  const handleWindowResize = () => {
    scheduleSyncScrollbar();
  };

  const syncInitialState = () => {
    const maxScrollTop = Math.max(0, Number(leftScrollHost.scrollHeight || 0) - Number(leftScrollHost.clientHeight || 0));
    const liveScrollSessionId = Math.max(0, Number(hostContainer._shopGoodsPanelLiveScrollSessionId || 0));
    const preferredScrollTop = liveScrollSessionId === normalizedSessionId
      ? Number(hostContainer._shopGoodsPanelLiveScrollTop || 0)
      : Number(initialScrollTop || 0);
    setHostScrollTopSilently(clampShopGoodsScrollValue(preferredScrollTop, 0, maxScrollTop));
    hostContainer._shopGoodsPanelLiveScrollTop = Number(leftScrollHost.scrollTop || 0);
    hostContainer._shopGoodsPanelLiveScrollSessionId = normalizedSessionId;
    scheduleSyncScrollbar();
  };

  leftScrollHost.addEventListener("scroll", handleHostScroll, { passive: true });
  scrollbar.addEventListener("pointerdown", handleTrackPointerDown);
  scrollbarThumb.addEventListener("pointerdown", handleThumbPointerDown);
  scrollbarThumb.addEventListener("pointermove", handleThumbPointerMove);
  scrollbarThumb.addEventListener("pointerup", stopThumbDrag);
  scrollbarThumb.addEventListener("pointercancel", stopThumbDrag);
  scrollbarThumb.addEventListener("lostpointercapture", stopThumbDrag);
  window.addEventListener("resize", handleWindowResize);

  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => {
      scheduleSyncScrollbar();
    });
    resizeObserver.observe(leftScrollHost);
    resizeObserver.observe(goodsGrid);
  }

  requestAnimationFrame(syncInitialState);

  return () => {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    hostContainer._shopGoodsPanelLiveScrollTop = Number(leftScrollHost.scrollTop || 0);
    hostContainer._shopGoodsPanelLiveScrollSessionId = normalizedSessionId;
    leftScrollHost.removeEventListener("scroll", handleHostScroll);
    scrollbar.removeEventListener("pointerdown", handleTrackPointerDown);
    scrollbarThumb.removeEventListener("pointerdown", handleThumbPointerDown);
    scrollbarThumb.removeEventListener("pointermove", handleThumbPointerMove);
    scrollbarThumb.removeEventListener("pointerup", stopThumbDrag);
    scrollbarThumb.removeEventListener("pointercancel", stopThumbDrag);
    scrollbarThumb.removeEventListener("lostpointercapture", stopThumbDrag);
    window.removeEventListener("resize", handleWindowResize);
    thumbPointerId = null;
  };
}

function renderShopGoodsPanelModule(map, hostContainer) {
  const currentMapId = String(map?.id || "").trim();
  const catalog = resolveShopGoodsCatalog(currentMapId);
  const snapshot = getShopGoodsPanelSnapshot();
  const viewModel = buildShopGoodsPanelViewModel({
    mapId: currentMapId,
    mapName: map?.name,
    catalog,
    snapshot
  });
  if (!viewModel) return;

  const items = viewModel.items;
  const activeItem = viewModel.activeItem;
  const sessionId = Math.max(0, Number(viewModel.sessionId || 0));
  const scrollTop = Math.max(0, Number(viewModel.scrollTop || 0));
  const title = String(viewModel.title || map?.name || "商铺货物").trim() || "商铺货物";
  const eyebrow = String(viewModel.eyebrow || "货单").trim() || "货单";
  const visualState = viewModel.visualState && typeof viewModel.visualState === "object" ? viewModel.visualState : {};
  const shellPhase = String(visualState.shellPhase || "open").trim() || "open";
  const detailTransitionPhase = String(visualState.detailTransitionPhase || "idle").trim() || "idle";
  const transitioningItemId = String(visualState.transitioningItemId || "").trim();
  const purchasePending = visualState.purchasePending === true;
  const itemsById = getItemsById();
  const activeItemDef = activeItem?.sourceItemId ? itemsById?.get(activeItem.sourceItemId) : null;
  const activeConsumablePresentation = buildConsumableDetailPresentation(activeItemDef, gameState?.player || null);

  const overlay = document.createElement("section");
  overlay.className = `shop-goods-panel-overlay is-visible${shellPhase === "opening" ? " is-opening" : ""}${shellPhase === "closing" ? " is-closing" : ""}`;
  overlay.setAttribute("aria-label", title);

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = `shop-goods-panel-backdrop${shellPhase === "opening" ? " is-opening" : ""}${shellPhase === "closing" ? " is-closing" : ""}`;
  backdrop.dataset.localAction = "shop-goods-panel-close";
  backdrop.setAttribute("aria-label", "关闭商铺货物面板");
  overlay.appendChild(backdrop);

  const shell = document.createElement("section");
  shell.className = `shop-goods-panel${shellPhase === "opening" ? " is-opening" : ""}${shellPhase === "closing" ? " is-closing" : ""}`;
  shell.setAttribute("data-map-local-module", "shop-goods-panel");
  shell.setAttribute("role", "dialog");
  shell.setAttribute("aria-modal", "true");
  shell.setAttribute("aria-label", title);

  const header = document.createElement("header");
  header.className = "shop-goods-panel__header";
  header.innerHTML = `
    <div class="shop-goods-panel__title-block">
      <div class="shop-goods-panel__eyebrow">${escapeHtml(eyebrow)}</div>
      <div class="shop-goods-panel__title">${escapeHtml(title)}</div>
    </div>
    <div class="shop-goods-panel__header-note">窗口前可直接看到的几样货</div>
  `;
  shell.appendChild(header);

  const body = document.createElement("div");
  body.className = "shop-goods-panel__body";

  const leftPane = document.createElement("div");
  leftPane.className = "shop-goods-panel__left-pane";

  const leftScrollHost = document.createElement("div");
  leftScrollHost.className = "shop-goods-panel__left-scroll-host";
  leftScrollHost.setAttribute("data-shop-goods-scroll-host", "true");

  const goodsGrid = document.createElement("div");
  goodsGrid.className = "shop-goods-panel__goods-grid";

  if (items.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "shop-goods-panel__empty-state";
    emptyState.textContent = String(viewModel.emptyStateMessage || "摊布后面现在是空的。");
    goodsGrid.appendChild(emptyState);
  }

  for (const item of items) {
    const itemId = String(item?.id || "").trim();
    if (!itemId) continue;
    const card = document.createElement("button");
    card.type = "button";
    card.className = `shop-goods-panel__item-card${item.isSelected ? " is-selected" : ""}${visualState.itemTransitioning === true && transitioningItemId === itemId ? " is-transitioning" : ""}`;
    card.dataset.localAction = "shop-goods-panel-select-item";
    card.dataset.itemId = itemId;

    const top = document.createElement("span");
    top.className = "shop-goods-panel__card-top";
    top.appendChild(createShopGoodsPanelIcon(item.iconId));
    const price = document.createElement("span");
    price.className = "shop-goods-panel__card-price";
    price.textContent = String(item.priceLabel || "--");
    top.appendChild(price);
    card.appendChild(top);

    const textWrap = document.createElement("span");
    textWrap.className = "shop-goods-panel__card-text";
    textWrap.innerHTML = `
      <span class="shop-goods-panel__card-name">${escapeHtml(String(item.name || itemId))}</span>
      <span class="shop-goods-panel__card-desc">${escapeHtml(String(item.description || ""))}</span>
    `;
    card.appendChild(textWrap);

    const tags = document.createElement("span");
    tags.className = "shop-goods-panel__card-tags";
    tags.textContent = Array.isArray(item.tags) ? item.tags.slice(0, 2).join(" · ") : "";
    card.appendChild(tags);
    goodsGrid.appendChild(card);
  }

  leftScrollHost.appendChild(goodsGrid);
  leftPane.appendChild(leftScrollHost);

  const scrollbar = document.createElement("div");
  scrollbar.className = "shop-goods-panel__scrollbar";
  scrollbar.setAttribute("aria-hidden", "true");
  scrollbar.hidden = true;

  const scrollbarThumb = document.createElement("div");
  scrollbarThumb.className = "shop-goods-panel__scrollbar-thumb";
  scrollbarThumb.setAttribute("role", "presentation");
  scrollbar.appendChild(scrollbarThumb);
  leftPane.appendChild(scrollbar);

  body.appendChild(leftPane);

  const detail = document.createElement("aside");
  detail.className = `shop-goods-panel__detail${detailTransitionPhase === "item-out" ? " is-switching-out" : ""}${detailTransitionPhase === "item-in" ? " is-switching-in" : ""}`;
  if (!activeItem) {
    detail.innerHTML = `
      <div class="shop-goods-panel__detail-header">
        <div class="shop-goods-panel__detail-name">${escapeHtml(String(viewModel.title || title))}</div>
        <div class="shop-goods-panel__detail-price">--</div>
      </div>
      <p class="shop-goods-panel__detail-description">${escapeHtml(String(viewModel.emptyStateMessage || "摊布后面现在是空的。"))}</p>
    `;
  } else {
    detail.innerHTML = `
      <div class="shop-goods-panel__detail-header">
        <div class="shop-goods-panel__detail-name">${escapeHtml(String(activeItem?.name || ""))}</div>
        <div class="shop-goods-panel__detail-price">${escapeHtml(String(activeItem?.priceLabel || "--"))}</div>
      </div>
      <p class="shop-goods-panel__detail-description">${escapeHtml(String(activeItem?.description || ""))}</p>
    `;
  }

  if (activeItem) {
    if (Array.isArray(activeConsumablePresentation?.effectLines) && activeConsumablePresentation.effectLines.length > 0) {
      const effectSection = document.createElement("div");
      effectSection.className = "shop-goods-panel__detail-tags";
      const effectTitle = document.createElement("div");
      effectTitle.className = "shop-goods-panel__detail-section-title";
      effectTitle.textContent = String(activeConsumablePresentation.title || "效果");
      effectSection.appendChild(effectTitle);
      const effectList = document.createElement("div");
      effectList.className = "shop-goods-panel__detail-effect-list";
      for (const line of activeConsumablePresentation.effectLines) {
        const effectLine = document.createElement("div");
        effectLine.className = "shop-goods-panel__detail-effect-line";
        effectLine.textContent = String(line || "").trim();
        if (effectLine.textContent) {
          effectList.appendChild(effectLine);
        }
      }
      if (effectList.childElementCount > 0) {
        effectSection.appendChild(effectList);
        detail.appendChild(effectSection);
      }
    }

    const tagSection = document.createElement("div");
    tagSection.className = "shop-goods-panel__detail-tags";
    const tagTitle = document.createElement("div");
    tagTitle.className = "shop-goods-panel__detail-section-title";
    tagTitle.textContent = "标签";
    tagSection.appendChild(tagTitle);
    const chips = document.createElement("div");
    chips.className = "shop-goods-panel__chips";
    for (const tag of Array.isArray(activeItem?.tags) ? activeItem.tags : []) {
      const chip = document.createElement("span");
      chip.className = "shop-goods-panel__chip";
      chip.textContent = String(tag || "").trim();
      if (chip.textContent) {
        chips.appendChild(chip);
      }
    }
    tagSection.appendChild(chips);
    detail.appendChild(tagSection);
  }
  body.appendChild(detail);
  shell.appendChild(body);

  const footer = document.createElement("footer");
  footer.className = "shop-goods-panel__footer";
  const note = document.createElement("div");
  note.className = "shop-goods-panel__footer-note";
  note.textContent = !activeItem
    ? String(viewModel.emptyStateMessage || "摊布后面现在是空的。")
    : (!activeItem?.purchaseEnabled
        ? "该货物当前不可购买。"
        : (activeItem?.purchaseMode === "instant_consume"
            ? "购买后立即生效，不进入背包。"
            : "购买将按现有背包规则直接入包。"));
  footer.appendChild(note);

  const purchaseBtn = document.createElement("button");
  purchaseBtn.type = "button";
  purchaseBtn.className = "shop-goods-panel__purchase";
  purchaseBtn.dataset.localAction = "shop-goods-panel-purchase";
  purchaseBtn.dataset.purchaseActionId = String(viewModel.purchaseActionId || activeItem?.purchaseActionId || "").trim();
  purchaseBtn.dataset.goodsId = String(activeItem?.id || "").trim();
  purchaseBtn.dataset.mapId = String(viewModel.mapId || currentMapId || "").trim();
  purchaseBtn.textContent = purchasePending ? "处理中" : "购买";
  purchaseBtn.setAttribute("aria-busy", purchasePending ? "true" : "false");
  if (!activeItem?.purchaseEnabled || !purchaseBtn.dataset.purchaseActionId || purchasePending) {
    purchaseBtn.disabled = true;
    purchaseBtn.setAttribute("aria-disabled", "true");
  }
  footer.appendChild(purchaseBtn);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "shop-goods-panel__close";
  closeBtn.dataset.localAction = "shop-goods-panel-close";
  closeBtn.textContent = "关闭";
  footer.appendChild(closeBtn);
  shell.appendChild(footer);

  overlay.appendChild(shell);
  if (typeof hostContainer._shopGoodsPanelCleanup === "function") {
    hostContainer._shopGoodsPanelCleanup();
    hostContainer._shopGoodsPanelCleanup = null;
  }
  hostContainer.innerHTML = "";
  hostContainer.appendChild(overlay);
  hostContainer.setAttribute("aria-hidden", "false");
  hostContainer.hidden = false;
  hostContainer._shopGoodsPanelCleanup = bindShopGoodsPanelLeftScroll({
    hostContainer,
    leftScrollHost,
    goodsGrid,
    scrollbar,
    scrollbarThumb,
    sessionId,
    initialScrollTop: scrollTop
  });
}
let _lastMinuteOfDayForAnim = null;
let _lastAtmospherePhaseKey = null;
let _phaseShiftTimer = null;
let _lastAttrSnapshot = null;
let _lastThermalSnapshot = null;
let _thermalCardUiState = {
  wasTriggering: false,
  pinnedOpen: false,
  manualOpen: false,
  calmTicks: 0,
  lastCalmMinute: null
};
let _attrTooltipEl = null;
let _activeAttrTooltipCard = null;
let _attrTooltipShowTimer = null;
let _attrTooltipHideTimer = null;
let _inventoryEscBound = false;
let _inventoryOverlayClearTimer = null;
let _profileEscBound = false;
let _lastLayoutMode = null;
let _globalHotkeysBound = false;
let _menuHostClockTimer = null;
let _settingsOverlayEl = null;
let _slotPopoverRoot = null;
let _slotPopoverPanel = null;
let _slotPopoverTrigger = null;
let _slotPopoverBound = false;
let _savePageScrollLocked = false;
let _menuLoadRebuildProbeSeq = 0;
let _lowHpFxOverlay = null;
let _timeDetailOpen = false;
let _timeDetailDismissBound = false;
let _lastRenderedUiOverlay = null;
let _lastLiveRenderedSurfaceSnapshot = null;
const LIVE_RENDERED_SURFACE_TRACE_MAX = 240;
let _lastRenderedWorkFeedbackToken = null;
const INLINE_SESSION_HOST_TIMERS = getInlineSessionHostTimerMs(INLINE_SESSION_TRANSITION_PRESET);
let _inlineSessionHostState = "idle";
let _inlineSessionActiveKey = null;
let _inlineSessionActivePhaseKey = null;
let _inlineSessionHostSnapshot = null;
let _inlineSessionMeasuredHeight = 0;
let _inlineSessionEnterTimer = null;
let _inlineSessionPhaseTimer = null;
let _inlineSessionExitTimer = null;
let _sceneTextFxDomSession = null;
let _sceneTextFxSessionRecord = null;
let _sceneTextFxSessionSeq = 0;
let _sceneTextFxSmokeSession = null;
let _sceneTextDomProbeSession = null;
let _sceneTextRenderCycleSeq = 0;
let _finalSceneTextHostSeq = 0;
const _finalSceneTextHostIds = new WeakMap();
let _sceneTextHostAuditSeq = 0;
const _sceneTextHostAuditIds = new WeakMap();
let _sceneTextHostAuditRecords = [];
let _sceneTextHostAuditLastNode = null;
const _sceneTextBoundaryAuditState = {
  policy_output: null,
  view_model_sceneTextFx: null,
  renderer_callsite: null
};
const MENU_PAGE_IDS = new Set(["menu", "menu_more", "menu_main", "menu_load", "menu_settings", "menu_credits", "menu_achievements"]);
const GOV_HALL_WINDOW_HIDDEN_ACTION_IDS = new Set([
  "gov_c_queue_take_number",
  "gov_c_window_enter",
  "gov_c_try_to_d",
  "gov_c_back_a"
]);
const _formalMoneyFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
function getMiniMapHostIdByBranch(branch) {
  if (branch === "clinic") return "clinic-minimap-panel";
  if (branch === "industrial") return "industrial-minimap-panel";
  if (branch === "winddyke") return "winddyke-minimap-panel";
  if (branch === "gov") return "gov-hall-minimap-panel";
  if (branch === "steelcross") return "steelcross-minimap-panel";
  return null;
}

function syncMiniMapPanelAtmosphere(panel, worldTimeContext) {
  if (!panel) return;
  panel.dataset.visibilityBand = String(worldTimeContext?.illumination?.visibilityBand || "clear");
  panel.dataset.lightPhase = String(worldTimeContext?.illumination?.lightPhase || "low_sun");
}

function setMiniMapPanelVariant(panel, variantName = "") {
  if (!panel) return;
  const variantClasses = [
    "minimap-variant-clinic",
    "minimap-variant-winddyke",
    "minimap-variant-industrial",
    "minimap-variant-gov",
    "minimap-variant-steelcross",
    "minimap-variant-transit"
  ];
  panel.classList.remove(...variantClasses);
  if (variantName) panel.classList.add(variantName);
}

function buildMiniMapHeadRowMarkup(title, badge, options = {}) {
  const { showToggle = true } = options;
  return [
    '<div class="minimap-shell-head">',
    `<div class="minimap-shell-title"><span class="clinic-minimap-badge" aria-hidden="true">${escapeHtml(badge)}</span>${escapeHtml(title)}</div>`,
    showToggle
      ? '<button type="button" class="minimap-shell-toggle" aria-expanded="true" aria-label="收起地图" title="收起地图"></button>'
      : '',
    '</div>'
  ].join("");
}

function buildMiniMapShellBodyOpenMarkup(options = {}) {
  const { collapsible = true, canvas = true } = options;
  let html = '';
  if (collapsible) {
    html += '<div class="minimap-shell-collapsible" aria-hidden="false">';
    html += '<div class="minimap-shell-collapsible-inner">';
  }
  html += '<div class="minimap-shell-body">';
  if (canvas) {
    html += '<div class="minimap-shell-canvas">';
  }
  return html;
}

function buildMiniMapShellBodyCloseMarkup(options = {}) {
  const { collapsible = true, canvas = true } = options;
  let html = '';
  if (canvas) html += '</div>';
  html += '</div>';
  if (collapsible) html += '</div></div>';
  return html;
}

function resolveMiniMapDensity(spec) {
  const nodeCount = Array.isArray(spec?.nodes) ? spec.nodes.length : 0;
  const edgeCount = Array.isArray(spec?.edges) ? spec.edges.length : 0;
  const viewBoxHeight = Number(spec?.layoutParams?.viewBoxHeight || spec?.panel?.viewBoxHeight || 0);

  if (nodeCount >= 7 || edgeCount >= 6 || viewBoxHeight >= 168) return "expanded";
  if (nodeCount >= 5 || edgeCount >= 4 || viewBoxHeight >= 152) return "standard";
  return "compact";
}

function bindMiniMapPanelToggle(panel) {
  if (!panel) return;
  const toggle = panel.querySelector(".minimap-shell-toggle");
  const collapsible = panel.querySelector(".minimap-shell-collapsible");
  if (!toggle) return;

  const syncToggleState = () => {
    const collapsed = panel.classList.contains("is-collapsed");
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggle.setAttribute("aria-label", collapsed ? "展开地图" : "收起地图");
    toggle.setAttribute("title", collapsed ? "展开地图" : "收起地图");
    if (collapsible) collapsible.setAttribute("aria-hidden", collapsed ? "true" : "false");
  };

  if (!toggle._hasMiniMapToggleListener) {
    toggle.addEventListener("click", () => {
      panel.classList.toggle("is-collapsed");
      syncToggleState();
    });
    toggle._hasMiniMapToggleListener = true;
  }

  syncToggleState();
}

function finalizeMiniMapPanel(panel, worldTimeContext, spec = null) {
  if (!panel) return;
  panel.setAttribute("aria-hidden", "false");
  if (spec) {
    panel.dataset.minimapDensity = resolveMiniMapDensity(spec);
  } else {
    delete panel.dataset.minimapDensity;
  }
  bindMiniMapPanelToggle(panel);
  const collapsible = panel.querySelector(".minimap-shell-collapsible");
  if (collapsible && !panel.querySelector(".minimap-shell-toggle")) {
    collapsible.setAttribute("aria-hidden", "false");
  }
  syncMiniMapPanelAtmosphere(panel, worldTimeContext);
}

function applyAtmosphereState(worldTimeContext, timeBar) {
  const body = document.body;
  if (!body) return;

  const phase = worldTimeContext?.timePhase;
  const legacyDayNight = worldTimeContext?.legacyDayNight;
  const lightPhase = String(worldTimeContext?.illumination?.lightPhase || "");
  const visibilityBand = String(worldTimeContext?.illumination?.visibilityBand || "");
  const seasonProfile = String(worldTimeContext?.calendar?.seasonProfile || worldTimeContext?.illumination?.seasonProfile || "");
  const serviceBand = String(worldTimeContext?.serviceBand || "");

  const phaseKey = getAtmospherePhaseKey(phase);
  body.dataset.timePhase = phaseKey;
  body.dataset.lightPhase = lightPhase;
  body.dataset.visibilityBand = visibilityBand;
  body.dataset.seasonProfile = seasonProfile;
  body.dataset.serviceBand = serviceBand;

  // deprecated: 仅保留旧样式 / 旧内容桥接，新逻辑不得再把它当自然光真值。
  body.dataset.dayNight = String(legacyDayNight || "").toLowerCase();

  const weather = gameState.world?.weather || {};
  const cloudTrans = Number.isFinite(weather.cloudTrans) ? weather.cloudTrans : 1;
  const snowfallRate = Number.isFinite(weather.snowfallRate) ? weather.snowfallRate : 0;
  const localWind = Number.isFinite(weather.windSpeed_local)
    ? weather.windSpeed_local
    : (Number.isFinite(gameState.world?.windSpeed) ? gameState.world.windSpeed : 0);

  const cloudiness = clamp01(1 - cloudTrans);
  const snowFactor = clamp01(snowfallRate / 3);
  const windFactor = clamp01(localWind / 20);

  body.style.setProperty("--weather-cloudiness", cloudiness.toFixed(3));
  body.style.setProperty("--weather-snow", snowFactor.toFixed(3));
  body.style.setProperty("--weather-wind", windFactor.toFixed(3));

  if (timeBar) {
    timeBar.dataset.phase = phaseKey;
    timeBar.dataset.lightPhase = lightPhase;
    timeBar.dataset.visibilityBand = visibilityBand;
    timeBar.dataset.seasonProfile = seasonProfile;
  }

  if (_lastAtmospherePhaseKey !== null && _lastAtmospherePhaseKey !== phaseKey) {
    body.classList.remove("phase-shift");
    requestAnimationFrame(() => body.classList.add("phase-shift"));
    if (_phaseShiftTimer) clearTimeout(_phaseShiftTimer);
    _phaseShiftTimer = setTimeout(() => {
      body.classList.remove("phase-shift");
      _phaseShiftTimer = null;
    }, 560);
  }

  _lastAtmospherePhaseKey = phaseKey;
}

const SEASON_PROFILE_LABELS_ZH = Object.freeze({
  [SeasonProfile.PolarWinter]: "冬季",
  [SeasonProfile.Transition]: "过渡季",
  [SeasonProfile.PolarSummer]: "夏季"
});

function getSeasonProfileLabelZh(seasonProfile) {
  return SEASON_PROFILE_LABELS_ZH[seasonProfile] ?? "极地季";
}

function formatMonthDayLabel(month, day) {
  const normalizedMonth = Number(month);
  const normalizedDay = Number(day);
  if (!Number.isFinite(normalizedMonth) || !Number.isFinite(normalizedDay)) return "--月--日";
  return `${Math.max(1, Math.trunc(normalizedMonth))}月${Math.max(1, Math.trunc(normalizedDay))}日`;
}

function getTimeBarDateDisplay(useHostClock, worldTimeContext) {
  if (useHostClock) {
    const now = new Date();
    return {
      month: now.getMonth() + 1,
      day: now.getDate(),
      label: formatMonthDayLabel(now.getMonth() + 1, now.getDate())
    };
  }

  const month = worldTimeContext?.calendar?.month;
  const day = worldTimeContext?.calendar?.day;
  return {
    month,
    day,
    label: formatMonthDayLabel(month, day)
  };
}

function formatDaylightHoursLabel(daylightHours) {
  const value = Number(daylightHours);
  if (!Number.isFinite(value)) return "--";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded} 小时` : `${rounded.toFixed(1)} 小时`;
}

function buildTimeDetailNarrative(worldTimeContext) {
  const illumination = worldTimeContext?.illumination || {};
  const lightPhase = String(illumination.lightPhase || "");
  const visibilityBand = String(illumination.visibilityBand || "");

  if (lightPhase === "whiteout" || visibilityBand === "hazard") {
    return "白障条件下，近处参照比远端地标更可靠。";
  }
  if (lightPhase === "polar_night") {
    return "近距轮廓可用，离开照明后方向感会明显下降。";
  }
  if (lightPhase === "twilight") {
    return "微光仍在，外轮廓可辨，但远端对比有限。";
  }
  if (lightPhase === "polar_day") {
    return "极昼反照偏强，远端轮廓会更容易判读。";
  }
  if (visibilityBand === "low") {
    return "近距参照稳定，远端细节会更早消失。";
  }
  return "长时低日照维持中，远端对比仍偏硬。";
}

const TIME_SENSE_COPY_BY_STATE = Object.freeze({
  "清晨": "天刚亮不久。",
  "白天": "天光还稳。",
  "傍晚": "白照正在退去。",
  "深夜": "夜色已经压下来。"
});

function getTimeSenseCopy(senseState) {
  return TIME_SENSE_COPY_BY_STATE[senseState] || TIME_SENSE_COPY_BY_STATE["白天"];
}

function buildTimeReadoutViewModel() {
  const currentMap = getCanonicalCurrentMap(gameState, { source: "renderer:renderTimeBar", repairState: true });
  const useHostClock = shouldUseHostClock(currentMap);
  const tv = useHostClock ? getHostClockTimeView() : getTimeView();
  const worldTimeContext = getWorldTimeContext(tv.totalMinutes, gameState.world);
  const dateDisplay = getTimeBarDateDisplay(useHostClock, worldTimeContext);
  const timeStr = formatTimeHHMM(tv.hour, tv.minute);
  const seasonLabel = getSeasonProfileLabelZh(worldTimeContext.calendar?.seasonProfile);
  const lightLabel = getLightPhaseLabel(worldTimeContext.illumination.lightPhase);
  const visibilityLabel = getVisibilityBandLabel(worldTimeContext.illumination.visibilityBand);
  const timePhaseLabel = GetTimePhaseLabel(worldTimeContext.timePhase);
  const itemsById = getItemsById();
  const capability = resolveTimeReadoutCapability(normalizeEquippedTools(gameState.player?.equippedTools), itemsById);
  const senseState = resolveTimeSenseState(
    worldTimeContext.calendar,
    worldTimeContext.illumination,
    worldTimeContext.timePhase
  );

  return {
    currentMap,
    useHostClock,
    tv,
    worldTimeContext,
    capability,
    dateDisplay,
    timeStr,
    seasonLabel,
    lightLabel,
    visibilityLabel,
    timePhaseLabel,
    detailNarrative: buildTimeDetailNarrative(worldTimeContext),
    senseState,
    senseCopy: getTimeSenseCopy(senseState)
  };
}

function renderTimeSenseCompact(viewModel) {
  return `
    <span class="timebar-segment timebar-segment-main timebar-segment-sense-only">
      <span class="time-main time-main-sense">${escapeHtml(viewModel.senseState)}</span>
    </span>
  `;
}

function renderTimeWatchCompact(viewModel) {
  return `
    <span class="timebar-segment timebar-segment-main">
      <span class="time-main">${escapeHtml(viewModel.timeStr)}</span>
    </span>
    <span class="timebar-segment timebar-segment-status">
      <span class="timebar-status">
        <span class="timebar-status-primary">${escapeHtml(viewModel.senseState)}</span>
      </span>
    </span>
  `;
}

function renderTimeSatelliteCompact(viewModel) {
  return `
    <span class="timebar-segment timebar-segment-day">
      <span class="timebar-day">${escapeHtml(viewModel.dateDisplay.label)}</span>
      <span class="timebar-day-season">${escapeHtml(viewModel.seasonLabel)}</span>
    </span>
    <span class="timebar-segment timebar-segment-main">
      <span class="time-main">${escapeHtml(viewModel.timeStr)}</span>
    </span>
    <span class="timebar-segment timebar-segment-status">
      <span class="timebar-status">
        <span class="timebar-status-primary">${escapeHtml(viewModel.lightLabel)}</span>
        <span class="timebar-status-dot" aria-hidden="true">·</span>
        <span class="timebar-status-secondary">${escapeHtml(viewModel.timePhaseLabel)}</span>
      </span>
    </span>
  `;
}

function renderTimeSenseCard(viewModel) {
  return {
    tabLabel: "时感",
    ariaLabel: "时感",
    markup: `
      <div class="time-detail-body time-detail-body-sense">
        <div class="time-detail-sense-state">${escapeHtml(viewModel.senseState)}</div>
      </div>
      <p class="time-detail-copy time-detail-copy-plain">${escapeHtml(viewModel.senseCopy)}</p>
    `
  };
}

function renderTimeWatchCard(viewModel) {
  return {
    tabLabel: "时间",
    ariaLabel: "时间",
    markup: `
      <div class="time-detail-body">
        <div class="time-detail-clock">${escapeHtml(viewModel.timeStr)}</div>
        <div class="time-detail-phase">${escapeHtml(viewModel.senseState)}</div>
      </div>
      <p class="time-detail-copy time-detail-copy-plain">怀表走时平稳。</p>
    `
  };
}

function renderTimeSatelliteCard(viewModel) {
  return {
    tabLabel: `${viewModel.dateDisplay.label} · ${viewModel.seasonLabel}`,
    ariaLabel: "时间",
    markup: `
      <div class="time-detail-body">
        <div class="time-detail-clock">${escapeHtml(viewModel.timeStr)}</div>
        <div class="time-detail-phase">${escapeHtml(`${viewModel.lightLabel} · ${viewModel.timePhaseLabel}`)}</div>
      </div>
      <div class="time-detail-stats">
        <div class="time-detail-stat">
          <span class="time-detail-stat-label">今日日照</span>
          <strong class="time-detail-stat-value">${escapeHtml(formatDaylightHoursLabel(viewModel.worldTimeContext.illumination.daylightHours))}</strong>
        </div>
        <div class="time-detail-stat">
          <span class="time-detail-stat-label">可见度</span>
          <strong class="time-detail-stat-value">${escapeHtml(viewModel.visibilityLabel)}</strong>
        </div>
      </div>
      <p class="time-detail-copy">${escapeHtml(viewModel.detailNarrative)}</p>
    `
  };
}

function renderTimeCompactSurface(viewModel) {
  const level = String(viewModel?.capability?.level || "none").trim();
  if (level === "satellite") return renderTimeSatelliteCompact(viewModel);
  if (level === "watch") return renderTimeWatchCompact(viewModel);
  return renderTimeSenseCompact(viewModel);
}

function renderTimeCardSurface(viewModel) {
  const level = String(viewModel?.capability?.level || "none").trim();
  if (level === "satellite") return renderTimeSatelliteCard(viewModel);
  if (level === "watch") return renderTimeWatchCard(viewModel);
  return renderTimeSenseCard(viewModel);
}

function applyTimeReadoutPresentation(timeBar, viewModel) {
  const trigger = timeBar?.querySelector("#timebar-trigger");
  const compactContent = timeBar?.querySelector("#timebar-compact-content");
  const detailCard = document.getElementById("timebar-detail-card");
  const detailTab = document.getElementById("timebar-detail-tab");
  const detailContent = document.getElementById("timebar-detail-content");
  const level = String(viewModel?.capability?.level || "none").trim() || "none";
  const cardSurface = renderTimeCardSurface(viewModel);

  if (compactContent) {
    compactContent.innerHTML = renderTimeCompactSurface(viewModel);
  }

  if (detailTab) {
    detailTab.textContent = cardSurface.tabLabel;
  }

  if (detailContent) {
    detailContent.innerHTML = cardSurface.markup;
  }

  if (timeBar) {
    timeBar.dataset.timeReadoutLevel = level;
    timeBar.dataset.timeSenseState = String(viewModel?.senseState || "");
  }

  if (trigger) {
    trigger.classList.toggle("is-sense", level === "none");
    trigger.classList.toggle("is-watch", level === "watch");
    trigger.classList.toggle("is-satellite", level === "satellite");
    trigger.setAttribute("aria-label", level === "none" ? "展开时感" : "展开时间");
  }

  if (detailCard) {
    detailCard.dataset.timeReadoutLevel = level;
    detailCard.dataset.timeSenseState = String(viewModel?.senseState || "");
    detailCard.setAttribute("aria-label", cardSurface.ariaLabel);
  }
}

function syncTimeDetailCardState() {
  const timeBar = document.getElementById("time-bar");
  if (!timeBar) return;

  const trigger = timeBar.querySelector("#timebar-trigger");
  const detailBackdrop = document.getElementById("timebar-detail-backdrop");
  const detailCard = document.getElementById("timebar-detail-card");
  timeBar.classList.toggle("is-detail-open", _timeDetailOpen);
  document.body?.classList.toggle("time-detail-open", _timeDetailOpen);
  if (trigger) trigger.setAttribute("aria-expanded", _timeDetailOpen ? "true" : "false");
  if (detailBackdrop) detailBackdrop.setAttribute("aria-hidden", _timeDetailOpen ? "false" : "true");
  if (detailCard) detailCard.setAttribute("aria-hidden", _timeDetailOpen ? "false" : "true");
}

function setTimeDetailOpen(nextOpen) {
  _timeDetailOpen = !!nextOpen;
  syncTimeDetailCardState();
}

function bindTimeBarInteractions(timeBar) {
  if (!timeBar || timeBar._hasTimeBarBindings) return;

  const trigger = timeBar.querySelector("#timebar-trigger");
  const detailBackdrop = document.getElementById("timebar-detail-backdrop");
  const toggleCard = () => setTimeDetailOpen(!_timeDetailOpen);

  if (trigger) {
    trigger.addEventListener("click", toggleCard);
  }

  if (detailBackdrop) {
    detailBackdrop.addEventListener("click", () => setTimeDetailOpen(false));
  }

  if (!_timeDetailDismissBound) {
    document.addEventListener("pointerdown", (event) => {
      if (!_timeDetailOpen) return;
      const host = document.getElementById("time-bar");
      if (!host || host.contains(event.target)) return;
      setTimeDetailOpen(false);
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && _timeDetailOpen) {
        setTimeDetailOpen(false);
      }
    });
    _timeDetailDismissBound = true;
  }

  timeBar._hasTimeBarBindings = true;
}

function computeGraphDistanceMap(edges, startNodeId) {
  const distances = new Map();
  if (!startNodeId) return distances;

  const adjacency = new Map();
  for (const edge of Array.isArray(edges) ? edges : []) {
    const from = String(edge?.from || "");
    const to = String(edge?.to || "");
    if (!from || !to) continue;
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    if (!adjacency.has(to)) adjacency.set(to, new Set());
    adjacency.get(from).add(to);
    adjacency.get(to).add(from);
  }

  const queue = [startNodeId];
  distances.set(startNodeId, 0);
  while (queue.length) {
    const current = queue.shift();
    const baseDistance = distances.get(current) ?? 0;
    const nextNodes = adjacency.get(current) || [];
    for (const next of nextNodes) {
      if (distances.has(next)) continue;
      distances.set(next, baseDistance + 1);
      queue.push(next);
    }
  }

  return distances;
}

function getMiniMapNodeTone(distance) {
  if (!Number.isFinite(distance)) return "is-far";
  if (distance <= 0) return "is-active";
  if (distance <= 1) return "is-near";
  return "is-far";
}

function getMiniMapEdgeKey(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  return x < y ? `${x}::${y}` : `${y}::${x}`;
}

function buildMiniMapMainPathNodeSet(spec) {
  return new Set(Array.isArray(spec?.mainPathOrder) ? spec.mainPathOrder : []);
}

function buildMiniMapMainPathEdgeSet(spec) {
  const mainPath = Array.isArray(spec?.mainPathOrder) ? spec.mainPathOrder : [];
  const edgeKeys = new Set();
  for (let index = 0; index < mainPath.length - 1; index += 1) {
    edgeKeys.add(getMiniMapEdgeKey(mainPath[index], mainPath[index + 1]));
  }
  return edgeKeys;
}

function getMiniMapNodeSemanticClass(spec, nodeId) {
  const branchMap = spec?.branchOf || {};
  return branchMap[String(nodeId || "")] ? "is-branch-path-node" : "is-main-path-node";
}

function resolveMiniMapActiveEdgeKey(spec, currentNodeId) {
  const currentId = String(currentNodeId || "");
  if (!currentId) return "";

  const branchMap = spec?.branchOf || {};
  const branchHostId = String(branchMap[currentId] || "");
  if (branchHostId) {
    return getMiniMapEdgeKey(branchHostId, currentId);
  }

  const mainPath = Array.isArray(spec?.mainPathOrder) ? spec.mainPathOrder : [];
  const mainPathIndex = mainPath.indexOf(currentId);
  if (mainPathIndex < 0) return "";
  if (mainPathIndex > 0) {
    return getMiniMapEdgeKey(mainPath[mainPathIndex - 1], currentId);
  }
  if (mainPath.length > 1) {
    return getMiniMapEdgeKey(currentId, mainPath[1]);
  }
  return "";
}

function getMiniMapEdgeSemanticClass(mainPathEdgeSet, edge, activeEdgeKey) {
  const semanticClass = mainPathEdgeSet.has(getMiniMapEdgeKey(edge?.from, edge?.to))
    ? "is-main-path-edge"
    : "is-branch-path-edge";
  const edgeKey = getMiniMapEdgeKey(edge?.from, edge?.to);
  const activeClass = activeEdgeKey && edgeKey === activeEdgeKey
    ? " is-active-edge"
    : "";
  return `${semanticClass}${activeClass}`;
}

function buildMiniMapViewportStyle(snapshot) {
  const zoom = Number(snapshot?.zoom);
  const originX = Number(snapshot?.transformOrigin?.x);
  const originY = Number(snapshot?.transformOrigin?.y);
  const scale = Number.isFinite(zoom) ? zoom.toFixed(2) : "1.00";
  const x = Number.isFinite(originX) ? originX.toFixed(2) : "0.00";
  const y = Number.isFinite(originY) ? originY.toFixed(2) : "0.00";
  return `--minimap-scale:${scale};--minimap-origin-x:${x}px;--minimap-origin-y:${y}px;`;
}

function buildMiniMapViewportOpenTag(snapshot) {
  return `<g class="clinic-minimap-viewport" data-focus-zoom="${snapshot?.enabled ? "on" : "off"}" data-active-node="${escapeAttr(snapshot?.activeNodeId || "")}" data-minimap-spec="${escapeAttr(snapshot?.specId || "")}" style="${buildMiniMapViewportStyle(snapshot)}">`;
}

function ensureLowHpFxOverlay() {
  if (_lowHpFxOverlay && document.body?.contains(_lowHpFxOverlay)) return _lowHpFxOverlay;

  let overlay = document.getElementById("hp-fx-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "hp-fx-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = '<div class="hp-fx-vignette"></div><div class="hp-fx-pulse"></div>';
    document.body.appendChild(overlay);
  }

  _lowHpFxOverlay = overlay;
  return overlay;
}

function computeLowHpFxState(hpCur, hpMax = 100, options = {}) {
  const isDead = options?.isDead === true;
  const maxHp = Math.max(1, Number(hpMax || 100));
  const hp = Math.max(0, Math.min(maxHp, Number(hpCur ?? maxHp)));
  const ratio = hp / maxHp;
  const effectiveRatio = isDead ? 0 : ratio;
  const onset = clamp01((0.5 - effectiveRatio) / 0.5);
  const intensity = onset > 0 ? Math.pow(onset, 1.35) : 0;
  const pulse = clamp01((0.25 - effectiveRatio) / 0.25);
  const critical = clamp01((0.1 - effectiveRatio) / 0.1);

  let tier = "none";
  if (isDead) tier = "dead";
  else if (ratio <= 0.1) tier = "critical";
  else if (ratio <= 0.25) tier = "danger";
  else if (ratio <= 0.5) tier = "warn";

  const deadBlend = isDead ? 1 : 0;

  return {
    hp,
    maxHp,
    ratio,
    isDead,
    tier,
    intensity,
    pulse,
    critical,
    vignetteOpacity: 0.12 + intensity * 0.58 + deadBlend * 0.12,
    redOpacity: isDead ? 0.095 : (intensity * 0.52 + critical * 0.18),
    pulseOpacity: isDead ? 0 : (pulse * 0.32 + critical * 0.24),
    coldWashOpacity: isDead ? 0.62 : 0,
    pulseDurationMs: isDead
      ? 1980
      : Math.max(820, Math.round(1780 - pulse * 520 - critical * 320))
  };
}

function clearLowHpFxState() {
  const body = document.body;
  const overlay = ensureLowHpFxOverlay();
  if (body) {
    body.classList.remove("low-hp-active");
    delete body.dataset.lowHpTier;
  }
  overlay.classList.remove("is-active", "is-dead", "tier-warn", "tier-danger", "tier-critical", "tier-dead");
  overlay.style.setProperty("--hp-fx-vignette-opacity", "0");
  overlay.style.setProperty("--hp-fx-red-opacity", "0");
  overlay.style.setProperty("--hp-fx-pulse-opacity", "0");
  overlay.style.setProperty("--hp-fx-coldwash-opacity", "0");
  overlay.style.setProperty("--hp-fx-pulse-duration", "1600ms");
}

function syncLowHpFxState(hpCur, hpMax = 100, options = {}) {
  const overlay = ensureLowHpFxOverlay();
  const body = document.body;
  const state = computeLowHpFxState(hpCur, hpMax, options);

  if (state.intensity <= 0.0001) {
    clearLowHpFxState();
    return state;
  }

  if (body) {
    body.classList.add("low-hp-active");
    body.dataset.lowHpTier = state.tier;
  }

  overlay.classList.add("is-active");
  overlay.classList.toggle("is-dead", state.isDead === true);
  overlay.classList.toggle("tier-warn", state.tier === "warn");
  overlay.classList.toggle("tier-danger", state.tier === "danger");
  overlay.classList.toggle("tier-critical", state.tier === "critical");
  overlay.classList.toggle("tier-dead", state.tier === "dead");
  overlay.style.setProperty("--hp-fx-vignette-opacity", state.vignetteOpacity.toFixed(3));
  overlay.style.setProperty("--hp-fx-red-opacity", state.redOpacity.toFixed(3));
  overlay.style.setProperty("--hp-fx-pulse-opacity", state.pulseOpacity.toFixed(3));
  overlay.style.setProperty("--hp-fx-coldwash-opacity", state.coldWashOpacity.toFixed(3));
  overlay.style.setProperty("--hp-fx-pulse-duration", `${state.pulseDurationMs}ms`);

  return state;
}

function isMenuMainPage(map) {
  return !!map && String(map.id || "") === "menu_main";
}

function syncMenuHostClockLifecycle(map) {
  const shouldRun = shouldUseHostClock(map);
  if (shouldRun) {
    if (_menuHostClockTimer == null) {
      _menuHostClockTimer = window.setInterval(() => {
        renderTimeBar();
      }, 1000);
    }
    return;
  }

  if (_menuHostClockTimer != null) {
    clearInterval(_menuHostClockTimer);
    _menuHostClockTimer = null;
  }
}

function syncSavePageScrollLock(map) {
  const isSavePage = !!map && String(map.id || "") === "menu_load";
  const body = document.body;
  const root = document.documentElement;
  if (!body || !root) return;

  body.classList.toggle("page-save", isSavePage);

  if (isSavePage) {
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    _savePageScrollLocked = true;
    return;
  }

  if (_savePageScrollLocked) {
    root.style.overflow = "";
    body.style.overflow = "";
    _savePageScrollLocked = false;
  }
}

function destroySettingsOverlay() {
  const host = ensureSettingsOverlayHost();
  host.replaceChildren();
  host.setAttribute("aria-hidden", "true");
}

function ensureSettingsOverlayHost() {
  if (_settingsOverlayEl && document.body?.contains(_settingsOverlayEl)) {
    return _settingsOverlayEl;
  }

  let host = document.getElementById("settings-overlay-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "settings-overlay-host";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
  }

  _settingsOverlayEl = host;
  return host;
}

function playSettingsOverlayEnterAnimation(overlay, dialog) {
  if (!overlay || !dialog) return;
  if (typeof overlay.animate !== "function" || typeof dialog.animate !== "function") return;

  overlay.animate(
    [
      { opacity: 0 },
      { opacity: 1 }
    ],
    {
      duration: 180,
      easing: "ease-out"
    }
  );

  dialog.animate(
    [
      { opacity: 0, transform: "translateY(14px) scale(0.985)" },
      { opacity: 1, transform: "translateY(0) scale(1)" }
    ],
    {
      duration: 220,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)"
    }
  );
}

function buildRenderTransitionPolicyContext({ actionId = "", nextMapId = "", nextSurface = {} } = {}) {
  const prevMapId = String(_lastRenderedMapId || "");
  const nextMap = String(nextMapId || gameState.currentMapId || "");
  const normalizedNextSurface = {
    mapId: nextMap || null,
    pageType: String(nextSurface?.pageType || (isMenuMapId(nextMap) ? "menu" : "map") || ""),
    overlayType: nextSurface?.overlayType ?? null,
    modalType: nextSurface?.modalType ?? (gameState?.ui?.modal ?? null)
  };
  const normalizedPrevSurface = {
    mapId: prevMapId || null,
    pageType: prevMapId ? (isMenuMapId(prevMapId) ? "menu" : "map") : "",
    overlayType: _lastRenderedUiOverlay,
    modalType: null
  };

  return {
    actionId: String(actionId || ""),
    prevMapId,
    nextMapId: nextMap,
    prevSurface: normalizedPrevSurface,
    nextSurface: normalizedNextSurface,
    pageType: normalizedNextSurface.pageType,
    overlayType: normalizedNextSurface.overlayType,
    modalType: normalizedNextSurface.modalType
  };
}

function readDomProbeSnapshot(el) {
  if (!el) return null;
  const style = getComputedStyle(el);
  return {
    className: String(el.className || ""),
    dataset: { ...el.dataset },
    hidden: !!el.hidden,
    ariaHidden: el.getAttribute("aria-hidden"),
    animationName: String(style.animationName || ""),
    animationDuration: String(style.animationDuration || ""),
    transitionProperty: String(style.transitionProperty || ""),
    transitionDuration: String(style.transitionDuration || ""),
    transform: String(style.transform || ""),
    opacity: String(style.opacity || "")
  };
}

function runMenuSettingsTransitionDomProbe(actionId) {
  const policy = resolveTransitionPolicy(buildRenderTransitionPolicyContext({
    actionId,
    nextMapId: gameState.currentMapId,
    nextSurface: {
      pageType: isMenuMapId(gameState.currentMapId) ? "menu" : "map",
      overlayType: gameState?.ui?.overlay ?? null,
      modalType: gameState?.ui?.modal ?? null
    }
  }));
  if (policy.surfaceKind !== "menu-like") return;

  const targets = [
    { label: "#app", element: document.getElementById("app") },
    { label: "#choices", element: document.getElementById("choices") },
    { label: "#settings-overlay-host", element: document.getElementById("settings-overlay-host") },
    { label: "#settings-overlay-root", element: document.getElementById("settings-overlay-root") },
    { label: "#settings-overlay-root .SettingsDialog", element: document.querySelector("#settings-overlay-root .SettingsDialog") }
  ];

  const startedAt = Date.now();
  const observers = [];
  const mutationLogs = [];

  console.groupCollapsed(`[MenuSettingsProbe] action=${String(actionId || "")} +0ms`);
  for (const target of targets) {
    const snap = readDomProbeSnapshot(target.element);
    if (!snap) {
      console.log(`[MenuSettingsProbe] ${target.label} missing`);
      continue;
    }

    console.log(`[MenuSettingsProbe] ${target.label}`, snap);

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const attr = String(record.attributeName || "");
        if (attr !== "class" && attr !== "style" && !attr.startsWith("data-")) continue;
        mutationLogs.push({
          tMs: Date.now() - startedAt,
          target: target.label,
          attr,
          oldValue: record.oldValue,
          newValue: target.element?.getAttribute(attr)
        });
      }
    });

    observer.observe(target.element, {
      attributes: true,
      attributeOldValue: true,
      subtree: false
    });
    observers.push(observer);
  }

  setTimeout(() => {
    for (const observer of observers) observer.disconnect();
    if (mutationLogs.length === 0) {
      console.log("[MenuSettingsProbe] no class/style/data-* mutations within 300ms");
    } else {
      console.log("[MenuSettingsProbe] mutation logs (<=300ms)", mutationLogs);
    }
    console.groupEnd();
  }, 300);
}

function syncSettingsOverlayLifecycle(map) {
  const isSettingsPage = !!map && String(map.id || "") === "menu_settings";
  if (!isSettingsPage) {
    destroySettingsOverlay();
  }
}

function ensureAttrTooltipHost() {
  if (_attrTooltipEl && document.body.contains(_attrTooltipEl)) {
    return _attrTooltipEl;
  }

  const el = document.createElement("div");
  el.id = "attr-tooltip-layer";
  el.className = "attr-tooltip-layer";
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);
  _attrTooltipEl = el;
  return el;
}

function positionAttrTooltip(anchor) {
  if (!anchor || !_attrTooltipEl) return;

  const rect = anchor.getBoundingClientRect();
  const tip = _attrTooltipEl;
  const pad = 10;
  const gap = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (anchor.classList?.contains("thermal-help-dot")) {
    let left = rect.right + 8;
    if (left + tip.offsetWidth > vw - pad) {
      left = rect.left - tip.offsetWidth - 8;
    }
    left = Math.max(pad, Math.min(vw - tip.offsetWidth - pad, left));

    let top = rect.top - 2;
    if (top + tip.offsetHeight > vh - pad) {
      top = vh - tip.offsetHeight - pad;
    }
    top = Math.max(pad, top);

    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.dataset.arrow = left < rect.left ? "right" : "left";
    return;
  }

  let left = rect.left - tip.offsetWidth - gap;
  if (left < pad) {
    left = rect.right + gap;
  }
  if (left + tip.offsetWidth > vw - pad) {
    left = Math.max(pad, vw - tip.offsetWidth - pad);
  }

  let top = rect.top + rect.height * 0.5 - tip.offsetHeight * 0.5;
  top = Math.max(pad, Math.min(vh - tip.offsetHeight - pad, top));

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
  tip.dataset.arrow = left < rect.left ? "right" : "left";
}

function showAttrTooltip(anchor) {
  const raw = String(anchor?.dataset?.hoverDesc || "").trim();
  if (!raw) {
    hideAttrTooltip();
    return;
  }

  const tip = ensureAttrTooltipHost();
  tip.textContent = raw;
  tip.classList.add("is-visible");
  tip.setAttribute("aria-hidden", "false");
  _activeAttrTooltipCard = anchor;
  positionAttrTooltip(anchor);
}

function cancelAttrTooltipTimers() {
  if (_attrTooltipShowTimer) {
    clearTimeout(_attrTooltipShowTimer);
    _attrTooltipShowTimer = null;
  }
  if (_attrTooltipHideTimer) {
    clearTimeout(_attrTooltipHideTimer);
    _attrTooltipHideTimer = null;
  }
}

function scheduleShowAttrTooltip(anchor, delayMs = 250) {
  cancelAttrTooltipTimers();
  _attrTooltipShowTimer = setTimeout(() => {
    _attrTooltipShowTimer = null;
    showAttrTooltip(anchor);
  }, Math.max(0, delayMs));
}

function scheduleHideAttrTooltip(delayMs = 80) {
  if (_attrTooltipShowTimer) {
    clearTimeout(_attrTooltipShowTimer);
    _attrTooltipShowTimer = null;
  }
  if (_attrTooltipHideTimer) {
    clearTimeout(_attrTooltipHideTimer);
  }
  _attrTooltipHideTimer = setTimeout(() => {
    _attrTooltipHideTimer = null;
    hideAttrTooltip();
  }, Math.max(0, delayMs));
}

function hideAttrTooltip() {
  cancelAttrTooltipTimers();
  if (!_attrTooltipEl) return;
  _attrTooltipEl.classList.remove("is-visible");
  _attrTooltipEl.setAttribute("aria-hidden", "true");
  _activeAttrTooltipCard = null;
}

function bindSidebarAttrTooltip(sidebar) {
  if (!sidebar._hasAttrTooltipListener) {
    sidebar.addEventListener("mouseover", (event) => {
      const card = event.target.closest("[data-hover-desc]");
      if (!card || !sidebar.contains(card)) return;
      scheduleShowAttrTooltip(card, 250);
    });

    sidebar.addEventListener("mousemove", () => {
      if (_activeAttrTooltipCard) {
        positionAttrTooltip(_activeAttrTooltipCard);
      }
    });

    sidebar.addEventListener("mouseout", (event) => {
      const card = event.target.closest("[data-hover-desc]");
      if (!card) return;
      const related = event.relatedTarget;
      if (related && card.contains(related)) return;
      scheduleHideAttrTooltip(80);
    });

    sidebar.addEventListener("focusin", (event) => {
      const card = event.target.closest("[data-hover-desc]");
      if (!card || !sidebar.contains(card)) return;
      cancelAttrTooltipTimers();
      showAttrTooltip(card);
    });

    sidebar.addEventListener("focusout", (event) => {
      const card = event.target.closest("[data-hover-desc]");
      if (!card) return;
      const next = event.relatedTarget;
      if (next && card.contains(next)) return;
      scheduleHideAttrTooltip(80);
    });

    window.addEventListener("resize", () => {
      if (_activeAttrTooltipCard) {
        positionAttrTooltip(_activeAttrTooltipCard);
      }
    });

    sidebar._hasAttrTooltipListener = true;
  }

  const scrollHost = sidebar.querySelector(".status-scroll") || sidebar;
  if (!sidebar._attrTooltipScrollHandler) {
    sidebar._attrTooltipScrollHandler = () => {
      if (_activeAttrTooltipCard) {
        positionAttrTooltip(_activeAttrTooltipCard);
      }
    };
  }
  if (sidebar._attrTooltipScrollHost !== scrollHost) {
    if (sidebar._attrTooltipScrollHost) {
      sidebar._attrTooltipScrollHost.removeEventListener("scroll", sidebar._attrTooltipScrollHandler);
    }
    scrollHost.addEventListener("scroll", sidebar._attrTooltipScrollHandler, { passive: true });
    sidebar._attrTooltipScrollHost = scrollHost;
  }
}

function bindThermalCardToggleAnimation(sidebar) {
  const details = sidebar.querySelector("details.thermal-card");
  if (!details || details._hasThermalToggleAnimBound) return;

  const summary = details.querySelector("summary.thermal-summary");
  const content = details.querySelector(".thermal-content");
  if (!summary || !content) return;

  const easing = "cubic-bezier(0.22, 1, 0.36, 1)";

  function cancelRunningAnim() {
    if (!content._thermalToggleAnim) return;
    try {
      content._thermalToggleAnim.cancel();
    } catch {}
    content._thermalToggleAnim = null;
  }

  function animateOpen() {
    cancelRunningAnim();
    details.open = true;
    content.style.display = "grid";
    content.style.overflow = "hidden";
    content.style.maxHeight = "0px";
    content.style.opacity = "0";
    content.style.transform = "translateY(-4px)";
    content.style.paddingBottom = "0px";

    requestAnimationFrame(() => {
      const endHeight = Math.max(1, content.scrollHeight);
      const anim = content.animate(
        [
          { maxHeight: "0px", opacity: 0, transform: "translateY(-4px)", paddingBottom: "0px" },
          { maxHeight: `${endHeight}px`, opacity: 1, transform: "translateY(0)", paddingBottom: "10px" }
        ],
        { duration: 240, easing, fill: "forwards" }
      );
      content._thermalToggleAnim = anim;
      anim.onfinish = () => {
        content._thermalToggleAnim = null;
        content.style.maxHeight = "560px";
        content.style.opacity = "1";
        content.style.transform = "translateY(0)";
        content.style.paddingBottom = "10px";
      };
    });
  }

  function animateClose() {
    cancelRunningAnim();
    content.style.display = "grid";
    content.style.overflow = "hidden";
    const startHeight = Math.max(1, content.scrollHeight, Math.round(content.getBoundingClientRect().height));
    const anim = content.animate(
      [
        { maxHeight: `${startHeight}px`, opacity: 1, transform: "translateY(0)", paddingBottom: "10px" },
        { maxHeight: "0px", opacity: 0, transform: "translateY(-4px)", paddingBottom: "0px" }
      ],
      { duration: 180, easing, fill: "forwards" }
    );
    content._thermalToggleAnim = anim;
    anim.onfinish = () => {
      content._thermalToggleAnim = null;
      content.style.maxHeight = "0px";
      content.style.opacity = "0";
      content.style.transform = "translateY(-4px)";
      content.style.paddingBottom = "0px";
      details.open = false;
    };
  }

  summary.addEventListener("click", (event) => {
    event.preventDefault();
    if (details.open) {
      _thermalCardUiState.manualOpen = false;
      _thermalCardUiState.pinnedOpen = false;
      _thermalCardUiState.calmTicks = 0;
      _thermalCardUiState.lastCalmMinute = null;
      animateClose();
      return;
    }
    _thermalCardUiState.manualOpen = true;
    _thermalCardUiState.pinnedOpen = true;
    _thermalCardUiState.calmTicks = 0;
    _thermalCardUiState.lastCalmMinute = null;
    animateOpen();
  });

  details._hasThermalToggleAnimBound = true;
}

function setSidebarStatusContent(sidebar, innerHtml) {
  sidebar.classList.add("status-panel");
  sidebar.innerHTML = `<div class="status-scroll">${innerHtml}</div>`;
}

function ensureStatusDock() {
  let dock = document.getElementById("statusDock");
  if (!dock) {
    dock = document.createElement("div");
    dock.id = "statusDock";
    dock.className = "status-dock is-expanded";

    const toggle = document.createElement("button");
    toggle.id = "sidebar-toggle";
    toggle.className = "status-handle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "toggle status");

    const sidebar = document.createElement("aside");
    sidebar.id = "player-sidebar";
    sidebar.className = "status-panel";

    dock.appendChild(toggle);
    dock.appendChild(sidebar);
    document.body.appendChild(dock);
  }

  let sidebar = document.getElementById("player-sidebar");
  if (!sidebar) {
    sidebar = document.createElement("aside");
    sidebar.id = "player-sidebar";
    sidebar.className = "status-panel";
    dock.appendChild(sidebar);
  }

  let toggle = document.getElementById("sidebar-toggle");
  if (toggle && !toggle._hasStatusDockListener) {
    toggle.addEventListener("click", () => {
      dock.classList.toggle("is-collapsed");
      dock.classList.toggle("is-expanded");
      const collapsed = dock.classList.contains("is-collapsed");
      document.body.classList.toggle("sidebar-collapsed", collapsed);
      document.body.classList.toggle("sidebar-expanded", !collapsed);
      const map = getCanonicalCurrentMap(gameState, { source: "renderer:ensureStatusDock", repairState: true });
      const mode = map && isMenuMapId(map.id) ? "menu" : "game";
      applySidebarLayout(mode);
    });
    toggle._hasStatusDockListener = true;
  }

  const bodyCollapsed = document.body.classList.contains("sidebar-collapsed");
  dock.classList.toggle("is-collapsed", bodyCollapsed);
  dock.classList.toggle("is-expanded", !bodyCollapsed);

  const map = getCanonicalCurrentMap(gameState, { source: "renderer:ensureStatusDock:layout", repairState: true });
  const mode = map && isMenuMapId(map.id) ? "menu" : "game";
  applySidebarLayout(mode);

  return { dock, sidebar, toggle };
}

/**
 * 渲染顶部固定时间栏（不与地图 JSON 绑定）
 * 任何渲染刷新都应调用此函数，确保时间栏始终存在且显示最新时间
 */
function renderTimeBar() {
  // ========== 1. 查找或创建时间栏 DOM ==========
  let timeBar = document.getElementById("time-bar");
  let createdTimeBar = false;

  if (!timeBar) {
    timeBar = document.createElement("div");
    timeBar.id = "time-bar";
    createdTimeBar = true;
  }

  if (!timeBar.querySelector("#timebar-trigger") || !timeBar.querySelector("#timebar-compact-content")) {
    timeBar.innerHTML = `
      <div class="timebar-inner">
        <div class="timebar-anchor" id="timebar-anchor">
          <button type="button" class="timebar-trigger" id="timebar-trigger" aria-expanded="false" aria-haspopup="dialog" aria-controls="timebar-detail-card" aria-label="展开时感">
            <span class="timebar-compact-content" id="timebar-compact-content"></span>
          </button>
        </div>
      </div>
    `;
    timeBar._hasTimeBarBindings = false;
  }

  let detailLayer = document.getElementById("timebar-detail-layer");
  if (!detailLayer) {
    detailLayer = document.createElement("div");
    detailLayer.id = "timebar-detail-layer";
    document.body.appendChild(detailLayer);
  }

  if (!detailLayer.querySelector("#timebar-detail-card") || !detailLayer.querySelector("#timebar-detail-content")) {
    detailLayer.innerHTML = `
      <div class="time-detail-backdrop" id="timebar-detail-backdrop" aria-hidden="true"></div>
      <section class="time-detail-card" id="timebar-detail-card" role="dialog" aria-label="时感" aria-hidden="true">
        <div class="time-detail-tab" id="timebar-detail-tab">时感</div>
        <div class="time-detail-content" id="timebar-detail-content"></div>
      </section>
    `;
    timeBar._hasTimeBarBindings = false;
  }

  if (createdTimeBar || timeBar.parentElement !== document.body) {
    document.body.insertBefore(timeBar, document.body.firstChild);

    const app = document.getElementById("app");
    if (app) {
      app.style.paddingTop = "64px"; // 预留移动端更高时间栏的安全间距
    }

    const choices = document.getElementById("choices");
    if (choices) {
      choices.style.marginTop = "8px";
    }
  }

  bindTimeBarInteractions(timeBar);

  // ========== 2. 更新时间栏内容 ==========
  const viewModel = buildTimeReadoutViewModel();
  applyTimeReadoutPresentation(timeBar, viewModel);

  applyAtmosphereState(viewModel.worldTimeContext, timeBar);
  publishWorldTimeDebug(viewModel.worldTimeContext.totalMinutes, gameState.world);
  syncTimeDetailCardState();

  if (_lastMinuteOfDayForAnim !== null && _lastMinuteOfDayForAnim !== viewModel.tv.minuteOfDay) {
    timeBar.classList.remove("timebar-tick");
    requestAnimationFrame(() => timeBar.classList.add("timebar-tick"));
  }
  _lastMinuteOfDayForAnim = viewModel.tv.minuteOfDay;
}

function getGovHallRuntimeState() {
  const tv = getTimeView();
  const minuteOfDay = Number(tv?.minuteOfDay ?? 0);
  const isDay = minuteOfDay >= 360 && minuteOfDay <= 1079; // 06:00-17:59

  const dayIndex = Math.floor(Math.max(0, Number(gameState?.time?.totalMinutes ?? 0)) / 1440);
  const weekday = dayIndex % 7; // 0=Mon ... 6=Sun
  const isWeekdayOpen = weekday >= 0 && weekday <= 5;
  const isNormalBusiness = isWeekdayOpen && minuteOfDay >= 540 && minuteOfDay <= 1079; // 09:00-17:59
  const nightEmergencyOpen = !!(gameState?.world?.flags?.govHallNightEmergencyOpen || gameState?.flags?.govHallNightEmergencyOpen);
  const isEmergencyNightBusiness = !isDay && isWeekdayOpen && nightEmergencyOpen;
  const isOpen = isNormalBusiness || isEmergencyNightBusiness;

  return {
    isDay,
    isOpen,
    key: `${isDay ? "day" : "night"}_${isOpen ? "open" : "closed"}`
  };
}

function readStatePath(path) {
  const raw = String(path || "").trim();
  if (!raw) return undefined;
  const parts = raw.split(".");
  let cur = gameState;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

function renderDescriptionTemplate(text) {
  return String(text || "").replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_m, path) => {
    const value = readStatePath(path);
    return value == null ? "" : String(value);
  });
}

function isGovHallWindowInteractionOpen(map) {
  if (!map || String(map.id || "") !== "gov_hall_main_hall") return false;
  return gameState?.world?.flags?.govHallWindowMenuOpen === true;
}

function pickMapTitle(map) {
  if (isGovHallWindowInteractionOpen(map)) {
    return "政务大厅 · 窗口";
  }
  return map?.name || "";
}

function pickMapDescription(map) {
  return pickMapDescriptionResult(map).text;
}

function isDebugBuildEnabledForSceneTags() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location?.search || "");
    if (params.get("debugBuild") === "1") return true;
    return window.localStorage?.getItem("cc:debugBuild") === "1";
  } catch {
    return false;
  }
}

function pickMapDescriptionResult(map) {
  const runtimeDescription = resolveMapRuntimeDescriptionResult(String(map?.id || ""), map);
  if (typeof runtimeDescription?.text === "string" && runtimeDescription.text.trim()) {
    return {
      text: runtimeDescription.text,
      sceneTags: Array.isArray(runtimeDescription.sceneTags) ? runtimeDescription.sceneTags : []
    };
  }

  if (map && String(map.id || "") === "gov_hall_main_hall") {
    if (gameState?.world?.flags?.govHallCDialogWindowRejected === true) {
      return { text: "窗口业务员指了指叫号屏：\n\n“没有取号不要捣乱！”", sceneTags: [] };
    }
    if (gameState?.world?.flags?.govHallCDialogQueueRejected === true) {
      return { text: "业务员瞟了你一眼：\n\n“不要重复取号！”", sceneTags: [] };
    }
    if (gameState?.world?.flags?.govHallCDialogQueueSuccess === true) {
      return {
        text: renderDescriptionTemplate("业务员按下取号键：\n\n“取号成功，你的号码为{{world.flags.govHallQueueNumber}}号”"),
        sceneTags: []
      };
    }

    if (Array.isArray(map.descriptionByFlags)) {
      for (const row of map.descriptionByFlags) {
        const path = String(row?.path || "").trim();
        const expected = row?.equals;
        const text = String(row?.text || "").trim();
        if (!path || !text) continue;

        const cur = readStatePath(path);
        if (cur === expected) return { text: renderDescriptionTemplate(text), sceneTags: [] };
      }
    }

    if (isGovHallWindowInteractionOpen(map)) {
      return {
        text: "你来到窗口处，业务员抬头扫了你一眼\n“你好，请出示你的证件。\n有什么能帮到你的？”",
        sceneTags: []
      };
    }
  }

  if (map && Array.isArray(map.descriptionByFlags)) {
    for (const row of map.descriptionByFlags) {
      const path = String(row?.path || "").trim();
      const expected = row?.equals;
      const text = String(row?.text || "").trim();
      if (!path || !text) continue;

      const cur = readStatePath(path);

      if (cur === expected) return { text: renderDescriptionTemplate(text), sceneTags: [] };
    }
  }

  if (map && map.descriptionByRuntimeState && typeof map.descriptionByRuntimeState === "object") {
    const { key } = getGovHallRuntimeState();
    const text = String(map.descriptionByRuntimeState[key] || "").trim();
    if (text) return { text, sceneTags: [] };
  }

  // TODO(Phase 4): remaining descriptionByMinuteOfDay content still uses legacy time slicing and should migrate into map_content_runtime.
  if (!map || !Array.isArray(map.descriptionByMinuteOfDay)) {
    return {
      text: map?.description || "",
      sceneTags: []
    };
  }

  const tv = getTimeView();
  const m = tv.minuteOfDay;

  for (const it of map.descriptionByMinuteOfDay) {
    const start = Number(it?.start);
    const end = Number(it?.end);
    const text = String(it?.text ?? "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || !text) continue;

    // 支持跨夜区间：start > end
    const hit = start <= end
      ? (m >= start && m <= end)
      : (m >= start || m <= end);
    if (hit) {
      return {
        text,
        sceneTags: []
      };
    }
  }

  return {
    text: map.description || "",
    sceneTags: []
  };
}

function renderMapSceneTags(sceneTags) {
  const items = Array.isArray(sceneTags) ? sceneTags : [];
  if (items.length <= 0) return "";
  const visibleItems = isDebugBuildEnabledForSceneTags()
    ? items
    : items.filter((tag) => String(tag?.visibility || "internal") === "player");
  if (visibleItems.length <= 0) return "";
  return `
    <div class="map-scene-tags" aria-label="当前场景标签">
      ${visibleItems.map((tag) => `<span class="map-scene-tag-chip" data-scene-tag-id="${escapeHtml(String(tag.tagId || ""))}">${escapeHtml(String(tag.label || ""))}</span>`).join("")}
    </div>
  `;
}

function computeSceneSignatureForTransition(map) {
  // 目标：把“同一张地图内的场景切换”也纳入过渡动画触发，而不是靠 dispatch 手动打标。
  if (!map || typeof map.id !== "string") return null;
  const isGovHall = map.id.startsWith("gov_hall_");
  const hasFlagVariants = Array.isArray(map.descriptionByFlags);
  const hasRuntimeVariants = !!(map.descriptionByRuntimeState && typeof map.descriptionByRuntimeState === "object");

  // 通用：只要用了 descriptionByFlags，就认为存在“同图多场景”语义。
  // 特例：政务大厅还存在 runtimeState + action 集合的场景切换。
  if (!hasFlagVariants && !isGovHall) return null;

  const chunks = [];

  if (isGovHall && hasRuntimeVariants) {
    const { key } = getGovHallRuntimeState();
    chunks.push(`rt:${key}`);
  }

  if (hasFlagVariants) {
    let hit = "none";
    for (const row of map.descriptionByFlags) {
      const path = String(row?.path || "").trim();
      if (!path) continue;

      const parts = path.split(".");
      let cur = gameState;
      for (const part of parts) {
        if (cur == null || typeof cur !== "object") {
          cur = undefined;
          break;
        }
        cur = cur[part];
      }

      if (cur === row?.equals) {
        hit = `${path}==${String(row?.equals)}`;
        break;
      }
    }
    chunks.push(`df:${hit}`);
  }

  if (isGovHall && Array.isArray(map.actions)) {
    const { isOpen } = getGovHallRuntimeState();
    const visible = [];

    for (const action of map.actions) {
      const id = String(action?.id || "");
      if (!id) continue;

      // 与 renderMapActions 保持一致：非营业时隐藏窗口引导入口
      if (id === "gov_b_window_intro" && !isOpen) continue;

      let suffix = "";
      if (action?.requires) {
        const r = evaluateRequires(gameState, action.requires);
        if (!r.ok) {
          const lockedBehavior = action?.ui?.lockedBehavior ?? "hide";
          if (lockedBehavior !== "show") continue;
          suffix = "#locked";
        }
      }

      visible.push(`${id}${suffix}`);
    }

    chunks.push(`a:${visible.join(",")}`);
  }

  return `${map.id}|${chunks.join("|")}`;
}

/**
 * 统一时间 UI 刷新入口（每次时间推进都应调用）
 * @param {number} minuteOfDay
 */
export function UpdateTimeUI(minuteOfDay) {
  // 目前时间栏内容来自 getTimeView() 的唯一真值；minuteOfDay 保留作未来优化（按切换点更新）
  void minuteOfDay;
  renderTimeBar();
}

function isMenuMapId(mapId) {
  return isMenuPageId(mapId);
}

function isMenuLikeMapId(mapId) {
  const id = String(mapId || "").trim();
  if (!id) return false;
  return isMenuMapId(id);
}

function shouldIgnoreHotkeyTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable='true']")) return true;
  return false;
}

function ensureGlobalHotkeys() {
  if (_globalHotkeysBound) return;

  document.addEventListener("keydown", async (event) => {
    if (event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (shouldIgnoreHotkeyTarget(event.target)) return;

    const settings = settingsManager.getSettings();
    if (!settings?.quickKeys) return;

    const key = String(event.key || "").toLowerCase();
    const mapId = String(getCanonicalMapId(gameState) || "");
    const inMenu = isMenuMapId(mapId);
    const route = resolveUiSurface(gameState, { source: "hotkeys" });
    const overlayType = String(route.overlayType || "");
    const { dispatch } = await import("./pipeline/dispatch.js");

    if (key === "escape") {
      if (overlayType === "inventory") {
        event.preventDefault();
        await dispatch("ui_close_inventory");
        return;
      }
      if (overlayType === "tasks") {
        event.preventDefault();
        await closeTasksOverlay();
        return;
      }
      if (gameState.ui?.profileOpen === true) {
        event.preventDefault();
        const host = document.getElementById("profile-overlay-host");
        await closeProfileOverlay(host, {
          dispatchClose: () => dispatch("ui_profile_close")
        });
        return;
      }
      if (inMenu && mapId !== "menu_main") {
        event.preventDefault();
        await dispatch("menu_back_main");
      }
      return;
    }

    if (key === "i" && !inMenu && overlayType !== "inventory") {
      event.preventDefault();
      await dispatch("ui_open_inventory");
      return;
    }

    if (key === "j" && !inMenu && overlayType !== "tasks") {
      event.preventDefault();
      await dispatch("ui_tasks_open");
      return;
    }

    if (key === "m" && !inMenu) {
      event.preventDefault();
      if (overlayType === UI_OVERLAY_TYPES.MAP_MINIMAP) {
        await dispatch("ui_map_close");
      } else {
        await dispatch("ui_map_open");
      }
      return;
    }

    if (key === "s" && !inMenu) {
      event.preventDefault();
      await dispatch("ui_open_save_menu");
    }
  });

  _globalHotkeysBound = true;
}

function setHudVisibility(visible) {
  const dock = document.getElementById("statusDock");
  const sidebar = document.getElementById("player-sidebar");
  const toggle = document.getElementById("sidebar-toggle");
  const minimap = document.getElementById("clinic-minimap-panel");
  const industrialMinimap = document.getElementById("industrial-minimap-panel");
  const winddykeMinimap = document.getElementById("winddyke-minimap-panel");
  const govHallMinimap = document.getElementById("gov-hall-minimap-panel");
  const steelcrossMinimap = document.getElementById("steelcross-minimap-panel");
  const transitMinimap = document.getElementById("transit-minimap-panel");
  const inventoryDock = document.getElementById("inventory-dock-toggle");

  if (dock) dock.style.display = visible ? "block" : "none";
  if (sidebar) sidebar.style.display = visible ? "block" : "none";
  if (toggle) toggle.style.display = visible ? "block" : "none";
  if (minimap) minimap.style.display = visible ? "" : "none";
  if (industrialMinimap) industrialMinimap.style.display = visible ? "" : "none";
  if (winddykeMinimap) winddykeMinimap.style.display = visible ? "" : "none";
  if (govHallMinimap) govHallMinimap.style.display = visible ? "" : "none";
  if (steelcrossMinimap) steelcrossMinimap.style.display = visible ? "" : "none";
  if (transitMinimap) transitMinimap.style.display = visible ? "" : "none";
  if (inventoryDock) inventoryDock.style.display = visible ? "block" : "none";
}

function ensureInventoryDockButton() {
  const btn = document.getElementById("inventory-dock-toggle");
  if (btn?.parentElement) {
    btn.parentElement.removeChild(btn);
  }
  return null;
}

function ensureInventoryOverlayHost() {
  let host = document.getElementById("inventory-overlay-host");
  const gameRoot = document.getElementById("game-root");
  if (!gameRoot) return null;

  if (!host) {
    host = document.createElement("div");
    host.id = "inventory-overlay-host";
    host.setAttribute("aria-hidden", "true");

    host.addEventListener("click", async (event) => {
      const actionTarget = event.target.closest("[data-action-id]");
      if (actionTarget && host.contains(actionTarget)) {
        const actionId = actionTarget.dataset.actionId;
        if (!actionId) return;
        const { dispatch } = await import("./pipeline/dispatch.js");
        await dispatch(actionId);
        return;
      }

      const backdrop = event.target.closest(".inventory-backdrop");
      if (backdrop && host.contains(backdrop)) {
        const { dispatch } = await import("./pipeline/dispatch.js");
        await dispatch("ui_close_inventory");
      }
    });

    document.body.appendChild(host);
  }

  if (!_inventoryEscBound) {
    document.addEventListener("keydown", async (event) => {
      if (event.key !== "Escape") return;
      if (gameState.ui?.overlay !== "inventory") return;
      const settings = settingsManager.getSettings();
      if (!settings?.quickKeys) return;
      const { dispatch } = await import("./pipeline/dispatch.js");
      await dispatch("ui_close_inventory");
    });
    _inventoryEscBound = true;
  }

  if (host.parentElement !== document.body) {
    document.body.appendChild(host);
  }

  return host;
}

function makeInventoryTextItemButton(actionId, text, selected = false, extraClass = "") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.actionId = actionId;
  btn.className = `inventory-text-btn${selected ? " is-selected" : ""}${extraClass ? ` ${extraClass}` : ""}`;
  btn.textContent = text;
  return btn;
}

function isToolEquipVerifyEnabled() {
  try {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(String(window.location?.search || "")).get("toolEquipVerify") === "1";
  } catch {
    return false;
  }
}

function publishToolRenderDebug(payload) {
  // Dev-only render snapshot for tool equipment verification. Hidden unless
  // toolEquipVerify=1 is present in the URL.
  if (!isToolEquipVerifyEnabled()) return;
  const scope = typeof window !== "undefined" ? window : globalThis;
  scope.__CC_TOOL_RENDER_DEBUG__ = payload
    ? {
        inventory: payload.inventory && typeof payload.inventory === "object"
          ? {
              tool_thermometer: Math.max(0, Math.floor(Number(payload.inventory.tool_thermometer) || 0)),
              tool_vitals_monitor: Math.max(0, Math.floor(Number(payload.inventory.tool_vitals_monitor) || 0)),
              tool_small_flashlight: Math.max(0, Math.floor(Number(payload.inventory.tool_small_flashlight) || 0))
            }
          : {
              tool_thermometer: 0,
              tool_vitals_monitor: 0,
              tool_small_flashlight: 0
            },
        equippedTools: Array.isArray(payload.equippedTools)
          ? payload.equippedTools.map((entry) => ({
              itemId: String(entry?.itemId || ""),
              toolTag: String(entry?.toolTag || "")
            }))
          : [],
        equipment: payload.equipment && typeof payload.equipment === "object"
          ? { ...payload.equipment }
          : null,
        thermal: payload.thermal && typeof payload.thermal === "object"
          ? { ...payload.thermal }
          : null,
        equippedToolEntries: Array.isArray(payload.equippedToolEntries)
          ? payload.equippedToolEntries.map((entry) => ({
              itemId: String(entry?.itemId || ""),
              toolTag: String(entry?.toolTag || ""),
              toolTagLabel: String(entry?.toolTagLabel || ""),
              itemName: String(entry?.item?.name || entry?.itemId || "")
            }))
          : [],
        selectedToolTagLabel: payload.selectedToolTagLabel ? String(payload.selectedToolTagLabel) : null,
        vitalsMonitorEnabled: payload.vitalsMonitorEnabled === true
      }
    : null;
}

function installToolVerifyRuntimeHelpers() {
  // Dev-only runtime helper for the one-off tool equipment verifier. This must
  // never be exposed in default runtime.
  if (!isToolEquipVerifyEnabled()) return;
  const scope = typeof window !== "undefined" ? window : globalThis;
  if (typeof scope.__CC_TOOL_VERIFY_ACTION__ !== "function") {
    scope.__CC_TOOL_VERIFY_ACTION__ = async (actionId, payload = {}) => {
      return dispatch(String(actionId || ""), payload || {});
    };
  }
}

function trackInventoryGainHighlights() {
  return undefined;
}

function collectInventoryGainHighlightIds() {
  return collectInventoryGainHighlightIdsFromController();
}

function toFiniteUiNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getWearableThermalStats(item) {
  const thermal = item?.wearable?.thermal && typeof item.wearable.thermal === "object"
    ? item.wearable.thermal
    : (item?.thermal && typeof item.thermal === "object" ? item.thermal : {});

  return {
    insulation: clamp01(toFiniteUiNumber(thermal?.insulation, 0)),
    windproof: clamp01(toFiniteUiNumber(thermal?.windproof, 0))
  };
}

function buildWeakPointTooltip(topWeakSlots = []) {
  if (!Array.isArray(topWeakSlots) || topWeakSlots.length === 0) {
    return "当前无明显弱点槽位";
  }

  return topWeakSlots
    .map((row, index) => `${index + 1}. ${row.slotLabel} · ${row.itemName}${row.missing ? " · 缺失" : ""} · leak ${row.leakPowerMeanTerm.toFixed(3)}`)
    .join("\n");
}

function formatSignedEtaDeltaMinutes(value) {
  const minutes = Math.round(toFiniteUiNumber(value, 0));
  if (minutes > 0) return `+${minutes}m`;
  if (minutes < 0) return `${minutes}m`;
  return "±0m";
}

function getEtaDeltaTone(value) {
  const minutes = toFiniteUiNumber(value, 0);
  if (minutes > 0.49) return "is-up";
  if (minutes < -0.49) return "is-down";
  return "is-neutral";
}

function toWindKmh(value) {
  return toFiniteUiNumber(value, 0) * 3.6;
}

function buildWeakSlotContributionTooltip(row, index) {
  if (!row) return "拖累贡献不可用";
  return [
    `Top${index + 1} 拖累：${row.slotLabel}`,
    `当前：${row.itemName}${row.missing ? "（未装备）" : ""}`,
    `I ${row.insulation.toFixed(2)} · W ${row.windproof.toFixed(2)}`,
    `风漏拖累项 ${row.leakPowerMeanTerm.toFixed(3)}`,
    row.missing ? "该槽位未装备，会显著缩短生存时间。" : "该槽位越漏风，整体 ETA 越短。"
  ].join("\n");
}

function getWeakSeverityLabel(share) {
  const ratio = toFiniteUiNumber(share, 0);
  if (ratio >= 0.45) return "强";
  if (ratio >= 0.25) return "中";
  return "弱";
}

function buildWeakSeverityRows(topWeakSlots = []) {
  const rows = Array.isArray(topWeakSlots) ? topWeakSlots.slice(0, 3) : [];
  const total = rows.reduce((sum, row) => sum + Math.max(0, toFiniteUiNumber(row?.leakPowerMeanTerm, 0)), 0);
  return rows.map((row) => {
    const share = total > 0 ? Math.max(0, toFiniteUiNumber(row?.leakPowerMeanTerm, 0)) / total : 0;
    return {
      ...row,
      share,
      severity: getWeakSeverityLabel(share)
    };
  });
}

function buildWeakReasonText(severityRows = []) {
  if (!Array.isArray(severityRows) || severityRows.length === 0) {
    return "主要短板：当前无明显短板";
  }
  return `主要短板：${severityRows.map((row) => `${row.slotLabel}${row.missing ? "缺失" : "偏弱"}(${row.severity})`).join(" · ")}`;
}

function buildEmptySlotHintTooltip(slot, severityRows = []) {
  const slotRow = Array.isArray(severityRows)
    ? severityRows.find((row) => String(row?.slot || "") === String(slot || ""))
    : null;
  return [
    "未装备：该槽位按“漏风缺失”参与 W_eff，显著缩短暴露时间",
    `建议优先补全：${slotRow ? slotRow.severity : "视当前短板而定"}`
  ].join("\n");
}

function buildExposureBaselineUi(mapId = gameState.currentMapId, world = gameState.world) {
  const baselineWindMs = 4.167;
  const placeProfile = getPlaceProfileForMap(mapId) || null;
  const worldWindMs = Math.max(0, toFiniteUiNumber(world?.windSpeed ?? world?.weather?.windSpeed_local, 0));
  const localWindMs = placeProfile ? computeLocalWind(worldWindMs, placeProfile) : worldWindMs;
  const currentSpace = String(placeProfile?.space || "outdoor");
  const exposureLevel = String(placeProfile?.exposureLevel || "Open");
  const bias = localWindMs - baselineWindMs;
  let biasLabel = "当前环境≈基准";
  let biasTone = "is-neutral";
  if (currentSpace === "indoor" || localWindMs <= baselineWindMs * 0.45) {
    biasLabel = "当前环境偏宽松";
    biasTone = "is-up";
  } else if (bias >= 0.6) {
    biasLabel = "当前环境偏严苛";
    biasTone = "is-down";
  }

  const basisTooltip = [
    "ETA 基准说明",
    "- 失能 / 致死时间仅由当前防护分数 P 映射",
    "- 读法按外界 Open、15km/h 风锚点理解",
    "- 室内 / 遮蔽 / 低风时，实际通常更宽松",
    "- 强风 / 高暴露时，实际通常更严苛"
  ].join("\n");

  const biasTooltip = [
    `当前区域：${currentSpace === "indoor" ? "室内" : "室外"} / ${exposureLevel}`,
    `局地风：${localWindMs.toFixed(2)}m/s（${Math.round(toWindKmh(localWindMs))}km/h）`,
    `基准风：${baselineWindMs.toFixed(2)}m/s（15km/h）`,
    biasLabel === "当前环境偏宽松"
      ? "当前风暴露低于基准，实际生存时间通常比芯片更长。"
      : biasLabel === "当前环境偏严苛"
        ? "当前风暴露高于基准，实际生存时间通常比芯片更短。"
        : "当前环境与基准接近，可直接把芯片当作近似读数。"
  ].join("\n");
  const differsFromBaseline = currentSpace !== "outdoor"
    || exposureLevel !== "Open"
    || Math.abs(localWindMs - baselineWindMs) > 0.35;
  const compareNotice = differsFromBaseline ? "当前环境≠基准，时间仅用于比较" : "";
  const currentSpaceLabel = currentSpace === "indoor" ? "室内" : "室外";
  const currentWindText = `风速 ${Math.round(toWindKmh(localWindMs))}km/h`;

  return {
    basisText: "基准：外界 Open · 风速 15km/h · 湿度适中",
    basisLine1: "外界 Open",
    basisLine2: "风速 15km/h · 湿度适中",
    basisTooltip,
    biasLabel,
    biasTone,
    biasTooltip,
    currentText: `${currentSpaceLabel} / ${exposureLevel} · ${currentWindText}`,
    currentLine1: `${currentSpaceLabel} / ${exposureLevel}`,
    currentLine2: compareNotice ? `${currentWindText} · ${compareNotice}` : currentWindText,
    currentTempText: `${computeEnvTempC(world, placeProfile).toFixed(1)}°C`,
    compareNotice,
    isReference: differsFromBaseline,
    summaryTagText: differsFromBaseline ? "参考" : "基准",
    lockTags: [
      world?.thermalEnvLocked ? "已锁定（开发）" : "",
      world?.windLocked ? "已锁定（开发）" : "",
      world?.wetnessLocked ? "已锁定（开发）" : ""
    ].filter(Boolean)
  };
}

function buildProtectionProfileUi(equipment, itemsById = getItemsById()) {
  const safeEquipment = normalizeEquipment(equipment);
  const weights = PLAYER_DEFS.equipmentWeights || {};
  const defs = PLAYER_DEFS.temperature?.exposureModel || {};
  const windLeakPower = Math.max(1, toFiniteUiNumber(defs?.windLeakPower, 1.6));
  const profile = computeEquipmentProtectionProfile(safeEquipment, itemsById, weights, defs);
  const timings = computeExposureDurations(profile.protectionScore, defs);

  const slotContrib = EQUIPMENT_SLOT_ORDER.map((slot) => {
    const itemId = String(safeEquipment?.[slot] || "").trim();
    const item = itemId && itemsById?.get ? itemsById.get(itemId) : null;
    const thermal = getWearableThermalStats(item);
    const leak = Math.max(1e-6, 1 - thermal.windproof);
    const weight = Math.max(0, toFiniteUiNumber(weights?.[slot], 0));
    const leakPowerMeanTerm = weight * Math.pow(leak, windLeakPower);
    return {
      slot,
      slotLabel: EQUIPMENT_SLOT_LABELS[slot],
      itemId: itemId || null,
      itemName: item?.name || "—",
      missing: !itemId,
      insulation: thermal.insulation,
      windproof: thermal.windproof,
      leakPowerMeanTerm
    };
  });

  const topWeakSlots = [...slotContrib]
    .sort((a, b) => b.leakPowerMeanTerm - a.leakPowerMeanTerm)
    .slice(0, 3);

  return {
    insulationEff: profile.insulationEff,
    windproofEff: profile.windproofEff,
    protectionScore: profile.protectionScore,
    timings,
    slotContrib,
    topWeakSlots,
    weakPointTooltip: buildWeakPointTooltip(topWeakSlots)
  };
}

function buildUnequipCandidatePreview(slot, equipment, itemsById = getItemsById()) {
  const normalizedSlot = String(slot || "").trim();
  if (!normalizedSlot) return null;
  const current = buildProtectionProfileUi(equipment, itemsById);
  const nextEquipment = normalizeEquipment({
    ...equipment,
    [normalizedSlot]: null
  });
  const preview = buildProtectionProfileUi(nextEquipment, itemsById);
  return {
    slot: normalizedSlot,
    slotLabel: EQUIPMENT_SLOT_LABELS[normalizedSlot] || normalizedSlot,
    current,
    preview,
    deltaIncap: toFiniteUiNumber(preview.timings?.T_incap, 0) - toFiniteUiNumber(current.timings?.T_incap, 0),
    deltaDeath: toFiniteUiNumber(preview.timings?.T_death, 0) - toFiniteUiNumber(current.timings?.T_death, 0)
  };
}

function buildClothingCandidatePreview(item, equipment, itemsById = getItemsById()) {
  const slot = String(item?.equipSlot || item?.wearable?.slot || "").trim();
  if (!slot) return null;

  const current = buildProtectionProfileUi(equipment, itemsById);
  const nextEquipment = normalizeEquipment({
    ...equipment,
    [slot]: String(item?.id || "").trim() || null
  });
  const preview = buildProtectionProfileUi(nextEquipment, itemsById);

  return {
    slot,
    slotLabel: EQUIPMENT_SLOT_LABELS[slot] || slot,
    current,
    preview,
    nextEquipment,
    deltaIncap: toFiniteUiNumber(preview.timings?.T_incap, 0) - toFiniteUiNumber(current.timings?.T_incap, 0),
    deltaDeath: toFiniteUiNumber(preview.timings?.T_death, 0) - toFiniteUiNumber(current.timings?.T_death, 0)
  };
}

function getItemDescriptionLines(item, limit = 3) {
  if (Array.isArray(item?.description)) {
    return item.description
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .slice(0, limit);
  }
  const text = String(item?.description || item?.desc || "").trim();
  if (!text) return [];
  return text.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean).slice(0, limit);
}

function getItemDescriptionText(item, limit = Infinity) {
  return getItemDescriptionLines(item, limit).join("\n").trim();
}

function makeInventoryMiniMetricBar(label, value) {
  const wrap = document.createElement("div");
  wrap.className = "inventory-mini-metric";

  const top = document.createElement("div");
  top.className = "inventory-mini-metric-top";

  const labelEl = document.createElement("span");
  labelEl.className = "inventory-mini-metric-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "inventory-mini-metric-value";
  valueEl.textContent = clamp01(toFiniteUiNumber(value, 0)).toFixed(2);

  const bar = document.createElement("div");
  bar.className = "inventory-mini-metric-bar";

  const fill = document.createElement("div");
  fill.className = "inventory-mini-metric-fill";
  fill.style.width = `${(clamp01(toFiniteUiNumber(value, 0)) * 100).toFixed(1)}%`;

  top.appendChild(labelEl);
  top.appendChild(valueEl);
  bar.appendChild(fill);
  wrap.appendChild(top);
  wrap.appendChild(bar);
  return wrap;
}

function createClothingInventoryRow(rowView) {
  const isSelected = rowView?.isSelected === true;
  const isEquipped = rowView?.isEquipped === true;
  const isNewGain = rowView?.isNewGain === true;
  const rowBtn = document.createElement("button");
  rowBtn.type = "button";
  rowBtn.dataset.actionId = String(rowView?.actionId || "");
  rowBtn.dataset.itemId = String(rowView?.itemId || "");
  rowBtn.dataset.slot = String(rowView?.slot || "");
  rowBtn.className = `inventory-item-row candidateRow is-clothing${isSelected ? " is-selected isSelected" : ""}${isNewGain ? " is-new-gain" : ""}`;

  const left = document.createElement("div");
  left.className = "inventory-item-left";

  const titleRow = document.createElement("div");
  titleRow.className = "inventory-item-title-row";

  const nameEl = document.createElement("div");
  nameEl.className = "inventory-item-name";
  nameEl.textContent = String(rowView?.name || "");
  titleRow.appendChild(nameEl);

  if (isSelected) {
    const selectedTag = document.createElement("span");
    selectedTag.className = "inventory-item-tag selectedTag";
    selectedTag.textContent = "选中";
    titleRow.appendChild(selectedTag);
  }

  if (isEquipped) {
    const equippedTag = document.createElement("span");
    equippedTag.className = "inventory-item-tag";
    equippedTag.textContent = "已装备";
    titleRow.appendChild(equippedTag);
  }

  const metaEl = document.createElement("div");
  metaEl.className = "inventory-item-meta";
  metaEl.textContent = `${String(rowView?.slotLabel || "服装")} · x${Math.max(0, Number(rowView?.qty || 0))}`;
  const descText = String(rowView?.descText || "").trim();
  const exposureEl = document.createElement("div");
  exposureEl.className = "inventory-item-exposure";

  const exposureGrid = document.createElement("div");
  exposureGrid.className = "inventory-item-exposure-grid";
  if (isEquipped) {
    const equippedWord = document.createElement("span");
    equippedWord.className = "inventory-item-delta-label";
    equippedWord.textContent = "当前已装备";
    exposureGrid.appendChild(equippedWord);
  } else if (rowView?.preview) {
    const incapLabel = document.createElement("span");
    incapLabel.className = "inventory-item-delta-label";
    incapLabel.textContent = "Δ失能";
    const incapValue = document.createElement("span");
    incapValue.className = `inventory-item-delta ${String(rowView.preview.deltaIncapTone || "is-neutral")}`;
    incapValue.textContent = String(rowView.preview.deltaIncapText || "±0m");

    const deathLabel = document.createElement("span");
    deathLabel.className = "inventory-item-delta-label";
    deathLabel.textContent = "Δ致死";
    const deathValue = document.createElement("span");
    deathValue.className = `inventory-item-delta ${String(rowView.preview.deltaDeathTone || "is-neutral")}`;
    deathValue.textContent = String(rowView.preview.deltaDeathText || "±0m");

    exposureGrid.appendChild(incapLabel);
    exposureGrid.appendChild(incapValue);
    exposureGrid.appendChild(deathLabel);
    exposureGrid.appendChild(deathValue);
  }
  exposureEl.appendChild(exposureGrid);
  if (descText) {
    const desc = document.createElement("div");
    desc.className = "inventory-item-desc itemDescClamp2";
    desc.textContent = descText;
    exposureEl.appendChild(desc);
  }

  left.appendChild(titleRow);
  left.appendChild(metaEl);
  left.appendChild(exposureEl);

  const right = document.createElement("div");
  right.className = "inventory-item-right";
  const thermal = rowView?.thermal || { insulation: 0, windproof: 0 };
  right.appendChild(makeInventoryMiniMetricBar("I", thermal.insulation));
  right.appendChild(makeInventoryMiniMetricBar("W", thermal.windproof));

  rowBtn.appendChild(left);
  rowBtn.appendChild(right);
  return rowBtn;
}

function buildClothingRecommendations(clothingEntries, equipment, itemsById, severityRows = []) {
  const uniqueSlots = [];
  for (const row of severityRows) {
    if (!row?.slot) continue;
    if (uniqueSlots.includes(row.slot)) continue;
    uniqueSlots.push(row.slot);
  }
  if (uniqueSlots.length === 0) {
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      if (equipment?.[slot]) continue;
      uniqueSlots.push(slot);
      if (uniqueSlots.length >= 3) break;
    }
  }

  return uniqueSlots.slice(0, 3).map((slot) => {
    const slotLabel = EQUIPMENT_SLOT_LABELS[slot] || slot;
    const severity = severityRows.find((row) => row.slot === slot)?.severity || "弱";
    const candidates = clothingEntries
      .filter((entry) => String(entry.item?.equipSlot || "") === slot)
      .map((entry) => ({
        entry,
        preview: buildClothingCandidatePreview(entry.item, equipment, itemsById)
      }))
      .sort((a, b) => toFiniteUiNumber(b.preview?.deltaDeath, -Infinity) - toFiniteUiNumber(a.preview?.deltaDeath, -Infinity));

    const best = candidates[0] || null;
    return {
      slot,
      slotLabel,
      severity,
      available: !!best,
      bestItemName: best?.entry?.item?.name || "",
      deltaIncap: toFiniteUiNumber(best?.preview?.deltaIncap, 0),
      deltaDeath: toFiniteUiNumber(best?.preview?.deltaDeath, 0)
    };
  });
}

function resolveClothingSlotVisibility() {
  return {
    visibleSlots: [...EQUIPMENT_SLOT_ORDER],
    hiddenSlots: [],
    hiddenMissingCount: 0
  };
}

function sortClothingCandidates(entries = [], equipment = {}, itemsById = getItemsById(), sortMode = "death") {
  const metricKey = sortMode === "incap" ? "deltaIncap" : "deltaDeath";
  const secondaryKey = sortMode === "incap" ? "deltaDeath" : "deltaIncap";
  return entries
    .map((entry) => ({
      ...entry,
      isEquipped: EQUIPMENT_SLOT_ORDER.some((slot) => equipment?.[slot] === entry.row.itemId),
      preview: buildClothingCandidatePreview(entry.item, equipment, itemsById)
    }))
    .sort((a, b) => {
      if (a.isEquipped !== b.isEquipped) return a.isEquipped ? 1 : -1;
      const primaryDelta = toFiniteUiNumber(b.preview?.[metricKey], -Infinity) - toFiniteUiNumber(a.preview?.[metricKey], -Infinity);
      if (Math.abs(primaryDelta) > 1e-6) return primaryDelta;
      const secondaryDelta = toFiniteUiNumber(b.preview?.[secondaryKey], -Infinity) - toFiniteUiNumber(a.preview?.[secondaryKey], -Infinity);
      if (Math.abs(secondaryDelta) > 1e-6) return secondaryDelta;
      return String(a.item?.name || "").localeCompare(String(b.item?.name || ""), "zh-CN");
    });
}

function resolveThermalProtectionUi(player, itemsById = getItemsById()) {
  const equipment = normalizeEquipment(player?.equipment);
  const hasEquipment = EQUIPMENT_SLOT_ORDER.some((slot) => !!String(equipment?.[slot] || "").trim());
  const computed = buildProtectionProfileUi(equipment, itemsById);
  if (!hasEquipment) return computed;

  const thermal = player?.gear?.thermal || {};
  const cachedI = Number(thermal?.insulationEff);
  const cachedW = Number(thermal?.windproofEff);
  const cachedP = Number(thermal?.protectionScore);
  const cacheMissing = !Number.isFinite(cachedI) || !Number.isFinite(cachedW) || !Number.isFinite(cachedP);
  const cacheAllZero = Math.abs(cachedI || 0) < 1e-9 && Math.abs(cachedW || 0) < 1e-9 && Math.abs(cachedP || 0) < 1e-9;
  if (cacheMissing || cacheAllZero) {
    return computed;
  }

  return {
    ...computed,
    insulationEff: cachedI,
    windproofEff: cachedW,
    protectionScore: cachedP,
    timings: computeExposureDurations(cachedP, PLAYER_DEFS.temperature?.exposureModel || {})
  };
}

function estimateIndoorWarmUi(player, placeProfile, temperatureC) {
  const indoorWarmDefs = PLAYER_DEFS.temperature?.indoorWarm || {};
  const coreDefs = PLAYER_DEFS.temperature?.coreTemp || {};
  const targetC = Number(indoorWarmDefs?.targetC ?? coreDefs?.T_core_normal ?? 37);
  const epsilonC = Math.max(0.0001, Number(indoorWarmDefs?.epsilonC ?? 0.1) || 0.1);
  const fullRecoverHours = Number(indoorWarmDefs?.fullRecoverHours ?? 4) || 4;
  const overrideK = Number(indoorWarmDefs?.kPerHourOverride);
  const kPerHour = Number.isFinite(overrideK)
    ? Math.max(0, overrideK)
    : computeExpRecoverKPerHour({
        deltaWorstC: Math.max(0, targetC - Number(coreDefs?.T_core_min ?? 20)),
        epsilonC,
        hours: fullRecoverHours
      });
  const effMul = computeIndoorWarmRecoveryEfficiencyMul(player, {}, placeProfile, indoorWarmDefs);
  const appliedK = Math.max(0, kPerHour * effMul);
  const gap = Math.max(0, targetC - Number(temperatureC ?? targetC));
  const deltaText = `+${gap.toFixed(1)}°C`;

  if (gap <= epsilonC) {
    return {
      targetC,
      epsilonC,
      status: "稳定",
      deltaC: gap,
      deltaText: "+0.0°C",
      etaMinutes: 0,
      etaDisplay: "0m",
      summaryText: "0m",
      verboseText: `已进入回满带（±${epsilonC.toFixed(1)}°C）`
    };
  }

  if (appliedK <= 0) {
    return {
      targetC,
      epsilonC,
      status: "回温中",
      deltaC: gap,
      deltaText,
      etaMinutes: Infinity,
      etaDisplay: "—",
      summaryText: "—",
      verboseText: "按当前回暖效率，ETA 暂不可估"
    };
  }

  const etaMinutes = Math.max(1, Math.ceil((Math.log(gap / epsilonC) / appliedK) * 60));
  const etaDisplay = formatThermalEtaMinutes(etaMinutes);
  return {
    targetC,
    epsilonC,
    status: "回温中",
    deltaC: gap,
    deltaText,
    etaMinutes,
    etaDisplay,
    summaryText: etaDisplay,
    verboseText: `按当前回暖效率，预计 ${etaDisplay} 回满`
  };
}

function ensureProfileOverlayHost() {
  let host = document.getElementById("profile-overlay-host");
  const gameRoot = document.getElementById("game-root");
  if (!gameRoot) return null;

  if (!host) {
    host = document.createElement("div");
    host.id = "profile-overlay-host";
    host.setAttribute("aria-hidden", "true");

    host.addEventListener("click", async (event) => {
      const actionTarget = event.target.closest("[data-action-id]");
      if (actionTarget && host.contains(actionTarget)) {
        const actionId = actionTarget.dataset.actionId;
        if (!actionId) return;
        event.preventDefault();
        event.stopPropagation();
        const { dispatch } = await import("./pipeline/dispatch.js");
        if (actionId === "ui_profile_close") {
          await closeProfileOverlay(host, {
            dispatchClose: () => dispatch("ui_profile_close")
          });
          return;
        }
        await dispatch(actionId);
        return;
      }

      const backdrop = event.target.closest(".profile-page-backdrop");
      if (backdrop && host.contains(backdrop)) {
        event.preventDefault();
        event.stopPropagation();
        const { dispatch } = await import("./pipeline/dispatch.js");
        await closeProfileOverlay(host, {
          dispatchClose: () => dispatch("ui_profile_close")
        });
      }
    });

    document.body.appendChild(host);
  }

  if (!_profileEscBound) {
    document.addEventListener("keydown", async (event) => {
      if (event.key !== "Escape") return;
      if (gameState.ui?.profileOpen !== true) return;
      const settings = settingsManager.getSettings();
      if (!settings?.quickKeys) return;
      const { dispatch } = await import("./pipeline/dispatch.js");
      await closeProfileOverlay(host, {
        dispatchClose: () => dispatch("ui_profile_close")
      });
    });
    _profileEscBound = true;
  }

  if (host.parentElement !== document.body) {
    document.body.appendChild(host);
  }

  return host;
}

function renderTaskBodyTokens(container, task, refData) {
  container.innerHTML = "";
  const tokens = Array.isArray(task?.body) ? task.body : [];
  const defaultRefData = createDefaultRefData();
  if (tokens.length === 0) {
    container.textContent = "（无详细内容）";
    return;
  }

  for (const token of tokens) {
    if (token.t === "ref") {
      const span = document.createElement("span");
      span.className = `task-ref ref-${String(token.refType || "")}`;
      const refType = String(token.refType || "");
      span.dataset.refType = refType;
      span.dataset.refId = String(token.refId || "");
      if (refType === "ship") {
        const shipId = String(token.refId || "");
        const ship = {
          ...(defaultRefData?.ships?.[shipId] || {}),
          ...(refData?.ships?.[shipId] || {})
        };
        span.dataset.refTitle = String(ship?.name || token.label || token.refId || "词条");
        span.dataset.refTooltip = String(ship?.tooltip || "");
        span.textContent = token.label || ship?.name || token.refId || "词条";
      } else {
        const placeId = String(token.refId || "");
        const place = {
          ...(defaultRefData?.places?.[placeId] || {}),
          ...(refData?.places?.[placeId] || {})
        };
        span.dataset.refTitle = String(place?.name || token.label || token.refId || "引用");
        span.dataset.refOpenHours = String(place?.openHours || "暂无营业时间信息");
        span.dataset.refLocation = String(place?.location || "");
        span.textContent = token.label || place?.name || token.refId || "引用";
      }
      container.appendChild(span);
    } else {
      const text = document.createElement("span");
      text.className = "task-text";
      text.textContent = String(token.v || "");
      container.appendChild(text);
    }
  }
}

function buildTasksOverlayRenderModel(map, hostContainer) {
  const tasks = sortTaskEntries(normalizeTaskList(gameState?.player?.tasks));
  const selectedId = String(gameState?.ui?.taskSelectedId || "").trim();
  const activeTask = tasks.find(x => x.id === selectedId) || tasks[0] || null;

  return {
    kind: "tasks",
    map,
    mapName: String(map?.name || "当前区域"),
    hostContainer,
    tasks,
    activeTask,
    refData: gameState?.world?.refData || createDefaultRefData()
  };
}

function buildInventoryOverlayRenderModel(map, hostContainer) {
  const shouldAnimateIn = hostContainer.getAttribute("aria-hidden") !== "false";
  return {
    kind: "inventory",
    map,
    shouldAnimateIn,
    viewModel: buildInventoryOverlayViewModel({
      state: gameState,
      map
    })
  };
}

function buildSettingsOverlayRenderModel(hostContainer) {
  const settingsUi = getSettingsOverlayUiState();
  const stats = settingsManager.getStorageStats();

  return {
    kind: "settings",
    hostContainer,
    settings: settingsManager.getSettings(),
    stats,
    activeTab: settingsUi.activeTab,
    scrollTop: readSettingsOverlayScrollTop(settingsUi.activeTab),
    tabs: [
      { id: "display", label: "显示" },
      { id: "performance", label: "性能" },
      { id: "interaction", label: "交互" },
      { id: "data", label: "存档与数据" }
    ]
  };
}

function commitTasksOverlay(map, hostContainer) {
  const viewModel = buildTasksOverlayRenderModel(map, hostContainer);
  const vmValidation = validateTasksOverlayViewModel(viewModel);
  const safeViewModel = vmValidation.ok
    ? viewModel
    : {
      kind: "tasks",
      map: (viewModel && typeof viewModel.map === "object")
        ? viewModel.map
        : (map && typeof map === "object" ? map : { id: String(gameState?.currentMapId || ""), name: "当前区域" }),
      mapName: String(viewModel?.mapName || map?.name || "当前区域"),
      hostContainer,
      tasks: Array.isArray(viewModel?.tasks) ? viewModel.tasks : [],
      activeTask: viewModel?.activeTask || null,
      refData: viewModel?.refData || createDefaultRefData()
    };
  renderTasksPage(safeViewModel, hostContainer);
  return {
    viewModel: safeViewModel,
    vmValidation
  };
}

function commitInventoryOverlay(map, hostContainer) {
  const transaction = createHostRenderTransaction(hostContainer);
  renderInventoryPage(buildInventoryOverlayRenderModel(map, hostContainer), transaction.draft);
  commitHostRenderTransaction(transaction);
}

function commitProfileOverlay(map, hostContainer) {
  if (!hostContainer) return;
  const transaction = createHostRenderTransaction(hostContainer);
  const viewModel = buildProfileOverlayViewModel({
    mapName: String(map?.name || "当前区域"),
    profileViewModel: getProfileViewModel(gameState.player?.profile),
    world: gameState?.world || {},
    worldFlags: gameState?.world?.flags || gameState?.flags || {}
  });
  renderProfileOverlayPage(viewModel, transaction.draft);
  commitHostRenderTransaction(transaction);
  const overlay = hostContainer.querySelector(".profile-page-overlay");
  showProfileOverlay(hostContainer, overlay);
}

function commitRecordsOverlay(map, hostContainer) {
  if (!hostContainer) return;
  renderActiveRecordsOverlay(hostContainer, map);
}

function commitSocialOverlay(map, hostContainer) {
  if (!hostContainer) return;
  renderActiveSocialOverlay(hostContainer, map);
}

function isDossierUnlocked(state) {
  const flags = state?.world?.flags || state?.flags || {};
  if (!!flags.dossierUnlocked) return true;
  if (!!flags.govHallHasTempId) return true;
  return false;
}

function hasDossierAttention(state) {
  const flags = state?.world?.flags || state?.flags || {};
  return !!flags.dossierNeedsAttention;
}

function commitSettingsOverlay(hostContainer) {
  const transaction = createHostRenderTransaction(hostContainer);
  renderMenuSettingsActions(buildSettingsOverlayRenderModel(hostContainer), transaction.draft);
  commitHostRenderTransaction(transaction);
}

function buildMapMiniMapOverlayRenderModel(map) {
  return {
    kind: UI_OVERLAY_TYPES.MAP_MINIMAP,
    map,
    mapId: String(map?.id || "")
  };
}

function commitMapMiniMapOverlay(viewModel) {
  renderContextMiniMap(viewModel?.map || null, UI_OVERLAY_TYPES.MAP_MINIMAP);
  const mapId = String(viewModel?.mapId || viewModel?.map?.id || "");
  const branch = resolveMapMiniMapBranch(mapId);
  return {
    hostId: getMiniMapHostIdByBranch(branch) || "map-main-host"
  };
}

let _mapOverlayRegistry = null;
let _overlayTransitionManager = null;
const _overlayTransitionRuntimeContext = {
  actionIdForTrace: "",
  selectedSurface: null,
  uiStateRenderStart: null,
  getHosts: () => null
};

function getRenderedOverlayActiveHostId(hosts) {
  const isOpen = (host) => !!host && host.getAttribute("aria-hidden") === "false" && host.hidden !== true;
  const transitPanel = document.getElementById("transit-minimap-panel");
  if (isOpen(hosts?.tasks)) return "tasks-overlay-host";
  if (isOpen(hosts?.inventory)) return "inventory-overlay-host";
  if (isOpen(hosts?.mapMiniMap?.clinic)) return "clinic-minimap-panel";
  if (isOpen(hosts?.mapMiniMap?.industrial)) return "industrial-minimap-panel";
  if (isOpen(hosts?.mapMiniMap?.winddyke)) return "winddyke-minimap-panel";
  if (isOpen(hosts?.mapMiniMap?.gov)) return "gov-hall-minimap-panel";
  if (isOpen(document.getElementById("steelcross-minimap-panel"))) return "steelcross-minimap-panel";
  if (isOpen(transitPanel)) return "transit-minimap-panel";
  return "map-main-host";
}

function applyLegacyOverlayCleanupCompat(hosts) {
  // Legacy compat: clear stale overlay state markers so old DOM residue cannot steer visibility.
  const touch = (host) => {
    if (!host) return;
    if (host.hidden === true || host.getAttribute("aria-hidden") === "true") {
      host.classList.remove("is-open", "is-active");
      host.dataset.active = "false";
      host.dataset.open = "false";
    }
  };
  touch(hosts?.tasks);
  touch(hosts?.inventory);
  touch(hosts?.mapMiniMap?.clinic);
  touch(hosts?.mapMiniMap?.industrial);
  touch(hosts?.mapMiniMap?.winddyke);
  touch(hosts?.mapMiniMap?.gov);
}

function getOverlayTransitionManager() {
  if (_overlayTransitionManager) return _overlayTransitionManager;
  _overlayTransitionManager = createOverlayTransitionManager({
    getReducedMotion: () => {
      try {
        return !!window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      } catch {
        return false;
      }
    },
    getRenderedActiveHostId: () => getRenderedOverlayActiveHostId(_overlayTransitionRuntimeContext.getHosts()),
    onTrace: (event) => {
      const renderedActiveHostId = getRenderedOverlayActiveHostId(_overlayTransitionRuntimeContext.getHosts());
      pushUiOverlayTrace({
        source: String(event?.stage || "overlay_transition"),
        actionId: _overlayTransitionRuntimeContext.actionIdForTrace,
        prevUiPage: null,
        nextUiPage: String(gameState.ui?.page || ""),
        prevUiOverlay: null,
        nextUiOverlay: String(gameState.ui?.overlay || "") || null,
        resolvedOverlay: String(gameState.ui?.overlay || "") || null,
        renderedOverlay: String(gameState.ui?.overlay || "") || null,
        hostId: String(event?.toHostId || event?.fromHostId || "") || null,
        currentMapId: String(gameState.currentMapId || ""),
        currentSceneId: String(gameState.currentSceneId || "") || null,
        violationCode: null,
        errorMessage: `from=${String(event?.fromHostId || "map-main-host")} to=${String(event?.toHostId || "map-main-host")} preset=${String(event?.preset || "")} canonical=${String(event?.canonicalOverlay || "none")} rendered=${renderedActiveHostId}`
      });
      pushUiRouteTrace({
        source: String(event?.stage || "overlay_transition"),
        actionId: _overlayTransitionRuntimeContext.actionIdForTrace,
        prevUiPage: null,
        nextUiPage: String(gameState.ui?.page || ""),
        prevUiOverlay: null,
        nextUiOverlay: String(gameState.ui?.overlay || "") || null,
        prevCurrentMapId: null,
        nextCurrentMapId: String(gameState.currentMapId || ""),
        prevCurrentSceneId: null,
        nextCurrentSceneId: String(gameState.currentSceneId || "") || null,
        resolvedPageType: String(_overlayTransitionRuntimeContext.selectedSurface?.pageType || ""),
        resolvedOverlayType: String(gameState.ui?.overlay || "") || null,
        renderHost: renderedActiveHostId,
        violationCode: null,
        errorMessage: `from=${String(event?.fromHostId || "map-main-host")} to=${String(event?.toHostId || "map-main-host")} preset=${String(event?.preset || "")} canonical=${String(event?.canonicalOverlay || "none")} rendered=${renderedActiveHostId}`
      });
    },
    onViolation: ({ code, message, details }) => {
      const selectedSurface = _overlayTransitionRuntimeContext.selectedSurface;
      reportUiSurfaceViolation({
        code,
        actionId: _overlayTransitionRuntimeContext.actionIdForTrace,
        message,
        uiStart: _overlayTransitionRuntimeContext.uiStateRenderStart,
        uiEnd: getUiActionStateSnapshot(gameState),
        selectedSurface,
        renderedSurface: {
          pageType: String(selectedSurface?.pageType || ""),
          overlayType: String(gameState.ui?.overlay || "") || null,
          hostType: String(selectedSurface?.hostType || "")
        },
        expectedHostId: getExpectedOverlayHostId(String(gameState.ui?.overlay || "") || null),
        actualHostId: getRenderedOverlayActiveHostId(_overlayTransitionRuntimeContext.getHosts()),
        details
      });
    }
  });
  return _overlayTransitionManager;
}

function getMapOverlayRegistry() {
  if (_mapOverlayRegistry) return _mapOverlayRegistry;
  _mapOverlayRegistry = Object.freeze({
    inventory: {
      hostId: "inventory-overlay-host",
      transitionPreset: "softPanel",
      buildViewModel: ({ map, hosts }) => buildInventoryOverlayRenderModel(map, hosts?.inventory),
      commit: ({ map, hosts }) => {
        commitInventoryOverlay(map, hosts?.inventory);
        return { hostId: "inventory-overlay-host" };
      }
    },
    [UI_OVERLAY_TYPES.MAP_MINIMAP]: {
      hostId: "clinic-minimap-panel|industrial-minimap-panel|winddyke-minimap-panel|gov-hall-minimap-panel|steelcross-minimap-panel|transit-minimap-panel",
      transitionPreset: "minimapPanel",
      buildViewModel: ({ map }) => buildMapMiniMapOverlayRenderModel(map),
      commit: ({ viewModel }) => commitMapMiniMapOverlay(viewModel)
    }
  });
  return _mapOverlayRegistry;
}

function renderTasksPage(viewModel, hostContainer) {
  const map = viewModel.map;

  let overlay = hostContainer.querySelector(".tasks-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "tasks-overlay";

    const backdrop = document.createElement("div");
    backdrop.className = "tasks-backdrop";
    overlay.appendChild(backdrop);

    const tooltip = document.createElement("div");
    tooltip.className = "tasks-ref-tooltip";
    tooltip.style.display = "none";
    overlay.appendChild(tooltip);

    const dialog = document.createElement("section");
    dialog.className = "tasks-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const header = document.createElement("header");
    header.className = "tasks-header";
    header.innerHTML = `
      <div class="tasks-head-main">
        <div class="tasks-title">备忘录 / 待办</div>
        <div class="tasks-location" title="当前区域">当前区域</div>
        <button type="button" class="tasks-close-btn" aria-label="关闭备忘录">×</button>
      </div>
    `;
    dialog.appendChild(header);

    const body = document.createElement("div");
    body.className = "tasks-body";

    const listPanel = document.createElement("section");
    listPanel.className = "tasks-list-panel";
    const listTitle = document.createElement("div");
    listTitle.className = "tasks-col-title";
    listTitle.textContent = "任务列表";
    listPanel.appendChild(listTitle);
    const listScroll = document.createElement("div");
    listScroll.className = "tasks-list-scroll";
    listPanel.appendChild(listScroll);

    const detailPanel = document.createElement("section");
    detailPanel.className = "tasks-detail-panel";
    const detailTitle = document.createElement("div");
    detailTitle.className = "tasks-detail-title";
    detailPanel.appendChild(detailTitle);
    const detailBody = document.createElement("div");
    detailBody.className = "tasks-detail-body";
    detailPanel.appendChild(detailBody);

    body.appendChild(listPanel);
    body.appendChild(detailPanel);
    dialog.appendChild(body);

    const footer = document.createElement("footer");
    footer.className = "tasks-footer";
    const actions = document.createElement("div");
    actions.className = "tasks-actions";
    footer.appendChild(actions);
    dialog.appendChild(footer);

    overlay.appendChild(dialog);
    hostContainer.appendChild(overlay);
  }

  const locationEl = overlay.querySelector(".tasks-location");
  if (locationEl) {
    locationEl.textContent = map.name || "当前区域";
    locationEl.setAttribute("title", map.name || "当前区域");
  }

  const tasks = Array.isArray(viewModel.tasks) ? viewModel.tasks : [];
  const activeTask = viewModel.activeTask || null;
  const listScroll = overlay.querySelector(".tasks-list-scroll");
  if (listScroll) {
    listScroll.innerHTML = "";
    for (const task of tasks) {
      const row = document.createElement("button");
      row.type = "button";
      row.dataset.actionId = `tasks_select:${task.id}`;
      row.className = `tasks-list-row${activeTask && activeTask.id === task.id ? " is-selected" : ""}`;
      row.innerHTML = `
        <span class="tasks-list-title">${escapeHtml(task.title)}</span>
        <span class="tasks-list-status is-${task.status}">${getTaskStatusLabel(task.status)}</span>
      `;
      listScroll.appendChild(row);
    }
    if (tasks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tasks-empty";
      empty.textContent = "（暂无备忘）";
      listScroll.appendChild(empty);
    }
  }

  const detailTitle = overlay.querySelector(".tasks-detail-title");
  if (detailTitle) detailTitle.textContent = activeTask ? activeTask.title : "请选择任务";
  const detailBody = overlay.querySelector(".tasks-detail-body");
  const refData = viewModel.refData || createDefaultRefData();
  if (detailBody) {
    detailBody.innerHTML = "";
    if (activeTask) {
      renderTaskBodyTokens(detailBody, activeTask, refData);
    } else {
      detailBody.textContent = "（选择左侧任务查看详情）";
    }
  }

  const actions = overlay.querySelector(".tasks-actions");
  if (actions) {
    actions.innerHTML = "";
    actions.appendChild(makeInventoryTextItemButton("tasks_add", "新增", false, "tasks-action-btn"));
    if (activeTask) {
      actions.appendChild(makeInventoryTextItemButton(`tasks_toggle_done:${activeTask.id}`, activeTask.status === "done" ? "恢复" : "完成", false, "tasks-action-btn"));
      actions.appendChild(makeInventoryTextItemButton(`tasks_delete:${activeTask.id}`, "删除", false, "tasks-action-btn"));
      actions.appendChild(makeInventoryTextItemButton(`tasks_pin:${activeTask.id}`, activeTask.pinned ? "取消置顶" : "置顶", false, "tasks-action-btn"));
    }
  }

  showTasksOverlay(hostContainer, overlay);
}

function renderInventoryPage(viewModel, hostContainer) {
  installToolVerifyRuntimeHelpers();
  const renderModel = viewModel && typeof viewModel === "object" ? viewModel : {};
  const inventoryViewModel = renderModel.viewModel && typeof renderModel.viewModel === "object"
    ? renderModel.viewModel
    : {};
  const map = renderModel.map || null;
  const db = inventoryViewModel.db;
  const itemsById = inventoryViewModel.itemsById;
  const shouldAnimateIn = !!renderModel.shouldAnimateIn;

  hostContainer.innerHTML = "";
  hostContainer.setAttribute("aria-hidden", "false");

  const overlay = document.createElement("div");
  overlay.className = "inventory-overlay";

  const backdrop = document.createElement("div");
  backdrop.className = "inventory-backdrop";
  overlay.appendChild(backdrop);

  if (inventoryViewModel.dataReady !== true || !db || !itemsById) {
    const dialog = document.createElement("section");
    dialog.className = `inventory-dialog${shouldAnimateIn ? " inventory-dialog-enter" : ""}`;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.innerHTML = `
      <button type="button" class="inventory-close-btn inventory-close-btn-floating" data-action-id="ui_close_inventory" aria-label="关闭背包">×</button>
      <header class="inventory-dialog-header">
        <div class="inventory-head-main">
          <div class="inventory-title">背包</div>
        </div>
      </header>
    `;
    overlay.appendChild(dialog);
    hostContainer.appendChild(overlay);
    return;
  }

  const tabsView = Array.isArray(inventoryViewModel.tabs) ? inventoryViewModel.tabs : [];
  const equipmentRowsView = Array.isArray(inventoryViewModel.equipmentRows) ? inventoryViewModel.equipmentRows : [];
  const equipmentGroupsView = Array.isArray(inventoryViewModel.equipmentGroups) ? inventoryViewModel.equipmentGroups : [];
  const toolSectionView = inventoryViewModel.toolSection || { entries: [], emptyText: "", hintText: "" };
  const listView = inventoryViewModel.listView || {};
  const summaryView = inventoryViewModel.summaryView || {};
  const dossierView = inventoryViewModel.dossierView || {};
  const footerView = inventoryViewModel.footerView || {};

  const dialog = document.createElement("section");
  dialog.className = `inventory-dialog${shouldAnimateIn ? " inventory-dialog-enter" : ""}`;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");

  const header = document.createElement("header");
  header.className = "inventory-dialog-header";

  const headMain = document.createElement("div");
  headMain.className = "inventory-head-main";

  const title = document.createElement("div");
  title.className = "inventory-title";
  title.textContent = "背包";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.dataset.actionId = "ui_close_inventory";
  closeBtn.setAttribute("aria-label", "关闭背包");
  closeBtn.textContent = "×";
  closeBtn.className = "inventory-close-btn inventory-close-btn-floating";

  headMain.appendChild(title);

  header.appendChild(headMain);
  dialog.appendChild(closeBtn);
  dialog.appendChild(header);

  const body = document.createElement("div");
  body.className = "inventory-dialog-body inventory-archive-layout";
  body.appendChild(renderInventoryEquipmentPanel({
    equipmentRows: equipmentRowsView,
    equipmentGroups: equipmentGroupsView,
    toolSection: toolSectionView,
    vitalsMonitorEnabled: inventoryViewModel.vitalsMonitorEnabled === true,
    shouldAnimateIn
  }));
  body.appendChild(renderInventoryManifestPanel({
    tabsView,
    listView,
    summaryView,
    shouldAnimateIn
  }));
  body.appendChild(renderInventoryDossierPanel({
    dossierView,
    shouldAnimateIn
  }));

  dialog.appendChild(body);

  publishToolRenderDebug(inventoryViewModel.debugSnapshot || null);
  dialog.appendChild(renderInventoryFooterPanel({ footerView, shouldAnimateIn }));
  overlay.appendChild(dialog);

  overlay.addEventListener("mouseover", (event) => {
    const tooltipEl = event.target.closest("[data-hover-desc]");
    if (tooltipEl && overlay.contains(tooltipEl)) {
      scheduleShowAttrTooltip(tooltipEl, 140);
    }
  });

  overlay.addEventListener("mousemove", (event) => {
    if (_activeAttrTooltipCard && overlay.contains(_activeAttrTooltipCard)) {
      positionAttrTooltip(_activeAttrTooltipCard);
    }
  });

  overlay.addEventListener("mouseout", (event) => {
    const tooltipEl = event.target.closest("[data-hover-desc]");
    if (tooltipEl && overlay.contains(tooltipEl)) {
      const relatedTooltip = event.relatedTarget;
      if (!relatedTooltip || !tooltipEl.contains(relatedTooltip)) {
        scheduleHideAttrTooltip(60);
      }
    }
  });
  overlay.addEventListener("focusin", (event) => {
    const tooltipEl = event.target.closest("[data-hover-desc]");
    if (!tooltipEl || !overlay.contains(tooltipEl)) return;
    cancelAttrTooltipTimers();
    showAttrTooltip(tooltipEl);
  });
  overlay.addEventListener("focusout", (event) => {
    const tooltipEl = event.target.closest("[data-hover-desc]");
    if (!tooltipEl || !overlay.contains(tooltipEl)) return;
    const next = event.relatedTarget;
    if (next && tooltipEl.contains(next)) return;
    scheduleHideAttrTooltip(60);
  });

  hostContainer.appendChild(overlay);
}

function nextMenuLoadRebuildProbeSeq() {
  _menuLoadRebuildProbeSeq += 1;
  return _menuLoadRebuildProbeSeq;
}

function getMenuLoadRebuildProbeStack(limit = 10) {
  return String(new Error().stack || "")
    .split("\n")
    .slice(0, Math.max(1, limit))
    .join("\n");
}

function makeActionButton(actionId, text, extraClasses = []) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = text;
  btn.dataset.actionId = actionId;
  btn.classList.add("journal-action", ...extraClasses);
  if (actionId === "menu_save:1") {
    console.info("[MenuLoadRebuildProbe:makeActionButton]", {
      seq: nextMenuLoadRebuildProbeSeq(),
      actionId,
      text,
      disabled: btn.disabled === true,
      title: String(btn.title || "") || null,
      stack: getMenuLoadRebuildProbeStack(10)
    });
  }
  return btn;
}

function appendMenuMetaFooter(appContainer) {
  const footer = document.createElement("div");
  footer.className = "menu-meta-corner";

  const metaLines = document.createElement("div");
  metaLines.className = "menu-meta-lines";
  const autoSlot = saveManager.listSlots().find(s => s.slotId === "auto");
  metaLines.innerHTML =
    `<div>${escapeHtml(formatVersionLine(BUILD))}</div>` +
    `<div>${escapeHtml(formatAutoLastLine(autoSlot))}</div>`;
  footer.appendChild(metaLines);

  if (String(gameState?.currentMapId || "") === "menu_main") {
    const entryBtn = document.createElement("button");
    entryBtn.type = "button";
    entryBtn.className = "menu-meta-icon-entry";
    entryBtn.dataset.actionId = "menu_go_achievements";
    entryBtn.setAttribute("aria-label", "打开成就弹窗");
    entryBtn.innerHTML = `${renderMenuInlineIconSvg("trophy", "menu-meta-icon-entry__icon")}<span class="menu-meta-icon-entry__label">成就</span>`;
    footer.appendChild(entryBtn);
  }

  appContainer.appendChild(footer);
}

function renderMenuInlineIconSvg(iconId, className = "") {
  const cls = className ? ` class="${escapeAttr(className)}"` : "";
  if (iconId === "ship") {
    return `
      <svg${cls} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 15.5 12 6l8 9.5-1.5 2.5H5.5Z" fill="currentColor" opacity="0.22"></path>
        <path d="M12 4.5 8.7 9h2.1v4.1H6.4L4 17.4h16L17.6 13h-4.4V9h2.1L12 4.5Zm-5.2 14c1.2 0 1.9-.5 2.6-1 .7.5 1.4 1 2.6 1s1.9-.5 2.6-1c.7.5 1.4 1 2.6 1 1 0 1.6-.3 2.1-.6v1.5c-.5.3-1.2.6-2.1.6-1.2 0-1.9-.5-2.6-1-.7.5-1.4 1-2.6 1s-1.9-.5-2.6-1c-.7.5-1.4 1-2.6 1s-1.9-.5-2.6-1c-.7.5-1.4 1-2.6 1-.9 0-1.6-.3-2.1-.6V18c.5.3 1.1.5 2.1.5 1.2 0 1.9-.5 2.6-1 .7.5 1.4 1 2.6 1Z" fill="currentColor"></path>
      </svg>
    `;
  }
  return `
    <svg${cls} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 4.5h10v2.3a3.2 3.2 0 0 1 2.9 3.2c0 2.3-1.9 4.2-4.2 4.2h-1A5.3 5.3 0 0 1 13 17.1v1.7h3.1V21H7.9v-2.2H11v-1.7a5.3 5.3 0 0 1-1.7-2.9h-1A4.2 4.2 0 0 1 4.1 10c0-1.7 1.2-3 2.9-3.2V4.5Zm-1 4.5c0 .9.7 1.7 1.7 1.7h1V9H6Zm10.3 1.7c.9 0 1.7-.8 1.7-1.7h-2.7v1.7h1Z" fill="currentColor"></path>
    </svg>
  `;
}

function getRenderTraceStore() {
  const scope = typeof window !== "undefined" ? window : globalThis;
  if (!Array.isArray(scope.__RENDER_TRACE__)) {
    scope.__RENDER_TRACE__ = [];
  }
  return scope.__RENDER_TRACE__;
}

function updateRenderDebugSnapshot(snapshot) {
  const scope = typeof window !== "undefined" ? window : globalThis;
  scope.__RENDER_DEBUG__ = snapshot;
  scope.__dumpRenderDebug = () => scope.__RENDER_DEBUG__;
}

function getLiveRenderedSurfaceTraceStore() {
  const scope = typeof window !== "undefined" ? window : globalThis;
  if (!Array.isArray(scope.__LIVE_RENDERED_SURFACE_TRACE__)) {
    scope.__LIVE_RENDERED_SURFACE_TRACE__ = [];
  }
  return scope.__LIVE_RENDERED_SURFACE_TRACE__;
}

function pushLiveRenderedSurfaceTrace(entry) {
  const store = getLiveRenderedSurfaceTraceStore();
  store.push({
    ts: new Date().toISOString(),
    ...entry
  });
  if (store.length > LIVE_RENDERED_SURFACE_TRACE_MAX) {
    store.splice(0, store.length - LIVE_RENDERED_SURFACE_TRACE_MAX);
  }
}

function normalizeLiveRenderedSurfaceSnapshot(input = {}) {
  const pageType = String(input.pageType || "").trim() || null;
  const mapId = String(input.mapId || "").trim() || null;
  const overlayType = input.overlayType == null ? null : String(input.overlayType || "").trim() || null;
  const modalType = input.modalType == null ? null : String(input.modalType || "").trim() || null;
  const isMenuLike = (pageType === "menu") || isMenuMapId(mapId || "");
  const isGameplayLike = pageType === "map" && !isMenuLike && !overlayType && !modalType;

  return {
    pageType,
    mapId,
    overlayType,
    modalType,
    isMenuLike,
    isGameplayLike,
    renderCycleId: Number(input.renderCycleId || 0),
    liveHostIdentity: String(input.liveHostIdentity || "") || null,
    sourceStage: String(input.sourceStage || "") || null,
    actionId: String(input.actionId || "") || null
  };
}

export function getLiveRenderedSurfaceSnapshot() {
  if (_lastLiveRenderedSurfaceSnapshot) {
    return { ..._lastLiveRenderedSurfaceSnapshot };
  }
  return normalizeLiveRenderedSurfaceSnapshot({
    pageType: null,
    mapId: null,
    overlayType: null,
    modalType: null,
    renderCycleId: 0,
    liveHostIdentity: null,
    sourceStage: "uninitialized",
    actionId: null
  });
}

export function getLiveRenderedSurfaceTraceTail(limit = 80) {
  const max = Math.max(1, Number(limit || 80));
  const store = getLiveRenderedSurfaceTraceStore();
  return store.slice(-max);
}

function pushRenderTrace(stage, payload = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    stage,
    ...payload
  };
  const traceStore = getRenderTraceStore();
  traceStore.push(entry);
  if (traceStore.length > 60) {
    traceStore.splice(0, traceStore.length - 60);
  }
  console.info(`[RenderTrace] stage=${stage}`, entry);
  return entry;
}

const UI_SURFACE_VIOLATION_CODES = Object.freeze({
  RENDER_MISMATCH: "UI_SURFACE_RENDER_MISMATCH",
  VM_EMPTY: "UI_SURFACE_VM_EMPTY",
  FALLBACK_TO_MAP_MAIN: "UI_SURFACE_FALLBACK_TO_MAP_MAIN"
});

function getExpectedOverlayHostId(overlayType) {
  if (overlayType === "tasks") return "tasks-overlay-host";
  if (overlayType === "inventory") return "inventory-overlay-host";
  if (overlayType === UI_OVERLAY_TYPES.MAP_MINIMAP) return "clinic-minimap-panel|industrial-minimap-panel|winddyke-minimap-panel|gov-hall-minimap-panel|steelcross-minimap-panel|transit-minimap-panel";
  return "map-main-host";
}

function reportUiSurfaceViolation({
  code,
  actionId,
  message,
  uiStart,
  uiEnd,
  selectedSurface,
  renderedSurface,
  expectedHostId,
  actualHostId,
  details
} = {}) {
  const violationCode = String(code || "").trim();
  if (!violationCode) return;
  const payload = {
    code: violationCode,
    message: String(message || "surface invariant violated"),
    actionId: String(actionId || ""),
    selectedSurface: selectedSurface || null,
    renderedSurface: renderedSurface || null,
    expectedHostId: expectedHostId || null,
    actualHostId: actualHostId || null,
    details: details || null
  };
  if (typeof console !== "undefined" && typeof console.error === "function") {
    console.error(`[UIInvariant] ${violationCode} ${payload.message}`, payload);
  }

  const prevSnapshot = uiStart || getUiActionStateSnapshot(gameState);
  const nextSnapshot = uiEnd || getUiActionStateSnapshot(gameState);

  pushUiRouteTrace({
    source: "surface:invariant",
    actionId: payload.actionId,
    prevUiPage: prevSnapshot?.uiPage ?? null,
    nextUiPage: nextSnapshot?.uiPage ?? null,
    prevUiOverlay: prevSnapshot?.uiOverlay ?? null,
    nextUiOverlay: nextSnapshot?.uiOverlay ?? null,
    prevCurrentMapId: prevSnapshot?.currentMapId ?? null,
    nextCurrentMapId: nextSnapshot?.currentMapId ?? null,
    prevCurrentSceneId: prevSnapshot?.currentSceneId ?? null,
    nextCurrentSceneId: nextSnapshot?.currentSceneId ?? null,
    resolvedPageType: selectedSurface?.pageType ?? null,
    resolvedOverlayType: selectedSurface?.overlayType ?? null,
    renderHost: selectedSurface?.hostType ?? null,
    violationCode,
    errorMessage: `${payload.message} expected=${payload.expectedHostId || ""} actual=${payload.actualHostId || ""}`.trim()
  });

  pushUiOverlayTrace({
    source: "overlay:surface_invariant",
    actionId: payload.actionId,
    prevUiPage: prevSnapshot?.uiPage ?? null,
    nextUiPage: nextSnapshot?.uiPage ?? null,
    prevUiOverlay: prevSnapshot?.uiOverlay ?? null,
    nextUiOverlay: nextSnapshot?.uiOverlay ?? null,
    resolvedOverlay: selectedSurface?.overlayType ?? null,
    renderedOverlay: renderedSurface?.overlayType ?? null,
    hostId: payload.actualHostId || payload.expectedHostId || null,
    currentMapId: nextSnapshot?.currentMapId ?? null,
    currentSceneId: nextSnapshot?.currentSceneId ?? null,
    violationCode,
    errorMessage: payload.message
  });

  pushUiOpenCallchain({
    source: "render:surface",
    actionId: payload.actionId,
    actionType: "GLOBAL_ACTION",
    resolveEntered: true,
    resolveExited: true,
    commitEntered: true,
    commitExited: true,
    prev: prevSnapshot,
    next: nextSnapshot,
    canonicalSetterCalled: false,
    canonicalSelectorResult: selectedSurface || null,
    renderedSurface: renderedSurface || null,
    violationCode,
    errorMessage: payload.message
  });

  pushUiActionDiff({
    stage: "render:surface_invariant",
    actionId: payload.actionId,
    prev: prevSnapshot,
    next: nextSnapshot,
    resolvedRoute: selectedSurface || null,
    renderedRoute: renderedSurface || null,
    didCanonicalDeltaOccur: false,
    violationCode,
    errorMessage: payload.message
  });
}

function validateTasksOverlayViewModel(viewModel) {
  const issues = [];
  if (!viewModel || typeof viewModel !== "object") {
    issues.push("view_model_not_object");
  }
  if (String(viewModel?.kind || "") !== "tasks") {
    issues.push("view_model_kind_mismatch");
  }
  if (!viewModel?.map || typeof viewModel.map !== "object") {
    issues.push("map_missing");
  }
  if (!Array.isArray(viewModel?.tasks)) {
    issues.push("tasks_list_missing");
  }
  return {
    ok: issues.length === 0,
    issues
  };
}

function summarizeMapForDebug(map) {
  if (!map || typeof map !== "object") return null;
  return {
    id: String(map.id || ""),
    name: String(map.name || ""),
    actionCount: Array.isArray(map.actions) ? map.actions.length : 0,
    hasDescription: typeof map.description === "string" && map.description.trim() !== ""
  };
}

function getRenderRuntimeSnapshot(map, extra = {}) {
  const app = document.getElementById("app");
  const choices = document.getElementById("choices");
  const activeMap = map || gameState.currentMap;
  const snapshot = {
    currentMapId: String(gameState.currentMapId || ""),
    currentSceneId: null,
    currentMap: summarizeMapForDebug(activeMap),
    currentScene: null,
    sceneModel: "map-based",
    ui: {
      page: String(gameState?.ui?.page || ""),
      overlay: String(gameState?.ui?.overlay || "") || null,
      modal: gameState?.ui?.modal ?? null
    },
    runtime: {
      isDispatching: getIsDispatching(),
      bodyMenuPage: document.body?.dataset?.menuPage || null,
      menuSnow: getMenuSnowRuntimeSnapshot(),
      forceMapTransitionOnce: document.body?.dataset?.forceMapTransitionOnce === "1",
      skipMapTransitionOnce: document.body?.dataset?.skipMapTransitionOnce === "1",
      appHasTransitionClass: !!app?.classList?.contains("map-transition"),
      choicesHasTransitionClass: !!choices?.classList?.contains("map-transition"),
      bodyModalOpen: document.body?.classList?.contains("modal-open") === true,
      bodyInventoryOpen: document.body?.classList?.contains("inventory-open") === true,
      settingsModalOpen: document.body?.classList?.contains("settings-modal-open") === true
    },
    dom: {
      appChildCount: app?.childElementCount ?? 0,
      choicesButtonCount: choices?.querySelectorAll("button").length ?? 0,
      appTextLength: String(app?.textContent || "").trim().length,
      choicesTextLength: String(choices?.textContent || "").trim().length
    },
    ...extra
  };
  updateRenderDebugSnapshot(snapshot);
  return snapshot;
}

function analyzeActionVisibility(map) {
  if (!map || typeof map !== "object") {
    return {
      mapId: null,
      rawCount: 0,
      visibleCount: 0,
      lockedCount: 0,
      hiddenCount: 0,
      visibleActionIds: [],
      hiddenReasons: []
    };
  }

  if (map.id === "menu_main") {
    const slots = saveManager.listSlots();
    const autoSlot = slots.find(s => s.slotId === "auto");
    const canContinue = !!autoSlot && !autoSlot.isEmpty && !autoSlot.corrupted;
    const visibleActionIds = canContinue
      ? ["menu_continue_auto", "menu_new_game", "menu_go_load", "menu_go_settings", "menu_go_credits"]
      : ["menu_new_game", "menu_go_load", "menu_go_settings", "menu_go_credits"];
    return {
      mapId: "menu_main",
      rawCount: visibleActionIds.length,
      visibleCount: visibleActionIds.length,
      lockedCount: 0,
      hiddenCount: 0,
      visibleActionIds,
      hiddenReasons: []
    };
  }

  if (map.id === "menu_load" || map.id === "menu_settings") {
    return {
      mapId: String(map.id || ""),
      rawCount: Array.isArray(map.actions) ? map.actions.length : 0,
      visibleCount: null,
      lockedCount: 0,
      hiddenCount: 0,
      visibleActionIds: [],
      hiddenReasons: []
    };
  }

  if (!Array.isArray(map.actions)) {
    return {
      mapId: String(map.id || ""),
      rawCount: 0,
      visibleCount: 0,
      lockedCount: 0,
      hiddenCount: 0,
      visibleActionIds: [],
      hiddenReasons: []
    };
  }

  const visibleActionIds = [];
  const hiddenReasons = [];
  let lockedCount = 0;

  for (const action of map.actions) {
    if (String(map?.id || "") === "gov_hall_main_hall"
      && gameState?.world?.flags?.govHallWindowMenuOpen === true
      && GOV_HALL_WINDOW_HIDDEN_ACTION_IDS.has(String(action?.id || ""))) {
      hiddenReasons.push({ actionId: String(action?.id || ""), reason: "gov_window_hidden" });
      continue;
    }

    if (action?.id === "gov_b_window_intro") {
      const { isOpen } = getGovHallRuntimeState();
      if (!isOpen) {
        hiddenReasons.push({ actionId: String(action?.id || ""), reason: "gov_closed" });
        continue;
      }
    }

    let isLocked = false;
    let isDisabledByRule = false;
    if (action?.requires) {
      const requireResult = evaluateRequires(gameState, action.requires);
      if (!requireResult.ok) {
        const lockedBehavior = action?.ui?.lockedBehavior ?? "hide";
        if (lockedBehavior !== "show") {
          hiddenReasons.push({
            actionId: String(action?.id || ""),
            reason: "requires_hidden",
            details: requireResult.reason || null
          });
          continue;
        }
        isLocked = true;
      }
    }

    const el = renderActionWidget(map, action, {
      locked: isLocked,
      kindTag: isMovementAction(action) ? "移动" : "动作"
    });
    if (!el) {
      hiddenReasons.push({ actionId: String(action?.id || ""), reason: "widget_null" });
      continue;
    }
    if (isLocked) lockedCount += 1;
    visibleActionIds.push(String(action?.id || ""));
  }

  return {
    mapId: String(map.id || ""),
    rawCount: map.actions.length,
    visibleCount: visibleActionIds.length,
    lockedCount,
    hiddenCount: hiddenReasons.length,
    visibleActionIds,
    hiddenReasons
  };
}

function renderEmergencyMenuFallback(map, error) {
  const app = document.getElementById("app");
  const choices = document.getElementById("choices");
  if (!app || !choices) return;

  const fallbackMapId = String(map?.id || "menu_main");
  const title = fallbackMapId === "menu_main"
    ? "寒武城"
    : String(map?.name || "菜单");

  app.innerHTML = `
    <article class="map-panel map-panel-main-hero">
      <h1 class="menu-main-title">${escapeHtml(title)}</h1>
      <div class="menu-main-subtitle">菜单渲染已降级</div>
      <div class="map-desc">${escapeHtml(String(error?.message || error || "未知错误"))}</div>
    </article>
  `;

  choices.innerHTML = "";
  choices.appendChild(makeActionButton("menu_new_game", "新建游戏", ["primary-action"]));
  choices.appendChild(makeActionButton("menu_go_load", "读取存档"));
  choices.appendChild(makeActionButton("menu_go_settings", "设置"));
  choices.appendChild(makeActionButton("menu_go_credits", "开发组信息"));
}

function buildCreditsLandingSectionsViewModel(questionnaireHost) {
  return {
    infoSections: [
      {
        title: "制作",
        entries: [
          {
            term: "开发组",
            detail: "开发 / 设计 / 写作 / 美术 / 音效整合：唐吉诃德（单人开发）"
          }
        ]
      },
      {
        title: "引擎与实现",
        entries: [
          {
            term: "框架",
            detail: "Web 端自研轻量框架：数据驱动 UI，行为以 Action → Resolve → Commit 的流水线执行"
          },
          {
            term: "存档",
            detail: "本地 LocalStorage（设置与存档分离）"
          }
        ]
      },
      {
        title: "致谢",
        entries: [
          {
            term: "测试",
            detail: "感谢所有测试与反馈提供者"
          },
          {
            term: "生态",
            detail: "感谢开源工具与生态（具体依赖以仓库清单为准）"
          }
        ]
      },
      {
        title: "版权与许可",
        entries: [
          {
            term: "版权",
            detail: "本作品及其设定、文本与美术资源 © 唐吉诃德"
          },
          {
            term: "许可",
            detail: "未经许可禁止转载、二次发布或商业使用"
          }
        ]
      }
    ],
    feedback: {
      title: String(questionnaireHost?.entryTitle || "内测回执"),
      description: String(questionnaireHost?.entryDescription || ""),
      entryLabel: String(questionnaireHost?.entryLabel || "填写内测问卷"),
      progressLabel: `${Number(questionnaireHost?.progress?.answeredCount || 0)} / ${Number(questionnaireHost?.progress?.totalCount || 0)}`,
      localStatusLabel: String(questionnaireHost?.lastExport?.jsonFileName || questionnaireHost?.lastSavedDraft?.fileName || "尚未生成本地文件")
    }
  };
}

function buildCreditsPageViewModel(pageViewModel) {
  const questionnaireHost = pageViewModel?.questionnaireHost && typeof pageViewModel.questionnaireHost === "object"
    ? pageViewModel.questionnaireHost
    : null;
  const questionnaireActive = questionnaireHost?.active === true;
  return {
    pageTitleCn: "寒武城",
    pageTitleEn: "CAMBRIAN CITY",
    metaLine: formatVersionLine(BUILD),
    questionnaireHost,
    questionnaireActive,
    landing: buildCreditsLandingSectionsViewModel(questionnaireHost)
  };
}

function renderCreditsLandingMarkup(landing) {
  return renderQuestionnaireCreditsLanding(landing);
}

function renderCreditsQuestionnaireStageMarkup(questionnaireHost) {
  return `
    <div class="credits-page__body">
      <div class="credits-page__questionnaire-stage">
        <aside class="credits-page__questionnaire-rail">
          <section class="credits-page__rail-card">
            <div class="credits-page__rail-eyebrow">Developer Notes</div>
            <h3 class="credits-page__rail-title">开发组信息</h3>
            <p class="credits-page__rail-copy">你当前仍在开发组信息页内。问卷只是这里的内嵌回执视图，不会创建新的顶级菜单页，也不会进入正式存档。</p>
            <button type="button" class="journal-action is-secondary credits-page__rail-action" data-local-action="questionnaire-return-credits">返回开发组信息</button>
          </section>
          <section class="credits-page__rail-card credits-page__rail-card--status">
            <div class="credits-page__rail-eyebrow">Feedback Files</div>
            <div class="credits-page__rail-row"><span>草稿</span><strong>${escapeHtml(String(questionnaireHost?.lastSavedDraft?.fileName || "尚未保存"))}</strong></div>
            <div class="credits-page__rail-row"><span>导出</span><strong>${escapeHtml(String(questionnaireHost?.lastExport?.jsonFileName || "尚未导出"))}</strong></div>
            <div class="credits-page__rail-row"><span>进度</span><strong>${Number(questionnaireHost?.progress?.answeredCount || 0)} / ${Number(questionnaireHost?.progress?.totalCount || 0)}</strong></div>
          </section>
        </aside>
        <div class="credits-page__questionnaire-host" data-credits-questionnaire-host></div>
      </div>
    </div>
  `;
}

function renderCreditsPageSurface(creditsViewModel, appContainer) {
  appContainer.innerHTML = `
    <section class="credits-page menu-credits-shell${creditsViewModel.questionnaireActive ? " is-questionnaire-active" : ""}" aria-live="polite" data-surface-owner="credits-page">
      <div class="credits-page__frame">
        <header class="credits-page__head">
          <div class="credits-page__head-row">
            <div class="credits-page__head-copy">
              <h2 class="credits-page__title">
                <span class="credits-page__title-cn">${escapeHtml(String(creditsViewModel.pageTitleCn || ""))}</span>
                <span class="credits-page__title-sep">/</span>
                <span class="credits-page__title-en">${escapeHtml(String(creditsViewModel.pageTitleEn || ""))}</span>
              </h2>
              <p class="credits-page__meta">${escapeHtml(String(creditsViewModel.metaLine || ""))}</p>
            </div>
            <button type="button" class="credits-page__close" data-local-action="credits-return-main" aria-label="返回主菜单">返回</button>
          </div>
        </header>
        ${creditsViewModel.questionnaireActive
          ? renderCreditsQuestionnaireStageMarkup(creditsViewModel.questionnaireHost)
          : renderCreditsLandingMarkup(creditsViewModel.landing)}
      </div>
    </section>
  `;
}

function renderMenuCreditsPage(pageViewModel, appContainer) {
  const creditsViewModel = buildCreditsPageViewModel(pageViewModel);
  renderCreditsPageSurface(creditsViewModel, appContainer);

  if (creditsViewModel.questionnaireActive && creditsViewModel.questionnaireHost?.panel) {
    const questionnairePanelHost = appContainer.querySelector("[data-credits-questionnaire-host]");
    if (questionnairePanelHost) {
      renderQuestionnairePanel(creditsViewModel.questionnaireHost.panel, questionnairePanelHost);
    }
  }
}

function renderPageViewModel(pageViewModel, appContainer, choicesContainer) {
  if (!pageViewModel || typeof pageViewModel !== "object") {
    throw new Error("renderPageViewModel expected page view model");
  }

  appContainer.innerHTML = "";
  choicesContainer.innerHTML = "";
  choicesContainer.hidden = false;
  choicesContainer.removeAttribute("aria-hidden");
  choicesContainer.classList.remove("is-critical-collapse", "is-critical-dead");
  delete choicesContainer.dataset.criticalMode;

  if (pageViewModel.pageType === "menu") {
    renderMenuPageViewModel(pageViewModel, appContainer, choicesContainer);
    return;
  }

  renderMapPageViewModel(pageViewModel, appContainer, choicesContainer);
}

function renderMenuPageViewModel(pageViewModel, appContainer, choicesContainer) {
  const variant = String(pageViewModel.variant || pageViewModel.pageId || "menu_main");

  if (variant === "menu_load") {
    renderMenuLoadPage(appContainer);
    renderMenuLoadActions(choicesContainer);
    return;
  }

  if (variant === "menu_credits") {
    choicesContainer.hidden = true;
    choicesContainer.setAttribute("aria-hidden", "true");
    renderMenuCreditsPage(pageViewModel, appContainer);
    return;
  }

  if (variant === "menu_main") {
    appContainer.innerHTML = `
      <article class="map-panel map-panel-main-hero">
        <h1 class="menu-main-title">${escapeHtml(String(pageViewModel.title || "寒武城"))}</h1>
        <div class="menu-main-subtitle">${escapeHtml(String(pageViewModel.subtitle || "Cambrian City"))}</div>
      </article>
    `;
    for (const action of Array.isArray(pageViewModel.actions) ? pageViewModel.actions : []) {
      const btn = makeActionButton(String(action.id || ""), String(action.text || action.id || ""), action.primary ? ["primary-action"] : []);
      choicesContainer.appendChild(btn);
    }
    appendMenuMetaFooter(appContainer);
    return;
  }

  const article = document.createElement("article");
  article.className = "map-panel";
  article.innerHTML = `
    <h1 class="map-name">${escapeHtml(String(pageViewModel.title || "菜单"))}</h1>
    <div class="map-desc">${escapeHtml(String(pageViewModel.description || ""))}</div>
  `;
  appContainer.appendChild(article);
}

function resolveActiveInlineSessionViewModel(pageViewModel) {
  const currentMapId = String(pageViewModel?.map?.id || "").trim();

  const activeJobSession = normalizeJobSession(gameState?.ui?.jobSession);
  const jobMapId = String(activeJobSession?.sourceMapId || "").trim();
  if (
    activeJobSession
    && activeJobSession.status !== JOB_SESSION_STATUS.COMPLETED
    && jobMapId
    && jobMapId === currentMapId
  ) {
    const definition = getJobDefinitionById(activeJobSession.jobId);
    if (definition) {
      return {
        kind: "job",
        phaseKey: `${activeJobSession.status}:${String(activeJobSession.briefingReplyType || "")}`,
        sourceMapId: jobMapId,
        session: activeJobSession,
        definition
      };
    }
  }

  const activeInquirySession = normalizeInquirySession(gameState?.ui?.inquirySession);
  const inquiryMapId = String(activeInquirySession?.sourceMapId || "").trim();
  if (
    activeInquirySession
    && activeInquirySession.status === INQUIRY_SESSION_STATUS.ACTIVE
    && inquiryMapId
    && inquiryMapId === currentMapId
  ) {
    const definition = getInquiryDefinitionById(activeInquirySession.inquiryId);
    if (definition) {
      return {
        kind: "inquiry",
        phaseKey: `active:${String(activeInquirySession.replyKey || "")}`,
        sourceMapId: inquiryMapId,
        session: activeInquirySession,
        definition
      };
    }
  }

  return null;
}

function clearInlineSessionTimers() {
  if (_inlineSessionEnterTimer) {
    clearTimeout(_inlineSessionEnterTimer);
    _inlineSessionEnterTimer = null;
  }
  if (_inlineSessionPhaseTimer) {
    clearTimeout(_inlineSessionPhaseTimer);
    _inlineSessionPhaseTimer = null;
  }
  if (_inlineSessionExitTimer) {
    clearTimeout(_inlineSessionExitTimer);
    _inlineSessionExitTimer = null;
  }
}

function resetInlineSessionHostState() {
  clearInlineSessionTimers();
  _inlineSessionHostState = "idle";
  _inlineSessionActiveKey = null;
  _inlineSessionActivePhaseKey = null;
  _inlineSessionHostSnapshot = null;
  _inlineSessionMeasuredHeight = 0;
}

function scheduleInlineSessionState(timerKind, delayMs, callback) {
  if (timerKind === "enter") {
    if (_inlineSessionEnterTimer) clearTimeout(_inlineSessionEnterTimer);
    _inlineSessionEnterTimer = setTimeout(() => {
      _inlineSessionEnterTimer = null;
      callback();
    }, Math.max(0, Math.floor(delayMs || 0)));
    return;
  }
  if (timerKind === "phase") {
    if (_inlineSessionPhaseTimer) clearTimeout(_inlineSessionPhaseTimer);
    _inlineSessionPhaseTimer = setTimeout(() => {
      _inlineSessionPhaseTimer = null;
      callback();
    }, Math.max(0, Math.floor(delayMs || 0)));
    return;
  }
  if (_inlineSessionExitTimer) clearTimeout(_inlineSessionExitTimer);
  _inlineSessionExitTimer = setTimeout(() => {
    _inlineSessionExitTimer = null;
    callback();
  }, Math.max(0, Math.floor(delayMs || 0)));
}

function beginInlineSessionEntering(sessionVm, sessionKey, phaseKey) {
  _inlineSessionHostSnapshot = {
    kind: sessionVm.kind,
    phaseKey,
    sourceMapId: String(sessionVm.sourceMapId || ""),
    session: { ...(sessionVm.session || {}) },
    definition: sessionVm.definition
  };
  _inlineSessionActiveKey = sessionKey;
  _inlineSessionActivePhaseKey = phaseKey;
  _inlineSessionHostState = "entering";
  _inlineSessionMeasuredHeight = 0;

  scheduleInlineSessionState("enter", INLINE_SESSION_HOST_TIMERS.enterMs, () => {
    if (_inlineSessionHostState !== "entering") return;
    _inlineSessionHostState = "active";
    render();
  });
}

function beginInlineSessionPhase(sessionVm, sessionKey, phaseKey) {
  _inlineSessionHostSnapshot = {
    kind: sessionVm.kind,
    phaseKey,
    sourceMapId: String(sessionVm.sourceMapId || ""),
    session: { ...(sessionVm.session || {}) },
    definition: sessionVm.definition
  };
  _inlineSessionActiveKey = sessionKey;
  _inlineSessionActivePhaseKey = phaseKey;
  _inlineSessionHostState = "phase";

  scheduleInlineSessionState("phase", INLINE_SESSION_HOST_TIMERS.phaseMs, () => {
    if (_inlineSessionHostState !== "phase") return;
    _inlineSessionHostState = "active";
    render();
  });
}

function beginInlineSessionExiting() {
  if (!_inlineSessionHostSnapshot) {
    resetInlineSessionHostState();
    return;
  }
  _inlineSessionHostState = "exiting";
  scheduleInlineSessionState("exit", INLINE_SESSION_HOST_TIMERS.exitMs, () => {
    resetInlineSessionHostState();
    render();
  });
}

function resolveInlineSessionHostFrame(pageViewModel) {
  const activeVm = resolveActiveInlineSessionViewModel(pageViewModel);
  const currentMapId = String(pageViewModel?.map?.id || "").trim();
  if (!activeVm) {
    const snapshotMapId = String(_inlineSessionHostSnapshot?.sourceMapId || "").trim();
    if (snapshotMapId && currentMapId && snapshotMapId !== currentMapId) {
      resetInlineSessionHostState();
      return {
        hasActiveInlineSession: false,
        shouldHideLegacyWorkFeedback: false,
        snapshot: null,
        renderState: "idle"
      };
    }
    if (_inlineSessionHostState === "active" || _inlineSessionHostState === "entering" || _inlineSessionHostState === "phase") {
      beginInlineSessionExiting();
    }
    return {
      hasActiveInlineSession: false,
      shouldHideLegacyWorkFeedback: _inlineSessionHostState === "exiting",
      snapshot: _inlineSessionHostSnapshot,
      renderState: _inlineSessionHostState
    };
  }

  const sessionKey = `${activeVm.kind}:${String(activeVm?.session?.sessionId || "")}`;
  const phaseKey = String(activeVm.phaseKey || "");
  const sourceMapId = String(activeVm.sourceMapId || "").trim();
  if (!currentMapId || !sourceMapId || currentMapId !== sourceMapId) {
    return {
      hasActiveInlineSession: false,
      shouldHideLegacyWorkFeedback: false,
      snapshot: null,
      renderState: "idle"
    };
  }

  if (_inlineSessionHostState === "idle" || !_inlineSessionHostSnapshot) {
    beginInlineSessionEntering(activeVm, sessionKey, phaseKey);
  } else if (_inlineSessionActiveKey !== sessionKey) {
    beginInlineSessionEntering(activeVm, sessionKey, phaseKey);
  } else if (_inlineSessionActivePhaseKey !== phaseKey && _inlineSessionHostState === "active") {
    beginInlineSessionPhase(activeVm, sessionKey, phaseKey);
  } else {
    _inlineSessionHostSnapshot = {
      kind: activeVm.kind,
      phaseKey,
      sourceMapId,
      session: { ...(activeVm.session || {}) },
      definition: activeVm.definition
    };
    _inlineSessionActiveKey = sessionKey;
    _inlineSessionActivePhaseKey = phaseKey;
    if (_inlineSessionHostState === "exiting") {
      beginInlineSessionEntering(activeVm, sessionKey, phaseKey);
    }
  }

  return {
    hasActiveInlineSession: true,
    shouldHideLegacyWorkFeedback: true,
    snapshot: _inlineSessionHostSnapshot,
    renderState: _inlineSessionHostState
  };
}

function renderInlineSessionSlot(article, frame) {
  const snapshot = frame?.snapshot;
  if (!snapshot) return false;

  const renderState = String(frame?.renderState || "idle");
  const animateMode = renderState === "entering"
    ? "enter"
    : (renderState === "phase"
      ? "phase"
      : (renderState === "exiting" ? "exit" : "static"));

  const html = buildInlineSceneSessionHtml(snapshot, { animateMode });
  if (!html) return false;
  const measuredFallbackHeight = Math.max(0, Math.ceil(Number(_inlineSessionMeasuredHeight || 0)));

  const visibilityState = escapeHtml(renderState);
  const phaseState = visibilityState === "phase" ? "switching" : "stable";
  let mountState = visibilityState;
  if (visibilityState === "entering") mountState = "entering-prep";
  if (visibilityState === "exiting") mountState = "exiting-prep";
  const slotHeightCss = measuredFallbackHeight > 0 ? `${measuredFallbackHeight}px` : "0px";
  const slotToken = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  article.insertAdjacentHTML(
    "beforeend",
    `<div class="inline-scene-session-slot state-${escapeHtml(mountState)}" data-session-token="${escapeHtml(slotToken)}" data-session-visibility="${escapeHtml(mountState)}" data-session-phase-state="${escapeHtml(phaseState)}" style="--session-slot-height:${escapeHtml(slotHeightCss)};">${html}</div>`
  );
  const slot = article.querySelector(`.inline-scene-session-slot[data-session-token="${slotToken}"]`);
  const panel = slot?.querySelector(".inline-scene-session");
  if (slot) {
    applyInlineSessionTransitionVars(slot, INLINE_SESSION_TRANSITION_PRESET);
  }

  const readLivePanelHeight = () => {
    const livePanel = slot?.querySelector(".inline-scene-session");
    if (!livePanel) return 0;
    const style = getComputedStyle(livePanel);
    const borderTop = Number.parseFloat(style.borderTopWidth || "0") || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth || "0") || 0;
    const byScroll = Number(livePanel.scrollHeight) + borderTop + borderBottom;
    const byRect = Number(livePanel.getBoundingClientRect().height);
    const safeScroll = Number.isFinite(byScroll) ? byScroll : 0;
    const safeRect = Number.isFinite(byRect) ? byRect : 0;
    return Math.max(Math.ceil(safeScroll), Math.ceil(safeRect));
  };

  const initialLiveHeight = readLivePanelHeight();
  if (initialLiveHeight > 0) {
    _inlineSessionMeasuredHeight = initialLiveHeight;
    slot.style.setProperty("--session-slot-height", `${initialLiveHeight}px`);
  }

  if (visibilityState === "entering" && slot) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const targetHeight = readLivePanelHeight();
        if (targetHeight > 0) {
          _inlineSessionMeasuredHeight = targetHeight;
          slot.style.setProperty("--session-slot-height", `${targetHeight}px`);
        }
        void slot.offsetHeight;
        slot.classList.remove("state-entering-prep");
        slot.classList.add("state-entering");
        slot.setAttribute("data-session-visibility", "entering");
      });
    });
  }

  if (visibilityState === "exiting" && slot) {
    const exitHeight = Math.max(readLivePanelHeight(), Math.max(0, Math.ceil(Number(_inlineSessionMeasuredHeight || 0))));
    if (exitHeight > 0) {
      slot.style.setProperty("--session-slot-height", `${exitHeight}px`);
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void slot.offsetHeight;
        slot.classList.remove("state-exiting-prep");
        slot.classList.add("state-exiting");
        slot.setAttribute("data-session-visibility", "exiting");
      });
    });
  }

  if (visibilityState === "active" || visibilityState === "phase") {
    const stableHeight = readLivePanelHeight();
    if (stableHeight > 0) {
      _inlineSessionMeasuredHeight = stableHeight;
      slot.style.setProperty("--session-slot-height", `${stableHeight}px`);
    }
  }
  return true;
}

function renderMapPageViewModel(pageViewModel, appContainer, choicesContainer) {
  const mapIdForWilderness = String(pageViewModel?.map?.id || "").trim();
  if (mapIdForWilderness === "wilderness_runtime") {
    const articleWild = document.createElement("article");
    articleWild.className = "map-panel map-panel-wilderness-runtime";
    appContainer.appendChild(articleWild);
    const vmWild = buildWildernessViewModel(gameState);
    const wildHost = renderWildernessRuntime(vmWild);
    articleWild.appendChild(wildHost);
    renderResolvedActionEntries(
      pageViewModel.map,
      Array.isArray(pageViewModel.actions) ? pageViewModel.actions : [],
      choicesContainer
    );
    return;
  }

  const article = document.createElement("article");
  const isBusPage = String(pageViewModel?.pageDecorProfile || "") === "bus";
  const mapDescriptionModel = isBusPage
    ? { text: String(pageViewModel.description || ""), sceneTags: [] }
    : pickMapDescriptionResult(pageViewModel?.map || gameState?.currentMap || null);
  const busMetaParts = [
    String(pageViewModel?.busRouteLabel || "").trim(),
    String(pageViewModel?.busNextStopLabel || "").trim() ? `下一站：${String(pageViewModel.busNextStopLabel || "").trim()}` : ""
  ].filter(Boolean);
  article.className = `map-panel${isBusPage ? " map-panel-bus" : ""}`;
  article.innerHTML = `
    ${isBusPage ? `
      <div class="map-bus-environment" aria-hidden="true">
        <span class="map-bus-lightbar map-bus-lightbar-left"></span>
        <span class="map-bus-lightbar map-bus-lightbar-right"></span>
      </div>
    ` : ""}
    ${isBusPage ? `
      <div class="map-bus-scene-tag" aria-label="当前场景">${escapeHtml(String(pageViewModel.title || "车上"))}</div>
      <section class="map-bus-station-strip" aria-label="当前站信息">
        <div class="map-bus-station-strip-label">当前站</div>
        <div class="map-bus-station-strip-value">${escapeHtml(String(pageViewModel.currentStationLabel || ""))}</div>
        ${busMetaParts.length > 0 ? `<div class="map-bus-station-strip-meta">${escapeHtml(busMetaParts.join(" · "))}</div>` : ""}
      </section>
    ` : `
      <div class="map-scene-header">
        <h1 class="map-name">${escapeHtml(String(pageViewModel.title || ""))}</h1>
        <div class="map-scene-rule" aria-hidden="true"></div>
      </div>
      ${renderMapSceneTags(mapDescriptionModel.sceneTags)}
    `}
    <div class="map-desc">${escapeHtml(String(mapDescriptionModel.text || pageViewModel.description || ""))}</div>
  `;

  // Attach first so runtime height measurements for session transitions are real.
  appContainer.appendChild(article);

  article.addEventListener("click", async (event) => {
    const button = event.target.closest("button.inline-scene-session-action[data-action-id]");
    if (!button || !article.contains(button)) return;
    const sleepMode = String(gameState?.player?.meta?.sleepEpisode?.mode || "").toUpperCase();
    const isCollapseMode = sleepMode === "COLLAPSE";
    const isDeadMode = gameState?.player?.exposure?.dead === true;
    if (isCollapseMode || isDeadMode) return;
    const actionId = String(button.dataset.actionId || "").trim();
    if (!actionId) return;
    const { dispatch } = await import("./pipeline/dispatch.js");
    await dispatch(actionId, {});
  });

  const inlineSessionFrame = resolveInlineSessionHostFrame(pageViewModel);
  const hasInlineSession = renderInlineSessionSlot(article, inlineSessionFrame);

  const normalizedWorkFeedback = normalizeWorkPresentationPayload(gameState?.ui?.workFeedback);
  if (
    !inlineSessionFrame.shouldHideLegacyWorkFeedback
    && !hasInlineSession
    && normalizedWorkFeedback
    && String(normalizedWorkFeedback.mapId || "") === String(pageViewModel?.map?.id || "")
  ) {
    const shouldAnimate = !!normalizedWorkFeedback.token
      && normalizedWorkFeedback.token !== _lastRenderedWorkFeedbackToken;
    const inlineFeedbackHtml = buildInlineWorkFeedbackHtml(normalizedWorkFeedback, {
      animate: shouldAnimate
    });
    if (inlineFeedbackHtml) {
      article.insertAdjacentHTML("beforeend", inlineFeedbackHtml);
      _lastRenderedWorkFeedbackToken = normalizedWorkFeedback.token || _lastRenderedWorkFeedbackToken;
    }
  }

  renderResolvedActionEntries(pageViewModel.map, Array.isArray(pageViewModel.actions) ? pageViewModel.actions : [], choicesContainer);
}

function commitSceneTextFxAnimated(contentKey) {
  const key = String(contentKey || "").trim();
  if (!key) return;
  const result = markSceneTextFxAnimated(key);
  if (!result?.ok) {
    console.warn("[SceneTextFx] persist failed", result?.reason || "unknown_error");
  }
}

function commitSceneTextFxViewed(contentKey) {
  const key = String(contentKey || "").trim();
  if (!key) return;
  const result = markSceneTextFxViewed(key);
  if (!result?.ok) {
    console.warn("[SceneTextFx] viewed persist failed", result?.reason || "unknown_error");
  }
}

function toSceneTextBoundaryShape(source, payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const chunkPlan = data.chunkPlan && typeof data.chunkPlan === "object" ? data.chunkPlan : {};
  return {
    source: String(source || "unknown"),
    reason: String(data.reason || ""),
    contentKey: String(data.contentKey || ""),
    allowSceneTextFx: data.allowSceneTextFx === true,
    revealMode: String(data.revealMode || ""),
    shouldAnimate: data.shouldAnimate === true,
    leadChars: Number(chunkPlan.leadChars || 0),
    bodyChars: Number(chunkPlan.bodyChars || 0),
    tailChars: Number(chunkPlan.tailChars || 0),
    leadTextLength: String(chunkPlan.leadText || "").trim().length,
    bodyTextLength: String(chunkPlan.bodyText || "").trim().length,
    tailTextLength: String(chunkPlan.tailText || "").trim().length,
    plannerReason: String(data.plannerReason || chunkPlan.plannerReason || ""),
    mode: String(data.mode || "")
  };
}

function updateSceneTextBoundaryAuditLayer(layer, payload) {
  const key = String(layer || "").trim();
  if (!key) return;
  if (!Object.prototype.hasOwnProperty.call(_sceneTextBoundaryAuditState, key)) return;
  _sceneTextBoundaryAuditState[key] = payload || null;
}

function isReducedMotionForSceneTextBoundaryAudit() {
  const settings = settingsManager.getSettings();
  if (settings?.reduceMotion === true) return true;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function computeSceneTextPolicyOutputBoundary(pageViewModel) {
  const page = pageViewModel && typeof pageViewModel === "object" ? pageViewModel.page : null;
  if (!page || page.pageType !== "map") return null;
  const description = String(page.description || "");
  return resolveSceneTextFxPolicy({
    pageType: "map",
    uiPage: String(gameState?.ui?.page || ""),
    isOverlay: gameState?.ui?.overlay != null,
    mapId: String(page?.map?.id || gameState?.currentMapId || ""),
    sceneAnchor: String(pageViewModel?.sceneTextAnchor || page?.sceneTextAnchor || gameState?.currentSceneId || page?.map?.id || "main"),
    contentSignature: buildSceneTextContentSignature(description),
    animatedTable: getAnimatedTable(gameState),
    viewedTable: getViewedTable(gameState),
    reducedMotion: isReducedMotionForSceneTextBoundaryAudit()
  });
}

function isSceneTextFxDiagnosticEnabled() {
  return readDebugFlag("sceneTextPacingDiagnostic");
}

function isSceneTextDomProbeEnabled() {
  return readDebugFlag("sceneTextDomProbe");
}

function isSceneTextDomLocatorEnabled() {
  return readDebugFlag("sceneTextDomLocator");
}

function isSceneTextHostAuditEnabled() {
  return readDebugFlag("sceneTextHostAudit");
}

function getSceneTextAuditHost(appHost) {
  if (appHost && typeof appHost.querySelector === "function") {
    const exact = appHost.querySelector("article.map-panel > div.map-desc:nth-of-type(2)");
    if (exact) return exact;
    const fallback = appHost.querySelector(".map-panel .map-desc");
    if (fallback) return fallback;
  }
  return document.querySelector("#app article.map-panel > div.map-desc:nth-of-type(2)")
    || document.querySelector("#app .map-panel .map-desc");
}

function getOrAssignSceneTextAuditHostId(node) {
  if (!node) return 0;
  const existing = _sceneTextHostAuditIds.get(node);
  if (Number.isFinite(existing) && existing > 0) return existing;
  const next = ++_sceneTextHostAuditSeq;
  _sceneTextHostAuditIds.set(node, next);
  return next;
}

function getSceneTextAuditRect(node) {
  if (!node || typeof node.getBoundingClientRect !== "function") return null;
  const rect = node.getBoundingClientRect();
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function getSceneTextAuditOuter(node) {
  if (!node || typeof node.outerHTML !== "string") return "";
  return node.outerHTML.replace(/\s+/g, " ").slice(0, 220);
}

function recordSceneTextHostLifecycle(phase, { appHost = null, renderCycle = 0, currentMapId = "", currentSceneId = "" } = {}) {
  const node = getSceneTextAuditHost(appHost);
  const hostId = getOrAssignSceneTextAuditHostId(node);
  const sameAsPrevious = !!node && _sceneTextHostAuditLastNode === node;
  const entry = {
    phase: String(phase || "unknown"),
    hostId,
    sameAsPrevious,
    isConnected: !!node?.isConnected,
    rect: getSceneTextAuditRect(node),
    outerHtmlSnippet: getSceneTextAuditOuter(node),
    renderCycle: Number(renderCycle || 0),
    selector: node ? "#app article.map-panel > div.map-desc:nth-of-type(2)" : "",
    currentMapId: String(currentMapId || ""),
    currentSceneId: String(currentSceneId || ""),
    ts: Date.now()
  };
  _sceneTextHostAuditLastNode = node || null;
  _sceneTextHostAuditRecords.push(entry);
  if (_sceneTextHostAuditRecords.length > 320) {
    _sceneTextHostAuditRecords = _sceneTextHostAuditRecords.slice(-320);
  }
  return entry;
}

function scheduleSceneTextHostRafAudit({ appHost, renderCycle, currentMapId, currentSceneId }) {
  requestAnimationFrame(() => {
    recordSceneTextHostLifecycle("raf_1", { appHost, renderCycle, currentMapId, currentSceneId });
    requestAnimationFrame(() => {
      recordSceneTextHostLifecycle("raf_2", { appHost, renderCycle, currentMapId, currentSceneId });
    });
  });
}

function resolveFinalSceneTextHost(appHost) {
  const candidates = Array.from(appHost?.querySelectorAll?.(".map-panel .map-desc") || []);
  for (const host of candidates) {
    const rect = host.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && host.isConnected) {
      return host;
    }
  }
  return candidates[0] || null;
}

function getOrAssignFinalSceneTextHostId(host) {
  if (!host) return 0;
  const existing = _finalSceneTextHostIds.get(host);
  if (Number.isFinite(existing) && existing > 0) return existing;
  const next = ++_finalSceneTextHostSeq;
  _finalSceneTextHostIds.set(host, next);
  return next;
}

function markFinalSceneTextHost(host, renderCycle, probeMode) {
  if (!host) return 0;
  const hostId = getOrAssignFinalSceneTextHostId(host);
  host.setAttribute("data-final-scene-text-host", "1");
  host.setAttribute("data-final-scene-text-host-id", String(hostId));
  host.setAttribute("data-final-scene-text-render-cycle", String(renderCycle));
  if (probeMode) {
    host.style.outline = "2px solid red";
    host.style.outlineOffset = "-2px";
  } else if (host.style.outline === "2px solid red") {
    host.style.removeProperty("outline");
    host.style.removeProperty("outline-offset");
  }
  return hostId;
}

function getSceneTextFxHost(appHost) {
  return appHost?.querySelector?.(".map-panel .map-desc") || null;
}

function computeSceneTextFxDiagnosticLockUntil(policy, nowTs) {
  const timings = policy?.timings && typeof policy.timings === "object" ? policy.timings : {};
  const leadHold = Math.max(0, Number(timings.leadHoldMs || 0));
  const bodyExpand = Math.max(0, Number(timings.bodyExpandMs || 0));
  const tailWindow = Math.max(0, Number(timings.tailStartDelayMs || 0) + Number(timings.tailExpandMs || 0));
  const actionsDelay = Math.max(0, Number(timings.actionsDelayMs || 0));
  const actionsReveal = Math.max(0, Number(timings.actionsRevealMs || 0));
  const totalTimelineMs = leadHold + bodyExpand + Math.max(tailWindow, 0) + actionsDelay + actionsReveal;
  return nowTs + totalTimelineMs + 300;
}

function clearSceneTextFxSessionRecord() {
  _sceneTextFxDomSession = null;
  _sceneTextFxSessionRecord = null;
}

function cancelSceneTextFxSession(reason = "cancelled") {
  if (_sceneTextFxDomSession && typeof _sceneTextFxDomSession.cancel === "function") {
    try {
      _sceneTextFxDomSession.cancel();
    } catch (_error) {
      // noop
    }
  }
  if (_sceneTextFxSessionRecord) {
    _sceneTextFxSessionRecord.state = "cancelled";
    _sceneTextFxSessionRecord.finishedAt = Date.now();
    _sceneTextFxSessionRecord.cancelReason = reason;
  }
  clearSceneTextFxSessionRecord();
}

function ensureSceneTextFxSmokeHook() {
  if (typeof window === "undefined") return;
  if (window.__RUN_SCENE_TEXT_FX_SMOKE_INSTALLED__ === true) return;

  window.__RUN_SCENE_TEXT_FX_SMOKE__ = () => {
    const app = document.getElementById("app");
    const choices = document.getElementById("choices");

    if (_sceneTextFxSmokeSession && typeof _sceneTextFxSmokeSession.cancel === "function") {
      _sceneTextFxSmokeSession.cancel();
    }
    cancelSceneTextFxSession("smoke_manual_start");

    _sceneTextFxSmokeSession = runSceneTextFxSmoke({
      appHost: app,
      choicesHost: choices
    });

    return {
      ok: true,
      snapshot: _sceneTextFxSmokeSession?.getSnapshot?.() || null
    };
  };

  window.__STOP_SCENE_TEXT_FX_SMOKE__ = () => {
    if (_sceneTextFxSmokeSession && typeof _sceneTextFxSmokeSession.cancel === "function") {
      _sceneTextFxSmokeSession.cancel();
    }
    _sceneTextFxSmokeSession = null;
    return { ok: true };
  };

  window.__RUN_SCENE_TEXT_FX_SMOKE_INSTALLED__ = true;
}

function ensureSceneTextDomProbeHook() {
  if (typeof window === "undefined") return;
  if (window.__RUN_SCENE_TEXT_DOM_PROBE_INSTALLED__ === true) return;

  window.__RUN_SCENE_TEXT_DOM_PROBE__ = () => {
    const app = document.getElementById("app");
    const choices = document.getElementById("choices");
    const host = resolveFinalSceneTextHost(app);
    const renderCycle = ++_sceneTextRenderCycleSeq;
    const hostId = markFinalSceneTextHost(host, renderCycle, true);

    if (_sceneTextDomProbeSession && typeof _sceneTextDomProbeSession.cancel === "function") {
      _sceneTextDomProbeSession.cancel();
    }
    if (_sceneTextFxSmokeSession && typeof _sceneTextFxSmokeSession.cancel === "function") {
      _sceneTextFxSmokeSession.cancel();
    }
    cancelSceneTextFxSession("dom_probe_manual_start");

    _sceneTextDomProbeSession = runSceneTextDomProbe({
      appHost: app,
      finalHost: host,
      choicesHost: choices,
      finalHostId: hostId,
      renderCycle,
      attachedAtStage: "manual_trigger",
      currentMapId: String(gameState?.currentMapId || gameState?.currentMap?.id || ""),
      currentSceneId: String(gameState?.currentSceneId || "")
    });

    return {
      ok: true,
      snapshot: _sceneTextDomProbeSession?.getSnapshot?.() || null
    };
  };

  window.__STOP_SCENE_TEXT_DOM_PROBE__ = () => {
    if (_sceneTextDomProbeSession && typeof _sceneTextDomProbeSession.cancel === "function") {
      _sceneTextDomProbeSession.cancel();
    }
    _sceneTextDomProbeSession = null;
    return { ok: true };
  };

  window.__GET_SCENE_TEXT_DOM_PROBE_SNAPSHOT__ = () => {
    if (!_sceneTextDomProbeSession || typeof _sceneTextDomProbeSession.getSnapshot !== "function") {
      return { ok: false, reason: "probe_not_running" };
    }
    return { ok: true, snapshot: _sceneTextDomProbeSession.getSnapshot() };
  };

  window.__GET_SCENE_TEXT_DOM_LOCATOR_SNAPSHOT__ = () => {
    return getSceneTextDomLocatorSnapshot();
  };

  window.__GET_SCENE_TEXT_RUNTIME_ROOT_SNAPSHOT__ = () => {
    return getSceneTextRuntimeRootSnapshot();
  };

  window.__GET_SCENE_TEXT_BOUNDARY_AUDIT__ = () => {
    const domAudit = getSceneTextBoundaryAuditSnapshot();
    return {
      policy_output: _sceneTextBoundaryAuditState.policy_output,
      view_model_sceneTextFx: _sceneTextBoundaryAuditState.view_model_sceneTextFx,
      renderer_callsite: _sceneTextBoundaryAuditState.renderer_callsite,
      dom_entry: domAudit?.dom_entry || null,
      normalizeChunkPlan_result: domAudit?.normalizeChunkPlan_result || null,
      runtimeAudit_rawChunk: domAudit?.runtimeAudit_rawChunk || null
    };
  };

  window.__GET_UI_DEBUG_FLAG_SNAPSHOT__ = () => {
    return getDebugFlagSnapshot();
  };

  window.__GET_UI_SURFACE_REGISTRY__ = () => {
    return getUiSurfaceRegistry();
  };

  window.__GET_SCENE_TEXT_HOST_LIFECYCLE__ = () => {
    return {
      ok: true,
      records: _sceneTextHostAuditRecords.slice(-120)
    };
  };

  window.__RESET_SCENE_TEXT_HOST_LIFECYCLE__ = () => {
    _sceneTextHostAuditRecords = [];
    _sceneTextHostAuditLastNode = null;
    return { ok: true };
  };

  window.__STOP_SCENE_TEXT_DOM_LOCATOR__ = () => {
    try {
      localStorage.removeItem("sceneTextDomLocator");
    } catch (_e) {
      // noop
    }
    stopSceneTextDomLocator();
    return { ok: true };
  };

  window.__RUN_SCENE_TEXT_DOM_LOCATOR__ = () => {
    try {
      localStorage.setItem("sceneTextDomLocator", "1");
    } catch (_e) {
      // noop
    }
    window.__SCENE_TEXT_DOM_LOCATOR__ = true;
    return {
      ok: true,
      snapshot: getSceneTextDomLocatorSnapshot()
    };
  };

  window.__RUN_SCENE_TEXT_DOM_PROBE_INSTALLED__ = true;
}

function ensureDebugWeatherHook() {
  if (typeof window === "undefined") return;
  if (window.__DEBUG_FORCE_WEATHER_EVENT_INSTALLED__ === true) return;

  window.__DEBUG_FORCE_WEATHER_EVENT__ = (eventType = "light_snow", durationMinutes) => {
    const before = {
      totalMinutes: Number(gameState?.time?.totalMinutes ?? 0),
      weatherEventType: String(gameState?.world?.weather?.weatherEventType || ""),
      weatherEventEndsAtMinute: Number(gameState?.world?.weather?.weatherEventEndsAtMinute ?? 0),
      cloudType: String(gameState?.world?.weather?.cloudType || ""),
      stormIntensity: Number(gameState?.world?.weather?.stormIntensity ?? 0),
      snowfallRate: Number(gameState?.world?.weather?.snowfallRate ?? 0),
      isSnowing: gameState?.world?.weather?.isSnowing === true,
      snowIntensityLevel: String(gameState?.world?.weather?.snowIntensityLevel || "")
    };
    const after = forceWeatherEvent(eventType, durationMinutes);
    render();
    return {
      ok: true,
      before,
      after
    };
  };

  window.__DEBUG_SNOW_NOW__ = (durationMinutes) => {
    return window.__DEBUG_FORCE_WEATHER_EVENT__("light_snow", durationMinutes);
  };

  window.__DEBUG_FORCE_WEATHER_EVENT_INSTALLED__ = true;
}

function runSceneTextFxForMainMap(pageViewModel, appHost, choicesHost) {
  const diagnostic = isSceneTextFxDiagnosticEnabled();
  const currentHost = getSceneTextFxHost(appHost);
  const policy = pageViewModel?.sceneTextFx && typeof pageViewModel.sceneTextFx === "object"
    ? pageViewModel.sceneTextFx
    : null;
  const rendererCallsiteShape = toSceneTextBoundaryShape("renderer_callsite", policy || {});
  updateSceneTextBoundaryAuditLayer("renderer_callsite", rendererCallsiteShape);
  console.info("[SceneTextBoundaryAudit] renderer_callsite", rendererCallsiteShape);
  const isMapPage = !!pageViewModel && pageViewModel.pageType === "map";

  if (!isMapPage || !policy) {
    if (_sceneTextFxSessionRecord) {
      cancelSceneTextFxSession(isMapPage ? "scene_text_fx_missing" : "non_map_page");
    }
    return;
  }

  const contentKey = String(policy.contentKey || "").trim();
  const normalizedKey = contentKey || "__scene_text_fx_no_key__";
  const nowTs = Date.now();

  if (_sceneTextFxSessionRecord) {
    const record = _sceneTextFxSessionRecord;
    const sameKey = String(record.contentKey || "") === normalizedKey;
    const running = record.state === "running";
    const hostConnected = !!record.hostElement?.isConnected;
    const hostSame = !!currentHost && record.hostElement === currentHost;
    const lockActive = diagnostic
      && sameKey
      && Number.isFinite(record.diagnosticLockUntil)
      && nowTs < record.diagnosticLockUntil;

    if (running && sameKey && hostConnected && hostSame) {
      if (diagnostic && currentHost) {
        currentHost.setAttribute("data-scene-text-host-stable", "1");
      }
      return;
    }

    if (running && sameKey && lockActive) {
      if (diagnostic && currentHost) {
        currentHost.setAttribute("data-scene-text-host-stable", hostSame ? "1" : "0");
      }
      return;
    }

    if (running && sameKey && (!hostConnected || !hostSame)) {
      if (diagnostic && currentHost) {
        currentHost.setAttribute("data-scene-text-diagnostic", "1");
        currentHost.setAttribute("data-scene-text-phase", "host_replaced_reset");
        currentHost.setAttribute("data-scene-text-host-stable", "0");
        currentHost.setAttribute("data-scene-text-session-id", String(record.sessionId));
        currentHost.setAttribute("data-scene-text-content-key", normalizedKey);
      }
      if (diagnostic) {
        console.warn("SceneTextFxDiagnostic host_replaced", {
          oldSessionId: record.sessionId,
          oldKey: String(record.contentKey || ""),
          newKey: normalizedKey
        });
      }
      cancelSceneTextFxSession("host_replaced_reset");
    } else if (running && !sameKey) {
      cancelSceneTextFxSession("content_key_changed");
    } else if (!running && sameKey) {
      if (diagnostic && currentHost) {
        currentHost.setAttribute("data-scene-text-host-stable", "1");
      }
      return;
    } else {
      clearSceneTextFxSessionRecord();
    }
  }

  if (!currentHost) return;

  const sessionId = ++_sceneTextFxSessionSeq;
  const nextRecord = {
    sessionId,
    contentKey: normalizedKey,
    hostElement: currentHost,
    state: "running",
    startedAt: nowTs,
    finishedAt: null,
    diagnosticLockUntil: diagnostic ? computeSceneTextFxDiagnosticLockUntil(policy, nowTs) : 0
  };

  if (diagnostic) {
    currentHost.setAttribute("data-scene-text-diagnostic", "1");
    currentHost.setAttribute("data-scene-text-session-id", String(sessionId));
    currentHost.setAttribute("data-scene-text-content-key", normalizedKey);
    currentHost.setAttribute("data-scene-text-host-stable", "1");
    currentHost.setAttribute("data-scene-text-phase", "session_started");
  }

  const { stableWidth: _stableMountWidth = null } = resolveSceneTextMountGeometry(appHost);

  try {
    _sceneTextFxSessionRecord = nextRecord;
    _sceneTextFxDomSession = runSceneTextFxDom({
      appHost,
      actionsHost: choicesHost,
      policy: pageViewModel?.sceneTextFx,
      sessionId,
      stableMountWidth: _stableMountWidth,
      onSessionStateChange: (snapshot) => {
        if (!_sceneTextFxSessionRecord) return;
        if (_sceneTextFxSessionRecord.sessionId !== snapshot?.sessionId) return;
        _sceneTextFxSessionRecord.state = snapshot?.state || _sceneTextFxSessionRecord.state;
        _sceneTextFxSessionRecord.finishedAt = snapshot?.finishedAt || _sceneTextFxSessionRecord.finishedAt;
      },
      onAnimationCompleted: ({ key }) => {
        commitSceneTextFxAnimated(key);
      }
    });
  } catch (error) {
    if (choicesHost) {
      choicesHost.classList.remove("scene-text-fx-actions-hidden", "scene-text-fx-actions-reveal");
      choicesHost.style.removeProperty("--scene-text-fx-actions-fade-ms");
      choicesHost.style.removeProperty("pointer-events");
      choicesHost.removeAttribute("aria-hidden");
    }
    if (diagnostic && appHost) {
      const descEl = getSceneTextFxHost(appHost);
      if (descEl) {
        descEl.setAttribute("data-scene-text-diagnostic", "1");
        descEl.setAttribute("data-scene-text-phase", "renderer_catch_fallback");
        descEl.setAttribute("data-scene-text-session-id", String(sessionId));
        descEl.setAttribute("data-scene-text-content-key", normalizedKey);
      }
      console.warn("[SceneTextFxDiagnostic] fallback hit: renderer_catch", error);
    }
    clearSceneTextFxSessionRecord();
    console.warn("[SceneTextFx] DOM fallback to static", error);
  }
}

function renderResolvedActionEntries(map, entries, choicesContainer) {
  const criticalMode = String(entries?.find((it) => String(it?.criticalMode || "").trim())?.criticalMode || "NORMAL").toUpperCase();
  const isCollapseMode = criticalMode === "COLLAPSE";
  const isDeadMode = criticalMode === "DEAD";
  choicesContainer.classList.toggle("is-critical-collapse", isCollapseMode);
  choicesContainer.classList.toggle("is-critical-dead", isDeadMode);
  if (isCollapseMode || isDeadMode) {
    choicesContainer.dataset.criticalMode = criticalMode;
  } else {
    delete choicesContainer.dataset.criticalMode;
  }

  const actionGroup = createActionGroup("动作", "actions");
  const movementGroup = createActionGroup("移动", "movement");
  const collapsibleSpecs = resolveCollapsibleActionGroupSpecs(map);
  const childActionToGroup = new Map();
  const groupMetaById = new Map();
  const renderedCollapsibleGroups = new Map();

  for (const spec of collapsibleSpecs) {
    groupMetaById.set(spec.id, spec);
    for (const childId of spec.childrenActionIds) {
      childActionToGroup.set(childId, spec.id);
    }
  }

  let actionCount = 0;
  let movementCount = 0;

  for (const entry of entries) {
    const actionId = String(entry?.action?.id || "").trim();
    const collapseSuppressed = String(entry?.criticalMode || "").toUpperCase() === "COLLAPSE";
    const widget = renderActionWidget(map, entry?.action, {
      locked: entry?.locked === true,
      disabled: entry?.disabled === true,
      remapActionId: String(entry?.remapActionId || "").trim() || null,
      gateReason: String(entry?.gateReason || "").trim() || null,
      kindTag: entry?.kindTag || (entry?.isMovement ? "移动" : "动作"),
      suppressed: collapseSuppressed || String(entry?.criticalMode || "").toUpperCase() === "DEAD"
    });
    if (!widget) continue;
    if (entry?.isMovement) {
      movementGroup.list.appendChild(widget);
      movementCount += 1;
    } else {
      const collapsibleGroupId = childActionToGroup.get(actionId);
      if (!collapsibleGroupId) {
        actionGroup.list.appendChild(widget);
        actionCount += 1;
        continue;
      }

      const groupSpec = groupMetaById.get(collapsibleGroupId);
      if (!groupSpec) {
        actionGroup.list.appendChild(widget);
        actionCount += 1;
        continue;
      }

      let groupWidget = renderedCollapsibleGroups.get(collapsibleGroupId);
      if (!groupWidget) {
        groupWidget = createCollapsibleActionGroupWidget(groupSpec, {
          suppressToggle: isCollapseMode || isDeadMode
        });
        renderedCollapsibleGroups.set(collapsibleGroupId, groupWidget);
        actionGroup.list.appendChild(groupWidget.root);
        actionCount += 1;
      }

      groupWidget.children.appendChild(widget);
    }
  }

  if (actionCount > 0) choicesContainer.appendChild(actionGroup.root);
  if (movementCount > 0) choicesContainer.appendChild(movementGroup.root);

  if (isCollapseMode || isDeadMode) {
    // Critical mode must always start from a fully suppressed action-zone state.
    for (const groupRoot of choicesContainer.querySelectorAll(".journal-collapsible-action-group")) {
      setCollapsibleActionGroupExpanded(groupRoot, false);
      groupRoot.classList.add("is-toggle-suppressed");
    }
    for (const row of choicesContainer.querySelectorAll("button.journal-action")) {
      row.classList.remove("is-selected", "is-active");
      row.removeAttribute("aria-selected");
    }
    if (document.activeElement instanceof HTMLElement && choicesContainer.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }
}

function resolveCollapsibleActionGroupSpecs(map) {
  const rawGroups = Array.isArray(map?.ui?.actionGroups) ? map.ui.actionGroups : [];
  if (rawGroups.length === 0) return [];

  const specs = [];
  const occupiedChildIds = new Set();

  for (const raw of rawGroups) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;

    const id = String(raw.id || "").trim();
    if (!id) continue;

    const title = String(raw.title || "").trim() || "查看周边信息";
    const icon = String(raw.icon || "").trim();
    const hint = String(raw.hint || "").trim();
    const defaultCollapsed = raw.defaultCollapsed !== false;

    const childrenActionIds = [];
    const seenInGroup = new Set();
    const rawChildren = Array.isArray(raw.childrenActionIds) ? raw.childrenActionIds : [];
    for (const childRaw of rawChildren) {
      const childId = String(childRaw || "").trim();
      if (!childId || seenInGroup.has(childId) || occupiedChildIds.has(childId)) continue;
      seenInGroup.add(childId);
      occupiedChildIds.add(childId);
      childrenActionIds.push(childId);
    }

    if (childrenActionIds.length === 0) continue;
    specs.push({
      id,
      title,
      icon,
      hint,
      defaultCollapsed,
      childrenActionIds
    });
  }

  return specs;
}

function createCollapsibleActionGroupWidget(groupSpec, options = {}) {
  const suppressToggle = options.suppressToggle === true;
  const root = document.createElement("div");
  root.className = `journal-collapsible-action-group${suppressToggle ? " is-toggle-suppressed" : ""}`;
  root.dataset.actionGroupId = groupSpec.id;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "journal-action journal-action-group-toggle";
  toggle.dataset.actionGroupToggle = groupSpec.id;

  const title = document.createElement("span");
  title.className = "journal-action-label";
  const icon = String(groupSpec.icon || "").trim();
  title.textContent = icon ? `${icon} ${groupSpec.title}` : groupSpec.title;
  toggle.appendChild(title);

  const hintText = String(groupSpec.hint || "").trim();
  if (hintText) {
    const hint = document.createElement("span");
    hint.className = "journal-action-group-hint";
    hint.textContent = hintText;
    toggle.appendChild(hint);
  }

  const indicator = document.createElement("span");
  indicator.className = "journal-action-group-indicator";
  indicator.setAttribute("aria-hidden", "true");
  indicator.textContent = "▾";
  toggle.appendChild(indicator);

  const shell = document.createElement("div");
  shell.className = "journal-action-group-children-shell";

  const children = document.createElement("div");
  children.className = "journal-action-group-children";
  shell.appendChild(children);

  root.appendChild(toggle);
  root.appendChild(shell);

  setCollapsibleActionGroupExpanded(root, suppressToggle ? false : (groupSpec.defaultCollapsed !== true));

  if (suppressToggle) {
    toggle.disabled = true;
    toggle.setAttribute("aria-disabled", "true");
    toggle.dataset.gateReason = "critical_disabled";
    shell.setAttribute("aria-hidden", "true");
    shell.setAttribute("inert", "");
    return { root, children };
  }

  toggle.addEventListener("click", () => {
    const isExpanded = root.classList.contains("is-expanded");
    setCollapsibleActionGroupExpanded(root, !isExpanded);
  });

  return { root, children };
}

function setCollapsibleActionGroupExpanded(root, expanded) {
  root.classList.toggle("is-expanded", expanded);
  const toggle = root.querySelector(".journal-action-group-toggle");
  if (toggle) {
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  }
  const shell = root.querySelector(".journal-action-group-children-shell");
  if (shell) {
    shell.setAttribute("aria-hidden", expanded ? "false" : "true");
    if (expanded) {
      shell.removeAttribute("inert");
    } else {
      shell.setAttribute("inert", "");
    }
  }
}

function renderMenuMainActions(choicesContainer) {
  const slots = saveManager.listSlots();
  const autoSlot = slots.find(s => s.slotId === "auto");
  const canContinue = !!autoSlot && !autoSlot.isEmpty && !autoSlot.corrupted;

  if (canContinue) {
    const continueBtn = makeActionButton("menu_continue_auto", "继续游戏");
    choicesContainer.appendChild(continueBtn);
  }

  choicesContainer.appendChild(makeActionButton("menu_new_game", "新建游戏", ["primary-action"]));
  choicesContainer.appendChild(makeActionButton("menu_go_load", "读取存档"));
  choicesContainer.appendChild(makeActionButton("menu_go_settings", "设置"));
  choicesContainer.appendChild(makeActionButton("menu_go_credits", "开发组信息"));
}

function slotTitle(slot) {
  if (slot === "auto") return "AUTO";
  return `槽位 ${slot}`;
}

function safeSlotName(slot) {
  const text = String(slot?.displayName || "").trim();
  if (text) return text;
  return slotTitle(slot?.slotId);
}

function getSlotTimeDayLine(slot) {
  if (slot.isEmpty) return "缺失";
  if (slot.corrupted) return `损坏 · ${slot.error || "版本不兼容"}`;
  const total = Number(slot.playtimeMinutes ?? 0);
  const hh = Math.floor((total % 1440) / 60).toString().padStart(2, "0");
  const mm = Math.floor(total % 60).toString().padStart(2, "0");
  return `Day ${slot.day} · ${hh}:${mm}`;
}

function getSlotAttrLine(slot) {
  if (slot.isEmpty) return "无存档数据";
  if (slot.corrupted) return slot.error || "版本不兼容";

  const hp = Number(slot.hp ?? 0).toFixed(0);
  const sat = slot.satiety != null ? Number(slot.satiety).toFixed(0) : "--";
  const stamina = slot.stamina != null ? Number(slot.stamina).toFixed(0) : "--";
  const fatigue = slot.fatigue != null ? Number(slot.fatigue).toFixed(0) : "--";
  return `HP ${hp} · Sat ${sat} · Sta ${stamina} · Fat ${fatigue}`;
}

function compactMapSegment(rawMapId) {
  const text = String(rawMapId || "未知").trim();
  if (!text) return "未知";
  const parts = text.split("/").filter(Boolean);
  const tail = parts.length > 0 ? parts[parts.length - 1] : text;
  if (tail.length <= 22) return tail;
  return `…${tail.slice(-22)}`;
}

function getSlotStatus(slot) {
  if (slot.isEmpty) return { cls: "is-missing", dot: "○", label: "缺失" };
  if (slot.corrupted) return { cls: "is-corrupted", dot: "×", label: "损坏" };
  return { cls: "is-valid", dot: "●", label: "有效" };
}

function passFilter(slot, filterKey) {
  if (filterKey === "filled") return !slot.isEmpty && !slot.corrupted;
  if (filterKey === "empty") return !!slot.isEmpty;
  if (filterKey === "corrupted") return !!slot.corrupted;
  return true;
}

function formatIsoCompact(isoString) {
  if (!isoString) return "";
  try {
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return "";
    const yyyy = String(dt.getFullYear());
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    const hh = String(dt.getHours()).padStart(2, "0");
    const mi = String(dt.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return "";
  }
}

function ensureSlotPopoverRoot() {
  let root = document.getElementById("slot-popover-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "slot-popover-root";
    root.className = "slot-popover-root";
    root.setAttribute("aria-hidden", "true");
    document.body.appendChild(root);
  }
  _slotPopoverRoot = root;
  return root;
}

function closeSlotPopover() {
  if (!_slotPopoverRoot) {
    const found = document.getElementById("slot-popover-root");
    if (!found) return;
    _slotPopoverRoot = found;
  }

  _slotPopoverPanel = null;
  _slotPopoverTrigger = null;
  _slotPopoverRoot.innerHTML = "";
  _slotPopoverRoot.setAttribute("aria-hidden", "true");

  if (_slotPopoverBound) {
    document.removeEventListener("pointerdown", onSlotPopoverOutsidePointerDown, true);
    document.removeEventListener("keydown", onSlotPopoverKeyDown, true);
    window.removeEventListener("scroll", onSlotPopoverAnyScroll, true);
    window.removeEventListener("resize", onSlotPopoverAnyScroll, true);
    _slotPopoverBound = false;
  }
}

function onSlotPopoverOutsidePointerDown(event) {
  const target = event.target;
  if (_slotPopoverPanel && _slotPopoverPanel.contains(target)) return;
  if (_slotPopoverTrigger && _slotPopoverTrigger.contains(target)) return;
  closeSlotPopover();
}

function onSlotPopoverKeyDown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeSlotPopover();
  }
}

function onSlotPopoverAnyScroll() {
  closeSlotPopover();
}

function openSlotPopover(triggerButton, items = []) {
  if (!triggerButton || items.length === 0) {
    closeSlotPopover();
    return;
  }

  if (_slotPopoverTrigger === triggerButton && _slotPopoverPanel) {
    closeSlotPopover();
    return;
  }

  closeSlotPopover();
  const root = ensureSlotPopoverRoot();

  const panel = document.createElement("div");
  panel.className = "slot-popover-panel";
  panel.setAttribute("role", "menu");

  for (const it of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `slot-popover-item${it?.danger ? " is-danger" : ""}`;
    btn.textContent = String(it?.label || "操作");
    if (it?.title) btn.title = String(it.title);
    if (it?.actionId) btn.dataset.actionId = String(it.actionId);
    btn.addEventListener("click", () => {
      setTimeout(() => closeSlotPopover(), 0);
    });
    panel.appendChild(btn);
  }

  root.appendChild(panel);
  root.setAttribute("aria-hidden", "false");

  const rect = triggerButton.getBoundingClientRect();
  const menuRect = panel.getBoundingClientRect();
  const margin = 8;
  const gap = 6;

  let left = rect.right - menuRect.width;
  const maxLeft = window.innerWidth - menuRect.width - margin;
  left = Math.max(margin, Math.min(left, maxLeft));

  let top = rect.bottom + gap;
  if (top + menuRect.height > window.innerHeight - margin) {
    top = rect.top - menuRect.height - gap;
  }
  top = Math.max(margin, Math.min(top, window.innerHeight - menuRect.height - margin));

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;

  _slotPopoverPanel = panel;
  _slotPopoverTrigger = triggerButton;

  document.addEventListener("pointerdown", onSlotPopoverOutsidePointerDown, true);
  document.addEventListener("keydown", onSlotPopoverKeyDown, true);
  window.addEventListener("scroll", onSlotPopoverAnyScroll, true);
  window.addEventListener("resize", onSlotPopoverAnyScroll, true);
  _slotPopoverBound = true;
}

function renderMenuLoadPage(appContainer) {
  appContainer.innerHTML = `
    <section class="menu-load-stage" aria-live="polite">
      <div class="menu-load-titlebar save-header-title">
        <div class="menu-load-stage-title title-text">存档</div>
        <button type="button" class="menu-load-info-btn info-btn" aria-label="信息" title="存档说明：AUTO 为系统保留槽位">i</button>
      </div>
      <div class="menu-load-subbar">AUTO 为系统保留槽位</div>
    </section>
  `;
}

function renderMenuLoadActions(choicesContainer) {
  const slots = saveManager.listSlots();
  const order = saveManager.listSlotIds();
  const byId = new Map(slots.map(s => [s.slotId, s]));
  const returnMapId = String(gameState?.ui?.menuReturnMapId || "").trim();
  const fromInGame = !!(returnMapId && !isMenuMapId(returnMapId));
  const inMainMenuContext = !fromInGame;
  console.info("[MenuLoadRebuildProbe:renderMenuLoadActions]", {
    seq: nextMenuLoadRebuildProbeSeq(),
    currentMapId: String(gameState?.currentMapId || "") || null,
    menuReturnMapId: String(gameState?.ui?.menuReturnMapId || "") || null,
    fromInGame,
    inMainMenuContext,
    choicesContainerChildElementCount: Number(choicesContainer?.childElementCount || 0),
    stack: getMenuLoadRebuildProbeStack(10)
  });

  const actionsRoot = document.createElement("div");
  actionsRoot.className = "menu-load-actions-root";
  choicesContainer.appendChild(actionsRoot);

  const toolbar = document.createElement("div");
  toolbar.className = "menu-load-toolbar";
  toolbar.innerHTML = `
    <div class="menu-load-filter-group">
      <label for="menu-load-filter">筛选</label>
      <select id="menu-load-filter" class="menu-load-filter-select">
        <option value="all">全部</option>
        <option value="filled">仅有存档</option>
        <option value="empty">仅空槽</option>
        <option value="corrupted">仅损坏</option>
      </select>
    </div>
  `;

  const tools = document.createElement("div");
  tools.className = "menu-load-tools";

  const addSlotBtn = makeActionButton("menu_add_slot", "+ 新增槽位", ["menu-load-action-btn"]);
  addSlotBtn.classList.add("menu-load-tool-btn");
  tools.appendChild(addSlotBtn);

  const importBtn = makeActionButton("menu_import_global", "导入存档", ["menu-load-action-btn"]);
  importBtn.classList.add("menu-load-tool-btn", "menu-load-import-btn");
  tools.appendChild(importBtn);

  toolbar.appendChild(tools);
  actionsRoot.appendChild(toolbar);

  const list = document.createElement("div");
  list.className = "menu-load-list";
  actionsRoot.appendChild(list);

  const buildOverflowMenu = (slot, id) => {
    const items = [];

    const updated = formatIsoCompact(slot.updatedAt);

    if (id === "auto") {
      items.push({ actionId: `menu_export:${id}`, label: "导出", title: updated ? `更新时间：${updated}` : "导出当前槽位" });
      return items;
    }

    items.push({ actionId: `menu_rename:${id}`, label: "重命名", title: updated ? `更新时间：${updated}` : "重命名槽位" });
    items.push({ actionId: `menu_delete:${id}`, label: "删除", danger: true, title: "删除槽位" });

    if (!slot.isEmpty && !slot.corrupted) {
      items.push({ actionId: `menu_export:${id}`, label: "导出", title: "导出存档" });
      items.push({ actionId: `menu_import:${id}`, label: "导入到此槽位", title: "导入并覆盖" });
    }
    return items;
  };

  const buildRow = (slot, id) => {
    const status = getSlotStatus(slot);
    const row = document.createElement("div");
    row.className = `menu-load-row ${status.cls}`;
    if (id === "auto") row.classList.add("is-auto");

    const left = document.createElement("div");
    left.className = "menu-load-col-left";
    const typeTag = id === "auto"
      ? "系统自动存档"
      : (slot.isEmpty || slot.corrupted ? "空槽位" : "手动");
    const idTag = id === "auto" ? "" : `<span class="menu-slot-id">#${escapeHtml(String(id))}</span>`;
    left.innerHTML = `
      <span class="menu-slot-name">${escapeHtml(safeSlotName(slot))}${idTag}</span>
      <span class="menu-slot-type">${escapeHtml(typeTag)}</span>
    `;

    const mid = document.createElement("div");
    mid.className = "menu-load-col-mid";
    const line1 = document.createElement("div");
    line1.className = "menu-load-line menu-load-line-main";
    const line2 = document.createElement("div");
    line2.className = "menu-load-line menu-load-line-sub";

    if (slot.isEmpty || slot.corrupted) {
      line1.textContent = "空槽位 · 尚无可读取进度";
      line2.textContent = "HP -- · Sat -- · Sta -- · Fat --";
      row.title = "空槽位：可保存或导入";
    } else {
      line1.textContent = `${getSlotTimeDayLine(slot)} · ${compactMapSegment(slot.location)}`;
      line2.textContent = getSlotAttrLine(slot);
    }
    mid.appendChild(line1);
    mid.appendChild(line2);

    const right = document.createElement("div");
    right.className = "menu-load-col-right";

    if (id === "auto") {
      const loadBtn = makeActionButton(`menu_load:${id}`, "加载", ["menu-load-action-btn", "menu-load-btn", "is-primary"]);
      if (slot.isEmpty || slot.corrupted) loadBtn.disabled = true;
      const exportBtn = makeActionButton(`menu_export:${id}`, "导出", ["menu-load-action-btn", "menu-load-btn", "is-secondary"]);
      if (slot.isEmpty || slot.corrupted) exportBtn.disabled = true;
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "menu-load-action-btn menu-load-more-btn btn-more";
      moreBtn.textContent = "…";
      moreBtn.title = "更多操作";
      moreBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openSlotPopover(moreBtn, buildOverflowMenu(slot, id));
      });
      right.appendChild(loadBtn);
      right.appendChild(exportBtn);
      right.appendChild(moreBtn);
    } else if (slot.isEmpty || slot.corrupted) {
      const saveBtn = makeActionButton(`menu_save:${id}`, "保存", ["menu-load-action-btn", "menu-load-btn", "is-primary"]);
      if (inMainMenuContext) {
        saveBtn.disabled = true;
        saveBtn.title = "主菜单不可保存";
      }
      console.info("[MenuLoadRebuildProbe:saveBtnConfigured]", {
        seq: nextMenuLoadRebuildProbeSeq(),
        slotId: String(id || "") || null,
        disabled: saveBtn.disabled === true,
        title: String(saveBtn.title || "") || null,
        fromInGame,
        inMainMenuContext,
        stack: getMenuLoadRebuildProbeStack(10)
      });
      const importBtnToSlot = makeActionButton(`menu_import:${id}`, "导入", ["menu-load-action-btn", "menu-load-btn", "is-secondary"]);
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "menu-load-action-btn menu-load-more-btn btn-more";
      moreBtn.textContent = "…";
      moreBtn.title = "更多操作";
      moreBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openSlotPopover(moreBtn, buildOverflowMenu(slot, id));
      });
      right.appendChild(saveBtn);
      right.appendChild(importBtnToSlot);
      right.appendChild(moreBtn);
    } else {
      const loadBtn = makeActionButton(`menu_load:${id}`, "加载", ["menu-load-action-btn", "menu-load-btn", "is-primary"]);
      const saveBtn = makeActionButton(`menu_save:${id}`, "保存", ["menu-load-action-btn", "menu-load-btn", "is-secondary"]);
      if (inMainMenuContext) {
        saveBtn.disabled = true;
        saveBtn.title = "主菜单不可保存";
      }
      console.info("[MenuLoadRebuildProbe:saveBtnConfigured]", {
        seq: nextMenuLoadRebuildProbeSeq(),
        slotId: String(id || "") || null,
        disabled: saveBtn.disabled === true,
        title: String(saveBtn.title || "") || null,
        fromInGame,
        inMainMenuContext,
        stack: getMenuLoadRebuildProbeStack(10)
      });
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "menu-load-action-btn menu-load-more-btn btn-more";
      moreBtn.textContent = "…";
      moreBtn.title = "更多操作";
      moreBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openSlotPopover(moreBtn, buildOverflowMenu(slot, id));
      });
      right.appendChild(loadBtn);
      right.appendChild(saveBtn);
      right.appendChild(moreBtn);
    }

    row.appendChild(left);
    row.appendChild(mid);
    row.appendChild(right);
    return row;
  };

  const renderRows = (filterKey) => {
    closeSlotPopover();
    list.innerHTML = "";

    const autoSlot = byId.get("auto") || { slotId: "auto", isEmpty: true, isAuto: true };
    if (passFilter(autoSlot, filterKey)) {
      const pinnedHeader = document.createElement("div");
      pinnedHeader.className = "menu-load-section-title";
      pinnedHeader.innerHTML = `<span>系统自动存档</span><span class="menu-load-section-tag">系统保留</span>`;
      list.appendChild(pinnedHeader);
      list.appendChild(buildRow(autoSlot, "auto"));
    }

    const manualHeader = document.createElement("div");
    manualHeader.className = "menu-load-section-title";
    manualHeader.textContent = "手动存档";
    list.appendChild(manualHeader);

    for (const id of order) {
      if (id === "auto") continue;
      const slot = byId.get(id) || { slotId: id, isEmpty: true };
      if (!passFilter(slot, filterKey)) continue;
      list.appendChild(buildRow(slot, id));
    }

    const settings = settingsManager.getSettings();
    if (settings.scrollBehavior === "top") {
      list.scrollTop = 0;
    }
  };

  renderRows("all");

  const filterSelect = toolbar.querySelector("#menu-load-filter");
  if (filterSelect) {
    filterSelect.addEventListener("change", () => {
      renderRows(String(filterSelect.value || "all"));
    });
  }

  actionsRoot.appendChild(makeActionButton("menu_back_main", "返回", ["menu-load-action-btn", "menu-load-tool-btn", "menu-load-back-btn"]));
}

function renderMenuSettingsActions(viewModel, hostContainer) {
  const s = viewModel.settings;
  const toMB = (bytes) => `${(Number(bytes || 0) / (1024 * 1024)).toFixed(2)} MB`;
  const stats = viewModel.stats;
  const tabs = Array.isArray(viewModel.tabs) ? viewModel.tabs : [];
  const activeTab = tabs.some(tab => tab.id === viewModel.activeTab) ? viewModel.activeTab : "display";

  hostContainer.innerHTML = "";
  hostContainer.setAttribute("aria-hidden", "false");

  const overlay = document.createElement("section");
  overlay.className = "SettingsOverlay";
  overlay.id = "settings-overlay-root";

  const backdrop = document.createElement("div");
  backdrop.className = "SettingsBackdrop";
  backdrop.dataset.actionId = "menu_back_main";
  overlay.appendChild(backdrop);

  const dialog = document.createElement("section");
  dialog.className = "SettingsDialog";

  const header = document.createElement("header");
  header.className = "DialogHeader";
  header.innerHTML = `
    <div class="DialogHeaderText">
      <h2>设置</h2>
      <p>设置保存在本机，不进入存档快照。关闭自动存档只影响 Auto 槽位。</p>
    </div>
    <button type="button" class="ControlButton is-ghost" data-action-id="menu_back_main" aria-label="关闭设置">×</button>
  `;
  dialog.appendChild(header);

  const body = document.createElement("div");
  body.className = "DialogBody";

  const nav = document.createElement("nav");
  nav.className = "Nav";
  nav.setAttribute("aria-label", "设置分类");

  const content = document.createElement("section");
  content.className = "Content";

  const makeRow = (title, desc, control) => {
    const row = document.createElement("div");
    row.className = "SettingRow";

    const meta = document.createElement("div");
    meta.className = "SettingMeta";
    meta.innerHTML = `<div class="SettingTitle">${escapeHtml(title)}</div><div class="SettingDesc">${escapeHtml(desc || "")}</div>`;

    const right = document.createElement("div");
    right.className = "settingControl";
    if (control) right.appendChild(control);

    row.appendChild(meta);
    row.appendChild(right);
    return row;
  };

  const makeSegmented = (key, options, currentValue) => {
    const group = document.createElement("div");
    group.className = "ControlSegmented";
    for (const opt of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ControlSegmentedItem${String(opt.value) === String(currentValue) ? " is-active" : ""}`;
      btn.dataset.actionId = `settings_set:${key}:${opt.value}`;
      btn.innerHTML = `<span class="ControlText">${escapeHtml(opt.label)}</span>`;
      group.appendChild(btn);
    }
    return group;
  };

  const makeSwitch = (key, isOn) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `ControlSwitch${isOn ? " is-on" : ""}`;
    btn.dataset.actionId = `settings_toggle:${key}`;
    btn.setAttribute("role", "switch");
    btn.setAttribute("aria-checked", isOn ? "true" : "false");
    btn.innerHTML = `<span class="ControlSwitchTrack"><span class="ControlSwitchThumb"></span></span><span class="ControlSwitchLabel"><span class="ControlText">${isOn ? "开" : "关"}</span></span>`;
    return btn;
  };

  const makeActionButton = (text, actionId) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ControlButton";
    btn.dataset.actionId = actionId;
    btn.innerHTML = `<span class="ControlText">${escapeHtml(text)}</span>`;
    return btn;
  };

  const makeUsageCard = () => {
    const card = document.createElement("div");
    card.className = "StorageUsageCard";
    card.innerHTML = `
      <div><span>存档</span><b>${escapeHtml(toMB(stats.saveBytes))}</b></div>
      <div><span>设置</span><b>${escapeHtml(toMB(stats.settingsBytes))}</b></div>
      <div><span>日志</span><b>${escapeHtml(toMB(stats.logBytes))}</b></div>
      <div><span>总计</span><b>${escapeHtml(toMB(stats.usedBytes))}</b></div>
    `;
    return card;
  };

  const renderNav = () => {
    nav.innerHTML = "";
    for (const tab of tabs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `NavItem${activeTab === tab.id ? " is-active" : ""}${tab.weak ? " is-weak" : ""}`;
      btn.dataset.settingsTab = tab.id;
      btn.innerHTML = `<span class="ControlText">${escapeHtml(tab.label)}</span>`;
      nav.appendChild(btn);
    }
  };

  const renderContent = () => {
    content.innerHTML = "";

    const sectionTitle = document.createElement("h3");
    sectionTitle.className = "SectionTitle";

    if (activeTab === "display") {
      sectionTitle.textContent = "显示";
      content.appendChild(sectionTitle);
      content.appendChild(makeRow("UI 缩放", "影响整体 UI 尺寸（按钮、面板与文本）。", makeSegmented("uiScale", [
        { value: 80, label: "80" },
        { value: 90, label: "90" },
        { value: 100, label: "100" },
        { value: 110, label: "110" },
        { value: 125, label: "125" },
      ], s.uiScale)));
      content.appendChild(makeRow("字体大小", "优化阅读密度与疲劳感。", makeSegmented("fontSize", [
        { value: "small", label: "小" },
        { value: "normal", label: "标准" },
        { value: "large", label: "大" },
      ], s.fontSize)));
      content.appendChild(makeRow("行距", "文本行高：紧凑 / 标准 / 宽松。", makeSegmented("lineSpacing", [
        { value: "tight", label: "紧凑" },
        { value: "normal", label: "标准" },
        { value: "loose", label: "宽松" },
      ], s.lineSpacing)));
      content.appendChild(makeRow("对比度", "提高文字与边框可读性。", makeSegmented("contrast", [
        { value: "standard", label: "标准" },
        { value: "high", label: "高对比" },
      ], s.contrast)));
      content.appendChild(makeRow("字体策略", "游戏字体 / 系统字体栈。", makeSegmented("fontPolicy", [
        { value: "game", label: "游戏字体" },
        { value: "system", label: "系统字体栈" },
      ], s.fontPolicy)));
      return;
    }

    if (activeTab === "performance") {
      sectionTitle.textContent = "性能";
      content.appendChild(sectionTitle);
      content.appendChild(makeRow("性能模式", "一键切换性能 / 画质倾向。", makeSegmented("perfPreset", [
        { value: "performance", label: "性能" },
        { value: "balanced", label: "均衡" },
        { value: "quality", label: "质量" },
      ], s.perfPreset)));
      content.appendChild(makeRow("模糊效果", "滤镜开销较高，建议默认仅弹窗背景。", makeSegmented("blurMode", [
        { value: "off", label: "关闭" },
        { value: "low", label: "仅弹窗背景" },
        { value: "full", label: "完整" },
      ], s.blurMode)));
      content.appendChild(makeRow("减少动态效果", "降低过渡动画与视觉特效。", makeSwitch("reduceMotion", s.reduceMotion)));
      return;
    }

    if (activeTab === "interaction") {
      sectionTitle.textContent = "交互";
      content.appendChild(sectionTitle);
      content.appendChild(makeRow("快捷键", "Esc / I / J / S", makeSwitch("quickKeys", s.quickKeys)));
      content.appendChild(makeRow("滚动行为", "保持位置或每次回到顶部。", makeSegmented("scrollBehavior", [
        { value: "keep", label: "保持位置" },
        { value: "top", label: "每次回到顶部" },
      ], s.scrollBehavior)));
      content.appendChild(makeRow("危险操作确认", "覆盖导入、恢复默认等危险动作。", makeSwitch("confirmDangerous", s.confirmDangerous)));
      content.appendChild(makeRow("删除存档确认", "删除槽位前二次确认。", makeSwitch("confirmDeleteSave", s.confirmDeleteSave)));
      return;
    }

    if (activeTab === "data") {
      sectionTitle.textContent = "存档与数据";
      content.appendChild(sectionTitle);
      content.appendChild(makeRow("自动存档", "仅影响 AUTO 槽位。", makeSwitch("autosaveEnabled", s.autosaveEnabled)));
      content.appendChild(makeRow("自动存档触发", "按间隔或关键事件触发。", makeSegmented("autosaveTrigger", [
        { value: "interval", label: "间隔" },
        { value: "critical", label: "关键事件" },
      ], s.autosaveTrigger)));
      content.appendChild(makeRow("自动存档频率", "仅在“按间隔触发”时生效。", makeSegmented("autosaveIntervalMin", [
        { value: 5, label: "5m" },
        { value: 10, label: "10m" },
        { value: 30, label: "30m" },
      ], s.autosaveIntervalMin)));
      content.appendChild(makeRow("存档管理", "打开存档页进行导入导出与槽位管理。", makeActionButton("打开存档管理", "menu_go_load")));
      content.appendChild(makeRow("存储占用（只读）", "本机 LocalStorage 使用情况。", makeUsageCard()));
    }
  };

  overlay.addEventListener("click", async (event) => {
    const tabBtn = event.target.closest("[data-settings-tab]");
    if (tabBtn && nav.contains(tabBtn)) {
      rememberSettingsOverlayScrollTop(activeTab, Number(content.scrollTop || 0));
      const nextTab = String(tabBtn.dataset.settingsTab || "display");
      setSettingsOverlayActiveTab(nextTab);
      commitSettingsOverlay(hostContainer);
      return;
    }

    const actionBtn = event.target.closest("[data-action-id]");
    if (actionBtn && overlay.contains(actionBtn)) {
      const actionId = String(actionBtn.dataset.actionId || "").trim();
      if (!actionId) return;
      const { dispatch } = await import("./pipeline/dispatch.js");
      await dispatch(actionId);
    }
  });

  body.appendChild(nav);
  body.appendChild(content);
  dialog.appendChild(body);

  const footer = document.createElement("footer");
  footer.className = "DialogFooter";

  const leftOps = document.createElement("div");
  leftOps.className = "DialogFooterLeft";
  const resetBtn = makeActionButton("恢复默认", "settings_reset_defaults");
  resetBtn.classList.add("is-secondary");
  leftOps.appendChild(resetBtn);

  const rightOps = document.createElement("div");
  rightOps.className = "DialogFooterRight";

  footer.appendChild(leftOps);
  footer.appendChild(rightOps);
  dialog.appendChild(footer);

  overlay.appendChild(dialog);
  hostContainer.appendChild(overlay);
  const actionIdForSettingsRender = typeof window !== "undefined"
    ? String(window.__LAST_DISPATCH_ACTION_ID__ || "")
    : "";
  const panelPolicy = resolveTransitionPolicy(buildRenderTransitionPolicyContext({
    actionId: actionIdForSettingsRender,
    nextMapId: gameState.currentMapId,
    nextSurface: {
      pageType: "menu",
      overlayType: null,
      modalType: gameState?.ui?.modal ?? null
    }
  }));
  if (panelPolicy.allowPanelEnter) {
    playSettingsOverlayEnterAnimation(overlay, dialog);
  }

  renderNav();
  renderContent();

  if (s.scrollBehavior === "top") {
    content.scrollTop = 0;
  } else {
    content.scrollTop = Number(viewModel.scrollTop || 0);
  }
}

/**
 * 渲染菜单页面的右侧边栏（存档管理和更多选项）
 */
function renderMenuSidebar() {
  const { sidebar } = ensureStatusDock();
  
  // 根据当前页面显示不同内容
  const map = getCanonicalCurrentMap(gameState, { source: "renderer:renderMenuSidebar", repairState: true });
  
  if (map.id === "menu_more") {
    // 更多菜单页面：显示存档管理
    renderSaveManagementInSidebar(sidebar);
  } else if (map.id === "menu") {
    // 主菜单：显示"更多"入口按钮
    setSidebarStatusContent(sidebar, `
      <div class="sidebar-page sidebar-page-menu">
        <div class="sidebar-title">
          游戏选项
        </div>
        <button class="sidebar-btn" data-action-id="show_more_menu">
          📋 存档管理
        </button>
        <button class="sidebar-btn" data-action-id="show_settings">
          ⚙️ 设置
        </button>
      </div>
    `);
  }
  
  bindSidebarFallbackActionDispatch(sidebar);
}

/**
 * 在侧边栏中渲染存档管理界面
 */
function renderSaveManagementInSidebar(sidebar) {
  import("../save/save_manager.js").then(({ saveManager }) => {
    const slots = saveManager.listSlots();
    
    let html = '<div class="sidebar-page">';
    html += '<div class="sidebar-title">存档管理</div>';
    
    // 渲染每个槽位
    slots.forEach(slot => {
      const slotClass = slot.isAuto ? "sidebar-slot sidebar-slot-auto" : "sidebar-slot";
      html += `<div class="${slotClass}">`;
      
      if (slot.isEmpty) {
        const slotLabel = slot.isAuto ? '🔄 自动存档' : `槽位 ${slot.slotId}`;
        const emptyText = slot.isAuto ? '暂无自动存档' : '空槽位';
        html += `<div class="sidebar-slot-label">${slotLabel}</div>`;
        html += `<div class="sidebar-slot-subtle">${emptyText}</div>`;
        // 自动存档槽位不显示手动保存按钮
        if (!slot.isAuto) {
          html += `<button class="sidebar-btn sidebar-btn-compact sidebar-btn-save" data-action-id="save_to_slot_${slot.slotId}">💾 保存到此槽位</button>`;
        }
      } else if (slot.corrupted) {
        html += `<div class="sidebar-slot-label">槽位 ${slot.slotId}</div>`;
        html += `<div class="sidebar-slot-warn">存档损坏</div>`;
        html += `<div class="sidebar-btn-row">`;
        html += `<button class="sidebar-btn sidebar-btn-mini sidebar-btn-save" data-action-id="save_to_slot_${slot.slotId}">💾 保存</button>`;
        html += `<button class="sidebar-btn sidebar-btn-mini sidebar-btn-danger" data-action-id="delete_slot_${slot.slotId}">删除</button>`;
        html += `</div>`;
      } else {
        const date = new Date(slot.updatedAt);
        const dateStr = date.toLocaleString("zh-CN", { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        const slotLabel = slot.isAuto ? '🔄 自动存档' : `槽位 ${slot.slotId}`;
        html += `<div class="sidebar-slot-label">${slotLabel}</div>`;
        html += `<div class="sidebar-slot-meta">Day ${slot.day} | HP: ${slot.hp.toFixed(0)}</div>`;
        html += `<div class="sidebar-slot-time">${dateStr}</div>`;
        html += `<div class="sidebar-btn-row">`;
        // 自动存档槽位只显示加载和删除按钮
        if (!slot.isAuto) {
          html += `<button class="sidebar-btn sidebar-btn-mini sidebar-btn-save" data-action-id="save_to_slot_${slot.slotId}">💾 保存</button>`;
        }
        html += `<button class="sidebar-btn sidebar-btn-mini sidebar-btn-load" data-action-id="load_slot_${slot.slotId}">加载</button>`;
        html += `<button class="sidebar-btn sidebar-btn-mini sidebar-btn-danger" data-action-id="delete_slot_${slot.slotId}">删除</button>`;
        html += `</div>`;
      }
      
      html += '</div>';
    });
    
    // 导入/导出功能（可选）
    html += '<div class="sidebar-section">';
    html += '<div class="sidebar-subtitle">高级选项</div>';
    html += '<button class="sidebar-btn sidebar-btn-compact" data-action-id="export_save">导出存档</button>';
    html += '<button class="sidebar-btn sidebar-btn-compact" data-action-id="import_save">导入存档</button>';
    html += '</div>';
    html += '</div>';
    
    setSidebarStatusContent(sidebar, html);
    
    bindSidebarFallbackActionDispatch(sidebar);
  });
}

function buildSidebarFallbackPayload(btn) {
  const payloadSource = btn?.dataset?.payloadSource;
  if (!payloadSource) return {};

  const input = document.getElementById(payloadSource);
  const raw = input ? input.value : "";
  const minutes = parseInt(raw, 10);
  return { minutes: Number.isFinite(minutes) ? minutes : 0 };
}

function buildSidebarFallbackOptions(btn) {
  const actionFeedback = String(btn?.dataset?.actionFeedback || "").trim();
  const actionFeedbackModel = decodeUiRuntimeModel(btn?.dataset?.actionFeedbackModel || "");
  const actionIllustrationKey = String(btn?.dataset?.actionIllustrationKey || "").trim();
  const uiRuntime = {};
  if (actionFeedback) uiRuntime.actionFeedback = actionFeedback;
  if (actionFeedbackModel) uiRuntime.actionFeedbackModel = actionFeedbackModel;
  if (actionIllustrationKey) uiRuntime.actionIllustrationKey = actionIllustrationKey;
  return Object.keys(uiRuntime).length > 0 ? { uiRuntime } : undefined;
}

function bindSidebarFallbackActionDispatch(sidebar) {
  if (!sidebar || sidebar._hasFallbackActionDispatch) return;

  sidebar.addEventListener("click", async (event) => {
    if (window.__CC_INTERACTION_BINDING__?.bound) return;

    const btn = event.target.closest("button[data-action-id]");
    if (!btn || !sidebar.contains(btn)) return;

    const actionId = String(btn.dataset.actionId || "").trim();
    if (!actionId) return;

    event.preventDefault();
    event.stopPropagation();

    if (actionId === "ui_open_inventory" || actionId === "ui_map_open" || actionId === "ui_tasks_open" || actionId === "ui_memo_open") {
      const uiSnapshot = getUiActionStateSnapshot(gameState);
      pushUiOpenCallchain({
        source: "click:ui_open",
        actionId,
        actionType: "GLOBAL_ACTION",
        resolveEntered: false,
        resolveExited: false,
        commitEntered: false,
        commitExited: false,
        prev: uiSnapshot,
        next: uiSnapshot,
        canonicalSetterCalled: false,
        canonicalSelectorResult: null,
        renderedSurface: null,
        violationCode: null,
        errorMessage: null
      });
    }

    const payload = buildSidebarFallbackPayload(btn);
    const options = buildSidebarFallbackOptions(btn);
    const { dispatch } = await import("./pipeline/dispatch.js");
    await dispatch(actionId, payload, options);
  });

  sidebar._hasFallbackActionDispatch = true;
}

function renderSidebarToolButton({
  buttonClass = "",
  legacyClass = "",
  modifier = "",
  actionId = "",
  label = "",
  guideTarget = "",
  disabledAttrs = ""
} = {}) {
  const classes = [buttonClass, "sidebar-tool-btn", legacyClass, modifier ? `sidebar-tool-btn--${modifier}` : ""]
    .filter(Boolean)
    .join(" ");
  const guideAttr = String(guideTarget || "").trim()
    ? ` data-guide-target="${escapeAttr(guideTarget)}"`
    : "";
  return `<button class="${classes}" data-action-id="${escapeAttr(actionId)}"${guideAttr}${disabledAttrs}><span class="sidebar-tool-btn__content"><span class="sidebar-tool-btn__icon-slot"><span class="sidebar-tool-btn__icon" aria-hidden="true">${renderSidebarToolIconSvg(modifier, "sidebar-tool-btn__icon-svg")}</span></span><span class="sidebar-tool-btn__label">${escapeHtml(label)}</span></span></button>`;
}

function bindPlayerSidebarLocalActions(sidebar) {
  if (!sidebar || sidebar._hasPlayerSidebarLocalActions) return;
  sidebar.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-sidebar-local-action]");
    if (!btn || !sidebar.contains(btn)) return;

    const localAction = String(btn.dataset.sidebarLocalAction || "").trim();
    if (!localAction) return;

    event.preventDefault();
    event.stopPropagation();

    if (localAction === "show-bills") {
      const obs = Number(gameState.world?.medical?.bills?.obsCents ?? 0);
      const ward = Number(gameState.world?.medical?.bills?.wardCents ?? 0);
      const total = obs + ward;
      showNoticeDialog({
        title: "医疗账单",
        message:
          `急诊账单：${formatBillCents(obs)}\n` +
          `住院账单：${formatBillCents(ward)}\n` +
          `待付总额：${formatBillCents(total)}`,
        actions: [{ id: "ok", label: "返回", kind: "primary" }]
      });
    }
  });

  sidebar._hasPlayerSidebarLocalActions = true;
}

/**
 * 渲染右侧玩家状态栏
 */
function renderPlayerSidebar() {
  // ========== 1. 查找或创建侧边栏 DOM ==========
  const { sidebar } = ensureStatusDock();
  
  // ========== 2. 获取玩家派生数据 ==========
  const derived = getPlayerDerived(gameState.player);
  const sleepMode = String(gameState?.player?.meta?.sleepEpisode?.mode || "").toUpperCase();
  const isDeadMode = gameState?.player?.exposure?.dead === true;
  const isCollapseMode = !isDeadMode && sleepMode === "COLLAPSE";
  const staminaCur = Number(derived?.attrs?.stamina?.cur ?? gameState?.player?.physio?.stamina ?? 0);
  const staminaWakeThreshold = 20;
  const lowStaminaWarn = staminaCur < staminaWakeThreshold && !isDeadMode && !isCollapseMode;
  const lowStaminaDanger = staminaCur < 10 && !isDeadMode && !isCollapseMode;
  // This tooltip belongs to sidebar_status itself instead of transient_runtime:
  // it is a local, always-derivable explanation anchored to one sidebar icon, not a global feedback event.
  const sidebarStatusVm = buildSidebarStatusViewModel(gameState);
  
  // ========== 3. 构建侧边栏内容 ==========
  let html = '<div class="sidebar-page sidebar-page-player">';
  html += '<div class="status-header"><div class="sidebar-title title">状态总览</div></div>';
  
  // 渲染4个核心属性；温控卡会插入到 HP 后方，危险时自动展开并提高层级。
  const attrOrder = ["hp", "satiety", "stamina", "fatigue"];
  const currentAttrSnapshot = {};
  const attrTrendMap = {};
  for (const attrId of attrOrder) {
    const attr = derived.attrs[attrId];
    const cur = Number(attr?.cur ?? 0);
    currentAttrSnapshot[attrId] = cur;

    let trend = "none";
    if (_lastAttrSnapshot && Number.isFinite(_lastAttrSnapshot[attrId])) {
      const d = cur - _lastAttrSnapshot[attrId];
      if (d > 0.001) trend = "up";
      else if (d < -0.001) trend = "down";
    }
    attrTrendMap[attrId] = trend;
  }
  _lastAttrSnapshot = currentAttrSnapshot;

  const hpAttr = derived.attrs.hp;
  const hpFxState = syncLowHpFxState(hpAttr?.cur, hpAttr?.effectiveMax || hpAttr?.baseMax || 100, {
    isDead: isDeadMode
  });
  html += renderAttributeBar(
    hpAttr,
    "hp",
    attrTrendMap.hp || "none",
    {
      cardClass: `${hpFxState.tier !== "none" ? `hp-${hpFxState.tier}` : ""}${isDeadMode ? " hp-dead-state" : ""} attr-card-has-local-tooltip`.trim(),
      iconTooltipHtml: renderStatusEffectTooltip(sidebarStatusVm.healthStatusEffectTooltipVm),
      iconTooltipAriaLabel: "查看当前药品效果",
      statusTag: isDeadMode ? "死亡" : ""
    }
  );

  // 温控卡（L1/L2）：不再伪装成“/40 资源条”，而是强调状态/趋势/时间/原因。
  const temperatureC = Number(gameState.player?.physio?.temperatureC ?? 37);
  const hypothermia = Number(gameState.player?.psycho?.hypothermia ?? 100);
  const tv = getTimeView();
  const worldTimeContext = getWorldTimeContext(tv.totalMinutes, gameState.world);
  const regionCfg = getRegionConfigById(gameState.world?.regionId);
  const placeProfile = getPlaceProfileForMap(gameState.currentMapId, gameState.currentMap);
  const tEnvC = computeEnvTempC(regionCfg, tv, gameState.world, PLAYER_DEFS.temperature?.envTemp || {});
  const tEnvEffC = computeEffectiveEnvTempC(tEnvC, placeProfile, PLAYER_DEFS.temperature?.envTemp || {});
  const worldWind = Number(gameState.world?.windSpeed ?? gameState.world?.weather?.windSpeed_local ?? 0);
  const windLocal = computeLocalWind(worldWind, placeProfile);
  const warmthEff = computeEffectiveWarmth(gameState.player?.gear?.thermal, windLocal, PLAYER_DEFS.temperature?.coreTemp || {});
  const itemsById = getItemsById();
  const thermalReadoutCapability = resolveThermalReadoutCapability(gameState.player?.equippedTools, itemsById);
  const protectionUi = resolveThermalProtectionUi(gameState.player, itemsById);
  const thermalTrend = computeThermalTrendPer10Min(temperatureC, tv.totalMinutes);
  const isOutdoorExposureUi = String(placeProfile?.space || "outdoor") === "outdoor" && gameState.world?.exposureEnabled !== false;
  const exposureActive = PLAYER_DEFS.temperature?.exposureModel?.enabled !== false
    && String(placeProfile?.space || "outdoor") !== "indoor"
    && gameState.world?.exposureEnabled !== false
    && tEnvEffC < Number(PLAYER_DEFS.temperature?.coreTemp?.T_warm_threshold ?? 15);
  const rawExposureHypo100 = Number(gameState.player?.exposure?.hypo100);
  const exposureIncapacitated = !!gameState.player?.exposure?.incapacitated;
  const exposureHypo100 = !Number.isFinite(rawExposureHypo100)
    ? 100
    : (!exposureIncapacitated && rawExposureHypo100 <= 0 ? 100 : Math.max(0, Math.min(100, rawExposureHypo100)));
  const exposureTimings = exposureActive
    ? computeExposureDurations(Number(gameState.player?.gear?.thermal?.protectionScore ?? 0), PLAYER_DEFS.temperature?.exposureModel || {})
    : null;
  const exposureEta = exposureActive
    ? estimateExposureEtas(temperatureC, exposureTimings)
    : null;
  const hypoStage = exposureActive
    ? String(gameState.player?.exposure?.incapacitated ? "Severe" : getHypothermiaStage(exposureHypo100))
    : String(gameState.player?.psycho?.hypoStage || getHypothermiaStage(hypothermia));
  const riskPct = exposureActive
    ? Math.max(0, Math.min(100, 100 - exposureHypo100))
    : Math.max(0, Math.min(100, 100 - hypothermia));
  const thermalPrediction = exposureActive
    ? {
        label: "失能",
        minutes: Number(exposureEta?.toIncapMinutes ?? Infinity),
        deathMinutes: Number(exposureEta?.toDeathMinutes ?? Infinity)
      }
    : estimateThermalNextStage(temperatureC, thermalTrend.per10Min);
  const indoorWarmUi = !isOutdoorExposureUi
    ? estimateIndoorWarmUi(gameState.player, placeProfile, temperatureC)
    : null;
  const showThermalDebug = !!settingsManager.getSettings()?.showInternalLogs || String(gameState.currentMapId || "") === "test_temp";

  html += renderThermalControlCard({
    thermalReadoutCapability,
    temperatureC,
    hypothermia: exposureActive ? exposureHypo100 : hypothermia,
    hypoStage,
    riskPct,
    trendPer10Min: thermalTrend.per10Min,
    trendNotice: thermalTrend.notice,
    prediction: thermalPrediction,
    sourceMode: exposureActive ? "exposure" : "hypothermia",
    sourceValue: exposureActive ? exposureHypo100 : hypothermia,
    etaToDeathMinutes: exposureActive ? exposureEta?.toDeathMinutes : null,
    exposureTimings,
    indoorWarmUi,
    showExposureAnchors: isOutdoorExposureUi,
    tEnvC,
    windLocal,
    warmthEff,
    wetness: Number(gameState.player?.gear?.thermal?.wetness ?? 0),
    warmthRating: Number(gameState.player?.gear?.thermal?.warmthRating ?? 0),
    protectionUi,
    placeProfile,
    placeProfileId: String(gameState.currentMap?.placeProfileId || gameState.currentMapId || ""),
    lightPhase: String(worldTimeContext?.illumination?.lightPhase || ""),
    visibilityBand: String(worldTimeContext?.illumination?.visibilityBand || ""),
    showDebug: showThermalDebug,
    totalMinutes: tv.totalMinutes
  });

  html += renderAttributeBar(derived.attrs.satiety, "satiety", attrTrendMap.satiety || "none", {
    cardClass: "attr-card-has-local-tooltip",
    stageNameOverride: String(sidebarStatusVm.satietyStatusEffectTooltipVm?.summaryText || ""),
    iconTooltipHtml: renderStatusEffectTooltip(sidebarStatusVm.satietyStatusEffectTooltipVm),
    iconTooltipAriaLabel: "查看当前进食效果",
    secondaryBarHtml: renderSatietyIntakeLoadBar(
      Number(gameState?.player?.physio?.intakeLoad ?? 0),
      Number(PLAYER_DEFS?.intakeLoad?.max ?? 20)
    )
  });
  html += renderAttributeBar(derived.attrs.stamina, "stamina", attrTrendMap.stamina || "none", {
    cardClass: `${lowStaminaWarn ? "stamina-low" : ""} ${lowStaminaDanger ? "stamina-very-low" : ""} ${isCollapseMode ? "stamina-collapse-state" : ""}`.trim(),
    statusTag: isCollapseMode ? "昏厥中" : "",
    maxValueOverride: isCollapseMode ? staminaWakeThreshold : null,
    stageNameOverride: lowStaminaWarn ? "体力过低" : null
  });

  html += renderAttributeBar(derived.attrs.fatigue, "fatigue", attrTrendMap.fatigue || "none");

  const money = Number(gameState.world?.money ?? 0);
  const moneyFx = normalizeMoneyDeltaFxPayload(gameState?.ui?.moneyDeltaFx);
  const nowMs = Date.now();
  const moneyFxActive = !!moneyFx
    && Number.isFinite(moneyFx.createdAtMs)
    && nowMs - moneyFx.createdAtMs <= moneyFx.durationMs;
  const obsBill = Number(gameState.world?.medical?.bills?.obsCents ?? 0);
  const wardBill = Number(gameState.world?.medical?.bills?.wardCents ?? 0);

  html += '<div class="sidebar-section sidebar-section-settlement sidebar-econ-section sidebar-econ-section-compact">';
  html += '<div class="sidebar-panel-card sidebar-settlement-card">';
  html += `<div class="sidebar-balance-row sidebar-settlement-balance-row${moneyFxActive ? ` is-money-fx is-money-fx-${moneyFx.accent}` : ""}">`;
  html += '<span class="sidebar-balance-label">余额</span>';
  html += `<div class="sidebar-balance-value${moneyFxActive ? " is-money-fx-target" : ""}">${formatFormalMoney(money)}</div>`;
  if (moneyFxActive) {
    html += `<span class="sidebar-balance-delta sidebar-balance-delta-${moneyFx.accent}">${escapeHtml(moneyFx.label)}</span>`;
  }
  html += '<button class="sidebar-btn sidebar-btn-mini sidebar-btn-load sidebar-btn-bill" data-sidebar-local-action="show-bills">账单</button>';
  html += '</div>';
  
  // 预留：调试用的 mods 折叠区（暂不显示）
  // html += '<details style="margin-top: 16px;"><summary>修正详情（调试）</summary>';
  // html += '<pre style="font-size: 11px;">' + JSON.stringify(derived.mods, null, 2) + '</pre>';
  // html += '</details>';
  
  // ========== 4.1 侧边栏内置“消磨时间”（靠近底部） ==========
  const disabledReasonText = isDeadMode ? "死亡状态下不可用" : "昏厥中无法使用";
  const waitForcedCollapse = isCollapseMode && !isDeadMode;
  const waitDisabled = isDeadMode;
  const waitDisabledAttrs = waitDisabled
    ? ` disabled aria-disabled="true" title="${escapeAttr(disabledReasonText)}" data-gate-reason="critical_disabled"`
    : "";
  const waitActionId = waitForcedCollapse ? "COLLAPSE_TICK_10M" : "sidebar_wait_confirm";
  const waitButtonText = isDeadMode ? "已死亡" : (waitForcedCollapse ? "原地流逝 10 分钟" : "确认");
  const waitPayloadSourceAttr = waitForcedCollapse ? "" : ' data-payload-source="sidebar-wait-minutes"';
  const waitInputValue = 10;
  html += '<div class="sidebar-settlement-wait">';
  html += '<div class="sidebar-settlement-head">';
  html += '<div class="sidebar-settlement-label">消磨时间</div>';
  html += `<div id="sidebar-wait-minutes-label" class="sidebar-range-label sidebar-range-label-inline">${formatMinutes(waitInputValue)}</div>`;
  html += '</div>';
  html += `<input class="sidebar-range${waitForcedCollapse ? " is-collapse-forced" : ""}${waitDisabled ? " is-dead-locked" : ""}" id="sidebar-wait-minutes" type="range" min="0" max="720" step="10" value="${waitInputValue}"${(waitDisabled || waitForcedCollapse) ? " disabled" : ""}>`;
  html += `<button class="sidebar-btn sidebar-btn-primary sidebar-btn-compact${(waitDisabled || waitForcedCollapse) ? " is-disabled-by-gate" : ""}" data-action-id="${waitActionId}"${waitPayloadSourceAttr}${waitDisabledAttrs}${waitForcedCollapse ? ' data-gate-reason="collapse_remap"' : ""}>${waitButtonText}</button>`;
  html += '</div>';
  html += '</div>';
  html += '</div>';

  // ========== 4.2 工具入口收束为低权重网格 ==========
  html += '<div class="sidebar-section sidebar-section-tools sidebar-section-quick">';
  html += '<div class="sidebar-panel-card sidebar-tools-card">';
  const dossierUnlocked = isDossierUnlocked(gameState);
  html += '<div class="sidebar-tools-grid">';
  const invBtnClass = gameState.ui?.inventoryNeedsAttention
    ? 'sidebar-btn sidebar-btn-compact sidebar-btn-inventory-glow'
    : 'sidebar-btn sidebar-btn-compact';
  const invDisabled = isDeadMode || isCollapseMode;
  const invDisabledAttrs = invDisabled
    ? ` disabled aria-disabled="true" title="${escapeAttr(disabledReasonText)}" data-gate-reason="critical_disabled"`
    : "";
  html += renderSidebarToolButton({
    buttonClass: `${invBtnClass}${invDisabled ? " is-disabled-by-gate" : ""}`,
    legacyClass: "sidebar-tool-btn-inventory",
    modifier: "inventory",
    actionId: "ui_open_inventory",
    label: "背包",
    guideTarget: "sidebar-inventory-entry",
    disabledAttrs: invDisabledAttrs
  });
  const recordsBtnClass = gameState.ui?.recordsOpen === true
    ? 'sidebar-btn sidebar-btn-compact sidebar-btn-active'
    : 'sidebar-btn sidebar-btn-compact';
  const recordsDisabled = isDeadMode || isCollapseMode;
  const recordsDisabledAttrs = recordsDisabled
    ? ` disabled aria-disabled="true" title="${escapeAttr(disabledReasonText)}" data-gate-reason="critical_disabled"`
    : "";
  html += renderSidebarToolButton({
    buttonClass: `${recordsBtnClass}${recordsDisabled ? " is-disabled-by-gate" : ""}`,
    legacyClass: "sidebar-tool-btn-record",
    modifier: "record",
    actionId: "ui_records_open",
    label: "记录",
    disabledAttrs: recordsDisabledAttrs
  });
  if (dossierUnlocked) {
    const profileBtnClass = gameState.ui?.profileOpen === true
      ? 'sidebar-btn sidebar-btn-compact sidebar-btn-active'
      : (hasDossierAttention(gameState)
          ? 'sidebar-btn sidebar-btn-compact sidebar-btn-task-glow'
          : 'sidebar-btn sidebar-btn-compact');
    const profileDisabled = isDeadMode || isCollapseMode;
    const profileDisabledAttrs = profileDisabled
      ? ` disabled aria-disabled="true" title="${escapeAttr(disabledReasonText)}" data-gate-reason="critical_disabled"`
      : "";
    html += renderSidebarToolButton({
      buttonClass: `${profileBtnClass}${profileDisabled ? " is-disabled-by-gate" : ""}`,
      legacyClass: "sidebar-tool-btn-dossier",
      modifier: "dossier",
      actionId: "ui_profile_open",
      label: "档案",
      guideTarget: "sidebar-dossier-entry",
      disabledAttrs: profileDisabledAttrs
    });
  }
  const socialBtnClass = gameState.ui?.socialOpen === true
    ? 'sidebar-btn sidebar-btn-compact sidebar-btn-active'
    : 'sidebar-btn sidebar-btn-compact';
  const socialDisabled = isDeadMode || isCollapseMode;
  const socialDisabledAttrs = socialDisabled
    ? ` disabled aria-disabled="true" title="${escapeAttr(disabledReasonText)}" data-gate-reason="critical_disabled"`
    : "";
  html += renderSidebarToolButton({
    buttonClass: `${socialBtnClass}${socialDisabled ? " is-disabled-by-gate" : ""}`,
    legacyClass: "sidebar-tool-btn-social",
    modifier: "social",
    actionId: "ui_social_open",
    label: "人际",
    disabledAttrs: socialDisabledAttrs
  });
  const tasksBtnClass = gameState.ui?.tasksNeedsAttention
    ? 'sidebar-btn sidebar-btn-compact sidebar-btn-task-glow'
    : 'sidebar-btn sidebar-btn-compact';
  const tasksDisabled = isDeadMode || isCollapseMode;
  const tasksDisabledAttrs = tasksDisabled
    ? ` disabled aria-disabled="true" title="${escapeAttr(disabledReasonText)}" data-gate-reason="critical_disabled"`
    : "";
  html += renderSidebarToolButton({
    buttonClass: `${tasksBtnClass}${tasksDisabled ? " is-disabled-by-gate" : ""}`,
    legacyClass: "sidebar-tool-btn-memo",
    modifier: "memo",
    actionId: "ui_tasks_open",
    label: "备忘录",
    disabledAttrs: tasksDisabledAttrs
  });
  html += renderSidebarToolButton({
    buttonClass: 'sidebar-btn sidebar-btn-compact',
    legacyClass: 'sidebar-tool-btn-vault',
    modifier: 'vault',
    actionId: 'ui_open_save_menu',
    label: '存档'
  });
  html += '</div>';
  html += '</div>';
  html += '</div>';

  html += '<div class="sidebar-section sidebar-section-danger">';
  html += '<button class="sidebar-btn sidebar-btn-compact sidebar-btn-danger" data-action-id="menu_exit_main">退出至主菜单</button>';
  html += '</div>';
  html += '</div>';
  
  setSidebarStatusContent(sidebar, html);
  bindSidebarWaitMinutesLabel(sidebar);
  hideAttrTooltip();
  bindSidebarAttrTooltip(sidebar);
  bindThermalCardToggleAnimation(sidebar);
  bindPlayerSidebarLocalActions(sidebar);
  bindSidebarFallbackActionDispatch(sidebar);
}

function ensureClinicMiniMapPanel() {
  let panel = document.getElementById("clinic-minimap-panel");
  if (!panel) {
    panel = document.createElement("aside");
    panel.id = "clinic-minimap-panel";
    panel.className = "minimap-shell minimap-variant-clinic clinic-minimap-panel";
    panel.setAttribute("aria-live", "polite");
    panel.setAttribute("aria-hidden", "true");
    document.body.appendChild(panel);
  }

  panel.classList.add("minimap-shell", "clinic-minimap-panel");

  return panel;
}

function ensureWinddykeMiniMapPanel() {
  let panel = document.getElementById("winddyke-minimap-panel");
  if (!panel) {
    panel = document.createElement("aside");
    panel.id = "winddyke-minimap-panel";
    panel.className = "minimap-shell minimap-variant-winddyke winddyke-minimap-panel";
    panel.setAttribute("aria-live", "polite");
    panel.setAttribute("aria-hidden", "true");
    document.body.appendChild(panel);
  }

  panel.classList.add("minimap-shell", "winddyke-minimap-panel");

  return panel;
}

function ensureTransitMiniMapPanel() {
  let panel = document.getElementById("transit-minimap-panel");
  if (!panel) {
    panel = document.createElement("aside");
    panel.id = "transit-minimap-panel";
    panel.className = "minimap-shell minimap-variant-transit transit-minimap-panel";
    panel.setAttribute("aria-live", "polite");
    panel.setAttribute("aria-hidden", "true");
    document.body.appendChild(panel);
  }

  panel.classList.add("minimap-shell", "transit-minimap-panel");

  return panel;
}

function ensureIndustrialMiniMapPanel() {
  let panel = document.getElementById("industrial-minimap-panel");
  if (!panel) {
    panel = document.createElement("aside");
    panel.id = "industrial-minimap-panel";
    panel.className = "minimap-shell minimap-variant-industrial industrial-minimap-panel";
    panel.setAttribute("aria-live", "polite");
    panel.setAttribute("aria-hidden", "true");
    document.body.appendChild(panel);
  }

  panel.classList.add("minimap-shell", "industrial-minimap-panel");

  return panel;
}

function ensureGovHallMiniMapPanel() {
  let panel = document.getElementById("gov-hall-minimap-panel");
  if (!panel) {
    panel = document.createElement("aside");
    panel.id = "gov-hall-minimap-panel";
    panel.className = "minimap-shell minimap-variant-gov gov-hall-minimap-panel";
    panel.setAttribute("aria-live", "polite");
    panel.setAttribute("aria-hidden", "true");
    document.body.appendChild(panel);
  }

  panel.classList.add("minimap-shell", "gov-hall-minimap-panel");

  return panel;
}

function ensureSteelcrossMiniMapPanel() {
  let panel = document.getElementById("steelcross-minimap-panel");
  if (!panel) {
    panel = document.createElement("aside");
    panel.id = "steelcross-minimap-panel";
    panel.className = "minimap-shell minimap-variant-steelcross steelcross-minimap-panel";
    panel.setAttribute("aria-live", "polite");
    panel.setAttribute("aria-hidden", "true");
    document.body.appendChild(panel);
  }

  panel.classList.add("minimap-shell", "steelcross-minimap-panel");

  return panel;
}

function renderClinicMiniMapPanel(map) {
  const panel = ensureClinicMiniMapPanel();
  setMiniMapPanelVariant(panel, "minimap-variant-clinic");
  const mapId = String(map?.id || "");
  const clinicSpec = MINIMAP_SPECS.clinic;
  const currentNodeId = clinicSpec.mapIdToNodeId.get(mapId);
  const panelMeta = clinicSpec.panel || {};
  const positions = clinicSpec.positions || new Map();
  const worldTimeContext = getWorldTimeContext();

  if (!currentNodeId) {
    panel.innerHTML = [
      buildMiniMapHeadRowMarkup(panelMeta.title || "诊所地图", panelMeta.badge || "✚"),
      buildMiniMapShellBodyOpenMarkup(),
      buildMiniMapShellBodyCloseMarkup()
    ].join("");
    finalizeMiniMapPanel(panel, worldTimeContext, clinicSpec);
    return;
  }

  const distances = computeGraphDistanceMap(clinicSpec.edges, currentNodeId);
  const mainPathEdgeSet = buildMiniMapMainPathEdgeSet(clinicSpec);
  const activeEdgeKey = resolveMiniMapActiveEdgeKey(clinicSpec, currentNodeId);
  const viewportSnapshot = readMiniMapViewportSnapshot({
    spec: clinicSpec,
    activeNodeId: currentNodeId,
    positions,
  });
  const stairConnectorKeys = new Set(
    Array.isArray(panelMeta.connectors)
      ? panelMeta.connectors.map((connector) => getMiniMapEdgeKey(connector?.from, connector?.to))
      : []
  );

  let html = buildMiniMapHeadRowMarkup(panelMeta.title || "诊所地图", panelMeta.badge || "✚");
  html += buildMiniMapShellBodyOpenMarkup();
  html += `<svg class="clinic-minimap" data-minimap-spec="${escapeAttr(clinicSpec.specId)}" viewBox="${escapeAttr(panelMeta.viewBox || "0 0 320 172")}" aria-label="${escapeHtml(panelMeta.ariaLabel || "诊所双楼层示意图")}">`;
  html += buildMiniMapViewportOpenTag(viewportSnapshot);

  for (const floor of Array.isArray(panelMeta.floors) ? panelMeta.floors : []) {
    html += `<rect class="clinic-floor-band ${escapeAttr(floor.id || "")}" x="${floor.x}" y="${floor.y}" width="${floor.width}" height="${floor.height}" rx="${floor.rx}"></rect>`;
    html += `<line class="clinic-floor-rule ${escapeAttr(floor.id || "")}" x1="${floor.ruleX1}" y1="${floor.ruleY}" x2="${floor.ruleX2}" y2="${floor.ruleY}"></line>`;
    html += `<text class="clinic-floor-label" x="${floor.labelX}" y="${floor.labelY}">${escapeHtml(floor.label || "")}</text>`;
  }

  for (const edge of clinicSpec.edges) {
    const edgeKey = getMiniMapEdgeKey(edge.from, edge.to);
    if (stairConnectorKeys.has(edgeKey)) continue;
    const a = positions.get(edge.from);
    const b = positions.get(edge.to);
    if (!a || !b) continue;
    const edgeDistance = Math.min(
      distances.get(edge.from) ?? Number.POSITIVE_INFINITY,
      distances.get(edge.to) ?? Number.POSITIVE_INFINITY
    );
    const semanticClass = getMiniMapEdgeSemanticClass(mainPathEdgeSet, edge, activeEdgeKey);
    html += `<line class="clinic-mini-edge ${semanticClass} ${getMiniMapNodeTone(edgeDistance)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
  }

  for (const connector of Array.isArray(panelMeta.connectors) ? panelMeta.connectors : []) {
    const from = positions.get(connector.from);
    const to = positions.get(connector.to);
    if (!from || !to) continue;
    const edgeDistance = Math.min(
      distances.get(connector.from) ?? Number.POSITIVE_INFINITY,
      distances.get(connector.to) ?? Number.POSITIVE_INFINITY
    );
    const toneClass = getMiniMapNodeTone(edgeDistance);
    const semanticClass = getMiniMapEdgeSemanticClass(mainPathEdgeSet, connector, activeEdgeKey);
    const shaftWidth = Number(connector.shaftWidth) || 16;
    const capWidth = Number(connector.capWidth) || 10;
    const x = Math.round((from.x + to.x) / 2);
    const y1 = Math.min(from.y, to.y);
    const y2 = Math.max(from.y, to.y);
    html += `<g class="clinic-stair-link ${semanticClass} ${toneClass}">`;
    html += `<rect class="clinic-stair-shaft" x="${x - shaftWidth / 2}" y="${y1 + 6}" width="${shaftWidth}" height="${Math.max(8, y2 - y1 - 12)}" rx="${Math.min(shaftWidth / 2, 6)}"></rect>`;
    html += `<line class="clinic-stair-cap top" x1="${x - capWidth / 2}" y1="${y1 + 4}" x2="${x + capWidth / 2}" y2="${y1 + 4}"></line>`;
    html += `<line class="clinic-stair-cap bottom" x1="${x - capWidth / 2}" y1="${y2 - 4}" x2="${x + capWidth / 2}" y2="${y2 - 4}"></line>`;
    html += `</g>`;
  }

  for (const node of clinicSpec.nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const toneClass = getMiniMapNodeTone(distances.get(node.id));
    const semanticClass = getMiniMapNodeSemanticClass(clinicSpec, node.id);
    const roleClass = node.role === "stair_anchor" ? " is-stair-anchor-node" : "";
    const nodeCls = `clinic-mini-node ${semanticClass} ${toneClass}${roleClass}`;
    const textCls = `clinic-mini-label ${semanticClass} ${toneClass}${roleClass}`;
    const labelX = Math.round(pos.x + Number(node.labelDx || 0));
    const labelY = Math.round(pos.y + Number(node.labelDy || 0));
    const labelAnchor = String(node.labelAnchor || "middle");
    const nodeRadius = Number(panelMeta.nodeRadius) || 4.6;

    if (toneClass === "is-active") {
      html += `<circle class="clinic-mini-node-halo" cx="${pos.x}" cy="${pos.y}" r="${(nodeRadius + 4.2).toFixed(1)}"></circle>`;
    }
    html += `<circle class="${nodeCls}" cx="${pos.x}" cy="${pos.y}" r="${nodeRadius}"></circle>`;
    html += `<text class="${textCls}" x="${labelX}" y="${labelY}" text-anchor="${escapeAttr(labelAnchor)}">${escapeHtml(node.label)}</text>`;
  }

  html += '</g>';
  html += '</svg>';
  html += buildMiniMapShellBodyCloseMarkup();

  panel.innerHTML = html;
  finalizeMiniMapPanel(panel, worldTimeContext, clinicSpec);
}

function renderWinddykeMiniMapPanel(map) {
  const panel = ensureWinddykeMiniMapPanel();
  setMiniMapPanelVariant(panel, "minimap-variant-winddyke");
  const mapId = String(map?.id || "");
  const miniMapResolution = resolveWinddykeMiniMapSpec(mapId);
  const miniMapSpec = miniMapResolution.spec;
  const currentNodeId = miniMapResolution.currentNodeId;
  const worldTimeContext = getWorldTimeContext();

  if (!currentNodeId) {
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = "";
    return;
  }

  const distances = computeGraphDistanceMap(miniMapSpec.edges, currentNodeId);
  const mainPathEdgeSet = buildMiniMapMainPathEdgeSet(miniMapSpec);
  const activeEdgeKey = resolveMiniMapActiveEdgeKey(miniMapSpec, currentNodeId);
  const viewportSnapshot = readMiniMapViewportSnapshot({
    spec: miniMapSpec,
    activeNodeId: currentNodeId,
    positions: miniMapSpec.positions,
  });

  let html = buildMiniMapHeadRowMarkup(miniMapSpec.panel.title, miniMapSpec.panel.badge);
  html += buildMiniMapShellBodyOpenMarkup();
  html += `<svg class="clinic-minimap" data-minimap-spec="${escapeAttr(miniMapSpec.specId)}" viewBox="${miniMapSpec.panel.viewBox}" aria-label="${escapeHtml(miniMapSpec.panel.ariaLabel)}">`;
  html += buildMiniMapViewportOpenTag(viewportSnapshot);

  html += `<rect class="clinic-floor-band floor-1f" x="${miniMapSpec.panel.band.x}" y="${miniMapSpec.panel.band.y}" width="${miniMapSpec.panel.band.width}" height="${miniMapSpec.panel.band.height}" rx="${miniMapSpec.panel.band.rx}"></rect>`;
  html += `<text class="clinic-floor-label" x="20" y="38">${escapeHtml(miniMapSpec.panel.panelLabel)}</text>`;

  for (const edge of miniMapSpec.edges) {
    const a = miniMapSpec.positions.get(edge.from);
    const b = miniMapSpec.positions.get(edge.to);
    if (!a || !b) continue;
    const edgeDistance = Math.min(
      distances.get(edge.from) ?? Number.POSITIVE_INFINITY,
      distances.get(edge.to) ?? Number.POSITIVE_INFINITY
    );
    const semanticClass = getMiniMapEdgeSemanticClass(mainPathEdgeSet, edge, activeEdgeKey);
    html += `<line class="clinic-mini-edge ${semanticClass} ${getMiniMapNodeTone(edgeDistance)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
  }

  for (const node of miniMapSpec.nodes) {
    const pos = miniMapSpec.positions.get(node.id);
    if (!pos) continue;
    const toneClass = getMiniMapNodeTone(distances.get(node.id));
    const semanticClass = getMiniMapNodeSemanticClass(miniMapSpec, node.id);
    const nodeCls = `clinic-mini-node ${semanticClass} ${toneClass}`;
    const textCls = `clinic-mini-label ${semanticClass} ${toneClass}`;
    const labelX = Math.round(pos.x + Number(pos.labelDx || 0));
    const labelY = Math.round(pos.y + Number(pos.labelDy ?? 16));
    const labelAnchor = pos.labelAnchor === "start" ? "start" : "middle";
    const labelW = Math.max(18, Math.round(String(node.label).length * 8));
    const labelH = 12;
    const labelBgX = labelAnchor === "start"
      ? labelX - 2
      : labelX - Math.round(labelW / 2) - 2;
    const labelBgY = labelY - Math.round(labelH / 2) - 1;

    html += `<circle class="${nodeCls}" cx="${pos.x}" cy="${pos.y}" r="5.4"></circle>`;
    html += `<rect class="clinic-mini-label-bg ${semanticClass}" x="${labelBgX}" y="${labelBgY}" width="${labelW + 4}" height="${labelH}" rx="3"></rect>`;
    html += `<text class="${textCls}" x="${labelX}" y="${labelY}" text-anchor="${labelAnchor}">${escapeHtml(node.label)}</text>`;
  }

  html += '</g>';
  html += '</svg>';
  html += buildMiniMapShellBodyCloseMarkup();

  panel.innerHTML = html;
  finalizeMiniMapPanel(panel, worldTimeContext, miniMapSpec);
}

function renderTransitLineMiniMapPanel() {
  const panel = ensureTransitMiniMapPanel();
  setMiniMapPanelVariant(panel, "minimap-variant-transit");
  const transitState = readTransitOnboardMiniMapState(gameState);
  const lineId = String(transitState?.lineId || "").trim();
  const transitSpec = resolveTransitOnboardMiniMapSpec(lineId);
  const currentNodeId = String(transitState?.currentStopId || "").trim();
  const nextNodeId = String(transitState?.nextStopId || "").trim() || null;
  const worldTimeContext = getWorldTimeContext();

  if (!transitState || !transitSpec || !currentNodeId) {
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = "";
    return;
  }

  const distances = computeGraphDistanceMap(transitSpec.edges, currentNodeId);
  const mainPathEdgeSet = buildMiniMapMainPathEdgeSet(transitSpec);
  const activeEdgeKey = nextNodeId ? getMiniMapEdgeKey(currentNodeId, nextNodeId) : resolveMiniMapActiveEdgeKey(transitSpec, currentNodeId);
  const viewportSnapshot = readMiniMapViewportSnapshot({
    spec: transitSpec,
    activeNodeId: currentNodeId,
    positions: transitSpec.positions,
  });

  let html = buildMiniMapHeadRowMarkup(transitSpec.panel.title, transitSpec.panel.badge, { showToggle: false });
  html += buildMiniMapShellBodyOpenMarkup({ collapsible: false, canvas: true });
  html += `<svg class="clinic-minimap" data-minimap-spec="${escapeAttr(transitSpec.specId)}" viewBox="${transitSpec.panel.viewBox}" aria-label="${escapeHtml(transitSpec.panel.ariaLabel)}">`;
  html += buildMiniMapViewportOpenTag(viewportSnapshot);
  html += `<rect class="clinic-floor-band floor-1f" x="${transitSpec.panel.band.x}" y="${transitSpec.panel.band.y}" width="${transitSpec.panel.band.width}" height="${transitSpec.panel.band.height}" rx="${transitSpec.panel.band.rx}"></rect>`;
  html += `<text class="clinic-floor-label" x="20" y="38">${escapeHtml(transitSpec.panel.panelLabel)}</text>`;

  for (const edge of transitSpec.edges) {
    const a = transitSpec.positions.get(edge.from);
    const b = transitSpec.positions.get(edge.to);
    if (!a || !b) continue;
    const edgeDistance = Math.min(
      distances.get(edge.from) ?? Number.POSITIVE_INFINITY,
      distances.get(edge.to) ?? Number.POSITIVE_INFINITY
    );
    const semanticClass = getMiniMapEdgeSemanticClass(mainPathEdgeSet, edge, activeEdgeKey);
    html += `<line class="clinic-mini-edge ${semanticClass} ${getMiniMapNodeTone(edgeDistance)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
  }

  for (const node of transitSpec.nodes) {
    const pos = transitSpec.positions.get(node.id);
    if (!pos) continue;
    const toneClass = getMiniMapNodeTone(distances.get(node.id));
    const semanticClass = getMiniMapNodeSemanticClass(transitSpec, node.id);
    const nodeCls = `clinic-mini-node ${semanticClass} ${toneClass}`;
    const textCls = `clinic-mini-label ${semanticClass} ${toneClass}`;
    const labelX = Math.round(pos.x);
    const labelY = Math.round(pos.y + 16);
    const labelW = Math.max(18, Math.round(String(node.label).length * 8));
    const labelH = 12;
    const labelBgX = labelX - Math.round(labelW / 2) - 2;
    const labelBgY = labelY - Math.round(labelH / 2) - 1;

    html += `<circle class="${nodeCls}" cx="${pos.x}" cy="${pos.y}" r="5.4"></circle>`;
    html += `<rect class="clinic-mini-label-bg ${semanticClass}" x="${labelBgX}" y="${labelBgY}" width="${labelW + 4}" height="${labelH}" rx="3"></rect>`;
    html += `<text class="${textCls}" x="${labelX}" y="${labelY}" text-anchor="middle">${escapeHtml(node.label)}</text>`;
  }

  html += '</g>';
  html += '</svg>';
  html += buildMiniMapShellBodyCloseMarkup({ collapsible: false, canvas: true });

  panel.innerHTML = html;
  finalizeMiniMapPanel(panel, worldTimeContext, transitSpec);
}

function renderIndustrialMiniMapPanel(map) {
  const panel = ensureIndustrialMiniMapPanel();
  setMiniMapPanelVariant(panel, "minimap-variant-industrial");
  const mapId = String(map?.id || "");
  const industrialSpec = MINIMAP_SPECS.industrial;
  const currentNodeId = industrialSpec.mapIdToNodeId.get(mapId);
  const worldTimeContext = getWorldTimeContext();

  if (!currentNodeId) {
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = "";
    return;
  }

  const distances = computeGraphDistanceMap(industrialSpec.edges, currentNodeId);
  const mainPathEdgeSet = buildMiniMapMainPathEdgeSet(industrialSpec);
  const activeEdgeKey = resolveMiniMapActiveEdgeKey(industrialSpec, currentNodeId);
  const viewportSnapshot = readMiniMapViewportSnapshot({
    spec: industrialSpec,
    activeNodeId: currentNodeId,
    positions: industrialSpec.positions,
  });

  let html = buildMiniMapHeadRowMarkup("工业区分流图", "工");
  html += buildMiniMapShellBodyOpenMarkup();
  html += `<svg class="clinic-minimap" data-minimap-spec="${escapeAttr(industrialSpec.specId)}" viewBox="0 0 300 156" aria-label="工业区地图">`;
  html += buildMiniMapViewportOpenTag(viewportSnapshot);

  html += '<rect class="clinic-floor-band floor-1f" x="10" y="24" width="280" height="116" rx="8"></rect>';
  html += '<text class="clinic-floor-label" x="20" y="38">工业区主线</text>';

  for (const edge of industrialSpec.edges) {
    const a = industrialSpec.positions.get(edge.from);
    const b = industrialSpec.positions.get(edge.to);
    if (!a || !b) continue;
    const edgeDistance = Math.min(
      distances.get(edge.from) ?? Number.POSITIVE_INFINITY,
      distances.get(edge.to) ?? Number.POSITIVE_INFINITY
    );
    const semanticClass = getMiniMapEdgeSemanticClass(mainPathEdgeSet, edge, activeEdgeKey);
    html += `<line class="clinic-mini-edge ${semanticClass} ${getMiniMapNodeTone(edgeDistance)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
  }

  for (const node of industrialSpec.nodes) {
    const pos = industrialSpec.positions.get(node.id);
    if (!pos) continue;
    const toneClass = getMiniMapNodeTone(distances.get(node.id));
    const semanticClass = getMiniMapNodeSemanticClass(industrialSpec, node.id);
    const nodeCls = `clinic-mini-node ${semanticClass} ${toneClass}`;
    const textCls = `clinic-mini-label ${semanticClass} ${toneClass}`;
    const labelX = Math.round(pos.x);
    const labelY = Math.round(pos.y + 16);
    const labelW = Math.max(18, Math.round(String(node.label).length * 8));
    const labelH = 12;
    const labelBgX = labelX - Math.round(labelW / 2) - 2;
    const labelBgY = labelY - Math.round(labelH / 2) - 1;

    html += `<circle class="${nodeCls}" cx="${pos.x}" cy="${pos.y}" r="5.4"></circle>`;
    html += `<rect class="clinic-mini-label-bg ${semanticClass}" x="${labelBgX}" y="${labelBgY}" width="${labelW + 4}" height="${labelH}" rx="3"></rect>`;
    html += `<text class="${textCls}" x="${labelX}" y="${labelY}" text-anchor="middle">${escapeHtml(node.label)}</text>`;
  }

  html += '</g>';
  html += "</svg>";
  html += buildMiniMapShellBodyCloseMarkup();

  panel.innerHTML = html;
  finalizeMiniMapPanel(panel, worldTimeContext, industrialSpec);
}

function renderGovHallMiniMapPanel(map) {
  const panel = ensureGovHallMiniMapPanel();
  setMiniMapPanelVariant(panel, "minimap-variant-gov");
  const mapId = String(map?.id || "");
  const govSpec = MINIMAP_SPECS.gov;
  const currentNodeId = govSpec.mapIdToNodeId.get(mapId);
  const worldTimeContext = getWorldTimeContext();

  if (!currentNodeId) {
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = "";
    return;
  }

  const distances = computeGraphDistanceMap(govSpec.edges, currentNodeId);
  const mainPathEdgeSet = buildMiniMapMainPathEdgeSet(govSpec);
  const activeEdgeKey = resolveMiniMapActiveEdgeKey(govSpec, currentNodeId);
  const viewportSnapshot = readMiniMapViewportSnapshot({
    spec: govSpec,
    activeNodeId: currentNodeId,
    positions: govSpec.positions,
  });

  let html = buildMiniMapHeadRowMarkup("政务大厅布局", "政");
  html += buildMiniMapShellBodyOpenMarkup();
  html += `<svg class="clinic-minimap" data-minimap-spec="${escapeAttr(govSpec.specId)}" viewBox="0 0 300 156" aria-label="政务大厅地图">`;
  html += buildMiniMapViewportOpenTag(viewportSnapshot);

  html += '<rect class="clinic-floor-band floor-1f" x="10" y="24" width="280" height="116" rx="8"></rect>';
  html += '<text class="clinic-floor-label" x="20" y="38">政务大厅</text>';

  for (const edge of govSpec.edges) {
    const a = govSpec.positions.get(edge.from);
    const b = govSpec.positions.get(edge.to);
    if (!a || !b) continue;
    const edgeDistance = Math.min(
      distances.get(edge.from) ?? Number.POSITIVE_INFINITY,
      distances.get(edge.to) ?? Number.POSITIVE_INFINITY
    );
    const semanticClass = getMiniMapEdgeSemanticClass(mainPathEdgeSet, edge, activeEdgeKey);
    html += `<line class="clinic-mini-edge ${semanticClass} ${getMiniMapNodeTone(edgeDistance)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
  }

  for (const node of govSpec.nodes) {
    const pos = govSpec.positions.get(node.id);
    if (!pos) continue;
    const toneClass = getMiniMapNodeTone(distances.get(node.id));
    const semanticClass = getMiniMapNodeSemanticClass(govSpec, node.id);
    const nodeCls = `clinic-mini-node ${semanticClass} ${toneClass}`;
    const textCls = `clinic-mini-label ${semanticClass} ${toneClass}`;
    const labelX = Math.round(pos.x);
    const labelY = Math.round(pos.y + 16);
    const labelW = Math.max(18, Math.round(String(node.label).length * 8));
    const labelH = 12;
    const labelBgX = labelX - Math.round(labelW / 2) - 2;
    const labelBgY = labelY - Math.round(labelH / 2) - 1;

    html += `<circle class="${nodeCls}" cx="${pos.x}" cy="${pos.y}" r="5.4"></circle>`;
    html += `<rect class="clinic-mini-label-bg ${semanticClass}" x="${labelBgX}" y="${labelBgY}" width="${labelW + 4}" height="${labelH}" rx="3"></rect>`;
    html += `<text class="${textCls}" x="${labelX}" y="${labelY}" text-anchor="middle">${escapeHtml(node.label)}</text>`;
  }

  html += '</g>';
  html += "</svg>";
  html += buildMiniMapShellBodyCloseMarkup();

  panel.innerHTML = html;
  finalizeMiniMapPanel(panel, worldTimeContext, govSpec);
}

function renderSteelcrossMiniMapPanel(map) {
  const panel = ensureSteelcrossMiniMapPanel();
  setMiniMapPanelVariant(panel, "minimap-variant-steelcross");
  const mapId = String(map?.id || "");
  const miniMapResolution = resolveSteelcrossMiniMapSpec(mapId);
  const steelcrossSpec = miniMapResolution.spec;
  const currentNodeId = miniMapResolution.currentNodeId;
  const worldTimeContext = getWorldTimeContext();

  if (!steelcrossSpec) {
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = "";
    return;
  }

  const distances = computeGraphDistanceMap(steelcrossSpec.edges, currentNodeId);
  const mainPathEdgeSet = buildMiniMapMainPathEdgeSet(steelcrossSpec);
  const activeEdgeKey = resolveMiniMapActiveEdgeKey(steelcrossSpec, currentNodeId);
  const viewportSnapshot = readMiniMapViewportSnapshot({
    spec: steelcrossSpec,
    activeNodeId: currentNodeId,
    positions: steelcrossSpec.positions,
  });
  const panelMeta = steelcrossSpec.panel || {};

  let html = buildMiniMapHeadRowMarkup(panelMeta.title || "钢十字地图", panelMeta.badge || "港");
  html += buildMiniMapShellBodyOpenMarkup();
  html += `<svg class="clinic-minimap" data-minimap-spec="${escapeAttr(steelcrossSpec.specId)}" viewBox="${escapeAttr(panelMeta.viewBox || "0 0 300 156")}" aria-label="${escapeHtml(panelMeta.ariaLabel || "钢十字地图")}">`;
  html += buildMiniMapViewportOpenTag(viewportSnapshot);

  if (panelMeta.band) {
    html += `<rect class="clinic-floor-band floor-1f" x="${panelMeta.band.x}" y="${panelMeta.band.y}" width="${panelMeta.band.width}" height="${panelMeta.band.height}" rx="${panelMeta.band.rx}"></rect>`;
  }
  html += `<text class="clinic-floor-label" x="20" y="38">${escapeHtml(panelMeta.panelLabel || panelMeta.title || "钢十字")}</text>`;

  for (const edge of steelcrossSpec.edges) {
    const a = steelcrossSpec.positions.get(edge.from);
    const b = steelcrossSpec.positions.get(edge.to);
    if (!a || !b) continue;
    const edgeDistance = Math.min(
      distances.get(edge.from) ?? Number.POSITIVE_INFINITY,
      distances.get(edge.to) ?? Number.POSITIVE_INFINITY
    );
    const semanticClass = getMiniMapEdgeSemanticClass(mainPathEdgeSet, edge, activeEdgeKey);
    html += `<line class="clinic-mini-edge ${semanticClass} ${getMiniMapNodeTone(edgeDistance)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
  }

  for (const node of steelcrossSpec.nodes) {
    const pos = steelcrossSpec.positions.get(node.id);
    if (!pos) continue;
    const toneClass = getMiniMapNodeTone(distances.get(node.id));
    const semanticClass = getMiniMapNodeSemanticClass(steelcrossSpec, node.id);
    const nodeCls = `clinic-mini-node ${semanticClass} ${toneClass}`;
    const textCls = `clinic-mini-label ${semanticClass} ${toneClass}`;
    const labelX = Math.round(pos.x + Number(node.labelDx || 0));
    const labelY = Math.round(pos.y + Number(node.labelDy ?? 16));
    const labelAnchor = String(node.labelAnchor || "middle");
    const labelW = Math.max(16, Math.round(String(node.label).length * 8));
    const labelH = 12;
    const labelBgX = labelAnchor === "start"
      ? labelX - 2
      : labelAnchor === "end"
      ? labelX - labelW - 2
      : labelX - Math.round(labelW / 2) - 2;
    const labelBgY = labelY - Math.round(labelH / 2) - 1;

    html += `<circle class="${nodeCls}" cx="${pos.x}" cy="${pos.y}" r="5.4"></circle>`;
    html += `<rect class="clinic-mini-label-bg ${semanticClass}" x="${labelBgX}" y="${labelBgY}" width="${labelW + 4}" height="${labelH}" rx="3"></rect>`;
    html += `<text class="${textCls}" x="${labelX}" y="${labelY}" text-anchor="${escapeAttr(labelAnchor)}">${escapeHtml(node.label)}</text>`;
  }

  html += "</g>";
  html += "</svg>";
  html += buildMiniMapShellBodyCloseMarkup();

  panel.innerHTML = html;
  finalizeMiniMapPanel(panel, worldTimeContext, steelcrossSpec);
}

function hideMiniMapPanel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.setAttribute("aria-hidden", "true");
  delete panel.dataset.minimapMode;
  delete panel.dataset.minimapDensity;
  delete panel.dataset.minimapLabelMode;
  panel.classList.remove("is-empty");
  panel.innerHTML = "";
}

function renderContextMiniMap(map, activeOverlay) {
  if (String(activeOverlay || "") !== UI_OVERLAY_TYPES.MAP_MINIMAP) {
    hideMiniMapPanel("clinic-minimap-panel");
    hideMiniMapPanel("industrial-minimap-panel");
    hideMiniMapPanel("winddyke-minimap-panel");
    hideMiniMapPanel("gov-hall-minimap-panel");
    hideMiniMapPanel("steelcross-minimap-panel");
    hideMiniMapPanel("transit-minimap-panel");
    return;
  }

  hideMiniMapPanel("clinic-minimap-panel");
  hideMiniMapPanel("industrial-minimap-panel");
  hideMiniMapPanel("winddyke-minimap-panel");
  hideMiniMapPanel("gov-hall-minimap-panel");
  hideMiniMapPanel("steelcross-minimap-panel");
  hideMiniMapPanel("transit-minimap-panel");

  const mapId = String(map?.id || "");

  if (mapId === BUS_ONBOARD_MAP_ID) {
    renderTransitLineMiniMapPanel();
    return;
  }

  const branch = resolveMapMiniMapBranch(mapId);

  if (branch === "industrial") {
    renderIndustrialMiniMapPanel(map);
    return;
  }
  if (branch === "winddyke") {
    renderWinddykeMiniMapPanel(map);
    return;
  }
  if (branch === "gov") {
    renderGovHallMiniMapPanel(map);
    return;
  }
  if (branch === "steelcross") {
    renderSteelcrossMiniMapPanel(map);
    return;
  }
  if (branch === "clinic") {
    renderClinicMiniMapPanel(map);
  }
}

/**
 * 渲染单个属性条
 * @param {object} attr - 属性数据
 * @param {string} attrId - 属性ID
 * @returns {string} HTML 字符串
 */
function renderAttributeBar(attr, attrId, trend = "none", options = {}) {
  const metaMap = {
    hp: { label: "健康", icon: "❤" },
    satiety: { label: "饱腹", icon: "◉" },
    stamina: { label: "体能", icon: "▲" },
    fatigue: { label: "睡眠", icon: "☾" }
  };
  const meta = metaMap[attrId] || { label: attrId, icon: "•" };

  // 根据属性类型选择颜色
  const colorMap = {
    hp: "#e74c3c",       // 红色
    satiety: "#f39c12",  // 橙色
    stamina: "#3498db",  // 蓝色
    fatigue: "#9b59b6"   // 紫色
  };
  const color = colorMap[attrId] || "#95a5a6";

  const current = Number(attr?.cur ?? 0);
  const baseMaxRaw = Number(attr?.baseMax ?? 100);
  const effectiveMaxRaw = Number(attr?.effectiveMax ?? baseMaxRaw);
  const baseMax = Number.isFinite(baseMaxRaw) && baseMaxRaw > 0 ? baseMaxRaw : 100;
  const effectiveMax = Number.isFinite(effectiveMaxRaw) && effectiveMaxRaw > 0
    ? Math.min(effectiveMaxRaw, baseMax)
    : baseMax;
  const clampedCurrent = Math.max(0, Math.min(baseMax, Number.isFinite(current) ? current : 0));

  // lockedRatio is a renderer-side display export, derived from formal current/effective/base values.
  const isStamina = attrId === "stamina";
  const lockedRatio = isStamina
    ? Math.max(0, Math.min(1, (baseMax - effectiveMax) / baseMax))
    : 0;
  const hasLockedZone = isStamina && lockedRatio > 0;
  const maxValueOverrideRaw = Number(options?.maxValueOverride);
  const valueMax = Number.isFinite(maxValueOverrideRaw) && maxValueOverrideRaw > 0
    ? maxValueOverrideRaw
    : (hasLockedZone ? effectiveMax : baseMax);
  
  // 计算百分比
  const pct = ((clampedCurrent / baseMax) * 100).toFixed(1);
  const thresholdRatio = isStamina ? Math.max(0, Math.min(1, 20 / Math.max(1, baseMax))) : 0;

  const trendClass = trend === "up" ? "is-up" : (trend === "down" ? "is-down" : "");
  const stageDesc = String(attr.stageDesc || "");
  const stageDescAttr = escapeAttr(stageDesc);
  const hasStageNameOverride = Object.prototype.hasOwnProperty.call(options || {}, "stageNameOverride");
  const stageNameText = hasStageNameOverride
    ? String(options?.stageNameOverride || "").trim()
    : String(attr?.stageName || "").trim();
  const statusTag = String(options?.statusTag || "").trim();
  const extraClass = String(options?.cardClass || "").trim();
  const iconTooltipHtml = String(options?.iconTooltipHtml || "").trim();
  const hasLocalIconTooltip = iconTooltipHtml.length > 0;
  const iconTooltipAriaLabel = escapeAttr(String(options?.iconTooltipAriaLabel || `${meta.label}说明`).trim() || `${meta.label}说明`);
  const cardClass = ["attr-card", attrId === "hp" ? "attr-card-hp" : "", trendClass, extraClass]
    .filter(Boolean)
    .join(" ");
  const cardAttrs = !hasLocalIconTooltip && stageDesc
    ? ` data-hover-desc="${stageDescAttr}" tabindex="0"`
    : "";
  const iconHtml = hasLocalIconTooltip
    ? `<span class="attr-icon-anchor-wrap"><button type="button" class="attr-icon-anchor" aria-label="${iconTooltipAriaLabel}"><span class="attr-icon">${meta.icon}</span></button>${iconTooltipHtml}</span>`
    : `<span class="attr-icon">${meta.icon}</span>`;
  
  // 构建HTML
  let html = `<div class="${cardClass}"${cardAttrs}>`;
  
  // 属性名称和数值
  html += `<div class="attr-header">`;
  html += `<span class="attr-label">${iconHtml}${meta.label}</span>`;
  if (statusTag) {
    html += `<span class="attr-status-tag">${escapeHtml(statusTag)}</span>`;
  }
  html += `<span class="attr-value">${clampedCurrent.toFixed(0)} / ${valueMax.toFixed(0)}</span>`;
  html += `</div>`;

  if (hasLockedZone) {
    html += `<div class="attr-base-note">基础 ${baseMax.toFixed(0)}</div>`;
  }

  if (stageNameText) {
    html += `<div class="attr-stage-row">`;
    html += `<span class="attr-stage-chip">${escapeHtml(stageNameText)}</span>`;
    html += `</div>`;
  }
  
  // 进度条
  html += `<div class="attr-bar-bg">`;
  html += `<div class="attr-bar-fill" style="width: ${pct}%; --bar-color: ${color};"></div>`;
  if (isStamina) {
    html += `<div class="attr-bar-threshold" style="left: ${(thresholdRatio * 100).toFixed(1)}%;" aria-hidden="true"></div>`;
  }
  if (hasLockedZone) {
    html += `<div class="attr-bar-lock" style="width: ${(lockedRatio * 100).toFixed(1)}%;">`;
    html += `<div class="attr-bar-lock-mask"></div>`;
    html += `<div class="attr-bar-lock-hatch"></div>`;
    html += `<div class="attr-bar-lock-divider"></div>`;
    html += `</div>`;
  }
  html += `</div>`;

  if (options?.secondaryBarHtml) {
    html += String(options.secondaryBarHtml);
  }
  
  // 阶段描述（原文）
  // 压缩布局：描述改为 tooltip，不占垂直空间
  html += `<div class="attr-tip"></div>`;
  
  html += '</div>';
  
  return html;
}

function renderStatusEffectTooltip(tooltipVm) {
  const title = String(tooltipVm?.title || "状态效果").trim() || "状态效果";
  const groups = Array.isArray(tooltipVm?.groups) ? tooltipVm.groups : [];
  const emptyText = String(tooltipVm?.emptyText || "当前没有生效中的状态效果").trim() || "当前没有生效中的状态效果";
  if (groups.length === 0) {
    return `
      <span class="attr-local-tooltip attr-local-tooltip-status-effect" role="tooltip">
        <span class="attr-local-tooltip-kicker">${escapeHtml(title)}</span>
        <span class="attr-local-tooltip-empty">${escapeHtml(emptyText)}</span>
      </span>
    `;
  }

  return `
    <span class="attr-local-tooltip attr-local-tooltip-status-effect" role="tooltip">
      <span class="attr-local-tooltip-kicker">${escapeHtml(title)}</span>
      ${groups.map((group) => `
        <span class="attr-local-tooltip-group">
          <span class="attr-local-tooltip-title">${escapeHtml(String(group?.name || "未知效果来源"))}：</span>
          ${Array.isArray(group?.lines)
            ? group.lines.map((line) => `<span class="attr-local-tooltip-line">${escapeHtml(String(line || ""))}</span>`).join("")
            : ""}
        </span>
      `).join("")}
    </span>
  `;
}

function mixRgbHexColor(fromHex, toHex, t) {
  const ratio = clamp01(t);
  const from = String(fromHex || "").replace("#", "");
  const to = String(toHex || "").replace("#", "");
  const channels = [0, 2, 4].map((offset) => {
    const start = parseInt(from.slice(offset, offset + 2), 16);
    const end = parseInt(to.slice(offset, offset + 2), 16);
    const mixed = Math.round(start + (end - start) * ratio);
    return mixed.toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function getIntakeLoadBarColor(ratio) {
  const safeRatio = clamp01(ratio);
  if (safeRatio <= 0.5) {
    return mixRgbHexColor("#2f5240", "#8b7a3b", safeRatio / 0.5);
  }
  return mixRgbHexColor("#8b7a3b", "#6c312d", (safeRatio - 0.5) / 0.5);
}

function renderSatietyIntakeLoadBar(currentValue, maxValue) {
  const safeMax = Number.isFinite(Number(maxValue)) && Number(maxValue) > 0 ? Number(maxValue) : 20;
  const safeCurrent = Math.max(0, Math.min(safeMax, Number(currentValue) || 0));
  const pct = (safeCurrent / safeMax) * 100;
  const color = getIntakeLoadBarColor(safeCurrent / safeMax);
  const label = `进食上限 ${safeCurrent.toFixed(0)}/${safeMax.toFixed(0)}`;
  return `
    <div class="attr-subbar attr-subbar-intake" aria-label="${escapeAttr(label)}">
      <div class="attr-intake-load-wrap">
        <div class="attr-intake-load-track">
          <div class="attr-intake-load-fill attr-subbar-fill attr-subbar-fill-intake" style="width: ${pct.toFixed(1)}%; --subbar-color: ${color};"></div>
        </div>
        <div class="attr-intake-load-label">${escapeHtml(label)}</div>
      </div>
    </div>
  `;
}

function renderMetricBarCard({ label, icon, valueText, stageText, pct, color, desc }) {
  const widthPct = Math.max(0, Math.min(100, Number(pct) || 0));
  const safeLabel = escapeHtml(String(label || "指标"));
  const safeValue = escapeHtml(String(valueText || "0"));
  const safeStage = escapeHtml(String(stageText || ""));
  const safeDesc = escapeAttr(String(desc || ""));

  let html = `<div class="attr-card" data-hover-desc="${safeDesc}" tabindex="0">`;
  html += `<div class="attr-header">`;
  html += `<span class="attr-label"><span class="attr-icon">${escapeHtml(String(icon || "•"))}</span>${safeLabel}</span>`;
  html += `<span class="attr-value">${safeValue}</span>`;
  html += `</div>`;
  html += `<div class="attr-stage-row"><span class="attr-stage-chip">${safeStage}</span></div>`;
  html += `<div class="attr-bar-bg"><div class="attr-bar-fill" style="width: ${widthPct.toFixed(1)}%; --bar-color: ${color};"></div></div>`;
  html += `<div class="attr-tip"></div>`;
  html += `</div>`;
  return html;
}

function computeThermalTrendPer10Min(temperatureC, totalMinutes) {
  const currentTemp = Number(temperatureC);
  const currentMinutes = Math.max(0, Math.trunc(Number(totalMinutes ?? 0)));
  let per10Min = Number(_lastThermalSnapshot?.per10Min ?? 0);
  let notice = "";

  if (_lastThermalSnapshot && Number.isFinite(_lastThermalSnapshot.temperatureC) && currentMinutes > _lastThermalSnapshot.totalMinutes) {
    const dtMin = Math.max(1, currentMinutes - _lastThermalSnapshot.totalMinutes);
    per10Min = (currentTemp - _lastThermalSnapshot.temperatureC) / (dtMin / 10);
    if ((_lastThermalSnapshot.per10Min ?? 0) < -0.05 && per10Min > 0.05) {
      notice = "已回暖";
    }
  }

  _lastThermalSnapshot = {
    temperatureC: currentTemp,
    totalMinutes: currentMinutes,
    per10Min
  };

  return {
    per10Min,
    notice
  };
}

function getThermalUiThresholds() {
  const thermalDefs = PLAYER_DEFS.temperature || {};
  const core = thermalDefs?.core || {};
  const legacy = thermalDefs?.coreTemp || {};

  return {
    normal: Number(core?.normalC ?? legacy?.T_core_normal ?? 37),
    mild: Number((((Number(core?.normalC ?? legacy?.T_core_normal ?? 37)) + (Number(core?.incapC ?? 35))) / 2).toFixed(3)),
    moderate: Number(core?.incapC ?? 35),
    severe: Number(core?.deathC ?? 28),
    minTrack: Number(core?.minC ?? legacy?.T_core_min ?? 20),
    maxTrack: Number(core?.maxC ?? legacy?.T_core_max ?? 40)
  };
}

function formatThermalTrendUi(trendPer10Min) {
  const per10 = Number(trendPer10Min ?? 0);
  if (!Number.isFinite(per10) || Math.abs(per10) < 0.1) {
    return {
      label: "稳定",
      css: "is-stable",
      significant: false,
      direction: "stable"
    };
  }

  if (per10 < 0) {
    return {
      label: `↓ ${Math.abs(per10).toFixed(1)}°C/10min`,
      css: "is-cooling",
      significant: true,
      direction: "cooling"
    };
  }

  return {
    label: `↑ ${Math.abs(per10).toFixed(1)}°C/10min`,
    css: "is-warming",
    significant: true,
    direction: "warming"
  };
}

function formatThermalEtaMinutes(minutes) {
  const totalMin = Number(minutes ?? 0);
  if (!Number.isFinite(totalMin)) return "—";
  return formatMinutes(Math.max(0, Math.ceil(totalMin)));
}

function estimateExposureEtas(temperatureC, timings) {
  const regionCfg = getRegionConfigById(gameState.world?.regionId);
  const placeProfile = getPlaceProfileForMap(gameState.currentMapId, gameState.currentMap);
  const tv = getTimeView();
  const tEnvC = computeEnvTempC(regionCfg, tv, gameState.world, PLAYER_DEFS.temperature?.envTemp || {});
  const tEnvEffC = computeEffectiveEnvTempC(tEnvC, placeProfile, PLAYER_DEFS.temperature?.envTemp || {});
  const rateMul = computeExposureCoolingRateMul(tEnvEffC, PLAYER_DEFS.temperature || {});
  return estimateCoreCoolingEtas(temperatureC, timings, PLAYER_DEFS.temperature || {}, rateMul);
}

function getThermalStageMeta(hypoStage) {
  const stage = String(hypoStage || "Safe");
  const map = {
    Safe: { label: "安全", css: "is-safe" },
    Mild: { label: "警戒", css: "is-mild" },
    Moderate: { label: "危险", css: "is-moderate" },
    Severe: { label: "临界", css: "is-severe" }
  };
  return map[stage] || map.Safe;
}

function estimateThermalNextStage(temperatureC, trendPer10Min) {
  const tCore = Number(temperatureC);
  const per10 = Number(trendPer10Min);
  if (!Number.isFinite(tCore) || !Number.isFinite(per10) || per10 > -0.1) return null;

  const uiThresholds = getThermalUiThresholds();
  const thresholds = [
    { threshold: uiThresholds.mild, label: "轻度" },
    { threshold: uiThresholds.moderate, label: "中度" },
    { threshold: uiThresholds.severe, label: "重度" }
  ];
  const next = thresholds.find(row => tCore > row.threshold);
  if (!next) return null;

  const dropPerMin = Math.abs(per10) / 10;
  if (dropPerMin <= 0.0001) return null;

  const minutes = Math.max(1, Math.ceil((tCore - next.threshold) / dropPerMin));
  return {
    label: next.label,
    minutes
  };
}

function resolveThermalCardOpenState(hypoStage, riskPct, trendPer10Min, prediction, totalMinutes) {
  const etaMinutes = Number(prediction?.minutes ?? Infinity);
  const shouldTrigger = hypoStage !== "Safe" || trendPer10Min <= -0.5 || etaMinutes <= 30;
  const isCalm = hypoStage === "Safe" && Math.abs(Number(trendPer10Min ?? 0)) < 0.1;
  const currentMinute = Math.max(0, Math.trunc(Number(totalMinutes ?? 0)));

  if (shouldTrigger && !_thermalCardUiState.wasTriggering) {
    _thermalCardUiState.pinnedOpen = true;
    _thermalCardUiState.calmTicks = 0;
    _thermalCardUiState.lastCalmMinute = null;
  } else if (shouldTrigger) {
    _thermalCardUiState.calmTicks = 0;
    _thermalCardUiState.lastCalmMinute = null;
  } else if (isCalm) {
    if (_thermalCardUiState.lastCalmMinute !== currentMinute) {
      _thermalCardUiState.calmTicks += 1;
      _thermalCardUiState.lastCalmMinute = currentMinute;
    }
    if (_thermalCardUiState.calmTicks >= 3) {
      _thermalCardUiState.pinnedOpen = false;
    }
  } else {
    _thermalCardUiState.calmTicks = 0;
    _thermalCardUiState.lastCalmMinute = null;
  }

  _thermalCardUiState.wasTriggering = shouldTrigger;

  return {
    shouldTrigger,
    isOpen: _thermalCardUiState.manualOpen || _thermalCardUiState.pinnedOpen,
    isPriority: hypoStage === "Moderate" || hypoStage === "Severe"
  };
}

function getThermalSensationState(temperatureC) {
  const value = Number.isFinite(Number(temperatureC)) ? Number(temperatureC) : 37;
  if (value >= 37) {
    return {
      label: "舒适",
      description: "当前体感稳定。",
      css: "is-comfortable"
    };
  }
  if (value >= 35) {
    return {
      label: "轻微寒冷",
      description: "寒意正在积累。",
      css: "is-cool"
    };
  }
  return {
    label: "刺骨之寒",
    description: "寒冷已经非常明显。",
    css: "is-cold"
  };
}

function renderThermalCardActionRow() {
  return `
    <div class="thermal-action-row">
      <button type="button" class="thermal-chip thermal-chip-action thermal-chip-action-primary" data-action-id="ui_open_inventory_clothing" data-guide-target="thermal-card-detail-entry">查看服装</button>
    </div>
  `;
}

function renderThermalStaticCardFrame({
  title,
  statusLabel,
  statusCss,
  primaryHtml,
  description,
  lightPhase,
  visibilityBand,
  capabilityLevel,
  sourceItemId,
  variant
} = {}) {
  return `
    <section class="attr-card thermal-card thermal-card--${escapeAttr(String(variant || "basic"))} ${escapeAttr(String(statusCss || ""))}" data-guide-target="thermal-card" data-light-phase="${escapeAttr(String(lightPhase || ""))}" data-visibility-band="${escapeAttr(String(visibilityBand || ""))}" data-thermal-readout-level="${escapeAttr(String(capabilityLevel || "none"))}" data-thermal-readout-source="${escapeAttr(String(sourceItemId || ""))}">
      <div class="thermal-summary thermal-summary--static">
        <div class="thermal-summary-head">
          <span class="attr-label"><span class="attr-icon">❄</span>${escapeHtml(String(title || "温感"))}</span>
          <span class="thermal-stage-badge thermal-stage-badge--sense ${escapeAttr(String(statusCss || ""))}">${escapeHtml(String(statusLabel || ""))}</span>
        </div>
        ${primaryHtml}
        <div class="thermal-plain-copy">${escapeHtml(String(description || ""))}</div>
        ${renderThermalCardActionRow()}
      </div>
    </section>
  `;
}

function renderThermalBasicCard(model) {
  const sensation = getThermalSensationState(model?.temperatureC);
  return renderThermalStaticCardFrame({
    title: "温感",
    statusLabel: sensation.label,
    statusCss: sensation.css,
    description: sensation.description,
    lightPhase: model?.lightPhase,
    visibilityBand: model?.visibilityBand,
    capabilityLevel: model?.thermalReadoutCapability?.level,
    sourceItemId: model?.thermalReadoutCapability?.sourceItemId,
    variant: "basic",
    primaryHtml: `
      <div class="thermal-sense-main ${escapeAttr(sensation.css)}">${escapeHtml(sensation.label)}</div>
    `
  });
}

function renderThermalThermometerCard(model) {
  const sensation = getThermalSensationState(model?.temperatureC);
  return renderThermalStaticCardFrame({
    title: "体温",
    statusLabel: sensation.label,
    statusCss: sensation.css,
    description: "便携温度计提供基础读数。",
    lightPhase: model?.lightPhase,
    visibilityBand: model?.visibilityBand,
    capabilityLevel: model?.thermalReadoutCapability?.level,
    sourceItemId: model?.thermalReadoutCapability?.sourceItemId,
    variant: "thermometer",
    primaryHtml: `
      <div class="thermal-primary-row thermal-primary-row--static">
        <div class="thermal-temp-main">${escapeHtml(Number(model?.temperatureC ?? 37).toFixed(1))}<span class="thermal-temp-unit">°C</span></div>
        <div class="thermal-sense-inline ${escapeAttr(sensation.css)}">${escapeHtml(sensation.label)}</div>
      </div>
    `
  });
}

function renderThermalMonitorCard(model) {
  const {
    thermalReadoutCapability,
    temperatureC,
    hypothermia,
    hypoStage,
    riskPct,
    trendPer10Min,
    trendNotice,
    prediction,
    sourceMode,
    sourceValue,
    etaToDeathMinutes,
    exposureTimings,
    indoorWarmUi,
    showExposureAnchors,
    tEnvC,
    windLocal,
    warmthEff,
    wetness,
    warmthRating,
    protectionUi,
    placeProfile,
    placeProfileId,
    lightPhase,
    visibilityBand,
    showDebug,
    totalMinutes
  } = model;

  const isExposureCard = String(sourceMode || "hypothermia") === "exposure";
  const stageMeta = getThermalStageMeta(hypoStage);
  const uiThresholds = getThermalUiThresholds();
  const trendUi = formatThermalTrendUi(trendPer10Min);
  const disclosure = resolveThermalCardOpenState(hypoStage, riskPct, trendPer10Min, prediction, totalMinutes);
  const isDanger = hypoStage !== "Safe" || riskPct >= 10 || trendPer10Min <= -0.5;
  const tempPct = Math.max(0, Math.min(100, ((temperatureC - uiThresholds.minTrack) / (uiThresholds.maxTrack - uiThresholds.minTrack)) * 100));
  const riskFill = isExposureCard
    ? Math.max(0, Math.min(100, Number(sourceValue ?? hypothermia ?? 100)))
    : Math.max(0, Math.min(100, riskPct));
  const normalStart = ((uiThresholds.mild - uiThresholds.minTrack) / (uiThresholds.maxTrack - uiThresholds.minTrack)) * 100;
  const normalEnd = ((uiThresholds.normal - uiThresholds.minTrack) / (uiThresholds.maxTrack - uiThresholds.minTrack)) * 100;
  const markerValues = [
    { value: uiThresholds.severe, label: Number(uiThresholds.severe).toFixed(1) },
    { value: uiThresholds.moderate, label: "" },
    { value: uiThresholds.mild, label: Number(uiThresholds.mild).toFixed(1) }
  ];
  const markerHtml = markerValues.map(({ value, label }) => {
    const left = Math.max(0, Math.min(100, ((value - uiThresholds.minTrack) / (uiThresholds.maxTrack - uiThresholds.minTrack)) * 100));
    return `<div class="thermal-track-marker" style="left:${left.toFixed(2)}%;">${label ? `<span>${escapeHtml(label)}</span>` : ""}</div>`;
  }).join("");
  const isIndoorRecoveryCard = !showExposureAnchors && !!indoorWarmUi;
  const indoorDeltaText = String(indoorWarmUi?.deltaText || "+0.0°C");
  const indoorEtaText = String(indoorWarmUi?.etaDisplay || indoorWarmUi?.summaryText || "—");
  const exposureCurrentEtaText = `${formatThermalEtaMinutes(prediction?.minutes)} / ${formatThermalEtaMinutes(etaToDeathMinutes)}`;
  const etaValueText = isExposureCard
    ? exposureCurrentEtaText
    : (isIndoorRecoveryCard
        ? indoorEtaText
        : (prediction ? `${formatThermalEtaMinutes(prediction.minutes)}` : "—"));
  const etaVerboseText = isIndoorRecoveryCard
    ? String(indoorWarmUi?.verboseText || "按当前回暖效率，ETA 暂不可估")
    : (prediction ? `预计 ${formatThermalEtaMinutes(prediction.minutes)} 进入${prediction.label}` : (trendUi.direction === "cooling" ? "暂无更低阶段预测" : "当前无降温风险加深"));
  const riskText = isExposureCard
    ? `${Math.round(Number(sourceValue ?? hypothermia ?? 100))} / 100`
    : (isIndoorRecoveryCard ? indoorDeltaText : `${Math.round(riskPct)}%`);
  const detailMetricLabel = isExposureCard
    ? "暴露条剩余"
    : (isIndoorRecoveryCard ? "距目标" : "失温风险");
  const detailMetricValue = isExposureCard
    ? `${Math.round(Number(sourceValue ?? hypothermia ?? 100))} / 100`
    : (isIndoorRecoveryCard
        ? `${escapeHtml(indoorDeltaText)}`
        : `${escapeHtml(String(Math.round(riskPct)))}%`);
  const riskFillUi = isExposureCard
    ? Math.max(0, Math.min(100, Number(sourceValue ?? hypothermia ?? 100)))
    : (isIndoorRecoveryCard
        ? Math.max(0, Math.min(100, (Number(temperatureC ?? 0) / Math.max(1, Number(indoorWarmUi?.targetC ?? 37))) * 100))
        : Math.max(0, Math.min(100, riskPct)));
  const showSummaryDrivers = !isIndoorRecoveryCard && (trendUi.direction === "cooling" || !!prediction);
  const summaryDrivers = showSummaryDrivers
    ? [
        `风 ${Number(windLocal).toFixed(0)}m/s`,
        `保暖 ${Number(warmthEff).toFixed(2)}`
      ]
    : [];
  const urgentHint = isExposureCard
    ? Number(prediction?.minutes ?? Infinity) <= 10 || Number(etaToDeathMinutes ?? Infinity) <= 30
    : (trendPer10Min <= -0.5 || Number(prediction?.minutes ?? Infinity) <= 10);
  const tooltipLines = urgentHint || hypoStage !== "Safe"
    ? [
        isExposureCard
          ? "优先看：暴露条剩余 与 ETA"
          : (isIndoorRecoveryCard ? "优先看：距37°C 与 回满 ETA" : "优先看：↓°C/10min 与 ETA"),
        isIndoorRecoveryCard ? "再看：热源/I_eff/W_eff/P" : "再看：风/遮蔽/保暖/热源"
      ]
    : [
        isExposureCard
          ? "读法：体温 + 暴露条 + 失能/致死 ETA"
          : (isIndoorRecoveryCard ? "读法：体温 + 距37°C + 回满 ETA" : "读法：体温 + 趋势 + 失温风险 + ETA"),
        isExposureCard ? "阶段依据：暴露失温（Exposure）" : (isIndoorRecoveryCard ? "阶段依据：室内回温（Indoor Warm）" : "阶段依据：失温评估（Hypothermia）")
      ];
  if (isExposureCard) {
    tooltipLines.push(`基准（参考）：Open · 15km/h · 湿度适中 → 失能 ${formatThermalEtaMinutes(protectionUi?.timings?.T_incap)} / 致死 ${formatThermalEtaMinutes(protectionUi?.timings?.T_death)}`);
    tooltipLines.push(`当前：${String(placeProfile?.exposureLevel || "Open")} · 风${Number(windLocal).toFixed(0)}m/s · ${Number(tEnvC).toFixed(1)}°C → 失能 ${formatThermalEtaMinutes(prediction?.minutes)} / 致死 ${formatThermalEtaMinutes(etaToDeathMinutes)}`);
  }
  if (isIndoorRecoveryCard) {
    tooltipLines.push(`环境 ${Number(tEnvC).toFixed(1)}°C`);
    tooltipLines.push(`风 ${Number(windLocal).toFixed(0)}m/s`);
    tooltipLines.push(`遮蔽 ${String(placeProfile?.exposureLevel || "Open")}`);
    tooltipLines.push(`热源 ${Number(placeProfile?.heatSource ?? 0).toFixed(1)}`);
  }
  if (showDebug) tooltipLines.push("UI只读");
  const desc = escapeAttr(tooltipLines.join("\n"));
  const summaryMetricKey = isExposureCard ? "暴露条" : (isIndoorRecoveryCard ? `距${Number(indoorWarmUi?.targetC ?? 37).toFixed(0)}°C` : "失温风险");
  const summaryEtaKey = isExposureCard ? "失能/致死 ETA" : (isIndoorRecoveryCard ? "回满 ETA" : "到下一档");
  const stageBasisText = isExposureCard
    ? "阶段依据：暴露失温（Exposure）"
    : (isIndoorRecoveryCard ? "阶段依据：室内回温（Indoor Warm）" : "阶段依据：失温评估（Hypothermia）");
  const protectionTooltip = escapeAttr(String(protectionUi?.weakPointTooltip || "当前无明显弱点槽位"));
  const thermalCauseChips = isIndoorRecoveryCard
    ? [
        `<span class="thermal-chip">热源 ${escapeHtml(Number(placeProfile?.heatSource ?? 0).toFixed(1))}</span>`,
        `<span class="thermal-chip" data-hover-desc="${protectionTooltip}">I_eff ${escapeHtml(Number(protectionUi?.insulationEff ?? 0).toFixed(2))}</span>`,
        `<span class="thermal-chip" data-hover-desc="${protectionTooltip}">W_eff ${escapeHtml(Number(protectionUi?.windproofEff ?? 0).toFixed(2))}</span>`,
        `<span class="thermal-chip" data-hover-desc="${protectionTooltip}">P ${escapeHtml(Number(protectionUi?.protectionScore ?? 0).toFixed(2))}</span>`,
        `<button type="button" class="thermal-chip thermal-chip-action" data-action-id="ui_open_inventory_clothing">查看服装</button>`
      ]
    : [
        `<span class="thermal-chip">环境 ${escapeHtml(tEnvC.toFixed(1))}°C</span>`,
        `<span class="thermal-chip">风 ${escapeHtml(windLocal.toFixed(0))}m/s</span>`,
        `<span class="thermal-chip">遮蔽 ${escapeHtml(String(placeProfile?.exposureLevel || "Open"))}</span>`,
        `<span class="thermal-chip">热源 ${escapeHtml(Number(placeProfile?.heatSource ?? 0).toFixed(1))}</span>`,
        `<span class="thermal-chip" data-hover-desc="${protectionTooltip}">I_eff ${escapeHtml(Number(protectionUi?.insulationEff ?? 0).toFixed(2))}</span>`,
        `<span class="thermal-chip" data-hover-desc="${protectionTooltip}">W_eff ${escapeHtml(Number(protectionUi?.windproofEff ?? 0).toFixed(2))}</span>`,
        `<span class="thermal-chip" data-hover-desc="${protectionTooltip}">P ${escapeHtml(Number(protectionUi?.protectionScore ?? 0).toFixed(2))}</span>`,
        `<span class="thermal-chip">湿度 ${escapeHtml(Number(wetness ?? 0).toFixed(1))}</span>`,
        `<button type="button" class="thermal-chip thermal-chip-action" data-action-id="ui_open_inventory_clothing">查看服装</button>`
      ];
  const detailInfoHtml = showExposureAnchors
    ? `${showDebug ? `<span class="thermal-subinfo">空间 ${escapeHtml(String(placeProfile?.space || "outdoor"))}</span>` : ""}`
    : (showDebug ? `<span class="thermal-subinfo">空间 ${escapeHtml(String(placeProfile?.space || "indoor"))}</span>` : "");

  return `
    <details class="attr-card thermal-card thermal-card--monitor ${stageMeta.css} ${isDanger ? "is-danger" : ""} ${disclosure.isPriority ? "is-priority" : ""}" data-guide-target="thermal-card" data-light-phase="${escapeAttr(String(lightPhase || ""))}" data-visibility-band="${escapeAttr(String(visibilityBand || ""))}" data-thermal-readout-level="${escapeAttr(String(thermalReadoutCapability?.level || "monitor"))}" data-thermal-readout-source="${escapeAttr(String(thermalReadoutCapability?.sourceItemId || ""))}" ${disclosure.isOpen ? "open" : ""}>
      <summary class="thermal-summary" data-guide-target="thermal-card-detail-entry">
        <div class="thermal-summary-head">
          <span class="attr-label"><span class="attr-icon">❄</span>体征监测仪 <span class="thermal-help-dot" tabindex="0" aria-label="体征监测说明" data-hover-desc="${desc}">?</span></span>
          <span class="thermal-stage-badge ${stageMeta.css}">${stageMeta.label}</span>
        </div>
        <div class="thermal-primary-row">
          <div class="thermal-temp-main">${escapeHtml(temperatureC.toFixed(1))}<span class="thermal-temp-unit">°C</span></div>
          <div class="thermal-trend-wrap"><div class="thermal-trend ${trendUi.css}">${escapeHtml(trendUi.label)}</div>${urgentHint ? '<span class="thermal-alert-tag">警戒</span>' : ''}</div>
        </div>
        <div class="thermal-summary-lines">
          <div class="thermal-summary-line">
            <span class="thermal-summary-key">${summaryMetricKey}</span>
            <span class="thermal-summary-value ${riskPct >= 10 ? "is-danger" : ""}">${escapeHtml(riskText)}</span>
          </div>
          <div class="thermal-summary-line">
            <span class="thermal-summary-key">${summaryEtaKey}</span>
            <span class="thermal-summary-value">${escapeHtml(etaValueText)}</span>
          </div>
        </div>
        ${summaryDrivers.length ? `<div class="thermal-summary-drivers">${summaryDrivers.map((text) => `<span class="thermal-inline-chip">${escapeHtml(text)}</span>`).join("")}</div>` : ""}
      </summary>
      <div class="thermal-content">
        <div class="thermal-stage-basis">${stageBasisText}</div>
        <div class="thermal-track-wrap">
          <div class="thermal-track-scale">
            <div class="thermal-normal-band" style="left:${normalStart.toFixed(2)}%; width:${(normalEnd - normalStart).toFixed(2)}%;"></div>
            <div class="thermal-indicator" style="left:${tempPct.toFixed(2)}%;"></div>
            ${markerHtml}
          </div>
        </div>
        ${isIndoorRecoveryCard ? "" : `<div class="thermal-risk-row">
          <div class="thermal-risk-copy">
            <div class="thermal-risk-label">${detailMetricLabel}</div>
            <div class="thermal-risk-value">${detailMetricValue}</div>
          </div>
          <div class="thermal-risk-bar"><div class="thermal-risk-fill" style="width:${riskFillUi.toFixed(1)}%;"></div></div>
        </div>`}
        ${isExposureCard ? "" : `<div class="thermal-eta-row">
          <span>${escapeHtml(etaVerboseText)}</span>
          ${!isIndoorRecoveryCard && trendNotice ? `<span class="thermal-recovery-note">${escapeHtml(trendNotice)}</span>` : ""}
        </div>`}
        <div class="thermal-cause-grid">
          ${thermalCauseChips.join("")}
        </div>
        <div class="thermal-cause-grid thermal-cause-grid-detail">
          ${detailInfoHtml}
          ${showDebug ? `<span class="thermal-subinfo">HP 由体温派生（&lt;32°C开始下降）</span>` : ""}
          ${showDebug ? `<span class="thermal-subinfo">保暖 ${escapeHtml(warmthEff.toFixed(2))}</span>` : ""}
          ${showDebug ? `<span class="thermal-subinfo">保暖额定 ${escapeHtml(Number(warmthRating ?? 0).toFixed(2))}</span>` : ""}
          ${showDebug ? `<span class="thermal-subinfo">placeProfileId ${escapeHtml(placeProfileId)}</span>` : ""}
        </div>
        ${showDebug ? `<div class="thermal-debug-line">debug · tEnv=${escapeHtml(tEnvC.toFixed(2))}℃ · windLocal=${escapeHtml(windLocal.toFixed(2))}m/s · warmthEff=${escapeHtml(warmthEff.toFixed(3))}</div>` : ""}
      </div>
    </details>
  `;
}

function renderThermalControlCard(model) {
  const capabilityLevel = String(model?.thermalReadoutCapability?.level || "none");
  if (capabilityLevel === "monitor") {
    return renderThermalMonitorCard(model);
  }
  if (capabilityLevel === "thermometer") {
    return renderThermalThermometerCard(model);
  }
  return renderThermalBasicCard(model);
}

/**
 * 正常渲染当前地图
 */
export function render() {
  try {
    const renderCycle = ++_sceneTextRenderCycleSeq;
    const sceneTextAuditEnabled = true;
    closeSlotPopover();
    // ========== 1. 始终先渲染时间栏和玩家状态栏 ==========
    settingsManager.applyToDocument();
    ensureGlobalHotkeys();
    ensureSceneTextFxSmokeHook();
    ensureSceneTextDomProbeHook();
    ensureDebugWeatherHook();
    renderTimeBar();
    
    // 根据地图类型决定是否显示玩家状态栏
    const map = getCanonicalCurrentMap(gameState, { source: "renderer:render", repairState: true });
    const activeMapId = String(map?.id || getCanonicalMapId(gameState) || "");
    const actionIdForTrace = typeof window !== "undefined" ? String(window.__LAST_DISPATCH_ACTION_ID__ || "") : "";
    normalizeCanonicalUiState(gameState);
    const uiStateRenderStart = getUiActionStateSnapshot(gameState);
    const routeAtRenderStart = resolveUiSurface(gameState, { source: "render:start", actionId: actionIdForTrace });
    pushUiActionDiff({
      stage: "render:start",
      actionId: actionIdForTrace,
      prev: uiStateRenderStart,
      next: uiStateRenderStart,
      resolvedRoute: {
        pageType: routeAtRenderStart.pageType,
        overlayType: routeAtRenderStart.overlayType,
        hostType: routeAtRenderStart.hostType,
        mapId: routeAtRenderStart.mapId
      },
      renderedRoute: null,
      didCanonicalDeltaOccur: false,
      violationCode: routeAtRenderStart.violations.length > 0 ? "route_contract_violation" : null,
      errorMessage: routeAtRenderStart.violations.length > 0 ? routeAtRenderStart.violations.join(",") : null
    });
    const renderMapRef = map || { id: activeMapId, name: "" };
    const layoutMode = isMenuMapId(activeMapId) ? "menu" : "game";
    if (layoutMode === "menu" && _lastLayoutMode === "game") {
      resetLayoutInlineStylesForMenu();
    }
    _lastLayoutMode = layoutMode;
    const gameRoot = document.getElementById("game-root");
    if (gameRoot) {
      gameRoot.classList.toggle("menu-mode", layoutMode === "menu");
    }

    if (layoutMode === "menu") {
      syncMenuSnowRuntime({
        mapId: activeMapId,
        menuReturnMapId: String(gameState?.ui?.menuReturnMapId || "")
      });
    } else {
      syncBodySnowRuntime({
        shouldRun: layoutMode === "game" && gameState.world?.weather?.isSnowing === true,
        surfaceKey: "game",
        profileId: "game",
        activeMapId,
        stopReason: "inactive-surface"
      });
    }
    syncMenuHostClockLifecycle(renderMapRef);
    syncSavePageScrollLock(renderMapRef);
    syncSettingsOverlayLifecycle(renderMapRef);
    const settingsModalOpen = activeMapId === "menu_settings";
    document.body.classList.toggle("settings-modal-open", settingsModalOpen);
    document.documentElement.classList.toggle("settings-modal-open", settingsModalOpen);

    if (layoutMode === "menu") {
      clearLowHpFxState();
      document.body.dataset.menuPage = activeMapId;
      if (activeMapId === "menu_load") {
        const returnMapId = String(gameState?.ui?.menuReturnMapId || "").trim();
        const fromInGame = !!returnMapId && !isMenuMapId(returnMapId);
        document.body.dataset.menuLoadTheme = fromInGame ? "game" : "main";
      } else {
        delete document.body.dataset.menuLoadTheme;
      }
      setHudVisibility(false);
      document.body.classList.remove("inventory-open");
      document.documentElement.classList.remove("inventory-open");
      document.body.classList.remove("inv-open");
      document.documentElement.classList.remove("inv-open");
    } else {
      delete document.body.dataset.menuPage;
      delete document.body.dataset.menuLoadTheme;
      // 游戏页面：显示玩家状态栏
      setHudVisibility(true);
      try {
        renderPlayerSidebar();
      } catch (sidebarError) {
        const err = new Error(`sidebar/render stage: ${sidebarError?.message || sidebarError}`);
        err.cause = sidebarError;
        throw err;
      }
      document.body.classList.remove("inventory-open", "inv-open");
      document.documentElement.classList.remove("inventory-open", "inv-open");
    }
    const renderSnapshot = getRenderRuntimeSnapshot(map || renderMapRef, {
      stage: "render",
      layoutMode
    });
    pushRenderTrace("render", renderSnapshot);
    if (sceneTextAuditEnabled) {
      recordSceneTextHostLifecycle("stage-render", {
        appHost: null,
        renderCycle,
        currentMapId: String(gameState.currentMapId || gameState.currentMap?.id || ""),
        currentSceneId: String(gameState.currentSceneId || "")
      });
    }
    
    // ========== 2. 渲染地图内容 ==========
    const app = document.getElementById("app");
    const choices = document.getElementById("choices");
    const inventoryOverlayHost = ensureInventoryOverlayHost();
    const tasksOverlayHost = ensureTasksOverlayHost({
      getOverlayType: () => String(gameState.ui?.overlay || ""),
      isQuickKeysEnabled: () => !!settingsManager.getSettings()?.quickKeys,
      showInputDialog,
      escapeHtml,
      onClosed: () => {
        if (gameState.ui && gameState.ui.overlay === "tasks") {
          gameState.ui.overlay = null;
        }
      }
    });
    const profileOverlayHost = ensureProfileOverlayHost();
    const nightKitchenMenuOverlayHost = ensureNightKitchenMenuOverlayHost();
    const recordsOverlayHost = ensureRecordsOverlayHost({
      isOpen: () => gameState.ui?.recordsOpen === true,
      isQuickKeysEnabled: () => !!settingsManager.getSettings()?.quickKeys,
      requestRender: () => {
        const host = document.getElementById("records-overlay-host");
        if (!host || gameState.ui?.recordsOpen !== true) return;
        commitRecordsOverlay(gameState.currentMap || map || renderMapRef || null, host);
      },
      dispatchClose: async () => {
        const { dispatch } = await import("./pipeline/dispatch.js");
        await dispatch("ui_records_close");
      }
    });
    const socialOverlayHost = ensureSocialOverlayHost({
      isOpen: () => gameState.ui?.socialOpen === true,
      isQuickKeysEnabled: () => !!settingsManager.getSettings()?.quickKeys,
      requestRender: () => {
        const host = document.getElementById("social-overlay-host");
        if (!host || gameState.ui?.socialOpen !== true) return;
        commitSocialOverlay(gameState.currentMap || map || renderMapRef || null, host);
      },
      dispatchClose: async () => {
        const { dispatch } = await import("./pipeline/dispatch.js");
        await dispatch("ui_social_close");
      }
    });
    const settingsOverlayHost = ensureSettingsOverlayHost();
    applySidebarLayout(layoutMode);
    clearNightKitchenMenuOnRouteChange(String(gameState.currentMapId || gameState.currentMap?.id || ""));
    clearShopGoodsPanelOnRouteChange(String(gameState.currentMapId || gameState.currentMap?.id || ""));

    let pageViewModel = null;
    try {
      pageViewModel = buildRootRenderViewModel(gameState);
    } catch (viewModelError) {
      if (!map || layoutMode !== "menu") {
        throw viewModelError;
      }
    }

    if (!pageViewModel && !map) {
      const missingMapSnapshot = getRenderRuntimeSnapshot(map, {
        stage: "main",
        error: "current_map_missing"
      });
      pushRenderTrace("main", missingMapSnapshot);
      renderError("当前地图为空（可能加载失败）。");
      return;
    }

    if (!pageViewModel) {
      throw new Error("page view model missing");
    }

    const policyOutputBoundary = computeSceneTextPolicyOutputBoundary(pageViewModel);
    if (policyOutputBoundary) {
      const policyOutputShape = toSceneTextBoundaryShape("policy_output", policyOutputBoundary);
      updateSceneTextBoundaryAuditLayer("policy_output", policyOutputShape);
      console.info("[SceneTextBoundaryAudit] policy_output", policyOutputShape);
    }

    const vmSceneTextFxShape = toSceneTextBoundaryShape(
      "view_model_sceneTextFx",
      pageViewModel?.page?.sceneTextFx && typeof pageViewModel.page.sceneTextFx === "object"
        ? pageViewModel.page.sceneTextFx
        : {}
    );
    updateSceneTextBoundaryAuditLayer("view_model_sceneTextFx", vmSceneTextFxShape);
    console.info("[SceneTextBoundaryAudit] view_model_sceneTextFx", vmSceneTextFxShape);

    const descriptionText = String(pageViewModel.page?.description || "");
    const activeOverlay = String(pageViewModel.overlay?.uiOverlay || "");
    const selectedSurface = {
      pageType: String(pageViewModel.pageType || ""),
      overlayType: activeOverlay || null,
      hostType: String(pageViewModel.overlay?.hostType || "")
    };
    const overlayRegistry = getMapOverlayRegistry();
      const selectedOverlayEntry = selectedSurface.pageType === "map" && selectedSurface.overlayType !== "tasks"
        ? (overlayRegistry?.[selectedSurface.overlayType] || null)
      : null;
    const hasOverlayRequest = selectedSurface.pageType === "map" && !!selectedSurface.overlayType;
    const isTasksOverlayRequest = selectedSurface.pageType === "map" && selectedSurface.overlayType === "tasks";
    const overlayBranchMatched = !hasOverlayRequest || isTasksOverlayRequest || !!selectedOverlayEntry;
    const previousRenderedOverlay = _lastRenderedUiOverlay;
    if (activeOverlay && previousRenderedOverlay && activeOverlay !== previousRenderedOverlay) {
      pushUiOverlayTrace({
        source: "overlay:replace",
        actionId: actionIdForTrace,
        prevUiPage: String(gameState.ui?.page || ""),
        nextUiPage: String(gameState.ui?.page || ""),
        prevUiOverlay: previousRenderedOverlay,
        nextUiOverlay: activeOverlay,
        resolvedOverlay: activeOverlay,
        renderedOverlay: activeOverlay,
        hostId: "renderer",
        currentMapId: String(gameState.currentMapId || ""),
        currentSceneId: String(gameState.currentSceneId || "") || null,
        violationCode: null,
        errorMessage: null
      });
    }
    const isOverlayOpen = selectedSurface.pageType === "map"
      && (activeOverlay === "inventory" || activeOverlay === "tasks");
    document.body.classList.toggle("inventory-open", isOverlayOpen);
    document.documentElement.classList.toggle("inventory-open", isOverlayOpen);
    document.body.classList.toggle("inv-open", isOverlayOpen);
    document.documentElement.classList.toggle("inv-open", isOverlayOpen);
    pushRenderTrace("sceneText", getRenderRuntimeSnapshot(pageViewModel.page?.map || map || renderMapRef, {
      stage: "sceneText",
      title: String(pageViewModel.page?.title || ""),
      descriptionLength: String(descriptionText || "").trim().length,
      descriptionPreview: String(descriptionText || "").trim().slice(0, 120)
    }));
    if (sceneTextAuditEnabled) {
      recordSceneTextHostLifecycle("stage-sceneText", {
        appHost: app,
        renderCycle,
        currentMapId: String(gameState.currentMapId || gameState.currentMap?.id || ""),
        currentSceneId: String(gameState.currentSceneId || "")
      });
    }

    const transaction = createRenderTransactionTargets();
    renderPageViewModel(pageViewModel.page, transaction.appDraft, transaction.choicesDraft);
    commitRenderTransaction(transaction);
    const finalSceneTextHost = resolveFinalSceneTextHost(app);
    const locatorMode = isSceneTextDomLocatorEnabled();
    const probeMode = !locatorMode && isSceneTextDomProbeEnabled();
    const finalHostId = markFinalSceneTextHost(finalSceneTextHost, renderCycle, probeMode);

    if (locatorMode) {
      cancelSceneTextFxSession("dom_locator_mode_active");
      if (_sceneTextFxSmokeSession && typeof _sceneTextFxSmokeSession.cancel === "function") {
        _sceneTextFxSmokeSession.cancel();
        _sceneTextFxSmokeSession = null;
      }
      if (_sceneTextDomProbeSession && typeof _sceneTextDomProbeSession.cancel === "function") {
        _sceneTextDomProbeSession.cancel();
      }
      _sceneTextDomProbeSession = null;
      runSceneTextDomLocator({
        descriptionText,
        renderCycle,
        attachedAtStage: "post_main_commit",
        currentMapId: String(gameState?.currentMapId || gameState?.currentMap?.id || ""),
        currentSceneId: String(gameState?.currentSceneId || "")
      });
    } else if (probeMode) {
      cancelSceneTextFxSession("dom_probe_mode_active");
      if (_sceneTextFxSmokeSession && typeof _sceneTextFxSmokeSession.cancel === "function") {
        _sceneTextFxSmokeSession.cancel();
        _sceneTextFxSmokeSession = null;
      }

      const canReuseProbe = _sceneTextDomProbeSession
        && typeof _sceneTextDomProbeSession.getSnapshot === "function"
        && (() => {
          const snap = _sceneTextDomProbeSession.getSnapshot();
          return !!snap
            && snap.state === "running"
            && snap.hostElement === finalSceneTextHost
            && finalSceneTextHost?.isConnected;
        })();

      if (!canReuseProbe) {
        if (_sceneTextDomProbeSession && typeof _sceneTextDomProbeSession.cancel === "function") {
          _sceneTextDomProbeSession.cancel();
        }
        _sceneTextDomProbeSession = runSceneTextDomProbe({
          appHost: app,
          finalHost: finalSceneTextHost,
          choicesHost: choices,
          finalHostId,
          renderCycle,
          attachedAtStage: "post_main_commit",
          currentMapId: String(gameState?.currentMapId || gameState?.currentMap?.id || ""),
          currentSceneId: String(gameState?.currentSceneId || "")
        });
      } else if (typeof _sceneTextDomProbeSession.updateContext === "function") {
        _sceneTextDomProbeSession.updateContext({
          renderCycle,
          attachedAtStage: "post_main_commit",
          currentMapId: String(gameState?.currentMapId || gameState?.currentMap?.id || ""),
          currentSceneId: String(gameState?.currentSceneId || "")
        });
      }
    } else {
      stopSceneTextDomLocator();
      if (_sceneTextDomProbeSession && typeof _sceneTextDomProbeSession.cancel === "function") {
        _sceneTextDomProbeSession.cancel();
      }
      _sceneTextDomProbeSession = null;
      runSceneTextFxForMainMap(pageViewModel.page, app, choices);
    }

    const actionDiagnostics = pageViewModel.page?.actionDiagnostics || analyzeActionVisibility(map);
    if (sceneTextAuditEnabled) {
      recordSceneTextHostLifecycle("stage-actions", {
        appHost: app,
        renderCycle,
        currentMapId: String(gameState.currentMapId || gameState.currentMap?.id || ""),
        currentSceneId: String(gameState.currentSceneId || "")
      });
    }
    pushRenderTrace("actions", getRenderRuntimeSnapshot(pageViewModel.page?.map || map || renderMapRef, {
      stage: "actions",
      actions: actionDiagnostics
    }));
    if (sceneTextAuditEnabled) {
      recordSceneTextHostLifecycle("stage-main", {
        appHost: app,
        renderCycle,
        currentMapId: String(gameState.currentMapId || gameState.currentMap?.id || ""),
        currentSceneId: String(gameState.currentSceneId || "")
      });
    }
    pushRenderTrace("main", getRenderRuntimeSnapshot(pageViewModel.page?.map || map || renderMapRef, {
      stage: "main",
      title: String(pageViewModel.page?.title || ""),
      descriptionLength: String(descriptionText || "").trim().length,
      isMenuMap: layoutMode === "menu"
    }));

    if (pageViewModel.overlay?.showSettingsOverlay) {
      commitSettingsOverlay(settingsOverlayHost);
    } else {
      destroySettingsOverlay();
    }

    const committedMap = pageViewModel.page?.map || map || renderMapRef;
    const committedMapId = String(committedMap?.id || activeMapId || "");
    const transitionPolicy = resolveTransitionPolicy(buildRenderTransitionPolicyContext({
      actionId: actionIdForTrace,
      nextMapId: committedMapId,
      nextSurface: {
        pageType: selectedSurface.pageType,
        overlayType: selectedSurface.overlayType,
        modalType: gameState?.ui?.modal ?? null
      }
    }));

    if (_inventoryOverlayClearTimer) {
      clearTimeout(_inventoryOverlayClearTimer);
      _inventoryOverlayClearTimer = null;
    }

    const shouldShowProfileOverlay = layoutMode !== "menu" && gameState.ui?.profileOpen === true;
    if (shouldShowProfileOverlay) {
      if (!isProfileOverlayClosing(profileOverlayHost)) {
        commitProfileOverlay(pageViewModel.page?.map || committedMap || map || renderMapRef, profileOverlayHost);
      }
    } else if (profileOverlayHost && !isProfileOverlayClosing(profileOverlayHost)) {
      profileOverlayHost.innerHTML = "";
      profileOverlayHost.setAttribute("aria-hidden", "true");
      profileOverlayHost.hidden = true;
    }

    const shouldShowRecordsOverlay = layoutMode !== "menu" && gameState.ui?.recordsOpen === true;
    if (shouldShowRecordsOverlay) {
      if (!isRecordsOverlayClosing(recordsOverlayHost)) {
        commitRecordsOverlay(pageViewModel.page?.map || committedMap || map || renderMapRef, recordsOverlayHost);
      }
    } else if (recordsOverlayHost && !isRecordsOverlayClosing(recordsOverlayHost)) {
      recordsOverlayHost.innerHTML = "";
      recordsOverlayHost.setAttribute("aria-hidden", "true");
      recordsOverlayHost.hidden = true;
    }

    const shouldShowSocialOverlay = layoutMode !== "menu" && gameState.ui?.socialOpen === true;
    if (shouldShowSocialOverlay) {
      if (!isSocialOverlayClosing(socialOverlayHost)) {
        commitSocialOverlay(pageViewModel.page?.map || committedMap || map || renderMapRef, socialOverlayHost);
      }
    } else if (socialOverlayHost && !isSocialOverlayClosing(socialOverlayHost)) {
      socialOverlayHost.innerHTML = "";
      socialOverlayHost.setAttribute("aria-hidden", "true");
      socialOverlayHost.hidden = true;
    }

    const nightKitchenMenuSnapshot = getNightKitchenMenuSnapshot();
    const shouldShowNightKitchenMenu = layoutMode !== "menu"
      && nightKitchenMenuSnapshot?.open === true
      && nightKitchenMenuSnapshot.mapId === committedMapId;
    const shopGoodsPanelSnapshot = getShopGoodsPanelSnapshot();
    const shouldShowShopGoodsPanel = layoutMode !== "menu"
      && shopGoodsPanelSnapshot?.open === true
      && shopGoodsPanelSnapshot.mapId === committedMapId;
    if (shouldShowNightKitchenMenu) {
      renderNightKitchenMenuModule(pageViewModel.page?.map || committedMap || map || renderMapRef, nightKitchenMenuOverlayHost);
    } else if (shouldShowShopGoodsPanel) {
      renderShopGoodsPanelModule(pageViewModel.page?.map || committedMap || map || renderMapRef, nightKitchenMenuOverlayHost);
    } else {
      hideNightKitchenMenuOverlay(nightKitchenMenuOverlayHost);
    }

    const overlayHosts = {
      tasks: tasksOverlayHost,
      inventory: inventoryOverlayHost,
      mapMiniMap: {
        clinic: ensureClinicMiniMapPanel(),
        industrial: ensureIndustrialMiniMapPanel(),
        winddyke: ensureWinddykeMiniMapPanel(),
        gov: ensureGovHallMiniMapPanel()
      }
    };
    _overlayTransitionRuntimeContext.actionIdForTrace = actionIdForTrace;
    _overlayTransitionRuntimeContext.selectedSurface = selectedSurface;
    _overlayTransitionRuntimeContext.uiStateRenderStart = uiStateRenderStart;
    _overlayTransitionRuntimeContext.getHosts = () => overlayHosts;
    const overlayTransitionManager = getOverlayTransitionManager();

    let selectedOverlayCommitResult = null;
    if (isTasksOverlayRequest) {
      const result = commitTasksOverlay(
        pageViewModel.page?.map || committedMap || map || renderMapRef,
        overlayHosts.tasks
      );
      selectedOverlayCommitResult = {
        hostId: "tasks-overlay-host",
        vmValidation: result?.vmValidation || null
      };
    }

    if (selectedOverlayEntry && selectedSurface.pageType === "map") {
      const overlayViewModel = selectedOverlayEntry.buildViewModel({
        map: pageViewModel.page?.map || committedMap || map || renderMapRef,
        hosts: overlayHosts,
        state: gameState,
        actionId: actionIdForTrace
      });
      selectedOverlayCommitResult = selectedOverlayEntry.commit({
        viewModel: overlayViewModel,
        map: pageViewModel.page?.map || committedMap || map || renderMapRef,
        hosts: overlayHosts,
        state: gameState,
        actionId: actionIdForTrace
      }) || null;

      if (selectedSurface.overlayType === "tasks" && selectedOverlayCommitResult?.vmValidation && !selectedOverlayCommitResult.vmValidation.ok) {
        reportUiSurfaceViolation({
          code: UI_SURFACE_VIOLATION_CODES.VM_EMPTY,
          actionId: actionIdForTrace,
          message: `tasks view model invalid: ${(selectedOverlayCommitResult.vmValidation.issues || []).join(",")}`,
          uiStart: uiStateRenderStart,
          uiEnd: getUiActionStateSnapshot(gameState),
          selectedSurface,
          renderedSurface: {
            pageType: selectedSurface.pageType,
            overlayType: "tasks",
            hostType: selectedSurface.hostType
          },
          expectedHostId: "tasks-overlay-host",
          actualHostId: "tasks-overlay-host",
          details: {
            vmIssues: selectedOverlayCommitResult.vmValidation.issues || [],
            mapId: String(pageViewModel.page?.map?.id || committedMap?.id || "")
          }
        });
      }

      pushUiRouteTrace({
        source: "render_overlay_host",
        actionId: "",
        prevUiPage: null,
        nextUiPage: String(gameState.ui?.page || ""),
        prevUiOverlay: null,
        nextUiOverlay: String(selectedSurface.overlayType || "") || null,
        prevCurrentMapId: null,
        nextCurrentMapId: String(gameState.currentMapId || ""),
        prevCurrentSceneId: null,
        nextCurrentSceneId: String(gameState.currentSceneId || "") || null,
        resolvedPageType: String(pageViewModel.pageType || ""),
        resolvedOverlayType: String(selectedSurface.overlayType || "") || null,
        renderHost: String(pageViewModel.overlay?.hostType || ""),
        violationCode: null,
        errorMessage: null
      });

      pushUiOverlayTrace({
        source: "overlay:render_host",
        actionId: actionIdForTrace,
        prevUiPage: null,
        nextUiPage: String(gameState.ui?.page || ""),
        prevUiOverlay: previousRenderedOverlay,
        nextUiOverlay: String(selectedSurface.overlayType || "") || null,
        resolvedOverlay: String(selectedSurface.overlayType || "") || null,
        renderedOverlay: String(selectedSurface.overlayType || "") || null,
        hostId: String(selectedOverlayCommitResult?.hostId || selectedOverlayEntry.hostId || ""),
        currentMapId: String(gameState.currentMapId || ""),
        currentSceneId: String(gameState.currentSceneId || "") || null,
        violationCode: null,
        errorMessage: null
      });
    }

    if (!overlayBranchMatched) {
      reportUiSurfaceViolation({
        code: UI_SURFACE_VIOLATION_CODES.FALLBACK_TO_MAP_MAIN,
        actionId: actionIdForTrace,
        message: `overlay branch missed for selected surface ${selectedSurface.pageType}/${selectedSurface.overlayType}`,
        uiStart: uiStateRenderStart,
        uiEnd: getUiActionStateSnapshot(gameState),
        selectedSurface,
        renderedSurface: {
          pageType: selectedSurface.pageType,
          overlayType: null,
          hostType: selectedSurface.hostType
        },
        expectedHostId: getExpectedOverlayHostId(selectedSurface.overlayType),
        actualHostId: "map-main-host",
        details: {
          activeOverlay,
          pageType: String(pageViewModel.pageType || "")
        }
      });
    }

    const reconcileState = isTasksOverlayRequest
      ? {
        ...gameState,
        ui: {
          ...(gameState.ui || {}),
          overlay: null
        }
      }
      : gameState;

    const overlayReconcileResult = reconcileOverlayHostsFromCanonicalUi(
      reconcileState,
      {
        inventory: overlayHosts.inventory,
        tasks: null,
        mapMiniMap: {
          clinic: overlayHosts.mapMiniMap.clinic,
          industrial: overlayHosts.mapMiniMap.industrial,
          winddyke: overlayHosts.mapMiniMap.winddyke,
          gov: overlayHosts.mapMiniMap.gov
        }
      },
      overlayRegistry,
      {
        mapId: String(committedMap?.id || ""),
        resolveMapMiniMapBranch: (mapId) => resolveMapMiniMapBranch(mapId),
        transitionPolicy,
        transitionManager: overlayTransitionManager,
        reportViolation: ({ code, message, details }) => {
          reportUiSurfaceViolation({
            code,
            actionId: actionIdForTrace,
            message,
            uiStart: uiStateRenderStart,
            uiEnd: getUiActionStateSnapshot(gameState),
            selectedSurface,
            renderedSurface: {
              pageType: selectedSurface.pageType,
              overlayType: details?.after?.activeOverlay || null,
              hostType: selectedSurface.hostType
            },
            expectedHostId: getExpectedOverlayHostId(selectedSurface.overlayType),
            actualHostId: details?.after?.activeHostId || "map-main-host",
            details
          });
        }
      }
    );
    applyLegacyOverlayCleanupCompat(overlayHosts);

    const domInventoryOverlay = overlayReconcileResult.after.inventoryActive
      && !!document.querySelector("#inventory-overlay-host .inventory-overlay");
    const domTasksOverlay = !!document.querySelector("#tasks-overlay-host .tasks-overlay");
    const domClinicMiniMap = overlayReconcileResult.after.clinicMiniMapActive;
    const domIndustrialMiniMap = overlayReconcileResult.after.industrialMiniMapActive;
    const domWinddykeMiniMap = overlayReconcileResult.after.winddykeMiniMapActive;
    const domGovHallMiniMap = overlayReconcileResult.after.govMiniMapActive;
    const domSteelcrossMiniMap = !!document.querySelector('#steelcross-minimap-panel[aria-hidden="false"]');
    const domMapMiniMapOverlay = !!(domClinicMiniMap || domIndustrialMiniMap || domWinddykeMiniMap || domGovHallMiniMap || domSteelcrossMiniMap);
    const canonicalOverlayRaw = overlayReconcileResult.canonicalOverlay;
    const canonicalOverlay = canonicalOverlayRaw === "tasks" ? null : canonicalOverlayRaw;
    const domOverlayCount = overlayReconcileResult.after.activeCount;
    const renderedOverlay = domTasksOverlay
      ? "tasks"
      : domInventoryOverlay
      ? "inventory"
      : domMapMiniMapOverlay
      ? UI_OVERLAY_TYPES.MAP_MINIMAP
      : null;
    const actualOverlayHostId = domTasksOverlay
      ? "tasks-overlay-host"
      : domSteelcrossMiniMap
      ? "steelcross-minimap-panel"
      : overlayReconcileResult.after.activeHostId;
    _lastRenderedUiOverlay = renderedOverlay;
    const liveHostIdentity = String(
      actualOverlayHostId
      || selectedSurface.hostType
      || (pageViewModel.pageType === "menu" ? "menu_host" : "map_main_host")
      || ""
    ).trim() || null;
    _lastLiveRenderedSurfaceSnapshot = normalizeLiveRenderedSurfaceSnapshot({
      pageType: String(pageViewModel.pageType || ""),
      mapId: String(committedMapId || ""),
      overlayType: renderedOverlay,
      modalType: gameState?.ui?.modal ?? null,
      renderCycleId: renderCycle,
      liveHostIdentity,
      sourceStage: "render:surface",
      actionId: actionIdForTrace
    });
    pushLiveRenderedSurfaceTrace({
      event: "live_rendered_surface_snapshot",
      ..._lastLiveRenderedSurfaceSnapshot
    });
    const overlayViolationCodes = [];
    if (domOverlayCount > 1) {
      overlayViolationCodes.push("multiple_overlay_active");
    }
    if (canonicalOverlay === UI_OVERLAY_TYPES.MAP_MINIMAP && !domMapMiniMapOverlay) {
      overlayViolationCodes.push("map_overlay_missing_dom");
    }
    if (canonicalOverlay === "inventory" && !domInventoryOverlay) {
      overlayViolationCodes.push("inventory_overlay_missing_dom");
    }
    if (canonicalOverlay !== "inventory" && domInventoryOverlay) {
      overlayViolationCodes.push("inventory_overlay_state_dom_mismatch");
    }
    if (!isTasksOverlayRequest && canonicalOverlay !== "tasks" && domTasksOverlay) {
      overlayViolationCodes.push("tasks_overlay_state_dom_mismatch");
    }
    if (canonicalOverlay !== UI_OVERLAY_TYPES.MAP_MINIMAP && domMapMiniMapOverlay) {
      overlayViolationCodes.push("map_overlay_state_dom_mismatch");
    }
    if (canonicalOverlay && renderedOverlay && canonicalOverlay !== renderedOverlay && renderedOverlay !== "tasks") {
      overlayViolationCodes.push("resolved_rendered_overlay_mismatch");
    }
    if (pageViewModel.pageType === "menu" && (domInventoryOverlay || domTasksOverlay || domMapMiniMapOverlay || canonicalOverlay)) {
      overlayViolationCodes.push("menu_overlay_conflict");
    }

    if (hasOverlayRequest && overlayBranchMatched && !renderedOverlay) {
      reportUiSurfaceViolation({
        code: UI_SURFACE_VIOLATION_CODES.FALLBACK_TO_MAP_MAIN,
        actionId: actionIdForTrace,
        message: `overlay requested but DOM host not rendered for ${selectedSurface.pageType}/${selectedSurface.overlayType}`,
        uiStart: uiStateRenderStart,
        uiEnd: getUiActionStateSnapshot(gameState),
        selectedSurface,
        renderedSurface: {
          pageType: selectedSurface.pageType,
          overlayType: renderedOverlay,
          hostType: selectedSurface.hostType
        },
        expectedHostId: getExpectedOverlayHostId(selectedSurface.overlayType),
        actualHostId: actualOverlayHostId,
        details: {
          domOverlayCount,
          domInventoryOverlay,
          domTasksOverlay,
          domMapMiniMapOverlay
        }
      });
    }

    if (canonicalOverlay === "inventory" && renderedOverlay !== "inventory") {
      reportUiSurfaceViolation({
        code: UI_SURFACE_VIOLATION_CODES.RENDER_MISMATCH,
        actionId: actionIdForTrace,
        message: "selected inventory surface did not render inventory host",
        uiStart: uiStateRenderStart,
        uiEnd: getUiActionStateSnapshot(gameState),
        selectedSurface,
        renderedSurface: {
          pageType: selectedSurface.pageType,
          overlayType: renderedOverlay,
          hostType: selectedSurface.hostType
        },
        expectedHostId: "inventory-overlay-host",
        actualHostId: actualOverlayHostId
      });
    }

    if (canonicalOverlay === UI_OVERLAY_TYPES.MAP_MINIMAP && renderedOverlay !== UI_OVERLAY_TYPES.MAP_MINIMAP) {
      reportUiSurfaceViolation({
        code: UI_SURFACE_VIOLATION_CODES.RENDER_MISMATCH,
        actionId: actionIdForTrace,
        message: "selected map_minimap surface did not render minimap host",
        uiStart: uiStateRenderStart,
        uiEnd: getUiActionStateSnapshot(gameState),
        selectedSurface,
        renderedSurface: {
          pageType: selectedSurface.pageType,
          overlayType: renderedOverlay,
          hostType: selectedSurface.hostType
        },
        expectedHostId: "clinic-minimap-panel|winddyke-minimap-panel|gov-hall-minimap-panel|steelcross-minimap-panel|transit-minimap-panel",
        actualHostId: actualOverlayHostId
      });
    }

    if (overlayViolationCodes.length > 0) {
      pushUiRouteTrace({
        source: "route_contract_violation",
        actionId: "",
        prevUiPage: null,
        nextUiPage: String(gameState.ui?.page || ""),
        prevUiOverlay: null,
        nextUiOverlay: canonicalOverlay,
        prevCurrentMapId: null,
        nextCurrentMapId: String(gameState.currentMapId || ""),
        prevCurrentSceneId: null,
        nextCurrentSceneId: String(gameState.currentSceneId || "") || null,
        resolvedPageType: String(pageViewModel.pageType || ""),
        resolvedOverlayType: canonicalOverlay,
        renderHost: String(pageViewModel.overlay?.hostType || ""),
        violationCode: "route_contract_violation",
        errorMessage: overlayViolationCodes.join(",")
      });
      pushUiOverlayTrace({
        source: "overlay_contract_violation",
        actionId: actionIdForTrace,
        prevUiPage: null,
        nextUiPage: String(gameState.ui?.page || ""),
        prevUiOverlay: previousRenderedOverlay,
        nextUiOverlay: canonicalOverlay,
        resolvedOverlay: canonicalOverlay,
        renderedOverlay,
        hostId: String(pageViewModel.overlay?.hostType || ""),
        currentMapId: String(gameState.currentMapId || ""),
        currentSceneId: String(gameState.currentSceneId || "") || null,
        violationCode: "overlay_contract_violation",
        errorMessage: overlayViolationCodes.join(",")
      });
    }

    pushUiOpenCallchain({
      source: "render:surface",
      actionId: actionIdForTrace,
      actionType: "GLOBAL_ACTION",
      resolveEntered: true,
      resolveExited: true,
      commitEntered: true,
      commitExited: true,
      prev: uiStateRenderStart,
      next: getUiActionStateSnapshot(gameState),
      canonicalSetterCalled: false,
      canonicalSelectorResult: {
        pageType: String(pageViewModel.pageType || ""),
        overlayType: canonicalOverlay,
        hostType: String(pageViewModel.overlay?.hostType || "")
      },
      renderedSurface: {
        pageType: String(pageViewModel.pageType || ""),
        overlayType: renderedOverlay,
        hostType: String(pageViewModel.overlay?.hostType || "")
      },
      violationCode: overlayViolationCodes.length > 0 ? "overlay_contract_violation" : null,
      errorMessage: overlayViolationCodes.length > 0 ? overlayViolationCodes.join(",") : null
    });
    if (sceneTextAuditEnabled) {
      recordSceneTextHostLifecycle("render:surface", {
        appHost: app,
        renderCycle,
        currentMapId: String(gameState.currentMapId || gameState.currentMap?.id || ""),
        currentSceneId: String(gameState.currentSceneId || "")
      });
      scheduleSceneTextHostRafAudit({
        appHost: app,
        renderCycle,
        currentMapId: String(gameState.currentMapId || gameState.currentMap?.id || ""),
        currentSceneId: String(gameState.currentSceneId || "")
      });
    }

    pushUiActionDiff({
      stage: "render:end",
      actionId: actionIdForTrace,
      prev: uiStateRenderStart,
      next: getUiActionStateSnapshot(gameState),
      resolvedRoute: {
        pageType: String(pageViewModel.pageType || ""),
        overlayType: canonicalOverlay,
        hostType: String(pageViewModel.overlay?.hostType || ""),
        mapId: String(gameState.currentMapId || "")
      },
      renderedRoute: {
        pageType: String(pageViewModel.pageType || ""),
        overlayType: renderedOverlay,
        hostType: String(pageViewModel.overlay?.hostType || ""),
        mapId: String(gameState.currentMapId || "")
      },
      violationCode: overlayViolationCodes.length > 0 ? "overlay_contract_violation" : null,
      errorMessage: overlayViolationCodes.length > 0 ? overlayViolationCodes.join(",") : null
    });

    runMenuSettingsTransitionDomProbe(actionIdForTrace);

    renderTempSmokeReportModal();

    const runtimeSettings = settingsManager.getSettings();
    if (runtimeSettings.scrollBehavior === "top") {
      app.scrollTop = 0;
      choices.scrollTop = 0;
    }

    // ========== 4. 页面切换平滑过渡 ==========
    const forceMapTransitionOnce = document.body?.dataset?.forceMapTransitionOnce === "1";
    const sceneSig = computeSceneSignatureForTransition(committedMap);
    const prevRenderedMapId = String(_lastRenderedMapId || "");
    const isMenuLikeMapSwitch = isMenuLikeMapId(prevRenderedMapId)
      && isMenuLikeMapId(committedMapId)
      && prevRenderedMapId !== committedMapId;
    const sceneChanged = !!(
      sceneSig
      && _lastRenderedMapId === committedMapId
      && _lastRenderedSceneSignature
      && sceneSig !== _lastRenderedSceneSignature
    );

    if (isMenuLikeMapSwitch) {
      delete document.body.dataset.forceMapTransitionOnce;
      delete document.body.dataset.skipMapTransitionOnce;
      app.classList.remove("map-transition");
      choices.classList.remove("map-transition");
      _lastRenderedMapId = committedMapId;
      _lastRenderedSceneSignature = sceneSig;
      return;
    }

    if (_lastRenderedMapId !== committedMapId || forceMapTransitionOnce || sceneChanged) {
      if (forceMapTransitionOnce) {
        delete document.body.dataset.forceMapTransitionOnce;
      }
      const skipMapTransitionOnce = document.body?.dataset?.skipMapTransitionOnce === "1";
      if (skipMapTransitionOnce) {
        delete document.body.dataset.skipMapTransitionOnce;
        app.classList.remove("map-transition");
        choices.classList.remove("map-transition");
        _lastRenderedMapId = committedMapId;
        _lastRenderedSceneSignature = sceneSig;
        return;
      }

      app.classList.remove("map-transition");
      choices.classList.remove("map-transition");
      requestAnimationFrame(() => {
        app.classList.add("map-transition");
        choices.classList.add("map-transition");
      });
      _lastRenderedMapId = committedMapId;
      _lastRenderedSceneSignature = sceneSig;
      return;
    }

    // 同图无过渡时也要刷新签名（避免后续变化漏判）
    _lastRenderedSceneSignature = sceneSig;
  } catch (error) {
    console.error("[Render] 运行时异常", error);
    if (error?.cause) {
      console.error("[Render] 异常根因", error.cause);
    }
    pushRenderTrace("main", getRenderRuntimeSnapshot(gameState.currentMap, {
      stage: "main",
      error: error?.message || String(error || "unknown_render_error")
    }));
    renderError(`渲染失败：${error?.message || error}`);
  }
}

/**
 * 渲染当前地图 actions（纯数据驱动）
 * - 禁止按 mapId 写渲染特例
 * - 允许按 action.ui.type 分发控件（button/slider_minutes）
 */
function renderMapActions(map, choicesContainer) {
  if (map.id === "menu_main") {
    renderMenuMainActions(choicesContainer);
    return;
  }

  if (map.id === "menu_load") {
    renderMenuLoadActions(choicesContainer);
    return;
  }

  if (map.id === "menu_settings") {
    commitSettingsOverlay(ensureSettingsOverlayHost());
    return;
  }

  if (!Array.isArray(map.actions)) return;

  const actionGroup = createActionGroup("动作", "actions");
  const movementGroup = createActionGroup("移动", "movement");
  const renderedEntries = [];

  let actionCount = 0;
  let movementCount = 0;

  for (const action of map.actions) {
    if (String(map?.id || "") === "gov_hall_main_hall"
      && gameState?.world?.flags?.govHallWindowMenuOpen === true
      && GOV_HALL_WINDOW_HIDDEN_ACTION_IDS.has(String(action?.id || ""))) {
      continue;
    }

    if (action?.id === "gov_b_window_intro") {
      const { isOpen } = getGovHallRuntimeState();
      if (!isOpen) continue;
    }

    let isLocked = false;
    let isDisabledByRule = false;

    // ========== P0-3：默认隐藏 requires 未满足的动作（renderer 策略）==========
    if (action?.requires) {
      const r = evaluateRequires(gameState, action.requires);
      if (!r.ok) {
        const lockedBehavior = action?.ui?.lockedBehavior ?? "hide";
        if (lockedBehavior !== "show") {
          continue;
        }
        isLocked = true;
      }
    }

    const isMovement = isMovementAction(action);
    const widget = renderActionWidget(map, action, {
      locked: isLocked,
      kindTag: isMovement ? "移动" : "动作"
    });
    if (!widget) continue;

    renderedEntries.push(widget);
    if (isMovement) {
      movementGroup.list.appendChild(widget);
      movementCount += 1;
    } else {
      actionGroup.list.appendChild(widget);
      actionCount += 1;
    }
  }

  if (actionCount > 0) {
    choicesContainer.appendChild(actionGroup.root);
  }
  if (movementCount > 0) {
    choicesContainer.appendChild(movementGroup.root);
  }
}

function createActionGroup(title, kind) {
  const root = document.createElement("section");
  root.className = `journal-action-group journal-action-group-${kind} map-actions-group`;

  const heading = document.createElement("div");
  heading.className = "journal-action-group-title map-actions-group-title";
  heading.textContent = title;
  root.appendChild(heading);

  const list = document.createElement("div");
  list.className = "journal-action-group-list map-actions-group-list";
  root.appendChild(list);

  return { root, list };
}

function getActionDurationText(action) {
  const ui = action?.ui || {};
  const candidates = [ui.durationMin, ui.minutes, action?.durationMin, action?.minutes, action?.payload?.minutes];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return formatMinutes(numeric);
    }
  }
  return "";
}

function renderActionWidget(map, action, options = {}) {
  if (!action || typeof action !== "object") return null;

  const uiType = String(action?.ui?.type || "button").trim().toLowerCase();
  if (uiType === "slider_minutes") {
    return renderSliderMinutes(map, action, options);
  }

  const actionId = String(action.id || "").trim();
  if (!actionId) return null;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.actionId = actionId;
  if (String(map?.id || "") === "winddyke_street_clinic_segment" && actionId === "to_clinic") {
    button.dataset.guideTarget = "winddyke-thermal-return-clinic-action";
  }
  if (action?.ui?.mapId) button.dataset.mapId = String(action.ui.mapId || "");
  if (action?.ui?.sceneId) button.dataset.sceneId = String(action.ui.sceneId || "");
  if (action?.ui?.interactionId) button.dataset.interactionId = String(action.ui.interactionId || "");
  button.className = "journal-action";
  button.classList.add("map-action-btn", options.kindTag === "移动" ? "map-move-btn" : "map-choice-btn");
  const actionFeedback = String(action?.ui?.runtimeActionFeedback || "").trim();
  if (actionFeedback && action?.ui?.legacyDatasetFeedback === true) {
    button.dataset.actionFeedback = actionFeedback;
  }
  const actionFeedbackModel = encodeUiRuntimeModel(action?.ui?.runtimeActionFeedbackModel);
  if (actionFeedbackModel && action?.ui?.legacyDatasetFeedback === true) {
    button.dataset.actionFeedbackModel = actionFeedbackModel;
  }
  const actionIllustrationKey = String(action?.ui?.runtimeActionIllustrationKey || "").trim();
  if (actionIllustrationKey) {
    button.dataset.actionIllustrationKey = actionIllustrationKey;
  }

  const label = document.createElement("span");
  label.className = "journal-action-label";
  label.textContent = stripActionDurationFromLabel(action.text || actionId);
  button.appendChild(label);

  if (options.kindTag) {
    button.classList.add("has-kind-tag");
    const kind = document.createElement("span");
    kind.className = "journal-action-kind";
    kind.textContent = options.kindTag;
    button.appendChild(kind);
  }

  const durationText = getActionDurationText(action);
  if (durationText) {
    const duration = document.createElement("span");
    duration.className = "journal-action-duration";
    duration.textContent = durationText;
    button.appendChild(duration);
  }

  if (options.locked) {
    button.classList.add("is-locked");
    button.dataset.locked = "true";
    const lockBadge = document.createElement("span");
    lockBadge.className = "journal-action-lock-badge";
    lockBadge.setAttribute("aria-hidden", "true");
    lockBadge.textContent = "锁定";
    button.appendChild(lockBadge);
  }
  if (options.disabled) {
    button.disabled = true;
    button.classList.add("is-disabled-by-gate");
  }
  if (options.remapActionId) {
    button.dataset.remapActionId = String(options.remapActionId);
    button.classList.add("is-collapse-remap");
  }
  if (options.gateReason) {
    button.dataset.gateReason = String(options.gateReason);
  }
  if (options.suppressed) {
    button.classList.add("is-critical-suppressed");
  }
  if (action?.ui?.priority === "primary") {
    button.classList.add("primary-action");
  }

  return button;
}

function stripActionDurationFromLabel(text) {
  let label = String(text ?? "").trim();
  if (!label) return "";

  label = label.replace(/\s*(?:\d+\s*分钟|\d+h\d+m)\s*$/u, "").trim();

  const bracketMatch = label.match(/^(.*?)[（(]([^（）()]*)[）)]\s*$/u);
  if (!bracketMatch) return label;

  const outer = String(bracketMatch[1] || "").trim();
  let inner = String(bracketMatch[2] || "").trim();
  inner = inner
    .replace(/(?:[\s·,，、]|^)(?:\d+\s*分钟|\d+h\d+m)\s*$/u, "")
    .replace(/(?:[\s·,，、]|^)\d{1,2}\s*[:：]\s*\d{1,2}\s*$/u, "")
    .replace(/[\s·,，、]+$/u, "")
    .trim();

  if (!inner) return outer;
  return `${outer}（${inner}）`;
}

/**
 * slider_minutes 控件 DOM：
 * - sleep-duration-widget__header: 标题 + 当前值
 * - sleep-duration-widget__slider-wrap: 滑条 + 极简刻度
 * - sleep-duration-widget__confirm: 提交按钮
 *
 * 注意：renderer 只读，不缓存值到 gameState（避免状态漂移）
 */
function formatSleepDurationScale(minutesRaw) {
  const minutes = Math.max(0, Math.trunc(Number(minutesRaw ?? 0)));
  if (minutes <= 0) return "0h";
  const hours = minutes / 60;
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${hours.toFixed(1).replace(/\.0$/, "")}h`;
}

function renderSleepDurationValue(host, minutesRaw) {
  if (!host) return;
  const minutes = Math.max(0, Math.trunc(Number(minutesRaw ?? 0)));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  host.textContent = "";
  host.setAttribute("aria-label", `睡眠时长 ${hours}小时 ${mins}分钟`);

  const hourNumber = document.createElement("span");
  hourNumber.className = "sleep-duration-widget__value-number";
  hourNumber.textContent = String(hours);
  host.appendChild(hourNumber);

  const hourUnit = document.createElement("span");
  hourUnit.className = "sleep-duration-widget__value-unit";
  hourUnit.textContent = "h";
  host.appendChild(hourUnit);

  const spacer = document.createElement("span");
  spacer.className = "sleep-duration-widget__value-gap";
  spacer.textContent = " ";
  host.appendChild(spacer);

  const minuteNumber = document.createElement("span");
  minuteNumber.className = "sleep-duration-widget__value-number";
  minuteNumber.textContent = String(mins);
  host.appendChild(minuteNumber);

  const minuteUnit = document.createElement("span");
  minuteUnit.className = "sleep-duration-widget__value-unit";
  minuteUnit.textContent = "m";
  host.appendChild(minuteUnit);
}

function renderSliderMinutes(map, action, options = {}) {
  const ui = action.ui || {};
  const sliderId = String(`slider-${map.id}-${action.id}`)
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "slider-minutes";

  const block = document.createElement("div");
  block.classList.add("sleep-duration-widget");

  const header = document.createElement("div");
  header.classList.add("sleep-duration-widget__header");

  const title = document.createElement("div");
  title.textContent = "睡眠时长";
  title.classList.add("sleep-duration-widget__label");
  header.appendChild(title);

  const display = document.createElement("div");
  display.classList.add("sleep-duration-widget__value");
  display.setAttribute("aria-live", "polite");
  header.appendChild(display);

  block.appendChild(header);

  const sliderWrap = document.createElement("div");
  sliderWrap.classList.add("sleep-duration-widget__slider-wrap");

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(ui.min ?? 0);
  slider.max = String(ui.max ?? 0);
  slider.step = String(ui.step ?? 1);
  slider.value = String(ui.default ?? 0);
  slider.id = sliderId;
  slider.classList.add("sleep-duration-widget__slider");
  sliderWrap.appendChild(slider);

  const scale = document.createElement("div");
  scale.classList.add("sleep-duration-widget__scale");

  const scaleMin = document.createElement("span");
  scaleMin.textContent = formatSleepDurationScale(ui.min ?? 0);
  scale.appendChild(scaleMin);

  const scaleMax = document.createElement("span");
  scaleMax.textContent = formatSleepDurationScale(ui.max ?? 0);
  scale.appendChild(scaleMax);

  sliderWrap.appendChild(scale);
  block.appendChild(sliderWrap);

  const syncSliderVisual = () => {
    const parsed = parseInt(slider.value, 10);
    const safeValue = Number.isFinite(parsed) ? parsed : 0;
    const min = Number(slider.min);
    const max = Number(slider.max);
    const span = max - min;
    const fill = span > 0 ? ((safeValue - min) / span) * 100 : 0;
    slider.style.setProperty("--sleep-slider-fill", `${Math.max(0, Math.min(100, fill))}%`);
    renderSleepDurationValue(display, safeValue);
  };

  syncSliderVisual();
  slider.addEventListener("input", syncSliderVisual);

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = ui.confirmText || "开始睡觉";
  confirmBtn.dataset.actionId = action.id;
  confirmBtn.dataset.payloadSource = sliderId;
  const actionFeedback = String(action?.ui?.runtimeActionFeedback || "").trim();
  if (actionFeedback && action?.ui?.legacyDatasetFeedback === true) {
    confirmBtn.dataset.actionFeedback = actionFeedback;
  }
  const actionFeedbackModel = encodeUiRuntimeModel(action?.ui?.runtimeActionFeedbackModel);
  if (actionFeedbackModel && action?.ui?.legacyDatasetFeedback === true) {
    confirmBtn.dataset.actionFeedbackModel = actionFeedbackModel;
  }
  const actionIllustrationKey = String(action?.ui?.runtimeActionIllustrationKey || "").trim();
  if (actionIllustrationKey) {
    confirmBtn.dataset.actionIllustrationKey = actionIllustrationKey;
  }
  confirmBtn.classList.add("journal-action", "sleep-duration-widget__confirm");
  if (options.locked) {
    confirmBtn.disabled = true;
    confirmBtn.classList.add("is-locked");
  }
  if (action?.ui?.priority === "primary") {
    confirmBtn.classList.add("primary-action");
  }
  block.appendChild(confirmBtn);

  return block;
}

function bindSidebarWaitMinutesLabel(sidebar) {
  const slider = sidebar?.querySelector("#sidebar-wait-minutes");
  const label = sidebar?.querySelector("#sidebar-wait-minutes-label");
  if (!slider || !label) return;

  const render = () => {
    const parsed = parseInt(slider.value, 10);
    label.textContent = formatMinutes(Number.isFinite(parsed) ? parsed : 0);
  };

  render();
  slider.addEventListener("input", render);
}

function ensureNoticeDialogHost() {
  let host = document.getElementById("notice-dialog-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "notice-dialog-host";
    host.className = "notice-dialog-host";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
  }
  return host;
}

function ensureTempSmokeReportHost() {
  let host = document.getElementById("temp-smoke-report-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "temp-smoke-report-host";
    host.className = "temp-smoke-report-host";
    host.setAttribute("aria-hidden", "true");
    host.addEventListener("click", async (event) => {
      const btn = event.target.closest("button[data-action-id]");
      if (!btn) return;
      const actionId = btn.dataset.actionId;
      if (!actionId) return;
      const { dispatch } = await import("./pipeline/dispatch.js");
      await dispatch(actionId, {});
    });
    document.body.appendChild(host);
  }
  return host;
}

function renderTempSmokeReportModal() {
  const host = ensureTempSmokeReportHost();
  const isOpen = gameState.ui?.modal === "TEMP_SMOKE_REPORT";
  const report = gameState.debug?.lastTempSmokeReport;

  host.innerHTML = "";
  host.setAttribute("aria-hidden", isOpen ? "false" : "true");
  document.body.classList.toggle("temp-smoke-report-open", !!isOpen);
  document.documentElement.classList.toggle("temp-smoke-report-open", !!isOpen);

  if (!isOpen || !report) return;

  const overlay = document.createElement("div");
  overlay.className = "temp-smoke-report-overlay";
  const card = document.createElement("div");
  card.className = "temp-smoke-report-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "温度冒烟测试结果");

  card.innerHTML = `
    <div class="temp-smoke-report-title">温度冒烟测试结果</div>
    <div class="temp-smoke-report-meta">
      <div><strong>RanAt:</strong> Day ${escapeHtml(String(report.day ?? "?"))} ${escapeHtml(String(report.hhmm || "00:00"))}</div>
      <div><strong>TotalMinutes:</strong> ${escapeHtml(String(report.ranAtTotalMinutes ?? 0))}</div>
      <div><strong>RegionId:</strong> ${escapeHtml(String(report.regionId || ""))}</div>
      <div><strong>MapId:</strong> ${escapeHtml(String(report.mapId || ""))}</div>
      <div><strong>World:</strong> sun=${escapeHtml(String(report.worldSnapshot?.sun ?? 0))} snow=${escapeHtml(String(report.worldSnapshot?.snowfallRate ?? 0))} wind=${escapeHtml(String(report.worldSnapshot?.windSpeed ?? 0))}</div>
      <div><strong>DefsHash:</strong> ${escapeHtml(String(report.defsHash || "-"))}</div>
      <div><strong>Pass/Fail:</strong> ${escapeHtml(String(report.summary?.passCount ?? 0))} / ${escapeHtml(String(report.summary?.failCount ?? 0))}</div>
    </div>
    <div class="temp-smoke-report-body">${renderTempSmokeCaseList(report)}</div>
    <div class="temp-smoke-report-footer">
      <button class="sidebar-btn sidebar-btn-compact" data-action-id="temp_smoke_copy_summary">Copy Summary</button>
      <button class="sidebar-btn sidebar-btn-compact" data-action-id="temp_smoke_copy_json">Copy JSON</button>
      <button class="sidebar-btn sidebar-btn-compact" data-action-id="temp_smoke_append_log">Append to logLines</button>
      <button class="sidebar-btn sidebar-btn-compact sidebar-btn-danger" data-action-id="close_temp_smoke_report">关闭</button>
    </div>
  `;

  overlay.appendChild(card);
  host.appendChild(overlay);
}

function renderTempSmokeCaseList(report) {
  const cases = Array.isArray(report?.cases) ? report.cases : [];
  return cases.map((row, index) => `
    <details class="temp-smoke-case ${row?.pass ? "is-pass" : "is-fail"}" ${row?.pass ? "" : "open"}>
      <summary class="temp-smoke-case-summary">
        <span class="temp-smoke-case-badge ${row?.pass ? "is-pass" : "is-fail"}">${row?.pass ? "PASS" : "FAIL"}</span>
        <span class="temp-smoke-case-name">${escapeHtml(String(row?.name || `Case ${index + 1}`))}</span>
        <span class="temp-smoke-case-name" style="opacity:.7;font-weight:400;">${escapeHtml(String(row?.placeProfileId || ""))}</span>
      </summary>
      <div class="temp-smoke-case-content">
        <div class="temp-smoke-asserts">
          <div class="temp-smoke-metrics-title">Rates</div>
          <div class="temp-smoke-assert-row">
            <span>dtMin</span>
            <span>${escapeHtml(String(row?.dtMin ?? 0))}</span>
          </div>
          <div class="temp-smoke-assert-row">
            <span>tCoreDeltaPer10Min</span>
            <span>${escapeHtml(String(row?.tCoreDeltaPer10Min ?? 0))}</span>
          </div>
          <div class="temp-smoke-assert-row">
            <span>tCoreCoolingPer10Min</span>
            <span>${escapeHtml(String(row?.tCoreCoolingPer10Min ?? 0))}</span>
          </div>
          <div class="temp-smoke-assert-row">
            <span>tCoreWarmingPer10Min</span>
            <span>${escapeHtml(String(row?.tCoreWarmingPer10Min ?? 0))}</span>
          </div>
          <div class="temp-smoke-assert-row">
            <span>dT10</span>
            <span>${escapeHtml(String(row?.dT10 ?? 0))}</span>
          </div>
        </div>
        <div class="temp-smoke-metrics-grid">
          ${renderTempSmokeMetricsBlock("Before", row?.before)}
          ${renderTempSmokeMetricsBlock("After", row?.after)}
        </div>
        <div class="temp-smoke-asserts">
          <div class="temp-smoke-metrics-title">Context</div>
          <div class="temp-smoke-assert-row">
            <span>tEnvRegionC / tEnvEffC</span>
            <span>${escapeHtml(String(row?.after?.tEnvRegionC ?? 0))} / ${escapeHtml(String(row?.after?.tEnvEffC ?? 0))}</span>
          </div>
          <div class="temp-smoke-assert-row">
            <span>placeProfile</span>
            <span>${escapeHtml(String(row?.context?.placeProfile?.space ?? ""))} · heat=${escapeHtml(String(row?.context?.placeProfile?.heatSource ?? 0))} · dry=${escapeHtml(String(row?.context?.placeProfile?.drying ?? 0))}</span>
          </div>
          <div class="temp-smoke-assert-row">
            <span>windModel</span>
            <span>world=${escapeHtml(String(row?.context?.windModel?.worldWindSpeed ?? 0))} · local=${escapeHtml(String(row?.context?.windModel?.windLocal ?? 0))}</span>
          </div>
        </div>
        <div class="temp-smoke-asserts">
          <div class="temp-smoke-metrics-title">Asserts</div>
          ${(Array.isArray(row?.asserts) ? row.asserts : []).map(assertRow => `
            <div class="temp-smoke-assert-row ${assertRow?.pass ? "is-pass" : "is-fail"}">
              <span>${escapeHtml(String(assertRow?.key || "assert"))}</span>
              <span>${escapeHtml(String(assertRow?.lhs ?? 0))} ${escapeHtml(String(assertRow?.op || "?"))} ${escapeHtml(String(assertRow?.rhs ?? 0))}</span>
            </div>
          `).join("")}
        </div>
        ${row?.notes ? `<div class="temp-smoke-notes">Notes: ${escapeHtml(String(row.notes))}</div>` : ""}
        <div class="temp-smoke-case-actions">
          <button class="sidebar-btn sidebar-btn-compact" data-action-id="temp_smoke_copy_case_json:${index}">复制该 Case JSON</button>
        </div>
      </div>
    </details>
  `).join("");
}

function renderTempSmokeMetricsBlock(title, metrics) {
  return `
    <div class="temp-smoke-metrics-block">
      <div class="temp-smoke-metrics-title">${escapeHtml(String(title || ""))}</div>
      <div>tEnvRegion: ${escapeHtml(String(metrics?.tEnvRegionC ?? metrics?.tEnvC ?? 0))}</div>
      <div>tEnvEff: ${escapeHtml(String(metrics?.tEnvEffC ?? 0))}</div>
      <div>windLocal: ${escapeHtml(String(metrics?.windLocal ?? 0))}</div>
      <div>warmthEff: ${escapeHtml(String(metrics?.warmthEff ?? 0))}</div>
      <div>tCore: ${escapeHtml(String(metrics?.tCoreC ?? 0))}</div>
      <div>hypo: ${escapeHtml(String(metrics?.hypo ?? 0))}</div>
      <div>hp: ${escapeHtml(String(metrics?.hp ?? 0))}</div>
      <div>wetness: ${escapeHtml(String(metrics?.wetness ?? 0))}</div>
      <div>gear.warmthRating: ${escapeHtml(String(metrics?.warmthRating ?? 0))}</div>
      <div>gear.windproof: ${escapeHtml(String(metrics?.windproof ?? 0))}</div>
      <div>gear.waterproof: ${escapeHtml(String(metrics?.waterproof ?? 0))}</div>
    </div>
  `;
}

/**
 * 显示游戏内通知对话框（替代原生 alert/confirm）
 * @param {Object} payload
 * @param {string} payload.title
 * @param {string} payload.message
 * @param {Array<{id:string,label:string,kind?:"primary"|"secondary"}>} payload.actions
 * @returns {Promise<string>} 点击的 action id
 */
export function showNoticeDialog(payload = {}) {
  return uiShowNoticeDialog(payload);
}

function encodeUiRuntimeModel(model) {
  if (!model || typeof model !== "object") return "";
  try {
    return encodeURIComponent(JSON.stringify(model));
  } catch (_error) {
    return "";
  }
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

/**
 * 显示确认对话框
 * @param {Object} payload
 * @param {string} payload.title
 * @param {string} payload.message
 * @param {string} payload.confirmLabel
 * @param {string} payload.cancelLabel
 * @returns {Promise<boolean>}
 */
export async function showConfirmDialog(payload = {}) {
  return uiShowConfirmDialog(payload);
}

/**
 * 显示输入对话框
 * @param {Object} payload
 * @param {string} payload.title
 * @param {string} payload.message
 * @param {string} payload.defaultValue
 * @param {string} payload.placeholder
 * @param {string} payload.confirmLabel
 * @param {string} payload.cancelLabel
 * @returns {Promise<string|null>} 取消返回 null
 */
export function showInputDialog(payload = {}) {
  return uiShowInputDialog(payload);
}

function formatFormalMoney(value) {
  return formatWalletMoney(value);
}

/**
 * 渲染错误信息（加载失败之类）
 */
export function renderError(message) {
  clearLowHpFxState();
  const app = document.getElementById("app");
  const choices = document.getElementById("choices");
  if (app) {
    app.textContent = `【错误】${message}`;
  }
  if (choices) {
    choices.innerHTML = "";
  }

  // 错误兜底页不应因 sidebar 二次异常而失效。
  try {
    renderTimeBar();
  } catch (timebarError) {
    console.error("[RenderError] 时间栏渲染失败", timebarError);
  }
  try {
    renderPlayerSidebar();
  } catch (sidebarError) {
    console.error("[RenderError] sidebar/render stage 失败", sidebarError);
  }
}

/**
 * 渲染存档选择界面
 */
export function renderSaveLoadScreen() {
  // 导入存档管理器
  import("../save/save_manager.js").then(({ saveManager }) => {
    // 获取所有槽位信息
    const slots = saveManager.listSlots();
    
    // 渲染界面
    renderTimeBar();
    renderPlayerSidebar();
    
    const app = document.getElementById("app");
    const choices = document.getElementById("choices");
    
    // 清空
    choices.innerHTML = "";
    
    // 标题
    app.textContent = "读取存档\n\n请选择要加载的存档槽位：\n";
    
    // 为每个槽位生成按钮
    slots.forEach(slot => {
      const btn = document.createElement("button");
      btn.style.marginBottom = "8px";
      btn.style.padding = "12px";
      btn.style.textAlign = "left";
      btn.style.width = "100%";
      
      if (slot.isEmpty) {
        btn.textContent = `槽位 ${slot.slotId}：空`;
        btn.disabled = true;
        btn.style.opacity = "0.5";
      } else if (slot.corrupted) {
        btn.textContent = `槽位 ${slot.slotId}：已损坏`;
        btn.disabled = true;
        btn.style.opacity = "0.5";
      } else {
        // 格式化时间
        const date = new Date(slot.updatedAt);
        const dateStr = date.toLocaleString("zh-CN");
        
        btn.innerHTML = `<strong>槽位 ${slot.slotId}</strong><br/>`;
        btn.innerHTML += `Day ${slot.day} | HP: ${slot.hp.toFixed(0)}<br/>`;
        btn.innerHTML += `位置：${slot.location}<br/>`;
        btn.innerHTML += `<small>最后保存：${dateStr}</small>`;
        
        btn.dataset.actionId = `load_slot_${slot.slotId}`;
      }
      
      choices.appendChild(btn);
    });
    
    // 返回按钮
    const backBtn = document.createElement("button");
    backBtn.textContent = "返回菜单";
    backBtn.dataset.actionId = "back_to_menu";
    backBtn.style.marginTop = "16px";
    choices.appendChild(backBtn);
  });
}

// 导出供 events.js 使用
export { renderSaveLoadScreen as renderSaveLoadUI };
