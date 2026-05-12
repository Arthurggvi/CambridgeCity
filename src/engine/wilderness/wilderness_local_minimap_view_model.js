import { getWildernessAreaSpec } from "./wilderness_area_registry.js";
import { queryWildernessCoordinate } from "./wilderness_area_query.js";
import { getTerrainBiomeDef } from "./wilderness_terrain_registry.js";
import {
  getWildernessTerrainSymbolClass,
  getWildernessTerrainSymbolStyle,
  getWildernessTerrainSymbolVm
} from "./wilderness_terrain_symbol_registry.js";

const EMPTY_VM_BASE = Object.freeze({
  radius: 1,
  viewBox: "-1.55 -1.55 3.1 3.1",
  player: Object.freeze({ x: 0, y: 0 })
});

const NEIGHBOR_DELTAS = Object.freeze({
  N: Object.freeze({ x: 0, y: 1 }),
  NE: Object.freeze({ x: 1, y: 1 }),
  E: Object.freeze({ x: 1, y: 0 }),
  SE: Object.freeze({ x: 1, y: -1 }),
  S: Object.freeze({ x: 0, y: -1 }),
  SW: Object.freeze({ x: -1, y: -1 }),
  W: Object.freeze({ x: -1, y: 0 }),
  NW: Object.freeze({ x: -1, y: 1 })
});

// Fixed iteration order for the 3x3 minimap. Row-major top -> bottom in math-Y
// (north = +y, so dy=1 comes first). cells[4] is always the center cell.
const CELL_ORDER = Object.freeze([
  Object.freeze({ dx: -1, dy:  1, dirKey: "NW" }),
  Object.freeze({ dx:  0, dy:  1, dirKey: "N"  }),
  Object.freeze({ dx:  1, dy:  1, dirKey: "NE" }),
  Object.freeze({ dx: -1, dy:  0, dirKey: "W"  }),
  Object.freeze({ dx:  0, dy:  0, dirKey: "C"  }),
  Object.freeze({ dx:  1, dy:  0, dirKey: "E"  }),
  Object.freeze({ dx: -1, dy: -1, dirKey: "SW" }),
  Object.freeze({ dx:  0, dy: -1, dirKey: "S"  }),
  Object.freeze({ dx:  1, dy: -1, dirKey: "SE" })
]);

const ARROW_ROTATION_DEG = Object.freeze({
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315
});

// Strict case-sensitive direction filter. Upstream `normalizeWildernessHeading`
// already uppercases canonical values when committing to world.wilderness, so
// in production the VM only ever sees one of the 8 canonical strings. Anything
// else (including lower-case "n"/"ne") collapses to "N".
function normalizeArrowDirection(heading) {
  if (typeof heading !== "string") return "N";
  const h = heading.trim();
  return Object.prototype.hasOwnProperty.call(ARROW_ROTATION_DEG, h) ? h : "N";
}

function buildPlayerArrow(heading) {
  const direction = normalizeArrowDirection(heading);
  return { direction, rotationDeg: ARROW_ROTATION_DEG[direction] };
}

const EMPTY_NEIGHBORS = Object.freeze({
  N: Object.freeze({ kind: "terrain", terrainId: null, terrainLabel: null, blockerStyle: null }),
  NE: Object.freeze({ kind: "terrain", terrainId: null, terrainLabel: null, blockerStyle: null }),
  E: Object.freeze({ kind: "terrain", terrainId: null, terrainLabel: null, blockerStyle: null }),
  SE: Object.freeze({ kind: "terrain", terrainId: null, terrainLabel: null, blockerStyle: null }),
  S: Object.freeze({ kind: "terrain", terrainId: null, terrainLabel: null, blockerStyle: null }),
  SW: Object.freeze({ kind: "terrain", terrainId: null, terrainLabel: null, blockerStyle: null }),
  W: Object.freeze({ kind: "terrain", terrainId: null, terrainLabel: null, blockerStyle: null }),
  NW: Object.freeze({ kind: "terrain", terrainId: null, terrainLabel: null, blockerStyle: null })
});

function isFiniteInteger(n) {
  const x = Number(n);
  return Number.isFinite(x) && Math.trunc(x) === x;
}

