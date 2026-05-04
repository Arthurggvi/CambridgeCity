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
  ensureWinddykeThermalGuideEmphasisRegistration,
  resolveWinddykeThermalGuideNodes,
  WINDDYKE_THERMAL_GUIDE_EMPHASIS_TARGETS
} from "./transient/winddyke_thermal_guide_emphasis.js";
import { enqueueTransientIntent, registerTransientPresenter } from "./transient/transient_runtime.js";
import { getCanonicalMapId } from "../engine/map_context.js";

const GUIDE_ID = "winddyke_thermal_intro_guide";
const GUIDE_FLAG_GROUP = "sceneTutorials";
const GUIDE_FLAG_KEY = "winddyke_clinic_segment_thermal_intro";
const TARGET_MAP_ID = "winddyke_street_clinic_segment";
const WINDDYKE_THERMAL_STEP_TRANSIENT_TYPE = "winddyke_thermal_intro_guide_step";
const WINDDYKE_THERMAL_HINT_TRANSIENT_TYPE = "winddyke_thermal_intro_guide_hint";
const WINDDYKE_THERMAL_STEP_TOTAL = 3;
const WINDDYKE_THERMAL_STEP_TIMING = Object.freeze({
  inMs: 170,
  holdMs: 600000,
  outMs: 210
});
const WINDDYKE_THERMAL_HINT_TIMING = Object.freeze({
  inMs: 220,
  holdMs: 9200,
  outMs: 220
});

const GUIDE_COPY = Object.freeze({
  step1: {
    title: "认识温感卡",
    body: "这里显示的是你当前的体感状态。现在是‘舒适’，说明当前冷热压力不明显。",
    buttonLabel: "继续"
  },
  step2: {
    title: "查看服装",
    body: "衣物会直接影响你的保暖表现。需要调整冷热状态时，从这里查看服装。",
    buttonLabel: "继续"
  },
  step3: {
    title: "管理你的体温",
    body: "回到室内空间可以缓和你的体温",
    buttonLabel: "完成"
  },
  skip: "跳过引导",
  finalHint: "温感卡只显示你当前冷不冷、稳不稳定。需要调整冷热状态时，从卡内“查看服装”进入服装页。"
});

const WINDDYKE_THERMAL_GUIDE_STEPS = Object.freeze([
  {
    id: "thermal_card_overview",
    index: 1,
    title: GUIDE_COPY.step1.title,
    body: GUIDE_COPY.step1.body,
    buttonLabel: GUIDE_COPY.step1.buttonLabel,
    anchorTarget: WINDDYKE_THERMAL_GUIDE_EMPHASIS_TARGETS.THERMAL_CARD,
    optional: false
  },
  {
    id: "thermal_clothing_action",
    index: 2,
    title: GUIDE_COPY.step2.title,
    body: GUIDE_COPY.step2.body,
    buttonLabel: GUIDE_COPY.step2.buttonLabel,
    anchorTarget: WINDDYKE_THERMAL_GUIDE_EMPHASIS_TARGETS.THERMAL_CLOTHING_ACTION,
    optional: false
  },
  {
    id: "thermal_return_clinic_action",
    index: 3,
    title: GUIDE_COPY.step3.title,
    body: GUIDE_COPY.step3.body,
    buttonLabel: GUIDE_COPY.step3.buttonLabel,
    anchorTarget: WINDDYKE_THERMAL_GUIDE_EMPHASIS_TARGETS.THERMAL_RETURN_CLINIC_ACTION,
    optional: false
  }
]);

let didRegisterWinddykeThermalGuide = false;

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

function isUiBlocked(doc) {
  if (gameState.ui?.overlay) {
    return TRANSIENT_GUIDE_BLOCKER_REASONS.UI_OVERLAY_OPEN;
  }
  if (gameState.ui?.modal) {
    return TRANSIENT_GUIDE_BLOCKER_REASONS.UI_MODAL_OPEN;
  }
  if (doc?.getElementById("settings-overlay-root") || doc?.getElementById("modal-overlay")) {
    return TRANSIENT_GUIDE_BLOCKER_REASONS.UI_MODAL_OPEN;
  }
  if (doc?.querySelector([
    ".notice-dialog-overlay",
    ".inventory-overlay",
    ".tasks-overlay",
    ".SettingsOverlay",
    ".temp-smoke-report-overlay",
    ".inventory-detail-overlay",
    ".inventory-popover-overlay"
  ].join(","))) {
    return TRANSIENT_GUIDE_BLOCKER_REASONS.UI_OVERLAY_OPEN;
  }
  return "";
}

