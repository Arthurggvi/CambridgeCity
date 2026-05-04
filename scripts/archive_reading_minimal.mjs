import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadMap } from "../src/engine/loader.js";
import { createDefaultGameState, gameState, migrateOldState, replaceGameState } from "../src/engine/state.js";
import { resolve } from "../src/engine/pipeline/resolve.js";
import { commit } from "../src/engine/pipeline/commit.js";
import { validateMap } from "../src/engine/validate/map_validate.js";
import { ARCHIVE_PAGE_TOKEN_PATTERN } from "../src/engine/validate/archive_reading_contract_validate.js";
import { makeEmptySnapshot, sanitizeSnapshot } from "../src/save/save_schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const MAP_ID = "west2_outpost_library_center";
const MAP_PATH = path.join(ROOT, "data", "maps", `${MAP_ID}.json`);
const OUTPUT_JSON = path.join(ROOT, "temp", "archive_reading_minimal_latest.json");
const OUTPUT_MD = path.join(ROOT, "temp", "archive_reading_minimal_latest.md");
const SAMPLE_LEAF_SCENE_ID = "west2_outpost_library_white_coast_upper";
const SAMPLE_CATALOG_SCENE_ID = "west2_outpost_library_white_coast_catalog";
const SAMPLE_ENTRY_ACTION_ID = "go_to_white_coast_upper";
const SAMPLE_RETURN_ACTION_ID = "return_to_white_coast_catalog_from_upper";
const SAMPLE_CONTINUE_ACTION_ID = "continue_from_white_coast_upper";

