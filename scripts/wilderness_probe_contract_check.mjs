/**
 * Phase 8: wilderness probe service + view model wiring (read-only previews).
 */
import { createDefaultGameState, gameState, replaceGameState } from "../src/engine/state.js";
import { getWildernessAreaSpec } from "../src/engine/wilderness/wilderness_area_registry.js";
import { getWildernessRegionProfile } from "../src/engine/wilderness/wilderness_region_registry.js";
import { WILDERNESS_MOVE_DIRECTIONS } from "../src/engine/wilderness/wilderness_movement_cost.js";
import {
  buildWildernessProbeResults,
  buildWildernessProbeResultForDirection,
  collectLandmarkCuesForCoordinate
} from "../src/engine/wilderness/wilderness_probe_service.js";
import { buildWildernessViewModel } from "../src/engine/wilderness/wilderness_view_model.js";
import { renderWildernessRuntime } from "../src/engine/render/wilderness_runtime_fragments.js";

function assert(c, m) {
  if (!c) throw new Error(m);
}

function noFn(v, p = "x") {
  if (typeof v === "function") throw new Error(`fn at ${p}`);
  if (v != null && typeof v === "object") {
    if (Array.isArray(v)) v.forEach((x, i) => noFn(x, `${p}[${i}]`));
    else for (const k of Object.keys(v)) noFn(v[k], `${p}.${k}`);
  }
}

function weatherClear() {
  return {
    snowfallRate: 0,
    snowIntensityLevel: "None",
    isSnowing: false,
    windSpeed_local: 2,
    cloudTrans: 0.2,
    weatherEventType: "clear"
  };
}

function weatherHeavySnow() {
  return {
    snowfallRate: 3,
    snowIntensityLevel: "Heavy",
    isSnowing: true,
    windSpeed_local: 4,
    cloudTrans: 0.4,
    weatherEventType: "clear"
  };
}

function activeWest2(x, y) {
  return {
    active: true,
    regionId: "West2",
    areaId: "west2_old_marker_patrol_line",
    originMapId: "x",
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "west2_outpost_hub",
    x,
    y,
    heading: "N",
    state: "NAVIGATING",
    trailConfidence: 100,
    visibilityConfidence: 100,
    lostness: 0,
    stepsTaken: 0,
    lastSafePoint: null,
    discoveredLandmarks: [],
    flags: {},
    sessionStartedAt: 1,
    lastUpdatedAt: 1,
    schemaVersion: 1
  };
}

