import { chromium } from "playwright";
import fs from "node:fs";

const URL = `http://127.0.0.1:5500/?probe_tasks_close_path=${Date.now()}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const out = {
  url: URL,
  openPath: {
    events: [],
    mounted: null,
    rootClass: null
  },
  timeline: {},
  closePath: {
    events: [],
    unload: null,
    proof: null
  },
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
  out.errors.consoleErrors.push(msg.text());
});

async function dismissNoticeDialogs(maxRounds = 36) {
  for (let i = 0; i < maxRounds; i += 1) {
    const btn = page.locator("#notice-dialog-host .notice-dialog-btn").last();
    const count = await btn.count();
    if (!count) {
      await page.waitForTimeout(90);
      continue;
    }
    await btn.click({ timeout: 450 }).catch(() => {});
    await page.waitForTimeout(120);
  }
}

try {
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const tasksButton = page.locator("#player-sidebar [data-action-id='ui_tasks_open']").first();
  const hasTasksButton = await tasksButton.isVisible({ timeout: 1500 }).catch(() => false);
  if (!hasTasksButton) {
    const newGameButton = page.locator("[data-action-id='menu_new_game']").first();
    if (await newGameButton.count()) {
      await newGameButton.click({ timeout: 6000 });
      await dismissNoticeDialogs(44);
      await page.waitForTimeout(900);
    }
  }

  await page.waitForSelector("#player-sidebar [data-action-id='ui_tasks_open']", { timeout: 15000 });

  await page.evaluate(() => {
    if (window.__INTERACTION_AUDIT__?.clicks) {
      window.__INTERACTION_AUDIT__.clicks = [];
    }
  });

  await page.click("#player-sidebar [data-action-id='ui_tasks_open']", { timeout: 7000 });
  await page.waitForSelector("#tasks-overlay-host[aria-hidden='false'] .tasks-overlay", { timeout: 12000 });

  const openState = await page.evaluate(() => {
    const root = document.querySelector("#tasks-overlay-host .tasks-overlay");
    const auditClicks = Array.isArray(window.__INTERACTION_AUDIT__?.clicks)
      ? window.__INTERACTION_AUDIT__.clicks.slice(-8)
      : [];
    return {
      mounted: !!root,
      rootClass: root?.className || null,
      auditTail: auditClicks
    };
  });

  out.openPath.mounted = openState.mounted;
  out.openPath.rootClass = openState.rootClass;
  out.openPath.events = openState.auditTail;

  await page.evaluate(() => {
    const host = document.getElementById("tasks-overlay-host");
    if (!host) throw new Error("tasks overlay host missing");

    const now = () => Number(performance.now().toFixed(2));
    const events = [];
    const push = (type, extra = {}) => events.push({ t: now(), type, ...extra });

    const pickComputed = (el) => {
      if (!el) {
        return {
          opacity: null,
          transform: null
        };
      }
      const cs = getComputedStyle(el);
      return {
        opacity: cs.opacity,
        transform: cs.transform
      };
    };

    const sample = () => {
      const rootEl = host.querySelector(".tasks-overlay");
      const panelEl = host.querySelector(".tasks-dialog");
      const backdropEl = host.querySelector(".tasks-backdrop");
      const panelState = pickComputed(panelEl);
      const backdropState = pickComputed(backdropEl);
      return {
        mounted: !!rootEl,
        rootClass: rootEl?.className || null,
        panelOpacity: panelState.opacity,
        panelTransform: panelState.transform,
        backdropOpacity: backdropState.opacity
      };
    };

    document.addEventListener("transitionend", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("#tasks-overlay-host")) return;
      push("transitionend", {
        target: target.className || target.tagName,
        propertyName: event.propertyName || ""
      });
    }, true);

    document.addEventListener("animationend", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("#tasks-overlay-host")) return;
      push("animationend", {
        target: target.className || target.tagName,
        animationName: event.animationName || ""
      });
    }, true);

    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (fn, delay, ...args) => {
      const stack = String(new Error().stack || "");
      if (Number(delay) === 260 && stack.includes("waitForTasksOverlayCloseSignal")) {
        push("close_timeout_scheduled", { delay: Number(delay) });
      }
      return originalSetTimeout((...innerArgs) => {
        if (Number(delay) === 260 && stack.includes("waitForTasksOverlayCloseSignal")) {
          push("close_timeout_fired", { delay: Number(delay) });
        }
        return fn(...innerArgs);
      }, delay, ...args);
    };

    const originalClassAdd = DOMTokenList.prototype.add;
    DOMTokenList.prototype.add = function patchedClassAdd(...tokens) {
      const ret = originalClassAdd.apply(this, tokens);
      if (tokens.includes("is-closing")) {
        const rootEl = host.querySelector(".tasks-overlay");
        if (rootEl && this === rootEl.classList) {
          push("is_closing_added", {
            rootClass: rootEl.className,
            stack: String(new Error().stack || "")
          });
        }
      }
      return ret;
    };

    const innerHTMLDesc = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: true,
      enumerable: innerHTMLDesc?.enumerable ?? true,
      get: innerHTMLDesc?.get,
      set(value) {
        if (this === host && value === "") {
          push("host_innerHTML_clear", {
            stack: String(new Error().stack || "")
          });
        }
        return innerHTMLDesc.set.call(this, value);
      }
    });

    let beforeUnmount = null;
    let afterUnmount = null;
    let unmountAt = null;
    let stopPoll = false;

    const poll = () => {
      if (stopPoll) return;
      const s = sample();
      if (s.mounted) {
        beforeUnmount = { ...s };
      }
      if (!s.mounted && unmountAt == null) {
        unmountAt = now();
        afterUnmount = { ...s };
        push("dom_unmounted", { unmountAt });
      }
      originalSetTimeout(poll, 5);
    };
    poll();

    window.__tasksCloseProbe = {
      push,
      sample,
      getResult: () => ({
        events,
        beforeUnmount,
        afterUnmount
      }),
      stop: () => {
        stopPoll = true;
      }
    };
  });

  await page.evaluate(() => {
    window.__tasksCloseProbe.push("click_close_button");
    const closeBtn = document.querySelector("#tasks-overlay-host .tasks-close-btn");
    if (!(closeBtn instanceof HTMLElement)) {
      throw new Error("close button missing");
    }
    closeBtn.click();
  });

  const takeSample = async () => page.evaluate(() => window.__tasksCloseProbe.sample());

  out.timeline.close_0ms = await takeSample();
  await page.waitForTimeout(40);
  out.timeline.close_40ms = await takeSample();
  await page.waitForTimeout(40);
  out.timeline.close_80ms = await takeSample();
  await page.waitForTimeout(40);
  out.timeline.close_120ms = await takeSample();
  await page.waitForTimeout(40);
  out.timeline.close_160ms = await takeSample();
  await page.waitForTimeout(320);

  const closeResult = await page.evaluate(() => {
    const result = window.__tasksCloseProbe.getResult();
    window.__tasksCloseProbe.stop();
    return result;
  });

  out.timeline.close_before_unmount = closeResult.beforeUnmount;
  out.timeline.close_after_unmount = closeResult.afterUnmount;
  out.closePath.events = closeResult.events;

  const unload = closeResult.events.find((e) => e.type === "host_innerHTML_clear") || null;
  const unloadStack = String(unload?.stack || "");

  out.closePath.unload = unload;
  out.closePath.proof = {
    enteredClose: closeResult.events.some((e) => e.type === "is_closing_added"),
    transitionendTriggered: closeResult.events.some((e) => e.type === "transitionend"),
    animationendTriggered: closeResult.events.some((e) => e.type === "animationend"),
    timeoutScheduled: closeResult.events.some((e) => e.type === "close_timeout_scheduled"),
    timeoutFired: closeResult.events.some((e) => e.type === "close_timeout_fired"),
    unloadOwner: unloadStack.includes("tasks_overlay_controller.js")
      ? "tasks_overlay_controller"
      : "other"
  };
} catch (error) {
  out.error = {
    message: error?.message || String(error),
    stack: error?.stack || null
  };
}

fs.writeFileSync("./qa/evidence/ui/tasks_close_path_evidence.json", `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(JSON.stringify(out, null, 2));
await browser.close();
