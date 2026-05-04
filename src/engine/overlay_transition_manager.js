import { getOverlayTransitionPreset } from "./transition_presets.js";

function canUseWaapi(host) {
  return !!host && typeof host.animate === "function";
}

function createNoopAnimation() {
  return {
    cancel() {},
    finished: Promise.resolve()
  };
}

export function createOverlayTransitionManager(options = {}) {
  const getReducedMotion = typeof options.getReducedMotion === "function"
    ? options.getReducedMotion
    : (() => false);

  let activeToken = 0;
  let activeAnimations = [];
  let activeMeta = null;

  function cancelActive(reason = "replaced") {
    if (activeAnimations.length === 0) return;
    const prev = activeMeta;
    for (const animation of activeAnimations) {
      try {
        animation.cancel();
      } catch {
        // no-op
      }
    }
    activeAnimations = [];
    activeMeta = null;
    if (typeof options.onTrace === "function") {
      options.onTrace({
        stage: "overlay_transition_cancel",
        reason,
        token: activeToken,
        ...prev
      });
    }
  }

  function play(host, keyframes, timing) {
    if (!canUseWaapi(host)) {
      return createNoopAnimation();
    }
    try {
      const animation = host.animate(keyframes, timing);
      return animation;
    } catch {
      return createNoopAnimation();
    }
  }

  function runTransition(input = {}) {
    const fromHost = input.fromHost || null;
    const toHost = input.toHost || null;
    const fromHostId = String(input.fromHostId || "") || null;
    const toHostId = String(input.toHostId || "") || null;
    const presetName = String(input.presetName || "softPanel") || "softPanel";
    const canonicalOverlay = input.canonicalOverlay ?? null;
    const expectedHostId = input.expectedHostId ?? null;

    cancelActive("preempted");
    activeToken += 1;
    const token = activeToken;

    const preset = getOverlayTransitionPreset(presetName);
    const reducedMotion = !!getReducedMotion();
    const duration = reducedMotion ? Math.min(80, preset.duration) : preset.duration;
    const timing = {
      duration,
      easing: preset.easing,
      fill: "both"
    };

    const meta = {
      fromHostId,
      toHostId,
      preset: preset.name,
      canonicalOverlay,
      expectedHostId
    };

    if (typeof options.onTrace === "function") {
      options.onTrace({
        stage: "overlay_transition_start",
        token,
        ...meta
      });
    }

    const animations = [];
    if (fromHost && fromHost !== toHost && fromHostId) {
      animations.push(play(fromHost, preset.exitKeyframes, timing));
    }
    if (toHost && toHostId) {
      animations.push(play(toHost, preset.enterKeyframes, timing));
    }

    activeAnimations = animations;
    activeMeta = meta;

    Promise.allSettled(animations.map((anim) => anim.finished)).then(() => {
      if (token !== activeToken) return;
      activeAnimations = [];
      activeMeta = null;
      if (typeof options.onTrace === "function") {
        options.onTrace({
          stage: "overlay_transition_finish",
          token,
          ...meta
        });
      }

      if (typeof options.getRenderedActiveHostId === "function"
        && expectedHostId
        && typeof options.onViolation === "function") {
        const renderedActiveHostId = options.getRenderedActiveHostId();
        if (renderedActiveHostId !== expectedHostId) {
          options.onViolation({
            code: "UI_OVERLAY_TRANSITION_CANONICAL_MISMATCH",
            message: `transition finished with host mismatch expected=${expectedHostId} actual=${renderedActiveHostId || "map-main-host"}`,
            details: {
              renderedActiveHostId,
              ...meta
            }
          });
        }
      }
    });
  }

  return {
    runTransition,
    cancelActive
  };
}
