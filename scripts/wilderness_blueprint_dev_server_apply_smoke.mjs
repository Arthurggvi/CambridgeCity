/**
 * Node API-level smoke test for tools/wilderness_area_preview/dev_server.mjs
 *
 * Requirements:
 * - No browser / no Playwright
 * - Starts the dev_server via child_process.spawn (no shell:true)
 * - Calls HTTP endpoints and asserts apply / rollback / snapshot behavior
 * - Leaves the repo clean: restores compact/generated/manifest and removes test snapshots
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import assert from "node:assert/strict";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const HOST = "127.0.0.1";
const PORT_CANDIDATES = [5588, 5589, 5590, 5591, 5592];
let PORT = 5588;
let BASE = `http://${HOST}:${PORT}`;
const AREA = "west2_old_marker_patrol_line";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sha256Hex(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
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

function httpJson(method, url, bodyObj) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = bodyObj ? Buffer.from(JSON.stringify(bodyObj), "utf8") : null;
    const req = http.request(
      {
        method,
        hostname: u.hostname,
        port: Number(u.port || 80),
        path: `${u.pathname}${u.search}`,
        headers: {
          "content-type": "application/json; charset=utf-8",
          ...(body ? { "content-length": String(body.length) } : {})
        },
        timeout: 10_000
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let obj = null;
          try {
            obj = raw ? JSON.parse(raw) : null;
          } catch (e) {
            return reject(new Error(`invalid_json_response status=${res.statusCode} body=${raw.slice(0, 200)} err=${String(e)}`));
          }
          resolve({ status: Number(res.statusCode || 0), json: obj, raw });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitForHealth({ timeoutMs }) {
  const started = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const r = await httpJson("GET", `${BASE}/api/health`);
      if (r.status === 200 && r.json?.ok === true) return;
    } catch {
      // ignore
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error("dev_server health timeout");
    }
    await sleep(100);
  }
}

function listSnapshotFiles(areaId) {
  const dir = path.join(REPO_ROOT, "tools", "wilderness_area_preview", "snapshots", areaId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => n.endsWith(".compact.json")).sort();
}

function manifestPath(areaId) {
  return path.join(REPO_ROOT, "tools", "wilderness_area_preview", "snapshots", areaId, "manifest.json");
}

function compactPath(areaId) {
  return path.join(REPO_ROOT, "tools", "wilderness_area_preview", "blueprints", `${areaId}.compact.json`);
}

function generatedPath(areaId) {
  return path.join(REPO_ROOT, "data", "wilderness", "areas", "generated", `${areaId}.generated_terrain_zones.js`);
}

function parseJsonOrNull(text) {
  try {
    return text == null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

function assertGeneratedFileLooksSafe(genText) {
  assert.ok(typeof genText === "string" && genText.length > 0, "generated file must exist and be non-empty");
  for (const bad of ["blueprintState", "terrainRuns", "terrainCells", "screenX", "screenY", "svgX", "svgY", "clientX", "clientY", "<svg", "viewBox"]) {
    assert.ok(!genText.includes(bad), `generated file must not include ${bad}`);
  }
  assert.ok(genText.includes("GENERATED_TERRAIN_ZONES"), "generated file must export GENERATED_TERRAIN_ZONES");
  assert.ok(genText.includes("GENERATED_LANDMARKS"), "generated file must export GENERATED_LANDMARKS");
  assert.ok(genText.includes("shape"), "generated file must include zone shapes");
}

async function pickPortCandidate() {
  // Prefer a port that is not already serving /api/health (avoid EADDRINUSE).
  // This does NOT scan beyond the fixed candidate list.
  for (const p of PORT_CANDIDATES) {
    try {
      const r = await httpJson("GET", `http://${HOST}:${p}/api/health`);
      if (r.status === 200 && r.json?.ok === true) {
        // occupied by an existing server; skip
        continue;
      }
    } catch {
      // connection failed → likely free
      return p;
    }
  }
  // If all are occupied, just return the first; dev_server will fail clearly.
  return PORT_CANDIDATES[0];
}

async function main() {
  PORT = await pickPortCandidate();
  BASE = `http://${HOST}:${PORT}`;
  const serverPath = path.join(REPO_ROOT, "tools", "wilderness_area_preview", "dev_server.mjs");
  const child = spawn(process.execPath, [serverPath], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: { ...process.env, PORT: String(PORT) }
  });

  let childOut = "";
  let childErr = "";
  let childExited = false;
  let childExitCode = null;
  child.on("exit", (code) => {
    childExited = true;
    childExitCode = code;
  });
  child.stdout.on("data", (d) => { childOut += d.toString("utf8"); });
  child.stderr.on("data", (d) => { childErr += d.toString("utf8"); });

  const initial = {
    compactText: readFileTextOrNull(compactPath(AREA)),
    generatedText: readFileTextOrNull(generatedPath(AREA)),
    manifestText: readFileTextOrNull(manifestPath(AREA)),
    snapshotFiles: listSnapshotFiles(AREA)
  };

  const cleanup = async () => {
    // Restore files
    if (initial.compactText != null) writeFileAtomic(compactPath(AREA), initial.compactText);
    if (initial.generatedText != null) {
      writeFileAtomic(generatedPath(AREA), initial.generatedText);
    } else {
      try { if (fs.existsSync(generatedPath(AREA))) fs.unlinkSync(generatedPath(AREA)); } catch { /* ignore */ }
    }
    if (initial.manifestText != null) {
      writeFileAtomic(manifestPath(AREA), initial.manifestText);
    } else {
      try { if (fs.existsSync(manifestPath(AREA))) fs.unlinkSync(manifestPath(AREA)); } catch { /* ignore */ }
    }
    // Remove newly created snapshot files (only .compact.json under this area)
    const after = listSnapshotFiles(AREA);
    const beforeSet = new Set(initial.snapshotFiles);
    for (const f of after) {
      if (!beforeSet.has(f)) {
        try { fs.unlinkSync(path.join(REPO_ROOT, "tools", "wilderness_area_preview", "snapshots", AREA, f)); } catch { /* ignore */ }
      }
    }
    // Also remove any staged .tmp that might have been left behind
    const snapDir = path.join(REPO_ROOT, "tools", "wilderness_area_preview", "snapshots", AREA);
    if (fs.existsSync(snapDir)) {
      for (const f of fs.readdirSync(snapDir)) {
        if (f.endsWith(".compact.json.tmp")) {
          try { fs.unlinkSync(path.join(snapDir, f)); } catch { /* ignore */ }
        }
      }
    }
    // Remove any pending files
    const pendingDir = path.join(REPO_ROOT, "tools", "wilderness_area_preview", ".pending");
    if (fs.existsSync(pendingDir)) {
      for (const f of fs.readdirSync(pendingDir)) {
        if (f.includes(AREA) && f.endsWith(".compact.json")) {
          try { fs.unlinkSync(path.join(pendingDir, f)); } catch { /* ignore */ }
        }
      }
    }

    // stop server
    try { child.kill(); } catch { /* ignore */ }
  };

  try {
    // Wait for spawned server health; if it exits, treat as failure.
    const started = Date.now();
    while (true) {
      if (childExited) throw new Error(`dev_server exited early (code=${String(childExitCode)})`);
      try {
        const r = await httpJson("GET", `${BASE}/api/health`);
        if (r.status === 200 && r.json?.ok === true) break;
      } catch {
        // ignore
      }
      if (Date.now() - started > 10_000) throw new Error("dev_server health timeout");
      await sleep(100);
    }
    // If the spawned server failed to bind and exited, don't accidentally talk to some other server.
    await sleep(50);
    if (childExited) throw new Error(`dev_server exited early (code=${String(childExitCode)})`);
    if (childErr.includes("failed to bind any port")) {
      throw new Error("dev_server could not bind ports 5588-5592 (already in use)");
    }

    // --- success apply ---
    const goodCompact = {
      schemaVersion: 2,
      kind: "wilderness_blueprint_compact",
      sourceAreaId: AREA,
      metersPerCell: 150,
      terrainRuns: {
        managed_compacted_route: [
          ["h", -1, -1, 3],
          ["h", -1, 0, 3],
          ["h", -1, 1, 3]
        ],
        flagged_marker_line: [
          ["h", 0, 0, 7],
          ["h", 0, 1, 7],
          ["h", 1, 2, 6]
        ],
        snow_drift_zone: [
          ["h", 3, -2, 5],
          ["h", 3, -1, 5],
          ["h", 3, 0, 5],
          ["h", 3, 1, 5]
        ],
        sastrugi_field: [
          ["h", -4, 2, 9],
          ["h", -4, 3, 9],
          ["h", -4, 4, 9],
          ["h", -4, 5, 9]
        ],
        ice_shelf_edge: [
          ["v", 7, -8, 17]
        ]
      },
      terrainCells: {
        // ensure at least one "final key terrainId" exists without altering sample points
        blue_ice_area: [[-8, 8]]
      },
      subtractCells: [],
      specialMapCells: [
        [5, 2, "west2_maintenance_corridor_entry", "维修通道外门"]
      ]
    };

    const r1 = await httpJson("POST", `${BASE}/api/wilderness-blueprint/apply`, { area: AREA, compact: goodCompact });
    assert.equal(r1.status, 200, `apply success http ${r1.status} body=${r1.raw.slice(0, 400)}`);
    assert.equal(r1.json?.ok, true, `apply should return ok:true got=${r1.raw}`);

    const compactAfter1Text = readFileTextOrNull(compactPath(AREA));
    const compactAfter1 = parseJsonOrNull(compactAfter1Text);
    assert.ok(compactAfter1, "official compact must parse as JSON after apply");
    assert.deepEqual(compactAfter1, goodCompact, "official compact must equal posted compact");

    const genAfter1Text = readFileTextOrNull(generatedPath(AREA));
    assertGeneratedFileLooksSafe(genAfter1Text);
    assert.ok(genAfter1Text.includes("wind_packed_snow") || genAfter1Text.includes("managed_compacted_route") || genAfter1Text.includes("blue_ice_area"), "generated file must include at least one expected terrainId");

    // snapshots list should include the previous compact if it existed and differed
    const snaps1 = await httpJson("GET", `${BASE}/api/wilderness-blueprint/snapshots?area=${encodeURIComponent(AREA)}`);
    assert.equal(snaps1.status, 200);
    assert.equal(snaps1.json?.ok, true);
    const snapList1 = Array.isArray(snaps1.json?.snapshots) ? snaps1.json.snapshots : [];

    if (initial.compactText && sha256Hex(initial.compactText) !== sha256Hex(JSON.stringify(goodCompact, null, 2) + "\n")) {
      // Should have at least one snapshot available now
      assert.ok(snapList1.length >= 1, "snapshots list should contain at least one entry after successful apply");
      const sid = String(snapList1[0]?.id || "");
      assert.ok(sid, "snapshot id must be non-empty");
      const snapGet = await httpJson(
        "GET",
        `${BASE}/api/wilderness-blueprint/snapshot?area=${encodeURIComponent(AREA)}&snapshotId=${encodeURIComponent(sid)}`
      );
      assert.equal(snapGet.status, 200);
      assert.equal(snapGet.json?.ok, true);
      assert.equal(snapGet.json?.compact?.kind, "wilderness_blueprint_compact");
    }

    // --- failure rollback apply ---
    const badCompact = {
      ...goodCompact,
      terrainRuns: {
        __bad_terrain__: [["h", 0, 0, 1]]
      }
    };

    const snapsBeforeFail = await httpJson("GET", `${BASE}/api/wilderness-blueprint/snapshots?area=${encodeURIComponent(AREA)}`);
    const snapCountBeforeFail = Array.isArray(snapsBeforeFail.json?.snapshots) ? snapsBeforeFail.json.snapshots.length : 0;

    const r2 = await httpJson("POST", `${BASE}/api/wilderness-blueprint/apply`, { area: AREA, compact: badCompact });
    assert.ok(r2.status >= 400, `apply failure should be 4xx/5xx, got ${r2.status}`);
    assert.equal(r2.json?.ok, false, `apply failure should return ok:false got=${r2.raw}`);
    assert.ok(typeof r2.json?.stage === "string" && r2.json.stage.length > 0, "apply failure must include stage");

    // ensure compact & generated unchanged (still the successful one)
    const compactAfter2 = parseJsonOrNull(readFileTextOrNull(compactPath(AREA)));
    assert.deepEqual(compactAfter2, goodCompact, "failed apply must not overwrite official compact");
    const genAfter2Text = readFileTextOrNull(generatedPath(AREA));
    assert.equal(genAfter2Text, genAfter1Text, "failed apply must not change generated file");

    // ensure no new snapshot committed for failed apply
    const snapsAfterFail = await httpJson("GET", `${BASE}/api/wilderness-blueprint/snapshots?area=${encodeURIComponent(AREA)}`);
    const snapCountAfterFail = Array.isArray(snapsAfterFail.json?.snapshots) ? snapsAfterFail.json.snapshots.length : 0;
    assert.equal(snapCountAfterFail, snapCountBeforeFail, "failed apply must not commit a new snapshot");

    process.stdout.write("OK: wilderness blueprint dev_server apply smoke passed.\n");
  } catch (e) {
    process.stderr.write(`FAIL: ${String(e?.stack || e)}\n`);
    process.stderr.write(`\n--- dev_server stdout (tail) ---\n${childOut.slice(-2000)}\n`);
    process.stderr.write(`\n--- dev_server stderr (tail) ---\n${childErr.slice(-2000)}\n`);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

await main();

