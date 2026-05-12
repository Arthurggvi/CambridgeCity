/**
 * Local authoring server for wilderness area preview.
 *
 * Responsibilities:
 * - Serve tools/wilderness_area_preview/index.html at GET /
 * - Expose blueprint apply pipeline with strict isolation:
 *   - snapshot old compact into tools/.../snapshots/
 *   - overwrite tools/.../blueprints/<area>.compact.json
 *   - run compiler write + static contract check
 *   - rollback on failure
 *
 * Security:
 * - Binds 127.0.0.1 only
 * - Area allowlist
 * - Payload size limit
 * - No eval / Function
 * - child_process without shell
 */

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const HOST = "127.0.0.1";
const DEFAULT_PORT = 5588;
const PORT_CANDIDATES = Object.freeze([5588, 5589, 5590, 5591, 5592]);
let ACTUAL_PORT = DEFAULT_PORT;
let PRIMARY_AREA = "west2_old_marker_patrol_line";
const SERVER_STARTED_AT = new Date().toISOString();

const AREA_ALLOWLIST = new Set(["west2_old_marker_patrol_line"]);

const APPLY_DEBUG_REVISION = "apply-debug-v2";
const APPLY_DEBUG_ROOT = path.join(REPO_ROOT, "temp", "wilderness_blueprint_apply_debug");

function makeDebugId() {
  const iso = new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
  const rand = crypto.randomBytes(3).toString("hex"); // 6 chars
  return `${iso}_${rand}`;
}

function safeMkdirp(p) {
  try { fs.mkdirSync(p, { recursive: true }); return true; } catch { return false; }
}

function safeWriteText(p, text) {
  try { fs.writeFileSync(p, String(text ?? ""), "utf8"); return true; } catch { return false; }
}

function safeWriteJson(p, obj) {
  try { fs.writeFileSync(p, JSON.stringify(obj ?? null, null, 2) + "\n", "utf8"); return true; } catch { return false; }
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const out = {
    area: "west2_old_marker_patrol_line",
    export: false,
    open: false,
    port: null
  };
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i] || "");
    if (a === "--area") {
      out.area = String(args[i + 1] || "");
      i++;
      continue;
    }
    if (a === "--export") { out.export = true; continue; }
    if (a === "--open") { out.open = true; continue; }
    if (a === "--no-open") { out.open = false; continue; }
    if (a === "--port") {
      out.port = Number(args[i + 1]);
      i++;
      continue;
    }
  }
  return out;
}

function isAllowedListenPort(port) {
  const p = Number(port);
  return Number.isFinite(p) && PORT_CANDIDATES.includes(p);
}

function openLocalPreviewUrl(url) {
  let u = String(url || "").trim();
  console.log(`[wilderness_area_preview] open browser requested: ${u}`);
  // Normalize: allow missing trailing slash.
  if (/^http:\/\/127\.0\.0\.1:\d+$/.test(u)) u = u + "/";
  if (!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(u)) {
    console.log("[wilderness_area_preview] open browser refused: non-local url");
    throw new Error("refuse_to_open_non_local_url");
  }
  const platform = os.platform();
  if (platform === "win32") {
    // Prefer cmd start; fallback to explorer.exe if cmd is unavailable.
    try {
      // start is a cmd builtin; keep shell:false by spawning cmd.exe explicitly.
      console.log(`[wilderness_area_preview] open browser command: cmd.exe /c start \"\" ${u}`);
      spawn("cmd.exe", ["/c", "start", "", u], { stdio: "ignore", shell: false, windowsHide: true }).unref();
    } catch {
      console.log(`[wilderness_area_preview] open browser fallback: explorer.exe ${u}`);
      spawn("explorer.exe", [u], { stdio: "ignore", shell: false, windowsHide: true }).unref();
    }
    return;
  }
  if (platform === "darwin") {
    console.log(`[wilderness_area_preview] open browser command: open ${u}`);
    spawn("open", [u], { stdio: "ignore", shell: false }).unref();
    return;
  }
  // linux and others
  console.log(`[wilderness_area_preview] open browser command: xdg-open ${u}`);
  spawn("xdg-open", [u], { stdio: "ignore", shell: false }).unref();
}

function httpGetJsonWithTimeout(url, { timeoutMs }) {
  const u = new URL(String(url));
  const ms = Math.max(1, Number(timeoutMs || 0) || 0);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: "GET",
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        timeout: ms
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (d) => { text += d; });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode || 0, json: JSON.parse(text || "{}") });
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}

async function tryReuseExistingServer({ preferredPort, shouldOpen }) {
  const candidates = (() => {
    const list = buildPortCandidates();
    if (isAllowedListenPort(preferredPort)) {
      const p = Number(preferredPort);
      return [p, ...list.filter((x) => x !== p)];
    }
    return list;
  })();

  for (const port of candidates) {
    try {
      const r = await httpGetJsonWithTimeout(`http://${HOST}:${port}/api/health`, { timeoutMs: 250 });
      if (r.status !== 200) continue;
      if (r?.json?.service !== "wilderness_area_preview_author_server") continue;
      const url = `http://${HOST}:${port}/`;
      console.log("Wilderness area preview author server already running.\n");
      console.log("Open:\n  " + url + "\n");
      if (shouldOpen) {
        // Important: if launched with --open, we must actually open the URL even when reusing.
        try {
          openLocalPreviewUrl(url);
        } catch {
          console.log("Open manually: " + url);
        }
      }
      return { reused: true, port, url };
    } catch {
      // ignore and continue
    }
  }

  return { reused: false };
}

// --- In-memory authoring logs (ring buffer, not persisted) ---
const SERVER_LOG_MAX = 500;
/** @type {Map<string, Array<{ts:string, level:string, area:string, message:string, detail:string}>>} */
const SERVER_LOGS_BY_AREA = new Map();

