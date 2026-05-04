import {
  WILDERNESS_HEADINGS,
  WILDERNESS_SESSION_STATES,
  WILDERNESS_STATE_SCHEMA_VERSION
} from "./wilderness_state.js";

const HEADING_SET = new Set(WILDERNESS_HEADINGS);
const STATE_SET = new Set(WILDERNESS_SESSION_STATES);

function push(errors, message) {
  errors.push(message);
}

export function validateWildernessState(wilderness) {
  const errors = [];
  if (wilderness == null || typeof wilderness !== "object" || Array.isArray(wilderness)) {
    return { ok: false, errors: ["wilderness must be a non-null object"] };
  }

  if (typeof wilderness.active !== "boolean") {
    push(errors, "wilderness.active must be a boolean");
  }

  if (wilderness.active === true) {
    if (typeof wilderness.regionId !== "string" || !wilderness.regionId.trim()) {
      push(errors, "wilderness.regionId must be a non-empty string when active");
    }
    if (typeof wilderness.areaId !== "string" || !wilderness.areaId.trim()) {
      push(errors, "wilderness.areaId must be a non-empty string when active");
    }
    if (!Number.isInteger(wilderness.x)) {
      push(errors, "wilderness.x must be an integer when active");
    }
    if (!Number.isInteger(wilderness.y)) {
      push(errors, "wilderness.y must be an integer when active");
    }
    if (!Number.isFinite(wilderness.sessionStartedAt)) {
      push(errors, "wilderness.sessionStartedAt must be a finite number when active");
    }
    if (!Number.isFinite(wilderness.lastUpdatedAt)) {
      push(errors, "wilderness.lastUpdatedAt must be a finite number when active");
    }
  }

  if (!HEADING_SET.has(wilderness.heading)) {
    push(errors, "wilderness.heading must be an 8-way compass value");
  }
  if (!STATE_SET.has(wilderness.state)) {
    push(errors, "wilderness.state must be a valid session state id");
  }

  for (const key of ["trailConfidence", "visibilityConfidence", "lostness"]) {
    const v = wilderness[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) {
      push(errors, `wilderness.${key} must be a finite number in 0..100`);
    }
  }

  if (!Array.isArray(wilderness.discoveredLandmarks)) {
    push(errors, "wilderness.discoveredLandmarks must be an array");
  }
  if (wilderness.flags == null || typeof wilderness.flags !== "object" || Array.isArray(wilderness.flags)) {
    push(errors, "wilderness.flags must be a plain object");
  }

  if (wilderness.schemaVersion !== WILDERNESS_STATE_SCHEMA_VERSION) {
    push(errors, `wilderness.schemaVersion must be ${WILDERNESS_STATE_SCHEMA_VERSION}`);
  }

  return { ok: errors.length === 0, errors };
}

export function validateWildernessSessionPatchResult(result) {
  const errors = [];
  if (result == null || typeof result !== "object") {
    return { ok: false, errors: ["result must be a non-null object"] };
  }
  if (typeof result.ok !== "boolean") {
    push(errors, "result.ok must be a boolean");
  }
  if (result.ok === true) {
    if (result.wilderness == null || typeof result.wilderness !== "object" || Array.isArray(result.wilderness)) {
      push(errors, "result.wilderness must be an object when ok is true");
    } else {
      const inner = validateWildernessState(result.wilderness);
      errors.push(...inner.errors.map((e) => `wilderness: ${e}`));
    }
  } else {
    if (!Array.isArray(result.errors) || result.errors.length === 0) {
      push(errors, "result.errors must be a non-empty array when ok is false");
    }
  }
  return { ok: errors.length === 0, errors };
}
