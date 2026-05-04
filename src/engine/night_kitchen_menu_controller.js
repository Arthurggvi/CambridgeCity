import {
  buildNightKitchenMenuCatalog,
  resolveNightKitchenMenuCatalogDefinition
} from "./night_kitchen_menu_catalog.js";

const DEFAULT_MENU_STATE = Object.freeze({
  open: false,
  mapId: null,
  mode: null,
  categoryId: null,
  itemId: null,
  scrollTopByCategory: Object.freeze({}),
  visualState: Object.freeze({
    shellPhase: "closed",
    bodyTransitionPhase: "idle",
    detailTransitionPhase: "idle",
    tabTransitioning: false,
    itemTransitioning: false,
    transitioningCategoryId: null,
    transitioningItemId: null,
    purchasePending: false,
    purchaseFeedback: null,
    purchaseFeedbackText: "",
    purchaseFeedbackTone: null,
    purchaseFeedbackKey: 0,
    purchaseFailShake: false
  })
});

const OPEN_DURATION_MS = 200;
const CLOSE_DURATION_MS = 160;
const TAB_SWITCH_OUT_MS = 72;
const TAB_SWITCH_IN_MS = 132;
const ITEM_SWITCH_OUT_MS = 52;
const ITEM_SWITCH_IN_MS = 112;
const PURCHASE_FEEDBACK_SUCCESS_MS = 1080;
const PURCHASE_FEEDBACK_FAIL_MS = 860;
const PURCHASE_FAIL_SHAKE_MS = 190;

let _menuState = createDefaultMenuState();
let _openTimer = null;
let _closeTimer = null;
let _tabOutTimer = null;
let _tabInTimer = null;
let _itemOutTimer = null;
let _itemInTimer = null;
let _feedbackTimer = null;
let _purchaseShakeTimer = null;
const _listeners = new Set();

function createDefaultMenuState() {
  return {
    open: false,
    mapId: null,
    mode: null,
    categoryId: null,
    itemId: null,
    scrollTopByCategory: Object.create(null),
    visualState: createDefaultVisualState()
  };
}

function createDefaultVisualState() {
  return {
    shellPhase: "closed",
    bodyTransitionPhase: "idle",
    detailTransitionPhase: "idle",
    tabTransitioning: false,
    itemTransitioning: false,
    transitioningCategoryId: null,
    transitioningItemId: null,
    purchasePending: false,
    purchaseFeedback: null,
    purchaseFeedbackText: "",
    purchaseFeedbackTone: null,
    purchaseFeedbackKey: 0,
    purchaseFailShake: false
  };
}

function cloneVisualState(source) {
  return {
    ...createDefaultVisualState(),
    ...(source && typeof source === "object" ? source : null)
  };
}

function clearTimer(timerId) {
  if (timerId) {
    clearTimeout(timerId);
  }
  return null;
}

function notifyListeners() {
  if (_listeners.size === 0) return;
  const snapshot = getSnapshot();
  for (const listener of _listeners) {
    try {
      listener(snapshot);
    } catch (_error) {
      // Ignore listener failures to keep local UI state resilient.
    }
  }
}

function clearShellTimers() {
  _openTimer = clearTimer(_openTimer);
  _closeTimer = clearTimer(_closeTimer);
}

function clearTransitionTimers() {
  _tabOutTimer = clearTimer(_tabOutTimer);
  _tabInTimer = clearTimer(_tabInTimer);
  _itemOutTimer = clearTimer(_itemOutTimer);
  _itemInTimer = clearTimer(_itemInTimer);
}

function clearPurchaseTimers() {
  _feedbackTimer = clearTimer(_feedbackTimer);
  _purchaseShakeTimer = clearTimer(_purchaseShakeTimer);
}

