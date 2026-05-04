import { PLAYER_DEFS } from "../player_defs.js";
import {
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_SLOT_ORDER,
  INVENTORY_CATEGORIES,
  countKindsByCategory,
  getCapacityProfile,
  getCategoryDisplayName,
  getSupplySubmissionSpec,
  getItemsById,
  getItemsDb,
  getItemQualityClass,
  getToolTagLabel,
  isClothingItem,
  isToolEquipItem,
  normalizeEquipment,
  normalizeEquippedTools,
  normalizeInventory
} from "../items_db.js";
import {
  collectInventoryGainHighlightIds,
  getInventoryOverlayUiState
} from "../ui_overlay_controller.js";
import { buildConsumableDetailPresentation } from "./consumable_detail_presentation.js";
import { getPlaceProfileForMap } from "../loader.js";
import {
  computeEnvTempC,
  computeEquipmentProtectionProfile,
  computeExposureDurations,
  computeLocalWind
} from "../../systems/temperature/temperature_system.js";
import { formatMinutes } from "../../ui/format_minutes.js";

function toFiniteUiNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatThermalEtaMinutes(minutes) {
  const totalMin = Number(minutes ?? 0);
  if (!Number.isFinite(totalMin)) return "—";
  return formatMinutes(Math.max(0, Math.ceil(totalMin)));
}

function formatSignedEtaDeltaMinutes(value) {
  const minutes = Math.round(toFiniteUiNumber(value, 0));
  if (minutes > 0) return `+${minutes}m`;
  if (minutes < 0) return `${minutes}m`;
  return "±0m";
}

function toWindKmh(value) {
  return toFiniteUiNumber(value, 0) * 3.6;
}

function getWearableThermalStats(item) {
  const thermal = item?.wearable?.thermal && typeof item.wearable.thermal === "object"
    ? item.wearable.thermal
    : (item?.thermal && typeof item.thermal === "object" ? item.thermal : {});

  return {
    insulation: Math.max(0, Math.min(1, toFiniteUiNumber(thermal?.insulation, 0))),
    windproof: Math.max(0, Math.min(1, toFiniteUiNumber(thermal?.windproof, 0)))
  };
}

function getItemDescriptionLines(item, limit = 3) {
  if (Array.isArray(item?.description)) {
    return item.description
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .slice(0, limit);
  }
  const text = String(item?.description || item?.desc || "").trim();
  if (!text) return [];
  return text.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean).slice(0, limit);
}

function getItemDescriptionText(item, limit = Infinity) {
  return getItemDescriptionLines(item, limit).join("\n").trim();
}

function buildWeakPointTooltip(topWeakSlots = []) {
  if (!Array.isArray(topWeakSlots) || topWeakSlots.length === 0) {
    return "当前无明显弱点槽位";
  }

  return topWeakSlots
    .map((row, index) => `${index + 1}. ${row.slotLabel} · ${row.itemName}${row.missing ? " · 缺失" : ""} · leak ${row.leakPowerMeanTerm.toFixed(3)}`)
    .join("\n");
}

function buildWeakSlotContributionTooltip(row, index) {
  if (!row) return "拖累贡献不可用";
  return [
    `Top${index + 1} 拖累：${row.slotLabel}`,
    `当前：${row.itemName}${row.missing ? "（未装备）" : ""}`,
    `I ${row.insulation.toFixed(2)} · W ${row.windproof.toFixed(2)}`,
    `风漏拖累项 ${row.leakPowerMeanTerm.toFixed(3)}`,
    row.missing ? "该槽位未装备，会显著缩短生存时间。" : "该槽位越漏风，整体 ETA 越短。"
  ].join("\n");
}

function getWeakSeverityLabel(share) {
  const ratio = toFiniteUiNumber(share, 0);
  if (ratio >= 0.45) return "强";
  if (ratio >= 0.25) return "中";
  return "弱";
}

function buildWeakSeverityRows(topWeakSlots = []) {
  const rows = Array.isArray(topWeakSlots) ? topWeakSlots.slice(0, 3) : [];
  const total = rows.reduce((sum, row) => sum + Math.max(0, toFiniteUiNumber(row?.leakPowerMeanTerm, 0)), 0);
  return rows.map((row) => {
    const share = total > 0 ? Math.max(0, toFiniteUiNumber(row?.leakPowerMeanTerm, 0)) / total : 0;
    return {
      ...row,
      share,
      severity: getWeakSeverityLabel(share)
    };
  });
}

function buildEmptySlotHintTooltip(slot, severityRows = []) {
  const slotRow = Array.isArray(severityRows)
    ? severityRows.find((row) => String(row?.slot || "") === String(slot || ""))
    : null;
  return [
    "未装备：该槽位按“漏风缺失”参与 W_eff，显著缩短暴露时间",
    `建议优先补全：${slotRow ? slotRow.severity : "视当前短板而定"}`
  ].join("\n");
}

