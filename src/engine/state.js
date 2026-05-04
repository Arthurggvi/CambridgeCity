// 全局游戏状态容器
// 纯数据驱动的核心：所有"可保存/可回放/可推导"的东西都写这里。

import { applyStarterKitToPlayer, createDefaultPlayerState } from "./player.js";
import { EQUIPMENT_SLOT_ORDER, INVENTORY_CATEGORIES, getDefaultEquipment } from "./items_db.js";
import {
  DEFAULT_START_TOTAL_MINUTES,
  getDefaultWorldCalendar,
  normalizeWorldCalendar
} from "./calendar_model.js";
import * as tasksModule from "./tasks.js";
import { normalizeUiOverlay } from "./ui_route.js";
import { ensureProfileShape } from "./profile/read.js";
import { createEmptyArchiveReadingState, normalizeArchiveReadingState } from "./archive_reading/state.js";
import { createEmptyTransitUiState, deriveTransitUiStateFromRuntimeTruth } from "./transit/transit_session.js";
import { createDefaultMedicalState, normalizeMedicalState } from "./medical_state.js";
import { cloneStatusEffectsState, migrateLegacyTimedModifiersToStatusEffects } from "./status_effect_runtime.js";
import { getAllNpcDefinitions } from "./social/npc_registry.js";
import { createEmptySocialState, normalizeSocialState, withNpcEnabledDefaults } from "./social/social_state.js";
import {
  createDefaultWildernessState,
  normalizeWildernessState
} from "./wilderness/wilderness_state.js";

function createDefaultNpcWorldState() {
  return withNpcEnabledDefaults(null, getAllNpcDefinitions());
}

function createDefaultRefDataCompat() {
  if (typeof tasksModule.createDefaultRefData === "function") {
    return tasksModule.createDefaultRefData();
  }
  return {
    accounts: {
      unpaidFinesCents: 0
    },
    places: {
      loc_gov_hall: {
        name: "政务大厅",
        openHours: "星期一到星期六 9:00-18:00",
        location: "风堤街-转角公告段",
        notes: "节假日以公告为准"
      }
    }
  };
}

function normalizeRefDataCompat(refData) {
  if (typeof tasksModule.normalizeRefData === "function") {
    return tasksModule.normalizeRefData(refData);
  }
  const defaults = createDefaultRefDataCompat();
  const source = refData && typeof refData === "object" ? refData : {};
  const accounts = source.accounts && typeof source.accounts === "object" ? source.accounts : {};
  const places = source.places && typeof source.places === "object" ? source.places : {};
  return {
    ...defaults,
    ...source,
    accounts: {
      ...defaults.accounts,
      ...accounts,
      unpaidFinesCents: Number.isFinite(Number(accounts.unpaidFinesCents))
        ? Math.max(0, Math.trunc(Number(accounts.unpaidFinesCents)))
        : defaults.accounts.unpaidFinesCents
    },
    places: {
      ...defaults.places,
      ...places
    }
  };
}

function normalizeTaskListCompat(list) {
  if (typeof tasksModule.normalizeTaskList === "function") {
    return tasksModule.normalizeTaskList(list);
  }
  return Array.isArray(list) ? list : [];
}

