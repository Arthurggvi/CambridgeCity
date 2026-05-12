import { getTerrainBiomeDef } from "./wilderness_terrain_registry.js";

const EPS = 1e-9;

function rectContains(shape, x, y) {
  const minX = Math.min(shape.x1, shape.x2);
  const maxX = Math.max(shape.x1, shape.x2);
  const minY = Math.min(shape.y1, shape.y2);
  const maxY = Math.max(shape.y1, shape.y2);
  return x >= minX - EPS && x <= maxX + EPS && y >= minY - EPS && y <= maxY + EPS;
}

function circleContains(shape, x, y) {
  const dx = x - shape.cx;
  const dy = y - shape.cy;
  return Math.hypot(dx, dy) <= shape.r + EPS;
}

/** Closed segment band: clamp projection to [0,1], distance to closest point on segment <= radius. */
function lineBandContains(shape, x, y) {
  const ax = shape.from.x;
  const ay = shape.from.y;
  const bx = shape.to.x;
  const by = shape.to.y;
  const abx = bx - ax;
  const aby = by - ay;
  const apx = x - ax;
  const apy = y - ay;
  const abLen2 = abx * abx + aby * aby;
  const r = shape.radius;
  if (abLen2 <= EPS) {
    return Math.hypot(x - ax, y - ay) <= r + EPS;
  }
  let t = (apx * abx + apy * aby) / abLen2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(x - cx, y - cy) <= r + EPS;
}

function shapeContains(shape, x, y) {
  if (shape.type === "rect") return rectContains(shape, x, y);
  if (shape.type === "circle") return circleContains(shape, x, y);
  if (shape.type === "line_band") return lineBandContains(shape, x, y);
  return false;
}

export function isCoordinateInsideBounds(areaSpec, x, y) {
  const b = areaSpec.bounds;
  return (
    x >= b.minX - EPS &&
    x <= b.maxX + EPS &&
    y >= b.minY - EPS &&
    y <= b.maxY + EPS
  );
}

export function getTerrainZoneAtCoordinate(areaSpec, x, y) {
  if (!isCoordinateInsideBounds(areaSpec, x, y)) {
    return null;
  }
  let best = null;
  for (const zone of areaSpec.terrainZones) {
    if (!shapeContains(zone.shape, x, y)) continue;
    if (best == null) {
      best = zone;
      continue;
    }
    if (zone.priority > best.priority) {
      best = zone;
    } else if (zone.priority === best.priority && zone.id != null && best.id != null && zone.id > best.id) {
      // Tie on priority: lexicographic zone.id only yields a deterministic pick; not a gameplay rule.
      // Authoring should not rely on tie order—assign distinct priorities instead.
      best = zone;
    }
  }
  return best;
}

export function getTerrainIdAtCoordinate(areaSpec, x, y) {
  if (!isCoordinateInsideBounds(areaSpec, x, y)) {
    return null;
  }
  const zone = getTerrainZoneAtCoordinate(areaSpec, x, y);
  if (zone != null) {
    return zone.terrainId;
  }
  return areaSpec.defaultTerrainId;
}

export function getTerrainDefAtCoordinate(areaSpec, x, y) {
  const terrainId = getTerrainIdAtCoordinate(areaSpec, x, y);
  if (terrainId == null) {
    return null;
  }
  return getTerrainBiomeDef(terrainId);
}

/**
 * Coordinate query result shape:
 *   - kind: "boundary" only when truly out of authored area bounds.
 *   - boundaryKind: "out_of_bounds" | null — distinguishes the only blocking
 *     boundary cause from in-bounds informational states.
 *   - inActiveCellMask: true|false — informational hint derived from the
 *     optional `areaSpec.activeCellKeys` set. When the area has no mask
 *     (null/empty), every in-bounds cell is treated as inside the mask.
 *     This field MUST NOT be consumed as a blocker; it is a presentation
 *     hint (e.g. patrol corridor highlighting) only.
 */
