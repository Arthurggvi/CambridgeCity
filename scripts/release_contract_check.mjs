/**
 * Release static contract check (denylist-based).
 * Scans dist/release/ and fails fast on forbidden paths / content leaks.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "dist", "release");

const EXCLUDED_PATH_MARKERS = [
  "运维/",
  "tools/",
  "temp/",
  ".edge-live-audit/",
  "node_modules/",
  "coverage/",
  "playwright-report/",
  "test-results/",
  "docs/ui_",
  "src/engine/debug/",
  "src/ui/debug_",
  "tools/wilderness_area_preview",
  "wilderness_area_preview",
  "blueprint",
  "preview_export"
];

// NOTE: keep this list minimal; most enforcement is done by path regex checks below.
const EXCLUDED_NAME_FRAGMENTS = ["playwright", "temp_"];

const EXCLUDED_EXTENSIONS = [".md"];

const EXCLUDED_GLOBS_LIKE = [
  "*_probe.*",
  "*_audit.*",
  "*_contract_check.*",
  "*_report.*",
  "temp_*",
  "*_latest.json"
];

const TEXT_LEAK_NEEDLES = [
  "Debug Tools",
  "debug tools",
  "打开调试工具",
  "debug-floating-tools",
  "host-debug-marker"
];

const ALLOWED_TEXT_LEAKS = [
  {
    file: "src/main.js",
    needle: "host-debug-marker",
    reason: "dev-only host marker is hard-gated by isReleaseBuild() and is non-reachable in release runtime"
  }
];

const PATH_DENY_REGEXES = [
  { re: /debug/i, label: "/debug/i" },
  { re: /probe/i, label: "/probe/i" },
  { re: /audit/i, label: "/audit/i" },
  { re: /contract_check/i, label: "/contract_check/i" },
  { re: /temp_/i, label: "/temp_/i" }
];

const ALLOWED_PATH_MATCHES = [
  {
    file: "src/engine/release_flag.js",
    label: "/debug|probe|audit|contract_check|temp_/",
    reason: "release gate source (required runtime dependency)"
  },
  {
    file: "src/engine/wilderness/wilderness_probe_service.js",
    label: "/probe/i",
    reason: "gameplay feature naming: wilderness move probe (not Debug Tools)"
  },
  {
    file: "src/engine/wilderness/wilderness_tool_readout_vm.js",
    label: "/probe/i",
    reason: "gameplay UI readout naming: probeConfidenceMult (not Debug Tools)"
  },
  {
    file: "src/main.js",
    label: "/debug/i",
    reason: "boot/dev marker logic exists but is hard-gated by isReleaseBuild()"
  }
];

function getAllowedPathReason(relPosix, label) {
  const hit = ALLOWED_PATH_MATCHES.find((row) => row.file === relPosix && row.label === label);
  return hit ? hit.reason : null;
}

const TEXT_FILE_EXTS = new Set([
  ".html", ".css", ".js", ".mjs", ".json", ".txt", ".svg", ".xml", ".csv"
]);

function toPosixRel(absPath) {
  const rel = path.relative(RELEASE_DIR, absPath);
  return rel.split(path.sep).join("/");
}

function isProbablyTextFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  return TEXT_FILE_EXTS.has(ext) || ext === "";
}

function shouldExcludeByPath(relPosix) {
  const p = relPosix.toLowerCase();

  for (const marker of EXCLUDED_PATH_MARKERS) {
    if (p.includes(String(marker).toLowerCase())) return { ok: false, reason: `path_marker:${marker}` };
  }

  for (const ext of EXCLUDED_EXTENSIONS) {
    if (p.endsWith(ext)) return { ok: false, reason: `extension:${ext}` };
  }

  const base = path.posix.basename(relPosix).toLowerCase();
  for (const frag of EXCLUDED_NAME_FRAGMENTS) {
    if (base.includes(String(frag).toLowerCase())) return { ok: false, reason: `name_fragment:${frag}` };
  }

  if (/_probe\.[^/]+$/i.test(base)) return { ok: false, reason: "glob_like:*_probe.*" };
  if (/_audit\.[^/]+$/i.test(base)) return { ok: false, reason: "glob_like:*_audit.*" };
  if (/_contract_check\.[^/]+$/i.test(base)) return { ok: false, reason: "glob_like:*_contract_check.*" };
  if (/_report\.[^/]+$/i.test(base)) return { ok: false, reason: "glob_like:*_report.*" };
  if (/^temp_/i.test(base)) return { ok: false, reason: "glob_like:temp_*" };
  if (/_latest\.json$/i.test(base)) return { ok: false, reason: "glob_like:*_latest.json" };

  return { ok: true };
}

function walkFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const abs = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(abs);
      else if (ent.isFile()) out.push(abs);
    }
  }
  return out;
}

function findTextLeaks(absPath) {
  if (!isProbablyTextFile(absPath)) return [];
  let raw = "";
  try {
    raw = fs.readFileSync(absPath, "utf8");
  } catch {
    return [];
  }
  const leaks = [];
  for (const needle of TEXT_LEAK_NEEDLES) {
    const idx = raw.indexOf(needle);
    if (idx < 0) continue;
    const start = Math.max(0, idx - 80);
    const end = Math.min(raw.length, idx + needle.length + 80);
    const snippet = raw.slice(start, end).replace(/\s+/g, " ").trim();
    leaks.push({ needle, snippet });
  }
  return leaks;
}

function readIndexHtmlOrThrow() {
  const p = path.join(RELEASE_DIR, "index.html");
  if (!fs.existsSync(p)) throw new Error("Missing dist/release/index.html");
  return fs.readFileSync(p, "utf8");
}

function resolveEntryModuleInfo(indexHtml) {
  // Find earliest module script tag; entry can be src=... or inline module.
  const re = /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>/gi;
  const m = re.exec(indexHtml);
  if (!m) return null;
  const tagStart = m.index;
  const tagText = m[0];
  const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tagText);
  return { tagStart, tagText, src: srcMatch ? srcMatch[1] : null };
}

function checkReleaseFlagInjectedBeforeEntry(indexHtml) {
  const flagIdx = indexHtml.indexOf("__CAMBRIAN_RELEASE__");
  if (flagIdx < 0) {
    return { ok: false, injected: false, beforeEntry: false, reason: "missing___CAMBRIAN_RELEASE__" };
  }
  const entry = resolveEntryModuleInfo(indexHtml);
  if (!entry) {
    return { ok: false, injected: true, beforeEntry: false, reason: "missing_module_entry_script" };
  }
  const beforeEntry = flagIdx < entry.tagStart;
  return {
    ok: beforeEntry,
    injected: true,
    beforeEntry,
    entryModuleSrc: entry.src,
    entryModuleTagStart: entry.tagStart,
    flagIndex: flagIdx
  };
}

function main() {
  if (!fs.existsSync(RELEASE_DIR)) {
    console.error(`[release_contract_check] Missing ${RELEASE_DIR}`);
    process.exit(1);
  }

  // Hard path existence checks (must fail even if empty directory)
  const hardFailPaths = [
    { rel: path.join("src", "engine", "debug"), reason: "explicit:dir_exists:src/engine/debug/" },
    { rel: path.join("tools"), reason: "explicit:dir_exists:tools/" },
    { rel: path.join("运维"), reason: "explicit:dir_exists:运维/" },
    { rel: path.join("temp"), reason: "explicit:dir_exists:temp/" }
  ];
  for (const row of hardFailPaths) {
    const abs = path.join(RELEASE_DIR, row.rel);
    if (fs.existsSync(abs)) {
      console.error("[release_contract_check] FAILED");
      console.error(`- reason: ${row.reason}`);
      console.error(`- path: ${row.rel.split(path.sep).join("/")}`);
      process.exit(1);
    }
  }

  let releaseFlagInjectedBeforeEntry = false;
  let releaseEntryModuleSrc = null;
  const allowlistedFiles = [];

  try {
    const indexHtml = readIndexHtmlOrThrow();
    const check = checkReleaseFlagInjectedBeforeEntry(indexHtml);
    releaseFlagInjectedBeforeEntry = check.beforeEntry === true;
    releaseEntryModuleSrc = check.entryModuleSrc || null;
    if (!check.ok) {
      console.error("[release_contract_check] FAILED");
      console.error(`- releaseFlagInjectedBeforeEntry: ${String(releaseFlagInjectedBeforeEntry)}`);
      console.error(`- entryModuleSrc: ${String(releaseEntryModuleSrc || "")}`);
      console.error(`- reason: ${check.reason || "release_flag_not_before_entry"}`);
      process.exit(1);
    }
  } catch (e) {
    console.error("[release_contract_check] FAILED");
    console.error(`- releaseFlagInjectedBeforeEntry: false`);
    console.error(`- reason: ${e?.message || String(e)}`);
    process.exit(1);
  }

  const files = walkFiles(RELEASE_DIR);
  const violations = [];
  const textLeaks = [];
  const rejectedByRegex = [];

  for (const abs of files) {
    const rel = toPosixRel(abs);

    // explicit must-fail paths
    if (rel.startsWith("src/engine/debug/")) {
      violations.push({ file: rel, reason: "explicit:src/engine/debug/**" });
      continue;
    }
    if (rel === "src/ui/debug_floating_tools.js") {
      violations.push({ file: rel, reason: "explicit:src/ui/debug_floating_tools.js" });
      continue;
    }

    const excl = shouldExcludeByPath(rel);
    if (!excl.ok) {
      violations.push({ file: rel, reason: excl.reason });
      continue;
    }

    // regex-based denylist with allowlist override
    for (const rule of PATH_DENY_REGEXES) {
      if (!rule.re.test(rel)) continue;
      const reason = getAllowedPathReason(rel, rule.label);
      if (reason) {
        allowlistedFiles.push({ file: rel, rule: rule.label, reason });
        break;
      }
      rejectedByRegex.push({ file: rel, rule: rule.label });
      break;
    }
    if (rejectedByRegex.length && rejectedByRegex[rejectedByRegex.length - 1]?.file === rel) {
      continue;
    }

    const leaks = findTextLeaks(abs);
    for (const leak of leaks) {
      const allowed = ALLOWED_TEXT_LEAKS.some((row) => row.file === rel && row.needle === leak.needle);
      if (allowed) continue;
      textLeaks.push({ file: rel, needle: leak.needle, snippet: leak.snippet });
    }
  }

  const scannedFiles = files.length;
  const rejectedFiles = violations.length + rejectedByRegex.length + textLeaks.length;

  if (violations.length || rejectedByRegex.length || textLeaks.length) {
    console.error("[release_contract_check] FAILED");
    console.error(`- scannedFiles: ${scannedFiles}`);
    console.error(`- rejectedFiles: ${rejectedFiles}`);
    console.error(`- allowlistedFiles: ${allowlistedFiles.length}`);
    console.error(`- releaseFlagInjectedBeforeEntry: ${String(releaseFlagInjectedBeforeEntry)}`);
    if (releaseEntryModuleSrc) console.error(`- entryModuleSrc: ${releaseEntryModuleSrc}`);
    if (violations.length) {
      console.error(`- forbidden files: ${violations.length}`);
      for (const v of violations.slice(0, 60)) {
        console.error(`  - ${v.file} (${v.reason})`);
      }
      if (violations.length > 60) console.error(`  ... +${violations.length - 60} more`);
    }
    if (rejectedByRegex.length) {
      console.error(`- rejected by path regex: ${rejectedByRegex.length}`);
      for (const row of rejectedByRegex.slice(0, 60)) {
        console.error(`  - ${row.file} (${row.rule})`);
      }
      if (rejectedByRegex.length > 60) console.error(`  ... +${rejectedByRegex.length - 60} more`);
    }
    if (textLeaks.length) {
      console.error(`- debug text leaks: ${textLeaks.length}`);
      for (const t of textLeaks.slice(0, 40)) {
        console.error(`  - ${t.file} [${t.needle}] ${t.snippet}`);
      }
      if (textLeaks.length > 40) console.error(`  ... +${textLeaks.length - 40} more`);
    }
    if (allowlistedFiles.length) {
      console.error("- allowlistedFiles with reason:");
      for (const row of allowlistedFiles) {
        console.error(`  - ${row.file} (${row.rule}) ${row.reason}`);
      }
    }
    if (ALLOWED_TEXT_LEAKS.length) {
      console.error("- allowed text leaks:");
      for (const row of ALLOWED_TEXT_LEAKS) {
        console.error(`  - ${row.file} [${row.needle}] (${row.reason})`);
      }
    }
    console.error("- excluded patterns summary:");
    console.error(`  - markers: ${EXCLUDED_PATH_MARKERS.join(", ")}`);
    console.error(`  - name fragments: ${EXCLUDED_NAME_FRAGMENTS.join(", ")}`);
    console.error(`  - extensions: ${EXCLUDED_EXTENSIONS.join(", ")}`);
    console.error(`  - glob-like: ${EXCLUDED_GLOBS_LIKE.join(", ")}`);
    process.exit(1);
  }

  console.log("[release_contract_check] OK");
  console.log(`- scannedFiles: ${scannedFiles}`);
  console.log(`- rejectedFiles: 0`);
  console.log(`- allowlistedFiles: ${allowlistedFiles.length}`);
  console.log(`- releaseFlagInjectedBeforeEntry: ${String(releaseFlagInjectedBeforeEntry)}`);
  if (releaseEntryModuleSrc) console.log(`- entryModuleSrc: ${releaseEntryModuleSrc}`);
}

main();

