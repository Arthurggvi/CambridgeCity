// ============================================================================
// 温度系统（纯函数层）
// ============================================================================
// 设计约束：
// 1) 本模块只负责“计算”，不读写全局状态、不修改 player/world。
// 2) 所有函数都是纯函数，可用于 UI 只读派生与冒烟测试。
// 3) 任何真正的状态写入必须由 applyTimeToPlayer() 统一执行。
// ============================================================================

import { getCalendarViewFromTotalMinutes, normalizeWorldCalendar } from "../../engine/calendar_model.js";
import { getSeasonTemperatureDelta } from "./temperature_season.js";

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

function resolveDayOfYear(timeView = null, world = {}) {
  if (Number.isFinite(Number(timeView?.dayOfYear))) {
    return Number(timeView.dayOfYear);
  }

  if (Number.isFinite(Number(timeView?.totalMinutes))) {
    return getCalendarViewFromTotalMinutes(Number(timeView.totalMinutes), world).dayOfYear;
  }

  return normalizeWorldCalendar(world?.calendar).startDayOfYear;
}

/**
 * 根据失温值计算阶段。
 * Hypothermia 采用 0..100，100 最安全。
 */
export function getHypothermiaStage(hypo) {
  const value = clamp(toFinite(hypo, 100), 0, 100);
  if (value > 75) return "Safe";
  if (value > 50) return "Mild";
  if (value > 25) return "Moderate";
  return "Severe";
}

/**
 * 计算环境温度（℃）
 *
 * 公式：
 * T_air = T_base
 *       + T_season(dayOfYear)
 *       + SunAmp * (Sun / 100)
 *       + SnowWarmAmp * clamp01(SnowfallRate / Pmax)
 */
export function computeEnvTempC(regionCfg, timeView, world = {}, defs = {}) {
  const cfg = regionCfg || {};
  const tBase = toFinite(cfg.T_base, -10);
  const dayOfYear = resolveDayOfYear(timeView, world);
  const tSeason = getSeasonTemperatureDelta(cfg, dayOfYear, world?.calendar, defs);
  const sunAmp = toFinite(cfg.SunAmp, 0);
  const snowWarmAmp = toFinite(cfg.SnowWarmAmp, 0);
  const pMax = Math.max(0.0001, toFinite(cfg.Pmax, 1));

  const sun = clamp(toFinite(world?.sun, world?.weather?.sun ?? 0), 0, 100);
  const snowfallRate = Math.max(0, toFinite(world?.snowfallRate, world?.weather?.snowfallRate ?? 0));

  const snowTerm = clamp01(snowfallRate / pMax, 0);

  const tAirC = tBase
    + tSeason
    + sunAmp * (sun / 100)
    + snowWarmAmp * snowTerm;

  return toFinite(tAirC, tBase);
}

/**
 * 计算局地风速（m/s）
 *
 * 设计：
 * - exposureLevel 提供主系数（遮蔽→山脊）。
 * - windShelter（0..1）进一步衰减风速。
 * - 仅返回计算值，不写回 world。
 */
export function computeLocalWind(worldWindSpeed, placeProfile = {}) {
  // 教案硬规则：室内不吃风寒。室内场景的风寒项必须强制为 0。
  if (String(placeProfile?.space || "") === "indoor") {
    return 0;
  }

  const exposure = String(placeProfile?.exposureLevel || "Open");
  const exposureMulMap = {
    Sheltered: 0.3,
    SemiSheltered: 0.6,
    Open: 1.0,
    Ridge: 1.4
  };

  const exposureMul = toFinite(exposureMulMap[exposure], 1.0);
  const shelter = clamp01(placeProfile?.windShelter, 0);
  const shelterMul = 1 - shelter;

  const worldWind = Math.max(0, toFinite(worldWindSpeed, 0));
  return Math.max(0, worldWind * exposureMul * shelterMul);
}

/**
 * 局部环境修正（供暖/热源）
 * 说明：
 * - 不改教案主体结构（region 温度公式不变）
 * - 仅在输入给 T_core 时叠加局部建筑热源修正
 */