export function queryWildernessCoordinate(areaSpec, x, y) {
  if (!isCoordinateInsideBounds(areaSpec, x, y)) {
    return {
      kind: "boundary",
      boundaryKind: "out_of_bounds",
      terrainId: null,
      terrainDef: null,
      zone: null,
      insideBounds: false,
      inActiveCellMask: false
    };
  }

  // Compute the informational `inActiveCellMask` hint. When no mask is
  // authored we default to true so callers can treat the whole area as
  // "inside the corridor" without special-casing.
  let inActiveCellMask = true;
  const activeKeys = areaSpec?.activeCellKeys;
  if (activeKeys && typeof activeKeys?.has === "function" && activeKeys?.size > 0) {
    const xi = Number.isFinite(Number(x)) ? Math.trunc(Number(x)) : 0;
    const yi = Number.isFinite(Number(y)) ? Math.trunc(Number(y)) : 0;
    inActiveCellMask = activeKeys.has(`${xi},${yi}`);
  }

  const zone = getTerrainZoneAtCoordinate(areaSpec, x, y);
  const terrainId = zone != null ? zone.terrainId : areaSpec.defaultTerrainId;
  const terrainDef = getTerrainBiomeDef(terrainId);
  return {
    kind: "terrain",
    boundaryKind: null,
    terrainId,
    terrainDef,
    zone,
    insideBounds: true,
    inActiveCellMask
  };
}

const LM_EPS = 1e-9;

function landmarkHypot(dx, dy) {
  return Math.hypot(Number(dx), Number(dy));
}

/**
 * Landmarks within `detectRadius` (Euclidean distance in cell units). `enterable` uses `enterRadius`.
 * @param {{ areaSpec: object, x: number, y: number }} args
 * @returns {Array<{ id: string, label: string, distance: number, enterable: boolean, gotoMapId: string|null }>}
 */
export function listLandmarkCuesForCoordinate({ areaSpec, x, y }) {
  const landmarks = areaSpec?.landmarks;
  if (!Array.isArray(landmarks) || landmarks.length === 0) return [];
  const xi = Number.isFinite(Number(x)) ? Math.trunc(Number(x)) : 0;
  const yi = Number.isFinite(Number(y)) ? Math.trunc(Number(y)) : 0;
  const cues = [];
  for (const lm of landmarks) {
    if (!lm || typeof lm !== "object") continue;
    const id = String(lm.id ?? "").trim();
    if (!id) continue;
    const lx = Number(lm.x);
    const ly = Number(lm.y);
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue;
    const detectR = Number(lm.detectRadius ?? lm.detect_radius);
    const enterR = Number(lm.enterRadius ?? lm.enter_radius);
    const dr = Number.isFinite(detectR) && detectR >= 0 ? detectR : 0;
    const er = Number.isFinite(enterR) && enterR >= 0 ? enterR : 0;
    const distance = landmarkHypot(xi - lx, yi - ly);
    if (distance <= dr + LM_EPS) {
      const label = String(lm.label ?? id).trim() || id;
      const gotoMapId = lm.gotoMapId != null && String(lm.gotoMapId).trim() !== "" ? String(lm.gotoMapId).trim() : null;
      cues.push({
        id,
        label,
        distance,
        enterable: distance <= er + LM_EPS,
        gotoMapId
      });
    }
  }
  cues.sort((a, b) => a.distance - b.distance);
  return cues;
}

/**
 * Enterable landmark at (x,y): within enterRadius (Euclidean) and has gotoMapId. Nearest wins ties.
 * @param {{ areaSpec: object, x: number, y: number }} args
 * @returns {{ id: string, label: string, gotoMapId: string, x: number, y: number }|null}
 */
export function getEnterableLandmarkAtCoordinate({ areaSpec, x, y }) {
  const landmarks = areaSpec?.landmarks;
  if (!Array.isArray(landmarks) || landmarks.length === 0) return null;
  const xi = Number.isFinite(Number(x)) ? Math.trunc(Number(x)) : 0;
  const yi = Number.isFinite(Number(y)) ? Math.trunc(Number(y)) : 0;
  let best = null;
  let bestD = Infinity;
  for (const lm of landmarks) {
    if (!lm || typeof lm !== "object") continue;
    const id = String(lm.id ?? "").trim();
    if (!id) continue;
    const lx = Number(lm.x);
    const ly = Number(lm.y);
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue;
    const enterR = Number(lm.enterRadius ?? lm.enter_radius);
    const er = Number.isFinite(enterR) && enterR >= 0 ? enterR : 0;
    const gotoMapId = lm.gotoMapId != null && String(lm.gotoMapId).trim() !== "" ? String(lm.gotoMapId).trim() : null;
    if (!gotoMapId) continue;
    const distance = landmarkHypot(xi - lx, yi - ly);
    if (distance > er + LM_EPS) continue;
    if (distance < bestD - LM_EPS) {
      bestD = distance;
      const label = String(lm.label ?? id).trim() || id;
      best = { id, label, gotoMapId, x: Math.trunc(lx), y: Math.trunc(ly) };
    }
  }
  return best;
}