function buildExposureBaselineUi(mapId, world) {
  const baselineWindMs = 4.167;
  const placeProfile = getPlaceProfileForMap(mapId) || null;
  const worldWindMs = Math.max(0, toFiniteUiNumber(world?.windSpeed ?? world?.weather?.windSpeed_local, 0));
  const localWindMs = placeProfile ? computeLocalWind(worldWindMs, placeProfile) : worldWindMs;
  const currentSpace = String(placeProfile?.space || "outdoor");
  const exposureLevel = String(placeProfile?.exposureLevel || "Open");
  const bias = localWindMs - baselineWindMs;
  let biasLabel = "当前环境≈基准";
  let biasTone = "is-neutral";
  if (currentSpace === "indoor" || localWindMs <= baselineWindMs * 0.45) {
    biasLabel = "当前环境偏宽松";
    biasTone = "is-up";
  } else if (bias >= 0.6) {
    biasLabel = "当前环境偏严苛";
    biasTone = "is-down";
  }

  const basisTooltip = [
    "ETA 基准说明",
    "- 失能 / 致死时间仅由当前防护分数 P 映射",
    "- 读法按外界 Open、15km/h 风锚点理解",
    "- 室内 / 遮蔽 / 低风时，实际通常更宽松",
    "- 强风 / 高暴露时，实际通常更严苛"
  ].join("\n");

  const biasTooltip = [
    `当前区域：${currentSpace === "indoor" ? "室内" : "室外"} / ${exposureLevel}`,
    `局地风：${localWindMs.toFixed(2)}m/s（${Math.round(toWindKmh(localWindMs))}km/h）`,
    `基准风：${baselineWindMs.toFixed(2)}m/s（15km/h）`,
    biasLabel === "当前环境偏宽松"
      ? "当前风暴露低于基准，实际生存时间通常比芯片更长。"
      : biasLabel === "当前环境偏严苛"
        ? "当前风暴露高于基准，实际生存时间通常比芯片更短。"
        : "当前环境与基准接近，可直接把芯片当作近似读数。"
  ].join("\n");
  const differsFromBaseline = currentSpace !== "outdoor"
    || exposureLevel !== "Open"
    || Math.abs(localWindMs - baselineWindMs) > 0.35;
  const compareNotice = differsFromBaseline ? "当前环境≠基准，时间仅用于比较" : "";
  const currentSpaceLabel = currentSpace === "indoor" ? "室内" : "室外";
  const currentWindText = `风速 ${Math.round(toWindKmh(localWindMs))}km/h`;

  return {
    basisText: "基准：外界 Open · 风速 15km/h · 湿度适中",
    basisLine1: "外界 Open",
    basisLine2: "风速 15km/h · 湿度适中",
    basisTooltip,
    biasLabel,
    biasTone,
    biasTooltip,
    currentText: `${currentSpaceLabel} / ${exposureLevel} · ${currentWindText}`,
    currentLine1: `${currentSpaceLabel} / ${exposureLevel}`,
    currentLine2: compareNotice ? `${currentWindText} · ${compareNotice}` : currentWindText,
    currentTempText: `${computeEnvTempC(world, placeProfile).toFixed(1)}°C`,
    compareNotice,
    isReference: differsFromBaseline,
    summaryTagText: differsFromBaseline ? "参考" : "基准",
    lockTags: [
      world?.thermalEnvLocked ? "已锁定（开发）" : "",
      world?.windLocked ? "已锁定（开发）" : "",
      world?.wetnessLocked ? "已锁定（开发）" : ""
    ].filter(Boolean)
  };
}

function buildProtectionProfileUi(equipment, itemsById) {
  const safeEquipment = normalizeEquipment(equipment);
  const weights = PLAYER_DEFS.equipmentWeights || {};
  const defs = PLAYER_DEFS.temperature?.exposureModel || {};
  const windLeakPower = Math.max(1, toFiniteUiNumber(defs?.windLeakPower, 1.6));
  const profile = computeEquipmentProtectionProfile(safeEquipment, itemsById, weights, defs);
  const timings = computeExposureDurations(profile.protectionScore, defs);

  const slotContrib = EQUIPMENT_SLOT_ORDER.map((slot) => {
    const itemId = String(safeEquipment?.[slot] || "").trim();
    const item = itemId && itemsById?.get ? itemsById.get(itemId) : null;
    const thermal = getWearableThermalStats(item);
    const leak = Math.max(1e-6, 1 - thermal.windproof);
    const weight = Math.max(0, toFiniteUiNumber(weights?.[slot], 0));
    const leakPowerMeanTerm = weight * Math.pow(leak, windLeakPower);
    return {
      slot,
      slotLabel: EQUIPMENT_SLOT_LABELS[slot],
      itemId: itemId || null,
      itemName: item?.name || "—",
      missing: !itemId,
      insulation: thermal.insulation,
      windproof: thermal.windproof,
      leakPowerMeanTerm
    };
  });

  const topWeakSlots = [...slotContrib]
    .sort((a, b) => b.leakPowerMeanTerm - a.leakPowerMeanTerm)
    .slice(0, 3);

  return {
    insulationEff: profile.insulationEff,
    windproofEff: profile.windproofEff,
    protectionScore: profile.protectionScore,
    timings,
    slotContrib,
    topWeakSlots,
    weakPointTooltip: buildWeakPointTooltip(topWeakSlots)
  };
}

function buildUnequipCandidatePreview(slot, equipment, itemsById) {
  const normalizedSlot = String(slot || "").trim();
  if (!normalizedSlot) return null;
  const current = buildProtectionProfileUi(equipment, itemsById);
  const nextEquipment = normalizeEquipment({
    ...equipment,
    [normalizedSlot]: null
  });
  const preview = buildProtectionProfileUi(nextEquipment, itemsById);
  return {
    slot: normalizedSlot,
    slotLabel: EQUIPMENT_SLOT_LABELS[normalizedSlot] || normalizedSlot,
    current,
    preview,
    deltaIncap: toFiniteUiNumber(preview.timings?.T_incap, 0) - toFiniteUiNumber(current.timings?.T_incap, 0),
    deltaDeath: toFiniteUiNumber(preview.timings?.T_death, 0) - toFiniteUiNumber(current.timings?.T_death, 0)
  };
}

function buildClothingCandidatePreview(item, equipment, itemsById) {
  const slot = String(item?.equipSlot || item?.wearable?.slot || "").trim();
  if (!slot) return null;

  const current = buildProtectionProfileUi(equipment, itemsById);
  const nextEquipment = normalizeEquipment({
    ...equipment,
    [slot]: String(item?.id || "").trim() || null
  });
  const preview = buildProtectionProfileUi(nextEquipment, itemsById);

  return {
    slot,
    slotLabel: EQUIPMENT_SLOT_LABELS[slot] || slot,
    current,
    preview,
    nextEquipment,
    deltaIncap: toFiniteUiNumber(preview.timings?.T_incap, 0) - toFiniteUiNumber(current.timings?.T_incap, 0),
    deltaDeath: toFiniteUiNumber(preview.timings?.T_death, 0) - toFiniteUiNumber(current.timings?.T_death, 0)
  };
}

