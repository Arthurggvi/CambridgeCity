import {
  WILDERNESS_EVENT_FRAME_STATUSES,
  WILDERNESS_EVENT_FRAME_TYPES,
  WILDERNESS_EVENT_FRAME_PRIORITIES,
  WILDERNESS_EVENT_PRIORITY_RANK,
  normalizeWildernessEventQueue
} from "./wilderness_event_queue_state.js";

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export function cloneWildernessEventQueue(queue) {
  const q = normalizeWildernessEventQueue(queue);
  return {
    schemaVersion: q.schemaVersion,
    seq: q.seq,
    activeFrameId: q.activeFrameId,
    frames: q.frames.map((f) => ({
      frameId: f.frameId,
      type: f.type,
      status: f.status,
      priority: f.priority,
      source: { ...f.source },
      createdAtMinutes: f.createdAtMinutes,
      seq: f.seq,
      payload: { ...f.payload }
    })),
    tailContinuation: q.tailContinuation == null ? null : { ...q.tailContinuation },
    cooldowns: {
      byEventId: { ...q.cooldowns.byEventId },
      byCellKey: { ...q.cooldowns.byCellKey }
    },
    history: q.history.map((h) => ({ ...h }))
  };
}

/**
 * @param {object} input
 * @param {number} input.seq — used for frame.seq and default frameId suffix (no RNG / Date).
 * @param {string} [input.frameId]
 * @param {string} [input.type] — first version: wilderness_random_event only
 * @param {string} [input.status] — default queued
 * @param {string} [input.priority] — default normal
 * @param {object} [input.source]
 * @param {number} input.createdAtMinutes
 * @param {object} input.source — must include poolId (canonical; non-empty string)
 * @param {object} input.payload — eventId, areaId, x, y; optional poolId must match source.poolId when present
 */
export function createWildernessEventFrame(input) {
  if (!isPlainObject(input)) {
    throw new Error("createWildernessEventFrame: input must be a plain object");
  }
  const seqNum = Number(input.seq);
  if (!Number.isFinite(seqNum)) {
    throw new Error("createWildernessEventFrame: seq must be a finite number");
  }
  const seq = Math.trunc(seqNum);
  const frameId =
    input.frameId != null && String(input.frameId).trim()
      ? String(input.frameId).trim()
      : `wilderness_evt_${seq}`;

  const type =
    input.type != null && String(input.type).trim()
      ? String(input.type).trim()
      : WILDERNESS_EVENT_FRAME_TYPES.WILDERNESS_RANDOM_EVENT;
  if (type !== WILDERNESS_EVENT_FRAME_TYPES.WILDERNESS_RANDOM_EVENT) {
    throw new Error("createWildernessEventFrame: unsupported frame type");
  }

  let status = input.status ?? WILDERNESS_EVENT_FRAME_STATUSES.QUEUED;
  if (!Object.values(WILDERNESS_EVENT_FRAME_STATUSES).includes(status)) {
    status = WILDERNESS_EVENT_FRAME_STATUSES.QUEUED;
  }

  let priority = input.priority ?? WILDERNESS_EVENT_FRAME_PRIORITIES.NORMAL;
  if (!Object.values(WILDERNESS_EVENT_FRAME_PRIORITIES).includes(priority)) {
    priority = WILDERNESS_EVENT_FRAME_PRIORITIES.NORMAL;
  }

  const createdAtMinutes = Number(input.createdAtMinutes);
  if (!Number.isFinite(createdAtMinutes)) {
    throw new Error("createWildernessEventFrame: createdAtMinutes must be a finite number");
  }

  if (!isPlainObject(input.source)) {
    throw new Error("createWildernessEventFrame: source must be a plain object");
  }
  const srcPool =
    input.source.poolId != null && String(input.source.poolId).trim()
      ? String(input.source.poolId).trim()
      : null;
  if (!srcPool) {
    throw new Error("createWildernessEventFrame: source.poolId must be a non-empty string");
  }

  if (!isPlainObject(input.payload)) {
    throw new Error("createWildernessEventFrame: payload must be a plain object");
  }
  const p = input.payload;
  const eventId = typeof p.eventId === "string" && p.eventId.trim() ? p.eventId.trim() : null;
  const areaId = typeof p.areaId === "string" && p.areaId.trim() ? p.areaId.trim() : null;
  const x = Number(p.x);
  const y = Number(p.y);
  if (!eventId || !areaId || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("createWildernessEventFrame: payload requires eventId, areaId, finite x/y");
  }

  let payloadPool = null;
  if (Object.prototype.hasOwnProperty.call(p, "poolId")) {
    const trimmed =
      p.poolId != null && String(p.poolId).trim() ? String(p.poolId).trim() : null;
    if (trimmed != null && trimmed !== srcPool) {
      throw new Error("createWildernessEventFrame: payload.poolId must match source.poolId when present");
    }
    if (trimmed != null) payloadPool = trimmed;
  }

  const payload = {
    eventId,
    areaId,
    x: Math.trunc(x),
    y: Math.trunc(y)
  };
  if (payloadPool != null) payload.poolId = payloadPool;

  return {
    frameId,
    type,
    status,
    priority,
    source: { ...input.source, poolId: srcPool },
    createdAtMinutes,
    seq,
    payload
  };
}

