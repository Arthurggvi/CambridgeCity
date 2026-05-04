import { getNpcDefinition } from "../social/npc_registry.js";
import {
  createDefaultSocialEntry,
  createEmptySocialState,
  getSocialEntry,
  normalizeSocialState,
  upsertSocialEntry
} from "../social/social_state.js";
import { isSocialDossierUnlockPolicySatisfied, listSocialDossierEntriesByNpcId } from "../social/dossier_entry_registry.js";
import { applyFavorDelta, markNpcDiscovered, setNpcDossierEntryUnlocked, setNpcFavorValue, unlockDossierBlock, unlockNpcDossierEntry } from "../social/social_service.js";

function normalizeIntentType(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeNpcId(value) {
  return String(value || "").trim();
}

function cloneContext(rawContext, activeState) {
  const source = rawContext && typeof rawContext === "object" ? rawContext : {};
  const next = { ...source };
  if (!Object.prototype.hasOwnProperty.call(next, "socialState")) {
    next.socialState = activeState?.player?.social || createEmptySocialState();
  }
  if (!Object.prototype.hasOwnProperty.call(next, "atMinute")) {
    next.atMinute = Number(activeState?.time?.totalMinutes ?? 0);
  }
  return next;
}

function normalizeSocialIntent(rawIntent) {
  if (!rawIntent || typeof rawIntent !== "object") return null;
  const type = normalizeIntentType(rawIntent.type);
  const npcId = normalizeNpcId(rawIntent.npcId);
  if (!type || !npcId) return null;
  if (!["discover_npc", "favor_delta", "unlock_dossier_block", "set_social_flag", "set_dossier_flag", "set_favor", "set_dossier_entry_unlock", "unlock_dossier_entry"].includes(type)) return null;
  return {
    type,
    npcId,
    delta: Number(rawIntent.delta || 0),
    favor: Number(rawIntent.favor ?? 0),
    blockId: String(rawIntent.blockId || "").trim() || null,
    entryId: String(rawIntent.entryId || "").trim() || null,
    flagId: String(rawIntent.flagId || "").trim() || null,
    value: rawIntent.value === true,
    reason: String(rawIntent.reason || type).trim() || type,
    context: rawIntent.context && typeof rawIntent.context === "object" ? { ...rawIntent.context } : null
  };
}

export function normalizeSocialIntents(socialIntents) {
  const normalized = [];
  for (const rawIntent of Array.isArray(socialIntents) ? socialIntents : []) {
    const intent = normalizeSocialIntent(rawIntent);
    if (intent) normalized.push(intent);
  }
  return normalized;
}

function buildResultRow({ npcId, beforeEntry, afterEntry, unlockedDossierBlocks, unlockedDossierEntryIds, reason }) {
  return {
    npcId,
    discoveredBefore: beforeEntry?.discovered === true,
    discoveredAfter: afterEntry?.discovered === true,
    favorBefore: Number(beforeEntry?.favor || 0),
    favorAfter: Number(afterEntry?.favor || 0),
    relationStageBefore: beforeEntry?.relationStageId || null,
    relationStageAfter: afterEntry?.relationStageId || null,
    unlockedDossierBlocks: Array.isArray(unlockedDossierBlocks) ? unlockedDossierBlocks.slice() : [],
    unlockedDossierEntryIds: Array.isArray(unlockedDossierEntryIds) ? unlockedDossierEntryIds.slice() : [],
    reason: String(reason || "").trim() || "social_update"
  };
}

function applyAutoDossierUnlockPolicies(definitionId, beforeEntry, activeSocialState, activeState) {
  const currentEntry = getSocialEntry(activeSocialState, definitionId) || createDefaultSocialEntry(definitionId);
  const currentUnlockedIds = new Set(Array.isArray(currentEntry?.unlockedDossierEntryIds) ? currentEntry.unlockedDossierEntryIds : []);
  let nextSocialState = activeSocialState;
  let latestEntry = currentEntry;
  const unlockedDossierEntryIds = [];

  for (const entry of listSocialDossierEntriesByNpcId(definitionId)) {
    if (currentUnlockedIds.has(entry.id)) continue;
    if (!isSocialDossierUnlockPolicySatisfied(entry, latestEntry)) continue;

    const result = unlockNpcDossierEntry(
      definitionId,
      entry.id,
      cloneContext({ reason: `unlock_policy:${entry.unlockPolicy.mode}:${entry.id}` }, { ...activeState, player: { ...activeState?.player, social: nextSocialState } })
    );
    nextSocialState = normalizeSocialState(result.nextSocialState);
    latestEntry = result.entry;
    for (const unlockedEntryId of Array.isArray(result.unlockedDossierEntryIds) ? result.unlockedDossierEntryIds : []) {
      if (!currentUnlockedIds.has(unlockedEntryId)) {
        currentUnlockedIds.add(unlockedEntryId);
        unlockedDossierEntryIds.push(unlockedEntryId);
      }
    }
  }

  return {
    nextSocialState,
    afterEntry: latestEntry,
    unlockedDossierEntryIds
  };
}

export function applySocialIntents(activeState, socialIntents) {
  const normalizedIntents = normalizeSocialIntents(socialIntents);
  let activeSocialState = normalizeSocialState(activeState?.player?.social);
  const results = [];

  for (const intent of normalizedIntents) {
    const definition = getNpcDefinition(intent.npcId);
    if (!definition) continue;
    const beforeEntry = getSocialEntry(activeSocialState, definition.id) || createDefaultSocialEntry(definition.id);
    let afterEntry = beforeEntry;
    let unlockedDossierBlocks = [];
    let unlockedDossierEntryIds = [];

    if (intent.type === "discover_npc") {
      const result = markNpcDiscovered(definition.id, cloneContext(intent.context, { ...activeState, player: { ...activeState?.player, social: activeSocialState } }));
      activeSocialState = normalizeSocialState(result.nextSocialState);
      afterEntry = result.entry;
    } else if (intent.type === "favor_delta") {
      const result = applyFavorDelta(definition.id, intent.delta, cloneContext(intent.context, { ...activeState, player: { ...activeState?.player, social: activeSocialState } }));
      activeSocialState = normalizeSocialState(result.nextSocialState);
      afterEntry = result.entry;
    } else if (intent.type === "unlock_dossier_block") {
      const result = unlockDossierBlock(definition.id, intent.blockId, cloneContext(intent.context, { ...activeState, player: { ...activeState?.player, social: activeSocialState } }));
      activeSocialState = normalizeSocialState(result.nextSocialState);
      afterEntry = result.entry;
      if (result.wasAlreadyUnlocked !== true && result.unlockedBlockId) {
        unlockedDossierBlocks = [result.unlockedBlockId];
      }
    } else if (intent.type === "unlock_dossier_entry" && intent.entryId) {
      const result = unlockNpcDossierEntry(definition.id, intent.entryId, cloneContext(intent.context, { ...activeState, player: { ...activeState?.player, social: activeSocialState } }));
      activeSocialState = normalizeSocialState(result.nextSocialState);
      afterEntry = result.entry;
      unlockedDossierEntryIds = result.unlockedDossierEntryIds;
    } else if (intent.type === "set_favor") {
      const result = setNpcFavorValue(definition.id, intent.favor, cloneContext(intent.context, { ...activeState, player: { ...activeState?.player, social: activeSocialState } }));
      activeSocialState = normalizeSocialState(result.nextSocialState);
      afterEntry = result.entry;
    } else if (intent.type === "set_dossier_entry_unlock" && intent.entryId) {
      const result = setNpcDossierEntryUnlocked(definition.id, intent.entryId, intent.value === true, cloneContext(intent.context, { ...activeState, player: { ...activeState?.player, social: activeSocialState } }));
      activeSocialState = normalizeSocialState(result.nextSocialState);
      afterEntry = result.entry;
      unlockedDossierEntryIds = result.unlockedDossierEntryIds;
    } else if (intent.type === "set_dossier_flag" && intent.flagId) {
      const nextEntry = {
        ...beforeEntry,
        dossierFlags: {
          ...(beforeEntry.dossierFlags || {}),
          [intent.flagId]: intent.value === true
        }
      };
      activeSocialState = upsertSocialEntry(activeSocialState, nextEntry);
      afterEntry = nextEntry;
    } else if (intent.type === "set_social_flag" && intent.flagId) {
      const nextEntry = {
        ...beforeEntry,
        flags: {
          ...(beforeEntry.flags || {}),
          [intent.flagId]: intent.value === true
        }
      };
      activeSocialState = upsertSocialEntry(activeSocialState, nextEntry);
      afterEntry = nextEntry;
    }

    const autoUnlockResult = applyAutoDossierUnlockPolicies(
      definition.id,
      beforeEntry,
      activeSocialState,
      activeState
    );
    activeSocialState = autoUnlockResult.nextSocialState;
    afterEntry = autoUnlockResult.afterEntry;
    unlockedDossierEntryIds = unlockedDossierEntryIds.concat(autoUnlockResult.unlockedDossierEntryIds);

    results.push(buildResultRow({
      npcId: definition.id,
      beforeEntry,
      afterEntry,
      unlockedDossierBlocks,
      unlockedDossierEntryIds,
      reason: intent.reason
    }));
  }

  return {
    nextSocialState: activeSocialState,
    results
  };
}