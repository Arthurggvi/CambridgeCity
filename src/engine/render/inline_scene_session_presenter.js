import { escapeHtml } from "./text_escape.js";
import { JOB_SESSION_ACTION, JOB_SESSION_STATUS, normalizeJobSession } from "../jobs/job_session.js";
import { INQUIRY_SESSION_ACTION, normalizeInquirySession } from "../inquiry/inquiry_session.js";
import {
  getJobBriefingContent,
  getJobExecutionContent,
  getJobRewardSummaryText,
  getJobSettlementContent
} from "../jobs/job_definitions.js";

function renderActionButton(actionId, text, kind = "", index = 0) {
  const kindClass = kind ? ` is-${escapeHtml(kind)}` : "";
  return `<button type="button" class="inline-scene-session-action${kindClass}" style="--session-opt-idx:${Math.max(0, Number(index) || 0)}" data-action-id="${escapeHtml(actionId)}">${escapeHtml(text)}</button>`;
}

function renderParagraph(text, className = "") {
  const c = className ? ` ${className}` : "";
  return `<p class="inline-scene-session-paragraph${c}">${escapeHtml(String(text || "")).replace(/\n/g, "<br>")}</p>`;
}

function buildJobBriefing(definition, session) {
  const briefing = getJobBriefingContent(definition, session.isFirstRun !== false);
  const replyType = String(session.briefingReplyType || "").trim();
  const detailReply = String(briefing?.detail?.replyText || "").trim();
  const payReply = String(briefing?.pay?.replyText || "").trim();
  const replyText = replyType === "detail" ? detailReply : (replyType === "pay" ? payReply : "");
  const showDetail = !!briefing?.detail?.buttonText && (session.isFirstRun !== false || briefing?.detail?.showOnRepeat === true);
  const showPay = !!briefing?.pay?.buttonText && (session.isFirstRun !== false || briefing?.pay?.showOnRepeat === true);
  const actions = [
    { actionId: JOB_SESSION_ACTION.ACCEPT, text: String(briefing?.acceptText || "").trim(), kind: "primary" },
    showDetail ? { actionId: JOB_SESSION_ACTION.ASK_DETAIL, text: String(briefing?.detail?.buttonText || "").trim(), kind: "" } : null,
    showPay ? { actionId: JOB_SESSION_ACTION.ASK_PAY, text: String(briefing?.pay?.buttonText || "").trim(), kind: "" } : null,
    { actionId: JOB_SESSION_ACTION.CANCEL, text: String(briefing?.cancelText || "").trim(), kind: "ghost" }
  ].filter((row) => row && row.text);
  const actionHtml = actions.map((row, index) => renderActionButton(row.actionId, row.text, row.kind, index)).join("");

  return {
    kicker: String(briefing?.leadLabel || "工头交代").trim() || "工头交代",
    phaseLabel: "briefing",
    contentHtml: `
      ${renderParagraph(String(briefing?.body || "").trim())}
      ${replyText ? `<div class="inline-scene-session-reply">${escapeHtml(replyText)}</div>` : ""}
      <div class="inline-scene-session-actions">${actionHtml}</div>
    `.trim()
  };
}

function buildJobExecuting(definition) {
  const executing = getJobExecutionContent(definition);
  const bodyLines = Array.isArray(executing?.body) ? executing.body : [];

  const paragraphHtml = [
    ...bodyLines.map((line, index) => renderParagraph(line, index === 0 ? "is-intro" : (index === bodyLines.length - 1 ? "is-closing" : "")))
  ].filter(Boolean).join("");

  return {
    kicker: String(executing?.leadLabel || "执行段").trim() || "执行段",
    phaseLabel: "execution",
    contentHtml: `
      <div class="inline-scene-session-content">${paragraphHtml}</div>
      <div class="inline-scene-session-actions">
        ${renderActionButton(JOB_SESSION_ACTION.CONTINUE_SETTLEMENT, String(definition?.settlementActionText || "回窗口交单").trim() || "回窗口交单", "primary", 0)}
      </div>
    `.trim()
  };
}

