/**
 * Wilderness vector preview VM builder (offline author tool).
 * Pure functions only: no DOM, no file IO.
 */

function key(x, y) {
  return `${x},${y}`;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function centroid(cells) {
  if (!cells.length) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const c of cells) {
    sx += c.x;
    sy += c.y;
  }
  return { x: sx / cells.length, y: sy / cells.length };
}

function getTerrainRenderKind(terrainId) {
  const id = String(terrainId ?? "").trim();
  if (id === "flagged_marker_line") return "line";
  if (id === "managed_compacted_route") return "corridor";
  if (id === "ice_shelf_edge" || id === "ice_cliff_coast") return "hazard_band";
  return "area";
}

function terrainStyle(terrainId) {
  const id = String(terrainId ?? "").trim();
  // Low-saturation palette; not gameplay truth.
  const preset = {
    wind_packed_snow: { fill: "rgba(180,196,210,0.28)", stroke: "rgba(90,110,130,0.55)" },
    loose_snowfield: { fill: "rgba(232,236,240,0.38)", stroke: "rgba(120,130,140,0.40)" },
    snow_drift_zone: { fill: "rgba(190,206,220,0.28)", stroke: "rgba(95,110,125,0.45)" },
    sastrugi_field: { fill: "rgba(236,236,236,0.34)", stroke: "rgba(110,110,110,0.35)" },
    managed_compacted_route: { fill: "rgba(210,210,210,0.22)", stroke: "rgba(90,90,90,0.40)" },
    flagged_marker_line: { fill: "rgba(0,0,0,0)", stroke: "rgba(43,79,116,0.70)" },
    crevasse_field: { fill: "rgba(205,198,212,0.28)", stroke: "rgba(107,43,43,0.55)" },
    ice_shelf_edge: { fill: "rgba(150,170,190,0.18)", stroke: "rgba(107,43,43,0.55)" },
    rock_outcrop_nunatak: { fill: "rgba(210,202,190,0.26)", stroke: "rgba(90,70,55,0.45)" },
    ice_cliff_coast: { fill: "rgba(155,175,195,0.18)", stroke: "rgba(107,43,43,0.55)" }
  };
  return preset[id] ?? { fill: "rgba(240,240,240,0.22)", stroke: "rgba(120,120,120,0.35)" };
}

function floodFillRegions(cells, { includeTerrainIds = null } = {}) {
  /** @type {Map<string, any>} */
  const byKey = new Map();
  for (const c of cells) {
    if (!c) continue;
    const tid = String(c.terrainId ?? "");
    if (includeTerrainIds && !includeTerrainIds.has(tid)) continue;
    byKey.set(key(c.x, c.y), c);
  }

  const visited = new Set();
  const regions = [];

  for (const c of byKey.values()) {
    const k = key(c.x, c.y);
    if (visited.has(k)) continue;
    visited.add(k);

    const terrainId = String(c.terrainId ?? "");
    const q = [{ x: c.x, y: c.y }];
    /** @type {Array<any>} */
    const regionCells = [];

    while (q.length) {
      const p = q.pop();
      const kk = key(p.x, p.y);
      const cell = byKey.get(kk);
      if (!cell) continue;
      regionCells.push(cell);
      const n4 = [
        { x: p.x + 1, y: p.y },
        { x: p.x - 1, y: p.y },
        { x: p.x, y: p.y + 1 },
        { x: p.x, y: p.y - 1 }
      ];
      for (const n of n4) {
        const nk = key(n.x, n.y);
        if (visited.has(nk)) continue;
        const nc = byKey.get(nk);
        if (!nc) continue;
        if (String(nc.terrainId ?? "") !== terrainId) continue;
        visited.add(nk);
        q.push(n);
      }
    }

    regions.push({ terrainId, cells: regionCells });
  }

  return regions;
}

/**
 * Boundary extraction: compute true outer edges, then stitch into rings.
 * Each cell is a unit square [x,x+1]x[y,y+1] in grid coordinates.
 * @param {Array<{x:number,y:number}>} cells
 */
