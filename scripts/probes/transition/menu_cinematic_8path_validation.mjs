import { chromium } from "playwright";
import fs from "fs/promises";

const BASE = "http://127.0.0.1:5500";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const result = await page.evaluate(async () => {
    const dispatchMod = await import("/src/engine/pipeline/dispatch.js");
    const policyMod = await import("/src/engine/transition_policy.js");
    const settingsMod = await import("/src/save/settings_manager.js");
    const saveMod = await import("/src/save/save_manager.js");
    const stateMod = await import("/src/engine/state.js");

    const { dispatch, getTransitionRuntimeOwnerSnapshot } = dispatchMod;
    const { resolveTransitionPolicy } = policyMod;
    const { settingsManager } = settingsMod;
    const { saveManager } = saveMod;
    const { gameState } = stateMod;

    settingsManager.saveSettings({
      confirmDangerous: false,
      confirmDeleteSave: false
    });
    settingsManager.applyToDocument();

    const isMenuMapId = (mapId) => {
      const id = String(mapId || "").trim();
      return id === "menu" || id === "menu_more" || id.startsWith("menu_");
    };

    const waitForMap = async (expectedMapId, timeoutMs = 15000) => {
      const start = performance.now();
      while (performance.now() - start < timeoutMs) {
        const current = String(gameState?.currentMapId || gameState?.world?.currentMapId || "");
        if (current === expectedMapId) return true;
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      return false;
    };

    const waitForAnyMapChange = async (beforeMapId, timeoutMs = 15000) => {
      const start = performance.now();
      while (performance.now() - start < timeoutMs) {
        const current = String(gameState?.currentMapId || gameState?.world?.currentMapId || "");
        if (current && current !== beforeMapId) return current;
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      return String(gameState?.currentMapId || gameState?.world?.currentMapId || "");
    };

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
        await new Promise((resolve) => setTimeout(resolve, 70));
      }
    };

    const runPath = async (name, actionId) => {
      const beforeMapId = String(gameState?.currentMapId || gameState?.world?.currentMapId || "");
      const timeline = [];
      const start = performance.now();

      let stop = false;
      const sampler = (async () => {
        while (!stop) {
          const snap = getTransitionRuntimeOwnerSnapshot();
          timeline.push({
            tMs: Math.round(performance.now() - start),
            phase: String(snap?.phase || ""),
            hostExists: !!snap?.hostExists,
            owner: String(snap?.owner || "")
          });
          await new Promise((resolve) => setTimeout(resolve, 24));
        }
      })();

      let autoDialogStop = false;
      const autoDialogDriver = (async () => {
        while (!autoDialogStop) {
          const host = document.getElementById("notice-dialog-host");
          if (host && host.getAttribute("aria-hidden") === "false") {
            const buttons = Array.from(host.querySelectorAll(".notice-dialog-btn"));
            const button = buttons[buttons.length - 1] || buttons[0] || null;
            if (button) {
              button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 90));
        }
      })();

      let dispatchError = null;
      try {
        await dispatch(actionId);
      } catch (error) {
        dispatchError = String(error?.message || error || "dispatch_error");
      }
      autoDialogStop = true;
      await autoDialogDriver;
      stop = true;
      await sampler;
      await waitForStableIdle();

      const afterMapId = String(gameState?.currentMapId || gameState?.world?.currentMapId || "");
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

      const nonIdleSample = timeline.find((item) => item.phase !== "idle") || null;
      const afterSnap = getTransitionRuntimeOwnerSnapshot();

      return {
        name,
        actionId,
        beforeMapId,
        afterMapId,
        dispatchError,
        allowCinematic: policy.allowCinematic === true,
        policyMode: String(policy.mode || ""),
        policySurfaceKind: String(policy.surfaceKind || ""),
        nonIdle: !!nonIdleSample,
        firstNonIdle: nonIdleSample,
        owner: String(afterSnap?.owner || ""),
        hostExists: !!afterSnap?.hostExists,
        finalPhase: String(afterSnap?.phase || ""),
        timelineTail: timeline.slice(-16)
      };
    };

    const ensureMenuMain = async () => {
      const current = String(gameState?.currentMapId || gameState?.world?.currentMapId || "");
      if (current === "menu_main") return;
      try {
        await dispatch("menu_exit_main");
      } catch (_error) {
        // ignore and continue to fallback checks
      }
      if (String(gameState?.currentMapId || gameState?.world?.currentMapId || "") !== "menu_main") {
        await waitForMap("menu_main", 8000);
      }
      await waitForStableIdle();
    };

    await waitForMap("menu_main", 12000);
    await waitForStableIdle();

    const rows = [];

    rows.push(await runPath("P1 menu_main -> menu_new_game -> gameplay", "menu_new_game"));

    try {
      await dispatch("save_to_slot_auto");
    } catch (_error) {
      // best effort: continue path may still use existing auto slot
    }
    await waitForStableIdle();

    await ensureMenuMain();
    rows.push(await runPath("P2 menu_main -> menu_continue_auto -> gameplay", "menu_continue_auto"));

    await ensureMenuMain();
    await runPath("setup menu_main -> menu_load", "menu_go_load");

    const slots = saveManager.listSlots();
    const preferred = slots.find((s) => !s.isEmpty && !s.corrupted && Number.isFinite(Number(s.slotId)));
    const loadAction = preferred ? `menu_load:${preferred.slotId}` : "menu_load:auto";
    rows.push(await runPath("P3 menu_load -> menu_load:* -> gameplay", loadAction));

    await ensureMenuMain();
    rows.push(await runPath("N4 menu_main -> menu_load", "menu_go_load"));

    await ensureMenuMain();
    rows.push(await runPath("N5 menu_main -> settings", "menu_go_settings"));

    rows.push(await runPath("N6 settings -> menu_main", "menu_back_main"));

    await ensureMenuMain();
    rows.push(await runPath("N7 menu_main -> developer_info", "menu_go_credits"));

    rows.push(await runPath("N8 developer_info -> menu_main", "menu_back_main"));

    const expected = {
      P1: { allowCinematic: true, nonIdle: true },
      P2: { allowCinematic: true, nonIdle: true },
      P3: { allowCinematic: true, nonIdle: true },
      N4: { allowCinematic: false, nonIdle: false },
      N5: { allowCinematic: false, nonIdle: false },
      N6: { allowCinematic: false, nonIdle: false },
      N7: { allowCinematic: false, nonIdle: false },
      N8: { allowCinematic: false, nonIdle: false }
    };

    const keyed = {
      P1: rows[0],
      P2: rows[1],
      P3: rows[2],
      N4: rows[3],
      N5: rows[4],
      N6: rows[5],
      N7: rows[6],
      N8: rows[7]
    };

    const checks = Object.fromEntries(
      Object.entries(keyed).map(([key, row]) => [
        key,
        {
          allowCinematicOk: row.allowCinematic === expected[key].allowCinematic,
          nonIdleOk: row.nonIdle === expected[key].nonIdle,
          ownerOk: expected[key].nonIdle ? row.owner === "runtime/transition_owner" : true,
          hostExistsOk: expected[key].nonIdle ? row.hostExists === true : true,
          finalPhaseIdleOk: row.finalPhase === "idle"
        }
      ])
    );

    return {
      ok: true,
      rows,
      checks
    };
  });

  await fs.writeFile("./reports/generated/transition/menu_cinematic_8path_validation.json", JSON.stringify(result, null, 2), "utf-8");
  await browser.close();

  console.log(JSON.stringify({ ok: true, checks: result.checks }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
