import { getCanonicalCurrentMap, getCanonicalMapId as readCanonicalMapId } from "./map_context.js";
import { resolveCurrentMiniMapBranch } from "./minimap/minimap_spec_registry.js";

const UI_ROUTE_TRACE_MAX = 200;
const UI_OVERLAY_TRACE_MAX = 200;
const UI_ACTION_DIFF_MAX = 200;
const UI_OPEN_CALLCHAIN_MAX = 200;

export const UI_OVERLAY_TYPES = Object.freeze({
  MAP_MINIMAP: "map_minimap",
  INVENTORY: "inventory",
  TASKS: "tasks"
});

export const UI_ROOT_TYPES = Object.freeze({
  MENU: "menu",
  MAP: "map"
});

export const CANONICAL_UI_PAGE_MAP = "map";

export const CANONICAL_UI_CONTRACT = Object.freeze({
  page: CANONICAL_UI_PAGE_MAP,
  overlay: null,
  modal: null
});

const VALID_OVERLAYS = new Set([
  UI_OVERLAY_TYPES.MAP_MINIMAP,
  UI_OVERLAY_TYPES.INVENTORY,
  UI_OVERLAY_TYPES.TASKS
]);

function isMenuMapId(mapId) {
  const id = String(mapId || "");
  return id === "menu" || id === "menu_more" || id.startsWith("menu_");
}

/** Overlay routing only; full VM availability is finalized in renderer. */
export function isWildernessRuntimeMiniMapAvailable(currentMapId, stateOrUiContext = null) {
  void stateOrUiContext;
  return String(currentMapId || "").trim() === "wilderness_runtime";
}

export function getCanonicalMapId(state) {
  return readCanonicalMapId(state);
}

export function normalizeUiOverlay(value) {
  const text = String(value || "").trim();
  return VALID_OVERLAYS.has(text) ? text : null;
}

export function readCriticalUiGateMode(state) {
  if (state?.player?.exposure?.dead === true) return "DEAD";
  const collapseMode = String(state?.player?.meta?.sleepEpisode?.mode || "").toUpperCase();
  if (collapseMode === "COLLAPSE") return "COLLAPSE";
  return "NORMAL";
}

export function resolveEffectiveUiOverlay(canonicalUi, currentMapId, criticalGateMode = "NORMAL", currentMap = null) {
  const page = String(canonicalUi?.page || "").trim();
  if (page !== CANONICAL_UI_PAGE_MAP) return null;
  if (isMenuMapId(currentMapId)) return null;
  if (criticalGateMode === "DEAD" || criticalGateMode === "COLLAPSE") return null;

  const minimapDisabled = currentMap?.ui && typeof currentMap.ui === "object" && currentMap.ui.minimap === false;
  const explicitOverlay = normalizeUiOverlay(canonicalUi?.overlay);
  if (explicitOverlay === UI_OVERLAY_TYPES.MAP_MINIMAP && minimapDisabled) {
    return null;
  }
  if (explicitOverlay) return explicitOverlay;

  if (minimapDisabled) {
    return null;
  }

  if (isWildernessRuntimeMiniMapAvailable(currentMapId)) {
    return UI_OVERLAY_TYPES.MAP_MINIMAP;
  }

  const minimapBranch = resolveCurrentMiniMapBranch(currentMapId, currentMap);
  return minimapBranch ? UI_OVERLAY_TYPES.MAP_MINIMAP : null;
}

export function normalizeUiRouteState(state) {
  if (!state || typeof state !== "object") return;
  if (!state.ui || typeof state.ui !== "object") state.ui = {};

  const legacyPage = String(state.ui.page || "").trim();
  const normalizedOverlay = normalizeUiOverlay(state.ui.overlay);
  const derivedOverlay = normalizedOverlay
    || (legacyPage === "inventory" ? "inventory" : null)
    || (legacyPage === "tasks" || legacyPage === "memo" ? "tasks" : null);

  state.ui.page = CANONICAL_UI_PAGE_MAP;
  state.ui.overlay = derivedOverlay;
  if (!Object.prototype.hasOwnProperty.call(state.ui, "modal") || state.ui.modal === undefined) {
    state.ui.modal = null;
  }
}

export function readCanonicalUiState(state) {
  const ui = state?.ui;
  return {
    page: CANONICAL_UI_PAGE_MAP,
    overlay: normalizeUiOverlay(ui?.overlay),
    modal: ui?.modal ?? null
  };
}

