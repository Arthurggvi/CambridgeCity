import { escapeHtml } from "./text_escape.js";
import { normalizeWorkPresentationPayload } from "../work_feedback_template.js";

function createSegmentHtml(text, role, index, animate) {
  const safe = escapeHtml(String(text || ""));
  if (!safe) return "";
  const delayMs = animate ? 90 + index * 150 : 0;
  return `<p class="inline-work-feedback-segment inline-work-feedback-segment-${role}${animate ? " is-enter" : ""}" style="--wf-delay:${delayMs}ms;">${safe}</p>`;
}

export function buildInlineWorkFeedbackHtml(payload, options = {}) {
  const normalized = normalizeWorkPresentationPayload(payload);
  if (!normalized) return "";

  const animate = options?.animate === true;
  const segments = [];

  if (normalized.openingLine) {
    segments.push({ role: "opening", text: normalized.openingLine });
  }
  for (const line of normalized.bodyLines) {
    segments.push({ role: "body", text: line });
  }
  if (normalized.closingLine) {
    segments.push({ role: "closing", text: normalized.closingLine });
  }

  const segmentHtml = segments
    .map((segment, index) => createSegmentHtml(segment.text, segment.role, index, animate))
    .filter(Boolean)
    .join("\n");

  const rewardLine = String(normalized.rewardLine || "").trim();
  const rewardHtml = rewardLine
    ? `<div class="inline-work-feedback-settlement${animate ? " is-enter" : ""}" style="--wf-delay:${90 + segments.length * 150}ms;">${escapeHtml(rewardLine)}</div>`
    : "";

  const toneClass = `tone-${escapeHtml(String(normalized.tone || "neutral"))}`;
  return `
    <section class="inline-work-feedback ${toneClass}${animate ? " is-enter" : ""}" data-work-feedback-token="${escapeHtml(String(normalized.token || ""))}">
      <header class="inline-work-feedback-head">
        <span class="inline-work-feedback-kicker">工作回执</span>
        <span class="inline-work-feedback-title">${escapeHtml(String(normalized.title || "工作结算"))}</span>
      </header>
      <div class="inline-work-feedback-body">
        ${segmentHtml}
        ${rewardHtml}
      </div>
    </section>
  `.trim();
}