function terrainIdForCell(areaSpec, wx, wy) {
  const q = queryWildernessCoordinate(areaSpec, wx, wy);
  if (!q || q.kind !== "terrain" || q.terrainId == null) return null;
  const tid = String(q.terrainId).trim();
  return tid || null;
}

/**
 * Build a per-direction neighbor descriptor used by the local minimap renderer.
 * Output keys mirror {@link NEIGHBOR_DELTAS}. Per direction:
 *   - kind:"boundary"  + blockerStyle:"void"          — target lies outside authored bounds
 *   - kind:"hard"      + blockerStyle:"sea"           — open_water / coastal_open_water
 *   - kind:"hard"      + blockerStyle:"hard_terrain"  — other passability.foot==="hard_block"|"forbidden"
 *   - kind:"terrain"   + blockerStyle:null            — any non-blocking terrain (incl. requirement gates)
 * Pure read-only; does not consult gameState or RNG.
 */
function buildWildernessLocalMiniMapNeighbors(areaSpec, center) {
  const out = {};
  if (!areaSpec || typeof areaSpec !== "object") {
    for (const dir of Object.keys(NEIGHBOR_DELTAS)) {
      out[dir] = { kind: "terrain", terrainId: null, terrainLabel: null, blockerStyle: null };
    }
    return out;
  }
  const cx = Number(center?.x);
  const cy = Number(center?.y);
  const haveCenter = isFiniteInteger(cx) && isFiniteInteger(cy);
  for (const dir of Object.keys(NEIGHBOR_DELTAS)) {
    if (!haveCenter) {
      out[dir] = { kind: "terrain", terrainId: null, terrainLabel: null, blockerStyle: null };
      continue;
    }
    const d = NEIGHBOR_DELTAS[dir];
    const nx = Math.trunc(cx) + d.x;
    const ny = Math.trunc(cy) + d.y;
    const q = queryWildernessCoordinate(areaSpec, nx, ny);
    if (!q || (q.kind === "boundary" && q.boundaryKind === "out_of_bounds")) {
      out[dir] = { kind: "boundary", terrainId: null, terrainLabel: null, blockerStyle: "void" };
      continue;
    }
    const tid = q.terrainId != null ? String(q.terrainId) : null;
    const def = tid ? getTerrainBiomeDef(tid) : q.terrainDef || null;
    const label = def?.label != null ? String(def.label) : null;
    const foot = String(def?.passability?.foot || "").trim();
    if (foot === "hard_block" || foot === "forbidden") {
      const style =
        tid === "open_water" || tid === "coastal_open_water" ? "sea" : "hard_terrain";
      out[dir] = { kind: "hard", terrainId: tid, terrainLabel: label, blockerStyle: style };
      continue;
    }
    out[dir] = { kind: "terrain", terrainId: tid, terrainLabel: label, blockerStyle: null };
  }
  return out;
}

/**
 * Pure read-only: 3×3 neighborhood terrain-change boundary segments in player-local coordinates
 * (center cell at origin). Segments use mathematical Y (+north); renderer applies SVG Y flip.
 *
 * @param {object} areaSpec
 * @param {{ x: number, y: number }} center
 * @param {object} [options]
 * @returns {Array<{ id: string, x1: number, y1: number, x2: number, y2: number }>}
 */
export function buildWildernessTerrainBoundarySegments(areaSpec, center, options = {}) {
  void options;
  const segments = [];
  if (!areaSpec || typeof areaSpec !== "object") return segments;

  const cx = Number(center?.x);
  const cy = Number(center?.y);
  if (!isFiniteInteger(cx) || !isFiniteInteger(cy)) return segments;

  const xi = Math.trunc(cx);
  const yi = Math.trunc(cy);

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const wx = xi + dx;
      const wy = yi + dy;
      const tidHere = terrainIdForCell(areaSpec, wx, wy);
      if (!tidHere) continue;

      if (dx <= 0) {
        const ex = xi + dx + 1;
        const ey = yi + dy;
        const tidEast = terrainIdForCell(areaSpec, ex, ey);
        if (tidEast && tidEast !== tidHere) {
          segments.push({
            id: `east:${dx},${dy}`,
            x1: dx + 0.5,
            y1: dy - 0.5,
            x2: dx + 0.5,
            y2: dy + 0.5
          });
        }
      }

      if (dy <= 0) {
        const nx = xi + dx;
        const ny = yi + dy + 1;
        const tidNorth = terrainIdForCell(areaSpec, nx, ny);
        if (tidNorth && tidNorth !== tidHere) {
          segments.push({
            id: `north:${dx},${dy}`,
            x1: dx - 0.5,
            y1: dy + 0.5,
            x2: dx + 0.5,
            y2: dy + 0.5
          });
        }
      }
    }
  }

  return segments;
}