function buildWinddykeThermalStepIntent({ step, session }) {
  const descriptor = buildTransientGuideStepDescriptor({
    guideId: GUIDE_ID,
    sessionId: session.sessionId,
    stepId: step.id,
    stepIndex: step.index - 1,
    triggerSource: session.triggerSource || TRANSIENT_GUIDE_TRIGGER_SOURCES.ROUTE_ENTER,
    anchor: {
      kind: TRANSIENT_GUIDE_ANCHOR_KINDS.EMPHASIS_TARGET,
      target: step.anchorTarget
    },
    presentation: TRANSIENT_GUIDE_STEP_PRESENTATIONS.CARD_WITH_EMPHASIS,
    priority: TRANSIENT_PRIORITY.NORMAL,
    blocking: false,
    blockerBehavior: step.optional
      ? TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.SKIP_STEP
      : TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.PAUSE_SESSION,
    resumePolicy: TRANSIENT_GUIDE_RESUME_POLICIES.NONE,
    payload: {
      title: step.title,
      body: step.body,
      buttonLabel: step.buttonLabel,
      skipLabel: GUIDE_COPY.skip,
      stepNumber: step.index,
      stepTotal: WINDDYKE_THERMAL_STEP_TOTAL
    },
    timing: WINDDYKE_THERMAL_STEP_TIMING
  });

  return {
    id: `${GUIDE_ID}:${session.sessionId}:${step.id}`,
    type: WINDDYKE_THERMAL_STEP_TRANSIENT_TYPE,
    lane: "card",
    priority: TRANSIENT_PRIORITY.NORMAL,
    dedupeKey: `${GUIDE_ID}:${session.sessionId}`,
    emphasisTargets: [step.anchorTarget],
    timing: WINDDYKE_THERMAL_STEP_TIMING,
    payload: {
      descriptor,
      sessionId: session.sessionId,
      stepId: step.id,
      stepNumber: step.index,
      stepTotal: WINDDYKE_THERMAL_STEP_TOTAL,
      title: step.title,
      body: step.body,
      buttonLabel: step.buttonLabel,
      skipLabel: GUIDE_COPY.skip
    }
  };
}

function buildWinddykeFinalHintIntent() {
  return {
    id: `${GUIDE_ID}:final_hint:${Date.now()}`,
    type: WINDDYKE_THERMAL_HINT_TRANSIENT_TYPE,
    lane: "toast",
    priority: TRANSIENT_PRIORITY.LOW,
    dedupeKey: `${GUIDE_ID}:final_hint`,
    timing: WINDDYKE_THERMAL_HINT_TIMING,
    payload: {
      title: "体温提示",
      body: GUIDE_COPY.finalHint
    }
  };
}

function enqueueWinddykeFinalHint() {
  enqueueTransientIntent(buildWinddykeFinalHintIntent());
}

function getCurrentCriticalMode() {
  const isDeadMode = gameState?.player?.exposure?.dead === true;
  const sleepMode = String(gameState?.player?.meta?.sleepEpisode?.mode || "").trim().toUpperCase();
  return isDeadMode ? "DEAD" : (sleepMode === "COLLAPSE" ? "COLLAPSE" : "NORMAL");
}

function isWinddykeThermalGuideCurrentStateEligible() {
  return getCanonicalMapId(gameState) === TARGET_MAP_ID
    && hasSeenGuide() !== true
    && getCurrentCriticalMode() === "NORMAL";
}

