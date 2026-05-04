const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

function createServer(port = 4173) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = urlPath === '/' ? '/index.html' : urlPath;
    const filePath = path.join(root, rel.replace(/^\//, ''));
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.setHeader('Content-Type', contentType(filePath));
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

async function setupMap(page, mapId) {
  await page.evaluate(async ({ mapId }) => {
    const stateMod = await import('/src/engine/state.js');
    const loaderMod = await import('/src/engine/loader.js');
    const rendererMod = await import('/src/engine/renderer.js');

    const map = await loaderMod.loadMap(mapId);
    stateMod.gameState.currentMapId = mapId;
    stateMod.gameState.world.currentMapId = mapId;
    stateMod.gameState.currentMap = map;
    stateMod.gameState.ui.page = 'map';
    stateMod.gameState.ui.overlay = null;
    stateMod.gameState.ui.modal = null;
    rendererMod.render();
  }, { mapId });
}

(async () => {
  const server = await createServer(4173);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const maps = ['industrial_split', 'industrial_warehouse_gate', 'industrial_maintenance_gate'];
    const rows = [];
    for (const mapId of maps) {
      await setupMap(page, mapId);
      await page.evaluate(async () => {
        const dispatchMod = await import('/src/engine/pipeline/dispatch.js');
        await dispatchMod.dispatch('ui_map_open', {});
      });
      await page.waitForTimeout(80);
      const snap = await page.evaluate(({ mapId }) => {
        const p = document.getElementById('industrial-minimap-panel');
        const c = document.getElementById('clinic-minimap-panel');
        const w = document.getElementById('winddyke-minimap-panel');
        const g = document.getElementById('gov-hall-minimap-panel');
        const head = p?.querySelector('.clinic-minimap-head')?.textContent?.trim() || null;
        const current = p?.querySelector('.clinic-minimap-current')?.textContent?.trim() || null;
        return {
          mapId,
          industrialOpen: !!p && p.getAttribute('aria-hidden') === 'false',
          industrialHead: head,
          industrialCurrent: current,
          othersHidden: {
            clinic: !c || c.getAttribute('aria-hidden') === 'true',
            winddyke: !w || w.getAttribute('aria-hidden') === 'true',
            gov: !g || g.getAttribute('aria-hidden') === 'true'
          }
        };
      }, { mapId });
      rows.push(snap);
    }
    fs.writeFileSync('reports/generated/transition/industrial_minimap_probe.json', JSON.stringify(rows, null, 2));
    console.log(JSON.stringify({ ok: true, file: 'reports/generated/transition/industrial_minimap_probe.json', rows }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})();
