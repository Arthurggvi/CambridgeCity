import { Effects } from "../../pipeline/effects.js";
import {
  billCentsToWalletMoney,
  formatBillCents,
  formatWalletMoney,
  normalizeWalletMoney,
  walletMoneyToBillCents
} from "../../medical_bill_money.js";
import { buildBusinessIntentRejection } from "../business_rejection.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function resolveMedicalBillSnapshot(state, intent) {
  const bills = state?.world?.medical?.bills || {};
  const obsBill = Math.max(0, Math.trunc(Number(bills.obsCents ?? 0)));
  const wardBill = Math.max(0, Math.trunc(Number(bills.wardCents ?? 0)));
  const totalBill = obsBill + wardBill;
  const money = normalizeWalletMoney(state?.world?.money ?? 0);
  const mode = normalizeText(intent?.payload?.mode || "FULL").toUpperCase() || "FULL";
  let targetPayMoney = billCentsToWalletMoney(totalBill);
  if (mode === "FIXED") {
    const n = Math.trunc(Number(intent?.payload?.cents ?? 0));
    targetPayMoney = billCentsToWalletMoney(Math.max(0, n));
  }
  const payMoney = normalizeWalletMoney(Math.min(targetPayMoney, billCentsToWalletMoney(totalBill), money));
  const payCents = Math.max(0, Math.min(totalBill, walletMoneyToBillCents(payMoney)));
  const payObs = Math.min(obsBill, payCents);
  const payWard = Math.min(wardBill, payCents - payObs);

  return {
    channel: "medical_bill",
    obsBill,
    wardBill,
    totalBill,
    money,
    mode,
    payMoney,
    payCents,
    payObs,
    payWard
  };
}

function resolveGovFineSnapshot(state) {
  const totalFine = Math.max(0, Math.trunc(Number(state?.world?.refData?.accounts?.unpaidFinesCents ?? 0)));
  const money = Math.max(0, Math.trunc(Number(state?.world?.money ?? 0)));
  return {
    channel: "gov_fine",
    totalFine,
    money,
    payMoney: totalFine
  };
}

function buildCommittedUiHint(snapshot) {
  if (snapshot.channel === "medical_bill") {
    return {
      title: "缴费成功",
      message: `已缴费 ${formatWalletMoney(snapshot.payMoney)}，剩余账单 ${formatBillCents(snapshot.totalBill - snapshot.payCents)}`,
      variant: "payment_success"
    };
  }
  return {
    title: "窗口缴费",
    message: `已缴纳罚款 ${formatWalletMoney(snapshot.payMoney)}`,
    variant: "payment_success"
  };
}

function buildPreviewRejection(intent, code, reason, reasons = []) {
  return buildBusinessIntentRejection(intent, "business_preview", code, reason, reasons, {
    uiHint: {
      title: "缴费",
      message: reason,
      variant: "reject"
    }
  });
}