export function normalizeCanonicalUiState(state) {
  normalizeUiRouteState(state);
  return readCanonicalUiState(state);
}

export function getUiRouteSnapshot(state) {
  getCanonicalCurrentMap(state, { source: "ui_route:getUiRouteSnapshot", repairState: true });
  const canonicalUi = readCanonicalUiState(state);
  const rawUiPage = String(state?.ui?.page || "");
  const rawUiOverlay = String(state?.ui?.overlay || "");
  return {
    uiPage: canonicalUi.page,
    uiOverlay: canonicalUi.overlay,
    uiModal: canonicalUi.modal,
    rawUiPage,
    rawUiOverlay,
    currentMapId: getCanonicalMapId(state),
    currentSceneId: String(state?.currentScene?.id || state?.currentSceneId || "") || null
  };
}

function getTraceBuffer() {
  if (typeof window === "undefined") return null;
  if (!Array.isArray(window.__UI_ROUTE_TRACE__)) {
    window.__UI_ROUTE_TRACE__ = [];
  }
  return window.__UI_ROUTE_TRACE__;
}

export function pushUiRouteTrace(entry) {
  const buffer = getTraceBuffer();
  if (!buffer) return;
  const errMsg = entry?.errorMessage ?? null;
  buffer.push({
    ts: new Date().toISOString(),
    ...entry,
    "error.message": errMsg
  });
  if (buffer.length > UI_ROUTE_TRACE_MAX) {
    buffer.splice(0, buffer.length - UI_ROUTE_TRACE_MAX);
  }
}

function getOverlayTraceBuffer() {
  if (typeof window === "undefined") return null;
  if (!Array.isArray(window.__UI_OVERLAY_TRACE__)) {
    window.__UI_OVERLAY_TRACE__ = [];
  }
  return window.__UI_OVERLAY_TRACE__;
}

export function pushUiOverlayTrace(entry) {
  const buffer = getOverlayTraceBuffer();
  if (!buffer) return;
  const errMsg = entry?.errorMessage ?? null;
  const row = {
    ts: new Date().toISOString(),
    source: String(entry?.source || ""),
    actionId: entry?.actionId ?? "",
    "prev.ui.page": entry?.prevUiPage ?? null,
    "next.ui.page": entry?.nextUiPage ?? null,
    "prev.ui.overlay": entry?.prevUiOverlay ?? null,
    "next.ui.overlay": entry?.nextUiOverlay ?? null,
    resolvedOverlay: entry?.resolvedOverlay ?? entry?.resolvedOverlayType ?? null,
    renderedOverlay: entry?.renderedOverlay ?? null,
    hostId: entry?.hostId ?? null,
    currentMapId: entry?.currentMapId ?? entry?.nextCurrentMapId ?? null,
    currentSceneId: entry?.currentSceneId ?? entry?.nextCurrentSceneId ?? null,
    violationCode: entry?.violationCode ?? null,
    "error.message": errMsg,
    errorMessage: errMsg
  };
  buffer.push(row);
  if (buffer.length > UI_OVERLAY_TRACE_MAX) {
    buffer.splice(0, buffer.length - UI_OVERLAY_TRACE_MAX);
  }
}

function toLegacyFlag(value, fallback = false) {
  if (typeof value === "boolean") return value;
  return !!fallback;
}

export function getUiActionStateSnapshot(state) {
  const page = String(state?.ui?.page || "");
  const panelRaw = state?.ui?.panel;
  return {
    uiPage: page,
    uiOverlay: normalizeUiOverlay(state?.ui?.overlay),
    uiPanel: panelRaw == null ? null : String(panelRaw),
    legacyInventoryFlag: toLegacyFlag(state?.ui?.inventoryOpen, page === "inventory"),
    legacyTasksFlag: toLegacyFlag(state?.ui?.tasksOpen, page === "tasks"),
    legacyMemoFlag: toLegacyFlag(state?.ui?.memoOpen, page === "memo"),
    currentMapId: getCanonicalMapId(state),
    currentSceneId: String(state?.currentScene?.id || state?.currentSceneId || "") || null
  };
}

