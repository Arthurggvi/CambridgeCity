// ============================================================================
// 存档版本迁移（Migrations）
// ============================================================================
// 设计原则：
// 1. 只补字段、改字段名、修正类型，不做规则重算
// 2. 缺失字段用默认值填充
// 3. 每次迁移后更新 schemaVersion
// 4. 迁移必须幂等（多次应用不会出错）
// ============================================================================

import { SAVE_SCHEMA_VERSION } from "./save_schema.js";
import { normalizeMedicalState } from "../engine/medical_state.js";
import { createDefaultPlayerState } from "../engine/player.js";
import { getDefaultWorldCalendar, normalizeWorldCalendar } from "../engine/calendar_model.js";
import { EQUIPMENT_SLOT_ORDER, getDefaultEquipment, normalizeEquippedTools } from "../engine/items_db.js";
import { getAllNpcDefinitions } from "../engine/social/npc_registry.js";
import { createEmptySocialState, normalizeSocialState, withNpcEnabledDefaults } from "../engine/social/social_state.js";
import { normalizeWildernessState } from "../engine/wilderness/wilderness_state.js";
import * as tasksModule from "../engine/tasks.js";

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

/**
 * 将旧版本存档迁移到最新版本
 * @param {object} saveFile - 存档文件对象
 * @returns {object} 迁移后的存档文件
 */
export function migrateSaveFile(saveFile) {
  if (!saveFile || typeof saveFile !== "object") {
    throw new Error("Invalid save file: not an object");
  }
  
  // 如果没有 schemaVersion，认为是 v0（最原始版本）
  let version = saveFile.schemaVersion ?? 0;
  
  // 深拷贝，避免修改原对象
  let migrated = JSON.parse(JSON.stringify(saveFile));
  
  // 依次应用迁移
  while (version < SAVE_SCHEMA_VERSION) {
    console.log(`[存档迁移] 从 v${version} 迁移到 v${version + 1}`);
    
    switch (version) {
      case 0:
        migrated = migrateV0toV1(migrated);
        break;

      case 1:
        migrated = migrateV1toV2(migrated);
        break;

      case 2:
        migrated = migrateV2toV3(migrated);
        break;

      case 3:
        migrated = migrateV3toV4(migrated);
        break;

      case 4:
        migrated = migrateV4toV5(migrated);
        break;

      case 5:
        migrated = migrateV5toV6(migrated);
        break;

      case 6:
        migrated = migrateV6toV7(migrated);
        break;

      case 7:
        migrated = migrateV7toV8(migrated);
        break;

      case 8:
        migrated = migrateV8toV9(migrated);
        break;

      case 9:
        migrated = migrateV9toV10(migrated);
        break;

      case 10:
        migrated = migrateV10toV11(migrated);
        break;

      case 11:
        migrated = migrateV11toV12(migrated);
        break;
      
      // 未来新增版本迁移在此添加
      // case 1:
      //   migrated = migrateV1toV2(migrated);
      //   break;
      
      default:
        console.warn(`[存档迁移] 未知版本 ${version}，跳过`);
        break;
    }
    
    version++;
    migrated.schemaVersion = version;
  }
  
  return migrated;
}

function ensurePlayerMeta(state = {}) {
  if (!state.player || typeof state.player !== "object") return null;
  if (!state.player.meta || typeof state.player.meta !== "object") {
    state.player.meta = {};
  }
  return state.player.meta;
}

function appendMigrationNote(state, note) {
  const meta = ensurePlayerMeta(state);
  if (!meta) return;
  if (!Array.isArray(meta.migrationNotes)) {
    meta.migrationNotes = [];
  }
  meta.migrationNotes.push(String(note));
  if (meta.migrationNotes.length > 12) {
    meta.migrationNotes = meta.migrationNotes.slice(-12);
  }
}

