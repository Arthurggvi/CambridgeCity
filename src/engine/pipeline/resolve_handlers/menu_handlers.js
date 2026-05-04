import { getPlayerDerived } from "../../player.js";
import { PLAYER_DEFS } from "../../player_defs.js";
import { getCanonicalMapId } from "../../map_context.js";
import { resolveTotalMinutesFromCalendarFields } from "../../calendar_model.js";
import {
  clampWorldviewAxis,
  getProfileDisplayLevelMax,
  getWorldviewDisplayLevelMax,
  normalizeProfileDisplayLevelValue
} from "../../profile/defs.js";
import { getNpcDefinition } from "../../social/npc_registry.js";
import { getPreferredSocialDossierEntryForNpcId, listSocialDossierEntriesByNpcId } from "../../social/dossier_entry_registry.js";
import { hasNaturalNameKnownEvidenceForNpcId } from "../social_authoring_evidence.js";

const DEBUG_PLAYER_STAT_PATHS = Object.freeze({
  hp: "player.psycho.hp",
  satiety: "player.physio.satiety",
  stamina: "player.physio.stamina",
  fatigue: "player.psycho.fatigue",
  temperature: "player.physio.temperatureC"
});

function toFiniteDebugNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function resolveDebugPlayerStatMax(gameState, statKey) {
  const key = String(statKey || "").trim();
  if (!DEBUG_PLAYER_STAT_PATHS[key]) return null;

  if (key === "temperature") {
    const coreDefs = PLAYER_DEFS?.temperature?.coreTemp || {};
    const fallbackCore = PLAYER_DEFS?.temperature?.core || {};
    const max = toFiniteDebugNumber(coreDefs?.maxC ?? fallbackCore?.maxC ?? coreDefs?.T_core_max ?? 40);
    return max !== null ? max : 40;
  }

  const player = gameState?.player;
  if (!player || typeof player !== "object") return null;

  const maxFieldMap = {
    hp: "hpMax",
    satiety: "satietyMax",
    stamina: "staminaMax",
    fatigue: "fatigueMax"
  };
  const limitMax = toFiniteDebugNumber(player?.limits?.[maxFieldMap[key]]);
  if (limitMax !== null && limitMax > 0) {
    return limitMax;
  }

  const derived = getPlayerDerived(player);
  const effectiveMax = toFiniteDebugNumber(derived?.attrs?.[key]?.effectiveMax);
  if (effectiveMax !== null && effectiveMax > 0) {
    return effectiveMax;
  }
  const baseMax = toFiniteDebugNumber(derived?.attrs?.[key]?.baseMax);
  if (baseMax !== null && baseMax > 0) {
    return baseMax;
  }

  return null;
}

function resolveDebugPlayerStatMin(statKey) {
  const key = String(statKey || "").trim();
  if (!DEBUG_PLAYER_STAT_PATHS[key]) return null;
  if (key !== "temperature") return 0;
  const coreDefs = PLAYER_DEFS?.temperature?.coreTemp || {};
  const fallbackCore = PLAYER_DEFS?.temperature?.core || {};
  const min = toFiniteDebugNumber(coreDefs?.minC ?? fallbackCore?.minC ?? coreDefs?.T_core_min ?? 20);
  return min !== null ? min : 20;
}

function getCanonicalGameplayMapId(gameState, isMenuMapId) {
  const mapId = String(getCanonicalMapId(gameState) || "").trim();
  if (!mapId || isMenuMapId(mapId)) return "";
  return mapId;
}

let _menuReturnContextSceneMismatchWarned = false;
function getCanonicalGameplaySceneId(gameState) {
  // Priority: currentSceneId is the canonical truth; currentScene object can be stale.
  const fromId = String(gameState?.currentSceneId || "").trim();
  const fromObject = String(gameState?.currentScene?.id || "").trim();
  if (fromId && fromObject && fromId !== fromObject && !_menuReturnContextSceneMismatchWarned) {
    _menuReturnContextSceneMismatchWarned = true;
    console.warn("[MenuReturnContext] scene truth mismatch", {
      source: "menu_return_context",
      currentSceneId: fromId,
      currentSceneObjectId: fromObject
    });
  }
  return fromId || fromObject;
}

function clampDebugSocialFavor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.trunc(numeric)));
}

