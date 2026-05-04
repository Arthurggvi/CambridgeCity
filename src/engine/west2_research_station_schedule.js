import { normalizeTotalMinutes, resolveDailyOpenWindow } from "./daily_open_window.js";

const WEST2_RESEARCH_STATION_CHAIN_MAP_IDS = Object.freeze([
  "west2_outpost_research_station",
  "west2_outpost_research_experiment_room",
  "west2_outpost_research_sample_storage",
  "west2_outpost_research_upper_floor"
]);

const WEST2_RESEARCH_STATION_FALLBACK = Object.freeze({
  mapId: "west2_outpost_hub",
  sceneId: "west2_outpost_hub_main"
});

const WEST2_RESEARCH_STATION_NOTICE = Object.freeze({
  title: "综合科研总站已关门",
  message: "晚八点后，这里的接待和内部流转都会停下。值守人员示意你离开，你只能先回到前哨。",
  actions: [{ id: "ok", label: "返回前哨", kind: "primary" }]
});

const WEST2_RESEARCH_STATION_OPEN_MINUTE_OF_DAY = 6 * 60;
const WEST2_RESEARCH_STATION_CLOSE_MINUTE_OF_DAY = 20 * 60;

export function isWest2ResearchStationChainMapId(mapId) {
  const id = String(mapId || "").trim();
  return WEST2_RESEARCH_STATION_CHAIN_MAP_IDS.includes(id);
}

export function resolveWest2ResearchStationWindowInfo(totalMinutes) {
  return resolveDailyOpenWindow(
    totalMinutes,
    WEST2_RESEARCH_STATION_OPEN_MINUTE_OF_DAY,
    WEST2_RESEARCH_STATION_CLOSE_MINUTE_OF_DAY
  );
}

export const WEST2_RESEARCH_STATION_TIMED_LOCATION_SPEC = Object.freeze({
  id: "west2_research_station",
  matchesState(state) {
    const activeMapId = String(state?.currentMapId || state?.world?.currentMapId || state?.currentMap?.id || "").trim();
    return isWest2ResearchStationChainMapId(activeMapId);
  },
  getWindowInfo(totalMinutes) {
    return resolveWest2ResearchStationWindowInfo(totalMinutes);
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
      notice: WEST2_RESEARCH_STATION_NOTICE,
      fallback: WEST2_RESEARCH_STATION_FALLBACK,
      cleanup: {
        scopes: ["current_scene"],
        flags: []
      }
    };
  }
});