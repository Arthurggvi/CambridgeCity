import { chromium } from "playwright";
import fs from "fs/promises";

const URL = `http://127.0.0.1:5500/?probe_notice=${Date.now()}`;

function snapshot(phase) {
  function pickComputed(el) {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      opacity: cs.opacity,
      transform: cs.transform,
      transitionProperty: cs.transitionProperty,
      transitionDuration: cs.transitionDuration,
      animationName: cs.animationName,
      animationDuration: cs.animationDuration,
      display: cs.display,
      visibility: cs.visibility
    };
  }
  const host = document.getElementById("notice-dialog-host");
  const overlay = host?.querySelector?.(".notice-dialog-overlay") || null;
  const card = host?.querySelector?.(".notice-dialog-card") || null;
  return {
    phase,
    host: {
      exists: !!host,
      className: host?.className || null,
      ariaHidden: host?.getAttribute("aria-hidden") || null
    },
    overlay: {
      exists: !!overlay,
      className: overlay?.className || null,
      computed: pickComputed(overlay)
    },
    card: {
      exists: !!card,
      className: card?.className || null,
      computed: pickComputed(card)
    }
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(600);

const out = { url: URL, timeline: {} };
out.timeline.before_open = await page.evaluate(snapshot, "before_open");

await page.click("[data-action-id='menu_new_game']");
await page.waitForSelector("#notice-dialog-host[aria-hidden='false'] .notice-dialog-card", { timeout: 8000 });
out.timeline.open_visible = await page.evaluate(snapshot, "open_visible");

await page.click("#notice-dialog-host .notice-dialog-btn:last-child");
out.timeline.close_trigger = await page.evaluate(snapshot, "close_trigger");

await page.waitForTimeout(150);
out.timeline.close_150ms = await page.evaluate(snapshot, "close_150ms");

await page.waitForTimeout(220);
out.timeline.close_end = await page.evaluate(snapshot, "close_end");

console.log(JSON.stringify(out, null, 2));
await fs.writeFile("./qa/evidence/ui/notice_transition_evidence.json", `${JSON.stringify(out, null, 2)}\n`, "utf8");
await browser.close();
