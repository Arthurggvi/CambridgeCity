import { clearTransientEmphasisHandles, activateTransientEmphasisTargets, getTransientEmphasisRegistrySnapshot, registerTransientEmphasisTarget as registerTransientEmphasisTargetInRegistry } from "./transient_emphasis_registry.js";
import { clearTransientRuntimeHost, ensureTransientRuntimeHost, getTransientRuntimeHostSnapshot } from "./transient_host.js";
import { getTransientPresenterRegistrySnapshot, registerTransientPresenter as registerTransientPresenterInRegistry, resolveTransientPresenter } from "./transient_presenter_registry.js";
import { createTransientQueue, normalizeTransientQueuePriority } from "./transient_queue.js";
import {
  TRANSIENT_CLEAR_REASONS,
  TRANSIENT_LIMITS,
  TRANSIENT_RUNTIME_OWNER,
  TRANSIENT_RUNTIME_TIMING,
  resolveTransientIntentLane
} from "./transient_contract.js";

const NOTICE_DIALOG_HOST_ID = "notice-dialog-host";

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function waitForNextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      setTimeout(resolve, 16);
      return;
    }
    requestAnimationFrame(() => resolve());
  });
}

async function waitForCancelableHold(ms, shouldStop) {
  const totalMs = Math.max(0, Number(ms || 0));
  const deadline = Date.now() + totalMs;
  while (Date.now() < deadline) {
    if (typeof shouldStop === "function" && shouldStop()) {
      return false;
    }
    await waitMs(Math.min(50, Math.max(0, deadline - Date.now())));
  }
  return !(typeof shouldStop === "function" && shouldStop());
}

async function waitForPersistentHold(shouldStop) {
  while (!(typeof shouldStop === "function" && shouldStop())) {
    await waitMs(50);
  }
  return false;
}

function isTransientRuntimeBlocked(doc) {
  const host = doc?.getElementById(NOTICE_DIALOG_HOST_ID);
  return !!host && host.getAttribute("aria-hidden") === "false";
}

function waitForTransientRuntimeBlockersToClear(doc) {
  if (!doc || !isTransientRuntimeBlocked(doc)) {
    return Promise.resolve();
  }

  const host = doc.getElementById(NOTICE_DIALOG_HOST_ID);
  if (!host || typeof MutationObserver !== "function") {
    return new Promise((resolve) => {
      const poll = () => {
        if (!isTransientRuntimeBlocked(doc)) {
          resolve();
          return;
        }
        setTimeout(poll, 50);
      };
      poll();
    });
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (isTransientRuntimeBlocked(doc)) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(host, {
      attributes: true,
      attributeFilter: ["aria-hidden"]
    });
  });
}

function waitForPhaseSignal(root, signalTarget, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;

    const finish = (source) => {
      if (done) return;
      done = true;
      root?.removeEventListener("transitionend", onEnd);
      root?.removeEventListener("animationend", onEnd);
      signalTarget?.removeEventListener("transitionend", onEnd);
      signalTarget?.removeEventListener("animationend", onEnd);
      clearTimeout(timer);
      resolve(source);
    };

    const onEnd = (event) => {
      const target = event?.target;
      if (target !== root && target !== signalTarget) return;
      finish("event");
    };

    root?.addEventListener("transitionend", onEnd);
    root?.addEventListener("animationend", onEnd);
    if (signalTarget && signalTarget !== root) {
      signalTarget.addEventListener("transitionend", onEnd);
      signalTarget.addEventListener("animationend", onEnd);
    }

    const timer = setTimeout(() => finish("timeout"), Math.max(60, Number(timeoutMs || 0)));
  });
}

function getDocumentRoot(documentRoot = null) {
  return documentRoot || (typeof document !== "undefined" ? document : null);
}

function isDomNode(value) {
  return !!value && typeof value === "object" && typeof value.nodeType === "number";
}

function createTransientIntentId() {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `transient_${Date.now()}_${randomPart}`;
}

function normalizeTiming(timing, reducedMotion) {
  const base = reducedMotion ? TRANSIENT_RUNTIME_TIMING.REDUCED_MOTION : TRANSIENT_RUNTIME_TIMING.DEFAULT;
  return {
    inMs: Math.max(0, Math.trunc(Number(timing?.inMs ?? base.inMs))),
    holdMs: Math.max(0, Math.trunc(Number(timing?.holdMs ?? base.holdMs))),
    outMs: Math.max(0, Math.trunc(Number(timing?.outMs ?? base.outMs)))
  };
}

