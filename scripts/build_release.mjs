/**
 * Release build isolation mechanism.
 *
 * - Default mode (no args / "release"): builds dist/release/ (clean player runtime only),
 *   writes dist/release/release_manifest.json, then runs scripts/release_contract_check.mjs
 * - Legacy compatibility:
 *   - "build": stages a Windows-oriented tree under dist/release/CambridgeCity (legacy)
 *   - "pack": zips the legacy staged tree to dist/CambridgeCity_windows_player.zip
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DIST_DIR = path.join(ROOT, "dist");
const RELEASE_DIR = path.join(DIST_DIR, "release");

const LEGACY_STAGE_NAME = "CambridgeCity";
const LEGACY_STAGE_DIR = path.join(RELEASE_DIR, LEGACY_STAGE_NAME);
const ZIP_NAME = "CambridgeCity_windows_player.zip";
const ZIP_PATH = path.join(DIST_DIR, ZIP_NAME);

const ALLOW_FILES = ["index.html", "style.css"];
const ALLOW_DIRS = ["src", "data", "assets", "styles", "vendor", "picture", "icon", "launcher"];

const EXCLUDED_PATTERNS = Object.freeze([
  "运维/**",
  "docs/**",
  "tools/**",
  "temp/**",
  ".edge-live-audit/**",
  "node_modules/**",
  "coverage/**",
  "playwright-report/**",
  "test-results/**",
  "*.md",
  "temp_*",
  "*_probe.*",
  "*_audit.*",
  "*_contract_check.*",
  "*_report.*",
  "*_latest.json",
  "scripts/**"
]);

function rmrf(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function posixRel(fromDir, absPath) {
  return path.relative(fromDir, absPath).split(path.sep).join("/");
}

function shouldExcludeRel(relPosix) {
  const p = String(relPosix || "").split("\\").join("/").toLowerCase();
  const base = path.posix.basename(relPosix).toLowerCase();
  if (p.startsWith("运维/") || p.includes("/运维/")) return true;
  if (p.startsWith("tools/") || p.includes("/tools/")) return true;
  if (p.startsWith("temp/") || p.includes("/temp/")) return true;
  if (p.startsWith("docs/") || p.includes("/docs/")) return true;
  if (p.startsWith(".edge-live-audit/") || p.includes("/.edge-live-audit/")) return true;
  if (p.startsWith("node_modules/") || p.includes("/node_modules/")) return true;
  if (p.startsWith("coverage/") || p.includes("/coverage/")) return true;
  if (p.startsWith("playwright-report/") || p.includes("/playwright-report/")) return true;
  if (p.startsWith("test-results/") || p.includes("/test-results/")) return true;
  if (p.startsWith("scripts/") || p.includes("/scripts/")) return true;
  if (p.endsWith(".md")) return true;
  if (base.startsWith("temp_")) return true;
  if (/_probe\.[^/]+$/i.test(base)) return true;
  if (/_audit\.[^/]+$/i.test(base)) return true;
  if (/_contract_check\.[^/]+$/i.test(base)) return true;
  if (/_report\.[^/]+$/i.test(base)) return true;
  if (/_latest\.json$/i.test(base)) return true;
  if (p.startsWith("src/engine/debug/") || p.includes("/src/engine/debug/")) return true;
  if (p === "src/engine/debug_flag_registry.js") return true;
  if (p === "src/ui/debug_floating_tools.js") return true;
  if (p.startsWith("src/ui/debug_") || p.includes("/src/ui/debug_")) return true;
  if (p.startsWith("src/engine/debug_tools") || p.includes("/src/engine/debug_tools")) return true;
  if (p.startsWith("src/engine/render/debug") || p.includes("/src/engine/render/debug")) return true;
  return false;
}

function copyFile(srcAbs, destAbs) {
  mkdirp(path.dirname(destAbs));
  fs.copyFileSync(srcAbs, destAbs);
}

function copyDirFiltered(srcDirAbs, destDirAbs, relBase = "") {
  mkdirp(destDirAbs);
  for (const ent of fs.readdirSync(srcDirAbs, { withFileTypes: true })) {
    const srcEntAbs = path.join(srcDirAbs, ent.name);
    const relEntPosix = (relBase ? `${relBase}/${ent.name}` : ent.name).split("\\").join("/");
    if (shouldExcludeRel(relEntPosix)) continue;
    const destEntAbs = path.join(destDirAbs, ent.name);
    if (ent.isDirectory()) copyDirFiltered(srcEntAbs, destEntAbs, relEntPosix);
    else if (ent.isFile()) copyFile(srcEntAbs, destEntAbs);
  }
}

function injectReleaseFlagIntoIndexHtml(indexAbsPath) {
  const raw = fs.readFileSync(indexAbsPath, "utf8");
  if (raw.includes("__CAMBRIAN_RELEASE__")) return;
  const entryModuleTag = /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>/i.exec(raw);
  if (!entryModuleTag) {
    throw new Error("Cannot inject release flag: no <script type=\"module\"> entry found in index.html");
  }
  const injected = [
    raw.slice(0, entryModuleTag.index),
    "<script>globalThis.__CAMBRIAN_RELEASE__=true;</script>\n  ",
    raw.slice(entryModuleTag.index)
  ].join("");
  fs.writeFileSync(indexAbsPath, injected, "utf8");
}

function writeReleaseManifest({ copiedFiles, excludedPatterns }) {
  const manifestPath = path.join(RELEASE_DIR, "release_manifest.json");
  const payload = {
    buildTime: new Date().toISOString(),
    copiedFiles: Number(copiedFiles || 0),
    excludedPatterns: Array.isArray(excludedPatterns) ? excludedPatterns : [],
    releaseMode: true
  };
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2), "utf8");
  return manifestPath;
}

function countFilesUnder(dirAbs) {
  let count = 0;
  const stack = [dirAbs];
  while (stack.length) {
    const cur = stack.pop();
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(abs);
      else if (ent.isFile()) count += 1;
    }
  }
  return count;
}

function walkFilesUnder(dirAbs) {
  const out = [];
  const stack = [dirAbs];
  while (stack.length) {
    const cur = stack.pop();
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(abs);
      else if (ent.isFile()) out.push(abs);
    }
  }
  return out;
}

function scanForImportsOfExcludedModules() {
  const excludedRel = [
    "src/engine/debug_flag_registry.js",
    "src/ui/debug_floating_tools.js",
    "src/engine/debug/",
    "src/ui/debug_",
    "src/engine/debug_tools",
    "src/engine/render/debug"
  ];

  const files = walkFilesUnder(path.join(RELEASE_DIR, "src")).filter((abs) => {
    const ext = path.extname(abs).toLowerCase();
    return ext === ".js" || ext === ".mjs";
  });

  const hits = [];
  for (const abs of files) {
    let text = "";
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    for (const ex of excludedRel) {
      // cheap static scan: any import-like reference to excluded path tokens
      if (text.includes(ex)) {
        hits.push({ file: posixRel(RELEASE_DIR, abs), token: ex });
      }
    }
  }
  if (hits.length) {
    const preview = hits.slice(0, 40).map((h) => `- ${h.file} imports/refers "${h.token}"`).join("\n");
    throw new Error(
      `Release build excluded debug modules but runtime still references them.\n` +
      `This must be resolved by rerouting imports behind a non-release gate (requires review), not by shipping debug modules.\n` +
      `\nDetected references (${hits.length}):\n${preview}\n`
    );
  }
}

function runReleaseContractCheck() {
  const r = spawnSync("node", ["scripts/release_contract_check.mjs"], {
    cwd: ROOT,
    stdio: "inherit"
  });
  if (r.status !== 0) {
    throw new Error(`release_contract_check failed with exit ${r.status}`);
  }
}

function buildReleaseTree() {
  rmrf(RELEASE_DIR);
  mkdirp(RELEASE_DIR);

  for (const rel of ALLOW_FILES) {
    const srcAbs = path.join(ROOT, rel);
    if (!fs.existsSync(srcAbs)) continue;
    if (shouldExcludeRel(rel)) continue;
    copyFile(srcAbs, path.join(RELEASE_DIR, rel));
  }

  for (const relDir of ALLOW_DIRS) {
    const srcAbs = path.join(ROOT, relDir);
    if (!fs.existsSync(srcAbs)) continue;
    if (!fs.statSync(srcAbs).isDirectory()) continue;
    if (shouldExcludeRel(`${relDir}/`)) continue;
    copyDirFiltered(srcAbs, path.join(RELEASE_DIR, relDir), relDir);
  }

  const indexAbs = path.join(RELEASE_DIR, "index.html");
  if (fs.existsSync(indexAbs)) {
    injectReleaseFlagIntoIndexHtml(indexAbs);
  }

  // Ensure excluded debug directories do not exist in release output
  rmrf(path.join(RELEASE_DIR, "src", "engine", "debug"));

  scanForImportsOfExcludedModules();

  const copiedFiles = countFilesUnder(RELEASE_DIR);
  writeReleaseManifest({ copiedFiles, excludedPatterns: EXCLUDED_PATTERNS });
  runReleaseContractCheck();
}

function seedEmbeddedNode() {
  const destExe = path.join(LEGACY_STAGE_DIR, "launcher", "runtime", "node", "node.exe");
  if (fs.existsSync(destExe)) return;
  const srcExe = process.execPath;
  if (!fs.existsSync(srcExe)) {
    throw new Error(`Cannot seed embedded Node: missing source binary at ${srcExe}`);
  }
  mkdirp(path.dirname(destExe));
  fs.copyFileSync(srcExe, destExe);
}

function stageLegacyPlayerTree() {
  rmrf(RELEASE_DIR);
  mkdirp(LEGACY_STAGE_DIR);

  // Keep legacy behavior (root docs) for existing workflows, but still reuse release-tree copy
  // as the core runtime. This preserves previous pack/build commands without breaking.
  buildReleaseTree();

  // Move release output under the legacy stage folder (CambridgeCity/*)
  const entries = fs.readdirSync(RELEASE_DIR, { withFileTypes: true }).filter((e) => e.name !== LEGACY_STAGE_NAME);
  for (const ent of entries) {
    const srcAbs = path.join(RELEASE_DIR, ent.name);
    const destAbs = path.join(LEGACY_STAGE_DIR, ent.name);
    mkdirp(path.dirname(destAbs));
    fs.renameSync(srcAbs, destAbs);
  }

  // Also copy any .bat launchers at repo root (legacy behavior)
  for (const name of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!name.isFile() || !name.name.toLowerCase().endsWith(".bat")) continue;
    copyFile(path.join(ROOT, name.name), path.join(LEGACY_STAGE_DIR, name.name));
  }

  seedEmbeddedNode();
}

function writeZip() {
  mkdirp(path.dirname(ZIP_PATH));
  if (fs.existsSync(ZIP_PATH)) rmrf(ZIP_PATH);

  const ps = [
    "Compress-Archive",
    "-Path",
    LEGACY_STAGE_DIR,
    "-DestinationPath",
    ZIP_PATH,
    "-Force"
  ].join(" ");

  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", ps],
    { stdio: "inherit", cwd: ROOT }
  );
  if (r.status !== 0) {
    throw new Error(`Compress-Archive failed with exit ${r.status}`);
  }
  console.log(`Release zip: ${ZIP_PATH}`);
}

const mode = (process.argv[2] || "release").trim();

if (mode === "release") {
  buildReleaseTree();
  console.log(`Release build ready: ${RELEASE_DIR}`);
} else if (mode === "build") {
  stageLegacyPlayerTree();
  console.log(`Staged legacy player tree: ${LEGACY_STAGE_DIR}`);
} else if (mode === "pack") {
  stageLegacyPlayerTree();
  writeZip();
} else {
  console.error("Usage: node ./scripts/build_release.mjs [release|build|pack]");
  process.exit(1);
}
