import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";

const root = process.cwd();

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "text/plain; charset=utf-8";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url || "/").split("?")[0]);
  const localPath = rel === "/" ? "index.html" : rel.replace(/^\//, "");
  const filePath = path.join(root, localPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }
    res.setHeader("Content-Type", contentType(filePath));
    res.end(data);
  });
});

async function setStateAndRender(page, setup) {
  await page.evaluate(async ({ setup }) => {
    const stateMod = await import("/src/engine/state.js");
    const loader = await import("/src/engine/loader.js");
    const renderer = await import("/src/engine/renderer.js");
    const playerMod = await import("/src/engine/player.js");

    const state = stateMod.gameState;
    const map = await loader.loadMap("industrial_maintenance_gate");

    state.currentMapId = "industrial_maintenance_gate";
    state.world.currentMapId = "industrial_maintenance_gate";
    state.currentMap = map;
    state.ui.page = "map";
    state.ui.overlay = null;
    state.ui.modal = null;

    state.player.psycho.hp = Number(setup.hp);
    state.player.physio.stamina = Number(setup.stamina);
    state.player.exposure.dead = !!setup.dead;

    if (!state.player.meta || typeof state.player.meta !== "object") {
      state.player.meta = {};
    }
    if (!state.player.meta.sleepEpisode || typeof state.player.meta.sleepEpisode !== "object") {
      state.player.meta.sleepEpisode = {
        mode: "REST",
        startedAtMinute: Number(state.time?.totalMinutes || 0),
        elapsedMinutes: 0,
        source: "manual"
      };
    }
    state.player.meta.sleepEpisode.mode = String(setup.mode);

    if (typeof playerMod.recomputeDerivedStats === "function") {
      playerMod.recomputeDerivedStats(state.player, state);
    }

    renderer.render();
  }, { setup });
}

server.listen(4173, async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1560, height: 980 } });

  try {
    await page.goto("http://127.0.0.1:4173/index.html", { waitUntil: "domcontentloaded" });
    await sleep(1200);

    const scenarios = [
      {
        id: "collapse",
        target: { hp: 35, stamina: 6, mode: "COLLAPSE", dead: false },
        out: "reports/generated/illumination/ui_toast_collapse.png"
      },
      {
        id: "dead",
        target: { hp: 0, stamina: 0, mode: "DEAD", dead: true },
        out: "reports/generated/illumination/ui_toast_dead.png"
      }
    ];

    for (const scenario of scenarios) {
      await setStateAndRender(page, { hp: 88, stamina: 75, mode: "REST", dead: false });
      await sleep(120);
      await setStateAndRender(page, scenario.target);
      await sleep(180);
      await page.screenshot({ path: scenario.out, fullPage: false });
      console.log(`[capture] ${scenario.id} -> ${scenario.out}`);
    }
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
