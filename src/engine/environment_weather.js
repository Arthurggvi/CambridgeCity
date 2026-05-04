import { gameState } from "./state.js";
import { getTimeView, publishWorldTimeDebug } from "./time.js";
import { getCalendarView, getIlluminationView, getSolarView } from "./illumination.js";
import { loadRegionData } from "./loader.js";
import { computeEnvTempC } from "../systems/temperature/temperature_system.js";

export const CloudType = Object.freeze({
  Clear: "Clear",
  Cirrus: "Cirrus",
  Stratiform: "Stratiform",
  Cumulonimbus: "Cumulonimbus"
});

export const SnowIntensityLevel = Object.freeze({
  None: "None",
  Light: "Light",
  Moderate: "Moderate",
  Heavy: "Heavy"
});

export const ExposureLevel = Object.freeze({
  Sheltered: "Sheltered",
  SemiSheltered: "SemiSheltered",
  Open: "Open",
  Ridge: "Ridge"
});

const CLOUD_PRECIP_FACTOR = Object.freeze({
  [CloudType.Clear]: 0.0,
  [CloudType.Cirrus]: 0.1,
  [CloudType.Stratiform]: 0.6,
  [CloudType.Cumulonimbus]: 1.0
});

const EXPOSURE_FACTOR = Object.freeze({
  [ExposureLevel.Sheltered]: 0.3,
  [ExposureLevel.SemiSheltered]: 0.6,
  [ExposureLevel.Open]: 1.0,
  [ExposureLevel.Ridge]: 1.4
});

const WIND_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const WIND_DIR_INDEX = Object.freeze(Object.fromEntries(WIND_DIRS.map((d, i) => [d, i])));

const WeatherEventType = Object.freeze({
  Clear: "clear",
  Overcast: "overcast",
  LightSnow: "light_snow",
  HeavySnow: "heavy_snow",
  WindyClear: "windy_clear"
});

const WEATHER_EVENT_PROFILE_BY_TYPE = Object.freeze({
  [WeatherEventType.Clear]: Object.freeze({
    cloudType: CloudType.Clear,
    stormIntensity: 0.02
  }),
  [WeatherEventType.Overcast]: Object.freeze({
    cloudType: CloudType.Stratiform,
    stormIntensity: 0
  }),
  [WeatherEventType.LightSnow]: Object.freeze({
    cloudType: CloudType.Stratiform,
    stormIntensity: 0.22
  }),
  // heavy_snow uses Cumulonimbus so the existing snowfall formula can reach a real heavy-snow band.
  [WeatherEventType.HeavySnow]: Object.freeze({
    cloudType: CloudType.Cumulonimbus,
    stormIntensity: 0.75
  }),
  [WeatherEventType.WindyClear]: Object.freeze({
    cloudType: CloudType.Clear,
    stormIntensity: 0.58
  })
});

const WEATHER_EVENT_DURATION_RANGE_BY_TYPE = Object.freeze({
  [WeatherEventType.Clear]: Object.freeze({ min: 240, max: 480 }),
  [WeatherEventType.Overcast]: Object.freeze({ min: 180, max: 360 }),
  [WeatherEventType.LightSnow]: Object.freeze({ min: 120, max: 240 }),
  [WeatherEventType.HeavySnow]: Object.freeze({ min: 90, max: 180 }),
  [WeatherEventType.WindyClear]: Object.freeze({ min: 120, max: 300 })
});

const K_STORM = 1.8;
const MAX_DIR_OFFSET_STEPS = 1; // 45°

/** @type {Record<string, any>} */
let regionConfigById = {};

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function toNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

function randomIntInclusive(min, max) {
  const safeMin = Math.max(0, Math.trunc(Number(min) || 0));
  const safeMax = Math.max(safeMin, Math.trunc(Number(max) || safeMin));
  return safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
}

function getSnowIntensity(rate) {
  if (rate < 0.01) return SnowIntensityLevel.None;
  if (rate < 0.5) return SnowIntensityLevel.Light;
  if (rate < 1.5) return SnowIntensityLevel.Moderate;
  return SnowIntensityLevel.Heavy;
}

