export const NIGHT_KITCHEN_PURCHASE_MODES = Object.freeze({
  INSTANT_CONSUME: "instant_consume",
  INVENTORY_ITEM: "inventory_item"
});

function freezePurchaseModes(modes) {
  const next = {};
  for (const [menuMode, rawDef] of Object.entries(modes || {})) {
    if (!rawDef || typeof rawDef !== "object") continue;
    const purchaseMode = String(rawDef.purchaseMode || "").trim();
    if (!purchaseMode) continue;
    const entry = {
      purchaseMode
    };
    if (Number.isFinite(Number(rawDef.price))) {
      entry.price = Number(rawDef.price);
    }
    if (rawDef.itemId != null) {
      entry.itemId = String(rawDef.itemId || "").trim();
    }
    next[String(menuMode || "").trim()] = Object.freeze(entry);
  }
  return Object.freeze(next);
}

function createFoodDef(def) {
  return Object.freeze({
    ...def,
    tags: Object.freeze(Array.isArray(def?.tags) ? def.tags.slice() : []),
    serving: Object.freeze(Array.isArray(def?.serving) ? def.serving.slice() : []),
    serviceBands: Object.freeze(Array.isArray(def?.serviceBands) ? def.serviceBands.slice() : []),
    effects: Object.freeze(def?.effects && typeof def.effects === "object" ? { ...def.effects } : {}),
    purchaseModes: freezePurchaseModes(def?.purchaseModes)
  });
}

