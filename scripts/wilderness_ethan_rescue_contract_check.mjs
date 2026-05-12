/**
 * Phase 12A: Ethan wilderness rescue contract checks.
 * Run: node scripts/wilderness_ethan_rescue_contract_check.mjs
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadMap } from "../src/engine/loader.js";
import { createDefaultGameState, gameState, replaceGameState } from "../src/engine/state.js";
import { commit } from "../src/engine/pipeline/commit.js";
import { resolve } from "../src/engine/pipeline/resolve.js";
import { validatePlan } from "../src/engine/pipeline/plan_types.js";
import { getTransientIntentsFromCommitReport } from "../src/engine/pipeline/transient_intent_adapter.js";
import { normalizeWildernessState } from "../src/engine/wilderness/wilderness_state.js";
import {
  ETHAN_RESCUE_REGION_PROFILES,
  ETHAN_RESCUE_BED_MAP_ID,
  ETHAN_RESCUE_OFFER_MAP_ID,
  ETHAN_RESCUE_OFFER_DECISION_MAP_ID,
  ETHAN_RESCUE_AGREE_ACTION_ID,
  ETHAN_RESCUE_REFUSE_ACTION_ID,
  ETHAN_RESCUE_REFUSE_STAY_MAP_ID,
  ETHAN_RESCUE_REFUSE_CONFIRM_ACTION_ID,
  applyEthanRescueRecoveryFloor,
  buildEthanRescueEventKey,
  computeEthanRescueChance,
  createDeterministicEthanRescueRoll,
  detectEthanRescueEligibleCollapse,
  processWildernessEthanRescueAfterMove
} from "../src/engine/wilderness/wilderness_ethan_rescue_service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readText(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

function assertNoCallRescue() {
  const roots = ["src", "data"];
  for (const root of roots) {
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === "node_modules" || ent.name === ".git") continue;
          walk(p);
        } else if (/\.(js|mjs|json)$/.test(ent.name)) {
          const t = fs.readFileSync(p, "utf8");
          if (t.includes("WILDERNESS_CALL_RESCUE")) {
            throw new Error(`WILDERNESS_CALL_RESCUE found in ${path.relative(repoRoot, p)}`);
          }
        }
      }
    };
    walk(path.join(repoRoot, root));
  }
}

function countWildernessRuntimeActionsFromDisk() {
  const j = JSON.parse(readText("data/maps/wilderness_runtime.json"));
  return Array.isArray(j.actions) ? j.actions.length : 0;
}

function activeWest2Session(x, y) {
  return normalizeWildernessState({
    active: true,
    regionId: "West2",
    areaId: "west2_old_marker_patrol_line",
    originMapId: "west2_outpost_exit",
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "west2_outpost_hub",
    x,
    y,
    heading: "N",
    state: "NAVIGATING",
    trailConfidence: 100,
    visibilityConfidence: 100,
    lostness: 0,
    stepsTaken: 0,
    lastSafePoint: null,
    discoveredLandmarks: [],
    flags: {},
    sessionStartedAt: 1,
    lastUpdatedAt: 1,
    schemaVersion: 1
  });
}

async function setupRuntime(gs, wx, wy) {
  gs.time.totalMinutes = 9000;
  gs.world.wilderness = activeWest2Session(wx, wy);
  const wrMap = await loadMap("wilderness_runtime");
  assert.ok(wrMap, "wilderness_runtime map loads");
  gs.currentMapId = "wilderness_runtime";
  gs.world.currentMapId = "wilderness_runtime";
  gs.currentMap = wrMap;
  replaceGameState(gs);
}

function assertCrossingDetect() {
  assert.equal(
    detectEthanRescueEligibleCollapse({
      before: { stamina: 5, fatigue: 10, hp: 50 },
      after: { stamina: 0, fatigue: 10, hp: 50 }
    }),
    "stamina_zero"
  );
  assert.equal(
    detectEthanRescueEligibleCollapse({
      before: { stamina: 5, fatigue: 10, hp: 50 },
      after: { stamina: 0, fatigue: 0, hp: 50 }
    }),
    "fatigue_zero"
  );
  assert.equal(
    detectEthanRescueEligibleCollapse({
      before: { stamina: 0, fatigue: 10, hp: 50 },
      after: { stamina: 0, fatigue: 0, hp: 50 }
    }),
    "fatigue_zero"
  );
  assert.equal(
    detectEthanRescueEligibleCollapse({
      before: { stamina: 0, fatigue: 0, hp: 50 },
      after: { stamina: 0, fatigue: 0, hp: 50 }
    }),
    null
  );
  assert.equal(
    detectEthanRescueEligibleCollapse({
      before: { stamina: 5, fatigue: 10, hp: 0 },
      after: { stamina: 0, fatigue: 10, hp: 0 }
    }),
    null
  );
  assert.equal(
    detectEthanRescueEligibleCollapse({
      before: { stamina: 50, fatigue: 50, hp: 50, satiety: 5 },
      after: { stamina: 50, fatigue: 50, hp: 50, satiety: 0 }
    }),
    null
  );
}

function assertRegionChance() {
  const P = ETHAN_RESCUE_REGION_PROFILES;
  assert.ok(P.West2.baseChance > P.OldCamb.baseChance);
  assert.ok(P.CambCity.baseChance > P.South1.baseChance);
  const w2 = computeEthanRescueChance("West2", 0, 0);
  const w2Far = computeEthanRescueChance("West2", 100, 100);
  assert.ok(w2.chance > w2Far.chance);
  assert.equal(w2.chance, Math.min(0.9, Math.max(0.1, w2.chance)));
}

function assertRollStableNoRandom() {
  const seed = {
    sessionStartedAt: 42,
    areaId: "west2",
    regionId: "West2",
    x: 3,
    y: 4,
    stepsTaken: 7,
    reason: "stamina_zero",
    totalMinutes: 900
  };
  const a = createDeterministicEthanRescueRoll(seed);
  const b = createDeterministicEthanRescueRoll(seed);
  assert.equal(a, b);
  const orig = Math.random;
  Math.random = () => {
    throw new Error("Math.random must not be used");
  };
  try {
    createDeterministicEthanRescueRoll(seed);
  } finally {
    Math.random = orig;
  }
}

function assertRepeatEventKey() {
  const activeState = {
    time: { totalMinutes: 9000 },
    world: {
      wilderness: normalizeWildernessState({
        active: true,
        state: "NAVIGATING",
        sessionStartedAt: 1,
        areaId: "west2",
        regionId: "West2",
        x: 5,
        y: 2,
        stepsTaken: 3,
        runtimeMapId: "wilderness_runtime",
        fallbackMapId: "west2_outpost_hub",
        flags: {
          ethanRescueLastHandledKey: buildEthanRescueEventKey({
            sessionStartedAt: 1,
            areaId: "west2",
            x: 5,
            y: 2,
            stepsTaken: 3,
            reason: "stamina_zero"
          })
        }
      })
    },
    player: createDefaultGameState().player
  };
  const results = [];
  const extras = {};
  processWildernessEthanRescueAfterMove(
    activeState,
    results,
    {
      beforeSurvival: { stamina: 5, fatigue: 50, hp: 50 },
      afterSurvival: { stamina: 0, fatigue: 50, hp: 50 }
    },
    extras
  );
  const row = results.find((r) => r.type === "WILDERNESS_ETHAN_RESCUE_CHECK");
  assert.ok(row);
  assert.equal(row.repeatedEventSkipped, true);
  assert.ok(row.eventKey);
}

function assertRescueFailureNoRepeatRoll() {
  const activeState = {
    time: { totalMinutes: 9000 },
    world: {
      wilderness: normalizeWildernessState({
        active: true,
        state: "NAVIGATING",
        sessionStartedAt: 1,
        areaId: "south_grid",
        regionId: "South1",
        x: 20,
        y: 20,
        stepsTaken: 1,
        runtimeMapId: "wilderness_runtime",
        fallbackMapId: "west2_outpost_hub",
        flags: {}
      })
    },
    player: createDefaultGameState().player
  };
  const ctx = {
    beforeSurvival: { stamina: 4, fatigue: 50, hp: 50 },
    afterSurvival: { stamina: 0, fatigue: 50, hp: 50 }
  };
  const results = [];
  processWildernessEthanRescueAfterMove(activeState, results, ctx, {});
  const row = results.find((r) => r.type === "WILDERNESS_ETHAN_RESCUE_CHECK");
  assert.ok(row);
  assert.equal(row.rescueSuccess, false);
  assert.equal(row.repeatedEventSkipped, false);
  assert.equal(activeState.world.wilderness.active, true);
  assert.equal(String(activeState.world.wilderness.state), "RESCUE_PENDING");
  assert.ok(String(activeState.world.wilderness.flags.ethanRescueLastHandledKey || "").length > 0);

  const results2 = [];
  processWildernessEthanRescueAfterMove(activeState, results2, ctx, {});
  const row2 = results2.find((r) => r.type === "WILDERNESS_ETHAN_RESCUE_CHECK");
  assert.equal(row2.repeatedEventSkipped, true);
}

function assertRecoveryFloorHelper() {
  const gs = createDefaultGameState();
  gs.player.physio.stamina = 5;
  gs.player.psycho.fatigue = 5;
  gs.player.physio.satiety = 5;
  gs.player.psycho.hp = 5;
  gs.player.psycho.hypothermia = 5;
  gs.player.physio.temperatureC = 10;
  applyEthanRescueRecoveryFloor(gs.player);
  assert.ok(gs.player.physio.stamina >= 20);
  assert.ok(gs.player.psycho.fatigue >= 20);
}

function assertEthanRescueOfferChainDiskShape() {
  const m1 = JSON.parse(readText(`data/maps/${ETHAN_RESCUE_OFFER_MAP_ID}.json`));
  assert.equal(String(m1.name || "").trim(), "雪面失衡");
  assert.equal(m1.actions?.length, 1);
  assert.equal(String(m1.actions[0].text || "").trim(), "继续");
  assert.equal(m1.actions[0].kind, "TRANSITION");
  assert.equal(String(m1.actions[0]?.payload?.toMapId || ""), "wilderness_ethan_rescue_offer_2");
  const raw1 = readText(`data/maps/${ETHAN_RESCUE_OFFER_MAP_ID}.json`);
  assert.ok(!raw1.includes("跟伊森回去"), "legacy single CTA copy must not remain on step-1 map");

  const m4 = JSON.parse(readText(`data/maps/${ETHAN_RESCUE_OFFER_DECISION_MAP_ID}.json`));
  assert.equal(String(m4.id || "").trim(), ETHAN_RESCUE_OFFER_DECISION_MAP_ID);
  assert.equal(String(m4.name || "").trim(), "返航建议");
  assert.equal(m4.actions?.length, 2);
  const agree = m4.actions.find((a) => a.id === ETHAN_RESCUE_AGREE_ACTION_ID);
  const refuse = m4.actions.find((a) => a.id === ETHAN_RESCUE_REFUSE_ACTION_ID);
  assert.ok(agree && agree.kind === "WILDERNESS_ETHAN_RESCUE_ACCEPT");
  assert.equal(String(agree.text || "").trim(), "同意回去");
  assert.ok(refuse && refuse.kind === "TRANSITION");
  assert.equal(String(refuse.text || "").trim(), "拒绝回去");
  assert.equal(String(refuse?.payload?.toMapId || ""), ETHAN_RESCUE_REFUSE_STAY_MAP_ID);
  assert.equal(Number(refuse?.payload?.minutes ?? -1), 0);
  const raw4 = readText(`data/maps/${ETHAN_RESCUE_OFFER_DECISION_MAP_ID}.json`);
  assert.ok(!raw4.includes('"kind": "WILDERNESS_ETHAN_RESCUE_REFUSE"'), "decision map must not embed REFUSE kind");

  const refuseStay = JSON.parse(readText(`data/maps/${ETHAN_RESCUE_REFUSE_STAY_MAP_ID}.json`));
  assert.equal(String(refuseStay.id || "").trim(), ETHAN_RESCUE_REFUSE_STAY_MAP_ID);
  assert.equal(String(refuseStay.name || "").trim(), "留在雪里");
  const desc = String(refuseStay.description || "");
  assert.ok(desc.includes("实在扛不住了就返航"));
  assert.ok(desc.includes("如果你还记得路的话"));
  assert.ok(desc.includes("一瓶水"));
  assert.equal(refuseStay.actions?.length, 1);
  const confirm = refuseStay.actions[0];
  assert.equal(String(confirm.id || "").trim(), ETHAN_RESCUE_REFUSE_CONFIRM_ACTION_ID);
  assert.equal(String(confirm.text || "").trim(), "继续");
  assert.equal(confirm.kind, "WILDERNESS_ETHAN_RESCUE_REFUSE");
}

async function assertAcceptCompletes() {
  const gs = createDefaultGameState();
  gs.time.totalMinutes = 9000;
  gs.currentMapId = ETHAN_RESCUE_OFFER_DECISION_MAP_ID;
  gs.world.currentMapId = ETHAN_RESCUE_OFFER_DECISION_MAP_ID;
  gs.world.wilderness = normalizeWildernessState({
    active: true,
    state: "RESCUE_PENDING",
    sessionStartedAt: 1,
    areaId: "west2",
    regionId: "West2",
    x: 5,
    y: 2,
    stepsTaken: 1,
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "west2_outpost_hub",
    flags: { ethanRescueLastReason: "stamina_zero" }
  });
  gs.player.physio.stamina = 1;
  gs.player.psycho.fatigue = 1;
  gs.player.physio.satiety = 1;
  gs.player.psycho.hp = 1;
  gs.player.psycho.hypothermia = 1;
  gs.player.physio.temperatureC = 15;
  const decisionMap = await loadMap(ETHAN_RESCUE_OFFER_DECISION_MAP_ID);
  assert.ok(decisionMap);
  gs.currentMap = decisionMap;
  replaceGameState(gs);
  const plan = await resolve(
    {
      type: "MAP_ACTION",
      id: ETHAN_RESCUE_AGREE_ACTION_ID,
      payload: {},
      meta: { atMs: Date.now(), source: "contract", mapId: ETHAN_RESCUE_OFFER_DECISION_MAP_ID }
    },
    gameState
  );
  validatePlan(plan);
  const res = await commit(plan, gameState);
  assert.equal(res.ok, true);
  assert.equal(gameState.currentMapId, ETHAN_RESCUE_BED_MAP_ID);
  assert.equal(gameState.world.wilderness.active, false);
  assert.ok(gameState.player.physio.stamina >= 20);
  assert.ok(gameState.player.psycho.fatigue >= 20);
  assert.ok(gameState.player.physio.satiety >= 20);
  assert.ok(gameState.player.psycho.hp >= 20);
  assert.ok(gameState.player.psycho.hypothermia >= 20);
  assert.ok(gameState.player.physio.temperatureC >= 20);
}

async function assertRefuseReturnsRuntimeAndStaminaPlus5() {
  const gs = createDefaultGameState();
  gs.time.totalMinutes = 9000;
  gs.currentMapId = ETHAN_RESCUE_REFUSE_STAY_MAP_ID;
  gs.world.currentMapId = ETHAN_RESCUE_REFUSE_STAY_MAP_ID;
  gs.world.wilderness = normalizeWildernessState({
    active: true,
    state: "RESCUE_PENDING",
    sessionStartedAt: 1,
    areaId: "west2",
    regionId: "West2",
    x: 5,
    y: 2,
    stepsTaken: 1,
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "west2_outpost_hub",
    flags: { ethanRescueLastReason: "stamina_zero" }
  });
  gs.player.physio.stamina = 0;
  gs.player.psycho.fatigue = 22;
  gs.player.physio.satiety = 33;
  gs.player.psycho.hp = 44;
  gs.player.psycho.hypothermia = 11;
  gs.player.physio.temperatureC = 12;
  const refuseStayMap = await loadMap(ETHAN_RESCUE_REFUSE_STAY_MAP_ID);
  assert.ok(refuseStayMap);
  gs.currentMap = refuseStayMap;
  replaceGameState(gs);
  const plan = await resolve(
    {
      type: "MAP_ACTION",
      id: ETHAN_RESCUE_REFUSE_CONFIRM_ACTION_ID,
      payload: {},
      meta: { atMs: Date.now(), source: "contract", mapId: ETHAN_RESCUE_REFUSE_STAY_MAP_ID }
    },
    gameState
  );
  validatePlan(plan);
  const res = await commit(plan, gameState);
  assert.equal(res.ok, true);
  assert.equal(gameState.currentMapId, "wilderness_runtime");
  assert.equal(String(gameState.world.wilderness.state), "NAVIGATING");
  assert.equal(gameState.world.wilderness.active, true);
  assert.equal(Number(gameState.player.physio.stamina), 5);
  assert.equal(Number(gameState.player.psycho.fatigue), 22);
  assert.equal(Number(gameState.player.physio.satiety), 33);
  assert.equal(Number(gameState.player.psycho.hp), 44);
  assert.equal(Number(gameState.player.psycho.hypothermia), 11);
  assert.equal(Number(gameState.player.physio.temperatureC), 12);
  const row = res.report?.wilderness?.results?.find((r) => r.type === "WILDERNESS_ETHAN_RESCUE_REFUSE");
  assert.ok(row && row.ok === true);
  assert.equal(row.notice, undefined, "refuse commit must not emit narrative notice");
}

function assertSuppressTransient() {
  const collapseReport = {
    before: { criticalMode: "NORMAL" },
    after: { criticalMode: "COLLAPSE" },
    wilderness: { suppressGenericCollapseNotice: true, results: [] }
  };
  const intents = getTransientIntentsFromCommitReport(collapseReport);
  assert.ok(!intents.some((i) => i.type === "critical_state_notice" && i.payload?.mode === "COLLAPSE"));

  const collapseNoSuppress = {
    before: { criticalMode: "NORMAL" },
    after: { criticalMode: "COLLAPSE" },
    wilderness: { results: [] }
  };
  const intents2 = getTransientIntentsFromCommitReport(collapseNoSuppress);
  assert.ok(intents2.some((i) => i.type === "critical_state_notice" && i.payload?.mode === "COLLAPSE"));

  const deadReport = {
    before: { criticalMode: "NORMAL" },
    after: { criticalMode: "DEAD", time: {}, mapId: "test_map" },
    wilderness: { suppressGenericCollapseNotice: true, results: [] }
  };
  const deadIntents = getTransientIntentsFromCommitReport(deadReport);
  assert.ok(deadIntents.some((i) => i.type === "critical_state_notice" && i.payload?.mode === "death_archive"));
}

function assertFlagsSanitized() {
  const merged = normalizeWildernessState({
    active: true,
    state: "NAVIGATING",
    sessionStartedAt: 1,
    areaId: "west2",
    regionId: "West2",
    x: 1,
    y: 1,
    stepsTaken: 0,
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "west2_outpost_hub",
    flags: {
      ethanRescueLastHandledKey: "k1",
      ethanRescueLastReason: "stamina_zero",
      ethanRescueLastAt: 99
    }
  });
  assert.equal(merged.flags.ethanRescueLastHandledKey, "k1");
}

async function assertStaminaOfferPath() {
  const gs = createDefaultGameState();
  await setupRuntime(gs, 4, 2);
  gameState.player.physio.stamina = 5;
  gameState.player.psycho.fatigue = 80;
  gameState.player.physio.satiety = 80;
  gameState.player.psycho.hp = 80;
  const plan = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_E",
      payload: {},
      meta: { atMs: Date.now(), source: "contract", mapId: "wilderness_runtime" }
    },
    gameState
  );
  validatePlan(plan);
  const intent = plan.wildernessPipelineIntents[0];
  assert.ok(intent?.type === "WILDERNESS_MOVE" && intent.movementPlan?.ok === true);
  intent.movementPlan.minutes = 0;
  intent.movementPlan.staminaCost = 5;
  const res = await commit(plan, gameState);
  assert.equal(res.ok, true);
  const row = res.report?.wilderness?.results?.find((r) => r.type === "WILDERNESS_ETHAN_RESCUE_CHECK");
  assert.ok(row, "expected WILDERNESS_ETHAN_RESCUE_CHECK");
  if (!row.rescueSuccess) return;
  assert.equal(gameState.currentMapId, ETHAN_RESCUE_OFFER_MAP_ID);
  assert.equal(gameState.world.wilderness.active, true);
  assert.equal(String(gameState.world.wilderness.state), "RESCUE_PENDING");
  assert.ok(Number(gameState.player.physio.stamina) <= 5);
}

async function assertFatigueAutoCarry() {
  const gs = createDefaultGameState();
  await setupRuntime(gs, 4, 2);
  gameState.player.physio.stamina = 80;
  gameState.player.psycho.fatigue = 0.05;
  gameState.player.physio.satiety = 80;
  gameState.player.psycho.hp = 80;
  const plan = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_E",
      payload: {},
      meta: { atMs: Date.now(), source: "contract", mapId: "wilderness_runtime" }
    },
    gameState
  );
  validatePlan(plan);
  const intent = plan.wildernessPipelineIntents[0];
  assert.ok(intent?.type === "WILDERNESS_MOVE" && intent.movementPlan?.ok === true);
  intent.movementPlan.minutes = 10;
  intent.movementPlan.staminaCost = 0;
  const res = await commit(plan, gameState);
  assert.equal(res.ok, true);
  const row = res.report?.wilderness?.results?.find((r) => r.type === "WILDERNESS_ETHAN_RESCUE_CHECK");
  if (!row?.collapseDetected || row.reason !== "fatigue_zero" || !row.rescueSuccess) return;
  assert.equal(gameState.currentMapId, ETHAN_RESCUE_BED_MAP_ID);
  assert.equal(gameState.world.wilderness.active, false);
  assert.ok(gameState.player.physio.stamina >= 20);
  assert.ok(gameState.player.psycho.fatigue >= 20);
}

async function main() {
  assertNoCallRescue();
  const n = countWildernessRuntimeActionsFromDisk();
  assert.equal(n, 9, `wilderness_runtime action count must stay 9, got ${n}`);

  assertCrossingDetect();
  assertRegionChance();
  assertRollStableNoRandom();
  assertRepeatEventKey();
  assertRescueFailureNoRepeatRoll();
  assertRecoveryFloorHelper();
  assertEthanRescueOfferChainDiskShape();
  await assertAcceptCompletes();
  await assertRefuseReturnsRuntimeAndStaminaPlus5();
  assertSuppressTransient();
  assertFlagsSanitized();
  await assertStaminaOfferPath();
  await assertFatigueAutoCarry();
  await assertStaminaInsufficientNaturalRescue();
  await assertStaminaAlreadyZeroHoldoutPath();

  console.log("wilderness_ethan_rescue_contract_check: ok");
}

/**
 * Bug3 (stamina soft-lock fix): when the player tries to move with
 * `0 < stamina < cost`, the resolver MUST NOT emit a blocker. Commit MUST
 * clamp stamina to 0 and the existing Ethan rescue post-processor MUST
 * pick up the stamina_zero crossing — no manual plan patching required.
 * This is the end-to-end contract for "low-stamina move attempt → rescue
 * chain enters", through the real resolve → commit pipeline.
 */
