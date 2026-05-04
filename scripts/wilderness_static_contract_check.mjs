import { TERRAIN_BIOME_DEFS } from "../data/wilderness/terrain/wilderness_terrain_defs.js";
import { getWildernessAreaSpec, listWildernessAreaSpecs } from "../src/engine/wilderness/wilderness_area_registry.js";
import { getTerrainIdAtCoordinate, queryWildernessCoordinate } from "../src/engine/wilderness/wilderness_area_query.js";
import { listWildernessRegionProfiles } from "../src/engine/wilderness/wilderness_region_registry.js";
import {
  validateTerrainBiomeDefs,
  validateWildernessAreaSpec,
  validateWildernessStaticContracts
} from "../src/engine/wilderness/wilderness_terrain_validate.js";

function assertPass(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFail(result, label) {
  assertPass(result && result.ok === false, `${label}: expected validation failure`);
  assertPass(Array.isArray(result.errors) && result.errors.length > 0, `${label}: expected non-empty errors`);
}

function cloneTerrainDefs() {
  return structuredClone(TERRAIN_BIOME_DEFS);
}

function main() {
  const regions = listWildernessRegionProfiles();
  assertPass(regions.length >= 4, "expected region profiles");
  console.log("[PASS] region profiles loaded");

  const terrains = Object.keys(TERRAIN_BIOME_DEFS);
  assertPass(terrains.length === 20, `expected 20 terrain defs, got ${terrains.length}`);
  console.log("[PASS] terrain biome defs loaded");

  const areas = listWildernessAreaSpecs();
  assertPass(areas.length >= 1, "expected area specs");
  console.log("[PASS] area specs loaded");

  const staticResult = validateWildernessStaticContracts();
  assertPass(staticResult.ok === true, `static contract failed: ${staticResult.errors.join("; ")}`);
  console.log("[PASS] static contract validation passed");

  const area = getWildernessAreaSpec("west2_old_marker_patrol_line");
  assertPass(area != null, "missing west2_old_marker_patrol_line spec");

  const samples = [
    { x: 0, y: 0, terrainId: "managed_compacted_route" },
    { x: 2, y: 1, terrainId: "flagged_marker_line" },
    { x: 5, y: -1, terrainId: "snow_drift_zone" },
    { x: 0, y: 3, terrainId: "sastrugi_field" },
    { x: 7, y: 0, terrainId: "ice_shelf_edge" },
    { x: 9, y: 0, terrainId: null, boundary: true }
  ];

  for (const s of samples) {
    const q = queryWildernessCoordinate(area, s.x, s.y);
    if (s.boundary) {
      assertPass(q.kind === "boundary" && q.insideBounds === false && q.terrainId === null, `sample (${s.x},${s.y}) boundary`);
    } else {
      assertPass(q.kind === "terrain" && q.insideBounds === true, `sample (${s.x},${s.y}) kind`);
      assertPass(q.terrainId === s.terrainId, `sample (${s.x},${s.y}) expected ${s.terrainId}, got ${q.terrainId}`);
      assertPass(getTerrainIdAtCoordinate(area, s.x, s.y) === s.terrainId, `getTerrainIdAtCoordinate (${s.x},${s.y})`);
    }
  }
  console.log("[PASS] west2_old_marker_patrol_line coordinate samples passed");

  const lineBandEndpointProbe = {
    id: "synthetic_line_band_endpoint_probe",
    label: "synthetic",
    regionId: "West2",
    entryMapId: "synthetic",
    runtimeMapId: "synthetic",
    fallbackMapId: "synthetic",
    bounds: { minX: -2, maxX: 8, minY: -2, maxY: 8 },
    step: { metersPerCell: 150, baseMinutes: 10, baseStaminaCost: 5 },
    defaultTerrainId: "wind_packed_snow",
    terrainZones: [
      {
        id: "probe_line_only",
        terrainId: "flagged_marker_line",
        priority: 1,
        shape: {
          type: "line_band",
          from: { x: 0, y: 0 },
          to: { x: 6, y: 2 },
          radius: 1
        }
      }
    ],
    landmarks: []
  };
  assertPass(
    getTerrainIdAtCoordinate(lineBandEndpointProbe, 0, 0) === "flagged_marker_line",
    "line_band closed segment: start endpoint within radius must hit"
  );
  assertPass(
    getTerrainIdAtCoordinate(lineBandEndpointProbe, 6, 2) === "flagged_marker_line",
    "line_band closed segment: end endpoint within radius must hit"
  );
  assertPass(
    queryWildernessCoordinate(area, 0, 0).terrainId === "managed_compacted_route",
    "(0,0) must prefer higher-priority outpost over overlapping line_band"
  );
  console.log("[PASS] line_band closed-segment endpoint + overlap priority checks passed");

  const regionIds = new Set(listWildernessRegionProfiles().map((p) => p.id));
  const terrainIds = new Set(Object.keys(TERRAIN_BIOME_DEFS));
  const baseContext = { regionIds, terrainIds };

  const dupDefs = cloneTerrainDefs();
  dupDefs.extra_same = dupDefs.managed_compacted_route;
  assertFail(validateTerrainBiomeDefs(dupDefs), "duplicate terrainId");

  const keyMismatch = cloneTerrainDefs();
  keyMismatch.managed_compacted_route = {
    ...structuredClone(keyMismatch.managed_compacted_route),
    id: "managed_compacted_route_wrong"
  };
  assertFail(validateTerrainBiomeDefs(keyMismatch), "terrain key vs id mismatch");

  const badZoneTerrain = structuredClone(area);
  badZoneTerrain.terrainZones = structuredClone(badZoneTerrain.terrainZones);
  badZoneTerrain.terrainZones[0] = { ...badZoneTerrain.terrainZones[0], terrainId: "no_such_terrain" };
  assertFail(validateWildernessAreaSpec(badZoneTerrain, baseContext), "zone references missing terrainId");

  const badRegion = structuredClone(area);
  badRegion.regionId = "NoSuchRegion";
  assertFail(validateWildernessAreaSpec(badRegion, baseContext), "area references missing regionId");

  const badShape = structuredClone(area);
  badShape.terrainZones = structuredClone(badShape.terrainZones);
  badShape.terrainZones[0] = {
    ...badShape.terrainZones[0],
    shape: { type: "polygon", points: [] }
  };
  assertFail(validateWildernessAreaSpec(badShape, baseContext), "shape.type not allowed");

  const badMove = cloneTerrainDefs();
  badMove.managed_compacted_route = {
    ...structuredClone(badMove.managed_compacted_route),
    move: { ...structuredClone(badMove.managed_compacted_route.move), moveTimeMult: "fast" }
  };
  assertFail(validateTerrainBiomeDefs(badMove), "moveTimeMult not number/Infinity");

  const badFoot = cloneTerrainDefs();
  badFoot.managed_compacted_route = {
    ...structuredClone(badFoot.managed_compacted_route),
    passability: { ...structuredClone(badFoot.managed_compacted_route.passability), foot: "nope" }
  };
  assertFail(validateTerrainBiomeDefs(badFoot), "passability.foot not enum");

  const badBounds = structuredClone(area);
  badBounds.bounds = { ...badBounds.bounds, minX: 5, maxX: 2 };
  assertFail(validateWildernessAreaSpec(badBounds, baseContext), "bounds minX > maxX");

  console.log("[PASS] negative validation cases rejected as expected");
}

main();
