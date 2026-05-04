import { getNightKitchenFoodDef } from "./night_kitchen_food_defs.js";
import { resolveNightKitchenFoodIcon } from "./night_kitchen_food_icon_registry.js";

function normalizeId(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function cloneVisualState(source) {
  return source && typeof source === "object" ? { ...source } : {};
}

function buildDisplayTags(item, reducedMenuPhase) {
  const tags = Array.isArray(item?.tags) ? item.tags.slice() : [];
  if (reducedMenuPhase && item?.nightRetained === true && !tags.includes("夜间保留")) {
    tags.push("夜间保留");
  }
  return tags;
}

export function buildNightKitchenMenuViewModel({ mapId, mapName, catalog, snapshot, timePhase } = {}) {
  const normalizedMapId = normalizeId(mapId);
  if (!catalog || !snapshot?.open || !normalizedMapId || snapshot.mapId !== normalizedMapId) return null;

  const categories = Array.isArray(catalog.categories) ? catalog.categories : [];
  const items = Array.isArray(catalog.items) ? catalog.items : [];
  const activeCategory = categories.find((category) => normalizeId(category?.id) === normalizeId(snapshot.categoryId)) || categories[0] || null;
  if (!activeCategory) return null;

  const activeCategoryId = normalizeId(activeCategory.id);
  const categoryItems = items.filter((item) => normalizeId(item?.categoryId) === activeCategoryId);
  if (categoryItems.length === 0) return null;

  const activeItem = categoryItems.find((item) => normalizeId(item?.id) === normalizeId(snapshot.itemId)) || categoryItems[0] || null;
  if (!activeItem) return null;

  const reducedMenuPhase = String(timePhase || "").trim().toLowerCase() === "midnight";
  const title = String(catalog.title || mapName || "热食窗口菜单").trim() || "热食窗口菜单";
  const scrollTop = Math.max(0, Number(snapshot?.scrollTopByCategory?.[activeCategoryId] || 0));
  const visualState = cloneVisualState(snapshot.visualState);

  const categoryViewModels = categories.map((category) => ({
    id: String(category.id || "").trim(),
    label: String(category.label || category.id || "").trim(),
    mode: String(category.mode || category.id || "").trim(),
    defaultPurchaseActionId: String(category.defaultPurchaseActionId || "").trim(),
    isActive: normalizeId(category.id) === activeCategoryId
  }));

  const itemViewModels = categoryItems.map((item) => {
    const foodDef = getNightKitchenFoodDef(item?.foodId || item?.id || "");
    return {
    id: String(item.id || "").trim(),
    selectedItemId: String(item.foodId || item.id || "").trim(),
    foodId: String(item.foodId || item.id || "").trim(),
    categoryId: String(item.categoryId || "").trim(),
    menuMode: String(item.menuMode || activeCategory.mode || "").trim(),
    name: String(item.label || item.id || "").trim(),
    priceLabel: String(item.priceLabel || item.price || "--").trim(),
    iconId: String(item.icon || "takeout_box").trim(),
    icon: resolveNightKitchenFoodIcon(item.icon),
    isSelected: normalizeId(item.id) === normalizeId(activeItem.id),
    purchaseActionId: String(item.purchaseActionId || activeCategory.defaultPurchaseActionId || "").trim(),
    purchaseMode: String(item.purchaseMode || "").trim(),
    inventoryItemId: String(item.inventoryItemId || "").trim(),
    tags: buildDisplayTags(item, reducedMenuPhase),
    serving: Array.isArray(item.serving) ? item.serving.slice() : [],
    description: String(item.description || "").trim(),
    contentsText: String(item.contentsText || foodDef?.contentsText || "").trim(),
    instantEffectText: String(item.instantEffectText || foodDef?.instantEffectText || "").trim(),
    durationEffectText: String(item.durationEffectText || foodDef?.durationEffectText || "").trim(),
    effects: item.effects && typeof item.effects === "object" ? { ...item.effects } : {}
    };
  });

  const activeItemViewModel = itemViewModels.find((item) => item.id === normalizeId(activeItem.id)) || itemViewModels[0];
  return {
    id: String(catalog.id || "night_kitchen_window_menu").trim(),
    mapId: normalizedMapId,
    title,
    scrollTop,
    visualState,
    reducedMenuPhase,
    activeCategoryId,
    categories: categoryViewModels,
    items: itemViewModels,
    activeItem: activeItemViewModel,
    purchaseActionId: String(activeItemViewModel?.purchaseActionId || activeCategory.defaultPurchaseActionId || "").trim()
  };
}