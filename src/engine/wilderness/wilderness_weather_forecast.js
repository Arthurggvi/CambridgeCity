/**
 * Phase 9: read-only wilderness weather forecast (dry-run; no environment_weather / state writes).
 *
 * 以下常量与 environment_weather.js 的当前事件模型保持同构；后续可抽共享常量。
 */

import {
  createDeterministicForecastRng,
  hashForecastSeed,
  pickWeightedWithRng,
  randomIntInclusiveWithRng
} from "./wilderness_weather_forecast_rng.js";

/** @typedef {"clear"|"overcast"|"light_snow"|"heavy_snow"|"windy_clear"} ForecastEventType */

const CloudType = Object.freeze({
  Clear: "Clear",
  Cirrus: "Cirrus",
  Stratiform: "Stratiform",
  Cumulonimbus: "Cumulonimbus"
});

const CLOUD_PRECIP_FACTOR = Object.freeze({
  [CloudType.Clear]: 0.0,
  [CloudType.Cirrus]: 0.1,
  [CloudType.Stratiform]: 0.6,
  [CloudType.Cumulonimbus]: 1.0
});

const SnowIntensityLevel = Object.freeze({
  None: "None",
  Light: "Light",
  Moderate: "Moderate",
  Heavy: "Heavy"
});

const WEATHER_EVENT_PROFILE_BY_TYPE = Object.freeze({
  clear: Object.freeze({ cloudType: CloudType.Clear, stormIntensity: 0.02 }),
  overcast: Object.freeze({ cloudType: CloudType.Stratiform, stormIntensity: 0 }),
  light_snow: Object.freeze({ cloudType: CloudType.Stratiform, stormIntensity: 0.22 }),
  heavy_snow: Object.freeze({ cloudType: CloudType.Cumulonimbus, stormIntensity: 0.75 }),
  windy_clear: Object.freeze({ cloudType: CloudType.Clear, stormIntensity: 0.58 })
});

const WEATHER_EVENT_DURATION_RANGE_BY_TYPE = Object.freeze({
  clear: Object.freeze({ min: 240, max: 480 }),
  overcast: Object.freeze({ min: 180, max: 360 }),
  light_snow: Object.freeze({ min: 120, max: 240 }),
  heavy_snow: Object.freeze({ min: 90, max: 180 }),
  windy_clear: Object.freeze({ min: 120, max: 300 })
});

const KNOWN_EVENT_TYPES = new Set(["clear", "overcast", "light_snow", "heavy_snow", "windy_clear"]);

const SNOW_LEVEL_RANK = Object.freeze({
  [SnowIntensityLevel.None]: 0,
  [SnowIntensityLevel.Light]: 1,
  [SnowIntensityLevel.Moderate]: 2,
  [SnowIntensityLevel.Heavy]: 3
});

function toNonNegInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeEventType(t) {
  const s = String(t || "").trim().toLowerCase();
  return KNOWN_EVENT_TYPES.has(s) ? s : "clear";
}

/**
 * @param {*} worldWeather
 */
export function normalizeWeatherForecastSnapshot(worldWeather) {
  const w = worldWeather && typeof worldWeather === "object" ? worldWeather : {};
  const weatherEventType = normalizeEventType(w.weatherEventType);
  const weatherEventEndsAtMinute = toNonNegInt(w.weatherEventEndsAtMinute);
  const cloudType = String(w.cloudType ?? "Clear").trim() || "Clear";
  const stormIntensity = clamp01(w.stormIntensity);
  const snowIntensityLevel = String(w.snowIntensityLevel ?? "None").trim() || "None";
  const windSpeed_local = Number.isFinite(Number(w.windSpeed_local)) ? Math.max(0, Number(w.windSpeed_local)) : 0;
  const whiteout = w.whiteout === true;
  const cloudTrans = Number.isFinite(Number(w.cloudTrans)) ? clamp01(w.cloudTrans) : 0;
  return {
    weatherEventType,
    weatherEventEndsAtMinute,
    cloudType,
    stormIntensity,
    snowIntensityLevel,
    windSpeed_local,
    whiteout,
    cloudTrans
  };
}

