import { chromium } from "playwright";

const SERVER_URL = "http://127.0.0.1:5500/index.html?debugUi=1&debugTeleport=1";

const ACTIONS_BY_MAP = {
  industrial_split: [
    "check_split_signage",
    "inspect_access_lights",
    "read_dispatch_board",
    "ask_temp_shift_window",
    "observe_split"
  ],
  industrial_warehouse_gate: [
    "warehouse_scan_stack",
    "warehouse_check_slot_tags",
    "warehouse_track_loading_marks",
    "warehouse_listen_ambient",
    "warehouse_ask_entry"
  ],
  industrial_maintenance_gate: [
    "maintenance_scan_tools",
    "maintenance_check_access",
    "maintenance_watch_staff_flow",
    "maintenance_listen_inside",
    "maintenance_ask_entry_help"
  ]
};

function clip(value, max = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function waitFor(page, predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await page.evaluate(predicate);
    if (ok) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function loadFreshPage(page) {
  await page.goto(SERVER_URL, { waitUntil: "networkidle" });
  await waitFor(page, () => window.__RENDER_DEBUG__?.currentMapId === "menu_main", 15000, "menu_main");
}

async function unlockChoicesHost(page) {
  await page.evaluate(() => {
    const choices = document.getElementById("choices");
    if (!(choices instanceof HTMLElement)) return;
    choices.classList.remove("scene-text-fx-actions-hidden");
    choices.classList.add("scene-text-fx-actions-reveal");
    choices.style.removeProperty("pointer-events");
    choices.removeAttribute("aria-hidden");
  });
}

async function teleport(page, mapId) {
  const result = await page.evaluate(async (targetMapId) => {
    const localClip = (value, max = 240) => {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      return text.length > max ? `${text.slice(0, max)}...` : text;
    };
    const mod = await import("./src/engine/debug/debug_teleport_tools.js");
    const teleportResult = await mod.runDebugTeleportByMapId(targetMapId);
    return {
      teleportResult,
      currentMapId: window.__RENDER_DEBUG__?.currentMapId ?? null,
      uiPage: window.__RENDER_DEBUG__?.ui?.page ?? null,
      appText: localClip(document.getElementById("app")?.textContent || "", 240)
    };
  }, mapId);
  try {
    const start = Date.now();
    while (Date.now() - start < 8000) {
      const currentMapId = await page.evaluate(() => window.__RENDER_DEBUG__?.currentMapId ?? null);
      if (currentMapId === mapId) return;
      await page.waitForTimeout(50);
    }
    throw new Error(`timeout_waiting_for_map:${mapId}`);
  } catch (error) {
    const after = await page.evaluate(() => ({
      currentMapId: window.__RENDER_DEBUG__?.currentMapId ?? null,
      uiPage: window.__RENDER_DEBUG__?.ui?.page ?? null,
      appText: String(document.getElementById("app")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240),
      lastDispatchActionId: window.__LAST_DISPATCH_ACTION_ID__ ?? null
    }));
    throw new Error(`Teleport failed for ${mapId}: ${JSON.stringify({ result, after })}`);
  }
}

async function getUiSnapshot(page) {
  return await page.evaluate(() => ({
    currentMapId: window.__RENDER_DEBUG__?.currentMapId ?? null,
    uiPage: window.__RENDER_DEBUG__?.ui?.page ?? null,
    uiOverlay: window.__RENDER_DEBUG__?.ui?.overlay ?? null,
    totalMinutes: Number(window.__WORLD_TIME_CONTEXT__?.totalMinutes ?? 0),
    lastDispatchActionId: window.__LAST_DISPATCH_ACTION_ID__ ?? null,
    noticeOpen: document.getElementById("notice-dialog-host")?.getAttribute("aria-hidden") === "false",
    noticeText: String(document.querySelector("#notice-dialog-host .notice-dialog-message")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400),
    inquiryVisible: !!document.querySelector(".inline-scene-session[data-session-kind='inquiry']"),
    inquiryText: String(document.querySelector(".inline-scene-session[data-session-kind='inquiry']")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 500),
    appText: String(document.getElementById("app")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300),
    interactionAuditTail: Array.isArray(window.__INTERACTION_AUDIT__?.clicks)
      ? window.__INTERACTION_AUDIT__.clicks.slice(-3)
      : []
  }));
}

async function probeDispatchReport(page, mapId, actionId) {
  await loadFreshPage(page);
  await teleport(page, mapId);
  return await page.evaluate(async ({ actionId: targetActionId }) => {
    const localClip = (value, max = 240) => {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      return text.length > max ? `${text.slice(0, max)}...` : text;
    };
    const btn = document.querySelector(`button[data-action-id='${targetActionId}']`);
    const uiRuntime = {};
    const actionFeedback = String(btn?.dataset?.actionFeedback || "").trim();
    const actionIllustrationKey = String(btn?.dataset?.actionIllustrationKey || "").trim();
    if (actionFeedback) uiRuntime.actionFeedback = actionFeedback;
    if (actionIllustrationKey) uiRuntime.actionIllustrationKey = actionIllustrationKey;

    const { dispatch } = await import("./src/engine/pipeline/dispatch.js");
    const result = await dispatch(targetActionId, {}, {
      returnReport: true,
      suppressDialogs: true,
      suppressFeedback: true,
      uiRuntime: Object.keys(uiRuntime).length > 0 ? uiRuntime : undefined
    });

    const report = result?.report || null;
    return {
      ok: !!result?.ok,
      reason: result?.reason || null,
      uiRuntimeActionFeedback: String(report?.uiRuntime?.actionFeedback || "").trim(),
      planRejection: report?.plan?.rejection || null,
      sysCalls: Array.isArray(report?.sysCalls)
        ? report.sysCalls.map((row) => ({
            type: row?.call?.type || null,
            ok: row?.result?.ok ?? null,
            error: row?.result?.error || null,
            blockedBy: row?.result?.blockedBy || null,
            mapId: row?.result?.mapId || null
          }))
        : [],
      appliedEffects: Array.isArray(report?.effects?.applied)
        ? report.effects.applied.map((row) => ({
            op: row?.effect?.op || null,
            path: row?.effect?.path || null,
            value: typeof row?.effect?.value === "string" ? localClip(row.effect.value, 240) : row?.effect?.value ?? null
          }))
        : [],
      notes: Array.isArray(report?.notes) ? report.notes.slice() : [],
      after: report?.after || null,
      inquirySessionAfter: window.__RENDER_DEBUG__?.ui?.inquirySession ?? null
    };
  }, { actionId });
}

async function probeClick(page, mapId, actionId) {
  await loadFreshPage(page);
  await teleport(page, mapId);
  const selector = `button[data-action-id='${actionId}']`;
  const locator = page.locator(selector).first();
  await locator.waitFor({ timeout: 8000 });
  await page.evaluate((sel) => {
    const btn = document.querySelector(sel);
    const group = btn?.closest(".journal-collapsible-action-group") || btn?.closest("[data-action-group-id]");
    const toggle = group?.querySelector("[data-action-group-toggle]");
    if (toggle instanceof HTMLElement && toggle.getAttribute("aria-expanded") !== "true") {
      toggle.click();
    }
  }, selector);
  await unlockChoicesHost(page);
  await page.waitForTimeout(120);
  const before = await getUiSnapshot(page);
  const buttonInfo = await page.evaluate((sel) => {
    const btn = document.querySelector(sel);
    return btn ? {
      text: String(btn.textContent || "").trim(),
      actionFeedback: String(btn.dataset.actionFeedback || "").trim()
    } : null;
  }, selector);
  await page.evaluate((sel) => {
    const btn = document.querySelector(sel);
    if (!(btn instanceof HTMLElement)) {
      throw new Error(`Missing button for selector: ${sel}`);
    }
    btn.click();
  }, selector);
  await page.waitForTimeout(1200);
  const after = await getUiSnapshot(page);
  return {
    before,
    buttonInfo,
    after
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const output = {
    ok: true,
    serverUrl: SERVER_URL,
    results: []
  };

  try {
    for (const [mapId, actionIds] of Object.entries(ACTIONS_BY_MAP)) {
      for (const actionId of actionIds) {
        const dispatchReport = await probeDispatchReport(page, mapId, actionId);
        const clickResult = await probeClick(page, mapId, actionId);
        output.results.push({
          mapId,
          actionId,
          dispatchOk: dispatchReport.ok,
          dispatchReason: dispatchReport.reason,
          dispatchPlanRejection: dispatchReport.planRejection,
          dispatchUiRuntimeActionFeedback: clip(dispatchReport.uiRuntimeActionFeedback, 120),
          clickLastDispatchActionId: clickResult.after?.lastDispatchActionId ?? null,
          clickNoticeOpen: !!clickResult.after?.noticeOpen,
          clickNoticeText: clip(clickResult.after?.noticeText || "", 120),
          clickInquiryVisible: !!clickResult.after?.inquiryVisible,
          clickInquiryText: clip(clickResult.after?.inquiryText || "", 120)
        });
      }
    }
  } catch (error) {
    output.ok = false;
    output.error = error?.message || String(error);
  } finally {
    await browser.close();
  }

  process.stdout.write(JSON.stringify(output, null, 2));
}

main();