/**
 * Compile wilderness_blueprint_compact → generated WildernessAreaSpec terrainZones / landmarks.
 *
 * Isolation contract:
 * - Input JSON stays in authoring space (tools/).
 * - Runtime never reads the compact JSON.
 * - Output is a JS module under data/wilderness/areas/generated/.
 *
 * Usage:
 * node scripts/wilderness_blueprint_compile_area_spec.mjs --area west2_old_marker_patrol_line --input tools/wilderness_area_preview/blueprints/west2_old_marker_patrol_line.compact.json --dry-run
 * node scripts/wilderness_blueprint_compile_area_spec.mjs --area west2_old_marker_patrol_line --input tools/wilderness_area_preview/blueprints/west2_old_marker_patrol_line.compact.json --write
 */

import fs from "node:fs";
import path from "node:path";

import { getWildernessAreaSpec } from "../src/engine/wilderness/wilderness_area_registry.js";
import { getTerrainBiomeDef, hasTerrainBiomeDef } from "../src/engine/wilderness/wilderness_terrain_registry.js";

function parseArgs(argv) {
  const args = { area: null, input: null, dryRun: false, write: false, allowSubtractIgnored: false, allowExpandBounds: false, emitLandmarks: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = String(argv[i] || "");
    if (a === "--area") args.area = String(argv[++i] || "");
    else if (a === "--input") args.input = String(argv[++i] || "");
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--write") args.write = true;
    else if (a === "--allow-subtract-ignored") args.allowSubtractIgnored = true;
    else if (a === "--allow-expand-bounds") args.allowExpandBounds = true;
    else if (a === "--emit-landmarks") args.emitLandmarks = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/wilderness_blueprint_compile_area_spec.mjs --area <areaId> --input <compact.json> --dry-run",
    "  node scripts/wilderness_blueprint_compile_area_spec.mjs --area <areaId> --input <compact.json> --write",
    "",
    "Flags:",
    "  --allow-subtract-ignored   Allow write even if subtractCells is non-empty (still ignored).",
    "  --allow-expand-bounds      Allow write with out-of-bounds coords and emit GENERATED_BOUNDS for AreaSpec union.",
    "  --emit-landmarks           Convert specialMapCells → GENERATED_LANDMARKS (reject placeholders)."
  ].join("\n");
}

function isSafeInt(n) {
  return typeof n === "number" && Number.isSafeInteger(n);
}

function toSafeInt(v, label, errors) {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isSafeInteger(n)) {
    errors.push(`${label}: expected finite safe integer, got ${String(v)}`);
    return 0;
  }
  return Math.trunc(n);
}

function isPlaceholderMapId(mapId) {
  const s = String(mapId || "").trim().toLowerCase();
  if (!s) return true;
  return s === "1" || s === "todo" || s === "placeholder";
}

function slugId(text) {
  const raw = String(text || "").trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "label";
}

