// ============================================================================
// Reference Extractor - 从 mapJson 中提取所有跨地图引用（P0-4）
// ============================================================================

/**
 * @typedef {Object} Reference
 * @property {string} sourceMapId
 * @property {string} sourceFilePath
 * @property {string} jsonPath
 * @property {string} targetMapId
 * @property {string} refType
 */

function pushRef(out, sourceMapId, sourceFilePath, jsonPath, targetMapId, refType) {
  if (typeof targetMapId !== "string" || targetMapId.trim() === "") return;
  out.push({
    sourceMapId,
    sourceFilePath,
    jsonPath,
    targetMapId,
    refType
  });
}

/**
 * 提取所有跨地图引用
 * - TRANSITION: actions[i].payload.toMapId
 * - legacy targetMapId: actions[i].targetMapId（兼容旧字段，也会触发 LOAD_MAP）
 * - (optional) link.transitions[j].toMapId
 *
 * @param {any} mapJson
 * @param {string} sourceFilePath
 * @returns {Reference[]}
 */
export function extractMapReferences(mapJson, sourceFilePath) {
  const out = [];
  if (!mapJson || typeof mapJson !== "object") return out;

  const sourceMapId = typeof mapJson.id === "string" ? mapJson.id : "(unknown)";

  const actions = Array.isArray(mapJson.actions) ? mapJson.actions : [];
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (!a || typeof a !== "object") continue;

    if (a.kind === "TRANSITION") {
      const to = a?.payload?.toMapId;
      pushRef(out, sourceMapId, sourceFilePath, `actions[${i}].payload.toMapId`, to, "TRANSITION_TO");
    }

    // 兼容旧字段：targetMapId
    if (typeof a.targetMapId === "string" && a.targetMapId.trim() !== "") {
      pushRef(out, sourceMapId, sourceFilePath, `actions[${i}].targetMapId`, a.targetMapId, "LEGACY_TARGET_MAP");
    }
  }

  const transitions = mapJson?.link?.transitions;
  if (Array.isArray(transitions)) {
    for (let j = 0; j < transitions.length; j++) {
      const t = transitions[j];
      if (!t || typeof t !== "object") continue;
      pushRef(out, sourceMapId, sourceFilePath, `link.transitions[${j}].toMapId`, t.toMapId, "LINK_TRANSITION_TO");
    }
  }

  const edges = Array.isArray(mapJson?.edges) ? mapJson.edges : [];
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!edge || typeof edge !== "object") continue;
    pushRef(out, sourceMapId, sourceFilePath, `edges[${i}].toMapId`, edge.toMapId, "V2_EDGE_TO");
  }

  return out;
}
