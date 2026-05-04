import { advanceTimeMinutes, getTimeView } from "../../time.js";
import { applyTimeToPlayer } from "../../player.js";
import { loadMap, getRegionConfigById, getPlaceProfileForMap } from "../../loader.js";
import { saveManager } from "../../../save/save_manager.js";
import { settingsManager } from "../../../save/settings_manager.js";
import { SYSCALL_TYPES } from "../plan_types.js";
import { setCanonicalMapContext } from "../../map_context.js";
import { createEmptyTransitUiState } from "../../transit/transit_session.js";
import { ensureCurrentSceneV2, isMapContentV2 } from "../../map_content_v2.js";
import { createDefaultGameState, replaceGameState } from "../../state.js";
import { syncAchievementMirrorFromStore } from "../../achievement_store.js";
import { applyProfileCoreValuePatch } from "../../profile/commit.js";
import { applySocialIntents } from "../social_commit_adapter.js";
import { normalizeSocialState } from "../../social/social_state.js";
import { buildSocialIntentFromEffectRow } from "../social_effect_rows.js";

function isMenuMapId(mapId) {
  const id = String(mapId || "");
  return id === "menu" || id === "menu_more" || id.startsWith("menu_");
}

function clearStaleInquirySessionForMap(gameState, mapId) {
  if (!gameState.ui || typeof gameState.ui !== "object") {
    return;
  }
  const session = gameState.ui.inquirySession;
  if (!session || typeof session !== "object") {
    return;
  }
  const sourceMapId = String(session.sourceMapId || "").trim();
  const nextMapId = String(mapId || "").trim();
  if (!sourceMapId || !nextMapId || sourceMapId === nextMapId) {
    return;
  }
  gameState.ui.inquirySession = null;
}

function commitLoadedMapState(gameState, mapId, map, options = {}) {
  const {
    clearOverlay = true,
    clearModal = true,
    resetScene = true
  } = options;

  setCanonicalMapContext(gameState, mapId, map, "syscall:commitLoadedMapState");
  if (!gameState.ui || typeof gameState.ui !== "object") {
    gameState.ui = {};
  }
  clearStaleInquirySessionForMap(gameState, mapId);
  gameState.ui.page = "map";
  if (clearOverlay) gameState.ui.overlay = null;
  if (clearModal) gameState.ui.modal = null;
    gameState.ui.transit = createEmptyTransitUiState();
  if (isMapContentV2(map)) {
    ensureCurrentSceneV2(gameState, map, "syscall:commitLoadedMapState");
  } else if (resetScene) {
    gameState.currentSceneId = null;
    gameState.currentScene = null;
  }
}

function buildMapEnterSocialIntents(gameState, map, mapId) {
  const socialEffects = Array.isArray(map?.onEnterEffects?.socialEffects)
    ? map.onEnterEffects.socialEffects
    : [];
  const intents = [];
  for (const effect of socialEffects) {
    const built = buildSocialIntentFromEffectRow(effect, {
      mapId: String(mapId || map?.id || "").trim() || null,
      actionId: null,
      sceneId: String(gameState?.currentScene?.id || gameState?.currentSceneId || "").trim() || null,
      atMinute: Number(gameState?.time?.totalMinutes ?? 0),
      reason: `${String(mapId || map?.id || "")}:map_enter`
    });
    if (!built?.ok || !built.intent) continue;
    intents.push(built.intent);
  }
  return intents;
}

function applyCommittedSocialIntents(gameState, socialIntents) {
  const result = applySocialIntents(gameState, socialIntents);
  if (!gameState.player || typeof gameState.player !== "object") {
    gameState.player = {};
  }
  gameState.player.social = normalizeSocialState(result.nextSocialState);
  return result;
}

