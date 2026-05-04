import { WEST2_OLD_MARKER_PATROL_LINE } from "../data/wilderness/areas/west2_old_marker_patrol_line.js";
import { createDefaultGameState, migrateOldState } from "../src/engine/state.js";
import {
  createDefaultWildernessState,
  normalizeWildernessState,
  WILDERNESS_STATE_SCHEMA_VERSION
} from "../src/engine/wilderness/wilderness_state.js";
import {
  createEndWildernessSessionPatch,
  createRecoverWildernessSessionPatch,
  createStartWildernessSessionPatch
} from "../src/engine/wilderness/wilderness_session_service.js";
import {
  validateWildernessSessionPatchResult,
  validateWildernessState
} from "../src/engine/wilderness/wilderness_session_validate.js";
import { makeEmptySnapshot, sanitizeSnapshot, SAVE_SCHEMA_VERSION } from "../src/save/save_schema.js";
import { migrateSaveFile } from "../src/save/migrations.js";

function assertPass(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDeepEqual(a, b, label) {
  assertPass(JSON.stringify(a) === JSON.stringify(b), `${label}: expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
}

function main() {
  const def = createDefaultWildernessState();
  assertPass(def.active === false && def.state === "INACTIVE" && def.schemaVersion === WILDERNESS_STATE_SCHEMA_VERSION, "default shape");
  console.log("[PASS] default wilderness state created");

  const normIn = {
    active: "yes",
    x: "3",
    y: null,
    heading: "BAD",
    state: "BAD_STATE",
    trailConfidence: 999,
    visibilityConfidence: -20,
    lostness: "15",
    stepsTaken: -3,
    discoveredLandmarks: ["a", "a", 42, ""],
    flags: null,
    schemaVersion: 999
  };
  const normOut = normalizeWildernessState(normIn);
  assertPass(normOut.active === false, "normalize active");
  assertPass(normOut.x === 3 && normOut.y === 0, "normalize x y");
  assertPass(normOut.heading === "N" && normOut.state === "INACTIVE", "normalize heading state");
  assertPass(normOut.trailConfidence === 100 && normOut.visibilityConfidence === 0 && normOut.lostness === 15, "normalize metrics");
  assertPass(normOut.stepsTaken === 0, "normalize steps");
  assertDeepEqual(normOut.discoveredLandmarks, ["a"], "normalize landmarks");
  assertDeepEqual(normOut.flags, {}, "normalize flags");
  assertPass(normOut.schemaVersion === 1, "normalize schema");
  console.log("[PASS] normalize wilderness state samples passed");

  const start = createStartWildernessSessionPatch({
    areaSpec: WEST2_OLD_MARKER_PATROL_LINE,
    originMapId: "west2_outpost_exit",
    nowMinutes: 12345
  });
  assertPass(start.ok === true, "start ok");
  const sw = start.wilderness;
  assertPass(sw.active === true, "start active");
  assertPass(sw.regionId === "West2" && sw.areaId === "west2_old_marker_patrol_line", "start ids");
  assertPass(sw.originMapId === "west2_outpost_exit" && sw.runtimeMapId === "wilderness_runtime" && sw.fallbackMapId === "west2_outpost_hub", "start maps");
  assertPass(sw.x === 0 && sw.y === 0 && sw.heading === "N" && sw.state === "NAVIGATING", "start pose");
  assertPass(sw.trailConfidence === 100 && sw.visibilityConfidence === 100 && sw.lostness === 0 && sw.stepsTaken === 0, "start meters");
  assertDeepEqual(sw.lastSafePoint, {
    areaId: "west2_old_marker_patrol_line",
    x: 0,
    y: 0,
    mapId: "west2_outpost_exit",
    reason: "session_start"
  }, "start lastSafePoint");
  assertPass(sw.sessionStartedAt === 12345 && sw.lastUpdatedAt === 12345, "start times");
  assertPass(validateWildernessSessionPatchResult({ ok: true, wilderness: sw }).ok === true, "start validate patch");
  console.log("[PASS] start wilderness session patch passed");

  const end = createEndWildernessSessionPatch({
    currentWilderness: sw,
    reason: "test_end",
    nowMinutes: 20000
  });
  assertPass(end.ok === true, "end ok");
  const ew = end.wilderness;
  assertPass(ew.active === false && ew.state === "INACTIVE", "end inactive");
  assertPass(ew.regionId == null && ew.areaId == null && ew.originMapId == null && ew.runtimeMapId == null && ew.fallbackMapId == null, "end cleared ids");
  assertPass(ew.lastUpdatedAt === 20000, "end lastUpdatedAt");
  assertPass(validateWildernessSessionPatchResult({ ok: true, wilderness: ew }).ok === true, "end validate patch");
  console.log("[PASS] end wilderness session patch passed");

  const recover = createRecoverWildernessSessionPatch({
    currentWilderness: sw,
    fallbackMapId: "west2_outpost_hub",
    reason: "manual_test",
    nowMinutes: 21000
  });
  assertPass(recover.ok === true, "recover ok");
  const rw = recover.wilderness;
  assertPass(rw.active === false && rw.state === "RECOVERED", "recover state");
  assertDeepEqual(recover.report, {
    type: "wilderness_session_recovered",
    reason: "manual_test",
    fallbackMapId: "west2_outpost_hub"
  }, "recover report");
  assertPass(validateWildernessSessionPatchResult({ ok: true, wilderness: rw }).ok === true, "recover validate patch");
  console.log("[PASS] recover wilderness session patch passed");

  const badActive = { active: true, regionId: "", areaId: "x", x: 0, y: 0, heading: "N", state: "NAVIGATING", trailConfidence: 100, visibilityConfidence: 100, lostness: 0, discoveredLandmarks: [], flags: {}, schemaVersion: 1, sessionStartedAt: 1, lastUpdatedAt: 1 };
  assertPass(validateWildernessState(badActive).ok === false, "negative: empty region");
  const badHeading = { ...createDefaultWildernessState(), heading: "XX" };
  assertPass(validateWildernessState(badHeading).ok === false, "negative: heading");
  const badPatch = { ok: true, wilderness: badHeading };
  assertPass(validateWildernessSessionPatchResult(badPatch).ok === false, "negative: patch result");
  console.log("[PASS] wilderness state validation negative cases passed");

  const gs = createDefaultGameState();
  assertPass(gs.world && gs.world.wilderness && gs.world.wilderness.schemaVersion === 1, "default game state wilderness");
  console.log("[PASS] default game state includes world.wilderness");

  const legacy = JSON.parse(JSON.stringify(gs));
  delete legacy.world.wilderness;
  const migrated = migrateOldState(legacy);
  assertPass(migrated.world.wilderness && migrated.world.wilderness.schemaVersion === 1, "migrateOldState fills wilderness");
  console.log("[PASS] legacy state migration fills world.wilderness");

  const marker = { active: true, regionId: "West2", areaId: "west2_old_marker_patrol_line", x: 1, y: 2 };
  const snapGs = JSON.parse(JSON.stringify(gs));
  snapGs.world.wilderness = { ...snapGs.world.wilderness, ...marker };
  const snap = makeEmptySnapshot(snapGs);
  const dirty = JSON.parse(JSON.stringify(snap));
  dirty.world.wilderness = { ...dirty.world.wilderness, trailConfidence: 500, flags: null };
  const clean = sanitizeSnapshot(dirty);
  assertPass(clean.world.wilderness.active === true, "sanitize preserves active");
  assertPass(clean.world.wilderness.trailConfidence === 100, "sanitize clamps trail");
  assertPass(typeof clean.world.wilderness.flags === "object" && clean.world.wilderness.flags != null, "sanitize flags object");
  assertPass(clean.world.wilderness.areaId === "west2_old_marker_patrol_line", "sanitize preserves areaId");
  console.log("[PASS] save sanitize preserves world.wilderness");

  const v11Save = {
    schemaVersion: 11,
    savedAt: Date.now(),
    slotId: "test",
    state: snap
  };
  delete v11Save.state.world.wilderness;
  const migratedSave = migrateSaveFile(v11Save);
  assertPass(migratedSave.schemaVersion === SAVE_SCHEMA_VERSION, "save migrates to current schema");
  assertPass(migratedSave.state.world.wilderness && migratedSave.state.world.wilderness.schemaVersion === 1, "migrateSaveFile adds wilderness");
  console.log("[PASS] save file migration v11 to v12 restores world.wilderness");
}

main();
