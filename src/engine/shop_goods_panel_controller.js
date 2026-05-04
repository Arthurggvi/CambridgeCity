const OPEN_DURATION_MS = 200;
const CLOSE_DURATION_MS = 160;
const ITEM_SWITCH_OUT_MS = 52;
const ITEM_SWITCH_IN_MS = 112;

const DEFAULT_VISUAL_STATE = Object.freeze({
  shellPhase: "closed",
  detailTransitionPhase: "idle",
  itemTransitioning: false,
  transitioningItemId: null,
  purchasePending: false
});

const _listeners = new Set();
let _panelState = createDefaultPanelState();
let _openTimer = null;
let _closeTimer = null;
let _itemOutTimer = null;
let _itemInTimer = null;
let _panelSessionSeq = 0;

function normalizeId(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function createDefaultVisualState() {
  return {
    shellPhase: "closed",
    detailTransitionPhase: "idle",
    itemTransitioning: false,
    transitioningItemId: null,
    purchasePending: false
  };
}

function cloneVisualState(source) {
  return {
    ...createDefaultVisualState(),
    ...(source && typeof source === "object" ? source : null)
  };
}

function normalizeScrollTopValue(scrollTop) {
  return Math.max(0, Math.trunc(Number(scrollTop || 0)));
}

function areVisualStatesEqual(left, right) {
  const leftVisual = cloneVisualState(left);
  const rightVisual = cloneVisualState(right);
  return leftVisual.shellPhase === rightVisual.shellPhase
    && leftVisual.detailTransitionPhase === rightVisual.detailTransitionPhase
    && leftVisual.itemTransitioning === rightVisual.itemTransitioning
    && leftVisual.transitioningItemId === rightVisual.transitioningItemId
    && leftVisual.purchasePending === rightVisual.purchasePending;
}

function normalizePanelState(nextState) {
  return {
    open: nextState?.open === true,
    mapId: normalizeId(nextState?.mapId),
    itemId: normalizeId(nextState?.itemId),
    sessionId: Math.max(0, Math.trunc(Number(nextState?.sessionId || 0))),
    scrollTop: normalizeScrollTopValue(nextState?.scrollTop),
    visualState: cloneVisualState(nextState?.visualState)
  };
}

function arePanelStatesEqual(left, right) {
  const leftState = normalizePanelState(left);
  const rightState = normalizePanelState(right);
  return leftState.open === rightState.open
    && leftState.mapId === rightState.mapId
    && leftState.itemId === rightState.itemId
    && leftState.sessionId === rightState.sessionId
    && leftState.scrollTop === rightState.scrollTop
    && areVisualStatesEqual(leftState.visualState, rightState.visualState);
}

function createDefaultPanelState() {
  return {
    open: false,
    mapId: null,
    itemId: null,
    sessionId: 0,
    scrollTop: 0,
    visualState: createDefaultVisualState()
  };
}

function clearTimer(timerId) {
  if (timerId) {
    clearTimeout(timerId);
  }
  return null;
}

function clearShellTimers() {
  _openTimer = clearTimer(_openTimer);
  _closeTimer = clearTimer(_closeTimer);
}

function clearItemTimers() {
  _itemOutTimer = clearTimer(_itemOutTimer);
  _itemInTimer = clearTimer(_itemInTimer);
}

function getCatalogItems(catalog) {
  return Array.isArray(catalog?.items) ? catalog.items : [];
}

function resolveNextItemId(catalog, preferredItemId = null) {
  const items = getCatalogItems(catalog);
  if (items.length === 0) return null;
  const preferred = preferredItemId
    ? items.find((item) => normalizeId(item?.id) === normalizeId(preferredItemId))
    : null;
  return normalizeId(preferred?.id || items[0]?.id);
}

function setState(nextState, { silent = false } = {}) {
  const normalizedState = normalizePanelState(nextState);
  if (arePanelStatesEqual(_panelState, normalizedState)) {
    return getSnapshot();
  }
  _panelState = normalizedState;
  if (!silent) {
    const snapshot = getSnapshot();
    for (const listener of _listeners) {
      try {
        listener(snapshot);
      } catch {
        // Keep local UI state resilient.
      }
    }
  }
  return getSnapshot();
}

export function getSnapshot() {
  return {
    open: _panelState.open,
    mapId: _panelState.mapId,
    itemId: _panelState.itemId,
    sessionId: _panelState.sessionId,
    scrollTop: _panelState.scrollTop,
    visualState: cloneVisualState(_panelState.visualState)
  };
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

export function openPanel({ mapId, catalog } = {}) {
  const normalizedMapId = normalizeId(mapId);
  if (!normalizedMapId || !catalog) return getSnapshot();
  clearShellTimers();
  clearItemTimers();
  const nextSessionId = _panelState.open
    ? Math.max(1, Number(_panelState.sessionId || 0))
    : ++_panelSessionSeq;
  const nextSnapshot = setState({
    open: true,
    mapId: normalizedMapId,
    itemId: resolveNextItemId(catalog, _panelState.mapId === normalizedMapId ? _panelState.itemId : null),
    sessionId: nextSessionId,
    scrollTop: _panelState.mapId === normalizedMapId ? _panelState.scrollTop : 0,
    visualState: {
      ...createDefaultVisualState(),
      shellPhase: "opening"
    }
  });

  _openTimer = setTimeout(() => {
    if (!_panelState.open || _panelState.visualState.shellPhase !== "opening") return;
    setState({
      ..._panelState,
      visualState: {
        ..._panelState.visualState,
        shellPhase: "open"
      }
    });
  }, OPEN_DURATION_MS);

  return nextSnapshot;
}

export function closePanel() {
  if (!_panelState.open) return getSnapshot();
  clearShellTimers();
  clearItemTimers();
  const nextSnapshot = setState({
    ..._panelState,
    visualState: {
      ..._panelState.visualState,
      shellPhase: "closing",
      detailTransitionPhase: "idle",
      itemTransitioning: false,
      transitioningItemId: null
    }
  });
  _closeTimer = setTimeout(() => {
    setState(createDefaultPanelState());
  }, CLOSE_DURATION_MS);
  return nextSnapshot;
}

export function selectItem(itemId, { catalog } = {}) {
  if (!_panelState.open || !catalog) return getSnapshot();
  if (_panelState.visualState.purchasePending === true) return getSnapshot();
  const nextItemId = resolveNextItemId(catalog, itemId);
  if (!nextItemId || nextItemId === _panelState.itemId) return getSnapshot();
  clearItemTimers();
  setState({
    ..._panelState,
    visualState: {
      ..._panelState.visualState,
      itemTransitioning: true,
      detailTransitionPhase: "item-out",
      transitioningItemId: nextItemId
    }
  });
  _itemOutTimer = setTimeout(() => {
    if (!_panelState.open || _panelState.visualState.shellPhase === "closing") return;
    setState({
      ..._panelState,
      itemId: nextItemId,
      visualState: {
        ..._panelState.visualState,
        itemTransitioning: true,
        detailTransitionPhase: "item-in",
        transitioningItemId: nextItemId
      }
    });
    _itemInTimer = setTimeout(() => {
      if (!_panelState.open) return;
      setState({
        ..._panelState,
        visualState: {
          ..._panelState.visualState,
          itemTransitioning: false,
          detailTransitionPhase: "idle",
          transitioningItemId: null
        }
      });
    }, ITEM_SWITCH_IN_MS);
  }, ITEM_SWITCH_OUT_MS);
  return getSnapshot();
}

export function setPanelScrollTop(scrollTop, options = {}) {
  if (!_panelState.open) return getSnapshot();
  const nextScrollTop = normalizeScrollTopValue(scrollTop);
  if (nextScrollTop === _panelState.scrollTop) {
    return getSnapshot();
  }
  const silent = options?.silent === true || options?.notify === false;
  return setState({
    ..._panelState,
    scrollTop: nextScrollTop
  }, { silent });
}

export function beginPurchase() {
  if (!_panelState.open) return getSnapshot();
  return setState({
    ..._panelState,
    visualState: {
      ..._panelState.visualState,
      purchasePending: true
    }
  });
}

export function finishPurchase() {
  if (!_panelState.open) return getSnapshot();
  return setState({
    ..._panelState,
    visualState: {
      ..._panelState.visualState,
      purchasePending: false
    }
  });
}

export function clearOnRouteChange(currentMapId) {
  const normalizedCurrentMapId = normalizeId(currentMapId);
  if (!_panelState.open) return false;
  if (_panelState.mapId && normalizedCurrentMapId === _panelState.mapId) return false;
  clearShellTimers();
  clearItemTimers();
  setState(createDefaultPanelState(), { silent: true });
  return true;
}