export function createDefaultGameState() {
  const sharedFlags = {};
  return {
  // 当前所在地图 id（启动时 main.js 会 loadMap(currentMapId)）
  currentMapId: "menu_main",  // 启动进入主菜单

  // 当前地图的完整 json 数据（由 loader.js 加载后写入）
  currentMap: null,

  // 当前地图内的正式 scene truth（V2 地图使用）
  currentSceneId: null,
  currentScene: null,
  
  // 上一个地图 id（用于"返回"功能）
  previousMapId: null,

  // 时间系统（唯一真值）
  time: {
    totalMinutes: DEFAULT_START_TOTAL_MINUTES  // 整数分钟，唯一真值
  },

  // UI 状态（不参与存档，仅用于界面交互）
  ui: {
    waitMinutes: 0,  // test_time 地图的滑条当前值（分钟）
    page: "map",
    overlay: null,
    recordsOpen: false,
    socialOpen: false,
    modal: null,
    invFilter: "tool",
    invSelectedItemId: null,
    invSelectedSlot: null,
    toast: null,
    taskSelectedId: null,
    menuAchievementSelectedId: null,
    inventoryNeedsAttention: false,
    tasksNeedsAttention: false,
    workFeedback: null,
    moneyDeltaFx: null,
    jobSession: null,
    inquirySession: null,
    transit: createEmptyTransitUiState()
  },

  // 世界状态
  world: {
    regionId: "CambCity",  // "West2" | "CambCity" | "OldCamb" | "South1"
    money: 0,                // 通用货币（用于诊所缴费等）
    sun: 0,                 // 日照 0..100（兼容旧字段）
    snowfallRate: 0,        // 降雪率 mm/h（兼容旧字段）
    windSpeed: 0,           // 局地风速 m/s（兼容旧字段）
    exposureEnabled: true,  // 室外默认启用外界暴露模式
    tEnv: -10,              // 环境温度（系统计算输出，兼容旧字段）

    // 世界历法（P0 Polar Illumination Phase 1）
    // 仍然只存最小真值；dayOfYear / seasonProfile / lightPhase 全部按 totalMinutes 派生。
    calendar: getDefaultWorldCalendar(),

    // 天气动态态（P1）
    weather: {
      cloudType: "Clear",            // Clear | Cirrus | Stratiform | Cumulonimbus
      stormIntensity: 0,               // [0,1]
      weatherEventType: "clear",
      weatherEventEndsAtMinute: 0,
      cloudTrans: 1.0,                 // [0,1]
      sunClear: 0,                     // [0,100]
      sun: 0,                          // [0,100]
      snowfallRate: 0,                 // mm/h
      isSnowing: false,
      snowIntensityLevel: "None",    // None | Light | Moderate | Heavy
      windSpeed_region: 0,
      windDir_region: "E",           // 8向枚举
      windSpeed_local: 0,
      windDir_local: "E",
      exposureLevel: "Open",         // Sheltered | SemiSheltered | Open | Ridge
      tEnv_region: -10
    },

    refData: createDefaultRefDataCompat(),

    // 医疗会话运行态（AdvanceTime 切片/结算）
    medical: createDefaultMedicalState(),

    // 启动期校验告警（P0-4）：不中断运行，但必须显式标记
    bootWarnings: {
      brokenMapRefs: false,
      duplicateMapIds: false,
      parseErrors: false
    },

    // ========== P0-2：导航与链路地图迁移支持（纯数据，可存档） ==========
    // 当前地图 id（与顶层 currentMapId 保持一致；过渡期双写，后续可收敛到 world）
    currentMapId: "menu_main",
    // 导航栈：历史遗留字段（当前 P0-2 不实现回退/返回栈；保留以兼容旧存档结构）
    mapStack: [],
    npcs: createDefaultNpcWorldState(),
    // 世界 flags（与顶层 flags 保持一致；过渡期双写）
    flags: sharedFlags,

    wilderness: createDefaultWildernessState()
  },

  // 玩家状态（纯数据驱动，使用新的 player 系统）
  player: applyStarterKitToPlayer(createDefaultPlayerState()),

  // 旧的玩家状态（温度系统相关，已废弃但保留以防兼容）
  playerLegacy: {
    wetness: 0,            // 潮湿度 0..1
    warmthRating: 1.0,     // 保暖等级 >0
    tCore: 37,             // 核心体温 ℃
    hypo: 100,             // 失温条 0..100
    hypoStage: "Safe"      // 失温阶段
  },

  // 未来剧情/开关：事件里可以 set_flag
  // 过渡期：与 world.flags 指向同一个对象，避免双源漂移
  flags: sharedFlags,

  // 简单日志：事件 step=log 会往这里塞；renderer 未来可渲染它
  logLines: [],

  // 场景正文 FX 双表：viewed != animated
  sceneTextFxAnimated: {},
  sceneTextFxViewed: {},

  // 调试态（不入存档）：最近一次温度冒烟测试报告
  debug: {
    lastTempSmokeReport: null
  },

  // 元数据（游戏会话信息）
  meta: {
    startedAt: new Date().toISOString(),  // 本次游戏开始时间
    saveSlotId: null,  // 当前使用的存档槽位（null 表示未保存）
    lastAutoSaveDay: 0,  // 上次自动存档的游戏天数（用于24小时自动保存）
    lastAutoSaveMinute: 0
  }
  };
}

export let gameState = createDefaultGameState();

