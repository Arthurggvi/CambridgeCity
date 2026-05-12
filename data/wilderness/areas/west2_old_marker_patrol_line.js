import * as GENERATED_WEST2_OLD_MARKER_PATROL_LINE from "./generated/west2_old_marker_patrol_line.generated_terrain_zones.js";

const WEST2_OLD_MARKER_PATROL_LINE_GENERATED_TERRAIN_ZONES =
  GENERATED_WEST2_OLD_MARKER_PATROL_LINE.WEST2_OLD_MARKER_PATROL_LINE_GENERATED_TERRAIN_ZONES;
const WEST2_OLD_MARKER_PATROL_LINE_GENERATED_LANDMARKS =
  GENERATED_WEST2_OLD_MARKER_PATROL_LINE.WEST2_OLD_MARKER_PATROL_LINE_GENERATED_LANDMARKS;
const WEST2_OLD_MARKER_PATROL_LINE_GENERATED_BOUNDS =
  GENERATED_WEST2_OLD_MARKER_PATROL_LINE.WEST2_OLD_MARKER_PATROL_LINE_GENERATED_BOUNDS;
const GENERATED_ACTIVE_CELL_KEYS = Array.isArray(
  GENERATED_WEST2_OLD_MARKER_PATROL_LINE.WEST2_OLD_MARKER_PATROL_LINE_GENERATED_ACTIVE_CELL_KEYS
)
  ? GENERATED_WEST2_OLD_MARKER_PATROL_LINE.WEST2_OLD_MARKER_PATROL_LINE_GENERATED_ACTIVE_CELL_KEYS
  : [];
const GENERATED_ACTIVE_CELL_KEY_SET =
  GENERATED_ACTIVE_CELL_KEYS.length > 0 ? new Set(GENERATED_ACTIVE_CELL_KEYS) : null;

const BOUNDS = Object.freeze({
  minX: -8,
  maxX: 8,
  minY: -8,
  maxY: 8
});

// Union-only merge: generated bounds may extend outward but never tighten the
// authored base BOUNDS. Returns a frozen { minX, maxX, minY, maxY }.
function mergeBounds(baseBounds, generatedBounds) {
  if (!generatedBounds) return baseBounds;
  return Object.freeze({
    minX: Math.min(baseBounds.minX, generatedBounds.minX),
    maxX: Math.max(baseBounds.maxX, generatedBounds.maxX),
    minY: Math.min(baseBounds.minY, generatedBounds.minY),
    maxY: Math.max(baseBounds.maxY, generatedBounds.maxY)
  });
}

const STEP = Object.freeze({
  metersPerCell: 150,
  baseMinutes: 10,
  baseStaminaCost: 5
});

const LANDMARKS = Object.freeze([
  Object.freeze({
    id: "west2_outpost_entry",
    label: "前哨入口",
    x: -6,
    y: 1,
    detectRadius: 1,
    enterRadius: 0,
    gotoMapId: "west2_outpost_hub"
  }),
  Object.freeze({
    id: "maintenance_corridor_entry",
    label: "维修通道外门",
    x: 5,
    y: 2,
    detectRadius: 2,
    enterRadius: 0,
    gotoMapId: "west2_maintenance_corridor_entry"
  })
]);

// NOTE: `activeCellKeys` is kept on the spec as a *presentation hint* only.
// Since the wilderness movement refactor it no longer gates movement: the
// area_query helper exposes it as `inActiveCellMask` so renderers / tooling
// can still highlight the authored patrol corridor, while resolver + probe
// rely solely on `bounds` + terrain `passability`. See:
//   - src/engine/wilderness/wilderness_area_query.js (queryWildernessCoordinate)
//   - src/engine/wilderness/wilderness_movement_resolver.js
export const WEST2_OLD_MARKER_PATROL_LINE = Object.freeze({
  id: "west2_old_marker_patrol_line",
  label: "旧标记杆巡查线",
  regionId: "West2",
  entryMapId: "west2_outpost_hub",
  runtimeMapId: "wilderness_runtime",
  fallbackMapId: "west2_outpost_hub",
  bounds: mergeBounds(BOUNDS, WEST2_OLD_MARKER_PATROL_LINE_GENERATED_BOUNDS),
  ...(GENERATED_ACTIVE_CELL_KEY_SET ? { activeCellKeys: GENERATED_ACTIVE_CELL_KEY_SET } : {}),
  step: STEP,
  defaultTerrainId: "wind_packed_snow",
  terrainZones: WEST2_OLD_MARKER_PATROL_LINE_GENERATED_TERRAIN_ZONES,
  landmarks: Object.freeze([...LANDMARKS, ...WEST2_OLD_MARKER_PATROL_LINE_GENERATED_LANDMARKS])
});
