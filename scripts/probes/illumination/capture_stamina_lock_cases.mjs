import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:4173/index.html";

async function setStats(page, { satiety, fatigue, stamina, hp = 100 }) {
  await page.evaluate(async ({ satiety, fatigue, stamina, hp }) => {
    const { dispatch } = await import("/src/engine/pipeline/dispatch.js");
    const run = async (statKey, value) => {
      await dispatch("debug_set_player_stat_value", { statKey, value }, {
        suppressDialogs: true,
        suppressFeedback: true
      });
    };

    await run("hp", hp);
    await run("satiety", satiety);
    await run("fatigue", fatigue);
    await run("stamina", stamina);
  }, { satiety, fatigue, stamina, hp });
}

async function captureCase(page, name, setup) {
  await setStats(page, setup);

  await page.waitForTimeout(200);

  const inspect = await page.evaluate(async () => {
    const { gameState } = await import("/src/engine/state.js");
    const { getPlayerDerived } = await import("/src/engine/player.js");
    const derived = getPlayerDerived(gameState.player);

    const cards = Array.from(document.querySelectorAll(".attr-card"));
    const card = cards.find((el) => String(el.querySelector(".attr-label")?.textContent || "").includes("体能"));
    if (!card) return null;

    const valueText = String(card.querySelector(".attr-value")?.textContent || "").trim();
    const bar = card.querySelector(".attr-bar-bg");
    const fill = card.querySelector(".attr-bar-fill");
    const lock = card.querySelector(".attr-bar-lock");

    const barRect = bar?.getBoundingClientRect();
    const fillRect = fill?.getBoundingClientRect();
    const lockRect = lock?.getBoundingClientRect();

    return {
      valueText,
      stamina: {
        current: Number(derived?.attrs?.stamina?.cur ?? 0),
        effectiveMax: Number(derived?.attrs?.stamina?.effectiveMax ?? 0),
        baseMax: Number(derived?.attrs?.stamina?.baseMax ?? 0)
      },
      layout: {
        fillRatio: barRect && fillRect ? Number((fillRect.width / barRect.width).toFixed(4)) : null,
        lockRatio: barRect && lockRect ? Number((lockRect.width / barRect.width).toFixed(4)) : null
      }
    };
  });

  const staminaCard = page.locator(".attr-card", { hasText: "体能" }).first();
  await staminaCard.screenshot({ path: `reports/generated/illumination/stamina_lock_${name}.png` });

  return inspect;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
try {
  await page.waitForSelector("#player-sidebar .attr-card", { timeout: 5000 });
} catch {
  await page.evaluate(async () => {
    const { gameState } = await import("/src/engine/state.js");
    gameState.time.totalMinutes = 0;
    gameState.currentMapId = "menu_main";
    if (gameState.world && typeof gameState.world === "object") {
      gameState.world.currentMapId = "menu_main";
    }

    const { dispatch } = await import("/src/engine/pipeline/dispatch.js");
    await dispatch("menu_new_game", {}, {
      suppressDialogs: true,
      suppressFeedback: true
    });
  });
  await page.waitForSelector("#player-sidebar .attr-card", { timeout: 30000 });
}

const caseA = await captureCase(page, "caseA", {
  satiety: 10,
  fatigue: 10,
  stamina: 10,
  hp: 100
});

const caseB = await captureCase(page, "caseB", {
  satiety: 100,
  fatigue: 40,
  stamina: 20,
  hp: 100
});

await browser.close();

console.log(JSON.stringify({ caseA, caseB }, null, 2));
