import { registerTransientEmphasisTarget } from "./transient_runtime.js";

export const RECORDS_ENTRY_EMPHASIS_TARGET = "records_entry";

const RECORDS_ENTRY_BUTTON_SELECTOR = '[data-action-id="ui_records_open"].sidebar-tool-btn-record';

let didRegisterRecordsEntryEmphasis = false;

function getDocumentRoot() {
  return typeof document !== "undefined" ? document : null;
}

function resolveRecordsEntryButton({ documentRoot = null } = {}) {
  const doc = documentRoot || getDocumentRoot();
  return doc?.querySelector(RECORDS_ENTRY_BUTTON_SELECTOR) || null;
}

export function ensureRecordsEntryEmphasisRegistration() {
  if (didRegisterRecordsEntryEmphasis) return true;

  registerTransientEmphasisTarget(RECORDS_ENTRY_EMPHASIS_TARGET, ({ documentRoot }) => {
    return resolveRecordsEntryButton({ documentRoot });
  });

  didRegisterRecordsEntryEmphasis = true;
  return true;
}