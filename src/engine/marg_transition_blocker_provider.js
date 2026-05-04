import {
  MARG_FRONTDESK_DUTY_BANDS,
  MARG_FRONTDESK_DUTY_BOUNDARY_MINUTES,
  resolveMargFrontdeskDutySnapshot
} from "./marg_frontdesk_duty_provider.js";
import { normalizeTotalMinutes } from "./daily_open_window.js";

export const MARG_MAP_SCENE_TRANSITION_BLOCKER_KIND = "map_scene_transition_blocker";
export const MARG_TRANSITION_BLOCKER_MAP_ID = "west2_outpost_library_center";

export const MARG_TRANSITION_SCENE_ROLES = Object.freeze({
  FRONTDESK: "library_frontdesk",
  READING_CONTACT: "library_reading_contact"
});

export const MARG_TRANSITION_KEYS = Object.freeze({
  FRONTDESK_ARRIVE: "marg_frontdesk_arrive",
  FRONTDESK_LEAVE_OFF_DUTY: "marg_frontdesk_leave_off_duty",
  FRONTDESK_LEAVE_TO_READING_ROOM: "marg_frontdesk_leave_to_reading_room",
  READING_ROOM_LEAVE_TO_LUNCH: "marg_reading_room_leave_to_lunch",
  READING_ROOM_LEAVE_TO_FRONTDESK: "marg_reading_room_leave_to_frontdesk"
});

export const MARG_TRANSITION_BLOCKER_SCENE_IDS = Object.freeze({
  FRONTDESK: "west2_outpost_library_checkout_marg_transition_blocker",
  READING: "west2_outpost_library_reading_marg_transition_blocker"
});

const FRONTDESK_SCENE_IDS = new Set([
  "west2_outpost_library_checkout"
]);

const READING_CONTACT_SCENE_IDS = new Set([
  "west2_outpost_library_reading_marg_low",
  "west2_outpost_library_reading_marg_high"
]);

const READING_ROOM_BANDS = new Set([
  MARG_FRONTDESK_DUTY_BANDS.READING_ROOM_LADDER,
  MARG_FRONTDESK_DUTY_BANDS.READING_ROOM_FLOOR
]);

const MARG_TRANSITION_BLOCKER_SPECS = Object.freeze({
  [MARG_TRANSITION_KEYS.FRONTDESK_ARRIVE]: Object.freeze({
    transitionKey: MARG_TRANSITION_KEYS.FRONTDESK_ARRIVE,
    fromSceneRole: MARG_TRANSITION_SCENE_ROLES.FRONTDESK,
    blockerSceneId: MARG_TRANSITION_BLOCKER_SCENE_IDS.FRONTDESK,
    toSceneId: "west2_outpost_library_checkout",
    messageVariant: MARG_TRANSITION_KEYS.FRONTDESK_ARRIVE
  }),
  [MARG_TRANSITION_KEYS.FRONTDESK_LEAVE_OFF_DUTY]: Object.freeze({
    transitionKey: MARG_TRANSITION_KEYS.FRONTDESK_LEAVE_OFF_DUTY,
    fromSceneRole: MARG_TRANSITION_SCENE_ROLES.FRONTDESK,
    blockerSceneId: MARG_TRANSITION_BLOCKER_SCENE_IDS.FRONTDESK,
    toSceneId: "west2_outpost_library_checkout",
    messageVariant: MARG_TRANSITION_KEYS.FRONTDESK_LEAVE_OFF_DUTY
  }),
  [MARG_TRANSITION_KEYS.FRONTDESK_LEAVE_TO_READING_ROOM]: Object.freeze({
    transitionKey: MARG_TRANSITION_KEYS.FRONTDESK_LEAVE_TO_READING_ROOM,
    fromSceneRole: MARG_TRANSITION_SCENE_ROLES.FRONTDESK,
    blockerSceneId: MARG_TRANSITION_BLOCKER_SCENE_IDS.FRONTDESK,
    toSceneId: "west2_outpost_library_checkout",
    messageVariant: MARG_TRANSITION_KEYS.FRONTDESK_LEAVE_TO_READING_ROOM
  }),
  [MARG_TRANSITION_KEYS.READING_ROOM_LEAVE_TO_LUNCH]: Object.freeze({
    transitionKey: MARG_TRANSITION_KEYS.READING_ROOM_LEAVE_TO_LUNCH,
    fromSceneRole: MARG_TRANSITION_SCENE_ROLES.READING_CONTACT,
    blockerSceneId: MARG_TRANSITION_BLOCKER_SCENE_IDS.READING,
    toSceneId: "west2_outpost_library_reading",
    messageVariant: MARG_TRANSITION_KEYS.READING_ROOM_LEAVE_TO_LUNCH
  }),
  [MARG_TRANSITION_KEYS.READING_ROOM_LEAVE_TO_FRONTDESK]: Object.freeze({
    transitionKey: MARG_TRANSITION_KEYS.READING_ROOM_LEAVE_TO_FRONTDESK,
    fromSceneRole: MARG_TRANSITION_SCENE_ROLES.READING_CONTACT,
    blockerSceneId: MARG_TRANSITION_BLOCKER_SCENE_IDS.READING,
    toSceneId: "west2_outpost_library_reading",
    messageVariant: MARG_TRANSITION_KEYS.READING_ROOM_LEAVE_TO_FRONTDESK
  })
});

