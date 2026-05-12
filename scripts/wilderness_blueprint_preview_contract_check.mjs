import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
 
const repoRoot = path.resolve(process.cwd());
 
function readText(relPath) {
  const p = path.resolve(repoRoot, relPath);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing file: ${relPath}`);
  }
  return fs.readFileSync(p, "utf8");
}
 
function mustInclude(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`Missing required snippet (${label}): ${needle}`);
  }
}
 
function mustNotInclude(haystack, needle, label) {
  if (haystack.includes(needle)) {
    throw new Error(`Found forbidden snippet (${label}): ${needle}`);
  }
}
 
// 1) fragments exists + readable
const fragments = readText("scripts/wilderness_area_preview_blueprint_fragments.mjs");
 
// 2) exporter imports fragments + includes required tokens
const exporter = readText("scripts/wilderness_area_preview_export.mjs");
mustInclude(exporter, "wilderness_area_preview_blueprint_fragments.mjs", "exporter import blueprint fragments");

// --- Preview cell classification contract (exporter) ---
// Must not conflate "no terrainId" with boundary/outside.
mustNotInclude(
  exporter,
  'q?.kind === "boundary" || (q?.terrainId ?? null) == null',
  "exporter must not merge null terrainId into boundary"
);
for (const token of ["outside_area", "empty_inside_area", "unknown_terrain", "terrain-empty-inside"]) {
  mustInclude(exporter, token, "exporter cell classification token");
}
mustInclude(exporter, "terrain-boundary", "exporter boundary class exists");

// Current area terrainId presets must exist in getTerrainPresentation()
for (const tid of [
  "dry_valley_rock_desert",
  "sea_ice_pressure_ridge",
  "flagged_marker_line",
  "ice_shelf_edge",
  "ice_shelf_surface",
  "managed_compacted_route",
  "rock_outcrop_nunatak",
  "sastrugi_field",
  "snow_drift_zone",
  "subglacial_facility_buried_zone",
  "tide_crack_zone",
  "wind_packed_snow"
]) {
  mustInclude(exporter, tid + ":", "exporter getTerrainPresentation preset includes " + tid);
}

// --- Vector terrain style system contract (exporter) ---
mustInclude(exporter, "TERRAIN_VECTOR_STYLE_REGISTRY", "vector style registry exists");
mustInclude(exporter, "resolveTerrainVectorStyle", "vector style resolver (node-side) exists");
mustInclude(exporter, "resolveTerrainVectorStyleRuntime", "vector style resolver (runtime) exists");
mustInclude(exporter, 'fill-opacity="', "vector fill path outputs fill-opacity");
mustInclude(exporter, 'stroke-opacity="', "vector stroke path outputs stroke-opacity");
mustInclude(exporter, "TERRAIN_VECTOR_UNKNOWN_STYLE", "unknown vector terrain fallback exists");

// West2 used terrainIds must have explicit vector presets (not only family fallback).
const vectorRegStart = exporter.indexOf("const TERRAIN_VECTOR_STYLE_REGISTRY");
if (vectorRegStart < 0) throw new Error("Missing vector style registry declaration in exporter");
for (const tid of [
  "dry_valley_rock_desert",
  "sea_ice_pressure_ridge",
  "flagged_marker_line",
  "ice_shelf_edge",
  "ice_shelf_surface",
  "managed_compacted_route",
  "rock_outcrop_nunatak",
  "sastrugi_field",
  "snow_drift_zone",
  "subglacial_facility_buried_zone",
  "tide_crack_zone",
  "wind_packed_snow"
]) {
  mustInclude(exporter, tid + ": {", "explicit vector preset exists: " + tid);
  const at = exporter.indexOf(tid + ": {", vectorRegStart);
  if (at < 0) throw new Error("Missing explicit vector preset (indexOf failed): " + tid);
  const head = exporter.slice(at, at + 520);
  const m = head.match(/fillOpacity\s*:\s*([0-9.]+)/);
  if (!m) throw new Error("Missing fillOpacity for used vector preset: " + tid);
  const v = Number(m[1] || NaN);
  if (!(v >= 0.18)) {
    throw new Error("fillOpacity too low for used vector preset: " + tid + " fillOpacity=" + String(m[1]));
  }
}

// Visual effectiveness contract for known-problem terrains.
function extractVectorPresetHead(tid) {
  const at = exporter.indexOf(tid + ": {", vectorRegStart);
  if (at < 0) throw new Error("Missing explicit vector preset: " + tid);
  return exporter.slice(at, at + 2000);
}
function parseNumberField(head, field) {
  const m = head.match(new RegExp(field + "\\s*:\\s*([0-9.]+)"));
  return m ? Number(m[1]) : NaN;
}
function parseStringField(head, field) {
  const m = head.match(new RegExp(field + "\\s*:\\s*\\\"([^\\\"]*)\\\""));
  return m ? String(m[1]) : "";
}
function parseRgbChannels(rgb) {
  const m = String(rgb).match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

for (const tid of ["flagged_marker_line", "tide_crack_zone", "ice_shelf_edge"]) {
  const head = extractVectorPresetHead(tid);
  const fillOpacity = parseNumberField(head, "fillOpacity");
  const strokeOpacity = parseNumberField(head, "strokeOpacity");
  const strokeWidth = parseNumberField(head, "strokeWidth");
  const dash = parseStringField(head, "strokeDasharray");
  const symbolKind = parseStringField(head, "symbolKind");
  // NOTE: flagged_marker_line is primarily recognized by route overlay; its polygon fill is allowed to be softer.
  if (tid !== "flagged_marker_line") {
    if (!(fillOpacity >= 0.58)) throw new Error("visual contract: fillOpacity too low for " + tid + " fillOpacity=" + String(fillOpacity));
    if (!(strokeOpacity >= 0.85)) throw new Error("visual contract: strokeOpacity too low for " + tid + " strokeOpacity=" + String(strokeOpacity));
    if (!(strokeWidth >= 2.4)) throw new Error("visual contract: strokeWidth too low for " + tid + " strokeWidth=" + String(strokeWidth));
    if (!(dash && dash.trim()) && !(symbolKind && symbolKind.trim())) {
      throw new Error("visual contract: missing dash/symbolKind for " + tid);
    }
  }
  if (tid === "tide_crack_zone" || tid === "ice_shelf_edge") {
    const fill = parseStringField(head, "fill");
    const ch = parseRgbChannels(fill);
    if (!ch) throw new Error("visual contract: fill is not rgb(...) for " + tid + " fill=" + fill);
    if (ch.r < 40 && ch.g < 40 && ch.b < 40) {
      throw new Error("visual contract: fill too dark for " + tid + " fill=" + fill);
    }
  }
}

// West2 blueprint can use sea_ice_pressure_ridge: must have human label + explicit vector preset.
for (const token of ["海冰压力脊", "压力脊", "terrain-sea-ice-ridge", "sea_ice_pressure_ridge: {"]) {
  mustInclude(exporter, token, "pressure ridge preview mapping token");
}

// Route semantics overlay contract (flagged_marker_line must not rely on polygon fill only)
mustInclude(exporter, "v-layer-route-semantics", "route semantics layer exists");
mustInclude(exporter, "renderRouteSemantics", "route renderer function/token exists");
for (const token of ["markerPost", "routeSegment", "flagged_marker_line"]) {
  mustInclude(exporter, token, "route semantics token exists");
}
// Visual thresholds for route overlay (static constants)
mustInclude(exporter, "const ROUTE_STROKE_WIDTH = 2.2", "route stroke width constant");
mustInclude(exporter, "const ROUTE_STROKE_OPACITY = 0.88", "route stroke opacity constant");
 
// 3) exporter output contains SVG layer ids
for (const id of [
  "v-layer-blueprint-cells",
  "v-layer-blueprint-diff",
  "v-layer-blueprint-special",
  "v-layer-blueprint-labels",
  "v-layer-blueprint-brush"
]) {
  mustInclude(exporter, id, "exporter contains blueprint svg layer id");
}
 
// 4) toolbar action exists
mustInclude(exporter, 'data-preview-action="toggle-blueprint-mode"', "toggle-blueprint-mode action");
mustInclude(fragments, 'data-preview-action="blueprint-apply-to-game"', "apply-to-game action button");
mustInclude(fragments, 'data-preview-action="blueprint-apply-expand-bounds"', "apply-expand-bounds action button");
mustInclude(fragments, "允许扩展边界并覆盖", "apply-expand-bounds button text");
mustInclude(fragments, 'data-preview-action="blueprint-open-snapshots"', "open snapshots button");
mustInclude(fragments, 'data-preview-action="blueprint-open-logs"', "open logs button");
mustInclude(fragments, "applyBlueprintToGameData", "apply helper exists");
mustInclude(fragments, "applyBlueprintToGameDataAllowExpandBounds", "apply allowExpandBounds helper exists");
mustInclude(fragments, "fetchBlueprintSnapshots", "snapshots fetch helper exists");
mustInclude(fragments, "loadBlueprintSnapshotToLayer", "snapshot load helper exists");
mustInclude(fragments, "bpLogClient", "client log helper exists");
mustInclude(fragments, "renderBlueprintLogPanel", "log panel renderer exists");
mustInclude(fragments, "fetchBlueprintServerLogs", "server log fetch helper exists");
mustInclude(fragments, "copyBlueprintLogsToClipboard", "copy logs helper exists");
mustInclude(fragments, "discoverBlueprintAuthorServer", "author server discovery exists");
mustInclude(fragments, "getAuthorServerCandidateUrls", "author server candidates exists");
mustInclude(fragments, "getBlueprintAuthorServerBaseUrl", "author server baseUrl getter exists");
mustInclude(fragments, "getCurrentBlueprintAreaId", "areaId getter exists");
mustInclude(fragments, "getBlueprintAuthorServiceStatus", "unified service status helper exists");
mustInclude(fragments, "renderBlueprintAuthorServiceStatus", "unified service status renderer exists");
mustInclude(fragments, "BP_AUTHOR_SERVICE_UNAVAILABLE_HINT", "single unavailable hint constant exists");
mustInclude(fragments, "stage=", "apply error message includes stage");
mustInclude(fragments, "作者服务模式", "author mode text exists");
mustInclude(fragments, "普通 live-server", "live-server diagnostic text exists");
mustInclude(fragments, "打开作者服务页面", "open author server button exists");
mustInclude(fragments, "npm run wilderness:area-preview", "new primary command in text");
mustInclude(fragments, "启动野外地图编辑器.cmd", "launcher name exists in text");
mustInclude(fragments, "file://", "file protocol diagnostic exists");

// Ensure we don't keep multiple variants of "unavailable" hints
mustNotInclude(fragments, "未发现本地作者服务：", "no old unavailable variant with colon");
 
// 5-9) required functions/tokens exist in blueprint runtime fragments
for (const token of [
  "const blueprintState",
  "function buildBlueprintDeltaExport",
  "function buildBlueprintMergePreviewExport",
  "function validateBlueprintBeforeExport",
  "function interpolateGridCells",
  "导入为蓝图层",
  "wilderness_blueprint_compact",
  "导出紧凑蓝图",
  "function parseBlueprintImportJson",
  "function normalizeImportedBlueprintCells",
  "function replaceBlueprintLayerWithImportedCells",
  "function serializeBlueprintCompact",
  "function compressTerrainCellsToRuns",
  "function expandBlueprintCompactRuns",
  "function normalizeCompactBlueprintImport",
  "执行蓝图代码",
  "function parseBlueprintPatchScript",
  "function parseBlueprintPatchLine",
  "function parseBlueprintSelectors",
  "function expandBlueprintSelector",
  "function applyBlueprintPatchCommands",
  "function executeBlueprintPatchFromTextarea",
  "function isBlueprintPatchScript",
  "function validateBlueprintPatchCoord",
  "function quoteAwareSplit"
]) {
  mustInclude(fragments, token, "required blueprint runtime token");
}
 
// 12) terrain symbol system + legend + must-mention terrain ids
for (const token of [
  "BLUEPRINT_TERRAIN_STYLE_REGISTRY",
  "blueprint-terrain-cell",
  "blueprint-terrain-fill",
  "blueprint-terrain-pattern",
  "blueprint-cell-add-frame",
  "blueprint-terrain-danger-frame",
  "renderBlueprintTerrainSwatch",
  "地貌图例",
  "flagged_marker_line",
  "ice_cliff_coast",
  "tide_crack_zone",
  "crevasse_field",
  "subglacial_facility_buried_zone"
]) {
  mustInclude(fragments, token, "terrain symbol system token");
}

// 13) viewport sync tokens
for (const token of [
  "function requestBlueprintOverlayRender",
  "function renderBlueprintOverlay",
  "function vectorCellBoxToScreenRect",
  "worldToScreen(Number(x) - 0.5",
  "worldToScreen(Number(x) + 0.5",
  "viewport_changed"
]) {
  mustInclude(exporter + "\n" + fragments, token, "viewport sync token");
}
mustInclude(exporter, "renderVectorMap", "exporter has renderVectorMap");
mustInclude(exporter, "requestBlueprintOverlayRender(\"viewport_changed\")", "renderVectorMap calls requestBlueprintOverlayRender");

// 14) must not persist screen/svg coords in blueprintState.cells values (pattern-based)
for (const bad of ["screenX:", "screenY:", "svgX:", "svgY:", "clientX:", "clientY:"]) {
  mustNotInclude(fragments, bad, "no persisted coordinate fields");
}

// 15) import safety: no eval / new Function
for (const bad of ["eval(", "new Function"]) {
  mustNotInclude(fragments, bad, "import forbids eval/Function");
}

// 15d) no alert/confirm/prompt
for (const bad of ["alert(", "confirm(", "prompt("]) {
  mustNotInclude(fragments, bad, "no alert/confirm/prompt");
}

// 15b) blueprint runtime must not reference data/wilderness paths
mustNotInclude(fragments, "data/wilderness", "blueprint runtime must not reference data/wilderness");

// 15c) blueprint runtime must not reference world.wilderness
mustNotInclude(fragments, "world.wilderness", "blueprint runtime must not reference world.wilderness");

// 17) must not hardcode fixed author server baseUrl in API calls
mustNotInclude(fragments, 'fetch("http://127.0.0.1:5588', "must not hardcode 5588 fetch");
mustNotInclude(fragments, "devServerBaseUrl()", "must not use devServerBaseUrl");

// 10) forbidden runtime integrations (check both exporter + fragments)
const all = exporter + "\n" + fragments;
for (const bad of [
  "world.wilderness =",
  "saveToSlot",
  "loadFromSlot",
  "wilderness_movement_resolver",
  "wilderness_session_service",
  "wilderness_weather_preview"
]) {
  mustNotInclude(all, bad, "forbidden integration");
}

// 16) blueprint import/export runtime must not write files
// Exporter itself is allowed to write generated HTML into tools/ (by design).
for (const bad of ["writeFileSync(", "writeFile(", "fs.writeFile", "fs.writeFileSync"]) {
  mustNotInclude(fragments, bad, "blueprint runtime must not write files");
}
 
// 11) package.json contains script
const pkg = readText("package.json");
mustInclude(pkg, '"test:wilderness:blueprint-preview"', "package.json script exists");
mustInclude(pkg, "node scripts/wilderness_blueprint_preview_contract_check.mjs", "package.json script command");
 
// 18) Generated HTML must have syntactically valid JS <script> blocks
// (Static parse only; does not execute logic; no browser required.)
const html = readText("tools/wilderness_area_preview/index.html");
const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m = null;
let idx = 0;
while ((m = scriptRe.exec(html)) !== null) {
  idx++;
  const attrs = String(m[1] || "");
  const body = String(m[2] || "");
  // skip non-JS scripts (e.g. embedded JSON)
  if (/\btype\s*=\s*["']application\/json["']/i.test(attrs)) continue;
  const trimmed = body.trim();
  if (!trimmed) continue;
  try {
    // vm.Script does not execute; it only parses/compiles.
    // Using a per-script filename helps surface line/column in errors.
    // eslint-disable-next-line no-new
    new vm.Script(trimmed, { filename: `wilderness_area_preview/index.html<script#${idx}>` });
  } catch (e) {
    const msg = String(e?.message || e || "");
    const stack = String(e?.stack || "");
    const head = trimmed.slice(0, 240);
    // Best-effort extract line/col from stack, then show nearby lines
    let loc = null;
    const mm = stack.match(/<script#\d+>:(\d+):(\d+)/);
    if (mm) loc = { line: Number(mm[1] || 0), col: Number(mm[2] || 0) };
    let snippet = "";
    if (loc && Number.isFinite(loc.line) && loc.line > 0) {
      const lines = trimmed.split("\n");
      const start = Math.max(1, loc.line - 3);
      const end = Math.min(lines.length, loc.line + 3);
      const out = [];
      for (let i = start; i <= end; i++) {
        out.push(String(i).padStart(4, " ") + "| " + lines[i - 1]);
      }
      snippet = out.join("\n");
    }
    throw new Error(
      `Generated HTML script parse failed (#${idx}): ${msg}` +
      (loc ? ` at ${loc.line}:${loc.col}` : "") +
      `\nSCRIPT_HEAD:\n${head}` +
      (snippet ? `\nSCRIPT_SNIPPET:\n${snippet}` : "") +
      (stack ? `\nSTACK:\n${stack.split("\n").slice(0, 5).join("\n")}` : "")
    );
  }
}