export const NIGHT_KITCHEN_FOOD_DEFS = Object.freeze({
  signature_braised_pork_set: createFoodDef({
    id: "signature_braised_pork_set",
    name: "金牌卤肉套餐",
    iconId: "braised_pork_set",
    price: 20,
    description: "卤肉压得厚，热饭和配菜装得满，吃完整个人会慢慢缓下来。",
    contentsText: "卤肉饭、紫菜蛋花汤、热水（无限畅饮）",
    instantEffectText: "饱腹感 +12",
    durationEffectText: "2小时内体能衰减速率 -20%",
    tags: Object.freeze(["热", "招牌", "顶饿", "堂食限定"]),
    serving: Object.freeze(["堂食"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({
      satietyGain: 12,
      intakeLoadCost: 9,
      staminaDecayModifier: Object.freeze({
        multiplier: 0.8,
        durationMinutes: 120,
        source: "signature_braised_pork_set"
      })
    }),
    purchaseModes: Object.freeze({
      dine: Object.freeze({ purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INSTANT_CONSUME })
    })
  }),
  rice_bowl_snack_set: createFoodDef({
    id: "rice_bowl_snack_set",
    name: "盖浇饭小食套餐",
    iconId: "rice_bowl_snack_set",
    price: 23,
    description: "肉末茄子、豆角炖肉盖浇饭 烤肠一根 玉米汤 红茶",
    contentsText: "肉末茄子、豆角炖肉盖浇饭、烤肠一根、玉米汤、红茶",
    instantEffectText: "饱腹感 +14",
    durationEffectText: "2小时内饱腹下降速率 -15%",
    tags: Object.freeze(["堂食", "套餐"]),
    serving: Object.freeze(["堂食"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({
      satietyGain: 14,
      satietyDecayModifier: Object.freeze({
        multiplier: 0.85,
        durationMinutes: 120,
        source: "rice_bowl_snack_set"
      })
    }),
    purchaseModes: Object.freeze({
      dine: Object.freeze({ purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INSTANT_CONSUME })
    })
  }),
  overlord_set_meal: createFoodDef({
    id: "overlord_set_meal",
    name: "霸王套餐",
    iconId: "overlord_set_meal",
    price: 26,
    description: "红烧肉、红油糍粑、海带腐竹香菇汤、米饭、姜丝可乐",
    contentsText: "红烧肉、红油糍粑、海带腐竹香菇汤、米饭、姜丝可乐",
    instantEffectText: "饱腹感 +18",
    durationEffectText: "2小时内体温下降速度 -15%",
    tags: Object.freeze(["堂食", "套餐"]),
    serving: Object.freeze(["堂食"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({
      satietyGain: 18,
      bodyTemperatureDecayModifier: Object.freeze({
        multiplier: 0.85,
        durationMinutes: 120,
        source: "overlord_set_meal"
      })
    }),
    purchaseModes: Object.freeze({
      dine: Object.freeze({ purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INSTANT_CONSUME })
    })
  }),
  // Takeout-only food defs keep menu copy and purchase semantics in the data layer
  // so catalog/view model can stay generic and renderer does not need item-specific branches.
  takeout_soy_fried_rice: createFoodDef({
    id: "takeout_soy_fried_rice",
    name: "酱油炒饭",
    iconId: "rice_bowl",
    price: 8,
    description: "蛋碎、葱花、酱油炒饭。",
    contentsText: "蛋碎、葱花、酱油炒饭",
    instantEffectText: "饱腹感 +6",
    durationEffectText: "无额外持续效果",
    tags: Object.freeze(["热", "打包", "主食"]),
    serving: Object.freeze(["可打包"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({
      satietyGain: 6
    }),
    purchaseModes: Object.freeze({
      takeout: Object.freeze({
        purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INVENTORY_ITEM,
        itemId: "consumable_takeout_soy_fried_rice",
        price: 8
      })
    })
  }),
  takeout_beef_potato_rice_bowl: createFoodDef({
    id: "takeout_beef_potato_rice_bowl",
    name: "土豆牛肉末拌饭",
    iconId: "rice_bowl_heavy",
    price: 12,
    description: "土豆丁、牛肉末、酱汁、米饭。",
    contentsText: "土豆丁、牛肉末、酱汁、米饭",
    instantEffectText: "饱腹感 +9",
    durationEffectText: "45分钟内饱腹下降速率 -5%",
    tags: Object.freeze(["热", "打包", "主食"]),
    serving: Object.freeze(["可打包"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({
      satietyGain: 9,
      satietyDecayModifier: Object.freeze({
        multiplier: 0.95,
        durationMinutes: 45,
        source: "takeout_beef_potato_rice_bowl"
      })
    }),
    purchaseModes: Object.freeze({
      takeout: Object.freeze({
        purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INVENTORY_ITEM,
        itemId: "consumable_takeout_beef_potato_rice_bowl",
        price: 12
      })
    })
  }),
  takeout_pork_scallion_buns_4: createFoodDef({
    id: "takeout_pork_scallion_buns_4",
    name: "猪肉大葱包（4个）",
    iconId: "takeout_box",
    price: 11,
    description: "猪肉大葱包 4 个。",
    contentsText: "猪肉大葱包 4 个",
    instantEffectText: "饱腹感 +9",
    durationEffectText: "45分钟内饱腹下降速率 -4%",
    tags: Object.freeze(["热", "打包", "面点"]),
    serving: Object.freeze(["可打包"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({
      satietyGain: 9,
      satietyDecayModifier: Object.freeze({
        multiplier: 0.96,
        durationMinutes: 45,
        source: "takeout_pork_scallion_buns_4"
      })
    }),
    purchaseModes: Object.freeze({
      takeout: Object.freeze({
        purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INVENTORY_ITEM,
        itemId: "consumable_takeout_pork_scallion_buns_4",
        price: 11
      })
    })
  }),
  takeout_beef_onion_pies_2: createFoodDef({
    id: "takeout_beef_onion_pies_2",
    name: "牛肉洋葱馅饼（2张）",
    iconId: "takeout_box",
    price: 12,
    description: "牛肉洋葱馅饼 2 张。",
    contentsText: "牛肉洋葱馅饼 2 张",
    instantEffectText: "饱腹感 +9",
    durationEffectText: "45分钟内体能衰减速率 -4%",
    tags: Object.freeze(["热", "打包", "面点"]),
    serving: Object.freeze(["可打包"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({
      satietyGain: 9,
      staminaDecayModifier: Object.freeze({
        multiplier: 0.96,
        durationMinutes: 45,
        source: "takeout_beef_onion_pies_2"
      })
    }),
    purchaseModes: Object.freeze({
      takeout: Object.freeze({
        purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INVENTORY_ITEM,
        itemId: "consumable_takeout_beef_onion_pies_2",
        price: 12
      })
    })
  }),
  takeout_youtiao_2: createFoodDef({
    id: "takeout_youtiao_2",
    name: "油条（2根）",
    iconId: "takeout_box",
    price: 4,
    description: "油条 2 根。",
    contentsText: "油条 2 根",
    instantEffectText: "饱腹感 +3",
    durationEffectText: "无额外持续效果",
    tags: Object.freeze(["打包", "面点"]),
    serving: Object.freeze(["可打包"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({
      satietyGain: 3
    }),
    purchaseModes: Object.freeze({
      takeout: Object.freeze({
        purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INVENTORY_ITEM,
        itemId: "consumable_takeout_youtiao_2",
        price: 4
      })
    })
  }),
  takeout_lo_mai_gai: createFoodDef({
    id: "takeout_lo_mai_gai",
    name: "糯米鸡",
    iconId: "takeout_box",
    price: 9,
    description: "糯米鸡 1 份。",
    contentsText: "糯米鸡 1 份",
    instantEffectText: "饱腹感 +7",
    durationEffectText: "45分钟内饱腹下降速率 -4%",
    tags: Object.freeze(["热", "打包", "蒸点"]),
    serving: Object.freeze(["可打包"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({
      satietyGain: 7,
      satietyDecayModifier: Object.freeze({
        multiplier: 0.96,
        durationMinutes: 45,
        source: "takeout_lo_mai_gai"
      })
    }),
    purchaseModes: Object.freeze({
      takeout: Object.freeze({
        purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INVENTORY_ITEM,
        itemId: "consumable_takeout_lo_mai_gai",
        price: 9
      })
    })
  }),
  takeout_ginger_cola_hot: createFoodDef({
    id: "takeout_ginger_cola_hot",
    name: "姜丝可乐热饮",
    iconId: "cup",
    price: 4,
    description: "姜丝可乐，热饮杯装。",
    contentsText: "姜丝可乐，热饮杯装",
    instantEffectText: "饱腹感 +2",
    durationEffectText: "无额外持续效果",
    tags: Object.freeze(["热", "打包", "饮品"]),
    serving: Object.freeze(["可打包"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({
      satietyGain: 2
    }),
    purchaseModes: Object.freeze({
      takeout: Object.freeze({
        purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INVENTORY_ITEM,
        itemId: "consumable_takeout_ginger_cola_hot",
        price: 4
      })
    })
  }),
  takeout_braised_ribs_rice_box: createFoodDef({
    id: "takeout_braised_ribs_rice_box",
    name: "酱排骨饭盒",
    iconId: "rice_bowl_heavy",
    price: 18,
    description: "酱排骨、米饭、腌菜。",
    contentsText: "酱排骨、米饭、腌菜",
    instantEffectText: "饱腹感 +14",
    durationEffectText: "60分钟内体温下降速度 -6%",
    tags: Object.freeze(["热", "打包", "主食"]),
    serving: Object.freeze(["可打包"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({
      satietyGain: 14,
      bodyTemperatureDecayModifier: Object.freeze({
        multiplier: 0.94,
        durationMinutes: 60,
        source: "takeout_braised_ribs_rice_box"
      })
    }),
    purchaseModes: Object.freeze({
      takeout: Object.freeze({
        purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INVENTORY_ITEM,
        itemId: "consumable_takeout_braised_ribs_rice_box",
        price: 18
      })
    })
  }),
  braised_pork_rice: createFoodDef({
    id: "braised_pork_rice",
    name: "卤肉饭",
    iconId: "rice_bowl",
    price: 18,
    description: "酱汁压得厚，米饭装得实，热气顶上来时先闻到咸香。",
    tags: Object.freeze(["热", "咸", "顶饿", "夜间常备"]),
    serving: Object.freeze(["堂食"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({ satietyGain: 11, intakeLoadCost: 8 }),
    purchaseModes: Object.freeze({
      dine: Object.freeze({ purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INSTANT_CONSUME }),
      takeout: Object.freeze({
        purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INVENTORY_ITEM,
        itemId: "consumable_takeout_braised_pork_rice",
        price: 19
      })
    })
  }),
  beef_potato_rice: createFoodDef({
    id: "beef_potato_rice",
    name: "土豆烧牛肉饭",
    iconId: "rice_bowl_heavy",
    price: 22,
    description: "土豆和牛肉都炖得发沉，酱汁挂在饭上，吃完更压得住饿。",
    tags: Object.freeze(["热", "顶饿"]),
    serving: Object.freeze(["堂食"]),
    nightRetained: false,
    serviceBands: Object.freeze(["day_service"]),
    effects: Object.freeze({ satietyGain: 12, intakeLoadCost: 9 }),
    purchaseModes: Object.freeze({
      dine: Object.freeze({ purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INSTANT_CONSUME })
    })
  }),
  tomato_egg_rice: createFoodDef({
    id: "tomato_egg_rice",
    name: "番茄鸡蛋饭",
    iconId: "rice_bowl_light",
    price: 14,
    description: "酸味和蛋香都很直，像窗口里最稳的一份便宜热饭。",
    tags: Object.freeze(["热", "便宜"]),
    serving: Object.freeze(["堂食"]),
    nightRetained: false,
    serviceBands: Object.freeze(["day_service"]),
    effects: Object.freeze({ satietyGain: 9, intakeLoadCost: 7 }),
    purchaseModes: Object.freeze({
      dine: Object.freeze({ purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INSTANT_CONSUME })
    })
  }),
  seaweed_egg_soup: createFoodDef({
    id: "seaweed_egg_soup",
    name: "紫菜蛋花汤",
    iconId: "soup_bowl",
    price: 8,
    description: "汤面薄薄浮着紫菜和蛋花，热得快，喝下去比看着更有用。",
    tags: Object.freeze(["热", "汤"]),
    serving: Object.freeze(["堂食"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({ satietyGain: 5, intakeLoadCost: 3 }),
    purchaseModes: Object.freeze({
      dine: Object.freeze({ purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INSTANT_CONSUME }),
      takeout: Object.freeze({
        purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INVENTORY_ITEM,
        itemId: "consumable_takeout_seaweed_egg_soup"
      })
    })
  }),
  hot_water: createFoodDef({
    id: "hot_water",
    name: "热水",
    iconId: "cup",
    price: 2,
    description: "金属壶口一直冒白气，端起来时杯壁都有点烫手。",
    tags: Object.freeze(["热"]),
    serving: Object.freeze(["堂食", "可打包"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({ satietyGain: 0, intakeLoadCost: 0 }),
    purchaseModes: Object.freeze({
      dine: Object.freeze({ purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INSTANT_CONSUME }),
      takeout: Object.freeze({
        purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INVENTORY_ITEM,
        itemId: "consumable_takeout_hot_water"
      })
    })
  }),
  strong_tea: createFoodDef({
    id: "strong_tea",
    name: "浓茶",
    iconId: "tea_cup",
    price: 4,
    description: "茶色压得很深，苦味先上来，后面才留下一点回甘。",
    tags: Object.freeze(["热", "提神"]),
    serving: Object.freeze(["堂食", "可打包"]),
    nightRetained: true,
    serviceBands: Object.freeze(["day_service", "night_service"]),
    effects: Object.freeze({ satietyGain: 1, intakeLoadCost: 0.5 }),
    purchaseModes: Object.freeze({
      dine: Object.freeze({ purchaseMode: NIGHT_KITCHEN_PURCHASE_MODES.INSTANT_CONSUME })
    })
  })
});

export function getNightKitchenFoodDef(itemId) {
  return NIGHT_KITCHEN_FOOD_DEFS[String(itemId || "").trim()] || null;
}

export function normalizeNightKitchenMenuMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "dine" || normalized === "takeout") return normalized;
  return "";
}

export function resolveNightKitchenFoodPurchase(foodId, menuMode) {
  const foodDef = getNightKitchenFoodDef(foodId);
  if (!foodDef) {
    return { ok: false, reason: "missing_food_definition", foodId: String(foodId || "").trim() };
  }

  const normalizedMenuMode = normalizeNightKitchenMenuMode(menuMode);
  if (!normalizedMenuMode) {
    return { ok: false, reason: "missing_menu_mode", foodId: foodDef.id };
  }

  const purchaseDef = foodDef.purchaseModes?.[normalizedMenuMode] || null;
  if (!purchaseDef) {
    return {
      ok: false,
      reason: "unsupported_menu_mode",
      foodId: foodDef.id,
      menuMode: normalizedMenuMode
    };
  }

  const purchaseMode = String(purchaseDef.purchaseMode || "").trim();
  if (purchaseMode !== NIGHT_KITCHEN_PURCHASE_MODES.INSTANT_CONSUME
    && purchaseMode !== NIGHT_KITCHEN_PURCHASE_MODES.INVENTORY_ITEM) {
    return {
      ok: false,
      reason: "invalid_purchase_mode",
      foodId: foodDef.id,
      menuMode: normalizedMenuMode
    };
  }

  const itemId = String(purchaseDef.itemId || "").trim();
  if (purchaseMode === NIGHT_KITCHEN_PURCHASE_MODES.INVENTORY_ITEM && !itemId) {
    return {
      ok: false,
      reason: "missing_item_id",
      foodId: foodDef.id,
      menuMode: normalizedMenuMode,
      purchaseMode
    };
  }

  const price = Number.isFinite(Number(purchaseDef.price)) ? Number(purchaseDef.price) : Number(foodDef.price || 0);
  return {
    ok: true,
    foodId: foodDef.id,
    menuMode: normalizedMenuMode,
    purchaseMode,
    itemId: itemId || null,
    price: Number.isFinite(price) ? price : 0,
    foodDef
  };
}