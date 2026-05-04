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

function topClick(element) {
  if (!element) throw new Error("click target missing");
  element.scrollIntoView?.({ block: "center", inline: "center" });
  const rect = element.getBoundingClientRect();
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + rect.height / 2);
  const top = document.elementFromPoint(x, y);
  if (!(top instanceof Element)) throw new Error("no clickable top element");
  const init = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
  top.dispatchEvent(new MouseEvent("pointerdown", init));
  top.dispatchEvent(new MouseEvent("mousedown", init));
  top.dispatchEvent(new MouseEvent("mouseup", init));
  top.dispatchEvent(new MouseEvent("click", init));
}

async function clickAction(actionId, timeoutMs = 12000) {
  const button = await waitFor(
    () => document.querySelector(`[data-action-id="${actionId}"]`),
    timeoutMs,
    `action ${actionId}`
  );
  topClick(button);
  await sleep(90);
}

async function confirmNoticeIfVisible() {
  const host = document.getElementById("notice-dialog-host");
  if (!host || host.getAttribute("aria-hidden") !== "false") return false;
  const buttons = Array.from(host.querySelectorAll(".notice-dialog-btn"));
  const confirm = buttons[buttons.length - 1];
  if (!confirm) return false;
  topClick(confirm);
  await sleep(220);
  return true;
}

async function loadSlotToMap(slotActionId, expectedMapId) {
  await clickAction(slotActionId);
  await waitFor(() => document.getElementById("notice-dialog-host")?.getAttribute("aria-hidden") === "false", 8000, "load confirm dialog");
  await confirmNoticeIfVisible();
  await waitFor(() => window.__RENDER_DEBUG__?.currentMapId === expectedMapId, 12000, expectedMapId);
  await confirmNoticeIfVisible();
}

async function pressEscape() {
  document.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true
  }));
  await sleep(120);
}

function snapshot(label) {
  return {
    label,
    mapId: window.__RENDER_DEBUG__?.currentMapId ?? null,
    uiPage: window.__RENDER_DEBUG__?.ui?.page ?? null,
    uiOverlay: window.__RENDER_DEBUG__?.ui?.overlay ?? null,
    inventoryOpen: !!document.querySelector("#inventory-overlay-host .inventory-overlay"),
    tasksOpen: !!document.querySelector("#tasks-overlay-host .tasks-overlay")
  };
}

async function runAction(actionId, payload = {}, options = {}) {
  const mod = await import("../pipeline/dispatch.js");
  return mod.dispatch(actionId, payload, options);
}

async function repeatOverlayCycle(config) {
  const {
    label,
    openActionId,
    openPredicate,
    closePredicate,
    iterations
  } = config;

  const details = [];
  for (let i = 0; i < iterations; i += 1) {
    await confirmNoticeIfVisible();
    await runAction(openActionId);
    await waitFor(openPredicate, 8000, `${label}:open:${i}`);
    const opened = snapshot(`${label}:open:${i}`);
    await runAction(openActionId === "ui_open_inventory" ? "ui_close_inventory" : "ui_tasks_close");
    await waitFor(closePredicate, 8000, `${label}:close:${i}`);
    const closed = snapshot(`${label}:close:${i}`);
    details.push({ iteration: i + 1, opened, closed });
  }
  return details;
}

export async function runUiRouteSmoke(options = {}) {
  const loops = Math.max(2, Number(options.loops || 6));
  const report = {
    ok: true,
    loops,
    cases: {},
    routeTraceTail: []
  };

  try {
    await waitFor(() => window.__RENDER_DEBUG__?.currentMapId === "menu_main", 15000, "menu_main");
    await clickAction("menu_go_load");
    await waitFor(() => document.body?.dataset?.menuPage === "menu_load", 8000, "menu_load");
    await loadSlotToMap("menu_load:2", "bayport_clinic");

    report.cases.mapInventory = await repeatOverlayCycle({
      label: "map_inventory",
      openActionId: "ui_open_inventory",
      openPredicate: () => !!document.querySelector("#inventory-overlay-host .inventory-overlay"),
      closePredicate: () => !document.querySelector("#inventory-overlay-host .inventory-overlay"),
      iterations: loops
    });

    report.cases.mapTasks = await repeatOverlayCycle({
      label: "map_tasks",
      openActionId: "ui_tasks_open",
      openPredicate: () => !!document.querySelector("#tasks-overlay-host .tasks-overlay"),
      closePredicate: () => !document.querySelector("#tasks-overlay-host .tasks-overlay"),
      iterations: loops
    });

    await clickAction("menu_go_load");
    await waitFor(() => document.body?.dataset?.menuPage === "menu_load", 8000, "menu_load_again");
    await loadSlotToMap("menu_load:2", "bayport_clinic");
    report.cases.afterLoadInventory = await repeatOverlayCycle({
      label: "after_load_inventory",
      openActionId: "ui_open_inventory",
      openPredicate: () => !!document.querySelector("#inventory-overlay-host .inventory-overlay"),
      closePredicate: () => !document.querySelector("#inventory-overlay-host .inventory-overlay"),
      iterations: loops
    });

    const beforeTransitionMapId = String(window.__RENDER_DEBUG__?.currentMapId || "");
    const movementButton = await waitFor(
      () => document.querySelector("#choices .journal-action-group-movement [data-action-id]"),
      8000,
      "movement action"
    );
    const transitionActionId = String(movementButton?.getAttribute("data-action-id") || "").trim();
    if (!transitionActionId) {
      throw new Error("no transition action id");
    }
    await runAction(transitionActionId);
    await waitFor(() => String(window.__RENDER_DEBUG__?.currentMapId || "") !== beforeTransitionMapId, 8000, "map transition");
    report.cases.afterTransition = {
      inventory: await repeatOverlayCycle({
        label: "after_transition_inventory",
        openActionId: "ui_open_inventory",
        openPredicate: () => !!document.querySelector("#inventory-overlay-host .inventory-overlay"),
        closePredicate: () => !document.querySelector("#inventory-overlay-host .inventory-overlay"),
        iterations: loops
      }),
      tasks: await repeatOverlayCycle({
        label: "after_transition_tasks",
        openActionId: "ui_tasks_open",
        openPredicate: () => !!document.querySelector("#tasks-overlay-host .tasks-overlay"),
        closePredicate: () => !document.querySelector("#tasks-overlay-host .tasks-overlay"),
        iterations: loops
      })
    };

    report.routeTraceTail = Array.isArray(window.__UI_ROUTE_TRACE__)
      ? window.__UI_ROUTE_TRACE__.slice(-80)
      : [];

    const violation = report.routeTraceTail.find((entry) => entry?.violationCode === "route_contract_violation");
    report.contractViolationFound = !!violation;
    report.contractViolationSample = violation || null;

    window.__UI_ROUTE_SMOKE_REPORT__ = report;
    return report;
  } catch (error) {
    report.ok = false;
    report.error = String(error?.message || error);
    report.state = snapshot("failure");
    report.routeTraceTail = Array.isArray(window.__UI_ROUTE_TRACE__)
      ? window.__UI_ROUTE_TRACE__.slice(-80)
      : [];
    window.__UI_ROUTE_SMOKE_REPORT__ = report;
    return report;
  }
}
