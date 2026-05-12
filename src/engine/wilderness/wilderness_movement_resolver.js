import {
  queryWildernessCoordinate,
  getEnterableLandmarkAtCoordinate,
  listLandmarkCuesForCoordinate
} from "./wilderness_area_query.js";
import {
  calculateWildernessStaminaCost,
  calculateWildernessStepMeters,
  calculateWildernessStepMinutes,
  getWildernessDirectionDelta,
  getWildernessDirectionDistanceMultiplier,
  WILDERNESS_MOVE_DIRECTIONS
} from "./wilderness_movement_cost.js";
import {
  createBoundaryWildernessBlocker,
  createTerrainHardWildernessBlocker,
  createTerrainRequirementWildernessBlocker,
  normalizeWildernessBlocker
} from "./wilderness_blocker.js";
import { buildWildernessSurfaceRuntime } from "./wilderness_surface_runtime.js";
import { getWildernessRegionProfile } from "./wilderness_region_registry.js";
import {
  createWildernessPlayerStateBlocker,
  evaluateWildernessPlayerStateBlocker,
  getWildernessPlayerStateSnapshot
} from "./wilderness_player_state_blocker.js";
import { resolveWildernessLostMoveDirection } from "./wilderness_lost_move.js";

function baseFailure({
  actionId,
  direction,
  wilderness,
  areaId,
  regionId,
  terrainId,
  partialBlocker,
  toX,
  toY,
  lostMove = null,
  intendedDirection = null
}) {
  const wx = Number.isInteger(wilderness?.x) ? wilderness.x : 0;
  const wy = Number.isInteger(wilderness?.y) ? wilderness.y : 0;
  const nx = Number.isFinite(Number(toX)) ? Math.trunc(Number(toX)) : wx;
  const ny = Number.isFinite(Number(toY)) ? Math.trunc(Number(toY)) : wy;
  const blocker = normalizeWildernessBlocker(partialBlocker, {
    areaId,
    regionId,
    at: { x: nx, y: ny }
  });
  const out = {
    ok: false,
    actionId,
    direction,
    from: { x: wx, y: wy },
    to: { x: nx, y: ny },
    areaId,
    regionId,
    terrainId: terrainId || null,
    minutes: 0,
    staminaCost: 0,
    blocker,
    warnings: [],
    report: {
      terrainLabel: null,
      movementText: "无法移动"
    }
  };
  if (lostMove && typeof lostMove === "object") {
    out.lostMove = {
      lost: lostMove.lost,
      roll: lostMove.roll,
      baseChance: lostMove.baseChance,
      modifierAdditive: lostMove.modifierAdditive,
      finalChance: lostMove.finalChance,
      intendedDirection: lostMove.intendedDirection,
      actualDirection: lostMove.actualDirection
    };
    out.intendedDirection = intendedDirection != null ? String(intendedDirection).trim() : lostMove.intendedDirection;
  }
  return out;
}

function resolveMinuteOfDayFromTotalMinutes(totalMinutes) {
  if (totalMinutes == null) return null;
  const tm = Number(totalMinutes);
  if (!Number.isFinite(tm)) return null;
  const t = Math.trunc(tm);
  return ((t % 1440) + 1440) % 1440;
}

/**
 * Pure resolver: explicit inputs only; no module-level state dependency.
 */
