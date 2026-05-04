import { getCalendarView } from "./illumination.js";
import { buildStableCalendarDayKey, hashStableString } from "./stable_daily.js";
import { getSteelcrossMarketStallRefreshDefByStallId } from "./shop_goods_assets/steelcross_market_stall_refresh_defs.js";

const MIN_REFRESH_COUNT = 1;
const MAX_REFRESH_COUNT = 3;

function clampRefreshCount(value) {
  const numeric = Math.max(0, Math.trunc(Number(value) || 0));
  if (numeric < MIN_REFRESH_COUNT) return MIN_REFRESH_COUNT;
  if (numeric > MAX_REFRESH_COUNT) return MAX_REFRESH_COUNT;
  return numeric;
}

function createSeededRng(seedKey) {
  let state = hashStableString(seedKey) || 1;
  return function nextRandom01() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeCountWeights(countWeights) {
  return Object.freeze([
    { count: 1, weight: Math.max(0, Math.trunc(Number(countWeights?.[1] ?? countWeights?.["1"] ?? 0))) },
    { count: 2, weight: Math.max(0, Math.trunc(Number(countWeights?.[2] ?? countWeights?.["2"] ?? 0))) },
    { count: 3, weight: Math.max(0, Math.trunc(Number(countWeights?.[3] ?? countWeights?.["3"] ?? 0))) }
  ]);
}

function pickWeightedCount(countWeights, rng) {
  const normalized = normalizeCountWeights(countWeights);
  const totalWeight = normalized.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return MIN_REFRESH_COUNT;

  let cursor = rng() * totalWeight;
  for (const entry of normalized) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.count;
  }
  return normalized[normalized.length - 1]?.count || MIN_REFRESH_COUNT;
}

function normalizeCandidateGoods(candidateGoods) {
  const merged = new Map();
  for (const entry of Array.isArray(candidateGoods) ? candidateGoods : []) {
    const itemId = String(entry?.itemId || "").trim();
    const weight = Math.max(0, Math.trunc(Number(entry?.weight || 0)));
    if (!itemId || weight <= 0) continue;
    merged.set(itemId, (merged.get(itemId) || 0) + weight);
  }
  return Array.from(merged.entries()).map(([itemId, weight]) => Object.freeze({ itemId, weight }));
}

function filterCandidateGoodsForStall(refreshDef, candidateGoods, world = {}) {
  const normalizedStallId = String(refreshDef?.stallId || "").trim();
  if (normalizedStallId !== "steelcross_market_stall_02") {
    return Array.isArray(candidateGoods) ? candidateGoods : [];
  }

  const manuscriptClaimed = world?.flags?.newFourMisc?.researcherManuscriptClaimed === true;
  if (!manuscriptClaimed) {
    return Array.isArray(candidateGoods) ? candidateGoods : [];
  }

  return (Array.isArray(candidateGoods) ? candidateGoods : []).filter((entry) => String(entry?.itemId || "").trim() !== "doc_researcher_manuscript");
}

function pickUniqueWeightedItems(candidates, targetCount, rng) {
  const pool = candidates.map((entry) => ({ ...entry }));
  const picked = [];
  while (pool.length > 0 && picked.length < targetCount) {
    const totalWeight = pool.reduce((sum, entry) => sum + Math.max(0, Number(entry.weight || 0)), 0);
    if (totalWeight <= 0) break;

    let cursor = rng() * totalWeight;
    let pickedIndex = pool.length - 1;
    for (let index = 0; index < pool.length; index += 1) {
      cursor -= Math.max(0, Number(pool[index].weight || 0));
      if (cursor <= 0) {
        pickedIndex = index;
        break;
      }
    }

    const [entry] = pool.splice(pickedIndex, 1);
    if (entry?.itemId) picked.push(entry.itemId);
  }

  return Object.freeze(picked);
}

function buildRefreshCalendar(totalMinutes, world) {
  const calendarView = getCalendarView(Math.max(0, Math.trunc(Number(totalMinutes || 0))), world || {});
  return Object.freeze({
    dayKey: buildStableCalendarDayKey(calendarView),
    dayIndex: Math.max(0, Math.trunc(Number(calendarView?.dayIndex || 0))),
    calendarView
  });
}

export function resolveDailyStallGoods({ stallId, totalMinutes = 0, world = {}, definition = null } = {}) {
  const refreshDef = definition || getSteelcrossMarketStallRefreshDefByStallId(stallId);
  if (!refreshDef) return null;

  const normalizedStallId = String(refreshDef.stallId || stallId || "").trim();
  const { dayKey, dayIndex } = buildRefreshCalendar(totalMinutes, world);
  const selectedCount = clampRefreshCount(
    pickWeightedCount(refreshDef.countWeights, createSeededRng(`${normalizedStallId}:${dayKey}:count`))
  );
  const normalizedCandidates = normalizeCandidateGoods(filterCandidateGoodsForStall(refreshDef, refreshDef.candidateGoods, world));

  // Release note:
  // Business rule remains 1..3 goods per stall per day.
  // During the current placeholder phase candidateGoods is intentionally empty,
  // so the pipeline must still run but return an empty list without error.
  if (normalizedCandidates.length === 0) {
    return Object.freeze({
      stallId: normalizedStallId,
      label: String(refreshDef.label || "").trim(),
      refreshMode: String(refreshDef.refreshMode || "daily").trim() || "daily",
      dayKey,
      dayIndex,
      selectedCount,
      candidateCount: 0,
      itemIds: Object.freeze([]),
      emptyStateMessage: "今日货架还空着。"
    });
  }

  const targetCount = Math.min(selectedCount, normalizedCandidates.length, MAX_REFRESH_COUNT);
  return Object.freeze({
    stallId: normalizedStallId,
    label: String(refreshDef.label || "").trim(),
    refreshMode: String(refreshDef.refreshMode || "daily").trim() || "daily",
    dayKey,
    dayIndex,
    selectedCount,
    candidateCount: normalizedCandidates.length,
    itemIds: pickUniqueWeightedItems(
      normalizedCandidates,
      targetCount,
      createSeededRng(`${normalizedStallId}:${dayKey}:goods`)
    ),
    emptyStateMessage: "今日货架还空着。"
  });
}