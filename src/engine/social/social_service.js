import { getNpcDefinition, getAllNpcDefinitions } from "./npc_registry.js";
import { getSocialDossierEntryById } from "./dossier_entry_registry.js";
import {
  createDefaultSocialEntry,
  createEmptySocialState,
  getSocialEntry,
  normalizeSocialState,
  upsertSocialEntry
} from "./social_state.js";
import { getRelationStageDefinition, resolveRelationStageIdByFavor } from "./social_relation_stage_defs.js";

function normalizeTimestampFromContext(context) {
  const rawValue = context?.atMinute ?? context?.totalMinutes ?? context?.timestamp ?? null;
  if (rawValue == null) return null;
  const numeric = Number(rawValue);
  if (Number.isFinite(numeric)) return Math.trunc(numeric);
  const text = String(rawValue || "").trim();
  return text || null;
}

function clampFavor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.trunc(numeric)));
}

function normalizeEntryIdList(source) {
  const next = [];
  const seen = new Set();
  for (const rawValue of Array.isArray(source) ? source : []) {
    const value = String(rawValue || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
  }
  return next;
}

function ensureDefinition(npcId) {
  const definition = getNpcDefinition(npcId);
  if (!definition) {
    throw new Error(`Unknown npcId: ${String(npcId || "")}`);
  }
  return definition;
}

function withEntry(socialState, npcId) {
  const normalizedState = normalizeSocialState(socialState || createEmptySocialState());
  const existing = getSocialEntry(normalizedState, npcId) || createDefaultSocialEntry(npcId);
  return {
    socialState: normalizedState,
    entry: existing
  };
}

function buildSnapshot(definition, entry) {
  const relationStage = entry?.relationStageId ? getRelationStageDefinition(entry.relationStageId) : null;
  return {
    npcId: definition.id,
    discovered: entry?.discovered === true,
    favor: clampFavor(entry?.favor),
    relationStageId: entry?.relationStageId || null,
    relationStageLabel: relationStage?.label || null,
    dossierFlags: { ...(entry?.dossierFlags || {}) },
    unlockedDossierEntryIds: normalizeEntryIdList(entry?.unlockedDossierEntryIds),
    firstMetAt: entry?.firstMetAt ?? null,
    lastInteractionAt: entry?.lastInteractionAt ?? null,
    flags: { ...(entry?.flags || {}) }
  };
}

export function ensureSocialEntry(npcId, socialState = null) {
  const definition = ensureDefinition(npcId);
  const { socialState: normalizedState, entry } = withEntry(socialState, definition.id);
  const nextSocialState = upsertSocialEntry(normalizedState, entry);
  return {
    ok: true,
    npcId: definition.id,
    nextSocialState,
    entry,
    created: !getSocialEntry(normalizedState, definition.id)
  };
}

export function markNpcDiscovered(npcId, context = {}) {
  const definition = ensureDefinition(npcId);
  const { socialState, entry } = withEntry(context.socialState, definition.id);
  const wasDiscovered = entry.discovered === true;
  const timestamp = normalizeTimestampFromContext(context);
  const nextEntry = {
    ...entry,
    discovered: true,
    relationStageId: wasDiscovered ? (entry.relationStageId || "stranger") : "stranger",
    firstMetAt: wasDiscovered ? entry.firstMetAt : (timestamp ?? entry.firstMetAt ?? null),
    lastInteractionAt: timestamp ?? entry.lastInteractionAt ?? null
  };
  const nextSocialState = upsertSocialEntry(socialState, nextEntry);
  return {
    ok: true,
    npcId: definition.id,
    discoveredBefore: wasDiscovered,
    discoveredAfter: true,
    nextSocialState,
    entry: nextEntry,
    snapshot: buildSnapshot(definition, nextEntry)
  };
}

export function applyFavorDelta(npcId, delta, context = {}) {
  const definition = ensureDefinition(npcId);
  const discoveredResult = markNpcDiscovered(definition.id, context);
  const currentEntry = discoveredResult.entry;
  const favorBefore = clampFavor(currentEntry.favor);
  const favorAfter = clampFavor(favorBefore + Number(delta || 0));
  const timestamp = normalizeTimestampFromContext(context);
  const nextEntry = {
    ...currentEntry,
    favor: favorAfter,
    relationStageId: resolveRelationStageIdByFavor(favorAfter),
    lastInteractionAt: timestamp ?? currentEntry.lastInteractionAt ?? null
  };
  const nextSocialState = upsertSocialEntry(discoveredResult.nextSocialState, nextEntry);
  return {
    ok: true,
    npcId: definition.id,
    discoveredBefore: discoveredResult.discoveredBefore,
    discoveredAfter: true,
    favorBefore,
    favorAfter,
    relationStageBefore: currentEntry.relationStageId || null,
    relationStageAfter: nextEntry.relationStageId,
    nextSocialState,
    entry: nextEntry,
    snapshot: buildSnapshot(definition, nextEntry)
  };
}

export function unlockDossierBlock(npcId, blockId, context = {}) {
  const definition = ensureDefinition(npcId);
  const normalizedBlockId = String(blockId || "").trim();
  if (!normalizedBlockId) {
    throw new Error(`unlockDossierBlock requires blockId: npcId=${definition.id}`);
  }
  const discoveredResult = markNpcDiscovered(definition.id, context);
  const currentEntry = discoveredResult.entry;
  const nextEntry = {
    ...currentEntry,
    dossierFlags: {
      ...currentEntry.dossierFlags,
      [normalizedBlockId]: true
    }
  };
  const nextSocialState = upsertSocialEntry(discoveredResult.nextSocialState, nextEntry);
  return {
    ok: true,
    npcId: definition.id,
    unlockedBlockId: normalizedBlockId,
    wasAlreadyUnlocked: currentEntry.dossierFlags?.[normalizedBlockId] === true,
    nextSocialState,
    entry: nextEntry,
    snapshot: buildSnapshot(definition, nextEntry)
  };
}

export function setNpcFavorValue(npcId, favor, context = {}) {
  const definition = ensureDefinition(npcId);
  const { socialState, entry } = withEntry(context.socialState, definition.id);
  const favorBefore = clampFavor(entry.favor);
  const favorAfter = clampFavor(favor);
  const nextEntry = {
    ...entry,
    favor: favorAfter,
    relationStageId: entry.discovered === true ? resolveRelationStageIdByFavor(favorAfter) : null
  }; 
  const nextSocialState = upsertSocialEntry(socialState, nextEntry);
  return {
    ok: true,
    npcId: definition.id,
    discoveredBefore: entry.discovered === true,
    discoveredAfter: nextEntry.discovered === true,
    favorBefore,
    favorAfter,
    relationStageBefore: entry.relationStageId || null,
    relationStageAfter: nextEntry.relationStageId || null,
    nextSocialState,
    entry: nextEntry,
    snapshot: buildSnapshot(definition, nextEntry)
  };
}

export function setNpcDossierEntryUnlocked(npcId, entryId, unlocked, context = {}) {
  const definition = ensureDefinition(npcId);
  const normalizedEntryId = String(entryId || "").trim();
  if (!normalizedEntryId) {
    throw new Error(`setNpcDossierEntryUnlocked requires entryId: npcId=${definition.id}`);
  }
  const dossierEntry = getSocialDossierEntryById(normalizedEntryId);
  if (!dossierEntry || dossierEntry.npcId !== definition.id) {
    throw new Error(`Unknown dossier entry for npcId: npcId=${definition.id} entryId=${normalizedEntryId}`);
  }
  const { socialState, entry } = withEntry(context.socialState, definition.id);
  const currentEntryIds = normalizeEntryIdList(entry.unlockedDossierEntryIds);
  const wasAlreadyUnlocked = currentEntryIds.includes(normalizedEntryId);
  const nextUnlockedDossierEntryIds = unlocked === true
    ? normalizeEntryIdList([...currentEntryIds, normalizedEntryId])
    : currentEntryIds.filter((value) => value !== normalizedEntryId);
  const nextEntry = {
    ...entry,
    unlockedDossierEntryIds: nextUnlockedDossierEntryIds
  };
  const nextSocialState = upsertSocialEntry(socialState, nextEntry);
  return {
    ok: true,
    npcId: definition.id,
    entryId: normalizedEntryId,
    unlocked: unlocked === true,
    wasAlreadyUnlocked,
    unlockedDossierEntryIds: unlocked === true && !wasAlreadyUnlocked ? [normalizedEntryId] : [],
    nextSocialState,
    entry: nextEntry,
    snapshot: buildSnapshot(definition, nextEntry)
  };
}

export function unlockNpcDossierEntry(npcId, entryId, context = {}) {
  return setNpcDossierEntryUnlocked(npcId, entryId, true, context);
}

export function getRelationshipSnapshot(npcId, gameState) {
  const definition = ensureDefinition(npcId);
  const entry = getSocialEntry(gameState?.player?.social, definition.id) || createDefaultSocialEntry(definition.id);
  return buildSnapshot(definition, entry);
}

export function buildSocialRuntimeContext(gameState) {
  const socialState = normalizeSocialState(gameState?.player?.social);
  const relationshipsByNpcId = {};
  const discoveredNpcIds = [];

  for (const definition of getAllNpcDefinitions()) {
    const snapshot = getRelationshipSnapshot(definition.id, gameState);
    relationshipsByNpcId[definition.id] = Object.freeze({
      discovered: snapshot.discovered,
      favor: snapshot.favor,
      relationStageId: snapshot.relationStageId,
      dossierFlags: Object.freeze({ ...snapshot.dossierFlags }),
      unlockedDossierEntryIds: Object.freeze(snapshot.unlockedDossierEntryIds.slice()),
      flags: Object.freeze({ ...snapshot.flags })
    });
    if (snapshot.discovered) {
      discoveredNpcIds.push(definition.id);
    }
  }

  return Object.freeze({
    discoveredNpcIds: Object.freeze(discoveredNpcIds.slice()),
    order: Object.freeze(socialState.order.slice()),
    relationshipsByNpcId: Object.freeze(relationshipsByNpcId)
  });
}