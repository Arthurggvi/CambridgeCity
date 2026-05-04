import { chromium } from "playwright";
import fs from "fs/promises";

const URL = `http://127.0.0.1:5500/?probe_menu_transition=${Date.now()}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);

function snap(phase) {
  function pick(el) {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      opacity: cs.opacity,
      transform: cs.transform,
      transitionDuration: cs.transitionDuration,
      animationName: cs.animationName,
      animationDuration: cs.animationDuration
    };
  }
  const overlay = document.getElementById("menu-transition-overlay");
  const gameRoot = document.getElementById("game-root");
  return {
    phase,
    bodyClass: document.body.className,
    overlayClass: overlay?.className || null,
    overlayComputed: pick(overlay),
    gameRootComputed: pick(gameRoot)
  };
}

const out = { url: URL, timeline: {} };
out.timeline.before = await page.evaluate(snap, "before");

await page.click("[data-action-id='menu_new_game']");
await page.waitForTimeout(40);
out.timeline.t40 = await page.evaluate(snap, "t40");
await page.waitForTimeout(180);
out.timeline.t220 = await page.evaluate(snap, "t220");
await page.waitForTimeout(340);
out.timeline.t560 = await page.evaluate(snap, "t560");
await page.waitForTimeout(620);
out.timeline.t1180 = await page.evaluate(snap, "t1180");

console.log(JSON.stringify(out, null, 2));
await fs.writeFile("./qa/evidence/ui/menu_transition_overlay_evidence.json", `${JSON.stringify(out, null, 2)}\n`, "utf8");
await browser.close();
