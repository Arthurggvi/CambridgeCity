import { cancelTransientIntent, enqueueTransientIntent } from "./transient_runtime.js";
import {
  TRANSIENT_GUIDE_BLOCKER_BEHAVIOR,
  TRANSIENT_GUIDE_RESUME_POLICIES,
  TRANSIENT_GUIDE_SESSION_TERMINATION
} from "./transient_guide_session_contract.js";

function createGuideSessionId(guideId) {
  const normalizedGuideId = String(guideId || "guide").trim() || "guide";
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${normalizedGuideId}:${Date.now()}:${randomPart}`;
}

function normalizeSteps(steps) {
  return Array.isArray(steps)
    ? steps.filter((step) => step && typeof step === "object" && String(step.id || "").trim())
    : [];
}

export function createTransientGuideSessionController({
  guideId = "",
  steps = [],
  resumePolicy = TRANSIENT_GUIDE_RESUME_POLICIES.NONE,
  buildStepIntent = null,
  resolveStepBlocker = null,
  onSessionComplete = null,
  onSessionDismiss = null,
  onSessionSkip = null
} = {}) {
  const normalizedGuideId = String(guideId || "").trim();
  const normalizedSteps = normalizeSteps(steps);
  if (!normalizedGuideId) {
    throw new Error("transient_guide_session_controller_guide_id_required");
  }
  if (typeof buildStepIntent !== "function") {
    throw new Error(`transient_guide_session_controller_build_intent_required:${normalizedGuideId}`);
  }

  const state = {
    guideId: normalizedGuideId,
    status: "idle",
    sessionId: "",
    stepIndex: -1,
    currentStepId: "",
    currentIntentId: "",
    triggerSource: "",
    blockerReason: "",
    lastTermination: "",
    lastReason: "",
    resumePolicy: String(resumePolicy || TRANSIENT_GUIDE_RESUME_POLICIES.NONE).trim().toLowerCase()
  };

  function getCurrentStep() {
    if (state.stepIndex < 0 || state.stepIndex >= normalizedSteps.length) {
      return null;
    }
    return normalizedSteps[state.stepIndex] || null;
  }

  function getSessionSnapshot() {
    return {
      guideId: state.guideId,
      status: state.status,
      sessionId: state.sessionId,
      stepIndex: state.stepIndex,
      currentStepId: state.currentStepId,
      currentIntentId: state.currentIntentId,
      triggerSource: state.triggerSource,
      blockerReason: state.blockerReason,
      lastTermination: state.lastTermination,
      lastReason: state.lastReason,
      resumePolicy: state.resumePolicy,
      stepCount: normalizedSteps.length
    };
  }

  function cancelCurrentIntent(reason = "guide_session_cancel") {
    if (!state.currentIntentId) return;
    cancelTransientIntent(state.currentIntentId, reason);
    state.currentIntentId = "";
  }

  function setBlocked(reason = "") {
    state.status = "idle";
    state.blockerReason = String(reason || "").trim();
  }

  function finalizeSession(termination, reason = "") {
    cancelCurrentIntent(`guide_session_${termination}`);
    state.blockerReason = "";
    state.lastTermination = String(termination || "").trim();
    state.lastReason = String(reason || "").trim();

    if (termination === TRANSIENT_GUIDE_SESSION_TERMINATION.COMPLETE) {
      state.status = "completed";
      onSessionComplete?.(getSessionSnapshot());
      return getSessionSnapshot();
    }

    if (termination === TRANSIENT_GUIDE_SESSION_TERMINATION.SKIP) {
      state.status = "completed";
      onSessionSkip?.(getSessionSnapshot());
      return getSessionSnapshot();
    }

    state.status = "dismissed";
    onSessionDismiss?.(getSessionSnapshot());
    return getSessionSnapshot();
  }

  function tryPresentCurrentStep(context = {}) {
    const step = getCurrentStep();
    if (!step) {
      return finalizeSession(TRANSIENT_GUIDE_SESSION_TERMINATION.COMPLETE, "guide_steps_finished");
    }

    const snapshot = getSessionSnapshot();
    const blocker = typeof resolveStepBlocker === "function"
      ? resolveStepBlocker({ step, session: snapshot, context })
      : null;

    if (blocker?.blocked) {
      const behavior = String(blocker.behavior || "").trim().toLowerCase();
      const blockerReason = String(blocker.reason || "").trim();
      if (behavior === TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.SKIP_STEP) {
        state.stepIndex += 1;
        state.currentStepId = normalizedSteps[state.stepIndex]?.id || "";
        state.currentIntentId = "";
        return tryPresentCurrentStep(context);
      }
      if (behavior === TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.CANCEL_SESSION) {
        return finalizeSession(TRANSIENT_GUIDE_SESSION_TERMINATION.DISMISS, blockerReason || "guide_session_cancelled");
      }
      state.currentStepId = step.id;
      state.currentIntentId = "";
      setBlocked(blockerReason);
      return getSessionSnapshot();
    }

    const intent = buildStepIntent({
      guideId: normalizedGuideId,
      step,
      session: snapshot,
      context
    });

    if (!intent || typeof intent !== "object") {
      return finalizeSession(TRANSIENT_GUIDE_SESSION_TERMINATION.DISMISS, "guide_step_intent_missing");
    }

    state.status = "active";
    state.blockerReason = "";
    state.currentStepId = step.id;
    state.currentIntentId = String(intent.id || "").trim();
    enqueueTransientIntent(intent);
    return getSessionSnapshot();
  }

  function startSession({ triggerSource = "", context = {} } = {}) {
    state.sessionId = createGuideSessionId(normalizedGuideId);
    state.status = "idle";
    state.stepIndex = 0;
    state.currentStepId = normalizedSteps[0]?.id || "";
    state.currentIntentId = "";
    state.triggerSource = String(triggerSource || "").trim();
    state.blockerReason = "";
    state.lastTermination = "";
    state.lastReason = "";
    return tryPresentCurrentStep(context);
  }

  function resumeSession({ context = {} } = {}) {
    if (!state.sessionId || state.status !== "idle") {
      return getSessionSnapshot();
    }
    return tryPresentCurrentStep(context);
  }

  function nextStep({ sessionId = "", stepId = "", context = {} } = {}) {
    if (!state.sessionId || state.status !== "active") {
      return getSessionSnapshot();
    }
    if (sessionId && state.sessionId !== String(sessionId).trim()) {
      return getSessionSnapshot();
    }
    if (stepId && state.currentStepId !== String(stepId).trim()) {
      return getSessionSnapshot();
    }

    const isLastStep = state.stepIndex >= normalizedSteps.length - 1;
    cancelCurrentIntent("guide_step_advance");
    if (isLastStep) {
      return finalizeSession(TRANSIENT_GUIDE_SESSION_TERMINATION.COMPLETE, "guide_steps_finished");
    }

    state.stepIndex += 1;
    state.status = "idle";
    state.currentStepId = normalizedSteps[state.stepIndex]?.id || "";
    return tryPresentCurrentStep(context);
  }

  function dismissSession({ sessionId = "", reason = "guide_session_dismissed" } = {}) {
    if (!state.sessionId) {
      return getSessionSnapshot();
    }
    if (sessionId && state.sessionId !== String(sessionId).trim()) {
      return getSessionSnapshot();
    }
    return finalizeSession(TRANSIENT_GUIDE_SESSION_TERMINATION.DISMISS, reason);
  }

  function skipSession({ sessionId = "", reason = "guide_session_skipped" } = {}) {
    if (!state.sessionId) {
      return getSessionSnapshot();
    }
    if (sessionId && state.sessionId !== String(sessionId).trim()) {
      return getSessionSnapshot();
    }
    return finalizeSession(TRANSIENT_GUIDE_SESSION_TERMINATION.SKIP, reason);
  }

  function completeSession({ sessionId = "", reason = "guide_session_completed" } = {}) {
    if (!state.sessionId) {
      return getSessionSnapshot();
    }
    if (sessionId && state.sessionId !== String(sessionId).trim()) {
      return getSessionSnapshot();
    }
    return finalizeSession(TRANSIENT_GUIDE_SESSION_TERMINATION.COMPLETE, reason);
  }

  return {
    startSession,
    resumeSession,
    nextStep,
    dismissSession,
    skipSession,
    completeSession,
    getSessionSnapshot
  };
}