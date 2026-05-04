import { TRANSIENT_PRIORITY, normalizeTransientPriority } from "./transient_contract.js";

/**
 * Contract for future multi-step guide / onboarding sessions.
 *
 * Boundary:
 * - transient runtime keeps owning per-step card playback, emphasis activation, clear, and reduced-motion timing.
 * - guide session layer owns sequencing, resume, blocker waiting, active-step bookkeeping, and session termination semantics.
 * - do not encode multi-step sequencing directly into transient_runtime queues.
 */

export const TRANSIENT_GUIDE_SESSION_OWNER = "runtime/transient_guide_session";

export const TRANSIENT_GUIDE_TRIGGER_SOURCES = Object.freeze({
  ROUTE_ENTER: "route_enter",
  OVERLAY_OPEN: "overlay_open",
  EXPLICIT_SIGNAL: "explicit_signal",
  COMMIT_REPORT: "commit_report"
});

export const TRANSIENT_GUIDE_SESSION_TERMINATION = Object.freeze({
  DISMISS: "dismiss",
  COMPLETE: "complete",
  SKIP: "skip",
  CLEAR: "clear"
});

export const TRANSIENT_GUIDE_RESUME_POLICIES = Object.freeze({
  NONE: "none",
  FROM_START: "from_start",
  NEXT_PENDING_STEP: "next_pending_step"
});

export const TRANSIENT_GUIDE_BLOCKER_REASONS = Object.freeze({
  ROUTE_MISMATCH: "route_mismatch",
  NOTICE_DIALOG_OPEN: "notice_dialog_open",
  UI_MODAL_OPEN: "ui_modal_open",
  UI_OVERLAY_OPEN: "ui_overlay_open",
  GUIDE_ALREADY_SEEN: "guide_already_seen",
  GUIDE_SURFACE_MISSING: "guide_surface_missing",
  GUIDE_ANCHOR_MISSING: "guide_anchor_missing"
});

export const TRANSIENT_GUIDE_BLOCKER_BEHAVIOR = Object.freeze({
  PAUSE_SESSION: "pause_session",
  SKIP_STEP: "skip_step",
  CANCEL_SESSION: "cancel_session"
});

export const TRANSIENT_GUIDE_ANCHOR_KINDS = Object.freeze({
  EMPHASIS_TARGET: "emphasis_target"
});

export const TRANSIENT_GUIDE_STEP_PRESENTATIONS = Object.freeze({
  CARD_WITH_EMPHASIS: "card_with_emphasis",
  EMPHASIS_ONLY: "emphasis_only"
});

function normalizeGuideTriggerSource(triggerSource) {
  const value = String(triggerSource || "").trim().toLowerCase();
  if (Object.values(TRANSIENT_GUIDE_TRIGGER_SOURCES).includes(value)) {
    return value;
  }
  return TRANSIENT_GUIDE_TRIGGER_SOURCES.EXPLICIT_SIGNAL;
}

function normalizeGuideAnchor(anchor = {}) {
  const kind = String(anchor?.kind || "").trim().toLowerCase();
  const target = String(anchor?.target || "").trim();
  return {
    kind: kind === TRANSIENT_GUIDE_ANCHOR_KINDS.EMPHASIS_TARGET
      ? TRANSIENT_GUIDE_ANCHOR_KINDS.EMPHASIS_TARGET
      : TRANSIENT_GUIDE_ANCHOR_KINDS.EMPHASIS_TARGET,
    target
  };
}

function normalizeGuideStepPresentation(presentation) {
  const value = String(presentation || "").trim().toLowerCase();
  if (value === TRANSIENT_GUIDE_STEP_PRESENTATIONS.EMPHASIS_ONLY) {
    return TRANSIENT_GUIDE_STEP_PRESENTATIONS.EMPHASIS_ONLY;
  }
  return TRANSIENT_GUIDE_STEP_PRESENTATIONS.CARD_WITH_EMPHASIS;
}