export function resolveWildernessMovePlanReadOnly({
  wilderness,
  areaSpec,
  direction,
  actionId,
  worldWeather,
  totalMinutes,
  player,
  requirePlayerStateCheck = true,
  rngLike
}) {
  const dir = String(direction || "").trim();
  const aid = String(actionId || "").trim();
  const areaId = String(areaSpec?.id || "").trim();
  const regionId = String(areaSpec?.regionId || "").trim();

  const deltaPreview = getWildernessDirectionDelta(dir) || { x: 0, y: 0 };
  const wx0 = Number.isInteger(wilderness?.x) ? wilderness.x : 0;
  const wy0 = Number.isInteger(wilderness?.y) ? wilderness.y : 0;
  const previewToX = wx0 + deltaPreview.x;
  const previewToY = wy0 + deltaPreview.y;

  if (!wilderness || typeof wilderness !== "object" || wilderness.active !== true) {
    return baseFailure({
      actionId: aid,
      direction: dir,
      wilderness: wilderness || {},
      areaId,
      regionId,
      terrainId: null,
      partialBlocker: {
        kind: "session_inactive",
        terrainId: null,
        title: "未处于野外会话",
        message: "当前没有进行中的野外移动会话。"
      },
      toX: previewToX,
      toY: previewToY
    });
  }

  if (!WILDERNESS_MOVE_DIRECTIONS.includes(dir)) {
    return baseFailure({
      actionId: aid,
      direction: dir,
      wilderness,
      areaId,
      regionId,
      terrainId: null,
      partialBlocker: {
        kind: "bad_direction",
        terrainId: null,
        title: "方向无效",
        message: "该方向不在允许的八向枚举内。"
      },
      toX: previewToX,
      toY: previewToY
    });
  }

  const intendedDirection = dir;
  const lostMove = resolveWildernessLostMoveDirection({
    intendedDirection,
    rngLike,
    lostChanceBase: 0.1,
    lostChanceModifierAdditive: 0,
    allowedDirections: [...WILDERNESS_MOVE_DIRECTIONS]
  });
  const actualDir = lostMove.actualDirection;
  const lostMovePlan = {
    lost: lostMove.lost,
    roll: lostMove.roll,
    baseChance: lostMove.baseChance,
    modifierAdditive: lostMove.modifierAdditive,
    finalChance: lostMove.finalChance,
    intendedDirection: lostMove.intendedDirection,
    actualDirection: lostMove.actualDirection
  };
  const lostPlanFields = {
    lostMove: lostMovePlan,
    intendedDirection,
    actualDirection: actualDir
  };
  const delta = getWildernessDirectionDelta(actualDir);
  if (!delta) {
    return baseFailure({
      actionId: aid,
      direction: actualDir,
      wilderness,
      areaId,
      regionId,
      terrainId: null,
      partialBlocker: {
        kind: "bad_direction",
        terrainId: null,
        title: "方向无效",
        message: "无法解析方向增量。"
      },
      toX: previewToX,
      toY: previewToY,
      lostMove,
      intendedDirection
    });
  }

  const fromX = Number.isInteger(wilderness.x) ? wilderness.x : 0;
  const fromY = Number.isInteger(wilderness.y) ? wilderness.y : 0;
  const toX = fromX + delta.x;
  const toY = fromY + delta.y;

  const q = queryWildernessCoordinate(areaSpec, toX, toY);
  // Only true out-of-bounds remains a boundary blocker. The optional
  // active-cell mask is informational and MUST NOT block movement here.
  if (q.kind === "boundary" && q.boundaryKind === "out_of_bounds") {
    return {
      ok: false,
      actionId: aid,
      direction: actualDir,
      ...lostPlanFields,
      from: { x: fromX, y: fromY },
      to: { x: toX, y: toY },
      areaId,
      regionId,
      terrainId: null,
      minutes: 0,
      staminaCost: 0,
      blocker: createBoundaryWildernessBlocker({ areaId, regionId, at: { x: toX, y: toY } }),
      warnings: [],
      report: {
        terrainLabel: null,
        movementText: "边界阻断"
      }
    };
  }

  const terrainDef = q.terrainDef;
  const terrainId = q.terrainId ? String(q.terrainId) : null;

  if (terrainId === "crevasse_field") {
    return {
      ok: false,
      actionId: aid,
      direction: actualDir,
      ...lostPlanFields,
      from: { x: fromX, y: fromY },
      to: { x: toX, y: toY },
      areaId,
      regionId,
      terrainId,
      minutes: 0,
      staminaCost: 0,
      blocker: createTerrainRequirementWildernessBlocker({
        areaId,
        regionId,
        terrainId: "crevasse_field",
        at: { x: toX, y: toY }
      }),
      warnings: [],
      report: {
        terrainLabel: terrainDef?.label || terrainId || "",
        movementText: "裂隙带门槛阻断"
      }
    };
  }

  const foot = String(terrainDef?.passability?.foot || "").trim();
  if (foot === "hard_block" || foot === "forbidden") {
    return {
      ok: false,
      actionId: aid,
      direction: actualDir,
      ...lostPlanFields,
      from: { x: fromX, y: fromY },
      to: { x: toX, y: toY },
      areaId,
      regionId,
      terrainId,
      minutes: 0,
      staminaCost: 0,
      blocker: createTerrainHardWildernessBlocker({
        areaId,
        regionId,
        terrainId,
        at: { x: toX, y: toY }
      }),
      warnings: [],
      report: {
        terrainLabel: terrainDef?.label || terrainId || "",
        movementText: "地貌阻断"
      }
    };
  }

  const regionProfile = regionId ? getWildernessRegionProfile(regionId) : null;
  const minuteOfDay = resolveMinuteOfDayFromTotalMinutes(totalMinutes);
  const weatherInput = worldWeather && typeof worldWeather === "object" ? worldWeather : undefined;
  const surfaceRuntime =
    regionProfile && terrainDef
      ? buildWildernessSurfaceRuntime({
          regionProfile,
          terrainDef,
          worldWeather: weatherInput,
          minuteOfDay
        })
      : null;

  const minutes = calculateWildernessStepMinutes({ areaSpec, terrainDef, surfaceRuntime, direction: actualDir });
  const staminaCost = calculateWildernessStaminaCost({ areaSpec, terrainDef, surfaceRuntime, direction: actualDir });
  // Plan/report-only readouts. truth (x/y/heading/stepsTaken) is unaffected;
  // commit still only consumes plan.minutes and plan.staminaCost. Diagonals
  // carry distanceMult === √2 so downstream consumers (report, contracts) can
  // explain why a NE step took longer than its N counterpart.
  const distanceMult = getWildernessDirectionDistanceMultiplier(actualDir);
  const stepMeters = calculateWildernessStepMeters({ areaSpec, direction: actualDir });
  const terrainLabel = String(terrainDef?.label || terrainId || "");

  // weather_terrain_block: reserved ordering slot (not implemented in Phase 10B).

  const movementPlanDraft = {
    minutes,
    staminaCost,
    terrainId,
    to: { x: toX, y: toY },
    from: { x: fromX, y: fromY }
  };
  const explicitSkipPlayerState = requirePlayerStateCheck === false;

  if (!explicitSkipPlayerState && player == null) {
    const missingBlock = createWildernessPlayerStateBlocker({
      reason: "player_state_missing",
      player: null,
      movementPlanDraft,
      wilderness,
      areaSpec,
      terrainDef
    });
    return {
      ok: false,
      actionId: aid,
      direction: actualDir,
      ...lostPlanFields,
      from: { x: fromX, y: fromY },
      to: { x: toX, y: toY },
      areaId,
      regionId,
      terrainId,
      terrainLabel,
      minutes: 0,
      staminaCost: 0,
      surface: null,
      blocker: missingBlock,
      warnings: [],
      report: {
        terrainLabel,
        movementText: "状态数据缺失"
      }
    };
  }

  const playerStateBlocker = explicitSkipPlayerState
    ? null
    : evaluateWildernessPlayerStateBlocker({
        player,
        movementPlanDraft,
        wilderness,
        areaSpec,
        terrainDef
      });
  if (playerStateBlocker) {
    let movementText = "状态阻断";
    if (playerStateBlocker.blockerId === "player_hp_too_low_block") movementText = "生命状态阻断";
    else if (playerStateBlocker.blockerId === "player_severe_hypothermia_block") movementText = "失温风险阻断";
    else if (playerStateBlocker.blockerId === "player_state_missing_block") movementText = "状态数据缺失";
    return {
      ok: false,
      actionId: aid,
      direction: actualDir,
      ...lostPlanFields,
      from: { x: fromX, y: fromY },
      to: { x: toX, y: toY },
      areaId,
      regionId,
      terrainId,
      terrainLabel,
      minutes: 0,
      staminaCost: 0,
      surface: null,
      blocker: playerStateBlocker,
      warnings: [],
      report: {
        terrainLabel,
        movementText
      }
    };
  }

  // Bug3 (round 2): the resolver now surfaces a deferred-collapse marker
  // for ALL stamina-insufficient cases instead of letting any of them turn
  // into a `player_state_block` blocker dialog. Three branches all map to
  // the same `staminaInsufficient: true` plan flag:
  //   (a) `staminaCost === Infinity` — defensive (terrain should normally
  //       hard-block earlier, but cover the corner).
  //   (b) `0 < stamina < cost` — true partial-stamina collapse; commit
  //       clamps to 0 and the Ethan rescue chain fires via the
  //       stamina_zero crossing detector.
  //   (c) `stamina <= 0` — already-zero holdout; commit re-clamps to 0
  //       (no-op) and the holdout-notice collector surfaces a non-blocker
  //       feedback dialog (Ethan rescue cannot cross, since before == 0).
  // Resolve stays read-only — commit owns all state mutation.
  let staminaInsufficient = false;
  let staminaBefore = null;
  let collapseReason = null;
  if (!explicitSkipPlayerState && player != null) {
    const playerSnap = getWildernessPlayerStateSnapshot(player);
    staminaBefore = playerSnap.stamina;
    const costIsInfinite = staminaCost === Infinity;
    const finiteCost = Number.isFinite(staminaCost) ? Math.max(0, Math.trunc(staminaCost)) : null;
    const staminaNum = Number.isFinite(playerSnap.stamina) ? playerSnap.stamina : 0;
    if (costIsInfinite) {
      staminaInsufficient = true;
      collapseReason = "stamina_cost_unreachable";
    } else if (finiteCost != null && finiteCost > 0 && staminaNum <= 0) {
      staminaInsufficient = true;
      collapseReason = "stamina_already_depleted";
    } else if (finiteCost != null && finiteCost > 0 && staminaNum > 0 && staminaNum < finiteCost) {
      staminaInsufficient = true;
      collapseReason = "stamina_depleted_during_wilderness_move";
    }
  }

  const surfaceSummary = surfaceRuntime
    ? {
        visibilityLevel: surfaceRuntime.visibilityLevel,
        snowDepthCm: surfaceRuntime.snowDepthCm,
        snowDepthMoveMult: surfaceRuntime.snowDepthMoveMult,
        snowDepthStaminaMult: surfaceRuntime.snowDepthStaminaMult
      }
    : null;

  const enterLm = getEnterableLandmarkAtCoordinate({ areaSpec, x: toX, y: toY });
  let landmarkIntercept = null;
  if (enterLm && String(enterLm.gotoMapId || "").trim()) {
    landmarkIntercept = {
      id: String(enterLm.id),
      label: String(enterLm.label || enterLm.id),
      gotoMapId: String(enterLm.gotoMapId).trim(),
      at: { x: enterLm.x, y: enterLm.y }
    };
  }
  const landmarkCues = listLandmarkCuesForCoordinate({ areaSpec, x: toX, y: toY });
  let landmarkSummary = null;
  if (landmarkIntercept) {
    landmarkSummary = `已进入「${landmarkIntercept.label}」`;
  } else if (landmarkCues.length > 0) {
    landmarkSummary = `附近地标：${landmarkCues.map((c) => c.label).join("、")}`;
  }

  return {
    ok: true,
    actionId: aid,
    direction: actualDir,
    ...lostPlanFields,
    from: { x: fromX, y: fromY },
    to: { x: toX, y: toY },
    areaId,
    regionId,
    terrainId,
    terrainLabel,
    minutes,
    staminaCost,
    distanceMult,
    stepMeters,
    staminaInsufficient,
    staminaBefore,
    collapseReason,
    landmarkIntercept,
    surface: surfaceRuntime
      ? {
          snowDepthCm: surfaceRuntime.snowDepthCm,
          visibilityLevel: surfaceRuntime.visibilityLevel,
          snowDepthMoveMult: surfaceRuntime.snowDepthMoveMult,
          snowDepthStaminaMult: surfaceRuntime.snowDepthStaminaMult,
          trailLossMult: surfaceRuntime.trailLossMult,
          probeConfidenceMult: surfaceRuntime.probeConfidenceMult
        }
      : null,
    blocker: null,
    warnings: [],
    report: {
      terrainLabel,
      movementText: `向 ${actualDir} 进入 ${terrainLabel}`,
      surfaceSummary,
      landmarkSummary
    }
  };
}
