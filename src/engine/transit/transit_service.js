import { getTransitRegistry } from "./transit_registry.js";
import { getWorldTimeContext } from "../time.js";

const VALID_DIRECTIONS = new Set([-1, 1]);
export const BUS_ONBOARD_MAP_ID = "west2_bus_onboard";
const BOARD_LOG_LINE = "车门合上，暖风和玻璃边那层薄雾一起压了上来。";
const ARRIVAL_LOG_LINE = "车停稳了，门边的提示灯亮起。";
const REVERSE_LOG_LINE = "到终点后，门开又合，灯牌改成返程。";
const TRANSIT_SERVICE_SUSPENDED = "当前线路暂停运行。";
const TRANSIT_SERVICE_SUSPENDED_WHITEOUT = "窗外被白亮压住，当前不能继续乘坐。";

const BOARD_DIRECTION_LABELS = Object.freeze({
  west2_shuttle_line_01: Object.freeze({
    stop_winddyke: Object.freeze({
      1: "热廊方向"
    }),
    stop_heatcorridor: Object.freeze({
      "-1": "风堤街方向",
      1: "工业区方向"
    }),
    stop_industrial: Object.freeze({
      "-1": "热廊方向",
      1: "钢十字港口方向"
    }),
    stop_steelcross_port: Object.freeze({
      "-1": "工业区方向",
      1: "前哨方向"
    }),
    stop_outpost: Object.freeze({
      "-1": "钢十字港口方向"
    })
  })
});

function normalizeDirection(direction) {
  const numericDirection = Number(direction);
  if (!VALID_DIRECTIONS.has(numericDirection)) return null;
  return numericDirection;
}

function getLineStopIndex(line, stopId) {
  if (!line || !Array.isArray(line.stopIds)) return -1;
  return line.stopIds.indexOf(String(stopId || ""));
}

function getAdjacentStopId(line, stopId, direction) {
  const index = getLineStopIndex(line, stopId);
  if (index < 0) return null;
  const nextIndex = index + direction;
  return line.stopIds[nextIndex] || null;
}

