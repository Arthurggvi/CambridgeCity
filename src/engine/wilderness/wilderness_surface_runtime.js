/**
 * Phase 7: derived wilderness surface runtime (read-only; no writes to live world state).
 */

const VISIBILITY_LEVELS = Object.freeze(["clear", "reduced", "low", "whiteout"]);
const SLIP_LEVELS = Object.freeze(["none", "low", "medium", "high"]);

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function finiteOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {*} worldWeather
 * @returns {object}
 */
export function normalizeWildernessWeatherSnapshot(worldWeather) {
  const w = worldWeather && typeof worldWeather === "object" ? worldWeather : {};
  const snowfallRate = finiteOr(w.snowfallRate, 0);
  const snowIntensityRaw = String(w.snowIntensityLevel ?? "None").trim() || "None";
  const isSnowing = w.isSnowing === true;
  const windSpeed_local = finiteOr(w.windSpeed_local, 0);
  const cloudTrans = finiteOr(w.cloudTrans, 0);
  const weatherEventType = String(w.weatherEventType ?? "clear").trim() || "clear";
  const explicitVis = w && typeof w === "object" && Object.prototype.hasOwnProperty.call(w, "visibilityLevel");
  const visibilityRaw = explicitVis ? String(w.visibilityLevel ?? "").trim().toLowerCase() : "";
  const visibilityFromField = VISIBILITY_LEVELS.includes(visibilityRaw) ? visibilityRaw : null;
  const whiteout = w.whiteout === true;
  return {
    snowfallRate: Math.max(0, snowfallRate),
    snowIntensityLevel: snowIntensityRaw,
    isSnowing,
    windSpeed_local: Math.max(0, windSpeed_local),
    cloudTrans: clamp01(cloudTrans),
    weatherEventType,
    visibilityFromField,
    whiteout
  };
}

/**
 * @param {ReturnType<typeof normalizeWildernessWeatherSnapshot>} weatherSnapshot
 * @returns {"clear"|"reduced"|"low"|"whiteout"}
 */
export function getVisibilityLevelFromWeather(weatherSnapshot) {
  const snap = weatherSnapshot && typeof weatherSnapshot === "object"
    ? weatherSnapshot
    : normalizeWildernessWeatherSnapshot(null);
  if (snap.whiteout === true) return "whiteout";
  const ev = String(snap.weatherEventType || "").toLowerCase();
  if (ev.includes("whiteout")) return "whiteout";
  if (snap.visibilityFromField) return snap.visibilityFromField;
  const cloud = finiteOr(snap.cloudTrans, 0);
  const lvl = String(snap.snowIntensityLevel || "").trim();
  const heavy = /^heavy$/i.test(lvl);
  const light = /^light$/i.test(lvl);
  if (cloud >= 0.85 || heavy) return "low";
  if (cloud >= 0.55 || light) return "reduced";
  return "clear";
}

function slipFromRiskBase(slipRiskBase) {
  const r = Number(slipRiskBase);
  if (!Number.isFinite(r)) return "none";
  if (r >= 0.25) return "high";
  if (r >= 0.12) return "medium";
  if (r > 0.03) return "low";
  return "none";
}

function downgradeSlip(slip) {
  const order = ["none", "low", "medium", "high"];
  const i = order.indexOf(slip);
  if (i <= 0) return "none";
  return order[i - 1];
}

/**
 * @param {object} surfaceRuntime
 * @returns {"none"|"low"|"medium"|"high"}
 */
export function getSlipLevelFromSurface(surfaceRuntime) {
  const s = String(surfaceRuntime?.slipLevel || "").trim();
  if (SLIP_LEVELS.includes(s)) return s;
  return "none";
}

/**
 * @param {number} value
 * @param {number} [fallback=1]
 */
export function clampSurfaceMultiplier(value, fallback = 1) {
  if (value === Infinity) return Infinity;
  const fb = Number(fallback);
  const safeFb = Number.isFinite(fb) && fb >= 1 ? fb : 1;
  const v = Number(value);
  if (!Number.isFinite(v)) return safeFb;
  return Math.max(1, v);
}

function moistureIndexFromRegion(regionProfile) {
  const c = regionProfile?.climate && typeof regionProfile.climate === "object" ? regionProfile.climate : null;
  const fromClimate = c != null ? Number(c.MoistureIndex) : NaN;
  if (Number.isFinite(fromClimate) && fromClimate >= 0) return fromClimate;
  const top = Number(regionProfile?.MoistureIndex);
  if (Number.isFinite(top) && top >= 0) return top;
  return 1;
}

function windBaseFromRegion(regionProfile) {
  const c = regionProfile?.climate && typeof regionProfile.climate === "object" ? regionProfile.climate : null;
  const wb = c != null ? Number(c.WindBase) : NaN;
  return Number.isFinite(wb) && wb >= 0 ? wb : 0;
}

