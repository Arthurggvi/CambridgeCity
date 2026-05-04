// ============================================================================
// Profile Read Layer - 只读快照、补齐、门禁判定
// ============================================================================
// 职责边界：
// 1. 允许做 shape ensure/migrate（返回新对象，不就地偷写）
// 2. 只读派生展示值（理性/信仰）
// 3. 提供 requires.profile 判定入口
// ============================================================================

import {
  PROFILE_REVISION,
  createDefaultProfile,
  clampWorldviewAxis
} from "./defs.js";

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normalizeLevelXp(rawLevel, rawXp) {
  const level = Math.max(0, toInt(rawLevel, 0));
  const xp = Math.max(0, toInt(rawXp, 0));
  return { level, xp };
}

function asArrayOfStrings(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const text = String(item || "").trim();
    if (!text) continue;
    out.push(text);
  }
  return out;
}

export function ensureProfileShape(rawProfile) {
  const base = createDefaultProfile();
  const source = rawProfile && typeof rawProfile === "object" ? rawProfile : {};

  const physique = normalizeLevelXp(source?.physique?.level, source?.physique?.xp);
  const experience = normalizeLevelXp(source?.experience?.level, source?.experience?.xp);
  const worldviewAxis = clampWorldviewAxis(source?.worldview?.axis);
  const dossierCreatedAtMinutes = Number.isFinite(Number(source?.dossierCreatedAtMinutes))
    ? Math.max(0, toInt(source.dossierCreatedAtMinutes, 0))
    : null;
  const unlockNodes = asArrayOfStrings(source?.unlocks?.nodes);
  const unlockFlags = asArrayOfStrings(source?.unlocks?.flags);

  return {
    ...base,
    revision: PROFILE_REVISION,
    physique,
    experience,
    worldview: { axis: worldviewAxis },
    dossierCreatedAtMinutes,
    unlocks: {
      nodes: unlockNodes,
      flags: unlockFlags
    }
  };
}

export function getProfileSnapshot(profile) {
  const normalized = ensureProfileShape(profile);
  return {
    revision: normalized.revision,
    physique: { ...normalized.physique },
    experience: { ...normalized.experience },
    worldview: { ...normalized.worldview },
    dossierCreatedAtMinutes: normalized.dossierCreatedAtMinutes,
    unlocks: {
      nodes: [...normalized.unlocks.nodes],
      flags: [...normalized.unlocks.flags]
    }
  };
}

export function getProfileViewModel(profile) {
  const snapshot = getProfileSnapshot(profile);
  const axis = Number(snapshot?.worldview?.axis ?? 0);
  return {
    revision: snapshot.revision,
    physique: {
      level: snapshot.physique.level,
      xp: snapshot.physique.xp
    },
    experience: {
      level: snapshot.experience.level,
      xp: snapshot.experience.xp
    },
    worldview: {
      axis
    },
    dossierCreatedAtMinutes: snapshot.dossierCreatedAtMinutes,
    rationalityDisplay: Math.max(0, axis),
    faithDisplay: Math.max(0, -axis),
    unlocks: {
      nodes: [...snapshot.unlocks.nodes],
      flags: [...snapshot.unlocks.flags]
    }
  };
}

function compareGte(actual, expected) {
  return Number(actual) >= Number(expected);
}

function compareLte(actual, expected) {
  return Number(actual) <= Number(expected);
}

export function checkProfileRequires(profile, profileRequires) {
  if (!profileRequires || typeof profileRequires !== "object") {
    return { ok: true, reasons: [] };
  }

  const snapshot = getProfileSnapshot(profile);
  const reasons = [];

  const checks = [
    {
      has: profileRequires?.physique && typeof profileRequires.physique === "object" && profileRequires.physique.gte != null,
      ok: () => compareGte(snapshot.physique.level, profileRequires.physique.gte),
      reason: () => `需要 profile.physique.level >= ${profileRequires.physique.gte}（当前 ${snapshot.physique.level}）`
    },
    {
      has: profileRequires?.experience && typeof profileRequires.experience === "object" && profileRequires.experience.gte != null,
      ok: () => compareGte(snapshot.experience.level, profileRequires.experience.gte),
      reason: () => `需要 profile.experience.level >= ${profileRequires.experience.gte}（当前 ${snapshot.experience.level}）`
    },
    {
      has: profileRequires?.worldviewAxis && typeof profileRequires.worldviewAxis === "object" && profileRequires.worldviewAxis.gte != null,
      ok: () => compareGte(snapshot.worldview.axis, profileRequires.worldviewAxis.gte),
      reason: () => `需要 profile.worldview.axis >= ${profileRequires.worldviewAxis.gte}（当前 ${snapshot.worldview.axis}）`
    },
    {
      has: profileRequires?.worldviewAxis && typeof profileRequires.worldviewAxis === "object" && profileRequires.worldviewAxis.lte != null,
      ok: () => compareLte(snapshot.worldview.axis, profileRequires.worldviewAxis.lte),
      reason: () => `需要 profile.worldview.axis <= ${profileRequires.worldviewAxis.lte}（当前 ${snapshot.worldview.axis}）`
    },
    {
      has: profileRequires?.rationality && typeof profileRequires.rationality === "object" && profileRequires.rationality.gte != null,
      ok: () => compareGte(Math.max(0, snapshot.worldview.axis), profileRequires.rationality.gte),
      reason: () => `需要 rationality >= ${profileRequires.rationality.gte}（当前 ${Math.max(0, snapshot.worldview.axis)}）`
    },
    {
      has: profileRequires?.faith && typeof profileRequires.faith === "object" && profileRequires.faith.gte != null,
      ok: () => compareGte(Math.max(0, -snapshot.worldview.axis), profileRequires.faith.gte),
      reason: () => `需要 faith >= ${profileRequires.faith.gte}（当前 ${Math.max(0, -snapshot.worldview.axis)}）`
    }
  ];

  for (const row of checks) {
    if (!row.has) continue;
    if (!row.ok()) {
      reasons.push(row.reason());
    }
  }

  return {
    ok: reasons.length === 0,
    reasons
  };
}
