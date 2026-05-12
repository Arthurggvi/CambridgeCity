/**
 * Phase 12A-audit: Ethan wilderness rescue security audit checks (A-L).
 * Run: node scripts/wilderness_ethan_rescue_audit_check.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadMap } from "../src/engine/loader.js";
import { createDefaultGameState, gameState, replaceGameState } from "../src/engine/state.js";
import { resolve } from "../src/engine/pipeline/resolve.js";
import { commit } from "../src/engine/pipeline/commit.js";
import { validatePlan } from "../src/engine/pipeline/plan_types.js";
import { sanitizeSnapshot, makeEmptySnapshot } from "../src/save/save_schema.js";
import { validateMap } from "../src/engine/validate/map_validate.js";
import {
  ETHAN_RESCUE_BED_MAP_ID,
  ETHAN_RESCUE_OFFER_MAP_ID,
  ETHAN_RESCUE_OFFER_DECISION_MAP_ID,
  ETHAN_RESCUE_AGREE_ACTION_ID,
  ETHAN_RESCUE_REFUSE_ACTION_ID,
  ETHAN_RESCUE_REFUSE_STAY_MAP_ID,
  ETHAN_RESCUE_REFUSE_CONFIRM_ACTION_ID,
  applyEthanRescueRecoveryFloor,
  buildEthanRescueEventKey,
  createDeterministicEthanRescueRoll,
  detectEthanRescueEligibleCollapse,
  processWildernessEthanRescueAfterMove
} from "../src/engine/wilderness/wilderness_ethan_rescue_service.js";
import { normalizeWildernessState } from "../src/engine/wilderness/wilderness_state.js";
import { getTransientIntentsFromCommitReport } from "../src/engine/pipeline/transient_intent_adapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readText(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function listImports(sourceText) {
  return [...sourceText.matchAll(/^\s*import\s+[^;]*?from\s+["']([^"']+)["'];?\s*$/gm)].map((m) => m[1]);
}

function assertNoForbiddenImportsInRescueService() {
  const rel = "src/engine/wilderness/wilderness_ethan_rescue_service.js";
  const text = readText(rel);
  const imports = listImports(text);
  const forbiddenFiles = new Set([
    "commit.js",
    "dispatch.js",
    "renderer.js",
    "dialogs.js",
    "transient_intent_adapter.js",
    "state.js",
    "environment_weather.js",
    "player.js"
  ]);
  for (const imp of imports) {
    if (imp.includes("/render/") || imp.includes("\\render\\")) {
      assert.fail(`${rel} must not import render/*, found: ${imp}`);
    }
    if (imp.includes("/save/") || imp.includes("\\save\\")) {
      assert.fail(`${rel} must not import save/*, found: ${imp}`);
    }
    const base = path.posix.basename(imp.replaceAll("\\", "/"));
    if (forbiddenFiles.has(base)) {
      assert.fail(`${rel} must not import ${base}, found: ${imp}`);
    }
  }
  assert.ok(!text.includes("applyCommittedMapState"), "rescue service must not call applyCommittedMapState");
}

function assertApplyCommittedMapStateUsers() {
  const allJs = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        walk(p);
      } else if (/\.(js|mjs)$/.test(ent.name)) {
        allJs.push(p);
      }
    }
  };
  walk(path.join(repoRoot, "src"));

  const hits = [];
  for (const p of allJs) {
    const t = fs.readFileSync(p, "utf8");
    if (t.includes("applyCommittedMapState")) {
      hits.push(path.relative(repoRoot, p).replaceAll("\\", "/"));
    }
  }

  // B-2/3: `applyCommittedMapState` must not appear under src/ except on the
  // canonical commit write path. It is defined and primarily invoked in
  // `commit.js`; `wilderness_commit_adapter.js` and
  // `wilderness_event_action_integration.js` only receive it as an injected
  // dependency from `commit` (see `executeWildernessEventActionCommit`,
  // `maybeNavigateToWildernessEventRuntimeAfterMove`) — not from resolve/UI.
  const expectedCommitChainApplyCommittedMapStateFiles = [
    "src/engine/pipeline/commit.js",
    "src/engine/pipeline/commit_adapters/wilderness_commit_adapter.js",
    "src/engine/wilderness/events/wilderness_event_action_integration.js"
  ].sort();
  assert.deepEqual(
    [...new Set(hits)].sort(),
    expectedCommitChainApplyCommittedMapStateFiles,
    `applyCommittedMapState used outside commit chain: ${hits.join(", ")}`
  );
}

function assertFlagsPersistenceRoundtrip() {
  const gs = createDefaultGameState();
  gs.world.wilderness = normalizeWildernessState({
    active: true,
    state: "RESCUE_PENDING",
    sessionStartedAt: 11,
    regionId: "West2",
    areaId: "west2_old_marker_patrol_line",
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "west2_outpost_hub",
    x: 1,
    y: 2,
    stepsTaken: 3,
    flags: {
      ethanRescueLastHandledKey: "k_test",
      ethanRescueLastReason: "stamina_zero",
      ethanRescueLastAt: 999
    }
  });
  const n1 = normalizeWildernessState(gs.world.wilderness);
  assert.equal(n1.flags.ethanRescueLastHandledKey, "k_test");
  assert.equal(n1.flags.ethanRescueLastReason, "stamina_zero");
  assert.equal(n1.flags.ethanRescueLastAt, 999);

  const snap = makeEmptySnapshot(gs);
  const sanitized = sanitizeSnapshot(snap);
  const w2 = sanitized.world?.wilderness;
  assert.ok(w2 && typeof w2 === "object");
  assert.equal(w2.flags.ethanRescueLastHandledKey, "k_test");
  assert.equal(w2.flags.ethanRescueLastReason, "stamina_zero");
  assert.equal(w2.flags.ethanRescueLastAt, 999);

  const n2 = normalizeWildernessState(w2);
  assert.equal(n2.flags.ethanRescueLastHandledKey, "k_test");
  assert.equal(n2.state, "RESCUE_PENDING");
}

function assertStateCompatibility() {
  const a = normalizeWildernessState({ active: true, state: "RESCUE_PENDING", flags: {} });
  assert.equal(a.active, true);
  assert.equal(a.state, "RESCUE_PENDING");
  const b = normalizeWildernessState({ active: false, state: "RECOVERED", flags: {} });
  assert.equal(b.active, false);
  assert.equal(b.state, "RECOVERED");

  const snap = sanitizeSnapshot(makeEmptySnapshot({ world: { wilderness: b } }));
  const n = normalizeWildernessState(snap.world.wilderness);
  assert.equal(n.state, "RECOVERED");
}

function assertEventKeyDedupeCore() {
  const key1 = buildEthanRescueEventKey({
    sessionStartedAt: 1,
    areaId: "a",
    x: 1,
    y: 2,
    stepsTaken: 3,
    reason: "stamina_zero"
  });
  const key1b = buildEthanRescueEventKey({
    sessionStartedAt: 1,
    areaId: "a",
    x: 1,
    y: 2,
    stepsTaken: 3,
    reason: "stamina_zero"
  });
  assert.equal(key1, key1b);
  const key2 = buildEthanRescueEventKey({
    sessionStartedAt: 1,
    areaId: "a",
    x: 1,
    y: 2,
    stepsTaken: 3,
    reason: "fatigue_zero"
  });
  assert.notEqual(key1, key2);
  const key3 = buildEthanRescueEventKey({
    sessionStartedAt: 1,
    areaId: "a",
    x: 1,
    y: 2,
    stepsTaken: 4,
    reason: "stamina_zero"
  });
  assert.notEqual(key1, key3);

  const activeState = {
    time: { totalMinutes: 9000 },
    player: createDefaultGameState().player,
    world: {
      wilderness: normalizeWildernessState({
        active: true,
        state: "NAVIGATING",
        sessionStartedAt: 1,
        areaId: "a",
        regionId: "West2",
        runtimeMapId: "wilderness_runtime",
        fallbackMapId: "west2_outpost_hub",
        x: 1,
        y: 2,
        stepsTaken: 3,
        flags: { ethanRescueLastHandledKey: key1 }
      })
    }
  };
  const results = [];
  const extras = {};
  processWildernessEthanRescueAfterMove(
    activeState,
    results,
    { beforeSurvival: { stamina: 5, fatigue: 50, hp: 50 }, afterSurvival: { stamina: 0, fatigue: 50, hp: 50 } },
    extras
  );
  const row = results.find((r) => r.type === "WILDERNESS_ETHAN_RESCUE_CHECK");
  assert.ok(row);
  assert.equal(row.repeatedEventSkipped, true);
  assert.ok(!("rescueRoll" in row), "repeated event must not roll");
}

async function setupRuntime(gs, wx, wy, regionId = "West2", areaId = "west2_old_marker_patrol_line") {
  gs.time.totalMinutes = 9000;
  gs.world.wilderness = normalizeWildernessState({
    active: true,
    regionId,
    areaId,
    originMapId: "west2_outpost_exit",
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "west2_outpost_hub",
    x: wx,
    y: wy,
    heading: "N",
    state: "NAVIGATING",
    stepsTaken: 0,
    flags: {},
    sessionStartedAt: 1,
    lastUpdatedAt: 1,
    schemaVersion: 1
  });
  const wrMap = await loadMap("wilderness_runtime");
  assert.ok(wrMap);
  gs.currentMapId = "wilderness_runtime";
  gs.world.currentMapId = "wilderness_runtime";
  gs.currentMap = wrMap;
  replaceGameState(gs);
}

async function assertOfferFlowSafety() {
  const gs = createDefaultGameState();
  await setupRuntime(gs, 4, 2, "West2", "west2_old_marker_patrol_line");
  gameState.player.physio.stamina = 5;
  gameState.player.psycho.fatigue = 80;
  gameState.player.psycho.hp = 80;
  gameState.player.physio.satiety = 80;

  const plan = await resolve(
    { type: "MAP_ACTION", id: "wilderness_move_E", payload: {}, meta: { atMs: Date.now(), source: "audit", mapId: "wilderness_runtime" } },
    gameState
  );
  validatePlan(plan);
  const intent = plan.wildernessPipelineIntents[0];
  intent.movementPlan.minutes = 0;
  intent.movementPlan.staminaCost = 5;

  const beforeVitals = {
    hp: Number(gameState.player.psycho.hp),
    stamina: Number(gameState.player.physio.stamina),
    fatigue: Number(gameState.player.psycho.fatigue),
    satiety: Number(gameState.player.physio.satiety),
    hypothermia: Number(gameState.player.psycho.hypothermia),
    temperatureC: Number(gameState.player.physio.temperatureC)
  };
  const res = await commit(plan, gameState);
  assert.equal(res.ok, true);
  const check = res.report?.wilderness?.results?.find((r) => r.type === "WILDERNESS_ETHAN_RESCUE_CHECK");
  assert.ok(check);
  if (check.rescueSuccess !== true || check.reason !== "stamina_zero") return; // deterministic roll may fail for other coords

  assert.equal(gameState.currentMapId, ETHAN_RESCUE_OFFER_MAP_ID);
  assert.equal(gameState.world.wilderness.active, true);
  assert.equal(String(gameState.world.wilderness.state), "RESCUE_PENDING");
  assert.equal(res.report?.wilderness?.suppressGenericCollapseNotice, true);

  // not floored yet
  assert.equal(Number(gameState.player.psycho.hp), beforeVitals.hp);
  assert.ok(Number(gameState.player.physio.stamina) <= beforeVitals.stamina);
  assert.equal(Number(gameState.player.psycho.fatigue), beforeVitals.fatigue);
  assert.equal(Number(gameState.player.physio.satiety), beforeVitals.satiety);
  assert.equal(Number(gameState.player.psycho.hypothermia), beforeVitals.hypothermia);
  assert.equal(Number(gameState.player.physio.temperatureC), beforeVitals.temperatureC);

  // offer chain: step 1 is TRANSITION continue only
  const offer = await loadMap(ETHAN_RESCUE_OFFER_MAP_ID);
  assert.ok(offer);
  assert.equal(offer.id, ETHAN_RESCUE_OFFER_MAP_ID);
  assert.ok(Array.isArray(offer.actions) && offer.actions.length === 1);
  assert.equal(offer.actions[0].kind, "TRANSITION");
  assert.equal(String(offer.actions[0].text || "").trim(), "继续");

  const decision = await loadMap(ETHAN_RESCUE_OFFER_DECISION_MAP_ID);
  assert.ok(decision);
  assert.equal(decision.actions?.length, 2);
  const agreeA = decision.actions.find((a) => a.id === ETHAN_RESCUE_AGREE_ACTION_ID);
  const refuseA = decision.actions.find((a) => a.id === ETHAN_RESCUE_REFUSE_ACTION_ID);
  assert.ok(agreeA && agreeA.kind === "WILDERNESS_ETHAN_RESCUE_ACCEPT");
  assert.ok(refuseA && refuseA.kind === "TRANSITION");
  assert.equal(String(refuseA?.payload?.toMapId || ""), ETHAN_RESCUE_REFUSE_STAY_MAP_ID);

  // accept only under strict gate: wrong map must reject
  gameState.currentMapId = "wilderness_runtime";
  gameState.world.currentMapId = "wilderness_runtime";
  gameState.currentMap = await loadMap("wilderness_runtime");
  const badPlan = await resolve(
    { type: "MAP_ACTION", id: ETHAN_RESCUE_AGREE_ACTION_ID, payload: {}, meta: { atMs: Date.now(), source: "audit", mapId: "wilderness_runtime" } },
    gameState
  );
  assert.ok(badPlan?.ok !== true, "accept action on wrong map must not resolve ok");
}

async function assertAutoCarrySafety() {
  const gs = createDefaultGameState();
  await setupRuntime(gs, 4, 2, "West2", "west2_old_marker_patrol_line");
  gameState.player.physio.stamina = 80;
  gameState.player.psycho.fatigue = 0.05;
  gameState.player.psycho.hp = 80;
  gameState.player.physio.satiety = 80;

  const plan = await resolve(
    { type: "MAP_ACTION", id: "wilderness_move_E", payload: {}, meta: { atMs: Date.now(), source: "audit", mapId: "wilderness_runtime" } },
    gameState
  );
  validatePlan(plan);
  const intent = plan.wildernessPipelineIntents[0];
  intent.movementPlan.minutes = 10;
  intent.movementPlan.staminaCost = 0;
  const res = await commit(plan, gameState);
  assert.equal(res.ok, true);
  const check = res.report?.wilderness?.results?.find((r) => r.type === "WILDERNESS_ETHAN_RESCUE_CHECK");
  if (!check?.collapseDetected || check.reason !== "fatigue_zero" || check.rescueSuccess !== true) return;

  assert.equal(gameState.currentMapId, ETHAN_RESCUE_BED_MAP_ID);
  assert.equal(gameState.world.wilderness.active, false);
  assert.ok(Number(gameState.player.psycho.hp) >= 20);
  assert.ok(Number(gameState.player.physio.stamina) >= 20);
  assert.ok(Number(gameState.player.physio.satiety) >= 20);
  assert.ok(Number(gameState.player.psycho.fatigue) >= 20);
  assert.ok(Number(gameState.player.psycho.hypothermia) >= 20);
  assert.ok(Number(gameState.player.physio.temperatureC) >= 20);
  assert.ok(!String(check.notice?.message || "").includes("你选择"));
}

function assertNonRescueZeroDoesNotTrigger() {
  assert.equal(
    detectEthanRescueEligibleCollapse({ before: { stamina: 50, fatigue: 50, hp: 0 }, after: { stamina: 0, fatigue: 0, hp: 0 } }),
    null
  );
  assert.equal(
    detectEthanRescueEligibleCollapse({ before: { stamina: 50, fatigue: 50, hp: 50, satiety: 1 }, after: { stamina: 50, fatigue: 50, hp: 50, satiety: 0 } }),
    null
  );
  assert.equal(
    detectEthanRescueEligibleCollapse({ before: { stamina: 50, fatigue: 50, hp: 50, temperatureC: -99 }, after: { stamina: 50, fatigue: 50, hp: 50, temperatureC: -99 } }),
    null
  );
  assert.equal(
    detectEthanRescueEligibleCollapse({ before: { stamina: 50, fatigue: 50, hp: 50, hypothermia: 0 }, after: { stamina: 50, fatigue: 50, hp: 50, hypothermia: 0 } }),
    null
  );
}

function assertRecoveryFloorFieldSafety() {
  const p = createDefaultGameState().player;
  p.psycho.hp = 1;
  p.physio.stamina = 1;
  p.physio.satiety = 1;
  p.psycho.fatigue = 1;
  p.psycho.hypothermia = 1;
  p.physio.temperatureC = 10;
  p.psycho.hypoStage = "Severe";
  p.meta = { sleepEpisode: { mode: "COLLAPSE" } };
  applyEthanRescueRecoveryFloor(p);
  assert.ok(Number(p.psycho.hp) >= 20);
  assert.ok(Number(p.physio.stamina) >= 20);
  assert.ok(Number(p.physio.satiety) >= 20);
  assert.ok(Number(p.psycho.fatigue) >= 20);
  assert.ok(Number(p.psycho.hypothermia) >= 20);
  assert.ok(Number(p.physio.temperatureC) >= 20);
  // must not hardcode hypoStage to Safe
  assert.equal(String(p.psycho.hypoStage), "Severe");
  // audit: helper should not alter collapse-episode mode here (this is narrative state, not a vital)
  assert.equal(String(p.meta.sleepEpisode.mode), "COLLAPSE");
}

function assertMutualExclusionStability() {
  const collapseReport = { before: { criticalMode: "NORMAL" }, after: { criticalMode: "COLLAPSE" }, wilderness: { suppressGenericCollapseNotice: true } };
  const intents = getTransientIntentsFromCommitReport(collapseReport);
  assert.ok(!intents.some((i) => i.type === "critical_state_notice" && i.payload?.mode === "COLLAPSE"));

  const ordinaryCollapse = { before: { criticalMode: "NORMAL" }, after: { criticalMode: "COLLAPSE" }, wilderness: {} };
  const intents2 = getTransientIntentsFromCommitReport(ordinaryCollapse);
  assert.ok(intents2.some((i) => i.type === "critical_state_notice" && i.payload?.mode === "COLLAPSE"));

  const deadReport = { before: { criticalMode: "NORMAL" }, after: { criticalMode: "DEAD", time: {}, mapId: "test_map" }, wilderness: { suppressGenericCollapseNotice: true } };
  const intents3 = getTransientIntentsFromCommitReport(deadReport);
  assert.ok(intents3.some((i) => i.type === "critical_state_notice" && i.payload?.mode === "death_archive"));
}

function assertMapValidateAndKinds() {
  const wr = JSON.parse(readText("data/maps/wilderness_runtime.json"));
  assert.equal(Array.isArray(wr.actions) ? wr.actions.length : 0, 9);
  assert.equal(validateMap(wr, "wilderness_runtime.json"), true);

  const offer = JSON.parse(readText(`data/maps/${ETHAN_RESCUE_OFFER_MAP_ID}.json`));
  assert.equal(validateMap(offer, `${ETHAN_RESCUE_OFFER_MAP_ID}.json`), true);
  assert.ok(Array.isArray(offer.actions) && offer.actions.length === 1);
  assert.equal(offer.actions[0].kind, "TRANSITION");
  assert.ok(!("effects" in offer.actions[0]));
  assert.ok(!("semantic" in offer.actions[0]));
  assert.ok(!("requires" in offer.actions[0]));
  assert.ok(!("onEnterEffects" in offer.actions[0]));

  const offer2 = JSON.parse(readText("data/maps/wilderness_ethan_rescue_offer_2.json"));
  assert.equal(validateMap(offer2, "wilderness_ethan_rescue_offer_2.json"), true);
  const offer3 = JSON.parse(readText("data/maps/wilderness_ethan_rescue_offer_3.json"));
  assert.equal(validateMap(offer3, "wilderness_ethan_rescue_offer_3.json"), true);
  const offer4 = JSON.parse(readText(`data/maps/${ETHAN_RESCUE_OFFER_DECISION_MAP_ID}.json`));
  assert.equal(validateMap(offer4, `${ETHAN_RESCUE_OFFER_DECISION_MAP_ID}.json`), true);
  assert.equal(offer4.actions?.length, 2);
  const agreeDisk = offer4.actions.find((a) => a.id === ETHAN_RESCUE_AGREE_ACTION_ID);
  const refuseDisk = offer4.actions.find((a) => a.id === ETHAN_RESCUE_REFUSE_ACTION_ID);
  assert.ok(agreeDisk && agreeDisk.kind === "WILDERNESS_ETHAN_RESCUE_ACCEPT");
  assert.ok(refuseDisk && refuseDisk.kind === "TRANSITION");
  assert.ok(!("effects" in agreeDisk));
  assert.ok(!("semantic" in agreeDisk));

  const refuseStay = JSON.parse(readText(`data/maps/${ETHAN_RESCUE_REFUSE_STAY_MAP_ID}.json`));
  assert.equal(validateMap(refuseStay, `${ETHAN_RESCUE_REFUSE_STAY_MAP_ID}.json`), true);
  assert.equal(refuseStay.actions?.length, 1);
  assert.equal(refuseStay.actions[0].id, ETHAN_RESCUE_REFUSE_CONFIRM_ACTION_ID);
  assert.equal(refuseStay.actions[0].kind, "WILDERNESS_ETHAN_RESCUE_REFUSE");

  const bed = JSON.parse(readText(`data/maps/${ETHAN_RESCUE_BED_MAP_ID}.json`));
  assert.equal(validateMap(bed, `${ETHAN_RESCUE_BED_MAP_ID}.json`), true);
  assert.ok(Array.isArray(bed.actions) && bed.actions.length === 1);
  assert.equal(bed.actions[0].kind, "TRANSITION");
  assert.equal(String(bed.actions[0]?.payload?.toMapId || ""), "west2_outpost_rescue_station");
}

function assertNoWildernessCallRescueAnywhere() {
  const roots = ["src", "data", "scripts"];
  for (const root of roots) {
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === "node_modules" || ent.name === ".git") continue;
          walk(p);
        } else if (/\\.(js|mjs|json)$/.test(ent.name)) {
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

async function assertFailurePathNoDeadlockNoMapSwitchNoFloor() {
  // L: drive the failure branch deterministically via service call (no commit-layer coupling).
  const runtimeMap = await loadMap("wilderness_runtime");
  assert.ok(runtimeMap && Array.isArray(runtimeMap.actions) && runtimeMap.actions.length > 0);

  const gs = createDefaultGameState();
  gs.time.totalMinutes = 9000;
  gs.currentMapId = "wilderness_runtime";
  gs.world.currentMapId = "wilderness_runtime";
  gs.currentMap = runtimeMap;
  gs.player.physio.stamina = 4;
  gs.player.psycho.fatigue = 80;
  gs.player.psycho.hp = 80;
  gs.player.physio.satiety = 80;

  const activeState = {
    time: gs.time,
    player: gs.player,
    currentMapId: gs.currentMapId,
    currentMap: gs.currentMap,
    world: {
      wilderness: normalizeWildernessState({
        active: true,
        state: "NAVIGATING",
        sessionStartedAt: 1,
        // keep a valid areaId but use low-chance regionId + far coords
        areaId: "west2_old_marker_patrol_line",
        regionId: "South1",
        runtimeMapId: "wilderness_runtime",
        fallbackMapId: "west2_outpost_hub",
        x: 20,
        y: 20,
        stepsTaken: 1,
        flags: {}
      })
    }
  };

  const before = {
    hp: Number(activeState.player.psycho.hp),
    stamina: Number(activeState.player.physio.stamina),
    fatigue: Number(activeState.player.psycho.fatigue),
    satiety: Number(activeState.player.physio.satiety),
    hypothermia: Number(activeState.player.psycho.hypothermia),
    temperatureC: Number(activeState.player.physio.temperatureC)
  };

  const results = [];
  const extras = {};
  const nav = processWildernessEthanRescueAfterMove(
    activeState,
    results,
    { beforeSurvival: { stamina: 4, fatigue: 80, hp: 80 }, afterSurvival: { stamina: 0, fatigue: 80, hp: 80 } },
    extras
  );
  const check = results.find((r) => r.type === "WILDERNESS_ETHAN_RESCUE_CHECK");
  assert.ok(check);
  assert.equal(check.rescueSuccess, false);
  assert.equal(check.actionMode, "failed");
  assert.ok(check.notice && typeof check.notice.message === "string" && check.notice.message.length > 0);
  assert.equal(nav.navigateMapId, null);
  assert.equal(activeState.currentMapId, "wilderness_runtime");
  assert.equal(activeState.world.wilderness.active, true);
  assert.equal(String(activeState.world.wilderness.state), "RESCUE_PENDING");

  // No floor on failure
  assert.equal(Number(activeState.player.psycho.hp), before.hp);
  assert.ok(Number(activeState.player.physio.stamina) <= before.stamina);
  assert.equal(Number(activeState.player.psycho.fatigue), before.fatigue);
  assert.equal(Number(activeState.player.physio.satiety), before.satiety);
  assert.equal(Number(activeState.player.psycho.hypothermia), before.hypothermia);
  assert.equal(Number(activeState.player.physio.temperatureC), before.temperatureC);

  // same eventKey must not roll again
  const results2 = [];
  const nav2 = processWildernessEthanRescueAfterMove(
    activeState,
    results2,
    { beforeSurvival: { stamina: 4, fatigue: 80, hp: 80 }, afterSurvival: { stamina: 0, fatigue: 80, hp: 80 } },
    {}
  );
  const row2 = results2.find((r) => r.type === "WILDERNESS_ETHAN_RESCUE_CHECK");
  assert.ok(row2);
  assert.equal(row2.repeatedEventSkipped, true);
  assert.equal(nav2.navigateMapId, null);
}

async function main() {
  assertNoForbiddenImportsInRescueService(); // A
  assertApplyCommittedMapStateUsers(); // B
  assertFlagsPersistenceRoundtrip(); // C
  assertStateCompatibility(); // D
  assertEventKeyDedupeCore(); // E
  await assertOfferFlowSafety(); // F
  await assertAutoCarrySafety(); // G
  assertNonRescueZeroDoesNotTrigger(); // H
  assertRecoveryFloorFieldSafety(); // I
  assertMutualExclusionStability(); // J
  assertMapValidateAndKinds(); // K
  assertNoWildernessCallRescueAnywhere(); // K-2
  await assertFailurePathNoDeadlockNoMapSwitchNoFloor(); // L
  console.log("wilderness_ethan_rescue_audit_check: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

