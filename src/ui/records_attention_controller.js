const RECORDS_BUTTON_SELECTOR = '[data-action-id="ui_records_open"].sidebar-tool-btn-record';
const RECORDS_ATTENTION_CLASS = "is-records-attention-active";

let didInstallLifecycleCleanup = false;
let isRecordsAttentionActive = false;

function getDocumentRoot() {
  return typeof document !== "undefined" ? document : null;
}

function getWindowRoot() {
  return typeof window !== "undefined" ? window : null;
}

function resolveRecordsButton(documentRoot = getDocumentRoot()) {
  return documentRoot?.querySelector(RECORDS_BUTTON_SELECTOR) || null;
}

function applyAttentionState() {
  const button = resolveRecordsButton();
  if (!button) return false;
  button.classList.toggle(RECORDS_ATTENTION_CLASS, isRecordsAttentionActive);
  return isRecordsAttentionActive;
}

function installLifecycleCleanup() {
  if (didInstallLifecycleCleanup) return;
  const win = getWindowRoot();
  if (!win) return;

  const handlePageExit = () => {
    clearRecordsAttention();
  };

  win.addEventListener("pagehide", handlePageExit);
  win.addEventListener("beforeunload", handlePageExit);
  didInstallLifecycleCleanup = true;
}

function hasNewRecordAttention(report) {
  const results = Array.isArray(report?.records?.results) ? report.records.results : [];
  return results.some((row) => row?.reason === "first_unlock" && row?.rewardGrantedAfterCommit === true);
}

export function clearRecordsAttention() {
  isRecordsAttentionActive = false;
  applyAttentionState();
}

export function notifyNewRecordAttention(report) {
  installLifecycleCleanup();
  if (hasNewRecordAttention(report)) {
    isRecordsAttentionActive = true;
  }
  return applyAttentionState();
}

export function syncRecordsAttentionState() {
  return applyAttentionState();
}