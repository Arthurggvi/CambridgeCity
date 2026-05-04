export const TRANSITION_DOM_OWNERSHIP_PROPOSAL = Object.freeze({
  currentOwner: "runtime/transition_owner",
  targetOwner: "runtime/transition_owner",
  currentDomTouchpoints: [
    {
      file: "src/engine/pipeline/dispatch.js",
      functionName: "playMenuAtmosphereIn",
      operations: ["transitionRuntimeOwner.ensureTransitionHost", "transitionRuntimeOwner.playIn"]
    },
    {
      file: "src/engine/pipeline/dispatch.js",
      functionName: "playMenuAtmosphereOut",
      operations: ["transitionRuntimeOwner.playOut"]
    },
    {
      file: "src/engine/pipeline/dispatch.js",
      functionName: "getTransitionRuntimeOwnerSnapshot",
      operations: ["transitionRuntimeOwner.snapshot"]
    },
    {
      file: "src/engine/transition_dom_ownership.js",
      functionName: "createMenuTransitionRuntimeOwner",
      operations: [
        "document.getElementById",
        "document.createElement",
        "document.body.appendChild",
        "document.body.classList.add/remove",
        "overlay.classList.add/remove"
      ]
    }
  ],
  minimalInterface: [
    "ensureTransitionHost(): HTMLElement",
    "playIn(preset, context): Promise<void>",
    "playOut(preset, context): Promise<void>",
    "cancel(reason): void",
    "snapshot(): { phase, hostConnected, owner }"
  ]
});

export function getTransitionDomOwnershipProposal() {
  return TRANSITION_DOM_OWNERSHIP_PROPOSAL;
}

export function createTransitionRuntimeOwnerAdapter(runtime = null) {
  return {
    ensureTransitionHost: (context = {}) => runtime?.ensureTransitionHost?.(context) || null,
    playIn: async (preset, context = {}) => {
      if (typeof runtime?.playIn === "function") {
        await runtime.playIn(preset, context);
      }
    },
    playOut: async (preset, context = {}) => {
      if (typeof runtime?.playOut === "function") {
        await runtime.playOut(preset, context);
      }
    },
    cancel: (reason = "cancelled") => {
      if (typeof runtime?.cancel === "function") {
        runtime.cancel(reason);
      }
    },
    snapshot: () => {
      if (typeof runtime?.snapshot === "function") {
        return runtime.snapshot();
      }
      return {
        phase: "idle",
        hostConnected: false,
        owner: "runtime/transition_owner"
      };
    }
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

export function createMenuTransitionRuntimeOwner({
  documentRoot,
  inMs = 980,
  holdMs = 180,
  outMs = 920,
  owner = "runtime/transition_owner"
} = {}) {
  const state = {
    host: null,
    hostCreatedCount: 0,
    phase: "idle",
    owner,
    token: 0,
    cancelledAt: 0,
    cancelReason: ""
  };

  const doc = () => documentRoot || (typeof document !== "undefined" ? document : null);

  const ensureTransitionHost = () => {
    const d = doc();
    if (!d) return null;
    let host = d.getElementById("menu-transition-overlay");
    if (!host) {
      host = d.createElement("div");
      host.id = "menu-transition-overlay";
      host.className = "menu-transition-overlay";
      host.setAttribute("aria-hidden", "true");
      d.body.appendChild(host);
      state.hostCreatedCount += 1;
    }
    state.host = host;
    return host;
  };

  const resetClasses = (host) => {
    if (!host) return;
    host.classList.remove("is-in", "is-hold", "is-out");
  };

  const playIn = async () => {
    const d = doc();
    const host = ensureTransitionHost();
    if (!d || !host) return;

    const token = ++state.token;
    state.phase = "play_in";
    d.body.classList.add("menu-transition-cinematic");
    host.classList.remove("is-out", "is-hold");
    host.classList.add("is-in");

    await sleep(inMs);
    if (token !== state.token) return;

    host.classList.remove("is-in");
    host.classList.add("is-hold");
    state.phase = "hold";

    await sleep(holdMs);
    if (token !== state.token) return;
    state.phase = "hold_done";
  };

  const playOut = async () => {
    const d = doc();
    const host = ensureTransitionHost();
    if (!d || !host) return;

    const token = ++state.token;
    state.phase = "play_out";
    host.classList.remove("is-hold", "is-in");
    host.classList.add("is-out");

    await sleep(outMs + 40);
    if (token !== state.token) return;

    host.classList.remove("is-out");
    d.body.classList.remove("menu-transition-cinematic");
    state.phase = "idle";
  };

  const cancel = (reason = "cancelled") => {
    const d = doc();
    const host = state.host && state.host.isConnected ? state.host : ensureTransitionHost();
    state.token += 1;
    state.cancelledAt = Date.now();
    state.cancelReason = String(reason || "cancelled");
    state.phase = "cancelled";
    if (host) resetClasses(host);
    if (d) {
      d.body.classList.remove("menu-transition-cinematic");
    }
  };

  const snapshot = () => {
    const host = state.host && state.host.isConnected ? state.host : (doc()?.getElementById("menu-transition-overlay") || null);
    return {
      owner: state.owner,
      phase: state.phase,
      hostExists: !!host,
      hostConnected: !!host?.isConnected,
      hostId: host?.id || "",
      hostCreatedCount: state.hostCreatedCount,
      repeatedCreated: state.hostCreatedCount > 1,
      canCancel: true,
      cancelledAt: state.cancelledAt || 0,
      cancelReason: state.cancelReason || ""
    };
  };

  return {
    ensureTransitionHost,
    playIn,
    playOut,
    cancel,
    snapshot
  };
}
