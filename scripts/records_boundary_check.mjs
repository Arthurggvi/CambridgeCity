import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDefaultPlayerState } from "../src/engine/player.js";
import { createEmptyRecordState, normalizeRecordState } from "../src/engine/records/record_state.js";
import { getRecordViewById, getUnlockedRecordViewList, tryUnlockRecord } from "../src/engine/records/record_service.js";
import { makeEmptySnapshot, sanitizeSnapshot } from "../src/save/save_schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const FORBIDDEN_TRUTH_KEYS = ["body", "scienceBody", "sources", "unlockToast", "definition", "staticRecord", "recordDefinition", "selectedRecordId", "recordSelectedId"];
const ALLOWED_RECORD_ENTRY_KEYS = ["recordId", "rewardGranted", "snapshotVersion", "triggerContext", "unlockedAt"];
const ALLOWED_INDEX_IMPORTERS = new Set([
  normalizePath(path.join(ROOT, "src", "engine", "records", "record_registry.js"))
]);

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

async function walk(dirPath) {
  const out = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(fullPath));
      continue;
    }
    out.push(fullPath);
  }
  return out;
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function containsAny(text, fragments) {
  return fragments.find((fragment) => text.includes(fragment)) || null;
}

function sanitizeRecordsThroughSave(recordsState) {
  const snapshot = sanitizeSnapshot(makeEmptySnapshot({
    currentMapId: "menu_main",
    time: { totalMinutes: 0 },
    player: {
      ...createDefaultPlayerState(),
      records: recordsState
    },
    world: {
      currentMapId: "menu_main",
      flags: {}
    },
    flags: {},
    logLines: [],
    meta: {
      startedAt: new Date(0).toISOString(),
      saveSlotId: null,
      lastAutoSaveDay: 0,
      lastAutoSaveMinute: 0
    }
  }));
  return snapshot.player.records;
}

async function checkStaticAssetBoundary() {
  const recordsRoot = path.join(ROOT, "data", "records");
  const files = (await walk(recordsRoot))
    .filter((filePath) => filePath.endsWith(".js"))
    .filter((filePath) => normalizePath(filePath) !== normalizePath(path.join(recordsRoot, "index.js")));

  const violations = [];
  const forbiddenPatterns = [
    /\bfunction\b/,
    /=>/,
    /\bawait\b/,
    /\bdispatch\s*\(/,
    /\btryUnlockRecord\b/,
    /\bonUnlock\b/,
    /\bgrantReward\b/,
    /\bopenPanel\b/,
    /\baddEventListener\b/,
    /\bconsole\./,
    /^import\s+/m
  ];

  for (const filePath of files) {
    const text = await readText(filePath);
    if (!/export\s+default\s+/m.test(text)) {
      violations.push(`${normalizePath(path.relative(ROOT, filePath))}: missing default export`);
    }
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(text)) {
        violations.push(`${normalizePath(path.relative(ROOT, filePath))}: forbidden pattern ${pattern}`);
      }
    }
  }

  assert(violations.length === 0, `static asset boundary violations:\n${violations.join("\n")}`);
  return { assetFileCount: files.length };
}

async function checkImportBoundary() {
  const jsFiles = (await walk(ROOT)).filter((filePath) => filePath.endsWith(".js") || filePath.endsWith(".mjs"));
  const violations = [];

  for (const filePath of jsFiles) {
    const relPath = normalizePath(path.relative(ROOT, filePath));
    const text = await readText(filePath);
    const importMatches = text.matchAll(/import\s+[^;]*?from\s+["']([^"']+)["']/g);
    for (const match of importMatches) {
      const specifier = String(match[1] || "");
      if (!specifier.includes("data/records")) continue;
      const normalizedFilePath = normalizePath(filePath);
      const isIndexFile = normalizedFilePath === normalizePath(path.join(ROOT, "data", "records", "index.js"));
      const importsSingleAsset = /data\/records\/.+\.js$/.test(specifier) && !specifier.endsWith("/index.js") && !specifier.endsWith("data/records/index.js");
      const importsIndex = /data\/records\/index\.js$/.test(specifier);

      if (isIndexFile) continue;
      if (importsSingleAsset) {
        violations.push(`${relPath}: direct single-asset import -> ${specifier}`);
        continue;
      }
      if (importsIndex && !ALLOWED_INDEX_IMPORTERS.has(normalizePath(filePath))) {
        violations.push(`${relPath}: bypasses record_registry with ${specifier}`);
      }
    }
  }

  assert(violations.length === 0, `import boundary violations:\n${violations.join("\n")}`);
  return { allowedIndexImporterCount: ALLOWED_INDEX_IMPORTERS.size };
}

