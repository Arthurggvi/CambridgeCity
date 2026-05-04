function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await sleep(50);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

function ensureAuditHost() {
  let host = document.getElementById("live-interaction-audit-result");
  if (!host) {
    host = document.createElement("pre");
    host.id = "live-interaction-audit-result";
    host.style.position = "fixed";
    host.style.left = "12px";
    host.style.right = "12px";
    host.style.bottom = "12px";
    host.style.maxHeight = "44vh";
    host.style.overflow = "auto";
    host.style.zIndex = "25000";
    host.style.background = "rgba(8,12,18,.94)";
    host.style.color = "#dce7f1";
    host.style.padding = "10px";
    host.style.font = "12px/1.5 Consolas, monospace";
    host.style.whiteSpace = "pre-wrap";
    document.body.appendChild(host);
  }
  return host;
}

function writeResult(payload) {
  window.__LIVE_INTERACTION_AUDIT_RESULT__ = payload;
  ensureAuditHost().textContent = JSON.stringify(payload, null, 2);
}

function clip(value, maxLength = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function snapshotState(label) {
  return {
    label,
    currentMapId: window.__RENDER_DEBUG__?.currentMapId ?? null,
    uiPage: window.__RENDER_DEBUG__?.ui?.page ?? null,
    uiOverlay: window.__RENDER_DEBUG__?.ui?.overlay ?? null,
    menuPage: document.body?.dataset?.menuPage || null,
    inventoryOpen: !!document.querySelector(".inventory-overlay"),
    tasksOpen: !!document.querySelector(".tasks-overlay"),
    settingsOpen: !!document.querySelector("#settings-overlay-host .SettingsOverlay"),
    noticeOpen: document.getElementById("notice-dialog-host")?.getAttribute("aria-hidden") === "false",
    appText: clip(document.getElementById("app")?.textContent || "", 180)
  };
}

function getLatestAuditEntries(sinceIndex) {
  const store = window.__INTERACTION_AUDIT__;
  if (!store) return [];
  return store.clicks.slice(sinceIndex);
}

function compressTraceEntries(entries) {
  return entries.map((entry) => ({
    type: entry.type || null,
    currentMapId: entry.currentMapId,
    uiPage: entry.uiPage,
    inventoryOpen: entry.inventoryOpen,
    tasksOpen: entry.tasksOpen,
    target: entry.target ? {
      tag: entry.target.tag,
      className: entry.target.className,
      dataset: entry.target.dataset,
      text: entry.target.text
    } : null,
    route: entry.route ? {
      domain: entry.route.domain,
      action: entry.route.action,
      disabled: entry.route.disabled,
      element: entry.route.element ? {
        tag: entry.route.element.tag,
        className: entry.route.element.className,
        dataset: entry.route.element.dataset,
        hitChain: entry.route.element.hitChain
      } : null
    } : null,
    handler: entry.handler || null
  }));
}

function getButtonReport(selector) {
  const store = window.__INTERACTION_AUDIT__;
  const element = document.querySelector(selector);
  return {
    selector,
    inspection: store?.inspectElement ? store.inspectElement(element) : null,
    exists: !!element
  };
}

function clickTopTargetAtElement(el) {
  if (!el) throw new Error("Element not found for click");
  if (typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ block: "center", inline: "center" });
  }
  const rect = el.getBoundingClientRect();
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + rect.height / 2);
  const top = document.elementFromPoint(x, y);
  if (!(top instanceof Element)) {
    throw new Error(`No top element at ${x},${y} for ${clip(el.outerHTML || el.textContent || "", 180)}`);
  }
  const eventInit = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: 0
  };
  top.dispatchEvent(new MouseEvent("pointerdown", eventInit));
  top.dispatchEvent(new MouseEvent("mousedown", eventInit));
  top.dispatchEvent(new MouseEvent("mouseup", eventInit));
  top.dispatchEvent(new MouseEvent("click", eventInit));
  return {
    clickPoint: { x, y },
    topElement: window.__INTERACTION_AUDIT__?.inspectElement ? window.__INTERACTION_AUDIT__.inspectElement(top) : null
  };
}