// 19) Generated page must include launcher guidance text
for (const token of [
  "启动野外地图编辑器.cmd",
  "npm run wilderness:area-preview",
  "普通 live-server",
  "file://"
]) {
  mustInclude(html, token, "generated html guidance text");
}

// 20) cmd launchers must NOT open file:// index.html, must start author server
function mustReadCmd(relPath) {
  const p = path.resolve(repoRoot, relPath);
  if (!fs.existsSync(p)) throw new Error(`Missing cmd: ${relPath}`);
  return fs.readFileSync(p, "utf8");
}
for (const rel of [
  "启动野外地图编辑器.cmd",
  "tools/wilderness_area_preview/start_wilderness_area_preview.cmd",
  "tools/wilderness_area_preview/启动野外地图预览器.cmd",
  "tools/wilderness_area_preview/刷新并打开预览器.cmd"
]) {
  const src = mustReadCmd(rel);
  mustInclude(src, "npm run wilderness:area-preview", "cmd must start author server");
  for (const bad of [
    'start "" "tools\\wilderness_area_preview\\index.html"',
    'start "" "index.html"',
    'start "" "%~dp0index.html"'
  ]) {
    mustNotInclude(src, bad, "cmd must not open index.html");
  }
}

process.stdout.write("OK: wilderness blueprint preview contract check passed.\n");

