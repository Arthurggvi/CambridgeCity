// ============================================================================
// 湿度系统（纯函数层）
// ============================================================================
// 作用：
// - 仅计算 gear.thermal.wetness 的下一步值（0..1）
// - 不读写全局状态，不直接改 player/world
// - 由 applyTimeToPlayer() 在唯一写入口中调用并写回
// ============================================================================

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  const n = toFinite(value, min);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function clamp01(value, fallback = 0) {
  return clamp(toFinite(value, fallback), 0, 1);
}

/**
 * 湿度推进（最小可用）
 *
 * 规则：
 * 1) 室外会因降雪/湿度/风带来的灌湿而增湿
 * 2) 室内/干燥环境/热源会烘干
 * 3) 防水属性越高，增湿越慢
 */
export function stepWetness(
  wetness,
  world,
  regionCfg,
  placeProfile,
  gearThermal,
  defs,
  dtHours
) {
  const dt = Math.max(0, toFinite(dtHours, 0));
  if (dt <= 0) return clamp01(wetness, 0);

  const currentWetness = clamp01(wetness, 0);
  const cfg = defs && typeof defs === "object" ? defs : {};
  const place = placeProfile && typeof placeProfile === "object" ? placeProfile : {};
  const region = regionCfg && typeof regionCfg === "object" ? regionCfg : {};
  const worldView = world && typeof world === "object" ? world : {};
  const gear = gearThermal && typeof gearThermal === "object" ? gearThermal : {};

  const isIndoor = String(place.space || "") === "indoor";
  const snowfallRate = Math.max(0, toFinite(worldView?.snowfallRate ?? worldView?.weather?.snowfallRate, 0));
  const pMaxRegion = Math.max(0.0001, toFinite(region?.Pmax ?? region?.Pmax_region, 1));
  const moistureIndex = clamp01(region?.MoistureIndex ?? region?.MoistureIndex_region, 0);
  const windSpeed = Math.max(0, toFinite(worldView?.windSpeed ?? worldView?.weather?.windSpeed_local, 0));
  const vRef = Math.max(0.001, toFinite(cfg?.windRefForWetness ?? cfg?.temperature?.coreTemp?.V_ref ?? 12, 12));

  const snowGainPerHour = Math.max(0, toFinite(cfg?.snowGainPerHour, 0.2));
  const moistGainPerHour = Math.max(0, toFinite(cfg?.moistGainPerHour, 0.06));
  const windGainPerHour = Math.max(0, toFinite(cfg?.windGainPerHour, 0.08));

  const baseDryPerHour = Math.max(0, toFinite(cfg?.baseDryPerHour, 0.05));
  const dryingPerHour = Math.max(0, toFinite(cfg?.dryingPerHour, 0.2));
  const heatDryPerHour = Math.max(0, toFinite(cfg?.heatDryPerHour, 0.25));
  const indoorDryMultiplier = Math.max(0, toFinite(cfg?.indoorDryMultiplier, 1.25));

  const waterproof = clamp01(gear?.waterproof, 0);
  const waterproofMitigation = 1 - waterproof;

  let nextWetness = currentWetness;

  if (!isIndoor) {
    const gainSnow = snowGainPerHour * clamp01(snowfallRate / pMaxRegion, 0);
    const gainMoist = moistGainPerHour * moistureIndex;
    const gainWind = windGainPerHour * clamp01(windSpeed / vRef, 0);
    nextWetness += (gainSnow + gainMoist + gainWind) * waterproofMitigation * dt;
  }

  let dry = baseDryPerHour;
  dry += clamp01(place?.drying, 0) * dryingPerHour;
  dry += clamp01(place?.heatSource, 0) * heatDryPerHour;
  if (isIndoor) {
    dry *= indoorDryMultiplier;
  }

  nextWetness -= dry * dt;
  return clamp01(nextWetness, 0);
}
