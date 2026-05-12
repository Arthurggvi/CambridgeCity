import { makeEmptyPlan } from "../src/engine/pipeline/plan_types.js";
import { commit } from "../src/engine/pipeline/commit.js";
import { Effects } from "../src/engine/pipeline/effects.js";
import { resolveLibraryReadingAction } from "../src/engine/library_reading/service.js";
import { ensureDataDeltaToastRegistration } from "../src/ui/toast.js";
import { getTransientIntentsFromCommitReport } from "../src/engine/pipeline/transient_intent_adapter.js";
import {
  enqueueTransientIntents,
  getTransientRuntimeSnapshot,
  clearTransientRuntime
} from "../src/ui/transient/transient_runtime.js";
import { ensureTransientRuntimeHost } from "../src/ui/transient/transient_host.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// -----------------------------------------------------------------------------
// Minimal DOM shim (enough for transient runtime + delta toast presenter)
// -----------------------------------------------------------------------------

class ClassList {
  constructor(owner) {
    this.owner = owner;
    this.set = new Set();
  }
  add(...names) { for (const n of names) if (n) this.set.add(String(n)); this._sync(); }
  remove(...names) { for (const n of names) this.set.delete(String(n)); this._sync(); }
  toggle(name, force) {
    const key = String(name);
    const next = force == null ? !this.set.has(key) : !!force;
    if (next) this.set.add(key); else this.set.delete(key);
    this._sync();
    return next;
  }
  contains(name) { return this.set.has(String(name)); }
  _sync() { this.owner.className = Array.from(this.set.values()).join(" "); }
}

class NodeLike {
  constructor(tagName = "") {
    this.tagName = tagName;
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.id = "";
    this.className = "";
    this.classList = new ClassList(this);
    this.textContent = "";
    this.dataset = {};
    this.style = {};
    this.isConnected = false;
  }
  setAttribute(name, value) {
    const key = String(name);
    const val = String(value);
    this.attributes.set(key, val);
    if (key === "id") this.id = val;
  }
  getAttribute(name) { return this.attributes.get(String(name)) ?? null; }
  appendChild(child) {
    if (!child) return null;
    child.parentElement = this;
    this.children.push(child);
    child._setConnected(this.isConnected);
    return child;
  }
  remove() {
    if (!this.parentElement) return;
    const parent = this.parentElement;
    parent.children = parent.children.filter((c) => c !== this);
    this.parentElement = null;
    this._setConnected(false);
  }
  get innerHTML() {
    return "";
  }
  set innerHTML(_value) {
    // Used by transient host clear; we just drop children.
    this.children = [];
    this.textContent = "";
  }
  contains(node) {
    if (!node) return false;
    if (node === this) return true;
    return this.children.some((c) => c.contains(node));
  }
  _setConnected(connected) {
    this.isConnected = !!connected;
    for (const c of this.children) c._setConnected(connected);
  }
  // extremely small selector support for patterns used by transient_host:
  // `:scope > .className` and `.className`
  querySelector(selector) {
    const sel = String(selector || "").trim();
    if (!sel) return null;
    const scopeChildMatch = sel.match(/^:scope\s*>\s*\.(.+)$/);
    if (scopeChildMatch) {
      const cls = scopeChildMatch[1];
      return this.children.find((c) => String(c.className || "").split(/\s+/).includes(cls)) || null;
    }
    const classMatch = sel.match(/^\.(.+)$/);
    if (classMatch) {
      const cls = classMatch[1];
      return this._walkFind((n) => String(n.className || "").split(/\s+/).includes(cls));
    }
    return null;
  }
  querySelectorAll(selector) {
    const sel = String(selector || "").trim();
    const out = [];
    const classMatch = sel.match(/^\.(.+)$/);
    if (classMatch) {
      const cls = classMatch[1];
      this._walkCollect((n) => String(n.className || "").split(/\s+/).includes(cls), out);
    }
    return out;
  }
  _walkFind(pred) {
    for (const c of this.children) {
      if (pred(c)) return c;
      const nested = c._walkFind(pred);
      if (nested) return nested;
    }
    return null;
  }
  _walkCollect(pred, out) {
    for (const c of this.children) {
      if (pred(c)) out.push(c);
      c._walkCollect(pred, out);
    }
  }
  addEventListener() {}
  removeEventListener() {}
}

class DocumentLike {
  constructor() {
    this.body = new NodeLike("BODY");
    this.body._setConnected(true);
    this._idIndex = new Map();
  }
  createElement(tag) { return new NodeLike(String(tag).toUpperCase()); }
  createElementNS(_ns, tag) { return this.createElement(tag); }
  getElementById(id) { return this._walkById(this.body, String(id)); }
  _walkById(node, id) {
    if (String(node.id || "") === id) return node;
    for (const c of node.children) {
      const found = this._walkById(c, id);
      if (found) return found;
    }
    return null;
  }
}

