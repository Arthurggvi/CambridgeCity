export const HEATCORRIDOR_SHOP_GOODS_DEFS = Object.freeze({
  old_knit_cap: Object.freeze({
    id: "old_knit_cap",
    name: "旧毛线帽",
    price: 45,
    purchaseEnabled: true,
    tags: Object.freeze(["clothing", "头饰", "旧货"]),
    description: "帽口有点松，毛线边沿起了球，还能把头顶直吹的冷风削掉一些。",
    icon: "knit_cap",
    inventoryItemId: "cloth_old_knit_cap",
    order: 10
  }),
  thin_gloves: Object.freeze({
    id: "thin_gloves",
    name: "薄手套",
    price: 35,
    purchaseEnabled: true,
    tags: Object.freeze(["clothing", "手部", "旧货"]),
    description: "布层很薄，指节活动不受影响，但保暖也只够勉强挡一层风。",
    icon: "thin_gloves",
    inventoryItemId: "cloth_thin_gloves",
    order: 20
  }),
  old_scarf: Object.freeze({
    id: "old_scarf",
    name: "旧围巾",
    price: 40,
    purchaseEnabled: true,
    tags: Object.freeze(["clothing", "颈部", "旧织物"]),
    description: "边角已经起线，绕在领口处还能勉强把那道漏风缝填上。",
    icon: "old_scarf",
    inventoryItemId: "cloth_old_scarf",
    order: 30
  }),
  compressed_biscuits: Object.freeze({
    id: "compressed_biscuits",
    name: "压缩饼干",
    price: 3,
    purchaseEnabled: true,
    tags: Object.freeze(["consumable", "便携", "顶饿"]),
    description: "纸封口压得很紧，里面是一整块干硬的小砖。",
    icon: "compressed_biscuits",
    inventoryItemId: "consumable_compressed_biscuits",
    order: 40
  }),
  chocolate_bar: Object.freeze({
    id: "chocolate_bar",
    name: "巧克力",
    price: 3,
    purchaseEnabled: true,
    tags: Object.freeze(["consumable", "糖分", "小块"]),
    description: "外包装有点皱，巧克力块本身还没化。",
    icon: "chocolate_bar",
    inventoryItemId: "consumable_chocolate_bar",
    order: 50
  }),
  warm_patch: Object.freeze({
    id: "warm_patch",
    name: "暖贴",
    price: 9,
    purchaseEnabled: true,
    tags: Object.freeze(["consumable", "持续效果", "保暖"]),
    description: "薄薄一片，得贴在里层上才会慢慢发热。",
    icon: "warm_patch",
    inventoryItemId: "consumable_warm_patch",
    order: 60
  }),
  pain_relief_tablets: Object.freeze({
    id: "pain_relief_tablets",
    name: "止痛药",
    price: 27,
    purchaseEnabled: true,
    tags: Object.freeze(["consumable", "药品", "应急"]),
    description: "治疗你的伤痛，但不能治疗你的心。",
    icon: "pill_box",
    inventoryItemId: "consumable_pain_relief_tablets",
    order: 70
  })
});