import { getJobDefinitionById, getJobDefinitionBySourceActionId } from "../../jobs/job_definitions.js";
import { resolveJobAvailability } from "../../jobs/job_availability_resolver.js";
import { INQUIRY_SESSION_STATUS, normalizeInquirySession } from "../../inquiry/inquiry_session.js";
import {
  JOB_SESSION_ACTION,
  JOB_SESSION_STATUS,
  isJobSessionUiAction,
  normalizeJobSession
} from "../../jobs/job_session.js";
import { addRecordIntent } from "../plan_types.js";
import { hasUnlockedRecord } from "../../records/record_service.js";
import {
  beginJobSession,
  withBriefingReply,
  buildExecutionTransition,
  buildSettlementTransition,
  buildCompletionSnapshot,
  resolveJobRewardMoney
} from "../../jobs/job_session_runner.js";
import { buildJobOutcomeEffects, buildJobBonusRewardItems } from "../../jobs/job_outcome_applier.js";
import { shouldRejectGameplayAction } from "./gameplay_precheck.js";

const MANIFEST_RECORD_ID = "industrial_manifest_post_001";
const MANIFEST_JOB_ID = "inventory_check_short_job";
const MANIFEST_RECORD_PROGRESS_PATH = "player.meta.inventoryCheckShortJobRecordCount";
const MANIFEST_RECORD_UNLOCK_THRESHOLD = 3;
const THESEUS_RECORD_ID = "steelcross_port_theseus_luggage_shift_001";
const THESEUS_JOB_ID = "theseus_luggage_shift";
const THESEUS_COMPLETION_COUNT_PATH = "player.meta.theseusLuggageShiftCompletionCount";
const THESEUS_RECORD_UNLOCK_THRESHOLD = 3;
const THESEUS_PHYSIQUE_REWARD = 10;

function reject(plan, source, code, reason) {
  plan.rejection = {
    source,
    code,
    reason
  };
}

function applyGameplayPrecheck(plan, gameState, addNote) {
  if (plan?.rejection) return;
  const rejection = shouldRejectGameplayAction(gameState, plan);
  if (!rejection) return;
  plan.rejection = rejection;
  addNote(plan, `玩法门禁拒绝：${rejection.code}`);
}

function isBlockingSessionStatus(status) {
  return status === JOB_SESSION_STATUS.BRIEFING
    || status === JOB_SESSION_STATUS.ACCEPTED
    || status === JOB_SESSION_STATUS.EXECUTING
    || status === JOB_SESSION_STATUS.SETTLEMENT;
}

function maybeProgressManifestRecordUnlock(plan, jobDefinition, activeSession, gameState, addEffect, addNote, Effects) {
  if (String(jobDefinition?.jobId || "").trim() !== MANIFEST_JOB_ID) {
    return;
  }

  if (hasUnlockedRecord({
    recordId: MANIFEST_RECORD_ID,
    recordsState: gameState?.player?.records
  })) {
    addNote(plan, `JobSession：记录已拥有，跳过累计与解锁（record=${MANIFEST_RECORD_ID}）`);
    return;
  }

  const currentCountRaw = Number(gameState?.player?.meta?.inventoryCheckShortJobRecordCount ?? 0);
  const currentCount = Number.isFinite(currentCountRaw) ? Math.max(0, Math.floor(currentCountRaw)) : 0;
  if (currentCount >= MANIFEST_RECORD_UNLOCK_THRESHOLD) {
    addNote(plan, `JobSession：记录累计已封顶，跳过重复触发（record=${MANIFEST_RECORD_ID}）`);
    return;
  }

  const nextCount = Math.min(MANIFEST_RECORD_UNLOCK_THRESHOLD, currentCount + 1);
  addEffect(plan, Effects.set(MANIFEST_RECORD_PROGRESS_PATH, nextCount));

  if (nextCount < MANIFEST_RECORD_UNLOCK_THRESHOLD) {
    addNote(plan, `JobSession：记录累计 +1（record=${MANIFEST_RECORD_ID}, progress=${nextCount}/${MANIFEST_RECORD_UNLOCK_THRESHOLD}）`);
    return;
  }

  addRecordIntent(plan, {
    type: "UNLOCK_RECORD",
    recordId: MANIFEST_RECORD_ID,
    triggerContext: {
      mapId: String(activeSession?.sourceMapId || gameState?.currentMapId || gameState?.world?.currentMapId || "").trim() || null,
      actionId: String(activeSession?.sourceActionId || jobDefinition?.sourceActionId || "").trim() || null,
      sceneId: String(gameState?.currentScene?.id || gameState?.currentSceneId || "").trim() || null,
      source: "job_session_settlement"
    }
  });
  addNote(plan, `JobSession：记录累计达到阈值并追加解锁意图（record=${MANIFEST_RECORD_ID}, progress=${nextCount}/${MANIFEST_RECORD_UNLOCK_THRESHOLD}）`);
}

