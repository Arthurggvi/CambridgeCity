/**
 * Wilderness terrain symbol registry — pure presentation module.
 *
 * Static {terrainId -> {family, fill, stroke, pattern, danger}} table consumed
 * by the wilderness local minimap VM (and potentially by other terrain swatch
 * surfaces). This file MUST NOT depend on DOM, renderer, gameState, or any
 * blueprint editor state. Data was migrated 1:1 from the blueprint fragments
 * file (BLUEPRINT_TERRAIN_STYLE_REGISTRY) so runtime + blueprint tooling can
 * eventually share one source of truth without dragging editor-state into
 * runtime.
 *
 * Intentionally NOT migrated:
 *   - onion / top-only / bottom-only / diff / brush / special_map_cell styles
 *   - renderBlueprintTerrainSwatch (SVG swatch builder)
 *   - renderBlueprintRuntimeScript (nested-template-literal runtime)
 *   - textarea / DSL / export logic
 *
 * Key set kept identical to the source registry. Terrains not present here
 * (e.g. open_water, coastal_open_water) resolve through the neutral fallback;
 * the renderer's neighbor-overlay layer continues to special-case sea/hard.
 */

const WILDERNESS_TERRAIN_SYMBOL_REGISTRY = Object.freeze({
  // 1) 人工 / 管理通行类
  managed_compacted_route: Object.freeze({
    family: "managed",
    fill: "rgba(86, 110, 132, 0.38)",
    stroke: "rgba(162, 198, 228, 0.62)",
    pattern: "plain-route",
    danger: "low"
  }),
  flagged_marker_line: Object.freeze({
    family: "managed",
    fill: "rgba(18, 44, 74, 0.44)",
    stroke: "rgba(112, 190, 255, 0.82)",
    pattern: "marker-line",
    danger: "low"
  }),
  subglacial_facility_buried_zone: Object.freeze({
    family: "managed",
    fill: "rgba(92, 92, 92, 0.34)",
    stroke: "rgba(188, 198, 205, 0.72)",
    pattern: "industrial-grid",
    danger: "mid_high"
  }),

  // 2) 雪面类
  wind_packed_snow: Object.freeze({
    family: "snow",
    fill: "rgba(214, 234, 244, 0.42)",
    stroke: "rgba(150, 188, 210, 0.65)",
    pattern: "wind-streak",
    danger: "low"
  }),
  loose_snowfield: Object.freeze({
    family: "snow",
    fill: "rgba(236, 246, 252, 0.44)",
    stroke: "rgba(164, 196, 214, 0.62)",
    pattern: "snow-speckle",
    danger: "mid"
  }),
  snow_drift_zone: Object.freeze({
    family: "snow",
    fill: "rgba(226, 232, 236, 0.42)",
    stroke: "rgba(150, 160, 168, 0.66)",
    pattern: "snow-drift",
    danger: "mid_high"
  }),
  sastrugi_field: Object.freeze({
    family: "snow",
    fill: "rgba(238, 244, 248, 0.40)",
    stroke: "rgba(160, 178, 190, 0.66)",
    pattern: "ridge-lines",
    danger: "mid"
  }),

  // 3) 陆冰 / 冰盖 / 冰川类
  blue_ice_area: Object.freeze({
    family: "glacial",
    fill: "rgba(88, 176, 232, 0.30)",
    stroke: "rgba(136, 220, 255, 0.72)",
    pattern: "ice-glint",
    danger: "mid"
  }),
  ice_sheet_plateau: Object.freeze({
    family: "glacial",
    fill: "rgba(182, 222, 240, 0.32)",
    stroke: "rgba(160, 198, 214, 0.55)",
    pattern: "low-texture",
    danger: "mid"
  }),
  polar_plateau_exposed: Object.freeze({
    family: "glacial",
    fill: "rgba(58, 74, 92, 0.36)",
    stroke: "rgba(170, 206, 224, 0.52)",
    pattern: "wind-streak-long",
    danger: "high"
  }),
  glacier_surface: Object.freeze({
    family: "glacial",
    fill: "rgba(128, 196, 232, 0.28)",
    stroke: "rgba(182, 234, 255, 0.70)",
    pattern: "ice-flow",
    danger: "mid_high"
  }),
  crevasse_field: Object.freeze({
    family: "glacial",
    fill: "rgba(44, 54, 84, 0.42)",
    stroke: "rgba(28, 18, 36, 0.80)",
    pattern: "crack-lines",
    danger: "hard"
  }),

  // 4) 冰架 / 海冰 / 海岸类
  ice_shelf_surface: Object.freeze({
    family: "shelf_sea",
    fill: "rgba(96, 196, 206, 0.26)",
    stroke: "rgba(170, 236, 242, 0.62)",
    pattern: "shelf-band",
    danger: "mid"
  }),
  ice_shelf_edge: Object.freeze({
    family: "shelf_sea",
    fill: "rgba(22, 46, 54, 0.46)",
    stroke: "rgba(130, 206, 214, 0.60)",
    pattern: "edge-jag",
    danger: "hard"
  }),
  sea_ice_fast: Object.freeze({
    family: "shelf_sea",
    fill: "rgba(88, 210, 188, 0.22)",
    stroke: "rgba(188, 250, 232, 0.56)",
    pattern: "polygon-crack",
    danger: "mid"
  }),
  sea_ice_pressure_ridge: Object.freeze({
    family: "shelf_sea",
    fill: "rgba(124, 170, 176, 0.26)",
    stroke: "rgba(216, 244, 246, 0.54)",
    pattern: "ridge-zigzag",
    danger: "mid_high"
  }),
  tide_crack_zone: Object.freeze({
    family: "shelf_sea",
    fill: "rgba(10, 18, 28, 0.56)",
    stroke: "rgba(86, 160, 196, 0.58)",
    pattern: "central-crack",
    danger: "hard"
  }),
  ice_cliff_coast: Object.freeze({
    family: "shelf_sea",
    fill: "rgba(12, 22, 38, 0.56)",
    stroke: "rgba(110, 178, 212, 0.60)",
    pattern: "cliff-hatch",
    danger: "hard"
  }),

  // 5) 岩地 / 干谷类
  rock_outcrop_nunatak: Object.freeze({
    family: "rock",
    fill: "rgba(168, 150, 132, 0.30)",
    stroke: "rgba(96, 70, 52, 0.58)",
    pattern: "rock-speckle",
    danger: "mid_high"
  }),
  dry_valley_rock_desert: Object.freeze({
    family: "rock",
    fill: "rgba(210, 196, 162, 0.30)",
    stroke: "rgba(132, 110, 72, 0.52)",
    pattern: "sand-speckle",
    danger: "mid"
  })
});

