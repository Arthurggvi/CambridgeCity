/**
 * Wilderness runtime: map-shaped chrome + compass tool-readout control + overlay.
 * Move / return actions render in the global #choices list (renderer.renderMapPageViewModel).
 */

const SVG_NS = "http://www.w3.org/2000/svg";

export const WILDERNESS_READOUT_OVERLAY_HOST_ID = "wilderness-readout-overlay-host";

export function setWildernessReadoutGameSurfaceInert(on) {
  if (typeof document === "undefined") return;
  const app = document.getElementById("app");
  const choices = document.getElementById("choices");
  if (on) {
    app?.setAttribute("inert", "");
    choices?.setAttribute("inert", "");
  } else {
    app?.removeAttribute("inert");
    choices?.removeAttribute("inert");
  }
}

function mountWildernessReadoutOverlayHost(backdrop) {
  if (typeof document === "undefined" || !backdrop) return;
  const prev = document.getElementById(WILDERNESS_READOUT_OVERLAY_HOST_ID);
  if (prev && prev !== backdrop) prev.remove();
  backdrop.id = WILDERNESS_READOUT_OVERLAY_HOST_ID;
  document.body?.appendChild(backdrop);
}

function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent != null && textContent !== "") node.textContent = String(textContent);
  return node;
}

function buildCompassReadoutIconSvg() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "wilderness-runtime__readout-icon");

  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("class", "wilderness-runtime__readout-icon-ring");
  ring.setAttribute("cx", "16");
  ring.setAttribute("cy", "16");
  ring.setAttribute("r", "10.5");
  svg.appendChild(ring);

  const nMark = document.createElementNS(SVG_NS, "path");
  nMark.setAttribute("class", "wilderness-runtime__readout-icon-n");
  nMark.setAttribute("d", "M16 3.5 L17.65 6.85 H14.35 Z");
  svg.appendChild(nMark);

  const needle = document.createElementNS(SVG_NS, "path");
  needle.setAttribute("class", "wilderness-runtime__readout-icon-needle");
  needle.setAttribute("d", "M16 7.35 L20.35 16 L16 24.65 L11.65 16 Z");
  svg.appendChild(needle);

  const hub = document.createElementNS(SVG_NS, "circle");
  hub.setAttribute("class", "wilderness-runtime__readout-icon-hub");
  hub.setAttribute("cx", "16");
  hub.setAttribute("cy", "16");
  hub.setAttribute("r", "1.8");
  svg.appendChild(hub);

  return svg;
}

const READOUT_TOOL_IDS = Object.freeze(["gps", "compass", "heart", "anemometer", "vane", "snow"]);
const READOUT_INDEX_NAMES = Object.freeze({
  gps: "GPS",
  compass: "磁罗盘",
  heart: "心率监测仪",
  anemometer: "手持风速仪",
  vane: "电子风向标",
  snow: "雪深传感器"
});

function normalizeReadoutModel(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  const toolIndex = Array.isArray(base.toolIndex) ? base.toolIndex : null;
  if (toolIndex && toolIndex.length > 0) {
    return {
      cards: Array.isArray(base.cards) ? base.cards : [],
      hasEquippedWildernessReadoutTool: base.hasEquippedWildernessReadoutTool === true,
      toolIndex,
      detailsById: base.detailsById && typeof base.detailsById === "object" ? base.detailsById : {},
      defaultSelectedId: typeof base.defaultSelectedId === "string" ? base.defaultSelectedId : null
    };
  }
  const fallbackIndex = READOUT_TOOL_IDS.map((id) => ({
    id,
    indexName: READOUT_INDEX_NAMES[id] || id,
    status: "unequipped",
    statusLabel: "未装备"
  }));
  return {
    cards: [],
    hasEquippedWildernessReadoutTool: false,
    toolIndex: fallbackIndex,
    detailsById: {},
    defaultSelectedId: "gps"
  };
}

