import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { getWildernessAreaSpec } from "../src/engine/wilderness/wilderness_area_registry.js";
import { listTerrainBiomeDefs } from "../src/engine/wilderness/wilderness_terrain_registry.js";
import { queryWildernessCoordinate } from "../src/engine/wilderness/wilderness_area_query.js";
import { buildWildernessVectorPreviewVm } from "../tools/wilderness_area_preview/vector_preview_vm.mjs";
import {
  buildBlueprintTerrainOptions,
  renderBlueprintPanelHtml,
  renderBlueprintDrawPanelHtml,
  renderBlueprintFilesPanelHtml,
  renderBlueprintRuntimeScript,
  renderBlueprintStyles
} from "./wilderness_area_preview_blueprint_fragments.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_AREA_ID = "west2_old_marker_patrol_line";
const OUTPUT_HTML_BASENAME = "wilderness_area_preview_west2_old_marker_patrol_line.html";
const STABLE_INDEX_REL = path.join("tools", "wilderness_area_preview", "index.html");

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonForScriptTag(value) {
  // Prevent accidental </script> termination; keep JSON otherwise raw for JSON.parse.
  return JSON.stringify(value).replaceAll("</script", "<\\/script");
}

function patchBlueprintRuntimeScriptForActiveMask(scriptText) {
  // This exporter no longer monkey-patches runtime functions.
  // (Kept as a stub for backward compatibility with earlier edits.)
  return String(scriptText || "");
}

