/**
 * Stable contract for the fixed transient runtime.
 *
 * Three object kinds:
 * - card: serialized transient feedback rendered in the centered card lane.
 * - toast: stacked transient feedback rendered in the bottom-left toast lane.
 * - emphasis: runtime-owned highlight handles with no dedicated lane.
 *
 * Card priority rule:
 * - high priority cards sort ahead of normal/low cards in the card queue.
 * - the runtime does not mid-play preempt the active card; high priority only affects dequeue order.
 *
 * Ownership rules:
 * - one owner: runtime/transient_runtime
 * - one fixed host: #transient-runtime-host
 * - card and toast may coexist; emphasis may coexist with either lane
 * - clear() is runtime-owned and must clear both lanes plus emphasis handles
 *
 * Public API contract:
 * - enqueueTransientIntent(intent)
 * - enqueueTransientIntents(intents)
 * - clearTransientRuntime(reason)
 * - registerTransientPresenter(type, presenter)
 * - registerTransientEmphasisTarget(key, resolver)
 * - getTransientRuntimeSnapshot() // optional debug entry
 *
 * New transient feedback must enter through:
 * 1. commit report -> transient intent translation
 * 2. presenter registration
 * 3. optional emphasis registration
 *
 * Forbidden extensions:
 * - private transient hosts
 * - private transient queues
 * - runtime-external lifecycle timers
 * - business-layer DOM queries
 * - point cleanup expansion outside clearTransientRuntime()
 */

export const TRANSIENT_RUNTIME_OWNER = "runtime/transient_runtime";

export const TRANSIENT_OBJECT_KINDS = Object.freeze({
  CARD: "card",
  TOAST: "toast",
  EMPHASIS: "emphasis"
});

export const TRANSIENT_LANE_KINDS = Object.freeze({
  CARD: "card",
  TOAST: "toast"
});

export const TRANSIENT_PRIORITY = Object.freeze({
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high"
});

export const TRANSIENT_CLEAR_REASONS = Object.freeze({
  CLEARED: "cleared",
  ROUTE_CHANGE: "route_change",
  LOAD_SNAPSHOT: "load_snapshot",
  HARD_RESET: "hard_reset"
});

export const TRANSIENT_RUNTIME_HOST_ID = "transient-runtime-host";
export const TRANSIENT_RUNTIME_HOST_CLASS = "transient-runtime-host";
export const TRANSIENT_RUNTIME_LAYER_CLASS = "transient-runtime-layer";
export const TRANSIENT_RUNTIME_CARD_LAYER_CLASS = "transient-runtime-card-layer";
export const TRANSIENT_RUNTIME_TOAST_LAYER_CLASS = "transient-runtime-toast-layer";
export const TRANSIENT_RUNTIME_CARD_LANE_CLASS = "transient-runtime-card-lane";
export const TRANSIENT_RUNTIME_TOAST_LANE_CLASS = "transient-runtime-toast-lane";

export const TRANSIENT_RUNTIME_TIMING = Object.freeze({
  DEFAULT: Object.freeze({
    inMs: 180,
    holdMs: 1100,
    outMs: 240
  }),
  REDUCED_MOTION: Object.freeze({
    inMs: 24,
    holdMs: 120,
    outMs: 24
  })
});

export const TRANSIENT_TIMING_PRESETS = Object.freeze({
  DOSSIER_ATTENTION_CARD: Object.freeze({
    inMs: 180,
    holdMs: 3400,
    outMs: 240
  }),
  RECORD_UNLOCK_CARD: Object.freeze({
    inMs: 190,
    holdMs: 1020,
    outMs: 260
  }),
  CRITICAL_STATE_CARD: Object.freeze({
    inMs: 170,
    holdMs: 1480,
    outMs: 260
  }),
  DATA_DELTA_TOAST: Object.freeze({
    inMs: 260,
    holdMs: 4200,
    outMs: 220
  })
});

export const TRANSIENT_LIMITS = Object.freeze({
  TOAST_STACK: 4
});

export function normalizeTransientPriority(priority) {
  const value = String(priority || TRANSIENT_PRIORITY.NORMAL).trim().toLowerCase();
  if (value === TRANSIENT_PRIORITY.LOW || value === TRANSIENT_PRIORITY.HIGH) {
    return value;
  }
  return TRANSIENT_PRIORITY.NORMAL;
}

export function normalizeTransientLaneKind(lane, fallback = TRANSIENT_LANE_KINDS.CARD) {
  const value = String(lane || "").trim().toLowerCase();
  if (value === TRANSIENT_LANE_KINDS.CARD || value === TRANSIENT_LANE_KINDS.TOAST) {
    return value;
  }
  return String(fallback || "").trim().toLowerCase() === TRANSIENT_LANE_KINDS.TOAST
    ? TRANSIENT_LANE_KINDS.TOAST
    : TRANSIENT_LANE_KINDS.CARD;
}

export function resolveTransientIntentLane(intent = {}) {
  const explicitLane = String(intent?.lane || "").trim().toLowerCase();
  if (explicitLane === TRANSIENT_LANE_KINDS.CARD || explicitLane === TRANSIENT_LANE_KINDS.TOAST) {
    return explicitLane;
  }
  return TRANSIENT_LANE_KINDS.CARD;
}