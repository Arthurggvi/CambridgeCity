function freezeMove(move) {
  return Object.freeze({
    moveTimeMult: move.moveTimeMult,
    staminaCostMult: move.staminaCostMult,
    vehicleTimeMult: move.vehicleTimeMult
  });
}

function freezePass(pass) {
  return Object.freeze({
    foot: pass.foot,
    vehicle: pass.vehicle,
    requires: Object.freeze(pass.requires != null ? pass.requires : [])
  });
}

function freezeSurface(s) {
  return Object.freeze({
    snowAccumulationMult: s.snowAccumulationMult,
    windScourMult: s.windScourMult,
    trailRetentionMult: s.trailRetentionMult,
    slipRiskBase: s.slipRiskBase
  });
}

function freezeHazard(h) {
  return Object.freeze({
    crevasseRisk: h.crevasseRisk,
    fallRisk: h.fallRisk,
    collapseRisk: h.collapseRisk,
    disorientationRisk: h.disorientationRisk,
    rescueDifficulty: h.rescueDifficulty
  });
}

function freezeProbe(p) {
  return Object.freeze({
    visibilityCue: p.visibilityCue,
    landmarkCueMult: p.landmarkCueMult,
    confidenceMult: p.confidenceMult
  });
}

function makeTerrain(def) {
  return Object.freeze({
    id: def.id,
    label: def.label,
    move: freezeMove(def.move),
    passability: freezePass(def.passability),
    surface: freezeSurface(def.surface),
    hazard: freezeHazard(def.hazard),
    probe: freezeProbe(def.probe),
    blockers: Object.freeze(def.blockers != null ? def.blockers : [])
  });
}

