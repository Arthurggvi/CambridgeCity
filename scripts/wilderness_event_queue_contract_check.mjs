/**
 * Static checks for wilderness event queue state + pure ops (no runtime wiring).
 */
import assert from "node:assert/strict";

import {
  createDefaultWildernessEventQueue,
  normalizeWildernessEventQueue,
  WILDERNESS_EVENT_FRAME_PRIORITIES,
  WILDERNESS_EVENT_FRAME_STATUSES,
  WILDERNESS_EVENT_QUEUE_SCHEMA_VERSION
} from "../src/engine/wilderness/events/wilderness_event_queue_state.js";
import {
  createWildernessEventFrame,
  enqueueWildernessEventFrame,
  markWildernessEventFrameResolved
} from "../src/engine/wilderness/events/wilderness_event_queue.js";
import { drainWildernessEventQueue } from "../src/engine/wilderness/events/wilderness_event_queue_drain.js";
import { resolveWildernessEventTailContinuation } from "../src/engine/wilderness/events/wilderness_event_continuation.js";

function mkPayload(idSuffix, area = "west2", x = 0, y = 0) {
  return {
    eventId: `evt_${idSuffix}`,
    areaId: area,
    x,
    y
  };
}

function mkFrame(seq, priority, idSuffix, minutes = 100, poolId = "snow_minor_find_pool") {
  return createWildernessEventFrame({
    seq,
    priority,
    createdAtMinutes: minutes,
    source: { poolId },
    payload: mkPayload(idSuffix)
  });
}

// 1) default structure
{
  const q = createDefaultWildernessEventQueue();
  assert.equal(q.schemaVersion, WILDERNESS_EVENT_QUEUE_SCHEMA_VERSION);
  assert.equal(q.seq, 0);
  assert.equal(q.activeFrameId, null);
  assert.ok(Array.isArray(q.frames));
  assert.ok(Array.isArray(q.history));
  assert.equal(q.tailContinuation, null);
  assert.ok(q.cooldowns && typeof q.cooldowns.byEventId === "object");
  assert.ok(typeof q.cooldowns.byCellKey === "object");
}

// 2) normalize fills empty / partial
{
  const n = normalizeWildernessEventQueue({});
  assert.equal(n.schemaVersion, WILDERNESS_EVENT_QUEUE_SCHEMA_VERSION);
  assert.ok(Array.isArray(n.frames));
  assert.ok(Array.isArray(n.history));
}

// drain with no queued frames → resume tail
{
  const d = drainWildernessEventQueue(createDefaultWildernessEventQueue());
  assert.equal(d.shouldResumeTail, true);
}

// 3) enqueue does not steal active slot
{
  let q = createDefaultWildernessEventQueue();
  const f1 = mkFrame(1, WILDERNESS_EVENT_FRAME_PRIORITIES.NORMAL, "a");
  const f2 = mkFrame(2, WILDERNESS_EVENT_FRAME_PRIORITIES.NORMAL, "b");
  let r = enqueueWildernessEventFrame(q, f1);
  q = r.queue;
  r = enqueueWildernessEventFrame(q, f2);
  q = r.queue;
  const d = drainWildernessEventQueue(q);
  q = d.queue;
  assert.ok(q.activeFrameId != null);
  const activeBefore = q.activeFrameId;
  const f3 = mkFrame(3, WILDERNESS_EVENT_FRAME_PRIORITIES.HIGH, "c");
  const en = enqueueWildernessEventFrame(q, f3);
  q = en.queue;
  assert.equal(q.activeFrameId, activeBefore);
}

// 4) dedupe same eventId + area + cell for queued/active
{
  let q = createDefaultWildernessEventQueue();
  const p = mkPayload("dup");
  const f1 = createWildernessEventFrame({
    seq: 1,
    createdAtMinutes: 1,
    source: { poolId: "snow_minor_find_pool" },
    payload: p
  });
  const f2 = createWildernessEventFrame({
    seq: 2,
    createdAtMinutes: 2,
    source: { poolId: "snow_minor_find_pool" },
    payload: { ...p }
  });
  q = enqueueWildernessEventFrame(q, f1).queue;
  const second = enqueueWildernessEventFrame(q, f2);
  assert.equal(second.enqueued, false);
  assert.equal(second.queue.frames.length, 1);
}

// 5) drain with active does not activate another frame
{
  let q = createDefaultWildernessEventQueue();
  q = enqueueWildernessEventFrame(q, mkFrame(1, WILDERNESS_EVENT_FRAME_PRIORITIES.NORMAL, "x")).queue;
  q = enqueueWildernessEventFrame(q, mkFrame(2, WILDERNESS_EVENT_FRAME_PRIORITIES.HIGH, "y")).queue;
  const d1 = drainWildernessEventQueue(q);
  q = d1.queue;
  const activeId = q.activeFrameId;
  const d2 = drainWildernessEventQueue(q);
  q = d2.queue;
  assert.equal(q.activeFrameId, activeId);
  const activeFrames = q.frames.filter((f) => f.status === WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE);
  assert.equal(activeFrames.length, 1);
}

// 6) drain without active activates a queued frame
{
  let q = createDefaultWildernessEventQueue();
  q = enqueueWildernessEventFrame(q, mkFrame(1, WILDERNESS_EVENT_FRAME_PRIORITIES.NORMAL, "z")).queue;
  const d = drainWildernessEventQueue(q);
  q = d.queue;
  assert.ok(q.activeFrameId != null);
  assert.equal(d.shouldResumeTail, false);
}

