/**
 * Wilderness runtime main description: pure composition of terrain / time / distant view text.
 * No DOM, no RNG, no writes to game state or world.wilderness.
 */

import { getWildernessDirectionDelta } from "./wilderness_movement_cost.js";
import { getTerrainIdAtCoordinate } from "./wilderness_area_query.js";

export const WILDERNESS_RUNTIME_FINAL_TERRAIN_FALLBACK = "你站在风雪压实的野外雪面上。";

const VALID_TIME_PHASE_KEYS = new Set(["dawn", "morning", "noon", "afternoon", "evening", "midnight"]);
const VALID_VISIBILITY_BAND_KEYS = new Set(["clear", "low", "whiteout"]);

/**
 * Maps surface runtime visibilityLevel to runtime-text distant-view keys (clear | low | whiteout).
 * @param {string} visibilityLevel
 * @returns {"clear"|"low"|"whiteout"}
 */
export function mapSurfaceVisibilityToRuntimeTextBand(visibilityLevel) {
  const v = String(visibilityLevel || "").trim().toLowerCase();
  if (v === "whiteout") return "whiteout";
  if (v === "low" || v === "reduced") return "low";
  return "clear";
}

/**
 * @param {string} timePhaseRaw
 * @returns {string}
 */
export function normalizeWildernessRuntimeTimePhaseKey(timePhaseRaw) {
  const k = String(timePhaseRaw || "").trim().toLowerCase();
  if (VALID_TIME_PHASE_KEYS.has(k)) return k;
  return "";
}

/**
 * @param {string} bandRaw
 * @returns {"clear"|"low"|"whiteout"}
 */
export function normalizeWildernessRuntimeVisibilityBandKey(bandRaw) {
  const k = String(bandRaw || "").trim().toLowerCase();
  if (VALID_VISIBILITY_BAND_KEYS.has(k)) return k;
  return "clear";
}

function pushWarning(warnings, msg) {
  if (!Array.isArray(warnings)) return;
  const s = String(msg || "").trim();
  if (s) warnings.push(s);
}

/**
 * @param {*} value
 * @param {string[]} warnings
 * @param {string} path
 * @returns {string}
 */
export function normalizeWildernessRuntimeTextField(value, warnings, path) {
  if (value == null) return "";
  const t = typeof value;
  if (t === "string") return value;
  if (t === "number" || t === "boolean" || t === "bigint") return String(value);
  pushWarning(warnings, `${path}:non_string`);
  return "";
}

function firstNonEmptyNormalized(strings, warnings, basePath) {
  let i = 0;
  for (const raw of strings) {
    const s = normalizeWildernessRuntimeTextField(raw, warnings, `${basePath}[${i}]`);
    if (s !== "") return s;
    i += 1;
  }
  return "";
}

function getTerrainEntry(registry, terrainId) {
  const id = String(terrainId || "").trim();
  if (!id || !registry || typeof registry !== "object") return null;
  const row = registry[id];
  return row && typeof row === "object" ? row : null;
}

function getAreaEntry(registry, areaId) {
  const id = String(areaId || "").trim();
  if (!id || !registry || typeof registry !== "object") return null;
  const row = registry[id];
  return row && typeof row === "object" ? row : null;
}

/**
 * Forward probe along `heading` for the nearest cell whose terrainId differs from the foot cell.
 * Uses the same direction deltas as wilderness movement and `getTerrainIdAtCoordinate` for terrain resolution.
 *
 * @param {{
 *   areaSpec: object|null|undefined,
 *   x: number,
 *   y: number,
 *   heading: string,
 *   currentTerrainId: string,
 *   terrainRuntimeTextRegistry: object|null|undefined,
 *   maxDistance?: number
 * }} args
 * @returns {{
 *   text: string,
 *   targetTerrainId: string|null,
 *   distance: number|null,
 *   targetCoord: { x: number, y: number }|null,
 *   warnings: string[]
 * }}
 */
