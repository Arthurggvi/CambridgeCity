import { storage } from "./storage_local.js";
import {
  SAVE_SCHEMA_VERSION,
  SAVE_KEYS,
  makeEmptySnapshot,
  isMenuMapId,
  resolveSnapshotMapId,
  sanitizeSnapshot,
  validateSnapshot,
  makeSaveFile,
  validateSaveFile
} from "./save_schema.js";
import { migrateSaveFile, needsMigration, getMigrationPath } from "./migrations.js";
import { normalizeAchievementState } from "../engine/achievement_profile_persistence.js";

const SLOT_INDEX_KEY = "CambridgeCity_Save_Slot_Index";
const SLOT_NAME_KEY = "CambridgeCity_Save_Slot_Names";

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function snapshotSummary(snapshot = {}) {
  const totalMinutes = Number(snapshot?.time?.totalMinutes ?? 0);
  const day = Math.floor(Math.max(0, totalMinutes) / 1440) + 1;
  const currentMapId = String(snapshot?.currentMapId || snapshot?.world?.currentMapId || "menu_main");
  const flagsCount = snapshot?.flags && typeof snapshot.flags === "object" && !Array.isArray(snapshot.flags)
    ? Object.keys(snapshot.flags).length
    : 0;
  const logLinesCount = Array.isArray(snapshot?.logLines) ? snapshot.logLines.length : 0;
  return {
    totalMinutes,
    day,
    currentMapId,
    flagsCount,
    logLinesCount
  };
}

function resolveAuditDay(totalMinutes) {
  return Math.floor(Math.max(0, Number(totalMinutes) || 0) / 1440) + 1;
}

function getWriteKind(slotId) {
  return slotId === "auto" ? "auto" : "manual";
}

function buildSaveAuditEnvelope(slotId, gameState, options = {}) {
  const normalizedSlotId = slotLabel(slotId);
  const totalMinutes = Number(gameState?.time?.totalMinutes ?? 0);
  const currentMapId = String(gameState?.currentMapId || gameState?.world?.currentMapId || "").trim();
  const previousMapId = String(gameState?.previousMapId || "").trim() || null;
  const menuReturnMapId = String(gameState?.ui?.menuReturnMapId || "").trim() || null;
  const effectiveMapId = resolveSnapshotMapId(gameState);
  const liveMapId = String(gameState?.currentMap?.id || "").trim() || null;
  return {
    actionId: String(options?.sourceActionId || options?.actionId || "unknown").trim() || "unknown",
    slotId: normalizedSlotId,
    isAuto: normalizedSlotId === "auto",
    writeKind: getWriteKind(normalizedSlotId),
    currentMapId: currentMapId || null,
    effectiveMapId: effectiveMapId || null,
    liveMapId,
    previousMapId,
    menuReturnMapId,
    inMenu: isMenuMapId(currentMapId),
    uiPage: String(gameState?.ui?.page || "").trim() || null,
    day: resolveAuditDay(totalMinutes),
    totalMinutes,
    result: "pending",
    reasonCode: "pending",
    details: null
  };
}

function emitSaveAudit(audit) {
  const msg = `[SaveAudit] actionId=${audit.actionId} slotId=${audit.slotId} isAuto=${audit.isAuto ? "yes" : "no"} currentMapId=${audit.currentMapId || "null"} effectiveMapId=${audit.effectiveMapId || "null"} previousMapId=${audit.previousMapId || "null"} ui.menuReturnMapId=${audit.menuReturnMapId || "null"} inMenu=${audit.inMenu ? "yes" : "no"} day=${audit.day} totalMinutes=${audit.totalMinutes} result=${audit.result} reason=${audit.reasonCode}`;
  if (audit.result === "written") {
    console.info(msg, audit);
    return;
  }
  console.warn(msg, audit);
}

