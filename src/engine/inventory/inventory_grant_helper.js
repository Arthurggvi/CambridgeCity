import {
  INVENTORY_CATEGORIES,
  isClothingItem,
  normalizeInventory
} from "../items_db.js";

function normalizeGrantQty(qty) {
  const n = Math.floor(Number(qty ?? 1));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function countKindsInCategory(inventory, category, itemsById) {
  const seen = new Set();
  for (const row of normalizeInventory(inventory)) {
    const def = itemsById?.get(row.itemId);
    if (String(def?.category || "") === category && row.qty > 0) {
      seen.add(row.itemId);
    }
  }
  return seen.size;
}

/**
 * Pure inventory grant helper. Inventory truth remains { itemId, qty }[].
 */
export function grantInventoryItem({
  inventory,
  itemId,
  qty = 1,
  itemsById,
  itemDb,
  capacityProfile
}) {
  const currentInventory = normalizeInventory(inventory);
  const normalizedItemId = String(itemId || "").trim();
  const amount = normalizeGrantQty(qty);
  const db = itemsById || itemDb || null;
  const itemDef = normalizedItemId && db?.get ? db.get(normalizedItemId) : null;

  if (!amount) {
    return { ok: false, inventory: currentInventory, failureCode: "invalid_qty" };
  }
  if (!normalizedItemId || !itemDef) {
    return { ok: false, inventory: currentInventory, failureCode: "invalid_item" };
  }

  const category = String(itemDef.category || "").trim();
  if (!INVENTORY_CATEGORIES.includes(category)) {
    return { ok: false, inventory: currentInventory, failureCode: "invalid_item" };
  }

  const nextInventory = currentInventory.map((row) => ({ itemId: row.itemId, qty: row.qty }));
  const existingIndex = nextInventory.findIndex((row) => row.itemId === normalizedItemId && row.qty > 0);
  const bypassCapacity = isClothingItem(itemDef);

  if (!bypassCapacity && capacityProfile && typeof capacityProfile === "object") {
    const stackLimit = Math.max(1, Math.floor(Number(capacityProfile.stackLimit ?? 1)));
    const kindLimit = Math.max(1, Math.floor(Number(capacityProfile.kindLimit ?? 2)));

    if (existingIndex >= 0) {
      if (nextInventory[existingIndex].qty + amount > stackLimit) {
        return { ok: false, inventory: currentInventory, failureCode: "capacity_full" };
      }
    } else {
      if (amount > stackLimit) {
        return { ok: false, inventory: currentInventory, failureCode: "capacity_full" };
      }
      if (countKindsInCategory(nextInventory, category, db) >= kindLimit) {
        return { ok: false, inventory: currentInventory, failureCode: "capacity_full" };
      }
    }
  }

  if (existingIndex >= 0) {
    nextInventory[existingIndex].qty += amount;
  } else {
    nextInventory.push({ itemId: normalizedItemId, qty: amount });
  }

  return {
    ok: true,
    inventory: nextInventory,
    granted: { itemId: normalizedItemId, qty: amount }
  };
}
