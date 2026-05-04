import { makeEmptyPlan, addEffect, addNote, addSysCall, SYSCALL_TYPES } from "../../src/engine/pipeline/plan_types.js";
import { Effects } from "../../src/engine/pipeline/effects.js";
import { applyEffects } from "../../src/engine/pipeline/effects.js";
import { executeSysCallImpl } from "../../src/engine/pipeline/syscalls/execute_syscall.js";
import { handleMenuAndSettingsActions } from "../../src/engine/pipeline/resolve_handlers/menu_handlers.js";

function assert(cond, message, details = null) {
  if (cond) return;
  const err = new Error(message);
  err.details = details;
  throw err;
}

async function resolvePlan(actionId, gameState) {
  const action = { id: actionId, payload: {}, type: "UI_ACTION", meta: {} };
  const plan = makeEmptyPlan(action);
  await handleMenuAndSettingsActions({
    id: actionId,
    payload: {},
    plan,
    gameState,
    addEffect,
    addSysCall,
    addNote,
    Effects,
    addSocialIntent: () => {},
    SYSCALL_TYPES,
    isMenuMapId: (id) => String(id || "").startsWith("menu_") || String(id || "") === "menu",
    NEW_GAME_ENTRY_MAP_ID: "intro_clinic_bed"
  });
  return plan;
}

async function applyPlanInCommitOrder(plan, gameState) {
  // Mirror commit() order: sysCalls first, then effects.
  for (const call of Array.isArray(plan?.sysCalls) ? plan.sysCalls : []) {
    // executeSysCallImpl mutates gameState in-place.
    await executeSysCallImpl(call, gameState, [], {
      applyLoadedSnapshot: async () => {
        throw new Error("applyLoadedSnapshot should not be called in this probe");
      },
      applyCommittedEffects: () => ({ applied: [], skipped: [] })
    });
  }
  applyEffects(Array.isArray(plan?.effects) ? plan.effects : [], gameState);
}

async function run() {
  const state = {
    currentMapId: "west2_outpost_library_center",
    currentSceneId: "west2_outpost_library_floor2_reference",
    currentScene: { id: "west2_outpost_library_floor2_reference" },
    currentMap: null,
    previousMapId: null,
    time: { totalMinutes: 0 },
    meta: {},
    flags: {},
    world: {},
    player: { meta: {}, profile: {}, social: {}, records: {}, inventory: [], equipment: {}, physio: {}, psycho: {} },
    ui: { page: "map", overlay: null, modal: null, transit: null }
  };

  // Step A: ui_open_save_menu (in-game -> menu_load)
  const openPlan = await resolvePlan("ui_open_save_menu", state);
  await applyPlanInCommitOrder(openPlan, state);

  assert(String(state.currentMapId || "") === "menu_load", "after ui_open_save_menu: currentMapId must be menu_load", { currentMapId: state.currentMapId });
  assert(state.currentSceneId == null, "after ui_open_save_menu: currentSceneId should be cleared by legacy menu load", { currentSceneId: state.currentSceneId });
  assert(String(state?.ui?.menuReturnContext?.mapId || "") === "west2_outpost_library_center", "after ui_open_save_menu: ui.menuReturnContext.mapId must be captured", state.ui);
  assert(String(state?.ui?.menuReturnContext?.sceneId || "") === "west2_outpost_library_floor2_reference", "after ui_open_save_menu: ui.menuReturnContext.sceneId must be captured", state.ui);

  // Step B: menu_back_main (menu_load -> return map + restore sceneId)
  const backPlan = await resolvePlan("menu_back_main", state);
  await applyPlanInCommitOrder(backPlan, state);

  assert(String(state.currentMapId || "") === "west2_outpost_library_center", "after menu_back_main: currentMapId must return to gameplay map", { currentMapId: state.currentMapId });
  assert(String(state.currentSceneId || "") === "west2_outpost_library_floor2_reference", "after menu_back_main: currentSceneId must be restored", { currentSceneId: state.currentSceneId });
  assert(state?.ui?.menuReturnContext == null, "after menu_back_main: ui.menuReturnContext must be cleared", state.ui);
  assert(state?.ui?.menuReturnMapId == null, "after menu_back_main: ui.menuReturnMapId must be cleared", state.ui);

  return {
    ok: true,
    final: {
      currentMapId: state.currentMapId,
      currentSceneId: state.currentSceneId,
      ui: {
        menuReturnMapId: state?.ui?.menuReturnMapId ?? null,
        menuReturnContext: state?.ui?.menuReturnContext ?? null
      }
    }
  };
}

run()
  .then((summary) => {
    console.log("[menu_return_context_state_probe] ok", summary);
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error("[menu_return_context_state_probe] failed", err?.message || err, err?.details || null);
    process.exitCode = 1;
  });

