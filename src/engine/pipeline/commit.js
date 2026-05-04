// ============================================================================
// Commit - Plan 的执行器（唯一状态写入点）
// ============================================================================
// Commit 是管线的"执行器"，负责将 Plan 转换为实际的状态修改
// 
// **核心约束**：
// 1. 这是唯一允许"增量修改 gameState"的地方（load 整棵替换除外）
// 2. 执行顺序固定且明确
// 3. 必须生成结构化 report，用于调试和未来的 DebugPanel
// 4. 所有修改必须可追溯（before/after snapshot）
// ============================================================================

import { loadMap, getRegionConfigById, getPlaceProfileForMap } from "../loader.js";
import { applyEffects } from "./effects.js";
import { SYSCALL_TYPES } from "./plan_types.js";
import { EQUIPMENT_SLOT_ORDER, INVENTORY_CATEGORIES, normalizeEquipment, normalizeInventory } from "../items_db.js";
import { normalizeTaskList } from "../tasks.js";
import { migrateOldState, replaceGameState } from "../state.js";
import { executeSysCallImpl } from "./syscalls/execute_syscall.js";
import { getUiActionStateSnapshot, normalizeUiOverlay, pushUiOpenCallchain } from "../ui_route.js";
import { resolveProfileDelta } from "../profile/runtime_intents.js";
import { applyProfileDelta } from "../profile/commit.js";
import { ensureProfileShape } from "../profile/read.js";
import { tryViewArchivePage } from "../archive_reading/service.js";
import { normalizeArchiveReadingState, setArchivePageRewardGranted } from "../archive_reading/state.js";
import { tryUnlockRecord } from "../records/record_service.js";
import { normalizeRecordState, setRecordRewardGranted } from "../records/record_state.js";
import { getAllNpcDefinitions } from "../social/npc_registry.js";
import { normalizeSocialState, withNpcEnabledDefaults } from "../social/social_state.js";
import { applySocialIntents } from "./social_commit_adapter.js";
import { clearTransientRuntime } from "../../ui/transient/transient_runtime.js";
import { TRANSIENT_CLEAR_REASONS } from "../../ui/transient/transient_contract.js";
import { getCanonicalMapId, setCanonicalMapContext } from "../map_context.js";
import { createEmptyTransitUiState, deriveTransitUiStateFromRuntimeTruth } from "../transit/transit_session.js";
import { BUS_ONBOARD_MAP_ID } from "../transit/transit_service.js";
import { ensureCurrentSceneV2, isMapContentV2 } from "../map_content_v2.js";
import { applyBusinessIntents } from "../business/business_commit_runtime.js";
import { ensureItemsDbLoaded } from "../items_db.js";
import {
  createEndWildernessSessionPatch,
  createStartWildernessSessionPatch
} from "../wilderness/wilderness_session_service.js";
import { normalizeWildernessState } from "../wilderness/wilderness_state.js";
import { normalizeWildernessBlocker } from "../wilderness/wilderness_blocker.js";
import { advanceTimeMinutes, getTimeView } from "../time.js";
import { applyTimeToPlayer } from "../player.js";

/**
 * 固定执行顺序（必须严格遵守）：
 * 
 * 1. 生成 beforeSnapshot（只取必要字段）
 * 2. 执行 sysCalls（按顺序）
 *    - NEW_GAME: 重置状态
 *    - LOAD_GAME: 加载存档（整棵替换）
 *    - SAVE_GAME: 保存存档
 *    - ADVANCE_TIME: 推进时间（10分钟子步）
 *    - LOAD_MAP: 加载地图
 *    - LOAD_EVENT: 加载事件（暂占位）
 *    - LEGACY: 调用旧代码（过渡）
 * 3. 执行 effects（声明式修改）
 * 4. 执行 invariants + clamp（保证不变量）
 * 5. 生成 afterSnapshot
 * 6. 产出 report
 * 7. 返回 { ok, report, events }
 */

/**
 * 生成快照（只取关键字段）
 * 
 * @param {Object} state - 游戏状态
 * @returns {Object} 快照
 */
function makeSnapshot(state) {
  const obsBill = Number(state.world?.medical?.bills?.obsCents ?? 0);
  const wardBill = Number(state.world?.medical?.bills?.wardCents ?? 0);
  const recordsState = normalizeRecordState(state?.player?.records);
  const socialState = normalizeSocialState(state?.player?.social);
  const isDeadMode = state?.player?.exposure?.dead === true;
  const sleepMode = String(state?.player?.meta?.sleepEpisode?.mode || "").trim().toUpperCase();
  const criticalMode = isDeadMode ? "DEAD" : (sleepMode === "COLLAPSE" ? "COLLAPSE" : "NORMAL");
  const flags = state?.world?.flags || state?.flags || {};
  return {
    time: state.time.totalMinutes,
    mapId: state.currentMapId,
    money: Number(state.world?.money ?? 0),
    hp: state.player?.psycho?.hp ?? 0,
    satiety: state.player?.physio?.satiety ?? 0,
    stamina: state.player?.physio?.stamina ?? 0,
    fatigue: state.player?.psycho?.fatigue ?? 0,
    obsBillCents: obsBill,
    wardBillCents: wardBill,
    totalBillCents: obsBill + wardBill,
    criticalMode,
    dossierNeedsAttention: !!flags.dossierNeedsAttention,
    profileOpen: state?.ui?.profileOpen === true,
    socialOpen: state?.ui?.socialOpen === true,
    profilePageIntroGuideSeen: flags?.sceneTutorials?.profile_page_intro === true,
    bayportClinicWardIntroGuideSeen: flags?.sceneTutorials?.bayport_clinic_ward_intro === true,
    winddykeThermalGuideSeen: flags?.sceneTutorials?.winddyke_clinic_segment_thermal_intro === true,
    flagCount: Object.keys(state.flags || {}).length,
    recordCount: recordsState.order.length,
    socialCount: socialState.order.length
  };
}

function getSafeLogLines(state) {
  return Array.isArray(state?.logLines) ? state.logLines.filter((line) => typeof line === "string") : [];
}

function collectAdvancedMinutes(sysCallResults) {
  return sysCallResults.reduce((sum, row) => {
    if (row?.call?.type !== SYSCALL_TYPES.ADVANCE_TIME) return sum;
    return sum + Math.max(0, Number(row?.result?.advancedMinutes ?? 0));
  }, 0);
}

