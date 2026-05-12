/**
 * Blueprint fragments for wilderness area preview exporter.
 * Pure string builders + small helpers only (no IO, no DOM).
 */
 
const BLUEPRINT_TERRAIN_STYLE_REGISTRY = Object.freeze({
  // 1) 人工 / 管理通行类
  managed_compacted_route: {
    family: "managed",
    fill: "rgba(86, 110, 132, 0.38)",
    stroke: "rgba(162, 198, 228, 0.62)",
    pattern: "plain-route",
    danger: "low"
  },
  flagged_marker_line: {
    family: "managed",
    fill: "rgba(18, 44, 74, 0.44)",
    stroke: "rgba(112, 190, 255, 0.82)",
    pattern: "marker-line",
    danger: "low"
  },
  subglacial_facility_buried_zone: {
    family: "managed",
    fill: "rgba(92, 92, 92, 0.34)",
    stroke: "rgba(188, 198, 205, 0.72)",
    pattern: "industrial-grid",
    danger: "mid_high"
  },

  // 2) 雪面类
  wind_packed_snow: {
    family: "snow",
    fill: "rgba(214, 234, 244, 0.42)",
    stroke: "rgba(150, 188, 210, 0.65)",
    pattern: "wind-streak",
    danger: "low"
  },
  loose_snowfield: {
    family: "snow",
    fill: "rgba(236, 246, 252, 0.44)",
    stroke: "rgba(164, 196, 214, 0.62)",
    pattern: "snow-speckle",
    danger: "mid"
  },
  snow_drift_zone: {
    family: "snow",
    fill: "rgba(226, 232, 236, 0.42)",
    stroke: "rgba(150, 160, 168, 0.66)",
    pattern: "snow-drift",
    danger: "mid_high"
  },
  sastrugi_field: {
    family: "snow",
    fill: "rgba(238, 244, 248, 0.40)",
    stroke: "rgba(160, 178, 190, 0.66)",
    pattern: "ridge-lines",
    danger: "mid"
  },

  // 3) 陆冰 / 冰盖 / 冰川类
  blue_ice_area: {
    family: "glacial",
    fill: "rgba(88, 176, 232, 0.30)",
    stroke: "rgba(136, 220, 255, 0.72)",
    pattern: "ice-glint",
    danger: "mid"
  },
  ice_sheet_plateau: {
    family: "glacial",
    fill: "rgba(182, 222, 240, 0.32)",
    stroke: "rgba(160, 198, 214, 0.55)",
    pattern: "low-texture",
    danger: "mid"
  },
  polar_plateau_exposed: {
    family: "glacial",
    fill: "rgba(58, 74, 92, 0.36)",
    stroke: "rgba(170, 206, 224, 0.52)",
    pattern: "wind-streak-long",
    danger: "high"
  },
  glacier_surface: {
    family: "glacial",
    fill: "rgba(128, 196, 232, 0.28)",
    stroke: "rgba(182, 234, 255, 0.70)",
    pattern: "ice-flow",
    danger: "mid_high"
  },
  crevasse_field: {
    family: "glacial",
    fill: "rgba(44, 54, 84, 0.42)",
    stroke: "rgba(28, 18, 36, 0.80)",
    pattern: "crack-lines",
    danger: "hard"
  },

  // 4) 冰架 / 海冰 / 海岸类
  ice_shelf_surface: {
    family: "shelf_sea",
    fill: "rgba(96, 196, 206, 0.26)",
    stroke: "rgba(170, 236, 242, 0.62)",
    pattern: "shelf-band",
    danger: "mid"
  },
  ice_shelf_edge: {
    family: "shelf_sea",
    fill: "rgba(22, 46, 54, 0.46)",
    stroke: "rgba(130, 206, 214, 0.60)",
    pattern: "edge-jag",
    danger: "hard"
  },
  sea_ice_fast: {
    family: "shelf_sea",
    fill: "rgba(88, 210, 188, 0.22)",
    stroke: "rgba(188, 250, 232, 0.56)",
    pattern: "polygon-crack",
    danger: "mid"
  },
  sea_ice_pressure_ridge: {
    family: "shelf_sea",
    fill: "rgba(124, 170, 176, 0.26)",
    stroke: "rgba(216, 244, 246, 0.54)",
    pattern: "ridge-zigzag",
    danger: "mid_high"
  },
  tide_crack_zone: {
    family: "shelf_sea",
    fill: "rgba(10, 18, 28, 0.56)",
    stroke: "rgba(86, 160, 196, 0.58)",
    pattern: "central-crack",
    danger: "hard"
  },
  ice_cliff_coast: {
    family: "shelf_sea",
    fill: "rgba(12, 22, 38, 0.56)",
    stroke: "rgba(110, 178, 212, 0.60)",
    pattern: "cliff-hatch",
    danger: "hard"
  },

  // 5) 岩地 / 干谷类
  rock_outcrop_nunatak: {
    family: "rock",
    fill: "rgba(168, 150, 132, 0.30)",
    stroke: "rgba(96, 70, 52, 0.58)",
    pattern: "rock-speckle",
    danger: "mid_high"
  },
  dry_valley_rock_desert: {
    family: "rock",
    fill: "rgba(210, 196, 162, 0.30)",
    stroke: "rgba(132, 110, 72, 0.52)",
    pattern: "sand-speckle",
    danger: "mid"
  }
});

const BLUEPRINT_TERRAIN_STYLE_FALLBACK = Object.freeze({
  family: "neutral",
  fill: "rgba(210, 220, 226, 0.22)",
  stroke: "rgba(140, 160, 172, 0.55)",
  pattern: "low-texture",
  danger: "low"
});

function getBlueprintTerrainStyle(terrainId) {
  const id = String(terrainId ?? "").trim();
  return BLUEPRINT_TERRAIN_STYLE_REGISTRY[id] ?? BLUEPRINT_TERRAIN_STYLE_FALLBACK;
}

function familyLabel(family) {
  const f = String(family ?? "").trim();
  const map = {
    managed: "人工 / 管理",
    snow: "雪面",
    glacial: "陆冰 / 冰川",
    shelf_sea: "冰架 / 海冰 / 海岸",
    rock: "岩地 / 干谷",
    neutral: "未分组"
  };
  return map[f] ?? "未分组";
}

export function buildBlueprintTerrainOptions(terrainDefs) {
  const defs = Array.isArray(terrainDefs) ? terrainDefs : [];
  const out = [];
  for (const def of defs) {
    if (!def || typeof def !== "object") continue;
    const id = String(def.id ?? "").trim();
    if (!id) continue;
    const label = String(def.label ?? def.id ?? id).trim() || id;
    out.push({ id, label });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN-u-co-pinyin", { sensitivity: "base" }));
  return out;
}
 
export function renderBlueprintStyles() {
  return `
/* --- Blueprint (vector mode only) --- */
.preview-svg-viewport.is-blueprint-editing{ user-select:none; cursor: crosshair; }
.preview-svg-viewport.is-blueprint-editing *{ user-select:none; }

#v-layer-blueprint-cells,
#v-layer-blueprint-diff,
#v-layer-blueprint-special,
#v-layer-blueprint-labels,
#v-layer-blueprint-brush{
  pointer-events:none;
}

/* Blend mode classes live on #vector-preview-svg */
/* Onion: show base + blueprint; base is faded. */
#vector-preview-svg.is-blueprint-onion #v-layer-grid,
#vector-preview-svg.is-blueprint-onion #v-layer-fill,
#vector-preview-svg.is-blueprint-onion #v-layer-boundary,
#vector-preview-svg.is-blueprint-onion #v-layer-terrain-symbols,
#vector-preview-svg.is-blueprint-onion #v-layer-route-semantics,
#vector-preview-svg.is-blueprint-onion #v-layer-entry-footprint,
#vector-preview-svg.is-blueprint-onion #v-layer-lines,
#vector-preview-svg.is-blueprint-onion #v-layer-labels,
#vector-preview-svg.is-blueprint-onion #v-layer-nodes{
  opacity: 0.22;
}

/* Top-only: must hide ALL base layers (terrain, nodes, labels, facilities, helpers). */
#vector-preview-svg.is-blueprint-top-only #v-layer-grid,
#vector-preview-svg.is-blueprint-top-only #v-layer-fill,
#vector-preview-svg.is-blueprint-top-only #v-layer-boundary,
#vector-preview-svg.is-blueprint-top-only #v-layer-terrain-symbols,
#vector-preview-svg.is-blueprint-top-only #v-layer-route-semantics,
#vector-preview-svg.is-blueprint-top-only #v-layer-entry-footprint,
#vector-preview-svg.is-blueprint-top-only #v-layer-lines,
#vector-preview-svg.is-blueprint-top-only #v-layer-labels,
#vector-preview-svg.is-blueprint-top-only #v-layer-nodes{
  display:none;
}

#vector-preview-svg.is-blueprint-bottom-only #v-layer-blueprint-cells,
#vector-preview-svg.is-blueprint-bottom-only #v-layer-blueprint-diff,
#vector-preview-svg.is-blueprint-bottom-only #v-layer-blueprint-special,
#vector-preview-svg.is-blueprint-bottom-only #v-layer-blueprint-labels,
#vector-preview-svg.is-blueprint-bottom-only #v-layer-blueprint-brush{
  display:none;
}

/* --- terrain_add symbol system --- */
.blueprint-terrain-cell{ pointer-events:none; }
.blueprint-terrain-fill{ vector-effect: non-scaling-stroke; }
.blueprint-terrain-pattern{ vector-effect: non-scaling-stroke; pointer-events:none; }
.blueprint-cell-add-frame{
  fill: none;
  stroke: rgba(96, 190, 255, 0.95);
  stroke-width: 1.6px;
  vector-effect: non-scaling-stroke;
}
.blueprint-terrain-danger-frame{
  fill: none;
  stroke: rgba(255, 102, 102, 0.92);
  stroke-width: 2.2px;
  vector-effect: non-scaling-stroke;
}
.blueprint-terrain-danger-frame--high,
.blueprint-terrain-danger-frame--hard{ stroke-width: 2.4px; }

.bp-cell-subtract{
  fill: rgba(14, 20, 28, 0.46);
  stroke: rgba(77,255,166,0.72);
  stroke-width: 1.2px;
  stroke-dasharray: 4 3;
  vector-effect: non-scaling-stroke;
}
.bp-cell-subtract-hatch{
  stroke: rgba(77,255,166,0.35);
  stroke-width: 1.0px;
  stroke-dasharray: 2 4;
  vector-effect: non-scaling-stroke;
}

/* Diff highlight (green): ring/corner only (do not cover terrain texture) */
.blueprint-diff-cell{
  fill: rgba(77, 255, 166, 0.06);
  stroke: rgba(77, 255, 166, 0.88);
  stroke-width: 1.6px;
  vector-effect: non-scaling-stroke;
}
.blueprint-diff-corner{
  fill: none;
  stroke: rgba(77, 255, 166, 0.88);
  stroke-width: 2.0px;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

/* Special map cell highlight (yellow) */
.bp-special{
  fill: rgba(255,199,79,0.22);
  stroke: rgba(255,199,79,0.95);
  stroke-width: 1.6px;
  vector-effect: non-scaling-stroke;
}
.bp-special-label{
  font: 12px/1.2 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans SC", "Microsoft YaHei", Arial, sans-serif;
  fill: rgba(255, 246, 230, 0.95);
  stroke: rgba(20, 16, 10, 0.92);
  stroke-width: 3px;
  paint-order: stroke fill;
  letter-spacing: 0.02em;
}

.bp-brush{
  fill: rgba(111, 196, 242, 0.10);
  stroke: rgba(111, 196, 242, 0.75);
  stroke-width: 1.2px;
  vector-effect: non-scaling-stroke;
}

/* Blueprint panel UI */
.blueprint-panel{
  border:1px solid var(--preview-border);
  border-radius: 12px;
  padding:10px;
  background: var(--preview-card-bg);
  margin-bottom: 10px;
}
.blueprint-panel .bp-row{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:6px; }
.blueprint-panel .bp-row:first-child{ margin-top:0; }
.blueprint-panel .bp-title{ font-weight: 900; letter-spacing: 0.06em; }
.blueprint-panel .bp-muted{ color: var(--preview-muted); font-size: 12px; }
.blueprint-panel .bp-select,
.blueprint-panel .bp-input{
  border:1px solid var(--preview-border);
  background: var(--preview-input-bg);
  color: var(--preview-input-text);
  border-radius: 10px;
  padding:6px 8px;
  min-width: 160px;
}
.blueprint-panel .bp-btn{
  border:1px solid var(--preview-border);
  background: var(--preview-control-bg);
  color: var(--preview-control-text);
  border-radius: 999px;
  padding: 6px 10px;
  cursor:pointer;
  font-size: 12px;
  line-height: 1.0;
}
.blueprint-panel .bp-btn:hover{ background: var(--preview-control-bg-hover); }
.blueprint-panel .bp-btn.is-active{ background: rgba(79,152,200,0.18); color: var(--preview-text-strong); }
.blueprint-panel .bp-btn.bp-btn--primary{
  background: rgba(79,152,200,0.20);
  border-color: rgba(79,152,200,0.55);
  color: var(--preview-text-strong);
  font-weight: 900;
}
.blueprint-panel .bp-btn.bp-btn--danger{
  background: rgba(220,80,80,0.10);
  border-color: rgba(220,80,80,0.38);
}
.blueprint-panel .bp-btn.bp-btn--quiet{
  opacity: 0.86;
}
.blueprint-panel .bp-btn.bp-btn--danger:hover{ background: rgba(220,80,80,0.14); }
.blueprint-panel .bp-btn.bp-btn--primary:hover{ background: rgba(79,152,200,0.26); }
.blueprint-panel .bp-btn.bp-btn--danger:active,
.blueprint-panel .bp-btn.bp-btn--primary:active{ transform: translateY(0.5px); }

/* Archive-style lightweight commands (avoid pill overload) */
.blueprint-panel .bp-link{
  border:none;
  background:transparent;
  padding: 4px 2px;
  cursor:pointer;
  color: var(--preview-muted);
  font-size: 12px;
  text-decoration: underline;
  text-decoration-color: rgba(120,140,152,0.35);
  text-underline-offset: 3px;
}
.blueprint-panel .bp-link:hover{
  color: var(--preview-text-strong);
  text-decoration-color: rgba(120,140,152,0.65);
}
.blueprint-panel .bp-link.bp-link--danger{
  color: rgba(210,90,90,0.92);
  text-decoration-color: rgba(210,90,90,0.38);
}
.blueprint-panel .bp-link.bp-link--danger:hover{
  color: rgba(224,102,102,0.98);
  text-decoration-color: rgba(224,102,102,0.64);
}

/* Segmented control for blend mode */
.blueprint-panel .bp-seg{
  display:inline-flex;
  border:1px solid var(--preview-border);
  border-radius: 10px;
  overflow:hidden;
  background: rgba(0,0,0,0.02);
}
.blueprint-panel .bp-seg-btn{
  border:none;
  background: transparent;
  color: var(--preview-control-text);
  padding: 6px 10px;
  font-size: 12px;
  cursor:pointer;
}
.blueprint-panel .bp-seg-btn + .bp-seg-btn{ border-left:1px solid var(--preview-border); }
.blueprint-panel .bp-seg-btn.is-active{
  background: rgba(79,152,200,0.16);
  color: var(--preview-text-strong);
}
.blueprint-panel .bp-seg-btn:hover{ background: rgba(79,152,200,0.08); }

/* Compact toolstrip for paint tool */
.blueprint-panel .bp-toolstrip{
  display:inline-flex;
  border:1px solid var(--preview-border);
  border-radius: 10px;
  overflow:hidden;
  background: rgba(0,0,0,0.02);
}
.blueprint-panel .bp-toolbtn{
  border:none;
  background: transparent;
  color: var(--preview-control-text);
  padding: 6px 10px;
  font-size: 12px;
  min-width: 34px;
  cursor:pointer;
}
.blueprint-panel .bp-toolbtn + .bp-toolbtn{ border-left:1px solid var(--preview-border); }
.blueprint-panel .bp-toolbtn.is-active{
  background: rgba(79,152,200,0.16);
  color: var(--preview-text-strong);
  font-weight: 900;
}
.blueprint-panel .bp-toolbtn:hover{ background: rgba(79,152,200,0.08); }

/* Field-line look (for terrain preview row, reduce card feel) */
.blueprint-panel .bp-fieldline{
  display:flex;
  gap:10px;
  align-items:center;
  padding: 6px 8px;
  border: 1px solid rgba(120,140,152,0.18);
  border-radius: 10px;
  background: rgba(0,0,0,0.02);
}
html[data-preview-theme="dark"] .blueprint-panel .bp-fieldline{
  background: rgba(255,255,255,0.03);
}

/* Blend in form controls */
.blueprint-panel .bp-select{
  min-width: 0;
  height: 32px;
  padding: 5px 8px;
  border-radius: 10px;
  background: rgba(0,0,0,0.02);
}
.blueprint-panel .bp-input{ height: 32px; padding: 5px 8px; }
html[data-preview-theme="dark"] .blueprint-panel .bp-select,
html[data-preview-theme="dark"] .blueprint-panel .bp-input{
  background: rgba(255,255,255,0.04);
}
.blueprint-panel .bp-textarea{
  width:100%;
  min-height: 120px;
  max-height: 160px;
  resize: vertical;
  border:1px solid var(--preview-border);
  background: rgba(0,0,0,0.04);
  color: var(--preview-text);
  border-radius: 10px;
  padding: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.45;
}

.blueprint-panel .bp-sticky{
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--preview-card-bg);
  padding-bottom: 8px;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--preview-border);
}
html[data-preview-theme="dark"] .blueprint-panel .bp-sticky{
  background: var(--preview-card-bg);
}

.blueprint-panel .bp-row.bp-row--tight{ gap:6px; }
.blueprint-panel .bp-row.bp-row--stack{ align-items:stretch; }
.blueprint-panel .bp-row.bp-row--right{ justify-content:flex-end; }
.blueprint-panel .bp-row.bp-row--between{ justify-content:space-between; }

.blueprint-panel .bp-summary-line{
  display:flex;
  gap:10px;
  align-items:center;
  flex-wrap:wrap;
  min-width:0;
}
.blueprint-panel .bp-summary-line code{ font-size: 12px; }

.blueprint-panel .bp-special-inputs[hidden]{ display:none !important; }

.blueprint-panel .bp-terrain-preview{
  display:flex;
  gap:10px;
  align-items:center;
  width:100%;
}
.bp-swatch{
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--preview-border);
  overflow:hidden;
  flex: 0 0 auto;
}
.bp-terrain-preview .bp-terrain-lines{ min-width:0; }
.bp-terrain-preview .bp-terrain-name{ font-weight: 900; color: var(--preview-text-strong); line-height:1.05; }
.bp-terrain-preview .bp-terrain-meta{ color: var(--preview-muted); font-size: 11px; line-height:1.05; margin-top:2px; }
.bp-terrain-preview .bp-terrain-meta code{ font-size: 11px; }

.bp-legend details{ width:100%; }
.bp-legend summary{ cursor:pointer; user-select:none; color: var(--preview-text-strong); font-weight: 800; }
.bp-legend .bp-legend-body{ margin-top: 8px; display:flex; flex-direction:column; gap:10px; }
.bp-legend .bp-legend-family{ border:1px solid var(--preview-border); border-radius: 10px; padding: 8px 10px; background: rgba(255,255,255,0.26); }
html[data-preview-theme="dark"] .bp-legend .bp-legend-family{ background: rgba(0,0,0,0.10); }
.bp-legend .bp-legend-family-title{ font-weight: 900; letter-spacing: 0.06em; font-size: 12px; color: var(--preview-text-strong); margin-bottom: 6px; }
.bp-legend .bp-legend-items{ display:flex; flex-direction:column; gap:6px; }
.bp-legend .bp-legend-item{ display:flex; gap:8px; align-items:center; }
.bp-legend .bp-legend-item .bp-legend-label{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bp-legend .bp-legend-item code{ font-size: 12px; }

/* Blueprint panel sub-tabs (drawing / files) — keep the right column from
   becoming a long scroll; switching tabs is pure UI, no data refetch. */
.blueprint-panel .bp-tabs{
  display:flex;
  gap:6px;
  margin-top:10px;
  border-bottom:1px solid var(--preview-border);
  padding-bottom:6px;
}
.blueprint-panel .bp-tab{
  border:1px solid var(--preview-border);
  background: var(--preview-control-bg);
  color: var(--preview-control-text);
  border-radius: 8px 8px 0 0;
  padding: 6px 14px;
  cursor: pointer;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.blueprint-panel .bp-tab:hover{ background: var(--preview-control-bg-hover); }
.blueprint-panel .bp-tab.is-active{
  background: rgba(79,152,200,0.18);
  color: var(--preview-text-strong);
  border-color: rgba(79,152,200,0.55);
}
.blueprint-panel .bp-tab-panel{ margin-top:6px; }
.blueprint-panel .bp-tab-panel[hidden]{ display:none; }
.blueprint-panel .bp-section-title{
  margin: 10px 0 4px 0;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--preview-muted);
}
.blueprint-panel .bp-tab-panel > .bp-section-title:first-child{ margin-top: 4px; }
`.trim();
}
 
export function renderBlueprintTerrainSwatch({ terrainId, size = 16 }) {
  const s = getBlueprintTerrainStyle(terrainId);
  const id = String(terrainId ?? "").trim() || "unknown";
  const w = Math.max(10, Number(size) || 16);
  const h = w;
  const pad = 1.2;
  const x0 = pad;
  const y0 = pad;
  const ww = w - pad * 2;
  const hh = h - pad * 2;

  function patElements(pattern) {
    const p = String(pattern || "");
    const stroke = s.stroke;
    const faint = stroke.replace(/0\.\d+\)/, "0.42)");
    if (p === "plain-route") {
      const yA = y0 + hh * 0.38;
      const yB = y0 + hh * 0.62;
      return [
        `<line class="blueprint-terrain-pattern blueprint-terrain-pattern--plain-route" x1="${x0 + ww * 0.15}" y1="${yA}" x2="${x0 + ww * 0.85}" y2="${yA}" stroke="${faint}" stroke-width="1.6" />`,
        `<line class="blueprint-terrain-pattern blueprint-terrain-pattern--plain-route" x1="${x0 + ww * 0.15}" y1="${yB}" x2="${x0 + ww * 0.85}" y2="${yB}" stroke="${faint}" stroke-width="1.6" />`
      ].join("");
    }
    if (p === "marker-line") {
      const cy = y0 + hh * 0.50;
      const parts = [];
      for (let i = 0; i < 5; i++) {
        const cx = x0 + ww * (0.18 + i * 0.16);
        parts.push(`<circle class="blueprint-terrain-pattern blueprint-terrain-pattern--marker-line" cx="${cx}" cy="${cy}" r="1.4" fill="${stroke}" />`);
      }
      return parts.join("");
    }
    if (p === "wind-streak" || p === "wind-streak-long") {
      const parts = [];
      for (let i = 0; i < 4; i++) {
        const yy = y0 + hh * (0.20 + i * 0.18);
        parts.push(`<line class="blueprint-terrain-pattern blueprint-terrain-pattern--wind-streak" x1="${x0 + ww * 0.18}" y1="${yy}" x2="${x0 + ww * 0.88}" y2="${yy - hh * 0.08}" stroke="${faint}" stroke-width="1.2" />`);
      }
      return parts.join("");
    }
    if (p === "snow-speckle" || p === "sand-speckle") {
      const fill = p === "sand-speckle" ? faint : "rgba(255,255,255,0.75)";
      const parts = [];
      const pts = [
        [0.22, 0.28],
        [0.40, 0.62],
        [0.64, 0.32],
        [0.78, 0.56],
        [0.52, 0.44]
      ];
      for (const [px, py] of pts) {
        parts.push(`<circle class="blueprint-terrain-pattern blueprint-terrain-pattern--speckle" cx="${x0 + ww * px}" cy="${y0 + hh * py}" r="1.1" fill="${fill}" />`);
      }
      return parts.join("");
    }
    if (p === "ridge-lines" || p === "ridge-zigzag") {
      const parts = [];
      for (let i = 0; i < 5; i++) {
        const yy = y0 + hh * (0.18 + i * 0.16);
        if (p === "ridge-zigzag") {
          const xA = x0 + ww * 0.15;
          const xB = x0 + ww * 0.50;
          const xC = x0 + ww * 0.85;
          parts.push(
            `<path class="blueprint-terrain-pattern blueprint-terrain-pattern--ridge-zigzag" d="M ${xA} ${yy} L ${xB} ${yy + hh * 0.06} L ${xC} ${yy}" stroke="${faint}" stroke-width="1.2" fill="none" />`
          );
        } else {
          parts.push(`<line class="blueprint-terrain-pattern blueprint-terrain-pattern--ridge-lines" x1="${x0 + ww * 0.12}" y1="${yy}" x2="${x0 + ww * 0.88}" y2="${yy}" stroke="${faint}" stroke-width="1.2" />`);
        }
      }
      return parts.join("");
    }
    if (p === "ice-flow") {
      const xA = x0 + ww * 0.12,
        xB = x0 + ww * 0.88;
      const yA = y0 + hh * 0.34,
        yB = y0 + hh * 0.66;
      return [
        `<path class="blueprint-terrain-pattern blueprint-terrain-pattern--ice-flow" d="M ${xA} ${yA} C ${x0 + ww * 0.40} ${yA - hh * 0.10}, ${x0 + ww * 0.62} ${yA + hh * 0.12}, ${xB} ${yA}" stroke="${faint}" stroke-width="1.2" fill="none" />`,
        `<path class="blueprint-terrain-pattern blueprint-terrain-pattern--ice-flow" d="M ${xA} ${yB} C ${x0 + ww * 0.36} ${yB - hh * 0.08}, ${x0 + ww * 0.64} ${yB + hh * 0.10}, ${xB} ${yB}" stroke="${faint}" stroke-width="1.2" fill="none" />`
      ].join("");
    }
    if (p === "crack-lines" || p === "central-crack" || p === "polygon-crack") {
      const parts = [];
      if (p === "central-crack") {
        parts.push(
          `<path class="blueprint-terrain-pattern blueprint-terrain-pattern--central-crack" d="M ${x0 + ww * 0.50} ${y0 + hh * 0.10} L ${x0 + ww * 0.46} ${y0 + hh * 0.40} L ${x0 + ww * 0.54} ${y0 + hh * 0.62} L ${x0 + ww * 0.48} ${y0 + hh * 0.90}" stroke="rgba(10,10,10,0.72)" stroke-width="1.8" fill="none" />`
        );
        return parts.join("");
      }
      if (p === "polygon-crack") {
        parts.push(
          `<path class="blueprint-terrain-pattern blueprint-terrain-pattern--polygon-crack" d="M ${x0 + ww * 0.18} ${y0 + hh * 0.30} L ${x0 + ww * 0.42} ${y0 + hh * 0.18} L ${x0 + ww * 0.70} ${y0 + hh * 0.30} L ${x0 + ww * 0.78} ${y0 + hh * 0.58} L ${x0 + ww * 0.52} ${y0 + hh * 0.78} L ${x0 + ww * 0.24} ${y0 + hh * 0.62} Z" stroke="${faint}" stroke-width="1.2" fill="none" />`
        );
        return parts.join("");
      }
      parts.push(
        `<path class="blueprint-terrain-pattern blueprint-terrain-pattern--crack-lines" d="M ${x0 + ww * 0.18} ${y0 + hh * 0.24} L ${x0 + ww * 0.38} ${y0 + hh * 0.52} L ${x0 + ww * 0.30} ${y0 + hh * 0.78}" stroke="rgba(10,10,10,0.62)" stroke-width="1.4" fill="none" />`
      );
      parts.push(
        `<path class="blueprint-terrain-pattern blueprint-terrain-pattern--crack-lines" d="M ${x0 + ww * 0.52} ${y0 + hh * 0.20} L ${x0 + ww * 0.62} ${y0 + hh * 0.44} L ${x0 + ww * 0.56} ${y0 + hh * 0.82}" stroke="rgba(10,10,10,0.62)" stroke-width="1.4" fill="none" />`
      );
      return parts.join("");
    }
    if (p === "rock-speckle") {
      const parts = [];
      const pts = [
        [0.25, 0.30],
        [0.38, 0.64],
        [0.60, 0.42],
        [0.76, 0.62]
      ];
      for (const [px, py] of pts) {
        parts.push(
          `<rect class="blueprint-terrain-pattern blueprint-terrain-pattern--rock-speckle" x="${x0 + ww * px}" y="${y0 + hh * py}" width="2.6" height="2.6" fill="rgba(40,26,18,0.44)" />`
        );
      }
      return parts.join("");
    }
    if (p === "industrial-grid") {
      const parts = [];
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        parts.push(`<line class="blueprint-terrain-pattern blueprint-terrain-pattern--industrial-grid" x1="${x0 + ww * t}" y1="${y0}" x2="${x0 + ww * t}" y2="${y0 + hh}" stroke="${faint}" stroke-width="1.1" />`);
        parts.push(`<line class="blueprint-terrain-pattern blueprint-terrain-pattern--industrial-grid" x1="${x0}" y1="${y0 + hh * t}" x2="${x0 + ww}" y2="${y0 + hh * t}" stroke="${faint}" stroke-width="1.1" />`);
      }
      return parts.join("");
    }
    if (p === "cliff-hatch") {
      const parts = [];
      for (let i = 0; i < 5; i++) {
        const x = x0 + ww * (0.12 + i * 0.18);
        parts.push(`<line class="blueprint-terrain-pattern blueprint-terrain-pattern--cliff-hatch" x1="${x}" y1="${y0 + hh * 0.10}" x2="${x + ww * 0.18}" y2="${y0 + hh * 0.90}" stroke="${faint}" stroke-width="1.2" />`);
      }
      return parts.join("");
    }
    if (p === "shelf-band") {
      const parts = [];
      for (let i = 0; i < 4; i++) {
        const yy = y0 + hh * (0.18 + i * 0.18);
        parts.push(`<line class="blueprint-terrain-pattern blueprint-terrain-pattern--shelf-band" x1="${x0 + ww * 0.12}" y1="${yy}" x2="${x0 + ww * 0.88}" y2="${yy}" stroke="${faint}" stroke-width="1.4" />`);
      }
      return parts.join("");
    }
    if (p === "edge-jag") {
      return `<path class="blueprint-terrain-pattern blueprint-terrain-pattern--edge-jag" d="M ${x0 + ww * 0.12} ${y0 + hh * 0.70} L ${x0 + ww * 0.28} ${y0 + hh * 0.52} L ${x0 + ww * 0.42} ${y0 + hh * 0.78} L ${x0 + ww * 0.56} ${y0 + hh * 0.54} L ${x0 + ww * 0.70} ${y0 + hh * 0.76} L ${x0 + ww * 0.88} ${y0 + hh * 0.58}" stroke="${faint}" stroke-width="1.4" fill="none" />`;
    }
    if (p === "ice-glint") {
      return `<path class="blueprint-terrain-pattern blueprint-terrain-pattern--ice-glint" d="M ${x0 + ww * 0.10} ${y0 + hh * 0.70} L ${x0 + ww * 0.92} ${y0 + hh * 0.22}" stroke="rgba(255,255,255,0.55)" stroke-width="2.0" fill="none" />`;
    }
    // low-texture fallback
    return `<line class="blueprint-terrain-pattern blueprint-terrain-pattern--low-texture" x1="${x0 + ww * 0.18}" y1="${y0 + hh * 0.54}" x2="${x0 + ww * 0.86}" y2="${y0 + hh * 0.46}" stroke="${faint}" stroke-width="1.0" />`;
  }

  const danger = String(s.danger ?? "low");
  const dangerFrame =
    danger === "high" || danger === "hard"
      ? `<rect class="blueprint-terrain-danger-frame blueprint-terrain-danger-frame--${danger}" x="${x0}" y="${y0}" width="${ww}" height="${hh}" rx="2" ry="2"></rect>`
      : "";
  return `
<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="terrain swatch ${id}">
  <rect class="blueprint-terrain-fill" x="${x0}" y="${y0}" width="${ww}" height="${hh}" rx="2" ry="2" fill="${s.fill}" stroke="${s.stroke}" stroke-width="1.2"></rect>
  ${patElements(s.pattern)}
  ${dangerFrame}
</svg>
  `.trim();
}

