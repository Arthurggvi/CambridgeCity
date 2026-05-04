import { Effects } from "../../pipeline/effects.js";
import { resolveShopGoodsCatalog, findShopGoodsCatalogItem } from "../../shop_goods_catalog.js";
import {
  resolveShopGoodsPurchaseDef,
  SHOP_GOODS_PURCHASE_MODES
} from "../../shop_goods_defs.js";
import { resolveNightKitchenMenuCatalog, findNightKitchenCatalogPurchaseItem } from "../../night_kitchen_menu_catalog.js";
import { resolveNightKitchenFoodPurchase } from "../../night_kitchen_food_defs.js";
import { ensureItemsDbLoaded, getCapacityProfile, normalizeEquipment, normalizeInventory } from "../../items_db.js";
import { applyFoodIntakeToPlayer } from "../../player.js";
import { createBusinessIntent } from "../business_intent.js";
import { buildBusinessIntentRejection } from "../business_rejection.js";

const RESEARCHER_MANUSCRIPT_GOODS_ID = "doc_researcher_manuscript";
const RESEARCHER_MANUSCRIPT_CLAIM_FLAG_PATH = "world.flags.newFourMisc.researcherManuscriptClaimed";

function normalizeText(value) {
  return String(value || "").trim();
}

function clonePlayer(player) {
  return JSON.parse(JSON.stringify(player || {}));
}

function findInventoryIndex(inventory, itemId) {
  return inventory.findIndex((row) => row.itemId === itemId && row.qty > 0);
}

function countKindsInCategory(inventory, category, itemsById) {
  const set = new Set();
  for (const row of inventory) {
    const def = itemsById.get(row.itemId);
    if (def?.category === category && row.qty > 0) {
      set.add(row.itemId);
    }
  }
  return set.size;
}

function tryAddItemForBusiness(inventory, itemId, qty, itemsById, capacity) {
  const addQty = Math.floor(Number(qty));
  if (!Number.isFinite(addQty) || addQty <= 0) {
    return { ok: false, reason: "数量无效", reasonCode: "invalid_quantity" };
  }

  const itemDef = itemsById.get(itemId);
  if (!itemDef) {
    return { ok: false, reason: `未定义物品：${itemId}`, reasonCode: "item_undefined" };
  }

  const next = inventory.map((row) => ({ ...row }));
  const kindLimit = Math.max(1, Math.floor(Number(capacity?.kindLimit ?? 2)));
  const stackLimit = Math.max(1, Math.floor(Number(capacity?.stackLimit ?? 1)));

  for (let index = 0; index < addQty; index += 1) {
    const foundIndex = findInventoryIndex(next, itemId);
    if (foundIndex >= 0) {
      if (next[foundIndex].qty >= stackLimit) {
        return {
          ok: false,
          reason: `【${itemDef.name}】已达单种上限 ${stackLimit}`,
          reasonCode: "stack_limit_reached"
        };
      }
      next[foundIndex].qty += 1;
      continue;
    }

    const category = String(itemDef.category || "");
    const kinds = countKindsInCategory(next, category, itemsById);
    if (kinds >= kindLimit) {
      return {
        ok: false,
        reason: `【${category}】种类已达上限 ${kindLimit}`,
        reasonCode: "kind_limit_reached"
      };
    }

    next.push({ itemId, qty: 1 });
  }

  return { ok: true, next };
}

function buildRejectUiHint(title, message) {
  return {
    title: normalizeText(title) || "状态更新",
    message: normalizeText(message) || "当前不可购买",
    variant: "reject"
  };
}

function buildPreviewRejection(intent, code, reason, reasons = [], uiTitle = "状态更新") {
  return buildBusinessIntentRejection(intent, "business_preview", code, reason, reasons, {
    uiHint: buildRejectUiHint(uiTitle, reason)
  });
}