function buildRegionBoundaryRings(cells) {
  const set = new Set(cells.map((c) => key(c.x, c.y)));

  /** @type {Map<string, Array<{a:{x:number,y:number}, b:{x:number,y:number}}>>} */
  const outgoing = new Map();
  function addEdge(ax, ay, bx, by) {
    const k = key(ax, ay);
    if (!outgoing.has(k)) outgoing.set(k, []);
    outgoing.get(k).push({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
  }

  for (const c of cells) {
    const x = c.x;
    const y = c.y;
    // neighbor missing => boundary edge
    // left
    if (!set.has(key(x - 1, y))) addEdge(x, y, x, y + 1);
    // top
    if (!set.has(key(x, y + 1))) addEdge(x, y + 1, x + 1, y + 1);
    // right
    if (!set.has(key(x + 1, y))) addEdge(x + 1, y + 1, x + 1, y);
    // bottom
    if (!set.has(key(x, y - 1))) addEdge(x + 1, y, x, y);
  }

  /** @type {Array<Array<{x:number,y:number}>>} */
  const rings = [];
  const used = new Set();

  function edgeId(e) {
    return `${e.a.x},${e.a.y}->${e.b.x},${e.b.y}`;
  }

  // Stitch: follow directed edges; at a vertex choose next edge whose start matches current end.
  for (const list of outgoing.values()) {
    for (const e0 of list) {
      const id0 = edgeId(e0);
      if (used.has(id0)) continue;
      used.add(id0);
      const ring = [e0.a, e0.b];
      let cur = e0.b;
      let guard = 0;
      while (guard++ < 200000) {
        const opts = outgoing.get(key(cur.x, cur.y)) ?? [];
        let next = null;
        for (const e of opts) {
          const id = edgeId(e);
          if (used.has(id)) continue;
          next = e;
          break;
        }
        if (!next) break;
        used.add(edgeId(next));
        ring.push(next.b);
        cur = next.b;
        if (cur.x === ring[0].x && cur.y === ring[0].y) break;
      }

      // close ring if ended at start
      if (ring.length >= 4 && ring[ring.length - 1].x === ring[0].x && ring[ring.length - 1].y === ring[0].y) {
        rings.push(ring);
      }
    }
  }

  return rings;
}

function computeBoundaryCellSet(cells) {
  const set = new Set(cells.map((c) => key(c.x, c.y)));
  const boundary = new Set();
  for (const c of cells) {
    const x = c.x;
    const y = c.y;
    const n4 = [
      key(x + 1, y),
      key(x - 1, y),
      key(x, y + 1),
      key(x, y - 1)
    ];
    if (n4.some((k) => !set.has(k))) boundary.add(key(x, y));
  }
  return { all: set, boundary };
}

/**
 * Label anchor: choose cell with max distance to boundary (grid steps), tie-break toward centroid.
 * @param {Array<{x:number,y:number}>} cells
 */
function chooseLabelAnchor(cells) {
  if (!cells.length) return null;
  const { all, boundary } = computeBoundaryCellSet(cells);
  const dist = new Map();
  const q = [];
  for (const b of boundary) {
    dist.set(b, 0);
    const [x, y] = b.split(",").map(Number);
    q.push({ x, y });
  }

  // BFS distance transform on 4-neighbor
  let qi = 0;
  while (qi < q.length) {
    const p = q[qi++];
    const d0 = dist.get(key(p.x, p.y));
    const n4 = [
      { x: p.x + 1, y: p.y },
      { x: p.x - 1, y: p.y },
      { x: p.x, y: p.y + 1 },
      { x: p.x, y: p.y - 1 }
    ];
    for (const n of n4) {
      const nk = key(n.x, n.y);
      if (!all.has(nk)) continue;
      if (dist.has(nk)) continue;
      dist.set(nk, d0 + 1);
      q.push(n);
    }
  }

  const c0 = centroid(cells);
  let best = null;
  let bestD = -1;
  let bestCenter = Infinity;
  for (const c of cells) {
    const d = dist.get(key(c.x, c.y)) ?? 0;
    const centerScore = Math.hypot(c.x - c0.x, c.y - c0.y);
    if (d > bestD) {
      bestD = d;
      bestCenter = centerScore;
      best = { x: c.x, y: c.y, distToBoundary: d };
    } else if (d === bestD && centerScore < bestCenter) {
      bestCenter = centerScore;
      best = { x: c.x, y: c.y, distToBoundary: d };
    }
  }

  return best;
}

function buildLineFeaturesFromCells(cells, terrainId) {
  // Build simple polylines by 4-neighbor chaining on cell centers.
  // Use world cell center coordinates (integers), NOT local indices.
  const points = cells.map((c) => ({ x: c.x, y: c.y }));
  // adjacency map by manhattan distance 1
  const by = new Map(points.map((p) => [key(p.x, p.y), p]));
  const neighbors = (p) => {
    const n = [
      key(p.x + 1, p.y),
      key(p.x - 1, p.y),
      key(p.x, p.y + 1),
      key(p.x, p.y - 1)
    ];
    return n.map((k) => by.get(k)).filter(Boolean);
  };

  const used = new Set();
  const lines = [];
  for (const p of points) {
    const pk = key(p.x, p.y);
    if (used.has(pk)) continue;
    // start at endpoint if exists
    const deg = neighbors(p).length;
    if (deg !== 1) continue;
    const line = [p];
    used.add(pk);
    let cur = p;
    let prev = null;
    let guard = 0;
    while (guard++ < 50000) {
      const ns = neighbors(cur).filter((x) => !prev || key(x.x, x.y) !== key(prev.x, prev.y));
      const nxt = ns.find((x) => !used.has(key(x.x, x.y)));
      if (!nxt) break;
      used.add(key(nxt.x, nxt.y));
      line.push(nxt);
      prev = cur;
      cur = nxt;
    }
    if (line.length >= 2) lines.push({ terrainId, points: line });
  }

  // leftover loops: pick any unused point and walk until return or stuck
  for (const p of points) {
    const pk = key(p.x, p.y);
    if (used.has(pk)) continue;
    const line = [p];
    used.add(pk);
    let cur = p;
    let prev = null;
    let guard = 0;
    while (guard++ < 50000) {
      const ns = neighbors(cur).filter((x) => !prev || key(x.x, x.y) !== key(prev.x, prev.y));
      const nxt = ns.find((x) => !used.has(key(x.x, x.y))) ?? ns[0];
      if (!nxt) break;
      const nk = key(nxt.x, nxt.y);
      if (used.has(nk)) break;
      used.add(nk);
      line.push(nxt);
      prev = cur;
      cur = nxt;
    }
    if (line.length >= 2) lines.push({ terrainId, points: line });
  }

  return lines;
}

export function buildWildernessVectorPreviewVm({ areaSpec, gridVm, semanticLayerVm }) {
  const bounds = gridVm.bounds;
  const warnings = [];

  // Split by renderKind
  const lineTerrainIds = new Set(["flagged_marker_line"]);
  const isActiveTerrainCell = (c) => {
    if (!c || typeof c !== "object") return false;
    const terrainId = String(c.terrainId || "").trim();
    if (!terrainId) return false;
    if (String(c.kind || "") === "boundary") return false;
    if (String(c.terrainClass || "") === "terrain-boundary") return false;
    return true;
  };
  const lineCells = gridVm.cells.filter((c) => isActiveTerrainCell(c) && lineTerrainIds.has(String(c.terrainId)));
  const nonLineCells = gridVm.cells.filter((c) => isActiveTerrainCell(c) && !lineTerrainIds.has(String(c.terrainId)));

  const baseRegions = floodFillRegions(nonLineCells);
  const regions = [];
  for (let i = 0; i < baseRegions.length; i++) {
    const r = baseRegions[i];
    const terrainId = r.terrainId;
    const renderKind = getTerrainRenderKind(terrainId);
    const cells = r.cells.map((c) => ({ x: c.x, y: c.y }));
    const rings = buildRegionBoundaryRings(cells);
    // Normalize legacy integer-vertex rings to true world edge coordinates:
    // old vertex x in [-8..9] -> edge x in [-8.5..8.5]
    const normalizedRings = rings.map((ring) =>
      ring.map((p) => ({ x: p.x - 0.5, y: p.y - 0.5 }))
    );
    const anchor = chooseLabelAnchor(cells);
    if (!rings.length) warnings.push({ kind: "boundary_missing", terrainId, regionIndex: i });
    const style = terrainStyle(terrainId);
    regions.push({
      id: `region_${i}_${terrainId}`,
      terrainId,
      terrainLabel: r.cells[0]?.terrainLabel ?? terrainId,
      terrainShortLabel: r.cells[0]?.terrainShortLabel ?? terrainId,
      renderKind,
      cellCount: r.cells.length,
      cells,
      rings: normalizedRings,
      anchor,
      style
    });
  }

  const lineFeatures = [];
  if (lineCells.length) {
    const lines = buildLineFeaturesFromCells(lineCells, "flagged_marker_line");
    for (let i = 0; i < lines.length; i++) {
      lineFeatures.push({
        id: `line_${i}_flagged_marker_line`,
        kind: "route_semantic",
        terrainId: "flagged_marker_line",
        label: "标记杆巡查线",
        points: lines[i].points
      });
    }
  }

  const mapNodes = [];
  const lms = Array.isArray(areaSpec?.landmarks) ? areaSpec.landmarks : [];
  for (const lm of lms) {
    if (!lm || typeof lm !== "object") continue;
    const gotoMapId = lm.gotoMapId != null && String(lm.gotoMapId).trim() !== "" ? String(lm.gotoMapId).trim() : null;
    if (!gotoMapId) continue;
    mapNodes.push({
      id: String(lm.id ?? ""),
      label: String(lm.label ?? lm.id ?? ""),
      x: Number(lm.x),
      y: Number(lm.y),
      gotoMapId,
      detectRadius: lm.detectRadius ?? null,
      enterRadius: lm.enterRadius ?? null
    });
  }

  // Quick diagnostics: labels count should be much smaller than cells
  const labelCount = regions.length + mapNodes.length + lineFeatures.length;
  const cellCount = gridVm.cells.length;
  if (labelCount >= cellCount / 2) {
    warnings.push({ kind: "label_count_too_high", labelCount, cellCount });
  }

  return {
    bounds,
    regions,
    lineFeatures,
    mapNodes,
    warnings,
    source: {
      semanticSourceMode: semanticLayerVm?.sourceMode ?? "unknown"
    }
  };
}

// --- Fixtures for contract check (algorithmic) ---

export function makeUShapeFixture() {
  // U-shape: 5x5 outer frame minus top middle gap (x=2,y=4 removed), thickness 1
  const cells = [];
  for (let x = 0; x <= 4; x++) cells.push({ x, y: 0 });
  for (let y = 0; y <= 4; y++) {
    cells.push({ x: 0, y });
    cells.push({ x: 4, y });
  }
  for (let x = 0; x <= 4; x++) {
    if (x === 2) continue; // gap in top row
    cells.push({ x, y: 4 });
  }
  // remove duplicates
  const uniq = new Map();
  for (const c of cells) uniq.set(key(c.x, c.y), c);
  return Array.from(uniq.values());
}

export function analyzeFixtureRegion(cells) {
  const rings = buildRegionBoundaryRings(cells);
  const anchor = chooseLabelAnchor(cells);
  const all = new Set(cells.map((c) => key(c.x, c.y)));
  const anchorInside = anchor ? all.has(key(anchor.x, anchor.y)) : false;
  // gap cell at (2,4) should not be in region
  const gapFilled = all.has(key(2, 4));
  // boundary should include inner concave corner points around gap:
  const ringText = rings.map((r) => r.map((p) => `${p.x},${p.y}`).join("|")).join("\n");
  const hasConcavePoint = ringText.includes("2,5") || ringText.includes("2,4") || ringText.includes("3,4"); // loose check
  const normalizedRings = rings.map((ring) => ring.map((p) => ({ x: p.x - 0.5, y: p.y - 0.5 })));
  return { rings, normalizedRings, anchor, anchorInside, gapFilled, hasConcavePoint };
}

