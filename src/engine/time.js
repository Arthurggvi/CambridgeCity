// ============================================================================
// 时间系统核心模块
// ============================================================================
// 设计契约：
// 1. 唯一真值：gameState.time.totalMinutes（整数分钟，>=0）
// 2. 所有时间视图（day/hour/minute）都是从 totalMinutes 派生，不单独存储
// 3. 唯一推进入口：advanceTimeMinutes(deltaMinutes, reason?)
// 4. 子步拆分：每次最多推进 10 分钟，确保其他系统可以在小时间步长内响应
// 5. 系统回调接口：为未来的温度/生理/天气系统预留挂载点
// ============================================================================

import { gameState } from "./state.js";
import {
  applySessionStep,
  buildMedicalAdvanceEffects,
  createMedicalAdvanceProjection,
  getMinutesToNextHardStop
} from "./medical_runtime_entry.js";
import {
  getCalendarView as deriveCalendarView,
  getIlluminationCalibrationReport,
  getIlluminationView,
  getSolarView
} from "./illumination.js";
import {
  GetTimePhase,
  GetDayNightPhase,
  GetServiceBand,
  TimePhase,
  DayNightPhase,
  ServiceBand,
  GetTimePhaseLabel,
  GetDayNightLabel,
  GetServiceBandLabel,
  GetNextPhaseChangeMinute,
  GetNextDayNightChangeMinute,
  TimeCondition,
  TimeConditionKind
} from "./time_phases.js";
import {
  applyTimedLocationClosureStep,
  getMinutesToNextTimedLocationClosure,
  triggerTimedLocationClosure
} from "./timed_location_runtime.js";
import {
  applyMargTransitionBlockerStep,
  getMinutesToNextMargTransitionBlocker
} from "./marg_transition_blocker_provider.js";

// ============================================================================
// 时间变化事件（为未来事件系统预留）
// ============================================================================

/** @type {Set<(minuteOfDay: number) => void>} */
export const OnMinuteOfDayChanged = new Set();

/** @type {Set<(oldPhase: string, newPhase: string) => void>} */
export const OnTimePhaseChanged = new Set();

/** @type {Set<(oldDn: string, newDn: string) => void>} */
export const OnDayNightChanged = new Set();

function emitTo(set, ...args) {
  for (const handler of set) {
    try {
      handler(...args);
    } catch (error) {
      console.error("[时间事件] handler 出错：", error);
    }
  }
}

// re-export（让外部只 import ./time.js 也能用）
export {
  TimePhase,
  DayNightPhase,
  ServiceBand,
  GetTimePhaseLabel,
  GetDayNightLabel,
  GetServiceBand,
  GetServiceBandLabel,
  GetTimePhase,
  GetDayNightPhase,
  GetNextPhaseChangeMinute,
  GetNextDayNightChangeMinute,
  TimeCondition,
  TimeConditionKind
};

// ============================================================================
// 常量配置
// ============================================================================

/**
 * 最大单次推进步长（分钟）
 * 为了让其他系统（温度、生理等）能够在较小的时间步长内响应，
 * 任何大于此值的时间推进都会被拆分成多个子步执行
 */
const MAX_STEP_MIN = 10;
const REAR_ZONE_LODGING_CHECKOUT_BLOCKER_ID = "rear_zone_lodging_checkout_0900";
const REAR_ZONE_LODGING_CHECKOUT_DIALOGUE_MAP_ID = "rear_zone_lodging_checkout_0900";
const REAR_ZONE_ROOM_CARD_LABEL = "后区房卡";
const REAR_ZONE_LODGING_CHECKOUT_AT_FLAG = "rear_zone_lodging_checkout_at";
export const STEELCROSS_MARKET_CLOSING_BLOCKER_ID = "steelcross_market_closing_1300";
const STEELCROSS_MARKET_CLOSING_MINUTE_OF_DAY = 13 * 60;
const STEELCROSS_MARKET_RETURN_MAP_ID = "steelcross_port";

let rearZoneLodgingMissingCheckoutAtWarned = false;

