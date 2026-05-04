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

export function queryWildernessCoordinate(areaSpec, x, y) {
  if (!isCoordinateInsideBounds(areaSpec, x, y)) {
    return {
      kind: "boundary",
      terrainId: null,
      terrainDef: null,
      zone: null,
      insideBounds: false
    };
  }
  const zone = getTerrainZoneAtCoordinate(areaSpec, x, y);
  const terrainId = zone != null ? zone.terrainId : areaSpec.defaultTerrainId;
  const terrainDef = getTerrainBiomeDef(terrainId);
  return {
    kind: "terrain",
    terrainId,
    terrainDef,
    zone,
    insideBounds: true
  };
}
