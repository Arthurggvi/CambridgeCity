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
import {
  BAYPORT_CLINIC_WARD_INTRO_GUIDE_EMPHASIS_TARGETS,
  ensureBayportClinicWardIntroGuideEmphasisRegistration
} from "./transient/bayport_clinic_ward_intro_guide_emphasis.js";
import { registerTransientPresenter } from "./transient/transient_runtime.js";

const GUIDE_ID = "bayport_clinic_ward_intro_guide";
const GUIDE_FLAG_GROUP = "sceneTutorials";
const GUIDE_FLAG_KEY = "bayport_clinic_ward_intro";
const TARGET_MAP_ID = "bayport_clinic_ward";
const GUIDE_TRANSIENT_TYPE = "bayport_clinic_ward_intro_guide_step";
const GUIDE_STEP_TOTAL = 6;
const GUIDE_STEP_TIMING = Object.freeze({
  inMs: 170,
  holdMs: 600000,
  outMs: 210
});

const GUIDE_COPY = Object.freeze({
  closeLabel: "关闭引导"
});

const GUIDE_STEPS = Object.freeze([
  {
    id: "welcome",
    index: 1,
    title: "欢迎来到寒武新纪",
    subtitle: "在开始游戏前，有些重要的事项需要您知道",
    body: "这里最需要留意的，\n是您身体状态的变化。\n\n接下来我会用几步很短的说明，\n带您认识最重要的几项指标。",
    buttonLabel: "开始",
    anchorTarget: "",
    fullscreen: true
  },
  {
    id: "health",
    index: 2,
    title: "这是健康",
    body: "健康决定您还能否继续这趟旅程。\n当它降到 0 时，游戏将强制结束。\n\n如果真的走到那一步，\n您可以先通过右侧的存档按钮进入存档页面，再回溯到最近的进度。",
    buttonLabel: "继续",
    anchorTarget: BAYPORT_CLINIC_WARD_INTRO_GUIDE_EMPHASIS_TARGETS.SAVE_ENTRY,
    fullscreen: false
  },
  {
    id: "stamina",
    index: 3,
    title: "这是体能",
    body: "体能是您行动时最先消耗的那一格。\n走动、工作和长时间活动，都会慢慢把它用掉。\n\n当它降到 0 时，您会陷入晕厥状态。\n希望您不需要知道这是什么功能。",
    buttonLabel: "继续",
    anchorTarget: BAYPORT_CLINIC_WARD_INTRO_GUIDE_EMPHASIS_TARGETS.STAMINA_CARD,
    fullscreen: false
  },
  {
    id: "satiety",
    index: 4,
    title: "这是饱腹",
    body: "饱腹是需要长期管理的指标。\n一顿饭不吃饿不死您，但想靠一顿饭撑七天，也不太现实。\n\n另外，进食能恢复的量也有上限。\n状态越接近上限，继续吃下去的意义就越小。",
    buttonLabel: "继续",
    anchorTarget: BAYPORT_CLINIC_WARD_INTRO_GUIDE_EMPHASIS_TARGETS.SATIETY_CARD,
    fullscreen: false
  },
  {
    id: "fatigue",
    index: 5,
    title: "这是睡眠",
    body: "睡眠决定您能不能长期保持稳定。\n它低了以后，体能上限会下降，很多事情也会变得更吃力。\n\n请确保您找到合适的地方睡觉，\n而不是睡在马桶上。",
    buttonLabel: "继续",
    anchorTarget: BAYPORT_CLINIC_WARD_INTRO_GUIDE_EMPHASIS_TARGETS.FATIGUE_CARD,
    fullscreen: false
  },
  {
    id: "ward_rest",
    index: 6,
    title: "先把状态稳住",
    body: "您现在所在的病房区，\n是把状态拉回安全线的好地方。\n\n等您离开这里以后，\n这些指标就需要您自己慢慢照看了。",
    buttonLabel: "我知道了",
    anchorTarget: BAYPORT_CLINIC_WARD_INTRO_GUIDE_EMPHASIS_TARGETS.WARD_REST_ACTION,
    fullscreen: false
  }
]);

let didRegisterBayportClinicWardIntroGuide = false;

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

