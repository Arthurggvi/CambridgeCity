/**
 * Player release staging & zip (Windows-oriented).
 * Copies runtime assets + launcher; seeds embedded Node from the current Node binary.
 * Usage: node ./scripts/build_release.mjs build | pack
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RELEASE_PARENT = path.join(ROOT, "dist", "release");
const STAGE_NAME = "CambridgeCity";
const STAGE_DIR = path.join(RELEASE_PARENT, STAGE_NAME);
const ZIP_NAME = "CambridgeCity_windows_player.zip";
const ZIP_PATH = path.join(ROOT, "dist", ZIP_NAME);

const COPY_FILES = ["index.html", "style.css", "README_PLAY.txt", "LICENSE.md"];
const THIRD_PARTY_SRC = path.join(ROOT, "docs", "public", "third_party_notices.md");
const THIRD_PARTY_DEST_NAME = "THIRD_PARTY_NOTICES.md";
const COPY_DIRS = ["assets", "data", "src", "picture", "launcher", "icon"];

function rmrf(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  mkdirp(dest);
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else if (ent.isFile()) copyFile(s, d);
  }
}

function seedEmbeddedNode() {
  const destExe = path.join(STAGE_DIR, "launcher", "runtime", "node", "node.exe");
  if (fs.existsSync(destExe)) return;
  const srcExe = process.execPath;
  if (!fs.existsSync(srcExe)) {
    throw new Error(`Cannot seed embedded Node: missing source binary at ${srcExe}`);
  }
  mkdirp(path.dirname(destExe));
  fs.copyFileSync(srcExe, destExe);
}

function stagePlayerTree() {
  rmrf(RELEASE_PARENT);
  mkdirp(STAGE_DIR);

  for (const rel of COPY_FILES) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) continue;
    copyFile(src, path.join(STAGE_DIR, rel));
  }

  for (const name of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!name.isFile() || !name.name.toLowerCase().endsWith(".bat")) continue;
    copyFile(path.join(ROOT, name.name), path.join(STAGE_DIR, name.name));
  }

  for (const rel of COPY_DIRS) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) continue;
    copyDir(src, path.join(STAGE_DIR, rel));
  }

  if (fs.existsSync(THIRD_PARTY_SRC)) {
    copyFile(THIRD_PARTY_SRC, path.join(STAGE_DIR, THIRD_PARTY_DEST_NAME));
  }

  seedEmbeddedNode();
}

function writeZip() {
  mkdirp(path.dirname(ZIP_PATH));
  if (fs.existsSync(ZIP_PATH)) rmrf(ZIP_PATH);

  const ps = [
    "Compress-Archive",
    "-Path",
    STAGE_DIR,
    "-DestinationPath",
    ZIP_PATH,
    "-Force",
  ].join(" ");

  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", ps],
    { stdio: "inherit", cwd: ROOT },
  );
  if (r.status !== 0) {
    throw new Error(`Compress-Archive failed with exit ${r.status}`);
  }
  console.log(`Release zip: ${ZIP_PATH}`);
}

const mode = process.argv[2] || "pack";

if (mode === "build") {
  stagePlayerTree();
  console.log(`Staged player tree: ${STAGE_DIR}`);
} else if (mode === "pack") {
  stagePlayerTree();
  writeZip();
} else {
  console.error("Usage: node ./scripts/build_release.mjs build|pack");
  process.exit(1);
}
