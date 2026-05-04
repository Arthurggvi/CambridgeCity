import { getBusinessExecutor } from "./business_registry.js";
import {
  BUSINESS_IDEMPOTENCY_MODES,
  BUSINESS_TYPES,
  ONE_SHOT_BUSINESS_SEMANTIC_TYPE
} from "./business_intent.js";

const TOP_LEVEL_ALLOWED_FIELDS = new Set([
  "schemaVersion",
  "type",
  "executorId",
  "businessType",
  "idempotencyMode",
  "allowPartialCommit",
  "purchase",
  "payment",
  "claim"
]);

const PURCHASE_ALLOWED_FIELDS = new Set(["channel", "mapId", "goodsId", "foodId", "menuMode"]);
const PAYMENT_ALLOWED_FIELDS = new Set(["channel", "mode", "cents"]);
const CLAIM_ALLOWED_FIELDS = new Set(["claimKey", "flagPath", "targetKey", "successMessage", "dedupedMessage", "uiTitle"]);

function normalizeText(value) {
  return String(value || "").trim();
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pushForbiddenFieldErrors(target, allowedFields, fileName, fieldPath, errors) {
  for (const key of Object.keys(target || {})) {
    if (!allowedFields.has(key)) {
      errors.push(`${fileName} -> ${fieldPath}.${key}: one_shot_business authoring 不允许字段 ${key}`);
    }
  }
}

function requireNonEmptyString(value, fileName, fieldPath, label, errors) {
  if (!normalizeText(value)) {
    errors.push(`${fileName} -> ${fieldPath}: ${label} 必须是非空字符串`);
    return false;
  }
  return true;
}

function validatePurchaseSpec(spec, fileName, semanticPath, errors) {
  const fieldPath = `${semanticPath}.purchase`;
  if (!isPlainObject(spec)) {
    errors.push(`${fileName} -> ${fieldPath}: purchase 必须是对象`);
    return;
  }

  pushForbiddenFieldErrors(spec, PURCHASE_ALLOWED_FIELDS, fileName, fieldPath, errors);

  const channel = normalizeText(spec.channel);
  if (channel !== "shop_goods" && channel !== "night_kitchen") {
    errors.push(`${fileName} -> ${fieldPath}.channel: purchase.channel 必须是 shop_goods/night_kitchen`);
    return;
  }

  if ("mapId" in spec) {
    requireNonEmptyString(spec.mapId, fileName, `${fieldPath}.mapId`, "purchase.mapId", errors);
  }

  if (channel === "shop_goods") {
    requireNonEmptyString(spec.goodsId, fileName, `${fieldPath}.goodsId`, "purchase.goodsId", errors);
    if ("foodId" in spec) {
      errors.push(`${fileName} -> ${fieldPath}.foodId: purchase.channel=shop_goods 时不允许 foodId`);
    }
    if ("menuMode" in spec) {
      errors.push(`${fileName} -> ${fieldPath}.menuMode: purchase.channel=shop_goods 时不允许 menuMode`);
    }
    return;
  }

  const menuMode = normalizeText(spec.menuMode).toLowerCase();
  if (menuMode !== "dine" && menuMode !== "takeout") {
    errors.push(`${fileName} -> ${fieldPath}.menuMode: purchase.channel=night_kitchen 时 menuMode 必须是 dine/takeout`);
  }
  if ("goodsId" in spec) {
    errors.push(`${fileName} -> ${fieldPath}.goodsId: purchase.channel=night_kitchen 时不允许 goodsId`);
  }
  if ("foodId" in spec) {
    requireNonEmptyString(spec.foodId, fileName, `${fieldPath}.foodId`, "purchase.foodId", errors);
  }
}

function validatePaymentSpec(spec, fileName, semanticPath, errors) {
  const fieldPath = `${semanticPath}.payment`;
  if (!isPlainObject(spec)) {
    errors.push(`${fileName} -> ${fieldPath}: payment 必须是对象`);
    return;
  }

  pushForbiddenFieldErrors(spec, PAYMENT_ALLOWED_FIELDS, fileName, fieldPath, errors);

  const channel = normalizeText(spec.channel);
  if (channel !== "medical_bill" && channel !== "gov_fine") {
    errors.push(`${fileName} -> ${fieldPath}.channel: payment.channel 必须是 medical_bill/gov_fine`);
    return;
  }

  if (channel === "gov_fine") {
    if ("mode" in spec) {
      errors.push(`${fileName} -> ${fieldPath}.mode: payment.channel=gov_fine 时不允许 mode`);
    }
    if ("cents" in spec) {
      errors.push(`${fileName} -> ${fieldPath}.cents: payment.channel=gov_fine 时不允许 cents`);
    }
    return;
  }

  const mode = normalizeText(spec.mode || "FULL").toUpperCase();
  if (mode !== "FULL" && mode !== "FIXED") {
    errors.push(`${fileName} -> ${fieldPath}.mode: payment.mode 必须是 FULL/FIXED`);
  }

  if ("cents" in spec) {
    const cents = Number(spec.cents);
    if (!Number.isInteger(cents) || cents < 0) {
      errors.push(`${fileName} -> ${fieldPath}.cents: payment.cents 必须是大于等于 0 的整数`);
    }
  }
  if (mode === "FIXED" && !Number.isInteger(Number(spec.cents || NaN))) {
    errors.push(`${fileName} -> ${fieldPath}.cents: payment.mode=FIXED 时必须提供整数 cents`);
  }
}

function validateClaimSpec(spec, fileName, semanticPath, errors) {
  const fieldPath = `${semanticPath}.claim`;
  if (!isPlainObject(spec)) {
    errors.push(`${fileName} -> ${fieldPath}: claim 必须是对象`);
    return;
  }

  pushForbiddenFieldErrors(spec, CLAIM_ALLOWED_FIELDS, fileName, fieldPath, errors);

  requireNonEmptyString(spec.flagPath, fileName, `${fieldPath}.flagPath`, "claim.flagPath", errors);

  for (const key of ["claimKey", "targetKey", "successMessage", "dedupedMessage", "uiTitle"]) {
    if (key in spec) {
      requireNonEmptyString(spec[key], fileName, `${fieldPath}.${key}`, `claim.${key}`, errors);
    }
  }
}

export function validateBusinessSemanticContract(semantic, fileName = "<unknown>", semanticPath = "semantic") {
  const errors = [];
  if (!semantic || typeof semantic !== "object") {
    return { ok: true, errors };
  }

  if (normalizeText(semantic.type) !== ONE_SHOT_BUSINESS_SEMANTIC_TYPE) {
    return { ok: true, errors };
  }

  pushForbiddenFieldErrors(semantic, TOP_LEVEL_ALLOWED_FIELDS, fileName, semanticPath, errors);

  const schemaVersion = Number(semantic.schemaVersion);
  if (!Number.isInteger(schemaVersion) || schemaVersion !== 1) {
    errors.push(`${fileName} -> ${semanticPath}.schemaVersion: 当前 one_shot_business 只接受 schemaVersion=1`);
  }

  const executorId = normalizeText(semantic.executorId);
  if (!executorId) {
    errors.push(`${fileName} -> ${semanticPath}.executorId: one_shot_business 必须提供 executorId`);
  }

  const businessType = normalizeText(semantic.businessType);
  if (!Object.values(BUSINESS_TYPES).includes(businessType)) {
    errors.push(`${fileName} -> ${semanticPath}.businessType: 必须是 purchase/payment/claim`);
  }

  const idempotencyMode = normalizeText(semantic.idempotencyMode);
  if (!Object.values(BUSINESS_IDEMPOTENCY_MODES).includes(idempotencyMode)) {
    errors.push(`${fileName} -> ${semanticPath}.idempotencyMode: 必须是 request/target`);
  }

  if (semantic.allowPartialCommit !== false) {
    errors.push(`${fileName} -> ${semanticPath}.allowPartialCommit: 第一阶段固定只能为 false`);
  }

  const executor = getBusinessExecutor(executorId);
  if (!executor) {
    errors.push(`${fileName} -> ${semanticPath}.executorId: 未注册的 executorId ${executorId || "<empty>"}`);
  } else if (businessType && executor.businessType !== businessType) {
    errors.push(`${fileName} -> ${semanticPath}: executorId=${executorId} 与 businessType=${businessType} 不匹配`);
  }

  const blockByBusinessType = {
    [BUSINESS_TYPES.PURCHASE]: "purchase",
    [BUSINESS_TYPES.PAYMENT]: "payment",
    [BUSINESS_TYPES.CLAIM]: "claim"
  };
  const expectedBlockKey = blockByBusinessType[businessType] || "";

  for (const key of ["purchase", "payment", "claim"]) {
    if (key === expectedBlockKey) continue;
    if (key in semantic) {
      errors.push(`${fileName} -> ${semanticPath}.${key}: businessType=${businessType || "<empty>"} 时不允许 ${key} authoring`);
    }
  }

  if (expectedBlockKey) {
    if (!(expectedBlockKey in semantic)) {
      errors.push(`${fileName} -> ${semanticPath}.${expectedBlockKey}: businessType=${businessType} 必须提供 ${expectedBlockKey} authoring`);
    } else if (expectedBlockKey === "purchase") {
      validatePurchaseSpec(semantic.purchase, fileName, semanticPath, errors);
    } else if (expectedBlockKey === "payment") {
      validatePaymentSpec(semantic.payment, fileName, semanticPath, errors);
    } else if (expectedBlockKey === "claim") {
      validateClaimSpec(semantic.claim, fileName, semanticPath, errors);
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}