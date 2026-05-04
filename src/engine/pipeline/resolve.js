// ============================================================================
// Resolve - Action 到 Plan 的转换
// ============================================================================
// Resolve 是管线的"大脑"，决定 Action 应该如何执行
// 
// 设计原则：
// 1. resolve() 函数**禁止**修改 gameState（只读！）
// 2. resolve() 的输出是纯数据的 Plan
// 3. resolve() 可以读取 map JSON、event JSON 等配置
// 4. resolve() 负责业务逻辑决策（跳图、触发事件、推进时间等）
// 5. 暂时保留 legacy 适配，逐步迁移到数据驱动
// ============================================================================

import { makeEmptyPlan, addSysCall, addEffect, addNote, addRecordIntent, addArchiveReadingIntent, addSocialIntent, addBusinessIntent, SYSCALL_TYPES } from "./plan_types.js";
import { Effects } from "./effects.js";
import { evaluateRequires } from "../requires.js";
import { handleGovActions } from "./resolve_handlers/gov_handlers.js";
import { handleMenuAndSettingsActions } from "./resolve_handlers/menu_handlers.js";
import { handleTheseusActions } from "./resolve_handlers/theseus_handlers.js";
import { handleSocialUiActions } from "./resolve_handlers/social_ui_handlers.js";
import { handleUiInventoryActions } from "./resolve_handlers/ui_inventory_handlers.js";
import { handleInquirySessionActions } from "./resolve_handlers/inquiry_session_handlers.js";
import { handleJobSessionActions } from "./resolve_handlers/job_session_handlers.js";
import { handleMapActions } from "./resolve_handlers/map_handlers.js";
import { applyFoodIntakeToPlayer } from "../player.js";
import { isGovHallBusinessOpen } from "../gov_hall_business.js";
import { getProfileSnapshot } from "../profile/read.js";
import { collectProfileIntentsFromPlan, mergeProfileIntents } from "../profile/runtime_intents.js";
import { handleTransitActions } from "../transit/transit_session.js";
import { getCalendarViewFromTotalMinutes } from "../calendar_model.js";
import {
  EQUIPMENT_SLOT_ORDER,
  INVENTORY_CATEGORIES,
  ensureItemsDbLoaded,
  getCapacityProfile,
  isClothingItem,
  normalizeEquipment,
  normalizeInventory
} from "../items_db.js";
import { createGovHallTaskEntry, createTheseusBoardingTaskEntry, normalizeTaskList, sortTaskEntries } from "../tasks.js";
import { getCanonicalCurrentMap } from "../map_context.js";
import { hasUnlockedRecord } from "../records/record_service.js";

function inferSidebarSessionCoverage(state) {
  const mapId = String(state?.currentMapId || "");
  if (mapId === "bayport_clinic_obs") return "OBS";
  if (mapId === "bayport_clinic_ward") return "WARD_NON_BED";
  return "NONE";
}

function isMenuMapId(mapId) {
  const id = String(mapId || "");
  return id === "menu" || id === "menu_more" || id.startsWith("menu_");
}

const NEW_GAME_ENTRY_MAP_ID = "intro_clinic_bed";
const STEELCROSS_PORT_MARKET_RECORD_ACTION_ID = "system_unlock_steelcross_port_market_record";
const STEELCROSS_PORT_MARKET_RECORD_ID = "steelcross_port_market_001";

function setInventoryToast(plan, message) {
  addEffect(plan, Effects.set("ui.toast", String(message || "")));
}

function getInventoryContext(gameState) {
  return {
    inventory: normalizeInventory(gameState?.player?.inventory),
    equipment: normalizeEquipment(gameState?.player?.equipment)
  };
}

function getTasksContext(gameState) {
  return normalizeTaskList(gameState?.player?.tasks);
}

function findTaskIndex(tasks, taskId) {
  return tasks.findIndex(row => row.id === taskId);
}

function findInventoryIndex(inventory, itemId) {
  return inventory.findIndex(row => row.itemId === itemId && row.qty > 0);
}

function countKindsInCategory(inventory, category, itemsById) {
  const set = new Set();
  for (const row of inventory) {
    const def = itemsById.get(row.itemId);
    if (def?.category === category && row.qty > 0) {
      set.add(row.itemId);
    }
  }
  return set.size;
}