function isRearZoneLodgingMapId(mapId) {
  const id = String(mapId || "").trim();
  return id === "heatcorridor_rear_section"
    || id === "rear_zone_dorm_placeholder"
    || id.startsWith("rear_zone_lodging_");
}

export function isSteelcrossMarketFamilyMapId(mapId) {
  const id = String(mapId || "").trim();
  return id.startsWith("steelcross_market_");
}

export function shouldForceExitSteelcrossMarket(state = gameState) {
  const activeMapId = String(state?.currentMapId || state?.world?.currentMapId || state?.currentMap?.id || "").trim();
  if (!isSteelcrossMarketFamilyMapId(activeMapId)) return false;
  const totalMinutes = Number(state?.time?.totalMinutes ?? 0);
  return getTimeView(totalMinutes).minuteOfDay >= STEELCROSS_MARKET_CLOSING_MINUTE_OF_DAY;
}

function hasRearZoneLodgingAccess(state = gameState) {
  return state?.world?.flags?.rear_zone_room_card_owned === true;
}

function getRearZoneLodgingCheckoutAt(state = gameState) {
  const raw = Number(state?.world?.flags?.[REAR_ZONE_LODGING_CHECKOUT_AT_FLAG]);
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, Math.trunc(raw));
}

function maybeWarnRearZoneLodgingMissingCheckoutAt(state = gameState) {
  if (!hasRearZoneLodgingAccess(state)) {
    rearZoneLodgingMissingCheckoutAtWarned = false;
    return;
  }

  if (getRearZoneLodgingCheckoutAt(state) !== null) {
    rearZoneLodgingMissingCheckoutAtWarned = false;
    return;
  }

  if (rearZoneLodgingMissingCheckoutAtWarned) return;
  rearZoneLodgingMissingCheckoutAtWarned = true;
  console.warn("[时间系统] 后区住宿存在房卡标签但缺少 rear_zone_lodging_checkout_at；视为旧脏档，不触发退房 blocker，需下次住宿重新写入。", {
    currentMapId: String(state?.currentMapId || state?.world?.currentMapId || state?.currentMap?.id || ""),
    totalMinutes: Number(state?.time?.totalMinutes ?? 0)
  });
}

function clearRearZoneLodgingAccess(state = gameState) {
  if (!state || typeof state !== "object") return;

  if (state.world && typeof state.world === "object") {
    if (!state.world.flags || typeof state.world.flags !== "object") {
      state.world.flags = {};
    }
    state.world.flags.rear_zone_room_card_owned = false;
    delete state.world.flags[REAR_ZONE_LODGING_CHECKOUT_AT_FLAG];
  }

  const currentUnlockFlags = Array.isArray(state?.player?.profile?.unlocks?.flags)
    ? state.player.profile.unlocks.flags
    : [];
  const nextUnlockFlags = currentUnlockFlags.filter((entry) => String(entry || "").trim() !== REAR_ZONE_ROOM_CARD_LABEL);

  if (!state.player || typeof state.player !== "object") {
    state.player = {};
  }
  if (!state.player.profile || typeof state.player.profile !== "object") {
    state.player.profile = {};
  }
  if (!state.player.profile.unlocks || typeof state.player.profile.unlocks !== "object") {
    state.player.profile.unlocks = {};
  }
  state.player.profile.unlocks.flags = nextUnlockFlags;
  rearZoneLodgingMissingCheckoutAtWarned = false;
}

function buildRearZoneLodgingCheckoutBlocker(atMinutes) {
  return {
    blockerId: REAR_ZONE_LODGING_CHECKOUT_BLOCKER_ID,
    atMinutes,
    event: "rear_zone_lodging_checkout_dialogue",
    hardStop: true,
    locationId: String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || ""),
    targetMapId: REAR_ZONE_LODGING_CHECKOUT_DIALOGUE_MAP_ID
  };
}

function buildSteelcrossMarketClosingBlocker(atMinutes) {
  return {
    blockerId: STEELCROSS_MARKET_CLOSING_BLOCKER_ID,
    atMinutes,
    event: "steelcross_market_closing",
    hardStop: true,
    locationId: String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || ""),
    targetMapId: STEELCROSS_MARKET_RETURN_MAP_ID
  };
}

