import { BUILD } from "../version.js";
import { createEmptyAchievementState, normalizeAchievementState } from "../engine/achievement_profile_persistence.js";
import { getDefaultWorldCalendar, normalizeWorldCalendar } from "../engine/calendar_model.js";
import { normalizeEquippedTools } from "../engine/items_db.js";
import { normalizeMedicalState } from "../engine/medical_state.js";
import { ensureProfileShape } from "../engine/profile/read.js";
import { createEmptyRecordState, normalizeRecordState } from "../engine/records/record_state.js";
import { getAllNpcDefinitions } from "../engine/social/npc_registry.js";
import { createEmptySocialState, createEmptyNpcWorldState, normalizeSocialState, withNpcEnabledDefaults } from "../engine/social/social_state.js";
import { BUS_ONBOARD_MAP_ID } from "../engine/transit/transit_service.js";
import {
  createDefaultWildernessState,
  sanitizeWildernessStateForSave
} from "../engine/wilderness/wilderness_state.js";

// ============================================================================
// 存档数据结构定义（Schema）
// ============================================================================
// 设计原则：
// 1. 存档只包含纯数据（plain objects），不包含方法、DOM、派生字段
// 2. 使用 schemaVersion 支持版本迁移
// 3. 提供 sanitize 功能，自动剔除不应保存的字段
// ============================================================================

/**
 * 当前存档格式版本号
 * 每次修改 GameStateSnapshot 结构时递增
 */
export const SAVE_SCHEMA_VERSION = BUILD.saveSchemaVersion;

/**
 * 存档键名前缀配置
 */
export const SAVE_KEYS = {
  // 主存档键（slotId 为 1、2、3 等）
  slotMain: (slotId) => `CambridgeCity_Save_Slot_${slotId}`,
  
  // 备份存档键
  slotBackup: (slotId) => `CambridgeCity_Save_Slot_${slotId}_BAK`,
  
  // 元数据（可选：存储所有槽位的简要信息，加速列表显示）
  metadata: "CambridgeCity_Save_Metadata"
};

const DEFAULT_EQUIPMENT = {
  upper: null,
  lining: null,
  lower: null,
  shoes: null,
  goggles: null,
  head: null,
  hands: null,
  neck: null,
  backpack: null
};

const DEFAULT_GEAR = {
  thermal: {
    warmthRating: 0.8,
    wetness: 0,
    windproof: 0,
    waterproof: 0,
    insulationEff: 0,
    windproofEff: 0,
    protectionScore: 0
  }
};

const DEFAULT_EXPOSURE = {
  hypo100: 100,
  incapacitated: false,
  dead: false
};

const DEFAULT_LIMITS = {
  hpMax: 100,
  satietyMax: 100,
  staminaMax: 100,
  fatigueMax: 100
};

const DEFAULT_RECORDS = createEmptyRecordState();
const DEFAULT_SOCIAL = createEmptySocialState();
const DEFAULT_ACHIEVEMENTS = createEmptyAchievementState();
const DEFAULT_TRANSIT = Object.freeze({
  ride: null
});
const DEFAULT_WORLD_NPCS = withNpcEnabledDefaults(createEmptyNpcWorldState(), getAllNpcDefinitions());

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeTransitRide(ride) {
  if (!ride || typeof ride !== "object" || Array.isArray(ride)) return null;

  const lineId = String(ride.lineId || "").trim();
  const currentStopId = String(ride.currentStopId || "").trim();
  const nextStopId = String(ride.nextStopId || "").trim();
  const direction = Number(ride.direction);
  const isOnboard = ride.isOnboard !== false;

  if (!lineId || !currentStopId) return null;
  if (direction !== 1 && direction !== -1) return null;
  if (!isOnboard) return null;

  return {
    lineId,
    direction,
    currentStopId,
    nextStopId: nextStopId || null,
    isOnboard: true
  };
}

function normalizeTransitState(rawTransit) {
  if (!rawTransit || typeof rawTransit !== "object" || Array.isArray(rawTransit)) {
    return deepClone(DEFAULT_TRANSIT);
  }

  return {
    ride: normalizeTransitRide(rawTransit.ride)
  };
}

function sanitizeSceneTextFxTable(rawTable, limit = 600) {
  if (!rawTable || typeof rawTable !== "object" || Array.isArray(rawTable)) return {};
  const normalized = [];
  for (const [rawKey, rawValue] of Object.entries(rawTable)) {
    const key = String(rawKey || "").trim();
    if (!key) continue;
    const n = Number(rawValue);
    if (Number.isFinite(n) && n > 0) {
      normalized.push([key, Math.trunc(n)]);
      continue;
    }
    if (rawValue === 1 || rawValue === true || rawValue === "1") {
      normalized.push([key, 1]);
    }
  }
  normalized.sort((a, b) => Number(b[1]) - Number(a[1]));
  const max = Math.max(20, Math.trunc(Number(limit) || 600));
  return Object.fromEntries(normalized.slice(0, max));
}