function truncateText(input, maxLen) {
  const s = String(input ?? "");
  const n = Number(maxLen || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (s.length <= n) return s;
  return s.slice(0, n) + `…(truncated:${s.length - n})`;
}

function sanitizeDetail(detail) {
  if (detail == null) return "";
  if (typeof detail === "string") return truncateText(detail, 2000);
  try {
    // Prevent accidentally logging full compact JSON or large stdout/stderr.
    const jsonText = JSON.stringify(detail, (k, v) => {
      if (k === "compact") return "[omitted:compact]";
      if (k === "pendingText") return "[omitted:pendingText]";
      if (k === "oldCompactText") return "[omitted:oldCompactText]";
      if (k === "oldGeneratedText") return "[omitted:oldGeneratedText]";
      if (k === "stdout" || k === "stderr") return "[omitted:child_output]";
      return v;
    });
    return truncateText(jsonText, 2000);
  } catch {
    return truncateText(String(detail), 2000);
  }
}

function serverLog(level, areaId, message, detail) {
  const area = safeArea(areaId);
  if (!area) return;
  const entry = Object.freeze({
    ts: new Date().toISOString(),
    level: String(level || "info"),
    area,
    message: truncateText(String(message || ""), 400),
    detail: sanitizeDetail(detail)
  });
  const arr = SERVER_LOGS_BY_AREA.get(area) ?? [];
  arr.push(entry);
  while (arr.length > SERVER_LOG_MAX) arr.shift();
  SERVER_LOGS_BY_AREA.set(area, arr);
}

function getServerLogs(areaId, limit) {
  const area = safeArea(areaId);
  if (!area) return [];
  const max = Math.min(Math.max(Number(limit || 0) || 200, 1), SERVER_LOG_MAX);
  const arr = SERVER_LOGS_BY_AREA.get(area) ?? [];
  const start = Math.max(0, arr.length - max);
  return arr.slice(start);
}

function clearServerLogs(areaId) {
  const area = safeArea(areaId);
  if (!area) return false;
  SERVER_LOGS_BY_AREA.set(area, []);
  return true;
}

function safeArea(areaRaw) {
  const area = String(areaRaw || "").trim();
  if (!area) return null;
  if (area.includes("..") || area.includes("/") || area.includes("\\") || area.includes("%")) return null;
  if (!AREA_ALLOWLIST.has(area)) return null;
  return area;
}

function sha256Hex(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function isoCompactId() {
  const d = new Date();
  const y = String(d.getUTCFullYear());
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${da}T${hh}${mm}${ss}Z`;
}

function json(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function errorJson(res, status, { ok = false, error, stage, details }) {
  return json(res, status, {
    ok: !!ok && status < 400,
    error: String(error || "unknown_error"),
    stage: String(stage || "unknown"),
    details: details ?? null
  });
}

function setCors(req, res) {
  const origin = String(req.headers.origin || "");
  if (origin === "null" || origin === `http://${HOST}:${ACTUAL_PORT}`) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
  }
}

async function readBodyJson(req, { limitBytes }) {
  const chunks = [];
  let size = 0;
  return await new Promise((resolve, reject) => {
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function mustMatchCompact(compact, areaId) {
  const rawText = JSON.stringify(compact);
  for (const bad of ["screenX", "screenY", "svgX", "svgY", "clientX", "clientY", "viewBox", "viewport"]) {
    if (rawText.includes(bad)) {
      return { ok: false, error: `forbidden_field:${bad}` };
    }
  }
  if (compact?.kind !== "wilderness_blueprint_compact") return { ok: false, error: "bad_kind" };
  if (compact?.schemaVersion !== 2) return { ok: false, error: "bad_schemaVersion" };
  if (String(compact?.sourceAreaId || "").trim() !== areaId) return { ok: false, error: "sourceAreaId_mismatch" };
  return { ok: true };
}

function runNodeScript(args, { cwd }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"], shell: false });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d.toString("utf8"); });
    child.stderr.on("data", (d) => { err += d.toString("utf8"); });
    child.on("close", (code) => resolve({ code: Number(code || 0), stdout: out, stderr: err }));
  });
}

async function runExporter(areaId) {
  const area = safeArea(areaId);
  if (!area) return { ok: false, error: "bad_area" };
  const scriptRel = "scripts/wilderness_area_preview_export.mjs";
  const r = await runNodeScript([scriptRel, area], { cwd: REPO_ROOT });
  return { ok: r.code === 0, code: r.code, stdout: r.stdout, stderr: r.stderr };
}

function writeFileAtomic(targetPath, text) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, targetPath);
}

function readFileTextOrNull(p) {
  try {
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  } catch {
    return null;
  }
}

