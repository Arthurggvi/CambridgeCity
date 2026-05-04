function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeReasons(reasons) {
  return Array.isArray(reasons)
    ? reasons.map((entry) => normalizeText(entry)).filter(Boolean)
    : [];
}

export const BUSINESS_REJECTION_SOURCES = Object.freeze({
  SCHEMA: "schema",
  REQUIRES: "requires",
  DISABLED_REQUIRES: "disabledRequires",
  BUSINESS_PREVIEW: "business_preview",
  BUSINESS_COMMIT: "business_commit",
  SYSCALL: "syscall"
});

export function buildBusinessRejection({
  source,
  code,
  reason,
  reasons = [],
  businessType = null,
  executorId = null,
  requestId = null,
  idempotencyMode = null,
  targetKey = null,
  uiHint = null,
  sourceActionId = null,
  mapId = null
} = {}) {
  return {
    source: normalizeText(source),
    code: normalizeText(code),
    reason: normalizeText(reason),
    reasons: normalizeReasons(reasons),
    businessType: normalizeText(businessType) || null,
    executorId: normalizeText(executorId) || null,
    requestId: normalizeText(requestId) || null,
    idempotencyMode: normalizeText(idempotencyMode) || null,
    targetKey: normalizeText(targetKey) || null,
    sourceActionId: normalizeText(sourceActionId) || null,
    mapId: normalizeText(mapId) || null,
    uiHint: uiHint && typeof uiHint === "object" ? { ...uiHint } : null
  };
}

export function buildBusinessIntentRejection(intent, source, code, reason, reasons = [], extra = {}) {
  return buildBusinessRejection({
    source,
    code,
    reason,
    reasons,
    businessType: intent?.businessType,
    executorId: intent?.executorId,
    requestId: intent?.requestId,
    idempotencyMode: intent?.idempotencyMode,
    sourceActionId: intent?.source?.actionId,
    mapId: intent?.source?.mapId,
    targetKey: extra?.targetKey || null,
    uiHint: extra?.uiHint || null
  });
}

export function isBusinessRejection(rejection) {
  if (!rejection || typeof rejection !== "object") return false;
  return normalizeText(rejection.businessType) !== ""
    && normalizeText(rejection.executorId) !== "";
}

export function buildBusinessRejectionFromRow(row, source = BUSINESS_REJECTION_SOURCES.BUSINESS_COMMIT) {
  return buildBusinessRejection({
    source,
    code: row?.code || "BUSINESS_REJECTED",
    reason: row?.reason || "业务拒绝",
    reasons: Array.isArray(row?.outputs?.reasons) ? row.outputs.reasons : [],
    businessType: row?.businessType,
    executorId: row?.executorId,
    requestId: row?.requestId,
    idempotencyMode: row?.idempotencyMode,
    targetKey: row?.targetKey,
    uiHint: row?.uiHint || null,
    sourceActionId: row?.sourceActionId,
    mapId: row?.mapId
  });
}