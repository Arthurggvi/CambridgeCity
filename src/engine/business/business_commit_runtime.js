import { applyEffects } from "../pipeline/effects.js";
import { getBusinessExecutor } from "./business_registry.js";
import { BUSINESS_RESULT_STATUSES, buildBusinessResultRow, buildRejectedBusinessRowFromRejection, deriveLegacyUiFeedbackFromBusinessResults } from "./business_result_row.js";
import { buildBusinessIntentRejection, buildBusinessRejectionFromRow, isBusinessRejection } from "./business_rejection.js";

function cloneState(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function buildRejectedRow(intent, code, reason, reasons = [], uiHint = null, targetKey = null) {
  return buildBusinessResultRow({
    intent,
    status: BUSINESS_RESULT_STATUSES.REJECTED,
    code,
    reason,
    targetKey,
    outputs: {
      reasons: Array.isArray(reasons) ? reasons.slice() : []
    },
    uiHint
  });
}

async function attemptBusinessIntentOnState(intent, mutableState, requestLedger) {
  const executor = getBusinessExecutor(intent?.executorId);
  if (!executor) {
    return {
      ok: true,
      rows: [buildRejectedRow(intent, "EXECUTOR_NOT_FOUND", `未注册的 business executor: ${String(intent?.executorId || "")}`)],
      effects: []
    };
  }

  if (intent?.idempotencyMode === "request" && requestLedger.has(intent.requestId)) {
    return {
      ok: true,
      rows: [buildBusinessResultRow({
        intent,
        status: BUSINESS_RESULT_STATUSES.DEDUPED,
        code: "REQUEST_DUPLICATED_IN_COMMIT",
        reason: "同一 commit 周期内重复 requestId 已去重"
      })],
      effects: []
    };
  }

  const proof = await executor.readCommitProof(mutableState, intent);
  const targetKey = proof?.targetKey || null;
  if (await executor.isAlreadyCommitted(mutableState, intent, { proof })) {
    return {
      ok: true,
      rows: [buildBusinessResultRow({
        intent,
        status: BUSINESS_RESULT_STATUSES.DEDUPED,
        code: "ALREADY_COMMITTED",
        reason: "目标已提交",
        targetKey,
        uiHint: proof?.uiHint || null
      })],
      effects: []
    };
  }

  const finalEligibility = await executor.finalEligibility(mutableState, intent, { proof });
  if (!finalEligibility?.ok) {
    const rejection = isBusinessRejection(finalEligibility?.rejection)
      ? finalEligibility.rejection
      : buildBusinessIntentRejection(intent, "business_commit", finalEligibility?.code || "FINAL_ELIGIBILITY_REJECTED", finalEligibility?.reason || "业务提交前校验失败", finalEligibility?.reasons || [], {
          targetKey,
          uiHint: finalEligibility?.uiHint || null
        });
    return {
      ok: true,
      rows: [buildRejectedBusinessRowFromRejection(rejection)],
      effects: []
    };
  }

  const bundle = await executor.buildCommitBundle(mutableState, intent, { proof, finalEligibility });
  if (bundle?.allowPartialCommit === true) {
    return {
      ok: true,
      rows: [buildRejectedRow(intent, "ALLOW_PARTIAL_COMMIT_UNSUPPORTED", "第一阶段不允许 partial commit", [], null, targetKey)],
      effects: []
    };
  }

  const effectRows = Array.isArray(bundle?.effects) ? bundle.effects : [];
  const stageApply = applyEffects(effectRows, mutableState);
  if (stageApply.skipped.length > 0) {
    const reasons = stageApply.skipped.map((row) => String(row?.reason || "effect skipped")).filter(Boolean);
    return {
      ok: true,
      rows: [buildRejectedRow(intent, "BUNDLE_APPLY_FAILED", reasons[0] || "bundle apply failed", reasons, bundle?.uiHint || null, bundle?.targetKey || targetKey)],
      effects: []
    };
  }

  if (intent?.idempotencyMode === "request") {
    requestLedger.add(intent.requestId);
  }

  const nestedRows = [];
  const nestedEffects = [];
  for (const childIntent of Array.isArray(bundle?.childIntents) ? bundle.childIntents : []) {
    const childResult = await attemptBusinessIntentOnState(childIntent, mutableState, requestLedger);
    if (!childResult.ok) {
      return childResult;
    }
    const childRejected = childResult.rows.some((row) => row?.status === BUSINESS_RESULT_STATUSES.REJECTED);
    if (childRejected) {
      return {
        ok: true,
        rows: [buildRejectedRow(intent, "CHILD_INTENT_REJECTED", "关联业务提交失败", [], bundle?.uiHint || null, bundle?.targetKey || targetKey)],
        effects: []
      };
    }
    nestedRows.push(...childResult.rows);
    nestedEffects.push(...childResult.effects);
  }

  const row = buildBusinessResultRow({
    intent,
    status: BUSINESS_RESULT_STATUSES.COMMITTED,
    code: "COMMITTED",
    reason: "业务已提交",
    targetKey: bundle?.targetKey || targetKey,
    before: bundle?.before || {},
    after: bundle?.after || {},
    outputs: bundle?.outputs || {},
    uiHint: bundle?.uiHint || null
  });

  return {
    ok: true,
    rows: [row, ...nestedRows],
    effects: [...effectRows, ...nestedEffects]
  };
}

export async function applyBusinessIntents(plan, activeState) {
  const results = [];
  const intents = Array.isArray(plan?.businessIntents) ? plan.businessIntents : [];
  if (intents.length === 0) {
    if (isBusinessRejection(plan?.rejection)) {
      const previewRow = buildRejectedBusinessRowFromRejection(plan.rejection);
      return {
        results: [previewRow],
        uiFeedback: deriveLegacyUiFeedbackFromBusinessResults([previewRow]),
        primaryRejection: plan.rejection
      };
    }
    return {
      results,
      uiFeedback: null,
      primaryRejection: null
    };
  }

  const requestLedger = new Set();
  for (const intent of intents) {
    const stageState = cloneState(activeState);
    const stageLedger = new Set(requestLedger);
    const stageResult = await attemptBusinessIntentOnState(intent, stageState, stageLedger);
    results.push(...stageResult.rows);
    if (stageResult.effects.length === 0 || stageResult.rows.some((row) => row?.status === BUSINESS_RESULT_STATUSES.REJECTED)) {
      continue;
    }
    const liveApply = applyEffects(stageResult.effects, activeState);
    if (liveApply.skipped.length > 0) {
      results.push(buildRejectedRow(intent, "LIVE_APPLY_FAILED", String(liveApply.skipped[0]?.reason || "live apply failed")));
      continue;
    }
    for (const requestId of stageLedger) {
      requestLedger.add(requestId);
    }
  }

  const primaryRejectedRow = results.find((row) => row?.status === BUSINESS_RESULT_STATUSES.REJECTED) || null;
  const primaryRejection = primaryRejectedRow
    ? buildBusinessRejectionFromRow(primaryRejectedRow)
    : null;

  return {
    results,
    uiFeedback: deriveLegacyUiFeedbackFromBusinessResults(results),
    primaryRejection
  };
}