function normalizeRecordIntent(rawIntent) {
  if (!rawIntent || typeof rawIntent !== "object") return null;
  const type = String(rawIntent.type || "").trim();
  const recordId = String(rawIntent.recordId || "").trim();
  if (type !== "UNLOCK_RECORD" || !recordId) return null;

  const triggerSource = rawIntent.triggerContext && typeof rawIntent.triggerContext === "object"
    ? rawIntent.triggerContext
    : {};

  const triggerContext = {};
  if (triggerSource.mapId != null && String(triggerSource.mapId).trim()) {
    triggerContext.mapId = String(triggerSource.mapId).trim();
  }
  if (triggerSource.actionId != null && String(triggerSource.actionId).trim()) {
    triggerContext.actionId = String(triggerSource.actionId).trim();
  }
  // Keep commit tolerant of legacy saves while allowing current unlocks to persist sceneId.
  if (triggerSource.sceneId != null && String(triggerSource.sceneId).trim()) {
    triggerContext.sceneId = String(triggerSource.sceneId).trim();
  }
  if (triggerSource.source != null && String(triggerSource.source).trim()) {
    triggerContext.source = String(triggerSource.source).trim();
  }

  return {
    type,
    recordId,
    triggerContext: Object.keys(triggerContext).length > 0 ? triggerContext : null
  };
}

function normalizeRecordIntents(recordIntents) {
  const normalized = [];
  for (const rawIntent of Array.isArray(recordIntents) ? recordIntents : []) {
    const intent = normalizeRecordIntent(rawIntent);
    if (intent) normalized.push(intent);
  }
  return normalized;
}

function normalizeArchiveReadingIntent(rawIntent) {
  if (!rawIntent || typeof rawIntent !== "object") return null;
  const type = String(rawIntent.type || "").trim();
  const pageId = String(rawIntent.pageId || "").trim();
  const sourceBookId = String(rawIntent.sourceBookId || "").trim();
  const pageToken = String(rawIntent.pageToken || "").trim();
  if (type !== "VIEW_ARCHIVE_PAGE" || !pageId || !sourceBookId) return null;

  const triggerSource = rawIntent.triggerContext && typeof rawIntent.triggerContext === "object"
    ? rawIntent.triggerContext
    : {};
  const triggerContext = {};
  if (triggerSource.mapId != null && String(triggerSource.mapId).trim()) {
    triggerContext.mapId = String(triggerSource.mapId).trim();
  }
  if (triggerSource.actionId != null && String(triggerSource.actionId).trim()) {
    triggerContext.actionId = String(triggerSource.actionId).trim();
  }
  if (triggerSource.sceneId != null && String(triggerSource.sceneId).trim()) {
    triggerContext.sceneId = String(triggerSource.sceneId).trim();
  }
  if (triggerSource.source != null && String(triggerSource.source).trim()) {
    triggerContext.source = String(triggerSource.source).trim();
  }

  return {
    type,
    pageId,
    sourceBookId,
    pageToken: pageToken || null,
    isLeafPage: rawIntent.isLeafPage === true,
    grantFirstViewReward: rawIntent.grantFirstViewReward === true,
    triggerContext: Object.keys(triggerContext).length > 0 ? triggerContext : null
  };
}

function normalizeArchiveReadingIntents(archiveReadingIntents) {
  const normalized = [];
  for (const rawIntent of Array.isArray(archiveReadingIntents) ? archiveReadingIntents : []) {
    const intent = normalizeArchiveReadingIntent(rawIntent);
    if (intent) normalized.push(intent);
  }
  return normalized;
}

function isMenuMapId(mapId) {
  const id = String(mapId || "");
  return id === "menu" || id === "menu_more" || id.startsWith("menu_");
}

function clearStaleInquirySessionForMap(state, mapId) {
  if (!state?.ui || typeof state.ui !== "object") {
    return;
  }
  const session = state.ui.inquirySession;
  if (!session || typeof session !== "object") {
    return;
  }
  const sourceMapId = String(session.sourceMapId || "").trim();
  const nextMapId = String(mapId || "").trim();
  if (!sourceMapId || !nextMapId || sourceMapId === nextMapId) {
    return;
  }
  state.ui.inquirySession = null;
}

function clearTransientUiResidues() {
  clearTransientRuntime(TRANSIENT_CLEAR_REASONS.LOAD_SNAPSHOT);
  const app = document.getElementById("app");
  const choices = document.getElementById("choices");
  const gameRoot = document.getElementById("game-root");
  const propsToClear = ["margin-right", "width", "transform", "left", "right"];
  for (const el of [app, choices]) {
    if (!el) continue;
    for (const prop of propsToClear) {
      el.style.removeProperty(prop);
    }
  }

  document.body.classList.remove(
    "has-sidebar",
    "sidebar-expanded",
    "sidebar-collapsed",
    "menu-transition-cinematic",
    "modal-open",
    "blurred",
    "dimmed",
    "inventory-open",
    "inv-open"
  );
  document.documentElement.classList.remove("settings-modal-open");
  document.documentElement.classList.remove("inventory-open", "inv-open");
  document.body.style.removeProperty("overflow");
  delete document.body.dataset.menuPage;
  delete document.body.dataset.menuLoadTheme;
  delete document.body.dataset.skipMapTransitionOnce;
  delete document.body.dataset.forceMapTransitionOnce;
  if (gameRoot) {
    gameRoot.classList.remove("menu-mode");
  }

  const cleanupTargets = [
    "settings-overlay-root",
    "inventory-overlay-host",
    "tasks-overlay-host",
    "profile-overlay-host",
    "social-overlay-host",
    "notice-dialog-host",
    "menu-transition-overlay"
  ];
  for (const id of cleanupTargets) {
    const node = document.getElementById(id);
    if (!node) continue;
    if (id === "inventory-overlay-host" || id === "tasks-overlay-host" || id === "profile-overlay-host" || id === "social-overlay-host" || id === "notice-dialog-host") {
      node.innerHTML = "";
      node.setAttribute("aria-hidden", "true");
    } else {
      node.remove();
    }
  }

}

