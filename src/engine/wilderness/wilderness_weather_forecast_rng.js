/**
 * Deterministic PRNG for wilderness weather forecast dry-runs only.
 * No Math.random, no wall clock, no gameState.
 */

/**
 * @param {string|number|object|null|undefined} seedInput
 * @returns {number} unsigned 32-bit
 */
export function hashForecastSeed(seedInput) {
  const str =
    typeof seedInput === "string"
      ? seedInput
      : typeof seedInput === "number" && Number.isFinite(seedInput)
        ? String(seedInput)
        : JSON.stringify(seedInput ?? null);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  if (h === 0) h = 0x9e3779b9 >>> 0;
  return h >>> 0;
}

/**
 * @param {string|number|object|null|undefined} seedInput
 * @returns {{ _state: number }}
 */
export function createDeterministicForecastRng(seedInput) {
  const seed = typeof seedInput === "number" && Number.isFinite(seedInput)
    ? seedInput >>> 0
    : hashForecastSeed(seedInput);
  return { _state: seed >>> 0 || 1 };
}

/**
 * @param {{ _state: number }} rng
 * @returns {number} in [0, 1)
 */
export function randomFloat01(rng) {
  let s = rng._state >>> 0;
  s = Math.imul(s ^ (s >>> 16), 2246822519) >>> 0;
  s = Math.imul(s ^ (s >>> 13), 3266489917) >>> 0;
  s = (s ^ (s >>> 16)) >>> 0;
  rng._state = s === 0 ? 0x6eed0e9d : s;
  return (rng._state >>> 0) / 4294967296;
}

/**
 * @param {{ _state: number }} rng
 * @param {number} min
 * @param {number} max
 */
export function randomIntInclusiveWithRng(rng, min, max) {
  const a = Math.trunc(Number(min));
  const b = Math.trunc(Number(max));
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const span = hi - lo + 1;
  if (span <= 0) return lo;
  const t = Math.floor(randomFloat01(rng) * span);
  return lo + t;
}

/**
 * @param {{ _state: number }} rng
 * @param {Array<[string, number]>} weightedPairs [key, weight][]
 * @returns {string}
 */
export function pickWeightedWithRng(rng, weightedPairs) {
  const pairs = (weightedPairs || []).filter(([, w]) => Number(w) > 0);
  const total = pairs.reduce((s, [, w]) => s + Number(w), 0);
  if (total <= 0 || pairs.length === 0) return "clear";
  let cursor = randomFloat01(rng) * total;
  for (const [k, w] of pairs) {
    cursor -= Number(w);
    if (cursor <= 0) return String(k);
  }
  return String(pairs[pairs.length - 1]?.[0] || "clear");
}
