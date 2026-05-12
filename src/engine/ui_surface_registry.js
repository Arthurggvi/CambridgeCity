import { TRANSIENT_RUNTIME_HOST_ID, TRANSIENT_RUNTIME_OWNER } from "../ui/transient/transient_contract.js";
import { isReleaseBuild } from "./release_flag.js";

const UI_SURFACE_REGISTRY = Object.freeze({
  scene_text: {
    owner: "renderer+scene_text_runtime",
    stablePoint: "stage-actions",
    runtimeRootRequired: true,
    controllerRequired: false,
    allowedMutators: [
      "renderer.runSceneTextFxForMainMap",
      "render/scene_text_fx_dom.runSceneTextFxDom"
    ],
    resolveLiveHost: ({ documentRoot } = {}) => {
      const doc = documentRoot || document;
      return doc.querySelector("#app article.map-panel > div.map-desc:nth-of-type(2)")
        || doc.querySelector("#app .map-panel .map-desc");
    }
  },
  actions: {
    owner: "renderer",
    stablePoint: "stage-render",
    runtimeRootRequired: false,
    controllerRequired: false,
    allowedMutators: ["renderer.renderPageViewModel", "renderer.renderResolvedActionEntries"],
    resolveLiveHost: ({ documentRoot } = {}) => (documentRoot || document).querySelector("#choices")
  },
  sidebar_status: {
    owner: "renderer",
    stablePoint: "stage-render",
    runtimeRootRequired: false,
    controllerRequired: true,
    allowedMutators: ["renderer.renderPlayerSidebar"],
    resolveLiveHost: ({ documentRoot } = {}) => (documentRoot || document).querySelector("#player-sidebar")
  },
  inventory_overlay: {
    owner: "renderer+overlay_reconciler+ui_overlay_controller",
    stablePoint: "host_created",
    runtimeRootRequired: false,
    controllerRequired: true,
    allowedMutators: ["renderer.ensureInventoryOverlayHost", "overlay_host_reconciler.setHostState"],
    resolveLiveHost: ({ documentRoot } = {}) => (documentRoot || document).querySelector("#inventory-overlay-host")
  },
  tasks_overlay: {
    owner: "renderer+overlay_reconciler+ui_overlay_controller",
    stablePoint: "host_created",
    runtimeRootRequired: false,
    controllerRequired: true,
    allowedMutators: ["renderer.ensureTasksOverlayHost", "overlay_host_reconciler.setHostState"],
    resolveLiveHost: ({ documentRoot } = {}) => (documentRoot || document).querySelector("#tasks-overlay-host")
  },
  settings_overlay: {
    owner: "renderer",
    stablePoint: "host_created",
    runtimeRootRequired: false,
    controllerRequired: true,
    allowedMutators: ["renderer.ensureSettingsOverlayHost"],
    resolveLiveHost: ({ documentRoot } = {}) => (documentRoot || document).querySelector("#settings-overlay-host")
  },
  dialogs: {
    owner: "ui/dialogs",
    stablePoint: "host_created",
    runtimeRootRequired: false,
    controllerRequired: true,
    allowedMutators: ["ui/dialogs.ensureNoticeDialogHost", "ui/dialogs.showNoticeDialog"],
    resolveLiveHost: ({ documentRoot } = {}) => (documentRoot || document).querySelector("#notice-dialog-host")
  },
  minimap: {
    owner: "renderer",
    stablePoint: "host_created",
    runtimeRootRequired: false,
    controllerRequired: false,
    allowedMutators: [
      "renderer.ensureClinicMiniMapPanel",
      "renderer.ensureWinddykeMiniMapPanel",
      "renderer.ensureGovHallMiniMapPanel",
      "renderer.ensureWildernessLocalMiniMapPanel"
    ],
    resolveLiveHost: ({ documentRoot } = {}) => {
      const doc = documentRoot || document;
      return doc.querySelector("#clinic-minimap-panel")
        || doc.querySelector("#winddyke-minimap-panel")
        || doc.querySelector("#gov-hall-minimap-panel")
        || doc.querySelector("#wilderness-local-minimap-panel");
    }
  },
  transition_cinematic: {
    owner: "runtime/transition_owner",
    stablePoint: "phase_play_in",
    runtimeRootRequired: false,
    controllerRequired: true,
    allowedMutators: [
      "pipeline/dispatch.playMenuAtmosphereIn",
      "pipeline/dispatch.playMenuAtmosphereOut",
      "transition_dom_ownership.createMenuTransitionRuntimeOwner"
    ],
    resolveLiveHost: ({ documentRoot } = {}) => (documentRoot || document).querySelector("#menu-transition-overlay")
  },
  transient_runtime: {
    // Single runtime-owned fixed host with card lane + toast lane; emphasis has no separate DOM host.
    // Multi-step guide sessions reuse this host and do not register a second transient or guide-only surface.
    owner: TRANSIENT_RUNTIME_OWNER,
    stablePoint: "host_created",
    runtimeRootRequired: true,
    controllerRequired: true,
    allowedMutators: [
      "ui/transient/transient_runtime.enqueueTransientIntent",
      "ui/transient/transient_runtime.enqueueTransientIntents",
      "ui/transient/transient_runtime.clearTransientRuntime"
    ],
    resolveLiveHost: ({ documentRoot } = {}) => (documentRoot || document).querySelector(`#${TRANSIENT_RUNTIME_HOST_ID}`)
  },
  debug_probe: {
    owner: "renderer+debug_tools",
    stablePoint: "session_created",
    runtimeRootRequired: false,
    controllerRequired: true,
    allowedMutators: ["render/scene_text_fx_dom.runSceneTextDomProbe", "render/scene_text_fx_dom.runSceneTextDomLocator"],
    resolveLiveHost: ({ documentRoot } = {}) => {
      const doc = documentRoot || document;
      return doc.querySelector(".scene-text-dom-probe-panel")
        || doc.querySelector(".scene-text-dom-locator-panel")
        || doc.querySelector(".scene-text-diagnostic-panel");
    }
  },
  wilderness_readout_overlay: {
    owner: "render/wilderness_runtime_fragments+ui/interaction",
    stablePoint: "host_created",
    runtimeRootRequired: false,
    controllerRequired: false,
    allowedMutators: [
      "render/wilderness_runtime_fragments.renderWildernessRuntime",
      "ui/interaction.handleUiAction"
    ],
    resolveLiveHost: ({ documentRoot } = {}) =>
      (documentRoot || document).getElementById("wilderness-readout-overlay-host")
  }
});

export function getUiSurfaceRegistry() {
  if (!isReleaseBuild()) return UI_SURFACE_REGISTRY;
  const filtered = { ...UI_SURFACE_REGISTRY };
  delete filtered.debug_probe;
  return Object.freeze(filtered);
}

export function getUiSurfaceDefinition(surfaceId) {
  return UI_SURFACE_REGISTRY[String(surfaceId || "")] || null;
}

export function resolveUiSurfaceHost(surfaceId, context = {}) {
  const def = getUiSurfaceDefinition(surfaceId);
  if (!def || typeof def.resolveLiveHost !== "function") return null;
  return def.resolveLiveHost(context);
}
