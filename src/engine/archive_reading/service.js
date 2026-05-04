import {
  createArchivePageEntry,
  getArchivePageEntry,
  hasViewedArchivePage,
  normalizeArchiveReadingState,
  withArchivePageEntry
} from "./state.js";

export const ARCHIVE_READING_PAGE_MINUTES = 30;
export const ARCHIVE_READING_FIRST_VIEW_EXPERIENCE = 5;
export const ARCHIVE_READING_FIRST_VIEW_RATIONAL = 5;

function normalizeText(value) {
  return String(value || "").trim();
}

function cloneTriggerContext(triggerContext) {
  if (!triggerContext || typeof triggerContext !== "object") return null;
  const next = {};
  for (const key of ["mapId", "actionId", "sceneId", "source"]) {
    const value = normalizeText(triggerContext[key]);
    if (value) next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : null;
}

export function normalizeArchiveReadingPageSpec(rawSpec) {
  const source = rawSpec && typeof rawSpec === "object" ? rawSpec : null;
  if (!source) return null;

  const pageId = normalizeText(source.pageId);
  const sourceBookId = normalizeText(source.sourceBookId);
  const pageToken = normalizeText(source.pageToken);
  if (!pageId || !sourceBookId || !pageToken) return null;

  return {
    pageId,
    sourceBookId,
    pageToken,
    isLeafPage: source.isLeafPage === true,
    grantFirstViewReward: source.grantFirstViewReward === true,
    prevPageId: normalizeText(source.prevPageId),
    nextPageId: normalizeText(source.nextPageId)
  };
}

export function resolveArchiveReadingPageSpecFromScene(scene) {
  return normalizeArchiveReadingPageSpec(scene?.archiveReading);
}

export function createArchiveReadingIntent({ pageSpec, mapId, actionId, sceneId } = {}) {
  const normalizedSpec = normalizeArchiveReadingPageSpec(pageSpec);
  if (!normalizedSpec) return null;
  return {
    type: "VIEW_ARCHIVE_PAGE",
    pageId: normalizedSpec.pageId,
    sourceBookId: normalizedSpec.sourceBookId,
    pageToken: normalizedSpec.pageToken,
    isLeafPage: normalizedSpec.isLeafPage === true,
    grantFirstViewReward: normalizedSpec.grantFirstViewReward === true,
    triggerContext: cloneTriggerContext({
      mapId,
      actionId,
      sceneId,
      source: "archive_reading"
    })
  };
}

export function tryViewArchivePage({
  pageId,
  sourceBookId,
  grantFirstViewReward = false,
  archiveReadingState,
  viewedAt = null,
  triggerContext = null
} = {}) {
  const normalizedPageId = normalizeText(pageId);
  const normalizedSourceBookId = normalizeText(sourceBookId);
  const normalizedState = normalizeArchiveReadingState(archiveReadingState);

  if (!normalizedPageId || !normalizedSourceBookId) {
    return {
      ok: false,
      reason: "missing_page_spec",
      nextArchiveReadingState: normalizedState,
      reward: null
    };
  }

  const existingEntry = getArchivePageEntry(normalizedState, normalizedPageId);
  const viewedMinute = Number.isFinite(Number(viewedAt)) ? Math.trunc(Number(viewedAt)) : null;

  if (existingEntry) {
    const nextArchiveReadingState = withArchivePageEntry(normalizedState, {
      ...existingEntry,
      lastViewedAt: viewedMinute,
      viewCount: Number(existingEntry.viewCount || 0) + 1
    });
    return {
      ok: true,
      reason: "repeat_view",
      firstView: false,
      nextArchiveReadingState,
      reward: null,
      entry: getArchivePageEntry(nextArchiveReadingState, normalizedPageId)
    };
  }

  const nextArchiveReadingState = withArchivePageEntry(normalizedState, createArchivePageEntry({
    pageId: normalizedPageId,
    sourceBookId: normalizedSourceBookId,
    firstViewedAt: viewedMinute,
    lastViewedAt: viewedMinute,
    viewCount: 1,
    rewardGranted: false,
    triggerContext: cloneTriggerContext(triggerContext)
  }));

  return {
    ok: true,
    reason: "first_view",
    firstView: true,
    nextArchiveReadingState,
    reward: grantFirstViewReward === true
      ? {
          experienceXp: ARCHIVE_READING_FIRST_VIEW_EXPERIENCE,
          rationalAxis: ARCHIVE_READING_FIRST_VIEW_RATIONAL
        }
      : null,
    entry: getArchivePageEntry(nextArchiveReadingState, normalizedPageId),
    hasViewedBefore: hasViewedArchivePage(normalizedState, normalizedPageId)
  };
}