function getMinutesToRearZoneLodgingCheckout(nowTotalMinutes) {
  if (!hasRearZoneLodgingAccess(gameState)) return Infinity;

  const activeMapId = String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || "").trim();
  if (!isRearZoneLodgingMapId(activeMapId)) return Infinity;

  const checkoutAt = getRearZoneLodgingCheckoutAt(gameState);
  if (checkoutAt === null) {
    maybeWarnRearZoneLodgingMissingCheckoutAt(gameState);
    return Infinity;
  }

  return Math.max(0, checkoutAt - Math.max(0, Math.trunc(Number(nowTotalMinutes ?? 0))));
}

function getMinutesToSteelcrossMarketClosing(nowTotalMinutes) {
  const activeMapId = String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || "").trim();
  if (!isSteelcrossMarketFamilyMapId(activeMapId)) return Infinity;

  const minuteOfDay = getTimeView(nowTotalMinutes).minuteOfDay;
  if (minuteOfDay >= STEELCROSS_MARKET_CLOSING_MINUTE_OF_DAY) return 0;
  return STEELCROSS_MARKET_CLOSING_MINUTE_OF_DAY - minuteOfDay;
}

function triggerRearZoneLodgingCheckout(atMinutes) {
  clearRearZoneLodgingAccess(gameState);
  return buildRearZoneLodgingCheckoutBlocker(atMinutes);
}

function triggerSteelcrossMarketClosing(atMinutes) {
  return buildSteelcrossMarketClosingBlocker(atMinutes);
}

function applyRearZoneLodgingCheckoutStep(stepContext) {
  if (!hasRearZoneLodgingAccess(gameState)) return { hardStopReached: false, blockedBy: null };

  const activeMapId = String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || "").trim();
  if (!isRearZoneLodgingMapId(activeMapId)) return { hardStopReached: false, blockedBy: null };

  const checkoutAt = getRearZoneLodgingCheckoutAt(gameState);
  if (checkoutAt === null) {
    maybeWarnRearZoneLodgingMissingCheckoutAt(gameState);
    return { hardStopReached: false, blockedBy: null };
  }

  const timeBefore = Number(stepContext?.timeBeforeMinutes ?? 0);
  const timeAfter = Number(stepContext?.timeAfterMinutes ?? 0);

  if (timeBefore < checkoutAt && timeAfter < checkoutAt) {
    return { hardStopReached: false, blockedBy: null };
  }

  return {
    hardStopReached: true,
    blockedBy: triggerRearZoneLodgingCheckout(checkoutAt)
  };
}

function applySteelcrossMarketClosingStep(stepContext) {
  const activeMapId = String(gameState.currentMapId || gameState.world?.currentMapId || gameState.currentMap?.id || "").trim();
  if (!isSteelcrossMarketFamilyMapId(activeMapId)) return { hardStopReached: false, blockedBy: null };

  const timeBefore = Number(stepContext?.timeBeforeMinutes ?? 0);
  const timeAfter = Number(stepContext?.timeAfterMinutes ?? 0);
  const minuteOfDayBefore = getTimeView(timeBefore).minuteOfDay;
  const minuteOfDayAfter = getTimeView(timeAfter).minuteOfDay;

  if (
    minuteOfDayBefore < STEELCROSS_MARKET_CLOSING_MINUTE_OF_DAY
    && minuteOfDayAfter < STEELCROSS_MARKET_CLOSING_MINUTE_OF_DAY
  ) {
    return { hardStopReached: false, blockedBy: null };
  }

  const blockerAt = timeAfter - Math.max(0, minuteOfDayAfter - STEELCROSS_MARKET_CLOSING_MINUTE_OF_DAY);
  return {
    hardStopReached: true,
    blockedBy: triggerSteelcrossMarketClosing(blockerAt)
  };
}

// ============================================================================
// 时间系统注册表
// ============================================================================