function resolveWinddykeThermalGuideBlocker({ step }) {
  const doc = getDocumentRoot();

  if (getCanonicalMapId(gameState) !== TARGET_MAP_ID) {
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

  const nodes = resolveWinddykeThermalGuideNodes(step.anchorTarget, { documentRoot: doc });
  if (nodes.length <= 0) {
    return {
      blocked: true,
      reason: TRANSIENT_GUIDE_BLOCKER_REASONS.GUIDE_ANCHOR_MISSING,
      behavior: step.optional
        ? TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.SKIP_STEP
        : TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.PAUSE_SESSION
    };
  }

  return null;
}

const winddykeThermalGuideController = createTransientGuideSessionController({
  guideId: GUIDE_ID,
  steps: WINDDYKE_THERMAL_GUIDE_STEPS,
  resumePolicy: TRANSIENT_GUIDE_RESUME_POLICIES.NONE,
  buildStepIntent: ({ step, session }) => buildWinddykeThermalStepIntent({ step, session }),
  resolveStepBlocker: ({ step }) => resolveWinddykeThermalGuideBlocker({ step }),
  onSessionComplete: () => {
    markGuideSeen();
    enqueueWinddykeFinalHint();
  },
  onSessionSkip: () => {
    markGuideSeen();
    enqueueWinddykeFinalHint();
  }
});

function normalizeWinddykeThermalGuidePayload(payload = {}) {
  return {
    sessionId: String(payload?.sessionId || "").trim(),
    stepId: String(payload?.stepId || "").trim(),
    title: String(payload?.title || "").trim(),
    body: String(payload?.body || "").trim(),
    buttonLabel: String(payload?.buttonLabel || "继续").trim() || "继续",
    skipLabel: String(payload?.skipLabel || GUIDE_COPY.skip).trim() || GUIDE_COPY.skip,
    stepNumber: Math.max(1, Math.trunc(Number(payload?.stepNumber || 1))),
    stepTotal: Math.max(1, Math.trunc(Number(payload?.stepTotal || WINDDYKE_THERMAL_STEP_TOTAL)))
  };
}

function renderWinddykeThermalGuidePresenter({ payload, itemRoot, documentRoot }) {
  const doc = documentRoot || getDocumentRoot();
  if (!doc || !itemRoot) return null;

  const presenterPayload = normalizeWinddykeThermalGuidePayload(payload);
  itemRoot.classList.add("winddyke-thermal-guide-transient");

  const frame = doc.createElement("article");
  frame.className = "winddyke-thermal-guide-frame";
  frame.setAttribute("role", "dialog");
  frame.setAttribute("aria-modal", "false");
  frame.setAttribute("aria-label", "风堤街诊所路段体温引导");

  const header = doc.createElement("div");
  header.className = "winddyke-thermal-guide-header";

  const step = doc.createElement("div");
  step.className = "winddyke-thermal-guide-step";
  step.textContent = `${presenterPayload.stepNumber} / ${presenterPayload.stepTotal}`;

  const skipButton = doc.createElement("button");
  skipButton.type = "button";
  skipButton.className = "winddyke-thermal-guide-skip";
  skipButton.textContent = presenterPayload.skipLabel;

  const title = doc.createElement("h3");
  title.className = "winddyke-thermal-guide-title";
  title.textContent = presenterPayload.title;

  const body = doc.createElement("p");
  body.className = "winddyke-thermal-guide-body";
  body.textContent = presenterPayload.body;

  const footer = doc.createElement("div");
  footer.className = "winddyke-thermal-guide-footer";

  const nextButton = doc.createElement("button");
  nextButton.type = "button";
  nextButton.className = "winddyke-thermal-guide-next";
  nextButton.textContent = presenterPayload.buttonLabel;

  skipButton.onclick = () => {
    skipButton.disabled = true;
    skipWinddykeThermalGuideSession({
      sessionId: presenterPayload.sessionId,
      reason: "user_skipped"
    });
  };

  nextButton.onclick = () => {
    nextButton.disabled = true;
    advanceWinddykeThermalGuideSession({
      sessionId: presenterPayload.sessionId,
      stepId: presenterPayload.stepId
    });
  };

  header.appendChild(step);
  header.appendChild(skipButton);
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

function renderWinddykeThermalHintPresenter({ payload, itemRoot, documentRoot }) {
  const doc = documentRoot || getDocumentRoot();
  if (!doc || !itemRoot) return null;

  itemRoot.classList.add("winddyke-thermal-guide-hint-transient");

  const frame = doc.createElement("section");
  frame.className = "winddyke-thermal-guide-hint-frame";
  frame.setAttribute("role", "status");
  frame.setAttribute("aria-live", "polite");

  const title = doc.createElement("div");
  title.className = "winddyke-thermal-guide-hint-title";
  title.textContent = String(payload?.title || "体温提示").trim() || "体温提示";

  const body = doc.createElement("p");
  body.className = "winddyke-thermal-guide-hint-body";
  body.textContent = String(payload?.body || "").trim();

  frame.appendChild(title);
  frame.appendChild(body);
  itemRoot.appendChild(frame);

  return {
    signalTarget: frame
  };
}

function shouldStartWinddykeThermalGuide(report) {
  const before = report?.before || {};
  const after = report?.after || {};
  return before.mapId !== TARGET_MAP_ID
    && after.mapId === TARGET_MAP_ID
    && after.winddykeThermalGuideSeen !== true
    && String(after.criticalMode || "NORMAL") === "NORMAL";
}

export function ensureWinddykeThermalGuideRegistration() {
  if (didRegisterWinddykeThermalGuide) return true;

  registerTransientPresenter(WINDDYKE_THERMAL_STEP_TRANSIENT_TYPE, {
    render: renderWinddykeThermalGuidePresenter
  });
  registerTransientPresenter(WINDDYKE_THERMAL_HINT_TRANSIENT_TYPE, {
    render: renderWinddykeThermalHintPresenter
  });
  ensureWinddykeThermalGuideEmphasisRegistration();

  didRegisterWinddykeThermalGuide = true;
  return true;
}

export function advanceWinddykeThermalGuideSession({ sessionId = "", stepId = "" } = {}) {
  return winddykeThermalGuideController.nextStep({ sessionId, stepId });
}

export function dismissWinddykeThermalGuideSession({ sessionId = "", reason = "guide_session_dismissed" } = {}) {
  return winddykeThermalGuideController.dismissSession({ sessionId, reason });
}

export function skipWinddykeThermalGuideSession({ sessionId = "", reason = "guide_session_skipped" } = {}) {
  return winddykeThermalGuideController.skipSession({ sessionId, reason });
}

export function getWinddykeThermalGuideSessionSnapshot() {
  return winddykeThermalGuideController.getSessionSnapshot();
}

// Concurrency rule: winddyke guide yields before critical-state card enqueue and dismisses on route leave.
export function prepareWinddykeThermalGuideSessionFromCommitReport(report) {
  const session = winddykeThermalGuideController.getSessionSnapshot();
  if (!session.sessionId || (session.status !== "active" && session.status !== "idle")) {
    return session;
  }

  const after = report?.after || {};
  if (after.mapId !== TARGET_MAP_ID) {
    return winddykeThermalGuideController.dismissSession({
      sessionId: session.sessionId,
      reason: "winddyke_route_left"
    });
  }

  if (String(after.criticalMode || "NORMAL") !== "NORMAL") {
    return winddykeThermalGuideController.dismissSession({
      sessionId: session.sessionId,
      reason: "yield_to_critical_state_notice"
    });
  }

  return session;
}

export function syncWinddykeThermalGuideSessionFromCommitReport(report) {
  ensureWinddykeThermalGuideRegistration();

  if (hasSeenGuide()) {
    return winddykeThermalGuideController.getSessionSnapshot();
  }

  const after = report?.after || {};
  if (after.mapId !== TARGET_MAP_ID || String(after.criticalMode || "NORMAL") !== "NORMAL") {
    return winddykeThermalGuideController.getSessionSnapshot();
  }

  if (shouldStartWinddykeThermalGuide(report)) {
    return winddykeThermalGuideController.startSession({
      triggerSource: TRANSIENT_GUIDE_TRIGGER_SOURCES.ROUTE_ENTER
    });
  }

  const session = winddykeThermalGuideController.getSessionSnapshot();
  if (session.status === "idle" && session.sessionId) {
    return winddykeThermalGuideController.resumeSession();
  }
  return session;
}

export function ensureWinddykeThermalGuideForCurrentState({
  triggerSource = TRANSIENT_GUIDE_TRIGGER_SOURCES.EXPLICIT_SIGNAL
} = {}) {
  ensureWinddykeThermalGuideRegistration();

  if (!isWinddykeThermalGuideCurrentStateEligible()) {
    return winddykeThermalGuideController.getSessionSnapshot();
  }

  const session = winddykeThermalGuideController.getSessionSnapshot();
  if (session.status === "active") {
    return session;
  }

  if (session.status === "idle" && session.sessionId) {
    return winddykeThermalGuideController.resumeSession();
  }

  return winddykeThermalGuideController.startSession({
    triggerSource
  });
}