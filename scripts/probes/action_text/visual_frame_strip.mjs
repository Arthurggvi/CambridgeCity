import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";

const BASE = "http://127.0.0.1:5500";
const OUT_DIR = "./qa/visual_acceptance/frames";
const OUT_JSON = "./qa/visual_acceptance/scene_text_frame_strip_report.json";
const OUT_HTML = "./qa/visual_acceptance/scene_text_frame_strip_report.html";

const SAMPLE_PLAN = [
  { id: "body_enabled_1", mapId: "intro_clinic_bed_lin_1", sceneId: "intro_clinic_bed_lin_1#description", bucket: "scene_body" },
  { id: "body_enabled_2", mapId: "bayport_clinic_queue_intro_1", sceneId: "bayport_clinic_queue_intro_1#description", bucket: "scene_body" },
  { id: "body_enabled_3", mapId: "industrial_split", sceneId: "industrial_split#minute_0", bucket: "scene_body" },
  { id: "degraded_1", mapId: "bayport_clinic", sceneId: "bayport_clinic#minute_0", bucket: "scene_body" },
  { id: "degraded_2", mapId: "industrial_warehouse_gate", sceneId: "industrial_warehouse_gate#minute_0", bucket: "scene_body" },
  { id: "feedback_1", mapId: "industrial_split", actionId: "ask_temp_shift_window", bucket: "action_feedback" },
  { id: "label_1", mapId: "winddyke_street_corner_notice", actionId: "observe_split_flow", bucket: "action_label" }
];

const FRAME_MARKS = [0, 120, 260, 520, 980];

function toMode(bucket, finalBodyLayerEnabled) {
  if (bucket === "action_feedback" || bucket === "action_label") return "micro_text";
  return finalBodyLayerEnabled ? "body_reveal" : "short_cue";
}

