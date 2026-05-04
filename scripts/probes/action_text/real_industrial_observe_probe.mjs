import { chromium } from "playwright";

const SERVER_URL = "http://127.0.0.1:5500/index.html?debugUi=1";

const ROUTE_TO_INDUSTRIAL_SPLIT = [
  { actionId: "menu_new_game", waitForMapId: "intro_clinic_bed" },
  { actionId: "intro_rise", waitForMapId: "intro_clinic_bed_lin_1" },
  { actionId: "intro_reply_good", waitForMapId: "intro_clinic_bed_lin_2" },
  { actionId: "intro_reply_forget", waitForMapId: "intro_clinic_bed_lin_3" },
  { actionId: "intro_nod", waitForMapId: "intro_clinic_bed_lin_4" },
  { actionId: "intro_continue_to_ward", waitForMapId: "bayport_clinic_ward" },
  { actionId: "ward_discharge_ready", waitForMapId: "bayport_clinic_ward" },
  { actionId: "ward_leave_allowed", waitForMapId: "bayport_clinic_upstairs_hall" },
  { actionId: "stairs_down_1f", waitForMapId: "bayport_clinic" },
  { pickByMap: {
      bayport_clinic: ["queue_counter_first_day", "queue_counter_first_night", "queue_counter_first_night_late"]
    }, waitForMapId: "bayport_clinic_queue_intro_1" },
  { actionId: "queue_intro_shake_head", waitForMapId: "bayport_clinic_queue_intro_2" },
  { actionId: "queue_intro_take_bill", waitForMapId: "bayport_clinic" },
  { actionId: "exit_to_winddyke_allowed", waitForMapId: "winddyke_street_clinic_segment" },
  { pickByMap: {
      winddyke_street_clinic_segment: ["to_corner_notice_day", "to_corner_notice_night"]
    }, waitForMapId: "winddyke_street_corner_notice" },
  { actionId: "enter_transit_stop_winddyke", waitForMapId: "winddyke_bus_stop" },
  { actionId: "board_to_heatcorridor", waitForMapId: "west2_bus_onboard" },
  { actionId: "west2_bus_continue", waitForTransitStopId: "stop_heatcorridor" },
  { actionId: "west2_bus_get_off", waitForMapId: "heatcorridor_bus_stop" },
  { actionId: "board_heatcorridor_to_industrial", waitForMapId: "west2_bus_onboard" },
  { actionId: "west2_bus_continue", waitForTransitStopId: "stop_industrial" },
  { actionId: "west2_bus_get_off", waitForMapId: "industrial_bus_stop" },
  { actionId: "leave_industrial_bus_stop", waitForMapId: "industrial_split" }
];

const OBSERVE_ACTIONS = {
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
    "warehouse_listen_ambient"
  ],
  industrial_maintenance_gate: [
    "maintenance_scan_tools",
    "maintenance_check_access",
    "maintenance_watch_staff_flow",
    "maintenance_listen_inside"
  ]
};

const MAP_ROUTE_ACTIONS = {
  industrial_split: [],
  industrial_warehouse_gate: ["to_warehouse_gate"],
  industrial_maintenance_gate: ["to_maintenance_gate"]
};

