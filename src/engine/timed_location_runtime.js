import { gameState } from "./state.js";
import { THESEUS_TIMED_LOCATION_SPEC } from "./theseus_schedule.js";
import { WEST2_LIBRARY_CENTER_TIMED_LOCATION_SPEC } from "./west2_library_center_schedule.js";
import { WEST2_RESEARCH_STATION_TIMED_LOCATION_SPEC } from "./west2_research_station_schedule.js";

const TIMED_LOCATION_SPECS = Object.freeze([
  THESEUS_TIMED_LOCATION_SPEC,
  WEST2_LIBRARY_CENTER_TIMED_LOCATION_SPEC,
  WEST2_RESEARCH_STATION_TIMED_LOCATION_SPEC
]);

function normalizeTotalMinutes(totalMinutes) {
  return Math.max(0, Math.trunc(Number(totalMinutes ?? 0) || 0));
}

export function getTimedLocationSpecById(specId) {
  const id = String(specId || "").trim();
  if (!id) return null;
  return TIMED_LOCATION_SPECS.find((spec) => String(spec?.id || "").trim() === id) || null;
}

export function resolveTimedLocationWindowInfo(specId, totalMinutes, world = {}) {
  const spec = getTimedLocationSpecById(specId);
  if (!spec || typeof spec.getWindowInfo !== "function") return null;
  return spec.getWindowInfo(normalizeTotalMinutes(totalMinutes), world);
}

export function isTimedLocationWindowOpen(specId, totalMinutes, world = {}) {
  const info = resolveTimedLocationWindowInfo(specId, totalMinutes, world);
  return info?.isOpen === true;
}

function resolveTimedLocationClosureCandidate(state = gameState, totalMinutes = state?.time?.totalMinutes) {
  const normalizedTotalMinutes = normalizeTotalMinutes(totalMinutes);
  const world = state?.world || {};
  let selected = null;

  for (const spec of TIMED_LOCATION_SPECS) {
    if (!spec || typeof spec.matchesState !== "function" || !spec.matchesState(state)) continue;
    const windowInfo = spec.getWindowInfo(normalizedTotalMinutes, world);
    const closeAtMinutes = Number.isFinite(windowInfo?.closeAtMinutes)
      ? Math.max(0, Math.trunc(windowInfo.closeAtMinutes))
      : normalizedTotalMinutes;
    const minutesUntilClose = Math.max(0, closeAtMinutes - normalizedTotalMinutes);
    if (!selected || minutesUntilClose < selected.minutesUntilClose) {
      selected = {
        spec,
        windowInfo,
        closeAtMinutes,
        minutesUntilClose,
        totalMinutes: normalizedTotalMinutes
      };
    }
  }

  return selected;
}

export function getMinutesToNextTimedLocationClosure(state = gameState, totalMinutes = state?.time?.totalMinutes) {
  return resolveTimedLocationClosureCandidate(state, totalMinutes)?.minutesUntilClose ?? Infinity;
}

export function triggerTimedLocationClosure(state = gameState, totalMinutes = state?.time?.totalMinutes) {
  const candidate = resolveTimedLocationClosureCandidate(state, totalMinutes);
  if (!candidate) return null;
  return candidate.spec.buildClosureBlocker({
    state,
    totalMinutes: candidate.closeAtMinutes,
    windowInfo: {
      ...(candidate.windowInfo || {}),
      closeAtMinutes: candidate.closeAtMinutes
    }
  });
}

export function applyTimedLocationClosureStep(stepContext, state = gameState) {
  const timeBefore = normalizeTotalMinutes(stepContext?.timeBeforeMinutes);
  const timeAfter = normalizeTotalMinutes(stepContext?.timeAfterMinutes);
  const candidate = resolveTimedLocationClosureCandidate(state, timeBefore);
  if (!candidate) {
    return { hardStopReached: false, blockedBy: null };
  }

  const closeAtMinutes = candidate.closeAtMinutes;
  if (timeBefore < closeAtMinutes && timeAfter < closeAtMinutes) {
    return { hardStopReached: false, blockedBy: null };
  }

  return {
    hardStopReached: true,
    blockedBy: candidate.spec.buildClosureBlocker({
      state,
      totalMinutes: closeAtMinutes,
      windowInfo: {
        ...(candidate.windowInfo || {}),
        closeAtMinutes
      }
    })
  };
}

export function isTimedLocationClosureBlocker(blockedBy) {
  return String(blockedBy?.kind || "").trim() === "timed_location_closure";
}