export function computeEffectiveEnvTempC(tEnvRegionC, placeProfile = {}, defs = {}) {
  const tRegion = toFinite(tEnvRegionC, -10);
  const heatSource = clamp01(placeProfile?.heatSource, 0);
  const isIndoor = String(placeProfile?.space || "") === "indoor";
  const indoorBoostC = toFinite(defs?.indoorHeatBoostC, 32);
  const outdoorBoostC = toFinite(defs?.outdoorHeatBoostC, 8);
  const heatBoost = heatSource * (isIndoor ? indoorBoostC : outdoorBoostC);
  let tEnvEffC = tRegion + heatBoost;

  if (isIndoor) {
    // 设计决策：封闭环境一律视作“可回暖环境”。
    // 这样既不改 stepCoreTempC 的主体结构，也能稳定落入教案 WarmRate 分支。
    const indoorMinWarmC = toFinite(defs?.indoorMinWarmC, 15);
    tEnvEffC = Math.max(tEnvEffC, indoorMinWarmC);
  }

  return tEnvEffC;
}

/**
 * 计算有效保暖值（无量纲）
 *
 * 近似模型：
 * warmthEff = warmthRating
 *           - WetPenalty * wetness
 *           - WindPenalty * (windLocal / V_ref)
 *
 * 然后下限钳位到 WarmthFloor，避免出现 0 或负值导致数值爆炸。
 */
export function computeEffectiveWarmth(playerThermal = {}, windLocal = 0, defs = {}) {
  const warmthRating = Math.max(0, toFinite(playerThermal?.warmthRating, 0.8));
  const wetness = clamp01(playerThermal?.wetness, 0);
  const windproof = clamp01(playerThermal?.windproof, 0);

  const wetPenalty = Math.max(0, toFinite(defs?.WetPenalty, 0.45));
  const windPenalty = Math.max(0, toFinite(defs?.WindPenalty, 0.25));
  const vRef = Math.max(0.001, toFinite(defs?.V_ref, 12));
  const warmthFloor = Math.max(0.05, toFinite(defs?.WarmthFloor, 0.2));

  const windTerm = clamp01(Math.max(0, toFinite(windLocal, 0)) / vRef, 0);
  const windLeakMul = 1 - windproof;
  const wetFactor = Math.max(0, 1 - wetPenalty * wetness);
  const windFactor = Math.max(0, 1 - windPenalty * windTerm * windLeakMul);
  const warmthEff = warmthRating * wetFactor * windFactor;

  return Math.max(warmthFloor, toFinite(warmthEff, warmthFloor));
}

/**
 * 根据饱腹阶段给体温流失倍率修正（教案：-10/+5/+15/+50）
 * 返回值是“增量修正”，例如 -0.10 / +0.50。
 */
export function computeThermoLossModifierFromSatiety(satiety) {
  const value = clamp(toFinite(satiety, 100), 0, 100);
  if (value > 75) return -0.10;
  if (value > 50) return 0.05;
  if (value > 25) return 0.15;
  return 0.50;
}

/**
 * 汇总装备保暖值（最小可用）
 * - insulation：加总
 * - windproof/waterproof：按 1-Π(1-x) 合成
 * - shelterWarmthBonus：按 exposureLevel 提供场景加成
 */
export function computeWarmthRating(player, itemsById, placeProfile = {}, defs = {}) {
  const equipment = player?.equipment && typeof player.equipment === "object" ? player.equipment : {};
  const source = itemsById;

  let insulationSum = 0;
  let windproofProduct = 1;
  let waterproofProduct = 1;

  for (const itemId of Object.values(equipment)) {
    const id = String(itemId || "").trim();
    if (!id || !source || typeof source.get !== "function") continue;
    const item = source.get(id);
    const thermal = item?.thermal;
    if (!thermal || typeof thermal !== "object") continue;

    insulationSum += Math.max(0, toFinite(thermal.insulation, 0));
    const windproof = clamp01(thermal.windproof, 0);
    const waterproof = clamp01(thermal.waterproof, 0);
    windproofProduct *= (1 - windproof);
    waterproofProduct *= (1 - waterproof);
  }

  const exposure = String(placeProfile?.exposureLevel || "Open");
  const shelterBonusMap = defs?.shelterWarmthBonus || {};
  const shelterBonus = toFinite(shelterBonusMap?.[exposure], 0);

  const baseNakedWarmth = Math.max(0, toFinite(defs?.baseNakedWarmth, 0.5));
  const warmthMinClamp = Math.max(0.05, toFinite(defs?.warmthMinClamp, 0.2));
  const warmthRating = Math.max(warmthMinClamp, baseNakedWarmth + insulationSum + shelterBonus);
  const windproof = clamp01(1 - windproofProduct, 0);
  const waterproof = clamp01(1 - waterproofProduct, 0);

  return {
    warmthRating,
    windproof,
    waterproof
  };
}