function clip(value, max = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function waitForMap(page, expectedMapId, timeoutMs = 15000) {
  try {
    await page.waitForFunction(
      (mapId) => window.__RENDER_DEBUG__?.currentMapId === mapId,
      expectedMapId,
      { timeout: timeoutMs }
    );
  } catch (error) {
    const snapshot = await page.evaluate(() => ({
      currentMapId: window.__RENDER_DEBUG__?.currentMapId ?? null,
      uiPage: window.__RENDER_DEBUG__?.ui?.page ?? null,
      bodyMenuPage: document.body?.dataset?.menuPage ?? null,
      appText: String(document.getElementById("app")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200),
      noticeHidden: document.getElementById("notice-dialog-host")?.getAttribute("aria-hidden") ?? null,
      noticeTitle: String(document.querySelector("#notice-dialog-host .notice-dialog-title")?.textContent || "").replace(/\s+/g, " ").trim(),
      noticeMessage: String(document.querySelector("#notice-dialog-host .notice-dialog-body")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200),
      menuTransitionTraceTail: Array.isArray(window.__MENU_TRANSITION_COORDINATOR_TRACE__)
        ? window.__MENU_TRANSITION_COORDINATOR_TRACE__.slice(-8)
        : [],
      loadFreezeTraceTail: Array.isArray(window.__LOAD_FREEZE_TRACE__)
        ? window.__LOAD_FREEZE_TRACE__.slice(-8)
        : [],
      choices: Array.from(document.querySelectorAll("#choices button[data-action-id]"))
        .slice(0, 10)
        .map((btn) => ({
          actionId: btn.getAttribute("data-action-id"),
          text: String(btn.textContent || "").replace(/\s+/g, " ").trim()
        }))
    }));
    throw new Error(`waitForMap:${expectedMapId}:${JSON.stringify(snapshot)}`);
  }
}

async function waitForTransitStop(page, expectedStopId, timeoutMs = 15000) {
  try {
    await page.waitForFunction(
      async (stopId) => {
        const mod = await import("/src/engine/state.js");
        return String(mod.gameState?.player?.transit?.ride?.currentStopId || "") === stopId;
      },
      expectedStopId,
      { timeout: timeoutMs }
    );
  } catch (error) {
    const snapshot = await page.evaluate(async () => {
      const mod = await import("/src/engine/state.js");
      return {
        currentMapId: window.__RENDER_DEBUG__?.currentMapId ?? null,
        currentStopId: mod.gameState?.player?.transit?.ride?.currentStopId ?? null,
        nextStopId: mod.gameState?.player?.transit?.ride?.nextStopId ?? null,
        uiPage: window.__RENDER_DEBUG__?.ui?.page ?? null,
        appText: String(document.getElementById("app")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200),
        choices: Array.from(document.querySelectorAll("#choices button[data-action-id]")).slice(0, 12).map((button) => ({
          actionId: button.getAttribute("data-action-id"),
          text: String(button.textContent || "").replace(/\s+/g, " ").trim()
        }))
      };
    });
    throw new Error(`waitForTransitStop:${expectedStopId}:${JSON.stringify(snapshot)}`);
  }
}

async function clickAction(page, actionId) {
  const button = page.locator(`#choices button[data-action-id='${actionId}']`).first();
  await button.waitFor({ state: "visible", timeout: 15000 });
  await button.click();
}

async function expandActionGroupFor(page, actionId) {
  await page.evaluate((targetActionId) => {
    const btn = document.querySelector(`#choices button[data-action-id='${targetActionId}']`);
    const root = btn?.closest(".journal-collapsible-action-group");
    const toggle = root?.querySelector("button[data-action-group-toggle]");
    if (toggle instanceof HTMLElement && toggle.getAttribute("aria-expanded") !== "true") {
      toggle.click();
    }
  }, actionId);
}

async function dismissNoticeIfOpen(page) {
  const isOpen = await page.evaluate(() => document.getElementById("notice-dialog-host")?.getAttribute("aria-hidden") === "false");
  if (!isOpen) return false;
  const button = page.locator("#notice-dialog-host .notice-dialog-btn").last();
  await button.waitFor({ state: "visible", timeout: 5000 });
  await button.click();
  await page.waitForFunction(() => document.getElementById("notice-dialog-host")?.getAttribute("aria-hidden") !== "false", undefined, { timeout: 5000 });
  return true;
}

async function confirmPrimaryNoticeIfOpen(page) {
  const isOpen = await page.evaluate(() => document.getElementById("notice-dialog-host")?.getAttribute("aria-hidden") === "false");
  if (!isOpen) return false;
  const button = page.locator("#notice-dialog-host .notice-dialog-btn.is-primary").last();
  await button.waitFor({ state: "visible", timeout: 5000 });
  await button.click();
  return true;
}

async function waitAndConfirmPrimaryNotice(page, timeoutMs = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await confirmPrimaryNoticeIfOpen(page)) {
      return true;
    }
    await page.waitForTimeout(50);
  }
  return false;
}

async function readNoticeSnapshot(page) {
  return await page.evaluate(() => {
    const host = document.getElementById("notice-dialog-host");
    const body = document.querySelector("#notice-dialog-host .notice-dialog-body");
    const title = document.querySelector("#notice-dialog-host .notice-dialog-title");
    return {
      ariaHidden: host?.getAttribute("aria-hidden") ?? null,
      title: String(title?.textContent || "").replace(/\s+/g, " ").trim(),
      message: String(body?.textContent || "").replace(/\s+/g, " ").trim(),
      bodyClass: body?.className || null
    };
  });
}

