import { socialDossierEntries } from "../../../data/social/dossier_entries/index.js";
import { getNpcDefinition } from "./npc_registry.js";

const DOSSIER_ENTRY_ID_PATTERN = /^npc_[a-z0-9]+_[a-z0-9_]+_[a-z0-9_]+_\d{3}$/;
const ALLOWED_CATEGORIES = new Set(["first_meet", "story", "rumor", "incident", "relationship"]);
const ALLOWED_UNLOCK_MODES = new Set(["manual_seed", "node", "favor_gte"]);

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeOrder(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.trunc(numeric);
}

function normalizeTags(tags, entryId) {
  const items = Array.isArray(tags) ? tags : [];
  const seen = new Set();
  const normalized = [];
  for (const rawTag of items) {
    const tag = normalizeText(rawTag).toLowerCase();
    if (!tag) {
      throw new Error(`Social dossier entry tag missing value: entryId=${entryId}`);
    }
    if (seen.has(tag)) continue;
    seen.add(tag);
    normalized.push(tag);
  }
  return Object.freeze(normalized);
}

function validateUnlockPolicy(unlockPolicy, entryId) {
  const source = unlockPolicy && typeof unlockPolicy === "object" ? unlockPolicy : {};
  const mode = normalizeText(source.mode);
  if (!mode) {
    throw new Error(`Social dossier entry unlockPolicy missing mode: entryId=${entryId}`);
  }
  if (!ALLOWED_UNLOCK_MODES.has(mode)) {
    throw new Error(`Social dossier entry unlockPolicy mode invalid: entryId=${entryId} mode=${mode}`);
  }
  if (mode === "favor_gte") {
    const favorGte = Number(source.favorGte);
    if (!Number.isFinite(favorGte)) {
      throw new Error(`Social dossier entry unlockPolicy favorGte missing: entryId=${entryId}`);
    }
    return Object.freeze({ mode, favorGte: Math.trunc(favorGte) });
  }
  return Object.freeze({ mode });
}

export function isSocialDossierUnlockPolicySatisfied(entry, snapshot = {}) {
  const unlockMode = String(entry?.unlockPolicy?.mode || "").trim();
  if (unlockMode === "favor_gte") {
    const favorGte = Number(entry?.unlockPolicy?.favorGte ?? NaN);
    const favor = Number(snapshot?.favor ?? 0);
    return snapshot?.discovered === true && Number.isFinite(favorGte) && favor >= favorGte;
  }
  return false;
}

function validateEntryId(entryId, npcId, category) {
  if (!DOSSIER_ENTRY_ID_PATTERN.test(entryId)) {
    throw new Error(`Social dossier entry id invalid: entryId=${entryId}`);
  }
  const allowedPrefixes = [`${npcId}_${category}_`];
  if (category === "relationship") {
    allowedPrefixes.push(`${npcId}_favor_`);
  }
  if (!allowedPrefixes.some((prefix) => entryId.startsWith(prefix))) {
    throw new Error(`Social dossier entry id prefix mismatch: entryId=${entryId} expectedPrefix=${allowedPrefixes.join("|")}`);
  }
}