function getSegmentMinutesForIndex(line, segmentIndex) {
  const minutes = Array.isArray(line?.segmentMinutes)
    ? Number(line.segmentMinutes[segmentIndex])
    : Number(line?.segmentMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return 2;
  return Math.max(1, Math.floor(minutes));
}

function toLowerKey(value) {
  return String(value || "").trim().toLowerCase();
}

function getTransitWeatherKey(gameState) {
  const worldTimeContext = getWorldTimeContext();
  const lightPhase = toLowerKey(worldTimeContext?.illumination?.lightPhase);
  if (lightPhase === "whiteout") return "whiteout";

  const weather = gameState?.world?.weather || gameState?.weather || {};
  const isSnowing = weather?.isSnowing === true || Number(weather?.snowfallRate || 0) > 0;
  if (isSnowing) return "snowfall";

  const windSpeedLocal = Number(weather?.windSpeed_local ?? weather?.windSpeedLocal ?? gameState?.world?.windSpeed ?? 0);
  const stormIntensity = Number(weather?.stormIntensity || 0);
  if (windSpeedLocal >= 12 || stormIntensity >= 0.62) return "highwind";

  return "normal";
}

function getSegmentMinutesForWeather(line, segmentIndex, weatherKey) {
  const weatherSegmentMinutes = line?.weatherSegmentMinutes;
  if (weatherKey && weatherKey !== "normal" && weatherSegmentMinutes && typeof weatherSegmentMinutes === "object") {
    const overrideMinutes = Array.isArray(weatherSegmentMinutes[weatherKey])
      ? Number(weatherSegmentMinutes[weatherKey][segmentIndex])
      : Number(weatherSegmentMinutes[weatherKey]);
    if (Number.isFinite(overrideMinutes) && overrideMinutes > 0) {
      return Math.max(1, Math.floor(overrideMinutes));
    }
  }
  return getSegmentMinutesForIndex(line, segmentIndex);
}

function getTransitServiceSuspension(line, gameState) {
  const weatherKey = getTransitWeatherKey(gameState);
  const suspendedWeatherKeys = Array.isArray(line?.suspendedWeatherKeys)
    ? line.suspendedWeatherKeys.map((value) => toLowerKey(value)).filter(Boolean)
    : [];

  if (!suspendedWeatherKeys.includes(weatherKey)) {
    return {
      suspended: false,
      weatherKey
    };
  }

  return {
    suspended: true,
    weatherKey,
    code: weatherKey === "whiteout" ? "TRANSIT_SERVICE_SUSPENDED_WHITEOUT" : "TRANSIT_SERVICE_SUSPENDED",
    reason: weatherKey === "whiteout" ? TRANSIT_SERVICE_SUSPENDED_WHITEOUT : TRANSIT_SERVICE_SUSPENDED
  };
}

function buildInvalidResult(code, reason, extra = {}) {
  return {
    ok: false,
    code,
    reason,
    ...extra
  };
}

export function getStopById(stopId) {
  return getTransitRegistry().stopById.get(String(stopId || "")) || null;
}

export function getLineById(lineId) {
  return getTransitRegistry().lineById.get(String(lineId || "")) || null;
}

export function getDefaultLineIdForStop(stopId) {
  const stop = getStopById(stopId);
  return String(stop?.lineIds?.[0] || "").trim() || null;
}

export function hasImplementedStopMap(stopId) {
  const stop = getStopById(stopId);
  return !!String(stop?.mapId || "").trim();
}

export function getReversedDirection(direction) {
  const normalized = normalizeDirection(direction);
  return normalized == null ? null : normalized * -1;
}

export function isTerminalStop(stopId, lineId) {
  const line = getLineById(lineId);
  const index = getLineStopIndex(line, stopId);
  if (index < 0) return false;
  return index === 0 || index === line.stopIds.length - 1;
}

export function getAvailableBoardDirections(stopId, lineId) {
  const stop = getStopById(stopId);
  const line = getLineById(lineId);
  if (!stop || !line) return [];
  if (!Array.isArray(stop.lineIds) || !stop.lineIds.includes(line.lineId)) return [];

  return (Array.isArray(stop.directionMask) ? stop.directionMask : [])
    .map((direction) => normalizeDirection(direction))
    .filter((direction) => direction != null)
    .filter((direction, index, list) => list.indexOf(direction) === index)
    .filter((direction) => !!getAdjacentStopId(line, stopId, direction));
}

export function getBoardDirectionLabel(stopId, lineId, direction) {
  const normalizedDirection = normalizeDirection(direction);
  if (normalizedDirection == null) return "未知方向";

  const label = BOARD_DIRECTION_LABELS[String(lineId || "")]?.[String(stopId || "")]?.[String(normalizedDirection)]
    || BOARD_DIRECTION_LABELS[String(lineId || "")]?.[String(stopId || "")]?.[normalizedDirection];
  if (label) return String(label);

  const line = getLineById(lineId);
  const nextStopId = getAdjacentStopId(line, stopId, normalizedDirection);
  const nextStop = getStopById(nextStopId);
  return nextStop ? `${nextStop.name}方向` : "未知方向";
}

export function getRideDirectionLabel(ride) {
  if (!ride || typeof ride !== "object") return "未知方向";
  const line = getLineById(ride.lineId);
  const currentStop = getStopById(ride.currentStopId);
  const direction = normalizeDirection(ride.direction);
  if (!line || !currentStop || direction == null) return "未知方向";

  if (ride.nextStopId) {
    const nextStop = getStopById(ride.nextStopId);
    if (nextStop) return `往${nextStop.name}`;
  }

  const terminalIndex = direction > 0 ? line.stopIds.length - 1 : 0;
  const terminalStop = getStopById(line.stopIds[terminalIndex]);
  return terminalStop ? `往${terminalStop.name}` : `往${currentStop.name}`;
}

export function readTransitOnboardMiniMapState(state) {
  if (String(state?.currentMapId || "") !== BUS_ONBOARD_MAP_ID) return null;

  const ride = state?.player?.transit?.ride;
  if (!ride || typeof ride !== "object" || ride.isOnboard !== true) return null;

  const lineId = String(ride.lineId || "").trim();
  const currentStopId = String(ride.currentStopId || "").trim();
  const nextStopId = String(ride.nextStopId || "").trim() || null;
  const line = getLineById(lineId);
  const currentStop = getStopById(currentStopId);
  const nextStop = getStopById(nextStopId);

  if (!line || !currentStop) return null;

  return {
    lineId,
    currentStopId,
    nextStopId,
    line,
    currentStop,
    nextStop
  };
}

export function buildBoardPlan({ stopId, lineId, direction, gameState } = {}) {
  const stop = getStopById(stopId);
  const resolvedLineId = String(lineId || getDefaultLineIdForStop(stopId) || "");
  const line = getLineById(resolvedLineId);
  const normalizedDirection = normalizeDirection(direction);
  const activeRide = gameState?.player?.transit?.ride || null;

  if (activeRide) {
    return buildInvalidResult("TRANSIT_RIDE_ALREADY_ACTIVE", "当前已在车上。", {
      stop,
      line
    });
  }

  if (!stop) {
    return buildInvalidResult("TRANSIT_STOP_NOT_FOUND", `未找到站点：${String(stopId || "")}`);
  }

  if (!line) {
    return buildInvalidResult("TRANSIT_LINE_NOT_FOUND", `未找到线路：${resolvedLineId}`);
  }

  if (String(stop.mapId || "") !== String(gameState?.currentMapId || "")) {
    return buildInvalidResult("TRANSIT_STOP_MAP_MISMATCH", "当前地图与站点不匹配。", {
      stop,
      line
    });
  }

  const availableDirections = getAvailableBoardDirections(stop.stopId, line.lineId);
  if (!availableDirections.includes(normalizedDirection)) {
    return buildInvalidResult("TRANSIT_DIRECTION_UNAVAILABLE", "该站点当前不可按此方向上车。", {
      stop,
      line,
      availableDirections
    });
  }

  const nextStopId = getAdjacentStopId(line, stop.stopId, normalizedDirection);
  const boardedAtMinute = Math.max(0, Math.floor(Number(gameState?.time?.totalMinutes ?? 0)));

  return {
    ok: true,
    stop,
    line,
    nextStopId,
    direction: normalizedDirection,
    ride: Object.freeze({
      lineId: line.lineId,
      direction: normalizedDirection,
      currentStopId: stop.stopId,
      nextStopId,
      isOnboard: true
    }),
    fareCents: Number(line?.fareCents?.board ?? 0),
    logLine: BOARD_LOG_LINE
  };
}

export function buildContinuePlan({ ride, gameState } = {}) {
  if (!ride || typeof ride !== "object") {
    return buildInvalidResult("TRANSIT_RIDE_MISSING", "当前不在车上。", {
      ride: null
    });
  }

  const line = getLineById(ride.lineId);
  const currentStop = getStopById(ride.currentStopId);
  const currentDirection = normalizeDirection(ride.direction);
  if (!line || !currentStop || currentDirection == null) {
    return buildInvalidResult("TRANSIT_RIDE_INVALID", "当前乘车状态无效。", {
      ride,
      line,
      currentStop
    });
  }

  const currentIndex = getLineStopIndex(line, currentStop.stopId);
  if (currentIndex < 0) {
    return buildInvalidResult("TRANSIT_STOP_NOT_ON_LINE", "当前站点不在线路上。", {
      ride,
      line,
      currentStop
    });
  }

  let outboundDirection = currentDirection;
  let nextIndex = currentIndex + outboundDirection;
  let willReverse = false;

  const suspension = getTransitServiceSuspension(line, gameState);
  if (suspension.suspended) {
    return buildInvalidResult(suspension.code || "TRANSIT_SERVICE_SUSPENDED", suspension.reason || TRANSIT_SERVICE_SUSPENDED, {
      ride,
      line,
      currentStop,
      weatherKey: suspension.weatherKey
    });
  }

  if (nextIndex < 0 || nextIndex >= line.stopIds.length) {
    outboundDirection = getReversedDirection(currentDirection);
    nextIndex = currentIndex + outboundDirection;
    willReverse = true;
  }

  if (nextIndex < 0 || nextIndex >= line.stopIds.length) {
    return buildInvalidResult("TRANSIT_NO_NEXT_STOP", "当前方向没有可前往的下一站。", {
      ride,
      line,
      currentStop
    });
  }

  const arrivalStopId = line.stopIds[nextIndex];
  const arrivalStop = getStopById(arrivalStopId);
  const futureNextIndex = nextIndex + outboundDirection;
  const futureNextStopId = line.stopIds[futureNextIndex] || null;
  const segmentIndex = Math.min(currentIndex, nextIndex);
  const weatherKey = suspension.weatherKey || getTransitWeatherKey(gameState);
  const minutes = getSegmentMinutesForWeather(line, segmentIndex, weatherKey);

  return {
    ok: true,
    line,
    currentStop,
    arrivalStop,
    currentDirection,
    direction: outboundDirection,
    willReverse,
    minutes,
    fareCents: Number(line?.fareCents?.continue ?? 0),
    weatherKey,
    arrivalStopId,
    arrivalRide: Object.freeze({
      lineId: line.lineId,
      direction: outboundDirection,
      currentStopId: arrivalStopId,
      nextStopId: futureNextStopId,
      isOnboard: true
    }),
    reverseLogLine: willReverse ? REVERSE_LOG_LINE : "",
    arrivalLogLine: arrivalStop ? ARRIVAL_LOG_LINE : ""
  };
}

export function buildGetOffPlan({ ride } = {}) {
  if (!ride || typeof ride !== "object") {
    return buildInvalidResult("TRANSIT_RIDE_MISSING", "当前不在车上。", {
      ride: null
    });
  }

  const stop = getStopById(ride.currentStopId);
  const line = getLineById(ride.lineId);
  if (!stop || !line) {
    return buildInvalidResult("TRANSIT_RIDE_INVALID", "当前乘车状态无效。", {
      ride,
      stop,
      line
    });
  }

  return {
    ok: true,
    stop,
    line,
    targetMapId: stop.mapId,
    fareCents: Number(line?.fareCents?.getOff ?? 0),
    logLine: `你在${stop.name}下了车。`
  };
}

export function resolveSegmentTravelMinutes({ lineId, fromStopId, toStopId, gameState } = {}) {
  const line = getLineById(lineId);
  if (!line) return 2;
  const fromIndex = getLineStopIndex(line, fromStopId);
  const toIndex = getLineStopIndex(line, toStopId);
  if (fromIndex < 0 || toIndex < 0) return 2;
  const segmentIndex = Math.min(fromIndex, toIndex);
  const weatherKey = getTransitWeatherKey(gameState);
  return getSegmentMinutesForWeather(line, segmentIndex, weatherKey);
}