const _TERRAIN_BIOME_DEFS = {
  managed_compacted_route: makeTerrain({
    id: "managed_compacted_route",
    label: "管理压实道",
    move: { moveTimeMult: 0.8, staminaCostMult: 0.8, vehicleTimeMult: 0.85 },
    passability: { foot: "allowed", vehicle: "allowed", requires: [] },
    surface: { snowAccumulationMult: 0.7, windScourMult: 0.9, trailRetentionMult: 1.2, slipRiskBase: 0.05 },
    hazard: { crevasseRisk: 0.02, fallRisk: 0.03, collapseRisk: 0.01, disorientationRisk: 0.02, rescueDifficulty: 0.15 },
    probe: { visibilityCue: "high_contrast", landmarkCueMult: 1.1, confidenceMult: 1.05 },
    blockers: []
  }),
  flagged_marker_line: makeTerrain({
    id: "flagged_marker_line",
    label: "标记杆巡查线",
    move: { moveTimeMult: 1.0, staminaCostMult: 1.0, vehicleTimeMult: 1.15 },
    passability: { foot: "allowed", vehicle: "conditional", requires: [] },
    surface: { snowAccumulationMult: 0.95, windScourMult: 1.0, trailRetentionMult: 1.1, slipRiskBase: 0.08 },
    hazard: { crevasseRisk: 0.04, fallRisk: 0.05, collapseRisk: 0.02, disorientationRisk: 0.04, rescueDifficulty: 0.22 },
    probe: { visibilityCue: "poles_visible", landmarkCueMult: 1.25, confidenceMult: 1.1 },
    blockers: []
  }),
  wind_packed_snow: makeTerrain({
    id: "wind_packed_snow",
    label: "风压硬雪面",
    move: { moveTimeMult: 1.1, staminaCostMult: 1.1, vehicleTimeMult: 1.1 },
    passability: { foot: "allowed", vehicle: "allowed", requires: [] },
    surface: { snowAccumulationMult: 0.85, windScourMult: 1.15, trailRetentionMult: 0.95, slipRiskBase: 0.12 },
    hazard: { crevasseRisk: 0.05, fallRisk: 0.06, collapseRisk: 0.02, disorientationRisk: 0.08, rescueDifficulty: 0.28 },
    probe: { visibilityCue: "wind_polished", landmarkCueMult: 0.95, confidenceMult: 0.95 },
    blockers: []
  }),
  loose_snowfield: makeTerrain({
    id: "loose_snowfield",
    label: "松雪原",
    move: { moveTimeMult: 1.5, staminaCostMult: 1.6, vehicleTimeMult: 1.65 },
    passability: { foot: "allowed", vehicle: "conditional", requires: [] },
    surface: { snowAccumulationMult: 1.25, windScourMult: 0.85, trailRetentionMult: 0.75, slipRiskBase: 0.22 },
    hazard: { crevasseRisk: 0.08, fallRisk: 0.1, collapseRisk: 0.04, disorientationRisk: 0.12, rescueDifficulty: 0.35 },
    probe: { visibilityCue: "low_contrast", landmarkCueMult: 0.85, confidenceMult: 0.85 },
    blockers: []
  }),
  snow_drift_zone: makeTerrain({
    id: "snow_drift_zone",
    label: "积雪堆/雪窝",
    move: { moveTimeMult: 1.8, staminaCostMult: 2.0, vehicleTimeMult: 2.2 },
    passability: { foot: "conditional", vehicle: "forbidden", requires: [] },
    surface: { snowAccumulationMult: 1.6, windScourMult: 0.65, trailRetentionMult: 0.55, slipRiskBase: 0.35 },
    hazard: { crevasseRisk: 0.1, fallRisk: 0.12, collapseRisk: 0.06, disorientationRisk: 0.18, rescueDifficulty: 0.45 },
    probe: { visibilityCue: "uneven_surface", landmarkCueMult: 0.75, confidenceMult: 0.78 },
    blockers: []
  }),
  sastrugi_field: makeTerrain({
    id: "sastrugi_field",
    label: "雪垄区",
    move: { moveTimeMult: 1.4, staminaCostMult: 1.5, vehicleTimeMult: 1.7 },
    passability: { foot: "allowed", vehicle: "slow", requires: [] },
    surface: { snowAccumulationMult: 1.05, windScourMult: 1.35, trailRetentionMult: 0.85, slipRiskBase: 0.28 },
    hazard: { crevasseRisk: 0.07, fallRisk: 0.09, collapseRisk: 0.03, disorientationRisk: 0.14, rescueDifficulty: 0.38 },
    probe: { visibilityCue: "ridged_noise", landmarkCueMult: 0.9, confidenceMult: 0.88 },
    blockers: []
  }),
  blue_ice_area: makeTerrain({
    id: "blue_ice_area",
    label: "蓝冰区",
    move: { moveTimeMult: 1.2, staminaCostMult: 1.3, vehicleTimeMult: 1.25 },
    passability: { foot: "conditional", vehicle: "conditional", requires: [] },
    surface: { snowAccumulationMult: 0.35, windScourMult: 1.4, trailRetentionMult: 0.65, slipRiskBase: 0.45 },
    hazard: { crevasseRisk: 0.12, fallRisk: 0.18, collapseRisk: 0.05, disorientationRisk: 0.1, rescueDifficulty: 0.42 },
    probe: { visibilityCue: "specular_glare", landmarkCueMult: 0.8, confidenceMult: 0.82 },
    blockers: []
  }),
  ice_sheet_plateau: makeTerrain({
    id: "ice_sheet_plateau",
    label: "冰盖高原",
    move: { moveTimeMult: 1.3, staminaCostMult: 1.4, vehicleTimeMult: 1.35 },
    passability: { foot: "allowed", vehicle: "allowed", requires: [] },
    surface: { snowAccumulationMult: 0.9, windScourMult: 1.1, trailRetentionMult: 0.9, slipRiskBase: 0.15 },
    hazard: { crevasseRisk: 0.06, fallRisk: 0.08, collapseRisk: 0.03, disorientationRisk: 0.2, rescueDifficulty: 0.5 },
    probe: { visibilityCue: "open_horizon", landmarkCueMult: 0.85, confidenceMult: 0.8 },
    blockers: []
  }),
  polar_plateau_exposed: makeTerrain({
    id: "polar_plateau_exposed",
    label: "内陆暴露高原",
    move: { moveTimeMult: 1.6, staminaCostMult: 1.8, vehicleTimeMult: 1.85 },
    passability: { foot: "conditional", vehicle: "conditional", requires: [] },
    surface: { snowAccumulationMult: 1.1, windScourMult: 1.45, trailRetentionMult: 0.7, slipRiskBase: 0.2 },
    hazard: { crevasseRisk: 0.09, fallRisk: 0.11, collapseRisk: 0.04, disorientationRisk: 0.25, rescueDifficulty: 0.55 },
    probe: { visibilityCue: "whiteout_prone", landmarkCueMult: 0.7, confidenceMult: 0.72 },
    blockers: []
  }),
  glacier_surface: makeTerrain({
    id: "glacier_surface",
    label: "冰川表面",
    move: { moveTimeMult: 1.5, staminaCostMult: 1.6, vehicleTimeMult: 1.55 },
    passability: { foot: "conditional", vehicle: "conditional", requires: [] },
    surface: { snowAccumulationMult: 0.95, windScourMult: 1.05, trailRetentionMult: 0.8, slipRiskBase: 0.25 },
    hazard: { crevasseRisk: 0.22, fallRisk: 0.14, collapseRisk: 0.08, disorientationRisk: 0.16, rescueDifficulty: 0.48 },
    probe: { visibilityCue: "flow_texture", landmarkCueMult: 0.88, confidenceMult: 0.84 },
    blockers: []
  }),
  crevasse_field: makeTerrain({
    id: "crevasse_field",
    label: "裂隙带",
    move: { moveTimeMult: 2.2, staminaCostMult: 2.4, vehicleTimeMult: 2.5 },
    passability: { foot: "conditional", vehicle: "forbidden", requires: [] },
    surface: { snowAccumulationMult: 1.15, windScourMult: 0.95, trailRetentionMult: 0.5, slipRiskBase: 0.4 },
    hazard: { crevasseRisk: 0.85, fallRisk: 0.55, collapseRisk: 0.12, disorientationRisk: 0.22, rescueDifficulty: 0.75 },
    probe: { visibilityCue: "hidden_hazards", landmarkCueMult: 0.65, confidenceMult: 0.65 },
    blockers: []
  }),
  ice_shelf_surface: makeTerrain({
    id: "ice_shelf_surface",
    label: "冰架表面",
    move: { moveTimeMult: 1.2, staminaCostMult: 1.3, vehicleTimeMult: 1.22 },
    passability: { foot: "conditional", vehicle: "conditional", requires: [] },
    surface: { snowAccumulationMult: 0.75, windScourMult: 1.2, trailRetentionMult: 0.75, slipRiskBase: 0.3 },
    hazard: { crevasseRisk: 0.15, fallRisk: 0.12, collapseRisk: 0.06, disorientationRisk: 0.12, rescueDifficulty: 0.52 },
    probe: { visibilityCue: "flat_ice", landmarkCueMult: 0.82, confidenceMult: 0.8 },
    blockers: []
  }),
  ice_shelf_edge: makeTerrain({
    id: "ice_shelf_edge",
    label: "冰架前缘",
    move: { moveTimeMult: Infinity, staminaCostMult: Infinity, vehicleTimeMult: Infinity },
    passability: { foot: "hard_block", vehicle: "hard_block", requires: [] },
    surface: { snowAccumulationMult: 0.5, windScourMult: 1.5, trailRetentionMult: 0.4, slipRiskBase: 0.9 },
    hazard: { crevasseRisk: 0.95, fallRisk: 0.9, collapseRisk: 0.45, disorientationRisk: 0.35, rescueDifficulty: 0.95 },
    probe: { visibilityCue: "shear_edge", landmarkCueMult: 1.0, confidenceMult: 0.9 },
    blockers: []
  }),
  sea_ice_fast: makeTerrain({
    id: "sea_ice_fast",
    label: "固着海冰",
    move: { moveTimeMult: 1.3, staminaCostMult: 1.4, vehicleTimeMult: 1.32 },
    passability: { foot: "conditional", vehicle: "conditional", requires: [] },
    surface: { snowAccumulationMult: 1.0, windScourMult: 1.0, trailRetentionMult: 0.85, slipRiskBase: 0.2 },
    hazard: { crevasseRisk: 0.18, fallRisk: 0.1, collapseRisk: 0.05, disorientationRisk: 0.1, rescueDifficulty: 0.45 },
    probe: { visibilityCue: "coastal_flat", landmarkCueMult: 0.92, confidenceMult: 0.86 },
    blockers: []
  }),
  sea_ice_pressure_ridge: makeTerrain({
    id: "sea_ice_pressure_ridge",
    label: "海冰压力脊",
    move: { moveTimeMult: 2.0, staminaCostMult: 2.2, vehicleTimeMult: 2.3 },
    passability: { foot: "conditional", vehicle: "forbidden", requires: [] },
    surface: { snowAccumulationMult: 1.35, windScourMult: 0.9, trailRetentionMult: 0.55, slipRiskBase: 0.38 },
    hazard: { crevasseRisk: 0.35, fallRisk: 0.28, collapseRisk: 0.15, disorientationRisk: 0.14, rescueDifficulty: 0.58 },
    probe: { visibilityCue: "jumbled_blocks", landmarkCueMult: 0.78, confidenceMult: 0.76 },
    blockers: []
  }),
  tide_crack_zone: makeTerrain({
    id: "tide_crack_zone",
    label: "潮裂带",
    move: { moveTimeMult: Infinity, staminaCostMult: Infinity, vehicleTimeMult: Infinity },
    passability: { foot: "hard_block", vehicle: "hard_block", requires: [] },
    surface: { snowAccumulationMult: 0.6, windScourMult: 1.1, trailRetentionMult: 0.35, slipRiskBase: 0.85 },
    hazard: { crevasseRisk: 0.7, fallRisk: 0.45, collapseRisk: 0.35, disorientationRisk: 0.18, rescueDifficulty: 0.88 },
    probe: { visibilityCue: "open_water_near", landmarkCueMult: 0.95, confidenceMult: 0.88 },
    blockers: []
  }),
  rock_outcrop_nunatak: makeTerrain({
    id: "rock_outcrop_nunatak",
    label: "裸露岩脊/nunatak",
    move: { moveTimeMult: 1.7, staminaCostMult: 1.8, vehicleTimeMult: 1.9 },
    passability: { foot: "conditional", vehicle: "forbidden", requires: [] },
    surface: { snowAccumulationMult: 0.45, windScourMult: 1.25, trailRetentionMult: 1.0, slipRiskBase: 0.32 },
    hazard: { crevasseRisk: 0.2, fallRisk: 0.35, collapseRisk: 0.1, disorientationRisk: 0.12, rescueDifficulty: 0.48 },
    probe: { visibilityCue: "rock_landmark", landmarkCueMult: 1.35, confidenceMult: 1.05 },
    blockers: []
  }),
  dry_valley_rock_desert: makeTerrain({
    id: "dry_valley_rock_desert",
    label: "干谷岩漠",
    move: { moveTimeMult: 1.4, staminaCostMult: 1.5, vehicleTimeMult: 1.45 },
    passability: { foot: "allowed", vehicle: "conditional", requires: [] },
    surface: { snowAccumulationMult: 0.25, windScourMult: 1.3, trailRetentionMult: 1.05, slipRiskBase: 0.18 },
    hazard: { crevasseRisk: 0.08, fallRisk: 0.22, collapseRisk: 0.06, disorientationRisk: 0.22, rescueDifficulty: 0.4 },
    probe: { visibilityCue: "rock_stripes", landmarkCueMult: 1.15, confidenceMult: 0.92 },
    blockers: []
  }),
  ice_cliff_coast: makeTerrain({
    id: "ice_cliff_coast",
    label: "冰崖海岸",
    move: { moveTimeMult: Infinity, staminaCostMult: Infinity, vehicleTimeMult: Infinity },
    passability: { foot: "hard_block", vehicle: "hard_block", requires: [] },
    surface: { snowAccumulationMult: 0.55, windScourMult: 1.35, trailRetentionMult: 0.45, slipRiskBase: 0.88 },
    hazard: { crevasseRisk: 0.55, fallRisk: 0.85, collapseRisk: 0.25, disorientationRisk: 0.2, rescueDifficulty: 0.92 },
    probe: { visibilityCue: "vertical_drop", landmarkCueMult: 1.05, confidenceMult: 0.95 },
    blockers: []
  }),
  subglacial_facility_buried_zone: makeTerrain({
    id: "subglacial_facility_buried_zone",
    label: "半埋设施带",
    move: { moveTimeMult: 1.3, staminaCostMult: 1.5, vehicleTimeMult: 1.4 },
    passability: { foot: "allowed", vehicle: "forbidden", requires: [] },
    surface: { snowAccumulationMult: 1.1, windScourMult: 0.85, trailRetentionMult: 0.95, slipRiskBase: 0.16 },
    hazard: { crevasseRisk: 0.12, fallRisk: 0.08, collapseRisk: 0.28, disorientationRisk: 0.15, rescueDifficulty: 0.62 },
    probe: { visibilityCue: "subtle_structures", landmarkCueMult: 0.72, confidenceMult: 0.74 },
    blockers: []
  })
};

export const TERRAIN_BIOME_DEFS = Object.freeze(_TERRAIN_BIOME_DEFS);
