import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";

const BASE = "http://127.0.0.1:5500";
const OUT_DIR = "./qa/visual_acceptance/simple_formal";
const OUT_JSON = "./qa/visual_acceptance/scene_text_simple_formal_report.json";

const SAMPLE_PLAN = [
  { id: "body_enabled_1", mapId: "intro_clinic_bed_lin_1", sceneId: "intro_clinic_bed_lin_1#description", bucket: "scene_body" },
  { id: "body_enabled_2", mapId: "bayport_clinic_queue_intro_1", sceneId: "bayport_clinic_queue_intro_1#description", bucket: "scene_body" },
  { id: "body_enabled_3", mapId: "industrial_split", sceneId: "industrial_split#minute_0", bucket: "scene_body" },
  { id: "degraded_1", mapId: "bayport_clinic", sceneId: "bayport_clinic#minute_0", bucket: "scene_body" },
  { id: "degraded_2", mapId: "industrial_warehouse_gate", sceneId: "industrial_warehouse_gate#minute_0", bucket: "scene_body" },
  { id: "feedback_1", mapId: "industrial_split", actionId: "ask_temp_shift_window", bucket: "action_feedback" },
  { id: "label_1", mapId: "winddyke_street_corner_notice", actionId: "observe_split_flow", bucket: "action_label" }
];

function splitSceneBodyParagraphs(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  return normalized
    .split(/\n\s*\n+/)
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const rows = [];

  for (const sample of SAMPLE_PLAN) {
    const row = await page.evaluate(async (s) => {
      const policyMod = await import("/src/engine/scene_text_fx_policy.js");
      const domMod = await import("/src/engine/render/scene_text_fx_dom.js");
      const { resolveSceneTextFxPolicy } = policyMod;
      const { runSceneTextFxDom } = domMod;

      const splitParagraphsLocal = (text) => {
        const normalized = String(text || "").replace(/\r\n?/g, "\n").trim();
        if (!normalized) return [];
        return normalized
          .split(/\n\s*\n+/)
          .map((x) => String(x || "").trim())
          .filter(Boolean);
      };

      const pickSceneText = (map, sceneId) => {
        const id = String(sceneId || "");
        if (id.endsWith("#description")) return String(map?.description || "").trim();
        const minuteMatch = id.match(/#minute_(\d+)$/);
        if (minuteMatch) {
          const idx = Number(minuteMatch[1]);
          return String(map?.descriptionByMinuteOfDay?.[idx]?.text || "").trim();
        }
        const condMatch = id.match(/#cond_(\d+)$/);
        if (condMatch) {
          const idx = Number(condMatch[1]);
          return String(map?.descriptionByConditions?.[idx]?.text || "").trim();
        }
        return "";
      };

      const pickActionText = (map, actionId, bucket) => {
        const action = (Array.isArray(map?.actions) ? map.actions : []).find((a) => String(a?.id || "") === String(actionId || ""));
        if (!action) return "";
        if (bucket === "action_label") return String(action.text || "").trim();
        if (bucket === "action_feedback") {
          const effects = Array.isArray(action.effects) ? action.effects : [];
          const firstPush = effects.find((eff) => String(eff?.op || "") === "push" && String(eff?.path || "") === "logLines" && typeof eff?.value === "string");
          return String(firstPush?.value || "").trim();
        }
        return "";
      };

      const mapResp = await fetch(`/data/maps/${s.mapId}.json`);
      if (!mapResp.ok) return null;
      const map = await mapResp.json();

      const text = s.bucket === "scene_body"
        ? pickSceneText(map, s.sceneId)
        : pickActionText(map, s.actionId, s.bucket);
      if (!text) return null;

      const old = document.querySelector(".simple-formal-rig");
      if (old) old.remove();

      const rig = document.createElement("section");
      rig.className = "simple-formal-rig";
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
      appHost.querySelector(".map-desc").textContent = text;

      const actionsHost = document.createElement("div");
      actionsHost.innerHTML = `<section id=\"choices\" class=\"choices-group choices-group-actions\"><div class=\"choices-group-title\">动作</div><div class=\"choices-group-body\"><button type=\"button\" class=\"journal-action\"><span class=\"journal-action-label\">继续</span></button><button type=\"button\" class=\"journal-action\"><span class=\"journal-action-label\">返回</span></button></div></section>`;
      actionsHost.style.marginTop = "10px";

      rig.appendChild(appHost);
      rig.appendChild(actionsHost);
      document.body.appendChild(rig);

      const policy = resolveSceneTextFxPolicy({
        mapId: s.mapId,
        sceneAnchor: s.sceneId || s.actionId || s.id,
        descriptionText: text,
        pageType: "map",
        uiPage: "map",
        isOverlay: false,
        reducedMotion: false,
        seenTable: {}
      });

      const ctrl = runSceneTextFxDom({ appHost, actionsHost, policy, sessionId: Date.now() % 100000 });
      window.__simpleFormalCtrl = ctrl;

      return {
        sampleId: s.id,
        mapId: s.mapId,
        sceneId: s.sceneId || null,
        actionId: s.actionId || null,
        bucket: s.bucket,
        paragraphCount: splitParagraphsLocal(text).length || 1,
        textLength: String(text).length
      };
    }, sample);

    if (!row) continue;

    await page.waitForTimeout(80);

    const beforeName = `${sample.id}_before.png`;
    const afterName = `${sample.id}_after.png`;
    const beforePath = path.join(OUT_DIR, beforeName);
    const afterPath = path.join(OUT_DIR, afterName);

    await page.screenshot({ path: beforePath, fullPage: false });
    await page.waitForTimeout(1600);
    await page.screenshot({ path: afterPath, fullPage: false });

    row.beforeScreenshot = `./qa/visual_acceptance/simple_formal/${beforeName}`;
    row.afterScreenshot = `./qa/visual_acceptance/simple_formal/${afterName}`;

    rows.push(row);

    await page.evaluate(() => {
      try { window.__simpleFormalCtrl?.cancel?.(); } catch (_e) {}
      delete window.__simpleFormalCtrl;
      const node = document.querySelector(".simple-formal-rig");
      if (node) node.remove();
    });

    await page.waitForTimeout(120);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    rows
  };

  await fs.writeFile(OUT_JSON, JSON.stringify(out, null, 2), "utf8");
  await browser.close();

  console.log(JSON.stringify({ ok: true, rows: rows.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