function hasRequiredGameplayState(gameState) {
  const totalMinutes = Number(gameState?.time?.totalMinutes);
  const hp = Number(gameState?.player?.psycho?.hp);
  const fatigue = Number(gameState?.player?.psycho?.fatigue);
  const satiety = Number(gameState?.player?.physio?.satiety);
  const stamina = Number(gameState?.player?.physio?.stamina);
  return Number.isFinite(totalMinutes)
    && Number.isFinite(hp)
    && Number.isFinite(fatigue)
    && Number.isFinite(satiety)
    && Number.isFinite(stamina)
    && !!gameState?.world
    && typeof gameState.world === "object";
}

export function isPlayerDead(gameState) {
  const hp = Number(gameState?.player?.psycho?.hp ?? gameState?.player?.hp);
  return Number.isFinite(hp) && hp <= 0;
}

function validateManualSaveGate(gameState, audit) {
  if (!hasRequiredGameplayState(gameState)) {
    return { ok: false, reasonCode: "missing_gameplay_state", error: "当前状态缺少关键玩法字段，无法写入手动存档" };
  }

  const rawMapId = String(gameState?.currentMapId || gameState?.world?.currentMapId || "").trim();
  const liveMapId = String(gameState?.currentMap?.id || "").trim();
  const returnMapId = String(gameState?.ui?.menuReturnMapId || "").trim();
  const effectiveMapId = String(audit?.effectiveMapId || "").trim();

  if (!rawMapId) {
    return { ok: false, reasonCode: "missing_current_map_id", error: "当前地图缺失，无法写入手动存档" };
  }

  if (isMenuMapId(rawMapId)) {
    if (rawMapId !== "menu_load") {
      return { ok: false, reasonCode: "menu_surface_blocked", error: "菜单页状态不可写入手动存档" };
    }
    if (!returnMapId || isMenuMapId(returnMapId)) {
      return { ok: false, reasonCode: "menu_surface_no_game_context", error: "主菜单来源的读取页不可写入手动存档" };
    }
  }

  if (!effectiveMapId) {
    return { ok: false, reasonCode: "missing_effective_map_id", error: "缺少可保存的目标地图，无法写入手动存档" };
  }

  if (isMenuMapId(effectiveMapId)) {
    return { ok: false, reasonCode: "effective_menu_map_blocked", error: "菜单态快照不可写入手动存档" };
  }

  if (!liveMapId) {
    return { ok: false, reasonCode: "missing_loaded_map", error: "当前地图资源未加载完成，无法写入手动存档" };
  }

  if (isMenuMapId(rawMapId) && liveMapId !== rawMapId) {
    return { ok: false, reasonCode: "menu_surface_map_mismatch", error: "菜单态当前地图与已加载地图不一致，拒绝保存" };
  }

  if (!isMenuMapId(rawMapId) && liveMapId !== rawMapId) {
    return { ok: false, reasonCode: "loaded_map_mismatch", error: "当前地图与已加载地图不一致，拒绝保存" };
  }

  return { ok: true, reasonCode: isMenuMapId(rawMapId) ? "anchored_from_menu_load" : "gameplay_state_ok" };
}

export function validateAutoSaveGate(gameState) {
  if (!hasRequiredGameplayState(gameState)) {
    return { ok: false, reasonCode: "missing_gameplay_state", error: "当前状态缺少关键玩法字段，无法写入自动存档" };
  }
  if (isPlayerDead(gameState)) {
    return { ok: false, reasonCode: "autosave_vetoed_dead_player", error: "玩家已死亡，自动存档已拒绝" };
  }
  const effectiveMapId = String(resolveSnapshotMapId(gameState) || "").trim();
  if (!effectiveMapId) {
    return { ok: false, reasonCode: "missing_effective_map_id", error: "缺少可保存的目标地图，无法写入自动存档" };
  }
  if (isMenuMapId(effectiveMapId)) {
    return { ok: false, reasonCode: "effective_menu_map_blocked", error: "菜单态快照不可写入自动存档" };
  }
  return { ok: true, reasonCode: "auto_state_ok" };
}

function validateWriteRequest(slotId, gameState, options = {}) {
  const audit = buildSaveAuditEnvelope(slotId, gameState, options);
  const gate = audit.isAuto
    ? validateAutoSaveGate(gameState)
    : validateManualSaveGate(gameState, audit);
  if (!gate.ok) {
    audit.result = "rejected";
    audit.reasonCode = gate.reasonCode;
    audit.details = gate.error;
  }
  return { audit, gate };
}