/**
 * 九槽位装备综合防护（外界暴露模式）
 * - 隔热：阻热叠加
 * - 防风：漏风加权 power mean（p>1 时放大弱点惩罚）
 * - 综合分：P = a*I_eff + b*W_eff
 */
export function computeEquipmentProtectionProfile(equipment = {}, itemsById, weights = {}, defs = {}) {
  const entries = Object.entries(weights || {}).filter(([slot, weight]) => {
    return typeof slot === "string" && Number.isFinite(Number(weight)) && Number(weight) > 0;
  });

  let rTotal = 0;
  let leakPowerAccum = 0;
  const windLeakPower = Math.max(1, toFinite(defs?.windLeakPower, 1));

  for (const [slot, weightRaw] of entries) {
    const weight = Math.max(0, toFinite(weightRaw, 0));
    const itemId = String(equipment?.[slot] || "").trim();
    const item = itemId && itemsById && typeof itemsById.get === "function"
      ? itemsById.get(itemId)
      : null;
    const thermal = item?.wearable?.thermal && typeof item.wearable.thermal === "object"
      ? item.wearable.thermal
      : (item?.thermal && typeof item.thermal === "object" ? item.thermal : {});

    const insulation = clamp(toFinite(thermal?.insulation, 0), 0, 0.999999);
    const windproof = clamp01(thermal?.windproof, 0);

    const resistance = -Math.log(1 - insulation);
    const leak = clamp(1 - windproof, 1e-6, 1);

    rTotal += weight * resistance;
    leakPowerAccum += weight * Math.pow(leak, windLeakPower);
  }

  const insulationEff = clamp(1 - Math.exp(-rTotal), 0, 1);
  const leakTotal = clamp(Math.pow(leakPowerAccum, 1 / windLeakPower), 1e-6, 1);
  const windproofEff = clamp(1 - leakTotal, 0, 1);
  const pWeightInsulation = clamp(toFinite(defs?.pWeightInsulation, 0.55), 0, 1);
  const pWeightWindproof = clamp(toFinite(defs?.pWeightWindproof, 0.45), 0, 1);
  const weightSum = Math.max(0.000001, pWeightInsulation + pWeightWindproof);
  const protectionScore = clamp(
    (pWeightInsulation * insulationEff + pWeightWindproof * windproofEff) / weightSum,
    0,
    1
  );

  return {
    insulationEff,
    windproofEff,
    protectionScore
  };
}

export function computeExposureDurations(protectionScore, defs = {}) {
  const p = clamp(toFinite(protectionScore, 0), 0, 1);
  const baseIncapMin = Math.max(0.000001, toFinite(defs?.baseIncapMin, 3));
  const baseDeathMin = Math.max(0.000001, toFinite(defs?.baseDeathMin, 12));
  const incapCurveA = toFinite(defs?.incapCurveA, 6.398);
  const incapCurveB = Math.max(0.000001, toFinite(defs?.incapCurveB, 1.178));
  const deathCurveA = toFinite(defs?.deathCurveA, 5.438);
  const deathCurveB = Math.max(0.000001, toFinite(defs?.deathCurveB, 1.603));

  const tIncapRaw = baseIncapMin * Math.exp(incapCurveA * Math.pow(p, incapCurveB));
  const tDeathRaw = baseDeathMin * Math.exp(deathCurveA * Math.pow(p, deathCurveB));
  const tIncapQuantized = Math.max(1, Math.round(tIncapRaw));
  const tDeathQuantized = Math.max(1, Math.round(tDeathRaw));

  return {
    T_incap: tIncapQuantized,
    T_death: tDeathQuantized,
    T_incapRaw: tIncapRaw,
    T_deathRaw: tDeathRaw
  };
}

export function projectExposureStateAnalytical(hypo100, hp, timings = {}, dtMin = 0) {
  const currentHypo = clamp(toFinite(hypo100, 100), 0, 100);
  const currentHp = clamp(toFinite(hp, 100), 0, 100);
  const minutes = Math.max(0, toFinite(dtMin, 0));
  const tIncap = Math.max(0.000001, toFinite(timings?.T_incap, 3));
  const tDeath = Math.max(0.000001, toFinite(timings?.T_death, 12));

  const hypoAfter = clamp(currentHypo - 100 * (minutes / tIncap), 0, 100);
  const hpAfter = clamp(currentHp - 100 * (minutes / tDeath), 0, 100);

  return {
    hypoAfter,
    hpAfter,
    incapacitated: hypoAfter <= 0,
    dead: hpAfter <= 0
  };
}

