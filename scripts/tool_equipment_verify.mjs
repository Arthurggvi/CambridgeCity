import { spawn } from "child_process";
import { chromium } from "playwright";

/**
 * Tool equipment verifier.
 * Verifies:
 * 1. Different toolTag tools can coexist.
 * 2. Same toolTag equip replaces only the previous same-tag tool.
 * 3. The replaced tool returns to inventory.
 * 4. Tool equip/unequip does not change clothing equipment or thermal aggregation.
 */

const ROOT = process.cwd();
const SERVER_PORT = 5512;
const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;
const TARGET_URL = `${BASE_URL}/index.html?toolEquipVerify=1`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) return;
    } catch {
    }
    await sleep(250);
  }
  throw new Error(`Server not ready within ${timeoutMs}ms: ${url}`);
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

async function waitForPredicate(page, predicate, label, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await page.evaluate(predicate);
    if (ok) return;
    await sleep(100);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function runRuntimeVerifyAction(page, actionId, payload = {}) {
  await page.evaluate(async ({ currentActionId, currentPayload }) => {
    if (typeof window.__CC_TOOL_VERIFY_ACTION__ !== "function") {
      throw new Error("tool verify helper missing");
    }
    await window.__CC_TOOL_VERIFY_ACTION__(currentActionId, currentPayload || {});
  }, { currentActionId: actionId, currentPayload: payload });
}

async function confirmPrimaryNoticeIfVisible(page, timeoutMs = 2500) {
  try {
    await page.waitForSelector("#notice-dialog-host[aria-hidden='false'] .notice-dialog-btn.is-primary", { timeout: timeoutMs });
  } catch {
    return false;
  }
  await page.click("#notice-dialog-host[aria-hidden='false'] .notice-dialog-btn.is-primary");
  await sleep(150);
  return true;
}

async function clickExistingAction(page, actionId, timeoutMs = 12000) {
  const selector = `[data-action-id="${actionId}"]`;
  await page.waitForSelector(selector, { timeout: timeoutMs });
  await page.click(selector);
  await sleep(120);
}

async function readVerifyState(page) {
  return page.evaluate(() => {
    return {
      render: window.__CC_TOOL_RENDER_DEBUG__ || null,
      overlayOpen: !!document.querySelector("#inventory-overlay-host .inventory-overlay")
    };
  });
}

function stableJson(value) {
  return JSON.stringify(value);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function printSnapshot(page, actionId, phase) {
  const state = await readVerifyState(page);
  console.log(`[ToolVerify][state] action=${actionId} phase=${phase} inventory=${stableJson(state.render?.inventory || null)} equippedTools=${stableJson(state.render?.equippedTools || [])} equipment=${stableJson(state.render?.equipment || null)} thermal=${stableJson(state.render?.thermal || null)}`);
  console.log(`[ToolVerify][render] action=${actionId} phase=${phase} equippedToolEntries=${stableJson(state.render?.equippedToolEntries || [])} selectedToolTagLabel=${stableJson(state.render?.selectedToolTagLabel ?? null)} vitalsMonitorEnabled=${stableJson(state.render?.vitalsMonitorEnabled === true)}`);
  return state;
}

async function selectInventoryItem(page, itemId) {
  await clickExistingAction(page, `inv_select_item:${itemId}`);
  await waitForPredicate(page, () => String(window.__CC_TOOL_RENDER_DEBUG__?.selectedToolTagLabel || "").length > 0, `selected tool tag for ${itemId}`);
}

async function main() {
  const server = startServer();
  console.log(`[ToolVerify][progress] server:start port=${SERVER_PORT}`);
  const browser = await chromium.launch({ headless: true });
  console.log("[ToolVerify][progress] browser:launched");
  const page = await browser.newPage();

  try {
    await waitForServer(`${BASE_URL}/index.html`);
    console.log("[ToolVerify][progress] server:ready");
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    console.log("[ToolVerify][progress] page:loaded");
    await waitForPredicate(page, () => window.__RENDER_DEBUG__?.currentMapId === "menu_main", "menu_main");
    console.log("[ToolVerify][progress] state:menu_main");

    await clickExistingAction(page, "menu_new_game");
    await confirmPrimaryNoticeIfVisible(page);
    await waitForPredicate(page, () => window.__RENDER_DEBUG__?.currentMapId === "intro_clinic_bed", "intro_clinic_bed");
    console.log("[ToolVerify][progress] state:intro_clinic_bed");

    await clickExistingAction(page, "ui_open_inventory");
    await waitForPredicate(page, () => !!document.querySelector("#inventory-overlay-host .inventory-overlay"), "inventory open");
    console.log("[ToolVerify][progress] overlay:inventory_open");
    await runRuntimeVerifyAction(page, "inv_debug_gain:tool_loadout");
    await waitForPredicate(page, () => {
      const snapshot = window.__CC_TOOL_RENDER_DEBUG__;
      return Math.max(0, Number(snapshot?.inventory?.tool_thermometer || 0)) >= 1
        && Math.max(0, Number(snapshot?.inventory?.tool_vitals_monitor || 0)) >= 1
        && Math.max(0, Number(snapshot?.inventory?.tool_small_flashlight || 0)) >= 1;
    }, "tool loadout injected");
    console.log("[ToolVerify][progress] action:tool_loadout");
    await clickExistingAction(page, "inv_filter:tool");
    await sleep(150);

    const baseline = await readVerifyState(page);
    const baselineEquipment = stableJson(baseline.render?.equipment || null);
    const baselineThermal = stableJson(baseline.render?.thermal || null);

    await selectInventoryItem(page, "tool_thermometer");
    await printSnapshot(page, "inv_equip:tool_thermometer", "before");
    await clickExistingAction(page, "inv_equip:tool_thermometer");
    await waitForPredicate(page, () => Array.isArray(window.__CC_TOOL_RENDER_DEBUG__?.equippedTools)
      && window.__CC_TOOL_RENDER_DEBUG__.equippedTools.some((entry) => entry?.itemId === "tool_thermometer" && entry?.toolTag === "temperature"), "post equip thermometer");
    await printSnapshot(page, "inv_equip:tool_thermometer", "after");

    await selectInventoryItem(page, "tool_small_flashlight");
    await printSnapshot(page, "inv_equip:tool_small_flashlight", "before");
    await clickExistingAction(page, "inv_equip:tool_small_flashlight");
    await waitForPredicate(page, () => Array.isArray(window.__CC_TOOL_RENDER_DEBUG__?.equippedTools)
      && window.__CC_TOOL_RENDER_DEBUG__.equippedTools.some((entry) => entry?.itemId === "tool_thermometer" && entry?.toolTag === "temperature")
      && window.__CC_TOOL_RENDER_DEBUG__.equippedTools.some((entry) => entry?.itemId === "tool_small_flashlight" && entry?.toolTag === "light"), "post equip flashlight");
    const coexistState = await printSnapshot(page, "inv_equip:tool_small_flashlight", "after");
    assert(Array.isArray(coexistState.render?.equippedTools) && coexistState.render.equippedTools.length === 2, "Expected two equipped tools after flashlight equip");

    await selectInventoryItem(page, "tool_vitals_monitor");
    await printSnapshot(page, "inv_equip:tool_vitals_monitor", "before");
    await clickExistingAction(page, "inv_equip:tool_vitals_monitor");
    await waitForPredicate(page, () => Array.isArray(window.__CC_TOOL_RENDER_DEBUG__?.equippedTools)
      && window.__CC_TOOL_RENDER_DEBUG__.equippedTools.some((entry) => entry?.itemId === "tool_vitals_monitor" && entry?.toolTag === "temperature")
      && window.__CC_TOOL_RENDER_DEBUG__.equippedTools.some((entry) => entry?.itemId === "tool_small_flashlight" && entry?.toolTag === "light")
      && !window.__CC_TOOL_RENDER_DEBUG__.equippedTools.some((entry) => entry?.itemId === "tool_thermometer")
      && Math.max(0, Number(window.__CC_TOOL_RENDER_DEBUG__?.inventory?.tool_thermometer || 0)) >= 1, "post equip vitals monitor");
    const replaceState = await printSnapshot(page, "inv_equip:tool_vitals_monitor", "after");
    assert(Array.isArray(replaceState.render?.equippedTools)
      && replaceState.render.equippedTools.some((entry) => entry?.itemId === "tool_vitals_monitor" && entry?.toolTag === "temperature")
      && !replaceState.render.equippedTools.some((entry) => entry?.itemId === "tool_thermometer"), "Expected vitals monitor to replace thermometer only within the same toolTag");
    assert(Math.max(0, Number(replaceState.render?.inventory?.tool_thermometer || 0)) >= 1, "Expected replaced thermometer to return to inventory");

    await printSnapshot(page, "inv_unequip_tool:tool_vitals_monitor", "before");
    await runRuntimeVerifyAction(page, "inv_unequip_tool:tool_vitals_monitor");
    await waitForPredicate(page, () => Array.isArray(window.__CC_TOOL_RENDER_DEBUG__?.equippedTools)
      && !window.__CC_TOOL_RENDER_DEBUG__.equippedTools.some((entry) => entry?.itemId === "tool_vitals_monitor")
      && window.__CC_TOOL_RENDER_DEBUG__.equippedTools.some((entry) => entry?.itemId === "tool_small_flashlight" && entry?.toolTag === "light")
      && Math.max(0, Number(window.__CC_TOOL_RENDER_DEBUG__?.inventory?.tool_vitals_monitor || 0)) >= 1, "post unequip vitals monitor");
    const unequipState = await printSnapshot(page, "inv_unequip_tool:tool_vitals_monitor", "after");
    assert(stableJson(unequipState.render?.equipment || null) === baselineEquipment, "Expected clothing equipment to remain unchanged during tool verification");
    assert(stableJson(unequipState.render?.thermal || null) === baselineThermal, "Expected thermal aggregation to remain unchanged during tool verification");

    console.log(`[ToolVerify][summary] coexist=true replacement=true oldReturned=true thermalUnchanged=true finalEquippedTools=${stableJson(unequipState.render?.equippedTools || [])}`);
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    server.proc.kill();
  }
}

main().catch((error) => {
  console.error(`[ToolVerify][error] ${error?.stack || error?.message || String(error)}`);
  process.exitCode = 1;
});