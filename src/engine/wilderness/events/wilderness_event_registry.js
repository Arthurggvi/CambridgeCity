import { WILDERNESS_EVENT_DEFS } from "../../../../data/wilderness/events/wilderness_event_defs.js";
import { WILDERNESS_EVENT_POOLS } from "../../../../data/wilderness/events/wilderness_event_pools.js";
import { WILDERNESS_TERRAIN_EVENT_TAGS } from "../../../../data/wilderness/events/wilderness_terrain_event_tags.js";
import { validateWildernessEventData } from "./wilderness_event_validate.js";

const _REGISTRY = Object.freeze({
  terrainEventTags: WILDERNESS_TERRAIN_EVENT_TAGS,
  eventPools: WILDERNESS_EVENT_POOLS,
  eventDefs: WILDERNESS_EVENT_DEFS
});

export function getWildernessTerrainEventTags(terrainId) {
  if (terrainId == null || terrainId === "") return null;
  const tags = _REGISTRY.terrainEventTags[terrainId];
  return tags != null ? tags : null;
}

export function getWildernessEventDefById(eventId) {
  if (eventId == null || eventId === "") return null;
  const def = _REGISTRY.eventDefs[eventId];
  return def != null ? def : null;
}

export function getWildernessEventPoolById(poolId) {
  if (poolId == null || poolId === "") return null;
  const pool = _REGISTRY.eventPools[poolId];
  return pool != null ? pool : null;
}

export function listWildernessEventDefIds() {
  return Object.freeze(Object.keys(_REGISTRY.eventDefs));
}

export function listWildernessEventPoolIds() {
  return Object.freeze(Object.keys(_REGISTRY.eventPools));
}

/**
 * Runs static validation on bundled wilderness event data.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateBundledWildernessEvents() {
  return validateWildernessEventData({
    terrainTags: _REGISTRY.terrainEventTags,
    pools: _REGISTRY.eventPools,
    defs: _REGISTRY.eventDefs
  });
}
