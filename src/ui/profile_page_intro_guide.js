import { gameState } from "../engine/state.js";
import { TRANSIENT_PRIORITY } from "./transient/transient_contract.js";
import {
  TRANSIENT_GUIDE_ANCHOR_KINDS,
  TRANSIENT_GUIDE_BLOCKER_BEHAVIOR,
  TRANSIENT_GUIDE_BLOCKER_REASONS,
  TRANSIENT_GUIDE_RESUME_POLICIES,
  TRANSIENT_GUIDE_STEP_PRESENTATIONS,
  TRANSIENT_GUIDE_TRIGGER_SOURCES,
  buildTransientGuideStepDescriptor
} from "./transient/transient_guide_session_contract.js";
import { createTransientGuideSessionController } from "./transient/transient_guide_session_controller.js";
import { ensureProfilePageIntroEmphasisRegistration, PROFILE_PAGE_INTRO_EMPHASIS_TARGETS, resolveProfilePageIntroGuideNodes } from "./transient/profile_page_intro_emphasis.js";
import { registerTransientPresenter } from "./transient/transient_runtime.js";

const GUIDE_ID = "profile_page_intro_guide";
const GUIDE_FLAG_GROUP = "sceneTutorials";
const GUIDE_FLAG_KEY = "profile_page_intro";
const PROFILE_PAGE_INTRO_GUIDE_TRANSIENT_TYPE = "profile_page_intro_guide_step";
const PROFILE_PAGE_INTRO_STEP_TOTAL = 3;
const PROFILE_PAGE_INTRO_STEP_TIMING = Object.freeze({
  inMs: 170,
  holdMs: 600000,
  outMs: 210
});

const PROFILE_PAGE_INTRO_GUIDE_STEPS = Object.freeze([
  {
    id: "overview",
    index: 1,
    title: "查看档案首页",
    body: "这里记录当前档案标题、人物身份、当前状态和档案摘要。先看首页，可以快速确认这份档案现在到底处在什么阶段。",
    buttonLabel: "继续",
    anchorTarget: PROFILE_PAGE_INTRO_EMPHASIS_TARGETS.OVERVIEW
  },
  {
    id: "core",
    index: 2,
    title: "查看核心属性",
    body: "这里集中展示四项核心属性：体格、阅历、理性、信仰。需要判断角色基础状态时，先看这里即可。",
    buttonLabel: "继续",
    anchorTarget: PROFILE_PAGE_INTRO_EMPHASIS_TARGETS.CORE
  },
  {
    id: "annotation",
    index: 3,
    title: "查看批注页",
    body: "批注页会显示当前选中属性的阅读说明。需要做细看时，再把视线移到右侧批注区。",
    buttonLabel: "完成",
    anchorTarget: PROFILE_PAGE_INTRO_EMPHASIS_TARGETS.ANNOTATION
  }
]);

let didRegisterProfilePageIntroGuide = false;

function getDocumentRoot() {
  return typeof document !== "undefined" ? document : null;
}

function getGuideFlagsRoot() {
  if (!gameState.world || typeof gameState.world !== "object") return null;
  if (!gameState.world.flags || typeof gameState.world.flags !== "object") {
    gameState.world.flags = {};
  }
  if (!gameState.flags || typeof gameState.flags !== "object") {
    gameState.flags = gameState.world.flags;
  }
  gameState.world.flags = gameState.flags;

  if (!gameState.flags[GUIDE_FLAG_GROUP] || typeof gameState.flags[GUIDE_FLAG_GROUP] !== "object") {
    gameState.flags[GUIDE_FLAG_GROUP] = {};
  }
  return gameState.flags[GUIDE_FLAG_GROUP];
}

function hasSeenGuide() {
  const root = getGuideFlagsRoot();
  return !!root && root[GUIDE_FLAG_KEY] === true;
}

function markGuideSeen() {
  const root = getGuideFlagsRoot();
  if (!root) return;
  root[GUIDE_FLAG_KEY] = true;
}

function isNoticeDialogOpen(doc) {
  const host = doc?.getElementById("notice-dialog-host");
  return !!host && host.getAttribute("aria-hidden") === "false";
}

