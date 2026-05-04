import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";

const BASE = "http://127.0.0.1:5500";
const OUT_DIR = "./qa/visual_acceptance";

const SAMPLE_PLAN = [
  { id: "body_enabled_1", mapId: "intro_clinic_bed_lin_1", sceneId: "intro_clinic_bed_lin_1#description", bucket: "scene_body" },
  { id: "body_enabled_2", mapId: "bayport_clinic_queue_intro_1", sceneId: "bayport_clinic_queue_intro_1#description", bucket: "scene_body" },
  { id: "body_enabled_3", mapId: "industrial_split", sceneId: "industrial_split#minute_0", bucket: "scene_body" },
  { id: "degraded_1", mapId: "bayport_clinic", sceneId: "bayport_clinic#minute_0", bucket: "scene_body" },
  { id: "degraded_2", mapId: "industrial_warehouse_gate", sceneId: "industrial_warehouse_gate#minute_0", bucket: "scene_body" },
  { id: "feedback_1", mapId: "industrial_split", actionId: "ask_temp_shift_window", bucket: "action_feedback" },
  { id: "label_1", mapId: "winddyke_street_corner_notice", actionId: "observe_split_flow", bucket: "action_label" }
];

function parsePanelLines(text) {
  const out = {};
  for (const raw of String(text || "").split(/\r?\n/)) {
    const i = raw.indexOf("=");
    if (i <= 0) continue;
    const k = raw.slice(0, i).trim();
    const v = raw.slice(i + 1).trim();
    out[k] = v;
  }
  return out;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1300);

  const report = await page.evaluate(async ({ plan, outDir }) => {
    const policyMod = await import("/src/engine/scene_text_fx_policy.js");
    const domMod = await import("/src/engine/render/scene_text_fx_dom.js");

    const { resolveSceneTextFxPolicy } = policyMod;
    const { runSceneTextFxDom } = domMod;

    const parsePanelLinesLocal = (text) => {
      const out = {};
      for (const raw of String(text || "").split(/\r?\n/)) {
        const i = raw.indexOf("=");
        if (i <= 0) continue;
        const k = raw.slice(0, i).trim();
        const v = raw.slice(i + 1).trim();
        out[k] = v;
      }
      return out;
    };

    const maps = new Map();
    const mapIds = Array.from(new Set(plan.map((x) => x.mapId)));
    for (const mapId of mapIds) {
      const resp = await fetch(`/data/maps/${mapId}.json`);
      if (!resp.ok) continue;
      maps.set(mapId, await resp.json());
    }

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

    const rows = [];
    let sessionId = 0;

    for (const sample of plan) {
      const map = maps.get(sample.mapId);
      if (!map) continue;

      const text = sample.bucket === "scene_body"
        ? pickSceneText(map, sample.sceneId)
        : pickActionText(map, sample.actionId, sample.bucket);

      if (!text) continue;

      const policy = resolveSceneTextFxPolicy({
        mapId: sample.mapId,
        sceneAnchor: sample.sceneId || sample.actionId || sample.id,
        descriptionText: text,
        pageType: "map",
        uiPage: "map",
        isOverlay: false,
        reducedMotion: false,
        seenTable: {}
      });

      policy.runtimeRootGeometryAudit = true;

      const rig = document.createElement("section");
      rig.className = "visual-acceptance-rig";
      rig.style.position = "fixed";
      rig.style.left = "50%";
      rig.style.top = "50%";
      rig.style.transform = "translate(-50%, -50%)";
      rig.style.width = "980px";
      rig.style.maxWidth = "92vw";
      rig.style.padding = "14px";
      rig.style.background = "rgba(8, 14, 22, 0.94)";
      rig.style.border = "1px solid rgba(180, 210, 240, 0.45)";
      rig.style.borderRadius = "10px";
      rig.style.zIndex = "9990";
      rig.style.boxShadow = "0 20px 70px rgba(0,0,0,0.45)";

      const appHost = document.createElement("div");
      appHost.innerHTML = `<article class="map-panel"><h2 class="map-name">${map.name || sample.mapId}</h2><div class="map-desc"></div></article>`;
      const desc = appHost.querySelector(".map-desc");
      if (desc) desc.textContent = text;

      const actionsHost = document.createElement("div");
      actionsHost.innerHTML = `
        <section class="choices-group choices-group-actions">
          <div class="choices-group-title">动作</div>
          <div class="choices-group-body">
            <button type="button" data-action-id="probe_action_a" class="journal-action"><span class="journal-action-label">继续</span></button>
            <button type="button" data-action-id="probe_action_b" class="journal-action"><span class="journal-action-label">返回</span></button>
          </div>
        </section>`;
      actionsHost.style.marginTop = "10px";

      rig.appendChild(appHost);
      rig.appendChild(actionsHost);
      document.body.appendChild(rig);

      const beforePath = `${outDir}/${sample.id}_before.png`;
      const afterPath = `${outDir}/${sample.id}_after.png`;

      const beforeBuffer = await (window.__PLAYWRIGHT_CAPTURE_ELEMENT__
        ? window.__PLAYWRIGHT_CAPTURE_ELEMENT__(rig)
        : null);
      if (beforeBuffer && typeof beforeBuffer === "string") {
        // no-op fallback hook path
      }

      const session = runSceneTextFxDom({
        appHost,
        actionsHost,
        policy,
        sessionId: ++sessionId
      });

      const panel = await new Promise((resolve) => {
        const start = performance.now();
        const tick = () => {
          const node = document.querySelector(".scene-text-diagnostic-panel");
          if (node) return resolve(node);
          if (performance.now() - start > 1200) return resolve(null);
          setTimeout(tick, 40);
        };
        tick();
      });

      const panelData = parsePanelLinesLocal(panel?.textContent || "");
      const leadHoldMs = Number(panelData.leadHoldMs || 0);
      const bodyExpandMs = Number(panelData.bodyExpandMs || 0);
      const actionsDelayMs = Number(panelData.actionsDelayMs || 0);
      const actionsRevealMs = Number(panelData.actionsRevealMs || 0);

      const waitMs = Math.max(700, leadHoldMs + bodyExpandMs + actionsDelayMs + actionsRevealMs + 240);
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      const snap = typeof session?.getSnapshot === "function" ? session.getSnapshot() : null;
      const geo = snap?.runtimeRoot?.geometryAudit || null;

      rows.push({
        sampleId: sample.id,
        mapId: sample.mapId,
        sceneId: sample.sceneId || null,
        actionId: sample.actionId || null,
        bucket: sample.bucket,
        plannerReason: String(policy?.plannerReason || ""),
        finalBodyLayerEnabled: !!geo?.finalBodyLayerEnabled,
        runtimeReason: String(geo?.runtimeReason || ""),
        leadHoldMs,
        bodyExpandMs,
        actionsDelayMs,
        beforeScreenshot: beforePath,
        afterScreenshot: afterPath
      });

      if (typeof session?.cancel === "function") {
        try { session.cancel(); } catch (_e) {}
      }

      const panelNode = document.querySelector(".scene-text-diagnostic-panel");
      if (panelNode && panelNode.parentNode) panelNode.parentNode.removeChild(panelNode);
      rig.remove();
    }

    return { rows };
  }, { plan: SAMPLE_PLAN, outDir: OUT_DIR.replace(/\\/g, "/") });

  // Real screenshots from node-side handles for each sample rig state.
  // Re-run lightweight visual pass for capturing deterministic before/after bitmaps.
  const captureRows = [];
  for (const sample of SAMPLE_PLAN) {
    await page.evaluate(() => {
      const old = document.querySelector(".capture-rig");
      if (old) old.remove();
    });

    const data = await page.evaluate(async (s) => {
      const policyMod = await import("/src/engine/scene_text_fx_policy.js");
      const domMod = await import("/src/engine/render/scene_text_fx_dom.js");
      const { resolveSceneTextFxPolicy } = policyMod;
      const { runSceneTextFxDom } = domMod;

      const resp = await fetch(`/data/maps/${s.mapId}.json`);
      if (!resp.ok) return null;
      const map = await resp.json();

      let text = "";
      if (s.bucket === "scene_body") {
        if (String(s.sceneId).endsWith("#description")) {
          text = String(map.description || "").trim();
        } else if (/#minute_/.test(String(s.sceneId || ""))) {
          const idx = Number(String(s.sceneId).split("#minute_")[1] || 0);
          text = String(map.descriptionByMinuteOfDay?.[idx]?.text || "").trim();
        }
      } else {
        const action = (Array.isArray(map.actions) ? map.actions : []).find((a) => String(a.id || "") === String(s.actionId || ""));
        if (s.bucket === "action_label") text = String(action?.text || "").trim();
        if (s.bucket === "action_feedback") {
          const fx = (Array.isArray(action?.effects) ? action.effects : []).find((e) => String(e?.op || "") === "push" && String(e?.path || "") === "logLines" && typeof e?.value === "string");
          text = String(fx?.value || "").trim();
        }
      }
      if (!text) return null;

      const rig = document.createElement("section");
      rig.className = "capture-rig";
      rig.style.position = "fixed";
      rig.style.left = "50%";
      rig.style.top = "50%";
      rig.style.transform = "translate(-50%, -50%)";
      rig.style.width = "980px";
      rig.style.maxWidth = "92vw";
      rig.style.padding = "14px";
      rig.style.background = "rgba(8, 14, 22, 0.94)";
      rig.style.border = "1px solid rgba(180, 210, 240, 0.45)";
      rig.style.borderRadius = "10px";
      rig.style.zIndex = "9991";

      const appHost = document.createElement("div");
      appHost.innerHTML = `<article class=\"map-panel\"><h2 class=\"map-name\">${map.name || s.mapId}</h2><div class=\"map-desc\"></div></article>`;
      const desc = appHost.querySelector(".map-desc");
      if (desc) desc.textContent = text;
      const actionsHost = document.createElement("div");
      actionsHost.innerHTML = `<section class=\"choices-group choices-group-actions\"><div class=\"choices-group-title\">动作</div><div class=\"choices-group-body\"><button class=\"journal-action\" data-action-id=\"a\"><span class=\"journal-action-label\">继续</span></button><button class=\"journal-action\" data-action-id=\"b\"><span class=\"journal-action-label\">返回</span></button></div></section>`;
      actionsHost.style.marginTop = "10px";

      rig.appendChild(appHost);
      rig.appendChild(actionsHost);
      document.body.appendChild(rig);

      const policy = resolveSceneTextFxPolicy({ mapId: s.mapId, sceneAnchor: s.sceneId || s.actionId || s.id, descriptionText: text, pageType: "map", uiPage: "map", isOverlay: false, reducedMotion: false, seenTable: {} });
      policy.runtimeRootGeometryAudit = true;
      const session = runSceneTextFxDom({ appHost, actionsHost, policy, sessionId: Date.now() % 100000 });

      return { ok: true, sampleId: s.id, waitHint: 2200 };
    }, sample);

    if (!data?.ok) continue;

    const rig = page.locator(".capture-rig");
    await rig.screenshot({ path: path.join(OUT_DIR, `${sample.id}_before.png`) });
    await page.waitForTimeout(2300);
    await rig.screenshot({ path: path.join(OUT_DIR, `${sample.id}_after.png`) });

    await page.evaluate(() => {
      const node = document.querySelector(".capture-rig");
      if (node) node.remove();
      const panel = document.querySelector(".scene-text-diagnostic-panel");
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    });

    captureRows.push(sample.id);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    rows: report.rows,
    capturedSampleIds: captureRows
  };

  await fs.writeFile("./qa/visual_acceptance/scene_text_visual_acceptance_report.json", JSON.stringify(out, null, 2), "utf-8");
  await browser.close();

  console.log(JSON.stringify({ ok: true, samples: out.rows.length, captured: out.capturedSampleIds.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
