/**
 * Phase 9: deterministic wilderness weather forecast (dry-run).
 */
import { createDefaultGameState, gameState, replaceGameState } from "../src/engine/state.js";
import { getWildernessRegionProfile } from "../src/engine/wilderness/wilderness_region_registry.js";
import {
  createDeterministicForecastRng,
  hashForecastSeed,
  randomFloat01
} from "../src/engine/wilderness/wilderness_weather_forecast_rng.js";
import {
  buildWildernessWeatherForecast,
  buildExtremeOutlook72h,
  buildShortNowcast30m,
  computeForecastSnowfallRate,
  classifyForecastSnowIntensity,
  simulateWeatherEventsDeterministic,
  normalizeWeatherForecastSnapshot,
  isWildernessWeatherForecast,
  getWeatherEventWeights
} from "../src/engine/wilderness/wilderness_weather_forecast.js";
import { buildWildernessViewModel } from "../src/engine/wilderness/wilderness_view_model.js";
import { renderWildernessRuntime } from "../src/engine/render/wilderness_runtime_fragments.js";
import { getWildernessAreaSpec } from "../src/engine/wilderness/wilderness_area_registry.js";
import { getTerrainBiomeDef } from "../src/engine/wilderness/wilderness_terrain_registry.js";
import { buildWildernessSurfaceRuntime } from "../src/engine/wilderness/wilderness_surface_runtime.js";

function assert(c, m) {
  if (!c) throw new Error(m);
}

function noFn(v, p = "root") {
  if (typeof v === "function") throw new Error(`fn at ${p}`);
  if (v != null && typeof v === "object") {
    if (Array.isArray(v)) v.forEach((x, i) => noFn(x, `${p}[${i}]`));
    else for (const k of Object.keys(v)) noFn(v[k], `${p}.${k}`);
  }
}

