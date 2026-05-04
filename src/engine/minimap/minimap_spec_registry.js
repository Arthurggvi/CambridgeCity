import { BUS_ONBOARD_MAP_ID, getLineById, getStopById } from "../transit/transit_service.js";

function freezeMapEntries(entries) {
  return new Map(entries.map(([key, value]) => [key, value]));
}

function freezePositions(entries) {
  return new Map(entries.map(([key, value]) => [key, Object.freeze({ ...value })]));
}

function defineMinimapSpec({
  specId,
  nodes,
  edges,
  mapIdToNodeId,
  mainPathOrder,
  branchOf = {},
  positions = null,
  layoutParams = null,
  panel = null
}) {
  const branchMeta = Object.freeze({ ...branchOf });
  const normalizedNodes = Object.freeze(nodes.map((node) => Object.freeze({
    ...node,
    branchOf: branchMeta[node.id] || node.branchOf || null
  })));
  const normalizedEdges = Object.freeze(edges.map((edge) => Object.freeze({ ...edge })));

  return Object.freeze({
    specId,
    nodes: normalizedNodes,
    edges: normalizedEdges,
    mapIdToNodeId: freezeMapEntries(mapIdToNodeId),
    mainPathOrder: Object.freeze([...mainPathOrder]),
    branchOf: branchMeta,
    positions: positions ? freezePositions(positions) : null,
    layoutParams: layoutParams ? Object.freeze({ ...layoutParams }) : null,
    panel: panel ? Object.freeze({ ...panel }) : null
  });
}

function buildTransitLineMiniMapPositions(stopIds, panel = {}) {
  const ids = Array.isArray(stopIds) ? stopIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
  const count = ids.length;
  const viewBoxWidth = Number(panel?.viewBoxWidth) || 300;
  const y = Number(panel?.lineY) || 84;
  const startX = Number(panel?.startX) || 42;
  const endX = Number(panel?.endX) || (viewBoxWidth - 54);
  const positions = [];

  if (count <= 0) return positions;
  if (count === 1) {
    positions.push([ids[0], { x: Math.round((startX + endX) / 2), y }]);
    return positions;
  }

  const step = (endX - startX) / Math.max(1, count - 1);
  ids.forEach((stopId, index) => {
    positions.push([stopId, {
      x: Math.round(startX + step * index),
      y
    }]);
  });
  return positions;
}

export function buildTransitLineMiniMapSpec(lineDef, stopRegistry = null) {
  const line = lineDef && typeof lineDef === "object" ? lineDef : null;
  const stopIds = Array.isArray(line?.stopIds)
    ? line.stopIds.map((stopId) => String(stopId || "").trim()).filter(Boolean)
    : [];
  if (!line || stopIds.length <= 0) return null;

  const nodes = stopIds.map((stopId) => {
    const stop = stopRegistry instanceof Map
      ? stopRegistry.get(stopId) || getStopById(stopId)
      : getStopById(stopId);
    const label = String(stop?.uiMeta?.title || stop?.name || stopId).trim() || stopId;
    return { id: stopId, label };
  });

  const edges = [];
  for (let index = 0; index < stopIds.length - 1; index += 1) {
    edges.push({ from: stopIds[index], to: stopIds[index + 1] });
  }

  const panel = {
    title: String(line?.name || "线路图").trim() || "线路图",
    badge: "线",
    ariaLabel: `${String(line?.name || "线路").trim() || "线路"}车上站点图`,
    panelLabel: String(line?.name || "线路").trim() || "线路",
    viewBox: "0 0 300 150",
    viewBoxWidth: 300,
    viewBoxHeight: 150,
    startX: 42,
    endX: 246,
    lineY: 78,
    band: { x: 10, y: 24, width: 280, height: 102, rx: 8 }
  };

  return defineMinimapSpec({
    specId: `transit_line:${String(line.lineId || "").trim()}`,
    nodes,
    edges,
    mapIdToNodeId: [
      [BUS_ONBOARD_MAP_ID, stopIds[0]]
    ],
    mainPathOrder: stopIds,
    positions: buildTransitLineMiniMapPositions(stopIds, panel),
    panel
  });
}

