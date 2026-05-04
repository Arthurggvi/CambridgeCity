import { HEATCORRIDOR_SHOP_GOODS_DEFS } from "./shop_goods_assets/heatcorridor_goods_defs.js";
import { BAYPORT_CLINIC_SHOP_GOODS_DEFS } from "./shop_goods_assets/bayport_clinic_goods_defs.js";
import { STEELCROSS_MARKET_SHOP_GOODS_DEFS } from "./shop_goods_assets/steelcross_market_goods_defs.js";

export const SHOP_GOODS_PURCHASE_ACTION_ID = "shop_goods_purchase";
export const SHOP_GOODS_PURCHASE_MODES = Object.freeze({
  INVENTORY_ITEM: "inventory_item",
  INSTANT_CONSUME: "instant_consume"
});

const CORE_SHOP_GOODS_DEFS = Object.freeze({
  instant_noodles: Object.freeze({
    id: "instant_noodles",
    name: "杯面",
    price: 12,
    tags: Object.freeze(["热水冲泡", "顶饿", "窗口常见"]),
    description: "塑封杯壳被压出一道浅折，调料包和折叉都还塞在盖里。",
    icon: "cup_noodles",
    order: 10
  }),
  dry_cell_batteries: Object.freeze({
    id: "dry_cell_batteries",
    name: "电池",
    price: 18,
    tags: Object.freeze(["干货", "小件", "常备"]),
    description: "两节一板，硬塑壳边缘磨得发白，挂孔上还留着旧铁丝印。",
    icon: "battery_pack",
    order: 20
  }),
  polar_cigarettes: Object.freeze({
    id: "polar_cigarettes",
    name: "烟",
    price: 21,
    tags: Object.freeze(["纸盒", "小包", "窗口常拿"]),
    description: "纸盒从玻璃后排成窄窄一列，最外面的几包被反复拿放，盒角已经软了。",
    icon: "cigarette_pack",
    order: 30
  }),
  pain_relief_tablets: Object.freeze({
    id: "pain_relief_tablets",
    name: "止痛药",
    price: 27,
    tags: Object.freeze(["药品", "小盒", "应急"]),
    description: "白底药盒叠在玻璃后头，批号贴纸压在侧面，只露出半截黑字。",
    icon: "pill_box",
    order: 40
  }),
  daily_supplies_bundle: Object.freeze({
    id: "daily_supplies_bundle",
    name: "日用品若干",
    price: 9,
    tags: Object.freeze(["杂项", "补给", "零散"]),
    description: "牙刷、肥皂、小包纸巾和一次性手套挤在同一格里，包装边缘被潮气拱得发卷。",
    icon: "utility_bundle",
    order: 50
  })
});

const SHOP_GOODS_DEFS = Object.freeze({
  ...CORE_SHOP_GOODS_DEFS,
  ...BAYPORT_CLINIC_SHOP_GOODS_DEFS,
  ...HEATCORRIDOR_SHOP_GOODS_DEFS,
  ...STEELCROSS_MARKET_SHOP_GOODS_DEFS
});

export function getShopGoodsDef(id) {
  return SHOP_GOODS_DEFS[String(id || "").trim()] || null;
}

function normalizeShopGoodsPurchaseMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === SHOP_GOODS_PURCHASE_MODES.INSTANT_CONSUME
    ? SHOP_GOODS_PURCHASE_MODES.INSTANT_CONSUME
    : SHOP_GOODS_PURCHASE_MODES.INVENTORY_ITEM;
}

function resolveShopGoodsSourceItemId(goodsDef) {
  return String(goodsDef?.itemId || goodsDef?.inventoryItemId || "").trim();
}

export function resolveShopGoodsPurchaseDef(id) {
  const goodsDef = getShopGoodsDef(id);
  if (!goodsDef) {
    return { ok: false, reason: "missing_goods_def", goodsDef: null };
  }

  if (goodsDef.purchaseEnabled === false) {
    return { ok: false, reason: "purchase_disabled", goodsDef };
  }

  const purchaseMode = normalizeShopGoodsPurchaseMode(goodsDef.purchaseMode);
  const sourceItemId = resolveShopGoodsSourceItemId(goodsDef);
  if (!sourceItemId) {
    return { ok: false, reason: "missing_inventory_item", goodsDef };
  }

  const rawPrice = Number(goodsDef.price);
  if (!Number.isInteger(rawPrice) || rawPrice < 0) {
    return { ok: false, reason: "invalid_price", goodsDef, itemId: sourceItemId };
  }

  return {
    ok: true,
    goodsDef,
    goodsId: String(goodsDef.id || id || "").trim(),
    purchaseMode,
    itemId: sourceItemId,
    inventoryItemId: purchaseMode === SHOP_GOODS_PURCHASE_MODES.INVENTORY_ITEM ? sourceItemId : "",
    price: rawPrice,
    purchaseEnabled: true
  };
}

export function listShopGoodsDefs() {
  return Object.values(SHOP_GOODS_DEFS);
}