/**
 * Read-only view model for wilderness_runtime local 3×3 terrain boundary minimap.
 * Does not mutate `state`.
 *
 * @param {object} state
 * @param {object} [options]
 */
function emptyNeighborsForFallback() {
  const o = {};
  for (const dir of Object.keys(NEIGHBOR_DELTAS)) {
    o[dir] = { ...EMPTY_NEIGHBORS[dir] };
  }
  return o;
}

function makeUnknownCell(dx, dy, x, y, isCenter) {
  const style = getWildernessTerrainSymbolStyle(null);
  return {
    dx,
    dy,
    x,
    y,
    terrainId: null,
    label: null,
    family: style.family,
    danger: style.danger,
    passability: null,
    symbolClass: getWildernessTerrainSymbolClass(null),
    symbolStyle: { ...style },
    isCenter: isCenter === true,
    isOutOfBounds: false,
    isUnknown: true
  };
}

function makeOutOfBoundsCell(dx, dy, x, y, isCenter) {
  const style = getWildernessTerrainSymbolStyle(null);
  return {
    dx,
    dy,
    x,
    y,
    terrainId: null,
    label: null,
    family: style.family,
    danger: style.danger,
    passability: null,
    symbolClass: getWildernessTerrainSymbolClass(null),
    symbolStyle: { ...style },
    isCenter: isCenter === true,
    isOutOfBounds: true,
    isUnknown: false
  };
}

function emptyCellsForFallback() {
  const cells = [];
  for (const slot of CELL_ORDER) {
    cells.push(makeUnknownCell(slot.dx, slot.dy, 0, 0, slot.dirKey === "C"));
  }
  return cells;
}

/**
 * Build the 3x3 `cells[]` array around an in-bounds center. Out-of-bounds
 * cells are emitted with `isOutOfBounds:true` and `terrainId:null`. In-bounds
 * cells with a missing terrain def are emitted with `isUnknown:true`. The
 * VM only reads via `queryWildernessCoordinate` + the terrain symbol registry;
 * it does not re-implement terrain zone resolution and does not consult
 * gameState or RNG.
 */
function buildLocalCells(areaSpec, cx, cy) {
  const cells = [];
  if (!areaSpec || typeof areaSpec !== "object" || !isFiniteInteger(cx) || !isFiniteInteger(cy)) {
    return emptyCellsForFallback();
  }
  const xi = Math.trunc(Number(cx));
  const yi = Math.trunc(Number(cy));
  for (const slot of CELL_ORDER) {
    const x = xi + slot.dx;
    const y = yi + slot.dy;
    const isCenter = slot.dirKey === "C";
    const q = queryWildernessCoordinate(areaSpec, x, y);
    if (!q || (q.kind === "boundary" && q.boundaryKind === "out_of_bounds")) {
      cells.push(makeOutOfBoundsCell(slot.dx, slot.dy, x, y, isCenter));
      continue;
    }
    const tid = q.terrainId != null ? String(q.terrainId) : null;
    const def = tid ? getTerrainBiomeDef(tid) : (q.terrainDef || null);
    const symVm = def ? getWildernessTerrainSymbolVm(def) : null;
    if (!symVm) {
      cells.push(makeUnknownCell(slot.dx, slot.dy, x, y, isCenter));
      continue;
    }
    cells.push({
      dx: slot.dx,
      dy: slot.dy,
      x,
      y,
      terrainId: symVm.terrainId,
      label: symVm.label,
      family: symVm.family,
      danger: symVm.danger,
      passability: symVm.passability,
      symbolClass: symVm.symbolClass,
      symbolStyle: symVm.symbolStyle,
      isCenter,
      isOutOfBounds: false,
      isUnknown: false
    });
  }
  return cells;
}

