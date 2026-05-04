import { gameState } from "./state.js";
import { getRecordViewById, getUnlockedRecordTreeView, getUnlockedRecordViewList } from "./records/record_service.js";
import { renderRecordsOverlayPage } from "./render/records_overlay_page.js";

let _recordsClosePromise = null;
let _recordsEscBound = false;
let _selectedRecordId = null;
let _controllerOptions = {};
let _recordsHostObserver = null;
let _recordsRepairScheduled = false;
let _expandedRecordGroupIds = new Set();

function getControllerOption(name, fallback = null) {
  const value = _controllerOptions && _controllerOptions[name];
  return typeof value === "undefined" ? fallback : value;
}

function normalizeRecordId(recordId) {
  const normalized = String(recordId || "").trim();
  return normalized || null;
}

function waitForRecordsOverlayCloseSignal(overlay) {
  return new Promise((resolve) => {
    if (!overlay) {
      resolve({ source: "none" });
      return;
    }

    const dialog = overlay.querySelector(".records-panel-dialog");
    const backdrop = overlay.querySelector(".records-panel-backdrop");
    let done = false;

    const finish = (source) => {
      if (done) return;
      done = true;
      overlay.removeEventListener("transitionend", onEnd);
      overlay.removeEventListener("animationend", onEnd);
      if (dialog) {
        dialog.removeEventListener("transitionend", onEnd);
        dialog.removeEventListener("animationend", onEnd);
      }
      if (backdrop) {
        backdrop.removeEventListener("transitionend", onEnd);
        backdrop.removeEventListener("animationend", onEnd);
      }
      clearTimeout(timer);
      resolve({ source });
    };

    const onEnd = (event) => {
      const target = event?.target;
      if (target !== overlay && target !== dialog && target !== backdrop) return;
      finish("event");
    };

    overlay.addEventListener("transitionend", onEnd);
    overlay.addEventListener("animationend", onEnd);
    if (dialog) {
      dialog.addEventListener("transitionend", onEnd);
      dialog.addEventListener("animationend", onEnd);
    }
    if (backdrop) {
      backdrop.addEventListener("transitionend", onEnd);
      backdrop.addEventListener("animationend", onEnd);
    }

    const timer = setTimeout(() => finish("timeout"), 280);
  });
}

export function getSelectedRecordId() {
  return _selectedRecordId;
}

export function setSelectedRecordId(recordId) {
  _selectedRecordId = normalizeRecordId(recordId);
  return _selectedRecordId;
}

export function syncSelectedRecordId(unlockedRecords) {
  const items = Array.isArray(unlockedRecords) ? unlockedRecords : [];
  const hasCurrent = items.some((item) => String(item?.recordId || "") === _selectedRecordId);
  if (hasCurrent) return _selectedRecordId;
  _selectedRecordId = items.length > 0 ? normalizeRecordId(items[0]?.recordId) : null;
  return _selectedRecordId;
}

function syncExpandedRecordGroupIds(recordGroups, selectedRecordId) {
  const groups = Array.isArray(recordGroups) ? recordGroups : [];
  const nextIds = new Set(groups.map((group) => String(group?.groupId || "")).filter(Boolean));
  const selectedGroupId = groups.find((group) =>
    Array.isArray(group?.items) && group.items.some((item) => String(item?.recordId || "") === String(selectedRecordId || ""))
  )?.groupId || null;

  _expandedRecordGroupIds = new Set(
    Array.from(_expandedRecordGroupIds).filter((groupId) => nextIds.has(groupId))
  );

  if (_expandedRecordGroupIds.size === 0) {
    groups.forEach((group) => {
      const groupId = String(group?.groupId || "");
      if (groupId) _expandedRecordGroupIds.add(groupId);
    });
  }

  if (selectedGroupId) {
    _expandedRecordGroupIds.add(String(selectedGroupId));
  }
}

function bindRecordsOverlayInteractions(host) {
  if (!host || host.dataset.recordsTreeBound === "true") return;
  host.addEventListener("click", (event) => {
    const toggle = event.target instanceof Element
      ? event.target.closest("[data-records-group-toggle]")
      : null;
    if (!toggle || !host.contains(toggle)) return;
    const groupId = String(toggle.getAttribute("data-records-group-toggle") || "").trim();
    if (!groupId) return;
    if (_expandedRecordGroupIds.has(groupId)) {
      _expandedRecordGroupIds.delete(groupId);
    } else {
      _expandedRecordGroupIds.add(groupId);
    }
    event.preventDefault();
    renderActiveRecordsOverlay(host);
  });
  host.dataset.recordsTreeBound = "true";
}

export function clearSelectedRecordId() {
  _selectedRecordId = null;
  _expandedRecordGroupIds = new Set();
}

