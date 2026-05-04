function normalizeMapId(value) {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
}

function ensureStateContainers(state) {
  if (!state || typeof state !== "object") {
    return false;
  }
  if (!state.world || typeof state.world !== "object") {
    state.world = {};
  }
  return true;
}

function summarizeMapContext(state) {
  return {
    currentMapId: normalizeMapId(state?.currentMapId),
    worldCurrentMapId: normalizeMapId(state?.world?.currentMapId),
    currentMapObjectId: normalizeMapId(state?.currentMap?.id),
    canonicalMapId: getCanonicalMapId(state)
  };
}

function logMapContext(level, message, details) {
  if (typeof console === "undefined") {
    return;
  }
  const logger = typeof console[level] === "function" ? console[level].bind(console) : console.log.bind(console);
  logger(`[MapContext] ${message}`, details);
}

export function getCanonicalMapId(state) {
  return normalizeMapId(state?.currentMapId)
    || normalizeMapId(state?.world?.currentMapId)
    || normalizeMapId(state?.currentMap?.id);
}

export function setCanonicalMapContext(state, mapId, map, source = "unknown") {
  if (!ensureStateContainers(state)) {
    return { mapId: "", map: null, source };
  }

  const explicitMapId = normalizeMapId(mapId);
  const nextMap = map && typeof map === "object" ? map : null;
  const nextMapObjectId = normalizeMapId(nextMap?.id);
  const resolvedMapId = explicitMapId || nextMapObjectId || getCanonicalMapId(state);
  let resolvedMap = nextMap;

  if (resolvedMap && resolvedMapId && nextMapObjectId && nextMapObjectId !== resolvedMapId) {
    logMapContext("warn", `setCanonicalMapContext mismatch source=${source}`, {
      source,
      requestedMapId: explicitMapId || null,
      mapObjectId: nextMapObjectId,
      ...summarizeMapContext(state)
    });
    resolvedMap = null;
  }

  state.currentMapId = resolvedMapId || "";
  state.world.currentMapId = resolvedMapId || "";
  state.currentMap = resolvedMap || null;

  return {
    mapId: state.currentMapId,
    map: state.currentMap,
    source
  };
}

export function getCanonicalCurrentMap(state, options = {}) {
  const { source = "unknown", repairState = true } = options;
  if (!ensureStateContainers(state)) {
    return null;
  }

  const canonicalMapId = getCanonicalMapId(state);
  const loadedMap = state.currentMap && typeof state.currentMap === "object" ? state.currentMap : null;
  const loadedMapId = normalizeMapId(loadedMap?.id);

  if (!canonicalMapId) {
    if (loadedMap && loadedMapId && repairState) {
      setCanonicalMapContext(state, loadedMapId, loadedMap, `${source}:promote_loaded_map`);
    }
    return loadedMap;
  }

  if (!loadedMap) {
    if (repairState && (state.currentMapId !== canonicalMapId || state.world.currentMapId !== canonicalMapId)) {
      setCanonicalMapContext(state, canonicalMapId, null, `${source}:sync_ids_without_map`);
    }
    return null;
  }

  if (loadedMapId === canonicalMapId) {
    if (repairState && (state.currentMapId !== canonicalMapId || state.world.currentMapId !== canonicalMapId)) {
      setCanonicalMapContext(state, canonicalMapId, loadedMap, `${source}:sync_ids_with_map`);
    }
    return loadedMap;
  }

  logMapContext("warn", `currentMap mismatch source=${source}`, {
    source,
    ...summarizeMapContext(state)
  });

  if (repairState) {
    setCanonicalMapContext(state, canonicalMapId, null, `${source}:drop_stale_map`);
  }
  return null;
}