function ensureSnapshotsDir(areaId) {
  const dir = path.join(REPO_ROOT, "tools", "wilderness_area_preview", "snapshots", areaId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function manifestPath(areaId) {
  return path.join(ensureSnapshotsDir(areaId), "manifest.json");
}

function readManifest(areaId) {
  const p = manifestPath(areaId);
  const raw = readFileTextOrNull(p);
  if (!raw) return { schemaVersion: 1, area: areaId, snapshots: [] };
  try {
    const obj = JSON.parse(raw);
    const snaps = Array.isArray(obj?.snapshots) ? obj.snapshots : [];
    return { schemaVersion: 1, area: areaId, snapshots: snaps };
  } catch {
    return { schemaVersion: 1, area: areaId, snapshots: [] };
  }
}

function writeManifest(areaId, manifest) {
  writeFileAtomic(manifestPath(areaId), JSON.stringify(manifest, null, 2) + "\n");
}

function pruneSnapshots(areaId, maxKeep = 20) {
  const m = readManifest(areaId);
  const snaps = Array.isArray(m.snapshots) ? [...m.snapshots] : [];
  snaps.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  while (snaps.length > maxKeep) {
    const victim = snaps.shift();
    if (victim?.id) {
      const fp = path.join(ensureSnapshotsDir(areaId), `${victim.id}.compact.json`);
      try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch { /* ignore */ }
    }
  }
  m.snapshots = snaps;
  writeManifest(areaId, m);
}

async function handleApply(req, res) {
  let stage = "init";
  let body = null;
  const receivedAt = new Date().toISOString();
  /** @type {string[]} */
  const commands = [];
  let allowExpandBounds = false;
  /** @type {string|null} */
  let areaIdForDebug = null;
  const debugId = makeDebugId();
  const debugDir = path.join(APPLY_DEBUG_ROOT, debugId);
  const debugEnabled = safeMkdirp(debugDir);
  const debugWarn = (message, detail) => {
    serverLog("warn", safeArea(body?.area) || "unknown", message, { debugId, ...(detail || {}) });
  };
  try {
  try {
    stage = "read_body";
    body = await readBodyJson(req, { limitBytes: 5 * 1024 * 1024 });
  } catch (e) {
    const resp = { ok: false, error: "invalid_json_or_too_large", stage, details: { message: String(e?.message || e) }, debugId };
    if (debugEnabled) {
      safeWriteJson(path.join(debugDir, "request.json"), {
        receivedAt,
        method: String(req?.method || ""),
        url: String(req?.url || ""),
        headers: { "content-type": String(req?.headers?.["content-type"] || "") },
        body
      }) || debugWarn("apply debug write failed", { file: "request.json" });
      safeWriteJson(path.join(debugDir, "response.json"), resp) || debugWarn("apply debug write failed", { file: "response.json" });
      safeWriteJson(path.join(debugDir, "server_meta.json"), {
        handlerRevision: APPLY_DEBUG_REVISION,
        processPid: process.pid,
        serverStartedAt: SERVER_STARTED_AT,
        port: ACTUAL_PORT,
        commandArgs: process.argv,
        areaId: null
      }) || debugWarn("apply debug write failed", { file: "server_meta.json" });
    }
    return json(res, 200, resp);
  }

  stage = "validate";
  const areaId = safeArea(body?.area);
  areaIdForDebug = areaId || null;
  if (!areaId) {
    const resp = { ok: false, error: "bad_area", stage, details: null, debugId };
    if (debugEnabled) {
      safeWriteJson(path.join(debugDir, "request.json"), {
        receivedAt,
        method: String(req?.method || ""),
        url: String(req?.url || ""),
        headers: { "content-type": String(req?.headers?.["content-type"] || "") },
        body
      }) || serverLog("warn", "unknown", "apply debug write failed", { debugId, file: "request.json" });
      safeWriteJson(path.join(debugDir, "response.json"), resp) || serverLog("warn", "unknown", "apply debug write failed", { debugId, file: "response.json" });
      safeWriteJson(path.join(debugDir, "server_meta.json"), {
        handlerRevision: APPLY_DEBUG_REVISION,
        processPid: process.pid,
        serverStartedAt: SERVER_STARTED_AT,
        port: ACTUAL_PORT,
        commandArgs: process.argv,
        areaId: null
      }) || serverLog("warn", "unknown", "apply debug write failed", { debugId, file: "server_meta.json" });
    }
    return json(res, 200, resp);
  }

  allowExpandBounds = body?.allowExpandBounds === true;

  serverLog("info", areaId, "apply request received", { hasCompact: !!body?.compact, debugId, allowExpandBounds });

  const compact = body?.compact;
  const v = mustMatchCompact(compact, areaId);
  if (!v.ok) {
    serverLog("warn", areaId, "compact validation failed", { error: v.error });
    const resp = { ok: false, error: v.error, stage, details: null, debugId };
    if (debugEnabled) {
      safeWriteJson(path.join(debugDir, "request.json"), {
        receivedAt,
        method: String(req?.method || ""),
        url: String(req?.url || ""),
        headers: { "content-type": String(req?.headers?.["content-type"] || "") },
        body
      }) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "request.json" });
      safeWriteJson(path.join(debugDir, "compact.json"), compact) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "compact.json" });
      safeWriteJson(path.join(debugDir, "response.json"), resp) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "response.json" });
      safeWriteJson(path.join(debugDir, "server_meta.json"), {
        handlerRevision: APPLY_DEBUG_REVISION,
        processPid: process.pid,
        serverStartedAt: SERVER_STARTED_AT,
        port: ACTUAL_PORT,
        commandArgs: process.argv,
        areaId
      }) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "server_meta.json" });
    }
    return json(res, 200, resp);
  }
  serverLog("info", areaId, "compact validation passed", { kind: compact?.kind, schemaVersion: compact?.schemaVersion });

  if (debugEnabled) {
    safeWriteJson(path.join(debugDir, "request.json"), {
      receivedAt,
      method: String(req?.method || ""),
      url: String(req?.url || ""),
      headers: { "content-type": String(req?.headers?.["content-type"] || "") },
      body
    }) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "request.json" });
    safeWriteJson(path.join(debugDir, "compact.json"), compact) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "compact.json" });
    safeWriteJson(path.join(debugDir, "server_meta.json"), {
      handlerRevision: APPLY_DEBUG_REVISION,
      processPid: process.pid,
      serverStartedAt: SERVER_STARTED_AT,
      port: ACTUAL_PORT,
      commandArgs: process.argv,
      areaId
    }) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "server_meta.json" });
  }

  // --- specialMapCells validation (must not silently drop in apply) ---
  stage = "special_map_check";
  const specialMapCells = Array.isArray(compact?.specialMapCells) ? compact.specialMapCells : [];
  const invalidSpecialMapCells = [];
  if (specialMapCells.length > 0) {
    for (let i = 0; i < specialMapCells.length; i += 1) {
      const row = specialMapCells[i];
      if (!Array.isArray(row) || row.length < 4) {
        invalidSpecialMapCells.push({ index: i, x: null, y: null, mapId: null, label: null, reason: "row must be [x,y,mapId,label]" });
        continue;
      }
      const x = Number(row[0]);
      const y = Number(row[1]);
      const mapId = String(row[2] ?? "").trim();
      const label = String(row[3] ?? "").trim();
      if (!mapId) {
        invalidSpecialMapCells.push({ index: i, x, y, mapId, label, reason: "mapId missing" });
        continue;
      }
      const lowered = mapId.toLowerCase();
      if (mapId === "1" || lowered === "todo" || lowered === "placeholder") {
        invalidSpecialMapCells.push({ index: i, x, y, mapId, label, reason: "placeholder mapId (not a real map id)" });
        continue;
      }
      if (!label) {
        invalidSpecialMapCells.push({ index: i, x, y, mapId, label, reason: "label missing" });
        continue;
      }
      // Minimal validation: mapId must resolve to a real map file (json/js) under data/maps.
      const mapJson = path.join(REPO_ROOT, "data", "maps", `${mapId}.json`);
      const mapJs = path.join(REPO_ROOT, "data", "maps", `${mapId}.js`);
      if (!fs.existsSync(mapJson) && !fs.existsSync(mapJs)) {
        invalidSpecialMapCells.push({ index: i, x, y, mapId, label, reason: "mapId does not exist under data/maps" });
        continue;
      }
    }
  }
  if (invalidSpecialMapCells.length > 0) {
    const resp = {
      ok: false,
      decision: "requires_special_map_validation",
      error: "invalid_special_map_cells",
      stage: "special_map_check",
      area: areaId,
      debugId,
      details: { invalidSpecialMapCells: invalidSpecialMapCells.slice(0, 50) }
    };
    if (debugEnabled) {
      if (!safeWriteJson(path.join(debugDir, "response.json"), resp)) {
        serverLog("warn", areaId, "apply debug write failed", { debugId, file: "response.json" });
      }
    }
    return json(res, 200, resp);
  }

  stage = "pending_write";
  const pendingDir = path.join(REPO_ROOT, "tools", "wilderness_area_preview", ".pending");
  fs.mkdirSync(pendingDir, { recursive: true });
  const pendingId = `${areaId}.${isoCompactId()}.${crypto.randomBytes(4).toString("hex")}`;
  const pendingPath = path.join(pendingDir, `${pendingId}.compact.json`);
  const pendingText = JSON.stringify(compact, null, 2) + "\n";
  writeFileAtomic(pendingPath, pendingText);
  serverLog("info", areaId, "pending compact written", { pendingId });

  const compileScript = ["scripts/wilderness_blueprint_compile_area_spec.mjs"];
  const areaArg = ["--area", areaId];
  const pendingArg = ["--input", path.relative(REPO_ROOT, pendingPath).replace(/\\/g, "/")];

  // 1) dry-run against pending
  stage = "dry_run_spawn";
  commands.push(`node ${compileScript[0]} ${areaArg.join(" ")} ${pendingArg.join(" ")} --dry-run`);
  serverLog("info", areaId, "compile dry-run started", { input: pendingArg[1] });
  const dry = await runNodeScript([...compileScript, ...areaArg, ...pendingArg, "--dry-run"], { cwd: REPO_ROOT });
  if (dry.code !== 0) {
    try { fs.unlinkSync(pendingPath); } catch { /* ignore */ }
    serverLog("error", areaId, "compile dry-run failed", {
      exitCode: dry.code,
      stdoutTail: truncateText(dry.stdout, 2000),
      stderrTail: truncateText(dry.stderr, 2000)
    });
    if (debugEnabled) {
      safeWriteText(path.join(debugDir, "dry_stdout.txt"), String(dry.stdout || "")) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "dry_stdout.txt" });
      safeWriteText(path.join(debugDir, "dry_stderr.txt"), String(dry.stderr || "")) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "dry_stderr.txt" });
      // best-effort parse
      let parsed = null;
      try { parsed = JSON.parse(String(dry.stdout || "{}")); } catch { parsed = null; }
      safeWriteJson(path.join(debugDir, "dry_report.json"), parsed) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "dry_report.json" });
    }
    const resp = {
      ok: false,
      error: "compile_dry_run_failed",
      stage,
      debugId,
      details: { exitCode: dry.code, stdoutTail: truncateText(dry.stdout, 2000), stderrTail: truncateText(dry.stderr, 2000), commands }
    };
    if (debugEnabled) safeWriteJson(path.join(debugDir, "response.json"), resp) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "response.json" });
    return json(res, 200, resp);
  }
  serverLog("info", areaId, "compile dry-run passed", { exitCode: dry.code, stdoutTail: truncateText(dry.stdout, 600) });

  // Parse zoneCount + warnings from dry-run stdout (JSON)
  stage = "dry_run_parse";
  let dryReport = null;
  try { dryReport = JSON.parse(String(dry.stdout || "{}")); } catch { dryReport = null; }
  stage = "dry_run_debug_write";
  if (debugEnabled) {
    safeWriteText(path.join(debugDir, "dry_stdout.txt"), String(dry.stdout || "")) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "dry_stdout.txt" });
    safeWriteText(path.join(debugDir, "dry_stderr.txt"), String(dry.stderr || "")) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "dry_stderr.txt" });
    safeWriteJson(path.join(debugDir, "dry_report.json"), dryReport) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "dry_report.json" });
  }

  // Hard contract: do NOT implicitly expand bounds on first apply.
  // If out-of-bounds exists, require explicit allowExpandBounds=true.
  stage = "bounds_check";
  const oobSamples = Array.isArray(dryReport?.outOfBoundsSamples) ? dryReport.outOfBoundsSamples : [];
  const warnings = Array.isArray(dryReport?.warnings) ? dryReport.warnings : [];
  const reportErrors = Array.isArray(dryReport?.errors) ? dryReport.errors : [];

  const structuredCount = (typeof dryReport?.outOfBoundsCount === "number" && Number.isFinite(dryReport.outOfBoundsCount))
    ? Math.trunc(dryReport.outOfBoundsCount)
    : null;
  const hasStructured = structuredCount != null || oobSamples.length > 0;
  const hasStructuredOob = (structuredCount != null && structuredCount > 0) || oobSamples.length > 0;

  // Primary contract: dev_server must base bounds_check on structured fields.
  if (hasStructuredOob && allowExpandBounds !== true) {
    try { fs.unlinkSync(pendingPath); } catch { /* ignore */ }
    serverLog("info", areaId, "pending cleanup completed", { ok: true });
    serverLog("warn", areaId, "bounds check failed (requires allowExpandBounds)", { outOfBoundsCount: structuredCount, outOfBoundsCountKnown: structuredCount != null, outOfBoundsSamples: oobSamples.length });
    stage = "bounds_response";
    const resp = {
      ok: false,
      decision: "requires_expand_bounds_confirmation",
      error: "out_of_bounds",
      stage: "bounds_check",
      area: areaId,
      debugId,
      details: {
        allowExpandBounds: false,
        outOfBoundsCount: (structuredCount != null && structuredCount > 0) ? structuredCount : null,
        outOfBoundsCountKnown: structuredCount != null && structuredCount > 0,
        outOfBoundsSamples: oobSamples.slice(0, 12),
        warnings,
        baseBounds: dryReport?.baseBounds ?? dryReport?.bounds ?? null,
        authoringBounds: dryReport?.authoringBounds ?? null
      }
    };
    if (debugEnabled) safeWriteJson(path.join(debugDir, "response.json"), resp) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "response.json" });
    return json(res, 200, resp);
  }

  // Fallback only: warnings mention OOB but compiler report missing structured fields.
  const warningsMentionOob =
    warnings.some((w) => String(w).includes("out-of-bounds")) ||
    reportErrors.some((e) => String(e).includes("out-of-bounds"));
  if (!hasStructured && warningsMentionOob && allowExpandBounds !== true) {
    serverLog("warn", areaId, "out-of-bounds fallback parser used (compile report missing structured out-of-bounds data)", { warningsCount: warnings.length, errorsCount: reportErrors.length });
    try { fs.unlinkSync(pendingPath); } catch { /* ignore */ }
    serverLog("info", areaId, "pending cleanup completed", { ok: true });
    stage = "bounds_response";
    const resp = {
      ok: false,
      decision: "requires_expand_bounds_confirmation",
      error: "out_of_bounds",
      stage: "bounds_check",
      area: areaId,
      debugId,
      details: {
        allowExpandBounds: false,
        outOfBoundsCount: null,
        outOfBoundsCountKnown: false,
        outOfBoundsSamples: [],
        warnings,
        baseBounds: dryReport?.baseBounds ?? dryReport?.bounds ?? null,
        authoringBounds: dryReport?.authoringBounds ?? null,
        message: "compile report missing structured out-of-bounds data"
      }
    };
    if (debugEnabled) safeWriteJson(path.join(debugDir, "response.json"), resp) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "response.json" });
    return json(res, 200, resp);
  }

  const blueprintPath = path.join(REPO_ROOT, "tools", "wilderness_area_preview", "blueprints", `${areaId}.compact.json`);
  const generatedPath = path.join(REPO_ROOT, "data", "wilderness", "areas", "generated", `${areaId}.generated_terrain_zones.js`);

  const oldCompactText = readFileTextOrNull(blueprintPath);
  const oldGeneratedText = readFileTextOrNull(generatedPath);

  const newHash = sha256Hex(pendingText).slice(0, 8);
  const oldHash = oldCompactText ? sha256Hex(oldCompactText).slice(0, 8) : null;

  let snapshotCreated = false;
  let snapshotId = null;
  let pendingSnapshotTmpPath = null;
  let pendingSnapshotFinalPath = null;
  let pendingSnapshotManifestPatch = null;

  // prepare snapshot (two-phase): write pending file, commit to manifest only after full apply succeeds
  stage = "snapshot";
  if (oldCompactText && oldHash !== newHash) {
    snapshotId = `${isoCompactId()}_${sha256Hex(oldCompactText).slice(0, 8)}`;
    const snapDir = ensureSnapshotsDir(areaId);
    pendingSnapshotFinalPath = path.join(snapDir, `${snapshotId}.compact.json`);
    pendingSnapshotTmpPath = path.join(snapDir, `${snapshotId}.compact.json.tmp`);
    writeFileAtomic(pendingSnapshotTmpPath, oldCompactText);
    serverLog("info", areaId, "snapshot pending created", { snapshotId });

    const nowIso = new Date().toISOString();
    const label = `覆盖前快照 ${nowIso.slice(0, 16).replace("T", " ")}`;
    pendingSnapshotManifestPatch = {
      id: snapshotId,
      createdAt: nowIso,
      source: "before_apply",
      cellCount: null,
      sha256: sha256Hex(oldCompactText),
      label
    };
  }

  // 2) overwrite official blueprint compact (atomic)
  stage = "compact_overwrite";
  writeFileAtomic(blueprintPath, pendingText);
  serverLog("info", areaId, "formal compact overwritten", { path: path.relative(REPO_ROOT, blueprintPath).replace(/\\/g, "/") });

  // 3) write compile against official blueprint path
  stage = "compile_write";
  const writeArgs = [...compileScript, ...areaArg, "--input", `tools/wilderness_area_preview/blueprints/${areaId}.compact.json`, "--write"];
  if (allowExpandBounds === true) writeArgs.push("--allow-expand-bounds");
  const emitLandmarks = specialMapCells.length > 0;
  if (emitLandmarks) writeArgs.push("--emit-landmarks");
  commands.push(`node ${compileScript[0]} ${areaArg.join(" ")} --input tools/wilderness_area_preview/blueprints/${areaId}.compact.json --write${allowExpandBounds ? " --allow-expand-bounds" : ""}${emitLandmarks ? " --emit-landmarks" : ""}`);
  serverLog("info", areaId, "compile write started", { area: areaId, allowExpandBounds, debugId, command: commands[commands.length - 1] });
  const write = await runNodeScript(
    writeArgs,
    { cwd: REPO_ROOT }
  );
  if (write.code !== 0) {
    serverLog("error", areaId, "compile write failed", {
      exitCode: write.code,
      stdoutTail: truncateText(write.stdout, 2000),
      stderrTail: truncateText(write.stderr, 2000)
    });
    serverLog("warn", areaId, "rollback started", { reason: "compile_write_failed" });
    rollbackApply({ blueprintPath, generatedPath, oldCompactText, oldGeneratedText });
    serverLog("info", areaId, "rollback completed", { reason: "compile_write_failed" });
    // rollback snapshot staging
    if (pendingSnapshotTmpPath) {
      try { if (fs.existsSync(pendingSnapshotTmpPath)) fs.unlinkSync(pendingSnapshotTmpPath); } catch { /* ignore */ }
    }
    try { fs.unlinkSync(pendingPath); } catch { /* ignore */ }
    serverLog("info", areaId, "pending cleanup completed", { ok: true });
    return errorJson(res, 500, {
      error: "compile_write_failed",
      stage,
      details: { exitCode: write.code, stdoutTail: truncateText(write.stdout, 2000), stderrTail: truncateText(write.stderr, 2000), commands }
    });
  }
  serverLog("info", areaId, "compile write passed", { exitCode: write.code });

  // 4) static contract check
  stage = "static_contract";
  commands.push("node scripts/wilderness_static_contract_check.mjs");
  serverLog("info", areaId, "static contract started");
  const st = await runNodeScript(["scripts/wilderness_static_contract_check.mjs"], { cwd: REPO_ROOT });
  // Always persist full static stdout/stderr for forensics (best-effort).
  const staticStdoutPath = path.join(debugDir, "static_stdout.txt");
  const staticStderrPath = path.join(debugDir, "static_stderr.txt");
  if (debugEnabled) {
    if (!safeWriteText(staticStdoutPath, String(st.stdout || ""))) {
      serverLog("warn", areaId, "apply debug write failed", { debugId, file: "static_stdout.txt" });
    }
    if (!safeWriteText(staticStderrPath, String(st.stderr || ""))) {
      serverLog("warn", areaId, "apply debug write failed", { debugId, file: "static_stderr.txt" });
    }
  }
  if (st.code !== 0) {
    serverLog("error", areaId, "static contract failed", {
      exitCode: st.code,
      stdoutTail: truncateText(st.stdout, 2000),
      stderrTail: truncateText(st.stderr, 2000)
    });

    // --- Forensics: snapshot post-write state BEFORE rollback (best-effort) ---
    let generatedSnapshotPath = null;
    let formalCompactSnapshotPath = null;
    if (debugEnabled) {
      try {
        const genSnap = path.join(debugDir, "post_write_generated_terrain_zones.before_rollback.js");
        fs.copyFileSync(generatedPath, genSnap);
        generatedSnapshotPath = genSnap;
      } catch {
        serverLog("warn", areaId, "apply debug write failed", { debugId, file: "post_write_generated_terrain_zones.before_rollback.js" });
      }
      try {
        const compactSnap = path.join(debugDir, "formal_compact.before_rollback.json");
        fs.copyFileSync(blueprintPath, compactSnap);
        formalCompactSnapshotPath = compactSnap;
      } catch {
        serverLog("warn", areaId, "apply debug write failed", { debugId, file: "formal_compact.before_rollback.json" });
      }

      const staticContractResult = {
        debugId,
        stage: "static_contract",
        exitCode: st.code,
        stdoutTail: truncateText(st.stdout, 2000),
        stderrTail: truncateText(st.stderr, 2000),
        stdoutPath: staticStdoutPath,
        stderrPath: staticStderrPath,
        generatedSnapshotPath,
        formalCompactSnapshotPath,
        commands,
        allowExpandBounds,
        areaId
      };
      if (!safeWriteJson(path.join(debugDir, "static_contract_result.json"), staticContractResult)) {
        serverLog("warn", areaId, "apply debug write failed", { debugId, file: "static_contract_result.json" });
      }
    }

    serverLog("warn", areaId, "rollback started", { reason: "static_contract_failed" });
    rollbackApply({ blueprintPath, generatedPath, oldCompactText, oldGeneratedText });
    serverLog("info", areaId, "rollback completed", { reason: "static_contract_failed" });
    if (pendingSnapshotTmpPath) {
      try { if (fs.existsSync(pendingSnapshotTmpPath)) fs.unlinkSync(pendingSnapshotTmpPath); } catch { /* ignore */ }
    }
    try { fs.unlinkSync(pendingPath); } catch { /* ignore */ }
    serverLog("info", areaId, "pending cleanup completed", { ok: true });
    const resp = {
      ok: false,
      error: "static_contract_failed",
      stage,
      debugId,
      details: { exitCode: st.code, stdoutTail: truncateText(st.stdout, 2000), stderrTail: truncateText(st.stderr, 2000), commands }
    };
    if (debugEnabled) {
      if (!safeWriteJson(path.join(debugDir, "response.json"), resp)) {
        serverLog("warn", areaId, "apply debug write failed", { debugId, file: "response.json" });
      }
    }
    return json(res, 500, resp);
  }
  serverLog("info", areaId, "static contract passed", { exitCode: st.code });

  // commit snapshot (phase 2) only after write + static contract succeeded
  stage = "snapshot_commit";
  if (pendingSnapshotTmpPath && pendingSnapshotFinalPath && pendingSnapshotManifestPatch) {
    try {
      fs.renameSync(pendingSnapshotTmpPath, pendingSnapshotFinalPath);
      const m = readManifest(areaId);
      m.snapshots = Array.isArray(m.snapshots) ? m.snapshots : [];
      // De-dupe: if latest snapshot sha matches, don't add a new record (also remove staged file)
      const latestSha = typeof m.snapshots?.[0]?.sha256 === "string" ? m.snapshots[0].sha256 : null;
      if (latestSha && latestSha === pendingSnapshotManifestPatch.sha256) {
        try { if (fs.existsSync(pendingSnapshotFinalPath)) fs.unlinkSync(pendingSnapshotFinalPath); } catch { /* ignore */ }
        snapshotId = null;
        snapshotCreated = false;
        serverLog("info", areaId, "snapshot skipped because same hash", { sha256: pendingSnapshotManifestPatch.sha256.slice(0, 8) });
      } else {
        m.snapshots.unshift(pendingSnapshotManifestPatch);
        m.snapshots = m.snapshots.slice(0, 20);
        writeManifest(areaId, m);
        pruneSnapshots(areaId, 20);
        snapshotCreated = true;
        serverLog("info", areaId, "snapshot committed", { snapshotId });
      }
    } catch {
      // If snapshot commit fails, do not fail the apply; just report snapshotCreated=false
      snapshotCreated = false;
      serverLog("warn", areaId, "snapshot commit failed (non-fatal)");
    }
  }

  // success: cleanup pending
  stage = "cleanup";
  try { fs.unlinkSync(pendingPath); } catch { /* ignore */ }
  serverLog("info", areaId, "pending cleanup completed", { ok: true });
  serverLog("info", areaId, "apply success", { snapshotCreated, snapshotId, zoneCount: Number(dryReport?.output?.zoneCount ?? null) });

  const resp = {
    ok: true,
    area: areaId,
    snapshotCreated,
    snapshotId,
    zoneCount: Number(dryReport?.output?.zoneCount ?? null),
    warnings: Array.isArray(dryReport?.warnings) ? dryReport.warnings : [],
    commands,
    debugId,
    // apply itself does not regenerate the preview HTML; this flag tells the
    // frontend to prompt the user for an explicit "从游戏文件重载预览" click.
    previewRegenerated: false,
    emittedLandmarks: emitLandmarks,
    emittedLandmarkCount: emitLandmarks ? specialMapCells.length : 0
  };
  if (debugEnabled) safeWriteJson(path.join(debugDir, "response.json"), resp) || serverLog("warn", areaId, "apply debug write failed", { debugId, file: "response.json" });
  return json(res, 200, resp);
  } catch (e) {
    const failedAt = new Date().toISOString();
    const errorName = String(e?.name || "Error");
    const errorMessage = String(e?.message || e || "");
    const stack = String(e?.stack || "");
    const stackTail = stack.length > 4000 ? stack.slice(stack.length - 4000) : stack;
    const areaId = areaIdForDebug || safeArea(body?.area) || null;

    const exceptionPayload = {
      debugId,
      stage,
      errorName,
      errorMessage,
      stack,
      stackTail,
      commands,
      allowExpandBounds,
      areaId,
      receivedAt,
      failedAt,
      pid: process.pid
    };

    const responsePayload = {
      ok: false,
      error: "apply_unexpected_exception",
      stage,
      debugId,
      details: {
        errorName,
        errorMessage,
        stackTail,
        commands
      }
    };

    let debugWriteError = null;
    if (debugEnabled) {
      const okEx = safeWriteJson(path.join(debugDir, "exception.json"), exceptionPayload);
      const okResp = safeWriteJson(path.join(debugDir, "response.json"), responsePayload);
      if (!okEx || !okResp) debugWriteError = { exceptionWritten: okEx, responseWritten: okResp };
    }

    try {
      if (areaId) {
        serverLog("error", areaId, "apply unexpected exception", {
          debugId,
          stage,
          errorName,
          errorMessage,
          stackTail,
          commands,
          ...(debugWriteError ? { debugWriteError } : {})
        });
      }
    } catch { /* ignore */ }

    // Return HTTP 500 with debugId + stackTail (do not downgrade to 200).
    return json(res, 500, responsePayload);
  }
}

