/**
 * Read-only view-model slices for wilderness "工具读数" overlay.
 * Does not write gameState.
 */

import { normalizeEquippedTools, getItemsById, isToolEquipItem } from "../items_db.js";
import { getPlayerDerived } from "../player.js";

export const WILDERNESS_TOOL_READOUT_TAGS = Object.freeze({
  GPS: "wilderness_gps",
  COMPASS: "magnetic_compass",
  HEART: "heart_rate_monitor",
  ANEMOMETER: "wind_anemometer",
  VANE: "electronic_wind_vane",
  SNOW: "snow_depth_sensor"
});

const HEADING_ZH = Object.freeze({
  N: "北",
  NE: "东北",
  E: "东",
  SE: "东南",
  S: "南",
  SW: "西南",
  W: "西",
  NW: "西北"
});

const WIND_DIR_ZH = Object.freeze({
  N: "北风",
  NE: "东北风",
  E: "东风",
  SE: "东南风",
  S: "南风",
  SW: "西南风",
  W: "西风",
  NW: "西北风"
});

function footPassZh(kind) {
  const k = String(kind || "").trim();
  if (k === "allowed") return "可步行";
  if (k === "forbidden") return "不可步行";
  if (k === "conditional") return "条件步行";
  if (k === "slow") return "慢行";
  return k || "—";
}

function vehiclePassZh(kind) {
  const k = String(kind || "").trim();
  if (k === "allowed") return "可载具通行";
  if (k === "forbidden") return "不可载具通行";
  if (k === "conditional") return "条件载具通行";
  if (k === "slow") return "载具慢行";
  return k || "—";
}

function footVehicleZh(foot, vehicle) {
  return {
    foot: footPassZh(foot),
    vehicle: vehiclePassZh(vehicle)
  };
}

function windDirToZh(dir) {
  const d = String(dir || "").trim().toUpperCase();
  return WIND_DIR_ZH[d] || d || "—";
}

function collectStaminaPreviewRange(actions) {
  const costs = [];
  if (!Array.isArray(actions)) return null;
  for (const a of actions) {
    const pr = a?.probe;
    if (!pr || typeof pr !== "object") continue;
    const sc = pr.staminaCostPreview;
    if (sc === Infinity) continue;
    const n = Number(sc);
    if (Number.isFinite(n)) costs.push(n);
  }
  if (costs.length === 0) return null;
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  return { min, max, same: min === max };
}

function movementLoadLabel(range) {
  if (!range) return "—";
  const span = range.max - range.min;
  if (span <= 0 && range.min <= 6) return "低";
  if (range.max <= 10) return "低";
  if (range.max <= 18) return "中";
  return "高";
}

function hasEquippedTag(equipped, tag) {
  return equipped.some((e) => String(e.toolTag || "") === tag);
}

const READOUT_TAG_SET = new Set(Object.values(WILDERNESS_TOOL_READOUT_TAGS));

function hasEquippedAnyReadoutInstrument(equipped) {
  return equipped.some((e) => READOUT_TAG_SET.has(String(e.toolTag || "")));
}

const TOOL_INDEX_SLOTS = Object.freeze([
  { id: "gps", indexName: "GPS", tag: WILDERNESS_TOOL_READOUT_TAGS.GPS, cardKind: "gps" },
  { id: "compass", indexName: "磁罗盘", tag: WILDERNESS_TOOL_READOUT_TAGS.COMPASS, cardKind: "compass" },
  { id: "heart", indexName: "心率监测仪", tag: WILDERNESS_TOOL_READOUT_TAGS.HEART, cardKind: "heart" },
  { id: "anemometer", indexName: "手持风速仪", tag: WILDERNESS_TOOL_READOUT_TAGS.ANEMOMETER, cardKind: "anemometer" },
  { id: "vane", indexName: "电子风向标", tag: WILDERNESS_TOOL_READOUT_TAGS.VANE, cardKind: "vane" },
  { id: "snow", indexName: "雪深传感器", tag: WILDERNESS_TOOL_READOUT_TAGS.SNOW, cardKind: "snow" }
]);

function rowByLabel(rows, label) {
  const r = Array.isArray(rows) ? rows.find((x) => x && String(x.label || "") === label) : null;
  return r ? String(r.value ?? "—") : "—";
}

function sectionsFromGpsCard(card) {
  const rows = Array.isArray(card?.rows) ? card.rows : [];
  const f = (labels) =>
    labels.map((label) => ({
      label,
      value: rowByLabel(rows, label)
    }));
  return [
    { title: "定位", fields: f(["区域名称", "areaId", "regionId", "坐标", "会话状态"]) },
    { title: "地貌", fields: f(["当前地貌", "步行通行", "载具通行"]) },
    { title: "移动", fields: f(["移动耗时倍率", "体力消耗倍率"]) },
    { title: "环境基线", fields: f(["T_base", "MoistureIndex"]) }
  ];
}