function flattenText(node) {
  if (!node) return "";
  const parts = [];
  const walk = (n) => {
    if (n.textContent) parts.push(String(n.textContent));
    for (const c of n.children) walk(c);
  };
  walk(node);
  return parts.join("\n");
}

function installDomGlobals() {
  const doc = new DocumentLike();
  globalThis.document = doc;
  globalThis.window = globalThis;
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  return doc;
}

// -----------------------------------------------------------------------------
// Probe
// -----------------------------------------------------------------------------

function makeMockGameState() {
  return {
    currentMapId: "west2_outpost_library_center",
    currentSceneId: "west2_outpost_library_reading",
    currentScene: { id: "west2_outpost_library_reading" },
    time: { totalMinutes: 0 },
    world: { currentMapId: "west2_outpost_library_center", flags: {} },
    player: { meta: {}, profile: {} },
    flags: {},
    logLines: [],
    ui: { page: "map", overlay: null }
  };
}

async function main() {
  const doc = installDomGlobals();

  // Ensure host + presenter registry
  ensureTransientRuntimeHost({ documentRoot: doc });
  ensureDataDeltaToastRegistration();

  // Patch clearTransientRuntime to capture calls
  const clearCalls = [];
  const originalClear = clearTransientRuntime;
  globalThis.__clearTransientRuntimePatched = true;
  // we cannot monkeypatch imported binding, but we can still call original and observe snapshot pre/post.
  void originalClear;

  const gameState = makeMockGameState();
  const reading = resolveLibraryReadingAction(gameState, {
    mapId: "west2_outpost_library_center",
    actionId: "read_random_library_book",
    sceneId: "west2_outpost_library_reading"
  });

  assert(reading?.ok === true, "library_reading resolve must ok");
  assert(reading.isFirstRead === true, "library_reading must be first read");
  assert(reading.reward?.experience === 10, "library_reading reward.experience must be 10");

  const plan = makeEmptyPlan({ id: "read_random_library_book" });
  plan.effects.push(Effects.set("player.meta.libraryReading", reading.nextState));
  plan.profileIntents.push({
    type: "xp",
    key: "experience",
    amount: 10,
    reason: `library_reading:first_read:${reading.selectedContentId}`
  });

  const { ok, report } = await commit(plan, gameState);
  assert(ok === true, "commit must ok");

  // 1. profile apply delta
  const beforeXp = Number(report?.profile?.apply?.before?.experience?.xp || 0);
  const afterXp = Number(report?.profile?.apply?.after?.experience?.xp || 0);
  console.log("[probe] profile.experience.xp before/after:", beforeXp, "->", afterXp);
  assert(afterXp - beforeXp === 10, "experience delta must be +10");

  // 2. adapter intents
  const intents = getTransientIntentsFromCommitReport(report);
  const deltaIntents = intents.filter((x) => String(x?.type || "") === "data_delta_toast");
  assert(deltaIntents.length > 0, "adapter must output data_delta_toast intent");
  const delta = deltaIntents[0];
  const payloadLines = Array.isArray(delta?.payload?.lines) ? delta.payload.lines : [];
  const lineTexts = payloadLines.map((l) => String(l?.text || "")).join(" | ");
  console.log("[probe] first data_delta_toast lines:", lineTexts);
  assert(!String(delta?.payload?.variant || "").includes("record-unlock"), "toast variant must not be record-unlock");
  assert(!Array.isArray(delta?.emphasisTargets) || !delta.emphasisTargets.includes("records_entry"), "toast must not emphasize records_entry");
  assert(lineTexts.includes("阅历＋10"), "toast payload must include 阅历＋10");

  // 3-8. enqueue -> runtime snapshot -> DOM
  enqueueTransientIntents(intents);
  await new Promise((r) => setTimeout(r, 50));
  const snap = getTransientRuntimeSnapshot();
  const toastQueue = snap?.queue?.toasts?.items || snap?.queue?.toasts || null;
  console.log("[probe] transient snapshot host:", snap?.host);
  console.log("[probe] transient snapshot toast queue:", toastQueue);

  const host = doc.getElementById(snap?.host?.hostId || "transient-runtime-host");
  const hostText = flattenText(host);
  const toastItems = host?.querySelectorAll(".delta-toast-transient") || [];
  const visibleItems = host?.querySelectorAll(".is-in") || [];
  console.log("[probe] DOM delta-toast count:", toastItems.length);
  console.log("[probe] DOM text:", hostText);
  assert(toastItems.length > 0, "DOM must contain .delta-toast-transient");
  assert(hostText.includes("阅历＋10"), "DOM text must include 阅历＋10");

  // 9-10. clearTransientRuntime observation hook placeholder
  console.log("[probe] clearTransientRuntime calls captured:", clearCalls.length);
}

await main();