function stripDerivedThermalFields(thermal, defaultThermal, state, tag) {
  if (!thermal || typeof thermal !== "object") return;
  const derivedKeys = ["warmthRating", "windproof", "waterproof", "insulationEff", "windproofEff", "protectionScore"];
  const removed = derivedKeys.filter((key) => Object.prototype.hasOwnProperty.call(thermal, key));
  thermal.warmthRating = defaultThermal.warmthRating;
  thermal.windproof = defaultThermal.windproof;
  thermal.waterproof = defaultThermal.waterproof;
  thermal.insulationEff = defaultThermal.insulationEff;
  thermal.windproofEff = defaultThermal.windproofEff;
  thermal.protectionScore = defaultThermal.protectionScore;
  if (removed.length) {
    appendMigrationNote(state, `${tag}: dropped derived thermal fields -> ${removed.join(",")}`);
  }
}

function sanitizeSceneTextFxTable(rawTable, limit = 600) {
  if (!rawTable || typeof rawTable !== "object" || Array.isArray(rawTable)) return {};
  const entries = [];
  for (const [rawKey, rawValue] of Object.entries(rawTable)) {
    const key = String(rawKey || "").trim();
    if (!key) continue;
    const n = Number(rawValue);
    if (Number.isFinite(n) && n > 0) {
      entries.push([key, Math.trunc(n)]);
      continue;
    }
    if (rawValue === 1 || rawValue === true || rawValue === "1") {
      entries.push([key, 1]);
    }
  }
  entries.sort((a, b) => Number(b[1]) - Number(a[1]));
  const max = Math.max(20, Math.trunc(Number(limit) || 600));
  return Object.fromEntries(entries.slice(0, max));
}

function mergeSceneTextFxTables(primaryTable, secondaryTable, limit = 600) {
  const merged = {
    ...sanitizeSceneTextFxTable(secondaryTable, limit),
    ...sanitizeSceneTextFxTable(primaryTable, limit)
  };
  return sanitizeSceneTextFxTable(merged, limit);
}

/**
 * v1 → v2：补齐 world 导航字段（P0-2）
 * - world.currentMapId
 * - world.mapStack
 * - world.flags
 */
function migrateV1toV2(saveFile) {
  const migrated = { ...saveFile };
  if (!migrated.state) migrated.state = {};

  const state = migrated.state;
  if (!state.world) state.world = {};

  if (typeof state.world.currentMapId !== "string") {
    state.world.currentMapId = state.currentMapId ?? "menu";
  }

  if (!Array.isArray(state.world.mapStack)) {
    state.world.mapStack = [];
  }

  if (!state.world.flags || typeof state.world.flags !== "object") {
    state.world.flags = state.flags ?? {};
  }

  // 保持顶层 flags 仍然存在
  if (!state.flags || typeof state.flags !== "object") {
    state.flags = state.world.flags;
  }

  return migrated;
}

/**
 * v2 → v3：补齐 world.weather/world.medical
 */
function migrateV2toV3(saveFile) {
  const migrated = { ...saveFile };
  if (!migrated.state) migrated.state = {};

  const state = migrated.state;
  if (!state.world) state.world = {};

  if (typeof state.world.regionId !== "string") {
    state.world.regionId = "CambCity";
  }

  if (typeof state.world.money !== "number" || !Number.isFinite(state.world.money)) {
    state.world.money = 0;
  }

  state.world.sun = state.world.sun ?? 0;
  state.world.snowfallRate = state.world.snowfallRate ?? 0;
  state.world.windSpeed = state.world.windSpeed ?? 0;
  state.world.tEnv = state.world.tEnv ?? -10;

  if (!state.world.weather || typeof state.world.weather !== "object") {
    state.world.weather = {
      cloudType: "Clear",
      stormIntensity: 0,
      weatherEventType: "clear",
      weatherEventEndsAtMinute: 0,
      cloudTrans: 1,
      sunClear: state.world.sun,
      sun: state.world.sun,
      snowfallRate: state.world.snowfallRate,
      isSnowing: false,
      snowIntensityLevel: "None",
      windSpeed_region: state.world.windSpeed,
      windDir_region: "E",
      windSpeed_local: state.world.windSpeed,
      windDir_local: "E",
      exposureLevel: "Open",
      tEnv_region: state.world.tEnv
    };
  }
  if (typeof state.world.weather.weatherEventType !== "string" || state.world.weather.weatherEventType.trim() === "") {
    state.world.weather.weatherEventType = "clear";
  }
  if (!Number.isFinite(Number(state.world.weather.weatherEventEndsAtMinute))) {
    state.world.weather.weatherEventEndsAtMinute = 0;
  }

  if (!state.world.calendar || typeof state.world.calendar !== "object") {
    state.world.calendar = getDefaultWorldCalendar();
  }
  state.world.calendar = normalizeWorldCalendar(state.world.calendar);

  delete state.world.weather.sunLevel;
  delete state.world.weather.lightPhase;
  delete state.world.weather.visibilityBand;
  delete state.world.weather.isDarkLike;

  state.world.medical = normalizeMedicalState(state.world.medical);

  return migrated;
}

