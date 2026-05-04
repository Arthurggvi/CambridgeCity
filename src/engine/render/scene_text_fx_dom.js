import { readDebugFlag } from "../debug_flag_registry.js";
import { gameState } from "../state.js";
import { markViewed } from "../scene_text_fx_state.js";

function toDurationMs(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

function clampMs(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function logSceneTextExecutorProbe(event, payload = {}) {
  try {
    console.info("[SceneTextFxExecutorProbe]", {
      event,
      ...payload
    });
  } catch (_error) {
    // noop
  }
}

function startTrackedAnimationHandle(target, keyframes, options = {}, cleanups, meta = {}) {
  const duration = toDurationMs(options.duration, 0);
  const finalFrame = Array.isArray(keyframes) && keyframes.length > 0
    ? keyframes[keyframes.length - 1]
    : {};
  const label = String(meta.label || "animation");
  const sessionId = meta.sessionId ?? 0;
  const finalPlanType = meta.finalPlanType || null;

  logSceneTextExecutorProbe("animation_handle_started", {
    timestampMs: Math.round(nowMs()),
    sessionId,
    finalPlanType,
    label
  });

  if (!target || duration <= 0) {
    applyStaticFinalStyles(target, finalFrame);
    if (typeof meta.onFinish === "function") meta.onFinish();
    logSceneTextExecutorProbe("animation_handle_finished", {
      timestampMs: Math.round(nowMs()),
      sessionId,
      finalPlanType,
      label
    });
    return {
      finished: Promise.resolve(),
      cancel: () => {}
    };
  }

  let settled = false;
  let cancelled = false;
  let animation = null;
  let timer = null;

  let resolveFinished;
  let rejectFinished;
  const finished = new Promise((resolve, reject) => {
    resolveFinished = resolve;
    rejectFinished = reject;
  });

  const complete = () => {
    if (settled || cancelled) return;
    settled = true;
    applyStaticFinalStyles(target, finalFrame);
    if (typeof meta.onFinish === "function") meta.onFinish();
    logSceneTextExecutorProbe("animation_handle_finished", {
      timestampMs: Math.round(nowMs()),
      sessionId,
      finalPlanType,
      label
    });
    resolveFinished();
  };

  const cancel = () => {
    if (settled || cancelled) return;
    cancelled = true;
    if (animation) {
      animation.cancel();
    }
    if (timer != null) {
      clearTimeout(timer);
    }
    rejectFinished(new Error(`animation_handle_cancelled:${label}`));
  };

  if (typeof target.animate === "function") {
    animation = target.animate(keyframes, {
      duration,
      easing: String(options.easing || "ease"),
      fill: "forwards"
    });
    animation.finished.then(complete).catch(() => {});
  } else {
    timer = setTimeout(complete, duration);
  }

  if (Array.isArray(cleanups)) {
    cleanups.push(cancel);
  }

  return {
    finished,
    cancel
  };
}

function createAnimationHandleTracker(expectedCount, onAllFinished) {
  let finishedCount = 0;
  let allScheduled = false;
  let done = false;

  const maybeComplete = () => {
    if (done) return;
    if (!allScheduled) return;
    if (finishedCount < expectedCount) return;
    done = true;
    if (typeof onAllFinished === "function") onAllFinished();
  };

  return {
    register(handle) {
      if (!handle || !handle.finished) return;
      handle.finished.then(() => {
        finishedCount += 1;
        maybeComplete();
      }).catch(() => {});
    },
    markAllScheduled() {
      allScheduled = true;
      maybeComplete();
    }
  };
}

const _sceneTextRuntimeRootState = {
  rootEl: null,
  rootId: 0,
  rootSeq: 0,
  replacedCount: 0,
  activeLayer: null,
  lastSnapshot: {
    exists: false,
    attachedUnderApp: false,
    rootId: 0,
    replacedCount: 0,
    rect: null,
    sourceHidden: false,
    phase: "idle",
    actionsUnlockedAtMs: 0,
    geometryAudit: null
  }
};

const _sceneTextBoundaryAuditState = {
  dom_entry: null,
  normalizeChunkPlan_result: null,
  runtimeAudit_rawChunk: null
};

function toBoundaryAuditShape(source, payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const chunkPlan = data.chunkPlan && typeof data.chunkPlan === "object" ? data.chunkPlan : {};
  return {
    source: String(source || "unknown"),
    leadChars: Number(chunkPlan.leadChars || 0),
    bodyChars: Number(chunkPlan.bodyChars || 0),
    tailChars: Number(chunkPlan.tailChars || 0),
    leadTextLength: String(chunkPlan.leadText || "").trim().length,
    bodyTextLength: String(chunkPlan.bodyText || "").trim().length,
    tailTextLength: String(chunkPlan.tailText || "").trim().length,
    plannerReason: String(data.plannerReason || chunkPlan.plannerReason || ""),
    mode: String(data.mode || ""),
    shouldAnimate: data.shouldAnimate === true
  };
}

function updateBoundaryAuditState(partial) {
  if (!partial || typeof partial !== "object") return;
  _sceneTextBoundaryAuditState.dom_entry = partial.dom_entry || _sceneTextBoundaryAuditState.dom_entry;
  _sceneTextBoundaryAuditState.normalizeChunkPlan_result = partial.normalizeChunkPlan_result || _sceneTextBoundaryAuditState.normalizeChunkPlan_result;
  _sceneTextBoundaryAuditState.runtimeAudit_rawChunk = partial.runtimeAudit_rawChunk || _sceneTextBoundaryAuditState.runtimeAudit_rawChunk;
}

export function setSceneTextBoundaryAuditUpstreamSnapshot(payload = {}) {
  if (!payload || typeof payload !== "object") return;
  if (payload.renderer_callsite && typeof payload.renderer_callsite === "object") {
    // keep renderer-owned fields untouched in this module; caller exposes merged snapshot.
  }
}

export function getSceneTextBoundaryAuditSnapshot() {
  return {
    dom_entry: _sceneTextBoundaryAuditState.dom_entry,
    normalizeChunkPlan_result: _sceneTextBoundaryAuditState.normalizeChunkPlan_result,
    runtimeAudit_rawChunk: _sceneTextBoundaryAuditState.runtimeAudit_rawChunk
  };
}

function makeRectSnapshot(rect) {
  if (!rect) return null;
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function copyTypographyStyles(sourceEl, targetEl) {
  if (!sourceEl || !targetEl) return;
  const style = window.getComputedStyle(sourceEl);
  const copyProps = [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "lineHeight",
    "letterSpacing",
    "wordSpacing",
    "color",
    "textAlign",
    "textRendering",
    "webkitFontSmoothing",
    "whiteSpace"
  ];
  for (const prop of copyProps) {
    const value = style[prop];
    if (value != null && value !== "") {
      targetEl.style[prop] = value;
    }
  }
}

function ensureSceneTextRuntimeRoot(appHost) {
  if (!appHost) return null;

  if (!_sceneTextRuntimeRootState.rootEl) {
    const root = document.createElement("div");
    root.className = "scene-text-runtime-root";
    root.setAttribute("data-scene-text-runtime-root", "1");
    _sceneTextRuntimeRootState.rootId = ++_sceneTextRuntimeRootState.rootSeq;
    root.setAttribute("data-scene-text-runtime-root-id", String(_sceneTextRuntimeRootState.rootId));
    root.style.position = "absolute";
    root.style.left = "0";
    root.style.top = "0";
    root.style.width = "100%";
    root.style.height = "0";
    root.style.pointerEvents = "none";
    root.style.zIndex = "220";
    root.style.overflow = "visible";
    _sceneTextRuntimeRootState.rootEl = root;
  }

  const root = _sceneTextRuntimeRootState.rootEl;
  const hostStyle = window.getComputedStyle(appHost);
  if (hostStyle.position === "static") {
    appHost.style.position = "relative";
  }

  if (root.parentElement !== appHost) {
    const existing = appHost.querySelector(".scene-text-runtime-root");
    if (existing && existing !== root) {
      existing.remove();
      _sceneTextRuntimeRootState.replacedCount += 1;
    }
    appHost.appendChild(root);
  }

  const rootRect = root.getBoundingClientRect();
  _sceneTextRuntimeRootState.lastSnapshot = {
    ..._sceneTextRuntimeRootState.lastSnapshot,
    exists: true,
    attachedUnderApp: root.parentElement === appHost,
    rootId: _sceneTextRuntimeRootState.rootId,
    replacedCount: _sceneTextRuntimeRootState.replacedCount,
    rect: makeRectSnapshot(rootRect)
  };

  return root;
}

function startRuntimeRootLayer(appHost, sourceDescEl, contentText, stableMountWidth = null) {
  const root = ensureSceneTextRuntimeRoot(appHost);
  if (!root || !sourceDescEl) {
    return {
      enabled: false,
      fxHostEl: sourceDescEl,
      cleanup: () => {},
      markActionsUnlocked: () => {}
    };
  }

  if (_sceneTextRuntimeRootState.activeLayer && _sceneTextRuntimeRootState.activeLayer.parentNode) {
    _sceneTextRuntimeRootState.activeLayer.parentNode.removeChild(_sceneTextRuntimeRootState.activeLayer);
  }

  const appRect = appHost.getBoundingClientRect();
  const sourceRect = sourceDescEl.getBoundingClientRect();
  // Prefer the pre-computed stable width from the caller (resolved before mount,
  // from the target layout state, not from a live rect mid-transition).
  // Fall back to live rect only when no stable value is supplied.
  const mountWidth = (typeof stableMountWidth === "number" && stableMountWidth > 0)
    ? stableMountWidth
    : Math.max(0, Math.round(sourceRect.width));
  const layer = document.createElement("div");
  layer.className = "scene-text-runtime-layer";
  layer.style.position = "absolute";
  layer.style.left = `${Math.round(sourceRect.left - appRect.left)}px`;
  layer.style.top = `${Math.round(sourceRect.top - appRect.top)}px`;
  layer.style.width = `${mountWidth}px`;
  layer.style.minHeight = `${Math.max(0, Math.round(sourceRect.height))}px`;
  layer.style.pointerEvents = "none";
  layer.style.background = "transparent";

  const mirror = document.createElement("div");
  mirror.className = "scene-text-runtime-desc";
  mirror.style.margin = "0";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.pointerEvents = "none";
  copyTypographyStyles(sourceDescEl, mirror);
  mirror.textContent = String(contentText || sourceDescEl.textContent || "");

  layer.appendChild(mirror);
  root.appendChild(layer);
  _sceneTextRuntimeRootState.activeLayer = layer;

  sourceDescEl.dataset.sceneTextRuntimeSourceHidden = "1";
  sourceDescEl.style.visibility = "hidden";

  const updateSnapshot = (phase, actionsUnlockedAtMs = 0) => {
    const rect = layer.getBoundingClientRect();
    _sceneTextRuntimeRootState.lastSnapshot = {
      ..._sceneTextRuntimeRootState.lastSnapshot,
      exists: true,
      attachedUnderApp: root.parentElement === appHost,
      rootId: _sceneTextRuntimeRootState.rootId,
      replacedCount: _sceneTextRuntimeRootState.replacedCount,
      rect: makeRectSnapshot(rect),
      sourceHidden: sourceDescEl.style.visibility === "hidden",
      phase: String(phase || "running"),
      actionsUnlockedAtMs
    };
  };
  updateSnapshot("mounted", 0);

  return {
    enabled: true,
    runtimeRootEl: root,
    runtimeLayerEl: layer,
    fxHostEl: mirror,
    cleanup: (phase = "done", actionsUnlockedAtMs = 0) => {
      sourceDescEl.style.removeProperty("visibility");
      delete sourceDescEl.dataset.sceneTextRuntimeSourceHidden;
      if (layer.parentNode) {
        layer.parentNode.removeChild(layer);
      }
      if (_sceneTextRuntimeRootState.activeLayer === layer) {
        _sceneTextRuntimeRootState.activeLayer = null;
      }
      _sceneTextRuntimeRootState.lastSnapshot = {
        ..._sceneTextRuntimeRootState.lastSnapshot,
        sourceHidden: false,
        phase,
        actionsUnlockedAtMs
      };
    },
    markPhase: (phase) => updateSnapshot(phase, _sceneTextRuntimeRootState.lastSnapshot.actionsUnlockedAtMs || 0),
    markActionsUnlocked: (atMs) => updateSnapshot("actions_unlocked", atMs)
  };
}

export function getSceneTextRuntimeRootSnapshot() {
  return {
    ..._sceneTextRuntimeRootState.lastSnapshot,
    active: !!_sceneTextRuntimeRootState.activeLayer,
    rootConnected: !!_sceneTextRuntimeRootState.rootEl?.isConnected
  };
}

function getSceneTextActionsTraceStore() {
  if (typeof window === "undefined") return null;
  if (!Array.isArray(window.__sceneTextActionsTrace)) {
    window.__sceneTextActionsTrace = [];
  }
  if (!Number.isFinite(window.__sceneTextActionsTraceSeq)) {
    window.__sceneTextActionsTraceSeq = 0;
  }
  return window.__sceneTextActionsTrace;
}

function pushSceneTextActionsTrace(source, actionsHost, extra = {}) {
  const store = getSceneTextActionsTraceStore();
  if (!store) return;

  let computedOpacity = "";
  let computedTransform = "";
  if (actionsHost && typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    try {
      const computed = window.getComputedStyle(actionsHost);
      computedOpacity = String(computed.opacity || "");
      computedTransform = String(computed.transform || "");
    } catch (_error) {
      computedOpacity = "";
      computedTransform = "";
    }
  }

  const seq = ++window.__sceneTextActionsTraceSeq;
  store.push({
    seq,
    timestampMs: Math.round(nowMs()),
    source: String(source || "unknown"),
    className: actionsHost?.className || "",
    styleOpacity: actionsHost?.style?.opacity || "",
    styleTransform: actionsHost?.style?.transform || "",
    stylePointerEvents: actionsHost?.style?.pointerEvents || "",
    ariaHidden: actionsHost?.getAttribute?.("aria-hidden") ?? null,
    computedOpacity,
    computedTransform,
    ...extra
  });
}

function pushFoldExpandTrace(source, {
  sessionId = 0,
  finalPlanType = null,
  bodyLayer = null,
  actionsHost = null,
  extra = {}
} = {}) {
  const store = getSceneTextActionsTraceStore();
  if (!store) return;

  const bodyContainer = bodyLayer?.container || null;
  const bodyContent = bodyLayer?.content || null;
  const veil = bodyLayer?.veil || null;
  const seq = ++window.__sceneTextActionsTraceSeq;

  store.push({
    seq,
    timestampMs: Math.round(nowMs()),
    source: String(source || "unknown"),
    sessionId,
    finalPlanType: finalPlanType || null,
    bodyContainer: {
      height: bodyContainer?.style?.height || "",
      maxHeight: bodyContainer?.style?.maxHeight || "",
      scrollHeight: Math.round(Number(bodyContainer?.scrollHeight || 0))
    },
    choices: {
      offsetTop: Math.round(Number(actionsHost?.offsetTop || 0)),
      offsetHeight: Math.round(Number(actionsHost?.offsetHeight || 0))
    },
    veil: {
      height: veil?.style?.height || ""
    },
    content: {
      transform: bodyContent?.style?.transform || ""
    },
    ...extra
  });
}

function commitFoldExpandDone({
  sessionId = 0,
  finalPlan = null,
  bodyLayer = null,
  actionsHost = null,
  didSkip = false,
  path = "unknown",
  owner = "commitFoldExpandDone"
} = {}) {
  pushFoldExpandTrace("commitFoldExpandDone.enter", {
    sessionId,
    finalPlanType: finalPlan?.type || null,
    bodyLayer,
    actionsHost,
    extra: {
      didSkip,
      path,
      owner
    }
  });

  if (bodyLayer) {
    const resolvedOpacity = Number.isFinite(Number(finalPlan?.expandedOpacity))
      ? Number(finalPlan.expandedOpacity)
      : Number(bodyLayer.expandedOpacity || 1);
    bodyLayer.container.style.height = "auto";
    bodyLayer.container.style.removeProperty("max-height");
    bodyLayer.container.style.overflow = "visible";
    bodyLayer.container.style.removeProperty("transition");
    bodyLayer.container.style.opacity = `${resolvedOpacity}`;
    if (bodyLayer.content) {
      bodyLayer.content.style.opacity = "1";
      bodyLayer.content.style.transform = "none";
      bodyLayer.content.style.removeProperty("transition");
    }
    if (bodyLayer.veil) {
      bodyLayer.veil.style.opacity = "0";
      bodyLayer.veil.style.height = "0";
      bodyLayer.veil.style.removeProperty("transition");
    }
  }

  if (actionsHost) {
    if (didSkip) {
      commitActionsFallbackVisible(actionsHost, {
        owner,
        path,
        didSkip,
        finalPlanType: finalPlan?.type || null
      });
    } else {
      commitActionsRevealDone(actionsHost, {
        owner,
        path,
        finalPlanType: finalPlan?.type || null
      });
    }
  }

  pushFoldExpandTrace("commitFoldExpandDone.exit", {
    sessionId,
    finalPlanType: finalPlan?.type || null,
    bodyLayer,
    actionsHost,
    extra: {
      didSkip,
      path,
      owner
    }
  });
}

const SCENE_TEXT_ACTIONS_PHASE = Object.freeze({
  HIDDEN: "hidden",
  REVEALING: "revealing",
  REVEALED: "revealed",
  FALLBACK_VISIBLE: "fallback_visible"
});

const SCENE_TEXT_ACTIONS_OWNER = Object.freeze({
  SCENE_TEXT: "scene_text"
});

function clearLegacyActionsPhaseClasses(actionsHost) {
  if (!actionsHost) return;
  actionsHost.classList.remove("scene-text-fx-actions-hidden", "scene-text-fx-actions-reveal");
}

function getActionsPhase(actionsHost) {
  return String(actionsHost?.dataset?.sceneTextActionsPhase || "").trim();
}

function setActionsPhase(actionsHost, phase) {
  if (!actionsHost) return;
  actionsHost.dataset.sceneTextActionsPhase = String(phase || "").trim();
}

function setActionsMotionOwner(actionsHost, owner) {
  if (!actionsHost) return;
  const normalizedOwner = String(owner || "").trim();
  if (!normalizedOwner) {
    delete actionsHost.dataset.sceneTextActionsOwner;
    return;
  }
  actionsHost.dataset.sceneTextActionsOwner = normalizedOwner;
}

function clearActionsMotionArtifacts(actionsHost, { preserveFadeMs = false, preserveOwner = true } = {}) {
  if (!actionsHost) return;
  actionsHost.style.removeProperty("opacity");
  actionsHost.style.removeProperty("transform");
  actionsHost.style.removeProperty("pointer-events");
  actionsHost.style.removeProperty("transition");
  actionsHost.style.removeProperty("animation");
  actionsHost.style.removeProperty("will-change");
  if (!preserveFadeMs) {
    actionsHost.style.removeProperty("--scene-text-fx-actions-fade-ms");
  }
  actionsHost.removeAttribute("aria-hidden");
  if (!preserveOwner) {
    setActionsMotionOwner(actionsHost, "");
  }
}

function primeActionsHidden(actionsHost, actionsFadeMs, translatePx = 4) {
  if (!actionsHost) return;
  clearLegacyActionsPhaseClasses(actionsHost);
  setActionsMotionOwner(actionsHost, SCENE_TEXT_ACTIONS_OWNER.SCENE_TEXT);
  setActionsPhase(actionsHost, SCENE_TEXT_ACTIONS_PHASE.HIDDEN);
  actionsHost.style.setProperty("--scene-text-fx-actions-fade-ms", `${toDurationMs(actionsFadeMs, 0)}ms`);
  actionsHost.style.pointerEvents = "none";
  actionsHost.style.opacity = "0";
  actionsHost.style.transform = `translateY(${Math.max(0, Number(translatePx || 0))}px)`;
  actionsHost.style.willChange = "opacity, transform";
  actionsHost.setAttribute("aria-hidden", "true");
  pushSceneTextActionsTrace("primeActionsHidden", actionsHost, {
    actionsFadeMs: toDurationMs(actionsFadeMs, 0),
    translatePx: Math.max(0, Number(translatePx || 0)),
    phase: getActionsPhase(actionsHost)
  });
}

function beginActionsReveal(actionsHost, revealMs, translatePx = 4, extra = {}) {
  if (!actionsHost) return;
  clearLegacyActionsPhaseClasses(actionsHost);
  setActionsMotionOwner(actionsHost, SCENE_TEXT_ACTIONS_OWNER.SCENE_TEXT);
  setActionsPhase(actionsHost, SCENE_TEXT_ACTIONS_PHASE.REVEALING);
  actionsHost.style.setProperty("--scene-text-fx-actions-fade-ms", `${toDurationMs(revealMs, 0)}ms`);
  actionsHost.style.pointerEvents = "none";
  actionsHost.style.opacity = "0";
  actionsHost.style.transform = `translateY(${Math.max(0, Number(translatePx || 0))}px)`;
  actionsHost.style.willChange = "opacity, transform";
  actionsHost.setAttribute("aria-hidden", "true");
  pushSceneTextActionsTrace("beginActionsReveal", actionsHost, {
    revealMs: toDurationMs(revealMs, 0),
    translatePx: Math.max(0, Number(translatePx || 0)),
    phase: getActionsPhase(actionsHost),
    ...extra
  });
}

function commitActionsRevealDone(actionsHost, extra = {}) {
  if (!actionsHost) return false;
  clearLegacyActionsPhaseClasses(actionsHost);
  setActionsMotionOwner(actionsHost, SCENE_TEXT_ACTIONS_OWNER.SCENE_TEXT);
  setActionsPhase(actionsHost, SCENE_TEXT_ACTIONS_PHASE.REVEALED);
  clearActionsMotionArtifacts(actionsHost);
  pushSceneTextActionsTrace("commitActionsRevealDone", actionsHost, {
    phase: getActionsPhase(actionsHost),
    ...extra
  });
  return true;
}

function commitActionsFallbackVisible(actionsHost, extra = {}) {
  if (!actionsHost) return false;
  if (getActionsPhase(actionsHost) === SCENE_TEXT_ACTIONS_PHASE.REVEALED) {
    pushSceneTextActionsTrace("commitActionsFallbackVisible.skipped", actionsHost, {
      reason: "already_revealed",
      phase: getActionsPhase(actionsHost),
      ...extra
    });
    return false;
  }
  clearLegacyActionsPhaseClasses(actionsHost);
  setActionsMotionOwner(actionsHost, SCENE_TEXT_ACTIONS_OWNER.SCENE_TEXT);
  setActionsPhase(actionsHost, SCENE_TEXT_ACTIONS_PHASE.FALLBACK_VISIBLE);
  clearActionsMotionArtifacts(actionsHost);
  pushSceneTextActionsTrace("commitActionsFallbackVisible", actionsHost, {
    phase: getActionsPhase(actionsHost),
    ...extra
  });
  return true;
}

function revealActionsWithFade(actionsHost, revealMs, onUnlocked) {
  if (!actionsHost) return null;
  beginActionsReveal(actionsHost, revealMs, 4, {
    owner: "reveal_timer"
  });

  const unlock = () => {
    commitActionsRevealDone(actionsHost, {
      owner: "reveal_timer",
      revealMs: toDurationMs(revealMs, 0)
    });
    pushSceneTextActionsTrace("revealActionsWithFade.onUnlocked", actionsHost, {
      revealMs: toDurationMs(revealMs, 0),
      phase: getActionsPhase(actionsHost)
    });
    if (typeof onUnlocked === "function") onUnlocked();
  };

  const ms = toDurationMs(revealMs, 0);
  if (ms <= 0) {
    unlock();
    return null;
  }
  return setTimeout(unlock, ms);
}

function normalizeChunkPlan(rawPlan, fallbackText) {
  const baseText = String(fallbackText || "").trim();
  const plan = rawPlan && typeof rawPlan === "object" ? rawPlan : {};
  const leadText = String(plan.leadText || "").trim();
  const bodyText = String(plan.bodyText || "").trim();
  const tailText = String(plan.tailText || "").trim();

  if (!leadText && !bodyText && !tailText) {
    return {
      leadText: baseText,
      bodyText: "",
      tailText: "",
      hasTail: false
    };
  }

  return {
    leadText,
    bodyText,
    tailText,
    hasTail: !!(plan.hasTail && tailText)
  };
}

function splitSceneBodyParagraphs(text) {
  const normalized = String(text || "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!normalized) return [];
  return normalized
    .split(/\n\s*\n+/)
    .map((part) => String(part || "").trim())
    .filter(Boolean);
}

function getParagraphStartMs(index) {
  if (index <= 0) return 0;
  if (index === 1) return 320;
  if (index === 2) return 740;
  if (index === 3) return 1160;
  // Keep long texts from stretching the whole timeline indefinitely.
  return 1160 + Math.max(0, index - 3) * 420;
}

function slicePreview40(text) {
  return String(text || "").trim().slice(0, 40);
}

function summarizeChunkPlanForAudit(plan) {
  const leadText = String(plan?.leadText || "").trim();
  const bodyText = String(plan?.bodyText || "").trim();
  const tailText = String(plan?.tailText || "").trim();
  return {
    leadChars: leadText.length,
    bodyChars: bodyText.length,
    tailChars: tailText.length,
    leadTextPreview: slicePreview40(leadText),
    bodyTextPreview: slicePreview40(bodyText),
    tailTextPreview: slicePreview40(tailText),
    hasTail: !!(plan?.hasTail && tailText)
  };
}

function buildAuditOnlyForcedChunkPlan(fullText) {
  const text = String(fullText || "").trim();
  const total = text.length;
  if (total <= 0) {
    return {
      leadText: "",
      bodyText: "",
      tailText: "",
      hasTail: false
    };
  }
  const leadEnd = Math.max(1, Math.floor(total * 0.2));
  const tailStart = Math.max(leadEnd + 1, Math.floor(total * 0.8));
  const leadText = text.slice(0, leadEnd).trim();
  const bodyText = text.slice(leadEnd, tailStart).trim();
  const tailText = text.slice(tailStart).trim();
  return {
    leadText,
    bodyText,
    tailText,
    hasTail: tailText.length > 0
  };
}

function classifyChunkLayerAuditFailure(audit) {
  const raw = audit?.rawChunk || {};
  const mounted = audit?.mounted || {};
  const dom = audit?.dom || {};

  const rawMissingBodyOrTail = raw.bodyChars === 0 || raw.tailChars === 0;
  const rawPreviewMissing = !raw.bodyTextPreview || !raw.tailTextPreview;
  if (rawMissingBodyOrTail && rawPreviewMissing) {
    return "A";
  }

  const expectsBody = raw.bodyChars > 0;
  const expectsTail = raw.tailChars > 0;
  const bodyMountedFail = expectsBody && (
    mounted.mountedBodyTextLength === 0 ||
    !dom.bodyLayerExists ||
    dom.bodyChildCount === 0
  );
  const tailMountedFail = expectsTail && (
    mounted.mountedTailTextLength === 0 ||
    !dom.tailLayerExists ||
    dom.tailChildCount === 0
  );
  if (bodyMountedFail || tailMountedFail) {
    return "B";
  }

  const bodyMeasureFail = expectsBody &&
    mounted.mountedBodyTextLength > 0 &&
    dom.bodyLayerExists &&
    dom.bodyChildCount > 0 &&
    dom.bodyScrollHeight === 0;
  const tailMeasureFail = expectsTail &&
    mounted.mountedTailTextLength > 0 &&
    dom.tailLayerExists &&
    dom.tailChildCount > 0 &&
    dom.tailScrollHeight === 0;
  if (bodyMeasureFail || tailMeasureFail) {
    return "C";
  }

  // Keep output inside A/B/C contract even for edge combinations.
  return "B";
}

function buildLeadNode(text, diagnostic) {
  if (!String(text || "").trim()) return null;
  const node = document.createElement("div");
  node.className = "scene-text-lead-layer";
  node.textContent = String(text || "").trim();
  node.style.whiteSpace = "pre-wrap";
  node.style.margin = "0";
  if (diagnostic) {
    node.style.outline = "1px solid #5de6ff";
    node.style.outlineOffset = "2px";
  }
  return node;
}

function buildFoldLayer({ className, text, previewLines, previewOpacity, expandedOpacity, maskStrength, diagnostic, outline }) {
  if (!String(text || "").trim()) return null;

  const container = document.createElement("div");
  container.className = className;
  container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.margin = "0";
  container.style.opacity = `${previewOpacity}`;
  if (diagnostic && outline) {
    container.style.outline = outline;
    container.style.outlineOffset = "2px";
  }

  const content = document.createElement("div");
  content.className = `${className}-content`;
  content.textContent = String(text || "").trim();
  content.style.whiteSpace = "pre-wrap";
  content.style.margin = "0";

  const veil = document.createElement("div");
  veil.className = `${className}-veil`;
  veil.style.position = "absolute";
  veil.style.left = "0";
  veil.style.right = "0";
  veil.style.bottom = "0";
  veil.style.pointerEvents = "none";
  veil.style.background = `linear-gradient(to bottom, rgba(11,17,24,0) 0%, rgba(11,17,24,${Math.max(0, Math.min(1, maskStrength))}) 100%)`;

  container.appendChild(content);
  container.appendChild(veil);

  return {
    container,
    content,
    veil,
    previewLines: Math.max(0, Math.round(Number(previewLines || 0))),
    previewOpacity: Number.isFinite(Number(previewOpacity)) ? Number(previewOpacity) : 1,
    expandedOpacity: Number.isFinite(Number(expandedOpacity)) ? Number(expandedOpacity) : 1,
    maskStrength: Math.max(0, Math.min(1, Number(maskStrength || 0))),
    previewHeight: 0,
    fullHeight: 0,
    canExpand: false
  };
}

function mountLayers(descEl, chunkPlan, visuals, diagnostic) {
  descEl.textContent = "";
  const root = document.createElement("div");
  root.className = "scene-text-root";
  root.style.display = "grid";
  root.style.gap = "0.62em";

  const leadNode = buildLeadNode(chunkPlan.leadText, diagnostic);
  const bodyLayer = buildFoldLayer({
    className: "scene-text-body-layer",
    text: chunkPlan.bodyText,
    previewLines: visuals.bodyPreviewLines,
    previewOpacity: visuals.bodyPreviewOpacity,
    expandedOpacity: visuals.bodyExpandedOpacity,
    maskStrength: visuals.bodyMaskStrength,
    diagnostic,
    outline: "1px dashed #ffc84f"
  });
  const tailLayer = buildFoldLayer({
    className: "scene-text-tail-layer",
    text: chunkPlan.tailText,
    previewLines: visuals.tailPreviewLines,
    previewOpacity: visuals.tailPreviewOpacity,
    expandedOpacity: visuals.tailExpandedOpacity,
    maskStrength: visuals.tailMaskStrength,
    diagnostic,
    outline: "1px dotted #ff6b7f"
  });

  if (leadNode) root.appendChild(leadNode);
  if (bodyLayer) root.appendChild(bodyLayer.container);
  if (tailLayer) root.appendChild(tailLayer.container);

  if (!leadNode && !bodyLayer && !tailLayer) {
    throw new Error("scene_text_empty_chunk");
  }

  descEl.appendChild(root);
  return { root, leadNode, bodyLayer, tailLayer };
}

function resolveLineHeightPx(el) {
  const style = window.getComputedStyle(el);
  const parsed = Number.parseFloat(style.lineHeight || "");
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const fontSize = Number.parseFloat(style.fontSize || "16");
  if (Number.isFinite(fontSize) && fontSize > 0) return fontSize * 1.7;
  return 28;
}

function primeFoldLayer(layer, lineHeightPx, diagnostic) {
  if (!layer) return;
  layer.fullHeight = Math.max(0, Math.ceil(layer.content.scrollHeight));
  layer.previewHeight = Math.max(lineHeightPx, Math.ceil(lineHeightPx * Math.max(1, layer.previewLines)));
  layer.canExpand = layer.previewLines > 0 && layer.fullHeight > layer.previewHeight + 2;

  if (!layer.canExpand) {
    layer.container.style.maxHeight = "none";
    layer.container.style.opacity = `${layer.expandedOpacity}`;
    layer.veil.style.opacity = "0";
    layer.veil.style.height = "0";
    return;
  }

  layer.container.style.maxHeight = `${layer.previewHeight}px`;
  layer.container.style.opacity = `${layer.previewOpacity}`;
  layer.container.style.transition = "none";
  layer.veil.style.opacity = "1";
  layer.veil.style.transition = "none";
  layer.veil.style.height = `${Math.max(16, Math.round(lineHeightPx * (0.72 + layer.maskStrength * 0.4)))}px`;

  if (diagnostic) {
    layer.veil.style.background = "linear-gradient(to bottom, rgba(11,17,24,0) 0%, rgba(11,17,24,0.92) 100%)";
  }
}

function expandFoldLayer(layer, durationMs, options = {}) {
  if (!layer || !layer.canExpand) return 0;
  const ms = toDurationMs(durationMs, 0);
  const easing = String(options.easing || "ease");
  const maskFadeMs = toDurationMs(options.maskFadeMs, ms);
  if (ms <= 0) {
    layer.container.style.maxHeight = "none";
    layer.container.style.opacity = `${layer.expandedOpacity}`;
    layer.veil.style.opacity = "0";
    return 0;
  }

  layer.container.style.transition = `max-height ${ms}ms ${easing}, opacity ${ms}ms ${easing}`;
  layer.veil.style.transition = `opacity ${maskFadeMs}ms ${easing}`;

  requestAnimationFrame(() => {
    layer.container.style.maxHeight = `${layer.fullHeight}px`;
    layer.container.style.opacity = `${layer.expandedOpacity}`;
    layer.veil.style.opacity = "0";
  });

  return ms;
}

function finalizeFoldLayer(layer) {
  if (!layer) return;
  layer.container.style.removeProperty("height");
  layer.container.style.removeProperty("max-height");
  layer.container.style.removeProperty("overflow");
  layer.container.style.removeProperty("transition");
  layer.container.style.opacity = `${layer.expandedOpacity}`;
  layer.veil.style.opacity = "0";
  layer.veil.style.height = "0";
  layer.veil.style.removeProperty("transition");
}

const LEGACY_SCENE_TEXT_PHASE_CLASSES = Object.freeze([
  "scene-text-fx-container",
  "scene-text-fx-prep",
  "scene-text-fx-playing",
  "scene-text-fx-done"
]);

function clearLegacySceneTextPhaseClasses(hostEl) {
  if (!hostEl) return;
  hostEl.classList.remove(...LEGACY_SCENE_TEXT_PHASE_CLASSES);
}

function setSceneTextHostPhase(hostEl, phase = "mounted") {
  if (!hostEl) return;
  clearLegacySceneTextPhaseClasses(hostEl);
  hostEl.classList.add("scene-text-fx-host");
  hostEl.setAttribute("data-scene-text-phase", String(phase || "mounted"));
}

function clearSceneTextParagraphAnimationStyles(hostEl) {
  if (!hostEl) return;
  const paragraphNodes = hostEl.querySelectorAll("p.scene-text-fx-paragraph");
  paragraphNodes.forEach((node) => {
    node.style.removeProperty("opacity");
    node.style.removeProperty("transform");
    node.style.removeProperty("transition");
  });
}

function normalizeStableSceneTextPhase(phase) {
  const value = String(phase || "").trim().toLowerCase();
  if (!value || value === "mounted" || value === "timeline_started") return "mounted";
  if (value === "done" || value === "final_done" || value === "skipped_to_final") return "done";
  if (value === "cancelled" || value === "host_replaced_reset") return "cancelled";
  return "playing";
}

function isDebugEnabled() {
  return readDebugFlag("sceneTextFxDebug");
}

function readRuntimeGeometryAuditFlagFromStorage() {
  try {
    const raw = String(localStorage.getItem("sceneTextRuntimeGeometryAudit") || "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "on";
  } catch (_error) {
    return false;
  }
}

function isRuntimeRootGeometryAuditEnabled(policy) {
  if (policy?.runtimeRootGeometryAudit === true) return true;
  if (policy?.geometryAudit === true) return true;
  if (window.__SCENE_TEXT_RUNTIME_GEOMETRY_AUDIT__ === true) return true;
  return readRuntimeGeometryAuditFlagFromStorage();
}

function getCurrentMaxHeight(layer) {
  if (!layer || !layer.container) return 0;
  const raw = String(layer.container.style.maxHeight || "").trim();
  if (!raw || raw === "none") return Math.round(layer.content.scrollHeight || 0);
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

function writeDiagnosticAttrs(descEl, { phase, bodyLayer, tailLayer, sessionId, contentKey, hostStable }) {
  if (!descEl) return;
  descEl.setAttribute("data-scene-text-diagnostic", "1");
  if (sessionId != null) {
    descEl.setAttribute("data-scene-text-session-id", String(sessionId));
  }
  if (contentKey != null) {
    descEl.setAttribute("data-scene-text-content-key", String(contentKey));
  }
  if (hostStable != null) {
    descEl.setAttribute("data-scene-text-host-stable", hostStable ? "1" : "0");
  }
  descEl.setAttribute("data-scene-text-diagnostic-phase", String(phase || "idle"));
  descEl.setAttribute("data-body-max-height", String(getCurrentMaxHeight(bodyLayer)));
  descEl.setAttribute("data-body-scroll-height", String(Math.round(bodyLayer?.content?.scrollHeight || 0)));
  descEl.setAttribute("data-tail-max-height", String(getCurrentMaxHeight(tailLayer)));
  descEl.setAttribute("data-tail-scroll-height", String(Math.round(tailLayer?.content?.scrollHeight || 0)));
}

function buildDiagnosticPanel() {
  const panel = document.createElement("pre");
  panel.className = "scene-text-diagnostic-panel";
  panel.style.position = "fixed";
  panel.style.top = "8px";
  panel.style.right = "8px";
  panel.style.zIndex = "9999";
  panel.style.background = "rgba(0,0,0,0.82)";
  panel.style.border = "1px solid rgba(255,255,255,0.5)";
  panel.style.color = "#dff6ff";
  panel.style.font = "12px/1.35 Consolas, Menlo, monospace";
  panel.style.maxWidth = "42vw";
  panel.style.pointerEvents = "none";
  panel.style.whiteSpace = "pre";
  return panel;
}

function updateRuntimeGeometryAuditSnapshot(state) {
  _sceneTextRuntimeRootState.lastSnapshot = {
    ..._sceneTextRuntimeRootState.lastSnapshot,
    geometryAudit: state
      ? {
          enabled: true,
          bodyPreviewHeight: Number(state.bodyPreviewHeight || 0),
          bodyScrollHeight: Number(state.bodyScrollHeight || 0),
          tailPreviewHeight: Number(state.tailPreviewHeight || 0),
          tailScrollHeight: Number(state.tailScrollHeight || 0),
          bodyCollapsed: !!state.bodyCollapsed,
          tailCollapsed: !!state.tailCollapsed,
          bodyExpandStartAt: Number.isFinite(state.bodyExpandStartAt) ? state.bodyExpandStartAt : null,
          bodyExpandEndAt: Number.isFinite(state.bodyExpandEndAt) ? state.bodyExpandEndAt : null,
          tailExpandStartAt: Number.isFinite(state.tailExpandStartAt) ? state.tailExpandStartAt : null,
          tailExpandEndAt: Number.isFinite(state.tailExpandEndAt) ? state.tailExpandEndAt : null,
          actionsUnlockedAt: Number.isFinite(state.actionsUnlockedAt) ? state.actionsUnlockedAt : null,
          sourceHidden: !!state.sourceHidden,
          bodyLayerRequested: !!state.bodyLayerRequested,
          tailLayerRequested: !!state.tailLayerRequested,
          finalBodyLayerEnabled: !!state.finalBodyLayerEnabled,
          finalTailLayerEnabled: !!state.finalTailLayerEnabled,
          runtimeReason: String(state.runtimeReason || ""),
          lineHeight: Number(state.lineHeight || 0),
          epsilon: Number(state.epsilon || 0),
          noVisibleCollapse: !!state.noVisibleCollapse,
          actionsUnlockTooEarly: !!state.actionsUnlockTooEarly,
          rawChunk: state.rawChunk ? { ...state.rawChunk } : null,
          mounted: state.mounted ? { ...state.mounted } : null,
          dom: state.dom ? { ...state.dom } : null,
          failureClass: String(state.failureClass || "A"),
          fallbackApplied: !!state.fallbackApplied
        }
      : null
  };
}

function refreshRuntimeGeometryAuditState(state) {
  if (!state) return;
  state.bodyPreviewHeight = Math.round(state.layers?.bodyLayer?.previewHeight || 0);
  state.bodyScrollHeight = Math.round(state.layers?.bodyLayer?.content?.scrollHeight || 0);
  state.tailPreviewHeight = Math.round(state.layers?.tailLayer?.previewHeight || 0);
  state.tailScrollHeight = Math.round(state.layers?.tailLayer?.content?.scrollHeight || 0);
  state.bodyCollapsed = state.bodyPreviewHeight > 0 && state.bodyPreviewHeight < state.bodyScrollHeight;
  state.tailCollapsed = state.tailPreviewHeight > 0 && state.tailPreviewHeight < state.tailScrollHeight;
  state.noVisibleCollapse = !state.bodyCollapsed || !state.tailCollapsed;
  const bodyEnd = Number.isFinite(state.bodyExpandEndAt) ? state.bodyExpandEndAt : null;
  const tailEnd = Number.isFinite(state.tailExpandEndAt) ? state.tailExpandEndAt : null;
  const unlocked = Number.isFinite(state.actionsUnlockedAt) ? state.actionsUnlockedAt : null;
  state.actionsUnlockTooEarly = unlocked != null && (
    (bodyEnd != null && unlocked <= bodyEnd) ||
    (tailEnd != null && unlocked <= tailEnd)
  );

   state.mounted = {
    mountedLeadTextLength: String(state.layers?.leadNode?.textContent || "").trim().length,
    mountedBodyTextLength: String(state.layers?.bodyLayer?.content?.textContent || "").trim().length,
    mountedTailTextLength: String(state.layers?.tailLayer?.content?.textContent || "").trim().length,
    mountedLeadTextPreview: slicePreview40(state.layers?.leadNode?.textContent || ""),
    mountedBodyTextPreview: slicePreview40(state.layers?.bodyLayer?.content?.textContent || ""),
    mountedTailTextPreview: slicePreview40(state.layers?.tailLayer?.content?.textContent || "")
  };

  state.dom = {
    bodyLayerExists: !!state.layers?.bodyLayer,
    tailLayerExists: !!state.layers?.tailLayer,
    bodyChildCount: Number(state.layers?.bodyLayer?.container?.childElementCount || 0),
    tailChildCount: Number(state.layers?.tailLayer?.container?.childElementCount || 0),
    bodyScrollHeight: state.bodyScrollHeight,
    tailScrollHeight: state.tailScrollHeight
  };

  state.failureClass = classifyChunkLayerAuditFailure(state);
  updateRuntimeGeometryAuditSnapshot(state);
}

function updateDiagnosticPanel(panel, state) {
  if (!panel || !state) return;
  refreshRuntimeGeometryAuditState(state.geometryAuditState);
  const audit = state.geometryAuditState;
  const alerts = [];
  if (audit?.noVisibleCollapse) alerts.push("NO_VISIBLE_COLLAPSE");
  if (audit?.actionsUnlockTooEarly) alerts.push("ACTIONS_UNLOCK_TOO_EARLY");
  const hasAlert = alerts.length > 0;
  panel.style.border = hasAlert ? "1px solid #ff5d5d" : "1px solid rgba(255,255,255,0.5)";
  panel.style.background = hasAlert ? "rgba(36,0,0,0.9)" : "rgba(0,0,0,0.82)";
  panel.style.color = hasAlert ? "#ffd8d8" : "#dff6ff";

  panel.textContent = [
    `diagnostic=${state.diagnostic ? "true" : "false"}`,
    `runtimeGeometryAudit=${state.runtimeGeometryAudit ? "true" : "false"}`,
    `reason=${state.reason}`,
    `shouldAnimate=${state.shouldAnimate}`,
    `presentationMode=${state.presentationMode || ""}`,
    `phase=${state.phase}`,
    `bodyPreviewLines=${state.bodyPreviewLines}`,
    `tailPreviewLines=${state.tailPreviewLines}`,
    `contentCueMs=${state.contentCueMs}`,
    `leadHoldMs=${state.leadHoldMs}`,
    `bodyExpandMs=${state.bodyExpandMs}`,
    `tailExpandMs=${state.tailExpandMs}`,
    `actionsDelayMs=${state.actionsDelayMs}`,
    `bodyLayerRequested=${audit?.bodyLayerRequested ? "true" : "false"}`,
    `tailLayerRequested=${audit?.tailLayerRequested ? "true" : "false"}`,
    `finalBodyLayerEnabled=${audit?.finalBodyLayerEnabled ? "true" : "false"}`,
    `finalTailLayerEnabled=${audit?.finalTailLayerEnabled ? "true" : "false"}`,
    `runtimeReason=${audit?.runtimeReason || ""}`,
    `lineHeight=${Number(audit?.lineHeight ?? 0).toFixed(2)}`,
    `epsilon=${Number(audit?.epsilon ?? 0).toFixed(2)}`,
    `raw lead/body/tail chars=${audit?.rawChunk?.leadChars ?? 0}/${audit?.rawChunk?.bodyChars ?? 0}/${audit?.rawChunk?.tailChars ?? 0}`,
    `raw leadPreview=${audit?.rawChunk?.leadTextPreview || ""}`,
    `raw bodyPreview=${audit?.rawChunk?.bodyTextPreview || ""}`,
    `raw tailPreview=${audit?.rawChunk?.tailTextPreview || ""}`,
    `raw hasTail=${audit?.rawChunk?.hasTail ? "true" : "false"}`,
    `mounted lead/body/tail len=${audit?.mounted?.mountedLeadTextLength ?? 0}/${audit?.mounted?.mountedBodyTextLength ?? 0}/${audit?.mounted?.mountedTailTextLength ?? 0}`,
    `mounted leadPreview=${audit?.mounted?.mountedLeadTextPreview || ""}`,
    `mounted bodyPreview=${audit?.mounted?.mountedBodyTextPreview || ""}`,
    `mounted tailPreview=${audit?.mounted?.mountedTailTextPreview || ""}`,
    `bodyLayerExists=${audit?.dom?.bodyLayerExists ? "true" : "false"}`,
    `tailLayerExists=${audit?.dom?.tailLayerExists ? "true" : "false"}`,
    `bodyChildCount=${audit?.dom?.bodyChildCount ?? 0}`,
    `tailChildCount=${audit?.dom?.tailChildCount ?? 0}`,
    `bodyPreviewHeight=${audit?.bodyPreviewHeight ?? 0}`,
    `bodyScrollHeight=${audit?.bodyScrollHeight ?? 0}`,
    `tailPreviewHeight=${audit?.tailPreviewHeight ?? 0}`,
    `tailScrollHeight=${audit?.tailScrollHeight ?? 0}`,
    `bodyCollapsed=${audit?.bodyCollapsed ? "true" : "false"}`,
    `tailCollapsed=${audit?.tailCollapsed ? "true" : "false"}`,
    `bodyExpandStartAt=${Number.isFinite(audit?.bodyExpandStartAt) ? audit.bodyExpandStartAt : "-"}`,
    `bodyExpandEndAt=${Number.isFinite(audit?.bodyExpandEndAt) ? audit.bodyExpandEndAt : "-"}`,
    `tailExpandStartAt=${Number.isFinite(audit?.tailExpandStartAt) ? audit.tailExpandStartAt : "-"}`,
    `tailExpandEndAt=${Number.isFinite(audit?.tailExpandEndAt) ? audit.tailExpandEndAt : "-"}`,
    `actionsUnlockedAt=${Number.isFinite(audit?.actionsUnlockedAt) ? audit.actionsUnlockedAt : "-"}`,
    `sourceHidden=${audit?.sourceHidden ? "true" : "false"}`,
    `fallbackApplied=${audit?.fallbackApplied ? "true" : "false"}`,
    `failureClass=${audit?.failureClass || "A"}`,
    `body max/scroll=${state.bodyMaxHeight}/${state.bodyScrollHeight}`,
    `tail max/scroll=${state.tailMaxHeight}/${state.tailScrollHeight}`,
    `animatedParagraphCount=${state.layoutAudit?.animatedParagraphCount ?? 0}`,
    `finalParagraphCount=${state.layoutAudit?.finalParagraphCount ?? 0}`,
    `animatedContainerHeight=${state.layoutAudit?.animatedContainerHeight ?? 0}`,
    `finalContainerHeight=${state.layoutAudit?.finalContainerHeight ?? 0}`,
    `switchedBackToSourceHost=${state.layoutAudit?.switchedBackToSourceHost ? "true" : "false"}`,
    ...(hasAlert ? alerts : ["PASS"])
  ].join("\n");
}

// ── Same-host production pipeline ──────────────────────────────────────────
//
// Production first-entry scene text is single-path:
// paragraph text extraction -> paragraph_fade plan -> same-host playback.
//
// Detached fold measurement and multi-mode presentation are diagnostic-only
// concerns. They must not affect the production first-entry experience.
// ─────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   type: "fold_expand",
 *   chunkPlan: ReturnType<typeof normalizeChunkPlan>,
 *   visuals: object,
 *   lineHeightPx: number,
 *   previewHeight: number,
 *   fullHeight: number,
 *   bodyPreviewLines: number,
 *   previewOpacity: number,
 *   expandedOpacity: number,
 *   bodyExpandMs: number,
 *   maskFadeMs: number,
 *   actionsDelayMs: number,
 *   actionsRevealMs: number
 * }} SceneTextFoldExpandPlan
 *
 * @typedef {{
 *   type: "paragraph_fade",
 *   paragraphTexts: string[],
 *   paragraphStartTimes: number[],
 *   paragraphRevealDurations: number[],
 *   actionsDelayMs: number,
 *   actionsRevealMs: number
 * }} SceneTextParagraphFadePlan
 *
 * @typedef {SceneTextFoldExpandPlan | SceneTextParagraphFadePlan} SceneTextFinalPlayPlan
 */

function createDetachedSceneTextMeasureHost(sourceDescEl) {
  if (!sourceDescEl || !document.body) return null;
  const rect = sourceDescEl.getBoundingClientRect();
  const width = Math.max(
    0,
    Math.round(rect.width || sourceDescEl.clientWidth || sourceDescEl.offsetWidth || 0)
  );
  const host = document.createElement("div");
  host.className = "scene-text-fx-measure-host";
  host.style.position = "absolute";
  host.style.left = "-100000px";
  host.style.top = "0";
  host.style.visibility = "hidden";
  host.style.pointerEvents = "none";
  host.style.width = `${width}px`;
  host.style.maxWidth = `${width}px`;
  host.style.whiteSpace = "pre-wrap";
  host.style.margin = "0";
  host.style.padding = "0";
  host.style.border = "0";
  host.style.minHeight = "0";
  host.style.contain = "layout style paint";
  copyTypographyStyles(sourceDescEl, host);
  document.body.appendChild(host);
  return {
    host,
    width,
    cleanup: () => {
      if (host.parentNode) host.parentNode.removeChild(host);
    }
  };
}

function buildSceneTextParagraphTexts(chunkPlan) {
  const fullText = [
    String(chunkPlan?.leadText || "").trim(),
    String(chunkPlan?.bodyText || "").trim(),
    String(chunkPlan?.tailText || "").trim()
  ].filter(Boolean).join("\n\n");
  const segments = splitSceneBodyParagraphs(fullText);
  return segments.length > 0 ? segments : (fullText ? [fullText] : []);
}

function applyStaticFinalStyles(target, styles = {}) {
  if (!target || !styles || typeof styles !== "object") return;
  for (const [key, value] of Object.entries(styles)) {
    if (value == null || value === "") {
      target.style.removeProperty(key);
      continue;
    }
    target.style.setProperty(key, String(value));
  }
}

function animateInlineStyles(target, keyframes, options = {}, cleanups, onFinish) {
  if (!target || !Array.isArray(keyframes) || keyframes.length === 0) {
    if (typeof onFinish === "function") onFinish();
    return;
  }

  const duration = toDurationMs(options.duration, 0);
  const finalFrame = keyframes[keyframes.length - 1] || {};
  if (duration <= 0) {
    applyStaticFinalStyles(target, finalFrame);
    if (typeof onFinish === "function") onFinish();
    return;
  }

  if (typeof target.animate === "function") {
    const animation = target.animate(keyframes, {
      duration,
      easing: String(options.easing || "ease"),
      fill: "forwards"
    });
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      applyStaticFinalStyles(target, finalFrame);
      if (typeof onFinish === "function") onFinish();
    };
    animation.addEventListener("finish", settle, { once: true });
    cleanups.push(() => {
      if (settled) return;
      settled = true;
      animation.cancel();
    });
    return;
  }

  const timer = setTimeout(() => {
    applyStaticFinalStyles(target, finalFrame);
    if (typeof onFinish === "function") onFinish();
  }, duration);
  cleanups.push(() => clearTimeout(timer));
}

function mountParagraphFadeNodes(sourceDescEl, paragraphTexts) {
  const paragraphNodes = [];
  for (const text of paragraphTexts) {
    const p = document.createElement("p");
    p.className = "scene-text-fx-paragraph";
    p.style.opacity = "0";
    p.style.transform = "translateY(3px)";
    p.textContent = text;
    sourceDescEl.appendChild(p);
    paragraphNodes.push(p);
  }
  return paragraphNodes;
}

function buildParagraphFadePlan(paragraphTexts) {
  return {
    type: "paragraph_fade",
    paragraphTexts,
    paragraphStartTimes: paragraphTexts.map((_, index) => getParagraphStartMs(index)),
    paragraphRevealDurations: paragraphTexts.map((_, index) => (index === 0 ? 380 : 720)),
    actionsDelayMs: 340,
    actionsRevealMs: 240
  };
}

function buildParagraphFadePlanFromChunkPlan(chunkPlan) {
  const paragraphTexts = buildSceneTextParagraphTexts(chunkPlan);
  if (paragraphTexts.length === 0) {
    throw new Error("scene_text_empty_chunk");
  }
  return buildParagraphFadePlan(paragraphTexts);
}

function commitSceneTextFxViewed(contentKey) {
  const key = String(contentKey || "").trim();
  if (!key) return false;
  const nextState = markViewed(gameState, key);
  gameState.sceneTextFxViewed = nextState.sceneTextFxViewed;
  return true;
}

function measureLiveFoldMetrics(bodyLayer) {
  if (!bodyLayer?.content) {
    return {
      lineHeightPx: 0,
      previewHeight: 0,
      fullHeight: 0,
      deltaHeight: 0,
      liveCanExpand: false
    };
  }

  const lineHeightPx = resolveLineHeightPx(bodyLayer.content);
  const previewHeight = Math.max(lineHeightPx, Math.ceil(lineHeightPx * Math.max(1, Number(bodyLayer.previewLines || 0))));
  const fullHeight = Math.max(0, Math.ceil(bodyLayer.content.scrollHeight));
  const deltaHeight = Math.max(0, fullHeight - previewHeight);
  const liveCanExpand = fullHeight > previewHeight + Math.max(8, lineHeightPx * 0.6);

  return {
    lineHeightPx,
    previewHeight,
    fullHeight,
    deltaHeight,
    liveCanExpand
  };
}

function resolveLiveExecutablePlan({ sourceDescEl, candidatePlan, mountedPlan } = {}) {
  if (!candidatePlan || !mountedPlan) {
    throw new Error("scene_text_missing_candidate_plan");
  }

  if (candidatePlan.type !== "fold_expand") {
    return {
      mountedPlan,
      finalPlan: mountedPlan.plan,
      playbackTruth: {
        candidatePlanType: candidatePlan.type,
        finalPlanType: mountedPlan.plan?.type || candidatePlan.type,
        livePlanValid: true,
        downgradedFromFold: false,
        consumeAnimatedEligible: true,
        liveLineHeightPx: 0,
        livePreviewHeight: 0,
        liveFullHeight: 0,
        liveDeltaHeight: 0
      }
    };
  }

  const bodyLayer = mountedPlan.bodyLayer;
  const metrics = measureLiveFoldMetrics(bodyLayer);
  if (metrics.liveCanExpand) {
    const finalPlan = {
      ...candidatePlan,
      lineHeightPx: metrics.lineHeightPx,
      previewHeight: metrics.previewHeight,
      fullHeight: metrics.fullHeight
    };
    applyMountedFoldPreview(bodyLayer, finalPlan);
    return {
      mountedPlan: {
        ...mountedPlan,
        plan: finalPlan,
        bodyLayer
      },
      finalPlan,
      playbackTruth: {
        candidatePlanType: candidatePlan.type,
        finalPlanType: finalPlan.type,
        livePlanValid: true,
        downgradedFromFold: false,
        consumeAnimatedEligible: true,
        liveLineHeightPx: metrics.lineHeightPx,
        livePreviewHeight: metrics.previewHeight,
        liveFullHeight: metrics.fullHeight,
        liveDeltaHeight: metrics.deltaHeight
      }
    };
  }

  const fallbackPlan = buildParagraphFadePlanFromChunkPlan(candidatePlan.chunkPlan);
  const fallbackMountedPlan = mountSceneTextFromPlan(sourceDescEl, fallbackPlan);
  return {
    mountedPlan: fallbackMountedPlan,
    finalPlan: fallbackPlan,
    playbackTruth: {
      candidatePlanType: candidatePlan.type,
      finalPlanType: fallbackPlan.type,
      livePlanValid: false,
      downgradedFromFold: true,
      consumeAnimatedEligible: false,
      liveLineHeightPx: metrics.lineHeightPx,
      livePreviewHeight: metrics.previewHeight,
      liveFullHeight: metrics.fullHeight,
      liveDeltaHeight: metrics.deltaHeight
    }
  };
}

function shouldConsumeAnimated({ policy, playbackTruth, didSkip = false, cancelled = false, completedByTracker = false } = {}) {
  const reason = String(policy?.reason || "");
  return reason.startsWith("first_seen")
    && policy?.shouldAnimate === true
    && didSkip !== true
    && cancelled !== true
    && completedByTracker === true
    && playbackTruth?.livePlanValid === true
    && playbackTruth?.consumeAnimatedEligible === true;
}

function applyMountedFoldPreview(bodyLayer, plan) {
  if (!bodyLayer || !plan || plan.type !== "fold_expand") return;
  bodyLayer.previewLines = plan.bodyPreviewLines;
  bodyLayer.previewOpacity = plan.previewOpacity;
  bodyLayer.expandedOpacity = plan.expandedOpacity;
  bodyLayer.previewHeight = plan.previewHeight;
  bodyLayer.fullHeight = plan.fullHeight;
  bodyLayer.canExpand = true;
  bodyLayer.container.style.height = `${plan.previewHeight}px`;
  bodyLayer.container.style.maxHeight = "none";
  bodyLayer.container.style.overflow = "hidden";
  bodyLayer.container.style.opacity = `${plan.previewOpacity}`;
  bodyLayer.container.style.transition = "none";
  bodyLayer.content.style.opacity = "0.88";
  bodyLayer.content.style.transform = "translateY(4px)";
  bodyLayer.veil.style.opacity = "1";
  bodyLayer.veil.style.transition = "none";
  bodyLayer.veil.style.height = `${Math.max(16, Math.round(plan.lineHeightPx * (0.72 + bodyLayer.maskStrength * 0.4)))}px`;
}

function measureSceneTextPlan({ sourceDescEl, policy } = {}) {
  const safePolicy = policy && typeof policy === "object" ? policy : {};
  const normalizedChunkPlan = normalizeChunkPlan(safePolicy.chunkPlan, String(sourceDescEl?.textContent || ""));
  const paragraphTexts = buildSceneTextParagraphTexts(normalizedChunkPlan);
  if (paragraphTexts.length === 0) {
    throw new Error("scene_text_empty_chunk");
  }

  return buildParagraphFadePlan(paragraphTexts);
}

function mountSceneTextFromPlan(sourceDescEl, plan) {
  if (!sourceDescEl || !plan) return null;
  sourceDescEl.textContent = "";
  setSceneTextHostPhase(sourceDescEl, "mounted");

  if (plan.type === "fold_expand") {
    const layers = mountLayers(sourceDescEl, plan.chunkPlan, plan.visuals, false);
    applyMountedFoldPreview(layers?.bodyLayer, plan);
    return {
      type: plan.type,
      plan,
      layers,
      bodyLayer: layers?.bodyLayer || null
    };
  }

  const paragraphNodes = mountParagraphFadeNodes(sourceDescEl, plan.paragraphTexts);
  return {
    type: plan.type,
    plan,
    paragraphNodes
  };
}

function playMountedSceneTextPlan(mountedPlan, { actionsHost, timers, cleanups, finish, onAnimationCompleted, sessionId = 0, commitFoldExpandDone: commitFoldExpandDoneOnce = null } = {}) {
  logSceneTextExecutorProbe("playMountedSceneTextPlan_entered", {
    timestampMs: Math.round(nowMs()),
    finalPlanType: mountedPlan?.plan?.type || null
  });

  if (!mountedPlan || !mountedPlan.plan) {
    if (typeof finish === "function") finish(false);
    return;
  }

  const finalPlan = mountedPlan.plan;
  const completePlayback = () => {
    if (finalPlan?.type === "fold_expand" && typeof commitFoldExpandDoneOnce === "function") {
      commitFoldExpandDoneOnce({
        didSkip: false,
        owner: "completePlayback",
        path: "same_host"
      });
    } else {
      pushSceneTextActionsTrace("completePlayback", actionsHost, {
        finalPlanType: finalPlan?.type || null
      });
    }
    if (typeof onAnimationCompleted === "function") {
      try {
        onAnimationCompleted();
      } catch (_error) {
        // noop
      }
    }
    if (typeof finish === "function") finish(false);
  };
  if (finalPlan.type === "fold_expand") {
    const bodyLayer = mountedPlan.bodyLayer;
    if (!bodyLayer) {
      if (typeof finish === "function") finish(false);
      return;
    }

    const expectedHandles = actionsHost ? 4 : 3;
    const tracker = createAnimationHandleTracker(expectedHandles, completePlayback);

    tracker.register(startTrackedAnimationHandle(
      bodyLayer.container,
      [
        { height: `${finalPlan.previewHeight}px`, opacity: `${finalPlan.previewOpacity}` },
        { height: `${finalPlan.fullHeight}px`, opacity: `${finalPlan.expandedOpacity}` }
      ],
      {
        duration: finalPlan.bodyExpandMs,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)"
      },
      cleanups,
      {
        label: "fold_expand_container",
        sessionId,
        finalPlanType: finalPlan.type,
        onFinish: () => {
          pushFoldExpandTrace("fold_expand_container.onFinish", {
            sessionId,
            finalPlanType: finalPlan.type,
            bodyLayer,
            actionsHost
          });
        }
      }
    ));

    tracker.register(startTrackedAnimationHandle(
      bodyLayer.content,
      [
        { opacity: "0.88", transform: "translateY(4px)" },
        { opacity: "1", transform: "translateY(0px)" }
      ],
      {
        duration: finalPlan.bodyExpandMs,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)"
      },
      cleanups,
      {
        label: "fold_expand_content",
        sessionId,
        finalPlanType: finalPlan.type,
        onFinish: () => {
          pushFoldExpandTrace("fold_expand_content.onFinish", {
            sessionId,
            finalPlanType: finalPlan.type,
            bodyLayer,
            actionsHost
          });
        }
      }
    ));

    const currentMaskHeight = bodyLayer.veil.style.height;

    tracker.register(startTrackedAnimationHandle(
      bodyLayer.veil,
      [
        { opacity: "1", height: currentMaskHeight },
        { opacity: "0", height: "0px" }
      ],
      {
        duration: finalPlan.maskFadeMs,
        easing: "ease"
      },
      cleanups,
      {
        label: "fold_expand_veil",
        sessionId,
        finalPlanType: finalPlan.type,
        onFinish: () => {
          pushFoldExpandTrace("fold_expand_veil.onFinish", {
            sessionId,
            finalPlanType: finalPlan.type,
            bodyLayer,
            actionsHost
          });
        }
      }
    ));

    if (actionsHost) {
      const actionsStartAt = finalPlan.bodyExpandMs + finalPlan.actionsDelayMs;
      timers.push(setTimeout(() => {
        beginActionsReveal(actionsHost, finalPlan.actionsRevealMs, 4, {
          branch: "fold_expand",
          finalPlanType: finalPlan?.type || null,
          owner: "actions_reveal_handle"
        });
        pushSceneTextActionsTrace("actions_reveal_handle_created", actionsHost, {
          branch: "fold_expand",
          finalPlanType: finalPlan?.type || null,
          actionsRevealMs: Number(finalPlan.actionsRevealMs || 0),
          phase: getActionsPhase(actionsHost)
        });
        tracker.register(startTrackedAnimationHandle(
          actionsHost,
          [
            { opacity: "0", transform: "translateY(4px)" },
            { opacity: "1", transform: "translateY(0px)" }
          ],
          {
            duration: finalPlan.actionsRevealMs,
            easing: "ease"
          },
          cleanups,
          {
            label: "actions_reveal",
            sessionId,
            finalPlanType: finalPlan.type,
            onFinish: () => {
              pushFoldExpandTrace("actions_reveal.onFinish", {
                sessionId,
                finalPlanType: finalPlan.type,
                bodyLayer,
                actionsHost,
                extra: {
                  branch: "fold_expand",
                  actionsRevealMs: Number(finalPlan.actionsRevealMs || 0),
                  phase: getActionsPhase(actionsHost)
                }
              });
            }
          }
        ));
      }, actionsStartAt));
    }

    tracker.markAllScheduled();
    return;
  }

  const expectedHandles = mountedPlan.paragraphNodes.length + (actionsHost ? 1 : 0);
  const tracker = createAnimationHandleTracker(expectedHandles, completePlayback);

  let lastSegmentEndMs = 0;
  for (let i = 0; i < mountedPlan.paragraphNodes.length; i++) {
    const paragraphNode = mountedPlan.paragraphNodes[i];
    const startMs = Number(finalPlan.paragraphStartTimes[i] || 0);
    const durationMs = Number(finalPlan.paragraphRevealDurations[i] || 0);
    lastSegmentEndMs = Math.max(lastSegmentEndMs, startMs + durationMs);
    timers.push(setTimeout(() => {
      tracker.register(startTrackedAnimationHandle(
        paragraphNode,
        [
          { opacity: "0", transform: "translateY(3px)" },
          { opacity: "1", transform: "translateY(0px)" }
        ],
        {
          duration: durationMs,
          easing: "ease"
        },
        cleanups,
        {
          label: `paragraph_fade_${i}`,
          finalPlanType: finalPlan.type,
          onFinish: () => {
            paragraphNode.style.opacity = "1";
            paragraphNode.style.transform = "translateY(0)";
          }
        }
      ));
    }, startMs));
  }

  if (actionsHost) {
    const actionsStartAt = lastSegmentEndMs + finalPlan.actionsDelayMs;
    timers.push(setTimeout(() => {
      beginActionsReveal(actionsHost, finalPlan.actionsRevealMs, 4, {
        branch: "paragraph_fade",
        finalPlanType: finalPlan?.type || null,
        owner: "actions_reveal_handle"
      });
      pushSceneTextActionsTrace("actions_reveal_handle_created", actionsHost, {
        branch: "paragraph_fade",
        finalPlanType: finalPlan?.type || null,
        actionsRevealMs: Number(finalPlan.actionsRevealMs || 0),
        phase: getActionsPhase(actionsHost)
      });
      tracker.register(startTrackedAnimationHandle(
        actionsHost,
        [
          { opacity: "0", transform: "translateY(4px)" },
          { opacity: "1", transform: "translateY(0px)" }
        ],
        {
          duration: finalPlan.actionsRevealMs,
          easing: "ease"
        },
        cleanups,
        {
          label: "actions_reveal",
          finalPlanType: finalPlan.type,
          onFinish: () => {
            commitActionsRevealDone(actionsHost, {
              branch: "paragraph_fade",
              finalPlanType: finalPlan?.type || null,
              owner: "actions_reveal_handle"
            });
            pushSceneTextActionsTrace("actions_reveal.onFinish", actionsHost, {
              branch: "paragraph_fade",
              finalPlanType: finalPlan?.type || null,
              actionsRevealMs: Number(finalPlan.actionsRevealMs || 0),
              phase: getActionsPhase(actionsHost)
            });
          }
        }
      ));
    }, actionsStartAt));
  }

  tracker.markAllScheduled();
}

function runSceneTextSameHost({ sourceDescEl, actionsHost, policy, onAnimationCompleted, sessionId = 0, onSessionStateChange } = {}) {
  const safePolicy = policy && typeof policy === "object" ? policy : {};
  const allowSceneTextFx = safePolicy.allowSceneTextFx === true;
  const shouldAnimate = safePolicy.shouldAnimate === true;
  const reason = String(safePolicy.reason || "");

  let done = false;
  let layers = null;
  let playbackTruth = null;
  let foldExpandDoneCommitted = false;
  const timers = [];
  const cleanups = [];
  const contentKey = String(safePolicy.contentKey || "").trim();
  let viewedCommitted = false;
  const persistViewedOnce = () => {
    if (viewedCommitted) return;
    viewedCommitted = commitSceneTextFxViewed(contentKey) || viewedCommitted;
  };
  const notifyAnimationCompleted = () => {
    if (done) return;
    if (shouldConsumeAnimated({
      policy: safePolicy,
      playbackTruth,
      didSkip: false,
      cancelled: false,
      completedByTracker: true
    })) {
      persistViewedOnce();
      if (typeof onAnimationCompleted === "function") {
        onAnimationCompleted({ key: contentKey });
      }
      return;
    }

    if (!reason.startsWith("first_seen")) return;
    if (shouldAnimate !== true) return;
    if (playbackTruth?.downgradedFromFold === true || playbackTruth?.finalPlanType === "paragraph_fade") {
      persistViewedOnce();
    }
  };

  const ensureFoldExpandDone = ({ didSkip = false, owner = "finish", path = "same_host" } = {}) => {
    if (foldExpandDoneCommitted) return true;
    if (finalPlan?.type !== "fold_expand") return false;
    foldExpandDoneCommitted = true;
    commitFoldExpandDone({
      sessionId,
      finalPlan,
      bodyLayer: layers?.bodyLayer || null,
      actionsHost,
      didSkip,
      path,
      owner
    });
    return true;
  };

  const clearAll = () => {
    while (timers.length > 0) clearTimeout(timers.pop());
    while (cleanups.length > 0) { try { cleanups.pop()(); } catch (_) {} }
  };

  const emitSessionState = (state) => {
    if (typeof onSessionStateChange !== "function") return;
    onSessionStateChange({
      sessionId,
      state,
      finishedAt: state === "running" ? null : Date.now(),
      hostElement: sourceDescEl
    });
  };

  const finish = (didSkip = false) => {
    if (done) return;
    ensureFoldExpandDone({
      didSkip,
      owner: "finish",
      path: "same_host"
    });
    if (finalPlan?.type === "fold_expand") {
      pushFoldExpandTrace("finish.enter", {
        sessionId,
        finalPlanType: finalPlan?.type || null,
        bodyLayer: layers?.bodyLayer || null,
        actionsHost,
        extra: {
          didSkip,
          path: "same_host"
        }
      });
    }
    pushSceneTextActionsTrace("finish", actionsHost, {
      didSkip,
      sessionId,
      path: "same_host",
      phaseBefore: getActionsPhase(actionsHost)
    });
    done = true;
    logSceneTextExecutorProbe(didSkip ? "finish_skipped" : "finish_completed", {
      timestampMs: Math.round(nowMs()),
      sessionId
    });
    clearAll();
    setSceneTextHostPhase(sourceDescEl, "done");
    clearSceneTextParagraphAnimationStyles(sourceDescEl);
    if (finalPlan?.type === "fold_expand") {
      finalizeFoldLayer(layers?.tailLayer);
      pushSceneTextActionsTrace("finish.actions_noop", actionsHost, {
        owner: "finish",
        path: "same_host",
        didSkip,
        phase: getActionsPhase(actionsHost)
      });
    } else if (didSkip || getActionsPhase(actionsHost) !== SCENE_TEXT_ACTIONS_PHASE.REVEALED) {
      finalizeFoldLayer(layers?.bodyLayer);
      finalizeFoldLayer(layers?.tailLayer);
      commitActionsFallbackVisible(actionsHost, {
        owner: "finish",
        path: "same_host",
        didSkip
      });
    } else {
      finalizeFoldLayer(layers?.bodyLayer);
      finalizeFoldLayer(layers?.tailLayer);
      pushSceneTextActionsTrace("finish.actions_noop", actionsHost, {
        owner: "finish",
        path: "same_host",
        didSkip,
        phase: getActionsPhase(actionsHost)
      });
    }
    emitSessionState("done");
  };

  const cancelInternal = () => {
    if (done) return;
    pushSceneTextActionsTrace("cancelInternal", actionsHost, {
      sessionId,
      path: "same_host",
      phaseBefore: getActionsPhase(actionsHost)
    });
    done = true;
    logSceneTextExecutorProbe("cancel", {
      timestampMs: Math.round(nowMs()),
      sessionId
    });
    clearAll();
    ensureFoldExpandDone({
      didSkip: true,
      owner: "cancelInternal",
      path: "same_host"
    });
    setSceneTextHostPhase(sourceDescEl, "cancelled");
    clearSceneTextParagraphAnimationStyles(sourceDescEl);
    if (finalPlan?.type === "fold_expand") {
      finalizeFoldLayer(layers?.tailLayer);
    } else {
      finalizeFoldLayer(layers?.bodyLayer);
      finalizeFoldLayer(layers?.tailLayer);
      commitActionsFallbackVisible(actionsHost, {
        owner: "cancelInternal",
        path: "same_host"
      });
    }
    emitSessionState("cancelled");
  };

  if (!allowSceneTextFx) {
    commitActionsFallbackVisible(actionsHost, {
      owner: "allow_false",
      path: "same_host"
    });
    return { cancel: () => {} };
  }

  if (!shouldAnimate) {
    commitActionsFallbackVisible(actionsHost, {
      owner: "shouldAnimate_false",
      path: "same_host"
    });
    finish(false);
    return { cancel: () => {} };
  }

  let finalPlan;
  try {
    const candidatePlan = measureSceneTextPlan({
      sourceDescEl,
      policy: safePolicy
    });
    const mountedCandidatePlan = mountSceneTextFromPlan(sourceDescEl, candidatePlan);
    const resolvedExecutable = resolveLiveExecutablePlan({
      sourceDescEl,
      candidatePlan,
      mountedPlan: mountedCandidatePlan
    });
    finalPlan = resolvedExecutable.finalPlan;
    playbackTruth = resolvedExecutable.playbackTruth;
    logSceneTextExecutorProbe("finalPlan.type", {
      timestampMs: Math.round(nowMs()),
      sessionId,
      finalPlanType: finalPlan?.type || null
    });
    layers = resolvedExecutable.mountedPlan?.layers || null;
    primeActionsHidden(actionsHost, 160, 4);
    setSceneTextHostPhase(sourceDescEl, "playing");
    emitSessionState("running");
    playMountedSceneTextPlan(resolvedExecutable.mountedPlan, {
      actionsHost,
      timers,
      cleanups,
      finish,
      onAnimationCompleted: notifyAnimationCompleted,
      sessionId,
      commitFoldExpandDone: ensureFoldExpandDone
    });
  } catch (_err) {
    commitActionsFallbackVisible(actionsHost, {
      owner: "mount_or_plan_exception",
      path: "same_host"
    });
    return { cancel: () => {} };
  }

  // Skip-on-input handlers
  const skipNow = () => finish(true);
  const timingsPolicy = safePolicy.timings && typeof safePolicy.timings === "object" ? safePolicy.timings : {};
  if (timingsPolicy.skipOnPointer) {
    const fn = () => skipNow();
    window.addEventListener("pointerdown", fn, true);
    cleanups.push(() => window.removeEventListener("pointerdown", fn, true));
  }
  if (timingsPolicy.skipOnWheel) {
    const fn = () => skipNow();
    window.addEventListener("wheel", fn, { capture: true, passive: true });
    cleanups.push(() => window.removeEventListener("wheel", fn, true));
  }
  if (timingsPolicy.skipOnKey) {
    const fn = () => skipNow();
    window.addEventListener("keydown", fn, true);
    cleanups.push(() => window.removeEventListener("keydown", fn, true));
  }

  return {
    cancel: () => cancelInternal(),
    getSnapshot: () => ({
      sessionId,
      state: done ? "done" : "running",
      hostElement: sourceDescEl
    })
  };
}

export function runSceneTextFxDom({ appHost, actionsHost, policy, onAnimationCompleted, sessionId = 0, onSessionStateChange, stableMountWidth = null } = {}) {
  const article = appHost?.querySelector(".map-panel");
  const descEl = article?.querySelector(".map-desc");
  const safePolicy = policy && typeof policy === "object" ? policy : {};
  const domEntryShape = toBoundaryAuditShape("dom_entry", safePolicy);
  updateBoundaryAuditState({ dom_entry: domEntryShape });
  console.info("[SceneTextBoundaryAudit] dom_entry", domEntryShape);
  const runtimeGeometryAudit = isRuntimeRootGeometryAuditEnabled(safePolicy);

  if (!descEl || !actionsHost) {
    if (safePolicy?.diagnostic) {
      console.warn("[SceneTextFxDiagnostic] fallback hit: missing_hosts", {
        hasDesc: !!descEl,
        hasActions: !!actionsHost
      });
    }
    return {
      cancel: () => {}
    };
  }

  let done = false;
  const timers = [];
  const cleanups = [];
  const rafIds = [];
  const mode = String(safePolicy.mode || "soft_focus");
  const diagnostic = safePolicy?.diagnostic === true || mode === "diagnostic";
  // Production always uses same-host animation: fxHostEl === sourceDescEl.
  // The overlay runtime layer is only created for diagnostic / geometry-audit paths,
  // where access to a separate mirrored host is needed for probing.
  const runtimeRootEnabled = runtimeGeometryAudit || diagnostic;
  const sourceDescEl = descEl;
  let fxHostEl = sourceDescEl;
  let runtimeMount = {
    enabled: false,
    cleanup: () => {},
    markPhase: () => {},
    markActionsUnlocked: () => {}
  };

  let layers = null;
  let diagnosticPanel = null;
  let diagnosticState = null;
  let geometryAuditState = null;
  let keepRuntimeLayerAsFinal = false;
  let layoutAudit = {
    animatedParagraphCount: 0,
    finalParagraphCount: 0,
    animatedContainerHeight: 0,
    finalContainerHeight: 0,
    switchedBackToSourceHost: false
  };

  const clearAll = () => {
    while (timers.length > 0) {
      clearTimeout(timers.pop());
    }
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      try {
        fn();
      } catch (_error) {
        // noop
      }
    }
  };

  const allowSceneTextFx = safePolicy.allowSceneTextFx === true;
  const shouldAnimate = safePolicy.shouldAnimate === true;
  const reason = String(safePolicy.reason || "");
  const bodyLayerRequested = safePolicy.bodyLayerRequested === true;
  const tailLayerRequested = safePolicy.tailLayerRequested === true;
  const weightedChars = Number(safePolicy?.analysis?.weightedCharCount || 0);
  const isLikelySceneBody = weightedChars >= 45;
  const panelEnabled = diagnostic || runtimeGeometryAudit;
  const contentKey = String(safePolicy.contentKey || "").trim();
  const debugEnabled = diagnostic || isDebugEnabled();
  const flowStart = nowMs();

  const emitSessionState = (state) => {
    if (typeof onSessionStateChange !== "function") return;
    onSessionStateChange({
      sessionId,
      state,
      finishedAt: state === "running" ? null : Date.now(),
      hostElement: sourceDescEl
    });
  };

  const logTimeline = (event, extra = null) => {
    if (!diagnostic) return;
    console.info(`[SceneTextFxDiagnostic] ${event}`, {
      t: Math.round(nowMs() - flowStart),
      ...(extra && typeof extra === "object" ? extra : {})
    });
  };

  const setPhase = (phase) => {
    if (diagnosticState) diagnosticState.phase = phase;
    setSceneTextHostPhase(fxHostEl, normalizeStableSceneTextPhase(phase));
    runtimeMount.markPhase(phase);
    if (diagnostic) {
      writeDiagnosticAttrs(fxHostEl, {
        phase,
        bodyLayer: layers?.bodyLayer,
        tailLayer: layers?.tailLayer,
        sessionId,
        contentKey,
        hostStable: true
      });
    }
  };

  const markHostReplaced = () => {
    if (!diagnostic) return;
    const currentHost = appHost?.querySelector?.(".map-panel .map-desc") || null;
    if (!currentHost || currentHost === sourceDescEl) return;

    currentHost.setAttribute("data-scene-text-diagnostic", "1");
    currentHost.setAttribute("data-scene-text-session-id", String(sessionId));
    currentHost.setAttribute("data-scene-text-content-key", contentKey);
    currentHost.setAttribute("data-scene-text-diagnostic-phase", "host_replaced_reset");
    currentHost.setAttribute("data-scene-text-host-stable", "0");
    console.warn("SceneTextFxDiagnostic host_replaced", {
      oldSessionId: sessionId,
      oldKey: contentKey,
      newKey: contentKey
    });
  };

  const cancelInternal = (state = "cancelled") => {
    if (done) return;
    pushSceneTextActionsTrace("cancelInternal", actionsHost, {
      sessionId,
      path: "runtime_root",
      state,
      phaseBefore: getActionsPhase(actionsHost)
    });
    done = true;
    logSceneTextExecutorProbe("cancel", {
      timestampMs: Math.round(nowMs()),
      sessionId
    });
    clearAll();
    commitActionsFallbackVisible(actionsHost, {
      owner: "cancelInternal",
      path: "runtime_root",
      state
    });
    setSceneTextHostPhase(fxHostEl, "cancelled");
    clearSceneTextParagraphAnimationStyles(fxHostEl);
    finalizeFoldLayer(layers?.bodyLayer);
    finalizeFoldLayer(layers?.tailLayer);
    runtimeMount.cleanup("cancelled", 0);
    if (geometryAuditState) {
      geometryAuditState.sourceHidden = sourceDescEl.style.visibility === "hidden";
      refreshRuntimeGeometryAuditState(geometryAuditState);
    }
    emitSessionState(state);
  };

  const finish = (didSkip = false) => {
    if (done) return;
    pushSceneTextActionsTrace("finish", actionsHost, {
      didSkip,
      sessionId,
      path: "runtime_root",
      phaseBefore: getActionsPhase(actionsHost)
    });
    done = true;
    logSceneTextExecutorProbe(didSkip ? "finish_skipped" : "finish_completed", {
      timestampMs: Math.round(nowMs()),
      sessionId
    });
    clearAll();

    clearLegacySceneTextPhaseClasses(descEl);
    setSceneTextHostPhase(fxHostEl, "done");
    clearSceneTextParagraphAnimationStyles(fxHostEl);

    finalizeFoldLayer(layers?.bodyLayer);
    finalizeFoldLayer(layers?.tailLayer);

    if (keepRuntimeLayerAsFinal) {
      const finalNodes = fxHostEl.querySelectorAll(".scene-text-paragraph");
      finalNodes.forEach((node) => {
        node.style.removeProperty("opacity");
        node.style.removeProperty("transition");
        node.style.removeProperty("transform");
        node.style.removeProperty("clip-path");
        const glint = node.querySelector(".scene-text-paragraph-glint");
        if (glint) {
          glint.style.opacity = "0";
          glint.style.removeProperty("transition");
          glint.style.transform = "translateX(130%)";
        }
      });
      layoutAudit.finalParagraphCount = finalNodes.length;
      layoutAudit.finalContainerHeight = Math.round(fxHostEl.getBoundingClientRect().height || 0);
      layoutAudit.switchedBackToSourceHost = false;
    }

    if (didSkip || getActionsPhase(actionsHost) !== SCENE_TEXT_ACTIONS_PHASE.REVEALED) {
      commitActionsFallbackVisible(actionsHost, {
        owner: "finish",
        path: "runtime_root",
        didSkip
      });
    } else {
      pushSceneTextActionsTrace("finish.actions_noop", actionsHost, {
        owner: "finish",
        path: "runtime_root",
        didSkip,
        phase: getActionsPhase(actionsHost)
      });
    }
    if (!keepRuntimeLayerAsFinal) {
      runtimeMount.cleanup(didSkip ? "done_skipped" : "done", didSkip ? 0 : Math.round(nowMs() - flowStart));
      layoutAudit.switchedBackToSourceHost = !!runtimeMount.enabled;
    }
    if (geometryAuditState) {
      geometryAuditState.sourceHidden = sourceDescEl.style.visibility === "hidden";
      refreshRuntimeGeometryAuditState(geometryAuditState);
    }

    if (diagnostic) {
      setPhase(didSkip ? "skipped_to_final" : "final_done");
      logTimeline("final done", { didSkip });
    }

    emitSessionState("done");

    if (debugEnabled) {
      console.info("[SceneTextFxLayoutAudit]", {
        animatedParagraphCount: layoutAudit.animatedParagraphCount,
        finalParagraphCount: layoutAudit.finalParagraphCount,
        animatedContainerHeight: layoutAudit.animatedContainerHeight,
        finalContainerHeight: layoutAudit.finalContainerHeight,
        switchedBackToSourceHost: layoutAudit.switchedBackToSourceHost
      });
    }

  };

  if (!allowSceneTextFx) {
    commitSceneTextFxViewed(contentKey);
    if (diagnostic) logTimeline("fallback hit", { reason: "allow_false" });
    commitActionsFallbackVisible(actionsHost, {
      owner: "allow_false",
      path: "runtime_root"
    });
    return {
      cancel: () => {
        clearAll();
        commitActionsFallbackVisible(actionsHost, {
          owner: "allow_false.cancel",
          path: "runtime_root"
        });
      }
    };
  }

  if (!shouldAnimate && reason === "already_seen") {
    if (diagnostic) logTimeline("fallback hit", { reason: "already_seen_short_circuit" });
    commitSceneTextFxViewed(contentKey);
    commitActionsFallbackVisible(actionsHost, {
      owner: "already_seen_short_circuit",
      path: "runtime_root"
    });
    return {
      cancel: () => {
        clearAll();
        commitActionsFallbackVisible(actionsHost, {
          owner: "already_seen_short_circuit.cancel",
          path: "runtime_root"
        });
      }
    };
  }

  if (!shouldAnimate) {
    if (diagnostic) logTimeline("fallback hit", { reason: "shouldAnimate_false" });
    commitSceneTextFxViewed(contentKey);
    commitActionsFallbackVisible(actionsHost, {
      owner: "shouldAnimate_false",
      path: "runtime_root"
    });
    finish(false);
    return {
      cancel: () => {
        clearAll();
        commitActionsFallbackVisible(actionsHost, {
          owner: "shouldAnimate_false.cancel",
          path: "runtime_root"
        });
      }
    };
  }

  // Production path: single same-host chain.
  // fxHostEl === sourceDescEl. No overlay. No geometry writes. No host switch.
  // All production same-host animations must resolve through:
  // measureSceneTextPlan -> mountSceneTextFromPlan -> playMountedSceneTextPlan.
  if (!runtimeRootEnabled) {
    return runSceneTextSameHost({
      sourceDescEl,
      actionsHost,
      policy: safePolicy,
      onAnimationCompleted,
      sessionId,
      onSessionStateChange
    });
  }

  const runtimeSourceText = String(sourceDescEl?.textContent || "");
  if (runtimeRootEnabled) {
    runtimeMount = startRuntimeRootLayer(appHost, sourceDescEl, runtimeSourceText, stableMountWidth);
    fxHostEl = runtimeMount.fxHostEl || sourceDescEl;
    console.info("SceneTextRuntimeRoot mounted", {
      runtimeRoot: true,
      sessionId,
      appAttached: !!runtimeMount.runtimeRootEl?.isConnected
    });
  }

  const timings = safePolicy.timings && typeof safePolicy.timings === "object" ? safePolicy.timings : {};
  const visuals = safePolicy.visuals && typeof safePolicy.visuals === "object" ? safePolicy.visuals : {};
  const rawText = runtimeSourceText;
  const rawChunkPlan = normalizeChunkPlan(safePolicy.chunkPlan, "");
  const runtimeAuditRawChunkShape = toBoundaryAuditShape("runtimeAudit_rawChunk", {
    ...safePolicy,
    chunkPlan: rawChunkPlan
  });
  updateBoundaryAuditState({ runtimeAudit_rawChunk: runtimeAuditRawChunkShape });
  console.info("[SceneTextBoundaryAudit] runtimeAudit_rawChunk", runtimeAuditRawChunkShape);
  const rawChunkAudit = summarizeChunkPlanForAudit(rawChunkPlan);
  let chunkPlan = normalizeChunkPlan(safePolicy.chunkPlan, rawText);
  const normalizedChunkShape = toBoundaryAuditShape("normalizeChunkPlan_result", {
    ...safePolicy,
    chunkPlan
  });
  updateBoundaryAuditState({ normalizeChunkPlan_result: normalizedChunkShape });
  console.info("[SceneTextBoundaryAudit] normalizeChunkPlan_result", normalizedChunkShape);
  let fallbackApplied = false;
  if (runtimeGeometryAudit && rawText.trim().length >= 60 && rawChunkAudit.bodyChars === 0) {
    chunkPlan = buildAuditOnlyForcedChunkPlan(rawText);
    fallbackApplied = true;
  }

  try {
    layers = mountLayers(fxHostEl, chunkPlan, visuals, diagnostic);
  } catch (error) {
    if (diagnostic) {
      logTimeline("fallback hit", { reason: "mount_failed", message: error?.message || String(error) });
      console.warn("[SceneTextFxDiagnostic] fallback hit: mount_failed", error);
    }
    fxHostEl.textContent = rawText;
    commitActionsFallbackVisible(actionsHost, {
      owner: "mount_failed",
      path: "runtime_root"
    });
    runtimeMount.cleanup("mount_failed", 0);
    finish(false);
    return {
      cancel: () => {
        clearAll();
        commitActionsFallbackVisible(actionsHost, {
          owner: "mount_failed.cancel",
          path: "runtime_root"
        });
      }
    };
  }

  // ── Reflow Evidence Probe ────────────────────────────────────────────────
  // Activated by: localStorage.setItem('sceneTextReflowProbe','1') then reload
  // Output:       window.__SCENE_TEXT_REFLOW_LOG  (console filter: [STReflow])
  const _reflowProbeActive = (() => {
    try { return localStorage.getItem('sceneTextReflowProbe') === '1'; } catch(_){return false;}
  })();
  if (_reflowProbeActive) {
    const _probeLog = [];
    window.__SCENE_TEXT_REFLOW_LOG = _probeLog;
    const _probeTarget = layers?.bodyLayer?.content || fxHostEl;
    const _probeContainer = fxHostEl;
    const _probeMapId = String(safePolicy.contentKey || "");

    const _snap = (label) => {
      try {
        const cs = window.getComputedStyle(_probeTarget);
        const csC = window.getComputedStyle(_probeContainer);
        const r = _probeTarget.getBoundingClientRect();
        const entry = {
          label,
          t: Math.round(nowMs() - flowStart),
          textContentLen: _probeTarget.textContent?.length ?? -1,
          innerTextLen: _probeTarget instanceof HTMLElement ? (_probeTarget.innerText?.length ?? -1) : -1,
          innerHTMLLen: _probeTarget.innerHTML?.length ?? -1,
          rect: { w: Math.round(r.width), h: Math.round(r.height) },
          scrollHeight: _probeTarget.scrollHeight,
          clientHeight: _probeTarget.clientHeight,
          containerScrollH: _probeContainer.scrollHeight,
          containerClientH: _probeContainer.clientHeight,
          containerRect: (() => { const rc = _probeContainer.getBoundingClientRect(); return { w: Math.round(rc.width), h: Math.round(rc.height) }; })(),
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
          letterSpacing: cs.letterSpacing,
          wordSpacing: cs.wordSpacing,
          fontKerning: cs.fontKerning,
          fontFeatureSettings: cs.fontFeatureSettings,
          whiteSpace: cs.whiteSpace,
          textRendering: cs.textRendering,
          textAlign: cs.textAlign,
          containerWidth: csC.width,
          containerMaxHeight: csC.maxHeight,
          className: _probeContainer.className,
          mapContentKey: _probeMapId,
        };
        _probeLog.push(entry);
        console.info('[STReflow]', label, entry);
      } catch(_e) {}
    };

    // 1. At mount
    _snap('mount');

    // 2. MutationObserver – body content text/children change after mount
    const _mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const detail = { type: m.type, t: Math.round(nowMs() - flowStart) };
        if (m.type === 'childList') detail.addedCount = m.addedNodes.length;
        if (m.type === 'characterData') detail.newLen = m.target.textContent?.length ?? -1;
        if (m.type === 'attributes') detail.attr = m.attributeName;
        console.info('[STReflow] MutationObserver', detail);
        _probeLog.push({ label: 'mutation', ...detail });
      }
    });
    _mo.observe(_probeTarget, { childList: true, subtree: true, characterData: true, attributes: true });
    _mo.observe(_probeContainer, { childList: true, attributes: true, attributeFilter: ['class', 'style'] });
    cleanups.push(() => _mo.disconnect());

    // 3. ResizeObserver – container or body content dimension change
    if (typeof ResizeObserver !== 'undefined') {
      const _ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const detail = {
            label: 'resize',
            t: Math.round(nowMs() - flowStart),
            target: e.target === _probeContainer ? 'container' : 'content',
            w: Math.round(e.contentRect.width),
            h: Math.round(e.contentRect.height),
          };
          console.info('[STReflow] ResizeObserver', detail);
          _probeLog.push(detail);
        }
      });
      _ro.observe(_probeContainer);
      _ro.observe(_probeTarget);
      cleanups.push(() => _ro.disconnect());
    }

    // 4. document.fonts.ready
    if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.ready === 'object') {
      document.fonts.ready.then(() => {
        _snap('fonts_ready');
      });
    }

    // 5. 500ms
    const _t500 = setTimeout(() => _snap('500ms'), 500);
    timers.push(_t500);
  }
  // ── End Reflow Evidence Probe ────────────────────────────────────────────

  const bodyPreviewLines = runtimeGeometryAudit
    ? 1
    : (runtimeRootEnabled ? 2 : Math.max(0, Math.round(Number(visuals.bodyPreviewLines || 0))));
  const tailPreviewLines = runtimeGeometryAudit
    ? 1
    : Math.max(0, Math.round(Number(visuals.tailPreviewLines || 0)));

  if (layers.bodyLayer) {
    layers.bodyLayer.previewLines = bodyPreviewLines;
    layers.bodyLayer.previewOpacity = Number.isFinite(Number(visuals.bodyPreviewOpacity)) ? Number(visuals.bodyPreviewOpacity) : 0.78;
    layers.bodyLayer.expandedOpacity = Number.isFinite(Number(visuals.bodyExpandedOpacity)) ? Number(visuals.bodyExpandedOpacity) : 1;
    layers.bodyLayer.maskStrength = Number.isFinite(Number(visuals.bodyMaskStrength)) ? Number(visuals.bodyMaskStrength) : 0.72;
  }
  if (layers.tailLayer) {
    layers.tailLayer.previewLines = tailPreviewLines;
    layers.tailLayer.previewOpacity = Number.isFinite(Number(visuals.tailPreviewOpacity)) ? Number(visuals.tailPreviewOpacity) : 0.68;
    layers.tailLayer.expandedOpacity = Number.isFinite(Number(visuals.tailExpandedOpacity)) ? Number(visuals.tailExpandedOpacity) : 1;
    layers.tailLayer.maskStrength = Number.isFinite(Number(visuals.tailMaskStrength)) ? Number(visuals.tailMaskStrength) : 0.78;
  }

  const lineHeightPx = resolveLineHeightPx(fxHostEl);
  primeFoldLayer(layers.bodyLayer, lineHeightPx, diagnostic);
  primeFoldLayer(layers.tailLayer, lineHeightPx, diagnostic);

  const epsilonPx = Math.max(4, lineHeightPx * 0.35);
  const bodyPreviewHeightMeasured = Math.round(layers.bodyLayer?.previewHeight || 0);
  const bodyScrollHeightMeasured = Math.round(layers.bodyLayer?.content?.scrollHeight || 0);
  const tailPreviewHeightMeasured = Math.round(layers.tailLayer?.previewHeight || 0);
  const tailScrollHeightMeasured = Math.round(layers.tailLayer?.content?.scrollHeight || 0);

  let finalBodyLayerEnabled = bodyLayerRequested
    && bodyScrollHeightMeasured > bodyPreviewHeightMeasured + epsilonPx;
  let finalTailLayerEnabled = tailLayerRequested
    && tailScrollHeightMeasured > tailPreviewHeightMeasured + epsilonPx;
  let runtimeReason = "";

  if (!finalBodyLayerEnabled && bodyLayerRequested) {
    runtimeReason = "body_geometry_not_collapsible";
  }

  if (!finalTailLayerEnabled && tailLayerRequested && !runtimeReason) {
    runtimeReason = "tail_geometry_merged";
  }

  if (layers.bodyLayer && !finalBodyLayerEnabled) {
    layers.bodyLayer.canExpand = false;
    layers.bodyLayer.container.style.maxHeight = "none";
    layers.bodyLayer.container.style.opacity = `${layers.bodyLayer.expandedOpacity}`;
    layers.bodyLayer.veil.style.opacity = "0";
    layers.bodyLayer.veil.style.height = "0";
  }

  if (layers.tailLayer && !finalTailLayerEnabled) {
    const tailText = String(layers.tailLayer.content?.textContent || "").trim();
    if (tailText && layers.bodyLayer?.content) {
      const bodyText = String(layers.bodyLayer.content.textContent || "").trim();
      layers.bodyLayer.content.textContent = bodyText ? `${bodyText}\n\n${tailText}` : tailText;
      primeFoldLayer(layers.bodyLayer, lineHeightPx, diagnostic);
      finalBodyLayerEnabled = bodyLayerRequested
        && Math.round(layers.bodyLayer?.content?.scrollHeight || 0) > Math.round(layers.bodyLayer?.previewHeight || 0) + epsilonPx;
      if (!finalBodyLayerEnabled) {
        layers.bodyLayer.canExpand = false;
        layers.bodyLayer.container.style.maxHeight = "none";
        layers.bodyLayer.container.style.opacity = `${layers.bodyLayer.expandedOpacity}`;
        layers.bodyLayer.veil.style.opacity = "0";
        layers.bodyLayer.veil.style.height = "0";
      }
    }
    if (layers.tailLayer.container?.parentNode) {
      layers.tailLayer.container.parentNode.removeChild(layers.tailLayer.container);
    }
    layers.tailLayer = null;
    finalTailLayerEnabled = false;
  }

  if (layers.tailLayer) {
    const tailText = String(layers.tailLayer.content?.textContent || "").trim();
    if (tailText && layers.bodyLayer?.content) {
      const bodyText = String(layers.bodyLayer.content.textContent || "").trim();
      layers.bodyLayer.content.textContent = bodyText ? `${bodyText}\n\n${tailText}` : tailText;
      primeFoldLayer(layers.bodyLayer, lineHeightPx, diagnostic);
      finalBodyLayerEnabled = bodyLayerRequested
        && Math.round(layers.bodyLayer?.content?.scrollHeight || 0) > Math.round(layers.bodyLayer?.previewHeight || 0) + epsilonPx;
      if (!finalBodyLayerEnabled) {
        layers.bodyLayer.canExpand = false;
        layers.bodyLayer.container.style.maxHeight = "none";
        layers.bodyLayer.container.style.opacity = `${layers.bodyLayer.expandedOpacity}`;
        layers.bodyLayer.veil.style.opacity = "0";
        layers.bodyLayer.veil.style.height = "0";
      }
    } else if (tailText && layers.leadNode) {
      const leadText = String(layers.leadNode.textContent || "").trim();
      layers.leadNode.textContent = leadText ? `${leadText}\n\n${tailText}` : tailText;
    }
    if (layers.tailLayer.container?.parentNode) {
      layers.tailLayer.container.parentNode.removeChild(layers.tailLayer.container);
    }
    layers.tailLayer = null;
    finalTailLayerEnabled = false;
    if (!runtimeReason && tailLayerRequested) {
      runtimeReason = "tail_merged_into_body";
    }
  }

  let presentationMode = finalBodyLayerEnabled
    ? "body_reveal"
    : (isLikelySceneBody ? "short_cue" : "micro_text");
  let bodyExpandMs = presentationMode === "body_reveal" ? 780 : 0;
  let maskFadeMs = presentationMode === "body_reveal" ? 420 : 0;
  let actionsDelayMs = presentationMode === "body_reveal"
    ? 180
    : (presentationMode === "short_cue" ? 220 : 120);
  const actionsRevealMs = 160;
  let contentCueMs = presentationMode === "body_reveal"
    ? 0
    : (presentationMode === "short_cue" ? 140 : 100);
  const leadHoldMs = 0;
  const tailExpandMs = 0;
  const tailStartDelayMs = 0;
  const revealEasing = "cubic-bezier(0.22, 1, 0.36, 1)";

  if (layers.bodyLayer) {
    if (presentationMode === "body_reveal") {
      layers.bodyLayer.previewLines = 2;
      layers.bodyLayer.previewOpacity = 1;
      layers.bodyLayer.expandedOpacity = 1;
      primeFoldLayer(layers.bodyLayer, lineHeightPx, diagnostic);
    } else {
      layers.bodyLayer.canExpand = false;
      layers.bodyLayer.container.style.maxHeight = "none";
      layers.bodyLayer.container.style.opacity = `${layers.bodyLayer.expandedOpacity}`;
      layers.bodyLayer.veil.style.opacity = "0";
      layers.bodyLayer.veil.style.height = "0";
    }
  }

  setSceneTextHostPhase(fxHostEl, "mounted");
  runtimeMount.markPhase("timeline_started");

  if (panelEnabled) {
    geometryAuditState = {
      layers,
      bodyPreviewHeight: 0,
      bodyScrollHeight: 0,
      tailPreviewHeight: 0,
      tailScrollHeight: 0,
      bodyLayerRequested,
      tailLayerRequested,
      finalBodyLayerEnabled,
      finalTailLayerEnabled,
      runtimeReason,
      lineHeight: lineHeightPx,
      epsilon: epsilonPx,
      bodyCollapsed: false,
      tailCollapsed: false,
      bodyExpandStartAt: null,
      bodyExpandEndAt: null,
      tailExpandStartAt: null,
      tailExpandEndAt: null,
      actionsUnlockedAt: null,
      sourceHidden: sourceDescEl.style.visibility === "hidden",
      noVisibleCollapse: false,
      actionsUnlockTooEarly: false,
      rawChunk: rawChunkAudit,
      mounted: null,
      dom: null,
      failureClass: "A",
      fallbackApplied
    };

    diagnosticState = {
      reason,
      shouldAnimate,
      phase: "content_cue",
      presentationMode,
      diagnostic,
      runtimeGeometryAudit,
      geometryAuditState,
      bodyPreviewLines,
      tailPreviewLines,
      contentCueMs,
      leadHoldMs,
      bodyExpandMs,
      tailExpandMs,
      actionsDelayMs,
      actionsRevealMs,
      layoutAudit,
      bodyMaxHeight: getCurrentMaxHeight(layers.bodyLayer),
      bodyScrollHeight: Math.round(layers.bodyLayer?.content?.scrollHeight || 0),
      tailMaxHeight: getCurrentMaxHeight(layers.tailLayer),
      tailScrollHeight: Math.round(layers.tailLayer?.content?.scrollHeight || 0)
    };
    refreshRuntimeGeometryAuditState(geometryAuditState);

    diagnosticPanel = buildDiagnosticPanel();
    document.body.appendChild(diagnosticPanel);
    cleanups.push(() => {
      if (diagnosticPanel && diagnosticPanel.parentNode) {
        diagnosticPanel.parentNode.removeChild(diagnosticPanel);
      }
    });

    writeDiagnosticAttrs(fxHostEl, {
      phase: diagnosticState.phase,
      bodyLayer: layers.bodyLayer,
      tailLayer: layers.tailLayer,
      sessionId,
      contentKey,
      hostStable: true
    });
    updateDiagnosticPanel(diagnosticPanel, diagnosticState);
    if (diagnostic) {
      logTimeline("diagnostic start", {
        reason,
        shouldAnimate,
        presentationMode,
        contentCueMs,
        bodyPreviewLines,
        tailPreviewLines,
        leadHoldMs,
        bodyExpandMs,
        tailExpandMs,
        actionsDelayMs
      });
    }

    const panelTicker = setInterval(() => {
      if (!diagnosticState || done) return;
      diagnosticState.bodyMaxHeight = getCurrentMaxHeight(layers.bodyLayer);
      diagnosticState.bodyScrollHeight = Math.round(layers.bodyLayer?.content?.scrollHeight || 0);
      diagnosticState.tailMaxHeight = getCurrentMaxHeight(layers.tailLayer);
      diagnosticState.tailScrollHeight = Math.round(layers.tailLayer?.content?.scrollHeight || 0);
      if (geometryAuditState) {
        geometryAuditState.sourceHidden = sourceDescEl.style.visibility === "hidden";
      }
      writeDiagnosticAttrs(fxHostEl, {
        phase: diagnosticState.phase,
        bodyLayer: layers.bodyLayer,
        tailLayer: layers.tailLayer,
        sessionId,
        contentKey,
        hostStable: true
      });
      updateDiagnosticPanel(diagnosticPanel, diagnosticState);
    }, 80);
    cleanups.push(() => clearInterval(panelTicker));

    const hostWatcher = setInterval(() => {
      if (done) return;
      const currentHost = appHost?.querySelector?.(".map-panel .map-desc") || null;
      if (!currentHost || currentHost === sourceDescEl) return;
      markHostReplaced();
      if (!runtimeRootEnabled) {
        cancelInternal("cancelled");
      }
    }, 80);
    cleanups.push(() => clearInterval(hostWatcher));
  }

  primeActionsHidden(actionsHost, actionsRevealMs, 4);

  emitSessionState("running");

  const runTimeline = () => {
    if (done) return;
    setPhase("content_cue");
    fxHostEl.style.opacity = presentationMode === "short_cue" ? "0.92" : (presentationMode === "micro_text" ? "0.95" : "1");
    fxHostEl.style.transition = "none";

    let textDoneAt = 0;
    if (presentationMode === "body_reveal" && layers.bodyLayer?.canExpand) {
      setPhase("body_expand");
      if (geometryAuditState) {
        geometryAuditState.bodyExpandStartAt = Math.round(nowMs() - flowStart);
      }
      if (diagnostic) logTimeline("body expand start", { bodyExpandMs });
      runtimeMount.markPhase("body_expand");
      const bodyActual = expandFoldLayer(layers.bodyLayer, bodyExpandMs, {
        easing: revealEasing,
        maskFadeMs
      });
      const bodyEndTimer = setTimeout(() => {
        if (geometryAuditState) {
          geometryAuditState.bodyExpandEndAt = Math.round(nowMs() - flowStart);
        }
        if (diagnostic) logTimeline("body expand end");
      }, bodyActual);
      timers.push(bodyEndTimer);
      textDoneAt = bodyActual;
    } else if (contentCueMs > 0) {
      requestAnimationFrame(() => {
        fxHostEl.style.transition = `opacity ${contentCueMs}ms ease`;
        fxHostEl.style.opacity = "1";
      });
      textDoneAt = contentCueMs;
    }

    const actionsStartAt = textDoneAt + actionsDelayMs;

    const actionsTimer = setTimeout(() => {
      setPhase("actions_reveal");
      if (diagnostic) logTimeline("actions reveal start", { actionsRevealMs });
      const unlockTimer = revealActionsWithFade(actionsHost, actionsRevealMs, () => {
        const unlockedAt = Math.round(nowMs() - flowStart);
        if (geometryAuditState) {
          geometryAuditState.actionsUnlockedAt = unlockedAt;
          geometryAuditState.sourceHidden = sourceDescEl.style.visibility === "hidden";
        }
        runtimeMount.markActionsUnlocked(unlockedAt);
        if (diagnostic) logTimeline("actions reveal end");
        console.info("SceneTextRuntimeRoot actions_unlocked", {
          sessionId,
          t: unlockedAt
        });
      });
      if (unlockTimer) timers.push(unlockTimer);
    }, actionsStartAt);
    timers.push(actionsTimer);

    const doneTimer = setTimeout(() => {
      finish(false);
    }, actionsStartAt + actionsRevealMs + 24);
    timers.push(doneTimer);
  };

  // Re-measure fold eligibility with stable layout, re-prime the body layer,
  // recompute all derived timing variables, then run the animation timeline.
  // This replaces the earlier measurements which may have used a stale scrollHeight
  // if the sidebar margin-right transition was in-flight at call time.
  const reprimeThenRun = () => {
    if (done) return;
    // Geometry has been set correctly at mount time using pre-computed stable
    // width. Do not re-write left/top/width here — that was the source of the
    // first-entry reflow (843 → 483 at ~350 ms).
    const stableLh = resolveLineHeightPx(fxHostEl);
    const stableEpsilon = Math.max(4, stableLh * 0.35);
    if (layers?.bodyLayer?.content) {
      layers.bodyLayer.previewLines = 2;
      layers.bodyLayer.previewOpacity = 1;
      layers.bodyLayer.expandedOpacity = 1;
      primeFoldLayer(layers.bodyLayer, stableLh, diagnostic);

      finalBodyLayerEnabled = bodyLayerRequested
        && layers.bodyLayer.fullHeight > layers.bodyLayer.previewHeight + stableEpsilon;
      presentationMode = finalBodyLayerEnabled
        ? "body_reveal"
        : (isLikelySceneBody ? "short_cue" : "micro_text");
      bodyExpandMs = presentationMode === "body_reveal" ? 780 : 0;
      maskFadeMs = presentationMode === "body_reveal" ? 420 : 0;
      actionsDelayMs = presentationMode === "body_reveal"
        ? 180
        : (presentationMode === "short_cue" ? 220 : 120);
      contentCueMs = presentationMode === "body_reveal"
        ? 0
        : (presentationMode === "short_cue" ? 140 : 100);
      if (presentationMode !== "body_reveal") {
        layers.bodyLayer.canExpand = false;
        layers.bodyLayer.container.style.maxHeight = "none";
        layers.bodyLayer.container.style.opacity = `${layers.bodyLayer.expandedOpacity}`;
        layers.bodyLayer.veil.style.opacity = "0";
        layers.bodyLayer.veil.style.height = "0";
      }
    }
    runTimeline();
  };

  // Double-rAF ensures layout has been committed before measuring.
  // If the sidebar margin-right CSS transition is still running at that point,
  // defer further to transitionend so scrollHeight is the true stable value.
  void fxHostEl.getBoundingClientRect();
  const rafA = requestAnimationFrame(() => {
    if (window.__SCENE_TEXT_REFLOW_LOG) {
      const _probeTarget2 = layers?.bodyLayer?.content || fxHostEl;
      const _snap2 = (label) => {
        try {
          const cs = window.getComputedStyle(_probeTarget2);
          const r = _probeTarget2.getBoundingClientRect();
          const entry = { label, t: Math.round(nowMs() - flowStart), rect: { w: Math.round(r.width), h: Math.round(r.height) }, scrollHeight: _probeTarget2.scrollHeight, clientHeight: _probeTarget2.clientHeight, fontSize: cs.fontSize, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, containerWidth: window.getComputedStyle(fxHostEl).width };
          window.__SCENE_TEXT_REFLOW_LOG.push(entry);
          console.info('[STReflow]', label, entry);
        } catch(_e) {}
      };
      _snap2('raf1');
    }
    const rafB = requestAnimationFrame(() => {
      if (window.__SCENE_TEXT_REFLOW_LOG) {
        const _probeTarget3 = layers?.bodyLayer?.content || fxHostEl;
        const _snap3 = (label) => {
          try {
            const cs = window.getComputedStyle(_probeTarget3);
            const r = _probeTarget3.getBoundingClientRect();
            const entry = { label, t: Math.round(nowMs() - flowStart), rect: { w: Math.round(r.width), h: Math.round(r.height) }, scrollHeight: _probeTarget3.scrollHeight, clientHeight: _probeTarget3.clientHeight, fontSize: cs.fontSize, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, containerWidth: window.getComputedStyle(fxHostEl).width };
            window.__SCENE_TEXT_REFLOW_LOG.push(entry);
            console.info('[STReflow]', label, entry);
          } catch(_e) {}
        };
        _snap3('raf2');
      }
      if (done) return;
      const appEl = appHost;
      const inlineMr = appEl?.style?.marginRight;
      const inlineNum = inlineMr ? Number.parseFloat(inlineMr) : NaN;
      const computedNum = appEl ? Number.parseFloat(window.getComputedStyle(appEl).marginRight) : NaN;
      const isSidebarTransitioning = Number.isFinite(inlineNum) && Number.isFinite(computedNum)
        && Math.abs(inlineNum - computedNum) > 1;

      if (isSidebarTransitioning) {
        const onMrTransitionEnd = (ev) => {
          if (ev.propertyName !== "margin-right") return;
          appEl.removeEventListener("transitionend", onMrTransitionEnd);
          reprimeThenRun();
        };
        appEl.addEventListener("transitionend", onMrTransitionEnd);
        cleanups.push(() => appEl.removeEventListener("transitionend", onMrTransitionEnd));
      } else {
        reprimeThenRun();
      }
    });
    rafIds.push(rafB);
  });
  rafIds.push(rafA);
  cleanups.push(() => {
    while (rafIds.length > 0) {
      cancelAnimationFrame(rafIds.pop());
    }
  });

  const skipNow = () => finish(true);
  if (timings.skipOnPointer) {
    const onPointer = () => skipNow();
    window.addEventListener("pointerdown", onPointer, true);
    cleanups.push(() => window.removeEventListener("pointerdown", onPointer, true));
  }
  if (timings.skipOnWheel) {
    const onWheel = () => skipNow();
    window.addEventListener("wheel", onWheel, { capture: true, passive: true });
    cleanups.push(() => window.removeEventListener("wheel", onWheel, true));
  }
  if (timings.skipOnKey) {
    const onKey = () => skipNow();
    window.addEventListener("keydown", onKey, true);
    cleanups.push(() => window.removeEventListener("keydown", onKey, true));
  }

  if (debugEnabled && !diagnostic) {
    console.info("[SceneTextFxDebug] pacing-window active", {
      mode,
      reason,
      shouldAnimate,
      presentationMode,
      contentCueMs,
      bodyPreviewLines,
      tailPreviewLines,
      leadHoldMs,
      bodyExpandMs,
      tailExpandMs,
      actionsDelayMs,
      actionsRevealMs
    });
  }

  return {
    cancel: () => {
      cancelInternal("cancelled");
    },
    getSnapshot: () => ({
      sessionId,
      state: done ? "done" : "running",
      hostElement: sourceDescEl,
      contentKey,
      runtimeRoot: getSceneTextRuntimeRootSnapshot()
    })
  };
}