function buildRecordsOverlayRenderModel(map) {
  const records = getUnlockedRecordViewList({
    recordsState: gameState.player?.records
  });
  const selectedRecordId = syncSelectedRecordId(records);
  const recordGroups = getUnlockedRecordTreeView({
    recordsState: gameState.player?.records
  });
  syncExpandedRecordGroupIds(recordGroups, selectedRecordId);
  const detailResult = selectedRecordId
    ? getRecordViewById({
      recordId: selectedRecordId,
      recordsState: gameState.player?.records
    })
    : {
      ok: false,
      reason: "no_selection",
      recordId: null,
      view: null,
      debug: {
        message: "No record selected"
      }
    };

  return {
    mapName: String(map?.name || gameState.currentMap?.name || "当前区域"),
    records,
    recordGroups: recordGroups.map((group) => ({
      ...group,
      expanded: _expandedRecordGroupIds.has(String(group?.groupId || ""))
    })),
    selectedRecordId,
    detailResult
  };
}

export function renderActiveRecordsOverlay(host = document.getElementById("records-overlay-host"), map = gameState.currentMap || null) {
  if (!host || gameState.ui?.recordsOpen !== true) return;
  bindRecordsOverlayInteractions(host);
  renderRecordsOverlayPage(buildRecordsOverlayRenderModel(map), host);
  const overlay = host.querySelector(".records-panel-overlay");
  showRecordsOverlay(host, overlay);
}

function scheduleRecordsOverlayRepair(host) {
  if (!host || _recordsRepairScheduled) return;
  _recordsRepairScheduled = true;
  requestAnimationFrame(() => {
    _recordsRepairScheduled = false;
    if (!host.isConnected) return;
    if (gameState.ui?.recordsOpen !== true) return;
    if (isRecordsOverlayClosing(host)) return;
    const isHidden = host.getAttribute("aria-hidden") === "true" || host.hidden === true;
    const isEmpty = host.childElementCount === 0 || !String(host.innerHTML || "").trim();
    if (!isHidden && !isEmpty) return;
    renderActiveRecordsOverlay(host);
  });
}

export function requestRecordsOverlayRender() {
  renderActiveRecordsOverlay();
}

export function isRecordsOverlayClosing(host) {
  if (!host) return false;
  return host.dataset.recordsClosing === "true";
}

export function showRecordsOverlay(host, overlay) {
  if (!host || !overlay) return;
  host.dataset.recordsClosing = "false";
  host.setAttribute("aria-hidden", "false");
  host.hidden = false;

  overlay.classList.remove("is-closing");
  if (overlay.classList.contains("is-visible")) return;

  requestAnimationFrame(() => {
    if (!overlay.isConnected) return;
    requestAnimationFrame(() => {
      if (!overlay.isConnected) return;
      overlay.classList.add("is-visible");
    });
  });
}

export async function closeRecordsOverlay(host, options = {}) {
  if (!host) {
    if (typeof options.dispatchClose === "function") {
      await options.dispatchClose();
    }
    clearSelectedRecordId();
    return;
  }

  if (_recordsClosePromise) {
    await _recordsClosePromise;
    return;
  }

  _recordsClosePromise = (async () => {
    const overlay = host.querySelector(".records-panel-overlay");
    host.dataset.recordsClosing = "true";

    if (overlay) {
      overlay.classList.add("is-closing");
      overlay.classList.remove("is-visible");
      await waitForRecordsOverlayCloseSignal(overlay);
    }

    if (typeof options.dispatchClose === "function") {
      await options.dispatchClose();
    }

    host.innerHTML = "";
    host.setAttribute("aria-hidden", "true");
    host.hidden = true;
    host.dataset.recordsClosing = "false";
    clearSelectedRecordId();
  })();

  try {
    await _recordsClosePromise;
  } finally {
    _recordsClosePromise = null;
  }
}

export function ensureRecordsOverlayHost(options = {}) {
  _controllerOptions = {
    ..._controllerOptions,
    ...options
  };

  let host = document.getElementById("records-overlay-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "records-overlay-host";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
  }

  if (!_recordsHostObserver) {
    _recordsHostObserver = new MutationObserver(() => {
      scheduleRecordsOverlayRepair(host);
    });
    _recordsHostObserver.observe(host, {
      childList: true,
      attributes: true,
      attributeFilter: ["aria-hidden", "hidden"]
    });
  }

  if (!_recordsEscBound) {
    document.addEventListener("keydown", async (event) => {
      if (event.key !== "Escape") return;
      const isOpen = typeof getControllerOption("isOpen") === "function" ? getControllerOption("isOpen")() : false;
      if (!isOpen) return;
      const isQuickKeysEnabled = typeof getControllerOption("isQuickKeysEnabled") === "function"
        ? getControllerOption("isQuickKeysEnabled")()
        : true;
      if (!isQuickKeysEnabled) return;
      await closeRecordsOverlay(host, {
        dispatchClose: getControllerOption("dispatchClose")
      });
    });
    _recordsEscBound = true;
  }

  if (host.parentElement !== document.body) {
    document.body.appendChild(host);
  }

  return host;
}