function rollbackApply({ blueprintPath, generatedPath, oldCompactText, oldGeneratedText }) {
  // restore blueprint compact
  if (oldCompactText != null) writeFileAtomic(blueprintPath, oldCompactText);
  // restore generated zones (or delete if was absent)
  if (oldGeneratedText != null) {
    writeFileAtomic(generatedPath, oldGeneratedText);
  } else {
    try { if (fs.existsSync(generatedPath)) fs.unlinkSync(generatedPath); } catch { /* ignore */ }
  }
}

function listSnapshots(areaId) {
  const m = readManifest(areaId);
  const snaps = Array.isArray(m.snapshots) ? m.snapshots : [];
  return snaps.map((s) => ({
    id: String(s?.id || ""),
    createdAt: String(s?.createdAt || ""),
    label: String(s?.label || ""),
    sha256: typeof s?.sha256 === "string" ? s.sha256 : "",
    cellCount: s?.cellCount ?? null
  }));
}

function snapshotFilePath(areaId, snapshotId) {
  const id = String(snapshotId || "").trim();
  if (!id || id.includes("..") || id.includes("/") || id.includes("\\") || id.includes("%")) return null;
  return path.join(ensureSnapshotsDir(areaId), `${id}.compact.json`);
}

function serveIndexHtml(req, res) {
  const p = path.join(REPO_ROOT, "tools", "wilderness_area_preview", "index.html");
  if (!fs.existsSync(p)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Missing tools/wilderness_area_preview/index.html. Run exporter first.");
    return;
  }
  const html = fs.readFileSync(p, "utf8");
  // Disable HTTP cache so the cache-bust ?reload=<token> URL is honoured
  // and a stale exporter output is never served after refresh-preview.
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    "pragma": "no-cache",
    "expires": "0"
  });
  res.end(html);
}