function resolveCoreThresholdDefs(defs = {}) {
  const legacy = defs?.coreTemp || {};
  const core = defs?.core || {};
  const normalC = toFinite(core?.normalC, toFinite(legacy?.T_core_normal, 37));
  const deathC = toFinite(core?.deathC, 28);
  return {
    normalC,
    incapC: toFinite(core?.incapC, 35),
    deathC,
    minC: toFinite(core?.minC, toFinite(legacy?.T_core_min, 20)),
    maxC: toFinite(core?.maxC, toFinite(legacy?.T_core_max, 40)),
    hpStartDropC: toFinite(core?.hpStartDropC, normalC)
  };
}

function resolveExposureCoolingDefs(defs = {}) {
  const exposureCooling = defs?.exposureCooling || {};
  const coreTemp = defs?.coreTemp || {};
  return {
    warmThresholdC: toFinite(exposureCooling?.warmThresholdC, toFinite(coreTemp?.T_warm_threshold, 15)),
    refTempC: toFinite(exposureCooling?.refTempC, -13.974),
    coldPower: Math.max(0.000001, toFinite(exposureCooling?.coldPower, 3))
  };
}

export function computeExposureCoolingRateMul(tEnvEffC, defs = {}) {
  const exposureCooling = resolveExposureCoolingDefs(defs);
  const warmThresholdC = exposureCooling.warmThresholdC;
  const refTempC = Math.min(exposureCooling.refTempC, warmThresholdC - 0.001);
  const env = toFinite(tEnvEffC, warmThresholdC);
  if (env >= warmThresholdC) return 0;

  const coldSpan = Math.max(0.000001, warmThresholdC - refTempC);
  const coldRatio = clamp((warmThresholdC - env) / coldSpan, 0, 1);
  return clamp(Math.pow(coldRatio, exposureCooling.coldPower), 0, 1);
}

function computeTimeToThresholdHours(currentC, thresholdC, targetC, kPerHour) {
  const current = toFinite(currentC, thresholdC);
  const threshold = toFinite(thresholdC, current);
  const target = toFinite(targetC, 20);
  const k = Math.max(0, toFinite(kPerHour, 0));
  if (k <= 0 || current <= threshold) return 0;

  const curGap = current - target;
  const thresholdGap = threshold - target;
  if (curGap <= 0 || thresholdGap <= 0) return 0;

  const ratio = curGap / thresholdGap;
  if (!Number.isFinite(ratio) || ratio <= 1) return 0;
  return Math.max(0, Math.log(ratio) / k);
}

export function computeCoolingKsFromDurations(timings = {}, defs = {}) {
  const core = resolveCoreThresholdDefs(defs);
  const minC = Math.min(core.minC, core.deathC - 0.001);
  const safeHours = Math.max(1 / 60000, toFinite(timings?.T_incap, 3) / 60);
  const criticalHours = Math.max(1 / 60000, (toFinite(timings?.T_death, 12) - toFinite(timings?.T_incap, 3)) / 60);
  const safeNumerator = Math.max(0.000001, core.normalC - minC);
  const safeDenominator = Math.max(0.000001, core.incapC - minC);
  const criticalNumerator = Math.max(0.000001, core.incapC - minC);
  const criticalDenominator = Math.max(0.000001, core.deathC - minC);

  return {
    safeKPerHour: Math.max(0, Math.log(safeNumerator / safeDenominator) / safeHours),
    criticalKPerHour: Math.max(0, Math.log(criticalNumerator / criticalDenominator) / criticalHours),
    targetC: minC,
    normalC: core.normalC,
    incapC: core.incapC,
    deathC: core.deathC,
    minC,
    maxC: core.maxC,
    T_incap: Math.max(0, toFinite(timings?.T_incap, 0)),
    T_death: Math.max(0, toFinite(timings?.T_death, 0))
  };
}

