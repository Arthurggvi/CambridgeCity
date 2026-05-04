import { storage } from "./storage_local.js";
import { SAVE_KEYS } from "./save_schema.js";

export const SETTINGS_STORAGE_KEY = "CambrianCity_Settings_v1";
const LEGACY_SETTINGS_STORAGE_KEY = "CambridgeCity_Settings";

export const defaultSettings = {
  uiScale: 100,
  fontSize: "normal",
  lineSpacing: "normal",
  contrast: "standard",
  fontPolicy: "game",

  perfPreset: "balanced",
  blurMode: "low",
  reduceMotion: false,

  quickKeys: true,
  scrollBehavior: "keep",
  confirmDangerous: true,
  confirmDeleteSave: true,

  autosaveEnabled: true,
  autosaveIntervalMin: 10,
  autosaveTrigger: "interval",

  showInternalLogs: false,
  showActionId: false
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(defaultSettings));
}

function clampScale(v) {
  const n = Number(v);
  const allow = [80, 90, 100, 110, 125];
  if (!Number.isFinite(n)) return 100;
  if (allow.includes(Math.trunc(n))) return Math.trunc(n);
  return 100;
}

function clampAutosaveInterval(v) {
  const n = Number(v);
  const allow = [5, 10, 30];
  if (!Number.isFinite(n)) return 10;
  const m = Math.trunc(n);
  return allow.includes(m) ? m : 10;
}

function pickEnum(value, allow, fallback) {
  const text = String(value || "").trim();
  return allow.includes(text) ? text : fallback;
}

function pickBool(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return !!fallback;
}

function estimateStringBytes(text) {
  const src = String(text || "");
  return src.length * 2;
}

function readRawSettingsJson() {
  const current = storage.read(SETTINGS_STORAGE_KEY);
  if (typeof current === "string" && current.trim()) {
    return { raw: current, fromLegacy: false };
  }

  const legacy = storage.read(LEGACY_SETTINGS_STORAGE_KEY);
  if (typeof legacy === "string" && legacy.trim()) {
    return { raw: legacy, fromLegacy: true };
  }

  return { raw: null, fromLegacy: false };
}

function sanitizeSettings(raw) {
  const clean = cloneDefaults();
  if (!raw || typeof raw !== "object") return clean;

  clean.uiScale = clampScale(raw?.uiScale ?? raw?.display?.uiScale);
  clean.fontSize = pickEnum(raw?.fontSize ?? raw?.display?.fontSize, ["small", "normal", "large"], "normal");

  const legacyLine = raw?.lineSpacing ?? raw?.display?.lineSpacing ?? raw?.display?.lineHeight;
  clean.lineSpacing = pickEnum(legacyLine, ["tight", "normal", "loose", "compact"], "normal");
  if (clean.lineSpacing === "compact") clean.lineSpacing = "tight";

  const legacyContrast = raw?.contrast ?? raw?.display?.contrast;
  clean.contrast = pickEnum(legacyContrast, ["standard", "high", "normal"], "standard");
  if (clean.contrast === "normal") clean.contrast = "standard";

  const legacyFontPolicy = raw?.fontPolicy
    ?? (raw?.display?.fontFallback ? "system" : "game");
  clean.fontPolicy = pickEnum(legacyFontPolicy, ["game", "system"], "game");

  clean.perfPreset = pickEnum(raw?.perfPreset ?? raw?.performance?.perfPreset ?? raw?.performance?.perfMode, ["performance", "balanced", "quality"], "balanced");

  const legacyBlur = String(raw?.blurMode ?? raw?.performance?.blurMode ?? "low");
  const mappedBlur = legacyBlur === "modalOnly" ? "low" : legacyBlur;
  clean.blurMode = pickEnum(mappedBlur, ["off", "low", "full"], "low");

  clean.reduceMotion = pickBool(raw?.reduceMotion ?? raw?.performance?.reduceMotion ?? raw?.display?.reduceMotion, false);

  clean.quickKeys = pickBool(raw?.quickKeys ?? raw?.interaction?.quickKeys ?? raw?.interaction?.hotkeys, true);

  const scrollValue = raw?.scrollBehavior ?? raw?.interaction?.scrollBehavior ?? raw?.interaction?.scrollRestore;
  if (scrollValue === false || scrollValue === 0 || scrollValue === "0") {
    clean.scrollBehavior = "top";
  } else {
    clean.scrollBehavior = pickEnum(scrollValue, ["keep", "top"], "keep");
  }

  clean.confirmDangerous = pickBool(raw?.confirmDangerous ?? raw?.interaction?.confirmDangerous ?? raw?.interaction?.confirmDanger, true);
  clean.confirmDeleteSave = pickBool(raw?.confirmDeleteSave ?? raw?.interaction?.confirmDeleteSave ?? raw?.interaction?.confirmDelete, true);

  clean.autosaveEnabled = pickBool(raw?.autosaveEnabled ?? raw?.data?.autosaveEnabled ?? raw?.interaction?.autosave, true);
  const legacyPolicy = String(raw?.autosavePolicy ?? raw?.data?.autosavePolicy ?? "");
  clean.autosaveIntervalMin = clampAutosaveInterval(raw?.autosaveIntervalMin
    ?? (legacyPolicy === "5min" ? 5 : legacyPolicy === "30min" ? 30 : 10));

  const legacyTrigger = raw?.autosaveTrigger
    ?? raw?.data?.autosaveTrigger
    ?? (legacyPolicy === "milestone" ? "critical" : "interval");
  clean.autosaveTrigger = pickEnum(legacyTrigger, ["interval", "critical"], "interval");

  clean.showInternalLogs = pickBool(raw?.showInternalLogs ?? raw?.debug?.showInternalLogs, false);
  clean.showActionId = pickBool(raw?.showActionId ?? raw?.debug?.showActionId, false);

  return clean;
}