function sampleExposureFromMap() {
  const e = gameState.currentMap?.environment?.exposureLevel;
  if (e && EXPOSURE_FACTOR[e] !== undefined) return e;
  return ExposureLevel.Open;
}

function shiftWindDir(baseDir, offsetSteps) {
  const idx = WIND_DIR_INDEX[baseDir] ?? 0;
  const next = (idx + offsetSteps + WIND_DIRS.length) % WIND_DIRS.length;
  return WIND_DIRS[next];
}

function getWeatherEventWeights(regionId, previousEventType = "") {
  const normalizedRegionId = String(regionId || "").trim();
  const baseWeights = normalizedRegionId === "West2"
    ? [
        [WeatherEventType.Clear, 0.32],
        [WeatherEventType.Overcast, 0.24],
        [WeatherEventType.LightSnow, 0.26],
        [WeatherEventType.HeavySnow, 0.10],
        [WeatherEventType.WindyClear, 0.08]
      ]
    : [
        [WeatherEventType.Clear, 0.74],
        [WeatherEventType.Overcast, 0.18],
        [WeatherEventType.WindyClear, 0.08],
        [WeatherEventType.LightSnow, 0.0],
        [WeatherEventType.HeavySnow, 0.0]
      ];

  const previousKey = String(previousEventType || "").trim();
  return baseWeights.map(([eventType, weight]) => [eventType, previousKey && previousKey === eventType ? weight * 0.35 : weight]);
}

function pickWeightedWeatherEvent(regionId, previousEventType = "") {
  const weights = getWeatherEventWeights(regionId, previousEventType)
    .filter(([, weight]) => Number(weight) > 0);

  const totalWeight = weights.reduce((sum, [, weight]) => sum + Number(weight), 0);
  if (totalWeight <= 0) return WeatherEventType.Clear;

  let cursor = Math.random() * totalWeight;
  for (const [eventType, weight] of weights) {
    cursor -= Number(weight);
    if (cursor <= 0) return eventType;
  }

  return String(weights[weights.length - 1]?.[0] || WeatherEventType.Clear);
}

function buildWeatherEventState(region, weather, nowMinutes) {
  const previousEventType = String(weather?.weatherEventType || "").trim().toLowerCase();
  const eventType = pickWeightedWeatherEvent(region?.RegionId, previousEventType);
  const profile = WEATHER_EVENT_PROFILE_BY_TYPE[eventType] || WEATHER_EVENT_PROFILE_BY_TYPE[WeatherEventType.Clear];
  const durationRange = WEATHER_EVENT_DURATION_RANGE_BY_TYPE[eventType] || WEATHER_EVENT_DURATION_RANGE_BY_TYPE[WeatherEventType.Clear];
  const durationMinutes = Math.max(1, randomIntInclusive(durationRange.min, durationRange.max));

  return {
    weatherEventType: eventType,
    weatherEventEndsAtMinute: nowMinutes + durationMinutes,
    cloudType: profile.cloudType,
    stormIntensity: profile.stormIntensity
  }; 
}

function buildBootstrapClearEvent(nowMinutes) {
  const durationRange = WEATHER_EVENT_DURATION_RANGE_BY_TYPE[WeatherEventType.Clear] || { min: 240, max: 480 };
  const durationMinutes = Math.max(1, randomIntInclusive(durationRange.min, durationRange.max));
  const profile = WEATHER_EVENT_PROFILE_BY_TYPE[WeatherEventType.Clear];
  return {
    weatherEventType: WeatherEventType.Clear,
    weatherEventEndsAtMinute: nowMinutes + durationMinutes,
    cloudType: profile.cloudType,
    stormIntensity: profile.stormIntensity
  };
}

function shouldSeedBootstrapClear(weather, nowMinutes) {
  const eventType = String(weather?.weatherEventType || "").trim().toLowerCase();
  const endsAtMinute = toNonNegativeInt(weather?.weatherEventEndsAtMinute, 0);
  const cloudType = String(weather?.cloudType || "").trim();
  const stormIntensity = Number(weather?.stormIntensity || 0);
  return nowMinutes >= 0
    && endsAtMinute <= 0
    && (!eventType || eventType === WeatherEventType.Clear)
    && cloudType === CloudType.Clear
    && stormIntensity <= 0.02;
}

