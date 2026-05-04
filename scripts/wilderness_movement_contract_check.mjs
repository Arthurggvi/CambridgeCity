/**
 * Phase 5: wilderness eight-direction movement — cost, resolver, resolve/commit wiring, map_validate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDefaultGameState, gameState, replaceGameState } from "../src/engine/state.js";
import { loadMap } from "../src/engine/loader.js";
import { resolve } from "../src/engine/pipeline/resolve.js";
import { commit } from "../src/engine/pipeline/commit.js";
import { validatePlan } from "../src/engine/pipeline/plan_types.js";
import { validateMap } from "../src/engine/validate/map_validate.js";
import {
  getWildernessDirectionDelta,
  WILDERNESS_MOVE_DIRECTIONS
} from "../src/engine/wilderness/wilderness_movement_cost.js";
import { resolveWildernessMovePlanReadOnly } from "../src/engine/wilderness/wilderness_movement_resolver.js";
import { getWildernessAreaSpec } from "../src/engine/wilderness/wilderness_area_registry.js";
import { collectWildernessMoveBlockedNoticeDialogs } from "../src/engine/wilderness/wilderness_blocker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function snapWildernessMoveSlice(gs) {
  return {
    wx: gs?.world?.wilderness?.x,
    wy: gs?.world?.wilderness?.y,
    heading: gs?.world?.wilderness?.heading,
    stepsTaken: gs?.world?.wilderness?.stepsTaken,
    totalMinutes: gs?.time?.totalMinutes,
    stamina: gs?.player?.physio?.stamina,
    hp: gs?.player?.psycho?.hp,
    fatigue: gs?.player?.psycho?.fatigue,
    satiety: gs?.player?.physio?.satiety,
    temperatureC: gs?.player?.physio?.temperatureC,
    hypothermia: gs?.player?.psycho?.hypothermia,
    hypoStage: gs?.player?.psycho?.hypoStage,
    weatherJson: JSON.stringify(gs?.world?.weather ?? null)
  };
}

function wrBaseJson() {
  const moves = WILDERNESS_MOVE_DIRECTIONS.map((dir) => ({
    id: `wilderness_move_${dir}`,
    text: "m",
    kind: "WILDERNESS_MOVE",
    wilderness: { direction: dir }
  }));
  return {
    id: "wilderness_runtime",
    name: "n",
    mapType: "wilderness_runtime",
    description: "d",
    actions: [
      ...moves,
      { id: "wilderness_end_return_fallback", text: "e", kind: "WILDERNESS_END_SESSION" }
    ]
  };
}

function activeWest2Session(x, y, extra = {}) {
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
    schemaVersion: 1,
    ...extra
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

async function main() {
  const dE = getWildernessDirectionDelta("E");
  const dN = getWildernessDirectionDelta("N");
  const dSW = getWildernessDirectionDelta("SW");
  assert(dE.x === 1 && dE.y === 0, "delta E");
  assert(dN.x === 0 && dN.y === 1, "delta N");
  assert(dSW.x === -1 && dSW.y === -1, "delta SW");
  console.log("[PASS] direction deltas");

  const areaSpec = getWildernessAreaSpec("west2_old_marker_patrol_line");
  assert(!!areaSpec, "area spec");

  const inactive = resolveWildernessMovePlanReadOnly({
    wilderness: { active: false, x: 0, y: 0 },
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000
  });
  assert(inactive.ok === false, "inactive session move plan not ok");
  console.log("[PASS] resolver rejects inactive session");

  const ok00 = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(0, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000
  });
  assert(ok00.ok === true, "(0,0) E ok");
  assert(ok00.to.x === 1 && ok00.to.y === 0, "(0,0) E target coord");
  assert(typeof ok00.terrainId === "string" && ok00.terrainId.length > 0, "(0,0) E terrainId");
  console.log("[PASS] resolver (0,0) east success");

  const iceBlock = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(6, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000
  });
  assert(iceBlock.ok === false && iceBlock.blocker?.kind === "terrain_hard_block", "ice shelf edge block");
  assert(String(iceBlock.terrainId || "") === "ice_shelf_edge", "blocked terrain id");
  console.log("[PASS] resolver ice_shelf_edge hard block");

  const boundary = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(8, 8),
    areaSpec,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 9000
  });
  assert(boundary.ok === false && boundary.blocker?.kind === "boundary_block", "boundary block");
  console.log("[PASS] resolver boundary block");

  const wrPath = path.join(ROOT, "data", "maps", "wilderness_runtime.json");
  const authoring = JSON.parse(fs.readFileSync(wrPath, "utf8"));
  assert(validateMap(authoring, "wilderness_runtime.json") === true, "disk wilderness_runtime validates");
  assert(validateMap(wrBaseJson(), "wilderness_runtime.json") === true, "synthetic wr base validates");
  const base = wrBaseJson();
  assert(
    validateMap(
      { ...base, actions: base.actions.filter((a) => a.kind !== "WILDERNESS_END_SESSION") },
      "wilderness_runtime_missing_end.json"
    ) === false,
    "map_validate rejects missing end"
  );
  console.log("[PASS] map_validate wilderness_runtime samples");

  const gs0 = createDefaultGameState();
  await setupRuntime(gs0, 0, 0);
  const beforeJson = JSON.stringify(gameState);
  const movePlan = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_E",
      payload: {},
      meta: { atMs: Date.now(), source: "contract", mapId: "wilderness_runtime" }
    },
    gameState
  );
  validatePlan(movePlan);
  assert(JSON.stringify(gameState) === beforeJson, "resolve MAP_ACTION WILDERNESS_MOVE must not mutate gameState");
  assert(
    Array.isArray(movePlan.wildernessPipelineIntents) && movePlan.wildernessPipelineIntents.length === 1,
    "one wilderness intent"
  );
  assert(movePlan.wildernessPipelineIntents[0].type === "WILDERNESS_MOVE", "intent type");
  assert(movePlan.wildernessPipelineIntents[0].movementPlan?.ok === true, "movement plan ok");
  console.log("[PASS] resolve queues WILDERNESS_MOVE without mutating state");

  const b0 = snapWildernessMoveSlice(gameState);
  const moveCommit = await commit(movePlan, gameState);
  assert(moveCommit.ok === true, "commit ok");
  const b1 = snapWildernessMoveSlice(gameState);
  assert(b1.wx === 1 && b1.wy === 0, "position after move");
  assert(b1.heading === "E", "heading after move");
  assert(b1.stepsTaken === 1, "stepsTaken increment");
  const mp0 = movePlan.wildernessPipelineIntents[0].movementPlan;
  assert(b1.totalMinutes === b0.totalMinutes + mp0.minutes, "time advanced by plan minutes");
  const okRow = moveCommit.report?.wilderness?.results?.find((r) => r.ok && r.type === "WILDERNESS_MOVE");
  const surv = okRow?.survival;
  assert(surv?.playerTimeApplied === true, "survival.playerTimeApplied");
  assert(surv.advancedMinutes === mp0.minutes, "survival.advancedMinutes matches plan");
  assert(surv.before.stamina === b0.stamina && surv.after.stamina === b1.stamina, "survival stamina snapshots match state");
  assert(Number.isFinite(b1.stamina) && b1.stamina >= 0, "stamina non-negative");
  assert(b1.weatherJson === b0.weatherJson, "world.weather unchanged (json)");
  const wrResOk = moveCommit.report?.wilderness?.results;
  assert(Array.isArray(wrResOk) && wrResOk.some((r) => r.ok && r.type === "WILDERNESS_MOVE"), "report success row");
  console.log("[PASS] commit successful move updates coords time stamina survival report");

  const gsBlock = createDefaultGameState();
  await setupRuntime(gsBlock, 6, 0);
  const snapB = snapWildernessMoveSlice(gameState);
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
  assert(blockPlan.wildernessPipelineIntents[0].movementPlan?.ok === false, "blocked plan queued");
  const blockCommit = await commit(blockPlan, gameState);
  assert(blockCommit.ok === true, "blocked commit still ok pipeline");
  const snapA = snapWildernessMoveSlice(gameState);
  assert(snapA.wx === snapB.wx && snapA.wy === snapB.wy, "blocked: coords unchanged");
  assert(String(snapA.heading || "") === String(snapB.heading || ""), "blocked: heading unchanged");
  assert(snapA.stepsTaken === snapB.stepsTaken, "blocked: stepsTaken unchanged");
  assert(snapA.totalMinutes === snapB.totalMinutes, "blocked: time unchanged");
  assert(snapA.stamina === snapB.stamina, "blocked: stamina unchanged");
  assert(snapA.satiety === snapB.satiety && snapA.fatigue === snapB.fatigue, "blocked: satiety/fatigue unchanged");
  assert(
    snapA.temperatureC === snapB.temperatureC &&
      snapA.hypothermia === snapB.hypothermia &&
      snapA.hypoStage === snapB.hypoStage &&
      snapA.hp === snapB.hp,
    "blocked: thermal/hp unchanged"
  );
  const blockRow = blockCommit.report?.wilderness?.results?.find((r) => r.type === "WILDERNESS_MOVE" && r.ok === false);
  assert(blockRow && blockRow.survival == null && blockRow.playerTimeApplied !== true, "blocked row has no survival / playerTimeApplied");
  const wrResBlock = blockCommit.report?.wilderness?.results;
  assert(
    Array.isArray(wrResBlock) && wrResBlock.some((r) => r.type === "WILDERNESS_MOVE" && r.ok === false && r.blocker?.notice),
    "report blocked row has unified blocker notice"
  );
  const dlg = collectWildernessMoveBlockedNoticeDialogs(blockCommit.report);
  assert(dlg.length >= 1 && dlg[0].actions[0]?.id === "stay", "notice adapter yields stay action");
  console.log("[PASS] commit blocked move leaves state and report");

  console.log("[PASS] wilderness_movement_contract_check");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