function main() {
  const area = getWildernessAreaSpec("west2_old_marker_patrol_line");
  const west2 = getWildernessRegionProfile("West2");
  assert(!!area && !!west2, "fixtures");

  const w = activeWest2(0, 0);
  const clear = weatherClear();
  const probes = buildWildernessProbeResults({
    wilderness: w,
    areaSpec: area,
    regionProfile: west2,
    worldWeather: clear,
    totalMinutes: 9000
  });
  assert(Array.isArray(probes) && probes.length === 8, "eight probes");
  const dirs = probes.map((p) => p.direction).sort().join(",");
  assert(
    dirs === [...WILDERNESS_MOVE_DIRECTIONS].sort().join(","),
    "direction set"
  );
  for (const p of probes) {
    noFn(p, "probe");
    assert(typeof p.text === "string" && [...p.text].length <= 36, "text len");
    assert(["allowed", "slow", "conditional", "blocked", "boundary"].includes(p.passability), "passability enum");
    assert(Number.isInteger(p.confidence) && p.confidence >= 0 && p.confidence <= 100, "confidence int");
    assert(typeof p.hardBlock === "boolean", "hardBlock");
    assert(Array.isArray(p.warningTags), "warningTags");
    assert(Array.isArray(p.landmarkCues), "landmarkCues");
    const tc = p.timeCostPreview;
    const sc = p.staminaCostPreview;
    assert(tc === Infinity || (typeof tc === "number" && Number.isFinite(tc)), "time preview");
    assert(sc === Infinity || (typeof sc === "number" && Number.isFinite(sc)), "stamina preview");
  }
  console.log("[PASS] buildWildernessProbeResults shape + purity");

  const bounds = area?.bounds || {};
  const maxX = Number(bounds.maxX);
  const minY = Number(bounds.minY);
  const maxY = Number(bounds.maxY);
  assert(Number.isFinite(maxX), "areaSpec.bounds.maxX");
  const yInBounds = Number.isFinite(minY) ? minY : (Number.isFinite(maxY) ? maxY : 0);
  const wEastEdge = activeWest2(maxX, yInBounds);
  const boundaryProbe = buildWildernessProbeResults({
    wilderness: wEastEdge,
    areaSpec: area,
    regionProfile: west2,
    worldWeather: clear,
    totalMinutes: 0
  }).find((p) => p.direction === "E");
  assert(boundaryProbe.passability === "boundary", "boundary pass");
  assert(boundaryProbe.hardBlock === true, "boundary hard");
  assert(boundaryProbe.timeCostPreview === Infinity && boundaryProbe.staminaCostPreview === Infinity, "boundary costs");
  assert(boundaryProbe.warningTags.includes("boundary"), "boundary tag");
  if ("boundaryKind" in boundaryProbe) {
    assert(boundaryProbe.boundaryKind === "out_of_bounds", "boundaryKind out_of_bounds");
  }
  if ("blockerStyle" in boundaryProbe) {
    assert(boundaryProbe.blockerStyle === "void", "blockerStyle void");
  }
  const expectedOutX = maxX + 1;
  assert(Number.isFinite(expectedOutX), "maxX+1");
  console.log(`[PASS] bounds-out east probe (maxX=${maxX} -> E targets x=${expectedOutX})`);

  // hard-block probe stable coord: (7,0) -> E -> (8,0) is `tide_crack_zone`
  // (passability.foot:"hard_block") in the current west2 blueprint. The
  // legacy (6,0)->E ice_shelf_edge step became `ice_shelf_surface` after a
  // prior blueprint regen, so we migrate to the post-regen stable coord.
  const hardProbe = buildWildernessProbeResultForDirection({
    wilderness: activeWest2(7, 0),
    areaSpec: area,
    regionProfile: west2,
    direction: "E",
    worldWeather: clear,
    totalMinutes: 5000
  });
  assert(
    hardProbe.terrainId === "tide_crack_zone",
    `hard-block terrain (got ${String(hardProbe.terrainId || "")})`
  );
  assert(hardProbe.passability === "blocked" && hardProbe.hardBlock === true, "hard-block blocked");
  assert(hardProbe.timeCostPreview === Infinity, "hard-block timeCostPreview === Infinity");
  assert(hardProbe.staminaCostPreview === Infinity, "hard-block staminaCostPreview === Infinity");
  assert(hardProbe.confidence >= 90, "hard-block edge confidence");
  if ("blockerStyle" in hardProbe) {
    assert(hardProbe.blockerStyle === "hard_terrain", "hard-block blockerStyle hard_terrain");
  }
  console.log("[PASS] tide_crack_zone east from (7,0)");

  // sastrugi probe: legacy (0,3)->N targeted (0,4), but blueprint regen no
  // longer maps that cell to `sastrugi_field`. Auto-discover a stable
  // (player, direction) pair from the current areaSpec bounds instead of
  // hard-coding a stale coord.
  function findProbeCaseForTerrain(areaSpec, terrainId) {
    const dirs = [
      ["N", 0, 1],
      ["E", 1, 0],
      ["S", 0, -1],
      ["W", -1, 0],
      ["NE", 1, 1],
      ["SE", 1, -1],
      ["SW", -1, -1],
      ["NW", -1, 1]
    ];
    const b = areaSpec.bounds || {};
    const bMinX = Number(b.minX);
    const bMaxX = Number(b.maxX);
    const bMinY = Number(b.minY);
    const bMaxY = Number(b.maxY);
    assert(Number.isFinite(bMinX) && Number.isFinite(bMaxX), "bounds x finite");
    assert(Number.isFinite(bMinY) && Number.isFinite(bMaxY), "bounds y finite");
    for (let x = bMinX; x <= bMaxX; x += 1) {
      for (let y = bMinY; y <= bMaxY; y += 1) {
        for (const [direction, , ] of dirs) {
          const probe = buildWildernessProbeResultForDirection({
            wilderness: activeWest2(x, y),
            areaSpec,
            regionProfile: west2,
            direction,
            worldWeather: clear,
            totalMinutes: 0
          });
          if (probe && probe.terrainId === terrainId) {
            return { x, y, direction, probe };
          }
        }
      }
    }
    throw new Error(`No probe case found for terrain ${terrainId}`);
  }

  const sasCase = findProbeCaseForTerrain(area, "sastrugi_field");
  const sas = sasCase.probe;
  assert(
    sas.terrainId === "sastrugi_field",
    `sastrugi terrain (got ${String(sas.terrainId || "")})`
  );
  assert(sas.warningTags.includes("sastrugi"), "sastrugi tag");
  assert(sas.text.includes("雪脊") || sas.text.includes("落脚"), "sastrugi text");
  console.log(
    `[PASS] sastrugi_field probe from (${sasCase.x},${sasCase.y}) ${sasCase.direction}`
  );

  // terrain pair: legacy (2,-1) N/S targeted (2,0)/(2,-2), but blueprint regen
  // shifted those cells. Auto-discover a player coord whose N neighbor is
  // `flagged_marker_line` AND S neighbor is `wind_packed_snow`, preserving
  // the original "same origin, opposite-direction pair" semantics.
  function findNorthSouthProbePair(areaSpec, northTerrainId, southTerrainId) {
    const b = areaSpec.bounds || {};
    const bMinX = Number(b.minX);
    const bMaxX = Number(b.maxX);
    const bMinY = Number(b.minY);
    const bMaxY = Number(b.maxY);
    assert(Number.isFinite(bMinX) && Number.isFinite(bMaxX), "bounds x finite");
    assert(Number.isFinite(bMinY) && Number.isFinite(bMaxY), "bounds y finite");
    for (let x = bMinX; x <= bMaxX; x += 1) {
      for (let y = bMinY; y <= bMaxY; y += 1) {
        const wilderness = activeWest2(x, y);
        const north = buildWildernessProbeResultForDirection({
          wilderness,
          areaSpec,
          regionProfile: west2,
          direction: "N",
          worldWeather: clear,
          totalMinutes: 5000
        });
        const south = buildWildernessProbeResultForDirection({
          wilderness,
          areaSpec,
          regionProfile: west2,
          direction: "S",
          worldWeather: clear,
          totalMinutes: 5000
        });
        if (north?.terrainId === northTerrainId && south?.terrainId === southTerrainId) {
          return { x, y, north, south };
        }
      }
    }
    throw new Error(`No N/S probe pair found: N=${northTerrainId}, S=${southTerrainId}`);
  }

  const pair = findNorthSouthProbePair(area, "flagged_marker_line", "wind_packed_snow");
  const pFlagN = pair.north;
  const pWindS = pair.south;
  assert(
    pFlagN.terrainId === "flagged_marker_line" && pWindS.terrainId === "wind_packed_snow",
    `terrain pair (N=${String(pFlagN.terrainId || "")}, S=${String(pWindS.terrainId || "")})`
  );
  assert(pFlagN.confidence > pWindS.confidence, "flagged confidence higher than wind");
  console.log(
    `[PASS] terrain pair from (${pair.x},${pair.y}) N=flagged_marker_line S=wind_packed_snow`
  );

  const whiteoutW = { whiteout: true, snowfallRate: 0, snowIntensityLevel: "None", isSnowing: false, windSpeed_local: 0, cloudTrans: 0, weatherEventType: "clear" };
  const allDirs = WILDERNESS_MOVE_DIRECTIONS.map((direction) =>
    buildWildernessProbeResultForDirection({
      wilderness: activeWest2(0, 0),
      areaSpec: area,
      regionProfile: west2,
      direction,
      worldWeather: weatherClear(),
      totalMinutes: 5000
    })
  );
  const allWhite = WILDERNESS_MOVE_DIRECTIONS.map((direction) =>
    buildWildernessProbeResultForDirection({
      wilderness: activeWest2(0, 0),
      areaSpec: area,
      regionProfile: west2,
      direction,
      worldWeather: whiteoutW,
      totalMinutes: 5000
    })
  );
  for (let i = 0; i < 8; i++) {
    if (allWhite[i].hardBlock) continue;
    assert(allWhite[i].confidence < allDirs[i].confidence, `whiteout lowers ${allDirs[i].direction}`);
  }
  console.log("[PASS] whiteout lowers confidence vs clear (non-hard)");

  const areaLm = JSON.parse(JSON.stringify(area));
  areaLm.landmarks = [
    {
      id: "old_marker_01",
      label: "旧标记杆甲",
      x: 5,
      y: 0,
      detectRadius: 2,
      enterRadius: 0.5,
      gotoMapId: "test_map"
    }
  ];
  const cues = collectLandmarkCuesForCoordinate({ areaSpec: areaLm, x: 6, y: 0 });
  assert(cues.some((c) => c.id === "old_marker_01"), "landmark cue id");
  const lmProbe = buildWildernessProbeResultForDirection({
    wilderness: activeWest2(5, 0),
    areaSpec: areaLm,
    regionProfile: west2,
    direction: "E",
    worldWeather: clear,
    totalMinutes: 1
  });
  assert(lmProbe.landmarkCues.some((c) => c.id === "old_marker_01"), "probe landmark cue");
  assert(!lmProbe.text.includes("undefined"), "text sane");
  console.log("[PASS] landmark detect radius cues");

  const miniArea = {
    id: "probe_loose_test",
    label: "t",
    regionId: "West2",
    entryMapId: "x",
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "x",
    bounds: { minX: 0, maxX: 4, maxY: 0, minY: 0 },
    step: area.step,
    defaultTerrainId: "loose_snowfield",
    terrainZones: [],
    landmarks: []
  };
  const wLoose = { ...activeWest2(1, 0), areaId: miniArea.id };
  const tHeavy = buildWildernessProbeResultForDirection({
    wilderness: wLoose,
    areaSpec: miniArea,
    regionProfile: west2,
    direction: "E",
    worldWeather: weatherHeavySnow(),
    totalMinutes: 100
  }).timeCostPreview;
  const tClear = buildWildernessProbeResultForDirection({
    wilderness: wLoose,
    areaSpec: miniArea,
    regionProfile: west2,
    direction: "E",
    worldWeather: weatherClear(),
    totalMinutes: 100
  }).timeCostPreview;
  assert(Number.isFinite(tHeavy) && Number.isFinite(tClear) && tHeavy > tClear, "heavy snow preview > clear on loose");
  console.log("[PASS] loose_snowfield preview cost heavy > clear");

  const wJson = JSON.stringify(w);
  const wxJson = JSON.stringify(clear);
  buildWildernessProbeResults({
    wilderness: w,
    areaSpec: area,
    regionProfile: west2,
    worldWeather: clear,
    totalMinutes: 50
  });
  assert(JSON.stringify(w) === wJson && JSON.stringify(clear) === wxJson, "inputs unchanged");
  console.log("[PASS] probe inputs immutability");

  replaceGameState(createDefaultGameState());
  const gs = gameState;
  gs.world.wilderness = activeWest2(0, 0);
  gs.time.totalMinutes = 444;
  const playerSnap = JSON.stringify(gs.player);
  const wxSnap = JSON.stringify(gs.world.weather);
  const vm = buildWildernessViewModel(gs);
  assert(vm.status === "ready", "vm ready");
  assert(Array.isArray(vm.probes) && vm.probes.length === 8, "vm.probes");
  const moveActs = vm.actions.filter((a) => String(a.id || "").startsWith("wilderness_move_"));
  assert(moveActs.length === 8, "eight move actions");
  for (const a of moveActs) {
    assert(a.probe && a.probe.direction, "action.probe");
    assert(a.id === `wilderness_move_${a.probe.direction}`, "probe direction matches id");
  }
  assert(JSON.stringify(gs.player) === playerSnap, "player unchanged");
  assert(JSON.stringify(gs.world.weather) === wxSnap, "weather unchanged");
  assert(gs.time.totalMinutes === 444, "time unchanged");
  console.log("[PASS] view model probes on move actions");

  const frag = renderWildernessRuntime(vm);
  assert(frag && (frag.__wildernessRuntimeHeadlessStub === true || typeof frag.appendChild === "function"), "fragment ok");
  console.log("[PASS] fragment render with probes");

  const inactive = buildWildernessViewModel({ ...gs, world: { ...gs.world, wilderness: { active: false, schemaVersion: 1 } } });
  assert(Array.isArray(inactive.probes) && inactive.probes.length === 0, "inactive probes empty");
  console.log("[PASS] inactive probes empty");

  console.log("[PASS] wilderness_probe_contract_check");
}

main();
