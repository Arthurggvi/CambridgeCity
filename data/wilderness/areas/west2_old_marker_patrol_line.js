const BOUNDS = Object.freeze({
  minX: -8,
  maxX: 8,
  minY: -8,
  maxY: 8
});

const STEP = Object.freeze({
  metersPerCell: 150,
  baseMinutes: 10,
  baseStaminaCost: 5
});

const TERRAIN_ZONES = Object.freeze([
  Object.freeze({
    id: "outpost_edge_zone",
    terrainId: "managed_compacted_route",
    priority: 40,
    shape: Object.freeze({
      type: "rect",
      x1: -1,
      y1: -1,
      x2: 1,
      y2: 1
    })
  }),
  Object.freeze({
    id: "old_marker_line_zone",
    terrainId: "flagged_marker_line",
    priority: 20,
    shape: Object.freeze({
      type: "line_band",
      from: Object.freeze({ x: 0, y: 0 }),
      to: Object.freeze({ x: 6, y: 2 }),
      radius: 1
    })
  }),
  Object.freeze({
    id: "drift_zone_east",
    terrainId: "snow_drift_zone",
    priority: 30,
    shape: Object.freeze({
      type: "rect",
      x1: 3,
      y1: -2,
      x2: 7,
      y2: 1
    })
  }),
  Object.freeze({
    id: "sastrugi_band_north",
    terrainId: "sastrugi_field",
    priority: 25,
    shape: Object.freeze({
      type: "rect",
      x1: -4,
      y1: 2,
      x2: 4,
      y2: 5
    })
  }),
  Object.freeze({
    id: "ice_shelf_edge_east",
    terrainId: "ice_shelf_edge",
    priority: 100,
    shape: Object.freeze({
      type: "line_band",
      from: Object.freeze({ x: 7, y: -8 }),
      to: Object.freeze({ x: 7, y: 8 }),
      radius: 0
    })
  })
]);

export const WEST2_OLD_MARKER_PATROL_LINE = Object.freeze({
  id: "west2_old_marker_patrol_line",
  label: "旧标记杆巡查线",
  regionId: "West2",
  entryMapId: "west2_outpost_exit",
  runtimeMapId: "wilderness_runtime",
  fallbackMapId: "west2_outpost_hub",
  bounds: BOUNDS,
  step: STEP,
  defaultTerrainId: "wind_packed_snow",
  terrainZones: TERRAIN_ZONES,
  landmarks: Object.freeze([])
});
