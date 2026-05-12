/**
 * Contract checks for wilderness_event_runtime VM, resolve, commit outcome roll, queue drain, tail.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getWildernessEventDefById } from "../src/engine/wilderness/events/wilderness_event_registry.js";
import {
  validateWildernessEventActionResolve,
  rollWildernessEventOutcome,
  executeWildernessEventActionCommit
} from "../src/engine/wilderness/events/wilderness_event_action_integration.js";
import { gameState } from "../src/engine/state.js";
import { applyCommittedMapState } from "../src/engine/pipeline/commit.js";
import { deriveTransitUiStateFromRuntimeTruth } from "../src/engine/transit/transit_session.js";
import {
  createDefaultWildernessEventQueue,
  normalizeWildernessEventQueue,
  WILDERNESS_EVENT_FRAME_STATUSES,
  WILDERNESS_EVENT_FRAME_TYPES,
  WILDERNESS_EVENT_FRAME_PRIORITIES
} from "../src/engine/wilderness/events/wilderness_event_queue_state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function snowFrame(frameId, status, x, y, eventId = "west2_surface_debris_glint_001") {
  return {
    frameId,
    type: WILDERNESS_EVENT_FRAME_TYPES.WILDERNESS_RANDOM_EVENT,
    status,
    priority: WILDERNESS_EVENT_FRAME_PRIORITIES.NORMAL,
    source: { poolId: "contract_pool" },
    createdAtMinutes: 100,
    seq: 1,
    payload: {
      eventId,
      areaId: "west2_old_marker_patrol_line",
      x,
      y
    }
  };
}

function baseWildQueue(extra = {}) {
  return normalizeWildernessEventQueue({
    ...createDefaultWildernessEventQueue(),
    seq: 2,
    ...extra
  });
}

const evtMap = {
  id: "wilderness_event_runtime",
  legacy: true,
  mapType: "normal",
  name: "野外事件",
  description: "",
  actions: []
};

const wildernessRuntimeMap = {
  id: "wilderness_runtime",
  legacy: true,
  mapType: "normal",
  name: "Wilderness",
  description: "",
  actions: []
};

const grantItemTestEventDef = {
  id: "grant_item_contract_event",
  title: "Grant Item Contract",
  presentation: {
    body: "Grant item contract body",
    logLine: "Grant item contract log"
  },
  actions: [
    {
      id: "take_contract_item",
      label: "Take contract item",
      timeCostMinutes: 0,
      outcomeTable: [
        {
          outcomeId: "grant_marker_clamp",
          weight: 1,
          resultText: "你捡起一枚断裂标记杆扣件。",
          logLine: "你获得一枚断裂标记杆扣件。",
          resultIntents: [
            {
              type: "grant_item",
              itemId: "broken_marker_pole_clamp",
              qty: 1,
              reason: "wilderness_event_test"
            }
          ],
          continuation: { mode: "resume" }
        }
      ]
    }
  ]
};

function getRuntimeContractEventDefById(eventId) {
  if (String(eventId || "").trim() === "grant_item_contract_event") {
    return grantItemTestEventDef;
  }
  return getWildernessEventDefById(eventId);
}

async function stubLoadMap(id) {
  const mid = String(id || "").trim();
  if (mid === "wilderness_event_runtime") return { ...evtMap };
  if (mid === "wilderness_runtime") return { ...wildernessRuntimeMap };
  return {
    id: mid,
    legacy: true,
    mapType: "normal",
    name: mid,
    description: "",
    actions: []
  };
}

function countInventoryItem(inventory, itemId) {
  const row = Array.isArray(inventory)
    ? inventory.find((entry) => entry?.itemId === itemId)
    : null;
  return Math.max(0, Math.floor(Number(row?.qty ?? 0) || 0));
}

// --- Map JSON: no full event body ---
{
  const raw = fs.readFileSync(path.join(ROOT, "data/maps/wilderness_event_runtime.json"), "utf8");
  const mapJson = JSON.parse(raw);
  assert.equal(mapJson.id, "wilderness_event_runtime");
  assert.deepEqual(mapJson.actions, []);
  const blob = JSON.stringify(mapJson);
  assert.ok(!blob.includes("被风削开的雪堆"));
}

// --- Renderer fragment: no RNG / queue mutation / actions.push ---
{
  const fragSrc = fs.readFileSync(
    path.join(ROOT, "src/engine/render/wilderness_event_runtime_fragments.js"),
    "utf8"
  );
  assert.ok(!fragSrc.includes("Math.random"));
  assert.ok(!fragSrc.includes("gameState.world.wilderness.eventQueue ="));
  assert.ok(!fragSrc.includes(".actions.push"));
  assert.ok(fragSrc.includes("finally"));
  assert.ok(fragSrc.includes("gameState.currentMap = prevMap"));
}

// --- Renderer: no sync-mutate pattern on canonical map.actions ---
{
  const rendererSrc = fs.readFileSync(path.join(ROOT, "src/engine/renderer.js"), "utf8");
  assert.ok(!rendererSrc.includes("syncWildernessEventRuntimeSyntheticActions"));
  assert.ok(!rendererSrc.includes("currentMap.actions ="));
  assert.ok(rendererSrc.includes("from \"./wilderness/events/wilderness_event_view_model.js\""));
  assert.ok(!rendererSrc.includes("buildWildernessEventRuntimeSyntheticActions\n} from \"./render/wilderness_event_runtime_fragments.js\""));
}

// --- buildWildernessEventRuntimeSyntheticActions does not mutate gameState.currentMap.actions ---
{
  const vmMod = await import("../src/engine/wilderness/events/wilderness_event_view_model.js");
  const { buildWildernessEventRuntimeSyntheticActions } = vmMod;
  const gs = {
    currentMap: { id: "wilderness_event_runtime", actions: [] },
    world: {
      wilderness: {
        active: true,
        eventQueue: baseWildQueue({
          activeFrameId: "f_syn",
          frames: [snowFrame("f_syn", WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE, 0, 0)]
        })
      }
    }
  };
  const before = JSON.stringify(gs.currentMap.actions);
  const synth = buildWildernessEventRuntimeSyntheticActions(gs);
  assert.equal(JSON.stringify(gs.currentMap.actions), before);
  assert.ok(Array.isArray(synth));
  assert.ok(synth.some((a) => String(a?.kind || "").toUpperCase() === "WILDERNESS_EVENT_ACTION"));
}

// --- VM: active snow frame ---
{
  const gs = {
    world: {
      wilderness: {
        active: true,
        eventQueue: baseWildQueue({
          activeFrameId: "f_snow",
          frames: [snowFrame("f_snow", WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE, 0, 0)]
        })
      }
    }
  };
  const vmMod = await import("../src/engine/wilderness/events/wilderness_event_view_model.js");
  const vm = vmMod.buildWildernessEventViewModel(gs);
  assert.equal(vm.ok, true);
  assert.equal(vm.eventId, "west2_surface_debris_glint_001");
  assert.ok(String(vm.title || "").includes("雪面反光"));
  assert.ok(String(vm.body || "").includes("灰色边角"));
  assert.ok(vm.actions.some((a) => a.id === "inspect_surface_glint"));
  assert.ok(vm.actions.some((a) => a.id === "ignore_surface_glint"));
}

// --- VM: no active frame fallback ---
{
  const gs = {
    world: {
      wilderness: {
        active: true,
        eventQueue: baseWildQueue({ activeFrameId: null, frames: [] })
      }
    }
  };
  const vmMod = await import("../src/engine/wilderness/events/wilderness_event_view_model.js");
  const vm = vmMod.buildWildernessEventViewModel(gs);
  assert.equal(vm.ok, false);
  assert.match(String(vm.body || ""), /事件已经结束/);
}

// --- Resolve: frame mismatch ---
{
  const queue = baseWildQueue({
    activeFrameId: "f_ok",
    frames: [snowFrame("f_ok", WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE, 0, 0)]
  });
  const gs = { world: { wilderness: { active: true, eventQueue: queue } } };
  const r = validateWildernessEventActionResolve({
    gameState: gs,
    map: evtMap,
    mapAction: {
      kind: "WILDERNESS_EVENT_ACTION",
      payload: {
        frameId: "wrong",
        eventId: "west2_surface_debris_glint_001",
        actionId: "ignore_surface_glint"
      }
    }
  });
  assert.equal(r.ok, false);
}

// --- Resolve: unknown action ---
{
  const queue = baseWildQueue({
    activeFrameId: "f_ok",
    frames: [snowFrame("f_ok", WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE, 0, 0)]
  });
  const gs = { world: { wilderness: { active: true, eventQueue: queue } } };
  const r = validateWildernessEventActionResolve({
    gameState: gs,
    map: evtMap,
    mapAction: {
      kind: "WILDERNESS_EVENT_ACTION",
      payload: {
        frameId: "f_ok",
        eventId: "west2_surface_debris_glint_001",
        actionId: "no_such_action"
      }
    }
  });
  assert.equal(r.ok, false);
}

// --- Outcome roll: surface glint table covers empty / white-green / blue ---
{
  const def = getWildernessEventDefById("west2_surface_debris_glint_001");
  const empty = rollWildernessEventOutcome(def, "inspect_surface_glint", { random: () => 0 });
  const cable = rollWildernessEventOutcome(def, "inspect_surface_glint", { random: () => 0.4 });
  const battery = rollWildernessEventOutcome(def, "inspect_surface_glint", { random: () => 0.7 });
  const logger = rollWildernessEventOutcome(def, "inspect_surface_glint", { random: () => 0.95 });
  assert.equal(empty.outcomeId, "inspect_surface_glint_empty");
  assert.equal(cable.resultIntents?.[0]?.itemId, "short_coldproof_cable_offcut");
  assert.equal(battery.resultIntents?.[0]?.itemId, "abandoned_special_lithium_battery");
  assert.equal(logger.resultIntents?.[0]?.itemId, "intact_micro_data_logger");
}

// --- Outcome: ignore fixed table path ---
{
  const def = getWildernessEventDefById("west2_surface_debris_glint_001");
  const rolled = rollWildernessEventOutcome(def, "ignore_surface_glint", { random: () => 999 });
  assert.ok(!rolled.error);
  assert.equal(rolled.outcomeId, "fixed_ignore_surface_glint");
}

// --- Commit integration grants all surface-glint reward outcomes ---
{
  const snap = {
    wilderness: structuredClone(gameState.world?.wilderness ?? {}),
    timeMin: gameState.time?.totalMinutes,
    logs: Array.isArray(gameState.logLines) ? [...gameState.logLines] : [],
    mapId: gameState.currentMapId,
    currentMap: gameState.currentMap,
    playerSnapshot: structuredClone(gameState.player ?? {})
  };

  const cases = [
    {
      frameId: "f_commit_cable",
      rng: 0.4,
      outcomeId: "inspect_surface_glint_cable_offcut",
      itemId: "short_coldproof_cable_offcut",
      logNeedle: "短截防寒电缆"
    },
    {
      frameId: "f_commit_battery",
      rng: 0.7,
      outcomeId: "inspect_surface_glint_battery",
      itemId: "abandoned_special_lithium_battery",
      logNeedle: "废弃特种锂电池"
    },
    {
      frameId: "f_commit_logger",
      rng: 0.95,
      outcomeId: "inspect_surface_glint_data_logger",
      itemId: "intact_micro_data_logger",
      logNeedle: "完整微型数据记录器"
    }
  ];

  try {
    for (const c of cases) {
      gameState.world = gameState.world || {};
      gameState.player = {
        ...(snap.playerSnapshot || {}),
        inventory: [],
        equipment: {}
      };
      gameState.world.wilderness = {
        active: true,
        runtimeMapId: "wilderness_runtime",
        areaId: "west2_old_marker_patrol_line",
        x: 2,
        y: 3,
        heading: "N",
        eventQueue: baseWildQueue({
          activeFrameId: c.frameId,
          frames: [snowFrame(c.frameId, WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE, 2, 3)]
        })
      };
      gameState.currentMapId = "wilderness_event_runtime";
      gameState.currentMap = { ...evtMap, actions: [] };
      gameState.logLines = [];

      const row = await executeWildernessEventActionCommit({
        activeState: gameState,
        intent: {
          type: "WILDERNESS_EVENT_ACTION",
          eventActionPlan: {
            resumeTailOnly: false,
            frameId: c.frameId,
            eventId: "west2_surface_debris_glint_001",
            actionId: "inspect_surface_glint",
            timeCostMinutes: 6
          }
        },
        loadMap: stubLoadMap,
        applyCommittedMapState,
        deriveTransitUiStateFromRuntimeTruth,
        rngLike: { random: () => c.rng }
      });

      assert.equal(row.ok, true);
      assert.equal(row.wildernessEventAction?.resolved, true);
      assert.equal(row.wildernessEventAction?.outcomeId, c.outcomeId);
      assert.ok(String(row.wildernessEventAction?.logLine || "").includes(c.logNeedle));
      assert.equal(gameState.world.wilderness.eventQueue.activeFrameId, null);
      assert.equal(countInventoryItem(gameState.player?.inventory, c.itemId), 1);
      const grantedRow = gameState.player.inventory.find((entry) => entry?.itemId === c.itemId);
      assert.ok(grantedRow);
      assert.deepEqual(Object.keys(grantedRow).sort(), ["itemId", "qty"]);
      assert.equal(row.wildernessEventAction?.grants?.[0]?.itemId, c.itemId);
      assert.equal(row.wildernessEventAction?.grants?.[0]?.granted, true);
    }
  } finally {
    gameState.world.wilderness = snap.wilderness;
    gameState.player = snap.playerSnapshot;
    gameState.time.totalMinutes = snap.timeMin;
    gameState.logLines = snap.logs;
    gameState.currentMapId = snap.mapId;
    gameState.currentMap = snap.currentMap;
  }
}

// --- Commit grant_item resultIntent: grants once, keeps inventory truth narrow, drains queue ---
{
  const snap = {
    wilderness: structuredClone(gameState.world?.wilderness ?? {}),
    player: structuredClone(gameState.player ?? {}),
    logs: Array.isArray(gameState.logLines) ? [...gameState.logLines] : [],
    mapId: gameState.currentMapId,
    currentMap: gameState.currentMap
  };

  try {
    gameState.world = gameState.world || {};
    gameState.player = {
      ...(gameState.player || {}),
      inventory: [],
      equipment: {}
    };
    gameState.world.wilderness = {
      active: true,
      runtimeMapId: "wilderness_runtime",
      areaId: "west2_old_marker_patrol_line",
      x: 2,
      y: 3,
      heading: "N",
      eventQueue: baseWildQueue({
        activeFrameId: "f_grant",
        frames: [
          snowFrame("f_grant", WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE, 2, 3, "grant_item_contract_event"),
          snowFrame("f_grant_next", WILDERNESS_EVENT_FRAME_STATUSES.QUEUED, 3, 3)
        ]
      })
    };
    gameState.currentMapId = "wilderness_event_runtime";
    gameState.currentMap = { ...evtMap, actions: [] };
    if (!Array.isArray(gameState.logLines)) gameState.logLines = [];

    const intent = {
      type: "WILDERNESS_EVENT_ACTION",
      eventActionPlan: {
        resumeTailOnly: false,
        frameId: "f_grant",
        eventId: "grant_item_contract_event",
        actionId: "take_contract_item",
        timeCostMinutes: 0
      }
    };

    const row = await executeWildernessEventActionCommit({
      activeState: gameState,
      intent,
      loadMap: stubLoadMap,
      applyCommittedMapState,
      deriveTransitUiStateFromRuntimeTruth,
      rngLike: { random: () => 0 },
      getEventDefById: getRuntimeContractEventDefById
    });

    assert.equal(row.ok, true);
    assert.equal(row.wildernessEventAction?.resolved, true);
    assert.equal(row.wildernessEventAction?.outcomeId, "grant_marker_clamp");
    assert.equal(countInventoryItem(gameState.player?.inventory, "broken_marker_pole_clamp"), 1);
    assert.deepEqual(gameState.player.inventory, [{ itemId: "broken_marker_pole_clamp", qty: 1 }]);
    assert.ok(!("quality" in gameState.player.inventory[0]));
    assert.ok(!("value" in gameState.player.inventory[0]));
    assert.ok(!("submission" in gameState.player.inventory[0]));
    assert.equal(row.resultIntentsApplied?.[0]?.granted, true);
    assert.equal(row.wildernessEventAction?.grants?.[0]?.granted, true);
    assert.equal(row.wildernessEventAction?.grants?.[0]?.itemId, "broken_marker_pole_clamp");
    assert.equal(row.wildernessEventAction?.resultIntentsApplied?.[0]?.reason, "wilderness_event_test");
    assert.equal(gameState.world.wilderness.eventQueue.activeFrameId, "f_grant_next");
    assert.equal(row.wildernessEventAction?.queue?.nextMapId, "wilderness_event_runtime");

    const duplicate = await executeWildernessEventActionCommit({
      activeState: gameState,
      intent,
      loadMap: stubLoadMap,
      applyCommittedMapState,
      deriveTransitUiStateFromRuntimeTruth,
      rngLike: { random: () => 0 },
      getEventDefById: getRuntimeContractEventDefById
    });

    assert.equal(duplicate.ok, false);
    assert.notEqual(duplicate.wildernessEventAction?.resolved, true);
    assert.equal(countInventoryItem(gameState.player?.inventory, "broken_marker_pole_clamp"), 1);
  } finally {
    gameState.world.wilderness = snap.wilderness;
    gameState.player = snap.player;
    gameState.logLines = snap.logs;
    gameState.currentMapId = snap.mapId;
    gameState.currentMap = snap.currentMap;
  }
}

// --- Drain activates next frame ---
{
  gameState.world = gameState.world || {};
  gameState.world.wilderness = {
    active: true,
    runtimeMapId: "wilderness_runtime",
    eventQueue: baseWildQueue({
      activeFrameId: "fa",
      frames: [
        snowFrame("fa", WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE, 0, 0),
        snowFrame("fb", WILDERNESS_EVENT_FRAME_STATUSES.QUEUED, 1, 0)
      ]
    })
  };
  gameState.currentMapId = "wilderness_event_runtime";
  gameState.currentMap = { ...evtMap, actions: [] };

  const row = await executeWildernessEventActionCommit({
    activeState: gameState,
    intent: {
      type: "WILDERNESS_EVENT_ACTION",
      eventActionPlan: {
        resumeTailOnly: false,
        frameId: "fa",
        eventId: "west2_surface_debris_glint_001",
        actionId: "ignore_surface_glint",
        timeCostMinutes: 0
      }
    },
    loadMap: stubLoadMap,
    applyCommittedMapState,
    deriveTransitUiStateFromRuntimeTruth,
    rngLike: { random: () => 0 }
  });
  assert.equal(row.ok, true);
  assert.equal(gameState.world.wilderness.eventQueue.activeFrameId, "fb");
  assert.equal(row.wildernessEventAction?.queue?.nextMapId, "wilderness_event_runtime");
}

// --- Harmful snow-hollow event: time cost + apply_player_delta commit-side only ---
{
  const def = getWildernessEventDefById("west2_hidden_snow_hollow_001");
  assert.ok(def);
  assert.ok(def.actions.some((a) => a.id === "force_climb_out"));
  assert.ok(def.actions.some((a) => a.id === "slow_extract_self"));
  assert.ok(!def.actions.some((a) => String(a.id || "").includes("ignore")));

  const snap = {
    wilderness: structuredClone(gameState.world?.wilderness ?? {}),
    timeMin: gameState.time?.totalMinutes,
    logs: Array.isArray(gameState.logLines) ? [...gameState.logLines] : [],
    mapId: gameState.currentMapId,
    currentMap: gameState.currentMap,
    player: structuredClone(gameState.player ?? {})
  };

  function setContractVitals(hp, stamina) {
    gameState.player = structuredClone(snap.player || {});
    gameState.player.psycho = {
      ...(gameState.player.psycho || {}),
      hp,
      fatigue: 80,
      hypothermia: 0,
      hypoStage: "NORMAL"
    };
    gameState.player.physio = {
      ...(gameState.player.physio || {}),
      stamina,
      satiety: 50,
      temperatureC: 37,
      intakeLoad: 0
    };
  }

  async function runHollowAction({ frameId, actionId, timeCostMinutes, hp, stamina }) {
    setContractVitals(hp, stamina);
    const beforeMin = Math.max(0, Math.floor(Number(gameState.time?.totalMinutes ?? 0)));
    gameState.world = gameState.world || {};
    gameState.world.weather = {
      ...(gameState.world.weather || {}),
      tEnv_region: 37,
      windSpeed_local: 0
    };
    gameState.world.wilderness = {
      active: true,
      runtimeMapId: "wilderness_runtime",
      areaId: "west2_old_marker_patrol_line",
      x: 4,
      y: 4,
      heading: "N",
      eventQueue: baseWildQueue({
        activeFrameId: frameId,
        frames: [snowFrame(frameId, WILDERNESS_EVENT_FRAME_STATUSES.ACTIVE, 4, 4, "west2_hidden_snow_hollow_001")]
      })
    };
    gameState.currentMapId = "wilderness_event_runtime";
    gameState.currentMap = { ...evtMap, actions: [] };

    const row = await executeWildernessEventActionCommit({
      activeState: gameState,
      intent: {
        type: "WILDERNESS_EVENT_ACTION",
        eventActionPlan: {
          resumeTailOnly: false,
          frameId,
          eventId: "west2_hidden_snow_hollow_001",
          actionId,
          timeCostMinutes
        }
      },
      loadMap: stubLoadMap,
      applyCommittedMapState,
      deriveTransitUiStateFromRuntimeTruth,
      rngLike: { random: () => 0 }
    });

    return { row, beforeMin };
  }

  try {
    let ret = await runHollowAction({
      frameId: "f_hollow_force",
      actionId: "force_climb_out",
      timeCostMinutes: 12,
      hp: 100,
      stamina: 100
    });
    assert.equal(ret.row.ok, true);
    assert.equal(ret.row.wildernessEventAction?.outcomeId, "fixed_force_climb_out");
    assert.equal(Math.max(0, Math.floor(Number(gameState.time?.totalMinutes ?? 0))), ret.beforeMin + 12);
    assert.deepEqual(ret.row.wildernessEventAction?.grants, []);
    assert.equal(gameState.player?.psycho?.hp, 94);
    assert.equal(gameState.player?.physio?.stamina, 68);
    assert.equal(ret.row.resultIntentsApplied?.[0]?.type, "apply_player_delta");
    assert.equal(ret.row.wildernessEventAction?.playerDeltas?.[0]?.hpBefore, 100);
    assert.equal(ret.row.wildernessEventAction?.playerDeltas?.[0]?.hpAfter, 94);
    assert.equal(ret.row.wildernessEventAction?.playerDeltas?.[0]?.staminaBefore, 100);
    assert.equal(ret.row.wildernessEventAction?.playerDeltas?.[0]?.staminaAfter, 68);

    ret = await runHollowAction({
      frameId: "f_hollow_slow",
      actionId: "slow_extract_self",
      timeCostMinutes: 42,
      hp: 100,
      stamina: 100
    });
    assert.equal(ret.row.ok, true);
    assert.equal(ret.row.wildernessEventAction?.outcomeId, "fixed_slow_extract_self");
    assert.equal(gameState.player?.psycho?.hp, 99);
    assert.equal(gameState.player?.physio?.stamina, 90);
    assert.equal(ret.row.wildernessEventAction?.playerDeltas?.[0]?.hpAfter, 99);
    assert.equal(ret.row.wildernessEventAction?.playerDeltas?.[0]?.staminaAfter, 90);

    ret = await runHollowAction({
      frameId: "f_hollow_clamp",
      actionId: "force_climb_out",
      timeCostMinutes: 12,
      hp: 3,
      stamina: 5
    });
    assert.equal(ret.row.ok, true);
    assert.equal(gameState.player?.psycho?.hp, 0);
    assert.equal(gameState.player?.physio?.stamina, 0);

    const duplicate = await executeWildernessEventActionCommit({
      activeState: gameState,
      intent: {
        type: "WILDERNESS_EVENT_ACTION",
        eventActionPlan: {
          resumeTailOnly: false,
          frameId: "f_hollow_clamp",
          eventId: "west2_hidden_snow_hollow_001",
          actionId: "force_climb_out",
          timeCostMinutes: 12
        }
      },
      loadMap: stubLoadMap,
      applyCommittedMapState,
      deriveTransitUiStateFromRuntimeTruth,
      rngLike: { random: () => 0 }
    });
    assert.equal(duplicate.ok, false);
    assert.equal(gameState.player?.psycho?.hp, 0);
    assert.equal(gameState.player?.physio?.stamina, 0);
  } finally {
    gameState.world.wilderness = snap.wilderness;
    gameState.time.totalMinutes = snap.timeMin;
    gameState.logLines = snap.logs;
    gameState.currentMapId = snap.mapId;
    gameState.currentMap = snap.currentMap;
    gameState.player = snap.player;
  }
}

// --- Tail continuation clears queue tail + navigates (no move intents in this API surface) ---
{
  gameState.world.wilderness.eventQueue = baseWildQueue({
    activeFrameId: null,
    frames: [],
    tailContinuation: { mode: "transition", targetMapId: "steelcross_market_07" }
  });
  gameState.currentMapId = "wilderness_event_runtime";

  const row = await executeWildernessEventActionCommit({
    activeState: gameState,
    intent: {
      type: "WILDERNESS_EVENT_ACTION",
      eventActionPlan: { resumeTailOnly: true }
    },
    loadMap: stubLoadMap,
    applyCommittedMapState,
    deriveTransitUiStateFromRuntimeTruth,
    rngLike: undefined
  });
  assert.equal(row.ok, true);
  assert.equal(gameState.world.wilderness.eventQueue.tailContinuation, null);
  assert.equal(row.wildernessEventAction?.queue?.resumedTail, true);
  assert.equal(row.wildernessEventAction?.queue?.nextMapId, "steelcross_market_07");
  assert.equal(gameState.currentMapId, "steelcross_market_07");
  assert.notEqual(row.type, "WILDERNESS_MOVE");
}

console.log("wilderness_event_runtime_contract_check: OK");
