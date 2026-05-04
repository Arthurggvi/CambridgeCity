// Steelcross market stalls share one daily refresh directory.
// This file stays data-only so future content work can fill candidateGoods
// without touching any refresh logic.

const DEFAULT_COUNT_WEIGHTS = Object.freeze({ 1: 60, 2: 30, 3: 10 });

function createDailyRefreshDef({ stallId, mapId, label, countWeights = DEFAULT_COUNT_WEIGHTS, candidateGoods = [] }) {
  return Object.freeze({
    stallId: String(stallId || "").trim(),
    mapId: String(mapId || "").trim(),
    label: String(label || "").trim(),
    refreshMode: "daily",
    countWeights: Object.freeze({
      1: Math.max(0, Math.trunc(Number(countWeights?.[1] ?? countWeights?.["1"] ?? DEFAULT_COUNT_WEIGHTS[1]))),
      2: Math.max(0, Math.trunc(Number(countWeights?.[2] ?? countWeights?.["2"] ?? DEFAULT_COUNT_WEIGHTS[2]))),
      3: Math.max(0, Math.trunc(Number(countWeights?.[3] ?? countWeights?.["3"] ?? DEFAULT_COUNT_WEIGHTS[3])))
    }),
    candidateGoods: Object.freeze(
      (Array.isArray(candidateGoods) ? candidateGoods : []).map((entry) => Object.freeze({
        itemId: String(entry?.itemId || "").trim(),
        weight: Math.max(0, Math.trunc(Number(entry?.weight || 0)))
      }))
    )
  });
}

export const STEELCROSS_MARKET_STALL_REFRESH_DEFS = Object.freeze([
  createDailyRefreshDef({
    stallId: "steelcross_market_stall_01",
    mapId: "steelcross_market_stall_01_placeholder",
    label: "捕鱼人哈德",
    candidateGoods: [
      { itemId: "dried_small_fish", weight: 44 },
      { itemId: "salted_fish_slices", weight: 34 },
      { itemId: "frozen_silverside_bundle", weight: 24 },
      { itemId: "iced_whole_fish", weight: 4 },
      { itemId: "fresh_cut_fish_fillets", weight: 3 },
      { itemId: "iced_silverside_bundle", weight: 4 },
      { itemId: "roe_small_box", weight: 1 },
      { itemId: "fish_liver_pack", weight: 2 }
    ]
  }),
  createDailyRefreshDef({
    stallId: "steelcross_market_stall_02",
    mapId: "steelcross_market_stall_02_placeholder",
    label: "新四杂货",
    candidateGoods: [
      { itemId: "consumable_compressed_biscuits", weight: 30 },
      { itemId: "consumable_canned_fish", weight: 24 },
      { itemId: "consumable_canned_luncheon_meat", weight: 18 },
      { itemId: "consumable_chocolate_bar", weight: 16 },
      { itemId: "consumable_instant_oat_cup", weight: 14 },
      { itemId: "tool_lighter", weight: 7 },
      { itemId: "tool_pocket_watch", weight: 6 },
      { itemId: "doc_researcher_manuscript", weight: 1 }
    ]
  }),
  createDailyRefreshDef({
    stallId: "steelcross_market_stall_03",
    mapId: "steelcross_market_stall_03_placeholder",
    label: "旧海补丁铺",
    candidateGoods: [
      { itemId: "cloth_patterned_wool_scarf", weight: 26 },
      { itemId: "cloth_old_cowhide_gloves", weight: 24 },
      { itemId: "cloth_knit_cap_patchshop", weight: 22 },
      { itemId: "cloth_graygreen_polycotton_workwear", weight: 18 },
      { itemId: "cloth_canvas_backpack_patchshop", weight: 12 },
      { itemId: "cloth_thick_fleece_trousers", weight: 9 },
      { itemId: "cloth_snowfield_boots", weight: 7 },
      { itemId: "cloth_quilted_inner_lining", weight: 8 }
    ]
  }),
  createDailyRefreshDef({
    stallId: "steelcross_market_stall_04",
    mapId: "steelcross_market_stall_04_placeholder",
    label: "绳具与甲板小件"
  }),
  createDailyRefreshDef({
    stallId: "steelcross_market_stall_05",
    mapId: "steelcross_market_stall_05_placeholder",
    label: "好食味",
    candidateGoods: [
      { itemId: "good_food_hard_card", weight: 1 }
    ]
  }),
  createDailyRefreshDef({
    stallId: "steelcross_market_stall_06",
    mapId: "steelcross_market_stall_06_placeholder",
    label: "单证代办桌"
  }),
  createDailyRefreshDef({
    stallId: "steelcross_market_stall_07",
    mapId: "steelcross_market_stall_07_placeholder",
    label: "修复件与电池"
  })
]);

export const STEELCROSS_MARKET_STALL_REFRESH_DEFS_BY_STALL_ID = Object.freeze(
  Object.fromEntries(STEELCROSS_MARKET_STALL_REFRESH_DEFS.map((entry) => [entry.stallId, entry]))
);

export const STEELCROSS_MARKET_STALL_REFRESH_DEFS_BY_MAP_ID = Object.freeze(
  Object.fromEntries(STEELCROSS_MARKET_STALL_REFRESH_DEFS.map((entry) => [entry.mapId, entry]))
);

export function getSteelcrossMarketStallRefreshDefByMapId(mapId) {
  return STEELCROSS_MARKET_STALL_REFRESH_DEFS_BY_MAP_ID[String(mapId || "").trim()] || null;
}

export function getSteelcrossMarketStallRefreshDefByStallId(stallId) {
  return STEELCROSS_MARKET_STALL_REFRESH_DEFS_BY_STALL_ID[String(stallId || "").trim()] || null;
}