async function readInteractionTail(page) {
  return await page.evaluate(() => {
    const rows = Array.isArray(window.__INTERACTION_AUDIT__?.clicks)
      ? window.__INTERACTION_AUDIT__.clicks.slice(-4)
      : [];
    return rows.map((row) => ({
      type: row?.type || null,
      routeAction: row?.route?.action || null,
      routeDomain: row?.route?.domain || null,
      handlerAction: row?.handler?.action || null,
      handlerPhase: row?.handler?.phase || null,
      targetText: String(row?.target?.text || row?.handler?.element?.text || "").replace(/\s+/g, " ").trim().slice(0, 80)
    }));
  });
}

async function runRoute(page, steps) {
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    console.error(`[route] step ${index + 1}/${steps.length}`, JSON.stringify(step));
    if (step.pickByMap) {
      const currentMapId = await page.evaluate(() => window.__RENDER_DEBUG__?.currentMapId ?? null);
      const candidates = step.pickByMap[currentMapId] || [];
      let clicked = false;
      for (const actionId of candidates) {
        const locator = page.locator(`#choices button[data-action-id='${actionId}']`).first();
        if (await locator.count()) {
          await locator.waitFor({ state: "visible", timeout: 8000 });
          await locator.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        throw new Error(`No route action available from map ${currentMapId}`);
      }
    } else {
      await clickAction(page, step.actionId);
    }
    await waitAndConfirmPrimaryNotice(page);
    try {
      if (step.waitForTransitStopId) {
        await waitForTransitStop(page, step.waitForTransitStopId);
      }
      if (step.waitForMapId) {
        await waitForMap(page, step.waitForMapId);
      }
    } catch (error) {
      const tail = await readInteractionTail(page);
      throw new Error(`${error.message}:interaction=${JSON.stringify(tail)}`);
    }
    await dismissNoticeIfOpen(page);
  }
}

async function probeObserveAction(page, mapId, actionId) {
  await expandActionGroupFor(page, actionId);
  const beforeMinutes = await page.evaluate(() => Number(window.__WORLD_TIME_CONTEXT__?.totalMinutes ?? 0));
  await clickAction(page, actionId);

  let noticeSeen = false;
  let noticeSnapshot = null;
  const start = Date.now();
  while (Date.now() - start < 3000) {
    noticeSnapshot = await readNoticeSnapshot(page);
    if (noticeSnapshot.ariaHidden === "false") {
      noticeSeen = true;
      break;
    }
    await page.waitForTimeout(100);
  }

  const afterMinutes = await page.evaluate(() => Number(window.__WORLD_TIME_CONTEXT__?.totalMinutes ?? 0));
  const currentMapId = await page.evaluate(() => window.__RENDER_DEBUG__?.currentMapId ?? null);
  const lastDispatchActionId = await page.evaluate(() => window.__LAST_DISPATCH_ACTION_ID__ ?? null);
  const interactionTail = await readInteractionTail(page);

  if (noticeSeen) {
    await dismissNoticeIfOpen(page);
  }

  return {
    mapId,
    actionId,
    currentMapId,
    lastDispatchActionId,
    beforeMinutes,
    afterMinutes,
    noticeSeen,
    noticeTitle: clip(noticeSnapshot?.title || ""),
    noticeMessage: clip(noticeSnapshot?.message || ""),
    interactionTail
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const result = {
    ok: true,
    serverUrl: SERVER_URL,
    results: []
  };

  try {
    await page.goto(SERVER_URL, { waitUntil: "networkidle" });
    await waitForMap(page, "menu_main");

    await runRoute(page, ROUTE_TO_INDUSTRIAL_SPLIT);

    for (const [mapId, actions] of Object.entries(OBSERVE_ACTIONS)) {
      if (mapId !== "industrial_split") {
        for (const routeActionId of MAP_ROUTE_ACTIONS[mapId]) {
          await clickAction(page, routeActionId);
        }
        await waitForMap(page, mapId);
      }

      for (const actionId of actions) {
        result.results.push(await probeObserveAction(page, mapId, actionId));
      }

      if (mapId === "industrial_warehouse_gate" || mapId === "industrial_maintenance_gate") {
        await clickAction(page, mapId === "industrial_warehouse_gate" ? "warehouse_back_split" : "maintenance_back_split");
        await waitForMap(page, "industrial_split");
      }
    }
  } catch (error) {
    result.ok = false;
    result.error = error?.message || String(error);
  } finally {
    await browser.close();
  }

  process.stdout.write(JSON.stringify(result, null, 2));
}

main();
