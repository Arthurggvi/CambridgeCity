import { WILDERNESS_EVENT_FRAME_STATUSES, WILDERNESS_EVENT_PRIORITY_RANK } from "./wilderness_event_queue_state.js";
import { cloneWildernessEventQueue } from "./wilderness_event_queue.js";

/**
 * @param {ReturnType<typeof normalizeWildernessEventQueue>} queue
 * @returns {{ queue: typeof queue, shouldResumeTail: boolean }}
 */
export function drainWildernessEventQueue(queue) {
  const base = cloneWildernessEventQueue(queue);

  if (base.activeFrameId != null && base.activeFrameId !== "") {
    return { queue: base, shouldResumeTail: false };
  }

  const queued = base.frames.filter((f) => f.status === WILDERNESS_EVENT_FRAME_STATUSES.QUEUED);
  if (queued.length === 0) {
    return { queue: base, shouldResumeTail: true };
  }

  const ranked = [...queued].sort((a, b) => {
    const pa = WILDERNESS_EVENT_PRIORITY_RANK[a.priority] ?? -1;
    const pb = WILDERNESS_EVENT_PRIORITY_RANK[b.priority] ?? -1;
    if (pa !== pb) return pb - pa;
    return a.seq - b.seq;
  });

  const pick = ranked[0];
  const frames = base.frames.map((f) =>
    f.frameId === pick.frameId ? { ...f, status: WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE } : f
  );

  return {
    queue: {
      ...base,
      frames,
      activeFrameId: pick.frameId
    },
    shouldResumeTail: false
  };
}