function isUiBlocked(doc) {
  if (gameState.ui?.modal) {
    return TRANSIENT_GUIDE_BLOCKER_REASONS.UI_MODAL_OPEN;
  }
  if (isNoticeDialogOpen(doc)) {
    return TRANSIENT_GUIDE_BLOCKER_REASONS.NOTICE_DIALOG_OPEN;
  }
  if (gameState.ui?.overlay) {
    return TRANSIENT_GUIDE_BLOCKER_REASONS.UI_OVERLAY_OPEN;
  }
  if (doc?.getElementById("settings-overlay-root") || doc?.getElementById("modal-overlay")) {
    return TRANSIENT_GUIDE_BLOCKER_REASONS.UI_MODAL_OPEN;
  }
  if (doc?.querySelector([
    ".inventory-overlay",
    ".tasks-overlay",
    ".SettingsOverlay",
    ".temp-smoke-report-overlay",
    ".inventory-detail-overlay",
    ".inventory-popover-overlay",
    ".notice-dialog-overlay",
    "#profile-overlay-host .profile-page-dialog",
    "#records-overlay-host [aria-hidden=\"false\"]"
  ].join(","))) {
    return TRANSIENT_GUIDE_BLOCKER_REASONS.UI_OVERLAY_OPEN;
  }
  return "";
}

function buildGuideStepIntent({ step, session }) {
  const descriptor = buildTransientGuideStepDescriptor({
    guideId: GUIDE_ID,
    sessionId: session.sessionId,
    stepId: step.id,
    stepIndex: step.index - 1,
    triggerSource: session.triggerSource || TRANSIENT_GUIDE_TRIGGER_SOURCES.ROUTE_ENTER,
    anchor: {
      kind: TRANSIENT_GUIDE_ANCHOR_KINDS.EMPHASIS_TARGET,
      target: step.anchorTarget || ""
    },
    presentation: TRANSIENT_GUIDE_STEP_PRESENTATIONS.CARD_WITH_EMPHASIS,
    priority: TRANSIENT_PRIORITY.NORMAL,
    blocking: false,
    blockerBehavior: TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.PAUSE_SESSION,
    resumePolicy: TRANSIENT_GUIDE_RESUME_POLICIES.NONE,
    payload: {
      title: step.title,
      subtitle: step.subtitle || "",
      body: step.body,
      buttonLabel: step.buttonLabel,
      closeLabel: GUIDE_COPY.closeLabel,
      stepNumber: step.index,
      stepTotal: GUIDE_STEP_TOTAL,
      fullscreen: step.fullscreen === true
    },
    timing: GUIDE_STEP_TIMING
  });

  const emphasisTargets = step.anchorTarget ? [step.anchorTarget] : [];
  return {
    id: `${GUIDE_ID}:${session.sessionId}:${step.id}`,
    type: GUIDE_TRANSIENT_TYPE,
    lane: "card",
    priority: TRANSIENT_PRIORITY.NORMAL,
    dedupeKey: `${GUIDE_ID}:${session.sessionId}`,
    emphasisTargets,
    timing: GUIDE_STEP_TIMING,
    payload: {
      descriptor,
      sessionId: session.sessionId,
      stepId: step.id,
      stepNumber: step.index,
      stepTotal: GUIDE_STEP_TOTAL,
      title: step.title,
      subtitle: step.subtitle || "",
      body: step.body,
      buttonLabel: step.buttonLabel,
      closeLabel: GUIDE_COPY.closeLabel,
      fullscreen: step.fullscreen === true
    }
  };
}

function resolveGuideBlocker() {
  const doc = getDocumentRoot();

  if (String(gameState.currentMapId || "") !== TARGET_MAP_ID) {
    return {
      blocked: true,
      reason: TRANSIENT_GUIDE_BLOCKER_REASONS.ROUTE_MISMATCH,
      behavior: TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.CANCEL_SESSION
    };
  }

  const blockingReason = isUiBlocked(doc);
  if (blockingReason) {
    return {
      blocked: true,
      reason: blockingReason,
      behavior: TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.PAUSE_SESSION
    };
  }

  return null;
}

function shouldMarkSeenOnDismiss(snapshot) {
  const reason = String(snapshot?.lastReason || "").trim();
  return reason === "user_dismissed" || reason === "user_skipped";
}