function buildCommittedUiHint(snapshot) {
  if (snapshot.channel === "shop_goods") {
    return {
      title: snapshot.purchaseMode === SHOP_GOODS_PURCHASE_MODES.INVENTORY_ITEM ? "商铺货物" : "商铺货物",
      message: snapshot.purchaseMode === SHOP_GOODS_PURCHASE_MODES.INVENTORY_ITEM
        ? `已购买 ${snapshot.itemName}`
        : `已饮用 ${snapshot.itemName}`,
      variant: "shop_purchase_success"
    };
  }
  return {
    title: snapshot.purchaseMode === "inventory_item" ? "已打包" : "已取餐",
    message: snapshot.purchaseMode === "inventory_item" ? `已打包 ${snapshot.itemName}` : `已取餐 ${snapshot.itemName}`,
    variant: snapshot.purchaseMode === "inventory_item" ? "purchase_takeout" : "purchase_dine"
  };
}

function buildClaimChildIntent(intent, snapshot) {
  if (!snapshot.shouldClaimManuscript) return null;
  return createBusinessIntent({
    requestId: `${intent.requestId}:claim:researcher_manuscript`,
    executorId: "claim",
    businessType: "claim",
    idempotencyMode: "target",
    source: intent.source,
    payload: {
      claimKey: "new_four_misc.researcher_manuscript",
      flagPath: RESEARCHER_MANUSCRIPT_CLAIM_FLAG_PATH,
      targetKey: RESEARCHER_MANUSCRIPT_CLAIM_FLAG_PATH,
      uiTitle: "商铺货物"
    }
  });
}

async function resolveShopGoodsSnapshot(state, intent) {
  const currentMapId = normalizeText(state?.currentMapId || state?.world?.currentMapId);
  const payloadMapId = normalizeText(intent?.payload?.mapId);
  const goodsId = normalizeText(intent?.payload?.goodsId);
  const catalog = resolveShopGoodsCatalog(payloadMapId || currentMapId);
  const catalogItem = findShopGoodsCatalogItem(catalog, goodsId);
  const shopTitle = normalizeText(catalog?.title || state?.currentMap?.name || "商铺货物") || "商铺货物";

  if (payloadMapId && currentMapId && payloadMapId !== currentMapId) {
    return {
      ok: false,
      code: "MAP_MISMATCH",
      reason: "当前不在该商铺场景",
      reasons: ["当前不在该商铺场景"],
      uiTitle: shopTitle
    };
  }

  if (!goodsId || !catalogItem) {
    return {
      ok: false,
      code: "ITEM_NOT_AVAILABLE",
      reason: "该货物当前不可购买",
      reasons: ["该货物当前不可购买"],
      uiTitle: shopTitle
    };
  }

  const purchase = resolveShopGoodsPurchaseDef(goodsId);
  if (!purchase.ok) {
    const reasonMap = {
      missing_goods_def: ["MISSING_GOODS_DEF", "该货物当前不可购买"],
      purchase_disabled: ["PURCHASE_DISABLED", "该货物当前不可购买"],
      missing_inventory_item: ["MISSING_ITEM_ID", "该货物当前不可购买"],
      invalid_price: ["INVALID_PRICE", "该货物当前不可购买"]
    };
    const mapped = reasonMap[purchase.reason] || ["INVALID_PURCHASE_DEFINITION", "该货物当前不可购买"];
    return {
      ok: false,
      code: mapped[0],
      reason: mapped[1],
      reasons: [mapped[1]],
      uiTitle: shopTitle
    };
  }

  const loaded = await ensureItemsDbLoaded();
  if (!loaded.ok) {
    return {
      ok: false,
      code: "ITEMS_DB_LOAD_FAILED",
      reason: loaded.error || "物品数据库加载失败",
      reasons: [loaded.error || "物品数据库加载失败"],
      uiTitle: shopTitle
    };
  }

  const itemsById = loaded.byId;
  const itemDef = itemsById.get(purchase.itemId);
  if (!itemDef) {
    return {
      ok: false,
      code: "INVENTORY_ITEM_NOT_FOUND",
      reason: "该货物当前不可购买",
      reasons: ["该货物当前不可购买"],
      uiTitle: shopTitle
    };
  }

  const money = Math.max(0, Math.trunc(Number(state?.world?.money ?? 0)));
  if (money < purchase.price) {
    return {
      ok: false,
      code: "INSUFFICIENT_FUNDS",
      reason: "余额不足",
      reasons: ["余额不足"],
      uiTitle: shopTitle
    };
  }

  let addResult = null;
  let intakeResult = null;
  const inventory = normalizeInventory(state?.player?.inventory);
  const equipment = normalizeEquipment(state?.player?.equipment);
  if (purchase.purchaseMode === SHOP_GOODS_PURCHASE_MODES.INVENTORY_ITEM) {
    addResult = tryAddItemForBusiness(inventory, purchase.inventoryItemId, 1, itemsById, getCapacityProfile(equipment, itemsById));
    if (!addResult.ok) {
      const code = addResult.reasonCode === "stack_limit_reached"
        ? "STACK_LIMIT_REACHED"
        : addResult.reasonCode === "kind_limit_reached"
          ? "KIND_LIMIT_REACHED"
          : "INVENTORY_ADD_FAILED";
      return {
        ok: false,
        code,
        reason: addResult.reason || "背包放不下",
        reasons: [addResult.reason || "背包放不下"],
        uiTitle: shopTitle
      };
    }
  } else {
    const previewPlayer = clonePlayer(state?.player);
    intakeResult = applyFoodIntakeToPlayer(previewPlayer, itemDef);
  }

  return {
    ok: true,
    channel: "shop_goods",
    shopTitle,
    money,
    purchase,
    itemDef,
    addResult,
    intakeResult,
    shouldClaimManuscript: goodsId === RESEARCHER_MANUSCRIPT_GOODS_ID,
    targetKey: `shop_goods:${payloadMapId || currentMapId}:${goodsId}`
  };
}

