import { gameState } from "./state.js";
import { listAchievementDefs } from "./achievement_defs.js";
import { saveManager } from "../save/save_manager.js";
import {
  createEmptyAchievementState,
  hasAchievementMigrationMarker,
  mergeAchievementStates,
  normalizeAchievementState,
  readAchievementProfileState,
  writeAchievementMigrationMarker,
  writeAchievementProfileState
} from "./achievement_profile_persistence.js";

let cachedAchievementState = createEmptyAchievementState();
let isAchievementStoreReady = false;

function ensurePlayerContainer(state) {
  if (!state || typeof state !== "object") return null;
  if (!state.player || typeof state.player !== "object") {
    state.player = {};
  }
  return state.player;
}

function writeAchievementMirror(state, achievementsState) {
  const player = ensurePlayerContainer(state);
  if (!player) return createEmptyAchievementState();
  // Runtime mirror exists for legacy compatibility only; authoritative truth stays in the profile store.
  const normalized = normalizeAchievementState(achievementsState);
  player.achievements = normalized;
  return normalized;
}

function collectMigrationSources(state) {
  const sources = [];
  const runtimeState = normalizeAchievementState(state?.player?.achievements);
  if (Object.keys(runtimeState).length > 0) {
    sources.push(runtimeState);
  }

  for (const entry of saveManager.listLegacyAchievementStatesForMigration()) {
    if (!entry || typeof entry !== "object") continue;
    sources.push(entry.achievementsState);
  }

  return sources;
}

function initializeAchievementTruth(state = gameState) {
  const profileRead = readAchievementProfileState();
  const hasMarker = hasAchievementMigrationMarker();
  // Slot scanning is migration-only. Once the marker exists and profile data is readable,
  // normal reads must stay on the profile store and skip legacy sources entirely.
  const mustRunMigration = !hasMarker || !profileRead.ok;

  let nextTruth = profileRead.ok
    ? profileRead.state
    : createEmptyAchievementState();

  if (mustRunMigration) {
    nextTruth = mergeAchievementStates(nextTruth, ...collectMigrationSources(state));
    const wroteProfile = writeAchievementProfileState(nextTruth);
    if (wroteProfile) {
      writeAchievementMigrationMarker();
    }
  }

  cachedAchievementState = normalizeAchievementState(nextTruth);
  isAchievementStoreReady = true;
  writeAchievementMirror(state, cachedAchievementState);
  return cachedAchievementState;
}

function ensureAchievementStoreReady(state = gameState) {
  if (!isAchievementStoreReady) {
    return initializeAchievementTruth(state);
  }
  writeAchievementMirror(state, cachedAchievementState);
  return cachedAchievementState;
}

export function initAchievementStore(options = {}) {
  const state = options?.state && typeof options.state === "object"
    ? options.state
    : gameState;
  return initializeAchievementTruth(state);
}

export function syncAchievementMirrorFromStore(state = gameState) {
  const truth = ensureAchievementStoreReady(state);
  return writeAchievementMirror(state, truth);
}

export { createEmptyAchievementState, normalizeAchievementState };

export function getAchievementState(state = gameState) {
  return normalizeAchievementState(ensureAchievementStoreReady(state));
}

export function getAchievementEntry(achievementId, state = gameState) {
  const id = String(achievementId || "").trim();
  if (!id) return null;
  const normalized = getAchievementState(state);
  return normalized[id] || null;
}

export function isAchievementUnlocked(achievementId, state = gameState) {
  return getAchievementEntry(achievementId, state)?.unlocked === true;
}

export function unlockAchievement(achievementId, options = {}) {
  const id = String(achievementId || "").trim();
  const state = options?.state && typeof options.state === "object"
    ? options.state
    : gameState;
  if (!id) {
    return {
      ok: false,
      reason: "invalid_achievement_id"
    };
  }

  const currentState = getAchievementState(state);
  const existing = currentState[id] || null;
  if (existing?.unlocked === true) {
    syncAchievementMirrorFromStore(state);
    return {
      ok: true,
      reason: "already_unlocked",
      achievementId: id,
      state: currentState,
      entry: existing
    };
  }

  const unlockedAtSystemTime = typeof options?.systemTimeIso === "string" && options.systemTimeIso.trim()
    ? options.systemTimeIso.trim()
    : new Date().toISOString();

  const nextState = {
    ...currentState,
    [id]: {
      unlocked: true,
      unlockedAtSystemTime
    }
  };

  writeAchievementProfileState(nextState);
  cachedAchievementState = normalizeAchievementState(nextState);
  syncAchievementMirrorFromStore(state);
  return {
    ok: true,
    reason: "first_unlock",
    achievementId: id,
    state: cachedAchievementState,
    entry: cachedAchievementState[id]
  };
}

export function lockAchievement(achievementId, options = {}) {
  const id = String(achievementId || "").trim();
  const state = options?.state && typeof options.state === "object"
    ? options.state
    : gameState;
  if (!id) {
    return {
      ok: false,
      reason: "invalid_achievement_id"
    };
  }

  const currentState = getAchievementState(state);
  if (!Object.prototype.hasOwnProperty.call(currentState, id)) {
    syncAchievementMirrorFromStore(state);
    return {
      ok: true,
      reason: "already_locked",
      achievementId: id,
      state: currentState,
      entry: null
    };
  }

  const nextState = { ...currentState };
  delete nextState[id];

  writeAchievementProfileState(nextState);
  cachedAchievementState = normalizeAchievementState(nextState);
  syncAchievementMirrorFromStore(state);
  return {
    ok: true,
    reason: "locked",
    achievementId: id,
    state: cachedAchievementState,
    entry: null
  };
}

export function unlockAllAchievements(options = {}) {
  const defs = listAchievementDefs();
  const results = [];
  for (const definition of defs) {
    results.push(unlockAchievement(definition.id, options));
  }
  return {
    ok: true,
    reason: "bulk_unlock",
    count: defs.length,
    results,
    state: getAchievementState(options?.state)
  };
}

export function lockAllAchievements(options = {}) {
  const defs = listAchievementDefs();
  const results = [];
  for (const definition of defs) {
    results.push(lockAchievement(definition.id, options));
  }
  return {
    ok: true,
    reason: "bulk_lock",
    count: defs.length,
    results,
    state: getAchievementState(options?.state)
  };
}