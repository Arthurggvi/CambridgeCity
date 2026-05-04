import { shopPurchaseExecutor } from "./executors/shop_purchase_executor.js";
import { billPaymentExecutor } from "./executors/bill_payment_executor.js";
import { claimExecutor } from "./executors/claim_executor.js";

export const BUSINESS_EXECUTOR_IDS = Object.freeze({
  SHOP_PURCHASE: shopPurchaseExecutor.executorId,
  BILL_PAYMENT: billPaymentExecutor.executorId,
  CLAIM: claimExecutor.executorId
});

const BUSINESS_EXECUTOR_REGISTRY = Object.freeze({
  [shopPurchaseExecutor.executorId]: shopPurchaseExecutor,
  [billPaymentExecutor.executorId]: billPaymentExecutor,
  [claimExecutor.executorId]: claimExecutor
});

export function getBusinessExecutor(executorId) {
  return BUSINESS_EXECUTOR_REGISTRY[String(executorId || "").trim()] || null;
}

export function listBusinessExecutors() {
  return Object.values(BUSINESS_EXECUTOR_REGISTRY);
}