export function buildWildernessLocalMiniMapVm(state, options = {}) {
  void options;
  const warnings = [];
  const mapId = String(state?.currentMapId ?? state?.world?.currentMapId ?? "").trim();

  if (mapId !== "wilderness_runtime") {
    return {
      available: false,
      areaId: "",
      center: { x: 0, y: 0 },
      heading: "N",
      radius: EMPTY_VM_BASE.radius,
      viewBox: EMPTY_VM_BASE.viewBox,
      segments: [],
      neighbors: emptyNeighborsForFallback(),
      cells: emptyCellsForFallback(),
      playerArrow: buildPlayerArrow("N"),
      player: { ...EMPTY_VM_BASE.player },
      warnings
    };
  }

  const wx = state?.world?.wilderness;
  if (!wx || typeof wx !== "object") {
    return {
      available: false,
      areaId: "",
      center: { x: 0, y: 0 },
      heading: "N",
      radius: EMPTY_VM_BASE.radius,
      viewBox: EMPTY_VM_BASE.viewBox,
      segments: [],
      neighbors: emptyNeighborsForFallback(),
      cells: emptyCellsForFallback(),
      playerArrow: buildPlayerArrow("N"),
      player: { ...EMPTY_VM_BASE.player },
      warnings
    };
  }

  const areaId = String(wx.areaId || "").trim();
  const areaSpec = areaId ? getWildernessAreaSpec(areaId) : null;
  const headingRaw = String(wx.heading || "N").trim() || "N";

  if (!areaSpec) {
    return {
      available: false,
      areaId: areaId || "",
      center: { x: 0, y: 0 },
      heading: headingRaw,
      radius: EMPTY_VM_BASE.radius,
      viewBox: EMPTY_VM_BASE.viewBox,
      segments: [],
      neighbors: emptyNeighborsForFallback(),
      cells: emptyCellsForFallback(),
      playerArrow: buildPlayerArrow(headingRaw),
      player: { ...EMPTY_VM_BASE.player },
      warnings
    };
  }

  if (!isFiniteInteger(wx.x) || !isFiniteInteger(wx.y)) {
    return {
      available: false,
      areaId,
      center: { x: 0, y: 0 },
      heading: headingRaw,
      radius: EMPTY_VM_BASE.radius,
      viewBox: EMPTY_VM_BASE.viewBox,
      segments: [],
      neighbors: emptyNeighborsForFallback(),
      cells: emptyCellsForFallback(),
      playerArrow: buildPlayerArrow(headingRaw),
      player: { ...EMPTY_VM_BASE.player },
      warnings
    };
  }

  const ix = Math.trunc(Number(wx.x));
  const iy = Math.trunc(Number(wx.y));

  const centerTerrainId = terrainIdForCell(areaSpec, ix, iy);
  if (!centerTerrainId) {
    return {
      available: false,
      areaId,
      center: { x: ix, y: iy },
      heading: headingRaw,
      radius: EMPTY_VM_BASE.radius,
      viewBox: EMPTY_VM_BASE.viewBox,
      segments: [],
      neighbors: emptyNeighborsForFallback(),
      cells: buildLocalCells(areaSpec, ix, iy),
      playerArrow: buildPlayerArrow(headingRaw),
      player: { ...EMPTY_VM_BASE.player },
      warnings
    };
  }

  const segments = buildWildernessTerrainBoundarySegments(areaSpec, { x: ix, y: iy }, {});
  const neighbors = buildWildernessLocalMiniMapNeighbors(areaSpec, { x: ix, y: iy });
  const cells = buildLocalCells(areaSpec, ix, iy);

  return {
    available: true,
    areaId,
    center: { x: ix, y: iy },
    heading: headingRaw,
    radius: EMPTY_VM_BASE.radius,
    viewBox: EMPTY_VM_BASE.viewBox,
    segments,
    neighbors,
    cells,
    playerArrow: buildPlayerArrow(headingRaw),
    fallbackFrameVisible: segments.length === 0,
    emptyBoundaryReason: segments.length === 0 ? "no_local_terrain_boundary" : null,
    player: { ...EMPTY_VM_BASE.player },
    warnings
  };
}

export { buildWildernessLocalMiniMapNeighbors };
