// ============================================================================
// Profile Defs - Profile 子系统静态定义
// ============================================================================
// 职责边界：
// 1. 只放静态表与常量，不读写 gameState
// 2. 对外提供统一默认结构与阈值规则
// 3. 提供 tag/intention -> delta 的换算表（可逐步扩充）
// ============================================================================

export const PROFILE_REVISION = 1;

export const PROFILE_WORLDVIEW_AXIS_MIN = -100;
export const PROFILE_WORLDVIEW_AXIS_MAX = 100;

export const PROFILE_XP_KEYS = Object.freeze(["physique", "experience"]);

export const PROFILE_DISPLAY_XP_MAX = 1500;

// 等级契约：
// Lv.0: [0, 80)
// Lv.1: [80, 200)
// Lv.2: [200, 400)
// Lv.3: [400, 800)
// Lv.4: [800, 1500)
// EX  : [1500, +inf)
// 对于提交层阈值，使用逐级升级花费：[80, 120, 200, 400, 700]。
export const PROFILE_XP_THRESHOLDS = Object.freeze({
  physique: Object.freeze([80, 120, 200, 400, 700]),
  experience: Object.freeze([80, 120, 200, 400, 700])
});

export const PROFILE_DISPLAY_LEVEL_BANDS = Object.freeze([
  Object.freeze({ minXp: 0, maxXp: 80, label: "0" }),
  Object.freeze({ minXp: 80, maxXp: 200, label: "1" }),
  Object.freeze({ minXp: 200, maxXp: 400, label: "2" }),
  Object.freeze({ minXp: 400, maxXp: 800, label: "3" }),
  Object.freeze({ minXp: 800, maxXp: 1500, label: "4" }),
  Object.freeze({ minXp: 1500, maxXp: Number.POSITIVE_INFINITY, label: "EX" })
]);

export const PROFILE_BASE_RULES = Object.freeze({
  allowNegativeXpDelta: true,
  clampAxisOnWrite: true,
  unlockOnCommit: true
});

// 预留：tag 到意图换算规则。当前只提供少量示例，后续可扩展。
export const PROFILE_TAG_TO_INTENTS = Object.freeze({
  hard_labor: Object.freeze([{ type: "xp", key: "physique", amount: 2, reason: "hard_labor" }]),
  dialogue: Object.freeze([{ type: "xp", key: "experience", amount: 1, reason: "dialogue" }]),
  rational_choice: Object.freeze([{ type: "axis", amount: 3, reason: "rational_choice" }]),
  faith_choice: Object.freeze([{ type: "axis", amount: -3, reason: "faith_choice" }])
});

export const PROFILE_UNLOCK_RULES = Object.freeze({
  nodes: Object.freeze([]),
  flags: Object.freeze([])
});

export function createDefaultProfile() {
  return {
    revision: PROFILE_REVISION,
    physique: { level: 0, xp: 0 },
    experience: { level: 0, xp: 0 },
    worldview: { axis: 0 },
    dossierCreatedAtMinutes: null,
    unlocks: { nodes: [], flags: [] }
  };
}

export function clampWorldviewAxis(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.max(PROFILE_WORLDVIEW_AXIS_MIN, Math.min(PROFILE_WORLDVIEW_AXIS_MAX, Math.trunc(n)));
  return clamped;
}

export function normalizeProfileXpKey(key) {
  const raw = String(key || "").trim();
  return PROFILE_XP_KEYS.includes(raw) ? raw : null;
}

export function getXpThresholdForLevel(key, level) {
  const xpKey = normalizeProfileXpKey(key);
  if (!xpKey) return Number.POSITIVE_INFINITY;

  const lv = Math.max(0, Math.trunc(Number(level) || 0));
  const table = PROFILE_XP_THRESHOLDS[xpKey] || [];
  if (lv < table.length) {
    return Math.max(1, Math.trunc(Number(table[lv]) || 1));
  }

  const tailBase = table.length > 0
    ? Math.max(1, Math.trunc(Number(table[table.length - 1]) || 1))
    : 1;
  const tailStep = Math.max(5, Math.floor(tailBase * 0.2));
  const extraLevels = lv - table.length + 1;
  return tailBase + (extraLevels * tailStep);
}

export function getProfileTotalXp(key, level, xp) {
  const xpKey = normalizeProfileXpKey(key);
  if (!xpKey) return Math.max(0, Math.trunc(Number(xp) || 0));
  const lv = Math.max(0, Math.trunc(Number(level) || 0));
  const restXp = Math.max(0, Math.trunc(Number(xp) || 0));

  let total = restXp;
  for (let i = 0; i < lv; i += 1) {
    total += Math.max(0, Math.trunc(getXpThresholdForLevel(xpKey, i) || 0));
  }
  return total;
}

export function getProfileDisplayLevelByXp(totalXp) {
  const n = Math.max(0, Math.trunc(Number(totalXp) || 0));
  for (const row of PROFILE_DISPLAY_LEVEL_BANDS) {
    if (n >= row.minXp && n < row.maxXp) return row.label;
  }
  return "EX";
}

export function normalizeProfileDisplayLevelValue(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "EX") return 5;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(5, Math.trunc(n)));
}

export function formatProfileDisplayLevelLabel(level) {
  const normalized = normalizeProfileDisplayLevelValue(level);
  if (normalized === null) return "0";
  return normalized >= 5 ? "EX" : String(normalized);
}

export function getProfileDisplayLevelMax() {
  let maxLevel = 0;
  for (const row of PROFILE_DISPLAY_LEVEL_BANDS) {
    const normalized = normalizeProfileDisplayLevelValue(row.label);
    if (normalized === null) continue;
    maxLevel = Math.max(maxLevel, normalized);
  }
  return maxLevel;
}

export function getWorldviewDisplayLevelMax() {
  return normalizeProfileDisplayLevelValue(getProfileDisplayLevelByXp(PROFILE_WORLDVIEW_AXIS_MAX)) ?? 0;
}

export function getProfileDisplayLevelMinValue(level) {
  const label = formatProfileDisplayLevelLabel(level);
  const band = PROFILE_DISPLAY_LEVEL_BANDS.find((row) => String(row.label || "").toUpperCase() === label);
  return band ? Math.max(0, Math.trunc(Number(band.minXp) || 0)) : 0;
}

export function getWorldviewAxisMagnitudeForDisplayLevel(level) {
  const worldviewLevelMax = getWorldviewDisplayLevelMax();
  const normalized = normalizeProfileDisplayLevelValue(level);
  const clampedLevel = normalized === null ? 0 : Math.max(0, Math.min(worldviewLevelMax, normalized));
  if (clampedLevel <= 0) return 0;
  return Math.min(PROFILE_WORLDVIEW_AXIS_MAX, getProfileDisplayLevelMinValue(clampedLevel));
}