function tryAddItem(inventory, itemId, qty, itemsById, capacity) {
  const addQty = Math.floor(Number(qty));
  if (!Number.isFinite(addQty) || addQty <= 0) {
    return { ok: false, reason: "数量无效" };
  }

  const itemDef = itemsById.get(itemId);
  if (!itemDef) {
    return { ok: false, reason: `未定义物品：${itemId}` };
  }

  const category = String(itemDef.category || "");
  if (!INVENTORY_CATEGORIES.includes(category)) {
    return { ok: false, reason: `物品类别无效：${category || "unknown"}` };
  }

  const next = inventory.map(row => ({ ...row }));
  const kindLimit = Math.max(1, Math.floor(Number(capacity?.kindLimit ?? 2)));
  const stackLimit = Math.max(1, Math.floor(Number(capacity?.stackLimit ?? 1)));
  const bypassCapacity = isClothingItem(itemDef);

  for (let i = 0; i < addQty; i++) {
    const idx = findInventoryIndex(next, itemId);
    if (bypassCapacity) {
      if (idx >= 0) {
        next[idx].qty += 1;
      } else {
        next.push({ itemId, qty: 1 });
      }
      continue;
    }

    if (idx >= 0) {
      if (next[idx].qty >= stackLimit) {
        return {
          ok: false,
          reason: `【${itemDef.name}】已达单种上限 ${stackLimit}`,
          reasonCode: "stack_limit_reached",
          limitType: "stack",
          limit: stackLimit,
          itemId,
          itemName: String(itemDef.name || itemId)
        };
      }
      next[idx].qty += 1;
      continue;
    }

    const kinds = countKindsInCategory(next, category, itemsById);
    if (kinds >= kindLimit) {
      return {
        ok: false,
        reason: `【${category}】种类已达上限 ${kindLimit}`,
        reasonCode: "kind_limit_reached",
        limitType: "kind",
        limit: kindLimit,
        category
      };
    }

    next.push({ itemId, qty: 1 });
  }

  return { ok: true, next };
}

function tryRemoveOne(inventory, itemId) {
  const idx = findInventoryIndex(inventory, itemId);
  if (idx < 0) {
    return { ok: false, reason: "物品不存在" };
  }

  const next = inventory.map(row => ({ ...row }));
  next[idx].qty -= 1;
  if (next[idx].qty <= 0) {
    next.splice(idx, 1);
  }

  return { ok: true, next };
}

const GOV_ITEM_TEMP_ID = "doc_temp_identity";
const GOV_ITEM_CITIZEN_ID = "doc_citizen_identity";
const GOV_ITEM_SHIP_TICKET = "ticket_south_america_ship";