function progressWeatherEvent(region, weather, totalMinutes) {
  const nowMinutes = toNonNegativeInt(totalMinutes, 0);
  const currentEventType = String(weather?.weatherEventType || "").trim().toLowerCase();
  const endsAtMinute = toNonNegativeInt(weather?.weatherEventEndsAtMinute, 0);
  const hasKnownEventType = Object.prototype.hasOwnProperty.call(WEATHER_EVENT_PROFILE_BY_TYPE, currentEventType);
  const hasActiveEvent = hasKnownEventType && endsAtMinute > nowMinutes;

  if (hasActiveEvent) {
    return;
  }

  // Boot starts with a stable clear window so a fresh new game does not immediately spawn into snowfall.
  const nextEvent = shouldSeedBootstrapClear(weather, nowMinutes)
    ? buildBootstrapClearEvent(nowMinutes)
    : buildWeatherEventState(region, weather, nowMinutes);
  weather.cloudType = nextEvent.cloudType;
  weather.stormIntensity = nextEvent.stormIntensity;
  weather.weatherEventType = nextEvent.weatherEventType;
  weather.weatherEventEndsAtMinute = nextEvent.weatherEventEndsAtMinute;
}

function updateWorldLegacyFields(world) {
  world.sun = world.weather.sun;
  world.snowfallRate = world.weather.snowfallRate;
  world.windSpeed = world.weather.windSpeed_local;
  world.tEnv = world.weather.tEnv_region;
}

function applyIlluminationCompat(world, totalMinutes) {
  const illumination = getIlluminationView(totalMinutes, world);

  world.weather.cloudTrans = illumination.cloudTrans;
  world.weather.sunClear = illumination.sunClear;
  world.weather.sun = illumination.sun;
  publishWorldTimeDebug(totalMinutes, world);

  return illumination;
}

function computeSnowfall(region, weather) {
  const cloudFactor = CLOUD_PRECIP_FACTOR[weather.cloudType] ?? 0;
  const storm = clamp01(weather.stormIntensity);
  const snowfallRate = region.Pmax * cloudFactor * storm * region.MoistureIndex;
  const level = getSnowIntensity(snowfallRate);

  weather.snowfallRate = snowfallRate;
  weather.isSnowing = level !== SnowIntensityLevel.None;
  weather.snowIntensityLevel = level;
}

function computeWind(region, weather) {
  const natural = region.WindBase + region.WindVar * (Math.random() * 2 - 1);
  const stormBoost = clamp01(weather.stormIntensity) * region.WindVar * K_STORM;
  const windSpeedRegion = Math.max(0, natural + stormBoost);

  const randDir = Math.round((Math.random() * 2 - 1) * MAX_DIR_OFFSET_STEPS);
  const windDirRegion = shiftWindDir(region.WindDir_prevailing, randDir);

  const exposureLevel = sampleExposureFromMap();
  const factor = EXPOSURE_FACTOR[exposureLevel] ?? 1.0;
  const windSpeedLocal = windSpeedRegion * factor;
  const windDirLocal = shiftWindDir(windDirRegion, Math.round((Math.random() * 2 - 1)));

  weather.exposureLevel = exposureLevel;
  weather.windSpeed_region = windSpeedRegion;
  weather.windDir_region = windDirRegion;
  weather.windSpeed_local = windSpeedLocal;
  weather.windDir_local = windDirLocal;
}

