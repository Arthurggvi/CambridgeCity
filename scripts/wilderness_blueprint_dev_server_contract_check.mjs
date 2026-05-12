/**
 * Static contract checks for tools/wilderness_area_preview/dev_server.mjs
 * (No server is started; purely source inspection.)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function mustInclude(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`Missing required snippet (${label}): ${needle}`);
  }
}

function mustNotInclude(haystack, needle, label) {
  if (haystack.includes(needle)) {
    throw new Error(`Found forbidden snippet (${label}): ${needle}`);
  }
}

const p = path.join(ROOT, "tools", "wilderness_area_preview", "dev_server.mjs");
if (!fs.existsSync(p)) {
  throw new Error("Missing tools/wilderness_area_preview/dev_server.mjs");
}
const src = fs.readFileSync(p, "utf8");

// Bind to 127.0.0.1 only
mustInclude(src, 'const HOST = "127.0.0.1"', "bind host");
mustInclude(src, "server.listen", "listen call");

// Health response fields
mustInclude(src, 'service: "wilderness_area_preview_author_server"', "health service name");
mustInclude(src, "supportedAreas", "health supportedAreas");
mustInclude(src, "endpoints", "health endpoints");

// apply errors must include stage JSON body
mustInclude(src, "errorJson", "errorJson helper exists");
mustInclude(src, "stage:", "stage field returned");

// Bounds expansion contract (must be explicit opt-in)
mustInclude(src, "allowExpandBounds", "apply supports allowExpandBounds flag");
mustInclude(src, "\"--allow-expand-bounds\"", "compiler flag token present");
mustInclude(src, "if (allowExpandBounds === true) writeArgs.push(\"--allow-expand-bounds\")", "allow-expand-bounds only when true");

// Limited port candidates (no unbounded scan)
mustInclude(src, "PORT_CANDIDATES", "port candidates defined");
mustInclude(src, "[5588, 5589, 5590, 5591, 5592]", "fixed port range");
mustInclude(src, 'err.code === "EADDRINUSE"', "port in-use retry");

// CLI flags + open helper
for (const token of ["--area", "--export", "--open", "--no-open", "--port"]) {
  mustInclude(src, token, "cli flag supported");
}
mustInclude(src, "openLocalPreviewUrl", "openLocalPreviewUrl exists");
mustInclude(src, "cmd.exe", "windows open strategy exists");
mustInclude(src, "xdg-open", "linux open strategy exists");
mustInclude(src, "open\", [u]", "mac open strategy exists");
mustInclude(src, "Wilderness area preview author server ready.", "startup output ready");
mustInclude(src, "Do not use ordinary live-server port 5500", "startup output warns about live-server");

// Endpoints
mustInclude(src, 'url.pathname === "/api/health"', "health endpoint");
mustInclude(src, 'url.pathname === "/api/wilderness-blueprint/apply"', "apply endpoint");
mustInclude(src, 'url.pathname === "/api/wilderness-blueprint/logs"', "logs endpoint");
mustInclude(src, 'url.pathname === "/api/wilderness-blueprint/logs/clear"', "logs clear endpoint");
mustInclude(src, 'url.pathname === "/api/wilderness-blueprint/snapshots"', "snapshots endpoint");
mustInclude(src, 'url.pathname === "/api/wilderness-blueprint/snapshot"', "snapshot endpoint");

// No shell execution
mustNotInclude(src, "shell: true", "no shell true");
mustNotInclude(src, "exec(", "no exec()");
mustNotInclude(src, "eval(", "no eval");
mustNotInclude(src, "new Function", "no Function");

// Snapshot isolation (must be tools/, not data/wilderness)
mustInclude(src, "tools\", \"wilderness_area_preview\", \"snapshots", "snapshots path under tools");
mustNotInclude(src, "data/wilderness/areas/generated", "server must not snapshot generated JS");

// Size limit
mustInclude(src, "5 * 1024 * 1024", "payload size limit");

// Area allowlist
mustInclude(src, "AREA_ALLOWLIST", "area allowlist");
mustInclude(src, "west2_old_marker_patrol_line", "area allowlist includes west2");

// Rollback function marker
mustInclude(src, "rollbackApply", "rollback function exists");
mustInclude(src, "writeFileAtomic", "atomic writer exists");
mustInclude(src, "serverLog", "server log helper exists");
mustInclude(src, "getServerLogs", "get logs helper exists");
mustInclude(src, "clearServerLogs", "clear logs helper exists");
mustInclude(src, "SERVER_LOG_MAX", "log max cap exists");

// Must not log full compact JSON (logs must sanitize compact fields)
mustInclude(src, 'if (k === "compact") return "[omitted:compact]"', "logs sanitize compact");

process.stdout.write("OK: wilderness blueprint dev_server contract check passed.\n");

