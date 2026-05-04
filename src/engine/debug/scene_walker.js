#!/usr/bin/env node

/**
 * Scene Walker (Node-only debug tool)
 *
 * Purpose:
 * - Run scene traversal in Node without renderer/DOM interaction.
 * - Reuse the main Action -> Resolve -> Commit pipeline.
 * - Produce regression-friendly JSON reports for map/actions/requires/transition/session/save-load checks.
 *
 * Hard constraints respected:
 * - Does not rewrite gameplay logic.
 * - Does not call renderer for business behavior.
 * - Keeps state truth in existing gameState/time.totalMinutes.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { gameState } from "../state.js";
import {
  loadItemsDb,
  loadMap,
  loadPlaceProfiles,
  loadRegionData
} from "../loader.js";
import {
  collectSceneInteractionsV2,
  isMapContentV2,
  resolveCurrentSceneV2,
  resolveInteractionEdgeV2
} from "../map_content_v2.js";
import { initMapContentRuntime } from "../map_content_runtime.js";
import { dispatch } from "../pipeline/dispatch.js";
import { evaluateRequires } from "../requires.js";
import { saveManager } from "../../save/save_manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");

const DEFAULTS = {
  entry: "bayport_clinic",
  maxDepth: 2,
  maxSteps: 120,
  maxVisitsPerMap: 3,
  preset: "default",
  report: "./temp_scene_walker_report.json",
  saveLoadCheck: true,
  saveLoadEvery: 12
};

const PRESETS = {
  default: {
    entry: "bayport_clinic",
    maxDepth: 2,
    maxSteps: 120,
    maxVisitsPerMap: 3,
    saveLoadCheck: true,
    saveLoadEvery: 12
  },
  clinic: {
    entry: "bayport_clinic",
    maxDepth: 3,
    maxSteps: 220,
    maxVisitsPerMap: 4,
    saveLoadCheck: true,
    saveLoadEvery: 10
  },
  gov: {
    entry: "gov_hall_entry_split",
    maxDepth: 3,
    maxSteps: 220,
    maxVisitsPerMap: 4,
    saveLoadCheck: true,
    saveLoadEvery: 10
  },
  quick: {
    entry: "bayport_clinic",
    maxDepth: 1,
    maxSteps: 40,
    maxVisitsPerMap: 2,
    saveLoadCheck: false,
    saveLoadEvery: 0
  }
};

function printHelp() {
  const lines = [
    "Scene Walker - Node scene traversal debug tool",
    "",
    "Usage:",
    "  node ./src/engine/debug/scene_walker.js [options]",
    "",
    "Options:",
    "  --entry=<mapId>             Entry map id (default: bayport_clinic)",
    "  --maxDepth=<number>         Traversal depth limit (default: 2)",
    "  --maxSteps=<number>         Traversal action-step limit (default: 120)",
    "  --maxVisitsPerMap=<number>  Per-map visit cap (default: 3)",
    "  --preset=<name>             Preset: default|clinic|gov|quick",
    "  --report=<path>             Report output path",
    "  --saveLoadCheck=<bool>      Enable periodic save->load->compare",
    "  --saveLoadEvery=<number>    Run save/load every N steps",
    "  --help                      Show this help",
    "",
    "Examples:",
    "  node ./src/engine/debug/scene_walker.js --entry=bayport_clinic",
    "  node ./src/engine/debug/scene_walker.js --preset=gov --maxDepth=4",
    "  node ./src/engine/debug/scene_walker.js --preset=clinic --report=./reports/clinic.json"
  ];
  console.log(lines.join("\n"));
}

function parseBoolean(value, fallback) {
  if (value == null) return fallback;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function parseInteger(value, fallback, min = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.trunc(n));
}

function parseArgs(argv) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const body = token.slice(2);
    if (body === "help") {
      raw.help = true;
      continue;
    }
    const idx = body.indexOf("=");
    if (idx < 0) {
      raw[body] = "true";
      continue;
    }
    const key = body.slice(0, idx).trim();
    const val = body.slice(idx + 1).trim();
    raw[key] = val;
  }

  const presetName = String(raw.preset || DEFAULTS.preset);
  const preset = PRESETS[presetName] || PRESETS.default;

  return {
    help: !!raw.help,
    entry: String(raw.entry || preset.entry || DEFAULTS.entry),
    maxDepth: parseInteger(raw.maxDepth, preset.maxDepth ?? DEFAULTS.maxDepth, 0),
    maxSteps: parseInteger(raw.maxSteps, preset.maxSteps ?? DEFAULTS.maxSteps, 1),
    maxVisitsPerMap: parseInteger(
      raw.maxVisitsPerMap,
      preset.maxVisitsPerMap ?? DEFAULTS.maxVisitsPerMap,
      1
    ),
    preset: presetName,
    report: String(raw.report || DEFAULTS.report),
    saveLoadCheck: parseBoolean(raw.saveLoadCheck, preset.saveLoadCheck ?? DEFAULTS.saveLoadCheck),
    saveLoadEvery: parseInteger(raw.saveLoadEvery, preset.saveLoadEvery ?? DEFAULTS.saveLoadEvery, 0)
  };
}

function makeClassListStub() {
  const set = new Set();
  return {
    add: (...items) => items.forEach((x) => set.add(String(x))),
    remove: (...items) => items.forEach((x) => set.delete(String(x))),
    contains: (item) => set.has(String(item)),
    toggle: (item, force) => {
      const key = String(item);
      if (force === true) {
        set.add(key);
        return true;
      }
      if (force === false) {
        set.delete(key);
        return false;
      }
      if (set.has(key)) {
        set.delete(key);
        return false;
      }
      set.add(key);
      return true;
    }
  };
}

function makeNodeStub() {
  return {
    id: "",
    dataset: {},
    style: {
      setProperty() {},
      removeProperty() {}
    },
    classList: makeClassListStub(),
    children: [],
    appendChild(node) {
      this.children.push(node);
      return node;
    },
    insertBefore(node) {
      this.children.push(node);
      return node;
    },
    removeChild() {},
    remove() {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    contains() {
      return false;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    innerHTML: "",
    textContent: ""
  };
}

function installNodeRuntimePolyfills(repoRoot) {
  const memoryStorage = new Map();

  const localStorageStub = {
    getItem(key) {
      return memoryStorage.has(key) ? memoryStorage.get(key) : null;
    },
    setItem(key, value) {
      memoryStorage.set(String(key), String(value));
    },
    removeItem(key) {
      memoryStorage.delete(String(key));
    },
    clear() {
      memoryStorage.clear();
    },
    key(index) {
      const arr = Array.from(memoryStorage.keys());
      return arr[index] ?? null;
    },
    get length() {
      return memoryStorage.size;
    }
  };

  const body = makeNodeStub();
  const documentElement = makeNodeStub();
  const documentStub = {
    body,
    documentElement,
    createElement() {
      return makeNodeStub();
    },
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    removeEventListener() {}
  };

  globalThis.localStorage = localStorageStub;
  globalThis.document = documentStub;
  globalThis.window = globalThis;
  globalThis.window.document = documentStub;
  globalThis.window.localStorage = localStorageStub;
  globalThis.window.innerWidth = 1366;
  globalThis.window.innerHeight = 768;
  globalThis.window.addEventListener = () => {};
  globalThis.window.removeEventListener = () => {};
  globalThis.window.requestAnimationFrame = (cb) => {
    const id = setTimeout(() => cb(Date.now()), 0);
    return id;
  };
  globalThis.window.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = globalThis.window.cancelAnimationFrame;
  globalThis.window.matchMedia = () => ({
    matches: false,
    media: "",
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    }
  });

  const nativeFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const source = typeof input === "string" ? input : String(input?.url || "");

    // Keep native fetch behavior for absolute URLs if available.
    if (/^https?:\/\//i.test(source) || /^file:\/\//i.test(source)) {
      if (typeof nativeFetch === "function") {
        return nativeFetch(input);
      }
      return {
        ok: false,
        status: 501,
        async json() {
          throw new Error("Native fetch unavailable");
        },
        async text() {
          return "";
        }
      };
    }

    const normalized = source.replace(/^\.\//, "");
    const absPath = path.resolve(repoRoot, normalized);

    try {
      const raw = await fs.promises.readFile(absPath);
      return {
        ok: true,
        status: 200,
        async json() {
          return JSON.parse(raw.toString("utf8"));
        },
        async text() {
          return raw.toString("utf8");
        }
      };
    } catch {
      return {
        ok: false,
        status: 404,
        async json() {
          throw new Error(`Not found: ${normalized}`);
        },
        async text() {
          return "";
        }
      };
    }
  };
}

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function captureWalkerStateSnapshot() {
  return deepClone(gameState);
}

function extractSessionState(session) {
  if (!session || typeof session !== "object") return null;
  return {
    sessionId: String(session.sessionId || "").trim(),
    status: String(session.status || "").trim(),
    sourceMapId: String(session.sourceMapId || "").trim(),
    sourceActionId: String(session.sourceActionId || "").trim(),
    inquiryId: String(session.inquiryId || "").trim(),
    jobId: String(session.jobId || "").trim(),
    replyKey: String(session.replyKey || "").trim(),
    briefingReplyType: String(session.briefingReplyType || "").trim()
  };
}

async function restoreWalkerStateSnapshot(snapshot) {
  const nextState = deepClone(snapshot) || {};

  for (const key of Object.keys(gameState)) {
    delete gameState[key];
  }

  Object.assign(gameState, nextState);

  const currentMapId = String(gameState?.currentMapId || gameState?.world?.currentMapId || "").trim();
  if (!gameState.currentMap && currentMapId) {
    const map = await loadMap(currentMapId);
    if (map) {
      gameState.currentMap = map;
    }
  }

  if (gameState.world && currentMapId) {
    gameState.world.currentMapId = currentMapId;
  }
}

function extractKeyState(state) {
  return {
    totalMinutes: Number(state?.time?.totalMinutes ?? 0),
    currentMapId: String(state?.currentMapId || ""),
    currentSceneId: String(state?.currentSceneId || state?.currentScene?.id || ""),
    player: deepClone(state?.player || {}),
    worldFlags: deepClone(state?.world?.flags || state?.flags || {}),
    uiPage: String(state?.ui?.page || ""),
    uiInquirySession: extractSessionState(state?.ui?.inquirySession),
    uiJobSession: extractSessionState(state?.ui?.jobSession)
  };
}

function getBillsTotalCents(state) {
  const obs = Number(state?.world?.medical?.bills?.obsCents ?? 0);
  const ward = Number(state?.world?.medical?.bills?.wardCents ?? 0);
  return Math.trunc(obs) + Math.trunc(ward);
}

function computeStateDiff(before, after) {
  const diffs = [];

  if (before.totalMinutes !== after.totalMinutes) {
    diffs.push({ field: "time.totalMinutes", before: before.totalMinutes, after: after.totalMinutes });
  }
  if (before.currentMapId !== after.currentMapId) {
    diffs.push({ field: "currentMapId", before: before.currentMapId, after: after.currentMapId });
  }
  if (before.currentSceneId !== after.currentSceneId) {
    diffs.push({ field: "currentSceneId", before: before.currentSceneId, after: after.currentSceneId });
  }

  const playerBefore = JSON.stringify(before.player);
  const playerAfter = JSON.stringify(after.player);
  if (playerBefore !== playerAfter) {
    diffs.push({ field: "player", before: "<changed>", after: "<changed>" });
  }

  const flagsBefore = JSON.stringify(before.worldFlags);
  const flagsAfter = JSON.stringify(after.worldFlags);
  if (flagsBefore !== flagsAfter) {
    diffs.push({ field: "world.flags", before: "<changed>", after: "<changed>" });
  }

  if (before.uiPage !== after.uiPage) {
    diffs.push({ field: "ui.page", before: before.uiPage, after: after.uiPage });
  }

  const inquiryBefore = JSON.stringify(before.uiInquirySession);
  const inquiryAfter = JSON.stringify(after.uiInquirySession);
  if (inquiryBefore !== inquiryAfter) {
    diffs.push({ field: "ui.inquirySession", before: "<changed>", after: "<changed>" });
  }

  const jobBefore = JSON.stringify(before.uiJobSession);
  const jobAfter = JSON.stringify(after.uiJobSession);
  if (jobBefore !== jobAfter) {
    diffs.push({ field: "ui.jobSession", before: "<changed>", after: "<changed>" });
  }

  return diffs;
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function appendNestedDiffs(diffs, basePath, before, after) {
  if (before === after) return;

  const beforeIsObject = isPlainObject(before);
  const afterIsObject = isPlainObject(after);

  if (beforeIsObject && afterIsObject) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      appendNestedDiffs(diffs, `${basePath}.${key}`, before[key], after[key]);
    }
    return;
  }

  if (Array.isArray(before) || Array.isArray(after)) {
    const beforeJson = JSON.stringify(before ?? null);
    const afterJson = JSON.stringify(after ?? null);
    if (beforeJson !== afterJson) {
      diffs.push({ field: basePath, before: before ?? null, after: after ?? null });
    }
    return;
  }

  const beforeJson = JSON.stringify(before ?? null);
  const afterJson = JSON.stringify(after ?? null);
  if (beforeJson !== afterJson) {
    diffs.push({ field: basePath, before: before ?? null, after: after ?? null });
  }
}

function makeEmptyReport(options) {
  return {
    tool: "scene_walker",
    schemaVersion: 1,
    preset: options.preset,
    entryMapId: options.entry,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    options: {
      maxDepth: options.maxDepth,
      maxSteps: options.maxSteps,
      maxVisitsPerMap: options.maxVisitsPerMap,
      saveLoadCheck: options.saveLoadCheck,
      saveLoadEvery: options.saveLoadEvery
    },

    visitedMaps: [],
    visitedActions: [],
    visitedMapCount: 0,
    visitedActionCount: 0,

    entryMapActions: [],

    noopActions: [],
    transitionFailures: [],
    requiresRejected: [],
    suspiciousLoops: [],
    blockerStops: [],
    timeTruncations: [],
    sessionSummaries: [],
    saveLoadChecks: [],

    pathsSample: [],
    fatalErrors: []
  };
}

function pushOnceByKey(list, set, key, row) {
  if (set.has(key)) return;
  set.add(key);
  list.push(row);
}

async function ensureEntryMapReady(entryMapId, report) {
  await loadPlaceProfiles();
  await loadRegionData();
  await loadItemsDb();
  await initMapContentRuntime();

  const map = await loadMap(entryMapId);
  if (!map) {
    report.fatalErrors.push({
      type: "ENTRY_MAP_LOAD_FAILED",
      entryMapId,
      reason: `地图加载失败：${entryMapId}`
    });
    return null;
  }

  gameState.currentMapId = entryMapId;
  gameState.world.currentMapId = entryMapId;
  gameState.currentMap = map;
  if (isMapContentV2(map)) {
    const resolved = resolveCurrentSceneV2(gameState, map);
    gameState.currentSceneId = String(resolved?.sceneId || "") || null;
    gameState.currentScene = resolved?.scene ? { ...resolved.scene } : null;
  } else {
    gameState.currentSceneId = null;
    gameState.currentScene = null;
  }

  return map;
}

async function switchToMap(mapId) {
  const map = await loadMap(mapId);
  if (!map) return null;
  gameState.currentMapId = mapId;
  gameState.world.currentMapId = mapId;
  gameState.currentMap = map;
  if (isMapContentV2(map)) {
    const resolved = resolveCurrentSceneV2(gameState, map);
    gameState.currentSceneId = String(resolved?.sceneId || "") || null;
    gameState.currentScene = resolved?.scene ? { ...resolved.scene } : null;
  } else {
    gameState.currentSceneId = null;
    gameState.currentScene = null;
  }
  return map;
}

function normalizeWalkerActionDef(map, action) {
  if (!action || typeof action !== "object") return null;
  if (!isMapContentV2(map)) return { ...action };

  const interactionType = String(action?.type || "").trim();
  if (!interactionType) return { ...action };

  const normalized = {
    ...action,
    ui: action?.ui && typeof action.ui === "object" ? { ...action.ui } : undefined
  };

  if (interactionType === "TRANSITION") {
    const edge = resolveInteractionEdgeV2(map, action);
    normalized.kind = "TRANSITION";
    normalized.payload = {
      ...(action?.payload && typeof action.payload === "object" ? action.payload : {}),
      toMapId: String(edge?.toMapId || "").trim(),
      minutes: Number.isInteger(edge?.minutes) ? edge.minutes : 0
    };
    return normalized;
  }

  if (interactionType === "OBSERVE" || interactionType === "REST" || interactionType === "TIME_SKIP") {
    normalized.kind = "TIME_SKIP";
    normalized.payload = {
      ...(action?.payload && typeof action.payload === "object" ? action.payload : {}),
      minutes: Number.isInteger(action?.minutes)
        ? action.minutes
        : Math.max(0, Math.trunc(Number(action?.payload?.minutes || 0)))
    };
    return normalized;
  }

  return normalized;
}

function collectWalkerActions(map) {
  if (isMapContentV2(map)) {
    const resolved = resolveCurrentSceneV2(gameState, map);
    const scene = resolved?.scene || null;
    if (!scene) return [];
    return collectSceneInteractionsV2(gameState, map, scene)
      .map((interaction) => normalizeWalkerActionDef(map, interaction))
      .filter(Boolean);
  }

  return (Array.isArray(map?.actions) ? map.actions : [])
    .map((action) => normalizeWalkerActionDef(map, action))
    .filter(Boolean);
}

function collectMapActionRows(map) {
  const rows = [];
  const actions = collectWalkerActions(map);
  for (const action of actions) {
    rows.push({
      mapId: String(map?.id || ""),
      actionId: String(action?.id || ""),
      label: String(action?.ui?.label || action?.text || ""),
      text: String(action?.text || ""),
      kind: String(action?.kind || action?.type || "LEGACY")
    });
  }
  return rows;
}

function inferRequestedMinutes(actionDef) {
  const kind = String(actionDef?.kind || "");
  if (!Number.isFinite(Number(actionDef?.payload?.minutes))) return 0;
  const minutes = Math.max(0, Math.trunc(Number(actionDef.payload.minutes)));
  if (["TIME_SKIP", "TRANSITION", "MEDICAL_BILL_PAY"].includes(kind)) {
    return minutes;
  }
  return 0;
}

function evaluateRequiresEvidence(actionDef) {
  const requiresResult = actionDef?.requires
    ? evaluateRequires(gameState, actionDef.requires)
    : { ok: true, reasons: [] };

  const disabledResult = actionDef?.ui?.disabledRequires
    ? evaluateRequires(gameState, actionDef.ui.disabledRequires)
    : { ok: false, reasons: [] };

  return {
    requiresFailed: !requiresResult.ok,
    disabledMatched: !!disabledResult.ok,
    reasons: [
      ...(Array.isArray(requiresResult.reasons) ? requiresResult.reasons : []),
      ...(Array.isArray(disabledResult.reasons) ? disabledResult.reasons : [])
    ]
  };
}

async function executeActionAndAnalyze(mapId, actionDef) {
  const actionId = String(actionDef?.id || "").trim();
  const before = extractKeyState(gameState);
  const hpBefore = Number(gameState?.player?.psycho?.hp ?? 0);
  const billBefore = getBillsTotalCents(gameState);
  const beforeMapId = String(gameState.currentMapId || "");
  const beforeSceneId = String(gameState.currentSceneId || gameState.currentScene?.id || "");

  const kind = String(actionDef?.kind || "LEGACY");
  const expectedLoadTarget = kind === "TRANSITION"
    ? String(actionDef?.payload?.toMapId || "")
    : "";
  const expectedSceneTarget = kind === "TRANSITION"
    ? String(actionDef?.payload?.toSceneId || "")
    : "";
  const requestedMinutes = inferRequestedMinutes(actionDef);
  const sessionCoverage = String(actionDef?.sessionCoverage || "NONE");
  const requiresEvidence = evaluateRequiresEvidence(actionDef);

  const dispatchResult = await dispatch(actionId, {}, {
    returnReport: true,
    suppressRender: true,
    suppressFeedback: true,
    suppressDialogs: true
  });
  const dispatchOk = !!dispatchResult?.ok;
  const dispatchReport = dispatchResult?.report || null;

  const after = extractKeyState(gameState);
  const hpAfter = Number(gameState?.player?.psycho?.hp ?? 0);
  const billAfter = getBillsTotalCents(gameState);

  const diffs = computeStateDiff(before, after);
  const noopAction = dispatchOk && diffs.length === 0;

  const sysRows = Array.isArray(dispatchReport?.sysCalls) ? dispatchReport.sysCalls : [];
  const planRejection = dispatchReport?.plan?.rejection && typeof dispatchReport.plan.rejection === "object"
    ? dispatchReport.plan.rejection
    : null;
  const advanceRows = sysRows.filter((row) => row?.call?.type === "ADVANCE_TIME");

  const directTransitionFailure = !!dispatchReport?.loadMapFailed;
  const inferredTransitionFailure = kind === "TRANSITION" && (
    !dispatchOk
    || !gameState.currentMap
    || (expectedLoadTarget && String(gameState.currentMapId || "") !== expectedLoadTarget)
  );
  const transitionFailure = directTransitionFailure || inferredTransitionFailure;

  const transitionEvidenceSource = directTransitionFailure
    ? "direct:dispatch_report.loadMapFailures"
    : (inferredTransitionFailure ? "inferred:dispatch_result+map_state" : "none");

  const transitionFailureReason = transitionFailure
    ? (directTransitionFailure
      ? (dispatchReport?.errorMessage
        || dispatchReport?.loadMapFailures?.[0]?.errorMessage
        || "LOAD_MAP failed")
      : `from=${beforeMapId} expectedTarget=${expectedLoadTarget || "<none>"} current=${String(gameState.currentMapId || "<none>")} dispatchOk=${dispatchOk}`)
    : "";

  const beforeMinutes = Number(before.totalMinutes || 0);
  const afterMinutes = Number(after.totalMinutes || 0);
  const actualMinutes = Math.max(0, afterMinutes - beforeMinutes);
  const sessionStateChanged = diffs.some((row) => row?.field === "ui.inquirySession" || row?.field === "ui.jobSession");

  const directBlockedRows = advanceRows
    .map((row) => row?.result?.blockedBy)
    .filter(Boolean);

  const blockerStopsDirect = directBlockedRows.map((blocker) => ({
    mapId,
    actionId,
    blocker,
    evidenceSource: "direct:dispatch_report.sysCalls.ADVANCE_TIME.result.blockedBy"
  }));

  const inferredTimeTruncation = dispatchOk && !sessionStateChanged && directBlockedRows.length === 0 && requestedMinutes > actualMinutes
    ? {
      mapId,
      actionId,
      requestedMinutes,
      actualMinutes,
      reason: "requested_gt_actual_without_direct_blocker_marker",
      evidenceSource: "inferred:action_minutes+state_diff"
    }
    : null;

  const rejectionSource = String(planRejection?.source || "");
  const directRequiresRejected = rejectionSource === "requires" || rejectionSource === "disabledRequires";

  const inferredRequiresRejected = !directRequiresRejected
    && (requiresEvidence.requiresFailed || requiresEvidence.disabledMatched);

  const requiresRejected = directRequiresRejected || inferredRequiresRejected;
  const requiresReason = requiresRejected
    ? (directRequiresRejected
      ? [
        String(planRejection?.reason || "").trim(),
        ...(Array.isArray(planRejection?.reasons) ? planRejection.reasons.map((x) => String(x || "").trim()) : [])
      ].filter(Boolean).join(" | ")
      : (requiresEvidence.reasons.length > 0
        ? requiresEvidence.reasons.join(" | ")
        : "requires/disabledRequires rejected"))
    : "";

  const requiresEvidenceSource = directRequiresRejected
    ? "direct:dispatch_report.plan.rejection"
    : (inferredRequiresRejected ? "inferred:requires_probe" : "none");

  const directRequestedMinutes = advanceRows.reduce((sum, row) => {
    return sum + Number(row?.call?.params?.minutes ?? 0);
  }, 0);
  const directActualMinutes = advanceRows.reduce((sum, row) => {
    return sum + Number(row?.result?.advancedMinutes ?? 0);
  }, 0);

  const sessionEvidenceSource = advanceRows.length > 0
    ? "direct:dispatch_report.sysCalls.ADVANCE_TIME"
    : "inferred:action_minutes+state_diff";

  return {
    mapId,
    actionId,
    prevSceneId: beforeSceneId,
    kind,
    noopAction,
    transitionFailure,
    transitionEvidenceSource,
    requiresRejected,
    requiresReason,
    requiresEvidenceSource,
    transitionFailureReason,
    nextMapId: String(gameState.currentMapId || ""),
    nextSceneId: String(gameState.currentSceneId || gameState.currentScene?.id || expectedSceneTarget || ""),
    stateSnapshot: captureWalkerStateSnapshot(),
    diffs,
    blockerStopsDirect,
    inferredTimeTruncation,

    sessionSummary: {
      checked: sessionCoverage !== "NONE",
      mapId,
      actionId,
      requestedMinutes: advanceRows.length > 0 ? directRequestedMinutes : requestedMinutes,
      actualMinutes: advanceRows.length > 0 ? directActualMinutes : actualMinutes,
      hpDelta: Number((hpAfter - hpBefore).toFixed(3)),
      billDelta: billAfter - billBefore,
      stoppedByBlocker: directBlockedRows.length > 0,
      sessionCoverage,
      evidenceSource: sessionEvidenceSource
    }
  };
}

function compareForSaveLoad(before, loadedState) {
  const after = {
    totalMinutes: Number(loadedState?.time?.totalMinutes ?? 0),
    currentMapId: String(loadedState?.currentMapId || loadedState?.world?.currentMapId || ""),
    player: deepClone(loadedState?.player || {}),
    worldFlags: deepClone(loadedState?.world?.flags || loadedState?.flags || {})
  };

  const diffs = [];
  if (before.totalMinutes !== after.totalMinutes) {
    diffs.push({ field: "time.totalMinutes", before: before.totalMinutes, after: after.totalMinutes });
  }
  if (before.currentMapId !== after.currentMapId) {
    diffs.push({ field: "currentMapId", before: before.currentMapId, after: after.currentMapId });
  }

  appendNestedDiffs(diffs, "player", before.player, after.player);
  appendNestedDiffs(diffs, "world.flags", before.worldFlags, after.worldFlags);

  return diffs;
}

function runSaveLoadContinuityCheck(stepIndex) {
  const before = {
    totalMinutes: Number(gameState?.time?.totalMinutes ?? 0),
    currentMapId: String(gameState?.currentMapId || ""),
    player: deepClone(gameState?.player || {}),
    worldFlags: deepClone(gameState?.world?.flags || gameState?.flags || {})
  };

  const saveResult = saveManager.saveToSlot("auto", gameState);
  if (!saveResult?.ok) {
    return {
      stepIndex,
      ok: false,
      reason: saveResult?.error || "saveToSlot(auto) failed",
      diffs: []
    };
  }

  const loadResult = saveManager.loadFromSlot("auto");
  if (!loadResult?.ok) {
    return {
      stepIndex,
      ok: false,
      reason: loadResult?.error || "loadFromSlot(auto) failed",
      diffs: []
    };
  }

  const diffs = compareForSaveLoad(before, loadResult.snapshotState);
  return {
    stepIndex,
    ok: diffs.length === 0,
    reason: diffs.length === 0 ? "save-load consistent" : "save-load mismatch",
    diffs
  };
}

async function traverse(options, report) {
  const visitedMapIds = new Set();
  const visitedActionKeys = new Set();
  const pathKeys = new Set();
  const locationVisitCounts = new Map();
  const onceLoopKeys = new Set();

  const queue = [
    {
      mapId: options.entry,
      depth: 0,
      path: [options.entry],
      stateSnapshot: captureWalkerStateSnapshot()
    }
  ];

  let stepCounter = 0;

  while (queue.length > 0 && stepCounter < options.maxSteps) {
    const node = queue.shift();
    if (!node) break;

    await restoreWalkerStateSnapshot(node.stateSnapshot);

    const map = gameState.currentMap && String(gameState?.currentMap?.id || "") === String(node.mapId)
      ? gameState.currentMap
      : await switchToMap(node.mapId);
    if (!map) {
      report.fatalErrors.push({
        type: "MAP_SWITCH_FAILED",
        mapId: node.mapId,
        reason: `地图切换失败：${node.mapId}`
      });
      continue;
    }

    const currentSceneId = String(gameState.currentSceneId || gameState.currentScene?.id || "").trim();
    const locationKey = currentSceneId ? `${node.mapId}::${currentSceneId}` : node.mapId;
    const currentVisits = locationVisitCounts.get(locationKey) || 0;
    if (currentVisits >= options.maxVisitsPerMap) {
      continue;
    }

    locationVisitCounts.set(locationKey, currentVisits + 1);
    visitedMapIds.add(node.mapId);

    const pathText = node.path.join(" -> ");
    if (!pathKeys.has(pathText) && report.pathsSample.length < 40) {
      pathKeys.add(pathText);
      report.pathsSample.push(pathText);
    }

    if (node.depth > options.maxDepth) {
      continue;
    }

    const actions = collectWalkerActions(map);
    const baselineSnapshot = captureWalkerStateSnapshot();
    for (const action of actions) {
      if (stepCounter >= options.maxSteps) break;

      const actionId = String(action?.id || "").trim();
      if (!actionId) continue;

      await restoreWalkerStateSnapshot(baselineSnapshot);

      const key = `${node.mapId}::${actionId}`;
      visitedActionKeys.add(key);
      report.visitedActions.push({
        mapId: node.mapId,
        actionId,
        label: String(action?.ui?.label || action?.text || ""),
        kind: String(action?.kind || action?.type || "LEGACY")
      });

      const result = await executeActionAndAnalyze(node.mapId, action);
      stepCounter += 1;

      const isDirectRequiresRejected = result.requiresRejected
        && result.requiresEvidenceSource === "direct:dispatch_report.plan.rejection";

      if (!isDirectRequiresRejected && result.noopAction) {
        report.noopActions.push({
          mapId: node.mapId,
          actionId,
          reason: "Action executed but key states unchanged"
        });
      }

      if (!isDirectRequiresRejected && result.transitionFailure) {
        report.transitionFailures.push({
          mapId: node.mapId,
          actionId,
          reason: result.transitionFailureReason,
          evidenceSource: result.transitionEvidenceSource,
          confidence: result.transitionEvidenceSource.startsWith("direct:") ? "high" : "medium"
        });
      }

      if (result.requiresRejected) {
        report.requiresRejected.push({
          mapId: node.mapId,
          actionId,
          reason: result.requiresReason,
          evidenceSource: result.requiresEvidenceSource,
          confidence: result.requiresEvidenceSource.startsWith("direct:") ? "high" : "medium"
        });
      }

      if (result.blockerStopsDirect.length > 0) {
        report.blockerStops.push(...result.blockerStopsDirect);
      }

      if (!isDirectRequiresRejected && result.inferredTimeTruncation) {
        report.timeTruncations.push(result.inferredTimeTruncation);
      }

      if (result.sessionSummary.checked) {
        report.sessionSummaries.push(result.sessionSummary);
      }

      if (
        options.saveLoadCheck &&
        options.saveLoadEvery > 0 &&
        stepCounter % options.saveLoadEvery === 0
      ) {
        report.saveLoadChecks.push(runSaveLoadContinuityCheck(stepCounter));
      }

      const movedToMap = result.nextMapId && result.nextMapId !== node.mapId;
      const movedToScene = !movedToMap
        && !!result.nextSceneId
        && result.nextSceneId !== result.prevSceneId;
      if ((movedToMap || movedToScene) && node.depth < options.maxDepth) {
        const nextLocationLabel = movedToMap
          ? result.nextMapId
          : `${result.nextMapId}#${result.nextSceneId}`;
        const nextPath = [...node.path, `${node.mapId}:${actionId}`, nextLocationLabel];
        queue.push({
          mapId: result.nextMapId,
          depth: node.depth + 1,
          path: nextPath,
          stateSnapshot: result.stateSnapshot
        });

        // Loop heuristic: repeated map in short path + no useful state change.
        const repeatCount = nextPath.filter((x) => x === nextLocationLabel).length;
        if (repeatCount >= 2 && result.noopAction) {
          const loopKey = `${node.mapId}|${actionId}|${nextLocationLabel}`;
          pushOnceByKey(
            report.suspiciousLoops,
            onceLoopKeys,
            loopKey,
            {
              mapId: node.mapId,
              actionId,
              reason: "repeat-map-without-key-state-change",
              path: nextPath.join(" -> ")
            }
          );
        }
      }
    }
  }

  if (report.sessionSummaries.length === 0) {
    report.sessionSummaries.push({
      checked: false,
      mapId: "",
      actionId: "",
      requestedMinutes: 0,
      actualMinutes: 0,
      hpDelta: 0,
      billDelta: 0,
      stoppedByBlocker: false,
      sessionCoverage: "NONE",
      evidenceSource: "none",
      reason: "No ADVANCE_TIME/session-covered actions reached under current traversal scope"
    });
  }

  if (report.blockerStops.length === 0) {
    report.blockerStops = [];
  }

  report.visitedMaps = Array.from(visitedMapIds);
  report.visitedMapCount = visitedMapIds.size;
  report.visitedActionCount = visitedActionKeys.size;
}

async function writeReport(reportPath, report) {
  const abs = path.isAbsolute(reportPath)
    ? reportPath
    : path.resolve(REPO_ROOT, reportPath);

  const jsonText = JSON.stringify(report, null, 2).replace(/[\u0080-\uFFFF]/g, (char) => {
    const code = char.charCodeAt(0);
    return `\\u${code.toString(16).padStart(4, "0")}`;
  });

  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, jsonText, "utf8");
  return abs;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  installNodeRuntimePolyfills(REPO_ROOT);

  const report = makeEmptyReport(options);

  try {
    const entryMap = await ensureEntryMapReady(options.entry, report);

    if (entryMap) {
      report.entryMapActions = collectMapActionRows(entryMap);
      await traverse(options, report);
    }
  } catch (error) {
    report.fatalErrors.push({
      type: "UNCAUGHT_ERROR",
      reason: String(error?.message || error)
    });
  }

  report.finishedAt = new Date().toISOString();

  const reportFile = await writeReport(options.report, report);
  const summary = {
    entryMapId: report.entryMapId,
    visitedMapCount: report.visitedMapCount,
    visitedActionCount: report.visitedActionCount,
    fatalErrorCount: report.fatalErrors.length,
    reportFile
  };

  console.log("[SceneWalker] done", JSON.stringify(summary));
}

main();
