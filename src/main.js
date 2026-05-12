import { gameState } from "./engine/state.js";
import { loadMap, loadItemsDb, loadRegionData, loadPlaceProfiles } from "./engine/loader.js";
import { ensureItemsDbLoaded } from "./engine/items_db.js";
import { render, renderError, UpdateTimeUI } from "./engine/renderer.js";
import { setupInteraction } from "./ui/interaction.js";
import { registerTimeSystem } from "./engine/time.js";
import { validateAllMaps } from "./engine/validation/validate_all_maps.js";
import { initMapContentRuntime } from "./engine/map_content_runtime.js";
import { initEnvironmentWeatherSystem, updateEnvironmentWeather } from "./engine/environment_weather.js";
import { BUILD } from "./version.js";
import { ensureAchievementListenerRegistration } from "./engine/achievement_listener.js";
import { setCanonicalMapContext } from "./engine/map_context.js";
import { ensureAchievementUnlockFeedbackRegistration } from "./ui/achievement_unlock_feedback.js";
import { ensureRecordUnlockFeedbackRegistration } from "./ui/record_unlock_feedback.js";
import { ensureRecordsEntryEmphasisRegistration } from "./ui/transient/sidebar_records_entry_emphasis.js";
import { ensureWinddykeThermalGuideForCurrentState } from "./ui/winddyke_thermal_intro_guide.js";
import { validateTransitData } from "./engine/transit/transit_validate.js";
import { initAchievementStore } from "./engine/achievement_store.js";
import { isReleaseBuild } from "./engine/release_flag.js";

const STARTUP_MAP_ID = "menu_main";
const HOST_MARKER_SESSION_DISMISS_KEY = "cc:hostDebugMarker:dismissed";

function shouldRunLiveInteractionAudit() {
  if (isReleaseBuild()) return false;
  try {
    return new URLSearchParams(window.location.search).get("interactionAudit") === "1";
  } catch {
    return false;
  }
}

function isBuildDebugEnabled() {
  if (isReleaseBuild()) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debugBuild") === "1") return true;
    return window.localStorage?.getItem("cc:debugBuild") === "1";
  } catch {
    return false;
  }
}

function isPrivateIpv4Host(hostname) {
  if (typeof hostname !== "string" || hostname.length === 0) return false;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  const match = /^172\.(\d{1,3})\./.exec(hostname);
  if (!match) return false;
  const second = Number(match[1]);
  return Number.isInteger(second) && second >= 16 && second <= 31;
}

function shouldShowHostMarker() {
  const { protocol, hostname } = window.location;
  if (protocol !== "http:" && protocol !== "https:") return false;
  return hostname === "127.0.0.1" || hostname === "localhost" || isPrivateIpv4Host(hostname);
}

function detectHostType() {
  try {
    const hasLiveServerInjection = Array.from(document.scripts || []).some((script) => {
      const inlineText = script?.textContent || "";
      const src = script?.getAttribute?.("src") || "";
      return (
        inlineText.includes("Code injected by live-server") ||
        inlineText.includes("IsThisFirstTime_Log_From_LiveServer") ||
        (inlineText.includes("refreshCSS") && inlineText.includes("window.location.pathname + '/ws'")) ||
        src.toLowerCase().includes("livereload")
      );
    });
    if (hasLiveServerInjection) {
      return "live-server";
    }
  } catch {
  }

  if (window.location.port === "5511") {
    return "launcher";
  }

  return "unknown";
}