function maybeProgressTheseusRecordUnlock(plan, jobDefinition, activeSession, gameState, addEffect, addNote, Effects) {
  if (String(jobDefinition?.jobId || "").trim() !== THESEUS_JOB_ID) {
    return;
  }

  const currentCountRaw = Number(gameState?.player?.meta?.theseusLuggageShiftCompletionCount ?? 0);
  const currentCount = Number.isFinite(currentCountRaw) ? Math.max(0, Math.floor(currentCountRaw)) : 0;
  const nextCount = currentCount + 1;
  addEffect(plan, Effects.set(THESEUS_COMPLETION_COUNT_PATH, nextCount));

  if (hasUnlockedRecord({
    recordId: THESEUS_RECORD_ID,
    recordsState: gameState?.player?.records
  })) {
    addNote(plan, `JobSession：Theseus 完成次数 +1，记录已拥有（record=${THESEUS_RECORD_ID}, count=${nextCount}）`);
    return;
  }

  if (nextCount < THESEUS_RECORD_UNLOCK_THRESHOLD) {
    addNote(plan, `JobSession：Theseus 完成次数 +1（record=${THESEUS_RECORD_ID}, progress=${nextCount}/${THESEUS_RECORD_UNLOCK_THRESHOLD}）`);
    return;
  }

  addRecordIntent(plan, {
    type: "UNLOCK_RECORD",
    recordId: THESEUS_RECORD_ID,
    triggerContext: {
      mapId: String(activeSession?.sourceMapId || gameState?.currentMapId || gameState?.world?.currentMapId || "").trim() || null,
      actionId: String(activeSession?.sourceActionId || jobDefinition?.sourceActionId || "").trim() || null,
      sceneId: String(gameState?.currentScene?.id || gameState?.currentSceneId || "").trim() || null,
      source: "job_session_settlement"
    }
  });
  addNote(plan, `JobSession：Theseus 完成次数达到阈值并追加解锁意图（record=${THESEUS_RECORD_ID}, progress=${nextCount}/${THESEUS_RECORD_UNLOCK_THRESHOLD}）`);
}