async function pressEscapeAndWait(waitPredicate, waitLabel) {
  document.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true
  }));
  await waitFor(waitPredicate, 8000, waitLabel);
  return snapshotState(`${waitLabel}:after`);
}

async function clickAndTrace(selector, expectedLabel, waitPredicate, waitLabel) {
  const el = await waitFor(() => document.querySelector(selector), 12000, expectedLabel);
  const store = window.__INTERACTION_AUDIT__;
  const beforeIndex = store?.clicks?.length || 0;
  const before = store?.inspectElement ? store.inspectElement(el) : null;
  const click = clickTopTargetAtElement(el);
  if (waitPredicate) {
    await waitFor(waitPredicate, 8000, waitLabel || expectedLabel);
  } else {
    await sleep(250);
  }
  return {
    button: before,
    click,
    routeTrace: compressTraceEntries(getLatestAuditEntries(beforeIndex)),
    afterState: snapshotState(`${expectedLabel}:after`)
  };
}

function summarizeButtonReport(report) {
  if (!report) return null;
  return {
    selector: report.selector,
    exists: report.exists,
    inspection: report.inspection
  };
}

function summarizeTrace(trace) {
  if (!trace) return null;
  const routeEntry = Array.isArray(trace.routeTrace) ? trace.routeTrace.find((entry) => entry.route || entry.handler) || null : null;
  return {
    button: trace.button ? {
      outerHTML: trace.button.outerHTML,
      dataset: trace.button.dataset,
      routeFields: trace.button.routeFields,
      hitChain: trace.button.hitChain
    } : null,
    click: trace.click ? {
      clickPoint: trace.click.clickPoint,
      topElement: trace.click.topElement ? {
        outerHTML: trace.click.topElement.outerHTML,
        dataset: trace.click.topElement.dataset,
        routeFields: trace.click.topElement.routeFields,
        hitChain: trace.click.topElement.hitChain
      } : null
    } : null,
    routeTrace: routeEntry,
    afterState: trace.afterState
  };
}

async function confirmNoticeDialog() {
  const confirmBtn = await waitFor(() => {
    const buttons = Array.from(document.querySelectorAll("#notice-dialog-host .notice-dialog-btn"));
    return buttons[buttons.length - 1] || null;
  }, 8000, "notice dialog confirm");
  clickTopTargetAtElement(confirmBtn);
  await sleep(320);
}

async function completeLoadSlotFlow(expectedMapId) {
  const start = Date.now();
  while (Date.now() - start < 12000) {
    const currentMapId = window.__RENDER_DEBUG__?.currentMapId;
    const noticeOpen = document.getElementById("notice-dialog-host")?.getAttribute("aria-hidden") === "false";
    if (currentMapId === expectedMapId) {
      return;
    }
    if (noticeOpen) {
      await confirmNoticeDialog();
      continue;
    }
    await sleep(120);
  }
  throw new Error(`Timeout waiting for ${expectedMapId}`);
}

async function dismissVisibleNoticeDialog() {
  const noticeOpen = document.getElementById("notice-dialog-host")?.getAttribute("aria-hidden") === "false";
  if (!noticeOpen) return;
  await confirmNoticeDialog();
  await sleep(320);
}

