import { npcDefinitions } from "../../../data/social/npcs/index.js";

function validateDossierBlocks(blocks, npcId) {
  const items = Array.isArray(blocks) ? blocks : [];
  const seenIds = new Set();
  return Object.freeze(items.map((block, index) => {
    const blockId = String(block?.id || "").trim();
    if (!blockId) {
      throw new Error(`NPC dossier block missing id: npcId=${npcId} index=${index}`);
    }
    if (seenIds.has(blockId)) {
      throw new Error(`NPC dossier block duplicated: npcId=${npcId} blockId=${blockId}`);
    }
    seenIds.add(blockId);
    return Object.freeze({
      id: blockId,
      title: String(block?.title || blockId).trim() || blockId,
      body: String(block?.body || "").trim()
    });
  }));
}

export function validateNpcDefinitions(definitions, sourceLabel = "data/social/npcs/index.js") {
  const items = Array.isArray(definitions) ? definitions : [];
  const seenIds = new Set();
  return Object.freeze(items.map((definition, index) => {
    const npcId = String(definition?.id || "").trim();
    if (!npcId) {
      throw new Error(`NPC definition missing id: source=${sourceLabel} index=${index}`);
    }
    if (seenIds.has(npcId)) {
      throw new Error(`NPC definition duplicated: source=${sourceLabel} npcId=${npcId}`);
    }
    seenIds.add(npcId);
    const profile = definition?.profile && typeof definition.profile === "object" ? definition.profile : {};
    return Object.freeze({
      id: npcId,
      order: Number.isFinite(Number(definition?.order)) ? Math.trunc(Number(definition.order)) : index * 10,
      profile: Object.freeze({
        displayName: String(profile.displayName || npcId).trim() || npcId,
        discoveredUnknownLabel: String(profile.discoveredUnknownLabel || "未识名人物").trim() || "未识名人物",
        undiscoveredLabel: String(profile.undiscoveredLabel || "???").trim() || "???"
      }),
      dossierBlocks: validateDossierBlocks(definition?.dossierBlocks, npcId),
      defaultEnabled: definition?.defaultEnabled === true
    });
  }).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)));
}

const ALL_NPC_DEFINITIONS = validateNpcDefinitions(npcDefinitions);
const NPC_DEFINITION_MAP = new Map(ALL_NPC_DEFINITIONS.map((row) => [row.id, row]));

export function getNpcDefinition(npcId) {
  const key = String(npcId || "").trim();
  if (!key) return null;
  return NPC_DEFINITION_MAP.get(key) || null;
}

export function getAllNpcDefinitions() {
  return ALL_NPC_DEFINITIONS.slice();
}

export { ALL_NPC_DEFINITIONS };