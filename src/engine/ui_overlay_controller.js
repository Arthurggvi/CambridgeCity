import { EQUIPMENT_SLOT_ORDER, INVENTORY_CATEGORIES, normalizeInventory } from "./items_db.js";

const INVENTORY_LOCAL_ACTIONS = new Set([
  "toggle-summary",
  "toggle-clothing-sort"
]);

const INVENTORY_NEW_GLOW_MS = 2600;

let _settingsActiveTab = "display";
let _settingsTabScrollTop = Object.create(null);
let _inventoryQtySnapshotInitialized = false;
let _inventoryLastQtyByItemId = new Map();
let _inventoryNewGlowUntilByItemId = new Map();

function ensureUiState(state) {
  if (!state.ui || typeof state.ui !== "object") {
    state.ui = {};
  }
  return state.ui;
}

function buildInventoryQtyMap(rows = []) {
  const qtyByItemId = new Map();
  for (const row of rows) {
    const itemId = String(row?.itemId || "").trim();
    const qty = Math.max(0, Math.floor(Number(row?.qty) || 0));
    if (!itemId || qty <= 0) continue;
    qtyByItemId.set(itemId, (qtyByItemId.get(itemId) || 0) + qty);
  }
  return qtyByItemId;
}

export function syncInventoryGainHighlights(state) {
  const now = Date.now();
  for (const [itemId, untilMs] of _inventoryNewGlowUntilByItemId.entries()) {
    if (untilMs <= now) {
      _inventoryNewGlowUntilByItemId.delete(itemId);
    }
  }

  const inventory = normalizeInventory(state?.player?.inventory);
  const currentQtyByItemId = buildInventoryQtyMap(inventory);
  if (!_inventoryQtySnapshotInitialized) {
    _inventoryQtySnapshotInitialized = true;
    _inventoryLastQtyByItemId = currentQtyByItemId;
    return;
  }

  let hasGain = false;
  for (const [itemId, qty] of currentQtyByItemId.entries()) {
    const prevQty = _inventoryLastQtyByItemId.get(itemId) || 0;
    if (qty > prevQty) {
      _inventoryNewGlowUntilByItemId.set(itemId, now + INVENTORY_NEW_GLOW_MS);
      hasGain = true;
    }
  }

  _inventoryLastQtyByItemId = currentQtyByItemId;
  if (hasGain && state?.ui?.overlay !== "inventory") {
    ensureUiState(state).inventoryNeedsAttention = true;
  }
}

export function collectInventoryGainHighlightIds() {
  const now = Date.now();
  const itemIds = new Set();
  for (const [itemId, untilMs] of _inventoryNewGlowUntilByItemId.entries()) {
    if (untilMs <= now) {
      _inventoryNewGlowUntilByItemId.delete(itemId);
      continue;
    }
    itemIds.add(itemId);
  }
  return itemIds;
}

export function getInventoryOverlayUiState(state) {
  const ui = state?.ui && typeof state.ui === "object" ? state.ui : {};
  const filter = INVENTORY_CATEGORIES.includes(ui.invFilter) ? ui.invFilter : "tool";
  const selectedItemId = String(ui.invSelectedItemId || "").trim();
  const selectedSlot = EQUIPMENT_SLOT_ORDER.includes(String(ui.invSelectedSlot || ""))
    ? String(ui.invSelectedSlot)
    : null;
  const summaryExpanded = filter === "clothing" && ui.invClothingSummaryExpanded === true;
  const clothingSortMode = ui.invClothingSortMode === "incap" ? "incap" : "death";
  const toast = String(ui.toast || "").trim();

  return {
    filter,
    selectedItemId,
    selectedSlot,
    summaryExpanded,
    clothingSortMode,
    toast
  };
}

export function setInventorySummaryExpanded(state, expanded) {
  ensureUiState(state).invClothingSummaryExpanded = !!expanded;
}

export function toggleInventorySortMode(state) {
  const ui = ensureUiState(state);
  ui.invClothingSortMode = ui.invClothingSortMode === "incap" ? "death" : "incap";
}

export function isInventoryLocalAction(action) {
  return INVENTORY_LOCAL_ACTIONS.has(String(action || "").trim());
}

export function handleInventoryLocalAction(state, action, options = {}) {
  const normalizedAction = String(action || "").trim();
  if (!isInventoryLocalAction(normalizedAction)) {
    return { handled: false, shouldRender: false, closeDetailDelayMs: 0 };
  }

  if (normalizedAction === "toggle-summary") {
    const currentState = getInventoryOverlayUiState(state);
    setInventorySummaryExpanded(state, !currentState.summaryExpanded);
    return { handled: true, shouldRender: true, closeDetailDelayMs: 0 };
  }

  if (normalizedAction === "toggle-clothing-sort") {
    toggleInventorySortMode(state);
    return { handled: true, shouldRender: true, closeDetailDelayMs: 0 };
  }

  return { handled: false, shouldRender: false, closeDetailDelayMs: 0 };
}

export function getSettingsOverlayUiState() {
  return {
    activeTab: _settingsActiveTab,
    scrollTopByTab: { ..._settingsTabScrollTop }
  };
}

export function setSettingsOverlayActiveTab(tabId) {
  _settingsActiveTab = String(tabId || "display") || "display";
}

export function rememberSettingsOverlayScrollTop(tabId, scrollTop) {
  _settingsTabScrollTop[String(tabId || "display") || "display"] = Math.max(0, Number(scrollTop || 0));
}

export function readSettingsOverlayScrollTop(tabId) {
  return Math.max(0, Number(_settingsTabScrollTop[String(tabId || "display") || "display"] || 0));
}