function buildReadoutToolIconSvg(toolId) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "wilderness-readout-tool-icon-svg");

  const stroke = (d, sw = 1.1) => {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", String(sw));
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    svg.appendChild(p);
  };
  const fillp = (d) => {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "currentColor");
    svg.appendChild(p);
  };

  if (toolId === "gps") {
    stroke("M10 3.5v13M3.5 10h13", 1);
    stroke("M10 10m-6.2 0a6.2 6.2 0 1 1 12.4 0a6.2 6.2 0 1 1-12.4 0", 0.95);
  } else if (toolId === "compass") {
    stroke("M10 2.8A7.2 7.2 0 1 1 2.8 10 7.2 7.2 0 0 1 10 2.8z", 1);
    fillp("M10 4.2 L10.9 6.4H9.1z");
    stroke("M10 7.2 L12.5 10 10 10.8 7.5 10z", 0.75);
  } else if (toolId === "heart") {
    fillp("M10 14.5 L6.2 10.2 Q6 7.8 8 6.6 Q10 5.4 12 6.6 Q14 7.8 13.8 10.2 Z");
  } else if (toolId === "anemometer") {
    stroke("M4 7h12M4 10h12M4 13h9", 1);
    stroke("M14 13l2.2 2.2", 1);
  } else if (toolId === "vane") {
    stroke("M10 3v11", 1);
    fillp("M10 3.5 L14 8.5H12v3.5H8V8.5H6z");
  } else {
    stroke("M10 3.2 L12.8 7.8H7.2z", 0.9);
    stroke("M10 16.8 L7.2 12.2h5.6z", 0.9);
    stroke("M10 7.8v4.4", 0.85);
  }
  return svg;
}

function buildFieldGrid(fields) {
  const grid = el("div", "wilderness-readout-field-grid");
  for (const f of fields) {
    const row = el("div", "wilderness-readout-field");
    row.appendChild(el("span", "wilderness-readout-field-label", String(f.label || "")));
    row.appendChild(el("span", "wilderness-readout-field-value", String(f.value ?? "")));
    grid.appendChild(row);
  }
  return grid;
}

function buildDetailSections(detail) {
  const frag = document.createDocumentFragment();
  const sections = Array.isArray(detail?.sections) ? detail.sections : [];
  for (const sec of sections) {
    const block = el("section", "wilderness-readout-section");
    block.appendChild(el("h3", "wilderness-readout-section-title", String(sec.title || "")));
    block.appendChild(buildFieldGrid(Array.isArray(sec.fields) ? sec.fields : []));
    frag.appendChild(block);
  }
  return frag;
}

function paintReadoutContent(mainEl, model, selectedId) {
  mainEl.textContent = "";
  if (!model.hasEquippedWildernessReadoutTool) {
    const wrap = el("div", "wilderness-readout-empty");
    const vis = el("div", "wilderness-readout-empty-visual");
    vis.setAttribute("aria-hidden", "true");
    wrap.appendChild(vis);
    wrap.appendChild(el("p", "wilderness-readout-empty-line", "未检测到可用野外读数工具。"));
    wrap.appendChild(el("p", "wilderness-readout-empty-line wilderness-readout-empty-line--sub", "请先在装备中安装相关设备。"));
    mainEl.appendChild(wrap);
    return;
  }

  const ti = model.toolIndex.find((t) => t.id === selectedId);
  if (!ti) return;

  if (ti.status === "unequipped") {
    const wrap = el("div", "wilderness-readout-stub");
    wrap.appendChild(el("p", "wilderness-readout-stub-text", "该工具未装备。"));
    mainEl.appendChild(wrap);
    return;
  }

  if (ti.status === "no_readout") {
    const wrap = el("div", "wilderness-readout-stub");
    wrap.appendChild(el("p", "wilderness-readout-stub-text", "该设备当前无可用读数。"));
    mainEl.appendChild(wrap);
    return;
  }

  const detail = model.detailsById[selectedId];
  if (detail && Array.isArray(detail.sections) && detail.sections.length > 0) {
    mainEl.appendChild(buildDetailSections(detail));
    return;
  }

  const wrap = el("div", "wilderness-readout-stub");
  wrap.appendChild(el("p", "wilderness-readout-stub-text", "该设备当前无可用读数。"));
  mainEl.appendChild(wrap);
}

function syncReadoutIndexActive(aside, selectedId, model) {
  const buttons = aside.querySelectorAll(".wilderness-readout-tool-item");
  buttons.forEach((btn) => {
    const id = String(btn.dataset.readoutTool || "");
    const active = model.hasEquippedWildernessReadoutTool === true && id === selectedId;
    btn.classList.toggle("is-active", active);
  });
}

