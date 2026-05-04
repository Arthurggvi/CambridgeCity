import { getAllNpcDefinitions, getNpcDefinition } from "./npc_registry.js";
import { listSocialDossierEntriesByNpcId } from "./dossier_entry_registry.js";
import { getRelationStageDefinition } from "./social_relation_stage_defs.js";
import { getRelationshipSnapshot } from "./social_service.js";
import { withNpcEnabledDefaults } from "./social_state.js";

const DOSSIER_ENTRY_EMPTY_STATE_LABEL = "待发现";
const FAVOR_MAX = 100;

function resolveNamePresentation(definition, snapshot) {
  if (!snapshot.discovered) {
    return {
      state: "undiscovered",
      text: definition.profile.undiscoveredLabel
    };
  }
  if (snapshot.dossierFlags?.nameKnown === true) {
    return {
      state: "named",
      text: definition.profile.displayName
    };
  }
  return {
    state: "discovered_unnamed",
    text: definition.profile.undiscoveredLabel
  };
}

function buildRelationChip(snapshot) {
  const relationStage = snapshot?.relationStageId ? getRelationStageDefinition(snapshot.relationStageId) : null;
  return {
    label: relationStage?.label || "未建立",
    stageId: relationStage?.id || null
  };
}

function stripRolePrefix(label) {
  const text = String(label || "").trim();
  if (!text) return "身份未明";
  return text.replace(/^(一位|一个|一名|一名老|一位老)/u, "").trim() || text;
}

function resolveRoleSubtitle(definition) {
  const npcId = String(definition?.id || "").trim();
  if (npcId === "npc_lin") return "诊所护士";
  if (npcId === "npc_hard") return "捕鱼人";
  if (npcId === "npc_rien") return "海事顾问";
  return stripRolePrefix(definition?.profile?.discoveredUnknownLabel);
}

function resolveDisplayTitle(definition, snapshot) {
  return resolveNamePresentation(definition, snapshot).text;
}

function clampFavor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(FAVOR_MAX, Math.trunc(numeric)));
}

function buildRelationshipSummaryVm(snapshot) {
  const relationChip = buildRelationChip(snapshot);
  const favor = clampFavor(snapshot?.favor);
  return {
    label: relationChip.label,
    favor,
    favorMax: FAVOR_MAX,
    progress: favor / FAVOR_MAX
  };
}

function buildDossierEntryListVm(definition, snapshot) {
  const unlockedEntryIdSet = new Set(Array.isArray(snapshot?.unlockedDossierEntryIds) ? snapshot.unlockedDossierEntryIds : []);
  const entries = listSocialDossierEntriesByNpcId(definition?.id)
    .filter((entry) => unlockedEntryIdSet.has(entry.id))
    .sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0) || String(left?.id || "").localeCompare(String(right?.id || "")))
    .map((entry) => ({
      title: entry.title,
      body: entry.body
    }));

  return {
    entries,
    emptyStateLabel: DOSSIER_ENTRY_EMPTY_STATE_LABEL
  };
}

function buildEntryViewModel(definition, snapshot, enabledById = {}) {
  const isEnabled = enabledById?.[definition.id] === true;
  const isDiscovered = snapshot?.discovered === true;
  const isNameKnown = snapshot?.dossierFlags?.nameKnown === true;
  const isFavorited = snapshot?.flags?.isFavorited === true;
  const roleSubtitle = resolveRoleSubtitle(definition);
  return {
    npcId: definition.id,
    isEnabled,
    isDiscovered,
    isNameKnown,
    isFavorited,
    staticOrder: Number.isFinite(Number(definition?.order)) ? Math.trunc(Number(definition.order)) : 0,
    displayTitle: resolveDisplayTitle(definition, snapshot),
    displaySubtitle: roleSubtitle,
    isDimmed: !isDiscovered,
    favoriteButtonAriaLabel: isFavorited
      ? `取消收藏 ${definition.profile.displayName}`
      : `收藏 ${definition.profile.displayName}`
  };
}

function sortIndexEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const favoriteDelta = Number(right.entry?.isFavorited === true) - Number(left.entry?.isFavorited === true);
      if (favoriteDelta !== 0) return favoriteDelta;
      const orderDelta = Number(left.entry?.staticOrder || 0) - Number(right.entry?.staticOrder || 0);
      if (orderDelta !== 0) return orderDelta;
      return left.index - right.index;
    })
    .map((row) => row.entry);
}

