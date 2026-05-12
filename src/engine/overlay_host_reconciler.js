import { UI_OVERLAY_TYPES, readCanonicalUiState, readCriticalUiGateMode, resolveEffectiveUiOverlay } from "./ui_route.js";
import { resolveTransitionPolicy } from "./transition_policy.js";

export const UI_OVERLAY_DOM_VIOLATION_CODES = Object.freeze({
  CANONICAL_MISMATCH: "UI_OVERLAY_DOM_CANONICAL_MISMATCH",
  MULTIPLE_ACTIVE: "UI_MULTIPLE_OVERLAY_ACTIVE"
});

function setHostState(host, isOpen, options = {}) {
  if (!host) return;
  const open = !!isOpen;
  host.setAttribute("aria-hidden", open ? "false" : "true");
  host.hidden = !open;
  host.classList.toggle("is-active", open);
  host.classList.toggle("is-open", open);
  host.dataset.active = open ? "true" : "false";
  host.dataset.open = open ? "true" : "false";
  if (!open && options.clearOnClose === true) {
    host.innerHTML = "";
  }
}

function isHostOpen(host) {
  if (!host) return false;
  return host.getAttribute("aria-hidden") === "false" && host.hidden !== true;
}

function collectOverlayHostState(hosts) {
  const tasksActive = isHostOpen(hosts?.tasks);
  const inventoryActive = isHostOpen(hosts?.inventory);
  const clinicMiniMapActive = isHostOpen(hosts?.mapMiniMap?.clinic);
  const industrialMiniMapActive = isHostOpen(hosts?.mapMiniMap?.industrial);
  const winddykeMiniMapActive = isHostOpen(hosts?.mapMiniMap?.winddyke);
  const govMiniMapActive = isHostOpen(hosts?.mapMiniMap?.gov);
  const steelcrossMiniMapActive = isHostOpen(hosts?.mapMiniMap?.steelcross);
  const activeCount = (tasksActive ? 1 : 0)
    + (inventoryActive ? 1 : 0)
    + (clinicMiniMapActive ? 1 : 0)
    + (industrialMiniMapActive ? 1 : 0)
    + (winddykeMiniMapActive ? 1 : 0)
    + (govMiniMapActive ? 1 : 0)
    + (steelcrossMiniMapActive ? 1 : 0);

  let activeOverlay = null;
  let activeHostId = "map-main-host";
  if (tasksActive) {
    activeOverlay = "tasks";
    activeHostId = "tasks-overlay-host";
  } else if (inventoryActive) {
    activeOverlay = "inventory";
    activeHostId = "inventory-overlay-host";
  } else if (
    clinicMiniMapActive
    || industrialMiniMapActive
    || winddykeMiniMapActive
    || govMiniMapActive
    || steelcrossMiniMapActive
  ) {
    activeOverlay = UI_OVERLAY_TYPES.MAP_MINIMAP;
    activeHostId = clinicMiniMapActive
      ? "clinic-minimap-panel"
      : industrialMiniMapActive
        ? "industrial-minimap-panel"
        : winddykeMiniMapActive
          ? "winddyke-minimap-panel"
          : govMiniMapActive
            ? "gov-hall-minimap-panel"
            : "steelcross-minimap-panel";
  }

  return {
    tasksActive,
    inventoryActive,
    clinicMiniMapActive,
    industrialMiniMapActive,
    winddykeMiniMapActive,
    govMiniMapActive,
    steelcrossMiniMapActive,
    activeCount,
    activeOverlay,
    activeHostId
  };
}

function resolveHostById(hosts, hostId) {
  const id = String(hostId || "");
  if (!id || id === "map-main-host") return null;
  if (id === "tasks-overlay-host") return hosts?.tasks || null;
  if (id === "inventory-overlay-host") return hosts?.inventory || null;
  if (id === "clinic-minimap-panel") return hosts?.mapMiniMap?.clinic || null;
  if (id === "industrial-minimap-panel") return hosts?.mapMiniMap?.industrial || null;
  if (id === "winddyke-minimap-panel") return hosts?.mapMiniMap?.winddyke || null;
  if (id === "gov-hall-minimap-panel") return hosts?.mapMiniMap?.gov || null;
  if (id === "steelcross-minimap-panel") return hosts?.mapMiniMap?.steelcross || null;
  return null;
}

