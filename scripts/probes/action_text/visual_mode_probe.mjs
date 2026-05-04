import { chromium } from "playwright";
import fs from "fs/promises";

const BASE = "http://127.0.0.1:5500";
const OUT = "./qa/visual_acceptance/scene_text_visual_mode_report.json";

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
    out[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
  }
  return out;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const rows = await page.evaluate(async (plan) => {
    const policyMod = await import("/src/engine/scene_text_fx_policy.js");
    const domMod = await import("/src/engine/render/scene_text_fx_dom.js");
    const { resolveSceneTextFxPolicy } = policyMod;
    const { runSceneTextFxDom } = domMod;

    const out = [];
    let sid = 0;

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

    for (const sample of plan) {
      const resp = await fetch(`/data/maps/${sample.mapId}.json`);
      if (!resp.ok) continue;
      const map = await resp.json();
      const text = sample.bucket === "scene_body"
        ? pickSceneText(map, sample.sceneId)
        : pickActionText(map, sample.actionId, sample.bucket);
      if (!text) continue;

      const rig = document.createElement("section");
      rig.style.position = "fixed";
      rig.style.left = "24px";
      rig.style.top = "24px";
      rig.style.width = "920px";
      rig.style.padding = "12px";
      rig.style.background = "rgba(8,14,22,0.95)";
      rig.style.zIndex = "9995";

      const appHost = document.createElement("div");
      appHost.innerHTML = `<article class=\"map-panel\"><div class=\"map-desc\"></div></article>`;
      appHost.querySelector(".map-desc").textContent = text;
      const actionsHost = document.createElement("div");
      actionsHost.innerHTML = `<section id=\"choices\" class=\"choices-group choices-group-actions\"><div class=\"choices-group-body\"><button class=\"journal-action\"><span class=\"journal-action-label\">继续</span></button></div></section>`;
      rig.appendChild(appHost);
      rig.appendChild(actionsHost);
      document.body.appendChild(rig);

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

      const session = runSceneTextFxDom({ appHost, actionsHost, policy, sessionId: ++sid });

      let panel = null;
      const start = performance.now();
      while (!panel && performance.now() - start < 1500) {
        panel = document.querySelector(".scene-text-diagnostic-panel");
        if (!panel) await new Promise((r) => setTimeout(r, 40));
      }

      const parsed = panel ? (() => {
        const x = {};
        for (const raw of String(panel.textContent || "").split(/\r?\n/)) {
          const i = raw.indexOf("=");
          if (i <= 0) continue;
          x[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
        }
        return x;
      })() : {};

      const snap = typeof session?.getSnapshot === "function" ? session.getSnapshot() : null;
      const geo = snap?.runtimeRoot?.geometryAudit || null;

      out.push({
        sampleId: sample.id,
        bucket: sample.bucket,
        mapId: sample.mapId,
        sceneId: sample.sceneId || null,
        actionId: sample.actionId || null,
        plannerReason: String(policy?.plannerReason || ""),
        finalBodyLayerEnabled: !!geo?.finalBodyLayerEnabled,
        runtimeReason: String(geo?.runtimeReason || ""),
        presentationMode: String(parsed.presentationMode || ""),
        arrivalCueMs: Number(parsed.arrivalCueMs || 0),
        leadHoldMs: Number(parsed.leadHoldMs || 0),
        bodyExpandMs: Number(parsed.bodyExpandMs || 0),
        actionsDelayMs: Number(parsed.actionsDelayMs || 0)
      });

      if (typeof session?.cancel === "function") {
        try { session.cancel(); } catch (_e) {}
      }
      const panelNode = document.querySelector(".scene-text-diagnostic-panel");
      if (panelNode && panelNode.parentNode) panelNode.parentNode.removeChild(panelNode);
      rig.remove();
      await new Promise((r) => setTimeout(r, 120));
    }

    return out;
  }, SAMPLE_PLAN);

  const grouped = {
    shortCue: rows.filter((r) => r.presentationMode === "short_cue").map((r) => r.sampleId),
    bodyReveal: rows.filter((r) => r.presentationMode === "body_reveal").map((r) => r.sampleId),
    microText: rows.filter((r) => r.presentationMode === "micro_text").map((r) => r.sampleId)
  };

  const out = {
    generatedAt: new Date().toISOString(),
    rows,
    grouped
  };

  await fs.writeFile(OUT, JSON.stringify(out, null, 2), "utf8");
  await browser.close();
  console.log(JSON.stringify({ ok: true, rows: rows.length, grouped }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