function buildSelectedEntryViewModel(definition, snapshot) {
  if (!definition || !snapshot) return null;
  const name = resolveNamePresentation(definition, snapshot);
  const relationChip = buildRelationChip(snapshot);
  const isDiscovered = snapshot.discovered === true;
  const isNameKnown = snapshot?.dossierFlags?.nameKnown === true;
  const roleSubtitle = resolveRoleSubtitle(definition);
  const relationshipSummaryVm = buildRelationshipSummaryVm(snapshot);
  const dossierEntryListVm = buildDossierEntryListVm(definition, snapshot);
  return {
    npcId: definition.id,
    isEnabled: true,
    isDiscovered,
    isNameKnown,
    displayTitle: name.text,
    displaySubtitle: roleSubtitle,
    isDimmed: !isDiscovered,
    name: name.text,
    displayName: definition.profile.displayName,
    relationChip,
    favor: relationshipSummaryVm.favor,
    identityHeader: {
      eyebrow: "人际档案",
      title: name.text,
      relationLabel: relationChip.label,
      favorLabel: `${relationshipSummaryVm.favor}/${relationshipSummaryVm.favorMax}`
    },
    relationshipSummaryVm,
    dossierEntryListVm
  };
}

function buildEmptyDossierViewModel() {
  return {
    entries: [],
    selectedEntryId: null,
    selectedEntry: null,
    identityHeader: null,
    relationshipSummaryVm: null,
    dossierEntryListVm: {
      entries: [],
      emptyStateLabel: DOSSIER_ENTRY_EMPTY_STATE_LABEL
    },
    hasVisibleEntries: false,
    listEmptyState: {
      label: "当前 0 条",
      description: "尚未建立可索引的人际档案。",
      debugClassName: "social-archive-debug-empty-dataset"
    },
    detailEmptyState: {
      eyebrow: "空数据调试态",
      title: "当前没有可查阅的人际档案",
      description: "当前数据集为空；页面仍保持完整档案页骨架，等待后续人物条目进入。",
      debugClassName: "social-archive-debug-empty-dataset"
    }
  };
}

export function buildSocialViewModel(gameState, selectedNpcId = null) {
  const definitions = getAllNpcDefinitions();
  const worldNpcState = withNpcEnabledDefaults(gameState?.world?.npcs, definitions);
  const enabledById = worldNpcState?.enabledById || {};
  const entries = [];

  for (const definition of definitions) {
    if (enabledById?.[definition.id] !== true) continue;
    const snapshot = getRelationshipSnapshot(definition.id, gameState);
    entries.push(buildEntryViewModel(definition, snapshot, enabledById));
  }

  const sortedEntries = sortIndexEntries(entries);

  const hasVisibleEntries = sortedEntries.length > 0;
  const effectiveSelectedNpcId = String(selectedNpcId || sortedEntries[0]?.npcId || "").trim() || null;
  const definition = effectiveSelectedNpcId ? getNpcDefinition(effectiveSelectedNpcId) : null;
  const snapshot = definition ? getRelationshipSnapshot(definition.id, gameState) : null;
  const selectedEntry = definition && snapshot ? buildSelectedEntryViewModel(definition, snapshot) : null;

  return {
    emptyStateVm: {
      hasVisibleEntries,
      eyebrow: "人际档案",
      title: "当前没有可查阅的人际档案",
      description: "当前没有任何已启用的人物档案进入索引。",
      debugClassName: "social-archive-debug-empty-dataset"
    },
    dossierVm: hasVisibleEntries
      ? {
          entries: sortedEntries,
          selectedEntryId: selectedEntry?.npcId || effectiveSelectedNpcId,
          selectedEntry,
          identityHeader: selectedEntry?.identityHeader || null,
          relationshipSummaryVm: selectedEntry?.relationshipSummaryVm || null,
          dossierEntryListVm: selectedEntry?.dossierEntryListVm || {
            entries: [],
            emptyStateLabel: DOSSIER_ENTRY_EMPTY_STATE_LABEL
          },
          hasVisibleEntries: true,
          listEmptyState: null,
          detailEmptyState: null
        }
      : buildEmptyDossierViewModel()
  };
}