function resolveProfileGuideBlocker({ step }) {
  const doc = getDocumentRoot();
  if (gameState.ui?.profileOpen !== true) {
    return {
      blocked: true,
      reason: TRANSIENT_GUIDE_BLOCKER_REASONS.ROUTE_MISMATCH,
      behavior: TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.CANCEL_SESSION
    };
  }
  if (gameState.ui?.modal) {
    return {
      blocked: true,
      reason: TRANSIENT_GUIDE_BLOCKER_REASONS.UI_MODAL_OPEN,
      behavior: TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.PAUSE_SESSION
    };
  }
  if (isNoticeDialogOpen(doc)) {
    return {
      blocked: true,
      reason: TRANSIENT_GUIDE_BLOCKER_REASONS.NOTICE_DIALOG_OPEN,
      behavior: TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.PAUSE_SESSION
    };
  }
  if (!doc?.querySelector("#profile-overlay-host .profile-page-dialog")) {
    return {
      blocked: true,
      reason: TRANSIENT_GUIDE_BLOCKER_REASONS.GUIDE_SURFACE_MISSING,
      behavior: TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.PAUSE_SESSION
    };
  }
  if (resolveProfilePageIntroGuideNodes(step.anchorTarget, { documentRoot: doc }).length <= 0) {
    return {
      blocked: true,
      reason: TRANSIENT_GUIDE_BLOCKER_REASONS.GUIDE_ANCHOR_MISSING,
      behavior: TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.CANCEL_SESSION
    };
  }
  return null;
}

function buildProfilePageIntroStepIntent({ step, session }) {
  const descriptor = buildTransientGuideStepDescriptor({
    guideId: GUIDE_ID,
    sessionId: session.sessionId,
    stepId: step.id,
    stepIndex: step.index - 1,
    triggerSource: session.triggerSource || TRANSIENT_GUIDE_TRIGGER_SOURCES.COMMIT_REPORT,
    anchor: {
      kind: TRANSIENT_GUIDE_ANCHOR_KINDS.EMPHASIS_TARGET,
      target: step.anchorTarget
    },
    presentation: TRANSIENT_GUIDE_STEP_PRESENTATIONS.CARD_WITH_EMPHASIS,
    priority: TRANSIENT_PRIORITY.NORMAL,
    blocking: false,
    blockerBehavior: TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.PAUSE_SESSION,
    resumePolicy: TRANSIENT_GUIDE_RESUME_POLICIES.NONE,
    payload: {
      title: step.title,
      body: step.body,
      buttonLabel: step.buttonLabel,
      stepNumber: step.index,
      stepTotal: PROFILE_PAGE_INTRO_STEP_TOTAL
    },
    timing: PROFILE_PAGE_INTRO_STEP_TIMING
  });

  return {
    id: `${GUIDE_ID}:${session.sessionId}:${step.id}`,
    type: PROFILE_PAGE_INTRO_GUIDE_TRANSIENT_TYPE,
    lane: "card",
    priority: TRANSIENT_PRIORITY.NORMAL,
    dedupeKey: `${GUIDE_ID}:${session.sessionId}`,
    emphasisTargets: [step.anchorTarget],
    timing: PROFILE_PAGE_INTRO_STEP_TIMING,
    payload: {
      descriptor,
      sessionId: session.sessionId,
      stepId: step.id,
      stepNumber: step.index,
      stepTotal: PROFILE_PAGE_INTRO_STEP_TOTAL,
      title: step.title,
      body: step.body,
      buttonLabel: step.buttonLabel
    }
  };
}

const profilePageIntroGuideController = createTransientGuideSessionController({
  guideId: GUIDE_ID,
  steps: PROFILE_PAGE_INTRO_GUIDE_STEPS,
  resumePolicy: TRANSIENT_GUIDE_RESUME_POLICIES.NONE,
  buildStepIntent: ({ step, session }) => buildProfilePageIntroStepIntent({ step, session }),
  resolveStepBlocker: ({ step }) => resolveProfileGuideBlocker({ step }),
  onSessionComplete: () => {
    markGuideSeen();
  },
  onSessionSkip: () => {
    markGuideSeen();
  }
});

function normalizeProfilePageIntroGuidePayload(payload = {}) {
  return {
    sessionId: String(payload?.sessionId || "").trim(),
    stepId: String(payload?.stepId || "").trim(),
    title: String(payload?.title || "").trim(),
    body: String(payload?.body || "").trim(),
    buttonLabel: String(payload?.buttonLabel || "继续").trim() || "继续",
    stepNumber: Math.max(1, Math.trunc(Number(payload?.stepNumber || 1))),
    stepTotal: Math.max(1, Math.trunc(Number(payload?.stepTotal || PROFILE_PAGE_INTRO_STEP_TOTAL)))
  };
}

