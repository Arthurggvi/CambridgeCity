function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

const FORBIDDEN_TAIL_KEYS = new Set([
  "actionId",
  "originalActionId",
  "dispatchPayload",
  "movementAction",
  "action",
  "mapAction",
  "originalDispatch",
  "originalPayload"
]);

const ALLOWED_MODES = new Set(["return_to_wilderness", "transition", "none"]);

/**
 * Recursively scans tailContinuation object trees for forbidden keys (any depth).
 * @returns {string | null} dotted path to first forbidden key, or null
 */
export function findForbiddenWildernessTailContinuationKey(value, pathPrefix = "") {
  if (value == null) return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const sub = pathPrefix === "" ? `[${i}]` : `${pathPrefix}[${i}]`;
      const hit = findForbiddenWildernessTailContinuationKey(value[i], sub);
      if (hit) return hit;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;
  for (const key of Object.keys(value)) {
    const here = pathPrefix === "" ? key : `${pathPrefix}.${key}`;
    if (FORBIDDEN_TAIL_KEYS.has(key)) {
      return here;
    }
    const hit = findForbiddenWildernessTailContinuationKey(value[key], here);
    if (hit) return hit;
  }
  return null;
}

/**
 * Read-only interpretation of queue.tailContinuation (no replay / dispatch).
 * @param {{ tailContinuation?: unknown }} queue
 * @returns {{
 *   ok: boolean,
 *   mode?: string,
 *   error?: string,
 *   tailContinuation?: object | null
 * }}
 */
export function resolveWildernessEventTailContinuation(queue) {
  const tc = queue?.tailContinuation;
  if (tc == null) {
    return { ok: true, mode: "none", tailContinuation: null };
  }
  if (!isPlainObject(tc)) {
    return { ok: false, error: "tailContinuation must be a plain object or null" };
  }
  const forbiddenPath = findForbiddenWildernessTailContinuationKey(tc);
  if (forbiddenPath != null) {
    return { ok: false, error: `tailContinuation forbids key at "${forbiddenPath}"` };
  }
  const mode = tc.mode;
  if (typeof mode !== "string" || !ALLOWED_MODES.has(mode)) {
    return { ok: false, error: "tailContinuation.mode must be one of return_to_wilderness | transition | none" };
  }
  return { ok: true, mode, tailContinuation: tc };
}
