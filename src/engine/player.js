// ============================================================================
// 玩家状态管理（纯数据驱动）
// ============================================================================
// 设计原则：
// 1. getPlayerDerived() - 只读派生，不写回 player
// 2. applyTimeToPlayer() - 唯一写入入口，修改 player 的当前值
// 3. 所有规则从 player_defs.js 读取，不在逻辑中硬编码数值
// 4. 允许引用未实现属性（mood/temp），记录到 pending 而不报错
// ============================================================================

import { PLAYER_DEFS, getStageForValue } from "./player_defs.js";
import { getDefaultEquipment, getItemsById } from "./items_db.js";
import { createDefaultTaskEntries } from "./tasks.js";
import { createDefaultProfile } from "./profile/defs.js";
import { createEmptyAchievementState } from "./achievement_store.js";
import { createEmptyArchiveReadingState } from "./archive_reading/state.js";
import { createEmptyRecordState } from "./records/record_state.js";
import { createEmptySocialState } from "./social/social_state.js";
import {
  computeEnvTempC,
  computeCoolingKsFromDurations,
  computeExpRecoverKPerHour,
  computeEquipmentProtectionProfile,
  computeEffectiveEnvTempC,
  computeExposureCoolingRateMul,
  computeExposureDurations,
  computeLocalWind,
  computeEffectiveWarmth,
  isNearTargetC,
  mapCoreTempToHp100,
  mapCoreTempToHypo100,
  computeWarmthRating,
  computeThermoLossModifierFromSatiety,
  stepTowardTargetExpC,
  stepCoreTempC,
  stepCoreTempCoolingExp
} from "../systems/temperature/temperature_system.js";
import { getCalendarViewFromTotalMinutes } from "./calendar_model.js";
import { getSeasonTemperatureDelta } from "../systems/temperature/temperature_season.js";
import { stepWetness } from "../systems/temperature/wetness_system.js";
import { getProfileDisplayLevelByXp, getProfileTotalXp } from "./profile/defs.js";
import { applyDebugPlayerStatLocks } from "./debug/debug_player_stat_locks.js";
import {
  STATUS_EFFECT_KEYS,
  applyConsumableStatusEffects,
  cloneStatusEffectsState,
  consumeStatusEffectsForTick,
  createEmptyStatusEffectsState,
  ensureStatusEffectsState,
  resolveStatusEffectModifier,
  resolveStatusEffectPeriodicDeltas
} from "./status_effect_runtime.js";

// ============================================================================
// 默认状态创建
// ============================================================================

/**
 * 创建默认玩家状态（可序列化，用于存档）
 * @returns {object} 玩家状态对象
 */
export function createDefaultPlayerState() {
  return {
    // 生理属性（physiology）
    physio: {
      satiety: 100,    // 饱腹
      intakeLoad: 0,   // 短期进食负荷
      stamina: 100,    // 体力
      temperatureC: 37 // 核心体温（L1）
    },

    // 心理/核心属性（psycho）
    psycho: {
      hp: 100,         // 健康
      fatigue: 100,    // 睡眠
      hypothermia: 100, // 失温条（L2，100安全）
      hypoStage: "Safe" // 失温阶段（可存档，避免 UI 每次反推）
    },

    // 热学输入（装备/衣物等系统的占位接口）
    gear: {
      thermal: {
        warmthRating: 0.8,
        wetness: 0,
        windproof: 0,
        waterproof: 0,
        insulationEff: 0,
        windproofEff: 0,
        protectionScore: 0
      }
    },

    exposure: {
      hypo100: 100,
      incapacitated: false,
      dead: false
    },

    // 上限（可被修正影响）
    limits: {
      hpMax: 100,
      satietyMax: 100,
      staminaMax: 100,
      fatigueMax: 100
    },

      // 独立成长真值层（只存长期成长，不映射到本次属性效果）
      profile: createDefaultProfile(),

      transit: {
        ride: null
      },

    // 扩展槽（未来：心情、体温、感染、负重等）
    extra: {
      // mood: 100,
      // temp: 37,
      // infection: 0,
      // burden: 0
    },

    // 背包（itemId + qty）
    inventory: [],

    // 备忘录/任务（无奖励，仅状态与引导）
    tasks: createDefaultTaskEntries(),

    // 记录系统真值（只存解锁 truth，不存静态正文资产）
    records: createEmptyRecordState(),

    // NPC 社交真值（只存关系 truth，不存静态定义资产）
    social: createEmptySocialState(),

    // 成就系统真值（只存解锁状态与系统时间）
    achievements: createEmptyAchievementState(),

    // 装备位（9格，值为 itemId 或 null）
    equipment: getDefaultEquipment(),

    // 元数据（日志、每日上限等）
    meta: {
      day: 1,
      daily: {
        sleepFatigueRecovered: 0  // 每天通过睡眠最多回复14.3 Fatigue（未来实现）
      },
      libraryReading: {
        seenBookIds: [],
        readOrder: [],
        daily: {
          dayKey: "",
          readCount: 0
        }
      },
      archiveReading: createEmptyArchiveReadingState(),
      sequenceStateLock: {
        active: false,
        coreVitals: null
      },
      itemUseCooldowns: {},
      statusEffects: createEmptyStatusEffectsState(),
      sleepEpisode: {
        mode: "REST",
        episodeSleepMin: 0,
        awakeGapMin: 0,
        fatigueRecoveredInWindow: 0,
        fatigueRecoveryWindowStartMin: 0,
        collapseEpisodeFatigueRecovered: 0
      }
    }
  };
}

export function applyStarterKitToPlayer(player) {
  const target = player && typeof player === "object"
    ? player
    : createDefaultPlayerState();

  const starterItemIds = [
    "starter_lining_wool",
    "starter_lower_cotton",
    "starter_shoes_boots"
  ];

  const inventoryRows = Array.isArray(target.inventory)
    ? target.inventory
        .filter((row) => row && typeof row === "object")
        .map((row) => ({
          itemId: String(row.itemId || "").trim(),
          qty: Math.max(0, Math.floor(Number(row.qty ?? 0) || 0))
        }))
        .filter((row) => row.itemId && row.qty > 0)
    : [];

  const byId = new Map(inventoryRows.map((row) => [row.itemId, { ...row }]));
  for (const itemId of starterItemIds) {
    const existing = byId.get(itemId);
    if (existing) {
      existing.qty = Math.max(1, existing.qty);
    } else {
      byId.set(itemId, { itemId, qty: 1 });
    }
  }

  target.inventory = Array.from(byId.values());

  target.equipment = {
    ...getDefaultEquipment(),
    ...(target.equipment && typeof target.equipment === "object" ? target.equipment : {}),
    lining: "starter_lining_wool",
    lower: "starter_lower_cotton",
    shoes: "starter_shoes_boots"
  };

  return target;
}

function getActiveSequenceStateLock(player) {
  const lock = player?.meta?.sequenceStateLock;
  if (!lock || typeof lock !== "object" || lock.active !== true) return null;
  const coreVitals = lock.coreVitals;
  return coreVitals && typeof coreVitals === "object" ? coreVitals : null;
}

function applyPlayerSequenceStateLock(player) {
  const coreVitals = getActiveSequenceStateLock(player);
  if (!coreVitals || !player) return player;

  player.psycho.hp = Number.isFinite(Number(coreVitals.hp)) ? Number(coreVitals.hp) : player.psycho.hp;
  player.physio.satiety = Number.isFinite(Number(coreVitals.satiety)) ? Number(coreVitals.satiety) : player.physio.satiety;
  player.physio.stamina = Number.isFinite(Number(coreVitals.stamina)) ? Number(coreVitals.stamina) : player.physio.stamina;
  player.psycho.fatigue = Number.isFinite(Number(coreVitals.fatigue)) ? Number(coreVitals.fatigue) : player.psycho.fatigue;
  player.physio.temperatureC = Number.isFinite(Number(coreVitals.temperatureC)) ? Number(coreVitals.temperatureC) : player.physio.temperatureC;
  player.psycho.hypothermia = Number.isFinite(Number(coreVitals.hypothermia)) ? Number(coreVitals.hypothermia) : player.psycho.hypothermia;
  player.psycho.hypoStage = String(coreVitals.hypoStage || player.psycho.hypoStage || "Safe");
  player.exposure.hypo100 = player.psycho.hypothermia;
  player.exposure.incapacitated = coreVitals.incapacitated === true;
  player.exposure.dead = coreVitals.dead === true;
  return player;
}

// ============================================================================
// 只读派生（不写回 player）
// ============================================================================

/**
 * 获取玩家派生数据（只读快照，不修改 player）
 * @param {object} player - 玩家状态对象
 * @param {object} context - 上下文（可选）
 * @returns {object} 派生数据快照
 */