let _settingsCache = null;

export function loadSettings() {
  if (_settingsCache) return _settingsCache;

  const source = readRawSettingsJson();
  if (!source.raw) {
    _settingsCache = cloneDefaults();
    return _settingsCache;
  }

  try {
    const parsed = JSON.parse(source.raw);
    _settingsCache = sanitizeSettings(parsed);
    if (source.fromLegacy) {
      storage.write(SETTINGS_STORAGE_KEY, JSON.stringify(_settingsCache));
    }
  } catch (_err) {
    _settingsCache = cloneDefaults();
  }

  return _settingsCache;
}

export function saveSettings(patch = {}) {
  const base = loadSettings();
  const next = sanitizeSettings({ ...base, ...(patch || {}) });
  const ok = storage.write(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  if (!ok) return { ok: false, error: "设置写入失败" };
  _settingsCache = next;
  return { ok: true, settings: next };
}

export function resetDefaults() {
  _settingsCache = cloneDefaults();
  storage.remove(SETTINGS_STORAGE_KEY);
  storage.remove(LEGACY_SETTINGS_STORAGE_KEY);
  const ok = storage.write(SETTINGS_STORAGE_KEY, JSON.stringify(_settingsCache));
  if (!ok) return { ok: false, error: "恢复默认失败" };
  return { ok: true, settings: _settingsCache };
}

function getFontScalePair(fontSize) {
  if (fontSize === "small") return { body: 0.92, title: 0.9 };
  if (fontSize === "large") return { body: 1.1, title: 1.16 };
  return { body: 1, title: 1 };
}

function getLineHeight(lineSpacing) {
  if (lineSpacing === "tight") return 1.68;
  if (lineSpacing === "loose") return 2.18;
  return 1.95;
}

export function applySettings(settings = loadSettings(), doc = document) {
  const body = doc?.body;
  const root = doc?.documentElement;
  if (!body || !root) return settings;

  body.classList.add("settings-ui-scale");
  body.classList.toggle("settings-font-system", settings.fontPolicy === "system");
  body.classList.toggle("settings-contrast-high", settings.contrast === "high");
  body.classList.toggle("settings-reduce-motion", !!settings.reduceMotion);
  body.classList.toggle("settings-perf-performance", settings.perfPreset === "performance");
  body.classList.toggle("settings-perf-quality", settings.perfPreset === "quality");

  body.classList.toggle("settings-blur-off", settings.blurMode === "off");
  body.classList.toggle("settings-blur-modal-only", settings.blurMode === "low");
  body.classList.toggle("settings-blur-full", settings.blurMode === "full");

  root.style.setProperty("--ui-scale-factor", String((Number(settings.uiScale) || 100) / 100));
  const pair = getFontScalePair(settings.fontSize);
  root.style.setProperty("--font-scale-body", String(pair.body));
  root.style.setProperty("--font-scale-title", String(pair.title));
  root.style.setProperty("--text-font-size-factor", String(pair.body));
  root.style.setProperty("--text-line-height", String(getLineHeight(settings.lineSpacing)));

  body.dataset.scrollBehavior = settings.scrollBehavior;
  return settings;
}

function estimateByPrefixes(prefixes) {
  const keys = new Set();
  for (const prefix of prefixes) {
    for (const key of storage.listKeys(prefix)) {
      keys.add(key);
    }
  }
  let total = 0;
  for (const key of keys) {
    total += estimateStringBytes(key) + estimateStringBytes(storage.read(key));
  }
  return total;
}

class SettingsManager {
  getSettings() {
    return loadSettings();
  }

  saveSettings(patch) {
    return saveSettings(patch);
  }

  resetToDefaults() {
    return resetDefaults();
  }

  getStorageStats() {
    const usage = storage.getUsage();
    const settingsBytes = estimateByPrefixes([
      SETTINGS_STORAGE_KEY,
      LEGACY_SETTINGS_STORAGE_KEY,
      "FT_Settings_",
      "FT_CONFIG_"
    ]);

    const saveBytes = estimateByPrefixes([
      "CambridgeCity_Save_Slot_",
      SAVE_KEYS.metadata,
      "FT_Save_",
      "FT_SLOT_"
    ]);

    const logBytes = estimateByPrefixes([
      "CambridgeCity_Log_",
      "FT_Log_",
      "FT_LOG_"
    ]);

    return {
      usedBytes: settingsBytes + saveBytes + logBytes,
      availableBytes: usage.available,
      settingsBytes,
      saveBytes,
      logBytes,
    };
  }

  setByKey(key, value) {
    const s = this.getSettings();
    const next = JSON.parse(JSON.stringify(s));

    switch (key) {
      case "uiScale":
        next.uiScale = clampScale(value);
        break;
      case "fontSize":
        next.fontSize = pickEnum(value, ["small", "normal", "large"], s.fontSize);
        break;
      case "lineSpacing":
      case "lineHeight":
        next.lineSpacing = pickEnum(value, ["tight", "normal", "loose", "compact"], s.lineSpacing);
        if (next.lineSpacing === "compact") next.lineSpacing = "tight";
        break;
      case "contrast":
        next.contrast = pickEnum(value, ["standard", "high", "normal"], s.contrast);
        if (next.contrast === "normal") next.contrast = "standard";
        break;
      case "fontPolicy":
        next.fontPolicy = pickEnum(value, ["game", "system"], s.fontPolicy);
        break;
      case "fontFallback":
        next.fontPolicy = value ? "system" : "game";
        break;
      case "perfPreset":
      case "perfMode": {
        next.perfPreset = pickEnum(value, ["balanced", "performance", "quality"], s.perfPreset);
        if (next.perfPreset === "performance") {
          next.blurMode = "off";
          next.reduceMotion = true;
        } else if (next.perfPreset === "quality") {
          next.blurMode = "full";
          next.reduceMotion = false;
        } else {
          next.blurMode = "low";
          next.reduceMotion = false;
        }
        break;
      }
      case "blurMode":
        next.blurMode = pickEnum(value, ["off", "low", "full", "modalOnly"], s.blurMode);
        if (next.blurMode === "modalOnly") next.blurMode = "low";
        break;
      case "reduceMotion":
        next.reduceMotion = !!value;
        break;
      case "confirmDeleteSave":
      case "confirmDelete":
        next.confirmDeleteSave = !!value;
        break;
      case "confirmDangerous":
      case "confirmDanger":
        next.confirmDangerous = !!value;
        break;
      case "quickKeys":
      case "hotkeys":
        next.quickKeys = !!value;
        break;
      case "scrollBehavior":
        next.scrollBehavior = pickEnum(value, ["keep", "top"], s.scrollBehavior);
        break;
      case "scrollRestore":
        next.scrollBehavior = value ? "keep" : "top";
        break;
      case "autosaveEnabled":
      case "autosave":
        next.autosaveEnabled = !!value;
        break;
      case "autosaveIntervalMin":
        next.autosaveIntervalMin = clampAutosaveInterval(value);
        break;
      case "autosaveTrigger":
        next.autosaveTrigger = pickEnum(value, ["interval", "critical", "milestone"], s.autosaveTrigger);
        if (next.autosaveTrigger === "milestone") next.autosaveTrigger = "critical";
        break;
      case "autosavePolicy":
        if (String(value) === "milestone") {
          next.autosaveTrigger = "critical";
        } else {
          next.autosaveTrigger = "interval";
          next.autosaveIntervalMin = clampAutosaveInterval(String(value).replace("min", ""));
        }
        break;
      case "showInternalLogs":
        next.showInternalLogs = !!value;
        break;
      case "showActionId":
        next.showActionId = !!value;
        break;
      default:
        return { ok: false, error: `未知设置项: ${key}` };
    }

    return this.saveSettings(next);
  }

  toggleByKey(key) {
    const s = this.getSettings();
    switch (key) {
      case "fontPolicy":
      case "fontFallback":
        return this.setByKey("fontPolicy", s.fontPolicy === "system" ? "game" : "system");
      case "reduceMotion":
        return this.setByKey("reduceMotion", !s.reduceMotion);
      case "confirmDeleteSave":
      case "confirmDelete":
        return this.setByKey("confirmDeleteSave", !s.confirmDeleteSave);
      case "confirmDangerous":
      case "confirmDanger":
        return this.setByKey("confirmDangerous", !s.confirmDangerous);
      case "quickKeys":
      case "hotkeys":
        return this.setByKey("quickKeys", !s.quickKeys);
      case "scrollRestore":
      case "scrollBehavior":
        return this.setByKey("scrollBehavior", s.scrollBehavior === "keep" ? "top" : "keep");
      case "autosaveEnabled":
      case "autosave":
        return this.setByKey("autosaveEnabled", !s.autosaveEnabled);
      case "showInternalLogs":
        return this.setByKey("showInternalLogs", !s.showInternalLogs);
      case "showActionId":
        return this.setByKey("showActionId", !s.showActionId);
      default:
        return { ok: false, error: `未知开关项: ${key}` };
    }
  }

  applyToDocument(doc = document) {
    return applySettings(this.getSettings(), doc);
  }
}

export const settingsManager = new SettingsManager();
