import { dispatch } from "./pipeline/dispatch.js";
import { getLiveRenderedSurfaceSnapshot } from "./renderer.js";
import { createMenuTransitionRuntimeOwner, createTransitionRuntimeOwnerAdapter } from "./transition_dom_ownership.js";

const MENU_TRANSITION_TRACE_MAX = 320;
const MENU_ENTRY_ACTION_RE = /^(menu_new_game|menu_continue_auto|menu_load:)/;

const _transitionRuntimeOwner = createTransitionRuntimeOwnerAdapter(
  createMenuTransitionRuntimeOwner({
    inMs: 220,
    holdMs: 40,
    outMs: 920
  })
);

let _menuTransitionInputLocked = false;

function getTraceBuffer() {
  if (typeof window === "undefined") return null;
  if (!Array.isArray(window.__MENU_TRANSITION_COORDINATOR_TRACE__)) {
    window.__MENU_TRANSITION_COORDINATOR_TRACE__ = [];
  }
  return window.__MENU_TRANSITION_COORDINATOR_TRACE__;
}

function pushTrace(entry) {
  const trace = getTraceBuffer();
  if (!trace) return;
  trace.push({
    ts: new Date().toISOString(),
    ...entry
  });
  if (trace.length > MENU_TRANSITION_TRACE_MAX) {
    trace.splice(0, trace.length - MENU_TRANSITION_TRACE_MAX);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function rafTick() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      setTimeout(resolve, 16);
      return;
    }
    requestAnimationFrame(() => resolve());
  });
}

function setInputLock(locked) {
  _menuTransitionInputLocked = !!locked;
  if (typeof document === "undefined") return;
  if (_menuTransitionInputLocked) {
    document.body.dataset.menuTransitionInputLocked = "1";
  } else {
    delete document.body.dataset.menuTransitionInputLocked;
  }
}

function isMenuEntryAction(actionId) {
  return MENU_ENTRY_ACTION_RE.test(String(actionId || ""));
}

async function waitForGameplayArrivalStable({ actionId, timeoutMs = 6000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const live = getLiveRenderedSurfaceSnapshot();
    if (live?.isGameplayLike === true) {
      await rafTick();
      await rafTick();
      const stableLive = getLiveRenderedSurfaceSnapshot();
      const stable = stableLive?.isGameplayLike === true;
      pushTrace({
        stage: "render:surface gameplay stable",
        actionId: String(actionId || ""),
        liveSurface: stableLive,
        stable
      });
      if (stable) return true;
    }
    await sleep(32);
  }
  pushTrace({
    stage: "render:surface gameplay stable",
    actionId: String(actionId || ""),
    liveSurface: getLiveRenderedSurfaceSnapshot(),
    stable: false,
    timeout: true
  });
  return false;
}

export function isMenuTransitionInputLocked() {
  return _menuTransitionInputLocked;
}

export function getMenuTransitionCoordinatorTraceTail(limit = 120) {
  const trace = getTraceBuffer() || [];
  const size = Math.max(1, Number(limit || 120));
  return trace.slice(-size);
}

export function getMenuTransitionCoordinatorOwnerSnapshot() {
  return _transitionRuntimeOwner.snapshot();
}

export async function dispatchWithMenuTransitionCoordinator(actionId, payload = {}, options = {}) {
  const id = String(actionId || "");
  if (!isMenuEntryAction(id)) {
    return dispatch(actionId, payload, options);
  }

  const liveAtClick = getLiveRenderedSurfaceSnapshot();
  if (!liveAtClick?.isMenuLike) {
    return dispatch(actionId, payload, options);
  }

  setInputLock(true);
  pushTrace({ stage: "click", actionId: id, liveSurface: liveAtClick });

  try {
    pushTrace({ stage: "playIn start", actionId: id, liveSurface: getLiveRenderedSurfaceSnapshot() });
    await _transitionRuntimeOwner.playIn("menu_cinematic", {
      source: "menu_transition_coordinator",
      stage: "pre_roll"
    });

    pushTrace({ stage: "dispatch start", actionId: id, liveSurface: getLiveRenderedSurfaceSnapshot() });

    const dispatchResult = await dispatch(actionId, payload, {
      ...options,
      returnReport: true
    });

    const businessOk = !!dispatchResult?.ok;
    if (!businessOk) {
      pushTrace({
        stage: "business failed",
        actionId: id,
        reason: String(dispatchResult?.reason || "unknown"),
        liveSurface: getLiveRenderedSurfaceSnapshot()
      });
      pushTrace({ stage: "playOut start", actionId: id, liveSurface: getLiveRenderedSurfaceSnapshot() });
      await _transitionRuntimeOwner.playOut("menu_cinematic", {
        source: "menu_transition_coordinator",
        stage: "rollback_out"
      });
      return options?.returnReport === true ? dispatchResult : false;
    }

    const arrived = await waitForGameplayArrivalStable({ actionId: id });
    if (!arrived) {
      pushTrace({ stage: "arrival timeout", actionId: id, liveSurface: getLiveRenderedSurfaceSnapshot() });
      pushTrace({ stage: "playOut start", actionId: id, liveSurface: getLiveRenderedSurfaceSnapshot() });
      await _transitionRuntimeOwner.playOut("menu_cinematic", {
        source: "menu_transition_coordinator",
        stage: "timeout_out"
      });
      return options?.returnReport === true ? dispatchResult : true;
    }

    pushTrace({ stage: "playOut start", actionId: id, liveSurface: getLiveRenderedSurfaceSnapshot() });
    await _transitionRuntimeOwner.playOut("menu_cinematic", {
      source: "menu_transition_coordinator",
      stage: "arrival_out"
    });

    return options?.returnReport === true ? dispatchResult : true;
  } catch (error) {
    _transitionRuntimeOwner.cancel("menu_transition_exception");
    pushTrace({
      stage: "exception",
      actionId: id,
      error: String(error?.message || error || "unknown_error"),
      liveSurface: getLiveRenderedSurfaceSnapshot()
    });
    throw error;
  } finally {
    setInputLock(false);
    pushTrace({ stage: "unlock", actionId: id, liveSurface: getLiveRenderedSurfaceSnapshot() });
  }
}
