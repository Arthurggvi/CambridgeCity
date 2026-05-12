import { loadItemsDb } from "./loader.js";

export const INVENTORY_CATEGORIES = ["tool", "clothing", "material", "consumable"];
export const EQUIPMENT_SLOT_ORDER = ["upper", "lining", "lower", "shoes", "goggles", "head", "hands", "neck", "backpack"];
export const ITEM_QUALITY_ENUM = Object.freeze(["white", "green", "blue", "pink", "iridescent"]);

export const EQUIPMENT_SLOT_LABELS = {
  upper: "上装",
  lining: "内衬",
  lower: "下装",
  shoes: "鞋",
  goggles: "护镜",
  head: "头饰",
  hands: "手部",
  neck: "颈部",
  backpack: "背包"
};

export const TOOL_TAG_LABELS = {
  temperature: "温度",
  light: "照明",
  fire: "火种",
  wilderness_gps: "野外 GPS",
  magnetic_compass: "磁罗盘",
  heart_rate_monitor: "心率监测仪",
  wind_anemometer: "手持风速仪",
  electronic_wind_vane: "电子风向标",
  snow_depth_sensor: "雪深传感器"
};

const BASE_CAPACITY = Object.freeze({ kindLimit: 2, stackLimit: 1 });

let _itemsDb = null;
let _itemsById = null;

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function normalizeWearable(item) {
  if (!item || typeof item !== "object") return null;
  const slot = String(item?.wearable?.slot || item?.equipSlot || "").trim();
  if (!EQUIPMENT_SLOT_ORDER.includes(slot)) return null;

  const rawThermal = item?.wearable?.thermal && typeof item.wearable.thermal === "object"
    ? item.wearable.thermal
    : (item?.thermal && typeof item.thermal === "object" ? item.thermal : {});

  return {
    slot,
    thermal: {
      insulation: clamp01(rawThermal?.insulation, 0),
      windproof: clamp01(rawThermal?.windproof, 0),
      waterproof: clamp01(rawThermal?.waterproof, 0)
    }
  };
}

export function isClothingItem(item) {
  if (!item || typeof item !== "object") return false;
  if (String(item.category || "").trim() === "clothing") return true;
  return !!normalizeWearable(item);
}

function normalizeToolTag(toolTag) {
  const value = String(toolTag || "").trim();
  return value || null;
}

export function isToolEquipItem(item) {
  if (!item || typeof item !== "object") return false;
  return String(item.equipType || "").trim() === "tool" && !!normalizeToolTag(item.toolTag);
}

export function getToolTagLabel(toolTag) {
  const normalized = normalizeToolTag(toolTag);
  if (!normalized) return "工具";
  return TOOL_TAG_LABELS[normalized] || normalized;
}

function normalizeItemRecord(rawItem) {
  const item = rawItem && typeof rawItem === "object" ? { ...rawItem } : {};
  const wearable = normalizeWearable(item);
  const normalizedToolTag = normalizeToolTag(item.toolTag);

  if (wearable) {
    item.equipSlot = wearable.slot;
    item.wearable = {
      slot: wearable.slot,
      thermal: {
        insulation: wearable.thermal.insulation,
        windproof: wearable.thermal.windproof
      }
    };
    item.thermal = {
      insulation: wearable.thermal.insulation,
      windproof: wearable.thermal.windproof,
      waterproof: wearable.thermal.waterproof
    };
  } else {
    item.equipSlot = null;
    if (item.wearable != null) delete item.wearable;
  }

  if (String(item.equipType || "").trim() === "tool" && normalizedToolTag) {
    item.equipType = "tool";
    item.toolTag = normalizedToolTag;
  } else {
    item.equipType = null;
    item.toolTag = null;
  }

  const submission = item?.submission && typeof item.submission === "object" ? item.submission : null;
  if (submission) {
    const enabled = submission.enabled === true;
    const channel = String(submission.channel || "").trim();
    const valueRaw = Number(submission.value);
    const value = Number.isFinite(valueRaw) ? Math.max(0, Math.trunc(valueRaw)) : 0;
    const qualityRaw = String(submission.quality || "").trim().toLowerCase();
    const quality = ITEM_QUALITY_ENUM.includes(qualityRaw) ? qualityRaw : "white";
    item.submission = {
      enabled,
      channel: channel || null,
      value,
      quality
    };
  } else {
    item.submission = null;
  }

  return item;
}

export function getSupplySubmissionSpec(itemDef) {
  const submission = itemDef?.submission && typeof itemDef.submission === "object" ? itemDef.submission : null;
  if (!submission) return null;
  if (submission.enabled !== true) return null;
  const channel = String(submission.channel || "").trim();
  if (!channel) return null;
  return {
    enabled: true,
    channel,
    value: Math.max(0, Math.trunc(Number(submission.value ?? 0))),
    quality: ITEM_QUALITY_ENUM.includes(String(submission.quality || "").trim()) ? String(submission.quality || "").trim() : "white"
  };
}

