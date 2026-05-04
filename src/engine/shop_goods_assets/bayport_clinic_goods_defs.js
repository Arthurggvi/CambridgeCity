export const BAYPORT_CLINIC_SHOP_GOODS_DEFS = Object.freeze({
  clinic_basic_bandage: Object.freeze({
    id: "clinic_basic_bandage",
    name: "简易绷带",
    price: 12,
    purchaseEnabled: true,
    tags: Object.freeze(["药品", "基础处理", "诊所"]),
    description: "白纱卷得不算紧，拿来先把擦伤和裂口压住还够用。\n当前无额外效果",
    icon: "utility_bundle",
    inventoryItemId: "consumable_bandage",
    order: 10
  }),
  clinic_pain_relief_tablets: Object.freeze({
    id: "clinic_pain_relief_tablets",
    name: "止痛药",
    price: 16,
    purchaseEnabled: true,
    tags: Object.freeze(["药品", "应急", "诊所"]),
    description: "药盒边角磨得发白，疼得厉害时能先把钝痛压下去。\n健康流失速率-10% (02:00)\n体力-2 (即时)",
    icon: "pill_box",
    inventoryItemId: "consumable_pain_relief_tablets",
    order: 20
  }),
  clinic_oral_rehydration_salts: Object.freeze({
    id: "clinic_oral_rehydration_salts",
    name: "口服补液盐",
    price: 16,
    purchaseEnabled: true,
    tags: Object.freeze(["药品", "恢复", "诊所"]),
    description: "小包粉末冲开后带点咸甜味，适合在人发虚的时候慢慢补回来。\n体力恢复+10 (00:10)\n使用冷却 (01:00)",
    icon: "pill_box",
    inventoryItemId: "consumable_oral_rehydration_salts",
    order: 30
  }),
  clinic_dimenhydrinate: Object.freeze({
    id: "clinic_dimenhydrinate",
    name: "茶苯海明",
    price: 16,
    purchaseEnabled: true,
    tags: Object.freeze(["药品", "备用", "诊所"]),
    description: "防晕的小药片，先放在包里也算一种准备。\n当前无额外效果",
    icon: "pill_box",
    inventoryItemId: "consumable_dimenhydrinate",
    order: 40
  }),
  clinic_cetirizine: Object.freeze({
    id: "clinic_cetirizine",
    name: "西替利嗪",
    price: 16,
    purchaseEnabled: true,
    tags: Object.freeze(["药品", "备用", "诊所"]),
    description: "塑封小板很轻，像是那种你希望一直用不上的东西。\n当前无额外效果",
    icon: "pill_box",
    inventoryItemId: "consumable_cetirizine",
    order: 50
  }),
  clinic_portable_thermometer: Object.freeze({
    id: "clinic_portable_thermometer",
    name: "便携体温计",
    price: 50,
    purchaseEnabled: true,
    tags: Object.freeze(["工具", "体温", "诊所"]),
    description: "可以直接挂在身上的基础读数工具，出门前带一个总比没有强。",
    icon: "utility_bundle",
    inventoryItemId: "tool_thermometer",
    order: 60
  })
});