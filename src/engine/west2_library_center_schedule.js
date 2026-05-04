import { normalizeTotalMinutes, resolveDailyOpenWindow } from "./daily_open_window.js";

const WEST2_LIBRARY_CENTER_CHAIN_MAP_IDS = Object.freeze([
  "west2_outpost_library_center"
]);

const WEST2_LIBRARY_CENTER_FALLBACK = Object.freeze({
  mapId: "west2_outpost_hub",
  sceneId: "west2_outpost_hub_main"
});

const WEST2_LIBRARY_CENTER_NOTICE = Object.freeze({
  title: "图书与资料中心已关门",
  message: "晚八点后，图书与资料中心停止接待。馆内人员示意你离开，你只能先回到前哨。",
  actions: [{ id: "ok", label: "返回前哨", kind: "primary" }]
});

const WEST2_LIBRARY_CENTER_OPEN_MINUTE_OF_DAY = 6 * 60;
const WEST2_LIBRARY_CENTER_CLOSE_MINUTE_OF_DAY = 20 * 60;

export function isWest2LibraryCenterChainMapId(mapId) {
  const id = String(mapId || "").trim();
  return WEST2_LIBRARY_CENTER_CHAIN_MAP_IDS.includes(id);
}

export function resolveWest2LibraryCenterWindowInfo(totalMinutes) {
  return resolveDailyOpenWindow(
    totalMinutes,
    WEST2_LIBRARY_CENTER_OPEN_MINUTE_OF_DAY,
    WEST2_LIBRARY_CENTER_CLOSE_MINUTE_OF_DAY
  );
}

export const WEST2_LIBRARY_CENTER_TIMED_LOCATION_SPEC = Object.freeze({
  id: "west2_library_center",
  matchesState(state) {
    const activeMapId = String(state?.currentMapId || state?.world?.currentMapId || state?.currentMap?.id || "").trim();
    return isWest2LibraryCenterChainMapId(activeMapId);
  },
  getWindowInfo(totalMinutes) {
    return resolveWest2LibraryCenterWindowInfo(totalMinutes);
  },
  buildClosureBlocker({ state, totalMinutes, windowInfo }) {
    const atMinutes = Number.isFinite(windowInfo?.closeAtMinutes)
      ? windowInfo.closeAtMinutes
      : normalizeTotalMinutes(totalMinutes);
    return {
      blockerId: `timed_location_close:${this.id}`,
      kind: "timed_location_closure",
      specId: this.id,
      atMinutes,
      hardStop: true,
      locationId: String(state?.currentMapId || state?.world?.currentMapId || state?.currentMap?.id || ""),
      notice: WEST2_LIBRARY_CENTER_NOTICE,
      fallback: WEST2_LIBRARY_CENTER_FALLBACK,
      cleanup: {
        scopes: ["current_scene"],
        flags: []
      }
    };
  }
});