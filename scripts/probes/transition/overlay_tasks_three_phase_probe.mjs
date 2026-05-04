import { chromium } from "playwright";
import fs from "node:fs";

const URL = `http://127.0.0.1:5500/?probe_tasks_overlay=${Date.now()}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const out = {
  url: URL,
  timeline: {}
};

try {
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);

  out.timeline = await page.evaluate(async () => {
    const pickComputed = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        opacity: cs.opacity,
        transform: cs.transform,
        transitionDuration: cs.transitionDuration,
        transitionProperty: cs.transitionProperty,
        animationName: cs.animationName,
        animationDuration: cs.animationDuration
      };
    };
    const snapshotInPage = (phase) => {
      const host = document.getElementById("tasks-overlay-host");
      const overlay = host?.querySelector?.(".tasks-overlay") || null;
      const panel = host?.querySelector?.(".tasks-dialog") || null;
      const backdrop = host?.querySelector?.(".tasks-backdrop") || null;
      return {
        phase,
        hostAria: host?.getAttribute("aria-hidden") || null,
        overlayClass: overlay?.className || null,
        panelClass: panel?.className || null,
        backdropClass: backdrop?.className || null,
        panelComputed: pickComputed(panel),
        backdropComputed: pickComputed(backdrop),
        mounted: !!overlay
      };
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const mod = await import("/src/engine/pipeline/dispatch.js");
    const stateMod = await import("/src/engine/state.js");
    const { settingsManager } = await import("/src/save/settings_manager.js");
    settingsManager.saveSettings({ confirmDangerous: false, confirmDeleteSave: false });
    settingsManager.applyToDocument();

    const auto = async (promise) => {
      let stop = false;
      const t = (async () => {
        while (!stop) {
          const host = document.getElementById("notice-dialog-host");
          if (host && host.getAttribute("aria-hidden") === "false") {
            const buttons = [...host.querySelectorAll(".notice-dialog-btn")];
            const btn = buttons[buttons.length - 1] || buttons[0];
            if (btn) btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          }
          await sleep(80);
        }
      })();
      try {
        await promise;
      } finally {
        stop = true;
        await t;
      }
      await sleep(220);
    };

    if (String(stateMod.gameState.currentMapId || "").startsWith("menu_")) {
      await auto(mod.dispatch("menu_new_game"));
    }

    await mod.dispatch("ui_tasks_open");
    await sleep(24);
    const openFirstFrame = snapshotInPage("open_first_frame");

    await sleep(34);
    const openAfterTwoFrames = snapshotInPage("open_after_2_frames");

    const closeBtn = document.querySelector("#tasks-overlay-host .tasks-close-btn");
    if (closeBtn instanceof HTMLElement) {
      closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }

    await sleep(150);
    const close150ms = snapshotInPage("close_150ms");

    await sleep(320);
    const closeAfterUnmount = snapshotInPage("close_after_unmount");

    return {
      open_first_frame: openFirstFrame,
      open_after_2_frames: openAfterTwoFrames,
      close_150ms: close150ms,
      close_after_unmount: closeAfterUnmount
    };
  });
} catch (error) {
  out.error = {
    message: error?.message || String(error),
    stack: error?.stack || null
  };
}

console.log(JSON.stringify(out, null, 2));
fs.writeFileSync("./reports/generated/transition/overlay_tasks_three_phase_probe_runtime.json", `${JSON.stringify(out, null, 2)}\n`, "utf8");
await browser.close();