/**
 * @param {{ regionProfile: object, cloudType: string, stormIntensity: number }} args
 */
export function computeForecastSnowfallRate({ regionProfile, cloudType, stormIntensity }) {
  const c = regionProfile?.climate && typeof regionProfile.climate === "object" ? regionProfile.climate : {};
  const Pmax = Number.isFinite(Number(c.Pmax)) ? Number(c.Pmax) : 0;
  const MoistureIndex = Number.isFinite(Number(c.MoistureIndex)) ? Math.max(0, Number(c.MoistureIndex)) : 0;
  const cf = CLOUD_PRECIP_FACTOR[String(cloudType)] ?? 0;
  const storm = clamp01(stormIntensity);
  return Pmax * cf * storm * MoistureIndex;
}

/**
 * @param {number} rate
 */
export function classifyForecastSnowIntensity(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r < 0.01) return SnowIntensityLevel.None;
  if (r < 0.5) return SnowIntensityLevel.Light;
  if (r < 1.5) return SnowIntensityLevel.Moderate;
  return SnowIntensityLevel.Heavy;
}

/** Exposed for contract tests; mirrors environment_weather weight table + 0.35 repeat penalty. */
export function getWeatherEventWeights(regionId, previousEventType) {
  const normalizedRegionId = String(regionId || "").trim();
  const baseWeights =
    normalizedRegionId === "West2"
      ? [
          ["clear", 0.32],
          ["overcast", 0.24],
          ["light_snow", 0.26],
          ["heavy_snow", 0.1],
          ["windy_clear", 0.08]
        ]
      : [
          ["clear", 0.74],
          ["overcast", 0.18],
          ["windy_clear", 0.08],
          ["light_snow", 0],
          ["heavy_snow", 0]
        ];

  const prev = String(previousEventType || "").trim().toLowerCase();
  return baseWeights.map(([eventType, weight]) => [
    eventType,
    prev && prev === eventType ? weight * 0.35 : weight
  ]);
}

function pickNextEventType(rng, regionId, previousEventType) {
  const weights = getWeatherEventWeights(regionId, previousEventType).filter(([, w]) => Number(w) > 0);
  return pickWeightedWithRng(rng, weights);
}

function appendSimulatedEvent(events, regionProfile, type, startM, endM) {
  const prof = WEATHER_EVENT_PROFILE_BY_TYPE[type] || WEATHER_EVENT_PROFILE_BY_TYPE.clear;
  const rate = computeForecastSnowfallRate({
    regionProfile,
    cloudType: prof.cloudType,
    stormIntensity: prof.stormIntensity
  });
  events.push({
    type,
    startMinute: startM,
    endMinute: endM,
    durationMinutes: Math.max(0, endM - startM),
    snowfallRate: rate,
    snowIntensityLevel: classifyForecastSnowIntensity(rate)
  });
}

/**
 * @param {{
 *   weatherSnapshot: object,
 *   regionProfile: object,
 *   totalMinutes: number,
 *   durationMinutes: number,
 *   seedInput: string|number|object
 * }} args
 */
