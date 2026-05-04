import { escapeHtml } from "./text_escape.js";
import { JOB_SESSION_ACTION, JOB_SESSION_STATUS, normalizeJobSession } from "../jobs/job_session.js";

function renderActionButton(actionId, text, kind = "") {
  const kindClass = kind ? ` is-${escapeHtml(kind)}` : "";
  return `<button type="button" class="job-session-action${kindClass}" data-action-id="${escapeHtml(actionId)}">${escapeHtml(text)}</button>`;
}

function buildBriefingContent(jobDefinition, session) {
  const briefPack = session.isFirstRun
    ? jobDefinition?.textPack?.briefing?.firstRun
    : jobDefinition?.textPack?.briefing?.repeatRun;

  const mainText = String(briefPack?.main || "").trim();
  const replyType = String(session.briefingReplyType || "").trim();
  const detailReply = String(jobDefinition?.textPack?.briefing?.firstRun?.detailReply || "").trim();
  const payReply = String(jobDefinition?.textPack?.briefing?.firstRun?.payReply || "").trim();

  let replyText = "";
  if (replyType === "detail") replyText = detailReply;
  if (replyType === "pay") replyText = payReply;

  const options = Array.isArray(briefPack?.options) ? briefPack.options : [];
  const optionButtons = options.map((row) => {
    const id = String(row?.id || "").trim();
    const label = String(row?.label || "").trim();
    if (!id || !label) return "";
    if (id === "accept") return renderActionButton(JOB_SESSION_ACTION.ACCEPT, label, "primary");
    if (id === "detail") return renderActionButton(JOB_SESSION_ACTION.ASK_DETAIL, label);
    if (id === "pay") return renderActionButton(JOB_SESSION_ACTION.ASK_PAY, label);
    if (id === "cancel") return renderActionButton(JOB_SESSION_ACTION.CANCEL, label, "ghost");
    return "";
  }).filter(Boolean).join("");

  return `
    <div class="job-session-paragraph">${escapeHtml(mainText).replace(/\n/g, "<br>")}</div>
    ${replyText ? `<div class="job-session-reply">${escapeHtml(replyText)}</div>` : ""}
    <div class="job-session-actions">${optionButtons}</div>
  `.trim();
}

function buildExecutingContent(jobDefinition) {
  const closingLine = String(jobDefinition?.textPack?.execution?.closingLine || "").trim();
  return `
    <div class="job-session-paragraph">${escapeHtml(closingLine || "你完成了这一轮工作，准备回窗口交单。")}</div>
    <div class="job-session-actions">${renderActionButton(JOB_SESSION_ACTION.CONTINUE_SETTLEMENT, "回窗口交单", "primary")}</div>
  `.trim();
}

function buildSettlementContent(jobDefinition, session) {
  const settlementText = session.isFirstRun
    ? String(jobDefinition?.textPack?.settlement?.firstRun || "").trim()
    : String(jobDefinition?.textPack?.settlement?.repeatRun || "").trim();
  const rewardLine = String(jobDefinition?.textPack?.execution?.rewardLine || "").trim();

  return `
    <div class="job-session-paragraph">${escapeHtml(settlementText).replace(/\n/g, "<br>")}</div>
    ${rewardLine ? `<div class="job-session-reward">${escapeHtml(rewardLine)}</div>` : ""}
    <div class="job-session-actions">${renderActionButton(JOB_SESSION_ACTION.CONFIRM_SETTLEMENT, "确认交单", "primary")}</div>
  `.trim();
}

export function buildJobSessionInlineHtml(sessionInput, jobDefinition) {
  const session = normalizeJobSession(sessionInput);
  if (!session || !jobDefinition) return "";

  let bodyHtml = "";
  let kicker = "工作会话";

  if (session.status === JOB_SESSION_STATUS.BRIEFING) {
    kicker = "接活对话";
    bodyHtml = buildBriefingContent(jobDefinition, session);
  } else if (session.status === JOB_SESSION_STATUS.EXECUTING || session.status === JOB_SESSION_STATUS.ACCEPTED) {
    kicker = "执行段";
    bodyHtml = buildExecutingContent(jobDefinition);
  } else if (session.status === JOB_SESSION_STATUS.SETTLEMENT) {
    kicker = "回窗结算";
    bodyHtml = buildSettlementContent(jobDefinition, session);
  } else {
    return "";
  }

  return `
    <section class="job-session-card" data-job-session-id="${escapeHtml(session.sessionId)}">
      <header class="job-session-head">
        <span class="job-session-kicker">${escapeHtml(kicker)}</span>
        <span class="job-session-title">${escapeHtml(String(jobDefinition.displayName || "短工会话"))}</span>
      </header>
      <div class="job-session-body">${bodyHtml}</div>
    </section>
  `.trim();
}
