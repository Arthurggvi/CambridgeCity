import { getCalendarViewFromTotalMinutes } from "../calendar_model.js";
import { buildStableCalendarDayKey } from "../stable_daily.js";

function normalizeBookId(bookId) {
  return String(bookId || "").trim();
}

function normalizeBookIdList(source) {
  const seen = new Set();
  const result = [];
  for (const rawBookId of Array.isArray(source) ? source : []) {
    const bookId = normalizeBookId(rawBookId);
    if (!bookId || seen.has(bookId)) continue;
    seen.add(bookId);
    result.push(bookId);
  }
  return result;
}

function normalizeReadCount(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function createEmptyLibraryReadingState() {
  return {
    seenBookIds: [],
    readOrder: [],
    daily: {
      dayKey: "",
      readCount: 0
    }
  };
}

export function normalizeLibraryReadingState(rawState) {
  const source = rawState && typeof rawState === "object" && !Array.isArray(rawState)
    ? rawState
    : {};
  const dailySource = source.daily && typeof source.daily === "object" && !Array.isArray(source.daily)
    ? source.daily
    : {};
  return {
    seenBookIds: normalizeBookIdList(source.seenBookIds),
    readOrder: normalizeBookIdList(source.readOrder),
    daily: {
      dayKey: String(dailySource.dayKey || "").trim(),
      readCount: normalizeReadCount(dailySource.readCount)
    }
  };
}

export function getLibraryReadingState(player) {
  return normalizeLibraryReadingState(player?.meta?.libraryReading);
}

export function resolveLibraryReadingDayKey(totalMinutes, world) {
  const calendarView = getCalendarViewFromTotalMinutes(Number(totalMinutes ?? 0), world || {});
  return buildStableCalendarDayKey(calendarView);
}

export function getLibraryReadingDailyState(player, { totalMinutes = 0, world = null } = {}) {
  const state = getLibraryReadingState(player);
  const currentDayKey = resolveLibraryReadingDayKey(totalMinutes, world);
  if (state.daily.dayKey === currentDayKey) {
    return state.daily;
  }
  return {
    dayKey: currentDayKey,
    readCount: 0
  };
}

export function createCommittedLibraryReadingState(currentState, { seenBookId = "", dayKey = "", readCount = 0 } = {}) {
  const normalized = normalizeLibraryReadingState(currentState);
  const nextSeen = new Set(normalized.seenBookIds);
  const nextReadOrder = normalized.readOrder.slice();
  const normalizedBookId = normalizeBookId(seenBookId);
  if (normalizedBookId && !nextSeen.has(normalizedBookId)) {
    nextSeen.add(normalizedBookId);
    nextReadOrder.push(normalizedBookId);
  }
  return {
    seenBookIds: Array.from(nextSeen.values()),
    readOrder: nextReadOrder,
    daily: {
      dayKey: String(dayKey || "").trim(),
      readCount: normalizeReadCount(readCount)
    }
  };
}