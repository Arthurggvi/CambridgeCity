let _profileClosePromise = null;
const PROFILE_OVERLAY_UI_STATE = new WeakMap();
const WORLDVIEW_AXIS_PULSE_MS = 560;

function clearWorldviewAxisPulseTimer(state) {
  if (!state?.worldviewAxisPulseTimerId) return;
  clearTimeout(state.worldviewAxisPulseTimerId);
  state.worldviewAxisPulseTimerId = 0;
}

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function buildWorldviewAxisSnapshotKey(snapshot = {}) {
  const axis = Number.isFinite(Number(snapshot.currentAxis))
    ? Math.trunc(Number(snapshot.currentAxis))
    : 0;
  const level = String(snapshot.currentLevel || "0").trim().toUpperCase() || "0";
  return `${axis}:${level}`;
}

function createDefaultProfileOverlayUiState() {
  return {
    selectedAttrId: null,
    annotationScrollTop: 0,
    worldviewAxisSnapshotKey: null,
    worldviewAxisPulseUntil: 0,
    worldviewAxisPulseTimerId: 0
  };
}

export function getProfileOverlayUiState(host) {
  if (!host) return createDefaultProfileOverlayUiState();
  const existing = PROFILE_OVERLAY_UI_STATE.get(host);
  if (existing) return existing;
  const next = createDefaultProfileOverlayUiState();
  PROFILE_OVERLAY_UI_STATE.set(host, next);
  return next;
}

export function resetProfileOverlayUiState(host) {
  if (!host) return createDefaultProfileOverlayUiState();
  const existing = PROFILE_OVERLAY_UI_STATE.get(host);
  if (existing) {
    clearWorldviewAxisPulseTimer(existing);
  }
  const next = createDefaultProfileOverlayUiState();
  PROFILE_OVERLAY_UI_STATE.set(host, next);
  return next;
}

export function setProfileOverlaySelectedAttrId(host, attrId) {
  const state = getProfileOverlayUiState(host);
  const normalizedAttrId = String(attrId || "").trim() || null;
  state.selectedAttrId = normalizedAttrId;
  state.annotationScrollTop = 0;
  return state;
}

export function rememberProfileOverlayAnnotationScrollTop(host, scrollTop) {
  const state = getProfileOverlayUiState(host);
  state.annotationScrollTop = Math.max(0, Math.floor(Number(scrollTop) || 0));
  return state;
}

export function syncProfileOverlayWorldviewAxisMotion(host, snapshot = {}) {
  const state = getProfileOverlayUiState(host);
  const reducedMotion = prefersReducedMotion();
  const snapshotKey = buildWorldviewAxisSnapshotKey(snapshot);
  const hadPreviousSnapshot = typeof state.worldviewAxisSnapshotKey === "string";
  const changed = hadPreviousSnapshot && state.worldviewAxisSnapshotKey !== snapshotKey;
  state.worldviewAxisSnapshotKey = snapshotKey;

  if (reducedMotion) {
    clearWorldviewAxisPulseTimer(state);
    state.worldviewAxisPulseUntil = 0;
    return {
      isActive: false,
      isPulsing: false,
      reducedMotion: true,
      pulseDurationMs: 0
    };
  }

  if (changed) {
    state.worldviewAxisPulseUntil = Date.now() + WORLDVIEW_AXIS_PULSE_MS;
    clearWorldviewAxisPulseTimer(state);
    state.worldviewAxisPulseTimerId = setTimeout(() => {
      state.worldviewAxisPulseUntil = 0;
      state.worldviewAxisPulseTimerId = 0;
      if (!host) return;
      const axisNode = host.querySelector(".profile-page-worldview-card");
      if (axisNode) {
        axisNode.classList.remove("is-axis-pulsing");
      }
    }, WORLDVIEW_AXIS_PULSE_MS);
  }

  return {
    isActive: true,
    isPulsing: Date.now() < Math.max(0, Number(state.worldviewAxisPulseUntil) || 0),
    reducedMotion: false,
    pulseDurationMs: WORLDVIEW_AXIS_PULSE_MS
  };
}

