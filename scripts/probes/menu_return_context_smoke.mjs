import { makeEmptyPlan, addEffect, addNote, addSysCall, SYSCALL_TYPES } from "../../src/engine/pipeline/plan_types.js";
import { Effects } from "../../src/engine/pipeline/effects.js";
import { handleMenuAndSettingsActions } from "../../src/engine/pipeline/resolve_handlers/menu_handlers.js";

function assert(cond, message, details = null) {
  if (cond) return;
  const err = new Error(message);
  err.details = details;
  throw err;
}

function effectValueForPath(plan, path) {
  const effects = Array.isArray(plan?.effects) ? plan.effects : [];
  const last = [...effects].reverse().find((e) => e?.op === "set" && String(e?.path || "") === String(path || ""));
  return last ? last.value : undefined;
}

function hasSysCall(plan, type, mapId = null) {
  const calls = Array.isArray(plan?.sysCalls) ? plan.sysCalls : [];
  return calls.some((c) => {
    if (String(c?.type || "") !== String(type || "")) return false;
    if (mapId == null) return true;
    return String(c?.params?.mapId || "") === String(mapId || "");
  });
}

async function run() {
  // Simulate: player is in a V2 multi-scene map, not at entry scene.
  const stateInGame = {
    currentMapId: "west2_outpost_library_center",
    currentSceneId: "west2_outpost_library_floor2_reference",
    currentScene: { id: "west2_outpost_library_floor2_reference" },
    ui: {}
  };

  // 1) Open save menu should capture {mapId, sceneId} into ui.menuReturnContext.*
  const openAction = { id: "ui_open_save_menu" };
  const openPlan = makeEmptyPlan(openAction);
  await handleMenuAndSettingsActions({
    id: openAction.id,
    payload: {},
    plan: openPlan,
    gameState: stateInGame,
    addEffect,
    addSysCall,
    addNote,
    Effects,
    addSocialIntent: () => {},
    SYSCALL_TYPES,
    isMenuMapId: (id) => String(id || "").startsWith("menu_") || String(id || "") === "menu",
    NEW_GAME_ENTRY_MAP_ID: "intro_clinic_bed"
  });

  assert(hasSysCall(openPlan, "LOAD_MAP", "menu_load"), "ui_open_save_menu must LOAD_MAP -> menu_load", openPlan.sysCalls);
  assert(effectValueForPath(openPlan, "ui.menuReturnContext.mapId") === "west2_outpost_library_center", "ui_open_save_menu must save return mapId", openPlan.effects);
  assert(effectValueForPath(openPlan, "ui.menuReturnContext.sceneId") === "west2_outpost_library_floor2_reference", "ui_open_save_menu must save return sceneId", openPlan.effects);

  // 2) Back from menu_load should restore sceneId via Effects.set after LOAD_MAP return.
  const stateInMenu = {
    currentMapId: "menu_load",
    ui: {
      menuReturnMapId: "west2_outpost_library_center",
      menuReturnContext: { mapId: "west2_outpost_library_center", sceneId: "west2_outpost_library_floor2_reference" }
    }
  };
  const backAction = { id: "menu_back_main" };
  const backPlan = makeEmptyPlan(backAction);
  await handleMenuAndSettingsActions({
    id: backAction.id,
    payload: {},
    plan: backPlan,
    gameState: stateInMenu,
    addEffect,
    addSysCall,
    addNote,
    Effects,
    addSocialIntent: () => {},
    SYSCALL_TYPES,
    isMenuMapId: (id) => String(id || "").startsWith("menu_") || String(id || "") === "menu",
    NEW_GAME_ENTRY_MAP_ID: "intro_clinic_bed"
  });

  assert(hasSysCall(backPlan, "LOAD_MAP", "west2_outpost_library_center"), "menu_back_main must LOAD_MAP back to returnContext.mapId", backPlan.sysCalls);
  assert(effectValueForPath(backPlan, "currentSceneId") === "west2_outpost_library_floor2_reference", "menu_back_main must restore currentSceneId", backPlan.effects);
  assert(effectValueForPath(backPlan, "currentScene") === null, "menu_back_main should clear currentScene object when restoring sceneId", backPlan.effects);
  assert(effectValueForPath(backPlan, "ui.menuReturnContext") === null, "menu_back_main must clear ui.menuReturnContext", backPlan.effects);
  assert(effectValueForPath(backPlan, "ui.menuReturnMapId") === null, "menu_back_main must clear ui.menuReturnMapId", backPlan.effects);

  return {
    ok: true,
    openPlan: {
      sysCalls: openPlan.sysCalls,
      effects: openPlan.effects.filter((e) => String(e?.path || "").includes("menuReturn"))
    },
    backPlan: {
      sysCalls: backPlan.sysCalls,
      effects: backPlan.effects.filter((e) => ["currentSceneId", "currentScene", "ui.menuReturnMapId", "ui.menuReturnContext"].includes(String(e?.path || "")))
    }
  };
}

run()
  .then((summary) => {
    console.log("[menu_return_context_smoke] ok", summary);
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error("[menu_return_context_smoke] failed", err?.message || err, err?.details || null);
    process.exitCode = 1;
  });

