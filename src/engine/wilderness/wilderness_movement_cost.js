/** Phase 5–7: movement time/stamina from terrain defs + optional surface runtime (no gameState writes). */

export const WILDERNESS_MOVE_DIRECTIONS = Object.freeze([
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW"
]);

const DELTA_BY_DIR = Object.freeze({
  N: Object.freeze({ x: 0, y: 1 }),
  NE: Object.freeze({ x: 1, y: 1 }),
  E: Object.freeze({ x: 1, y: 0 }),
  SE: Object.freeze({ x: 1, y: -1 }),
  S: Object.freeze({ x: 0, y: -1 }),
  SW: Object.freeze({ x: -1, y: -1 }),
  W: Object.freeze({ x: -1, y: 0 }),
  NW: Object.freeze({ x: -1, y: 1 })
});

export function getWildernessDirectionDelta(direction) {
  const d = String(direction || "").trim();
  return DELTA_BY_DIR[d] ? { ...DELTA_BY_DIR[d] } : null;
}

function nonNegativeNumberOrInfinity(v) {
  if (v === Infinity || v === -Infinity) return v === Infinity ? Infinity : 0;
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

function surfaceMoveMult(surfaceRuntime) {
  if (!surfaceRuntime || typeof surfaceRuntime !== "object") return 1;
  const m = Number(surfaceRuntime.snowDepthMoveMult);
  return Number.isFinite(m) && m >= 1 ? m : 1;
}

function surfaceStaminaMult(surfaceRuntime) {
  if (!surfaceRuntime || typeof surfaceRuntime !== "object") return 1;
  const m = Number(surfaceRuntime.snowDepthStaminaMult);
  return Number.isFinite(m) && m >= 1 ? m : 1;
}

export function calculateWildernessStepMinutes({ areaSpec, terrainDef, surfaceRuntime } = {}) {
  const base = Number(areaSpec?.step?.baseMinutes);
  const mult = Number(terrainDef?.move?.moveTimeMult);
  const surfM = surfaceMoveMult(surfaceRuntime);
  if (!Number.isFinite(base) || base < 0) return 0;
  if (mult === Infinity || surfM === Infinity) return Infinity;
  if (!Number.isFinite(mult) || mult < 0) return 0;
  return Math.max(0, Math.round(base * mult * surfM));
}

export function calculateWildernessStaminaCost({ areaSpec, terrainDef, surfaceRuntime } = {}) {
  const base = Number(areaSpec?.step?.baseStaminaCost);
  const mult = Number(terrainDef?.move?.staminaCostMult);
  const surfM = surfaceStaminaMult(surfaceRuntime);
  if (!Number.isFinite(base) || base < 0) return 0;
  if (mult === Infinity || surfM === Infinity) return Infinity;
  if (!Number.isFinite(mult) || mult < 0) return 0;
  return nonNegativeNumberOrInfinity(Math.round(base * mult * surfM));
}