function isMenuMapId(mapId) {
  const id = String(mapId || "");
  return id === "menu" || id === "menu_more" || id.startsWith("menu_");
}

export { isMenuMapId };

function resolveSnapshotFlags(gameState) {
  const topLevelFlags = gameState?.flags && typeof gameState.flags === "object" && !Array.isArray(gameState.flags)
    ? deepClone(gameState.flags)
    : {};
  const worldFlags = gameState?.world?.flags && typeof gameState.world.flags === "object" && !Array.isArray(gameState.world.flags)
    ? deepClone(gameState.world.flags)
    : {};
  return {
    ...topLevelFlags,
    ...worldFlags
  };
}

function resolveSnapshotMapId(gameState) {
  if (gameState?.player?.transit?.ride) {
    return BUS_ONBOARD_MAP_ID;
  }
  const currentMapId = String(gameState?.currentMapId || gameState?.world?.currentMapId || "menu_main").trim();
  const returnMapId = String(gameState?.ui?.menuReturnMapId || "").trim();
  if (isMenuMapId(currentMapId) && isNonEmptyString(returnMapId) && !isMenuMapId(returnMapId)) {
    return returnMapId;
  }
  return isNonEmptyString(currentMapId) ? currentMapId : "menu_main";
}

export { resolveSnapshotMapId };

export function makeEmptySnapshot(gameState, options = {}) {
  const includeLegacyAchievements = options?.includeLegacyAchievements === true;
  const snapshotMapId = resolveSnapshotMapId(gameState);
  const physio = deepClone(gameState?.player?.physio) || { satiety: 100, intakeLoad: 0, stamina: 100, temperatureC: 37 };
  if (!Number.isFinite(Number(physio.intakeLoad))) {
    physio.intakeLoad = 0;
  }
  if (!Number.isFinite(Number(physio.temperatureC))) {
    physio.temperatureC = 37;
  }

  const psycho = deepClone(gameState?.player?.psycho) || { hp: 100, fatigue: 100, hypothermia: 100, hypoStage: "Safe" };
  if (!Number.isFinite(Number(psycho.hypothermia))) {
    psycho.hypothermia = 100;
  }
  if (typeof psycho.hypoStage !== "string" || psycho.hypoStage.trim() === "") {
    psycho.hypoStage = "Safe";
  }

  const flags = resolveSnapshotFlags(gameState);
  const gear = deepClone(gameState?.player?.gear) || deepClone(DEFAULT_GEAR);
  if (!gear.thermal || typeof gear.thermal !== "object") {
    gear.thermal = deepClone(DEFAULT_GEAR.thermal);
  } else {
    gear.thermal = {
      ...deepClone(DEFAULT_GEAR.thermal),
      ...deepClone(gear.thermal)
    };
  }

  const exposure = deepClone(gameState?.player?.exposure) || deepClone(DEFAULT_EXPOSURE);
  const limits = deepClone(gameState?.player?.limits) || deepClone(DEFAULT_LIMITS);
  const profile = ensureProfileShape(gameState?.player?.profile);

  return {
    time: {
      totalMinutes: toInt(gameState?.time?.totalMinutes, 0)
    },
    player: {
      physio,
      psycho,
      inventory: Array.isArray(gameState?.player?.inventory) ? deepClone(gameState.player.inventory) : [],
      equipment: deepClone(gameState?.player?.equipment) || deepClone(DEFAULT_EQUIPMENT),
      equippedTools: normalizeEquippedTools(deepClone(gameState?.player?.equippedTools)),
      gear,
      exposure,
      limits,
      profile,
      tasks: Array.isArray(gameState?.player?.tasks) ? deepClone(gameState.player.tasks) : [],
      records: normalizeRecordState(gameState?.player?.records ?? DEFAULT_RECORDS),
      social: normalizeSocialState(gameState?.player?.social ?? DEFAULT_SOCIAL),
      ...(includeLegacyAchievements
        ? { achievements: normalizeAchievementState(gameState?.player?.achievements ?? DEFAULT_ACHIEVEMENTS) }
        : {}),
      transit: normalizeTransitState(gameState?.player?.transit ?? DEFAULT_TRANSIT),
      extra: deepClone(gameState?.player?.extra) || {},
      meta: deepClone(gameState?.player?.meta) || { day: 1, daily: { sleepFatigueRecovered: 0 } }
    },
    world: {
      regionId: String(gameState?.world?.regionId || "CambCity"),
      money: Number.isFinite(Number(gameState?.world?.money)) ? Number(gameState.world.money) : 0,
      sun: Number.isFinite(Number(gameState?.world?.sun)) ? Number(gameState.world.sun) : 0,
      snowfallRate: Number.isFinite(Number(gameState?.world?.snowfallRate)) ? Number(gameState.world.snowfallRate) : 0,
      windSpeed: Number.isFinite(Number(gameState?.world?.windSpeed)) ? Number(gameState.world.windSpeed) : 0,
      tEnv: Number.isFinite(Number(gameState?.world?.tEnv)) ? Number(gameState.world.tEnv) : -10,
      calendar: normalizeWorldCalendar(deepClone(gameState?.world?.calendar) || getDefaultWorldCalendar()),
      weather: deepClone(gameState?.world?.weather) || {},
      medical: normalizeMedicalState(gameState?.world?.medical),
      npcs: withNpcEnabledDefaults(gameState?.world?.npcs ?? DEFAULT_WORLD_NPCS, getAllNpcDefinitions()),
      refData: deepClone(gameState?.world?.refData) || { places: {} },
      currentMapId: snapshotMapId,
      mapStack: Array.isArray(gameState?.world?.mapStack) ? deepClone(gameState.world.mapStack) : [],
      flags,
      wilderness: sanitizeWildernessStateForSave(gameState?.world?.wilderness ?? createDefaultWildernessState())
    },
    currentMapId: snapshotMapId,
    previousMapId: isNonEmptyString(gameState?.previousMapId) ? String(gameState.previousMapId) : null,
    flags,
    logLines: Array.isArray(gameState?.logLines) ? deepClone(gameState.logLines).slice(-200) : [],
    meta: {
      startedAt: String(gameState?.meta?.startedAt || new Date().toISOString()),
      saveSlotId: gameState?.meta?.saveSlotId ?? null,
      lastAutoSaveDay: toInt(gameState?.meta?.lastAutoSaveDay, 0),
      lastAutoSaveMinute: toInt(gameState?.meta?.lastAutoSaveMinute, 0)
    },
    rng: gameState?.rng ?? null,
    npcs: deepClone(gameState?.npcs) || {},
    sceneTextFxAnimated: sanitizeSceneTextFxTable(gameState?.sceneTextFxAnimated),
    sceneTextFxViewed: sanitizeSceneTextFxTable(gameState?.sceneTextFxViewed)
  };
}

