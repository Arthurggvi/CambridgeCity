import { INQUIRY_SESSION_STATUS, createInquirySession } from "./inquiry_session.js";

export function beginInquirySession(inquiryDefinition, gameState) {
  return createInquirySession(inquiryDefinition, gameState);
}

export function withInquiryReply(session, replyKey) {
  return {
    ...session,
    replyKey: String(replyKey || "").trim() || null
  };
}

export function completeInquirySession(session, reason = "ack") {
  return {
    ...session,
    status: INQUIRY_SESSION_STATUS.COMPLETED,
    completionReason: String(reason || "ack").trim() || "ack"
  };
}