function logLoadedRuntimeCheckpoint(stage, state, extra = {}) {
  const body = document.body;
  const gameRoot = document.getElementById("game-root");
  console.info(`[LoadEntry] stage=${stage}`, {
    uiPage: String(state?.ui?.page || ""),
    uiModal: state?.ui?.modal ?? null,
    currentMapId: String(state?.currentMapId || ""),
    worldMapId: String(state?.world?.currentMapId || ""),
    currentMap: state?.currentMap ? String(state.currentMap.id || "") : null,
    bodyMenuPage: body?.dataset?.menuPage || null,
    bodyMenuLoadTheme: body?.dataset?.menuLoadTheme || null,
    bodyModalOpen: body?.classList?.contains("modal-open") === true,
    gameRootMenuMode: gameRoot?.classList?.contains("menu-mode") === true,
    ...extra
  });
}

function takeWildernessSurvivalVitalsSnapshot(player) {
  if (!player || typeof player !== "object") {
    return {
      stamina: 0,
      satiety: 0,
      fatigue: 0,
      temperatureC: 0,
      hypothermia: 0,
      hypoStage: "",
      hp: 0
    };
  }
  const phys = player.physio && typeof player.physio === "object" ? player.physio : {};
  const psycho = player.psycho && typeof player.psycho === "object" ? player.psycho : {};
  return {
    stamina: Number(phys.stamina),
    satiety: Number(phys.satiety),
    fatigue: Number(psycho.fatigue),
    temperatureC: Number(phys.temperatureC),
    hypothermia: Number(psycho.hypothermia),
    hypoStage: String(psycho.hypoStage || ""),
    hp: Number(psycho.hp)
  };
}

async function applyWildernessPipelineIntents(plan, activeState) {
  const results = [];
  const intents = Array.isArray(plan?.wildernessPipelineIntents) ? plan.wildernessPipelineIntents : [];
  const nowMin = Math.max(0, Math.floor(Number(activeState?.time?.totalMinutes ?? 0)));

  for (const intent of intents) {
    if (!intent || typeof intent !== "object") continue;
    if (intent.type === "WILDERNESS_START_SESSION") {
      const patch = createStartWildernessSessionPatch({
        areaSpec: intent.areaSpec,
        originMapId: String(intent.originMapId || "").trim(),
        nowMinutes: nowMin
      });
      if (!patch.ok) {
        results.push({ ok: false, type: "WILDERNESS_START_SESSION", errors: patch.errors || [] });
        continue;
      }
      if (!activeState.world || typeof activeState.world !== "object") {
        activeState.world = {};
      }
      activeState.world.wilderness = patch.wilderness;
      const runtimeMapId = String(intent.areaSpec?.runtimeMapId || "").trim();
      const runtimeMap = runtimeMapId ? await loadMap(runtimeMapId) : null;
      if (!runtimeMap) {
        results.push({
          ok: false,
          type: "WILDERNESS_START_SESSION",
          errors: [`loadMap failed: ${runtimeMapId || "(empty)"}`]
        });
        continue;
      }
      applyCommittedMapState(activeState, runtimeMapId, runtimeMap, {
        clearOverlay: true,
        clearModal: true,
        resetScene: true
      });
      if (!activeState.ui || typeof activeState.ui !== "object") {
        activeState.ui = {};
      }
      activeState.ui.transit = deriveTransitUiStateFromRuntimeTruth(activeState);
      results.push({
        ok: true,
        type: "WILDERNESS_START_SESSION",
        runtimeMapId,
        areaId: String(patch.wilderness?.areaId || "")
      });
    } else if (intent.type === "WILDERNESS_END_SESSION") {
      const cur = activeState?.world?.wilderness;
      const fallbackMapId = String(cur?.fallbackMapId || "").trim();
      const patch = createEndWildernessSessionPatch({
        currentWilderness: cur,
        reason: "manual_return",
        nowMinutes: nowMin
      });
      if (!patch.ok) {
        results.push({ ok: false, type: "WILDERNESS_END_SESSION", errors: patch.errors || [] });
        continue;
      }
      let targetMapId = fallbackMapId;
      let targetMap = targetMapId ? await loadMap(targetMapId) : null;
      if (!targetMap) {
        targetMapId = "west2_outpost_hub";
        targetMap = await loadMap(targetMapId);
      }
      if (!targetMap) {
        results.push({ ok: false, type: "WILDERNESS_END_SESSION", errors: ["fallback load failed"] });
        continue;
      }
      if (!activeState.world || typeof activeState.world !== "object") {
        activeState.world = {};
      }
      activeState.world.wilderness = patch.wilderness;
      applyCommittedMapState(activeState, targetMapId, targetMap, {
        clearOverlay: true,
        clearModal: true,
        resetScene: true
      });
      if (!activeState.ui || typeof activeState.ui !== "object") {
        activeState.ui = {};
      }
      activeState.ui.transit = deriveTransitUiStateFromRuntimeTruth(activeState);
      results.push({
        ok: true,
        type: "WILDERNESS_END_SESSION",
        targetMapId
      });
    } else if (intent.type === "WILDERNESS_MOVE") {
      const mp = intent.movementPlan;
      if (!mp || typeof mp !== "object") {
        results.push({ ok: false, type: "WILDERNESS_MOVE", errors: ["missing movementPlan"] });
        continue;
      }
      if (!mp.ok) {
        const blocker = normalizeWildernessBlocker(mp.blocker, {
          areaId: String(mp.areaId || ""),
          regionId: String(mp.regionId || ""),
          at: mp.to && typeof mp.to === "object" ? mp.to : { x: 0, y: 0 }
        });
        results.push({
          type: "WILDERNESS_MOVE",
          ok: false,
          direction: mp.direction,
          from: mp.from && typeof mp.from === "object" ? { x: mp.from.x, y: mp.from.y } : { x: 0, y: 0 },
          to: mp.to && typeof mp.to === "object" ? { x: mp.to.x, y: mp.to.y } : { x: 0, y: 0 },
          terrainId: mp.terrainId != null && mp.terrainId !== "" ? String(mp.terrainId) : null,
          blocker
        });
        continue;
      }

      const mins = Math.trunc(Number(mp.minutes) || 0);
      if (!Number.isFinite(mins) || mins < 0) {
        results.push({ ok: false, type: "WILDERNESS_MOVE", errors: ["invalid minutes"] });
        continue;
      }

      const timeRet = advanceTimeMinutes(mins, "wilderness_move", {
        isSleeping: false,
        sessionCoverage: "NONE"
      });
      const advanced = Math.max(0, Math.trunc(Number(timeRet?.advancedMinutes ?? mins)));

      if (!activeState.player || typeof activeState.player !== "object") {
        activeState.player = {};
      }
      if (!activeState.player.physio || typeof activeState.player.physio !== "object") {
        activeState.player.physio = {};
      }
      if (!activeState.player.psycho || typeof activeState.player.psycho !== "object") {
        activeState.player.psycho = {};
      }

      const beforeSurvival = takeWildernessSurvivalVitalsSnapshot(activeState.player);

      const wx = activeState.world?.weather && typeof activeState.world.weather === "object" ? activeState.world.weather : {};
      const tEnvR = Number(wx.tEnv_region);
      const windLoc = Number(wx.windSpeed_local);
      const thermalEnvOverride = {};
      if (Number.isFinite(tEnvR)) thermalEnvOverride.tEnvRegionC = tEnvR;
      if (Number.isFinite(windLoc)) thermalEnvOverride.worldWindSpeed = windLoc;

      const regionCfg = getRegionConfigById(activeState.world?.regionId);
      const placeProfileRaw = getPlaceProfileForMap(activeState.currentMapId, activeState.currentMap);
      const placeProfile =
        placeProfileRaw && typeof placeProfileRaw === "object"
          ? {
              ...placeProfileRaw,
              space: String(placeProfileRaw.space || "outdoor"),
              exposureLevel: String(placeProfileRaw.exposureLevel || "Open")
            }
          : { space: "outdoor", exposureLevel: "Open", windShelter: 0, heatSource: 0, drying: 0 };

      const baseMoveCtx = { isSleeping: false, sessionCoverage: "NONE" };
      const playerCtx = {
        ...baseMoveCtx,
        world: activeState.world,
        currentMapId: activeState.currentMapId,
        currentMap: activeState.currentMap,
        timeView: getTimeView(activeState.time.totalMinutes),
        regionCfg,
        placeProfile,
        ...(Object.keys(thermalEnvOverride).length > 0 ? { thermalEnvOverride } : {})
      };

      applyTimeToPlayer(activeState.player, advanced, playerCtx);

      const rawExtraCost = mp.staminaCost;
      const staminaExtraInfinity = rawExtraCost === Infinity;
      const staminaExtraCostFinite = staminaExtraInfinity
        ? 0
        : Math.max(0, Math.trunc(Number(rawExtraCost ?? 0)));

      if (staminaExtraInfinity) {
        activeState.player.physio.stamina = 0;
      } else {
        const curStamina = Number(activeState.player.physio.stamina);
        const baseSt = Number.isFinite(curStamina) ? curStamina : 0;
        activeState.player.physio.stamina = Math.max(0, baseSt - staminaExtraCostFinite);
      }

      const prevW = activeState.world?.wilderness && typeof activeState.world.wilderness === "object"
        ? activeState.world.wilderness
        : {};
      const nextWild = normalizeWildernessState({
        ...prevW,
        x: mp.to.x,
        y: mp.to.y,
        heading: mp.direction,
        stepsTaken: Math.max(0, Math.trunc(Number(prevW.stepsTaken ?? 0))) + 1,
        lastUpdatedAt: Math.max(0, Math.floor(Number(activeState.time?.totalMinutes ?? 0)))
      });
      activeState.world.wilderness = nextWild;

      const afterSurvival = takeWildernessSurvivalVitalsSnapshot(activeState.player);

      results.push({
        ok: true,
        type: "WILDERNESS_MOVE",
        terrainId: mp.terrainId,
        minutes: advanced,
        staminaCost: staminaExtraInfinity ? Infinity : staminaExtraCostFinite,
        from: mp.from,
        to: mp.to,
        survival: {
          playerTimeApplied: true,
          advancedMinutes: advanced,
          staminaExtraCost: staminaExtraInfinity ? null : staminaExtraCostFinite,
          staminaExtraCostInfinity: staminaExtraInfinity,
          before: beforeSurvival,
          after: afterSurvival
        }
      });
    }
  }

  return results;
}

