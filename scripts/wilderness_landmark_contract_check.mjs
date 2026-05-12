/**
 * Phase 11: landmark intercept + interior map + return to wilderness_runtime (session preserved).
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
import { getWildernessAreaSpec } from "../src/engine/wilderness/wilderness_area_registry.js";
import { resolveWildernessMovePlanReadOnly } from "../src/engine/wilderness/wilderness_movement_resolver.js";
import { listLandmarkCuesForCoordinate } from "../src/engine/wilderness/wilderness_area_query.js";
import { collectLandmarkCuesForCoordinate } from "../src/engine/wilderness/wilderness_probe_service.js";
import { sanitizeWildernessStateForSave } from "../src/engine/wilderness/wilderness_state.js";

const rngWildernessMoveNeverLost = { random: () => 0.99 };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function assert(c, m) {
  if (!c) throw new Error(m);
}

function cloneJson(v) {
  return JSON.parse(JSON.stringify(v));
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
  const areaPath = path.join(ROOT, "data", "wilderness", "areas", "west2_old_marker_patrol_line.js");
  const areaSrc = fs.readFileSync(areaPath, "utf8");
  assert(areaSrc.includes("maintenance_corridor_entry"), "area file lists maintenance_corridor_entry");

  const areaSpec = getWildernessAreaSpec("west2_old_marker_patrol_line");
  assert(!!areaSpec, "area spec");
  const lm = areaSpec.landmarks.find((x) => x && x.id === "maintenance_corridor_entry");
  assert(!!lm, "maintenance_corridor_entry landmark in areaSpec");
  const outpost = areaSpec.landmarks.find((x) => x && x.id === "west2_outpost_entry");
  assert(!!outpost, "west2_outpost_entry landmark in areaSpec");
  assert(outpost.x === -6 && outpost.y === 1, "west2_outpost_entry anchor (-6,1)");
  assert(String(outpost.gotoMapId || "") === "west2_outpost_hub", "west2_outpost_entry gotoMapId");

  const landmarkMapPath = path.join(ROOT, "data", "maps", "west2_maintenance_corridor_entry.json");
  const landmarkMapJson = JSON.parse(fs.readFileSync(landmarkMapPath, "utf8"));
  assert(validateMap(landmarkMapJson, "west2_maintenance_corridor_entry.json") === true, "landmark map validates");

  const cuesNear = listLandmarkCuesForCoordinate({ areaSpec, x: 4, y: 2 });
  assert(cuesNear.some((c) => c.id === "maintenance_corridor_entry"), "detectRadius cue near (5,2) at (4,2)");
  const probeCues = collectLandmarkCuesForCoordinate({ areaSpec, x: 4, y: 2 });
  assert(probeCues.some((c) => c.id === "maintenance_corridor_entry"), "probe landmark cue at (4,2)");
  console.log("[PASS] landmark detect cue near target cell");

  const interceptPlan = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(4, 2),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(interceptPlan.ok === true, "move (4,2) E ok");
  assert(
    interceptPlan.landmarkIntercept && interceptPlan.landmarkIntercept.gotoMapId === "west2_maintenance_corridor_entry",
    "landmarkIntercept.gotoMapId"
  );
  assert(
    interceptPlan.landmarkIntercept.at.x === 5 && interceptPlan.landmarkIntercept.at.y === 2,
    "landmarkIntercept.at anchor"
  );
  console.log("[PASS] enterRadius=0 intercept on exact cell (5,2)");

  const nearNoEnter = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(3, 2),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(nearNoEnter.ok === true, "(3,2) E ok");
  assert(!nearNoEnter.landmarkIntercept, "no intercept one cell short of landmark");
  assert(
    listLandmarkCuesForCoordinate({ areaSpec, x: 4, y: 2 }).length > 0,
    "detectRadius still cues at (4,2) without intercept requirement"
  );
  console.log("[PASS] detectRadius cue without enterRadius intercept");

  const boundary = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(8, 8),
    areaSpec,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(boundary.ok === false && boundary.blocker?.kind === "boundary_block", "boundary first");
  assert(boundary.landmarkIntercept == null, "no landmark on boundary fail");
  console.log("[PASS] priority: boundary_block before landmark_intercept");

  const areaIceLandmark = cloneJson(areaSpec);
  // Ensure the test coordinate is a hard-block terrain in all authoring variants.
  // (Do not rely on generated terrain being hard at (7,0).)
  areaIceLandmark.landmarks = [
    {
      id: "on_ice",
      label: "On ice",
      x: 7,
      y: 0,
      detectRadius: 0,
      enterRadius: 0,
      gotoMapId: "west2_maintenance_corridor_entry"
    }
  ];
  areaIceLandmark.terrainZones = [
    ...(Array.isArray(areaIceLandmark.terrainZones) ? areaIceLandmark.terrainZones : []),
    {
      id: "contract_ice_shelf_edge_spot",
      terrainId: "ice_shelf_edge",
      priority: 1000,
      shape: { type: "rect", x1: 7, y1: 0, x2: 7, y2: 0 }
    }
  ];
  const hard = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(6, 0),
    areaSpec: areaIceLandmark,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(hard.ok === false && hard.blocker?.kind === "terrain_hard_block", "terrain_hard first");
  assert(hard.landmarkIntercept == null, "no landmark on hard fail");
  console.log("[PASS] priority: terrain_hard_block before landmark_intercept");

  const areaCrevasseLandmark = cloneJson(areaSpec);
  areaCrevasseLandmark.terrainZones = [
    ...areaCrevasseLandmark.terrainZones,
    {
      id: "contract_crevasse_spot",
      terrainId: "crevasse_field",
      priority: 200,
      shape: { type: "rect", x1: 5, y1: 3, x2: 5, y2: 3 }
    }
  ];
  areaCrevasseLandmark.landmarks = [
    {
      id: "in_crevasse",
      label: "In crevasse",
      x: 5,
      y: 3,
      detectRadius: 0,
      enterRadius: 0,
      gotoMapId: "west2_maintenance_corridor_entry"
    }
  ];
  const req = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(5, 2),
    areaSpec: areaCrevasseLandmark,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(req.ok === false && req.blocker?.kind === "terrain_requirement_block", "terrain_requirement first");
  assert(req.landmarkIntercept == null, "no landmark on requirement fail");
  console.log("[PASS] priority: terrain_requirement_block before landmark_intercept");

  const lowHpNearLandmarkPlayer = {
    physio: { stamina: 100, satiety: 80, temperatureC: 36 },
    // Bug3 (round 2): stamina gates are NOT `player_state_block`; use HP below
    // MIN_HP_TO_ATTEMPT_MOVE so evaluateWildernessPlayerStateBlocker fires while
    // the east step from (4,2) would otherwise hit maintenance_corridor_entry.
    psycho: { hp: 4, fatigue: 0, hypothermia: 80, hypoStage: "Safe" }
  };
  const psBlock = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(4, 2),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000,
    player: lowHpNearLandmarkPlayer,
    requirePlayerStateCheck: true,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(psBlock.ok === false && psBlock.blocker?.kind === "player_state_block", "player_state first");
  assert(psBlock.blocker?.blockerId === "player_hp_too_low_block", "player_state is hp gate not stamina");
  assert(psBlock.landmarkIntercept == null, "no landmark on player_state fail");
  console.log("[PASS] priority: player_state_block before landmark_intercept");

  const gs = createDefaultGameState();
  await setupRuntime(gs, 4, 2);
  const beforeSlice = {
    wx: gameState.world.wilderness.x,
    wy: gameState.world.wilderness.y,
    steps: gameState.world.wilderness.stepsTaken,
    tm: gameState.time.totalMinutes,
    st: gameState.player.physio.stamina,
    active: gameState.world.wilderness.active
  };
  const movePlan = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_E",
      payload: {},
      meta: { atMs: Date.now(), source: "contract", mapId: "wilderness_runtime", wildernessMoveRngLike: rngWildernessMoveNeverLost }
    },
    gameState
  );
  validatePlan(movePlan);
  assert(movePlan.wildernessPipelineIntents?.[0]?.movementPlan?.landmarkIntercept?.gotoMapId === "west2_maintenance_corridor_entry", "plan carries intercept");
  const moveCommit = await commit(movePlan, gameState);
  assert(moveCommit.ok === true, "commit ok");
  assert(gameState.world.wilderness.x === 5 && gameState.world.wilderness.y === 2, "coords at landmark cell");
  assert(gameState.world.wilderness.stepsTaken === beforeSlice.steps + 1, "stepsTaken +1");
  assert(gameState.time.totalMinutes > beforeSlice.tm, "time advanced");
  assert(gameState.world.wilderness.active === true, "wilderness stays active");
  assert(gameState.currentMapId === "west2_maintenance_corridor_entry", "switched to interior map");
  const moveRow = moveCommit.report?.wilderness?.results?.find((r) => r.ok && r.type === "WILDERNESS_MOVE");
  assert(moveRow?.survival?.playerTimeApplied === true, "survival.playerTimeApplied");
  assert(moveRow?.landmarkIntercept?.id === "maintenance_corridor_entry", "report landmarkIntercept");
  assert(moveRow?.enteredMapId === "west2_maintenance_corridor_entry", "report enteredMapId");
  assert(moveRow?.wildernessSessionPreserved === true, "report wildernessSessionPreserved");
  assert(gameState.world.wilderness.state === "LANDMARK", "session state LANDMARK after enter");
  console.log("[PASS] commit landmark move: coords/time/survival/map switch/session preserved");

  const afterLandmark = {
    wx: gameState.world.wilderness.x,
    wy: gameState.world.wilderness.y,
    steps: gameState.world.wilderness.stepsTaken,
    tm: gameState.time.totalMinutes,
    st: gameState.player.physio.stamina
  };
  const retPlan = await resolve(
    {
      type: "MAP_ACTION",
      id: "return_to_wilderness_runtime",
      payload: {},
      meta: { atMs: Date.now(), source: "contract", mapId: "west2_maintenance_corridor_entry" }
    },
    gameState
  );
  validatePlan(retPlan);
  assert(retPlan.wildernessPipelineIntents?.[0]?.type === "WILDERNESS_RETURN_FROM_LANDMARK", "return intent");
  const retCommit = await commit(retPlan, gameState);
  assert(retCommit.ok === true, "return commit ok");
  assert(gameState.currentMapId === "wilderness_runtime", "back to runtime map");
  assert(gameState.world.wilderness.x === afterLandmark.wx && gameState.world.wilderness.y === afterLandmark.wy, "coords unchanged on return");
  assert(gameState.world.wilderness.stepsTaken === afterLandmark.steps, "steps unchanged");
  assert(gameState.time.totalMinutes === afterLandmark.tm, "time unchanged on return");
  assert(gameState.player.physio.stamina === afterLandmark.st, "stamina unchanged on return");
  assert(gameState.world.wilderness.active === true, "wilderness active after return");
  const retRow = retCommit.report?.wilderness?.results?.find((r) => r.ok && r.type === "WILDERNESS_RETURN_FROM_LANDMARK");
  assert(retRow?.return_from_landmark === true, "return_from_landmark row");
  console.log("[PASS] return action restores wilderness_runtime without time/stamina/coord drift");

  const gsInactive = createDefaultGameState();
  gsInactive.time.totalMinutes = 9000;
  const lmMap = await loadMap("west2_maintenance_corridor_entry");
  assert(!!lmMap, "landmark map loads");
  gsInactive.world.wilderness = { ...activeWest2Session(5, 2), active: false };
  gsInactive.currentMapId = "west2_maintenance_corridor_entry";
  gsInactive.world.currentMapId = "west2_maintenance_corridor_entry";
  gsInactive.currentMap = lmMap;
  replaceGameState(gsInactive);
  const badRet = await resolve(
    {
      type: "MAP_ACTION",
      id: "return_to_wilderness_runtime",
      payload: {},
      meta: { atMs: Date.now(), source: "contract", mapId: "west2_maintenance_corridor_entry" }
    },
    gameState
  );
  assert(!!badRet.rejection, "inactive wilderness rejects return resolve");
  assert(gameState.currentMapId === "west2_maintenance_corridor_entry", "no map jump on reject");
  console.log("[PASS] inactive wilderness: return resolve rejects, no navigation");

  const wx = gameState.world.wilderness;
  const sanitized = sanitizeWildernessStateForSave(wx);
  assert(sanitized.x === wx.x && sanitized.y === wx.y, "sanitize preserves wilderness coords");
  console.log("[PASS] sanitizeWildernessStateForSave keeps coordinates");

  console.log("[PASS] wilderness_landmark_contract_check complete");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