export function simulateWeatherEventsDeterministic({
  weatherSnapshot,
  regionProfile,
  totalMinutes,
  durationMinutes,
  seedInput
}) {
  const rng = createDeterministicForecastRng(seedInput);
  const simStart = Math.max(0, Math.trunc(Number(totalMinutes) || 0));
  const dur = Math.max(0, Math.trunc(Number(durationMinutes) || 0));
  const simEnd = simStart + dur;
  const regionId = String(regionProfile?.id || "").trim();
  const snap = weatherSnapshot && typeof weatherSnapshot === "object" ? weatherSnapshot : normalizeWeatherForecastSnapshot(null);
  const endsAt = toNonNegInt(snap.weatherEventEndsAtMinute);
  let currentType = normalizeEventType(snap.weatherEventType);

  const events = [];
  let cursor = simStart;

  if (endsAt > cursor && endsAt > simStart) {
    const endBlock = Math.min(endsAt, simEnd);
    if (endBlock > cursor) {
      appendSimulatedEvent(events, regionProfile, currentType, cursor, endBlock);
      cursor = endBlock;
    }
  }

  let previousType = currentType;

  while (cursor < simEnd) {
    const nextType = pickNextEventType(rng, regionId, previousType);
    const dr = WEATHER_EVENT_DURATION_RANGE_BY_TYPE[nextType] || WEATHER_EVENT_DURATION_RANGE_BY_TYPE.clear;
    const dmin = Math.max(1, randomIntInclusiveWithRng(rng, dr.min, dr.max));
    const endM = Math.min(cursor + dmin, simEnd);
    appendSimulatedEvent(events, regionProfile, nextType, cursor, endM);
    previousType = nextType;
    cursor = endM;
  }

  return events;
}

function sumSnowMinutes(events) {
  let t = 0;
  for (const e of events) {
    if (e.type === "light_snow" || e.type === "heavy_snow") t += e.durationMinutes;
  }
  return t;
}

function sumTypeMinutes(events, type) {
  let t = 0;
  for (const e of events) {
    if (e.type === type) t += e.durationMinutes;
  }
  return t;
}

function maxSnowIntensityFromEvents(events) {
  let best = SnowIntensityLevel.None;
  let r = SNOW_LEVEL_RANK[best];
  for (const e of events) {
    const k = SNOW_LEVEL_RANK[e.snowIntensityLevel] ?? 0;
    if (k > r) {
      r = k;
      best = e.snowIntensityLevel;
    }
  }
  return best;
}

function longestConsecutiveHeavyRun(events) {
  let best = 0;
  let cur = 0;
  for (const e of events) {
    if (e.type === "heavy_snow") cur += e.durationMinutes;
    else {
      if (cur > best) best = cur;
      cur = 0;
    }
  }
  if (cur > best) best = cur;
  return best;
}

function hasWhiteoutRiskWindow(events, simStart) {
  const win = 360;
  const simEnd = events.length ? events[events.length - 1].endMinute : simStart;
  for (let w0 = simStart; w0 < simEnd; w0 += 30) {
    const w1 = w0 + win;
    let heavyM = 0;
    let windyM = 0;
    for (const e of events) {
      const overlap0 = Math.max(e.startMinute, w0);
      const overlap1 = Math.min(e.endMinute, w1);
      if (overlap1 > overlap0) {
        const m = overlap1 - overlap0;
        if (e.type === "heavy_snow") heavyM += m;
        if (e.type === "windy_clear") windyM += m;
      }
    }
    if (heavyM > 0 && windyM > 0) return true;
  }
  return false;
}

function earliestHeavyOrWindyHour(events, simStart) {
  for (const e of events) {
    if (e.type === "heavy_snow" || e.type === "windy_clear") {
      return (e.startMinute - simStart) / 60;
    }
  }
  return null;
}

