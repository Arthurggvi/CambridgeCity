import { TERRAIN_BIOME_DEFS } from "../../../data/wilderness/terrain/wilderness_terrain_defs.js";

export function listTerrainBiomeDefs() {
  return Object.freeze(Object.values(TERRAIN_BIOME_DEFS));
}

export function getTerrainBiomeDef(terrainId) {
  return TERRAIN_BIOME_DEFS[terrainId] ?? null;
}

export function hasTerrainBiomeDef(terrainId) {
  return Object.prototype.hasOwnProperty.call(TERRAIN_BIOME_DEFS, terrainId);
}
