// Work feedback template helpers.
// This module keeps work-result content data separate from UI rendering.
import { getJobDefinitionBySourceActionId, getJobRewardSummaryText } from "./jobs/job_definitions.js";

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function splitParagraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/g)
    .map((row) => String(row || "").trim())
    .filter(Boolean);
}

function uniquePush(target, text) {
  const normalized = String(text || "").trim();
  if (!normalized) return;
  if (target.includes(normalized)) return;
  target.push(normalized);
}

export function isWorkPresentationAction(actionId) {
  return !!getJobDefinitionBySourceActionId(actionId);
}

export function buildWorkPresentationPayload(input = {}) {
  const actionId = String(input.actionId || "").trim();
  const definition = getJobDefinitionBySourceActionId(actionId, input.mapId);
  if (!definition) return null;
  const pushedLogLines = Array.isArray(input.pushedLogLines)
    ? input.pushedLogLines.map((row) => String(row || "").trim()).filter(Boolean)
    : [];
  const runtimeParagraphs = splitParagraphs(input.runtimeActionFeedback);

  const openingLine = pushedLogLines[0] || runtimeParagraphs[0] || "";

  const bodyLines = [];
  uniquePush(bodyLines, pushedLogLines[1]);
  if (runtimeParagraphs.length > 2) {
    for (const paragraph of runtimeParagraphs.slice(1, -1)) {
      uniquePush(bodyLines, paragraph);
    }
  }

  const closingLine = pushedLogLines[2]
    || runtimeParagraphs[runtimeParagraphs.length - 1]
    || pushedLogLines[pushedLogLines.length - 1]
    || "";

  const beforeMoney = toFiniteNumber(input.beforeMoney, 0);
  const afterMoney = toFiniteNumber(input.afterMoney, beforeMoney);
  const currencyDelta = toFiniteNumber(input.currencyDelta, afterMoney - beforeMoney);
  const rewardRounded = Math.round(currencyDelta);
  const rewardLine = getJobRewardSummaryText(definition) || (rewardRounded !== 0
    ? `结算：${rewardRounded > 0 ? "+" : ""}${rewardRounded}`
    : "");

  return {
    token: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    actionId,
    jobKey: String(definition?.jobId || definition?.id || "").trim(),
    title: String(definition?.displayName || "工作结算").trim() || "工作结算",
    tone: String(definition?.presentationTone || "neutral").trim() || "neutral",
    animationPreset: "inline_stagger_soft",
    openingLine,
    bodyLines,
    closingLine,
    rewardLine,
    rewardValue: rewardRounded,
    currencyDelta,
    balanceBefore: beforeMoney,
    balanceAfter: afterMoney,
    mapId: String(input.mapId || ""),
    createdAtMs: Date.now(),
    totalMinutes: Math.max(0, Math.floor(toFiniteNumber(input.totalMinutes, 0)))
  };
}

export function normalizeWorkPresentationPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const actionId = String(payload.actionId || "").trim();
  if (!isWorkPresentationAction(actionId)) return null;

  const bodyLines = Array.isArray(payload.bodyLines)
    ? payload.bodyLines.map((row) => String(row || "").trim()).filter(Boolean)
    : [];

  return {
    token: String(payload.token || "").trim() || null,
    actionId,
    jobKey: String(payload.jobKey || "").trim() || "",
    title: String(payload.title || "").trim() || "工作结算",
    tone: String(payload.tone || "").trim() || "neutral",
    animationPreset: String(payload.animationPreset || "inline_stagger_soft"),
    openingLine: String(payload.openingLine || "").trim(),
    bodyLines,
    closingLine: String(payload.closingLine || "").trim(),
    rewardLine: String(payload.rewardLine || "").trim(),
    rewardValue: Math.round(toFiniteNumber(payload.rewardValue, 0)),
    currencyDelta: toFiniteNumber(payload.currencyDelta, 0),
    balanceBefore: toFiniteNumber(payload.balanceBefore, 0),
    balanceAfter: toFiniteNumber(payload.balanceAfter, 0),
    mapId: String(payload.mapId || "").trim(),
    createdAtMs: Math.max(0, Math.floor(toFiniteNumber(payload.createdAtMs, 0))),
    totalMinutes: Math.max(0, Math.floor(toFiniteNumber(payload.totalMinutes, 0)))
  };
}

export function buildMoneyDeltaFxPayload(input = {}) {
  const delta = Math.round(toFiniteNumber(input.currencyDelta, 0));
  if (delta === 0) return null;

  const accent = delta > 0 ? "income" : "expense";
  return {
    token: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sourceActionId: String(input.sourceActionId || "").trim() || "",
    accent,
    delta,
    label: `${delta > 0 ? "+" : ""}${delta}`,
    balanceBefore: toFiniteNumber(input.balanceBefore, 0),
    balanceAfter: toFiniteNumber(input.balanceAfter, 0),
    createdAtMs: Date.now(),
    durationMs: 2200
  };
}

export function normalizeMoneyDeltaFxPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const delta = Math.round(toFiniteNumber(payload.delta, 0));
  if (delta === 0) return null;

  const accentRaw = String(payload.accent || "").trim();
  const accent = accentRaw === "expense" ? "expense" : "income";
  return {
    token: String(payload.token || "").trim() || null,
    sourceActionId: String(payload.sourceActionId || "").trim(),
    accent,
    delta,
    label: String(payload.label || `${delta > 0 ? "+" : ""}${delta}`),
    balanceBefore: toFiniteNumber(payload.balanceBefore, 0),
    balanceAfter: toFiniteNumber(payload.balanceAfter, 0),
    createdAtMs: Math.max(0, Math.floor(toFiniteNumber(payload.createdAtMs, 0))),
    durationMs: Math.max(200, Math.floor(toFiniteNumber(payload.durationMs, 2200)))
  };
}
