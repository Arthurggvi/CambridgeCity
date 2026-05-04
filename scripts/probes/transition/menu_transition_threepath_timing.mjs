import { chromium } from "playwright";
import fs from "fs/promises";

const BASE = "http://127.0.0.1:5500";

async function runCase(browser, { key, setupActions, targetAction }) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const row = await page.evaluate(async ({ key, setupActions, targetAction }) => {
    const coordinatorMod = await import("/src/engine/menu_transition_coordinator.js");
    const settingsMod = await import("/src/save/settings_manager.js");
    const stateMod = await import("/src/engine/state.js");

    const { dispatchWithMenuTransitionCoordinator } = coordinatorMod;
    const { settingsManager } = settingsMod;

    settingsManager.saveSettings({ confirmDangerous: false, confirmDeleteSave: false });
    settingsManager.applyToDocument();

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const runAction = async (actionId) => {
      let stopAutoDialog = false;
      const autoDialogTask = (async () => {
        while (!stopAutoDialog) {
          const host = document.getElementById("notice-dialog-host");
          if (host && host.getAttribute("aria-hidden") === "false") {
            const buttons = Array.from(host.querySelectorAll(".notice-dialog-btn"));
            const button = buttons[buttons.length - 1] || buttons[0] || null;
            if (button) {
              button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            }
          }
          await sleep(80);
        }
      })();

      let out = null;
      try {
        out = await dispatchWithMenuTransitionCoordinator(actionId, {}, { returnReport: true });
      } finally {
        stopAutoDialog = true;
        await autoDialogTask;
      }
      await sleep(220);
      return out;
    };

    for (const actionId of setupActions || []) {
      await runAction(actionId);
    }

    const traceBefore = Array.isArray(window.__MENU_TRANSITION_COORDINATOR_TRACE__)
      ? window.__MENU_TRANSITION_COORDINATOR_TRACE__.length
      : 0;

    const result = await runAction(targetAction);

    const traceAll = Array.isArray(window.__MENU_TRANSITION_COORDINATOR_TRACE__)
      ? window.__MENU_TRANSITION_COORDINATOR_TRACE__
      : [];

    const trace = traceAll.slice(traceBefore).filter((entry) => String(entry?.actionId || "") === String(targetAction || ""));

    const stages = ["click", "playIn start", "dispatch start", "render:surface gameplay stable", "playOut start"];
    const stageRows = stages.map((stage) => ({
      stage,
      row: trace.find((entry) => String(entry?.stage || "") === stage) || null
    }));

    const indexOfStage = (name) => trace.findIndex((entry) => String(entry?.stage || "") === name);
    const idx = {
      click: indexOfStage("click"),
      playIn: indexOfStage("playIn start"),
      dispatch: indexOfStage("dispatch start"),
      stable: indexOfStage("render:surface gameplay stable"),
      playOut: indexOfStage("playOut start")
    };

    const ordered = idx.click >= 0
      && idx.playIn > idx.click
      && idx.dispatch > idx.playIn
      && idx.stable > idx.dispatch
      && idx.playOut > idx.stable;

    const playInLive = stageRows.find((x) => x.stage === "playIn start")?.row?.liveSurface || null;
    const stableLive = stageRows.find((x) => x.stage === "render:surface gameplay stable")?.row?.liveSurface || null;

    const loadSlot = Array.isArray(result?.report?.sysCalls)
      ? result.report.sysCalls.find((entry) => entry?.call?.type === "LOAD_SLOT")
      : null;

    return {
      key,
      targetAction,
      dispatchOk: !!result?.ok,
      reason: result?.reason || null,
      finalMapId: String(stateMod.gameState?.currentMapId || ""),
      loadSlotOk: loadSlot?.result?.ok ?? null,
      loadSlotMapId: String(loadSlot?.result?.mapId || ""),
      ordered,
      playInMenuLike: playInLive ? !!playInLive.isMenuLike : null,
      stableGameplayLike: stableLive ? !!stableLive.isGameplayLike : null,
      stageRows: stageRows.map((item) => ({
        stage: item.stage,
        missing: !item.row,
        stable: item.row?.stable === true,
        liveSurface: item.row?.liveSurface || null
      }))
    };
  }, { key, setupActions, targetAction });

  await page.close();
  return row;
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  const cases = [
    { key: "new_game", setupActions: [], targetAction: "menu_new_game" },
    { key: "continue", setupActions: ["menu_new_game", "save_to_slot_auto", "menu_exit_main"], targetAction: "menu_continue_auto" },
    { key: "load_success", setupActions: ["menu_new_game", "save_to_slot_1", "menu_exit_main", "menu_go_load"], targetAction: "menu_load:1" }
  ];

  const rows = [];
  for (const item of cases) {
    rows.push(await runCase(browser, item));
  }

  await browser.close();

  const out = { ok: true, rows };
  await fs.writeFile("./reports/generated/transition/menu_transition_threepath_timing.json", JSON.stringify(out, null, 2), "utf-8");

  console.log(JSON.stringify({
    ok: true,
    summary: rows.map((row) => ({
      key: row.key,
      dispatchOk: row.dispatchOk,
      ordered: row.ordered,
      playInMenuLike: row.playInMenuLike,
      stableGameplayLike: row.stableGameplayLike,
      finalMapId: row.finalMapId,
      loadSlotOk: row.loadSlotOk,
      loadSlotMapId: row.loadSlotMapId
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
