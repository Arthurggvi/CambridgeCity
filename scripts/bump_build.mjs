import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const versionFile = resolve(rootDir, "src", "version.js");

let src = readFileSync(versionFile, "utf8");

const versionMatch = src.match(/gameVersion\s*:\s*['\"](\d+)\.(\d+)\.(\d+)['\"]/);
if (!versionMatch) {
  throw new Error("Cannot parse gameVersion from src/version.js");
}

const major = Number(versionMatch[1]);
const minor = Number(versionMatch[2]);
const patch = Number(versionMatch[3]) + 1;
const nextVersion = `${major}.${minor}.${patch}`;

const now = new Date();
const yyyy = now.getFullYear();
const mm = String(now.getMonth() + 1).padStart(2, "0");
const dd = String(now.getDate()).padStart(2, "0");
const datePart = `${yyyy}-${mm}-${dd}`;

const buildMatch = src.match(/buildId\s*:\s*['\"](\d{4}-\d{2}-\d{2})\.(\d+)['\"]/);
let buildSeq = 1;
if (buildMatch && buildMatch[1] === datePart) {
  buildSeq = Number(buildMatch[2] || "0") + 1;
}
const nextBuildId = `${datePart}.${buildSeq}`;

src = src.replace(/gameVersion\s*:\s*['\"][^'\"]+['\"]/, `gameVersion: "${nextVersion}"`);
src = src.replace(/buildId\s*:\s*['\"][^'\"]+['\"]/, `buildId: "${nextBuildId}"`);

writeFileSync(versionFile, src, "utf8");
console.log(`[bump] version -> ${nextVersion}, buildId -> ${nextBuildId}`);
