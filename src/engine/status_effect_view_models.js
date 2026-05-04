import { getItemsById } from "./items_db.js";
import { getNightKitchenFoodDef, NIGHT_KITCHEN_FOOD_DEFS } from "./night_kitchen_food_defs.js";
import { STATUS_EFFECT_BUCKETS, STATUS_EFFECT_KEYS, ensureStatusEffectsState } from "./status_effect_runtime.js";

export const STATUS_EFFECT_FORMATTER_TYPES = Object.freeze({
  MODIFIER_PERCENT: "modifier_percent",
  PERIODIC_RATE: "periodic_rate"
});

export const STATUS_EFFECT_DISPLAY_CHANNELS = Object.freeze({
  FOOD: "food",
  DRUG: "drug"
});

export const STATUS_EFFECT_PRESENTATION_BY_KEY = Object.freeze({
  [STATUS_EFFECT_KEYS.STAMINA_DECAY_RATE]: Object.freeze({
    bucket: STATUS_EFFECT_BUCKETS.HEALTH,
    tooltipVisible: true,
    formatterType: STATUS_EFFECT_FORMATTER_TYPES.MODIFIER_PERCENT,
    label: "体力衰减速率"
  }),
  [STATUS_EFFECT_KEYS.SATIETY_DECAY_RATE]: Object.freeze({
    bucket: STATUS_EFFECT_BUCKETS.SATIETY,
    tooltipVisible: true,
    formatterType: STATUS_EFFECT_FORMATTER_TYPES.MODIFIER_PERCENT,
    label: "饱腹衰减速率"
  }),
  [STATUS_EFFECT_KEYS.BODY_TEMPERATURE_DECAY_RATE]: Object.freeze({
    bucket: STATUS_EFFECT_BUCKETS.TEMPERATURE,
    tooltipVisible: true,
    formatterType: STATUS_EFFECT_FORMATTER_TYPES.MODIFIER_PERCENT,
    label: "体温下降速率"
  }),
  [STATUS_EFFECT_KEYS.COOLING_RATE]: Object.freeze({
    bucket: STATUS_EFFECT_BUCKETS.TEMPERATURE,
    tooltipVisible: true,
    formatterType: STATUS_EFFECT_FORMATTER_TYPES.MODIFIER_PERCENT,
    label: "降温速率"
  }),
  [STATUS_EFFECT_KEYS.WARMING_RATE]: Object.freeze({
    bucket: STATUS_EFFECT_BUCKETS.TEMPERATURE,
    tooltipVisible: true,
    formatterType: STATUS_EFFECT_FORMATTER_TYPES.MODIFIER_PERCENT,
    label: "回暖速率"
  }),
  [STATUS_EFFECT_KEYS.HP_DECAY_RATE]: Object.freeze({
    bucket: STATUS_EFFECT_BUCKETS.HEALTH,
    tooltipVisible: true,
    formatterType: STATUS_EFFECT_FORMATTER_TYPES.MODIFIER_PERCENT,
    label: "健康衰减速率"
  }),
  [STATUS_EFFECT_KEYS.STAMINA]: Object.freeze({
    bucket: STATUS_EFFECT_BUCKETS.HEALTH,
    tooltipVisible: true,
    formatterType: STATUS_EFFECT_FORMATTER_TYPES.PERIODIC_RATE,
    positiveLabel: "体力恢复",
    negativeLabel: "体力"
  }),
  [STATUS_EFFECT_KEYS.SATIETY]: Object.freeze({
    bucket: STATUS_EFFECT_BUCKETS.SATIETY,
    tooltipVisible: true,
    formatterType: STATUS_EFFECT_FORMATTER_TYPES.PERIODIC_RATE,
    positiveLabel: "饱腹恢复",
    negativeLabel: "饱腹"
  }),
  [STATUS_EFFECT_KEYS.HP]: Object.freeze({
    bucket: STATUS_EFFECT_BUCKETS.HEALTH,
    tooltipVisible: true,
    formatterType: STATUS_EFFECT_FORMATTER_TYPES.PERIODIC_RATE,
    positiveLabel: "健康恢复",
    negativeLabel: "健康"
  }),
  [STATUS_EFFECT_KEYS.FATIGUE]: Object.freeze({
    bucket: STATUS_EFFECT_BUCKETS.HEALTH,
    tooltipVisible: true,
    formatterType: STATUS_EFFECT_FORMATTER_TYPES.PERIODIC_RATE,
    positiveLabel: "疲劳恢复",
    negativeLabel: "疲劳"
  }),
  [STATUS_EFFECT_KEYS.TEMPERATURE_C]: Object.freeze({
    bucket: STATUS_EFFECT_BUCKETS.TEMPERATURE,
    tooltipVisible: true,
    formatterType: STATUS_EFFECT_FORMATTER_TYPES.PERIODIC_RATE,
    positiveLabel: "体温",
    negativeLabel: "体温"
  })
});