function assertGeneratedHtmlScriptsParse(html, label) {
  const text = String(html || "");
  const scripts = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m = null;
  while ((m = re.exec(text))) {
    const attrs = String(m[1] || "");
    const body = String(m[2] || "");
    // Skip non-JS scripts
    if (/type\s*=\s*["']application\/json["']/i.test(attrs)) continue;
    // Skip external scripts (none expected, but keep safe)
    if (/src\s*=/i.test(attrs)) continue;
    scripts.push(body);
  }
  for (let i = 0; i < scripts.length; i++) {
    try {
      // Syntax-only check; do not execute.
      new vm.Script(scripts[i], { filename: `${label}:inline_script_${i + 1}` });
    } catch (e) {
      const msg = String(e?.message || e || "");
      const stack = String(e?.stack || "");
      let context = "";
      try {
        const m2 = stack.match(/inline_script_\d+:(\d+):(\d+)/);
        const lineNo = m2 ? Number(m2[1]) : null;
        if (lineNo && Number.isFinite(lineNo) && lineNo > 0) {
          const lines = scripts[i].split(/\r\n|\n|\r/);
          const start = Math.max(1, lineNo - 2);
          const end = Math.min(lines.length, lineNo + 2);
          const out = [];
          for (let ln = start; ln <= end; ln++) out.push(`${ln}|${lines[ln - 1]}`);
          context = out.join("\n");
        }
      } catch { /* ignore */ }
      if (!context) {
        // Heuristic: find a likely illegal token (e.g. U+2028/U+2029 or NUL)
        try {
          const s = scripts[i];
          let badIdx = -1;
          for (let k = 0; k < s.length; k++) {
            const code = s.charCodeAt(k);
            if (code === 0x2028 || code === 0x2029 || code === 0x0000) { badIdx = k; break; }
          }
          if (badIdx >= 0) {
            const prefix = s.slice(Math.max(0, badIdx - 40), badIdx);
            const suffix = s.slice(badIdx + 1, badIdx + 41);
            const cp = s.charCodeAt(badIdx);
            context =
              `badCharIndex=${badIdx} codepoint=U+${cp.toString(16).toUpperCase().padStart(4, "0")}\n` +
              `...${prefix}<<<BAD>>>${suffix}...`;
          }
        } catch { /* ignore */ }
      }
      throw new Error(
        `Generated HTML script parse failed (#${i + 1}): ${msg}` +
        (context ? `\n--- near ---\n${context}\n--- end ---` : "")
      );
    }
  }
}

function prettyJson(value) {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function formatNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(digits);
}

function ensureRequiredLandmarks(areaSpec) {
  const lms = Array.isArray(areaSpec?.landmarks) ? areaSpec.landmarks : [];
  const required = [
    { id: "maintenance_corridor_entry", label: "维修通道外门", gotoMapId: "west2_maintenance_corridor_entry" }
  ];
  for (const r of required) {
    const hit = lms.find((lm) => lm && lm.id === r.id);
    if (!hit) {
      throw new Error(`areaSpec 缺少必需 landmark: ${r.id}`);
    }
    if (String(hit.label ?? "").trim() !== r.label) {
      throw new Error(`landmark ${r.id} 的 label 不匹配，期望=${r.label}，实际=${String(hit.label ?? "")}`);
    }
    if (String(hit.gotoMapId ?? "").trim() !== r.gotoMapId) {
      throw new Error(`landmark ${r.id} 的 gotoMapId 不匹配，期望=${r.gotoMapId}，实际=${String(hit.gotoMapId ?? "")}`);
    }
  }
}

/**
 * Source Loader
 * @param {string} areaId
 * @returns {{ areaSpec: any, terrainDefs: any[], sourcePaths: { areaPath: string, terrainPath: string } }}
 */
function loadWildernessPreviewSource(areaId) {
  const areaSpec = getWildernessAreaSpec(areaId);
  if (!areaSpec) {
    throw new Error(`未找到 areaSpec：${areaId}`);
  }

  const terrainDefs = listTerrainBiomeDefs();
  if (!Array.isArray(terrainDefs) || terrainDefs.length === 0) {
    throw new Error("terrainDefs 为空，无法进行预览。");
  }

  const sourcePaths = {
    areaPath: "data/wilderness/areas/west2_old_marker_patrol_line.js",
    terrainPath: "data/wilderness/terrain/wilderness_terrain_defs.js"
  };

  return { areaSpec, terrainDefs, sourcePaths };
}

function getPassabilityLabel(passability) {
  const foot = String(passability?.foot ?? "").trim();
  if (!foot) return "未知";
  const map = {
    allowed: "可通行",
    conditional: "条件通行",
    slow: "可通行（缓慢）",
    forbidden: "禁止通行",
    hard_block: "硬阻断"
  };
  return map[foot] ?? `未知（${foot}）`;
}

function getRiskLabelFromHazard(hazard, passabilityLabel) {
  if (passabilityLabel === "硬阻断" || passabilityLabel === "禁止通行") return "高危 / 禁行";
  const h = hazard ?? {};
  const maxHaz = Math.max(
    clamp01(h.crevasseRisk),
    clamp01(h.fallRisk),
    clamp01(h.collapseRisk),
    clamp01(h.disorientationRisk)
  );
  if (maxHaz >= 0.7) return "高危";
  if (maxHaz >= 0.35) return "中等风险";
  if (maxHaz > 0.05) return "低风险";
  return "较安全";
}

/**
 * Terrain Presentation Catalog (preview-only; not gameplay truth)
 * @param {string} terrainId
 */
function getTerrainPresentation(terrainId) {
  const id = String(terrainId ?? "").trim();
  const preset = {
    managed_compacted_route: { label: "管理压实道", shortLabel: "压实道", className: "terrain-managed", riskHint: "整备通行带" },
    flagged_marker_line: { label: "标记杆巡查线", shortLabel: "标记线", className: "terrain-marker", riskHint: "可见性参照" },
    wind_packed_snow: { label: "风压硬雪面", shortLabel: "硬雪", className: "terrain-hard-snow", riskHint: "步行偏硬" },
    loose_snowfield: { label: "松雪原", shortLabel: "松雪", className: "terrain-loose-snow", riskHint: "消耗偏高" },
    snow_drift_zone: { label: "雪窝/积雪窝", shortLabel: "雪窝", className: "terrain-drift", riskHint: "陷落/耗时" },
    sastrugi_field: { label: "雪脊区", shortLabel: "雪脊", className: "terrain-sastrugi", riskHint: "风刮脊纹" },
    crevasse_field: { label: "裂隙带", shortLabel: "裂隙", className: "terrain-crevasse", riskHint: "高风险" },
    ice_shelf_edge: { label: "冰架前缘", shortLabel: "冰架边", className: "terrain-shelf-edge", riskHint: "断层边缘" },
    rock_outcrop_nunatak: { label: "裸露岩脊/nunatak", shortLabel: "岩脊", className: "terrain-rock", riskHint: "硬地形" },
    tide_crack_zone: { label: "潮汐裂隙", shortLabel: "裂隙", className: "terrain-tide-crack", riskHint: "潮汐裂缝带" },
    ice_shelf_surface: { label: "冰架面", shortLabel: "冰架", className: "terrain-ice-shelf-surface", riskHint: "冰架台地" },
    sea_ice_pressure_ridge: { label: "海冰压力脊", shortLabel: "压力脊", className: "terrain-sea-ice-ridge", riskHint: "海冰挤压隆起带" },
    dry_valley_rock_desert: { label: "干谷岩漠", shortLabel: "干谷", className: "terrain-dry-valley-rock-desert", riskHint: "裸岩干谷" },
    subglacial_facility_buried_zone: { label: "半埋设施带", shortLabel: "设施", className: "terrain-subglacial-facility-buried-zone", riskHint: "设施残骸/掩埋区" },
    ice_cliff_coast: { label: "冰崖海岸", shortLabel: "冰崖", className: "terrain-ice-cliff", riskHint: "高危边缘" }
  };
  const hit = preset[id];
  if (hit) return hit;
  // For unknown terrain ids, do NOT surface raw terrainId on canvas labels.
  // Full terrainId remains available in right panel / tooltip details via c.terrainId.
  return { label: "未知地貌", shortLabel: "未知", className: "terrain-unknown", riskHint: "未设预览样式" };
}

// --- Vector terrain style system (preview-only; for SVG vector regions) ---
// Core contract:
// - Single resolver drives region styles; do not rely on CSS selectors to guess terrainId.
// - Each preset is a complete style object (fill/stroke/opacity/width/dash).
// - explicit terrain preset -> family fallback -> unknown fallback.
const TERRAIN_VECTOR_STYLE_REGISTRY = Object.freeze({
  // A) Route / managed
  managed_compacted_route: {
    family: "managed",
    fill: "rgb(92, 122, 146)",
    fillOpacity: 0.44,
    stroke: "rgb(168, 212, 238)",
    strokeOpacity: 0.66,
    strokeWidth: 1.6,
    strokeDasharray: "",
    labelTone: "cool"
  },
  flagged_marker_line: {
    family: "managed",
    // Keep polygon fill as a soft background hint; primary recognition is in route overlay.
    fill: "rgb(92, 132, 156)",
    fillOpacity: 0.22,
    stroke: "rgb(204, 242, 252)",
    strokeOpacity: 0.68,
    strokeWidth: 1.4,
    strokeDasharray: "12 10",
    symbolKind: "",
    labelTone: "cool"
  },

  // B) Snow / wind-shaped
  wind_packed_snow: {
    family: "snow",
    fill: "rgb(206, 232, 246)",
    fillOpacity: 0.42,
    stroke: "rgb(150, 188, 210)",
    strokeOpacity: 0.60,
    strokeWidth: 1.3,
    strokeDasharray: "",
    labelTone: "bright"
  },
  loose_snowfield: {
    family: "snow",
    fill: "rgb(236, 246, 252)",
    fillOpacity: 0.40,
    stroke: "rgb(164, 196, 214)",
    strokeOpacity: 0.56,
    strokeWidth: 1.2,
    strokeDasharray: "1.5 2.5",
    labelTone: "bright"
  },
  snow_drift_zone: {
    family: "snow",
    fill: "rgb(232, 238, 242)",
    fillOpacity: 0.46,
    stroke: "rgb(160, 172, 180)",
    strokeOpacity: 0.62,
    strokeWidth: 1.35,
    strokeDasharray: "2 4",
    labelTone: "bright"
  },
  sastrugi_field: {
    family: "snow",
    fill: "rgb(224, 236, 244)",
    fillOpacity: 0.40,
    stroke: "rgb(140, 168, 186)",
    strokeOpacity: 0.62,
    strokeWidth: 1.4,
    strokeDasharray: "6 4",
    labelTone: "bright"
  },
  ice_sheet_plateau: {
    family: "snow",
    fill: "rgb(216, 234, 244)",
    fillOpacity: 0.38,
    stroke: "rgb(158, 190, 206)",
    strokeOpacity: 0.54,
    strokeWidth: 1.2,
    strokeDasharray: "",
    labelTone: "bright"
  },
  polar_plateau_exposed: {
    family: "snow",
    fill: "rgb(70, 88, 110)",
    fillOpacity: 0.34,
    stroke: "rgb(184, 216, 234)",
    strokeOpacity: 0.52,
    strokeWidth: 1.35,
    strokeDasharray: "9 6",
    labelTone: "cool"
  },

  // C) Ice / shelf / glacier
  blue_ice_area: {
    family: "ice",
    fill: "rgb(104, 190, 238)",
    fillOpacity: 0.34,
    stroke: "rgb(160, 232, 255)",
    strokeOpacity: 0.66,
    strokeWidth: 1.3,
    strokeDasharray: "",
    labelTone: "cool"
  },
  glacier_surface: {
    family: "ice",
    fill: "rgb(138, 206, 238)",
    fillOpacity: 0.32,
    stroke: "rgb(190, 242, 255)",
    strokeOpacity: 0.62,
    strokeWidth: 1.25,
    strokeDasharray: "",
    labelTone: "cool"
  },
  ice_shelf_surface: {
    family: "shelf",
    fill: "rgb(118, 206, 212)",
    fillOpacity: 0.34,
    stroke: "rgb(196, 248, 252)",
    strokeOpacity: 0.56,
    strokeWidth: 1.2,
    strokeDasharray: "",
    labelTone: "cool"
  },
  ice_shelf_edge: {
    family: "shelf",
    fill: "rgb(128, 206, 216)",
    fillOpacity: 0.60,
    stroke: "rgb(232, 252, 255)",
    strokeOpacity: 0.90,
    strokeWidth: 2.8,
    strokeDasharray: "12 6",
    symbolKind: "warning_hatch",
    labelTone: "cool"
  },

  // D) Cracks / high risk
  crevasse_field: {
    family: "hazard",
    fill: "rgb(56, 60, 96)",
    fillOpacity: 0.46,
    stroke: "rgb(18, 12, 24)",
    strokeOpacity: 0.80,
    strokeWidth: 2.4,
    strokeDasharray: "2 2",
    labelTone: "warn"
  },
  tide_crack_zone: {
    family: "hazard",
    fill: "rgb(70, 140, 164)",
    fillOpacity: 0.60,
    stroke: "rgb(230, 252, 255)",
    strokeOpacity: 0.90,
    strokeWidth: 2.8,
    strokeDasharray: "6 3",
    symbolKind: "crack_slashes",
    labelTone: "warn"
  },
  sea_ice_pressure_ridge: {
    family: "hazard",
    fill: "rgb(134, 174, 180)",
    fillOpacity: 0.34,
    stroke: "rgb(216, 244, 246)",
    strokeOpacity: 0.54,
    strokeWidth: 1.8,
    strokeDasharray: "3 5",
    labelTone: "cool"
  },

  // E) Rock / dry valleys
  rock_outcrop_nunatak: {
    family: "rock",
    fill: "rgb(188, 168, 146)",
    fillOpacity: 0.40,
    stroke: "rgb(100, 76, 56)",
    strokeOpacity: 0.64,
    strokeWidth: 1.8,
    strokeDasharray: "1 3",
    labelTone: "warm"
  },
  dry_valley_rock_desert: {
    family: "rock",
    fill: "rgb(226, 206, 170)",
    fillOpacity: 0.40,
    stroke: "rgb(138, 114, 72)",
    strokeOpacity: 0.58,
    strokeWidth: 1.6,
    strokeDasharray: "5 6",
    labelTone: "warm"
  },

  // F) Facility / industrial
  subglacial_facility_buried_zone: {
    family: "facility",
    fill: "rgb(118, 124, 130)",
    fillOpacity: 0.42,
    stroke: "rgb(202, 214, 220)",
    strokeOpacity: 0.68,
    strokeWidth: 1.9,
    strokeDasharray: "2 6",
    labelTone: "cool"
  }
});

const TERRAIN_VECTOR_FAMILY_STYLE_REGISTRY = Object.freeze({
  managed: { fill: "rgb(92, 122, 146)", fillOpacity: 0.36, stroke: "rgb(168, 212, 238)", strokeOpacity: 0.55, strokeWidth: 1.4, strokeDasharray: "", labelTone: "cool" },
  snow: { fill: "rgb(220, 238, 248)", fillOpacity: 0.34, stroke: "rgb(158, 190, 206)", strokeOpacity: 0.48, strokeWidth: 1.2, strokeDasharray: "", labelTone: "bright" },
  ice: { fill: "rgb(140, 210, 242)", fillOpacity: 0.30, stroke: "rgb(190, 242, 255)", strokeOpacity: 0.52, strokeWidth: 1.2, strokeDasharray: "", labelTone: "cool" },
  shelf: { fill: "rgb(118, 206, 212)", fillOpacity: 0.30, stroke: "rgb(196, 248, 252)", strokeOpacity: 0.46, strokeWidth: 1.2, strokeDasharray: "", labelTone: "cool" },
  hazard: { fill: "rgb(22, 32, 44)", fillOpacity: 0.42, stroke: "rgb(130, 190, 214)", strokeOpacity: 0.58, strokeWidth: 2.0, strokeDasharray: "6 5", labelTone: "warn" },
  rock: { fill: "rgb(206, 192, 168)", fillOpacity: 0.34, stroke: "rgb(108, 86, 62)", strokeOpacity: 0.56, strokeWidth: 1.6, strokeDasharray: "2 5", labelTone: "warm" },
  facility: { fill: "rgb(122, 128, 134)", fillOpacity: 0.36, stroke: "rgb(202, 214, 220)", strokeOpacity: 0.56, strokeWidth: 1.8, strokeDasharray: "2 6", labelTone: "cool" }
});

const TERRAIN_VECTOR_UNKNOWN_STYLE = Object.freeze({
  family: "unknown",
  fill: "rgb(236, 242, 246)",
  fillOpacity: 0.30,
  stroke: "rgb(140, 160, 172)",
  strokeOpacity: 0.52,
  strokeWidth: 1.2,
  strokeDasharray: "2 4",
  labelTone: "cool"
});

function getTerrainFamilyForVector(terrainId, terrainDef) {
  const id = String(terrainId ?? "").trim();
  const explicit = TERRAIN_VECTOR_STYLE_REGISTRY[id];
  if (explicit && explicit.family) return String(explicit.family);
  const td = terrainDef ?? {};
  const fam = td.family ?? td.biome ?? td.group ?? td.kind ?? "";
  const f = String(fam ?? "").trim();
  return f || "unknown";
}

function resolveTerrainVectorStyle(terrainId, terrainDef) {
  const id = String(terrainId ?? "").trim();
  const hit = id ? TERRAIN_VECTOR_STYLE_REGISTRY[id] : null;
  if (hit) return hit;
  const fam = getTerrainFamilyForVector(id, terrainDef);
  return TERRAIN_VECTOR_FAMILY_STYLE_REGISTRY[fam] ?? TERRAIN_VECTOR_UNKNOWN_STYLE;
}

function isWithinAreaBounds(areaSpec, x, y) {
  const b = areaSpec?.bounds;
  if (!b) return false;
  const minX = Number(b.minX), maxX = Number(b.maxX), minY = Number(b.minY), maxY = Number(b.maxY);
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return false;
  return Number(x) >= minX && Number(x) <= maxX && Number(y) >= minY && Number(y) <= maxY;
}

/**
 * Preview-only classification: do NOT conflate "no terrain" with outside.
 * @returns {"outside_area"|"empty_inside_area"|"terrain"|"unknown_terrain"}
 */
function classifyPreviewCell(areaSpec, q, x, y) {
  const withinBounds = isWithinAreaBounds(areaSpec, x, y);
  if (!withinBounds) return "outside_area";

  const tid = String(q?.terrainId ?? "").trim();
  if (tid) return q?.terrainDef ? "terrain" : "unknown_terrain";
  return "empty_inside_area";
}

/**
 * Landmark Implementation Classifier (preview-only)
 * @param {any} landmark
 * @returns {{ kind: "implemented_location"|"semantic_point", kindLabel: string }}
 */
function classifyWildernessLandmarkImplementation(landmark) {
  const gotoMapId = landmark?.gotoMapId != null && String(landmark.gotoMapId).trim() !== "" ? String(landmark.gotoMapId).trim() : null;
  if (gotoMapId) {
    return { kind: "implemented_location", kindLabel: "已实装" };
  }
  const hasPoint = landmark?.label != null && landmark?.x != null && landmark?.y != null;
  if (hasPoint) {
    return { kind: "semantic_point", kindLabel: "区域语义 / 未实装落点" };
  }
  return { kind: "semantic_point", kindLabel: "区域语义 / 未实装落点" };
}

/**
 * Semantic Presentation Catalog (preview-only)
 * @param {string} kind
 */
function getSemanticPresentation(kind) {
  const k = String(kind ?? "").trim();
  const preset = {
    implemented_location: { label: "已实装地点", className: "implemented-location", fenceClass: "fence-implemented", tag: "已实装地点" },
    semantic_region: { label: "区域语义", className: "semantic-region", fenceClass: "fence-semantic", tag: "区域语义" },
    common_travel_segment: { label: "通用段", className: "common-travel-segment", fenceClass: "fence-common", tag: "通用段" },
    route_semantic: { label: "路线语义", className: "route-semantic", fenceClass: "fence-route", tag: "标记杆巡查线" },
    landmark_perimeter: { label: "地点外围", className: "landmark-perimeter", fenceClass: "fence-perimeter", tag: "地点外围" },
    hazard_semantic: { label: "危险语义区", className: "hazard-semantic", fenceClass: "fence-hazard", tag: "危险语义区" }
  };
  return preset[k] ?? { label: k || "未知语义", className: "semantic-unknown", fenceClass: "fence-unknown", tag: k || "未知语义" };
}

/**
 * Grid VM Builder
 * @param {{ areaSpec: any, terrainDefs: any[] }} args
 * @returns {{ bounds: any, width: number, height: number, cells: any[], usedTerrainIds: string[] }}
 */
function buildWildernessGridVm({ areaSpec, terrainDefs }) {
  void terrainDefs; // terrainDefs 主要用于“已读取真实来源”的证据；查询真值来自现有 queryWildernessCoordinate

  const b = areaSpec?.bounds;
  if (!b) throw new Error("areaSpec.bounds 缺失。");

  const minX = Number(b.minX);
  const maxX = Number(b.maxX);
  const minY = Number(b.minY);
  const maxY = Number(b.maxY);
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) throw new Error("areaSpec.bounds 非法。");

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  if (width <= 0 || height <= 0) throw new Error("bounds 尺寸非法。");

  const cells = [];
  const used = new Set();

  // 视觉上让 y 增大方向向上：因此从 maxY -> minY 逐行渲染
  for (let y = maxY; y >= minY; y--) {
    for (let x = minX; x <= maxX; x++) {
      const q = queryWildernessCoordinate(areaSpec, x, y);
      const previewKind = classifyPreviewCell(areaSpec, q, x, y);
      const terrainIdRaw = String(q?.terrainId ?? "").trim();
      const terrainDef = q?.terrainDef ?? null;

      const isOutside = previewKind === "outside_area";
      const isEmpty = previewKind === "empty_inside_area";
      const isUnknown = previewKind === "unknown_terrain";

      const pres = (!isOutside && !isEmpty)
        ? getTerrainPresentation(terrainIdRaw)
        : (isOutside
            ? { label: "", shortLabel: "", className: "terrain-boundary", riskHint: "" }
            : { label: "（空格）", shortLabel: "空格", className: "terrain-empty-inside", riskHint: "" });

      const passabilityLabel = isOutside
        ? "地图外"
        : isEmpty
          ? "—"
          : isUnknown
            ? "未知地貌定义"
            : getPassabilityLabel(terrainDef?.passability);

      const riskLabel = isOutside
        ? "—"
        : isEmpty
          ? "—"
          : isUnknown
            ? "需补 terrain def / preview 样式"
            : getRiskLabelFromHazard(terrainDef?.hazard, passabilityLabel);

      const moveTimeMult = terrainDef?.move?.moveTimeMult ?? null;
      const staminaCostMult = terrainDef?.move?.staminaCostMult ?? null;
      const rescueDifficulty = terrainDef?.hazard?.rescueDifficulty ?? null;

      const sourceSummary =
        q?.zone?.id != null
          ? `zone:${String(q.zone.id)}`
          : "未暴露来源信息";

      if (!isOutside && !isEmpty && terrainIdRaw) used.add(String(terrainIdRaw));

      const nodeTypeLabel = isOutside
        ? "地图外"
        : isEmpty
          ? "空格 / 未铺设"
          : isUnknown
            ? "未知地貌"
            : "地貌格";

      cells.push({
        x,
        y,
        kind: String(q?.kind || ""),
        previewKind,
        nodeTypeLabel,
        terrainId: (!isOutside && !isEmpty && terrainIdRaw) ? String(terrainIdRaw) : "",
        terrainLabel: pres.label,
        terrainShortLabel: pres.shortLabel,
        terrainClass: pres.className,
        passabilityLabel,
        riskLabel,
        moveTimeMult: Number.isFinite(Number(moveTimeMult)) ? Number(moveTimeMult) : null,
        staminaCostMult: Number.isFinite(Number(staminaCostMult)) ? Number(staminaCostMult) : null,
        rescueDifficulty: Number.isFinite(Number(rescueDifficulty)) ? Number(rescueDifficulty) : null,
        sourceSummary
      });
    }
  }

  const metersPerCell = Number(areaSpec?.step?.metersPerCell);
  return {
    areaId: String(areaSpec?.id ?? "").trim(),
    metersPerCell: Number.isFinite(metersPerCell) ? metersPerCell : null,
    bounds: { minX, maxX, minY, maxY },
    width,
    height,
    cells,
    usedTerrainIds: Array.from(used).sort()
  };
}

function tryGetAreaSemanticZones(areaSpec) {
  const candidates = ["semanticZones", "semanticRegions", "displayZones", "worldZones"];
  for (const key of candidates) {
    const v = areaSpec?.[key];
    if (Array.isArray(v) && v.length > 0) return { key, zones: v };
  }
  return null;
}

function makeCellKey(x, y) {
  return `${x},${y}`;
}

function makeCellPx(gridVm, x, y) {
  const cell = 28;
  const gap = 2;
  const pad = 2;
  const col = x - gridVm.bounds.minX;
  const row = gridVm.bounds.maxY - y; // y-up visual
  return {
    left: pad + col * (cell + gap),
    top: pad + row * (cell + gap),
    cell,
    gap,
    pad
  };
}

/**
 * Semantic Layer Builder
 * @param {{ areaSpec: any, gridVm: any }} args
 */
function buildWildernessSemanticLayerVm({ areaSpec, gridVm }) {
  const fromArea = tryGetAreaSemanticZones(areaSpec);

  /** @type {Array<any>} */
  const semanticZones = [];
  /** @type {Array<any>} */
  const semanticMarkers = [];
  /** @type {Array<any>} */
  const semanticFences = [];
  /** @type {Array<any>} */
  const floatingLabels = [];
  /** @type {Array<any>} */
  const semanticCircles = [];

  // World-space primitives for SVG grid mode (avoid HTML absolute overlay drift).
  /** @type {Array<{ id: string, kind: string, label: string, minX: number, maxX: number, minY: number, maxY: number, source?: string }>} */
  const semanticRectsWorld = [];
  /** @type {Array<{ id: string, kind: string, label: string, x: number, y: number, source?: string }>} */
  const semanticCellFillsWorld = [];
  /** @type {Array<{ id: string, kind: string, label: string, x: number, y: number, rCells: number }>} */
  const semanticCirclesWorld = [];
  /** @type {Array<{ id: string, kind: string, text: string, x: number, y: number, dx?: number, dy?: number }>} */
  const floatingLabelsWorld = [];

  /** @type {Map<string, Set<string>>} */
  const cellKinds = new Map();
  function tagCell(x, y, kind) {
    const k = makeCellKey(x, y);
    if (!cellKinds.has(k)) cellKinds.set(k, new Set());
    cellKinds.get(k).add(kind);
  }

  const sourceMode = fromArea ? "from_areaSpec" : "inferred";
  const sourceNote = fromArea
    ? `区域语义层：读取 areaSpec.${fromArea.key}（只读）。`
    : "区域语义层：当前为预览器根据 terrainZones / landmarks / bounds 生成的只读展示推断，不写回数据。";

  // A) If areaSpec has semantic zones: best-effort render (rect / cells)
  if (fromArea) {
    for (const z of fromArea.zones) {
      if (!z || typeof z !== "object") continue;
      const id = String(z.id ?? "").trim() || "zone";
      const label = String(z.label ?? z.name ?? id).trim() || id;
      const kind = String(z.kind ?? "semantic_region").trim() || "semantic_region";
      const p = getSemanticPresentation(kind);
      semanticZones.push({ id, label, kind, note: z.note ?? null, source: `areaSpec.${fromArea.key}` });

      // Rect-like
      const rect = z.bounds ?? z.rect ?? null;
      if (rect && rect.x1 != null && rect.y1 != null && rect.x2 != null && rect.y2 != null) {
        const x1 = Number(rect.x1);
        const y1 = Number(rect.y1);
        const x2 = Number(rect.x2);
        const y2 = Number(rect.y2);
        if ([x1, y1, x2, y2].every(Number.isFinite)) {
          const minX = Math.min(x1, x2);
          const maxX = Math.max(x1, x2);
          const minY = Math.min(y1, y2);
          const maxY = Math.max(y1, y2);
          semanticRectsWorld.push({ id, kind, label, minX, maxX, minY, maxY, source: `areaSpec.${fromArea.key}` });
          floatingLabelsWorld.push({ id: `${id}_label`, kind, text: label, x: minX, y: maxY, dx: 0.30, dy: 0.40 });
          const a = makeCellPx(gridVm, minX, maxY);
          const b = makeCellPx(gridVm, maxX, minY);
          semanticFences.push({
            id,
            kind,
            className: p.className,
            fenceClass: p.fenceClass,
            label,
            left: a.left,
            top: a.top,
            width: b.left - a.left + a.cell,
            height: b.top - a.top + a.cell
          });
          floatingLabels.push({
            id: `${id}_label`,
            kind,
            className: p.className,
            text: label,
            left: a.left + 6,
            top: a.top + 6
          });
          for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) tagCell(x, y, kind);
        }
      }

      // Cell-list-like
      const cells = Array.isArray(z.cells) ? z.cells : null;
      if (cells && cells.length > 0) {
        for (const c of cells) {
          const x = Number(c?.x ?? c?.[0]);
          const y = Number(c?.y ?? c?.[1]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          tagCell(x, y, kind);
        }
      }
    }
  }

  // B) Inferred semantic zones (minimal, non-authoritative)
  if (!fromArea) {
    // 1) whole_area_common_segment
    {
      const kind = "common_travel_segment";
      const p = getSemanticPresentation(kind);
      const id = "whole_area_common_segment";
      const label = "通用赶路段";
      semanticZones.push({ id, label, kind, note: "覆盖整个 bounds 的底层通用段（只读展示推断）。", source: "inferred" });
      semanticRectsWorld.push({
        id,
        kind,
        label,
        minX: Number(gridVm.bounds.minX),
        maxX: Number(gridVm.bounds.maxX),
        minY: Number(gridVm.bounds.minY),
        maxY: Number(gridVm.bounds.maxY),
        source: "inferred"
      });
      floatingLabelsWorld.push({ id: `${id}_label`, kind, text: "（通用段）", x: Number(gridVm.bounds.minX), y: Number(gridVm.bounds.maxY), dx: 0.40, dy: 0.40 });
      const a = makeCellPx(gridVm, gridVm.bounds.minX, gridVm.bounds.maxY);
      const b = makeCellPx(gridVm, gridVm.bounds.maxX, gridVm.bounds.minY);
      semanticFences.push({
        id,
        kind,
        className: p.className,
        fenceClass: p.fenceClass,
        label,
        left: a.left,
        top: a.top,
        width: b.left - a.left + a.cell,
        height: b.top - a.top + a.cell
      });
      floatingLabels.push({
        id: `${id}_label`,
        kind,
        className: p.className,
        text: "（通用段）",
        left: a.left + 10,
        top: a.top + 10
      });
      for (const c of gridVm.cells) tagCell(c.x, c.y, kind);
    }

    // 2) route semantic: flagged_marker_line cells
    {
      const kind = "route_semantic";
      const p = getSemanticPresentation(kind);
      const id = "marker_patrol_route";
      const label = "标记杆巡查线";
      const routeCells = gridVm.cells.filter((c) => c.terrainId === "flagged_marker_line");
      if (routeCells.length > 0) {
        semanticZones.push({ id, label, kind, note: "由 flagged_marker_line 地貌格推断的路线语义（只读展示推断）。", source: "inferred" });
        let i = 0;
        for (const rc of routeCells) {
          tagCell(rc.x, rc.y, kind);
          semanticCellFillsWorld.push({ id: `${id}_${rc.x}_${rc.y}`, kind, label, x: Number(rc.x), y: Number(rc.y), source: "inferred" });
          const pos = makeCellPx(gridVm, rc.x, rc.y);
          semanticFences.push({
            id: `${id}_${rc.x}_${rc.y}`,
            kind,
            className: p.className,
            fenceClass: p.fenceClass,
            label,
            left: pos.left,
            top: pos.top,
            width: pos.cell,
            height: pos.cell
          });
          if (i % 7 === 0) {
            floatingLabelsWorld.push({ id: `${id}_label_${rc.x}_${rc.y}`, kind, text: "标记杆巡查线", x: Number(rc.x), y: Number(rc.y), dx: 0.60, dy: 0.55 });
            floatingLabels.push({
              id: `${id}_label_${rc.x}_${rc.y}`,
              kind,
              className: p.className,
              text: "标记杆巡查线",
              left: pos.left + 6,
              top: pos.top - 14
            });
          }
          i++;
        }
      }
    }

    // 3/4) landmarks: implemented marker + perimeter; semantic points
    {
      const lms = Array.isArray(areaSpec?.landmarks) ? areaSpec.landmarks : [];
      for (const lm of lms) {
        if (!lm || typeof lm !== "object") continue;
        const id = String(lm.id ?? "").trim();
        if (!id) continue;
        const label = String(lm.label ?? id).trim() || id;
        const x = Number(lm.x);
        const y = Number(lm.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

        const gotoMapId = lm.gotoMapId != null && String(lm.gotoMapId).trim() !== "" ? String(lm.gotoMapId).trim() : null;
        const cls = classifyWildernessLandmarkImplementation(lm);

        const pos = makeCellPx(gridVm, x, y);
        if (cls.kind === "implemented_location") {
          semanticMarkers.push({
            id,
            kind: "implemented_location",
            label,
            x,
            y,
            gotoMapId
          });
          floatingLabels.push({
            id: `${id}_impl_label`,
            kind: "implemented_location",
            className: getSemanticPresentation("implemented_location").className,
            text: `${label}（已实装）`,
            left: pos.left + 12,
            top: pos.top - 18
          });

          const detectR = Number(lm.detectRadius ?? 0);
          if (Number.isFinite(detectR) && detectR > 0) {
            semanticCirclesWorld.push({ id: `${id}_perimeter`, kind: "landmark_perimeter", label, x: Number(x), y: Number(y), rCells: Number(detectR) });
            const cell = pos.cell;
            const gap = pos.gap;
            const radiusPx = detectR * (cell + gap) + cell * 0.5;
            semanticCircles.push({
              id: `${id}_perimeter`,
              kind: "landmark_perimeter",
              label,
              cx: pos.left + cell * 0.5,
              cy: pos.top + cell * 0.5,
              r: radiusPx
            });
            // tag nearby cells (cheap square bounding box)
            for (let yy = y - Math.ceil(detectR); yy <= y + Math.ceil(detectR); yy++) {
              for (let xx = x - Math.ceil(detectR); xx <= x + Math.ceil(detectR); xx++) {
                if (xx < gridVm.bounds.minX || xx > gridVm.bounds.maxX || yy < gridVm.bounds.minY || yy > gridVm.bounds.maxY) continue;
                const dx = xx - x;
                const dy = yy - y;
                if (Math.hypot(dx, dy) <= detectR + 1e-9) tagCell(xx, yy, "landmark_perimeter");
              }
            }
          }
          tagCell(x, y, "implemented_location");
        } else {
          semanticMarkers.push({
            id,
            kind: "semantic_point",
            label,
            x,
            y,
            gotoMapId: null
          });
          floatingLabels.push({
            id: `${id}_sem_label`,
            kind: "semantic_region",
            className: getSemanticPresentation("semantic_region").className,
            text: `${label}（区域语义）`,
            left: pos.left + 12,
            top: pos.top - 18
          });
          tagCell(x, y, "semantic_region");
        }
      }
    }

    // 5) hazard semantic: ice_shelf_edge / crevasse_field
    {
      const hazardIds = new Map([
        ["ice_shelf_edge", "冰架前缘警戒"],
        ["crevasse_field", "裂隙警戒区"]
      ]);
      const kind = "hazard_semantic";
      const p = getSemanticPresentation(kind);
      for (const c of gridVm.cells) {
        const hzLabel = hazardIds.get(c.terrainId);
        if (!hzLabel) continue;
        tagCell(c.x, c.y, kind);
        semanticCellFillsWorld.push({ id: `haz_${c.x}_${c.y}`, kind, label: hzLabel, x: Number(c.x), y: Number(c.y), source: "inferred" });
        const pos = makeCellPx(gridVm, c.x, c.y);
        semanticFences.push({
          id: `haz_${c.x}_${c.y}`,
          kind,
          className: p.className,
          fenceClass: p.fenceClass,
          label: hzLabel,
          left: pos.left,
          top: pos.top,
          width: pos.cell,
          height: pos.cell
        });
        if ((c.x + c.y) % 11 === 0) {
          floatingLabelsWorld.push({ id: `haz_label_${c.x}_${c.y}`, kind, text: hzLabel, x: Number(c.x), y: Number(c.y), dx: 0.55, dy: 0.55 });
          floatingLabels.push({
            id: `haz_label_${c.x}_${c.y}`,
            kind,
            className: p.className,
            text: hzLabel,
            left: pos.left + 6,
            top: pos.top - 14
          });
        }
      }
    }
  }

  const cellSemanticIndex = [];
  for (const [key, set] of cellKinds.entries()) {
    cellSemanticIndex.push({ key, kinds: Array.from(set) });
  }

  return {
    sourceMode,
    sourceNote,
    semanticZones,
    semanticFences,
    floatingLabels,
    semanticMarkers,
    semanticCircles,
    semanticRectsWorld,
    semanticCellFillsWorld,
    semanticCirclesWorld,
    floatingLabelsWorld,
    cellSemanticIndex
  };
}

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Field Flatten Helper
 * @param {any} object
 * @param {string} prefix
 * @param {{ maxDepth?: number, maxEntries?: number }} options
 * @returns {Array<{ field: string, value: string }>}
 */
function flattenPreviewFields(object, prefix = "", options = {}) {
  const maxDepth = Number.isFinite(Number(options.maxDepth)) ? Number(options.maxDepth) : 4;
  const maxEntries = Number.isFinite(Number(options.maxEntries)) ? Number(options.maxEntries) : 800;
  const out = [];

  function push(field, value) {
    if (out.length >= maxEntries) return;
    out.push({ field, value: String(value) });
  }

  function walk(v, p, depth) {
    if (out.length >= maxEntries) return;
    if (depth > maxDepth) return;
    if (v == null) return;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      push(p, v);
      return;
    }
    if (Array.isArray(v)) {
      // Keep arrays searchable as joined string + individual primitives
      const prims = v.filter((x) => ["string", "number", "boolean"].includes(typeof x)).slice(0, 30);
      if (prims.length) push(p, prims.join(","));
      for (let i = 0; i < Math.min(v.length, 20); i++) {
        walk(v[i], `${p}[${i}]`, depth + 1);
      }
      return;
    }
    if (isPlainObject(v)) {
      for (const [k, vv] of Object.entries(v)) {
        const key = p ? `${p}.${k}` : k;
        walk(vv, key, depth + 1);
        if (out.length >= maxEntries) break;
      }
    }
  }

  walk(object, prefix, 0);
  return out;
}

function normalizeQueryText(s) {
  return String(s ?? "").trim();
}

function parseKeyValueQuery(q) {
  const idx = q.indexOf(":");
  if (idx <= 0) return null;
  const key = q.slice(0, idx).trim();
  const value = q.slice(idx + 1).trim();
  if (!key || !value) return null;
  return { key, value };
}

/**
 * Search Index Builder
 * @param {{ areaSpec: any, gridVm: any, semanticLayerVm: any }} args
 */
function buildWildernessSearchIndex({ areaSpec, gridVm, semanticLayerVm }) {
  const entries = [];
  const bounds = gridVm.bounds;

  function add(e) {
    entries.push(Object.freeze(e));
  }

  // Coordinate entries (all cells)
  for (const c of gridVm.cells) {
    const coord = `${c.x},${c.y}`;
    add({
      type: "coordinate",
      label: "坐标",
      value: coord,
      x: c.x,
      y: c.y,
      cellKey: coord,
      targetSelector: `.wilderness-cell[data-x="${c.x}"][data-y="${c.y}"]`,
      summary: `坐标 ${coord}`,
      detail: `terrainId=${c.terrainId} · ${c.terrainLabel}`
    });
  }

  // Landmark entries
  const lms = Array.isArray(areaSpec?.landmarks) ? areaSpec.landmarks : [];
  for (const lm of lms) {
    if (!lm || typeof lm !== "object") continue;
    const id = String(lm.id ?? "").trim();
    if (!id) continue;
    const label = String(lm.label ?? id).trim() || id;
    const x = Number(lm.x);
    const y = Number(lm.y);
    const gotoMapId = lm.gotoMapId != null && String(lm.gotoMapId).trim() !== "" ? String(lm.gotoMapId).trim() : null;
    const cls = classifyWildernessLandmarkImplementation(lm);
    add({
      type: "landmark",
      label,
      value: id,
      x: Number.isFinite(x) ? x : null,
      y: Number.isFinite(y) ? y : null,
      cellKey: Number.isFinite(x) && Number.isFinite(y) ? `${x},${y}` : null,
      targetSelector: `.g-marker[data-landmark-id="${id}"]`,
      summary: `${label} · ${id}`,
      detail: gotoMapId ? `已实装 · gotoMapId=${gotoMapId}` : cls.kindLabel
    });
    if (gotoMapId) {
      add({
        type: "field_value",
        label: "gotoMapId",
        value: gotoMapId,
        x: Number.isFinite(x) ? x : null,
        y: Number.isFinite(y) ? y : null,
        cellKey: Number.isFinite(x) && Number.isFinite(y) ? `${x},${y}` : null,
        targetSelector: `.g-marker[data-landmark-id="${id}"]`,
        summary: `gotoMapId:${gotoMapId}`,
        detail: `${label}（${id}）`
      });
    }
  }

  // Terrain entries (unique ids)
  const terrainToCells = new Map();
  for (const c of gridVm.cells) {
    if (!terrainToCells.has(c.terrainId)) terrainToCells.set(c.terrainId, []);
    terrainToCells.get(c.terrainId).push({ x: c.x, y: c.y });
  }
  for (const [terrainId, cells] of terrainToCells.entries()) {
    const pres = getTerrainPresentation(terrainId);
    add({
      type: "terrain",
      label: pres.shortLabel,
      value: terrainId,
      x: cells[0]?.x ?? null,
      y: cells[0]?.y ?? null,
      cellKey: cells[0] ? `${cells[0].x},${cells[0].y}` : null,
      targetSelector: cells[0] ? `.wilderness-cell[data-x="${cells[0].x}"][data-y="${cells[0].y}"]` : null,
      summary: `${pres.shortLabel} · ${terrainId}`,
      detail: `匹配格数：${cells.length}`
    });
    add({
      type: "field_value",
      label: "terrainId",
      value: terrainId,
      x: cells[0]?.x ?? null,
      y: cells[0]?.y ?? null,
      cellKey: cells[0] ? `${cells[0].x},${cells[0].y}` : null,
      targetSelector: cells[0] ? `.wilderness-cell[data-x="${cells[0].x}"][data-y="${cells[0].y}"]` : null,
      summary: `terrainId:${terrainId}`,
      detail: pres.label
    });
  }

  // Semantic entries (zones)
  if (semanticLayerVm && Array.isArray(semanticLayerVm.semanticZones)) {
    for (const z of semanticLayerVm.semanticZones) {
      const id = String(z.id ?? "").trim();
      const label = String(z.label ?? id).trim() || id;
      const kind = String(z.kind ?? "").trim();
      add({
        type: "semantic",
        label,
        value: kind || "semantic",
        x: null,
        y: null,
        cellKey: null,
        targetSelector: null,
        summary: `${label} · ${kind}`,
        detail: String(z.note ?? "")
      });
    }
  }

  // Field name entries
  const fieldNames = [
    "gotoMapId",
    "terrainId",
    "priority",
    "rescueDifficulty",
    "moveTimeMult",
    "staminaCostMult",
    "passability",
    "detectRadius",
    "enterRadius",
    "runtimeMapId",
    "fallbackMapId"
  ];
  for (const fn of fieldNames) {
    add({
      type: "field_name",
      label: "字段名",
      value: fn,
      x: null,
      y: null,
      cellKey: null,
      targetSelector: null,
      summary: `字段名：${fn}`,
      detail: "字段名搜索入口"
    });
  }

  // Field value entries (flattened)
  const flatArea = flattenPreviewFields(
    {
      id: areaSpec?.id,
      regionId: areaSpec?.regionId,
      runtimeMapId: areaSpec?.runtimeMapId,
      fallbackMapId: areaSpec?.fallbackMapId,
      step: areaSpec?.step,
      bounds: areaSpec?.bounds,
      terrainZones: Array.isArray(areaSpec?.terrainZones)
        ? areaSpec.terrainZones.map((z) => ({ id: z.id, terrainId: z.terrainId, priority: z.priority, shape: z.shape?.type }))
        : []
    },
    "area"
  );
  for (const kv of flatArea) {
    add({
      type: "field_value",
      label: kv.field,
      value: kv.value,
      x: null,
      y: null,
      cellKey: null,
      targetSelector: null,
      summary: `${kv.field}:${kv.value}`,
      detail: "area"
    });
  }

  for (const c of gridVm.cells) {
    const flatCell = flattenPreviewFields(
      {
        x: c.x,
        y: c.y,
        terrainId: c.terrainId,
        passability: c.passabilityLabel,
        rescueDifficulty: c.rescueDifficulty,
        moveTimeMult: c.moveTimeMult,
        staminaCostMult: c.staminaCostMult
      },
      "cell"
    );
    for (const kv of flatCell) {
      add({
        type: "field_value",
        label: kv.field,
        value: kv.value,
        x: c.x,
        y: c.y,
        cellKey: `${c.x},${c.y}`,
        targetSelector: `.wilderness-cell[data-x="${c.x}"][data-y="${c.y}"]`,
        summary: `${kv.field}:${kv.value}`,
        detail: `(${c.x},${c.y})`
      });
    }
  }

  return {
    bounds,
    entryCount: entries.length,
    entries
  };
}

/**
 * Audit VM Builder
 * @param {{ areaSpec: any, gridVm: any, semanticLayerVm: any, terrainDefs: any[] }} args
 */
function buildWildernessPreviewAuditVm({ areaSpec, gridVm, semanticLayerVm, terrainDefs }) {
  const issues = [];
  const registered = new Set(terrainDefs.map((t) => String(t?.id ?? "").trim()).filter(Boolean));

  function push(level, title, message, target) {
    issues.push({ level, title, message, target: target ?? null });
  }

  // Gray info
  push("gray", "信息提示", `metersPerCell = ${areaSpec?.step?.metersPerCell}`, null);
  push("gray", "信息提示", `runtimeMapId = ${String(areaSpec?.runtimeMapId ?? "")}`, null);
  push("gray", "信息提示", `fallbackMapId = ${String(areaSpec?.fallbackMapId ?? "")}`, null);
  push("gray", "信息提示", `areaId = ${String(areaSpec?.id ?? "")}`, null);
  push(
    "gray",
    "信息提示",
    `semantic layer 来源 = ${semanticLayerVm?.sourceMode === "from_areaSpec" ? "正式 semanticZones" : "只读展示推断"}`,
    null
  );

  // Red: terrainId 未注册
  for (const c of gridVm.cells) {
    const tid = String(c.terrainId ?? "").trim();
    if (!tid) continue;
    if (!registered.has(tid)) {
      push("red", "地貌未注册", `terrainId 未注册：${tid}`, {
        type: "cell",
        cellKey: `${c.x},${c.y}`,
        selector: `.wilderness-cell[data-x="${c.x}"][data-y="${c.y}"]`
      });
    }
  }

  // Red: landmark bounds / radius validity / on blocked terrain
  const lms = Array.isArray(areaSpec?.landmarks) ? areaSpec.landmarks : [];
  const byCell = new Map(gridVm.cells.map((c) => [`${c.x},${c.y}`, c]));
  for (const lm of lms) {
    if (!lm || typeof lm !== "object") continue;
    const id = String(lm.id ?? "").trim();
    if (!id) continue;
    const label = String(lm.label ?? id).trim() || id;
    const x = Number(lm.x);
    const y = Number(lm.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const inside =
        x >= gridVm.bounds.minX &&
        x <= gridVm.bounds.maxX &&
        y >= gridVm.bounds.minY &&
        y <= gridVm.bounds.maxY;
      if (!inside) {
        push("red", "地标越界", `${label}（${id}）坐标不在 bounds 内：(${x},${y})`, {
          type: "landmark",
          selector: `.semantic-marker[data-landmark-id="${id}"]`
        });
      }

      const cell = byCell.get(`${x},${y}`);
      if (cell) {
        if (cell.passabilityLabel.includes("硬阻断") || cell.passabilityLabel.includes("禁止通行")) {
          push("red", "地标落在禁行地貌", `${label}（${id}）所在格地貌为禁行：${cell.terrainId}`, {
            type: "landmark",
            selector: `.semantic-marker[data-landmark-id="${id}"]`
          });
        }
      }

      // Yellow: too close to boundary
      const dx = Math.min(x - gridVm.bounds.minX, gridVm.bounds.maxX - x);
      const dy = Math.min(y - gridVm.bounds.minY, gridVm.bounds.maxY - y);
      if (dx <= 1 || dy <= 1) {
        push("yellow", "地标靠近边界", `${label}（${id}）靠近边界，建议检查 detect/enter 半径。`, {
          type: "landmark",
          selector: `.semantic-marker[data-landmark-id="${id}"]`
        });
      }
    }

    const enterR = Number(lm.enterRadius ?? lm.enter_radius);
    if (!(Number.isFinite(enterR) && enterR >= 0)) {
      push("red", "enterRadius 非法", `${label}（${id}）enterRadius 非法：${String(lm.enterRadius)}`, {
        type: "landmark",
        selector: `.semantic-marker[data-landmark-id="${id}"]`
      });
    }
    const detectR = Number(lm.detectRadius ?? lm.detect_radius);
    if (!(Number.isFinite(detectR) && detectR >= 0)) {
      push("red", "detectRadius 非法", `${label}（${id}）detectRadius 非法：${String(lm.detectRadius)}`, {
        type: "landmark",
        selector: `.semantic-marker[data-landmark-id="${id}"]`
      });
    }
    if (Number.isFinite(detectR) && detectR > 6) {
      push("yellow", "detectRadius 过大", `${label}（${id}）detectRadius=${detectR}，建议检查是否过大。`, {
        type: "landmark",
        selector: `.semantic-marker[data-landmark-id="${id}"]`
      });
    }
  }

  // Yellow: priority conflicts (same priority)
  const zones = Array.isArray(areaSpec?.terrainZones) ? areaSpec.terrainZones : [];
  const prMap = new Map();
  for (const z of zones) {
    const p = z?.priority;
    if (!Number.isFinite(Number(p))) continue;
    const key = String(p);
    if (!prMap.has(key)) prMap.set(key, []);
    prMap.get(key).push(String(z?.id ?? z?.terrainId ?? "zone"));
  }
  for (const [p, ids] of prMap.entries()) {
    if (ids.length >= 2) {
      push("yellow", "priority 可能冲突", `多个 zone 使用同一 priority=${p}：${ids.slice(0, 8).join(", ")}`, null);
    }
  }

  // Yellow: line_band endpoints note
  const hasLineBand = zones.some((z) => z?.shape?.type === "line_band");
  if (hasLineBand) {
    push("yellow", "line_band 提示", "存在 line_band zone：建议检查端点与半径是否符合预期。", null);
  }

  // Yellow: implemented location near high risk
  const implemented = (semanticLayerVm?.semanticMarkers ?? []).filter((m) => m?.kind === "implemented_location");
  for (const m of implemented) {
    const x = Number(m.x);
    const y = Number(m.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const label = String(m.label ?? m.id ?? "地标");
    let found = false;
    for (let yy = y - 2; yy <= y + 2; yy++) {
      for (let xx = x - 2; xx <= x + 2; xx++) {
        const cell = byCell.get(`${xx},${yy}`);
        if (!cell) continue;
        if (cell.riskLabel.includes("高危")) {
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (found) {
      push("yellow", "已实装地点周围高危", `${label} 周围存在高危地貌（半径 2 格内），建议检查路径与提示。`, {
        type: "landmark",
        selector: `.semantic-marker[data-landmark-id="${String(m.id)}"]`
      });
    }
  }

  // Yellow: common segment size info
  const areaSize = gridVm.width * gridVm.height;
  if (areaSize >= 256) {
    push("yellow", "通用段面积偏大", `通用赶路段覆盖面积：${areaSize} 格（只读展示推断）。`, null);
  }

  const grouped = { red: [], yellow: [], gray: [] };
  for (const it of issues) grouped[it.level].push(it);
  return {
    summary: { red: grouped.red.length, yellow: grouped.yellow.length, gray: grouped.gray.length },
    issues: grouped
  };
}

function buildLegendVm({ usedTerrainIds }) {
  const items = usedTerrainIds.map((id) => {
    const p = getTerrainPresentation(id);
    return {
      terrainId: id,
      label: p.label,
      shortLabel: p.shortLabel,
      className: p.className,
      passabilityHint: "以格内脚感/门禁为准（只读预览）",
      riskHint: p.riskHint ?? "—"
    };
  });
  return { title: "地貌图例", items };
}

function buildImplementationLegendVm() {
  return {
    title: "对象类型图例",
    items: [
      {
        kind: "implemented_location",
        label: "已实装地点",
        desc: "有 mapId，可进入具体地图。",
        className: getSemanticPresentation("implemented_location").className
      },
      {
        kind: "semantic_region",
        label: "区域语义",
        desc: "只是世界语义，不代表可进入地图。",
        className: getSemanticPresentation("semantic_region").className
      },
      {
        kind: "common_travel_segment",
        label: "通用段",
        desc: "赶路和过渡区域，无独立地图落点。",
        className: getSemanticPresentation("common_travel_segment").className
      }
    ],
    note: "未来可显示：山脊 / 寒武新城 / 寒武新城外围 / 神庙外围（需数据出现后才会绘制）。"
  };
}

function renderLandmarksTable(areaSpec) {
  const lms = Array.isArray(areaSpec?.landmarks) ? areaSpec.landmarks : [];
  const rows = lms
    .map((lm) => {
      const id = String(lm?.id ?? "");
      const label = String(lm?.label ?? "");
      const x = lm?.x;
      const y = lm?.y;
      const detectRadius = lm?.detectRadius;
      const enterRadius = lm?.enterRadius;
      const gotoMapId = lm?.gotoMapId ?? "";
      const impl = gotoMapId ? "已实装" : "区域语义 / 未实装落点";
      return `
        <tr>
          <td><code>${escapeHtml(id)}</code></td>
          <td>${escapeHtml(label)}</td>
          <td><code>${escapeHtml(x)}</code> / <code>${escapeHtml(y)}</code></td>
          <td><code>${escapeHtml(detectRadius)}</code></td>
          <td><code>${escapeHtml(enterRadius)}</code></td>
          <td>${gotoMapId ? `<code>${escapeHtml(gotoMapId)}</code>` : "<span class=\"muted\">—</span>"}</td>
          <td><span class="badge">${escapeHtml(impl)}</span></td>
        </tr>
      `.trim();
    })
    .join("\n");

  return `
    <table class="table">
      <thead>
        <tr>
          <th>id</th>
          <th>label</th>
          <th>x / y</th>
          <th>detectRadius</th>
          <th>enterRadius</th>
          <th>gotoMapId</th>
          <th>落点状态</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="7" class="muted">（无地标）</td></tr>`}
      </tbody>
    </table>
  `.trim();
}

function renderLayerToggleControls() {
  return `
    <div class="layer-controls" aria-label="图层开关">
      <button type="button" class="layer-toggle is-on" data-layer="terrain" data-preview-action="toggle-layer">地貌层</button>
      <button type="button" class="layer-toggle is-on" data-layer="semantic" data-preview-action="toggle-layer">区域语义层</button>
      <button type="button" class="layer-toggle is-on" data-layer="landmark" data-preview-action="toggle-layer">地标层</button>
      <button type="button" class="layer-toggle is-on" data-layer="risk" data-preview-action="toggle-layer">风险层</button>
      <span class="muted layer-hint">（点击切换显示；不写入任何游戏状态）</span>
    </div>
  `.trim();
}

function renderToolbarHtml({ areaSpec, gridVm }) {
  const areaId = String(areaSpec?.id ?? "").trim();
  const title = "WILDERNESS AREA PREVIEW";
  const regionLabel = String(areaSpec?.regionId ?? "").trim();
  const prettyName = String(areaSpec?.label ?? "").trim();
  const subtitle =
    (regionLabel && prettyName) ? (regionLabel + " · " + prettyName)
      : (prettyName || regionLabel || (areaId ? areaId : "—"));
  const metersPerCell = Number(areaSpec?.step?.metersPerCell);
  const b = gridVm?.bounds ?? areaSpec?.bounds ?? null;
  const boundsText = b ? ("x[" + Number(b.minX) + "," + Number(b.maxX) + "] y[" + Number(b.minY) + "," + Number(b.maxY) + "]") : "—";
  return `
    <div class="preview-top-shell" role="banner">
      <div class="preview-identity-main">
          <div class="preview-identity-title" title="${escapeHtml(title + " · " + subtitle)}">
            <span class="preview-kicker">${escapeHtml(title)}</span>
            <span class="preview-dot">·</span>
            <span class="preview-title">${escapeHtml(subtitle)}</span>
          </div>
      </div>

      <div class="preview-status-badges" aria-label="状态戳">
        <span class="status-badge">READ ONLY</span>
        <span class="status-badge status-badge--author">AUTHOR TOOL</span>
      </div>

      <div class="preview-toolbar-main" aria-label="工具行">
        <div class="preview-meta" aria-label="区域元信息" title="area/cell/bounds">
          <span>area: <code>${escapeHtml(areaId || "—")}</code></span>
          <span>· cell: <code>${Number.isFinite(metersPerCell) ? escapeHtml(String(metersPerCell)) : "—"}</code>m</span>
          <span>· bounds: <code>${escapeHtml(boundsText)}</code></span>
        </div>

        <div class="preview-mode-cluster" aria-label="视图与图层">
          <div class="preview-view-tabs" role="group" aria-label="视图">
            <button type="button" class="preview-view-tab is-active" data-preview-action="set-preview-mode" data-preview-mode="vector" aria-pressed="true">区域概览</button>
            <button type="button" class="preview-view-tab" data-preview-action="set-preview-mode" data-preview-mode="grid" aria-pressed="false">格点地貌</button>
            <button type="button" class="preview-view-tab" data-preview-action="toggle-blueprint-mode" aria-pressed="false">蓝图</button>
          </div>
          <details id="preview-layer-details">
            <summary class="layer-menu-summary">图层 <span class="chev">▾</span></summary>
            <div class="layer-menu-body">
              <button type="button" class="layer-menu-item is-on" data-layer="terrain" data-preview-action="toggle-layer">地貌层</button>
              <button type="button" class="layer-menu-item is-on" data-layer="semantic" data-preview-action="toggle-layer">区域语义层</button>
              <button type="button" class="layer-menu-item is-on" data-layer="landmark" data-preview-action="toggle-layer">地标层</button>
              <button type="button" class="layer-menu-item is-on" data-layer="risk" data-preview-action="toggle-layer">风险层</button>
              <div class="layer-menu-hint">（点击切换显示；不写入任何游戏状态）</div>
            </div>
          </details>
        </div>
      </div>

      <div class="preview-search-tools">
        <div class="search-bar">
          <input id="wilderness-search-input" class="search-input" type="text" placeholder="搜索坐标 / 地标 / 地貌 / 字段" />
          <button id="wilderness-search-clear" class="search-clear" type="button" data-preview-action="clear-search">清空</button>
        </div>
        <button
          type="button"
          class="preview-theme-toggle settings-button"
          data-preview-action="toggle-theme"
          aria-label="切换夜间模式"
          aria-pressed="false"
          title="切换夜间模式"
        ><span id="preview-theme-icon" aria-hidden="true">⚙</span></button>
      </div>
    </div>
  `.trim();
}

function renderSidebarTabsHtml() {
  return `
    <div class="preview-sidebar-tabs" role="tablist" aria-label="侧栏">
      <button type="button" class="sidebar-tab is-active" data-tab="cell" data-preview-action="switch-tab" role="tab" aria-selected="true">当前格</button>
      <button type="button" class="sidebar-tab" data-tab="workbench" data-preview-action="switch-tab" role="tab" aria-selected="false">工作台</button>
      <div class="sidebar-spacer"></div>
      <button type="button" class="sidebar-collapse" id="sidebar-collapse-btn" data-preview-action="collapse-sidebar">收起侧栏</button>
    </div>
  `.trim();
}

function renderSidebarHtml({ areaSpec, legendVm, implLegendVm }) {
  void legendVm; // moved to blueprint page (collapsible); keep signature stable
  void implLegendVm;
  const origin = areaSpec?.origin ?? areaSpec?.start ?? areaSpec?.startCoordinate ?? null;
  return `
    <aside class="preview-sidebar" aria-label="右侧侧栏">
      ${renderSidebarTabsHtml()}

      <div class="sidebar-panel is-active" data-panel="cell">
        <div id="cell-detail-panel" class="cell-detail-panel">
          <div class="detail-title">当前格</div>
          <div class="detail-body">
            <div class="detail-empty muted">点击地图格子或地标 marker 查看详情。</div>

            <div class="detail-section">
              <div class="detail-section-title">基础信息</div>
              <div class="detail-kvs">
                <div class="k">坐标</div><div class="v v-mono" data-field="coord">—</div>
                <div class="k">节点类型</div><div class="v" data-field="nodeType">—</div>
                <div class="k">显示名称</div><div class="v" data-field="nodeLabel">—</div>
                <div class="k">mapId</div><div class="v v-mono"><code data-field="mapId">—</code></div>
                <div class="k">覆盖范围</div><div class="v" data-field="entryFootprint">—</div>
              </div>
            </div>

            <div class="detail-section">
              <div class="detail-section-title">地貌</div>
              <div class="detail-kvs detail-kvs--terrain">
                <div class="k">地貌中文名</div><div class="v" data-field="terrainLabel">—</div>
                <div class="k">terrainId</div><div class="v v-mono"><code data-field="terrainId">—</code></div>
                <div class="k">通行说明</div><div class="v" data-field="passabilityLabel">—</div>
                <div class="k">风险说明</div><div class="v v-em" data-field="riskLabel">—</div>
              </div>
            </div>

            <div class="detail-section">
              <div class="detail-section-title">通行 / 风险 / 来源</div>
              <div class="detail-kvs">
                <div class="k">所属语义</div><div class="v" data-field="semanticKinds">—</div>
                <div class="k">附近已实装地点</div><div class="v" data-field="nearbyImplemented">—</div>
                <div class="k">语义来源</div><div class="v v-mono"><code data-field="semanticSource">—</code></div>
                <div class="k">行进耗时倍率</div><div class="v v-mono"><code data-field="moveTimeMult">—</code></div>
                <div class="k">体力消耗倍率</div><div class="v v-mono"><code data-field="staminaCostMult">—</code></div>
                <div class="k">搜救难度</div><div class="v v-mono"><code data-field="rescueDifficulty">—</code></div>
                <div class="k">来源</div><div class="v v-mono"><code data-field="sourceSummary">—</code></div>
              </div>
            </div>
          </div>
        </div>
        <div id="search-results" class="search-results" aria-label="搜索结果" style="margin-top:14px;">
          <div class="muted">输入关键词开始搜索。</div>
        </div>
        <div class="muted" style="display:none">search-index</div>
        <div class="muted" style="display:none">坐标结果</div>
        <div class="muted" style="display:none">地标结果</div>
        <div class="muted" style="display:none">地貌结果</div>
        <div class="muted" style="display:none">字段结果</div>
        <div class="muted" style="display:none">审计问题结果</div>
      </div>

      <div class="sidebar-panel" data-panel="workbench">
        <div class="panel-title">工作台</div>
        ${renderBlueprintPanelHtml()}
        <details style="margin-top:10px;">
          <summary>档案</summary>
          <div class="kvs" style="margin-top:10px;">
            <div class="k">areaId</div><div class="v"><code>${escapeHtml(areaSpec.id)}</code></div>
            <div class="k">regionId</div><div class="v"><code>${escapeHtml(areaSpec.regionId)}</code></div>
            <div class="k">metersPerCell</div><div class="v"><code>${escapeHtml(areaSpec?.step?.metersPerCell)}</code></div>
            <div class="k">bounds</div><div class="v"><pre>${prettyJson(areaSpec.bounds)}</pre></div>
            <div class="k">runtimeMapId</div><div class="v"><code>${escapeHtml(areaSpec.runtimeMapId)}</code></div>
            <div class="k">fallbackMapId</div><div class="v"><code>${escapeHtml(areaSpec.fallbackMapId)}</code></div>
            <div class="k">origin / start coordinate</div>
            <div class="v">${origin ? `<pre>${prettyJson(origin)}</pre>` : `<span class="muted">（未在 areaSpec 中声明）</span>`}</div>
            <div class="k">terrainZones 数量</div><div class="v"><code>${escapeHtml(areaSpec?.terrainZones?.length ?? 0)}</code></div>
            <div class="k">landmarks 数量</div><div class="v"><code>${escapeHtml(areaSpec?.landmarks?.length ?? 0)}</code></div>
          </div>
        </details>
      </div>
    </aside>
  `.trim();
}

function renderAppendixHtml({ sourceVm, semanticLayerVm, nowIso }) {
  return `
    <section class="preview-appendix" aria-label="附录（折叠）">
      <details>
        <summary>附录（合同状态 / 取证摘要 / 数据来源）</summary>
        <div class="appendix-body">
          <div class="appendix-section">
            <div class="appendix-title">调试指标（运行时）</div>
            <details open>
              <summary class="muted">debug-metrics（自动验收：覆盖率 / 负坐标刻度 / 可视范围）</summary>
              <pre id="debug-metrics">（页面初始化中…）</pre>
            </details>
          </div>
          <div class="appendix-section">
            <div class="appendix-title">合同状态完整说明</div>
            <div class="pill">
              <span>工具类型：<strong>离线只读作者工具</strong></span>
              <span><strong>不是玩家小地图</strong></span>
              <span><strong>不是地图编辑器</strong></span>
              <span><strong>不写回 data</strong></span>
              <span><strong>不接入 runtime</strong></span>
            </div>
          </div>
          <div class="appendix-section">
            <div class="appendix-title">区域语义层</div>
            <div class="muted">${escapeHtml(semanticLayerVm.sourceNote)}</div>
          </div>
          <div class="appendix-section">
            <div class="appendix-title">取证摘要</div>
            <div class="evidence">
              <div>
                <div class="muted">已读取的 area 文件路径</div>
                <pre><code>${escapeHtml(sourceVm.sourcePaths.areaPath)}</code></pre>
              </div>
              <div>
                <div class="muted">已读取的 terrain 文件路径</div>
                <pre><code>${escapeHtml(sourceVm.sourcePaths.terrainPath)}</code></pre>
              </div>
              <div>
                <div class="muted">生成时间（ISO）</div>
                <pre><code>${escapeHtml(nowIso)}</code></pre>
              </div>
              <div>
                <div class="muted">声明</div>
                <pre><code>本页面为离线预览输出，不参与游戏运行时。</code></pre>
              </div>
            </div>
          </div>
        </div>
      </details>
    </section>
  `.trim();
}

function renderSemanticLayerHtml({ semanticLayerVm, gridVm }) {
  const fenceHtml = semanticLayerVm.semanticFences
    .map((f) => {
      const p = getSemanticPresentation(f.kind);
      const isCommon = f.kind === "common_travel_segment";
      const isRisk = f.kind === "hazard_semantic";
      const layer = isRisk ? "risk" : "semantic";
      return `
        <div
          class="semantic-zone ${escapeHtml(p.className)} ${escapeHtml(p.fenceClass)} semantic-zone-fence"
          data-layer="${escapeHtml(layer)}"
          data-kind="${escapeHtml(f.kind)}"
          style="left:${escapeHtml(f.left)}px; top:${escapeHtml(f.top)}px; width:${escapeHtml(f.width)}px; height:${escapeHtml(f.height)}px;"
          aria-hidden="true"
        >
          ${isCommon ? `<div class="semantic-zone-fill"></div>` : ""}
        </div>
      `.trim();
    })
    .join("\n");

  const labelHtml = semanticLayerVm.floatingLabels
    .map((l) => {
      const p = getSemanticPresentation(l.kind);
      const layer = l.kind === "hazard_semantic" ? "risk" : "semantic";
      return `
        <div
          class="semantic-floating-label ${escapeHtml(p.className)}"
          data-layer="${escapeHtml(layer)}"
          data-kind="${escapeHtml(l.kind)}"
          style="left:${escapeHtml(l.left)}px; top:${escapeHtml(l.top)}px;"
        >${escapeHtml(l.text)}</div>
      `.trim();
    })
    .join("\n");

  const circleHtml = semanticLayerVm.semanticCircles
    .map((c) => {
      const p = getSemanticPresentation(c.kind);
      return `
        <div
          class="semantic-zone ${escapeHtml(p.className)} ${escapeHtml(p.fenceClass)} semantic-circle"
          data-layer="semantic"
          data-kind="${escapeHtml(c.kind)}"
          style="left:${escapeHtml(c.cx - c.r)}px; top:${escapeHtml(c.cy - c.r)}px; width:${escapeHtml(c.r * 2)}px; height:${escapeHtml(c.r * 2)}px;"
          aria-hidden="true"
        ></div>
      `.trim();
    })
    .join("\n");

  const markerHtml = semanticLayerVm.semanticMarkers
    .map((m) => {
      const impl = m.kind === "implemented_location" ? "implemented_location" : "semantic_region";
      const p = getSemanticPresentation(impl);
      const pos = makeCellPx(gridVm, m.x, m.y);
      const goto = m.gotoMapId ? String(m.gotoMapId) : "";
      const layer = m.kind === "implemented_location" ? "landmark" : "semantic";
      return `
        <button
          type="button"
          class="semantic-marker ${escapeHtml(p.className)}"
          data-layer="${escapeHtml(layer)}"
          data-marker-kind="${escapeHtml(m.kind)}"
          data-landmark-id="${escapeHtml(m.id)}"
          data-x="${escapeHtml(m.x)}"
          data-y="${escapeHtml(m.y)}"
          data-goto-map-id="${escapeHtml(goto)}"
          data-preview-action="select-landmark"
          style="left:${escapeHtml(pos.left)}px; top:${escapeHtml(pos.top)}px;"
          aria-label="${escapeHtml(m.label)}"
          title="${escapeHtml(m.label)}"
        >
          <span class="semantic-marker-dot" aria-hidden="true"></span>
        </button>
      `.trim();
    })
    .join("\n");

  return `
    <div class="semantic-layer" aria-label="区域语义层">
      <div class="semantic-source-note muted">围栏式：${escapeHtml(semanticLayerVm.sourceNote)}</div>
      <div class="semantic-canvas">
        ${fenceHtml}
        ${circleHtml}
        ${markerHtml}
        ${labelHtml}
      </div>
    </div>
  `.trim();
}

function renderImplementationLegendHtml({ implLegendVm }) {
  const rows = implLegendVm.items
    .map((it) => {
      return `
        <tr>
          <td><span class="legend-swatch ${escapeHtml(it.className)}" aria-hidden="true"></span></td>
          <td><strong>${escapeHtml(it.label)}</strong></td>
          <td class="muted">${escapeHtml(it.desc)}</td>
        </tr>
      `.trim();
    })
    .join("\n");

  return `
    <div class="card">
      <h2>E. ${escapeHtml(implLegendVm.title)}</h2>
      <div class="body">
        <table class="table">
          <thead>
            <tr>
              <th style="width:64px;">标记</th>
              <th style="width:120px;">类型</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div class="muted" style="margin-top:10px;">${escapeHtml(implLegendVm.note)}</div>
      </div>
    </div>
  `.trim();
}

function renderAuditPanelHtml() {
  return `
    <div class="card" id="audit-panel">
      <h2>H. 审计面板</h2>
      <div class="body">
        <div class="audit-summary">
          <span class="audit-pill audit-red">红色：必须修 <strong id="audit-count-red">0</strong></span>
          <span class="audit-pill audit-yellow">黄色：建议检查 <strong id="audit-count-yellow">0</strong></span>
          <span class="audit-pill audit-gray">灰色：信息提示 <strong id="audit-count-gray">0</strong></span>
        </div>
        <div class="audit-lists">
          <div class="audit-section">
            <div class="audit-title audit-red">红色：必须修</div>
            <div id="audit-list-red" class="audit-list"></div>
          </div>
          <div class="audit-section">
            <div class="audit-title audit-yellow">黄色：建议检查</div>
            <div id="audit-list-yellow" class="audit-list"></div>
          </div>
          <div class="audit-section">
            <div class="audit-title audit-gray">灰色：信息提示</div>
            <div id="audit-list-gray" class="audit-list"></div>
          </div>
        </div>
        <div class="muted" style="margin-top:10px;">审计只做只读提示，不会自动修复，也不会写回数据。</div>
      </div>
    </div>
  `.trim();
}

function renderSearchRuntimeScript({ terrainOptions }) {
  const terrainVectorStyleRegistryJson = JSON.stringify(TERRAIN_VECTOR_STYLE_REGISTRY);
  const terrainVectorFamilyStyleRegistryJson = JSON.stringify(TERRAIN_VECTOR_FAMILY_STYLE_REGISTRY);
  const terrainVectorUnknownStyleJson = JSON.stringify(TERRAIN_VECTOR_UNKNOWN_STYLE);
  return `
    <script>
      (function(){
        const _warned = new Set();
        function warnOnce(key, message){
          if (_warned.has(key)) return;
          _warned.add(key);
          console.warn("[wilderness_area_preview]", message);
        }
        function byId(id){ return document.getElementById(id); }
        function escapeHtmlRuntime(value){
          return String(value ?? "").replace(/[&<>"']/g, (ch) => {
            switch (ch) {
              case "&": return "&amp;";
              case "<": return "&lt;";
              case ">": return "&gt;";
              case '"': return "&quot;";
              case "'": return "&#39;";
              default: return ch;
            }
          });
        }
        function tryParseJsonScript(id){
          const el = byId(id);
          if (!el) return null;
          try { return JSON.parse(el.textContent || "{}"); } catch { return null; }
        }
        const gridVm = tryParseJsonScript("wilderness-grid-vm");
        const semanticVm = tryParseJsonScript("wilderness-semantic-vm");
        const searchIndex = tryParseJsonScript("wilderness-search-index");
        const auditVm = tryParseJsonScript("wilderness-audit-vm");
        const vectorVm = tryParseJsonScript("wilderness-vector-vm");

        // --- Vector terrain style system (single resolver; do not rely on CSS guessing) ---
        const TERRAIN_VECTOR_STYLE_REGISTRY = ${terrainVectorStyleRegistryJson};
        const TERRAIN_VECTOR_FAMILY_STYLE_REGISTRY = ${terrainVectorFamilyStyleRegistryJson};
        const TERRAIN_VECTOR_UNKNOWN_STYLE = ${terrainVectorUnknownStyleJson};

        // Minimal terrainDef map for resolver; derived from gridVm cell samples.
        // (We intentionally avoid reading runtime engine sources from the page.)
        const terrainDefById = new Map();
        if (gridVm && Array.isArray(gridVm.cells)) {
          for (const c of gridVm.cells) {
            const tid = String(c && c.terrainId || "").trim();
            if (!tid) continue;
            if (!terrainDefById.has(tid)) terrainDefById.set(tid, null);
          }
        }

        function getTerrainFamilyForVectorRuntime(terrainId, terrainDef){
          const id = String(terrainId || "").trim();
          const explicit = id && TERRAIN_VECTOR_STYLE_REGISTRY ? TERRAIN_VECTOR_STYLE_REGISTRY[id] : null;
          if (explicit && explicit.family) return String(explicit.family);
          const td = terrainDef || {};
          const fam = td.family || td.biome || td.group || td.kind || "";
          const f = String(fam || "").trim();
          return f || "unknown";
        }

        function resolveTerrainVectorStyleRuntime(terrainId, terrainDef){
          const id = String(terrainId || "").trim();
          const hit = id && TERRAIN_VECTOR_STYLE_REGISTRY ? TERRAIN_VECTOR_STYLE_REGISTRY[id] : null;
          if (hit) return hit;
          const fam = getTerrainFamilyForVectorRuntime(id, terrainDef);
          return (TERRAIN_VECTOR_FAMILY_STYLE_REGISTRY && TERRAIN_VECTOR_FAMILY_STYLE_REGISTRY[fam]) ? TERRAIN_VECTOR_FAMILY_STYLE_REGISTRY[fam] : TERRAIN_VECTOR_UNKNOWN_STYLE;
        }

        const input = byId("wilderness-search-input");
        const clearBtn = byId("wilderness-search-clear");
        const resultsEl = byId("search-results");
        const gridEl = byId("wilderness-preview-map");
        const vectorHost = byId("vector-preview");
        const gridHost = byId("grid-debug");
        const stageEl = byId("preview-stage");
        const viewportEl = byId("preview-svg-viewport");
        const rulerLeft = byId("preview-ruler-left");
        const rulerBottom = byId("preview-ruler-bottom");
        const layerGrid = document.getElementById("v-layer-grid");
        const layerFill = document.getElementById("v-layer-fill");
        const layerBoundary = document.getElementById("v-layer-boundary");
        const layerTerrainSymbols = document.getElementById("v-layer-terrain-symbols");
        const layerRouteSemantics = document.getElementById("v-layer-route-semantics");
        const layerEntryFootprint = document.getElementById("v-layer-entry-footprint");
        const layerLines = document.getElementById("v-layer-lines");
        const layerLabels = document.getElementById("v-layer-labels");
        const layerNodes = document.getElementById("v-layer-nodes");
        const svgEl = document.getElementById("vector-preview-svg");
        const themeBtn = document.querySelector(".preview-theme-toggle");
        const themeIcon = document.getElementById("preview-theme-icon");
        const hoverTip = byId("preview-hover-tooltip");
        // Note: ruler DOM is re-rendered via innerHTML, so cursor line nodes may be re-mounted.
        // Always query by id when updating overlay.
        const panel = byId("cell-detail-panel");
        const expandBtn = byId("sidebar-expand-btn");

        function isPreviewCameraReady() {
          return Boolean(
            gridVm &&
            gridVm.bounds &&
            viewportEl &&
            svgEl &&
            layerGrid &&
            layerFill &&
            layerBoundary &&
            layerEntryFootprint &&
            layerLines &&
            layerLabels &&
            layerNodes &&
            Number.isFinite(cameraState.scale) &&
            cameraState.scale !== 0
          );
        }

        function setField(name, value) {
          const node = panel ? panel.querySelector("[data-field=\\"" + name + "\\"]") : null;
          if (!node) return;
          node.textContent = value;
        }
        function clearNodeFields(){
          setField("nodeType", "—");
          setField("nodeLabel", "—");
          setField("mapId", "—");
          setField("entryFootprint", "—");
        }

        // --- Camera state (vector mode) ---
        const cameraState = {
          scale: 1,
          minScale: 0.25,
          maxScale: 8,
          offsetX: 0,
          offsetY: 0,
          baseScale: 1,
          baseOffsetX: 0,
          baseOffsetY: 0,
          viewportWidth: 0,
          viewportHeight: 0
        };

        function clampScale(s){
          return Math.max(cameraState.minScale, Math.min(cameraState.maxScale, s));
        }

        // --- Theme (preview-local only; no runtime truth) ---
        let previewTheme = "light";
        function safeGetStorage(key){
          try { return window.localStorage ? window.localStorage.getItem(key) : null; } catch { return null; }
        }
        function safeSetStorage(key, value){
          try { if (window.localStorage) window.localStorage.setItem(key, value); } catch {}
        }
        function applyTheme(next){
          previewTheme = next === "dark" ? "dark" : "light";
          document.documentElement.dataset.previewTheme = previewTheme;
          if (themeBtn) themeBtn.setAttribute("aria-pressed", previewTheme === "dark" ? "true" : "false");
          if (themeIcon) themeIcon.textContent = previewTheme === "dark" ? "☀" : "☾";
          safeSetStorage("wilderness_area_preview_theme", previewTheme);
        }
        (function initTheme(){
          const saved = safeGetStorage("wilderness_area_preview_theme");
          if (saved === "light" || saved === "dark") { applyTheme(saved); return; }
          const prefersDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
          applyTheme(prefersDark ? "dark" : "light");
        })();

        function worldToScreen(wx, wy){
          return {
            x: wx * cameraState.scale + cameraState.offsetX,
            y: -wy * cameraState.scale + cameraState.offsetY
          };
        }
        function screenToWorld(sx, sy){
          return {
            x: (sx - cameraState.offsetX) / cameraState.scale,
            y: -(sy - cameraState.offsetY) / cameraState.scale
          };
        }

        // --- Preview mode state (single source of truth) ---
        // Hydrate from sessionStorage so a "从游戏文件重载预览" reload (or any
        // explicit caller that sets wilderness_area_preview_next_mode) lands
        // the freshly exported page on the requested mode. The key is one-shot:
        // it is consumed and removed here so it cannot lock the page forever.
        let currentPreviewMode = (function readInitialPreviewMode() {
          try {
            const next = sessionStorage.getItem("wilderness_area_preview_next_mode");
            if (next === "grid" || next === "vector") {
              sessionStorage.removeItem("wilderness_area_preview_next_mode");
              return next;
            }
          } catch (_e) { /* sessionStorage unavailable -> fall back to default */ }
          return "vector";
        })();
        function getActivePreviewMode() {
          return currentPreviewMode === "grid" ? "grid" : "vector";
        }
        function isGridModeActive() {
          return getActivePreviewMode() === "grid";
        }
        function isVectorModeActive() {
          return getActivePreviewMode() === "vector";
        }

        // --- Grid viewport (grid mode only; preview-local UI state) ---
        const GRID_MIN_ZOOM = 0.45;
        const GRID_MAX_ZOOM = 4.0;
        const GRID_ZOOM_STEP = 1.12;
        const gridViewport = {
          zoom: 1,
          panX: 0,
          panY: 0,
          selectedCell: null,
          hoverCell: null,
          followPlayer: false
        };
        const gridSvg = document.getElementById("grid-preview-svg");
        const gridZoomLabel = document.getElementById("grid-zoom-label");
        const gGrid = document.getElementById("g-layer-grid");
        const gCells = document.getElementById("g-layer-cells");
        const gBoundary = document.getElementById("g-layer-boundary");
        const gZones = document.getElementById("g-layer-zones");
        const gRadius = document.getElementById("g-layer-radius");
        const gMarkers = document.getElementById("g-layer-markers");
        const gLabels = document.getElementById("g-layer-labels");
        const gHover = document.getElementById("g-layer-hover");
        const gSelected = document.getElementById("g-layer-selected");
        const gPointer = document.getElementById("g-layer-pointer");
        const gridCellSizeBasePx = 32;

        function isGridActive(){
          return isGridModeActive() && Boolean(gridHost && gridHost.classList.contains("is-active"));
        }

        function clampGridZoom(z){
          return Math.max(GRID_MIN_ZOOM, Math.min(GRID_MAX_ZOOM, z));
        }

        function getGridViewportRect(){
          if (!viewportEl) return null;
          const r = viewportEl.getBoundingClientRect();
          return r && r.width > 0 && r.height > 0 ? r : null;
        }

        function gridScalePx(){
          return gridCellSizeBasePx * gridViewport.zoom;
        }

        function gridWorldToScreen(wx, wy){
          const rect = getGridViewportRect();
          if (!rect) return { x: 0, y: 0 };
          const s = gridScalePx();
          return {
            x: rect.width / 2 + gridViewport.panX + wx * s,
            y: rect.height / 2 + gridViewport.panY + (-wy) * s
          };
        }

        function gridScreenToWorld(sx, sy){
          const rect = getGridViewportRect();
          if (!rect) return { x: 0, y: 0 };
          const s = gridScalePx();
          return {
            x: (sx - rect.width / 2 - gridViewport.panX) / s,
            y: -((sy - rect.height / 2 - gridViewport.panY) / s)
          };
        }

        function screenToCell(sx, sy){
          const w = gridScreenToWorld(sx, sy);
          const c = nearestCell(w.x, w.y);
          return c;
        }

        function cellBoxWorld(x, y){
          return { left: x - 0.5, right: x + 0.5, bottom: y - 0.5, top: y + 0.5 };
        }

        function cellBoxToScreenRect(x, y){
          const b = cellBoxWorld(x, y);
          const p00 = gridWorldToScreen(b.left, b.bottom);
          const p11 = gridWorldToScreen(b.right, b.top);
          const minX = Math.min(p00.x, p11.x);
          const maxX = Math.max(p00.x, p11.x);
          const minY = Math.min(p00.y, p11.y);
          const maxY = Math.max(p00.y, p11.y);
          return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX)/2, cy: (minY + maxY)/2 };
        }

        function updateGridZoomLabel(){
          if (!gridZoomLabel) return;
          gridZoomLabel.textContent = Math.round(gridViewport.zoom * 100) + "%";
        }

        function fitGridToBounds(){
          const rect = getGridViewportRect();
          if (!rect || !gridVm?.bounds) return;
          const b = gridVm.bounds;
          const left = Number(b.minX) - 0.5;
          const right = Number(b.maxX) + 0.5;
          const bottom = Number(b.minY) - 0.5;
          const top = Number(b.maxY) + 0.5;
          const wWorld = Math.max(1e-6, right - left);
          const hWorld = Math.max(1e-6, top - bottom);
          const scale = Math.min(rect.width / wWorld, rect.height / hWorld) * 0.90;
          gridViewport.zoom = clampGridZoom(scale / gridCellSizeBasePx);
          gridViewport.panX = 0;
          gridViewport.panY = 0;
          updateGridZoomLabel();
          renderGridAll();
          renderGridRulers();
        }

        function resetGrid(){
          gridViewport.zoom = 1;
          gridViewport.panX = 0;
          gridViewport.panY = 0;
          gridViewport.followPlayer = false;
          updateGridZoomLabel();
          renderGridAll();
          renderGridRulers();
        }

        function renderGridAll(){
          if (!isGridActive()) return;
          if (!gridSvg || !gCells || !gGrid) return;
          const rect = getGridViewportRect();
          if (!rect) return;
          gridSvg.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);

          // Background + bounds tint (screen-space; keeps canvas readable)
          const b = gridVm?.bounds;
          const hasBounds = Boolean(b && [b.minX, b.maxX, b.minY, b.maxY].every((n) => Number.isFinite(Number(n))));
          const boundsRect = (() => {
            if (!hasBounds) return null;
            const left = Number(b.minX) - 0.5;
            const right = Number(b.maxX) + 0.5;
            const bottom = Number(b.minY) - 0.5;
            const top = Number(b.maxY) + 0.5;
            const p00 = gridWorldToScreen(left, bottom);
            const p11 = gridWorldToScreen(right, top);
            const x = Math.min(p00.x, p11.x);
            const y = Math.min(p00.y, p11.y);
            const w = Math.abs(p11.x - p00.x);
            const h = Math.abs(p11.y - p00.y);
            return { x, y, w, h };
          })();

          // Virtual grid (infinite logical coords, bounded rendering)
          function getVisibleGridBoundsFromViewport(bufferCells){
            const buf = Math.max(0, Math.min(6, Math.floor(Number(bufferCells) || 0)));
            const w00 = gridScreenToWorld(0, 0);
            const w11 = gridScreenToWorld(rect.width, rect.height);
            const visMinX = Math.min(w00.x, w11.x);
            const visMaxX = Math.max(w00.x, w11.x);
            const visMinY = Math.min(w00.y, w11.y);
            const visMaxY = Math.max(w00.y, w11.y);
            // grid lines are at (i + 0.5) edges; derive integer i range.
            let minGX = Math.floor(visMinX - 0.5) - buf;
            let maxGX = Math.ceil(visMaxX - 0.5) + buf;
            let minGY = Math.floor(visMinY - 0.5) - buf;
            let maxGY = Math.ceil(visMaxY - 0.5) + buf;
            // Ensure integers.
            minGX = Math.trunc(minGX); maxGX = Math.trunc(maxGX); minGY = Math.trunc(minGY); maxGY = Math.trunc(maxGY);
            if (![minGX, maxGX, minGY, maxGY].every(Number.isFinite)) return null;
            return { minGX, maxGX, minGY, maxGY };
          }

          function clampRenderedGridBounds(bounds, maxCellsPerAxis){
            const b0 = bounds;
            if (!b0) return null;
            const cap = Math.max(20, Math.min(320, Math.floor(Number(maxCellsPerAxis) || 160)));
            let { minGX, maxGX, minGY, maxGY } = b0;
            const w = maxGX - minGX + 1;
            const h = maxGY - minGY + 1;
            if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
            if (w <= cap && h <= cap) return b0;
            // Crop around viewport center to keep DOM stable.
            const centerW = gridScreenToWorld(rect.width / 2, rect.height / 2);
            const cx = Math.round(Number(centerW.x) - 0.5);
            const cy = Math.round(Number(centerW.y) - 0.5);
            const half = Math.floor(cap / 2);
            minGX = cx - half;
            maxGX = minGX + cap - 1;
            minGY = cy - half;
            maxGY = minGY + cap - 1;
            return { minGX, maxGX, minGY, maxGY, cropped: true };
          }

          const rawBounds = getVisibleGridBoundsFromViewport(3);
          const visBounds = clampRenderedGridBounds(rawBounds, 160);
          if (!visBounds) return;
          const minGX = visBounds.minGX;
          const maxGX = visBounds.maxGX;
          const minGY = visBounds.minGY;
          const maxGY = visBounds.maxGY;
          const gridParts = [];
          gridParts.push('<rect class="g-bg" x="0" y="0" width="' + rect.width.toFixed(2) + '" height="' + rect.height.toFixed(2) + '"></rect>');
          if (boundsRect) {
            gridParts.push(
              '<rect class="g-bounds" x="' +
                boundsRect.x.toFixed(2) +
                '" y="' +
                boundsRect.y.toFixed(2) +
                '" width="' +
                boundsRect.w.toFixed(2) +
                '" height="' +
                boundsRect.h.toFixed(2) +
                '"></rect>'
            );
          }
          const clipId = boundsRect ? "g-clip-bounds" : null;
          if (boundsRect && clipId) {
            gridParts.push('<defs><clipPath id="' + clipId + '"><rect x="' + boundsRect.x.toFixed(2) + '" y="' + boundsRect.y.toFixed(2) + '" width="' + boundsRect.w.toFixed(2) + '" height="' + boundsRect.h.toFixed(2) + '"></rect></clipPath></defs>');
          }

          // Outside-bounds grid (faint) first; base-bounds grid (strong) clipped on top.
          const faintLines = [];
          const strongLines = [];
          for (let x = minGX; x <= maxGX; x++){
            const gx = x + 0.5;
            const a = gridWorldToScreen(gx, minGY + 0.5);
            const z = gridWorldToScreen(gx, maxGY + 0.5);
            const major = x % 5 === 0;
            const line =
              '<line class="' +
                (major ? "g-grid-major" : "g-grid-minor") +
                '" x1="' +
                a.x.toFixed(2) +
                '" y1="' +
                a.y.toFixed(2) +
                '" x2="' +
                z.x.toFixed(2) +
                '" y2="' +
                z.y.toFixed(2) +
                '" />';
            faintLines.push(line);
            strongLines.push(line);
          }
          for (let y = minGY; y <= maxGY; y++){
            const gy = y + 0.5;
            const a = gridWorldToScreen(minGX + 0.5, gy);
            const z = gridWorldToScreen(maxGX + 0.5, gy);
            const major = y % 5 === 0;
            const line =
              '<line class="' +
                (major ? "g-grid-major" : "g-grid-minor") +
                '" x1="' +
                a.x.toFixed(2) +
                '" y1="' +
                a.y.toFixed(2) +
                '" x2="' +
                z.x.toFixed(2) +
                '" y2="' +
                z.y.toFixed(2) +
                '" />';
            faintLines.push(line);
            strongLines.push(line);
          }
          gridParts.push('<g class="g-grid-outside" opacity="0.45">' + faintLines.join("") + "</g>");
          if (boundsRect && clipId) gridParts.push('<g clip-path="url(#' + clipId + ')">' + strongLines.join("") + "</g>");
          else gridParts.push(strongLines.join(""));
          gGrid.innerHTML = gridParts.join("");

          // cells (no text)
          const parts = [];
          for (const c of gridVm.cells || []) {
            const terrainId = String(c.terrainId || "");
            const kind = String(c.kind || "");
            const terrainClass = String(c.terrainClass || "");
            const isInactive =
              !terrainId ||
              kind === "boundary" ||
              terrainClass === "terrain-boundary";
            if (isInactive) continue;
            const r = cellBoxToScreenRect(c.x, c.y);
            parts.push('<rect class="g-cell ' + String(c.terrainClass || "") + '" x="' + r.x.toFixed(2) + '" y="' + r.y.toFixed(2) + '" width="' + r.w.toFixed(2) + '" height="' + r.h.toFixed(2) + '" fill="currentColor" />');
          }
          gCells.innerHTML = parts.join("");

          // boundary (from vector rings)
          if (gBoundary && vectorVm?.regions) {
            const bParts = [];
            for (const r of vectorVm.regions) {
              if (!r || r.renderKind === "line") continue;
              const rings = r.rings || [];
              for (const ring of rings) {
                if (!ring || ring.length < 3) continue;
                const d = ring.map((p, i) => {
                  const s = gridWorldToScreen(Number(p.x), Number(p.y));
                  return (i === 0 ? "M" : "L") + s.x.toFixed(2) + " " + s.y.toFixed(2);
                }).join(" ") + " Z";
                bParts.push('<path d="' + d + '"></path>');
              }
            }
            gBoundary.innerHTML = bParts.join("");
          }

          // semantic zones / masks (grid mode must stay in SVG coord space)
          if (gZones) {
            const zParts = [];
            // Rect zones (bounds / inferred / areaSpec semantic rects)
            for (const z of (semanticVm?.semanticRectsWorld ?? [])) {
              if (!z) continue;
              const minX = Number(z.minX);
              const maxX = Number(z.maxX);
              const minY = Number(z.minY);
              const maxY = Number(z.maxY);
              if (![minX, maxX, minY, maxY].every(Number.isFinite)) continue;
              const p00 = gridWorldToScreen(minX - 0.5, minY - 0.5);
              const p11 = gridWorldToScreen(maxX + 0.5, maxY + 0.5);
              const x = Math.min(p00.x, p11.x);
              const y = Math.min(p00.y, p11.y);
              const w = Math.abs(p11.x - p00.x);
              const h = Math.abs(p11.y - p00.y);
              const kind = String(z.kind ?? "");
              zParts.push(
                '<rect class="g-zone g-zone-' +
                  escapeHtmlRuntime(kind || "semantic") +
                  '" x="' +
                  x.toFixed(2) +
                  '" y="' +
                  y.toFixed(2) +
                  '" width="' +
                  w.toFixed(2) +
                  '" height="' +
                  h.toFixed(2) +
                  '" rx="8" ry="8"></rect>'
              );
            }
            // Cell-fills (route/hazard inference)
            for (const it of (semanticVm?.semanticCellFillsWorld ?? [])) {
              if (!it) continue;
              const x = Number(it.x);
              const y = Number(it.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
              const rr = cellBoxToScreenRect(x, y);
              const kind = String(it.kind ?? "");
              zParts.push(
                '<rect class="g-zone-cell g-zone-cell-' +
                  escapeHtmlRuntime(kind || "semantic") +
                  '" x="' +
                  rr.x.toFixed(2) +
                  '" y="' +
                  rr.y.toFixed(2) +
                  '" width="' +
                  rr.w.toFixed(2) +
                  '" height="' +
                  rr.h.toFixed(2) +
                  '" rx="6" ry="6"></rect>'
              );
            }
            gZones.innerHTML = zParts.join("");
          }

          // landmark radius circles (implemented locations; detect radius)
          if (gRadius) {
            const rParts = [];
            for (const c of (semanticVm?.semanticCirclesWorld ?? [])) {
              if (!c) continue;
              const x = Number(c.x);
              const y = Number(c.y);
              const rCells = Number(c.rCells);
              if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(rCells) || rCells <= 0) continue;
              const s = gridWorldToScreen(x, y);
              const rPx = rCells * gridScalePx();
              rParts.push(
                '<circle class="g-radius-circle" cx="' +
                  s.x.toFixed(2) +
                  '" cy="' +
                  s.y.toFixed(2) +
                  '" r="' +
                  rPx.toFixed(2) +
                  '"></circle>'
              );
            }
            gRadius.innerHTML = rParts.join("");
          }

          // markers (grid mode: semantic markers must be SVG, not HTML overlay)
          if (gMarkers) {
            const mParts = [];
            for (const m of (semanticVm?.semanticMarkers ?? [])) {
              if (!m) continue;
              const id = String(m.id ?? "").trim();
              if (!id) continue;
              const x = Number(m.x);
              const y = Number(m.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
              const label = String(m.label ?? id);
              const kind = String(m.kind ?? "semantic_point");
              const goto = m.gotoMapId ? String(m.gotoMapId) : "";
              const s = gridWorldToScreen(x, y);
              mParts.push(
                '<g class="g-marker g-marker-' +
                  escapeHtmlRuntime(kind) +
                  '" data-landmark-id="' +
                  escapeHtmlRuntime(id) +
                  '" data-marker-kind="' +
                  escapeHtmlRuntime(kind) +
                  '" data-x="' +
                  escapeHtmlRuntime(x) +
                  '" data-y="' +
                  escapeHtmlRuntime(y) +
                  '" data-goto-map-id="' +
                  escapeHtmlRuntime(goto) +
                  '" transform="translate(' +
                  s.x.toFixed(2) +
                  ' ' +
                  s.y.toFixed(2) +
                  ')">' +
                  '<circle class="g-marker-ring" r="10"></circle>' +
                  '<circle class="g-marker-dot" r="4.2"></circle>' +
                  '<circle class="g-marker-hit" r="16" fill="rgba(0,0,0,0)" data-preview-action="select-landmark"></circle>' +
                  "</g>"
              );
            }
            gMarkers.innerHTML = mParts.join("");
          }

          // labels (SVG text; position must track SVG viewBox)
          if (gLabels) {
            const tParts = [];
            // Marker labels
            for (const m of (semanticVm?.semanticMarkers ?? [])) {
              if (!m) continue;
              const id = String(m.id ?? "").trim();
              if (!id) continue;
              const x = Number(m.x);
              const y = Number(m.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
              const label = String(m.label ?? id);
              const kind = String(m.kind ?? "semantic_point");
              const s = gridWorldToScreen(x, y);
              tParts.push(
                '<text class="g-label g-marker-label g-marker-label-' +
                  escapeHtmlRuntime(kind) +
                  '" x="' +
                  (s.x + 14).toFixed(2) +
                  '" y="' +
                  (s.y - 8).toFixed(2) +
                  '">' +
                  escapeHtmlRuntime(label) +
                  "</text>"
              );
            }
            // Floating semantic labels (route/hazard/common)
            for (const l of (semanticVm?.floatingLabelsWorld ?? [])) {
              if (!l) continue;
              const x = Number(l.x);
              const y = Number(l.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
              const dx = Number(l.dx ?? 0);
              const dy = Number(l.dy ?? 0);
              const s = gridWorldToScreen(x + dx, y + dy);
              const text = String(l.text ?? "");
              if (!text) continue;
              const kind = String(l.kind ?? "");
              tParts.push(
                '<text class="g-label g-zone-label g-zone-label-' +
                  escapeHtmlRuntime(kind || "semantic") +
                  '" x="' +
                  s.x.toFixed(2) +
                  '" y="' +
                  s.y.toFixed(2) +
                  '">' +
                  escapeHtmlRuntime(text) +
                  "</text>"
              );
            }
            gLabels.innerHTML = tParts.join("");
          }

          // hover / selected overlays
          if (gHover) {
            const hc = gridViewport.hoverCell;
            if (hc) {
              const rr = cellBoxToScreenRect(hc.x, hc.y);
              gHover.innerHTML =
                '<rect class="g-hover-cell" x="' +
                rr.x.toFixed(2) +
                '" y="' +
                rr.y.toFixed(2) +
                '" width="' +
                rr.w.toFixed(2) +
                '" height="' +
                rr.h.toFixed(2) +
                '"></rect>';
            } else gHover.innerHTML = "";
          }
          if (gSelected) {
            const sc = gridViewport.selectedCell;
            if (sc) {
              const rr = cellBoxToScreenRect(sc.x, sc.y);
              gSelected.innerHTML =
                '<rect class="g-selected-cell" x="' +
                rr.x.toFixed(2) +
                '" y="' +
                rr.y.toFixed(2) +
                '" width="' +
                rr.w.toFixed(2) +
                '" height="' +
                rr.h.toFixed(2) +
                '"></rect>';
            } else gSelected.innerHTML = "";
          }
        }

        function renderGridRulers(){
          if (!gridVm || !gridVm.bounds) { warnOnce("grid_rulers_no_bounds", "renderGridRulers skipped: missing bounds"); return; }
          if (!rulerLeft || !rulerBottom || !viewportEl) { warnOnce("grid_rulers_no_dom", "renderGridRulers skipped: missing ruler DOM"); return; }
          const rect = viewportEl.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) return;
          const w00 = gridScreenToWorld(0, 0);
          const w11 = gridScreenToWorld(rect.width, rect.height);
          // Ensure bounds are always represented on rulers after fit (mode isolation contract),
          // while still allowing ticks beyond bounds if the user pans out.
          const minX = Math.min(Math.min(w00.x, w11.x), Number(gridVm.bounds.minX));
          const maxX = Math.max(Math.max(w00.x, w11.x), Number(gridVm.bounds.maxX));
          const minY = Math.min(Math.min(w00.y, w11.y), Number(gridVm.bounds.minY));
          const maxY = Math.max(Math.max(w00.y, w11.y), Number(gridVm.bounds.maxY));
          const pxPerWorldUnit = gridScalePx();
          const rawStep = 80 / Math.max(1e-6, pxPerWorldUnit);
          const step = niceIntegerStep(rawStep);

          const xTicks = [];
          const xTickSet = new Set();
          const xStart = Math.floor(minX / step) * step;
          for (let x = xStart; x <= maxX + 1e-9; x += step) {
            const p = gridWorldToScreen(x, 0);
            const left = p.x;
            xTicks.push('<div class="ruler-line" style="left:' + left + 'px; top:0; width:1px; height:10px;"></div>');
            xTicks.push('<div class="ruler-tick" style="left:' + (left + 3) + 'px; top:12px;">' + formatTick(x) + '</div>');
            xTickSet.add(formatTick(x));
          }
          // Always include integer bounds tick labels.
          for (const bx of [Number(gridVm.bounds.minX), Number(gridVm.bounds.maxX)]) {
            const label = formatTick(bx);
            if (xTickSet.has(label)) continue;
            const p = gridWorldToScreen(bx, 0);
            const left = p.x;
            xTicks.push('<div class="ruler-line" style="left:' + left + 'px; top:0; width:1px; height:10px;"></div>');
            xTicks.push('<div class="ruler-tick" style="left:' + (left + 3) + 'px; top:12px;">' + label + '</div>');
            xTickSet.add(label);
          }
          rulerBottom.innerHTML = xTicks.join("");
          let xCursor = document.getElementById("preview-ruler-x-cursor");
          if (!xCursor) {
            xCursor = document.createElement("div");
            xCursor.id = "preview-ruler-x-cursor";
            xCursor.className = "preview-ruler-cursor-line preview-ruler-cursor-line--x";
            xCursor.setAttribute("aria-hidden", "true");
          }
          rulerBottom.appendChild(xCursor);

          const yTicks = [];
          const yTickSet = new Set();
          const yStart = Math.floor(minY / step) * step;
          for (let y = yStart; y <= maxY + 1e-9; y += step) {
            const p = gridWorldToScreen(0, y);
            const top = p.y;
            yTicks.push('<div class="ruler-line" style="left:0; top:' + top + 'px; width:10px; height:1px;"></div>');
            yTicks.push('<div class="ruler-tick" style="left:12px; top:' + (top - 8) + 'px;">' + formatTick(y) + '</div>');
            yTickSet.add(formatTick(y));
          }
          for (const by of [Number(gridVm.bounds.minY), Number(gridVm.bounds.maxY)]) {
            const label = formatTick(by);
            if (yTickSet.has(label)) continue;
            const p = gridWorldToScreen(0, by);
            const top = p.y;
            yTicks.push('<div class="ruler-line" style="left:0; top:' + top + 'px; width:10px; height:1px;"></div>');
            yTicks.push('<div class="ruler-tick" style="left:12px; top:' + (top - 8) + 'px;">' + label + '</div>');
            yTickSet.add(label);
          }
          rulerLeft.innerHTML = yTicks.join("");
          let yCursor = document.getElementById("preview-ruler-y-cursor");
          if (!yCursor) {
            yCursor = document.createElement("div");
            yCursor.id = "preview-ruler-y-cursor";
            yCursor.className = "preview-ruler-cursor-line preview-ruler-cursor-line--y";
            yCursor.setAttribute("aria-hidden", "true");
          }
          rulerLeft.appendChild(yCursor);
        }

        function renderVectorRulers(){
          return renderRulers();
        }

        function renderActiveRulers(){
          if (isGridModeActive()) return renderGridRulers();
          return renderVectorRulers();
        }

        // --- Vector lookup indices (for hover/click) ---
        const cellByKey = new Map();
        if (gridVm && Array.isArray(gridVm.cells)) {
          for (const c of gridVm.cells) cellByKey.set(String(c.x) + "," + String(c.y), c);
        }
        const regionByCellKey = new Map();
        if (vectorVm && Array.isArray(vectorVm.regions)) {
          for (const r of vectorVm.regions) {
            for (const c of r.cells ?? []) {
              regionByCellKey.set(String(c.x) + "," + String(c.y), r);
            }
          }
        }

        function nearestCell(wx, wy){
          const x = Math.round(wx);
          const y = Math.round(wy);
          return { x, y, key: String(x) + "," + String(y) };
        }

        ${renderBlueprintRuntimeScript({ terrainOptions })}

        function hitTestNodeAtScreen(sx, sy){
          const nodes = vectorVm?.mapNodes ?? [];
          let best = null;
          let bestD = Infinity;
          for (const n of nodes) {
            const p = worldToScreen(Number(n.x), Number(n.y));
            const d = Math.hypot(p.x - sx, p.y - sy);
            if (d < bestD) { bestD = d; best = { n, d }; }
          }
          if (best && bestD <= 14) return best;
          return null;
        }

        function isRealMapEntryNode(node){
          const mapId = node && (node.mapId ?? node.gotoMapId ?? node.targetMapId ?? node.destinationMapId ?? node.linkedMapId);
          return Boolean(String(mapId ?? "").trim());
        }
        function getEntryNodeDisplayLabel(node){
          const short = String(node?.shortLabel ?? "").trim();
          if (short) return short.length > 6 ? short.slice(0, 6) : short;
          const title = String(node?.label ?? node?.title ?? node?.name ?? "").trim();
          const chinese = (title.match(/[\u4e00-\u9fff]{2,8}/) || [])[0];
          if (chinese) return chinese.slice(0, 6);
          const mapId = String(node?.gotoMapId ?? node?.mapId ?? "").trim();
          if (!mapId) return "";
          const cleaned = mapId.replace(/^(west2_|south1_|old_)/, "").replaceAll("_", "");
          return cleaned.slice(0, 6);
        }

        function entryFootprintNum(v){
          const n = Number(v);
          return Number.isFinite(n) ? n : NaN;
        }

        function expandBoundsToWorldEdges(b){
          const minX = Number(b.minX), maxX = Number(b.maxX), minY = Number(b.minY), maxY = Number(b.maxY);
          if (![minX, maxX, minY, maxY].every((x) => Number.isFinite(x))) return null;
          const allInt = [minX, maxX, minY, maxY].every((x) => Math.round(x) === x);
          if (allInt) {
            return {
              minX: Math.min(minX, maxX) - 0.5,
              maxX: Math.max(minX, maxX) + 0.5,
              minY: Math.min(minY, maxY) - 0.5,
              maxY: Math.max(minY, maxY) + 0.5
            };
          }
          return {
            minX: Math.min(minX, maxX),
            maxX: Math.max(minX, maxX),
            minY: Math.min(minY, maxY),
            maxY: Math.max(minY, maxY)
          };
        }

        /**
         * 仅用于预览：按优先级推导真实地图入口覆盖范围（不使用 detectRadius 作为填充范围）。
         */
        function buildEntryNodeFootprint(node){
          if (!isRealMapEntryNode(node)) return null;
          const nx = Number(node.x), ny = Number(node.y);
          if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;

          if (Array.isArray(node.cells) && node.cells.length) {
            const cells = [];
            for (const c of node.cells) {
              if (!c || typeof c !== "object") continue;
              const cx = Math.round(Number(c.x)), cy = Math.round(Number(c.y));
              if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
              cells.push({ x: cx, y: cy });
            }
            if (cells.length) {
              return { type: "cells", cells, detail: cells.length + "格", uiDetail: "覆盖范围：" + cells.length + "格" };
            }
          }

          const fp = node.footprint;
          if (fp && typeof fp === "object" && Array.isArray(fp.rings) && fp.rings.length) {
            const rings = fp.rings.filter((r) => Array.isArray(r) && r.length >= 3);
            if (rings.length) return { type: "rings", rings, detail: "多边形", uiDetail: "覆盖范围：多边形" };
          }
          if (Array.isArray(fp) && fp.length >= 3 && fp[0] && fp[0].x != null && fp[0].y != null) {
            const ring = fp.map((p) => ({ x: Number(p.x), y: Number(p.y) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
            if (ring.length >= 3) return { type: "rings", rings: [ring], detail: "多边形", uiDetail: "覆盖范围：多边形" };
          }

          const br = node.bounds ? expandBoundsToWorldEdges(node.bounds) : null;
          if (br) return { type: "rect", ...br, detail: "矩形", uiDetail: "覆盖范围：矩形" };

          const ar = node.area && typeof node.area === "object" ? expandBoundsToWorldEdges(node.area) : null;
          if (ar) return { type: "rect", ...ar, detail: "矩形", uiDetail: "覆盖范围：矩形（area）" };

          const rad = entryFootprintNum(node.radius);
          if (rad > 0) return { type: "circle", cx: nx, cy: ny, r: rad, detail: "半径 " + rad, uiDetail: "覆盖范围：半径 " + rad };

          const er = entryFootprintNum(node.enterRadius);
          if (er > 0) return { type: "circle", cx: nx, cy: ny, r: er, detail: "enterRadius " + er, uiDetail: "覆盖范围：enterRadius " + er };

          const cx = Math.round(nx), cy = Math.round(ny);
          return { type: "cell", cx, cy, detail: "1格（预览 fallback）", uiDetail: "覆盖范围：1格（预览 fallback）" };
        }

        function entryFootprintHoverLine(spec){
          if (!spec) return "";
          if (spec.type === "cell") return "范围: 1格";
          if (spec.type === "circle") return "范围: r=" + spec.r;
          if (spec.type === "cells") return "范围: " + spec.cells.length + "格";
          if (spec.type === "rect") return "范围: 矩形";
          if (spec.type === "rings") return "范围: 多边形";
          return "";
        }

        function renderEntryFootprints(){
          if (!layerEntryFootprint || !vectorVm) return "";
          function escAttr(s){
            return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
          }
          function ws(wx, wy){
            return worldToScreen(Number(wx), Number(wy));
          }
          function pathRingWorld(ring){
            if (!ring || ring.length < 3) return "";
            const parts = [];
            for (let i = 0; i < ring.length; i++){
              const p = ring[i];
              const s = ws(Number(p.x), Number(p.y));
              parts.push((i === 0 ? "M" : "L") + s.x.toFixed(3) + " " + s.y.toFixed(3));
            }
            parts.push("Z");
            return parts.join("");
          }
          function pathCellWorld(ix, iy){
            const x0 = ix - 0.5, x1 = ix + 0.5, y0 = iy - 0.5, y1 = iy + 0.5;
            const p00 = ws(x0, y0), p10 = ws(x1, y0), p11 = ws(x1, y1), p01 = ws(x0, y1);
            return (
              "M " + p00.x.toFixed(3) + " " + p00.y.toFixed(3) +
              " L " + p10.x.toFixed(3) + " " + p10.y.toFixed(3) +
              " L " + p11.x.toFixed(3) + " " + p11.y.toFixed(3) +
              " L " + p01.x.toFixed(3) + " " + p01.y.toFixed(3) +
              " Z"
            );
          }
          function pathCellWorldFromRect(minX, maxX, minY, maxY){
            const x0 = Math.min(minX, maxX), x1 = Math.max(minX, maxX);
            const y0 = Math.min(minY, maxY), y1 = Math.max(minY, maxY);
            const p00 = ws(x0, y0), p10 = ws(x1, y0), p11 = ws(x1, y1), p01 = ws(x0, y1);
            return (
              "M " + p00.x.toFixed(3) + " " + p00.y.toFixed(3) +
              " L " + p10.x.toFixed(3) + " " + p10.y.toFixed(3) +
              " L " + p11.x.toFixed(3) + " " + p11.y.toFixed(3) +
              " L " + p01.x.toFixed(3) + " " + p01.y.toFixed(3) +
              " Z"
            );
          }
          const pieces = [];
          for (const n of vectorVm.mapNodes ?? []) {
            if (!isRealMapEntryNode(n)) continue;
            const spec = buildEntryNodeFootprint(n);
            if (!spec) continue;
            const nid = escAttr(String(n.id ?? ""));
            if (spec.type === "circle") {
              const s = ws(spec.cx, spec.cy);
              const rr = spec.r * cameraState.scale;
              pieces.push(
                '<circle class="preview-entry-footprint" vector-effect="non-scaling-stroke" cx="' +
                  s.x.toFixed(3) +
                  '" cy="' +
                  s.y.toFixed(3) +
                  '" r="' +
                  rr.toFixed(3) +
                  '" data-entry-node-id="' +
                  nid +
                  '" />'
              );
            } else if (spec.type === "cell") {
              const d = pathCellWorld(spec.cx, spec.cy);
              pieces.push('<path class="preview-entry-footprint" vector-effect="non-scaling-stroke" d="' + escAttr(d) + '" data-entry-node-id="' + nid + '" />');
            } else if (spec.type === "cells") {
              const d = spec.cells.map((c) => pathCellWorld(c.x, c.y)).join(" ");
              pieces.push('<path class="preview-entry-footprint" vector-effect="non-scaling-stroke" d="' + escAttr(d) + '" data-entry-node-id="' + nid + '" />');
            } else if (spec.type === "rect") {
              const d = pathCellWorldFromRect(spec.minX, spec.maxX, spec.minY, spec.maxY);
              pieces.push('<path class="preview-entry-footprint" vector-effect="non-scaling-stroke" d="' + escAttr(d) + '" data-entry-node-id="' + nid + '" />');
            } else if (spec.type === "rings") {
              const d = spec.rings.map(pathRingWorld).join("");
              if (d) pieces.push('<path class="preview-entry-footprint" vector-effect="non-scaling-stroke" d="' + escAttr(d) + '" data-entry-node-id="' + nid + '" />');
            }
          }
          return pieces.join("");
        }

        function setHoverTooltip({ sx, sy, wx, wy, hitId, terrainLabel }){
          if (!hoverTip) return;
          const x = Math.round(wx);
          const y = Math.round(wy);
          const id = hitId ? String(hitId) : "—";
          const tl = terrainLabel ? String(terrainLabel) : "—";
          const line1 = "(x: " + x + ", y: " + y + ")";
          const line2 = "地貌: " + tl;
          const line3 = "ID: " + (id.length > 34 ? (id.slice(0, 32) + "…") : id);
          hoverTip.textContent = [line1, line2, line3].join("\\n");
          hoverTip.hidden = false;
          const pad = 12;
          hoverTip.style.left = Math.round(sx + pad) + "px";
          hoverTip.style.top = Math.round(sy + pad) + "px";
        }

        function hideHoverTooltip(){
          if (!hoverTip) return;
          hoverTip.hidden = true;
        }

        function hidePreviewPointerOverlay(){
          document.getElementById("preview-pointer-dot")?.classList.remove("is-visible");
          document.getElementById("preview-ruler-x-cursor")?.classList.remove("is-visible");
          document.getElementById("preview-ruler-y-cursor")?.classList.remove("is-visible");
        }

        function updateVectorPointerOverlay(event){
          if (!isPreviewCameraReady()) return;
          if (!viewportEl) return;
          const rect = viewportEl.getBoundingClientRect();
          const sx = event.clientX - rect.left;
          const sy = event.clientY - rect.top;
          const inside = sx >= 0 && sy >= 0 && sx <= rect.width && sy <= rect.height;
          if (!inside) { hidePreviewPointerOverlay(); return; }
          const pointerDotEl = document.getElementById("preview-pointer-dot");
          const rulerXCursorEl = document.getElementById("preview-ruler-x-cursor");
          const rulerYCursorEl = document.getElementById("preview-ruler-y-cursor");
          if (pointerDotEl) {
            pointerDotEl.style.left = sx + "px";
            pointerDotEl.style.top = sy + "px";
            pointerDotEl.classList.add("is-visible");
          }
          // Ruler cursor lines align to nearest cell center (integer world), not raw pointer.
          const w = screenToWorld(sx, sy);
          if (w) {
            const cell = nearestCell(w.x, w.y);
            const sxSnap = worldToScreen(Number(cell.x), 0).x;
            const sySnap = worldToScreen(0, Number(cell.y)).y;
            if (rulerXCursorEl) { rulerXCursorEl.style.left = sxSnap + "px"; rulerXCursorEl.classList.add("is-visible"); }
            if (rulerYCursorEl) { rulerYCursorEl.style.top = sySnap + "px"; rulerYCursorEl.classList.add("is-visible"); }
          } else {
            if (rulerXCursorEl) { rulerXCursorEl.style.left = sx + "px"; rulerXCursorEl.classList.add("is-visible"); }
            if (rulerYCursorEl) { rulerYCursorEl.style.top = sy + "px"; rulerYCursorEl.classList.add("is-visible"); }
          }
        }

        function updateGridPointerOverlay(event){
          if (!viewportEl) return;
          const rect = viewportEl.getBoundingClientRect();
          const sx = event.clientX - rect.left;
          const sy = event.clientY - rect.top;
          const inside = sx >= 0 && sy >= 0 && sx <= rect.width && sy <= rect.height;
          if (!inside) { hidePreviewPointerOverlay(); return; }
          const pointerDotEl = document.getElementById("preview-pointer-dot");
          const rulerXCursorEl = document.getElementById("preview-ruler-x-cursor");
          const rulerYCursorEl = document.getElementById("preview-ruler-y-cursor");
          if (pointerDotEl) {
            pointerDotEl.style.left = sx + "px";
            pointerDotEl.style.top = sy + "px";
            pointerDotEl.classList.add("is-visible");
          }
          const c = screenToCell(sx, sy);
          const sxSnap = gridWorldToScreen(Number(c.x), 0).x;
          const sySnap = gridWorldToScreen(0, Number(c.y)).y;
          if (rulerXCursorEl) { rulerXCursorEl.style.left = sxSnap + "px"; rulerXCursorEl.classList.add("is-visible"); }
          if (rulerYCursorEl) { rulerYCursorEl.style.top = sySnap + "px"; rulerYCursorEl.classList.add("is-visible"); }
        }

        function updatePreviewPointerOverlay(event){
          if (isGridModeActive()) return updateGridPointerOverlay(event);
          return updateVectorPointerOverlay(event);
        }

        function selectPreviewTarget(hit){
          if (!hit) return;
          if (hit.kind === "node" || hit.kind === "cell") {
            selectCell(hit.x, hit.y);
            return;
          }
        }

        function updateViewportSize(){
          if (!viewportEl || !svgEl) return false;
          const rect = viewportEl.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) return false;
          cameraState.viewportWidth = rect.width;
          cameraState.viewportHeight = rect.height;
          svgEl.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
          return true;
        }

        function niceIntegerStep(rawStep){
          // Ruler tick labels must be integers (cell centers).
          // Choose from 1/2/5 * 10^k, but never below 1.
          if (!(rawStep > 0) || !Number.isFinite(rawStep)) return 1;
          const candidates = [1, 2, 5, 10, 20, 50, 100];
          for (const c of candidates) {
            if (c >= rawStep - 1e-9) return c;
          }
          const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
          const n = rawStep / pow;
          let base = 1;
          if (n <= 1) base = 1;
          else if (n <= 2) base = 2;
          else if (n <= 5) base = 5;
          else base = 10;
          return Math.max(1, Math.round(base * pow));
        }

        function formatTick(v){
          if (!Number.isFinite(v)) return "—";
          const eps = 1e-9;
          if (Math.abs(v - Math.round(v)) < eps) return String(Math.round(v));
          return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "");
        }

        function computeMapScreenBounds(){
          if (!vectorVm || !Array.isArray(vectorVm.regions)) return null;
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const r of vectorVm.regions) {
            for (const ring of r.rings ?? []) {
              for (const p of ring ?? []) {
                if (!p) continue;
                const s = worldToScreen(Number(p.x), Number(p.y));
                if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
                minX = Math.min(minX, s.x);
                maxX = Math.max(maxX, s.x);
                minY = Math.min(minY, s.y);
                maxY = Math.max(maxY, s.y);
              }
            }
          }
          if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) return null;
          return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY, cx: (minX + maxX)/2, cy: (minY + maxY)/2 };
        }

        function renderVectorMap(){
          if (!isPreviewCameraReady()) return false;
          if (!updateViewportSize()) return false;
          if (!layerGrid || !layerFill || !layerBoundary || !layerTerrainSymbols || !layerRouteSemantics || !layerEntryFootprint || !layerLines || !layerLabels || !layerNodes) return false;
          // Clear layers
          layerGrid.innerHTML = "";
          layerFill.innerHTML = "";
          layerBoundary.innerHTML = "";
          layerTerrainSymbols.innerHTML = "";
          layerRouteSemantics.innerHTML = "";
          layerEntryFootprint.innerHTML = "";
          layerLines.innerHTML = "";
          layerLabels.innerHTML = "";
          layerNodes.innerHTML = "";

          function esc(s){ return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"); }
          function pathFromRingScreen(ring){
            if (!ring || ring.length < 3) return "";
            const parts = [];
            for (let i=0;i<ring.length;i++){
              const p = ring[i];
              const s = worldToScreen(Number(p.x), Number(p.y));
              parts.push((i===0?"M":"L") + s.x.toFixed(3) + " " + s.y.toFixed(3));
            }
            parts.push("Z");
            return parts.join(" ");
          }

          // Coordinate contract:
          // - integer (x,y) are cell centers
          // - cell box edges are (x±0.5, y±0.5)
          // Grid overlay represents cell boundaries: draw at n+0.5.
          const w00 = screenToWorld(0, 0);
          const w11 = screenToWorld(cameraState.viewportWidth, cameraState.viewportHeight);
          const visMinX = Math.min(w00.x, w11.x);
          const visMaxX = Math.max(w00.x, w11.x);
          const visMinY = Math.min(w00.y, w11.y);
          const visMaxY = Math.max(w00.y, w11.y);

          const minWX = Math.floor(visMinX - 0.5);
          const maxWX = Math.ceil(visMaxX - 0.5);
          const minWY = Math.floor(visMinY - 0.5);
          const maxWY = Math.ceil(visMaxY - 0.5);
          const gridParts = [];
          for (let x=minWX; x<=maxWX+1e-9; x+=1){
            const gx = x + 0.5;
            const a = worldToScreen(gx, minWY + 0.5);
            const z = worldToScreen(gx, maxWY + 0.5);
            const major = Math.abs(Math.round(x)) % 5 === 0;
            const op = major ? 0.70 : 0.42;
            gridParts.push('<line x1="' + a.x + '" y1="' + a.y + '" x2="' + z.x + '" y2="' + z.y + '" stroke="var(--preview-grid-line)" stroke-opacity="' + op + '" stroke-width="1" vector-effect="non-scaling-stroke" />');
          }
          for (let y=minWY; y<=maxWY+1e-9; y+=1){
            const gy = y + 0.5;
            const a = worldToScreen(minWX + 0.5, gy);
            const z = worldToScreen(maxWX + 0.5, gy);
            const major = Math.abs(Math.round(y)) % 5 === 0;
            const op = major ? 0.70 : 0.42;
            gridParts.push('<line x1="' + a.x + '" y1="' + a.y + '" x2="' + z.x + '" y2="' + z.y + '" stroke="var(--preview-grid-line)" stroke-opacity="' + op + '" stroke-width="1" vector-effect="non-scaling-stroke" />');
          }
          layerGrid.innerHTML = gridParts.join("");

          // Regions
          const fillParts = [];
          const strokeParts = [];
          for (const r of vectorVm.regions){
            if (!r || r.renderKind === "line") continue;
            const d = (r.rings ?? []).map(pathFromRingScreen).join(" ");
            if (!d) continue;
            const st = resolveTerrainVectorStyleRuntime(r.terrainId, terrainDefById.get(String(r.terrainId || "")) || null) || null;
            const fill = st && st.fill ? String(st.fill) : "rgb(240,240,240)";
            const fillOpacity = st && Number.isFinite(Number(st.fillOpacity)) ? Number(st.fillOpacity) : 0.30;
            const stroke = st && st.stroke ? String(st.stroke) : "var(--preview-boundary)";
            const strokeOpacity = st && Number.isFinite(Number(st.strokeOpacity)) ? Number(st.strokeOpacity) : 0.55;
            const strokeWidth = st && Number.isFinite(Number(st.strokeWidth)) ? Number(st.strokeWidth) : 1.4;
            const dash = (st && typeof st.strokeDasharray === "string" && st.strokeDasharray.trim())
              ? st.strokeDasharray.trim()
              : (r.renderKind === "hazard_band" ? "6 4" : "");

            fillParts.push(
              '<path class="v-region-fill" data-region-id="' + esc(r.id) + '" data-terrain-id="' + esc(r.terrainId) +
              '" d="' + esc(d) + '" fill="' + esc(fill) + '" fill-opacity="' + String(fillOpacity) + '" />'
            );
            strokeParts.push(
              '<path class="v-region-stroke" data-region-id="' + esc(r.id) + '" d="' + esc(d) + '" fill="none" stroke="' + esc(stroke) +
                '" stroke-opacity="' + String(strokeOpacity) + '"' +
                '" stroke-width="' + String(strokeWidth) + '" vector-effect="non-scaling-stroke"' +
                (dash ? ' stroke-dasharray="' + dash + '"' : "") +
                " />"
            );
          }
          layerFill.innerHTML = fillParts.join("");
          layerBoundary.innerHTML = strokeParts.join("");

          // Terrain symbol overlay (visual aid; non-interactive)
          (function renderTerrainSymbols(){
            const parts = [];
            function pushMarkerDots(screenCells){
              for (const p of screenCells) {
                parts.push('<circle class="v-terrain-symbol v-terrain-symbol--marker-dot" cx="' + p.x.toFixed(2) + '" cy="' + p.y.toFixed(2) + '" r="1.25" fill="rgba(255,255,255,0.92)" stroke="rgba(18,44,74,0.60)" stroke-width="0.8" vector-effect="non-scaling-stroke" />');
              }
            }
            function pushCrackSlashes(screenCells){
              for (const p of screenCells) {
                const x0 = p.x - 2.6, y0 = p.y - 1.8, x1 = p.x + 2.6, y1 = p.y + 1.8;
                const x2 = p.x - 2.2, y2 = p.y + 2.1, x3 = p.x + 2.2, y3 = p.y - 2.1;
                parts.push('<line class="v-terrain-symbol v-terrain-symbol--crack" x1="' + x0.toFixed(2) + '" y1="' + y0.toFixed(2) + '" x2="' + x1.toFixed(2) + '" y2="' + y1.toFixed(2) + '" stroke="rgba(240,252,255,0.88)" stroke-width="1.4" stroke-dasharray="2 3" vector-effect="non-scaling-stroke" />');
                parts.push('<line class="v-terrain-symbol v-terrain-symbol--crack" x1="' + x2.toFixed(2) + '" y1="' + y2.toFixed(2) + '" x2="' + x3.toFixed(2) + '" y2="' + y3.toFixed(2) + '" stroke="rgba(12,20,32,0.55)" stroke-width="1.2" stroke-dasharray="3 4" vector-effect="non-scaling-stroke" />');
              }
            }
            function pushWarningHatch(screenCells){
              for (const p of screenCells) {
                const x0 = p.x - 3.2, y0 = p.y + 2.8, x1 = p.x + 3.2, y1 = p.y - 2.8;
                parts.push('<line class="v-terrain-symbol v-terrain-symbol--hatch" x1="' + x0.toFixed(2) + '" y1="' + y0.toFixed(2) + '" x2="' + x1.toFixed(2) + '" y2="' + y1.toFixed(2) + '" stroke="rgba(232,252,255,0.72)" stroke-width="1.2" stroke-dasharray="1 3" vector-effect="non-scaling-stroke" />');
              }
            }

            for (const r of vectorVm.regions){
              if (!r || r.renderKind === "line") continue;
              const st = resolveTerrainVectorStyleRuntime(r.terrainId, terrainDefById.get(String(r.terrainId || "")) || null) || null;
              const kind = st && st.symbolKind ? String(st.symbolKind) : "";
              if (!kind) continue;
              // Use sparse sampling to avoid DOM explosion: 1/4 cells, capped.
              const cells = Array.isArray(r.cells) ? r.cells : [];
              if (!cells.length) continue;
              const screenCells = [];
              for (let i = 0; i < cells.length && screenCells.length < 1400; i++) {
                const c = cells[i];
                if (!c) continue;
                if ((i % 4) !== 0) continue;
                const s = worldToScreen(Number(c.x), Number(c.y));
                if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
                screenCells.push(s);
              }
              if (kind === "marker_dots") pushMarkerDots(screenCells);
              else if (kind === "crack_slashes") pushCrackSlashes(screenCells);
              else if (kind === "warning_hatch") pushWarningHatch(screenCells);
            }

            layerTerrainSymbols.innerHTML = parts.join("");
          })();

          // --- Route semantics overlay (flagged_marker_line only) ---
          (function renderRouteSemantics(){
            // Contract tokens (for static checks)
            const markerPost = "markerPost";
            const routeSegment = "routeSegment";
            void markerPost; void routeSegment;

            const ROUTE_STROKE_WIDTH = 2.2;
            const ROUTE_STROKE_OPACITY = 0.88;
            // Less "road centerline", more "guidance corridor"
            const ROUTE_DASH = "14 12";
            const POST_FILL = "rgba(240,252,255,0.88)";
            const POST_STROKE = "rgba(18,44,74,0.46)";

            const flagged = [];
            if (gridVm && Array.isArray(gridVm.cells)) {
              for (const c of gridVm.cells) {
                if (!c) continue;
                if (String(c.terrainId || "") === "flagged_marker_line") flagged.push({ x: Number(c.x), y: Number(c.y) });
              }
            }
            if (!flagged.length) { layerRouteSemantics.innerHTML = ""; return; }

            const set = new Set(flagged.map((c) => String(c.x) + "," + String(c.y)));
            function key(x, y){ return String(x) + "," + String(y); }
            function centerScreen(x, y){
              return worldToScreen(Number(x), Number(y));
            }
            const parts = [];

            // Degree map for junction emphasis
            const deg = new Map();
            for (const c of flagged) {
              const k = key(c.x, c.y);
              let d = 0;
              if (set.has(key(c.x + 1, c.y))) d++;
              if (set.has(key(c.x - 1, c.y))) d++;
              if (set.has(key(c.x, c.y + 1))) d++;
              if (set.has(key(c.x, c.y - 1))) d++;
              deg.set(k, d);
            }

            // A0) occupancy outlines per flagged cell (primary recognition: "grid corridor", not a polyline)
            (function renderFlaggedCellOutlines(){
              const out = [];
              const inset = 3.0;
              for (const c of flagged) {
                const p00 = worldToScreen(Number(c.x) - 0.5, Number(c.y) - 0.5);
                const p11 = worldToScreen(Number(c.x) + 0.5, Number(c.y) + 0.5);
                const minX = Math.min(p00.x, p11.x);
                const maxX = Math.max(p00.x, p11.x);
                const minY = Math.min(p00.y, p11.y);
                const maxY = Math.max(p00.y, p11.y);
                const w = maxX - minX;
                const h = maxY - minY;
                if (!(w > 0) || !(h > 0)) continue;
                const k = key(c.x, c.y);
                const isJunction = (deg.get(k) ?? 0) >= 3;
                const x = (minX + inset).toFixed(2);
                const y = (minY + inset).toFixed(2);
                const ww = Math.max(0, w - inset * 2).toFixed(2);
                const hh = Math.max(0, h - inset * 2).toFixed(2);
                out.push('<rect class="v-route-cell-outline' + (isJunction ? ' v-route-cell-outline--junction' : '') + '" x="' + x + '" y="' + y + '" width="' + ww + '" height="' + hh + '" rx="3" ry="3"></rect>');
              }
              // Put outlines below the guidance strokes/posts but still inside route layer.
              if (out.length) parts.push(out.join(""));
            })();

            // A) per-cell guidance strokes (avoid one long "road" polyline feel)
            const segOpacity = ROUTE_STROKE_OPACITY * 0.52;
            const segWidth = ROUTE_STROKE_WIDTH * 0.64;
            for (const c of flagged) {
              const a = centerScreen(c.x, c.y);
              const hasE = set.has(key(c.x + 1, c.y));
              const hasW = set.has(key(c.x - 1, c.y));
              const hasN = set.has(key(c.x, c.y + 1));
              const hasS = set.has(key(c.x, c.y - 1));
              // Prefer horizontal guidance; fallback vertical.
              let x0 = a.x, y0 = a.y, x1 = a.x, y1 = a.y;
              const L = 7.5;
              if (hasE || hasW) { x0 = a.x - L; x1 = a.x + L; }
              else if (hasN || hasS) { y0 = a.y - L; y1 = a.y + L; }
              else { x0 = a.x - L * 0.7; x1 = a.x + L * 0.7; }
              parts.push(
                '<line class="v-route-seg" data-route-kind="' + routeSegment + '" x1="' + x0.toFixed(2) + '" y1="' + y0.toFixed(2) +
                '" x2="' + x1.toFixed(2) + '" y2="' + y1.toFixed(2) +
                '" stroke="rgba(228, 252, 255, 0.90)" stroke-opacity="' + String(segOpacity) +
                '" stroke-width="' + String(segWidth) +
                '" stroke-dasharray="' + ROUTE_DASH + '" vector-effect="non-scaling-stroke" />'
              );
            }

            // B) marker posts at cell centers
            // Reduce density: place posts every 3 cells; emphasize junctions (deg>=3).
            for (let i = 0; i < flagged.length; i++) {
              const c = flagged[i];
              const k = key(c.x, c.y);
              const d = deg.get(k) ?? 0;
              const isJunction = d >= 3;
              const keep = isJunction || (i % 3 === 0);
              if (!keep) continue;
              const p = centerScreen(c.x, c.y);
              const r0 = isJunction ? 2.6 : 1.8;
              const tick = isJunction ? 4.4 : 3.4;
              parts.push(
                '<circle class="v-route-post" data-route-kind="' + markerPost + '" cx="' + p.x.toFixed(2) + '" cy="' + p.y.toFixed(2) +
                '" r="' + String(r0) + '" fill="' + POST_FILL + '" stroke="' + POST_STROKE + '" stroke-width="0.9" vector-effect="non-scaling-stroke" />'
              );
              // tiny vertical tick to read as "post"
              parts.push(
                '<line class="v-route-post-tick" x1="' + p.x.toFixed(2) + '" y1="' + (p.y - tick).toFixed(2) +
                '" x2="' + p.x.toFixed(2) + '" y2="' + (p.y + tick).toFixed(2) +
                '" stroke="rgba(240,252,255,0.86)" stroke-width="' + (isJunction ? "1.5" : "1.2") + '" stroke-opacity="' + (isJunction ? "0.95" : "0.82") + '" vector-effect="non-scaling-stroke" />'
              );
            }

            layerRouteSemantics.innerHTML = parts.join("");
          })();

          layerEntryFootprint.innerHTML = renderEntryFootprints();

          // Lines
          const lineParts = [];
          for (const l of (vectorVm.lineFeatures ?? [])){
            const pts = (l.points ?? []).map((p) => {
              const s = worldToScreen(Number(p.x), Number(p.y));
              return s.x.toFixed(2) + " " + s.y.toFixed(2);
            }).join(" ");
            if (!pts) continue;
            lineParts.push('<polyline class="v-line" data-terrain-id="' + esc(l.terrainId) + '" points="' + esc(pts) + '" fill="none" stroke="var(--preview-line)" stroke-width="2.0" vector-effect="non-scaling-stroke" stroke-dasharray="3 5" />');
          }
          layerLines.innerHTML = lineParts.join("");

          // Labels (component-level; density-controlled; Chinese label only; collision limited)
          const labelParts = [];
          function estimateLabelWidthPx(text){
            const t = String(text || "");
            let w = 0;
            for (const ch of t) w += /[\u4e00-\u9fff]/.test(ch) ? 12 : 7;
            return Math.min(140, Math.max(34, w));
          }
          function resolveTerrainLabelText(region){
            const t = String(region?.terrainLabel ?? "").trim();
            if (t && t !== String(region?.terrainId ?? "").trim()) return t;
            const s = String(region?.terrainShortLabel ?? "").trim();
            // Fallback must not surface raw ids like "sea_ic"/"blue_i".
            return (s && /[\u4e00-\u9fff]/.test(s)) ? s : "未知地貌";
          }
          function resolveTerrainLabelPriority(terrainId){
            const id = String(terrainId ?? "").trim();
            if (!id) return 99;
            // P2 hard blockers / hazard
            if (id === "ice_shelf_edge" || id === "tide_crack_zone" || id === "crevasse_field" || id === "ice_cliff_coast") return 2;
            // P3 main route
            if (id === "flagged_marker_line" || id === "managed_compacted_route") return 3;
            // P4 key terrains
            if (id === "ice_shelf_surface" || id === "sea_ice_fast" || id === "rock_outcrop_nunatak" || id === "dry_valley_rock_desert") return 4;
            // P5 background
            if (id === "wind_packed_snow" || id === "loose_snowfield" || id === "snow_drift_zone" || id === "sastrugi_field") return 5;
            return 6;
          }
          function isSmallRegionHidden(area, prio){
            const n = Number(area || 0);
            if (!(n > 0)) return true;
            // hard blockers/hazards: show if >=2, else hide
            if (prio <= 2) return n < 2;
            // routes/key terrains: hide tiny specks
            if (prio <= 4) return n < 3;
            // normal background: hide if <4
            return n < 4;
          }
          function rectsOverlap(a, b){
            return !(a.x2 <= b.x1 || a.x1 >= b.x2 || a.y2 <= b.y1 || a.y1 >= b.y2);
          }

          const svgHasBlueprint = (typeof blueprintState === "object" && blueprintState && (blueprintState.enabled || blueprintState.layerCreated));
          const baseLabelCap = svgHasBlueprint ? 12 : 18;
          const CAP = baseLabelCap;

          const candidates = [];
          for (const r of vectorVm.regions){
            if (!r || r.renderKind === "line" || !r.anchor) continue;
            const tid = String(r.terrainId ?? "").trim();
            const prio = resolveTerrainLabelPriority(tid);
            const area = Array.isArray(r.cells) ? r.cells.length : 0;
            if (isSmallRegionHidden(area, prio)) continue;
            const text = resolveTerrainLabelText(r);
            if (!text) continue;
            candidates.push({ r, text, prio, area });
          }
          candidates.sort((a, b) => (a.prio - b.prio) || (b.area - a.area));

          const placed = [];
          let placedCount = 0;
          for (const it of candidates){
            if (placedCount >= CAP) break;
            const r = it.r;
            const label = it.text;

            // Prefer bbox from cells (center integers -> edges ±0.5).
            let minCX = Infinity, maxCX = -Infinity, minCY = Infinity, maxCY = -Infinity;
            const cells = Array.isArray(r.cells) ? r.cells : [];
            for (const c of cells) {
              if (!c) continue;
              const cx = Number(c.x), cy = Number(c.y);
              if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
              minCX = Math.min(minCX, cx);
              maxCX = Math.max(maxCX, cx);
              minCY = Math.min(minCY, cy);
              maxCY = Math.max(maxCY, cy);
            }
            const haveBox = Number.isFinite(minCX) && Number.isFinite(maxCX) && Number.isFinite(minCY) && Number.isFinite(maxCY);
            const boxWorld = haveBox ? { left: minCX - 0.5, right: maxCX + 0.5, bottom: minCY - 0.5, top: maxCY + 0.5 } : null;
            const boxScreen = boxWorld ? (() => {
              const p00 = worldToScreen(boxWorld.left, boxWorld.bottom);
              const p11 = worldToScreen(boxWorld.right, boxWorld.top);
              return { w: Math.abs(p11.x - p00.x), h: Math.abs(p11.y - p00.y) };
            })() : null;

            const a = worldToScreen(Number(r.anchor.x), Number(r.anchor.y));
            const wPx = estimateLabelWidthPx(label) + 18; // padding
            const hPx = 22;
            const narrow = boxScreen ? (boxScreen.w < 78 || boxScreen.h < 38 || (boxScreen.w / Math.max(1, boxScreen.h)) > 2.8) : false;

            let lx = a.x;
            let ly = a.y;
            let leader = "";
            if (narrow) {
              lx = a.x + 42;
              ly = a.y - 28;
              lx = Math.max(16 + wPx/2, Math.min(cameraState.viewportWidth - 16 - wPx/2, lx));
              ly = Math.max(16 + hPx/2, Math.min(cameraState.viewportHeight - 16 - hPx/2, ly));
              leader = '<line class="v-label-leader" x1="' + a.x.toFixed(2) + '" y1="' + a.y.toFixed(2) + '" x2="' + lx.toFixed(2) + '" y2="' + ly.toFixed(2) + '" />';
            }

            const pad = 4;
            const box = { x1: lx - wPx/2 - pad, y1: ly - hPx/2 - pad, x2: lx + wPx/2 + pad, y2: ly + hPx/2 + pad, prio: it.prio };
            let blocked = false;
            for (const b of placed) {
              if (!rectsOverlap(box, b)) continue;
              blocked = true;
              break;
            }
            if (blocked) continue;
            placed.push(box);
            placedCount++;

            const rx = (lx - wPx/2).toFixed(2);
            const ry = (ly - hPx/2).toFixed(2);
            labelParts.push(
              leader +
              '<g class="v-label-chip" data-region-id="' + esc(r.id) + '">' +
              '<rect x="' + rx + '" y="' + ry + '" width="' + wPx.toFixed(2) + '" height="' + hPx.toFixed(2) + '"></rect>' +
              '<text x="' + lx.toFixed(2) + '" y="' + ly.toFixed(2) + '">' + esc(label) + '</text>' +
              '</g>'
            );
          }
          layerLabels.innerHTML = labelParts.join("");

          // Nodes (screen coords; fixed px radii)
          const nodeParts = [];
          for (const n of (vectorVm.mapNodes ?? [])){
            const s = worldToScreen(Number(n.x), Number(n.y));
            const mapId = String(n.gotoMapId ?? n.mapId ?? "").trim();
            const isEntry = Boolean(mapId);
            nodeParts.push(
              '<g class="preview-node' + (isEntry ? ' preview-node--entry' : '') + '" data-node-id="' + esc(n.id) + '" data-map-id="' + esc(mapId) + '">' +
              '<circle class="preview-hit-node" cx="' + s.x + '" cy="' + s.y + '" r="' + (isEntry ? 16 : 14) + '" fill="rgba(0,0,0,0)" data-preview-action="select-vector-node" data-hit-kind="node" data-hit-id="' + esc(n.id) + '" data-hit-x="' + esc(n.x) + '" data-hit-y="' + esc(n.y) + '"></circle>' +
              (isEntry
                ? (
                  '<circle class="preview-node-entry-outer" cx="' + s.x + '" cy="' + s.y + '" r="10" fill="none" stroke="var(--preview-entry-ring)" stroke-width="2" vector-effect="non-scaling-stroke"></circle>' +
                  '<circle class="preview-node-entry-inner-glow" cx="' + s.x + '" cy="' + s.y + '" r="8" fill="none" stroke="var(--preview-entry-inner-glow)" stroke-width="6" vector-effect="non-scaling-stroke"></circle>' +
                  '<circle class="preview-node-entry-core" cx="' + s.x + '" cy="' + s.y + '" r="4" fill="var(--preview-entry-core)" stroke="var(--preview-entry-core-stroke)" stroke-width="1" vector-effect="non-scaling-stroke"></circle>'
                )
                : (
                  '<circle class="v-node-glow" cx="' + s.x + '" cy="' + s.y + '" r="10"></circle>' +
                  '<circle class="v-node-dot" cx="' + s.x + '" cy="' + s.y + '" r="5"></circle>'
                )
              ) +
              "</g>"
            );
          }
          layerNodes.innerHTML = nodeParts.join("");

          // Keep blueprint overlay in same viewport lifecycle:
          // base layers are screen-projected each render; blueprint must re-project too.
          try { if (typeof requestBlueprintOverlayRender === "function") requestBlueprintOverlayRender("viewport_changed"); } catch {}

          return true;
        }

        function renderRulers(){
          if (!gridVm || !gridVm.bounds) { warnOnce("rulers_no_bounds", "renderRulers skipped: missing bounds"); return; }
          if (!rulerLeft || !rulerBottom || !viewportEl) { warnOnce("rulers_no_dom", "renderRulers skipped: missing ruler DOM"); return; }
          const rect = viewportEl.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) { warnOnce("rulers_bad_rect", "renderRulers skipped: bad viewport rect"); return; }
          cameraState.viewportWidth = rect.width;
          cameraState.viewportHeight = rect.height;
          const w00 = screenToWorld(0, 0);
          const w11 = screenToWorld(rect.width, rect.height);
          const minX = Math.min(w00.x, w11.x);
          const maxX = Math.max(w00.x, w11.x);
          const minY = Math.min(w00.y, w11.y);
          const maxY = Math.max(w00.y, w11.y);

          const pxPerWorldUnit = cameraState.scale;
          const rawStep = 80 / pxPerWorldUnit;
          const step = niceIntegerStep(rawStep);

          const xTicks = [];
          const xStart = Math.floor(minX / step) * step;
          for (let x = xStart; x <= maxX + 1e-9; x += step) {
            const p = worldToScreen(x, 0);
            const left = p.x;
            xTicks.push('<div class="ruler-line" style="left:' + left + 'px; top:0; width:1px; height:10px;"></div>');
            xTicks.push('<div class="ruler-tick" style="left:' + (left + 3) + 'px; top:12px;">' + formatTick(x) + '</div>');
          }
          rulerBottom.innerHTML = xTicks.join("");
          // keep pointer overlay line mounted even when we redraw ticks
          let xCursor = document.getElementById("preview-ruler-x-cursor");
          if (!xCursor) {
            xCursor = document.createElement("div");
            xCursor.id = "preview-ruler-x-cursor";
            xCursor.className = "preview-ruler-cursor-line preview-ruler-cursor-line--x";
            xCursor.setAttribute("aria-hidden", "true");
          }
          rulerBottom.appendChild(xCursor);

          const yTicks = [];
          const yStart = Math.floor(minY / step) * step;
          for (let y = yStart; y <= maxY + 1e-9; y += step) {
            const p = worldToScreen(0, y);
            const top = p.y;
            yTicks.push('<div class="ruler-line" style="left:0; top:' + top + 'px; width:10px; height:1px;"></div>');
            yTicks.push('<div class="ruler-tick" style="left:12px; top:' + (top - 8) + 'px;">' + formatTick(y) + '</div>');
          }
          rulerLeft.innerHTML = yTicks.join("");
          let yCursor = document.getElementById("preview-ruler-y-cursor");
          if (!yCursor) {
            yCursor = document.createElement("div");
            yCursor.id = "preview-ruler-y-cursor";
            yCursor.className = "preview-ruler-cursor-line preview-ruler-cursor-line--y";
            yCursor.setAttribute("aria-hidden", "true");
          }
          rulerLeft.appendChild(yCursor);
        }

        function renderDebugMetrics(){
          const pre = document.getElementById("debug-metrics");
          if (!pre) return;
          if (isGridModeActive()) { pre.textContent = ""; return; }
          const rect = viewportEl.getBoundingClientRect();
          const vpW = rect.width, vpH = rect.height;
          const topLeft = screenToWorld(0, 0);
          const bottomRight = screenToWorld(vpW, vpH);
          const vMinX = Math.min(topLeft.x, bottomRight.x);
          const vMaxX = Math.max(topLeft.x, bottomRight.x);
          const vMinY = Math.min(topLeft.y, bottomRight.y);
          const vMaxY = Math.max(topLeft.y, bottomRight.y);
          const mapB = computeMapScreenBounds();
          const shortSide = Math.min(vpW, vpH);
          const mapShort = mapB ? Math.min(mapB.width, mapB.height) : NaN;
          const ratio = mapB && shortSide > 0 ? (mapShort / shortSide) : NaN;

          const selected = (() => {
            const coordText = (panel && panel.querySelector('[data-field="coord"]')?.textContent) || "";
            const m = String(coordText).match(/\(\s*([-0-9]+)\s*,\s*([-0-9]+)\s*\)/);
            if (!m) return null;
            const x = Number(m[1]), y = Number(m[2]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
            return { x, y };
          })();
          const hoverCell = (() => {
            const h = screenToWorld(vpW / 2, vpH / 2);
            if (!h) return null;
            const c = nearestCell(h.x, h.y);
            return { x: Number(c.x), y: Number(c.y) };
          })();
          const cellBoxWorld = (x, y) => ({ left: x - 0.5, right: x + 0.5, bottom: y - 0.5, top: y + 0.5 });
          const boxToScreen = (b) => {
            const p00 = worldToScreen(b.left, b.bottom);
            const p11 = worldToScreen(b.right, b.top);
            return { minX: Math.min(p00.x, p11.x), maxX: Math.max(p00.x, p11.x), minY: Math.min(p00.y, p11.y), maxY: Math.max(p00.y, p11.y) };
          };

          const xLabels = Array.from(rulerBottom?.querySelectorAll(".ruler-tick") ?? []).slice(0, 14).map((n) => n.textContent).filter(Boolean);
          const yLabels = Array.from(rulerLeft?.querySelectorAll(".ruler-tick") ?? []).slice(0, 14).map((n) => n.textContent).filter(Boolean);
          const hasNegX = xLabels.some((t) => /^-/.test(String(t).trim()));
          const hasNegY = yLabels.some((t) => /^-/.test(String(t).trim()));

          const errors = [];
          if (!(ratio >= 0.70)) errors.push("FAIL: shortSideCoverageRatio < 0.70");
          if (!hasNegX) errors.push("FAIL: xTickLabels 缺少负数");
          if (!hasNegY) errors.push("FAIL: yTickLabels 缺少负数");
          if (!(vMinX <= -8 && vMaxX >= 8 && vMinY <= -8 && vMaxY >= 8)) errors.push("FAIL: visibleWorldRange 未覆盖 [-8,8]");
          if (mapB) {
            const dx = Math.abs(mapB.cx - vpW/2);
            const dy = Math.abs(mapB.cy - vpH/2);
            if (Math.max(dx, dy) > 8) errors.push("FAIL: mapScreenBounds 中心偏离 viewport center > 8px");
          } else {
            errors.push("FAIL: computeMapScreenBounds 无法计算（无 ring 点？）");
          }

          pre.textContent = [
            "viewportWidth=" + vpW.toFixed(2) + " viewportHeight=" + vpH.toFixed(2),
            "fitScale(baseScale)=" + cameraState.baseScale.toFixed(6),
            "scale=" + cameraState.scale.toFixed(6) + " minScale=" + cameraState.minScale.toFixed(6) + " maxScale=" + cameraState.maxScale.toFixed(6),
            "offsetX=" + cameraState.offsetX.toFixed(3) + " offsetY=" + cameraState.offsetY.toFixed(3),
            "visibleWorldRange: x:[" + vMinX.toFixed(3) + "," + vMaxX.toFixed(3) + "] y:[" + vMinY.toFixed(3) + "," + vMaxY.toFixed(3) + "]",
            "selectedCell=" + (selected ? "(" + selected.x + "," + selected.y + ")" : "—"),
            "selectedCellCenterWorld=" + (selected ? "(" + selected.x + "," + selected.y + ")" : "—"),
            "selectedCellBoxWorld=" + (selected ? JSON.stringify(cellBoxWorld(selected.x, selected.y)) : "—"),
            "selectedCellCenterScreen=" + (selected ? JSON.stringify(worldToScreen(selected.x, selected.y)) : "—"),
            "selectedCellBoxScreen=" + (selected ? JSON.stringify(boxToScreen(cellBoxWorld(selected.x, selected.y))) : "—"),
            "rulerLocatorCell=" + (hoverCell ? "(" + hoverCell.x + "," + hoverCell.y + ")" : "—"),
            "xTickLabels(sample)=" + JSON.stringify(xLabels.slice(0, 10)),
            "yTickLabels(sample)=" + JSON.stringify(yLabels.slice(0, 10)),
            "mapScreenBounds=" + (mapB ? JSON.stringify({ minX:+mapB.minX.toFixed(2), maxX:+mapB.maxX.toFixed(2), minY:+mapB.minY.toFixed(2), maxY:+mapB.maxY.toFixed(2), width:+mapB.width.toFixed(2), height:+mapB.height.toFixed(2), cx:+mapB.cx.toFixed(2), cy:+mapB.cy.toFixed(2) }) : "null"),
            "mapShortSideCoverageRatio=" + (Number.isFinite(ratio) ? ratio.toFixed(4) : "NaN"),
            "errors=" + JSON.stringify(errors)
          ].join("\\n");
        }

        function renderVectorAll(){
          if (!isPreviewCameraReady()) return;
          if (!updateViewportSize()) return;
          renderVectorMap();
          renderVectorRulers();
          renderDebugMetrics();
        }

        function renderActivePreview(){
          if (isGridModeActive()) {
            renderGridAll();
            renderGridRulers();
            return;
          }
          renderVectorAll();
        }

        function renderAll(){
          // Back-compat: all callers now render active mode only.
          renderActivePreview();
        }

        function resetCameraToDefault(){
          cameraState.scale = cameraState.baseScale;
          cameraState.offsetX = cameraState.baseOffsetX;
          cameraState.offsetY = cameraState.baseOffsetY;
          renderAll();
        }

        function fitToBounds(){
          if (!gridVm || !gridVm.bounds) { warnOnce("fit_no_bounds", "fitToBounds skipped: missing bounds"); return false; }
          if (!viewportEl || !svgEl) { warnOnce("fit_no_dom", "fitToBounds skipped: missing viewport/svg"); return false; }
          const rect = viewportEl.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) { warnOnce("fit_bad_rect", "fitToBounds skipped: bad viewport rect"); return false; }
          const pad = 20;
          const visibleMinX = gridVm.bounds.minX - 0.5;
          const visibleMaxX = gridVm.bounds.maxX + 0.5;
          const visibleMinY = gridVm.bounds.minY - 0.5;
          const visibleMaxY = gridVm.bounds.maxY + 0.5;
          const worldWidth = visibleMaxX - visibleMinX;
          const worldHeight = visibleMaxY - visibleMinY;
          const fitScale = Math.min((rect.width - pad*2) / worldWidth, (rect.height - pad*2) / worldHeight);
          cameraState.baseScale = fitScale;
          cameraState.minScale = fitScale * 0.25;
          cameraState.maxScale = fitScale * 8;
          cameraState.scale = clampScale(fitScale);
          const worldCenterX = (visibleMinX + visibleMaxX) / 2;
          const worldCenterY = (visibleMinY + visibleMaxY) / 2;
          cameraState.offsetX = rect.width / 2 - worldCenterX * cameraState.scale;
          cameraState.offsetY = rect.height / 2 + worldCenterY * cameraState.scale;
          cameraState.baseOffsetX = cameraState.offsetX;
          cameraState.baseOffsetY = cameraState.offsetY;
          renderAll();
          return true;
        }

        function ensureLayerOn(layer){
          const cls = "layer-" + layer + "-off";
          if (document.body.classList.contains(cls)) document.body.classList.remove(cls);
          const btn = document.querySelector('.layer-toggle[data-layer="' + layer + '"]');
          if (btn) { btn.classList.add("is-on"); btn.classList.remove("is-off"); }
        }

        function scrollToSelector(sel){
          if (!sel) return;
          const el = document.querySelector(sel);
          if (!el) return;
          el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        }

        function selectCell(x, y){
          // Grid mode: legacy HTML cell grid may be removed; selection must still update right panel.
          if (!gridVm || !Array.isArray(gridVm.cells)) return;
          try { window.activateSidebarTab?.("cell"); } catch {}
          showCellByCoord(Number(x), Number(y));
        }

        function selectMarker(id){
          const gridSel = '.g-marker[data-landmark-id="' + id + '"]';
          const htmlSel = '.semantic-marker[data-landmark-id="' + id + '"]';
          const gridEl = document.querySelector(gridSel);
          const htmlEl = document.querySelector(htmlSel);
          ensureLayerOn("landmark");
          try { window.activateSidebarTab?.("cell"); } catch {}

          if (isGridModeActive() && gridEl) {
            const x = Number(gridEl.getAttribute("data-x"));
            const y = Number(gridEl.getAttribute("data-y"));
            if (Number.isFinite(x) && Number.isFinite(y)) {
              gridViewport.panX = -x * gridScalePx();
              gridViewport.panY = y * gridScalePx();
            }
            renderGridAll();
            renderGridRulers();
            showLandmarkFromGridMarker(gridEl);
            return;
          }

          if (htmlEl) {
            scrollToSelector(htmlSel);
            showLandmarkFromMarker(htmlEl);
          }
        }

        function clearHighlights(){
          gridEl?.querySelectorAll(".wilderness-cell.is-highlight").forEach((n) => n.classList.remove("is-highlight"));
        }

        function highlightTerrain(terrainId){
          if (!gridEl) return 0;
          clearHighlights();
          const nodes = gridEl.querySelectorAll('.wilderness-cell[data-terrain-id="' + terrainId + '"]');
          nodes.forEach((n) => n.classList.add("is-highlight"));
          return nodes.length;
        }

        // Detail helpers (purely in-page)
        const cellKinds = new Map();
        const implementedMarkers = [];
        if (semanticVm && Array.isArray(semanticVm.cellSemanticIndex)) {
          for (const it of semanticVm.cellSemanticIndex) {
            if (!it || typeof it.key !== "string") continue;
            cellKinds.set(it.key, Array.isArray(it.kinds) ? it.kinds : []);
          }
        }
        if (semanticVm && Array.isArray(semanticVm.semanticMarkers)) {
          for (const m of semanticVm.semanticMarkers) {
            if (m && m.kind === "implemented_location") implementedMarkers.push(m);
          }
        }

        function nearestImplemented(x, y) {
          if (!implementedMarkers.length) return null;
          let best = null;
          let bestD = Infinity;
          for (const m of implementedMarkers) {
            const dx = Number(m.x) - x;
            const dy = Number(m.y) - y;
            const d = Math.hypot(dx, dy);
            if (d < bestD) { bestD = d; best = m; }
          }
          return best ? { m: best, d: bestD } : null;
        }

        function showCellByCoord(x, y){
          const k = String(x) + "," + String(y);
          const c = isGridModeActive() ? gridCellByKey.get(k) : cellByKey.get(k);
          if (!c) return;
          clearNodeFields();
          setField("nodeType", String(c.nodeTypeLabel || c.previewKind || c.kind || "—"));
          setField("coord", "(" + c.x + ", " + c.y + ")");
          setField("terrainLabel", String(c.terrainLabel || "—"));
          setField("terrainId", String(c.terrainId || "—"));
          setField("passabilityLabel", String(c.passabilityLabel || "—"));
          setField("riskLabel", String(c.riskLabel || "—"));
          const kinds = cellKinds.get(String(c.x) + "," + String(c.y)) || [];
          setField("semanticKinds", kinds.length ? kinds.join(" / ") : "（无）");
          setField("semanticSource", semanticVm && semanticVm.sourceMode ? String(semanticVm.sourceMode) : "—");
          const near = nearestImplemented(Number(c.x), Number(c.y));
          if (near && near.d <= 4.0) {
            const goto = near.m.gotoMapId ? String(near.m.gotoMapId) : "—";
            setField("nearbyImplemented", String(near.m.label) + " · " + goto);
          } else {
            setField("nearbyImplemented", "附近无已实装地点");
          }
          setField("moveTimeMult", c.moveTimeMult == null ? "—" : String(c.moveTimeMult));
          setField("staminaCostMult", c.staminaCostMult == null ? "—" : String(c.staminaCostMult));
          setField("rescueDifficulty", c.rescueDifficulty == null ? "—" : String(c.rescueDifficulty));
          setField("sourceSummary", String(c.sourceSummary || "—"));
        }

        function showLandmarkFromMarker(btn){
          if (!btn) return;
          clearNodeFields();
          const label = btn.getAttribute("aria-label") || "—";
          const id = btn.getAttribute("data-landmark-id") || "—";
          const x = btn.getAttribute("data-x") || "—";
          const y = btn.getAttribute("data-y") || "—";
          const goto = btn.getAttribute("data-goto-map-id") || "";
          const kind = btn.getAttribute("data-marker-kind") || "semantic_point";
          setField("coord", "(" + x + ", " + y + ")");
          setField("terrainLabel", "（地标）" + label);
          setField("terrainId", "—");
          setField("passabilityLabel", "—");
          setField("riskLabel", "—");
          setField("semanticKinds", kind === "implemented_location" ? "已实装地点" : "区域语义 / 未实装落点");
          setField("semanticSource", semanticVm && semanticVm.sourceMode ? String(semanticVm.sourceMode) : "—");
          setField("nearbyImplemented", goto ? (label + " · " + goto) : "附近无已实装地点");
          setField("moveTimeMult", "—");
          setField("staminaCostMult", "—");
          setField("rescueDifficulty", "—");
          setField("sourceSummary", "地标 marker");
          // highlight marker
          document.querySelectorAll(".semantic-marker.is-selected").forEach((n) => n.classList.remove("is-selected"));
          btn.classList.add("is-selected");
        }

        function showLandmarkFromGridMarker(el){
          if (!el) return;
          clearNodeFields();
          const id = el.getAttribute("data-landmark-id") || "—";
          const x = el.getAttribute("data-x") || "—";
          const y = el.getAttribute("data-y") || "—";
          const goto = el.getAttribute("data-goto-map-id") || "";
          const kind = el.getAttribute("data-marker-kind") || "semantic_point";
          const marker = (semanticVm?.semanticMarkers ?? []).find((m) => String(m?.id ?? "") === String(id)) || null;
          const label = marker?.label != null ? String(marker.label) : String(id);

          setField("coord", "(" + x + ", " + y + ")");
          setField("terrainLabel", "（地标）" + label);
          setField("terrainId", "—");
          setField("passabilityLabel", "—");
          setField("riskLabel", "—");
          setField("semanticKinds", kind === "implemented_location" ? "已实装地点" : "区域语义 / 未实装落点");
          setField("semanticSource", semanticVm && semanticVm.sourceMode ? String(semanticVm.sourceMode) : "—");
          setField("nearbyImplemented", goto ? (label + " · " + goto) : "附近无已实装地点");
          setField("moveTimeMult", "—");
          setField("staminaCostMult", "—");
          setField("rescueDifficulty", "—");
          setField("sourceSummary", "SVG 地标 marker");
        }

        function normalize(s){ return String(s || "").trim().toLowerCase(); }
        function parseCoord(q){
          const m = String(q).trim().match(/^(-?\\d+)\\s*,\\s*(-?\\d+)$/);
          if (!m) return null;
          return { x: Number(m[1]), y: Number(m[2]) };
        }
        function parseKeyValue(q){
          const idx = q.indexOf(":");
          if (idx <= 0) return null;
          const k = q.slice(0, idx).trim();
          const v = q.slice(idx + 1).trim();
          if (!k || !v) return null;
          return { key: k, value: v };
        }

        function groupTitle(key){
          const map = {
            coordinate: "坐标结果",
            landmark: "地标结果",
            terrain: "地貌结果",
            semantic: "区域语义结果",
            field_name: "字段结果",
            field_value: "字段结果",
            audit: "审计问题结果"
          };
          return map[key] || "结果";
        }

        function renderGroups(groups){
          const parts = [];
          const keys = Object.keys(groups);
          if (!keys.length) {
            resultsEl.innerHTML = '<div class="muted">未找到匹配项。</div>';
            return;
          }
          for (const k of keys) {
            const items = groups[k];
            if (!items || !items.length) continue;
            parts.push('<div class="result-group"><div class="result-group-title">' + groupTitle(k) + ' <span class="muted">(' + items.length + ')</span></div>');
            parts.push('<div class="result-items">');
            for (const it of items.slice(0, 80)) {
              const data = encodeURIComponent(JSON.stringify(it));
              parts.push(
                '<button type="button" class="result-item" data-item="' + data + '" data-preview-action="select-search-result">' +
                '<div class="result-main"><strong>' + (it.summary || it.label || it.value) + '</strong></div>' +
                '<div class="result-sub muted">' + (it.detail || "") + '</div>' +
                '</button>'
              );
            }
            if (items.length > 80) parts.push('<div class="muted">（仅显示前 80 条）</div>');
            parts.push("</div></div>");
          }
          resultsEl.innerHTML = parts.join("");
        }

        function search(q){
          const query = String(q || "").trim();
          if (!query) {
            resultsEl.innerHTML = '<div class="muted">输入关键词开始搜索。</div>';
            clearHighlights();
            return;
          }
          const coord = parseCoord(query);
          const kv = parseKeyValue(query);
          const nq = normalize(query);
          const groups = {};

          function push(type, it){
            if (!groups[type]) groups[type] = [];
            groups[type].push(it);
          }

          if (coord) {
            const inside = coord.x >= gridVm.bounds.minX && coord.x <= gridVm.bounds.maxX && coord.y >= gridVm.bounds.minY && coord.y <= gridVm.bounds.maxY;
            if (!inside) {
              push("coordinate", { type:"coordinate", summary:"坐标不在当前区域范围内", detail:"bounds 内才会定位格子", x:coord.x, y:coord.y });
            } else {
              push("coordinate", { type:"coordinate", summary:"坐标 " + coord.x + "," + coord.y, detail:"点击定位到格子", x:coord.x, y:coord.y, targetSelector: '.wilderness-cell[data-x="' + coord.x + '"][data-y="' + coord.y + '"]' });
            }
            renderGroups(groups);
            return;
          }

          const entries = searchIndex && Array.isArray(searchIndex.entries) ? searchIndex.entries : [];
          for (const it of entries) {
            const t = String(it.type || "");
            const hay = (normalize(it.label) + " " + normalize(it.value) + " " + normalize(it.summary) + " " + normalize(it.detail));
            if (kv) {
              if (normalize(it.label) === normalize(kv.key) && normalize(it.value).includes(normalize(kv.value))) {
                push(t, it);
              }
            } else {
              if (hay.includes(nq)) push(t, it);
            }
          }
          renderGroups(groups);
        }

        function renderAudit(){
          if (!auditVm || !auditVm.summary) return;

          // Audit panel is optional in the 3-tab layout. If the audit DOM is not present,
          // do not throw; never block map rendering.
          const redCount = byId("audit-count-red");
          const yellowCount = byId("audit-count-yellow");
          const grayCount = byId("audit-count-gray");
          const redList = byId("audit-list-red");
          const yellowList = byId("audit-list-yellow");
          const grayList = byId("audit-list-gray");

          if (!redCount && !yellowCount && !grayCount && !redList && !yellowList && !grayList) {
            return;
          }

          if (redCount) redCount.textContent = String(auditVm.summary.red || 0);
          if (yellowCount) yellowCount.textContent = String(auditVm.summary.yellow || 0);
          if (grayCount) grayCount.textContent = String(auditVm.summary.gray || 0);

          function fill(host, items){
            if (!host) return;
            if (!items || !items.length) { host.innerHTML = '<div class="muted">（无）</div>'; return; }
            host.innerHTML = items.map((it) => {
              const data = encodeURIComponent(JSON.stringify(it));
              return '<button type="button" class="audit-item" data-audit="' + data + '" data-preview-action="select-audit-issue">' +
                     '<div class="audit-item-title"><strong>' + it.title + '</strong></div>' +
                     '<div class="audit-item-msg muted">' + it.message + '</div>' +
                     '</button>';
            }).join("");
          }
          fill(redList, auditVm.issues.red);
          fill(yellowList, auditVm.issues.yellow);
          fill(grayList, auditVm.issues.gray);
        }

        // Initial render
        renderAudit();
        search("");

        // Single event delegation
        document.addEventListener("click", function(event) {
          const target = event.target && event.target.closest ? event.target.closest("[data-preview-action]") : null;
          if (!target) return;
          event.preventDefault();
          event.stopPropagation();

          const action = target.dataset.previewAction;
          function activateSidebarTab(name){ try { window.activateSidebarTab?.(String(name || "")); } catch {} }
          // --- Right sidebar auto-switch (authoring UI only) ---
          const FILE_ACTIONS = new Set([
            "blueprint-export-compact",
            "blueprint-export-merge-preview",
            "blueprint-import-textarea",
            "blueprint-execute-patch",
            "blueprint-export-delta",
            "blueprint-apply-to-game",
            "blueprint-apply-expand-bounds",
            "blueprint-refresh-preview-from-game-files",
            "blueprint-open-snapshots",
            "blueprint-open-logs",
            "blueprint-logs-refresh",
            "blueprint-logs-clear-client",
            "blueprint-logs-clear-server",
            "blueprint-logs-copy",
            "blueprint-open-author-server"
          ]);
          const BLUEPRINT_ACTIONS = new Set([
            "toggle-blueprint-mode",
            "blueprint-create-layer",
            "blueprint-clear-layer",
            "blueprint-set-blend",
            "blueprint-set-tool"
          ]);
          if (FILE_ACTIONS.has(action)) {
            activateSidebarTab("workbench");
          } else if (BLUEPRINT_ACTIONS.has(action) || String(action || "").startsWith("blueprint-")) {
            activateSidebarTab("workbench");
          }

          if (typeof blueprintHandleAction === "function" && blueprintHandleAction(action, target)) {
            return;
          }
          if (action === "toggle-layer") {
            const layer = target.getAttribute("data-layer");
            if (!layer) return;
            const offClass = "layer-" + layer + "-off";
            const isOff = document.body.classList.toggle(offClass);
            target.classList.toggle("is-on", !isOff);
            target.classList.toggle("is-off", isOff);
            return;
          }
          if (action === "switch-tab") {
            const name = target.getAttribute("data-tab");
            if (!name) return;
            activateSidebarTab(name);
            return;
          }
          if (action === "collapse-sidebar") {
            document.body.classList.add("sidebar-collapsed");
            return;
          }
          if (action === "expand-sidebar") {
            document.body.classList.remove("sidebar-collapsed");
            return;
          }
          if (action === "clear-search") {
            if (input) input.value = "";
            search("");
            input?.focus();
            return;
          }
          if (action === "select-cell") {
            const x = target.getAttribute("data-x");
            const y = target.getAttribute("data-y");
            if (x == null || y == null) return;
            ensureLayerOn("terrain");
            selectCell(Number(x), Number(y));
            return;
          }
          if (action === "select-landmark") {
            const id = target.getAttribute("data-landmark-id");
            if (!id) return;
            ensureLayerOn("landmark");
            selectMarker(id);
            return;
          }
          if (action === "set-preview-mode") {
            const mode = target.getAttribute("data-preview-mode");
            if (!mode) return;
            const isVector = mode === "vector";
            currentPreviewMode = isVector ? "vector" : "grid";
            if (vectorHost) vectorHost.classList.toggle("is-active", isVector);
            if (gridHost) gridHost.classList.toggle("is-active", !isVector);
            document.querySelectorAll('.preview-view-tab[data-preview-action="set-preview-mode"]').forEach((b) => {
              const on = b.getAttribute("data-preview-mode") === mode;
              b.classList.toggle("is-active", on);
              b.setAttribute("aria-pressed", on ? "true" : "false");
            });
            if (!isVector) {
              // Auto-exit blueprint mode when switching away from vector.
              try { if (typeof toggleBlueprintMode === "function") toggleBlueprintMode(false, "已退出：切换到格点模式。"); } catch {}
              // Grid mode needs its own viewport fit.
              hideHoverTooltip();
              hidePreviewPointerOverlay();
              requestAnimationFrame(() => { fitGridToBounds(); renderGridAll(); renderGridRulers(); });
            } else {
              hideHoverTooltip();
              hidePreviewPointerOverlay();
              requestAnimationFrame(() => { fitToBounds(); renderVectorAll(); });
            }
            return;
          }
          if (action === "grid-zoom-in") {
            gridViewport.zoom = clampGridZoom(gridViewport.zoom * GRID_ZOOM_STEP);
            updateGridZoomLabel();
            renderGridAll();
            renderGridRulers();
            return;
          }
          if (action === "grid-zoom-out") {
            gridViewport.zoom = clampGridZoom(gridViewport.zoom / GRID_ZOOM_STEP);
            updateGridZoomLabel();
            renderGridAll();
            renderGridRulers();
            return;
          }
          if (action === "grid-fit") {
            fitGridToBounds();
            renderGridRulers();
            return;
          }
          if (action === "grid-reset") {
            resetGrid();
            renderGridRulers();
            return;
          }
          if (action === "grid-follow") {
            gridViewport.followPlayer = !gridViewport.followPlayer;
            target.setAttribute("aria-pressed", gridViewport.followPlayer ? "true" : "false");
            return;
          }
          if (action === "toggle-theme") {
            applyTheme(previewTheme === "dark" ? "light" : "dark");
            // theme only affects CSS; keep camera/fit/rulers as-is
            return;
          }
          if (action === "select-search-result") {
            const raw = target.getAttribute("data-item");
            if (!raw) return;
            let it = null;
            try { it = JSON.parse(decodeURIComponent(raw)); } catch { it = null; }
            if (!it) return;
            if (it.type === "coordinate" && it.x != null && it.y != null) {
              ensureLayerOn("terrain");
              selectCell(it.x, it.y);
              return;
            }
            if (it.type === "landmark" && it.value) {
              ensureLayerOn("landmark");
              selectMarker(it.value);
              return;
            }
            if (it.type === "terrain" && it.value) {
              ensureLayerOn("terrain");
              const n = highlightTerrain(it.value);
              setField("nearbyImplemented", "匹配地貌格数：" + n);
              if (it.x != null && it.y != null) selectCell(it.x, it.y);
              return;
            }
            if (it.targetSelector) scrollToSelector(it.targetSelector);
            return;
          }
          if (action === "select-audit-issue") {
            const raw = target.getAttribute("data-audit");
            if (!raw) return;
            let it = null;
            try { it = JSON.parse(decodeURIComponent(raw)); } catch { it = null; }
            if (!it || !it.target) return;
            if (it.target.selector) scrollToSelector(it.target.selector);
            return;
          }
        });

        // Expand button is outside sidebar; mark action via dataset at runtime if needed
        if (expandBtn && !expandBtn.dataset.previewAction) expandBtn.dataset.previewAction = "expand-sidebar";

        input?.addEventListener("input", () => search(input.value));
        input?.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            search(input.value);
          }
        });

        // Initialize vector SVG into host (no fetch, no navigation)
        // vector svg is embedded in HTML; nothing to fetch.

        // --- Gesture arbitration (tap vs drag) ---
        const DRAG_THRESHOLD_PX = 5;
        const gestureState = {
          pointerId: null,
          startClientX: 0,
          startClientY: 0,
          lastClientX: 0,
          lastClientY: 0,
          startScreenX: 0,
          startScreenY: 0,
          isPointerDown: false,
          isDragging: false,
          movedPx: 0,
          downHit: null
        };
        function resetGestureState(){
          gestureState.pointerId = null;
          gestureState.isPointerDown = false;
          gestureState.isDragging = false;
          gestureState.movedPx = 0;
          gestureState.downHit = null;
        }

        function buildCellHitFromWorld(world){
          if (!world) return null;
          const x = Math.round(world.x);
          const y = Math.round(world.y);
          if (!gridVm?.bounds) return { kind: "cell", x, y, id: null, terrainId: null, terrainLabel: "—" };
          if (x < gridVm.bounds.minX || x > gridVm.bounds.maxX || y < gridVm.bounds.minY || y > gridVm.bounds.maxY) {
            return { kind: "world", x: world.x, y: world.y, id: null, terrainId: null, terrainLabel: "—" };
          }
          const key = String(x) + "," + String(y);
          const c = cellByKey.get(key);
          return {
            kind: "cell",
            x,
            y,
            id: c?.terrainId ?? null,
            terrainId: c?.terrainId ?? null,
            terrainLabel: c?.terrainLabel ?? "—"
          };
        }

        function hitTestLineFeatureAtScreen(sx, sy){
          const lines = vectorVm?.lineFeatures ?? [];
          const maxD = 10;
          let best = null;
          let bestD = Infinity;
          function segDist(px, py, ax, ay, bx, by){
            const abx = bx - ax, aby = by - ay;
            const apx = px - ax, apy = py - ay;
            const ab2 = abx*abx + aby*aby;
            const t = ab2 > 0 ? Math.max(0, Math.min(1, (apx*abx + apy*aby)/ab2)) : 0;
            const cx = ax + t*abx, cy = ay + t*aby;
            return Math.hypot(px - cx, py - cy);
          }
          for (const l of lines) {
            const pts = l?.points ?? [];
            if (pts.length < 2) continue;
            let prev = null;
            for (const p of pts) {
              const sp = worldToScreen(Number(p.x), Number(p.y));
              if (prev) {
                const d = segDist(sx, sy, prev.x, prev.y, sp.x, sp.y);
                if (d < bestD) { bestD = d; best = { l, d }; }
              }
              prev = sp;
            }
          }
          if (best && bestD <= maxD) {
            return { kind: "line", id: best.l.id ?? best.l.terrainId ?? "line", x: null, y: null, terrainId: best.l.terrainId ?? null, terrainLabel: best.l.label ?? "—" };
          }
          return null;
        }

        function hitTestPreviewAtScreen(sx, sy){
          const world = screenToWorld(sx, sy);
          if (!world) return null;
          const nHit = hitTestNodeAtScreen(sx, sy);
          if (nHit) {
            return { kind: "map_node", id: String(nHit.n.id ?? nHit.n.gotoMapId ?? ""), x: Math.round(Number(nHit.n.x)), y: Math.round(Number(nHit.n.y)), terrainId: null, terrainLabel: String(nHit.n.label ?? "—") };
          }
          const lHit = hitTestLineFeatureAtScreen(sx, sy);
          if (lHit) return lHit;
          return buildCellHitFromWorld(world);
        }
        // Gate: if camera can't be ready, don't bind high-frequency handlers.
        if (!gridVm || !gridVm.bounds || !viewportEl || !svgEl) {
          warnOnce("not_ready", "preview init incomplete: missing VM or DOM nodes; interactions disabled");
          return;
        }

        function onPreviewPointerDown(event){
          if (!isPreviewCameraReady()) return;
          if (event.button !== 0) return;
          if (!viewportEl) return;
          if (event.target && event.target.closest && event.target.closest("button,input,textarea,select,[contenteditable='true']")) return;

          const rect = viewportEl.getBoundingClientRect();
          const sx = event.clientX - rect.left;
          const sy = event.clientY - rect.top;

          gestureState.pointerId = event.pointerId;
          gestureState.startClientX = event.clientX;
          gestureState.startClientY = event.clientY;
          gestureState.lastClientX = event.clientX;
          gestureState.lastClientY = event.clientY;
          gestureState.startScreenX = sx;
          gestureState.startScreenY = sy;
          gestureState.isPointerDown = true;
          gestureState.isDragging = false;
          gestureState.movedPx = 0;
          gestureState.downHit = hitTestPreviewAtScreen(sx, sy);
          stageEl?.focus?.({ preventScroll: true });
        }

        function updateVectorHoverFromPointer(event){
          if (!isPreviewCameraReady()) return;
          if (!viewportEl) return;
          const rect = viewportEl.getBoundingClientRect();
          const sx = event.clientX - rect.left;
          const sy = event.clientY - rect.top;
          const w = screenToWorld(sx, sy);
          if (!w) return;
          const nHit = hitTestNodeAtScreen(sx, sy);
          if (nHit) {
            const cell = nearestCell(nHit.n.x, nHit.n.y);
            const c = cellByKey.get(cell.key);
            const mapId = String(nHit.n.gotoMapId ?? nHit.n.mapId ?? "").trim();
            if (mapId) {
              const short = getEntryNodeDisplayLabel({ ...nHit.n, mapId });
              const fpSpec = buildEntryNodeFootprint(nHit.n);
              const lineR = entryFootprintHoverLine(fpSpec);
              const line1 = "(x: " + Math.round(nHit.n.x) + ", y: " + Math.round(nHit.n.y) + ")";
              const line2 = "入口：" + (short || "（未命名）");
              const line3 = "mapId: " + mapId;
              if (hoverTip) {
                hoverTip.textContent = [line1, line2, line3, lineR].filter(Boolean).join("\\n");
                hoverTip.hidden = false;
                const pad = 12;
                hoverTip.style.left = Math.round(sx + pad) + "px";
                hoverTip.style.top = Math.round(sy + pad) + "px";
              }
            } else {
              setHoverTooltip({ sx, sy, wx: nHit.n.x, wy: nHit.n.y, hitId: nHit.n.id ?? "—", terrainLabel: c?.terrainLabel ?? "—" });
            }
            return;
          }
          const cell = nearestCell(w.x, w.y);
          const c = cellByKey.get(cell.key);
          const r = regionByCellKey.get(cell.key);
          setHoverTooltip({ sx, sy, wx: w.x, wy: w.y, hitId: r?.terrainId ?? c?.terrainId ?? "—", terrainLabel: c?.terrainLabel ?? "—" });
        }

        const gridCellByKey = new Map(gridVm.cells.map((c) => [String(c.x) + "," + String(c.y), c]));

        function updateGridHoverFromPointer(event){
          if (!viewportEl) return;
          const rect = viewportEl.getBoundingClientRect();
          const sx = event.clientX - rect.left;
          const sy = event.clientY - rect.top;
          const c = screenToCell(sx, sy);
          const cell = gridCellByKey.get(String(c.x) + "," + String(c.y));
          const terrainLabel = cell?.terrainLabel ?? "—";
          const hitId = cell?.terrainId ?? "—";
          if (!hoverTip) return;
          hoverTip.textContent = ["(x: " + c.x + ", y: " + c.y + ")", "地貌: " + String(terrainLabel || "—"), "ID: " + String(hitId || "—")].join("\\n");
          hoverTip.hidden = false;
          const pad = 12;
          hoverTip.style.left = Math.round(sx + pad) + "px";
          hoverTip.style.top = Math.round(sy + pad) + "px";
        }

        function updateHoverFromPointer(event){
          if (isGridModeActive()) return updateGridHoverFromPointer(event);
          return updateVectorHoverFromPointer(event);
        }

        function onPreviewPointerMove(event){
          if (!isPreviewCameraReady()) return;
          updatePreviewPointerOverlay(event);
          updateHoverFromPointer(event);
          if (!gestureState.isPointerDown || gestureState.pointerId !== event.pointerId) return;
          const dxFromStart = event.clientX - gestureState.startClientX;
          const dyFromStart = event.clientY - gestureState.startClientY;
          const moved = Math.hypot(dxFromStart, dyFromStart);
          gestureState.movedPx = moved;

          if (!gestureState.isDragging && moved > DRAG_THRESHOLD_PX) {
            gestureState.isDragging = true;
            viewportEl.setPointerCapture?.(event.pointerId);
            viewportEl.classList.add("is-dragging");
          }
          if (!gestureState.isDragging) return;
          event.preventDefault();
          const dx = event.clientX - gestureState.lastClientX;
          const dy = event.clientY - gestureState.lastClientY;
          gestureState.lastClientX = event.clientX;
          gestureState.lastClientY = event.clientY;
          cameraState.offsetX += dx;
          cameraState.offsetY += dy;
          if (!Number.isFinite(cameraState.offsetX) || !Number.isFinite(cameraState.offsetY) || !Number.isFinite(cameraState.scale)) {
            resetCameraToDefault();
            return;
          }
          renderAll();
        }

        function onPreviewPointerUp(event){
          if (!gestureState.isPointerDown || gestureState.pointerId !== event.pointerId) return;
          const wasDragging = gestureState.isDragging;
          if (wasDragging) {
            event.preventDefault();
            try { viewportEl.releasePointerCapture?.(event.pointerId); } catch {}
            viewportEl.classList.remove("is-dragging");
            resetGestureState();
            return;
          }
          const rect = viewportEl.getBoundingClientRect();
          const sx = event.clientX - rect.left;
          const sy = event.clientY - rect.top;
          const upHit = hitTestPreviewAtScreen(sx, sy);
          const hit = upHit || gestureState.downHit;
          if (hit) {
            if (hit.kind === "map_node") {
              const node = (vectorVm?.mapNodes ?? []).find((n) => String(n?.id ?? "") === String(hit.id ?? "")) || null;
              const mapId = String(node?.gotoMapId ?? node?.mapId ?? "").trim();
              if (mapId) {
                setField("nodeType", "真实地图入口");
                setField("nodeLabel", getEntryNodeDisplayLabel({ ...node, mapId }) || String(node?.label ?? "（未命名）"));
                setField("mapId", mapId);
                const fpSpec = buildEntryNodeFootprint(node);
                setField("entryFootprint", fpSpec && fpSpec.uiDetail ? fpSpec.uiDetail : "—");
              } else {
                setField("nodeType", "普通节点");
                setField("nodeLabel", String(node?.label ?? "—"));
                setField("mapId", "—");
              }
              ensureLayerOn("terrain");
              selectPreviewTarget({ kind: "node", x: hit.x, y: hit.y });
            } else if (hit.kind === "cell") {
              clearNodeFields();
              ensureLayerOn("terrain");
              selectPreviewTarget({ kind: "cell", x: hit.x, y: hit.y });
            } else if (hit.kind === "line") {
              // fallback: select nearest cell at pointer
              clearNodeFields();
              const w = screenToWorld(sx, sy);
              const cHit = buildCellHitFromWorld(w);
              if (cHit && cHit.kind === "cell") selectPreviewTarget({ kind: "cell", x: cHit.x, y: cHit.y });
            } else {
              clearNodeFields();
              const w = screenToWorld(sx, sy);
              const cHit = buildCellHitFromWorld(w);
              if (cHit && cHit.kind === "cell") selectPreviewTarget({ kind: "cell", x: cHit.x, y: cHit.y });
            }
          }
          resetGestureState();
        }

        function onPreviewPointerCancel(event){
          if (gestureState.pointerId === event.pointerId) {
            try { viewportEl.releasePointerCapture?.(event.pointerId); } catch {}
          }
          viewportEl?.classList.remove("is-dragging");
          hidePreviewPointerOverlay();
          resetGestureState();
        }

        function onVectorPointerDown(e){ return onPreviewPointerDown(e); }
        function onVectorPointerMove(e){ return onPreviewPointerMove(e); }
        function onVectorPointerUp(e){ return onPreviewPointerUp(e); }
        function onVectorPointerCancel(e){ return onPreviewPointerCancel(e); }

        function onPreviewViewportPointerDown(event) {
          // Prevent browser text selection during pan/drag inside canvas.
          // Keep inputs/buttons working (search box, toolbar buttons, sidebar).
          if (event?.target && typeof event.target.closest === "function") {
            if (event.target.closest("input, textarea, select, [contenteditable='true'], button")) return;
          }
          // Canvas-local right click + batch erase (blueprint only). Must run before other mode dispatch.
          if (typeof handleCanvasPointerDown === "function") {
            try {
              const handled = handleCanvasPointerDown(event);
              if (handled) return;
            } catch {}
          }
          if (typeof blueprintShouldHandlePointer === "function" && blueprintShouldHandlePointer(event)) {
            if (typeof onBlueprintPointerDown === "function") onBlueprintPointerDown(event);
            return;
          }
          try { event.preventDefault(); } catch {}
          if (isGridModeActive()) return onGridPointerDown(event);
          return onVectorPointerDown(event);
        }
        function onPreviewViewportPointerMove(event) {
          // Right-drag batch erase should not block hover updates; treat as best-effort side effect.
          if (typeof handleCanvasPointerMove === "function") {
            try { handleCanvasPointerMove(event); } catch {}
          }
          if (typeof onBlueprintPointerMove === "function") {
            try {
              const handled = onBlueprintPointerMove(event);
              if (handled) return;
            } catch {}
          }
          if (isGridModeActive()) return onGridPointerMove(event);
          return onVectorPointerMove(event);
        }
        function onPreviewViewportPointerUp(event) {
          if (typeof handleCanvasPointerUp === "function") {
            try { handleCanvasPointerUp(event); } catch {}
          }
          if (typeof onBlueprintPointerUp === "function") {
            try {
              const handled = onBlueprintPointerUp(event);
              if (handled) return;
            } catch {}
          }
          if (isGridModeActive()) return onGridPointerUp(event);
          return onVectorPointerUp(event);
        }
        function onPreviewViewportPointerCancel(event) {
          if (typeof onBlueprintPointerCancelOrLeave === "function") {
            try {
              const handled = onBlueprintPointerCancelOrLeave(event);
              if (handled) return;
            } catch {}
          }
          if (typeof handleCanvasPointerUp === "function") {
            try { handleCanvasPointerUp(event); } catch {}
          }
          if (isGridModeActive()) return onGridPointerCancel(event);
          return onVectorPointerCancel(event);
        }

        function onPreviewViewportPointerLeave(){
          if (typeof onBlueprintPointerCancelOrLeave === "function") {
            try { onBlueprintPointerCancelOrLeave({ pointerId: blueprintState?.pointer?.pointerId ?? null }); } catch {}
          }
          hideHoverTooltip();
          hidePreviewPointerOverlay();
          if (isGridModeActive()) {
            clearGridPointerPosition();
            gridViewport.hoverCell = null;
            renderGridHoverLayerOnly();
          }
        }

        // Bind exactly once; mode dispatch happens inside.
        viewportEl?.addEventListener("pointerdown", onPreviewViewportPointerDown);
        viewportEl?.addEventListener("pointermove", onPreviewViewportPointerMove);
        viewportEl?.addEventListener("pointerup", onPreviewViewportPointerUp);
        viewportEl?.addEventListener("pointercancel", onPreviewViewportPointerCancel);
        viewportEl?.addEventListener("pointerleave", onPreviewViewportPointerLeave);
        viewportEl?.addEventListener("dragstart", (event) => { try { event.preventDefault(); } catch {} });
        // Canvas-local: suppress browser context menu only inside viewport.
        viewportEl?.addEventListener("contextmenu", (event) => {
          if (typeof handleCanvasContextMenu === "function") {
            try { handleCanvasContextMenu(event); } catch {}
            return;
          }
          try { event.preventDefault(); } catch {}
          try { event.stopPropagation(); } catch {}
        });

        // --- Grid mode interactions (zoom/pan/hover/select) ---
        const gridGesture = { isDown: false, isPanning: false, startX: 0, startY: 0, lastX: 0, lastY: 0 };
        function onGridPointerDown(e){
          if (!isGridActive()) return;
          if (e.button !== 0 && e.button !== 1) return;
          const rect = viewportEl.getBoundingClientRect();
          gridGesture.isDown = true;
          gridGesture.isPanning = true;
          gridGesture.startX = e.clientX;
          gridGesture.startY = e.clientY;
          gridGesture.lastX = e.clientX;
          gridGesture.lastY = e.clientY;
          viewportEl.setPointerCapture?.(e.pointerId);
        }

        function gridPointerEventToSvgPoint(event){
          if (!gridSvg || typeof gridSvg.createSVGPoint !== "function") return null;
          const pt = gridSvg.createSVGPoint();
          pt.x = Number(event?.clientX);
          pt.y = Number(event?.clientY);
          const ctm = gridSvg.getScreenCTM?.();
          if (!ctm) return null;
          try {
            return pt.matrixTransform(ctm.inverse());
          } catch {
            return null;
          }
        }

        function isCellInsidePreviewBounds(x, y){
          const b = gridVm?.bounds;
          if (!b) return false;
          return x >= Number(b.minX) && x <= Number(b.maxX) && y >= Number(b.minY) && y <= Number(b.maxY);
        }

        function setGridPointerPosition(svgPoint){
          if (!gPointer || !svgPoint) return;
          gPointer.classList.add("is-visible");
          gPointer.setAttribute("transform", "translate(" + Number(svgPoint.x).toFixed(2) + " " + Number(svgPoint.y).toFixed(2) + ")");
        }
        function clearGridPointerPosition(){
          if (!gPointer) return;
          gPointer.classList.remove("is-visible");
          gPointer.removeAttribute("transform");
        }

        function renderGridHoverLayerOnly(){
          if (!isGridActive()) return;
          if (!gHover) return;
          const hc = gridViewport.hoverCell;
          if (!hc) { gHover.innerHTML = ""; return; }
          const rr = cellBoxToScreenRect(hc.x, hc.y);
          gHover.innerHTML =
            '<rect class="g-hover-cell" x="' +
            rr.x.toFixed(2) +
            '" y="' +
            rr.y.toFixed(2) +
            '" width="' +
            rr.w.toFixed(2) +
            '" height="' +
            rr.h.toFixed(2) +
            '"></rect>';
        }

        function onGridPointerMove(e){
          if (!isGridActive()) return;
          // Marker hover should not disturb cell hover.
          if (e?.target && typeof e.target.closest === "function") {
            const marker = e.target.closest(".g-marker");
            if (marker) return;
          }

          // Use SVG CTM inverse (single source of truth; works under any viewBox/fit).
          const sp = gridPointerEventToSvgPoint(e);
          if (!sp) {
            clearGridPointerPosition();
            if (gridViewport.hoverCell) {
              gridViewport.hoverCell = null;
              renderGridHoverLayerOnly();
            }
            return;
          }
          const c = screenToCell(sp.x, sp.y);
          const inside = c && isCellInsidePreviewBounds(Number(c.x), Number(c.y));

          if (!inside) {
            clearGridPointerPosition();
            if (gridViewport.hoverCell) {
              gridViewport.hoverCell = null;
              renderGridHoverLayerOnly();
            }
          } else {
            // Continuous pointer: always follow raw SVG point.
            setGridPointerPosition(sp);
            const next = { x: Number(c.x), y: Number(c.y) };
            const prev = gridViewport.hoverCell;
            if (!prev || prev.x !== next.x || prev.y !== next.y) {
              gridViewport.hoverCell = next;
              renderGridHoverLayerOnly();
            }
          }

          if (!gridGesture.isDown || !gridGesture.isPanning) return;
          e.preventDefault();
          const dx = e.clientX - gridGesture.lastX;
          const dy = e.clientY - gridGesture.lastY;
          gridGesture.lastX = e.clientX;
          gridGesture.lastY = e.clientY;
          gridViewport.panX += dx;
          gridViewport.panY += dy;
          renderGridAll();
        }
        function onGridPointerUp(e){
          if (!isGridActive()) return;
          if (!gridGesture.isDown) return;
          gridGesture.isDown = false;
          gridGesture.isPanning = false;
          try { viewportEl.releasePointerCapture?.(e.pointerId); } catch {}

          // Marker hit (SVG-only in grid mode)
          // Do this before cell selection so clicking a marker doesn't look like "missed" interaction.
          if (gridSvg && e?.target && typeof e.target.closest === "function") {
            const hit = e.target.closest(".g-marker");
            if (hit) {
              ensureLayerOn("landmark");
              showLandmarkFromGridMarker(hit);
              // also update selected cell to marker coord for consistency
              const mx = Number(hit.getAttribute("data-x"));
              const my = Number(hit.getAttribute("data-y"));
              if (Number.isFinite(mx) && Number.isFinite(my)) {
                gridViewport.selectedCell = { x: mx, y: my };
              }
              renderGridAll();
              renderGridRulers();
              return;
            }
          }

          const sp = gridPointerEventToSvgPoint(e);
          if (!sp) return;
          const c = screenToCell(sp.x, sp.y);
          if (!c || !isCellInsidePreviewBounds(Number(c.x), Number(c.y))) return;
          gridViewport.selectedCell = { x: Number(c.x), y: Number(c.y) };
          ensureLayerOn("terrain");
          selectCell(Number(c.x), Number(c.y));
          renderGridAll();
        }
        function onGridPointerCancel(e){
          if (!isGridActive()) return;
          gridGesture.isDown = false;
          gridGesture.isPanning = false;
          try { viewportEl.releasePointerCapture?.(e.pointerId); } catch {}
          gridViewport.hoverCell = null;
          renderGridAll();
        }

        function onGridWheel(e){
          if (!isGridActive()) return;
          if (!gridVm || !gridVm.bounds) return;
          e.preventDefault();
          const rect = viewportEl.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const before = gridScreenToWorld(sx, sy);
          const zoom = Math.exp((-e.deltaY) * 0.0015);
          const next = clampGridZoom(gridViewport.zoom * zoom);
          gridViewport.zoom = next;
          // pointer-centric zoom: keep before world under cursor
          const after = gridWorldToScreen(before.x, before.y);
          gridViewport.panX += (sx - after.x);
          gridViewport.panY += (sy - after.y);
          updateGridZoomLabel();
          renderGridAll();
          renderGridRulers();
        }

        function onGridKeydown(e){
          if (!isGridActive()) return;
          const k = String(e.key || "");
          if (k === "+" || k === "=") { gridViewport.zoom = clampGridZoom(gridViewport.zoom * GRID_ZOOM_STEP); updateGridZoomLabel(); renderGridAll(); renderGridRulers(); e.preventDefault(); }
          else if (k === "-" || k === "_") { gridViewport.zoom = clampGridZoom(gridViewport.zoom / GRID_ZOOM_STEP); updateGridZoomLabel(); renderGridAll(); renderGridRulers(); e.preventDefault(); }
          else if (k === "0") { resetGrid(); renderGridRulers(); e.preventDefault(); }
          else if (k === "f" || k === "F") { fitGridToBounds(); renderGridRulers(); e.preventDefault(); }
          else if (k === "Home") { gridViewport.panX = 0; gridViewport.panY = 0; renderGridAll(); renderGridRulers(); e.preventDefault(); }
          else if (k === "ArrowUp" || k === "w" || k === "W") { gridViewport.panY += 24; renderGridAll(); renderGridRulers(); }
          else if (k === "ArrowDown" || k === "s" || k === "S") { gridViewport.panY -= 24; renderGridAll(); renderGridRulers(); }
          else if (k === "ArrowLeft" || k === "a" || k === "A") { gridViewport.panX += 24; renderGridAll(); renderGridRulers(); }
          else if (k === "ArrowRight" || k === "d" || k === "D") { gridViewport.panX -= 24; renderGridAll(); renderGridRulers(); }
        }

        function onVectorWheel(e){
          if (!isPreviewCameraReady()) return;
          e.preventDefault();
          const rect = viewportEl.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const before = screenToWorld(sx, sy);
          if (!before) return;
          const zoom = Math.exp((-e.deltaY) * 0.0015);
          const nextScale = clampScale(cameraState.scale * zoom);
          cameraState.scale = nextScale;
          cameraState.offsetX = sx - before.x * cameraState.scale;
          cameraState.offsetY = sy + before.y * cameraState.scale;
          renderAll();
        }

        // Wheel (mode-dispatched)
        viewportEl?.addEventListener("wheel", (e) => {
          if (isGridModeActive()) return onGridWheel(e);
          return onVectorWheel(e);
        }, { passive: false });

        // Middle double click reset
        viewportEl?.addEventListener("mousedown", (e) => {
          if (e.button === 1 && e.detail >= 2) {
            e.preventDefault();
            resetCameraToDefault();
          }
        });

        // WASD pan (only when stage focused, not typing)
        const pressed = new Set();
        function isTypingTarget(){
          const a = document.activeElement;
          if (!a) return false;
          const tag = a.tagName ? a.tagName.toLowerCase() : "";
          return tag === "input" || tag === "textarea" || a.isContentEditable;
        }
        document.addEventListener("keydown", (e) => {
          if (isTypingTarget()) return;
          // Canvas Ctrl+Z undo (blueprint-only). Must be gated by focus/hover inside canvas.
          if (typeof handleCanvasKeyDown === "function") {
            try {
              const handled = handleCanvasKeyDown(e);
              if (handled) return;
            } catch {}
          }
          if (!stageEl) return;
          if (document.activeElement !== stageEl) return;
          if (isGridModeActive()) return onGridKeydown(e);
          if (!isPreviewCameraReady()) return;
          const k = e.key.toLowerCase();
          if (k === "w" || k === "a" || k === "s" || k === "d") {
            pressed.add(k);
            e.preventDefault();
          }
        });
        document.addEventListener("keyup", (e) => {
          pressed.delete(e.key.toLowerCase());
        });

        function setCameraCenter(wx, wy){
          if (!isPreviewCameraReady()) return;
          const rect = viewportEl.getBoundingClientRect();
          cameraState.viewportWidth = rect.width;
          cameraState.viewportHeight = rect.height;
          cameraState.offsetX = rect.width / 2 - wx * cameraState.scale;
          cameraState.offsetY = rect.height / 2 + wy * cameraState.scale;
        }

        function tick(){
          if (pressed.size && !isTypingTarget()) {
            if (!isPreviewCameraReady()) { requestAnimationFrame(tick); return; }
            const rect = viewportEl.getBoundingClientRect();
            const center = screenToWorld(rect.width / 2, rect.height / 2);
            if (!center) { requestAnimationFrame(tick); return; }
            const deltaWorld = 0.35; // per frame @60fps (~21 world units/sec) small map, feels responsive
            let dx = 0, dy = 0;
            if (pressed.has("a")) dx -= deltaWorld;
            if (pressed.has("d")) dx += deltaWorld;
            if (pressed.has("w")) dy += deltaWorld;
            if (pressed.has("s")) dy -= deltaWorld;
            setCameraCenter(center.x + dx, center.y + dy);
            renderAll();
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);

        // Focus stage when pointer enters viewport (enables WASD)
        viewportEl?.addEventListener("pointerenter", () => {
          try { if (typeof blueprintState === "object" && blueprintState?.canvas) blueprintState.canvas.isPointerInside = true; } catch {}
          stageEl?.focus();
        });
        viewportEl?.addEventListener("pointerleave", () => {
          try { if (typeof blueprintState === "object" && blueprintState?.canvas) blueprintState.canvas.isPointerInside = false; } catch {}
        });
        window.addEventListener("blur", () => {
          // End right-erase drag (if any) on focus loss to avoid stuck state.
          try { if (typeof handleCanvasPointerUp === "function") handleCanvasPointerUp({}); } catch {}
        });
        window.addEventListener("resize", () => { fitToBounds(); });
        requestAnimationFrame(() => { fitToBounds(); });

        // If sessionStorage requested grid mode (e.g. just after
        // /api/wilderness-blueprint/refresh-preview), apply the same DOM
        // toggling as the "格点" segment click would have done. Vector is the
        // default; only grid needs an explicit re-sync.
        try {
          if (currentPreviewMode === "grid") {
            if (vectorHost) vectorHost.classList.toggle("is-active", false);
            if (gridHost) gridHost.classList.toggle("is-active", true);
            document.querySelectorAll('.preview-view-tab[data-preview-action="set-preview-mode"]').forEach((b) => {
              const on = b.getAttribute("data-preview-mode") === "grid";
              b.classList.toggle("is-active", on);
              b.setAttribute("aria-pressed", on ? "true" : "false");
            });
            try { if (typeof toggleBlueprintMode === "function") toggleBlueprintMode(false, "已退出：切换到格点模式。"); } catch (_e) {}
            requestAnimationFrame(() => {
              try { fitGridToBounds(); renderGridAll(); renderGridRulers(); } catch (_e) {}
            });
          }
        } catch (_e) { /* hydration is best-effort UI; never throw */ }

        // One-shot transient status from the previous page (e.g. "已从游戏
        // 文件重载预览。"). Consumed and removed.
        try {
          const last = sessionStorage.getItem("wilderness_area_preview_last_apply_status");
          if (last) {
            sessionStorage.removeItem("wilderness_area_preview_last_apply_status");
            try { if (typeof bpSetStatus === "function") bpSetStatus(String(last)); } catch (_e) {}
          }
        } catch (_e) { /* sessionStorage unavailable -> ignore */ }
      })();
    </script>
  `.trim();
}

function renderGridHtml({ gridVm, semanticLayerVm, vectorVm }) {
  return `
    <div class="map-meta">
      <div class="map-meta-row">
        <span class="badge-lite">坐标系</span>
        <span class="muted">x 增大方向：→（向右）</span>
        <span class="muted">y 增大方向：↑（向上）</span>
      </div>
      <div class="map-meta-row">
        <span class="badge-lite">bounds</span>
        <span class="muted"><code>x: [${escapeHtml(gridVm.bounds.minX)}, ${escapeHtml(gridVm.bounds.maxX)}]</code></span>
        <span class="muted"><code>y: [${escapeHtml(gridVm.bounds.minY)}, ${escapeHtml(gridVm.bounds.maxY)}]</code></span>
        <span class="muted">尺寸：<code>${escapeHtml(gridVm.width)} × ${escapeHtml(gridVm.height)}</code></span>
      </div>
    </div>

    <div id="preview-stage" class="preview-stage" tabindex="0" aria-label="预览舞台（可拖拽/缩放）">
      <div id="preview-ruler-left" class="preview-ruler-left" aria-label="坐标尺（y）">
        <div id="preview-ruler-y-cursor" class="preview-ruler-cursor-line preview-ruler-cursor-line--y" aria-hidden="true"></div>
      </div>
      <div class="preview-canvas-shell">
        <div class="preview-overlay-north" aria-label="方向">
          <span class="north-chip">↑N</span>
        </div>
        <div id="preview-svg-viewport" class="preview-svg-viewport" aria-label="主绘图区">
          <div id="preview-pointer-dot" class="preview-pointer-dot" aria-hidden="true"></div>
          <div id="vector-preview" class="vector-preview is-active" aria-label="矢量预览容器">
            ${renderVectorPreviewSvg({ vectorVm, gridVm })}
          </div>
          <div id="preview-hover-tooltip" class="preview-hover-tooltip" aria-live="polite" aria-label="指针信息" hidden></div>
          <div id="grid-debug" class="grid-debug" aria-label="格点调试容器">
            <div class="grid-preview-toolbar" aria-label="格点视口工具条">
              <button type="button" class="mode-toggle" data-preview-action="grid-zoom-out" aria-label="缩小">−</button>
              <span id="grid-zoom-label" class="grid-zoom-label" aria-label="当前缩放">100%</span>
              <button type="button" class="mode-toggle" data-preview-action="grid-zoom-in" aria-label="放大">＋</button>
              <button type="button" class="mode-toggle" data-preview-action="grid-fit" aria-label="适配画布">适配</button>
              <button type="button" class="mode-toggle" data-preview-action="grid-reset" aria-label="归位">归位</button>
              <button type="button" class="mode-toggle" data-preview-action="grid-follow" aria-pressed="false" aria-label="锁定玩家">锁定</button>
            </div>
            <svg id="grid-preview-svg" class="grid-preview-svg" width="100%" height="100%" role="img" aria-label="格点调试地图（低干扰）">
              <defs>
                <filter id="grid-cell-soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="1" stdDeviation="1.0" flood-color="rgba(0,0,0,0.22)"/>
                </filter>
              </defs>
              <g id="g-layer-grid" class="g-layer g-grid"></g>
              <g id="g-layer-cells" class="g-layer g-cells"></g>
              <g id="g-layer-zones" class="g-layer g-zones"></g>
              <g id="g-layer-boundary" class="g-layer g-boundary"></g>
              <g id="g-layer-radius" class="g-layer g-radius"></g>
              <g id="g-layer-markers" class="g-layer g-markers"></g>
              <g id="g-layer-labels" class="g-layer g-labels"></g>
              <g id="g-layer-hover" class="g-layer g-hover"></g>
              <g id="g-layer-selected" class="g-layer g-selected"></g>
              <g id="g-layer-pointer" class="g-layer g-layer-pointer" aria-hidden="true">
                <circle class="g-pointer-dot-ring" r="10"></circle>
                <circle class="g-pointer-dot" r="4.6"></circle>
              </g>
            </svg>
            ${renderSemanticLayerHtml({ semanticLayerVm, gridVm })}
          </div>
        </div>
        <div id="preview-ruler-bottom" class="preview-ruler-bottom" aria-label="坐标尺（x）">
          <div id="preview-ruler-x-cursor" class="preview-ruler-cursor-line preview-ruler-cursor-line--x" aria-hidden="true"></div>
        </div>
      </div>
    </div>

    <script id="wilderness-grid-vm" type="application/json">${jsonForScriptTag(gridVm)}</script>
    <script id="wilderness-semantic-vm" type="application/json">${jsonForScriptTag(semanticLayerVm)}</script>
    <script id="wilderness-vector-vm" type="application/json">${jsonForScriptTag(vectorVm)}</script>
  `.trim();
}

function renderVectorPreviewSvg({ vectorVm, gridVm }) {
  return `
    <svg id="vector-preview-svg" class="vector-preview-svg" viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" role="img" aria-label="矢量预览模式">
      <defs>
        <filter id="entry-footprint-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <!-- Rendered at runtime into screen coords (no group transform). -->
      <g id="v-layer-grid" class="v-layer v-grid"></g>
      <g id="v-layer-fill" class="v-layer v-fill"></g>
      <g id="v-layer-boundary" class="v-layer v-boundary"></g>
      <g id="v-layer-terrain-symbols" class="v-layer v-terrain-symbols" aria-hidden="true"></g>
      <g id="v-layer-route-semantics" class="v-layer v-route-semantics" aria-hidden="true"></g>
      <g id="v-layer-entry-footprint" class="v-layer v-entry-footprint vector-layer vector-layer-entry-footprint"></g>
      <g id="v-layer-lines" class="v-layer v-lines"></g>
      <g id="v-layer-labels" class="v-layer v-labels"></g>
      <g id="v-layer-nodes" class="v-layer v-nodes"></g>
      <g id="v-layer-blueprint-cells" class="v-layer v-blueprint v-blueprint-cells"></g>
      <g id="v-layer-blueprint-diff" class="v-layer v-blueprint v-blueprint-diff"></g>
      <g id="v-layer-blueprint-special" class="v-layer v-blueprint v-blueprint-special"></g>
      <g id="v-layer-blueprint-labels" class="v-layer v-blueprint v-blueprint-labels"></g>
      <g id="v-layer-blueprint-brush" class="v-layer v-blueprint v-blueprint-brush"></g>
    </svg>
  `.trim();
}

function renderLegendHtml({ legendVm }) {
  const rows = legendVm.items
    .map((it) => {
      return `
        <tr>
          <td><span class="legend-swatch ${escapeHtml(it.className)}" aria-hidden="true"></span></td>
          <td><strong>${escapeHtml(it.shortLabel)}</strong></td>
          <td><code>${escapeHtml(it.terrainId)}</code></td>
          <td class="muted">${escapeHtml(it.passabilityHint)}</td>
          <td class="muted">${escapeHtml(it.riskHint)}</td>
        </tr>
      `.trim();
    })
    .join("\n");

  return `
    <div class="card">
      <h2>E. ${escapeHtml(legendVm.title)}</h2>
      <div class="body">
        <table class="table">
          <thead>
            <tr>
              <th style="width:64px;">纹理</th>
              <th style="width:90px;">短名</th>
              <th style="width:220px;">terrainId</th>
              <th>通行说明</th>
              <th>风险说明</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `.trim();
}

/**
 * HTML Renderer (pure: VM in, string out)
 * @param {{ sourceVm: any, gridVm: any, legendVm: any, implLegendVm: any, semanticLayerVm: any }} args
 */
function renderWildernessPreviewHtml({ sourceVm, gridVm, legendVm, implLegendVm, semanticLayerVm, terrainOptions }) {
  const title = "野外向量地图预览器";
  const subtitle = "West2 · 旧标记杆巡查线";
  const nowIso = new Date().toISOString();

  const { areaSpec } = sourceVm;
  const origin = areaSpec?.origin ?? areaSpec?.start ?? areaSpec?.startCoordinate ?? null;

  return `<!doctype html>