async function assertStaminaInsufficientNaturalRescue() {
  const gs = createDefaultGameState();
  await setupRuntime(gs, 4, 2);
  gameState.player.physio.stamina = 1;
  gameState.player.psycho.fatigue = 80;
  gameState.player.physio.satiety = 80;
  gameState.player.psycho.hp = 80;
  const beforeCoord = {
    x: gameState.world.wilderness.x,
    y: gameState.world.wilderness.y,
    steps: gameState.world.wilderness.stepsTaken
  };
  const plan = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_E",
      payload: {},
      meta: { atMs: Date.now(), source: "contract", mapId: "wilderness_runtime" }
    },
    gameState
  );
  validatePlan(plan);
  const intent = plan.wildernessPipelineIntents[0];
  assert.equal(intent?.type, "WILDERNESS_MOVE");
  assert.equal(intent.movementPlan?.ok, true, "low-stamina plan stays ok (no blocker)");
  assert.equal(intent.movementPlan?.blocker, null, "low-stamina plan carries no blocker");
  assert.equal(
    intent.movementPlan?.staminaInsufficient,
    true,
    "low-stamina plan carries staminaInsufficient marker"
  );
  assert.equal(
    String(intent.movementPlan?.collapseReason || ""),
    "stamina_depleted_during_wilderness_move",
    "low-stamina plan carries canonical collapseReason"
  );

  const res = await commit(plan, gameState);
  assert.equal(res.ok, true, "low-stamina commit pipeline ok");

  const moveRow = res.report?.wilderness?.results?.find((r) =>
    r.type === "WILDERNESS_MOVE" && r.staminaInsufficient === true
  );
  assert.ok(moveRow, "low-stamina commit emits staminaInsufficient move row");
  assert.equal(
    moveRow.ok,
    false,
    "low-stamina move row marked ok:false (attempt failed)"
  );
  assert.equal(
    String(moveRow.collapseReason || ""),
    "stamina_depleted_during_wilderness_move",
    "move row carries collapseReason"
  );
  assert.ok(moveRow.survival && moveRow.survival.playerTimeApplied === true);
  assert.ok(
    Number(moveRow.survival.before.stamina) > 0,
    "rescue: survival.before.stamina > 0 (pre-collapse)"
  );
  assert.equal(
    Number(moveRow.survival.after.stamina),
    0,
    "rescue: survival.after.stamina === 0 (clamped)"
  );

  // The Ethan rescue post-processor MUST run for this collapse signature
  // without any plan patching — natural resolve → commit produces the
  // stamina_zero crossing the detector keys off.
  const rescueRow = res.report?.wilderness?.results?.find(
    (r) => r.type === "WILDERNESS_ETHAN_RESCUE_CHECK"
  );
  assert.ok(rescueRow, "Ethan rescue check row present after natural collapse");
  assert.equal(rescueRow.reason, "stamina_zero");
  assert.equal(rescueRow.collapseDetected, true);
  assert.equal(rescueRow.rescueEligible, true);
  assert.equal(typeof rescueRow.rescueSuccess, "boolean");

  // Coords and stepsTaken remain at the origin cell: a stamina-collapsed
  // attempt MUST NOT advance position regardless of rescue outcome.
  if (!rescueRow.rescueSuccess) {
    assert.equal(gameState.world.wilderness.x, beforeCoord.x, "rescue fail: x unchanged");
    assert.equal(gameState.world.wilderness.y, beforeCoord.y, "rescue fail: y unchanged");
    assert.equal(gameState.world.wilderness.stepsTaken, beforeCoord.steps, "rescue fail: steps unchanged");
  }
  // Stamina remains exactly 0 (clamp invariant). Rescue success may then
  // apply a floor in a downstream step; here we only assert non-negative.
  assert.ok(Number(gameState.player.physio.stamina) >= 0, "stamina non-negative");
}

