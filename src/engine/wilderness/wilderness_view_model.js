import { getWildernessAreaSpec } from "./wilderness_area_registry.js";
import { queryWildernessCoordinate } from "./wilderness_area_query.js";
import { listLandmarkCuesForCoordinate, getEnterableLandmarkAtCoordinate } from "./wilderness_area_query.js";
import { getWildernessRegionProfile } from "./wilderness_region_registry.js";
import { getTerrainBiomeDef } from "./wilderness_terrain_registry.js";
import { isWildernessActive } from "./wilderness_state.js";
import { WILDERNESS_MOVE_DIRECTIONS } from "./wilderness_movement_cost.js";
import {
  buildWildernessSurfaceRuntime,
  normalizeWildernessWeatherSnapshot,
  getVisibilityLevelFromWeather
} from "./wilderness_surface_runtime.js";
import { buildWildernessProbeResults } from "./wilderness_probe_service.js";
import { buildWildernessWeatherForecast } from "./wilderness_weather_forecast.js";
import { buildWildernessToolReadoutCards } from "./wilderness_tool_readout_vm.js";
import { GetTimePhase } from "../time_phases.js";
import {
  buildWildernessRuntimeDescription,
  mapSurfaceVisibilityToRuntimeTextBand
} from "./wilderness_runtime_description.js";
import { TERRAIN_RUNTIME_TEXT, AREA_RUNTIME_TEXT } from "../../../data/wilderness/runtime_text/index.js";

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

function wildernessReturnStepSessionFields(w) {
  const dirs = new Set(WILDERNESS_MOVE_DIRECTIONS);
  const rdRaw = String(w?.returnDirection ?? "").trim().toUpperCase();
  const returnDirection = dirs.has(rdRaw) ? rdRaw : "";
  const footprintDirection = returnDirection;
  const lmdRaw = String(w?.lastMoveDirection ?? "").trim().toUpperCase();
  const lastMoveDirection = dirs.has(lmdRaw) ? lmdRaw : "";
  const pp = w?.previousPosition;
  const previousPosition =
    pp && typeof pp === "object" && Number.isInteger(pp.x) && Number.isInteger(pp.y)
      ? { x: pp.x, y: pp.y }
      : null;
  return { returnDirection, footprintDirection, lastMoveDirection, previousPosition };
}

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
    kind: "WILDERNESS_MOVE",
    direction: dir,
    directionLabel: dir,
    uiGroup: "wilderness_movement",
    disabled: false
  }));
  return [
    ...moves,
    { id: "wilderness_end_return_fallback", label: "返回前哨", kind: "WILDERNESS_END_SESSION", uiGroup: "wilderness_actions", disabled: false }
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
    // Hard blocks (true bounds boundary, sea, other hard terrain) hide the
    // direction button. The renderer must not re-derive this; it consumes
    // `hidden` + `blockerStyle` only.
    const isHardBoundary = probe ? probe.passability === "boundary" : false;
    const isHardBlock = probe ? probe.hardBlock === true : false;
    const hidden = isHardBoundary || isHardBlock;
    const blockerStyle = probe && typeof probe.blockerStyle === "string" ? probe.blockerStyle : null;
    return { ...a, probe, hidden, blockerStyle };
  });
}

function freezePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyDescriptionParts() {
  return { terrainText: "", timeText: "", distantViewText: "" };
}

function computeWildernessRuntimeTextAxes(gameState, surfaceRuntime) {
  const tmRaw = gameState?.time?.totalMinutes;
  const tmNum = Number(tmRaw);
  const minuteOfDay = Number.isFinite(tmNum) ? ((Math.trunc(tmNum) % 1440) + 1440) % 1440 : 0;
  const timePhase = String(GetTimePhase(minuteOfDay) || "")
    .trim()
    .toLowerCase();
  const visLevel =
    surfaceRuntime && String(surfaceRuntime.visibilityLevel || "").trim() !== ""
      ? String(surfaceRuntime.visibilityLevel)
      : getVisibilityLevelFromWeather(normalizeWildernessWeatherSnapshot(gameState?.world?.weather ?? {}));
  const visibilityBand = mapSurfaceVisibilityToRuntimeTextBand(visLevel);
  return { timePhase, visibilityBand };
}

function finalizeWildernessVm(gameState, vm) {
  const toolReadouts = buildWildernessToolReadoutCards(gameState, vm);
  return freezePlain({
    ...vm,
    toolReadouts
  });
}

