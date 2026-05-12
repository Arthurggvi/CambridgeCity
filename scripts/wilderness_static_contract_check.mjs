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

async function main() {
  const regions = listWildernessRegionProfiles();
  assertPass(regions.length >= 4, "expected region profiles");
  console.log("[PASS] region profiles loaded");

  const terrains = Object.keys(TERRAIN_BIOME_DEFS);
  // Count was 20 prior to the wilderness movement refactor; +2 for the new
  // hard-block sea terrains (`open_water`, `coastal_open_water`).
  assertPass(terrains.length === 22, `expected 22 terrain defs, got ${terrains.length}`);
  console.log("[PASS] terrain biome defs loaded");

  const areas = listWildernessAreaSpecs();
  assertPass(areas.length >= 1, "expected area specs");
  console.log("[PASS] area specs loaded");

  const staticResult = validateWildernessStaticContracts();
  assertPass(staticResult.ok === true, `static contract failed: ${staticResult.errors.join("; ")}`);
  console.log("[PASS] static contract validation passed");

  const area = getWildernessAreaSpec("west2_old_marker_patrol_line");
  assertPass(area != null, "missing west2_old_marker_patrol_line spec");

  // West2 checks must be structural (content is authored and may change).
  assertPass(typeof area.defaultTerrainId === "string" && area.defaultTerrainId.length > 0, "west2 defaultTerrainId");
  assertPass(typeof area.regionId === "string" && area.regionId.length > 0, "west2 regionId");
  assertPass(area.bounds && typeof area.bounds === "object", "west2 bounds");
  assertPass(Array.isArray(area.terrainZones), "west2 terrainZones array");

  // Ensure generated terrain zones module can import (authoring pipeline relies on this).
  const gen = await import("../data/wilderness/areas/generated/west2_old_marker_patrol_line.generated_terrain_zones.js");
  const genKeys = Object.keys(gen || {});
  assertPass(genKeys.length >= 1, "west2 generated module exports");

  // Query semantics: inside bounds => terrain kind; outside => boundary/null.
  const out = queryWildernessCoordinate(area, area.bounds.maxX + 1, area.bounds.maxY + 1);
  assertPass(out.kind === "boundary" && out.insideBounds === false && out.terrainId === null, "west2 boundary query semantics");

  // Query result must be either boundary/null or a known terrainId.
  // After the activeCellKeys decoupling, every authored in-bounds point must
  // resolve to a terrain (never to boundary), regardless of mask membership.
  for (const p of [
    { x: area.bounds.minX, y: area.bounds.minY },
    { x: area.bounds.maxX, y: area.bounds.maxY },
    { x: 0, y: 0 }
  ]) {
    const q = queryWildernessCoordinate(area, p.x, p.y);
    assertPass(q.kind === "terrain" && q.insideBounds === true, `west2 query kind (${p.x},${p.y})`);
    assertPass(typeof q.terrainId === "string" && q.terrainId.length > 0, `west2 terrainId type (${p.x},${p.y})`);
    assertPass(Object.prototype.hasOwnProperty.call(TERRAIN_BIOME_DEFS, q.terrainId), `west2 terrainId must exist: ${q.terrainId}`);
    const t = getTerrainIdAtCoordinate(area, p.x, p.y);
    assertPass(t === q.terrainId, `west2 getTerrainIdAtCoordinate matches query (${p.x},${p.y})`);
  }
  console.log("[PASS] west2_old_marker_patrol_line structural checks passed");

  // Optional active mask contract: mask is now a presentation hint only.
  // (1) in-mask cells still resolve to terrain, (2) bounds-in out-of-mask
  // cells also resolve to terrain (no boundary), with `inActiveCellMask:false`,
  // (3) bounds-out remains boundary/null with `boundaryKind:"out_of_bounds"`.
  const maskFixture = {
    id: "synthetic_active_mask_probe",
    label: "synthetic",
    regionId: "West2",
    entryMapId: "synthetic",
    runtimeMapId: "synthetic",
    fallbackMapId: "synthetic",
    bounds: { minX: 0, maxX: 2, minY: 0, maxY: 2 },
    step: { metersPerCell: 150, baseMinutes: 10, baseStaminaCost: 5 },
    defaultTerrainId: "wind_packed_snow",
    activeCellKeys: new Set(["0,0", "1,0"]),
    terrainZones: [
      { id: "zone_0_0", terrainId: "flagged_marker_line", priority: 10, shape: { type: "rect", x1: 0, y1: 0, x2: 0, y2: 0 } }
    ],
    landmarks: []
  };
  const m00 = queryWildernessCoordinate(maskFixture, 0, 0);
  assertPass(m00.kind === "terrain" && m00.terrainId === "flagged_marker_line", "active mask: (0,0) is active and zone hit");
  assertPass(m00.inActiveCellMask === true, "active mask: (0,0) inActiveCellMask=true");
  const m10 = queryWildernessCoordinate(maskFixture, 1, 0);
  assertPass(m10.kind === "terrain" && m10.terrainId === "wind_packed_snow", "active mask: (1,0) is active and defaults");
  assertPass(m10.inActiveCellMask === true, "active mask: (1,0) inActiveCellMask=true");
  const m20 = queryWildernessCoordinate(maskFixture, 2, 0);
  assertPass(m20.kind === "terrain", "active mask: (2,0) bounds-in out-of-mask now terrain");
  assertPass(m20.terrainId === "wind_packed_snow", "active mask: (2,0) falls through to default terrain");
  assertPass(m20.inActiveCellMask === false, "active mask: (2,0) inActiveCellMask=false hint");
  assertPass(m20.boundaryKind == null, "active mask: (2,0) boundaryKind is null");
  const mout = queryWildernessCoordinate(maskFixture, -1, 0);
  assertPass(mout.kind === "boundary" && mout.terrainId === null, "active mask: bounds out => boundary");
  assertPass(mout.boundaryKind === "out_of_bounds", "active mask: bounds out boundaryKind=out_of_bounds");
  console.log("[PASS] optional active mask fixture passed");

  // Coordinate query algorithm contract: use a fixed fixture area (not authored data).
  const fixtureArea = {
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
    getTerrainIdAtCoordinate(fixtureArea, 0, 0) === "flagged_marker_line",
    "line_band closed segment: start endpoint within radius must hit"
  );
  assertPass(
    getTerrainIdAtCoordinate(fixtureArea, 6, 2) === "flagged_marker_line",
    "line_band closed segment: end endpoint within radius must hit"
  );

  // Overlap priority: a higher-priority rect must win over the line_band at (0,0).
  const fixtureAreaOverlap = structuredClone(fixtureArea);
  fixtureAreaOverlap.terrainZones = [
    ...fixtureArea.terrainZones,
    {
      id: "probe_high_priority_rect",
      terrainId: "managed_compacted_route",
      priority: 10,
      shape: { type: "rect", x1: 0, y1: 0, x2: 0, y2: 0 }
    }
  ];
  assertPass(
    getTerrainIdAtCoordinate(fixtureAreaOverlap, 0, 0) === "managed_compacted_route",
    "overlap priority: rect must win over line_band at (0,0)"
  );
  const fixtureOut = queryWildernessCoordinate(fixtureAreaOverlap, fixtureAreaOverlap.bounds.maxX + 1, fixtureAreaOverlap.bounds.maxY + 1);
  assertPass(fixtureOut.kind === "boundary" && fixtureOut.insideBounds === false && fixtureOut.terrainId === null, "fixture boundary semantics");

  console.log("[PASS] coordinate query fixture samples passed");

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

main().catch((e) => {
  // Keep failure format consistent with assertPass throws.
  const msg = String(e?.stack || e?.message || e || "");
  // eslint-disable-next-line no-console
  console.error(msg);
  process.exit(1);
});