export function didCanonicalUiDeltaOccur(prevSnapshot, nextSnapshot) {
  const prevPage = String(prevSnapshot?.uiPage || "");
  const nextPage = String(nextSnapshot?.uiPage || "");
  const prevOverlay = String(prevSnapshot?.uiOverlay || "");
  const nextOverlay = String(nextSnapshot?.uiOverlay || "");
  return prevPage !== nextPage || prevOverlay !== nextOverlay;
}

function getUiActionDiffBuffer() {
  if (typeof window === "undefined") return null;
  if (!Array.isArray(window.__UI_ACTION_DIFF__)) {
    window.__UI_ACTION_DIFF__ = [];
  }
  return window.__UI_ACTION_DIFF__;
}

export function pushUiActionDiff(entry) {
  const buffer = getUiActionDiffBuffer();
  if (!buffer) return;
  const errMsg = entry?.errorMessage ?? null;
  const prev = entry?.prev || null;
  const next = entry?.next || null;
  const didDelta = entry?.didCanonicalDeltaOccur ?? didCanonicalUiDeltaOccur(prev, next);
  buffer.push({
    ts: new Date().toISOString(),
    stage: String(entry?.stage || entry?.source || ""),
    actionId: String(entry?.actionId || ""),
    "prev.ui.page": prev?.uiPage ?? null,
    "next.ui.page": next?.uiPage ?? null,
    "prev.ui.overlay": prev?.uiOverlay ?? null,
    "next.ui.overlay": next?.uiOverlay ?? null,
    "prev.ui.panel": prev?.uiPanel ?? null,
    "next.ui.panel": next?.uiPanel ?? null,
    "prev.legacy.inventory": prev?.legacyInventoryFlag ?? null,
    "next.legacy.inventory": next?.legacyInventoryFlag ?? null,
    "prev.legacy.tasks": prev?.legacyTasksFlag ?? null,
    "next.legacy.tasks": next?.legacyTasksFlag ?? null,
    "prev.legacy.memo": prev?.legacyMemoFlag ?? null,
    "next.legacy.memo": next?.legacyMemoFlag ?? null,
    resolvedRoute: entry?.resolvedRoute ?? null,
    renderedRoute: entry?.renderedRoute ?? null,
    didCanonicalDeltaOccur: !!didDelta,
    violationCode: entry?.violationCode ?? null,
    "error.message": errMsg,
    errorMessage: errMsg
  });
  if (buffer.length > UI_ACTION_DIFF_MAX) {
    buffer.splice(0, buffer.length - UI_ACTION_DIFF_MAX);
  }
}

function getUiOpenCallchainBuffer() {
  if (typeof window === "undefined") return null;
  if (!Array.isArray(window.__UI_OPEN_CALLCHAIN__)) {
    window.__UI_OPEN_CALLCHAIN__ = [];
  }
  return window.__UI_OPEN_CALLCHAIN__;
}

export function pushUiOpenCallchain(entry) {
  const buffer = getUiOpenCallchainBuffer();
  if (!buffer) return;
  const prev = entry?.prev || null;
  const next = entry?.next || null;
  const errMsg = entry?.errorMessage ?? null;
  const row = {
    ts: new Date().toISOString(),
    actionId: String(entry?.actionId || ""),
    actionType: entry?.actionType ?? null,
    source: String(entry?.source || entry?.stage || ""),
    resolveEntered: !!entry?.resolveEntered,
    resolveExited: !!entry?.resolveExited,
    resolveResultType: entry?.resolveResultType ?? null,
    resolveResultKeys: Array.isArray(entry?.resolveResultKeys) ? entry.resolveResultKeys : [],
    commitEntered: !!entry?.commitEntered,
    commitExited: !!entry?.commitExited,
    "prev.ui.page": prev?.uiPage ?? null,
    "next.ui.page": next?.uiPage ?? null,
    "prev.ui.overlay": prev?.uiOverlay ?? null,
    "next.ui.overlay": next?.uiOverlay ?? null,
    "prev.legacy.inventory": prev?.legacyInventoryFlag ?? null,
    "next.legacy.inventory": next?.legacyInventoryFlag ?? null,
    "prev.legacy.tasks": prev?.legacyTasksFlag ?? null,
    "next.legacy.tasks": next?.legacyTasksFlag ?? null,
    "prev.legacy.memo": prev?.legacyMemoFlag ?? null,
    "next.legacy.memo": next?.legacyMemoFlag ?? null,
    canonicalSetterCalled: !!entry?.canonicalSetterCalled,
    canonicalSelectorResult: entry?.canonicalSelectorResult ?? null,
    renderedSurface: entry?.renderedSurface ?? null,
    violationCode: entry?.violationCode ?? null,
    "error.message": errMsg,
    errorMessage: errMsg
  };
  buffer.push(row);
  const source = String(row.source || "");
  const shouldLog = source === "click:ui_open"
    || source === "dispatch:start"
    || source === "resolve:start"
    || source === "resolve:end"
    || source === "commit:start"
    || source === "commit:end"
    || source === "ui_route:set"
    || source === "ui_route:select"
    || source === "render:surface"
    || source === "UI_GLOBAL_ACTION_NO_COMMIT"
    || source === "UI_ACTION_NO_CANONICAL_DELTA";
  if (shouldLog && typeof console !== "undefined") {
    const brief = `actionId=${row.actionId || ""} prev=${row["prev.ui.page"] || ""}/${row["prev.ui.overlay"] || ""} next=${row["next.ui.page"] || ""}/${row["next.ui.overlay"] || ""}`;
    if (source === "UI_GLOBAL_ACTION_NO_COMMIT" || source === "UI_ACTION_NO_CANONICAL_DELTA") {
      console.error(`[UIOpenCallchain] ${source} ${brief}`, row);
    } else {
      console.warn(`[UIOpenCallchain] ${source} ${brief}`, row);
    }
  }
  if (buffer.length > UI_OPEN_CALLCHAIN_MAX) {
    buffer.splice(0, buffer.length - UI_OPEN_CALLCHAIN_MAX);
  }
}

