import {
  createDefaultWildernessState,
  normalizeWildernessState,
  WILDERNESS_STATE_SCHEMA_VERSION
} from "./wilderness_state.js";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function createStartWildernessSessionPatch({ areaSpec, originMapId, nowMinutes, startAt }) {
  const errors = [];
  if (!areaSpec || typeof areaSpec !== "object" || Array.isArray(areaSpec)) {
    errors.push("areaSpec must be a non-null object");
  }
  if (!isNonEmptyString(originMapId)) {
    errors.push("originMapId must be a non-empty string");
  }
  if (!Number.isFinite(nowMinutes)) {
    errors.push("nowMinutes must be a finite number");
  }
  const startAtObj = startAt && typeof startAt === "object" ? startAt : null;
  const startX = startAtObj && Number.isInteger(startAtObj.x) ? startAtObj.x : 0;
  const startY = startAtObj && Number.isInteger(startAtObj.y) ? startAtObj.y : 0;
  if (areaSpec && typeof areaSpec === "object" && !Array.isArray(areaSpec)) {
    if (!isNonEmptyString(areaSpec.id)) errors.push("areaSpec.id must be a non-empty string");
    if (!isNonEmptyString(areaSpec.regionId)) errors.push("areaSpec.regionId must be a non-empty string");
    if (!isNonEmptyString(areaSpec.runtimeMapId)) errors.push("areaSpec.runtimeMapId must be a non-empty string");
    if (!isNonEmptyString(areaSpec.fallbackMapId)) errors.push("areaSpec.fallbackMapId must be a non-empty string");
  }
  if (errors.length > 0) {
    return {
      ok: false,
      wilderness: normalizeWildernessState(createDefaultWildernessState()),
      errors
    };
  }

  const areaId = areaSpec.id.trim();
  const wilderness = normalizeWildernessState({
    active: true,
    regionId: areaSpec.regionId.trim(),
    areaId,
    originMapId: originMapId.trim(),
    runtimeMapId: areaSpec.runtimeMapId.trim(),
    fallbackMapId: areaSpec.fallbackMapId.trim(),
    x: startX,
    y: startY,
    heading: "N",
    state: "NAVIGATING",
    trailConfidence: 100,
    visibilityConfidence: 100,
    lostness: 0,
    stepsTaken: 0,
    lastSafePoint: {
      areaId,
      x: startX,
      y: startY,
      mapId: originMapId.trim(),
      reason: "session_start"
    },
    discoveredLandmarks: [],
    flags: {},
    sessionStartedAt: nowMinutes,
    lastUpdatedAt: nowMinutes,
    schemaVersion: WILDERNESS_STATE_SCHEMA_VERSION
  });

  return { ok: true, wilderness };
}

export function createEndWildernessSessionPatch({ currentWilderness, reason, nowMinutes }) {
  void reason;
  const errors = [];
  if (!Number.isFinite(nowMinutes)) {
    errors.push("nowMinutes must be a finite number");
  }
  const cur = normalizeWildernessState(currentWilderness && typeof currentWilderness === "object" ? currentWilderness : {});
  if (cur.active !== true) {
    errors.push("cannot end wilderness session: not active");
  }
  if (errors.length > 0) {
    return {
      ok: false,
      wilderness: cur,
      errors
    };
  }

  const wilderness = normalizeWildernessState({
    ...createDefaultWildernessState(),
    lastUpdatedAt: nowMinutes,
    discoveredLandmarks: cur.discoveredLandmarks,
    flags: cur.flags
  });

  return { ok: true, wilderness };
}

export function createRecoverWildernessSessionPatch({ currentWilderness, fallbackMapId, reason, nowMinutes }) {
  const errors = [];
  if (!isNonEmptyString(fallbackMapId)) {
    errors.push("fallbackMapId must be a non-empty string");
  }
  if (reason == null || (typeof reason !== "string" && typeof reason !== "number")) {
    errors.push("reason must be a string or number");
  }
  if (!Number.isFinite(nowMinutes)) {
    errors.push("nowMinutes must be a finite number");
  }

  const cur = normalizeWildernessState(currentWilderness && typeof currentWilderness === "object" ? currentWilderness : {});
  if (cur.active !== true) {
    errors.push("cannot recover wilderness session: not active");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      wilderness: cur,
      errors
    };
  }

  const wilderness = normalizeWildernessState({
    ...createDefaultWildernessState(),
    active: false,
    state: "RECOVERED",
    lastUpdatedAt: nowMinutes,
    discoveredLandmarks: cur.discoveredLandmarks,
    flags: cur.flags
  });

  const report = {
    type: "wilderness_session_recovered",
    reason: String(reason),
    fallbackMapId: fallbackMapId.trim()
  };

  return { ok: true, wilderness, report };
}
