import { JOB_SESSION_STATUS, createJobSession } from "./job_session.js";
import { getJobExecutionContent, getJobRewardPolicyById } from "./job_definitions.js";
import { getPlayerDerived } from "../player.js";

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function makeToken() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function resolveJobRewardMoney(jobDefinition, gameState, fallbackRewardMoney = 0) {
  const rewardPolicy = jobDefinition?.rewardPolicy || getJobRewardPolicyById(jobDefinition?.rewardPolicyId);
  const baseRewardMoney = toFinite(rewardPolicy?.money ?? jobDefinition?.rewardMoney ?? fallbackRewardMoney, 0);
  const derived = getPlayerDerived(gameState?.player || {});
  const workGainMul = Number(derived?.mods?.workGainMul);
  const rewardMul = Number.isFinite(workGainMul) && workGainMul > 0 ? workGainMul : 1;
  return Math.max(0, Math.round(baseRewardMoney * rewardMul));
}

export function beginJobSession(jobDefinition, gameState) {
  return createJobSession(jobDefinition, gameState);
}

export function withBriefingReply(session, replyType) {
  return {
    ...session,
    briefingReplyType: replyType
  };
}

export function buildExecutionTransition(jobDefinition, session, gameState) {
  const minutes = Math.max(0, Math.floor(toFinite(jobDefinition?.durationMinutes ?? jobDefinition?.timeCostMinutes, 0)));
  const mapId = String(gameState?.currentMapId || gameState?.world?.currentMapId || "").trim();
  const money = toFinite(gameState?.world?.money, 0);
  const executionContent = getJobExecutionContent(jobDefinition);
  const rewardPolicy = jobDefinition?.rewardPolicy || getJobRewardPolicyById(jobDefinition?.rewardPolicyId);
  const rewardMoney = Math.round(toFinite(rewardPolicy?.money ?? jobDefinition?.rewardMoney, 0));

  return {
    advanceTimeMinutes: minutes,
    advanceCtx: {
      isSleeping: false,
      sessionCoverage: "NONE",
      exposureMultiplier: Number(jobDefinition?.thermal?.exposureMultiplier),
      thermalActivity: String(jobDefinition?.thermal?.activity || "light_work")
    },
    nextSession: {
      ...session,
      status: JOB_SESSION_STATUS.EXECUTING,
      accepted: true,
      executionCompleted: true,
      briefingReplyType: null,
      resultSnapshot: {
        ...(session?.resultSnapshot || {}),
        acceptedAtMinutes: Math.max(0, Math.floor(toFinite(gameState?.time?.totalMinutes, 0))),
        executionMinutes: minutes,
        rewardMoney,
        sourceMapId: String(session?.sourceMapId || mapId),
        sourceActionId: String(session?.sourceActionId || "")
      }
    },
    executionPresentationPayload: {
      token: makeToken(),
      actionId: String(jobDefinition?.sourceActionId || ""),
      jobKey: String(jobDefinition?.jobId || jobDefinition?.id || ""),
      title: String(executionContent?.title || jobDefinition?.displayName || "工作执行"),
      tone: String(executionContent?.tone || jobDefinition?.presentationTone || "neutral"),
      animationPreset: "inline_stagger_soft",
      openingLine: String(executionContent?.body?.[0] || "").trim(),
      bodyLines: Array.isArray(executionContent?.body)
        ? executionContent.body.slice(1, -1).map((row) => String(row || "").trim()).filter(Boolean)
        : [],
      closingLine: Array.isArray(executionContent?.body) ? String(executionContent.body[executionContent.body.length - 1] || "").trim() : "",
      rewardLine: "",
      rewardValue: rewardMoney,
      currencyDelta: 0,
      balanceBefore: money,
      balanceAfter: money,
      mapId,
      createdAtMs: Date.now(),
      totalMinutes: Math.max(0, Math.floor(toFinite(gameState?.time?.totalMinutes, 0)))
    }
  };
}

export function buildSettlementTransition(session, settlementRewards = null) {
  const resultSnapshot = session?.resultSnapshot && typeof session.resultSnapshot === "object"
    ? session.resultSnapshot
    : {};
  return {
    ...session,
    status: JOB_SESSION_STATUS.SETTLEMENT,
    briefingReplyType: null,
    resultSnapshot: {
      ...resultSnapshot,
      rewardMoney: Math.max(0, Math.round(toFinite(resultSnapshot.rewardMoney, 0)))
    },
    ...(settlementRewards !== null ? { settlementRewards } : {})
  };
}

export function buildCompletionSnapshot(jobDefinition, session, gameState) {
  const snapshotRewardMoney = toFinite(session?.resultSnapshot?.rewardMoney, NaN);
  const rewardMoney = Number.isFinite(snapshotRewardMoney)
    ? Math.max(0, Math.round(snapshotRewardMoney))
    : resolveJobRewardMoney(jobDefinition, gameState, jobDefinition?.rewardMoney);
  return {
    ...(session?.resultSnapshot || {}),
    jobId: String(jobDefinition?.jobId || jobDefinition?.id || ""),
    status: JOB_SESSION_STATUS.COMPLETED,
    settlementApplied: true,
    completedAtMinutes: Math.max(0, Math.floor(toFinite(gameState?.time?.totalMinutes, 0))),
    rewardMoney,
    futureStatDeltas: {
      ...(jobDefinition?.futureStatDeltas || {})
    },
    settlementRewards: Array.isArray(session?.settlementRewards) ? session.settlementRewards : []
  };
}
