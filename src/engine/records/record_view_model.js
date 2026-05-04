import { getRecordById } from "./record_registry.js";
import { getRegionConfigById } from "../loader.js";
import {
  getUnlockedRecordEntry,
  normalizeRecordState
} from "./record_state.js";

const RECORD_REGION_ALIASES = Object.freeze({
  WEST2: "West2",
  CAMBCITY: "CambCity",
  OLDCAMB: "OldCamb",
  SOUTH1: "South1"
});

function cloneArrayOfStrings(values) {
  return Array.isArray(values) ? values.map((value) => String(value)) : [];
}

function cloneSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.map((source) => ({
    label: String(source?.label || ""),
    ...(source?.org != null ? { org: String(source.org) } : {}),
    ...(source?.type != null ? { type: String(source.type) } : {}),
    ...(source?.note != null ? { note: String(source.note) } : {}),
    ...(source?.url != null ? { url: String(source.url) } : {})
  }));
}

function cloneReferences(references) {
  if (!Array.isArray(references)) return [];
  return references.map((reference) => {
    const excerpts = Array.isArray(reference?.excerpts)
      ? reference.excerpts.map((excerpt) => ({
        original: String(excerpt?.original || ""),
        ...(excerpt?.translation != null ? { translation: String(excerpt.translation) } : {}),
        ...(excerpt?.note != null ? { note: String(excerpt.note) } : {})
      }))
      : [];
    if (excerpts.length > 0) {
      const hasTranslationSwap = excerpts.some((excerpt) => String(excerpt?.translation || "").trim().length > 0);
      return {
        source: String(reference?.source || reference?.label || ""),
        ...(reference?.url != null ? { url: String(reference.url) } : {}),
        displayMode: hasTranslationSwap ? "hover-translation-swap" : "static-excerpts",
        excerpts
      };
    }
    const original = String(reference?.original || reference?.quote || "").trim();
    const translation = String(reference?.translation || reference?.hoverTranslation || "").trim();
    const note = String(reference?.note || "").trim();
    const hasTranslationSwap = original.length > 0 && translation.length > 0;
    return {
      source: String(reference?.source || reference?.label || ""),
      ...(reference?.url != null ? { url: String(reference.url) } : {}),
      displayMode: hasTranslationSwap ? "hover-translation-swap" : "legacy-flat",
      excerpts: [
        {
          original,
          ...(translation ? { translation } : {}),
          ...(note ? { note } : {})
        }
      ].filter((excerpt) => excerpt.original || excerpt.translation || excerpt.note)
    };
  });
}

function cloneTriggerContext(triggerContext) {
  if (!triggerContext || typeof triggerContext !== "object") return null;
  const next = {};
  if (triggerContext.mapId != null) next.mapId = String(triggerContext.mapId);
  if (triggerContext.actionId != null) next.actionId = String(triggerContext.actionId);
  if (triggerContext.sceneId != null) next.sceneId = String(triggerContext.sceneId);
  if (triggerContext.source != null) next.source = String(triggerContext.source);
  return Object.keys(next).length > 0 ? next : null;
}

function cloneRewardPreview(recordDefinition) {
  return {
    socialExp: Number(recordDefinition?.reward?.firstUnlock?.socialExp || 0)
  };
}

function deriveRecordSummary(recordDefinition) {
  const explicitSummary = String(recordDefinition?.summary || "").trim();
  if (explicitSummary) return explicitSummary;
  const body = String(recordDefinition?.body || "").trim();
  if (!body) return "";
  const firstParagraph = body.split(/\n{2,}/)[0] || body;
  return firstParagraph.length > 64 ? `${firstParagraph.slice(0, 64).trim()}...` : firstParagraph;
}

function normalizeRecordReferences(recordDefinition) {
  return Array.isArray(recordDefinition?.references) ? cloneReferences(recordDefinition.references) : [];
}

function normalizeRecordSources(recordDefinition) {
  const references = normalizeRecordReferences(recordDefinition);
  if (references.length > 0) {
    return references.map((reference) => ({
      label: String(reference?.source || ""),
      ...(Array.isArray(reference?.excerpts) && reference.excerpts[0]?.original
        ? { note: String(reference.excerpts[0].original) }
        : {}),
      ...(reference?.url != null ? { url: String(reference.url) } : {})
    }));
  }
  return cloneSources(recordDefinition?.sources);
}

function normalizeRegionId(regionValue) {
  const raw = String(regionValue || "").trim();
  if (!raw) return "";
  if (getRegionConfigById(raw)) return raw;
  const alias = RECORD_REGION_ALIASES[raw.toUpperCase()] || "";
  if (alias && getRegionConfigById(alias)) return alias;
  return raw;
}