/**
 * 已注册的时间系统列表
 * 每个系统需实现 onTimeStep(dtHours, context) 方法
 * context 包含：
 *   - timeBeforeMinutes: 推进前的 totalMinutes
 *   - timeAfterMinutes: 推进后的 totalMinutes
 *   - timeViewAfter: 推进后的时间视图 {day, hour, minute, ...}
 *   - dtHours: 本次子步的小时数（stepMin / 60）
 */
const timeSystems = [];

/**
 * 注册一个时间系统
 * @param {object} system - 系统对象，需实现 onTimeStep(dtHours, context)
 */
export function registerTimeSystem(system) {
  if (!system || typeof system.onTimeStep !== "function") {
    console.error("registerTimeSystem: 系统必须实现 onTimeStep 方法");
    return;
  }
  timeSystems.push(system);
  console.log(`[时间系统] 注册系统：`, system.constructor?.name || "匿名系统");
}

// ============================================================================
// 时间视图派生（唯一规范，避免 off-by-one）
// ============================================================================

/**
 * 从 totalMinutes 派生所有时间视图字段
 * @param {number} totalMinutes - 总分钟数（>=0 的整数）
 * @returns {object} 时间视图
 *   - day: Day 数（从 1 开始）
 *   - hour: 小时（0..23）
 *   - minute: 分钟（0..59）
 *   - dayIndex0: Day 的 0-based 索引（内部使用）
 *   - minuteOfDay: 当天的分钟数（0..1439）
 */
export function getTimeView(totalMinutes) {
  // 如果不传参数，从 gameState 读取
  if (totalMinutes === undefined) {
    totalMinutes = gameState.time.totalMinutes;
  }

  // 确保 totalMinutes 是合法整数
  totalMinutes = Math.max(0, Math.trunc(totalMinutes));

  // 计算 Day（从 0 开始的索引）
  const dayIndex0 = Math.floor(totalMinutes / 1440);
  // Day 显示从 1 开始
  const day = dayIndex0 + 1;

  // 计算当天的分钟数（0..1439）
  const minuteOfDay = totalMinutes - dayIndex0 * 1440;

  // 计算小时（0..23）
  const hour = Math.floor(minuteOfDay / 60);

  // 计算分钟（0..59）
  const minute = minuteOfDay - hour * 60;

  return {
    totalMinutes,
    day,
    hour,
    minute,
    dayIndex0,
    minuteOfDay
  };
}

/**
 * 格式化时间为 HH:MM
 * @param {number} hour - 小时（0..23）
 * @param {number} minute - 分钟（0..59）
 * @returns {string} 格式化的时间字符串，例如 "09:05"
 */
