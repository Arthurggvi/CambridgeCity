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

// Diagonal steps physically cover √2 cells of distance; cardinal steps cover 1.
// Time, stamina and stepMeters all share this factor — kept as a single pure
// function so resolver / probe / contract tests stay in lock-step. Unknown /
// missing directions degrade to 1 so existing callers without a `direction`
// argument keep their previous (orthogonal-shaped) results.
export function getWildernessDirectionDistanceMultiplier(direction) {
  const d = String(direction || "").trim();
  return d === "NE" || d === "SE" || d === "SW" || d === "NW"
    ? Math.SQRT2
    : 1;
}

// Plan/report-only helper. Truth coordinates are still integer (x,y); this is
// purely for distance summaries and contract assertions. Returns 0 for missing
// or invalid metersPerCell so downstream consumers can treat falsy as "n/a".
export function calculateWildernessStepMeters({ areaSpec, direction } = {}) {
  const meters = Number(areaSpec?.step?.metersPerCell);
  const baseMeters = Number.isFinite(meters) && meters > 0 ? meters : 0;
  return baseMeters * getWildernessDirectionDistanceMultiplier(direction);
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

export function calculateWildernessStepMinutes({ areaSpec, terrainDef, surfaceRuntime, direction } = {}) {
  const base = Number(areaSpec?.step?.baseMinutes);
  const mult = Number(terrainDef?.move?.moveTimeMult);
  const surfM = surfaceMoveMult(surfaceRuntime);
  const distM = getWildernessDirectionDistanceMultiplier(direction);
  if (!Number.isFinite(base) || base < 0) return 0;
  // Infinity must propagate so hard-terrain previews stay impassable even when
  // distanceMult kicks in. distanceMult itself is always finite (1 or √2).
  if (mult === Infinity || surfM === Infinity) return Infinity;
  if (!Number.isFinite(mult) || mult < 0) return 0;
  return Math.max(0, Math.round(base * distM * mult * surfM));
}

export function calculateWildernessStaminaCost({ areaSpec, terrainDef, surfaceRuntime, direction } = {}) {
  const base = Number(areaSpec?.step?.baseStaminaCost);
  const mult = Number(terrainDef?.move?.staminaCostMult);
  const surfM = surfaceStaminaMult(surfaceRuntime);
  const distM = getWildernessDirectionDistanceMultiplier(direction);
  if (!Number.isFinite(base) || base < 0) return 0;
  if (mult === Infinity || surfM === Infinity) return Infinity;
  if (!Number.isFinite(mult) || mult < 0) return 0;
  return nonNegativeNumberOrInfinity(Math.round(base * distM * mult * surfM));
}
