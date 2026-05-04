import { TRANSIENT_TIMING_PRESETS } from "./transient/transient_contract.js";
import { ensureDossierEntryEmphasisRegistration } from "./transient/sidebar_dossier_entry_emphasis.js";
import { registerTransientPresenter } from "./transient/transient_runtime.js";

export const DOSSIER_ATTENTION_TRANSIENT_TYPE = "dossier_attention_guide";
export const DOSSIER_ATTENTION_FEEDBACK_TIMING = TRANSIENT_TIMING_PRESETS.DOSSIER_ATTENTION_CARD;

let didRegisterDossierAttentionFeedback = false;

function getDocumentRoot() {
  return typeof document !== "undefined" ? document : null;
}

function normalizeDossierAttentionPayload(payload = {}) {
  const title = String(payload?.title || "查看档案").trim() || "查看档案";
  const body = String(payload?.body || "点击“档案”查看角色的属性信息。").trim() || "点击“档案”查看角色的属性信息。";
  return {
    title,
    body
  };
}

function renderDossierAttentionPresenter({ payload, itemRoot, documentRoot }) {
  const doc = documentRoot || getDocumentRoot();
  if (!doc || !itemRoot) return null;

  const presenterPayload = normalizeDossierAttentionPayload(payload);
  itemRoot.classList.add("dossier-attention-transient");

  const frame = doc.createElement("article");
  frame.className = "dossier-attention-transient-frame";

  const eyebrow = doc.createElement("div");
  eyebrow.className = "dossier-attention-transient-eyebrow";
  eyebrow.textContent = "引导";

  const title = doc.createElement("h3");
  title.className = "dossier-attention-transient-title";
  title.textContent = presenterPayload.title;

  const body = doc.createElement("p");
  body.className = "dossier-attention-transient-body";
  body.textContent = presenterPayload.body;

  frame.appendChild(eyebrow);
  frame.appendChild(title);
  frame.appendChild(body);
  itemRoot.appendChild(frame);

  return {
    signalTarget: frame
  };
}

export function ensureDossierAttentionFeedbackRegistration() {
  if (didRegisterDossierAttentionFeedback) return true;

  registerTransientPresenter(DOSSIER_ATTENTION_TRANSIENT_TYPE, {
    render: renderDossierAttentionPresenter
  });

  ensureDossierEntryEmphasisRegistration();

  didRegisterDossierAttentionFeedback = true;
  return true;
}