function tailString(s, max) {
  const text = String(s == null ? "" : s);
  if (text.length <= max) return text;
  return text.slice(text.length - max);
}

/**
 * Force-rebuild tools/wilderness_area_preview/index.html from the current
 * on-disk game files (data/wilderness/**, generated terrain zones, AreaSpec
 * registry, terrain defs). Reads no client state at all.
 *
 * Request body (optional): { "area": "<areaId>" }. If omitted/invalid we
 * fall back to the dev_server's primary area (process.argv parsed earlier).
 *
 * Response on success (HTTP 200):
 *   { ok:true, area, previewRegenerated:true, reloadToken, url, source:"game_files" }
 * Response on failure (HTTP 500):
 *   { ok:false, error:"refresh_preview_failed", stage:"export_preview",
 *     details:{ exitCode, stdoutTail, stderrTail } }
 */
async function handleRefreshPreview(req, res) {
  let body = null;
  try {
    body = await readBodyJson(req, { limitBytes: 64 * 1024 });
  } catch {
    body = null;
  }
  const requestedArea = safeArea(body?.area);
  const fallbackArea = safeArea(PRIMARY_AREA);
  const areaId = requestedArea || fallbackArea;
  if (!areaId) {
    serverLog("warn", "unknown", "refresh preview rejected: bad_area", {});
    return json(res, 400, { ok: false, error: "bad_area" });
  }

  const reloadToken = makeDebugId();
  serverLog("info", areaId, "refresh preview requested", {
    reloadToken,
    requestedArea: requestedArea || null,
    source: "game_files",
    command: `node scripts/wilderness_area_preview_export.mjs ${areaId}`
  });

  let r;
  try {
    r = await runExporter(areaId);
  } catch (e) {
    serverLog("error", areaId, "refresh preview failed (exporter exception)", {
      reloadToken,
      message: String(e?.message || e)
    });
    return json(res, 500, {
      ok: false,
      error: "refresh_preview_failed",
      stage: "export_preview",
      details: {
        exitCode: null,
        stdoutTail: "",
        stderrTail: tailString(String(e?.message || e), 4000)
      }
    });
  }

  if (!r.ok) {
    serverLog("error", areaId, "refresh preview failed", {
      reloadToken,
      exitCode: r.code,
      stdoutTail: tailString(r.stdout, 400),
      stderrTail: tailString(r.stderr, 400)
    });
    return json(res, 500, {
      ok: false,
      error: "refresh_preview_failed",
      stage: "export_preview",
      details: {
        exitCode: r.code,
        stdoutTail: tailString(r.stdout, 4000),
        stderrTail: tailString(r.stderr, 4000)
      }
    });
  }

  serverLog("info", areaId, "refresh preview passed", {
    reloadToken,
    exitCode: r.code,
    stdoutTail: tailString(r.stdout, 400)
  });
  return json(res, 200, {
    ok: true,
    area: areaId,
    previewRegenerated: true,
    reloadToken,
    url: `http://${HOST}:${ACTUAL_PORT}/?reload=${encodeURIComponent(reloadToken)}`,
    source: "game_files"
  });
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(String(req.url || "/"), `http://${HOST}:${DEFAULT_PORT}`);

  if (req.method === "GET" && url.pathname === "/") {
    return serveIndexHtml(req, res);
  }
  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      service: "wilderness_area_preview_author_server",
      version: 1,
      port: ACTUAL_PORT,
      supportedAreas: Array.from(AREA_ALLOWLIST),
      endpoints: {
        apply: "/api/wilderness-blueprint/apply",
        refreshPreview: "/api/wilderness-blueprint/refresh-preview",
        snapshots: "/api/wilderness-blueprint/snapshots",
        snapshot: "/api/wilderness-blueprint/snapshot",
        logs: "/api/wilderness-blueprint/logs",
        logsClear: "/api/wilderness-blueprint/logs/clear"
      }
    });
  }
  if (req.method === "POST" && url.pathname === "/api/wilderness-blueprint/apply") {
    return await handleApply(req, res);
  }
  if (req.method === "POST" && url.pathname === "/api/wilderness-blueprint/refresh-preview") {
    return await handleRefreshPreview(req, res);
  }
  if (req.method === "GET" && url.pathname === "/api/wilderness-blueprint/logs") {
    const areaId = safeArea(url.searchParams.get("area"));
    if (!areaId) return json(res, 400, { ok: false, error: "bad_area" });
    const limit = Math.min(Number(url.searchParams.get("limit") || 200), SERVER_LOG_MAX);
    serverLog("info", areaId, "logs requested", { limit });
    return json(res, 200, { ok: true, area: areaId, logs: getServerLogs(areaId, limit) });
  }
  if (req.method === "POST" && url.pathname === "/api/wilderness-blueprint/logs/clear") {
    let body = null;
    try {
      body = await readBodyJson(req, { limitBytes: 64 * 1024 });
    } catch {
      body = null;
    }
    const areaId = safeArea(body?.area ?? url.searchParams.get("area"));
    if (!areaId) return json(res, 400, { ok: false, error: "bad_area" });
    clearServerLogs(areaId);
    serverLog("info", areaId, "logs cleared");
    return json(res, 200, { ok: true, area: areaId });
  }
  if (req.method === "GET" && url.pathname === "/api/wilderness-blueprint/snapshots") {
    const areaId = safeArea(url.searchParams.get("area"));
    if (!areaId) return json(res, 400, { ok: false, error: "bad_area" });
    serverLog("info", areaId, "snapshots list requested");
    return json(res, 200, { ok: true, area: areaId, snapshots: listSnapshots(areaId) });
  }
  if (req.method === "GET" && url.pathname === "/api/wilderness-blueprint/snapshot") {
    const areaId = safeArea(url.searchParams.get("area"));
    const snapshotId = String(url.searchParams.get("snapshotId") || "");
    if (!areaId) return json(res, 400, { ok: false, error: "bad_area" });
    const fp = snapshotFilePath(areaId, snapshotId);
    if (!fp) return json(res, 400, { ok: false, error: "bad_snapshotId" });
    if (!fs.existsSync(fp)) return json(res, 404, { ok: false, error: "snapshot_not_found" });
    const raw = fs.readFileSync(fp, "utf8");
    let obj = null;
    try { obj = JSON.parse(raw); } catch { obj = null; }
    if (!obj) return json(res, 500, { ok: false, error: "snapshot_invalid_json" });
    serverLog("info", areaId, "snapshot loaded", { snapshotId });
    return json(res, 200, { ok: true, area: areaId, snapshotId, compact: obj });
  }

  res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, error: "not_found" }));
});

