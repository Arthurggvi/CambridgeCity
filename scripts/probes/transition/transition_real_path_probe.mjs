import { chromium } from "playwright";
import fs from "fs/promises";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:5500/index.html", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);

const result = await page.evaluate(async () => {
  const dispatchMod = await import("/src/engine/pipeline/dispatch.js");
  const policyMod = await import("/src/engine/transition_policy.js");
  const { dispatch, getTransitionRuntimeOwnerSnapshot } = dispatchMod;
  const { resolveTransitionPolicy } = policyMod;

  const actionId = "menu_go_load";
  const prevMapId = String(window.gameState?.currentMapId || "menu_main");
  const policy = resolveTransitionPolicy({
    actionId,
    prevMapId,
    nextMapId: "menu_load",
    prevSurface: { mapId: prevMapId, pageType: "menu", overlayType: null, modalType: null },
    nextSurface: { mapId: "menu_load", pageType: "menu", overlayType: null, modalType: null },
    pageType: "menu",
    overlayType: null,
    modalType: null
  });

  const timeline = [];
  const run = dispatch(actionId);
  const start = performance.now();
  for (let i = 0; i < 30; i++) {
    const snap = getTransitionRuntimeOwnerSnapshot();
    timeline.push({
      tMs: Math.round(performance.now() - start),
      phase: String(snap?.phase || ""),
      hostExists: !!snap?.hostExists,
      owner: String(snap?.owner || ""),
      hostCreatedCount: Number(snap?.hostCreatedCount || 0),
      cancelReason: String(snap?.cancelReason || "")
    });
    await new Promise((r) => setTimeout(r, 80));
  }
  try { await run; } catch (_e) {}

  const trace = Array.isArray(window.__TRANSITION_POLICY_TRACE__) ? window.__TRANSITION_POLICY_TRACE__ : [];
  const traceTail = trace.slice(-5);
  const nonIdle = timeline.find((x) => x.phase && x.phase !== "idle") || null;

  return {
    route: { from: prevMapId, actionId, to: "menu_load" },
    policy,
    policyTraceTail: traceTail,
    dispatchCallsite: "dispatch -> shouldPlayMenuAtmosphereByPolicy -> playMenuAtmosphereIn",
    nonIdle,
    after: getTransitionRuntimeOwnerSnapshot()
  };
});

await fs.writeFile("./reports/generated/transition/transition_real_path_validation.json", JSON.stringify(result, null, 2), "utf-8");
await browser.close();
console.log(JSON.stringify({ ok: true, nonIdle: !!result.nonIdle, mode: result.policy?.mode, allowCinematic: result.policy?.allowCinematic }, null, 2));
