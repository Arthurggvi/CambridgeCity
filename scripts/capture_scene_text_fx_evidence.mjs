import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const SERVER_PORT = 5500;
const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;
const OUTPUT = {
  bundle: path.join(ROOT, "temp_scene_text_fx_map_desc_bundle.md"),
  evidence: path.join(ROOT, "temp_scene_text_fx_map_desc_evidence.json"),
  report: path.join(ROOT, "temp_scene_text_fx_map_desc_report.md"),
  trace: path.join(ROOT, "temp_scene_text_fx_map_desc_trace.json")
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) return;
    } catch (_error) {
      // wait and retry
    }
    await sleep(250);
  }
  throw new Error(`Server not ready within ${timeoutMs}ms: ${url}`);
}

async function readFile(relPath) {
  return fs.readFile(path.join(ROOT, relPath), "utf8");
}

function sliceBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Missing start marker: ${startMarker}`);
  }
  const end = endMarker ? text.indexOf(endMarker, start) : -1;
  if (endMarker && end < 0) {
    throw new Error(`Missing end marker: ${endMarker}`);
  }
  return end >= 0 ? text.slice(start, end).trimEnd() : text.slice(start).trimEnd();
}

function toCodeBlock(relPath, content) {
  return [
    `## ${relPath}`,
    "",
    "```js",
    content.trimEnd(),
    "```",
    ""
  ].join("\n");
}

function toCssBlock(title, content) {
  return [
    `## ${title}`,
    "",
    "```css",
    content.trimEnd(),
    "```",
    ""
  ].join("\n");
}

async function buildSourceBundle() {
  const fullFiles = [
    "src/engine/render/scene_text_fx_dom.js",
    "src/engine/scene_text_chunk_planner.js",
    "src/engine/scene_text_fx_defs.js",
    "src/engine/scene_text_fx_policy.js",
    "src/engine/render/view_models.js"
  ];

  const blocks = ["# Scene Text FX / Map Desc Source Bundle", ""];

  for (const relPath of fullFiles) {
    const content = await readFile(relPath);
    blocks.push(toCodeBlock(relPath, content));
  }

  const rendererText = await readFile("src/engine/renderer.js");
  const renderMapPageSection = sliceBetween(
    rendererText,
    "function renderMapPageViewModel(pageViewModel, appContainer, choicesContainer) {",
    "function commitSceneTextFxAnimated(contentKey) {"
  );
  const runSceneTextFxSection = sliceBetween(
    rendererText,
    "function runSceneTextFxForMainMap(pageViewModel, appHost, choicesHost) {",
    "function renderResolvedActionEntries(map, entries, choicesContainer) {"
  );

  blocks.push(toCodeBlock("src/engine/renderer.js :: renderMapPageViewModel", renderMapPageSection));
  blocks.push(toCodeBlock("src/engine/renderer.js :: runSceneTextFxForMainMap", runSceneTextFxSection));

  const styleText = await readFile("style.css");
  const mapDescSection = sliceBetween(styleText, ".map-desc {", ".map-panel-bus {");
  const actionsSection = sliceBetween(styleText, "#choices.scene-text-fx-actions-hidden {", "#choices .choices-group {");

  blocks.push(toCssBlock("style.css :: .map-desc / .scene-text-fx-* / paragraph class", mapDescSection));
  blocks.push(toCssBlock("style.css :: action area container class", actionsSection));

  await fs.writeFile(OUTPUT.bundle, blocks.join("\n"), "utf8");
}

