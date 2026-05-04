import { chromium } from "playwright";
import fs from "fs/promises";

const BASE = "http://127.0.0.1:5500";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const result = await page.evaluate(async () => {
    const dispatchMod = await import("/src/engine/pipeline/dispatch.js");
    const policyMod = await import("/src/engine/transition_policy.js");
    const { dispatch, getTransitionRuntimeOwnerSnapshot } = dispatchMod;
    const { resolveTransitionPolicy } = policyMod;

    const waitForStableIdle = async () => {
      let stableTicks = 0;
      for (let i = 0; i < 80; i++) {
        const snap = getTransitionRuntimeOwnerSnapshot();
        if (String(snap?.phase || "") === "idle") {
          stableTicks += 1;
          if (stableTicks >= 6) return true;
        } else {
          stableTicks = 0;
        }
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return false;
    };

    // Move to menu_load first (real menu context), then validate a non-cinematic action.
    try {
      await dispatch("menu_go_load");
    } catch (_e) {
      // keep going for policy/snapshot inspection
    }

    await waitForStableIdle();

    const actionId = "menu_add_slot";
    const prevMapId = String(window.gameState?.currentMapId || "menu_load");

    const policy = resolveTransitionPolicy({
      actionId,
      prevMapId,
      nextMapId: prevMapId,
      prevSurface: { mapId: prevMapId, pageType: "menu", overlayType: null, modalType: null },
      nextSurface: { mapId: prevMapId, pageType: "menu", overlayType: null, modalType: null },
      pageType: "menu",
      overlayType: null,
      modalType: null
    });

    const timeline = [];
    const start = performance.now();

    let dispatchError = null;
    const run = dispatch(actionId).catch((err) => {
      dispatchError = String(err?.message || err || "dispatch_error");
      return null;
    });

    for (let i = 0; i < 28; i++) {
      const snap = getTransitionRuntimeOwnerSnapshot();
      timeline.push({
        tMs: Math.round(performance.now() - start),
        phase: String(snap?.phase || ""),
        hostExists: !!snap?.hostExists,
        owner: String(snap?.owner || ""),
        hostCreatedCount: Number(snap?.hostCreatedCount || 0),
        cancelReason: String(snap?.cancelReason || "")
      });
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    await run;

    const nonIdle = timeline.find((item) => item.phase && item.phase !== "idle") || null;
    const trace = Array.isArray(window.__TRANSITION_POLICY_TRACE__) ? window.__TRANSITION_POLICY_TRACE__ : [];

    return {
      route: {
        from: prevMapId,
        actionId,
        to: prevMapId
      },
      policy,
      dispatchError,
      policyTraceTail: trace.slice(-5),
      nonIdle,
      timelineTail: timeline.slice(-12),
      after: getTransitionRuntimeOwnerSnapshot()
    };
  });

  await fs.writeFile("./reports/generated/transition/transition_negative_validation.json", JSON.stringify(result, null, 2), "utf-8");
  await browser.close();

  console.log(JSON.stringify({ ok: true, nonIdle: !!result.nonIdle, mode: result.policy?.mode, allowCinematic: result.policy?.allowCinematic }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
