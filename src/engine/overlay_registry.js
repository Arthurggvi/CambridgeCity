import { UI_OVERLAY_TYPES } from "./ui_route.js";

export const MAP_OVERLAY_KEYS = Object.freeze([
  "tasks",
  "inventory",
  UI_OVERLAY_TYPES.MAP_MINIMAP
]);

export function createMapOverlayRegistry(entries = {}) {
  const registry = {};

  for (const key of MAP_OVERLAY_KEYS) {
    const row = entries[key];
    if (!row || typeof row !== "object") {
      throw new Error(`createMapOverlayRegistry missing entry for key=${key}`);
    }
    if (typeof row.hostId !== "string" || !row.hostId.trim()) {
      throw new Error(`overlay registry entry requires hostId for key=${key}`);
    }
    if (typeof row.buildViewModel !== "function") {
      throw new Error(`overlay registry entry requires buildViewModel for key=${key}`);
    }
    if (typeof row.commit !== "function") {
      throw new Error(`overlay registry entry requires commit for key=${key}`);
    }
    if (typeof row.transitionPreset !== "string" || !row.transitionPreset.trim()) {
      throw new Error(`overlay registry entry requires transitionPreset for key=${key}`);
    }

    registry[key] = Object.freeze({
      key,
      hostId: row.hostId,
      buildViewModel: row.buildViewModel,
      commit: row.commit,
      transitionPreset: row.transitionPreset,
      deactivate: typeof row.deactivate === "function" ? row.deactivate : (() => {})
    });
  }

  return Object.freeze(registry);
}

export function getMapOverlayEntry(registry, key) {
  const overlayKey = String(key || "").trim();
  if (!overlayKey || !registry || typeof registry !== "object") return null;
  return registry[overlayKey] || null;
}

export function listMapOverlayEntries(registry) {
  if (!registry || typeof registry !== "object") return [];
  return MAP_OVERLAY_KEYS.map((key) => registry[key]).filter(Boolean);
}