export async function executeSysCallImpl(call, gameState, triggeredEvents, helpers) {
  const { applyLoadedSnapshot, applyCommittedEffects } = helpers;
  const { type, params } = call;

  try {
    switch (type) {
      case SYSCALL_TYPES.NEW_GAME: {
        const nextState = createDefaultGameState();
        setCanonicalMapContext(nextState, "menu_main", null, "syscall:NEW_GAME");
        replaceGameState(nextState);
        syncAchievementMirrorFromStore(nextState);

        return { ok: true, type: "NEW_GAME", saved: false, nextGameState: nextState };
      }

      case SYSCALL_TYPES.SAVE_GAME: {
        const { slotId, sourceActionId } = params;
        const slotIdParsed = slotId === "auto" ? "auto" : parseInt(slotId, 10);
        const mapId = String(gameState.currentMapId || gameState.world?.currentMapId || "");
        const inMenu = isMenuMapId(mapId);
        const returnMapId = String(gameState?.ui?.menuReturnMapId || "").trim();
        const hasInGameContext = returnMapId && !isMenuMapId(returnMapId);
        if (inMenu && !hasInGameContext) {
          const totalMinutes = Math.max(0, Number(gameState?.time?.totalMinutes || 0));
          const audit = {
            actionId: String(sourceActionId || "unknown"),
            slotId: slotIdParsed,
            isAuto: slotIdParsed === "auto",
            currentMapId: mapId || null,
            effectiveMapId: null,
            previousMapId: String(gameState?.previousMapId || "").trim() || null,
            menuReturnMapId: returnMapId || null,
            inMenu,
            day: Math.floor(totalMinutes / 1440) + 1,
            totalMinutes,
            result: "rejected",
            reasonCode: "menu_surface_no_game_context"
          };
          console.warn(`[SaveAudit] actionId=${audit.actionId} slotId=${audit.slotId} isAuto=${audit.isAuto ? "yes" : "no"} currentMapId=${audit.currentMapId || "null"} effectiveMapId=${audit.effectiveMapId || "null"} previousMapId=${audit.previousMapId || "null"} ui.menuReturnMapId=${audit.menuReturnMapId || "null"} inMenu=${audit.inMenu ? "yes" : "no"} day=${audit.day} totalMinutes=${audit.totalMinutes} result=${audit.result} reason=${audit.reasonCode}`, audit);
          return {
            ok: false,
            type: "SAVE_GAME",
            slotId: slotIdParsed,
            audit,
            error: "主菜单阶段不可保存"
          };
        }
        const result = saveManager.saveToSlot(slotIdParsed, gameState, { sourceActionId });

        if (result.ok) {
          gameState.meta.saveSlotId = slotIdParsed;
        }

        return {
          ok: result.ok,
          type: "SAVE_GAME",
          slotId: slotIdParsed,
          audit: result.audit,
          error: result.error
        };
      }

      case SYSCALL_TYPES.LOAD_SLOT: {
        const { slotId } = params;
        const slotIdParsed = slotId === "auto" ? "auto" : (typeof slotId === "string" ? parseInt(slotId, 10) : slotId);
        const result = saveManager.loadFromSlot(slotIdParsed);

        if (result.ok) {
          const applySummary = await applyLoadedSnapshot(result.snapshotState);
          syncAchievementMirrorFromStore(applySummary.state);
          const totalMinutes = Number(result.snapshotState?.time?.totalMinutes ?? 0);
          const day = Math.floor(Math.max(0, totalMinutes) / 1440) + 1;
          const flagsCount = result.snapshotState?.flags && typeof result.snapshotState.flags === "object"
            ? Object.keys(result.snapshotState.flags).length
            : 0;
          const logLinesCount = Array.isArray(result.snapshotState?.logLines)
            ? result.snapshotState.logLines.length
            : 0;
          console.log(`[LoadApply] slot=${slotIdParsed} schema=v${result.schemaVersion || "?"} time=${totalMinutes} day=${day} map=${applySummary.mapId} flags=${flagsCount} logs=${logLinesCount} reload=${applySummary.mapReloaded ? "ok" : "failed"} reason=${applySummary.fallbackReason || "none"}`);

          return {
            ok: true,
            type: SYSCALL_TYPES.LOAD_SLOT,
            slotId: slotIdParsed,
            usedBackup: result.usedBackup,
            mapReloaded: !!applySummary.mapReloaded,
            mapId: applySummary.mapId,
            requestedMapId: applySummary.requestedMapId,
            fallbackReason: applySummary.fallbackReason,
            nextGameState: applySummary.state
          };
        } else if (slotIdParsed === "auto") {
          const fallback = await loadMap("menu_load");
          if (fallback) {
            commitLoadedMapState(gameState, "menu_load", fallback, {
              clearOverlay: true,
              clearModal: true,
              resetScene: true
            });
          }
        }

        return {
          ok: false,
          type: SYSCALL_TYPES.LOAD_SLOT,
          slotId: slotIdParsed,
          usedBackup: result.usedBackup,
          redirectedToLoadMenu: !result.ok && slotIdParsed === "auto",
          error: result.error
        };
      }

      case SYSCALL_TYPES.DELETE_SLOT: {
        const { slotId } = params;
        const slotIdParsed = slotId === "auto" ? "auto" : parseInt(slotId, 10);
        const result = saveManager.deleteSlot(slotIdParsed);

        return {
          ok: result.ok,
          type: "DELETE_SLOT",
          slotId: slotIdParsed,
          error: result.error
        };
      }

      case SYSCALL_TYPES.ADD_SLOT: {
        const result = saveManager.addSlot();
        return {
          ok: result.ok,
          type: "ADD_SLOT",
          slotId: result.slotId,
          error: result.error
        };
      }

      case SYSCALL_TYPES.RENAME_SLOT: {
        const { slotId, displayName } = params;
        const slotIdParsed = parseInt(slotId, 10);
        const result = saveManager.renameSlot(slotIdParsed, String(displayName || ""));
        return {
          ok: result.ok,
          type: "RENAME_SLOT",
          slotId: slotIdParsed,
          displayName: result.displayName,
          error: result.error
        };
      }

      case SYSCALL_TYPES.EXPORT_SLOT: {
        const { slotId } = params;
        const slotIdParsed = slotId === "auto" ? "auto" : parseInt(slotId, 10);
        const result = saveManager.exportSlot(slotIdParsed);
        return {
          ok: result.ok,
          type: "EXPORT_SLOT",
          slotId: slotIdParsed,
          jsonString: result.jsonString,
          error: result.error
        };
      }

      case SYSCALL_TYPES.IMPORT_SLOT: {
        const { slotId, jsonString } = params;
        const slotIdParsed = parseInt(slotId, 10);
        const result = saveManager.importToSlot(slotIdParsed, String(jsonString || ""));
        return {
          ok: result.ok,
          type: "IMPORT_SLOT",
          slotId: slotIdParsed,
          error: result.error
        };
      }

      case SYSCALL_TYPES.WRITE_SETTINGS: {
        const { mode, key, value } = params;
        const result = mode === "toggle"
          ? settingsManager.toggleByKey(String(key || ""))
          : mode === "reset"
            ? settingsManager.resetToDefaults()
            : settingsManager.setByKey(String(key || ""), value);
        settingsManager.applyToDocument();
        return {
          ok: result.ok,
          type: "WRITE_SETTINGS",
          key,
          mode,
          value,
          error: result.error
        };
      }

      case SYSCALL_TYPES.DEBUG_SET_PROFILE_CORE_VALUES: {
        const patch = params && typeof params === "object" ? { ...params } : {};
        const applyResult = applyProfileCoreValuePatch(gameState?.player?.profile, patch);
        if (!gameState.player || typeof gameState.player !== "object") {
          gameState.player = {};
        }
        gameState.player.profile = applyResult.profile;
        return {
          ok: true,
          type: "DEBUG_SET_PROFILE_CORE_VALUES",
          patch,
          report: applyResult.report
        };
      }

      case SYSCALL_TYPES.ADVANCE_TIME: {
        const { minutes, reason, ctx } = params;
        const timeResult = advanceTimeMinutes(minutes, reason, ctx || null);
        const advancedMinutes = Number(timeResult?.advancedMinutes ?? minutes);
        const medicalEffects = Array.isArray(timeResult?.effects) ? timeResult.effects : [];
        const medicalEffectsResult = medicalEffects.length > 0 && typeof applyCommittedEffects === "function"
          ? applyCommittedEffects(medicalEffects)
          : { applied: [], skipped: [] };

        const baseCtx = ctx && typeof ctx === "object" ? { ...ctx } : { isSleeping: false };
        const regionCfg = getRegionConfigById(gameState.world?.regionId);
        const placeProfile = getPlaceProfileForMap(gameState.currentMapId, gameState.currentMap);
        const playerCtx = {
          ...baseCtx,
          world: gameState.world,
          currentMapId: gameState.currentMapId,
          currentMap: gameState.currentMap,
          timeView: getTimeView(gameState.time.totalMinutes),
          regionCfg,
          placeProfile
        };

        const playerResult = applyTimeToPlayer(gameState.player, advancedMinutes, playerCtx);

        if (playerResult.events && playerResult.events.length > 0) {
          triggeredEvents.push(...playerResult.events);
        }

        return {
          ok: true,
          type: "ADVANCE_TIME",
          requestedMinutes: minutes,
          advancedMinutes,
          reason,
          blockedBy: timeResult?.blockedBy || null,
          committedEffects: medicalEffectsResult,
          events: playerResult.events
        };
      }

      case SYSCALL_TYPES.LOAD_MAP: {
        const { mapId } = params;
        const map = await loadMap(mapId);

        if (map) {
          commitLoadedMapState(gameState, mapId, map, {
            clearOverlay: true,
            clearModal: true,
            resetScene: true
          });

          const { buildOnMapEnteredMedicalEffects } = await import("../../medical_runtime.js");
          const medicalEffects = buildOnMapEnteredMedicalEffects(gameState, mapId);
          const medicalEffectsResult = medicalEffects.length > 0 && typeof applyCommittedEffects === "function"
            ? applyCommittedEffects(medicalEffects)
            : { applied: [], skipped: [] };

          const mapEnterSocialIntents = buildMapEnterSocialIntents(gameState, map, mapId);
          const committedSocial = mapEnterSocialIntents.length > 0
            ? applyCommittedSocialIntents(gameState, mapEnterSocialIntents)
            : { nextSocialState: normalizeSocialState(gameState?.player?.social), results: [] };

          return {
            ok: true,
            type: "LOAD_MAP",
            mapId,
            committedEffects: medicalEffectsResult,
            committedSocial: {
              intents: mapEnterSocialIntents,
              results: committedSocial.results
            }
          };
        }

        return {
          ok: false,
          type: "LOAD_MAP",
          mapId,
          error: `地图加载失败：${mapId}`
        };
      }

      case SYSCALL_TYPES.LOAD_EVENT: {
        const { eventId } = params;
        const { runEventById } = await import("../../events.js");
        const r = await runEventById(eventId);

        return {
          ok: !!r.ok,
          type: "LOAD_EVENT",
          eventId,
          didNavigate: r.didNavigate,
          error: r.error
        };
      }

      case SYSCALL_TYPES.LEGACY: {
        const { actionId } = params;
        const { runLegacyAction } = await import("../../events.js");
        await runLegacyAction(actionId);

        return {
          ok: true,
          type: "LEGACY",
          actionId,
          note: "使用旧代码处理"
        };
      }

      default:
        return {
          ok: false,
          type,
          error: `未知的 SystemCall 类型: ${type}`
        };
    }
  } catch (error) {
    console.error(`[Commit] SystemCall 执行失败:`, call, error);
    return {
      ok: false,
      type,
      error: error.message
    };
  }
}