/**
 * v3 → v4：补齐 player.inventory / player.equipment
 */
function migrateV3toV4(saveFile) {
  const migrated = { ...saveFile };
  if (!migrated.state) migrated.state = {};

  const state = migrated.state;
  const defaultPlayer = createDefaultPlayerState();

  if (!state.player || typeof state.player !== "object") {
    state.player = defaultPlayer;
    delete state.player.limits;
    return migrated;
  }

  if (!Array.isArray(state.player.inventory)) {
    state.player.inventory = [];
  }

  if (!state.player.equipment || typeof state.player.equipment !== "object") {
    state.player.equipment = getDefaultEquipment();
  } else {
    const normalized = getDefaultEquipment();
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      const value = state.player.equipment[slot];
      normalized[slot] = typeof value === "string" && value.trim() ? value : null;
    }
    state.player.equipment = normalized;
  }

  state.player.equippedTools = normalizeEquippedTools(state.player.equippedTools);

  delete state.player.limits;
  return migrated;
}

/**
 * v4 → v5：补齐 player.tasks / world.refData
 */
function migrateV4toV5(saveFile) {
  const migrated = { ...saveFile };
  if (!migrated.state) migrated.state = {};

  const state = migrated.state;
  const defaultPlayer = createDefaultPlayerState();

  if (!state.player || typeof state.player !== "object") {
    state.player = defaultPlayer;
  }

  if (!Array.isArray(state.player.tasks)) {
    state.player.tasks = defaultPlayer.tasks;
  } else {
    state.player.tasks = normalizeTaskListCompat(state.player.tasks);
  }

  if (!state.world || typeof state.world !== "object") {
    state.world = {};
  }

  if (!state.world.refData || typeof state.world.refData !== "object") {
    state.world.refData = createDefaultRefDataCompat();
  } else {
    state.world.refData = normalizeRefDataCompat(state.world.refData);
  }

  return migrated;
}

/**
 * v5 → v6：统一 SaveFile 外层结构 + 快照关键字段规范化
 * - SaveFile 固定为 { schemaVersion, savedAt, slotId, state }
 * - state.timeMinutes 迁移为 state.time.totalMinutes
 * - currentMapId 缺失时从 world.currentMapId 回填
 */
function migrateV5toV6(saveFile) {
  const source = { ...saveFile };
  const state = source.state && typeof source.state === "object" ? { ...source.state } : {};

  if (!state.time || typeof state.time !== "object") {
    const legacyMinutes = Number(state.timeMinutes ?? state.time?.totalMinutes ?? 0);
    state.time = { totalMinutes: Number.isFinite(legacyMinutes) ? Math.trunc(legacyMinutes) : 0 };
  } else {
    const totalMinutes = Number(state.time.totalMinutes ?? 0);
    state.time.totalMinutes = Number.isFinite(totalMinutes) ? Math.trunc(totalMinutes) : 0;
  }
  delete state.timeMinutes;

  const worldMapId = typeof state.world?.currentMapId === "string" ? state.world.currentMapId.trim() : "";
  const topMapId = typeof state.currentMapId === "string" ? state.currentMapId.trim() : "";
  const resolvedMapId = topMapId || worldMapId || "menu_main";
  state.currentMapId = resolvedMapId;

  if (!state.world || typeof state.world !== "object") {
    state.world = {};
  }
  state.world.currentMapId = resolvedMapId;

  if (!state.flags || typeof state.flags !== "object" || Array.isArray(state.flags)) {
    state.flags = state.world.flags && typeof state.world.flags === "object" && !Array.isArray(state.world.flags)
      ? state.world.flags
      : {};
  }
  state.world.flags = state.flags;

  if (!Array.isArray(state.logLines)) {
    state.logLines = [];
  }

  if (!state.meta || typeof state.meta !== "object") {
    state.meta = {};
  }
  if (typeof state.meta.startedAt !== "string") {
    state.meta.startedAt = new Date().toISOString();
  }
  if (!Number.isFinite(Number(state.meta.lastAutoSaveDay))) {
    state.meta.lastAutoSaveDay = 0;
  } else {
    state.meta.lastAutoSaveDay = Math.trunc(Number(state.meta.lastAutoSaveDay));
  }
  if (!Number.isFinite(Number(state.meta.lastAutoSaveMinute))) {
    state.meta.lastAutoSaveMinute = 0;
  } else {
    state.meta.lastAutoSaveMinute = Math.trunc(Number(state.meta.lastAutoSaveMinute));
  }

  const legacySavedAt = Date.parse(source.meta?.updatedAt || "");
  const savedAtCandidate = source.savedAt ?? (Number.isFinite(legacySavedAt) ? legacySavedAt : Date.now());
  const savedAt = Number(savedAtCandidate);
  const slotId = typeof source.slotId === "string"
    ? source.slotId
    : String(source.meta?.slotId ?? "unknown");

  return {
    schemaVersion: source.schemaVersion,
    savedAt: Number.isFinite(savedAt) ? Math.trunc(savedAt) : Date.now(),
    slotId,
    state
  };
}

