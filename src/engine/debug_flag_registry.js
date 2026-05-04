const DEBUG_FLAG_DEFS = Object.freeze({
  sceneTextPacingDiagnostic: {
    scope: "audit-only",
    legacyWindowKey: "__SCENE_TEXT_PACING_DIAGNOSTIC__",
    localStorageKey: "sceneTextFxDiagnostic"
  },
  sceneTextDomProbe: {
    scope: "dev-only",
    legacyWindowKey: "__SCENE_TEXT_DOM_PROBE__",
    localStorageKey: "sceneTextDomProbe"
  },
  sceneTextDomLocator: {
    scope: "dev-only",
    legacyWindowKey: "__SCENE_TEXT_DOM_LOCATOR__",
    localStorageKey: "sceneTextDomLocator"
  },
  sceneTextHostAudit: {
    scope: "audit-only",
    legacyWindowKey: "__SCENE_TEXT_HOST_AUDIT__",
    localStorageKey: "sceneTextHostAudit"
  },
  sceneTextFxDebug: {
    scope: "dev-only",
    legacyWindowKey: "__SCENE_TEXT_PACING_DEBUG__",
    localStorageKey: "sceneTextFxDebug"
  }
});

function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

function canUseDevFlags(win) {
  if (!win || !win.location) return false;
  const host = String(win.location.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "";
}

function readFromStorage(win, key) {
  if (!win || !key) return false;
  try {
    const value = win.localStorage?.getItem(key);
    return value === "1" || value === "true";
  } catch {
    return false;
  }
}

export function readDebugFlag(name, options = {}) {
  const def = DEBUG_FLAG_DEFS[name];
  if (!def) return false;

  const win = options.windowObj || safeWindow();
  if (!win) return false;

  const allowDev = canUseDevFlags(win);
  if (def.scope === "dev-only" && !allowDev) return false;
  if (def.scope === "audit-only" && !(allowDev || options.allowAuditInNonDev === true)) return false;

  if (def.legacyWindowKey && win[def.legacyWindowKey] === true) return true;
  return readFromStorage(win, def.localStorageKey);
}

export function listDebugFlagDefs() {
  return DEBUG_FLAG_DEFS;
}

export function getDebugFlagSnapshot() {
  const out = {};
  for (const key of Object.keys(DEBUG_FLAG_DEFS)) {
    out[key] = readDebugFlag(key);
  }
  return out;
}