function worstRiskWindowHours(events, simStart, simDuration) {
  const simEnd = simStart + simDuration;
  let best = null;
  let bestScore = -1;
  for (let w0 = simStart; w0 < simEnd; w0 += 60) {
    const w1 = Math.min(w0 + 360, simEnd);
    let score = 0;
    for (const e of events) {
      const o0 = Math.max(e.startMinute, w0);
      const o1 = Math.min(e.endMinute, w1);
      if (o1 > o0) {
        const m = o1 - o0;
        if (e.type === "heavy_snow") score += m * 3;
        else if (e.type === "windy_clear") score += m * 2;
        else if (e.type === "light_snow") score += m * 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = { fromHour: (w0 - simStart) / 60, toHour: (w1 - simStart) / 60 };
    }
  }
  return bestScore > 0 ? best : null;
}

/**
 * @param {{ weatherSnapshot: object, regionProfile: object, totalMinutes: number, seedInput: * }} args
 */
export function buildDailyForecast24h({ weatherSnapshot, regionProfile, totalMinutes, seedInput }) {
  const snap = normalizeWeatherForecastSnapshot(weatherSnapshot);
  const now = Math.max(0, Math.trunc(Number(totalMinutes) || 0));
  const events = simulateWeatherEventsDeterministic({
    weatherSnapshot: snap,
    regionProfile,
    totalMinutes: now,
    durationMinutes: 1440,
    seedInput
  });

  const snowM = sumSnowMinutes(events);
  let snowLikelihood = "none";
  if (snowM <= 0) snowLikelihood = "none";
  else if (snowM < 120) snowLikelihood = "low";
  else if (snowM <= 360) snowLikelihood = "medium";
  else snowLikelihood = "high";

  const maxSnowIntensityLikely = maxSnowIntensityFromEvents(events);
  const windyM = sumTypeMinutes(events, "windy_clear");
  const heavyM = sumTypeMinutes(events, "heavy_snow");

  let strongWindLikelihood = "low";
  if (windyM > 360 || heavyM > 240) strongWindLikelihood = "high";
  else if (windyM > 0 || heavyM > 0) strongWindLikelihood = "medium";

  let lowVisibilityWindows = "none";
  if (heavyM > 180) lowVisibilityWindows = "long";
  else if (heavyM > 0 || sumTypeMinutes(events, "light_snow") > 0) lowVisibilityWindows = "short";

  const parts = [];
  if (heavyM > 120) parts.push("强降雪窗");
  if (windyM > 120) parts.push("大风晴段");
  if (snowM > 0 && heavyM < 60) parts.push("弱到中等降雪");
  if (parts.length === 0) parts.push("以晴到多云为主");
  const eventSummary = parts.join("·");

  let confidence = 72;
  if (snap.weatherEventEndsAtMinute > now && snap.weatherEventEndsAtMinute <= now + 120) confidence = 62;

  const text = `未来24小时：${eventSummary}；降雪倾向${snowLikelihood === "none" ? "弱" : snowLikelihood}。`;

  return {
    horizonHours: 24,
    eventSummary,
    snowLikelihood,
    maxSnowIntensityLikely,
    strongWindLikelihood,
    lowVisibilityWindows,
    confidence,
    text
  };
}

/**
 * @param {{ weatherSnapshot: object, regionProfile: object, totalMinutes: number, seedInput: * }} args
 */
export function buildExtremeOutlook72h({ weatherSnapshot, regionProfile, totalMinutes, seedInput }) {
  const snap = normalizeWeatherForecastSnapshot(weatherSnapshot);
  const now = Math.max(0, Math.trunc(Number(totalMinutes) || 0));
  const events = simulateWeatherEventsDeterministic({
    weatherSnapshot: snap,
    regionProfile,
    totalMinutes: now,
    durationMinutes: 4320,
    seedInput
  });

  const heavyM = sumTypeMinutes(events, "heavy_snow");
  const windyM = sumTypeMinutes(events, "windy_clear");
  const cluster = longestConsecutiveHeavyRun(events);

  let extremeRisk = "none";
  if (heavyM > 900 || cluster > 360) extremeRisk = "severe";
  else if (heavyM > 480) extremeRisk = "warning";
  else if (heavyM > 240 || windyM > 600) extremeRisk = "watch";

  const possibleExtremeEvents = [];
  if (heavyM > 0) possibleExtremeEvents.push("heavy_snow_window");
  if (windyM > 720) possibleExtremeEvents.push("strong_wind_window");
  if (hasWhiteoutRiskWindow(events, now)) possibleExtremeEvents.push("whiteout_risk");

  const earliestPossibleOnsetHour = earliestHeavyOrWindyHour(events, now);
  const worstWindow = worstRiskWindowHours(events, now, 4320);

  let confidence = 58;
  if (extremeRisk === "none") confidence = 70;
  else if (extremeRisk === "severe") confidence = 52;

  const text =
    extremeRisk === "severe"
      ? "72小时内可能出现持续强降雪或低能见度叠加大风。"
      : extremeRisk === "warning"
        ? "72小时内存在较强降雪窗口，需留意计划。"
        : "72小时整体风险可控，仍建议关注天气变化。";

  return {
    horizonHours: 72,
    extremeRisk,
    possibleExtremeEvents,
    earliestPossibleOnsetHour,
    worstWindow,
    confidence,
    text
  };
}

/**
 * @param {{ weatherSnapshot: object, regionProfile: object, totalMinutes: number }} args
 */
export function buildShortNowcast30m({ weatherSnapshot, regionProfile, totalMinutes }) {
  const snap = normalizeWeatherForecastSnapshot(weatherSnapshot);
  const rid = String(regionProfile?.id || "").trim();
  const now = Math.max(0, Math.trunc(Number(totalMinutes) || 0));
  const ends = toNonNegInt(snap.weatherEventEndsAtMinute);
  const ev = snap.weatherEventType;
  const rem = ends - now;

  let eventCoverage = "unknown";
  if (ends > now + 30) eventCoverage = "covered";
  else if (ends > now) eventCoverage = "ending_inside_window";

  let confidence = 55;
  if (eventCoverage === "covered") confidence = 84;
  else if (eventCoverage === "ending_inside_window") confidence = Math.min(70, 66);
  else confidence = 50;

  const endingSoon = ends > now && ends <= now + 30;
  const inWest2 = rid === "West2";

  let likelyMotion = "stable";
  let snowChanceBand = "none";
  let windRiskBand = "low";
  let visibilityRiskBand = "low";
  let text = "";

  if (ev === "clear") {
    snowChanceBand = snap.snowIntensityLevel !== "None" ? "low" : "none";
    likelyMotion = "stable";
    text = "短时晴稳，云量不高，适合保持当前节奏。";
  } else if (ev === "overcast") {
    likelyMotion = endingSoon && inWest2 ? "snow_possible" : "stable";
    if (endingSoon && inWest2) {
      snowChanceBand = "medium";
      likelyMotion = rem <= 15 ? "may_shift" : "snow_possible";
    } else {
      snowChanceBand = "low";
      likelyMotion = "may_shift";
    }
    text = endingSoon && inWest2 ? "云层将变，西部区短时可能转雪或阵风。" : "阴天维持，短时变化有限。";
  } else if (ev === "light_snow") {
    snowChanceBand = "medium";
    visibilityRiskBand = "medium";
    likelyMotion = "may_shift";
    text = "小雪持续，能见度逐步下降，注意脚下。";
  } else if (ev === "heavy_snow") {
    snowChanceBand = "high";
    visibilityRiskBand = "high";
    likelyMotion = "poor_visibility";
    text = "强降雪影响能见，建议收紧队形与步频。";
  } else if (ev === "windy_clear") {
    windRiskBand = "high";
    likelyMotion = "wind_rising";
    snowChanceBand = "none";
    text = "晴段伴强风切变，注意防风与体感失温。";
  } else {
    text = "短时天气信息不足，保持保守判断。";
  }

  if (snap.whiteout || snap.cloudTrans >= 0.9) {
    visibilityRiskBand = "high";
    if (likelyMotion === "stable") likelyMotion = "poor_visibility";
  }

  if (text.includes("可能马上下雪")) text = text.replace("可能马上下雪", "短时变化");

  return {
    horizonMinutes: 30,
    eventCoverage,
    likelyMotion,
    snowChanceBand,
    windRiskBand,
    visibilityRiskBand,
    confidence,
    text
  };
}

/**
 * @param {{
 *   terrainDef: object|null,
 *   surfaceRuntime: object|null,
 *   forecast: { dailyForecast24h: object, extremeOutlook72h: object, shortNowcast30m?: object }
 * }} args
 */
export function buildWeatherExposureProjection({ terrainDef, surfaceRuntime, forecast }) {
  const tid = String(terrainDef?.id || "").trim();
  const daily = forecast?.dailyForecast24h || {};
  const extreme = forecast?.extremeOutlook72h || {};
  const snowL = String(daily.snowLikelihood || "none");
  const strongW = String(daily.strongWindLikelihood || "low");
  const lowVis = String(daily.lowVisibilityWindows || "none");
  const extRisk = String(extreme.extremeRisk || "none");
  const poss = Array.isArray(extreme.possibleExtremeEvents) ? extreme.possibleExtremeEvents : [];
  const visSurf = String(surfaceRuntime?.visibilityLevel || "");

  let exposureClass = "routine";
  let movementAdvice = "continue";
  let trailRisk = "stable";
  let visibilityHint = "good";
  if (visSurf === "whiteout" || visSurf === "low") visibilityHint = "poor";
  else if (visSurf === "reduced") visibilityHint = "reduced";
  if (poss.includes("whiteout_risk") || visSurf === "whiteout") {
    visibilityHint = "whiteout_risk";
    exposureClass = "adverse";
  }

  const hardMargin = tid === "ice_shelf_edge" || tid === "ice_cliff_coast" || tid === "tide_crack_zone";
  if (hardMargin) {
    exposureClass = "critical_margin";
    movementAdvice = "avoid_entry";
    trailRisk = "lost";
    visibilityHint = visibilityHint === "good" ? "reduced" : visibilityHint;
    return {
      terrainId: tid || null,
      exposureClass,
      movementAdvice,
      trailRisk,
      visibilityHint,
      summary: "硬边界地貌：不建议继续外推。"
    };
  }

  if (tid === "crevasse_field") {
    exposureClass = "marginal";
    if (snowL === "medium" || snowL === "high") movementAdvice = "avoid_entry";
    if (poss.includes("heavy_snow_window")) trailRisk = "lost";
    else trailRisk = snowL === "high" ? "unreliable" : "weakening";
    return {
      terrainId: tid,
      exposureClass,
      movementAdvice,
      trailRisk,
      visibilityHint,
      summary: "裂隙带：降雪一升就更要避开。"
    };
  }

  if (tid === "loose_snowfield" || tid === "snow_drift_zone") {
    exposureClass = "adverse";
    if (snowL === "medium" || snowL === "high") movementAdvice = "return_before_window";
    if (poss.includes("whiteout_risk") || visibilityHint === "whiteout_risk") {
      movementAdvice = visSurf === "whiteout" ? "stop_and_wait" : "avoid_entry";
    }
    trailRisk = snowL === "high" ? "unreliable" : "weakening";
    return {
      terrainId: tid,
      exposureClass,
      movementAdvice,
      trailRisk,
      visibilityHint,
      summary: "深松雪带：风雪一强就优先考虑回撤。"
    };
  }

  if (tid === "sastrugi_field") {
    exposureClass = "elevated";
    if (strongW === "medium" || strongW === "high") {
      movementAdvice = extRisk === "warning" || extRisk === "severe" ? "return_before_window" : "slow_down";
    }
    trailRisk = "weakening";
    return {
      terrainId: tid,
      exposureClass,
      movementAdvice,
      trailRisk,
      visibilityHint,
      summary: "雪垄地：风大就放慢或缩短外伸。"
    };
  }

  if (tid === "flagged_marker_line") {
    exposureClass = "elevated";
    if (daily.maxSnowIntensityLikely === "Heavy" || snowL === "high" || extRisk === "severe") {
      movementAdvice = "return_before_window";
      trailRisk = "unreliable";
    } else if (evLightSnow(daily) || snowL === "medium") {
      movementAdvice = "slow_down";
      trailRisk = "weakening";
    }
    return {
      terrainId: tid,
      exposureClass,
      movementAdvice,
      trailRisk,
      visibilityHint,
      summary: "标记线：风雪上调就收紧行程。"
    };
  }

  if (tid === "managed_compacted_route") {
    if (snowL === "medium" || snowL === "high") {
      movementAdvice = "slow_down";
      exposureClass = "elevated";
      trailRisk = "weakening";
    } else {
      movementAdvice = "continue";
      trailRisk = "stable";
    }
    return {
      terrainId: tid,
      exposureClass,
      movementAdvice,
      trailRisk,
      visibilityHint,
      summary: "压实道：风险低时保持节奏即可。"
    };
  }

  if (extRisk === "severe" || extRisk === "warning") {
    exposureClass = "adverse";
    movementAdvice = "slow_down";
    trailRisk = "unreliable";
  }

  return {
    terrainId: tid || null,
    exposureClass,
    movementAdvice,
    trailRisk,
    visibilityHint,
    summary: "开阔雪面：关注预报窗口再动。"
  };
}

function evLightSnow(daily) {
  return String(daily.maxSnowIntensityLikely || "") === "Light" || String(daily.maxSnowIntensityLikely || "") === "Moderate";
}

/**
 * @param {*} value
 */
export function isWildernessWeatherForecast(value) {
  if (!value || typeof value !== "object") return false;
  const need = ["generatedFrom", "shortNowcast30m", "dailyForecast24h", "extremeOutlook72h", "exposure", "warnings"];
  for (const k of need) {
    if (!Object.prototype.hasOwnProperty.call(value, k)) return false;
  }
  return true;
}

/**
 * @param {{
 *   wilderness: object,
 *   areaSpec: object,
 *   regionProfile: object,
 *   terrainDef: object,
 *   surfaceRuntime: object|null,
 *   worldWeather: object,
 *   totalMinutes: number|null
 * }} args
 */
export function buildWildernessWeatherForecast({
  wilderness: _wilderness,
  areaSpec: _areaSpec,
  regionProfile,
  terrainDef,
  surfaceRuntime,
  worldWeather,
  totalMinutes
}) {
  const snap = normalizeWeatherForecastSnapshot(worldWeather);
  const tm = Number(totalMinutes);
  const now = Number.isFinite(tm) ? Math.trunc(tm) : 0;
  const regionId = String(regionProfile?.id || "").trim();

  const seedInput = hashForecastSeed(
    `${regionId}|${now}|${snap.weatherEventType}|${snap.weatherEventEndsAtMinute}`
  );

  const shortNowcast30m = buildShortNowcast30m({
    weatherSnapshot: snap,
    regionProfile,
    totalMinutes: now
  });
  const dailyForecast24h = buildDailyForecast24h({
    weatherSnapshot: snap,
    regionProfile,
    totalMinutes: now,
    seedInput
  });
  const extremeOutlook72h = buildExtremeOutlook72h({
    weatherSnapshot: snap,
    regionProfile,
    totalMinutes: now,
    seedInput
  });

  const exposure = buildWeatherExposureProjection({
    terrainDef,
    surfaceRuntime,
    forecast: { shortNowcast30m, dailyForecast24h, extremeOutlook72h }
  });

  return {
    generatedFrom: {
      weatherEventType: snap.weatherEventType,
      weatherEventEndsAtMinute: snap.weatherEventEndsAtMinute,
      totalMinutes: now,
      regionId
    },
    shortNowcast30m,
    dailyForecast24h,
    extremeOutlook72h,
    exposure,
    warnings: []
  };
}