/**
 * 清理快照，移除任何非纯数据字段
 * @param {object} snapshot - 待清理的快照
 * @returns {object} 清理后的快照
 */
export function sanitizeSnapshot(snapshot) {
  const sourceSnapshot = snapshot && typeof snapshot === "object" ? snapshot : {};
  const base = makeEmptySnapshot(sourceSnapshot, { includeLegacyAchievements: true });

  const mapId = isNonEmptyString(base.currentMapId)
    ? base.currentMapId.trim()
    : (isNonEmptyString(base.world?.currentMapId) ? base.world.currentMapId.trim() : "menu_main");

  const flags = resolveSnapshotFlags(base);

  base.currentMapId = mapId;
  if (base.world && typeof base.world === "object") {
    base.world.currentMapId = mapId;
    base.world.flags = deepClone(flags);
    base.world.calendar = normalizeWorldCalendar(base.world.calendar || getDefaultWorldCalendar());
    base.world.medical = normalizeMedicalState(base.world.medical);
    base.world.npcs = withNpcEnabledDefaults(base.world.npcs ?? DEFAULT_WORLD_NPCS, getAllNpcDefinitions());
    if (base.world.weather && typeof base.world.weather === "object") {
      delete base.world.weather.sunLevel;
      delete base.world.weather.lightPhase;
      delete base.world.weather.visibilityBand;
      delete base.world.weather.isDarkLike;
    }
    base.world.wilderness = sanitizeWildernessStateForSave(
      sourceSnapshot?.world?.wilderness ?? base.world.wilderness ?? createDefaultWildernessState()
    );
  }

  base.flags = deepClone(flags);
  base.sceneTextFxAnimated = sanitizeSceneTextFxTable(base.sceneTextFxAnimated);
  base.sceneTextFxViewed = sanitizeSceneTextFxTable(base.sceneTextFxViewed);
  delete base.sceneTextFxSeen;

  base.time.totalMinutes = toInt(base.time?.totalMinutes, 0);
  if (!base.player || typeof base.player !== "object") {
    base.player = {};
  }
  base.player.equippedTools = normalizeEquippedTools(base.player.equippedTools);
  base.player.records = normalizeRecordState(base.player.records ?? DEFAULT_RECORDS);
  base.player.social = normalizeSocialState(base.player.social ?? DEFAULT_SOCIAL);
  if (Object.prototype.hasOwnProperty.call(sourceSnapshot?.player || {}, "achievements")) {
    // Legacy compatibility only: old saves may still contain snapshot.player.achievements.
    base.player.achievements = normalizeAchievementState(sourceSnapshot?.player?.achievements ?? DEFAULT_ACHIEVEMENTS);
  } else {
    delete base.player.achievements;
  }
  base.player.transit = normalizeTransitState(base.player.transit ?? DEFAULT_TRANSIT);
  if (base.meta && typeof base.meta === "object") {
    base.meta.lastAutoSaveDay = toInt(base.meta.lastAutoSaveDay, 0);
    base.meta.lastAutoSaveMinute = toInt(base.meta.lastAutoSaveMinute, 0);
  }

  return base;
}