export async function runLiveInteractionAudit() {
  try {
    const report = { ok: true, startup: snapshotState("startup"), buttonDom: {}, traces: {}, states: [] };

    await waitFor(() => window.__RENDER_DEBUG__?.currentMapId === "menu_main", 15000, "menu main");
    report.states.push(snapshotState("menu-main-ready"));

    report.traces.openLoad = await clickAndTrace("#choices [data-action-id='menu_go_load']", "open-load", () => document.body?.dataset?.menuPage === "menu_load", "menu_load");
    report.states.push(snapshotState("menu-load-open"));

    report.traces.loadSlot2 = await clickAndTrace("button[data-action-id='menu_load:2']", "load-slot2");
    await waitFor(() => document.getElementById("notice-dialog-host")?.getAttribute("aria-hidden") === "false", 8000, "load confirm dialog");
    report.states.push(snapshotState("load-confirm-open"));
    await completeLoadSlotFlow("bayport_clinic");
    report.states.push(snapshotState("map-loaded"));
    await dismissVisibleNoticeDialog();

    report.buttonDom.inventory = getButtonReport("#player-sidebar [data-action-id='ui_open_inventory']");
    report.buttonDom.tasks = getButtonReport("#player-sidebar [data-action-id='ui_tasks_open']");

    report.traces.inventoryOpen1 = await clickAndTrace("#player-sidebar [data-action-id='ui_open_inventory']", "inventory-open-1", () => !!document.querySelector(".inventory-overlay"), "inventory overlay");
    report.traces.inventoryClose1 = { afterState: await pressEscapeAndWait(() => !document.querySelector(".inventory-overlay"), "inventory-close-1") };
    report.traces.inventoryOpen2 = await clickAndTrace("#player-sidebar [data-action-id='ui_open_inventory']", "inventory-open-2", () => !!document.querySelector(".inventory-overlay"), "inventory overlay reopen");
    report.traces.inventoryClose2 = { afterState: await pressEscapeAndWait(() => !document.querySelector(".inventory-overlay"), "inventory-close-2") };

    report.traces.tasksOpen1 = await clickAndTrace("#player-sidebar [data-action-id='ui_tasks_open']", "tasks-open-1", () => !!document.querySelector(".tasks-overlay"), "tasks overlay");
    report.traces.tasksClose1 = { afterState: await pressEscapeAndWait(() => !document.querySelector(".tasks-overlay"), "tasks-close-1") };
    report.traces.tasksOpen2 = await clickAndTrace("#player-sidebar [data-action-id='ui_tasks_open']", "tasks-open-2", () => !!document.querySelector(".tasks-overlay"), "tasks overlay reopen");
    report.traces.tasksClose2 = { afterState: await pressEscapeAndWait(() => !document.querySelector(".tasks-overlay"), "tasks-close-2") };

    report.traces.exitToMenu = await clickAndTrace("#player-sidebar [data-action-id='menu_exit_main']", "exit-to-menu", () => window.__RENDER_DEBUG__?.currentMapId === "menu_main", "menu_main after exit");
    report.states.push(snapshotState("menu-main-after-exit"));

    report.traces.openSettings = await clickAndTrace("#choices [data-action-id='menu_go_settings']", "open-settings", () => window.__RENDER_DEBUG__?.currentMapId === "menu_settings", "menu_settings");
    report.traces.settingsTabInteraction = await clickAndTrace("#settings-overlay-host [data-settings-tab='interaction']", "settings-interaction", () => document.querySelector("#settings-overlay-host .NavItem.is-active")?.dataset?.settingsTab === "interaction", "settings interaction tab");
    report.traces.settingsBack = await clickAndTrace("#settings-overlay-host button[data-action-id='menu_back_main']", "settings-back", () => window.__RENDER_DEBUG__?.currentMapId === "menu_main", "menu_main from settings");
    report.states.push(snapshotState("menu-main-after-settings"));

    report.traces.reopenLoad = await clickAndTrace("#choices [data-action-id='menu_go_load']", "reopen-load", () => document.body?.dataset?.menuPage === "menu_load", "menu_load again");
    report.traces.reloadSlot2 = await clickAndTrace("button[data-action-id='menu_load:2']", "reload-slot2");
    await waitFor(() => document.getElementById("notice-dialog-host")?.getAttribute("aria-hidden") === "false", 8000, "reload confirm dialog");
    await completeLoadSlotFlow("bayport_clinic");
    report.states.push(snapshotState("map-reloaded"));
    await dismissVisibleNoticeDialog();

    report.buttonDom.inventoryAfterReload = getButtonReport("#player-sidebar [data-action-id='ui_open_inventory']");
    report.buttonDom.tasksAfterReload = getButtonReport("#player-sidebar [data-action-id='ui_tasks_open']");
    report.traces.inventoryAfterReload = await clickAndTrace("#player-sidebar [data-action-id='ui_open_inventory']", "inventory-after-reload", () => !!document.querySelector(".inventory-overlay"), "inventory after reload");
    report.traces.inventoryAfterReloadClose = { afterState: await pressEscapeAndWait(() => !document.querySelector(".inventory-overlay"), "inventory-after-reload-close") };
    report.traces.tasksAfterReload = await clickAndTrace("#player-sidebar [data-action-id='ui_tasks_open']", "tasks-after-reload", () => !!document.querySelector(".tasks-overlay"), "tasks after reload");
    report.traces.tasksAfterReloadClose = { afterState: await pressEscapeAndWait(() => !document.querySelector(".tasks-overlay"), "tasks-after-reload-close") };

    report.states.push(snapshotState("audit-finished"));
    writeResult({
      ok: true,
      startup: report.startup,
      checks: {
        inventoryOpen1: report.traces.inventoryOpen1?.afterState?.uiOverlay === "inventory" && report.traces.inventoryOpen1?.afterState?.inventoryOpen === true,
        inventoryOpen2: report.traces.inventoryOpen2?.afterState?.uiOverlay === "inventory" && report.traces.inventoryOpen2?.afterState?.inventoryOpen === true,
        tasksOpen1: report.traces.tasksOpen1?.afterState?.uiOverlay === "tasks" && report.traces.tasksOpen1?.afterState?.tasksOpen === true,
        tasksOpen2: report.traces.tasksOpen2?.afterState?.uiOverlay === "tasks" && report.traces.tasksOpen2?.afterState?.tasksOpen === true,
        settingsRoundTrip: report.traces.settingsTabInteraction?.afterState?.currentMapId === "menu_settings",
        menuMapRoundTrip: report.traces.inventoryAfterReload?.afterState?.currentMapId === "bayport_clinic" && report.traces.tasksAfterReload?.afterState?.currentMapId === "bayport_clinic"
      },
      buttonDom: {
        inventory: summarizeButtonReport(report.buttonDom.inventory),
        tasks: summarizeButtonReport(report.buttonDom.tasks),
        inventoryAfterReload: summarizeButtonReport(report.buttonDom.inventoryAfterReload),
        tasksAfterReload: summarizeButtonReport(report.buttonDom.tasksAfterReload)
      },
      traces: {
        inventoryOpen1: summarizeTrace(report.traces.inventoryOpen1),
        inventoryOpen2: summarizeTrace(report.traces.inventoryOpen2),
        tasksOpen1: summarizeTrace(report.traces.tasksOpen1),
        tasksOpen2: summarizeTrace(report.traces.tasksOpen2),
        settingsTabInteraction: summarizeTrace(report.traces.settingsTabInteraction),
        inventoryAfterReload: summarizeTrace(report.traces.inventoryAfterReload),
        tasksAfterReload: summarizeTrace(report.traces.tasksAfterReload)
      },
      states: report.states.map((state) => ({
        label: state.label,
        currentMapId: state.currentMapId,
        uiPage: state.uiPage,
        uiOverlay: state.uiOverlay,
        inventoryOpen: state.inventoryOpen,
        tasksOpen: state.tasksOpen,
        settingsOpen: state.settingsOpen,
        noticeOpen: state.noticeOpen
      }))
    });
  } catch (error) {
    writeResult({
      ok: false,
      error: String(error?.message || error),
      state: snapshotState("failure"),
      audit: window.__INTERACTION_AUDIT__ || null
    });
  }
}