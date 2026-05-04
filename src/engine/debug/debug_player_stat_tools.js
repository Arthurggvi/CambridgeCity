import { gameState } from "../state.js";
import { dispatch } from "../pipeline/dispatch.js";
import { getPlayerDerived } from "../player.js";
import { PLAYER_DEFS } from "../player_defs.js";
import { syncDebugPlayerStatLockValue } from "./debug_player_stat_locks.js";

const STAT_DEFS = Object.freeze({
  hp: {
    path: "player.psycho.hp"
  },
  satiety: {
    path: "player.physio.satiety"
  },
  stamina: {
    path: "player.physio.stamina"
  },
  fatigue: {
    path: "player.psycho.fatigue"
  },
  temperature: {
    path: "player.physio.temperatureC"
  }
});

function toFiniteNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function resolveStatMax(statKey) {
  const key = String(statKey || "").trim();
  const player = gameState.player;
  if (!player || !STAT_DEFS[key]) {
    return null;
  }

  if (key === "temperature") {
    const coreDefs = PLAYER_DEFS?.temperature?.coreTemp || {};
    const fallbackCore = PLAYER_DEFS?.temperature?.core || {};
    const max = toFiniteNumber(coreDefs?.maxC ?? fallbackCore?.maxC ?? coreDefs?.T_core_max ?? 40);
    return max !== null ? max : 40;
  }

  const limits = player.limits && typeof player.limits === "object" ? player.limits : null;
  const maxFieldMap = {
    hp: "hpMax",
    satiety: "satietyMax",
    stamina: "staminaMax",
    fatigue: "fatigueMax"
  };

  const limitMax = toFiniteNumber(limits?.[maxFieldMap[key]]);
  if (limitMax !== null && limitMax > 0) {
    return limitMax;
  }

  const derived = getPlayerDerived(player);
  const derivedMax = toFiniteNumber(derived?.attrs?.[key]?.effectiveMax);
  if (derivedMax !== null && derivedMax > 0) {
    return derivedMax;
  }

  const baseMax = toFiniteNumber(derived?.attrs?.[key]?.baseMax);
  if (baseMax !== null && baseMax > 0) {
    return baseMax;
  }

  return null;
}

function resolveStatMin(statKey) {
  const key = String(statKey || "").trim();
  if (!STAT_DEFS[key]) return null;
  if (key !== "temperature") return 0;
  const coreDefs = PLAYER_DEFS?.temperature?.coreTemp || {};
  const fallbackCore = PLAYER_DEFS?.temperature?.core || {};
  const min = toFiniteNumber(coreDefs?.minC ?? fallbackCore?.minC ?? coreDefs?.T_core_min ?? 20);
  return min !== null ? min : 20;
}

export function normalizeDebugPlayerStatValue(statKey, value) {
  const n = toFiniteNumber(value);
  if (n === null) return { ok: false, error: "invalid-value" };
  const min = resolveStatMin(statKey);
  const max = resolveStatMax(statKey);
  if (max === null || min === null) return { ok: false, error: "unknown-stat" };
  const clamped = Math.max(min, Math.min(max, n));
  return { ok: true, value: clamped, min, max };
}

function readCurrentValue(statKey) {
  const key = String(statKey || "").trim();
  const player = gameState.player;
  if (!player || !STAT_DEFS[key]) return null;

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

export function getDebugPlayerStatSnapshot(statKey) {
  const key = String(statKey || "").trim();
  if (!STAT_DEFS[key]) {
    return { ok: false, error: "unknown-stat" };
  }

  const current = readCurrentValue(key);
  const max = resolveStatMax(key);
  if (current === null || max === null) {
    return { ok: false, error: "stat-not-ready" };
  }

  return {
    ok: true,
    statKey: key,
    current,
    max,
    min: resolveStatMin(key)
  };
}

export async function setDebugPlayerStatValue(statKey, value) {
  const key = String(statKey || "").trim();
  if (!STAT_DEFS[key]) {
    return { ok: false, error: "unknown-stat" };
  }

  const normalized = normalizeDebugPlayerStatValue(key, value);
  if (!normalized.ok) {
    return normalized;
  }

  await dispatch("debug_set_player_stat_value", {
    statKey: key,
    value: normalized.value
  });
  syncDebugPlayerStatLockValue(key, normalized.value);

  return {
    ok: true,
    statKey: key,
    value: normalized.value,
    min: normalized.min,
    max: normalized.max
  };
}

export async function addDebugPlayerStatDelta(statKey, delta) {
  const key = String(statKey || "").trim();
  if (!STAT_DEFS[key]) {
    return { ok: false, error: "unknown-stat" };
  }

  const current = readCurrentValue(key);
  const deltaNum = toFiniteNumber(delta);
  if (current === null || deltaNum === null) {
    return { ok: false, error: "invalid-delta" };
  }

  return setDebugPlayerStatValue(key, current + deltaNum);
}