function sortClothingCandidates(entries = [], equipment = {}, itemsById, sortMode = "death") {
  const metricKey = sortMode === "incap" ? "deltaIncap" : "deltaDeath";
  const secondaryKey = sortMode === "incap" ? "deltaDeath" : "deltaIncap";
  return entries
    .map((entry) => ({
      ...entry,
      isEquipped: EQUIPMENT_SLOT_ORDER.some((slot) => equipment?.[slot] === entry.row.itemId),
      preview: buildClothingCandidatePreview(entry.item, equipment, itemsById)
    }))
    .sort((a, b) => {
      if (a.isEquipped !== b.isEquipped) return a.isEquipped ? 1 : -1;
      const primaryDelta = toFiniteUiNumber(b.preview?.[metricKey], -Infinity) - toFiniteUiNumber(a.preview?.[metricKey], -Infinity);
      if (Math.abs(primaryDelta) > 1e-6) return primaryDelta;
      const secondaryDelta = toFiniteUiNumber(b.preview?.[secondaryKey], -Infinity) - toFiniteUiNumber(a.preview?.[secondaryKey], -Infinity);
      if (Math.abs(secondaryDelta) > 1e-6) return secondaryDelta;
      return String(a.item?.name || "").localeCompare(String(b.item?.name || ""), "zh-CN");
    });
}

function buildClothingRecommendations(clothingEntries, equipment, itemsById, severityRows = []) {
  const uniqueSlots = [];
  for (const row of severityRows) {
    if (!row?.slot) continue;
    if (uniqueSlots.includes(row.slot)) continue;
    uniqueSlots.push(row.slot);
  }
  if (uniqueSlots.length === 0) {
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      if (equipment?.[slot]) continue;
      uniqueSlots.push(slot);
      if (uniqueSlots.length >= 3) break;
    }
  }

  return uniqueSlots.slice(0, 3).map((slot) => {
    const slotLabel = EQUIPMENT_SLOT_LABELS[slot] || slot;
    const severity = severityRows.find((row) => row.slot === slot)?.severity || "弱";
    const candidates = clothingEntries
      .filter((entry) => String(entry.item?.equipSlot || "") === slot)
      .map((entry) => ({
        entry,
        preview: buildClothingCandidatePreview(entry.item, equipment, itemsById)
      }))
      .sort((a, b) => toFiniteUiNumber(b.preview?.deltaDeath, -Infinity) - toFiniteUiNumber(a.preview?.deltaDeath, -Infinity));

    const best = candidates[0] || null;
    return {
      slot,
      slotLabel,
      severity,
      available: !!best,
      bestItemName: best?.entry?.item?.name || "",
      deltaIncap: toFiniteUiNumber(best?.preview?.deltaIncap, 0),
      deltaDeath: toFiniteUiNumber(best?.preview?.deltaDeath, 0)
    };
  });
}

function buildSelectionContext({ inventory, equipment, equippedTools, selectedItemId, selectedSlot, itemsById }) {
  const explicitSelectedItemId = String(selectedItemId || "").trim();
  const slotSelectedItemId = selectedSlot && equipment?.[selectedSlot]
    ? String(equipment[selectedSlot] || "").trim()
    : "";
  const effectiveSelectedItemId = explicitSelectedItemId || slotSelectedItemId;
  const selectedRow = inventory.find((row) => row.itemId === effectiveSelectedItemId) || null;
  const selectedItem = effectiveSelectedItemId ? itemsById.get(effectiveSelectedItemId) : null;
  const selectedEquippedSlot = effectiveSelectedItemId
    ? EQUIPMENT_SLOT_ORDER.find((slot) => equipment?.[slot] === effectiveSelectedItemId) || null
    : null;
  const selectedToolTag = isToolEquipItem(selectedItem) ? String(selectedItem.toolTag || "") : "";
  const selectedEquippedTool = selectedToolTag
    ? equippedTools.find((entry) => entry.toolTag === selectedToolTag) || null
    : null;
  const selectedEquipSlot = selectedItem && EQUIPMENT_SLOT_ORDER.includes(String(selectedItem.equipSlot || ""))
    ? String(selectedItem.equipSlot || "")
    : null;
  const selectedToolLabel = selectedToolTag ? getToolTagLabel(selectedToolTag) : "";
  const selectedEquipLabel = selectedEquipSlot ? (EQUIPMENT_SLOT_LABELS[selectedEquipSlot] || selectedEquipSlot) : "";
  const selectedIsEquipped = !!selectedEquippedSlot && selectedEquippedSlot === selectedEquipSlot;
  const selectedIsToolEquipped = !!selectedEquippedTool && selectedEquippedTool.itemId === selectedItemId;

  return {
    selectedSubjectItemId: effectiveSelectedItemId || null,
    selectedRow,
    selectedItem,
    selectedEquippedSlot,
    selectedToolTag,
    selectedEquippedTool,
    selectedEquipSlot,
    selectedToolLabel,
    selectedEquipLabel,
    selectedIsEquipped,
    selectedIsToolEquipped
  };
}

function findFirstSourceHint(itemDef) {
  if (!itemDef || typeof itemDef !== "object") return "";
  if (typeof itemDef.source === "string" && itemDef.source.trim()) return itemDef.source.trim();

  const queue = [itemDef];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;
    visited.add(current);
    if (typeof current.source === "string" && current.source.trim()) {
      return current.source.trim();
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }
  return "";
}

function getEquipmentGroupMeta(slot) {
  if (["goggles", "head", "neck"].includes(slot)) {
    return { id: "head", label: "头部组", tone: "is-head" };
  }
  if (["upper", "lining", "lower"].includes(slot)) {
    return { id: "torso", label: "躯干组", tone: "is-torso" };
  }
  if (["hands", "shoes"].includes(slot)) {
    return { id: "limbs", label: "四肢组", tone: "is-limbs" };
  }
  return { id: "loadout", label: "负载组", tone: "is-loadout" };
}

