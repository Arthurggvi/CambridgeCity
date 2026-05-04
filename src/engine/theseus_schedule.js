import { resolveTheseusArrivalWindowInfo } from "./theseus_arrival_schedule.js";

const THESEUS_FALLBACK = Object.freeze({
  mapId: "steelcross_dock_placeholder",
  sceneId: "steelcross_dock_main"
});
const THESEUS_NOTICE = Object.freeze({
  title: "忒修斯号",
  message: "忒修斯号已经解缆离港。岸边只剩下被风压低的缆痕和还没散尽的作业气味，你不能继续留在这里了。",
  actions: [{ id: "ok", label: "返回码头", kind: "primary" }]
});

function normalizeTotalMinutes(totalMinutes) {
  return Math.max(0, Math.trunc(Number(totalMinutes ?? 0) || 0));
}

export function isTheseusChainMapId(mapId) {
  const id = String(mapId || "").trim();
  return id === "steelcross_port_theseus_docked" || id.startsWith("steelcross_port_theseus_");
}

export function resolveTheseusWindowInfo(totalMinutes, world = {}) {
  return resolveTheseusArrivalWindowInfo(normalizeTotalMinutes(totalMinutes), world);
}

export const THESEUS_TIMED_LOCATION_SPEC = Object.freeze({
  id: "theseus",
  matchesState(state) {
    const activeMapId = String(state?.currentMapId || state?.world?.currentMapId || state?.currentMap?.id || "").trim();
    return isTheseusChainMapId(activeMapId);
  },
  getWindowInfo(totalMinutes, world = {}) {
    return resolveTheseusWindowInfo(totalMinutes, world);
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
      notice: THESEUS_NOTICE,
      fallback: THESEUS_FALLBACK,
      cleanup: {
        scopes: ["current_scene"],
        flags: []
      }
    };
  }
});