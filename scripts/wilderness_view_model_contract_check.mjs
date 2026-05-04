import { createDefaultGameState } from "../src/engine/state.js";
import { validateMap } from "../src/engine/validate/map_validate.js";
import { buildWildernessViewModel } from "../src/engine/wilderness/wilderness_view_model.js";
import { renderWildernessRuntime } from "../src/engine/render/wilderness_runtime_fragments.js";
import { WILDERNESS_MOVE_DIRECTIONS } from "../src/engine/wilderness/wilderness_movement_cost.js";

const WILDERNESS_RUNTIME_VALIDATE_NAME = "wilderness_runtime.json";

function wrBase() {
  const moves = WILDERNESS_MOVE_DIRECTIONS.map((dir) => ({
    id: `wilderness_move_${dir}`,
    text: "移动",
    kind: "WILDERNESS_MOVE",
    wilderness: { direction: dir }
  }));
  return {
    id: "wilderness_runtime",
    name: "野外",
    mapType: "wilderness_runtime",
    description: "野外运行时页面。",
    actions: [
      ...moves,
      {
        id: "wilderness_end_return_fallback",
        text: "返回前哨",
        kind: "WILDERNESS_END_SESSION"
      }
    ]
  };
}

function assertMapValidateFails(mapJson, label) {
  if (validateMap(mapJson, WILDERNESS_RUNTIME_VALIDATE_NAME) !== false) {
    throw new Error(`${label}: expected validateMap to return false`);
  }
}