function isHostMarkerDismissedForSession() {
  try {
    return window.sessionStorage?.getItem(HOST_MARKER_SESSION_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberHostMarkerDismissedForSession() {
  try {
    window.sessionStorage?.setItem(HOST_MARKER_SESSION_DISMISS_KEY, "1");
  } catch {
  }
}

function dismissHostMarker(marker) {
  rememberHostMarkerDismissedForSession();
  if (marker && marker.parentNode) {
    marker.parentNode.removeChild(marker);
  }
}

function mountHostMarker() {
  if (isReleaseBuild()) return;
  if (!shouldShowHostMarker()) return;

  if (isHostMarkerDismissedForSession()) {
    const existingMarker = document.getElementById("host-debug-marker");
    if (existingMarker && existingMarker.parentNode) {
      existingMarker.parentNode.removeChild(existingMarker);
    }
    return;
  }

  const hostType = detectHostType();
  const hostInfo = {
    hostType,
    href: window.location.href,
    baseURI: document.baseURI,
    port: window.location.port || "(default)"
  };

  window.__HOST_DIAGNOSTICS__ = hostInfo;

  let marker = document.getElementById("host-debug-marker");
  if (!marker) {
    marker = document.createElement("aside");
    marker.id = "host-debug-marker";
    marker.setAttribute("aria-label", "host diagnostics");
    marker.style.position = "fixed";
    marker.style.right = "10px";
    marker.style.bottom = "10px";
    marker.style.zIndex = "2147483647";
    marker.style.maxWidth = "min(42vw, 420px)";
    marker.style.padding = "6px 8px";
    marker.style.borderRadius = "8px";
    marker.style.background = "rgba(9, 14, 22, 0.88)";
    marker.style.border = "1px solid rgba(170, 190, 214, 0.3)";
    marker.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.24)";
    marker.style.color = "#d7e4f2";
    marker.style.font = "11px/1.45 Consolas, 'Courier New', monospace";
    marker.style.pointerEvents = "auto";
    marker.style.cursor = "pointer";
    marker.style.whiteSpace = "pre-wrap";
    marker.style.wordBreak = "break-word";
    marker.title = "点击关闭本会话调试浮层";
    marker.addEventListener("click", () => {
      dismissHostMarker(marker);
    });
    document.body.appendChild(marker);
  }

  marker.textContent = [
    `host=${hostInfo.hostType}`,
    `port=${hostInfo.port}`,
    `href=${hostInfo.href}`,
    `baseURI=${hostInfo.baseURI}`
  ].join("\n");
}

function readCssAssetVersion() {
  const cssLink = document.querySelector('link[rel="stylesheet"][href*="style.css"]');
  if (!cssLink) return null;
  try {
    const href = cssLink.getAttribute("href") || "";
    const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
    return query || null;
  } catch {
    return null;
  }
}

function publishBuildInfo() {
  const cssVersion = readCssAssetVersion();
  const buildInfo = {
    gameVersion: BUILD.gameVersion,
    saveSchemaVersion: BUILD.saveSchemaVersion,
    buildId: BUILD.buildId,
    cssVersion,
    mainScriptVersion: "20260311a",
    bootedAt: new Date().toISOString()
  };
  window.__BUILD_INFO__ = buildInfo;
  window.__CC_MAIN_SCRIPT_VERSION__ = "20260311a";
  mountHostMarker();
  document.documentElement.dataset.buildId = BUILD.buildId;
  if (cssVersion) {
    document.documentElement.dataset.cssVersion = cssVersion;
  }
  console.info("[BuildInfo]", buildInfo);
  console.info(`[CC_BUILD_OK] build=${BUILD.buildId} js=20260311a css=${cssVersion || "none"}`);

  // Minimal live verification entry for real-page console checks.
  window.ccVerifyBuild = function ccVerifyBuild() {
    const noticeHost = document.getElementById("notice-dialog-host");
    const interactionBinding = window.__CC_INTERACTION_BINDING__ || null;
    return {
      ok: true,
      buildId: BUILD.buildId,
      jsVersion: window.__CC_MAIN_SCRIPT_VERSION__ || null,
      cssVersion: cssVersion || null,
      bootedAt: buildInfo.bootedAt,
      noticeHostHidden: noticeHost ? noticeHost.getAttribute("aria-hidden") : null,
      interactionBinding
    };
  };

  if (!isBuildDebugEnabled()) return;

  let badge = document.getElementById("build-debug-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "build-debug-badge";
    badge.style.position = "fixed";
    badge.style.right = "10px";
    badge.style.bottom = "10px";
    badge.style.zIndex = "2147483647";
    badge.style.padding = "6px 8px";
    badge.style.borderRadius = "8px";
    badge.style.background = "rgba(10, 16, 24, 0.84)";
    badge.style.border = "1px solid rgba(188, 209, 230, 0.34)";
    badge.style.color = "#d7e4f2";
    badge.style.font = "12px/1.4 Consolas, 'Courier New', monospace";
    badge.style.pointerEvents = "none";
    document.body.appendChild(badge);
  }
  badge.textContent = `build ${buildInfo.buildId} | css ${cssVersion || "none"} | js ${buildInfo.mainScriptVersion}`;
}

function updateBootDebugSnapshot(stage, extra = {}) {
  window.__BOOT_DEBUG__ = {
    stage,
    currentMapId: String(gameState.currentMapId || ""),
    worldMapId: String(gameState.world?.currentMapId || ""),
    hasCurrentMap: !!gameState.currentMap,
    uiPage: String(gameState.ui?.page || ""),
    timestamp: new Date().toISOString(),
    ...extra
  };
  console.info(`[StartupTrace] stage=${stage}`, window.__BOOT_DEBUG__);
}

function isMenuMapId(mapId) {
  if (typeof mapId !== "string") return false;
  return mapId === "menu" || mapId === "menu_more" || mapId.startsWith("menu_");
}

// 注意：温度系统已被移除，按需求只实现时间系统
// import { registerSystem } from "./engine/systems.js";

/**
 * 启动游戏：加载指定地图并渲染
 * @param {string} mapId - 地图 ID
 */
async function loadAndRenderMap(mapId) {
  try {
    updateBootDebugSnapshot("load-map:start", { requestedMapId: mapId });
    const map = await loadMap(mapId);

    if (!map) {
      updateBootDebugSnapshot("load-map:missing", { requestedMapId: mapId });
      renderError(`无法加载地图：${mapId}`);
      return;
    }

    // 写入全局状态
    setCanonicalMapContext(gameState, mapId, map, "main:loadAndRenderMap");

    // 根据是否为菜单页设置样式
    const gameRoot = document.getElementById("game-root");
    if (gameRoot) {
      if (isMenuMapId(mapId)) {
        gameRoot.classList.add("menu-mode");
      } else {
        gameRoot.classList.remove("menu-mode");
      }
    }

    // 渲染
    updateBootDebugSnapshot("load-map:ready", {
      requestedMapId: mapId,
      loadedMapId: String(map.id || ""),
      loadedMapName: String(map.name || ""),
      pageType: isMenuMapId(mapId) ? "menu" : "map"
    });
    render();
    ensureWinddykeThermalGuideForCurrentState();
  } catch (error) {
    console.error("[Startup] loadAndRenderMap failed", error);
    updateBootDebugSnapshot("load-map:error", {
      requestedMapId: mapId,
      error: error?.message || String(error)
    });
    renderError(`启动失败：${error?.message || error}`);
  }
}

function assignStartupState(mapId) {
  setCanonicalMapContext(gameState, mapId, null, "main:assignStartupState");
  gameState.ui.page = "map";
  gameState.ui.overlay = null;
  updateBootDebugSnapshot("state-ready", {
    requestedMapId: mapId,
    pageType: isMenuMapId(mapId) ? "menu" : "map",
    saveBootstrap: "deferred"
  });
}

async function initializeBootResources() {
  updateBootDebugSnapshot("init:start");

  ensureRecordUnlockFeedbackRegistration();
  ensureAchievementUnlockFeedbackRegistration();
  ensureRecordsEntryEmphasisRegistration();
  ensureAchievementListenerRegistration();

  await initMapContentRuntime();
  await initEnvironmentWeatherSystem();
  await loadItemsDb();
  await ensureItemsDbLoaded();
  await loadRegionData();
  await loadPlaceProfiles();

  registerTimeSystem({
    onTimeStep(_dtHours, context) {
      updateEnvironmentWeather();
      UpdateTimeUI(context?.timeViewAfter?.minuteOfDay);
    }
  });

  const report = await validateAllMaps("data/maps/");
  const transitReport = validateTransitData();
  if (!transitReport.ok) {
    for (const issue of transitReport.issues) {
      console.error(`[ValidateTransit] ${issue.kind}: ${issue.message}`, issue);
    }
  } else {
    console.log("[ValidateTransit] ok");
  }
  window.__VALIDATION_REPORT__ = report;
  if (!gameState.world) gameState.world = {};
  if (!gameState.world.bootWarnings) gameState.world.bootWarnings = { brokenMapRefs: false, duplicateMapIds: false, parseErrors: false };
  gameState.world.bootWarnings.brokenMapRefs = report.missingTargets.length > 0;
  gameState.world.bootWarnings.duplicateMapIds = report.duplicateIds.length > 0;
  gameState.world.bootWarnings.parseErrors = report.parseErrors.length > 0;
  updateBootDebugSnapshot("resources-ready", {
    validation: {
      missingTargets: report.missingTargets.length,
      duplicateIds: report.duplicateIds.length,
      parseErrors: report.parseErrors.length
    }
  });
}

async function bootGame() {
  try {
    publishBuildInfo();
    updateBootDebugSnapshot("dom-ready");
    assignStartupState(STARTUP_MAP_ID);
    initAchievementStore({ state: gameState });
    await initializeBootResources();
    setupInteraction();
    updateBootDebugSnapshot("interaction-ready", { pageType: "menu" });
  } catch (e) {
    console.error("[Startup] 初始化异常：", e);
    if (gameState.world?.bootWarnings) {
      gameState.world.bootWarnings.parseErrors = true;
    }
    updateBootDebugSnapshot("init-error", {
      error: e?.message || String(e)
    });
    renderError(`启动失败：${e?.message || e}`);
    return;
  }

  updateBootDebugSnapshot("startup-map-assigned", { requestedMapId: STARTUP_MAP_ID });

  await loadAndRenderMap(STARTUP_MAP_ID);

  if (shouldRunLiveInteractionAudit()) {
    try {
      const { runLiveInteractionAudit } = await import("./engine/debug/live_interaction_audit.js");
      runLiveInteractionAudit();
    } catch (error) {
      console.error("[LiveInteractionAudit] failed to start", error);
    }
  }
}

// 等 DOM 加载完再启动
window.addEventListener("DOMContentLoaded", bootGame);
