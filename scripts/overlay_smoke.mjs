import { UI_OVERLAY_TYPES } from "../src/engine/ui_route.js";
import { createMapOverlayRegistry } from "../src/engine/overlay_registry.js";
import {
  UI_OVERLAY_DOM_VIOLATION_CODES,
  reconcileOverlayHostsFromCanonicalUi
} from "../src/engine/overlay_host_reconciler.js";

class FakeClassList {
  constructor() {
    this._set = new Set();
  }

  toggle(name, force) {
    if (force === true) {
      this._set.add(name);
      return true;
    }
    if (force === false) {
      this._set.delete(name);
      return false;
    }
    if (this._set.has(name)) {
      this._set.delete(name);
      return false;
    }
    this._set.add(name);
    return true;
  }

  contains(name) {
    return this._set.has(name);
  }
}

class FakeHost {
  constructor(id) {
    this.id = id;
    this.hidden = true;
    this.innerHTML = "";
    this.dataset = {};
    this.classList = new FakeClassList();
    this._attrs = new Map();
    this.setAttribute("aria-hidden", "true");
  }

  setAttribute(name, value) {
    this._attrs.set(String(name), String(value));
  }

  getAttribute(name) {
    return this._attrs.get(String(name)) ?? null;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeHosts() {
  return {
    tasks: new FakeHost("tasks-overlay-host"),
    inventory: new FakeHost("inventory-overlay-host"),
    mapMiniMap: {
      clinic: new FakeHost("clinic-minimap-panel"),
      winddyke: new FakeHost("winddyke-minimap-panel"),
      gov: new FakeHost("gov-hall-minimap-panel")
    }
  };
}

function isOpen(host) {
  return host.getAttribute("aria-hidden") === "false" && host.hidden !== true;
}

const registry = createMapOverlayRegistry({
  tasks: {
    hostId: "tasks-overlay-host",
    transitionPreset: "softPanel",
    buildViewModel: () => ({}),
    commit: () => ({ hostId: "tasks-overlay-host" })
  },
  inventory: {
    hostId: "inventory-overlay-host",
    transitionPreset: "softPanel",
    buildViewModel: () => ({}),
    commit: () => ({ hostId: "inventory-overlay-host" })
  },
  [UI_OVERLAY_TYPES.MAP_MINIMAP]: {
    hostId: "clinic-minimap-panel|winddyke-minimap-panel|gov-hall-minimap-panel",
    transitionPreset: "minimapPanel",
    buildViewModel: () => ({}),
    commit: () => ({ hostId: "clinic-minimap-panel" })
  }
});

const expectedDirtyPreconditionViolations = [];
const unexpectedViolations = [];
const state = { ui: { page: "map", overlay: null, modal: null } };
const hosts = makeHosts();

function recordExpectedDirtyPreconditionViolation(row) {
  expectedDirtyPreconditionViolations.push(row);
}

function recordUnexpectedViolation(row) {
  unexpectedViolations.push(row);
}

// Dirty state: multiple active hosts should self-heal in one reconcile pass.
hosts.tasks.hidden = false;
hosts.inventory.hidden = false;
hosts.tasks.setAttribute("aria-hidden", "false");
hosts.inventory.setAttribute("aria-hidden", "false");

reconcileOverlayHostsFromCanonicalUi(state, hosts, registry, {
  mapId: "bayport_clinic",
  resolveMapMiniMapBranch: () => "clinic",
  reportViolation: recordExpectedDirtyPreconditionViolation
});

assert(expectedDirtyPreconditionViolations.length === 1, "expected exactly one dirty-precondition violation");
assert(
  expectedDirtyPreconditionViolations[0]?.code === UI_OVERLAY_DOM_VIOLATION_CODES.MULTIPLE_ACTIVE,
  "expected dirty-precondition violation to be UI_MULTIPLE_OVERLAY_ACTIVE"
);

assert(!isOpen(hosts.tasks), "expected tasks host closed when canonical overlay is null");
assert(!isOpen(hosts.inventory), "expected inventory host closed when canonical overlay is null");
assert(!isOpen(hosts.mapMiniMap.clinic), "expected clinic minimap host closed when canonical overlay is null");
assert(!isOpen(hosts.mapMiniMap.winddyke), "expected winddyke minimap host closed when canonical overlay is null");
assert(!isOpen(hosts.mapMiniMap.gov), "expected gov minimap host closed when canonical overlay is null");

state.ui.overlay = "tasks";
reconcileOverlayHostsFromCanonicalUi(state, hosts, registry, {
  mapId: "bayport_clinic",
  resolveMapMiniMapBranch: () => "clinic",
  reportViolation: recordUnexpectedViolation
});
assert(isOpen(hosts.tasks), "expected tasks host open for ui.overlay=tasks");
assert(!isOpen(hosts.inventory), "expected inventory host closed for ui.overlay=tasks");
assert(!isOpen(hosts.mapMiniMap.clinic), "expected minimap host closed for ui.overlay=tasks");

state.ui.overlay = "inventory";
reconcileOverlayHostsFromCanonicalUi(state, hosts, registry, {
  mapId: "bayport_clinic",
  resolveMapMiniMapBranch: () => "clinic",
  reportViolation: recordUnexpectedViolation
});
assert(isOpen(hosts.inventory), "expected inventory host open for ui.overlay=inventory");
assert(!isOpen(hosts.tasks), "expected tasks host closed for ui.overlay=inventory");

state.ui.overlay = UI_OVERLAY_TYPES.MAP_MINIMAP;
reconcileOverlayHostsFromCanonicalUi(state, hosts, registry, {
  mapId: "winddyke_street_corner_notice",
  resolveMapMiniMapBranch: () => "winddyke",
  reportViolation: recordUnexpectedViolation
});
assert(isOpen(hosts.mapMiniMap.winddyke), "expected winddyke minimap host open for ui.overlay=map_minimap");
assert(!isOpen(hosts.mapMiniMap.clinic), "expected clinic minimap host closed for winddyke map_minimap");
assert(!isOpen(hosts.mapMiniMap.gov), "expected gov minimap host closed for winddyke map_minimap");
assert(!isOpen(hosts.tasks), "expected tasks host closed for ui.overlay=map_minimap");
assert(!isOpen(hosts.inventory), "expected inventory host closed for ui.overlay=map_minimap");

state.ui.overlay = UI_OVERLAY_TYPES.MAP_MINIMAP;
reconcileOverlayHostsFromCanonicalUi(state, hosts, registry, {
  mapId: "gov_hall_main_hall",
  resolveMapMiniMapBranch: () => "gov",
  reportViolation: recordUnexpectedViolation
});
assert(isOpen(hosts.mapMiniMap.gov), "expected gov minimap host open for gov hall map_minimap");
assert(!isOpen(hosts.mapMiniMap.clinic), "expected clinic minimap host closed for gov hall map_minimap");
assert(!isOpen(hosts.mapMiniMap.winddyke), "expected winddyke minimap host closed for gov hall map_minimap");

state.ui.overlay = null;
reconcileOverlayHostsFromCanonicalUi(state, hosts, registry, {
  mapId: "bayport_clinic",
  resolveMapMiniMapBranch: () => "clinic",
  reportViolation: recordUnexpectedViolation
});
assert(!isOpen(hosts.tasks) && !isOpen(hosts.inventory) && !isOpen(hosts.mapMiniMap.clinic) && !isOpen(hosts.mapMiniMap.winddyke) && !isOpen(hosts.mapMiniMap.gov), "expected all hosts closed for ui.overlay=null");

// Simulate load game then immediate open flows.
state.ui.overlay = "tasks";
reconcileOverlayHostsFromCanonicalUi(state, hosts, registry, {
  mapId: "bayport_clinic",
  resolveMapMiniMapBranch: () => "clinic",
  reportViolation: recordUnexpectedViolation
});
state.ui.overlay = "inventory";
reconcileOverlayHostsFromCanonicalUi(state, hosts, registry, {
  mapId: "bayport_clinic",
  resolveMapMiniMapBranch: () => "clinic",
  reportViolation: recordUnexpectedViolation
});
assert(isOpen(hosts.inventory) && !isOpen(hosts.tasks), "expected inventory-only visible after tasks->inventory immediate switch");
assert(unexpectedViolations.length === 0, "expected zero unexpected overlay violations after reconcile");

console.log("overlay smoke passed");
console.log(`expectedDirtyPreconditionViolations: ${expectedDirtyPreconditionViolations.length}`);
console.log(`unexpectedViolations: ${unexpectedViolations.length}`);
