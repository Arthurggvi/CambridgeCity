import {
  DEFAULT_START_DAY_OF_YEAR,
  DEFAULT_YEAR_LENGTH,
  MINUTES_PER_DAY,
  YEAR_LENGTH_LIMITS
} from "./calendar_model.js";

export {
  DEFAULT_START_DAY_OF_YEAR,
  DEFAULT_YEAR_LENGTH,
  MINUTES_PER_DAY,
  YEAR_LENGTH_LIMITS
};

export const SEASON_PROFILE_THRESHOLDS = Object.freeze({
  polarSummerMin: 0.78,
  polarWinterMax: 0.22
});

export const SOLAR_MODEL = Object.freeze({
  baseDaySpanMinutes: 720,
  spanBaseMinutes: 360,
  spanPolarBonusMinutes: 360,
  twilightMinMinutes: 60,
  twilightMaxMinutes: 360,
  twilightBaseMinutes: 90,
  twilightPolarBonusMinutes: 130,
  twilightTransitionBonusMinutes: 120,
  noonClearBase: 34,
  noonClearSeasonalAmp: 48,
  noonClearPolarPenalty: 10,
  summerFloorBase: 8,
  summerFloorPolarAmp: 12,
  twilightMaxBase: 10,
  twilightMaxPolarAmp: 10,
  twilightMaxTransitionAmp: 10,
  polarDaySpanMinutes: 1320,
  polarDayMinHours: 22,
  polarDayMinSun: 24,
  polarDayMinSolarElevationDeg: 6,
  twilightSunThreshold: 18,
  twilightMaxSolarElevationDeg: 0,
  polarNightSunThreshold: 5,
  polarNightMaxSolarElevationDeg: -6,
  hazardTwilightSunThreshold: 20
});

export const SOLAR_ELEVATION_MODEL = Object.freeze({
  minDeg: -12,
  maxDeg: 38,
  noonBaseDeg: -6,
  noonSeasonalAmpDeg: 46,
  noonPolarPenaltyDeg: 14,
  dayFloorDeg: 1.2,
  twilightDepthDeg: 7.5,
  nightSeasonalLiftDeg: 4,
  nightPolarPenaltyDeg: 2
});

export const WEATHER_ATTENUATION = Object.freeze({
  cloudBaseTrans: Object.freeze({
    Clear: 1.0,
    Cirrus: 0.82,
    Stratiform: 0.52,
    Cumulonimbus: 0.22
  }),
  stormCloudPenalty: 0.18,
  minCloudTrans: 0.08,
  maxCloudTrans: 1,
  snowfallDimDivisor: 2.5,
  snowfallDimAmp: 16,
  stormDimAmp: 8
});

export const SUN_LEVEL_THRESHOLDS = Object.freeze({
  darkMax: 5,
  dimMax: 22,
  weakMax: 62
});

export const AMBIENT_LIGHT_MODEL = Object.freeze({
  clearBase01: 0.1,
  clearSunGain01: 0.72,
  twilightLift01: 0.08,
  polarDayLift01: 0.06,
  cloudFloor01: 0.18,
  cloudGain01: 0.82,
  stormPenalty01: 0.22,
  snowGlowDivisor: 2.5,
  snowGlowAmp01: 0.12,
  whiteoutFloorPct: 38
});

export const VISIBILITY_MODEL = Object.freeze({
  scoreUnit: "ratio_0_1",
  cloudPenaltyWeight: 0.34,
  snowPenaltyDivisor: 2.2,
  snowPenaltyWeight: 0.76,
  windPenaltyDivisor: 22,
  windPenaltyWeight: 0.52,
  stormPenaltyWeight: 0.42,
  hazardMaxScore: 0.28,
  lowMaxScore: 0.68,
  whiteoutMaxScore: 0.14,
  whiteoutSnowfallThreshold: 1.0,
  whiteoutWindThreshold: 13,
  whiteoutStormThreshold: 0.88,
  whiteoutCloudTransMax: 0.28,
  whiteoutAltSnowfallThreshold: 1.6,
  whiteoutAltWindThreshold: 9
});