function buildActionAvailabilitySummary(actions = []) {
  const primary = Array.isArray(actions) ? actions.find((row) => row.role === "primary") || null : null;
  const secondary = Array.isArray(actions)
    ? actions.filter((row) => row.role !== "primary")
    : [];
  return {
    primary,
    secondary,
    disabledReason: primary?.disabled ? String(primary.disabledReason || "") : "",
    executionText: primary?.outcomeText ? String(primary.outcomeText) : "",
    effectSummary: primary?.summaryText ? String(primary.summaryText) : "",
    restrictionText: primary?.disabled ? String(primary.disabledReason || "") : ""
  };
}

function buildCategoryPurposeText(itemDef, selectionContext, actionSummary) {
  const category = String(itemDef?.category || "").trim();
  if (category === "consumable") {
    if (actionSummary.primary?.disabled) return "随身消耗品，当前不可执行使用。";
    return "随身消耗品，执行后会立刻进入既有效果链。";
  }
  if (category === "clothing") {
    if (selectionContext?.selectedIsEquipped) return "当前正在承担该槽位的保温与防风职责。";
    return `候选服装，用于补强${selectionContext?.selectedEquipLabel || "目标槽位"}。`;
  }
  if (category === "tool") {
    return selectionContext?.selectedToolLabel
      ? `提供${selectionContext.selectedToolLabel}读数或交互能力。`
      : "作为挂载工具提供场景读数或行动支持。";
  }
  if (category === "material") {
    return "作为材料存货保留，当前没有直接执行入口。";
  }
  return "当前仅提供归档阅读，不含直接执行入口。";
}

function buildActionConstraintText(selectionContext, itemDef, actionSummary) {
  if (actionSummary.restrictionText) return actionSummary.restrictionText;
  if (!itemDef) return "请先选择物品。";
  if (String(itemDef.category || "") === "material") return "材料当前没有直接使用或装备动作。";
  if (selectionContext?.selectedIsEquipped) return "当前已在位，无需重复执行。";
  if (selectionContext?.selectedIsToolEquipped) return "同标签工具已在位，重复挂载没有额外收益。";
  return "当前无额外限制。";
}

function resolvePrimaryInventoryCapability(selectionContext, equipment, itemsById) {
  const {
    selectedRow,
    selectedItem,
    selectedToolLabel,
    selectedEquipLabel,
    selectedEquippedSlot,
    selectedEquippedTool,
    selectedIsEquipped,
    selectedIsToolEquipped,
    selectedEquipSlot
  } = selectionContext || {};

  const selectedItemId = String(selectedItem?.id || "").trim();
  if (!selectedItem || !selectedItemId) return null;

  if (selectedIsEquipped && selectedEquippedSlot) {
    const unequipPreview = buildUnequipCandidatePreview(selectedEquippedSlot, equipment, itemsById);
    return {
      kind: "unequip",
      text: "卸下",
      actionId: `inv_unequip:${selectedEquippedSlot}`,
      className: `inventory-action-btn inventory-action-btn-primary${unequipPreview && unequipPreview.deltaDeath < -0.49 ? " inventory-action-btn-danger" : ""}`,
      role: "primary",
      outcomeText: unequipPreview
        ? `卸下后失能 ${formatSignedEtaDeltaMinutes(unequipPreview.deltaIncap)} · 致死 ${formatSignedEtaDeltaMinutes(unequipPreview.deltaDeath)}`
        : `卸下后会清空${EQUIPMENT_SLOT_LABELS[selectedEquippedSlot] || selectedEquippedSlot}。`,
      summaryText: unequipPreview ? `卸下 ${formatSignedEtaDeltaMinutes(unequipPreview.deltaDeath)}` : "清空槽位",
      hoverDesc: unequipPreview
        ? [
            `卸下 ${unequipPreview.slotLabel} 后`,
            `失能 ${formatSignedEtaDeltaMinutes(unequipPreview.deltaIncap)} · 致死 ${formatSignedEtaDeltaMinutes(unequipPreview.deltaDeath)}`
          ].join("\n")
        : "",
      tone: "is-ready"
    };
  }

  if (selectedItem?.category === "consumable" && selectedRow && selectedItem.usable !== false) {
    return {
      kind: "use",
      text: "使用",
      actionId: `inv_use:${selectedItemId}`,
      className: "inventory-action-btn inventory-action-btn-primary",
      role: "primary",
      outcomeText: "立即结算该消耗品的即时效果，并按现有规则接入持续效果。",
      summaryText: "即时生效",
      tone: "is-ready"
    };
  }

  if (isToolEquipItem(selectedItem) && selectedRow && !selectedIsToolEquipped) {
    return {
      kind: "use",
      text: "使用",
      actionId: `inv_equip:${selectedItemId}`,
      className: "inventory-action-btn inventory-action-btn-primary",
      role: "primary",
      outcomeText: selectedEquippedTool?.itemId
        ? `执行后会替换当前${selectedToolLabel || "工具"}位工具。`
        : `执行后会把它接入${selectedToolLabel || "工具"}位。`,
      summaryText: selectedEquippedTool?.itemId ? "替换当前工具" : "接入工具位",
      tone: "is-ready"
    };
  }

  if (selectedEquipSlot && selectedRow && !selectedIsEquipped) {
    return {
      kind: "wear",
      text: "穿戴",
      actionId: `inv_equip:${selectedItemId}`,
      className: "inventory-action-btn inventory-action-btn-primary",
      role: "primary",
      outcomeText: `执行后会立即替换${selectedEquipLabel || "目标槽位"}的当前穿戴。`,
      summaryText: `穿戴到${selectedEquipLabel || "目标槽位"}`,
      tone: "is-ready"
    };
  }

  return null;
}