function sameEventCell(payloadA, payloadB) {
  return (
    payloadA.eventId === payloadB.eventId &&
    payloadA.areaId === payloadB.areaId &&
    Math.trunc(payloadA.x) === Math.trunc(payloadB.x) &&
    Math.trunc(payloadA.y) === Math.trunc(payloadB.y)
  );
}

/**
 * Removes lowest-priority frames until length <= maxFrames. Never removes activeFrameId.
 */
export function trimWildernessEventFramesToMax(frames, maxFrames, droppedOut, activeFrameId) {
  const list = [...frames];
  while (list.length > maxFrames) {
    const removable = list.filter((f) => f.frameId !== activeFrameId);
    if (removable.length === 0) break;
    removable.sort((a, b) => {
      const pa = WILDERNESS_EVENT_PRIORITY_RANK[a.priority] ?? -1;
      const pb = WILDERNESS_EVENT_PRIORITY_RANK[b.priority] ?? -1;
      if (pa !== pb) return pa - pb;
      return a.seq - b.seq;
    });
    const victim = removable[0];
    const idx = list.findIndex((f) => f.frameId === victim.frameId);
    if (idx >= 0) {
      droppedOut.push(list[idx]);
      list.splice(idx, 1);
    }
  }
  return list;
}

export function enqueueWildernessEventFrame(queue, frame, options = {}) {
  const maxFrames = options.maxFrames != null ? Math.max(1, normalizeInt(options.maxFrames, 5)) : 5;
  const base = cloneWildernessEventQueue(queue);

  const busy = base.frames.filter(
    (f) =>
      f.status === WILDERNESS_EVENT_FRAME_STATUSES.QUEUED ||
      f.status === WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE
  );
  for (const f of busy) {
    if (sameEventCell(f.payload, frame.payload)) {
      return { queue: base, droppedFrames: [], enqueued: false };
    }
  }

  const queuedFrame = {
    ...frame,
    status: WILDERNESS_EVENT_FRAME_STATUSES.QUEUED,
    source: isPlainObject(frame.source) ? { ...frame.source } : {},
    payload: { ...frame.payload }
  };

  let frames = [...base.frames, queuedFrame];
  const droppedFrames = [];
  frames = trimWildernessEventFramesToMax(frames, maxFrames, droppedFrames, base.activeFrameId);

  const enqueued = frames.some((f) => f.frameId === queuedFrame.frameId);
  const nextSeq = enqueued ? base.seq + 1 : base.seq;

  return {
    queue: { ...base, frames, seq: nextSeq },
    droppedFrames,
    enqueued
  };
}

const HISTORY_CAP = 20;

function normalizeResolvedHistoryPayload(result, poolIdFromFrameSource) {
  if (!isPlainObject(result)) return null;
  const frameId = typeof result.frameId === "string" && result.frameId.trim() ? result.frameId.trim() : null;
  const eventId = typeof result.eventId === "string" && result.eventId.trim() ? result.eventId.trim() : null;
  const poolId =
    typeof poolIdFromFrameSource === "string" && poolIdFromFrameSource.trim()
      ? poolIdFromFrameSource.trim()
      : null;
  const outcomeId = typeof result.outcomeId === "string" && result.outcomeId.trim() ? result.outcomeId.trim() : null;
  const areaId = typeof result.areaId === "string" && result.areaId.trim() ? result.areaId.trim() : null;
  const x = Number(result.x);
  const y = Number(result.y);
  const occurredAtMinutes = Number(result.occurredAtMinutes);
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

/**
 * @param {ReturnType<typeof normalizeWildernessEventQueue>} queue
 * @param {string} frameId
 * @param {object} result — light fields only (no body/title/resultText stored)
 */
export function markWildernessEventFrameResolved(queue, frameId, result) {
  const base = cloneWildernessEventQueue(queue);
  const fid = typeof frameId === "string" && frameId.trim() ? frameId.trim() : "";
  if (!fid || base.activeFrameId !== fid) {
    return { queue: base, ok: false };
  }

  const activeFrame = base.frames.find((f) => f.frameId === fid);
  const poolFromSource =
    activeFrame && isPlainObject(activeFrame.source)
      ? activeFrame.source.poolId != null && String(activeFrame.source.poolId).trim()
        ? String(activeFrame.source.poolId).trim()
        : null
      : null;
  if (!poolFromSource) {
    return { queue: base, ok: false };
  }

  const resolvedRow = normalizeResolvedHistoryPayload({ ...result, frameId: fid }, poolFromSource);
  if (!resolvedRow) {
    return { queue: base, ok: false };
  }

  const frames = base.frames.filter((f) => f.frameId !== fid);
  const history = [...base.history, resolvedRow].slice(-HISTORY_CAP);

  return {
    queue: {
      ...base,
      frames,
      activeFrameId: null,
      history
    },
    ok: true
  };
}
