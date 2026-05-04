import { queryWildernessCoordinate } from "./wilderness_area_query.js";
import {
  calculateWildernessStaminaCost,
  calculateWildernessStepMinutes,
  getWildernessDirectionDelta,
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

function baseFailure({ actionId, direction, wilderness, areaId, regionId, terrainId, partialBlocker, toX, toY }) {
  const wx = Number.isInteger(wilderness?.x) ? wilderness.x : 0;
  const wy = Number.isInteger(wilderness?.y) ? wilderness.y : 0;
  const nx = Number.isFinite(Number(toX)) ? Math.trunc(Number(toX)) : wx;
  const ny = Number.isFinite(Number(toY)) ? Math.trunc(Number(toY)) : wy;
  const blocker = normalizeWildernessBlocker(partialBlocker, {
    areaId,
    regionId,
    at: { x: nx, y: ny }
  });
  return {
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
  totalMinutes
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

  const delta = getWildernessDirectionDelta(dir);
  if (!delta) {
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
        message: "无法解析方向增量。"
      },
      toX: previewToX,
      toY: previewToY
    });
  }

  const fromX = Number.isInteger(wilderness.x) ? wilderness.x : 0;
  const fromY = Number.isInteger(wilderness.y) ? wilderness.y : 0;
  const toX = fromX + delta.x;
  const toY = fromY + delta.y;

  const q = queryWildernessCoordinate(areaSpec, toX, toY);
  if (!q.insideBounds || q.kind === "boundary") {
    return {
      ok: false,
      actionId: aid,
      direction: dir,
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
      direction: dir,
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
      direction: dir,
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

  const minutes = calculateWildernessStepMinutes({ areaSpec, terrainDef, surfaceRuntime });
  const staminaCost = calculateWildernessStaminaCost({ areaSpec, terrainDef, surfaceRuntime });
  const terrainLabel = String(terrainDef?.label || terrainId || "");

  const surfaceSummary = surfaceRuntime
    ? {
        visibilityLevel: surfaceRuntime.visibilityLevel,
        snowDepthCm: surfaceRuntime.snowDepthCm,
        snowDepthMoveMult: surfaceRuntime.snowDepthMoveMult,
        snowDepthStaminaMult: surfaceRuntime.snowDepthStaminaMult
      }
    : null;

  return {
    ok: true,
    actionId: aid,
    direction: dir,
    from: { x: fromX, y: fromY },
    to: { x: toX, y: toY },
    areaId,
    regionId,
    terrainId,
    terrainLabel,
    minutes,
    staminaCost,
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
      movementText: `向 ${dir} 进入 ${terrainLabel}`,
      surfaceSummary
    }
  };
}
