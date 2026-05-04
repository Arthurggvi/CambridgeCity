import { BODY_SNOW_CANVAS_ID } from "./body_snow_config.js";
import {
  getBodySnowRuntimeSnapshot,
  stopBodySnowRuntime,
  syncBodySnowRuntime
} from "./body_snow_runtime.js";

function isMenuSnowPage(renderContext = {}) {
  const mapId = String(renderContext?.mapId || renderContext?.id || renderContext?.map?.id || "");
  if (mapId === "menu_main" || mapId === "menu_credits" || mapId === "menu_settings") return true;
  if (mapId !== "menu_load") return false;

  const returnMapId = String(renderContext?.menuReturnMapId || "").trim();
  const fromInGame = !!returnMapId && !returnMapId.startsWith("menu") && !returnMapId.startsWith("menu_");
  return !fromInGame;
}

export function syncMenuSnowRuntime(renderContext = {}) {
  return syncBodySnowRuntime({
    shouldRun: isMenuSnowPage(renderContext),
    surfaceKey: "menu",
    profileId: "menu",
    activeMapId: String(renderContext?.mapId || renderContext?.id || renderContext?.map?.id || ""),
    stopReason: "inactive-surface"
  });
}

export function stopMenuSnowRuntime(reason = "manual-stop") {
  const snapshot = getBodySnowRuntimeSnapshot();
  if (snapshot.activeSurfaceKey === "menu") {
    stopBodySnowRuntime(reason);
  }
}

export function getMenuSnowRuntimeSnapshot() {
  const snapshot = getBodySnowRuntimeSnapshot();
  if (!snapshot.active || snapshot.activeSurfaceKey !== "menu") {
    return {
      active: false,
      reason: snapshot.reason,
      canvasId: BODY_SNOW_CANVAS_ID,
      parentTag: null,
      internalW: 0,
      internalH: 0,
      scale: null,
      perfMode: null,
      densityMul: null,
      reduceMotion: null,
      particleCounts: [],
      totalParticles: 0,
      activeMapId: null
    };
  }
  return {
    active: true,
    reason: snapshot.reason,
    canvasId: snapshot.canvasId,
    parentTag: snapshot.parentTag,
    internalW: snapshot.internalW,
    internalH: snapshot.internalH,
    scale: snapshot.scale,
    perfMode: snapshot.perfMode,
    densityMul: snapshot.densityMul,
    reduceMotion: snapshot.reduceMotion,
    particleCounts: snapshot.particleCounts,
    totalParticles: snapshot.totalParticles,
    activeMapId: snapshot.activeMapId
  };
}