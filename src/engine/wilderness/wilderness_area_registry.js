import { WEST2_OLD_MARKER_PATROL_LINE } from "../../../data/wilderness/areas/west2_old_marker_patrol_line.js";

const WILDERNESS_AREA_SPECS = Object.freeze({
  west2_old_marker_patrol_line: WEST2_OLD_MARKER_PATROL_LINE
});

export function listWildernessAreaSpecs() {
  return Object.freeze(Object.values(WILDERNESS_AREA_SPECS));
}

export function getWildernessAreaSpec(areaId) {
  return WILDERNESS_AREA_SPECS[areaId] ?? null;
}

export function hasWildernessAreaSpec(areaId) {
  return Object.prototype.hasOwnProperty.call(WILDERNESS_AREA_SPECS, areaId);
}
