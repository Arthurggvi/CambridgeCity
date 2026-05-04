import { HEATCORRIDOR_SHOP_WINDOW_CATALOG_DEF } from "./shop_goods_assets/heatcorridor_shop_window_catalog.js";
import { BAYPORT_CLINIC_COUNTER_CATALOG_DEF } from "./shop_goods_assets/bayport_clinic_counter_catalog.js";
import { getShopGoodsDef, SHOP_GOODS_PURCHASE_ACTION_ID } from "./shop_goods_defs.js";
import { gameState } from "./state.js";
import { resolveDailyStallGoods } from "./shop_goods_daily_refresh.js";
import { getSteelcrossMarketStallRefreshDefByMapId } from "./shop_goods_assets/steelcross_market_stall_refresh_defs.js";

export const SHOP_GOODS_CATALOG_DEFS = Object.freeze({
  heatcorridor_shop_window: HEATCORRIDOR_SHOP_WINDOW_CATALOG_DEF,
  bayport_clinic_counter_day: BAYPORT_CLINIC_COUNTER_CATALOG_DEF
});

const FIXED_STEELCROSS_STALL_GOODS = Object.freeze({
  steelcross_market_stall_03: Object.freeze(["material_rough_cloth"])
});

function mergeFixedGoodsForStall(stallId, itemIds) {
  const fixedItemIds = FIXED_STEELCROSS_STALL_GOODS[String(stallId || "").trim()] || [];
  const merged = new Set();
  for (const itemId of fixedItemIds) {
    const normalizedItemId = String(itemId || "").trim();
    if (normalizedItemId) merged.add(normalizedItemId);
  }
  for (const itemId of Array.isArray(itemIds) ? itemIds : []) {
    const normalizedItemId = String(itemId || "").trim();
    if (normalizedItemId) merged.add(normalizedItemId);
  }
  return Array.from(merged.values());
}

function normalizeCatalogItem(itemDef) {
  if (!itemDef) return null;
  const hasPrice = itemDef.price != null && Number.isFinite(Number(itemDef.price));
  const price = hasPrice ? Math.max(0, Math.trunc(Number(itemDef.price || 0))) : null;
  const purchaseMode = String(itemDef.purchaseMode || "inventory_item").trim().toLowerCase() === "instant_consume"
    ? "instant_consume"
    : "inventory_item";
  const sourceItemId = String(itemDef.itemId || itemDef.inventoryItemId || "").trim();
  const inventoryItemId = purchaseMode === "inventory_item" ? sourceItemId : "";
  const purchaseEnabled = itemDef.purchaseEnabled !== false && !!sourceItemId && price != null;
  return Object.freeze({
    id: String(itemDef.id || "").trim(),
    name: String(itemDef.name || itemDef.id || "").trim(),
    price,
    priceLabel: price == null ? "--" : String(price),
    tags: Object.freeze(Array.isArray(itemDef.tags) ? itemDef.tags.slice() : []),
    description: String(itemDef.description || "").trim(),
    icon: String(itemDef.icon || "utility_bundle").trim(),
    purchaseMode,
    sourceItemId,
    inventoryItemId,
    purchaseEnabled,
    purchaseActionId: purchaseEnabled ? SHOP_GOODS_PURCHASE_ACTION_ID : "",
    order: Math.max(0, Math.trunc(Number(itemDef.order || 0)))
  });
}

export function findShopGoodsCatalogItem(catalog, goodsId) {
  const normalizedGoodsId = String(goodsId || "").trim();
  if (!normalizedGoodsId) return null;
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  return items.find((item) => String(item?.id || "").trim() === normalizedGoodsId) || null;
}

export function resolveShopGoodsCatalog(mapId) {
  const normalizedMapId = String(mapId || "").trim();
  const definition = SHOP_GOODS_CATALOG_DEFS[normalizedMapId];
  if (!definition) {
    const stallDefinition = getSteelcrossMarketStallRefreshDefByMapId(normalizedMapId);
    if (!stallDefinition) return null;

    const refreshResult = resolveDailyStallGoods({
      stallId: stallDefinition.stallId,
      totalMinutes: Number(gameState?.time?.totalMinutes ?? 0),
      world: gameState?.world || {},
      definition: stallDefinition
    });
    if (!refreshResult) return null;

    const items = mergeFixedGoodsForStall(stallDefinition.stallId, refreshResult.itemIds)
      .map((itemId) => normalizeCatalogItem(getShopGoodsDef(itemId)))
      .filter(Boolean)
      .sort((left, right) => {
        const orderDelta = Number(left.order || 0) - Number(right.order || 0);
        if (orderDelta !== 0) return orderDelta;
        return String(left.id || "").localeCompare(String(right.id || ""));
      });

    return Object.freeze({
      id: `${stallDefinition.stallId}_goods`,
      title: String(stallDefinition.label || "商铺货物").trim() || "商铺货物",
      eyebrow: "货物",
      emptyStateMessage: String(refreshResult.emptyStateMessage || "今日货架还空着。"),
      items: Object.freeze(items),
      refreshMeta: Object.freeze({
        stallId: stallDefinition.stallId,
        dayKey: refreshResult.dayKey,
        dayIndex: refreshResult.dayIndex,
        selectedCount: refreshResult.selectedCount,
        candidateCount: refreshResult.candidateCount
      })
    });
  }

  const items = definition.itemIds
    .map((itemId) => normalizeCatalogItem(getShopGoodsDef(itemId)))
    .filter(Boolean)
    .sort((left, right) => {
      const orderDelta = Number(left.order || 0) - Number(right.order || 0);
      if (orderDelta !== 0) return orderDelta;
      return String(left.id || "").localeCompare(String(right.id || ""));
    });

  return Object.freeze({
    id: String(definition.id || "shop_goods_catalog").trim(),
    title: String(definition.title || "商铺货物").trim(),
    eyebrow: String(definition.eyebrow || "货物").trim(),
    emptyStateMessage: String(definition.emptyStateMessage || "摊布后面现在是空的。"),
    items: Object.freeze(items)
  });
}
