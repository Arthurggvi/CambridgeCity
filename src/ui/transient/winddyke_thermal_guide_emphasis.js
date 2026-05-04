import { registerTransientEmphasisTarget } from "./transient_runtime.js";

export const WINDDYKE_THERMAL_GUIDE_EMPHASIS_TARGETS = Object.freeze({
  THERMAL_CARD: "winddyke_thermal_card",
  THERMAL_CLOTHING_ACTION: "winddyke_thermal_clothing_action",
  THERMAL_RETURN_CLINIC_ACTION: "winddyke_thermal_return_clinic_action"
});

const WINDDYKE_GUIDE_BODY_CLASS = "winddyke-thermal-guide-session-active";
const WINDDYKE_GUIDE_TARGET_CLASS = "winddyke-thermal-guide-session-target";

let didRegisterWinddykeThermalGuideEmphasis = false;

function getDocumentRoot(documentRoot = null) {
  return documentRoot || (typeof document !== "undefined" ? document : null);
}

export function resolveWinddykeThermalGuideNodes(key, { documentRoot = null } = {}) {
  const doc = getDocumentRoot(documentRoot);
  if (!doc) return [];

  switch (String(key || "").trim()) {
    case WINDDYKE_THERMAL_GUIDE_EMPHASIS_TARGETS.THERMAL_CARD: {
      const node = doc.querySelector('[data-guide-target="thermal-card"]');
      return node ? [node] : [];
    }
    case WINDDYKE_THERMAL_GUIDE_EMPHASIS_TARGETS.THERMAL_CLOTHING_ACTION: {
      const node = doc.querySelector('.thermal-card button[data-action-id="ui_open_inventory_clothing"][data-guide-target="thermal-card-detail-entry"]');
      return node ? [node] : [];
    }
    case WINDDYKE_THERMAL_GUIDE_EMPHASIS_TARGETS.THERMAL_RETURN_CLINIC_ACTION: {
      const node = doc.querySelector('#choices .map-actions-group button[data-action-id="to_clinic"][data-guide-target="winddyke-thermal-return-clinic-action"]');
      return node ? [node] : [];
    }
    default:
      return [];
  }
}

function createWinddykeGuideHandle(nodes, doc) {
  return {
    activate() {
      doc.body?.classList?.add(WINDDYKE_GUIDE_BODY_CLASS);
      for (const node of nodes) {
        node?.classList?.add(WINDDYKE_GUIDE_TARGET_CLASS);
      }
    },
    clear() {
      for (const node of nodes) {
        node?.classList?.remove(WINDDYKE_GUIDE_TARGET_CLASS);
      }
      if (!doc.querySelector(`.${WINDDYKE_GUIDE_TARGET_CLASS}`)) {
        doc.body?.classList?.remove(WINDDYKE_GUIDE_BODY_CLASS);
      }
    }
  };
}

export function ensureWinddykeThermalGuideEmphasisRegistration() {
  if (didRegisterWinddykeThermalGuideEmphasis) return true;

  for (const key of Object.values(WINDDYKE_THERMAL_GUIDE_EMPHASIS_TARGETS)) {
    registerTransientEmphasisTarget(key, ({ documentRoot }) => {
      const doc = getDocumentRoot(documentRoot);
      if (!doc) return null;
      const nodes = resolveWinddykeThermalGuideNodes(key, { documentRoot: doc });
      if (nodes.length <= 0) return null;
      return createWinddykeGuideHandle(nodes, doc);
    });
  }

  didRegisterWinddykeThermalGuideEmphasis = true;
  return true;
}