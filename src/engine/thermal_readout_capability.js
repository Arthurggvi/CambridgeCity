const THERMAL_READOUT_LEVEL_PRIORITY = Object.freeze({
  none: 0,
  thermometer: 1,
  monitor: 2
});

export function normalizeThermalReadoutLevel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "monitor") return "monitor";
  if (normalized === "thermometer") return "thermometer";
  return "none";
}

export function resolveThermalReadoutCapability(equippedTools, itemsById) {
  const safeItemsById = itemsById instanceof Map ? itemsById : null;
  const rows = Array.isArray(equippedTools) ? equippedTools : [];
  let bestLevel = "none";
  let bestSourceItemId = null;

  for (const row of rows) {
    const toolTag = String(row?.toolTag || "").trim();
    const itemId = String(row?.itemId || "").trim();
    if (toolTag !== "temperature" || !itemId || !safeItemsById) continue;

    const itemDef = safeItemsById.get(itemId);
    const level = normalizeThermalReadoutLevel(itemDef?.thermalReadoutLevel);
    if (THERMAL_READOUT_LEVEL_PRIORITY[level] > THERMAL_READOUT_LEVEL_PRIORITY[bestLevel]) {
      bestLevel = level;
      bestSourceItemId = itemId;
    }
  }

  return {
    level: bestLevel,
    sourceItemId: bestSourceItemId
  };
}