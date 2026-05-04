import { registerTransientEmphasisTarget } from "./transient_runtime.js";

export const BAYPORT_CLINIC_WARD_INTRO_GUIDE_EMPHASIS_TARGETS = Object.freeze({
  SAVE_ENTRY: "bayport_clinic_ward_intro_save_entry",
  STAMINA_CARD: "bayport_clinic_ward_intro_stamina_card",
  SATIETY_CARD: "bayport_clinic_ward_intro_satiety_card",
  FATIGUE_CARD: "bayport_clinic_ward_intro_fatigue_card",
  WARD_REST_ACTION: "bayport_clinic_ward_intro_rest_action"
});

const WARD_GUIDE_BODY_CLASS = "bayport-clinic-ward-guide-session-active";
const WARD_GUIDE_TARGET_CLASS = "bayport-clinic-ward-guide-session-target";

let didRegisterBayportClinicWardGuideEmphasis = false;

function getDocumentRoot(documentRoot = null) {
  return documentRoot || (typeof document !== "undefined" ? document : null);
}

function isNodeVisible(node) {
  if (!node || typeof node.getClientRects !== "function") return false;
  if (node.hidden) return false;
  const style = typeof window !== "undefined" && typeof window.getComputedStyle === "function"
    ? window.getComputedStyle(node)
    : null;
  if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) {
    return false;
  }
  return node.getClientRects().length > 0;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function resolveVisibleButtonByActionId(doc, actionId) {
  const all = Array.from(doc?.querySelectorAll?.(`button[data-action-id="${String(actionId || "").trim()}"]`) || []);
  return all.find((node) => isNodeVisible(node)) || null;
}

function resolveVisibleSaveEntry(doc) {
  const stableSelectors = [
    'button.sidebar-tool-btn-vault[data-action-id="menu_go_load"]',
    '#choices button.sidebar-tool-btn-vault[data-action-id="menu_go_load"]',
    'button[data-action-id="menu_go_load"]'
  ];

  for (const selector of stableSelectors) {
    const buttons = Array.from(doc?.querySelectorAll?.(selector) || []);
    const match = buttons.find((node) => isNodeVisible(node) && normalizeText(node.textContent) === "存档");
    if (match) return match;
  }

  const buttons = Array.from(doc?.querySelectorAll?.("button") || []);
  return buttons.find((node) => isNodeVisible(node) && normalizeText(node.textContent) === "存档") || null;
}

function resolveAttributeCard(doc, label) {
  const safeLabel = normalizeText(label);
  const cards = Array.from(doc?.querySelectorAll?.(".attr-card") || []);
  return cards.find((card) => {
    if (!isNodeVisible(card)) return false;
    const labelNode = card.querySelector(".attr-label");
    return normalizeText(labelNode?.textContent).includes(safeLabel);
  }) || null;
}

export function resolveBayportClinicWardIntroGuideNodes(key, { documentRoot = null } = {}) {
  const doc = getDocumentRoot(documentRoot);
  if (!doc) return [];

  switch (String(key || "").trim()) {
    case BAYPORT_CLINIC_WARD_INTRO_GUIDE_EMPHASIS_TARGETS.SAVE_ENTRY: {
      const node = resolveVisibleSaveEntry(doc);
      return node ? [node] : [];
    }
    case BAYPORT_CLINIC_WARD_INTRO_GUIDE_EMPHASIS_TARGETS.STAMINA_CARD: {
      const node = resolveAttributeCard(doc, "体能");
      return node ? [node] : [];
    }
    case BAYPORT_CLINIC_WARD_INTRO_GUIDE_EMPHASIS_TARGETS.SATIETY_CARD: {
      const node = resolveAttributeCard(doc, "饱腹");
      return node ? [node] : [];
    }
    case BAYPORT_CLINIC_WARD_INTRO_GUIDE_EMPHASIS_TARGETS.FATIGUE_CARD: {
      const node = resolveAttributeCard(doc, "睡眠");
      return node ? [node] : [];
    }
    case BAYPORT_CLINIC_WARD_INTRO_GUIDE_EMPHASIS_TARGETS.WARD_REST_ACTION: {
      const node = resolveVisibleButtonByActionId(doc, "ward_bed_24h");
      return node ? [node] : [];
    }
    default:
      return [];
  }
}

function createBayportClinicWardGuideHandle(nodes, doc) {
  return {
    activate() {
      doc.body?.classList?.add(WARD_GUIDE_BODY_CLASS);
      for (const node of nodes) {
        node?.classList?.add(WARD_GUIDE_TARGET_CLASS);
      }
    },
    clear() {
      for (const node of nodes) {
        node?.classList?.remove(WARD_GUIDE_TARGET_CLASS);
      }
      if (!doc.querySelector(`.${WARD_GUIDE_TARGET_CLASS}`)) {
        doc.body?.classList?.remove(WARD_GUIDE_BODY_CLASS);
      }
    }
  };
}

export function ensureBayportClinicWardIntroGuideEmphasisRegistration() {
  if (didRegisterBayportClinicWardGuideEmphasis) return true;

  for (const key of Object.values(BAYPORT_CLINIC_WARD_INTRO_GUIDE_EMPHASIS_TARGETS)) {
    registerTransientEmphasisTarget(key, ({ documentRoot }) => {
      const doc = getDocumentRoot(documentRoot);
      if (!doc) return null;
      const nodes = resolveBayportClinicWardIntroGuideNodes(key, { documentRoot: doc });
      if (nodes.length <= 0) return null;
      return createBayportClinicWardGuideHandle(nodes, doc);
    });
  }

  didRegisterBayportClinicWardGuideEmphasis = true;
  return true;
}