function normalizeId(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function getCatalogCategories(catalog) {
  return Array.isArray(catalog?.categories) ? catalog.categories : [];
}

function getCatalogItems(catalog) {
  return Array.isArray(catalog?.items) ? catalog.items : [];
}

function findCategoryById(catalog, categoryId) {
  const normalizedCategoryId = normalizeId(categoryId);
  if (!normalizedCategoryId) return null;
  return getCatalogCategories(catalog).find((category) => normalizeId(category?.id) === normalizedCategoryId) || null;
}

function findCategoryForMode(catalog, mode) {
  const normalizedMode = normalizeId(mode);
  if (!normalizedMode) return getCatalogCategories(catalog)[0] || null;
  return getCatalogCategories(catalog).find((category) => normalizeId(category?.mode) === normalizedMode)
    || getCatalogCategories(catalog).find((category) => normalizeId(category?.id) === normalizedMode)
    || getCatalogCategories(catalog)[0]
    || null;
}

function getItemsForCategory(catalog, categoryId) {
  const normalizedCategoryId = normalizeId(categoryId);
  if (!normalizedCategoryId) return [];
  return getCatalogItems(catalog).filter((item) => normalizeId(item?.categoryId) === normalizedCategoryId);
}

function findItemById(catalog, itemId) {
  const normalizedItemId = normalizeId(itemId);
  if (!normalizedItemId) return null;
  return getCatalogItems(catalog).find((item) => normalizeId(item?.id) === normalizedItemId) || null;
}

function cloneScrollTopByCategory(source) {
  return Object.assign(Object.create(null), source && typeof source === "object" ? source : null);
}

function setState(nextState, { silent = false } = {}) {
  _menuState = {
    open: nextState?.open === true,
    mapId: normalizeId(nextState?.mapId),
    mode: normalizeId(nextState?.mode),
    categoryId: normalizeId(nextState?.categoryId),
    itemId: normalizeId(nextState?.itemId),
    scrollTopByCategory: cloneScrollTopByCategory(nextState?.scrollTopByCategory),
    visualState: cloneVisualState(nextState?.visualState)
  };
  if (!silent) {
    notifyListeners();
  }
  return getSnapshot();
}

function buildNormalizedOpenState(baseState, catalog) {
  const category = findCategoryById(catalog, baseState.categoryId)
    || findCategoryForMode(catalog, baseState.mode);
  const categoryId = normalizeId(category?.id);
  const itemId = resolveNextItemId(catalog, categoryId, baseState.itemId);
  return {
    ...baseState,
    open: true,
    categoryId,
    itemId,
    visualState: cloneVisualState(baseState?.visualState)
  };
}

function resolveNextItemId(catalog, categoryId, preferredItemId = null) {
  const items = getItemsForCategory(catalog, categoryId);
  if (items.length === 0) return null;
  const preferred = preferredItemId ? items.find((item) => normalizeId(item?.id) === normalizeId(preferredItemId)) : null;
  return normalizeId(preferred?.id || items[0]?.id);
}

export function resolveNightKitchenMenuCatalog(mapId, mapContent) {
  const normalizedMapId = normalizeId(mapId);
  if (!normalizedMapId) return null;
  const staticDefinition = resolveNightKitchenMenuCatalogDefinition(normalizedMapId);
  if (staticDefinition) {
    return buildNightKitchenMenuCatalog(staticDefinition);
  }
  const directCatalog = mapContent?.menuCatalogByMapId?.[normalizedMapId];
  if (directCatalog && typeof directCatalog === "object") return directCatalog;
  const runtimeCatalog = mapContent?.RuntimeText?.menuCatalogByMapId?.[normalizedMapId];
  if (runtimeCatalog && typeof runtimeCatalog === "object") return runtimeCatalog;
  return null;
}

export function openMenu({ mapId, mode, catalog } = {}) {
  const normalizedMapId = normalizeId(mapId);
  if (!normalizedMapId || !catalog) return getSnapshot();
  clearShellTimers();
  clearTransitionTimers();
  clearPurchaseTimers();
  const nextMode = normalizeId(mode) || normalizeId(findCategoryForMode(catalog, null)?.mode) || "dine";
  const nextSnapshot = setState(buildNormalizedOpenState({
    open: true,
    mapId: normalizedMapId,
    mode: nextMode,
    categoryId: normalizeId(findCategoryForMode(catalog, nextMode)?.id),
    itemId: null,
    scrollTopByCategory: _menuState.mapId === normalizedMapId ? cloneScrollTopByCategory(_menuState.scrollTopByCategory) : Object.create(null),
    visualState: {
      ...createDefaultVisualState(),
      shellPhase: "opening"
    }
  }, catalog));
  _openTimer = setTimeout(() => {
    if (!_menuState.open || _menuState.visualState.shellPhase !== "opening") return;
    setState({
      ..._menuState,
      visualState: {
        ..._menuState.visualState,
        shellPhase: "open"
      }
    });
  }, OPEN_DURATION_MS);
  return nextSnapshot;
}

export function closeMenu() {
  if (!_menuState.open) return getSnapshot();
  clearShellTimers();
  clearTransitionTimers();
  clearPurchaseTimers();
  const nextSnapshot = setState({
    ..._menuState,
    visualState: {
      ..._menuState.visualState,
      shellPhase: "closing",
      bodyTransitionPhase: "idle",
      detailTransitionPhase: "idle",
      tabTransitioning: false,
      itemTransitioning: false,
      transitioningCategoryId: null,
      transitioningItemId: null,
      purchasePending: false,
      purchaseFailShake: false
    }
  });
  _closeTimer = setTimeout(() => {
    setState(createDefaultMenuState());
  }, CLOSE_DURATION_MS);
  return nextSnapshot;
}

export function selectCategory(categoryId, { catalog } = {}) {
  if (!_menuState.open || !catalog) return getSnapshot();
  if (_menuState.visualState.purchasePending) return getSnapshot();
  const resolvedCategory = findCategoryById(catalog, categoryId);
  if (!resolvedCategory) return getSnapshot();
  const resolvedCategoryId = normalizeId(resolvedCategory.id);
  if (!resolvedCategoryId || resolvedCategoryId === _menuState.categoryId) return getSnapshot();
  clearTransitionTimers();
  setState({
    ..._menuState,
    visualState: {
      ..._menuState.visualState,
      tabTransitioning: true,
      bodyTransitionPhase: "switch-out",
      detailTransitionPhase: "switch-out",
      transitioningCategoryId: resolvedCategoryId,
      transitioningItemId: null
    }
  });
  _tabOutTimer = setTimeout(() => {
    if (!_menuState.open || _menuState.visualState.shellPhase === "closing") return;
    const nextState = buildNormalizedOpenState({
      ..._menuState,
      categoryId: resolvedCategoryId,
      mode: normalizeId(resolvedCategory.mode) || _menuState.mode,
      itemId: null,
      visualState: {
        ..._menuState.visualState,
        tabTransitioning: true,
        bodyTransitionPhase: "switch-in",
        detailTransitionPhase: "switch-in",
        transitioningCategoryId: resolvedCategoryId,
        transitioningItemId: null
      }
    }, catalog);
    setState(nextState);
    _tabInTimer = setTimeout(() => {
      if (!_menuState.open) return;
      setState({
        ..._menuState,
        visualState: {
          ..._menuState.visualState,
          tabTransitioning: false,
          bodyTransitionPhase: "idle",
          detailTransitionPhase: "idle",
          transitioningCategoryId: null,
          transitioningItemId: null
        }
      });
    }, TAB_SWITCH_IN_MS);
  }, TAB_SWITCH_OUT_MS);
  return getSnapshot();
}

export function selectItem(itemId, { catalog } = {}) {
  if (!_menuState.open || !catalog) return getSnapshot();
  if (_menuState.visualState.purchasePending) return getSnapshot();
  const item = findItemById(catalog, itemId);
  if (!item) return getSnapshot();
  const itemCategoryId = normalizeId(item.categoryId);
  if (!itemCategoryId || itemCategoryId !== _menuState.categoryId) return getSnapshot();
  const nextItemId = normalizeId(item.id);
  if (!nextItemId || nextItemId === _menuState.itemId) return getSnapshot();
  clearTimer(_itemOutTimer);
  clearTimer(_itemInTimer);
  _itemOutTimer = setTimeout(() => {
    if (!_menuState.open || _menuState.visualState.shellPhase === "closing") return;
    setState({
      ..._menuState,
      itemId: nextItemId,
      visualState: {
        ..._menuState.visualState,
        itemTransitioning: true,
        detailTransitionPhase: "item-in",
        transitioningItemId: nextItemId
      }
    });
    _itemInTimer = setTimeout(() => {
      if (!_menuState.open) return;
      setState({
        ..._menuState,
        visualState: {
          ..._menuState.visualState,
          itemTransitioning: false,
          detailTransitionPhase: "idle",
          transitioningItemId: null
        }
      });
    }, ITEM_SWITCH_IN_MS);
  }, ITEM_SWITCH_OUT_MS);
  return setState({
    ..._menuState,
    visualState: {
      ..._menuState.visualState,
      itemTransitioning: true,
      detailTransitionPhase: "item-out",
      transitioningItemId: nextItemId
    }
  });
}

export function setMenuScrollTop(categoryId, scrollTop) {
  const normalizedCategoryId = normalizeId(categoryId);
  if (!_menuState.open || !normalizedCategoryId) return getSnapshot();
  const nextScrollTop = Math.max(0, Math.trunc(Number(scrollTop) || 0));
  const nextScrolls = cloneScrollTopByCategory(_menuState.scrollTopByCategory);
  nextScrolls[normalizedCategoryId] = nextScrollTop;
  return setState({
    ..._menuState,
    scrollTopByCategory: nextScrolls
  });
}

export function clearOnRouteChange(currentMapId) {
  const normalizedCurrentMapId = normalizeId(currentMapId);
  if (!_menuState.open) return false;
  if (_menuState.mapId && normalizedCurrentMapId === _menuState.mapId) return false;
  clearShellTimers();
  clearTransitionTimers();
  clearPurchaseTimers();
  setState(createDefaultMenuState(), { silent: true });
  return true;
}

export function beginPurchase() {
  if (!_menuState.open) return getSnapshot();
  clearPurchaseTimers();
  return setState({
    ..._menuState,
    visualState: {
      ..._menuState.visualState,
      purchasePending: true,
      purchaseFeedback: null,
      purchaseFeedbackText: "",
      purchaseFeedbackTone: null,
      purchaseFailShake: false
    }
  });
}

export function finishPurchase({ ok = false, text = "" } = {}) {
  if (!_menuState.open) return getSnapshot();
  clearPurchaseTimers();
  const kind = ok ? "success" : "fail";
  const nextFeedbackKey = Number(_menuState.visualState.purchaseFeedbackKey || 0) + 1;
  const nextSnapshot = setState({
    ..._menuState,
    visualState: {
      ..._menuState.visualState,
      purchasePending: false,
      purchaseFeedback: kind,
      purchaseFeedbackText: String(text || "").trim(),
      purchaseFeedbackTone: kind,
      purchaseFeedbackKey: nextFeedbackKey,
      purchaseFailShake: kind === "fail"
    }
  });
  if (kind === "fail") {
    _purchaseShakeTimer = setTimeout(() => {
      if (!_menuState.open) return;
      setState({
        ..._menuState,
        visualState: {
          ..._menuState.visualState,
          purchaseFailShake: false
        }
      });
    }, PURCHASE_FAIL_SHAKE_MS);
  }
  _feedbackTimer = setTimeout(() => {
    if (!_menuState.open || Number(_menuState.visualState.purchaseFeedbackKey || 0) !== nextFeedbackKey) return;
    setState({
      ..._menuState,
      visualState: {
        ..._menuState.visualState,
        purchaseFeedback: null,
        purchaseFeedbackText: "",
        purchaseFeedbackTone: null,
        purchaseFailShake: false
      }
    });
  }, kind === "success" ? PURCHASE_FEEDBACK_SUCCESS_MS : PURCHASE_FEEDBACK_FAIL_MS);
  return nextSnapshot;
}

export function subscribe(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

export function getSnapshot() {
  if (!_menuState.open) {
    return {
      ...DEFAULT_MENU_STATE,
      scrollTopByCategory: {},
      visualState: cloneVisualState(DEFAULT_MENU_STATE.visualState)
    };
  }

  return {
    open: true,
    mapId: _menuState.mapId,
    mode: _menuState.mode,
    categoryId: _menuState.categoryId,
    itemId: _menuState.itemId,
    scrollTopByCategory: { ..._menuState.scrollTopByCategory },
    visualState: cloneVisualState(_menuState.visualState)
  };
}