export async function handleJobSessionActions(ctx) {
  const {
    id,
    plan,
    gameState,
    addEffect,
    addSysCall,
    addNote,
    Effects,
    SYSCALL_TYPES
  } = ctx;

  const actionId = String(id || "").trim();
  const activeSession = normalizeJobSession(gameState?.ui?.jobSession);
  const currentMapId = String(gameState?.currentMapId || gameState?.world?.currentMapId || "").trim();
  const sourceJobDefinition = getJobDefinitionBySourceActionId(actionId, currentMapId);

  if (sourceJobDefinition) {
    const activeInquirySession = normalizeInquirySession(gameState?.ui?.inquirySession);
    if (activeInquirySession && activeInquirySession.status === INQUIRY_SESSION_STATUS.ACTIVE) {
      reject(plan, "job_session", "INQUIRY_SESSION_BUSY", activeInquirySession.inquiryId || "active");
      addNote(plan, "JobSession：询问会话进行中，拒绝开启短工会话");
      return true;
    }

    const activeStatus = String(activeSession?.status || "").trim();
    if (activeSession && isBlockingSessionStatus(activeStatus)) {
      // A BRIEFING session left from a different map is a navigation artifact—the user
      // moved away before accepting or cancelling.  Allow the new source action on the
      // current map to supersede it instead of blocking with JOB_SESSION_BUSY.
      const sessionSourceMapId = String(activeSession.sourceMapId || "").trim();
      const isStaleFromOtherMap = activeStatus === JOB_SESSION_STATUS.BRIEFING
        && sessionSourceMapId
        && sessionSourceMapId !== currentMapId;
      if (!isStaleFromOtherMap) {
        reject(plan, "job_session", "JOB_SESSION_BUSY", activeStatus);
        addNote(plan, `JobSession：已有进行中会话，拒绝新建（status=${activeStatus}）`);
        return true;
      }
      addNote(plan, `JobSession：检测到跨地图遗留 briefing（stale=${activeSession.jobId} on ${sessionSourceMapId}），将被新会话取代`);
    }

    const availability = resolveJobAvailability(gameState, sourceJobDefinition.availabilityPolicyKey);
    if (!availability.available) {
      reject(plan, "job_session", "JOB_UNAVAILABLE", String(availability.status || "unknown"));
      addNote(plan, `JobSession：${sourceJobDefinition.jobId} 当前不可受理（${availability.status}）`);
      return true;
    }

    const nextSession = beginJobSession(sourceJobDefinition, gameState);
    addEffect(plan, Effects.set("ui.jobSession", nextSession));
    addEffect(plan, Effects.set("ui.workFeedback", null));
    applyGameplayPrecheck(plan, gameState, addNote);
    addNote(plan, `JobSession：开始 brief（job=${sourceJobDefinition.jobId}）`);
    return true;
  }

  if (!isJobSessionUiAction(actionId)) {
    return false;
  }

  if (!activeSession) {
    reject(plan, "job_session", "JOB_SESSION_MISSING", actionId);
    addNote(plan, `JobSession：找不到活跃会话（action=${actionId}）`);
    return true;
  }

  const jobDefinition = getJobDefinitionById(activeSession.jobId);
  if (!jobDefinition) {
    reject(plan, "job_session", "JOB_DEFINITION_MISSING", activeSession.jobId);
    addNote(plan, `JobSession：缺少定义（job=${activeSession.jobId}）`);
    return true;
  }

  if (actionId === JOB_SESSION_ACTION.CANCEL) {
    addEffect(plan, Effects.set("ui.jobSession", null));
    addEffect(plan, Effects.set("ui.workFeedback", null));
    addNote(plan, `JobSession：取消（job=${activeSession.jobId}）`);
    return true;
  }

  if (actionId === JOB_SESSION_ACTION.ASK_DETAIL || actionId === JOB_SESSION_ACTION.ASK_PAY) {
    if (activeSession.status !== JOB_SESSION_STATUS.BRIEFING) {
      reject(plan, "job_session", "JOB_SESSION_BAD_STATE", `${actionId}:${activeSession.status}`);
      addNote(plan, `JobSession：${actionId} 仅允许在 briefing 阶段`);
      return true;
    }

    const replyType = actionId === JOB_SESSION_ACTION.ASK_DETAIL ? "detail" : "pay";
    addEffect(plan, Effects.set("ui.jobSession", withBriefingReply(activeSession, replyType)));
    addNote(plan, `JobSession：briefing 回复 ${replyType}`);
    return true;
  }

  if (actionId === JOB_SESSION_ACTION.ACCEPT) {
    if (activeSession.status !== JOB_SESSION_STATUS.BRIEFING) {
      reject(plan, "job_session", "JOB_SESSION_BAD_STATE", `${actionId}:${activeSession.status}`);
      addNote(plan, "JobSession：接受动作不在 briefing 阶段");
      return true;
    }

    const execution = buildExecutionTransition(jobDefinition, activeSession, gameState);
    if (execution.advanceTimeMinutes > 0) {
      addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
        minutes: execution.advanceTimeMinutes,
        reason: "job_session:execution",
        ctx: execution.advanceCtx
      });
    }

    addEffect(plan, Effects.set("ui.jobSession", execution.nextSession));
    addEffect(plan, Effects.set("ui.workFeedback", null));
    applyGameplayPrecheck(plan, gameState, addNote);
    addNote(plan, `JobSession：执行完成，等待回窗结算（job=${activeSession.jobId}）`);
    return true;
  }

  if (actionId === JOB_SESSION_ACTION.CONTINUE_SETTLEMENT) {
    if (activeSession.status !== JOB_SESSION_STATUS.EXECUTING && activeSession.status !== JOB_SESSION_STATUS.ACCEPTED) {
      reject(plan, "job_session", "JOB_SESSION_BAD_STATE", `${actionId}:${activeSession.status}`);
      addNote(plan, "JobSession：继续结算动作状态不匹配");
      return true;
    }

    const existingRewards = Array.isArray(activeSession.settlementRewards) ? activeSession.settlementRewards : null;
    const settlementRewards = existingRewards !== null ? existingRewards : buildJobBonusRewardItems(jobDefinition);
    const rewardMoney = resolveJobRewardMoney(jobDefinition, gameState, activeSession?.resultSnapshot?.rewardMoney);
    const settlementSession = buildSettlementTransition({
      ...activeSession,
      resultSnapshot: {
        ...(activeSession?.resultSnapshot || {}),
        rewardMoney
      }
    }, settlementRewards.length > 0 ? settlementRewards : null);
    addEffect(plan, Effects.set("ui.jobSession", settlementSession));
    addEffect(plan, Effects.set("ui.workFeedback", null));
    applyGameplayPrecheck(plan, gameState, addNote);
    addNote(plan, `JobSession：进入结算阶段（job=${activeSession.jobId}）`);
    return true;
  }

  if (actionId === JOB_SESSION_ACTION.CONFIRM_SETTLEMENT) {
    if (activeSession.status !== JOB_SESSION_STATUS.SETTLEMENT) {
      reject(plan, "job_session", "JOB_SESSION_BAD_STATE", `${actionId}:${activeSession.status}`);
      addNote(plan, "JobSession：确认交单动作状态不匹配");
      return true;
    }

    const outcomeEffects = buildJobOutcomeEffects(jobDefinition, activeSession, gameState);
    for (const effect of outcomeEffects) {
      addEffect(plan, effect);
    }

    const settlementRewards = Array.isArray(activeSession.settlementRewards) ? activeSession.settlementRewards : [];
    for (const reward of settlementRewards) {
      if (reward.granted && reward.kind === "experience" && reward.amount > 0) {
        if (!Array.isArray(plan.profileIntents)) plan.profileIntents = [];
        plan.profileIntents.push({ type: "xp", key: "experience", amount: reward.amount, reason: "job_bonus_reward" });
        addNote(plan, `JobSession：bonus 阅历 +${reward.amount}（job=${activeSession.jobId}）`);
      }
    }

    if (String(jobDefinition?.jobId || "").trim() === THESEUS_JOB_ID) {
      if (!Array.isArray(plan.profileIntents)) plan.profileIntents = [];
      plan.profileIntents.push({
        type: "xp",
        key: "physique",
        amount: THESEUS_PHYSIQUE_REWARD,
        reason: "theseus_luggage_shift_completion"
      });
      addNote(plan, `JobSession：Theseus 结算体格 +${THESEUS_PHYSIQUE_REWARD}（job=${activeSession.jobId}）`);
    }

    maybeProgressManifestRecordUnlock(plan, jobDefinition, activeSession, gameState, addEffect, addNote, Effects);
    maybeProgressTheseusRecordUnlock(plan, jobDefinition, activeSession, gameState, addEffect, addNote, Effects);

    const completion = {
      ...activeSession,
      status: JOB_SESSION_STATUS.COMPLETED,
      settlementApplied: true,
      resultSnapshot: buildCompletionSnapshot(jobDefinition, activeSession, gameState)
    };

    addEffect(plan, Effects.set("player.meta.lastJobSessionResult", completion.resultSnapshot));
    addEffect(plan, Effects.set("ui.jobSession", null));
    addEffect(plan, Effects.set("ui.workFeedback", null));
    applyGameplayPrecheck(plan, gameState, addNote);
    addNote(plan, `JobSession：结算完成并入账（job=${activeSession.jobId}）`);
    return true;
  }

  reject(plan, "job_session", "JOB_SESSION_UNKNOWN_ACTION", actionId);
  addNote(plan, `JobSession：未处理动作 ${actionId}`);
  return true;
}
