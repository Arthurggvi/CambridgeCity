const transientEmphasisRegistry = new Map();
const DEFAULT_ACTIVE_CLASS = "is-transient-emphasis-active";

function normalizeKey(key) {
  return String(key || "").trim();
}

function isDomNode(value) {
  return !!value && typeof value === "object" && typeof value.nodeType === "number";
}

function createNodeHandle(node, activeClass = DEFAULT_ACTIVE_CLASS) {
  return {
    activate() {
      node.classList?.add(activeClass);
    },
    clear() {
      node.classList?.remove(activeClass);
    }
  };
}

export function registerTransientEmphasisTarget(key, resolver) {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) {
    throw new Error("transient_emphasis_key_required");
  }
  if (typeof resolver !== "function") {
    throw new Error(`transient_emphasis_resolver_invalid:${normalizedKey}`);
  }
  transientEmphasisRegistry.set(normalizedKey, resolver);
  return resolver;
}

export function resolveTransientEmphasisHandle(key, context = {}) {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return null;
  const resolver = transientEmphasisRegistry.get(normalizedKey);
  if (typeof resolver !== "function") return null;

  const resolved = resolver({
    key: normalizedKey,
    ...context
  });
  if (!resolved) return null;
  if (isDomNode(resolved)) {
    return createNodeHandle(resolved);
  }
  if (isDomNode(resolved.node)) {
    return createNodeHandle(resolved.node, String(resolved.activeClass || DEFAULT_ACTIVE_CLASS));
  }
  if (typeof resolved.activate === "function" || typeof resolved.clear === "function") {
    return {
      activate() {
        resolved.activate?.({ key: normalizedKey, ...context });
      },
      clear() {
        resolved.clear?.({ key: normalizedKey, ...context });
      }
    };
  }
  return null;
}

export function activateTransientEmphasisTargets(keys = [], context = {}) {
  const handles = [];
  for (const key of Array.isArray(keys) ? keys : []) {
    const handle = resolveTransientEmphasisHandle(key, context);
    if (!handle) continue;
    handle.activate?.();
    handles.push(handle);
  }
  return handles;
}

export function clearTransientEmphasisHandles(handles = []) {
  for (const handle of Array.isArray(handles) ? handles : []) {
    handle?.clear?.();
  }
}

export function getTransientEmphasisRegistrySnapshot() {
  return Array.from(transientEmphasisRegistry.keys()).sort();
}