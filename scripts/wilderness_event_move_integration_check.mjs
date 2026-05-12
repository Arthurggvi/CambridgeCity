/**
 * Integration checks for wilderness event queue after successful WILDERNESS_MOVE commit hook.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mergeWildernessCoreWithEventQueue } from "../src/engine/pipeline/commit_adapters/wilderness_commit_adapter.js";
import { normalizeWildernessState } from "../src/engine/wilderness/wilderness_state.js";
import {
  integrateWildernessEventQueueAfterSuccessfulMove,
  buildWildernessEventOpportunityContext
} from "../src/engine/wilderness/events/wilderness_event_move_integration.js";
import { rollWildernessEventPool } from "../src/engine/wilderness/events/wilderness_event_roll_service.js";
import { resolveWildernessEventTailContinuation } from "../src/engine/wilderness/events/wilderness_event_continuation.js";
import {
  createWildernessEventFrame,
  enqueueWildernessEventFrame
} from "../src/engine/wilderness/events/wilderness_event_queue.js";
import { drainWildernessEventQueue } from "../src/engine/wilderness/events/wilderness_event_queue_drain.js";
import {
  createDefaultWildernessEventQueue,
  normalizeWildernessEventQueue
} from "../src/engine/wilderness/events/wilderness_event_queue_state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function snowMovementPlan() {
  return {
    ok: true,
    areaId: "west2_old_marker_patrol_line",
    to: { x: 1, y: 0 },
    terrainId: "wind_packed_snow",
    direction: "E",
    from: { x: 0, y: 0 },
    minutes: 10,
    staminaCost: 5
  };
}

function mergeWild(prevSlice, corePatch) {
  const core = normalizeWildernessState(corePatch);
  return mergeWildernessCoreWithEventQueue(prevSlice || {}, core);
}

function baseActiveState(prevWildSlice, corePatch) {
  return {
    time: { totalMinutes: 5000 },
    world: {
      wilderness: mergeWild(prevWildSlice, corePatch)
    }
  };
}

function snowIntent(mp) {
  return {
    eventOpportunityContext: buildWildernessEventOpportunityContext({
      movementPlan: mp,
      plannedAtMinutes: 5000
    })
  };
}

function assertWildernessQueueReportShape(rep) {
  assert.equal(typeof rep.rolled, "boolean");
  assert.equal(typeof rep.hit, "boolean");
  assert.ok("selectedPoolId" in rep);
  assert.ok("selectedEventId" in rep);
  assert.ok("enqueuedFrameId" in rep);
  assert.ok("activeFrameId" in rep);
  assert.ok("shouldResumeTail" in rep);
}

// snow + fixed RNG hit → enqueue + active frame + pool/event ids
{
  const mp = snowMovementPlan();
  const st = baseActiveState({}, {
    active: true,
    regionId: "West2",
    areaId: "west2_old_marker_patrol_line",
    originMapId: "west2_outpost_exit",
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "west2_outpost_hub",
    x: 0,
    y: 0,
    stepsTaken: 10
  });
  const rep = integrateWildernessEventQueueAfterSuccessfulMove({
    activeState: st,
    intent: snowIntent(mp),
    movementPlan: mp,
    rngLike: { random: () => 0.05 }
  });
  assert.equal(rep.rolled, true);
  assert.equal(rep.hit, true);
  assertWildernessQueueReportShape(rep);
  assert.ok(rep.enqueuedFrameId);
  assert.ok(st.world.wilderness.eventQueue.activeFrameId);
  const activeId = st.world.wilderness.eventQueue.activeFrameId;
  const af = st.world.wilderness.eventQueue.frames.find((f) => f.frameId === activeId);
  assert.ok(af);
  assert.equal(af.source.poolId, "snow_minor_find_pool");
  assert.equal(af.payload.eventId, "snow_glint_debris_001");
}

// snow + RNG gate miss → no enqueue
{
  const mp = snowMovementPlan();
  const st = baseActiveState({}, {
    active: true,
    regionId: "West2",
    areaId: "west2_old_marker_patrol_line",
    originMapId: "west2_outpost_exit",
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "west2_outpost_hub",
    x: 0,
    y: 0,
    stepsTaken: 11
  });
  const beforeFrames = st.world.wilderness.eventQueue.frames.length;
  const rep = integrateWildernessEventQueueAfterSuccessfulMove({
    activeState: st,
    intent: snowIntent(mp),
    movementPlan: mp,
    rngLike: { random: () => 0.99 }
  });
  assert.equal(rep.hit, false);
  assert.equal(rep.selectedEventId, null);
  assert.equal(st.world.wilderness.eventQueue.frames.length, beforeFrames);
}

// non-snow terrain tags → no_pool
{
  const q = normalizeWildernessEventQueue(createDefaultWildernessEventQueue());
  const r = rollWildernessEventPool(
    {
      movementSucceeded: true,
      hook: "after_wilderness_move_success",
      areaId: "west2_old_marker_patrol_line",
      terrainTags: [],
      targetX: 0,
      targetY: 0,
      occurredAtMinutes: 1,
      stepsTakenAfterMove: 1,
      queueSeqBeforeEnqueue: q.seq
    },
    {},
    { random: () => 0 },
    q
  );
  assert.equal(r.reason, "no_pool");
}

// blocked movement → roll invalid_context (commit path never calls integrate)
{
  const q = normalizeWildernessEventQueue(createDefaultWildernessEventQueue());
  const r = rollWildernessEventPool(
    {
      movementSucceeded: false,
      hook: "after_wilderness_move_success",
      areaId: "west2_old_marker_patrol_line",
      terrainTags: ["snow"],
      targetX: 0,
      targetY: 0,
      occurredAtMinutes: 1,
      stepsTakenAfterMove: 1,
      queueSeqBeforeEnqueue: q.seq
    },
    {},
    { random: () => 0 },
    q
  );
  assert.equal(r.reason, "invalid_context");
}

// activeFrameId already set → new hit stays queued; active unchanged
{
  let queue = normalizeWildernessEventQueue(createDefaultWildernessEventQueue());
  const f1 = createWildernessEventFrame({
    seq: 1,
    createdAtMinutes: 1,
    source: { poolId: "snow_minor_find_pool" },
    payload: {
      eventId: "snow_glint_debris_001",
      areaId: "west2_old_marker_patrol_line",
      x: 0,
      y: 0
    }
  });
  queue = enqueueWildernessEventFrame(queue, f1).queue;
  queue = drainWildernessEventQueue(queue).queue;
  const lockedActive = queue.activeFrameId;
  assert.ok(lockedActive);

  const mp = snowMovementPlan();
  const st = baseActiveState({ eventQueue: queue }, {
    active: true,
    regionId: "West2",
    areaId: "west2_old_marker_patrol_line",
    originMapId: "west2_outpost_exit",
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "west2_outpost_hub",
    x: 1,
    y: 0,
    stepsTaken: 50
  });

  const rep = integrateWildernessEventQueueAfterSuccessfulMove({
    activeState: st,
    intent: snowIntent(mp),
    movementPlan: mp,
    rngLike: { random: () => 0.05 }
  });
  assert.equal(rep.hit, true);
  assert.equal(st.world.wilderness.eventQueue.activeFrameId, lockedActive);
  assert.equal(st.world.wilderness.eventQueue.frames.filter((f) => f.status === "queued").length >= 1, true);
}

// tailContinuation passes recursive forbidden-key validator after hit
{
  const mp = snowMovementPlan();
  const st = baseActiveState({}, {
    active: true,
    regionId: "West2",
    areaId: "west2_old_marker_patrol_line",
    originMapId: "west2_outpost_exit",
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "west2_outpost_hub",
    x: 0,
    y: 0,
    stepsTaken: 20
  });
  integrateWildernessEventQueueAfterSuccessfulMove({
    activeState: st,
    intent: snowIntent(mp),
    movementPlan: mp,
    rngLike: { random: () => 0.02 }
  });
  const tailChk = resolveWildernessEventTailContinuation(st.world.wilderness.eventQueue);
  assert.equal(tailChk.ok, true);
}

// forbid edits under renderer / maps (spot-check paths unchanged — no writes this script)
for (const rel of ["src/engine/render", "data/maps"]) {
  const p = path.join(ROOT, rel);
  assert.ok(fs.existsSync(p), `expected ${rel} to exist`);
}

console.log("wilderness_event_move_integration_check: OK");
