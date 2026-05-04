import { TRANSIENT_PRIORITY, normalizeTransientPriority } from "./transient_contract.js";

const PRIORITY_RANK = Object.freeze({
  [TRANSIENT_PRIORITY.LOW]: 0,
  [TRANSIENT_PRIORITY.NORMAL]: 1,
  [TRANSIENT_PRIORITY.HIGH]: 2
});

function normalizePriority(priority) {
  return normalizeTransientPriority(priority);
}

function compareTransientIntents(left, right) {
  // High-priority cards are allowed to jump ahead in queue order,
  // but runtime card playback remains non-preemptive once a card has started.
  const priorityDelta = PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority];
  if (priorityDelta !== 0) return priorityDelta;
  const createdAtDelta = Number(left.createdAt || 0) - Number(right.createdAt || 0);
  if (createdAtDelta !== 0) return createdAtDelta;
  return String(left.id || "").localeCompare(String(right.id || ""));
}

export function createTransientQueue() {
  const items = [];

  function sortQueue() {
    items.sort(compareTransientIntents);
  }

  function enqueue(intent) {
    if (!intent || typeof intent !== "object") {
      return {
        enqueued: false,
        dedupedCount: 0,
        size: items.length,
        intent: null
      };
    }

    let dedupedCount = 0;
    if (intent.dedupeKey) {
      for (let index = items.length - 1; index >= 0; index -= 1) {
        if (items[index]?.dedupeKey !== intent.dedupeKey) continue;
        items.splice(index, 1);
        dedupedCount += 1;
      }
    }

    items.push({
      ...intent,
      priority: normalizePriority(intent.priority)
    });
    sortQueue();

    return {
      enqueued: true,
      dedupedCount,
      size: items.length,
      intent
    };
  }

  function enqueueMany(intents = []) {
    const results = [];
    for (const intent of Array.isArray(intents) ? intents : []) {
      results.push(enqueue(intent));
    }
    return {
      enqueuedCount: results.filter((entry) => entry.enqueued).length,
      dedupedCount: results.reduce((total, entry) => total + Number(entry?.dedupedCount || 0), 0),
      size: items.length,
      results
    };
  }

  function dequeue() {
    return items.shift() || null;
  }

  function clear(reason = "cleared") {
    const removed = items.splice(0, items.length);
    return {
      reason: String(reason || "cleared"),
      removedCount: removed.length,
      removed
    };
  }

  function removeById(id) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      return {
        removedCount: 0,
        removed: [],
        size: items.length
      };
    }

    const removed = [];
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (String(items[index]?.id || "").trim() !== normalizedId) continue;
      removed.push(items[index]);
      items.splice(index, 1);
    }

    removed.reverse();
    return {
      removedCount: removed.length,
      removed,
      size: items.length
    };
  }

  function snapshot() {
    return {
      size: items.length,
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        priority: item.priority,
        createdAt: item.createdAt,
        dedupeKey: item.dedupeKey || ""
      }))
    };
  }

  return {
    enqueue,
    enqueueMany,
    dequeue,
    clear,
    removeById,
    snapshot
  };
}

export function getTransientPriorityRank(priority) {
  return PRIORITY_RANK[normalizePriority(priority)];
}

export function normalizeTransientQueuePriority(priority) {
  return normalizeTransientPriority(priority);
}