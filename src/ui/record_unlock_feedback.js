import { registerTransientPresenter } from "./transient/transient_runtime.js";
import { TRANSIENT_TIMING_PRESETS } from "./transient/transient_contract.js";
import { ensureRecordsEntryEmphasisRegistration } from "./transient/sidebar_records_entry_emphasis.js";

export const RECORD_UNLOCK_TRANSIENT_TYPE = "record_unlock";
export const DEFAULT_RECORD_UNLOCK_TRANSIENT_TIMING = TRANSIENT_TIMING_PRESETS.RECORD_UNLOCK_CARD;

let didRegisterRecordUnlockFeedback = false;

function getDocumentRoot() {
  return typeof document !== "undefined" ? document : null;
}

function normalizeRecordUnlockPayload(payload = {}) {
  const expAmount = Math.max(0, Math.trunc(Number(payload?.expAmount || 0)));
  return {
    recordId: String(payload?.recordId || "").trim(),
    expAmount,
    title: String(payload?.title || `阅历＋${expAmount}`).trim() || `阅历＋${expAmount}`,
    subtitle: String(payload?.subtitle || "新纪录已解锁！").trim() || "新纪录已解锁！"
  };
}

function renderRecordUnlockPresenter({ payload, itemRoot, documentRoot }) {
  const doc = documentRoot || getDocumentRoot();
  if (!doc || !itemRoot) return null;

  const presenterPayload = normalizeRecordUnlockPayload(payload);
  itemRoot.classList.add("record-unlock-transient");

  const frame = doc.createElement("div");
  frame.className = "record-unlock-transient-frame";

  const expLine = doc.createElement("div");
  expLine.className = "record-unlock-transient-exp";
  expLine.textContent = presenterPayload.title;

  const subtitle = doc.createElement("div");
  subtitle.className = "record-unlock-transient-subtitle";
  subtitle.textContent = presenterPayload.subtitle;

  frame.appendChild(expLine);
  frame.appendChild(subtitle);
  itemRoot.appendChild(frame);

  return {
    signalTarget: frame
  };
}

export function ensureRecordUnlockFeedbackRegistration() {
  if (didRegisterRecordUnlockFeedback) return true;

  registerTransientPresenter(RECORD_UNLOCK_TRANSIENT_TYPE, {
    render: renderRecordUnlockPresenter
  });

  didRegisterRecordUnlockFeedback = true;
  return true;
}
