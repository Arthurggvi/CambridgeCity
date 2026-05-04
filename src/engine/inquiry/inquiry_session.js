export const INQUIRY_SESSION_STATUS = Object.freeze({
  ACTIVE: "active",
  COMPLETED: "completed"
});

export const INQUIRY_SESSION_ACTION = Object.freeze({
  ACK: "inquiry_session_ack",
  ASK_MORE: "inquiry_session_ask_more",
  CANCEL: "inquiry_session_cancel"
});

function readRunCount(gameState, inquiryId) {
  const value = Number(gameState?.player?.meta?.inquiryRuns?.[inquiryId] ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function createInquirySession(inquiryDefinition, gameState) {
  const inquiryId = String(inquiryDefinition?.inquiryId || "").trim();
  const runCount = readRunCount(gameState, inquiryId);
  const nowMinutes = Number(gameState?.time?.totalMinutes ?? 0);
  const mapId = String(gameState?.currentMapId || gameState?.world?.currentMapId || "").trim();

  return {
    sessionId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    inquiryId,
    sourceMapId: String(inquiryDefinition?.sourceMapId || mapId),
    sourceActionId: String(inquiryDefinition?.sourceActionId || ""),
    status: INQUIRY_SESSION_STATUS.ACTIVE,
    isFirstRun: runCount === 0,
    startedAt: {
      totalMinutes: Number.isFinite(nowMinutes) ? Math.floor(nowMinutes) : 0,
      mapId
    },
    replyKey: null,
    completionReason: null
  };
}

export function isInquirySessionUiAction(actionId) {
  const id = String(actionId || "").trim();
  return Object.values(INQUIRY_SESSION_ACTION).includes(id);
}

export function normalizeInquirySession(session) {
  if (!session || typeof session !== "object") return null;
  const status = String(session.status || "").trim();
  if (!Object.values(INQUIRY_SESSION_STATUS).includes(status)) return null;

  return {
    sessionId: String(session.sessionId || "").trim(),
    inquiryId: String(session.inquiryId || "").trim(),
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
    replyKey: session.replyKey ? String(session.replyKey).trim() : null,
    completionReason: session.completionReason ? String(session.completionReason).trim() : null
  };
}
