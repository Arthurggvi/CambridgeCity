import { UI_OVERLAY_TYPES } from "./ui_route.js";

const TRACE_MAX = 240;

export const TRANSITION_SURFACE_KINDS = Object.freeze({
  MENU_LIKE: "menu-like",
  MAP_SCENE: "map-scene",
  MAP_OVERLAY: "map-overlay",
  MODAL: "modal",
  UNKNOWN: "unknown"
});

function isMenuLikeMapId(mapId) {
  const id = String(mapId || "").trim();
  if (!id) return false;
  return id === "menu" || id === "menu_more" || id.startsWith("menu_");
}

function normalizeSurfaceLike(input = {}) {
  const pageType = String(input.pageType || "").trim() || null;
  const overlayType = input.overlayType == null ? null : String(input.overlayType || "").trim() || null;
  const modalType = input.modalType == null ? null : String(input.modalType || "").trim() || null;
  const mapId = String(input.mapId || "").trim() || null;
  return {
    pageType,
    overlayType,
    modalType,
    mapId
  };
}

export function deriveCommittedSurfaceSnapshot(input = {}) {
  const normalized = normalizeSurfaceLike(input);
  const mapId = String(normalized.mapId || "").trim();
  const pageType = String(normalized.pageType || "").trim();
  const overlayType = normalized.overlayType == null ? null : String(normalized.overlayType || "").trim() || null;
  const modalType = normalized.modalType == null ? null : String(normalized.modalType || "").trim() || null;

  const isMenuLike = isMenuLikeMapId(mapId) || pageType === "menu";
  const isOverlayLike = !!overlayType;
  const isModalLike = !!modalType;
  const isGameplayLike = !isMenuLike && !isOverlayLike && !isModalLike && pageType === "map";

  return {
    mapId: mapId || null,
    pageType: pageType || null,
    overlayType,
    modalType,
    isMenuLike,
    isOverlayLike,
    isModalLike,
    isGameplayLike
  };
}

export function shouldPlayMenuCinematicFromSurfaceDelta(prevSurface, nextSurface) {
  const prev = deriveCommittedSurfaceSnapshot(prevSurface || {});
  const next = deriveCommittedSurfaceSnapshot(nextSurface || {});
  return prev.isMenuLike && next.isGameplayLike;
}

function resolveSurfaceKind(context) {
  const pageType = String(context.pageType || "").trim();
  const overlayType = context.overlayType == null ? "" : String(context.overlayType || "").trim();
  const modalType = context.modalType == null ? "" : String(context.modalType || "").trim();

  const prevSurface = normalizeSurfaceLike(context.prevSurface || {});
  const nextSurface = normalizeSurfaceLike(context.nextSurface || {});
  const prevCommitted = deriveCommittedSurfaceSnapshot(prevSurface);
  const nextCommitted = deriveCommittedSurfaceSnapshot({
    mapId: nextSurface.mapId,
    pageType: nextSurface.pageType || pageType,
    overlayType: nextSurface.overlayType,
    modalType: nextSurface.modalType
  });

  const hasModal = !!modalType || !!prevSurface.modalType || !!nextSurface.modalType;
  if (hasModal) return TRANSITION_SURFACE_KINDS.MODAL;

  const overlay = overlayType || nextSurface.overlayType || prevSurface.overlayType || "";
  if (overlay === "tasks" || overlay === "inventory" || overlay === UI_OVERLAY_TYPES.MAP_MINIMAP || !!overlay) {
    return TRANSITION_SURFACE_KINDS.MAP_OVERLAY;
  }

  const prevIsMenuLike = prevCommitted.isMenuLike;
  const nextIsMenuLike = nextCommitted.isMenuLike;

  if (prevIsMenuLike && nextIsMenuLike) return TRANSITION_SURFACE_KINDS.MENU_LIKE;

  if (!nextIsMenuLike && (pageType || nextSurface.pageType || prevSurface.pageType) === "map" && !overlay) {
    return TRANSITION_SURFACE_KINDS.MAP_SCENE;
  }

  if (prevIsMenuLike || nextIsMenuLike) return TRANSITION_SURFACE_KINDS.MENU_LIKE;

  return TRANSITION_SURFACE_KINDS.UNKNOWN;
}

function getTraceBuffer() {
  if (typeof window === "undefined") return null;
  if (!Array.isArray(window.__TRANSITION_POLICY_TRACE__)) {
    window.__TRANSITION_POLICY_TRACE__ = [];
  }
  return window.__TRANSITION_POLICY_TRACE__;
}

function pushTransitionPolicyTrace(entry) {
  const trace = getTraceBuffer();
  if (!trace) return;
  trace.push({
    ts: new Date().toISOString(),
    ...entry
  });
  if (trace.length > TRACE_MAX) {
    trace.splice(0, trace.length - TRACE_MAX);
  }
}

export function resolveTransitionPolicy(context = {}) {
  const prevSurface = normalizeSurfaceLike(context.prevSurface || {});
  const nextSurface = normalizeSurfaceLike(context.nextSurface || {});
  const resolvedContext = {
    actionId: String(context.actionId || ""),
    prevMapId: String(context.prevMapId || prevSurface.mapId || ""),
    nextMapId: String(context.nextMapId || nextSurface.mapId || ""),
    prevSurface,
    nextSurface,
    pageType: String(context.pageType || nextSurface.pageType || prevSurface.pageType || ""),
    overlayType: context.overlayType ?? nextSurface.overlayType ?? prevSurface.overlayType ?? null,
    modalType: context.modalType ?? nextSurface.modalType ?? prevSurface.modalType ?? null
  };

  const surfaceKind = resolveSurfaceKind(resolvedContext);

  let allowCinematic = false;
  let allowPanelEnter = false;
  let allowOverlayTransition = false;
  let mode = "none";

  if (surfaceKind === TRANSITION_SURFACE_KINDS.MENU_LIKE) {
    allowCinematic = false;
    allowPanelEnter = false;
    allowOverlayTransition = false;
    mode = "none";
  } else if (surfaceKind === TRANSITION_SURFACE_KINDS.MAP_SCENE) {
    allowCinematic = true;
    allowPanelEnter = false;
    allowOverlayTransition = false;
    mode = "cinematic";
  } else if (surfaceKind === TRANSITION_SURFACE_KINDS.MAP_OVERLAY) {
    allowCinematic = false;
    allowPanelEnter = false;
    allowOverlayTransition = true;
    mode = "overlay";
  } else if (surfaceKind === TRANSITION_SURFACE_KINDS.MODAL) {
    allowCinematic = false;
    allowPanelEnter = true;
    allowOverlayTransition = false;
    mode = "panel";
  }

  const policy = {
    surfaceKind,
    allowCinematic,
    allowPanelEnter,
    allowOverlayTransition,
    mode
  };

  pushTransitionPolicyTrace({
    event: "transition_policy_resolved",
    actionId: resolvedContext.actionId,
    prevMapId: resolvedContext.prevMapId,
    nextMapId: resolvedContext.nextMapId,
    surfaceKind,
    mode,
    allowCinematic,
    allowPanelEnter,
    allowOverlayTransition
  });

  return policy;
}