function assert(condition, message, payload = null) {
  if (!condition) {
    const error = new Error(message);
    if (payload != null) {
      error.payload = payload;
    }
    throw error;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function captureConsoleErrors(callback) {
  const originalError = console.error;
  const lines = [];
  console.error = (...args) => {
    lines.push(args.map((entry) => {
      if (typeof entry === "string") return entry;
      try {
        return JSON.stringify(entry);
      } catch {
        return String(entry);
      }
    }).join(" "));
  };
  try {
    return {
      value: callback(),
      errors: lines.slice()
    };
  } finally {
    console.error = originalError;
  }
}

function setScene(state, map, sceneId) {
  const scene = Array.isArray(map?.scenes)
    ? map.scenes.find((row) => String(row?.id || "").trim() === String(sceneId || "").trim()) || null
    : null;
  assert(scene, `scene not found: ${sceneId}`);
  state.currentMapId = map.id;
  state.currentMap = map;
  state.world.currentMapId = map.id;
  state.currentSceneId = scene.id;
  state.currentScene = clone(scene);
  return scene;
}

function getProfileSnapshot(state) {
  return {
    experienceXp: Number(state?.player?.profile?.experience?.xp || 0),
    worldviewAxis: Number(state?.player?.profile?.worldview?.axis || 0)
  };
}

function getArchiveEntry(state, pageId) {
  return state?.player?.meta?.archiveReading?.byId?.[pageId] || null;
}

function getSceneInteractions(map, sceneId) {
  return Array.isArray(map?.interactions)
    ? map.interactions.filter((row) => String(row?.sceneId || "").trim() === String(sceneId || "").trim())
    : [];
}

async function runAction(state, actionId) {
  replaceGameState(state);
  const action = {
    id: actionId,
    type: "UI_ACTION",
    payload: {}
  };
  const plan = await resolve(action, gameState);
  const report = await commit(plan, gameState);
  return { plan, report, state: gameState };
}

function buildInvalidArchiveReadingSample(mapJson, mutate, fileName) {
  const next = clone(mapJson);
  mutate(next);
  const capture = captureConsoleErrors(() => validateMap(next, fileName));
  return {
    fileName,
    ok: capture.value,
    errors: capture.errors
  };
}

async function main() {
  const raw = await fs.readFile(MAP_PATH, "utf8");
  const authoringMap = JSON.parse(raw);
  const validateCapture = captureConsoleErrors(() => validateMap(authoringMap, path.basename(MAP_PATH)));
  assert(validateCapture.value === true, "expected archive reading sample map to pass validateMap", validateCapture);

  const loadedMap = await loadMap(MAP_ID);
  assert(loadedMap, "expected sample map to load through loader");

  const sampleLeafScene = loadedMap.scenes.find((row) => row.id === SAMPLE_LEAF_SCENE_ID);
  const samplePageId = sampleLeafScene?.archiveReading?.pageId;
  assert(samplePageId, "expected sample leaf scene to expose archiveReading.pageId");

  const invalidSamples = [
    buildInvalidArchiveReadingSample(authoringMap, (next) => {
      const scene = next.scenes.find((row) => row.id === SAMPLE_LEAF_SCENE_ID);
      delete scene.archiveReading.pageToken;
    }, "archive_reading_missing_page_token.json"),
    buildInvalidArchiveReadingSample(authoringMap, (next) => {
      const scene = next.scenes.find((row) => row.id === SAMPLE_LEAF_SCENE_ID);
      scene.archiveReading.isLeafPage = false;
      scene.archiveReading.grantFirstViewReward = true;
    }, "archive_reading_reward_on_non_leaf.json")
  ];

  assert(invalidSamples.every((row) => row.ok === false), "expected invalid archive reading samples to fail validateMap", invalidSamples);
  assert(invalidSamples[0].errors.some((line) => line.includes("pageToken")), "expected missing pageToken error", invalidSamples[0]);
  assert(invalidSamples[1].errors.some((line) => line.includes("仅允许正文叶子页挂首读奖励")), "expected non-leaf reward error", invalidSamples[1]);

  const state = createDefaultGameState();
  setScene(state, loadedMap, SAMPLE_CATALOG_SCENE_ID);
  const baselineTime = state.time.totalMinutes;
  const baselineProfile = getProfileSnapshot(state);

  const firstEntry = await runAction(state, SAMPLE_ENTRY_ACTION_ID);
  const afterFirstProfile = getProfileSnapshot(state);
  const firstEntryState = getArchiveEntry(state, samplePageId);
  assert(state.currentSceneId === SAMPLE_LEAF_SCENE_ID, "expected first entry to land on sample leaf scene", firstEntry);
  assert(state.time.totalMinutes === baselineTime + 30, "expected first leaf view to advance time by 30 minutes", { baselineTime, nextTime: state.time.totalMinutes, plan: firstEntry.plan });
  assert(afterFirstProfile.experienceXp === baselineProfile.experienceXp + 5, "expected first leaf view to grant experience once", { baselineProfile, afterFirstProfile });
  assert(afterFirstProfile.worldviewAxis === baselineProfile.worldviewAxis + 5, "expected first leaf view to grant worldview once", { baselineProfile, afterFirstProfile });
  assert(firstEntryState?.viewCount === 1, "expected first view to create archive truth entry", firstEntryState);
  assert(firstEntryState?.rewardGranted === true, "expected first view reward to be marked granted", firstEntryState);

  const returnResult = await runAction(state, SAMPLE_RETURN_ACTION_ID);
  assert(state.currentSceneId === SAMPLE_CATALOG_SCENE_ID, "expected return action to go back to catalog", returnResult);

  const secondEntry = await runAction(state, SAMPLE_ENTRY_ACTION_ID);
  const afterSecondProfile = getProfileSnapshot(state);
  const secondEntryState = getArchiveEntry(state, samplePageId);
  assert(state.currentSceneId === SAMPLE_LEAF_SCENE_ID, "expected second entry to land on sample leaf scene", secondEntry);
  assert(state.time.totalMinutes === baselineTime + 60, "expected repeated entry to still consume 30 minutes", { baselineTime, nextTime: state.time.totalMinutes, plan: secondEntry.plan });
  assert(afterSecondProfile.experienceXp === afterFirstProfile.experienceXp, "expected repeated entry to not duplicate experience reward", { afterFirstProfile, afterSecondProfile });
  assert(afterSecondProfile.worldviewAxis === afterFirstProfile.worldviewAxis, "expected repeated entry to not duplicate worldview reward", { afterFirstProfile, afterSecondProfile });
  assert(secondEntryState?.viewCount === 2, "expected repeated entry to increment viewCount", secondEntryState);

  const continueResult = await runAction(state, SAMPLE_CONTINUE_ACTION_ID);
  assert(state.currentSceneId === SAMPLE_CATALOG_SCENE_ID, "expected continue action to go back to catalog instead of dead-ending", continueResult);

  const snapshot = sanitizeSnapshot(makeEmptySnapshot(state));
  const restoredState = migrateOldState(clone(snapshot));
  const restoredEntry = getArchiveEntry(restoredState, samplePageId);
  assert(restoredEntry?.viewCount === 2, "expected archive reading truth to survive save/load", { snapshot, restoredEntry });
  assert(restoredEntry?.rewardGranted === true, "expected rewardGranted to survive save/load", { snapshot, restoredEntry });

  setScene(restoredState, loadedMap, SAMPLE_CATALOG_SCENE_ID);
  const restoredBeforeProfile = getProfileSnapshot(restoredState);
  const restoredEntryResult = await runAction(restoredState, SAMPLE_ENTRY_ACTION_ID);
  const restoredAfterProfile = getProfileSnapshot(restoredState);
  const restoredAfterEntry = getArchiveEntry(restoredState, samplePageId);
  assert(restoredAfterProfile.experienceXp === restoredBeforeProfile.experienceXp, "expected restored state to suppress duplicate experience reward", { restoredBeforeProfile, restoredAfterProfile });
  assert(restoredAfterProfile.worldviewAxis === restoredBeforeProfile.worldviewAxis, "expected restored state to suppress duplicate worldview reward", { restoredBeforeProfile, restoredAfterProfile });
  assert(restoredAfterEntry?.viewCount === 3, "expected restored state to continue archive viewCount", { restoredEntryResult, restoredAfterEntry });

  const leafChainEvidence = loadedMap.scenes
    .filter((scene) => scene?.archiveReading?.isLeafPage === true)
    .map((scene) => {
      const interactions = getSceneInteractions(loadedMap, scene.id);
      const targets = interactions.map((interaction) => {
        const edge = loadedMap.edges.find((row) => row.id === interaction.edgeId) || null;
        return {
          actionId: interaction.id,
          text: interaction.text,
          edgeId: interaction.edgeId,
          toSceneId: edge?.toSceneId || null,
          targetSceneExists: loadedMap.scenes.some((row) => row.id === edge?.toSceneId)
        };
      });
      return {
        sceneId: scene.id,
        actionTexts: interactions.map((interaction) => interaction.text),
        targets
      };
    });

  assert(leafChainEvidence.every((row) => row.actionTexts.length === 2), "expected every archive leaf scene to expose exactly two actions", leafChainEvidence);
  assert(leafChainEvidence.every((row) => row.actionTexts.includes("返回") && row.actionTexts.includes("继续")), "expected every archive leaf scene to expose 返回/继续", leafChainEvidence);
  assert(leafChainEvidence.every((row) => row.targets.every((target) => target.targetSceneExists === true)), "expected every archive leaf action to lead to an existing scene", leafChainEvidence);

  const legalTokenEvidence = loadedMap.scenes
    .filter((scene) => String(scene?.id || "").includes("state_law_volume_"))
    .map((scene) => ({
      sceneId: scene.id,
      pageToken: scene.archiveReading?.pageToken || "",
      valid: ARCHIVE_PAGE_TOKEN_PATTERN.test(String(scene.archiveReading?.pageToken || ""))
    }));
  assert(legalTokenEvidence.every((row) => row.valid === true), "expected every state law volume token to satisfy archive token naming contract", legalTokenEvidence);

  const evidence = {
    generatedAt: new Date().toISOString(),
    command: "node ./scripts/archive_reading_minimal.mjs",
    contractValidation: {
      currentMapPasses: true,
      invalidSamples
    },
    runtime: {
      samplePageId,
      firstEntry: {
        sceneId: state.currentSceneId,
        timeDeltaMinutes: 30,
        profileDelta: {
          experienceXp: afterFirstProfile.experienceXp - baselineProfile.experienceXp,
          worldviewAxis: afterFirstProfile.worldviewAxis - baselineProfile.worldviewAxis
        },
        entry: firstEntryState
      },
      repeatedEntry: {
        profileDeltaSinceFirst: {
          experienceXp: afterSecondProfile.experienceXp - afterFirstProfile.experienceXp,
          worldviewAxis: afterSecondProfile.worldviewAxis - afterFirstProfile.worldviewAxis
        },
        entry: secondEntryState
      },
      saveLoadContinuity: {
        snapshotArchiveEntry: restoredEntry,
        afterReloadRepeatEntry: restoredAfterEntry
      },
      pathing: leafChainEvidence,
      legalTokenEvidence
    }
  };

  await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(evidence, null, 2), "utf8");

  const md = [
    "# Archive Reading Minimal Regression",
    "",
    `Generated At: ${evidence.generatedAt}`,
    `Command: ${evidence.command}`,
    "",
    "## Contract Validation",
    "- Current library archive map: pass",
    ...invalidSamples.map((row) => `- ${row.fileName}: rejected`),
    "",
    "## Runtime Evidence",
    `- First entry reward delta: XP +${evidence.runtime.firstEntry.profileDelta.experienceXp}, worldview +${evidence.runtime.firstEntry.profileDelta.worldviewAxis}`,
    `- Repeat entry reward delta: XP ${evidence.runtime.repeatedEntry.profileDeltaSinceFirst.experienceXp}, worldview ${evidence.runtime.repeatedEntry.profileDeltaSinceFirst.worldviewAxis}`,
    `- Save/load viewCount continuity: ${evidence.runtime.saveLoadContinuity.afterReloadRepeatEntry.viewCount}`,
    `- Leaf scenes checked: ${evidence.runtime.pathing.length}`,
    `- State law tokens checked: ${evidence.runtime.legalTokenEvidence.map((row) => row.pageToken).join(", ")}`
  ].join("\n");
  await fs.writeFile(OUTPUT_MD, md, "utf8");

  console.log(`[archive-reading] wrote ${path.relative(ROOT, OUTPUT_JSON)}`);
  console.log(`[archive-reading] wrote ${path.relative(ROOT, OUTPUT_MD)}`);
  console.log(JSON.stringify({
    contractValidation: evidence.contractValidation,
    runtime: {
      firstEntry: evidence.runtime.firstEntry,
      repeatedEntry: evidence.runtime.repeatedEntry,
      saveLoadContinuity: evidence.runtime.saveLoadContinuity,
      legalTokenEvidence: evidence.runtime.legalTokenEvidence
    }
  }, null, 2));
}

main().catch((error) => {
  console.error("[archive-reading] minimal regression failed", error?.message || error);
  if (error?.payload != null) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exitCode = 1;
});