function buildJobSettlement(definition, session) {
  const settlement = getJobSettlementContent(definition, session.isFirstRun !== false);
  const settlementText = String(settlement?.body || "").trim();
  const rewardLine = getJobRewardSummaryText({
    ...definition,
    resolvedRewardMoney: session?.resultSnapshot?.rewardMoney
  });

  const grantedBonuses = (Array.isArray(session.settlementRewards) ? session.settlementRewards : [])
    .filter((r) => r.granted);
  const bonusHtml = grantedBonuses.map((r) => {
    if (r.kind === "experience") {
      return `<div class="inline-scene-session-bonus-reward">+${Number(r.amount)} 阅历</div>`;
    }
    return "";
  }).filter(Boolean).join("");

  return {
    kicker: String(settlement?.leadLabel || "回窗结算").trim() || "回窗结算",
    phaseLabel: "settlement",
    contentHtml: `
      ${renderParagraph(settlementText)}
      ${rewardLine ? `<div class="inline-scene-session-reward">${escapeHtml(rewardLine)}</div>` : ""}
      ${bonusHtml}
      <div class="inline-scene-session-actions">
        ${renderActionButton(JOB_SESSION_ACTION.CONFIRM_SETTLEMENT, String(settlement?.confirmText || "确认交单").trim() || "确认交单", "primary is-reward", 0)}
      </div>
    `.trim()
  };
}

function buildInquiryContent(definition, session) {
  const pack = session.isFirstRun ? definition?.textPack?.firstRun : definition?.textPack?.repeatRun;
  const mainText = String(pack?.main || "").trim();
  const replyText = String(pack?.replyMap?.[String(session.replyKey || "").trim()] || "").trim();

  const options = Array.isArray(pack?.options) ? pack.options : [];
  const actionHtml = options.map((row, index) => {
    const id = String(row?.id || "").trim();
    const label = String(row?.label || "").trim();
    if (!id || !label) return "";
    if (id === "ask_more") return renderActionButton(INQUIRY_SESSION_ACTION.ASK_MORE, label, "", index);
    if (id === "cancel") return renderActionButton(INQUIRY_SESSION_ACTION.CANCEL, label, "ghost", index);
    return renderActionButton(INQUIRY_SESSION_ACTION.ACK, label, "primary", index);
  }).filter(Boolean).join("");

  return {
    kicker: "询问",
    phaseLabel: session.replyKey ? "reply" : "brief",
    contentHtml: `
      ${renderParagraph(mainText)}
      ${replyText ? `<div class="inline-scene-session-reply is-inquiry">${escapeHtml(replyText)}</div>` : ""}
      <div class="inline-scene-session-actions">${actionHtml}</div>
    `.trim()
  };
}

export function buildInlineSceneSessionHtml(input, options = {}) {
  const kind = String(input?.kind || "").trim();
  const definition = input?.definition || null;
  const animateMode = String(options.animateMode || "static").trim();

  if (!definition) return "";

  let normalized = null;
  let title = "";
  let tone = "";
  let section = null;

  if (kind === "job") {
    normalized = normalizeJobSession(input.session);
    if (!normalized) return "";
    title = String(definition.displayName || "短工会话");
    tone = String(definition.presentationTone || "session_job").trim() || "session_job";
    if (normalized.status === JOB_SESSION_STATUS.BRIEFING) section = buildJobBriefing(definition, normalized);
    if (normalized.status === JOB_SESSION_STATUS.ACCEPTED || normalized.status === JOB_SESSION_STATUS.EXECUTING) {
      section = buildJobExecuting(definition, normalized);
    }
    if (normalized.status === JOB_SESSION_STATUS.SETTLEMENT) section = buildJobSettlement(definition, normalized);
  }

  if (kind === "inquiry") {
    normalized = normalizeInquirySession(input.session);
    if (!normalized) return "";
    title = String(definition.displayName || "询问");
    tone = String(definition.presentationTone || "session_inquiry").trim() || "session_inquiry";
    section = buildInquiryContent(definition, normalized);
  }

  if (!normalized || !section) return "";

  const modeClass = animateMode ? ` is-${escapeHtml(animateMode)}` : "";
  const phaseClass = section.phaseLabel ? ` phase-${escapeHtml(section.phaseLabel)}` : "";

  return `
    <section class="inline-scene-session tone-${escapeHtml(tone)}${modeClass}${phaseClass}" data-session-kind="${escapeHtml(kind)}" data-session-id="${escapeHtml(normalized.sessionId)}" data-session-phase="${escapeHtml(section.phaseLabel || "")}">
      <header class="inline-scene-session-head">
        <span class="inline-scene-session-kicker">${escapeHtml(section.kicker || "会话")}</span>
        <span class="inline-scene-session-title">${escapeHtml(title)}</span>
      </header>
      <div class="inline-scene-session-body">${section.contentHtml}</div>
    </section>
  `.trim();
}
