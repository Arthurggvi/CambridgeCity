import {
  getNightKitchenFoodDef,
  normalizeNightKitchenMenuMode,
  resolveNightKitchenFoodPurchase
} from "./night_kitchen_food_defs.js";

export const NIGHT_KITCHEN_MENU_CATALOG_DEFS = Object.freeze({
  heatcorridor_night_kitchen_window: Object.freeze({
    id: "night_kitchen_window_menu",
    title: "热食窗口菜单",
    categories: Object.freeze([
      Object.freeze({
        id: "dine",
        label: "堂食",
        mode: "dine",
        defaultPurchaseActionId: "night_kitchen_submit_dine_purchase",
        itemIds: Object.freeze([
          "signature_braised_pork_set",
          "rice_bowl_snack_set",
          "overlord_set_meal"
        ])
      }),
      Object.freeze({
        id: "takeout",
        label: "打包",
        mode: "takeout",
        defaultPurchaseActionId: "night_kitchen_submit_takeout_purchase",
        itemIds: Object.freeze([
          "takeout_soy_fried_rice",
          "takeout_beef_potato_rice_bowl",
          "takeout_pork_scallion_buns_4",
          "takeout_beef_onion_pies_2",
          "takeout_youtiao_2",
          "takeout_lo_mai_gai",
          "takeout_ginger_cola_hot",
          "takeout_braised_ribs_rice_box"
        ])
      })
    ])
  })
});

function normalizeCatalogItemEntry(entry) {
  if (typeof entry === "string") {
    return { itemId: entry, entryId: "", overrides: null };
  }
  if (entry && typeof entry === "object") {
    const overrides = entry.overrides && typeof entry.overrides === "object"
      ? { ...entry.overrides }
      : null;
    return {
      itemId: String(entry.itemId || entry.id || "").trim(),
      entryId: String(entry.id || "").trim(),
      overrides
    };
  }
  return { itemId: "", entryId: "", overrides: null };
}

function buildMenuItem(category, entry) {
  const { itemId, entryId, overrides } = normalizeCatalogItemEntry(entry);
  const itemDef = getNightKitchenFoodDef(itemId);
  if (!itemDef) return null;
  const menuMode = normalizeNightKitchenMenuMode(category?.mode || category?.id || "");
  const purchase = resolveNightKitchenFoodPurchase(itemDef.id, menuMode);
  if (!purchase.ok) return null;
  const displayId = entryId || itemDef.id;
  const name = String(overrides?.label || overrides?.name || itemDef.name || itemDef.id);
  const resolvedPrice = Number.isFinite(Number(overrides?.price)) ? Number(overrides.price) : Number(purchase.price || itemDef.price || 0);
  return Object.freeze({
    id: displayId,
    foodId: itemDef.id,
    categoryId: String(category.id || "").trim(),
    menuMode,
    label: name,
    icon: String(overrides?.iconId || itemDef.iconId || "takeout_box"),
    price: resolvedPrice,
    priceLabel: String(resolvedPrice),
    description: String(overrides?.description || itemDef.description || "").trim(),
    tags: Object.freeze(Array.isArray(overrides?.tags) ? overrides.tags.slice() : Array.isArray(itemDef.tags) ? itemDef.tags.slice() : []),
    serving: Object.freeze(Array.isArray(overrides?.serving) ? overrides.serving.slice() : Array.isArray(itemDef.serving) ? itemDef.serving.slice() : []),
    nightRetained: overrides?.nightRetained === true || (overrides?.nightRetained !== false && itemDef.nightRetained === true),
    serviceBands: Object.freeze(Array.isArray(overrides?.serviceBands) ? overrides.serviceBands.slice() : Array.isArray(itemDef.serviceBands) ? itemDef.serviceBands.slice() : []),
    effects: Object.freeze(itemDef.effects && typeof itemDef.effects === "object" ? { ...itemDef.effects } : {}),
    purchaseActionId: String(overrides?.purchaseActionId || category.defaultPurchaseActionId || "").trim(),
    purchaseMode: purchase.purchaseMode,
    inventoryItemId: purchase.itemId,
    purchasePrice: purchase.price
  });
}

export function resolveNightKitchenMenuCatalogDefinition(mapId) {
  return NIGHT_KITCHEN_MENU_CATALOG_DEFS[String(mapId || "").trim()] || null;
}

export function buildNightKitchenMenuCatalog(definition) {
  if (!definition || typeof definition !== "object") return null;
  const categories = Array.isArray(definition.categories) ? definition.categories : [];
  const builtCategories = categories.map((category) => Object.freeze({
    id: String(category.id || "").trim(),
    label: String(category.label || category.id || "").trim(),
    mode: String(category.mode || category.id || "").trim(),
    defaultPurchaseActionId: String(category.defaultPurchaseActionId || "").trim()
  })).filter((category) => category.id);
  const items = [];
  for (const category of categories) {
    const itemEntries = Array.isArray(category?.itemIds) ? category.itemIds : [];
    for (const entry of itemEntries) {
      const item = buildMenuItem(category, entry);
      if (item) {
        items.push(item);
      }
    }
  }
  return Object.freeze({
    id: String(definition.id || "night_kitchen_window_menu").trim(),
    title: String(definition.title || "热食窗口菜单").trim(),
    categories: Object.freeze(builtCategories),
    items: Object.freeze(items)
  });
}

export function resolveNightKitchenMenuCatalog(mapId, mapContent = null) {
  const normalizedMapId = String(mapId || "").trim();
  if (!normalizedMapId) return null;
  const staticDefinition = resolveNightKitchenMenuCatalogDefinition(normalizedMapId);
  if (staticDefinition) {
    return buildNightKitchenMenuCatalog(staticDefinition);
  }
  const directCatalog = mapContent?.menuCatalogByMapId?.[normalizedMapId];
  if (directCatalog && typeof directCatalog === "object") return directCatalog;
  const runtimeCatalog = mapContent?.RuntimeText?.menuCatalogByMapId?.[normalizedMapId];
  if (runtimeCatalog && typeof runtimeCatalog === "object") return runtimeCatalog;
  return null;
}

export function findNightKitchenCatalogPurchaseItem(catalog, { foodId, menuMode, purchaseActionId } = {}) {
  const normalizedFoodId = String(foodId || "").trim();
  const normalizedMenuMode = normalizeNightKitchenMenuMode(menuMode);
  const normalizedPurchaseActionId = String(purchaseActionId || "").trim();
  if (!normalizedFoodId || !normalizedMenuMode) return null;

  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  return items.find((item) => {
    if (String(item?.foodId || "").trim() !== normalizedFoodId) return false;
    if (normalizeNightKitchenMenuMode(item?.menuMode || "") !== normalizedMenuMode) return false;
    if (normalizedPurchaseActionId && String(item?.purchaseActionId || "").trim() !== normalizedPurchaseActionId) return false;
    return true;
  }) || null;
}