function findVisibleSceneTextHost(appHost) {
  const root = appHost || document;
  const candidates = Array.from(root.querySelectorAll(".map-panel .map-desc"));
  for (const node of candidates) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && node.isConnected) {
      return node;
    }
  }
  return candidates[0] || null;
}

function makeSmokePanel() {
  const panel = document.createElement("pre");
  panel.className = "scene-text-smoke-panel";
  panel.style.position = "fixed";
  panel.style.top = "8px";
  panel.style.right = "8px";
  panel.style.zIndex = "10000";
  panel.style.margin = "0";
  panel.style.padding = "10px 12px";
  panel.style.background = "rgba(0,0,0,0.86)";
  panel.style.color = "#dff6ff";
  panel.style.border = "1px solid rgba(255,255,255,0.6)";
  panel.style.font = "12px/1.35 Consolas, Menlo, monospace";
  panel.style.pointerEvents = "none";
  panel.style.whiteSpace = "pre";
  panel.style.maxWidth = "44vw";
  return panel;
}

export function runSceneTextFxSmoke({ appHost, choicesHost } = {}) {
  const host = findVisibleSceneTextHost(appHost || document);
  if (!host) {
    console.warn("SceneTextFxSmoke host_missing");
    return {
      cancel: () => {},
      getSnapshot: () => ({ ok: false, reason: "host_missing" })
    };
  }

  const hostSelector = ".map-panel .map-desc";
  const startTs = nowMs();
  let phase = "init";
  let hostReplacedCount = 0;
  let done = false;
  const timers = [];
  const intervals = [];
  const originalHtml = host.innerHTML;

  const smokeRoot = document.createElement("div");
  smokeRoot.className = "scene-text-smoke-root";
  smokeRoot.style.display = "grid";
  smokeRoot.style.gap = "0.7em";

  const lead = document.createElement("div");
  lead.textContent = "这是 lead。它应当立即完整可读。";
  lead.style.whiteSpace = "pre-wrap";
  lead.style.padding = "8px";
  lead.style.border = "1px solid #ff3f3f";

  const bodyWrap = document.createElement("div");
  bodyWrap.style.position = "relative";
  bodyWrap.style.overflow = "hidden";
  bodyWrap.style.border = "1px solid #ffd84d";
  bodyWrap.style.background = "rgba(255, 216, 77, 0.16)";

  const body = document.createElement("div");
  body.textContent = "这是 body。它一开始只能看到一行，随后应当在数秒内明显展开。\n如果你看不到展开，说明动画没有真正作用到当前正文节点。\n如果它瞬间跳到结尾，说明过渡没有生效。";
  body.style.whiteSpace = "pre-wrap";
  body.style.padding = "8px";

  const bodyVeil = document.createElement("div");
  bodyVeil.style.position = "absolute";
  bodyVeil.style.left = "0";
  bodyVeil.style.right = "0";
  bodyVeil.style.bottom = "0";
  bodyVeil.style.pointerEvents = "none";
  bodyVeil.style.background = "linear-gradient(to bottom, rgba(20,20,20,0) 0%, rgba(20,20,20,0.92) 100%)";

  bodyWrap.appendChild(body);
  bodyWrap.appendChild(bodyVeil);

  const tailWrap = document.createElement("div");
  tailWrap.style.position = "relative";
  tailWrap.style.overflow = "hidden";
  tailWrap.style.border = "1px solid #4fa8ff";
  tailWrap.style.background = "rgba(79, 168, 255, 0.16)";

  const tail = document.createElement("div");
  tail.textContent = "这是 tail/info。它应该比 body 更晚展开。";
  tail.style.whiteSpace = "pre-wrap";
  tail.style.padding = "8px";

  const tailVeil = document.createElement("div");
  tailVeil.style.position = "absolute";
  tailVeil.style.left = "0";
  tailVeil.style.right = "0";
  tailVeil.style.bottom = "0";
  tailVeil.style.pointerEvents = "none";
  tailVeil.style.background = "linear-gradient(to bottom, rgba(20,20,20,0) 0%, rgba(20,20,20,0.94) 100%)";

  tailWrap.appendChild(tail);
  tailWrap.appendChild(tailVeil);

  const fakeActions = document.createElement("div");
  fakeActions.textContent = "[调试操作按钮应在最后出现]";
  fakeActions.style.border = "1px solid #40e16f";
  fakeActions.style.padding = "8px";
  fakeActions.style.opacity = "0";
  fakeActions.style.pointerEvents = "none";
  fakeActions.style.transform = "translateY(8px)";
  fakeActions.style.transition = "opacity 600ms ease, transform 600ms ease";

  smokeRoot.appendChild(lead);
  smokeRoot.appendChild(bodyWrap);
  smokeRoot.appendChild(tailWrap);
  smokeRoot.appendChild(fakeActions);

  host.innerHTML = "";
  host.appendChild(smokeRoot);

  const panel = makeSmokePanel();
  document.body.appendChild(panel);

  const lineHeight = resolveLineHeightPx(host);
  const oneLine = Math.max(18, Math.round(lineHeight));
  const bodyScrollHeight = Math.max(oneLine, Math.ceil(body.scrollHeight));
  const tailScrollHeight = Math.max(oneLine, Math.ceil(tail.scrollHeight));

  bodyWrap.style.maxHeight = `${oneLine}px`;
  tailWrap.style.maxHeight = `${oneLine}px`;
  bodyVeil.style.height = `${Math.max(18, Math.round(lineHeight * 1.2))}px`;
  tailVeil.style.height = `${Math.max(18, Math.round(lineHeight * 1.2))}px`;

  const updatePanel = () => {
    const bodyTransition = window.getComputedStyle(bodyWrap).transitionDuration || bodyWrap.style.transitionDuration || "";
    const tailTransition = window.getComputedStyle(tailWrap).transitionDuration || tailWrap.style.transitionDuration || "";
    const actionsVisible = Number.parseFloat(fakeActions.style.opacity || "0") > 0.99;
    panel.textContent = [
      "smoke=true",
      `currentHostSelector=${hostSelector}`,
      `currentHostTagName=${host.tagName}`,
      `currentHostConnected=${host.isConnected ? "1" : "0"}`,
      `currentPhase=${phase}`,
      `body.maxHeight=${bodyWrap.style.maxHeight || ""}`,
      `body.scrollHeight=${Math.round(body.scrollHeight)}`,
      `tail.maxHeight=${tailWrap.style.maxHeight || ""}`,
      `tail.scrollHeight=${Math.round(tail.scrollHeight)}`,
      `body.transitionDuration=${bodyTransition}`,
      `tail.transitionDuration=${tailTransition}`,
      `actions.visible=${actionsVisible ? "1" : "0"}`,
      `hostReplacedCount=${hostReplacedCount}`
    ].join("\n");
  };

  const setPhase = (next) => {
    phase = String(next || "");
    updatePanel();
  };

  const writeAttrs = () => {
    host.setAttribute("data-scene-text-diagnostic", "smoke");
    host.setAttribute("data-scene-text-phase", phase);
    host.setAttribute("data-body-max-height", String(bodyWrap.style.maxHeight || ""));
    host.setAttribute("data-body-scroll-height", String(Math.round(body.scrollHeight)));
    host.setAttribute("data-tail-max-height", String(tailWrap.style.maxHeight || ""));
    host.setAttribute("data-tail-scroll-height", String(Math.round(tail.scrollHeight)));
  };

  const ticker = setInterval(() => {
    if (done) return;
    const currentHost = findVisibleSceneTextHost(appHost || document);
    if (currentHost && currentHost !== host) {
      hostReplacedCount += 1;
      setPhase("host_replaced");
      console.warn("SceneTextFxSmoke host_replaced", {
        oldHostTag: host.tagName,
        newHostTag: currentHost.tagName,
        at: Math.round(nowMs() - startTs)
      });
    }
    writeAttrs();
    updatePanel();
  }, 120);
  intervals.push(ticker);

  setPhase("lead_visible");
  writeAttrs();
  updatePanel();
  console.info("SceneTextFxSmoke start", {
    hostSelector,
    hostTagName: host.tagName,
    hostConnected: host.isConnected
  });

  void bodyWrap.getBoundingClientRect();
  void tailWrap.getBoundingClientRect();

  const tBody = setTimeout(() => {
    if (done) return;
    setPhase("body_expand");
    bodyWrap.style.transition = "max-height 4000ms ease";
    bodyWrap.style.maxHeight = `${bodyScrollHeight}px`;
    bodyVeil.style.transition = "opacity 4000ms ease";
    bodyVeil.style.opacity = "0";
    console.info("SceneTextFxSmoke body_expand_start");
  }, 500);
  timers.push(tBody);

  const tTail = setTimeout(() => {
    if (done) return;
    setPhase("tail_expand");
    tailWrap.style.transition = "max-height 2500ms ease";
    tailWrap.style.maxHeight = `${tailScrollHeight}px`;
    tailVeil.style.transition = "opacity 2500ms ease";
    tailVeil.style.opacity = "0";
    console.info("SceneTextFxSmoke tail_expand_start");
  }, 2500);
  timers.push(tTail);

  const tActions = setTimeout(() => {
    if (done) return;
    setPhase("actions_reveal");
    fakeActions.style.opacity = "1";
    fakeActions.style.pointerEvents = "auto";
    fakeActions.style.transform = "translateY(0)";
    console.info("SceneTextFxSmoke actions_reveal_start");
  }, 5500);
  timers.push(tActions);

  const tDone = setTimeout(() => {
    if (done) return;
    setPhase("done");
    console.info("SceneTextFxSmoke done");
  }, 6200);
  timers.push(tDone);

  return {
    cancel: () => {
      if (done) return;
      done = true;
      while (timers.length > 0) clearTimeout(timers.pop());
      while (intervals.length > 0) clearInterval(intervals.pop());
      if (panel.parentNode) panel.parentNode.removeChild(panel);
      if (host.isConnected) {
        host.innerHTML = originalHtml;
      }
    },
    getSnapshot: () => ({
      smoke: true,
      hostSelector,
      hostTagName: host.tagName,
      hostConnected: host.isConnected,
      phase,
      hostReplacedCount,
      bodyMaxHeight: bodyWrap.style.maxHeight,
      bodyScrollHeight: Math.round(body.scrollHeight),
      tailMaxHeight: tailWrap.style.maxHeight,
      tailScrollHeight: Math.round(tail.scrollHeight)
    })
  };
}