function checkTruthBoundary() {
  const pollutedTruth = {
    byId: {
      west2_reflective_post_001: {
        recordId: "west2_reflective_post_001",
        unlockedAt: "legacy-entry",
        rewardGranted: true,
        triggerContext: {
          mapId: "winddyke_street_clinic_segment",
          actionId: "check_reflector_number",
          source: "map_action",
          ignored: "drop-me"
        },
        snapshotVersion: 1,
        body: "forbidden",
        scienceBody: "forbidden",
        sources: [{ label: "forbidden" }],
        unlockToast: "forbidden",
        uiMeta: { forbidden: true },
        selectedRecordId: "forbidden"
      }
    },
    order: ["west2_reflective_post_001"]
  };

  const normalized = normalizeRecordState(pollutedTruth);
  const persisted = sanitizeRecordsThroughSave(pollutedTruth);
  const normalizedEntry = normalized.byId.west2_reflective_post_001;
  const persistedEntry = persisted.byId.west2_reflective_post_001;
  assert(normalizedEntry, "normalized records entry missing");
  assert(persistedEntry, "persisted records entry missing");

  const normalizedKeys = Object.keys(normalizedEntry).sort();
  const persistedKeys = Object.keys(persistedEntry).sort();
  assert(JSON.stringify(normalizedKeys) === JSON.stringify(ALLOWED_RECORD_ENTRY_KEYS), `normalized truth keys drifted: ${normalizedKeys.join(",")}`);
  assert(JSON.stringify(persistedKeys) === JSON.stringify(ALLOWED_RECORD_ENTRY_KEYS), `persisted truth keys drifted: ${persistedKeys.join(",")}`);

  const persistedText = JSON.stringify(persisted);
  const forbiddenHit = containsAny(persistedText, FORBIDDEN_TRUTH_KEYS);
  assert(!forbiddenHit, `persisted truth leaked forbidden field: ${forbiddenHit}`);

  return {
    normalizedEntryKeys: normalizedKeys,
    persistedEntryKeys: persistedKeys
  };
}

async function checkRewardBoundary() {
  const firstUnlock = tryUnlockRecord({
    recordId: "west2_reflective_post_001",
    recordsState: createEmptyRecordState(),
    triggerContext: { source: "boundary_check" }
  });
  assert(firstUnlock.reason === "first_unlock", `unexpected unlock result: ${firstUnlock.reason}`);
  assert(firstUnlock.debug?.createdEntry?.rewardGranted === false, "first_unlock entry must start with rewardGranted=false");

  const jsFiles = (await walk(path.join(ROOT, "src"))).filter((filePath) => filePath.endsWith(".js"));
  const setRewardUsages = [];
  for (const filePath of jsFiles) {
    const text = await readText(filePath);
    if (!text.includes("setRecordRewardGranted")) continue;
    const relPath = normalizePath(path.relative(ROOT, filePath));
    if (relPath === "src/engine/records/record_state.js" || relPath === "src/engine/pipeline/commit.js") continue;
    setRewardUsages.push(relPath);
  }
  assert(setRewardUsages.length === 0, `setRecordRewardGranted used outside commit boundary: ${setRewardUsages.join(", ")}`);

  return {
    firstUnlockRewardGranted: firstUnlock.debug.createdEntry.rewardGranted,
    setRewardUsagesOutsideCommit: setRewardUsages.length
  };
}

