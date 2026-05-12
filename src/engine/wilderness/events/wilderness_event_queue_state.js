export const WILDERNESS_EVENT_QUEUE_SCHEMA_VERSION = 1;

export const WILDERNESS_EVENT_FRAME_TYPES = Object.freeze({
  WILDERNESS_RANDOM_EVENT: "wilderness_random_event"
});

export const WILDERNESS_EVENT_FRAME_STATUSES = Object.freeze({
  QUEUED: "queued",
  ACTIVE: "active",
  RESOLVED: "resolved"
});

export const WILDERNESS_EVENT_FRAME_PRIORITIES = Object.freeze({
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
  FORCED: "forced"
});

const FRAME_TYPE_SET = new Set(Object.values(WILDERNESS_EVENT_FRAME_TYPES));
const FRAME_STATUS_SET = new Set(Object.values(WILDERNESS_EVENT_FRAME_STATUSES));
const FRAME_PRIORITY_SET = new Set(Object.values(WILDERNESS_EVENT_FRAME_PRIORITIES));

/** Lower sort index = lower priority (dropped first when trimming). */
export const WILDERNESS_EVENT_PRIORITY_RANK = Object.freeze({
  low: 0,
  normal: 1,
  high: 2,
  forced: 3
});

const HISTORY_MAX = 20;

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normalizeNullableString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function normalizeCooldownMap(raw) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== "string" || !k.trim()) continue;
    const n = Number(v);
    out[k] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

function normalizeCooldowns(raw) {
  const base = { byEventId: {}, byCellKey: {} };
  if (!isPlainObject(raw)) return base;
  return {
    byEventId: normalizeCooldownMap(raw.byEventId),
    byCellKey: normalizeCooldownMap(raw.byCellKey)
  };
}

function isLegalFrame(f) {
  if (!isPlainObject(f)) return false;
  if (typeof f.frameId !== "string" || !f.frameId.trim()) return false;
  if (!FRAME_TYPE_SET.has(f.type)) return false;
  if (!FRAME_STATUS_SET.has(f.status)) return false;
  if (!FRAME_PRIORITY_SET.has(f.priority)) return false;
  if (typeof f.createdAtMinutes !== "number" || !Number.isFinite(f.createdAtMinutes)) return false;
  if (!isPlainObject(f.source)) return false;
  const srcPool = normalizeNullableString(f.source.poolId);
  if (!srcPool) return false;
  if (!isPlainObject(f.payload)) return false;
  const p = f.payload;
  if (typeof p.eventId !== "string" || !p.eventId.trim()) return false;
  if (typeof p.areaId !== "string" || !p.areaId.trim()) return false;
  const x = Number(p.x);
  const y = Number(p.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (typeof f.seq !== "number" || !Number.isFinite(f.seq)) return false;
  if (Object.prototype.hasOwnProperty.call(p, "poolId")) {
    const payloadPool = normalizeNullableString(p.poolId);
    if (!payloadPool || payloadPool !== srcPool) return false;
  }
  return true;
}

function normalizeHistoryEntry(raw) {
  if (!isPlainObject(raw)) return null;
  const frameId = normalizeNullableString(raw.frameId);
  const eventId = normalizeNullableString(raw.eventId);
  const poolId = normalizeNullableString(raw.poolId);
  const outcomeId = normalizeNullableString(raw.outcomeId);
  const areaId = normalizeNullableString(raw.areaId);
  const x = Number(raw.x);
  const y = Number(raw.y);
  const occurredAtMinutes = Number(raw.occurredAtMinutes);
  if (
    !frameId ||
    !eventId ||
    !poolId ||
    !outcomeId ||
    !areaId ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(occurredAtMinutes)
  ) {
    return null;
  }
  return {
    frameId,
    eventId,
    poolId,
    outcomeId,
    areaId,
    x: Math.trunc(x),
    y: Math.trunc(y),
    occurredAtMinutes
  };
}

export function createDefaultWildernessEventQueue() {
  return {
    schemaVersion: WILDERNESS_EVENT_QUEUE_SCHEMA_VERSION,
    seq: 0,
    activeFrameId: null,
    frames: [],
    tailContinuation: null,
    cooldowns: {
      byEventId: {},
      byCellKey: {}
    },
    history: []
  };
}

/**
 * @param {unknown} raw
 * @returns {ReturnType<typeof createDefaultWildernessEventQueue>}
 */
export function normalizeWildernessEventQueue(raw) {
  const base = createDefaultWildernessEventQueue();
  if (!isPlainObject(raw)) return base;

  const schemaVersion = normalizeInt(raw.schemaVersion, WILDERNESS_EVENT_QUEUE_SCHEMA_VERSION);
  const seq = Math.max(0, normalizeInt(raw.seq, 0));

  const framesIn = Array.isArray(raw.frames) ? raw.frames : [];
  const frames = [];
  const seenIds = new Set();
  for (const f of framesIn) {
    if (!isLegalFrame(f)) continue;
    const id = String(f.frameId).trim();
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const srcPool = normalizeNullableString(isPlainObject(f.source) ? f.source.poolId : null);
    const payloadOut = {
      eventId: String(f.payload.eventId).trim(),
      areaId: String(f.payload.areaId).trim(),
      x: Math.trunc(Number(f.payload.x)),
      y: Math.trunc(Number(f.payload.y))
    };
    if (Object.prototype.hasOwnProperty.call(f.payload, "poolId")) {
      payloadOut.poolId = srcPool;
    }

    frames.push({
      frameId: id,
      type: f.type,
      status: f.status,
      priority: f.priority,
      source: isPlainObject(f.source) ? { ...f.source, poolId: srcPool } : { poolId: srcPool },
      createdAtMinutes: f.createdAtMinutes,
      seq: Math.trunc(f.seq),
      payload: payloadOut
    });
  }

  const activeFrames = frames.filter((fr) => fr.status === WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE);
  let activeFrameId = null;
  if (activeFrames.length === 1) {
    activeFrameId = activeFrames[0].frameId;
  } else {
    if (activeFrames.length > 1) {
      for (const fr of frames) {
        if (fr.status === WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE) {
          fr.status = WILDERNESS_EVENT_FRAME_STATUSES.QUEUED;
        }
      }
    }
  }

  const historyRaw = Array.isArray(raw.history) ? raw.history : [];
  const historyCandidates = [];
  for (const h of historyRaw) {
    const ne = normalizeHistoryEntry(h);
    if (ne) historyCandidates.push(ne);
  }
  const history = historyCandidates.slice(-HISTORY_MAX);

  const tailContinuation =
    raw.tailContinuation != null && isPlainObject(raw.tailContinuation) && !Array.isArray(raw.tailContinuation)
      ? { ...raw.tailContinuation }
      : null;

  return {
    schemaVersion,
    seq,
    activeFrameId,
    frames,
    tailContinuation,
    cooldowns: normalizeCooldowns(raw.cooldowns),
    history
  };
}
