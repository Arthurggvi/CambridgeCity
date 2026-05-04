import { renderShopGoodsIconSvg } from "./shop_goods_icon_registry.js";
import { SHOP_GOODS_PURCHASE_ACTION_ID } from "./shop_goods_defs.js";

function normalizeId(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function cloneVisualState(source) {
  return source && typeof source === "object" ? { ...source } : {};
}

export function buildShopGoodsPanelViewModel({ mapId, mapName, catalog, snapshot } = {}) {
  const normalizedMapId = normalizeId(mapId);
  if (!catalog || !snapshot?.open || !normalizedMapId || normalizedMapId !== snapshot.mapId) return null;

  const items = Array.isArray(catalog.items) ? catalog.items : [];
  const activeItem = items.find((item) => normalizeId(item?.id) === normalizeId(snapshot.itemId)) || items[0] || null;

  const itemViewModels = items.map((item) => ({
    id: String(item.id || "").trim(),
    name: String(item.name || item.id || "").trim(),
    priceLabel: String(item.priceLabel || item.price || "--").trim(),
    tags: Array.isArray(item.tags) ? item.tags.slice() : [],
    description: String(item.description || "").trim(),
    iconId: String(item.icon || "utility_bundle").trim(),
    icon: renderShopGoodsIconSvg(item.icon),
    purchaseMode: String(item.purchaseMode || "inventory_item").trim(),
    sourceItemId: String(item.sourceItemId || item.inventoryItemId || "").trim(),
    purchaseEnabled: item.purchaseEnabled === true,
    purchaseActionId: String(item.purchaseActionId || "").trim(),
    inventoryItemId: String(item.inventoryItemId || "").trim(),
    isSelected: !!activeItem && normalizeId(item.id) === normalizeId(activeItem.id)
  }));

  const activeItemViewModel = activeItem
    ? (itemViewModels.find((item) => item.id === normalizeId(activeItem.id)) || itemViewModels[0] || null)
    : null;

  return {
    id: String(catalog.id || "shop_goods_panel").trim(),
    mapId: normalizedMapId,
    title: String(catalog.title || mapName || "商铺货物").trim() || "商铺货物",
    eyebrow: String(catalog.eyebrow || "货单").trim() || "货单",
    sessionId: Math.max(0, Number(snapshot.sessionId || 0)),
    scrollTop: Math.max(0, Number(snapshot.scrollTop || 0)),
    visualState: cloneVisualState(snapshot.visualState),
    emptyStateMessage: String(catalog.emptyStateMessage || "摊布后面现在是空的。"),
    purchaseActionId: activeItemViewModel?.purchaseEnabled ? SHOP_GOODS_PURCHASE_ACTION_ID : "",
    items: itemViewModels,
    activeItem: activeItemViewModel
  };
}