export function resolveUiSurface(state, meta = {}) {
  const snapshot = getUiRouteSnapshot(state);
  const rootType = isMenuMapId(snapshot.currentMapId) ? UI_ROOT_TYPES.MENU : UI_ROOT_TYPES.MAP;
  const criticalGateMode = readCriticalUiGateMode(state);
  const currentMap = getCanonicalCurrentMap(state, { source: String(meta?.source || "route_resolve"), repairState: true });
  const overlayType = resolveEffectiveUiOverlay({
    page: snapshot.uiPage,
    overlay: snapshot.uiOverlay,
    modal: snapshot.uiModal
  }, snapshot.currentMapId, criticalGateMode, currentMap);
  const hostType = rootType === UI_ROOT_TYPES.MENU ? "menu_host" : "map_host";
  const violations = [];

  if (snapshot.rawUiPage && snapshot.rawUiPage !== CANONICAL_UI_PAGE_MAP) {
    violations.push("legacy_ui_page_mode");
  }
  if (rootType === UI_ROOT_TYPES.MENU && overlayType) {
    violations.push("menu_and_map_overlay_conflict");
  }
  if (overlayType && !VALID_OVERLAYS.has(overlayType)) {
    violations.push("unknown_overlay_type");
  }

  const resolved = {
    rootType,
    pageType: rootType,
    overlayType: rootType === UI_ROOT_TYPES.MAP ? overlayType : null,
    hostType,
    mapId: snapshot.currentMapId,
    sceneId: snapshot.currentSceneId,
    showMapActions: rootType === UI_ROOT_TYPES.MAP,
    showOverlayHost: rootType === UI_ROOT_TYPES.MAP && !!overlayType,
    uiPage: snapshot.uiPage,
    uiOverlay: rootType === UI_ROOT_TYPES.MAP ? overlayType : null,
    violations
  };

  if (violations.length > 0) {
    pushUiRouteTrace({
      actionId: String(meta.actionId || ""),
      source: String(meta.source || "route_resolve"),
      prev: meta.prev || null,
      next: meta.next || snapshot,
      prevUiPage: meta.prev?.uiPage ?? null,
      nextUiPage: snapshot.uiPage,
      prevUiOverlay: meta.prev?.uiOverlay ?? null,
      nextUiOverlay: resolved.uiOverlay,
      prevCurrentMapId: meta.prev?.currentMapId ?? null,
      nextCurrentMapId: snapshot.currentMapId,
      prevCurrentSceneId: meta.prev?.currentSceneId ?? null,
      nextCurrentSceneId: snapshot.currentSceneId,
      resolvedPageType: resolved.pageType,
      resolvedOverlayType: resolved.overlayType,
      renderHost: resolved.hostType,
      violationCode: "route_contract_violation",
      errorMessage: violations.join(",")
    });
  }

  return resolved;
}