function inBounds(bounds, x, y) {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

function terrainPriorityFor(terrainId) {
  const def = getTerrainBiomeDef(terrainId);
  if (!def) return 100;
  const hard = def?.passability?.foot === "hard_block" || def?.passability?.vehicle === "hard_block";
  if (hard) return 200;
  if (terrainId === "managed_compacted_route") return 130;
  if (terrainId === "subglacial_facility_buried_zone") return 130;
  if (terrainId === "flagged_marker_line") return 120;
  return 100;
}

function buildZoneId(prefix, terrainId, kind, parts) {
  const base = `bp_${String(terrainId || "terrain")}_${kind}_${parts.join("_")}`;
  return base.replace(/[^a-zA-Z0-9_:-]+/g, "_");
}

/**
 * Compute the axis-aligned union of every authored coordinate in a compact:
 * - terrainRuns: both endpoints of every run (h/v); axis=d uses start cell only
 * - terrainCells: each cell
 * - subtractCells: each cell (still part of the authored region's footprint)
 * - specialMapCells: each cell (landmark/map placement counts as authored area)
 *
 * Returns { minX, maxX, minY, maxY } or null when no usable coordinate exists.
 * Non-finite / malformed rows are silently skipped (the main compiler still
 * surfaces them via the structured report).
 */
function computeGeneratedBounds(compact) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let any = false;

  const include = (rawX, rawY) => {
    const x = Number(rawX);
    const y = Number(rawY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const xi = Math.trunc(x);
    const yi = Math.trunc(y);
    if (xi < minX) minX = xi;
    if (xi > maxX) maxX = xi;
    if (yi < minY) minY = yi;
    if (yi > maxY) maxY = yi;
    any = true;
  };

  const terrainRuns = compact?.terrainRuns && typeof compact.terrainRuns === "object" ? compact.terrainRuns : {};
  for (const terrainId of Object.keys(terrainRuns)) {
    const runs = Array.isArray(terrainRuns[terrainId]) ? terrainRuns[terrainId] : [];
    for (const row of runs) {
      if (!Array.isArray(row) || row.length !== 4) continue;
      const axis = String(row[0] || "");
      const x = Number(row[1]);
      const y = Number(row[2]);
      const len = Number(row[3]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(len) || len <= 0) continue;
      let x2 = x;
      let y2 = y;
      if (axis === "h") x2 = x + len - 1;
      else if (axis === "v") y2 = y + len - 1;
      else if (axis !== "d") continue; // unknown axis → skip; d → just the start cell
      include(x, y);
      include(x2, y2);
    }
  }

  const terrainCells = compact?.terrainCells && typeof compact.terrainCells === "object" ? compact.terrainCells : {};
  for (const terrainId of Object.keys(terrainCells)) {
    const cells = Array.isArray(terrainCells[terrainId]) ? terrainCells[terrainId] : [];
    for (const row of cells) {
      if (!Array.isArray(row) || row.length !== 2) continue;
      include(row[0], row[1]);
    }
  }

  const subtractCells = Array.isArray(compact?.subtractCells) ? compact.subtractCells : [];
  for (const row of subtractCells) {
    if (!Array.isArray(row) || row.length < 2) continue;
    include(row[0], row[1]);
  }

  const specialMapCells = Array.isArray(compact?.specialMapCells) ? compact.specialMapCells : [];
  for (const row of specialMapCells) {
    if (!Array.isArray(row) || row.length < 2) continue;
    include(row[0], row[1]);
  }

  if (!any) return null;
  return { minX, maxX, minY, maxY };
}

/**
 * Active mask (cell keys) for "irregular" authored footprint.
 *
 * Contract:
 * - active = (terrainRuns expanded) ∪ (terrainCells) ∪ (specialMapCells) ∪ (subtractCells as coords only)
 * - then subtractCells remove from active
 * - keys are "x,y" strings; deduped; stable sorted by y asc then x asc
 * - This does NOT change terrainZones. It only expresses "this cell is part of the map".
 */
function computeGeneratedActiveCellKeys(compact) {
  const keyOf = (x, y) => `${Math.trunc(Number(x))},${Math.trunc(Number(y))}`;

  const active = new Set();
  const subtract = new Set();

  const add = (set, rawX, rawY) => {
    const x = Number(rawX);
    const y = Number(rawY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    set.add(keyOf(x, y));
  };

  const terrainRuns = compact?.terrainRuns && typeof compact.terrainRuns === "object" ? compact.terrainRuns : {};
  for (const terrainId of Object.keys(terrainRuns)) {
    const runs = Array.isArray(terrainRuns[terrainId]) ? terrainRuns[terrainId] : [];
    for (const row of runs) {
      if (!Array.isArray(row) || row.length !== 4) continue;
      const axis = String(row[0] || "");
      const x0 = Number(row[1]);
      const y0 = Number(row[2]);
      const len = Number(row[3]);
      if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(len) || len <= 0) continue;
      const L = Math.trunc(len);
      const xi = Math.trunc(x0);
      const yi = Math.trunc(y0);
      if (axis === "h") {
        for (let dx = 0; dx < L; dx++) add(active, xi + dx, yi);
      } else if (axis === "v") {
        for (let dy = 0; dy < L; dy++) add(active, xi, yi + dy);
      } else if (axis === "d") {
        // d runs are not writable as terrain zones, but they still represent "authored footprint"
        add(active, xi, yi);
      }
    }
  }

  const terrainCells = compact?.terrainCells && typeof compact.terrainCells === "object" ? compact.terrainCells : {};
  for (const terrainId of Object.keys(terrainCells)) {
    const cells = Array.isArray(terrainCells[terrainId]) ? terrainCells[terrainId] : [];
    for (const row of cells) {
      if (!Array.isArray(row) || row.length !== 2) continue;
      add(active, row[0], row[1]);
    }
  }

  const specialMapCells = Array.isArray(compact?.specialMapCells) ? compact.specialMapCells : [];
  for (const row of specialMapCells) {
    if (!Array.isArray(row) || row.length < 2) continue;
    add(active, row[0], row[1]);
  }

  const subtractCells = Array.isArray(compact?.subtractCells) ? compact.subtractCells : [];
  for (const row of subtractCells) {
    if (!Array.isArray(row) || row.length < 2) continue;
    add(subtract, row[0], row[1]);
  }

  for (const k of subtract) active.delete(k);

  const keys = Array.from(active);
  keys.sort((a, b) => {
    const [ax, ay] = a.split(",").map((n) => Math.trunc(Number(n)));
    const [bx, by] = b.split(",").map((n) => Math.trunc(Number(n)));
    if (ay !== by) return ay - by;
    return ax - bx;
  });
  return keys;
}

function compileCompactToZones(compact, areaSpec, options) {
  const warnings = [];
  const errors = [];
  const bounds = areaSpec.bounds;

  const schemaVersion = compact?.schemaVersion;
  const kind = String(compact?.kind || "");
  if (schemaVersion !== 2) errors.push(`schemaVersion must be 2, got ${String(schemaVersion)}`);
  if (kind !== "wilderness_blueprint_compact") errors.push(`kind must be wilderness_blueprint_compact, got ${kind || "(empty)"}`);

  const sourceAreaId = String(compact?.sourceAreaId || "").trim();
  if (!sourceAreaId) errors.push("sourceAreaId missing");
  if (sourceAreaId && sourceAreaId !== String(options.areaId)) {
    errors.push(`sourceAreaId mismatch: expected ${options.areaId} got ${sourceAreaId}`);
  }

  const mpc = Number(compact?.metersPerCell);
  const expectedMpc = Number(areaSpec?.step?.metersPerCell);
  if (!Number.isFinite(mpc) || !Number.isFinite(expectedMpc) || Math.trunc(mpc) !== Math.trunc(expectedMpc)) {
    errors.push(`metersPerCell mismatch: expected ${expectedMpc} got ${String(compact?.metersPerCell)}`);
  }

  // Reject obvious screen/SVG coord fields (top-level and common nested containers)
  const rawText = JSON.stringify(compact);
  for (const bad of ["screenX", "screenY", "svgX", "svgY", "clientX", "clientY", "viewBox", "viewport"]) {
    if (rawText.includes(bad)) {
      errors.push(`forbidden field token detected in input: ${bad}`);
    }
  }

  const subtractCells = Array.isArray(compact?.subtractCells) ? compact.subtractCells : [];
  if (subtractCells.length > 0) {
    warnings.push(`subtractCells present (${subtractCells.length}); v1 compiler ignores subtractCells`);
    if (options.write && options.allowSubtractIgnored !== true) {
      errors.push("write mode rejects subtractCells unless --allow-subtract-ignored is set");
    }
  }

  const zones = [];
  const terrainHistogram = {};
  const oob = [];
  const seenZoneIds = new Set();

  const addZone = (zone) => {
    if (seenZoneIds.has(zone.id)) {
      errors.push(`duplicate zone id generated: ${zone.id}`);
      return;
    }
    seenZoneIds.add(zone.id);
    zones.push(Object.freeze(zone));
    terrainHistogram[zone.terrainId] = (terrainHistogram[zone.terrainId] || 0) + 1;
  };

  const terrainRuns = compact?.terrainRuns && typeof compact.terrainRuns === "object" ? compact.terrainRuns : {};
  for (const terrainId of Object.keys(terrainRuns)) {
    if (!hasTerrainBiomeDef(terrainId)) {
      errors.push(`unknown terrainId in terrainRuns: ${terrainId}`);
      continue;
    }
    const runs = Array.isArray(terrainRuns[terrainId]) ? terrainRuns[terrainId] : [];
    for (let i = 0; i < runs.length; i += 1) {
      const row = runs[i];
      if (!Array.isArray(row) || row.length !== 4) {
        errors.push(`terrainRuns[${terrainId}][${i}] must be [axis,x,y,len]`);
        continue;
      }
      const axis = String(row[0] || "");
      const x = toSafeInt(row[1], `terrainRuns[${terrainId}][${i}].x`, errors);
      const y = toSafeInt(row[2], `terrainRuns[${terrainId}][${i}].y`, errors);
      const len = toSafeInt(row[3], `terrainRuns[${terrainId}][${i}].len`, errors);
      if (len <= 0) {
        errors.push(`terrainRuns[${terrainId}][${i}].len must be > 0`);
        continue;
      }
      if (axis === "d") {
        warnings.push(`terrainRuns[${terrainId}][${i}] axis=d is not supported for write (will be expanded to 1x1 only in dry-run)`);
        if (options.write) {
          errors.push("write mode rejects diagonal runs (axis=d)");
          continue;
        }
        // dry-run: emit just the start cell to keep shape types limited and explicit
        if (!inBounds(bounds, x, y)) oob.push({ kind: "terrain", terrainId, x, y, source: "run_d" });
        addZone({
          id: buildZoneId("bp", terrainId, "cell", [x, y]),
          terrainId,
          priority: terrainPriorityFor(terrainId),
          shape: Object.freeze({ type: "rect", x1: x, y1: y, x2: x, y2: y })
        });
        continue;
      }

      let x2 = x;
      let y2 = y;
      if (axis === "h") {
        x2 = x + len - 1;
      } else if (axis === "v") {
        y2 = y + len - 1;
      } else {
        errors.push(`terrainRuns[${terrainId}][${i}].axis must be h|v|d`);
        continue;
      }

      // bounds check (inclusive)
      const corners = [
        { x, y },
        { x: x2, y: y2 }
      ];
      for (const c of corners) {
        if (!inBounds(bounds, c.x, c.y)) {
          oob.push({ kind: "terrain", terrainId, x: c.x, y: c.y, source: `run_${axis}` });
        }
      }

      addZone({
        id: buildZoneId("bp", terrainId, axis, [x, y, len]),
        terrainId,
        priority: terrainPriorityFor(terrainId),
        shape: Object.freeze({ type: "rect", x1: x, y1: y, x2, y2 })
      });
    }
  }

  const terrainCells = compact?.terrainCells && typeof compact.terrainCells === "object" ? compact.terrainCells : {};
  for (const terrainId of Object.keys(terrainCells)) {
    if (!hasTerrainBiomeDef(terrainId)) {
      errors.push(`unknown terrainId in terrainCells: ${terrainId}`);
      continue;
    }
    const cells = Array.isArray(terrainCells[terrainId]) ? terrainCells[terrainId] : [];
    for (let i = 0; i < cells.length; i += 1) {
      const row = cells[i];
      if (!Array.isArray(row) || row.length !== 2) {
        errors.push(`terrainCells[${terrainId}][${i}] must be [x,y]`);
        continue;
      }
      const x = toSafeInt(row[0], `terrainCells[${terrainId}][${i}].x`, errors);
      const y = toSafeInt(row[1], `terrainCells[${terrainId}][${i}].y`, errors);
      if (!inBounds(bounds, x, y)) oob.push({ kind: "terrain", terrainId, x, y, source: "cell" });
      addZone({
        id: buildZoneId("bp", terrainId, "cell", [x, y]),
        terrainId,
        priority: terrainPriorityFor(terrainId),
        shape: Object.freeze({ type: "rect", x1: x, y1: y, x2: x, y2: y })
      });
    }
  }

  if (oob.length > 0) {
    const msg = `out-of-bounds coordinates detected (${oob.length})`;
    warnings.push(msg);
    if (options.write && options.allowExpandBounds !== true) {
      errors.push("write mode rejects out-of-bounds coords unless --allow-expand-bounds is set");
    }
  }

  // Landmarks: optional emission only
  const generatedLandmarks = [];
  const specialMapCells = Array.isArray(compact?.specialMapCells) ? compact.specialMapCells : [];
  if (specialMapCells.length > 0 && options.emitLandmarks !== true) {
    warnings.push(`specialMapCells present (${specialMapCells.length}); not emitting landmarks unless --emit-landmarks`);
  }
  if (options.emitLandmarks === true) {
    const seenLmId = new Set();
    const seenLmCoord = new Set();
    for (let i = 0; i < specialMapCells.length; i += 1) {
      const row = specialMapCells[i];
      if (!Array.isArray(row) || row.length < 4) {
        errors.push(`specialMapCells[${i}] must be [x,y,mapId,label]`);
        continue;
      }
      const x = toSafeInt(row[0], `specialMapCells[${i}].x`, errors);
      const y = toSafeInt(row[1], `specialMapCells[${i}].y`, errors);
      const mapId = String(row[2] ?? "").trim();
      const label = String(row[3] ?? "").trim();
      if (isPlaceholderMapId(mapId)) {
        errors.push(`specialMapCells[${i}] mapId is placeholder (${mapId || "(empty)"})`);
        continue;
      }
      if (!label) {
        errors.push(`specialMapCells[${i}] label missing`);
        continue;
      }
      if (!inBounds(bounds, x, y)) {
        oob.push({ kind: "landmark", terrainId: "(landmark)", x, y, source: "special", mapId, label });
        if (options.write && options.allowExpandBounds !== true) {
          errors.push(`specialMapCells[${i}] out of bounds`);
          continue;
        }
      }
      const id = `bp_landmark_${slugId(label)}_${x}_${y}`;
      const key = `${x},${y}`;
      if (seenLmId.has(id)) {
        errors.push(`duplicate landmark id generated: ${id}`);
        continue;
      }
      if (seenLmCoord.has(key)) {
        errors.push(`duplicate landmark coordinate: ${key}`);
        continue;
      }
      seenLmId.add(id);
      seenLmCoord.add(key);
      generatedLandmarks.push(Object.freeze({
        id,
        label,
        x,
        y,
        detectRadius: 1,
        enterRadius: 0,
        gotoMapId: mapId
      }));
    }
  }

  // priority sanity: hard_block zones must be >= non-hard
  let hardBlockCount = 0;
  for (const z of zones) {
    const def = getTerrainBiomeDef(z.terrainId);
    const hard = def?.passability?.foot === "hard_block" || def?.passability?.vehicle === "hard_block";
    if (hard) hardBlockCount += 1;
    if (hard && !(Number(z.priority) >= 200)) {
      errors.push(`hard_block terrain zone priority must be >= 200: ${z.id} priority=${z.priority}`);
    }
  }

  const report = {
    ok: errors.length === 0,
    sourceAreaId,
    metersPerCell: mpc,
    input: {
      terrainRunsCount: Object.keys(terrainRuns).length,
      terrainCellsCount: Object.keys(terrainCells).length,
      subtractCellsCount: subtractCells.length,
      specialMapCellsCount: specialMapCells.length
    },
    output: {
      zoneCount: zones.length,
      hardBlockZoneCount: hardBlockCount,
      landmarksCount: generatedLandmarks.length
    },
    terrainHistogram,
    warnings,
    errors,
    outOfBoundsCount: oob.length,
    outOfBoundsSamples: oob.slice(0, 12)
  };

  return { report, zones, landmarks: generatedLandmarks };
}

function formatGeneratedModule({ areaId, inputRelPath, zones, landmarks, emittedLandmarks, generatedBounds, activeCellKeys }) {
  const upper = String(areaId || "").toUpperCase();
  const constPrefix = upper.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const zoneConst = `${constPrefix}_GENERATED_TERRAIN_ZONES`;
  const lmConst = `${constPrefix}_GENERATED_LANDMARKS`;
  const boundsConst = `${constPrefix}_GENERATED_BOUNDS`;
  const activeConst = `${constPrefix}_GENERATED_ACTIVE_CELL_KEYS`;

  const zoneLines = zones.map((z) => {
    const s = z.shape;
    return [
      "  Object.freeze({",
      `    id: ${JSON.stringify(String(z.id))},`,
      `    terrainId: ${JSON.stringify(String(z.terrainId))},`,
      `    priority: ${Number.isFinite(Number(z.priority)) ? Math.trunc(Number(z.priority)) : 100},`,
      "    shape: Object.freeze({",
      `      type: ${JSON.stringify(String(s.type))},`,
      `      x1: ${Math.trunc(Number(s.x1))},`,
      `      y1: ${Math.trunc(Number(s.y1))},`,
      `      x2: ${Math.trunc(Number(s.x2))},`,
      `      y2: ${Math.trunc(Number(s.y2))}`,
      "    })",
      "  })"
    ].join("\n");
  });

  const lmLines = (emittedLandmarks ? landmarks : []).map((lm) => [
    "  Object.freeze({",
    `    id: ${JSON.stringify(String(lm.id))},`,
    `    label: ${JSON.stringify(String(lm.label))},`,
    `    x: ${Math.trunc(Number(lm.x))},`,
    `    y: ${Math.trunc(Number(lm.y))},`,
    `    detectRadius: ${Math.trunc(Number(lm.detectRadius ?? 1))},`,
    `    enterRadius: ${Math.trunc(Number(lm.enterRadius ?? 0))},`,
    `    gotoMapId: ${JSON.stringify(String(lm.gotoMapId))}`,
    "  })"
  ].join("\n"));

  const boundsLine = generatedBounds && typeof generatedBounds === "object"
    ? [
        `export const ${boundsConst} = Object.freeze({`,
        `  minX: ${Math.trunc(Number(generatedBounds.minX))},`,
        `  maxX: ${Math.trunc(Number(generatedBounds.maxX))},`,
        `  minY: ${Math.trunc(Number(generatedBounds.minY))},`,
        `  maxY: ${Math.trunc(Number(generatedBounds.maxY))}`,
        "});"
      ].join("\n")
    : `export const ${boundsConst} = null;`;

  const activeKeys = Array.isArray(activeCellKeys) ? activeCellKeys : [];
  const activeLine = [
    `export const ${activeConst} = Object.freeze([`,
    activeKeys.length ? activeKeys.map((k) => `  ${JSON.stringify(String(k))}`).join(",\n") : "",
    "]);"
  ].join("\n");

  return [
    "// AUTO-GENERATED by scripts/wilderness_blueprint_compile_area_spec.mjs",
    `// Source: ${inputRelPath}`,
    "// Do not edit by hand.",
    "",
    `export const ${zoneConst} = Object.freeze([`,
    zoneLines.length ? zoneLines.join(",\n") : "",
    "]);",
    "",
    `export const ${lmConst} = Object.freeze([`,
    lmLines.length ? lmLines.join(",\n") : "",
    "]);",
    "",
    boundsLine,
    "",
    activeLine,
    ""
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!args.area || !args.input) {
    console.error(usage());
    process.exit(2);
  }
  if ((args.dryRun ? 1 : 0) + (args.write ? 1 : 0) !== 1) {
    console.error("Must specify exactly one of --dry-run or --write");
    process.exit(2);
  }

  const areaId = String(args.area).trim();
  const inputPath = path.resolve(process.cwd(), String(args.input));
  const inputRel = path.relative(process.cwd(), inputPath).replace(/\\/g, "/");

  const areaSpec = getWildernessAreaSpec(areaId);
  if (!areaSpec) {
    console.error(`Unknown area: ${areaId}`);
    process.exit(2);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Missing input file: ${inputRel}`);
    process.exit(2);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  let compact = null;
  try {
    compact = JSON.parse(raw);
  } catch (e) {
    console.error(`Invalid JSON: ${inputRel}`);
    console.error(String(e?.message || e));
    process.exit(2);
  }

  const { report, zones, landmarks } = compileCompactToZones(compact, areaSpec, {
    areaId,
    write: args.write === true,
    allowSubtractIgnored: args.allowSubtractIgnored === true,
    allowExpandBounds: args.allowExpandBounds === true,
    emitLandmarks: args.emitLandmarks === true
  });

  if (args.dryRun) {
    process.stdout.write(JSON.stringify({
      ...report,
      generatedPreview: {
        zoneCount: zones.length,
        landmarksCount: landmarks.length
      }
    }, null, 2) + "\n");
    process.exit(report.ok ? 0 : 1);
  }

  // write mode
  if (!report.ok) {
    // Contract: even on failure, emit structured report (stdout) for tooling.
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    process.exit(1);
  }

  const outDir = path.resolve(process.cwd(), "data/wilderness/areas/generated");
  const outFile = path.join(outDir, `${areaId}.generated_terrain_zones.js`);
  fs.mkdirSync(outDir, { recursive: true });

  const moduleText = formatGeneratedModule({
    areaId,
    inputRelPath: inputRel,
    zones,
    landmarks,
    emittedLandmarks: args.emitLandmarks === true,
    generatedBounds: computeGeneratedBounds(compact),
    activeCellKeys: computeGeneratedActiveCellKeys(compact)
  });
  fs.writeFileSync(outFile, moduleText, "utf8");
  console.log(`Wrote: ${path.relative(process.cwd(), outFile).replace(/\\/g, "/")}`);
  console.log("Next: node scripts/wilderness_static_contract_check.mjs");
}

main();