function normalizeTransientIntent(intent = {}, options = {}) {
  const doc = getDocumentRoot(options.documentRoot);
  const id = String(intent?.id || createTransientIntentId()).trim();
  const type = String(intent?.type || "").trim();
  if (!type) {
    throw new Error("transient_intent_type_required");
  }
  const createdAtRaw = Number(intent?.createdAt || Date.now());
  const reducedMotion = !!doc?.body?.classList?.contains("settings-reduce-motion");
  return {
    id: id || createTransientIntentId(),
    type,
    priority: normalizeTransientQueuePriority(intent?.priority),
    lane: resolveTransientIntentLane(intent),
    createdAt: Number.isFinite(createdAtRaw) ? Math.trunc(createdAtRaw) : Date.now(),
    dedupeKey: String(intent?.dedupeKey || "").trim() || "",
    payload: intent?.payload && typeof intent.payload === "object" ? intent.payload : {},
    emphasisTargets: Array.isArray(intent?.emphasisTargets)
      ? intent.emphasisTargets.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [],
    timing: normalizeTiming(intent?.timing, reducedMotion)
  };
}

function createPresenterMountContext(publicApi, intent, itemRoot, doc) {
  return {
    intent,
    payload: intent.payload,
    itemRoot,
    documentRoot: doc,
    runtime: publicApi
  };
}

function normalizePresenterMountResult(result, itemRoot) {
  if (!result) {
    return {
      signalTarget: itemRoot,
      cleanup: null,
      hooks: null
    };
  }

  if (isDomNode(result)) {
    if (result !== itemRoot && !itemRoot.contains(result)) {
      itemRoot.appendChild(result);
    }
    return {
      signalTarget: result,
      cleanup: null,
      hooks: null
    };
  }

  const content = result.root || result.content || null;
  if (isDomNode(content) && content !== itemRoot && !itemRoot.contains(content)) {
    itemRoot.appendChild(content);
  }

  return {
    signalTarget: result.signalTarget || content || itemRoot,
    cleanup: typeof result.cleanup === "function" ? result.cleanup : null,
    hooks: {
      onWillEnter: typeof result.onWillEnter === "function" ? result.onWillEnter : null,
      onDidEnter: typeof result.onDidEnter === "function" ? result.onDidEnter : null,
      onWillHold: typeof result.onWillHold === "function" ? result.onWillHold : null,
      onWillExit: typeof result.onWillExit === "function" ? result.onWillExit : null,
      onDidExit: typeof result.onDidExit === "function" ? result.onDidExit : null
    }
  };
}

function isPersistentCardEntry(entry) {
  return entry?.itemRoot?.dataset?.transientPersistent === "true"
    || entry?.intent?.payload?.persistent === true;
}