async function checkUiReadBoundary() {
  const firstUnlock = tryUnlockRecord({
    recordId: "west2_reflective_post_001",
    recordsState: createEmptyRecordState(),
    triggerContext: { source: "boundary_check" }
  });
  const list = getUnlockedRecordViewList({ recordsState: firstUnlock.nextRecordsState });
  const detail = getRecordViewById({ recordId: "west2_reflective_post_001", recordsState: firstUnlock.nextRecordsState });

  assert(Array.isArray(list) && list.length === 1, "record list view did not resolve expected entry");
  assert(detail?.ok === true && detail.view, "record detail view did not resolve expected entry");
  assert(!Object.prototype.hasOwnProperty.call(list[0], "unlockToast"), "list view leaked unlockToast");
  assert(!Object.prototype.hasOwnProperty.call(detail.view, "unlockToast"), "detail view leaked unlockToast");

  const persisted = sanitizeRecordsThroughSave(firstUnlock.nextRecordsState);
  const persistedText = JSON.stringify({ records: persisted });
  const forbiddenHit = containsAny(persistedText, ["selectedRecordId", "recordSelectedId"]);
  assert(!forbiddenHit, `selected UI state leaked into persisted records: ${forbiddenHit}`);

  return {
    listHasUnlockToast: Object.prototype.hasOwnProperty.call(list[0], "unlockToast"),
    detailHasUnlockToast: Object.prototype.hasOwnProperty.call(detail.view, "unlockToast")
  };
}

async function checkSaveLoadBoundary() {
  const firstUnlock = tryUnlockRecord({
    recordId: "west2_reflective_post_001",
    recordsState: createEmptyRecordState(),
    triggerContext: { source: "boundary_check" }
  });
  const snapshot = sanitizeSnapshot(makeEmptySnapshot({
    currentMapId: "menu_main",
    time: { totalMinutes: 0 },
    player: {
      ...createDefaultPlayerState(),
      records: firstUnlock.nextRecordsState
    },
    ui: {
      selectedRecordId: "forbidden",
      recordSelectedId: "forbidden"
    },
    world: {
      currentMapId: "menu_main",
      flags: {}
    },
    flags: {},
    logLines: []
  }));

  const snapshotText = JSON.stringify(snapshot);
  const forbiddenStaticHit = containsAny(snapshotText, ["body", "scienceBody", "sources", "unlockToast"]);
  const forbiddenUiHit = containsAny(snapshotText, ["selectedRecordId", "recordSelectedId"]);
  assert(!forbiddenStaticHit, `save snapshot leaked forbidden static field: ${forbiddenStaticHit}`);
  assert(!forbiddenUiHit, `save snapshot leaked forbidden UI field: ${forbiddenUiHit}`);

  const saveFiles = [
    path.join(ROOT, "src", "save", "save_schema.js"),
    path.join(ROOT, "src", "save", "save_manager.js"),
    path.join(ROOT, "src", "engine", "pipeline", "syscalls", "execute_syscall.js")
  ];
  const tryUnlockUsages = [];
  for (const filePath of saveFiles) {
    const text = await readText(filePath);
    if (text.includes("tryUnlockRecord")) {
      tryUnlockUsages.push(normalizePath(path.relative(ROOT, filePath)));
    }
  }
  assert(tryUnlockUsages.length === 0, `save/load path must not replay tryUnlockRecord: ${tryUnlockUsages.join(", ")}`);

  return {
    snapshotHasForbiddenStatic: false,
    snapshotHasForbiddenUiState: false,
    tryUnlockUsagesInSaveLoad: tryUnlockUsages.length
  };
}

async function main() {
  const results = {
    staticAssetBoundary: await checkStaticAssetBoundary(),
    importBoundary: await checkImportBoundary(),
    runtimeTruthBoundary: checkTruthBoundary(),
    rewardBoundary: await checkRewardBoundary(),
    uiReadBoundary: await checkUiReadBoundary(),
    saveLoadBoundary: await checkSaveLoadBoundary()
  };

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
  process.exitCode = 1;
});