export function stepCoreTempCoolingExp(tCoreC, coolingProfile = {}, dtHours = 0) {
  const dt = Math.max(0, toFinite(dtHours, 0));
  const minC = toFinite(coolingProfile?.minC, 20);
  const maxC = toFinite(coolingProfile?.maxC, 40);
  const incapC = toFinite(coolingProfile?.incapC, 35);
  const deathC = toFinite(coolingProfile?.deathC, 28);
  const targetC = Math.min(toFinite(coolingProfile?.targetC, minC), deathC - 0.001);
  const safeKPerHour = Math.max(0, toFinite(coolingProfile?.safeKPerHour, 0));
  const criticalKPerHour = Math.max(0, toFinite(coolingProfile?.criticalKPerHour, safeKPerHour));
  let current = clamp(toFinite(tCoreC, toFinite(coolingProfile?.normalC, 37)), minC, maxC);
  if (dt <= 0 || current <= minC) return current;

  let remaining = dt;
  if (current > incapC && safeKPerHour > 0) {
    const safeHours = computeTimeToThresholdHours(current, incapC, targetC, safeKPerHour);
    if (safeHours <= 0 || safeHours >= remaining) {
      return stepTowardTargetExpC({
        tCurrentC: current,
        tTargetC: targetC,
        dtHours: remaining,
        kPerHour: safeKPerHour,
        efficiencyMul: 1,
        minC,
        maxC
      });
    }
    current = incapC;
    remaining -= safeHours;
  }

  if (remaining > 0 && current > deathC && criticalKPerHour > 0) {
    const criticalHours = computeTimeToThresholdHours(current, deathC, targetC, criticalKPerHour);
    if (criticalHours <= 0 || criticalHours >= remaining) {
      return stepTowardTargetExpC({
        tCurrentC: current,
        tTargetC: targetC,
        dtHours: remaining,
        kPerHour: criticalKPerHour,
        efficiencyMul: 1,
        minC,
        maxC
      });
    }
    current = deathC;
    remaining -= criticalHours;
  }

  if (remaining > 0 && criticalKPerHour > 0) {
    current = stepTowardTargetExpC({
      tCurrentC: current,
      tTargetC: targetC,
      dtHours: remaining,
      kPerHour: criticalKPerHour,
      efficiencyMul: 1,
      minC,
      maxC
    });
  }

  return clamp(current, minC, maxC);
}

export function mapCoreTempToHypo100(tCoreC, defs = {}) {
  const core = resolveCoreThresholdDefs(defs);
  const tCore = clamp(toFinite(tCoreC, core.normalC), core.minC, core.maxC);
  if (tCore >= core.normalC) return 100;
  if (tCore <= core.incapC) return 0;
  const span = Math.max(0.000001, core.normalC - core.incapC);
  return clamp(((tCore - core.incapC) / span) * 100, 0, 100);
}

export function mapCoreTempToHp100(tCoreC, defs = {}) {
  const rawTCore = Number(tCoreC);
  const tCore = Number.isFinite(rawTCore) ? rawTCore : 37;

  if (defs && typeof defs === "object" && !Number.isFinite(Number(defs))) {
    const core = resolveCoreThresholdDefs(defs);
    const start = Number(core.hpStartDropC);
    const death = Number(core.deathC);
    if (!Number.isFinite(start) || !Number.isFinite(death) || start <= death) {
      return 100;
    }
    if (tCore >= start) return 100;
    if (tCore <= death) return 0;
    return clamp((100 * (tCore - death)) / (start - death), 0, 100);
  }

  const hpStartDropC = Number(defs);
  const deathC = Number(arguments[2]);
  if (!Number.isFinite(tCore) || !Number.isFinite(hpStartDropC) || !Number.isFinite(deathC) || hpStartDropC <= deathC) {
    return 100;
  }
  if (tCore >= hpStartDropC) return 100;
  if (tCore <= deathC) return 0;
  return clamp((100 * (tCore - deathC)) / (hpStartDropC - deathC), 0, 100);
}

