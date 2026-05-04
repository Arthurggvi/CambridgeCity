import { getWildernessAreaSpec } from "./wilderness_area_registry.js";
import { queryWildernessCoordinate } from "./wilderness_area_query.js";
import { getWildernessRegionProfile } from "./wilderness_region_registry.js";
import { getTerrainBiomeDef } from "./wilderness_terrain_registry.js";
import { isWildernessActive } from "./wilderness_state.js";
import { WILDERNESS_MOVE_DIRECTIONS } from "./wilderness_movement_cost.js";
import { buildWildernessSurfaceRuntime } from "./wilderness_surface_runtime.js";
import { buildWildernessProbeResults } from "./wilderness_probe_service.js";
import { buildWildernessWeatherForecast } from "./wilderness_weather_forecast.js";

const PLACEHOLDER_ACTIONS = Object.freeze([
  {
    id: "wilderness_placeholder_observe",
    label: "观察周围",
    disabled: true,
    reason: "野外观察将在探读阶段接入"
  },
  {
    id: "wilderness_placeholder_return",
    label: "返回前哨",
    disabled: true,
    reason: "返回行为将在移动阶段接入"
  }
]);

const MOVE_DIR_LABEL = Object.freeze({
  N: "北",
  NE: "东北",
  E: "东",
  SE: "东南",
  S: "南",
  SW: "西南",
  W: "西",
  NW: "西北"
});

function surfaceSummaryFromRuntime(rt) {
  if (!rt || typeof rt !== "object") return null;
  return {
    visibilityLevel: rt.visibilityLevel,
    snowDepthCm: rt.snowDepthCm,
    trailRetention: rt.trailRetention,
    probeConfidenceMult: rt.probeConfidenceMult
  };
}

function buildWildernessRuntimeMapActions() {
  const moves = WILDERNESS_MOVE_DIRECTIONS.map((dir) => ({
    id: `wilderness_move_${dir}`,
    label: `向${MOVE_DIR_LABEL[dir] || dir}移动`,
    disabled: false
  }));
  return [
    ...moves,
    { id: "wilderness_end_return_fallback", label: "返回前哨", disabled: false }
  ];
}

function attachProbesToRuntimeActions(actions, probes) {
  const byDir = {};
  if (Array.isArray(probes)) {
    for (const p of probes) {
      if (p && typeof p === "object" && p.direction) byDir[String(p.direction)] = p;
    }
  }
  return actions.map((a) => {
    if (typeof a.id !== "string" || !a.id.startsWith("wilderness_move_")) return { ...a };
    const dir = a.id.slice("wilderness_move_".length);
    const probe = byDir[dir] != null ? byDir[dir] : null;
    return { ...a, probe };
  });
}

function freezePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function inactiveVm() {
  return freezePlain({
    active: false,
    status: "inactive",
    title: "野外",
    description: {
      title: "野外",
      body: "当前没有进行中的野外会话。"
    },
    probes: [],
    weatherForecast: null,
    warnings: []
  });
}

function pickDescription(areaId, inBounds, regionLabel, areaLabel) {
  if (areaId === "west2_old_marker_patrol_line") {
    if (inBounds) {
      return {
        title: "旧标记杆巡查线",
        body: "你站在前哨外的压实雪面上，旧标记杆从开发带边缘向风雪深处延伸。"
      };
    }
    return {
      title: "旧标记杆巡查线",
      body: "你已离开该区域已定义的坐标边界。"
    };
  }
  return {
    title: areaLabel || "野外",
    body: `${regionLabel || "未知区域"} · ${areaLabel || areaId || "野外"}`
  };
}