function getTotalMinutes(state) {
  const n = Number(state?.time?.totalMinutes ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function isSeaQuotaSeason(state) {
  const calendarView = getCalendarViewFromTotalMinutes(
    getTotalMinutes(state),
    state?.world || {}
  );
  const month = Number(calendarView?.month);
  if (!Number.isFinite(month)) return false;
  return month >= 11 || month <= 3;
}

function hasInventoryItem(gameState, itemId) {
  const inventory = normalizeInventory(gameState?.player?.inventory);
  return findInventoryIndex(inventory, itemId) >= 0;
}

function hasAnyIdentityProof(gameState) {
  const hasTempCard = hasInventoryItem(gameState, GOV_ITEM_TEMP_ID);
  if (hasTempCard) return true;

  const hasCitizenCard = hasInventoryItem(gameState, GOV_ITEM_CITIZEN_ID);
  if (hasCitizenCard) return true;

  const flags = gameState?.world?.flags || gameState?.flags || {};

  // 临时身份证明必须以“当前持有证件”为准；
  // 历史办理标记（govHallHasTempId/govHallHasAnyIdProof）不应在丢弃证件后继续阻止重新办理。
  // 公民身份是长期身份，可由 flag 持续表示。
  return !!flags.govHallHasCitizenId;
}

function hasCitizenIdentity(gameState) {
  if (hasInventoryItem(gameState, GOV_ITEM_CITIZEN_ID)) return true;
  const flags = gameState?.world?.flags || gameState?.flags || {};
  return !!flags.govHallHasCitizenId;
}

function addInventoryItemForce(inventory, itemId, qty = 1) {
  const amount = Math.max(1, Math.floor(Number(qty) || 1));
  const next = inventory.map(row => ({ ...row }));
  const idx = findInventoryIndex(next, itemId);
  if (idx >= 0) {
    next[idx].qty += amount;
    return next;
  }
  next.push({ itemId, qty: amount });
  return next;
}

function clearGovHallBDialogFlags(plan) {
  addEffect(plan, Effects.set("world.flags.govHallBDialogAlreadyHasIdentity", false));
  addEffect(plan, Effects.set("world.flags.govHallBDialogNeedIdentityForCitizen", false));
  addEffect(plan, Effects.set("world.flags.govHallBDialogCitizenGoHall", false));
  addEffect(plan, Effects.set("world.flags.govHallBDialogTempIssued", false));
  addEffect(plan, Effects.set("world.flags.govHallBDialogNotCitizen", false));
  addEffect(plan, Effects.set("world.flags.govHallBDialogAlreadyHasCitizenCard", false));
  addEffect(plan, Effects.set("world.flags.govHallBDialogReissuePrompt", false));
  addEffect(plan, Effects.set("world.flags.govHallBDialogReissueIssued", false));
}

function clearGovHallADialogFlags(plan) {
  addEffect(plan, Effects.set("world.flags.govHallADialogNoId", false));
}

function clearGovHallCDialogFlags(plan) {
  addEffect(plan, Effects.set("world.flags.govHallCDialogQueueSuccess", false));
  addEffect(plan, Effects.set("world.flags.govHallCDialogQueueRejected", false));
  addEffect(plan, Effects.set("world.flags.govHallCDialogWindowRejected", false));
  addEffect(plan, Effects.set("world.flags.govHallCDialogCitizenApplyIntro", false));
  addEffect(plan, Effects.set("world.flags.govHallCDialogCitizenApplyPaths", false));
  addEffect(plan, Effects.set("world.flags.govHallCDialogCitizenApplyAskDocs", false));
  addEffect(plan, Effects.set("world.flags.govHallCDialogCitizenApplyRejected", false));
  addEffect(plan, Effects.set("world.flags.govHallCDialogSeaOfferUnavailable", false));
  addEffect(plan, Effects.set("world.flags.govHallCDialogSeaOfferSuccess", false));
  addEffect(plan, Effects.set("world.flags.govHallCDialogSeaOfferDeclined", false));
  addEffect(plan, Effects.set("world.flags.govHallCDialogSeaOfferInsufficient", false));
}

/**
 * Resolve Action 到 Plan
 * 
 * @param {Action} action - 用户/系统动作
 * @param {Object} gameState - 当前游戏状态（只读！）
 * @returns {Promise<Plan>} 执行计划
 */
export async function resolve(action, gameState) {
  const plan = makeEmptyPlan(action);
  const { id, payload, type } = action;
  const profileSnapshot = getProfileSnapshot(gameState?.player?.profile);

  // 先收集 action payload 携带的标准成长意图，后续由 commit 统一消费。
  const actionProfileIntents = collectProfileIntentsFromPlan({ plan, action });
  if (actionProfileIntents.length > 0) {
    plan.profileIntents = mergeProfileIntents([...(plan.profileIntents || []), ...actionProfileIntents]);
    addNote(plan, `收集 profileIntents: ${plan.profileIntents.length}`);
  }
  
  console.log(`[Resolve] 处理 action: ${id}, type: ${type}`);
  addNote(plan, `Profile snapshot rev=${profileSnapshot.revision}`);

  if (id === STEELCROSS_PORT_MARKET_RECORD_ACTION_ID) {
    if (hasUnlockedRecord({
      recordId: STEELCROSS_PORT_MARKET_RECORD_ID,
      recordsState: gameState?.player?.records
    })) {
      addNote(plan, `系统记录解锁跳过：已拥有 ${STEELCROSS_PORT_MARKET_RECORD_ID}`);
      return plan;
    }

    addRecordIntent(plan, {
      type: "UNLOCK_RECORD",
      recordId: STEELCROSS_PORT_MARKET_RECORD_ID,
      triggerContext: {
        mapId: String(payload?.triggerContext?.mapId || gameState?.currentMapId || gameState?.world?.currentMapId || "").trim() || null,
        actionId: String(payload?.triggerContext?.actionId || "").trim() || null,
        sceneId: String(payload?.triggerContext?.sceneId || gameState?.currentScene?.id || gameState?.currentSceneId || "").trim() || null,
        source: String(payload?.triggerContext?.source || "route_enter").trim() || "route_enter"
      }
    });
    addNote(plan, `系统记录解锁意图：${STEELCROSS_PORT_MARKET_RECORD_ID}`);
    return plan;
  }

  if (await handleGovActions({
    action,
    id,
    plan,
    gameState,
    addEffect,
    addBusinessIntent,
    addSysCall,
    addNote,
    Effects,
    SYSCALL_TYPES,
    hasAnyIdentityProof,
    clearGovHallADialogFlags,
    clearGovHallBDialogFlags,
    clearGovHallCDialogFlags,
    isGovHallBusinessOpen,
    ensureItemsDbLoaded,
    GOV_ITEM_TEMP_ID,
    getInventoryContext,
    getTasksContext,
    addInventoryItemForce,
    hasCitizenIdentity,
    hasInventoryItem,
    GOV_ITEM_CITIZEN_ID,
    tryRemoveOne,
    GOV_ITEM_SHIP_TICKET,
    isSeaQuotaSeason,
    createTheseusBoardingTaskEntry
  })) {
    return plan;
  }

  if (await handleMenuAndSettingsActions({
    id,
    payload,
    plan,
    gameState,
    addEffect,
    addSocialIntent,
    addSysCall,
    addNote,
    Effects,
    SYSCALL_TYPES,
    isMenuMapId,
    NEW_GAME_ENTRY_MAP_ID
  })) {
    return plan;
  }

  if (await handleTheseusActions({
    id,
    payload,
    plan,
    gameState,
    addEffect,
    addSysCall,
    addNote,
    Effects,
    SYSCALL_TYPES
  })) {
    return plan;
  }

  if (await handleSocialUiActions({
    id,
    payload,
    plan,
    gameState,
    addEffect,
    addSocialIntent,
    addNote,
    Effects
  })) {
    return plan;
  }

  if (await handleUiInventoryActions({
    id,
    payload,
    plan,
    gameState,
    addEffect,
    addSysCall,
    addNote,
    Effects,
    SYSCALL_TYPES,
    ensureItemsDbLoaded,
    INVENTORY_CATEGORIES,
    EQUIPMENT_SLOT_ORDER,
    sortTaskEntries,
    getTasksContext,
    findTaskIndex,
    setInventoryToast,
    getInventoryContext,
    getCapacityProfile,
    tryAddItem,
    tryRemoveOne,
    findInventoryIndex,
    inferSidebarSessionCoverage
  })) {
    return plan;
  }

  if (await handleInquirySessionActions({
    id,
    payload,
    plan,
    gameState,
    addEffect,
    addSysCall,
    addNote,
    Effects,
    SYSCALL_TYPES
  })) {
    return plan;
  }

  if (await handleJobSessionActions({
    id,
    payload,
    plan,
    gameState,
    addEffect,
    addSysCall,
    addNote,
    Effects,
    SYSCALL_TYPES
  })) {
    return plan;
  }

  if (handleTransitActions({
    id,
    payload,
    plan,
    gameState,
    addEffect,
    addSysCall,
    addNote,
    Effects,
    SYSCALL_TYPES
  })) {
    return plan;
  }

  getCanonicalCurrentMap(gameState, {
    source: `resolve:before_handleMapActions:${String(id || "")}`,
    repairState: true
  });

  if (await handleMapActions({
    action,
    id,
    payload,
    plan,
    gameState,
    addEffect,
    addBusinessIntent,
    addSysCall,
    addNote,
    Effects,
    SYSCALL_TYPES,
    evaluateRequires,
    addRecordIntent,
    addArchiveReadingIntent,
    addSocialIntent,
    collectProfileIntentsFromPlan,
    mergeProfileIntents,
    getTasksContext,
    createGovHallTaskEntry,
    ensureItemsDbLoaded,
    getInventoryContext,
    getCapacityProfile,
    tryAddItem,
    applyFoodIntakeToPlayer
  })) {
    return plan;
  }
  
  // UI/背包/任务 与 地图通用动作已拆分至 resolve_handlers/*
  
  // ========== 4. Legacy 兼容（过渡期）==========
  
  addNote(plan, `未识别的动作，使用 legacy 处理：${id}`);
  addSysCall(plan, SYSCALL_TYPES.LEGACY, { actionId: id });
  
  return plan;
}
