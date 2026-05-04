export const OVERLAY_TRANSITION_PRESETS = Object.freeze({
  softPanel: Object.freeze({
    name: "softPanel",
    duration: 170,
    easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
    enterKeyframes: Object.freeze([
      { opacity: 0, transform: "translateY(5px) scale(0.985)" },
      { opacity: 1, transform: "translateY(0px) scale(1)" }
    ]),
    exitKeyframes: Object.freeze([
      { opacity: 1, transform: "translateY(0px) scale(1)" },
      { opacity: 0, transform: "translateY(4px) scale(0.99)" }
    ])
  }),
  minimapPanel: Object.freeze({
    name: "minimapPanel",
    duration: 130,
    easing: "cubic-bezier(0.2, 0.64, 0.3, 1)",
    enterKeyframes: Object.freeze([
      { opacity: 0, transform: "translateY(4px) scale(0.99)" },
      { opacity: 1, transform: "translateY(0px) scale(1)" }
    ]),
    exitKeyframes: Object.freeze([
      { opacity: 1, transform: "translateY(0px) scale(1)" },
      { opacity: 0, transform: "translateY(3px) scale(0.995)" }
    ])
  })
});

export function getOverlayTransitionPreset(name) {
  const key = String(name || "").trim();
  return OVERLAY_TRANSITION_PRESETS[key] || OVERLAY_TRANSITION_PRESETS.softPanel;
}
