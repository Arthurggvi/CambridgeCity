const minimapViewportUiState = {
  staticFocusZoomExperimentEnabled: false,
};

function clampZoom(value) {
  return Math.max(1.10, Math.min(1.18, Number(value) || 1.10));
}

function resolveViewportScale(spec, activeNodeId) {
  const currentId = String(activeNodeId || "");
  if (!currentId) return 1.00;

  const branchOf = spec?.branchOf || {};
  if (branchOf[currentId]) {
    return clampZoom(1.16);
  }

  const mainPathOrder = Array.isArray(spec?.mainPathOrder) ? spec.mainPathOrder : [];
  if (mainPathOrder.includes(currentId)) {
    return clampZoom(1.12);
  }

  return clampZoom(1.10);
}

function resolveTransformOrigin(positions, activeNodeId) {
  if (!(positions instanceof Map)) {
    return { x: 0, y: 0 };
  }
  const pos = positions.get(String(activeNodeId || ""));
  return {
    x: Number(pos?.x) || 0,
    y: Number(pos?.y) || 0,
  };
}

export function setMiniMapStaticFocusZoomExperimentEnabled(enabled) {
  minimapViewportUiState.staticFocusZoomExperimentEnabled = !!enabled;
  return minimapViewportUiState.staticFocusZoomExperimentEnabled;
}

export function isMiniMapStaticFocusZoomExperimentEnabled() {
  return minimapViewportUiState.staticFocusZoomExperimentEnabled;
}

export function readMiniMapViewportSnapshot({ spec, activeNodeId, positions }) {
  const specId = String(spec?.specId || "");
  const currentNodeId = String(activeNodeId || "");
  const transformOrigin = resolveTransformOrigin(positions, currentNodeId);
  const enabled = isMiniMapStaticFocusZoomExperimentEnabled()
    && !!specId
    && !!currentNodeId
    && Number.isFinite(transformOrigin.x)
    && Number.isFinite(transformOrigin.y)
    && transformOrigin.x > 0
    && transformOrigin.y > 0;

  return Object.freeze({
    specId,
    activeNodeId: currentNodeId,
    zoom: enabled ? resolveViewportScale(spec, currentNodeId) : 1.00,
    transformOrigin,
    enabled,
  });
}