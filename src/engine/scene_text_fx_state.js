const ANIMATED_TABLE_KEY = "sceneTextFxAnimated";
const VIEWED_TABLE_KEY = "sceneTextFxViewed";
const DEFAULT_LIMIT = 600;

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeTable(rawTable = {}) {
  if (!isPlainObject(rawTable)) return {};
  const normalized = {};
  for (const [rawKey, rawValue] of Object.entries(rawTable)) {
    const key = String(rawKey || "").trim();
    if (!key) continue;
    const value = Number(rawValue);
    if (Number.isFinite(value) && value > 0) {
      normalized[key] = Math.trunc(value);
      continue;
    }
    if (rawValue === 1 || rawValue === true || rawValue === "1") {
      normalized[key] = 1;
    }
  }
  return normalized;
}

function getTable(state, tableKey) {
  return normalizeTable(state?.[tableKey]);
}

export function getAnimatedTable(state) {
  return getTable(state, ANIMATED_TABLE_KEY);
}

export function getViewedTable(state) {
  return getTable(state, VIEWED_TABLE_KEY);
}

export function hasAnimated(state, key) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return false;
  const table = getAnimatedTable(state);
  return Number.isFinite(Number(table[normalizedKey])) && Number(table[normalizedKey]) > 0;
}

export function hasViewed(state, key) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return false;
  const table = getViewedTable(state);
  return Number.isFinite(Number(table[normalizedKey])) && Number(table[normalizedKey]) > 0;
}

export function pruneSceneTextFxTable(table, limit = DEFAULT_LIMIT) {
  const normalized = normalizeTable(table);
  const maxSize = Math.max(20, Math.trunc(Number(limit) || DEFAULT_LIMIT));
  const entries = Object.entries(normalized);
  if (entries.length <= maxSize) return normalized;

  entries.sort((a, b) => Number(b[1]) - Number(a[1]));
  const kept = entries.slice(0, maxSize);
  return Object.fromEntries(kept);
}

function markTable(nextState, key, tableKey, reader) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return nextState;

  const table = reader(nextState);
  if (Number.isFinite(Number(table[normalizedKey])) && Number(table[normalizedKey]) > 0) {
    return {
      ...(nextState || {}),
      [tableKey]: table
    };
  }

  const now = Date.now();
  const nextTable = pruneSceneTextFxTable({
    ...table,
    [normalizedKey]: Number.isFinite(now) && now > 0 ? now : 1
  });

  return {
    ...(nextState || {}),
    [tableKey]: nextTable
  };
}

export function markAnimated(nextState, key) {
  return markTable(nextState, key, ANIMATED_TABLE_KEY, getAnimatedTable);
}

export function markViewed(nextState, key) {
  return markTable(nextState, key, VIEWED_TABLE_KEY, getViewedTable);
}
