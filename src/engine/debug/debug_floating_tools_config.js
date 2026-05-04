function safeWindow(windowObj) {
  if (windowObj) return windowObj;
  if (typeof window === "undefined") return null;
  return window;
}

function parseBooleanLike(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "off") return false;
  return null;
}

function canUseDebugDefaults(win) {
  if (!win || !win.location) return false;
  const protocol = String(win.location.protocol || "").toLowerCase();
  const host = String(win.location.hostname || "").toLowerCase();
  if (protocol === "file:") return true;
  return host === "localhost" || host === "127.0.0.1" || host === "";
}

function readQueryFlag(win, key) {
  if (!win || !key) return null;
  try {
    const value = new URLSearchParams(String(win.location?.search || "")).get(key);
    return parseBooleanLike(value);
  } catch {
    return null;
  }
}

function readStorageFlag(win, key) {
  if (!win || !key) return null;
  try {
    return parseBooleanLike(win.localStorage?.getItem(key));
  } catch {
    return null;
  }
}

function resolveFlag(win, { queryKey, storageKey, defaultValue }) {
  const queryValue = readQueryFlag(win, queryKey);
  if (queryValue !== null) return queryValue;
  const storageValue = readStorageFlag(win, storageKey);
  if (storageValue !== null) return storageValue;
  return !!defaultValue;
}

export function getDebugFloatingToolsConfig(windowObj) {
  const win = safeWindow(windowObj);
  const defaultMainEnabled = canUseDebugDefaults(win);

  const enableDebugFloatingTools = resolveFlag(win, {
    queryKey: "debugTools",
    storageKey: "cc:debugFloatingTools",
    defaultValue: defaultMainEnabled
  });

  const enableDebugTeleport = enableDebugFloatingTools && resolveFlag(win, {
    queryKey: "debugTeleport",
    storageKey: "cc:debugTeleport",
    defaultValue: true
  });

  const enableDebugMoneyTools = enableDebugFloatingTools && resolveFlag(win, {
    queryKey: "debugMoneyTools",
    storageKey: "cc:debugMoneyTools",
    defaultValue: true
  });

  const enableDebugPlayerStatTools = enableDebugFloatingTools && resolveFlag(win, {
    queryKey: "debugPlayerStatTools",
    storageKey: "cc:debugPlayerStatTools",
    defaultValue: true
  });

  const enableDebugItemTools = enableDebugFloatingTools && resolveFlag(win, {
    queryKey: "debugItemTools",
    storageKey: "cc:debugItemTools",
    defaultValue: true
  });

  return {
    enableDebugFloatingTools,
    enableDebugTeleport,
    enableDebugMoneyTools,
    enableDebugPlayerStatTools,
    enableDebugItemTools
  };
}

export function isDebugItemToolsEnabled(windowObj) {
  return getDebugFloatingToolsConfig(windowObj).enableDebugItemTools === true;
}