function buildFooterActionsViewModel(selectionContext, selectedSlot, equipment, itemsById) {
  const {
    selectedRow,
    selectedItem,
    selectedItem: selectedItemDef,
    selectedToolLabel,
    selectedEquipLabel,
    selectedEquippedTool,
    selectedIsEquipped,
    selectedIsToolEquipped,
    selectedEquipSlot
  } = selectionContext;
  const selectedItemId = String(selectedItemDef?.id || "").trim();
  const actions = [];

  const pushAction = ({
    text,
    actionId = "",
    className,
    disabled = false,
    hoverDesc = "",
    role = "secondary",
    outcomeText = "",
    summaryText = "",
    disabledReason = "",
    tone = ""
  }) => {
    actions.push({
      text,
      actionId,
      className,
      disabled,
      hoverDesc: String(hoverDesc || ""),
      role,
      outcomeText: String(outcomeText || ""),
      summaryText: String(summaryText || ""),
      disabledReason: String(disabledReason || ""),
      tone: String(tone || "")
    });
  };

  const primaryCapability = resolvePrimaryInventoryCapability(selectionContext, equipment, itemsById);
  if (primaryCapability) {
    pushAction(primaryCapability);
  } else if (!selectedItem) {
    pushAction({
      text: "请选择物品",
      className: "inventory-action-btn inventory-action-btn-primary is-disabled",
      disabled: true,
      role: "primary",
      disabledReason: "先在左栏或中栏选择一个目标。",
      outcomeText: "未选择物品时不会开放执行按钮。",
      summaryText: "等待选择目标",
      tone: "is-blocked"
    });
  }

  if (selectedRow && selectedItem) {
    pushAction({
      text: "丢弃",
      actionId: `inv_drop:${selectedItemId}`,
      className: "inventory-action-btn inventory-action-btn-danger",
      role: "secondary",
      outcomeText: "从背包中移除 1 件该物品。",
      summaryText: "移除 1 件",
      tone: "is-danger"
    });
  }

  if (selectedSlot && equipment[selectedSlot] && !selectionContext?.selectedIsEquipped) {
    const unequipPreview = buildUnequipCandidatePreview(selectedSlot, equipment, itemsById);
    const className = `inventory-action-btn${unequipPreview && unequipPreview.deltaDeath < -0.49 ? " inventory-action-btn-danger" : ""}`;
    pushAction({
      text: "卸下",
      actionId: `inv_unequip:${selectedSlot}`,
      className,
      role: "secondary",
      outcomeText: unequipPreview
        ? `卸下后失能 ${formatSignedEtaDeltaMinutes(unequipPreview.deltaIncap)} · 致死 ${formatSignedEtaDeltaMinutes(unequipPreview.deltaDeath)}`
        : `卸下后会清空${EQUIPMENT_SLOT_LABELS[selectedSlot] || selectedSlot}。`,
      summaryText: unequipPreview ? `卸下 ${formatSignedEtaDeltaMinutes(unequipPreview.deltaDeath)}` : "清空槽位",
      hoverDesc: unequipPreview
        ? [
            `卸下 ${unequipPreview.slotLabel} 后`,
            `失能 ${formatSignedEtaDeltaMinutes(unequipPreview.deltaIncap)} · 致死 ${formatSignedEtaDeltaMinutes(unequipPreview.deltaDeath)}`
          ].join("\n")
        : ""
    });
  }

  return actions;
}

function buildEquipmentRows(equipment, selectedSlot, weakSeverityRows, itemsById) {
  return EQUIPMENT_SLOT_ORDER.map((slot) => {
    const itemId = String(equipment?.[slot] || "").trim() || null;
    const item = itemId ? itemsById.get(itemId) : null;
    const thermal = getWearableThermalStats(item);
    const groupMeta = getEquipmentGroupMeta(slot);
    return {
      slot,
      actionId: `inv_select_slot:${slot}`,
      itemId,
      groupId: groupMeta.id,
      groupLabel: groupMeta.label,
      groupTone: groupMeta.tone,
      isSelected: selectedSlot === slot,
      isMissing: !itemId,
      slotLabel: EQUIPMENT_SLOT_LABELS[slot],
      itemName: item?.name || "",
      metricText: itemId ? `I ${thermal.insulation.toFixed(2)} · W ${thermal.windproof.toFixed(2)}` : "",
      stateTag: itemId ? "已装备" : "缺件",
      stateTone: itemId ? "is-equipped" : "is-missing",
      hoverDesc: ""
    };
  });
}

