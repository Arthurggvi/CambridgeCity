import { clampSceneTextFxConfig, getSceneTextFxDefaults } from "./scene_text_fx_defs.js";
import { hasAnimated } from "./scene_text_fx_state.js";
import { analyzeSceneText } from "./scene_text_pacing_analysis.js";
import { planSceneTextChunks } from "./scene_text_chunk_planner.js";

function isDiagnosticEnabled() {
  if (typeof window === "undefined") return false;
  if (window.__SCENE_TEXT_PACING_DIAGNOSTIC__ === true) return true;
  try {
    return window.localStorage?.getItem("sceneTextFxDiagnostic") === "1";
  } catch (_error) {
    return false;
  }
}

function normalizeMainText(rawText) {
  return String(rawText || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]*\n[ ]*/g, "\n")
    .trim();
}

function hashFNV1a32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function buildSceneTextContentSignature(rawText) {
  const normalizedText = normalizeMainText(rawText);
  if (!normalizedText) {
    return {
      normalizedText: "",
      hash: ""
    };
  }
  return {
    normalizedText,
    hash: hashFNV1a32(normalizedText)
  };
}

export function buildSceneTextFxKey({ mapId, sceneAnchor, hash }) {
  const normalizedMapId = String(mapId || "unknown_map").trim() || "unknown_map";
  const normalizedAnchor = String(sceneAnchor || mapId || "main").trim() || String(mapId || "main").trim() || "main";
  const normalizedHash = String(hash || "").trim();
  if (!normalizedHash) return "";
  return `sceneTextFx:${normalizedMapId}:${normalizedAnchor}:${normalizedHash}`;
}

