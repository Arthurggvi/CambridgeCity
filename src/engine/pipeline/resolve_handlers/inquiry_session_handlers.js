import { getInquiryDefinitionById, getInquiryDefinitionBySourceActionId } from "../../inquiry/inquiry_definitions.js";
import {
  INQUIRY_SESSION_ACTION,
  INQUIRY_SESSION_STATUS,
  isInquirySessionUiAction,
  normalizeInquirySession
} from "../../inquiry/inquiry_session.js";
import { beginInquirySession, completeInquirySession, withInquiryReply } from "../../inquiry/inquiry_session_runner.js";
import { normalizeJobSession } from "../../jobs/job_session.js";

function reject(plan, source, code, reason) {
  plan.rejection = {
    source,
    code,
    reason
  };
}

function hasBlockingSession(gameState) {
  const inquirySession = normalizeInquirySession(gameState?.ui?.inquirySession);
  if (inquirySession && inquirySession.status === INQUIRY_SESSION_STATUS.ACTIVE) return true;
  const jobSession = normalizeJobSession(gameState?.ui?.jobSession);
  return !!jobSession;
}

export async function handleInquirySessionActions(ctx) {
  const {
    id,
    plan,
    gameState,
    addEffect,
    addNote,
    Effects
  } = ctx;

  const actionId = String(id || "").trim();
  const inquiryDefinitionBySource = getInquiryDefinitionBySourceActionId(actionId);

  if (inquiryDefinitionBySource) {
    if (hasBlockingSession(gameState)) {
      reject(plan, "inquiry_session", "SESSION_BUSY", actionId);
      addNote(plan, `InquirySession：会话忙，拒绝开启（action=${actionId}）`);
      return true;
    }

    const nextSession = beginInquirySession(inquiryDefinitionBySource, gameState);
    addEffect(plan, Effects.set("ui.inquirySession", nextSession));
    addEffect(plan, Effects.set("ui.workFeedback", null));
    addNote(plan, `InquirySession：开启（inquiry=${inquiryDefinitionBySource.inquiryId}）`);
    return true;
  }

  if (!isInquirySessionUiAction(actionId)) {
    return false;
  }

  const activeSession = normalizeInquirySession(gameState?.ui?.inquirySession);
  if (!activeSession || activeSession.status !== INQUIRY_SESSION_STATUS.ACTIVE) {
    reject(plan, "inquiry_session", "SESSION_MISSING", actionId);
    addNote(plan, `InquirySession：缺少活跃会话（action=${actionId}）`);
    return true;
  }

  const definition = getInquiryDefinitionById(activeSession.inquiryId);
  if (!definition) {
    reject(plan, "inquiry_session", "DEFINITION_MISSING", activeSession.inquiryId);
    addNote(plan, `InquirySession：缺少定义（id=${activeSession.inquiryId}）`);
    return true;
  }

  if (actionId === INQUIRY_SESSION_ACTION.ASK_MORE) {
    addEffect(plan, Effects.set("ui.inquirySession", withInquiryReply(activeSession, "ask_more")));
    addNote(plan, `InquirySession：回复 ask_more（inquiry=${activeSession.inquiryId}）`);
    return true;
  }

  if (actionId === INQUIRY_SESSION_ACTION.ACK || actionId === INQUIRY_SESSION_ACTION.CANCEL) {
    const completed = completeInquirySession(activeSession, actionId === INQUIRY_SESSION_ACTION.CANCEL ? "cancel" : "ack");
    const runCountBefore = Number(gameState?.player?.meta?.inquiryRuns?.[activeSession.inquiryId] || 0);
    const nextRunCount = Number.isFinite(runCountBefore) && runCountBefore > 0
      ? Math.floor(runCountBefore) + 1
      : 1;

    addEffect(plan, Effects.set(`player.meta.inquiryRuns.${activeSession.inquiryId}`, nextRunCount));
    addEffect(plan, Effects.set("player.meta.lastInquirySessionResult", {
      sessionId: String(completed.sessionId || ""),
      inquiryId: String(completed.inquiryId || ""),
      completionReason: String(completed.completionReason || "ack"),
      totalMinutes: Math.max(0, Math.floor(Number(gameState?.time?.totalMinutes || 0)))
    }));
    addEffect(plan, Effects.set("ui.inquirySession", null));
    addEffect(plan, Effects.set("ui.workFeedback", null));
    addNote(plan, `InquirySession：结束（inquiry=${activeSession.inquiryId}, reason=${completed.completionReason})`);
    return true;
  }

  reject(plan, "inquiry_session", "UNKNOWN_ACTION", actionId);
  addNote(plan, `InquirySession：未知动作 ${actionId}`);
  return true;
}
