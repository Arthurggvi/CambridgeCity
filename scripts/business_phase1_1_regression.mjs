import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadMap } from "../src/engine/loader.js";
import { setCanonicalMapContext } from "../src/engine/map_context.js";
import { ensureCurrentSceneV2, isMapContentV2 } from "../src/engine/map_content_v2.js";
import { createDefaultGameState } from "../src/engine/state.js";
import { resolve } from "../src/engine/pipeline/resolve.js";
import { commit } from "../src/engine/pipeline/commit.js";
import { makeEmptyPlan } from "../src/engine/pipeline/plan_types.js";
import { createBusinessIntent, buildBusinessSource } from "../src/engine/business/business_intent.js";
import { validateBusinessSemanticContract } from "../src/engine/business/business_semantic_validate.js";
import { validateMap } from "../src/engine/validate/map_validate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_JSON = path.join(ROOT, "temp", "business_phase1_1_regression_latest.json");
const OUTPUT_MD = path.join(ROOT, "temp", "business_phase1_1_regression_latest.md");

function assert(condition, message, payload = null) {
  if (!condition) {
    const error = new Error(message);
    if (payload != null) {
      error.payload = payload;
    }
    throw error;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeAction(id, payload = {}, atMs = 0, type = "MAP_ACTION") {
  return {
    id,
    type,
    payload: { ...payload },
    meta: { atMs }
  };
}

function summarizeRow(row) {
  return {
    requestId: row?.requestId ?? null,
    businessType: row?.businessType ?? null,
    executorId: row?.executorId ?? null,
    idempotencyMode: row?.idempotencyMode ?? null,
    status: row?.status ?? null,
    code: row?.code ?? null,
    reason: row?.reason ?? null,
    sourceActionId: row?.sourceActionId ?? null,
    mapId: row?.mapId ?? null,
    targetKey: row?.targetKey ?? null,
    before: row?.before ?? null,
    after: row?.after ?? null,
    outputs: row?.outputs ?? null,
    uiHint: row?.uiHint ?? null
  };
}

function pickBusinessRow(report, matcher) {
  const rows = Array.isArray(report?.report?.business?.results) ? report.report.business.results : [];
  return rows.find((row) => Object.entries(matcher).every(([key, value]) => row?.[key] === value)) || null;
}

function captureConsoleErrors(callback) {
  const originalError = console.error;
  const lines = [];
  console.error = (...args) => {
    lines.push(args.map((entry) => {
      if (typeof entry === "string") return entry;
      try {
        return JSON.stringify(entry);
      } catch {
        return String(entry);
      }
    }).join(" "));
  };
  try {
    return {
      value: callback(),
      errors: lines.slice()
    };
  } finally {
    console.error = originalError;
  }
}

function buildSemanticNegativeSample({ semantic, mapId }) {
  return {
    id: mapId,
    legacy: true,
    mapType: "link",
    name: "Phase1.1 Semantic Negative Sample",
    description: "synthetic sample",
    indoor: false,
    outdoor: true,
    exposure: "semi_sheltered",
    shelter: "partial",
    actions: [
      {
        id: "synthetic_claim_action",
        text: "Synthetic",
        ui: { type: "button" },
        semantic
      }
    ]
  };
}

async function createState(mapId, mutate = null) {
  const state = createDefaultGameState();
  const map = await loadMap(mapId);
  assert(map, `failed to load map ${mapId}`);
  setCanonicalMapContext(state, mapId, map, "business-phase1.1-regression");
  if (isMapContentV2(map)) {
    ensureCurrentSceneV2(state, map, "business-phase1.1-regression");
  }
  if (typeof mutate === "function") {
    await mutate(state, map);
  }
  return state;
}

async function runResolvedOnce(state, actionId, payload = {}, atMs = 0) {
  const action = makeAction(actionId, payload, atMs);
  const plan = await resolve(action, state);
  const result = await commit(plan, state);
  return { action, plan, result };
}

async function runDirectBusinessCase({ caseId, stateFactory, intents, atMs }) {
  const state = await stateFactory();
  const beforeState = clone(state);
  const plan = makeEmptyPlan(makeAction(caseId, {}, atMs, "TEST_ACTION"));
  plan.businessIntents = intents.map((intent) => ({ ...intent }));
  const result = await commit(plan, state);
  return {
    state,
    beforeState,
    plan,
    result
  };
}

function buildMedicalBillPaymentIntent({ requestId, mapId, actionId, atMs = 0 }) {
  return createBusinessIntent({
    requestId,
    executorId: "bill_payment",
    businessType: "payment",
    idempotencyMode: "request",
    source: buildBusinessSource({
      origin: "system_action",
      actionId,
      mapId,
      sceneId: null
    }),
    payload: {
      channel: "medical_bill",
      mode: "FULL",
      cents: 0
    },
    allowPartialCommit: false
  });
}

async function main() {
  const evidence = {
    generatedAt: new Date().toISOString(),
    command: "node ./scripts/business_phase1_1_regression.mjs",
    semanticValidateNegative: [],
    purchaseMapAuthored: null,
    paymentDuplicateRequestId: null,
    claimMapAuthored: null,
    assertions: {}
  };

  const semanticCases = [
    {
      sampleId: "missing_executorId",
      fileName: "phase1_1_semantic_missing_executorId.json",
      field: "executorId",
      expectedErrorIncludes: ".executorId:",
      semantic: {
        schemaVersion: 1,
        type: "one_shot_business",
        businessType: "claim",
        idempotencyMode: "target",
        allowPartialCommit: false
      }
    },
    {
      sampleId: "invalid_businessType",
      fileName: "phase1_1_semantic_invalid_businessType.json",
      field: "businessType",
      expectedErrorIncludes: ".businessType:",
      semantic: {
        schemaVersion: 1,
        type: "one_shot_business",
        executorId: "claim",
        businessType: "settlement",
        idempotencyMode: "target",
        allowPartialCommit: false
      }
    },
    {
      sampleId: "invalid_idempotencyMode",
      fileName: "phase1_1_semantic_invalid_idempotencyMode.json",
      field: "idempotencyMode",
      expectedErrorIncludes: ".idempotencyMode:",
      semantic: {
        schemaVersion: 1,
        type: "one_shot_business",
        executorId: "bill_payment",
        businessType: "payment",
        idempotencyMode: "session",
        allowPartialCommit: false
      }
    },
    {
      sampleId: "allowPartialCommit_true",
      fileName: "phase1_1_semantic_allowPartialCommit_true.json",
      field: "allowPartialCommit",
      expectedErrorIncludes: ".allowPartialCommit:",
      semantic: {
        schemaVersion: 1,
        type: "one_shot_business",
        executorId: "claim",
        businessType: "claim",
        idempotencyMode: "target",
        allowPartialCommit: true
      }
    }
  ];

  for (const sample of semanticCases) {
    const semanticPath = "actions[0].semantic";
    const contractResult = validateBusinessSemanticContract(sample.semantic, sample.fileName, semanticPath);
    const mapJson = buildSemanticNegativeSample({ semantic: sample.semantic, mapId: sample.fileName.replace(/\.json$/i, "") });
    const validateCapture = captureConsoleErrors(() => validateMap(mapJson, sample.fileName));
    assert(contractResult.ok === false, `expected semantic contract to reject ${sample.sampleId}`, contractResult);
    assert(validateCapture.value === false, `expected validateMap to reject ${sample.sampleId}`, validateCapture);
    assert(contractResult.errors.some((message) => message.includes(sample.expectedErrorIncludes)), `expected contract errors to mention ${sample.field}`, contractResult);
    assert(validateCapture.errors.some((message) => message.includes(sample.expectedErrorIncludes)), `expected validateMap errors to mention ${sample.field}`, validateCapture);
    evidence.semanticValidateNegative.push({
      sampleId: sample.sampleId,
      triggerFile: sample.fileName,
      field: sample.field,
      semantic: clone(sample.semantic),
      contractResult,
      validateMapOk: validateCapture.value,
      validateErrors: validateCapture.errors
    });
  }

  const purchaseMapAuthoredState = await createState("bayport_clinic_counter_day", (state) => {
    state.world.money = 50;
    state.world.flags.phase1_1PurchaseHarness = true;
  });
  const purchaseMapAuthored = await runResolvedOnce(purchaseMapAuthoredState, "clinic_purchase_thermometer_harness", {}, 1151);
  const purchaseMapAuthoredRow = pickBusinessRow(purchaseMapAuthored.result, {
    businessType: "purchase",
    status: "committed"
  });
  assert(purchaseMapAuthored.plan.businessIntents.length === 1, "expected purchase map-authored action to queue one business intent", purchaseMapAuthored.plan.businessIntents);
  assert(purchaseMapAuthoredRow, "expected purchase map-authored action committed row", purchaseMapAuthored.result.report.business);
  evidence.purchaseMapAuthored = {
    mapId: "bayport_clinic_counter_day",
    actionId: "clinic_purchase_thermometer_harness",
    reportRows: purchaseMapAuthored.result.report.business.results.map(summarizeRow),
    moneyAfter: purchaseMapAuthoredState.world.money
  };

  const paymentDuplicateRequestId = await runDirectBusinessCase({
    caseId: "payment_duplicate_request_id",
    atMs: 1101,
    stateFactory: () => createState("bayport_clinic_counter_day", (state) => {
      state.world.money = 40;
      state.world.medical.bills.obsCents = 1200;
      state.world.medical.bills.wardCents = 1800;
    }),
    intents: [
      buildMedicalBillPaymentIntent({
        requestId: "biz:payment-duplicate-request-phase1.1",
        mapId: "bayport_clinic_counter_day",
        actionId: "bill_pay_all_day",
        atMs: 1101
      }),
      buildMedicalBillPaymentIntent({
        requestId: "biz:payment-duplicate-request-phase1.1",
        mapId: "bayport_clinic_counter_day",
        actionId: "bill_pay_all_day",
        atMs: 1101
      })
    ]
  });
  const paymentRows = paymentDuplicateRequestId.result.report.business.results.filter((row) => row.businessType === "payment");
  assert(paymentRows.length === 2, "expected payment duplicate request case to produce two payment rows", paymentRows);
  assert(paymentRows[0].status === "committed", "expected first payment duplicate row committed", paymentRows);
  assert(paymentRows[1].status === "deduped", "expected second payment duplicate row deduped", paymentRows);
  assert(paymentRows[1].code === "REQUEST_DUPLICATED_IN_COMMIT", "expected second payment duplicate row to use request duplicate code", paymentRows[1]);
  assert(paymentDuplicateRequestId.beforeState.world.money === 40, "expected payment duplicate before money to be 40", paymentDuplicateRequestId.beforeState.world.money);
  assert(paymentDuplicateRequestId.state.world.money === 10, "expected payment duplicate to charge wallet only once", paymentDuplicateRequestId.state.world.money);
  assert(paymentDuplicateRequestId.beforeState.world.medical.bills.obsCents === 1200 && paymentDuplicateRequestId.beforeState.world.medical.bills.wardCents === 1800, "expected payment duplicate before bills to match fixture", paymentDuplicateRequestId.beforeState.world.medical.bills);
  assert(paymentDuplicateRequestId.state.world.medical.bills.obsCents === 0 && paymentDuplicateRequestId.state.world.medical.bills.wardCents === 0, "expected payment duplicate to clear bills only once", paymentDuplicateRequestId.state.world.medical.bills);
  evidence.paymentDuplicateRequestId = {
    requestId: "biz:payment-duplicate-request-phase1.1",
    reportRows: paymentRows.map(summarizeRow),
    before: {
      money: paymentDuplicateRequestId.beforeState.world.money,
      obsBillCents: paymentDuplicateRequestId.beforeState.world.medical.bills.obsCents,
      wardBillCents: paymentDuplicateRequestId.beforeState.world.medical.bills.wardCents
    },
    after: {
      money: paymentDuplicateRequestId.state.world.money,
      obsBillCents: paymentDuplicateRequestId.state.world.medical.bills.obsCents,
      wardBillCents: paymentDuplicateRequestId.state.world.medical.bills.wardCents
    }
  };

  const claimState = await createState("steelcross_market_01", (state) => {
    state.world.flags.newFourMisc = {
      ...(state.world.flags.newFourMisc || {}),
      researcherManuscriptClaimed: false
    };
  });
  const claimMap = await loadMap("steelcross_market_01");
  assert(claimMap, "expected claim authored map to load");
  const claimAction = Array.isArray(claimMap.actions)
    ? claimMap.actions.find((row) => row.id === "steelcross_market_01_claim_researcher_manuscript")
    : null;
  assert(claimAction?.semantic?.type === "one_shot_business", "expected claim authored action semantic to exist", claimAction);

  const claimCommitted = await runResolvedOnce(claimState, "steelcross_market_01_claim_researcher_manuscript", {}, 1201);
  const claimCommittedRow = pickBusinessRow(claimCommitted.result, {
    businessType: "claim",
    status: "committed"
  });
  assert(claimCommitted.plan.businessIntents.length === 1, "expected claim authored action to queue one business intent", claimCommitted.plan.businessIntents);
  assert(claimCommittedRow, "expected claim authored action committed row", claimCommitted.result.report.business);
  assert(claimState.world.flags.newFourMisc.researcherManuscriptClaimed === true, "expected claim authored action to write proof flag", claimState.world.flags.newFourMisc);

  const claimRepeated = await runResolvedOnce(claimState, "steelcross_market_01_claim_researcher_manuscript", {}, 1202);
  const claimDedupedRow = pickBusinessRow(claimRepeated.result, {
    businessType: "claim",
    status: "deduped"
  });
  assert(claimRepeated.plan.businessIntents.length === 1, "expected repeated claim authored action to still queue one business intent", claimRepeated.plan.businessIntents);
  assert(claimDedupedRow, "expected repeated claim authored action deduped row", claimRepeated.result.report.business);
  assert(claimDedupedRow.code === "ALREADY_COMMITTED", "expected repeated claim authored action to use already committed code", claimDedupedRow);

  evidence.claimMapAuthored = {
    mapId: "steelcross_market_01",
    actionId: "steelcross_market_01_claim_researcher_manuscript",
    semantic: clone(claimAction.semantic),
    beforeProof: false,
    afterCommittedProof: claimState.world.flags.newFourMisc.researcherManuscriptClaimed === true,
    committedRow: summarizeRow(claimCommittedRow),
    repeatedRow: summarizeRow(claimDedupedRow)
  };

  evidence.assertions = {
    semanticNegativeSamplesRejectedAtValidate: true,
    purchaseMapAuthoredQueuedThroughGenericDispatch: true,
    paymentDuplicateRequestIdSingleConsumption: true,
    claimMapAuthoredCommitted: true,
    claimMapAuthoredDeduped: true
  };

  await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(evidence, null, 2), "utf8");

  const md = [
    "# Business Phase 1.1 Regression",
    "",
    `Generated At: ${evidence.generatedAt}`,
    `Command: ${evidence.command}`,
    "",
    "## Semantic Validate Negative Samples",
    "",
    ...evidence.semanticValidateNegative.map((row) => `- ${row.sampleId}: ${JSON.stringify(row)}`),
    "",
    "## Purchase Map Authored",
    "",
    `- ${JSON.stringify(evidence.purchaseMapAuthored)}`,
    "",
    "## Payment Duplicate RequestId",
    "",
    `- ${JSON.stringify(evidence.paymentDuplicateRequestId)}`,
    "",
    "## Claim Map Authored",
    "",
    `- ${JSON.stringify(evidence.claimMapAuthored)}`,
    "",
    "## Assertions",
    "",
    ...Object.entries(evidence.assertions).map(([key, value]) => `- ${key}: ${value}`)
  ].join("\n");
  await fs.writeFile(OUTPUT_MD, md, "utf8");

  console.log(`[business-phase1.1] wrote ${path.relative(ROOT, OUTPUT_JSON)}`);
  console.log(`[business-phase1.1] wrote ${path.relative(ROOT, OUTPUT_MD)}`);
  console.log(JSON.stringify({
    semanticValidateNegative: evidence.semanticValidateNegative,
    purchaseMapAuthored: evidence.purchaseMapAuthored,
    paymentDuplicateRequestId: evidence.paymentDuplicateRequestId,
    claimMapAuthored: evidence.claimMapAuthored,
    assertions: evidence.assertions
  }, null, 2));
}

main().catch((error) => {
  console.error("[business-phase1.1] regression failed", error?.message || error);
  if (error?.payload != null) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exitCode = 1;
});