function applyCommittedMapState(state, mapId, map, options = {}) {
  const {
    clearOverlay = true,
    clearModal = true,
    resetScene = false
  } = options;

  setCanonicalMapContext(state, mapId, map, "commit:applyCommittedMapState");
  if (!state.ui || typeof state.ui !== "object") {
    state.ui = {};
  }
  clearStaleInquirySessionForMap(state, mapId);
  state.ui.page = "map";
  if (clearOverlay) state.ui.overlay = null;
  if (clearModal) state.ui.modal = null;
  state.ui.transit = createEmptyTransitUiState();
  if (isMapContentV2(map)) {
    ensureCurrentSceneV2(state, map, "commit:applyCommittedMapState");
  } else if (resetScene) {
    state.currentSceneId = null;
    state.currentScene = null;
  }
}

function buildLoadedRuntimeState(snapshotState) {
  const state = migrateOldState(JSON.parse(JSON.stringify(snapshotState || {})));
  if (!state.ui || typeof state.ui !== "object") state.ui = {};
  state.ui.waitMinutes = 0;
  state.ui.page = "map";
  state.ui.overlay = null;
  // Menu return context must never survive a real snapshot load.
  // The loaded snapshot is the source of truth and should not be "redirected" by stale UI state.
  state.ui.menuReturnMapId = null;
  state.ui.menuReturnContext = null;
  state.ui.invFilter = "tool";
  state.ui.invSelectedItemId = null;
  state.ui.invSelectedSlot = null;
  state.ui.toast = null;
  state.ui.taskSelectedId = null;
  state.ui.socialOpen = false;
  state.ui.tasksNeedsAttention = false;
  state.ui.inventoryNeedsAttention = false;
  state.ui.workFeedback = null;
  state.ui.moneyDeltaFx = null;
  state.ui.jobSession = null;
  state.ui.inquirySession = null;
  state.ui.transit = deriveTransitUiStateFromRuntimeTruth(state);
  if (state?.player?.transit?.ride) {
    state.currentMapId = BUS_ONBOARD_MAP_ID;
    if (!state.world || typeof state.world !== "object") {
      state.world = {};
    }
    state.world.currentMapId = BUS_ONBOARD_MAP_ID;
  }
  setCanonicalMapContext(state, getCanonicalMapId(state) || "menu_main", null, "commit:buildLoadedRuntimeState");
  if (!state.meta || typeof state.meta !== "object") state.meta = {};
  return state;
}