function getDayStartMinutes(totalMinutes) {
  return Math.floor(normalizeTotalMinutes(totalMinutes) / 1440) * 1440;
}

function buildUpcomingBoundaryMinutes(totalMinutes, maxDays = 7) {
  const current = normalizeTotalMinutes(totalMinutes);
  const dayStart = getDayStartMinutes(current);
  const candidates = [];
  for (let dayOffset = 0; dayOffset <= maxDays; dayOffset += 1) {
    const dayBase = dayStart + dayOffset * 1440;
    for (const minuteOfDay of MARG_FRONTDESK_DUTY_BOUNDARY_MINUTES) {
      const absoluteMinute = dayBase + minuteOfDay;
      if (absoluteMinute > current) {
        candidates.push(absoluteMinute);
      }
    }
  }
  candidates.sort((left, right) => left - right);
  return candidates;
}

function resolveBandAt(gameState, totalMinutes) {
  return resolveMargFrontdeskDutySnapshot({ gameState, totalMinutes }).band;
}

function findNextDistinctBand({ gameState, afterMinutes, maxDays = 1 } = {}) {
  const currentBand = resolveBandAt(gameState, afterMinutes);
  const limitExclusive = getDayStartMinutes(afterMinutes) + maxDays * 1440;
  for (const absoluteMinute of buildUpcomingBoundaryMinutes(afterMinutes, maxDays)) {
    if (absoluteMinute <= afterMinutes) continue;
    if (absoluteMinute >= limitExclusive) break;
    const nextBand = resolveBandAt(gameState, absoluteMinute);
    if (nextBand !== currentBand) {
      return nextBand;
    }
  }
  return "";
}

function resolveFrontdeskTransitionKey({ fromBand, toBand, lookaheadBand }) {
  if (toBand === MARG_FRONTDESK_DUTY_BANDS.ON_DUTY && fromBand !== MARG_FRONTDESK_DUTY_BANDS.ON_DUTY) {
    return MARG_TRANSITION_KEYS.FRONTDESK_ARRIVE;
  }

  if (fromBand !== MARG_FRONTDESK_DUTY_BANDS.ON_DUTY) {
    return "";
  }

  if (READING_ROOM_BANDS.has(toBand)) {
    return MARG_TRANSITION_KEYS.FRONTDESK_LEAVE_TO_READING_ROOM;
  }

  if (
    (toBand === MARG_FRONTDESK_DUTY_BANDS.OFF_DUTY || toBand === MARG_FRONTDESK_DUTY_BANDS.LUNCH_BREAK)
    && READING_ROOM_BANDS.has(lookaheadBand)
  ) {
    return MARG_TRANSITION_KEYS.FRONTDESK_LEAVE_TO_READING_ROOM;
  }

  if (toBand === MARG_FRONTDESK_DUTY_BANDS.OFF_DUTY) {
    return MARG_TRANSITION_KEYS.FRONTDESK_LEAVE_OFF_DUTY;
  }

  return "";
}

