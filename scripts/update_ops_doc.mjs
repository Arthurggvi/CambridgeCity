import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

const versionFile = resolve(rootDir, "src", "version.js");
const opsDocFile = resolve(rootDir, "运维", "运维文档_v0.2.md");

if (!existsSync(versionFile)) {
  throw new Error(`Version source not found: ${versionFile}`);
}
if (!existsSync(opsDocFile)) {
  throw new Error(`Ops doc not found: ${opsDocFile}`);
}

const versionSource = readFileSync(versionFile, "utf8");

function pick(pattern, label) {
  const match = versionSource.match(pattern);
  if (!match || !match[1]) {
    throw new Error(`Failed to parse ${label} from src/version.js`);
  }
  return String(match[1]).trim();
}

const gameVersion = pick(/gameVersion\s*:\s*['\"]([^'\"]+)['\"]/, "gameVersion");
const saveSchemaVersion = pick(/saveSchemaVersion\s*:\s*(\d+)/, "saveSchemaVersion");
const buildId = pick(/buildId\s*:\s*['\"]([^'\"]+)['\"]/, "buildId");

const block = [
  "<!-- BUILD_INFO_START -->",
  `Game Version: v${gameVersion}`,
  `Save Schema: v${saveSchemaVersion}`,
  `Build ID: ${buildId}`,
  "<!-- BUILD_INFO_END -->"
].join("\n");

let doc = readFileSync(opsDocFile, "utf8");
const start = "<!-- BUILD_INFO_START -->";
const end = "<!-- BUILD_INFO_END -->";

if (doc.includes(start) && doc.includes(end)) {
  doc = doc.replace(/<!-- BUILD_INFO_START -->[\s\S]*?<!-- BUILD_INFO_END -->/, block);
} else {
  const titleMatch = doc.match(/^# .*$/m);
  if (titleMatch) {
    const insertPos = titleMatch.index + titleMatch[0].length;
    doc = `${doc.slice(0, insertPos)}\n\n${block}\n${doc.slice(insertPos)}`;
  } else {
    doc = `${block}\n\n${doc}`;
  }
}

writeFileSync(opsDocFile, doc, "utf8");
console.log(`[opsdoc] synced build info -> ${opsDocFile}`);