function startServer() {
  const proc = spawn("node", ["scripts/serve_static.mjs", "--host", "127.0.0.1", "--port", String(SERVER_PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (chunk) => {
    stdout += String(chunk || "");
  });
  proc.stderr.on("data", (chunk) => {
    stderr += String(chunk || "");
  });

  return {
    proc,
    getLogs() {
      return { stdout, stderr };
    }
  };
}

async function maybeConfirmNewGame(page) {
  try {
    await page.waitForSelector("#notice-dialog-host[aria-hidden=\"false\"]", { timeout: 1800 });
    const primary = page.locator("#notice-dialog-host .notice-dialog-btn.is-primary");
    if (await primary.count()) {
      await primary.first().click();
    }
  } catch (_error) {
    // no confirm dialog
  }
}

async function captureSnapshot(page, label) {
  return page.evaluate((snapshotLabel) => {
    const desc = document.querySelector("#app .map-panel .map-desc");
    const choices = document.querySelector("#choices");
    const text = String(desc?.textContent || "").replace(/\s+/g, " ").trim();
    return {
      label: snapshotLabel,
      capturedAtIso: new Date().toISOString(),
      exists: !!desc,
      outerHTML: desc?.outerHTML || "",
      className: desc?.className || "",
      dataset: desc ? { ...desc.dataset } : {},
      style: desc?.getAttribute("style") || "",
      textLength: text.length,
      textPreview: text.slice(0, 160),
      choicesClassName: choices?.className || "",
      choicesAriaHidden: choices?.getAttribute("aria-hidden") || null
    };
  }, label);
}

async function capturePlayingSnapshot(page, beforeSnapshot) {
  let candidate = await captureSnapshot(page, "playing");
  for (let i = 0; i < 10; i++) {
    const changed = String(candidate?.outerHTML || "") !== String(beforeSnapshot?.outerHTML || "");
    const done = String(candidate?.className || "").includes("scene-text-fx-done");
    if (changed && !done) {
      return candidate;
    }
    await page.waitForTimeout(180);
    candidate = await captureSnapshot(page, "playing");
  }
  return candidate;
}

function summarizeTrace(traceEvents) {
  const interestingNames = new Set([
    "Layout",
    "UpdateLayoutTree",
    "RecalculateStyles",
    "ScheduleStyleRecalculation",
    "PrePaint"
  ]);

  const interesting = traceEvents.filter((event) => interestingNames.has(String(event?.name || "")));
  const counts = {};
  for (const event of interesting) {
    const name = String(event?.name || "unknown");
    counts[name] = (counts[name] || 0) + 1;
  }

  return {
    totalTraceEvents: traceEvents.length,
    interestingCounts: counts,
    interestingSamples: interesting.slice(0, 24).map((event) => ({
      name: String(event?.name || ""),
      cat: String(event?.cat || ""),
      ph: String(event?.ph || ""),
      tsUs: Number(event?.ts || 0),
      durUs: Number(event?.dur || 0)
    }))
  };
}

async function collectBrowserEvidence() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const client = await page.context().newCDPSession(page);
  const traceEvents = [];

  page.on("console", () => {
    // keep console noise out of stdout; evidence lives in files
  });

  await page.addInitScript(() => {
    try {
      localStorage.removeItem("sceneTextFxDiagnostic");
      localStorage.removeItem("sceneTextDomProbe");
      localStorage.removeItem("sceneTextHostAudit");
      localStorage.removeItem("sceneTextDomLocator");
      localStorage.setItem("sceneTextReflowProbe", "1");
    } catch (_error) {
      // ignore storage failures
    }
  });

  client.on("Tracing.dataCollected", (event) => {
    if (Array.isArray(event?.value)) {
      traceEvents.push(...event.value);
    }
  });

  const tracingComplete = new Promise((resolve) => {
    client.once("Tracing.tracingComplete", resolve);
  });

  await client.send("Tracing.start", {
    transferMode: "ReportEvents",
    categories: [
      "devtools.timeline",
      "blink.user_timing",
      "loading",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-devtools.timeline.frame"
    ].join(",")
  });

  await page.goto(`${BASE_URL}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(1400);

  await page.locator("button[data-action-id='menu_new_game']").click();
  await maybeConfirmNewGame(page);

  await page.waitForFunction(() => {
    const menuTitle = document.querySelector("#app .menu-main-title");
    const mapDesc = document.querySelector("#app .map-panel .map-desc");
    return !menuTitle && !!mapDesc;
  }, null, { timeout: 15000 });

  const before = await captureSnapshot(page, "before");

  await page.waitForFunction(() => {
    const desc = document.querySelector("#app .map-panel .map-desc");
    return !!desc && desc.classList.contains("scene-text-fx-container") && !desc.classList.contains("scene-text-fx-done");
  }, null, { timeout: 4000 }).catch(() => null);

  const playing = await capturePlayingSnapshot(page, before);

  await page.waitForFunction(() => {
    const desc = document.querySelector("#app .map-panel .map-desc");
    return !!desc && desc.classList.contains("scene-text-fx-done");
  }, null, { timeout: 7000 });

  const done = await captureSnapshot(page, "done");
  const reflowLog = await page.evaluate(() => window.__SCENE_TEXT_REFLOW_LOG || []);
  const buildInfo = await page.evaluate(() => window.__BUILD_INFO__ || null);
  const bootDebug = await page.evaluate(() => window.__BOOT_DEBUG__ || null);
  const currentMap = await page.evaluate(() => ({
    currentMapId: String(window?.gameState?.currentMapId || "") || null,
    title: document.querySelector("#app .map-name")?.textContent?.trim() || null
  }));

  await page.waitForTimeout(300);
  await client.send("Tracing.end");
  await tracingComplete;
  await browser.close();

  const tracePayload = { traceEvents };
  await fs.writeFile(OUTPUT.trace, JSON.stringify(tracePayload, null, 2), "utf8");

  return {
    buildInfo,
    bootDebug,
    currentMap,
    snapshots: { before, playing, done },
    reflowLog,
    traceSummary: summarizeTrace(traceEvents),
    outputFiles: {
      trace: path.basename(OUTPUT.trace)
    }
  };
}

function buildReport(evidence) {
  const snapshotBlock = (title, snapshot) => [
    `## ${title}`,
    "",
    "```html",
    String(snapshot?.outerHTML || "").trim(),
    "```",
    "",
    `- className: ${snapshot?.className || ""}`,
    `- dataset: ${JSON.stringify(snapshot?.dataset || {})}`,
    `- choicesClassName: ${snapshot?.choicesClassName || ""}`,
    ""
  ].join("\n");

  const traceCounts = Object.entries(evidence?.traceSummary?.interestingCounts || {})
    .map(([name, count]) => `- ${name}: ${count}`)
    .join("\n");

  return [
    "# Scene Text FX Map Desc Report",
    "",
    `- generatedAt: ${new Date().toISOString()}`,
    `- baseUrl: ${BASE_URL}`,
    `- currentMapId: ${evidence?.currentMap?.currentMapId || ""}`,
    `- currentMapTitle: ${evidence?.currentMap?.title || ""}`,
    `- traceFile: ${path.basename(OUTPUT.trace)}`,
    `- bundleFile: ${path.basename(OUTPUT.bundle)}`,
    "",
    "## Requested Scope",
    "",
    "- Full source bundle for scene text files and view model",
    "- renderer.js excerpt for .map-desc rendering and scene-text runtime hook",
    "- style.css excerpt for .map-desc / .scene-text-fx-* / action area container classes",
    "- Minimal live evidence with before / playing / done outerHTML",
    "- Chrome trace summary showing layout/style pipeline events",
    "",
    snapshotBlock("OuterHTML Before Animation", evidence?.snapshots?.before),
    snapshotBlock("OuterHTML During Playing", evidence?.snapshots?.playing),
    snapshotBlock("OuterHTML After Done", evidence?.snapshots?.done),
    "## Chrome Trace Summary",
    "",
    traceCounts || "- No Layout/Style events matched the summary filter.",
    "",
    "## Trace Sample Events",
    "",
    "```json",
    JSON.stringify(evidence?.traceSummary?.interestingSamples || [], null, 2),
    "```",
    "",
    "## Reflow Probe Sample",
    "",
    "```json",
    JSON.stringify((evidence?.reflowLog || []).slice(0, 12), null, 2),
    "```",
    ""
  ].join("\n");
}

async function main() {
  await buildSourceBundle();

  const server = startServer();
  try {
    await waitForServer(`${BASE_URL}/index.html`);
    const evidence = await collectBrowserEvidence();
    await fs.writeFile(OUTPUT.evidence, JSON.stringify(evidence, null, 2), "utf8");
    await fs.writeFile(OUTPUT.report, buildReport(evidence), "utf8");
    console.log(JSON.stringify({
      ok: true,
      bundle: path.basename(OUTPUT.bundle),
      evidence: path.basename(OUTPUT.evidence),
      report: path.basename(OUTPUT.report),
      trace: path.basename(OUTPUT.trace),
      currentMapId: evidence?.currentMap?.currentMapId || null,
      traceInterestingCounts: evidence?.traceSummary?.interestingCounts || {}
    }, null, 2));
  } finally {
    server.proc.kill("SIGTERM");
    await sleep(300);
    if (!server.proc.killed) {
      server.proc.kill("SIGKILL");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});