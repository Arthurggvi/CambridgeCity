import { Effects, getByPath } from "../../pipeline/effects.js";
import { buildBusinessIntentRejection } from "../business_rejection.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function buildClaimUiHint(intent, committed) {
  const payload = intent?.payload || {};
  const title = normalizeText(payload.uiTitle) || "状态更新";
  const successMessage = normalizeText(payload.successMessage);
  const dedupedMessage = normalizeText(payload.dedupedMessage);
  if (committed && successMessage) {
    return { title, message: successMessage, variant: "claim_success" };
  }
  if (!committed && dedupedMessage) {
    return { title, message: dedupedMessage, variant: "claim_deduped" };
  }
  return null;
}

function readFlagValue(state, flagPath) {
  return getByPath(state, flagPath) === true;
}

export const claimExecutor = Object.freeze({
  executorId: "claim",
  businessType: "claim",

  buildIntentPayloadFromMapAction({ mapAction } = {}) {
    return this.buildIntentPayloadFromClaimSpec(mapAction?.semantic?.claim || {});
  },

  buildIntentPayloadFromClaimSpec(spec = {}) {
    return {
      claimKey: normalizeText(spec.claimKey),
      flagPath: normalizeText(spec.flagPath),
      targetKey: normalizeText(spec.targetKey) || normalizeText(spec.flagPath),
      successMessage: normalizeText(spec.successMessage),
      dedupedMessage: normalizeText(spec.dedupedMessage),
      uiTitle: normalizeText(spec.uiTitle)
    };
  },

  async previewEligibility(state, intent) {
    const flagPath = normalizeText(intent?.payload?.flagPath);
    if (!flagPath) {
      return {
        ok: false,
        rejection: buildBusinessIntentRejection(intent, "business_preview", "CLAIM_FLAG_PATH_MISSING", "缺少 claim flagPath", ["缺少 claim flagPath"])
      };
    }
    return { ok: true };
  },

  async readCommitProof(state, intent) {
    const flagPath = normalizeText(intent?.payload?.flagPath);
    return {
      flagPath,
      targetKey: normalizeText(intent?.payload?.targetKey) || flagPath,
      alreadyCommitted: !!flagPath && readFlagValue(state, flagPath)
    };
  },

  async isAlreadyCommitted(state, intent, context = {}) {
    void state;
    return context?.proof?.alreadyCommitted === true;
  },

  async finalEligibility(state, intent) {
    return this.previewEligibility(state, intent);
  },

  async buildCommitBundle(state, intent, context = {}) {
    const flagPath = normalizeText(context?.proof?.flagPath || intent?.payload?.flagPath);
    const beforeClaimed = readFlagValue(state, flagPath);
    return {
      allowPartialCommit: false,
      targetKey: normalizeText(context?.proof?.targetKey || intent?.payload?.targetKey) || flagPath,
      before: {
        claimed: beforeClaimed
      },
      after: {
        claimed: true
      },
      outputs: {
        claimKey: normalizeText(intent?.payload?.claimKey) || null,
        flagPath
      },
      uiHint: buildClaimUiHint(intent, true),
      effects: [
        Effects.set(flagPath, true)
      ],
      childIntents: []
    };
  }
});