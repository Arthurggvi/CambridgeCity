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
import { createBusinessIntent, createBusinessRequestId, buildBusinessSource } from "../src/engine/business/business_intent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_JSON = path.join(ROOT, "temp", "business_phase1_regression_latest.json");
const OUTPUT_MD = path.join(ROOT, "temp", "business_phase1_regression_latest.md");

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
    meta: {
      atMs
    }
  };
}

function pickBusinessRow(report, matcher) {
  const rows = Array.isArray(report?.report?.business?.results) ? report.report.business.results : [];
  return rows.find((row) => Object.entries(matcher).every(([key, value]) => row?.[key] === value)) || null;
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

async function createState(mapId, mutate = null) {
  const state = createDefaultGameState();
  const map = await loadMap(mapId);
  assert(map, `failed to load map ${mapId}`);
  setCanonicalMapContext(state, mapId, map, "business-phase1-regression");
  if (isMapContentV2(map)) {
    ensureCurrentSceneV2(state, map, "business-phase1-regression");
  }
  if (typeof mutate === "function") {
    await mutate(state, map);
  }
  return state;
}

async function runResolvedCase({ caseId, mapId, actionId, payload = {}, mutateState = null, atMs }) {
  const state = await createState(mapId, mutateState);
  const beforeState = clone(state);
  const action = makeAction(actionId, payload, atMs);
  const plan = await resolve(action, state);
  const result = await commit(plan, state);
  return {
    caseId,
    beforeState,
    state,
    action,
    plan,
    result
  };
}

async function runDirectBusinessCase({ caseId, stateFactory, intents, atMs }) {
  const state = await stateFactory();
  const beforeState = clone(state);
  const plan = makeEmptyPlan(makeAction(caseId, {}, atMs, "TEST_ACTION"));
  plan.businessIntents = intents.map((intent) => ({ ...intent }));
  const result = await commit(plan, state);
  return {
    caseId,
    beforeState,
    state,
    plan,
    result
  };
}

function buildClaimIntent({ actionId, mapId, requestId, atMs = 0 }) {
  const action = makeAction(actionId, {}, atMs, "TEST_ACTION");
  return createBusinessIntent({
    requestId: requestId || createBusinessRequestId({
      action,
      executorId: "claim",
      businessType: "claim",
      payload: {
        flagPath: "world.flags.newFourMisc.researcherManuscriptClaimed"
      }
    }),
    executorId: "claim",
    businessType: "claim",
    idempotencyMode: "target",
    source: buildBusinessSource({
      origin: "system_action",
      actionId,
      mapId,
      sceneId: null
    }),
    payload: {
      claimKey: "new_four_misc.researcher_manuscript",
      flagPath: "world.flags.newFourMisc.researcherManuscriptClaimed",
      targetKey: "world.flags.newFourMisc.researcherManuscriptClaimed",
      uiTitle: "研究员手稿",
      successMessage: "已记录手稿归属",
      dedupedMessage: "手稿归属已存在"
    },
    allowPartialCommit: false
  });
}

function buildNightKitchenIntent({ requestId, mapId, foodId, menuMode, testFault = "", atMs = 0 }) {
  const purchaseActionId = menuMode === "takeout"
    ? "night_kitchen_submit_takeout_purchase"
    : "night_kitchen_submit_dine_purchase";
  const action = makeAction(purchaseActionId, { foodId, mode: menuMode }, atMs, "TEST_ACTION");
  return createBusinessIntent({
    requestId: requestId || createBusinessRequestId({
      action,
      executorId: "shop_purchase",
      businessType: "purchase",
      payload: { mapId, foodId, menuMode, testFault }
    }),
    executorId: "shop_purchase",
    businessType: "purchase",
    idempotencyMode: "request",
    source: buildBusinessSource({
      origin: "system_action",
      actionId: purchaseActionId,
      mapId,
      sceneId: null
    }),
    payload: {
      channel: "night_kitchen",
      mapId,
      foodId,
      menuMode,
      testFault: testFault || undefined
    },
    allowPartialCommit: false
  });
}

async function main() {
  const evidence = {
    generatedAt: new Date().toISOString(),
    command: "node ./scripts/business_phase1_regression.mjs",
    cases: {},
    sampleRows: {},
    assertions: {}
  };

  const purchaseCommittedDine = await runResolvedCase({
    caseId: "purchase_committed_dine",
    mapId: "heatcorridor_night_kitchen_window",
    actionId: "night_kitchen_submit_dine_purchase",
    payload: {
      itemId: "signature_braised_pork_set",
      mode: "dine"
    },
    atMs: 1001,
    mutateState: (state) => {
      state.world.money = 50;
    }
  });
  const purchaseCommittedDineRow = pickBusinessRow(purchaseCommittedDine.result, {
    businessType: "purchase",
    status: "committed"
  });
  assert(purchaseCommittedDineRow, "expected dine purchase committed row", purchaseCommittedDine.result.report.business);
  assert(purchaseCommittedDineRow.outputs.purchaseMode === "instant_consume", "expected dine purchase to use instant_consume", purchaseCommittedDineRow);
  assert(purchaseCommittedDine.state.world.money === 30, "expected dine purchase money to decrease by 20", {
    money: purchaseCommittedDine.state.world.money,
    row: purchaseCommittedDineRow
  });

  const purchaseCommittedTakeout = await runResolvedCase({
    caseId: "purchase_committed_takeout",
    mapId: "heatcorridor_night_kitchen_window",
    actionId: "night_kitchen_submit_takeout_purchase",
    payload: {
      itemId: "takeout_youtiao_2",
      mode: "takeout"
    },
    atMs: 1002,
    mutateState: (state) => {
      state.world.money = 50;
    }
  });
  const purchaseCommittedTakeoutRow = pickBusinessRow(purchaseCommittedTakeout.result, {
    businessType: "purchase",
    status: "committed"
  });
  assert(purchaseCommittedTakeoutRow, "expected takeout purchase committed row", purchaseCommittedTakeout.result.report.business);
  assert(purchaseCommittedTakeoutRow.outputs.purchaseMode === "inventory_item", "expected takeout purchase to use inventory_item", purchaseCommittedTakeoutRow);
  assert(purchaseCommittedTakeout.state.world.money === 46, "expected takeout purchase money to decrease by 4", {
    money: purchaseCommittedTakeout.state.world.money,
    row: purchaseCommittedTakeoutRow
  });
  const takeoutEntry = (purchaseCommittedTakeout.state.player.inventory || []).find((row) => row.itemId === "consumable_takeout_youtiao_2");
  assert(Number(takeoutEntry?.qty || 0) === 1, "expected takeout inventory item to be granted", purchaseCommittedTakeout.state.player.inventory);

  const purchaseRejected = await runResolvedCase({
    caseId: "purchase_rejected_capacity",
    mapId: "heatcorridor_night_kitchen_window",
    actionId: "night_kitchen_submit_takeout_purchase",
    payload: {
      itemId: "takeout_youtiao_2",
      mode: "takeout"
    },
    atMs: 1003,
    mutateState: (state) => {
      state.world.money = 50;
      state.player.inventory = [
        { itemId: "consumable_chocolate_bar", qty: 1 },
        { itemId: "consumable_compressed_biscuits", qty: 1 }
      ];
    }
  });
  const purchaseRejectedRow = pickBusinessRow(purchaseRejected.result, {
    businessType: "purchase",
    status: "rejected"
  });
  assert(purchaseRejectedRow, "expected purchase rejected row", purchaseRejected.result.report.business);
  assert(purchaseRejected.state.world.money === 50, "expected rejected purchase to keep money unchanged", {
    money: purchaseRejected.state.world.money,
    row: purchaseRejectedRow
  });
  assert((purchaseRejected.state.player.inventory || []).length === 2, "expected rejected purchase to keep inventory unchanged", purchaseRejected.state.player.inventory);

  const paymentCommitted = await runResolvedCase({
    caseId: "payment_committed_medical",
    mapId: "bayport_clinic_counter_day",
    actionId: "bill_pay_all_day",
    payload: {},
    atMs: 1004,
    mutateState: (state) => {
      state.world.money = 40;
      state.world.medical.bills.obsCents = 1200;
      state.world.medical.bills.wardCents = 1800;
    }
  });
  const paymentCommittedRow = pickBusinessRow(paymentCommitted.result, {
    businessType: "payment",
    status: "committed"
  });
  assert(paymentCommittedRow, "expected payment committed row", paymentCommitted.result.report.business);
  assert(paymentCommitted.state.world.money === 10, "expected committed payment to reduce wallet from 40 to 10", paymentCommitted.state.world.money);
  assert(paymentCommitted.state.world.medical.bills.obsCents === 0 && paymentCommitted.state.world.medical.bills.wardCents === 0, "expected committed payment to clear bills", paymentCommitted.state.world.medical.bills);

  const paymentRejected = await runResolvedCase({
    caseId: "payment_rejected_gov_insufficient",
    mapId: "gov_hall_main_hall",
    actionId: "gov_c_window_pay_bill",
    payload: {},
    atMs: 1005,
    mutateState: (state) => {
      state.world.money = 5;
      state.world.refData.accounts.unpaidFinesCents = 2000;
      state.flags.govHallWindowMenuOpen = true;
      state.world.flags.govHallWindowMenuOpen = true;
    }
  });
  const paymentRejectedRow = pickBusinessRow(paymentRejected.result, {
    businessType: "payment",
    status: "rejected"
  });
  assert(paymentRejectedRow, "expected payment rejected row", paymentRejected.result.report.business);
  assert(paymentRejected.state.world.money === 5, "expected rejected payment to keep wallet unchanged", paymentRejected.state.world.money);
  assert(paymentRejected.state.world.refData.accounts.unpaidFinesCents === 2000, "expected rejected payment to keep fines unchanged", paymentRejected.state.world.refData.accounts);

  const claimCommitted = await runDirectBusinessCase({
    caseId: "claim_committed_direct",
    atMs: 1006,
    stateFactory: () => createState("steelcross_market_01", (state) => {
      state.world.money = 0;
    }),
    intents: [
      buildClaimIntent({
        actionId: "claim_researcher_manuscript_direct",
        mapId: "steelcross_market_01",
        atMs: 1006
      })
    ]
  });
  const claimCommittedRow = pickBusinessRow(claimCommitted.result, {
    businessType: "claim",
    status: "committed"
  });
  assert(claimCommittedRow, "expected claim committed row", claimCommitted.result.report.business);
  assert(claimCommitted.state.world.flags.newFourMisc.researcherManuscriptClaimed === true, "expected claim proof to be written", claimCommitted.state.world.flags.newFourMisc);

  const claimAlreadyCommitted = await runDirectBusinessCase({
    caseId: "claim_deduped_direct",
    atMs: 1007,
    stateFactory: () => createState("steelcross_market_01", (state) => {
      state.world.flags.newFourMisc = {
        ...(state.world.flags.newFourMisc || {}),
        researcherManuscriptClaimed: true
      };
    }),
    intents: [
      buildClaimIntent({
        actionId: "claim_researcher_manuscript_repeat",
        mapId: "steelcross_market_01",
        atMs: 1007
      })
    ]
  });
  const claimDedupedRow = pickBusinessRow(claimAlreadyCommitted.result, {
    businessType: "claim",
    status: "deduped"
  });
  assert(claimDedupedRow, "expected claim deduped row", claimAlreadyCommitted.result.report.business);

  const duplicateRequestId = "biz:duplicate-request-test";
  const duplicateRequest = await runDirectBusinessCase({
    caseId: "purchase_duplicate_request_id",
    atMs: 1008,
    stateFactory: () => createState("heatcorridor_night_kitchen_window", (state) => {
      state.world.money = 20;
    }),
    intents: [
      buildNightKitchenIntent({
        requestId: duplicateRequestId,
        mapId: "heatcorridor_night_kitchen_window",
        foodId: "takeout_youtiao_2",
        menuMode: "takeout",
        atMs: 1008
      }),
      buildNightKitchenIntent({
        requestId: duplicateRequestId,
        mapId: "heatcorridor_night_kitchen_window",
        foodId: "takeout_youtiao_2",
        menuMode: "takeout",
        atMs: 1008
      })
    ]
  });
  const duplicateRows = duplicateRequest.result.report.business.results.filter((row) => row.businessType === "purchase");
  assert(duplicateRows.length === 2, "expected duplicate request case to produce two purchase rows", duplicateRows);
  assert(duplicateRows[0].status === "committed", "expected first duplicate request row committed", duplicateRows);
  assert(duplicateRows[1].status === "deduped", "expected second duplicate request row deduped", duplicateRows);
  assert(duplicateRequest.state.world.money === 16, "expected duplicate request cycle to charge only once", duplicateRequest.state.world.money);
  const duplicateInventoryQty = (duplicateRequest.state.player.inventory || []).find((row) => row.itemId === "consumable_takeout_youtiao_2")?.qty || 0;
  assert(duplicateInventoryQty === 1, "expected duplicate request cycle to grant inventory only once", duplicateRequest.state.player.inventory);

  const atomicFault = await runDirectBusinessCase({
    caseId: "purchase_atomic_fault_injection",
    atMs: 1009,
    stateFactory: () => createState("heatcorridor_night_kitchen_window", (state) => {
      state.world.money = 20;
    }),
    intents: [
      buildNightKitchenIntent({
        requestId: "biz:atomic-fault",
        mapId: "heatcorridor_night_kitchen_window",
        foodId: "takeout_youtiao_2",
        menuMode: "takeout",
        testFault: "inject_invalid_effect_after_money",
        atMs: 1009
      })
    ]
  });
  const atomicFaultRow = pickBusinessRow(atomicFault.result, {
    businessType: "purchase",
    status: "rejected"
  });
  assert(atomicFaultRow, "expected atomic fault injection to reject purchase row", atomicFault.result.report.business);
  assert(atomicFaultRow.code === "BUNDLE_APPLY_FAILED", "expected atomic fault injection to fail during staged bundle apply", atomicFaultRow);
  assert(atomicFault.state.world.money === 20, "expected atomic fault injection to keep money unchanged", atomicFault.state.world.money);
  assert(JSON.stringify(atomicFault.state.player.inventory || []) === JSON.stringify(atomicFault.beforeState.player.inventory || []), "expected atomic fault injection to keep inventory unchanged", {
    before: atomicFault.beforeState.player.inventory,
    after: atomicFault.state.player.inventory
  });
  assert(!(atomicFault.state.player.inventory || []).some((row) => row.itemId === "consumable_takeout_youtiao_2"), "expected atomic fault injection to avoid granting target goods", atomicFault.state.player.inventory);

  evidence.cases.purchaseCommittedDine = {
    actionId: purchaseCommittedDine.action.id,
    businessIntentsCount: purchaseCommittedDine.plan.businessIntents.length,
    reportRows: purchaseCommittedDine.result.report.business.results.map(summarizeRow),
    moneyAfter: purchaseCommittedDine.state.world.money
  };
  evidence.cases.purchaseCommittedTakeout = {
    actionId: purchaseCommittedTakeout.action.id,
    businessIntentsCount: purchaseCommittedTakeout.plan.businessIntents.length,
    reportRows: purchaseCommittedTakeout.result.report.business.results.map(summarizeRow),
    moneyAfter: purchaseCommittedTakeout.state.world.money,
    inventoryAfter: clone(purchaseCommittedTakeout.state.player.inventory)
  };
  evidence.cases.purchaseRejected = {
    actionId: purchaseRejected.action.id,
    businessIntentsCount: purchaseRejected.plan.businessIntents.length,
    planRejection: clone(purchaseRejected.result.report.plan.rejection),
    reportRows: purchaseRejected.result.report.business.results.map(summarizeRow),
    moneyAfter: purchaseRejected.state.world.money,
    inventoryAfter: clone(purchaseRejected.state.player.inventory)
  };
  evidence.cases.paymentCommitted = {
    actionId: paymentCommitted.action.id,
    businessIntentsCount: paymentCommitted.plan.businessIntents.length,
    reportRows: paymentCommitted.result.report.business.results.map(summarizeRow),
    moneyAfter: paymentCommitted.state.world.money,
    billsAfter: clone(paymentCommitted.state.world.medical.bills)
  };
  evidence.cases.paymentRejected = {
    actionId: paymentRejected.action.id,
    businessIntentsCount: paymentRejected.plan.businessIntents.length,
    planRejection: clone(paymentRejected.result.report.plan.rejection),
    reportRows: paymentRejected.result.report.business.results.map(summarizeRow),
    moneyAfter: paymentRejected.state.world.money,
    unpaidFinesAfter: paymentRejected.state.world.refData.accounts.unpaidFinesCents
  };
  evidence.cases.claimCommitted = {
    reportRows: claimCommitted.result.report.business.results.map(summarizeRow),
    claimedProofAfter: claimCommitted.state.world.flags.newFourMisc.researcherManuscriptClaimed === true
  };
  evidence.cases.claimDeduped = {
    reportRows: claimAlreadyCommitted.result.report.business.results.map(summarizeRow),
    claimedProofAfter: claimAlreadyCommitted.state.world.flags.newFourMisc.researcherManuscriptClaimed === true
  };
  evidence.cases.duplicateRequestId = {
    reportRows: duplicateRequest.result.report.business.results.map(summarizeRow),
    moneyAfter: duplicateRequest.state.world.money,
    inventoryAfter: clone(duplicateRequest.state.player.inventory)
  };
  evidence.cases.atomicFaultInjection = {
    reportRows: atomicFault.result.report.business.results.map(summarizeRow),
    moneyAfter: atomicFault.state.world.money,
    inventoryBefore: clone(atomicFault.beforeState.player.inventory),
    inventoryAfter: clone(atomicFault.state.player.inventory)
  };

  evidence.sampleRows.purchaseCommitted = summarizeRow(purchaseCommittedDineRow);
  evidence.sampleRows.purchaseRejected = summarizeRow(purchaseRejectedRow);
  evidence.sampleRows.paymentCommitted = summarizeRow(paymentCommittedRow);
  evidence.sampleRows.paymentRejected = summarizeRow(paymentRejectedRow);
  evidence.sampleRows.claimCommitted = summarizeRow(claimCommittedRow);
  evidence.sampleRows.claimDeduped = summarizeRow(claimDedupedRow);

  evidence.assertions = {
    purchaseCommittedInstantConsume: true,
    purchaseCommittedInventoryItem: true,
    purchaseRejectedNoMoneyMutation: true,
    paymentCommittedStateDelta: true,
    paymentRejectedNoMutation: true,
    claimCommittedProofWritten: true,
    claimDedupedAlreadyCommitted: true,
    duplicateRequestIdSingleConsumption: true,
    atomicFaultInjectionNoPartialCommit: true
  };

  await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(evidence, null, 2), "utf8");

  const md = [
    "# Business Phase 1 Regression",
    "",
    `Generated At: ${evidence.generatedAt}`,
    `Command: ${evidence.command}`,
    "",
    "## Sample Rows",
    "",
    `- purchase committed: ${JSON.stringify(evidence.sampleRows.purchaseCommitted)}`,
    `- purchase rejected: ${JSON.stringify(evidence.sampleRows.purchaseRejected)}`,
    `- payment committed: ${JSON.stringify(evidence.sampleRows.paymentCommitted)}`,
    `- payment rejected: ${JSON.stringify(evidence.sampleRows.paymentRejected)}`,
    `- claim committed: ${JSON.stringify(evidence.sampleRows.claimCommitted)}`,
    `- claim deduped: ${JSON.stringify(evidence.sampleRows.claimDeduped)}`,
    "",
    "## Assertions",
    "",
    ...Object.entries(evidence.assertions).map(([key, value]) => `- ${key}: ${value}`)
  ].join("\n");
  await fs.writeFile(OUTPUT_MD, md, "utf8");

  console.log(`[business-phase1] wrote ${path.relative(ROOT, OUTPUT_JSON)}`);
  console.log(`[business-phase1] wrote ${path.relative(ROOT, OUTPUT_MD)}`);
  console.log(JSON.stringify({
    sampleRows: evidence.sampleRows,
    assertions: evidence.assertions
  }, null, 2));
}

main().catch((error) => {
  console.error("[business-phase1] regression failed", error?.message || error);
  if (error?.payload != null) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exitCode = 1;
});