function staticTimings(config) {
  return {
    leadHoldMs: 0,
    bodyExpandMs: 0,
    tailExpandMs: 0,
    tailStartDelayMs: 0,
    actionsDelayMs: 0,
    actionsRevealMs: 0,
    bodyLineEstimate: 0,
    tailLineEstimate: 0,
    skipOnPointer: config.skipOnPointer,
    skipOnWheel: config.skipOnWheel,
    skipOnKey: config.skipOnKey,
    reducedMotionBehavior: config.reducedMotionBehavior
  };
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampFloat(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function resolvePacingMode(analysis) {
  const weightedCharCount = Number(analysis?.weightedCharCount || 0);
  const paragraphCount = Number(analysis?.paragraphCount || 1);
  const sentenceCount = Number(analysis?.sentenceCount || 1);
  const infoTailLineCount = Number(analysis?.infoTailLineCount || 0);
  const score = Number(analysis?.readingLoadScore || 0);

  if (weightedCharCount <= 42) return "instant";
  if (paragraphCount === 1 && sentenceCount <= 2 && infoTailLineCount === 0) return "instant";

  if (score <= 18) return "instant";
  if (score <= 42) return "soft_focus";
  if (score <= 68) return "guided_flow";
  return "staged_read";
}

function buildAnimatedTimings(config, analysis, chunkPlan, mode) {
  const score = Number(analysis?.readingLoadScore || 0);
  const leadChars = Number(chunkPlan?.leadChars || 0);
  const bodyChars = Number(chunkPlan?.bodyChars || 0);
  const tailChars = Number(chunkPlan?.tailChars || 0);
  const infoTailLineCount = Number(analysis?.infoTailLineCount || 0);
  const hasTail = chunkPlan?.tailLayerRequested === true;
  const bodyLineEstimate = Math.max(0, Math.ceil(bodyChars / 24));
  const tailLineEstimate = Math.max(0, Math.ceil(tailChars / 22));

  let leadHoldMs = clampInt(260 + leadChars * 4.8 + score * 3.2, 320, 920, 520);
  let bodyExpandMs = clampInt(380 + bodyLineEstimate * 58 + score * 4.5, 520, 1500, 760);
  let tailExpandMs = hasTail ? clampInt(260 + tailLineEstimate * 64 + score * 3.2, 340, 980, 520) : 0;
  let tailStartDelayMs = hasTail ? clampInt(bodyExpandMs * 0.72, 260, 520, 360) : 0;
  let actionsDelayMs = clampInt(180 + score * 1.4 + infoTailLineCount * 24, 220, 420, 280);
  let actionsRevealMs = clampInt(180 + score * 0.8, 180, 280, 210);

  if (mode === "instant") {
    actionsDelayMs = 140;
    actionsRevealMs = 180;
  }

  if (mode === "guided_flow") {
    bodyExpandMs = clampInt(bodyExpandMs * 1.08, 520, 1500, bodyExpandMs);
    tailStartDelayMs = hasTail ? clampInt(tailStartDelayMs + 30, 260, 520, tailStartDelayMs) : 0;
    actionsDelayMs = clampInt(actionsDelayMs + 30, 220, 420, actionsDelayMs);
  }

  if (mode === "staged_read") {
    leadHoldMs = clampInt(leadHoldMs * 1.1, 320, 920, leadHoldMs);
    bodyExpandMs = clampInt(bodyExpandMs * 1.18, 520, 1500, bodyExpandMs);
    tailExpandMs = hasTail ? clampInt(tailExpandMs * 1.12, 340, 980, tailExpandMs) : 0;
    tailStartDelayMs = hasTail ? clampInt(tailStartDelayMs + 50, 260, 520, tailStartDelayMs) : 0;
    actionsDelayMs = clampInt(actionsDelayMs + 50, 220, 420, actionsDelayMs);
  }

  return {
    leadHoldMs,
    bodyExpandMs,
    tailExpandMs,
    tailStartDelayMs,
    actionsDelayMs: mode === "instant"
      ? 140
      : clampInt(actionsDelayMs, 220, 420, 280),
    actionsRevealMs: mode === "instant"
      ? 180
      : clampInt(actionsRevealMs, 180, 280, 210),
    bodyLineEstimate,
    tailLineEstimate,
    skipOnPointer: config.skipOnPointer,
    skipOnWheel: config.skipOnWheel,
    skipOnKey: config.skipOnKey,
    reducedMotionBehavior: config.reducedMotionBehavior
  };
}

function buildVisuals(analysis, chunkPlan, mode, timings) {
  const score = Number(analysis?.readingLoadScore || 0);
  const hasTail = chunkPlan?.tailLayerRequested === true;
  const bodyLayerRequested = chunkPlan?.bodyLayerRequested === true;
  let bodyPreviewLines = 3;
  let tailPreviewLines = 1;

  if (mode === "guided_flow") bodyPreviewLines = 2;
  if (mode === "staged_read") {
    bodyPreviewLines = score >= 85 ? 1 : 2;
  }

  if (mode === "instant") {
    bodyPreviewLines = 0;
    tailPreviewLines = 0;
  }

  if (!bodyLayerRequested) {
    bodyPreviewLines = 0;
    tailPreviewLines = 0;
  }

  return {
    bodyPreviewLines,
    tailPreviewLines,
    bodyPreviewOpacity: 0.78,
    tailPreviewOpacity: 0.68,
    bodyExpandedOpacity: 1,
    tailExpandedOpacity: 1,
    bodyMaskStrength: 0.72,
    tailMaskStrength: 0.78,
    leadInitialOpacity: 1,
    maxTranslatePx: 2,
    bodyLineEstimate: timings?.bodyLineEstimate || 0,
    tailLineEstimate: timings?.tailLineEstimate || 0,
    hasTail,
    bodyLayerRequested,
    tailLayerRequested: hasTail
  };
}

export function resolveSceneTextFxPolicy(input = {}) {
  const config = clampSceneTextFxConfig(input.config || getSceneTextFxDefaults());
  const pageType = String(input.pageType || "");
  const uiPage = String(input.uiPage || "");
  const isOverlay = !!input.isOverlay;
  const reducedMotion = !!input.reducedMotion;
  const diagnostic = isDiagnosticEnabled();
  const signature = input.contentSignature && typeof input.contentSignature === "object"
    ? input.contentSignature
    : buildSceneTextContentSignature(input.descriptionText || "");

  const contentKey = buildSceneTextFxKey({
    mapId: input.mapId,
    sceneAnchor: input.sceneAnchor,
    hash: signature.hash
  });

  const disabledResult = {
    allowSceneTextFx: false,
    contentKey,
    shouldAnimate: false,
    revealMode: "static",
    timings: staticTimings(config),
    reason: "disabled"
  };

  if (!config.enabled) return disabledResult;
  if (pageType !== "map" || uiPage !== "map") {
    return { ...disabledResult, reason: "not_map_main" };
  }
  if (isOverlay) {
    return { ...disabledResult, reason: "overlay_open" };
  }
  if (!contentKey && !diagnostic) {
    return { ...disabledResult, reason: "missing_content_key" };
  }

  const normalizedFinalText = String(signature.normalizedText || input.descriptionText || "");

  let analysis;
  let chunkPlan;
  let plannerReason = "normal_split";
  let bodyLayerRequested = false;
  let tailLayerRequested = false;
  let bodyEstimatedLines = 0;
  let tailEstimatedLines = 0;
  let mode;
  let timings;
  let visuals;

  try {
    analysis = analyzeSceneText(normalizedFinalText);
    mode = resolvePacingMode(analysis);
    chunkPlan = planSceneTextChunks(normalizedFinalText, analysis);
    plannerReason = String(chunkPlan?.plannerReason || "normal_split");
    bodyEstimatedLines = Math.max(0, Number(chunkPlan?.bodyEstimatedLines || Math.ceil(Number(chunkPlan?.bodyChars || 0) / 26)));
    tailEstimatedLines = Math.max(0, Number(chunkPlan?.tailEstimatedLines || Math.ceil(Number(chunkPlan?.tailChars || 0) / 26)));
    bodyLayerRequested = bodyEstimatedLines >= 2;
    tailLayerRequested = tailEstimatedLines >= 2;

    if (!tailLayerRequested && String(chunkPlan?.tailText || "").trim()) {
      const mergedBody = [String(chunkPlan?.bodyText || "").trim(), String(chunkPlan?.tailText || "").trim()]
        .filter(Boolean)
        .join("\n\n");
      chunkPlan = {
        ...chunkPlan,
        bodyText: mergedBody,
        tailText: "",
        hasTail: false,
        bodyChars: Math.max(0, Number(chunkPlan?.bodyChars || 0) + Number(chunkPlan?.tailChars || 0)),
        tailChars: 0,
        bodyEstimatedLines: Math.max(0, Math.ceil((Math.max(0, Number(chunkPlan?.bodyChars || 0) + Number(chunkPlan?.tailChars || 0))) / 26)),
        tailEstimatedLines: 0,
        plannerReason: plannerReason === "normal_split" ? "tail_merged_into_body" : plannerReason,
        tailLayerRequested: false
      };
      plannerReason = String(chunkPlan.plannerReason || plannerReason);
      bodyEstimatedLines = Number(chunkPlan.bodyEstimatedLines || bodyEstimatedLines);
      tailEstimatedLines = 0;
      tailLayerRequested = false;
      bodyLayerRequested = bodyEstimatedLines >= 2;
    }

    chunkPlan = {
      ...chunkPlan,
      plannerReason,
      bodyEstimatedLines,
      tailEstimatedLines,
      bodyLayerRequested,
      tailLayerRequested
    };

    timings = buildAnimatedTimings(config, analysis, chunkPlan, mode);
    visuals = buildVisuals(analysis, chunkPlan, mode, timings);
  } catch (_error) {
    return {
      allowSceneTextFx: true,
      contentKey: contentKey || `sceneTextFx:diagnostic:${String(input.mapId || "map")}:main`,
      shouldAnimate: false,
      revealMode: "static",
      timings: staticTimings(config),
      reason: "first_seen_fallback",
      plannerReason: "text_too_short_for_visible_body_layering",
      bodyEstimatedLines: 0,
      tailEstimatedLines: 0,
      bodyLayerRequested: false,
      tailLayerRequested: false
    };
  }

  if (diagnostic) {
    const hasTail = chunkPlan?.hasTail === true;
    return {
      allowSceneTextFx: true,
      contentKey: contentKey || `sceneTextFx:diagnostic:${String(input.mapId || "map")}:main`,
      shouldAnimate: true,
      revealMode: "diagnostic_window",
      mode: "diagnostic",
      analysis,
      chunkPlan,
      plannerReason,
      bodyEstimatedLines,
      tailEstimatedLines,
      bodyLayerRequested,
      tailLayerRequested,
      runtimeRootEnabled: true,
      timings: {
        leadHoldMs: 1600,
        bodyExpandMs: 3200,
        tailExpandMs: hasTail ? 1800 : 0,
        tailStartDelayMs: hasTail ? 1500 : 0,
        actionsDelayMs: 1000,
        actionsRevealMs: 450,
        bodyLineEstimate: Math.max(0, Math.ceil(Number(chunkPlan?.bodyChars || 0) / 24)),
        tailLineEstimate: Math.max(0, Math.ceil(Number(chunkPlan?.tailChars || 0) / 22)),
        skipOnPointer: config.skipOnPointer,
        skipOnWheel: config.skipOnWheel,
        skipOnKey: config.skipOnKey,
        reducedMotionBehavior: config.reducedMotionBehavior
      },
      visuals: {
        bodyPreviewLines: 1,
        tailPreviewLines: hasTail ? 1 : 0,
        bodyPreviewOpacity: 1,
        tailPreviewOpacity: 1,
        bodyExpandedOpacity: 1,
        tailExpandedOpacity: 1,
        bodyMaskStrength: 0.9,
        tailMaskStrength: 0.94,
        leadInitialOpacity: 1,
        maxTranslatePx: 2,
        hasTail,
        bodyLayerRequested,
        tailLayerRequested
      },
      reason: "diagnostic_forced",
      diagnostic: true
    };
  }

  if (hasAnimated({ sceneTextFxAnimated: input.animatedTable || {} }, contentKey)) {
    return {
      allowSceneTextFx: true,
      contentKey,
      shouldAnimate: false,
      revealMode: "static",
      timings: staticTimings(config),
      reason: "already_seen"
    };
  }

  if (reducedMotion) {
    return {
      allowSceneTextFx: true,
      contentKey,
      shouldAnimate: false,
      revealMode: "static",
      timings: staticTimings(config),
      reason: "first_seen_reduced_motion"
    };
  }

  return {
    allowSceneTextFx: true,
    contentKey,
    shouldAnimate: true,
    revealMode: "paragraph_fade",
    mode,
    analysis,
    chunkPlan,
    plannerReason,
    bodyEstimatedLines,
    tailEstimatedLines,
    bodyLayerRequested,
    tailLayerRequested,
    runtimeRootEnabled: false,
    timings,
    visuals,
    reason: "first_seen"
  };
}