export function renderBlueprintPanelHtml() {
  return `
  <section class="blueprint-panel" aria-label="工作台">
    <div class="bp-sticky" aria-label="高频操作区">
      <div class="bp-row bp-row--tight bp-row--between" aria-label="状态">
        <div class="bp-summary-line">
          <div class="bp-title">工作台</div>
          <span class="bp-muted" id="blueprint-layer-status">未启用</span>
          <span class="bp-muted"><strong>base</strong> <code id="blueprint-base-bounds">—</code></span>
          <span class="bp-muted"><strong>auth</strong> <code id="blueprint-authoring-bounds">—</code></span>
        </div>
      </div>

      <div class="bp-row bp-row--tight" aria-label="蓝图初始化">
        <button type="button" class="bp-btn bp-btn--primary" data-preview-action="blueprint-create-layer">新建/启用</button>
        <button type="button" class="bp-btn" data-preview-action="blueprint-copy-base-to-layer" title="创建/替换当前蓝图层，并把底图已有格子复制为 terrain_add / special_map_cell（不修改底图）。">拷贝底图</button>
        <span style="flex:1"></span>
        <button type="button" class="bp-link bp-link--danger" data-preview-action="blueprint-clear-layer">清空蓝图层</button>
      </div>

      <div class="bp-row bp-row--tight" aria-label="查看方式">
        <div class="bp-muted" style="min-width:56px;">查看</div>
        <div class="bp-seg" role="group" aria-label="查看方式（分段）">
          <button type="button" class="bp-seg-btn" data-preview-action="blueprint-set-blend" data-blend="onion_diff">洋葱皮</button>
          <button type="button" class="bp-seg-btn" data-preview-action="blueprint-set-blend" data-blend="top_only">顶层</button>
          <button type="button" class="bp-seg-btn is-active" data-preview-action="blueprint-set-blend" data-blend="bottom_only">底层</button>
        </div>
      </div>

      <div class="bp-row bp-row--tight" aria-label="绘制工具与地貌">
        <div class="bp-muted" style="min-width:56px;">工具</div>
        <div class="bp-toolstrip" role="group" aria-label="绘制工具（工具条）">
          <button type="button" class="bp-toolbtn is-active" data-preview-action="blueprint-set-tool" data-tool="terrain_add" title="加法格子">+</button>
          <button type="button" class="bp-toolbtn" data-preview-action="blueprint-set-tool" data-tool="cell_subtract" title="减法格子">−</button>
          <button type="button" class="bp-toolbtn" data-preview-action="blueprint-set-tool" data-tool="special_map_cell" title="特殊地图格子">特</button>
        </div>
        <select id="blueprint-terrain-select" class="bp-select" aria-label="选择地貌" style="flex:1; min-width: 180px;"></select>
      </div>
    </div>

    <div class="bp-row bp-row--tight bp-special-inputs" id="blueprint-special-inputs" hidden aria-hidden="true">
      <input id="blueprint-special-mapid" class="bp-input" type="text" placeholder="special mapId" aria-label="特殊地图格子 mapId" style="flex:1; min-width: 160px;" />
      <input id="blueprint-special-label" class="bp-input" type="text" placeholder="special label" aria-label="特殊地图格子 label" style="flex:1; min-width: 160px;" />
    </div>

    <div class="bp-row" aria-label="当前地貌预览">
      <div class="bp-fieldline" style="width:100%;">
        <div id="blueprint-terrain-preview" class="bp-terrain-preview" role="group" aria-label="当前地貌预览条">
          <div class="bp-swatch" aria-hidden="true"></div>
          <div class="bp-terrain-lines" style="flex:1; min-width:0;">
            <div class="bp-terrain-name" style="display:flex; gap:10px; align-items:baseline; flex-wrap:wrap;">
              <span class="bp-terrain-name-text">（未选择）</span>
              <span class="bp-terrain-meta"><code class="bp-terrain-id">—</code></span>
            </div>
            <div class="bp-terrain-meta"><span class="bp-terrain-family">—</span> · <span class="bp-terrain-danger">—</span></div>
          </div>
        </div>
      </div>
    </div>

    <div class="bp-row bp-legend" style="margin-top:4px;">
      <details id="blueprint-legend-details">
        <summary>地貌图例</summary>
        <div id="blueprint-legend" class="bp-legend-body" aria-label="地貌图例内容"></div>
      </details>
    </div>

    <details id="bp-code-details" open style="margin-top:6px;">
      <summary class="bp-section-title" style="cursor:pointer; user-select:none; margin: 8px 0 4px 0;">蓝图代码补丁</summary>
      <div class="bp-row" style="margin-top:6px;">
        <textarea id="blueprint-export-textarea" class="bp-textarea" spellcheck="false" aria-label="蓝图导出结果（JSON）或蓝图代码" placeholder="紧凑 JSON / 旧版导入 JSON / 蓝图代码补丁（set/clear/subtract/special），不写文件。"></textarea>
      </div>
      <div class="bp-row bp-row--tight bp-row--between" aria-label="蓝图代码执行" style="margin-top:6px;">
        <span class="bp-muted">Ctrl+Enter 执行（不写入 data）</span>
        <button type="button" class="bp-btn bp-btn--primary" data-preview-action="blueprint-execute-patch" title="快捷键：Ctrl+Enter">执行</button>
      </div>
    </details>

    <h4 class="bp-section-title" style="margin-top:10px;">导入与导出</h4>
    <div class="bp-row bp-row--tight" aria-label="导入导出命令">
      <button type="button" class="bp-link" data-preview-action="blueprint-import-textarea">[导入为蓝图层]</button>
      <button type="button" class="bp-link" data-preview-action="blueprint-export-compact">[导出紧凑蓝图]</button>
      <button type="button" class="bp-link" data-preview-action="blueprint-export-merge-preview">[导出合并预览参数]</button>
      <button type="button" class="bp-link" data-preview-action="blueprint-export-delta" title="低优先：兼容旧流程">[旧版增量]</button>
    </div>

    <div style="margin-top:10px; border-top:1px solid var(--preview-border); padding-top:8px;"></div>
    <details id="bp-maintenance-details">
      <summary class="bp-muted" style="cursor:pointer; user-select:none;">维护 <span style="opacity:0.70;">· 低频</span></summary>
      <div class="bp-row" style="margin-top:8px;">
        <button type="button" class="bp-link bp-link--danger" data-preview-action="blueprint-apply-to-game">一键覆盖地图</button>
        <button type="button" class="bp-link bp-link--danger" id="blueprint-apply-expand-bounds-btn" data-preview-action="blueprint-apply-expand-bounds" hidden>允许扩展边界并覆盖</button>
        <button type="button" class="bp-link" data-preview-action="blueprint-refresh-preview-from-game-files" title="重新运行 exporter，从当前磁盘游戏文件生成预览页；不读取当前蓝图输入框。">从游戏文件重载预览</button>
      </div>
      <div class="bp-row" aria-label="作者服务模式">
        <div class="bp-muted" style="width:100%">
          <strong>作者服务模式</strong>：
          <span id="blueprint-author-mode-text">检测中…</span>
          <button type="button" class="bp-btn" id="blueprint-open-author-server-btn" data-preview-action="blueprint-open-author-server" hidden style="margin-left:10px;">打开作者服务页面</button>
        </div>
      </div>
      <div class="bp-row">
        <button type="button" class="bp-link" data-preview-action="blueprint-open-snapshots">查看旧快照</button>
        <button type="button" class="bp-link" data-preview-action="blueprint-open-logs">查看日志</button>
      </div>
      <div class="bp-row" id="blueprint-snapshots-shell" hidden aria-hidden="true">
        <div class="bp-muted" style="width:100%"><strong>旧快照</strong>（载入到蓝图层，不直接改游戏数据）</div>
        <div id="blueprint-snapshots-status" class="bp-muted" style="width:100%; margin-top:6px;"></div>
        <div id="blueprint-snapshots-list" class="bp-muted" style="width:100%"></div>
      </div>
    </details>

    <div style="margin-top:8px; border-top:1px solid var(--preview-border); padding-top:8px;"></div>
    <details id="bp-logs-details">
      <summary class="bp-muted" style="cursor:pointer; user-select:none;">日志 <span style="opacity:0.70;">· 低频</span></summary>
      <div class="bp-row" id="blueprint-logs-shell" aria-hidden="false" style="margin-top:8px;">
        <details open>
          <summary>蓝图操作日志</summary>
          <div class="bp-muted" style="width:100%; display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:6px;">
            <label style="display:flex; gap:6px; align-items:center;">
              <input type="radio" name="bp-log-source" value="client" checked />
              <span>当前页面</span>
            </label>
            <label style="display:flex; gap:6px; align-items:center;">
              <input type="radio" name="bp-log-source" value="server" />
              <span>本地作者服务</span>
            </label>
            <span style="flex:1"></span>
            <button type="button" class="bp-link" data-preview-action="blueprint-logs-refresh">刷新日志</button>
            <button type="button" class="bp-link bp-link--danger" data-preview-action="blueprint-logs-clear-client">清空页面日志</button>
            <button type="button" class="bp-link bp-link--danger" data-preview-action="blueprint-logs-clear-server">清空服务日志</button>
            <button type="button" class="bp-link" data-preview-action="blueprint-logs-copy">复制日志</button>
          </div>
          <pre id="blueprint-logs-pre" class="bp-pre" aria-label="蓝图操作日志正文" style="margin-top:8px; max-height:240px; overflow:auto; white-space:pre-wrap; border:1px solid var(--preview-border); border-radius:10px; padding:8px; background:rgba(10,14,18,0.20);"></pre>
        </details>
      </div>
    </details>

    <div class="bp-row">
      <div class="bp-muted" id="blueprint-status">就绪。</div>
    </div>
  </section>
  `.trim();
}

export function renderBlueprintDrawPanelHtml() {
  return `
    <div class="bp-row">
      <div class="bp-title">蓝图</div>
      <span class="bp-muted" id="blueprint-layer-status">未启用</span>
    </div>

    <div class="bp-row" aria-label="边界信息">
      <div class="bp-muted" style="display:flex; gap:10px; flex-wrap:wrap;">
        <span><strong>base bounds</strong>: <code id="blueprint-base-bounds">—</code></span>
        <span><strong>authoring bounds</strong>: <code id="blueprint-authoring-bounds">—</code></span>
      </div>
    </div>

    <div class="bp-row">
      <button type="button" class="bp-btn" data-preview-action="blueprint-create-layer">新建/启用蓝图层</button>
      <button type="button" class="bp-btn" data-preview-action="blueprint-copy-base-to-layer" title="创建/替换当前蓝图层，并把底图已有格子复制为 terrain_add / special_map_cell（不修改底图）。">拷贝底图</button>
      <button type="button" class="bp-btn" data-preview-action="blueprint-clear-layer">清空蓝图层</button>
    </div>

    <div class="bp-row" aria-label="混合模式">
      <button type="button" class="bp-btn is-active" data-preview-action="blueprint-set-blend" data-blend="onion_diff">洋葱皮</button>
      <button type="button" class="bp-btn" data-preview-action="blueprint-set-blend" data-blend="top_only">只显示顶层</button>
      <button type="button" class="bp-btn" data-preview-action="blueprint-set-blend" data-blend="bottom_only">只显示底层</button>
    </div>

    <div class="bp-row" aria-label="绘制工具">
      <button type="button" class="bp-btn is-active" data-preview-action="blueprint-set-tool" data-tool="terrain_add">加法格子</button>
      <button type="button" class="bp-btn" data-preview-action="blueprint-set-tool" data-tool="cell_subtract">减法格子</button>
      <button type="button" class="bp-btn" data-preview-action="blueprint-set-tool" data-tool="special_map_cell">特殊地图格子</button>
    </div>

    <div class="bp-row">
      <select id="blueprint-terrain-select" class="bp-select" aria-label="选择地貌"></select>
      <input id="blueprint-special-mapid" class="bp-input" type="text" placeholder="special mapId" aria-label="特殊地图格子 mapId" />
      <input id="blueprint-special-label" class="bp-input" type="text" placeholder="special label" aria-label="特殊地图格子 label" />
    </div>

    <div class="bp-row" aria-label="当前地貌预览">
      <div id="blueprint-terrain-preview" class="bp-terrain-preview" role="group" aria-label="当前地貌预览条">
        <div class="bp-swatch" aria-hidden="true"></div>
        <div class="bp-terrain-lines">
          <div class="bp-terrain-name">（未选择）</div>
          <div class="bp-terrain-meta">terrainId: —</div>
          <div class="bp-terrain-meta">family: — · danger: —</div>
        </div>
      </div>
    </div>

    <div class="bp-row bp-legend">
      <details id="blueprint-legend-details">
        <summary>地貌图例</summary>
        <div id="blueprint-legend" class="bp-legend-body" aria-label="地貌图例内容"></div>
      </details>
    </div>

    <div class="bp-row">
      <div class="bp-muted" data-bp-status-mirror>就绪。</div>
    </div>
  `.trim();
}

export function renderBlueprintFilesPanelHtml() {
  return `
    <h4 class="bp-section-title">文件操作</h4>
    <div class="bp-row">
      <button type="button" class="bp-btn" data-preview-action="blueprint-export-compact">导出紧凑蓝图</button>
      <button type="button" class="bp-btn" data-preview-action="blueprint-export-merge-preview">导出合并预览参数</button>
      <button type="button" class="bp-btn" data-preview-action="blueprint-import-textarea">导入为蓝图层</button>
      <button type="button" class="bp-btn" data-preview-action="blueprint-execute-patch">执行蓝图代码</button>
      <button type="button" class="bp-btn" data-preview-action="blueprint-export-delta">导出旧版增量</button>
    </div>

    <h4 class="bp-section-title">写入与刷新</h4>
    <div class="bp-row" aria-label="作者服务">
      <button type="button" class="bp-btn" data-preview-action="blueprint-apply-to-game">一键覆盖地图</button>
      <button type="button" class="bp-btn" id="blueprint-apply-expand-bounds-btn" data-preview-action="blueprint-apply-expand-bounds" hidden>允许扩展边界并覆盖</button>
      <button type="button" class="bp-btn" data-preview-action="blueprint-refresh-preview-from-game-files" title="重新运行 exporter，从当前磁盘游戏文件生成预览页；不读取当前蓝图输入框。">从游戏文件重载预览</button>
    </div>
    <div class="bp-row" aria-label="作者服务模式">
      <div class="bp-muted" style="width:100%">
        <strong>作者服务模式</strong>：
        <span id="blueprint-author-mode-text">检测中…</span>
        <button type="button" class="bp-btn" id="blueprint-open-author-server-btn" data-preview-action="blueprint-open-author-server" hidden style="margin-left:10px;">打开作者服务页面</button>
      </div>
    </div>

    <h4 class="bp-section-title">档案与日志</h4>
    <div class="bp-row">
      <button type="button" class="bp-btn" data-preview-action="blueprint-open-snapshots">查看旧快照</button>
      <button type="button" class="bp-btn" data-preview-action="blueprint-open-logs">查看日志</button>
    </div>

    <div class="bp-row" id="blueprint-snapshots-shell" hidden aria-hidden="true">
      <div class="bp-muted" style="width:100%"><strong>旧快照</strong>（载入到蓝图层，不直接改游戏数据）</div>
      <div id="blueprint-snapshots-status" class="bp-muted" style="width:100%; margin-top:6px;"></div>
      <div id="blueprint-snapshots-list" class="bp-muted" style="width:100%"></div>
    </div>

    <div class="bp-row" id="blueprint-logs-shell" hidden aria-hidden="true">
      <details open>
        <summary>蓝图操作日志</summary>
        <div class="bp-muted" style="width:100%; display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:6px;">
          <label style="display:flex; gap:6px; align-items:center;">
            <input type="radio" name="bp-log-source" value="client" checked />
            <span>当前页面</span>
          </label>
          <label style="display:flex; gap:6px; align-items:center;">
            <input type="radio" name="bp-log-source" value="server" />
            <span>本地作者服务</span>
          </label>
          <span style="flex:1"></span>
          <button type="button" class="bp-btn" data-preview-action="blueprint-logs-refresh">刷新日志</button>
          <button type="button" class="bp-btn" data-preview-action="blueprint-logs-clear-client">清空页面日志</button>
          <button type="button" class="bp-btn" data-preview-action="blueprint-logs-clear-server">清空服务日志</button>
          <button type="button" class="bp-btn" data-preview-action="blueprint-logs-copy">复制日志</button>
        </div>
        <pre id="blueprint-logs-pre" class="bp-pre" aria-label="蓝图操作日志正文" style="margin-top:8px; max-height:240px; overflow:auto; white-space:pre-wrap; border:1px solid var(--preview-border); border-radius:10px; padding:8px; background:rgba(10,14,18,0.20);"></pre>
      </details>
    </div>

    <div class="bp-row">
      <textarea id="blueprint-export-textarea" class="bp-textarea" spellcheck="false" aria-label="蓝图导出结果（JSON）或蓝图代码" placeholder="紧凑 JSON / 旧版导入 JSON / 蓝图代码补丁（set/clear/subtract/special），不写文件。"></textarea>
    </div>

    <div class="bp-row">
      <div class="bp-muted" id="blueprint-status">就绪。</div>
    </div>
  `.trim();
}
 