/**
 * v6 -> v7：回补温度系统字段
 * - player.physio.temperatureC
 * - player.psycho.hypothermia / hypoStage
 * - player.gear.thermal
 */
function migrateV6toV7(saveFile) {
  const migrated = { ...saveFile };
  if (!migrated.state || typeof migrated.state !== "object") migrated.state = {};

  const state = migrated.state;
  const defaultPlayer = createDefaultPlayerState();

  if (!state.player || typeof state.player !== "object") {
    state.player = defaultPlayer;
    delete state.player.limits;
    return migrated;
  }

  if (!state.player.physio || typeof state.player.physio !== "object") {
    state.player.physio = { ...defaultPlayer.physio };
  }
  if (!Number.isFinite(Number(state.player.physio.temperatureC))) {
    state.player.physio.temperatureC = defaultPlayer.physio.temperatureC;
  }

  if (!state.player.psycho || typeof state.player.psycho !== "object") {
    state.player.psycho = { ...defaultPlayer.psycho };
  }
  if (!Number.isFinite(Number(state.player.psycho.hypothermia))) {
    state.player.psycho.hypothermia = defaultPlayer.psycho.hypothermia;
  }
  if (typeof state.player.psycho.hypoStage !== "string" || state.player.psycho.hypoStage.trim() === "") {
    state.player.psycho.hypoStage = defaultPlayer.psycho.hypoStage;
  }

  if (!state.player.gear || typeof state.player.gear !== "object") {
    state.player.gear = JSON.parse(JSON.stringify(defaultPlayer.gear));
  } else if (!state.player.gear.thermal || typeof state.player.gear.thermal !== "object") {
    state.player.gear.thermal = JSON.parse(JSON.stringify(defaultPlayer.gear.thermal));
  } else {
    if (!Number.isFinite(Number(state.player.gear.thermal.wetness))) {
      state.player.gear.thermal.wetness = defaultPlayer.gear.thermal.wetness;
    }
  }

  stripDerivedThermalFields(state.player.gear.thermal, defaultPlayer.gear.thermal, state, "v6->v7");

  delete state.player.limits;
  return migrated;
}

/**
 * v7 -> v8：温度系统 gear 热学字段增强
 * - player.gear.thermal.windproof
 * - player.gear.thermal.waterproof
 * - 对 wetness/warmthRating 做范围修正
 */