function ensureWeatherState() {
  if (!gameState.world.weather) {
    gameState.world.weather = {
      cloudType: CloudType.Clear,
      stormIntensity: 0,
      weatherEventType: WeatherEventType.Clear,
      weatherEventEndsAtMinute: 0,
      cloudTrans: 1,
      sunClear: 0,
      sun: 0,
      snowfallRate: 0,
      isSnowing: false,
      snowIntensityLevel: SnowIntensityLevel.None,
      windSpeed_region: 0,
      windDir_region: "E",
      windSpeed_local: 0,
      windDir_local: "E",
      exposureLevel: ExposureLevel.Open,
      tEnv_region: -10
    };
    return;
  }

  const weather = gameState.world.weather;
  if (typeof weather.weatherEventType !== "string" || weather.weatherEventType.trim() === "") {
    weather.weatherEventType = WeatherEventType.Clear;
  }
  if (!Number.isFinite(Number(weather.weatherEventEndsAtMinute))) {
    weather.weatherEventEndsAtMinute = 0;
  }
}

function getRegionConfig() {
  const regionId = gameState.world.regionId;
  return regionConfigById[regionId] || regionConfigById.CambCity || Object.values(regionConfigById)[0] || null;
}

export function forceWeatherEvent(eventType, durationMinutes) {
  ensureWeatherState();

  const region = getRegionConfig();
  if (!region) return null;

  const normalizedEventType = String(eventType || "").trim().toLowerCase();
  const profile = WEATHER_EVENT_PROFILE_BY_TYPE[normalizedEventType];
  if (!profile) {
    throw new Error(`Unknown weather event type: ${normalizedEventType || "(empty)"}`);
  }

  const nowMinutes = toNonNegativeInt(gameState?.time?.totalMinutes, 0);
  const durationRange = WEATHER_EVENT_DURATION_RANGE_BY_TYPE[normalizedEventType] || WEATHER_EVENT_DURATION_RANGE_BY_TYPE[WeatherEventType.Clear];
  const resolvedDurationMinutes = Number.isFinite(Number(durationMinutes)) && Number(durationMinutes) > 0
    ? Math.max(1, Math.trunc(Number(durationMinutes)))
    : Math.max(1, Number(durationRange?.min) || 1);

  const weather = gameState.world.weather;
  weather.cloudType = profile.cloudType;
  weather.stormIntensity = profile.stormIntensity;
  weather.weatherEventType = normalizedEventType;
  weather.weatherEventEndsAtMinute = nowMinutes + resolvedDurationMinutes;

  updateEnvironmentWeather();

  return {
    totalMinutes: nowMinutes,
    weatherEventType: weather.weatherEventType,
    weatherEventEndsAtMinute: weather.weatherEventEndsAtMinute,
    cloudType: weather.cloudType,
    stormIntensity: weather.stormIntensity,
    snowfallRate: weather.snowfallRate,
    isSnowing: weather.isSnowing,
    snowIntensityLevel: weather.snowIntensityLevel
  };
}

export function updateEnvironmentWeather() {
  ensureWeatherState();

  const region = getRegionConfig();
  if (!region) return;

  const weather = gameState.world.weather;
  progressWeatherEvent(region, weather, gameState?.time?.totalMinutes);
  if (!CLOUD_PRECIP_FACTOR[weather.cloudType]) weather.cloudType = CloudType.Clear;
  weather.stormIntensity = clamp01(Number(weather.stormIntensity) || 0);

  const timeView = getTimeView();
  computeSnowfall(region, weather);
  computeWind(region, weather);
  const illumination = applyIlluminationCompat(gameState.world, timeView.totalMinutes);
  weather.tEnv_region = computeEnvTempC(region, timeView, gameState.world);
  updateWorldLegacyFields(gameState.world);

  return {
    calendar: getCalendarView(timeView.totalMinutes, gameState.world),
    solar: getSolarView(timeView.totalMinutes, gameState.world),
    illumination
  };
}

export async function initEnvironmentWeatherSystem() {
  const data = await loadRegionData();
  if (!data || !Array.isArray(data.regions)) {
    console.error("[天气系统] 区域配置加载失败");
    return false;
  }

  regionConfigById = {};
  for (const r of data.regions) {
    regionConfigById[r.RegionId] = r;
  }

  if (!regionConfigById[gameState.world.regionId]) {
    gameState.world.regionId = "CambCity";
  }

  // 初始化一次，确保旧兼容字段（sun/cloudTrans 等）与新光照派生链立即同步。
  updateEnvironmentWeather();
  return true;
}