async function reconcileMapPointers(state) {
  const mapId = getCanonicalMapId(state);
  if (!mapId) {
    return {
      reconciled: false,
      reason: "missing_map_id"
    };
  }

  setCanonicalMapContext(state, mapId, state?.currentMap || null, "commit:reconcileMapPointers:precheck");

  const loadedMapId = String(state?.currentMap?.id || "").trim();
  if (loadedMapId === mapId) {
    return {
      reconciled: false,
      reason: "already_consistent",
      mapId
    };
  }

  const reloadedMap = await loadMap(mapId);
  if (reloadedMap) {
    setCanonicalMapContext(state, mapId, reloadedMap, "commit:reconcileMapPointers:reloaded_from_map_id");
    return {
      reconciled: true,
      reason: "reloaded_from_map_id",
      mapId
    };
  }

  if (loadedMapId) {
    setCanonicalMapContext(state, loadedMapId, state?.currentMap || null, "commit:reconcileMapPointers:fallback_to_loaded_map");
    return {
      reconciled: true,
      reason: "fallback_to_loaded_map",
      mapId: loadedMapId
    };
  }

  return {
    reconciled: false,
    reason: "reload_failed_no_loaded_map",
    mapId
  };
}

async function applyLoadedSnapshot(snapshotState) {
  const runtimeState = buildLoadedRuntimeState(snapshotState);
  const requestedMapId = String(runtimeState.currentMapId || "menu_main");
  let map = await loadMap(requestedMapId);
  let finalMapId = requestedMapId;
  let fallbackReason = null;
  let resetScene = false;

  if (!map) {
    fallbackReason = `地图加载失败：${requestedMapId}`;
    finalMapId = "menu_main";
    map = await loadMap(finalMapId);
    resetScene = true;
  }

  if (!map) {
    throw new Error(`地图重载失败：${fallbackReason || finalMapId}`);
  }

  logLoadedRuntimeCheckpoint("prepared", runtimeState, {
    requestedMapId,
    finalMapId,
    fallbackReason
  });
  replaceGameState(runtimeState);
  clearTransientUiResidues();
  logLoadedRuntimeCheckpoint("state-replaced", runtimeState, {
    requestedMapId,
    finalMapId,
    fallbackReason,
    currentMapAfterReplace: runtimeState.currentMap ? String(runtimeState.currentMap.id || "") : null
  });

  applyCommittedMapState(runtimeState, finalMapId, map, {
    clearOverlay: true,
    clearModal: true,
    resetScene
  });
  runtimeState.ui.transit = deriveTransitUiStateFromRuntimeTruth(runtimeState);
  if (resetScene) {
    runtimeState.ui.menuReturnMapId = null;
  }

  if (fallbackReason) {
    runtimeState.logLines = Array.isArray(runtimeState.logLines) ? runtimeState.logLines : [];
    runtimeState.logLines.push(`[LoadFallback] ${fallbackReason}，已回退到 menu_main`);
  }

  logLoadedRuntimeCheckpoint("map-ready", runtimeState, {
    requestedMapId,
    finalMapId,
    fallbackReason
  });

  const summary = {
    state: runtimeState,
    mapId: finalMapId,
    requestedMapId,
    fallbackReason,
    mapReloaded: true
  };
  console.log(`[LoadMap] requested=${requestedMapId} final=${finalMapId} ok=true reason=${fallbackReason || "none"}`);
  return summary;
}

/**
 * Commit Plan（执行状态修改）
 * 
 * @param {Plan} plan - 执行计划
 * @param {Object} gameState - 游戏状态（会被修改！）
 * @returns {Promise<Object>} { ok: boolean, report: Object, events: Array }
 */
