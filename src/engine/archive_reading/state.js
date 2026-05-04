export const ARCHIVE_READING_STATE_SNAPSHOT_VERSION = 1;

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizePageId(pageId) {
  return String(pageId || "").trim();
}

function normalizeSourceBookId(sourceBookId) {
  return String(sourceBookId || "").trim();
}

function normalizeMinuteStamp(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.trunc(numberValue);
}

function normalizeViewCount(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(0, Math.trunc(numberValue));
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

function cloneArchivePageEntry(entry) {
  if (!isPlainObject(entry)) return null;
  return {
    pageId: normalizePageId(entry.pageId),
    sourceBookId: normalizeSourceBookId(entry.sourceBookId),
    firstViewedAt: normalizeMinuteStamp(entry.firstViewedAt),
    lastViewedAt: normalizeMinuteStamp(entry.lastViewedAt),
    viewCount: normalizeViewCount(entry.viewCount),
    rewardGranted: entry.rewardGranted === true,
    triggerContext: normalizeTriggerContext(entry.triggerContext),
    snapshotVersion: Number.isInteger(Number(entry.snapshotVersion))
      ? Math.max(1, Math.trunc(Number(entry.snapshotVersion)))
      : ARCHIVE_READING_STATE_SNAPSHOT_VERSION
  };
}

export function createEmptyArchiveReadingState() {
  return {
    byId: {},
    order: []
  };
}

export function createArchivePageEntry({
  pageId,
  sourceBookId,
  firstViewedAt = null,
  lastViewedAt = null,
  viewCount = 0,
  rewardGranted = false,
  triggerContext = null,
  snapshotVersion = ARCHIVE_READING_STATE_SNAPSHOT_VERSION
} = {}) {
  const normalizedPageId = normalizePageId(pageId);
  if (!normalizedPageId) {
    throw new Error("createArchivePageEntry requires a non-empty pageId");
  }

  return {
    pageId: normalizedPageId,
    sourceBookId: normalizeSourceBookId(sourceBookId),
    firstViewedAt: normalizeMinuteStamp(firstViewedAt),
    lastViewedAt: normalizeMinuteStamp(lastViewedAt),
    viewCount: normalizeViewCount(viewCount),
    rewardGranted: rewardGranted === true,
    triggerContext: normalizeTriggerContext(triggerContext),
    snapshotVersion: Number.isInteger(Number(snapshotVersion))
      ? Math.max(1, Math.trunc(Number(snapshotVersion)))
      : ARCHIVE_READING_STATE_SNAPSHOT_VERSION
  };
}

export function normalizeArchiveReadingState(rawState) {
  const source = isPlainObject(rawState) ? rawState : createEmptyArchiveReadingState();
  const byIdSource = isPlainObject(source.byId) ? source.byId : {};
  const orderSource = Array.isArray(source.order) ? source.order : [];
  const byId = {};
  const order = [];
  const seenIds = new Set();

  for (const rawPageId of orderSource) {
    const pageId = normalizePageId(rawPageId);
    if (!pageId || seenIds.has(pageId)) continue;
    const entry = cloneArchivePageEntry(byIdSource[pageId]);
    if (!entry || !entry.pageId) continue;
    byId[pageId] = entry;
    order.push(pageId);
    seenIds.add(pageId);
  }

  for (const [rawPageId, rawEntry] of Object.entries(byIdSource)) {
    const pageId = normalizePageId(rawPageId);
    if (!pageId || seenIds.has(pageId)) continue;
    const entry = cloneArchivePageEntry(rawEntry);
    if (!entry || !entry.pageId) continue;
    byId[pageId] = entry;
    order.push(pageId);
    seenIds.add(pageId);
  }

  return {
    byId,
    order
  };
}

export function getArchivePageEntry(archiveReadingState, pageId) {
  const normalizedState = normalizeArchiveReadingState(archiveReadingState);
  const normalizedPageId = normalizePageId(pageId);
  if (!normalizedPageId) return null;
  const entry = normalizedState.byId[normalizedPageId];
  return entry ? cloneArchivePageEntry(entry) : null;
}

export function hasViewedArchivePage(archiveReadingState, pageId) {
  return !!getArchivePageEntry(archiveReadingState, pageId);
}

export function withArchivePageEntry(archiveReadingState, archivePageEntry) {
  const normalizedState = normalizeArchiveReadingState(archiveReadingState);
  const entry = createArchivePageEntry(archivePageEntry);
  const nextById = {
    ...normalizedState.byId,
    [entry.pageId]: entry
  };
  const nextOrder = normalizedState.order.includes(entry.pageId)
    ? normalizedState.order.slice()
    : [...normalizedState.order, entry.pageId];

  return {
    byId: nextById,
    order: nextOrder
  };
}

export function setArchivePageRewardGranted(archiveReadingState, pageId, rewardGranted) {
  const currentEntry = getArchivePageEntry(archiveReadingState, pageId);
  if (!currentEntry) {
    return normalizeArchiveReadingState(archiveReadingState);
  }

  return withArchivePageEntry(archiveReadingState, {
    ...currentEntry,
    rewardGranted: rewardGranted === true
  });
}