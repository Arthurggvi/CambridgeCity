export const JOB_SESSION_STATUS = Object.freeze({
  BRIEFING: "briefing",
  ACCEPTED: "accepted",
  EXECUTING: "executing",
  SETTLEMENT: "settlement",
  COMPLETED: "completed"
});

export const JOB_SESSION_ACTION = Object.freeze({
  ACCEPT: "job_session_accept",
  ASK_DETAIL: "job_session_ask_detail",
  ASK_PAY: "job_session_ask_pay",
  CANCEL: "job_session_cancel",
  CONTINUE_SETTLEMENT: "job_session_continue_settlement",
  CONFIRM_SETTLEMENT: "job_session_confirm_settlement"
});

function readRunCount(gameState, jobId) {
  const value = Number(gameState?.player?.meta?.jobRuns?.[jobId] ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function createJobSession(jobDefinition, gameState) {
  const jobId = String(jobDefinition?.jobId || "").trim();
  const runCount = readRunCount(gameState, jobId);
  const nowMinutes = Number(gameState?.time?.totalMinutes ?? 0);
  const mapId = String(gameState?.currentMapId || gameState?.world?.currentMapId || "").trim();

  return {
    sessionId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    jobId,
    sourceMapId: String(jobDefinition?.sourceMapId || mapId),
    sourceActionId: String(jobDefinition?.sourceActionId || ""),
    status: JOB_SESSION_STATUS.BRIEFING,
    isFirstRun: runCount === 0,
    startedAt: {
      totalMinutes: Number.isFinite(nowMinutes) ? Math.floor(nowMinutes) : 0,
      mapId
    },
    accepted: false,
    executionCompleted: false,
    settlementApplied: false,
    briefingReplyType: null,
    resultSnapshot: null
  };
}

export function isJobSessionUiAction(actionId) {
  const id = String(actionId || "").trim();
  return Object.values(JOB_SESSION_ACTION).includes(id);
}

export function normalizeJobSession(session) {
  if (!session || typeof session !== "object") return null;
  const status = String(session.status || "").trim();
  if (!Object.values(JOB_SESSION_STATUS).includes(status)) return null;

  return {
    sessionId: String(session.sessionId || "").trim(),
    jobId: String(session.jobId || "").trim(),
    sourceMapId: String(session.sourceMapId || "").trim(),
    sourceActionId: String(session.sourceActionId || "").trim(),
    status,
    isFirstRun: !!session.isFirstRun,
    startedAt: session.startedAt && typeof session.startedAt === "object"
      ? {
        totalMinutes: Number(session.startedAt.totalMinutes || 0),
        mapId: String(session.startedAt.mapId || "").trim()
      }
      : { totalMinutes: 0, mapId: "" },
    accepted: !!session.accepted,
    executionCompleted: !!session.executionCompleted,
    settlementApplied: !!session.settlementApplied,
    briefingReplyType: session.briefingReplyType ? String(session.briefingReplyType) : null,
    resultSnapshot: session.resultSnapshot && typeof session.resultSnapshot === "object"
      ? session.resultSnapshot
      : null,
    settlementRewards: Array.isArray(session.settlementRewards) ? session.settlementRewards : []
  };
}
