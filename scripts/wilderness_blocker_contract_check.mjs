/**
 * Phase 6: unified wilderness blocker payload + commit report + notice adapter extraction.
 */
import { createDefaultGameState, gameState, replaceGameState } from "../src/engine/state.js";
import { loadMap } from "../src/engine/loader.js";
import { resolve } from "../src/engine/pipeline/resolve.js";
import { commit } from "../src/engine/pipeline/commit.js";
import { validatePlan } from "../src/engine/pipeline/plan_types.js";
import {
  WILDERNESS_BLOCKER_KINDS,
  normalizeWildernessBlocker,
  createBoundaryWildernessBlocker,
  createTerrainHardWildernessBlocker,
  createTerrainRequirementWildernessBlocker,
  isWildernessBlocker,
  collectWildernessMoveBlockedNoticeDialogs
} from "../src/engine/wilderness/wilderness_blocker.js";
import { resolveWildernessMovePlanReadOnly } from "../src/engine/wilderness/wilderness_movement_resolver.js";
import { getWildernessAreaSpec } from "../src/engine/wilderness/wilderness_area_registry.js";

const rngWildernessMoveNeverLost = { random: () => 0.99 };

function assert(c, m) {
  if (!c) throw new Error(m);
}

function noFunctions(v, path = "v") {
  if (typeof v === "function") throw new Error(`function at ${path}`);
  if (v != null && typeof v === "object") {
    if (Array.isArray(v)) v.forEach((x, i) => noFunctions(x, `${path}[${i}]`));
    else for (const k of Object.keys(v)) noFunctions(v[k], `${path}.${k}`);
  }
}