export function buildWildernessViewModel(gameState) {
  const w = gameState?.world?.wilderness;
  if (!isWildernessActive(w)) {
    return inactiveVm();
  }

  const areaId = typeof w.areaId === "string" ? w.areaId.trim() : "";
  const regionId = typeof w.regionId === "string" ? w.regionId.trim() : "";
  const x = Number.isInteger(w.x) ? w.x : 0;
  const y = Number.isInteger(w.y) ? w.y : 0;
  const heading = typeof w.heading === "string" ? w.heading : "N";
  const sessionState = typeof w.state === "string" ? w.state : "INACTIVE";
  const stepsTaken = Number.isFinite(Number(w.stepsTaken)) ? Math.max(0, Math.trunc(Number(w.stepsTaken))) : 0;
  const trailConfidence = Number.isFinite(Number(w.trailConfidence)) ? Math.max(0, Math.min(100, Math.trunc(Number(w.trailConfidence)))) : 0;
  const visibilityConfidence = Number.isFinite(Number(w.visibilityConfidence))
    ? Math.max(0, Math.min(100, Math.trunc(Number(w.visibilityConfidence))))
    : 0;
  const lostness = Number.isFinite(Number(w.lostness)) ? Math.max(0, Math.min(100, Math.trunc(Number(w.lostness)))) : 0;

  const areaSpec = areaId ? getWildernessAreaSpec(areaId) : null;
  if (!areaSpec) {
    return freezePlain({
      active: true,
      status: "invalid_area",
      title: "野外",
      description: { title: "野外", body: "野外区域数据缺失或无效。" },
      actions: [...PLACEHOLDER_ACTIONS],
      probes: [],
      weatherForecast: null,
      warnings: [areaId || "missing_areaId"]
    });
  }

  const regionProfile = regionId ? getWildernessRegionProfile(regionId) : null;
  if (!regionProfile) {
    return freezePlain({
      active: true,
      status: "invalid_region",
      title: "野外",
      description: { title: "野外", body: "区域气候基线缺失或无效。" },
      actions: [...PLACEHOLDER_ACTIONS],
      probes: [],
      weatherForecast: null,
      warnings: [regionId || "missing_regionId"]
    });
  }

  const q = queryWildernessCoordinate(areaSpec, x, y);
  const inBounds = q.insideBounds === true;
  if (!inBounds || q.kind === "boundary") {
    const desc = pickDescription(areaId, false, regionProfile.label, areaSpec.label);
    return freezePlain({
      active: true,
      status: "boundary",
      title: desc.title,
      description: desc,
      session: {
        state: sessionState,
        areaId,
        areaLabel: areaSpec.label,
        regionId,
        regionLabel: regionProfile.label,
        x,
        y,
        heading,
        stepsTaken,
        trailConfidence,
        visibilityConfidence,
        lostness
      },
      terrain: null,
      climate: null,
      actions: buildWildernessRuntimeMapActions(),
      probes: [],
      weatherForecast: null,
      warnings: ["boundary"]
    });
  }

  const terrainId = q.terrainId;
  const terrainDef = terrainId ? getTerrainBiomeDef(terrainId) : null;
  if (!terrainDef) {
    return freezePlain({
      active: true,
      status: "invalid_terrain",
      title: "野外",
      description: { title: "野外", body: "当前地貌定义缺失或无效。" },
      session: {
        state: sessionState,
        areaId,
        areaLabel: areaSpec.label,
        regionId,
        regionLabel: regionProfile.label,
        x,
        y,
        heading,
        stepsTaken,
        trailConfidence,
        visibilityConfidence,
        lostness
      },
      terrain: null,
      climate: null,
      actions: buildWildernessRuntimeMapActions(),
      probes: [],
      weatherForecast: null,
      warnings: [String(terrainId || "")]
    });
  }

  const c = regionProfile.climate;
  const climate = {
    T_base: c.T_base,
    WindBase: c.WindBase,
    WindDir_prevailing: c.WindDir_prevailing,
    MoistureIndex: c.MoistureIndex
  };

  const desc = pickDescription(areaId, true, regionProfile.label, areaSpec.label);

  const worldWeather = gameState?.world?.weather && typeof gameState.world.weather === "object" ? gameState.world.weather : {};
  const tmRaw = gameState?.time?.totalMinutes;
  const tmNum = Number(tmRaw);
  const totalMinutes = Number.isFinite(tmNum) ? tmNum : null;
  const minuteOfDay = Number.isFinite(tmNum) ? ((Math.trunc(tmNum) % 1440) + 1440) % 1440 : null;
  const surfaceRuntime = buildWildernessSurfaceRuntime({
    regionProfile,
    terrainDef,
    worldWeather,
    minuteOfDay
  });
  const surface = surfaceSummaryFromRuntime(surfaceRuntime);

  const probes = buildWildernessProbeResults({
    wilderness: w,
    areaSpec,
    regionProfile,
    worldWeather,
    totalMinutes
  });
  const actions = attachProbesToRuntimeActions(buildWildernessRuntimeMapActions(), probes);

  const weatherForecast = buildWildernessWeatherForecast({
    wilderness: w,
    areaSpec,
    regionProfile,
    terrainDef,
    surfaceRuntime,
    worldWeather,
    totalMinutes: totalMinutes == null ? 0 : totalMinutes
  });

  return freezePlain({
    active: true,
    status: "ready",
    title: desc.title,
    session: {
      state: sessionState,
      areaId,
      areaLabel: areaSpec.label,
      regionId,
      regionLabel: regionProfile.label,
      x,
      y,
      heading,
      stepsTaken,
      trailConfidence,
      visibilityConfidence,
      lostness
    },
    terrain: {
      terrainId: terrainDef.id,
      label: terrainDef.label,
      passability: {
        foot: terrainDef.passability.foot,
        vehicle: terrainDef.passability.vehicle
      },
      move: {
        moveTimeMult: terrainDef.move.moveTimeMult,
        staminaCostMult: terrainDef.move.staminaCostMult
      },
      hazard: {
        fallRisk: terrainDef.hazard.fallRisk,
        disorientationRisk: terrainDef.hazard.disorientationRisk,
        rescueDifficulty: terrainDef.hazard.rescueDifficulty
      }
    },
    climate,
    surface,
    description: desc,
    actions,
    probes,
    weatherForecast,
    warnings: []
  });
}