export function reconcileOverlayHostsFromCanonicalUi(state, hosts, registry, options = {}) {
  const canonicalUi = readCanonicalUiState(state);
  const mapId = String(options?.mapId || "");
  const criticalGateMode = readCriticalUiGateMode(state);
  const canonicalOverlay = resolveEffectiveUiOverlay(canonicalUi, mapId, criticalGateMode);
  const minimapBranch = canonicalOverlay === UI_OVERLAY_TYPES.MAP_MINIMAP
    ? (options?.resolveMapMiniMapBranch?.(mapId) || null)
    : null;

  const before = collectOverlayHostState(hosts);

  setHostState(hosts?.tasks, canonicalOverlay === "tasks", { clearOnClose: true });
  setHostState(hosts?.inventory, canonicalOverlay === "inventory", { clearOnClose: true });
  setHostState(
    hosts?.mapMiniMap?.clinic,
    canonicalOverlay === UI_OVERLAY_TYPES.MAP_MINIMAP && minimapBranch === "clinic",
    { clearOnClose: true }
  );
  setHostState(
    hosts?.mapMiniMap?.industrial,
    canonicalOverlay === UI_OVERLAY_TYPES.MAP_MINIMAP && minimapBranch === "industrial",
    { clearOnClose: true }
  );
  setHostState(
    hosts?.mapMiniMap?.winddyke,
    canonicalOverlay === UI_OVERLAY_TYPES.MAP_MINIMAP && minimapBranch === "winddyke",
    { clearOnClose: true }
  );
  setHostState(
    hosts?.mapMiniMap?.gov,
    canonicalOverlay === UI_OVERLAY_TYPES.MAP_MINIMAP && minimapBranch === "gov",
    { clearOnClose: true }
  );
  setHostState(
    hosts?.mapMiniMap?.steelcross,
    canonicalOverlay === UI_OVERLAY_TYPES.MAP_MINIMAP && minimapBranch === "steelcross",
    { clearOnClose: true }
  );

  const after = collectOverlayHostState(hosts);
  const expectedHostId = canonicalOverlay
    ? (registry?.[canonicalOverlay]?.hostId || null)
    : "map-main-host";
  const expectedResolvedHostId = canonicalOverlay === UI_OVERLAY_TYPES.MAP_MINIMAP
    ? (minimapBranch === "industrial"
      ? "industrial-minimap-panel"
      : minimapBranch === "winddyke"
      ? "winddyke-minimap-panel"
      : minimapBranch === "gov"
        ? "gov-hall-minimap-panel"
        : minimapBranch === "steelcross"
          ? "steelcross-minimap-panel"
        : minimapBranch === "clinic"
          ? "clinic-minimap-panel"
          : "map-main-host")
    : expectedHostId;

  const reportViolation = options?.reportViolation;
  if (before.activeCount > 1 && typeof reportViolation === "function") {
    reportViolation({
      code: UI_OVERLAY_DOM_VIOLATION_CODES.MULTIPLE_ACTIVE,
      message: `multiple overlay hosts active before reconcile count=${before.activeCount}`,
      details: { before, after, canonicalOverlay, mapId }
    });
  }

  const expectedAfterHostId = canonicalOverlay ? expectedResolvedHostId : "map-main-host";
  const transitionPolicy = options?.transitionPolicy || resolveTransitionPolicy({
    actionId: String(options?.actionId || ""),
    prevMapId: String(options?.prevMapId || ""),
    nextMapId: String(mapId || ""),
    prevSurface: options?.prevSurface || {},
    nextSurface: {
      pageType: canonicalUi?.page || "",
      overlayType: canonicalOverlay,
      modalType: canonicalUi?.modal ?? null,
      mapId
    },
    pageType: canonicalUi?.page || "",
    overlayType: canonicalOverlay,
    modalType: canonicalUi?.modal ?? null
  });

  const transitionManager = options?.transitionManager;
  if (transitionPolicy.allowOverlayTransition === true
    && transitionManager
    && typeof transitionManager.runTransition === "function") {
    const fromHostId = before.activeHostId;
    const toHostId = expectedAfterHostId;
    if (fromHostId !== toHostId) {
      const presetName = canonicalOverlay
        ? String(registry?.[canonicalOverlay]?.transitionPreset || "softPanel")
        : "softPanel";
      transitionManager.runTransition({
        fromHostId,
        toHostId,
        fromHost: resolveHostById(hosts, fromHostId),
        toHost: resolveHostById(hosts, toHostId),
        presetName,
        canonicalOverlay,
        expectedHostId: expectedAfterHostId
      });
    }
  }

  if ((after.activeCount > 1 || after.activeHostId !== expectedAfterHostId) && typeof reportViolation === "function") {
    reportViolation({
      code: UI_OVERLAY_DOM_VIOLATION_CODES.CANONICAL_MISMATCH,
      message: `overlay host mismatch after reconcile canonical=${canonicalOverlay || "none"} actual=${after.activeOverlay || "none"}`,
      details: { before, after, canonicalOverlay, expectedAfterHostId, mapId }
    });
  }

  return {
    canonicalUi,
    canonicalOverlay,
    minimapBranch,
    expectedHostId: expectedResolvedHostId,
    before,
    after
  };
}
