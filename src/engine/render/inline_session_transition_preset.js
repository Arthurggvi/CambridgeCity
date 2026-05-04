export const INLINE_SESSION_TRANSITION_PRESET = Object.freeze({
  enter: {
    slotMs: 250,
    contentMs: 200,
    contentDelayMs: 40,
    ease: "cubic-bezier(0.24, 0.74, 0.32, 1)"
  },
  phase: {
    contentMs: 160,
    contentDelayMs: 50,
    ease: "cubic-bezier(0.2, 0.72, 0.3, 1)"
  },
  exit: {
    contentMs: 160,
    collapseMs: 200,
    easeContent: "cubic-bezier(0.25, 0.64, 0.35, 1)",
    easeCollapse: "cubic-bezier(0.22, 0.66, 0.3, 1)"
  },
  offsets: {
    enterTranslateY: "10px",
    phaseTranslateY: "6px",
    exitTranslateY: "-6px"
  },
  blur: {
    enterFrom: "6px",
    phaseFrom: "4px",
    exitTo: "4px"
  },
  scale: {
    enterFrom: "0.985",
    enterTo: "1"
  }
});

function setVar(target, name, value) {
  if (!target || !target.style || value == null) return;
  target.style.setProperty(name, String(value));
}

export function applyInlineSessionTransitionVars(target, preset = INLINE_SESSION_TRANSITION_PRESET) {
  if (!target) return;
  setVar(target, "--session-enter-slot-ms", `${Math.max(0, Math.floor(Number(preset?.enter?.slotMs || 0)))}ms`);
  setVar(target, "--session-enter-content-ms", `${Math.max(0, Math.floor(Number(preset?.enter?.contentMs || 0)))}ms`);
  setVar(target, "--session-enter-content-delay-ms", `${Math.max(0, Math.floor(Number(preset?.enter?.contentDelayMs || 0)))}ms`);
  setVar(target, "--session-enter-ease", String(preset?.enter?.ease || "ease"));

  setVar(target, "--session-phase-ms", `${Math.max(0, Math.floor(Number(preset?.phase?.contentMs || 0)))}ms`);
  setVar(target, "--session-phase-delay-ms", `${Math.max(0, Math.floor(Number(preset?.phase?.contentDelayMs || 0)))}ms`);
  setVar(target, "--session-phase-ease", String(preset?.phase?.ease || "ease"));

  setVar(target, "--session-exit-content-ms", `${Math.max(0, Math.floor(Number(preset?.exit?.contentMs || 0)))}ms`);
  setVar(target, "--session-exit-collapse-ms", `${Math.max(0, Math.floor(Number(preset?.exit?.collapseMs || 0)))}ms`);
  setVar(target, "--session-exit-content-ease", String(preset?.exit?.easeContent || "ease"));
  setVar(target, "--session-exit-collapse-ease", String(preset?.exit?.easeCollapse || "ease"));

  setVar(target, "--session-enter-translate-y", String(preset?.offsets?.enterTranslateY || "10px"));
  setVar(target, "--session-phase-translate-y", String(preset?.offsets?.phaseTranslateY || "6px"));
  setVar(target, "--session-exit-translate-y", String(preset?.offsets?.exitTranslateY || "-6px"));

  setVar(target, "--session-enter-blur-from", String(preset?.blur?.enterFrom || "6px"));
  setVar(target, "--session-phase-blur-from", String(preset?.blur?.phaseFrom || "4px"));
  setVar(target, "--session-exit-blur-to", String(preset?.blur?.exitTo || "4px"));

  setVar(target, "--session-enter-scale-from", String(preset?.scale?.enterFrom || "0.985"));
  setVar(target, "--session-enter-scale-to", String(preset?.scale?.enterTo || "1"));
}

export function getInlineSessionHostTimerMs(preset = INLINE_SESSION_TRANSITION_PRESET) {
  const enter = Number(preset?.enter?.slotMs || 0);
  const phase = Number(preset?.phase?.contentMs || 0) + Number(preset?.phase?.contentDelayMs || 0);
  const exit = Number(preset?.exit?.contentMs || 0) + Number(preset?.exit?.collapseMs || 0);
  return {
    enterMs: Math.max(0, Math.floor(enter)),
    phaseMs: Math.max(0, Math.floor(phase)),
    exitMs: Math.max(0, Math.floor(exit))
  };
}
