import { CAMBCITY_REGION_PROFILE } from "../../../data/wilderness/regions/cambcity_region_profile.js";
import { OLDCAMB_REGION_PROFILE } from "../../../data/wilderness/regions/oldcamb_region_profile.js";
import { SOUTH1_REGION_PROFILE } from "../../../data/wilderness/regions/south1_region_profile.js";
import { WEST2_REGION_PROFILE } from "../../../data/wilderness/regions/west2_region_profile.js";

const REGION_PROFILES = Object.freeze({
  West2: WEST2_REGION_PROFILE,
  CambCity: CAMBCITY_REGION_PROFILE,
  OldCamb: OLDCAMB_REGION_PROFILE,
  South1: SOUTH1_REGION_PROFILE
});

export function listWildernessRegionProfiles() {
  return Object.freeze(Object.values(REGION_PROFILES));
}

export function getWildernessRegionProfile(regionId) {
  return REGION_PROFILES[regionId] ?? null;
}

export function hasWildernessRegionProfile(regionId) {
  return Object.prototype.hasOwnProperty.call(REGION_PROFILES, regionId);
}