export function getPlayerDerived(player, context = {}) {
  const derived = {
    attrs: {},      // 4个核心属性的完整信息
    mods: {},       // 聚合后的 L3 修正
    deltaPerHour: {},  // 聚合后的持续变化
    recoveryPerHour: {
      hpNatural: 0
    },
    pending: [],    // 未实现属性的引用
    profile: null
  };

  // 规则门禁默认放行，仅在映射显式关闭时才禁用。
  derived.mods.canLearnNegotiationEvents = true;

  // --------------------------------------------------------------------------
  // 1. 遍历4个核心属性，计算阶段和修正
  // --------------------------------------------------------------------------
  const attrIds = ["hp", "satiety", "stamina", "fatigue"];
  const attrValueMap = {
    hp: player.psycho.hp,
    satiety: player.physio.satiety,
    stamina: player.physio.stamina,
    fatigue: player.psycho.fatigue
  };

  for (const attrId of attrIds) {
    const attrDef = PLAYER_DEFS.attributes[attrId];
    const curValue = attrValueMap[attrId];
    const baseMax = attrDef.max;

    // 获取当前阶段
    const stage = getStageForValue(attrId, curValue);

    // 构建属性信息
    derived.attrs[attrId] = {
      cur: curValue,
      baseMax: baseMax,
      effectiveMax: baseMax,  // 先设为 baseMax，后续应用 mods 修正
      pct: (curValue / baseMax) * 100,
      stageName: stage ? stage.name : "未知",
      stageDesc: stage ? stage.desc : ""
    };

    // 聚合 mods
    if (stage && stage.mods) {
      for (const [modKey, modValue] of Object.entries(stage.mods)) {
        // 检查是否引用未实现属性
        if (modKey.includes("temp") || modKey.includes("mood")) {
          // 记录但不报错
          derived.pending.push({
            source: `${attrId}.${stage.name}`,
            mod: modKey,
            value: modValue,
            reason: "属性未实现"
          });
        }

        // 聚合修正（乘法叠加）
        if (!derived.mods[modKey]) {
          derived.mods[modKey] = 1.0;
        }
        // 假设都是乘法修正，转换百分比
        if (modValue > 0 && modValue < 10) {
          // 已经是倍率形式（如 1.05）
          derived.mods[modKey] *= modValue;
        } else {
          // 百分比形式（如 5 表示 5%）
          derived.mods[modKey] *= (1 + modValue / 100);
        }
      }
    }

    // 聚合 deltaPerHour
    if (stage && stage.deltaPerHour) {
      for (const [deltaKey, deltaValue] of Object.entries(stage.deltaPerHour)) {
        // 检查是否引用未实现属性
        if (deltaKey === "mood" || deltaKey === "temp") {
          derived.pending.push({
            source: `${attrId}.${stage.name}`,
            delta: deltaKey,
            value: deltaValue,
            reason: "属性未实现"
          });
        }

        // 聚合持续变化（加法叠加）
        if (!derived.deltaPerHour[deltaKey]) {
          derived.deltaPerHour[deltaKey] = 0;
        }
        derived.deltaPerHour[deltaKey] += deltaValue;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 2. 应用上限修正（staminaMaxMul）
  // --------------------------------------------------------------------------
  if (derived.mods.staminaMaxMul) {
    const baseMax = PLAYER_DEFS.attributes.stamina.max;
    derived.attrs.stamina.effectiveMax = baseMax * derived.mods.staminaMaxMul;
  }

  // --------------------------------------------------------------------------
  // 3. 检查 HP 自然回复规则
  // --------------------------------------------------------------------------
  const hpRegenRule = PLAYER_DEFS.specialRules.hpRegenRule;
  if (hpRegenRule.enabled) {
    const cond = hpRegenRule.conditions;
    const hp = player.psycho.hp;
    const satiety = player.physio.satiety;
    const fatigue = player.psycho.fatigue;

    // 检查条件
    let canRegen = true;
    const pendingConditions = [];

    if (hp <= cond.hpMin || hp > cond.hpMax) {
      canRegen = false;
    }
    if (satiety <= cond.satietyMin) {
      canRegen = false;
    }
    if (fatigue <= cond.fatigueMin) {
      canRegen = false;
    }

    // mood 未实现，记录到 pending
    if (cond.moodMin !== undefined) {
      if (!player.extra.mood) {
        pendingConditions.push({
          rule: "hpRegen",
          condition: "mood",
          required: `> ${cond.moodMin}`,
          reason: "mood 属性未实现"
        });
        canRegen = false;  // 无法检查 mood，禁用回复
      } else if (player.extra.mood <= cond.moodMin) {
        canRegen = false;
      }
    }

    if (pendingConditions.length > 0) {
      derived.pending.push(...pendingConditions);
    }

    // 如果满足条件，添加到 deltaPerHour
    if (canRegen) {
      const hpRegenRaw = Number(hpRegenRule.effect.hp);
      if (Number.isFinite(hpRegenRaw) && hpRegenRaw > 0) {
        const hpRegenRateMul = Number(derived.mods.hpRegenRateMul);
        const hpRegenApplied = Number.isFinite(hpRegenRateMul) && hpRegenRateMul > 0
          ? hpRegenRaw * hpRegenRateMul
          : hpRegenRaw;
        derived.recoveryPerHour.hpNatural = hpRegenApplied;
        if (!derived.deltaPerHour.hp) {
          derived.deltaPerHour.hp = 0;
        }
        derived.deltaPerHour.hp += hpRegenApplied;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 4. Profile 派生修正（体能/阅历/理性-信仰双向轴）
  // --------------------------------------------------------------------------
  const profile = player?.profile && typeof player.profile === "object" ? player.profile : {};
  const physiqueTotalXp = getProfileTotalXp("physique", profile?.physique?.level, profile?.physique?.xp);
  const experienceTotalXp = getProfileTotalXp("experience", profile?.experience?.level, profile?.experience?.xp);
  const physiqueLevel = normalizeProfileDisplayLevel(getProfileDisplayLevelByXp(physiqueTotalXp));
  const experienceLevel = normalizeProfileDisplayLevel(getProfileDisplayLevelByXp(experienceTotalXp));

  const worldviewAxisRaw = Number(profile?.worldview?.axis ?? 0);
  const worldviewAxis = clamp(Number.isFinite(worldviewAxisRaw) ? worldviewAxisRaw : 0, -100, 100);
  const rationalityDisplay = Math.max(0, worldviewAxis);
  const faithDisplay = Math.max(0, -worldviewAxis);
  const rationalityLevel = normalizeProfileDisplayLevel(getProfileDisplayLevelByXp(rationalityDisplay));
  const faithLevel = normalizeProfileDisplayLevel(getProfileDisplayLevelByXp(faithDisplay));
  const worldviewSide = worldviewAxis > 0 ? "rational" : (worldviewAxis < 0 ? "faith" : "neutral");
  const worldviewLevel = worldviewSide === "rational"
    ? rationalityLevel
    : worldviewSide === "faith"
      ? faithLevel
      : 0;

  derived.profile = {
    physiqueLevel,
    experienceLevel,
    worldviewAxis,
    rationalityLevel,
    faithLevel,
    worldviewSide,
    worldviewLevel
  };

  const profileDefs = PLAYER_DEFS.profileModifiers || {};
  applyProfileModifierRow(derived.mods, profileDefs?.staminaLevelModifiers?.[physiqueLevel]);
  applyProfileModifierRow(derived.mods, profileDefs?.experienceLevelModifiers?.[experienceLevel]);
  applyProfileModifierRow(derived.mods, profileDefs?.rationalFaithSharedModifiers?.[worldviewLevel]);

  return derived;
}

// ============================================================================
// 时间推进（唯一写入入口）
// ============================================================================

/**
 * 推进时间并更新玩家状态
 * @param {object} player - 玩家状态对象（会被修改）
 * @param {number} minutes - 推进的分钟数
 *   - isSleeping: boolean（是否在睡眠中）
 * @returns {object} { events: [], derived: <最新快照> }
 */
export function applyTimeToPlayer(player, minutes, context = {}) {
  const hours = minutes / 60;
  const events = [];
  const tickMinutes = Math.max(0, Number(minutes) || 0);
  const didAdvanceTime = tickMinutes > 0;
  const tempDefs = PLAYER_DEFS.temperature || {};
  const coreThresholds = resolveCoreThresholds(tempDefs);
  const hpStartDropC = Number(coreThresholds.hpStartDropC ?? coreThresholds.normalC);

  // --------------------------------------------------------------------------
  // 0. 数据补齐：保证旧存档或外部调用进入时温度字段完整
  // --------------------------------------------------------------------------
  ensureThermalFields(player);
  normalizePlayerVitals(player);

  const sessionCoverage = String(context?.sessionCoverage || "NONE");
  const inMedicalRecovery =
    sessionCoverage === "OBS" ||
    sessionCoverage === "WARD_BED" ||
    sessionCoverage === "WARD_NON_BED";
  const hasThermalContext = !!(
    context &&
    (
      (context.world && typeof context.world === "object") ||
      (context.regionCfg && typeof context.regionCfg === "object") ||
      (context.placeProfile && typeof context.placeProfile === "object") ||
      (context.thermalEnvOverride && typeof context.thermalEnvOverride === "object")
    )
  );
  const nowTotalMinutes = resolveNowTotalMinutes(context);
  ensureStatusEffectsState(player);
  const hpCliffTraceEnabled = isHpCliffTraceEnabled(context);
  const thermalTraceEnabled = isThermalTraceEnabled(context);
  const hpCliffTrace = hpCliffTraceEnabled
    ? {
        tick: {
          minutes: tickMinutes,
          timeBefore: Math.max(0, Number(nowTotalMinutes) - tickMinutes),
          timeAfter: Number(nowTotalMinutes)
        },
        stages: {},
        firstZeroStage: null,
        normalizeHooks: []
      }
    : null;
  const thermalTrace = thermalTraceEnabled
    ? {
        tick: {
          minutes: tickMinutes,
          timeBefore: Math.max(0, Number(nowTotalMinutes) - tickMinutes),
          timeAfter: Number(nowTotalMinutes)
        },
        input: null,
        process: null,
        breakdown: null,
        deadByTemperature: false
      }
    : null;
  const recordHpStage = (stageName, values) => {
    if (!hpCliffTrace) return;
    hpCliffTrace.stages[stageName] = values;
    const hp = Number(values?.hp);
    if (hpCliffTrace.firstZeroStage == null && Number.isFinite(hp) && hp <= 0) {
      hpCliffTrace.firstZeroStage = stageName;
    }
  };

  recordHpStage("before", {
    mode: String(player?.meta?.sleepEpisode?.mode || "REST"),
    hp: Number(player?.psycho?.hp),
    stamina: Number(player?.physio?.stamina),
    satiety: Number(player?.physio?.satiety),
    fatigue: Number(player?.psycho?.fatigue),
    temperatureC: Number(player?.physio?.temperatureC),
    hypothermia: Number(player?.psycho?.hypothermia),
    dead: !!player?.exposure?.dead
  });
  const sleepState = ensureSleepEpisodeState(player, nowTotalMinutes);
  const previousMode = sleepState.mode;
  const mode = resolveSleepMode({
    context,
    inMedicalRecovery,
    player,
    sleepState
  });
  sleepState.mode = mode;
  const isSleepMode = mode === "SLEEP";
  const isCollapseMode = mode === "COLLAPSE";
  const isSleepLikeMode = isSleepMode || isCollapseMode;

  if (previousMode !== "COLLAPSE" && mode === "COLLAPSE") {
    sleepState.collapseEpisodeFatigueRecovered = 0;
  }

  // 记录 HP 的初始阶段（用于检测睡眠打断）
  const hpBefore = player.psycho.hp;
  const thermalHpAtStart = roundTo3(mapCoreTempToHp100(
    player.physio.temperatureC,
    hpStartDropC,
    coreThresholds.deathC
  ));
  let hpNonThermalOffset = roundTo3(hpBefore - thermalHpAtStart);

  const sleepProfile = computeSleepExposureProfile(player, {
    ...context,
    mode,
    inMedicalRecovery
  });
  const sleepSatietyDecayMul = isSleepLikeMode ? Number(sleepProfile.sleepSatietyDecayMul) : 1;
  const sleepTempLossMul = isSleepLikeMode ? Number(sleepProfile.sleepTempLossMul) : 1;
  const preDerived = getPlayerDerived(player, context);
  const preDerivedSatietyDecayModifier = resolvePositiveModifier(preDerived?.mods?.satietyDecayModifier);
  const preSatietyDecayModifier = preDerivedSatietyDecayModifier
    * resolveStatusEffectModifier(player, STATUS_EFFECT_KEYS.SATIETY_DECAY_RATE, tickMinutes);

  // --------------------------------------------------------------------------
  // 结算顺序（固定，避免阈值抖动）
  // --------------------------------------------------------------------------

  // 1. 饱腹度衰减（区分睡眠/非睡眠）
  // 医疗恢复期（急诊/住院）不走常规衰减，避免抵消“每小时 +10”
  if (!inMedicalRecovery) {
    const satietyDecayRate = isSleepLikeMode
      ? PLAYER_DEFS.baseMetabolism.satietyDecaySleepPerHour
      : PLAYER_DEFS.baseMetabolism.satietyDecayAwakePerHour;
    const satietyRateMul = Number.isFinite(sleepSatietyDecayMul) && sleepSatietyDecayMul > 0
      ? sleepSatietyDecayMul
      : 1;
    player.physio.satiety -= satietyDecayRate * hours * satietyRateMul * preSatietyDecayModifier;
  }

  const intakeLoadDecayRate = Number(PLAYER_DEFS?.intakeLoad?.decayPerHour ?? 1.2);
  if (Number.isFinite(intakeLoadDecayRate) && intakeLoadDecayRate > 0) {
    player.physio.intakeLoad -= intakeLoadDecayRate * hours;
  }

  // 2. 睡眠度衰减（非睡眠状态）
  if (mode === "REST" && !inMedicalRecovery) {
    const fatigueDecayRate = PLAYER_DEFS.baseMetabolism.fatigueDecayAwakePerHour;
    player.psycho.fatigue -= fatigueDecayRate * hours;
  }

  // 3. 预先归一化 vitals（避免阶段判断失败）
  // 注意：这里只做基础 clamp，effectiveMax 在后续统一应用。
  normalizePlayerVitals(player);

  // 4. 体力自然恢复（饱腹>75时）
  if (!inMedicalRecovery && mode === "REST" && player.physio.satiety > PLAYER_DEFS.baseMetabolism.staminaRegenSatietyThreshold) {
    const staminaRegen = PLAYER_DEFS.baseMetabolism.staminaRegenPerHourWhenSatiated * hours;
    player.physio.stamina += staminaRegen;
  }

  // 4.1 医疗期额外恢复（住院/急诊）：饱腹、体力、睡眠每小时 +10
  if (inMedicalRecovery) {
    const medicalRegen = 10 * hours;
    player.physio.satiety += medicalRegen;
    player.physio.stamina += medicalRegen;
    player.psycho.fatigue += medicalRegen;
  }

  recordHpStage("after_base_progression", {
    hp: Number(player?.psycho?.hp),
    stamina: Number(player?.physio?.stamina),
    satiety: Number(player?.physio?.satiety),
    fatigue: Number(player?.psycho?.fatigue)
  });

  // 5. 获取派生数据（阶段效果、修正、持续变化）
  const derived = getPlayerDerived(player, context);
  const sleepRateMul = resolveSleepRateMul(context);
  const sleepGainMul = resolveSleepGainMul(derived, {
    ...context,
    isSleeping: isSleepMode,
    sleepRateMul
  });
  const derivedStaminaDecayModifier = resolvePositiveModifier(derived?.mods?.staminaDecayModifier);
  const staminaDecayModifier = derivedStaminaDecayModifier
    * resolveStatusEffectModifier(player, STATUS_EFFECT_KEYS.STAMINA_DECAY_RATE, tickMinutes);
  const satietyDecayModifier = resolvePositiveModifier(derived?.mods?.satietyDecayModifier);
  const derivedHpDrainModifier = resolvePositiveModifier(derived?.mods?.hpDrainModifier);
  const hpDrainModifier = derivedHpDrainModifier
    * resolveStatusEffectModifier(player, STATUS_EFFECT_KEYS.HP_DECAY_RATE, tickMinutes);
  const thermoLossProfileModifier = resolvePositiveModifier(derived?.mods?.thermoLossModifier);
  const derivedBodyTemperatureDecayModifier = resolvePositiveModifier(derived?.mods?.bodyTemperatureDecayModifier);
  const bodyTemperatureDecayModifier = derivedBodyTemperatureDecayModifier
    * resolveStatusEffectModifier(player, STATUS_EFFECT_KEYS.BODY_TEMPERATURE_DECAY_RATE, tickMinutes);
  const coolingRateMultiplier = resolveStatusEffectModifier(player, STATUS_EFFECT_KEYS.COOLING_RATE, tickMinutes);
  const warmingRateMultiplier = resolveStatusEffectModifier(player, STATUS_EFFECT_KEYS.WARMING_RATE, tickMinutes);

  if (isSleepLikeMode && !inMedicalRecovery) {
    rollFatigueRecoveryWindow(sleepState, nowTotalMinutes);
    const effectiveSleepMin = computeEffectiveSleepMinutes({
      minutes: tickMinutes,
      mode,
      profile: sleepProfile,
      state: sleepState
    });

    if (effectiveSleepMin > 0) {
      const fatigueDelta = computeFatigueRecoveryDelta({
        episodeSleepMin: Number(sleepState.episodeSleepMin),
        effectiveSleepMin,
        fatigueRecoveredInWindow: Number(sleepState.fatigueRecoveredInWindow),
        mode,
        sleepRateMul
      });

      if (fatigueDelta > 0) {
        player.psycho.fatigue += fatigueDelta;
        if (mode === "SLEEP") {
          sleepState.fatigueRecoveredInWindow = roundTo3(Number(sleepState.fatigueRecoveredInWindow) + fatigueDelta);
        }
        if (mode === "COLLAPSE") {
          sleepState.collapseEpisodeFatigueRecovered = roundTo3(
            Number(sleepState.collapseEpisodeFatigueRecovered) + fatigueDelta
          );
        }
      }

      const staminaDelta = computeStaminaRecoveryDelta({
        currentStamina: Number(player.physio.stamina),
        effectiveStaminaMax: Number(derived?.attrs?.stamina?.effectiveMax ?? 100),
        effectiveSleepMin,
        mode,
        sleepRateMul
      });
      if (staminaDelta > 0) {
        player.physio.stamina += staminaDelta;
      }

      sleepState.episodeSleepMin = roundTo3(Number(sleepState.episodeSleepMin) + effectiveSleepMin);
      sleepState.awakeGapMin = 0;
    }
  }

  recordHpStage("after_collapse_sleep_recovery", {
    hp: Number(player?.psycho?.hp),
    stamina: Number(player?.physio?.stamina),
    fatigue: Number(player?.psycho?.fatigue)
  });

  const periodicStatusDeltas = resolveStatusEffectPeriodicDeltas(player, tickMinutes);
  const periodicStaminaDelta = Number(periodicStatusDeltas[STATUS_EFFECT_KEYS.STAMINA] || 0);
  const periodicSatietyDelta = Number(periodicStatusDeltas[STATUS_EFFECT_KEYS.SATIETY] || 0);
  const periodicHpDelta = Number(periodicStatusDeltas[STATUS_EFFECT_KEYS.HP] || 0);
  const periodicFatigueDelta = Number(periodicStatusDeltas[STATUS_EFFECT_KEYS.FATIGUE] || 0);
  const periodicTemperatureDelta = Number(periodicStatusDeltas[STATUS_EFFECT_KEYS.TEMPERATURE_C] || 0);
  if (periodicStaminaDelta !== 0) player.physio.stamina += periodicStaminaDelta;
  if (periodicSatietyDelta !== 0) player.physio.satiety += periodicSatietyDelta;
  if (periodicHpDelta !== 0) {
    player.psycho.hp += periodicHpDelta;
    hpNonThermalOffset = roundTo3(hpNonThermalOffset + periodicHpDelta);
  }
  if (periodicFatigueDelta !== 0) player.psycho.fatigue += periodicFatigueDelta;
  if (periodicTemperatureDelta !== 0) player.physio.temperatureC += periodicTemperatureDelta;

  // 6. 应用持续变化（deltaPerHour）
  applyDerivedDeltaPerHour(player, derived, hours, {
    isSleeping: isSleepMode,
    sleepGainMul,
    staminaDecayMul: staminaDecayModifier,
    satietyDecayMul: satietyDecayModifier,
    hpDrainMul: hpDrainModifier,
    onHpDelta: (deltaHp) => {
      hpNonThermalOffset = roundTo3(hpNonThermalOffset + deltaHp);
    }
  });
  consumeStatusEffectsForTick(player, tickMinutes);

  // 在温度结算前统一归一化一次，保证后续输入稳定。
  normalizePlayerVitals(player);

  // 6.5 温度系统（唯一写入口）
  // ------------------------------------------------------------------------
  // 关键约束：
  // - 所有温度相关写入只在此处进行；UI/渲染层只读。
  // - 环境温度/局地风/有效保暖均是派生量，不存档。
  // ------------------------------------------------------------------------
  const fallbackWorld = {
    sun: 40,
    snowfallRate: 0,
    windSpeed: 5,
    exposureEnabled: false
  };
  const fallbackRegion = {
    T_base: -1,
    SunAmp: 0,
    SnowWarmAmp: 0,
    Pmax: 1
  };
  const fallbackPlace = inMedicalRecovery
    ? { space: "indoor", exposureLevel: "Sheltered", windShelter: 1, heatSource: 1, drying: 1 }
    : { space: "outdoor", exposureLevel: "Open", windShelter: 0, heatSource: 0, drying: 0 };

  const worldView = hasThermalContext ? (context?.world || {}) : fallbackWorld;
  const regionCfg = hasThermalContext ? (context?.regionCfg || null) : fallbackRegion;
  const placeProfile = hasThermalContext ? (context?.placeProfile || {}) : fallbackPlace;
  const timeView = context?.timeView || context?.timeViewAfter || null;
  const coreDefs = tempDefs.coreTemp || {};
  const indoorWarmDefs = tempDefs.indoorWarm || {};
  const exposureDefs = tempDefs.exposureModel || {};
  const wetnessDefs = PLAYER_DEFS.wetness || {};
  const dtHours = minutes / 60;
  const actionExposureMultiplier = resolveActionExposureMultiplier(context?.exposureMultiplier);
  const placeExposureMultiplier = resolvePlaceExposureMultiplier(placeProfile);
  const activityExposureProfile = resolveActivityExposureProfile(context?.thermalActivity, exposureDefs);
  const thermalEnvOverride = context?.thermalEnvOverride || null;
  const exposureOnly = context?.exposureOnly === true || context?.flags?.exposureOnly === true;
  const lockedWetnessCandidate = Number(context?.lockedWetness);
  const wetnessLocked = context?.wetnessLocked === true
    || context?.flags?.wetnessLocked === true
    || Number.isFinite(lockedWetnessCandidate);
  const lockedWetness = clamp(
    Number.isFinite(lockedWetnessCandidate)
      ? lockedWetnessCandidate
      : Number(player?.gear?.thermal?.wetness ?? 0),
    0,
    1
  );
  const inputWarmthRatingRaw = Number(player?.gear?.thermal?.warmthRating);

  // 1) 环境派生：只计算，不写 world
  const overrideEnvTemp = Number(thermalEnvOverride?.tEnvRegionC);
  const tEnvRegionC = Number.isFinite(overrideEnvTemp)
    ? overrideEnvTemp
    : computeEnvTempC(regionCfg, timeView, worldView, tempDefs.envTemp || {});
  const calendarView = getCalendarViewFromTotalMinutes(timeView?.totalMinutes, worldView);
  const tSeasonC = getSeasonTemperatureDelta(regionCfg, calendarView.dayOfYear, worldView?.calendar, tempDefs.envTemp || {});

  // 2) 装备保暖汇总（WarmthRating / windproof / waterproof）
  const warmthProfile = computeWarmthRating(
    player,
    getItemsById(),
    placeProfile,
    coreDefs
  );
  const protectionProfile = computeEquipmentProtectionProfile(
    player?.equipment,
    getItemsById(),
    PLAYER_DEFS.equipmentWeights || {},
    exposureDefs
  );
  const runtimeWarmthRating = Math.max(0.05, Number(player?.gear?.thermal?.warmthRating ?? 0.8));
  const runtimeWindproof = clamp(Number(player?.gear?.thermal?.windproof ?? 0), 0, 1);
  const runtimeWaterproof = clamp(Number(player?.gear?.thermal?.waterproof ?? 0), 0, 1);
  player.gear.thermal.warmthRating = Math.max(Number(warmthProfile.warmthRating || 0), runtimeWarmthRating);
  player.gear.thermal.windproof = clamp(Math.max(warmthProfile.windproof, runtimeWindproof), 0, 1);
  player.gear.thermal.waterproof = clamp(Math.max(warmthProfile.waterproof, runtimeWaterproof), 0, 1);
  player.gear.thermal.insulationEff = protectionProfile.insulationEff;
  player.gear.thermal.windproofEff = protectionProfile.windproofEff;
  player.gear.thermal.protectionScore = protectionProfile.protectionScore;

  // 3) 湿度推进（唯一写入口）
  if (wetnessLocked) {
    player.gear.thermal.wetness = lockedWetness;
  } else {
    player.gear.thermal.wetness = stepWetness(
      player.gear.thermal.wetness,
      worldView,
      regionCfg,
      placeProfile,
      player.gear.thermal,
      wetnessDefs,
      dtHours
    );
  }

  // 4) 风场派生：仅用于体温计算
  const overrideWorldWind = Number(thermalEnvOverride?.worldWindSpeed);
  const worldWind = Number.isFinite(overrideWorldWind)
    ? overrideWorldWind
    : (Number.isFinite(Number(worldView?.windSpeed))
      ? Number(worldView.windSpeed)
      : Number(worldView?.weather?.windSpeed_local ?? 0));
  const isIndoor = String(placeProfile?.space || "outdoor") === "indoor";
  const overrideWindLocal = Number(thermalEnvOverride?.windLocal);
  const windLocal = isIndoor
    ? 0
    : (Number.isFinite(overrideWindLocal)
      ? overrideWindLocal
      : computeLocalWind(worldWind, placeProfile));

  // 5) 局部环境修正（供暖/热源）
  const overrideEnvEff = Number(thermalEnvOverride?.tEnvEffC);
  const tEnvEffC = Number.isFinite(overrideEnvEff)
    ? overrideEnvEff
    : computeEffectiveEnvTempC(tEnvRegionC, placeProfile, tempDefs.envTemp || {});

  // 6) 保暖派生：由 gear.thermal 与风寒共同决定
  const warmthEff = computeEffectiveWarmth(player.gear?.thermal, windLocal, coreDefs);
  const tempBeforeThermal = Number(player?.physio?.temperatureC);
  const hypothermiaBeforeThermal = Number(player?.psycho?.hypothermia);
  let coolingRateMulUsed = null;
  let baseCoolingRateMulUsed = null;
  let shelterMultiplierUsed = null;
  let activityMultiplierUsed = null;
  let sleepTempLossMulUsed = null;
  let coolingPath = "core_step";

  // 7) 饱腹影响体温流失倍率（教案硬规格）
  const thermoLossModifier = computeThermoLossModifierFromSatiety(player?.physio?.satiety ?? 100) * thermoLossProfileModifier;

  // 8) 核心体温推进（只更新 T_core）
  if (!exposureOnly) {
    if (isIndoor && indoorWarmDefs.enabled !== false) {
      const targetConfig = indoorWarmDefs?.targetC;
      const epsilonConfig = indoorWarmDefs?.epsilonC;
      const kOverride = indoorWarmDefs?.kPerHourOverride;
      const fullRecoverHours = indoorWarmDefs?.fullRecoverHours;
      const targetC = Number.isFinite(targetConfig)
        ? Number(targetConfig)
        : Number(coreDefs?.T_core_normal ?? 37);
      const epsilonC = Number.isFinite(epsilonConfig)
        ? Number(epsilonConfig)
        : 0.1;
      const kPerHour = Number.isFinite(kOverride)
        ? Math.max(0, Number(kOverride))
        : computeExpRecoverKPerHour({
          deltaWorstC: Math.abs(targetC - Number(coreDefs?.T_core_min ?? 20)),
          epsilonC,
          hours: Number(fullRecoverHours ?? 4)
        });
      const efficiencyMul = computeIndoorWarmRecoveryEfficiencyMul(player, context, placeProfile, indoorWarmDefs)
        * warmingRateMultiplier;
      const nextTempC = stepTowardTargetExpC({
        tCurrentC: player.physio.temperatureC,
        tTargetC: targetC,
        dtHours,
        kPerHour,
        efficiencyMul,
        minC: Number(coreDefs?.T_core_min ?? 20),
        maxC: Number(coreDefs?.T_core_max ?? 40)
      });
      player.physio.temperatureC = isNearTargetC(nextTempC, targetC, epsilonC)
        ? targetC
        : nextTempC;
    } else {
      if (
        exposureDefs.enabled !== false
        && !isIndoor
        && worldView?.exposureEnabled !== false
        && Number(tEnvEffC) < Number(coreDefs?.T_warm_threshold ?? 15)
      ) {
        const timings = computeExposureDurations(protectionProfile.protectionScore, exposureDefs);
        const coolingProfile = computeCoolingKsFromDurations(timings, tempDefs);
        const rateEnvC = Number(tEnvEffC) + Number(activityExposureProfile.workingHeatOffsetC || 0);
        const baseRateMul = computeExposureCoolingRateMul(rateEnvC, tempDefs);
        baseCoolingRateMulUsed = Number(baseRateMul);
        shelterMultiplierUsed = Number(placeExposureMultiplier);
        activityMultiplierUsed = Number(activityExposureProfile.exposureRateMul || 1);
        sleepTempLossMulUsed = Number.isFinite(sleepTempLossMul) && sleepTempLossMul > 0 ? Number(sleepTempLossMul) : 1;
        const rateMul = clamp(
          (
            baseRateMul
            * placeExposureMultiplier
            * actionExposureMultiplier
            * Number(activityExposureProfile.exposureRateMul || 1)
          ) * (Number.isFinite(sleepTempLossMul) && sleepTempLossMul > 0 ? sleepTempLossMul : 1)
            * thermoLossModifier
            * bodyTemperatureDecayModifier
            * coolingRateMultiplier,
          0,
          1.6
        );
        coolingRateMulUsed = Number(rateMul);
        coolingPath = "exposure_cooling_exp";
        player.physio.temperatureC = stepCoreTempCoolingExp(
          player.physio.temperatureC,
          {
            ...coolingProfile,
            safeKPerHour: coolingProfile.safeKPerHour * rateMul,
            criticalKPerHour: coolingProfile.criticalKPerHour * rateMul
          },
          dtHours
        );
      } else {
        coolingPath = "core_step";
        player.physio.temperatureC = stepCoreTempC(
          player.physio.temperatureC,
          tEnvEffC,
          windLocal,
          warmthEff,
          {
            ...coreDefs,
            thermoLossModifier,
            bodyTemperatureDecayModifier,
            coolingRateMultiplier,
            warmingRateMultiplier,
            sleepTempLossMul
          },
          dtHours
        );
      }
    }
  }

  const isOutdoorExposure = exposureDefs.enabled !== false
    && !isIndoor
    && worldView?.exposureEnabled === true;
  player.psycho.hypothermia = mapCoreTempToHypo100(player.physio.temperatureC, tempDefs);
  player.exposure.hypo100 = player.psycho.hypothermia;
  player.psycho.hypoStage = getHypoStageFromValue(player.psycho.hypothermia);
  const thermalHp = roundTo3(mapCoreTempToHp100(
    player.physio.temperatureC,
    hpStartDropC,
    coreThresholds.deathC
  ));
  if (thermalTrace) {
    thermalTrace.input = {
      mode,
      exposureEnabled: worldView?.exposureEnabled === true,
      placeProfileSpace: String(placeProfile?.space || ""),
      placeProfileExposureLevel: String(placeProfile?.exposureLevel || ""),
      windShelter: Number(placeProfile?.windShelter ?? 0),
      heatSource: Number(placeProfile?.heatSource ?? 0),
      drying: Number(placeProfile?.drying ?? 0),
      exposureMultiplier: Number(actionExposureMultiplier),
      thermalActivity: String(context?.thermalActivity || "idle"),
      tEnvRegionC: Number(tEnvRegionC),
      tEnvEffC: Number(tEnvEffC),
      windLocal: Number(windLocal),
      warmthRating: Number(player?.gear?.thermal?.warmthRating),
      windproof: Number(player?.gear?.thermal?.windproof),
      waterproof: Number(player?.gear?.thermal?.waterproof),
      wetness: Number(player?.gear?.thermal?.wetness),
      sleepTempLossMul: Number.isFinite(Number(sleepTempLossMul)) ? Number(sleepTempLossMul) : null
    };
    thermalTrace.process = {
      tempBefore: Number(tempBeforeThermal),
      effectiveEnvTemp: Number(tEnvEffC),
      coolingRateMul: Number.isFinite(Number(coolingRateMulUsed)) ? Number(coolingRateMulUsed) : null,
      tempAfter: Number(player?.physio?.temperatureC),
      hypothermiaBefore: Number(hypothermiaBeforeThermal),
      hypothermiaAfter: Number(player?.psycho?.hypothermia),
      thermalHp: Number(thermalHp)
    };
    thermalTrace.breakdown = {
      warmth: {
        inputWarmthRating: Number.isFinite(inputWarmthRatingRaw) ? inputWarmthRatingRaw : null,
        aggregatedWarmthRating: Number(warmthProfile?.warmthRating),
        effectiveWarmthRating: Number(warmthEff),
        warmthClampMin: 0.05,
        warmthClampMax: null,
        warmthAfterClamp: null
      },
      coolingRate: {
        path: coolingPath,
        baseCoolingRate: Number.isFinite(Number(baseCoolingRateMulUsed)) ? Number(baseCoolingRateMulUsed) : null,
        exposureMultiplier: Number(actionExposureMultiplier),
        shelterMultiplier: Number.isFinite(Number(shelterMultiplierUsed)) ? Number(shelterMultiplierUsed) : Number(placeExposureMultiplier),
        windShelterContribution: Number(placeProfile?.windShelter ?? 0),
        wetnessContribution: Number(player?.gear?.thermal?.wetness),
        windContribution: Number(windLocal),
        activityContribution: Number.isFinite(Number(activityMultiplierUsed)) ? Number(activityMultiplierUsed) : Number(activityExposureProfile?.exposureRateMul || 1),
        sleepCollapseTempLossMultiplier: Number.isFinite(Number(sleepTempLossMulUsed)) ? Number(sleepTempLossMulUsed) : (Number.isFinite(Number(sleepTempLossMul)) ? Number(sleepTempLossMul) : 1),
        finalCoolingRateMul: Number.isFinite(Number(coolingRateMulUsed)) ? Number(coolingRateMulUsed) : null
      },
      mapping: {
        tempAfter: Number(player?.physio?.temperatureC),
        hypothermiaAfter: Number(player?.psycho?.hypothermia),
        thermalHp: Number(thermalHp),
        hypothermiaMappingSource: "mapCoreTempToHypo100(player.physio.temperatureC, tempDefs)",
        thermalHpMappingSource: "mapCoreTempToHp100(player.physio.temperatureC, hpStartDropC, coreThresholds.deathC)",
        sharedTemperatureInput: true
      }
    };
  }
  recordHpStage("after_thermal_step", {
    temperatureC: Number(player?.physio?.temperatureC),
    hypothermia: Number(player?.psycho?.hypothermia),
    thermalHp
  });
  const hpBeforeComposition = Number(player.psycho.hp);
  player.psycho.hp = roundTo3(thermalHp + hpNonThermalOffset);
  recordHpStage("after_hp_composition", {
    hpBeforeComposition,
    thermalHp,
    hpNonThermalOffset: Number(hpNonThermalOffset),
    hpAfterComposition: Number(player?.psycho?.hp),
    hp: Number(player?.psycho?.hp)
  });
  if (Number(player.psycho.hp) < Number(hpBeforeComposition)) {
    const hpDrop = Number(player.psycho.hp) - Number(hpBeforeComposition);
    player.psycho.hp = roundTo3(Number(hpBeforeComposition) + hpDrop * hpDrainModifier);
  }
  player.exposure.incapacitated = Number(player.physio.temperatureC) <= coreThresholds.incapC;

  // 11. Vitals 最终归一化（含 effectiveMax clamp 与 dead 同步）
  const deadByTemperatureFlag = Number(player.physio.temperatureC) <= coreThresholds.deathC;
  const derivedAfterTick = recomputePlayerVitals(player, {
    ...context,
    hpCliffTraceCollector: hpCliffTrace,
    deadByTemperature: deadByTemperatureFlag
  });
  applyPostTickDebugPlayerStatLocks({
    player,
    derived: derivedAfterTick,
    tempDefs,
    coreThresholds,
    hpStartDropC,
    hpNonThermalOffset,
    hpBeforeComposition,
    hpDrainModifier
  });
  player.exposure.incapacitated = Number(player.physio.temperatureC) <= coreThresholds.incapC;
  player.physio.temperatureC = clamp(
    player.physio.temperatureC,
    coreThresholds.minC,
    coreThresholds.maxC
  );
  player.psycho.hypothermia = clamp(player.psycho.hypothermia, 0, 100);
  player.gear.thermal.wetness = clamp(player.gear.thermal.wetness, 0, 1);
  player.gear.thermal.warmthRating = Math.max(0.05, Number(player.gear.thermal.warmthRating || 0.8));
  normalizePlayerVitals(player, {
    ...context,
    derived: derivedAfterTick,
    deadByTemperature: Number(player.physio.temperatureC) <= coreThresholds.deathC
  });
  if (thermalTrace?.breakdown?.warmth) {
    thermalTrace.breakdown.warmth.warmthAfterClamp = Number(player?.gear?.thermal?.warmthRating);
  }
  recordHpStage("after_recompute_normalize", {
    hp: Number(player?.psycho?.hp),
    stamina: Number(player?.physio?.stamina),
    dead: !!player?.exposure?.dead
  });

  updateAwakeGapByRealTime({
    state: sleepState,
    minutes: tickMinutes,
    mode,
    didAdvanceTime
  });

  // 12. 检查特殊事件：严重事件打断（仅正常睡眠）
  const hpAfter = player.psycho.hp;
  const severeInterruption = isSleepMode && isSevereSleepInterruption({
    before: {
      hp: hpBefore,
      hypoStage: String(player.psycho?.hypoStage || "Safe")
    },
    after: {
      hp: hpAfter,
      hypoStage: String(player.psycho?.hypoStage || "Safe"),
      dead: !!player.exposure?.dead
    },
    context
  });

  if (severeInterruption) {
    sleepState.episodeSleepMin = 0;
    events.push({
      type: "sleep_interrupted",
      reason: "severe_interruption",
      message: "严重风险事件触发，睡眠被强制打断。"
    });
  }

  if (sleepState.awakeGapMin >= 120) {
    sleepState.episodeSleepMin = 0;
  }

  if (mode === "COLLAPSE") {
    const collapseExit = resolveCollapseExit({
      hp: Number(player.psycho.hp),
      stamina: Number(player.physio.stamina)
    });
    if (collapseExit === "WAKE") {
      sleepState.mode = context.isSleeping === true ? "SLEEP" : "REST";
      events.push({
        type: "collapse_recovered",
        reason: "stamina_threshold",
        message: "体能回升至阈值，昏厥结束。"
      });
    } else if (collapseExit === "DEAD") {
      sleepState.mode = "COLLAPSE";
    }
  }

  recordHpStage("after_final_exit_death_resolution", {
    mode: String(player?.meta?.sleepEpisode?.mode || "REST"),
    hp: Number(player?.psycho?.hp),
    stamina: Number(player?.physio?.stamina),
    dead: !!player?.exposure?.dead
  });

  if (hpCliffTrace) {
    const beforeStage = hpCliffTrace.stages.before || {};
    const afterStage = hpCliffTrace.stages.after_final_exit_death_resolution || {};
    const hpBeforeTrace = Number(beforeStage.hp);
    const hpAfterTrace = Number(afterStage.hp);
    const hpDeltaTrace = Number.isFinite(hpBeforeTrace) && Number.isFinite(hpAfterTrace)
      ? hpAfterTrace - hpBeforeTrace
      : null;
    const deadBefore = beforeStage.dead === true;
    const deadAfter = afterStage.dead === true;
    const shouldEmit = (Number.isFinite(hpDeltaTrace) && hpDeltaTrace <= -20) || (!deadBefore && deadAfter);
    if (shouldEmit) {
      console.warn("[HPCliffTracer]", {
        tick: hpCliffTrace.tick,
        hpDelta: hpDeltaTrace,
        firstZeroStage: hpCliffTrace.firstZeroStage,
        stages: hpCliffTrace.stages,
        normalizeHooks: hpCliffTrace.normalizeHooks
      });
    }
  }

  if (thermalTrace) {
    thermalTrace.deadByTemperature = deadByTemperatureFlag;
    const tempBefore = Number(thermalTrace.process?.tempBefore);
    const tempAfter = Number(thermalTrace.process?.tempAfter);
    const tempDrop = Number.isFinite(tempBefore) && Number.isFinite(tempAfter)
      ? tempBefore - tempAfter
      : null;
    const thermalHpNow = Number(thermalTrace.process?.thermalHp);
    const shouldEmitThermal = (Number.isFinite(tempDrop) && tempDrop >= 3)
      || (Number.isFinite(thermalHpNow) && thermalHpNow <= 20)
      || deadByTemperatureFlag;
    if (shouldEmitThermal) {
      console.warn("[ThermalTracer]", {
        tick: thermalTrace.tick,
        thermalInput: thermalTrace.input,
        thermalProcess: thermalTrace.process,
        thermalBreakdown: thermalTrace.breakdown,
        deadByTemperature: thermalTrace.deadByTemperature
      });
    }
  }

  // 13. 重新获取最新派生数据（用于返回）
  const finalDerived = getPlayerDerived(player, context);

  return {
    events,
    derived: finalDerived,
    thermal: {
      tAirC: tEnvRegionC,
      tFeelsLikeC: tEnvEffC,
      tEnvRegionC,
      tEnvEffC,
      tSeasonC,
      windLocal,
      warmthEff,
      wetness: player.gear.thermal.wetness,
      warmthRating: player.gear.thermal.warmthRating,
      insulationEff: player.gear.thermal.insulationEff,
      windproofEff: player.gear.thermal.windproofEff,
      protectionScore: player.gear.thermal.protectionScore,
      thermoLossModifier,
      hypoStage: player.psycho.hypoStage,
      exposure: {
        active: isOutdoorExposure,
        hypo100: player.exposure.hypo100,
        hp: player.psycho.hp,
        incapacitated: player.exposure.incapacitated,
        dead: player.exposure.dead,
        timings: isOutdoorExposure
          ? computeExposureDurations(player.gear.thermal.protectionScore, exposureDefs)
          : null
      }
    }
  };
}

function resolveNowTotalMinutes(context = {}) {
  const fromAfter = Number(context?.timeViewAfter?.totalMinutes);
  if (Number.isFinite(fromAfter)) return Math.max(0, fromAfter);
  const fromView = Number(context?.timeView?.totalMinutes);
  if (Number.isFinite(fromView)) return Math.max(0, fromView);
  const fromRaw = Number(context?.nowTotalMinutes);
  if (Number.isFinite(fromRaw)) return Math.max(0, fromRaw);
  return 0;
}

function isHpCliffTraceEnabled(context = {}) {
  if (context?.debugHpCliffTracer === true) return true;
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(String(window.location?.search || ""));
    if (params.get("debugHpCliff") === "1") return true;
    return window.localStorage?.getItem("cc:debugHpCliff") === "1";
  } catch {
    return false;
  }
}

function isThermalTraceEnabled(context = {}) {
  if (context?.debugThermalTracer === true) return true;
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(String(window.location?.search || ""));
    if (params.get("debugThermal") === "1") return true;
    return window.localStorage?.getItem("cc:debugThermal") === "1";
  } catch {
    return false;
  }
}

function ensureSleepEpisodeState(player, nowTotalMinutes = 0) {
  if (!player.meta || typeof player.meta !== "object") {
    player.meta = {};
  }

  const raw = player.meta.sleepEpisode;
  const safe = raw && typeof raw === "object" ? raw : {};
  const modeRaw = String(safe.mode || "REST").toUpperCase();
  const mode = ["REST", "SLEEP", "COLLAPSE", "MEDICAL"].includes(modeRaw) ? modeRaw : "REST";

  player.meta.sleepEpisode = {
    mode,
    episodeSleepMin: Math.max(0, Number(safe.episodeSleepMin) || 0),
    awakeGapMin: Math.max(0, Number(safe.awakeGapMin) || 0),
    fatigueRecoveredInWindow: Math.max(0, Number(safe.fatigueRecoveredInWindow) || 0),
    fatigueRecoveryWindowStartMin: Math.max(0, Number.isFinite(Number(safe.fatigueRecoveryWindowStartMin))
      ? Number(safe.fatigueRecoveryWindowStartMin)
      : Number(nowTotalMinutes) || 0),
    collapseEpisodeFatigueRecovered: Math.max(0, Number(safe.collapseEpisodeFatigueRecovered) || 0)
  };
  return player.meta.sleepEpisode;
}

function resolveSleepMode({ context = {}, inMedicalRecovery = false, player, sleepState }) {
  if (inMedicalRecovery) return "MEDICAL";

  const stamina = Number(player?.physio?.stamina ?? 0);
  const hp = Number(player?.psycho?.hp ?? 0);
  if (sleepState?.mode === "COLLAPSE") {
    // If a tick starts in COLLAPSE, keep COLLAPSE semantics for the whole tick.
    // Wake-up is resolved only at tick end by resolveCollapseExit().
    if (hp <= 0) return "COLLAPSE";
    return "COLLAPSE";
  }

  if (stamina <= 0) return "COLLAPSE";
  if (context?.isSleeping === true) return "SLEEP";
  return "REST";
}

function computeSleepExposureProfile(player, context = {}) {
  const mode = String(context?.mode || "REST").toUpperCase();
  const thermal = player?.gear?.thermal || {};
  const warmth = clamp(Number(thermal?.warmthRating ?? 0.8), 0.05, 4);
  const wetness = clamp(Number(thermal?.wetness ?? 0), 0, 1);
  const windproof = clamp(Number(thermal?.windproof ?? 0), 0, 1);
  const waterproof = clamp(Number(thermal?.waterproof ?? 0), 0, 1);
  const hp = clamp(Number(player?.psycho?.hp ?? 100), 0, 100);
  const satiety = clamp(Number(player?.physio?.satiety ?? 100), 0, 100);
  const fatigue = clamp(Number(player?.psycho?.fatigue ?? 100), 0, 100);
  const hypoStage = String(player?.psycho?.hypoStage || "Safe");

  const shelter = clamp(Number(context?.placeProfile?.windShelter ?? 0), 0, 1);
  const surface = clamp(Number(context?.placeProfile?.sleepingSurface ?? 0.5), 0, 1);

  let risk = 0;
  risk += wetness * 0.35;
  risk += (1 - windproof) * 0.2;
  risk += (1 - waterproof) * 0.1;
  risk += clamp((1 - warmth / 1.2), 0, 1) * 0.2;
  risk += (hp <= 25 ? 0.2 : hp <= 50 ? 0.1 : 0);
  risk += (satiety <= 25 ? 0.15 : satiety <= 50 ? 0.08 : 0);
  risk += (fatigue <= 25 ? 0.1 : 0);
  risk += (hypoStage === "Severe" ? 0.3 : hypoStage === "Moderate" ? 0.15 : 0);
  risk -= shelter * 0.15;
  risk -= surface * 0.08;
  risk = clamp(risk, 0, 1);

  const tier = risk >= 0.66 ? "HIGH" : risk >= 0.33 ? "MID" : "LOW";
  const settleInMin = tier === "HIGH" ? 24 : tier === "MID" ? 14 : 8;
  const microArousalMinPerHour = tier === "HIGH" ? 24 : tier === "MID" ? 12 : 5;
  const sleepTempLossMul = tier === "HIGH" ? 1.2 : tier === "MID" ? 1.05 : 0.9;
  const sleepSatietyDecayMul = tier === "HIGH" ? 1.15 : tier === "MID" ? 1.0 : 0.88;
  const collapseDepthFactor = mode === "COLLAPSE" ? (tier === "HIGH" ? 0.35 : tier === "MID" ? 0.45 : 0.55) : 1;

  return {
    settleInMin,
    microArousalMinPerHour,
    sleepTempLossMul,
    sleepSatietyDecayMul,
    forcedWakeRiskTier: tier,
    collapseDepthFactor
  };
}

function computeEffectiveSleepMinutes({ minutes, mode, profile, state }) {
  const totalMin = Math.max(0, Number(minutes) || 0);
  if (totalMin <= 0) return 0;
  if (mode !== "SLEEP" && mode !== "COLLAPSE") return 0;

  const settleInMin = Math.max(0, Number(profile?.settleInMin) || 0);
  const microArousalMinPerHour = Math.max(0, Number(profile?.microArousalMinPerHour) || 0);
  const collapseDepthFactor = mode === "COLLAPSE"
    ? clamp(Number(profile?.collapseDepthFactor ?? 0.5), 0.1, 1)
    : 1;

  const episodeSleepMin = Math.max(0, Number(state?.episodeSleepMin) || 0);
  const settleRemaining = Math.max(0, settleInMin - episodeSleepMin);
  const afterSettle = Math.max(0, totalMin - settleRemaining);
  const microLoss = (microArousalMinPerHour / 60) * totalMin;
  const effective = Math.max(0, afterSettle - microLoss) * collapseDepthFactor;
  return roundTo3(effective);
}

function rollFatigueRecoveryWindow(state, nowMin) {
  const now = Math.max(0, Number(nowMin) || 0);
  const start = Math.max(0, Number(state?.fatigueRecoveryWindowStartMin) || 0);
  if (now - start >= 1440) {
    state.fatigueRecoveryWindowStartMin = now;
    state.fatigueRecoveredInWindow = 0;
  }
}

function computeFatigueRecoveryDelta({
  episodeSleepMin,
  effectiveSleepMin,
  fatigueRecoveredInWindow,
  mode,
  sleepRateMul = 1
}) {
  const sleepMin = Math.max(0, Number(effectiveSleepMin) || 0);
  if (sleepMin <= 0) return 0;
  const episodeBefore = Math.max(0, Number(episodeSleepMin) || 0);
  const budgetCap = 14.3;
  const recovered = Math.max(0, Number(fatigueRecoveredInWindow) || 0);
  const budgetRemain = Math.max(0, budgetCap - recovered);
  if (budgetRemain <= 0) return 0;

  const segments = [
    { maxMin: 120, ratePerHour: 3.2 },
    { maxMin: 360, ratePerHour: 2.0 },
    { maxMin: Infinity, ratePerHour: 1.1 }
  ];

  let left = sleepMin;
  let cursor = episodeBefore;
  let total = 0;
  for (const seg of segments) {
    if (left <= 0) break;
    const segLeft = seg.maxMin - cursor;
    if (segLeft <= 0) {
      cursor = seg.maxMin;
      continue;
    }
    const take = Math.min(left, segLeft);
    total += (take / 60) * seg.ratePerHour;
    left -= take;
    cursor += take;
  }

  if (String(mode) === "COLLAPSE") {
    total *= 0.3;
  }

  const rateMul = resolveSleepRateMul({ sleepRateMul });
  total *= rateMul;

  return roundTo3(Math.max(0, Math.min(total, budgetRemain)));
}

function computeStaminaRecoveryDelta({
  currentStamina,
  effectiveStaminaMax,
  effectiveSleepMin,
  mode,
  sleepRateMul = 1
}) {
  const cur = Math.max(0, Number(currentStamina) || 0);
  const maxStamina = Math.max(0, Number(effectiveStaminaMax) || 0);
  const sleepHours = Math.max(0, Number(effectiveSleepMin) || 0) / 60;
  if (sleepHours <= 0 || maxStamina <= 0) return 0;

  const target = String(mode) === "COLLAPSE"
    ? Math.min(maxStamina, 20)
    : maxStamina;
  const gap = Math.max(0, target - cur);
  if (gap <= 0) return 0;

  const k = String(mode) === "COLLAPSE" ? 0.85 : 0.65;
  let delta = gap * (1 - Math.exp(-k * sleepHours));
  delta *= resolveSleepRateMul({ sleepRateMul });
  if (String(mode) === "COLLAPSE" && cur + delta >= target - 0.05) {
    delta = target - cur;
  }
  return roundTo3(Math.max(0, delta));
}

function updateAwakeGapByRealTime({ state, minutes, mode, didAdvanceTime }) {
  if (!state || didAdvanceTime !== true) return;
  const tickMin = Math.max(0, Number(minutes) || 0);
  if (tickMin <= 0) return;
  if (mode === "SLEEP" || mode === "COLLAPSE" || mode === "MEDICAL") return;
  state.awakeGapMin = roundTo3(Math.max(0, Number(state.awakeGapMin) || 0) + tickMin);
}

function isSevereSleepInterruption({ before = {}, after = {}, context = {} }) {
  if (context?.forcedSleepInterrupt === true || context?.dangerBlocker === true) {
    return true;
  }
  const hpBefore = Number(before?.hp);
  const hpAfter = Number(after?.hp);
  if (Number.isFinite(hpBefore) && Number.isFinite(hpAfter) && hpBefore > 25 && hpAfter <= 25) {
    return true;
  }
  const stage = String(after?.hypoStage || "");
  if (stage === "Severe") {
    return true;
  }
  if (after?.dead === true) {
    return true;
  }
  return false;
}

function resolveCollapseExit({ hp, stamina }) {
  if (Number(hp) <= 0) return "DEAD";
  if (Number(stamina) >= 20) return "WAKE";
  return "NONE";
}

function resolveActionExposureMultiplier(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return clamp(n, 0.2, 1.4);
}

function resolvePlaceExposureMultiplier(placeProfile = {}) {
  const n = Number(placeProfile?.exposureRateMultiplier);
  if (!Number.isFinite(n)) return 1;
  return clamp(n, 0.2, 1.4);
}

function resolveActivityExposureProfile(activityRaw, exposureDefs = {}) {
  const activity = String(activityRaw || "idle").trim().toLowerCase();
  const fromDefs = exposureDefs?.activityProfiles || {};
  const presets = {
    idle: {
      workingHeatOffsetC: Number(fromDefs?.idle?.workingHeatOffsetC ?? 0),
      exposureRateMul: Number(fromDefs?.idle?.exposureRateMul ?? 1)
    },
    transit: {
      workingHeatOffsetC: Number(fromDefs?.transit?.workingHeatOffsetC ?? 1.6),
      exposureRateMul: Number(fromDefs?.transit?.exposureRateMul ?? 0.86)
    },
    light_work: {
      workingHeatOffsetC: Number(fromDefs?.light_work?.workingHeatOffsetC ?? 2.6),
      exposureRateMul: Number(fromDefs?.light_work?.exposureRateMul ?? 0.72)
    }
  };
  const picked = presets[activity] || presets.idle;
  return {
    workingHeatOffsetC: clamp(Number.isFinite(picked.workingHeatOffsetC) ? picked.workingHeatOffsetC : 0, 0, 3.5),
    exposureRateMul: clamp(Number.isFinite(picked.exposureRateMul) ? picked.exposureRateMul : 1, 0.5, 1.4)
  };
}

export function computeIndoorWarmRecoveryEfficiencyMul(player, context = {}, placeProfile = {}, defs = {}) {
  const baseEfficiencyMul = Math.max(0, Number(defs?.baseEfficiencyMul ?? 1) || 0);
  const heatSourceToEfficiencyMul = Math.max(0, Number(defs?.heatSourceToEfficiencyMul ?? 1) || 0);
  const heatSource = clamp(Number(placeProfile?.heatSource ?? 0) || 0, 0, 1);

  const contextOverride = Number(context?.warmRecoveryEfficiencyMul ?? context?.thermalEnvOverride?.warmRecoveryEfficiencyMul);
  if (Number.isFinite(contextOverride) && contextOverride >= 0) {
    return contextOverride;
  }

  const playerMul = Number(player?.extra?.warmRecoveryEfficiencyMul);
  const externalMul = Number.isFinite(playerMul) && playerMul >= 0 ? playerMul : 1;
  const heatSourceMul = 1 + heatSource * (heatSourceToEfficiencyMul - 1);
  return baseEfficiencyMul * heatSourceMul * externalMul;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * Clamp 值到指定范围
 * @param {number} value - 值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} Clamped 值
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundTo3(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

function resolveDerivedAttrMax(derived, attrKey, fallbackMax = 100) {
  const attrs = derived?.attrs;
  if (!attrs || typeof attrs !== "object") return fallbackMax;
  const attr = attrs[attrKey];
  if (!attr || typeof attr !== "object") return fallbackMax;

  const effectiveMax = Number(attr.effectiveMax);
  if (Number.isFinite(effectiveMax) && effectiveMax > 0) {
    return effectiveMax;
  }

  const baseMax = Number(attr.baseMax);
  if (Number.isFinite(baseMax) && baseMax > 0) {
    return baseMax;
  }

  return fallbackMax;
}

function applyPostTickDebugPlayerStatLocks({
  player,
  derived,
  tempDefs,
  coreThresholds,
  hpStartDropC,
  hpNonThermalOffset,
  hpBeforeComposition,
  hpDrainModifier
} = {}) {
  const report = applyDebugPlayerStatLocks(player, {
    boundsByKey: {
      hp: { min: 0, max: resolveDerivedAttrMax(derived, "hp", 100) },
      satiety: { min: 0, max: resolveDerivedAttrMax(derived, "satiety", 100) },
      stamina: { min: 0, max: resolveDerivedAttrMax(derived, "stamina", 100) },
      fatigue: { min: 0, max: resolveDerivedAttrMax(derived, "fatigue", 100) },
      temperature: {
        min: Number(coreThresholds?.minC ?? tempDefs?.coreTemp?.minC ?? 20),
        max: Number(coreThresholds?.maxC ?? tempDefs?.coreTemp?.maxC ?? 40)
      }
    }
  });

  if (!report.changed) {
    return report;
  }

  if (Object.prototype.hasOwnProperty.call(report.applied, "temperature")) {
    player.psycho.hypothermia = mapCoreTempToHypo100(player.physio.temperatureC, tempDefs);
    player.exposure.hypo100 = player.psycho.hypothermia;
    player.psycho.hypoStage = getHypoStageFromValue(player.psycho.hypothermia);

    if (!Object.prototype.hasOwnProperty.call(report.applied, "hp")) {
      const thermalHp = roundTo3(mapCoreTempToHp100(
        player.physio.temperatureC,
        hpStartDropC,
        coreThresholds?.deathC
      ));
      let nextHp = roundTo3(thermalHp + hpNonThermalOffset);
      if (Number(nextHp) < Number(hpBeforeComposition)) {
        const hpDrop = Number(nextHp) - Number(hpBeforeComposition);
        nextHp = roundTo3(Number(hpBeforeComposition) + hpDrop * hpDrainModifier);
      }
      player.psycho.hp = nextHp;
    }
  }

  return report;
}

export function recomputePlayerVitals(player, context = {}) {
  if (!player || typeof player !== "object") {
    return {
      attrs: {},
      mods: {},
      deltaPerHour: {},
      pending: []
    };
  }

  ensureThermalFields(player);
  normalizePlayerVitals(player);
  const derived = getPlayerDerived(player, context);
  normalizePlayerVitals(player, {
    ...context,
    derived
  });
  return derived;
}

function resolveIntakeLoadBounds() {
  const min = Number(PLAYER_DEFS?.intakeLoad?.min ?? 0);
  const max = Number(PLAYER_DEFS?.intakeLoad?.max ?? 20);
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max > safeMin ? max : 20;
  return { min: safeMin, max: safeMax };
}

export function resolveSatietyIntakeCoeff(satiety) {
  const value = clamp(Number(satiety) || 0, 0, 100);
  if (value < 50) return 1.0;
  if (value < 75) return 0.8;
  if (value < 90) return 0.5;
  return 0.2;
}

export function applyConsumableEffectsToPlayer(player, itemDef = {}) {
  if (!player || typeof player !== "object") {
    return {
      applied: false,
      playerStateChanged: false,
      hp: 0,
      satiety: 0,
      stamina: 0,
      fatigue: 0,
      temperatureC: 0,
      intakeLoad: 0,
      effectiveGain: 0,
      requestedGain: 0,
      intakeLoadCost: 0,
      usedDefaultIntakeLoadCost: false,
      satietyCoeff: 1,
      statusEffectApplied: false,
      statusEffects: createEmptyStatusEffectsState()
    };
  }

  ensureThermalFields(player);
  normalizePlayerVitals(player);
  ensureStatusEffectsState(player);

  const requestedGain = Math.max(0, Number(itemDef?.satietyGain) || 0);
  const satietyMax = Math.max(0, Number(player?.limits?.satietyMax ?? PLAYER_DEFS?.attributes?.satiety?.max ?? 100) || 100);
  const currentSatiety = clamp(Number(player?.physio?.satiety ?? 0), 0, satietyMax || 100);
  const { min: intakeLoadMin, max: intakeLoadMax } = resolveIntakeLoadBounds();
  const currentIntakeLoad = clamp(Number(player?.physio?.intakeLoad ?? 0), intakeLoadMin, intakeLoadMax);
  const satietyCoeff = resolveSatietyIntakeCoeff(currentSatiety);
  const remainingIntakeRoom = Math.max(0, intakeLoadMax - currentIntakeLoad);
  const effectiveGain = requestedGain > 0
    ? Math.min(requestedGain * satietyCoeff, remainingIntakeRoom)
    : 0;

  const rawIntakeLoadCost = Number(itemDef?.intakeLoadCost);
  const usedDefaultIntakeLoadCost = !Number.isFinite(rawIntakeLoadCost);
  const intakeLoadCost = requestedGain > 0
    ? Math.max(0, usedDefaultIntakeLoadCost ? requestedGain : rawIntakeLoadCost)
    : 0;

  if (requestedGain > 0) {
    player.physio.satiety = clamp(currentSatiety + effectiveGain, 0, satietyMax || 100);
    player.physio.intakeLoad = clamp(currentIntakeLoad + intakeLoadCost, intakeLoadMin, intakeLoadMax);
  }

  const immediateDeltaApplied = applyConsumableImmediateDeltasToPlayer(player, itemDef);
  const statusEffectResult = applyConsumableStatusEffects(player, itemDef);
  const nextStatusEffects = ensureStatusEffectsState(player);

  return {
    applied: requestedGain > 0,
    playerStateChanged: requestedGain > 0 || immediateDeltaApplied || statusEffectResult.applied,
    hp: Number(player.psycho.hp),
    satiety: Number(player.physio.satiety),
    stamina: Number(player.physio.stamina),
    fatigue: Number(player.psycho.fatigue),
    temperatureC: Number(player.physio.temperatureC),
    intakeLoad: Number(player.physio.intakeLoad),
    effectiveGain,
    requestedGain,
    intakeLoadCost,
    usedDefaultIntakeLoadCost,
    satietyCoeff,
    remainingIntakeRoom,
    statusEffectApplied: statusEffectResult.applied,
    statusEffects: cloneStatusEffectsState(nextStatusEffects)
  };
}

export function applyFoodIntakeToPlayer(player, food = {}) {
  return applyConsumableEffectsToPlayer(player, food);
}

function applyConsumableImmediateDeltasToPlayer(player, itemDef = {}) {
  const raw = itemDef?.instantDeltas && typeof itemDef.instantDeltas === "object"
    ? itemDef.instantDeltas
    : null;
  const bodyTemperatureDeltaC = Number(itemDef?.bodyTemperatureDeltaC);
  const CONSUMABLE_IMMEDIATE_TEMPERATURE_CAP_C = 37.0;
  if ((!raw || typeof raw !== "object") && (!Number.isFinite(bodyTemperatureDeltaC) || bodyTemperatureDeltaC === 0)) return false;

  let changed = false;
  const hpMax = Math.max(0, Number(player?.limits?.hpMax ?? PLAYER_DEFS?.attributes?.hp?.max ?? 100) || 100);
  const satietyMax = Math.max(0, Number(player?.limits?.satietyMax ?? PLAYER_DEFS?.attributes?.satiety?.max ?? 100) || 100);
  const staminaMax = Math.max(0, Number(player?.limits?.staminaMax ?? PLAYER_DEFS?.attributes?.stamina?.max ?? 100) || 100);
  const fatigueMax = Math.max(0, Number(player?.limits?.fatigueMax ?? PLAYER_DEFS?.attributes?.fatigue?.max ?? 100) || 100);

  const applyBoundedDelta = (key, readCurrent, writeNext, max) => {
    const delta = Number(raw?.[key]);
    if (!Number.isFinite(delta) || delta === 0) return;
    const current = Number(readCurrent());
    const next = clamp(current + delta, 0, max);
    if (Math.abs(next - current) > 0.0001) {
      writeNext(next);
      changed = true;
    }
  };

  applyBoundedDelta("hp", () => player.psycho.hp, (next) => { player.psycho.hp = next; }, hpMax);
  applyBoundedDelta("satiety", () => player.physio.satiety, (next) => { player.physio.satiety = next; }, satietyMax);
  applyBoundedDelta("stamina", () => player.physio.stamina, (next) => { player.physio.stamina = next; }, staminaMax);
  applyBoundedDelta("fatigue", () => player.psycho.fatigue, (next) => { player.psycho.fatigue = next; }, fatigueMax);

  const temperatureDelta = Number.isFinite(bodyTemperatureDeltaC) && bodyTemperatureDeltaC !== 0
    ? bodyTemperatureDeltaC
    : Number(raw?.temperatureC);
  if (Number.isFinite(temperatureDelta) && temperatureDelta !== 0) {
    const current = Number(player?.physio?.temperatureC ?? 37);
    const next = temperatureDelta > 0
      ? Math.min(current + temperatureDelta, CONSUMABLE_IMMEDIATE_TEMPERATURE_CAP_C)
      : clamp(current + temperatureDelta, 20, 40);
    if (Math.abs(next - current) > 0.0001) {
      player.physio.temperatureC = next;
      changed = true;
    }
  }

  return changed;
}

function normalizePlayerVitals(player, context = {}) {
  if (!player || typeof player !== "object") return;

  if (!player.physio || typeof player.physio !== "object") {
    player.physio = {};
  }
  if (!player.psycho || typeof player.psycho !== "object") {
    player.psycho = {};
  }
  if (!player.exposure || typeof player.exposure !== "object") {
    player.exposure = {};
  }

  const satietyRaw = Number(player.physio.satiety);
  const intakeLoadRaw = Number(player.physio.intakeLoad);
  const staminaRaw = Number(player.physio.stamina);
  const hpRaw = Number(player.psycho.hp);
  const fatigueRaw = Number(player.psycho.fatigue);
  const deadBefore = !!player.exposure.dead;
  const { min: intakeLoadMin, max: intakeLoadMax } = resolveIntakeLoadBounds();

  player.physio.satiety = clamp(Number.isFinite(satietyRaw) ? satietyRaw : 100, 0, 100);
  player.physio.intakeLoad = clamp(Number.isFinite(intakeLoadRaw) ? intakeLoadRaw : 0, intakeLoadMin, intakeLoadMax);
  player.physio.stamina = clamp(Number.isFinite(staminaRaw) ? staminaRaw : 100, 0, 100);
  player.psycho.hp = clamp(Number.isFinite(hpRaw) ? hpRaw : 100, 0, 100);
  player.psycho.fatigue = clamp(Number.isFinite(fatigueRaw) ? fatigueRaw : 100, 0, 100);

  const derived = context?.derived;
  if (derived && typeof derived === "object") {
    const hpMax = resolveDerivedAttrMax(derived, "hp", 100);
    const satietyMax = resolveDerivedAttrMax(derived, "satiety", 100);
    const staminaMax = resolveDerivedAttrMax(derived, "stamina", 100);
    const fatigueMax = resolveDerivedAttrMax(derived, "fatigue", 100);

    player.psycho.hp = clamp(player.psycho.hp, 0, hpMax);
    player.physio.satiety = clamp(player.physio.satiety, 0, satietyMax);
    player.physio.stamina = clamp(player.physio.stamina, 0, staminaMax);
    player.psycho.fatigue = clamp(player.psycho.fatigue, 0, fatigueMax);
  }

  const deadByTemperature = context?.deadByTemperature === true;
  player.exposure.dead = !!player.exposure.dead || player.psycho.hp <= 0 || deadByTemperature;

  if (context?.hpCliffTraceCollector && Array.isArray(context.hpCliffTraceCollector.normalizeHooks)) {
    context.hpCliffTraceCollector.normalizeHooks.push({
      hpRaw,
      hpAfterClamp: Number(player.psycho.hp),
      deadBefore,
      deadAfter: !!player.exposure.dead,
      deadByTemperature,
      hasDerived: !!(context?.derived && typeof context.derived === "object")
    });
  }
}

function applyDerivedDeltaPerHour(player, derived, hours, context = {}) {
  const dt = Number(hours);
  if (!Number.isFinite(dt) || dt <= 0) return;

  const delta = derived?.deltaPerHour;
  if (!delta || typeof delta !== "object") return;

  // 最小防护：satiety/stamina/fatigue 的基础推进已在 applyTimeToPlayer 主链处理。
  // 若规则层未来为这些属性配置 deltaPerHour，这里会给出显式告警，避免静默双算。
  if (
    Number.isFinite(Number(delta.satiety)) && Number(delta.satiety) !== 0
    || Number.isFinite(Number(delta.stamina)) && Number(delta.stamina) !== 0
    || Number.isFinite(Number(delta.fatigue)) && Number(delta.fatigue) !== 0
  ) {
    console.warn("[Vitals] deltaPerHour for satiety/stamina/fatigue is set; verify no double-count with base metabolism");
  }

  const hpDelta = Number(delta.hp);
  if (Number.isFinite(hpDelta) && hpDelta !== 0) {
    const hpNaturalPerHour = Math.max(0, Number(derived?.recoveryPerHour?.hpNatural) || 0);
    const hpPassivePerHour = hpDelta - hpNaturalPerHour;
    let hpPassiveApplied = hpPassivePerHour * dt;
    hpPassiveApplied = scaleDrainApplied(hpPassiveApplied, context?.hpDrainMul);
    let hpNaturalApplied = hpNaturalPerHour * dt;
    if (context?.isSleeping === true) {
      const sleepGainMul = Number(context?.sleepGainMul);
      if (Number.isFinite(sleepGainMul) && sleepGainMul > 0) {
        hpNaturalApplied *= sleepGainMul;
      }
    }
    const applied = hpPassiveApplied + hpNaturalApplied;
    player.psycho.hp += applied;
    if (typeof context?.onHpDelta === "function") {
      context.onHpDelta(applied);
    }
  }

  const satietyDelta = Number(delta.satiety);
  if (Number.isFinite(satietyDelta) && satietyDelta !== 0) {
    const applied = scaleDrainApplied(satietyDelta * dt, context?.satietyDecayMul);
    player.physio.satiety += applied;
  }

  const staminaDelta = Number(delta.stamina);
  if (Number.isFinite(staminaDelta) && staminaDelta !== 0) {
    const applied = scaleDrainApplied(staminaDelta * dt, context?.staminaDecayMul);
    player.physio.stamina += applied;
  }

  const fatigueDelta = Number(delta.fatigue);
  if (Number.isFinite(fatigueDelta) && fatigueDelta !== 0) {
    player.psycho.fatigue += fatigueDelta * dt;
  }
}

function resolveSleepRateMul(context = {}) {
  const n = Number(context?.sleepRateMul);
  if (!Number.isFinite(n)) return 1;
  return clamp(n, 0, 2);
}

function resolveSleepGainMul(derived, context = {}) {
  if (context?.isSleeping !== true) return 1;
  const n = Number(derived?.mods?.sleepGainMul);
  const base = !Number.isFinite(n) || n <= 0 ? 1 : n;
  return base * resolveSleepRateMul(context);
}

function ensureThermalFields(player) {
  if (!player.physio || typeof player.physio !== "object") {
    player.physio = {};
  }
  if (!Number.isFinite(Number(player.physio.temperatureC))) {
    player.physio.temperatureC = 37;
  }

  if (!player.psycho || typeof player.psycho !== "object") {
    player.psycho = {};
  }
  if (!Number.isFinite(Number(player.psycho.hypothermia))) {
    player.psycho.hypothermia = 100;
  }
  if (typeof player.psycho.hypoStage !== "string" || player.psycho.hypoStage.trim() === "") {
    player.psycho.hypoStage = "Safe";
  }

  if (!player.gear || typeof player.gear !== "object") {
    player.gear = {};
  }
  if (!player.gear.thermal || typeof player.gear.thermal !== "object") {
    player.gear.thermal = {};
  }
  if (!Number.isFinite(Number(player.gear.thermal.warmthRating))) {
    player.gear.thermal.warmthRating = 0.8;
  }
  if (!Number.isFinite(Number(player.gear.thermal.wetness))) {
    player.gear.thermal.wetness = 0;
  }
  if (!Number.isFinite(Number(player.gear.thermal.windproof))) {
    player.gear.thermal.windproof = 0;
  }
  if (!Number.isFinite(Number(player.gear.thermal.waterproof))) {
    player.gear.thermal.waterproof = 0;
  }
  if (!Number.isFinite(Number(player.gear.thermal.insulationEff))) {
    player.gear.thermal.insulationEff = 0;
  }
  if (!Number.isFinite(Number(player.gear.thermal.windproofEff))) {
    player.gear.thermal.windproofEff = 0;
  }
  if (!Number.isFinite(Number(player.gear.thermal.protectionScore))) {
    player.gear.thermal.protectionScore = 0;
  }
  player.gear.thermal.wetness = clamp(player.gear.thermal.wetness, 0, 1);

  if (!player.exposure || typeof player.exposure !== "object") {
    player.exposure = {};
  }
  if (!Number.isFinite(Number(player.exposure.hypo100))) {
    player.exposure.hypo100 = 100;
  }
  player.exposure.hypo100 = clamp(player.exposure.hypo100, 0, 100);
  if (!player.exposure.incapacitated && player.exposure.hypo100 <= 0) {
    player.exposure.hypo100 = 100;
  }
  player.exposure.incapacitated = !!player.exposure.incapacitated || player.exposure.hypo100 <= 0;
  player.exposure.dead = !!player.exposure.dead || Number(player.psycho?.hp ?? 0) <= 0;
}

function resolveCoreThresholds(tempDefs = {}) {
  const core = tempDefs?.core || {};
  const legacy = tempDefs?.coreTemp || {};
  const normalC = Number(core?.normalC ?? legacy?.T_core_normal ?? 37);
  return {
    normalC,
    incapC: Number(core?.incapC ?? 35),
    deathC: Number(core?.deathC ?? 28),
    minC: Number(core?.minC ?? legacy?.T_core_min ?? 20),
    maxC: Number(core?.maxC ?? legacy?.T_core_max ?? 40),
    hpStartDropC: Number(core?.hpStartDropC ?? normalC)
  };
}

function getHypoStageFromValue(hypo100) {
  const value = clamp(Number(hypo100 ?? 100), 0, 100);
  if (value > 75) return "Safe";
  if (value > 50) return "Mild";
  if (value > 25) return "Moderate";
  return "Severe";
}

function normalizeProfileDisplayLevel(levelLabel) {
  if (String(levelLabel || "").toUpperCase() === "EX") return 5;
  const n = Number(levelLabel);
  if (!Number.isFinite(n)) return 0;
  return clamp(Math.trunc(n), 0, 5);
}

function applyProfileModifierRow(mods, row) {
  if (!mods || typeof mods !== "object") return;
  if (!row || typeof row !== "object") return;
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "boolean") {
      mods[key] = key in mods ? Boolean(mods[key]) && value : value;
      continue;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    mods[key] = Number.isFinite(Number(mods[key])) ? Number(mods[key]) * n : n;
  }
}

function resolvePositiveModifier(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function scaleDrainApplied(appliedDelta, drainModifier) {
  const delta = Number(appliedDelta);
  if (!Number.isFinite(delta)) return 0;
  if (delta >= 0) return delta;
  const mul = resolvePositiveModifier(drainModifier, 1);
  return delta * mul;
}
