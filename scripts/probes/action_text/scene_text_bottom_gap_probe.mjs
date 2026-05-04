import { chromium } from "playwright";
import fs from "fs/promises";

const BASE = "http://127.0.0.1:5500";
const OUT = "./qa/visual_acceptance/scene_text_bottom_gap_probe.json";

const SAMPLES = [
  { mapId: "intro_clinic_bed_lin_1" },
  { mapId: "intro_clinic_bed_lin_4" },
  { mapId: "bayport_clinic_queue_intro_1" },
  { mapId: "industrial_split" }
];

function pickSceneText(map) {
  const description = String(map?.description || "").trim();
  if (description) return description;
  const minute0 = String(map?.descriptionByMinuteOfDay?.[0]?.text || "").trim();
  if (minute0) return minute0;
  return "";
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const rows = [];

  for (const sample of SAMPLES) {
    const row = await page.evaluate(async (s) => {
      const policyMod = await import("/src/engine/scene_text_fx_policy.js");
      const domMod = await import("/src/engine/render/scene_text_fx_dom.js");
      const { resolveSceneTextFxPolicy } = policyMod;
      const { runSceneTextFxDom } = domMod;

      const resp = await fetch(`/data/maps/${s.mapId}.json`);
      if (!resp.ok) return { mapId: s.mapId, error: "map_fetch_failed" };
      const map = await resp.json();
      const text = (String(map?.description || "").trim() || String(map?.descriptionByMinuteOfDay?.[0]?.text || "").trim());
      if (!text) return { mapId: s.mapId, error: "text_missing" };

      const old = document.querySelector(".gap-probe-rig");
      if (old) old.remove();

      const rig = document.createElement("section");
      rig.className = "gap-probe-rig";
      rig.style.position = "fixed";
      rig.style.left = "50%";
      rig.style.top = "50%";
      rig.style.transform = "translate(-50%, -50%)";
      rig.style.width = "980px";
      rig.style.maxWidth = "92vw";
      rig.style.padding = "14px";
      rig.style.background = "rgba(8,14,22,0.94)";
      rig.style.border = "1px solid rgba(180,210,240,0.45)";
      rig.style.borderRadius = "10px";
      rig.style.zIndex = "9991";

      const appHost = document.createElement("div");
      appHost.innerHTML = `<article class=\"map-panel\"><h2 class=\"map-name\">${map.name || s.mapId}</h2><div class=\"map-desc\"></div></article>`;
      const desc = appHost.querySelector(".map-desc");
      desc.textContent = text;

      const actionsHost = document.createElement("div");
      actionsHost.innerHTML = `
        <section id=\"choices\" class=\"choices-group choices-group-actions\">
          <div class=\"choices-group-title\">动作</div>
          <div class=\"choices-group-body\">
            <button type=\"button\" class=\"journal-action\"><span class=\"journal-action-label\">继续</span></button>
          </div>
        </section>`;
      actionsHost.style.marginTop = "10px";

      rig.appendChild(appHost);
      rig.appendChild(actionsHost);
      document.body.appendChild(rig);

      const policy = resolveSceneTextFxPolicy({
        mapId: s.mapId,
        sceneAnchor: `${s.mapId}#description`,
        descriptionText: text,
        pageType: "map",
        uiPage: "map",
        isOverlay: false,
        reducedMotion: false,
        seenTable: {}
      });

      const ctrl = runSceneTextFxDom({ appHost, actionsHost, policy, sessionId: Date.now() % 100000 });
      window.__gapProbeCtrl = ctrl;

      return { mapId: s.mapId, ok: true };
    }, sample);

    if (!row?.ok) {
      rows.push(row);
      continue;
    }

    await page.waitForTimeout(1900);

    const metrics = await page.evaluate(() => {
      const desc = document.querySelector(".gap-probe-rig .map-desc");
      const actions = document.querySelector(".gap-probe-rig #choices");
      const runtimeLast = document.querySelector(".scene-text-runtime-desc .scene-text-paragraph:last-child");
      const sourceLast = desc?.querySelector?.(".scene-text-paragraph:last-child") || null;
      if (!desc || !actions) return { error: "host_missing" };

      const descRect = desc.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      const runtimeLastRect = runtimeLast ? runtimeLast.getBoundingClientRect() : null;
      const sourceLastRect = sourceLast ? sourceLast.getBoundingClientRect() : null;

      const flowGap = Math.round((actionsRect.top - descRect.bottom) * 100) / 100;
      const visibleGap = runtimeLastRect
        ? Math.round((actionsRect.top - runtimeLastRect.bottom) * 100) / 100
        : null;
      const sourceLastGap = sourceLastRect
        ? Math.round((actionsRect.top - sourceLastRect.bottom) * 100) / 100
        : null;

      return {
        flowGap,
        visibleGap,
        sourceLastGap,
        inflation: visibleGap == null ? null : Math.round((flowGap - visibleGap) * 100) / 100,
        runtimeParagraphCount: document.querySelectorAll(".scene-text-runtime-desc .scene-text-paragraph").length,
        sourceParagraphCount: desc.querySelectorAll(".scene-text-paragraph").length
      };
    });

    rows.push({ mapId: sample.mapId, ...metrics });

    await page.evaluate(() => {
      try { window.__gapProbeCtrl?.cancel?.(); } catch (_e) {}
      delete window.__gapProbeCtrl;
      const rig = document.querySelector(".gap-probe-rig");
      if (rig) rig.remove();
    });

    await page.waitForTimeout(120);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    rows
  };

  await fs.writeFile(OUT, JSON.stringify(out, null, 2), "utf8");
  await browser.close();
  console.log(JSON.stringify({ ok: true, rows: rows.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
