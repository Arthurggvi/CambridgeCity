const DEFAULTS = Object.freeze({
  enabled: true,
  paragraphRevealMs: 220,
  paragraphStaggerMs: 18,
  containerFadeMs: 200,
  actionsDelayAfterTextMs: 160,
  actionsFadeMs: 180,
  skipOnPointer: true,
  skipOnWheel: true,
  skipOnKey: true,
  maxParagraphsForStagger: 5,
  reducedMotionBehavior: "static_sequence"
});

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function clampBool(value, fallback) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function clampReducedMotionBehavior(value) {
  const normalized = String(value || "").trim();
  return normalized === "static_sequence" ? "static_sequence" : "static_sequence";
}

export function getSceneTextFxDefaults() {
  return { ...DEFAULTS };
}

export function clampSceneTextFxConfig(raw = {}) {
  return {
    enabled: clampBool(raw.enabled, DEFAULTS.enabled),
    paragraphRevealMs: clampInt(raw.paragraphRevealMs, 180, 260, DEFAULTS.paragraphRevealMs),
    paragraphStaggerMs: clampInt(raw.paragraphStaggerMs, 8, 28, DEFAULTS.paragraphStaggerMs),
    containerFadeMs: clampInt(raw.containerFadeMs, 180, 280, DEFAULTS.containerFadeMs),
    actionsDelayAfterTextMs: clampInt(raw.actionsDelayAfterTextMs, 120, 220, DEFAULTS.actionsDelayAfterTextMs),
    actionsFadeMs: clampInt(raw.actionsFadeMs, 140, 220, DEFAULTS.actionsFadeMs),
    skipOnPointer: clampBool(raw.skipOnPointer, DEFAULTS.skipOnPointer),
    skipOnWheel: clampBool(raw.skipOnWheel, DEFAULTS.skipOnWheel),
    skipOnKey: clampBool(raw.skipOnKey, DEFAULTS.skipOnKey),
    maxParagraphsForStagger: clampInt(raw.maxParagraphsForStagger, 1, 12, DEFAULTS.maxParagraphsForStagger),
    reducedMotionBehavior: clampReducedMotionBehavior(raw.reducedMotionBehavior)
  };
}