export function createTransientRuntimeOwner({ documentRoot = null } = {}) {
  const cardQueue = createTransientQueue();
  const toastQueue = createTransientQueue();
  const state = {
    host: null,
    layer: null,
    cardLane: null,
    toastLane: null,
    cardToken: 0,
    cardPhase: "idle",
    activeCardEntry: null,
    activeToastEntries: [],
    isCardPlaying: false,
    pendingCardDrain: false,
    isToastDraining: false,
    lastClearReason: "",
    cardPlayedCount: 0,
    toastPlayedCount: 0
  };

  function getDoc() {
    return getDocumentRoot(documentRoot);
  }

  function syncHost() {
    const resolved = ensureTransientRuntimeHost({ documentRoot: getDoc() });
    state.host = resolved.host;
    state.layer = resolved.layer;
    state.cardLane = resolved.cardLane || null;
    state.toastLane = resolved.toastLane || null;
    return resolved;
  }

  function resetHostVisibility() {
    if (!state.host) return;
    const hasCardItems = Number(state.cardLane?.childElementCount || 0) > 0;
    const hasToastItems = Number(state.toastLane?.childElementCount || 0) > 0;
    state.host.setAttribute("aria-hidden", hasCardItems || hasToastItems ? "false" : "true");
  }

  function cleanupMountedEntry(entry) {
    if (!entry || entry.destroyed) return;
    entry.destroyed = true;
    clearTransientEmphasisHandles(entry.emphasisHandles);
    entry.emphasisHandles = [];
    entry.presenterCleanup?.();
    entry.presenterCleanup = null;
    if (entry.itemRoot?.parentElement) {
      entry.itemRoot.remove();
    }
  }

  function destroyActiveCardEntry() {
    cleanupMountedEntry(state.activeCardEntry);
    state.activeCardEntry = null;
    state.cardPhase = "idle";
    resetHostVisibility();
  }

  function destroyToastEntry(entry) {
    if (!entry) return;
    entry.cancelled = true;
    cleanupMountedEntry(entry);
    state.activeToastEntries = state.activeToastEntries.filter((candidate) => candidate !== entry);
    resetHostVisibility();
  }

  function clear(reason = TRANSIENT_CLEAR_REASONS.CLEARED) {
    state.cardToken += 1;
    state.lastClearReason = String(reason || TRANSIENT_CLEAR_REASONS.CLEARED);
    const clearedCards = cardQueue.clear(state.lastClearReason);
    const clearedToasts = toastQueue.clear(state.lastClearReason);
    destroyActiveCardEntry();
    for (const entry of state.activeToastEntries.slice()) {
      destroyToastEntry(entry);
    }
    clearTransientRuntimeHost({ documentRoot: getDoc(), removeHost: false });
    syncHost();
    resetHostVisibility();
    return {
      reason: state.lastClearReason,
      queueClearedCount: clearedCards.removedCount + clearedToasts.removedCount,
      snapshot: snapshot()
    };
  }

  function cancelIntent(intentId, reason = "cancelled") {
    const normalizedIntentId = String(intentId || "").trim();
    if (!normalizedIntentId) {
      return {
        cancelledCount: 0,
        reason: String(reason || "cancelled"),
        snapshot: snapshot()
      };
    }

    let cancelledCount = 0;
    const removedCards = cardQueue.removeById(normalizedIntentId);
    const removedToasts = toastQueue.removeById(normalizedIntentId);
    cancelledCount += Number(removedCards.removedCount || 0) + Number(removedToasts.removedCount || 0);

    if (state.activeCardEntry?.intent?.id === normalizedIntentId) {
      state.cardToken += 1;
      state.activeCardEntry.cancelled = true;
      destroyActiveCardEntry();
      cancelledCount += 1;
    }

    for (const entry of state.activeToastEntries.slice()) {
      if (entry?.intent?.id !== normalizedIntentId) continue;
      destroyToastEntry(entry);
      cancelledCount += 1;
    }

    state.lastClearReason = String(reason || "cancelled");
    resetHostVisibility();
    return {
      cancelledCount,
      reason: state.lastClearReason,
      snapshot: snapshot()
    };
  }

  function createMountedEntry(intent, laneElement) {
    const doc = getDoc();
    if (!doc || !laneElement) return null;

    const itemRoot = doc.createElement("div");
    itemRoot.className = "transient-runtime-item";
    itemRoot.dataset.transientId = intent.id;
    itemRoot.dataset.transientType = intent.type;
    itemRoot.dataset.transientPriority = intent.priority;
    itemRoot.dataset.transientLane = intent.lane;
    itemRoot.setAttribute("aria-hidden", "true");
    laneElement.appendChild(itemRoot);

    const presenter = resolveTransientPresenter(intent.type);
    const presenterMountContext = createPresenterMountContext(publicApi, intent, itemRoot, doc);
    const presenterResult = presenter
      ? normalizePresenterMountResult(
        typeof presenter === "function"
          ? presenter(presenterMountContext)
          : presenter.render(presenterMountContext),
        itemRoot
      )
      : normalizePresenterMountResult(null, itemRoot);

    const entry = {
      intent,
      itemRoot,
      presenterMountContext,
      signalTarget: presenterResult.signalTarget,
      hooks: presenterResult.hooks || null,
      presenterCleanup: presenterResult.cleanup,
      emphasisHandles: activateTransientEmphasisTargets(intent.emphasisTargets, {
        documentRoot: doc,
        intent,
        runtime: publicApi
      }),
      destroyed: false,
      cancelled: false
    };

    resetHostVisibility();
    return entry;
  }

  async function playCardIntent(intent) {
    const { host, cardLane } = syncHost();
    if (!host || !cardLane) return false;

    destroyActiveCardEntry();
    const entry = createMountedEntry(intent, cardLane);
    if (!entry) return false;

    state.activeCardEntry = entry;
    const token = state.cardToken + 1;
    state.cardToken = token;

    host.setAttribute("aria-hidden", "false");
    await waitForNextFrame();
    if (token !== state.cardToken) return false;
    await waitForNextFrame();
    if (token !== state.cardToken) return false;

    entry.hooks?.onWillEnter?.(entry.presenterMountContext);
    state.cardPhase = "in";
    entry.itemRoot.classList.add("is-in");
    entry.itemRoot.setAttribute("aria-hidden", "false");
    await waitForPhaseSignal(entry.itemRoot, entry.signalTarget, intent.timing.inMs + 80);
    if (token !== state.cardToken) return false;

    entry.hooks?.onDidEnter?.(entry.presenterMountContext);
    entry.hooks?.onWillHold?.(entry.presenterMountContext);
    state.cardPhase = "hold";
    entry.itemRoot.classList.remove("is-in");
    entry.itemRoot.classList.add("is-hold");
    const holdCompleted = isPersistentCardEntry(entry)
      ? await waitForPersistentHold(() => token !== state.cardToken || entry.cancelled || entry.destroyed)
      : await waitForCancelableHold(intent.timing.holdMs, () => token !== state.cardToken || entry.cancelled || entry.destroyed);
    if (!holdCompleted || token !== state.cardToken) return false;

    entry.hooks?.onWillExit?.(entry.presenterMountContext);
    state.cardPhase = "out";
    entry.itemRoot.classList.remove("is-hold");
    entry.itemRoot.classList.add("is-out");
    await waitForPhaseSignal(entry.itemRoot, entry.signalTarget, intent.timing.outMs + 100);
    if (token !== state.cardToken) return false;

    entry.hooks?.onDidExit?.(entry.presenterMountContext);
    destroyActiveCardEntry();
    state.cardPlayedCount += 1;
    return true;
  }

  async function playToastEntry(entry) {
    if (!entry || entry.destroyed) return false;

    entry.itemRoot.setAttribute("aria-hidden", "false");
    await waitForNextFrame();
    if (entry.cancelled || entry.destroyed) return false;
    await waitForNextFrame();
    if (entry.cancelled || entry.destroyed) return false;

    entry.hooks?.onWillEnter?.(entry.presenterMountContext);
    entry.itemRoot.classList.add("is-in");
    await waitForPhaseSignal(entry.itemRoot, entry.signalTarget, entry.intent.timing.inMs + 80);
    if (entry.cancelled || entry.destroyed) return false;

    entry.hooks?.onDidEnter?.(entry.presenterMountContext);
    entry.hooks?.onWillHold?.(entry.presenterMountContext);
    entry.itemRoot.classList.remove("is-in");
    entry.itemRoot.classList.add("is-hold");
    await waitMs(entry.intent.timing.holdMs);
    if (entry.cancelled || entry.destroyed) return false;

    entry.hooks?.onWillExit?.(entry.presenterMountContext);
    entry.itemRoot.classList.remove("is-hold");
    entry.itemRoot.classList.add("is-out");
    await waitForPhaseSignal(entry.itemRoot, entry.signalTarget, entry.intent.timing.outMs + 100);
    if (entry.cancelled || entry.destroyed) return false;

    entry.hooks?.onDidExit?.(entry.presenterMountContext);
    destroyToastEntry(entry);
    state.toastPlayedCount += 1;
    return true;
  }

  async function drainCardQueue() {
    if (state.isCardPlaying) return snapshot();
    state.isCardPlaying = true;

    try {
      while (true) {
        await waitForNextFrame();
        await waitForTransientRuntimeBlockersToClear(getDoc());
        const nextIntent = cardQueue.dequeue();
        if (!nextIntent) break;
        await playCardIntent(nextIntent);
      }
    } finally {
      state.isCardPlaying = false;
      resetHostVisibility();
    }

    const shouldReplayPendingCards = state.pendingCardDrain || cardQueue.snapshot().size > 0;
    state.pendingCardDrain = false;
    if (shouldReplayPendingCards) {
      void drainCardQueue();
    }

    return snapshot();
  }

  async function drainToastQueue() {
    if (state.isToastDraining) return snapshot();
    state.isToastDraining = true;

    try {
      while (true) {
        await waitForNextFrame();
        await waitForTransientRuntimeBlockersToClear(getDoc());
        const nextIntent = toastQueue.dequeue();
        if (!nextIntent) break;

        const { host, toastLane } = syncHost();
        if (!host || !toastLane) continue;

        // Minimal lane split: toast-class feedback stacks independently from card-class feedback
        // so left-bottom toasts can coexist with centered cards without rewriting the runtime contract.
        while (state.activeToastEntries.length >= TRANSIENT_LIMITS.TOAST_STACK) {
          destroyToastEntry(state.activeToastEntries[0]);
        }

        const entry = createMountedEntry(nextIntent, toastLane);
        if (!entry) continue;
        state.activeToastEntries.push(entry);
        void playToastEntry(entry);
      }
    } finally {
      state.isToastDraining = false;
      resetHostVisibility();
    }

    return snapshot();
  }

  function enqueue(intent) {
    const normalizedIntent = normalizeTransientIntent(intent, { documentRoot: getDoc() });
    const laneKind = normalizedIntent.lane;
    const queue = laneKind === "toast" ? toastQueue : cardQueue;
    const result = queue.enqueue(normalizedIntent);
    if (laneKind === "toast") {
      void drainToastQueue();
    } else {
      if (state.isCardPlaying) {
        state.pendingCardDrain = true;
      } else {
        void drainCardQueue();
      }
    }
    return {
      ...result,
      intent: normalizedIntent
    };
  }

  function enqueueMany(intents = []) {
    const results = [];
    const normalizedIntents = [];
    let hasCards = false;
    let hasToasts = false;
    let dedupedCount = 0;

    for (const intent of Array.isArray(intents) ? intents : []) {
      const normalizedIntent = normalizeTransientIntent(intent, { documentRoot: getDoc() });
      normalizedIntents.push(normalizedIntent);
      const laneKind = normalizedIntent.lane;
      const queue = laneKind === "toast" ? toastQueue : cardQueue;
      const result = queue.enqueue(normalizedIntent);
      results.push(result);
      dedupedCount += Number(result?.dedupedCount || 0);
      if (laneKind === "toast") {
        hasToasts = true;
      } else {
        hasCards = true;
        if (state.isCardPlaying) {
          state.pendingCardDrain = true;
        }
      }
    }

    if (hasCards) {
      if (!state.isCardPlaying) {
        void drainCardQueue();
      }
    }
    if (hasToasts) {
      void drainToastQueue();
    }

    return {
      enqueuedCount: results.filter((entry) => entry.enqueued).length,
      dedupedCount,
      size: {
        cards: cardQueue.snapshot().size,
        toasts: toastQueue.snapshot().size
      },
      results,
      intents: normalizedIntents
    };
  }

  function snapshot() {
    return {
      owner: TRANSIENT_RUNTIME_OWNER,
      phase: state.cardPhase,
      isCardPlaying: state.isCardPlaying,
      isToastDraining: state.isToastDraining,
      activeIntentId: state.activeCardEntry?.intent?.id || "",
      activeIntentType: state.activeCardEntry?.intent?.type || "",
      activeToastCount: state.activeToastEntries.length,
      lastClearReason: state.lastClearReason,
      playedCount: state.cardPlayedCount + state.toastPlayedCount,
      cardPlayedCount: state.cardPlayedCount,
      toastPlayedCount: state.toastPlayedCount,
      host: getTransientRuntimeHostSnapshot({ documentRoot: getDoc() }),
      queue: {
        cards: cardQueue.snapshot(),
        toasts: toastQueue.snapshot()
      },
      presenterTypes: getTransientPresenterRegistrySnapshot(),
      emphasisKeys: getTransientEmphasisRegistrySnapshot()
    };
  }

  const publicApi = {
    enqueueTransientIntent: enqueue,
    enqueueTransientIntents: enqueueMany,
    cancelTransientIntent: cancelIntent,
    clearTransientRuntime: clear,
    registerTransientPresenter,
    registerTransientEmphasisTarget,
    getTransientRuntimeSnapshot: snapshot
  };

  syncHost();
  resetHostVisibility();
  return publicApi;
}