export function formatTimeHHMM(hour, minute) {
  const hh = hour.toString().padStart(2, "0");
  const mm = minute.toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * 世界历法派生出口。
 * 只读，不写 state；totalMinutes 仍然是唯一真值。
 */
export function getCalendarView(totalMinutes = gameState.time.totalMinutes, world = gameState.world) {
  return deriveCalendarView(totalMinutes, world);
}

/**
 * 世界时间上下文：统一聚合时钟、历法、制度班次、光照运行态。
 */
export function getWorldTimeContext(totalMinutes = gameState.time.totalMinutes, world = gameState.world) {
  const clock = getTimeView(totalMinutes);
  const calendar = deriveCalendarView(totalMinutes, world);
  const solar = getSolarView(totalMinutes, world);
  const illumination = getIlluminationView(totalMinutes, world);
  return {
    totalMinutes: clock.totalMinutes,
    clock,
    calendar,
    solar,
    illumination,
    timePhase: GetTimePhase(clock.minuteOfDay),
    serviceBand: GetServiceBand(clock.minuteOfDay),
    legacyDayNight: GetDayNightPhase(clock.minuteOfDay)
  };
}

export function publishWorldTimeDebug(totalMinutes = gameState.time.totalMinutes, world = gameState.world) {
  const context = getWorldTimeContext(totalMinutes, world);
  const scope = typeof window !== "undefined" ? window : globalThis;
  if (scope && typeof scope === "object") {
    scope.__WORLD_TIME_CONTEXT__ = {
      totalMinutes: context.totalMinutes,
      year: context.calendar.year,
      month: context.calendar.month,
      day: context.calendar.day,
      dayOfYear: context.calendar.dayOfYear,
      season: context.calendar.season,
      seasonSubphase: context.calendar.seasonSubphase,
      isClosureSeason: context.calendar.isClosureSeason,
      closureSeverity01: context.calendar.closureSeverity01,
      seasonProfile: context.calendar.seasonProfile,
      seasonProgress: context.calendar.seasonProgress,
      solarElevationDeg: context.illumination.solarElevationDeg,
      daylightHours: context.illumination.daylightHours,
      minuteOfDay: context.clock.minuteOfDay,
      timePhase: context.timePhase,
      serviceBand: context.serviceBand,
      lightPhase: context.illumination.lightPhase,
      visibilityBand: context.illumination.visibilityBand,
      Sun: context.illumination.Sun,
      AmbientLight: context.illumination.AmbientLight,
      Visibility: context.illumination.Visibility,
      sunClear: context.illumination.sunClear,
      sun: context.illumination.sun,
      sunLevel: context.illumination.sunLevel,
      isDarkLike: context.illumination.isDarkLike,
      clock: context.clock,
      calendar: context.calendar,
      solar: context.solar,
      illumination: context.illumination
    };
    scope.__ILLUMINATION_TRACE__ = {
      totalMinutes: context.totalMinutes,
      year: context.calendar.year,
      month: context.calendar.month,
      day: context.calendar.day,
      dayOfYear: context.calendar.dayOfYear,
      season: context.calendar.season,
      seasonSubphase: context.calendar.seasonSubphase,
      isClosureSeason: context.calendar.isClosureSeason,
      closureSeverity01: context.calendar.closureSeverity01,
      seasonProfile: context.calendar.seasonProfile,
      seasonProgress: context.calendar.seasonProgress,
      solarElevationDeg: context.illumination.solarElevationDeg,
      daylightHours: context.illumination.daylightHours,
      serviceBand: context.serviceBand,
      Sun: context.illumination.Sun,
      AmbientLight: context.illumination.AmbientLight,
      Visibility: context.illumination.Visibility,
      sunClear: context.illumination.sunClear,
      sun: context.illumination.sun,
      sunLevel: context.illumination.sunLevel,
      lightPhase: context.illumination.lightPhase,
      visibilityBand: context.illumination.visibilityBand,
      isDarkLike: context.illumination.isDarkLike,
      cloudTrans: context.illumination.cloudTrans,
      regionId: context.solar.regionId
    };
    scope.__ILLUMINATION_CALIBRATION__ = getIlluminationCalibrationReport();
  }
  return context;
}

// ============================================================================
// 时间推进核心逻辑（唯一入口）
// ============================================================================

/**
 * 推进时间（唯一入口）
 * @param {number} deltaMinutes - 要推进的分钟数（整数，>=0）
 * @param {string} reason - 推进原因（可选，用于日志/调试）
 */
export function advanceTimeMinutes(deltaMinutes, reason = "", advanceContext = null) {
  // ========== 1. 参数规范化 ==========
  // 转换为整数
  deltaMinutes = Math.trunc(deltaMinutes);

  // 不允许负数（不允许倒退时间）
  if (deltaMinutes < 0) {
    console.warn(`[时间系统] 不允许倒退时间，已 clamp 为 0：deltaMinutes=${deltaMinutes}`);
    deltaMinutes = 0;
  }

  // 如果推进 0 分钟，直接返回
  if (deltaMinutes === 0) {
    console.log(`[时间系统] 推进 0 分钟，无变化 (reason: ${reason || "无"})`);
    return { requestedMinutes: 0, advancedMinutes: 0, blockedBy: null };
  }

  console.log(`[时间系统] 开始推进时间：${deltaMinutes} 分钟 (reason: ${reason || "无"})`);

  // ========== 2. 子步拆分循环 ==========
  let remaining = deltaMinutes;
  let advancedMinutes = 0;
  let blockedBy = null;
  const initialMedicalProjection = createMedicalAdvanceProjection(gameState);
  let medicalProjection = initialMedicalProjection;

  while (remaining > 0) {
    const now = gameState.time.totalMinutes;
    const hardStopQuery = getMinutesToNextHardStop(gameState, now, advanceContext, medicalProjection);
    medicalProjection = hardStopQuery.projection;
    const nextMedicalHardStopIn = hardStopQuery.minutes;
    const nextRearZoneCheckoutIn = getMinutesToRearZoneLodgingCheckout(now);
    const nextSteelcrossMarketClosingIn = getMinutesToSteelcrossMarketClosing(now);
    const nextTimedLocationClosureIn = getMinutesToNextTimedLocationClosure(gameState, now);
    const nextMargTransitionBlockerIn = getMinutesToNextMargTransitionBlocker(gameState, now, advanceContext);
    const nextHardStopIn = Math.min(
      nextMedicalHardStopIn,
      nextRearZoneCheckoutIn,
      nextSteelcrossMarketClosingIn,
      nextTimedLocationClosureIn,
      nextMargTransitionBlockerIn
    );

    if (nextHardStopIn === 0) {
      if (nextRearZoneCheckoutIn === 0) {
        blockedBy = triggerRearZoneLodgingCheckout(now);
      } else if (nextSteelcrossMarketClosingIn === 0) {
        blockedBy = triggerSteelcrossMarketClosing(now);
      } else if (nextTimedLocationClosureIn === 0) {
        blockedBy = triggerTimedLocationClosure(gameState, now);
      } else if (nextMargTransitionBlockerIn === 0) {
        blockedBy = applyMargTransitionBlockerStep({ timeBeforeMinutes: now, timeAfterMinutes: now }, gameState, advanceContext).blockedBy || null;
      } else {
        blockedBy = medicalProjection?.medical?.pendingBlocker || {
          blockerId: "hard_stop",
          atMinutes: now,
          hardStop: true
        };
      }
      break;
    }

    // 计算本次子步的分钟数（最多 MAX_STEP_MIN）
    const stepMin = Math.min(MAX_STEP_MIN, remaining, Number.isFinite(nextHardStopIn) ? nextHardStopIn : MAX_STEP_MIN);

    if (stepMin <= 0) break;

    // 执行子步
    const stepContext = executeTimeStep(stepMin);
    const rearZoneCheckoutResult = applyRearZoneLodgingCheckoutStep(stepContext);
    const steelcrossMarketClosingResult = applySteelcrossMarketClosingStep(stepContext);
    const timedLocationClosureResult = applyTimedLocationClosureStep(stepContext, gameState);
    const margTransitionBlockerResult = applyMargTransitionBlockerStep(stepContext, gameState, advanceContext);
    const sessionResult = applySessionStep(gameState, stepMin, stepContext, advanceContext, medicalProjection);
    medicalProjection = sessionResult.projection;
    advancedMinutes += stepMin;

    // 减少剩余时间
    remaining -= stepMin;

    if (rearZoneCheckoutResult?.hardStopReached) {
      blockedBy = rearZoneCheckoutResult.blockedBy || triggerRearZoneLodgingCheckout(gameState.time.totalMinutes);
      break;
    }

    if (steelcrossMarketClosingResult?.hardStopReached) {
      blockedBy = steelcrossMarketClosingResult.blockedBy || triggerSteelcrossMarketClosing(gameState.time.totalMinutes);
      break;
    }

    if (timedLocationClosureResult?.hardStopReached) {
      blockedBy = timedLocationClosureResult.blockedBy || triggerTimedLocationClosure(gameState, gameState.time.totalMinutes);
      break;
    }

    if (margTransitionBlockerResult?.hardStopReached) {
      blockedBy = margTransitionBlockerResult.blockedBy || null;
      break;
    }

    if (sessionResult?.hardStopReached) {
      blockedBy = medicalProjection?.medical?.pendingBlocker || {
        blockerId: "hard_stop",
        atMinutes: gameState.time.totalMinutes,
        hardStop: true
      };
      break;
    }
  }

  console.log(`[时间系统] 推进完成，当前时间：`, getTimeView());
  return {
    requestedMinutes: deltaMinutes,
    advancedMinutes,
    blockedBy,
    effects: buildMedicalAdvanceEffects(initialMedicalProjection, medicalProjection)
  };
}

/**
 * 执行单个时间子步（内部函数）
 * @param {number} stepMin - 子步的分钟数（1..MAX_STEP_MIN）
 */
function executeTimeStep(stepMin) {
  // ========== 1. 记录推进前的时间 ==========
  const timeBeforeMinutes = gameState.time.totalMinutes;
  const timeViewBefore = getTimeView(timeBeforeMinutes);
  const minuteOfDayBefore = timeViewBefore.minuteOfDay;
  const phaseBefore = GetTimePhase(minuteOfDayBefore);
  const dnBefore = GetDayNightPhase(minuteOfDayBefore);

  // ========== 2. 更新 totalMinutes（唯一真值） ==========
  gameState.time.totalMinutes += stepMin;

  // 确保不会出现 NaN 或负数
  if (isNaN(gameState.time.totalMinutes) || gameState.time.totalMinutes < 0) {
    console.error(`[时间系统] totalMinutes 异常：${gameState.time.totalMinutes}，回滚到 ${timeBeforeMinutes}`);
    gameState.time.totalMinutes = timeBeforeMinutes;
    return;
  }

  // ========== 3. 派生推进后的时间视图 ==========
  const timeAfterMinutes = gameState.time.totalMinutes;
  const timeViewAfter = getTimeView(timeAfterMinutes);
  const minuteOfDayAfter = timeViewAfter.minuteOfDay;
  const phaseAfter = GetTimePhase(minuteOfDayAfter);
  const dnAfter = GetDayNightPhase(minuteOfDayAfter);

  // ========== 4. 构造系统回调上下文 ==========
  const dtHours = stepMin / 60; // 小时数（浮点）

  const context = {
    timeBeforeMinutes,     // 推进前的总分钟数
    timeAfterMinutes,      // 推进后的总分钟数
    timeViewAfter,         // 推进后的时间视图（day/hour/minute）
    dtHours,               // 本次子步的小时数（用于温度等系统的计算）
    calendarView: deriveCalendarView(timeAfterMinutes, gameState.world),
    worldTimeContext: getWorldTimeContext(timeAfterMinutes, gameState.world)
  };

  // ========== 4.5 触发时间事件（用于未来事件系统挂接） ==========
  // minuteOfDay 变化（通常每个子步都会变；跨天时也会正确 wrap）
  if (minuteOfDayAfter !== minuteOfDayBefore) {
    emitTo(OnMinuteOfDayChanged, minuteOfDayAfter);
  }
  // 跨六段
  if (phaseAfter !== phaseBefore) {
    emitTo(OnTimePhaseChanged, phaseBefore, phaseAfter);
  }
  // 跨白天/夜晚
  if (dnAfter !== dnBefore) {
    emitTo(OnDayNightChanged, dnBefore, dnAfter);
  }

  // ========== 5. 调用所有已注册的时间系统 ==========
  for (const system of timeSystems) {
    try {
      system.onTimeStep(dtHours, context);
    } catch (error) {
      console.error(`[时间系统] 系统回调出错：`, system.constructor?.name || "匿名系统", error);
    }
  }

  // ========== 6. 日志输出（调试用） ==========
  // console.log(`[时间子步] +${stepMin}分钟，当前：Day ${timeViewAfter.day} ${formatTimeHHMM(timeViewAfter.hour, timeViewAfter.minute)}`);

  return context;
}

// ============================================================================
// 导出说明
// ============================================================================
// 本模块导出：
// - getTimeView(totalMinutes?) : 从 totalMinutes 派生时间视图
// - formatTimeHHMM(hour, minute) : 格式化时间为 HH:MM
// - registerTimeSystem(system) : 注册时间系统（需实现 onTimeStep）
// - advanceTimeMinutes(deltaMinutes, reason?) : 推进时间（唯一入口）
// ============================================================================