function migrateV7toV8(saveFile) {
  const migrated = { ...saveFile };
  if (!migrated.state || typeof migrated.state !== "object") migrated.state = {};

  const state = migrated.state;
  const defaultPlayer = createDefaultPlayerState();

  if (!state.player || typeof state.player !== "object") {
    state.player = defaultPlayer;
    delete state.player.limits;
    return migrated;
  }

  if (!state.player.gear || typeof state.player.gear !== "object") {
    state.player.gear = JSON.parse(JSON.stringify(defaultPlayer.gear));
  }
  if (!state.player.gear.thermal || typeof state.player.gear.thermal !== "object") {
    state.player.gear.thermal = JSON.parse(JSON.stringify(defaultPlayer.gear.thermal));
  }

  const thermal = state.player.gear.thermal;
  const warmthRating = Number(thermal.warmthRating);
  thermal.warmthRating = Number.isFinite(warmthRating) ? Math.max(0.05, warmthRating) : defaultPlayer.gear.thermal.warmthRating;

  const wetness = Number(thermal.wetness);
  thermal.wetness = Number.isFinite(wetness) ? Math.max(0, Math.min(1, wetness)) : defaultPlayer.gear.thermal.wetness;

  stripDerivedThermalFields(thermal, defaultPlayer.gear.thermal, state, "v7->v8");

  delete state.player.limits;
  return migrated;
}

/**
 * v8 -> v9：新增场景正文 FX 记忆表
 */
function migrateV8toV9(saveFile) {
  const migrated = { ...saveFile };
  if (!migrated.state || typeof migrated.state !== "object") migrated.state = {};
  migrated.state.sceneTextFxSeen = sanitizeSceneTextFxTable(migrated.state.sceneTextFxSeen);
  return migrated;
}

/**
 * v9 -> v10：拆分 scene text fx 的 viewed / animated 语义。
 * - 旧 sceneTextFxSeen 仅迁到 sceneTextFxViewed。
 * - sceneTextFxAnimated 重新初始化为空，避免旧脏资格污染 already_seen。
 */
function migrateV9toV10(saveFile) {
  const migrated = { ...saveFile };
  if (!migrated.state || typeof migrated.state !== "object") migrated.state = {};

  const state = migrated.state;
  const legacySeen = sanitizeSceneTextFxTable(state.sceneTextFxSeen);
  state.sceneTextFxViewed = mergeSceneTextFxTables(state.sceneTextFxViewed, legacySeen);
  state.sceneTextFxAnimated = sanitizeSceneTextFxTable(state.sceneTextFxAnimated);
  delete state.sceneTextFxSeen;
  appendMigrationNote(state, "v9->v10: sceneTextFxSeen migrated to sceneTextFxViewed; sceneTextFxAnimated reset for clean eligibility");
  return migrated;
}

function migrateV10toV11(saveFile) {
  const migrated = { ...saveFile };
  if (!migrated.state || typeof migrated.state !== "object") migrated.state = {};

  const state = migrated.state;
  const defaultPlayer = createDefaultPlayerState();
  if (!state.player || typeof state.player !== "object") {
    state.player = defaultPlayer;
  }
  if (!state.world || typeof state.world !== "object") {
    state.world = {};
  }
  state.player.equippedTools = normalizeEquippedTools(state.player.equippedTools);
  if (!state.player.physio || typeof state.player.physio !== "object") {
    state.player.physio = { ...defaultPlayer.physio };
  }
  state.player.physio.intakeLoad = state.player.physio.intakeLoad ?? defaultPlayer.physio.intakeLoad ?? 0;
  state.player.social = normalizeSocialState(
    state.player.social && typeof state.player.social === "object"
      ? state.player.social
      : createEmptySocialState()
  );
  state.world.npcs = withNpcEnabledDefaults(state.world.npcs, getAllNpcDefinitions());
  appendMigrationNote(state, "v10->v11: added player.physio.intakeLoad with default 0");
  appendMigrationNote(state, "v10->v11: added player.social and world.npcs social skeleton defaults");
  return migrated;
}

function migrateV11toV12(saveFile) {
  const migrated = { ...saveFile };
  if (!migrated.state || typeof migrated.state !== "object") migrated.state = {};

  const state = migrated.state;
  if (!state.world || typeof state.world !== "object") {
    state.world = {};
  }
  state.world.wilderness = normalizeWildernessState(state.world.wilderness);
  appendMigrationNote(state, "v11->v12: added world.wilderness session truth defaults");
  return migrated;
}

// ============================================================================
// 具体迁移函数
// ============================================================================

/**
 * v0 → v1：从无版本号到第一版
 * - 补齐所有缺失字段
 * - 规范化数据结构
 */
