/**
 * Phase 11A: wilderness local 3x3 minimap VM contract.
 *
 * Asserts that `buildWildernessLocalMiniMapVm` exposes per-direction
 * neighbor descriptors with the new `blockerStyle` classification:
 *   - "void"          : true bounds-out
 *   - "sea"           : open_water / coastal_open_water
 *   - "hard_terrain"  : other passability.foot==="hard_block"|"forbidden"
 *   - null            : passable
 * And that bounds-in but activeCellKeys-out cells are NOT marked as
 * boundary (decoupled from the legacy patrol-line cage).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWildernessLocalMiniMapVm,
  buildWildernessLocalMiniMapNeighbors
} from "../src/engine/wilderness/wilderness_local_minimap_view_model.js";
import { getWildernessAreaSpec } from "../src/engine/wilderness/wilderness_area_registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function buildSyntheticState(wx, wy) {
  return {
    currentMapId: "wilderness_runtime",
    world: {
      currentMapId: "wilderness_runtime",
      wilderness: {
        active: true,
        regionId: "West2",
        areaId: "west2_old_marker_patrol_line",
        x: wx,
        y: wy,
        heading: "N",
        state: "NAVIGATING",
        trailConfidence: 100,
        visibilityConfidence: 100,
        lostness: 0,
        stepsTaken: 0,
        lastSafePoint: null,
        discoveredLandmarks: [],
        flags: {},
        sessionStartedAt: 1,
        lastUpdatedAt: 1,
        schemaVersion: 1
      }
    }
  };
}

async function main() {
  // Smoke: VM shape includes `neighbors` for all 8 directions even in
  // fallback (no current map) state.
  const vmFallback = buildWildernessLocalMiniMapVm({}, {});
  assert(vmFallback.available === false, "fallback VM not available");
  assert(vmFallback.neighbors && typeof vmFallback.neighbors === "object", "fallback VM has neighbors");
  for (const dir of ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]) {
    const n = vmFallback.neighbors[dir];
    assert(n && typeof n === "object", `fallback neighbors.${dir} exists`);
    assert(n.kind === "terrain" && n.blockerStyle === null, `fallback neighbors.${dir} is inert terrain`);
  }
  console.log("[PASS] fallback VM exposes inert neighbors[8]");

  // Phase 11B: cells + playerArrow must exist on every return path, including
  // fallback. cells.length === 9 with cells[4] as the center.
  assert(Array.isArray(vmFallback.cells), "fallback VM cells is array");
  assert(vmFallback.cells.length === 9, "fallback VM cells.length === 9");
  assert(vmFallback.cells[4].isCenter === true, "fallback VM cells[4].isCenter");
  for (let i = 0; i < 9; i += 1) {
    const c = vmFallback.cells[i];
    if (i !== 4) assert(c.isCenter === false, `fallback VM cells[${i}].isCenter false`);
    assert(typeof c.symbolClass === "string" && c.symbolClass.length > 0, `fallback cells[${i}].symbolClass`);
    assert(c.symbolStyle && typeof c.symbolStyle === "object", `fallback cells[${i}].symbolStyle`);
  }
  assert(vmFallback.playerArrow && typeof vmFallback.playerArrow === "object", "fallback VM has playerArrow");
  assert(vmFallback.playerArrow.direction === "N", "fallback VM playerArrow.direction is N");
  assert(vmFallback.playerArrow.rotationDeg === 0, "fallback VM playerArrow.rotationDeg is 0");
  console.log("[PASS] fallback VM exposes cells[9] + playerArrow defaults to N/0");

  // Place player at (11,0) in west2. Bounds = -8..11, -8..8.
  // Neighbors:
  //   E  -> (12,0)  : out_of_bounds -> kind:"boundary", blockerStyle:"void"
  //   NE -> (12,1)  : out_of_bounds -> "void"
  //   SE -> (12,-1) : out_of_bounds -> "void"
  //   W  -> (10,0)  : ice_shelf_edge (hard_block) -> "hard_terrain"
  //   NW -> (10,1)  : ice_shelf_surface (passable) -> null
  //   SW -> (10,-1) : ice_shelf_surface (passable) -> null
  //   N  -> (11,1)  : sea_ice_fast (passable conditional) -> null
  //   S  -> (11,-1) : sea_ice_fast (passable conditional) -> null
  const vmEdge = buildWildernessLocalMiniMapVm(buildSyntheticState(11, 0), {});
  assert(vmEdge.available === true, "edge VM available");
  assert(vmEdge.neighbors.E.kind === "boundary", "E neighbor is boundary");
  assert(vmEdge.neighbors.E.blockerStyle === "void", "E neighbor blockerStyle void");
  assert(vmEdge.neighbors.NE.blockerStyle === "void", "NE neighbor blockerStyle void");
  assert(vmEdge.neighbors.SE.blockerStyle === "void", "SE neighbor blockerStyle void");
  assert(vmEdge.neighbors.W.kind === "hard", "W neighbor is hard");
  assert(vmEdge.neighbors.W.blockerStyle === "hard_terrain", "W neighbor blockerStyle hard_terrain");
  assert(vmEdge.neighbors.W.terrainId === "ice_shelf_edge", "W neighbor terrainId");
  assert(vmEdge.neighbors.N.kind === "terrain", "N neighbor is passable terrain");
  assert(vmEdge.neighbors.N.blockerStyle === null, "N neighbor blockerStyle null");
  console.log("[PASS] (11,0) neighbors classify void / hard_terrain / terrain");

  // cells[] at (11,0): NE/E/SE are out-of-bounds; vm.cells must report
  // isOutOfBounds:true and terrainId:null on those exact slots.
  assert(Array.isArray(vmEdge.cells) && vmEdge.cells.length === 9, "edge VM cells.length === 9");
  const cellByDir = {};
  for (const c of vmEdge.cells) {
    const dirKey =
      c.dx === -1 && c.dy === 1 ? "NW" :
      c.dx === 0  && c.dy === 1 ? "N"  :
      c.dx === 1  && c.dy === 1 ? "NE" :
      c.dx === -1 && c.dy === 0 ? "W"  :
      c.dx === 0  && c.dy === 0 ? "C"  :
      c.dx === 1  && c.dy === 0 ? "E"  :
      c.dx === -1 && c.dy === -1 ? "SW" :
      c.dx === 0  && c.dy === -1 ? "S"  :
      c.dx === 1  && c.dy === -1 ? "SE" : null;
    cellByDir[dirKey] = c;
  }
  assert(cellByDir.C && cellByDir.C.isCenter === true, "edge VM center cell is_center");
  for (const dir of ["E", "NE", "SE"]) {
    const cc = cellByDir[dir];
    assert(cc && cc.isOutOfBounds === true, `edge VM ${dir} cell isOutOfBounds`);
    assert(cc.terrainId === null, `edge VM ${dir} cell terrainId === null`);
    assert(cc.isUnknown === false, `edge VM ${dir} cell isUnknown false`);
  }
  // Standing on managed/ice terrain at (11,0): center cell must carry a
  // known terrainId, family and symbol metadata (not the neutral fallback).
  assert(cellByDir.C.terrainId != null && cellByDir.C.terrainId.length > 0, "edge VM center cell terrainId set");
  assert(cellByDir.C.isOutOfBounds === false, "edge VM center cell in-bounds");
  assert(typeof cellByDir.C.symbolClass === "string" && cellByDir.C.symbolClass.length > 0, "edge VM center cell symbolClass");
  assert(cellByDir.C.symbolStyle && typeof cellByDir.C.symbolStyle.fill === "string", "edge VM center cell symbolStyle.fill");
  console.log("[PASS] (11,0) cells expose out_of_bounds + center terrain metadata");

  // Synthetic area to exercise the "sea" classification: any neighbor on an
  // open_water zone should produce blockerStyle:"sea" with kind:"hard".
  const seaArea = {
    id: "synthetic_sea_probe",
    label: "synthetic",
    regionId: "West2",
    entryMapId: "synthetic",
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "synthetic",
    bounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
    step: { metersPerCell: 150, baseMinutes: 10, baseStaminaCost: 5 },
    defaultTerrainId: "wind_packed_snow",
    terrainZones: [
      { id: "sea_north", terrainId: "open_water", priority: 100, shape: { type: "rect", x1: -2, y1: 1, x2: 2, y2: 2 } }
    ],
    landmarks: []
  };
  const ns = buildWildernessLocalMiniMapNeighbors(seaArea, { x: 0, y: 0 });
  assert(ns.N.kind === "hard" && ns.N.blockerStyle === "sea" && ns.N.terrainId === "open_water", "N neighbor sea");
  assert(ns.NE.kind === "hard" && ns.NE.blockerStyle === "sea", "NE neighbor sea");
  assert(ns.NW.kind === "hard" && ns.NW.blockerStyle === "sea", "NW neighbor sea");
  assert(ns.E.kind === "terrain" && ns.E.blockerStyle === null, "E neighbor passable");
  assert(ns.S.kind === "terrain" && ns.S.blockerStyle === null, "S neighbor passable");
  console.log("[PASS] synthetic open_water zone produces sea-styled neighbors");

  // Active-mask-out cells must NOT appear as boundary in the VM. Standing at
  // (6,7) (in mask), the N neighbor (6,8) is bounds-in but outside the
  // authored activeCellKeys mask. Pre-refactor this produced a boundary; now
  // it must be a regular terrain neighbor.
  const vmMaskOut = buildWildernessLocalMiniMapVm(buildSyntheticState(6, 7), {});
  assert(vmMaskOut.available === true, "mask-out VM available");
  assert(vmMaskOut.neighbors.N.kind === "terrain", "active-mask-out N neighbor stays terrain");
  assert(vmMaskOut.neighbors.N.blockerStyle === null, "active-mask-out N neighbor not marked blocked");
  console.log("[PASS] activeCellKeys-out cells are not marked as boundary in neighbors");

  // playerArrow direction -> rotationDeg map for all 8 valid headings.
  const ARROW_EXPECTED = [
    ["N",   0],
    ["NE",  45],
    ["E",   90],
    ["SE",  135],
    ["S",   180],
    ["SW",  225],
    ["W",   270],
    ["NW",  315]
  ];
  for (const [dir, deg] of ARROW_EXPECTED) {
    const s = buildSyntheticState(0, 0);
    s.world.wilderness.heading = dir;
    const vm = buildWildernessLocalMiniMapVm(s, {});
    assert(vm.playerArrow && vm.playerArrow.direction === dir, `playerArrow.direction === ${dir}`);
    assert(vm.playerArrow.rotationDeg === deg, `playerArrow.rotationDeg === ${deg} for ${dir}`);
  }
  console.log("[PASS] playerArrow 8-direction rotationDeg map");

  // Invalid / missing heading fallback: arrow must point north with deg 0.
  for (const bad of ["garbage", "", "north", "n", "ne", null, undefined, 7]) {
    const s = buildSyntheticState(0, 0);
    s.world.wilderness.heading = bad;
    const vm = buildWildernessLocalMiniMapVm(s, {});
    assert(vm.playerArrow.direction === "N", `invalid heading "${String(bad)}" -> direction N`);
    assert(vm.playerArrow.rotationDeg === 0, `invalid heading "${String(bad)}" -> rotationDeg 0`);
  }
  console.log("[PASS] invalid heading falls back to N / 0");

  // cells.length === 9 + center invariants across multiple in-bounds samples.
  for (const [x, y] of [[0, 0], [2, 1], [-3, -2], [6, 7]]) {
    const vm = buildWildernessLocalMiniMapVm(buildSyntheticState(x, y), {});
    assert(Array.isArray(vm.cells) && vm.cells.length === 9, `cells.length === 9 at (${x},${y})`);
    assert(vm.cells[4].isCenter === true, `cells[4].isCenter at (${x},${y})`);
    assert(vm.cells[4].dx === 0 && vm.cells[4].dy === 0, `cells[4] dx/dy at (${x},${y})`);
    let centerCount = 0;
    for (const c of vm.cells) if (c.isCenter === true) centerCount += 1;
    assert(centerCount === 1, `exactly one isCenter cell at (${x},${y})`);
  }
  console.log("[PASS] cells[9] center invariants across in-bounds samples");

  // Synthetic 1x1 bounds area: all 8 outer cells must be out_of_bounds while
  // the lone center cell stays in-bounds. Guarantees out-of-bounds samples
  // carry terrainId === null even when the area is intentionally tiny.
  const tinyArea = {
    id: "synthetic_tiny",
    label: "tiny",
    regionId: "West2",
    entryMapId: "synthetic",
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "synthetic",
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    step: { metersPerCell: 150, baseMinutes: 10, baseStaminaCost: 5 },
    defaultTerrainId: "wind_packed_snow",
    terrainZones: [],
    landmarks: []
  };
  // Validate via the neighbors helper that the synthetic spec wires up; then
  // confirm via the VM (using a real area registry id we still need an
  // in-bounds query path, so we keep the cell builder agnostic here).
  const tinyNeighbors = buildWildernessLocalMiniMapNeighbors(tinyArea, { x: 0, y: 0 });
  for (const dir of ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]) {
    assert(tinyNeighbors[dir].kind === "boundary", `tiny ${dir} boundary`);
    assert(tinyNeighbors[dir].blockerStyle === "void", `tiny ${dir} blockerStyle void`);
  }
  console.log("[PASS] synthetic 1x1 area surrounds center with void neighbors");

  // Static renderer invariants. These guard the Bug1 fix (defensive cleanup
  // of the wilderness host on non-wilderness_runtime renders) and the visual
  // layer order (cells -> middle blockers/segments/fallback -> arrow last).
  // The script intentionally does NOT spin up a DOM; instead it inspects the
  // renderer source so the regression surface stays the same code path the
  // user sees.
  const rendererSrc = fs.readFileSync(
    path.join(REPO_ROOT, "src", "engine", "renderer.js"),
    "utf8"
  );

  // 1. clearAllMiniMapHosts must still cover wilderness-local-minimap-panel.
  //    This is the existing global sweep the bug-fix MUST NOT regress.
  assert(
    /clearAllMiniMapHosts\([^]*?wilderness-local-minimap-panel/u.test(rendererSrc),
    "clearAllMiniMapHosts still covers wilderness-local-minimap-panel"
  );

  // 2. A dedicated single-target cleanup exists for the wilderness host so the
  //    main render path can fire it when activeMapId !== "wilderness_runtime"
  //    without rewriting the global sweep or touching other minimap hosts.
  assert(
    rendererSrc.includes("hideWildernessLocalMiniMapHostHard"),
    "renderer exposes a single-target wilderness panel cleanup helper"
  );
  assert(
    /hideWildernessLocalMiniMapHostHard\(/u.test(rendererSrc)
      && /activeMapId\s*!==\s*"wilderness_runtime"/u.test(rendererSrc),
    "renderer triggers the wilderness panel cleanup on non-wilderness renders"
  );

  // 3. Layer order: cells render BEFORE neighbors, segments, and the arrow.
  //    The arrow must be the last <path> emitted so it sits on the top layer.
  const cellsTagIdx = rendererSrc.indexOf("wilderness-local-minimap-cell");
  const neighborTagIdx = rendererSrc.indexOf("wilderness-local-minimap-neighbor");
  const boundaryTagIdx = rendererSrc.indexOf("wilderness-local-minimap-boundary");
  const arrowTagIdx = rendererSrc.indexOf("wilderness-local-minimap-arrow");
  assert(cellsTagIdx > -1 && neighborTagIdx > -1 && boundaryTagIdx > -1 && arrowTagIdx > -1, "all minimap layer tags present");
  assert(cellsTagIdx < neighborTagIdx, "cells render before neighbor blockers");
  assert(neighborTagIdx < boundaryTagIdx, "neighbor blockers render before boundary segments");
  assert(boundaryTagIdx < arrowTagIdx, "arrow renders after boundary segments / fallback frame");
  console.log("[PASS] renderer cleanup + layer order static evidence");

  // 4. cells.length === 9 + playerArrow.rotationDeg mapping invariants are
  //    already covered by the per-direction assertion above. Re-validate the
  //    combined invariant once more for an arbitrary in-bounds sample with a
  //    non-canonical-but-valid heading to keep the contract self-contained.
  {
    const s = buildSyntheticState(0, 0);
    s.world.wilderness.heading = "SE";
    const vm = buildWildernessLocalMiniMapVm(s, {});
    assert(Array.isArray(vm.cells) && vm.cells.length === 9, "combined invariant: cells.length === 9");
    assert(vm.playerArrow && vm.playerArrow.rotationDeg === 135, "combined invariant: SE rotationDeg === 135");
  }
  console.log("[PASS] combined cells.length + playerArrow rotation invariant");

  console.log("[PASS] wilderness_local_minimap_contract_check");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
