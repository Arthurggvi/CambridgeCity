// ============================================================================
// 极地光照主链（纯函数，无状态）
// ============================================================================
// 发行版契约：
// 1. time.totalMinutes 仍是唯一时间真值。
// 2. illumination.js 是自然光 / 季节 / 可见度的唯一派生真值。
// 3. ServiceBand 继续留在 time_phases.js；本模块不承载制度班次语义。
// 4. 下游统一消费冻结输出契约；旧字段仅保留桥接别名。
// ============================================================================

import {
  AMBIENT_LIGHT_MODEL,
  MINUTES_PER_DAY,
  SEASON_PROFILE_THRESHOLDS,
  SOLAR_ELEVATION_MODEL,
  SOLAR_MODEL,
  SUN_LEVEL_THRESHOLDS,
  VISIBILITY_MODEL,
  WEATHER_ATTENUATION
} from "./illumination_constants.js";
import {
  getCalendarViewFromTotalMinutes,
  getDayIndexInYear,
  normalizeDayOfYear,
  normalizeWorldCalendar
} from "./calendar_model.js";
import { getRegionLightProfile } from "./region_light_profiles.js";

export const IlluminationLightPhase = Object.freeze({
  PolarDay: "polar_day",
  LowSun: "low_sun",
  Twilight: "twilight",
  PolarNight: "polar_night",
  Whiteout: "whiteout"
});

export const VisibilityBand = Object.freeze({
  Clear: "clear",
  Low: "low",
  Hazard: "hazard"
});

export const SunLevel = Object.freeze({
  Dark: "Dark",
  Dim: "Dim",
  Weak: "Weak",
  Strong: "Strong"
});

export const SeasonProfile = Object.freeze({
  PolarSummer: "polar_summer",
  Transition: "transition",
  PolarWinter: "polar_winter"
});

const LIGHT_PHASE_LABELS_ZH = Object.freeze({
  [IlluminationLightPhase.PolarDay]: "极昼",
  [IlluminationLightPhase.LowSun]: "低日照",
  [IlluminationLightPhase.Twilight]: "微光",
  [IlluminationLightPhase.PolarNight]: "极夜",
  [IlluminationLightPhase.Whiteout]: "白障"
});

const VISIBILITY_BAND_LABELS_ZH = Object.freeze({
  [VisibilityBand.Clear]: "清晰",
  [VisibilityBand.Low]: "受限",
  [VisibilityBand.Hazard]: "危险"
});

