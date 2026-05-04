const ACHIEVEMENT_PROFILE_STORAGE_KEY = "CambridgeCity_Profile_Achievements";
const ACHIEVEMENT_MIGRATION_MARKER_KEY = "CambridgeCity_Profile_Achievements_Migrated_v1";

export { ACHIEVEMENT_PROFILE_STORAGE_KEY, ACHIEVEMENT_MIGRATION_MARKER_KEY };

export function createEmptyAchievementState() {
  return {};
}

function cloneAchievementEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const unlocked = entry.unlocked === true;
  const unlockedAtSystemTime = typeof entry.unlockedAtSystemTime === "string"
    ? String(entry.unlockedAtSystemTime).trim()
    : "";
  if (!unlocked && !unlockedAtSystemTime) return null;
  return {
    unlocked,
    unlockedAtSystemTime: unlockedAtSystemTime || null
  };
}

export function normalizeAchievementState(rawState) {
  if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
    return createEmptyAchievementState();
  }

  const next = {};
  for (const [achievementId, rawEntry] of Object.entries(rawState)) {
    const id = String(achievementId || "").trim();
    if (!id) continue;
    const entry = cloneAchievementEntry(rawEntry);
    if (!entry) continue;
    next[id] = entry;
  }
  return next;
}

function resolveLocalStorage() {
  try {
    if (typeof window !== "undefined" && window?.localStorage) {
      return window.localStorage;
    }
  } catch {
  }
  return null;
}

function safeParse(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function readStorageValue(key) {
  const storage = resolveLocalStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key, value) {
  const storage = resolveLocalStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function readAchievementProfileState() {
  const raw = readStorageValue(ACHIEVEMENT_PROFILE_STORAGE_KEY);
  if (raw == null || raw === "") {
    return {
      ok: false,
      reason: "missing",
      state: createEmptyAchievementState()
    };
  }

  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      reason: "invalid_json",
      state: createEmptyAchievementState()
    };
  }

  return {
    ok: true,
    reason: "loaded",
    state: normalizeAchievementState(parsed)
  };
}

export function writeAchievementProfileState(achievementsState) {
  const normalized = normalizeAchievementState(achievementsState);
  return writeStorageValue(ACHIEVEMENT_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
}

export function hasAchievementMigrationMarker() {
  return readStorageValue(ACHIEVEMENT_MIGRATION_MARKER_KEY) === "1";
}

export function writeAchievementMigrationMarker() {
  return writeStorageValue(ACHIEVEMENT_MIGRATION_MARKER_KEY, "1");
}

function toValidAchievementTimestamp(rawValue) {
  if (typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  const timeMs = Date.parse(trimmed);
  if (!Number.isFinite(timeMs)) return null;
  return {
    text: trimmed,
    timeMs
  };
}

function mergeAchievementEntry(currentEntry, incomingEntry) {
  const current = cloneAchievementEntry(currentEntry);
  const incoming = cloneAchievementEntry(incomingEntry);
  if (!current && !incoming) return null;
  if (!current) return incoming;
  if (!incoming) return current;

  const unlocked = current.unlocked === true || incoming.unlocked === true;
  const currentTime = toValidAchievementTimestamp(current.unlockedAtSystemTime);
  const incomingTime = toValidAchievementTimestamp(incoming.unlockedAtSystemTime);

  let unlockedAtSystemTime = null;
  if (currentTime && incomingTime) {
    unlockedAtSystemTime = currentTime.timeMs <= incomingTime.timeMs
      ? currentTime.text
      : incomingTime.text;
  } else if (currentTime) {
    unlockedAtSystemTime = currentTime.text;
  } else if (incomingTime) {
    unlockedAtSystemTime = incomingTime.text;
  }

  return {
    unlocked,
    unlockedAtSystemTime
  };
}

export function mergeAchievementStates(...states) {
  const merged = createEmptyAchievementState();
  for (const rawState of states) {
    const normalized = normalizeAchievementState(rawState);
    for (const [achievementId, entry] of Object.entries(normalized)) {
      const nextEntry = mergeAchievementEntry(merged[achievementId], entry);
      if (!nextEntry) continue;
      merged[achievementId] = nextEntry;
    }
  }
  return merged;
}