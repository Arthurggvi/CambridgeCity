import { getStatusEffectRemainingMinutesBySource } from "../status_effect_runtime.js";
import { formatStatusEffectPresentationLine } from "../status_effect_view_models.js";

const IMMEDIATE_ATTR_LABELS = Object.freeze({
  hp: "健康",
  satiety: "饱腹",
  stamina: "体力",
  fatigue: "疲劳",
  temperatureC: "体温"
});

const TIMED_MULTIPLIER_FIELDS = Object.freeze([
  { key: "hpDecayRateMultiplier", effectKey: "hpDecayRate" },
  { key: "bodyTemperatureDecayModifier", effectKey: "bodyTemperatureDecayRate" },
  { key: "satietyDecayModifier", effectKey: "satietyDecayRate" },
  { key: "staminaDecayModifier", effectKey: "staminaDecayRate" },
  { key: "coolingRateMultiplier", effectKey: "coolingRate" },
  { key: "warmingRateMultiplier", effectKey: "warmingRate" }
]);

const TIMED_DELTA_FIELDS = Object.freeze([
  { key: "staminaRecoveryPerHour", effectKey: "stamina" }
]);

function toTrimmedString(value) {
  return String(value || "").trim();
}

function pushUnique(lines, text) {
  const normalized = toTrimmedString(text);
  if (!normalized) return;
  if (!lines.includes(normalized)) {
    lines.push(normalized);
  }
}

function getDescriptionLines(itemDef) {
  if (Array.isArray(itemDef?.description)) {
    return itemDef.description
      .map((line) => toTrimmedString(line))
      .filter(Boolean);
  }
  const text = toTrimmedString(itemDef?.description || itemDef?.desc);
  if (!text) return [];
  return text.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean);
}

function formatSignedValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return null;
  const abs = Math.abs(numeric);
  const rounded = Math.abs(abs - Math.round(abs)) < 0.001
    ? String(Math.round(abs))
    : abs.toFixed(abs >= 10 ? 0 : 1).replace(/\.0$/, "");
  return `${numeric > 0 ? "+" : "-"}${rounded}`;
}