function migrateV0toV1(saveFile) {
  const migrated = { ...saveFile };
  
  // ========== 确保基础结构存在 ==========
  if (!migrated.meta) {
    migrated.meta = {
      slotId: "unknown",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  
  if (!migrated.state) {
    migrated.state = {};
  }
  
  const state = migrated.state;
  
  // ========== 时间系统 ==========
  if (typeof state.timeMinutes !== "number") {
    // 尝试从旧字段迁移
    if (state.time && typeof state.time.totalMinutes === "number") {
      state.timeMinutes = state.time.totalMinutes;
    } else if (state.time && typeof state.time.totalHours === "number") {
      state.timeMinutes = Math.round(state.time.totalHours * 60);
    } else {
      state.timeMinutes = 0;
    }
  }
  
  // 移除旧的嵌套结构（如果存在）
  delete state.time;
  
  // ========== 玩家状态 ==========
  if (!state.player) {
    state.player = createDefaultPlayerState();
  } else {
    // 补齐缺失字段
    const defaultPlayer = createDefaultPlayerState();
    
    if (!state.player.physio) {
      state.player.physio = defaultPlayer.physio;
    } else {
      state.player.physio.satiety = state.player.physio.satiety ?? 100;
      state.player.physio.stamina = state.player.physio.stamina ?? 100;
    }
    
    if (!state.player.psycho) {
      state.player.psycho = defaultPlayer.psycho;
    } else {
      state.player.psycho.hp = state.player.psycho.hp ?? 100;
      state.player.psycho.fatigue = state.player.psycho.fatigue ?? 100;
    }
    
    if (!state.player.extra) {
      state.player.extra = {};
    }
    
    if (!state.player.meta) {
      state.player.meta = defaultPlayer.meta;
    }
    
    // 移除不应保存的字段
    delete state.player.limits;
  }
  
  // ========== 世界状态 ==========
  if (!state.world) {
    state.world = {
      regionId: "CambCity",
      money: 0,
      sun: 0,
      snowfallRate: 0,
      windSpeed: 0,
      tEnv: -10,
      calendar: getDefaultWorldCalendar()
    };
  } else {
    state.world.regionId = state.world.regionId ?? "CambCity";
    if (typeof state.world.money !== "number" || !Number.isFinite(state.world.money)) {
      state.world.money = 0;
    }
    state.world.sun = state.world.sun ?? 0;
    state.world.snowfallRate = state.world.snowfallRate ?? 0;
    state.world.windSpeed = state.world.windSpeed ?? 0;
    state.world.tEnv = state.world.tEnv ?? -10;
    state.world.calendar = normalizeWorldCalendar(state.world.calendar || getDefaultWorldCalendar());
  }
  
  // ========== 地图位置 ==========
  if (typeof state.currentMapId !== "string") {
    state.currentMapId = "menu";
  }
  
  // ========== 剧情标记 ==========
  if (!state.flags || typeof state.flags !== "object") {
    state.flags = {};
  }
  
  // ========== 日志 ==========
  if (!Array.isArray(state.logLines)) {
    state.logLines = [];
  }
  
  // ========== RNG 状态 ==========
  if (!state.rng) {
    state.rng = null;
  }
  
  // ========== 移除废弃字段 ==========
  delete state.ui;
  delete state.debug;
  delete state.currentMap;
  delete state.playerLegacy;
  
  return migrated;
}

/**
 * 检查存档是否需要迁移
 * @param {object} saveFile - 存档文件
 * @returns {boolean} 是否需要迁移
 */
export function needsMigration(saveFile) {
  if (!saveFile || typeof saveFile !== "object") {
    return false;
  }
  
  const version = saveFile.schemaVersion ?? 0;
  return version < SAVE_SCHEMA_VERSION;
}

/**
 * 获取迁移路径描述（用于日志）
 * @param {number} fromVersion - 起始版本
 * @param {number} toVersion - 目标版本
 * @returns {string} 迁移路径描述
 */
export function getMigrationPath(fromVersion, toVersion) {
  const steps = [];
  for (let v = fromVersion; v < toVersion; v++) {
    steps.push(`v${v} → v${v + 1}`);
  }
  return steps.join(" → ");
}