function createSessionId(guideId) {
  const id = String(guideId || "guide").trim() || "guide";
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${id}:${Date.now()}:${randomPart}`;
}

/**
 * Build one normalized multi-step guide step descriptor.
 *
 * Contract notes:
 * - sessionId identifies one active playthrough; it survives across step advances and pause/resume.
 * - stepIndex is zero-based internal sequencing index.
 * - triggerSource records why this session was opened; presenter code must not infer it from DOM.
 * - dismiss: session paused without marking guide seen/completed.
 * - complete: final step acknowledged and guide marked completed.
 * - skip: user explicitly skips remaining steps and guide is marked completed.
 * - resumePolicy controls how a paused session continues next time.
 * - blockers pause the session by default; they do not auto-complete the guide.
 * - anchor uses abstract emphasis target keys only; selectors stay in emphasis adapters.
 * - emphasis-only steps are allowed by contract, but must be declared explicitly per step.
 * - high-priority / blocking steps are allowed by contract, but should be rare and justified by gameplay.
 */
export function buildTransientGuideStepDescriptor({
  guideId = "",
  sessionId = "",
  stepId = "",
  stepIndex = 0,
  triggerSource = TRANSIENT_GUIDE_TRIGGER_SOURCES.EXPLICIT_SIGNAL,
  anchor = {},
  presentation = TRANSIENT_GUIDE_STEP_PRESENTATIONS.CARD_WITH_EMPHASIS,
  priority = TRANSIENT_PRIORITY.NORMAL,
  blocking = false,
  blockerBehavior = TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.PAUSE_SESSION,
  resumePolicy = TRANSIENT_GUIDE_RESUME_POLICIES.NEXT_PENDING_STEP,
  payload = {},
  timing = {}
} = {}) {
  const normalizedGuideId = String(guideId || "").trim();
  if (!normalizedGuideId) {
    throw new Error("transient_guide_contract_guide_id_required");
  }

  const normalizedStepId = String(stepId || `step_${Math.max(0, Math.trunc(Number(stepIndex) || 0))}`).trim();
  const normalizedSessionId = String(sessionId || createSessionId(normalizedGuideId)).trim();
  const normalizedBlockerBehavior = String(blockerBehavior || "").trim().toLowerCase();
  const normalizedResumePolicy = String(resumePolicy || "").trim().toLowerCase();

  return {
    owner: TRANSIENT_GUIDE_SESSION_OWNER,
    guideId: normalizedGuideId,
    sessionId: normalizedSessionId,
    stepId: normalizedStepId,
    stepIndex: Math.max(0, Math.trunc(Number(stepIndex) || 0)),
    triggerSource: normalizeGuideTriggerSource(triggerSource),
    anchor: normalizeGuideAnchor(anchor),
    presentation: normalizeGuideStepPresentation(presentation),
    priority: normalizeTransientPriority(priority),
    blocking: blocking === true,
    blockerBehavior: Object.values(TRANSIENT_GUIDE_BLOCKER_BEHAVIOR).includes(normalizedBlockerBehavior)
      ? normalizedBlockerBehavior
      : TRANSIENT_GUIDE_BLOCKER_BEHAVIOR.PAUSE_SESSION,
    resumePolicy: Object.values(TRANSIENT_GUIDE_RESUME_POLICIES).includes(normalizedResumePolicy)
      ? normalizedResumePolicy
      : TRANSIENT_GUIDE_RESUME_POLICIES.NEXT_PENDING_STEP,
    payload: payload && typeof payload === "object" ? payload : {},
    timing: {
      inMs: Number.isFinite(Number(timing?.inMs)) ? Math.trunc(Number(timing.inMs)) : undefined,
      holdMs: Number.isFinite(Number(timing?.holdMs)) ? Math.trunc(Number(timing.holdMs)) : undefined,
      outMs: Number.isFinite(Number(timing?.outMs)) ? Math.trunc(Number(timing.outMs)) : undefined
    }
  };
}