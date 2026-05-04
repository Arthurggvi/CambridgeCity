import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadMap } from "../src/engine/loader.js";
import { createDefaultGameState, gameState, replaceGameState } from "../src/engine/state.js";
import { resolve } from "../src/engine/pipeline/resolve.js";
import { commit } from "../src/engine/pipeline/commit.js";
import { validatePlan } from "../src/engine/pipeline/plan_types.js";
import { validateMap } from "../src/engine/validate/map_validate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function captureVitals(s) {
  return {
    hp: s?.player?.psycho?.hp,
    stamina: s?.player?.physio?.stamina,
    fatigue: s?.player?.psycho?.fatigue,
    satiety: s?.player?.physio?.satiety,
    temperatureC: s?.player?.physio?.temperatureC,
    hypothermia: s?.player?.psycho?.hypothermia,
    hypoStage: s?.player?.psycho?.hypoStage
  };
}

function setV2Scene(state, map, sceneId) {
  const scene = Array.isArray(map?.scenes)
    ? map.scenes.find((row) => String(row?.id || "").trim() === String(sceneId || "").trim()) || null
    : null;
  assert(!!scene, `scene not found: ${sceneId}`);
  state.currentMapId = map.id;
  state.currentMap = map;
  state.world.currentMapId = map.id;
  state.currentSceneId = scene.id;
  state.currentScene = clone(scene);
}

async function main() {
  const rescueMap = await loadMap("west2_outpost_rescue_station");
  assert(!!rescueMap, "west2_outpost_rescue_station loads");

  const wrPath = path.join(ROOT, "data", "maps", "wilderness_runtime.json");
  const wrAuthoring = JSON.parse(fs.readFileSync(wrPath, "utf8"));
  assert(validateMap(wrAuthoring, "wilderness_runtime.json") === true, "authoring wilderness_runtime.json validates");
  assert(
    validateMap({ id: "menu_main", name: "n", description: "d", actions: [] }, "menu_main.json") === true,
    "normal map validate unchanged"
  );

  const badTwo = clone(wrAuthoring);
  badTwo.actions = [
    ...badTwo.actions,
    { id: "wilderness_illegal_extra", text: "x", kind: "TRANSITION", payload: { toMapId: "y", minutes: 0 } }
  ];
  assert(validateMap(badTwo, "wilderness_runtime.json") === false, "reject tenth action on wilderness_runtime");

  const badWrongKind = clone(wrAuthoring);
  badWrongKind.actions = [{ id: "wilderness_end_return_fallback", text: "t", kind: "TRANSITION", payload: { toMapId: "x", minutes: 0 } }];
  assert(validateMap(badWrongKind, "wilderness_runtime.json") === false, "reject wrong kind on wilderness_runtime");

  // ---------- start: resolve does not mutate ----------
  const s0 = clone(createDefaultGameState());
  s0.time.totalMinutes = 5000;
  setV2Scene(s0, rescueMap, "west2_outpost_rescue_exit_gate");
  replaceGameState(s0);

  const vit0 = captureVitals(gameState);
  const startAction = {
    type: "MAP_ACTION",
    id: "wilderness_start_west2_old_marker_patrol",
    payload: { sceneId: "west2_outpost_rescue_exit_gate" },
    meta: { atMs: Date.now(), source: "contract", mapId: "west2_outpost_rescue_station" }
  };
  const startPlan = await resolve(startAction, gameState);
  validatePlan(startPlan);
  assert(JSON.stringify(captureVitals(gameState)) === JSON.stringify(vit0), "start resolve must not change player vitals");
  assert(
    Array.isArray(startPlan.wildernessPipelineIntents) && startPlan.wildernessPipelineIntents.length === 1,
    "start plan has one wilderness intent"
  );
  assert(startPlan.wildernessPipelineIntents[0].type === "WILDERNESS_START_SESSION", "start intent type");

  // ---------- start: commit ----------
  const startResult = await commit(startPlan, gameState);
  assert(startResult.ok === true, "start commit ok");
  assert(gameState.world.wilderness.active === true, "wilderness active after start");
  assert(gameState.world.wilderness.areaId === "west2_old_marker_patrol_line", "areaId after start");
  assert(String(gameState.currentMapId || "") === "wilderness_runtime", "currentMapId after start");
  assert(String(gameState.world.currentMapId || "") === "wilderness_runtime", "world.currentMapId after start");
  assert(JSON.stringify(captureVitals(gameState)) === JSON.stringify(vit0), "start commit must not change player vitals");
  const wrResults = startResult.report?.wilderness?.results;
  assert(Array.isArray(wrResults) && wrResults.some((r) => r.ok && r.type === "WILDERNESS_START_SESSION"), "report wilderness start");

  // ---------- end: resolve read-only ----------
  const vit1 = captureVitals(gameState);
  const endAction = {
    type: "MAP_ACTION",
    id: "wilderness_end_return_fallback",
    payload: {},
    meta: { atMs: Date.now(), source: "contract", mapId: "wilderness_runtime" }
  };
  const endPlan = await resolve(endAction, gameState);
  validatePlan(endPlan);
  assert(JSON.stringify(captureVitals(gameState)) === JSON.stringify(vit1), "end resolve must not change player vitals");
  assert(endPlan.wildernessPipelineIntents.length === 1, "end plan intent count");
  assert(endPlan.wildernessPipelineIntents[0].type === "WILDERNESS_END_SESSION", "end intent type");

  const endResult = await commit(endPlan, gameState);
  assert(endResult.ok === true, "end commit ok");
  assert(gameState.world.wilderness.active === false, "wilderness inactive after end");
  assert(String(gameState.currentMapId || "") === "west2_outpost_hub", "returned to fallback hub");
  assert(JSON.stringify(captureVitals(gameState)) === JSON.stringify(vit1), "end commit must not change player vitals");
  const endWr = endResult.report?.wilderness?.results;
  assert(Array.isArray(endWr) && endWr.some((r) => r.ok && r.type === "WILDERNESS_END_SESSION"), "report wilderness end");

  // inactive end rejects
  const s2 = clone(createDefaultGameState());
  const wrMap = await loadMap("wilderness_runtime");
  assert(!!wrMap, "wilderness_runtime loads");
  s2.currentMapId = "wilderness_runtime";
  s2.world.currentMapId = "wilderness_runtime";
  s2.currentMap = wrMap;
  replaceGameState(s2);
  const badEndPlan = await resolve(endAction, gameState);
  assert(!!badEndPlan.rejection, "end resolve rejects when session inactive");

  console.log("[PASS] wilderness_entry_contract_check");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
