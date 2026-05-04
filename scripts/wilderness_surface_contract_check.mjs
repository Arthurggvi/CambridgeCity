/**
 * Phase 7: wilderness surface runtime + movement cost integration.
 */
import { createDefaultGameState, gameState, replaceGameState } from "../src/engine/state.js";
import {
  normalizeWildernessWeatherSnapshot,
  buildWildernessSurfaceRuntime,
  getVisibilityLevelFromWeather,
  getSlipLevelFromSurface
} from "../src/engine/wilderness/wilderness_surface_runtime.js";
import { getWildernessRegionProfile } from "../src/engine/wilderness/wilderness_region_registry.js";
import { getTerrainBiomeDef } from "../src/engine/wilderness/wilderness_terrain_registry.js";
import { getWildernessAreaSpec } from "../src/engine/wilderness/wilderness_area_registry.js";
import {
  calculateWildernessStepMinutes,
  calculateWildernessStaminaCost
} from "../src/engine/wilderness/wilderness_movement_cost.js";
import { resolveWildernessMovePlanReadOnly } from "../src/engine/wilderness/wilderness_movement_resolver.js";

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

async function main() {
  const west2 = getWildernessRegionProfile("West2");
  const managed = getTerrainBiomeDef("managed_compacted_route");
  const loose = getTerrainBiomeDef("loose_snowfield");
  const windPacked = getTerrainBiomeDef("wind_packed_snow");
  const areaSpec = getWildernessAreaSpec("west2_old_marker_patrol_line");
  assert(!!west2 && !!managed && !!loose && !!windPacked && !!areaSpec, "fixtures");

  const wClear = weatherClear();
  const rtClear = buildWildernessSurfaceRuntime({
    regionProfile: west2,
    terrainDef: managed,
    worldWeather: wClear,
    minuteOfDay: 600
  });
  noFn(rtClear);
  assert(rtClear.visibilityLevel === "clear", "clear visibility");
  assert(rtClear.snowDepthMoveMult >= 1 && rtClear.snowDepthMoveMult <= 1.01, "managed clear move mult ~1");
  assert(rtClear.snowDepthStaminaMult >= 1 && rtClear.snowDepthStaminaMult <= 1.01, "managed clear stamina mult ~1");
  console.log("[PASS] clear + managed surface");

  const rtHeavyLoose = buildWildernessSurfaceRuntime({
    regionProfile: west2,
    terrainDef: loose,
    worldWeather: weatherHeavySnow(),
    minuteOfDay: null
  });
  const rtHeavyManaged = buildWildernessSurfaceRuntime({
    regionProfile: west2,
    terrainDef: managed,
    worldWeather: weatherHeavySnow(),
    minuteOfDay: null
  });
  assert(rtHeavyLoose.snowDepthCm > rtClear.snowDepthCm, "heavy loose deeper snow than clear managed");
  assert(rtHeavyLoose.snowDepthMoveMult > rtClear.snowDepthMoveMult, "heavy loose move mult higher");
  assert(rtHeavyLoose.snowDepthStaminaMult > rtClear.snowDepthStaminaMult, "heavy loose stamina mult higher");
  assert(rtHeavyLoose.snowDepthMoveMult > rtHeavyManaged.snowDepthMoveMult, "loose vs managed under same weather");
  console.log("[PASS] heavy snow + loose_snowfield vs baseline");

  const calm = buildWildernessSurfaceRuntime({
    regionProfile: west2,
    terrainDef: windPacked,
    worldWeather: { ...weatherClear(), windSpeed_local: 1 },
    minuteOfDay: 0
  });
  const gust = buildWildernessSurfaceRuntime({
    regionProfile: west2,
    terrainDef: windPacked,
    worldWeather: { ...weatherClear(), windSpeed_local: 40 },
    minuteOfDay: 0
  });
  assert(gust.trailRetention < calm.trailRetention, "strong wind lowers trail retention");
  assert(gust.trailLossMult > calm.trailLossMult, "trail loss mult rises with lower retention");
  console.log("[PASS] wind_packed strong wind trail");

  const wo = buildWildernessSurfaceRuntime({
    regionProfile: west2,
    terrainDef: managed,
    worldWeather: { ...weatherClear(), whiteout: true },
    minuteOfDay: 0
  });
  assert(wo.visibilityLevel === "whiteout", "whiteout visibility");
  assert(wo.probeConfidenceMult < 0.5, "whiteout lowers probe confidence");
  console.log("[PASS] whiteout surface");

  const wMut = { snowfallRate: 2, snowIntensityLevel: "Light", windSpeed_local: 3, cloudTrans: 0.4, weatherEventType: "clear" };
  const snapBefore = JSON.stringify(wMut);
  buildWildernessSurfaceRuntime({
    regionProfile: west2,
    terrainDef: managed,
    worldWeather: wMut,
    minuteOfDay: 0
  });
  assert(JSON.stringify(wMut) === snapBefore, "buildWildernessSurfaceRuntime does not mutate weather input");
  console.log("[PASS] weather object immutability");

  const baseMins = calculateWildernessStepMinutes({ areaSpec, terrainDef: loose, surfaceRuntime: null });
  const heavyMins = calculateWildernessStepMinutes({ areaSpec, terrainDef: loose, surfaceRuntime: rtHeavyLoose });
  assert(heavyMins > baseMins, "heavy surface increases step minutes vs no surface");
  const baseSt = calculateWildernessStaminaCost({ areaSpec, terrainDef: loose, surfaceRuntime: null });
  const heavySt = calculateWildernessStaminaCost({ areaSpec, terrainDef: loose, surfaceRuntime: rtHeavyLoose });
  assert(heavySt > baseSt, "heavy surface increases stamina cost vs no surface");
  console.log("[PASS] movement cost uses surface mult");

  const gs = createDefaultGameState();
  gs.time.totalMinutes = 5000;
  gs.world.weather = { ...gs.world.weather, ...weatherHeavySnow() };
  gs.world.wilderness = activeWest2(4, 0);
  replaceGameState(gs);
  const planMove = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2(4, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: gameState.world.weather,
    totalMinutes: gameState.time.totalMinutes
  });
  assert(planMove.ok === true && planMove.surface && typeof planMove.surface.snowDepthCm === "number", "resolver attaches surface on success");
  assert(
    typeof planMove.report?.surfaceSummary?.snowDepthCm === "number",
    "surfaceSummary on report"
  );
  console.log("[PASS] resolver surface on heavy-weather move");

  const bIce = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2(6, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 5000
  });
  assert(bIce.ok === false && bIce.blocker?.kind === "terrain_hard_block", "ice hard block preserved");

  const bBound = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2(8, 8),
    areaSpec,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 5000
  });
  assert(bBound.ok === false && bBound.blocker?.kind === "boundary_block", "boundary preserved");

  const zones = Array.from(areaSpec.terrainZones || []);
  zones.push({
    id: "contract_crevasse_cell",
    terrainId: "crevasse_field",
    priority: 99,
    shape: { type: "rect", x1: 2, y1: 2, x2: 2, y2: 2 }
  });
  const specC = { ...areaSpec, terrainZones: zones };
  const bCrev = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2(2, 1),
    areaSpec: specC,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 5000
  });
  assert(bCrev.ok === false && bCrev.blocker?.kind === "terrain_requirement_block", "crevasse requirement preserved");

  const snap = normalizeWildernessWeatherSnapshot({});
  assert(getVisibilityLevelFromWeather(snap) === "clear", "default snapshot visibility");
  const slipRt = buildWildernessSurfaceRuntime({
    regionProfile: west2,
    terrainDef: managed,
    worldWeather: weatherClear(),
    minuteOfDay: 0
  });
  assert(getSlipLevelFromSurface(slipRt) === slipRt.slipLevel, "getSlipLevelFromSurface");

  console.log("[PASS] wilderness_surface_contract_check");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