export function runSceneTextDomProbe({
  appHost,
  finalHost,
  choicesHost,
  finalHostId,
  renderCycle,
  attachedAtStage = "post_main_commit",
  currentMapId = "",
  currentSceneId = ""
} = {}) {
  const host = finalHost || findVisibleSceneTextHost(appHost || document);
  if (!host) {
    console.warn("SceneTextDomProbe final_host_missing");
    return {
      cancel: () => {},
      getSnapshot: () => ({
        state: "error",
        finalHostFound: false,
        phase: "final_host_missing"
      })
    };
  }

  const startedAt = nowMs();
  let phase = "attached";
  let replacedCount = 0;
  let done = false;
  let context = {
    renderCycle,
    attachedAtStage,
    currentMapId,
    currentSceneId
  };
  const timers = [];
  const intervals = [];

  const originalHostHtml = host.innerHTML;
  const originalChoicesProbe = choicesHost?.querySelector?.(".scene-text-dom-probe-actions") || null;
  if (originalChoicesProbe) {
    originalChoicesProbe.remove();
  }

  const root = document.createElement("div");
  root.className = "scene-text-dom-probe-root";
  root.style.display = "grid";
  root.style.gap = "0.7em";

  const attachedLabel = document.createElement("div");
  attachedLabel.textContent = "[SCENE TEXT PROBE ATTACHED]";
  attachedLabel.style.fontWeight = "700";
  attachedLabel.style.letterSpacing = "0.02em";
  attachedLabel.style.border = "2px solid #ff5d5d";
  attachedLabel.style.padding = "6px 8px";
  attachedLabel.style.background = "rgba(255, 93, 93, 0.18)";

  const lead = document.createElement("div");
  lead.textContent = "PROBE LEAD：如果你能看到这行，说明命中的就是当前可见正文 host。";
  lead.style.whiteSpace = "pre-wrap";
  lead.style.border = "2px solid red";
  lead.style.padding = "8px";

  const bodyWrap = document.createElement("div");
  bodyWrap.style.position = "relative";
  bodyWrap.style.overflow = "hidden";
  bodyWrap.style.border = "2px solid yellow";
  bodyWrap.style.background = "rgba(255,255,0,0.2)";

  const body = document.createElement("div");
  body.textContent = "PROBE BODY：这一块必须被折叠成一行，并在 4 秒内慢慢展开。\n如果你根本看不到折叠展开，说明 scene text 没有真正作用到最终可见正文节点上。";
  body.style.whiteSpace = "pre-wrap";
  body.style.padding = "8px";

  const bodyVeil = document.createElement("div");
  bodyVeil.style.position = "absolute";
  bodyVeil.style.left = "0";
  bodyVeil.style.right = "0";
  bodyVeil.style.bottom = "0";
  bodyVeil.style.pointerEvents = "none";
  bodyVeil.style.background = "linear-gradient(to bottom, rgba(20,20,20,0) 0%, rgba(20,20,20,0.94) 100%)";

  bodyWrap.appendChild(body);
  bodyWrap.appendChild(bodyVeil);

  const tailWrap = document.createElement("div");
  tailWrap.style.position = "relative";
  tailWrap.style.overflow = "hidden";
  tailWrap.style.border = "2px solid cyan";
  tailWrap.style.background = "rgba(0,255,255,0.18)";

  const tail = document.createElement("div");
  tail.textContent = "PROBE TAIL：这一块应当比 body 更晚展开。";
  tail.style.whiteSpace = "pre-wrap";
  tail.style.padding = "8px";

  const tailVeil = document.createElement("div");
  tailVeil.style.position = "absolute";
  tailVeil.style.left = "0";
  tailVeil.style.right = "0";
  tailVeil.style.bottom = "0";
  tailVeil.style.pointerEvents = "none";
  tailVeil.style.background = "linear-gradient(to bottom, rgba(20,20,20,0) 0%, rgba(20,20,20,0.96) 100%)";

  tailWrap.appendChild(tail);
  tailWrap.appendChild(tailVeil);

  root.appendChild(attachedLabel);
  root.appendChild(lead);
  root.appendChild(bodyWrap);
  root.appendChild(tailWrap);

  host.innerHTML = "";
  host.appendChild(root);

  const probeActions = document.createElement("div");
  probeActions.className = "scene-text-dom-probe-actions";
  probeActions.textContent = "[PROBE ACTIONS SHOULD APPEAR LAST]";
  probeActions.style.border = "2px solid #40e16f";
  probeActions.style.padding = "8px";
  probeActions.style.opacity = "0";
  probeActions.style.pointerEvents = "none";
  probeActions.style.transform = "translateY(8px)";
  probeActions.style.transition = "opacity 600ms ease, transform 600ms ease";

  if (choicesHost) {
    choicesHost.prepend(probeActions);
  } else {
    root.appendChild(probeActions);
  }

  const panel = makeSmokePanel();
  panel.className = "scene-text-dom-probe-panel";
  document.body.appendChild(panel);

  const lineHeight = resolveLineHeightPx(host);
  const oneLine = Math.max(18, Math.round(lineHeight));
  const bodyScrollHeight = Math.max(oneLine, Math.ceil(body.scrollHeight));
  const tailScrollHeight = Math.max(oneLine, Math.ceil(tail.scrollHeight));

  bodyWrap.style.maxHeight = `${oneLine}px`;
  tailWrap.style.maxHeight = `${oneLine}px`;
  bodyVeil.style.height = `${Math.max(18, Math.round(lineHeight * 1.3))}px`;
  tailVeil.style.height = `${Math.max(18, Math.round(lineHeight * 1.3))}px`;

  const writeHostAttrs = () => {
    host.setAttribute("data-final-scene-text-host", "1");
    host.setAttribute("data-final-scene-text-host-id", String(finalHostId || ""));
    host.setAttribute("data-final-scene-text-render-cycle", String(renderCycle || ""));
    host.setAttribute("data-scene-text-probe-phase", phase);
  };

  const updatePanel = () => {
    const bodyTransition = window.getComputedStyle(bodyWrap).transitionDuration || "";
    const tailTransition = window.getComputedStyle(tailWrap).transitionDuration || "";
    const actionsVisible = Number.parseFloat(probeActions.style.opacity || "0") > 0.99;
    panel.textContent = [
      "probe = true",
      `finalHostFound = ${host ? "true" : "false"}`,
      `finalHostId = ${String(finalHostId || "")}`,
      `finalHostConnected = ${host.isConnected ? "true" : "false"}`,
      `renderCycle = ${String(renderCycle || "")}`,
      `phase = ${phase}`,
      `body.maxHeight = ${bodyWrap.style.maxHeight || ""}`,
      `body.scrollHeight = ${Math.round(body.scrollHeight)}`,
      `tail.maxHeight = ${tailWrap.style.maxHeight || ""}`,
      `tail.scrollHeight = ${Math.round(tail.scrollHeight)}`,
      `replacedCount = ${replacedCount}`,
      `attachedAtStage = ${context.attachedAtStage}`,
      `currentMapId = ${String(context.currentMapId || "")}`,
      `currentSceneId = ${String(context.currentSceneId || "")}`,
      `body.transitionDuration = ${bodyTransition}`,
      `tail.transitionDuration = ${tailTransition}`,
      `actions.visible = ${actionsVisible ? "true" : "false"}`
    ].join("\n");
  };

  const setPhase = (next) => {
    phase = String(next || "");
    writeHostAttrs();
    updatePanel();
  };

  setPhase("lead_visible");
  console.info("SceneTextDomProbe attached", {
    finalHostId,
    renderCycle,
    attachedAtStage,
    currentMapId,
    currentSceneId
  });

  const hostWatcher = setInterval(() => {
    if (done) return;
    const currentHost = findVisibleSceneTextHost(appHost || document);
    if (currentHost && currentHost !== host) {
      replacedCount += 1;
      setPhase("host_replaced");
      console.warn("SceneTextDomProbe host_replaced", {
        oldHostId: finalHostId,
        newHostId: currentHost.getAttribute("data-final-scene-text-host-id") || "",
        oldRenderCycle: context.renderCycle,
        newRenderCycle: currentHost.getAttribute("data-final-scene-text-render-cycle") || ""
      });
    }
    updatePanel();
  }, 120);
  intervals.push(hostWatcher);

  void bodyWrap.getBoundingClientRect();
  void tailWrap.getBoundingClientRect();

  const tBody = setTimeout(() => {
    if (done) return;
    setPhase("body_expand");
    bodyWrap.style.transition = "max-height 4000ms ease";
    bodyWrap.style.maxHeight = `${bodyScrollHeight}px`;
    bodyVeil.style.transition = "opacity 4000ms ease";
    bodyVeil.style.opacity = "0";
  }, 500);
  timers.push(tBody);

  const tTail = setTimeout(() => {
    if (done) return;
    setPhase("tail_expand");
    tailWrap.style.transition = "max-height 2500ms ease";
    tailWrap.style.maxHeight = `${tailScrollHeight}px`;
    tailVeil.style.transition = "opacity 2500ms ease";
    tailVeil.style.opacity = "0";
  }, 2500);
  timers.push(tTail);

  const tActions = setTimeout(() => {
    if (done) return;
    setPhase("actions_reveal");
    probeActions.style.opacity = "1";
    probeActions.style.pointerEvents = "auto";
    probeActions.style.transform = "translateY(0)";
  }, 6000);
  timers.push(tActions);

  const tDone = setTimeout(() => {
    if (done) return;
    setPhase("done");
  }, 6700);
  timers.push(tDone);

  return {
    cancel: () => {
      if (done) return;
      done = true;
      while (timers.length > 0) clearTimeout(timers.pop());
      while (intervals.length > 0) clearInterval(intervals.pop());
      if (panel.parentNode) panel.parentNode.removeChild(panel);
      if (host.isConnected) {
        host.innerHTML = originalHostHtml;
      }
      if (probeActions.parentNode) {
        probeActions.parentNode.removeChild(probeActions);
      }
      if (originalChoicesProbe && choicesHost) {
        choicesHost.prepend(originalChoicesProbe);
      }
    },
    updateContext: (next = {}) => {
      context = {
        ...context,
        renderCycle: next.renderCycle ?? context.renderCycle,
        attachedAtStage: next.attachedAtStage ?? context.attachedAtStage,
        currentMapId: next.currentMapId ?? context.currentMapId,
        currentSceneId: next.currentSceneId ?? context.currentSceneId
      };
      updatePanel();
    },
    getSnapshot: () => ({
      state: done ? "done" : "running",
      finalHostFound: !!host,
      hostElement: host,
      finalHostId,
      renderCycle: context.renderCycle,
      phase,
      replacedCount,
      bodyMaxHeight: bodyWrap.style.maxHeight,
      bodyScrollHeight: Math.round(body.scrollHeight),
      tailMaxHeight: tailWrap.style.maxHeight,
      tailScrollHeight: Math.round(tail.scrollHeight),
      attachedAtStage: context.attachedAtStage,
      currentMapId: context.currentMapId,
      currentSceneId: context.currentSceneId
    })
  };
}