const WILDERNESS_TERRAIN_SYMBOL_FALLBACK = Object.freeze({
  family: "neutral",
  fill: "rgba(210, 220, 226, 0.22)",
  stroke: "rgba(140, 160, 172, 0.55)",
  pattern: "low-texture",
  danger: "low"
});

function normalizeTerrainId(terrainId) {
  return String(terrainId ?? "").trim();
}

/**
 * Static style record for a terrainId. Returns the neutral fallback for
 * unknown / empty / null terrainIds. Pure: same input -> same frozen output.
 *
 * @param {string|null|undefined} terrainId
 * @returns {{ family: string, fill: string, stroke: string, pattern: string, danger: string }}
 */
export function getWildernessTerrainSymbolStyle(terrainId) {
  const id = normalizeTerrainId(terrainId);
  if (!id) return WILDERNESS_TERRAIN_SYMBOL_FALLBACK;
  return WILDERNESS_TERRAIN_SYMBOL_REGISTRY[id] || WILDERNESS_TERRAIN_SYMBOL_FALLBACK;
}

/**
 * Family-scoped CSS class for a wilderness minimap cell. Renderer appends this
 * verbatim to its base `.wilderness-local-minimap-cell` class. Always returns
 * a stable, CSS-safe string so renderers can rely on it without sanitization.
 *
 * @param {string|null|undefined} terrainId
 * @returns {string}
 */
export function getWildernessTerrainSymbolClass(terrainId) {
  const style = getWildernessTerrainSymbolStyle(terrainId);
  const fam = String(style.family || "neutral").trim() || "neutral";
  return `wilderness-local-minimap-cell--family-${fam}`;
}

/**
 * VM-shaped descriptor for a single terrain cell. Consumed by the wilderness
 * local minimap VM to populate `cells[i]`. terrainDef should come from
 * getTerrainBiomeDef(). Returns null for missing/invalid input so callers can
 * fall back to an out-of-bounds / unknown cell representation.
 *
 * @param {object|null|undefined} terrainDef
 * @returns {(null | {
 *   terrainId: string,
 *   label: string|null,
 *   family: string,
 *   danger: string,
 *   passability: { foot: string|null, vehicle: string|null }|null,
 *   symbolClass: string,
 *   symbolStyle: { family: string, fill: string, stroke: string, pattern: string, danger: string }
 * })}
 */
export function getWildernessTerrainSymbolVm(terrainDef) {
  if (!terrainDef || typeof terrainDef !== "object") return null;
  const id = normalizeTerrainId(terrainDef.id);
  if (!id) return null;
  const style = getWildernessTerrainSymbolStyle(id);
  const pass = terrainDef.passability && typeof terrainDef.passability === "object"
    ? {
        foot: terrainDef.passability.foot != null ? String(terrainDef.passability.foot) : null,
        vehicle: terrainDef.passability.vehicle != null ? String(terrainDef.passability.vehicle) : null
      }
    : null;
  return {
    terrainId: id,
    label: terrainDef.label != null ? String(terrainDef.label) : null,
    family: style.family,
    danger: style.danger,
    passability: pass,
    symbolClass: getWildernessTerrainSymbolClass(id),
    symbolStyle: { ...style }
  };
}

export { WILDERNESS_TERRAIN_SYMBOL_FALLBACK };
