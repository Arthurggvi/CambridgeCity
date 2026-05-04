import {
  BUS_ONBOARD_MAP_ID,
  buildBoardPlan,
  buildContinuePlan,
  buildGetOffPlan,
  getDefaultLineIdForStop,
} from "./transit_service.js";

export function createEmptyTransitUiState() {
  return {
    surface: null,
    stopId: null,
    lineId: null,
    lastEvent: null
  };
}

export function createTransitStopUiState({ stopId, lineId } = {}) {
  return {
    ...createEmptyTransitUiState(),
    surface: "stop",
    stopId: String(stopId || "").trim() || null,
    lineId: String(lineId || "").trim() || null
  };
}

export function createTransitOnboardUiState({ stopId, lineId, lastEvent = null } = {}) {
  return {
    ...createEmptyTransitUiState(),
    surface: "onboard",
    stopId: String(stopId || "").trim() || null,
    lineId: String(lineId || "").trim() || null,
    lastEvent: String(lastEvent || "").trim() || null
  };
}

export function deriveTransitUiStateFromRuntimeTruth(gameState) {
  const ride = gameState?.player?.transit?.ride;
  if (!ride) {
    return createEmptyTransitUiState();
  }

  return createTransitOnboardUiState({
    stopId: ride.currentStopId,
    lineId: ride.lineId,
    lastEvent: null
  });
}

function applyTransitRejection(plan, addNote, result) {
  plan.rejection = {
    source: "transit",
    code: String(result?.code || "TRANSIT_REJECTED"),
    reason: String(result?.reason || "公交动作被拒绝。"),
    reasons: [String(result?.reason || "公交动作被拒绝。")]
  };
  addNote(plan, `公交拒绝：${plan.rejection.code}`);
}

export function handleTransitActions(ctx) {
  const {
    id,
    payload,
    plan,
    gameState,
    addEffect,
    addSysCall,
    addNote,
    Effects,
    SYSCALL_TYPES
  } = ctx;

  if (id !== "transit_board" && id !== "transit_continue" && id !== "transit_get_off") {
    return false;
  }

  if (id === "transit_board") {
    const stopId = String(payload?.stopId || "").trim();
    const lineId = String(payload?.lineId || getDefaultLineIdForStop(stopId) || "").trim();
    const direction = Number(payload?.direction);
    const result = buildBoardPlan({
      stopId,
      lineId,
      direction,
      gameState
    });

    if (!result.ok) {
      applyTransitRejection(plan, addNote, result);
      return true;
    }

    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, {
      mapId: BUS_ONBOARD_MAP_ID
    });
    addEffect(plan, Effects.set("player.transit.ride", result.ride));
    addEffect(plan, Effects.push("logLines", result.logLine));
    addNote(plan, `公交上车：${result.stop.stopId} dir=${String(result.direction)}`);
    return true;
  }

  if (id === "transit_continue") {
    const result = buildContinuePlan({
      ride: gameState?.player?.transit?.ride || null,
      gameState
    });

    if (!result.ok) {
      applyTransitRejection(plan, addNote, result);
      return true;
    }

    addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
      minutes: result.minutes,
      reason: "transit_continue",
      ctx: {
        isSleeping: false,
        sessionCoverage: "NONE",
        thermalActivity: "transit"
      }
    });
    if (String(gameState?.currentMapId || "") !== BUS_ONBOARD_MAP_ID) {
      addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, {
        mapId: BUS_ONBOARD_MAP_ID
      });
    }
    addEffect(plan, Effects.set("player.transit.ride", result.arrivalRide));
    if (result.willReverse && result.reverseLogLine) {
      addEffect(plan, Effects.push("logLines", result.reverseLogLine));
    }
    if (result.arrivalLogLine) {
      addEffect(plan, Effects.push("logLines", result.arrivalLogLine));
    }
    addNote(plan, `公交继续：${result.currentStop.stopId} -> ${result.arrivalStopId}`);
    return true;
  }

  const result = buildGetOffPlan({
    ride: gameState?.player?.transit?.ride || null
  });

  if (!result.ok) {
    applyTransitRejection(plan, addNote, result);
    return true;
  }

  if (String(result.targetMapId || "").trim() && String(gameState?.currentMapId || "") !== String(result.targetMapId)) {
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: result.targetMapId });
  }
  addEffect(plan, Effects.set("player.transit.ride", null));
  addEffect(plan, Effects.push("logLines", result.logLine));
  addNote(plan, `公交下车：${result.stop.stopId}`);
  return true;
}