async function resolveNightKitchenSnapshot(state, intent) {
  const mapId = normalizeText(intent?.payload?.mapId || state?.currentMapId || state?.world?.currentMapId);
  const foodId = normalizeText(intent?.payload?.foodId || intent?.payload?.itemId);
  const menuMode = normalizeText(intent?.payload?.menuMode || intent?.payload?.mode).toLowerCase();
  const catalog = resolveNightKitchenMenuCatalog(mapId);
  const catalogItem = findNightKitchenCatalogPurchaseItem(catalog, {
    foodId,
    menuMode,
    purchaseActionId: normalizeText(intent?.source?.actionId)
  });
  if (!foodId || !menuMode || !catalogItem) {
    return {
      ok: false,
      code: "ITEM_NOT_AVAILABLE",
      reason: "当前菜单中没有这项可购买商品",
      reasons: ["当前菜单中没有这项可购买商品"],
      uiTitle: "夜灶窗口"
    };
  }

  const purchase = resolveNightKitchenFoodPurchase(foodId, menuMode);
  if (!purchase.ok) {
    return {
      ok: false,
      code: "INVALID_PURCHASE_DEFINITION",
      reason: "商品购买语义未正确声明",
      reasons: ["商品购买语义未正确声明"],
      uiTitle: "夜灶窗口"
    };
  }

  const price = Math.max(0, Math.trunc(Number(catalogItem.purchasePrice ?? purchase.price ?? 0)));
  const money = Math.max(0, Math.trunc(Number(state?.world?.money ?? 0)));
  if (money < price) {
    return {
      ok: false,
      code: "INSUFFICIENT_FUNDS",
      reason: "余额不足",
      reasons: ["余额不足"],
      uiTitle: "夜灶窗口"
    };
  }

  const loaded = await ensureItemsDbLoaded();
  if (!loaded.ok) {
    return {
      ok: false,
      code: "ITEMS_DB_LOAD_FAILED",
      reason: loaded.error || "物品数据库加载失败",
      reasons: [loaded.error || "物品数据库加载失败"],
      uiTitle: "夜灶窗口"
    };
  }

  const itemsById = loaded.byId;
  let itemDef = null;
  let addResult = null;
  let intakeResult = null;
  const inventory = normalizeInventory(state?.player?.inventory);
  const equipment = normalizeEquipment(state?.player?.equipment);

  if (purchase.purchaseMode === "inventory_item") {
    const inventoryItemId = normalizeText(purchase.itemId || catalogItem.inventoryItemId);
    itemDef = itemsById.get(inventoryItemId);
    if (!inventoryItemId || !itemDef) {
      return {
        ok: false,
        code: "MISSING_ITEM_ID",
        reason: "打包商品缺少有效 itemId",
        reasons: ["打包商品缺少有效 itemId"],
        uiTitle: "夜灶打包"
      };
    }
    if (normalizeText(itemDef.category) !== "consumable") {
      return {
        ok: false,
        code: "INVALID_ITEM_CATEGORY",
        reason: "打包商品必须落到 consumable 物品",
        reasons: ["打包商品必须落到 consumable 物品"],
        uiTitle: "夜灶打包"
      };
    }
    addResult = tryAddItemForBusiness(inventory, inventoryItemId, 1, itemsById, getCapacityProfile(equipment, itemsById));
    if (!addResult.ok) {
      const code = addResult.reasonCode === "stack_limit_reached"
        ? "STACK_LIMIT_REACHED"
        : addResult.reasonCode === "kind_limit_reached"
          ? "KIND_LIMIT_REACHED"
          : "INVENTORY_ADD_FAILED";
      return {
        ok: false,
        code,
        reason: addResult.reason || "背包已满",
        reasons: [addResult.reason || "背包已满"],
        uiTitle: "夜灶打包"
      };
    }
  } else {
    itemDef = purchase.foodDef;
    const previewPlayer = clonePlayer(state?.player);
    intakeResult = applyFoodIntakeToPlayer(previewPlayer, purchase.foodDef.effects || {});
  }

  return {
    ok: true,
    channel: "night_kitchen",
    shopTitle: "夜灶窗口",
    money,
    price,
    purchase: {
      ...purchase,
      price
    },
    itemDef,
    addResult,
    intakeResult,
    shouldClaimManuscript: false,
    targetKey: `night_kitchen:${mapId}:${foodId}:${menuMode}`
  };
}