function renderProfilePageIntroGuidePresenter({ payload, itemRoot, documentRoot }) {
  const doc = documentRoot || getDocumentRoot();
  if (!doc || !itemRoot) return null;

  const presenterPayload = normalizeProfilePageIntroGuidePayload(payload);
  itemRoot.classList.add("profile-page-intro-guide-transient");

  const frame = doc.createElement("article");
  frame.className = "profile-page-intro-guide-frame";
  frame.setAttribute("role", "dialog");
  frame.setAttribute("aria-modal", "false");
  frame.setAttribute("aria-label", "角色档案页内引导");

  const header = doc.createElement("div");
  header.className = "profile-page-intro-guide-header";

  const step = doc.createElement("div");
  step.className = "profile-page-intro-guide-step";
  step.textContent = `${presenterPayload.stepNumber} / ${presenterPayload.stepTotal}`;

  const dismissButton = doc.createElement("button");
  dismissButton.type = "button";
  dismissButton.className = "profile-page-intro-guide-dismiss";
  dismissButton.setAttribute("aria-label", "关闭引导");
  dismissButton.textContent = "×";

  const title = doc.createElement("h3");
  title.className = "profile-page-intro-guide-title";
  title.textContent = presenterPayload.title;

  const body = doc.createElement("p");
  body.className = "profile-page-intro-guide-body";
  body.textContent = presenterPayload.body;

  const footer = doc.createElement("div");
  footer.className = "profile-page-intro-guide-footer";

  const nextButton = doc.createElement("button");
  nextButton.type = "button";
  nextButton.className = "profile-page-intro-guide-next";
  nextButton.textContent = presenterPayload.buttonLabel;

  dismissButton.onclick = () => {
    dismissProfilePageIntroGuideSession({
      sessionId: presenterPayload.sessionId,
      reason: "user_dismissed"
    });
  };

  nextButton.onclick = () => {
    nextButton.disabled = true;
    advanceProfilePageIntroGuideSession({
      sessionId: presenterPayload.sessionId,
      stepId: presenterPayload.stepId
    });
  };

  header.appendChild(step);
  header.appendChild(dismissButton);
  footer.appendChild(nextButton);
  frame.appendChild(header);
  frame.appendChild(title);
  frame.appendChild(body);
  frame.appendChild(footer);
  itemRoot.appendChild(frame);

  return {
    signalTarget: frame
  };
}

function shouldStartProfilePageIntroGuide(report) {
  const before = report?.before || {};
  const after = report?.after || {};
  return before.profileOpen !== true
    && after.profileOpen === true
    && after.profilePageIntroGuideSeen !== true
    && String(after.criticalMode || "NORMAL") === "NORMAL";
}

export function ensureProfilePageIntroGuideRegistration() {
  if (didRegisterProfilePageIntroGuide) return true;

  registerTransientPresenter(PROFILE_PAGE_INTRO_GUIDE_TRANSIENT_TYPE, {
    render: renderProfilePageIntroGuidePresenter
  });
  ensureProfilePageIntroEmphasisRegistration();

  didRegisterProfilePageIntroGuide = true;
  return true;
}

export function advanceProfilePageIntroGuideSession({ sessionId = "", stepId = "" } = {}) {
  return profilePageIntroGuideController.nextStep({ sessionId, stepId });
}

export function dismissProfilePageIntroGuideSession({ sessionId = "", reason = "guide_session_dismissed" } = {}) {
  return profilePageIntroGuideController.dismissSession({ sessionId, reason });
}

export function skipProfilePageIntroGuideSession({ sessionId = "", reason = "guide_session_skipped" } = {}) {
  return profilePageIntroGuideController.skipSession({ sessionId, reason });
}

export function getProfilePageIntroGuideSessionSnapshot() {
  return profilePageIntroGuideController.getSessionSnapshot();
}

export function prepareProfilePageIntroGuideSessionFromCommitReport(report) {
  const session = profilePageIntroGuideController.getSessionSnapshot();
  if (!session.sessionId || (session.status !== "active" && session.status !== "idle")) {
    return session;
  }

  const after = report?.after || {};
  if (after.profileOpen !== true) {
    return profilePageIntroGuideController.dismissSession({
      sessionId: session.sessionId,
      reason: "profile_overlay_closed"
    });
  }

  if (String(after.criticalMode || "NORMAL") !== "NORMAL") {
    return profilePageIntroGuideController.dismissSession({
      sessionId: session.sessionId,
      reason: "yield_to_critical_state_notice"
    });
  }

  return session;
}

export function syncProfilePageIntroGuideSessionFromCommitReport(report) {
  ensureProfilePageIntroGuideRegistration();

  if (hasSeenGuide()) {
    return profilePageIntroGuideController.getSessionSnapshot();
  }

  const after = report?.after || {};
  if (after.profileOpen !== true || String(after.criticalMode || "NORMAL") !== "NORMAL") {
    return profilePageIntroGuideController.getSessionSnapshot();
  }

  if (shouldStartProfilePageIntroGuide(report)) {
    return profilePageIntroGuideController.startSession({
      triggerSource: TRANSIENT_GUIDE_TRIGGER_SOURCES.COMMIT_REPORT
    });
  }

  const session = profilePageIntroGuideController.getSessionSnapshot();
  if (session.status === "idle" && session.sessionId) {
    return profilePageIntroGuideController.resumeSession();
  }
  return session;
}