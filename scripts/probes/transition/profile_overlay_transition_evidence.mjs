import { chromium } from "playwright";
import fs from "node:fs";

const URL = `http://127.0.0.1:5500/?probe_profile_overlay=${Date.now()}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const out = {
  url: URL,
  open_first_frame: null,
  open_after_2_frames: null,
  close_120ms: null,
  errors: {
    pageErrors: [],
    consoleErrors: []
  }
};

page.on("pageerror", (error) => {
  out.errors.pageErrors.push(String(error?.message || error));
});

page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  const text = msg.text();
  if (/ValidateAllMaps|ParseError data\/maps|Missing target mapId/i.test(text)) return;
  out.errors.consoleErrors.push(text);
});

function snapshotInPage() {
  const host = document.getElementById("profile-overlay-host");
  const root = host?.querySelector?.(".profile-page-overlay") || null;
  const panel = host?.querySelector?.(".profile-page-dialog") || null;
  const backdrop = host?.querySelector?.(".profile-page-backdrop") || null;
  const pickComputed = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      opacity: cs.opacity,
      transform: cs.transform
    };
  };
  const panelState = pickComputed(panel);
  const backdropState = pickComputed(backdrop);
  const rootState = pickComputed(root);
  const panelInlineTransform = panel?.style?.transform || "";
  const panelTransform = panelInlineTransform || panelState?.transform || null;
  const panelInlineOpacity = panel?.style?.opacity || "";
  const backdropInlineOpacity = backdrop?.style?.opacity || "";
  const panelOpacity = panelInlineOpacity
    ? String(Number(panelInlineOpacity).toFixed(6))
    : panelState?.opacity == null || rootState?.opacity == null
    ? null
    : String((Number(panelState.opacity) * Number(rootState.opacity)).toFixed(6));
  const backdropOpacity = backdropInlineOpacity
    ? String(Number(backdropInlineOpacity).toFixed(6))
    : backdropState?.opacity == null || rootState?.opacity == null
    ? null
    : String((Number(backdropState.opacity) * Number(rootState.opacity)).toFixed(6));
  return {
    mounted: !!root,
    rootClass: root?.className || null,
    panelOpacity,
    panelTransform,
    backdropOpacity
  };
}

async function dismissNotice(maxRounds = 36) {
  for (let i = 0; i < maxRounds; i += 1) {
    const btn = page.locator("#notice-dialog-host .notice-dialog-btn").last();
    const count = await btn.count();
    if (!count) {
      await page.waitForTimeout(90);
      continue;
    }
    await btn.click({ timeout: 400 }).catch(() => {});
    await page.waitForTimeout(120);
  }
}

try {
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  let profileButtonVisible = await page.locator("#player-sidebar [data-action-id='ui_profile_open']").first().isVisible({ timeout: 1200 }).catch(() => false);
  if (!profileButtonVisible) {
    const newGameButton = page.locator("[data-action-id='menu_new_game']").first();
    if (await newGameButton.count()) {
      await newGameButton.click({ timeout: 6000 });
      await dismissNotice(44);
      await page.waitForTimeout(900);
    }

    await page.evaluate(async () => {
      const stateMod = await import("/src/engine/state.js");
      const rendererMod = await import("/src/engine/renderer.js");
      if (!stateMod.gameState.world) stateMod.gameState.world = {};
      if (!stateMod.gameState.world.flags) stateMod.gameState.world.flags = {};
      stateMod.gameState.world.flags.dossierUnlocked = true;
      rendererMod.render();
    });

    profileButtonVisible = await page.locator("#player-sidebar [data-action-id='ui_profile_open']").first().isVisible({ timeout: 7000 }).catch(() => false);
  }

  if (!profileButtonVisible) {
    throw new Error("profile open button not visible");
  }

  const openCapturePromise = page.evaluate(() => {
    return new Promise((resolve) => {
      const host = document.getElementById("profile-overlay-host");
      if (!host) {
        resolve(null);
        return;
      }
      const snap = () => {
        const root = host.querySelector(".profile-page-overlay");
        const panel = host.querySelector(".profile-page-dialog");
        const backdrop = host.querySelector(".profile-page-backdrop");
        const pickComputed = (el) => {
          if (!el) return null;
          const cs = getComputedStyle(el);
          return {
            opacity: cs.opacity,
            transform: cs.transform
          };
        };
        const rootState = pickComputed(root);
        const panelState = pickComputed(panel);
        const backdropState = pickComputed(backdrop);
        const panelInlineTransform = panel?.style?.transform || "";
        return {
          mounted: !!root,
          rootClass: root?.className || null,
          panelOpacity: panelState?.opacity == null || rootState?.opacity == null
            ? null
            : String((Number(panelState.opacity) * Number(rootState.opacity)).toFixed(6)),
          panelTransform: panelInlineTransform || panelState?.transform || null,
          backdropOpacity: backdropState?.opacity == null || rootState?.opacity == null
            ? null
            : String((Number(backdropState.opacity) * Number(rootState.opacity)).toFixed(6))
        };
      };

      const capture = () => {
        const root = host.querySelector(".profile-page-overlay");
        if (!root) return false;
        const first = snap();
        setTimeout(() => {
          const second = snap();
          resolve({ first, second });
        }, 50);
        return true;
      };

      if (capture()) return;
      const observer = new MutationObserver(() => {
        if (capture()) {
          observer.disconnect();
        }
      });
      observer.observe(host, { childList: true, subtree: true });
    });
  });

  await page.click("#player-sidebar [data-action-id='ui_profile_open']", { timeout: 7000 });
  const openCapture = await openCapturePromise;
  if (!openCapture) throw new Error("failed to capture open frames");

  out.open_first_frame = openCapture.first;
  out.open_after_2_frames = openCapture.second;

  await page.waitForSelector("#profile-overlay-host[aria-hidden='false'] .profile-page-overlay", { timeout: 10000 });

  await page.click("#profile-overlay-host .profile-page-close", { timeout: 4000 });
  await page.waitForTimeout(120);
  out.close_120ms = await page.evaluate(snapshotInPage);
} catch (error) {
  out.error = {
    message: error?.message || String(error),
    stack: error?.stack || null
  };
}

fs.writeFileSync("./qa/evidence/ui/profile_overlay_transition_evidence.json", `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(JSON.stringify(out, null, 2));
await browser.close();
