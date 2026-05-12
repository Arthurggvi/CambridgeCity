/**
 * Phase 10A: wilderness move commit uses applyTimeToPlayer survival chain + movement stamina extra.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDefaultGameState, gameState, replaceGameState } from "../src/engine/state.js";
import { loadMap, getRegionConfigById, getPlaceProfileForMap } from "../src/engine/loader.js";
import { resolve } from "../src/engine/pipeline/resolve.js";
import { commit } from "../src/engine/pipeline/commit.js";
import { validatePlan } from "../src/engine/pipeline/plan_types.js";
import { STATUS_EFFECT_KEYS, STATUS_EFFECT_KINDS } from "../src/engine/status_effect_runtime.js";
import { applyTimeToPlayer } from "../src/engine/player.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const rngWildernessMoveNeverLost = { random: () => 0.99 };

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
      meta: { atMs: Date.now(), source: "contract", mapId: "wilderness_runtime", wildernessMoveRngLike: rngWildernessMoveNeverLost }
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

  // Pre-existing data drift: (6,0)→E→(7,0) is no longer the canonical hard-
  // block cell after a blueprint regen. The stable post-regen hard-block
  // sample is (7,0)→E→(8,0) tide_crack_zone — pinned by the movement
  // contract. Use that here so this "no survival on blocker" invariant
  // stays anchored to a deterministic hard-block target.
  const gsBlock = createDefaultGameState();
  await setupRuntime(gsBlock, 7, 0);
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
      meta: { atMs: Date.now(), source: "contract", mapId: "wilderness_runtime", wildernessMoveRngLike: rngWildernessMoveNeverLost }
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

  // Bug3 (stamina soft-lock): the deferred-collapse branch MUST still go
  // through applyTimeToPlayer (preserve commit survival ordering) and MUST
  // clamp stamina to exactly 0 — never produce a negative stamina, and
  // never bypass the existing survival pipeline.
  const gsSoft = createDefaultGameState();
  await setupRuntime(gsSoft, 0, 0);
  gameState.player.physio.stamina = 1;
  gameState.player.psycho.fatigue = 80;
  gameState.player.physio.satiety = 80;
  gameState.player.psycho.hp = 80;
  const softTotalMinBefore = gameState.time.totalMinutes;
  const softPlan = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_E",
      payload: {},
      meta: { atMs: Date.now(), source: "contract", mapId: "wilderness_runtime", wildernessMoveRngLike: rngWildernessMoveNeverLost }
    },
    gameState
  );
  validatePlan(softPlan);
  const softIntent = softPlan.wildernessPipelineIntents.find((i) => i?.type === "WILDERNESS_MOVE");
  assert(softIntent?.movementPlan?.staminaInsufficient === true, "soft-collapse plan flagged");
  const softRes = await commit(softPlan, gameState);
  assert(softRes.ok === true, "soft-collapse commit ok");
  // Stamina extra cost MUST NOT drive stamina below zero, regardless of how
  // large the planned cost was relative to the player's pre-move stamina.
  assert(
    Number(gameState.player.physio.stamina) === 0,
    "soft-collapse: stamina clamped exactly to 0 (no negative)"
  );
  assert(
    Number(gameState.player.physio.stamina) >= 0,
    "soft-collapse: stamina remains non-negative"
  );
  // applyTimeToPlayer ordering preserved: time advances normally for the
  // attempted move; survival snapshots both sides of the tick.
  const softRow = softRes.report?.wilderness?.results?.find(
    (r) => r.type === "WILDERNESS_MOVE" && r.staminaInsufficient === true
  );
  assert(softRow, "soft-collapse report row present");
  assert(
    softRow.survival && softRow.survival.playerTimeApplied === true,
    "soft-collapse honors applyTimeToPlayer ordering"
  );
  assert(
    Number(softRow.survival.advancedMinutes) >= 0,
    "soft-collapse survival.advancedMinutes finite >= 0"
  );
  assert(
    Number(gameState.time.totalMinutes) >= softTotalMinBefore,
    "soft-collapse: time monotonically advances"
  );

  // Bug4 (collapse stamina floor): in COLLAPSE the asymptotic decay near
  // the target = 20 cap shrinks single-tick recovery to sub-0.01 numbers,
  // so the UI shows long stretches of +0.0 and the player appears stuck.
  // The fix is a real-value floor of 0.1 (or `gap`, if smaller) inside
  // `computeStaminaRecoveryDelta`, written directly to `player.physio
  // .stamina` via `applyTimeToPlayer` — strictly NOT a renderer/formatter
  // patch. SLEEP / REST must remain untouched.
  await assertCollapseStaminaFloor();
  await assertSleepNotPollutedByCollapseFloor();

  console.log("[PASS] wilderness_survival_contract_check");
}

function buildWildernessLikePlayerCtx(gs, { isSleeping }) {
  const wx =
    gs.world?.weather && typeof gs.world.weather === "object"
      ? gs.world.weather
      : {};
  const thermalEnvOverride = {};
  if (Number.isFinite(Number(wx.tEnv_region))) {
    thermalEnvOverride.tEnvRegionC = Number(wx.tEnv_region);
  }
  if (Number.isFinite(Number(wx.windSpeed_local))) {
    thermalEnvOverride.worldWindSpeed = Number(wx.windSpeed_local);
  }
  const regionCfg = getRegionConfigById(gs.world?.regionId);
  const placeProfileRaw = getPlaceProfileForMap(gs.currentMapId, gs.currentMap);
  const placeProfile =
    placeProfileRaw && typeof placeProfileRaw === "object"
      ? {
          ...placeProfileRaw,
          space: String(placeProfileRaw.space || "outdoor"),
          exposureLevel: String(placeProfileRaw.exposureLevel || "Open")
        }
      : {
          space: "outdoor",
          exposureLevel: "Open",
          windShelter: 0,
          heatSource: 0,
          drying: 0
        };
  return {
    isSleeping: !!isSleeping,
    sessionCoverage: "NONE",
    world: gs.world,
    currentMapId: gs.currentMapId,
    currentMap: gs.currentMap,
    timeView: { totalMinutes: Number(gs.time?.totalMinutes) || 0 },
    regionCfg,
    placeProfile,
    ...(Object.keys(thermalEnvOverride).length > 0 ? { thermalEnvOverride } : {})
  };
}

function seedSleepEpisode(player, mode) {
  if (!player.meta || typeof player.meta !== "object") player.meta = {};
  player.meta.sleepEpisode = {
    mode: String(mode),
    // Bypass settle-in so the very first 10–11 min tick produces a non-zero
    // effectiveSleepMin and the floor decision becomes deterministic.
    episodeSleepMin: 60,
    awakeGapMin: 0,
    fatigueRecoveredInWindow: 0,
    fatigueRecoveryWindowStartMin: 0,
    collapseEpisodeFatigueRecovered: 0
  };
}

async function assertCollapseStaminaFloor() {
  const gsCol = createDefaultGameState();
  await setupRuntime(gsCol, 0, 0);
  const p = gameState.player;
  p.physio.stamina = 19.9;
  p.physio.satiety = 80;
  p.psycho.fatigue = 80;
  p.psycho.hp = 80;
  seedSleepEpisode(p, "COLLAPSE");

  const playerCtx = buildWildernessLikePlayerCtx(gameState, { isSleeping: false });
  const staminaBefore = Number(p.physio.stamina);
  assert(staminaBefore === 19.9, "collapse-floor setup: stamina exactly 19.9");

  applyTimeToPlayer(p, 11, playerCtx);

  const staminaAfter = Number(p.physio.stamina);
  // Truth-level write: stamina lives on player.physio.stamina, not on a
  // UI/formatter shim.
  assert(
    typeof p.physio.stamina === "number" && Number.isFinite(p.physio.stamina),
    "collapse-floor: stamina is a real number on player.physio.stamina"
  );
  // Target cap (COLLAPSE recovers up to 20, never beyond):
  assert(
    staminaAfter <= 20 + 1e-6,
    `collapse-floor: stamina capped at 20 (got ${staminaAfter})`
  );
  // Real recovery floor: in one tick we must either reach >= 20 (because
  // gap < 0.1 collapses straight to target) or recover >= 0.1.
  const recovered = staminaAfter - staminaBefore;
  assert(
    staminaAfter >= 20 - 1e-6 || recovered >= 0.1 - 1e-6,
    `collapse-floor: single-tick recovery >= 0.1 floor (got recovered=${recovered}, after=${staminaAfter})`
  );
}

async function assertSleepNotPollutedByCollapseFloor() {
  const gsSleep = createDefaultGameState();
  await setupRuntime(gsSleep, 0, 0);
  const p = gameState.player;
  // Near maxStamina so the natural SLEEP curve produces a delta well below
  // 0.1 — this is the discriminating case where a leaked floor would show.
  p.physio.stamina = 99.9;
  p.physio.satiety = 80;
  p.psycho.fatigue = 80;
  p.psycho.hp = 80;
  seedSleepEpisode(p, "SLEEP");

  const playerCtx = buildWildernessLikePlayerCtx(gameState, { isSleeping: true });
  const staminaBefore = Number(p.physio.stamina);

  applyTimeToPlayer(p, 11, playerCtx);

  const staminaAfter = Number(p.physio.stamina);
  const recovered = staminaAfter - staminaBefore;
  // SLEEP must still recover naturally (some positive delta).
  assert(
    recovered > 0,
    `sleep-no-pollution: SLEEP still recovers naturally (got ${recovered})`
  );
  // And must NOT have been forced to the COLLAPSE 0.1 floor — natural delta
  // at cur=99.9, gap=0.1, k=0.65 over ~11 min sits around 0.01.
  assert(
    recovered < 0.08,
    `sleep-no-pollution: SLEEP delta below 0.08 (got ${recovered}; >= 0.08 means COLLAPSE floor leaked)`
  );
  // And remains bounded by maxStamina = 100.
  assert(
    staminaAfter <= 100 + 1e-6,
    `sleep-no-pollution: stamina capped at max (got ${staminaAfter})`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
