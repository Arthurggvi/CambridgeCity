import { settingsManager } from "../../save/settings_manager.js";

export const BODY_SNOW_CANVAS_ID = "menuSnowCanvas";

export function resolveBodySnowReduceMotion() {
  const settings = settingsManager.getSettings();
  const prefersReduced = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return !!settings?.reduceMotion || prefersReduced;
}

export function resolveBodySnowPreset() {
  const settings = settingsManager.getSettings();
  const perfMode = String(settings?.perfPreset || "balanced");

  let scale = 3;
  let densityMul = 1;
  if (perfMode === "performance") {
    scale = 4;
    densityMul = 0.5;
  } else if (perfMode === "quality") {
    scale = 2;
    densityMul = 1.15;
  }

  return { perfMode, scale, densityMul };
}

export function getBodySnowLayerSpec(profileId, layerId) {
  const normalizedProfileId = String(profileId || "default").trim().toLowerCase();
  const isMenu = normalizedProfileId === "menu";

  if (layerId === 1) {
    return {
      id: 1,
      alphaMin: isMenu ? 0.18 : 0.2,
      alphaMax: isMenu ? 0.28 : 0.3,
      sizeMin: 1,
      sizeMax: 1,
      baseCount: isMenu ? 150 : 160,
      vyMin: isMenu ? 0.22 : 0.25,
      vyMax: isMenu ? 0.42 : 0.45,
      deltaMin: 6,
      deltaMax: 14,
      segMinSec: isMenu ? 1.35 : 1.2,
      segMaxSec: isMenu ? 2.9 : 2.6,
      windWeight: 0.35
    };
  }

  if (layerId === 2) {
    return {
      id: 2,
      alphaMin: isMenu ? 0.38 : 0.35,
      alphaMax: isMenu ? 0.56 : 0.55,
      sizeMin: 1,
      sizeMax: 2,
      baseCount: isMenu ? 130 : 110,
      vyMin: isMenu ? 0.5 : 0.55,
      vyMax: isMenu ? 0.92 : 0.9,
      deltaMin: 10,
      deltaMax: 22,
      segMinSec: 1.05,
      segMaxSec: 2.25,
      windWeight: 0.65
    };
  }

  return {
    id: 3,
    alphaMin: isMenu ? 0.62 : 0.6,
    alphaMax: isMenu ? 0.86 : 0.85,
    sizeMin: 2,
    sizeMax: isMenu ? 4 : 3,
    baseCount: isMenu ? 90 : 70,
    vyMin: isMenu ? 0.9 : 0.95,
    vyMax: isMenu ? 1.55 : 1.45,
    deltaMin: 16,
    deltaMax: 36,
    segMinSec: 0.9,
    segMaxSec: 1.8,
    windWeight: 1.0
  };
}

export function getBodySnowRefArea() {
  return (1280 / 3) * (720 / 3);
}

export function getBodySnowParticleBudget(profileId) {
  const normalizedProfileId = String(profileId || "default").trim().toLowerCase();
  void normalizedProfileId;
  return 420;
}