function sectionsFromGenericCard(card, sectionTitle = "读数") {
  const rows = Array.isArray(card?.rows) ? card.rows : [];
  const fields = [];
  for (const row of rows) {
    if (!row || row.type === "subheading") continue;
    fields.push({ label: String(row.label || ""), value: String(row.value ?? "—") });
  }
  return [{ title: sectionTitle, fields }];
}

function buildDetailsByIdFromCards(cards) {
  const byKind = {};
  for (const c of cards) {
    if (c && typeof c.kind === "string") byKind[c.kind] = c;
  }
  const detailsById = {};
  for (const slot of TOOL_INDEX_SLOTS) {
    const card = byKind[slot.cardKind];
    if (!card) continue;
    if (slot.cardKind === "gps") {
      detailsById[slot.id] = { sections: sectionsFromGpsCard(card) };
    } else if (slot.cardKind === "compass") {
      detailsById[slot.id] = { sections: sectionsFromGenericCard(card, "罗盘") };
    } else if (slot.cardKind === "heart") {
      detailsById[slot.id] = { sections: sectionsFromGenericCard(card, "生理") };
    } else if (slot.cardKind === "anemometer") {
      detailsById[slot.id] = { sections: sectionsFromGenericCard(card, "风速") };
    } else if (slot.cardKind === "vane") {
      detailsById[slot.id] = { sections: sectionsFromGenericCard(card, "风向") };
    } else if (slot.cardKind === "snow") {
      detailsById[slot.id] = { sections: sectionsFromGenericCard(card, "地表传感") };
    }
  }
  return detailsById;
}

function buildToolIndex(equipped, cards) {
  const byKind = {};
  for (const c of cards) {
    if (c && typeof c.kind === "string") byKind[c.kind] = c;
  }
  const toolIndex = [];
  for (const slot of TOOL_INDEX_SLOTS) {
    const eq = hasEquippedTag(equipped, slot.tag);
    const hasCard = !!byKind[slot.cardKind];
    let status = "unequipped";
    let statusLabel = "未装备";
    if (eq && hasCard) {
      status = "connected";
      statusLabel = "已连接";
    } else if (eq && !hasCard) {
      status = "no_readout";
      statusLabel = "无读数";
    }
    toolIndex.push({
      id: slot.id,
      indexName: slot.indexName,
      tag: slot.tag,
      status,
      statusLabel
    });
  }
  return toolIndex;
}

function resolveDefaultSelectedId(toolIndex) {
  const firstConnected = toolIndex.find((t) => t.status === "connected");
  if (firstConnected) return firstConnected.id;
  const firstNo = toolIndex.find((t) => t.status === "no_readout");
  if (firstNo) return firstNo.id;
  return toolIndex[0]?.id || null;
}

/**
 * @param {object} gameState
 * @param {object} vm wilderness view model slice (session, terrain, climate, surface, actions)
 * @returns {{
 *   cards: object[],
 *   hasAnyTool: boolean,
 *   hasEquippedWildernessReadoutTool: boolean,
 *   toolIndex: object[],
 *   detailsById: Record<string, { sections: { title: string, fields: { label: string, value: string }[] }[] }>,
 *   defaultSelectedId: string | null
 * }}
 */