function buildEquipmentGroups(equipmentRows = []) {
  const groups = [];
  for (const row of Array.isArray(equipmentRows) ? equipmentRows : []) {
    const groupId = String(row?.groupId || "ungrouped");
    let group = groups.find((entry) => entry.id === groupId) || null;
    if (!group) {
      group = {
        id: groupId,
        label: String(row?.groupLabel || "装备组"),
        tone: String(row?.groupTone || ""),
        rows: []
      };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

function buildEquippedToolEntries(equippedTools, itemsById) {
  return equippedTools
    .map((entry) => ({
      itemId: entry.itemId,
      toolTag: entry.toolTag,
      toolTagLabel: getToolTagLabel(entry.toolTag),
      itemName: itemsById?.get ? itemsById.get(entry.itemId)?.name || entry.itemId : entry.itemId,
      noteText: entry.itemId === "tool_vitals_monitor" ? "已启用扩展监测" : "已装备工具",
      unequipActionId: `inv_unequip_tool:${entry.itemId}`
    }))
    .sort((a, b) => String(a.toolTagLabel || "").localeCompare(String(b.toolTagLabel || ""), "zh-CN"));
}

function buildInventoryTabs(inventory, itemsById, filter) {
  return INVENTORY_CATEGORIES.map((category) => ({
    category,
    actionId: `inv_filter:${category}`,
    label: `${getCategoryDisplayName(category)}(${inventory.filter((row) => itemsById.get(row.itemId)?.category === category).length})`,
    isSelected: filter === category
  }));
}

function buildStandardRows(inventory, itemsById, filter, selectedSlot, selectedItemId, equipment, equippedTools, capacity, gainHighlightIds) {
  const rows = inventory
    .map((row) => ({ row, item: itemsById.get(row.itemId) }))
    .filter((entry) => entry.item && entry.item.category === filter)
    .filter((entry) => {
      if (!selectedSlot) return true;
      return String(entry.item?.equipSlot || "") === selectedSlot;
    })
    .sort((a, b) => String(a.item.name).localeCompare(String(b.item.name), "zh-CN"));

  return rows.map((entry) => {
    const isEquipped = EQUIPMENT_SLOT_ORDER.some((slot) => equipment[slot] === entry.row.itemId)
      || equippedTools.some((tool) => tool.itemId === entry.row.itemId);
    const canEquip = EQUIPMENT_SLOT_ORDER.includes(String(entry.item.equipSlot || "")) || isToolEquipItem(entry.item);
    const submissionSpec = getSupplySubmissionSpec(entry.item);
    const quality = submissionSpec ? String(submissionSpec.quality || "").trim() : "";
    const qualityClass = getItemQualityClass(entry.item);
    return {
      actionId: `inv_select_item:${entry.row.itemId}`,
      itemId: entry.row.itemId,
      name: entry.item.name,
      quality,
      qualityClass,
      eyebrow: getCategoryDisplayName(String(entry.item.category || filter || "物品")),
      noteText: getItemDescriptionLines(entry.item, 1)[0] || "",
      qtyText: `${entry.row.qty}/${capacity.stackLimit}`,
      stateText: isEquipped ? "已装备" : (entry.row.qty >= capacity.stackLimit ? "满" : (canEquip ? "可装备" : "")),
      stateTone: isEquipped ? "is-active" : (canEquip ? "is-ready" : "is-idle"),
      isSelected: selectedItemId === entry.row.itemId,
      isNewGain: gainHighlightIds.has(entry.row.itemId)
    };
  });
}

function buildClothingCandidateRows(entries, equipment, itemsById, selectedItemId, gainHighlightIds) {
  return entries.map((entry) => {
    const preview = buildClothingCandidatePreview(entry.item, equipment, itemsById);
    const thermal = getWearableThermalStats(entry.item);
    const isEquipped = EQUIPMENT_SLOT_ORDER.some((slot) => equipment?.[slot] === entry.row.itemId);
    const submissionSpec = getSupplySubmissionSpec(entry.item);
    const quality = submissionSpec ? String(submissionSpec.quality || "").trim() : "";
    const qualityClass = getItemQualityClass(entry.item);
    return {
      actionId: `inv_select_item:${entry.row.itemId}`,
      itemId: entry.row.itemId,
      slot: String(entry.item?.equipSlot || ""),
      isSelected: selectedItemId === entry.row.itemId,
      isEquipped,
      isNewGain: gainHighlightIds.has(entry.row.itemId),
      name: entry.item.name,
      quality,
      qualityClass,
      slotLabel: EQUIPMENT_SLOT_LABELS[String(entry.item.equipSlot || "")] || "服装",
      qty: entry.row.qty,
      descText: getItemDescriptionText(entry.item, 4),
      thermal,
      preview: preview
        ? {
            deltaIncapText: formatSignedEtaDeltaMinutes(preview.deltaIncap),
            deltaDeathText: formatSignedEtaDeltaMinutes(preview.deltaDeath),
            deltaIncapTone: preview.deltaIncap > 0 ? "is-up" : (preview.deltaIncap < 0 ? "is-down" : "is-neutral"),
            deltaDeathTone: preview.deltaDeath > 0 ? "is-up" : (preview.deltaDeath < 0 ? "is-down" : "is-neutral")
          }
        : null
    };
  });
}

function buildDossierViewModel({ selectionContext, filter, equipment, itemsById, exposureBaseline, consumableDetailPresentation, footerActionSummary } = {}) {
  const selectedItem = selectionContext?.selectedItem || null;
  const selectedRow = selectionContext?.selectedRow || null;
  const category = String(selectedItem?.category || "").trim();
  const categoryLabel = category ? getCategoryDisplayName(category) : "";

  if (!selectedItem) {
    return {
      empty: true,
      eyebrow: "Dossier",
      panelTitle: "物品档案",
      panelMeta: "",
      title: "未选择物品",
      quality: "",
      qualityClass: "",
      summaryText: "选中后显示档案"
    };
  }

  const submissionSpec = getSupplySubmissionSpec(selectedItem);
  const quality = submissionSpec ? String(submissionSpec.quality || "").trim() : "";
  const qualityClass = getItemQualityClass(selectedItem);
  const recordText = `记录 ID · ${String(selectedItem.id || "--")}`;
  const subtitleParts = [categoryLabel || category || "物品"];
  if (selectionContext.selectedEquipLabel) subtitleParts.push(selectionContext.selectedEquipLabel);
  if (selectionContext.selectedToolLabel) subtitleParts.push(selectionContext.selectedToolLabel);

  const sourceHint = findFirstSourceHint(selectedItem);
  const descriptionText = getItemDescriptionText(selectedItem, 2) || buildCategoryPurposeText(selectedItem, selectionContext, footerActionSummary);
  const rawTags = Array.isArray(selectedItem?.tags) ? selectedItem.tags : [];
  const tags = rawTags.slice(0, 3).map((entry) => String(entry || "").trim()).filter(Boolean);
  const statusText = selectionContext.selectedIsEquipped
    ? "当前已装备"
    : selectionContext.selectedIsToolEquipped
      ? "当前工具位已装备"
      : selectedRow
        ? `库存 x${Math.max(0, Number(selectedRow.qty || 0))}`
        : "仅在穿戴架中可见";

  const ledgerRows = [
    {
      label: "类别",
      value: categoryLabel || category || "未分类"
    },
    {
      label: "状态",
      value: statusText
    },
    {
      label: "数量",
      value: selectedRow ? `x${Math.max(0, Number(selectedRow.qty || 0))}` : (selectionContext.selectedIsEquipped || selectionContext.selectedIsToolEquipped ? "已接入" : "-")
    }
  ];

  if (selectionContext.selectedEquipLabel) {
    ledgerRows.push({
      label: "槽位",
      value: selectionContext.selectedEquipLabel
    });
  }
  if (selectionContext.selectedToolLabel) {
    ledgerRows.push({
      label: "工具标签",
      value: selectionContext.selectedToolLabel
    });
  }
  if (tags.length > 0) {
    ledgerRows.push({
      label: "标签",
      value: tags.join(" / ")
    });
  }
  if (sourceHint) {
    ledgerRows.push({
      label: "来源",
      value: sourceHint
    });
  }

  const statusChips = [];
  if (selectionContext.selectedIsEquipped) {
    statusChips.push({ text: "已装备", tone: "is-active" });
  } else if (selectionContext.selectedIsToolEquipped) {
    statusChips.push({ text: "工具在线", tone: "is-active" });
  }
  if (categoryLabel) {
    statusChips.push({ text: categoryLabel });
  }
  if (selectionContext.selectedEquipLabel) {
    statusChips.push({ text: selectionContext.selectedEquipLabel });
  }
  if (selectionContext.selectedToolLabel) {
    statusChips.push({ text: selectionContext.selectedToolLabel });
  }

  const dossierView = {
    empty: false,
    eyebrow: "Dossier",
    panelTitle: "物品档案",
    panelMeta: "",
    title: String(selectedItem.name || selectedItem.id || "物品"),
    quality,
    qualityClass,
    subtitle: subtitleParts.join(" · "),
    summaryText: statusText,
    bodyText: descriptionText,
    recordText,
    statusChips,
    ledgerRows,
    descriptionLines: getItemDescriptionLines(selectedItem, 4)
  };

  if (category === "clothing") {
    const preview = buildClothingCandidatePreview(selectedItem, equipment, itemsById);
    dossierView.metricBars = [
      {
        label: "I / 隔热",
        value: getWearableThermalStats(selectedItem).insulation
      },
      {
        label: "W / 防风",
        value: getWearableThermalStats(selectedItem).windproof
      }
    ];
    if (preview) {
      dossierView.weaknessRows = Array.isArray(preview.preview?.topWeakSlots)
        ? preview.preview.topWeakSlots.slice(0, 3).map((row, index) => ({
            rankText: `#${index + 1}`,
            slotLabel: row.slotLabel,
            itemName: row.itemName,
            termText: row.leakPowerMeanTerm.toFixed(3),
            missing: row.missing === true
          }))
        : [];
    }
  } else if (category === "consumable") {
    dossierView.effectTag = String(consumableDetailPresentation?.statusTag || "摘要");
    dossierView.effectLines = Array.isArray(consumableDetailPresentation?.effectLines)
      ? consumableDetailPresentation.effectLines.slice()
      : [];
    dossierView.infoLines = Array.isArray(consumableDetailPresentation?.infoLines)
      ? consumableDetailPresentation.infoLines.slice()
      : [];
  }

  return dossierView;
}

export function buildInventoryOverlayViewModel({ state, map } = {}) {
  const db = getItemsDb();
  const itemsById = getItemsById();
  const mapName = String(map?.name || "当前区域");
  const dataReady = !!db && !!itemsById;
  const minimal = {
    kind: "inventory",
    mapName,
    dataReady,
    db,
    itemsById,
    header: {
      capacitySummaryText: ""
    }
  };
  if (!dataReady) return minimal;

  const uiState = getInventoryOverlayUiState(state, itemsById);
  const inventory = normalizeInventory(state?.player?.inventory);
  const equipment = normalizeEquipment(state?.player?.equipment);
  const equippedTools = normalizeEquippedTools(state?.player?.equippedTools);
  const capacity = getCapacityProfile(equipment, itemsById);
  const kinds = countKindsByCategory(inventory, itemsById);
  const clothingCarryQty = inventory.reduce((sum, row) => {
    const item = itemsById.get(row.itemId);
    return isClothingItem(item) ? sum + Math.max(0, Number(row.qty) || 0) : sum;
  }, 0);
  const protectionOverview = buildProtectionProfileUi(equipment, itemsById);
  const exposureBaseline = buildExposureBaselineUi(state?.currentMapId, state?.world);
  const weakSeverityRows = buildWeakSeverityRows(protectionOverview.topWeakSlots);
  const recommendations = buildClothingRecommendations(
    inventory
      .map((row) => ({ row, item: itemsById.get(row.itemId) }))
      .filter((entry) => entry.item?.category === "clothing"),
    equipment,
    itemsById,
    weakSeverityRows
  );
  const selectedItemId = String(uiState.selectedItemId || "").trim();
  const selectedItemDef = selectedItemId ? itemsById.get(selectedItemId) : null;
  const consumableDetailPresentation = buildConsumableDetailPresentation(selectedItemDef, state?.player || null);
  const selectedSlot = uiState.selectedSlot;
  const activeClothingSlot = selectedSlot
    || (isClothingItem(selectedItemDef) && EQUIPMENT_SLOT_ORDER.includes(String(selectedItemDef?.equipSlot || ""))
      ? String(selectedItemDef.equipSlot)
      : null);
  const clothingEntries = inventory
    .map((row) => ({ row, item: itemsById.get(row.itemId) }))
    .filter((entry) => entry.item?.category === "clothing")
    .sort((a, b) => String(a.item?.name || "").localeCompare(String(b.item?.name || ""), "zh-CN"));
  const gainHighlightIds = collectInventoryGainHighlightIds();
  const equippedToolEntries = buildEquippedToolEntries(equippedTools, itemsById);
  const standardRows = buildStandardRows(inventory, itemsById, uiState.filter, selectedSlot, selectedItemId, equipment, equippedTools, capacity, gainHighlightIds);
  const selectedCandidates = activeClothingSlot
    ? (() => {
        const slotEntries = clothingEntries.filter((entry) => String(entry.item?.equipSlot || "") === activeClothingSlot);
        const equippedItemId = String(equipment?.[activeClothingSlot] || "").trim();
        if (equippedItemId && !slotEntries.some((entry) => entry.row.itemId === equippedItemId)) {
          const equippedItem = itemsById.get(equippedItemId);
          if (isClothingItem(equippedItem) && String(equippedItem?.equipSlot || "") === activeClothingSlot) {
            slotEntries.push({ row: { itemId: equippedItemId, qty: 1 }, item: equippedItem });
          }
        }
        return buildClothingCandidateRows(
          sortClothingCandidates(slotEntries, equipment, itemsById, uiState.clothingSortMode),
          equipment,
          itemsById,
          selectedItemId,
          gainHighlightIds
        );
      })()
    : [];
  const selectionContext = buildSelectionContext({ inventory, equipment, equippedTools, selectedItemId, selectedSlot, itemsById });
  const footerActions = buildFooterActionsViewModel(selectionContext, selectedSlot, equipment, itemsById);
  const footerActionSummary = buildActionAvailabilitySummary(footerActions);
  const dossierView = buildDossierViewModel({
    selectionContext,
    filter: uiState.filter,
    equipment,
    itemsById,
    exposureBaseline,
    consumableDetailPresentation,
    footerActionSummary
  });
  const equipmentRows = buildEquipmentRows(equipment, selectedSlot, weakSeverityRows, itemsById);

  return {
    kind: "inventory",
    mapName,
    dataReady,
    db,
    itemsById,
    header: {
      capacitySummaryText: ""
    },
    equipment,
    equippedTools,
    inventory,
    equippedToolEntries,
    vitalsMonitorEnabled: equippedTools.some((entry) => entry.itemId === "tool_vitals_monitor"),
    selectionContext,
    tabs: buildInventoryTabs(inventory, itemsById, uiState.filter),
    equipmentRows,
    equipmentGroups: buildEquipmentGroups(equipmentRows),
    toolSection: {
      entries: equippedToolEntries,
      emptyText: "（当前未装备工具）",
      hintText: "已启用扩展监测"
    },
    listView: {
      filter: uiState.filter,
      title: uiState.filter === "clothing"
        ? (selectedSlot ? `候选列表 · ${EQUIPMENT_SLOT_LABELS[selectedSlot]}` : "推荐补全")
        : "物品",
      standardRows,
      standardEmptyText: selectedSlot
        ? "该分类暂无物品"
        : "该分类暂无物品",
      clothing: {
        activeSlot: activeClothingSlot,
        activeSlotLabel: activeClothingSlot ? (EQUIPMENT_SLOT_LABELS[activeClothingSlot] || activeClothingSlot) : "",
        sortMode: uiState.clothingSortMode,
        sortModeLabel: uiState.clothingSortMode === "death" ? "Δ致死" : "Δ失能",
        candidates: selectedCandidates,
        emptyTitle: "该分类暂无物品",
        emptySub: ""
      }
    },
    summaryView: {
      showPanel: uiState.filter === "clothing" && !!(activeClothingSlot || (selectedItemDef && isClothingItem(selectedItemDef)) || uiState.summaryExpanded),
      expanded: uiState.summaryExpanded,
      protectionOverview,
      exposureBaseline,
      weakSeverityRows,
      recommendations,
      prioritySlotsText: weakSeverityRows.slice(0, 3).map((row) => row.slotLabel).join(" / "),
      shortfallText: weakSeverityRows.length > 0
        ? `短板：${weakSeverityRows.slice(0, 3).map((row) => row.slotLabel).join(" / ")}`
        : "短板：当前无明显短板",
      infoHoverText: [
        "这是外界基准时间，用于比较换装收益",
        "基准：Open · 15km/h · 湿度适中",
        `当前：${exposureBaseline.currentLine1} · ${exposureBaseline.currentLine2}${exposureBaseline.currentTempText ? ` · ${exposureBaseline.currentTempText}` : ""}`,
        "实际生存以温控卡“当前 ETA”为准"
      ].join("\n"),
      headlineText: `失能 ${formatThermalEtaMinutes(protectionOverview.timings?.T_incap)} · 致死 ${formatThermalEtaMinutes(protectionOverview.timings?.T_death)}`,
      metaText: `隔热 ${protectionOverview.insulationEff.toFixed(2)} · 防风 ${protectionOverview.windproofEff.toFixed(2)} · 综合 ${protectionOverview.protectionScore.toFixed(2)}`,
      expandedWeakRows: weakSeverityRows.map((row, index) => ({
        slotLabel: row.slotLabel,
        metaText: `${row.missing ? "缺失" : "偏弱"} · ${row.severity}`,
        hoverDesc: buildWeakSlotContributionTooltip(row, index)
      }))
    },
    dossierView,
    footerView: {
      isIdle: !selectionContext.selectedItem,
      targetLabel: selectionContext.selectedItem ? `当前目标 · ${selectionContext.selectedItem.name}` : "当前目标 · 未选择",
      targetName: selectionContext.selectedItem ? String(selectionContext.selectedItem.name || "") : "",
      targetQuality: selectionContext.selectedItem ? String(getSupplySubmissionSpec(selectionContext.selectedItem)?.quality || "").trim() : "",
      targetQualityClass: selectionContext.selectedItem ? getItemQualityClass(selectionContext.selectedItem) : "",
      targetMeta: selectionContext.selectedItem
        ? (
          selectionContext.selectedToolLabel
          || selectionContext.selectedEquipLabel
          || getCategoryDisplayName(String(selectionContext.selectedItem.category || ""))
          || String(selectionContext.selectedItem.category || "物品")
        )
        : "",
      effectSummary: footerActionSummary.effectSummary || footerActionSummary.executionText || "",
      disabledReason: selectionContext.selectedItem ? footerActionSummary.disabledReason : "未选择目标",
      primaryAction: footerActionSummary.primary,
      secondaryActions: footerActionSummary.secondary,
      actions: footerActions
    },
    debugSnapshot: {
      inventory: {
        tool_thermometer: inventory.find((row) => row.itemId === "tool_thermometer")?.qty || 0,
        tool_vitals_monitor: inventory.find((row) => row.itemId === "tool_vitals_monitor")?.qty || 0,
        tool_small_flashlight: inventory.find((row) => row.itemId === "tool_small_flashlight")?.qty || 0
      },
      equippedTools,
      equipment,
      thermal: state?.player?.gear?.thermal || null,
      equippedToolEntries,
      selectedToolTagLabel: selectionContext.selectedToolLabel || null,
      vitalsMonitorEnabled: equippedTools.some((entry) => entry.itemId === "tool_vitals_monitor")
    }
  };
}