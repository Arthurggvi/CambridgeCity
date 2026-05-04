const DEBUG_PLAYER_STAT_KEYS = Object.freeze([
  "hp",
  "satiety",
  "stamina",
  "fatigue",
  "temperature"
]);

function createDefaultLockState() {
  return {
    hp: { locked: false, value: null },
    satiety: { locked: false, value: null },
    stamina: { locked: false, value: null },
    fatigue: { locked: false, value: null },
    temperature: { locked: false, value: null }
  };
}

let _debugPlayerStatLocks = createDefaultLockState();

function isKnownKey(statKey) {
  return DEBUG_PLAYER_STAT_KEYS.includes(String(statKey || "").trim());
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readPlayerStatValue(player, statKey) {
  const key = String(statKey || "").trim();
  if (!player || typeof player !== "object") return null;
  switch (key) {
    case "hp":
      return toFiniteNumber(player.psycho?.hp);
    case "satiety":
      return toFiniteNumber(player.physio?.satiety);
    case "stamina":
      return toFiniteNumber(player.physio?.stamina);
    case "fatigue":
      return toFiniteNumber(player.psycho?.fatigue);
    case "temperature":
      return toFiniteNumber(player.physio?.temperatureC);
    default:
      return null;
  }
}

function writePlayerStatValue(player, statKey, value) {
  const key = String(statKey || "").trim();
  if (!player || typeof player !== "object") return false;
  switch (key) {
    case "hp":
      if (!player.psycho || typeof player.psycho !== "object") player.psycho = {};
      player.psycho.hp = value;
      return true;
    case "satiety":
      if (!player.physio || typeof player.physio !== "object") player.physio = {};
      player.physio.satiety = value;
      return true;
    case "stamina":
      if (!player.physio || typeof player.physio !== "object") player.physio = {};
      player.physio.stamina = value;
      return true;
    case "fatigue":
      if (!player.psycho || typeof player.psycho !== "object") player.psycho = {};
      player.psycho.fatigue = value;
      return true;
    case "temperature":
      if (!player.physio || typeof player.physio !== "object") player.physio = {};
      player.physio.temperatureC = value;
      return true;
    default:
      return false;
  }
}

function clampLockedValue(statKey, value, boundsByKey = {}) {
  const n = toFiniteNumber(value);
  if (n === null) return null;
  const bounds = boundsByKey?.[String(statKey || "").trim()];
  if (bounds && typeof bounds === "object") {
    const min = toFiniteNumber(bounds.min);
    const max = toFiniteNumber(bounds.max);
    if (min !== null && max !== null) {
      return Math.max(min, Math.min(max, n));
    }
    if (max !== null) {
      return Math.min(max, n);
    }
    if (min !== null) {
      return Math.max(min, n);
    }
  }
  return n;
}

export function getDebugPlayerStatLockSnapshot(statKey) {
  const key = String(statKey || "").trim();
  if (!isKnownKey(key)) {
    return { ok: false, error: "unknown-stat" };
  }

  const entry = _debugPlayerStatLocks[key] || { locked: false, value: null };
  return {
    ok: true,
    statKey: key,
    locked: entry.locked === true,
    value: toFiniteNumber(entry.value)
  };
}

export function setDebugPlayerStatLocked(statKey, locked, value = null) {
  const key = String(statKey || "").trim();
  if (!isKnownKey(key)) {
    return { ok: false, error: "unknown-stat" };
  }

  const nextLocked = locked === true;
  if (!nextLocked) {
    _debugPlayerStatLocks[key] = { locked: false, value: null };
    return getDebugPlayerStatLockSnapshot(key);
  }

  const normalized = toFiniteNumber(value);
  _debugPlayerStatLocks[key] = {
    locked: true,
    value: normalized
  };
  return getDebugPlayerStatLockSnapshot(key);
}

export function syncDebugPlayerStatLockValue(statKey, value) {
  const key = String(statKey || "").trim();
  if (!isKnownKey(key)) {
    return { ok: false, error: "unknown-stat" };
  }
  if (_debugPlayerStatLocks[key]?.locked !== true) {
    return getDebugPlayerStatLockSnapshot(key);
  }
  _debugPlayerStatLocks[key] = {
    locked: true,
    value: toFiniteNumber(value)
  };
  return getDebugPlayerStatLockSnapshot(key);
}

export function applyDebugPlayerStatLocks(player, options = {}) {
  const boundsByKey = options?.boundsByKey && typeof options.boundsByKey === "object"
    ? options.boundsByKey
    : {};

  const applied = {};
  let changed = false;

  for (const key of DEBUG_PLAYER_STAT_KEYS) {
    const entry = _debugPlayerStatLocks[key];
    if (!entry || entry.locked !== true) continue;

    const nextValue = clampLockedValue(key, entry.value, boundsByKey);
    if (nextValue === null) continue;

    const currentValue = readPlayerStatValue(player, key);
    if (currentValue === null || Math.abs(currentValue - nextValue) > 1e-9) {
      writePlayerStatValue(player, key, nextValue);
      changed = true;
    }

    applied[key] = nextValue;
    _debugPlayerStatLocks[key] = {
      locked: true,
      value: nextValue
    };
  }

  return {
    ok: true,
    changed,
    applied
  };
}

export function resetDebugPlayerStatLocks() {
  _debugPlayerStatLocks = createDefaultLockState();
}