export function estimateCoreCoolingEtas(tCoreC, timings = {}, defs = {}, rateMul = 1) {
  const profile = computeCoolingKsFromDurations(timings, defs);
  const appliedRateMul = Math.max(0, toFinite(rateMul, 1));
  const tCore = clamp(toFinite(tCoreC, profile.normalC), profile.minC, profile.maxC);
  if (appliedRateMul <= 0) {
    return { toIncapMinutes: Infinity, toDeathMinutes: Infinity, coolingProfile: profile };
  }
  if (tCore <= profile.deathC) {
    return { toIncapMinutes: 0, toDeathMinutes: 0, coolingProfile: profile };
  }
  if (tCore <= profile.incapC) {
    return {
      toIncapMinutes: 0,
      toDeathMinutes: Math.max(0, Math.ceil(computeTimeToThresholdHours(tCore, profile.deathC, profile.targetC, profile.criticalKPerHour * appliedRateMul) * 60)),
      coolingProfile: profile
    };
  }

  const safeHours = computeTimeToThresholdHours(tCore, profile.incapC, profile.targetC, profile.safeKPerHour * appliedRateMul);
  const criticalHours = computeTimeToThresholdHours(profile.incapC, profile.deathC, profile.targetC, profile.criticalKPerHour * appliedRateMul);
  return {
    toIncapMinutes: Math.max(0, Math.ceil(safeHours * 60)),
    toDeathMinutes: Math.max(0, Math.ceil((safeHours + criticalHours) * 60)),
    coolingProfile: profile
  };
}

/**
 * 反解指数回归速率常数 k（单位：1/h）。
 * 满足：deltaWorst * exp(-k * hours) <= epsilon。
 * 例：target=37、T_core_min=20、deltaWorst=17、epsilon=0.1、hours=4 时，
 * k = -ln(0.1 / 17) / 4 ≈ 1.28395。
 */
export function computeExpRecoverKPerHour({ deltaWorstC = 0, epsilonC = 0.1, hours = 4 } = {}) {
  const deltaWorst = Math.max(0, toFinite(deltaWorstC, 0));
  const epsilon = Math.max(0.000001, toFinite(epsilonC, 0.1));
  const recoverHours = Math.max(0.000001, toFinite(hours, 4));
  if (deltaWorst <= epsilon) return 0;
  return Math.max(0, Math.log(deltaWorst / epsilon) / recoverHours);
}

/**
 * 指数方式向目标温度收敛。
 * 使用离散精确解，避免 dt 改变时数值漂移。
 */
export function stepTowardTargetExpC({
  tCurrentC = 37,
  tTargetC = 37,
  dtHours = 0,
  kPerHour = 0,
  efficiencyMul = 1,
  minC = 20,
  maxC = 40
} = {}) {
  const minTemp = toFinite(minC, 20);
  const maxTemp = toFinite(maxC, 40);
  const current = clamp(toFinite(tCurrentC, 37), minTemp, maxTemp);
  const target = clamp(toFinite(tTargetC, 37), minTemp, maxTemp);
  const dt = Math.max(0, toFinite(dtHours, 0));
  const k = Math.max(0, toFinite(kPerHour, 0));
  const eff = Math.max(0, toFinite(efficiencyMul, 1));
  if (dt <= 0 || k <= 0 || eff <= 0 || Math.abs(current - target) <= 1e-9) {
    return clamp(current, minTemp, maxTemp);
  }

  const retain = Math.exp(-k * eff * dt);
  const next = target + (current - target) * retain;
  return clamp(next, minTemp, maxTemp);
}

export function isNearTargetC(tC, targetC, epsilonC = 0.1) {
  const epsilon = Math.max(0.000001, toFinite(epsilonC, 0.1));
  return Math.abs(toFinite(tC, targetC) - toFinite(targetC, 37)) <= epsilon;
}

/**
 * 核心体温推进（℃）
 *
 * 冷却与回暖分离：
 * - 冷却：当环境偏冷（< T_cold_threshold）时，按 k_temp 逼近环境温度。
 * - 回暖：当环境偏暖（> T_warm_threshold）且低于常温时，按 k_warm 回升。
 *
 * 备注：
 * - 风速与保暖通过 heatLossMul 进入冷却项。
 * - 函数只更新 T_core，不处理 HP 或 UI。
 */