export function resolveWildernessDirectionalDistantView({
  areaSpec,
  x,
  y,
  heading,
  currentTerrainId,
  terrainRuntimeTextRegistry,
  maxDistance = 3
}) {
  const warnings = [];
  const footId = String(currentTerrainId || "").trim();
  const maxSteps = Math.max(1, Math.trunc(Number(maxDistance)) || 3);

  if (!areaSpec || typeof areaSpec !== "object") {
    return { text: "", targetTerrainId: null, distance: null, targetCoord: null, warnings };
  }

  const ax = Math.trunc(Number(x));
  const ay = Math.trunc(Number(y));
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) {
    return { text: "", targetTerrainId: null, distance: null, targetCoord: null, warnings };
  }

  const dir = String(heading || "N").trim().toUpperCase();
  const delta = getWildernessDirectionDelta(dir);
  if (!delta) {
    pushWarning(warnings, "directionalDistantView:invalid_heading");
    return { text: "", targetTerrainId: null, distance: null, targetCoord: null, warnings };
  }

  for (let step = 1; step <= maxSteps; step += 1) {
    const cx = ax + delta.x * step;
    const cy = ay + delta.y * step;
    const tidRaw = getTerrainIdAtCoordinate(areaSpec, cx, cy);
    if (tidRaw == null || String(tidRaw).trim() === "") {
      continue;
    }
    const tid = String(tidRaw).trim();
    if (tid === footId) {
      continue;
    }
    const row = getTerrainEntry(terrainRuntimeTextRegistry, tid);
    const rawDv = row && Object.prototype.hasOwnProperty.call(row, "distantView") ? row.distantView : "";
    const textNorm = normalizeWildernessRuntimeTextField(rawDv, warnings, `directionalDistantView:${tid}`);
    if (textNorm === "") {
      pushWarning(warnings, `directionalDistantView:missing_copy:${tid}`);
    }
    return {
      text: textNorm,
      targetTerrainId: tid,
      distance: step,
      targetCoord: { x: cx, y: cy },
      warnings
    };
  }

  return { text: "", targetTerrainId: null, distance: null, targetCoord: null, warnings };
}

/**
 * @param {{
 *   areaId: string,
 *   terrainId: string,
 *   timePhase: string,
 *   visibilityBand: string,
 *   terrainRuntimeTextRegistry: object|null|undefined,
 *   areaRuntimeTextRegistry: object|null|undefined,
 *   fallbackText: string|undefined|null,
 *   areaSpec?: object|null|undefined,
 *   originX?: number|null|undefined,
 *   originY?: number|null|undefined,
 *   heading?: string|null|undefined
 * }} args
 * @returns {{
 *   terrainText: string,
 *   timeText: string,
 *   distantViewText: string,
 *   description: string,
 *   warnings: string[]
 * }}
 */
export function buildWildernessRuntimeDescription({
  areaId,
  terrainId,
  timePhase,
  visibilityBand,
  terrainRuntimeTextRegistry,
  areaRuntimeTextRegistry,
  fallbackText,
  areaSpec,
  originX,
  originY,
  heading
}) {
  const warnings = [];
  const tp = normalizeWildernessRuntimeTimePhaseKey(timePhase);
  if (String(timePhase || "").trim() && !tp) {
    pushWarning(warnings, "timePhase:unknown");
  }
  void visibilityBand;

  const terrainRow = getTerrainEntry(terrainRuntimeTextRegistry, terrainId);
  const areaRow = getAreaEntry(areaRuntimeTextRegistry, areaId);

  const baseRaw = terrainRow ? terrainRow.base : "";
  const areaFallbackRaw = areaRow ? areaRow.fallbackTerrainText : "";

  const terrainText = firstNonEmptyNormalized(
    [baseRaw, areaFallbackRaw, fallbackText, WILDERNESS_RUNTIME_FINAL_TERRAIN_FALLBACK],
    warnings,
    "terrainText_chain"
  );

  const areaTimeRaw = areaRow && areaRow.timeText && typeof areaRow.timeText === "object" ? areaRow.timeText[tp] : "";
  const terrainTimeRaw =
    terrainRow && terrainRow.timeVariants && typeof terrainRow.timeVariants === "object"
      ? terrainRow.timeVariants[tp]
      : "";
  const timeText = firstNonEmptyNormalized([areaTimeRaw, terrainTimeRaw], warnings, "timeText_chain");

  const directional = resolveWildernessDirectionalDistantView({
    areaSpec,
    x: originX,
    y: originY,
    heading,
    currentTerrainId: terrainId,
    terrainRuntimeTextRegistry,
    maxDistance: 3
  });
  const distantViewText = normalizeWildernessRuntimeTextField(
    directional.text,
    warnings,
    "distantViewText_directional"
  );
  if (Array.isArray(directional.warnings)) {
    for (const w of directional.warnings) {
      pushWarning(warnings, w);
    }
  }

  const description = `${terrainText}\n${timeText}${distantViewText}`;

  return {
    terrainText,
    timeText,
    distantViewText,
    description,
    warnings
  };
}