function validateSlotSemanticState(slotId, snapshotState) {
  const normalizedSlotId = slotLabel(slotId);
  const currentMapId = String(snapshotState?.currentMapId || snapshotState?.world?.currentMapId || "").trim();
  const worldMapId = String(snapshotState?.world?.currentMapId || "").trim();
  const totalMinutes = Number(snapshotState?.time?.totalMinutes);
  const hp = Number(snapshotState?.player?.psycho?.hp);
  const fatigue = Number(snapshotState?.player?.psycho?.fatigue);
  const satiety = Number(snapshotState?.player?.physio?.satiety);
  const stamina = Number(snapshotState?.player?.physio?.stamina);

  if (normalizedSlotId !== "auto" && isMenuMapId(currentMapId)) {
    return { ok: false, reasonCode: "manual_menu_snapshot", error: "无效手动档：菜单态快照" };
  }
  if (!currentMapId || !worldMapId || currentMapId !== worldMapId) {
    return { ok: false, reasonCode: "snapshot_map_mismatch", error: "无效存档：地图字段不一致" };
  }
  if (!Number.isFinite(totalMinutes) || !Number.isFinite(hp) || !Number.isFinite(fatigue) || !Number.isFinite(satiety) || !Number.isFinite(stamina)) {
    return { ok: false, reasonCode: "snapshot_missing_gameplay_state", error: "无效存档：关键玩法字段缺失" };
  }
  return { ok: true, reasonCode: normalizedSlotId === "auto" ? "auto_snapshot_ok" : "manual_snapshot_ok" };
}

function isSupportedSchema(schemaVersion) {
  if (schemaVersion == null) return true;
  const n = Number(schemaVersion);
  if (!Number.isFinite(n)) return false;
  return n <= SAVE_SCHEMA_VERSION;
}

function normalizeLoadedSnapshot(snapshot) {
  const clean = sanitizeSnapshot(snapshot || {});
  if (!validateSnapshot(clean)) {
    throw new Error("快照校验失败：关键字段缺失或类型错误");
  }
  return clean;
}

function parseAndUpgradeSaveFile(rawJson) {
  const parsed = safeParse(rawJson);
  if (!parsed) {
    throw new Error("JSON 解析失败");
  }

  if (!isSupportedSchema(parsed.schemaVersion)) {
    throw new Error("版本不兼容");
  }

  let saveFile = parsed;
  if (needsMigration(saveFile)) {
    const oldVersion = Number(saveFile.schemaVersion ?? 0);
    console.log(`[存档迁移] 需要迁移：${getMigrationPath(oldVersion, SAVE_SCHEMA_VERSION)}`);
    saveFile = migrateSaveFile(saveFile);
  }

  if (!saveFile?.state || typeof saveFile.state !== "object") {
    throw new Error("存档缺少 state 字段");
  }

  const cleanState = normalizeLoadedSnapshot(saveFile.state);
  const normalizedSaveFile = makeSaveFile(saveFile.slotId ?? "unknown", cleanState, saveFile.savedAt ?? Date.now());
  normalizedSaveFile.schemaVersion = SAVE_SCHEMA_VERSION;

  if (!validateSaveFile(normalizedSaveFile)) {
    throw new Error("SaveFile 校验失败");
  }

  return normalizedSaveFile;
}

function buildSlotPreview(slotId, saveFile) {
  const state = saveFile?.state || {};
  const totalMinutes = Number(state?.time?.totalMinutes ?? 0);
  return {
    slotId,
    isAuto: slotId === "auto",
    isEmpty: false,
    updatedAt: new Date(Number(saveFile?.savedAt || Date.now())).toISOString(),
    createdAt: new Date(Number(saveFile?.savedAt || Date.now())).toISOString(),
    playtimeMinutes: totalMinutes,
    day: Math.floor(Math.max(0, totalMinutes) / 1440) + 1,
    hp: state?.player?.psycho?.hp ?? 0,
    satiety: state?.player?.physio?.satiety ?? 0,
    stamina: state?.player?.physio?.stamina ?? 0,
    fatigue: state?.player?.psycho?.fatigue ?? 0,
    location: state?.currentMapId || state?.world?.currentMapId || "未知"
  };
}