const bayportClinicWardIntroGuideController = createTransientGuideSessionController({
  guideId: GUIDE_ID,
  steps: GUIDE_STEPS,
  resumePolicy: TRANSIENT_GUIDE_RESUME_POLICIES.NONE,
  buildStepIntent: ({ step, session }) => buildGuideStepIntent({ step, session }),
  resolveStepBlocker: () => resolveGuideBlocker(),
  onSessionComplete: () => {
    markGuideSeen();
  },
  onSessionDismiss: (snapshot) => {
    if (shouldMarkSeenOnDismiss(snapshot)) {
      markGuideSeen();
    }
  },
  onSessionSkip: () => {
    markGuideSeen();
  }
});

function normalizeGuidePayload(payload = {}) {
  return {
    sessionId: String(payload?.sessionId || "").trim(),
    stepId: String(payload?.stepId || "").trim(),
    title: String(payload?.title || "").trim(),
    subtitle: String(payload?.subtitle || "").trim(),
    body: String(payload?.body || "").trim(),
    buttonLabel: String(payload?.buttonLabel || "继续").trim() || "继续",
    closeLabel: String(payload?.closeLabel || GUIDE_COPY.closeLabel).trim() || GUIDE_COPY.closeLabel,
    stepNumber: Math.max(1, Math.trunc(Number(payload?.stepNumber || 1))),
    stepTotal: Math.max(1, Math.trunc(Number(payload?.stepTotal || GUIDE_STEP_TOTAL))),
    fullscreen: payload?.fullscreen === true
  };
}

function buildBodyParagraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function renderGuideBody(doc, text) {
  const body = doc.createElement("div");
  body.className = "bayport-clinic-ward-intro-guide-body";

  for (const paragraphText of buildBodyParagraphs(text)) {
    const paragraph = doc.createElement("p");
    paragraph.className = "bayport-clinic-ward-intro-guide-paragraph";
    paragraph.textContent = paragraphText;
    body.appendChild(paragraph);
  }

  return body;
}

function renderGuidePresenter({ payload, itemRoot, documentRoot }) {
  const doc = documentRoot || getDocumentRoot();
  if (!doc || !itemRoot) return null;

  const presenterPayload = normalizeGuidePayload(payload);
  itemRoot.classList.add("bayport-clinic-ward-intro-guide-transient");
  if (presenterPayload.fullscreen) {
    itemRoot.classList.add("is-fullscreen-step");
  }

  const backdrop = doc.createElement("div");
  backdrop.className = "bayport-clinic-ward-intro-guide-backdrop";

  const frame = doc.createElement("article");
  frame.className = "bayport-clinic-ward-intro-guide-frame";
  if (presenterPayload.fullscreen) {
    frame.classList.add("is-fullscreen-step");
  }
  frame.setAttribute("role", "dialog");
  frame.setAttribute("aria-modal", "false");
  frame.setAttribute("aria-label", "边港诊所病房区新手引导");

  const header = doc.createElement("div");
  header.className = "bayport-clinic-ward-intro-guide-header";

  const step = doc.createElement("div");
  step.className = "bayport-clinic-ward-intro-guide-step";
  step.textContent = `${presenterPayload.stepNumber} / ${presenterPayload.stepTotal}`;

  const closeButton = doc.createElement("button");
  closeButton.type = "button";
  closeButton.className = "bayport-clinic-ward-intro-guide-close";
  closeButton.setAttribute("aria-label", presenterPayload.closeLabel);
  closeButton.textContent = "×";

  const title = doc.createElement("h3");
  title.className = "bayport-clinic-ward-intro-guide-title";
  title.textContent = presenterPayload.title;

  header.appendChild(step);
  header.appendChild(closeButton);
  frame.appendChild(header);
  frame.appendChild(title);

  if (presenterPayload.subtitle) {
    const subtitle = doc.createElement("p");
    subtitle.className = "bayport-clinic-ward-intro-guide-subtitle";
    subtitle.textContent = presenterPayload.subtitle;
    frame.appendChild(subtitle);
  }

  frame.appendChild(renderGuideBody(doc, presenterPayload.body));

  const footer = doc.createElement("div");
  footer.className = "bayport-clinic-ward-intro-guide-footer";

  const nextButton = doc.createElement("button");
  nextButton.type = "button";
  nextButton.className = "bayport-clinic-ward-intro-guide-next";
  nextButton.textContent = presenterPayload.buttonLabel;

  closeButton.onclick = () => {
    closeButton.disabled = true;
    dismissBayportClinicWardIntroGuideSession({
      sessionId: presenterPayload.sessionId,
      reason: "user_dismissed"
    });
  };

  nextButton.onclick = () => {
    nextButton.disabled = true;
    advanceBayportClinicWardIntroGuideSession({
      sessionId: presenterPayload.sessionId,
      stepId: presenterPayload.stepId
    });
  };

  footer.appendChild(nextButton);
  frame.appendChild(footer);
  if (presenterPayload.fullscreen) {
    itemRoot.appendChild(backdrop);
  }
  itemRoot.appendChild(frame);

  return {
    signalTarget: frame
  };
}