function resolveRegionMeta(recordDefinition) {
  const rawRegionCode = String(recordDefinition?.uiMeta?.region || "").trim();
  const regionId = normalizeRegionId(rawRegionCode);
  const regionCfg = regionId ? getRegionConfigById(regionId) : null;
  return {
    regionCode: rawRegionCode || "UNSPECIFIED",
    regionId: regionId || null,
    regionLabel: String(regionCfg?.Name || rawRegionCode || "未归档区域")
  };
}

function buildUnlockedRecordListItem(recordDefinition, unlockedEntry) {
  const regionMeta = resolveRegionMeta(recordDefinition);
  return {
    recordId: recordDefinition.id,
    title: recordDefinition.title,
    category: recordDefinition.category,
    tags: cloneArrayOfStrings(recordDefinition.tags),
    summary: deriveRecordSummary(recordDefinition),
    uiMeta: {
      ...(recordDefinition.uiMeta || {}),
      regionCode: regionMeta.regionCode,
      regionId: regionMeta.regionId,
      regionLabel: regionMeta.regionLabel
    },
    unlockedAt: unlockedEntry.unlockedAt,
    rewardGranted: unlockedEntry.rewardGranted === true,
    triggerContext: cloneTriggerContext(unlockedEntry.triggerContext)
  };
}

function buildUnlockedRecordDetailView(recordDefinition, unlockedEntry) {
  const regionMeta = resolveRegionMeta(recordDefinition);
  return {
    recordId: recordDefinition.id,
    title: recordDefinition.title,
    category: recordDefinition.category,
    tags: cloneArrayOfStrings(recordDefinition.tags),
    summary: deriveRecordSummary(recordDefinition),
    body: recordDefinition.body,
    scienceTitle: String(recordDefinition?.scienceTitle || "").trim(),
    scienceBody: String(recordDefinition?.scienceBody || "").trim(),
    references: normalizeRecordReferences(recordDefinition),
    sources: normalizeRecordSources(recordDefinition),
    rewardPreview: cloneRewardPreview(recordDefinition),
    uiMeta: {
      ...(recordDefinition.uiMeta || {}),
      regionCode: regionMeta.regionCode,
      regionId: regionMeta.regionId,
      regionLabel: regionMeta.regionLabel
    },
    unlockedAt: unlockedEntry.unlockedAt,
    rewardGranted: unlockedEntry.rewardGranted === true,
    triggerContext: cloneTriggerContext(unlockedEntry.triggerContext),
    snapshotVersion: unlockedEntry.snapshotVersion
  };
}

export function buildUnlockedRecordViewList(recordsState) {
  const normalizedState = normalizeRecordState(recordsState);
  const out = [];

  for (const recordId of normalizedState.order) {
    const recordDefinition = getRecordById(recordId);
    if (!recordDefinition) continue;
    const unlockedEntry = getUnlockedRecordEntry(normalizedState, recordId);
    if (!unlockedEntry) continue;
    out.push(buildUnlockedRecordListItem(recordDefinition, unlockedEntry));
  }

  return out;
}

export function buildUnlockedRecordTreeView(recordsState) {
  const records = buildUnlockedRecordViewList(recordsState);
  const groups = [];
  const groupById = new Map();

  for (const record of records) {
    const groupId = String(record?.uiMeta?.regionCode || "UNSPECIFIED").trim() || "UNSPECIFIED";
    let group = groupById.get(groupId);
    if (!group) {
      group = {
        groupId,
        regionId: record?.uiMeta?.regionId || null,
        label: String(record?.uiMeta?.regionLabel || "未归档区域"),
        items: []
      };
      groupById.set(groupId, group);
      groups.push(group);
    }
    group.items.push(record);
  }

  return groups;
}

export function buildRecordDetailView({ recordId, recordsState }) {
  const recordDefinition = getRecordById(recordId);
  if (!recordDefinition) {
    return {
      ok: false,
      reason: "missing_definition",
      recordId: String(recordId || "").trim(),
      view: null,
      debug: {
        message: `Record definition not found: ${String(recordId || "").trim() || "<empty>"}`
      }
    };
  }

  const unlockedEntry = getUnlockedRecordEntry(recordsState, recordDefinition.id);
  if (!unlockedEntry) {
    return {
      ok: false,
      reason: "not_unlocked",
      recordId: recordDefinition.id,
      view: null,
      debug: {
        message: `Record has not been unlocked: ${recordDefinition.id}`
      }
    };
  }

  return {
    ok: true,
    reason: "ok",
    recordId: recordDefinition.id,
    view: buildUnlockedRecordDetailView(recordDefinition, unlockedEntry),
    debug: {
      message: `Record view resolved: ${recordDefinition.id}`
    }
  };
}