export async function commit(plan, gameState) {
  const startMs = Date.now();
  let activeState = gameState;
  const beforeLogLines = getSafeLogLines(activeState);
  
  // ========== 1. Before Snapshot ==========
  const beforeSnapshot = makeSnapshot(activeState);
  
  // ========== 2. 执行 SystemCalls ==========
  const sysCallResults = [];
  const triggeredEvents = [];
  
  for (let i = 0; i < plan.sysCalls.length; i++) {
    const call = plan.sysCalls[i];
    const result = await executeSysCall(call, activeState, triggeredEvents);
    if (result?.nextGameState) {
      activeState = result.nextGameState;
      delete result.nextGameState;
    }
    sysCallResults.push({
      call,
      result,
      index: i
    });
  }
  
  // ========== 3. 执行 Effects ==========
  const effectsResult = applyEffects(plan.effects, activeState);
  console.info("[SaveMenuProbe:commit]", {
    actionId: String(plan?.action?.id || ""),
    currentMapId: String(activeState?.currentMapId || "") || null,
    menuReturnMapId: String(activeState?.ui?.menuReturnMapId || "") || null
  });

  const businessApplyResult = await applyBusinessIntents(plan, activeState);
  const effectiveBusinessRejection = plan.rejection || businessApplyResult.primaryRejection || null;

  // ========== 3.15 Supply Submission (rescue_station etc.) ==========
  const supplySubmissionResults = [];
  if (Array.isArray(plan?.supplySubmissionIntents) && plan.supplySubmissionIntents.length > 0) {
    const loadedItems = await ensureItemsDbLoaded();
    if (!loadedItems.ok) {
      supplySubmissionResults.push({
        ok: false,
        reason: "ITEMS_DB_LOAD_FAILED",
        message: loadedItems.error || "物品数据库加载失败"
      });
      activeState.logLines = Array.isArray(activeState.logLines) ? activeState.logLines : [];
      activeState.logLines.push("提交失败：物品数据库加载失败。");
    } else {
      const itemsById = loadedItems.byId;
      for (const rawIntent of plan.supplySubmissionIntents) {
        const type = String(rawIntent?.type || "").trim();
        const channel = String(rawIntent?.channel || "").trim();
        const entries = Array.isArray(rawIntent?.entries) ? rawIntent.entries : [];
        if (type !== "SUBMIT_SUPPLIES" || !channel || entries.length === 0) {
          supplySubmissionResults.push({ ok: false, reason: "INTENT_INVALID" });
          continue;
        }

        const currentInv = normalizeInventory(activeState?.player?.inventory);
        const invById = new Map();
        for (const row of currentInv) {
          invById.set(row.itemId, Math.max(0, Math.floor(Number(row.qty ?? 0))));
        }

        let insufficient = false;
        const normalizedEntries = [];
        for (const row of entries) {
          const itemId = String(row?.itemId || "").trim();
          const qty = Math.max(0, Math.floor(Number(row?.qty ?? 0)));
          if (!itemId || qty <= 0) continue;
          const have = invById.get(itemId) || 0;
          if (have < qty) {
            insufficient = true;
          }
          normalizedEntries.push({ itemId, qty });
        }

        if (normalizedEntries.length === 0 || insufficient) {
          supplySubmissionResults.push({
            ok: false,
            reason: "INVENTORY_CHANGED",
            message: "物资清单已经变化。"
          });
          activeState.logLines = Array.isArray(activeState.logLines) ? activeState.logLines : [];
          activeState.logLines.push("物资清单已经变化。");
          continue;
        }

        let totalValue = 0;
        for (const row of normalizedEntries) {
          const def = itemsById.get(row.itemId);
          const submission = def?.submission && typeof def.submission === "object" ? def.submission : null;
          const enabled = submission?.enabled === true;
          if (!enabled || String(submission?.channel || "").trim() !== channel) {
            insufficient = true;
            break;
          }
          const unit = Math.max(0, Math.trunc(Number(submission?.value ?? 0)));
          totalValue += unit * row.qty;
        }

        if (insufficient) {
          supplySubmissionResults.push({
            ok: false,
            reason: "INVENTORY_CHANGED",
            message: "物资清单已经变化。"
          });
          activeState.logLines = Array.isArray(activeState.logLines) ? activeState.logLines : [];
          activeState.logLines.push("物资清单已经变化。");
          continue;
        }

        const nextInvMap = new Map(invById);
        for (const row of normalizedEntries) {
          nextInvMap.set(row.itemId, (nextInvMap.get(row.itemId) || 0) - row.qty);
        }
        const nextInventory = Array.from(nextInvMap.entries())
          .map(([itemId, qty]) => ({ itemId, qty: Math.max(0, Math.floor(Number(qty ?? 0))) }))
          .filter((row) => row.qty > 0);

        if (!activeState.player || typeof activeState.player !== "object") {
          activeState.player = {};
        }
        activeState.player.inventory = nextInventory;
        if (!activeState.world || typeof activeState.world !== "object") {
          activeState.world = {};
        }
        const moneyBefore = Math.max(0, Math.trunc(Number(activeState.world.money ?? 0)));
        activeState.world.money = moneyBefore + Math.max(0, Math.trunc(Number(totalValue || 0)));
        activeState.logLines = Array.isArray(activeState.logLines) ? activeState.logLines : [];
        activeState.logLines.push(`你把可回收物资交给伊森，获得 ${Math.max(0, Math.trunc(Number(totalValue || 0)))}。`);
        supplySubmissionResults.push({
          ok: true,
          channel,
          totalValue: Math.max(0, Math.trunc(Number(totalValue || 0))),
          itemsCount: normalizedEntries.reduce((sum, row) => sum + row.qty, 0)
        });
      }
    }
  }

  // ========== 3.25 Record Unlock ==========
  const recordIntentResults = [];
  let activeRecordsState = normalizeRecordState(activeState?.player?.records);
  let recordsStateChanged = false;
  const recordRewardProfileIntents = [];
  const archiveReadingIntentResults = [];
  let activeArchiveReadingState = normalizeArchiveReadingState(activeState?.player?.meta?.archiveReading);
  let archiveReadingStateChanged = false;
  const archiveReadingRewardProfileIntents = [];

  for (const recordIntent of normalizeRecordIntents(plan?.recordIntents)) {
    const unlockResult = tryUnlockRecord({
      recordId: recordIntent.recordId,
      recordsState: activeRecordsState,
      triggerContext: recordIntent.triggerContext
    });

    const reportRow = {
      recordId: recordIntent.recordId,
      reason: unlockResult.reason,
      ok: unlockResult.ok,
      grantedExpAmount: 0,
      rewardConsumed: false,
      rewardGrantedAfterCommit: false,
      toast: unlockResult.toast || null,
      debug: unlockResult.debug || null
    };

    if (unlockResult.reason === "first_unlock") {
      activeRecordsState = normalizeRecordState(unlockResult.nextRecordsState);
      recordsStateChanged = true;
      const socialExp = Number(unlockResult?.reward?.socialExp || 0);
      if (Number.isFinite(socialExp) && socialExp > 0) {
        reportRow.grantedExpAmount = Math.trunc(socialExp);
        recordRewardProfileIntents.push({
          type: "xp",
          key: "experience",
          amount: socialExp,
          reason: `record_unlock:${unlockResult.unlockedRecordId}`
        });
        reportRow.rewardConsumed = true;
      }
    }

    recordIntentResults.push(reportRow);
  }

  if (!activeState.player || typeof activeState.player !== "object") {
    activeState.player = {};
  }
  if (recordsStateChanged) {
    activeState.player.records = activeRecordsState;
  }
  if (!activeState.player.meta || typeof activeState.player.meta !== "object") {
    activeState.player.meta = {};
  }

  for (const archiveReadingIntent of normalizeArchiveReadingIntents(plan?.archiveReadingIntents)) {
    const viewResult = tryViewArchivePage({
      pageId: archiveReadingIntent.pageId,
      sourceBookId: archiveReadingIntent.sourceBookId,
      grantFirstViewReward: archiveReadingIntent.grantFirstViewReward === true,
      archiveReadingState: activeArchiveReadingState,
      viewedAt: activeState?.time?.totalMinutes,
      triggerContext: archiveReadingIntent.triggerContext
    });

    const reportRow = {
      pageId: archiveReadingIntent.pageId,
      sourceBookId: archiveReadingIntent.sourceBookId,
      pageToken: archiveReadingIntent.pageToken,
      reason: viewResult.reason,
      ok: viewResult.ok,
      firstView: viewResult.firstView === true,
      rewardConsumed: false,
      rewardGrantedAfterCommit: false,
      experienceGranted: 0,
      rationalGranted: 0,
      debug: viewResult.entry || null
    };

    if (viewResult.ok) {
      activeArchiveReadingState = normalizeArchiveReadingState(viewResult.nextArchiveReadingState);
      archiveReadingStateChanged = true;
    }

    if (viewResult.reason === "first_view") {
      const experienceXp = Number(viewResult?.reward?.experienceXp || 0);
      const rationalAxis = Number(viewResult?.reward?.rationalAxis || 0);
      if (Number.isFinite(experienceXp) && experienceXp > 0) {
        reportRow.experienceGranted = Math.trunc(experienceXp);
        archiveReadingRewardProfileIntents.push({
          type: "xp",
          key: "experience",
          amount: experienceXp,
          reason: `archive_page_first_view:${archiveReadingIntent.pageId}`
        });
        reportRow.rewardConsumed = true;
      }
      if (Number.isFinite(rationalAxis) && rationalAxis > 0) {
        reportRow.rationalGranted = Math.trunc(rationalAxis);
        archiveReadingRewardProfileIntents.push({
          type: "axis",
          amount: rationalAxis,
          reason: `archive_page_first_view:${archiveReadingIntent.pageId}`
        });
        reportRow.rewardConsumed = true;
      }
    }

    archiveReadingIntentResults.push(reportRow);
  }

  if (archiveReadingStateChanged) {
    activeState.player.meta.archiveReading = activeArchiveReadingState;
  }

  // ========== 3.5 Profile Delta（唯一写口） ==========
  const mergedProfileIntents = [
    ...(Array.isArray(plan?.profileIntents) ? plan.profileIntents : []),
    ...recordRewardProfileIntents,
    ...archiveReadingRewardProfileIntents
  ];
  const resolvedProfileDelta = resolveProfileDelta(mergedProfileIntents);
  const profileApplyResult = applyProfileDelta(activeState?.player?.profile, resolvedProfileDelta);
  if (!activeState.player || typeof activeState.player !== "object") {
    activeState.player = {};
  }
  activeState.player.profile = profileApplyResult.profile;

  if (recordRewardProfileIntents.length > 0) {
    let finalizedRecordsState = normalizeRecordState(activeState.player.records);
    for (const row of recordIntentResults) {
      if (row.reason !== "first_unlock" || row.rewardConsumed !== true) continue;
      finalizedRecordsState = setRecordRewardGranted(finalizedRecordsState, row.recordId, true);
      row.rewardGrantedAfterCommit = true;
    }
    activeState.player.records = finalizedRecordsState;
    recordsStateChanged = true;
  }

  if (archiveReadingRewardProfileIntents.length > 0) {
    let finalizedArchiveReadingState = normalizeArchiveReadingState(activeState.player.meta.archiveReading);
    for (const row of archiveReadingIntentResults) {
      if (row.reason !== "first_view" || row.rewardConsumed !== true) continue;
      finalizedArchiveReadingState = setArchivePageRewardGranted(finalizedArchiveReadingState, row.pageId, true);
      row.rewardGrantedAfterCommit = true;
    }
    activeState.player.meta.archiveReading = finalizedArchiveReadingState;
    archiveReadingStateChanged = true;
  }

  // ========== 3.4 Social Intents（唯一写口） ==========
  const socialApplyResult = applySocialIntents(activeState, plan?.socialIntents);
  if (!activeState.player || typeof activeState.player !== "object") {
    activeState.player = {};
  }
  activeState.player.social = normalizeSocialState(socialApplyResult.nextSocialState);

  const wildernessPipelineResults = await applyWildernessPipelineIntents(plan, activeState);
  
  // ========== 4. Invariants + Clamp ==========
  applyInvariants(activeState, String(plan?.action?.id || ""));
  const mapReconcile = await reconcileMapPointers(activeState);
  
  // ========== 5. After Snapshot ==========
  const afterSnapshot = makeSnapshot(activeState);
  
  // ========== 6. 生成 Report ==========
  // 约定：LOAD_MAP 失败不视为整体 commit 失败（保持在原地图即可），但必须在 report 里给出清晰错误。
  const loadMapFailures = sysCallResults
    .filter(x => x?.call?.type === SYSCALL_TYPES.LOAD_MAP && x?.result && x.result.ok === false)
    .map(x => ({
      targetMapId: x?.call?.params?.mapId,
      errorMessage: x?.result?.error || "地图加载失败"
    }));
  const committedSocialResults = sysCallResults.flatMap((row) =>
    Array.isArray(row?.result?.committedSocial?.results) ? row.result.committedSocial.results : []
  );
  const committedSocialIntentsCount = sysCallResults.reduce((sum, row) => {
    const intents = Array.isArray(row?.result?.committedSocial?.intents) ? row.result.committedSocial.intents.length : 0;
    return sum + intents;
  }, 0);
  const afterLogLines = getSafeLogLines(activeState);
  const addedLogLines = afterLogLines.slice(beforeLogLines.length);
  const advancedMinutes = collectAdvancedMinutes(sysCallResults);

  const report = {
    action: plan.action,
    plan: {
      sysCallsCount: plan.sysCalls.length,
      effectsCount: plan.effects.length,
      businessIntentsCount: Array.isArray(plan?.businessIntents) ? plan.businessIntents.length : 0,
      recordIntentsCount: Array.isArray(plan?.recordIntents) ? plan.recordIntents.length : 0,
      archiveReadingIntentsCount: Array.isArray(plan?.archiveReadingIntents) ? plan.archiveReadingIntents.length : 0,
      socialIntentsCount: (Array.isArray(plan?.socialIntents) ? plan.socialIntents.length : 0) + committedSocialIntentsCount,
      wildernessPipelineIntentsCount: Array.isArray(plan?.wildernessPipelineIntents) ? plan.wildernessPipelineIntents.length : 0,
      uiFeedback: plan.uiFeedback || businessApplyResult.uiFeedback || null,
      uiCommands: Array.isArray(plan?.uiCommands) ? plan.uiCommands : [],
      rejection: effectiveBusinessRejection,
      notes: plan.notes
    },
    before: beforeSnapshot,
    after: afterSnapshot,
    sysCalls: sysCallResults,
    effects: {
      applied: effectsResult.applied,
      skipped: effectsResult.skipped
    },
    profile: {
      intentsCount: mergedProfileIntents.length,
      delta: resolvedProfileDelta,
      apply: profileApplyResult.report
    },
    business: {
      intentsCount: Array.isArray(plan?.businessIntents) ? plan.businessIntents.length : 0,
      results: businessApplyResult.results
    },
    supplySubmission: {
      intentsCount: Array.isArray(plan?.supplySubmissionIntents) ? plan.supplySubmissionIntents.length : 0,
      results: supplySubmissionResults
    },
    records: {
      intentsCount: Array.isArray(plan?.recordIntents) ? plan.recordIntents.length : 0,
      results: recordIntentResults,
      state: {
        count: normalizeRecordState(activeState?.player?.records).order.length
      }
    },
    archiveReading: {
      intentsCount: Array.isArray(plan?.archiveReadingIntents) ? plan.archiveReadingIntents.length : 0,
      results: archiveReadingIntentResults,
      state: {
        count: normalizeArchiveReadingState(activeState?.player?.meta?.archiveReading).order.length
      }
    },
    social: {
      intentsCount: (Array.isArray(plan?.socialIntents) ? plan.socialIntents.length : 0) + committedSocialIntentsCount,
      results: [...committedSocialResults, ...socialApplyResult.results],
      state: {
        discoveredCount: normalizeSocialState(activeState?.player?.social).order.length
      }
    },
    wilderness: {
      intentsCount: Array.isArray(plan?.wildernessPipelineIntents) ? plan.wildernessPipelineIntents.length : 0,
      results: wildernessPipelineResults
    },
    events: triggeredEvents,
    advancedMinutes,
    logLines: addedLogLines,
    loadMapFailed: loadMapFailures.length > 0,
    targetMapId: loadMapFailures.length > 0 ? loadMapFailures[loadMapFailures.length - 1].targetMapId : undefined,
    errorMessage: loadMapFailures.length > 0 ? loadMapFailures[loadMapFailures.length - 1].errorMessage : undefined,
    loadMapFailures,
    mapReconcile,
    uiFeedback: plan.uiFeedback || businessApplyResult.uiFeedback || null,
    uiCommands: Array.isArray(plan?.uiCommands) ? plan.uiCommands : [],
    durationMs: Date.now() - startMs
  };
  
  return {
    ok: true,
    report,
    events: triggeredEvents
  };
}

