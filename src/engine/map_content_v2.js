function normalizeId(value) {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
}

function clonePlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : null;
}

export const MAP_CONTENT_V2 = 2;

export const V2_INTERACTION_TYPES = Object.freeze({
  OBSERVE: "OBSERVE",
  REST: "REST",
  TRANSITION: "TRANSITION",
  MENU_OPEN: "MENU_OPEN",
  PURCHASE: "PURCHASE",
  TIME_SKIP: "TIME_SKIP"
});

export function isMapContentV2(map) {
  return Number(map?.contentVersion || 0) === MAP_CONTENT_V2;
}

export function isLegacyMapContent(map) {
  return !isMapContentV2(map);
}

export function getEntrySceneIdV2(map) {
  if (!isMapContentV2(map)) return "";
  return normalizeId(map.entrySceneId);
}

export function getScenesV2(map) {
  return Array.isArray(map?.scenes) ? map.scenes : [];
}

export function getInteractionsV2(map) {
  return Array.isArray(map?.interactions) ? map.interactions : [];
}

export function getEdgesV2(map) {
  return Array.isArray(map?.edges) ? map.edges : [];
}

export function getSceneByIdV2(map, sceneId) {
  const id = normalizeId(sceneId);
  if (!id) return null;
  return getScenesV2(map).find((scene) => normalizeId(scene?.id) === id) || null;
}

export function getEdgeByIdV2(map, edgeId) {
  const id = normalizeId(edgeId);
  if (!id) return null;
  return getEdgesV2(map).find((edge) => normalizeId(edge?.id) === id) || null;
}

export function resolveCurrentMapV2(state, options = {}) {
  const map = options?.map && typeof options.map === "object" ? options.map : state?.currentMap;
  return isMapContentV2(map) ? map : null;
}

export function resolveCurrentSceneV2(state, map = null) {
  const resolvedMap = resolveCurrentMapV2(state, { map });
  if (!resolvedMap) {
    return {
      map: null,
      scene: null,
      sceneId: ""
    };
  }

  const currentSceneId = normalizeId(state?.currentScene?.id)
    || normalizeId(state?.currentSceneId)
    || getEntrySceneIdV2(resolvedMap);
  const scene = getSceneByIdV2(resolvedMap, currentSceneId)
    || getSceneByIdV2(resolvedMap, getEntrySceneIdV2(resolvedMap));

  return {
    map: resolvedMap,
    scene,
    sceneId: normalizeId(scene?.id)
  };
}

export function ensureCurrentSceneV2(state, map = null, source = "unknown") {
  const resolved = resolveCurrentSceneV2(state, map);
  if (!resolved.map) {
    if (state && typeof state === "object") {
      state.currentSceneId = null;
      state.currentScene = null;
    }
    return {
      ...resolved,
      source,
      updated: false
    };
  }

  const nextSceneId = normalizeId(resolved.scene?.id);
  const currentSceneId = normalizeId(state?.currentSceneId);
  const currentSceneObjectId = normalizeId(state?.currentScene?.id);
  const updated = currentSceneId !== nextSceneId || currentSceneObjectId !== nextSceneId;

  state.currentSceneId = nextSceneId || null;
  state.currentScene = resolved.scene ? { ...resolved.scene } : null;

  return {
    ...resolved,
    source,
    updated
  };
}

export function collectSceneInteractionsV2(state, map = null, scene = null) {
  const resolvedScene = scene && typeof scene === "object"
    ? scene
    : resolveCurrentSceneV2(state, map).scene;
  const resolvedMap = resolveCurrentMapV2(state, { map });
  if (!resolvedMap || !resolvedScene) return [];
  const sceneId = normalizeId(resolvedScene.id);
  return getInteractionsV2(resolvedMap)
    .filter((interaction) => normalizeId(interaction?.sceneId) === sceneId)
    .map((interaction) => ({ ...interaction }));
}

export function findInteractionV2(map, payload = {}) {
  if (!isMapContentV2(map)) return null;
  const interactionId = normalizeId(payload?.interactionId || payload?.actionId || payload?.id);
  if (!interactionId) return null;
  const sceneId = normalizeId(payload?.sceneId);
  return getInteractionsV2(map).find((interaction) => {
    if (normalizeId(interaction?.id) !== interactionId) return false;
    if (!sceneId) return true;
    return normalizeId(interaction?.sceneId) === sceneId;
  }) || null;
}

export function resolveInteractionEdgeV2(map, interaction) {
  if (!isMapContentV2(map) || !interaction || typeof interaction !== "object") return null;
  const edge = getEdgeByIdV2(map, interaction.edgeId);
  if (edge) return edge;

  const target = clonePlainObject(interaction.target);
  if (!target) return null;
  return {
    id: normalizeId(interaction.id) ? `${normalizeId(interaction.id)}:inline_edge` : "inline_edge",
    fromSceneId: normalizeId(interaction.sceneId),
    toSceneId: normalizeId(target.toSceneId),
    toMapId: normalizeId(target.toMapId),
    minutes: Number.isInteger(target.minutes) ? target.minutes : 0,
    kind: typeof target.kind === "string" ? target.kind : "TRANSITION"
  };
}

export function shouldRenderSceneInteractionV2(interaction) {
  if (!interaction || typeof interaction !== "object") return false;
  const ui = interaction.ui && typeof interaction.ui === "object" ? interaction.ui : null;
  return ui?.surface !== "menu" && ui?.hiddenFromActionList !== true;
}

export function createInteractionPayloadV2(map, scene, interaction) {
  return {
    mapId: normalizeId(map?.id),
    sceneId: normalizeId(scene?.id),
    interactionId: normalizeId(interaction?.id)
  };
}
