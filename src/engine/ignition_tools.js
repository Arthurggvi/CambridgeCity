import { normalizeEquippedTools } from "./items_db.js";

export const FIRE_TOOL_TAG = "fire";
export const IGNITION_ACTION_ID_PREFIX = "scene_ignite:";
export const DEFAULT_IGNITION_ACTION_TEXT = "生火";
export const DEFAULT_IGNITION_SUCCESS_TEXT = "你借着防风火柴点起了火。";
export const DEFAULT_IGNITION_FAILURE_TEXT = "这里没有合适的可燃物。";

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeId(value) {
  return String(value || "").trim();
}

function toPositiveInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.trunc(num));
}

function clampInt(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function isIgnitionActionId(actionId) {
  return normalizeId(actionId).startsWith(IGNITION_ACTION_ID_PREFIX);
}

export function resolveIgnitionSupportSpec(interaction) {
  if (!interaction || typeof interaction !== "object") return null;

  const capabilityTags = Array.isArray(interaction.capabilityTags)
    ? interaction.capabilityTags.map((entry) => normalizeId(entry).toLowerCase()).filter(Boolean)
    : [];
  const ignitionConfig = asPlainObject(interaction.ignition) || {};
  const enabled = interaction.supportsIgnition === true
    || capabilityTags.includes(FIRE_TOOL_TAG)
    || ignitionConfig.enabled === true;

  if (!enabled) return null;

  return {
    actionText: normalizeId(ignitionConfig.actionText) || DEFAULT_IGNITION_ACTION_TEXT,
    successText: normalizeId(ignitionConfig.successText) || DEFAULT_IGNITION_SUCCESS_TEXT,
    failureText: normalizeId(ignitionConfig.failureText) || DEFAULT_IGNITION_FAILURE_TEXT,
    minutes: toPositiveInt(ignitionConfig.minutes, 0)
  };
}

export function getEquippedFireToolEntry(state) {
  const equippedTools = normalizeEquippedTools(state?.player?.equippedTools);
  return equippedTools.find((entry) => normalizeId(entry?.toolTag).toLowerCase() === FIRE_TOOL_TAG) || null;
}

export function createIgnitionActionViewModel({ map, sceneId = "", interaction, state } = {}) {
  const interactionId = normalizeId(interaction?.id);
  const support = resolveIgnitionSupportSpec(interaction);
  if (!interactionId || !support) return null;
  if (!getEquippedFireToolEntry(state)) return null;

  return {
    id: `${IGNITION_ACTION_ID_PREFIX}${interactionId}`,
    type: "IGNITION",
    text: support.actionText,
    minutes: support.minutes,
    ui: {
      type: "button",
      mapId: normalizeId(map?.id),
      sceneId: normalizeId(sceneId || interaction?.sceneId),
      interactionId
    }
  };
}

export function getToolDurabilitySnapshot(state, itemId, itemsById) {
  const normalizedItemId = normalizeId(itemId);
  const itemDef = normalizedItemId && itemsById?.get ? itemsById.get(normalizedItemId) : null;
  const max = toPositiveInt(itemDef?.durabilityMax, 0);
  if (!normalizedItemId || !itemDef || max <= 0) {
    return {
      tracked: false,
      itemDef: itemDef || null,
      itemId: normalizedItemId,
      current: null,
      max: 0
    };
  }

  const seeded = clampInt(toPositiveInt(itemDef?.durability, max) || max, 0, max);
  const store = asPlainObject(state?.player?.extra?.toolDurability) || {};
  const storedRaw = store[normalizedItemId];
  const stored = Number.isFinite(Number(storedRaw))
    ? clampInt(toPositiveInt(storedRaw, seeded), 0, max)
    : seeded;

  return {
    tracked: true,
    itemDef,
    itemId: normalizedItemId,
    current: stored,
    max
  };
}

export function getToolDurabilityStatePath(itemId) {
  return `player.extra.toolDurability.${normalizeId(itemId)}`;
}

export function consumeEquippedFireToolDurability(state, { itemsById, amount = 1 } = {}) {
  const fireTool = getEquippedFireToolEntry(state);
  if (!fireTool) {
    return {
      ok: false,
      reason: "MISSING_FIRE_TOOL"
    };
  }

  const equippedTools = normalizeEquippedTools(state?.player?.equippedTools);
  const snapshot = getToolDurabilitySnapshot(state, fireTool.itemId, itemsById);
  if (!snapshot.tracked) {
    return {
      ok: true,
      tracked: false,
      itemId: fireTool.itemId,
      itemName: String(snapshot.itemDef?.name || fireTool.itemId || "").trim() || fireTool.itemId,
      current: null,
      next: null,
      max: 0,
      broken: false,
      nextEquippedTools: equippedTools
    };
  }

  const before = clampInt(snapshot.current, 0, snapshot.max);
  const loss = Math.max(1, toPositiveInt(amount, 1));
  const next = clampInt(before - loss, 0, snapshot.max);
  const broken = next <= 0;

  return {
    ok: true,
    tracked: true,
    itemId: fireTool.itemId,
    itemName: String(snapshot.itemDef?.name || fireTool.itemId || "").trim() || fireTool.itemId,
    current: before,
    next,
    max: snapshot.max,
    broken,
    nextEquippedTools: broken
      ? equippedTools.filter((entry) => normalizeId(entry?.itemId) !== normalizeId(fireTool.itemId))
      : equippedTools
  };
}