export function resolveTransitOnboardMiniMapSpec(lineId) {
  const line = getLineById(lineId);
  if (!line) return null;
  return buildTransitLineMiniMapSpec(line);
}

export const MINIMAP_SPECS = Object.freeze({
  clinic: defineMinimapSpec({
    specId: "clinic",
    nodes: [
      { id: "street_entrance", label: "街道入口", floor: 1, labelDx: 0, labelDy: 15, labelAnchor: "middle" },
      { id: "lobby_1f", label: "一楼前厅", floor: 1, labelDx: 0, labelDy: 15, labelAnchor: "middle", role: "stair_anchor" },
      { id: "reception_1f", label: "一楼接待", floor: 1, labelDx: 0, labelDy: 15, labelAnchor: "middle" },
      { id: "hall_2f", label: "二楼大厅", floor: 2, labelDx: 0, labelDy: -14, labelAnchor: "middle", role: "stair_anchor" },
      { id: "ward_2f", label: "病房区", floor: 2, labelDx: 11, labelDy: 1, labelAnchor: "start" },
      { id: "obs_2f", label: "急诊观察区", floor: 2, labelDx: 0, labelDy: -14, labelAnchor: "middle" }
    ],
    edges: [
      { from: "street_entrance", to: "lobby_1f" },
      { from: "lobby_1f", to: "reception_1f" },
      { from: "lobby_1f", to: "hall_2f", kind: "stairs" },
      { from: "hall_2f", to: "ward_2f" },
      { from: "hall_2f", to: "obs_2f" }
    ],
    mapIdToNodeId: [
      ["bayport_clinic", "lobby_1f"],
      ["bayport_clinic_counter_day", "reception_1f"],
      ["bayport_clinic_counter_night", "reception_1f"],
      ["bayport_clinic_upstairs_hall", "hall_2f"],
      ["bayport_clinic_ward", "ward_2f"],
      ["bayport_clinic_obs", "obs_2f"]
    ],
    mainPathOrder: ["street_entrance", "lobby_1f", "hall_2f", "obs_2f"],
    branchOf: {
      reception_1f: "lobby_1f",
      ward_2f: "hall_2f"
    },
    positions: [
      ["street_entrance", { x: 72, y: 122 }],
      ["lobby_1f", { x: 144, y: 122 }],
      ["reception_1f", { x: 236, y: 122 }],
      ["hall_2f", { x: 144, y: 48 }],
      ["obs_2f", { x: 236, y: 48 }],
      ["ward_2f", { x: 236, y: 68 }]
    ],
    panel: {
      title: "诊所地图",
      badge: "✚",
      ariaLabel: "诊所双楼层示意图",
      panelLabel: "诊所双楼层示意",
      viewBox: "0 0 320 172",
      viewBoxWidth: 320,
      viewBoxHeight: 172,
      nodeRadius: 4.6,
      floors: Object.freeze([
        Object.freeze({ id: "floor_2f", label: "二楼", x: 18, y: 20, width: 284, height: 52, rx: 10, labelX: 26, labelY: 35, ruleX1: 58, ruleX2: 286, ruleY: 48 }),
        Object.freeze({ id: "floor_1f", label: "一楼", x: 18, y: 94, width: 284, height: 52, rx: 10, labelX: 26, labelY: 109, ruleX1: 58, ruleX2: 286, ruleY: 122 })
      ]),
      connectors: Object.freeze([
        Object.freeze({ id: "stairs_main", from: "lobby_1f", to: "hall_2f", kind: "stairs", shaftWidth: 18, capWidth: 12 })
      ])
    }
  }),
  winddyke: defineMinimapSpec({
    specId: "winddyke",
    nodes: [
      { id: "clinic_segment", label: "诊所段" },
      { id: "corner_notice", label: "转角公告" },
      { id: "transit_plaza", label: "站前交换区" },
      { id: "industrial_split", label: "工区分流段" }
    ],
    edges: [
      { from: "clinic_segment", to: "corner_notice" },
      { from: "corner_notice", to: "transit_plaza" },
      { from: "corner_notice", to: "industrial_split" }
    ],
    mapIdToNodeId: [
      ["winddyke_street_clinic_segment", "clinic_segment"],
      ["winddyke_street_corner_notice", "corner_notice"],
      ["transit_exchange_plaza", "transit_plaza"]
    ],
    mainPathOrder: ["clinic_segment", "corner_notice"],
    branchOf: {
      transit_plaza: "corner_notice",
      industrial_split: "corner_notice"
    },
    positions: [
      ["clinic_segment", { x: 50, y: 76 }],
      ["corner_notice", { x: 122, y: 76 }],
      ["transit_plaza", { x: 210, y: 56 }],
      ["industrial_split", { x: 210, y: 98 }]
    ],
    panel: {
      title: "风堤街全貌",
      badge: "➤",
      ariaLabel: "风堤街区地图",
      panelLabel: "风堤街区",
      viewBox: "0 0 300 150",
      band: { x: 10, y: 24, width: 280, height: 102, rx: 8 }
    }
  }),
  heatcorridor: defineMinimapSpec({
    specId: "heatcorridor",
    nodes: [
      { id: "bus_stop", label: "站牌", labelDx: 0, labelDy: 16, labelAnchor: "middle" },
      { id: "front_hall", label: "前廊", labelDx: 0, labelDy: 16, labelAnchor: "middle" },
      { id: "shop_window", label: "商铺", labelDx: 0, labelDy: -16, labelAnchor: "middle" },
      { id: "night_kitchen", label: "24/7夜灶", labelDx: 0, labelDy: 16, labelAnchor: "middle" },
      { id: "night_kitchen_window", label: "热食窗口", labelDx: 0, labelDy: -16, labelAnchor: "middle" },
      { id: "night_kitchen_counter", label: "堂食窄台", labelDx: 0, labelDy: -16, labelAnchor: "middle" },
      { id: "rear_section", label: "后区", labelDx: 0, labelDy: 16, labelAnchor: "middle" },
      { id: "dorm", label: "临时宿舍", labelDx: 0, labelDy: 16, labelAnchor: "middle" }
    ],
    edges: [
      { from: "bus_stop", to: "front_hall" },
      { from: "front_hall", to: "rear_section" },
      { from: "front_hall", to: "shop_window" },
      { from: "front_hall", to: "night_kitchen" },
      { from: "night_kitchen", to: "night_kitchen_window" },
      { from: "night_kitchen", to: "night_kitchen_counter" },
      { from: "rear_section", to: "dorm" }
    ],
    mapIdToNodeId: [
      ["heatcorridor_bus_stop", "bus_stop"],
      ["heatcorridor_front_hall", "front_hall"],
      ["heatcorridor_shop_window", "shop_window"],
      ["heatcorridor_night_kitchen", "night_kitchen"],
      ["heatcorridor_night_kitchen_window", "night_kitchen_window"],
      ["heatcorridor_night_kitchen_counter", "night_kitchen_counter"],
      ["heatcorridor_rear_section", "rear_section"],
      ["rear_zone_lodging_intro_01", "rear_section"],
      ["rear_zone_lodging_intro_02", "rear_section"],
      ["rear_zone_lodging_counter_01", "rear_section"],
      ["rear_zone_lodging_quote_01", "rear_section"],
      ["rear_zone_lodging_confirm_01", "rear_section"],
      ["rear_zone_lodging_insufficient_01", "rear_section"],
      ["rear_zone_lodging_checkout_0900", "rear_section"],
      ["rear_zone_dorm_placeholder", "dorm"]
    ],
    mainPathOrder: ["bus_stop", "front_hall", "rear_section"],
    branchOf: {
      shop_window: "front_hall",
      night_kitchen: "front_hall",
      night_kitchen_window: "night_kitchen",
      night_kitchen_counter: "night_kitchen",
      dorm: "rear_section"
    },
    positions: [
      ["bus_stop", { x: 50, y: 88 }],
      ["front_hall", { x: 126, y: 88 }],
      ["shop_window", { x: 126, y: 50 }],
      ["night_kitchen", { x: 126, y: 126 }],
      ["night_kitchen_window", { x: 74, y: 126, labelDx: 0, labelDy: -16, labelAnchor: "middle" }],
      ["night_kitchen_counter", { x: 178, y: 126, labelDx: 0, labelDy: -16, labelAnchor: "middle" }],
      ["rear_section", { x: 246, y: 88 }],
      ["dorm", { x: 246, y: 126 }]
    ],
    panel: {
      title: "热廊服务带",
      badge: "热",
      ariaLabel: "热廊服务带地图",
      panelLabel: "热廊服务带",
      viewBox: "0 0 300 170",
      band: { x: 10, y: 24, width: 280, height: 130, rx: 8 }
    }
  }),
  industrial: defineMinimapSpec({
    specId: "industrial",
    nodes: [
      { id: "split", label: "工区分流口" },
      { id: "warehouse_gate", label: "仓储门岗" },
      { id: "maintenance_gate", label: "维修门岗" }
    ],
    edges: [
      { from: "split", to: "warehouse_gate" },
      { from: "split", to: "maintenance_gate" }
    ],
    mapIdToNodeId: [
      ["industrial_split", "split"],
      ["industrial_warehouse_gate", "warehouse_gate"],
      ["industrial_maintenance_gate", "maintenance_gate"]
    ],
    mainPathOrder: ["split"],
    branchOf: {
      warehouse_gate: "split",
      maintenance_gate: "split"
    },
    positions: [
      ["split", { x: 86, y: 78 }],
      ["warehouse_gate", { x: 210, y: 56 }],
      ["maintenance_gate", { x: 210, y: 102 }]
    ]
  }),
  gov: defineMinimapSpec({
    specId: "gov",
    nodes: [
      { id: "entry_split", label: "入口分流" },
      { id: "main_hall", label: "大厅" },
      { id: "window_1", label: "一号仓" },
      { id: "side_corridor", label: "侧廊" }
    ],
    edges: [
      { from: "entry_split", to: "main_hall" },
      { from: "entry_split", to: "window_1" },
      { from: "main_hall", to: "side_corridor" }
    ],
    mapIdToNodeId: [
      ["gov_hall_entry_split", "entry_split"],
      ["gov_hall_main_hall", "main_hall"],
      ["gov_hall_window_1", "window_1"],
      ["gov_hall_side_corridor", "side_corridor"]
    ],
    mainPathOrder: ["entry_split", "main_hall", "side_corridor"],
    branchOf: {
      window_1: "entry_split"
    },
    positions: [
      ["entry_split", { x: 70, y: 78 }],
      ["main_hall", { x: 154, y: 62 }],
      ["window_1", { x: 154, y: 104 }],
      ["side_corridor", { x: 236, y: 62 }]
    ]
  }),
  steelcross_port: defineMinimapSpec({
    specId: "steelcross_port",
    nodes: [
      { id: "port", label: "港口" },
      { id: "dock", label: "码头" },
      { id: "arrival_market", label: "到港集会", labelDx: -10, labelDy: 16, labelAnchor: "end" },
      { id: "mutual_aid", label: "互助堂" }
    ],
    edges: [
      { from: "port", to: "dock" },
      { from: "port", to: "arrival_market" },
      { from: "port", to: "mutual_aid" }
    ],
    mapIdToNodeId: [
      ["steelcross_port", "port"],
      ["steelcross_dock_placeholder", "dock"],
      ["steelcross_mutual_aid_placeholder", "mutual_aid"]
    ],
    mainPathOrder: ["dock", "port"],
    branchOf: {
      arrival_market: "port",
      mutual_aid: "port"
    },
    positions: [
      ["dock", { x: 54, y: 82 }],
      ["port", { x: 134, y: 82 }],
      ["arrival_market", { x: 236, y: 54 }],
      ["mutual_aid", { x: 236, y: 110 }]
    ],
    panel: {
      title: "钢十字港口",
      badge: "港",
      ariaLabel: "钢十字港口总图",
      panelLabel: "港口总图",
      viewBox: "0 0 300 160",
      band: { x: 10, y: 24, width: 280, height: 116, rx: 8 }
    }
  }),
  steelcross_market: defineMinimapSpec({
    specId: "steelcross_market",
    nodes: [
      { id: "market_01", label: "好食味", labelDx: 10, labelDy: 18, labelAnchor: "start" },
      { id: "market_02", label: "捕鱼人哈德", labelDy: -18 },
      { id: "market_03", label: "新四杂货", labelDy: 18 },
      { id: "market_04", label: "旧海补丁铺", labelDy: -18 },
      { id: "market_05", label: "单证代办桌", labelDy: 18 },
      { id: "market_06", label: "单证代办桌", labelDx: 16, labelDy: -18, labelAnchor: "end" }
    ],
    edges: [
      { from: "market_01", to: "market_02" },
      { from: "market_02", to: "market_03" },
      { from: "market_03", to: "market_04" },
      { from: "market_04", to: "market_05" },
      { from: "market_05", to: "market_06" }
    ],
    mapIdToNodeId: [
      ["steelcross_market_01", "market_01"],
      ["steelcross_market_02", "market_02"],
      ["steelcross_market_03", "market_03"],
      ["steelcross_market_04", "market_04"],
      ["steelcross_market_05", "market_05"],
      ["steelcross_market_06", "market_06"],
      ["steelcross_market_07", ""],
      ["steelcross_market_stall_01_intro_1", "market_02"],
      ["steelcross_market_stall_01_intro_2", "market_02"],
      ["steelcross_market_stall_01_placeholder", "market_02"],
      ["steelcross_market_stall_02_placeholder", "market_03"],
      ["steelcross_market_stall_03_placeholder", "market_04"],
      ["steelcross_market_stall_04_placeholder", ""],
      ["steelcross_market_stall_05_placeholder", "market_01"],
      ["steelcross_market_stall_06_placeholder", ""],
      ["steelcross_market_stall_07_placeholder", ""]
    ],
    mainPathOrder: ["market_01", "market_02", "market_03", "market_04", "market_05", "market_06"],
    positions: [
      ["market_01", { x: 38, y: 78 }],
      ["market_02", { x: 82, y: 78 }],
      ["market_03", { x: 126, y: 78 }],
      ["market_04", { x: 170, y: 78 }],
      ["market_05", { x: 214, y: 78 }],
      ["market_06", { x: 258, y: 78 }]
    ],
    panel: {
      title: "到港集会内部",
      badge: "集",
      ariaLabel: "到港集会内部地图",
      panelLabel: "摊位 1-6",
      viewBox: "0 0 300 156",
      band: { x: 10, y: 24, width: 280, height: 112, rx: 8 }
    }
  })
});

