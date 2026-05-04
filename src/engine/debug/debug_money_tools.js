import { gameState } from "../state.js";
import { dispatch } from "../pipeline/dispatch.js";

function normalizeMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function getCurrentMoneyValue() {
  const n = Number(gameState.world?.money ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100) / 100);
}

export async function applyDebugMoneyAbsolute(value) {
  const normalized = normalizeMoney(value);
  if (normalized === null) {
    return { ok: false, error: "invalid-money" };
  }
  await dispatch("debug_set_money", { money: normalized });
  return { ok: true, money: normalized };
}

export async function applyDebugMoneyDelta(delta) {
  const base = getCurrentMoneyValue();
  const deltaNum = Number(delta);
  if (!Number.isFinite(deltaNum)) {
    return { ok: false, error: "invalid-delta" };
  }
  const next = Math.max(0, base + deltaNum);
  return applyDebugMoneyAbsolute(next);
}
