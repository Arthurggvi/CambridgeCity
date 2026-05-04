export const SOCIAL_SNAPSHOT_VERSION = 1;

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeNpcId(npcId) {
  return String(npcId || "").trim();
}

function normalizeTimestamp(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const text = value.trim();
    return text || null;
  }
  return null;
}

function normalizeBooleanMap(source) {
  if (!isPlainObject(source)) return {};
  const next = {};
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = String(rawKey || "").trim();
    if (!key) continue;
    next[key] = rawValue === true;
  }
  return next;
}

function normalizeIdList(source) {
  const values = Array.isArray(source)
    ? source
    : (isPlainObject(source) ? Object.keys(normalizeBooleanMap(source)) : []);
  const next = [];
  const seen = new Set();
  for (const rawValue of values) {
    const value = String(rawValue || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
  }
  return next;
}

export function createDefaultSocialEntry(npcId) {
  const normalizedNpcId = normalizeNpcId(npcId);
  if (!normalizedNpcId) {
    throw new Error("createDefaultSocialEntry requires npcId");
  }
  return {
    npcId: normalizedNpcId,
    discovered: false,
    favor: 0,
    relationStageId: null,
    dossierFlags: {},
    unlockedDossierEntryIds: [],
    firstMetAt: null,
    lastInteractionAt: null,
    flags: {},
    snapshotVersion: SOCIAL_SNAPSHOT_VERSION
  };
}

export function createEmptySocialState() {
  return {
    byNpcId: {},
    order: []
  };
}

export function createEmptyNpcWorldState() {
  return {
    enabledById: {}
  };
}

export function buildDefaultNpcEnabledById(definitions = []) {
  const enabledById = {};
  for (const definition of Array.isArray(definitions) ? definitions : []) {
    const npcId = normalizeNpcId(definition?.id);
    if (!npcId) continue;
    enabledById[npcId] = definition?.defaultEnabled === true;
  }
  return enabledById;
}

export function normalizeSocialEntry(entry, npcId = "") {
  const baseNpcId = normalizeNpcId(entry?.npcId || npcId);
  if (!baseNpcId) return null;
  const source = isPlainObject(entry) ? entry : {};
  const discovered = source.discovered === true;
  const favorValue = Number(source.favor);
  const favor = Number.isFinite(favorValue)
    ? Math.max(0, Math.min(100, Math.trunc(favorValue)))
    : 0;
  const relationStageId = discovered
    ? (String(source.relationStageId || "").trim() || "stranger")
    : null;

  const dossierFlags = normalizeBooleanMap(source.dossierFlags);
  const unlockedDossierEntryIds = normalizeIdList(source.unlockedDossierEntryIds ?? source.dossierEntryFlags);

  // Compatibility patch (strict): early dev saves might have unlocked Eason's first meet entry
  // without setting nameKnown. Only apply to npc_eason + npc_eason_first_meet_001.
  if (
    baseNpcId === "npc_eason"
    && unlockedDossierEntryIds.includes("npc_eason_first_meet_001")
    && dossierFlags.nameKnown !== true
  ) {
    dossierFlags.nameKnown = true;
  }

  return {
    npcId: baseNpcId,
    discovered,
    favor,
    relationStageId,
    dossierFlags,
    unlockedDossierEntryIds,
    firstMetAt: normalizeTimestamp(source.firstMetAt),
    lastInteractionAt: normalizeTimestamp(source.lastInteractionAt),
    flags: normalizeBooleanMap(source.flags),
    snapshotVersion: Number.isInteger(Number(source.snapshotVersion))
      ? Math.max(1, Math.trunc(Number(source.snapshotVersion)))
      : SOCIAL_SNAPSHOT_VERSION
  };
}

export function normalizeSocialState(socialState) {
  const source = isPlainObject(socialState) ? socialState : createEmptySocialState();
  const byNpcIdSource = isPlainObject(source.byNpcId) ? source.byNpcId : {};
  const orderSource = Array.isArray(source.order) ? source.order : [];
  const byNpcId = {};
  const order = [];
  const seenIds = new Set();

  for (const rawNpcId of orderSource) {
    const npcId = normalizeNpcId(rawNpcId);
    if (!npcId || seenIds.has(npcId)) continue;
    const entry = normalizeSocialEntry(byNpcIdSource[npcId], npcId);
    if (!entry) continue;
    byNpcId[npcId] = entry;
    if (entry.discovered) {
      order.push(npcId);
      seenIds.add(npcId);
    }
  }

  for (const [rawNpcId, rawEntry] of Object.entries(byNpcIdSource)) {
    const npcId = normalizeNpcId(rawNpcId);
    if (!npcId || Object.prototype.hasOwnProperty.call(byNpcId, npcId)) continue;
    const entry = normalizeSocialEntry(rawEntry, npcId);
    if (!entry) continue;
    byNpcId[npcId] = entry;
    if (entry.discovered && !seenIds.has(npcId)) {
      order.push(npcId);
      seenIds.add(npcId);
    }
  }

  return {
    byNpcId,
    order
  };
}

export function normalizeNpcWorldState(worldNpcState) {
  const source = isPlainObject(worldNpcState) ? worldNpcState : createEmptyNpcWorldState();
  return {
    enabledById: normalizeBooleanMap(source.enabledById)
  };
}

export function withNpcEnabledDefaults(worldNpcState, definitions = []) {
  const normalized = normalizeNpcWorldState(worldNpcState);
  return {
    enabledById: {
      ...buildDefaultNpcEnabledById(definitions),
      ...normalized.enabledById
    }
  };
}

export function getSocialEntry(socialState, npcId) {
  const normalizedState = normalizeSocialState(socialState);
  const key = normalizeNpcId(npcId);
  if (!key) return null;
  const existing = normalizedState.byNpcId[key];
  return existing ? normalizeSocialEntry(existing, key) : null;
}

export function upsertSocialEntry(socialState, entry) {
  const normalizedState = normalizeSocialState(socialState);
  const normalizedEntry = normalizeSocialEntry(entry, entry?.npcId);
  if (!normalizedEntry) {
    return normalizedState;
  }
  const nextByNpcId = {
    ...normalizedState.byNpcId,
    [normalizedEntry.npcId]: normalizedEntry
  };
  const nextOrderSet = new Set(normalizedState.order);
  if (normalizedEntry.discovered) {
    nextOrderSet.add(normalizedEntry.npcId);
  }
  return {
    byNpcId: nextByNpcId,
    order: Array.from(nextOrderSet)
  };
}