function buildToolReadoutsOverlay(toolReadoutsRaw) {
  const model = normalizeReadoutModel(toolReadoutsRaw);
  let selectedId = model.defaultSelectedId || READOUT_TOOL_IDS[0];

  const backdrop = el("div", "wilderness-readout-backdrop wilderness-tool-readouts-overlay");
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) {
      backdrop.classList.remove("wilderness-tool-readouts-overlay--open");
      backdrop.setAttribute("aria-hidden", "true");
      setWildernessReadoutGameSurfaceInert(false);
    }
  });

  const panel = el("section", "wilderness-readout-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  // Do not stopPropagation on the panel: delegated `document` click routing
  // (src/ui/interaction.js) must see clicks from `[data-ui-action]` inside the dialog.

  const header = el("header", "wilderness-readout-header");
  const titleBlock = el("div", "wilderness-readout-title-block");
  titleBlock.appendChild(el("div", "wilderness-readout-eyebrow", "FIELD READOUT"));
  titleBlock.appendChild(el("h2", "wilderness-readout-title", "野外工具读数"));
  header.appendChild(titleBlock);
  const closeBtn = el("button", "wilderness-readout-close", "×");
  closeBtn.type = "button";
  closeBtn.dataset.uiAction = "wilderness-tool-readouts-close";
  closeBtn.dataset.actionId = "wilderness_tools_close";
  closeBtn.setAttribute("aria-label", "关闭野外工具读数");
  closeBtn.title = "关闭";
  header.appendChild(closeBtn);

  const body = el("div", "wilderness-readout-body");
  const aside = el("aside", "wilderness-readout-index");
  aside.setAttribute("aria-label", "工具索引");

  for (const slot of model.toolIndex) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wilderness-readout-tool-item";
    btn.dataset.readoutTool = String(slot.id || "");
    if (slot.status === "unequipped") btn.classList.add("is-disabled");
    const iconWrap = el("span", "wilderness-readout-tool-icon");
    iconWrap.appendChild(buildReadoutToolIconSvg(String(slot.id || "")));
    const copy = el("span", "wilderness-readout-tool-copy");
    copy.appendChild(el("span", "wilderness-readout-tool-name", String(slot.indexName || "")));
    copy.appendChild(el("span", "wilderness-readout-tool-status", String(slot.statusLabel || "")));
    btn.appendChild(iconWrap);
    btn.appendChild(copy);
    btn.addEventListener("click", () => {
      selectedId = String(slot.id || "");
      syncReadoutIndexActive(aside, selectedId, model);
      paintReadoutContent(main, model, selectedId);
    });
    aside.appendChild(btn);
  }

  const main = el("main", "wilderness-readout-content");
  body.appendChild(aside);
  body.appendChild(main);

  panel.appendChild(header);
  panel.appendChild(body);
  backdrop.appendChild(panel);

  syncReadoutIndexActive(aside, selectedId, model);
  paintReadoutContent(main, model, selectedId);

  mountWildernessReadoutOverlayHost(backdrop);
  return backdrop;
}

function buildDom(vm) {
  const root = el("div", "wilderness-runtime-host");

  const header = el("div", "map-scene-header");
  const titleRow = el("div", "wilderness-runtime__title-row");
  const h1 = el("h1", "wilderness-runtime__title", vm.title || "野外");
  titleRow.appendChild(h1);

  const readoutBtn = document.createElement("button");
  readoutBtn.type = "button";
  readoutBtn.className = "wilderness-runtime__readout-icon-button";
  readoutBtn.setAttribute("aria-label", "打开工具读数");
  readoutBtn.title = "工具读数";
  readoutBtn.dataset.uiAction = "wilderness-tool-readouts-open";
  readoutBtn.appendChild(buildCompassReadoutIconSvg());
  titleRow.appendChild(readoutBtn);

  header.appendChild(titleRow);
  header.appendChild(el("div", "map-scene-rule"));
  root.appendChild(header);

  const descEl = el("div", "map-desc");
  const bodyText = typeof vm.description === "string" ? vm.description : String(vm.description?.body ?? "");
  descEl.textContent = bodyText;
  root.appendChild(descEl);

  if (Array.isArray(vm.warnings) && vm.warnings.length > 0) {
    const w = el("div", "wilderness-runtime-warn");
    w.textContent = `提示：${vm.warnings.map((x) => String(x)).join(" · ")}`;
    root.appendChild(w);
  }

  buildToolReadoutsOverlay(vm.toolReadouts || { cards: [], hasEquippedWildernessReadoutTool: false });

  return root;
}

export function renderWildernessRuntime(vm) {
  if (typeof document === "undefined") {
    return { __wildernessRuntimeHeadlessStub: true, status: vm?.status || null };
  }
  return buildDom(vm || {});
}
