const _listeners = new Set();

function cloneSignal(signal) {
  if (!signal || typeof signal !== "object" || Array.isArray(signal)) return null;
  const type = String(signal.type || "").trim();
  if (!type) return null;
  const next = { type };
  if (signal.key != null) next.key = String(signal.key);
  for (const [key, value] of Object.entries(signal)) {
    if (key === "type" || key === "key") continue;
    next[key] = value;
  }
  return next;
}

export function subscribeSignal(listener) {
  if (typeof listener !== "function") return () => {};
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

export function publishSignal(signal, context = {}) {
  const normalizedSignal = cloneSignal(signal);
  if (!normalizedSignal) {
    return {
      ok: false,
      reason: "invalid_signal"
    };
  }

  const event = {
    signal: normalizedSignal,
    context: context && typeof context === "object" ? { ...context } : {},
    emittedAt: new Date().toISOString()
  };

  for (const listener of _listeners) {
    try {
      listener(event);
    } catch {
      // Keep broadcast delivery resilient.
    }
  }

  return {
    ok: true,
    signal: normalizedSignal
  };
}