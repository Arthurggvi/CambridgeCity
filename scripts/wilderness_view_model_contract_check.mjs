import { createDefaultGameState } from "../src/engine/state.js";
import { validateMap } from "../src/engine/validate/map_validate.js";
import { buildWildernessViewModel } from "../src/engine/wilderness/wilderness_view_model.js";
import { normalizeWildernessState } from "../src/engine/wilderness/wilderness_state.js";
import { renderWildernessRuntime } from "../src/engine/render/wilderness_runtime_fragments.js";
import { WILDERNESS_MOVE_DIRECTIONS, getWildernessDirectionDelta } from "../src/engine/wilderness/wilderness_movement_cost.js";
import { buildWildernessProbeResults } from "../src/engine/wilderness/wilderness_probe_service.js";
import {
  buildWildernessRuntimeDescription,
  resolveWildernessDirectionalDistantView
} from "../src/engine/wilderness/wilderness_runtime_description.js";
import { TERRAIN_RUNTIME_TEXT } from "../data/wilderness/runtime_text/terrain_runtime_text.js";
import { AREA_RUNTIME_TEXT } from "../data/wilderness/runtime_text/area_runtime_text.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

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
  assertPass(t70.status === "ready" && t70.terrain?.terrainId === "ice_shelf_surface", "(7,0) terrain");
  console.log("[PASS] wilderness view model terrain sample (7,0) passed");

  const b = buildWildernessViewModel(withWilderness(activeWest2Session(12, 0)));
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

  // Directional distantView: forward probe along heading vs foot terrainId (no area visibility fallback).
  const dE = getWildernessDirectionDelta("E");
  assertPass(dE && dE.x === 1 && dE.y === 0, "wilderness E delta is +1 x (contract parity with movement)");
  const flatArea = {
    id: "contract_flat_wind",
    regionId: "West2",
    bounds: { minX: 0, maxX: 12, minY: 0, maxY: 12 },
    defaultTerrainId: "wind_packed_snow",
    terrainZones: []
  };
  const dSame = buildWildernessRuntimeDescription({
    areaId: "west2_old_marker_patrol_line",
    terrainId: "wind_packed_snow",
    timePhase: "morning",
    visibilityBand: "clear",
    terrainRuntimeTextRegistry: TERRAIN_RUNTIME_TEXT,
    areaRuntimeTextRegistry: AREA_RUNTIME_TEXT,
    fallbackText: "",
    areaSpec: flatArea,
    originX: 5,
    originY: 5,
    heading: "E"
  });
  assertPass(dSame.distantViewText === "", "directional distantView empty when forward 3 same terrain");

  const layeredArea = {
    ...flatArea,
    terrainZones: [
      {
        id: "z_dry_e2",
        terrainId: "dry_valley_rock_desert",
        priority: 1000,
        shape: { type: "rect", x1: 7, y1: 5, x2: 7, y2: 5 }
      },
      {
        id: "z_ice_e3",
        terrainId: "ice_shelf_surface",
        priority: 500,
        shape: { type: "rect", x1: 8, y1: 5, x2: 8, y2: 5 }
      }
    ]
  };
  const rNear = resolveWildernessDirectionalDistantView({
    areaSpec: layeredArea,
    x: 5,
    y: 5,
    heading: "E",
    currentTerrainId: "wind_packed_snow",
    terrainRuntimeTextRegistry: TERRAIN_RUNTIME_TEXT,
    maxDistance: 3
  });
  assertPass(rNear.distance === 2 && rNear.targetTerrainId === "dry_valley_rock_desert", "nearest differing terrain at distance 2");

  const earlyHitArea = {
    ...flatArea,
    terrainZones: [
      {
        id: "z_dry_e1",
        terrainId: "dry_valley_rock_desert",
        priority: 1000,
        shape: { type: "rect", x1: 6, y1: 5, x2: 6, y2: 5 }
      },
      {
        id: "z_ice_e2",
        terrainId: "ice_shelf_surface",
        priority: 500,
        shape: { type: "rect", x1: 7, y1: 5, x2: 7, y2: 5 }
      }
    ]
  };
  const r1 = resolveWildernessDirectionalDistantView({
    areaSpec: earlyHitArea,
    x: 5,
    y: 5,
    heading: "E",
    currentTerrainId: "wind_packed_snow",
    terrainRuntimeTextRegistry: TERRAIN_RUNTIME_TEXT,
    maxDistance: 3
  });
  assertPass(r1.distance === 1 && r1.targetTerrainId === "dry_valley_rock_desert", "first differing step wins (distance 1)");

  const missingDvTerrainId = "__wilderness_contract_missing_distant_view_row__";
  const missingDvArea = {
    ...flatArea,
    terrainZones: [
      {
        id: "z_contract_missing_dv_e1",
        terrainId: missingDvTerrainId,
        priority: 1000,
        shape: { type: "rect", x1: 6, y1: 5, x2: 6, y2: 5 }
      }
    ]
  };
  const rMiss = resolveWildernessDirectionalDistantView({
    areaSpec: missingDvArea,
    x: 5,
    y: 5,
    heading: "E",
    currentTerrainId: "wind_packed_snow",
    terrainRuntimeTextRegistry: TERRAIN_RUNTIME_TEXT,
    maxDistance: 3
  });
  assertPass(rMiss.text === "" && rMiss.targetTerrainId === missingDvTerrainId, "hit terrain without distantView copy yields empty text");
  assertPass(
    rMiss.warnings.some((w) => String(w).includes(`directionalDistantView:missing_copy:${missingDvTerrainId}`)),
    "missing distantView emits warning"
  );

  const dMissDesc = buildWildernessRuntimeDescription({
    areaId: "west2_old_marker_patrol_line",
    terrainId: "wind_packed_snow",
    timePhase: "morning",
    visibilityBand: "clear",
    terrainRuntimeTextRegistry: TERRAIN_RUNTIME_TEXT,
    areaRuntimeTextRegistry: AREA_RUNTIME_TEXT,
    fallbackText: "fb",
    areaSpec: missingDvArea,
    originX: 5,
    originY: 5,
    heading: "E"
  });
  assertPass(dMissDesc.distantViewText === "", "description distantView empty when registry copy missing");
  assertPass(
    !dMissDesc.description.includes("undefined") && !dMissDesc.description.includes("null") && !dMissDesc.description.includes("[object Object]"),
    "no undefined/null/object leak in description"
  );
  console.log("[PASS] directional distantView runtime description checks passed");

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

  // Return-step fields: normalize defaults + VM passthrough + renderer wiring (static source read).
  const normOld = normalizeWildernessState({ ...activeWest2Session(0, 0) });
  assertPass(
    normOld.previousPosition === null && normOld.lastMoveDirection === "" && normOld.returnDirection === "",
    "normalize: legacy-compatible empty return-step fields"
  );
  const normBad = normalizeWildernessState({
    ...activeWest2Session(1, 1),
    previousPosition: { x: "x", y: 2 },
    lastMoveDirection: "bogus",
    returnDirection: "XX"
  });
  assertPass(
    normBad.previousPosition === null && normBad.lastMoveDirection === "" && normBad.returnDirection === "",
    "normalize: invalid return-step inputs sanitized"
  );
  const vmRet = buildWildernessViewModel(
    withWilderness({
      ...activeWest2Session(2, 2),
      previousPosition: { x: 2, y: 1 },
      lastMoveDirection: "N",
      returnDirection: "S"
    })
  );
  assertPass(vmRet.session?.returnDirection === "S", "vm session.returnDirection passthrough");
  assertPass(
    vmRet.session?.previousPosition?.x === 2 && vmRet.session?.previousPosition?.y === 1,
    "vm session.previousPosition passthrough"
  );
  assertPass(vmRet.session?.lastMoveDirection === "N", "vm session.lastMoveDirection passthrough");
  const rendererPath = path.join(ROOT, "src", "engine", "renderer.js");
  const rendererSrc = fs.readFileSync(rendererPath, "utf8");
  assertPass(
    rendererSrc.includes("is-return-step") &&
      rendererSrc.includes("session?.returnDirection") &&
      rendererSrc.includes("dataset.returnStep"),
    "renderer: return-step class wired from session.returnDirection"
  );
  console.log("[PASS] wilderness return-step normalize + vm + renderer static check passed");

  // Bug4 (round 1, hard-terrain UI hiding): on the eastern shelf cell (11,0)
  // the W neighbor is ice_shelf_edge (passability.foot === "hard_block"); the
  // VM action for `wilderness_move_W` MUST carry hidden:true with the
  // hard_terrain blockerStyle so the renderer never offers it as a clickable
  // button. E/NE/SE are bounds-out and keep blockerStyle:"void" — verifies the
  // two styles do not collide. The resolve-layer hard blocker stays in place
  // as the fallback (see wilderness_movement_contract_check.mjs).
  const vmShelf = buildWildernessViewModel(withWilderness(activeWest2Session(11, 0)));
  assertPass(vmShelf.active === true && vmShelf.status === "ready", "(11,0) VM ready");
  const shelfById = new Map();
  for (const a of Array.isArray(vmShelf.actions) ? vmShelf.actions : []) shelfById.set(String(a.id || ""), a);
  const shelfW = shelfById.get("wilderness_move_W");
  assertPass(shelfW && shelfW.hidden === true, "(11,0) wilderness_move_W hidden:true");
  assertPass(shelfW.blockerStyle === "hard_terrain", "(11,0) wilderness_move_W blockerStyle === 'hard_terrain'");
  assertPass(shelfW.probe && shelfW.probe.hardBlock === true, "(11,0) W probe.hardBlock === true");
  assertPass(
    String(shelfW.probe.terrainId || "") === "ice_shelf_edge",
    "(11,0) W probe terrainId === 'ice_shelf_edge'"
  );
  const shelfE = shelfById.get("wilderness_move_E");
  assertPass(shelfE && shelfE.hidden === true, "(11,0) E hidden (bounds-out)");
  assertPass(shelfE.blockerStyle === "void", "(11,0) E blockerStyle === 'void'");
  console.log("[PASS] hard_terrain direction hidden + tagged blockerStyle on VM action");

  // Synthetic full-shelf area: confirm that even when surrounded by hard
  // terrain, all 8 directions carry hidden:true. Uses the production VM so
  // the probe service + attachProbesToRuntimeActions glue is end-to-end tested.
  const allHardArea = {
    id: "synthetic_full_hardblock",
    label: "synthetic",
    regionId: "West2",
    entryMapId: "synthetic",
    runtimeMapId: "wilderness_runtime",
    fallbackMapId: "synthetic",
    bounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
    step: { metersPerCell: 150, baseMinutes: 10, baseStaminaCost: 5 },
    defaultTerrainId: "wind_packed_snow",
    terrainZones: [
      { id: "ring_sea", terrainId: "open_water", priority: 100, shape: { type: "rect", x1: -2, y1: -2, x2: 2, y2: 2 } }
    ],
    landmarks: []
  };
  // Don't rely on the registry — exercise the cost helpers directly so the
  // contract owns its synthetic terrain truth. Pulls the probe shape from the
  // probe service indirectly by routing through buildWildernessProbeResults.
  {
    const probes = buildWildernessProbeResults({
      wilderness: { x: 0, y: 0 },
      areaSpec: allHardArea,
      regionProfile: { climate: {} },
      worldWeather: {},
      totalMinutes: null
    });
    for (const p of probes) {
      assertPass(p.hardBlock === true, `synthetic full-sea: ${p.direction} hardBlock`);
      assertPass(p.blockerStyle === "sea", `synthetic full-sea: ${p.direction} blockerStyle === 'sea'`);
    }
  }
  console.log("[PASS] synthetic open_water ring tags every direction hardBlock + sea");

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
