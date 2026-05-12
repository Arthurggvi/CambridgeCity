import { WILDERNESS_MOVE_DIRECTIONS } from "./wilderness_movement_cost.js";

/**
 * Production fallback when no injectable RNG is provided (never use in contract tests).
 * @returns {number} in [0, 1)
 */
export function defaultWildernessRandom01() {
  return Math.random();
}

/**
 * Pure: lost roll + optional direction deviation for wilderness moves.
 *
 * @param {object} args
 * @param {string} args.intendedDirection
 * @param {{ random?: () => number }} [args.rngLike]
 * @param {number} [args.lostChanceBase=0.1]
 * @param {number} [args.lostChanceModifierAdditive=0]
 * @param {readonly string[]} [args.allowedDirections]
 */
export function resolveWildernessLostMoveDirection({
  intendedDirection,
  rngLike,
  lostChanceBase = 0.1,
  lostChanceModifierAdditive = 0,
  allowedDirections = WILDERNESS_MOVE_DIRECTIONS
}) {
  const intended = String(intendedDirection || "").trim();
  const dirs = Array.isArray(allowedDirections) && allowedDirections.length > 0 ? allowedDirections : WILDERNESS_MOVE_DIRECTIONS;
  const rng = typeof rngLike?.random === "function" ? rngLike.random.bind(rngLike) : defaultWildernessRandom01;

  const base = Number.isFinite(Number(lostChanceBase)) ? Number(lostChanceBase) : 0.1;
  const mod = Number.isFinite(Number(lostChanceModifierAdditive)) ? Number(lostChanceModifierAdditive) : 0;
  const finalChance = Math.max(0, Math.min(1, base + mod));

  if (!dirs.includes(intended)) {
    const roll = rng();
    return {
      lost: false,
      roll,
      baseChance: base,
      modifierAdditive: mod,
      finalChance,
      intendedDirection: intended,
      actualDirection: intended
    };
  }

  const roll = rng();
  const lost = roll < finalChance;
  let actualDirection = intended;
  if (lost) {
    const alts = dirs.filter((d) => d !== intended);
    const roll2 = rng();
    const u = Number(roll2);
    const t = Number.isFinite(u) ? Math.max(0, Math.min(0.999999999, u)) : 0;
    const idx = alts.length > 0 ? Math.floor(t * alts.length) % alts.length : 0;
    actualDirection = alts[idx] || intended;
  }

  return {
    lost,
    roll,
    baseChance: base,
    modifierAdditive: mod,
    finalChance,
    intendedDirection: intended,
    actualDirection
  };
}
