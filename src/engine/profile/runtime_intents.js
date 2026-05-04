// ============================================================================
// Profile Runtime Intents - 成长输入汇总层
// ============================================================================
// 职责边界：
// 1. 统一收集 profileIntents（action payload / plan / map tag）
// 2. 标准化意图格式并合并
// 3. 解析为 commit 可消费的标准 delta
// ============================================================================

import { PROFILE_TAG_TO_INTENTS, normalizeProfileXpKey } from "./defs.js";

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normalizeIntent(rawIntent) {
  if (!rawIntent || typeof rawIntent !== "object") return null;
  const type = String(rawIntent.type || "").trim();
  const amount = toInt(rawIntent.amount, 0);
  if (amount === 0) return null;
  const reason = String(rawIntent.reason || "generic").trim() || "generic";

  if (type === "xp") {
    const key = normalizeProfileXpKey(rawIntent.key);
    if (!key) return null;
    return { type: "xp", key, amount, reason };
  }

  if (type === "axis") {
    return { type: "axis", amount, reason };
  }

  return null;
}

function intentsFromTags(tags, reasonFallback = "tag_rule") {
  const out = [];
  for (const rawTag of Array.isArray(tags) ? tags : []) {
    const tag = String(rawTag || "").trim();
    if (!tag) continue;
    const mapped = PROFILE_TAG_TO_INTENTS[tag];
    if (!Array.isArray(mapped)) continue;
    for (const row of mapped) {
      const normalized = normalizeIntent({
        ...row,
        reason: String(row?.reason || reasonFallback || tag)
      });
      if (normalized) out.push(normalized);
    }
  }
  return out;
}

export function collectProfileIntentsFromPlan({ plan = null, action = null, source = null } = {}) {
  const collected = [];

  const pushFromArray = (arr) => {
    for (const raw of Array.isArray(arr) ? arr : []) {
      const normalized = normalizeIntent(raw);
      if (normalized) collected.push(normalized);
    }
  };

  pushFromArray(plan?.profileIntents);
  pushFromArray(action?.payload?.profileIntents);
  pushFromArray(source?.profileIntents);

  collected.push(...intentsFromTags(action?.payload?.profileTags, "action_payload_tag"));
  collected.push(...intentsFromTags(source?.profileTags, "source_tag_rule"));

  return collected;
}

export function mergeProfileIntents(intents) {
  const bucket = new Map();
  for (const raw of Array.isArray(intents) ? intents : []) {
    const normalized = normalizeIntent(raw);
    if (!normalized) continue;
    const key = normalized.type === "xp"
      ? `xp:${normalized.key}:${normalized.reason}`
      : `axis:${normalized.reason}`;
    const prev = bucket.get(key);
    if (!prev) {
      bucket.set(key, { ...normalized });
      continue;
    }
    prev.amount += normalized.amount;
  }

  const merged = [];
  for (const row of bucket.values()) {
    if (row.amount === 0) continue;
    merged.push(row);
  }
  return merged;
}

export function resolveProfileDelta(intents) {
  const merged = mergeProfileIntents(intents);
  const xp = {
    physique: 0,
    experience: 0
  };
  let worldviewAxis = 0;
  const reasons = [];

  for (const intent of merged) {
    reasons.push(intent.reason);
    if (intent.type === "xp") {
      xp[intent.key] += intent.amount;
      continue;
    }
    if (intent.type === "axis") {
      worldviewAxis += intent.amount;
    }
  }

  return {
    xp,
    worldviewAxis,
    intents: merged,
    reasons
  };
}
