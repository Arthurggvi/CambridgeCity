import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "..");

const AREA_ID = "west2_old_marker_patrol_line";
const EXPORTER = path.resolve(REPO_ROOT, "scripts", "wilderness_area_preview_export.mjs");
const EXPORTER_CMD = ["node", [EXPORTER, AREA_ID]];

const OUTPUT_HTML = path.resolve(
  REPO_ROOT,
  "temp",
  "wilderness_area_preview_west2_old_marker_patrol_line.html"
);

const STABLE_INDEX_HTML = path.resolve(
  REPO_ROOT,
  "tools",
  "wilderness_area_preview",
  "index.html"
);
const STABLE_README = path.resolve(REPO_ROOT, "tools", "wilderness_area_preview", "README.md");
const STABLE_CMD_OPEN = path.resolve(REPO_ROOT, "tools", "wilderness_area_preview", "启动野外地图预览器.cmd");
const STABLE_CMD_REFRESH = path.resolve(REPO_ROOT, "tools", "wilderness_area_preview", "刷新并打开预览器.cmd");

const PROTECTED = [
  { kind: "dir", rel: "src" },
  { kind: "dir", rel: "data" },
  { kind: "file", rel: "style.css" },
  { kind: "file", rel: "package.json" },
  { kind: "file", rel: "save_schema.js" },
  { kind: "file", rel: "migrations.js" },
  { kind: "file", rel: "version.js" },
  { kind: "dir_md_only", rel: "运维" }
];

const EXTRA_MONITOR = [
  { kind: "dir", rel: "scripts" },
  { kind: "dir", rel: "temp" },
  { kind: "dir", rel: "tools" }
];

const ALLOWED_TEMP_OUTPUT = path.resolve(
  REPO_ROOT,
  "temp",
  "wilderness_area_preview_west2_old_marker_patrol_line.html"
);
const ALLOWED_STABLE_INDEX = STABLE_INDEX_HTML;
const ALLOWED_SCRIPT_1 = path.resolve(REPO_ROOT, "scripts", "wilderness_area_preview_export.mjs");
const ALLOWED_SCRIPT_2 = path.resolve(REPO_ROOT, "scripts", "wilderness_area_preview_contract_check.mjs");

function isSubpath(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function sha256File(absPath) {
  const buf = await fs.readFile(absPath);
  const h = crypto.createHash("sha256");
  h.update(buf);
  return h.digest("hex");
}

async function* walkFiles(absDir, { mdOnly = false } = {}) {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === ".git") continue;
    if (ent.name === "node_modules") continue;
    const p = path.join(absDir, ent.name);
    if (ent.isDirectory()) {
      yield* walkFiles(p, { mdOnly });
    } else if (ent.isFile()) {
      if (mdOnly && !ent.name.toLowerCase().endsWith(".md")) continue;
      yield p;
    }
  }
}

async function snapshotHashes(targets) {
  /** @type {Map<string,string>} */
  const map = new Map();

  for (const t of targets) {
    const abs = path.resolve(REPO_ROOT, t.rel);
    if (t.kind === "file") {
      try {
        const st = await fs.stat(abs);
        if (!st.isFile()) continue;
        map.set(abs, await sha256File(abs));
      } catch {
        // missing file: ignore (contract only forbids changing existing truth; absence is not exporter side-effect)
      }
      continue;
    }

    if (t.kind === "dir" || t.kind === "dir_md_only") {
      try {
        const st = await fs.stat(abs);
        if (!st.isDirectory()) continue;
      } catch {
        continue;
      }
      const mdOnly = t.kind === "dir_md_only";
      for await (const f of walkFiles(abs, { mdOnly })) {
        map.set(f, await sha256File(f));
      }
      continue;
    }
  }

  return map;
}