<html lang="zh-Hans">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root{
        --preview-page-bg: #f3efe5;
        --preview-panel-bg: rgba(250, 247, 238, 0.92);
        --preview-panel-bg-solid: #f7f2e8;
        --preview-canvas-bg: #f6f1e7;
        --preview-card-bg: rgba(255,255,255,0.62);
        --preview-border: rgba(88,78,62,0.24);
        --preview-border-strong: rgba(63,72,78,0.42);
        --preview-text: #28313a;
        --preview-text-strong: #101820;
        --preview-muted: #69737b;
        --preview-faint: #8b918f;
        --preview-control-bg: rgba(255,255,255,0.72);
        --preview-control-bg-hover: rgba(255,255,255,0.92);
        --preview-control-text: #26323b;
        --preview-input-bg: rgba(255,255,255,0.82);
        --preview-input-text: #26323b;
        --preview-ruler-bg: rgba(248,245,236,0.72);
        --preview-ruler-text: #52606b;
        --preview-ruler-line: rgba(88,78,62,0.22);
        --preview-pointer-dot: #4fa7d8;
        --preview-pointer-dot-stroke: rgba(18, 61, 88, 0.75);
        --preview-pointer-dot-halo: rgba(79, 167, 216, 0.16);
        --preview-pointer-dot-glow: rgba(79, 167, 216, 0.28);
        --preview-ruler-cursor-line: rgba(54, 118, 158, 0.72);
        --preview-ruler-cursor-glow: rgba(54, 118, 158, 0.22);
        --preview-grid-line: rgba(80,90,96,0.13);
        --preview-region-fill: rgba(137,155,164,0.28);
        --preview-region-boundary: rgba(69,86,96,0.56);
        --preview-label-text: #25323b;
        --preview-label-chip-bg: rgba(255,255,255,0.78);
        --preview-label-chip-border: rgba(80,100,130,0.18);
        --preview-label-chip-text: #1A2A3D;
        --preview-chip-bg: rgba(37,47,56,0.72);
        --preview-chip-text: #f4f7f8;
        --preview-node-blue: #4f98c8;
        --preview-node-glow: rgba(79,152,200,0.18);
        --preview-entry-ring: rgba(108, 142, 180, 0.95);
        --preview-entry-inner-glow: rgba(120, 168, 215, 0.28);
        --preview-entry-core: #f2c94c;
        --preview-entry-core-stroke: rgba(90, 68, 16, 0.55);
        --preview-entry-footprint-fill: rgba(236, 190, 64, 0.22);
        --preview-entry-footprint-stroke: rgba(184, 134, 28, 0.56);
        --preview-entry-footprint-glow: rgba(236, 190, 64, 0.18);

        /* Grid mode palette (cool gray / ice blue / low-sat amber) */
        --grid-bg: rgba(8, 12, 18, 0.78);
        --grid-bounds: rgba(120, 168, 200, 0.12);
        --grid-line-minor: rgba(140,170,196,0.12);
        --grid-line-major: rgba(140,170,196,0.18);
        --grid-boundary: rgba(210,228,238,0.28);
        --grid-hover-stroke: rgba(121, 184, 222, 0.66);
        --grid-hover-fill: rgba(121, 184, 222, 0.06);
        --grid-selected-stroke: rgba(214, 178, 96, 0.70);
        --grid-selected-fill: rgba(214, 178, 96, 0.08);
        --grid-marker-warm: rgba(236, 168, 94, 0.92);
        --grid-marker-stroke: rgba(12, 18, 26, 0.86);

        /* keep legacy vars used by non-themed areas */
        --paper:#f4f0e6;
        --ink:#1f2328;
        --muted:#5a5f66;
        --line:#b7b0a0;
        --accent:#2b4f74;
        --stamp:#6b2b2b;
        --panel:#fbf8f1;
      }

      html[data-preview-theme="dark"]{
        --preview-page-bg: #0c1218;
        --preview-panel-bg: rgba(15,22,29,0.94);
        --preview-panel-bg-solid: #111923;
        --preview-canvas-bg: #0f171f;
        --preview-card-bg: rgba(20,30,39,0.78);
        --preview-border: rgba(139,162,174,0.22);
        --preview-border-strong: rgba(164,190,204,0.38);
        --preview-text: #d9e2e8;
        --preview-text-strong: #f2f6f8;
        --preview-muted: #a8b5be;
        --preview-faint: #778690;
        --preview-control-bg: rgba(31,43,54,0.92);
        --preview-control-bg-hover: rgba(43,58,71,0.98);
        --preview-control-text: #e5edf2;
        --preview-input-bg: rgba(224,232,236,0.88);
        --preview-input-text: #17202a;
        --preview-ruler-bg: rgba(13,20,27,0.86);
        --preview-ruler-text: #aebbc4;
        --preview-ruler-line: rgba(174,196,207,0.18);
        --preview-pointer-dot: #6fc4f2;
        --preview-pointer-dot-stroke: rgba(8, 22, 32, 0.85);
        --preview-pointer-dot-halo: rgba(111, 196, 242, 0.18);
        --preview-pointer-dot-glow: rgba(111, 196, 242, 0.32);
        --preview-ruler-cursor-line: rgba(127, 193, 230, 0.72);
        --preview-ruler-cursor-glow: rgba(127, 193, 230, 0.24);
        --preview-grid-line: rgba(174,196,207,0.12);
        --preview-region-fill: rgba(116,139,151,0.30);
        --preview-region-boundary: rgba(166,191,204,0.54);
        --preview-label-text: #eef5f8;
        --preview-label-chip-bg: rgba(8,18,30,0.72);
        --preview-label-chip-border: rgba(120,170,220,0.22);
        --preview-label-chip-text: #DCEBFF;
        --preview-chip-bg: rgba(16,24,31,0.86);
        --preview-chip-text: #eaf3f8;
        --preview-node-blue: #6bb6e8;
        --preview-node-glow: rgba(107,182,232,0.18);
        --preview-entry-ring: rgba(128, 168, 210, 0.95);
        --preview-entry-inner-glow: rgba(103, 155, 220, 0.22);
        --preview-entry-core: #f1cf63;
        --preview-entry-core-stroke: rgba(116, 90, 20, 0.58);
        --preview-entry-footprint-fill: rgba(236, 194, 78, 0.20);
        --preview-entry-footprint-stroke: rgba(240, 207, 112, 0.52);
        --preview-entry-footprint-glow: rgba(240, 207, 112, 0.20);

        --grid-bg: rgba(6, 10, 16, 0.86);
        --grid-bounds: rgba(120, 168, 200, 0.11);
        --grid-line-minor: rgba(176, 212, 232, 0.10);
        --grid-line-major: rgba(176, 212, 232, 0.16);
        --grid-boundary: rgba(210, 232, 246, 0.26);
        --grid-hover-stroke: rgba(128, 202, 236, 0.62);
        --grid-hover-fill: rgba(128, 202, 236, 0.06);
        --grid-selected-stroke: rgba(214, 178, 96, 0.72);
        --grid-selected-fill: rgba(214, 178, 96, 0.09);
        --grid-marker-warm: rgba(236, 168, 94, 0.92);
        --grid-marker-stroke: rgba(8, 14, 20, 0.92);
      }
      html,body{height:100%;}
      body{
        margin:0;
        background: var(--preview-page-bg);
        color:var(--preview-text);
        font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans SC", "Microsoft YaHei", Arial, sans-serif;
      }
      /* Workbench layout */
      .preview-workbench{min-height:100vh; display:flex; flex-direction:column;}

      /* Top shell (identity + toolbar) — hard height lock */
      .preview-top-shell{
        position:sticky; top:0; z-index:50;
        height:72px;
        min-height:72px;
        max-height:72px;
        padding:6px 12px;
        display:grid;
        grid-template-columns: minmax(260px, 1fr) auto minmax(360px, 520px);
        grid-template-rows: 28px 30px;
        column-gap: 12px;
        row-gap: 4px;
        box-sizing:border-box;
        overflow:hidden;
        border-bottom:1px solid var(--preview-border);
        background: var(--preview-panel-bg);
        backdrop-filter: blur(6px);
      }
      .preview-identity-main{
        grid-column: 1 / 3;
        grid-row: 1;
        min-width:0;
        height: 28px;
        display:flex;
        align-items:center;
      }
      .preview-status-badges{
        grid-column: 3;
        grid-row: 1;
        justify-self:end;
        align-self:center;
        height: 28px;
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap:8px;
        flex-wrap:nowrap;
        white-space:nowrap;
      }
      .preview-toolbar-main{
        grid-column: 2;
        grid-row: 2;
        min-width:0;
        height: 30px;
        display:flex;
        align-items:center;
        gap:8px;
        overflow:hidden;
        justify-content:flex-start;
      }
      .preview-search-tools{
        grid-column: 3;
        grid-row: 2;
        justify-self:end;
        align-self:center;
        height: 30px;
        width: 100%;
        display:grid;
        grid-template-columns: minmax(260px, 1fr) auto auto;
        align-items:center;
        flex-wrap:nowrap;
        gap:8px;
        white-space:nowrap;
        min-width:0;
      }
      .preview-meta{
        grid-column: 1;
        grid-row: 2;
        height: 30px;
      }

      .preview-identity-title{
        display:flex;
        gap:8px;
        align-items:baseline;
        min-width:0;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .preview-kicker{
        font-size:11px;
        letter-spacing:0.14em;
        font-weight:900;
        color: var(--preview-muted);
        white-space:nowrap;
        flex: 0 0 auto;
      }
      .preview-dot{ color: var(--preview-muted); opacity:0.75; flex: 0 0 auto; }
      .preview-title{
        font-size:13px;
        font-weight:900;
        color: var(--preview-text-strong);
        line-height:1.10;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        min-width:0;
      }

      .preview-meta{
        font-size:11px;
        color: var(--preview-muted);
        display:flex;
        gap:8px;
        flex-wrap:nowrap;
        align-items:center;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        min-width:0;
      }
      .preview-meta code{ font-size: 11px; }
      .status-badge{
        border:1px solid var(--preview-border);
        background: rgba(0,0,0,0.02);
        color: var(--preview-muted);
        border-radius: 999px;
        height: 24px;
        line-height: 22px;
        padding: 0 10px;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.10em;
        user-select:none;
        white-space:nowrap;
      }
      html[data-preview-theme="dark"] .status-badge{ background: rgba(255,255,255,0.03); }
      .status-badge--author{ border-color: rgba(79,152,200,0.35); color: rgba(140,200,232,0.92); }

      .preview-mode-cluster{ display:flex; gap:8px; align-items:center; flex-wrap:nowrap; }
      .preview-view-tabs,
      .preview-layer-menu,
      #preview-layer-details{ flex: 0 0 auto; }
      .preview-view-tabs{
        display:inline-flex;
        border:1px solid var(--preview-border);
        border-radius: 10px;
        overflow:hidden;
        background: rgba(0,0,0,0.02);
      }
      html[data-preview-theme="dark"] .preview-view-tabs{ background: rgba(255,255,255,0.03); }
      .preview-view-tab{
        border:0;
        background: transparent;
        color: var(--preview-control-text);
        height: 26px;
        line-height: 24px;
        padding: 0 9px;
        cursor:pointer;
        font-size: 12px;
        letter-spacing: 0.04em;
        white-space:nowrap;
      }
      .preview-view-tab + .preview-view-tab{ border-left:1px solid var(--preview-border); }
      .preview-view-tab.is-active{
        background: rgba(79,152,200,0.12);
        color: var(--preview-text-strong);
        font-weight: 900;
      }
      .preview-view-tab:hover{ background: rgba(79,152,200,0.06); }

      .layer-menu-summary{
        list-style:none;
        cursor:pointer;
        user-select:none;
        border:1px solid var(--preview-border);
        background: rgba(0,0,0,0.02);
        color: var(--preview-control-text);
        border-radius: 10px;
        height: 26px;
        line-height: 24px;
        padding: 0 9px;
        font-size: 12px;
        white-space:nowrap;
      }
      html[data-preview-theme="dark"] .layer-menu-summary{ background: rgba(255,255,255,0.03); }
      details > summary.layer-menu-summary::-webkit-details-marker{ display:none; }
      .layer-menu-summary .chev{ opacity:0.72; margin-left:4px; }
      .layer-menu-body{
        margin-top:6px;
        border:1px solid var(--preview-border);
        border-radius: 12px;
        background: var(--preview-panel-bg-solid);
        padding:8px;
        min-width: 220px;
      }
      .layer-menu-item{
        display:block;
        width:100%;
        text-align:left;
        border:1px solid var(--preview-border);
        background: transparent;
        color: var(--preview-control-text);
        border-radius: 10px;
        padding: 6px 10px;
        cursor:pointer;
        margin-top:6px;
      }
      .layer-menu-item:first-child{ margin-top:0; }
      .layer-menu-item.is-on{ background: rgba(79,152,200,0.10); }
      .layer-menu-item:hover{ background: rgba(79,152,200,0.06); }
      .layer-menu-hint{ margin-top:8px; font-size:11px; color: var(--preview-muted); }

      /* Right tool column: keep width stable, avoid search input stretching left */
      .search-bar{display:contents;}
      .search-input{
        height: 28px;
        line-height: 28px;
        min-width:0;
        width: 100%;
        padding: 0 10px;
        border-radius: 10px;
        box-sizing:border-box;
        display:block;
      }
      .search-clear{
        height: 28px;
        line-height: 26px;
        padding: 0 10px;
        border-radius: 10px;
        box-sizing:border-box;
        white-space:nowrap;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        vertical-align: middle;
      }
      .preview-theme-toggle{
        height: 28px;
        width: 32px;
        padding: 0;
        border-radius: 10px;
        box-sizing:border-box;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        vertical-align: middle;
      }
      .settings-button{ width:32px; min-width:32px; padding:0; }

      .preview-main{
        display:grid;
        grid-template-columns: 3fr 1fr;
        gap:12px;
        padding:12px 14px 14px;
        flex: 1 1 auto;
        min-height: 0;
      }
      body.sidebar-collapsed .preview-main{ grid-template-columns: 1fr 0; }
      .preview-map-pane{min-height:720px; border:1px solid var(--preview-border-strong); border-radius:12px; background: var(--preview-canvas-bg); padding:12px; overflow:hidden;}
      /* Top shell height is locked to 72px. */
      .preview-map-pane .map-scroll{height: calc(100vh - 72px - 24px); min-height:720px;}
      .preview-map-pane .map-scroll{max-height:none;}
      body.sidebar-collapsed .preview-sidebar{display:none;}

      .preview-sidebar{
        border:1px solid var(--preview-border);
        border-radius:12px;
        background: var(--preview-panel-bg);
        overflow:hidden;
        min-height: 0;
        display:flex;
        flex-direction:column;
      }
      .preview-sidebar-tabs{
        display:flex;
        gap:14px;
        align-items:flex-end;
        padding:10px 12px;
        border-bottom:1px solid var(--preview-border);
        background: linear-gradient(180deg, rgba(43,79,116,0.10), transparent);
      }
      .sidebar-tab{
        border:0;
        background: transparent;
        color: rgba(255,255,255,0.62);
        padding:6px 2px;
        letter-spacing:0.10em;
        border-bottom:2px solid transparent;
        cursor:pointer;
      }
      .sidebar-tab:hover{ color: rgba(255,255,255,0.82); }
      .sidebar-tab.is-active{ color: var(--preview-text-strong); border-bottom-color: rgba(79,152,200,0.75); }
      .sidebar-spacer{flex:1 1 auto;}
      .sidebar-collapse{
        border:1px solid var(--preview-border);
        background: var(--preview-control-bg);
        color: var(--preview-control-text);
        padding:6px 10px;
        border-radius:999px;
        cursor:pointer;
      }
      .sidebar-collapse:hover{background: var(--preview-control-bg-hover);}
      .sidebar-panel{display:none; padding:12px; overflow:auto; min-height:0;}
      .sidebar-panel.is-active{display:block;}
      .panel-title{font-weight:800; margin-bottom:10px; letter-spacing:0.10em; color:var(--preview-accent, var(--accent));}

      .sidebar-collapsed-peek{
        position:fixed;
        right:12px;
        top:96px;
        z-index:60;
        display:none;
      }
      body.sidebar-collapsed .sidebar-collapsed-peek{display:block;}
      .sidebar-expand{
        border:1px solid var(--preview-border);
        background: var(--preview-control-bg);
        color: var(--preview-control-text);
        padding:10px 12px;
        border-radius:12px;
        cursor:pointer;
      }
      .sidebar-expand:hover{background: var(--preview-control-bg-hover);}

      .preview-appendix{
        border-top:2px solid var(--preview-border);
        padding:10px 14px 24px;
        background: var(--preview-panel-bg-solid);
      }
      .preview-appendix details summary{cursor:pointer; font-weight:800; letter-spacing:0.08em;}
      .appendix-body{margin-top:10px;}
      .appendix-section{margin-top:12px;}
      .appendix-title{font-weight:800; margin-bottom:8px;}
      .card{
        background: var(--preview-card-bg);
        border:1px solid var(--preview-border);
        box-shadow: 0 6px 18px rgba(0,0,0,0.06);
        border-radius:10px;
        overflow:hidden;
      }
      .card h2{
        margin:0;
        padding:10px 12px;
        font-size:14px;
        letter-spacing:0.08em;
        color:var(--preview-text-strong);
        border-bottom:1px solid var(--preview-border);
        background: linear-gradient(180deg, rgba(79,152,200,0.12), transparent);
      }
      .card .body{padding:12px;}
      .muted{color:var(--preview-muted);}
      .kvs{display:grid; grid-template-columns: 170px 1fr; gap:8px 10px; align-items:start;}
      .kvs .k{color:var(--preview-muted);}
      .kvs .v code{background: rgba(31,35,40,0.08); padding:1px 5px; border-radius:6px;}
      .pill{
        display:inline-flex; align-items:center; gap:8px; flex-wrap:wrap;
      }
      .pill span{
        display:inline-block;
        border:1px solid var(--preview-border);
        background: var(--preview-control-bg);
        color: var(--preview-control-text);
        padding:4px 8px;
        border-radius:999px;
      }
      .toolbar{
        display:flex; gap:8px; flex-wrap:wrap;
        padding:10px 12px;
        border-top:1px solid rgba(183,176,160,0.7);
        background: linear-gradient(180deg, rgba(0,0,0,0.02), transparent);
      }
      .toolbar button{
        border:1px solid var(--preview-border);
        background: var(--preview-control-bg);
        padding:7px 10px;
        border-radius:8px;
        color:var(--preview-control-text);
        cursor:not-allowed;
      }
      .toolbar button:disabled{opacity:0.55;}
      .layer-controls{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        align-items:center;
        margin-bottom:10px;
      }
      .layer-toggle{
        border:1px solid var(--preview-border);
        background: var(--preview-control-bg);
        padding:6px 10px;
        border-radius:999px;
        cursor:pointer;
        color: var(--preview-control-text);
      }
      .layer-toggle:hover{background: var(--preview-control-bg-hover);}
      .layer-toggle.is-off{
        opacity:0.55;
        text-decoration: line-through;
      }
      .layer-hint{font-size:12px;}
      .table{
        width:100%;
        border-collapse:collapse;
        font-size:13px;
      }
      .table th,.table td{
        border-bottom:1px solid rgba(183,176,160,0.65);
        padding:8px 8px;
        text-align:left;
        vertical-align:top;
      }
      .table th{color:var(--preview-muted); font-weight:600;}
      code{font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}
      .badge{
        display:inline-block;
        border:1px solid rgba(43,79,116,0.35);
        color:rgba(43,79,116,0.95);
        background: rgba(43,79,116,0.08);
        padding:2px 8px;
        border-radius:999px;
        white-space:nowrap;
      }
      .map-wrap{display:grid; grid-template-columns: 1.3fr 0.7fr; gap:14px;}
      @media (max-width: 980px){ .map-wrap{grid-template-columns:1fr;} }
      .map-and-detail{display:grid; grid-template-columns: 1.25fr 0.75fr; gap:14px; align-items:start;}
      @media (max-width: 980px){ .map-and-detail{grid-template-columns:1fr;} }
      .map-meta{display:flex; flex-direction:column; gap:6px; margin-bottom:10px;}
      .map-meta-row{display:flex; gap:10px; flex-wrap:wrap; align-items:center;}
      .badge-lite{
        display:inline-block;
        border:1px solid var(--preview-border);
        background: var(--preview-control-bg);
        padding:2px 8px;
        border-radius:999px;
        color:var(--preview-muted);
        font-size:12px;
      }
      .map-scroll{
        border:1px solid var(--preview-border);
        border-radius:10px;
        background: var(--preview-card-bg);
        overflow:auto;
        max-height:560px;
        padding:10px;
      }
      .preview-stage{
        display:grid;
        grid-template-columns: 56px 1fr;
        gap:10px;
        align-items:stretch;
        outline:none;
      }
      .preview-stage:focus-visible{ box-shadow: 0 0 0 3px rgba(43,79,116,0.18); border-radius:12px; }
      .preview-ruler-left{
        border:1px solid var(--preview-border);
        border-radius:10px;
        background: var(--preview-ruler-bg);
        position:relative;
        overflow:hidden;
        pointer-events:none;
      }
      .preview-canvas-shell{
        border:1px solid var(--preview-border);
        border-radius:10px;
        background: var(--preview-canvas-bg);
        overflow:hidden;
        position:relative;
        display:grid;
        grid-template-rows: 1fr 44px;
      }
      .preview-svg-viewport{
        position:relative;
        overflow:hidden;
        min-height:720px;
        background: rgba(255,255,255,0.10);
        cursor: none;
      }
      .preview-svg-viewport.is-dragging{ cursor: none; }
      .preview-svg-viewport.is-dragging{ user-select:none; }

      .preview-pointer-dot{
        position:absolute;
        width:7px;
        height:7px;
        border-radius:999px;
        background: var(--preview-pointer-dot);
        border: 1px solid var(--preview-pointer-dot-stroke);
        box-shadow: 0 0 0 3px var(--preview-pointer-dot-halo), 0 0 10px var(--preview-pointer-dot-glow);
        transform: translate(-50%, -50%);
        pointer-events:none;
        z-index:30;
        opacity:0;
        transition: opacity 80ms ease;
      }
      .preview-pointer-dot.is-visible{opacity:1;}

      .preview-ruler-cursor-line{
        pointer-events:none;
        opacity:0;
      }
      .preview-ruler-cursor-line.is-visible{opacity:1;}
      .preview-ruler-cursor-line--y{
        position:absolute;
        left:0;
        right:0;
        height:1px;
        background: var(--preview-ruler-cursor-line);
        box-shadow: 0 0 6px var(--preview-ruler-cursor-glow);
        transform: translateY(-0.5px);
      }
      .preview-ruler-cursor-line--x{
        position:absolute;
        top:0;
        bottom:0;
        width:1px;
        background: var(--preview-ruler-cursor-line);
        box-shadow: 0 0 6px var(--preview-ruler-cursor-glow);
        transform: translateX(-0.5px);
      }
      .preview-ruler-bottom{
        border-top:1px solid var(--preview-border);
        background: var(--preview-ruler-bg);
        position:relative;
        overflow:hidden;
        pointer-events:none;
      }
      .ruler-tick{
        position:absolute;
        color: var(--preview-ruler-text);
        font-size:12px;
        white-space:nowrap;
        user-select:none;
      }
      .ruler-line{
        position:absolute;
        background: var(--preview-ruler-line);
      }
      .preview-overlay-north{
        position:absolute;
        top:10px;
        right:10px;
        z-index:20;
        pointer-events:none;
      }
      .north-chip{
        display:inline-block;
        padding:6px 10px;
        border-radius:999px;
        border:1px solid rgba(183,176,160,0.85);
        background: rgba(255,255,255,0.60);
        font-weight:800;
        letter-spacing:0.08em;
      }
      html[data-preview-theme="dark"] .north-chip{
        background: var(--preview-control-bg);
        color: var(--preview-control-text);
      }
      .vector-preview{
        display:none;
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
      }
      .vector-preview.is-active{display:block;}
      .grid-debug{
        display:none;
        position:absolute;
        inset:0;
      }
      .grid-debug.is-active{display:block;}
      .grid-preview-toolbar{
        position:absolute;
        left:10px;
        top:10px;
        z-index:20;
        display:flex;
        gap:6px;
        align-items:center;
        flex-wrap:nowrap;
        pointer-events:auto;
        padding:6px 8px;
        border-radius:12px;
        border:1px solid var(--preview-border);
        background: rgba(12, 18, 26, 0.40);
        backdrop-filter: blur(6px);
        box-shadow: 0 12px 26px rgba(0,0,0,0.22);
      }
      .grid-zoom-label{
        padding:6px 10px;
        border-radius:999px;
        border:1px solid var(--preview-border);
        background: rgba(12, 18, 26, 0.52);
        color: var(--preview-text-strong);
        font-weight:800;
        letter-spacing:0.06em;
        min-width:56px;
        text-align:center;
      }
      html[data-preview-theme="dark"] .grid-zoom-label{
        background: rgba(12, 18, 26, 0.62);
        color: var(--preview-text-strong);
      }
      .grid-preview-svg{
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        display:block;
        border-radius:10px;
        background:
          radial-gradient(980px 680px at 14% 10%, rgba(111, 196, 242, 0.12), transparent 58%),
          linear-gradient(180deg, rgba(12, 18, 26, 0.92), rgba(10, 14, 20, 0.88));
      }
      #wilderness-preview-map{ display:none; }
      .g-bg{ fill: var(--grid-bg); }
      .g-bounds{ fill: var(--grid-bounds); }
      .g-grid line{ vector-effect: non-scaling-stroke; }
      .g-grid-minor{ stroke: var(--grid-line-minor); stroke-width:1px; }
      .g-grid-major{ stroke: var(--grid-line-major); stroke-width:1.2px; }
      .g-cell{ stroke: rgba(0,0,0,0.0); stroke-width:0; filter: url(#grid-cell-soft-shadow); }
      .g-boundary path{ fill:none; stroke: var(--grid-boundary); stroke-width:1.2px; stroke-dasharray:4 6; vector-effect: non-scaling-stroke; }
      .g-marker-entry{ fill: var(--grid-marker-warm); stroke: var(--grid-marker-stroke); stroke-width:1px; vector-effect: non-scaling-stroke; }
      .g-hover .g-hover-cell{ fill: var(--grid-hover-fill); stroke: var(--grid-hover-stroke); stroke-width:1.25px; vector-effect: non-scaling-stroke; }
      .g-hover-dot-ring{
        fill: rgba(98, 214, 136, 0.16);
        stroke: rgba(98, 214, 136, 0.55);
        stroke-width: 0.9px;
        vector-effect: non-scaling-stroke;
        pointer-events: none;
      }
      .g-hover-dot{
        fill: rgba(98, 214, 136, 0.95);
        stroke: rgba(210, 255, 226, 0.95);
        stroke-width: 1.1px;
        vector-effect: non-scaling-stroke;
        pointer-events: none;
        filter: drop-shadow(0 0 6px rgba(98, 214, 136, 0.22));
      }
      .g-selected .g-selected-cell{ fill: var(--grid-selected-fill); stroke: var(--grid-selected-stroke); stroke-width:1.8px; vector-effect: non-scaling-stroke; }
      .g-zone{ fill: rgba(120, 168, 200, 0.06); stroke: rgba(140,170,196,0.16); stroke-width:1px; vector-effect: non-scaling-stroke; }
      .g-zone-cell{ fill: rgba(120, 168, 200, 0.08); stroke: rgba(140,170,196,0.10); stroke-width:1px; vector-effect: non-scaling-stroke; }
      .g-zone-cell-route_semantic{ fill: rgba(140, 186, 212, 0.10); }
      .g-zone-cell-hazard_semantic{ fill: rgba(214, 156, 160, 0.12); }
      .g-radius-circle{ fill: rgba(120, 168, 215, 0.04); stroke: rgba(120, 168, 215, 0.18); stroke-width:1px; stroke-dasharray: 3 5; vector-effect: non-scaling-stroke; }
      .g-marker-ring{ fill: rgba(236, 168, 94, 0.10); stroke: rgba(236, 168, 94, 0.34); stroke-width:1.4px; vector-effect: non-scaling-stroke; }
      .g-marker-dot{ fill: var(--grid-marker-warm); stroke: var(--grid-marker-stroke); stroke-width:1.2px; vector-effect: non-scaling-stroke; }
      .g-marker{ cursor:pointer; }
      .g-label{ font-size: 12px; font-weight: 800; letter-spacing: 0.02em; fill: rgba(220, 235, 244, 0.92); paint-order: stroke; stroke: rgba(7, 16, 24, 0.88); stroke-width: 3px; }
      .g-zone-label{ font-size: 11px; font-weight: 850; fill: rgba(190, 210, 224, 0.82); stroke-width: 3px; }

      /* Grid SVG pointer-events contract */
      .g-grid,
      .g-cells,
      .g-boundary,
      .g-zones,
      .g-radius,
      .g-labels,
      .g-hover,
      .g-selected{
        pointer-events:none;
      }
      .g-markers,
      .g-marker,
      .g-marker-hit{
        pointer-events:auto;
      }
      .g-marker-hit{ fill: transparent; cursor:pointer; }
      .g-marker-label,
      .g-zone-label{ pointer-events:none; }

      /* Continuous pointer (follows mouse in SVG space) */
      .g-layer-pointer{ pointer-events:none; display:none; }
      .g-layer-pointer.is-visible{ display:block; }
      .g-pointer-dot-ring{
        fill: rgba(98, 214, 136, 0.16);
        stroke: rgba(98, 214, 136, 0.62);
        stroke-width: 1.0px;
        vector-effect: non-scaling-stroke;
        filter: drop-shadow(0 0 10px rgba(98, 214, 136, 0.16));
      }
      .g-pointer-dot{
        fill: rgba(98, 214, 136, 0.96);
        stroke: rgba(218, 255, 229, 0.96);
        stroke-width: 1.2px;
        vector-effect: non-scaling-stroke;
        filter: drop-shadow(0 0 10px rgba(98, 214, 136, 0.22));
      }

      /* Grid terrain palette (SVG currentColor) */
      .g-cell.terrain-managed{ color: rgba(140, 186, 212, 0.34); }
      .g-cell.terrain-marker{ color: rgba(178, 210, 226, 0.26); }
      .g-cell.terrain-hard-snow{ color: rgba(206, 234, 250, 0.22); }
      .g-cell.terrain-loose-snow{ color: rgba(224, 242, 252, 0.16); }
      .g-cell.terrain-drift{ color: rgba(170, 212, 232, 0.22); }
      .g-cell.terrain-sastrugi{ color: rgba(198, 226, 238, 0.18); }
      .g-cell.terrain-crevasse{ color: rgba(214, 156, 160, 0.22); }
      .g-cell.terrain-shelf-edge{ color: rgba(156, 198, 218, 0.22); }
      .g-cell.terrain-rock{ color: rgba(190, 180, 160, 0.20); }
      .g-cell.terrain-ice-cliff{ color: rgba(160, 200, 220, 0.18); }
      .g-cell.terrain-tide-crack{ color: rgba(178, 206, 224, 0.18); }
      .g-cell.terrain-ice-shelf-surface{ color: rgba(192, 220, 236, 0.20); }
      .g-cell.terrain-dry-valley-rock-desert{ color: rgba(214, 200, 170, 0.16); }
      .g-cell.terrain-subglacial-facility-buried-zone{ color: rgba(200, 210, 220, 0.18); }
      .g-cell.terrain-unknown{ color: rgba(210, 230, 240, 0.12); }
      .g-cell.terrain-empty-inside{ color: rgba(210, 220, 226, 0.08); }
      .vector-preview-svg{
        position:absolute;
        inset:0;
        display:block;
        width:100%;
        height:100%;
        background:
          radial-gradient(1100px 720px at 20% 10%, rgba(255,255,255,0.18), transparent 60%),
          linear-gradient(180deg, var(--preview-canvas-bg), var(--preview-panel-bg-solid));
        border-radius:10px;
      }
      /* Vector preview (screen-space SVG; no group transforms). */
      .v-layer.v-grid line{vector-effect: non-scaling-stroke;}
      /* Region opacity is controlled per-path via fill-opacity; keep CSS neutral. */
      .v-region-fill{opacity:1;}
      .v-region-stroke{vector-effect: non-scaling-stroke;}
      .v-line{vector-effect: non-scaling-stroke;}
      #v-layer-terrain-symbols{ pointer-events:none; }
      .v-terrain-symbol{ pointer-events:none; }
      #v-layer-route-semantics{ pointer-events:none; }
      .v-route-seg,
      .v-route-post,
      .v-route-post-tick{ pointer-events:none; }
      .preview-hit-node{pointer-events:all;}
      .v-node-chip, .v-label, .v-label-chip, .v-label-leader{pointer-events:none;}
      .preview-node--entry .preview-node-entry-inner-glow{filter: drop-shadow(0 0 6px rgba(120,168,215,0.18));}
      .preview-entry-footprint{
        fill: var(--preview-entry-footprint-fill);
        stroke: var(--preview-entry-footprint-stroke);
        stroke-width: 1.25px;
        stroke-dasharray: 3 2;
        vector-effect: non-scaling-stroke;
        filter: url(#entry-footprint-soft-glow);
        pointer-events: none;
      }
      .v-label{
        font-size:12px;
        font-weight:700;
        letter-spacing:0.06em;
        fill: var(--preview-label-text);
        paint-order: stroke;
        stroke: rgba(0,0,0,0);
        stroke-width: 0;
      }
      .v-label-chip rect{
        fill: var(--preview-label-chip-bg);
        stroke: var(--preview-label-chip-border);
        stroke-width: 1px;
        vector-effect: non-scaling-stroke;
        rx: 8px;
        ry: 8px;
        filter: drop-shadow(0 1px 0 rgba(255,255,255,0.03)) drop-shadow(0 8px 18px rgba(0,0,0,0.16));
      }
      .v-label-chip text{
        fill: var(--preview-label-chip-text);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.02em;
        dominant-baseline: central;
        text-anchor: middle;
      }
      .v-label-leader{
        stroke: rgba(140,170,196,0.32);
        stroke-width: 1px;
        vector-effect: non-scaling-stroke;
        stroke-dasharray: 2 4;
      }
      .v-node-glow{fill: var(--preview-node-glow);}
      .v-node-dot{fill: var(--preview-node-blue); stroke: rgba(255,255,255,0.14); stroke-width:2; vector-effect: non-scaling-stroke;}
      .v-node-chip rect{fill: var(--preview-chip-bg); stroke: var(--preview-chip-stroke); stroke-width:1; vector-effect: non-scaling-stroke;}
      .v-node-chip text{font-size:12px; fill: var(--preview-chip-text);}

      .preview-theme-toggle{
        margin-left:10px;
        width:34px;
        height:34px;
        border-radius:10px;
        border:1px solid var(--preview-border-strong);
        background: var(--preview-control-bg);
        color: var(--preview-control-text);
        cursor:pointer;
        display:flex;
        align-items:center;
        justify-content:center;
        user-select:none;
      }
      .preview-theme-toggle:hover{ background: var(--preview-control-bg-hover); }
      html[data-preview-theme="dark"] .preview-theme-toggle{ background: var(--preview-control-bg); }
      .preview-theme-toggle:focus-visible{ box-shadow: 0 0 0 3px rgba(126,175,220,0.22); outline:none; }

      /* Dark readability: ensure common controls/sections don't inherit light grays */
      html[data-preview-theme="dark"] .mode-toggle,
      html[data-preview-theme="dark"] .sidebar-tab,
      html[data-preview-theme="dark"] .sidebar-collapse,
      html[data-preview-theme="dark"] .sidebar-expand,
      html[data-preview-theme="dark"] .layer-toggle,
      html[data-preview-theme="dark"] .search-clear,
      html[data-preview-theme="dark"] .result-item,
      html[data-preview-theme="dark"] .audit-item{
        border-color: var(--preview-border);
      }

      .preview-hover-tooltip{
        position:absolute;
        z-index:30;
        pointer-events:none;
        max-width: 260px;
        padding:8px 10px;
        border-radius:10px;
        border:1px solid var(--preview-border);
        background: var(--preview-panel-bg);
        color: var(--preview-text);
        box-shadow: 0 10px 22px rgba(0,0,0,0.14);
        font-size:12px;
        line-height:1.35;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      /* Canvas interaction: prevent accidental text selection (scoped). */
      #preview-svg-viewport,
      #preview-svg-viewport *,
      .preview-ruler-left,
      .preview-ruler-left *,
      .preview-ruler-bottom,
      .preview-ruler-bottom *,
      .grid-debug,
      .grid-debug *,
      .grid-preview-svg,
      .grid-preview-svg *,
      .grid-preview-toolbar,
      .grid-preview-toolbar *{
        -webkit-user-select:none;
        user-select:none;
        -webkit-user-drag:none;
      }
      /* Keep labels non-interactive and non-selectable. */
      .grid-preview-svg text,
      .g-marker-label,
      .g-zone-label{
        -webkit-user-select:none;
        user-select:none;
        pointer-events:none;
      }
      html[data-preview-theme="dark"] .preview-hover-tooltip{
        background: var(--preview-panel-bg);
        color: var(--preview-text-strong);
        border-color: var(--preview-border-strong);
        box-shadow: 0 12px 26px rgba(0,0,0,0.28);
      }
      #wilderness-preview-map{
        display:grid;
        grid-template-columns: repeat(var(--grid-cols), 28px);
        grid-auto-rows: 28px;
        gap:2px;
        width: max-content;
        padding:2px;
        border-radius:10px;
        background:
          repeating-linear-gradient(0deg, rgba(31,35,40,0.035), rgba(31,35,40,0.035) 1px, transparent 1px, transparent 24px),
          repeating-linear-gradient(90deg, rgba(31,35,40,0.035), rgba(31,35,40,0.035) 1px, transparent 1px, transparent 24px),
          linear-gradient(180deg, rgba(255,255,255,0.25), rgba(255,255,255,0.08));
        position:relative;
      }
      .wilderness-cell{
        border:1px solid rgba(183,176,160,0.75);
        border-radius:6px;
        background: rgba(255,255,255,0.45);
        color: var(--ink);
        padding:0;
        cursor:pointer;
        position:relative;
        overflow:hidden;
        display:flex;
        align-items:center;
        justify-content:center;
        outline:none;
      }
      .wilderness-cell:focus-visible{
        box-shadow: 0 0 0 3px rgba(43,79,116,0.25);
      }
      .wilderness-cell.is-selected{
        box-shadow: 0 0 0 2px rgba(107,43,43,0.25), 0 0 0 5px rgba(107,43,43,0.12);
      }
      .cell-label{
        font-size:12px;
        letter-spacing:0.06em;
        color: rgba(31,35,40,0.92);
        text-shadow: 0 1px 0 rgba(255,255,255,0.35);
      }

      /* Terrain swatches (low saturation, blueprint-like) */
      .terrain-managed{
        background:
          repeating-linear-gradient(0deg, rgba(0,0,0,0.06), rgba(0,0,0,0.06) 2px, rgba(255,255,255,0.55) 2px, rgba(255,255,255,0.55) 6px),
          linear-gradient(180deg, rgba(235,235,235,0.9), rgba(248,248,248,0.65));
      }
      .terrain-marker{
        background:
          radial-gradient(circle at 6px 6px, rgba(43,79,116,0.28) 0 1px, transparent 2px),
          radial-gradient(circle at 18px 14px, rgba(43,79,116,0.22) 0 1px, transparent 2px),
          linear-gradient(180deg, rgba(220,230,238,0.85), rgba(245,248,252,0.55));
      }
      .terrain-hard-snow{
        background:
          repeating-linear-gradient(135deg, rgba(43,79,116,0.12), rgba(43,79,116,0.12) 2px, rgba(255,255,255,0.55) 2px, rgba(255,255,255,0.55) 7px),
          linear-gradient(180deg, rgba(214,224,232,0.88), rgba(246,248,250,0.55));
      }
      .terrain-loose-snow{
        background:
          radial-gradient(circle at 10px 10px, rgba(31,35,40,0.08) 0 1px, transparent 2px),
          radial-gradient(circle at 18px 18px, rgba(31,35,40,0.06) 0 1px, transparent 2px),
          linear-gradient(180deg, rgba(240,242,244,0.9), rgba(255,255,255,0.6));
      }
      .terrain-drift{
        background:
          radial-gradient(circle at 8px 18px, rgba(43,79,116,0.14) 0 6px, transparent 7px),
          radial-gradient(circle at 18px 8px, rgba(43,79,116,0.10) 0 5px, transparent 6px),
          linear-gradient(180deg, rgba(210,222,235,0.75), rgba(245,248,252,0.45));
      }
      .terrain-sastrugi{
        background:
          repeating-linear-gradient(115deg, rgba(31,35,40,0.10), rgba(31,35,40,0.10) 1px, transparent 1px, transparent 4px),
          linear-gradient(180deg, rgba(232,232,232,0.85), rgba(252,252,252,0.55));
      }
      .terrain-crevasse{
        background:
          repeating-linear-gradient(45deg, rgba(107,43,43,0.18), rgba(107,43,43,0.18) 2px, transparent 2px, transparent 6px),
          linear-gradient(180deg, rgba(210,200,215,0.9), rgba(245,240,248,0.55));
        border-color: rgba(107,43,43,0.35);
      }
      .terrain-shelf-edge{
        background:
          linear-gradient(90deg, rgba(43,79,116,0.55) 0 4px, transparent 4px 100%),
          linear-gradient(180deg, rgba(160,180,200,0.88), rgba(230,238,246,0.52));
        border-color: rgba(43,79,116,0.35);
      }
      .terrain-tide-crack{
        background:
          repeating-linear-gradient(45deg, rgba(43,79,116,0.12), rgba(43,79,116,0.12) 2px, transparent 2px, transparent 8px),
          linear-gradient(180deg, rgba(214,226,238,0.82), rgba(250,252,255,0.52));
        border-color: rgba(43,79,116,0.28);
      }
      .terrain-ice-shelf-surface{
        background:
          radial-gradient(circle at 14px 10px, rgba(43,79,116,0.10) 0 6px, transparent 7px),
          linear-gradient(180deg, rgba(206,234,250,0.78), rgba(250,252,255,0.52));
        border-color: rgba(120,160,190,0.24);
      }
      .terrain-dry-valley-rock-desert{
        background:
          radial-gradient(circle at 10px 14px, rgba(90,70,55,0.20) 0 5px, transparent 6px),
          repeating-linear-gradient(120deg, rgba(90,70,55,0.10), rgba(90,70,55,0.10) 1px, transparent 1px, transparent 5px),
          linear-gradient(180deg, rgba(234,222,200,0.78), rgba(252,248,238,0.52));
        border-color: rgba(90,70,55,0.26);
      }
      .terrain-subglacial-facility-buried-zone{
        background:
          repeating-linear-gradient(90deg, rgba(31,35,40,0.10), rgba(31,35,40,0.10) 2px, transparent 2px, transparent 7px),
          linear-gradient(180deg, rgba(220,228,235,0.78), rgba(252,252,252,0.52));
        border-color: rgba(100,110,120,0.22);
      }
      .terrain-rock{
        background:
          radial-gradient(circle at 10px 10px, rgba(90,70,55,0.25) 0 5px, transparent 6px),
          radial-gradient(circle at 20px 18px, rgba(90,70,55,0.18) 0 4px, transparent 5px),
          linear-gradient(180deg, rgba(210,202,190,0.85), rgba(246,242,236,0.55));
      }
      .terrain-ice-cliff{
        background:
          repeating-linear-gradient(90deg, rgba(43,79,116,0.22), rgba(43,79,116,0.22) 3px, transparent 3px, transparent 7px),
          linear-gradient(180deg, rgba(150,170,190,0.85), rgba(220,230,240,0.5));
        border-color: rgba(107,43,43,0.35);
      }
      .terrain-unknown{
        background: linear-gradient(180deg, rgba(240,240,240,0.9), rgba(255,255,255,0.6));
      }
      .terrain-empty-inside{
        background:
          repeating-linear-gradient(45deg, rgba(31,35,40,0.05), rgba(31,35,40,0.05) 1px, transparent 1px, transparent 6px),
          linear-gradient(180deg, rgba(255,255,255,0.26), rgba(255,255,255,0.10));
        border-color: rgba(139,162,174,0.22);
      }
      .terrain-boundary{
        background:
          repeating-linear-gradient(45deg, rgba(12,18,26,0.18), rgba(12,18,26,0.18) 2px, transparent 2px, transparent 8px),
          linear-gradient(180deg, rgba(18,26,34,0.38), rgba(18,26,34,0.18));
        border-color: rgba(69,86,96,0.56);
      }

      .cell-detail-panel{
        border:1px solid var(--preview-border);
        border-radius:10px;
        background: var(--preview-card-bg);
        padding:12px 12px;
      }
      .detail-title{
        font-weight:700;
        color: var(--preview-text-strong);
        margin-bottom:8px;
      }
      .detail-empty{ margin-bottom:12px; }
      .detail-section{ margin-top:12px; padding-top:12px; border-top: 1px solid rgba(139,162,174,0.20); }
      .detail-section-title{
        font-size:12px;
        letter-spacing:0.12em;
        color: var(--preview-faint);
        margin-bottom:10px;
        font-weight:900;
      }
      .detail-kvs{display:grid; grid-template-columns: 128px 1fr; gap:8px 10px; align-items:start;}
      .detail-kvs .k{color:var(--preview-muted);}
      .detail-kvs .v{color:var(--preview-text);}
      .v-mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .v-em{ color: rgba(184, 134, 28, 0.88); }

      .legend-swatch{
        display:inline-block;
        width:42px; height:18px;
        border:1px solid rgba(183,176,160,0.85);
        border-radius:6px;
        vertical-align:middle;
      }

      /* Semantic layer */
      .semantic-layer{
        position:absolute;
        inset:2px;
        pointer-events:none;
      }
      /* Grid mode contract: all map-bound objects must live in SVG coord space. */
      .grid-debug.is-active .semantic-layer{ display:none !important; }
      .semantic-canvas{
        position:absolute;
        inset:0;
      }
      .semantic-source-note{
        position:absolute;
        left:10px;
        top:10px;
        background: rgba(12, 18, 26, 0.48);
        border:1px dashed rgba(139,162,174,0.26);
        padding:6px 8px;
        border-radius:10px;
        font-size:12px;
        pointer-events:none;
        max-width: 520px;
      }
      .semantic-zone{
        position:absolute;
        box-sizing:border-box;
      }
      .semantic-zone-fence{
        border-radius:8px;
      }
      .semantic-zone-fill{
        position:absolute;
        inset:0;
        border-radius:8px;
      }
      .semantic-circle{
        border-radius:999px;
      }
      .semantic-floating-label{
        position:absolute;
        font-size:12px;
        letter-spacing:0.06em;
        background: rgba(12, 18, 26, 0.46);
        border:1px solid rgba(139,162,174,0.22);
        padding:2px 6px;
        border-radius:999px;
        color: var(--preview-text);
        pointer-events:none;
        transform: translateY(-2px);
        white-space:nowrap;
      }
      .semantic-marker{
        position:absolute;
        width:28px;
        height:28px;
        border:0;
        background: transparent;
        padding:0;
        margin:0;
        pointer-events:auto;
        cursor:pointer;
      }
      .semantic-marker-dot{
        position:absolute;
        left:50%;
        top:50%;
        width:10px;
        height:10px;
        border-radius:999px;
        transform: translate(-50%,-50%);
        background: var(--grid-marker-warm);
        border:2px solid var(--grid-marker-stroke);
        box-shadow:
          0 0 0 3px rgba(236, 168, 94, 0.16),
          0 0 0 7px rgba(236, 168, 94, 0.08),
          0 10px 18px rgba(0,0,0,0.28);
      }
      .semantic-marker.implemented-location .semantic-marker-dot{
        background: var(--grid-marker-warm);
      }
      .semantic-marker:hover .semantic-marker-dot{
        transform: translate(-50%,-50%) scale(1.12);
        box-shadow:
          0 0 0 3px rgba(236, 168, 94, 0.22),
          0 0 0 8px rgba(236, 168, 94, 0.10),
          0 12px 20px rgba(0,0,0,0.32);
      }
      .semantic-marker.is-selected .semantic-marker-dot{
        box-shadow:
          0 0 0 2px rgba(240, 207, 112, 0.18),
          0 0 0 5px rgba(240, 207, 112, 0.12),
          0 0 0 9px rgba(240, 207, 112, 0.08),
          0 12px 22px rgba(0,0,0,0.34);
      }

      /* Semantic fences */
      .fence-common{
        border:1px dashed rgba(90,95,102,0.35);
      }
      .common-travel-segment.semantic-zone-fence .semantic-zone-fill{
        background: rgba(180,190,205,0.10);
      }
      .fence-route{
        border:1px dashed rgba(43,79,116,0.45);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35);
      }
      .fence-semantic{
        border:1px solid rgba(43,79,116,0.30);
        background: rgba(43,79,116,0.06);
      }
      .fence-implemented{
        border:1px solid rgba(43,79,116,0.45);
      }
      .fence-perimeter{
        border:1px dashed rgba(43,79,116,0.35);
        background: rgba(43,79,116,0.04);
      }
      .fence-hazard{
        border:1px solid rgba(107,43,43,0.35);
        background:
          repeating-linear-gradient(45deg, rgba(107,43,43,0.10), rgba(107,43,43,0.10) 3px, transparent 3px, transparent 7px);
      }

      /* Layer visibility toggles */
      body.layer-terrain-off .wilderness-cell{ opacity:0.22; }
      body.layer-semantic-off .semantic-layer [data-layer="semantic"]{ display:none; }
      body.layer-landmark-off .semantic-layer [data-layer="landmark"]{ display:none; }
      body.layer-risk-off .semantic-layer [data-layer="risk"]{ display:none; }

      .wilderness-cell.is-highlight{
        box-shadow: 0 0 0 2px rgba(43,79,116,0.22), 0 0 0 6px rgba(43,79,116,0.12);
      }

      /* Flagged marker corridor cell outlines (only for flagged_marker_line) */
      .v-route-cell-outline{
        fill: rgba(92, 132, 156, 0.06);
        stroke: rgba(228, 252, 255, 0.44);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
        pointer-events: none;
      }
      .v-route-cell-outline--junction{
        stroke: rgba(240, 252, 255, 0.62);
        fill: rgba(92, 132, 156, 0.10);
      }

      /* Search & audit */
      .search-bar{display:flex; gap:10px; align-items:center; flex-wrap:wrap;}
      .search-input{
        flex: 1 1 320px;
        border:1px solid var(--preview-border);
        background: var(--preview-input-bg);
        color: var(--preview-input-text);
        padding:10px 12px;
        border-radius:10px;
        outline:none;
      }
      .search-input::placeholder{color: var(--preview-faint);}
      .search-input:focus-visible{ box-shadow: 0 0 0 3px rgba(43,79,116,0.18); }
      .search-clear{
        border:1px solid var(--preview-border);
        background: var(--preview-control-bg);
        color: var(--preview-control-text);
        padding:10px 12px;
        border-radius:10px;
        cursor:pointer;
      }
      .search-clear:hover{ background: var(--preview-control-bg-hover); }
      .search-results{ margin-top:12px; }
      .result-group{ border-top:1px solid rgba(183,176,160,0.65); padding-top:10px; margin-top:10px; }
      .result-group-title{ font-weight:700; margin-bottom:8px; }
      .result-items{ display:flex; flex-direction:column; gap:8px; }
      .result-item{
        text-align:left;
        border:1px solid var(--preview-border);
        background: var(--preview-control-bg);
        color: var(--preview-control-text);
        border-radius:10px;
        padding:10px 10px;
        cursor:pointer;
      }
      .result-item:hover{ background: var(--preview-control-bg-hover); }
      .result-sub{ margin-top:4px; font-size:12px; }

      .audit-summary{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:12px; }
      .audit-pill{
        border:1px solid var(--preview-border);
        background: var(--preview-control-bg);
        color: var(--preview-control-text);
        padding:6px 10px;
        border-radius:999px;
      }
      .audit-red{ border-color: rgba(107,43,43,0.35); background: rgba(107,43,43,0.06); }
      .audit-yellow{ border-color: rgba(140,110,30,0.35); background: rgba(140,110,30,0.06); }
      .audit-gray{ border-color: rgba(90,95,102,0.35); background: rgba(90,95,102,0.04); }
      .audit-lists{ display:grid; grid-template-columns: 1fr; gap:12px; }
      .audit-title{ font-weight:800; margin-bottom:8px; }
      .audit-section{ border-top:1px solid rgba(183,176,160,0.65); padding-top:10px; }
      .audit-list{ display:flex; flex-direction:column; gap:8px; }
      .audit-item{
        text-align:left;
        border:1px solid var(--preview-border);
        background: var(--preview-control-bg);
        color: var(--preview-control-text);
        border-radius:10px;
        padding:10px 10px;
        cursor:pointer;
      }
      .audit-item:hover{ background: var(--preview-control-bg-hover); }
      .audit-item-msg{ margin-top:4px; font-size:12px; }
      .footer{
        margin-top:18px;
        padding-top:12px;
        border-top:2px solid var(--preview-border);
        color:var(--preview-muted);
        font-size:12px;
      }
      .evidence{
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap:10px 14px;
        margin-top:10px;
      }
      @media (max-width: 980px){ .evidence{grid-template-columns:1fr;} }
      .evidence pre{
        margin:0;
        padding:10px 10px;
        background: rgba(255,255,255,0.45);
        border:1px solid rgba(183,176,160,0.7);
        border-radius:10px;
        overflow:auto;
        max-height:220px;
      }

      ${renderBlueprintStyles()}
    </style>
  </head>
  <body>
    <div class="preview-workbench mode-brief">
      ${renderToolbarHtml({ areaSpec, gridVm })}

      <div class="preview-main preview-main" id="preview-main">
        <div class="preview-map-pane preview-map-pane" id="preview-map-pane">
          <div class="preview-map-pane-inner">
            ${renderGridHtml({ gridVm, semanticLayerVm, vectorVm: sourceVm.vectorVm })}
          </div>
        </div>
        ${renderSidebarHtml({ areaSpec, legendVm, implLegendVm })}
      </div>

      <div class="sidebar-collapsed-peek">
        <button type="button" class="sidebar-expand" id="sidebar-expand-btn" data-preview-action="expand-sidebar">展开档案栏</button>
      </div>

      ${renderAppendixHtml({ sourceVm, semanticLayerVm, nowIso })}
    </div>
    <script id="wilderness-search-index" type="application/json">${jsonForScriptTag(sourceVm.searchIndexVm)}</script>
    <script id="wilderness-audit-vm" type="application/json">${jsonForScriptTag(sourceVm.auditVm)}</script>
    ${renderSearchRuntimeScript({ terrainOptions })}
    <script>
      (function(){
        const collapseBtn = document.getElementById("sidebar-collapse-btn");
        const expandBtn = document.getElementById("sidebar-expand-btn");
        function setCollapsed(v){ document.body.classList.toggle("sidebar-collapsed", !!v); }
        collapseBtn?.addEventListener("click", () => setCollapsed(true));
        expandBtn?.addEventListener("click", () => setCollapsed(false));

        const tabs = document.querySelectorAll(".sidebar-tab");
        const panels = document.querySelectorAll(".sidebar-panel");
        function activate(name){
          tabs.forEach((t) => t.classList.toggle("is-active", t.getAttribute("data-tab") === name));
          panels.forEach((p) => p.classList.toggle("is-active", p.getAttribute("data-panel") === name));
          tabs.forEach((t) => t.setAttribute("aria-selected", t.getAttribute("data-tab") === name ? "true" : "false"));
        }
        // Expose for selection + blueprint actions (UI only; not persisted).
        window.activateSidebarTab = activate;
        tabs.forEach((t) => t.addEventListener("click", () => activate(t.getAttribute("data-tab"))));
        activate("cell");
      })();
    </script>
  </body>
</html>
`;
}

async function main() {
  const areaId = process.argv[2];
  if (!areaId) {
    throw new Error(`缺少参数：areaId。用法：node scripts/wilderness_area_preview_export.mjs ${SAMPLE_AREA_ID}`);
  }
  if (areaId !== SAMPLE_AREA_ID) {
    throw new Error(`当前仅支持样板区域：${SAMPLE_AREA_ID}（收到：${areaId}）`);
  }

  // Optional: --out <path>
  let outOverride = null;
  for (let i = 3; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--out") {
      const p = process.argv[i + 1];
      if (!p) throw new Error("参数错误：--out 需要跟一个路径。");
      outOverride = p;
      i++;
      continue;
    }
  }

  const { areaSpec, terrainDefs, sourcePaths } = loadWildernessPreviewSource(areaId);
  ensureRequiredLandmarks(areaSpec);

  const gridVm = buildWildernessGridVm({ areaSpec, terrainDefs });
  const terrainOptions = buildBlueprintTerrainOptions(terrainDefs);
  const legendVm = buildLegendVm({ usedTerrainIds: gridVm.usedTerrainIds });
  const semanticLayerVm = buildWildernessSemanticLayerVm({ areaSpec, gridVm });
  const implLegendVm = buildImplementationLegendVm();
  const vectorVm = buildWildernessVectorPreviewVm({ areaSpec, gridVm, semanticLayerVm });
  const searchIndexVm = buildWildernessSearchIndex({ areaSpec, gridVm, semanticLayerVm });
  const auditVm = buildWildernessPreviewAuditVm({ areaSpec, gridVm, semanticLayerVm, terrainDefs });

  const sourceVm = {
    areaSpec,
    terrainDefsCount: terrainDefs.length,
    sourcePaths,
    vectorVm,
    searchIndexVm,
    auditVm
  };

  const repoRoot = path.resolve(__dirname, "..");
  const tempDir = path.resolve(repoRoot, "temp");
  const auditOutPath = path.resolve(tempDir, OUTPUT_HTML_BASENAME);
  const stableOutPath = outOverride
    ? path.resolve(repoRoot, outOverride)
    : path.resolve(repoRoot, STABLE_INDEX_REL);

  const html = renderWildernessPreviewHtml({ sourceVm, gridVm, legendVm, implLegendVm, semanticLayerVm, terrainOptions });
  if (process.env.WILDERNESS_PREVIEW_SKIP_SYNTAX_CHECK !== "1") {
    assertGeneratedHtmlScriptsParse(html, "wilderness_area_preview/index.html");
    process.stdout.write("OK: html inline script syntax check passed\n");
  }

  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(auditOutPath, html, "utf8");

  await fs.mkdir(path.dirname(stableOutPath), { recursive: true });
  await fs.writeFile(stableOutPath, html, "utf8");

  process.stdout.write(`OK: wrote ${auditOutPath}\n`);
  process.stdout.write(`OK: wrote ${stableOutPath}\n`);
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + "\n");
  process.exitCode = 1;
});