function shouldStartGuide(report) {
  const before = report?.before || {};
  const after = report?.after || {};
  return before.mapId !== TARGET_MAP_ID
    && after.mapId === TARGET_MAP_ID
    && after.bayportClinicWardIntroGuideSeen !== true
    && String(after.criticalMode || "NORMAL") === "NORMAL";
}

export function ensureBayportClinicWardIntroGuideRegistration() {
  if (didRegisterBayportClinicWardIntroGuide) return true;

  registerTransientPresenter(GUIDE_TRANSIENT_TYPE, {
    render: renderGuidePresenter
  });
  ensureBayportClinicWardIntroGuideEmphasisRegistration();

  didRegisterBayportClinicWardIntroGuide = true;
  return true;
}

export function advanceBayportClinicWardIntroGuideSession({ sessionId = "", stepId = "" } = {}) {
  return bayportClinicWardIntroGuideController.nextStep({ sessionId, stepId });
}

export function dismissBayportClinicWardIntroGuideSession({ sessionId = "", reason = "guide_session_dismissed" } = {}) {
  return bayportClinicWardIntroGuideController.dismissSession({ sessionId, reason });
}

export function skipBayportClinicWardIntroGuideSession({ sessionId = "", reason = "guide_session_skipped" } = {}) {
  return bayportClinicWardIntroGuideController.skipSession({ sessionId, reason });
}

export function getBayportClinicWardIntroGuideSessionSnapshot() {
  return bayportClinicWardIntroGuideController.getSessionSnapshot();
}

export function debugBayportClinicWardIntroGuideState(report = null) {
  return {
    guideId: GUIDE_ID,
    targetMapId: TARGET_MAP_ID,
    guideFlagKey: GUIDE_FLAG_KEY,
    hasSeenGuide: hasSeenGuide(),
    shouldStartGuide: report ? shouldStartGuide(report) : false,
    blocker: resolveGuideBlocker(),
    session: bayportClinicWardIntroGuideController.getSessionSnapshot()
  };
}

export function prepareBayportClinicWardIntroGuideSessionFromCommitReport(report) {
  const session = bayportClinicWardIntroGuideController.getSessionSnapshot();
  if (!session.sessionId || (session.status !== "active" && session.status !== "idle")) {
    return session;
  }

  const after = report?.after || {};
  if (after.mapId !== TARGET_MAP_ID) {
    return bayportClinicWardIntroGuideController.dismissSession({
      sessionId: session.sessionId,
      reason: "bayport_clinic_ward_route_left"
    });
  }

  if (String(after.criticalMode || "NORMAL") !== "NORMAL") {
    return bayportClinicWardIntroGuideController.dismissSession({
      sessionId: session.sessionId,
      reason: "yield_to_critical_state_notice"
    });
  }

  return session;
}

export function syncBayportClinicWardIntroGuideSessionFromCommitReport(report) {
  ensureBayportClinicWardIntroGuideRegistration();

  if (hasSeenGuide()) {
    return bayportClinicWardIntroGuideController.getSessionSnapshot();
  }

  const after = report?.after || {};
  if (after.mapId !== TARGET_MAP_ID || String(after.criticalMode || "NORMAL") !== "NORMAL") {
    return bayportClinicWardIntroGuideController.getSessionSnapshot();
  }

  if (shouldStartGuide(report)) {
    return bayportClinicWardIntroGuideController.startSession({
      triggerSource: TRANSIENT_GUIDE_TRIGGER_SOURCES.ROUTE_ENTER
    });
  }

  const session = bayportClinicWardIntroGuideController.getSessionSnapshot();
  if (session.status === "idle" && session.sessionId) {
    return bayportClinicWardIntroGuideController.resumeSession();
  }
  return session;
}