function diffHashMaps(before, after) {
  const changed = [];
  const allKeys = new Set([...before.keys(), ...after.keys()]);
  for (const k of allKeys) {
    const a = before.get(k);
    const b = after.get(k);
    if (a !== b) changed.push(k);
  }
  changed.sort();
  return changed;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readTextIfExists(absPath) {
  try {
    return await fs.readFile(absPath, "utf8");
  } catch {
    return null;
  }
}

async function assertFileExists(absPath, label) {
  try {
    const st = await fs.stat(absPath);
    assert(st.isFile(), `${label} 不是文件：${absPath}`);
  } catch {
    throw new Error(`${label} 不存在：${absPath}`);
  }
}

function containsAll(text, needles, ctxLabel) {
  for (const n of needles) {
    assert(text.includes(n), `${ctxLabel} 缺少必需文本片段：${JSON.stringify(n)}`);
  }
}

function countUniqueTerrainClasses(html) {
  const re = /\bterrain-[a-z0-9_-]+\b/g;
  const m = html.match(re) ?? [];
  return new Set(m).size;
}

function extractJsonScript(html, scriptId) {
  const re = new RegExp(
    `<script[^>]*id=["']${scriptId}["'][^>]*>([\\s\\S]*?)<\\/script>`,
    "m"
  );
  const m = html.match(re);
  if (!m) return null;
  const raw = m[1] ?? "";
  // reverse of exporter escapeHtml for JSON scripts
  const text = raw
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function assertHtmlNoForbiddenFileNavigation(html, ctx) {
  const forbidden = [
    "<iframe",
    "window.location",
    "location.href",
    "location.reload",
    "window.open",
    "<form",
    "<script src=",
    'type="module"',
    "fetch(",
    "XMLHttpRequest",
    'href="file:',
    'href="index.html"'
  ];
  for (const s of forbidden) {
    assert(!html.includes(s), `${ctx} 包含禁止片段：${JSON.stringify(s)}`);
  }
}

function assertAllButtonsAreTypeButton(html, ctx) {
  const tags = html.match(/<button\b[^>]*>/g) ?? [];
  for (const t of tags) {
    if (!/type\s*=\s*["']button["']/.test(t)) {
      throw new Error(`${ctx} 存在缺少 type="button" 的 button：${t.slice(0, 120)}...`);
    }
  }
}

function assertNoVectorGroupTransform(html, ctx) {
  const hard = [
    "cameraGroup.setAttribute(\"transform\"",
    "id=\"v-camera-group\"",
    "v-camera-group",
    "scale(cameraState.scale",
    "scale(scale, -scale)"
  ];
  for (const s of hard) {
    assert(!html.includes(s), `${ctx} 不允许出现整组相机 transform/翻转：${JSON.stringify(s)}`);
  }
}

async function extractDebugMetricsWithPlaywright(filePath) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e?.message ?? e)));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(String(m.text()));
  });
  const url = "file://" + filePath.replaceAll("\\", "/");
  await page.goto(url, { waitUntil: "load" });

  // Theme toggle runtime assertions (preview-local UI only)
  await page.waitForSelector(".preview-theme-toggle", { timeout: 10000 });
  await page.waitForFunction(() => {
    const v = document.documentElement?.dataset?.previewTheme || "";
    return v === "light" || v === "dark";
  }, { timeout: 10000 });
  const initialTheme = await page.evaluate(() => document.documentElement.dataset.previewTheme || "");
  assert(initialTheme === "light" || initialTheme === "dark", "初始 previewTheme 必须为 light/dark");
  const beforeBg = await page.$eval("#vector-preview-svg", (el) => getComputedStyle(el).backgroundImage || "");
  await page.click(".preview-theme-toggle");
  await page.waitForTimeout(80);
  const themeAfter = await page.evaluate(() => document.documentElement.dataset.previewTheme || "");
  assert(themeAfter !== initialTheme, "点击主题按钮后 dataset.previewTheme 必须切换");
  const iconAfter = await page.$eval("#preview-theme-icon", (el) => el.textContent || "");
  assert(iconAfter.includes("☀") || iconAfter.includes("☾"), "主题 icon 必须是 ☀ 或 ☾");
  const afterBg = await page.$eval("#vector-preview-svg", (el) => getComputedStyle(el).backgroundImage || "");
  assert(beforeBg !== afterBg, "切换主题后 SVG 背景必须发生变化");

  // Readability assertions in dark theme (no "muddy gray on dark gray")
  const darkStyles = await page.evaluate(() => {
    const rgb = (s) => {
      const m = String(s || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!m) return null;
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
    };
    const lum = (c) => {
      if (!c) return null;
      const f = (x) => {
        const v = x / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const cs = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const st = getComputedStyle(el);
      return { color: st.color, background: st.backgroundColor };
    };
    const sidebar = cs(".preview-sidebar");
    const detailTitle = cs(".detail-title");
    const detailPanel = cs(".cell-detail-panel");
    return {
      sidebar,
      detailTitle,
      detailPanel,
      lum: {
        sidebarText: lum(rgb(sidebar?.color)),
        sidebarBg: lum(rgb(sidebar?.background)),
        detailTitleText: lum(rgb(detailTitle?.color)),
        detailPanelBg: lum(rgb(detailPanel?.background))
      }
    };
  });
  const deltaSidebar = Math.abs((darkStyles?.lum?.sidebarText ?? 0) - (darkStyles?.lum?.sidebarBg ?? 0));
  assert(deltaSidebar >= 0.35, `dark 右侧栏文字/背景对比不足（delta=${deltaSidebar}）`);
  const deltaDetail = Math.abs((darkStyles?.lum?.detailTitleText ?? 0) - (darkStyles?.lum?.detailPanelBg ?? 0));
  assert(deltaDetail >= 0.35, `dark 详情标题文字/卡片背景对比不足（delta=${deltaDetail}）`);

  await page.click(".preview-theme-toggle");
  await page.waitForTimeout(80);
  const themeBack = await page.evaluate(() => document.documentElement.dataset.previewTheme || "");
  assert(themeBack === initialTheme, "再次点击应切回初始主题");

  // Header height + segmented mode switch runtime assertions
  const headerBox = await page.$eval(".preview-header", (el) => {
    const r = el.getBoundingClientRect();
    return { height: r.height, width: r.width };
  });
  assert(headerBox.height <= 70, `顶部 header 高度过高（h=${headerBox.height}）`);
  await page.waitForSelector(".preview-mode-switch", { timeout: 10000 });
  const activeMode0 = await page.$eval(".preview-mode-segment.is-active", (el) => el.getAttribute("data-preview-mode") || "");
  assert(activeMode0 === "vector", `默认预览模式应为 vector（got=${activeMode0}）`);
  // switch to grid
  await page.click('.preview-mode-segment[data-preview-mode="grid"]');
  await page.waitForTimeout(100);
  const activeMode1 = await page.$eval(".preview-mode-segment.is-active", (el) => el.getAttribute("data-preview-mode") || "");
  assert(activeMode1 === "grid", `点击后预览模式应为 grid（got=${activeMode1}）`);
  const gridActive = await page.$eval("#grid-debug", (el) => el.classList.contains("is-active"));
  const vecActive = await page.$eval("#vector-preview", (el) => el.classList.contains("is-active"));
  assert(gridActive && !vecActive, "grid 激活时 vector 应隐藏");
  // Grid mode isolation: after fit, rulers must show integer ticks around [-8,8] by default.
  await page.click('[data-preview-action="grid-fit"]');
  await page.waitForTimeout(100);
  const gridBottomTicks = await page.$$eval("#preview-ruler-bottom .ruler-tick", (nodes) =>
    nodes.map((n) => (n.textContent || "").trim()).filter(Boolean)
  );
  const gridLeftTicks = await page.$$eval("#preview-ruler-left .ruler-tick", (nodes) =>
    nodes.map((n) => (n.textContent || "").trim()).filter(Boolean)
  );
  const parseInts = (arr) => arr.map((s) => Number(String(s).trim())).filter((v) => Number.isFinite(v));
  const bx = parseInts(gridBottomTicks);
  const ly = parseInts(gridLeftTicks);
  assert(bx.length >= 3, "grid bottom ruler ticks 必须存在");
  assert(ly.length >= 3, "grid left ruler ticks 必须存在");
  assert(
    Math.min(...bx) <= -6 && Math.max(...bx) >= 6,
    "grid bottom ruler 默认 fit 后必须覆盖 -8..8 附近（ticks=" + JSON.stringify(gridBottomTicks.slice(0, 24)) + ")"
  );
  assert(
    Math.min(...ly) <= -6 && Math.max(...ly) >= 6,
    "grid left ruler 默认 fit 后必须覆盖 -8..8 附近（ticks=" + JSON.stringify(gridLeftTicks.slice(0, 24)) + ")"
  );

  // Grid tooltip coord must match right-panel coord after click.
  const vp = await page.$("#preview-viewport");
  const box = await vp.boundingBox();
  assert(box && box.width > 40 && box.height > 40, "viewport bounding box 必须可用");
  const mx = box.x + box.width * 0.52;
  const my = box.y + box.height * 0.48;
  await page.mouse.move(mx, my);
  await page.waitForTimeout(80);
  const tipTextGrid = await page.$eval("#preview-hover-tip", (n) => (n.textContent || "").trim());
  const mGrid = tipTextGrid.match(/\(x:\s*([-0-9]+)\s*,\s*y:\s*([-0-9]+)\s*\)/);
  assert(mGrid, "grid hover tooltip 必须输出 (x:?, y:?)");
  const tx = Number(mGrid[1]), ty = Number(mGrid[2]);
  await page.mouse.click(mx, my);
  await page.waitForTimeout(120);
  const coordTextGrid = await page.$eval('[data-field="coord"]', (n) => (n.textContent || "").trim());
  const mCoord = coordTextGrid.match(/\(\s*([-0-9]+)\s*,\s*([-0-9]+)\s*\)/);
  assert(mCoord, "右侧 coord 必须存在");
  assert(Number(mCoord[1]) === tx && Number(mCoord[2]) === ty, "grid tooltip 坐标必须与右侧详情坐标一致");
  // switch back to vector
  await page.click('.preview-mode-segment[data-preview-mode="vector"]');
  await page.waitForTimeout(100);
  const activeMode2 = await page.$eval(".preview-mode-segment.is-active", (el) => el.getAttribute("data-preview-mode") || "");
  assert(activeMode2 === "vector", `切回预览模式应为 vector（got=${activeMode2}）`);
  const gridActive2 = await page.$eval("#grid-debug", (el) => el.classList.contains("is-active"));
  const vecActive2 = await page.$eval("#vector-preview", (el) => el.classList.contains("is-active"));
  assert(vecActive2 && !gridActive2, "vector 激活时 grid 应隐藏");

  await page.waitForSelector("#debug-metrics", { timeout: 10000, state: "attached" });
  let text = "";
  let baselineText = "";
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById("debug-metrics");
      return Boolean(el && typeof el.textContent === "string" && el.textContent.includes("viewportWidth="));
    }, { timeout: 10000 });
  } catch (e) {
    text = await page.$eval("#debug-metrics", (el) => el.textContent || "");
    await browser.close();
    throw new Error(
      [
        "Playwright 未能等到 debug-metrics 就绪。",
        "pageErrors=" + JSON.stringify(pageErrors),
        "consoleErrors=" + JSON.stringify(consoleErrors),
        "debugMetricsText=" + JSON.stringify(text.slice(0, 800))
      ].join("\n")
    );
  }
  text = await page.$eval("#debug-metrics", (el) => el.textContent || "");
  baselineText = text;

  const geom = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const rectOf = (s) => {
      const el = q(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const viewport = rectOf("#preview-svg-viewport");
    const host = rectOf("#vector-preview");
    const svg = rectOf("#vector-preview-svg");

    const collect = (selector) => Array.from(document.querySelectorAll(selector));
    const unionRects = (els) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let count = 0;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (!(r.width > 0) || !(r.height > 0)) continue;
        count++;
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
      }
      if (!count) return { count: 0, minX: NaN, minY: NaN, maxX: NaN, maxY: NaN, width: NaN, height: NaN, cx: NaN, cy: NaN };
      const width = maxX - minX;
      const height = maxY - minY;
      return { count, minX, minY, maxX, maxY, width, height, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    };

    const fillPaths = collect("#v-layer-fill path");
    const borderPaths = collect("#v-layer-boundary path");
    const labels = collect("#v-layer-labels text");
    const labelText = labels.map((n) => n.textContent || "").join("\n");
    const nodes = collect("#v-layer-nodes circle");
    const combined = unionRects([...fillPaths, ...borderPaths, ...labels, ...nodes]);
    const combinedCore = unionRects([...fillPaths, ...borderPaths, ...nodes]);

    return { viewport, host, svg, combined, combinedCore, counts: { fillPaths: fillPaths.length, borderPaths: borderPaths.length, labels: labels.length, nodes: nodes.length }, labelText };
  });

  // Hover tooltip should appear and contain x/y lines (must not block clicks)
  const svgBox = await page.$eval("#vector-preview-svg", (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
  await page.waitForTimeout(80);
  // Custom pointer overlay should appear in viewport + ruler cursor lines.
  const pointerOverlayState = await page.evaluate(() => {
    const dot = document.getElementById("preview-pointer-dot");
    const rx = document.getElementById("preview-ruler-x-cursor");
    const ry = document.getElementById("preview-ruler-y-cursor");
    const dotVisible = Boolean(dot && dot.classList.contains("is-visible"));
    const rxVisible = Boolean(rx && rx.classList.contains("is-visible"));
    const ryVisible = Boolean(ry && ry.classList.contains("is-visible"));
    const dotPos = dot ? { left: dot.style.left, top: dot.style.top } : null;
    const rxPos = rx ? { left: rx.style.left } : null;
    const ryPos = ry ? { top: ry.style.top } : null;
    return { dotVisible, rxVisible, ryVisible, dotPos, rxPos, ryPos };
  });
  assert(pointerOverlayState.dotVisible, "画布内移动后 pointer dot 应 visible");
  assert(pointerOverlayState.rxVisible, "画布内移动后 bottom ruler cursor 应 visible");
  assert(pointerOverlayState.ryVisible, "画布内移动后 left ruler cursor 应 visible");
  const tipText = await page.$eval("#preview-hover-tooltip", (el) => el.textContent || "");
  assert(tipText.includes("x:") && tipText.includes("y:"), "hover tooltip 必须包含坐标信息");
  // entry hover should mention 入口 or mapId when near an entry node (use center area where nodes likely exist)
  // (soft check: at least one of the hints appears in tooltip)
  assert(tipText.includes("入口") || tipText.includes("mapId") || tipText.includes("ID:"), "hover tooltip 缺少入口/mapId/ID 提示");

  const footprintFill = await page.$eval(".preview-entry-footprint", (el) => getComputedStyle(el).fill || "");
  assert(footprintFill && footprintFill !== "none", "入口 footprint 的 fill 不得为 none");
  assert(/rgba?\(\s*23[0-9]|rgba?\(\s*24[0-9]|236/i.test(footprintFill), "入口 footprint 应为黄色系填充（resolved fill）");
  await page.waitForSelector(".preview-node-entry-core", { timeout: 5000 });

  const entryCoreCenter = await page.$eval(".preview-node-entry-core", (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  // Ruler cursor lines should snap to the same integer cell center as the entry core.
  await page.mouse.move(entryCoreCenter.x, entryCoreCenter.y);
  await page.waitForTimeout(80);
  const rulerSnapCheck = await page.evaluate(() => {
    const dot = document.querySelector(".preview-node-entry-core");
    const rx = document.getElementById("preview-ruler-x-cursor");
    const ry = document.getElementById("preview-ruler-y-cursor");
    const rulerBottom = document.getElementById("preview-ruler-bottom");
    const rulerLeft = document.getElementById("preview-ruler-left");
    if (!dot || !rx || !ry) return null;
    const dr = dot.getBoundingClientRect();
    const cx = dr.left + dr.width / 2;
    const cy = dr.top + dr.height / 2;
    const rxLeft = Number.parseFloat(rx.style.left || "NaN");
    const ryTop = Number.parseFloat(ry.style.top || "NaN");
    const rb = rulerBottom ? rulerBottom.getBoundingClientRect() : null;
    const rl = rulerLeft ? rulerLeft.getBoundingClientRect() : null;
    return { cx, cy, rxLeft, ryTop, rb, rl };
  });
  assert(rulerSnapCheck && Number.isFinite(rulerSnapCheck.rxLeft) && Number.isFinite(rulerSnapCheck.ryTop), "ruler cursor style 坐标必须存在");
  assert(rulerSnapCheck.rb && rulerSnapCheck.rl, "ruler DOM 必须存在");
  assert(Math.abs(rulerSnapCheck.rxLeft - (rulerSnapCheck.cx - rulerSnapCheck.rb.x)) <= 1.2, "x ruler cursor 必须穿过入口黄点中心（<=1px）");
  assert(Math.abs(rulerSnapCheck.ryTop - (rulerSnapCheck.cy - rulerSnapCheck.rl.y)) <= 1.2, "y ruler cursor 必须穿过入口黄点中心（<=1px）");
  await page.mouse.click(entryCoreCenter.x, entryCoreCenter.y);
  await page.waitForTimeout(120);
  const detailAfterEntry = await page.$eval("#cell-detail-panel", (el) => el.textContent || "");
  assert(detailAfterEntry.includes("覆盖范围"), "点击真实地图入口节点后右侧详情应包含「覆盖范围」");

  // Gesture arbitration: tap selects, drag pans without selecting
  const beforeDetail = await page.$eval("#cell-detail-panel", (el) => el.textContent || "");
  await page.mouse.move(svgBox.x + svgBox.width * 0.52, svgBox.y + svgBox.height * 0.52);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(120);
  const afterDetailTap = await page.$eval("#cell-detail-panel", (el) => el.textContent || "");
  assert(afterDetailTap !== beforeDetail, "tap/select 后右侧详情应更新（不应依赖 click）");
  // If an entry node exists, detail panel should include nodeType/mapId after tapping near it.
  // We don't force always, but ensure the fields exist.
  assert(afterDetailTap.includes("节点类型") || afterDetailTap.includes("mapId") || afterDetailTap.includes("terrainId"), "右侧详情缺少关键字段");

  const m0 = await page.$eval("#debug-metrics", (el) => el.textContent || "");
  await page.mouse.move(svgBox.x + svgBox.width * 0.52, svgBox.y + svgBox.height * 0.52);
  await page.mouse.down();
  await page.mouse.move(svgBox.x + svgBox.width * 0.52 + 40, svgBox.y + svgBox.height * 0.52 + 0);
  await page.mouse.up();
  await page.waitForTimeout(120);
  const m1 = await page.$eval("#debug-metrics", (el) => el.textContent || "");
  const off0 = (m0.match(/offsetX=([-0-9.]+)/) || [])[1];
  const off1 = (m1.match(/offsetX=([-0-9.]+)/) || [])[1];
  assert(off0 && off1 && off0 !== off1, "drag 后 offsetX 应变化");
  const afterDetailDrag = await page.$eval("#cell-detail-panel", (el) => el.textContent || "");
  assert(afterDetailDrag === afterDetailTap, "drag/pan 不应触发新的详情选择");

  // Label text on canvas must not include long internal ids.
  assert(!/\bwest2_/.test(String(geom?.labelText || "")), "地图标签不允许出现 west2_ 之类内部 id");
  assert(!/_/.test(String(geom?.labelText || "")), "地图标签不允许出现下划线 id");

  // Leave viewport should hide custom pointer overlay.
  await page.mouse.move(svgBox.x - 8, svgBox.y - 8);
  await page.waitForTimeout(80);
  const pointerOverlayStateAfterLeave = await page.evaluate(() => {
    const dot = document.getElementById("preview-pointer-dot");
    const rx = document.getElementById("preview-ruler-x-cursor");
    const ry = document.getElementById("preview-ruler-y-cursor");
    return {
      dotVisible: Boolean(dot && dot.classList.contains("is-visible")),
      rxVisible: Boolean(rx && rx.classList.contains("is-visible")),
      ryVisible: Boolean(ry && ry.classList.contains("is-visible"))
    };
  });
  assert(!pointerOverlayStateAfterLeave.dotVisible, "pointerleave 后 pointer dot 应隐藏");
  assert(!pointerOverlayStateAfterLeave.rxVisible, "pointerleave 后 x ruler cursor 应隐藏");
  assert(!pointerOverlayStateAfterLeave.ryVisible, "pointerleave 后 y ruler cursor 应隐藏");
  await browser.close();
  // Return baseline metrics taken before gesture tests affect camera.
  return { metricsText: String(baselineText), geom };
}

async function main() {
  const protectedBefore = await snapshotHashes(PROTECTED);
  const extraBefore = await snapshotHashes(EXTRA_MONITOR);

  const run = spawnSync(EXPORTER_CMD[0], EXPORTER_CMD[1], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "pipe"
  });
  if (run.status !== 0) {
    const out = String(run.stdout ?? "");
    const err = String(run.stderr ?? "");
    throw new Error(
      `exporter 执行失败（exit=${run.status}）\n--- stdout ---\n${out}\n--- stderr ---\n${err}`
    );
  }

  const protectedAfter = await snapshotHashes(PROTECTED);
  const extraAfter = await snapshotHashes(EXTRA_MONITOR);

  const protectedChanged = diffHashMaps(protectedBefore, protectedAfter);
  assert(protectedChanged.length === 0, `受保护路径发生改动（不允许）：\n${protectedChanged.join("\n")}`);

  const extraChanged = diffHashMaps(extraBefore, extraAfter);
  const extraNotAllowed = extraChanged.filter(
    (p) => p !== ALLOWED_TEMP_OUTPUT && p !== ALLOWED_STABLE_INDEX && p !== ALLOWED_SCRIPT_1 && p !== ALLOWED_SCRIPT_2
  );
  assert(
    extraNotAllowed.length === 0,
    `非允许文件发生改动（不允许）：\n${extraNotAllowed.join("\n")}\n\n允许变动：\n- ${ALLOWED_TEMP_OUTPUT}\n- ${ALLOWED_SCRIPT_1}\n- ${ALLOWED_SCRIPT_2}`
  );

  // Step 2.5: stable entry files exist (exporter run should not delete them)
  await assertFileExists(OUTPUT_HTML, "审计输出 HTML");
  await assertFileExists(STABLE_INDEX_HTML, "稳定入口 index.html");
  await assertFileExists(STABLE_README, "稳定入口 README.md");
  await assertFileExists(STABLE_CMD_OPEN, "启动 cmd");
  await assertFileExists(STABLE_CMD_REFRESH, "刷新 cmd");

  // HTML existence + content checks (audit output)
  const html = await readTextIfExists(OUTPUT_HTML);
  assert(html != null, `HTML 不存在：${OUTPUT_HTML}`);
  containsAll(
    html,
    [
      "野外向量地图预览器",
      "West2 · 旧标记杆巡查线",
      "west2_old_marker_patrol_line",
      "metersPerCell",
      "150",
      "wilderness_runtime",
      "maintenance_corridor_entry",
      "维修通道外门",
      "west2_maintenance_corridor_entry",
      "离线只读作者工具",
      "不是玩家小地图",
      "不是地图编辑器",
      "不写回 data",
      "data-x",
      "data-y",
      "data-terrain-id",
      "地貌图例",
      "cell-detail-panel",
      "行进耗时倍率",
      "体力消耗倍率",
      "搜救难度",
      "简明识图",
      "preview-mode-switch",
      "data-preview-action=\"set-preview-mode\""
    ],
    "HTML"
  );

  // stable index content checks
  const stableHtml = await readTextIfExists(STABLE_INDEX_HTML);
  assert(stableHtml != null, `稳定入口 HTML 不存在：${STABLE_INDEX_HTML}`);
  assertHtmlNoForbiddenFileNavigation(stableHtml, "稳定入口 HTML");
  assertAllButtonsAreTypeButton(stableHtml, "稳定入口 HTML");
  assertNoVectorGroupTransform(stableHtml, "稳定入口 HTML");
  containsAll(
    stableHtml,
    ["isPreviewCameraReady", "fitToBounds skipped", "renderRulers skipped", "passive: false", "requestAnimationFrame"],
    "稳定入口 HTML（初始化门禁）"
  );
  containsAll(
    stableHtml,
    [
      // Coordinate contract (px per world unit)
      "x: wx * cameraState.scale + cameraState.offsetX",
      "y: -wy * cameraState.scale + cameraState.offsetY",
      "x: (sx - cameraState.offsetX) / cameraState.scale",
      "y: -(sy - cameraState.offsetY) / cameraState.scale",
      "visibleMinX = gridVm.bounds.minX - 0.5",
      "visibleMaxX = gridVm.bounds.maxX + 0.5",
      "visibleMinY = gridVm.bounds.minY - 0.5",
      "visibleMaxY = gridVm.bounds.maxY + 0.5",
      "minScale = fitScale * 0.25",
      "maxScale = fitScale * 8",
      "function setCameraCenter"
    ],
    "稳定入口 HTML（坐标合同）"
  );
  assert(!stableHtml.includes("STEP_PX"), "稳定入口 HTML 不应包含 STEP_PX（矢量相机/尺子/fit 禁止参与）");
  containsAll(
    stableHtml,
    [
      "野外向量地图预览器",
      "West2 · 旧标记杆巡查线",
      "离线只读作者工具",
      "不是玩家小地图",
      "不是地图编辑器",
      "地貌图例",
      "cell-detail-panel"
    ],
    "稳定入口 HTML"
  );

  // Step 3: semantic layer assertions
  containsAll(
    stableHtml,
    [
      "preview-workbench",
      "preview-toolbar",
      "preview-main",
      "preview-map-pane",
      "preview-sidebar",
      "preview-sidebar-tabs",
      "preview-appendix",
      "当前格",
      "地标",
      "图例",
      "审计",
      "档案",
      "收起侧栏",
      "展开档案栏",
      "搜索坐标 / 地标 / 地貌 / 字段",
      "search-index",
      "search-results",
      "坐标结果",
      "地标结果",
      "地貌结果",
      "字段结果",
      "审计问题结果",
      "audit-panel",
      "红色：必须修",
      "黄色：建议检查",
      "灰色：信息提示",
      "gotoMapId",
      "terrainId",
      "rescueDifficulty",
      "moveTimeMult",
      "staminaCostMult",
      "detectRadius",
      "enterRadius",
      "semantic-layer",
      "semantic-zone",
      "semantic-floating-label",
      "围栏式",
      "区域语义层",
      "已实装地点",
      "区域语义",
      "通用段",
      "标记杆巡查线",
      "维修通道外门",
      "west2_maintenance_corridor_entry",
      "地貌层",
      "地标层",
      "风险层",
      "只读展示推断"
    ],
    "稳定入口 HTML（Step 3）"
  );
  containsAll(stableHtml, ["implemented-location", "gotoMapId", "已实装"], "稳定入口 HTML（implemented marker）");
  containsAll(stableHtml, ["common-travel-segment", "通用赶路段"], "稳定入口 HTML（common segment）");
  containsAll(stableHtml, ["data-preview-action", "preventDefault", "stopPropagation"], "稳定入口 HTML（离线交互收口）");
  containsAll(stableHtml, ["wilderness-search-index"], "稳定入口 HTML（内嵌 JSON）");
  // Camera / stage / rulers / north indicator assertions (static)
  containsAll(
    stableHtml,
    [
      "cameraState",
      "resetCameraToDefault",
      "screenToWorld",
      "worldToScreen",
      "preview-stage",
      "preview-ruler-left",
      "preview-ruler-bottom",
      "preview-overlay-north",
      "↑N"
    ],
    "稳定入口 HTML（camera/ruler/north）"
  );
  containsAll(
    stableHtml,
    ["debug-metrics", "computeMapScreenBounds", "shortSideCoverageRatio", "renderVectorMap", "renderAll"],
    "稳定入口 HTML（渲染链/调试指标）"
  );
  containsAll(stableHtml, ["preview-theme-toggle", "toggle-theme", "data-preview-theme=\"dark\""], "稳定入口 HTML（theme toggle / dark theme）");
  assert(!stableHtml.includes("filter: invert"), "稳定入口 HTML 禁止使用 filter: invert");
  containsAll(stableHtml, ["v-label-chip", "v-label-leader"], "稳定入口 HTML（标签牌/引导线）");
  containsAll(stableHtml, ["preview-hover-tooltip"], "稳定入口 HTML（hover tooltip DOM）");
  containsAll(stableHtml, ["pointer-events:none", "pointermove", "screenToWorld"], "稳定入口 HTML（hover 行为）");
  containsAll(
    stableHtml,
    ["preview-pointer-dot", "preview-ruler-x-cursor", "preview-ruler-y-cursor"],
    "稳定入口 HTML（自定义指针 overlay DOM）"
  );
  containsAll(
    stableHtml,
    ["updatePreviewPointerOverlay", "hidePreviewPointerOverlay"],
    "稳定入口 HTML（自定义指针 overlay 行为）"
  );
  containsAll(stableHtml, [".preview-svg-viewport", "cursor: none"], "稳定入口 HTML（画布内 cursor:none）");
  assert(!stableHtml.includes("cursor: grab"), "稳定入口 HTML 禁止 cursor: grab");
  assert(!stableHtml.includes("cursor: grabbing"), "稳定入口 HTML 禁止 cursor: grabbing");
  containsAll(stableHtml, ["gestureState", "DRAG_THRESHOLD_PX", "hitTestPreviewAtScreen", "onPreviewPointerUp"], "稳定入口 HTML（手势仲裁）");
  assert(!stableHtml.includes("setPointerCapture(e.pointerId)"), "不允许 pointerdown 立即 setPointerCapture");
  containsAll(stableHtml, ["isRealMapEntryNode", "getEntryNodeDisplayLabel", "preview-node--entry", "preview-node-entry-core", "preview-node-entry-inner-glow"], "稳定入口 HTML（入口节点样式）");
  containsAll(stableHtml, ["x + 0.5", "minX - 0.5"], "稳定入口 HTML（格边界 half-step 口径）");
  containsAll(stableHtml, ["v-layer-entry-footprint", "preview-entry-footprint", "buildEntryNodeFootprint", "renderEntryFootprints"], "稳定入口 HTML（入口覆盖 footprint）");
  containsAll(stableHtml, ["--preview-entry-footprint-fill", "--preview-entry-footprint-stroke"], "稳定入口 HTML（footprint 主题变量）");
  assert(stableHtml.includes(".preview-entry-footprint") && stableHtml.includes("pointer-events: none"), "footprint 必须为 pointer-events:none");
  assert(!stableHtml.includes("维修通道外门·west2_maintenance_corridor_entry"), "不允许画布常显长串入口文案");
  containsAll(stableHtml, ["preview-mode-switch", "preview-mode-segment", "data-preview-action=\"set-preview-mode\"", "data-preview-mode=\"vector\"", "data-preview-mode=\"grid\""], "稳定入口 HTML（segmented 预览模式开关）");
  assert(!stableHtml.includes("data-preview-action=\"switch-preview-mode\""), "不允许保留旧的 switch-preview-mode 按钮入口");
  assert(
    !stableHtml.includes(".vector-preview{display:none; width: max-content;}") &&
      !stableHtml.includes(".vector-preview{display:none; width:max-content;}"),
    "稳定入口 HTML 不允许 vector-preview 使用 width:max-content（会导致矢量容器收缩）"
  );
  assert(!stableHtml.includes('width="240" height="22"'), "节点 chip 不允许固定 240px 长条（应有宽度限制）");
  // entry node no longer renders long chip on canvas; keep only minimal safeguard that old long chip doesn't reappear.
  assert(!stableHtml.includes("v-node-chip") || !stableHtml.includes("width=\"240\""), "不允许回退到长条节点 chip");

  // README checks
  const readme = await readTextIfExists(STABLE_README);
  assert(readme != null, `README 不存在：${STABLE_README}`);
  containsAll(readme, ["怎么打开", "怎么刷新", "不能编辑地图", "不写回 data", "不是玩家小地图"], "README");
  containsAll(readme, ["区域语义层", "围栏式填色", "漂浮中文标签", "已实装地点", "通用段"], "README（Step 3）");
  containsAll(readme, ["字段名搜索", "字段值搜索", "审计面板", "红 / 黄 / 灰", "不能编辑地图", "不写回 data"], "README（Step 4）");
  containsAll(readme, ["地图为中心", "右侧栏可折叠", "合同状态", "底部附录", "搜索在顶部工具栏"], "README（布局）");

  // cmd checks
  const cmdOpen = await readTextIfExists(STABLE_CMD_OPEN);
  assert(cmdOpen != null, `启动 cmd 不存在：${STABLE_CMD_OPEN}`);
  containsAll(cmdOpen, ["index.html"], "启动 cmd");

  const cmdRefresh = await readTextIfExists(STABLE_CMD_REFRESH);
  assert(cmdRefresh != null, `刷新 cmd 不存在：${STABLE_CMD_REFRESH}`);
  containsAll(cmdRefresh, ["wilderness_area_preview_export.mjs"], "刷新 cmd");

  // Step 2: terrain short labels at least 5 (by containment)
  const shortNames = ["压实道", "标记线", "硬雪", "松雪", "雪垄", "雪窝", "裂隙", "冰架边", "岩脊", "冰崖"];
  const hitCount = shortNames.reduce((acc, n) => acc + (html.includes(n) ? 1 : 0), 0);
  assert(hitCount >= 5, `HTML 地貌中文短名不足 5 个（命中=${hitCount}）：${shortNames.join("、")}`);

  // Grid mode must not render per-cell text labels.
  assert(!html.includes('class="cell-label"'), "格点模式不允许逐格常驻 cell-label 文本");
  assert(!html.includes('id="wilderness-preview-map"'), "格点模式不允许渲染旧版 wilderness-preview-map 容器（只能用 SVG grid）");
  assert(!html.includes('class="wilderness-cell'), "格点模式不允许渲染旧版 .wilderness-cell 逐格 DOM（只能用 SVG grid）");
  containsAll(stableHtml, ["gridViewport", "gridWorldToScreen", "gridScreenToWorld", "screenToCell"], "格点模式必须有统一坐标转换与 viewport 状态");
  containsAll(stableHtml, ["grid-preview-toolbar", "grid-zoom-in", "grid-zoom-out", "grid-fit", "grid-reset"], "格点模式必须有视口工具条控件");

  // Mode isolation (static)
  containsAll(
    stableHtml,
    ["getActivePreviewMode", "isGridModeActive", "isVectorModeActive"],
    "预览模式必须有统一 helper"
  );
  containsAll(
    stableHtml,
    ["onPreviewViewportPointerMove", "onPreviewViewportPointerDown", "onPreviewViewportPointerUp"],
    "pointer 事件必须经由统一入口分流"
  );
  containsAll(stableHtml, ["renderGridRulers", "renderVectorRulers", "renderActiveRulers"], "ruler 必须按 mode 分离/分流");
  const mGridRulers = stableHtml.match(/function\s+renderGridRulers\s*\([\s\S]*?\n\s*\}/m);
  assert(mGridRulers && mGridRulers[0], "必须存在 renderGridRulers() 源码块");
  const gridRulersSrc = mGridRulers[0];
  assert(!/cameraState/.test(gridRulersSrc), "renderGridRulers 不得使用 cameraState");
  assert(/gridWorldToScreen/.test(gridRulersSrc), "renderGridRulers 必须使用 gridWorldToScreen");
  assert(/gridScreenToWorld/.test(gridRulersSrc), "renderGridRulers 必须使用 gridScreenToWorld");
  containsAll(stableHtml, ["updateGridHoverFromPointer", "updateGridPointerOverlay"], "grid hover/pointer overlay 必须独立实现");
  assert(/updateGridHoverFromPointer[\s\S]*screenToCell/.test(stableHtml), "grid tooltip 坐标必须来自 screenToCell");

  // Step 2: terrain class assertions
  assert(html.includes("terrain-managed"), "HTML 缺少 terrain-managed（压实道 class）");
  assert(html.includes("terrain-marker"), "HTML 缺少 terrain-marker（标记线 class）");
  assert(
    countUniqueTerrainClasses(html) >= 5,
    `HTML terrain class 类别不足 5 类（unique=${countUniqueTerrainClasses(html)}）`
  );

  // exporter source checks
  const exporterSrc = await fs.readFile(EXPORTER, "utf8");
  assert(!exporterSrc.includes("STEP_PX"), "exporter 源码不应包含 STEP_PX（矢量坐标合同已统一）");
  assert(!exporterSrc.includes("v-camera-group"), "exporter 源码不应包含 v-camera-group（禁止整组相机 transform）");
  assert(!exporterSrc.includes("setAttribute(\"transform\""), "exporter 源码不应包含 setAttribute(\"transform\")（矢量必须逐点 worldToScreen）");
  assert(!exporterSrc.includes("scale(cameraState.scale"), "exporter 源码不应包含 scale(cameraState.scale（禁止整组翻转/缩放）");
  assert(!exporterSrc.includes("scale(scale, -scale)"), "exporter 源码不应包含 scale(scale, -scale)（禁止整组翻转）");
  const forbidden = [
    "renderer.js",
    "dispatch.js",
    "commit.js",
    "resolve_handlers",
    "src/save",
    "src/ui"
  ];
  for (const f of forbidden) {
    assert(!exporterSrc.includes(f), `exporter 源码包含禁止 import 字符串：${JSON.stringify(f)}`);
  }

  // no writeback to data/wilderness (allow mentioning source paths in evidence; forbid write target)
  assert(
    !/writeFile\s*\([\s\S]*data[\\/]+wilderness/i.test(exporterSrc),
    "exporter 源码疑似包含写回 data/wilderness 的写入目标（writeFile(...data/wilderness...)）"
  );

  assert(!exporterSrc.includes("WILDERNESS_CALL_RESCUE"), "exporter 源码包含禁止字符串 WILDERNESS_CALL_RESCUE");
  assert(
    !exporterSrc.includes("WILDERNESS_"),
    "exporter 源码疑似包含 runtime action 逻辑（出现 WILDERNESS_* 字符串）"
  );

  // Step 4: real derived samples from embedded search-index (no hardcoded fake coordinate)
  const searchIndex = extractJsonScript(stableHtml, "wilderness-search-index");
  assert(searchIndex && Array.isArray(searchIndex.entries), "稳定入口 HTML 缺少可解析的 search-index");
  const coordEntry = searchIndex.entries.find((e) => e && e.type === "coordinate" && typeof e.value === "string");
  assert(coordEntry, "search-index 缺少 coordinate entry");
  assert(/^[-]?\d+\s*,\s*[-]?\d+$/.test(coordEntry.value), `coordinate entry 格式不合法：${String(coordEntry.value)}`);

  const terrainEntry = searchIndex.entries.find((e) => e && e.type === "terrain" && typeof e.value === "string" && e.value.length > 0);
  assert(terrainEntry, "search-index 缺少 terrain entry");

  // required landmark samples in HTML (already checked above) + ensure present in index too
  const lmId = "maintenance_corridor_entry";
  const lmInIndex = searchIndex.entries.some((e) => e && e.type === "landmark" && e.value === lmId);
  assert(lmInIndex, "search-index 缺少 maintenance_corridor_entry 地标条目");

  // Vector preview: VM + output should not be per-cell repeated labels.
  const vectorVm = extractJsonScript(stableHtml, "wilderness-vector-vm");
  assert(vectorVm && Array.isArray(vectorVm.regions), "缺少 wilderness-vector-vm 或 regions");
  assert(vectorVm.regions.length > 0, "vectorVm.regions 为空");
  const cellCount = vectorVm.regions.reduce((acc, r) => acc + Number(r.cellCount ?? 0), 0);
  const labelCount = (vectorVm.regions?.length ?? 0) + (vectorVm.mapNodes?.length ?? 0) + (vectorVm.lineFeatures?.length ?? 0);
  assert(labelCount < Math.max(10, cellCount / 4), `矢量模式标签数量过多（label=${labelCount}, cell=${cellCount}）`);
  // each region should have boundary rings or at least some ring points
  for (const r of vectorVm.regions) {
    assert(Array.isArray(r.rings) && r.rings.length > 0, `region 缺少 rings：${String(r.terrainId)}`);
  }
  // Vector VM ring range must be normalized to world edges (center ± 0.5).
  let minRX = Infinity,
    maxRX = -Infinity,
    minRY = Infinity,
    maxRY = -Infinity;
  for (const r of vectorVm.regions) {
    for (const ring of r.rings ?? []) {
      for (const p of ring ?? []) {
        if (!p) continue;
        if (Number.isFinite(p.x)) {
          minRX = Math.min(minRX, p.x);
          maxRX = Math.max(maxRX, p.x);
        }
        if (Number.isFinite(p.y)) {
          minRY = Math.min(minRY, p.y);
          maxRY = Math.max(maxRY, p.y);
        }
      }
    }
  }
  assert(Number.isFinite(minRX) && Number.isFinite(maxRX), "vector rings x 范围不可用（NaN）");
  assert(Number.isFinite(minRY) && Number.isFinite(maxRY), "vector rings y 范围不可用（NaN）");
  assert(minRX <= -8.5 + 1e-9, `vector rings minX 未覆盖 -8.5（minX=${minRX}）`);
  assert(maxRX >= 8.5 - 1e-9, `vector rings maxX 未覆盖 8.5（maxX=${maxRX}）`);
  assert(minRY <= -8.5 + 1e-9, `vector rings minY 未覆盖 -8.5（minY=${minRY}）`);
  assert(maxRY >= 8.5 - 1e-9, `vector rings maxY 未覆盖 8.5（maxY=${maxRY}）`);
  // flagged_marker_line should be lineFeatures, not region fill
  const hasFlagAsRegion = vectorVm.regions.some((r) => r && r.terrainId === "flagged_marker_line");
  assert(!hasFlagAsRegion, "flagged_marker_line 不应作为 regions 面状填充");
  const hasFlagLine = Array.isArray(vectorVm.lineFeatures) && vectorVm.lineFeatures.some((l) => l && l.terrainId === "flagged_marker_line");
  assert(hasFlagLine, "flagged_marker_line 必须进入 lineFeatures");
  // mapId nodes
  assert(Array.isArray(vectorVm.mapNodes) && vectorVm.mapNodes.length > 0, "mapNodes 为空（应包含 gotoMapId 地标）");

  // U-shape fixture: low-cost algorithm check (no browser)
  const { makeUShapeFixture, analyzeFixtureRegion } = await import("../tools/wilderness_area_preview/vector_preview_vm.mjs");
  const uCells = makeUShapeFixture();
  const analysis = analyzeFixtureRegion(uCells);
  assert(analysis.rings && analysis.rings.length >= 1, "U 形 fixture 必须产出至少 1 个 ring");
  assert(analysis.anchorInside, "U 形 fixture 的 label anchor 必须落在 region 内");
  assert(!analysis.gapFilled, "U 形 fixture 缺口不应被填充为 cell");
  assert(analysis.hasConcavePoint, "U 形 fixture ring 应保留内凹边（未检测到凹口相关点）");
  assert(analysis.normalizedRings && analysis.normalizedRings.length >= 1, "U 形 fixture 应提供 normalizedRings");

  // Runtime metrics via Playwright (file://): must satisfy on-load acceptance.
  const { metricsText: metrics, geom } = await extractDebugMetricsWithPlaywright(STABLE_INDEX_HTML);
  assert(metrics.includes("viewportWidth=") && metrics.includes("fitScale"), "debug-metrics 缺少关键字段（viewport/fitScale）");
  assert(metrics.includes("visibleWorldRange"), "debug-metrics 缺少 visibleWorldRange");
  assert(metrics.includes("mapShortSideCoverageRatio="), "debug-metrics 缺少 mapShortSideCoverageRatio");
  assert(metrics.includes("xTickLabels") && metrics.includes("yTickLabels"), "debug-metrics 缺少 tick labels");
  assert(metrics.includes("errors="), "debug-metrics 缺少 errors 列表");
  assert(!metrics.includes("FAIL:"), "debug-metrics 默认视图存在 FAIL：\n" + metrics);

  // DOM geometry assertions (real visible rects)
  assert(geom && geom.viewport && geom.host && geom.svg, "DOM 几何取证缺失（viewport/host/svg）");
  const vp = geom.viewport;
  const host = geom.host;
  const svg = geom.svg;
  const eps = 2.0;
  function near(a, b) { return Math.abs(a - b) <= eps; }
  assert(near(host.width, vp.width), `#vector-preview width 未贴合 viewport（host=${host.width}, vp=${vp.width}）`);
  assert(near(host.height, vp.height), `#vector-preview height 未贴合 viewport（host=${host.height}, vp=${vp.height}）`);
  assert(near(svg.width, vp.width), `#vector-preview-svg width 未贴合 viewport（svg=${svg.width}, vp=${vp.width}）`);
  assert(near(svg.height, vp.height), `#vector-preview-svg height 未贴合 viewport（svg=${svg.height}, vp=${vp.height}）`);
  assert(near(svg.x, vp.x) && near(svg.y, vp.y), `SVG rect.x/y 未贴合 viewport（svg=(${svg.x},${svg.y}) vp=(${vp.x},${vp.y})）`);

  // Combined visible content bounds must not be tiny top-left cluster.
  const c = geom.combinedCore || geom.combined;
  assert(c && c.count > 0, `SVG 内容 DOM bounds 为空（counts=${JSON.stringify(geom.counts)}）`);
  const shortSide = Math.min(svg.width, svg.height);
  const contentShort = Math.min(c.width, c.height);
  const ratio = contentShort / Math.max(1, shortSide);
  assert(ratio >= 0.70, `真实 SVG 内容覆盖率不足（ratio=${ratio.toFixed(4)} content=${contentShort.toFixed(2)} shortSide=${shortSide.toFixed(2)}）`);
  const dx = Math.abs(c.cx - (svg.x + svg.width / 2));
  const dy = Math.abs(c.cy - (svg.y + svg.height / 2));
  assert(Math.max(dx, dy) <= 12, `真实 SVG 内容中心偏离过大（dx=${dx.toFixed(2)} dy=${dy.toFixed(2)}）`);

  process.stdout.write("\n--- dom-rect (runtime) ---\n" + JSON.stringify({ viewport: vp, vectorPreview: host, svg, combined: geom.combined, combinedCore: c, counts: geom.counts }, null, 2) + "\n--- end dom-rect ---\n\n");
  process.stdout.write("\n--- debug-metrics (runtime) ---\n" + metrics.trim() + "\n--- end debug-metrics ---\n\n");

  // Layout: map must appear before appendix full contract explanation
  const mapPos = stableHtml.indexOf("wilderness-preview-map");
  const appendixPos = stableHtml.indexOf("合同状态完整说明");
  assert(mapPos >= 0 && appendixPos >= 0, "缺少 map 或 附录标题用于顺序检查");
  assert(mapPos < appendixPos, "地图画布必须出现在合同状态完整说明之前");

  process.stdout.write("OK: wilderness_area_preview_contract_check passed.\n");
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + "\n");
  process.exitCode = 1;
});