function assertPass(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNoFunctions(value, path = "root") {
  if (typeof value === "function") {
    throw new Error(`unexpected function at ${path}`);
  }
  if (value != null && typeof value === "object") {
    if (Array.isArray(value)) {
      value.forEach((v, i) => assertNoFunctions(v, `${path}[${i}]`));
    } else {
      for (const k of Object.keys(value)) {
        assertNoFunctions(value[k], `${path}.${k}`);
      }
    }
  }
}

function baseGameState() {
  return JSON.parse(JSON.stringify(createDefaultGameState()));
}

function withWilderness(w) {
  const gs = baseGameState();
  gs.world.wilderness = w;
  return gs;
}

function activeWest2Session(x, y) {
  return {
    active: true,
    regionId: "West2",
    areaId: "west2_old_marker_patrol_line",
    originMapId: "west2_outpost_exit",
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "west2_outpost_hub",
    x,
    y,
    heading: "N",
    state: "NAVIGATING",
    trailConfidence: 100,
    visibilityConfidence: 100,
    lostness: 0,
    stepsTaken: 0,
    lastSafePoint: null,
    discoveredLandmarks: [],
    flags: {},
    sessionStartedAt: 1,
    lastUpdatedAt: 1,
    schemaVersion: 1
  };
}

function main() {
  const inactive = buildWildernessViewModel(withWilderness({ active: false, schemaVersion: 1 }));
  assertPass(inactive.active === false && inactive.status === "inactive", "inactive status");
  assertPass(Array.isArray(inactive.probes) && inactive.probes.length === 0, "inactive probes empty");
  assertPass(inactive.weatherForecast === null, "inactive weatherForecast null");
  console.log("[PASS] inactive wilderness view model passed");

  const t00 = buildWildernessViewModel(withWilderness(activeWest2Session(0, 0)));
  assertPass(t00.status === "ready" && t00.terrain?.terrainId === "managed_compacted_route", "(0,0) terrain");
  console.log("[PASS] wilderness view model terrain sample (0,0) passed");

  const t21 = buildWildernessViewModel(withWilderness(activeWest2Session(2, 1)));
  assertPass(t21.status === "ready" && t21.terrain?.terrainId === "flagged_marker_line", "(2,1) terrain");
  console.log("[PASS] wilderness view model terrain sample (2,1) passed");

  const t70 = buildWildernessViewModel(withWilderness(activeWest2Session(7, 0)));
  assertPass(t70.status === "ready" && t70.terrain?.terrainId === "ice_shelf_edge", "(7,0) terrain");
  console.log("[PASS] wilderness view model terrain sample (7,0) passed");

  const b = buildWildernessViewModel(withWilderness(activeWest2Session(9, 0)));
  assertPass(b.status === "boundary" && b.warnings.includes("boundary") && (b.terrain == null || b.terrain?.terrainId == null), "boundary");
  console.log("[PASS] wilderness view model boundary sample passed");

  const badArea = buildWildernessViewModel(
    withWilderness({
      ...activeWest2Session(0, 0),
      areaId: "not_a_real_area_id_ever"
    })
  );
  assertPass(badArea.status === "invalid_area", "invalid area");
  console.log("[PASS] wilderness view model invalid area sample passed");

  const vm = buildWildernessViewModel(withWilderness(activeWest2Session(0, 0)));
  assertNoFunctions(vm);
  JSON.stringify(vm);
  const copy = JSON.parse(JSON.stringify(vm));
  assertPass(copy.terrain?.terrainId === vm.terrain?.terrainId, "roundtrip clone");
  console.log("[PASS] wilderness view model purity checks passed");

  const frag = renderWildernessRuntime(vm);
  assertPass(
    frag && (frag.__wildernessRuntimeHeadlessStub === true || typeof frag.appendChild === "function"),
    "fragment render"
  );
  assertPass(Array.isArray(vm.actions) && vm.actions.length === 9, "vm exposes nine map actions");
  assertPass(vm.actions.some((a) => a.id === "wilderness_move_E"), "vm includes east move action id");
  assertPass(Array.isArray(vm.probes) && vm.probes.length === 8, "ready vm.probes length");
  assertPass(vm.weatherForecast != null && typeof vm.weatherForecast === "object", "ready weatherForecast");
  const moveActs = vm.actions.filter((a) => String(a.id || "").startsWith("wilderness_move_"));
  assertPass(moveActs.length === 8 && moveActs.every((a) => a.probe && a.probe.direction), "move actions carry probe");
  console.log("[PASS] wilderness runtime fragment check passed");

  assertPass(validateMap(wrBase(), WILDERNESS_RUNTIME_VALIDATE_NAME) === true, "wilderness_runtime positive map validate");
  assertMapValidateFails({ ...wrBase(), actions: [] }, "wilderness_runtime actions empty");
  const base = wrBase();
  const missingDir = base.actions.filter(
    (a) => !(a.kind === "WILDERNESS_MOVE" && String(a.wilderness?.direction || "").trim() === "NW")
  );
  assertMapValidateFails({ ...base, actions: missingDir }, "wilderness_runtime missing one move direction");
  assertMapValidateFails(
    {
      ...base,
      actions: [
        ...base.actions,
        { id: "wilderness_move_extra", text: "x", kind: "WILDERNESS_MOVE", wilderness: { direction: "N" } }
      ]
    },
    "wilderness_runtime extra illegal action"
  );
  assertMapValidateFails(
    {
      ...base,
      actions: base.actions.map((a) =>
        a.id === "wilderness_move_N" ? { ...a, wilderness: { direction: "E" } } : a
      )
    },
    "wilderness_runtime move id direction mismatch"
  );
  assertMapValidateFails(
    {
      ...base,
      actions: base.actions.map((a) =>
        a.id === "wilderness_move_E" ? { ...a, effects: [{ type: "noop" }] } : a
      )
    },
    "wilderness_runtime move with effects"
  );
  assertMapValidateFails(
    {
      ...base,
      actions: base.actions.filter((a) => a.kind !== "WILDERNESS_END_SESSION")
    },
    "wilderness_runtime end action missing"
  );
  assertMapValidateFails(
    {
      ...wrBase(),
      actions: [{ id: "wrong_id", text: "返回", kind: "WILDERNESS_END_SESSION" }]
    },
    "wilderness_runtime wrong end action id only"
  );
  assertMapValidateFails(
    {
      ...wrBase(),
      actions: [{ id: "wilderness_end_return_fallback", text: "x", kind: "TRANSITION", payload: { toMapId: "x", minutes: 0 } }]
    },
    "wilderness_runtime wrong action kind"
  );
  assertMapValidateFails({ ...wrBase(), onEnterEffects: [] }, "onEnterEffects present");
  assertMapValidateFails({ ...wrBase(), effects: {} }, "top-level effects");
  assertMapValidateFails({ ...wrBase(), semantic: { type: "x" } }, "top-level semantic");
  assertMapValidateFails({ ...wrBase(), requires: { all: [] } }, "top-level requires");
  assertPass(validateMap({ id: "menu_main", name: "n", description: "d", actions: [] }, "menu_main.json") === true, "normal map unaffected");
  console.log("[PASS] map_validate wilderness_runtime contract negatives passed");
}

main();