function resolveReadingTransitionKey({ fromBand, toBand, lookaheadBand }) {
  if (!READING_ROOM_BANDS.has(fromBand)) {
    return "";
  }

  if (toBand === MARG_FRONTDESK_DUTY_BANDS.LUNCH_BREAK) {
    return MARG_TRANSITION_KEYS.READING_ROOM_LEAVE_TO_LUNCH;
  }

  if (toBand === MARG_FRONTDESK_DUTY_BANDS.ON_DUTY) {
    return MARG_TRANSITION_KEYS.READING_ROOM_LEAVE_TO_FRONTDESK;
  }

  if (toBand === MARG_FRONTDESK_DUTY_BANDS.OFF_DUTY && lookaheadBand === MARG_FRONTDESK_DUTY_BANDS.ON_DUTY) {
    return MARG_TRANSITION_KEYS.READING_ROOM_LEAVE_TO_FRONTDESK;
  }

  return "";
}

function resolveTransitionKey({ sceneRole, fromBand, toBand, lookaheadBand }) {
  if (sceneRole === MARG_TRANSITION_SCENE_ROLES.FRONTDESK) {
    return resolveFrontdeskTransitionKey({ fromBand, toBand, lookaheadBand });
  }
  if (sceneRole === MARG_TRANSITION_SCENE_ROLES.READING_CONTACT) {
    return resolveReadingTransitionKey({ fromBand, toBand, lookaheadBand });
  }
  return "";
}

function buildBlockedBy(spec, atMinutes, fromBand, toBand) {
  return Object.freeze({
    blockerId: `marg_scene_transition:${spec.transitionKey}`,
    kind: MARG_MAP_SCENE_TRANSITION_BLOCKER_KIND,
    transitionKey: spec.transitionKey,
    messageVariant: spec.messageVariant,
    fromSceneRole: spec.fromSceneRole,
    blockerSceneId: spec.blockerSceneId,
    toSceneId: spec.toSceneId,
    atMinutes: normalizeTotalMinutes(atMinutes),
    hardStop: true,
    fromBand,
    toBand,
    fallback: Object.freeze({
      mapId: MARG_TRANSITION_BLOCKER_MAP_ID,
      sceneId: spec.blockerSceneId
    }),
    returnTarget: Object.freeze({
      mapId: MARG_TRANSITION_BLOCKER_MAP_ID,
      sceneId: spec.toSceneId
    })
  });
}

function normalizeAdvanceScope(advanceContext = null, state = null) {
  const scope = advanceContext?.margTransitionBlocker;
  if (scope && typeof scope === "object") {
    return {
      mapId: String(scope.mapId || "").trim(),
      sceneId: String(scope.sceneId || "").trim(),
      sceneRole: String(scope.sceneRole || "").trim()
    };
  }
  const mapId = String(state?.currentMapId || state?.world?.currentMapId || state?.currentMap?.id || "").trim();
  const sceneId = String(state?.currentSceneId || state?.currentScene?.id || "").trim();
  return {
    mapId,
    sceneId,
    sceneRole: resolveMargTransitionSceneRole({ mapId, sceneId })
  };
}

export function resolveMargTransitionSceneRole({ mapId = "", sceneId = "" } = {}) {
  if (String(mapId || "").trim() !== MARG_TRANSITION_BLOCKER_MAP_ID) {
    return "";
  }
  const resolvedSceneId = String(sceneId || "").trim();
  if (FRONTDESK_SCENE_IDS.has(resolvedSceneId)) {
    return MARG_TRANSITION_SCENE_ROLES.FRONTDESK;
  }
  if (READING_CONTACT_SCENE_IDS.has(resolvedSceneId)) {
    return MARG_TRANSITION_SCENE_ROLES.READING_CONTACT;
  }
  return "";
}

