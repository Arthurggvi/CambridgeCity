export const BUSINESS_RESULT_STATUSES = Object.freeze({
  COMMITTED: "committed",
  DEDUPED: "deduped",
  REJECTED: "rejected"
});

function normalizeText(value) {
  return String(value || "").trim();
}

function cloneObject(value) {
  return value && typeof value === "object"
    ? JSON.parse(JSON.stringify(value))
    : {};
}

export function buildBusinessResultRow({
  intent,
  status,
  code,
  reason,
  targetKey = null,
  before = {},
  after = {},
  outputs = {},
  uiHint = null
} = {}) {
  return {
    requestId: normalizeText(intent?.requestId),
    businessType: normalizeText(intent?.businessType),
    executorId: normalizeText(intent?.executorId),
    idempotencyMode: normalizeText(intent?.idempotencyMode),
    status: normalizeText(status),
    code: normalizeText(code),
    reason: normalizeText(reason),
    sourceActionId: normalizeText(intent?.source?.actionId) || null,
    mapId: normalizeText(intent?.source?.mapId) || null,
    targetKey: normalizeText(targetKey) || null,
    before: cloneObject(before),
    after: cloneObject(after),
    outputs: cloneObject(outputs),
    uiHint: uiHint && typeof uiHint === "object" ? { ...uiHint } : null
  };
}

export function buildRejectedBusinessRowFromRejection(rejection) {
  const intent = {
    requestId: rejection?.requestId,
    businessType: rejection?.businessType,
    executorId: rejection?.executorId,
    idempotencyMode: rejection?.idempotencyMode,
    source: {
      actionId: rejection?.sourceActionId,
      mapId: rejection?.mapId
    }
  };
  return buildBusinessResultRow({
    intent,
    status: BUSINESS_RESULT_STATUSES.REJECTED,
    code: rejection?.code || "BUSINESS_REJECTED",
    reason: rejection?.reason || "业务拒绝",
    targetKey: rejection?.targetKey || null,
    outputs: {
      reasons: Array.isArray(rejection?.reasons) ? rejection.reasons.slice() : []
    },
    uiHint: rejection?.uiHint || null
  });
}

export function deriveLegacyUiFeedbackFromBusinessResults(results) {
  const rows = Array.isArray(results) ? results : [];
  for (const row of rows) {
    const uiHint = row?.uiHint;
    if (!uiHint || typeof uiHint !== "object") continue;
    const message = String(uiHint.message || "").trim();
    const title = String(uiHint.title || "").trim();
    if (!message && !title) continue;
    return {
      title: title || "通知",
      message: message || title,
      variant: String(uiHint.variant || "").trim() || null,
      model: uiHint.model && typeof uiHint.model === "object" ? { ...uiHint.model } : null,
      illustrationKey: String(uiHint.illustrationKey || "").trim() || null
    };
  }
  return null;
}