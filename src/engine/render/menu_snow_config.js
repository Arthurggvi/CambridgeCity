import { settingsManager } from "../../save/settings_manager.js";

export const MENU_SNOW_CANVAS_ID = "menuSnowCanvas";

export function resolveMenuSnowReduceMotion() {
  const settings = settingsManager.getSettings();
  const prefersReduced = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return !!settings?.reduceMotion || prefersReduced;
}

export function resolveMenuSnowPreset() {
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

export function getMenuSnowLayerSpec(layerId) {
  if (layerId === 1) {
    return {
      id: 1,
      alphaMin: 0.2,
      alphaMax: 0.3,
      sizeMin: 1,
      sizeMax: 1,
      baseCount: 160,
      vyMin: 0.25,
      vyMax: 0.45,
      deltaMin: 6,
      deltaMax: 14,
      segMinSec: 1.2,
      segMaxSec: 2.6,
      windWeight: 0.35
    };
  }
  if (layerId === 2) {
    return {
      id: 2,
      alphaMin: 0.35,
      alphaMax: 0.55,
      sizeMin: 1,
      sizeMax: 2,
      baseCount: 110,
      vyMin: 0.55,
      vyMax: 0.9,
      deltaMin: 10,
      deltaMax: 22,
      segMinSec: 1.05,
      segMaxSec: 2.25,
      windWeight: 0.65
    };
  }

  return {
    id: 3,
    alphaMin: 0.6,
    alphaMax: 0.85,
    sizeMin: 2,
    sizeMax: 3,
    baseCount: 70,
    vyMin: 0.95,
    vyMax: 1.45,
    deltaMin: 16,
    deltaMax: 36,
    segMinSec: 0.9,
    segMaxSec: 1.8,
    windWeight: 1.0
  };
}

export function getMenuSnowRefArea() {
  return (1280 / 3) * (720 / 3);
}

export function getMenuSnowParticleBudget() {
  return 420;
}