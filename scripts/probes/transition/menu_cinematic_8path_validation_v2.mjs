import { chromium } from "playwright";
import fs from "fs/promises";

const BASE = "http://127.0.0.1:5500";

async function runCase(browser, name, setupActions, targetAction) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const row = await page.evaluate(async ({ name, setupActions, targetAction }) => {
    const dispatchMod = await import("/src/engine/pipeline/dispatch.js");
    const transitionCoordinatorMod = await import("/src/engine/menu_transition_coordinator.js");
    const policyMod = await import("/src/engine/transition_policy.js");
    const settingsMod = await import("/src/save/settings_manager.js");
    const stateMod = await import("/src/engine/state.js");

    const { dispatch, getTransitionRuntimeOwnerSnapshot } = dispatchMod;
    const { dispatchWithMenuTransitionCoordinator } = transitionCoordinatorMod;
    const { resolveTransitionPolicy } = policyMod;
    const { settingsManager } = settingsMod;

    settingsManager.saveSettings({
      confirmDangerous: false,
      confirmDeleteSave: false
    });
    settingsManager.applyToDocument();

    const isMenuMapId = (mapId) => {
      const id = String(mapId || "").trim();
      return id === "menu" || id === "menu_more" || id.startsWith("menu_");
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const waitForStableIdle = async () => {
      let stable = 0;
      for (let i = 0; i < 120; i++) {
        const snap = getTransitionRuntimeOwnerSnapshot();
        if (String(snap?.phase || "") === "idle") {
          stable += 1;
          if (stable >= 6) return;
        } else {
          stable = 0;
        }
        await sleep(70);
      }
    };

    const runAction = async (actionId, measured = false) => {
      const beforeMapId = String(stateMod.gameState?.currentMapId || stateMod.gameState?.world?.currentMapId || "");
      const timeline = [];
      const traceBefore = Array.isArray(window.__TRANSITION_POLICY_TRACE__)
        ? window.__TRANSITION_POLICY_TRACE__.length
        : 0;

      let stopTimeline = false;
      const timelineTask = (async () => {
        while (!stopTimeline) {
          if (measured) {
            const snap = getTransitionRuntimeOwnerSnapshot();
            timeline.push({
              phase: String(snap?.phase || "idle"),
              owner: String(snap?.owner || ""),
              hostExists: !!snap?.hostExists
            });
          }
          await sleep(24);
        }
      })();

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
          await sleep(90);
        }
      })();

      let dispatchError = null;
      let dispatchReturn = null;
      try {
        dispatchReturn = await dispatchWithMenuTransitionCoordinator(actionId, {}, { returnReport: true });
      } catch (error) {
        dispatchError = String(error?.message || error || "dispatch_error");
      }

      stopAutoDialog = true;
      await autoDialogTask;
      stopTimeline = true;
      await timelineTask;
      await waitForStableIdle();

      const afterMapId = String(stateMod.gameState?.currentMapId || stateMod.gameState?.world?.currentMapId || "");
      const traceAfterAll = Array.isArray(window.__TRANSITION_POLICY_TRACE__)
        ? window.__TRANSITION_POLICY_TRACE__.slice(traceBefore)
        : [];
      const actionTrace = traceAfterAll.filter((entry) => String(entry?.actionId || "") === String(actionId || ""));
      const policy = resolveTransitionPolicy({
        actionId,
        prevMapId: beforeMapId,
        nextMapId: afterMapId,
        prevSurface: {
          mapId: beforeMapId,
          pageType: isMenuMapId(beforeMapId) ? "menu" : "map",
          overlayType: null,
          modalType: null
        },
        nextSurface: {
          mapId: afterMapId,
          pageType: isMenuMapId(afterMapId) ? "menu" : "map",
          overlayType: null,
          modalType: null
        },
        pageType: isMenuMapId(afterMapId) ? "menu" : "map",
        overlayType: null,
        modalType: null
      });

      const nonIdleSample = measured ? (timeline.find((x) => x.phase !== "idle") || null) : null;
      const finalSnap = getTransitionRuntimeOwnerSnapshot();

      return {
        actionId,
        beforeMapId,
        afterMapId,
        dispatchError,
        dispatchReturnOk: dispatchReturn?.ok ?? null,
        dispatchReason: dispatchReturn?.reason ?? null,
        loadSlotOk: Array.isArray(dispatchReturn?.report?.sysCalls)
          ? (dispatchReturn.report.sysCalls.find((entry) => entry?.call?.type === "LOAD_SLOT")?.result?.ok ?? null)
          : null,
        loadSlotMapId: Array.isArray(dispatchReturn?.report?.sysCalls)
          ? String(dispatchReturn.report.sysCalls.find((entry) => entry?.call?.type === "LOAD_SLOT")?.result?.mapId || "")
          : "",
        traceAllowCinematic: actionTrace.some((entry) => entry?.allowCinematic === true),
        traceSurfaceKinds: Array.from(new Set(actionTrace.map((entry) => String(entry?.surfaceKind || "")))),
        traceModes: Array.from(new Set(actionTrace.map((entry) => String(entry?.mode || "")))),
        allowCinematic: policy.allowCinematic === true,
        policyMode: String(policy.mode || ""),
        policySurfaceKind: String(policy.surfaceKind || ""),
        nonIdle: measured ? !!nonIdleSample : null,
        firstNonIdle: nonIdleSample,
        finalPhase: String(finalSnap?.phase || ""),
        owner: String(finalSnap?.owner || ""),
        hostExists: !!finalSnap?.hostExists
      };
    };

    for (const actionId of setupActions || []) {
      await runAction(actionId, false);
    }

    const measured = await runAction(targetAction, true);
    return { name, ...measured };
  }, { name, setupActions, targetAction });

  await page.close();
  return row;
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  const cases = [
    {
      key: "P1",
      name: "menu_main -> 新建游戏 -> 首个游戏地图",
      setup: [],
      action: "menu_new_game"
    },
    {
      key: "P2",
      name: "menu_main -> 继续游戏 -> 恢复到游戏地图",
      setup: ["menu_new_game", "save_to_slot_auto", "menu_exit_main"],
      action: "menu_continue_auto"
    },
    {
      key: "P3",
      name: "menu_load -> 读取成功 -> 进入游戏地图",
      setup: ["menu_new_game", "save_to_slot_1", "menu_exit_main", "menu_go_load"],
      action: "menu_load:1"
    },
    {
      key: "N4",
      name: "menu_main -> menu_load",
      setup: [],
      action: "menu_go_load"
    },
    {
      key: "N5",
      name: "menu_main -> settings",
      setup: [],
      action: "menu_go_settings"
    },
    {
      key: "N6",
      name: "settings -> menu_main",
      setup: ["menu_go_settings"],
      action: "menu_back_main"
    },
    {
      key: "N7",
      name: "menu_main -> developer_info",
      setup: [],
      action: "menu_go_credits"
    },
    {
      key: "N8",
      name: "developer_info -> menu_main",
      setup: ["menu_go_credits"],
      action: "menu_back_main"
    }
  ];

  const rows = [];
  for (const item of cases) {
    const row = await runCase(browser, item.name, item.setup, item.action);
    rows.push({ key: item.key, ...row });
  }

  await browser.close();

  const report = { ok: true, rows };
  await fs.writeFile("./reports/generated/transition/menu_cinematic_8path_validation_v2.json", JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify({
    ok: true,
    summary: rows.map((row) => ({
      key: row.key,
      allowCinematic: row.allowCinematic,
      nonIdle: row.nonIdle,
      beforeMapId: row.beforeMapId,
      afterMapId: row.afterMapId,
      owner: row.owner,
      hostExists: row.hostExists,
      finalPhase: row.finalPhase
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
