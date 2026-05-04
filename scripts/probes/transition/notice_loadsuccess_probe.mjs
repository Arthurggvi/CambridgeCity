import { chromium } from "playwright";
import fs from "fs/promises";

const URL = `http://127.0.0.1:5500/?probe_notice_load=${Date.now()}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);

const snap = (phase) => {
  function pickComputed(el) {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      opacity: cs.opacity,
      transform: cs.transform,
      transitionProperty: cs.transitionProperty,
      transitionDuration: cs.transitionDuration,
      animationName: cs.animationName,
      animationDuration: cs.animationDuration
    };
  }
  const host = document.getElementById("notice-dialog-host");
  const overlay = host?.querySelector?.(".notice-dialog-overlay") || null;
  const card = host?.querySelector?.(".notice-dialog-card") || null;
  return {
    phase,
    hostClass: host?.className || null,
    hostAria: host?.getAttribute("aria-hidden") || null,
    overlayClass: overlay?.className || null,
    cardClass: card?.className || null,
    overlayComputed: pickComputed(overlay),
    cardComputed: pickComputed(card)
  };
};

await page.evaluate(async () => {
  const mod = await import("/src/ui/dialogs.js");
  void mod.showNoticeDialog({
    title: "probe",
    message: "probe",
    closeTransition: "load-success",
    forceAnimation: true,
    actions: [{ id: "ok", label: "确定", kind: "primary" }]
  });
});

const out = { url: URL, timeline: {} };
await page.waitForSelector("#notice-dialog-host[aria-hidden='false'] .notice-dialog-card", { timeout: 8000 });
out.timeline.open = await page.evaluate(snap, "open");

await page.click("#notice-dialog-host .notice-dialog-btn");
out.timeline.close_trigger = await page.evaluate(snap, "close_trigger");
await page.waitForTimeout(120);
out.timeline.close_120ms = await page.evaluate(snap, "close_120ms");
await page.waitForTimeout(220);
out.timeline.close_340ms = await page.evaluate(snap, "close_340ms");
await page.waitForTimeout(220);
out.timeline.close_560ms = await page.evaluate(snap, "close_560ms");

console.log(JSON.stringify(out, null, 2));
await fs.writeFile("./qa/evidence/ui/notice_loadsuccess_evidence.json", `${JSON.stringify(out, null, 2)}\n`, "utf8");
await browser.close();
