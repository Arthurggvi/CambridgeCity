import {
  MARG_FRONTDESK_DUTY_BANDS,
  MARG_FRONTDESK_DUTY_PROVIDER_ID,
  MARG_FRONTDESK_NPC_ID
} from "../marg_frontdesk_duty_provider.js";
import { buildRuntimeProviderSnapshot } from "../runtime_provider_context.js";

const WEST2_LIBRARY_CHECKOUT_MAP_ID = "west2_outpost_library_center";
const WEST2_LIBRARY_CHECKOUT_SCENE_ID = "west2_outpost_library_checkout";
const WEST2_LIBRARY_READING_SCENE_ID = "west2_outpost_library_reading";

const MARG_LIBRARY_READING_BANDS = new Set([
  MARG_FRONTDESK_DUTY_BANDS.READING_ROOM_LADDER,
  MARG_FRONTDESK_DUTY_BANDS.READING_ROOM_FLOOR
]);

export function getNpcPresenceSnapshot({ gameState = null, calendar = null, time = null, mapId = "", sceneId = "", serviceBand = "", runtimeProviderSnapshot = null } = {}) {
  const resolvedProviderSnapshot = runtimeProviderSnapshot || buildRuntimeProviderSnapshot(gameState, gameState?.time?.totalMinutes);
  const providerBands = resolvedProviderSnapshot?.providerBands || {};
  const margFrontdeskBand = providerBands[MARG_FRONTDESK_DUTY_PROVIDER_ID] || MARG_FRONTDESK_DUTY_BANDS.OFF_DUTY;
  const presentNpcIds = [];
  const roleSlots = {};
  const serviceOverrides = {
    ...providerBands
  };
  const resolvedMapId = String(mapId || gameState?.currentMapId || "").trim();
  const resolvedSceneId = String(sceneId || gameState?.currentSceneId || "").trim();

  if (
    resolvedMapId === WEST2_LIBRARY_CHECKOUT_MAP_ID
    && resolvedSceneId === WEST2_LIBRARY_CHECKOUT_SCENE_ID
    && margFrontdeskBand === MARG_FRONTDESK_DUTY_BANDS.ON_DUTY
  ) {
    presentNpcIds.push(MARG_FRONTDESK_NPC_ID);
    roleSlots.library_frontdesk = MARG_FRONTDESK_NPC_ID;
  }

  if (
    resolvedMapId === WEST2_LIBRARY_CHECKOUT_MAP_ID
    && resolvedSceneId === WEST2_LIBRARY_READING_SCENE_ID
    && MARG_LIBRARY_READING_BANDS.has(margFrontdeskBand)
  ) {
    presentNpcIds.push(MARG_FRONTDESK_NPC_ID);
    roleSlots.library_reading_room = MARG_FRONTDESK_NPC_ID;
  }

  return Object.freeze({
    presentNpcIds: Object.freeze(presentNpcIds),
    roleSlots: Object.freeze(roleSlots),
    serviceOverrides: Object.freeze(serviceOverrides),
    context: Object.freeze({
      mapId: resolvedMapId,
      sceneId: resolvedSceneId,
      serviceBand: String(serviceBand || time?.serviceBand || "").trim() || null,
      calendar: calendar && typeof calendar === "object" ? { ...calendar } : null
    })
  });
}