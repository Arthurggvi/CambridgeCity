const FORMAL_MONEY_FMT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const CLINIC_BILL_PAYMENT_ACTION_IDS = new Set([
  "bill_pay_all_day",
  "bill_pay_200_day",
  "ward_pay_all",
  "ward_pay_200"
]);

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundWalletMoney(value) {
  return Math.round(toFiniteNumber(value, 0) * 100) / 100;
}

export function normalizeWalletMoney(value) {
  return Math.max(0, roundWalletMoney(value));
}

export function billCentsToWalletMoney(cents) {
  return roundWalletMoney(toFiniteNumber(cents, 0) / 100);
}

export function walletMoneyToBillCents(value) {
  return Math.max(0, Math.round(roundWalletMoney(value) * 100));
}

export function formatWalletMoney(value) {
  return FORMAL_MONEY_FMT.format(roundWalletMoney(value));
}

export function formatWalletMoneyDelta(value) {
  const rounded = roundWalletMoney(value);
  if (Math.abs(rounded) < 0.000001) return "0.00";
  return `${rounded > 0 ? "+" : "-"}${formatWalletMoney(Math.abs(rounded))}`;
}

export function formatBillCents(cents) {
  return formatWalletMoney(billCentsToWalletMoney(cents));
}

export function isClinicBillPaymentAction(actionId) {
  return CLINIC_BILL_PAYMENT_ACTION_IDS.has(String(actionId || "").trim());
}