const _sceneTextDomLocatorState = {
  active: false,
  panel: null,
  markerRoot: null,
  selectedNode: null,
  selectedSelector: "",
  selectedHostId: "",
  selectedRenderCycle: 0,
  replacedCount: 0,
  stableCycles: 0,
  lastSnapshot: {
    ok: false,
    reason: "locator_not_started"
  },
  altClickBound: false,
  currentSnippet: ""
};

function normalizeInlineText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function buildDescriptionSnippet(text, targetNonWhitespace = 32) {
  const source = normalizeInlineText(text);
  if (!source) return "";
  const minCount = 24;
  const maxCount = 40;
  const target = Math.max(minCount, Math.min(maxCount, targetNonWhitespace));
  let nonWs = 0;
  let out = "";
  for (const ch of source) {
    out += ch;
    if (!/\s/.test(ch)) nonWs += 1;
    if (nonWs >= target) break;
  }
  return out.trim();
}

function rectIntersectsViewport(rect) {
  if (!rect) return false;
  return rect.width > 0
    && rect.height > 0
    && rect.bottom > 0
    && rect.right > 0
    && rect.left < window.innerWidth
    && rect.top < window.innerHeight;
}

function isVisibleElement(el) {
  if (!el || !(el instanceof Element)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rectIntersectsViewport(rect);
}

function countOverlapRatio(fullText, candidateText) {
  const a = normalizeInlineText(fullText);
  const b = normalizeInlineText(candidateText);
  if (!a || !b) return 0;

  const freq = new Map();
  for (const ch of a) {
    if (/\s/.test(ch)) continue;
    freq.set(ch, (freq.get(ch) || 0) + 1);
  }

  let matched = 0;
  for (const ch of b) {
    if (/\s/.test(ch)) continue;
    const n = freq.get(ch) || 0;
    if (n > 0) {
      freq.set(ch, n - 1);
      matched += 1;
    }
  }
  const total = Math.max(1, a.replace(/\s+/g, "").length);
  return matched / total;
}

function buildCssPath(el) {
  if (!el || !(el instanceof Element)) return "";
  const parts = [];
  let cur = el;
  while (cur && cur.nodeType === 1 && cur !== document.body) {
    let part = cur.tagName.toLowerCase();
    if (cur.id) {
      part += `#${cur.id}`;
      parts.unshift(part);
      break;
    }
    const className = String(cur.className || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    if (className) part += `.${className}`;
    const parent = cur.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((x) => x.tagName === cur.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(cur) + 1;
        part += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(part);
    cur = cur.parentElement;
  }
  return `body > ${parts.join(" > ")}`;
}

function buildXPathLike(el) {
  if (!el || !(el instanceof Element)) return "";
  const parts = [];
  let cur = el;
  while (cur && cur.nodeType === 1) {
    const tag = cur.tagName.toLowerCase();
    const parent = cur.parentElement;
    if (!parent) {
      parts.unshift(`/${tag}`);
      break;
    }
    const same = Array.from(parent.children).filter((x) => x.tagName === cur.tagName);
    const idx = same.indexOf(cur) + 1;
    parts.unshift(`/${tag}[${idx}]`);
    cur = parent;
    if (cur === document.body) {
      parts.unshift("/body[1]");
      break;
    }
  }
  return parts.join("");
}

function elementContextPenalty(el) {
  let cur = el;
  while (cur && cur !== document.body) {
    const id = String(cur.id || "").toLowerCase();
    const cls = String(cur.className || "").toLowerCase();
    const hay = `${id} ${cls}`;
    if (/(sidebar|status|choices|menu|hud|overlay|toolbar)/.test(hay)) {
      return 24;
    }
    cur = cur.parentElement;
  }
  return 0;
}

function describeElement(el, fullText, snippet) {
  const rect = el.getBoundingClientRect();
  const text = normalizeInlineText(el.textContent || "");
  const overlap = countOverlapRatio(fullText, text);
  const areaVisible = Math.max(0, Math.min(rect.width, window.innerWidth) * Math.min(rect.height, window.innerHeight));
  const leftBias = Math.max(0, (window.innerWidth * 0.55) - Math.max(0, rect.left));
  const penalty = elementContextPenalty(el);
  const descLen = Math.max(1, normalizeInlineText(fullText).length);
  const textLen = Math.max(1, text.length);
  const lenDelta = Math.abs(textLen - descLen) / Math.max(descLen, textLen);
  const lengthCloseness = 1 - Math.min(1, lenDelta);
  const childCountPenalty = Math.min(42, (el.querySelectorAll("*").length || 0) * 0.7);
  const oversizedPenalty = areaVisible > (window.innerWidth * window.innerHeight * 0.42) ? 20 : 0;
  const depth = buildCssPath(el).split(">").length;
  const descendantMatchPenalty = snippet && Array.from(el.children).some((child) => normalizeInlineText(child.textContent || "").includes(snippet))
    ? 55
    : 0;
  const score = overlap * 80
    + lengthCloseness * 48
    + areaVisible / 9000
    + leftBias / 140
    + depth * 1.5
    - penalty
    - childCountPenalty
    - oversizedPenalty
    - descendantMatchPenalty;

  return {
    node: el,
    score,
    overlap,
    rect: {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    },
    tagName: el.tagName.toLowerCase(),
    id: String(el.id || ""),
    className: String(el.className || ""),
    dataset: { ...el.dataset },
    selector: buildCssPath(el),
    xpathLike: buildXPathLike(el),
    textPreview: text.slice(0, 160)
  };
}

function ensureLocatorPanel() {
  if (_sceneTextDomLocatorState.panel && _sceneTextDomLocatorState.panel.isConnected) {
    return _sceneTextDomLocatorState.panel;
  }
  const panel = document.createElement("pre");
  panel.className = "scene-text-dom-locator-panel";
  panel.style.position = "fixed";
  panel.style.top = "8px";
  panel.style.right = "8px";
  panel.style.zIndex = "10001";
  panel.style.margin = "0";
  panel.style.padding = "10px 12px";
  panel.style.background = "rgba(0,0,0,0.86)";
  panel.style.color = "#e3f2ff";
  panel.style.border = "1px solid rgba(255,255,255,0.58)";
  panel.style.font = "12px/1.35 Consolas, Menlo, monospace";
  panel.style.pointerEvents = "none";
  panel.style.whiteSpace = "pre";
  panel.style.maxWidth = "48vw";
  document.body.appendChild(panel);
  _sceneTextDomLocatorState.panel = panel;
  return panel;
}

function ensureLocatorMarkerRoot() {
  if (_sceneTextDomLocatorState.markerRoot && _sceneTextDomLocatorState.markerRoot.isConnected) {
    return _sceneTextDomLocatorState.markerRoot;
  }
  const root = document.createElement("div");
  root.className = "scene-text-dom-locator-markers";
  root.style.position = "fixed";
  root.style.inset = "0";
  root.style.zIndex = "10000";
  root.style.pointerEvents = "none";
  document.body.appendChild(root);
  _sceneTextDomLocatorState.markerRoot = root;
  return root;
}

function clearLocatorMarkers() {
  const root = ensureLocatorMarkerRoot();
  root.textContent = "";
}

function drawLocatorCandidateMarker(candidate, rank) {
  if (!candidate || !candidate.node) return;
  const rect = candidate.node.getBoundingClientRect();
  if (!rectIntersectsViewport(rect)) return;
  const colors = ["#ff4b4b", "#ffd44d", "#4db8ff"];
  const color = colors[Math.max(0, Math.min(colors.length - 1, rank - 1))];
  const root = ensureLocatorMarkerRoot();

  const box = document.createElement("div");
  box.style.position = "fixed";
  box.style.left = `${Math.round(rect.left)}px`;
  box.style.top = `${Math.round(rect.top)}px`;
  box.style.width = `${Math.max(0, Math.round(rect.width))}px`;
  box.style.height = `${Math.max(0, Math.round(rect.height))}px`;
  box.style.border = `2px solid ${color}`;
  box.style.boxSizing = "border-box";
  box.style.background = "transparent";

  const tag = document.createElement("div");
  tag.textContent = `CANDIDATE #${rank}`;
  tag.style.position = "absolute";
  tag.style.left = "0";
  tag.style.top = "-18px";
  tag.style.padding = "1px 6px";
  tag.style.background = color;
  tag.style.color = "#111";
  tag.style.font = "11px/1.2 Consolas, Menlo, monospace";
  tag.style.fontWeight = "700";
  box.appendChild(tag);

  root.appendChild(box);
}

function installAltClickInspector() {
  if (_sceneTextDomLocatorState.altClickBound) return;
  _sceneTextDomLocatorState.altClickBound = true;
  window.addEventListener("click", (event) => {
    if (!_sceneTextDomLocatorState.active) return;
    if (!event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();

    const chain = [];
    let cur = target;
    for (let i = 0; i < 8 && cur; i++) {
      chain.push(cur);
      cur = cur.parentElement;
    }

    const colors = ["#ff4b4b", "#ffa64d", "#ffd44d", "#8dff4d", "#4dffd2", "#4db8ff", "#9f7dff", "#ff7dd1"];
    const logs = chain.map((node, idx) => {
      node.style.outline = `2px solid ${colors[idx % colors.length]}`;
      node.style.outlineOffset = "-1px";
      setTimeout(() => {
        if (!node.isConnected) return;
        if (node.style.outline.includes(colors[idx % colors.length])) {
          node.style.removeProperty("outline");
          node.style.removeProperty("outline-offset");
        }
      }, 1800);

      const rect = node.getBoundingClientRect();
      const text = normalizeInlineText(node.textContent || "");
      return {
        depth: idx,
        tagName: node.tagName.toLowerCase(),
        id: String(node.id || ""),
        className: String(node.className || ""),
        dataset: { ...node.dataset },
        textPreview: text.slice(0, 120),
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        containsSnippet: _sceneTextDomLocatorState.currentSnippet
          ? text.includes(_sceneTextDomLocatorState.currentSnippet)
          : false,
        selector: buildCssPath(node)
      };
    });
    console.info("SceneTextDomLocator alt_click_chain", logs);
  }, true);
}

function updateLocatorPanel(snapshot) {
  const panel = ensureLocatorPanel();
  const c1 = snapshot.candidates[0] || null;
  const c2 = snapshot.candidates[1] || null;
  const c3 = snapshot.candidates[2] || null;
  panel.textContent = [
    "locator = true",
    `currentMapId = ${snapshot.currentMapId}`,
    `currentSceneId = ${snapshot.currentSceneId}`,
    `descriptionSnippet = ${snapshot.descriptionSnippet}`,
    `candidateCount = ${snapshot.candidateCount}`,
    `candidate1 selector = ${c1?.selector || ""}`,
    `candidate1 overlap ratio = ${c1 ? c1.overlap.toFixed(3) : ""}`,
    `candidate1 rect = ${c1 ? `${c1.rect.left},${c1.rect.top},${c1.rect.width},${c1.rect.height}` : ""}`,
    `candidate2 selector = ${c2?.selector || ""}`,
    `candidate3 selector = ${c3?.selector || ""}`,
    `selectedActualNode selector = ${snapshot.selectedSelector || ""}`,
    `selectedActualNode hostId = ${snapshot.selectedHostId || ""}`,
    `replacedCount = ${snapshot.replacedCount}`,
    `attachedAtStage = ${snapshot.attachedAtStage}`,
    `renderCycle = ${snapshot.renderCycle}`,
    `phase = ${snapshot.phase}`,
    `finalHostFound = ${snapshot.finalHostFound ? "true" : "false"}`
  ].join("\n");
}

export function runSceneTextDomLocator({
  descriptionText = "",
  renderCycle = 0,
  attachedAtStage = "post_main_commit",
  currentMapId = "",
  currentSceneId = ""
} = {}) {
  _sceneTextDomLocatorState.active = true;
  installAltClickInspector();

  const snippet = buildDescriptionSnippet(descriptionText, 32);
  _sceneTextDomLocatorState.currentSnippet = snippet;

  const all = Array.from(document.body.querySelectorAll("*"));
  const candidates = [];
  for (const el of all) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.classList.contains("scene-text-dom-locator-panel")) continue;
    if (el.classList.contains("scene-text-dom-locator-markers")) continue;
    if (!isVisibleElement(el)) continue;
    const text = normalizeInlineText(el.textContent || "");
    if (!text) continue;
    if (snippet && !text.includes(snippet)) continue;
    candidates.push(describeElement(el, descriptionText, snippet));
  }

  candidates.sort((a, b) => b.score - a.score);
  const top10 = candidates.slice(0, 10);
  const selected = top10[0] || null;

  clearLocatorMarkers();
  for (let i = 0; i < Math.min(3, top10.length); i++) {
    drawLocatorCandidateMarker(top10[i], i + 1);
  }

  if (top10.length > 0) {
    console.info("SceneTextDomLocator top10", top10.map((x) => ({
      tagName: x.tagName,
      className: x.className,
      id: x.id,
      dataset: x.dataset,
      rect: x.rect,
      overlap: Number(x.overlap.toFixed(4)),
      selector: x.selector,
      xpathLike: x.xpathLike,
      renderCycle
    })));
  }

  let replacedCount = _sceneTextDomLocatorState.replacedCount;
  if (_sceneTextDomLocatorState.selectedNode && selected && _sceneTextDomLocatorState.selectedNode !== selected.node) {
    replacedCount += 1;
    const newHostId = selected?.node?.getAttribute?.("data-final-scene-text-host-id") || "";
    console.warn("SceneTextDomLocator host_replaced", {
      oldSelector: _sceneTextDomLocatorState.selectedSelector,
      newSelector: selected.selector,
      oldHostId: _sceneTextDomLocatorState.selectedHostId,
      newHostId,
      oldRenderCycle: _sceneTextDomLocatorState.selectedRenderCycle,
      newRenderCycle: renderCycle
    });
  }

  const stableCycles = (selected && _sceneTextDomLocatorState.selectedNode === selected.node)
    ? _sceneTextDomLocatorState.stableCycles + 1
    : 0;

  _sceneTextDomLocatorState.selectedNode = selected?.node || null;
  _sceneTextDomLocatorState.selectedSelector = selected?.selector || "";
  _sceneTextDomLocatorState.selectedHostId = selected?.node?.getAttribute?.("data-final-scene-text-host-id") || "";
  _sceneTextDomLocatorState.selectedRenderCycle = renderCycle;
  _sceneTextDomLocatorState.replacedCount = replacedCount;
  _sceneTextDomLocatorState.stableCycles = stableCycles;

  const snapshot = {
    ok: true,
    locator: true,
    phase: selected ? "selected" : "final_host_missing",
    finalHostFound: !!selected,
    descriptionSnippet: snippet,
    candidateCount: top10.length,
    candidates: top10.map((x) => ({
      tagName: x.tagName,
      className: x.className,
      id: x.id,
      dataset: x.dataset,
      rect: x.rect,
      overlap: x.overlap,
      selector: x.selector,
      xpathLike: x.xpathLike,
      renderCycle
    })),
    selectedSelector: selected?.selector || "",
    selectedTagName: selected?.tagName || "",
    selectedClassName: selected?.className || "",
    selectedId: selected?.id || "",
    selectedRect: selected?.rect || null,
    selectedOverlap: selected?.overlap || 0,
    selectedHostId: selected?.node?.getAttribute?.("data-final-scene-text-host-id") || "",
    renderCycle,
    attachedAtStage,
    currentMapId: String(currentMapId || ""),
    currentSceneId: String(currentSceneId || ""),
    replacedCount,
    stableCycles
  };

  updateLocatorPanel(snapshot);
  _sceneTextDomLocatorState.lastSnapshot = snapshot;
  return snapshot;
}

export function getSceneTextDomLocatorSnapshot() {
  return _sceneTextDomLocatorState.lastSnapshot;
}

export function stopSceneTextDomLocator() {
  _sceneTextDomLocatorState.active = false;
  _sceneTextDomLocatorState.currentSnippet = "";
  _sceneTextDomLocatorState.selectedNode = null;
  _sceneTextDomLocatorState.selectedSelector = "";
  _sceneTextDomLocatorState.selectedHostId = "";
  _sceneTextDomLocatorState.selectedRenderCycle = 0;
  _sceneTextDomLocatorState.replacedCount = 0;
  _sceneTextDomLocatorState.stableCycles = 0;
  _sceneTextDomLocatorState.lastSnapshot = {
    ok: false,
    reason: "locator_stopped"
  };

  if (_sceneTextDomLocatorState.panel?.isConnected) {
    _sceneTextDomLocatorState.panel.parentNode.removeChild(_sceneTextDomLocatorState.panel);
  }
  _sceneTextDomLocatorState.panel = null;

  if (_sceneTextDomLocatorState.markerRoot?.isConnected) {
    _sceneTextDomLocatorState.markerRoot.parentNode.removeChild(_sceneTextDomLocatorState.markerRoot);
  }
  _sceneTextDomLocatorState.markerRoot = null;
}
