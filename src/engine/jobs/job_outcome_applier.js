import { Effects } from "../pipeline/effects.js";
import {
  getJobRewardSummaryText,
  getJobSettlementContent
} from "./job_definitions.js";
import { resolveJobRewardMoney } from "./job_session_runner.js";

export function buildJobBonusRewardItems(jobDefinition) {
  const rules = Array.isArray(jobDefinition?.bonusRewards) ? jobDefinition.bonusRewards : [];
  return rules.map((rule) => {
    const kind = String(rule?.kind || "").trim();
    const chance = Number(rule?.chance);
    const amount = Math.max(0, Math.trunc(Number(rule?.amount) || 0));
    const safeChance = Number.isFinite(chance) ? Math.min(1, Math.max(0, chance)) : 0;
    const granted = amount > 0 && safeChance > 0 && Math.random() < safeChance;
    return { kind, amount, chance: safeChance, granted };
  }).filter((r) => r.kind && r.amount > 0);
}

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildFutureStatEffects(jobDefinition, gameState) {
  const deltas = jobDefinition?.futureStatDeltas && typeof jobDefinition.futureStatDeltas === "object"
    ? jobDefinition.futureStatDeltas
    : {};

  const effects = [];
  for (const [statKey, deltaRaw] of Object.entries(deltas)) {
    const key = String(statKey || "").trim();
    if (!key) continue;
    const delta = toFinite(deltaRaw, 0);
    const before = toFinite(gameState?.player?.extra?.jobFutureStats?.[key], 0);
    effects.push(Effects.set(`player.extra.jobFutureStats.${key}`, before + delta));
  }
  return effects;
}

export function buildJobOutcomeEffects(jobDefinition, jobSession, gameState) {
  const jobId = String(jobDefinition?.jobId || jobDefinition?.id || "").trim();
  const snapshotRewardMoney = toFinite(jobSession?.resultSnapshot?.rewardMoney, NaN);
  const rewardMoney = Number.isFinite(snapshotRewardMoney)
    ? Math.max(0, Math.round(snapshotRewardMoney))
    : resolveJobRewardMoney(jobDefinition, gameState, jobDefinition?.rewardMoney);
  const effects = [];

  if (rewardMoney !== 0) {
    effects.push(Effects.add("world.money", rewardMoney));
  }

  effects.push(...buildFutureStatEffects(jobDefinition, gameState));

  const runCountBefore = toFinite(gameState?.player?.meta?.jobRuns?.[jobId], 0);
  effects.push(Effects.set(`player.meta.jobRuns.${jobId}`, Math.max(0, Math.floor(runCountBefore)) + 1));

  const settlementContent = getJobSettlementContent(jobDefinition, jobSession?.isFirstRun !== false);
  const settlementText = String(settlementContent?.body || "").trim();
  const rewardLine = getJobRewardSummaryText({ ...jobDefinition, resolvedRewardMoney: rewardMoney });

  if (settlementText) {
    effects.push(Effects.push("logLines", settlementText.replace(/\n\n/g, " ")));
  }
  if (rewardLine) {
    effects.push(Effects.push("logLines", rewardLine));
  }

  return effects;
}