/**
 * 辅助函数：数值四舍五入到指定小数位
 * @param {number} value - 数值
 * @param {number} decimals - 小数位数
 * @returns {number} 四舍五入后的值
 */
function roundTo(value, decimals) {
  if (typeof value !== "number" || isNaN(value)) {
    return 0;
  }
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * 验证快照格式是否合法
 * @param {object} snapshot - 快照对象
 * @returns {boolean} 是否合法
 */
export function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (!snapshot.time || !Number.isInteger(snapshot.time.totalMinutes)) return false;
  if (!isNonEmptyString(snapshot.currentMapId)) return false;
  if (!snapshot.player || typeof snapshot.player !== "object") return false;
  if (!snapshot.player.physio || typeof snapshot.player.physio !== "object") return false;
  if (!snapshot.player.psycho || typeof snapshot.player.psycho !== "object") return false;
  if (!Array.isArray(snapshot.player.inventory)) return false;
  if (!Array.isArray(snapshot.player.equippedTools)) return false;
  if (!snapshot.player.equipment || typeof snapshot.player.equipment !== "object") return false;
  if (!snapshot.player.gear || typeof snapshot.player.gear !== "object") return false;
  if (!snapshot.player.gear.thermal || typeof snapshot.player.gear.thermal !== "object") return false;
  if (!snapshot.player.profile || typeof snapshot.player.profile !== "object") return false;
  if (!Array.isArray(snapshot.player.tasks)) return false;
  if (!snapshot.player.records || typeof snapshot.player.records !== "object" || Array.isArray(snapshot.player.records)) return false;
  if (!snapshot.player.social || typeof snapshot.player.social !== "object" || Array.isArray(snapshot.player.social)) return false;
  if (snapshot.player.achievements != null && (typeof snapshot.player.achievements !== "object" || Array.isArray(snapshot.player.achievements))) return false;
  if (!snapshot.player.transit || typeof snapshot.player.transit !== "object" || Array.isArray(snapshot.player.transit)) return false;
  if (!snapshot.player.records.byId || typeof snapshot.player.records.byId !== "object" || Array.isArray(snapshot.player.records.byId)) return false;
  if (!Array.isArray(snapshot.player.records.order)) return false;
  if (!snapshot.player.social.byNpcId || typeof snapshot.player.social.byNpcId !== "object" || Array.isArray(snapshot.player.social.byNpcId)) return false;
  if (!Array.isArray(snapshot.player.social.order)) return false;
  if (!snapshot.world || typeof snapshot.world !== "object") return false;
  if (!snapshot.world.npcs || typeof snapshot.world.npcs !== "object" || Array.isArray(snapshot.world.npcs)) return false;
  if (!snapshot.world.npcs.enabledById || typeof snapshot.world.npcs.enabledById !== "object" || Array.isArray(snapshot.world.npcs.enabledById)) return false;
  if (!isNonEmptyString(snapshot.world.currentMapId)) return false;
  if (!snapshot.flags || typeof snapshot.flags !== "object" || Array.isArray(snapshot.flags)) return false;
  if (!Array.isArray(snapshot.logLines)) return false;
  if (!snapshot.meta || typeof snapshot.meta !== "object") return false;
  if (snapshot.sceneTextFxAnimated != null && (typeof snapshot.sceneTextFxAnimated !== "object" || Array.isArray(snapshot.sceneTextFxAnimated))) return false;
  if (snapshot.sceneTextFxViewed != null && (typeof snapshot.sceneTextFxViewed !== "object" || Array.isArray(snapshot.sceneTextFxViewed))) return false;
  return true;
}

export function makeSaveFile(slotId, snapshotState, savedAtMs = Date.now()) {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: Number.isFinite(Number(savedAtMs)) ? Math.trunc(Number(savedAtMs)) : Date.now(),
    slotId: String(slotId),
    state: snapshotState
  };
}

export function validateSaveFile(saveFile) {
  if (!saveFile || typeof saveFile !== "object") return false;
  if (!Number.isInteger(Number(saveFile.schemaVersion))) return false;
  if (!Number.isInteger(Number(saveFile.savedAt))) return false;
  if (!isNonEmptyString(saveFile.slotId)) return false;
  if (!validateSnapshot(saveFile.state)) return false;
  return true;
}
