/**
 * Phase 10A: wilderness move commit uses applyTimeToPlayer survival chain + movement stamina extra.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDefaultGameState, gameState, replaceGameState } from "../src/engine/state.js";
import { loadMap } from "../src/engine/loader.js";
import { resolve } from "../src/engine/pipeline/resolve.js";
import { commit } from "../src/engine/pipeline/commit.js";
import { validatePlan } from "../src/engine/pipeline/plan_types.js";
import { STATUS_EFFECT_KEYS, STATUS_EFFECT_KINDS } from "../src/engine/status_effect_runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function assert(c, m) {
  if (!c) throw new Error(m);
}

function activeWest2Session(x, y) {
  return {
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
  };
}

async function setupRuntime(gs, wx, wy) {
  gs.time.totalMinutes = 9000;
  gs.world.wilderness = activeWest2Session(wx, wy);
  const wrMap = await loadMap("wilderness_runtime");
  assert(!!wrMap, "wilderness_runtime map loads");
  gs.currentMapId = "wilderness_runtime";
  gs.world.currentMapId = "wilderness_runtime";
  gs.currentMap = wrMap;
  replaceGameState(gs);
}

function assertCommitWildernessMoveNoDirectThermalHpWrites() {
  const commitPath = path.join(ROOT, "src", "engine", "pipeline", "commit.js");
  const lines = fs.readFileSync(commitPath, "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => l.includes('intent.type === "WILDERNESS_MOVE"'));
  assert(start >= 0, "find WILDERNESS_MOVE branch");
  const slice = lines.slice(start, start + 160).join("\n");
  const banned = ["physio.temperatureC =", "psycho.hypothermia =", "psycho.hypoStage =", "psycho.hp ="];
  for (const b of banned) {
    assert(!slice.includes(b), `WILDERNESS_MOVE commit slice must not contain ${b}`);
  }
}

function assertResolverRendererNoPlayerVitalAssignments() {
  const resolverPath = path.join(ROOT, "src", "engine", "wilderness", "wilderness_movement_resolver.js");
  const rendererPath = path.join(ROOT, "src", "engine", "renderer.js");
  const pat = /\bplayer\s*\.\s*(physio|psycho)\s*\.\s*\w+\s*=/;
  const rs = fs.readFileSync(resolverPath, "utf8");
  const rv = fs.readFileSync(rendererPath, "utf8");
  assert(!pat.test(rs), "resolver must not assign player.physio|psycho fields");
  assert(!pat.test(rv), "renderer must not assign player.physio|psycho fields");
}

async function main() {
  assertCommitWildernessMoveNoDirectThermalHpWrites();
  assertResolverRendererNoPlayerVitalAssignments();

  const gs = createDefaultGameState();
  await setupRuntime(gs, 0, 0);
  if (!gameState.player.meta || typeof gameState.player.meta !== "object") {
    gameState.player.meta = {};
  }
  gameState.player.meta.statusEffects = {
    active: [
      {
        sourceItemId: "contract_survival_periodic",
        stackPolicy: "stack",
        durationMinutes: 300,
        remainingMinutes: 300,
        effects: [
          {
            kind: STATUS_EFFECT_KINDS.PERIODIC,
            effectKey: STATUS_EFFECT_KEYS.STAMINA,
            delta: 0.001,
            everyMinutes: 999,
            carryMinutes: 0
          }
        ]
      }
    ]
  };

  const satietyBefore = Number(gameState.player.physio.satiety);
  const remBefore = Number(gameState.player.meta.statusEffects.active[0].remainingMinutes);

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
  assert(intent?.type === "WILDERNESS_MOVE" && intent.movementPlan?.ok === true, "ok move plan");
  intent.movementPlan.minutes = 120;
  intent.movementPlan.staminaCost = 0;

  const t0 = gameState.time.totalMinutes;
  const res = await commit(plan, gameState);
  assert(res.ok === true, "commit ok");
  assert(gameState.time.totalMinutes === t0 + 120, "time advanced by patched minutes");

  const row = res.report?.wilderness?.results?.find((r) => r.ok && r.type === "WILDERNESS_MOVE");
  const surv = row?.survival;
  assert(surv?.playerTimeApplied === true, "report.survival.playerTimeApplied");
  assert(surv.advancedMinutes === 120, "survival.advancedMinutes");
  assert(surv.staminaExtraCost === 0 && surv.staminaExtraCostInfinity === false, "stamina extra cost zero");

  assert(
    Number(gameState.player.physio.satiety) < satietyBefore,
    "satiety decreases over long applyTimeToPlayer tick (directional)"
  );

  const activeAfter = gameState.player.meta.statusEffects.active;
  assert(Array.isArray(activeAfter) && activeAfter.length >= 1, "status effect instance still active after partial tick");
  const remAfter = Number(activeAfter[0].remainingMinutes);
  assert(remAfter === remBefore - 120, "periodic status effect remainingMinutes decreased by advanced minutes");

  const gsBlock = createDefaultGameState();
  await setupRuntime(gsBlock, 6, 0);
  const snap = () => ({
    t: gameState.time.totalMinutes,
    st: gameState.player.physio.stamina,
    satiety: gameState.player.physio.satiety,
    fatigue: gameState.player.psycho.fatigue,
    temperatureC: gameState.player.physio.temperatureC,
    hypothermia: gameState.player.psycho.hypothermia,
    hypoStage: gameState.player.psycho.hypoStage,
    hp: gameState.player.psycho.hp
  });
  const b = snap();
  const blockPlan = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_E",
      payload: {},
      meta: { atMs: Date.now(), source: "contract", mapId: "wilderness_runtime" }
    },
    gameState
  );
  validatePlan(blockPlan);
  const blockRes = await commit(blockPlan, gameState);
  assert(blockRes.ok === true, "blocked commit ok");
  const a = snap();
  assert(a.t === b.t && a.st === b.st, "blocked: time/stamina");
  assert(
    a.satiety === b.satiety &&
      a.fatigue === b.fatigue &&
      a.temperatureC === b.temperatureC &&
      a.hypothermia === b.hypothermia &&
      a.hypoStage === b.hypoStage &&
      a.hp === b.hp,
    "blocked: survival vitals unchanged"
  );
  const br = blockRes.report?.wilderness?.results?.find((r) => r.type === "WILDERNESS_MOVE" && r.ok === false);
  assert(br && br.survival == null && br.playerTimeApplied !== true, "blocked: no survival summary");

  console.log("[PASS] wilderness_survival_contract_check");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
