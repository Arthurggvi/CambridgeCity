import { registerTransientEmphasisTarget } from "./transient_runtime.js";

export const DOSSIER_ENTRY_EMPHASIS_TARGET = "dossier_entry";

const ACTIVE_BODY_CLASS = "is-dossier-guide-active";

let didRegisterDossierEntryEmphasis = false;

function getDocumentRoot(documentRoot = null) {
  return documentRoot || (typeof document !== "undefined" ? document : null);
}

export function ensureDossierEntryEmphasisRegistration() {
  if (didRegisterDossierEntryEmphasis) return true;

  registerTransientEmphasisTarget(DOSSIER_ENTRY_EMPHASIS_TARGET, ({ documentRoot }) => {
    const doc = getDocumentRoot(documentRoot);
    const target = doc?.querySelector('[data-guide-target="sidebar-dossier-entry"]') || null;
    if (!target || !doc?.body) return null;

    return {
      activate() {
        doc.body.classList.add(ACTIVE_BODY_CLASS);
        target.classList.add("is-transient-emphasis-active");
      },
      clear() {
        target.classList.remove("is-transient-emphasis-active");
        doc.body.classList.remove(ACTIVE_BODY_CLASS);
      }
    };
  });

  didRegisterDossierEntryEmphasis = true;
  return true;
}