function pad2(value) {
  return String(Math.max(0, Math.floor(Number(value) || 0))).padStart(2, "0");
}

function formatRemainingHhMm(rawMinutes) {
  const totalMinutes = Math.max(0, Math.ceil(Number(rawMinutes) || 0));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

function formatSignedNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return null;
  const abs = Math.abs(numeric);
  const rounded = Math.abs(abs - Math.round(abs)) < 0.001
    ? String(Math.round(abs))
    : abs.toFixed(abs >= 10 ? 0 : 1).replace(/\.0$/, "");
  return `${numeric > 0 ? "+" : "-"}${rounded}`;
}

function formatUnsignedNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const rounded = Math.abs(numeric - Math.round(numeric)) < 0.001
    ? String(Math.round(numeric))
    : numeric.toFixed(numeric >= 10 ? 0 : 1).replace(/\.0$/, "");
  return rounded;
}

function formatPercentDeltaFromMultiplier(multiplier) {
  const numeric = Number(multiplier);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric === 1) return null;
  const delta = numeric < 1 ? (1 - numeric) * 100 : (numeric - 1) * 100;
  const rounded = Math.abs(delta - Math.round(delta)) < 0.001
    ? String(Math.round(delta))
    : delta.toFixed(delta >= 10 ? 0 : 1).replace(/\.0$/, "");
  return `${numeric < 1 ? "-" : "+"}${rounded}%`;
}

export function resolveStatusEffectBucket(effectKey) {
  const entry = STATUS_EFFECT_PRESENTATION_BY_KEY[String(effectKey || "").trim()] || null;
  return entry?.bucket || STATUS_EFFECT_BUCKETS.OTHER;
}

function entryBelongsToBucket(entry, bucket) {
  if (!entry || !Array.isArray(entry.effects)) return false;
  return entry.effects.some((effect) => resolveStatusEffectBucket(String(effect?.effectKey || "").trim()) === bucket);
}

function isFoodLikeConsumableDefinition(itemDef) {
  if (!itemDef || typeof itemDef !== "object") return false;
  return Number(itemDef?.satietyGain) > 0 || Number(itemDef?.intakeLoadCost) > 0;
}

function isDrugLikeConsumableDefinition(itemDef) {
  if (!itemDef || typeof itemDef !== "object") return false;
  if (String(itemDef?.category || "").trim() !== "consumable") return false;
  return !isFoodLikeConsumableDefinition(itemDef);
}

function findNightKitchenFoodDefByPurchaseItemId(itemId) {
  const normalizedItemId = String(itemId || "").trim();
  if (!normalizedItemId) return null;
  for (const foodDef of Object.values(NIGHT_KITCHEN_FOOD_DEFS)) {
    if (!foodDef || typeof foodDef !== "object") continue;
    for (const purchaseDef of Object.values(foodDef.purchaseModes || {})) {
      if (String(purchaseDef?.itemId || "").trim() === normalizedItemId) {
        return foodDef;
      }
    }
  }
  return null;
}

export function resolveStatusEffectDisplayChannel(instance, context = {}) {
  const normalizedSourceItemId = String(instance?.sourceItemId || context?.sourceItemId || "").trim();
  if (!normalizedSourceItemId) return null;

  const itemsById = context?.itemsById instanceof Map ? context.itemsById : getItemsById();
  const itemDef = itemsById instanceof Map ? itemsById.get(normalizedSourceItemId) : null;
  if (itemDef && isFoodLikeConsumableDefinition(itemDef)) return STATUS_EFFECT_DISPLAY_CHANNELS.FOOD;

  const foodDef = getNightKitchenFoodDef(normalizedSourceItemId);
  if (foodDef) return STATUS_EFFECT_DISPLAY_CHANNELS.FOOD;

  if (findNightKitchenFoodDefByPurchaseItemId(normalizedSourceItemId)) {
    return STATUS_EFFECT_DISPLAY_CHANNELS.FOOD;
  }

  if (itemDef && isDrugLikeConsumableDefinition(itemDef)) return STATUS_EFFECT_DISPLAY_CHANNELS.DRUG;

  return null;
}