// 过渡期绑定：确保 world.flags 与顶层 flags 同步引用
gameState.world.flags = gameState.flags;

export function replaceGameState(nextState) {
  if (!nextState || typeof nextState !== "object") {
    throw new Error("replaceGameState: nextState 无效");
  }
  gameState = nextState;
  if (!gameState.world || typeof gameState.world !== "object") {
    gameState.world = {};
  }
  if (!gameState.ui || typeof gameState.ui !== "object") {
    gameState.ui = {};
  }
  if (!gameState.flags || typeof gameState.flags !== "object") {
    gameState.flags = gameState.world.flags && typeof gameState.world.flags === "object"
      ? gameState.world.flags
      : {};
  }
  if (!gameState.sceneTextFxAnimated || typeof gameState.sceneTextFxAnimated !== "object" || Array.isArray(gameState.sceneTextFxAnimated)) {
    gameState.sceneTextFxAnimated = {};
  }
  if (!gameState.sceneTextFxViewed || typeof gameState.sceneTextFxViewed !== "object" || Array.isArray(gameState.sceneTextFxViewed)) {
    gameState.sceneTextFxViewed = {};
  }
  gameState.ui.transit = deriveTransitUiStateFromRuntimeTruth(gameState);
  gameState.world.flags = gameState.flags;
  gameState.world.wilderness = normalizeWildernessState(
    gameState.world.wilderness ?? createDefaultWildernessState()
  );
}

/**
 * 兼容旧存档：如果加载时发现旧字段，转换到新结构
 * @param {object} loadedState
 */