/**
 * 执行单个 SystemCall
 * 
 * @param {SystemCall} call - 系统调用
 * @param {Object} gameState - 游戏状态
 * @param {Array} triggeredEvents - 触发的事件列表（输出参数）
 * @returns {Promise<Object>} { ok: boolean, ... }
 */
async function executeSysCall(call, gameState, triggeredEvents) {
  const committedEffects = {
    applied: [],
    skipped: []
  };
  const result = await executeSysCallImpl(call, gameState, triggeredEvents, {
    applyLoadedSnapshot,
    applyCommittedEffects: (effects) => {
      const effectResult = applyEffects(Array.isArray(effects) ? effects : [], gameState);
      committedEffects.applied.push(...effectResult.applied);
      committedEffects.skipped.push(...effectResult.skipped);
      return effectResult;
    }
  });

  if (committedEffects.applied.length > 0 || committedEffects.skipped.length > 0) {
    result.committedEffects = committedEffects;
  }

  return result;
}

/**
 * 应用不变量和钳制
 * 
 * 确保状态在合理范围内
 * 
 * @param {Object} gameState - 游戏状态
 */
function applyInvariants(gameState, actionId = "") {
  const beforeUi = getUiActionStateSnapshot(gameState);
  const player = gameState.player;
  
  if (!player) return;
  
  // Clamp 玩家属性到 [0, 100] 或 effectiveMax
  if (player.physio) {
    player.physio.satiety = Math.max(0, Math.min(100, player.physio.satiety || 0));
    player.physio.stamina = Math.max(0, Math.min(100, player.physio.stamina || 0));
  }
  
  if (player.psycho) {
    player.psycho.hp = Math.max(0, Math.min(100, player.psycho.hp || 0));
    player.psycho.fatigue = Math.max(0, Math.min(100, player.psycho.fatigue || 0));
  }

  player.profile = ensureProfileShape(player.profile);
  if (player.records != null) {
    player.records = normalizeRecordState(player.records);
  }
  player.social = normalizeSocialState(player.social);

  player.inventory = normalizeInventory(player.inventory);
  player.equipment = normalizeEquipment(player.equipment);
  player.tasks = normalizeTaskList(player.tasks);
  
  // 确保时间不为负
  if (gameState.time) {
    gameState.time.totalMinutes = Math.max(0, gameState.time.totalMinutes || 0);
  }

  if (gameState.world) {
    const money = Number(gameState.world.money ?? 0);
    gameState.world.money = Number.isFinite(money) ? Math.max(0, money) : 0;
    gameState.world.npcs = withNpcEnabledDefaults(gameState.world.npcs, getAllNpcDefinitions());
  }

  if (!gameState.ui || typeof gameState.ui !== "object") {
    gameState.ui = {};
  }
  const legacyPage = String(gameState.ui.page || "").trim();
  const normalizedOverlay = normalizeUiOverlay(gameState.ui.overlay);
  gameState.ui.overlay = normalizedOverlay
    || (legacyPage === "inventory" ? "inventory" : null)
    || (legacyPage === "tasks" || legacyPage === "memo" ? "tasks" : null);
  gameState.ui.page = "map";
  if (!INVENTORY_CATEGORIES.includes(String(gameState.ui.invFilter || ""))) {
    gameState.ui.invFilter = "tool";
  }
  if (typeof gameState.ui.invSelectedItemId !== "string") {
    gameState.ui.invSelectedItemId = null;
  }
  if (!EQUIPMENT_SLOT_ORDER.includes(String(gameState.ui.invSelectedSlot || ""))) {
    gameState.ui.invSelectedSlot = null;
  }
  if (typeof gameState.ui.toast !== "string") {
    gameState.ui.toast = null;
  }
  gameState.ui.socialOpen = gameState.ui.socialOpen === true;
  if (typeof gameState.ui.taskSelectedId !== "string") {
    gameState.ui.taskSelectedId = null;
  }
  gameState.ui.tasksNeedsAttention = !!gameState.ui.tasksNeedsAttention;
  gameState.ui.inventoryNeedsAttention = !!gameState.ui.inventoryNeedsAttention;

  const afterUi = getUiActionStateSnapshot(gameState);
  const isOpenAction = actionId === "ui_map_open"
    || actionId === "ui_tasks_open"
    || actionId === "ui_open_inventory"
    || actionId === "ui_memo_open";
  if (isOpenAction) {
    pushUiOpenCallchain({
      source: "ui_route:set",
      actionId,
      actionType: "GLOBAL_ACTION",
      resolveEntered: true,
      resolveExited: true,
      commitEntered: true,
      commitExited: false,
      prev: beforeUi,
      next: afterUi,
      canonicalSetterCalled: true,
      canonicalSelectorResult: {
        page: afterUi.uiPage,
        overlay: afterUi.uiOverlay
      },
      renderedSurface: null,
      violationCode: null,
      errorMessage: null
    });
  }
}
