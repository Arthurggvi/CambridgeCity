import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const SERVER_PORT = 5500;
const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;
const OUTPUT = {
  bundle: path.join(ROOT, "temp_choices_finish_source_bundle.md"),
  evidence: path.join(ROOT, "temp_choices_finish_raw_evidence.json"),
  trace: path.join(ROOT, "temp_choices_finish_perf_trace.json"),
  focus: path.join(ROOT, "temp_choices_finish_perf_focus.json")
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
      // retry until timeout
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

function sliceCssBlock(text, startMarker) {
  const start = text.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Missing CSS block start: ${startMarker}`);
  }
  let depth = 0;
  let end = -1;
  for (let index = start; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }
  if (end < 0) {
    throw new Error(`Unclosed CSS block: ${startMarker}`);
  }
  return text.slice(start, end).trimEnd();
}

function codeBlock(title, language, content) {
  return [
    `## ${title}`,
    "",
    `\`\`\`${language}`,
    String(content || "").trimEnd(),
    "\`\`\`",
    ""
  ].join("\n");
}

async function buildSourceBundle() {
  const sceneTextDom = await readFile("src/engine/render/scene_text_fx_dom.js");
  const rendererText = await readFile("src/engine/renderer.js");
  const styleText = await readFile("style.css");
  const interactionText = await readFile("src/ui/interaction.js");

  const blocks = [
    "# Choices Finish Source Bundle",
    "",
    "- Requested scope only.",
    "- `.choice` selector/class lookup: no hits in `style.css` or `src/**`; runtime button rows are `button.journal-action`.",
    ""
  ];

  blocks.push(codeBlock(
    "src/engine/render/scene_text_fx_dom.js :: primeActionsHidden",
    "js",
    sliceBetween(sceneTextDom, "function primeActionsHidden(actionsHost, actionsFadeMs, translatePx = 4) {", "function beginActionsReveal(actionsHost, revealMs, translatePx = 4, extra = {}) {")
  ));
  blocks.push(codeBlock(
    "src/engine/render/scene_text_fx_dom.js :: beginActionsReveal",
    "js",
    sliceBetween(sceneTextDom, "function beginActionsReveal(actionsHost, revealMs, translatePx = 4, extra = {}) {", "function commitActionsRevealDone(actionsHost, extra = {}) {")
  ));
  blocks.push(codeBlock(
    "src/engine/render/scene_text_fx_dom.js :: commitActionsRevealDone",
    "js",
    sliceBetween(sceneTextDom, "function commitActionsRevealDone(actionsHost, extra = {}) {", "function commitActionsFallbackVisible(actionsHost, extra = {}) {")
  ));
  blocks.push(codeBlock(
    "src/engine/render/scene_text_fx_dom.js :: commitActionsFallbackVisible",
    "js",
    sliceBetween(sceneTextDom, "function commitActionsFallbackVisible(actionsHost, extra = {}) {", "function revealActionsWithFade(actionsHost, revealMs, onUnlocked) {")
  ));
  blocks.push(codeBlock(
    "src/engine/render/scene_text_fx_dom.js :: completePlayback",
    "js",
    sliceBetween(sceneTextDom, "  const completePlayback = () => {", "  if (finalPlan.type === \"fold_expand\") {")
  ));
  blocks.push(codeBlock(
    "src/engine/render/scene_text_fx_dom.js :: finish",
    "js",
    sliceBetween(sceneTextDom, "  const finish = (didSkip = false) => {", "  const cancelInternal = () => {")
  ));

  blocks.push(codeBlock(
    "style.css :: #choices / [data-scene-text-actions-phase]",
    "css",
    [
      sliceCssBlock(styleText, "#choices {"),
      "",
      sliceCssBlock(styleText, "#choices[data-scene-text-actions-phase=\"hidden\"] {"),
      "",
      sliceCssBlock(styleText, "#choices[data-scene-text-actions-phase=\"revealing\"] {"),
      "",
      sliceCssBlock(styleText, "#choices[data-scene-text-actions-phase=\"revealed\"],"),
      "",
      sliceCssBlock(styleText, "body.settings-reduce-motion #choices[data-scene-text-actions-phase=\"revealing\"] {"),
      "",
      sliceCssBlock(styleText, "@media (prefers-reduced-motion: reduce) {")
    ].join("\n")
  ));
  blocks.push(codeBlock(
    "style.css :: #choices.map-transition / #app.map-transition",
    "css",
    [
      sliceCssBlock(styleText, "#app.map-transition {"),
      "",
      sliceCssBlock(styleText, "#choices.map-transition {")
    ].join("\n")
  ));
  blocks.push(codeBlock(
    "style.css :: #choices button / button.journal-action / hover / active",
    "css",
    [
      sliceCssBlock(styleText, "#choices button {"),
      "",
      sliceCssBlock(styleText, "#choices button:hover {"),
      "",
      sliceCssBlock(styleText, "#choices button:active {"),
      "",
      sliceCssBlock(styleText, "#choices button.journal-action {"),
      "",
      sliceCssBlock(styleText, "#choices button.journal-action::after {"),
      "",
      sliceCssBlock(styleText, "#choices button.journal-action:hover::after {")
    ].join("\n")
  ));
  blocks.push(codeBlock(
    "style.css :: .map-desc / .scene-text-fx-* relevant rules",
    "css",
    [
      sliceCssBlock(styleText, ".map-desc {"),
      "",
      sliceCssBlock(styleText, ".map-desc.scene-text-fx-host {"),
      "",
      sliceCssBlock(styleText, ".map-desc.scene-text-fx-host p.scene-text-fx-paragraph {"),
      "",
      sliceCssBlock(styleText, ".map-desc.scene-text-fx-host p.scene-text-fx-paragraph:last-child {"),
      "",
      sliceCssBlock(styleText, ".map-desc.scene-text-fx-host[data-scene-text-phase=\"done\"] p.scene-text-fx-paragraph,")
    ].join("\n")
  ));

  blocks.push(codeBlock(
    "src/engine/renderer.js :: makeActionButton",
    "js",
    sliceBetween(rendererText, "function makeActionButton(actionId, text, extraClasses = []) {", "function appendMenuMetaFooter(appContainer) {")
  ));
  blocks.push(codeBlock(
    "src/engine/renderer.js :: renderPageViewModel",
    "js",
    sliceBetween(rendererText, "function renderPageViewModel(pageViewModel, appContainer, choicesContainer) {", "function renderMenuPageViewModel(pageViewModel, appContainer, choicesContainer) {")
  ));
  blocks.push(codeBlock(
    "src/engine/renderer.js :: renderMapPageViewModel",
    "js",
    sliceBetween(rendererText, "function renderMapPageViewModel(pageViewModel, appContainer, choicesContainer) {", "function commitSceneTextFxAnimated(contentKey) {")
  ));
  blocks.push(codeBlock(
    "src/engine/renderer.js :: runSceneTextFxForMainMap",
    "js",
    sliceBetween(rendererText, "function runSceneTextFxForMainMap(pageViewModel, appHost, choicesHost) {", "function renderResolvedActionEntries(map, entries, choicesContainer) {")
  ));
  blocks.push(codeBlock(
    "src/engine/renderer.js :: renderResolvedActionEntries",
    "js",
    sliceBetween(rendererText, "function renderResolvedActionEntries(map, entries, choicesContainer) {", "function renderMenuMainActions(choicesContainer) {")
  ));
  blocks.push(codeBlock(
    "src/engine/renderer.js :: createActionGroup + renderActionWidget",
    "js",
    sliceBetween(rendererText, "function createActionGroup(title, kind) {", "function stripActionDurationFromLabel(text) {")
  ));
  blocks.push(codeBlock(
    "src/engine/renderer.js :: render() callsite for runSceneTextFxForMainMap",
    "js",
    sliceBetween(rendererText, "      runSceneTextFxForMainMap(pageViewModel.page, app, choices);", "    const actionDiagnostics = pageViewModel.page?.actionDiagnostics || analyzeActionVisibility(map);")
  ));
  blocks.push(codeBlock(
    "src/ui/interaction.js :: handleGameplayAction + onDelegatedClick + setupInteraction",
    "js",
    sliceBetween(interactionText, "async function handleGameplayAction(route) {", null)
  ));

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

async function installChoicesProbe(page) {
  await page.evaluate(() => {
    const scope = window;
    const ids = new WeakMap();
    let nextId = 0;
    let initialHost = null;
    let initialFirst = null;
    let previousHost = null;
    let previousFirst = null;
    const records = [];
    const events = [];
    const mutations = [];

    const getNodeId = (node) => {
      if (!node) return null;
      if (!ids.has(node)) {
        ids.set(node, ++nextId);
      }
      return ids.get(node);
    };

    const describeNode = (node) => {
      if (!node) return null;
      return `${node.constructor?.name || "Node"}#${getNodeId(node)}`;
    };

    const readStyles = (host, first) => ({
      hostOpacity: host ? getComputedStyle(host).opacity : null,
      hostTransform: host ? getComputedStyle(host).transform : null,
      hostFilter: host ? getComputedStyle(host).filter : null,
      hostTransition: host ? getComputedStyle(host).transition : null,
      firstOpacity: first ? getComputedStyle(first).opacity : null,
      firstTransform: first ? getComputedStyle(first).transform : null,
      firstOutline: first ? getComputedStyle(first).outline : null,
      firstBoxShadow: first ? getComputedStyle(first).boxShadow : null
    });

    const capture = (label) => {
      const host = document.querySelector("#choices");
      const first = host?.querySelector("button, .choice, [data-action-id]") || null;
      if (!initialHost && host) initialHost = host;
      if (!initialFirst && first) initialFirst = first;

      const snapshot = {
        label,
        t: performance.now(),
        hostNode: describeNode(host),
        firstNode: describeNode(first),
        hostNodeId: getNodeId(host),
        firstNodeId: getNodeId(first),
        sameHostAsInitial: !!host && !!initialHost && host === initialHost,
        sameFirstAsInitial: !!first && !!initialFirst && first === initialFirst,
        sameHostAsPrevious: !!host && !!previousHost && host === previousHost,
        sameFirstAsPrevious: !!first && !!previousFirst && first === previousFirst,
        hostConnected: !!host?.isConnected,
        firstConnected: !!first?.isConnected,
        hostHTML: host?.outerHTML || "",
        firstHTML: first?.outerHTML || "",
        hostPhase: host?.dataset?.sceneTextActionsPhase || null,
        hostClassName: host?.className || "",
        hostAriaHidden: host?.getAttribute("aria-hidden") ?? null,
        mapDescPhase: document.querySelector("#app .map-panel .map-desc")?.dataset?.sceneTextPhase || null,
        renderTraceLength: Array.isArray(scope.__RENDER_TRACE__) ? scope.__RENDER_TRACE__.length : 0,
        actionsTraceLength: Array.isArray(scope.__sceneTextActionsTrace) ? scope.__sceneTextActionsTrace.length : 0,
        styles: readStyles(host, first)
      };
      records.push(snapshot);
      previousHost = host || null;
      previousFirst = first || null;
      return snapshot;
    };

    const observer = new MutationObserver((mutationList) => {
      for (const mutation of mutationList) {
        const target = mutation.target;
        const involvesChoices = target === document.body
          || target?.id === "choices"
          || mutation.addedNodes?.[0]?.id === "choices"
          || mutation.removedNodes?.[0]?.id === "choices"
          || Array.from(mutation.addedNodes || []).some((node) => node?.id === "choices" || node?.contains?.(document.getElementById("choices")))
          || Array.from(mutation.removedNodes || []).some((node) => node?.id === "choices");
        if (!involvesChoices) continue;
        mutations.push({
          t: performance.now(),
          type: mutation.type,
          targetNode: describeNode(target),
          targetId: target?.id || null,
          attributeName: mutation.attributeName || null,
          added: Array.from(mutation.addedNodes || []).map(describeNode),
          removed: Array.from(mutation.removedNodes || []).map(describeNode)
        });
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-scene-text-actions-phase", "aria-hidden"]
    });

    scope.__CHOICES_FINISH_PROBE__ = {
      capture,
      getSnapshot() {
        return {
          records: records.slice(),
          events: events.slice(),
          mutations: mutations.slice(),
          currentRenderTraceLength: Array.isArray(scope.__RENDER_TRACE__) ? scope.__RENDER_TRACE__.length : 0,
          currentActionsTraceLength: Array.isArray(scope.__sceneTextActionsTrace) ? scope.__sceneTextActionsTrace.length : 0
        };
      },
      note(kind, extra = {}) {
        events.push({ kind, t: performance.now(), ...extra });
      },
      stop() {
        observer.disconnect();
        return this.getSnapshot();
      }
    };
  });
}

function eventJsonIncludes(event, needles) {
  const text = JSON.stringify(event);
  return needles.some((needle) => text.includes(needle));
}

function summarizeTraceAroundFinish(traceEvents, finishTsMs) {
  const anchorNeedles = [
    "commitActionsRevealDone",
    "completePlayback",
    "notifyAnimationCompleted",
    "src/engine/render/scene_text_fx_dom.js"
  ];
  const anchoredEvent = traceEvents.find((event) => eventJsonIncludes(event, anchorNeedles));
  const finishTsUs = anchoredEvent?.ts
    ? Number(anchoredEvent.ts)
    : Math.round(Number(finishTsMs || 0) * 1000);
  const windowStart = Math.max(0, finishTsUs - 220000);
  const windowEnd = finishTsUs + 220000;
  const interestingNames = new Set([
    "RecalculateStyles",
    "ScheduleStyleRecalculation",
    "UpdateLayoutTree",
    "Layout",
    "Paint",
    "PrePaint",
    "Animation",
    "AnimationFrame",
    "AnimationFrame::Render",
    "FunctionCall",
    "EvaluateScript",
    "EventDispatch"
  ]);
  return traceEvents.filter((event) => {
    const ts = Number(event?.ts || 0);
    if (!Number.isFinite(ts) || ts < windowStart || ts > windowEnd) return false;
    if (interestingNames.has(String(event?.name || ""))) return true;
    return eventJsonIncludes(event, anchorNeedles);
  });
}

async function collectEvidence() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const client = await page.context().newCDPSession(page);
  const traceEvents = [];

  client.on("Tracing.dataCollected", (event) => {
    if (Array.isArray(event?.value)) {
      traceEvents.push(...event.value);
    }
  });

  const tracingComplete = new Promise((resolve) => {
    client.once("Tracing.tracingComplete", resolve);
  });

  await page.goto(`${BASE_URL}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(1200);

  await page.locator("button[data-action-id='menu_new_game']").click();
  await maybeConfirmNewGame(page);

  await page.waitForFunction(() => {
    const menuTitle = document.querySelector("#app .menu-main-title");
    const mapDesc = document.querySelector("#app .map-panel .map-desc");
    return !menuTitle && !!mapDesc;
  }, null, { timeout: 15000 });

  await page.evaluate(() => {
    window.__sceneTextActionsTrace = [];
    window.__sceneTextActionsTraceSeq = 0;
  });
  await installChoicesProbe(page);

  await page.waitForFunction(() => {
    const desc = document.querySelector("#app .map-panel .map-desc");
    return !!desc && desc.dataset.sceneTextPhase === "playing";
  }, null, { timeout: 8000 });
  const playingSnapshot = await page.evaluate(() => window.__CHOICES_FINISH_PROBE__.capture("playing"));

  await page.waitForFunction(() => {
    const trace = Array.isArray(window.__sceneTextActionsTrace) ? window.__sceneTextActionsTrace : [];
    return trace.some((entry) => entry?.source === "beginActionsReveal");
  }, null, { timeout: 8000 });

  await client.send("Tracing.start", {
    transferMode: "ReportEvents",
    categories: [
      "devtools.timeline",
      "blink.user_timing",
      "loading",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-devtools.timeline.frame",
      "disabled-by-default-v8.cpu_profiler"
    ].join(",")
  });

  await page.waitForFunction(() => {
    const trace = Array.isArray(window.__sceneTextActionsTrace) ? window.__sceneTextActionsTrace : [];
    return trace.some((entry) => entry?.source === "actions_reveal.onFinish" || entry?.source === "commitActionsRevealDone");
  }, null, { timeout: 8000 });
  const finishSnapshot = await page.evaluate(() => window.__CHOICES_FINISH_PROBE__.capture("just_finished"));

  await page.waitForTimeout(100);
  const after100Snapshot = await page.evaluate(() => window.__CHOICES_FINISH_PROBE__.capture("after_100ms"));

  await page.waitForTimeout(120);
  await client.send("Tracing.end");
  await tracingComplete;

  const probeState = await page.evaluate(() => window.__CHOICES_FINISH_PROBE__.stop());
  const actionsTrace = await page.evaluate(() => Array.isArray(window.__sceneTextActionsTrace) ? window.__sceneTextActionsTrace : []);
  const renderTraceTail = await page.evaluate(() => Array.isArray(window.__RENDER_TRACE__) ? window.__RENDER_TRACE__.slice(-12) : []);
  const currentMap = await page.evaluate(() => ({
    currentMapId: String(window?.gameState?.currentMapId || "") || null,
    title: document.querySelector("#app .map-name")?.textContent?.trim() || null
  }));

  await browser.close();

  const focusEvents = summarizeTraceAroundFinish(traceEvents, finishSnapshot?.t || 0);
  await fs.writeFile(OUTPUT.trace, JSON.stringify({ traceEvents }, null, 2), "utf8");
  await fs.writeFile(OUTPUT.focus, JSON.stringify({ finishTsMs: finishSnapshot?.t || 0, traceEvents: focusEvents }, null, 2), "utf8");

  return {
    currentMap,
    nodeIdentityFrames: [playingSnapshot, finishSnapshot, after100Snapshot].map((frame) => ({
      label: frame?.label || null,
      t: frame?.t || null,
      hostNode: frame?.hostNode || null,
      firstNode: frame?.firstNode || null,
      hostNodeId: frame?.hostNodeId ?? null,
      firstNodeId: frame?.firstNodeId ?? null,
      sameHostAsInitial: frame?.sameHostAsInitial ?? null,
      sameFirstAsInitial: frame?.sameFirstAsInitial ?? null,
      sameHostAsPrevious: frame?.sameHostAsPrevious ?? null,
      sameFirstAsPrevious: frame?.sameFirstAsPrevious ?? null,
      hostConnected: frame?.hostConnected ?? null,
      firstConnected: frame?.firstConnected ?? null,
      hostHTML: frame?.hostHTML || "",
      firstHTML: frame?.firstHTML || ""
    })),
    computedStyleFrames: [playingSnapshot, finishSnapshot, after100Snapshot].map((frame) => ({
      label: frame?.label || null,
      t: frame?.t || null,
      hostPhase: frame?.hostPhase || null,
      mapDescPhase: frame?.mapDescPhase || null,
      hostAriaHidden: frame?.hostAriaHidden ?? null,
      renderTraceLength: frame?.renderTraceLength ?? null,
      actionsTraceLength: frame?.actionsTraceLength ?? null,
      ...(frame?.styles || {})
    })),
    actionsTrace,
    choicesProbe: probeState,
    renderTraceTail,
    outputFiles: {
      trace: path.basename(OUTPUT.trace),
      focus: path.basename(OUTPUT.focus)
    }
  };
}

async function main() {
  await buildSourceBundle();

  const server = startServer();
  try {
    await waitForServer(`${BASE_URL}/index.html`);
    const evidence = await collectEvidence();
    await fs.writeFile(OUTPUT.evidence, JSON.stringify(evidence, null, 2), "utf8");
    console.log(JSON.stringify({
      ok: true,
      bundle: path.basename(OUTPUT.bundle),
      evidence: path.basename(OUTPUT.evidence),
      trace: path.basename(OUTPUT.trace),
      focus: path.basename(OUTPUT.focus),
      currentMapId: evidence?.currentMap?.currentMapId || null,
      frames: evidence?.nodeIdentityFrames?.map((frame) => ({
        label: frame.label,
        hostNodeId: frame.hostNodeId,
        firstNodeId: frame.firstNodeId,
        sameHostAsInitial: frame.sameHostAsInitial,
        sameFirstAsInitial: frame.sameFirstAsInitial
      })) || []
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