export function resolveMapMiniMapBranch(mapId) {
  const id = String(mapId || "");
  if (id === BUS_ONBOARD_MAP_ID) return "winddyke";
  if (MINIMAP_SPECS.steelcross_port.mapIdToNodeId.has(id)) return "steelcross";
  if (MINIMAP_SPECS.steelcross_market.mapIdToNodeId.has(id)) return "steelcross";
  if (MINIMAP_SPECS.industrial.mapIdToNodeId.has(id)) return "industrial";
  if (MINIMAP_SPECS.heatcorridor.mapIdToNodeId.has(id)) return "winddyke";
  if (MINIMAP_SPECS.winddyke.mapIdToNodeId.has(id)) return "winddyke";
  if (MINIMAP_SPECS.gov.mapIdToNodeId.has(id)) return "gov";
  if (MINIMAP_SPECS.clinic.mapIdToNodeId.has(id)) return "clinic";
  return null;
}

export function resolveWinddykeMiniMapSpec(mapId) {
  const id = String(mapId || "");
  const spec = MINIMAP_SPECS.heatcorridor.mapIdToNodeId.has(id)
    ? MINIMAP_SPECS.heatcorridor
    : MINIMAP_SPECS.winddyke;
  return {
    spec,
    currentNodeId: spec.mapIdToNodeId.get(id)
  };
}

export function resolveSteelcrossMiniMapSpec(mapId) {
  const id = String(mapId || "");
  const spec = MINIMAP_SPECS.steelcross_port.mapIdToNodeId.has(id)
    ? MINIMAP_SPECS.steelcross_port
    : MINIMAP_SPECS.steelcross_market.mapIdToNodeId.has(id)
    ? MINIMAP_SPECS.steelcross_market
    : null;
  return {
    spec,
    currentNodeId: spec ? String(spec.mapIdToNodeId.get(id) || "") : ""
  };
}