async function resolvePurchaseSnapshot(state, intent) {
  const channel = normalizeText(intent?.payload?.channel);
  if (channel === "shop_goods") {
    return resolveShopGoodsSnapshot(state, intent);
  }
  if (channel === "night_kitchen") {
    return resolveNightKitchenSnapshot(state, intent);
  }
  return {
    ok: false,
    code: "PURCHASE_CHANNEL_INVALID",
    reason: "购买语义未正确声明",
    reasons: ["购买语义未正确声明"],
    uiTitle: "状态更新"
  };
}

export const shopPurchaseExecutor = Object.freeze({
  executorId: "shop_purchase",
  businessType: "purchase",

  buildIntentPayloadFromMapAction({ mapAction, map, payload } = {}) {
    const spec = mapAction?.semantic?.purchase;
    if (!spec || typeof spec !== "object") return null;
    const channel = normalizeText(spec.channel);
    if (channel === "shop_goods") {
      return {
        channel,
        mapId: normalizeText(spec.mapId || map?.id),
        goodsId: normalizeText(payload?.goodsId || payload?.itemId || spec.goodsId)
      };
    }
    if (channel === "night_kitchen") {
      return {
        channel,
        mapId: normalizeText(spec.mapId || map?.id),
        foodId: normalizeText(payload?.foodId || payload?.itemId || spec.foodId),
        menuMode: normalizeText(payload?.mode || payload?.menuMode || spec.menuMode).toLowerCase()
      };
    }
    return null;
  },

  buildIntentPayloadFromShopGoodsUi(payload = {}) {
    return {
      channel: "shop_goods",
      mapId: normalizeText(payload.mapId),
      goodsId: normalizeText(payload.goodsId)
    };
  },

  buildIntentPayloadFromNightKitchenRequest(payload = {}, interaction = null) {
    return {
      channel: "night_kitchen",
      mapId: normalizeText(payload.mapId),
      foodId: normalizeText(payload.foodId || payload.itemId || interaction?.purchase?.foodId),
      menuMode: normalizeText(payload.menuMode || payload.mode || interaction?.purchase?.menuMode).toLowerCase()
    };
  },

  async previewEligibility(state, intent) {
    const snapshot = await resolvePurchaseSnapshot(state, intent);
    if (!snapshot.ok) {
      return {
        ok: false,
        rejection: buildPreviewRejection(intent, snapshot.code, snapshot.reason, snapshot.reasons, snapshot.uiTitle)
      };
    }
    return { ok: true, snapshot };
  },

  async readCommitProof(state, intent) {
    const snapshot = await resolvePurchaseSnapshot(state, intent);
    return {
      targetKey: snapshot?.targetKey || null,
      snapshot
    };
  },

  async isAlreadyCommitted() {
    return false;
  },

  async finalEligibility(state, intent) {
    return this.previewEligibility(state, intent);
  },

  async buildCommitBundle(state, intent, context = {}) {
    const snapshot = context?.finalEligibility?.snapshot || context?.proof?.snapshot;
    const purchase = snapshot.purchase;
    const itemName = normalizeText(snapshot?.itemDef?.name || purchase?.goodsDef?.name || purchase?.foodDef?.name || purchase?.itemId);
    const effects = [
      Effects.add("world.money", -purchase.price)
    ];
    const testFault = normalizeText(intent?.payload?.testFault);
    if (testFault === "inject_invalid_effect_after_money") {
      effects.push(Effects.add("player.inventory", 1));
    }
    const outputs = {
      channel: snapshot.channel,
      purchaseMode: purchase.purchaseMode,
      itemId: normalizeText(snapshot?.itemDef?.id || purchase.itemId || purchase.goodsId || purchase.foodId) || null,
      itemName,
      price: purchase.price,
      quantity: 1,
      testFault: testFault || null
    };
    const before = {
      money: snapshot.money,
      itemQty: purchase.purchaseMode === SHOP_GOODS_PURCHASE_MODES.INVENTORY_ITEM
        ? Math.max(0, Number(normalizeInventory(state?.player?.inventory).find((row) => row.itemId === purchase.inventoryItemId || row.itemId === purchase.itemId)?.qty || 0))
        : null
    };
    const after = {
      money: snapshot.money - purchase.price,
      itemQty: purchase.purchaseMode === SHOP_GOODS_PURCHASE_MODES.INVENTORY_ITEM
        ? Math.max(0, Number(snapshot?.addResult?.next?.find((row) => row.itemId === purchase.inventoryItemId || row.itemId === purchase.itemId)?.qty || 0))
        : null
    };

    if (purchase.purchaseMode === SHOP_GOODS_PURCHASE_MODES.INVENTORY_ITEM) {
      effects.push(Effects.set("player.inventory", snapshot.addResult.next));
    } else if (snapshot.intakeResult?.playerStateChanged) {
      effects.push(Effects.set("player.psycho.hp", snapshot.intakeResult.hp));
      effects.push(Effects.set("player.physio.satiety", snapshot.intakeResult.satiety));
      effects.push(Effects.set("player.physio.stamina", snapshot.intakeResult.stamina));
      effects.push(Effects.set("player.psycho.fatigue", snapshot.intakeResult.fatigue));
      effects.push(Effects.set("player.physio.temperatureC", snapshot.intakeResult.temperatureC));
      effects.push(Effects.set("player.physio.intakeLoad", snapshot.intakeResult.intakeLoad));
      effects.push(Effects.set("player.meta.statusEffects", snapshot.intakeResult.statusEffects));
    }

    const childIntent = buildClaimChildIntent(intent, snapshot);
    return {
      allowPartialCommit: false,
      targetKey: snapshot.targetKey,
      before,
      after,
      outputs,
      uiHint: buildCommittedUiHint({
        channel: snapshot.channel,
        purchaseMode: purchase.purchaseMode,
        itemName
      }),
      effects,
      childIntents: childIntent ? [childIntent] : []
    };
  }
});