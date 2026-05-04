// ============================================================================
// 时间段（TimePhase / DayNightPhase）判定与数据契约（纯函数，无状态）
// ============================================================================

/**
 * 六个时间段（TimePhase）
 * 采用左闭右开区间 [start, end)
 * minuteOfDay ∈ [0, 1439]
 */
export const TimePhase = Object.freeze({
  Dawn: "Dawn",           // 凌晨 [0, 360)
  Morning: "Morning",     // 上午 [360, 660)
  Noon: "Noon",           // 正午 [660, 840)
  Afternoon: "Afternoon", // 下午 [840, 1080)
  Evening: "Evening",     // 傍晚 [1080, 1260)
  Midnight: "Midnight"    // 午夜 [1260, 1440)
});

/**
 * 兼容字段：旧的“白天/夜晚”二段语义。
 *
 * @deprecated
 * DayNightPhase 只保留给旧地图 / 旧样式 / 旧协议桥接。
 * 新代码不得再把它当作自然光真值；自然光由 illumination.js 推导，
 * 制度班次由 ServiceBand 承担。
 */
export const DayNightPhase = Object.freeze({
  Day: "Day",     // 白天 [360, 1080)
  Night: "Night"  // 夜晚 [1080, 1440) ∪ [0, 360)
});

/**
 * 制度班次（ServiceBand）
 * 只表达窗口 / 受理 / 排班等制度语义，不表达自然光。
 */
export const ServiceBand = Object.freeze({
  DayService: "day_service",
  NightService: "night_service"
});

const TIME_PHASE_LABELS_ZH = Object.freeze({
  [TimePhase.Dawn]: "凌晨",
  [TimePhase.Morning]: "上午",
  [TimePhase.Noon]: "正午",
  [TimePhase.Afternoon]: "下午",
  [TimePhase.Evening]: "傍晚",
  [TimePhase.Midnight]: "午夜"
});

const DAY_NIGHT_LABELS_ZH = Object.freeze({
  [DayNightPhase.Day]: "白天",
  [DayNightPhase.Night]: "夜晚"
});

const SERVICE_BAND_LABELS_ZH = Object.freeze({
  [ServiceBand.DayService]: "白班",
  [ServiceBand.NightService]: "夜班"
});

export function GetTimePhaseLabel(phase) {
  return TIME_PHASE_LABELS_ZH[phase] ?? String(phase ?? "");
}

export function GetDayNightLabel(dn) {
  return DAY_NIGHT_LABELS_ZH[dn] ?? String(dn ?? "");
}

export function GetServiceBandLabel(serviceBand) {
  return SERVICE_BAND_LABELS_ZH[serviceBand] ?? String(serviceBand ?? "");
}

function normalizeMinuteOfDay(minuteOfDay) {
  const m = Math.trunc(minuteOfDay);
  if (!Number.isFinite(m)) return 0;
  // 规范到 [0, 1439]
  return ((m % 1440) + 1440) % 1440;
}

/**
 * @param {number} minuteOfDay - 当天 00:00 起算分钟数
 * @returns {string} TimePhase
 */
export function GetTimePhase(minuteOfDay) {
  const m = normalizeMinuteOfDay(minuteOfDay);
  if (m < 360) return TimePhase.Dawn;
  if (m < 660) return TimePhase.Morning;
  if (m < 840) return TimePhase.Noon;
  if (m < 1080) return TimePhase.Afternoon;
  if (m < 1260) return TimePhase.Evening;
  return TimePhase.Midnight;
}

/**
 * @param {number} minuteOfDay
 * @returns {string} DayNightPhase
 *
 * @deprecated
 * 仅用于 legacy bridge。自然光请改用 illumination.js，制度班次请改用 GetServiceBand()。
 */
export function GetDayNightPhase(minuteOfDay) {
  const m = normalizeMinuteOfDay(minuteOfDay);
  return (m >= 360 && m < 1080) ? DayNightPhase.Day : DayNightPhase.Night;
}

/**
 * @param {number} minuteOfDay
 * @returns {string} ServiceBand
 */
export function GetServiceBand(minuteOfDay) {
  const m = normalizeMinuteOfDay(minuteOfDay);
  return (m >= 360 && m < 1080) ? ServiceBand.DayService : ServiceBand.NightService;
}

const PHASE_BOUNDARIES = Object.freeze([0, 360, 660, 840, 1080, 1260, 1440]);

/**
 * 返回下一个“六段时间段”切换点的 minuteOfDay（可能返回 1440 表示 24:00）
 * @param {number} minuteOfDay
 * @returns {number}
 */
export function GetNextPhaseChangeMinute(minuteOfDay) {
  const m = normalizeMinuteOfDay(minuteOfDay);
  for (const boundary of PHASE_BOUNDARIES) {
    if (boundary > m) return boundary;
  }
  return 1440;
}

/**
 * 返回下一个“白天/夜晚”切换点的 minuteOfDay（可能返回 1440 表示 24:00）
 * @param {number} minuteOfDay
 * @returns {number}
 */
export function GetNextDayNightChangeMinute(minuteOfDay) {
  const m = normalizeMinuteOfDay(minuteOfDay);
  // 白天 [360, 1080)
  if (m >= 360 && m < 1080) return 1080;
  // 夜晚：两段
  if (m < 360) return 360;
  return 1440;
}

// ============================================================================
// TimeCondition（数据契约，供未来事件系统挂接）
// ============================================================================

export const TimeConditionKind = Object.freeze({
  AtMinute: "AtMinute",
  InPhase: "InPhase",
  InDayNight: "InDayNight",
  InServiceBand: "InServiceBand"
});

export const TimeCondition = Object.freeze({
  /** @param {number} minute */
  AtMinute(minute) {
    return {
      kind: TimeConditionKind.AtMinute,
      minute: Math.trunc(minute)
    };
  },
  /** @param {string} phase */
  InPhase(phase) {
    return {
      kind: TimeConditionKind.InPhase,
      phase
    };
  },
  /** @param {string} dn */
  InDayNight(dn) {
    return {
      kind: TimeConditionKind.InDayNight,
      dayNight: dn
    };
  },
  /** @param {string} serviceBand */
  InServiceBand(serviceBand) {
    return {
      kind: TimeConditionKind.InServiceBand,
      serviceBand
    };
  }
});