export function buildMargTransitionAdvanceContext({ gameState = null, mapId = "", sceneId = "" } = {}) {
  const resolvedMapId = String(mapId || gameState?.currentMapId || gameState?.world?.currentMapId || gameState?.currentMap?.id || "").trim();
  const resolvedSceneId = String(sceneId || gameState?.currentSceneId || gameState?.currentScene?.id || "").trim();
  const sceneRole = resolveMargTransitionSceneRole({ mapId: resolvedMapId, sceneId: resolvedSceneId });
  if (!sceneRole) {
    return {};
  }
  return {
    margTransitionBlocker: Object.freeze({
      mapId: resolvedMapId,
      sceneId: resolvedSceneId,
      sceneRole
    })
  };
}

export function resolveMargTransitionBlockerCandidate({ gameState = null, totalMinutes = null, advanceContext = null } = {}) {
  const state = gameState;
  const scope = normalizeAdvanceScope(advanceContext, state);
  if (scope.mapId !== MARG_TRANSITION_BLOCKER_MAP_ID || !scope.sceneRole) {
    return null;
  }

  const currentMinutes = normalizeTotalMinutes(totalMinutes ?? state?.time?.totalMinutes);
  for (const boundaryMinutes of buildUpcomingBoundaryMinutes(currentMinutes)) {
    const fromBand = resolveBandAt(state, boundaryMinutes - 1);
    const toBand = resolveBandAt(state, boundaryMinutes);
    if (fromBand === toBand) continue;
    const lookaheadBand = findNextDistinctBand({ gameState: state, afterMinutes: boundaryMinutes, maxDays: 1 });
    const transitionKey = resolveTransitionKey({
      sceneRole: scope.sceneRole,
      fromBand,
      toBand,
      lookaheadBand
    });
    if (!transitionKey) continue;
    const spec = MARG_TRANSITION_BLOCKER_SPECS[transitionKey] || null;
    if (!spec) continue;
    return Object.freeze({
      ...buildBlockedBy(spec, boundaryMinutes, fromBand, toBand),
      minutesUntil: boundaryMinutes - currentMinutes
    });
  }
  return null;
}

export function resolveMargTransitionBlockerWithinMinutes({ gameState = null, totalMinutes = null, minutes = 0, advanceContext = null } = {}) {
  const candidate = resolveMargTransitionBlockerCandidate({ gameState, totalMinutes, advanceContext });
  if (!candidate) return null;
  const limit = Math.max(0, Math.trunc(Number(minutes) || 0));
  if (candidate.minutesUntil > limit) return null;
  return candidate;
}

export function getMinutesToNextMargTransitionBlocker(state, totalMinutes = state?.time?.totalMinutes, advanceContext = null) {
  return resolveMargTransitionBlockerCandidate({ gameState: state, totalMinutes, advanceContext })?.minutesUntil ?? Infinity;
}

export function applyMargTransitionBlockerStep(stepContext = null, state = null, advanceContext = null) {
  const timeBefore = normalizeTotalMinutes(stepContext?.timeBeforeMinutes ?? state?.time?.totalMinutes);
  const timeAfter = normalizeTotalMinutes(stepContext?.timeAfterMinutes ?? timeBefore);
  const candidate = resolveMargTransitionBlockerCandidate({ gameState: state, totalMinutes: timeBefore, advanceContext });
  if (!candidate || candidate.atMinutes > timeAfter) {
    return { hardStopReached: false, blockedBy: null };
  }
  return {
    hardStopReached: true,
    blockedBy: candidate
  };
}

export function isMargSceneTransitionBlocker(blockedBy) {
  return String(blockedBy?.kind || "").trim() === MARG_MAP_SCENE_TRANSITION_BLOCKER_KIND;
}

export function getMargTransitionBlockerRuntimeContext(gameState = null) {
  const blocker = gameState?.ui?.margTransitionBlocker;
  if (!isMargSceneTransitionBlocker(blocker)) {
    return null;
  }
  return Object.freeze({
    blockerId: String(blocker.blockerId || "").trim(),
    transitionKey: String(blocker.transitionKey || "").trim(),
    blockerSceneId: String(blocker.blockerSceneId || "").trim(),
    toSceneId: String(blocker.toSceneId || blocker.returnTarget?.sceneId || "").trim(),
    fromSceneRole: String(blocker.fromSceneRole || "").trim(),
    atMinutes: normalizeTotalMinutes(blocker.atMinutes)
  });
}