// 7) priority ordering forced > high > normal > low; tie-break seq ASC
{
  let q = createDefaultWildernessEventQueue();
  q = enqueueWildernessEventFrame(q, mkFrame(10, WILDERNESS_EVENT_FRAME_PRIORITIES.HIGH, "late_high")).queue;
  q = enqueueWildernessEventFrame(q, mkFrame(20, WILDERNESS_EVENT_FRAME_PRIORITIES.FORCED, "forced")).queue;
  q = enqueueWildernessEventFrame(q, mkFrame(30, WILDERNESS_EVENT_FRAME_PRIORITIES.HIGH, "early_high")).queue;
  const d = drainWildernessEventQueue(q);
  assert.equal(d.queue.activeFrameId, "wilderness_evt_20");
}

{
  let q = createDefaultWildernessEventQueue();
  q = enqueueWildernessEventFrame(q, mkFrame(5, WILDERNESS_EVENT_FRAME_PRIORITIES.HIGH, "h5")).queue;
  q = enqueueWildernessEventFrame(q, mkFrame(3, WILDERNESS_EVENT_FRAME_PRIORITIES.HIGH, "h3")).queue;
  const d = drainWildernessEventQueue(q);
  assert.equal(d.queue.activeFrameId, "wilderness_evt_3");
}

// 8) tailContinuation forbids replay-shaped keys (recursive)
{
  const bad = resolveWildernessEventTailContinuation({
    tailContinuation: { mode: "none", actionId: "x" }
  });
  assert.equal(bad.ok, false);
  assert.ok(String(bad.error || "").includes("forbids key"));

  const nestedOriginalAction = resolveWildernessEventTailContinuation({
    tailContinuation: { mode: "none", payload: { originalActionId: "replay" } }
  });
  assert.equal(nestedOriginalAction.ok, false);

  const nestedDispatchPayload = resolveWildernessEventTailContinuation({
    tailContinuation: { mode: "transition", mapId: "foo", next: { dispatchPayload: {} } }
  });
  assert.equal(nestedDispatchPayload.ok, false);

  const good = resolveWildernessEventTailContinuation({
    tailContinuation: { mode: "transition", mapId: "foo" }
  });
  assert.equal(good.ok, true);
}

// 8b) payload.poolId mismatch → illegal frame dropped by normalize
{
  const n = normalizeWildernessEventQueue({
    frames: [
      {
        frameId: "wilderness_evt_bad_pool",
        type: "wilderness_random_event",
        status: "queued",
        priority: "normal",
        source: { poolId: "pool_a" },
        createdAtMinutes: 1,
        seq: 1,
        payload: { eventId: "e1", areaId: "west", x: 0, y: 0, poolId: "pool_b" }
      }
    ]
  });
  assert.equal(n.frames.length, 0);
}

// 8c) createWildernessEventFrame rejects payload.poolId !== source.poolId
{
  assert.throws(() =>
    createWildernessEventFrame({
      seq: 1,
      createdAtMinutes: 1,
      source: { poolId: "a" },
      payload: { eventId: "e", areaId: "west", x: 0, y: 0, poolId: "b" }
    })
  );
}

// 9) mark resolved clears activeFrameId
{
  let q = createDefaultWildernessEventQueue();
  q = enqueueWildernessEventFrame(q, mkFrame(1, WILDERNESS_EVENT_FRAME_PRIORITIES.NORMAL, "done")).queue;
  q = drainWildernessEventQueue(q).queue;
  const fid = q.activeFrameId;
  const mr = markWildernessEventFrameResolved(q, fid, {
    eventId: "evt_done",
    outcomeId: "empty",
    areaId: "west2_old_marker_patrol_line",
    x: 0,
    y: 0,
    occurredAtMinutes: 999,
    poolId: "wrong_must_be_ignored",
    resultText: "must not persist"
  });
  assert.equal(mr.ok, true);
  assert.equal(mr.queue.activeFrameId, null);
  const hist = mr.queue.history[mr.queue.history.length - 1];
  assert.equal(hist.resultText, undefined);
  assert.equal(hist.poolId, "snow_minor_find_pool");
}

// 10) history rows keep light keys only (no body/title/resultText from normalize path)
{
  const dirtyHistory = [
    {
      frameId: "wilderness_evt_1",
      eventId: "e",
      poolId: "p",
      outcomeId: "o",
      areaId: "a",
      x: 0,
      y: 0,
      occurredAtMinutes: 1,
      body: "secret",
      title: "secret",
      resultText: "secret"
    }
  ];
  const n = normalizeWildernessEventQueue({ history: dirtyHistory });
  const last = n.history[n.history.length - 1];
  assert.equal(last.body, undefined);
  assert.equal(last.title, undefined);
  assert.equal(last.resultText, undefined);
}

// 11) maxFrames trims lowest priority first; returns droppedFrames
{
  let q = createDefaultWildernessEventQueue();
  for (let i = 1; i <= 5; i++) {
    q = enqueueWildernessEventFrame(q, mkFrame(i, WILDERNESS_EVENT_FRAME_PRIORITIES.NORMAL, `n${i}`), {
      maxFrames: 5
    }).queue;
  }
  const sixth = enqueueWildernessEventFrame(q, mkFrame(6, WILDERNESS_EVENT_FRAME_PRIORITIES.NORMAL, "n6"), {
    maxFrames: 5
  });
  assert.equal(sixth.queue.frames.length, 5);
  assert.equal(sixth.droppedFrames.length >= 1, true);
  const dropped = sixth.droppedFrames[0];
  assert.equal(dropped.priority, WILDERNESS_EVENT_FRAME_PRIORITIES.NORMAL);
}

console.log("wilderness_event_queue_contract_check: OK");