function normalizeDebugProfileLevel(value, maxLevel) {
  const normalized = normalizeProfileDisplayLevelValue(value);
  if (normalized === null) return null;
  return Math.max(0, Math.min(Math.max(0, Math.trunc(Number(maxLevel) || 0)), normalized));
}

function normalizeDebugWorldviewAxis(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return clampWorldviewAxis(numeric);
}

export async function handleMenuAndSettingsActions(ctx) {
  const {
    id,
    payload,
    plan,
    gameState,
    addEffect,
    addSysCall,
    addNote,
    Effects,
    addSocialIntent,
    SYSCALL_TYPES,
    isMenuMapId,
    NEW_GAME_ENTRY_MAP_ID
  } = ctx;

  if (id === "menu_go_load") {
    addNote(plan, "进入读取存档页");
    addEffect(plan, Effects.set("ui.menuReturnMapId", null));
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: "menu_load" });
    return true;
  }

  if (id === "menu_go_achievements") {
    addNote(plan, "打开成就弹窗");
    return true;
  }

  if (id === "ui_open_save_menu") {
    const returnMapId = getCanonicalGameplayMapId(gameState, isMenuMapId);
    const returnSceneId = getCanonicalGameplaySceneId(gameState);
    console.info("[SaveMenuProbe:resolve]", {
      actionId: id,
      resolvedReturnMapId: returnMapId || null,
      resolvedReturnSceneId: returnSceneId || null,
      canonicalCurrentMapId: String(getCanonicalMapId(gameState) || "") || null
    });
    addNote(plan, returnMapId ? `进入存档页（游戏内来源：${returnMapId}）` : "进入存档页（缺少游戏地图上下文）");
    addEffect(plan, Effects.set("ui.menuReturnMapId", returnMapId || null));
    addEffect(plan, Effects.set("ui.menuReturnContext.mapId", returnMapId || null));
    addEffect(plan, Effects.set("ui.menuReturnContext.sceneId", returnSceneId || null));
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: "menu_load" });
    return true;
  }

  if (id === "menu_go_settings") {
    addNote(plan, "进入设置页");
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: "menu_settings" });
    return true;
  }

  if (id === "menu_go_credits") {
    addNote(plan, "进入开发组信息页");
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: "menu_credits" });
    return true;
  }

  if (id === "menu_back_main") {
    const returnMapId = String(gameState?.ui?.menuReturnMapId || "");
    const returnContextMapId = String(gameState?.ui?.menuReturnContext?.mapId || "");
    const returnContextSceneId = String(gameState?.ui?.menuReturnContext?.sceneId || "");
    const currentMapId = String(getCanonicalMapId(gameState) || "");
    const effectiveReturnMapId = (returnContextMapId || returnMapId).trim();
    const effectiveReturnSceneId = returnContextSceneId.trim();
    if (currentMapId === "menu_load" && effectiveReturnMapId && !isMenuMapId(effectiveReturnMapId)) {
      addNote(plan, `返回游戏地图：${effectiveReturnMapId}`);
      addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: effectiveReturnMapId });
      // Restore V2 scene context when available. If missing, V2 will fall back to entrySceneId.
      if (effectiveReturnSceneId) {
        addEffect(plan, Effects.set("currentSceneId", effectiveReturnSceneId));
        // Clear object scene so downstream readers don't prefer a stale entry-scene object.
        addEffect(plan, Effects.set("currentScene", null));
      }
    } else {
      addNote(plan, "返回主菜单");
      addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: "menu_main" });
    }
    addEffect(plan, Effects.set("ui.menuReturnMapId", null));
    addEffect(plan, Effects.set("ui.menuReturnContext", null));
    return true;
  }

  if (id === "menu_add_slot") {
    addNote(plan, "新增存档槽位");
    addSysCall(plan, SYSCALL_TYPES.ADD_SLOT, {});
    return true;
  }

  if (id === "menu_exit_main") {
    addNote(plan, "退出到主菜单");
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: "menu_main" });
    addEffect(plan, Effects.set("ui.menuReturnMapId", null));
    return true;
  }

  if (id.startsWith("menu_save:")) {
    const slotText = id.slice("menu_save:".length);
    const slotId = parseInt(slotText, 10);
    addNote(plan, `菜单保存：${slotId}`);
    addSysCall(plan, SYSCALL_TYPES.SAVE_GAME, { slotId, sourceActionId: id });
    return true;
  }

  if (id === "menu_continue_auto") {
    addNote(plan, "继续游戏：加载 auto 槽位");
    addSysCall(plan, SYSCALL_TYPES.LOAD_SLOT, { slotId: "auto" });
    return true;
  }

  if (id === "menu_new_game") {
    addNote(plan, `新建游戏：重置状态并跳转到 ${NEW_GAME_ENTRY_MAP_ID}`);
    addSysCall(plan, SYSCALL_TYPES.NEW_GAME, { sourceActionId: id });
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: NEW_GAME_ENTRY_MAP_ID });
    return true;
  }

  if (id.startsWith("menu_load:")) {
    const slotText = id.slice("menu_load:".length);
    const slotId = slotText === "auto" ? "auto" : parseInt(slotText, 10);
    addNote(plan, `菜单读档：${slotId}`);
    addSysCall(plan, SYSCALL_TYPES.LOAD_SLOT, { slotId });
    return true;
  }

  if (id.startsWith("menu_delete:")) {
    const slotText = id.slice("menu_delete:".length);
    const slotId = parseInt(slotText, 10);
    addNote(plan, `菜单删档：${slotId}`);
    addSysCall(plan, SYSCALL_TYPES.DELETE_SLOT, { slotId });
    return true;
  }

  if (id.startsWith("menu_rename:")) {
    const slotText = id.slice("menu_rename:".length);
    const slotId = parseInt(slotText, 10);
    addNote(plan, `菜单重命名槽位：${slotId}`);
    addSysCall(plan, SYSCALL_TYPES.RENAME_SLOT, {
      slotId,
      displayName: String(payload?.displayName || "")
    });
    return true;
  }

  if (id.startsWith("menu_export:")) {
    const slotText = id.slice("menu_export:".length);
    const slotId = slotText === "auto" ? "auto" : parseInt(slotText, 10);
    addNote(plan, `菜单导出：${slotId}`);
    addSysCall(plan, SYSCALL_TYPES.EXPORT_SLOT, { slotId });
    return true;
  }

  if (id.startsWith("menu_import:")) {
    const slotText = id.slice("menu_import:".length);
    const slotId = parseInt(slotText, 10);
    addNote(plan, `菜单导入：${slotId}`);
    addSysCall(plan, SYSCALL_TYPES.IMPORT_SLOT, {
      slotId,
      jsonString: String(payload?.jsonString || "")
    });
    return true;
  }

  if (id.startsWith("settings_set:")) {
    const parts = id.split(":");
    const key = parts[1] || "";
    const valueRaw = parts[2] || "";
    let value = valueRaw;
    if (/^\d+$/.test(valueRaw)) {
      value = parseInt(valueRaw, 10);
    } else if (valueRaw === "true") {
      value = true;
    } else if (valueRaw === "false") {
      value = false;
    }
    addNote(plan, `设置写入：${key}=${value}`);
    addSysCall(plan, SYSCALL_TYPES.WRITE_SETTINGS, { mode: "set", key, value });
    return true;
  }

  if (id.startsWith("settings_toggle:")) {
    const key = id.slice("settings_toggle:".length);
    addNote(plan, `设置开关：${key}`);
    addSysCall(plan, SYSCALL_TYPES.WRITE_SETTINGS, { mode: "toggle", key });
    return true;
  }

  if (id === "settings_reset_defaults") {
    addNote(plan, "恢复默认设置");
    addSysCall(plan, SYSCALL_TYPES.WRITE_SETTINGS, { mode: "reset" });
    return true;
  }

  if (id === "new_game") {
    addNote(plan, `新游戏：重置状态并跳转到 ${NEW_GAME_ENTRY_MAP_ID}`);
    addSysCall(plan, SYSCALL_TYPES.NEW_GAME, {});
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: NEW_GAME_ENTRY_MAP_ID });
    return true;
  }

  if (id === "continue_game") {
    addNote(plan, "继续游戏：加载槽位1");
    addSysCall(plan, SYSCALL_TYPES.LOAD_SLOT, { slotId: 1 });
    return true;
  }

  if (id === "show_more_menu") {
    addNote(plan, "显示更多菜单：保存当前页面并跳转");
    addEffect(plan, Effects.set("previousMapId", getCanonicalMapId(gameState) || null));
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: "menu_more" });
    return true;
  }

  if (id === "go_back") {
    const previousId = gameState.previousMapId || "menu";
    addNote(plan, `返回上一页：${previousId}`);
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: previousId });
    addEffect(plan, Effects.set("previousMapId", null));
    return true;
  }

  if (id.startsWith("save_to_slot_")) {
    const slotIdStr = id.replace("save_to_slot_", "");
    const slotId = slotIdStr === "auto" ? "auto" : parseInt(slotIdStr, 10);
    addNote(plan, `保存到槽位：${slotId}`);
    addSysCall(plan, SYSCALL_TYPES.SAVE_GAME, { slotId, sourceActionId: id });
    return true;
  }

  if (id.startsWith("load_slot_")) {
    const slotIdStr = id.replace("load_slot_", "");
    const slotId = slotIdStr === "auto" ? "auto" : parseInt(slotIdStr, 10);
    addNote(plan, `加载槽位：${slotId}`);
    addSysCall(plan, SYSCALL_TYPES.LOAD_SLOT, { slotId });
    return true;
  }

  if (id.startsWith("delete_slot_")) {
    const slotIdStr = id.replace("delete_slot_", "");
    const slotId = slotIdStr === "auto" ? "auto" : parseInt(slotIdStr, 10);
    addNote(plan, `删除槽位：${slotId}`);
    addSysCall(plan, SYSCALL_TYPES.DELETE_SLOT, { slotId });
    return true;
  }

  if (id === "export_save" || id === "import_save") {
    addNote(plan, `导出/导入操作：${id}（暂用 legacy）`);
    addSysCall(plan, SYSCALL_TYPES.LEGACY, { actionId: id });
    return true;
  }

  if (id === "debug_teleport") {
    const mapId = String(payload?.mapId || "").trim();
    if (!mapId) {
      addNote(plan, "调试传送失败：缺少 mapId");
      return true;
    }
    addNote(plan, `调试传送：${mapId}`);
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId });
    return true;
  }

  if (id === "debug_set_money") {
    const n = Number(payload?.money);
    if (!Number.isFinite(n) || n < 0) {
      addNote(plan, `调试余额设置失败：非法金额 ${String(payload?.money)}`);
      return true;
    }
    const normalized = Math.round(n * 100) / 100;
    addEffect(plan, Effects.set("world.money", normalized));
    addNote(plan, `调试设置余额：${normalized.toFixed(2)}`);
    return true;
  }

  if (id === "debug_set_player_stat_value") {
    const statKey = String(payload?.statKey || "").trim();
    const path = DEBUG_PLAYER_STAT_PATHS[statKey];
    const rawValue = toFiniteDebugNumber(payload?.value);
    const min = resolveDebugPlayerStatMin(statKey);
    const max = resolveDebugPlayerStatMax(gameState, statKey);

    if (!path || rawValue === null || min === null || max === null) {
      addNote(plan, `调试状态设置失败：${statKey || "unknown"}=${String(payload?.value)}`);
      return true;
    }

    const clamped = Math.max(min, Math.min(max, rawValue));
    addEffect(plan, Effects.set(path, clamped));
    addNote(plan, `调试设置状态：${statKey}=${clamped.toFixed(2)} (range=${min.toFixed(2)}~${max.toFixed(2)})`);
    return true;
  }

  if (id === "debug_set_profile_core_values") {
    const nextPatch = {};
    const invalidFields = [];
    const levelMax = getProfileDisplayLevelMax();
    const worldviewLevelMax = getWorldviewDisplayLevelMax();

    if (payload && Object.prototype.hasOwnProperty.call(payload, "physiqueLevel")) {
      const level = normalizeDebugProfileLevel(payload?.physiqueLevel, levelMax);
      if (level === null) invalidFields.push("physiqueLevel");
      else nextPatch.physiqueLevel = level;
    }

    if (payload && Object.prototype.hasOwnProperty.call(payload, "experienceLevel")) {
      const level = normalizeDebugProfileLevel(payload?.experienceLevel, levelMax);
      if (level === null) invalidFields.push("experienceLevel");
      else nextPatch.experienceLevel = level;
    }

    if (payload && Object.prototype.hasOwnProperty.call(payload, "worldviewLevel")) {
      const level = normalizeDebugProfileLevel(payload?.worldviewLevel, worldviewLevelMax);
      if (level === null) invalidFields.push("worldviewLevel");
      else nextPatch.worldviewLevel = level;
    }

    if (payload && Object.prototype.hasOwnProperty.call(payload, "worldviewAxis")) {
      const axis = normalizeDebugWorldviewAxis(payload?.worldviewAxis);
      if (axis === null) invalidFields.push("worldviewAxis");
      else nextPatch.worldviewAxis = axis;
    }

    if (invalidFields.length > 0 || Object.keys(nextPatch).length <= 0) {
      addNote(plan, `调试核心属性设置失败：${invalidFields.join(",") || "empty_patch"}`);
      return true;
    }

    addSysCall(plan, SYSCALL_TYPES.DEBUG_SET_PROFILE_CORE_VALUES, nextPatch);
    addNote(plan, `调试核心属性写入：${JSON.stringify(nextPatch)}`);
    return true;
  }

  if (id === "debug_set_time") {
    const result = resolveTotalMinutesFromCalendarFields(gameState?.time?.totalMinutes, {
      year: payload?.year,
      month: payload?.month,
      day: payload?.day,
      hour: payload?.hour,
      minute: payload?.minute
    }, gameState?.world || {});

    if (!result.ok || !Number.isFinite(result.totalMinutes)) {
      addNote(plan, `调试时间设置失败：${String(result?.error || "invalid-time")}`);
      return true;
    }

    addEffect(plan, Effects.set("time.totalMinutes", result.totalMinutes));
    addNote(plan, `调试设置时间：第${result.normalized.year}年 ${result.normalized.month}-${result.normalized.day} ${String(result.normalized.hour).padStart(2, "0")}:${String(result.normalized.minute).padStart(2, "0")}`);
    return true;
  }

  if (id === "debug_social_set_favor") {
    const npcId = String(payload?.npcId || "").trim();
    const definition = getNpcDefinition(npcId);
    const favor = clampDebugSocialFavor(payload?.favor);
    if (!definition || favor === null) {
      addNote(plan, `调试社交 favor 设置失败：npcId=${npcId || "?"} favor=${String(payload?.favor)}`);
      return true;
    }
    addSocialIntent(plan, {
      type: "set_favor",
      npcId: definition.id,
      favor,
      reason: "debug_social_set_favor"
    });
    addNote(plan, `调试社交 favor 设置：${definition.id} -> ${favor}`);
    return true;
  }

  if (id === "debug_social_adjust_favor") {
    const npcId = String(payload?.npcId || "").trim();
    const definition = getNpcDefinition(npcId);
    const delta = Number(payload?.delta);
    if (!definition || !Number.isFinite(delta)) {
      addNote(plan, `调试社交 favor 调整失败：npcId=${npcId || "?"} delta=${String(payload?.delta)}`);
      return true;
    }
    const currentFavor = Number(gameState?.player?.social?.byNpcId?.[definition.id]?.favor ?? 0);
    const nextFavor = clampDebugSocialFavor(currentFavor + delta);
    if (nextFavor === null) {
      addNote(plan, `调试社交 favor 调整失败：npcId=${definition.id}`);
      return true;
    }
    addSocialIntent(plan, {
      type: "set_favor",
      npcId: definition.id,
      favor: nextFavor,
      reason: "debug_social_adjust_favor"
    });
    addNote(plan, `调试社交 favor 调整：${definition.id} ${delta >= 0 ? "+" : ""}${Math.trunc(delta)} -> ${nextFavor}`);
    return true;
  }

  if (id === "debug_social_discover_npc") {
    const npcId = String(payload?.npcId || "").trim();
    const definition = getNpcDefinition(npcId);
    if (!definition) {
      addNote(plan, `调试社交发现失败：npcId=${npcId || "?"}`);
      return true;
    }
    const hasNaturalNameKnownEvidence = await hasNaturalNameKnownEvidenceForNpcId(definition.id);
    const socialEntry = gameState?.player?.social?.byNpcId?.[definition.id] || null;
    const alreadyDiscovered = socialEntry?.discovered === true;
    const alreadyNameKnown = socialEntry?.dossierFlags?.nameKnown === true;
    const unlockedEntryIdSet = new Set(
      Array.isArray(socialEntry?.unlockedDossierEntryIds)
        ? socialEntry.unlockedDossierEntryIds.map((entryId) => String(entryId || "").trim()).filter(Boolean)
        : []
    );
    const preferredEntry = getPreferredSocialDossierEntryForNpcId(definition.id);
    const preferredEntryUnlocked = !!preferredEntry && unlockedEntryIdSet.has(preferredEntry.id);

    if (!alreadyDiscovered) {
      addSocialIntent(plan, {
        type: "discover_npc",
        npcId: definition.id,
        reason: "debug_social_discover_npc"
      });
    }

    if (preferredEntry && !preferredEntryUnlocked) {
      addSocialIntent(plan, {
        type: "unlock_dossier_entry",
        npcId: definition.id,
        entryId: preferredEntry.id,
        reason: "debug_social_discover_npc"
      });
    }

    if (hasNaturalNameKnownEvidence && !alreadyNameKnown) {
      addSocialIntent(plan, {
        type: "set_dossier_flag",
        npcId: definition.id,
        flagId: "nameKnown",
        value: true,
        reason: "debug_social_discover_npc"
      });
    }

    if (alreadyDiscovered && (!preferredEntry || preferredEntryUnlocked) && (!hasNaturalNameKnownEvidence || alreadyNameKnown)) {
      addNote(plan, `调试社交发现跳过：${definition.id} 已满足自然发现语义`);
      return true;
    }

    if (hasNaturalNameKnownEvidence && !alreadyNameKnown) {
      if (preferredEntry && !preferredEntryUnlocked) {
        addNote(plan, `调试社交发现：${definition.id}，并按自然 authoring 识名 + 解锁词条 ${preferredEntry.id}`);
        return true;
      }
      addNote(plan, `调试社交发现：${definition.id}，并按自然 authoring 识名`);
      return true;
    }

    if (preferredEntry && !preferredEntryUnlocked) {
      addNote(plan, `调试社交发现：${definition.id}，并解锁词条 ${preferredEntry.id}`);
      return true;
    }

    addNote(plan, `调试社交发现：${definition.id}`);
    return true;
  }

  if (id === "debug_social_unlock_dossier_entry" || id === "debug_social_lock_dossier_entry") {
    const npcId = String(payload?.npcId || "").trim();
    const entryId = String(payload?.entryId || "").trim();
    const definition = getNpcDefinition(npcId);
    const dossierEntries = definition ? listSocialDossierEntriesByNpcId(definition.id) : [];
    const entry = dossierEntries.find((row) => row.id === entryId) || null;
    if (!definition || !entry) {
      addNote(plan, `调试档案词条写入失败：npcId=${npcId || "?"} entryId=${entryId || "?"}`);
      return true;
    }
    const unlocked = id === "debug_social_unlock_dossier_entry";
    addSocialIntent(plan, {
      type: "set_dossier_entry_unlock",
      npcId: definition.id,
      entryId: entry.id,
      value: unlocked,
      reason: unlocked ? "debug_social_unlock_dossier_entry" : "debug_social_lock_dossier_entry"
    });
    addNote(plan, `${unlocked ? "调试解锁" : "调试锁定"}档案词条：${definition.id} -> ${entry.id}`);
    return true;
  }

  if (id === "debug_social_unlock_all_dossier_entries" || id === "debug_social_lock_all_dossier_entries") {
    const npcId = String(payload?.npcId || "").trim();
    const definition = getNpcDefinition(npcId);
    const dossierEntries = definition ? listSocialDossierEntriesByNpcId(definition.id) : [];
    if (!definition || dossierEntries.length <= 0) {
      addNote(plan, `调试档案词条批量写入失败：npcId=${npcId || "?"}`);
      return true;
    }
    const unlocked = id === "debug_social_unlock_all_dossier_entries";
    for (const entry of dossierEntries) {
      addSocialIntent(plan, {
        type: "set_dossier_entry_unlock",
        npcId: definition.id,
        entryId: entry.id,
        value: unlocked,
        reason: unlocked ? "debug_social_unlock_all_dossier_entries" : "debug_social_lock_all_dossier_entries"
      });
    }
    addNote(plan, `${unlocked ? "调试批量解锁" : "调试批量锁定"}档案词条：${definition.id} (${dossierEntries.length})`);
    return true;
  }

  return false;
}
