/**
 * Phase 10B: player_state_block resolve ordering + commit safety + notice extraction.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDefaultGameState, gameState, replaceGameState } from "../src/engine/state.js";
import { loadMap } from "../src/engine/loader.js";
import { resolve } from "../src/engine/pipeline/resolve.js";
import { commit } from "../src/engine/pipeline/commit.js";
import { validatePlan } from "../src/engine/pipeline/plan_types.js";
import { resolveWildernessMovePlanReadOnly } from "../src/engine/wilderness/wilderness_movement_resolver.js";
import { getWildernessAreaSpec } from "../src/engine/wilderness/wilderness_area_registry.js";
import {
  collectWildernessMoveBlockedNoticeDialogs,
  isWildernessBlocker,
  WILDERNESS_BLOCKER_KINDS
} from "../src/engine/wilderness/wilderness_blocker.js";
import {
  WILDERNESS_PLAYER_STATE_BLOCK_REASONS,
  evaluateWildernessPlayerStateBlocker,
  createWildernessPlayerStateBlocker,
  getWildernessPlayerStateSnapshot,
  MIN_HP_TO_ATTEMPT_MOVE,
  MIN_HYPOTHERMIA_SAFETY_TO_MOVE
} from "../src/engine/wilderness/wilderness_player_state_blocker.js";

const rngWildernessMoveNeverLost = { random: () => 0.99 };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function assert(c, m) {
  if (!c) throw new Error(m);
}

function clonePlayer(basePlayer, patch = {}) {
  const p = JSON.parse(JSON.stringify(basePlayer || {}));
  if (!p.physio || typeof p.physio !== "object") p.physio = {};
  if (!p.psycho || typeof p.psycho !== "object") p.psycho = {};
  if (patch.physio) Object.assign(p.physio, patch.physio);
  if (patch.psycho) Object.assign(p.psycho, patch.psycho);
  return p;
}

function activeSession(x, y) {
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
  gs.time.totalMinutes = 12000;
  gs.world.wilderness = activeSession(wx, wy);
  const wrMap = await loadMap("wilderness_runtime");
  assert(!!wrMap, "wilderness_runtime loads");
  gs.currentMapId = "wilderness_runtime";
  gs.world.currentMapId = "wilderness_runtime";
  gs.currentMap = wrMap;
  replaceGameState(gs);
}

function assertNoResolverPlayerWrites() {
  const src = fs.readFileSync(path.join(ROOT, "src", "engine", "wilderness", "wilderness_movement_resolver.js"), "utf8");
  assert(!/\bplayer\s*\.\s*(physio|psycho)\s*\.\s*\w+\s*=/m.test(src), "resolver must not assign player vitals");
}

function assertRendererNoPlayerStateBlockLogic() {
  const src = fs.readFileSync(path.join(ROOT, "src", "engine", "renderer.js"), "utf8");
  assert(!src.includes("evaluateWildernessPlayerStateBlocker"), "renderer must not call evaluateWildernessPlayerStateBlocker");
  assert(!src.includes("wilderness_player_state_blocker"), "renderer must not import wilderness_player_state_blocker");
}

async function main() {
  assert(WILDERNESS_BLOCKER_KINDS.includes("player_state_block"), "player_state_block kind");
  // Bug3 (round 2): `stamina_insufficient` is intentionally absent. Stamina cases
  // are owned by the resolver `staminaInsufficient` marker + commit holdouts.
  //
  // Contract upgraded from bare `length === 3`: runtime export must match this
  // canonical tuple exactly (order-stable, no duplicates, no unknown tokens).
  const CANONICAL_PLAYER_STATE_BLOCK_REASONS = Object.freeze([
    "hp_too_low",
    "severe_hypothermia",
    "player_state_missing"
  ]);
  const actualReasons = WILDERNESS_PLAYER_STATE_BLOCK_REASONS;
  assert(
    actualReasons.length === CANONICAL_PLAYER_STATE_BLOCK_REASONS.length,
    "reason enum size (canonical vs runtime length)"
  );
  for (let i = 0; i < CANONICAL_PLAYER_STATE_BLOCK_REASONS.length; i++) {
    assert(
      actualReasons[i] === CANONICAL_PLAYER_STATE_BLOCK_REASONS[i],
      `reason enum entry ${i} must be ${CANONICAL_PLAYER_STATE_BLOCK_REASONS[i]}`
    );
  }
  assert(
    new Set(actualReasons).size === actualReasons.length,
    "reason enum entries must be unique strings"
  );
  assert(
    !actualReasons.includes("stamina_insufficient"),
    "stamina_insufficient must be removed from player_state reasons"
  );
  assert(MIN_HYPOTHERMIA_SAFETY_TO_MOVE === 25, "hypothermia safety floor constant");

  const baseGs = createDefaultGameState();
  const basePlayer = baseGs.player;
  const snap0 = getWildernessPlayerStateSnapshot(basePlayer);
  assert(Number.isFinite(snap0.stamina), "snapshot stamina finite");
  snap0.stamina = 99999;
  assert(Number(basePlayer.physio.stamina) !== 99999, "getWildernessPlayerStateSnapshot does not write player");

  const areaSpec = getWildernessAreaSpec("west2_old_marker_patrol_line");
  assert(!!areaSpec, "area spec");

  const draftBase = {
    minutes: 8,
    staminaCost: 10,
    terrainId: "packed_snow_trail",
    to: { x: 1, y: 0 },
    from: { x: 0, y: 0 }
  };

  // Bug3 (round 2): NO stamina case may emit a `player_state_block` from
  // `evaluateWildernessPlayerStateBlocker`. The full removal covers:
  //   - 0 < stamina < cost
  //   - stamina === 0
  //   - stamina < 0 (defensive)
  //   - staminaCost === Infinity
  // All four are owned downstream by the resolver's `staminaInsufficient`
  // plan marker. Surfacing any of them as a blocker here would re-introduce
  // the removed "体力不足" dialog the user explicitly forbade.
  const lowStamina = clonePlayer(basePlayer, { physio: { stamina: 2 } });
  assert(
    evaluateWildernessPlayerStateBlocker({
      player: lowStamina,
      movementPlanDraft: draftBase,
      wilderness: activeSession(0, 0),
      areaSpec,
      terrainDef: { id: "packed_snow_trail" }
    }) == null,
    "0 < stamina < cost MUST NOT emit player_state blocker"
  );

  const oneStaminaBig = clonePlayer(basePlayer, { physio: { stamina: 1 } });
  assert(
    evaluateWildernessPlayerStateBlocker({
      player: oneStaminaBig,
      movementPlanDraft: { ...draftBase, staminaCost: 999 },
      wilderness: activeSession(0, 0),
      areaSpec,
      terrainDef: { id: "packed_snow_trail" }
    }) == null,
    "stamina=1 vs huge cost stays non-blocking"
  );

  const zeroStaminaPlayer = clonePlayer(basePlayer, { physio: { stamina: 0 } });
  assert(
    evaluateWildernessPlayerStateBlocker({
      player: zeroStaminaPlayer,
      movementPlanDraft: draftBase,
      wilderness: activeSession(0, 0),
      areaSpec,
      terrainDef: { id: "packed_snow_trail" }
    }) == null,
    "stamina<=0 MUST NOT emit player_state blocker (handled as holdout)"
  );

  const negStamina = clonePlayer(basePlayer, { physio: { stamina: -1 } });
  assert(
    evaluateWildernessPlayerStateBlocker({
      player: negStamina,
      movementPlanDraft: draftBase,
      wilderness: activeSession(0, 0),
      areaSpec,
      terrainDef: { id: "packed_snow_trail" }
    }) == null,
    "negative stamina MUST NOT emit player_state blocker"
  );

  // Static text contract: the removed copy must not appear anywhere in
  // wilderness_player_state_blocker.js — this is the surface the live
  // "体力不足" dialog used to escape from.
  const psBlockerSrc = fs.readFileSync(
    path.join(ROOT, "src", "engine", "wilderness", "wilderness_player_state_blocker.js"),
    "utf8"
  );
  assert(
    !psBlockerSrc.includes("体力不足"),
    "wilderness_player_state_blocker must not contain '体力不足' copy"
  );
  assert(
    !psBlockerSrc.includes("你的体力不足以完成这段野外移动"),
    "wilderness_player_state_blocker must not contain the long stamina-insufficient copy"
  );
  assert(
    !psBlockerSrc.includes("player_stamina_insufficient_block"),
    "wilderness_player_state_blocker must not emit player_stamina_insufficient_block id"
  );

  // The unrelated `isWildernessBlocker` invariant still holds for valid HP/hypo blockers.
  const hpOnlyBlocker = createWildernessPlayerStateBlocker({
    reason: "hp_too_low",
    player: basePlayer,
    movementPlanDraft: draftBase,
    wilderness: activeSession(0, 0),
    areaSpec,
    terrainDef: { id: "packed_snow_trail" }
  });
  assert(isWildernessBlocker(hpOnlyBlocker), "hp_too_low blocker validates as wilderness blocker");

  const lowHp = clonePlayer(basePlayer, { physio: { stamina: 100 }, psycho: { hp: MIN_HP_TO_ATTEMPT_MOVE } });
  const hpBlock = evaluateWildernessPlayerStateBlocker({
    player: lowHp,
    movementPlanDraft: { ...draftBase, staminaCost: 0 },
    wilderness: activeSession(0, 0),
    areaSpec,
    terrainDef: {}
  });
  assert(hpBlock?.blockerId === "player_hp_too_low_block", "hp at threshold blocks");
  const hpOverStamina = clonePlayer(basePlayer, {
    physio: { stamina: 0 },
    psycho: { hp: MIN_HP_TO_ATTEMPT_MOVE }
  });
  const hpFirst = evaluateWildernessPlayerStateBlocker({
    player: hpOverStamina,
    movementPlanDraft: draftBase,
    wilderness: activeSession(0, 0),
    areaSpec,
    terrainDef: {}
  });
  assert(hpFirst?.blockerId === "player_hp_too_low_block", "hp blocks before stamina");

  const draftNoCost = { ...draftBase, staminaCost: 0 };
  const hypoSafe = clonePlayer(basePlayer, {
    physio: { stamina: 100 },
    psycho: { hp: 100, hypothermia: 100, hypoStage: "Safe" }
  });
  assert(
    evaluateWildernessPlayerStateBlocker({
      player: hypoSafe,
      movementPlanDraft: draftNoCost,
      wilderness: activeSession(0, 0),
      areaSpec,
      terrainDef: {}
    }) == null,
    "hypothermia safety index 100 does not trigger severe_hypothermia"
  );
  const hypoAt25 = clonePlayer(basePlayer, {
    physio: { stamina: 100 },
    psycho: { hp: 100, hypothermia: MIN_HYPOTHERMIA_SAFETY_TO_MOVE, hypoStage: "Safe" }
  });
  assert(
    evaluateWildernessPlayerStateBlocker({
      player: hypoAt25,
      movementPlanDraft: draftNoCost,
      wilderness: activeSession(0, 0),
      areaSpec,
      terrainDef: {}
    })?.blockerId === "player_severe_hypothermia_block",
    "hypothermia at safety floor blocks"
  );
  const hypoAt10 = clonePlayer(basePlayer, {
    physio: { stamina: 100 },
    psycho: { hp: 100, hypothermia: 10, hypoStage: "Safe" }
  });
  assert(
    evaluateWildernessPlayerStateBlocker({
      player: hypoAt10,
      movementPlanDraft: draftNoCost,
      wilderness: activeSession(0, 0),
      areaSpec,
      terrainDef: {}
    })?.blockerId === "player_severe_hypothermia_block",
    "hypothermia below safety floor blocks"
  );
  const hypoAboveFloor = clonePlayer(basePlayer, {
    physio: { stamina: 100 },
    psycho: { hp: 100, hypothermia: MIN_HYPOTHERMIA_SAFETY_TO_MOVE + 1, hypoStage: "Safe" }
  });
  assert(
    evaluateWildernessPlayerStateBlocker({
      player: hypoAboveFloor,
      movementPlanDraft: draftNoCost,
      wilderness: activeSession(0, 0),
      areaSpec,
      terrainDef: {}
    }) == null,
    "hypothermia just above safety floor does not alone block"
  );
  const hypoStageSevere = clonePlayer(basePlayer, {
    physio: { stamina: 100 },
    psycho: { hp: 100, hypothermia: 100, hypoStage: "Severe" }
  });
  assert(
    evaluateWildernessPlayerStateBlocker({
      player: hypoStageSevere,
      movementPlanDraft: draftNoCost,
      wilderness: activeSession(0, 0),
      areaSpec,
      terrainDef: {}
    })?.blockerId === "player_severe_hypothermia_block",
    "hypoStage Severe blocks"
  );
  const hypoStageCritical = clonePlayer(basePlayer, {
    physio: { stamina: 100 },
    psycho: { hp: 100, hypothermia: 100, hypoStage: "Critical" }
  });
  assert(
    evaluateWildernessPlayerStateBlocker({
      player: hypoStageCritical,
      movementPlanDraft: draftNoCost,
      wilderness: activeSession(0, 0),
      areaSpec,
      terrainDef: {}
    })?.blockerId === "player_severe_hypothermia_block",
    "hypoStage Critical blocks"
  );

  const hypoStagePlayer = clonePlayer(basePlayer, {
    physio: { stamina: 0 },
    psycho: { hp: 100, hypothermia: 100, hypoStage: "Severe" }
  });
  const hypoBeforeStamina = evaluateWildernessPlayerStateBlocker({
    player: hypoStagePlayer,
    movementPlanDraft: draftBase,
    wilderness: activeSession(0, 0),
    areaSpec,
    terrainDef: {}
  });
  assert(hypoBeforeStamina?.blockerId === "player_severe_hypothermia_block", "hypo before stamina when both bad");

  // Bug3 (round 2): Infinity stamina cost also routes through the
  // staminaInsufficient plan path, NOT a player_state_block.
  const infDraft = { ...draftBase, staminaCost: Infinity };
  const infBlock = evaluateWildernessPlayerStateBlocker({
    player: clonePlayer(basePlayer, { physio: { stamina: 999 } }),
    movementPlanDraft: infDraft,
    wilderness: activeSession(0, 0),
    areaSpec,
    terrainDef: {}
  });
  assert(infBlock == null, "Infinity stamina cost MUST NOT emit player_state blocker");

  const deadPlayer = clonePlayer(basePlayer, { physio: { stamina: 0 }, psycho: { hp: 3, hypothermia: 90 } });
  const deadFirst = evaluateWildernessPlayerStateBlocker({
    player: deadPlayer,
    movementPlanDraft: draftBase,
    wilderness: activeSession(0, 0),
    areaSpec,
    terrainDef: {}
  });
  assert(deadFirst?.blockerId === "player_hp_too_low_block", "hp worse than hypo priority");

  const boundaryDead = resolveWildernessMovePlanReadOnly({
    wilderness: activeSession(8, 8),
    areaSpec,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 0,
    player: deadPlayer,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(boundaryDead.ok === false && boundaryDead.blocker?.kind === "boundary_block", "boundary beats player_state");

  const boundaryNoPlayer = resolveWildernessMovePlanReadOnly({
    wilderness: activeSession(8, 8),
    areaSpec,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 0,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(
    boundaryNoPlayer.ok === false && boundaryNoPlayer.blocker?.kind === "boundary_block",
    "missing player still yields boundary before player_state_missing"
  );

  // Pre-existing data drift: (6,0)→E→(7,0) is no longer the canonical hard-
  // block cell after a blueprint regen. The stable post-regen hard-block
  // sample is (7,0)→E→(8,0) tide_crack_zone — same one the movement contract
  // pins. Use that here so the "terrain hard beats player_state" ordering
  // contract keeps a deterministic anchor.
  const iceDead = resolveWildernessMovePlanReadOnly({
    wilderness: activeSession(7, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 0,
    player: deadPlayer,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(iceDead.ok === false && iceDead.blocker?.kind === "terrain_hard_block", "ice hard beats player_state");

  const w2 = getWildernessAreaSpec("west2_old_marker_patrol_line");
  const zones = Array.from(w2.terrainZones || []);
  // Pre-existing data drift: generated zones in this area now reach priority
  // 120. The synthetic crevasse cell needs to outrank them to anchor the
  // "crevasse requirement beats player_state" ordering contract.
  zones.push({
    id: "contract_crevasse_cell_ps",
    terrainId: "crevasse_field",
    priority: 1000,
    shape: { type: "rect", x1: 2, y1: 2, x2: 2, y2: 2 }
  });
  const specCrev = { ...w2, terrainZones: zones };
  const crevDead = resolveWildernessMovePlanReadOnly({
    wilderness: activeSession(2, 1),
    areaSpec: specCrev,
    direction: "N",
    actionId: "wilderness_move_N",
    worldWeather: {},
    totalMinutes: 0,
    player: deadPlayer,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(crevDead.ok === false && crevDead.blocker?.kind === "terrain_requirement_block", "crevasse req beats player_state");

  const missingPlayerMove = resolveWildernessMovePlanReadOnly({
    wilderness: activeSession(0, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(
    missingPlayerMove.ok === false &&
      missingPlayerMove.blocker?.kind === "player_state_block" &&
      missingPlayerMove.blocker?.blockerId === "player_state_missing_block" &&
      missingPlayerMove.minutes === 0 &&
      missingPlayerMove.staminaCost === 0,
    "default requirePlayerStateCheck: missing player -> player_state_missing_block"
  );

  const skipNoPlayerOk = resolveWildernessMovePlanReadOnly({
    wilderness: activeSession(0, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000,
    requirePlayerStateCheck: false,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(skipNoPlayerOk.ok === true, "explicit requirePlayerStateCheck:false skips player gates for tests");

  // Bug3 (round 2): a player at stamina=0 on a passable cell MUST resolve
  // to ok:true with `staminaInsufficient:true` (NOT a player_state blocker).
  const zeroStamina = clonePlayer(basePlayer, { physio: { stamina: 0 } });
  const passZeroStamina = resolveWildernessMovePlanReadOnly({
    wilderness: activeSession(0, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000,
    player: zeroStamina,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(passZeroStamina.ok === true, "stamina=0 plan stays ok:true (no resolve-side blocker)");
  assert(passZeroStamina.blocker == null, "stamina=0 plan has no blocker");
  assert(
    passZeroStamina.staminaInsufficient === true,
    "stamina=0 plan carries staminaInsufficient:true marker"
  );
  assert(
    passZeroStamina.collapseReason === "stamina_already_depleted",
    "stamina=0 plan carries collapseReason=stamina_already_depleted"
  );

  // 0 < stamina < cost: deferred-collapse (will cross stamina_zero in commit).
  const oneStaminaPlayer = clonePlayer(basePlayer, { physio: { stamina: 1 } });
  const deferredCollapsePlan = resolveWildernessMovePlanReadOnly({
    wilderness: activeSession(0, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000,
    player: oneStaminaPlayer,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(
    deferredCollapsePlan.ok === true,
    "low-stamina passable plan stays ok:true (no resolve-side blocker)"
  );
  assert(
    deferredCollapsePlan.blocker == null,
    "low-stamina plan has no blocker"
  );
  assert(
    deferredCollapsePlan.staminaInsufficient === true,
    "low-stamina plan carries staminaInsufficient:true marker"
  );
  assert(
    deferredCollapsePlan.collapseReason === "stamina_depleted_during_wilderness_move",
    "low-stamina plan carries canonical collapseReason"
  );
  assert(
    Number(deferredCollapsePlan.staminaBefore) === 1,
    "low-stamina plan records staminaBefore"
  );

  // Sufficient stamina path stays unmarked.
  const fullStaminaPlayer = clonePlayer(basePlayer, { physio: { stamina: 100 } });
  const fullPlan = resolveWildernessMovePlanReadOnly({
    wilderness: activeSession(0, 0),
    areaSpec,
    direction: "E",
    actionId: "wilderness_move_E",
    worldWeather: {},
    totalMinutes: 9000,
    player: fullStaminaPlayer,
    rngLike: rngWildernessMoveNeverLost
  });
  assert(fullPlan.ok === true, "full stamina plan ok");
  assert(fullPlan.staminaInsufficient === false, "full stamina plan staminaInsufficient false");
  assert(fullPlan.collapseReason == null, "full stamina plan no collapseReason");

  const mapHandlersSrc = fs.readFileSync(
    path.join(ROOT, "src", "engine", "pipeline", "resolve_handlers", "map_handlers.js"),
    "utf8"
  );
  assert(
    !mapHandlersSrc.includes("requirePlayerStateCheck: false"),
    "map_handlers must not pass requirePlayerStateCheck: false"
  );
  assert(
    mapHandlersSrc.includes("player: gameState?.player"),
    "map_handlers passes gameState.player into wilderness move resolver"
  );

  // Bug3 (round 2): the factory must NOT recognize the removed
  // `stamina_insufficient` reason. Passing it now lands in the defensive
  // unknown branch (non-stamina copy) — and crucially must NOT contain the
  // removed "体力不足" strings.
  const removedReasonBlocker = createWildernessPlayerStateBlocker({
    reason: "stamina_insufficient",
    player: basePlayer,
    movementPlanDraft: draftBase,
    wilderness: activeSession(0, 0),
    areaSpec,
    terrainDef: { id: "packed_snow_trail" }
  });
  assert(
    removedReasonBlocker.blockerId !== "player_stamina_insufficient_block",
    "factory must not emit player_stamina_insufficient_block for the removed reason"
  );
  assert(
    removedReasonBlocker.title !== "体力不足",
    "factory must not surface '体力不足' title"
  );
  assert(
    !String(removedReasonBlocker.message || "").includes("体力不足以完成"),
    "factory must not surface the long stamina-insufficient message"
  );

  // The dialog collector still works for legitimate player_state blockers
  // (HP / hypo). Use hp_too_low here since stamina_insufficient is removed.
  const manualHp = createWildernessPlayerStateBlocker({
    reason: "hp_too_low",
    player: basePlayer,
    movementPlanDraft: draftBase,
    wilderness: activeSession(0, 0),
    areaSpec,
    terrainDef: { id: "packed_snow_trail" }
  });
  assert(manualHp.notice?.title && manualHp.notice?.actions?.[0]?.id === "stay", "factory notice shape");

  const dlgReport = {
    wilderness: {
      results: [
        {
          type: "WILDERNESS_MOVE",
          ok: false,
          blocker: manualHp
        }
      ]
    }
  };
  const dlg = collectWildernessMoveBlockedNoticeDialogs(dlgReport);
  assert(dlg.length === 1 && dlg[0].message === manualHp.notice.message, "collect notices player_state_block");

  assertNoResolverPlayerWrites();
  assertRendererNoPlayerStateBlockLogic();

  // Bug3 (round 2): end-to-end stamina=0 → resolve→commit must NOT produce
  // a `player_state_block` blocker dialog. Instead the resolver attaches
  // `staminaInsufficient:true` and commit emits a `WILDERNESS_STAMINA_HOLDOUT_NOTICE`
  // row (since `before.stamina <= 0` cannot cross the stamina_zero threshold).
  const gs = createDefaultGameState();
  await setupRuntime(gs, 0, 0);
  gameState.player.physio.stamina = 0;
  const beforeCoords = {
    x: gameState.world.wilderness.x,
    y: gameState.world.wilderness.y,
    heading: gameState.world.wilderness.heading,
    steps: gameState.world.wilderness.stepsTaken
  };
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
  const mp0 = plan.wildernessPipelineIntents[0].movementPlan;
  assert(mp0?.ok === true, "stamina=0 plan stays ok:true (no resolver-side blocker)");
  assert(mp0?.blocker == null, "stamina=0 plan has no blocker");
  assert(mp0?.staminaInsufficient === true, "stamina=0 plan flagged staminaInsufficient");
  assert(
    mp0?.collapseReason === "stamina_already_depleted",
    "stamina=0 plan collapseReason canonical"
  );
  const res = await commit(plan, gameState);
  assert(res.ok === true, "pipeline ok");
  assert(gameState.world.wilderness.x === beforeCoords.x, "stamina=0 commit: x unchanged");
  assert(gameState.world.wilderness.y === beforeCoords.y, "stamina=0 commit: y unchanged");
  assert(gameState.world.wilderness.heading === beforeCoords.heading, "stamina=0 commit: heading unchanged");
  assert(gameState.world.wilderness.stepsTaken === beforeCoords.steps, "stamina=0 commit: stepsTaken unchanged");
  assert(gameState.player.physio.stamina === 0, "stamina=0 commit: stamina remains clamped to 0");

  const row = res.report?.wilderness?.results?.find((r) => r.type === "WILDERNESS_MOVE");
  assert(row, "stamina=0 commit emits a WILDERNESS_MOVE row");
  assert(row.ok === false, "stamina=0 move row is ok:false");
  assert(row.staminaInsufficient === true, "stamina=0 move row carries staminaInsufficient");
  assert(row.blocker == null, "stamina=0 move row MUST NOT carry a blocker payload");

  const holdoutRow = res.report?.wilderness?.results?.find(
    (r) => r.type === "WILDERNESS_STAMINA_HOLDOUT_NOTICE"
  );
  assert(holdoutRow, "stamina=0 commit emits holdout notice row");
  assert(
    holdoutRow.notice?.title && !String(holdoutRow.notice.title).includes("体力不足"),
    "holdout notice title must NOT contain '体力不足'"
  );
  assert(
    !String(holdoutRow.notice?.message || "").includes("你的体力不足以完成"),
    "holdout notice message must NOT contain the removed '体力不足以完成' copy"
  );

  // Final live-path safety: no dialog payload anywhere in this commit
  // report carries the removed "体力不足" copy.
  const blockedDialogs = collectWildernessMoveBlockedNoticeDialogs(res.report);
  assert(blockedDialogs.length === 0, "stamina=0 commit emits zero blocker dialogs");
  for (const d of blockedDialogs) {
    assert(d.title !== "体力不足", "no '体力不足' dialog title");
    assert(!String(d.message || "").includes("你的体力不足以完成"), "no removed-copy dialog");
  }

  const gsMissing = createDefaultGameState();
  await setupRuntime(gsMissing, 0, 0);
  gsMissing.player = undefined;
  replaceGameState(gsMissing);
  const beforeM = {
    x: gameState.world.wilderness.x,
    y: gameState.world.wilderness.y,
    t: gameState.time.totalMinutes
  };
  const planM = await resolve(
    {
      type: "MAP_ACTION",
      id: "wilderness_move_E",
      payload: {},
      meta: { atMs: Date.now(), source: "contract", mapId: "wilderness_runtime", wildernessMoveRngLike: rngWildernessMoveNeverLost }
    },
    gameState
  );
  validatePlan(planM);
  const mpM = planM.wildernessPipelineIntents[0].movementPlan;
  assert(mpM?.ok === false && mpM?.blocker?.blockerId === "player_state_missing_block", "resolve queues missing-player block");
  const resM = await commit(planM, gameState);
  assert(resM.ok === true, "commit pipeline ok");
  assert(
    gameState.world.wilderness.x === beforeM.x && gameState.world.wilderness.y === beforeM.y,
    "missing-player commit: coords unchanged"
  );
  assert(gameState.time.totalMinutes === beforeM.t, "missing-player commit: time unchanged");
  const rowM = resM.report?.wilderness?.results?.find((r) => r.type === "WILDERNESS_MOVE" && r.ok === false);
  assert(rowM?.blocker?.blockerId === "player_state_missing_block" && rowM?.survival == null, "missing-player report row");

  console.log("[PASS] wilderness_player_state_blocker_contract_check");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