function slotLabel(slotId) {
  return slotId === "auto" ? "auto" : String(slotId);
}

function normalizeSlotIdForIndex(slotId) {
  if (slotId === "auto") return "auto";
  const n = typeof slotId === "number" ? slotId : parseInt(String(slotId), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function normalizeSlotIndex(index) {
  const unique = new Set();
  const numeric = [];
  for (const it of Array.isArray(index) ? index : []) {
    const normalized = normalizeSlotIdForIndex(it);
    if (normalized == null) continue;
    if (normalized === "auto") continue;
    if (unique.has(normalized)) continue;
    unique.add(normalized);
    numeric.push(normalized);
  }
  numeric.sort((a, b) => a - b);
  return ["auto", ...numeric];
}

function normalizeDisplayName(name) {
  const text = String(name ?? "").trim();
  if (!text) return "";
  return text.slice(0, 24);
}

export class SaveManager {
  constructor() {
    this.storage = storage;
  }

  _readSlotIndex() {
    const raw = this.storage.read(SLOT_INDEX_KEY);
    if (!raw) return null;
    const parsed = safeParse(raw);
    if (!Array.isArray(parsed)) return null;
    const normalized = normalizeSlotIndex(parsed);
    if (normalized.length === 0 || normalized[0] !== "auto") return null;
    return normalized;
  }

  _writeSlotIndex(index) {
    const normalized = normalizeSlotIndex(index);
    this.storage.write(SLOT_INDEX_KEY, JSON.stringify(normalized));
    return normalized;
  }

  _readSlotNames() {
    const raw = this.storage.read(SLOT_NAME_KEY);
    if (!raw) return {};
    const parsed = safeParse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      const normalizedId = normalizeSlotIdForIndex(k);
      if (normalizedId == null || normalizedId === "auto") continue;
      const normalizedName = normalizeDisplayName(v);
      if (!normalizedName) continue;
      out[String(normalizedId)] = normalizedName;
    }
    return out;
  }

  _writeSlotNames(map) {
    const safeMap = map && typeof map === "object" ? map : {};
    this.storage.write(SLOT_NAME_KEY, JSON.stringify(safeMap));
    return safeMap;
  }

  _displayNameFor(slotId, slotNames) {
    if (slotId === "auto") return "AUTO";
    const key = String(slotId);
    const custom = normalizeDisplayName(slotNames?.[key]);
    return custom || `槽位 ${slotId}`;
  }

  _scanSlotIndexFromStorage() {
    const keys = this.storage.listKeys("CambridgeCity_Save_Slot_");
    const slotIds = [];
    for (const key of keys) {
      if (!key) continue;
      if (key.endsWith("_BAK")) continue;
      if (key === "CambridgeCity_Save_Slot_Metadata") continue;
      if (!key.startsWith("CambridgeCity_Save_Slot_")) continue;
      const suffix = key.slice("CambridgeCity_Save_Slot_".length);
      const slotId = normalizeSlotIdForIndex(suffix);
      if (slotId == null) continue;
      slotIds.push(slotId);
    }

    const hasAnyNumeric = slotIds.some(x => x !== "auto");
    const base = hasAnyNumeric ? slotIds : ["auto", 1, 2, 3];
    return normalizeSlotIndex(base);
  }

  _getOrInitSlotIndex() {
    const existing = this._readSlotIndex();
    if (existing) return existing;
    const migrated = this._scanSlotIndexFromStorage();
    return this._writeSlotIndex(migrated);
  }

  _ensureSlotExistsInIndex(slotId) {
    const normalized = normalizeSlotIdForIndex(slotId);
    if (normalized == null) return null;
    const index = this._getOrInitSlotIndex();
    if (normalized === "auto") {
      if (index[0] !== "auto") {
        return this._writeSlotIndex(["auto", ...index.filter(x => x !== "auto")]);
      }
      return index;
    }
    if (index.includes(normalized)) return index;
    return this._writeSlotIndex([...index, normalized]);
  }

  listSlotIds() {
    return this._getOrInitSlotIndex();
  }

  addSlot() {
    const index = this._getOrInitSlotIndex();
    const used = new Set(index.filter(x => x !== "auto"));
    let next = 1;
    while (used.has(next)) next++;
    this._writeSlotIndex([...index, next]);
    return { ok: true, slotId: next };
  }

  saveToSlot(slotId, gameState, options = {}) {
    try {
      const normalizedSlotId = slotLabel(slotId);
      const { audit, gate } = validateWriteRequest(normalizedSlotId, gameState, options);
      if (!gate.ok) {
        emitSaveAudit(audit);
        return { ok: false, error: gate.error, audit };
      }

      this._ensureSlotExistsInIndex(normalizedSlotId);
      const snapshot = sanitizeSnapshot(makeEmptySnapshot(gameState));
      if (!validateSnapshot(snapshot)) {
        audit.result = "rejected";
        audit.reasonCode = "snapshot_validation_failed";
        audit.details = "快照验证失败：数据不完整";
        emitSaveAudit(audit);
        return { ok: false, error: "快照验证失败：数据不完整", audit };
      }

      const saveFile = makeSaveFile(normalizedSlotId, snapshot, Date.now());
      if (!validateSaveFile(saveFile)) {
        audit.result = "rejected";
        audit.reasonCode = "save_file_invalid";
        audit.details = "存档结构无效";
        emitSaveAudit(audit);
        return { ok: false, error: "存档结构无效", audit };
      }

      const mainKey = SAVE_KEYS.slotMain(normalizedSlotId);
      const backupKey = SAVE_KEYS.slotBackup(normalizedSlotId);
      const oldMain = this.storage.read(mainKey);
      if (oldMain) {
        this.storage.write(backupKey, oldMain);
      }

      const jsonText = JSON.stringify(saveFile, null, 2);
      const writeOk = this.storage.write(mainKey, jsonText);
      if (!writeOk) {
        audit.result = "rejected";
        audit.reasonCode = "storage_write_failed";
        audit.details = "写入存储失败（可能空间不足）";
        emitSaveAudit(audit);
        return { ok: false, error: "写入存储失败（可能空间不足）", audit };
      }

      const readBack = this.storage.read(mainKey);
      if (!readBack) {
        if (oldMain) this.storage.write(mainKey, oldMain);
        audit.result = "rejected";
        audit.reasonCode = "read_back_failed";
        audit.details = "写入后读回失败";
        emitSaveAudit(audit);
        return { ok: false, error: "写入后读回失败", audit };
      }

      let verifiedFile;
      try {
        verifiedFile = parseAndUpgradeSaveFile(readBack);
      } catch (error) {
        if (oldMain) this.storage.write(mainKey, oldMain);
        audit.result = "rejected";
        audit.reasonCode = "post_write_validation_failed";
        audit.details = `写入后校验失败：${error.message}`;
        emitSaveAudit(audit);
        return { ok: false, error: `写入后校验失败：${error.message}`, audit };
      }

      const sum = snapshotSummary(verifiedFile.state);
      audit.result = "written";
      audit.reasonCode = gate.reasonCode;
      audit.effectiveMapId = sum.currentMapId;
      console.log(`[Save] slot=${normalizedSlotId} schema=v${SAVE_SCHEMA_VERSION} time=${sum.totalMinutes} day=${sum.day} map=${sum.currentMapId} flags=${sum.flagsCount} logs=${sum.logLinesCount}`);
      emitSaveAudit(audit);

      return { ok: true, audit };
    } catch (error) {
      console.error("[存档管理] 保存异常", error);
      const audit = buildSaveAuditEnvelope(slotId, gameState, options);
      audit.result = "rejected";
      audit.reasonCode = "exception";
      audit.details = error.message || "未知错误";
      emitSaveAudit(audit);
      return { ok: false, error: error.message || "未知错误", audit };
    }
  }

  loadFromSlot(slotId) {
    try {
      const normalizedSlotId = slotLabel(slotId);
      const mainKey = SAVE_KEYS.slotMain(normalizedSlotId);
      const backupKey = SAVE_KEYS.slotBackup(normalizedSlotId);

      const primary = this._tryLoadFromKey(mainKey, normalizedSlotId, false);
      if (primary.ok) return primary;

      console.warn(`[存档管理] 主档加载失败，尝试备份：${primary.error}`);
      const backup = this._tryLoadFromKey(backupKey, normalizedSlotId, true);
      if (backup.ok) return backup;

      return {
        ok: false,
        error: `主档和备份都无法加载。主档错误：${primary.error}`
      };
    } catch (error) {
      console.error("[存档管理] 加载异常", error);
      return { ok: false, error: error.message || "未知错误" };
    }
  }

  _tryLoadFromKey(key, slotId, usedBackup) {
    try {
      const jsonString = this.storage.read(key);
      if (!jsonString) {
        return { ok: false, error: "存档不存在" };
      }

      const saveFile = parseAndUpgradeSaveFile(jsonString);
      const summary = snapshotSummary(saveFile.state);
      console.log(`[Load] slot=${slotId} schema=v${SAVE_SCHEMA_VERSION} time=${summary.totalMinutes} day=${summary.day} map=${summary.currentMapId} flags=${summary.flagsCount} logs=${summary.logLinesCount} backup=${usedBackup ? "yes" : "no"}`);

      return {
        ok: true,
        snapshotState: saveFile.state,
        usedBackup,
        schemaVersion: saveFile.schemaVersion,
        savedAt: saveFile.savedAt,
        slotId
      };
    } catch (error) {
      return { ok: false, error: error.message || "加载失败" };
    }
  }

  listSlots() {
    const result = [];
    const order = this._getOrInitSlotIndex();
    const slotNames = this._readSlotNames();

    for (const rawSlotId of order) {
      const normalizedSlotId = slotLabel(rawSlotId);
      const mainKey = SAVE_KEYS.slotMain(normalizedSlotId);
      const raw = this.storage.read(mainKey);
      if (!raw) {
        result.push({
          slotId: rawSlotId,
          isAuto: rawSlotId === "auto",
          isEmpty: true,
          displayName: this._displayNameFor(rawSlotId, slotNames)
        });
        continue;
      }

      try {
        const saveFile = parseAndUpgradeSaveFile(raw);
        const semantic = validateSlotSemanticState(rawSlotId, saveFile.state);
        if (!semantic.ok) {
          result.push({
            slotId: rawSlotId,
            isAuto: rawSlotId === "auto",
            isEmpty: false,
            corrupted: true,
            invalid: true,
            error: semantic.error,
            displayName: this._displayNameFor(rawSlotId, slotNames)
          });
          continue;
        }
        result.push({
          ...buildSlotPreview(rawSlotId, saveFile),
          displayName: this._displayNameFor(rawSlotId, slotNames)
        });
      } catch (error) {
        const parsed = safeParse(raw);
        const schemaVersion = Number(parsed?.schemaVersion ?? 0);
        const incompatible = Number.isFinite(schemaVersion) && schemaVersion > SAVE_SCHEMA_VERSION;
        result.push({
          slotId: rawSlotId,
          isAuto: rawSlotId === "auto",
          isEmpty: false,
          corrupted: true,
          error: incompatible ? "版本不兼容" : "存档损坏",
          displayName: this._displayNameFor(rawSlotId, slotNames)
        });
      }
    }

    return result;
  }

  listLegacyAchievementStatesForMigration() {
    // Migration-only helper: legacy slot achievements may seed the profile store once,
    // but they are not part of the normal achievement read path.
    const results = [];
    for (const rawSlotId of this.listSlotIds()) {
      const normalizedSlotId = slotLabel(rawSlotId);
      const candidatePayloads = [
        this.storage.read(SAVE_KEYS.slotMain(normalizedSlotId)),
        this.storage.read(SAVE_KEYS.slotBackup(normalizedSlotId))
      ];

      for (const raw of candidatePayloads) {
        if (!raw) continue;

        try {
          const saveFile = parseAndUpgradeSaveFile(raw);
          const achievementsState = normalizeAchievementState(saveFile?.state?.player?.achievements);
          if (Object.keys(achievementsState).length <= 0) continue;
          results.push({
            slotId: rawSlotId,
            achievementsState
          });
          break;
        } catch {
          continue;
        }
      }
    }

    return results;
  }

  deleteSlot(slotId) {
    const normalizedSlotId = slotLabel(slotId);
    if (normalizedSlotId === "auto") {
      return { ok: false, error: "自动存档不可删除" };
    }

    this.storage.remove(SAVE_KEYS.slotMain(normalizedSlotId));
    this.storage.remove(SAVE_KEYS.slotBackup(normalizedSlotId));

    const normalized = normalizeSlotIdForIndex(normalizedSlotId);
    const index = this._getOrInitSlotIndex();
    const nextIndex = index.filter(x => x !== normalized);
    this._writeSlotIndex(nextIndex);

    const slotNames = this._readSlotNames();
    delete slotNames[String(normalized)];
    this._writeSlotNames(slotNames);

    console.log(`[存档管理] 已删除槽位 ${normalizedSlotId}`);
    return { ok: true };
  }

  renameSlot(slotId, displayName) {
    const normalizedSlotId = normalizeSlotIdForIndex(slotId);
    if (normalizedSlotId == null || normalizedSlotId === "auto") {
      return { ok: false, error: "自动存档不支持重命名" };
    }

    const index = this._getOrInitSlotIndex();
    if (!index.includes(normalizedSlotId)) {
      return { ok: false, error: "槽位不存在" };
    }

    const name = normalizeDisplayName(displayName);
    if (!name) {
      return { ok: false, error: "名称不能为空" };
    }

    const slotNames = this._readSlotNames();
    slotNames[String(normalizedSlotId)] = name;
    this._writeSlotNames(slotNames);
    return { ok: true, slotId: normalizedSlotId, displayName: name };
  }

  exportSlot(slotId) {
    const normalizedSlotId = slotLabel(slotId);
    const mainKey = SAVE_KEYS.slotMain(normalizedSlotId);
    const jsonString = this.storage.read(mainKey);
    if (!jsonString) {
      return { ok: false, error: "存档不存在" };
    }

    try {
      const saveFile = parseAndUpgradeSaveFile(jsonString);
      return { ok: true, jsonString: JSON.stringify(saveFile, null, 2) };
    } catch (error) {
      return { ok: false, error: `导出失败：${error.message}` };
    }
  }

  importToSlot(slotId, jsonString) {
    try {
      const normalizedSlotId = slotLabel(slotId);
      this._ensureSlotExistsInIndex(normalizedSlotId);
      const imported = parseAndUpgradeSaveFile(String(jsonString || ""));
      const rewritten = makeSaveFile(normalizedSlotId, imported.state, Date.now());
      if (!validateSaveFile(rewritten)) {
        return { ok: false, error: "导入的存档格式无效" };
      }

      const mainKey = SAVE_KEYS.slotMain(normalizedSlotId);
      const backupKey = SAVE_KEYS.slotBackup(normalizedSlotId);
      const oldMain = this.storage.read(mainKey);
      if (oldMain) {
        this.storage.write(backupKey, oldMain);
      }

      const ok = this.storage.write(mainKey, JSON.stringify(rewritten, null, 2));
      if (!ok) {
        return { ok: false, error: "写入失败" };
      }

      const sum = snapshotSummary(rewritten.state);
      console.log(`[Import] slot=${normalizedSlotId} schema=v${SAVE_SCHEMA_VERSION} time=${sum.totalMinutes} day=${sum.day} map=${sum.currentMapId} flags=${sum.flagsCount} logs=${sum.logLinesCount}`);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: `导入失败：${error.message}` };
    }
  }
}

export const saveManager = new SaveManager();
