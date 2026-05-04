export const RECORD_STATE_SNAPSHOT_VERSION = 1;

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRecordId(recordId) {
  return String(recordId || "").trim();
}

function normalizeUnlockedAt(unlockedAt) {
  if (unlockedAt == null) return null;
  if (typeof unlockedAt === "string") {
    const text = unlockedAt.trim();
    return text || null;
  }
  if (typeof unlockedAt === "number" && Number.isFinite(unlockedAt)) {
    return unlockedAt;
  }
  return null;
}

function normalizeTriggerContext(triggerContext) {
  if (!isPlainObject(triggerContext)) return null;

  const next = {};
  const mapId = String(triggerContext.mapId || "").trim();
  const actionId = String(triggerContext.actionId || "").trim();
  const sceneId = String(triggerContext.sceneId || "").trim();
  const source = String(triggerContext.source || "").trim();

  if (mapId) next.mapId = mapId;
  if (actionId) next.actionId = actionId;
  if (sceneId) next.sceneId = sceneId;
  if (source) next.source = source;

  return Object.keys(next).length > 0 ? next : null;
}

function cloneUnlockedRecordEntry(entry) {
  if (!isPlainObject(entry)) return null;
  return {
    recordId: normalizeRecordId(entry.recordId),
    unlockedAt: normalizeUnlockedAt(entry.unlockedAt),
    rewardGranted: entry.rewardGranted === true,
    triggerContext: normalizeTriggerContext(entry.triggerContext),
    snapshotVersion: Number.isInteger(Number(entry.snapshotVersion))
      ? Math.max(1, Math.trunc(Number(entry.snapshotVersion)))
      : RECORD_STATE_SNAPSHOT_VERSION
  };
}

export function createEmptyRecordState() {
  return {
    byId: {},
    order: []
  };
}

export function createUnlockedRecordEntry({
  recordId,
  unlockedAt = null,
  rewardGranted = false,
  triggerContext = null,
  snapshotVersion = RECORD_STATE_SNAPSHOT_VERSION
} = {}) {
  const normalizedRecordId = normalizeRecordId(recordId);
  if (!normalizedRecordId) {
    throw new Error("createUnlockedRecordEntry requires a non-empty recordId");
  }

  return {
    recordId: normalizedRecordId,
    unlockedAt: normalizeUnlockedAt(unlockedAt),
    rewardGranted: rewardGranted === true,
    triggerContext: normalizeTriggerContext(triggerContext),
    snapshotVersion: Number.isInteger(Number(snapshotVersion))
      ? Math.max(1, Math.trunc(Number(snapshotVersion)))
      : RECORD_STATE_SNAPSHOT_VERSION
  };
}

export function normalizeRecordState(recordsState) {
  const source = isPlainObject(recordsState) ? recordsState : createEmptyRecordState();
  const byIdSource = isPlainObject(source.byId) ? source.byId : {};
  const orderSource = Array.isArray(source.order) ? source.order : [];
  const byId = {};
  const order = [];
  const seenIds = new Set();

  for (const rawRecordId of orderSource) {
    const recordId = normalizeRecordId(rawRecordId);
    if (!recordId || seenIds.has(recordId)) continue;
    const entry = cloneUnlockedRecordEntry(byIdSource[recordId]);
    if (!entry || !entry.recordId) continue;
    byId[recordId] = entry;
    order.push(recordId);
    seenIds.add(recordId);
  }

  for (const [rawRecordId, rawEntry] of Object.entries(byIdSource)) {
    const recordId = normalizeRecordId(rawRecordId);
    if (!recordId || seenIds.has(recordId)) continue;
    const entry = cloneUnlockedRecordEntry(rawEntry);
    if (!entry || !entry.recordId) continue;
    byId[recordId] = entry;
    order.push(recordId);
    seenIds.add(recordId);
  }

  return {
    byId,
    order
  };
}

export function hasUnlockedRecord(recordsState, recordId) {
  const normalizedState = normalizeRecordState(recordsState);
  const normalizedRecordId = normalizeRecordId(recordId);
  if (!normalizedRecordId) return false;
  return Object.prototype.hasOwnProperty.call(normalizedState.byId, normalizedRecordId);
}

export function getUnlockedRecordEntry(recordsState, recordId) {
  const normalizedState = normalizeRecordState(recordsState);
  const normalizedRecordId = normalizeRecordId(recordId);
  if (!normalizedRecordId) return null;
  const entry = normalizedState.byId[normalizedRecordId];
  return entry ? cloneUnlockedRecordEntry(entry) : null;
}

export function withUnlockedRecord(recordsState, unlockedEntry) {
  const normalizedState = normalizeRecordState(recordsState);
  const entry = createUnlockedRecordEntry(unlockedEntry);
  const nextById = {
    ...normalizedState.byId,
    [entry.recordId]: entry
  };
  const nextOrder = normalizedState.order.includes(entry.recordId)
    ? normalizedState.order.slice()
    : [...normalizedState.order, entry.recordId];

  return {
    byId: nextById,
    order: nextOrder
  };
}

export function setRecordRewardGranted(recordsState, recordId, rewardGranted) {
  const normalizedState = normalizeRecordState(recordsState);
  const normalizedRecordId = normalizeRecordId(recordId);
  if (!normalizedRecordId) {
    return normalizedState;
  }

  const currentEntry = normalizedState.byId[normalizedRecordId];
  if (!currentEntry) {
    return normalizedState;
  }

  const nextEntry = createUnlockedRecordEntry({
    ...currentEntry,
    rewardGranted: rewardGranted === true
  });

  return withUnlockedRecord(normalizedState, nextEntry);
}