function activeWest2Session(x, y) {
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
  const seedA = hashForecastSeed("phase9-test-a");
  const rng1 = createDeterministicForecastRng(seedA);
  const rng2 = createDeterministicForecastRng(seedA);
  const a = [randomFloat01(rng1), randomFloat01(rng1), randomFloat01(rng1)];
  const b = [randomFloat01(rng2), randomFloat01(rng2), randomFloat01(rng2)];
  assert(JSON.stringify(a) === JSON.stringify(b), "rng stable for same seed");
  console.log("[PASS] RNG deterministic");

  const origRandom = Math.random;
  let patched = false;
  Math.random = () => {
    patched = true;
    throw new Error("Math.random disabled for forecast test");
  };
  try {
    const west2 = getWildernessRegionProfile("West2");
    const area = getWildernessAreaSpec("west2_old_marker_patrol_line");
    const terrain = getTerrainBiomeDef("managed_compacted_route");
    const snap = normalizeWeatherForecastSnapshot({
      weatherEventType: "clear",
      weatherEventEndsAtMinute: 120,
      cloudType: "Clear",
      stormIntensity: 0.02
    });
    const surf = buildWildernessSurfaceRuntime({
      regionProfile: west2,
      terrainDef: terrain,
      worldWeather: { snowfallRate: 0, snowIntensityLevel: "None", isSnowing: false, windSpeed_local: 2, cloudTrans: 0.2 },
      minuteOfDay: 600
    });
    const fc = buildWildernessWeatherForecast({
      wilderness: activeWest2Session(0, 0),
      areaSpec: area,
      regionProfile: west2,
      terrainDef: terrain,
      surfaceRuntime: surf,
      worldWeather: snap,
      totalMinutes: 100
    });
    noFn(fc);
    assert(isWildernessWeatherForecast(fc), "isWildernessWeatherForecast");
    assert(!patched, "forecast path did not call Math.random");
  } finally {
    Math.random = origRandom;
  }
  console.log("[PASS] Math.random monkey patch not used by forecast");

  const west2 = getWildernessRegionProfile("West2");
  const profLs = { cloudType: "Stratiform", stormIntensity: 0.22 };
  const profHv = { cloudType: "Cumulonimbus", stormIntensity: 0.75 };
  const rLs = computeForecastSnowfallRate({ regionProfile: west2, cloudType: profLs.cloudType, stormIntensity: profLs.stormIntensity });
  const rHv = computeForecastSnowfallRate({ regionProfile: west2, cloudType: profHv.cloudType, stormIntensity: profHv.stormIntensity });
  assert(Math.abs(rLs - 0.3564) < 0.0001, `West2 light snow rate ${rLs}`);
  assert(Math.abs(rHv - 2.025) < 0.0001, `West2 heavy snow rate ${rHv}`);
  assert(computeForecastSnowfallRate({ regionProfile: west2, cloudType: "Clear", stormIntensity: 0.02 }) === 0, "clear precip 0");
  assert(computeForecastSnowfallRate({ regionProfile: west2, cloudType: "Stratiform", stormIntensity: 0 }) === 0, "overcast precip 0");
  assert(
    computeForecastSnowfallRate({ regionProfile: west2, cloudType: "Clear", stormIntensity: 0.58 }) === 0,
    "windy_clear precip 0"
  );
  assert(classifyForecastSnowIntensity(rLs) === "Light", "classify light");
  assert(classifyForecastSnowIntensity(rHv) === "Heavy", "classify heavy");
  console.log("[PASS] snowfall rate + classify");

  const nowChain = 10000;
  const snapChain = normalizeWeatherForecastSnapshot({
    weatherEventType: "clear",
    weatherEventEndsAtMinute: nowChain + 25
  });
  const ev24 = simulateWeatherEventsDeterministic({
    weatherSnapshot: snapChain,
    regionProfile: west2,
    totalMinutes: nowChain,
    durationMinutes: 1440,
    seedInput: 42
  });
  const hasSnowWest = ev24.some((e) => e.type === "light_snow" || e.type === "heavy_snow");
  assert(hasSnowWest, "West2 24h sim may include snow");
  console.log("[PASS] West2 24h simulation may include snow");

  const camb = getWildernessRegionProfile("CambCity");
  const evC = simulateWeatherEventsDeterministic({
    weatherSnapshot: snapChain,
    regionProfile: camb,
    totalMinutes: nowChain,
    durationMinutes: 1440,
    seedInput: 999
  });
  assert(!evC.some((e) => e.type === "light_snow" || e.type === "heavy_snow"), "non-West2 no snow event types");
  console.log("[PASS] non-West2 24h no light/heavy snow events");

  const wLs = getWeatherEventWeights("West2", "light_snow").find((x) => x[0] === "light_snow")[1];
  const wLsFresh = getWeatherEventWeights("West2", "clear").find((x) => x[0] === "light_snow")[1];
  assert(wLs < wLsFresh && Math.abs(wLs / wLsFresh - 0.35) < 0.0001, "same-event penalty 0.35");
  console.log("[PASS] same-event weight penalty");

  const clearNow = buildShortNowcast30m({
    weatherSnapshot: normalizeWeatherForecastSnapshot({
      weatherEventType: "clear",
      weatherEventEndsAtMinute: 200000,
      snowIntensityLevel: "None"
    }),
    regionProfile: west2,
    totalMinutes: 5000
  });
  assert(!clearNow.text.includes("可能马上下雪"), "clear nowcast wording");
  console.log("[PASS] clear 30m nowcast avoids forbidden phrase");

  const oc = buildShortNowcast30m({
    weatherSnapshot: normalizeWeatherForecastSnapshot({
      weatherEventType: "overcast",
      weatherEventEndsAtMinute: 5010,
      cloudType: "Stratiform",
      stormIntensity: 0
    }),
    regionProfile: west2,
    totalMinutes: 5000
  });
  assert(
    ["snow_possible", "may_shift"].includes(oc.likelyMotion) && oc.snowChanceBand === "medium",
    "overcast ending+West2"
  );
  console.log("[PASS] overcast ending soon West2");

  const hv = buildShortNowcast30m({
    weatherSnapshot: normalizeWeatherForecastSnapshot({
      weatherEventType: "heavy_snow",
      weatherEventEndsAtMinute: 200000
    }),
    regionProfile: west2,
    totalMinutes: 0
  });
  assert(hv.snowChanceBand === "high" && hv.visibilityRiskBand === "high", "heavy nowcast bands");
  console.log("[PASS] heavy_snow nowcast");

  const wc = buildShortNowcast30m({
    weatherSnapshot: normalizeWeatherForecastSnapshot({
      weatherEventType: "windy_clear",
      weatherEventEndsAtMinute: 200000,
      cloudType: "Clear",
      stormIntensity: 0.58
    }),
    regionProfile: west2,
    totalMinutes: 0
  });
  assert(wc.likelyMotion === "wind_rising" && (wc.windRiskBand === "high" || wc.windRiskBand === "medium"), "windy_clear wind");
  assert(wc.snowChanceBand === "none", "windy_clear no snow band");
  console.log("[PASS] windy_clear nowcast");

  const exSevere = buildExtremeOutlook72h({
    weatherSnapshot: snapChain,
    regionProfile: west2,
    totalMinutes: nowChain,
    seedInput: 176098
  });
  assert(exSevere.extremeRisk === "severe", `extreme severe got ${exSevere.extremeRisk}`);
  console.log("[PASS] 72h heavy cluster can reach severe");

  replaceGameState(createDefaultGameState());
  const gs = gameState;
  gs.world.wilderness = activeWest2Session(0, 0);
  gs.world.weather = {
    weatherEventType: "clear",
    weatherEventEndsAtMinute: 150,
    cloudType: "Clear",
    stormIntensity: 0.02,
    snowfallRate: 0,
    isSnowing: false,
    snowIntensityLevel: "None",
    windSpeed_local: 3,
    windDir_local: "E",
    cloudTrans: 0.2,
    whiteout: false
  };
  gs.time.totalMinutes = 100;
  const wJson = JSON.stringify(gs.world.weather);
  const wildJson = JSON.stringify(gs.world.wilderness);
  const tJson = JSON.stringify(gs.time);
  const pJson = JSON.stringify(gs.player);
  const vm = buildWildernessViewModel(gs);
  assert(vm.weatherForecast && typeof vm.weatherForecast === "object", "vm.weatherForecast");
  assert(JSON.stringify(gs.world.weather) === wJson, "weather unchanged");
  assert(JSON.stringify(gs.world.wilderness) === wildJson, "wilderness unchanged");
  assert(JSON.stringify(gs.time) === tJson, "time unchanged");
  assert(JSON.stringify(gs.player) === pJson, "player unchanged");
  const nActs = vm.actions.length;
  assert(nActs === 9, "no extra actions");
  const frag = renderWildernessRuntime(vm);
  assert(frag && (frag.__wildernessRuntimeHeadlessStub === true || typeof frag.appendChild === "function"), "fragment");
  console.log("[PASS] vm + immutability + fragment");

  console.log("[PASS] wilderness_weather_forecast_contract_check");
}

main();
