// ============================================================================
// Profile Commit Layer - Profile 真值唯一写入口
// ============================================================================
// 职责边界：
// 1. 统一执行 profile delta
// 2. 负责 xp 升级、axis clamp、unlock reconcile
// 3. 供主 commit 管线调用，禁止在 resolve/render 偷写
// ============================================================================

import {
  PROFILE_UNLOCK_RULES,
  clampWorldviewAxis,
  getProfileDisplayLevelMax,
  getWorldviewAxisMagnitudeForDisplayLevel,
  getWorldviewDisplayLevelMax,
  getXpThresholdForLevel,
  normalizeProfileDisplayLevelValue,
  normalizeProfileXpKey
} from "./defs.js";
import { ensureProfileShape } from "./read.js";

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export function grantProfileXp(profile, key, amount, reason = "generic") {
  const xpKey = normalizeProfileXpKey(key);
  if (!xpKey) {
    return {
      ok: false,
      key,
      reason: `unknown_xp_key:${key}`
    };
  }

  const target = profile[xpKey];
  const delta = toInt(amount, 0);
  if (!target || typeof target !== "object" || delta === 0) {
    return {
      ok: true,
      key: xpKey,
      delta,
      levelUps: 0,
      reason
    };
  }

  target.level = Math.max(0, toInt(target.level, 0));
  target.xp = Math.max(0, toInt(target.xp, 0) + delta);

  let levelUps = 0;
  while (true) {
    const threshold = getXpThresholdForLevel(xpKey, target.level);
    if (!Number.isFinite(threshold) || threshold <= 0) break;
    if (target.xp < threshold) break;
    target.xp -= threshold;
    target.level += 1;
    levelUps += 1;
  }

  return {
    ok: true,
    key: xpKey,
    delta,
    levelUps,
    level: target.level,
    xp: target.xp,
    reason
  };
}

export function shiftWorldviewAxis(profile, amount, reason = "generic") {
  const delta = toInt(amount, 0);
  if (delta === 0) {
    return {
      ok: true,
      delta: 0,
      axis: profile?.worldview?.axis ?? 0,
      reason
    };
  }

  const before = toInt(profile?.worldview?.axis, 0);
  const after = clampWorldviewAxis(before + delta);
  profile.worldview.axis = after;

  return {
    ok: true,
    delta,
    axis: after,
    clamped: after !== before + delta,
    reason
  };
}

export function reconcileProfileUnlocks(profile, _context = {}) {
  if (!profile || typeof profile !== "object") {
    return {
      nodesGranted: [],
      flagsGranted: []
    };
  }

  if (!profile.unlocks || typeof profile.unlocks !== "object") {
    profile.unlocks = { nodes: [], flags: [] };
  }

  const nodeSet = new Set(Array.isArray(profile.unlocks.nodes) ? profile.unlocks.nodes : []);
  const flagSet = new Set(Array.isArray(profile.unlocks.flags) ? profile.unlocks.flags : []);

  const nodesGranted = [];
  for (const row of PROFILE_UNLOCK_RULES.nodes) {
    const id = String(row?.id || "").trim();
    if (!id || nodeSet.has(id)) continue;
    if (typeof row?.when === "function" && row.when(profile) !== true) continue;
    nodeSet.add(id);
    nodesGranted.push(id);
  }

  const flagsGranted = [];
  for (const row of PROFILE_UNLOCK_RULES.flags) {
    const id = String(row?.id || "").trim();
    if (!id || flagSet.has(id)) continue;
    if (typeof row?.when === "function" && row.when(profile) !== true) continue;
    flagSet.add(id);
    flagsGranted.push(id);
  }

  profile.unlocks.nodes = Array.from(nodeSet.values());
  profile.unlocks.flags = Array.from(flagSet.values());

  return {
    nodesGranted,
    flagsGranted
  };
}

export function applyProfileDelta(rawProfile, delta = {}) {
  const profile = ensureProfileShape(rawProfile);
  const before = ensureProfileShape(profile);
  const ops = [];

  const xpDelta = delta?.xp && typeof delta.xp === "object" ? delta.xp : {};
  for (const key of ["physique", "experience"]) {
    const amount = toInt(xpDelta[key], 0);
    if (amount === 0) continue;
    ops.push(grantProfileXp(profile, key, amount, `xp:${key}`));
  }

  const axisDelta = toInt(delta?.worldviewAxis, 0);
  if (axisDelta !== 0) {
    ops.push(shiftWorldviewAxis(profile, axisDelta, "worldview_axis"));
  }

  const unlockResult = reconcileProfileUnlocks(profile, { delta, ops });
  const after = ensureProfileShape(profile);

  return {
    profile: after,
    report: {
      before,
      after,
      ops,
      unlocks: unlockResult
    }
  };
}

export function applyProfileCoreValuePatch(rawProfile, patch = {}) {
  const profile = ensureProfileShape(rawProfile);
  const before = ensureProfileShape(profile);
  const ops = [];
  const nextPatch = patch && typeof patch === "object" ? patch : {};

  const setLevelField = (key, rawValue) => {
    if (rawValue == null) return;
    const normalized = normalizeProfileDisplayLevelValue(rawValue);
    const maxLevel = getProfileDisplayLevelMax();
    const level = normalized === null ? 0 : Math.max(0, Math.min(maxLevel, normalized));
    if (!profile[key] || typeof profile[key] !== "object") {
      profile[key] = { level: 0, xp: 0 };
    }
    profile[key].level = level;
    profile[key].xp = 0;
    ops.push({ type: "set_level", key, level, xp: 0 });
  };

  setLevelField("physique", nextPatch.physiqueLevel);
  setLevelField("experience", nextPatch.experienceLevel);

  if (nextPatch.worldviewLevel != null) {
    const normalized = normalizeProfileDisplayLevelValue(nextPatch.worldviewLevel);
    const maxLevel = getWorldviewDisplayLevelMax();
    const level = normalized === null ? 0 : Math.max(0, Math.min(maxLevel, normalized));
    const currentAxis = toInt(profile?.worldview?.axis, 0);
    const sign = currentAxis < 0 ? -1 : 1;
    const magnitude = getWorldviewAxisMagnitudeForDisplayLevel(level);
    profile.worldview.axis = magnitude === 0 ? 0 : clampWorldviewAxis(sign * magnitude);
    ops.push({
      type: "set_worldview_level",
      level,
      axis: profile.worldview.axis,
      side: profile.worldview.axis < 0 ? "faith" : (profile.worldview.axis > 0 ? "rational" : "neutral")
    });
  }

  if (nextPatch.worldviewAxis != null) {
    profile.worldview.axis = clampWorldviewAxis(nextPatch.worldviewAxis);
    ops.push({ type: "set_worldview_axis", axis: profile.worldview.axis });
  }

  const unlockResult = reconcileProfileUnlocks(profile, { patch: nextPatch, ops });
  const after = ensureProfileShape(profile);

  return {
    profile: after,
    report: {
      before,
      after,
      ops,
      unlocks: unlockResult
    }
  };
}
