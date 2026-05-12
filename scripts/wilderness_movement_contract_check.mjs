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
  calculateWildernessStaminaCost,
  calculateWildernessStepMeters,
  calculateWildernessStepMinutes,
  getWildernessDirectionDelta,
  getWildernessDirectionDistanceMultiplier,
  WILDERNESS_MOVE_DIRECTIONS
} from "../src/engine/wilderness/wilderness_movement_cost.js";
import { TERRAIN_BIOME_DEFS } from "../data/wilderness/terrain/wilderness_terrain_defs.js";
import { resolveWildernessMovePlanReadOnly } from "../src/engine/wilderness/wilderness_movement_resolver.js";
import { getWildernessAreaSpec } from "../src/engine/wilderness/wilderness_area_registry.js";
import { collectWildernessMoveBlockedNoticeDialogs } from "../src/engine/wilderness/wilderness_blocker.js";
import { buildWildernessViewModel } from "../src/engine/wilderness/wilderness_view_model.js";
import { resolveWildernessLostMoveDirection } from "../src/engine/wilderness/wilderness_lost_move.js";
import { oppositeWildernessMoveDirection } from "../src/engine/wilderness/wilderness_state.js";
import {
  getTransientIntentsFromCommitReport,
  buildWildernessLostToastPayloadsFromReport
} from "../src/engine/pipeline/transient_intent_adapter.js";
import { DATA_DELTA_TOAST_TRANSIENT_TYPE } from "../src/ui/toast.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const rngNeverLost = { random: () => 0.99 };

