export const ONE_SHOT_BUSINESS_SEMANTIC_TYPE = "one_shot_business";

export const BUSINESS_TYPES = Object.freeze({
  PURCHASE: "purchase",
  PAYMENT: "payment",
  CLAIM: "claim"
});

export const BUSINESS_IDEMPOTENCY_MODES = Object.freeze({
  REQUEST: "request",
  TARGET: "target"
});

export const BUSINESS_SOURCE_ORIGINS = Object.freeze({
  MAP_ACTION: "map_action",
  UI_ACTION: "ui_action",
  SYSCALL: "syscall",
  SYSTEM_ACTION: "system_action"
});

function stableSerialize(value) {
  if (value == null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const parts = [];
    for (const key of Object.keys(value).sort()) {
      parts.push(`${JSON.stringify(key)}:${stableSerialize(value[key])}`);
    }
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashText(text) {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(index);
    hash >>>= 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizeBusinessSource(source = {}) {
  const origin = normalizeText(source.origin);
  return {
    origin,
    actionId: normalizeText(source.actionId) || null,
    mapId: normalizeText(source.mapId) || null,
    sceneId: normalizeText(source.sceneId) || null
  };
}

export function buildBusinessSource({ origin, actionId, mapId, sceneId } = {}) {
  return normalizeBusinessSource({ origin, actionId, mapId, sceneId });
}

export function createBusinessRequestId({
  action = null,
  executorId = "",
  businessType = "",
  payload = {},
  suffix = ""
} = {}) {
  const actionId = normalizeText(action?.id);
  const atMs = Number.isFinite(Number(action?.meta?.atMs))
    ? Math.trunc(Number(action.meta.atMs))
    : 0;
  const serialized = stableSerialize({
    actionId,
    atMs,
    executorId: normalizeText(executorId),
    businessType: normalizeText(businessType),
    payload,
    suffix: normalizeText(suffix)
  });
  return `biz:${normalizeText(executorId) || "unknown"}:${hashText(serialized)}`;
}

export function createBusinessIntent({
  requestId,
  executorId,
  businessType,
  idempotencyMode,
  source,
  payload,
  allowPartialCommit = false
} = {}) {
  return Object.freeze({
    requestId: normalizeText(requestId),
    executorId: normalizeText(executorId),
    businessType: normalizeText(businessType),
    idempotencyMode: normalizeText(idempotencyMode),
    source: normalizeBusinessSource(source),
    payload: payload && typeof payload === "object" ? { ...payload } : {},
    allowPartialCommit: allowPartialCommit === true
  });
}

export function isBusinessIntent(intent) {
  if (!intent || typeof intent !== "object") return false;
  return normalizeText(intent.requestId) !== ""
    && normalizeText(intent.executorId) !== ""
    && normalizeText(intent.businessType) !== ""
    && normalizeText(intent.idempotencyMode) !== "";
}