export function isSubmittableSupplyItem(itemDef, channel) {
  const spec = getSupplySubmissionSpec(itemDef);
  if (!spec) return false;
  return String(spec.channel || "") === String(channel || "");
}

export function getItemQualityClass(itemDef) {
  const spec = getSupplySubmissionSpec(itemDef);
  if (!spec) return "";
  const quality = String(spec.quality || "").trim();
  if (!ITEM_QUALITY_ENUM.includes(quality)) return "";
  return `item-quality-${quality}`;
}

export async function ensureItemsDbLoaded() {
  if (_itemsDb && _itemsById) {
    return { ok: true, db: _itemsDb, byId: _itemsById };
  }

  const db = await loadItemsDb();
  if (!db || !Array.isArray(db.items)) {
    return { ok: false, error: "物品数据库加载失败" };
  }

  const byId = new Map();
  for (const item of db.items) {
    if (!item || typeof item.id !== "string" || !item.id.trim()) continue;
    byId.set(item.id, normalizeItemRecord(item));
  }

  _itemsDb = {
    ...db,
    items: Array.from(byId.values())
  };
  _itemsById = byId;
  return { ok: true, db: _itemsDb, byId: _itemsById };
}

export function getItemsDb() {
  return _itemsDb;
}

export function getItemsById() {
  return _itemsById;
}

export function getBaseCapacity() {
  return BASE_CAPACITY;
}

export function getDefaultEquipment() {
  return {
    upper: null,
    lining: null,
    lower: null,
    shoes: null,
    goggles: null,
    head: null,
    hands: null,
    neck: null,
    backpack: null
  };
}

export function getDefaultEquippedTools() {
  return [];
}

export function normalizeInventory(rawInventory) {
  if (!Array.isArray(rawInventory)) return [];

  const normalized = [];
  for (const row of rawInventory) {
    const itemId = String(row?.itemId || "").trim();
    const qtyRaw = Number(row?.qty ?? 0);
    const qty = Number.isFinite(qtyRaw) ? Math.floor(qtyRaw) : 0;
    if (!itemId || qty <= 0) continue;
    normalized.push({ itemId, qty });
  }

  return normalized;
}

export function normalizeEquipment(rawEquipment) {
  const base = getDefaultEquipment();
  const out = { ...base };
  const src = rawEquipment && typeof rawEquipment === "object" ? rawEquipment : {};

  for (const slot of EQUIPMENT_SLOT_ORDER) {
    const value = src[slot];
    out[slot] = typeof value === "string" && value.trim() ? value : null;
  }

  return out;
}

export function normalizeEquippedTools(rawEquippedTools) {
  if (!Array.isArray(rawEquippedTools)) return [];

  const uniqueByTag = new Map();
  for (const row of rawEquippedTools) {
    const itemId = String(row?.itemId || "").trim();
    const toolTag = normalizeToolTag(row?.toolTag);
    if (!itemId || !toolTag) continue;
    uniqueByTag.set(toolTag, { itemId, toolTag });
  }

  return Array.from(uniqueByTag.values());
}

export function getCapacityProfile(equipment, itemsById = _itemsById) {
  const profile = { ...BASE_CAPACITY };
  const backpackId = String(equipment?.backpack || "").trim();

  if (!backpackId || !itemsById) {
    return profile;
  }

  const backpack = itemsById.get(backpackId);
  if (!backpack || typeof backpack !== "object") {
    return profile;
  }

  const cap = backpack.capacityProfile;
  if (!cap || typeof cap !== "object") {
    return profile;
  }

  const kindLimit = Number(cap.kindLimit);
  const stackLimit = Number(cap.stackLimit);

  if (Number.isFinite(kindLimit) && kindLimit > 0) {
    profile.kindLimit = Math.floor(kindLimit);
  }

  if (Number.isFinite(stackLimit) && stackLimit > 0) {
    profile.stackLimit = Math.floor(stackLimit);
  }

  return profile;
}

export function getCategoryDisplayName(category) {
  if (category === "tool") return "工具";
  if (category === "clothing") return "服装";
  if (category === "material") return "材料";
  if (category === "consumable") return "消耗品";
  return category || "未知";
}

export function countKindsByCategory(inventory, itemsById = _itemsById) {
  const kinds = {
    tool: new Set(),
    clothing: new Set(),
    material: new Set(),
    consumable: new Set()
  };

  for (const row of normalizeInventory(inventory)) {
    const item = itemsById?.get(row.itemId);
    const category = String(item?.category || "");
    if (!kinds[category]) continue;
    kinds[category].add(row.itemId);
  }

  return {
    tool: kinds.tool.size,
    clothing: kinds.clothing.size,
    material: kinds.material.size,
    consumable: kinds.consumable.size
  };
}