function inactiveVm(gameState) {
  return finalizeWildernessVm(gameState || {}, {
    active: false,
    status: "inactive",
    title: "野外",
    description: "当前没有进行中的野外会话。",
    descriptionParts: emptyDescriptionParts(),
    descriptionWarnings: [],
    session: null,
    terrain: null,
    climate: null,
    surface: null,
    actions: [],
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
    return inactiveVm(gameState);
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
  const returnStep = wildernessReturnStepSessionFields(w);

  const areaSpec = areaId ? getWildernessAreaSpec(areaId) : null;
  if (!areaSpec) {
    return finalizeWildernessVm(gameState, {
      active: true,
      status: "invalid_area",
      title: "野外",
      description: "野外区域数据缺失或无效。",
      descriptionParts: emptyDescriptionParts(),
      descriptionWarnings: [],
      session: null,
      terrain: null,
      climate: null,
      surface: null,
      actions: [...PLACEHOLDER_ACTIONS],
      probes: [],
      weatherForecast: null,
      warnings: [areaId || "missing_areaId"]
    });
  }

  const regionProfile = regionId ? getWildernessRegionProfile(regionId) : null;
  if (!regionProfile) {
    return finalizeWildernessVm(gameState, {
      active: true,
      status: "invalid_region",
      title: "野外",
      description: "区域气候基线缺失或无效。",
      descriptionParts: emptyDescriptionParts(),
      descriptionWarnings: [],
      session: null,
      terrain: null,
      climate: null,
      surface: null,
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
    const body = String(desc.body || "");
    return finalizeWildernessVm(gameState, {
      active: true,
      status: "boundary",
      title: "野外",
      description: body,
      descriptionParts: { terrainText: body, timeText: "", distantViewText: "" },
      descriptionWarnings: [],
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
        lostness,
        ...returnStep
      },
      terrain: null,
      climate: null,
      surface: null,
      actions: attachProbesToRuntimeActions(buildWildernessRuntimeMapActions(), []),
      probes: [],
      weatherForecast: null,
      warnings: ["boundary"]
    });
  }

  const terrainId = q.terrainId;
  const terrainDef = terrainId ? getTerrainBiomeDef(terrainId) : null;
  if (!terrainDef) {
    return finalizeWildernessVm(gameState, {
      active: true,
      status: "invalid_terrain",
      title: "野外",
      description: "当前地貌定义缺失或无效。",
      descriptionParts: emptyDescriptionParts(),
      descriptionWarnings: [],
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
        lostness,
        ...returnStep
      },
      terrain: null,
      climate: null,
      surface: null,
      actions: attachProbesToRuntimeActions(buildWildernessRuntimeMapActions(), []),
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

  const descMeta = pickDescription(areaId, true, regionProfile.label, areaSpec.label);

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

  const axes = computeWildernessRuntimeTextAxes(gameState, surfaceRuntime);
  const runtimeDesc = buildWildernessRuntimeDescription({
    areaId,
    terrainId: terrainDef.id,
    timePhase: axes.timePhase,
    visibilityBand: axes.visibilityBand,
    terrainRuntimeTextRegistry: TERRAIN_RUNTIME_TEXT,
    areaRuntimeTextRegistry: AREA_RUNTIME_TEXT,
    fallbackText: descMeta.body,
    areaSpec,
    originX: x,
    originY: y,
    heading
  });

  const probes = buildWildernessProbeResults({
    wilderness: w,
    areaSpec,
    regionProfile,
    worldWeather,
    totalMinutes
  });
  const actions = attachProbesToRuntimeActions(buildWildernessRuntimeMapActions(), probes);

  const landmarkCues = listLandmarkCuesForCoordinate({ areaSpec, x, y });
  const enterableLandmark = getEnterableLandmarkAtCoordinate({ areaSpec, x, y });
  const bestCue = landmarkCues && landmarkCues.length ? landmarkCues[0] : null;

  const toShortLabel = (label) => {
    const s = String(label || "").trim();
    if (!s) return "";
    return s.length > 8 ? s.slice(0, 8) : s;
  };

  const currentMapEntryVm = (bestCue && bestCue.gotoMapId)
    ? {
        exists: true,
        enterable: !!enterableLandmark && String(enterableLandmark.id || "") === String(bestCue.id || ""),
        id: String(bestCue.id || "").trim(),
        label: String(bestCue.label || bestCue.id || "").trim(),
        shortLabel: toShortLabel(bestCue.label || bestCue.id),
        mapId: String(bestCue.gotoMapId || "").trim(),
        x: Number.isFinite(Number(enterableLandmark?.x)) ? Number(enterableLandmark.x) : null,
        y: Number.isFinite(Number(enterableLandmark?.y)) ? Number(enterableLandmark.y) : null,
        distance: Number.isFinite(Number(bestCue.distance)) ? Number(bestCue.distance) : null,
        actionId: enterableLandmark
          ? `wilderness_enter_${String(bestCue.id || "").trim()}`
          : null
      }
    : { exists: false };

  const weatherForecast = buildWildernessWeatherForecast({
    wilderness: w,
    areaSpec,
    regionProfile,
    terrainDef,
    surfaceRuntime,
    worldWeather,
    totalMinutes: totalMinutes == null ? 0 : totalMinutes
  });

  return finalizeWildernessVm(gameState, {
    active: true,
    status: "ready",
    title: "野外",
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
      lostness,
      ...returnStep
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
    description: runtimeDesc.description,
    descriptionParts: {
      terrainText: runtimeDesc.terrainText,
      timeText: runtimeDesc.timeText,
      distantViewText: runtimeDesc.distantViewText
    },
    descriptionWarnings: Array.isArray(runtimeDesc.warnings) ? runtimeDesc.warnings : [],
    actions,
    probes,
    currentMapEntryVm,
    weatherForecast,
    warnings: []
  });
}
