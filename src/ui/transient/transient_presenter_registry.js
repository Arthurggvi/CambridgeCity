const transientPresenterRegistry = new Map();

function normalizeType(type) {
  return String(type || "").trim();
}

export function registerTransientPresenter(type, presenter) {
  const normalizedType = normalizeType(type);
  if (!normalizedType) {
    throw new Error("transient_presenter_type_required");
  }
  if (typeof presenter !== "function" && typeof presenter?.render !== "function") {
    throw new Error(`transient_presenter_invalid:${normalizedType}`);
  }
  transientPresenterRegistry.set(normalizedType, presenter);
  return presenter;
}

export function resolveTransientPresenter(type) {
  const normalizedType = normalizeType(type);
  return normalizedType ? transientPresenterRegistry.get(normalizedType) || null : null;
}

export function getTransientPresenterRegistrySnapshot() {
  return Array.from(transientPresenterRegistry.keys()).sort();
}