export function validateSocialDossierEntries(entries = socialDossierEntries, sourceLabel = "data/social/dossier_entries/index.js") {
  const items = Array.isArray(entries) ? entries : [];
  const seenIds = new Set();
  const validatedEntries = items.map((entry, index) => {
    const entryId = normalizeText(entry?.id);
    const npcId = normalizeText(entry?.npcId);
    const category = normalizeText(entry?.category);
    const title = normalizeText(entry?.title);
    const body = normalizeText(entry?.body);

    if (!entryId) {
      throw new Error(`Social dossier entry missing id: source=${sourceLabel} index=${index}`);
    }
    if (seenIds.has(entryId)) {
      throw new Error(`Social dossier entry duplicated: source=${sourceLabel} entryId=${entryId}`);
    }
    seenIds.add(entryId);

    if (!npcId) {
      throw new Error(`Social dossier entry missing npcId: entryId=${entryId}`);
    }
    if (!getNpcDefinition(npcId)) {
      throw new Error(`Social dossier entry npcId unknown: entryId=${entryId} npcId=${npcId}`);
    }
    if (!category) {
      throw new Error(`Social dossier entry missing category: entryId=${entryId}`);
    }
    if (!ALLOWED_CATEGORIES.has(category)) {
      throw new Error(`Social dossier entry category invalid: entryId=${entryId} category=${category}`);
    }
    if (!title) {
      throw new Error(`Social dossier entry missing title: entryId=${entryId}`);
    }
    if (!body) {
      throw new Error(`Social dossier entry missing body: entryId=${entryId}`);
    }

    validateEntryId(entryId, npcId, category);

    return Object.freeze({
      id: entryId,
      npcId,
      order: normalizeOrder(entry?.order, index * 10),
      category,
      title,
      body,
      unlockPolicy: validateUnlockPolicy(entry?.unlockPolicy, entryId),
      tags: normalizeTags(entry?.tags, entryId)
    });
  }).sort((left, right) => {
    const npcDelta = left.npcId.localeCompare(right.npcId);
    if (npcDelta !== 0) return npcDelta;
    const orderDelta = left.order - right.order;
    if (orderDelta !== 0) return orderDelta;
    return left.id.localeCompare(right.id);
  });

  return Object.freeze({
    ok: true,
    count: validatedEntries.length,
    entries: Object.freeze(validatedEntries)
  });
}

const VALIDATION_RESULT = validateSocialDossierEntries();
const ALL_SOCIAL_DOSSIER_ENTRIES = VALIDATION_RESULT.entries;
const SOCIAL_DOSSIER_ENTRY_BY_ID = new Map(ALL_SOCIAL_DOSSIER_ENTRIES.map((entry) => [entry.id, entry]));
const SOCIAL_DOSSIER_ENTRIES_BY_NPC_ID = new Map();

for (const entry of ALL_SOCIAL_DOSSIER_ENTRIES) {
  if (!SOCIAL_DOSSIER_ENTRIES_BY_NPC_ID.has(entry.npcId)) {
    SOCIAL_DOSSIER_ENTRIES_BY_NPC_ID.set(entry.npcId, []);
  }
  SOCIAL_DOSSIER_ENTRIES_BY_NPC_ID.get(entry.npcId).push(entry);
}

for (const [npcId, entries] of SOCIAL_DOSSIER_ENTRIES_BY_NPC_ID.entries()) {
  SOCIAL_DOSSIER_ENTRIES_BY_NPC_ID.set(npcId, Object.freeze(entries.slice()));
}

export function getSocialDossierEntryById(entryId) {
  const key = normalizeText(entryId);
  if (!key) return null;
  return SOCIAL_DOSSIER_ENTRY_BY_ID.get(key) || null;
}

export function listSocialDossierEntriesByNpcId(npcId) {
  const key = normalizeText(npcId);
  if (!key) return Object.freeze([]);
  return SOCIAL_DOSSIER_ENTRIES_BY_NPC_ID.get(key) || Object.freeze([]);
}

export function getPreferredSocialDossierEntryForNpcId(npcId) {
  const entries = listSocialDossierEntriesByNpcId(npcId);
  if (entries.length <= 0) return null;
  const firstMeetEntry = entries.find((entry) => entry.category === "first_meet") || null;
  return firstMeetEntry || entries[0] || null;
}

export function listAllSocialDossierEntries() {
  return ALL_SOCIAL_DOSSIER_ENTRIES.slice();
}

export function searchSocialDossierEntries(query) {
  const text = normalizeText(query).toLowerCase();
  if (!text) return Object.freeze([]);
  return Object.freeze(ALL_SOCIAL_DOSSIER_ENTRIES.filter((entry) => {
    if (entry.title.toLowerCase().includes(text)) return true;
    if (entry.body.toLowerCase().includes(text)) return true;
    return entry.tags.some((tag) => tag.includes(text));
  }));
}

export { ALL_SOCIAL_DOSSIER_ENTRIES, ALLOWED_CATEGORIES };