export function buildWildernessToolReadoutCards(gameState, vm) {
  const itemsById = getItemsById();
  const raw = normalizeEquippedTools(gameState?.player?.equippedTools);
  const equipped = [];
  for (const row of raw) {
    const item = itemsById?.get?.(String(row.itemId || ""));
    if (!item || !isToolEquipItem(item)) continue;
    if (String(item.toolTag || "") !== String(row.toolTag || "")) continue;
    equipped.push({ itemId: row.itemId, toolTag: row.toolTag });
  }

  const cards = [];
  const s = vm?.session;
  const terrain = vm?.terrain;
  const climate = vm?.climate;
  const surface = vm?.surface;
  const actions = vm?.actions;
  const wx = gameState?.world?.weather && typeof gameState.world.weather === "object" ? gameState.world.weather : {};

  if (hasEquippedTag(equipped, WILDERNESS_TOOL_READOUT_TAGS.GPS) && s && terrain && climate) {
    const pv = footVehicleZh(terrain.passability?.foot, terrain.passability?.vehicle);
    cards.push({
      kind: "gps",
      title: "GPS",
      rows: [
        { label: "区域名称", value: String(s.areaLabel || "—") },
        { label: "areaId", value: String(s.areaId || "—") },
        { label: "regionId", value: String(s.regionId || "—") },
        { label: "坐标", value: `${s.x}, ${s.y}` },
        { label: "会话状态", value: String(s.state || "—") },
        { label: "当前地貌", value: String(terrain.label || "—") },
        { label: "步行通行", value: pv.foot },
        { label: "载具通行", value: pv.vehicle },
        { label: "移动耗时倍率", value: String(terrain.move?.moveTimeMult ?? "—") },
        { label: "体力消耗倍率", value: String(terrain.move?.staminaCostMult ?? "—") },
        { label: "T_base", value: String(climate.T_base ?? "—") },
        { label: "MoistureIndex", value: String(climate.MoistureIndex ?? "—") }
      ]
    });
  }

  if (hasEquippedTag(equipped, WILDERNESS_TOOL_READOUT_TAGS.COMPASS) && s) {
    const h = String(s.heading || "N").trim().toUpperCase();
    cards.push({
      kind: "compass",
      title: "磁罗盘",
      rows: [
        { label: "当前朝向", value: h },
        { label: "中文朝向", value: HEADING_ZH[h] || h },
        {
          label: "八向方位提示",
          value: "北 / 东北 / 东 / 东南 / 南 / 西南 / 西 / 西北"
        }
      ]
    });
  }

  if (hasEquippedTag(equipped, WILDERNESS_TOOL_READOUT_TAGS.HEART)) {
    const p = gameState?.player;
    const derived =
      p && typeof p === "object" && p.psycho && p.physio ? getPlayerDerived(p) : { attrs: {} };
    const stamina = Number(derived?.attrs?.stamina?.cur);
    const fatigue = Number(derived?.attrs?.fatigue?.cur);
    const range = collectStaminaPreviewRange(actions);
    let previewText = "—";
    if (range) {
      previewText = range.same ? String(range.min) : `${range.min}–${range.max}`;
    }
    cards.push({
      kind: "heart",
      title: "心率监测仪",
      rows: [
        { label: "体力", value: Number.isFinite(stamina) ? String(Math.round(stamina)) : "—" },
        { label: "疲劳", value: Number.isFinite(fatigue) ? String(Math.round(fatigue)) : "—" },
        { label: "当前移动预计体力消耗", value: previewText },
        { label: "行动负荷", value: movementLoadLabel(range) }
      ]
    });
  }

  if (hasEquippedTag(equipped, WILDERNESS_TOOL_READOUT_TAGS.ANEMOMETER) && climate) {
    const cur = Number(wx.windSpeed_local);
    const base = Number(climate.WindBase);
    const useCur = Number.isFinite(cur) && cur > 0;
    const speedText = useCur ? String(cur) : `WindBase: ${Number.isFinite(base) ? base : "—"}`;
    cards.push({
      kind: "anemometer",
      title: "手持风速仪",
      rows: [
        { label: "当前风速", value: speedText },
        { label: "单位", value: "m/s" }
      ]
    });
  }

  if (hasEquippedTag(equipped, WILDERNESS_TOOL_READOUT_TAGS.VANE) && climate) {
    const curD = String(wx.windDir_local || "").trim().toUpperCase();
    const baseD = String(climate.WindDir_prevailing || "").trim().toUpperCase();
    const useCur = curD.length > 0 && WIND_DIR_ZH[curD];
    const dir = useCur ? curD : baseD;
    cards.push({
      kind: "vane",
      title: "便携式电子风向标",
      rows: [
        { label: "当前风向", value: dir || "—" },
        { label: "中文风向", value: windDirToZh(dir) }
      ]
    });
  }

  if (hasEquippedTag(equipped, WILDERNESS_TOOL_READOUT_TAGS.SNOW) && surface) {
    cards.push({
      kind: "snow",
      title: "超声波雪深传感器",
      rows: [
        { label: "雪深", value: `${String(surface.snowDepthCm ?? "—")} cm` },
        { label: "轨迹保留", value: String(surface.trailRetention ?? "—") },
        { label: "能见度等级", value: String(surface.visibilityLevel ?? "—") },
        { label: "探读置信倍率", value: String(surface.probeConfidenceMult ?? "—") }
      ]
    });
  }

  const toolIndex = buildToolIndex(equipped, cards);
  const detailsById = buildDetailsByIdFromCards(cards);
  const defaultSelectedId = resolveDefaultSelectedId(toolIndex);

  return {
    cards,
    hasAnyTool: equipped.length > 0,
    hasEquippedWildernessReadoutTool: hasEquippedAnyReadoutInstrument(equipped),
    toolIndex,
    detailsById,
    defaultSelectedId
  };
}