function activeSession(x, y) {
  return {
    active: true,
    regionId: "West2",
    areaId: "west2_old_marker_patrol_line",
    originMapId: "x",
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

async function setupRuntime(wx, wy) {
  const gs = createDefaultGameState();
  gs.time.totalMinutes = 12000;
  gs.world.wilderness = activeSession(wx, wy);
  const wrMap = await loadMap("wilderness_runtime");
  assert(!!wrMap, "wilderness_runtime loads");
  gs.currentMapId = "wilderness_runtime";
  gs.world.currentMapId = "wilderness_runtime";
  gs.currentMap = wrMap;
  replaceGameState(gs);
}

async function main() {
  assert(Array.isArray(WILDERNESS_BLOCKER_KINDS) && WILDERNESS_BLOCKER_KINDS.includes("boundary_block"), "kinds enum");

  const nb = normalizeWildernessBlocker(
    { kind: "boundary_block", blockerId: "wilderness_boundary_block", title: "T", message: "M", terrainId: null },
    { areaId: "a", regionId: "r", at: { x: 3, y: 4 } }
  );
  noFunctions(nb);
  JSON.parse(JSON.stringify(nb));
  assert(isWildernessBlocker(nb), "isWildernessBlocker normalized");
  console.log("[PASS] normalizeWildernessBlocker plain object");

  const bnd = createBoundaryWildernessBlocker({
    areaId: "west2_old_marker_patrol_line",
    regionId: "West2",
    at: { x: 9, y: 0 }
  });
  assert(bnd.kind === "boundary_block" && bnd.blockerId === "wilderness_boundary_block", "boundary kind/id");
  assert(bnd.at.x === 9 && bnd.at.y === 0, "boundary at target cell");
  assert(bnd.notice.title === bnd.title && bnd.notice.message === bnd.message, "boundary notice mirrors");
  assert(bnd.notice.actions[0].id === "stay", "boundary stay action");
  console.log("[PASS] boundary_block payload fields");

  const ice = createTerrainHardWildernessBlocker({
    areaId: "west2_old_marker_patrol_line",
    regionId: "West2",
    terrainId: "ice_shelf_edge",
    at: { x: 7, y: 0 }
  });
  assert(ice.kind === "terrain_hard_block" && ice.blockerId === "ice_shelf_edge_hard_block", "ice hard id");
  assert(ice.terrainId === "ice_shelf_edge", "ice terrainId");
  assert(ice.notice.actions[0].id === "stay", "ice notice stay");
  console.log("[PASS] ice_shelf_edge terrain_hard_block payload");

  const sea = createTerrainHardWildernessBlocker({
    areaId: "west2_old_marker_patrol_line",
    regionId: "West2",
    terrainId: "open_water",
    at: { x: 12, y: 0 }
  });
  assert(sea.kind === "terrain_hard_block", "open_water hard kind");
  assert(sea.terrainId === "open_water", "open_water terrainId");
  console.log("[PASS] open_water terrain_hard_block payload");

  const crev = createTerrainRequirementWildernessBlocker({
    areaId: "west2_old_marker_patrol_line",
    regionId: "West2",
    terrainId: "crevasse_field",
    at: { x: 1, y: 1 }
  });
  assert(crev.kind === "terrain_requirement_block" && crev.blockerId === "crevasse_field_requirement_block", "crevasse req");
  assert(crev.title === "前方是裂隙带", "crevasse title");
  assert(crev.notice.message.includes("探杆"), "crevasse message");
  console.log("[PASS] crevasse_field terrain_requirement_block payload");

  const areaSpec = getWildernessAreaSpec("west2_old_marker_patrol_line");
  const bound = resolveWildernessMovePlanReadOnly({
    wilderness: activeSession(8, 8),
    areaSpec,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 0,
    requirePlayerStateCheck: false,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(bound.ok === false && bound.blocker.kind === "boundary_block", "resolver boundary");
  assert(bound.blocker.at.x === 8 && bound.blocker.at.y === 9, "boundary blocker.at is target cell");
  console.log("[PASS] resolver boundary_block");

  // (7,0) -> E -> (8,0) lands on `tide_crack_zone` (hard_block) in the current
  // west2 blueprint. Use the stable coord rather than the post-regen invalid
  // (6,0)->E ice_shelf_edge step.
  const hardR = resolveWildernessMovePlanReadOnly({
    wilderness: activeSession(7, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 0,
    requirePlayerStateCheck: false,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(
    hardR.ok === false && hardR.blocker.kind === "terrain_hard_block",
    "resolver tide_crack_zone hard"
  );
  assert(String(hardR.blocker.terrainId || "") === "tide_crack_zone", "resolver hard terrainId");
  console.log("[PASS] resolver tide_crack_zone terrain_hard_block");

  // Synthesize an open_water zone via spec override (mirrors the crevasse
  // fixture below) so we can assert sea hard-blocking without authoring data.
  const w2sea = getWildernessAreaSpec("west2_old_marker_patrol_line");
  const seaZones = Array.from(w2sea.terrainZones || []);
  seaZones.push({
    id: "contract_sea_cell",
    terrainId: "open_water",
    priority: 999,
    shape: { type: "rect", x1: 3, y1: 3, x2: 3, y2: 3 }
  });
  const specSea = { ...w2sea, terrainZones: seaZones };
  const seaR = resolveWildernessMovePlanReadOnly({
    wilderness: activeSession(3, 2),
    areaSpec: specSea,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 0,
    requirePlayerStateCheck: false,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(seaR.ok === false && seaR.blocker.kind === "terrain_hard_block", "resolver sea hard");
  assert(String(seaR.blocker.terrainId || "") === "open_water", "resolver sea terrainId");
  console.log("[PASS] resolver open_water terrain_hard_block");

  // After the activeCellKeys decoupling, an in-bounds-but-out-of-mask target
  // must NOT yield a boundary_block. (6,7) is in mask; (6,8) is bounds-in but
  // outside the authored mask.
  const offMask = resolveWildernessMovePlanReadOnly({
    wilderness: activeSession(6, 7),
    areaSpec,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 0,
    requirePlayerStateCheck: false,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(offMask.ok === true, "active-mask-out cell passable");
  assert(offMask.to.x === 6 && offMask.to.y === 8, "active-mask-out target coord");
  console.log("[PASS] resolver allows active-mask-out cells inside bounds");

  const w2 = getWildernessAreaSpec("west2_old_marker_patrol_line");
  const zones = Array.from(w2.terrainZones || []);
  // Use a very high priority so we override whatever the regenerated west2
  // blueprint currently authors at (2,2) (it ships a wind_packed_snow zone
  // with priority 100 there).
  zones.push({
    id: "contract_crevasse_cell",
    terrainId: "crevasse_field",
    priority: 9999,
    shape: { type: "rect", x1: 2, y1: 2, x2: 2, y2: 2 }
  });
  const specCrev = { ...w2, terrainZones: zones };
  const cr = resolveWildernessMovePlanReadOnly({
    wilderness: activeSession(2, 1),
    areaSpec: specCrev,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 0,
    requirePlayerStateCheck: false,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(cr.ok === false && cr.blocker.kind === "terrain_requirement_block", "resolver crevasse requirement");
  assert(cr.to.x === 2 && cr.to.y === 2, "crevasse target coord");
  console.log("[PASS] resolver crevasse_field terrain_requirement_block");

  // Match the resolver-level hard-block check above: place player at (7,0) so
  // E targets (8,0) tide_crack_zone.
  await setupRuntime(7, 0);
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
  const snap = () => ({
    x: gameState.world.wilderness.x,
    y: gameState.world.wilderness.y,
    heading: gameState.world.wilderness.heading,
    steps: gameState.world.wilderness.stepsTaken,
    t: gameState.time.totalMinutes,
    st: gameState.player.physio.stamina,
    satiety: gameState.player.physio.satiety,
    fatigue: gameState.player.psycho.fatigue,
    temperatureC: gameState.player.physio.temperatureC,
    hypothermia: gameState.player.psycho.hypothermia,
    hypoStage: gameState.player.psycho.hypoStage,
    hp: gameState.player.psycho.hp
  });
  const before = snap();
  const res = await commit(plan, gameState);
  assert(res.ok === true, "commit ok");
  const after = snap();
  assert(after.x === before.x && after.y === before.y, "blocked coords");
  assert(after.heading === before.heading && after.steps === before.steps, "blocked heading steps");
  assert(after.t === before.t && after.st === before.st, "blocked time stamina");
  assert(
    after.satiety === before.satiety &&
      after.fatigue === before.fatigue &&
      after.temperatureC === before.temperatureC &&
      after.hypothermia === before.hypothermia &&
      after.hypoStage === before.hypoStage &&
      after.hp === before.hp,
    "blocked vitals unchanged"
  );
  const row = res.report?.wilderness?.results?.[0];
  assert(row?.type === "WILDERNESS_MOVE" && row.ok === false, "blocked row shape");
  assert(row.survival == null && row.playerTimeApplied !== true, "blocked row no survival");
  assert(row.blocker?.notice?.title && row.blocker?.notice?.message, "blocked notice");
  const dlg = collectWildernessMoveBlockedNoticeDialogs(res.report);
  assert(dlg.length === 1 && dlg[0].message === row.blocker.notice.message, "collect notice adapter");
  console.log("[PASS] commit blocked + notice extract");

  console.log("[PASS] wilderness_blocker_contract_check");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