function formatDurationHHMM(rawMinutes) {
  const totalMinutes = Math.max(0, Math.round(Number(rawMinutes) || 0));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours)}:${String(minutes).padStart(2, "0")}`;
}

function resolveTimedMinutes(player, sourceId, fallbackMinutes) {
  const remainingMinutes = getStatusEffectRemainingMinutesBySource(player, sourceId);
  if (Number.isFinite(remainingMinutes) && remainingMinutes > 0) {
    return remainingMinutes;
  }
  return fallbackMinutes;
}

function buildImmediateLines(itemDef, lines) {
  const satietyGain = Number(itemDef?.satietyGain);
  if (Number.isFinite(satietyGain) && satietyGain !== 0) {
    pushUnique(lines, `饱腹 ${formatSignedValue(satietyGain)}`);
  }

  const bodyTemperatureDeltaC = Number(itemDef?.bodyTemperatureDeltaC);
  if (Number.isFinite(bodyTemperatureDeltaC) && bodyTemperatureDeltaC !== 0) {
    pushUnique(lines, `体温 ${formatSignedValue(bodyTemperatureDeltaC)}℃`);
  }

  const instantDeltas = itemDef?.instantDeltas && typeof itemDef.instantDeltas === "object"
    ? itemDef.instantDeltas
    : null;
  if (!instantDeltas) return;

  for (const attrKey of ["hp", "satiety", "stamina", "fatigue", "temperatureC"]) {
    const label = IMMEDIATE_ATTR_LABELS[attrKey];
    const signed = formatSignedValue(instantDeltas[attrKey]);
    if (!label || !signed) continue;
    pushUnique(lines, `${label} ${signed}`);
  }
}

function buildTimedMultiplierLines(itemDef, player, lines) {
  for (const field of TIMED_MULTIPLIER_FIELDS) {
    const descriptor = itemDef?.[field.key];
    if (!descriptor || typeof descriptor !== "object") continue;
    let line = formatStatusEffectPresentationLine({
      kind: "modifier",
      effectKey: field.effectKey,
      multiplier: descriptor.multiplier
    });
    if (field.key === "bodyTemperatureDecayModifier" && line) {
      line = line.replace("体温下降速率", "体温衰减速率");
    }
    const durationMinutes = Number(descriptor.durationMinutes);
    if (!line || !Number.isFinite(durationMinutes) || durationMinutes <= 0) continue;
    const sourceId = toTrimmedString(descriptor.source || itemDef?.id);
    const displayMinutes = resolveTimedMinutes(player, sourceId, durationMinutes);
    pushUnique(lines, `${line}（${formatDurationHHMM(displayMinutes)}）`);
  }
}

function buildTimedDeltaLines(itemDef, player, lines, infoLines) {
  for (const field of TIMED_DELTA_FIELDS) {
    const descriptor = itemDef?.[field.key];
    if (!descriptor || typeof descriptor !== "object") continue;
    const deltaPerHour = Number(descriptor.deltaPerHour ?? descriptor.delta);
    const durationMinutes = Number(descriptor.durationMinutes);
    if (!Number.isFinite(deltaPerHour) || deltaPerHour === 0) continue;
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) continue;
    const line = formatStatusEffectPresentationLine({
      kind: "periodic",
      effectKey: field.effectKey,
      delta: deltaPerHour / 60,
      everyMinutes: 1
    });
    if (!line) continue;
    const sourceId = toTrimmedString(descriptor.source || itemDef?.id);
    const displayMinutes = resolveTimedMinutes(player, sourceId, durationMinutes);
    pushUnique(lines, `${line}（${formatDurationHHMM(displayMinutes)}）`);

    const effectText = toTrimmedString(descriptor.effectText);
    if (effectText) {
      pushUnique(infoLines, effectText);
    }
  }
}

function hasStructuredSchema(itemDef) {
  if (!itemDef || typeof itemDef !== "object") return false;
  if (Number.isFinite(Number(itemDef?.satietyGain)) && Number(itemDef.satietyGain) !== 0) return true;

  const instantDeltas = itemDef?.instantDeltas && typeof itemDef.instantDeltas === "object"
    ? itemDef.instantDeltas
    : null;
  if (Number.isFinite(Number(itemDef?.bodyTemperatureDeltaC)) && Number(itemDef.bodyTemperatureDeltaC) !== 0) {
    return true;
  }
  if (instantDeltas) {
    for (const key of ["hp", "satiety", "stamina", "fatigue", "temperatureC"]) {
      const value = Number(instantDeltas[key]);
      if (Number.isFinite(value) && value !== 0) return true;
    }
  }

  for (const field of TIMED_MULTIPLIER_FIELDS) {
    const descriptor = itemDef?.[field.key];
    const multiplier = Number(descriptor?.multiplier);
    const durationMinutes = Number(descriptor?.durationMinutes);
    if (Number.isFinite(multiplier) && multiplier > 0 && Number.isFinite(durationMinutes) && durationMinutes > 0) {
      return true;
    }
  }

  for (const field of TIMED_DELTA_FIELDS) {
    const descriptor = itemDef?.[field.key];
    const deltaPerHour = Number(descriptor?.deltaPerHour ?? descriptor?.delta);
    const durationMinutes = Number(descriptor?.durationMinutes);
    if (Number.isFinite(deltaPerHour) && deltaPerHour !== 0 && Number.isFinite(durationMinutes) && durationMinutes > 0) {
      return true;
    }
  }

  return false;
}

export function buildConsumableDetailPresentation(itemDef, player) {
  if (!itemDef || typeof itemDef !== "object") return null;
  if (toTrimmedString(itemDef.category) !== "consumable") return null;

  const effectLines = [];
  const infoLines = [];
  const descriptionLines = getDescriptionLines(itemDef);

  buildImmediateLines(itemDef, effectLines);
  buildTimedMultiplierLines(itemDef, player, effectLines);
  buildTimedDeltaLines(itemDef, player, effectLines, infoLines);

  const structured = hasStructuredSchema(itemDef);
  let statusTag = undefined;

  if (!structured) {
    if (itemDef.usable === false) {
      pushUnique(infoLines, "当前不可使用");
      statusTag = "不可使用";
    } else {
      pushUnique(infoLines, "暂无结构化效果数据");
      statusTag = "说明";
    }
    for (const line of descriptionLines) {
      pushUnique(infoLines, line);
    }
  }

  if (structured && effectLines.length === 0 && infoLines.length === 0) {
    return null;
  }

  return {
    title: structured ? "效果" : "说明",
    effectLines,
    infoLines,
    statusTag
  };
}