export function stepCoreTempC(tCoreC, tEnvC, windLocal, warmthEff, defs = {}, dtHours = 0) {
  const dt = Math.max(0, toFinite(dtHours, 0));
  if (dt <= 0) return clamp(toFinite(tCoreC, 37), 20, 40);

  const tCoreMin = toFinite(defs?.T_core_min, 20);
  const tCoreMax = toFinite(defs?.T_core_max, 40);
  const tCoreNormal = toFinite(defs?.T_core_normal, 37);
  const tColdThreshold = toFinite(defs?.T_cold_threshold, 0);
  const tWarmThreshold = toFinite(defs?.T_warm_threshold, 15);
  const kTemp = Math.max(0, toFinite(defs?.k_temp, 0.18));
  const kWarm = Math.max(0, toFinite(defs?.k_warm, 0.11));
  const thermoLossModifier = toFinite(defs?.thermoLossModifier, 0);
  const bodyTemperatureDecayModifier = Math.max(0, toFinite(defs?.bodyTemperatureDecayModifier, 1));
  const coolingRateMultiplier = Math.max(0, toFinite(defs?.coolingRateMultiplier, 1));
  const warmingRateMultiplier = Math.max(0, toFinite(defs?.warmingRateMultiplier, 1));
  const sleepTempLossMul = Math.max(0.25, toFinite(defs?.sleepTempLossMul, 1));

  const currentCore = clamp(toFinite(tCoreC, tCoreNormal), tCoreMin, tCoreMax);
  const env = toFinite(tEnvC, -10);
  const warmth = Math.max(0.05, toFinite(warmthEff, 0.2));
  let nextCore = currentCore;

  if (env < tColdThreshold) {
    const coldExposure = Math.max(0, -env);
    let coolRate = kTemp * coldExposure / warmth;
    coolRate *= (1 + thermoLossModifier);
    coolRate *= bodyTemperatureDecayModifier;
    coolRate *= coolingRateMultiplier;
    coolRate *= sleepTempLossMul;
    coolRate = Math.max(0, coolRate);
    const dCoreCold = coolRate * dt;
    nextCore -= dCoreCold;
  }

  if (env > tWarmThreshold && nextCore < tCoreNormal) {
    // 回暖项：只在“环境足够暖 + 当前低于常温”时触发，避免反复抖动。
    const warmGap = tCoreNormal - nextCore;
    const dCoreWarm = kWarm * warmGap * dt * warmingRateMultiplier;
    nextCore += dCoreWarm;
  }

  return clamp(nextCore, tCoreMin, tCoreMax);
}

/**
 * 失温条推进
 *
 * 两段：
 * 1) 用核心体温映射目标值 targetHypo（分段线性）
 * 2) 用一阶滞后向 targetHypo 收敛（时间常数 tauHours）
 */
export function stepHypothermia(hypo, tCoreC, defs = {}, dtHours = 0) {
  const dt = Math.max(0, toFinite(dtHours, 0));
  const current = clamp(toFinite(hypo, 100), 0, 100);
  const tCore = clamp(toFinite(tCoreC, 37), 20, 40);

  const mapDefs = defs?.map || {};
  const segments = Array.isArray(mapDefs.segments) && mapDefs.segments.length > 0
    ? mapDefs.segments
    : [
      { tMin: 36.5, tMax: 40, yAtMin: 100, yAtMax: 100 },
      { tMin: 35.5, tMax: 36.5, yAtMin: 75, yAtMax: 100 },
      { tMin: 34.0, tMax: 35.5, yAtMin: 45, yAtMax: 75 },
      { tMin: 20.0, tMax: 34.0, yAtMin: 10, yAtMax: 45 }
    ];

  const tauHours = Math.max(0.01, toFinite(defs?.tauHours, 0.5));

  let targetHypo = current;
  for (const seg of segments) {
    const tMin = toFinite(seg.tMin, 0);
    const tMax = toFinite(seg.tMax, 0);
    const yAtMin = clamp(toFinite(seg.yAtMin, 0), 0, 100);
    const yAtMax = clamp(toFinite(seg.yAtMax, 100), 0, 100);
    if (tCore < Math.min(tMin, tMax) || tCore > Math.max(tMin, tMax)) continue;

    if (Math.abs(tMax - tMin) < 0.0001) {
      targetHypo = yAtMin;
    } else {
      const alpha = (tCore - tMin) / (tMax - tMin);
      targetHypo = yAtMin + (yAtMax - yAtMin) * alpha;
    }
    break;
  }

  targetHypo = clamp(targetHypo, 0, 100);

  // 一阶滞后离散解：x(t+dt) = x + (target-x) * (1 - e^(-dt/tau))
  const gain = 1 - Math.exp(-dt / tauHours);
  const hypoNew = clamp(current + (targetHypo - current) * gain, 0, 100);
  const hypoStage = getHypothermiaStage(hypoNew);

  return {
    hypoNew,
    hypoStage,
    targetHypo
  };
}