let transientRuntimeOwner = null;

function getTransientRuntimeOwner() {
  if (!transientRuntimeOwner) {
    transientRuntimeOwner = createTransientRuntimeOwner();
  }
  return transientRuntimeOwner;
}

export function enqueueTransientIntent(intent) {
  return getTransientRuntimeOwner().enqueueTransientIntent(intent);
}

export function enqueueTransientIntents(intents) {
  return getTransientRuntimeOwner().enqueueTransientIntents(intents);
}

export function clearTransientRuntime(reason = TRANSIENT_CLEAR_REASONS.CLEARED) {
  return getTransientRuntimeOwner().clearTransientRuntime(reason);
}

export function cancelTransientIntent(intentId, reason = "cancelled") {
  return getTransientRuntimeOwner().cancelTransientIntent(intentId, reason);
}

export function getTransientRuntimeSnapshot() {
  return getTransientRuntimeOwner().getTransientRuntimeSnapshot();
}

/**
 * Register a presenter for one transient feedback type.
 * Presenter code is allowed to render from payload only.
 */
export function registerTransientPresenter(type, presenter) {
  return registerTransientPresenterInRegistry(type, presenter);
}

/**
 * Register an emphasis adapter that maps an abstract key to a live node or handle.
 */
export function registerTransientEmphasisTarget(key, resolver) {
  return registerTransientEmphasisTargetInRegistry(key, resolver);
}