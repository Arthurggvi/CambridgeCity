import { getRecordById } from "./record_registry.js";
import {
  createEmptyRecordState,
  createUnlockedRecordEntry,
  getUnlockedRecordEntry,
  hasUnlockedRecord as hasUnlockedRecordInState,
  normalizeRecordState,
  withUnlockedRecord
} from "./record_state.js";
import {
  buildRecordDetailView,
  buildUnlockedRecordTreeView,
  buildUnlockedRecordViewList
} from "./record_view_model.js";

function cloneRewardPayload(recordDefinition) {
  return {
    socialExp: Number(recordDefinition?.reward?.firstUnlock?.socialExp || 0)
  };
}

function cloneTriggerContext(triggerContext) {
  if (!triggerContext || typeof triggerContext !== "object") return null;
  const next = {};
  if (triggerContext.mapId != null) next.mapId = String(triggerContext.mapId).trim();
  if (triggerContext.actionId != null) next.actionId = String(triggerContext.actionId).trim();
  if (triggerContext.sceneId != null) next.sceneId = String(triggerContext.sceneId).trim();
  if (triggerContext.source != null) next.source = String(triggerContext.source).trim();
  return Object.keys(next).length > 0 ? next : null;
}

export function hasUnlockedRecord({ recordId, recordsState } = {}) {
  return hasUnlockedRecordInState(recordsState, recordId);
}

export function tryUnlockRecord({ recordId, recordsState, triggerContext } = {}) {
  const normalizedState = normalizeRecordState(recordsState);
  const normalizedRecordId = String(recordId || "").trim();
  const recordDefinition = getRecordById(normalizedRecordId);

  if (!recordDefinition) {
    return {
      ok: false,
      reason: "missing_definition",
      unlockedRecordId: normalizedRecordId || null,
      nextRecordsState: normalizedState,
      reward: null,
      toast: null,
      debug: {
        message: `Record definition not found: ${normalizedRecordId || "<empty>"}`,
        triggerContext: cloneTriggerContext(triggerContext)
      }
    };
  }

  if (hasUnlockedRecordInState(normalizedState, recordDefinition.id)) {
    const existingEntry = getUnlockedRecordEntry(normalizedState, recordDefinition.id);
    return {
      ok: true,
      reason: "already_unlocked",
      unlockedRecordId: recordDefinition.id,
      nextRecordsState: normalizedState,
      reward: null,
      toast: null,
      debug: {
        message: `Record already unlocked: ${recordDefinition.id}`,
        existingEntry
      }
    };
  }

  const nextEntry = createUnlockedRecordEntry({
    recordId: recordDefinition.id,
    unlockedAt: triggerContext?.unlockedAt ?? null,
    rewardGranted: false,
    triggerContext,
    snapshotVersion: 1
  });
  const nextRecordsState = withUnlockedRecord(normalizedState, nextEntry);

  return {
    ok: true,
    reason: "first_unlock",
    unlockedRecordId: recordDefinition.id,
    nextRecordsState,
    reward: cloneRewardPayload(recordDefinition),
    toast: String(recordDefinition.unlockToast || ""),
    debug: {
      message: `Record unlocked for the first time: ${recordDefinition.id}`,
      createdEntry: getUnlockedRecordEntry(nextRecordsState, recordDefinition.id)
    }
  };
}

export function getUnlockedRecordViewList({ recordsState } = {}) {
  return buildUnlockedRecordViewList(recordsState || createEmptyRecordState());
}

export function getUnlockedRecordTreeView({ recordsState } = {}) {
  return buildUnlockedRecordTreeView(recordsState || createEmptyRecordState());
}

export function getRecordViewById({ recordId, recordsState } = {}) {
  return buildRecordDetailView({ recordId, recordsState: recordsState || createEmptyRecordState() });
}