function surfaceMultsFromSnow(terrainId, snowDepthCm) {
  const tid = String(terrainId || "").trim();
  let moveM = 1 + Math.min(0.9, snowDepthCm / 40);
  let stamM = 1 + Math.min(1.1, snowDepthCm / 35);
  if (tid === "loose_snowfield" || tid === "snow_drift_zone") {
    moveM *= 1.15;
    stamM *= 1.2;
  }
  if (tid === "managed_compacted_route") {
    moveM *= 0.85;
    stamM *= 0.85;
  }
  moveM = clampSurfaceMultiplier(moveM, 1);
  stamM = clampSurfaceMultiplier(stamM, 1);
  return { snowDepthMoveMult: moveM, snowDepthStaminaMult: stamM };
}

function probeMultFromVisibility(visibilityLevel) {
  const v = String(visibilityLevel || "").toLowerCase();
  if (v === "reduced") return 0.75;
  if (v === "low") return 0.45;
  if (v === "whiteout") return 0.2;
  return 1;
}

/**
 * @param {{
 *   regionProfile: object,
 *   terrainDef: object,
 *   worldWeather: object|null|undefined,
 *   minuteOfDay: number|null|undefined
 * }} args minuteOfDay reserved for future; unused in phase 7 v1.
 * @returns {{
 *   snowDepthCm: number,
 *   trailRetention: number,
 *   windScour: number,
 *   slipLevel: string,
 *   visibilityLevel: string,
 *   snowDepthMoveMult: number,
 *   snowDepthStaminaMult: number,
 *   trailLossMult: number,
 *   probeConfidenceMult: number
 * }}
 */
export function buildWildernessSurfaceRuntime({ regionProfile, terrainDef, worldWeather, minuteOfDay: _minuteOfDay }) {
  const snap = normalizeWildernessWeatherSnapshot(worldWeather);
  const surf = terrainDef?.surface && typeof terrainDef.surface === "object" ? terrainDef.surface : {};
  const snowAcc = finiteOr(surf.snowAccumulationMult, 1);
  const windScourMult = finiteOr(surf.windScourMult, 1);
  const trailMult = finiteOr(surf.trailRetentionMult, 1);
  const slipRiskBase = finiteOr(surf.slipRiskBase, 0);

  const moisture = moistureIndexFromRegion(regionProfile || {});
  let baseSnow = snap.snowfallRate * 6;
  const inten = String(snap.snowIntensityLevel || "").trim();
  if (/^light$/i.test(inten)) baseSnow = Math.max(baseSnow, 2);
  if (/^heavy$/i.test(inten)) baseSnow = Math.max(baseSnow, 10);
  let snowDepthCm = baseSnow * (Number.isFinite(snowAcc) && snowAcc >= 0 ? snowAcc : 1) * (Number.isFinite(moisture) && moisture >= 0 ? moisture : 1);
  snowDepthCm = Math.max(0, Math.min(80, finiteOr(snowDepthCm, 0)));

  const windBase = windBaseFromRegion(regionProfile || {});
  const wind = Math.max(0, snap.windSpeed_local);
  const denom = Math.max(1, windBase + 8);
  const windScour = clamp01((wind / denom) * (Number.isFinite(windScourMult) && windScourMult >= 0 ? windScourMult : 1));

  const depthFactor = snowDepthCm > 8 ? 0.65 : 1;
  const trailRetention = clamp01(trailMult * (1 - windScour * 0.5) * depthFactor);

  const visibilityLevel = getVisibilityLevelFromWeather(snap);
  let slipLevel = slipFromRiskBase(slipRiskBase);
  if (snowDepthCm > 10) {
    slipLevel = downgradeSlip(slipLevel);
  }

  const tid = String(terrainDef?.id || "").trim();
  const { snowDepthMoveMult, snowDepthStaminaMult } = surfaceMultsFromSnow(tid, snowDepthCm);

  let trailLossMult = 1 + (1 - trailRetention);
  if (visibilityLevel === "whiteout") trailLossMult += 0.5;
  trailLossMult = Math.max(1, finiteOr(trailLossMult, 1));

  const visProbe = probeMultFromVisibility(visibilityLevel);
  const trailBoost = clamp01(finiteOr(trailRetention, 0) + 0.25);
  const clampedTrailPart = Math.max(0.5, Math.min(1, trailBoost));
  let probeConfidenceMult = visProbe * clampedTrailPart;
  probeConfidenceMult = clamp01(probeConfidenceMult);

  return {
    snowDepthCm: finiteOr(snowDepthCm, 0),
    trailRetention,
    windScour,
    slipLevel,
    visibilityLevel,
    snowDepthMoveMult: finiteOr(snowDepthMoveMult, 1),
    snowDepthStaminaMult: finiteOr(snowDepthStaminaMult, 1),
    trailLossMult: finiteOr(trailLossMult, 1),
    probeConfidenceMult: finiteOr(probeConfidenceMult, 0)
  };
}
