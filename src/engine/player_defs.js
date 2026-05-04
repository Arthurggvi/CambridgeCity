// ============================================================================
// 玩家属性数据定义（纯数据驱动）
// ============================================================================
// 设计原则：
// 1. 所有数值、阈值、文案都从用户需求文档逐字抄录，不自行修改
// 2. 使用声明式对象描述规则，逻辑代码只负责解释这些定义
// 3. 预留扩展槽：允许引用未实现的属性（mood/temp），但不报错
// ============================================================================

/**
 * 玩家属性完整定义
 * 包含：4个核心属性的阶段划分、修正效果、持续变化规则
 */
export const PLAYER_DEFS = {
  // ==========================================================================
  // 核心属性定义
  // ==========================================================================
  attributes: {
    // ------------------------------------------------------------------------
    // HP (健康) - 唯一决定玩家生死的变量
    // ------------------------------------------------------------------------
    hp: {
      id: "hp",
      displayName: "健康",
      min: 0,
      max: 100,
      // 阶段定义（从高到低）
      stages: [
        {
          // 100-75
          min: 75,
          max: 100,
          name: "活力四射",
          desc: "我的身体机能一切良好。",
          mods: {
            workEffMul: 1.05,      // 工作效率+5%
            moveEffMul: 1.05,      // 行进效率+5%
            restEffMul: 1.05,      // 休息效率+5%
            sleepEffMul: 1.05      // 睡眠效率+5%
          },
          deltaPerHour: {}
        },
        {
          // 75-50
          min: 50,
          max: 75,
          name: "略有不适",
          desc: "哪里都不算太痛，只是感觉力气在从我的指尖溜走。",
          mods: {
            restEffMul: 0.95       // 休息效率-5%
          },
          deltaPerHour: {}
        },
        {
          // 50-25
          min: 25,
          max: 50,
          name: "身心憔悴",
          desc: "情况在恶化，这副躯体比我想象的还要重。",
          mods: {
            workEffMul: 0.90,      // 工作效率-10%
            moveEffMul: 0.90,      // 行进效率-10%
            restEffMul: 0.90,      // 休息效率-10%
            sleepEffMul: 0.90      // 睡眠效率-10%
          },
          deltaPerHour: {
            hp: -0.5               // 每小时-0.5 HP
          }
        },
        {
          // 25-0
          min: 0,
          max: 25,
          name: "奄奄一息",
          desc: "冷风撕裂我的肺，我却很难感受到我的脚。我要回归凛冬了吗？",
          mods: {
            workEffMul: 0.70,      // 工作效率-30%
            moveEffMul: 0.70,      // 行进效率-30%
            restEffMul: 0.70,      // 休息效率-30%
            sleepEffMul: 0.70      // 睡眠效率-30%
          },
          deltaPerHour: {
            hp: -1.0               // 每小时-1 HP
          },
          specialRules: {
            sleepInterrupt: true   // 若在睡眠中进入此阶段会强制性打断睡眠
          }
        }
      ]
    },

    // ------------------------------------------------------------------------
    // Satiety (饱腹) - 全游戏最重要的属性
    // ------------------------------------------------------------------------
    satiety: {
      id: "satiety",
      displayName: "饱腹",
      min: 0,
      max: 100,
      stages: [
        {
          // 100-75
          min: 75,
          max: 100,
          name: "酒足饭饱",
          desc: "胃里沉甸甸的满足感让我感觉温热。",
          mods: {
            workGainMul: 1.08,     // 工作收益+8%
            sleepGainMul: 1.10,    // 睡眠收益+10%
            tempLossMul: 0.90      // 体温流失-10%（未实现，预留）
          },
          deltaPerHour: {}
        },
        {
          // 75-50
          min: 50,
          max: 75,
          name: "轻度饥饿",
          desc: "胃里空了一点，像是被风吹过的地方。舌尖开始想念食物的触感，但身体还肯配合我继续走路。",
          mods: {
            tempLossMul: 1.05      // 体温流失+5%（未实现，预留）
          },
          deltaPerHour: {
            hp: -0.32              // 每小时消耗0.32 HP
          }
        },
        {
          // 50-25
          min: 25,
          max: 50,
          name: "食不果腹",
          desc: "手脚在发抖，冷风灌进空荡荡的胃，大脑止不住地去想，我需要能量。",
          mods: {
            workGainMul: 0.85,     // 工作收益-15%
            sleepGainMul: 0.85,    // 睡眠收益-15%
            tempLossMul: 1.15,     // 体温流失+15%（未实现，预留）
            hpRegenRateMul: 0.80,  // 健康增长速率-20%
            staminaMaxMul: 0.80    // 体能上限-20%
          },
          deltaPerHour: {
            hp: -0.64,             // 每小时消耗0.64 HP
            mood: -0.6             // 每小时消耗0.6心情（未实现，预留）
          }
        },
        {
          // 25-0
          min: 0,
          max: 25,
          name: "饥肠辘辘",
          desc: "热与冷混在一起，从肋骨往外散。意识像被水拖着走，随时可能松手。",
          mods: {
            workGainMul: 0.50,     // 工作收益-50%
            sleepGainMul: 0.35,    // 睡眠收益-65%
            tempLossMul: 1.50,     // 体温流失+50%（未实现，预留）
            hpRegenRateMul: 0.40,  // 健康增长速率-60%
            staminaMaxMul: 0.50    // 体能上限-50%
          },
          deltaPerHour: {
            hp: -0.80,             // 每小时消耗0.80 HP
            mood: -1.0             // 每小时消耗1.0心情（未实现，预留）
          }
        }
      ]
    },

    // ------------------------------------------------------------------------
    // Stamina (体力) - 行动的货币
    // ------------------------------------------------------------------------
    stamina: {
      id: "stamina",
      displayName: "体力",
      min: 0,
      max: 100,
      stages: [
        {
          // 100-75
          min: 75,
          max: 100,
          name: "精力充沛",
          desc: "动作跟得上念头，肌肉回应得干脆。我能把今天的计划全部压上。",
          mods: {},
          deltaPerHour: {}
        },
        {
          // 75-50
          min: 50,
          max: 75,
          name: "略显疲惫",
          desc: "力气开始分层了，明明还能做事，但每个动作都有一点黏滞。",
          mods: {},
          deltaPerHour: {}
        },
        {
          // 50-25
          min: 25,
          max: 50,
          name: "气喘吁吁",
          desc: "呼吸在追身体，动作在追呼吸。再继续下去就不是疲劳，是透支。",
          mods: {},
          deltaPerHour: {}
        },
        {
          // 25-0
          min: 0,
          max: 25,
          name: "精疲力尽",
          desc: "只剩下意志还在支撑我的躯体",
          mods: {},
          deltaPerHour: {}
        }
      ]
    },

    // ------------------------------------------------------------------------
    // Fatigue (睡眠) - 长期管理指标
    // ------------------------------------------------------------------------
    fatigue: {
      id: "fatigue",
      displayName: "睡眠",
      min: 0,
      max: 100,
      stages: [
        {
          // 100-75
          min: 75,
          max: 100,
          name: "睡眠充足",
          desc: "我能清晰地感受到世界的光影。",
          mods: {},
          deltaPerHour: {}
        },
        {
          // 75-50
          min: 50,
          max: 75,
          name: "略有倦怠",
          desc: "犯困像一层灰，落在意识的边缘，还不至于糊住视线，但动作已经慢了半拍。",
          mods: {
            staminaMaxMul: 0.90,   // 体力上限-10%
            workGainMul: 0.90      // 工作收益-10%
          },
          deltaPerHour: {}
        },
        {
          // 50-25
          min: 25,
          max: 50,
          name: "萎靡不振",
          desc: "身体在执行命令，大脑却像隔着冰层看这一切。每一次起身都像在从水里把自己拖出来。",
          mods: {
            staminaMaxMul: 0.70,   // 体力上限-30%
            workGainMul: 0.70      // 工作收益-30%
          },
          deltaPerHour: {}
        },
        {
          // 25-0
          min: 0,
          max: 25,
          name: "昏昏欲睡",
          desc: "世界开始断断续续，声音和画面像被风撕碎。我知道我还活着，但这副躯壳只剩下惰性在往前滑。",
          mods: {
            staminaMaxMul: 0.50,   // 体力上限-50%
            workGainMul: 0.50      // 工作收益-50%
          },
          deltaPerHour: {}
        }
      ]
    }
  },

  intakeLoad: {
    id: "intakeLoad",
    displayName: "进食上限",
    min: 0,
    max: 20,
    decayPerHour: 1.2
  },

  // ==========================================================================
  // 基础代谢速率（从用户需求文档抄录）
  // ==========================================================================
  baseMetabolism: {
    // 饱腹度衰减速率
    satietyDecayAwakePerHour: 1.12,    // 非睡眠状态
    satietyDecaySleepPerHour: 0.89,    // 睡眠状态

    // 睡眠度衰减速率
    fatigueDecayAwakePerHour: 0.6,     // 非睡眠状态
    // TODO: 睡眠状态下的 fatigue 恢复速率未给出，暂不实现

    // 体力恢复速率
    // TODO: 用户文档提到"饱腹>75时恢复速率为1h/Sta"，但表述不清晰
    // 暂时理解为：饱腹>75时，每小时恢复1点体力（待确认）
    staminaRegenPerHourWhenSatiated: 1.0,  // 饱腹>75时，每小时恢复1点体力
    staminaRegenSatietyThreshold: 75       // 饱腹阈值
  },

  // ========================================================================
  // 九槽位装备权重（sum=1）
  // ------------------------------------------------------------------------
  // 外界暴露模式使用：
  // - insulationEff：阻热叠加
  // - windproofEff：漏风 power mean（p>1 会放大弱点拖累）
  // - protectionScore：0.55*I_eff + 0.45*W_eff
  // ========================================================================
  equipmentWeights: {
    upper: 0.28,
    lining: 0.17,
    lower: 0.15,
    shoes: 0.10,
    hands: 0.08,
    head: 0.08,
    neck: 0.05,
    goggles: 0.02,
    backpack: 0.07
  },

  // ==========================================================================
  // 温度系统参数（L1/L2/L3）
  // --------------------------------------------------------------------------
  // L1: 核心体温（Temperature / T_core）
  // L2: 失温条（Hypothermia）
  // L3: 派生修正（如保暖折损、风寒修正等）
  // ==========================================================================
  temperature: {
    // ----------------------------------------------------------------------
    // Baseline tuned against TEMP_SMOKE
    // - Scenario: West2 / Day1 12:00 / Open / wind=12 / sun=58 / snow=0.9
    // - Smoke summary baseline:
    //   [TEMP_SMOKE_SUMMARY] Day 1 12:00 | region=West2 | map=test_temp | pass=5 | fail=0
    // - Current cooling baseline:
    //   k_temp = 0.0871
    // 说明：
    // 1) 这是“当前可通过冒烟且速率护栏不过线”的参数基线。
    // 2) 后续如果调 WindPenalty / WetPenalty / V_ref / tauHours，
    //    请优先对照这组基线重新跑 TEMP_SMOKE，避免回归破坏链路单调性。
    // ----------------------------------------------------------------------

    // 环境温度公式中的相位参数：D(t)=cos(2π/24*(t-phi))
    envTemp: {
      phi: 15,
      // 室内供暖修正（量级偏大，确保在极寒地区室内可跨越 15℃回暖阈值）
      indoorHeatBoostC: 52,
      // 封闭环境必回温下限：覆盖 0~15℃ 的教案死区体验。
      // 由于 stepCoreTempC 的回暖判定是 env > T_warm_threshold，默认值需严格高于 15。
      indoorMinWarmC: 16,
      // 室外热源修正（量级较小，代表篝火/临时热源）
      outdoorHeatBoostC: 10
    },

    core: {
      normalC: 37,
      incapC: 35,
      deathC: 28,
      minC: 20,
      maxC: 40,
      // HP 仅由核心体温派生；体温 >= 该阈值时 HP 恒为满值。
      // incapC/deathC 仍仅作为失能/死亡游戏判定阈值使用。
      hpStartDropC: 32
    },

    // 外界暴露冷却倍率。
    // 说明：
    // - 锚点 3/12、90/120、540/720 以 refTempC 这组基准外界条件验收。
    // - incapC/deathC 是“游戏判定阈值”，不强行等同生理学绝对阈值。
    // - 当前环境越接近 warmThresholdC，外界暴露冷却越慢；达到/高于该温度时停止暴露冷却。
    exposureCooling: {
      warmThresholdC: 15,
      refTempC: -13.974,
      coldPower: 3
    },

    // 核心体温推进参数
    coreTemp: {
      // 生理硬边界：避免数值越界导致后续系统崩溃
      T_core_min: 20,
      T_core_max: 40,
      T_core_normal: 37,

      // 环境阈值：低于冷阈触发冷却，高于暖阈触发回暖
      T_cold_threshold: 0,
      T_warm_threshold: 15,

      // 风寒与保暖的归一化参数
      V_ref: 12,
      WetPenalty: 0.45,
      WindPenalty: 0.25,
      WarmthFloor: 0.20,
      baseNakedWarmth: 0.5,
      warmthMinClamp: 0.2,
      shelterWarmthBonus: {
        Sheltered: 0.25,
        SemiSheltered: 0.12,
        Open: 0,
        Ridge: 0
      },

      // 动力学速率（单位：1/h）
      k_temp: 0.0871,
      k_warm: 0.11
    },

    // 室内回暖：指数收敛到常温。
    // 设计目标：从 T_core_min 出发，在 fullRecoverHours 内进入 target±epsilon 带。
    indoorWarm: {
      enabled: true,
      targetC: 37,
      epsilonC: 0.1,
      fullRecoverHours: 4,
      kPerHourOverride: null,
      baseEfficiencyMul: 1,
      heatSourceToEfficiencyMul: 1.5
    },

    // 失温条（0..100，100安全）
    hypothermia: {
      // 一阶滞后时间常数：越大代表失温条响应越“慢”
      tauHours: 0.5,

      // 分段线性映射：核心体温 -> 目标失温值
      map: {
        segments: [
          // 正常体温以上，失温维持安全
          { tMin: 36.5, tMax: 40.0, yAtMin: 100, yAtMax: 100 },
          // 轻度降温区：100 -> 75
          { tMin: 35.5, tMax: 36.5, yAtMin: 75, yAtMax: 100 },
          // 中度降温区：75 -> 45
          { tMin: 34.0, tMax: 35.5, yAtMin: 45, yAtMax: 75 },
          // 危险区：45 -> 10（F 固定 10）
          { tMin: 20.0, tMax: 34.0, yAtMin: 10, yAtMax: 45 }
        ]
      }
    },

    // 最小玩法出口：失温阶段对 HP 的持续影响（每小时）
    // 已弃用：HP 现在仅由核心体温映射，不再按阶段追加线性扣血。
    effects: {
      hpDrainPerHourByHypoStage: {
        Safe: 0,
        Mild: 0,
        Moderate: 0,
        Severe: 0
      }
    },

    // 外界暴露模式：分钟级锚点（outdoor 时优先）
    exposureModel: {
      enabled: true,
      baseIncapMin: 3,
      baseDeathMin: 12,
      pWeightInsulation: 0.55,
      pWeightWindproof: 0.45,
      windLeakPower: 1.6,
      // 由锚点反解：无防护 3/12，一类中位数 90/120，二类中位数 540/720
      incapCurveA: 6.23042,
      incapCurveB: 0.949914,
      deathCurveA: 5.245347,
      deathCurveB: 1.292008
    }
  },

  // ========================================================================
  // 湿度系统参数（服务温度链路输入）
  // ========================================================================
  wetness: {
    snowGainPerHour: 0.62,
    moistGainPerHour: 0.06,
    windGainPerHour: 0.2,
    baseDryPerHour: 0.05,
    dryingPerHour: 0.22,
    heatDryPerHour: 0.28,
    indoorDryMultiplier: 1.35,
    windRefForWetness: 12
  },

  // ==========================================================================
  // 特殊规则配置
  // ==========================================================================
  specialRules: {
    // HP 自然回复规则
    // 当 hp ∈ (50, 100] 且 satiety>75 且 fatigue>75 且 mood>75 时，每小时+1 HP
    hpRegenRule: {
      enabled: true,
      conditions: {
        hpMin: 50,           // hp > 50
        hpMax: 100,          // hp <= 100
        satietyMin: 75,      // satiety > 75
        fatigueMin: 75,      // fatigue > 75
        moodMin: 75          // mood > 75（未实现，会进入 pending）
      },
      effect: {
        hp: 1.0              // 每小时+1 HP
      }
    }
  },

  // ========================================================================
  // Profile 属性收益映射（规则层，L3 派生）
  // ------------------------------------------------------------------------
  // 约束：
  // - EX 统一按 level=5 使用，不再单独枚举分支。
  // - 理性/信仰沿用 worldview 双向轴（-100..100），按现有分段映射等级。
  // - 本表只产出修正，不直接写回玩家真值。
  // ========================================================================
  profileModifiers: {
    // 体能（physique）：影响体能/饱腹/健康衰减速率
    staminaLevelModifiers: {
      0: { staminaDecayModifier: 1.05 },
      1: { staminaDecayModifier: 0.98 },
      2: { staminaDecayModifier: 0.92 },
      3: { staminaDecayModifier: 0.85, satietyDecayModifier: 0.97 },
      4: { staminaDecayModifier: 0.80, satietyDecayModifier: 0.92, hpDrainModifier: 0.95 },
      5: { staminaDecayModifier: 0.70, satietyDecayModifier: 0.88, hpDrainModifier: 0.90 }
    },

    // 阅历（experience）：影响谈判修正、特殊消耗修正、谈判习得门禁
    experienceLevelModifiers: {
      0: { canLearnNegotiationEvents: false, negotiationSkillModifier: 1.00, specialCostModifier: 1.00 },
      1: { canLearnNegotiationEvents: true, negotiationSkillModifier: 1.08, specialCostModifier: 1.00 },
      2: { canLearnNegotiationEvents: true, negotiationSkillModifier: 1.15, specialCostModifier: 1.00 },
      3: { canLearnNegotiationEvents: true, negotiationSkillModifier: 1.30, specialCostModifier: 0.92 },
      4: { canLearnNegotiationEvents: true, negotiationSkillModifier: 1.50, specialCostModifier: 0.85 },
      5: { canLearnNegotiationEvents: true, negotiationSkillModifier: 1.75, specialCostModifier: 0.70 }
    },

    // 理性/信仰共享收益表：方向不同，收益相同
    rationalFaithSharedModifiers: {
      0: { thermoLossModifier: 1.00, hpDrainModifier: 1.00 },
      1: { thermoLossModifier: 0.98, hpDrainModifier: 1.00 },
      2: { thermoLossModifier: 0.95, hpDrainModifier: 1.00 },
      3: { thermoLossModifier: 0.92, hpDrainModifier: 0.95 },
      4: { thermoLossModifier: 0.90, hpDrainModifier: 0.90 },
      5: { thermoLossModifier: 0.88, hpDrainModifier: 0.88 }
    }
  }
};

// ==========================================================================
// 导出辅助函数（可选）
// ==========================================================================

/**
 * 获取属性的阶段定义（根据当前值）
 * @param {string} attrId - 属性ID（hp/satiety/stamina/fatigue）
 * @param {number} value - 当前值
 * @returns {object|null} 阶段定义对象
 */
export function getStageForValue(attrId, value) {
  const attrDef = PLAYER_DEFS.attributes[attrId];
  if (!attrDef) return null;

  // 从高到低遍历阶段，找到第一个匹配的
  for (const stage of attrDef.stages) {
    if (value >= stage.min && value <= stage.max) {
      return stage;
    }
  }

  return null;
}
