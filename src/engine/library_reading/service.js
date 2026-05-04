import { getLibraryReadingCatalog, getLibraryReadingBook, listLibraryReadingBooks } from "./catalog.js";
import {
  createCommittedLibraryReadingState,
  getLibraryReadingDailyState,
  getLibraryReadingState,
  resolveLibraryReadingDayKey
} from "./state.js";

const LIBRARY_READING_BLOCKER_REASON = "我读不下去更多了";

function createSeededRng(seedText) {
  let seed = 2166136261;
  const text = String(seedText || "");
  for (let index = 0; index < text.length; index += 1) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pickBookId(bookIds, seedText) {
  const items = Array.isArray(bookIds) ? bookIds.filter(Boolean) : [];
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  const nextRandom = createSeededRng(seedText);
  const index = Math.max(0, Math.min(items.length - 1, Math.floor(nextRandom() * items.length)));
  return items[index] || "";
}

export function getLibraryReadingBlockerReason() {
  return LIBRARY_READING_BLOCKER_REASON;
}

export function resolveLibraryReadingAction(gameState, { mapId, actionId, sceneId } = {}) {
  const catalog = getLibraryReadingCatalog(mapId);
  if (!catalog) {
    return {
      ok: false,
      reason: "missing_catalog"
    };
  }

  const normalizedActionId = String(actionId || "").trim();
  if (normalizedActionId && normalizedActionId !== String(catalog.actionId || "")) {
    return {
      ok: false,
      reason: "action_mismatch"
    };
  }

  const currentState = getLibraryReadingState(gameState?.player);
  const totalMinutes = Number(gameState?.time?.totalMinutes ?? 0);
  const dayKey = resolveLibraryReadingDayKey(totalMinutes, gameState?.world || {});
  const dailyState = getLibraryReadingDailyState(gameState?.player, {
    totalMinutes,
    world: gameState?.world || {}
  });
  const maxDailyReads = Math.max(1, Math.trunc(Number(catalog.maxDailyReads ?? 3) || 3));

  if (dailyState.readCount >= maxDailyReads) {
    return {
      ok: true,
      blocked: true,
      blockerReason: LIBRARY_READING_BLOCKER_REASON,
      catalog,
      state: currentState,
      dailyState,
      dayKey
    };
  }

  const books = listLibraryReadingBooks(catalog);
  const allBookIds = books.map((book) => String(book.id || "")).filter(Boolean);
  const seenBookIds = new Set(currentState.seenBookIds);
  const unreadBookIds = allBookIds.filter((bookId) => !seenBookIds.has(bookId));
  const pool = unreadBookIds.length > 0 ? unreadBookIds : allBookIds;
  const pickSeed = [
    catalog.id,
    dayKey,
    dailyState.readCount + 1,
    totalMinutes,
    currentState.readOrder.length,
    unreadBookIds.length > 0 ? "unread" : "repeat"
  ].join(":");
  const selectedBookId = pickBookId(pool, pickSeed);
  const selectedBook = getLibraryReadingBook(selectedBookId);
  if (!selectedBook) {
    return {
      ok: false,
      reason: "missing_book_definition",
      selectedBookId
    };
  }

  const isFirstRead = !seenBookIds.has(selectedBook.id);
  const nextReadCount = dailyState.readCount + 1;
  return {
    ok: true,
    blocked: false,
    catalog,
    selectedBook,
    selectedRecordId: String(selectedBook.recordId || "").trim() || null,
    isFirstRead,
    currentState,
    dailyState,
    nextState: createCommittedLibraryReadingState(currentState, {
      seenBookId: isFirstRead ? selectedBook.id : "",
      dayKey,
      readCount: nextReadCount
    }),
    dayKey,
    nextReadCount,
    triggerContext: {
      mapId: String(mapId || catalog.mapId || "").trim() || null,
      actionId: normalizedActionId || String(catalog.actionId || "").trim() || null,
      sceneId: String(sceneId || catalog.sceneId || "").trim() || null,
      source: "library_reading"
    }
  };
}