export function resolveStatusEffectSourceDisplayName(sourceItemId) {
  const normalizedSourceItemId = String(sourceItemId || "").trim();
  if (!normalizedSourceItemId) return "未知效果来源";

  const itemsById = getItemsById();
  const itemDef = itemsById instanceof Map ? itemsById.get(normalizedSourceItemId) : null;
  const itemName = String(itemDef?.name || itemDef?.title || "").trim();
  if (itemName) return itemName;

  const foodDef = getNightKitchenFoodDef(normalizedSourceItemId);
  const foodName = String(foodDef?.name || "").trim();
  if (foodName) return foodName;

  return normalizedSourceItemId;
}

function formatModifierPercentLine(effect, entry) {
  const percentText = formatPercentDeltaFromMultiplier(effect?.multiplier);
  if (!percentText) return null;
  const label = String(entry?.label || "").trim();
  return label ? `${label} ${percentText}` : null;
}

function formatPeriodicRateLine(effect, entry) {
  const everyMinutes = Number(effect?.everyMinutes);
  const delta = Number(effect?.delta);
  if (!Number.isFinite(everyMinutes) || everyMinutes <= 0) return null;
  if (!Number.isFinite(delta) || delta === 0) return null;
  const signed = formatSignedNumber(delta);
  if (!signed) return null;
  const label = delta > 0
    ? String(entry?.positiveLabel || entry?.negativeLabel || "").trim()
    : String(entry?.negativeLabel || entry?.positiveLabel || "").trim();
  const everyText = formatUnsignedNumber(everyMinutes);
  if (!label || !everyText) return null;
  return `每${everyText}分钟${label}${signed}`;
}

export function formatStatusEffectPresentationLine(effect) {
  const effectKey = String(effect?.effectKey || "").trim();
  const entry = STATUS_EFFECT_PRESENTATION_BY_KEY[effectKey] || null;
  if (!entry || entry.tooltipVisible !== true) return null;
  if (entry.formatterType === STATUS_EFFECT_FORMATTER_TYPES.MODIFIER_PERCENT) {
    return formatModifierPercentLine(effect, entry);
  }
  if (entry.formatterType === STATUS_EFFECT_FORMATTER_TYPES.PERIODIC_RATE) {
    return formatPeriodicRateLine(effect, entry);
  }
  return null;
}

function getTooltipMeta(filterKey) {
  if (filterKey === STATUS_EFFECT_DISPLAY_CHANNELS.FOOD) {
    return { title: "进食效果", emptyText: "当前没有生效中的进食效果" };
  }
  if (filterKey === STATUS_EFFECT_DISPLAY_CHANNELS.DRUG) {
    return { title: "药品效果", emptyText: "当前没有生效中的药品效果" };
  }
  if (filterKey === STATUS_EFFECT_BUCKETS.TEMPERATURE) {
    return { title: "温控效果", emptyText: "当前没有生效中的温控效果" };
  }
  return { title: "状态效果", emptyText: "当前没有生效中的状态效果" };
}

export function buildStatusEffectTooltipVm(state, filterKey) {
  const player = state?.player && typeof state.player === "object" ? state.player : state;
  const meta = getTooltipMeta(filterKey);
  if (!player || typeof player !== "object") {
    return { bucket: filterKey, title: meta.title, emptyText: meta.emptyText, groups: [], summaryText: "" };
  }

  const statusEffects = ensureStatusEffectsState(player);
  const itemsById = getItemsById();
  const activeEntries = Array.isArray(statusEffects.active)
    ? statusEffects.active.filter((entry) => {
        if (Number(entry?.remainingMinutes) <= 0) return false;
        if (filterKey === STATUS_EFFECT_DISPLAY_CHANNELS.FOOD || filterKey === STATUS_EFFECT_DISPLAY_CHANNELS.DRUG) {
          return resolveStatusEffectDisplayChannel(entry, { itemsById, player, state }) === filterKey;
        }
        return entryBelongsToBucket(entry, filterKey);
      })
    : [];

  const groups = activeEntries.map((entry) => ({
    name: resolveStatusEffectSourceDisplayName(entry?.sourceItemId),
    lines: Array.isArray(entry.effects)
      ? entry.effects
          .map((effect) => formatStatusEffectPresentationLine(effect))
          .filter(Boolean)
          .map((line) => `${line}（${formatRemainingHhMm(entry.remainingMinutes)}）`)
      : []
  })).filter((group) => group.lines.length > 0);

  const summaryText = groups.length === 0
    ? ""
    : (groups.length === 1 && groups[0].lines.length === 1
        ? groups[0].lines[0].replace(/（\d{2}:\d{2}）$/, "")
        : `${groups.length} 项持续效果生效中`);

  return {
    bucket: filterKey,
    title: meta.title,
    emptyText: meta.emptyText,
    groups,
    summaryText
  };
}