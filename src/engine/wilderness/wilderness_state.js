export const WILDERNESS_STATE_SCHEMA_VERSION = 1;

export const WILDERNESS_HEADINGS = Object.freeze(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);

export const WILDERNESS_SESSION_STATES = Object.freeze([
  "INACTIVE",
  "PREPARING",
  "NAVIGATING",
  "OBSERVING",
  "LANDMARK",
  "SHELTERING",
  "DISORIENTED",
  "BLOCKED",
  "RESCUE_PENDING",
  "RECOVERED"
]);

const HEADING_SET = new Set(WILDERNESS_HEADINGS);
const STATE_SET = new Set(WILDERNESS_SESSION_STATES);

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function clampWildernessMetric(value) {
  const n = typeof value === "string" ? Number(String(value).trim()) : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.trunc(n)));
}

export function normalizeWildernessHeading(value) {
  const s = value == null ? "" : String(value).trim().toUpperCase();
  return HEADING_SET.has(s) ? s : "N";
}

export function normalizeWildernessSessionStateId(value) {
  const s = value == null ? "" : String(value).trim().toUpperCase();
  if (STATE_SET.has(s)) return s;
  return "INACTIVE";
}

function normalizeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normalizeNonNegativeInt(value, fallback = 0) {
  return Math.max(0, normalizeInt(value, fallback));
}

function normalizeNullableFiniteNumber(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeLastSafePoint(raw) {
  if (!isPlainObject(raw)) return null;
  const areaId = typeof raw.areaId === "string" && raw.areaId.trim() ? raw.areaId.trim() : null;
  const mapId = typeof raw.mapId === "string" && raw.mapId.trim() ? raw.mapId.trim() : null;
  const reason = typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim() : null;
  const x = normalizeInt(raw.x, 0);
  const y = normalizeInt(raw.y, 0);
  if (!areaId || !mapId) return null;
  return { areaId, x, y, mapId, reason: reason || "unknown" };
}

function normalizeFlags(raw) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== "string" || !k.trim()) continue;
    out[k] = v;
  }
  return out;
}

function normalizeLandmarks(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const s = entry.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function createDefaultWildernessState() {
  return {
    active: false,
    regionId: null,
    areaId: null,
    originMapId: null,
    runtimeMapId: null,
    fallbackMapId: null,
    x: 0,
    y: 0,
    heading: "N",
    state: "INACTIVE",
    trailConfidence: 100,
    visibilityConfidence: 100,
    lostness: 0,
    stepsTaken: 0,
    lastSafePoint: null,
    discoveredLandmarks: [],
    flags: {},
    sessionStartedAt: null,
    lastUpdatedAt: null,
    schemaVersion: WILDERNESS_STATE_SCHEMA_VERSION
  };
}

export function normalizeWildernessState(input) {
  const base = createDefaultWildernessState();
  if (!isPlainObject(input)) {
    return { ...base };
  }

  const active = input.active === true;

  const x = normalizeInt(input.x, 0);
  const y = input.y == null ? 0 : normalizeInt(input.y, 0);

  const heading = normalizeWildernessHeading(input.heading);
  const state = normalizeWildernessSessionStateId(input.state);

  const trailConfidence = clampWildernessMetric(input.trailConfidence);
  const visibilityConfidence = clampWildernessMetric(input.visibilityConfidence);
  const lostness = clampWildernessMetric(input.lostness);

  const stepsTaken = normalizeNonNegativeInt(input.stepsTaken, 0);

  const discoveredLandmarks = normalizeLandmarks(input.discoveredLandmarks);
  const flags = normalizeFlags(input.flags);

  let regionId =
    typeof input.regionId === "string" && input.regionId.trim() ? input.regionId.trim() : null;
  let areaId = typeof input.areaId === "string" && input.areaId.trim() ? input.areaId.trim() : null;
  let originMapId =
    typeof input.originMapId === "string" && input.originMapId.trim() ? input.originMapId.trim() : null;
  let runtimeMapId =
    typeof input.runtimeMapId === "string" && input.runtimeMapId.trim() ? input.runtimeMapId.trim() : null;
  let fallbackMapId =
    typeof input.fallbackMapId === "string" && input.fallbackMapId.trim() ? input.fallbackMapId.trim() : null;

  if (!active) {
    regionId = null;
    areaId = null;
    originMapId = null;
    runtimeMapId = null;
    fallbackMapId = null;
  }

  let lastSafePoint = normalizeLastSafePoint(input.lastSafePoint);
  if (!active) {
    lastSafePoint = null;
  }

  let sessionStartedAt = normalizeNullableFiniteNumber(input.sessionStartedAt);
  let lastUpdatedAt = normalizeNullableFiniteNumber(input.lastUpdatedAt);
  if (!active) {
    sessionStartedAt = null;
  }

  return {
    ...base,
    active,
    regionId,
    areaId,
    originMapId,
    runtimeMapId,
    fallbackMapId,
    x,
    y,
    heading,
    state,
    trailConfidence,
    visibilityConfidence,
    lostness,
    stepsTaken,
    lastSafePoint,
    discoveredLandmarks,
    flags,
    sessionStartedAt,
    lastUpdatedAt,
    schemaVersion: WILDERNESS_STATE_SCHEMA_VERSION
  };
}

export function sanitizeWildernessStateForSave(input) {
  return normalizeWildernessState(input);
}

export function isWildernessActive(wilderness) {
  return Boolean(wilderness && wilderness.active === true);
}