function waitForProfileCloseSignal(overlay) {
  return new Promise((resolve) => {
    if (!overlay) {
      resolve({ source: "none" });
      return;
    }
    const dialog = overlay.querySelector(".profile-page-dialog");
    const backdrop = overlay.querySelector(".profile-page-backdrop");
    let done = false;
    const finish = (source) => {
      if (done) return;
      done = true;
      overlay.removeEventListener("transitionend", onEnd);
      overlay.removeEventListener("animationend", onEnd);
      if (dialog) {
        dialog.removeEventListener("transitionend", onEnd);
        dialog.removeEventListener("animationend", onEnd);
      }
      if (backdrop) {
        backdrop.removeEventListener("transitionend", onEnd);
        backdrop.removeEventListener("animationend", onEnd);
      }
      clearTimeout(timer);
      resolve({ source });
    };
    const onEnd = (event) => {
      const target = event?.target;
      if (target !== overlay && target !== dialog && target !== backdrop) return;
      finish("event");
    };
    overlay.addEventListener("transitionend", onEnd);
    overlay.addEventListener("animationend", onEnd);
    if (dialog) {
      dialog.addEventListener("transitionend", onEnd);
      dialog.addEventListener("animationend", onEnd);
    }
    if (backdrop) {
      backdrop.addEventListener("transitionend", onEnd);
      backdrop.addEventListener("animationend", onEnd);
    }
    const timer = setTimeout(() => finish("timeout"), 280);
  });
}

export function isProfileOverlayClosing(host) {
  if (!host) return false;
  return host.dataset.profileClosing === "true";
}

export function showProfileOverlay(host, overlay) {
  if (!host || !overlay) return;
  host.dataset.profileClosing = "false";
  host.setAttribute("aria-hidden", "false");
  host.hidden = false;

  const dialog = overlay.querySelector(".profile-page-dialog");
  const backdrop = overlay.querySelector(".profile-page-backdrop");
  if (dialog) {
    dialog.style.transition = "";
    dialog.style.opacity = "";
    dialog.style.transform = "";
  }
  if (backdrop) {
    backdrop.style.transition = "";
    backdrop.style.opacity = "";
  }

  overlay.classList.remove("is-closing");
  if (overlay.classList.contains("is-visible")) return;

  requestAnimationFrame(() => {
    if (!overlay.isConnected) return;
    requestAnimationFrame(() => {
      if (!overlay.isConnected) return;
      overlay.classList.add("is-visible");
    });
  });
}

export async function closeProfileOverlay(host, options = {}) {
  if (!host) {
    if (typeof options.dispatchClose === "function") {
      await options.dispatchClose();
    }
    return;
  }

  if (_profileClosePromise) {
    await _profileClosePromise;
    return;
  }

  _profileClosePromise = (async () => {
    const overlay = host.querySelector(".profile-page-overlay");
    host.dataset.profileClosing = "true";

    if (overlay) {
      const dialog = overlay.querySelector(".profile-page-dialog");
      const backdrop = overlay.querySelector(".profile-page-backdrop");

      if (dialog) {
        const dialogStyle = getComputedStyle(dialog);
        dialog.style.transition = "opacity 220ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        dialog.style.opacity = dialogStyle.opacity;
        dialog.style.transform = dialogStyle.transform === "none" ? "translateY(0) scale(1)" : dialogStyle.transform;
      }
      if (backdrop) {
        const backdropStyle = getComputedStyle(backdrop);
        backdrop.style.transition = "opacity 200ms ease";
        backdrop.style.opacity = backdropStyle.opacity;
      }

      overlay.classList.add("is-closing");
      overlay.classList.remove("is-visible");

      requestAnimationFrame(() => {
        if (!overlay.isConnected) return;
        if (dialog) {
          dialog.style.opacity = "0";
          dialog.style.transform = "translateY(10px) scale(0.992)";
        }
        if (backdrop) {
          backdrop.style.opacity = "0";
        }
      });

      await waitForProfileCloseSignal(overlay);
    }

    if (typeof options.dispatchClose === "function") {
      await options.dispatchClose();
    }

    resetProfileOverlayUiState(host);
    host.innerHTML = "";
    host.setAttribute("aria-hidden", "true");
    host.hidden = true;
    host.dataset.profileClosing = "false";
  })();

  try {
    await _profileClosePromise;
  } finally {
    _profileClosePromise = null;
  }
}