export function renderBlueprintRuntimeScript({ terrainOptions }) {
  const optionsJson = JSON.stringify(Array.isArray(terrainOptions) ? terrainOptions : []);
  const styleRegistryJson = JSON.stringify(BLUEPRINT_TERRAIN_STYLE_REGISTRY);
  const styleFallbackJson = JSON.stringify(BLUEPRINT_TERRAIN_STYLE_FALLBACK);
  return `
// --- Blueprint runtime (vector mode only; preview-local) ---
// Maintainer: also nested inside exporter template literal — double regex/string backslashes here (see README + 运维手册 §2.1).
const BLUEPRINT_TERRAIN_OPTIONS = ${optionsJson};
const BLUEPRINT_TERRAIN_STYLE_REGISTRY = ${styleRegistryJson};
const BLUEPRINT_TERRAIN_STYLE_FALLBACK = ${styleFallbackJson};
const blueprintState = {
  enabled: false,
  layerCreated: false,
  blendMode: "bottom_only",
  tool: "terrain_add",
  selectedTerrainId: "",
  specialMapId: "",
  specialLabel: "",
  cells: new Map(),
  dirty: false,
  pointer: {
    pointerId: null,
    downCell: null,
    lastCell: null,
    isPainting: false,
    longPressTimer: null
  },
  canvas: {
    /** Whether pointer is currently inside the canvas viewport (for Ctrl+Z gating). */
    isPointerInside: false
  },
  rightErase: {
    /** Right mouse dragging state (batch erase). */
    isDragging: false,
    /** Tool kind to erase for this drag ("terrain_add"|"cell_subtract"|"special_map_cell"). */
    tool: null,
    /** Grid keys already visited in this drag to avoid repeated delete + repeated undo record. */
    visitedKeys: new Set(),
    /** Last grid key under pointer (for optional debouncing). */
    lastPointerGridKey: null
  }
};

/**
 * Undo stack for canvas edits.
 * Only tracks blueprint cell edits (no sidebar/search/export UI interactions).
 */
const canvasEditUndoStack = [];
let currentUndoStep = null;

const bp = {
  statusEl: byId("blueprint-status"),
  layerStatusEl: byId("blueprint-layer-status"),
  baseBoundsEl: byId("blueprint-base-bounds"),
  authoringBoundsEl: byId("blueprint-authoring-bounds"),
  terrainSelectEl: byId("blueprint-terrain-select"),
  specialMapIdEl: byId("blueprint-special-mapid"),
  specialLabelEl: byId("blueprint-special-label"),
  exportEl: byId("blueprint-export-textarea"),
  svg: document.getElementById("vector-preview-svg"),
  layerCells: document.getElementById("v-layer-blueprint-cells"),
  layerDiff: document.getElementById("v-layer-blueprint-diff"),
  layerSpecial: document.getElementById("v-layer-blueprint-special"),
  layerLabels: document.getElementById("v-layer-blueprint-labels"),
  layerBrush: document.getElementById("v-layer-blueprint-brush")
};

function bpSetStatus(text){
  const t = String(text || "");
  if (bp.statusEl) bp.statusEl.textContent = t;
  try {
    document.querySelectorAll("[data-bp-status-mirror]").forEach((el) => { el.textContent = t; });
  } catch { /* ignore */ }
}

// --- client log ring buffer (in-memory, session-only) ---
const BP_CLIENT_LOG_MAX = 300;
const bpLogState = {
  source: "client", // "client" | "server"
  serverLogs: [],
  serverStatus: "idle" // "idle" | "loading" | "error"
};
const bpClientLogs = [];

function bpSetAuthorModeText(text){
  const el = byId("blueprint-author-mode-text");
  if (el) el.textContent = String(text || "");
}

const BP_AUTHOR_SERVICE_UNAVAILABLE_HINT =
  "未发现本地作者服务。推荐：双击仓库根目录的「启动野外地图编辑器.cmd」或运行 npm run wilderness:area-preview";

function renderAuthorServiceUnavailableHint(){
  return BP_AUTHOR_SERVICE_UNAVAILABLE_HINT;
}

function bpSetOpenAuthorServerButtonVisible(visible, baseUrl){
  const btn = byId("blueprint-open-author-server-btn");
  if (!btn) return;
  const v = !!visible;
  btn.hidden = !v;
  if (v && baseUrl) btn.setAttribute("data-author-base", String(baseUrl));
}

function bpSetSnapshotsStatusText(text){
  const el = byId("blueprint-snapshots-status");
  if (el) el.textContent = String(text || "");
}

function truncateText(input, maxLen){
  const s = String(input ?? "");
  const n = Number(maxLen || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (s.length <= n) return s;
  return s.slice(0, n) + "…(truncated:" + String(s.length - n) + ")";
}

function safeDetailText(detail){
  if (detail == null) return "";
  if (typeof detail === "string") return truncateText(detail, 2000);
  try {
    const txt = JSON.stringify(detail, (k, v) => {
      if (k === "compact" || k === "pendingText") return "[omitted]";
      if (k === "stdout" || k === "stderr") return "[omitted]";
      return v;
    });
    return truncateText(txt, 2000);
  } catch {
    return truncateText(String(detail), 2000);
  }
}

function bpLogClient(level, message, detail){
  const entry = {
    ts: new Date().toISOString(),
    level: String(level || "info"),
    message: truncateText(String(message || ""), 400),
    detail: safeDetailText(detail)
  };
  bpClientLogs.push(entry);
  while (bpClientLogs.length > BP_CLIENT_LOG_MAX) bpClientLogs.shift();
}

function bpGetClientLogs(){
  return bpClientLogs.slice();
}

function bpClearClientLogs(){
  bpClientLogs.length = 0;
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function bpSetSnapshotsOpen(open){
  const shell = byId("blueprint-snapshots-shell");
  if (!shell) return;
  const on = !!open;
  shell.hidden = !on;
  shell.setAttribute("aria-hidden", on ? "false" : "true");
}

function bpSetLogsOpen(open){
  // Logs are now inside a collapsible <details> (workbench). Keep legacy API.
  const details = byId("bp-logs-details");
  if (details && details.tagName === "DETAILS") details.open = !!open;
  const shell = byId("blueprint-logs-shell");
  if (shell) shell.setAttribute("aria-hidden", "false");
}

function formatLogLines(entries){
  const list = Array.isArray(entries) ? entries : [];
  const lines = [];
  for (const e of list) {
    const ts = String(e?.ts || "");
    const level = String(e?.level || "info");
    const msg = String(e?.message || "");
    const detail = String(e?.detail || "");
    const head = "[" + ts + "] [" + level + "] " + msg;
    // NOTE: this code is embedded into generated HTML via nested template literals.
    // We must double-escape backslashes so the generated JS contains "\\n" (not a literal newline inside quotes).
    lines.push(detail ? (head + "\\n" + "  " + detail) : head);
  }
  return lines.join("\\n");
}

function renderBlueprintLogPanel(){
  const pre = byId("blueprint-logs-pre");
  if (!pre) return;
  const src = String(bpLogState.source || "client");
  if (src === "client") {
    pre.textContent = formatLogLines(bpGetClientLogs());
    return;
  }
  if (bpLogState.serverStatus === "error") {
    pre.textContent = renderAuthorServiceUnavailableHint();
    return;
  }
  if (bpLogState.serverStatus === "loading") {
    pre.textContent = "正在读取本地作者服务日志…";
    return;
  }
  pre.textContent = formatLogLines(bpLogState.serverLogs);
}

async function fetchJson(url, options){
  const opt = options && typeof options === "object" ? options : {};
  try {
    const res = await fetch(url, {
      method: opt.method || "GET",
      headers: { "content-type": "application/json", ...(opt.headers || {}) },
      body: opt.body ? JSON.stringify(opt.body) : undefined
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const stage = (data && typeof data.stage === "string") ? data.stage : "";
      const errCode = (data && (data.error || data.message)) ? String(data.error || data.message) : ("HTTP " + String(res.status));
      const detail = (data && data.details) ? data.details : null;
      const msg = stage ? (errCode + " [stage=" + stage + "]") : errCode;
      bpLogClient("error", "fetch failed", { url, status: res.status, message: msg, stage: stage || null, detail });
      // Throw a compact, human-readable error string (no full stdout/stderr),
      // and attach structured fields so callers can distinguish HTTP vs network failures.
      const tail = (detail && (detail.stderrTail || detail.stdoutTail))
        ? (" tail=" + String(detail.stderrTail || detail.stdoutTail).slice(0, 180))
        : "";
      const err = new Error(msg + tail);
      err.isHttpResponseError = true;
      err.httpStatus = Number(res.status || 0);
      err.stage = stage || "";
      err.errorCode = errCode || "";
      throw err;
    }
    return data;
  } catch (e) {
    bpLogClient("error", "fetch failed", { url, message: String(e?.message || e || "") });
    throw e;
  }
}

// --- author server discovery (no port scanning beyond fixed candidates) ---
const BP_AUTHOR_SERVER_CANDIDATE_URLS = Object.freeze([
  "http://127.0.0.1:5588",
  "http://127.0.0.1:5589",
  "http://127.0.0.1:5590",
  "http://127.0.0.1:5591",
  "http://127.0.0.1:5592"
]);
const BP_AUTHOR_SERVER_STORAGE_KEY = "wilderness_area_preview.authorServerBaseUrl.v1";
const BP_FALLBACK_AREA_ID = "west2_old_marker_patrol_line"; // fallback only for legacy generated pages missing area id

const bpAuthorServer = {
  baseUrl: null,
  status: "unknown", // "unknown" | "connected" | "unavailable"
  lastReason: ""
};

// --- apply retry state (bounds) ---
let bpLastApplyCompact = null;
let bpLastApplyOutOfBoundsCount = 0;
function setExpandBoundsApplyEnabled(enabled){
  const btn = byId("blueprint-apply-expand-bounds-btn");
  if (!btn) return;
  if (enabled) btn.removeAttribute("hidden");
  else btn.setAttribute("hidden", "hidden");
}

function getCurrentBlueprintAreaId(){
  // Priority: current preview area spec id -> last export compact sourceAreaId -> injected preview id -> fallback
  const a = String(gridVm?.areaId ?? "").trim();
  if (a) return a;
  const fromLast = String(bpAuthorServer?.lastAreaId ?? "").trim();
  if (fromLast) return fromLast;
  const injected = String(window?.__WILDERNESS_PREVIEW_AREA_ID__ ?? "").trim();
  if (injected) return injected;
  bpLogClient("warn", "missing areaId in page; using fallback", { fallback: BP_FALLBACK_AREA_ID });
  return BP_FALLBACK_AREA_ID;
}

function getAuthorServerCandidateUrls(){
  const urls = [];
  function isLocalAuthorOrigin(text){
    const s = String(text || "").trim();
    if (!s.startsWith("http://127.0.0.1:")) return false;
    const portStr = s.slice("http://127.0.0.1:".length);
    if (!portStr) return false;
    const port = Number(portStr);
    if (!Number.isFinite(port) || port <= 0) return false;
    return String(port) === portStr;
  }
  try {
    const origin = String(window?.location?.origin || "");
    if (isLocalAuthorOrigin(origin)) urls.push(origin);
  } catch {}
  try {
    const last = String(localStorage?.getItem(BP_AUTHOR_SERVER_STORAGE_KEY) || "").trim();
    if (last && isLocalAuthorOrigin(last)) urls.push(last);
  } catch {}
  for (const u of BP_AUTHOR_SERVER_CANDIDATE_URLS) urls.push(u);
  // de-dupe preserving order
  const seen = new Set();
  return urls.filter((u) => {
    const s = String(u || "").trim();
    if (!s) return false;
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

function markBlueprintAuthorServerUnavailable(reason){
  bpAuthorServer.status = "unavailable";
  bpAuthorServer.lastReason = String(reason || "");
  renderBlueprintAuthorServiceStatus();
}

function fetchJsonWithTimeout(url, options, timeoutMs){
  const ms = Number(timeoutMs || 0);
  const controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const t = (controller && ms > 0) ? setTimeout(() => controller.abort(), ms) : null;
  const opt = options && typeof options === "object" ? { ...options } : {};
  opt.signal = controller ? controller.signal : undefined;
  return fetchJson(url, opt).finally(() => { if (t) clearTimeout(t); });
}

async function discoverBlueprintAuthorServer(){
  const areaId = getCurrentBlueprintAreaId();
  const candidates = getAuthorServerCandidateUrls();
  for (const baseUrl of candidates) {
    try {
      const health = await fetchJsonWithTimeout(baseUrl + "/api/health", { method: "GET" }, 800);
      if (!health || health.ok !== true) continue;
      if (health.service !== "wilderness_area_preview_author_server") continue;
      const supported = Array.isArray(health.supportedAreas) ? health.supportedAreas.map((x) => String(x || "")) : [];
      if (supported.length > 0 && !supported.includes(areaId)) {
        bpLogClient("warn", "author server found but area not supported", { baseUrl, area: areaId });
        continue;
      }
      bpAuthorServer.baseUrl = String(baseUrl);
      bpAuthorServer.status = "connected";
      bpAuthorServer.lastReason = "";
      try { localStorage?.setItem(BP_AUTHOR_SERVER_STORAGE_KEY, bpAuthorServer.baseUrl); } catch {}
      bpLogClient("info", "author server discovered", { baseUrl: bpAuthorServer.baseUrl, port: health.port });
      renderBlueprintAuthorServiceStatus();
      return bpAuthorServer.baseUrl;
    } catch {
      // ignore and try next
    }
  }
  markBlueprintAuthorServerUnavailable("not_found");
  return null;
}

async function getBlueprintAuthorServerBaseUrl(){
  if (bpAuthorServer.status === "connected" && bpAuthorServer.baseUrl) return bpAuthorServer.baseUrl;
  return await discoverBlueprintAuthorServer();
}

function getBlueprintAuthorServiceStatus(){
  const proto = String(window?.location?.protocol || "");
  const origin = String(window?.location?.origin || "");
  const env =
    proto === "file:" ? "file" :
    origin === "http://127.0.0.1:5500" ? "live_server" :
    "http";
  const baseUrl = (bpAuthorServer.status === "connected" && bpAuthorServer.baseUrl) ? String(bpAuthorServer.baseUrl) : null;
  return { env, origin, baseUrl, connected: !!baseUrl };
}

function renderBlueprintAuthorServiceStatus(){
  const s = getBlueprintAuthorServiceStatus();
  if (s.env === "file") {
    const msg = "当前是 file:// 页面：你可能打开了旧启动器或直接打开了 index.html。一键覆盖地图不可用。请双击仓库根目录的「启动野外地图编辑器.cmd」（或运行 npm run wilderness:area-preview）。";
    bpSetAuthorModeText(msg);
    bpSetSnapshotsStatusText(msg);
    bpSetOpenAuthorServerButtonVisible(false);
    return;
  }
  if (s.env === "live_server") {
    const msg = "当前是普通 live-server 5500 页面，不是作者服务页面。一键覆盖地图不可用。请双击仓库根目录的「启动野外地图编辑器.cmd」（或运行 npm run wilderness:area-preview）。";
    bpSetAuthorModeText(msg);
    bpSetSnapshotsStatusText(msg);
    bpSetOpenAuthorServerButtonVisible(false);
    return;
  }
  if (!s.connected) {
    const msg = renderAuthorServiceUnavailableHint();
    bpSetAuthorModeText(msg);
    bpSetSnapshotsStatusText(msg);
    bpSetOpenAuthorServerButtonVisible(false);
    return;
  }
  const baseUrl = String(bpAuthorServer.baseUrl || "");
  if (s.origin === baseUrl) {
    bpSetAuthorModeText("作者服务模式：已连接 " + baseUrl);
    bpSetSnapshotsStatusText("作者服务已连接：" + baseUrl + "，可查看旧快照。");
    bpSetOpenAuthorServerButtonVisible(false);
    return;
  }
  bpSetAuthorModeText("已发现作者服务：" + baseUrl);
  bpSetSnapshotsStatusText("作者服务已连接：" + baseUrl + "，可查看旧快照。");
  bpSetOpenAuthorServerButtonVisible(true, baseUrl);
}

function buildBlueprintAuthorApiUrl(apiPath, params){
  const base = String(bpAuthorServer.baseUrl || "").trim();
  const p = String(apiPath || "").trim();
  const u = base ? (base + p) : p;
  if (!params || typeof params !== "object") return u;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    sp.set(String(k), String(v));
  }
  const qs = sp.toString();
  return qs ? (u + (u.includes("?") ? "&" : "?") + qs) : u;
}

async function updateBlueprintAuthorModeUi(){
  const s = getBlueprintAuthorServiceStatus();
  if (s.env === "http") {
    // trigger discovery (non-fatal)
    try { await getBlueprintAuthorServerBaseUrl(); } catch {}
  }
  renderBlueprintAuthorServiceStatus();
}

async function fetchBlueprintServerLogs(){
  const areaId = getCurrentBlueprintAreaId();
  bpLogState.serverStatus = "loading";
  renderBlueprintLogPanel();
  try {
    const baseUrl = await getBlueprintAuthorServerBaseUrl();
    if (!baseUrl) throw new Error("author_server_not_found");
    bpSetStatus("已连接本地作者服务：" + String(baseUrl));
    const r = await fetchJson(buildBlueprintAuthorApiUrl("/api/wilderness-blueprint/logs", { area: areaId, limit: 200 }));
    const logs = Array.isArray(r?.logs) ? r.logs : [];
    // server already truncates; still ensure we don't render huge strings
    bpLogState.serverLogs = logs.map((e) => ({
      ts: String(e?.ts || ""),
      level: String(e?.level || "info"),
      message: truncateText(String(e?.message || ""), 400),
      detail: truncateText(String(e?.detail || ""), 2000)
    }));
    bpLogState.serverStatus = "idle";
    bpLogClient("info", "server logs fetched", { count: bpLogState.serverLogs.length });
    renderBlueprintLogPanel();
    renderBlueprintAuthorServiceStatus();
    return true;
  } catch (e) {
    const msg = String(e?.message || e || "");
    bpLogState.serverStatus = "error";
    markBlueprintAuthorServerUnavailable(msg);
    bpSetStatus(renderAuthorServiceUnavailableHint());
    renderBlueprintLogPanel();
    renderBlueprintAuthorServiceStatus();
    return false;
  }
}

async function clearBlueprintServerLogs(){
  const areaId = getCurrentBlueprintAreaId();
  try {
    const baseUrl = await getBlueprintAuthorServerBaseUrl();
    if (!baseUrl) throw new Error("author_server_not_found");
    await fetchJson(buildBlueprintAuthorApiUrl("/api/wilderness-blueprint/logs/clear"), { method: "POST", body: { area: areaId } });
    bpLogClient("info", "server logs cleared", { area: areaId });
    if (bpLogState.source === "server") void fetchBlueprintServerLogs();
    return true;
  } catch (e) {
    const msg = String(e?.message || e || "");
    bpLogClient("error", "server logs clear failed", { message: msg });
    bpSetStatus(renderAuthorServiceUnavailableHint());
    renderBlueprintAuthorServiceStatus();
    return false;
  }
}

async function copyBlueprintLogsToClipboard(){
  const pre = byId("blueprint-logs-pre");
  const text = pre ? String(pre.textContent || "") : "";
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      bpSetStatus("日志已复制到剪贴板。");
      bpLogClient("info", "logs copied", { bytes: text.length });
      return true;
    }
  } catch (e) {
    bpLogClient("warn", "clipboard write failed", { message: String(e?.message || e || "") });
  }
  bpSetStatus("当前环境不支持自动复制，请手动选中日志文本复制");
  return false;
}

async function applyBlueprintToGameData(){
  const v = validateBlueprintBeforeExport();
  if (!v.ok) { bpSetStatus("覆盖失败: " + v.errors[0]); return false; }
  const { obj, count } = serializeBlueprintCompact(blueprintState.cells);
  bpAuthorServer.lastAreaId = String(obj?.sourceAreaId || "");
  bpLogClient("info", "apply requested", { area: String(obj.sourceAreaId || ""), cells: Number(count || 0) });
  bpLastApplyCompact = obj;
  bpLastApplyOutOfBoundsCount = 0;
  setExpandBoundsApplyEnabled(false);
  try {
    const areaId = getCurrentBlueprintAreaId();
    bpSetStatus("覆盖中：查找本地作者服务…");
    const baseUrl = await getBlueprintAuthorServerBaseUrl();
    if (!baseUrl) {
      bpSetStatus(renderAuthorServiceUnavailableHint());
      bpLogClient("error", "author server not found", { area: areaId });
      renderBlueprintAuthorServiceStatus();
      return false;
    }
    bpSetStatus("覆盖中：已连接本地作者服务：" + String(baseUrl));
    renderBlueprintAuthorServiceStatus();
    const r = await fetchJson(buildBlueprintAuthorApiUrl("/api/wilderness-blueprint/apply"), {
      method: "POST",
      body: { area: areaId, compact: obj, allowExpandBounds: false }
    });
    if (r && r.ok === false && r.decision === "requires_special_map_validation") {
      const bad = Array.isArray(r?.details?.invalidSpecialMapCells) ? r.details.invalidSpecialMapCells : [];
      const head = "特殊地图格子未落地：存在无效 mapId。请填写正式地图 id 后再覆盖。";
      const lines = bad.slice(0, 8).map((it) => {
        const x = it?.x, y = it?.y;
        const mid = String(it?.mapId ?? "");
        const lab = String(it?.label ?? "");
        return "(" + String(x) + "," + String(y) + ") mapId=" + mid + " label=" + lab;
      });
      bpSetStatus(head + (lines.length ? ("\\n" + lines.join("\\n")) : ""));
      setExpandBoundsApplyEnabled(false);
      renderBlueprintAuthorServiceStatus();
      return false;
    }
    if (r && r.ok === false && r.decision === "requires_expand_bounds_confirmation") {
      const dbg = String(r.debugId || "");
      const n = (typeof r?.details?.outOfBoundsCount === "number" && Number.isFinite(r.details.outOfBoundsCount)) ? Math.trunc(r.details.outOfBoundsCount) : null;
      const samples = Array.isArray(r?.details?.outOfBoundsSamples) ? r.details.outOfBoundsSamples : [];
      bpLogClient("warn", "apply requires expand bounds confirmation", { debugId: dbg, outOfBoundsCount: n, samples: samples.length });
      // Keep existing messaging branches below (do not throw).
      if (n != null && n > 0) {
        bpSetStatus("检测到 " + String(n) + " 个越界坐标。当前写入模式不会自动扩大区域边界。debugId=" + dbg);
        setExpandBoundsApplyEnabled(true);
      } else if (samples.length > 0) {
        bpSetStatus("检测到越界坐标，但数量未返回。debugId=" + dbg);
        setExpandBoundsApplyEnabled(true);
      } else {
        bpSetStatus("检测到越界坐标，但数量未返回。debugId=" + dbg);
        setExpandBoundsApplyEnabled(false);
      }
      renderBlueprintAuthorServiceStatus();
      return false;
    }
    if (r && r.ok) {
      const baseMsg = "覆盖完成：已生成正式 AreaSpec 数据。" + (r.snapshotCreated ? (" 旧快照 " + String(r.snapshotId || "")) : "") + " zones=" + String(r.zoneCount ?? "—");
      bpSetStatus(baseMsg);
      bpLogClient("info", "apply success", { snapshotId: r.snapshotId || null, zoneCount: r.zoneCount ?? null, previewRegenerated: r.previewRegenerated === true });
      writeExport(obj, { warnings: v.warnings });
      if (bpLogState.source === "server") void fetchBlueprintServerLogs();
      setExpandBoundsApplyEnabled(false);
      // Auto-reload the preview HTML so the user immediately sees the per-cell grid view.
      const ok = await refreshPreviewFromGameFiles({ reason: "apply_success", statusText: "覆盖成功，已从游戏文件重载预览。" });
      if (!ok) {
        bpSetStatus("覆盖成功，但预览页重载失败。可在文件页点击“从游戏文件重载预览”。");
        bpLogClient("error", "refresh preview failed after apply success", { area: areaId });
      }
      return true;
    }
    bpSetStatus("覆盖失败：服务返回异常。");
    bpLogClient("error", "apply failed (bad response)", { ok: r?.ok, error: r?.error || null });
    return false;
  } catch (e) {
    const msg = String(e?.message || e || "");
    const code = String(e?.errorCode || "");
    if (e?.isHttpResponseError && code === "out_of_bounds") {
      const details = (e && typeof e.details === "object" && e.details) ? e.details : {};
      const rawCount = details.outOfBoundsCount;
      const known = details.outOfBoundsCountKnown !== false;
      const samples = Array.isArray(details.outOfBoundsSamples) ? details.outOfBoundsSamples : [];
      let count = null;
      if (typeof rawCount === "number" && Number.isFinite(rawCount)) count = Math.trunc(rawCount);
      else if (rawCount === null) count = null;

      if (count != null && count > 0) {
        bpLastApplyOutOfBoundsCount = count;
        bpSetStatus("覆盖失败：蓝图包含 " + String(count) + " 个越界坐标。当前写入模式不会自动扩大区域边界。");
        bpLogClient("warn", "apply rejected: out-of-bounds", { outOfBoundsCount: count });
        setExpandBoundsApplyEnabled(true);
      } else if (count === null || known === false) {
        bpLastApplyOutOfBoundsCount = 0;
        bpSetStatus("覆盖失败：检测到越界坐标，但服务端未返回数量。当前写入模式不会自动扩大区域边界。");
        bpLogClient("warn", "apply rejected: out-of-bounds (count unknown)", { outOfBoundsSamples: samples.length });
        // Contract: enable only if structured fields confirm OOB.
        setExpandBoundsApplyEnabled(samples.length > 0);
      } else if (count === 0) {
        bpLastApplyOutOfBoundsCount = 0;
        bpSetStatus("覆盖失败：越界检测返回了 0（合同异常），请查看服务日志。");
        bpLogClient("error", "apply rejected: out-of-bounds but count=0 (contract anomaly)", { outOfBoundsSamples: samples.length });
        setExpandBoundsApplyEnabled(false);
      } else {
        bpLastApplyOutOfBoundsCount = 0;
        bpSetStatus("覆盖失败：检测到越界坐标，但数量不可解析。请查看服务日志。");
        bpLogClient("warn", "apply rejected: out-of-bounds (count unparsable)", { rawCount });
        setExpandBoundsApplyEnabled(samples.length > 0);
      }
      renderBlueprintAuthorServiceStatus();
      return false;
    }
    bpSetStatus("覆盖失败: " + msg);
    const isHttpResponseError = !!(e && e.isHttpResponseError === true);
    // Only mark server unavailable on *non-HTTP-response* network/connection failures.
    // HTTP business failures (e.g. compile_write_failed/static_contract_failed) must NOT flip connection state.
    if (!isHttpResponseError && /author_server_not_found|ECONNREFUSED|Failed to fetch|NetworkError|Load failed|fetch|network/i.test(msg)) {
      markBlueprintAuthorServerUnavailable(msg);
      bpSetStatus(renderAuthorServiceUnavailableHint());
    }
    bpLogClient("error", "apply failed", { message: msg });
    renderBlueprintAuthorServiceStatus();
    return false;
  }
}

async function applyBlueprintToGameDataAllowExpandBounds(){
  if (!bpLastApplyCompact) { bpSetStatus("没有可重试的蓝图：请先点击“一键覆盖地图”。"); return false; }
  const areaId = getCurrentBlueprintAreaId();
  bpLogClient("info", "apply requested (allowExpandBounds)", { area: areaId, outOfBoundsCount: bpLastApplyOutOfBoundsCount || null });
  try {
    const baseUrl = await getBlueprintAuthorServerBaseUrl();
    if (!baseUrl) {
      bpSetStatus(renderAuthorServiceUnavailableHint());
      bpLogClient("error", "author server not found", { area: areaId });
      renderBlueprintAuthorServiceStatus();
      return false;
    }
    bpSetStatus("覆盖中（允许扩展边界）：已连接本地作者服务：" + String(baseUrl));
    renderBlueprintAuthorServiceStatus();
    const r = await fetchJson(buildBlueprintAuthorApiUrl("/api/wilderness-blueprint/apply"), {
      method: "POST",
      body: { area: areaId, compact: bpLastApplyCompact, allowExpandBounds: true }
    });
    if (r && r.ok) {
      const baseMsg = "覆盖完成：已生成正式 AreaSpec 数据。" + (r.snapshotCreated ? (" 旧快照 " + String(r.snapshotId || "")) : "") + " zones=" + String(r.zoneCount ?? "—");
      bpSetStatus(baseMsg);
      bpLogClient("info", "apply success (allowExpandBounds)", { snapshotId: r.snapshotId || null, zoneCount: r.zoneCount ?? null, previewRegenerated: r.previewRegenerated === true });
      writeExport(bpLastApplyCompact, { warnings: [] });
      if (bpLogState.source === "server") void fetchBlueprintServerLogs();
      setExpandBoundsApplyEnabled(false);
      const ok = await refreshPreviewFromGameFiles({ reason: "apply_success", statusText: "覆盖成功，已从游戏文件重载预览。" });
      if (!ok) {
        bpSetStatus("覆盖成功，但预览页重载失败。可在文件页点击“从游戏文件重载预览”。");
        bpLogClient("error", "refresh preview failed after apply success (allowExpandBounds)", { area: areaId });
      }
      return true;
    }
    bpSetStatus("覆盖失败：服务返回异常。");
    bpLogClient("error", "apply failed (allowExpandBounds, bad response)", { ok: r?.ok, error: r?.error || null });
    return false;
  } catch (e) {
    const msg = String(e?.message || e || "");
    bpSetStatus("覆盖失败: " + msg);
    bpLogClient("error", "apply failed (allowExpandBounds)", { message: msg });
    renderBlueprintAuthorServiceStatus();
    return false;
  }
}

/**
 * Force-rebuild the preview HTML from on-disk game files via the dev_server's
 * /api/wilderness-blueprint/refresh-preview endpoint, then reload the current
 * tab to the cache-bust URL so the new gridVm is picked up.
 *
 * Strict rules (matched by the server):
 * - Sends ONLY { area }. The current textarea, blueprintState, snapshots and
 *   in-memory VM are NEVER posted as input.
 * - Same-tab navigation only (location.replace). No window.open / new tab.
 * - On success: stores sessionStorage.wilderness_area_preview_next_mode="grid"
 *   so the reloaded page enters the grid (per-cell) view by default, plus a
 *   transient status message that the init code consumes once.
 */
async function refreshPreviewFromGameFiles(options){
  const opts = (options && typeof options === "object") ? options : {};
  const reason = opts.reason === "apply_success" ? "apply_success" : "manual";
  const areaId = getCurrentBlueprintAreaId();
  const statusText =
    (typeof opts.statusText === "string" && opts.statusText.trim())
      ? String(opts.statusText).trim()
      : (reason === "apply_success" ? "覆盖成功，已从游戏文件重载预览。" : "已从游戏文件重载预览。");

  bpLogClient("info", "refresh preview requested", { area: areaId, reason });
  bpSwitchPanelTab("files");
  try {
    const baseUrl = await getBlueprintAuthorServerBaseUrl();
    if (!baseUrl) {
      bpSetStatus(renderAuthorServiceUnavailableHint());
      bpLogClient("error", "author server not found", { area: areaId });
      renderBlueprintAuthorServiceStatus();
      return false;
    }
    bpSetStatus(reason === "apply_success" ? "覆盖成功，正在从游戏文件重载预览…" : "从游戏文件重载预览中…");
    renderBlueprintAuthorServiceStatus();
    const r = await fetchJson(buildBlueprintAuthorApiUrl("/api/wilderness-blueprint/refresh-preview"), {
      method: "POST",
      body: { area: areaId }
    });
    if (r && r.ok && r.previewRegenerated === true && typeof r.url === "string" && r.url) {
      bpLogClient("info", "refresh preview passed", { area: areaId, reason, reloadToken: r.reloadToken || null, source: r.source || null });
      try {
        sessionStorage.setItem("wilderness_area_preview_next_mode", "grid");
        sessionStorage.setItem("wilderness_area_preview_last_apply_status", statusText);
      } catch { /* sessionStorage unavailable -> still reload */ }
      bpSetStatus("已重新生成预览页，正在刷新…");
      // Same-tab navigation only. No window.open. No new tab.
      try { location.replace(r.url); } catch { location.href = r.url; }
      return true;
    }
    bpSetStatus("重载预览失败：服务返回异常。");
    bpLogClient("error", "refresh preview failed (bad response)", { ok: r?.ok, error: r?.error || null });
    return false;
  } catch (e) {
    const msg = String(e?.message || e || "");
    bpSetStatus("重载预览失败: " + msg);
    bpLogClient("error", "refresh preview failed", { reason, message: msg });
    renderBlueprintAuthorServiceStatus();
    return false;
  }
}

/**
 * Switch the visible blueprint sub-tab ("draw" or "files"). Pure UI; does not
 * fetch or rebuild anything. Used by the tab strip and by refreshPreviewFromGameFiles
 * to auto-switch the panel to the "文件" page before issuing the request.
 */
function bpSwitchPanelTab(name){
  const tabName = name === "files" ? "files" : "draw";
  document.querySelectorAll(".bp-tab").forEach((t) => {
    const on = t.getAttribute("data-bp-tab") === tabName;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll(".bp-tab-panel").forEach((p) => {
    const on = p.getAttribute("data-bp-tab-panel") === tabName;
    p.classList.toggle("is-active", on);
    if (on) p.removeAttribute("hidden");
    else p.setAttribute("hidden", "");
  });
}

async function fetchBlueprintSnapshots(){
  const areaId = getCurrentBlueprintAreaId();
  bpLogClient("info", "snapshots list requested", { area: areaId });
  const baseUrl = await getBlueprintAuthorServerBaseUrl();
  if (!baseUrl) throw new Error("author_server_not_found");
  bpSetStatus("已连接本地作者服务：" + String(baseUrl));
  renderBlueprintAuthorServiceStatus();
  return await fetchJson(buildBlueprintAuthorApiUrl("/api/wilderness-blueprint/snapshots", { area: areaId }));
}

async function loadBlueprintSnapshotToLayer(snapshotId){
  const areaId = getCurrentBlueprintAreaId();
  bpLogClient("info", "snapshot load requested", { area: areaId, snapshotId: String(snapshotId || "") });
  const baseUrl = await getBlueprintAuthorServerBaseUrl();
  if (!baseUrl) throw new Error("author_server_not_found");
  bpSetStatus("已连接本地作者服务：" + String(baseUrl));
  const r = await fetchJson(buildBlueprintAuthorApiUrl("/api/wilderness-blueprint/snapshot", { area: areaId, snapshotId: String(snapshotId || "") }));
  const compact = r?.compact;
  if (!compact) throw new Error("snapshot_missing_compact");
  const parsed = { ok: true, obj: compact };
  const norm = normalizeCompactBlueprintImport(parsed);
  if (!norm.ok) throw new Error(String(norm.error || "导入失败"));
  replaceBlueprintLayerWithImportedCells(norm.cells);
  bpSetStatus("已载入旧快照到蓝图层：" + String(snapshotId || ""));
  bpLogClient("info", "snapshot load success", { snapshotId: String(snapshotId || "") });
  return true;
}

function renderSnapshotList(snapshots){
  const host = byId("blueprint-snapshots-list");
  if (!host) return;
  const list = Array.isArray(snapshots) ? snapshots : [];
  if (list.length === 0) {
    host.textContent = "暂无快照。";
    return;
  }
  const lines = [];
  for (const s of list) {
    const id = String(s?.id || "");
    const label = String(s?.label || s?.createdAt || id);
    const shortHash = typeof s?.sha256 === "string" ? s.sha256.slice(0, 8) : "";
    const cellCount = s?.cellCount != null ? String(s.cellCount) : "—";
    lines.push(
      '<div style="display:flex; gap:8px; align-items:center; justify-content:space-between; border:1px dashed var(--preview-border); border-radius:10px; padding:6px 8px; margin-top:6px;">' +
      '<div style="min-width:0"><div><strong>' + escapeHtml(label) + '</strong></div><div>cells=' + escapeHtml(cellCount) + ' · ' + escapeHtml(shortHash) + ' · <code>' + escapeHtml(id) + '</code></div></div>' +
      '<button type="button" class="bp-btn" data-preview-action="blueprint-load-snapshot" data-snapshot-id="' + escapeHtml(id) + '">载入</button>' +
      "</div>"
    );
  }
  host.innerHTML = lines.join("");
}
function bpSetLayerStatus(text){ if (bp.layerStatusEl) bp.layerStatusEl.textContent = String(text || ""); }

function formatBoundsText(b){
  if (!b) return "—";
  const minX = Number(b.minX), maxX = Number(b.maxX), minY = Number(b.minY), maxY = Number(b.maxY);
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return "—";
  return "x:[" + minX + "," + maxX + "] y:[" + minY + "," + maxY + "]";
}

function updateBlueprintBoundsUi(){
  if (bp.baseBoundsEl) bp.baseBoundsEl.textContent = formatBoundsText(gridVm?.bounds ?? null);
  const auth = computeAuthoringBounds({ baseBounds: gridVm?.bounds ?? null, blueprintCells: blueprintState?.cells });
  if (bp.authoringBoundsEl) bp.authoringBoundsEl.textContent = auth ? formatBoundsText(auth) : formatBoundsText(gridVm?.bounds ?? null);
}

/**
 * Returns true when current tool is one of the editable blueprint cell tools.
 * This is the only tool set that right-erase + undo stack will manage.
 */
function isCanvasEditableTool(tool){
  const t = String(tool || "");
  return t === "terrain_add" || t === "cell_subtract" || t === "special_map_cell";
}

/** Builds a stable key for a grid cell. */
function getCanvasCellKey(x, y){
  return String(Math.round(Number(x))) + "," + String(Math.round(Number(y)));
}

/**
 * Begin an undo step for a gesture.
 * - kind: "paint" | "erase"
 * - tool: blueprint tool at gesture start
 */
function beginCanvasUndoStep(kind, tool){
  const k = String(kind || "");
  const t = String(tool || "");
  currentUndoStep = {
    type: k,
    tool: t,
    /** Map key -> { before, after } (values are blueprint cell objects or null). */
    mutations: new Map()
  };
  return currentUndoStep;
}

/**
 * Record a single-cell mutation inside the current undo step.
 * - before/after are either an object (blueprint cell) or null.
 * - If before and after are deeply equal (for supported shapes), this is ignored.
 */
function recordCanvasCellMutation(key, before, after){
  if (!currentUndoStep) return;
  const k = String(key || "");
  if (!k) return;
  const b = before ?? null;
  const a = after ?? null;

  // Cheap equality: compare kind + stable fields.
  function sig(v){
    if (!v) return "∅";
    const kind = String(v.kind || "");
    if (kind === "terrain_add") return "terrain_add:" + String(v.terrainId || "");
    if (kind === "cell_subtract") return "cell_subtract";
    if (kind === "special_map_cell") return "special_map_cell:" + String(v.mapId || "") + ":" + String(v.label || "");
    return kind || "unknown";
  }
  if (sig(b) === sig(a)) return;

  const prev = currentUndoStep.mutations.get(k);
  if (prev) {
    // Keep earliest before; always update after.
    currentUndoStep.mutations.set(k, { before: prev.before, after: a });
  } else {
    currentUndoStep.mutations.set(k, { before: b, after: a });
  }
}

/**
 * Commit current undo step:
 * - If no actual mutations, do not push.
 * - Otherwise push onto stack.
 */
function commitCanvasUndoStep(){
  if (!currentUndoStep) return false;
  const hasAny = currentUndoStep.mutations && currentUndoStep.mutations.size > 0;
  if (!hasAny) { currentUndoStep = null; return false; }
  canvasEditUndoStack.push(currentUndoStep);
  currentUndoStep = null;
  return true;
}

/**
 * Undo last canvas edit step.
 * Restores blueprintState.cells, then re-renders overlay + export-dependent UI.
 */
function undoLastCanvasEditStep(){
  const step = canvasEditUndoStack.pop();
  if (!step) return false;
  // Bulk snapshot undo: used by layer-wide initialization actions (e.g. copy base map).
  if (step.snapshot && typeof step.snapshot === "object") {
    const snap = step.snapshot;
    blueprintState.layerCreated = Boolean(snap.layerCreated);
    blueprintState.enabled = Boolean(snap.enabled);
    blueprintState.cells = snap.cells instanceof Map ? new Map(snap.cells) : new Map();
    blueprintState.dirty = true;
    resetBlueprintPointerState();
    renderBlueprintOverlay();
    updateBlueprintBoundsUi();
    bpSetLayerStatus(blueprintState.layerCreated ? (blueprintState.enabled ? "蓝图层：已启用" : "蓝图层：已创建（未启用）") : "未启用");
    bpSetStatus("撤销：" + String(step.type || "bulk"));
    return true;
  }
  for (const [k, m] of step.mutations.entries()) {
    if (m && m.before) blueprintState.cells.set(k, m.before);
    else blueprintState.cells.delete(k);
  }
  blueprintState.dirty = true;
  renderBlueprintOverlay();
  // Keep export text in sync if user had exported previously (best effort, no implicit export).
  bpSetStatus("撤销：" + String(step.type || "edit") + " · " + String(step.tool || ""));
  return true;
}

function copyBaseMapToBlueprintLayer(){
  if (blueprintExitIfNotVector()) { bpSetStatus("拷贝失败：仅支持矢量模式。"); return false; }

  // One-step undo via full snapshot (bulk replace).
  canvasEditUndoStack.push({
    type: "copy_base_map",
    tool: "copy_base_map",
    snapshot: {
      layerCreated: Boolean(blueprintState.layerCreated),
      enabled: Boolean(blueprintState.enabled),
      cells: new Map(blueprintState.cells)
    }
  });
  currentUndoStep = null;

  ensureBlueprintLayerCreated();
  toggleBlueprintMode(true, "蓝图模式：已开启（拷贝底图）。");

  blueprintState.cells.clear();

  // 1) terrain cells from base grid (grid coords only; do NOT infer from DOM).
  let terrainCopied = 0;
  const baseCells = Array.isArray(gridVm?.cells) ? gridVm.cells : [];
  for (const c of baseCells) {
    if (!c) continue;
    const x = Math.round(Number(c.x));
    const y = Math.round(Number(c.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const terrainId = String(c.terrainId ?? "").trim();
    if (!terrainId) continue;
    const key = getCanvasCellKey(x, y);
    blueprintState.cells.set(key, { kind: "terrain_add", terrainId });
    terrainCopied++;
  }

  // 2) special map nodes (single-value cell contract):
  // If a key already has terrain_add, keep terrain and skip the special cell.
  let specialCopied = 0;
  let specialSkipped = 0;
  for (const [key, n] of baseMapNodeByCellKey.entries()) {
    if (!n) continue;
    const mapId = String(n.gotoMapId ?? n.mapId ?? "").trim();
    if (!mapId) continue;
    const labelRaw = String(n.label ?? "").trim();
    const label = labelRaw || mapId || "special";
    if (blueprintState.cells.has(key)) { specialSkipped++; continue; }
    blueprintState.cells.set(key, { kind: "special_map_cell", mapId, label });
    specialCopied++;
  }

  blueprintState.dirty = true;
  resetBlueprintPointerState();
  renderBlueprintOverlay();
  updateBlueprintBoundsUi();

  if (specialSkipped > 0) {
    bpSetStatus("已复制 " + terrainCopied + " 个地貌格；" + specialSkipped + " 个特殊点因蓝图单格单值合同未复制。");
  } else if (specialCopied > 0) {
    bpSetStatus("已从底图复制 " + terrainCopied + " 个地貌格到蓝图层（另含特殊点 " + specialCopied + " 个）。");
  } else {
    bpSetStatus("已从底图复制 " + terrainCopied + " 个地貌格到蓝图层。");
  }
  return true;
}

function getBlueprintTerrainStyleRuntime(terrainId){
  const id = String(terrainId ?? "").trim();
  return (BLUEPRINT_TERRAIN_STYLE_REGISTRY && BLUEPRINT_TERRAIN_STYLE_REGISTRY[id]) ? BLUEPRINT_TERRAIN_STYLE_REGISTRY[id] : BLUEPRINT_TERRAIN_STYLE_FALLBACK;
}

function familyLabelRuntime(family){
  const f = String(family ?? "").trim();
  const map = {
    managed: "人工 / 管理",
    snow: "雪面",
    glacial: "陆冰 / 冰川",
    shelf_sea: "冰架 / 海冰 / 海岸",
    rock: "岩地 / 干谷",
    neutral: "未分组"
  };
  return map[f] || "未分组";
}

function getTerrainOptionLabelRuntime(terrainId){
  const id = String(terrainId ?? "").trim();
  const hit = BLUEPRINT_TERRAIN_OPTIONS.find((o) => String(o?.id ?? "") === id);
  return hit ? String(hit.label ?? hit.id ?? id) : id;
}

function renderTerrainSwatchSvgRuntime(terrainId, size){
  const id = String(terrainId ?? "").trim() || "unknown";
  const s = getBlueprintTerrainStyleRuntime(id);
  const w = Math.max(10, Number(size) || 16);
  const h = w;
  const pad = 1.2;
  const x0 = pad;
  const y0 = pad;
  const ww = w - pad * 2;
  const hh = h - pad * 2;
  const stroke = String(s.stroke || "rgba(140,160,172,0.55)");
  const faint = stroke.replace(/0\\.[0-9]+\\)/, "0.42)");
  const pattern = String(s.pattern || "");
  const danger = String(s.danger || "low");
  function pat(){
    if (pattern === "plain-route") {
      const yA = y0 + hh * 0.38;
      const yB = y0 + hh * 0.62;
      return (
        '<line class="blueprint-terrain-pattern blueprint-terrain-pattern--plain-route" x1="' + (x0 + ww * 0.15) + '" y1="' + yA + '" x2="' + (x0 + ww * 0.85) + '" y2="' + yA + '" stroke="' + faint + '" stroke-width="1.6" />' +
        '<line class="blueprint-terrain-pattern blueprint-terrain-pattern--plain-route" x1="' + (x0 + ww * 0.15) + '" y1="' + yB + '" x2="' + (x0 + ww * 0.85) + '" y2="' + yB + '" stroke="' + faint + '" stroke-width="1.6" />'
      );
    }
    if (pattern === "marker-line") {
      const cy = y0 + hh * 0.50;
      const parts = [];
      for (let i = 0; i < 5; i++) {
        const cx = x0 + ww * (0.18 + i * 0.16);
        parts.push('<circle class="blueprint-terrain-pattern blueprint-terrain-pattern--marker-line" cx="' + cx + '" cy="' + cy + '" r="1.4" fill="' + stroke + '" />');
      }
      return parts.join("");
    }
    if (pattern === "wind-streak" || pattern === "wind-streak-long") {
      const parts = [];
      for (let i = 0; i < 4; i++) {
        const yy = y0 + hh * (0.20 + i * 0.18);
        parts.push('<line class="blueprint-terrain-pattern blueprint-terrain-pattern--wind-streak" x1="' + (x0 + ww * 0.18) + '" y1="' + yy + '" x2="' + (x0 + ww * 0.88) + '" y2="' + (yy - hh * 0.08) + '" stroke="' + faint + '" stroke-width="1.2" />');
      }
      return parts.join("");
    }
    if (pattern === "snow-speckle" || pattern === "sand-speckle") {
      const fill = pattern === "sand-speckle" ? faint : "rgba(255,255,255,0.75)";
      const pts = [
        [0.22, 0.28],
        [0.40, 0.62],
        [0.64, 0.32],
        [0.78, 0.56],
        [0.52, 0.44]
      ];
      const parts = [];
      for (const it of pts) {
        parts.push('<circle class="blueprint-terrain-pattern blueprint-terrain-pattern--speckle" cx="' + (x0 + ww * it[0]) + '" cy="' + (y0 + hh * it[1]) + '" r="1.1" fill="' + fill + '" />');
      }
      return parts.join("");
    }
    if (pattern === "ridge-lines" || pattern === "ridge-zigzag") {
      const parts = [];
      for (let i = 0; i < 5; i++) {
        const yy = y0 + hh * (0.18 + i * 0.16);
        if (pattern === "ridge-zigzag") {
          const xA = x0 + ww * 0.15;
          const xB = x0 + ww * 0.50;
          const xC = x0 + ww * 0.85;
          parts.push('<path class="blueprint-terrain-pattern blueprint-terrain-pattern--ridge-zigzag" d="M ' + xA + " " + yy + " L " + xB + " " + (yy + hh * 0.06) + " L " + xC + " " + yy + '" stroke="' + faint + '" stroke-width="1.2" fill="none" />');
        } else {
          parts.push('<line class="blueprint-terrain-pattern blueprint-terrain-pattern--ridge-lines" x1="' + (x0 + ww * 0.12) + '" y1="' + yy + '" x2="' + (x0 + ww * 0.88) + '" y2="' + yy + '" stroke="' + faint + '" stroke-width="1.2" />');
        }
      }
      return parts.join("");
    }
    if (pattern === "ice-flow") {
      const xA = x0 + ww * 0.12, xB = x0 + ww * 0.88;
      const yA = y0 + hh * 0.34, yB = y0 + hh * 0.66;
      return (
        '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--ice-flow" d="M ' + xA + " " + yA + " C " + (x0 + ww * 0.40) + " " + (yA - hh * 0.10) + ", " + (x0 + ww * 0.62) + " " + (yA + hh * 0.12) + ", " + xB + " " + yA + '" stroke="' + faint + '" stroke-width="1.2" fill="none" />' +
        '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--ice-flow" d="M ' + xA + " " + yB + " C " + (x0 + ww * 0.36) + " " + (yB - hh * 0.08) + ", " + (x0 + ww * 0.64) + " " + (yB + hh * 0.10) + ", " + xB + " " + yB + '" stroke="' + faint + '" stroke-width="1.2" fill="none" />'
      );
    }
    if (pattern === "crack-lines" || pattern === "central-crack" || pattern === "polygon-crack") {
      if (pattern === "central-crack") {
        return '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--central-crack" d="M ' + (x0 + ww * 0.50) + " " + (y0 + hh * 0.10) + " L " + (x0 + ww * 0.46) + " " + (y0 + hh * 0.40) + " L " + (x0 + ww * 0.54) + " " + (y0 + hh * 0.62) + " L " + (x0 + ww * 0.48) + " " + (y0 + hh * 0.90) + '" stroke="rgba(10,10,10,0.72)" stroke-width="1.8" fill="none" />';
      }
      if (pattern === "polygon-crack") {
        return '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--polygon-crack" d="M ' + (x0 + ww * 0.18) + " " + (y0 + hh * 0.30) + " L " + (x0 + ww * 0.42) + " " + (y0 + hh * 0.18) + " L " + (x0 + ww * 0.70) + " " + (y0 + hh * 0.30) + " L " + (x0 + ww * 0.78) + " " + (y0 + hh * 0.58) + " L " + (x0 + ww * 0.52) + " " + (y0 + hh * 0.78) + " L " + (x0 + ww * 0.24) + " " + (y0 + hh * 0.62) + ' Z" stroke="' + faint + '" stroke-width="1.2" fill="none" />';
      }
      return (
        '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--crack-lines" d="M ' + (x0 + ww * 0.18) + " " + (y0 + hh * 0.24) + " L " + (x0 + ww * 0.38) + " " + (y0 + hh * 0.52) + " L " + (x0 + ww * 0.30) + " " + (y0 + hh * 0.78) + '" stroke="rgba(10,10,10,0.62)" stroke-width="1.4" fill="none" />' +
        '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--crack-lines" d="M ' + (x0 + ww * 0.52) + " " + (y0 + hh * 0.20) + " L " + (x0 + ww * 0.62) + " " + (y0 + hh * 0.44) + " L " + (x0 + ww * 0.56) + " " + (y0 + hh * 0.82) + '" stroke="rgba(10,10,10,0.62)" stroke-width="1.4" fill="none" />'
      );
    }
    if (pattern === "rock-speckle") {
      const pts = [
        [0.25, 0.30],
        [0.38, 0.64],
        [0.60, 0.42],
        [0.76, 0.62]
      ];
      const parts = [];
      for (const it of pts) {
        parts.push('<rect class="blueprint-terrain-pattern blueprint-terrain-pattern--rock-speckle" x="' + (x0 + ww * it[0]) + '" y="' + (y0 + hh * it[1]) + '" width="2.6" height="2.6" fill="rgba(40,26,18,0.44)" />');
      }
      return parts.join("");
    }
    if (pattern === "industrial-grid") {
      const parts = [];
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        parts.push('<line class="blueprint-terrain-pattern blueprint-terrain-pattern--industrial-grid" x1="' + (x0 + ww * t) + '" y1="' + y0 + '" x2="' + (x0 + ww * t) + '" y2="' + (y0 + hh) + '" stroke="' + faint + '" stroke-width="1.1" />');
        parts.push('<line class="blueprint-terrain-pattern blueprint-terrain-pattern--industrial-grid" x1="' + x0 + '" y1="' + (y0 + hh * t) + '" x2="' + (x0 + ww) + '" y2="' + (y0 + hh * t) + '" stroke="' + faint + '" stroke-width="1.1" />');
      }
      return parts.join("");
    }
    if (pattern === "cliff-hatch") {
      const parts = [];
      for (let i = 0; i < 5; i++) {
        const x = x0 + ww * (0.12 + i * 0.18);
        parts.push('<line class="blueprint-terrain-pattern blueprint-terrain-pattern--cliff-hatch" x1="' + x + '" y1="' + (y0 + hh * 0.10) + '" x2="' + (x + ww * 0.18) + '" y2="' + (y0 + hh * 0.90) + '" stroke="' + faint + '" stroke-width="1.2" />');
      }
      return parts.join("");
    }
    if (pattern === "shelf-band") {
      const parts = [];
      for (let i = 0; i < 4; i++) {
        const yy = y0 + hh * (0.18 + i * 0.18);
        parts.push('<line class="blueprint-terrain-pattern blueprint-terrain-pattern--shelf-band" x1="' + (x0 + ww * 0.12) + '" y1="' + yy + '" x2="' + (x0 + ww * 0.88) + '" y2="' + yy + '" stroke="' + faint + '" stroke-width="1.4" />');
      }
      return parts.join("");
    }
    if (pattern === "edge-jag") {
      return '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--edge-jag" d="M ' + (x0 + ww * 0.12) + " " + (y0 + hh * 0.70) + " L " + (x0 + ww * 0.28) + " " + (y0 + hh * 0.52) + " L " + (x0 + ww * 0.42) + " " + (y0 + hh * 0.78) + " L " + (x0 + ww * 0.56) + " " + (y0 + hh * 0.54) + " L " + (x0 + ww * 0.70) + " " + (y0 + hh * 0.76) + " L " + (x0 + ww * 0.88) + " " + (y0 + hh * 0.58) + '" stroke="' + faint + '" stroke-width="1.4" fill="none" />';
    }
    if (pattern === "ice-glint") {
      return '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--ice-glint" d="M ' + (x0 + ww * 0.10) + " " + (y0 + hh * 0.70) + " L " + (x0 + ww * 0.92) + " " + (y0 + hh * 0.22) + '" stroke="rgba(255,255,255,0.55)" stroke-width="2.0" fill="none" />';
    }
    return '<line class="blueprint-terrain-pattern blueprint-terrain-pattern--low-texture" x1="' + (x0 + ww * 0.18) + '" y1="' + (y0 + hh * 0.54) + '" x2="' + (x0 + ww * 0.86) + '" y2="' + (y0 + hh * 0.46) + '" stroke="' + faint + '" stroke-width="1.0" />';
  }
  const dangerFrame = (danger === "high" || danger === "hard")
    ? '<rect class="blueprint-terrain-danger-frame blueprint-terrain-danger-frame--' + danger + '" x="' + x0 + '" y="' + y0 + '" width="' + ww + '" height="' + hh + '" rx="2" ry="2"></rect>'
    : "";
  return (
    '<svg viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="terrain swatch ' + escapeHtmlRuntime(id) + '">' +
      '<rect class="blueprint-terrain-fill" x="' + x0 + '" y="' + y0 + '" width="' + ww + '" height="' + hh + '" rx="2" ry="2" fill="' + escapeHtmlRuntime(String(s.fill)) + '" stroke="' + escapeHtmlRuntime(String(s.stroke)) + '" stroke-width="1.2"></rect>' +
      pat() +
      dangerFrame +
    "</svg>"
  );
}

function updateBlueprintTerrainPreview(){
  const wrap = byId("blueprint-terrain-preview");
  if (!wrap) return;
  const swatch = wrap.querySelector(".bp-swatch");
  const nameEl = wrap.querySelector(".bp-terrain-name");
  const m1 = wrap.querySelectorAll(".bp-terrain-meta")[0];
  const m2 = wrap.querySelectorAll(".bp-terrain-meta")[1];
  const tid = String(blueprintState.selectedTerrainId || "");
  const label = tid ? getTerrainOptionLabelRuntime(tid) : "（未选择）";
  const st = getBlueprintTerrainStyleRuntime(tid);
  if (swatch) {
    swatch.innerHTML = tid ? renderTerrainSwatchSvgRuntime(tid, 42) : "";
  }
  if (nameEl) nameEl.textContent = label;
  if (m1) m1.textContent = "terrainId: " + (tid || "—");
  if (m2) m2.textContent = "family: " + familyLabelRuntime(st.family) + " · danger: " + String(st.danger || "low");
}

function buildBlueprintLegend(){
  const host = byId("blueprint-legend");
  if (!host) return;
  const groups = new Map();
  for (const it of BLUEPRINT_TERRAIN_OPTIONS) {
    const id = String(it?.id ?? "").trim();
    if (!id) continue;
    const st = getBlueprintTerrainStyleRuntime(id);
    const fam = String(st.family || "neutral");
    if (!groups.has(fam)) groups.set(fam, []);
    groups.get(fam).push({ id, label: String(it?.label ?? id) });
  }
  const order = ["managed", "snow", "glacial", "shelf_sea", "rock", "neutral"];
  const parts = [];
  for (const fam of order) {
    const items = groups.get(fam);
    if (!items || !items.length) continue;
    parts.push('<div class="bp-legend-family">');
    parts.push('<div class="bp-legend-family-title">' + escapeHtmlRuntime(familyLabelRuntime(fam)) + "</div>");
    parts.push('<div class="bp-legend-items">');
    for (const row of items.slice(0, 200)) {
      parts.push(
        '<div class="bp-legend-item">' +
          '<span class="bp-swatch" aria-hidden="true">' + renderTerrainSwatchSvgRuntime(row.id, 16) + "</span>" +
          '<span class="bp-legend-label">' + escapeHtmlRuntime(row.label) + " · <code>" + escapeHtmlRuntime(row.id) + "</code></span>" +
        "</div>"
      );
    }
    parts.push("</div></div>");
  }
  host.innerHTML = parts.join("");
}

function initBlueprintTerrainSelect(){
  if (!bp.terrainSelectEl) return;
  const parts = [];
  parts.push('<option value="">（选择地貌…）</option>');
  for (const it of BLUEPRINT_TERRAIN_OPTIONS) {
    if (!it || !it.id) continue;
    const id = String(it.id);
    const label = String(it.label ?? it.id ?? it.id);
    parts.push('<option value="' + escapeHtmlRuntime(id) + '">' + escapeHtmlRuntime(label) + ' · ' + escapeHtmlRuntime(id) + '</option>');
  }
  bp.terrainSelectEl.innerHTML = parts.join("");
  if (!blueprintState.selectedTerrainId) {
    const first = BLUEPRINT_TERRAIN_OPTIONS[0]?.id ? String(BLUEPRINT_TERRAIN_OPTIONS[0].id) : "";
    blueprintState.selectedTerrainId = first;
    if (first) bp.terrainSelectEl.value = first;
  }
  bp.terrainSelectEl.addEventListener("change", () => {
    blueprintState.selectedTerrainId = String(bp.terrainSelectEl.value || "");
    updateBlueprintTerrainPreview();
    bpSetStatus("已选择地貌: " + (blueprintState.selectedTerrainId || "—"));
  });
}

function initBlueprintInputs(){
  bp.specialMapIdEl?.addEventListener("input", () => { blueprintState.specialMapId = String(bp.specialMapIdEl.value || ""); });
  bp.specialLabelEl?.addEventListener("input", () => { blueprintState.specialLabel = String(bp.specialLabelEl.value || ""); });

  // Workbench shortcut: Ctrl+Enter executes blueprint patch in textarea.
  bp.exportEl?.addEventListener("keydown", (event) => {
    const key = String(event?.key || "");
    const isEnter = key === "Enter";
    const want = isEnter && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;
    if (!want) return;
    try { event.preventDefault(); } catch {}
    try { event.stopPropagation(); } catch {}
    try { executeBlueprintPatchFromTextarea(); } catch { bpSetStatus("蓝图代码执行失败。"); }
  });

  updateBlueprintSpecialInputsVisibility();
}

function updateBlueprintSpecialInputsVisibility(){
  const host = byId("blueprint-special-inputs");
  if (!host) return;
  const on = String(blueprintState.tool || "") === "special_map_cell";
  host.hidden = !on;
  host.setAttribute("aria-hidden", on ? "false" : "true");
}

function setBlueprintBlendMode(mode){
  const m = mode === "top_only" ? "top_only" : mode === "bottom_only" ? "bottom_only" : "onion_diff";
  blueprintState.blendMode = m;
  if (bp.svg) {
    bp.svg.classList.toggle("is-blueprint-onion", m === "onion_diff");
    bp.svg.classList.toggle("is-blueprint-top-only", m === "top_only");
    bp.svg.classList.toggle("is-blueprint-bottom-only", m === "bottom_only");
  }
  document.querySelectorAll('[data-preview-action="blueprint-set-blend"]').forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-blend") === m);
  });
  renderBlueprintOverlay();
}

function setBlueprintTool(tool){
  const t = tool === "cell_subtract" ? "cell_subtract" : tool === "special_map_cell" ? "special_map_cell" : "terrain_add";
  blueprintState.tool = t;
  updateBlueprintSpecialInputsVisibility();
  document.querySelectorAll('[data-preview-action="blueprint-set-tool"]').forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-tool") === t);
  });
  bpSetStatus("工具: " + t);
}

function ensureBlueprintLayerCreated(){
  if (blueprintState.layerCreated) return true;
  blueprintState.layerCreated = true;
  bpSetLayerStatus("蓝图层：已创建（唯一）");
  renderBlueprintOverlay();
  return true;
}

function blueprintExitIfNotVector(){
  if (getActivePreviewMode() !== "vector") {
    if (blueprintState.enabled) toggleBlueprintMode(false, "已退出：切换到格点模式。");
    return true;
  }
  return false;
}

function toggleBlueprintMode(force, reason){
  if (getActivePreviewMode() !== "vector") {
    blueprintState.enabled = false;
    stageEl?.classList?.remove("is-blueprint-editing");
    viewportEl?.classList?.remove("is-blueprint-editing");
    bpSetStatus("蓝图绘制仅支持矢量图");
    bpSetLayerStatus("未启用");
    return;
  }
  const next = typeof force === "boolean" ? force : !blueprintState.enabled;
  blueprintState.enabled = next;
  if (next) {
    ensureBlueprintLayerCreated();
    viewportEl?.classList?.add("is-blueprint-editing");
    bpSetStatus(reason || "蓝图模式：已开启。长按 200ms 进入涂抹。");
    bpSetLayerStatus("蓝图层：已启用（唯一）");
  } else {
    viewportEl?.classList?.remove("is-blueprint-editing");
    bpSetStatus(reason || "蓝图模式：已关闭（蓝图层未清空）。");
    bpSetLayerStatus(blueprintState.layerCreated ? "蓝图层：已创建（未启用）" : "未启用");
    resetBlueprintPointerState();
    clearBlueprintLayers(); // visuals only; keep data
    renderBlueprintOverlay();
  }
}

function blueprintShouldHandlePointer(event){
  if (!blueprintState.enabled) return false;
  if (getActivePreviewMode() !== "vector") return false;
  if (!event) return false;
  if (event.button !== 0) return false;
  if (event?.target && typeof event.target.closest === "function") {
    if (event.target.closest("input, textarea, select, [contenteditable='true'], button")) return false;
  }
  return true;
}

/**
 * Canvas-only context menu handler.
 * Must be bound on the viewport element (NOT on document) to avoid killing normal UI menus.
 */
function handleCanvasContextMenu(event){
  if (!event) return false;
  try { event.preventDefault(); } catch {}
  try { event.stopPropagation(); } catch {}
  return true;
}

/**
 * Delete a cell in blueprintState for the currently selected tool only.
 * Returns true when an actual deletion happened.
 */
function deleteCellForCurrentTool(x, y){
  const key = getCanvasCellKey(x, y);
  const tool = String(blueprintState.tool || "");
  if (!isCanvasEditableTool(tool)) return false;
  const cur = blueprintState.cells.get(key) ?? null;
  if (!cur) return false;
  if (String(cur.kind || "") !== tool) return false;
  blueprintState.cells.delete(key);
  blueprintState.dirty = true;
  return true;
}

/**
 * Pointer down dispatcher for canvas editing.
 * - Left button: existing blueprint paint path (with undo step grouping).
 * - Right button: batch erase path (only for editable tools).
 */
function handleCanvasPointerDown(event){
  if (!blueprintState.enabled) return false;
  if (getActivePreviewMode() !== "vector") return false;
  if (!event) return false;
  if (event?.target && typeof event.target.closest === "function") {
    if (event.target.closest("input, textarea, select, [contenteditable='true'], button")) return false;
  }

  // Right button: begin erase drag
  if (event.button === 2) {
    const tool = String(blueprintState.tool || "");
    if (!isCanvasEditableTool(tool)) return false;
    try { event.preventDefault(); } catch {}
    try { event.stopPropagation(); } catch {}
    ensureBlueprintLayerCreated();

    blueprintState.rightErase.isDragging = true;
    blueprintState.rightErase.tool = tool;
    blueprintState.rightErase.visitedKeys.clear();
    blueprintState.rightErase.lastPointerGridKey = null;

    beginCanvasUndoStep("erase", tool);
    viewportEl?.setPointerCapture?.(event.pointerId);

    // Delete the starting cell immediately.
    const cell = blueprintEventToCell(event);
    if (cell) {
      const key = getCanvasCellKey(cell.x, cell.y);
      blueprintState.rightErase.visitedKeys.add(key);
      const before = blueprintState.cells.get(key) ?? null;
      const did = deleteCellForCurrentTool(cell.x, cell.y);
      const after = blueprintState.cells.get(key) ?? null;
      if (did) recordCanvasCellMutation(key, before, after);
      renderBlueprintOverlay();
    }
    return true;
  }

  // Left button: begin paint gesture grouping (one undo step per pointer gesture).
  if (event.button === 0) {
    beginCanvasUndoStep("paint", String(blueprintState.tool || ""));
    return false; // keep existing blueprint pointer down path
  }

  return false;
}

/**
 * Pointer move handler for right-erase batch deletion.
 * Returns true if it handled right-erase; false otherwise.
 */
function handleCanvasPointerMove(event){
  if (!blueprintState.enabled) return false;
  if (getActivePreviewMode() !== "vector") return false;
  if (!event) return false;

  if (!blueprintState.rightErase.isDragging) return false;
  if (event.button !== 2 && event.buttons !== 2) {
    // Some browsers report button=0 during move; use buttons bitmask as fallback.
    // If right is no longer pressed, treat as end.
    return handleCanvasPointerUp(event);
  }
  try { event.preventDefault(); } catch {}

  const cell = blueprintEventToCell(event);
  if (!cell) return true;
  const key = getCanvasCellKey(cell.x, cell.y);
  if (blueprintState.rightErase.visitedKeys.has(key)) return true;
  blueprintState.rightErase.visitedKeys.add(key);

  const before = blueprintState.cells.get(key) ?? null;
  const did = deleteCellForCurrentTool(cell.x, cell.y);
  if (!did) return true; // deleting non-existing cell: no undo record
  const after = blueprintState.cells.get(key) ?? null;
  recordCanvasCellMutation(key, before, after);
  renderBlueprintOverlay();
  return true;
}

/**
 * Pointer up handler for completing right-erase gesture, and committing undo step.
 * Also used as a generic "finish" for cancel/leave/blur.
 */
function handleCanvasPointerUp(event){
  if (!blueprintState.rightErase.isDragging) return false;
  try { event?.preventDefault?.(); } catch {}
  try { viewportEl?.releasePointerCapture?.(event?.pointerId); } catch {}

  blueprintState.rightErase.isDragging = false;
  blueprintState.rightErase.tool = null;
  blueprintState.rightErase.lastPointerGridKey = null;
  blueprintState.rightErase.visitedKeys.clear();

  // Only push undo step if actual deletions happened.
  const pushed = commitCanvasUndoStep();
  if (pushed) bpSetStatus("右键批量删除完成（可 Ctrl+Z 撤销）。");
  else { currentUndoStep = null; }
  return true;
}

/**
 * Keydown handler for Ctrl+Z undo.
 * Must only respond when canvas is focused OR pointer is inside canvas.
 * Must not intercept when typing in inputs/textareas/select/contenteditable.
 */
function handleCanvasKeyDown(event){
  if (!event) return false;
  if (!blueprintState.enabled) return false;
  if (getActivePreviewMode() !== "vector") return false;
  const key = String(event.key || "");
  const isZ = key === "z" || key === "Z";
  const wantUndo = (event.ctrlKey || event.metaKey) && isZ && !event.shiftKey && !event.altKey;
  if (!wantUndo) return false;

  // Gate by focus/hover inside canvas.
  const focused = document.activeElement === stageEl;
  const inside = Boolean(blueprintState.canvas.isPointerInside);
  if (!focused && !inside) return false;

  const ok = undoLastCanvasEditStep();
  if (!ok) return false;
  try { event.preventDefault(); } catch {}
  try { event.stopPropagation(); } catch {}
  return true;
}

function blueprintEventToCell(event){
  if (!viewportEl) return null;
  const rect = viewportEl.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  const w = screenToWorld(sx, sy);
  if (!w) return null;
  const c = nearestCell(w.x, w.y);
  return { x: Number(c.x), y: Number(c.y), key: String(c.x) + "," + String(c.y) };
}

function clearBlueprintLongPressTimer(){
  const t = blueprintState.pointer.longPressTimer;
  if (t) clearTimeout(t);
  blueprintState.pointer.longPressTimer = null;
}

function resetBlueprintPointerState(){
  clearBlueprintLongPressTimer();
  blueprintState.pointer.pointerId = null;
  blueprintState.pointer.downCell = null;
  blueprintState.pointer.lastCell = null;
  blueprintState.pointer.isPainting = false;
}

function interpolateGridCells(a, b){
  if (!a || !b) return [];
  let x0 = Math.round(Number(a.x));
  let y0 = Math.round(Number(a.y));
  const x1 = Math.round(Number(b.x));
  const y1 = Math.round(Number(b.y));
  const out = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  // Safety: prevent massive interpolation when pointer jumps far (virtual infinite canvas).
  const MAX_INTERPOLATED_CELLS_PER_MOVE = 256;
  let guard = 0;
  while (guard++ < MAX_INTERPOLATED_CELLS_PER_MOVE) {
    out.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  if (!(x0 === x1 && y0 === y1) && !didWarnInterpolationTruncate) {
    didWarnInterpolationTruncate = true;
    bpSetStatus("提示：指针移动跨度过大，涂抹已截断（单次最多 256 格）。");
  }
  return out;
}

function isFiniteGridCoord(x, y){
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return false;
  return true;
}

function isWithinBaseAreaBounds(x, y){
  const b = gridVm?.bounds;
  if (!b) return false;
  const xx = Number(x);
  const yy = Number(y);
  if (!Number.isFinite(xx) || !Number.isFinite(yy)) return false;
  return xx >= Number(b.minX) && xx <= Number(b.maxX) && yy >= Number(b.minY) && yy <= Number(b.maxY);
}

function computeBlueprintContentBounds(cellsMap){
  const cells = cellsMap && typeof cellsMap.entries === "function" ? cellsMap : null;
  if (!cells) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let n = 0;
  for (const [k] of cells.entries()) {
    const [xs, ys] = String(k).split(",");
    const x = Number(xs), y = Number(ys);
    if (!isFiniteGridCoord(x, y)) continue;
    n++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!n) return null;
  return { minX, maxX, minY, maxY, count: n };
}

function computeAuthoringBounds({ baseBounds, blueprintCells }){
  const b = baseBounds && typeof baseBounds === "object" ? baseBounds : null;
  const bb = computeBlueprintContentBounds(blueprintCells);
  if (!b && !bb) return null;
  const out = {
    minX: b ? Number(b.minX) : bb.minX,
    maxX: b ? Number(b.maxX) : bb.maxX,
    minY: b ? Number(b.minY) : bb.minY,
    maxY: b ? Number(b.maxY) : bb.maxY,
    hasBlueprintOutsideBase: false
  };
  if (bb) {
    out.minX = Math.min(out.minX, bb.minX);
    out.maxX = Math.max(out.maxX, bb.maxX);
    out.minY = Math.min(out.minY, bb.minY);
    out.maxY = Math.max(out.maxY, bb.maxY);
    if (b) {
      out.hasBlueprintOutsideBase =
        bb.minX < Number(b.minX) || bb.maxX > Number(b.maxX) || bb.minY < Number(b.minY) || bb.maxY > Number(b.maxY);
    }
  }
  return out;
}

function isTerrainOptionAllowed(id){
  const tid = String(id || "").trim();
  if (!tid) return false;
  return BLUEPRINT_TERRAIN_OPTIONS.some((o) => String(o?.id ?? "") === tid);
}

function canAcceptMoreBlueprintCells(nextCount){
  const n = Number(nextCount);
  if (!Number.isFinite(n)) return false;
  // Soft guidance + hard safety (virtual infinite canvas).
  if (n > 20000) return false;
  return true;
}

let didWarnLargeBlueprint = false;
let didWarnInterpolationTruncate = false;

function applyBlueprintToolToCell(cell){
  if (!cell) return;
  const x = Number(cell.x), y = Number(cell.y);
  if (!isFiniteGridCoord(x, y)) return;
  const key = getCanvasCellKey(x, y);
  const tool = blueprintState.tool;
  const before = blueprintState.cells.get(key) ?? null;

  if (tool === "terrain_add") {
    const tid = String(blueprintState.selectedTerrainId || "").trim();
    if (!isTerrainOptionAllowed(tid)) {
      bpSetStatus("错误：请选择有效地貌（terrain_add）。");
      return;
    }
    const nextCount = blueprintState.cells.has(key) ? blueprintState.cells.size : (blueprintState.cells.size + 1);
    if (!canAcceptMoreBlueprintCells(nextCount)) {
      bpSetStatus("蓝图格子过多（>20000），已停止批量绘制；可单格删除/清空/导出。");
      return;
    }
    blueprintState.cells.set(key, { kind: "terrain_add", terrainId: tid });
  } else if (tool === "cell_subtract") {
    const nextCount = blueprintState.cells.has(key) ? blueprintState.cells.size : (blueprintState.cells.size + 1);
    if (!canAcceptMoreBlueprintCells(nextCount)) {
      bpSetStatus("蓝图格子过多（>20000），已停止批量绘制；可单格删除/清空/导出。");
      return;
    }
    blueprintState.cells.set(key, { kind: "cell_subtract" });
  } else if (tool === "special_map_cell") {
    const mapId = String(blueprintState.specialMapId || "").trim();
    const label = String(blueprintState.specialLabel || "").trim();
    if (!mapId || !label) {
      bpSetStatus("错误：special_map_cell 需要 mapId + label。");
      return;
    }
    const nextCount = blueprintState.cells.has(key) ? blueprintState.cells.size : (blueprintState.cells.size + 1);
    if (!canAcceptMoreBlueprintCells(nextCount)) {
      bpSetStatus("蓝图格子过多（>20000），已停止批量绘制；可单格删除/清空/导出。");
      return;
    }
    blueprintState.cells.set(key, { kind: "special_map_cell", mapId, label });
  } else {
    return;
  }
  const after = blueprintState.cells.get(key) ?? null;
  recordCanvasCellMutation(key, before, after);
  blueprintState.dirty = true;
  if (!didWarnLargeBlueprint && blueprintState.cells.size > 5000) {
    didWarnLargeBlueprint = true;
    bpSetStatus("蓝图格子较多（>5000），建议分区导出。");
  } else {
    bpSetStatus("已绘制: (" + x + "," + y + ") · " + blueprintState.tool + (isWithinBaseAreaBounds(x, y) ? "" : " · 超出原始区域边界，仅作为蓝图扩展草案"));
  }
  renderBlueprintOverlay();
}

function vectorCellBoxToScreenRect(x, y){
  const p00 = worldToScreen(Number(x) - 0.5, Number(y) - 0.5);
  const p11 = worldToScreen(Number(x) + 0.5, Number(y) + 0.5);
  const minX = Math.min(p00.x, p11.x);
  const maxX = Math.max(p00.x, p11.x);
  const minY = Math.min(p00.y, p11.y);
  const maxY = Math.max(p00.y, p11.y);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX)/2, cy: (minY + maxY)/2 };
}

const baseMapNodeByCellKey = new Map();
for (const n of (vectorVm?.mapNodes ?? [])) {
  if (!n) continue;
  const x = Math.round(Number(n.x));
  const y = Math.round(Number(n.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
  baseMapNodeByCellKey.set(String(x) + "," + String(y), n);
}

function composeBlueprintViewModel(){
  const base = {
    bounds: gridVm?.bounds ?? null,
    baseCellByKey: cellByKey,
    baseMapNodeByCellKey,
    ops: []
  };
  for (const [k, v] of blueprintState.cells.entries()) {
    if (!v) continue;
    const parts = String(k).split(",");
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (v.kind === "terrain_add") {
      const terrainId = String(v.terrainId ?? "").trim();
      const st = getBlueprintTerrainStyleRuntime(terrainId);
      base.ops.push({
        key: k,
        x,
        y,
        value: v,
        terrain: {
          terrainId,
          label: getTerrainOptionLabelRuntime(terrainId),
          family: String(st.family ?? "neutral"),
          pattern: String(st.pattern ?? "low-texture"),
          danger: String(st.danger ?? "low"),
          fill: String(st.fill ?? ""),
          stroke: String(st.stroke ?? "")
        }
      });
    } else {
      base.ops.push({ key: k, x, y, value: v });
    }
  }
  return base;
}

function clearBlueprintLayers(){
  bp.layerCells && (bp.layerCells.innerHTML = "");
  bp.layerDiff && (bp.layerDiff.innerHTML = "");
  bp.layerSpecial && (bp.layerSpecial.innerHTML = "");
  bp.layerLabels && (bp.layerLabels.innerHTML = "");
  bp.layerBrush && (bp.layerBrush.innerHTML = "");
}

function renderBlueprintCells(vm){
  if (!bp.layerCells) return;
  const parts = [];
  for (const op of vm.ops) {
    const v = op.value;
    if (!v) continue;
    if (v.kind !== "terrain_add" && v.kind !== "cell_subtract") continue;
    const r = vectorCellBoxToScreenRect(op.x, op.y);
    if (v.kind === "terrain_add") {
      const tid = String(v.terrainId ?? "").trim();
      const st = getBlueprintTerrainStyleRuntime(tid);
      const fam = String(st.family ?? "neutral");
      const pat = String(st.pattern ?? "low-texture");
      const danger = String(st.danger ?? "low");
      const fill = String(st.fill ?? "rgba(210,220,226,0.22)");
      const stroke = String(st.stroke ?? "rgba(140,160,172,0.55)");
      const faint = stroke.replace(/0\\.[0-9]+\\)/, "0.46)");
      const x = r.x, y = r.y, w = r.w, h = r.h;
      const x0 = x + 1.2, y0 = y + 1.2, ww = Math.max(0, w - 2.4), hh = Math.max(0, h - 2.4);
      const cx = r.cx, cy = r.cy;

      function patEl(){
        if (pat === "plain-route") {
          const yA = y0 + hh * 0.38;
          const yB = y0 + hh * 0.62;
          return (
            '<line class="blueprint-terrain-pattern blueprint-terrain-pattern--plain-route" x1="' + (x0 + ww * 0.12).toFixed(2) + '" y1="' + yA.toFixed(2) + '" x2="' + (x0 + ww * 0.88).toFixed(2) + '" y2="' + yA.toFixed(2) + '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.8" />' +
            '<line class="blueprint-terrain-pattern blueprint-terrain-pattern--plain-route" x1="' + (x0 + ww * 0.12).toFixed(2) + '" y1="' + yB.toFixed(2) + '" x2="' + (x0 + ww * 0.88).toFixed(2) + '" y2="' + yB.toFixed(2) + '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.8" />'
          );
        }
        if (pat === "marker-line") {
          const parts2 = [];
          for (let i = 0; i < 6; i++) {
            const px = x0 + ww * (0.12 + i * 0.15);
            const rr = 1.4;
            parts2.push('<circle class="blueprint-terrain-pattern blueprint-terrain-pattern--marker-line" cx="' + px.toFixed(2) + '" cy="' + (cy).toFixed(2) + '" r="' + rr + '" fill="' + escapeHtmlRuntime(stroke) + '" />');
            if (i % 2 === 0) {
              parts2.push('<line class="blueprint-terrain-pattern blueprint-terrain-pattern--marker-line" x1="' + px.toFixed(2) + '" y1="' + (y0 + hh * 0.18).toFixed(2) + '" x2="' + px.toFixed(2) + '" y2="' + (y0 + hh * 0.82).toFixed(2) + '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.0" />');
            }
          }
          return parts2.join("");
        }
        if (pat === "wind-streak" || pat === "wind-streak-long") {
          const count = pat === "wind-streak-long" ? 6 : 4;
          const parts2 = [];
          for (let i = 0; i < count; i++) {
            const yy = y0 + hh * (0.18 + i * (0.66 / Math.max(1, count - 1)));
            parts2.push('<line class="blueprint-terrain-pattern blueprint-terrain-pattern--wind-streak" x1="' + (x0 + ww * 0.10).toFixed(2) + '" y1="' + yy.toFixed(2) + '" x2="' + (x0 + ww * 0.92).toFixed(2) + '" y2="' + (yy - hh * 0.10).toFixed(2) + '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.2" />');
          }
          return parts2.join("");
        }
        if (pat === "snow-speckle" || pat === "sand-speckle") {
          const fill2 = pat === "sand-speckle" ? faint : "rgba(255,255,255,0.78)";
          // deterministic seed from x,y (avoid randomness)
          const seed = (Math.abs(Math.trunc(op.x * 73856093) ^ Math.trunc(op.y * 19349663)) >>> 0) / 4294967295;
          const pts = [];
          for (let i = 0; i < 8; i++) {
            const t = (seed * 997 + i * 0.171) % 1;
            const u = (seed * 619 + i * 0.293) % 1;
            pts.push([0.14 + 0.72 * t, 0.18 + 0.64 * u]);
          }
          const parts2 = [];
          for (const [px, py] of pts) {
            parts2.push('<circle class="blueprint-terrain-pattern blueprint-terrain-pattern--speckle" cx="' + (x0 + ww * px).toFixed(2) + '" cy="' + (y0 + hh * py).toFixed(2) + '" r="1.15" fill="' + escapeHtmlRuntime(fill2) + '" />');
          }
          return parts2.join("");
        }
        if (pat === "snow-drift") {
          return (
            '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--snow-drift" d="M ' + (x0 + ww * 0.18).toFixed(2) + " " + (y0 + hh * 0.62).toFixed(2) +
            " C " + (x0 + ww * 0.34).toFixed(2) + " " + (y0 + hh * 0.40).toFixed(2) + ", " + (x0 + ww * 0.56).toFixed(2) + " " + (y0 + hh * 0.78).toFixed(2) + ", " + (x0 + ww * 0.80).toFixed(2) + " " + (y0 + hh * 0.54).toFixed(2) +
            '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.6" fill="none" />'
          );
        }
        if (pat === "ridge-lines" || pat === "ridge-zigzag") {
          const parts2 = [];
          for (let i = 0; i < 7; i++) {
            const yy = y0 + hh * (0.14 + i * 0.12);
            if (pat === "ridge-zigzag") {
              const xA = x0 + ww * 0.10;
              const xB = x0 + ww * 0.50;
              const xC = x0 + ww * 0.90;
              parts2.push('<path class="blueprint-terrain-pattern blueprint-terrain-pattern--ridge-zigzag" d="M ' + xA.toFixed(2) + " " + yy.toFixed(2) + " L " + xB.toFixed(2) + " " + (yy + hh * 0.06).toFixed(2) + " L " + xC.toFixed(2) + " " + yy.toFixed(2) + '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.2" fill="none" />');
            } else {
              parts2.push('<line class="blueprint-terrain-pattern blueprint-terrain-pattern--ridge-lines" x1="' + (x0 + ww * 0.08).toFixed(2) + '" y1="' + yy.toFixed(2) + '" x2="' + (x0 + ww * 0.92).toFixed(2) + '" y2="' + yy.toFixed(2) + '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.1" />');
            }
          }
          return parts2.join("");
        }
        if (pat === "ice-glint") {
          return '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--ice-glint" d="M ' + (x0 + ww * 0.10).toFixed(2) + " " + (y0 + hh * 0.80).toFixed(2) + " L " + (x0 + ww * 0.92).toFixed(2) + " " + (y0 + hh * 0.18).toFixed(2) + '" stroke="rgba(255,255,255,0.55)" stroke-width="2.2" fill="none" />';
        }
        if (pat === "ice-flow") {
          const xA = x0 + ww * 0.08, xB = x0 + ww * 0.92;
          const yA = y0 + hh * 0.30, yB = y0 + hh * 0.62;
          return (
            '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--ice-flow" d="M ' + xA.toFixed(2) + " " + yA.toFixed(2) +
              " C " + (x0 + ww * 0.40).toFixed(2) + " " + (yA - hh * 0.10).toFixed(2) + ", " + (x0 + ww * 0.66).toFixed(2) + " " + (yA + hh * 0.16).toFixed(2) + ", " + xB.toFixed(2) + " " + yA.toFixed(2) +
              '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.3" fill="none" />' +
            '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--ice-flow" d="M ' + xA.toFixed(2) + " " + yB.toFixed(2) +
              " C " + (x0 + ww * 0.34).toFixed(2) + " " + (yB - hh * 0.10).toFixed(2) + ", " + (x0 + ww * 0.62).toFixed(2) + " " + (yB + hh * 0.14).toFixed(2) + ", " + xB.toFixed(2) + " " + yB.toFixed(2) +
              '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.3" fill="none" />'
          );
        }
        if (pat === "crack-lines") {
          return (
            '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--crack-lines" d="M ' + (x0 + ww * 0.18).toFixed(2) + " " + (y0 + hh * 0.20).toFixed(2) +
              " L " + (x0 + ww * 0.42).toFixed(2) + " " + (y0 + hh * 0.54).toFixed(2) +
              " L " + (x0 + ww * 0.30).toFixed(2) + " " + (y0 + hh * 0.84).toFixed(2) +
              '" stroke="rgba(10,10,10,0.68)" stroke-width="1.8" fill="none" />' +
            '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--crack-lines" d="M ' + (x0 + ww * 0.52).toFixed(2) + " " + (y0 + hh * 0.14).toFixed(2) +
              " L " + (x0 + ww * 0.66).toFixed(2) + " " + (y0 + hh * 0.44).toFixed(2) +
              " L " + (x0 + ww * 0.56).toFixed(2) + " " + (y0 + hh * 0.88).toFixed(2) +
              '" stroke="rgba(10,10,10,0.68)" stroke-width="1.8" fill="none" />'
          );
        }
        if (pat === "polygon-crack") {
          return '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--polygon-crack" d="M ' + (x0 + ww * 0.16).toFixed(2) + " " + (y0 + hh * 0.34).toFixed(2) +
            " L " + (x0 + ww * 0.40).toFixed(2) + " " + (y0 + hh * 0.18).toFixed(2) +
            " L " + (x0 + ww * 0.72).toFixed(2) + " " + (y0 + hh * 0.34).toFixed(2) +
            " L " + (x0 + ww * 0.82).toFixed(2) + " " + (y0 + hh * 0.62).toFixed(2) +
            " L " + (x0 + ww * 0.54).toFixed(2) + " " + (y0 + hh * 0.82).toFixed(2) +
            " L " + (x0 + ww * 0.24).toFixed(2) + " " + (y0 + hh * 0.64).toFixed(2) +
            ' Z" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.3" fill="none" />';
        }
        if (pat === "shelf-band") {
          const parts2 = [];
          for (let i = 0; i < 5; i++) {
            const yy = y0 + hh * (0.16 + i * 0.14);
            parts2.push('<line class="blueprint-terrain-pattern blueprint-terrain-pattern--shelf-band" x1="' + (x0 + ww * 0.10).toFixed(2) + '" y1="' + yy.toFixed(2) + '" x2="' + (x0 + ww * 0.90).toFixed(2) + '" y2="' + yy.toFixed(2) + '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.5" />');
          }
          return parts2.join("");
        }
        if (pat === "edge-jag") {
          return '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--edge-jag" d="M ' + (x0 + ww * 0.10).toFixed(2) + " " + (y0 + hh * 0.72).toFixed(2) +
            " L " + (x0 + ww * 0.24).toFixed(2) + " " + (y0 + hh * 0.54).toFixed(2) +
            " L " + (x0 + ww * 0.38).toFixed(2) + " " + (y0 + hh * 0.78).toFixed(2) +
            " L " + (x0 + ww * 0.52).toFixed(2) + " " + (y0 + hh * 0.56).toFixed(2) +
            " L " + (x0 + ww * 0.66).toFixed(2) + " " + (y0 + hh * 0.80).toFixed(2) +
            " L " + (x0 + ww * 0.90).toFixed(2) + " " + (y0 + hh * 0.60).toFixed(2) +
            '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.6" fill="none" />';
        }
        if (pat === "industrial-grid") {
          const parts2 = [];
          for (let i = 1; i <= 4; i++) {
            const t = i / 5;
            parts2.push('<line class="blueprint-terrain-pattern blueprint-terrain-pattern--industrial-grid" x1="' + (x0 + ww * t).toFixed(2) + '" y1="' + y0.toFixed(2) + '" x2="' + (x0 + ww * t).toFixed(2) + '" y2="' + (y0 + hh).toFixed(2) + '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.0" />');
            parts2.push('<line class="blueprint-terrain-pattern blueprint-terrain-pattern--industrial-grid" x1="' + x0.toFixed(2) + '" y1="' + (y0 + hh * t).toFixed(2) + '" x2="' + (x0 + ww).toFixed(2) + '" y2="' + (y0 + hh * t).toFixed(2) + '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.0" />');
          }
          return parts2.join("");
        }
        if (pat === "cliff-hatch") {
          const parts2 = [];
          for (let i = 0; i < 7; i++) {
            const xx = x0 + ww * (0.04 + i * 0.16);
            parts2.push('<line class="blueprint-terrain-pattern blueprint-terrain-pattern--cliff-hatch" x1="' + xx.toFixed(2) + '" y1="' + (y0 + hh * 0.10).toFixed(2) + '" x2="' + (xx + ww * 0.22).toFixed(2) + '" y2="' + (y0 + hh * 0.92).toFixed(2) + '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.2" />');
          }
          return parts2.join("");
        }
        if (pat === "central-crack") {
          return '<path class="blueprint-terrain-pattern blueprint-terrain-pattern--central-crack" d="M ' + cx.toFixed(2) + " " + (y0 + hh * 0.08).toFixed(2) +
            " L " + (cx - ww * 0.06).toFixed(2) + " " + (y0 + hh * 0.36).toFixed(2) +
            " L " + (cx + ww * 0.07).toFixed(2) + " " + (y0 + hh * 0.56).toFixed(2) +
            " L " + (cx - ww * 0.04).toFixed(2) + " " + (y0 + hh * 0.92).toFixed(2) +
            '" stroke="rgba(10,10,10,0.74)" stroke-width="2.0" fill="none" />';
        }
        if (pat === "rock-speckle") {
          const parts2 = [];
          const seed = (Math.abs(Math.trunc(op.x * 83492791) ^ Math.trunc(op.y * 2654435761)) >>> 0) / 4294967295;
          for (let i = 0; i < 7; i++) {
            const t = (seed * 991 + i * 0.241) % 1;
            const u = (seed * 613 + i * 0.317) % 1;
            const px = x0 + ww * (0.10 + 0.80 * t);
            const py = y0 + hh * (0.14 + 0.72 * u);
            const s0 = 2.2;
            parts2.push('<rect class="blueprint-terrain-pattern blueprint-terrain-pattern--rock-speckle" x="' + px.toFixed(2) + '" y="' + py.toFixed(2) + '" width="' + s0 + '" height="' + s0 + '" fill="rgba(40,26,18,0.46)" />');
          }
          return parts2.join("");
        }
        return '<line class="blueprint-terrain-pattern blueprint-terrain-pattern--low-texture" x1="' + (x0 + ww * 0.18).toFixed(2) + '" y1="' + (y0 + hh * 0.54).toFixed(2) + '" x2="' + (x0 + ww * 0.86).toFixed(2) + '" y2="' + (y0 + hh * 0.46).toFixed(2) + '" stroke="' + escapeHtmlRuntime(faint) + '" stroke-width="1.0" />';
      }

      const dangerFrame =
        (danger === "high" || danger === "hard")
          ? '<rect class="blueprint-terrain-danger-frame blueprint-terrain-danger-frame--' + escapeHtmlRuntime(danger) + '" x="' + x0.toFixed(2) + '" y="' + y0.toFixed(2) + '" width="' + ww.toFixed(2) + '" height="' + hh.toFixed(2) + '" rx="3" ry="3"></rect>'
          : "";

      parts.push(
        '<g class="blueprint-terrain-cell blueprint-terrain-cell--' + escapeHtmlRuntime(tid || "unknown") +
          " blueprint-terrain-family--" + escapeHtmlRuntime(fam) +
          " blueprint-terrain-danger--" + escapeHtmlRuntime(danger) + '">' +
          '<rect class="blueprint-terrain-fill" x="' + x0.toFixed(2) + '" y="' + y0.toFixed(2) + '" width="' + ww.toFixed(2) + '" height="' + hh.toFixed(2) + '" rx="3" ry="3" fill="' + escapeHtmlRuntime(fill) + '" stroke="' + escapeHtmlRuntime(stroke) + '" stroke-width="1.2"></rect>' +
          patEl() +
          dangerFrame +
          '<rect class="blueprint-cell-add-frame" x="' + x0.toFixed(2) + '" y="' + y0.toFixed(2) + '" width="' + ww.toFixed(2) + '" height="' + hh.toFixed(2) + '" rx="3" ry="3"></rect>' +
        "</g>"
      );
    } else {
      parts.push('<rect class="bp-cell-subtract" x="' + r.x.toFixed(2) + '" y="' + r.y.toFixed(2) + '" width="' + r.w.toFixed(2) + '" height="' + r.h.toFixed(2) + '"></rect>');
      // cheap hatch: two diagonals
      parts.push('<line class="bp-cell-subtract-hatch" x1="' + r.x.toFixed(2) + '" y1="' + (r.y + r.h).toFixed(2) + '" x2="' + (r.x + r.w).toFixed(2) + '" y2="' + r.y.toFixed(2) + '"></line>');
      parts.push('<line class="bp-cell-subtract-hatch" x1="' + (r.x - r.w*0.15).toFixed(2) + '" y1="' + (r.y + r.h).toFixed(2) + '" x2="' + (r.x + r.w).toFixed(2) + '" y2="' + (r.y - r.h*0.15).toFixed(2) + '"></line>');
    }
  }
  bp.layerCells.innerHTML = parts.join("");
}

function renderBlueprintSpecialCells(vm){
  if (!bp.layerSpecial) return;
  const parts = [];
  for (const op of vm.ops) {
    const v = op.value;
    if (!v || v.kind !== "special_map_cell") continue;
    const r = vectorCellBoxToScreenRect(op.x, op.y);
    parts.push('<rect class="bp-special" x="' + r.x.toFixed(2) + '" y="' + r.y.toFixed(2) + '" width="' + r.w.toFixed(2) + '" height="' + r.h.toFixed(2) + '"></rect>');
  }
  bp.layerSpecial.innerHTML = parts.join("");
}

function renderBlueprintLabels(vm){
  if (!bp.layerLabels) return;
  const parts = [];
  for (const op of vm.ops) {
    const v = op.value;
    if (!v || v.kind !== "special_map_cell") continue;
    const r = vectorCellBoxToScreenRect(op.x, op.y);
    const text = String(v.label ?? "").trim();
    const mapId = String(v.mapId ?? "").trim();
    const line = (text ? text : "special") + (mapId ? (" · " + mapId) : "");
    const safe = escapeHtmlRuntime(line.length > 24 ? (line.slice(0, 22) + "…") : line);
    parts.push('<text class="bp-special-label" x="' + (r.cx + 8).toFixed(2) + '" y="' + (r.cy - 6).toFixed(2) + '">' + safe + "</text>");
  }
  bp.layerLabels.innerHTML = parts.join("");
}

function opIsDiff(vm, op){
  const v = op.value;
  const k = op.key;
  const baseCell = vm.baseCellByKey?.get(k) ?? null;
  const baseNode = vm.baseMapNodeByCellKey?.get(k) ?? null;
  if (!v) return false;
  if (v.kind === "terrain_add") {
    const baseTid = baseCell?.terrainId ? String(baseCell.terrainId) : "";
    return !baseCell || baseTid !== String(v.terrainId);
  }
  if (v.kind === "cell_subtract") {
    return Boolean(baseCell) || Boolean(baseNode);
  }
  if (v.kind === "special_map_cell") {
    const want = String(v.mapId ?? "").trim();
    const got = baseNode && (baseNode.gotoMapId ?? baseNode.mapId) ? String(baseNode.gotoMapId ?? baseNode.mapId).trim() : "";
    return !baseNode || got !== want;
  }
  return false;
}

function renderBlueprintDiff(vm){
  if (!bp.layerDiff) return;
  if (blueprintState.blendMode !== "onion_diff") { bp.layerDiff.innerHTML = ""; return; }
  const parts = [];
  for (const op of vm.ops) {
    if (!opIsDiff(vm, op)) continue;
    const r = vectorCellBoxToScreenRect(op.x, op.y);
    const x = r.x, y = r.y, w = r.w, h = r.h;
    const pad = 2.2;
    const x0 = x + pad, y0 = y + pad, ww = Math.max(0, w - pad*2), hh = Math.max(0, h - pad*2);
    // ring + corners only (keep terrain texture readable)
    parts.push('<rect class="blueprint-diff-cell" x="' + x0.toFixed(2) + '" y="' + y0.toFixed(2) + '" width="' + ww.toFixed(2) + '" height="' + hh.toFixed(2) + '" rx="3" ry="3"></rect>');
    const c = 6.5;
    parts.push('<path class="blueprint-diff-corner" d="M ' + x0.toFixed(2) + " " + (y0 + c).toFixed(2) + " L " + x0.toFixed(2) + " " + y0.toFixed(2) + " L " + (x0 + c).toFixed(2) + " " + y0.toFixed(2) + '" />');
    parts.push('<path class="blueprint-diff-corner" d="M ' + (x0 + ww - c).toFixed(2) + " " + y0.toFixed(2) + " L " + (x0 + ww).toFixed(2) + " " + y0.toFixed(2) + " L " + (x0 + ww).toFixed(2) + " " + (y0 + c).toFixed(2) + '" />');
  }
  bp.layerDiff.innerHTML = parts.join("");
}

function renderBlueprintBrushPreview(cell){
  if (!bp.layerBrush) return;
  if (!cell) { bp.layerBrush.innerHTML = ""; return; }
  const r = vectorCellBoxToScreenRect(cell.x, cell.y);
  bp.layerBrush.innerHTML = '<rect class="bp-brush" x="' + r.x.toFixed(2) + '" y="' + r.y.toFixed(2) + '" width="' + r.w.toFixed(2) + '" height="' + r.h.toFixed(2) + '"></rect>';
}

function renderBlueprintOverlay(){
  if (!blueprintState.layerCreated) { clearBlueprintLayers(); return; }
  if (getActivePreviewMode() !== "vector") { clearBlueprintLayers(); return; }
  const vm = composeBlueprintViewModel();
  renderBlueprintCells(vm);
  renderBlueprintDiff(vm);
  renderBlueprintSpecialCells(vm);
  renderBlueprintLabels(vm);
  // brush rendered from pointer handlers
  updateBlueprintBoundsUi();
}

function requestBlueprintOverlayRender(reason){
  void reason;
  if (!blueprintState || !blueprintState.layerCreated) return;
  if (getActivePreviewMode() !== "vector") return;
  if (typeof renderBlueprintOverlay === "function") {
    renderBlueprintOverlay();
  }
}

function validateBlueprintBeforeExport(){
  const errors = [];
  const warnings = [];
  if (getActivePreviewMode() !== "vector") errors.push("当前不是矢量模式。");
  if (!blueprintState.layerCreated) errors.push("蓝图层尚未创建。");

  const b = gridVm?.bounds;
  let outsideCount = 0;
  for (const [k, v] of blueprintState.cells.entries()) {
    if (!v) continue;
    const [xs, ys] = String(k).split(",");
    const x = Number(xs), y = Number(ys);
    if (!isFiniteGridCoord(x, y)) { errors.push("存在非法坐标 key: " + k); continue; }
    if (b && (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY)) outsideCount++;
    if (v.kind === "terrain_add") {
      if (!isTerrainOptionAllowed(v.terrainId)) errors.push("terrain_add 使用了未允许的 terrainId: " + String(v.terrainId));
    } else if (v.kind === "special_map_cell") {
      if (!String(v.mapId || "").trim()) errors.push("special_map_cell mapId 为空: " + k);
      if (!String(v.label || "").trim()) errors.push("special_map_cell label 为空: " + k);
    } else if (v.kind === "cell_subtract") {
      const baseCell = cellByKey.get(k) ?? null;
      const baseNode = baseMapNodeByCellKey.get(k) ?? null;
      if (!baseCell && !baseNode) warnings.push("subtractCell 作用于空格（仅 warning）: " + k);
    } else {
      errors.push("未知蓝图 cell kind: " + String(v.kind));
    }
    // ensure no DOM/SVG coords exist
    const badFields = ["sx","sy","screenX","screenY","clientX","clientY","px","py","domX","domY","svgX","svgY","rect","bbox"];
    for (const f of badFields) {
      if (v && Object.prototype.hasOwnProperty.call(v, f)) errors.push("导出对象含疑似 DOM/SVG 坐标字段: " + k + "." + f);
    }
  }
  if (outsideCount > 0) warnings.push("包含 bounds 外坐标: " + outsideCount + " 格（仅蓝图扩展草案）");
  return { ok: errors.length === 0, errors, warnings };
}

// --- Import (textarea -> blueprint layer) ---
function parseBlueprintImportJson(rawText){
  const text = String(rawText ?? "");
  if (!text.trim()) return { ok: false, error: "导入失败：内容为空。" };
  // 5MB hard cap (safety)
  if (text.length > 5 * 1024 * 1024) return { ok: false, error: "导入失败：JSON 文本过大（>5MB）。" };
  let obj = null;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: "导入失败：JSON 解析失败。" };
  }
  if (!obj || typeof obj !== "object") return { ok: false, error: "导入失败：JSON 顶层不是对象。" };
  const kind = String(obj.kind ?? "").trim();
  if (kind !== "wilderness_blueprint_delta" && kind !== "wilderness_area_merge_preview" && kind !== "wilderness_blueprint_compact") {
    return { ok: false, error: "导入失败：不支持的 kind: " + (kind || "（缺失）") };
  }
  return { ok: true, kind, obj };
}

function validateImportedBlueprintCell(cell, sourcePath){
  const c = cell && typeof cell === "object" ? cell : null;
  if (!c) return { ok: false, reason: "cell 不是对象", sourcePath };
  const kind = String(c.kind ?? "").trim();
  if (kind !== "terrain_add" && kind !== "cell_subtract" && kind !== "special_map_cell") {
    return { ok: false, reason: "未知 kind: " + kind, sourcePath };
  }
  if (kind === "terrain_add") {
    const tid = String(c.terrainId ?? "").trim();
    if (!tid) return { ok: false, reason: "terrainId 为空", sourcePath };
    if (!isTerrainOptionAllowed(tid)) return { ok: false, reason: "未允许的 terrainId: " + tid, sourcePath };
  }
  if (kind === "special_map_cell") {
    const mapId = String(c.mapId ?? "").trim();
    const label = String(c.label ?? "").trim();
    if (!mapId) return { ok: false, reason: "mapId 为空", sourcePath };
    if (!label) return { ok: false, reason: "label 为空", sourcePath };
  }
  // Ban any suspicious persisted display coords.
  const badFields = ["sx","sy","screenX","screenY","clientX","clientY","svgX","svgY","viewBox","px","py","domX","domY","rect","bbox","transform"];
  for (const f of badFields) {
    if (Object.prototype.hasOwnProperty.call(c, f)) return { ok: false, reason: "含疑似显示坐标字段: " + f, sourcePath };
  }
  return { ok: true };
}

function normalizeImportedBlueprintCells(parsed){
  const warnings = [];
  const out = [];
  const kind = parsed?.kind;
  const obj = parsed?.obj;
  if (!kind || !obj) return { ok: false, error: "导入失败：解析结果为空。", warnings: [] };

  function pushCell(x, y, cell, sourcePath){
    if (!isFiniteGridCoord(x, y)) { warnings.push("跳过非法坐标: " + sourcePath); return; }
    const v = validateImportedBlueprintCell(cell, sourcePath);
    if (!v.ok) { warnings.push("跳过非法 cell: " + sourcePath + "（" + v.reason + "）"); return; }
    const key = getCanvasCellKey(x, y);
    out.push({ key, x, y, cell });
  }

  if (kind === "wilderness_blueprint_delta") {
    const ops = Array.isArray(obj.ops) ? obj.ops : [];
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (!op || typeof op !== "object") { warnings.push("跳过非对象 op: ops[" + i + "]"); continue; }
      const x = Number(op.x);
      const y = Number(op.y);
      const opKind = String(op.op ?? "").trim();
      const path = "ops[" + i + "]";
      if (opKind === "setTerrain") {
        const terrainId = String(op.terrainId ?? "").trim();
        pushCell(x, y, { kind: "terrain_add", terrainId }, path);
      } else if (opKind === "subtractCell") {
        pushCell(x, y, { kind: "cell_subtract" }, path);
      } else if (opKind === "setSpecialMapCell") {
        const mapId = String(op.mapId ?? "").trim();
        const label = String(op.label ?? "").trim();
        pushCell(x, y, { kind: "special_map_cell", mapId, label }, path);
      } else {
        warnings.push("跳过未知 op: " + path + ".op=" + (opKind || "（缺失）"));
      }
    }
    return { ok: true, cells: out, warnings };
  }

  if (kind === "wilderness_area_merge_preview") {
    const terrainOverrides = Array.isArray(obj.terrainOverrides) ? obj.terrainOverrides : [];
    const subtractMask = Array.isArray(obj.subtractMask) ? obj.subtractMask : [];
    const specialMapCells = Array.isArray(obj.specialMapCells) ? obj.specialMapCells : [];

    for (let i = 0; i < terrainOverrides.length; i++) {
      const it = terrainOverrides[i];
      if (!it || typeof it !== "object") { warnings.push("跳过非对象 terrainOverrides[" + i + "]"); continue; }
      pushCell(Number(it.x), Number(it.y), { kind: "terrain_add", terrainId: String(it.terrainId ?? "").trim() }, "terrainOverrides[" + i + "]");
    }
    for (let i = 0; i < subtractMask.length; i++) {
      const it = subtractMask[i];
      if (!it || typeof it !== "object") { warnings.push("跳过非对象 subtractMask[" + i + "]"); continue; }
      pushCell(Number(it.x), Number(it.y), { kind: "cell_subtract" }, "subtractMask[" + i + "]");
    }
    for (let i = 0; i < specialMapCells.length; i++) {
      const it = specialMapCells[i];
      if (!it || typeof it !== "object") { warnings.push("跳过非对象 specialMapCells[" + i + "]"); continue; }
      pushCell(
        Number(it.x),
        Number(it.y),
        { kind: "special_map_cell", mapId: String(it.mapId ?? "").trim(), label: String(it.label ?? "").trim() },
        "specialMapCells[" + i + "]"
      );
    }
    return { ok: true, cells: out, warnings };
  }

  if (kind === "wilderness_blueprint_compact") {
    const norm = normalizeCompactBlueprintImport(parsed);
    if (!norm.ok) return { ok: false, error: norm.error || "导入失败：紧凑格式解析失败。", warnings: norm.warnings || [] };
    return { ok: true, cells: norm.cells, warnings: norm.warnings || [] };
  }

  return { ok: false, error: "导入失败：未覆盖的 kind 分支。", warnings };
}

function replaceBlueprintLayerWithImportedCells(cells){
  if (!Array.isArray(cells)) { bpSetStatus("导入失败：cells 不是数组。"); return false; }
  if (cells.length > 20000) { bpSetStatus("导入失败：格子数量超过 20000"); return false; }
  if (blueprintExitIfNotVector()) { bpSetStatus("导入失败：蓝图导入仅支持矢量模式。"); return false; }

  ensureBlueprintLayerCreated();
  toggleBlueprintMode(true, "蓝图模式：已开启（导入）。");

  const had = blueprintState.cells.size;
  blueprintState.cells.clear();

  // De-dup by key: later wins.
  const byKey = new Map();
  for (const it of cells) {
    const k = String(it?.key ?? "");
    const x = Number(it?.x);
    const y = Number(it?.y);
    const cell = it?.cell ?? null;
    if (!k) continue;
    if (!isFiniteGridCoord(x, y)) continue;
    if (!cell || typeof cell !== "object") continue;
    byKey.set(k, cell);
  }

  if (byKey.size > 20000) { bpSetStatus("导入失败：格子数量超过 20000"); return false; }
  for (const [k, v] of byKey.entries()) blueprintState.cells.set(k, v);

  // Import is a bulk replace: clear undo stack to avoid inconsistent pre/post snapshots.
  canvasEditUndoStack.length = 0;
  currentUndoStep = null;
  resetBlueprintPointerState();

  blueprintState.dirty = true;
  renderBlueprintOverlay();
  updateBlueprintBoundsUi();

  bpSetStatus("导入完成：已写入蓝图层 " + blueprintState.cells.size + " 格" + (had ? "（已替换当前蓝图层）" : ""));
  return true;
}

function importBlueprintFromTextarea(){
  if (!bp.exportEl) { bpSetStatus("导入失败：textarea 不存在。"); return false; }
  const raw = String(bp.exportEl.value ?? "");
  const parsed = parseBlueprintImportJson(raw);
  if (!parsed.ok) { bpSetStatus(parsed.error); return false; }
  const norm = normalizeImportedBlueprintCells(parsed);
  if (!norm.ok) { bpSetStatus(norm.error); return false; }
  if (norm.cells.length > 20000) { bpSetStatus("导入失败：格子数量超过 20000"); return false; }
  const ok = replaceBlueprintLayerWithImportedCells(norm.cells);
  if (!ok) return false;
  const kind = String(parsed.kind || "");
  const importedLabel =
    kind === "wilderness_blueprint_delta"
      ? "已导入旧版增量格式："
      : kind === "wilderness_area_merge_preview"
        ? "已导入合并预览格式："
        : kind === "wilderness_blueprint_compact"
          ? "已导入紧凑蓝图格式："
          : "导入完成：已写入蓝图层 ";

  if (norm.warnings && norm.warnings.length) {
    bpSetStatus(
      importedLabel +
        blueprintState.cells.size +
        " 格（含 warning）: " +
        norm.warnings.slice(0, 2).join("；") +
        (norm.warnings.length > 2 ? "…" : "")
    );
  } else {
    bpSetStatus(importedLabel + blueprintState.cells.size + " 格");
  }
  return true;
}

// --- Blueprint patch script (textarea DSL; blueprint layer only) ---
function textareaLooksLikeBlueprintJson(text){
  const t = String(text || "").trim();
  if (!t.startsWith("{")) return false;
  try {
    const o = JSON.parse(t);
    const k = String(o?.kind || "");
    return k === "wilderness_blueprint_delta" || k === "wilderness_area_merge_preview" || k === "wilderness_blueprint_compact";
  } catch {
    return false;
  }
}

function isBlueprintPatchScript(rawText){
  if (textareaLooksLikeBlueprintJson(rawText)) return false;
  return String(rawText || "").trim().length > 0;
}

function stripBlueprintPatchLineComments(line){
  let out = "";
  let i = 0;
  const s = String(line || "");
  let inStr = false;
  while (i < s.length) {
    const c = s[i];
    if (!inStr && c === '"') {
      inStr = true;
      out += c;
      i++;
      continue;
    }
    if (inStr) {
      // NOTE: this entire runtime is emitted inside a JS template literal; use "\\\\" here so the
      // generated file contains a valid "\\" string escape (single backslash character).
      if (c === "\\\\") {
        out += c + (s[i + 1] || "");
        i += 2;
        continue;
      }
      if (c === '"') inStr = false;
      out += c;
      i++;
      continue;
    }
    if (c === "#" || (c === "/" && s[i + 1] === "/")) break;
    out += c;
    i++;
  }
  return out.trim();
}

function quoteAwareSplit(input){
  const out = [];
  let i = 0;
  const s = String(input || "");
  while (i < s.length) {
    while (i < s.length && /\\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === '"') {
      i++;
      let buf = "";
      while (i < s.length) {
        if (s[i] === "\\\\") {
          i++;
          buf += s[i] || "";
          i++;
          continue;
        }
        if (s[i] === '"') {
          i++;
          break;
        }
        buf += s[i];
        i++;
      }
      out.push(buf);
      continue;
    }
    const start = i;
    while (i < s.length && !/\\s/.test(s[i])) i++;
    out.push(s.slice(start, i));
  }
  return out;
}

function validateBlueprintPatchCoord(x, y, lineNo){
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("第 " + lineNo + " 行：坐标必须为有限数。");
  }
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    throw new Error("第 " + lineNo + " 行：坐标必须为 safe integer。");
  }
}

function parseBlueprintSelectors(selectorTokens, lineNo){
  const list = Array.isArray(selectorTokens) ? selectorTokens : [];
  if (!list.length) throw new Error("第 " + lineNo + " 行：缺少 selector。");
  return list.map((t) => String(t || "").trim()).filter(Boolean);
}

function expandBlueprintSelector(sel, lineNo){
  const s = String(sel || "").trim();
  // Regex bodies live inside renderBlueprintRuntimeScript's outer template literal: double \\ so emitted JS keeps \\s, \\d, \\( …
  const COORD_PAIR = /^\\(\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*\\)$/;
  let m = s.match(COORD_PAIR);
  if (m) {
    const x = Number(m[1]), y = Number(m[2]);
    validateBlueprintPatchCoord(x, y, lineNo);
    return [{ x, y }];
  }
  const RECT = /^rect\\(\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*\\)$/i;
  m = s.match(RECT);
  if (m) {
    const x1 = Number(m[1]), y1 = Number(m[2]), x2 = Number(m[3]), y2 = Number(m[4]);
    validateBlueprintPatchCoord(x1, y1, lineNo);
    validateBlueprintPatchCoord(x2, y2, lineNo);
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    const nx = maxX - minX + 1;
    const ny = maxY - minY + 1;
    const n = nx * ny;
    if (n > 5000) throw new Error("第 " + lineNo + " 行：单条 selector 展开超过 5000 格。");
    const out = [];
    for (let yy = minY; yy <= maxY; yy++) for (let xx = minX; xx <= maxX; xx++) out.push({ x: xx, y: yy });
    return out;
  }
  const HRUN = /^h\\(\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(\\d+)\\s*\\)$/i;
  m = s.match(HRUN);
  if (m) {
    const x0 = Number(m[1]), y = Number(m[2]), len = Number(m[3]);
    validateBlueprintPatchCoord(x0, y, lineNo);
    if (!Number.isFinite(len) || !Number.isSafeInteger(len) || len <= 0 || len > 20000) {
      throw new Error("第 " + lineNo + " 行：h(...) 的 len 必须为正整数且不超过 20000。");
    }
    if (len > 5000) throw new Error("第 " + lineNo + " 行：单条 selector 展开超过 5000 格。");
    const out = [];
    for (let i = 0; i < len; i++) {
      const x = x0 + i;
      validateBlueprintPatchCoord(x, y, lineNo);
      out.push({ x, y });
    }
    return out;
  }
  const VRUN = /^v\\(\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(\\d+)\\s*\\)$/i;
  m = s.match(VRUN);
  if (m) {
    const x = Number(m[1]), y0 = Number(m[2]), len = Number(m[3]);
    validateBlueprintPatchCoord(x, y0, lineNo);
    if (!Number.isFinite(len) || !Number.isSafeInteger(len) || len <= 0 || len > 20000) {
      throw new Error("第 " + lineNo + " 行：v(...) 的 len 必须为正整数且不超过 20000。");
    }
    if (len > 5000) throw new Error("第 " + lineNo + " 行：单条 selector 展开超过 5000 格。");
    const out = [];
    for (let i = 0; i < len; i++) {
      const y = y0 + i;
      validateBlueprintPatchCoord(x, y, lineNo);
      out.push({ x, y });
    }
    return out;
  }
  const DRUN = /^d\\(\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(\\d+)\\s*\\)$/i;
  m = s.match(DRUN);
  if (m) {
    const x0 = Number(m[1]), y0 = Number(m[2]), dx = Number(m[3]), dy = Number(m[4]), len = Number(m[5]);
    validateBlueprintPatchCoord(x0, y0, lineNo);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isSafeInteger(dx) || !Number.isSafeInteger(dy)) {
      throw new Error("第 " + lineNo + " 行：d(...) 的 dx/dy 必须为整数。");
    }
    if (!Number.isFinite(len) || !Number.isSafeInteger(len) || len <= 0 || len > 20000) {
      throw new Error("第 " + lineNo + " 行：d(...) 的 len 必须为正整数且不超过 20000。");
    }
    if (len > 5000) throw new Error("第 " + lineNo + " 行：单条 selector 展开超过 5000 格。");
    const out = [];
    for (let i = 0; i < len; i++) {
      const x = x0 + dx * i;
      const y = y0 + dy * i;
      validateBlueprintPatchCoord(x, y, lineNo);
      out.push({ x, y });
    }
    return out;
  }
  const LINE = /^line\\(\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*\\)$/i;
  m = s.match(LINE);
  if (m) {
    const x1 = Number(m[1]), y1 = Number(m[2]), x2 = Number(m[3]), y2 = Number(m[4]);
    validateBlueprintPatchCoord(x1, y1, lineNo);
    validateBlueprintPatchCoord(x2, y2, lineNo);
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return [{ x: x1, y: y1 }];
    let pts = [];
    if (dx === 0) {
      const sy = dy > 0 ? 1 : -1;
      for (let y = y1; sy > 0 ? y <= y2 : y >= y2; y += sy) pts.push({ x: x1, y });
    } else if (dy === 0) {
      const sx = dx > 0 ? 1 : -1;
      for (let x = x1; sx > 0 ? x <= x2 : x >= x2; x += sx) pts.push({ x, y: y1 });
    } else if (Math.abs(dx) === Math.abs(dy)) {
      const sx = dx > 0 ? 1 : -1;
      const sy = dy > 0 ? 1 : -1;
      const n = Math.abs(dx);
      for (let i = 0; i <= n; i++) pts.push({ x: x1 + sx * i, y: y1 + sy * i });
    } else {
      throw new Error("第 " + lineNo + " 行：line only supports horizontal, vertical, or 45-degree diagonal.");
    }
    if (pts.length > 5000) throw new Error("第 " + lineNo + " 行：单条 selector 展开超过 5000 格。");
    return pts;
  }
  throw new Error("第 " + lineNo + " 行：无法解析 selector「" + s + "」。");
}

function parseBlueprintPatchLine(line, lineNo){
  let t = stripBlueprintPatchLineComments(line);
  if (!t) return { skip: true };
  if (t.startsWith("#")) return { skip: true };
  if (t.startsWith("//")) return { skip: true };
  const tokens = quoteAwareSplit(t);
  if (!tokens.length) return { skip: true };
  const verb = String(tokens[0] || "").toLowerCase();
  if (verb === "set") {
    if (tokens.length < 3) throw new Error("第 " + lineNo + " 行：set 需要 terrainId 与至少一个 selector。");
    const terrainId = String(tokens[1] || "").trim();
    if (!terrainId || !isTerrainOptionAllowed(terrainId)) throw new Error("第 " + lineNo + " 行：无效的 terrainId。");
    const selectors = parseBlueprintSelectors(tokens.slice(2), lineNo);
    return { type: "set", terrainId, selectors, lineNo };
  }
  if (verb === "clear") {
    if (tokens.length < 2) throw new Error("第 " + lineNo + " 行：clear 需要至少一个 selector。");
    const selectors = parseBlueprintSelectors(tokens.slice(1), lineNo);
    return { type: "clear", selectors, lineNo };
  }
  if (verb === "subtract") {
    if (tokens.length < 2) throw new Error("第 " + lineNo + " 行：subtract 需要至少一个 selector。");
    const selectors = parseBlueprintSelectors(tokens.slice(1), lineNo);
    return { type: "subtract", selectors, lineNo };
  }
  if (verb === "special") {
    if (tokens.length < 4) throw new Error("第 " + lineNo + " 行：special 需要至少一个 selector 以及 mapId、label。");
    const mapId = String(tokens[tokens.length - 2] || "").trim();
    const label = String(tokens[tokens.length - 1] || "").trim();
    const selectors = parseBlueprintSelectors(tokens.slice(1, tokens.length - 2), lineNo);
    if (!mapId || !label) throw new Error("第 " + lineNo + " 行：special 的 mapId/label 不能为空。");
    return { type: "special", selectors, mapId, label, lineNo };
  }
  throw new Error("第 " + lineNo + " 行：未知命令「" + tokens[0] + "」。");
}

function parseBlueprintPatchScript(rawText){
  const raw = String(rawText || "");
  const lines = raw.split(/\\r\\n|\\n|\\r/);
  const commands = [];
  let skipped = 0;
  for (let idx = 0; idx < lines.length; idx++) {
    const lineNo = idx + 1;
    const parsed = parseBlueprintPatchLine(lines[idx], lineNo);
    if (parsed && parsed.skip) {
      skipped++;
      continue;
    }
    if (parsed && parsed.type) commands.push(parsed);
  }
  return { ok: true, commands, skipped };
}

function applyBlueprintPatchCommands(commands){
  let totalExpanded = 0;
  let written = 0;
  let clearedKeys = 0;

  function bumpExpanded(n, lineNo){
    totalExpanded += n;
    if (totalExpanded > 20000) throw new Error("第 " + lineNo + " 行：脚本展开格子超过 20000。");
  }

  // Whole script is one undo step (Ctrl+Z reverts all mutations from this execution together).
  beginCanvasUndoStep("paint", "blueprint_patch");

  for (let ci = 0; ci < commands.length; ci++) {
    const cmd = commands[ci];
    const ln = cmd.lineNo;
    if (cmd.type === "set") {
      const tid = cmd.terrainId;
      for (let si = 0; si < cmd.selectors.length; si++) {
        const pts = expandBlueprintSelector(cmd.selectors[si], ln);
        bumpExpanded(pts.length, ln);
        for (let pi = 0; pi < pts.length; pi++) {
          const key = getCanvasCellKey(pts[pi].x, pts[pi].y);
          const before = blueprintState.cells.get(key) ?? null;
          blueprintState.cells.set(key, { kind: "terrain_add", terrainId: tid });
          const after = blueprintState.cells.get(key) ?? null;
          recordCanvasCellMutation(key, before, after);
          written++;
        }
      }
    } else if (cmd.type === "clear") {
      for (let si = 0; si < cmd.selectors.length; si++) {
        const pts = expandBlueprintSelector(cmd.selectors[si], ln);
        bumpExpanded(pts.length, ln);
        for (let pi = 0; pi < pts.length; pi++) {
          const key = getCanvasCellKey(pts[pi].x, pts[pi].y);
          const before = blueprintState.cells.get(key) ?? null;
          blueprintState.cells.delete(key);
          recordCanvasCellMutation(key, before, null);
          if (before) clearedKeys++;
        }
      }
    } else if (cmd.type === "subtract") {
      for (let si = 0; si < cmd.selectors.length; si++) {
        const pts = expandBlueprintSelector(cmd.selectors[si], ln);
        bumpExpanded(pts.length, ln);
        for (let pi = 0; pi < pts.length; pi++) {
          const key = getCanvasCellKey(pts[pi].x, pts[pi].y);
          const before = blueprintState.cells.get(key) ?? null;
          blueprintState.cells.set(key, { kind: "cell_subtract" });
          const after = blueprintState.cells.get(key) ?? null;
          recordCanvasCellMutation(key, before, after);
          written++;
        }
      }
    } else if (cmd.type === "special") {
      const mid = cmd.mapId;
      const lab = cmd.label;
      for (let si = 0; si < cmd.selectors.length; si++) {
        const pts = expandBlueprintSelector(cmd.selectors[si], ln);
        bumpExpanded(pts.length, ln);
        for (let pi = 0; pi < pts.length; pi++) {
          const key = getCanvasCellKey(pts[pi].x, pts[pi].y);
          const before = blueprintState.cells.get(key) ?? null;
          blueprintState.cells.set(key, { kind: "special_map_cell", mapId: mid, label: lab });
          const after = blueprintState.cells.get(key) ?? null;
          recordCanvasCellMutation(key, before, after);
          written++;
        }
      }
    }
  }

  blueprintState.dirty = true;
  commitCanvasUndoStep();
  renderBlueprintOverlay();
  updateBlueprintBoundsUi();
  return { written, cleared: clearedKeys, skipped: 0 };
}

function executeBlueprintPatchFromTextarea(){
  if (!bp.exportEl) {
    bpSetStatus("第 1 行：textarea 不存在。");
    return;
  }
  const raw = String(bp.exportEl.value ?? "");
  if (textareaLooksLikeBlueprintJson(raw)) {
    bpSetStatus("第 1 行：内容为 JSON 蓝图，请使用「导入为蓝图层」。");
    return;
  }
  if (!raw.trim()) {
    bpSetStatus("第 1 行：内容为空。");
    return;
  }
  if (raw.length > 1024 * 1024) {
    bpSetStatus("第 1 行：脚本超过 1MB，已拒绝执行。");
    return;
  }
  const lines = raw.split(/\\r\\n|\\n|\\r/);
  if (lines.length > 1000) {
    bpSetStatus("第 1 行：脚本超过 1000 行，已拒绝执行。");
    return;
  }
  try {
    if (blueprintExitIfNotVector()) {
      bpSetStatus("第 1 行：蓝图代码仅支持矢量模式。");
      return;
    }
    ensureBlueprintLayerCreated();
    toggleBlueprintMode(true, "蓝图模式：已开启（蓝图代码）。");

    const parsed = parseBlueprintPatchScript(raw);
    if (!parsed.ok) {
      bpSetStatus(parsed.error || "蓝图代码解析失败。");
      return;
    }

    const stats = applyBlueprintPatchCommands(parsed.commands);
    bpSetStatus(
      "蓝图代码执行完成：写入 " +
        stats.written +
        " 格，清除 " +
        stats.cleared +
        " 格，跳过 " +
        parsed.skipped +
        " 条"
    );
  } catch (e) {
    bpSetStatus(String(e && e.message ? e.message : "蓝图代码执行失败。"));
  }
}

function getMetersPerCell(){
  const m = Number(gridVm?.metersPerCell);
  if (Number.isFinite(m) && m > 0) return m;
  const m2 = Number(gridVm?.step?.metersPerCell);
  if (Number.isFinite(m2) && m2 > 0) return m2;
  return 150;
}

function getSourceAreaId(){
  const a = String(gridVm?.areaId ?? "").trim();
  if (a) return a;
  const a2 = String(vectorVm?.sourceAreaId ?? "").trim();
  if (a2) return a2;
  return "unknown_area";
}

function groupBlueprintCellsByKind(cellsMap){
  const terrainPointsById = new Map(); // terrainId -> Array<{x,y}>
  const subtractCells = [];
  const specialMapCells = []; // Array<{x,y,mapId,label}>
  let total = 0;
  for (const [k, v] of (cellsMap?.entries?.() ?? [])) {
    if (!v) continue;
    const [xs, ys] = String(k).split(",");
    const x = Number(xs), y = Number(ys);
    if (!isFiniteGridCoord(x, y)) continue;
    total++;
    const kind = String(v.kind || "");
    if (kind === "terrain_add") {
      const tid = String(v.terrainId ?? "").trim();
      if (!tid) continue;
      if (!terrainPointsById.has(tid)) terrainPointsById.set(tid, []);
      terrainPointsById.get(tid).push({ x, y });
    } else if (kind === "cell_subtract") {
      subtractCells.push({ x, y });
    } else if (kind === "special_map_cell") {
      const mapId = String(v.mapId ?? "").trim();
      const label = String(v.label ?? "").trim();
      if (!mapId || !label) continue;
      specialMapCells.push({ x, y, mapId, label });
    }
  }
  return { total, terrainPointsById, subtractCells, specialMapCells };
}

function compressTerrainCellsToRuns(points){
  const pts = Array.isArray(points) ? points : [];
  // Represent as set of "x,y" for fast membership/removal
  const remaining = new Set();
  for (const p of pts) {
    const x = Number(p?.x), y = Number(p?.y);
    if (!isFiniteGridCoord(x, y)) continue;
    remaining.add(String(x) + "," + String(y));
  }

  function has(x, y){ return remaining.has(String(x) + "," + String(y)); }
  function del(x, y){ remaining.delete(String(x) + "," + String(y)); }

  const runs = [];

  // 1) Horizontal runs: y asc, x asc
  const byY = new Map();
  for (const key of remaining) {
    const [xs, ys] = key.split(",");
    const x = Number(xs), y = Number(ys);
    if (!byY.has(y)) byY.set(y, []);
    byY.get(y).push(x);
  }
  const ys = Array.from(byY.keys()).sort((a, b) => a - b);
  for (const y of ys) {
    const xs = byY.get(y).slice().sort((a, b) => a - b);
    let i = 0;
    while (i < xs.length) {
      const x0 = xs[i];
      if (!has(x0, y)) { i++; continue; }
      let x1 = x0;
      while (has(x1 + 1, y)) x1++;
      const len = x1 - x0 + 1;
      if (len >= 2) {
        runs.push(["h", x0, y, len]);
        for (let x = x0; x <= x1; x++) del(x, y);
      }
      i++;
    }
  }

  // 2) Vertical runs: x asc, y asc (on remaining points)
  const byX = new Map();
  for (const key of remaining) {
    const [xs, ys] = key.split(",");
    const x = Number(xs), y = Number(ys);
    if (!byX.has(x)) byX.set(x, []);
    byX.get(x).push(y);
  }
  const xs2 = Array.from(byX.keys()).sort((a, b) => a - b);
  for (const x of xs2) {
    const ys2 = byX.get(x).slice().sort((a, b) => a - b);
    let i = 0;
    while (i < ys2.length) {
      const y0 = ys2[i];
      if (!has(x, y0)) { i++; continue; }
      let y1 = y0;
      while (has(x, y1 + 1)) y1++;
      const len = y1 - y0 + 1;
      if (len >= 2) {
        runs.push(["v", x, y0, len]);
        for (let y = y0; y <= y1; y++) del(x, y);
      }
      i++;
    }
  }

  // Remaining singles: deterministic sort (y, then x)
  const cells = Array.from(remaining).map((k) => {
    const [xs, ys] = k.split(",");
    return [Number(xs), Number(ys)];
  });
  cells.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  return { runs, cells };
}

function expandBlueprintCompactRuns(runs){
  const out = [];
  const rs = Array.isArray(runs) ? runs : [];
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    if (!Array.isArray(r) || r.length < 4) continue;
    const t = String(r[0] ?? "");
    if (t === "h") {
      const x0 = Number(r[1]), y = Number(r[2]), len = Number(r[3]);
      if (!isFiniteGridCoord(x0, y) || !Number.isSafeInteger(len) || len <= 0 || len > 20000) continue;
      for (let dx = 0; dx < len; dx++) out.push({ x: x0 + dx, y });
    } else if (t === "v") {
      const x = Number(r[1]), y0 = Number(r[2]), len = Number(r[3]);
      if (!isFiniteGridCoord(x, y0) || !Number.isSafeInteger(len) || len <= 0 || len > 20000) continue;
      for (let dy = 0; dy < len; dy++) out.push({ x, y: y0 + dy });
    } else if (t === "d") {
      const x0 = Number(r[1]), y0 = Number(r[2]), dx = Number(r[3]), dy = Number(r[4]), len = Number(r[5]);
      if (!isFiniteGridCoord(x0, y0)) continue;
      if (!Number.isSafeInteger(dx) || !Number.isSafeInteger(dy)) continue;
      if (!Number.isSafeInteger(len) || len <= 0 || len > 20000) continue;
      for (let s = 0; s < len; s++) out.push({ x: x0 + dx * s, y: y0 + dy * s });
    }
  }
  return out;
}

function serializeBlueprintCompact(cellsMap){
  const metersPerCell = getMetersPerCell();
  const sourceAreaId = getSourceAreaId();
  const grouped = groupBlueprintCellsByKind(cellsMap);

  // terrainId sorted
  const terrainIds = Array.from(grouped.terrainPointsById.keys()).sort((a, b) => String(a).localeCompare(String(b)));
  const terrainRuns = {};
  const terrainCells = {};
  let terrainCount = 0;
  for (const tid of terrainIds) {
    const pts = grouped.terrainPointsById.get(tid) || [];
    const comp = compressTerrainCellsToRuns(pts);
    if (comp.runs.length) terrainRuns[tid] = comp.runs;
    if (comp.cells.length) terrainCells[tid] = comp.cells;
    terrainCount += pts.length;
  }

  const subtractCells = grouped.subtractCells
    .map((p) => [p.x, p.y])
    .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));

  const specialMapCells = grouped.specialMapCells
    .slice()
    .sort((a, b) => (a.y - b.y) || (a.x - b.x) || String(a.mapId).localeCompare(String(b.mapId)))
    .map((p) => [p.x, p.y, String(p.mapId), String(p.label)]);

  const obj = {
    schemaVersion: 2,
    kind: "wilderness_blueprint_compact",
    sourceAreaId,
    metersPerCell,
    terrainRuns,
    terrainCells,
    subtractCells,
    specialMapCells
  };
  const n = terrainCount + subtractCells.length + specialMapCells.length;
  return { obj, count: n };
}

function exportBlueprintCompact(){
  const v = validateBlueprintBeforeExport();
  if (!v.ok) { bpSetStatus("导出失败: " + v.errors[0]); return false; }
  const { obj, count } = serializeBlueprintCompact(blueprintState.cells);
  writeExport(obj, { warnings: v.warnings });
  bpSetStatus("紧凑蓝图导出完成：" + count + " 格" + (v.warnings.length ? "（含 warning）" : ""));
  return true;
}

function normalizeCompactBlueprintImport(parsed){
  const warnings = [];
  const obj = parsed?.obj;
  if (!obj || typeof obj !== "object") return { ok: false, error: "导入失败：紧凑蓝图顶层不是对象。", warnings };

  const cells = [];
  let count = 0;
  function pushTerrainCell(terrainId, x, y, path){
    const tid = String(terrainId ?? "").trim();
    if (!tid) { warnings.push("跳过 terrainId 为空: " + path); return; }
    if (!isTerrainOptionAllowed(tid)) { warnings.push("跳过未允许的 terrainId: " + tid + " @ " + path); return; }
    if (!isFiniteGridCoord(x, y)) { warnings.push("跳过非法坐标: " + path); return; }
    cells.push({ key: getCanvasCellKey(x, y), x, y, cell: { kind: "terrain_add", terrainId: tid } });
    count++;
  }
  function pushSubtract(x, y, path){
    if (!isFiniteGridCoord(x, y)) { warnings.push("跳过非法坐标: " + path); return; }
    cells.push({ key: getCanvasCellKey(x, y), x, y, cell: { kind: "cell_subtract" } });
    count++;
  }
  function pushSpecial(x, y, mapId, label, path){
    if (!isFiniteGridCoord(x, y)) { warnings.push("跳过非法坐标: " + path); return; }
    const mid = String(mapId ?? "").trim();
    const lab = String(label ?? "").trim();
    if (!mid || !lab) { warnings.push("跳过 special 缺字段: " + path); return; }
    cells.push({ key: getCanvasCellKey(x, y), x, y, cell: { kind: "special_map_cell", mapId: mid, label: lab } });
    count++;
  }

  // terrainRuns
  const tr = obj.terrainRuns && typeof obj.terrainRuns === "object" ? obj.terrainRuns : null;
  if (tr) {
    const tids = Object.keys(tr).sort((a, b) => String(a).localeCompare(String(b)));
    for (const tid of tids) {
      const runs = tr[tid];
      const pts = expandBlueprintCompactRuns(runs);
      for (let i = 0; i < pts.length; i++) {
        if (count >= 20000) return { ok: false, error: "导入失败：格子数量超过 20000", warnings };
        const p = pts[i];
        pushTerrainCell(tid, Number(p.x), Number(p.y), "terrainRuns." + tid + "[" + i + "]");
      }
    }
  }

  // terrainCells
  const tc = obj.terrainCells && typeof obj.terrainCells === "object" ? obj.terrainCells : null;
  if (tc) {
    const tids = Object.keys(tc).sort((a, b) => String(a).localeCompare(String(b)));
    for (const tid of tids) {
      const arr = Array.isArray(tc[tid]) ? tc[tid] : [];
      for (let i = 0; i < arr.length; i++) {
        if (count >= 20000) return { ok: false, error: "导入失败：格子数量超过 20000", warnings };
        const it = arr[i];
        if (!Array.isArray(it) || it.length < 2) { warnings.push("跳过非法 terrainCells: terrainCells." + tid + "[" + i + "]"); continue; }
        pushTerrainCell(tid, Number(it[0]), Number(it[1]), "terrainCells." + tid + "[" + i + "]");
      }
    }
  }

  // subtractCells
  const sc = Array.isArray(obj.subtractCells) ? obj.subtractCells : [];
  for (let i = 0; i < sc.length; i++) {
    if (count >= 20000) return { ok: false, error: "导入失败：格子数量超过 20000", warnings };
    const it = sc[i];
    if (!Array.isArray(it) || it.length < 2) { warnings.push("跳过非法 subtractCells[" + i + "]"); continue; }
    pushSubtract(Number(it[0]), Number(it[1]), "subtractCells[" + i + "]");
  }

  // specialMapCells
  const sp = Array.isArray(obj.specialMapCells) ? obj.specialMapCells : [];
  for (let i = 0; i < sp.length; i++) {
    if (count >= 20000) return { ok: false, error: "导入失败：格子数量超过 20000", warnings };
    const it = sp[i];
    if (!Array.isArray(it) || it.length < 4) { warnings.push("跳过非法 specialMapCells[" + i + "]"); continue; }
    pushSpecial(Number(it[0]), Number(it[1]), it[2], it[3], "specialMapCells[" + i + "]");
  }

  if (cells.length > 20000) return { ok: false, error: "导入失败：格子数量超过 20000", warnings };
  return { ok: true, cells, warnings };
}

function buildBlueprintDeltaExport(){
  const metersPerCell = getMetersPerCell();
  const sourceAreaId = getSourceAreaId();
  const ops = [];
  for (const [k, v] of blueprintState.cells.entries()) {
    const [xs, ys] = String(k).split(",");
    const x = Number(xs), y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (v.kind === "terrain_add") ops.push({ op: "setTerrain", x, y, terrainId: String(v.terrainId) });
    else if (v.kind === "cell_subtract") ops.push({ op: "subtractCell", x, y });
    else if (v.kind === "special_map_cell") ops.push({ op: "setSpecialMapCell", x, y, mapId: String(v.mapId), label: String(v.label) });
  }
  return {
    schemaVersion: 1,
    kind: "wilderness_blueprint_delta",
    sourceAreaId,
    metersPerCell,
    ops
  };
}

function buildBlueprintMergePreviewExport(){
  const metersPerCell = getMetersPerCell();
  const sourceAreaId = getSourceAreaId();
  const terrainOverrides = [];
  const subtractMask = [];
  const specialMapCells = [];
  for (const [k, v] of blueprintState.cells.entries()) {
    const [xs, ys] = String(k).split(",");
    const x = Number(xs), y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (v.kind === "terrain_add") terrainOverrides.push({ x, y, terrainId: String(v.terrainId) });
    else if (v.kind === "cell_subtract") subtractMask.push({ x, y });
    else if (v.kind === "special_map_cell") specialMapCells.push({ x, y, mapId: String(v.mapId), label: String(v.label) });
  }
  return {
    schemaVersion: 1,
    kind: "wilderness_area_merge_preview",
    sourceAreaId,
    metersPerCell,
    terrainOverrides,
    subtractMask,
    specialMapCells
  };
}

function writeExport(obj, { warnings = [] } = {}){
  if (bp.exportEl) {
    bp.exportEl.value = JSON.stringify(obj, null, 2);
  }
  if (warnings.length) {
    bpSetStatus("导出完成（含 warning）: " + warnings.slice(0, 3).join("；") + (warnings.length > 3 ? "…" : ""));
  } else {
    bpSetStatus("导出完成。");
  }
}

function onBlueprintPointerDown(event){
  if (!blueprintShouldHandlePointer(event)) return false;
  blueprintExitIfNotVector();
  ensureBlueprintLayerCreated();
  try { event.preventDefault(); } catch {}
  const cell = blueprintEventToCell(event);
  if (!cell) return true;

  blueprintState.pointer.pointerId = event.pointerId;
  blueprintState.pointer.downCell = { x: cell.x, y: cell.y };
  blueprintState.pointer.lastCell = { x: cell.x, y: cell.y };
  blueprintState.pointer.isPainting = false;
  clearBlueprintLongPressTimer();

  renderBlueprintBrushPreview(cell);
  viewportEl?.setPointerCapture?.(event.pointerId);

  blueprintState.pointer.longPressTimer = setTimeout(() => {
    blueprintState.pointer.isPainting = true;
    applyBlueprintToolToCell(cell);
  }, 200);

  return true;
}

function onBlueprintPointerMove(event){
  if (!blueprintState.enabled) return false;
  if (getActivePreviewMode() !== "vector") return false;
  if (blueprintState.pointer.pointerId == null) return false;
  if (event.pointerId !== blueprintState.pointer.pointerId) return false;
  if (!viewportEl) return false;
  try { event.preventDefault(); } catch {}

  const cell = blueprintEventToCell(event);
  if (!cell) return true;
  renderBlueprintBrushPreview(cell);

  if (!blueprintState.pointer.isPainting) return true;
  const last = blueprintState.pointer.lastCell;
  const cur = { x: cell.x, y: cell.y };
  if (!last || (last.x === cur.x && last.y === cur.y)) return true;
  const pts = interpolateGridCells(last, cur);
  for (const p of pts) applyBlueprintToolToCell(p);
  blueprintState.pointer.lastCell = cur;
  return true;
}

function onBlueprintPointerUp(event){
  if (!blueprintState.enabled) return false;
  if (blueprintState.pointer.pointerId == null) return false;
  if (event.pointerId !== blueprintState.pointer.pointerId) return false;
  try { event.preventDefault(); } catch {}

  clearBlueprintLongPressTimer();
  const wasPainting = blueprintState.pointer.isPainting;
  const down = blueprintState.pointer.downCell;
  const upCell = blueprintEventToCell(event);
  if (!wasPainting) {
    const c = upCell || (down ? { x: down.x, y: down.y } : null);
    if (c) applyBlueprintToolToCell(c);
  }
  try { viewportEl.releasePointerCapture?.(event.pointerId); } catch {}
  resetBlueprintPointerState();
  renderBlueprintBrushPreview(null);
  commitCanvasUndoStep();
  return true;
}

function onBlueprintPointerCancelOrLeave(event){
  if (blueprintState.pointer.pointerId == null) return false;
  if (event && event.pointerId != null && event.pointerId !== blueprintState.pointer.pointerId) return false;
  clearBlueprintLongPressTimer();
  try { viewportEl?.releasePointerCapture?.(blueprintState.pointer.pointerId); } catch {}
  resetBlueprintPointerState();
  renderBlueprintBrushPreview(null);
  commitCanvasUndoStep();
  return true;
}

// UI actions via existing delegated click handler
function blueprintHandleAction(action, target){
  if (action === "toggle-blueprint-mode") { toggleBlueprintMode(); return true; }
  if (action === "blueprint-create-layer") { ensureBlueprintLayerCreated(); toggleBlueprintMode(true); return true; }
  if (action === "blueprint-copy-base-to-layer") { copyBaseMapToBlueprintLayer(); return true; }
  if (action === "blueprint-clear-layer") { blueprintState.cells.clear(); blueprintState.dirty = true; bpSetStatus("蓝图层已清空。"); renderBlueprintOverlay(); return true; }
  if (action === "blueprint-set-blend") { setBlueprintBlendMode(target?.getAttribute("data-blend")); return true; }
  if (action === "blueprint-set-tool") { setBlueprintTool(target?.getAttribute("data-tool")); return true; }
  if (action === "blueprint-open-logs") {
    bpSetLogsOpen(true);
    bpLogClient("info", "open logs panel");
    renderBlueprintLogPanel();
    if (bpLogState.source === "server") void fetchBlueprintServerLogs();
    return true;
  }
  if (action === "blueprint-open-author-server") {
    const btn = byId("blueprint-open-author-server-btn");
    const baseUrl = String(btn?.getAttribute("data-author-base") || bpAuthorServer.baseUrl || "").trim();
    if (!baseUrl) { bpSetStatus(renderAuthorServiceUnavailableHint()); renderBlueprintAuthorServiceStatus(); return true; }
    try { window.open(baseUrl + "/", "_blank"); } catch {}
    bpLogClient("info", "open author server page", { baseUrl });
    return true;
  }
  if (action === "blueprint-logs-refresh") {
    bpLogClient("info", "refresh logs", { source: bpLogState.source });
    if (bpLogState.source === "server") void fetchBlueprintServerLogs();
    else renderBlueprintLogPanel();
    return true;
  }
  if (action === "blueprint-logs-clear-client") {
    bpClearClientLogs();
    bpLogClient("info", "client logs cleared");
    renderBlueprintLogPanel();
    return true;
  }
  if (action === "blueprint-logs-clear-server") {
    void clearBlueprintServerLogs();
    return true;
  }
  if (action === "blueprint-logs-copy") {
    void copyBlueprintLogsToClipboard();
    return true;
  }
  if (action === "blueprint-apply-to-game") {
    void applyBlueprintToGameData();
    return true;
  }
  if (action === "blueprint-apply-expand-bounds") {
    void applyBlueprintToGameDataAllowExpandBounds();
    return true;
  }
  if (action === "blueprint-refresh-preview-from-game-files") {
    void refreshPreviewFromGameFiles({ reason: "manual", statusText: "已从游戏文件重载预览。" });
    return true;
  }
  if (action === "bp-switch-tab") {
    const tabName = String(target?.getAttribute("data-bp-tab") || "");
    bpSwitchPanelTab(tabName);
    return true;
  }
  if (action === "blueprint-open-snapshots") {
    bpSetSnapshotsOpen(true);
    bpSetStatus("正在读取旧快照…");
    bpLogClient("info", "open snapshots");
    renderBlueprintAuthorServiceStatus();
    fetchBlueprintSnapshots()
      .then((r) => {
        renderSnapshotList(r?.snapshots || []);
        bpSetStatus("旧快照已加载。选择“载入”仅导入到蓝图层。");
        bpLogClient("info", "snapshots list success", { count: Array.isArray(r?.snapshots) ? r.snapshots.length : 0 });
        renderBlueprintAuthorServiceStatus();
      })
      .catch((e) => {
        const msg = String(e?.message || e || "");
        if (/fetch|network|failed|ECONNREFUSED/i.test(msg)) {
          bpSetStatus(renderAuthorServiceUnavailableHint());
          bpLogClient("error", "dev server unavailable", { message: msg });
        } else {
          bpSetStatus("读取快照失败: " + msg);
          bpLogClient("error", "snapshots list failed", { message: msg });
        }
        renderBlueprintAuthorServiceStatus();
      });
    return true;
  }
  if (action === "blueprint-load-snapshot") {
    const sid = String(target?.getAttribute("data-snapshot-id") || "").trim();
    if (!sid) { bpSetStatus("载入失败：snapshotId 为空"); return true; }
    bpSetStatus("载入快照中…");
    loadBlueprintSnapshotToLayer(sid)
      .catch((e) => {
        const msg = String(e?.message || e || "");
        bpSetStatus("载入快照失败: " + msg);
        bpLogClient("error", "snapshot load failed", { snapshotId: sid, message: msg });
      });
    return true;
  }
  if (action === "blueprint-export-compact") {
    bpLogClient("info", "export compact clicked");
    exportBlueprintCompact();
    return true;
  }
  if (action === "blueprint-export-delta") {
    const v = validateBlueprintBeforeExport();
    if (!v.ok) { bpSetStatus("导出失败: " + v.errors[0]); return true; }
    bpLogClient("info", "export delta clicked");
    const obj = buildBlueprintDeltaExport();
    writeExport(obj, { warnings: v.warnings });
    return true;
  }
  if (action === "blueprint-export-merge-preview") {
    const v = validateBlueprintBeforeExport();
    if (!v.ok) { bpSetStatus("导出失败: " + v.errors[0]); return true; }
    bpLogClient("info", "export merge preview clicked");
    const obj = buildBlueprintMergePreviewExport();
    writeExport(obj, { warnings: v.warnings });
    return true;
  }
  if (action === "blueprint-import-textarea") {
    bpLogClient("info", "import textarea clicked");
    try { importBlueprintFromTextarea(); } catch { bpSetStatus("导入失败：内部错误。"); }
    return true;
  }
  if (action === "blueprint-execute-patch") {
    bpLogClient("info", "execute patch clicked");
    try { executeBlueprintPatchFromTextarea(); } catch { bpSetStatus("蓝图代码执行失败。"); }
    return true;
  }
  return false;
}

function initBlueprintLogsUi(){
  const shell = byId("blueprint-logs-shell");
  if (!shell) return;
  const radios = shell.querySelectorAll('input[name="bp-log-source"]');
  radios.forEach((r) => {
    r.addEventListener("change", () => {
      const v = String(r?.value || "");
      bpLogState.source = (v === "server") ? "server" : "client";
      bpLogClient("info", "log source changed", { source: bpLogState.source });
      if (bpLogState.source === "server") void fetchBlueprintServerLogs();
      else renderBlueprintLogPanel();
      renderBlueprintAuthorServiceStatus();
    });
  });
  renderBlueprintLogPanel();
}

// init
initBlueprintTerrainSelect();
initBlueprintInputs();
buildBlueprintLegend();
setBlueprintBlendMode("bottom_only");
setBlueprintTool("terrain_add");
updateBlueprintTerrainPreview();
updateBlueprintBoundsUi();
bpLogClient("info", "page initialized");
initBlueprintLogsUi();
void updateBlueprintAuthorModeUi();
bpSetLayerStatus("未启用");
bpSetStatus("就绪。");
`.trim();
}