export const billPaymentExecutor = Object.freeze({
  executorId: "bill_payment",
  businessType: "payment",

  buildIntentPayloadFromMapAction({ mapAction } = {}) {
    const semanticPayment = mapAction?.semantic?.payment;
    if (semanticPayment && typeof semanticPayment === "object") {
      return {
        channel: normalizeText(semanticPayment.channel),
        mode: normalizeText(semanticPayment.mode || "FULL").toUpperCase() || "FULL",
        cents: Number(semanticPayment.cents ?? 0)
      };
    }
    if (String(mapAction?.kind || "").trim() === "MEDICAL_BILL_PAY") {
      return this.buildIntentPayloadFromMedicalBillAction(mapAction);
    }
    return null;
  },

  buildIntentPayloadFromMedicalBillAction(mapAction = {}) {
    return {
      channel: "medical_bill",
      mode: normalizeText(mapAction?.payload?.mode || "FULL").toUpperCase() || "FULL",
      cents: Number(mapAction?.payload?.cents ?? 0)
    };
  },

  buildIntentPayloadFromGovPaymentAction() {
    return {
      channel: "gov_fine"
    };
  },

  async previewEligibility(state, intent) {
    const channel = normalizeText(intent?.payload?.channel);
    if (channel === "medical_bill") {
      const snapshot = resolveMedicalBillSnapshot(state, intent);
      if (snapshot.totalBill <= 0) {
        return {
          ok: false,
          rejection: buildPreviewRejection(intent, "NO_PENDING_BALANCE", "当前无待付账单", ["当前无待付账单"])
        };
      }
      if (snapshot.money <= 0) {
        return {
          ok: false,
          rejection: buildPreviewRejection(intent, "INSUFFICIENT_FUNDS", "余额不足", ["余额不足"])
        };
      }
      if (snapshot.payCents <= 0) {
        return {
          ok: false,
          rejection: buildPreviewRejection(intent, "ZERO_PAYMENT", "本次支付金额为 0", ["本次支付金额为 0"])
        };
      }
      return { ok: true, snapshot };
    }

    if (channel === "gov_fine") {
      const snapshot = resolveGovFineSnapshot(state);
      if (snapshot.totalFine <= 0) {
        return {
          ok: false,
          rejection: buildPreviewRejection(intent, "NO_PENDING_BALANCE", "当前无待缴罚款", ["当前无待缴罚款"])
        };
      }
      if (snapshot.money < snapshot.totalFine) {
        return {
          ok: false,
          rejection: buildPreviewRejection(intent, "INSUFFICIENT_FUNDS", "金额不足，无法缴纳。", ["金额不足，无法缴纳。"])
        };
      }
      return { ok: true, snapshot };
    }

    return {
      ok: false,
      rejection: buildPreviewRejection(intent, "PAYMENT_CHANNEL_INVALID", "支付语义未正确声明", ["支付语义未正确声明"])
    };
  },

  async readCommitProof(state, intent) {
    const channel = normalizeText(intent?.payload?.channel);
    if (channel === "medical_bill") {
      const snapshot = resolveMedicalBillSnapshot(state, intent);
      return {
        channel,
        targetKey: `medical_bill:${normalizeText(intent?.source?.mapId) || "global"}`,
        snapshot
      };
    }
    const snapshot = resolveGovFineSnapshot(state);
    return {
      channel: "gov_fine",
      targetKey: `gov_fine:${normalizeText(intent?.source?.mapId) || "global"}`,
      snapshot
    };
  },

  async isAlreadyCommitted() {
    return false;
  },

  async finalEligibility(state, intent) {
    return this.previewEligibility(state, intent);
  },

  async buildCommitBundle(state, intent, context = {}) {
    const snapshot = context?.finalEligibility?.snapshot || context?.proof?.snapshot;
    const channel = normalizeText(intent?.payload?.channel);
    if (channel === "medical_bill") {
      return {
        allowPartialCommit: false,
        targetKey: context?.proof?.targetKey || null,
        before: {
          money: snapshot.money,
          totalBillCents: snapshot.totalBill,
          obsBillCents: snapshot.obsBill,
          wardBillCents: snapshot.wardBill
        },
        after: {
          money: snapshot.money - snapshot.payMoney,
          totalBillCents: snapshot.totalBill - snapshot.payCents,
          obsBillCents: snapshot.obsBill - snapshot.payObs,
          wardBillCents: snapshot.wardBill - snapshot.payWard
        },
        outputs: {
          channel,
          paidMoney: snapshot.payMoney,
          paidCents: snapshot.payCents,
          remainingTotalBillCents: snapshot.totalBill - snapshot.payCents
        },
        uiHint: buildCommittedUiHint(snapshot),
        effects: [
          Effects.add("world.money", -snapshot.payMoney),
          Effects.set("world.medical.bills.obsCents", snapshot.obsBill - snapshot.payObs),
          Effects.set("world.medical.bills.wardCents", snapshot.wardBill - snapshot.payWard)
        ],
        childIntents: []
      };
    }

    return {
      allowPartialCommit: false,
      targetKey: context?.proof?.targetKey || null,
      before: {
        money: snapshot.money,
        unpaidFinesCents: snapshot.totalFine
      },
      after: {
        money: snapshot.money - snapshot.totalFine,
        unpaidFinesCents: 0
      },
      outputs: {
        channel,
        paidMoney: snapshot.totalFine
      },
      uiHint: buildCommittedUiHint(snapshot),
      effects: [
        Effects.add("world.money", -snapshot.totalFine),
        Effects.set("world.refData.accounts.unpaidFinesCents", 0),
        Effects.set("world.flags.govHallPayDisabled", false),
        Effects.set("world.flags.govHallPaySuccess", true),
        Effects.push("logLines", "业务员：\"缴纳好了，下次注意点。\"")
      ],
      childIntents: []
    };
  }
});