function buildPortCandidates() {
  const envPort = Number(process.env.PORT || "");
  const out = [];
  if (Number.isFinite(envPort) && PORT_CANDIDATES.includes(envPort)) out.push(envPort);
  for (const p of PORT_CANDIDATES) if (!out.includes(p)) out.push(p);
  return out;
}

function startListening({ preferredPort, shouldOpen }) {
  const candidates = (() => {
    const list = buildPortCandidates();
    if (isAllowedListenPort(preferredPort)) {
      const p = Number(preferredPort);
      return [p, ...list.filter((x) => x !== p)];
    }
    return list;
  })();
  let idx = 0;
  let started = false;
  const clearListenErrors = () => {
    try { server.removeAllListeners("error"); } catch { /* ignore */ }
  };
  const tryNext = () => {
    if (started) return;
    const port = candidates[idx++];
    if (!port) {
      console.error(`[wilderness_area_preview] failed to bind any port in ${candidates.join(", ")}`);
      process.exit(1);
    }
    clearListenErrors();
    server.once("error", (err) => {
      if (started) return;
      if (err && err.code === "EADDRINUSE") {
        tryNext();
      } else {
        console.error("[wilderness_area_preview] server listen error:", err);
        process.exit(1);
      }
    });
    server.listen(port, HOST, () => {
      if (started) return;
      started = true;
      clearListenErrors();
      ACTUAL_PORT = port;
      const url = `http://${HOST}:${port}/`;
      console.log("Wilderness area preview author server ready.\n");
      console.log("Open:\n  " + url + "\n");
      console.log("This page supports:\n  - one-click apply to game data\n  - snapshots\n  - logs\n");
      console.log("Do not use ordinary live-server port 5500 for one-click apply.\n");
      for (const area of AREA_ALLOWLIST) {
        serverLog("info", area, "server started", { host: HOST, port });
      }
      if (shouldOpen) {
        try {
          openLocalPreviewUrl(url);
        } catch {
          console.log("Open manually: " + url);
        }
      }
    });
  };
  tryNext();
}

const cli = parseArgs(process.argv.slice(2));
const area = safeArea(cli.area) || "west2_old_marker_patrol_line";
PRIMARY_AREA = area;
if (cli.export) {
  const r = await runExporter(area);
  if (!r.ok) {
    console.error("[wilderness_area_preview] exporter failed:", r.code);
    console.error(String(r.stderr || "").slice(-2000));
    process.exit(1);
  }
}
const reuse = await tryReuseExistingServer({ preferredPort: cli.port, shouldOpen: !!cli.open });
if (!reuse.reused) {
  startListening({ preferredPort: cli.port, shouldOpen: !!cli.open });
}