function mapActionContractMeta(overrides = {}) {
  return {
    atMs: Date.now(),
    source: "contract",
    mapId: "wilderness_runtime",
    wildernessMoveRngLike: rngNeverLost,
    ...overrides
  };
}

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

  // Bug4 (round 1, movement cost): direction distance multiplier — cardinal
  // moves are 1, diagonals are √2. The pure helper feeds time/stamina/
  // stepMeters and must stay branch-free + bounded.
  for (const dir of ["N", "E", "S", "W"]) {
    assert(getWildernessDirectionDistanceMultiplier(dir) === 1, `distanceMult ${dir} === 1`);
  }
  for (const dir of ["NE", "SE", "SW", "NW"]) {
    assert(getWildernessDirectionDistanceMultiplier(dir) === Math.SQRT2, `distanceMult ${dir} === √2`);
  }
  for (const bad of ["", "  ", "north", "ne", null, undefined, 7, {}]) {
    assert(getWildernessDirectionDistanceMultiplier(bad) === 1, `distanceMult bad input '${String(bad)}' falls back to 1`);
  }
  console.log("[PASS] direction distance multiplier (1 / √2 / safe fallback)");

  // metersPerCell = 150 in west2_old_marker_patrol_line. stepMeters is a
  // plan/report-only readout — truth coords stay integer (x,y).
  const synthArea = { step: { metersPerCell: 150, baseMinutes: 10, baseStaminaCost: 5 } };
  assert(calculateWildernessStepMeters({ areaSpec: synthArea, direction: "N" }) === 150, "stepMeters N === 150");
  assert(calculateWildernessStepMeters({ areaSpec: synthArea, direction: "E" }) === 150, "stepMeters E === 150");
  const stepMetersNE = calculateWildernessStepMeters({ areaSpec: synthArea, direction: "NE" });
  assert(Math.abs(stepMetersNE - 150 * Math.SQRT2) < 1e-9, "stepMeters NE === 150·√2");
  assert(Math.abs(stepMetersNE - 212.132) < 0.01, "stepMeters NE ≈ 212.132");
  console.log("[PASS] stepMeters cardinal/diagonal readouts");

  // Terrain cost contracts: baseMinutes=10, baseStaminaCost=5 (west2). Surface
  // runtime omitted so the test stays deterministic (no weather coupling).
  const flag = TERRAIN_BIOME_DEFS.flagged_marker_line;
  const wpSnow = TERRAIN_BIOME_DEFS.wind_packed_snow;
  const drift = TERRAIN_BIOME_DEFS.snow_drift_zone;
  // flagged_marker_line: moveTimeMult=1.00, staminaCostMult=1.00
  assert(calculateWildernessStepMinutes({ areaSpec: synthArea, terrainDef: flag, direction: "N" }) === 10, "flag N minutes=10");
  assert(calculateWildernessStaminaCost({ areaSpec: synthArea, terrainDef: flag, direction: "N" }) === 5, "flag N stamina=5");
  assert(calculateWildernessStepMinutes({ areaSpec: synthArea, terrainDef: flag, direction: "NE" }) === 14, "flag NE minutes=round(10·√2)=14");
  assert(calculateWildernessStaminaCost({ areaSpec: synthArea, terrainDef: flag, direction: "NE" }) === 7, "flag NE stamina=round(5·√2)=7");
  // wind_packed_snow: moveTimeMult=1.15, staminaCostMult=1.15
  assert(calculateWildernessStepMinutes({ areaSpec: synthArea, terrainDef: wpSnow, direction: "N" }) === 12, "wind_packed N minutes=round(10·1.15)=12");
  assert(calculateWildernessStepMinutes({ areaSpec: synthArea, terrainDef: wpSnow, direction: "NE" }) === 16, "wind_packed NE minutes=round(10·1.15·√2)=16");
  // snow_drift_zone: moveTimeMult=2.20, staminaCostMult=2.60
  assert(calculateWildernessStepMinutes({ areaSpec: synthArea, terrainDef: drift, direction: "N" }) === 22, "drift N minutes=round(10·2.2)=22");
  assert(calculateWildernessStaminaCost({ areaSpec: synthArea, terrainDef: drift, direction: "N" }) === 13, "drift N stamina=round(5·2.6)=13");
  assert(calculateWildernessStepMinutes({ areaSpec: synthArea, terrainDef: drift, direction: "NE" }) === 31, "drift NE minutes=round(10·2.2·√2)=31");
  assert(calculateWildernessStaminaCost({ areaSpec: synthArea, terrainDef: drift, direction: "NE" }) === 18, "drift NE stamina=round(5·2.6·√2)=18");
  // Hard-block terrains keep Infinity in both axes, regardless of direction.
  for (const tid of ["ice_shelf_edge", "ice_cliff_coast", "tide_crack_zone", "open_water", "coastal_open_water"]) {
    const td = TERRAIN_BIOME_DEFS[tid];
    assert(td, `terrain ${tid} exists`);
    assert(String(td.passability.foot) === "hard_block", `${tid} foot === hard_block`);
    assert(td.move.moveTimeMult === Infinity, `${tid} moveTimeMult === Infinity`);
    assert(td.move.staminaCostMult === Infinity, `${tid} staminaCostMult === Infinity`);
    assert(td.move.vehicleTimeMult === Infinity, `${tid} vehicleTimeMult === Infinity`);
    for (const dir of ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]) {
      assert(
        calculateWildernessStepMinutes({ areaSpec: synthArea, terrainDef: td, direction: dir }) === Infinity,
        `${tid} ${dir} minutes stay Infinity`
      );
      assert(
        calculateWildernessStaminaCost({ areaSpec: synthArea, terrainDef: td, direction: dir }) === Infinity,
        `${tid} ${dir} stamina stays Infinity`
      );
    }
  }
  console.log("[PASS] terrain cost calibration (flag/wp/drift cardinal+diagonal, hard_block ∞)");

  const areaSpec = getWildernessAreaSpec("west2_old_marker_patrol_line");
  assert(!!areaSpec, "area spec");

  const inactive = resolveWildernessMovePlanReadOnly({
    wilderness: { active: false, x: 0, y: 0 },
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: rngNeverLost
  });
  assert(inactive.ok === false, "inactive session move plan not ok");
  console.log("[PASS] resolver rejects inactive session");

  const ok00 = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(0, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: rngNeverLost
  });
  assert(ok00.ok === true, "(0,0) E ok");
  assert(ok00.to.x === 1 && ok00.to.y === 0, "(0,0) E target coord");
  assert(typeof ok00.terrainId === "string" && ok00.terrainId.length > 0, "(0,0) E terrainId");
  // Plan now carries distanceMult + stepMeters readouts. Cardinal E ⇒ 1 / 150.
  assert(ok00.distanceMult === 1, "(0,0) E plan distanceMult === 1");
  assert(ok00.stepMeters === 150, "(0,0) E plan stepMeters === 150 (metersPerCell)");
  console.log("[PASS] resolver (0,0) east success");

  // Diagonal NE plan: distanceMult = √2, stepMeters = 150·√2 ≈ 212.132.
  const ok00NE = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(0, 0),
    areaSpec,
    direction: "NE",
    actionId: "wilderness_move_NE",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: rngNeverLost
  });
  assert(ok00NE.ok === true, "(0,0) NE ok");
  assert(ok00NE.to.x === 1 && ok00NE.to.y === 1, "(0,0) NE target coord");
  assert(ok00NE.distanceMult === Math.SQRT2, "(0,0) NE plan distanceMult === √2");
  assert(Math.abs(ok00NE.stepMeters - 150 * Math.SQRT2) < 1e-9, "(0,0) NE plan stepMeters === 150·√2");
  // The diagonal plan must consume strictly more time than the cardinal
  // counterpart on the same terrain at the same surface conditions.
  if (ok00.terrainId === ok00NE.terrainId && Number.isFinite(ok00.minutes) && Number.isFinite(ok00NE.minutes)) {
    assert(ok00NE.minutes >= ok00.minutes, "(0,0) NE minutes ≥ E minutes (same terrain class)");
  }
  console.log("[PASS] resolver (0,0) NE diagonal plan carries √2 distance readouts");

  // (7,0) → E → (8,0) is `tide_crack_zone` (passability.foot:"hard_block") in the
  // current west2 blueprint. Use this stable hard-block coord since the legacy
  // (6,0)→E ice_shelf_edge step became `ice_shelf_surface` after a regen.
  const hardBlock = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(7, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: rngNeverLost
  });
  assert(hardBlock.ok === false && hardBlock.blocker?.kind === "terrain_hard_block", "hard_block at (8,0)");
  assert(String(hardBlock.terrainId || "") === "tide_crack_zone", "blocked terrain id is tide_crack_zone");
  console.log("[PASS] resolver tide_crack_zone hard block");

  // Confirm the previous "patrol-line cage" is gone: an in-bounds cell that
  // sits outside the optional activeCellKeys mask must NOT yield a boundary
  // blocker. (6,8) is inside bounds (-8..11, -8..8) but the mask only lists
  // up to (3,8) in that row, so before the refactor it tripped boundary_block.
  const off1 = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(6, 7),
    areaSpec,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: rngNeverLost
  });
  assert(off1.ok === true, "active-mask-out but bounds-in cell is now passable");
  assert(off1.to.x === 6 && off1.to.y === 8, "active-mask-out target coord");
  assert(typeof off1.terrainId === "string" && off1.terrainId.length > 0, "active-mask-out has terrain");
  assert(Number.isFinite(off1.minutes) && off1.minutes > 0, "active-mask-out has finite minutes");
  console.log("[PASS] resolver allows active-mask-out cells inside bounds");

  // True bounds-out at the same column still yields boundary_block. From
  // (6,8), going N would target (6,9) which is past maxY=8.
  const trueBoundary = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(6, 8),
    areaSpec,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: rngNeverLost
  });
  assert(trueBoundary.ok === false && trueBoundary.blocker?.kind === "boundary_block", "true bounds-out still boundary");
  console.log("[PASS] resolver boundary_block for bounds-out target");

  const boundary = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(8, 8),
    areaSpec,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: rngNeverLost
  });
  assert(boundary.ok === false && boundary.blocker?.kind === "boundary_block", "boundary block");
  console.log("[PASS] resolver boundary block");

  // --- Wilderness lost-move (迷路): pure roll + plan + commit-report + toast adapter ---
  const lostMissPlan = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(0, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: rngNeverLost
  });
  assert(lostMissPlan.lostMove?.lost === false, "lost miss: lost === false");
  assert(lostMissPlan.intendedDirection === "E" && lostMissPlan.actualDirection === "E", "lost miss: directions");
  assert(lostMissPlan.direction === "E", "lost miss: plan.direction is actual");
  assert(lostMissPlan.to.x === 1 && lostMissPlan.to.y === 0, "lost miss: to matches intended E");

  let lostHitRngN = 0;
  const lostHitPlan = resolveWildernessMovePlanReadOnly({
    wilderness: activeWest2Session(0, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: { random() { lostHitRngN += 1; return lostHitRngN === 1 ? 0 : 0; } }
  });
  assert(lostHitPlan.lostMove?.lost === true, "lost hit: lost === true");
  assert(lostHitPlan.intendedDirection === "E", "lost hit: intended E");
  assert(lostHitPlan.actualDirection !== "E", "lost hit: actual !== intended");
  assert(lostHitPlan.direction === lostHitPlan.actualDirection, "plan.direction === actualDirection");
  assert(
    lostHitPlan.lostMove.baseChance === 0.1 && lostHitPlan.lostMove.modifierAdditive === 0 && lostHitPlan.lostMove.finalChance === 0.1,
    "lostMove chance fields"
  );
  const expDelta = getWildernessDirectionDelta(lostHitPlan.actualDirection);
  assert(lostHitPlan.to.x === 0 + expDelta.x && lostHitPlan.to.y === 0 + expDelta.y, "lost hit: to matches actualDirection delta");

  const pureLost = resolveWildernessLostMoveDirection({
    intendedDirection: "E",
    rngLike: rngNeverLost,
    lostChanceBase: 0.1,
    lostChanceModifierAdditive: 0,
    allowedDirections: [...WILDERNESS_MOVE_DIRECTIONS]
  });
  assert(pureLost.lost === false && pureLost.actualDirection === "E", "pure lost helper: high roll");

  const lostPureHit = resolveWildernessLostMoveDirection({
    intendedDirection: "E",
    rngLike: { _i: 0, random() { this._i += 1; return this._i === 1 ? 0 : 0; } },
    lostChanceBase: 0.1,
    lostChanceModifierAdditive: 0,
    allowedDirections: [...WILDERNESS_MOVE_DIRECTIONS]
  });
  assert(lostPureHit.lost === true && lostPureHit.actualDirection === "N", "pure lost helper: low rolls -> first alt N");

  const fakeLostReport = {
    before: { time: 1, criticalMode: "NORMAL", dossierNeedsAttention: false },
    after: { time: 1, criticalMode: "NORMAL", dossierNeedsAttention: false },
    records: { results: [] },
    wilderness: {
      results: [{
        ok: true,
        type: "WILDERNESS_MOVE",
        lostMove: {
          lost: true,
          roll: 0,
          baseChance: 0.1,
          modifierAdditive: 0,
          finalChance: 0.1,
          intendedDirection: "E",
          actualDirection: "N"
        }
      }]
    }
  };
  const builtLost = buildWildernessLostToastPayloadsFromReport(fakeLostReport);
  assert(builtLost.length === 1 && builtLost[0].payload.variant === "wilderness-lost", "buildWildernessLostToastPayloadsFromReport");
  assert(builtLost[0].payload.icon === "warning" && builtLost[0].payload.lines.join("") === "你似乎偏离了行进方向", "lost toast payload lines + icon");

  const toastIntents = getTransientIntentsFromCommitReport(fakeLostReport);
  const lostToastIntent = toastIntents.find((it) => it.type === DATA_DELTA_TOAST_TRANSIENT_TYPE
    && it.payload?.semanticType === "wilderness_lost_direction");
  assert(lostToastIntent, "commit-report -> transient: wilderness_lost toast intent");
  const lineJoin = (lostToastIntent.payload.lines || []).map((l) => (l && typeof l === "object" ? l.text : String(l || ""))).join("|");
  assert(lineJoin.includes("你似乎偏离了行进方向"), "toast intent line text");

  const rendererSrc = fs.readFileSync(path.join(ROOT, "src", "engine", "renderer.js"), "utf8");
  assert(!rendererSrc.includes("你似乎偏离了行进方向"), "renderer must not embed lost toast copy");
  assert(!rendererSrc.includes("lostChance"), "renderer must not reference lostChance");
  assert(!rendererSrc.includes("getTransientIntentsFromCommitReport"), "renderer must not pull commit-report toast bridge");
  console.log("[PASS] wilderness lost-move resolver + toast adapter + renderer static guards");

  const gsLostCommit = createDefaultGameState();
  await setupRuntime(gsLostCommit, 0, 0);
  let rcLost = 0;
  const lostCommitPlan = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_E",
      payload: {},
      meta: mapActionContractMeta({
        wildernessMoveRngLike: { random() { rcLost += 1; return rcLost === 1 ? 0 : 0; } }
      })
    },
    gameState
  );
  validatePlan(lostCommitPlan);
  const mpLost = lostCommitPlan.wildernessPipelineIntents[0].movementPlan;
  assert(mpLost.ok === true && mpLost.lostMove?.lost === true, "resolve pipeline: forced lost move ok");
  const lostCommit = await commit(lostCommitPlan, gameState);
  assert(lostCommit.ok === true, "lost forced commit ok");
  const lostRow = lostCommit.report?.wilderness?.results?.find((r) => r.ok && r.type === "WILDERNESS_MOVE");
  assert(lostRow?.lostMove?.lost === true, "report row lostMove.lost");
  assert(lostRow?.uiEvent === "wilderness_lost_direction", "report row uiEvent");
  assert(String(lostRow.lostMove.intendedDirection) === "E", "report intendedDirection");
  assert(String(lostRow.lostMove.actualDirection || "") !== "E", "report actualDirection deviated");
  assert(
    Number(lostRow.lostMove.finalChance) === 0.1 && Number(lostRow.lostMove.baseChance) === 0.1 && Number(lostRow.lostMove.modifierAdditive) === 0,
    "report lostMove chance fields"
  );
  const wLost = gameState.world.wilderness;
  const dAct = getWildernessDirectionDelta(String(lostRow.lostMove.actualDirection));
  assert(wLost.x === dAct.x && wLost.y === dAct.y, "coords match actualDirection step from origin");
  assert(String(wLost.heading) === String(lostRow.lostMove.actualDirection), "heading matches actual");
  assert(
    String(wLost.returnDirection) === oppositeWildernessMoveDirection(String(lostRow.lostMove.actualDirection)),
    "returnDirection opposite of actual"
  );
  const lostHitToastIntents = getTransientIntentsFromCommitReport(lostCommit.report);
  assert(
    lostHitToastIntents.some((it) => it.type === DATA_DELTA_TOAST_TRANSIENT_TYPE && it.payload?.semanticType === "wilderness_lost_direction"),
    "lost hit commit yields wilderness_lost toast intent"
  );
  console.log("[PASS] wilderness lost-move commit report + returnDirection + toast on lost hit");

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
      meta: mapActionContractMeta()
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
  const wAfterE = gameState.world.wilderness;
  assert(wAfterE.previousPosition?.x === 0 && wAfterE.previousPosition?.y === 0, "return-step: previousPosition after E from (0,0)");
  assert(String(wAfterE.lastMoveDirection) === "E", "return-step: lastMoveDirection E");
  assert(String(wAfterE.returnDirection) === "W", "return-step: returnDirection W");
  const vmAfterE = buildWildernessViewModel(gameState);
  assert(String(vmAfterE.session?.returnDirection || "") === "W", "return-step: VM returnDirection W");
  const intentsAfterNormalMove = getTransientIntentsFromCommitReport(moveCommit.report);
  assert(
    !intentsAfterNormalMove.some((it) => it.type === DATA_DELTA_TOAST_TRANSIENT_TYPE && it.payload?.semanticType === "wilderness_lost_direction"),
    "normal rng move: no wilderness_lost toast"
  );
  console.log("[PASS] commit successful move updates coords time stamina survival report");

  const gsN = createDefaultGameState();
  await setupRuntime(gsN, 0, 0);
  const planN = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_N",
      payload: {},
      meta: mapActionContractMeta()
    },
    gameState
  );
  validatePlan(planN);
  assert(planN.wildernessPipelineIntents?.[0]?.movementPlan?.ok === true, "return-step: N plan ok from (0,0)");
  const commitN = await commit(planN, gameState);
  assert(commitN.ok === true, "return-step: N commit ok");
  const wAfterN = gameState.world.wilderness;
  assert(wAfterN.previousPosition?.x === 0 && wAfterN.previousPosition?.y === 0, "return-step: previous after N");
  assert(String(wAfterN.lastMoveDirection) === "N", "return-step: lastMoveDirection N");
  assert(String(wAfterN.returnDirection) === "S", "return-step: returnDirection S");
  const vmAfterN = buildWildernessViewModel(gameState);
  assert(String(vmAfterN.session?.returnDirection || "") === "S", "return-step: VM returnDirection S after N");
  console.log("[PASS] return-step fields after cardinal N move");

  // Place player at (7,0) so an E step targets (8,0) tide_crack_zone (the
  // canonical stable hard_block coord after the blueprint regen).
  const gsBlock = createDefaultGameState();
  await setupRuntime(gsBlock, 7, 0);
  const snapB = snapWildernessMoveSlice(gameState);
  gameState.world.wilderness.previousPosition = { x: 9, y: 9 };
  gameState.world.wilderness.lastMoveDirection = "NE";
  gameState.world.wilderness.returnDirection = "SW";
  const blockPlan = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_E",
      payload: {},
      meta: mapActionContractMeta()
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
  assert(
    gameState.world.wilderness.previousPosition?.x === 9 && gameState.world.wilderness.previousPosition?.y === 9,
    "blocked: previousPosition not overwritten by failed move"
  );
  assert(String(gameState.world.wilderness.lastMoveDirection) === "NE", "blocked: lastMoveDirection preserved");
  assert(String(gameState.world.wilderness.returnDirection) === "SW", "blocked: returnDirection preserved");
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

  // Bug2 contract: when the player sits on a map boundary, the per-direction
  // move actions exposed by buildWildernessViewModel(...) MUST already have
  // `hidden: true` on every direction whose target is bounds-out. The
  // renderer reads this flag verbatim — no geometry math on its side. The
  // resolve-layer boundary blocker stays as the authoritative fallback for
  // anything that bypasses the UI (asserted by trueBoundary above).
  // west2 bounds = -8..11 X, -8..8 Y.
  const EDGE_EXPECTED_HIDDEN = [
    { label: "north edge", x: 0, y: 8, dirs: ["NW", "N", "NE"], visible: ["W", "E", "SW", "S", "SE"] },
    { label: "south edge", x: 0, y: -8, dirs: ["SW", "S", "SE"], visible: ["W", "E", "NW", "N", "NE"] },
    { label: "west edge",  x: -8, y: 0, dirs: ["NW", "W", "SW"], visible: ["N", "S", "NE", "E", "SE"] },
    { label: "east edge",  x: 11, y: 0, dirs: ["NE", "E", "SE"], visible: ["N", "S", "NW", "W", "SW"] }
  ];
  for (const sample of EDGE_EXPECTED_HIDDEN) {
    const gsEdge = createDefaultGameState();
    await setupRuntime(gsEdge, sample.x, sample.y);
    const vm = buildWildernessViewModel(gameState);
    assert(vm && vm.active === true, `${sample.label}: vm active`);
    const byId = new Map();
    for (const a of (Array.isArray(vm.actions) ? vm.actions : [])) byId.set(String(a.id || ""), a);
    for (const dir of sample.dirs) {
      const a = byId.get(`wilderness_move_${dir}`);
      assert(a && a.hidden === true, `${sample.label}: wilderness_move_${dir} hidden`);
      assert(a.blockerStyle === "void", `${sample.label}: wilderness_move_${dir} blockerStyle === "void"`);
    }
    for (const dir of sample.visible) {
      const a = byId.get(`wilderness_move_${dir}`);
      // Adjacent terrain may still hard-block (e.g. sea / hard_terrain) but it
      // MUST NOT carry the boundary-style void marker; that is reserved for
      // true bounds-out targets so the renderer can render the right visual.
      if (a) {
        assert(a.blockerStyle !== "void", `${sample.label}: non-edge ${dir} not marked void`);
      }
    }
  }
  console.log("[PASS] edge directions carry hidden:true + blockerStyle:void on VM actions");

  // Bug4 (round 1, hard-terrain UI hiding): a direction that targets a foot
  // hard_block terrain (e.g. ice_shelf_edge / tide_crack_zone / open_water)
  // MUST already carry `hidden:true` on the VM action so the renderer never
  // shows that direction as a clickable button. The resolve-layer
  // `createTerrainHardWildernessBlocker` stays in place as a fallback for
  // any synthetic dispatch that bypasses the UI (verified just below).
  // (8,0)→W=(7,0): ice_shelf_surface (allowed) — sanity baseline.
  // (10,0)→W=(9,0): seek a hard terrain by walking near the eastern shelf.
  const gsHard = createDefaultGameState();
  await setupRuntime(gsHard, 11, 0);
  const vmHard = buildWildernessViewModel(gameState);
  const byIdHard = new Map();
  for (const a of (Array.isArray(vmHard.actions) ? vmHard.actions : [])) byIdHard.set(String(a.id || ""), a);
  // E/NE/SE point to bounds-out (void); W points to ice_shelf_edge (hard_terrain).
  const aW = byIdHard.get("wilderness_move_W");
  assert(aW && aW.hidden === true, "(11,0) W hidden:true (hard_terrain target)");
  assert(aW.blockerStyle === "hard_terrain", "(11,0) W blockerStyle === 'hard_terrain'");
  assert(aW.probe && aW.probe.hardBlock === true && aW.probe.passability === "blocked", "(11,0) W probe.hardBlock + blocked");
  assert(String(aW.probe.terrainId || "") === "ice_shelf_edge", "(11,0) W probe terrainId === ice_shelf_edge");
  // E (bounds-out) stays void — distinct from the hard_terrain style.
  const aE = byIdHard.get("wilderness_move_E");
  assert(aE && aE.hidden === true && aE.blockerStyle === "void", "(11,0) E hidden:true + blockerStyle:'void' (bounds-out)");
  console.log("[PASS] hard_terrain direction hidden + tagged blockerStyle on VM action");

  // Synthetic dispatch that bypasses the UI (external automation / stale
  // action) MUST still be rejected by the resolver's hard-terrain blocker.
  // This protects the integrity of `createTerrainHardWildernessBlocker(...)`.
  const hardFallbackPlan = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_W",
      payload: {},
      meta: mapActionContractMeta()
    },
    gameState
  );
  validatePlan(hardFallbackPlan);
  const hardFallbackIntent = Array.isArray(hardFallbackPlan.wildernessPipelineIntents)
    ? hardFallbackPlan.wildernessPipelineIntents.find((i) => i?.type === "WILDERNESS_MOVE")
    : null;
  assert(hardFallbackIntent && hardFallbackIntent.movementPlan?.ok === false, "hard_terrain fallback: resolve still rejects synthetic dispatch");
  assert(
    String(hardFallbackIntent.movementPlan?.blocker?.kind || "") === "terrain_hard_block",
    "hard_terrain fallback: blocker kind preserved (terrain_hard_block)"
  );
  // commit must not advance time / coords / stamina for a hard-terrain reject.
  const hardSnapBefore = snapWildernessMoveSlice(gameState);
  const hardFallbackCommit = await commit(hardFallbackPlan, gameState);
  assert(hardFallbackCommit.ok === true, "hard_terrain fallback: commit pipeline ok");
  const hardSnapAfter = snapWildernessMoveSlice(gameState);
  assert(hardSnapAfter.wx === hardSnapBefore.wx && hardSnapAfter.wy === hardSnapBefore.wy, "hard_terrain fallback: coords unchanged");
  assert(hardSnapAfter.totalMinutes === hardSnapBefore.totalMinutes, "hard_terrain fallback: time unchanged");
  assert(hardSnapAfter.stamina === hardSnapBefore.stamina, "hard_terrain fallback: stamina unchanged");
  assert(hardSnapAfter.stepsTaken === hardSnapBefore.stepsTaken, "hard_terrain fallback: stepsTaken unchanged");
  console.log("[PASS] resolve-layer terrain_hard_block blocker preserved (no state mutation)");

  // Corner stacking: at (-8, 8) NW + W + SW + N + NE are all out-of-bounds (5
  // directions), while S and SE stay in-bounds. Validates the per-direction
  // flag stacks without renderer-side aggregation.
  const gsCorner = createDefaultGameState();
  await setupRuntime(gsCorner, -8, 8);
  const vmCorner = buildWildernessViewModel(gameState);
  const cornerHidden = new Set();
  for (const a of (Array.isArray(vmCorner.actions) ? vmCorner.actions : [])) {
    if (a && a.hidden === true && String(a.id || "").startsWith("wilderness_move_")) {
      cornerHidden.add(String(a.id).slice("wilderness_move_".length));
    }
  }
  for (const dir of ["NW", "W", "SW", "N", "NE"]) {
    assert(cornerHidden.has(dir), `corner (-8,8): ${dir} hidden`);
  }
  console.log("[PASS] corner stacks multiple boundary directions");

  // Bug3 (stamina soft-lock): when stamina is strictly between 0 and the real
  // movement cost, the dispatch MUST go through (no blocker), but commit must
  // clamp stamina to 0, NOT advance coordinates, NOT increment stepsTaken,
  // and surface the collapse reason on the report row.
  const gsLowSt = createDefaultGameState();
  await setupRuntime(gsLowSt, 0, 0);
  gameState.player.physio.stamina = 1;
  gameState.player.psycho.fatigue = 80;
  gameState.player.physio.satiety = 80;
  gameState.player.psycho.hp = 80;
  const lowStBefore = snapWildernessMoveSlice(gameState);
  const lowStPlan = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_E",
      payload: {},
      meta: mapActionContractMeta()
    },
    gameState
  );
  validatePlan(lowStPlan);
  const lowStIntent = Array.isArray(lowStPlan.wildernessPipelineIntents)
    ? lowStPlan.wildernessPipelineIntents.find((i) => i?.type === "WILDERNESS_MOVE")
    : null;
  assert(lowStIntent && lowStIntent.movementPlan, "low-stamina intent queued");
  assert(
    lowStIntent.movementPlan.ok === true,
    "low-stamina plan stays ok (no blocker rejection)"
  );
  assert(
    lowStIntent.movementPlan.blocker == null,
    "low-stamina plan has no blocker"
  );
  assert(
    lowStIntent.movementPlan.staminaInsufficient === true,
    "low-stamina plan carries staminaInsufficient marker"
  );
  assert(
    String(lowStIntent.movementPlan.collapseReason || "") === "stamina_depleted_during_wilderness_move",
    "low-stamina plan carries collapseReason"
  );
  const lowStCommit = await commit(lowStPlan, gameState);
  assert(lowStCommit.ok === true, "low-stamina commit pipeline ok");
  const lowStAfter = snapWildernessMoveSlice(gameState);
  assert(lowStAfter.wx === lowStBefore.wx && lowStAfter.wy === lowStBefore.wy, "low-stamina: coords unchanged");
  assert(lowStAfter.stepsTaken === lowStBefore.stepsTaken, "low-stamina: stepsTaken unchanged");
  assert(lowStAfter.stamina === 0, "low-stamina: stamina clamped to 0 (non-negative)");
  assert(Number.isFinite(lowStAfter.stamina) && lowStAfter.stamina >= 0, "low-stamina: stamina is finite non-negative");
  const lowStRow = lowStCommit.report?.wilderness?.results?.find((r) =>
    r.type === "WILDERNESS_MOVE" && r.ok === false && r.staminaInsufficient === true
  );
  assert(lowStRow, "low-stamina: report row with staminaInsufficient");
  assert(
    String(lowStRow.collapseReason || "") === "stamina_depleted_during_wilderness_move",
    "low-stamina row carries collapseReason"
  );
  assert(
    lowStRow.survival && lowStRow.survival.playerTimeApplied === true,
    "low-stamina row preserves survival summary for downstream rescue"
  );
  assert(
    lowStRow.survival.before && Number(lowStRow.survival.before.stamina) > 0,
    "low-stamina survival.before.stamina > 0"
  );
  assert(
    lowStRow.survival.after && Number(lowStRow.survival.after.stamina) === 0,
    "low-stamina survival.after.stamina === 0"
  );
  // The Ethan rescue post-processor MUST detect the stamina_zero crossing
  // produced by this branch — the soft-lock is now resolved through the
  // existing collapse/rescue chain rather than as a blocker pop-up.
  const lowStRescue = lowStCommit.report?.wilderness?.results?.find((r) =>
    r.type === "WILDERNESS_ETHAN_RESCUE_CHECK"
  );
  assert(lowStRescue, "low-stamina commit produces WILDERNESS_ETHAN_RESCUE_CHECK row");
  assert(
    String(lowStRescue.reason || "") === "stamina_zero",
    "low-stamina rescue check sees stamina_zero crossing"
  );
  console.log("[PASS] low stamina move emits deferred collapse + rescue check, no blocker");

  // Bug3 (round 2): stamina=0 (already-zero holdout) MUST also bypass the
  // legacy "体力不足" blocker dialog. The plan stays ok:true with
  // `staminaInsufficient:true` and `collapseReason:"stamina_already_depleted"`,
  // and commit emits a `WILDERNESS_STAMINA_HOLDOUT_NOTICE` row carrying a
  // non-blocker feedback dialog payload. No `体力不足` copy may leak through
  // the blocker collector.
  const gsZeroSt = createDefaultGameState();
  await setupRuntime(gsZeroSt, 0, 0);
  gameState.player.physio.stamina = 0;
  gameState.player.psycho.fatigue = 80;
  gameState.player.physio.satiety = 80;
  gameState.player.psycho.hp = 80;
  const zeroStBefore = snapWildernessMoveSlice(gameState);
  const zeroStPlan = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_E",
      payload: {},
      meta: mapActionContractMeta()
    },
    gameState
  );
  validatePlan(zeroStPlan);
  const zeroStIntent = Array.isArray(zeroStPlan.wildernessPipelineIntents)
    ? zeroStPlan.wildernessPipelineIntents.find((i) => i?.type === "WILDERNESS_MOVE")
    : null;
  assert(zeroStIntent && zeroStIntent.movementPlan, "stamina=0 intent queued");
  assert(zeroStIntent.movementPlan.ok === true, "stamina=0 plan ok:true (no blocker)");
  assert(zeroStIntent.movementPlan.blocker == null, "stamina=0 plan has no blocker");
  assert(
    zeroStIntent.movementPlan.staminaInsufficient === true,
    "stamina=0 plan flagged staminaInsufficient"
  );
  assert(
    String(zeroStIntent.movementPlan.collapseReason || "") === "stamina_already_depleted",
    "stamina=0 plan collapseReason canonical"
  );
  const zeroStCommit = await commit(zeroStPlan, gameState);
  assert(zeroStCommit.ok === true, "stamina=0 commit pipeline ok");
  const zeroStAfter = snapWildernessMoveSlice(gameState);
  assert(zeroStAfter.wx === zeroStBefore.wx && zeroStAfter.wy === zeroStBefore.wy, "stamina=0: coords unchanged");
  assert(zeroStAfter.stepsTaken === zeroStBefore.stepsTaken, "stamina=0: stepsTaken unchanged");
  assert(zeroStAfter.stamina === 0, "stamina=0: stamina remains clamped at 0");
  const zeroStRow = zeroStCommit.report?.wilderness?.results?.find((r) =>
    r.type === "WILDERNESS_MOVE" && r.ok === false && r.staminaInsufficient === true
  );
  assert(zeroStRow, "stamina=0: move row carries staminaInsufficient");
  assert(zeroStRow.blocker == null, "stamina=0: move row MUST NOT carry a blocker");
  // before.stamina <= 0 ⇒ no stamina_zero crossing ⇒ no Ethan rescue check row.
  const zeroStRescue = zeroStCommit.report?.wilderness?.results?.find((r) =>
    r.type === "WILDERNESS_ETHAN_RESCUE_CHECK"
  );
  assert(!zeroStRescue, "stamina=0: no Ethan rescue check (no crossing)");
  const zeroStHoldout = zeroStCommit.report?.wilderness?.results?.find((r) =>
    r.type === "WILDERNESS_STAMINA_HOLDOUT_NOTICE"
  );
  assert(zeroStHoldout, "stamina=0: holdout notice row present");
  assert(
    zeroStHoldout.notice?.title && zeroStHoldout.notice.title !== "体力不足",
    "holdout notice title MUST NOT equal '体力不足'"
  );
  assert(
    !String(zeroStHoldout.notice?.message || "").includes("你的体力不足以完成"),
    "holdout notice MUST NOT include the removed '体力不足以完成' copy"
  );
  // Critical: the live "体力不足" dialog escapes through
  // collectWildernessMoveBlockedNoticeDialogs. Verify it returns empty
  // for the stamina=0 commit (i.e., the blocker dialog path is sealed).
  const zeroStBlockedDialogs = collectWildernessMoveBlockedNoticeDialogs(zeroStCommit.report);
  assert(zeroStBlockedDialogs.length === 0, "stamina=0: zero blocker dialogs");
  for (const d of zeroStBlockedDialogs) {
    assert(d.title !== "体力不足", "no '体力不足' blocker title");
  }
  console.log("[PASS] stamina=0 emits holdout notice, no blocker dialog");

  // Resolve-layer fallback MUST still reject a synthetic boundary dispatch
  // that bypassed the UI (e.g. external automation / stale action). This is
  // the same guarantee as the earlier `trueBoundary` resolver test, re-run
  // here through the full resolve() pipeline to lock the contract.
  const gsFallback = createDefaultGameState();
  await setupRuntime(gsFallback, 0, 8);
  const boundaryPlan = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_N",
      payload: {},
      meta: mapActionContractMeta()
    },
    gameState
  );
  validatePlan(boundaryPlan);
  const boundaryIntent = Array.isArray(boundaryPlan.wildernessPipelineIntents)
    ? boundaryPlan.wildernessPipelineIntents.find((i) => i?.type === "WILDERNESS_MOVE")
    : null;
  assert(
    boundaryIntent && boundaryIntent.movementPlan?.ok === false,
    "boundary fallback: resolve still rejects bounds-out dispatch"
  );
  assert(
    boundaryIntent.movementPlan?.blocker?.kind === "boundary_block",
    "boundary fallback: blocker kind preserved"
  );
  console.log("[PASS] resolve-layer boundary blocker preserved as fallback");

  console.log("[PASS] wilderness_movement_contract_check");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