export const DEFAULT_ILLUMINATION_CALIBRATION_SCENARIOS = Object.freeze([
  Object.freeze({ id: "cambcity-equinox-noon-clear", label: "CambCity transition noon clear", regionId: "CambCity", dayOfYear: 96, minuteOfDay: 720, weather: { cloudType: "Clear", stormIntensity: 0, snowfallRate: 0, windSpeed_local: 6 } }),
  Object.freeze({ id: "west2-summer-midday-clear", label: "West2 polar summer midday clear", regionId: "West2", dayOfYear: 180, minuteOfDay: 720, weather: { cloudType: "Clear", stormIntensity: 0, snowfallRate: 0, windSpeed_local: 8 } }),
  Object.freeze({ id: "west2-summer-midnight-clear", label: "West2 polar summer midnight clear", regionId: "West2", dayOfYear: 180, minuteOfDay: 0, weather: { cloudType: "Clear", stormIntensity: 0, snowfallRate: 0, windSpeed_local: 8 } }),
  Object.freeze({ id: "west2-winter-noon-overcast", label: "West2 polar winter noon stratiform", regionId: "West2", dayOfYear: 0, minuteOfDay: 720, weather: { cloudType: "Stratiform", stormIntensity: 0.25, snowfallRate: 0.5, windSpeed_local: 10 } }),
  Object.freeze({ id: "oldcamb-transition-dawn", label: "OldCamb transition dawn cirrus", regionId: "OldCamb", dayOfYear: 96, minuteOfDay: 360, weather: { cloudType: "Cirrus", stormIntensity: 0.1, snowfallRate: 0.1, windSpeed_local: 9 } }),
  Object.freeze({ id: "oldcamb-winter-noon-storm", label: "OldCamb winter noon storm", regionId: "OldCamb", dayOfYear: 12, minuteOfDay: 720, weather: { cloudType: "Cumulonimbus", stormIntensity: 0.8, snowfallRate: 1.6, windSpeed_local: 16 } }),
  Object.freeze({ id: "south1-summer-noon-clear", label: "South1 summer noon clear", regionId: "South1", dayOfYear: 180, minuteOfDay: 720, weather: { cloudType: "Clear", stormIntensity: 0, snowfallRate: 0, windSpeed_local: 12 } }),
  Object.freeze({ id: "south1-summer-midnight-low-snow", label: "South1 summer midnight light snow", regionId: "South1", dayOfYear: 180, minuteOfDay: 0, weather: { cloudType: "Cirrus", stormIntensity: 0.18, snowfallRate: 0.35, windSpeed_local: 12 } }),
  Object.freeze({ id: "south1-winter-noon-whiteout", label: "South1 winter noon whiteout", regionId: "South1", dayOfYear: 0, minuteOfDay: 720, weather: { cloudType: "Cumulonimbus", stormIntensity: 0.94, snowfallRate: 2.1, windSpeed_local: 19 } })
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function roundTo(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clampPercent(value) {
  return clamp(roundTo(value, 3), 0, 100);
}

function normalizeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normalizeTotalMinutes(totalMinutes) {
  return Math.max(0, normalizeInt(totalMinutes, 0));
}

function getWeatherView(world) {
  const weather = world && typeof world === "object" && world.weather && typeof world.weather === "object"
    ? world.weather
    : {};

  return {
    cloudType: String(weather.cloudType || "Clear"),
    stormIntensity: clamp01(Number(weather.stormIntensity) || 0),
    snowfallRate: Math.max(0, Number(weather.snowfallRate) || 0),
    windSpeedLocal: Math.max(
      0,
      Number.isFinite(Number(weather.windSpeed_local))
        ? Number(weather.windSpeed_local)
        : Number(world?.windSpeed) || 0
    )
  };
}

function getSeasonProfileFromLight(seasonalLight01) {
  if (seasonalLight01 >= SEASON_PROFILE_THRESHOLDS.polarSummerMin) return SeasonProfile.PolarSummer;
  if (seasonalLight01 <= SEASON_PROFILE_THRESHOLDS.polarWinterMax) return SeasonProfile.PolarWinter;
  return SeasonProfile.Transition;
}

function getSeasonProgress(seasonalLight01, seasonProfile) {
  if (seasonProfile === SeasonProfile.PolarSummer) {
    return clamp01(
      (seasonalLight01 - SEASON_PROFILE_THRESHOLDS.polarSummerMin)
      / (1 - SEASON_PROFILE_THRESHOLDS.polarSummerMin)
    );
  }
  if (seasonProfile === SeasonProfile.PolarWinter) {
    return clamp01(
      (SEASON_PROFILE_THRESHOLDS.polarWinterMax - seasonalLight01)
      / SEASON_PROFILE_THRESHOLDS.polarWinterMax
    );
  }
  return clamp01(
    (seasonalLight01 - SEASON_PROFILE_THRESHOLDS.polarWinterMax)
    / (SEASON_PROFILE_THRESHOLDS.polarSummerMin - SEASON_PROFILE_THRESHOLDS.polarWinterMax)
  );
}

export function getLightPhaseLabel(lightPhase) {
  return LIGHT_PHASE_LABELS_ZH[lightPhase] ?? String(lightPhase ?? "");
}

export function getVisibilityBandLabel(visibilityBand) {
  return VISIBILITY_BAND_LABELS_ZH[visibilityBand] ?? String(visibilityBand ?? "");
}

export function getSeasonView(dayOfYear, world = {}) {
  const calendar = normalizeWorldCalendar(world?.calendar || {});
  const yearLength = calendar.yearLength;
  const normalizedDayOfYear = normalizeDayOfYear(dayOfYear, yearLength);
  const dayIndexInYear = getDayIndexInYear(normalizedDayOfYear, yearLength);
  const regionProfile = getRegionLightProfile(world?.regionId);
  const yearProgress01 = dayIndexInYear / yearLength;

  const baseSeasonalLight01 = clamp01(
    0.5 + 0.5 * Math.cos(2 * Math.PI * yearProgress01)
  );
  const seasonalLight01 = clamp01(baseSeasonalLight01 + regionProfile.seasonBias01);
  const seasonProfile = getSeasonProfileFromLight(seasonalLight01);
  const seasonProgress = getSeasonProgress(seasonalLight01, seasonProfile);

  return {
    dayOfYear: normalizedDayOfYear,
    dayIndexInYear,
    yearLength,
    yearProgress01,
    baseSeasonalLight01,
    seasonalLight01,
    seasonProfile,
    seasonProgress,
    regionId: String(world?.regionId || "CambCity"),
    polarIndex: clamp01(regionProfile.polarIndex),
    seasonBias01: regionProfile.seasonBias01
  };
}

function getCloudTransmission(cloudType, stormIntensity) {
  const base = WEATHER_ATTENUATION.cloudBaseTrans[cloudType] ?? WEATHER_ATTENUATION.cloudBaseTrans.Clear;
  const stormPenalty = WEATHER_ATTENUATION.stormCloudPenalty * stormIntensity;
  return roundTo(
    clamp(
      base * (1 - stormPenalty),
      WEATHER_ATTENUATION.minCloudTrans,
      WEATHER_ATTENUATION.maxCloudTrans
    )
  );
}

function classifySunLevel(sun) {
  if (sun <= SUN_LEVEL_THRESHOLDS.darkMax) return SunLevel.Dark;
  if (sun <= SUN_LEVEL_THRESHOLDS.dimMax) return SunLevel.Dim;
  if (sun <= SUN_LEVEL_THRESHOLDS.weakMax) return SunLevel.Weak;
  return SunLevel.Strong;
}

function resolveVisibilityState({ cloudTrans, snowfallRate, windSpeedLocal, stormIntensity, visibilityBias01 }) {
  const cloudPenalty = clamp01((1 - cloudTrans) * VISIBILITY_MODEL.cloudPenaltyWeight);
  const snowPenalty = clamp01((snowfallRate / VISIBILITY_MODEL.snowPenaltyDivisor) * VISIBILITY_MODEL.snowPenaltyWeight);
  const windPenalty = clamp01((windSpeedLocal / VISIBILITY_MODEL.windPenaltyDivisor) * VISIBILITY_MODEL.windPenaltyWeight);
  const stormPenalty = clamp01(stormIntensity * VISIBILITY_MODEL.stormPenaltyWeight);
  const visibilityScore = clamp01(
    1 - clamp01(cloudPenalty + snowPenalty + windPenalty + stormPenalty) + visibilityBias01
  );

  let band = VisibilityBand.Clear;
  if (visibilityScore < VISIBILITY_MODEL.hazardMaxScore) band = VisibilityBand.Hazard;
  else if (visibilityScore < VISIBILITY_MODEL.lowMaxScore) band = VisibilityBand.Low;

  const whiteout = band === VisibilityBand.Hazard && (
    visibilityScore <= VISIBILITY_MODEL.whiteoutMaxScore ||
    (snowfallRate >= VISIBILITY_MODEL.whiteoutSnowfallThreshold && windSpeedLocal >= VISIBILITY_MODEL.whiteoutWindThreshold) ||
    (stormIntensity >= VISIBILITY_MODEL.whiteoutStormThreshold && cloudTrans <= VISIBILITY_MODEL.whiteoutCloudTransMax) ||
    (snowfallRate >= VISIBILITY_MODEL.whiteoutAltSnowfallThreshold && windSpeedLocal >= VISIBILITY_MODEL.whiteoutAltWindThreshold)
  );

  return {
    band,
    // Release contract: Visibility.score is a normalized ratio in 0..1.
    score: roundTo(visibilityScore),
    whiteout,
    penalties: {
      cloudPenalty: roundTo(cloudPenalty),
      snowPenalty: roundTo(snowPenalty),
      windPenalty: roundTo(windPenalty),
      stormPenalty: roundTo(stormPenalty)
    }
  };
}

function resolveLightPhase({ seasonProfile, solarBand, solarElevationDeg, daylightHours, sun, visibilityBand, whiteout }) {
  if (whiteout) return IlluminationLightPhase.Whiteout;
  if (
    solarBand === "night" &&
    solarElevationDeg <= SOLAR_MODEL.polarNightMaxSolarElevationDeg &&
    sun <= SOLAR_MODEL.polarNightSunThreshold
  ) {
    return IlluminationLightPhase.PolarNight;
  }
  if (
    solarBand === "twilight" &&
    solarElevationDeg <= SOLAR_MODEL.twilightMaxSolarElevationDeg
  ) {
    return IlluminationLightPhase.Twilight;
  }
  if (
    seasonProfile === SeasonProfile.PolarSummer &&
    daylightHours >= SOLAR_MODEL.polarDayMinHours &&
    solarElevationDeg >= SOLAR_MODEL.polarDayMinSolarElevationDeg &&
    sun >= SOLAR_MODEL.polarDayMinSun
  ) {
    return IlluminationLightPhase.PolarDay;
  }
  if (
    visibilityBand === VisibilityBand.Hazard &&
    solarElevationDeg <= SOLAR_MODEL.twilightMaxSolarElevationDeg &&
    sun <= SOLAR_MODEL.hazardTwilightSunThreshold
  ) {
    return IlluminationLightPhase.Twilight;
  }
  return IlluminationLightPhase.LowSun;
}

export function getCalendarView(totalMinutes, world = {}) {
  const normalizedTotalMinutes = normalizeTotalMinutes(totalMinutes);
  const baseCalendarView = getCalendarViewFromTotalMinutes(normalizedTotalMinutes, world);
  const seasonView = getSeasonView(baseCalendarView.dayOfYear, {
    ...world,
    calendar: {
      ...normalizeWorldCalendar(world?.calendar || {}),
      yearLength: baseCalendarView.yearLength
    }
  });

  return {
    ...baseCalendarView,
    yearProgress01: seasonView.yearProgress01,
    seasonalLight01: seasonView.seasonalLight01,
    baseSeasonalLight01: seasonView.baseSeasonalLight01,
    seasonProfile: seasonView.seasonProfile,
    seasonProgress: seasonView.seasonProgress,
    seasonBias01: seasonView.seasonBias01,
    regionId: seasonView.regionId,
    polarIndex: seasonView.polarIndex
  };
}

export function getSolarView(totalMinutes, world = {}) {
  const calendarView = getCalendarView(totalMinutes, world);
  const regionProfile = getRegionLightProfile(world?.regionId);
  const polarIndex = clamp01(regionProfile.polarIndex);
  const minuteOfDay = calendarView.minuteOfDay;
  const spanAmplitude = SOLAR_MODEL.spanBaseMinutes + polarIndex * SOLAR_MODEL.spanPolarBonusMinutes;
  const daySpanMinutes = clamp(
    SOLAR_MODEL.baseDaySpanMinutes + ((calendarView.seasonalLight01 - 0.5) * 2 * spanAmplitude) + regionProfile.daylightBiasMinutes,
    0,
    MINUTES_PER_DAY
  );
  const daylightHours = roundTo(daySpanMinutes / 60);
  const transitionFactor = 1 - Math.abs(calendarView.seasonalLight01 - 0.5) * 2;
  const twilightMarginMinutes = clamp(
    SOLAR_MODEL.twilightBaseMinutes + polarIndex * SOLAR_MODEL.twilightPolarBonusMinutes + transitionFactor * SOLAR_MODEL.twilightTransitionBonusMinutes + regionProfile.twilightBiasMinutes,
    SOLAR_MODEL.twilightMinMinutes,
    SOLAR_MODEL.twilightMaxMinutes
  );

  const coreHalf = daySpanMinutes / 2;
  const twilightHalf = Math.min(720, coreHalf + twilightMarginMinutes);
  const distanceFromNoon = Math.abs(minuteOfDay - 720);
  const noonClear = clampPercent(
    SOLAR_MODEL.noonClearBase
    + calendarView.seasonalLight01 * SOLAR_MODEL.noonClearSeasonalAmp
    - polarIndex * SOLAR_MODEL.noonClearPolarPenalty
  );
  const summerFloor = daySpanMinutes >= 1360
    ? SOLAR_MODEL.summerFloorBase + polarIndex * SOLAR_MODEL.summerFloorPolarAmp
    : 0;
  const twilightMax = clampPercent(
    SOLAR_MODEL.twilightMaxBase
    + polarIndex * SOLAR_MODEL.twilightMaxPolarAmp
    + transitionFactor * SOLAR_MODEL.twilightMaxTransitionAmp
  );
  const solarNoonElevationDeg = roundTo(
    clamp(
      SOLAR_ELEVATION_MODEL.noonBaseDeg
      + calendarView.seasonalLight01 * SOLAR_ELEVATION_MODEL.noonSeasonalAmpDeg
      - polarIndex * SOLAR_ELEVATION_MODEL.noonPolarPenaltyDeg
      + regionProfile.elevationBiasDeg,
      SOLAR_ELEVATION_MODEL.minDeg,
      SOLAR_ELEVATION_MODEL.maxDeg
    )
  );

  let sunClear = 0;
  let solarBand = "night";
  let solarElevationDeg = roundTo(
    clamp(
      SOLAR_ELEVATION_MODEL.minDeg + calendarView.seasonalLight01 * SOLAR_ELEVATION_MODEL.nightSeasonalLiftDeg - polarIndex * SOLAR_ELEVATION_MODEL.nightPolarPenaltyDeg,
      SOLAR_ELEVATION_MODEL.minDeg,
      -1
    )
  );

  if (distanceFromNoon <= coreHalf && coreHalf > 0) {
    const coreProgress = 1 - distanceFromNoon / coreHalf;
    const envelope = Math.sin(coreProgress * Math.PI / 2);
    sunClear = clampPercent(summerFloor + (noonClear - summerFloor) * envelope);
    solarElevationDeg = roundTo(
      clamp(
        Math.max(SOLAR_ELEVATION_MODEL.dayFloorDeg, solarNoonElevationDeg * envelope),
        SOLAR_ELEVATION_MODEL.minDeg,
        SOLAR_ELEVATION_MODEL.maxDeg
      )
    );
    solarBand = "day";
  } else if (distanceFromNoon <= twilightHalf && twilightHalf > coreHalf) {
    const twilightProgress = 1 - (distanceFromNoon - coreHalf) / (twilightHalf - coreHalf);
    const twilightEnvelope = Math.pow(clamp01(twilightProgress), 0.9);
    sunClear = clampPercent(twilightMax * twilightEnvelope);
    solarElevationDeg = roundTo(-SOLAR_ELEVATION_MODEL.twilightDepthDeg * (1 - twilightEnvelope));
    solarBand = "twilight";
  }

  return {
    ...calendarView,
    regionId: String(world?.regionId || "CambCity"),
    polarIndex,
    daylightHours,
    daySpanMinutes: roundTo(daySpanMinutes),
    twilightMarginMinutes: roundTo(twilightMarginMinutes),
    noonClear,
    solarBand,
    sunClear,
    solarElevationDeg,
    solarNoonElevationDeg
  };
}

export function getIlluminationView(totalMinutes, world = {}) {
  const solarView = getSolarView(totalMinutes, world);
  const weatherView = getWeatherView(world);
  const regionProfile = getRegionLightProfile(world?.regionId);

  const cloudTrans = getCloudTransmission(weatherView.cloudType, weatherView.stormIntensity);
  const snowfallDim = clampPercent(
    (weatherView.snowfallRate / WEATHER_ATTENUATION.snowfallDimDivisor) * WEATHER_ATTENUATION.snowfallDimAmp
  );
  const stormDim = clampPercent(weatherView.stormIntensity * WEATHER_ATTENUATION.stormDimAmp);
  const sun = clampPercent(solarView.sunClear * cloudTrans - snowfallDim - stormDim);
  const sunLevel = classifySunLevel(sun);
  const visibilityState = resolveVisibilityState({
    cloudTrans,
    snowfallRate: weatherView.snowfallRate,
    windSpeedLocal: weatherView.windSpeedLocal,
    stormIntensity: weatherView.stormIntensity,
    visibilityBias01: regionProfile.visibilityBias01
  });

  const ambientClearPct = clampPercent(
    (
      AMBIENT_LIGHT_MODEL.clearBase01
      + (solarView.sunClear / 100) * AMBIENT_LIGHT_MODEL.clearSunGain01
      + (solarView.solarBand === "twilight" ? AMBIENT_LIGHT_MODEL.twilightLift01 : 0)
      + (solarView.daylightHours >= 22 ? AMBIENT_LIGHT_MODEL.polarDayLift01 : 0)
      + regionProfile.ambientBias01
    ) * 100
  );
  const ambientWeatherMultiplier = roundTo(
    clamp01(
      AMBIENT_LIGHT_MODEL.cloudFloor01
      + cloudTrans * AMBIENT_LIGHT_MODEL.cloudGain01
      - weatherView.stormIntensity * AMBIENT_LIGHT_MODEL.stormPenalty01
    )
  );
  const ambientSnowGlowPct = clampPercent(
    (weatherView.snowfallRate / AMBIENT_LIGHT_MODEL.snowGlowDivisor) * AMBIENT_LIGHT_MODEL.snowGlowAmp01 * 100
  );
  let ambientLightPct = clampPercent(ambientClearPct * ambientWeatherMultiplier + ambientSnowGlowPct);
  if (visibilityState.whiteout) {
    ambientLightPct = Math.max(ambientLightPct, AMBIENT_LIGHT_MODEL.whiteoutFloorPct);
  }

  const lightPhase = resolveLightPhase({
    seasonProfile: solarView.seasonProfile,
    solarBand: solarView.solarBand,
    solarElevationDeg: solarView.solarElevationDeg,
    daylightHours: solarView.daylightHours,
    sun,
    visibilityBand: visibilityState.band,
    whiteout: visibilityState.whiteout
  });

  const illumination = {
    dayOfYear: solarView.dayOfYear,
    seasonProfile: solarView.seasonProfile,
    seasonProgress: solarView.seasonProgress,
    solarElevationDeg: solarView.solarElevationDeg,
    daylightHours: solarView.daylightHours,
    Sun: {
      clear: solarView.sunClear,
      effective: sun,
      level: sunLevel,
      attenuation: {
        cloudTrans,
        snowfallDim,
        stormDim
      },
      solarBand: solarView.solarBand,
      noonClear: solarView.noonClear,
      solarNoonElevationDeg: solarView.solarNoonElevationDeg
    },
    AmbientLight: {
      clear: ambientClearPct,
      effective: ambientLightPct,
      weatherMultiplier: ambientWeatherMultiplier,
      snowGlow: ambientSnowGlowPct
    },
    Visibility: {
      score: visibilityState.score,
      band: visibilityState.band,
      whiteout: visibilityState.whiteout,
      penalties: visibilityState.penalties
    },
    lightPhase,
    visibilityBand: visibilityState.band,
    isDarkLike:
      visibilityState.whiteout ||
      lightPhase === IlluminationLightPhase.PolarNight ||
      lightPhase === IlluminationLightPhase.Twilight ||
      sunLevel === SunLevel.Dark,
    sunClear: solarView.sunClear,
    cloudTrans,
    sun,
    sunLevel,
    whiteout: visibilityState.whiteout,
    visibilityScore: visibilityState.score,
    ambientLight: ambientLightPct,
    calendarView: {
      year: solarView.year,
      month: solarView.month,
      day: solarView.day,
      dayIndex: solarView.dayIndex,
      minuteOfDay: solarView.minuteOfDay,
      dayOfYear: solarView.dayOfYear,
      season: solarView.season,
      seasonSubphase: solarView.seasonSubphase,
      isClosureSeason: solarView.isClosureSeason,
      closureSeverity01: solarView.closureSeverity01,
      startDayOfYear: solarView.startDayOfYear,
      yearLength: solarView.yearLength,
      yearProgress01: solarView.yearProgress01,
      seasonalLight01: solarView.seasonalLight01,
      seasonProfile: solarView.seasonProfile,
      seasonProgress: solarView.seasonProgress
    },
    solarView: {
      regionId: solarView.regionId,
      polarIndex: solarView.polarIndex,
      daylightHours: solarView.daylightHours,
      daySpanMinutes: solarView.daySpanMinutes,
      twilightMarginMinutes: solarView.twilightMarginMinutes,
      noonClear: solarView.noonClear,
      solarBand: solarView.solarBand,
      solarElevationDeg: solarView.solarElevationDeg,
      solarNoonElevationDeg: solarView.solarNoonElevationDeg
    }
  };

  return illumination;
}

function createCalibrationWorld(scenario) {
  const calendar = normalizeWorldCalendar({
    startYear: 1,
    startDayOfYear: normalizeDayOfYear(scenario.dayOfYear),
    yearLength: 365
  });
  return {
    regionId: scenario.regionId,
    calendar,
    weather: {
      cloudType: scenario.weather?.cloudType ?? "Clear",
      stormIntensity: scenario.weather?.stormIntensity ?? 0,
      snowfallRate: scenario.weather?.snowfallRate ?? 0,
      windSpeed_local: scenario.weather?.windSpeed_local ?? 0
    },
    windSpeed: scenario.weather?.windSpeed_local ?? 0
  };
}

export function getIlluminationCalibrationReport(scenarios = DEFAULT_ILLUMINATION_CALIBRATION_SCENARIOS) {
  return scenarios.map((scenario) => {
    const world = createCalibrationWorld(scenario);
    const illumination = getIlluminationView(scenario.minuteOfDay ?? 720, world);
    return {
      id: scenario.id,
      label: scenario.label,
      regionId: scenario.regionId,
      dayOfYear: illumination.dayOfYear,
      minuteOfDay: scenario.minuteOfDay ?? 720,
      seasonProfile: illumination.seasonProfile,
      seasonProgress: illumination.seasonProgress,
      solarElevationDeg: illumination.solarElevationDeg,
      daylightHours: illumination.daylightHours,
      lightPhase: illumination.lightPhase,
      visibilityBand: illumination.visibilityBand,
      Sun: {
        clear: illumination.Sun.clear,
        effective: illumination.Sun.effective,
        level: illumination.Sun.level
      },
      AmbientLight: {
        clear: illumination.AmbientLight.clear,
        effective: illumination.AmbientLight.effective
      },
      Visibility: {
        score: illumination.Visibility.score,
        whiteout: illumination.Visibility.whiteout
      },
      weather: world.weather
    };
  });
}