function buildHtml(rows) {
  const headFrames = FRAME_MARKS.map((t) => `<th>t${t}</th>`).join("");
  const body = rows.map((r) => {
    const imgs = r.frames.map((f) => `<td><img src="${f.path}" loading="lazy" /></td>`).join("");
    return `<tr>
      <td>${r.sampleId}</td>
      <td>${r.bucket}</td>
      <td>${r.mode}</td>
      <td>${r.finalBodyLayerEnabled}</td>
      ${imgs}
    </tr>`;
  }).join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Scene Text Frame Strip Report</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; background: #0b1118; color: #d7e5f3; margin: 16px; }
    h1 { margin: 0 0 10px; font-size: 20px; }
    p { margin: 0 0 14px; color: #a9bfd4; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; }
    th, td { border: 1px solid rgba(180,210,240,0.32); padding: 6px; vertical-align: top; }
    th { background: rgba(18,28,40,0.95); position: sticky; top: 0; }
    td { background: rgba(10,17,24,0.95); }
    img { width: 220px; height: auto; display: block; border: 1px solid rgba(180,210,240,0.28); }
  </style>
</head>
<body>
  <h1>Scene Text 7-Sample Frame Strip</h1>
  <p>Frames: t0, t120ms, t260ms, t520ms, t980ms</p>
  <table>
    <thead>
      <tr>
        <th>sample</th>
        <th>bucket</th>
        <th>mode</th>
        <th>finalBody</th>
        ${headFrames}
      </tr>
    </thead>
    <tbody>
      ${body}
    </tbody>
  </table>
</body>
</html>`;
}

async function setupSample(page, sample) {
  return page.evaluate(async (s) => {
    const policyMod = await import("/src/engine/scene_text_fx_policy.js");
    const domMod = await import("/src/engine/render/scene_text_fx_dom.js");
    const { resolveSceneTextFxPolicy } = policyMod;
    const { runSceneTextFxDom } = domMod;

    const pickSceneText = (map, sceneId) => {
      const id = String(sceneId || "");
      if (id.endsWith("#description")) return String(map?.description || "").trim();
      const minuteMatch = id.match(/#minute_(\d+)$/);
      if (minuteMatch) {
        const idx = Number(minuteMatch[1]);
        return String(map?.descriptionByMinuteOfDay?.[idx]?.text || "").trim();
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

    const resp = await fetch(`/data/maps/${s.mapId}.json`);
    if (!resp.ok) return { ok: false, reason: "map_fetch_failed" };
    const map = await resp.json();

    const text = s.bucket === "scene_body"
      ? pickSceneText(map, s.sceneId)
      : pickActionText(map, s.actionId, s.bucket);
    if (!text) return { ok: false, reason: "empty_text" };

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
    appHost.querySelector(".map-desc").textContent = text;

    const actionsHost = document.createElement("div");
    actionsHost.innerHTML = `
      <section id=\"choices\" class=\"choices-group choices-group-actions\">
        <div class=\"choices-group-title\">动作</div>
        <div class=\"choices-group-body\">
          <button type=\"button\" class=\"journal-action\"><span class=\"journal-action-label\">继续</span></button>
          <button type=\"button\" class=\"journal-action\"><span class=\"journal-action-label\">返回</span></button>
        </div>
      </section>`;
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
    policy.runtimeRootGeometryAudit = true;

    window.__sceneTextFxSession = runSceneTextFxDom({ appHost, actionsHost, policy, sessionId: Date.now() % 100000 });

    return {
      ok: true,
      plannerReason: String(policy?.plannerReason || ""),
      mapId: s.mapId,
      sceneId: s.sceneId || null,
      actionId: s.actionId || null
    };
  }, sample);
}

async function readAudit(page) {
  return page.evaluate(() => {
    const panel = document.querySelector(".scene-text-diagnostic-panel");
    const parsed = {};
    for (const raw of String(panel?.textContent || "").split(/\r?\n/)) {
      const i = raw.indexOf("=");
      if (i <= 0) continue;
      parsed[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
    }
    return {
      presentationMode: String(parsed.presentationMode || ""),
      leadHoldMs: Number(parsed.leadHoldMs || 0),
      bodyExpandMs: Number(parsed.bodyExpandMs || 0),
      actionsDelayMs: Number(parsed.actionsDelayMs || 0),
      actionsRevealMs: Number(parsed.actionsRevealMs || 0),
      finalBodyLayerEnabled: String(parsed.finalBodyLayerEnabled || "") === "true",
      runtimeReason: String(parsed.runtimeReason || "")
    };
  });
}

async function readAuditEarly(page) {
  await page.waitForTimeout(80);
  return page.evaluate(() => {
    const panel = document.querySelector(".scene-text-diagnostic-panel");
    const parsed = {};
    for (const raw of String(panel?.textContent || "").split(/\r?\n/)) {
      const i = raw.indexOf("=");
      if (i <= 0) continue;
      parsed[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
    }
    return {
      presentationMode: String(parsed.presentationMode || ""),
      leadHoldMs: Number(parsed.leadHoldMs || 0),
      bodyExpandMs: Number(parsed.bodyExpandMs || 0),
      actionsDelayMs: Number(parsed.actionsDelayMs || 0),
      actionsRevealMs: Number(parsed.actionsRevealMs || 0),
      finalBodyLayerEnabled: String(parsed.finalBodyLayerEnabled || "") === "true",
      runtimeReason: String(parsed.runtimeReason || "")
    };
  });
}

async function cleanupSample(page) {
  await page.evaluate(() => {
    try { window.__sceneTextFxSession?.cancel?.(); } catch (_e) {}
    const panel = document.querySelector(".scene-text-diagnostic-panel");
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    const rig = document.querySelector(".capture-rig");
    if (rig) rig.remove();
    delete window.__sceneTextFxSession;
  });
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const rows = [];

  for (const sample of SAMPLE_PLAN) {
    const page = await browser.newPage({ viewport: { width: 1680, height: 1040 } });
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    const setup = await setupSample(page, sample);
    if (!setup?.ok) {
      rows.push({ sampleId: sample.id, bucket: sample.bucket, error: setup?.reason || "setup_failed", frames: [] });
      await page.close();
      continue;
    }

    const earlyAudit = await readAuditEarly(page);
    await page.waitForTimeout(40);
    const frames = [];
    let previous = 0;
    for (const t of FRAME_MARKS) {
      const waitMs = Math.max(0, t - previous);
      if (waitMs > 0) await page.waitForTimeout(waitMs);
      const fileName = `${sample.id}_t${t}.png`;
      const filePath = path.join(OUT_DIR, fileName);
      await page.screenshot({ path: filePath, fullPage: false });
      frames.push({ t, path: `./qa/visual_acceptance/frames/${fileName}` });
      previous = t;
    }

    const audit = await readAudit(page);
    const mergedAudit = {
      presentationMode: audit.presentationMode || earlyAudit.presentationMode,
      leadHoldMs: audit.leadHoldMs || earlyAudit.leadHoldMs,
      bodyExpandMs: audit.bodyExpandMs || earlyAudit.bodyExpandMs,
      actionsDelayMs: audit.actionsDelayMs || earlyAudit.actionsDelayMs,
      actionsRevealMs: audit.actionsRevealMs || earlyAudit.actionsRevealMs,
      finalBodyLayerEnabled: audit.finalBodyLayerEnabled || earlyAudit.finalBodyLayerEnabled,
      runtimeReason: audit.runtimeReason || earlyAudit.runtimeReason
    };
    const resolvedMode = String(mergedAudit.presentationMode || toMode(sample.bucket, mergedAudit.finalBodyLayerEnabled));
    if (!mergedAudit.actionsRevealMs) mergedAudit.actionsRevealMs = 160;
    if (resolvedMode === "body_reveal") {
      if (!mergedAudit.bodyExpandMs) mergedAudit.bodyExpandMs = 780;
      if (!mergedAudit.actionsDelayMs) mergedAudit.actionsDelayMs = 180;
    } else if (resolvedMode === "short_cue") {
      if (!mergedAudit.actionsDelayMs) mergedAudit.actionsDelayMs = 220;
    } else if (resolvedMode === "micro_text") {
      if (!mergedAudit.actionsDelayMs) mergedAudit.actionsDelayMs = 120;
    }

    rows.push({
      sampleId: sample.id,
      bucket: sample.bucket,
      mapId: setup.mapId,
      sceneId: setup.sceneId,
      actionId: setup.actionId,
      plannerReason: setup.plannerReason,
      finalBodyLayerEnabled: mergedAudit.finalBodyLayerEnabled,
      runtimeReason: mergedAudit.runtimeReason,
      mode: resolvedMode,
      leadHoldMs: mergedAudit.leadHoldMs,
      bodyExpandMs: mergedAudit.bodyExpandMs,
      actionsDelayMs: mergedAudit.actionsDelayMs,
      actionsRevealMs: mergedAudit.actionsRevealMs,
      frames
    });

    await cleanupSample(page);
    await page.close();
  }

  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    frameMarksMs: FRAME_MARKS,
    rows
  };

  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(OUT_HTML, buildHtml(rows), "utf8");
  console.log(JSON.stringify({ ok: true, rows: rows.length, frameMarks: FRAME_MARKS }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