export function migrateOldState(loadedState) {
  if (loadedState.time && loadedState.time.totalHours !== undefined) {
    // 旧版使用 totalHours
    loadedState.time.totalMinutes = Math.round(loadedState.time.totalHours * 60);
    delete loadedState.time.totalHours;
  }
  
  if (loadedState.day !== undefined && !loadedState.time.totalMinutes) {
    // 只有 day 字段，估算
    loadedState.time.totalMinutes = (loadedState.day - 1) * 1440;
    delete loadedState.day;
  }

  // 确保必要字段存在
  if (!loadedState.world) {
    loadedState.world = {
      regionId: "CambCity",
      money: 0,
      sun: 0,
      snowfallRate: 0,
      windSpeed: 0,
      tEnv: -10,
      calendar: getDefaultWorldCalendar(),
      bootWarnings: { brokenMapRefs: false, duplicateMapIds: false, parseErrors: false },
      currentMapId: loadedState.currentMapId ?? "menu",
      mapStack: [],
      flags: loadedState.flags ?? {}
    };
  } else {
    // P0-2：补齐导航字段
    if (typeof loadedState.world.currentMapId !== "string") {
      loadedState.world.currentMapId = loadedState.currentMapId ?? "menu";
    }
    if (!Array.isArray(loadedState.world.mapStack)) {
      loadedState.world.mapStack = [];
    }
    if (!loadedState.world.flags || typeof loadedState.world.flags !== "object") {
      loadedState.world.flags = loadedState.flags ?? {};
    }

    if (typeof loadedState.world.regionId !== "string") {
      loadedState.world.regionId = "CambCity";
    }
    if (typeof loadedState.world.money !== "number" || !Number.isFinite(loadedState.world.money)) {
      loadedState.world.money = 0;
    }
    if (typeof loadedState.world.sun !== "number") loadedState.world.sun = 0;
    if (typeof loadedState.world.snowfallRate !== "number") loadedState.world.snowfallRate = 0;
    if (typeof loadedState.world.windSpeed !== "number") loadedState.world.windSpeed = 0;
    if (typeof loadedState.world.exposureEnabled !== "boolean") loadedState.world.exposureEnabled = true;
    if (typeof loadedState.world.tEnv !== "number") loadedState.world.tEnv = -10;
    loadedState.world.calendar = normalizeWorldCalendar(loadedState.world.calendar);

    if (!loadedState.world.weather || typeof loadedState.world.weather !== "object") {
      loadedState.world.weather = {
        cloudType: "Clear",
        stormIntensity: 0,
        weatherEventType: "clear",
        weatherEventEndsAtMinute: 0,
        cloudTrans: 1,
        sunClear: loadedState.world.sun,
        sun: loadedState.world.sun,
        snowfallRate: loadedState.world.snowfallRate,
        isSnowing: false,
        snowIntensityLevel: "None",
        windSpeed_region: loadedState.world.windSpeed,
        windDir_region: "E",
        windSpeed_local: loadedState.world.windSpeed,
        windDir_local: "E",
        exposureLevel: "Open",
        tEnv_region: loadedState.world.tEnv
      };
    }
    if (typeof loadedState.world.weather.weatherEventType !== "string" || loadedState.world.weather.weatherEventType.trim() === "") {
      loadedState.world.weather.weatherEventType = "clear";
    }
    if (!Number.isFinite(Number(loadedState.world.weather.weatherEventEndsAtMinute))) {
      loadedState.world.weather.weatherEventEndsAtMinute = 0;
    }
    delete loadedState.world.weather.sunLevel;
    delete loadedState.world.weather.lightPhase;
    delete loadedState.world.weather.visibilityBand;
    delete loadedState.world.weather.isDarkLike;

    loadedState.world.medical = normalizeMedicalState(loadedState.world.medical);

    if (!loadedState.world.bootWarnings || typeof loadedState.world.bootWarnings !== "object") {
      loadedState.world.bootWarnings = { brokenMapRefs: false, duplicateMapIds: false, parseErrors: false };
    } else {
      if (typeof loadedState.world.bootWarnings.brokenMapRefs !== "boolean") loadedState.world.bootWarnings.brokenMapRefs = false;
      if (typeof loadedState.world.bootWarnings.duplicateMapIds !== "boolean") loadedState.world.bootWarnings.duplicateMapIds = false;
      if (typeof loadedState.world.bootWarnings.parseErrors !== "boolean") loadedState.world.bootWarnings.parseErrors = false;
    }
  }

  if (!loadedState.player) {
    loadedState.player = createDefaultPlayerState();
  } else {
    const defaultPlayer = createDefaultPlayerState();
    if (!Array.isArray(loadedState.player.inventory)) {
      loadedState.player.inventory = defaultPlayer.inventory;
    }

    if (!loadedState.player.equipment || typeof loadedState.player.equipment !== "object") {
      loadedState.player.equipment = getDefaultEquipment();
    } else {
      const normalizedEquipment = getDefaultEquipment();
      for (const slot of EQUIPMENT_SLOT_ORDER) {
        const value = loadedState.player.equipment[slot];
        normalizedEquipment[slot] = typeof value === "string" && value.trim() ? value : null;
      }
      loadedState.player.equipment = normalizedEquipment;
    }

    if (!Array.isArray(loadedState.player.tasks)) {
      loadedState.player.tasks = defaultPlayer.tasks;
    } else {
      loadedState.player.tasks = normalizeTaskListCompat(loadedState.player.tasks);
    }

    // 温度字段迁移：旧存档可能缺失这些字段
    if (!loadedState.player.physio || typeof loadedState.player.physio !== "object") {
      loadedState.player.physio = defaultPlayer.physio;
    }
    if (typeof loadedState.player.physio.temperatureC !== "number") {
      loadedState.player.physio.temperatureC = defaultPlayer.physio.temperatureC;
    }

    if (!loadedState.player.psycho || typeof loadedState.player.psycho !== "object") {
      loadedState.player.psycho = defaultPlayer.psycho;
    }
    if (typeof loadedState.player.psycho.hypothermia !== "number") {
      loadedState.player.psycho.hypothermia = defaultPlayer.psycho.hypothermia;
    }
    if (typeof loadedState.player.psycho.hypoStage !== "string" || !loadedState.player.psycho.hypoStage) {
      loadedState.player.psycho.hypoStage = defaultPlayer.psycho.hypoStage;
    }

    if (!loadedState.player.gear || typeof loadedState.player.gear !== "object") {
      loadedState.player.gear = defaultPlayer.gear;
    } else if (!loadedState.player.gear.thermal || typeof loadedState.player.gear.thermal !== "object") {
      loadedState.player.gear.thermal = defaultPlayer.gear.thermal;
    } else {
      if (typeof loadedState.player.gear.thermal.wetness !== "number") {
        loadedState.player.gear.thermal.wetness = defaultPlayer.gear.thermal.wetness;
      }
    }

    loadedState.player.gear.thermal.warmthRating = defaultPlayer.gear.thermal.warmthRating;
    loadedState.player.gear.thermal.windproof = defaultPlayer.gear.thermal.windproof;
    loadedState.player.gear.thermal.waterproof = defaultPlayer.gear.thermal.waterproof;
    loadedState.player.gear.thermal.insulationEff = defaultPlayer.gear.thermal.insulationEff;
    loadedState.player.gear.thermal.windproofEff = defaultPlayer.gear.thermal.windproofEff;
    loadedState.player.gear.thermal.protectionScore = defaultPlayer.gear.thermal.protectionScore;

    if (!loadedState.player.exposure || typeof loadedState.player.exposure !== "object") {
      loadedState.player.exposure = defaultPlayer.exposure;
    } else {
      if (typeof loadedState.player.exposure.hypo100 !== "number") {
        loadedState.player.exposure.hypo100 = defaultPlayer.exposure.hypo100;
      }
      if (typeof loadedState.player.exposure.incapacitated !== "boolean") {
        loadedState.player.exposure.incapacitated = defaultPlayer.exposure.incapacitated;
      }
      if (typeof loadedState.player.exposure.dead !== "boolean") {
        loadedState.player.exposure.dead = defaultPlayer.exposure.dead;
      }
    }

    if (!loadedState.player.meta || typeof loadedState.player.meta !== "object") {
      loadedState.player.meta = {};
    }
    if (!loadedState.player.meta.jobRuns || typeof loadedState.player.meta.jobRuns !== "object") {
      loadedState.player.meta.jobRuns = {};
    }
    const nextStatusEffects = cloneStatusEffectsState(loadedState.player.meta.statusEffects);
    if (nextStatusEffects.active.length === 0) {
      const timedModifiers = loadedState.player.meta.timedModifiers && typeof loadedState.player.meta.timedModifiers === "object"
        ? loadedState.player.meta.timedModifiers
        : null;
      const migrated = migrateLegacyTimedModifiersToStatusEffects(timedModifiers);
      nextStatusEffects.active = migrated.active;
    }
    loadedState.player.meta.statusEffects = cloneStatusEffectsState(nextStatusEffects);
    if (Object.prototype.hasOwnProperty.call(loadedState.player.meta, "timedModifiers")) {
      delete loadedState.player.meta.timedModifiers;
    }
    if (!loadedState.player.meta.itemUseCooldowns || typeof loadedState.player.meta.itemUseCooldowns !== "object") {
      loadedState.player.meta.itemUseCooldowns = {};
    }
    if (!loadedState.player.meta.libraryReading || typeof loadedState.player.meta.libraryReading !== "object") {
      loadedState.player.meta.libraryReading = {
        seenBookIds: [],
        readOrder: [],
        daily: {
          dayKey: "",
          readCount: 0
        }
      };
    }
    loadedState.player.meta.archiveReading = normalizeArchiveReadingState(
      loadedState.player.meta.archiveReading && typeof loadedState.player.meta.archiveReading === "object"
        ? loadedState.player.meta.archiveReading
        : createEmptyArchiveReadingState()
    );

    if (!loadedState.player.extra || typeof loadedState.player.extra !== "object") {
      loadedState.player.extra = {};
    }
    if (!loadedState.player.extra.jobFutureStats || typeof loadedState.player.extra.jobFutureStats !== "object") {
      loadedState.player.extra.jobFutureStats = {};
    }

    if (!loadedState.player.transit || typeof loadedState.player.transit !== "object") {
      loadedState.player.transit = { ride: null };
    } else if (!Object.prototype.hasOwnProperty.call(loadedState.player.transit, "ride")) {
      loadedState.player.transit.ride = null;
    }

    loadedState.player.profile = ensureProfileShape(loadedState.player.profile);
    loadedState.player.social = normalizeSocialState(
      loadedState.player?.social && typeof loadedState.player.social === "object"
        ? loadedState.player.social
        : createEmptySocialState()
    );
  }

  if (!loadedState.world || typeof loadedState.world !== "object") {
    loadedState.world = { refData: createDefaultRefDataCompat() };
  }
  if (!loadedState.world.refData || typeof loadedState.world.refData !== "object") {
    loadedState.world.refData = createDefaultRefDataCompat();
  } else {
    loadedState.world.refData = normalizeRefDataCompat(loadedState.world.refData);
  }

  if (!loadedState.ui || typeof loadedState.ui !== "object") {
    loadedState.ui = {};
  }
  if (typeof loadedState.ui.waitMinutes !== "number") loadedState.ui.waitMinutes = 0;
  if (typeof loadedState.ui.modal !== "string") loadedState.ui.modal = null;
  loadedState.ui.socialOpen = loadedState.ui.socialOpen === true;
  const legacyUiPage = String(loadedState.ui.page || "").trim();
  const normalizedOverlay = normalizeUiOverlay(loadedState.ui.overlay);
  loadedState.ui.overlay = normalizedOverlay
    || (legacyUiPage === "inventory" ? "inventory" : null)
    || (legacyUiPage === "tasks" || legacyUiPage === "memo" ? "tasks" : null);
  loadedState.ui.page = "map";
  if (!INVENTORY_CATEGORIES.includes(loadedState.ui.invFilter)) loadedState.ui.invFilter = "tool";
  if (typeof loadedState.ui.invSelectedItemId !== "string") loadedState.ui.invSelectedItemId = null;
  if (!EQUIPMENT_SLOT_ORDER.includes(loadedState.ui.invSelectedSlot)) loadedState.ui.invSelectedSlot = null;
  if (typeof loadedState.ui.toast !== "string") loadedState.ui.toast = null;
  if (typeof loadedState.ui.taskSelectedId !== "string") loadedState.ui.taskSelectedId = null;
  loadedState.ui.inventoryNeedsAttention = !!loadedState.ui.inventoryNeedsAttention;
  loadedState.ui.tasksNeedsAttention = !!loadedState.ui.tasksNeedsAttention;
  if (!loadedState.ui.workFeedback || typeof loadedState.ui.workFeedback !== "object") {
    loadedState.ui.workFeedback = null;
  }
  if (!loadedState.ui.moneyDeltaFx || typeof loadedState.ui.moneyDeltaFx !== "object") {
    loadedState.ui.moneyDeltaFx = null;
  }
  if (!loadedState.ui.jobSession || typeof loadedState.ui.jobSession !== "object") {
    loadedState.ui.jobSession = null;
  }
  if (!loadedState.ui.inquirySession || typeof loadedState.ui.inquirySession !== "object") {
    loadedState.ui.inquirySession = null;
  }
  loadedState.ui.transit = deriveTransitUiStateFromRuntimeTruth(loadedState);

  if (!loadedState.debug || typeof loadedState.debug !== "object") {
    loadedState.debug = { lastTempSmokeReport: null };
  }
  if (!Object.prototype.hasOwnProperty.call(loadedState.debug, "lastTempSmokeReport")) {
    loadedState.debug.lastTempSmokeReport = null;
  }

  const legacySceneTextFxSeen = loadedState.sceneTextFxSeen && typeof loadedState.sceneTextFxSeen === "object" && !Array.isArray(loadedState.sceneTextFxSeen)
    ? loadedState.sceneTextFxSeen
    : {};
  if (!loadedState.sceneTextFxViewed || typeof loadedState.sceneTextFxViewed !== "object" || Array.isArray(loadedState.sceneTextFxViewed)) {
    loadedState.sceneTextFxViewed = { ...legacySceneTextFxSeen };
  }
  if (!loadedState.sceneTextFxAnimated || typeof loadedState.sceneTextFxAnimated !== "object" || Array.isArray(loadedState.sceneTextFxAnimated)) {
    loadedState.sceneTextFxAnimated = {};
  }
  delete loadedState.sceneTextFxSeen;

  // 确保 flags 存在，并与 world.flags 同步引用
  if (!loadedState.flags || typeof loadedState.flags !== "object") {
    loadedState.flags = loadedState.world?.flags ?? {};
  }
  if (loadedState.world && loadedState.world.flags !== loadedState.flags) {
    loadedState.world.flags = loadedState.flags;
  }

  // world.currentMapId 与顶层 currentMapId 同步
  if (typeof loadedState.currentMapId === "string") {
    loadedState.world.currentMapId = loadedState.currentMapId;
  }
  loadedState.world.npcs = withNpcEnabledDefaults(loadedState.world?.npcs, getAllNpcDefinitions());

  loadedState.world.wilderness = normalizeWildernessState(loadedState.world?.wilderness);

  return loadedState;
}
