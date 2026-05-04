import { registerTransientEmphasisTarget } from "./transient_runtime.js";

export const PROFILE_PAGE_INTRO_EMPHASIS_TARGETS = Object.freeze({
  OVERVIEW: "profile_page_intro_overview",
  CORE: "profile_page_intro_core",
  ANNOTATION: "profile_page_intro_annotation"
});

const PROFILE_GUIDE_BODY_CLASS = "profile-page-guide-session-active";
const PROFILE_GUIDE_TARGET_CLASS = "profile-page-guide-session-target";

const PROFILE_PAGE_INTRO_TARGET_SELECTORS = Object.freeze({
  [PROFILE_PAGE_INTRO_EMPHASIS_TARGETS.OVERVIEW]: ['[data-guide-target="profile-overview-card"]'],
  [PROFILE_PAGE_INTRO_EMPHASIS_TARGETS.CORE]: ['[data-guide-target="profile-core-attrs"]'],
  [PROFILE_PAGE_INTRO_EMPHASIS_TARGETS.ANNOTATION]: ['[data-guide-target="profile-annotation-pane"]']
});

let didRegisterProfilePageIntroEmphasis = false;

function getDocumentRoot(documentRoot = null) {
  return documentRoot || (typeof document !== "undefined" ? document : null);
}

export function resolveProfilePageIntroGuideNodes(key, { documentRoot = null } = {}) {
  const doc = getDocumentRoot(documentRoot);
  if (!doc) return [];
  const selectors = PROFILE_PAGE_INTRO_TARGET_SELECTORS[String(key || "").trim()] || [];
  const nodes = [];
  for (const selector of selectors) {
    const node = doc.querySelector(selector);
    if (node) {
      nodes.push(node);
    }
  }
  return nodes;
}

function createProfilePageGuideHandle(nodes, doc) {
  return {
    activate() {
      doc.body?.classList?.add(PROFILE_GUIDE_BODY_CLASS);
      for (const node of nodes) {
        node?.classList?.add(PROFILE_GUIDE_TARGET_CLASS);
      }
    },
    clear() {
      for (const node of nodes) {
        node?.classList?.remove(PROFILE_GUIDE_TARGET_CLASS);
      }
      if (!doc.querySelector(`.${PROFILE_GUIDE_TARGET_CLASS}`)) {
        doc.body?.classList?.remove(PROFILE_GUIDE_BODY_CLASS);
      }
    }
  };
}

export function ensureProfilePageIntroEmphasisRegistration() {
  if (didRegisterProfilePageIntroEmphasis) return true;

  for (const key of Object.values(PROFILE_PAGE_INTRO_EMPHASIS_TARGETS)) {
    registerTransientEmphasisTarget(key, ({ documentRoot }) => {
      const doc = getDocumentRoot(documentRoot);
      if (!doc) return null;
      const nodes = resolveProfilePageIntroGuideNodes(key, { documentRoot: doc });
      if (nodes.length <= 0) return null;
      return createProfilePageGuideHandle(nodes, doc);
    });
  }

  didRegisterProfilePageIntroEmphasis = true;
  return true;
}