/**
 * Bug3 (round 2): when stamina is ALREADY at zero (or below) and the player
 * keeps clicking a wilderness move, the legacy "体力不足" blocker dialog
 * MUST stay sealed. Because `before.stamina === 0` cannot cross the
 * stamina_zero threshold, the Ethan rescue post-processor does NOT fire —
 * commit must instead surface a `WILDERNESS_STAMINA_HOLDOUT_NOTICE` row
 * (non-blocker feedback) so the dispatch layer can render a "无力前行" style
 * dialog without re-opening the removed copy.
 */
async function assertStaminaAlreadyZeroHoldoutPath() {
  const gs = createDefaultGameState();
  await setupRuntime(gs, 4, 2);
  gameState.player.physio.stamina = 0;
  gameState.player.psycho.fatigue = 80;
  gameState.player.physio.satiety = 80;
  gameState.player.psycho.hp = 80;
  const beforeCoord = {
    x: gameState.world.wilderness.x,
    y: gameState.world.wilderness.y,
    steps: gameState.world.wilderness.stepsTaken
  };
  const plan = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_E",
      payload: {},
      meta: { atMs: Date.now(), source: "contract", mapId: "wilderness_runtime" }
    },
    gameState
  );
  validatePlan(plan);
  const intent = plan.wildernessPipelineIntents[0];
  assert.equal(intent?.type, "WILDERNESS_MOVE");
  assert.equal(intent.movementPlan?.ok, true, "stamina=0 plan stays ok (no blocker)");
  assert.equal(intent.movementPlan?.blocker, null, "stamina=0 plan carries no blocker");
  assert.equal(
    intent.movementPlan?.staminaInsufficient,
    true,
    "stamina=0 plan flagged staminaInsufficient"
  );
  assert.equal(
    String(intent.movementPlan?.collapseReason || ""),
    "stamina_already_depleted",
    "stamina=0 plan carries stamina_already_depleted collapseReason"
  );

  const res = await commit(plan, gameState);
  assert.equal(res.ok, true, "stamina=0 commit pipeline ok");

  const moveRow = res.report?.wilderness?.results?.find((r) =>
    r.type === "WILDERNESS_MOVE" && r.staminaInsufficient === true
  );
  assert.ok(moveRow, "stamina=0 commit emits staminaInsufficient move row");
  assert.equal(moveRow.ok, false, "stamina=0 move row ok:false");
  assert.equal(moveRow.blocker, undefined, "stamina=0 move row MUST NOT carry blocker");

  // No stamina_zero crossing ⇒ Ethan rescue post-processor MUST skip.
  const rescueRow = res.report?.wilderness?.results?.find(
    (r) => r.type === "WILDERNESS_ETHAN_RESCUE_CHECK"
  );
  assert.equal(rescueRow, undefined, "stamina=0: no Ethan rescue check row (no crossing)");

  // Commit must publish the non-blocker holdout feedback row so the dispatch
  // layer has SOMETHING to render (no silently swallowed click).
  const holdoutRow = res.report?.wilderness?.results?.find(
    (r) => r.type === "WILDERNESS_STAMINA_HOLDOUT_NOTICE"
  );
  assert.ok(holdoutRow, "stamina=0: holdout notice row present");
  assert.ok(holdoutRow.notice && typeof holdoutRow.notice === "object", "holdout has notice payload");
  assert.notEqual(
    holdoutRow.notice.title,
    "体力不足",
    "holdout notice title MUST NOT be '体力不足'"
  );
  assert.ok(
    !String(holdoutRow.notice.message || "").includes("你的体力不足以完成"),
    "holdout notice message MUST NOT include the removed '体力不足以完成' copy"
  );

  // Coords / steps unchanged; stamina remains 0 (no negative deduction).
  assert.equal(gameState.world.wilderness.x, beforeCoord.x, "stamina=0 holdout: x unchanged");
  assert.equal(gameState.world.wilderness.y, beforeCoord.y, "stamina=0 holdout: y unchanged");
  assert.equal(gameState.world.wilderness.stepsTaken, beforeCoord.steps, "stamina=0 holdout: steps unchanged");
  assert.equal(gameState.player.physio.stamina, 0, "stamina=0 holdout: stamina remains 0");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
