import { showNoticeDialog } from "./dialogs.js";
import { gameState } from "../engine/state.js";
import { dispatch } from "../engine/pipeline/dispatch.js";
import { getDebugFloatingToolsConfig, isDebugItemToolsEnabled } from "../engine/debug/debug_floating_tools_config.js";
import { getCalendarView, getTimeView, formatTimeHHMM } from "../engine/time.js";
import { resolveTotalMinutesFromCalendarFields } from "../engine/calendar_model.js";
import {
  buildDebugItemCatalog,
  filterDebugItemCatalog,
  sanitizeDebugItemGrantQuantity
} from "../engine/debug/debug_item_tools.js";
import { buildDebugTeleportCatalog, runDebugTeleportByMapId } from "../engine/debug/debug_teleport_tools.js";
import {
  applyDebugMoneyAbsolute,
  applyDebugMoneyDelta,
  getCurrentMoneyValue
} from "../engine/debug/debug_money_tools.js";
import {
  addDebugPlayerStatDelta,
  getDebugPlayerStatSnapshot,
  normalizeDebugPlayerStatValue,
  setDebugPlayerStatValue
} from "../engine/debug/debug_player_stat_tools.js";
import {
  clampWorldviewAxis,
  getProfileDisplayLevelByXp,
  getProfileDisplayLevelMax,
  getProfileTotalXp,
  getWorldviewDisplayLevelMax,
  normalizeProfileDisplayLevelValue
} from "../engine/profile/defs.js";
import { listAchievementDefs } from "../engine/achievement_defs.js";
import {
  getAchievementState,
  lockAchievement,
  lockAllAchievements,
  unlockAchievement,
  unlockAllAchievements
} from "../engine/achievement_store.js";
import {
  getDebugPlayerStatLockSnapshot,
  setDebugPlayerStatLocked
} from "../engine/debug/debug_player_stat_locks.js";
import { ensureItemsDbLoaded } from "../engine/items_db.js";
import { getAllNpcDefinitions } from "../engine/social/npc_registry.js";
import { getPreferredSocialDossierEntryForNpcId, listSocialDossierEntriesByNpcId } from "../engine/social/dossier_entry_registry.js";
import { getRelationshipSnapshot } from "../engine/social/social_service.js";

// Debug-only floating entry migrated from sidebar quick actions.
// Add future tools by creating an adapter and adding a new section in buildPanel().

const ROOT_ID = "debug-floating-tools-root";
const PANEL_ID = "debug-floating-tools-panel";
const HOST_ID = "debug-floating-tools-host";
const POSITION_STORAGE_KEY = "cc:debugFloatingTools:position:v1";
const ACTIVE_SECTION_STORAGE_KEY = "cc:debugFloatingTools:activeSection:v1";
const DRAG_THRESHOLD_PX = 6;
const PANEL_TRANSITION_MS = 240;
const DEBUG_PANEL_SECTION_ORDER = Object.freeze([
  { id: "teleport", label: "传送" },
  { id: "money", label: "金额" },
  { id: "stats", label: "状态" },
  { id: "profile_core", label: "属性" },
  { id: "achievements", label: "成就" },
  { id: "npc", label: "NPC" },
  { id: "time", label: "时间" },
  { id: "items", label: "物品" },
  { id: "weather", label: "天气" }
]);

const DEBUG_PROFILE_LEVEL_MAX = getProfileDisplayLevelMax();
const DEBUG_WORLDVIEW_LEVEL_MAX = getWorldviewDisplayLevelMax();

function getDebugProfileCoreSnapshot() {
  const profile = gameState?.player?.profile || {};
  const physiqueLevel = normalizeProfileDisplayLevelValue(
    getProfileDisplayLevelByXp(getProfileTotalXp("physique", profile?.physique?.level, profile?.physique?.xp))
  ) ?? 0;
  const experienceLevel = normalizeProfileDisplayLevelValue(
    getProfileDisplayLevelByXp(getProfileTotalXp("experience", profile?.experience?.level, profile?.experience?.xp))
  ) ?? 0;
  const worldviewAxis = clampWorldviewAxis(profile?.worldview?.axis);
  const worldviewLevel = worldviewAxis === 0
    ? 0
    : (normalizeProfileDisplayLevelValue(getProfileDisplayLevelByXp(Math.abs(worldviewAxis))) ?? 0);
  const worldviewSide = worldviewAxis > 0 ? "rational" : (worldviewAxis < 0 ? "faith" : "neutral");
  return {
    physiqueLevel,
    experienceLevel,
    worldviewLevel,
    worldviewAxis,
    worldviewSide
  };
}

function formatDebugProfileLevelReadout(level) {
  const normalized = normalizeProfileDisplayLevelValue(level) ?? 0;
  return normalized >= DEBUG_PROFILE_LEVEL_MAX ? `Lv.EX (${normalized})` : `Lv.${normalized}`;
}

function formatDebugWorldviewAxisReadout(axis) {
  const normalized = clampWorldviewAxis(axis);
  const sideLabel = normalized > 0 ? "理性侧" : (normalized < 0 ? "信仰侧" : "中轴");
  const axisText = normalized > 0 ? `+${normalized}` : String(normalized);
  return `Axis ${axisText} · ${sideLabel}`;
}

function normalizeDebugProfileCoreInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
}

let _initialized = false;
let _panelInstance = null;
let _panelBuildCount = 0;

function clampPosition(x, y, viewportWidth, viewportHeight, width, height) {
  const minX = 8;
  const minY = 8;
  const maxX = Math.max(minX, viewportWidth - width - 8);
  const maxY = Math.max(minY, viewportHeight - height - 8);
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y))
  };
}

function savePosition(x, y) {
  try {
    window.localStorage?.setItem(POSITION_STORAGE_KEY, JSON.stringify({ x, y }));
  } catch {
    // ignore persistence errors in debug-only UI
  }
}

function readSavedPosition() {
  try {
    const raw = window.localStorage?.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const x = Number(parsed?.x);
    const y = Number(parsed?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

function saveActiveSection(sectionId) {
  try {
    window.localStorage?.setItem(ACTIVE_SECTION_STORAGE_KEY, String(sectionId || "teleport"));
  } catch {
    // ignore persistence errors in debug-only UI
  }
}

function readSavedActiveSection() {
  try {
    const raw = String(window.localStorage?.getItem(ACTIVE_SECTION_STORAGE_KEY) || "").trim();
    return raw || null;
  } catch {
    return null;
  }
}

function getDefaultPosition(buttonWidth, buttonHeight) {
  return clampPosition(
    window.innerWidth - buttonWidth - 20,
    Math.max(16, Math.round(window.innerHeight * 0.38)),
    window.innerWidth,
    window.innerHeight,
    buttonWidth,
    buttonHeight
  );
}

function prefersReducedMotion() {
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch {
    return false;
  }
}

function clearPanelTransitionTimer(panel) {
  if (panel?._visibilityTimer) {
    clearTimeout(panel._visibilityTimer);
    panel._visibilityTimer = null;
  }
}

function finishPanelClosed(root, panel) {
  clearPanelTransitionTimer(panel);
  root.classList.remove("is-open", "is-opening", "is-closing");
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
}

function finishPanelOpened(root, panel) {
  clearPanelTransitionTimer(panel);
  root.classList.add("is-open");
  root.classList.remove("is-opening", "is-closing");
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");
}

function isPanelExpanded(root) {
  return root.classList.contains("is-open") && !root.classList.contains("is-closing");
}

function setPanelOpenState(root, panel, isOpen) {
  clearPanelTransitionTimer(panel);

  if (isOpen) {
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    root.classList.add("is-open", "is-opening");
    root.classList.remove("is-closing");
    if (prefersReducedMotion()) {
      finishPanelOpened(root, panel);
      return;
    }
    window.requestAnimationFrame(() => {
      root.classList.remove("is-opening");
    });
    panel._visibilityTimer = window.setTimeout(() => {
      finishPanelOpened(root, panel);
    }, PANEL_TRANSITION_MS + 40);
    return;
  }

  if (!root.classList.contains("is-open")) {
    finishPanelClosed(root, panel);
    return;
  }

  root.classList.remove("is-opening");
  root.classList.add("is-closing");
  panel.setAttribute("aria-hidden", "true");
  if (prefersReducedMotion()) {
    finishPanelClosed(root, panel);
    return;
  }
  panel._visibilityTimer = window.setTimeout(() => {
    finishPanelClosed(root, panel);
  }, PANEL_TRANSITION_MS + 40);
}

function ensureFloatingHost() {
  let host = document.getElementById(HOST_ID);
  if (host) return host;

  host = document.createElement("div");
  host.id = HOST_ID;
  host.className = "debug-float-host";
  document.body.appendChild(host);
  return host;
}

function clampOpenPanelIntoViewport(root, panel) {
  if (!isPanelExpanded(root)) return;

  const panelRect = panel.getBoundingClientRect();
  const margin = 8;
  let dx = 0;
  let dy = 0;

  if (panelRect.right > window.innerWidth - margin) {
    dx -= panelRect.right - (window.innerWidth - margin);
  }
  if (panelRect.left < margin) {
    dx += margin - panelRect.left;
  }
  if (panelRect.bottom > window.innerHeight - margin) {
    dy -= panelRect.bottom - (window.innerHeight - margin);
  }
  if (panelRect.top < margin) {
    dy += margin - panelRect.top;
  }

  if (dx === 0 && dy === 0) return;

  const currentX = Number.parseFloat(root.style.left || "0") || 0;
  const currentY = Number.parseFloat(root.style.top || "0") || 0;
  const rootRect = root.getBoundingClientRect();
  const next = clampPosition(
    currentX + dx,
    currentY + dy,
    window.innerWidth,
    window.innerHeight,
    rootRect.width,
    rootRect.height
  );
  applyRootPosition(root, next.x, next.y);
  savePosition(next.x, next.y);
}

function triggerTransientClass(element, className, durationMs = 180) {
  if (!element) return;
  if (element._debugTransientTimer) {
    clearTimeout(element._debugTransientTimer);
    element._debugTransientTimer = null;
  }
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  if (prefersReducedMotion()) {
    element.classList.remove(className);
    return;
  }
  element._debugTransientTimer = window.setTimeout(() => {
    element.classList.remove(className);
    element._debugTransientTimer = null;
  }, Math.max(80, durationMs));
}

function createTeleportSection() {
  const section = document.createElement("section");
  section.className = "debug-float-section debug-float-section--teleport";
  section.dataset.sectionId = "teleport";

  const state = {
    loading: false,
    groups: [],
    activeGroupId: "",
    activeMapId: "",
    feedback: "",
    tone: "neutral"
  };

  const header = document.createElement("div");
  header.className = "debug-float-teleport-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "debug-float-teleport-title-wrap";

  const title = document.createElement("h4");
  title.className = "debug-float-section-title debug-float-teleport-title";
  title.textContent = "传送";
  titleWrap.appendChild(title);

  const toolbar = document.createElement("div");
  toolbar.className = "debug-float-teleport-toolbar";

  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.className = "debug-float-btn debug-float-teleport-refresh";
  refreshBtn.textContent = "刷新目录";
  toolbar.appendChild(refreshBtn);

  const summary = document.createElement("div");
  summary.className = "debug-float-teleport-summary";
  toolbar.appendChild(summary);

  header.appendChild(titleWrap);
  header.appendChild(toolbar);

  const body = document.createElement("div");
  body.className = "debug-float-teleport-body";

  const catalog = document.createElement("aside");
  catalog.className = "debug-float-teleport-catalog";

  const groupsHead = document.createElement("div");
  groupsHead.className = "debug-float-teleport-catalog-head";
  groupsHead.textContent = "目节点";

  const groups = document.createElement("div");
  groups.className = "debug-float-teleport-groups";

  const detail = document.createElement("section");
  detail.className = "debug-float-teleport-detail";

  const detailHead = document.createElement("div");
  detailHead.className = "debug-float-teleport-detail-head";

  const detailTitleWrap = document.createElement("div");
  detailTitleWrap.className = "debug-float-teleport-detail-title-wrap";

  const detailTitle = document.createElement("div");
  detailTitle.className = "debug-float-teleport-detail-title";
  detailTitleWrap.appendChild(detailTitle);

  const detailMeta = document.createElement("div");
  detailMeta.className = "debug-float-teleport-detail-meta";
  detailTitleWrap.appendChild(detailMeta);

  detailHead.appendChild(detailTitleWrap);

  const targets = document.createElement("div");
  targets.className = "debug-float-teleport-targets";

  const feedback = document.createElement("div");
  feedback.className = "debug-float-teleport-feedback";

  catalog.appendChild(groupsHead);
  catalog.appendChild(groups);
  detail.appendChild(detailHead);
  detail.appendChild(targets);
  body.appendChild(catalog);
  body.appendChild(detail);
  section.appendChild(header);
  section.appendChild(body);
  section.appendChild(feedback);

  const setFeedback = (message = "", tone = "neutral") => {
    state.feedback = String(message || "").trim();
    state.tone = tone;
    feedback.textContent = state.feedback;
    if (state.feedback) {
      feedback.dataset.tone = tone;
      feedback.hidden = false;
      return;
    }
    feedback.hidden = true;
    delete feedback.dataset.tone;
  };

  const ensureActiveGroup = () => {
    if (state.groups.some((group) => group.id === state.activeGroupId)) return;
    state.activeGroupId = state.groups[0]?.id || "";
  };

  const renderGroups = () => {
    groups.innerHTML = "";

    if (state.loading) {
      const placeholder = document.createElement("div");
      placeholder.className = "debug-float-teleport-empty";
      placeholder.textContent = "正在遍历地图链…";
      groups.appendChild(placeholder);
      return;
    }

    if (state.groups.length <= 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "debug-float-teleport-empty";
      placeholder.textContent = "未找到可传送的地图节点。";
      groups.appendChild(placeholder);
      return;
    }

    for (const group of state.groups) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "debug-float-teleport-group";
      btn.dataset.groupId = group.id;
      btn.classList.toggle("is-active", group.id === state.activeGroupId);
      btn.innerHTML = `
        <span class="debug-float-teleport-group-label">${group.label}</span>
        <span class="debug-float-teleport-group-badge">${group.nodes.length}</span>
      `;
      btn.addEventListener("click", () => {
        state.activeGroupId = group.id;
        render();
      });
      groups.appendChild(btn);
    }
  };

  const renderTargets = () => {
    targets.innerHTML = "";

    if (state.loading) {
      const placeholder = document.createElement("div");
      placeholder.className = "debug-float-teleport-empty";
      placeholder.textContent = "目录生成中…";
      targets.appendChild(placeholder);
      return;
    }

    const activeGroup = state.groups.find((group) => group.id === state.activeGroupId) || null;
    if (!activeGroup) {
      detailTitle.textContent = "未选择目节点";
      detailMeta.textContent = "";
      const placeholder = document.createElement("div");
      placeholder.className = "debug-float-teleport-empty";
      placeholder.textContent = "请选择一个目节点。";
      targets.appendChild(placeholder);
      return;
    }

    detailTitle.textContent = activeGroup.label;
    detailMeta.textContent = `${activeGroup.nodes.length}个落点`;

    for (const node of activeGroup.nodes) {
      const row = document.createElement("article");
      row.className = "debug-float-teleport-target";
      row.dataset.mapId = node.mapId;
      row.classList.toggle("is-anchor", !!node.isAnchor);

      const info = document.createElement("div");
      info.className = "debug-float-teleport-target-info";
      info.innerHTML = `
        <div class="debug-float-teleport-target-main">${node.label}</div>
        <div class="debug-float-teleport-target-sub">${node.subtitle}</div>
      `;

      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "debug-float-btn debug-float-teleport-target-action";
      actionBtn.textContent = state.activeMapId === node.mapId ? "传送中" : "传送";
      actionBtn.disabled = state.loading || state.activeMapId === node.mapId;
      actionBtn.addEventListener("click", async () => {
        state.activeMapId = node.mapId;
        render();
        const result = await runDebugTeleportByMapId(node.mapId);
        state.activeMapId = "";
        if (!result.ok) {
          render();
          await showNoticeDialog({
            title: "调试传送失败",
            message: "未能执行传送，请检查目录生成结果或目标地图数据。",
            actions: [{ id: "ok", label: "返回", kind: "primary" }]
          });
          setFeedback("传送失败：目标地图不可加载", "error");
          return;
        }
        setFeedback(`已传送到 ${result.target.label}`, "success");
        render();
      });

      row.appendChild(info);
      row.appendChild(actionBtn);
      targets.appendChild(row);
    }
  };

  const render = () => {
    ensureActiveGroup();
    refreshBtn.disabled = state.loading;
    refreshBtn.textContent = state.loading ? "刷新中…" : "刷新目录";
    summary.textContent = state.loading
      ? "扫描地图与跳转关系中"
      : `${state.groups.length}组 / ${state.groups.reduce((sum, group) => sum + group.nodes.length, 0)}个节点`;
    renderGroups();
    renderTargets();
  };

  const loadCatalog = async () => {
    if (state.loading) return;
    state.loading = true;
    setFeedback("", "neutral");
    render();
    try {
      const result = await buildDebugTeleportCatalog();
      state.groups = Array.isArray(result?.groups) ? result.groups : [];
      ensureActiveGroup();
      render();
    } catch (error) {
      state.groups = [];
      state.activeGroupId = "";
      setFeedback("目录生成失败，请检查地图目录是否可遍历", "error");
      render();
    } finally {
      state.loading = false;
      render();
    }
  };

  refreshBtn.addEventListener("click", () => {
    void loadCatalog();
  });

  section._debugTeleportRefresh = loadCatalog;
  void loadCatalog();
  return section;
}

function createMoneySection() {
  const section = document.createElement("section");
  section.className = "debug-float-section debug-float-section--money";
  section.dataset.sectionId = "money";

  const title = document.createElement("h4");
  title.className = "debug-float-section-title";
  title.textContent = "调试余额";
  section.appendChild(title);

  const moneyReadout = document.createElement("div");
  moneyReadout.className = "debug-float-money-readout";
  section.appendChild(moneyReadout);

  const inputRow = document.createElement("div");
  inputRow.className = "debug-float-money-row";

  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "0.01";
  input.className = "debug-float-money-input";
  input.placeholder = "输入余额";
  inputRow.appendChild(input);

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "debug-float-btn";
  applyBtn.textContent = "应用";
  inputRow.appendChild(applyBtn);

  section.appendChild(inputRow);

  const quickRow = document.createElement("div");
  quickRow.className = "debug-float-money-row";
  const plusBtn = document.createElement("button");
  plusBtn.type = "button";
  plusBtn.className = "debug-float-btn";
  plusBtn.textContent = "+100";
  const minusBtn = document.createElement("button");
  minusBtn.type = "button";
  minusBtn.className = "debug-float-btn";
  minusBtn.textContent = "-100";
  quickRow.appendChild(plusBtn);
  quickRow.appendChild(minusBtn);
  section.appendChild(quickRow);

  const refreshMoneyText = () => {
    const money = getCurrentMoneyValue();
    moneyReadout.textContent = `当前余额: ${money.toFixed(2)}`;
  };

  applyBtn.addEventListener("click", async () => {
    const parsed = Number(String(input.value || "").trim());
    const result = await applyDebugMoneyAbsolute(parsed);
    if (!result.ok) {
      await showNoticeDialog({
        title: "输入无效",
        message: "请输入大于等于 0 的数字。",
        actions: [{ id: "ok", label: "返回", kind: "primary" }]
      });
      return;
    }
    refreshMoneyText();
  });

  plusBtn.addEventListener("click", async () => {
    await applyDebugMoneyDelta(100);
    refreshMoneyText();
  });

  minusBtn.addEventListener("click", async () => {
    await applyDebugMoneyDelta(-100);
    refreshMoneyText();
  });

  refreshMoneyText();
  window.setInterval(refreshMoneyText, 1200);
  return section;
}

function createPlayerStatSection() {
  const section = document.createElement("section");
  section.className = "debug-float-section debug-float-section--stats";
  section.dataset.sectionId = "stats";

  const title = document.createElement("h4");
  title.className = "debug-float-section-title";
  title.textContent = "调试状态";
  section.appendChild(title);

  const statDefs = [
    {
      key: "hp",
      label: "健康",
      inputPlaceholder: "输入值",
      formatCurrent(snapshot) {
        return `${snapshot.current.toFixed(1)} / ${snapshot.max.toFixed(1)}`;
      },
      quickActions: [
        { label: "+10", mode: "delta", value: 10 },
        { label: "-10", mode: "delta", value: -10 },
        { label: "归零", mode: "absolute", value: 0 },
        { label: "充满", mode: "max" }
      ]
    },
    {
      key: "satiety",
      label: "饱腹",
      inputPlaceholder: "输入值",
      formatCurrent(snapshot) {
        return `${snapshot.current.toFixed(1)} / ${snapshot.max.toFixed(1)}`;
      },
      quickActions: [
        { label: "+10", mode: "delta", value: 10 },
        { label: "-10", mode: "delta", value: -10 },
        { label: "归零", mode: "absolute", value: 0 },
        { label: "充满", mode: "max" }
      ]
    },
    {
      key: "stamina",
      label: "体力",
      inputPlaceholder: "输入值",
      formatCurrent(snapshot) {
        return `${snapshot.current.toFixed(1)} / ${snapshot.max.toFixed(1)}`;
      },
      quickActions: [
        { label: "+10", mode: "delta", value: 10 },
        { label: "-10", mode: "delta", value: -10 },
        { label: "归零", mode: "absolute", value: 0 },
        { label: "充满", mode: "max" }
      ]
    },
    {
      key: "fatigue",
      label: "睡眠",
      inputPlaceholder: "输入值",
      formatCurrent(snapshot) {
        return `${snapshot.current.toFixed(1)} / ${snapshot.max.toFixed(1)}`;
      },
      quickActions: [
        { label: "+10", mode: "delta", value: 10 },
        { label: "-10", mode: "delta", value: -10 },
        { label: "归零", mode: "absolute", value: 0 },
        { label: "充满", mode: "max" }
      ]
    },
    {
      key: "temperature",
      label: "温度",
      inputPlaceholder: "输入°C",
      step: "0.1",
      formatCurrent(snapshot) {
        return `${snapshot.current.toFixed(1)}°C`;
      },
      quickActions: [
        { label: "+0.5", mode: "delta", value: 0.5 },
        { label: "-0.5", mode: "delta", value: -0.5 },
        { label: "35.0", mode: "absolute", value: 35 },
        { label: "37.0", mode: "absolute", value: 37 }
      ]
    }
  ];

  const rowBindings = [];

  for (const stat of statDefs) {
    const item = document.createElement("div");
    item.className = "debug-float-stat-item";

    const rowHead = document.createElement("div");
    rowHead.className = "debug-float-stat-head";

    const reading = document.createElement("div");
    reading.className = "debug-float-stat-reading";

    const label = document.createElement("div");
    label.className = "debug-float-stat-label";
    label.textContent = stat.label;
    reading.appendChild(label);

    const current = document.createElement("div");
    current.className = "debug-float-stat-current";
    current.textContent = stat.key === "temperature" ? "--.-°C" : "-- / --";
    reading.appendChild(current);

    const lockBtn = document.createElement("button");
    lockBtn.type = "button";
    lockBtn.className = "debug-float-stat-lock";
    lockBtn.innerHTML = `
      <span class="debug-float-stat-lock-label">锁定</span>
      <span class="debug-float-stat-lock-state">关</span>
    `;

    rowHead.appendChild(reading);
    rowHead.appendChild(lockBtn);

    const rowControls = document.createElement("div");
    rowControls.className = "debug-float-stat-controls";

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = stat.step || "0.1";
    input.className = "debug-float-stat-input";
    input.placeholder = stat.inputPlaceholder || "输入值";
    rowControls.appendChild(input);

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "debug-float-btn";
    applyBtn.classList.add("debug-float-btn-apply");
    applyBtn.textContent = "应用";
    rowControls.appendChild(applyBtn);

    const actions = document.createElement("div");
    actions.className = "debug-float-segmented-bar debug-float-stat-actions";

    const quickButtons = [];
    for (const actionDef of stat.quickActions) {
      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "debug-float-segmented-action";
      actionBtn.textContent = actionDef.label;
      actions.appendChild(actionBtn);
      quickButtons.push({ definition: actionDef, button: actionBtn });
    }

    item.appendChild(rowHead);
    item.appendChild(rowControls);
    item.appendChild(actions);

    rowBindings.push({
      key: stat.key,
      stat,
      current,
      input,
      applyBtn,
      lockBtn,
      quickButtons
    });

    section.appendChild(item);
  }

  const refreshStats = () => {
    for (const row of rowBindings) {
      const snapshot = getDebugPlayerStatSnapshot(row.key);
      const lockSnapshot = getDebugPlayerStatLockSnapshot(row.key);
      const lockState = row.lockBtn.querySelector(".debug-float-stat-lock-state");
      const isLocked = lockSnapshot.ok && lockSnapshot.locked === true;
      row.lockBtn.classList.toggle("is-active", isLocked);
      row.lockBtn.setAttribute("aria-pressed", isLocked ? "true" : "false");
      if (lockState) {
        lockState.textContent = isLocked ? "开" : "关";
      }

      if (!snapshot.ok) {
        row.current.textContent = row.key === "temperature" ? "--.-°C" : "-- / --";
        row.input.removeAttribute("min");
        row.input.removeAttribute("max");
        continue;
      }
      row.current.textContent = row.stat.formatCurrent(snapshot);
      if (Number.isFinite(snapshot.min)) {
        row.input.min = String(snapshot.min);
      } else {
        row.input.removeAttribute("min");
      }
      if (Number.isFinite(snapshot.max)) {
        row.input.max = String(snapshot.max);
      } else {
        row.input.removeAttribute("max");
      }
    }
  };

  const tryApplyAbsolute = async (statKey, rawValue) => {
    const normalized = normalizeDebugPlayerStatValue(statKey, rawValue);
    if (!normalized.ok) {
      await showNoticeDialog({
        title: "调试状态输入无效",
        message: "请输入可解析的数字，系统会按当前范围自动钳制。",
        actions: [{ id: "ok", label: "返回", kind: "primary" }]
      });
      return false;
    }

    const result = await setDebugPlayerStatValue(statKey, normalized.value);
    if (!result.ok) {
      await showNoticeDialog({
        title: "调试状态输入无效",
        message: "请输入可解析的数字，系统会按当前范围自动钳制。",
        actions: [{ id: "ok", label: "返回", kind: "primary" }]
      });
      return false;
    }
    refreshStats();
    return true;
  };

  const runQuickAction = async (row, actionDef) => {
    const snapshot = getDebugPlayerStatSnapshot(row.key);
    if (!snapshot.ok) return;

    if (actionDef.mode === "delta") {
      await addDebugPlayerStatDelta(row.key, Number(actionDef.value || 0));
      refreshStats();
      return;
    }

    if (actionDef.mode === "max") {
      if (!Number.isFinite(snapshot.max)) return;
      await setDebugPlayerStatValue(row.key, snapshot.max);
      refreshStats();
      return;
    }

    if (actionDef.mode === "absolute") {
      await setDebugPlayerStatValue(row.key, Number(actionDef.value || 0));
      refreshStats();
    }
  };

  for (const row of rowBindings) {
    row.applyBtn.addEventListener("click", async () => {
      const parsed = Number(String(row.input.value || "").trim());
      await tryApplyAbsolute(row.key, parsed);
    });

    row.lockBtn.addEventListener("click", () => {
      const lockSnapshot = getDebugPlayerStatLockSnapshot(row.key);
      const snapshot = getDebugPlayerStatSnapshot(row.key);
      const nextLocked = !(lockSnapshot.ok && lockSnapshot.locked === true);
      setDebugPlayerStatLocked(row.key, nextLocked, snapshot.ok ? snapshot.current : null);
      refreshStats();
    });

    for (const quick of row.quickButtons) {
      quick.button.addEventListener("click", async () => {
        await runQuickAction(row, quick.definition);
      });
    }
  }

  refreshStats();
  window.setInterval(refreshStats, 1200);
  return section;
}

function createProfileCoreSection() {
  const section = document.createElement("section");
  section.className = "debug-float-section debug-float-section--profile-core";
  section.dataset.sectionId = "profile_core";

  const title = document.createElement("h4");
  title.className = "debug-float-section-title";
  title.textContent = "核心属性调试";
  section.appendChild(title);

  const summary = document.createElement("div");
  summary.className = "debug-float-profile-core-summary";
  summary.textContent = "统一写口：debug_set_profile_core_values";
  section.appendChild(summary);

  const list = document.createElement("div");
  list.className = "debug-float-profile-core-list";
  section.appendChild(list);

  const feedback = document.createElement("div");
  feedback.className = "debug-float-item-feedback debug-float-profile-core-feedback";
  feedback.setAttribute("aria-live", "polite");
  section.appendChild(feedback);

  const state = {
    busy: false
  };

  const rowDefs = [
    {
      key: "physiqueLevel",
      label: "体格 Lv",
      inputPlaceholder: `输入 0-${DEBUG_PROFILE_LEVEL_MAX}`,
      getCurrent(snapshot) {
        return snapshot.physiqueLevel;
      },
      getCurrentText(snapshot) {
        return `当前 ${formatDebugProfileLevelReadout(snapshot.physiqueLevel)}`;
      },
      getHint() {
        return `范围 0-${DEBUG_PROFILE_LEVEL_MAX}`;
      },
      applyValue(value) {
        return { physiqueLevel: value };
      },
      actions: [
        { label: "归零", value: 0 },
        { label: "拉满", value: DEBUG_PROFILE_LEVEL_MAX }
      ]
    },
    {
      key: "experienceLevel",
      label: "阅历 Lv",
      inputPlaceholder: `输入 0-${DEBUG_PROFILE_LEVEL_MAX}`,
      getCurrent(snapshot) {
        return snapshot.experienceLevel;
      },
      getCurrentText(snapshot) {
        return `当前 ${formatDebugProfileLevelReadout(snapshot.experienceLevel)}`;
      },
      getHint() {
        return `范围 0-${DEBUG_PROFILE_LEVEL_MAX}`;
      },
      applyValue(value) {
        return { experienceLevel: value };
      },
      actions: [
        { label: "归零", value: 0 },
        { label: "拉满", value: DEBUG_PROFILE_LEVEL_MAX }
      ]
    },
    {
      key: "worldviewLevel",
      label: "世界观 Lv",
      inputPlaceholder: `输入 0-${DEBUG_WORLDVIEW_LEVEL_MAX}`,
      getCurrent(snapshot) {
        return snapshot.worldviewLevel;
      },
      getCurrentText(snapshot) {
        return `当前 ${formatDebugProfileLevelReadout(snapshot.worldviewLevel)} · ${formatDebugWorldviewAxisReadout(snapshot.worldviewAxis)}`;
      },
      getHint() {
        return `范围 0-${DEBUG_WORLDVIEW_LEVEL_MAX} · 保留当前侧，neutral 默认理性侧`;
      },
      applyValue(value) {
        return { worldviewLevel: value };
      },
      actions: [
        { label: "归零", value: 0 },
        { label: "拉满", value: DEBUG_WORLDVIEW_LEVEL_MAX }
      ]
    },
    {
      key: "worldviewAxis",
      label: "世界观 Axis",
      inputPlaceholder: "输入 -100..100",
      getCurrent(snapshot) {
        return snapshot.worldviewAxis;
      },
      getCurrentText(snapshot) {
        return `当前 ${formatDebugWorldviewAxisReadout(snapshot.worldviewAxis)}`;
      },
      getHint() {
        return "范围 -100~100 · 正=理性 / 负=信仰";
      },
      applyValue(value) {
        return { worldviewAxis: value };
      },
      actions: [
        { label: "归零", value: 0 },
        { label: "拉满理性侧", value: 100 },
        { label: "拉满信仰侧", value: -100 }
      ]
    }
  ];

  const rowBindings = [];

  const setFeedback = (message = "", tone = "neutral") => {
    const text = String(message || "").trim();
    feedback.textContent = text;
    if (text) {
      feedback.dataset.tone = tone;
      return;
    }
    delete feedback.dataset.tone;
  };

  const setBusy = (busy) => {
    state.busy = busy === true;
    section.setAttribute("aria-busy", state.busy ? "true" : "false");
  };

  const refresh = ({ seedInputs = false } = {}) => {
    const snapshot = getDebugProfileCoreSnapshot();
    for (const row of rowBindings) {
      row.current.textContent = row.definition.getCurrentText(snapshot);
      row.hint.textContent = row.definition.getHint(snapshot);
      row.input.min = row.definition.key === "worldviewAxis" ? "-100" : "0";
      row.input.max = String(row.definition.key === "worldviewLevel" ? DEBUG_WORLDVIEW_LEVEL_MAX : row.definition.key === "worldviewAxis" ? 100 : DEBUG_PROFILE_LEVEL_MAX);
      row.input.step = "1";
      if (seedInputs) {
        row.input.value = String(row.definition.getCurrent(snapshot));
      }
    }
  };

  const runPatch = async (patch, successMessage, nextInputValue = null) => {
    if (state.busy) return;
    setBusy(true);
    setFeedback("", "neutral");
    try {
      await dispatch("debug_set_profile_core_values", patch);
      refresh();
      if (nextInputValue != null) {
        const fieldKey = Object.keys(patch)[0] || "";
        const row = rowBindings.find((entry) => entry.definition.key === fieldKey) || null;
        if (row) {
          row.input.value = String(nextInputValue);
        }
      }
      setFeedback(successMessage, "success");
    } catch (error) {
      setFeedback(`调试写入失败：${error?.message || error || "unknown-error"}`, "error");
    } finally {
      setBusy(false);
    }
  };

  for (const definition of rowDefs) {
    const item = document.createElement("div");
    item.className = "debug-float-stat-item debug-float-profile-core-item";

    const head = document.createElement("div");
    head.className = "debug-float-profile-core-head";

    const reading = document.createElement("div");
    reading.className = "debug-float-stat-reading";

    const label = document.createElement("div");
    label.className = "debug-float-stat-label";
    label.textContent = definition.label;
    reading.appendChild(label);

    const current = document.createElement("div");
    current.className = "debug-float-stat-current debug-float-profile-core-current";
    reading.appendChild(current);

    const hint = document.createElement("div");
    hint.className = "debug-float-profile-core-hint";
    reading.appendChild(hint);

    head.appendChild(reading);

    const controls = document.createElement("div");
    controls.className = "debug-float-stat-controls debug-float-profile-core-controls";

    const input = document.createElement("input");
    input.type = "number";
    input.className = "debug-float-stat-input debug-float-profile-core-input";
    input.placeholder = definition.inputPlaceholder;
    controls.appendChild(input);

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "debug-float-btn debug-float-btn-apply";
    applyBtn.textContent = "应用";
    controls.appendChild(applyBtn);

    const actions = document.createElement("div");
    actions.className = "debug-float-segmented-bar debug-float-stat-actions debug-float-profile-core-actions";

    const actionButtons = [];
    for (const actionDef of definition.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "debug-float-segmented-action";
      button.textContent = actionDef.label;
      actions.appendChild(button);
      actionButtons.push({ button, definition: actionDef });
    }

    item.appendChild(head);
    item.appendChild(controls);
    item.appendChild(actions);
    list.appendChild(item);

    rowBindings.push({
      definition,
      current,
      hint,
      input,
      applyBtn,
      actionButtons
    });
  }

  for (const row of rowBindings) {
    row.applyBtn.addEventListener("click", async () => {
      const value = normalizeDebugProfileCoreInteger(String(row.input.value || "").trim());
      if (value === null) {
        setFeedback(`请输入合法整数：${row.definition.label}`, "error");
        return;
      }
      const max = row.definition.key === "worldviewLevel"
        ? DEBUG_WORLDVIEW_LEVEL_MAX
        : row.definition.key === "worldviewAxis"
          ? 100
          : DEBUG_PROFILE_LEVEL_MAX;
      const normalizedValue = row.definition.key === "worldviewAxis"
        ? clampWorldviewAxis(value)
        : Math.max(0, Math.min(max, value));
      await runPatch(
        row.definition.applyValue(normalizedValue),
        `${row.definition.label} 已写入 ${row.definition.key === "worldviewAxis" ? formatDebugWorldviewAxisReadout(normalizedValue) : normalizedValue}`,
        normalizedValue
      );
    });

    for (const action of row.actionButtons) {
      action.button.addEventListener("click", async () => {
        const nextValue = row.definition.key === "worldviewAxis"
          ? clampWorldviewAxis(action.definition.value)
          : Math.max(0, Math.min(row.definition.key === "worldviewLevel" ? DEBUG_WORLDVIEW_LEVEL_MAX : DEBUG_PROFILE_LEVEL_MAX, action.definition.value));
        await runPatch(
          row.definition.applyValue(nextValue),
          `${row.definition.label} 已写入 ${row.definition.key === "worldviewAxis" ? formatDebugWorldviewAxisReadout(nextValue) : nextValue}`,
          nextValue
        );
      });
    }
  }

  refresh({ seedInputs: true });
  window.setInterval(() => {
    if (state.busy) return;
    refresh();
  }, 1200);

  section._debugProfileCoreRefresh = () => {
    refresh();
  };

  return section;
}

function createAchievementsSection() {
  const section = document.createElement("section");
  section.className = "debug-float-section debug-float-section--achievements";
  section.dataset.sectionId = "achievements";

  const title = document.createElement("h4");
  title.className = "debug-float-section-title";
  title.textContent = "调试成就";
  section.appendChild(title);

  const toolbar = document.createElement("div");
  toolbar.className = "debug-float-achievements-toolbar";

  const unlockAllBtn = document.createElement("button");
  unlockAllBtn.type = "button";
  unlockAllBtn.className = "debug-float-btn";
  unlockAllBtn.textContent = "全部获得";

  const lockAllBtn = document.createElement("button");
  lockAllBtn.type = "button";
  lockAllBtn.className = "debug-float-btn";
  lockAllBtn.textContent = "全部锁定";

  const summary = document.createElement("div");
  summary.className = "debug-float-achievements-summary";

  toolbar.appendChild(unlockAllBtn);
  toolbar.appendChild(lockAllBtn);
  toolbar.appendChild(summary);
  section.appendChild(toolbar);

  const list = document.createElement("div");
  list.className = "debug-float-achievements-list";
  section.appendChild(list);

  const feedback = document.createElement("div");
  feedback.className = "debug-float-item-feedback debug-float-achievements-feedback";
  feedback.setAttribute("aria-live", "polite");
  section.appendChild(feedback);

  const state = {
    busy: false,
    defs: []
  };

  const setFeedback = (message = "", tone = "neutral") => {
    feedback.textContent = String(message || "").trim();
    if (feedback.textContent) {
      feedback.dataset.tone = tone;
    } else {
      delete feedback.dataset.tone;
    }
  };

  const getRows = () => {
    const achievementState = getAchievementState();
    return state.defs.map((definition) => ({
      definition,
      entry: achievementState[definition.id] || null
    }));
  };

  const render = () => {
    const rows = getRows();
    const unlockedCount = rows.filter((row) => row.entry?.unlocked === true).length;
    unlockAllBtn.disabled = state.busy || rows.length === 0 || unlockedCount === rows.length;
    lockAllBtn.disabled = state.busy || rows.length === 0 || unlockedCount === 0;
    summary.textContent = rows.length > 0
      ? `${unlockedCount} / ${rows.length} 已解锁`
      : "未发现成就定义";

    list.innerHTML = "";
    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "debug-float-teleport-empty";
      empty.textContent = "未发现正式成就定义。";
      list.appendChild(empty);
      return;
    }

    for (const row of rows) {
      const unlocked = row.entry?.unlocked === true;
      const article = document.createElement("article");
      article.className = `debug-float-achievement-card${unlocked ? " is-unlocked" : " is-locked"}`;

      const head = document.createElement("div");
      head.className = "debug-float-achievement-head";
      head.innerHTML = `
        <div class="debug-float-achievement-title-wrap">
          <div class="debug-float-achievement-title">${row.definition.title}</div>
          <div class="debug-float-achievement-subtitle">${row.definition.subtitle}</div>
        </div>
        <div class="debug-float-achievement-state" data-state="${unlocked ? "unlocked" : "locked"}">${unlocked ? "已解锁" : "未解锁"}</div>
      `;

      const meta = document.createElement("div");
      meta.className = "debug-float-achievement-meta";
      meta.innerHTML = `
        <div><span class="debug-float-achievement-meta-label">id</span><span class="debug-float-achievement-meta-value">${row.definition.id}</span></div>
        <div><span class="debug-float-achievement-meta-label">icon</span><span class="debug-float-achievement-meta-value">${String(row.definition.icon || "")}</span></div>
        <div><span class="debug-float-achievement-meta-label">时间</span><span class="debug-float-achievement-meta-value">${row.entry?.unlockedAtSystemTime || "——"}</span></div>
      `;

      const actions = document.createElement("div");
      actions.className = "debug-float-achievement-actions";

      const unlockBtn = document.createElement("button");
      unlockBtn.type = "button";
      unlockBtn.className = "debug-float-btn";
      unlockBtn.textContent = "解锁";
      unlockBtn.disabled = state.busy || unlocked;
      unlockBtn.addEventListener("click", () => {
        void runSingleAction(row.definition.id, "unlock");
      });

      const lockBtn = document.createElement("button");
      lockBtn.type = "button";
      lockBtn.className = "debug-float-btn";
      lockBtn.textContent = "锁定";
      lockBtn.disabled = state.busy || !unlocked;
      lockBtn.addEventListener("click", () => {
        void runSingleAction(row.definition.id, "lock");
      });

      actions.appendChild(unlockBtn);
      actions.appendChild(lockBtn);
      article.appendChild(head);
      article.appendChild(meta);
      article.appendChild(actions);
      list.appendChild(article);
    }
  };

  const withBusy = async (runner) => {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      await runner();
    } finally {
      state.busy = false;
      render();
    }
  };

  const runSingleAction = async (achievementId, mode) => {
    await withBusy(async () => {
      if (mode === "unlock") {
        unlockAchievement(achievementId);
        setFeedback(`已解锁 ${achievementId}`, "success");
        return;
      }
      lockAchievement(achievementId);
      setFeedback(`已锁定 ${achievementId}`, "success");
    });
  };

  unlockAllBtn.addEventListener("click", () => {
    void withBusy(async () => {
      const result = unlockAllAchievements();
      setFeedback(`已获得全部成就，共 ${result.count} 条`, "success");
    });
  });

  lockAllBtn.addEventListener("click", () => {
    void withBusy(async () => {
      const result = lockAllAchievements();
      setFeedback(`已锁定全部成就，共 ${result.count} 条`, "success");
    });
  });

  const refresh = () => {
    state.defs = listAchievementDefs();
    render();
  };

  section._debugAchievementsRefresh = refresh;
  refresh();
  return section;
}

function getInventoryQtyByItemId(itemId) {
  const normalizedItemId = String(itemId || "").trim();
  if (!normalizedItemId) return 0;
  const rows = Array.isArray(gameState?.player?.inventory) ? gameState.player.inventory : [];
  return rows.reduce((sum, row) => {
    if (String(row?.itemId || "").trim() !== normalizedItemId) return sum;
    return sum + Math.max(0, Math.floor(Number(row?.qty) || 0));
  }, 0);
}

function createItemToolsSection() {
  const section = document.createElement("section");
  section.className = "debug-float-section debug-float-item-section";
  section.dataset.sectionId = "items";

  const title = document.createElement("h4");
  title.className = "debug-float-section-title";
  title.textContent = "调试物品";
  section.appendChild(title);

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "debug-float-item-search";
  searchInput.placeholder = "搜索物品名称或 ID";
  section.appendChild(searchInput);

  const list = document.createElement("div");
  list.className = "debug-float-item-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "调试物品候选列表");
  list.tabIndex = 0;
  section.appendChild(list);

  const currentCard = document.createElement("div");
  currentCard.className = "debug-float-item-current";
  section.appendChild(currentCard);

  const actionRow = document.createElement("div");
  actionRow.className = "debug-float-item-actions";

  const qtyInput = document.createElement("input");
  qtyInput.type = "number";
  qtyInput.min = "1";
  qtyInput.step = "1";
  qtyInput.inputMode = "numeric";
  qtyInput.className = "debug-float-item-qty";
  qtyInput.value = "1";
  actionRow.appendChild(qtyInput);

  const grantBtn = document.createElement("button");
  grantBtn.type = "button";
  grantBtn.className = "debug-float-btn debug-float-item-grant";
  grantBtn.textContent = "获取";
  actionRow.appendChild(grantBtn);

  section.appendChild(actionRow);

  const feedback = document.createElement("div");
  feedback.className = "debug-float-item-feedback";
  feedback.setAttribute("aria-live", "polite");
  section.appendChild(feedback);

  const state = {
    catalog: [],
    filtered: [],
    selectedItemId: null,
    loading: true
  };

  const setFeedback = (message, tone = "neutral") => {
    feedback.textContent = String(message || "").trim();
    feedback.dataset.tone = tone;
  };

  const normalizeQtyInput = () => {
    const nextQty = sanitizeDebugItemGrantQuantity(qtyInput.value);
    qtyInput.value = String(nextQty);
    return nextQty;
  };

  const resolveSelectedItem = () => state.filtered.find((entry) => entry.id === state.selectedItemId) || null;

  const ensureValidSelection = () => {
    if (state.filtered.some((entry) => entry.id === state.selectedItemId)) return;
    state.selectedItemId = state.filtered[0]?.id || null;
  };

  const renderCurrent = () => {
    const selected = resolveSelectedItem();
    if (!selected) {
      currentCard.innerHTML = `
        <div class="debug-float-item-current-title">当前选中物品</div>
        <div class="debug-float-item-current-empty">未找到可用物品</div>
      `;
      grantBtn.disabled = true;
      triggerTransientClass(currentCard, "is-updating");
      return;
    }

    currentCard.innerHTML = `
      <div class="debug-float-item-current-title">当前选中物品</div>
      <div class="debug-float-item-current-name">${selected.name}</div>
      <div class="debug-float-item-current-id">${selected.id}</div>
      <div class="debug-float-item-current-meta">${selected.category}</div>
    `;
    grantBtn.disabled = false;
    triggerTransientClass(currentCard, "is-updating");
  };

  const renderList = () => {
    list.innerHTML = "";
    if (state.loading) {
      const placeholder = document.createElement("div");
      placeholder.className = "debug-float-item-empty";
      placeholder.textContent = "物品列表加载中...";
      list.appendChild(placeholder);
      renderCurrent();
      return;
    }

    if (state.filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "debug-float-item-empty";
      empty.textContent = "没有匹配的物品。";
      list.appendChild(empty);
      renderCurrent();
      return;
    }

    for (const entry of state.filtered) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `debug-float-item-row${entry.id === state.selectedItemId ? " is-selected" : ""}`;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", entry.id === state.selectedItemId ? "true" : "false");
      row.dataset.itemId = entry.id;
      row.tabIndex = -1;
      row.innerHTML = `
        <span class="debug-float-item-row-main">${entry.name}</span>
        <span class="debug-float-item-row-sub">${entry.id}</span>
        <span class="debug-float-item-row-tag">${entry.category}</span>
      `;
      row.addEventListener("click", () => {
        state.selectedItemId = entry.id;
        renderList();
      });
      list.appendChild(row);
    }

    renderCurrent();
  };

  const applyFilter = () => {
    state.filtered = filterDebugItemCatalog(state.catalog, searchInput.value);
    ensureValidSelection();
    renderList();
  };

  const moveSelection = (delta) => {
    if (state.filtered.length === 0) return;
    const currentIndex = Math.max(0, state.filtered.findIndex((entry) => entry.id === state.selectedItemId));
    const nextIndex = Math.max(0, Math.min(state.filtered.length - 1, currentIndex + delta));
    state.selectedItemId = state.filtered[nextIndex].id;
    renderList();
    const activeRow = list.querySelector(`.debug-float-item-row[data-item-id="${CSS.escape(state.selectedItemId)}"]`);
    activeRow?.scrollIntoView({ block: "nearest" });
  };

  const runGrant = async () => {
    const selected = resolveSelectedItem();
    if (!selected) {
      setFeedback("请先选择物品。", "error");
      return;
    }

    const qty = normalizeQtyInput();
    const beforeQty = getInventoryQtyByItemId(selected.id);
    const { dispatch } = await import("../engine/pipeline/dispatch.js");
    await dispatch(`inv_debug_gain:${selected.id}`, { qty });
    const afterQty = getInventoryQtyByItemId(selected.id);
    const toast = String(gameState?.ui?.toast || "").trim();
    if (afterQty > beforeQty) {
      setFeedback(toast || `已获取：${selected.name} × ${qty}`, "success");
      return;
    }
    setFeedback(toast || "获取失败。", "error");
  };

  searchInput.addEventListener("input", () => {
    applyFilter();
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void runGrant();
    }
  });

  list.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void runGrant();
    }
  });

  qtyInput.addEventListener("blur", () => {
    normalizeQtyInput();
  });

  qtyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void runGrant();
    }
  });

  grantBtn.addEventListener("click", () => {
    void runGrant();
  });

  const loadCatalog = async () => {
    state.loading = true;
    renderList();
    const loaded = await ensureItemsDbLoaded();
    if (!loaded.ok) {
      state.loading = false;
      state.catalog = [];
      state.filtered = [];
      setFeedback(loaded.error || "物品数据库加载失败", "error");
      renderList();
      return;
    }
    state.loading = false;
    state.catalog = buildDebugItemCatalog(loaded.byId);
    applyFilter();
  };

  loadCatalog();
  section._debugItemSearchInput = searchInput;
  section._debugItemApplyFilter = applyFilter;
  return section;
}

async function runImmediateSnowDebugAction() {
  const trigger = typeof window !== "undefined" ? window.__DEBUG_SNOW_NOW__ : null;
  if (typeof trigger !== "function") {
    await showNoticeDialog({
      title: "立即下雪不可用",
      message: "当前调试天气入口尚未注册，请先进入一次正常渲染后的游戏页。",
      actions: [{ id: "ok", label: "返回", kind: "primary" }]
    });
    return { ok: false, reason: "debug_snow_hook_unavailable" };
  }

  try {
    const result = await trigger(180);
    return result && typeof result === "object"
      ? result
      : { ok: true, before: null, after: null };
  } catch (error) {
    await showNoticeDialog({
      title: "立即下雪失败",
      message: String(error?.message || error || "unknown_debug_snow_error"),
      actions: [{ id: "ok", label: "返回", kind: "primary" }]
    });
    return {
      ok: false,
      reason: "debug_snow_action_failed",
      error: String(error?.message || error || "unknown_debug_snow_error")
    };
  }
}

export async function runImmediateSnowDebugActionForTest() {
  return runImmediateSnowDebugAction();
}

function createWeatherSection() {
  const section = document.createElement("section");
  section.className = "debug-float-section debug-float-section--weather";
  section.dataset.sectionId = "weather";

  const title = document.createElement("h4");
  title.className = "debug-float-section-title";
  title.textContent = "调试天气";
  section.appendChild(title);

  const row = document.createElement("div");
  row.className = "debug-float-money-row";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "debug-float-btn";
  button.textContent = "立即下雪";
  button.addEventListener("click", async () => {
    await runImmediateSnowDebugAction();
  });

  row.appendChild(button);
  section.appendChild(row);
  return section;
}

function createTimeSection() {
  const section = document.createElement("section");
  section.className = "debug-float-section debug-float-section--time";
  section.dataset.sectionId = "time";

  const title = document.createElement("h4");
  title.className = "debug-float-section-title";
  title.textContent = "调试时间";
  section.appendChild(title);

  const readout = document.createElement("div");
  readout.className = "debug-float-time-readout";
  readout.innerHTML = `
    <div class="debug-float-time-readout-label">当前时间</div>
    <div class="debug-float-time-readout-value">--</div>
  `;
  section.appendChild(readout);

  const fieldGrid = document.createElement("div");
  fieldGrid.className = "debug-float-time-grid";

  const createField = (labelText, placeholder, min, max) => {
    const field = document.createElement("label");
    field.className = "debug-float-time-field";

    const label = document.createElement("span");
    label.className = "debug-float-time-field-label";
    label.textContent = labelText;

    const input = document.createElement("input");
    input.type = "number";
    input.className = "debug-float-money-input debug-float-time-input";
    input.placeholder = placeholder;
    input.inputMode = "numeric";
    input.min = String(min);
    input.max = String(max);
    input.step = "1";

    field.appendChild(label);
    field.appendChild(input);
    fieldGrid.appendChild(field);
    return input;
  };

  const yearInput = createField("年", "1", 1, 9999);
  const monthInput = createField("月", "06", 1, 12);
  const dayInput = createField("日", "12", 1, 31);
  const hourInput = createField("时", "09", 0, 23);
  const minuteInput = createField("分", "15", 0, 59);
  section.appendChild(fieldGrid);

  const actionRow = document.createElement("div");
  actionRow.className = "debug-float-money-row debug-float-time-actions";

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "debug-float-btn debug-float-btn-apply";
  applyBtn.textContent = "应用";
  actionRow.appendChild(applyBtn);

  const feedback = document.createElement("div");
  feedback.className = "debug-float-item-feedback debug-float-time-feedback";
  feedback.setAttribute("aria-live", "polite");
  actionRow.appendChild(feedback);
  section.appendChild(actionRow);

  const state = {
    dirty: false,
    lastSyncedTotalMinutes: null
  };

  const readoutValue = readout.querySelector(".debug-float-time-readout-value");

  const setFeedback = (message = "", tone = "neutral") => {
    feedback.textContent = String(message || "").trim();
    if (feedback.textContent) {
      feedback.dataset.tone = tone;
    } else {
      delete feedback.dataset.tone;
    }
  };

  const formatCurrentTimeLabel = () => {
    const calendar = getCalendarView(gameState.time.totalMinutes, gameState.world);
    const timeView = getTimeView(gameState.time.totalMinutes);
    return `第${calendar.year}年 ${calendar.month}月${calendar.day}日 ${formatTimeHHMM(timeView.hour, timeView.minute)}`;
  };

  const syncDayLimit = () => {
    const monthValue = Number(monthInput.value);
    const normalizedMonth = Number.isFinite(monthValue) ? Math.max(1, Math.min(12, Math.trunc(monthValue))) : 1;
    const preview = resolveTotalMinutesFromCalendarFields(gameState.time.totalMinutes, {
      year: yearInput.value,
      month: normalizedMonth,
      day: dayInput.value,
      hour: hourInput.value,
      minute: minuteInput.value
    }, gameState.world);
    const monthLength = Number(preview?.normalized?.monthLength) || 31;
    dayInput.max = String(monthLength);
    const dayValue = Number(dayInput.value);
    if (Number.isFinite(dayValue) && dayValue > monthLength) {
      dayInput.value = String(monthLength);
    }
  };

  const syncFromGameTime = ({ forceInputs = false } = {}) => {
    readoutValue.textContent = formatCurrentTimeLabel();
    const currentTotalMinutes = Number(gameState.time.totalMinutes || 0);
    if (!forceInputs && state.dirty) return;
    if (!forceInputs && state.lastSyncedTotalMinutes === currentTotalMinutes) return;

    const calendar = getCalendarView(currentTotalMinutes, gameState.world);
    const timeView = getTimeView(currentTotalMinutes);
    yearInput.value = String(calendar.year);
    monthInput.value = String(calendar.month);
    dayInput.value = String(calendar.day);
    hourInput.value = String(timeView.hour);
    minuteInput.value = String(timeView.minute);
    dayInput.max = String(calendar.monthLength || 31);
    state.dirty = false;
    state.lastSyncedTotalMinutes = currentTotalMinutes;
  };

  const markDirty = () => {
    state.dirty = true;
    setFeedback("", "neutral");
  };

  for (const input of [yearInput, monthInput, dayInput, hourInput, minuteInput]) {
    input.addEventListener("input", () => {
      markDirty();
      if (input === monthInput || input === dayInput) {
        syncDayLimit();
      }
    });
  }

  applyBtn.addEventListener("click", async () => {
    const year = Number(String(yearInput.value || "").trim());
    const month = Number(String(monthInput.value || "").trim());
    const day = Number(String(dayInput.value || "").trim());
    const hour = Number(String(hourInput.value || "").trim());
    const minute = Number(String(minuteInput.value || "").trim());

    if (![year, month, day, hour, minute].every(Number.isFinite) || !Number.isInteger(year) || year < 1) {
      setFeedback("请输入合法的年、月、日、时、分。", "error");
      return;
    }

    const resolved = resolveTotalMinutesFromCalendarFields(gameState.time.totalMinutes, {
      year,
      month,
      day,
      hour,
      minute
    }, gameState.world);

    if (!resolved.ok) {
      const message = resolved.error === "before-world-start"
        ? "当前年份下该日期早于世界起点，无法应用。"
        : "输入无效，未写入当前时间。";
      setFeedback(message, "error");
      return;
    }

  yearInput.value = String(resolved.normalized.year);
    monthInput.value = String(resolved.normalized.month);
    dayInput.value = String(resolved.normalized.day);
    hourInput.value = String(resolved.normalized.hour);
    minuteInput.value = String(resolved.normalized.minute);
    dayInput.max = String(resolved.normalized.monthLength);

    await dispatch("debug_set_time", {
      year: resolved.normalized.year,
      month: resolved.normalized.month,
      day: resolved.normalized.day,
      hour: resolved.normalized.hour,
      minute: resolved.normalized.minute
    });

    state.dirty = false;
    state.lastSyncedTotalMinutes = null;
    syncFromGameTime({ forceInputs: true });
    setFeedback("时间已更新。", "success");
  });

  syncFromGameTime({ forceInputs: true });
  window.setInterval(() => {
    syncFromGameTime();
  }, 1200);

  section._debugTimeSync = () => {
    syncFromGameTime({ forceInputs: true });
  };

  return section;
}

function createNpcSection() {
  const section = document.createElement("section");
  section.className = "debug-float-section debug-float-section--npc";
  section.dataset.sectionId = "npc";

  const title = document.createElement("h4");
  title.className = "debug-float-section-title";
  title.textContent = "NPC";
  section.appendChild(title);

  const summary = document.createElement("div");
  summary.className = "debug-float-npc-summary";
  section.appendChild(summary);

  const body = document.createElement("div");
  body.className = "debug-float-npc-body";

  const catalog = document.createElement("aside");
  catalog.className = "debug-float-npc-catalog";
  catalog.innerHTML = `
    <div class="debug-float-npc-panel-head">注册表 NPC</div>
    <input type="search" class="debug-float-npc-search" placeholder="搜索 NPC / 人名" aria-label="搜索 NPC" spellcheck="false" />
    <div class="debug-float-npc-catalog-list"></div>
  `;

  const detail = document.createElement("section");
  detail.className = "debug-float-npc-detail";
  detail.innerHTML = `
    <div class="debug-float-npc-panel-head">调试详情</div>
    <div class="debug-float-npc-detail-body"></div>
  `;

  body.appendChild(catalog);
  body.appendChild(detail);
  section.appendChild(body);

  const feedback = document.createElement("div");
  feedback.className = "debug-float-item-feedback debug-float-npc-feedback";
  feedback.setAttribute("aria-live", "polite");
  section.appendChild(feedback);

  const catalogList = catalog.querySelector(".debug-float-npc-catalog-list");
  const catalogSearchInput = catalog.querySelector(".debug-float-npc-search");
  const detailBody = detail.querySelector(".debug-float-npc-detail-body");

  const state = {
    selectedNpcId: "",
    busy: false,
    feedback: "",
    tone: "neutral",
    searchQuery: ""
  };

  const getDefinitions = () => getAllNpcDefinitions();

  const getDisplayName = (definition) => String(definition?.profile?.displayName || definition?.id || "未命名 NPC").trim();

  const normalizeSearchText = (value) => String(value || "").trim().toLocaleLowerCase();

  const getCatalogRows = (definitions) => {
    return definitions.map((definition) => {
      const visibleName = getDisplayName(definition);
      return {
        definition,
        visibleName,
        searchText: `${visibleName}\n${definition.id}`
      };
    });
  };

  const filterCatalogRows = (rows) => {
    const query = normalizeSearchText(state.searchQuery);
    if (!query) return rows;
    return rows.filter((row) => normalizeSearchText(row.searchText).includes(query));
  };

  const getNpcFacts = (definition) => {
    const snapshot = getRelationshipSnapshot(definition.id, gameState);
    const entries = listSocialDossierEntriesByNpcId(definition.id);
    const unlockedEntryIdSet = new Set(Array.isArray(snapshot.unlockedDossierEntryIds) ? snapshot.unlockedDossierEntryIds : []);
    const unlockedCount = entries.filter((entry) => unlockedEntryIdSet.has(entry.id)).length;
    const enabledById = gameState.world?.npcs?.enabledById || {};
    const enabled = enabledById[definition.id] === true || (enabledById[definition.id] == null && definition.defaultEnabled === true);
    return {
      snapshot,
      entries,
      unlockedCount,
      enabled
    };
  };

  const ensureSelectedNpc = (rows = getCatalogRows(getDefinitions())) => {
    if (rows.some((row) => row.definition.id === state.selectedNpcId)) return;
    state.selectedNpcId = rows[0]?.definition?.id || getDefinitions()[0]?.id || "";
  };

  const setFeedback = (message = "", tone = "neutral") => {
    state.feedback = String(message || "").trim();
    state.tone = tone;
    feedback.textContent = state.feedback;
    if (state.feedback) {
      feedback.dataset.tone = tone;
      return;
    }
    delete feedback.dataset.tone;
  };

  const setBusy = (busy) => {
    state.busy = busy === true;
    section.setAttribute("aria-busy", state.busy ? "true" : "false");
  };

  const runAction = async (actionId, payload, successMessage) => {
    if (state.busy) return;
    setBusy(true);
    setFeedback("", "neutral");
    try {
      await dispatch(actionId, payload);
      render();
      setFeedback(successMessage, "success");
    } catch (error) {
      setFeedback(`调试写入失败：${error?.message || error || "unknown-error"}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const renderCatalog = (rows) => {
    catalogList.innerHTML = "";
    if (rows.length <= 0) {
      catalogList.innerHTML = '<div class="debug-float-npc-empty debug-float-npc-empty--catalog">未找到匹配 NPC</div>';
      return;
    }

    for (const rowData of rows) {
      const { definition, visibleName } = rowData;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "debug-float-npc-item";
      item.classList.toggle("is-active", definition.id === state.selectedNpcId);
      item.innerHTML = `
        <span class="debug-float-npc-item-title">${visibleName}</span>
        <span class="debug-float-npc-item-sub">${definition.id}</span>
      `;
      item.addEventListener("click", () => {
        state.selectedNpcId = definition.id;
        setFeedback("", "neutral");
        render();
      });
      catalogList.appendChild(item);
    }
  };

  const renderDetail = (definition) => {
    if (!definition) {
      detailBody.innerHTML = '<div class="debug-float-npc-empty">当前没有注册 NPC。</div>';
      return;
    }
    const facts = getNpcFacts(definition);
    const relationLabel = facts.snapshot.relationStageLabel || facts.snapshot.relationStageId || "-";
    const preferredEntry = getPreferredSocialDossierEntryForNpcId(definition.id);
    const preferredEntryUnlocked = !!preferredEntry
      && Array.isArray(facts.snapshot.unlockedDossierEntryIds)
      && facts.snapshot.unlockedDossierEntryIds.includes(preferredEntry.id);
    const discoverActionSatisfied = facts.snapshot.discovered
      && (!preferredEntry || preferredEntryUnlocked)
      && facts.snapshot.dossierFlags?.nameKnown === true;
    const discoverButtonLabel = discoverActionSatisfied ? "已发现" : "发现人物";
    const discoverSuccessMessage = preferredEntry && !preferredEntryUnlocked
      ? `已发现并解锁词条：${preferredEntry.id}`
      : `已发现：${definition.id}`;

    detailBody.innerHTML = `
      <div class="debug-float-npc-head">
        <div class="debug-float-npc-title-wrap">
          <div class="debug-float-npc-title">${getDisplayName(definition)}</div>
          <div class="debug-float-npc-subtitle">${definition.id}</div>
        </div>
        <div class="debug-float-npc-badges">
          <span class="debug-float-npc-badge">${facts.enabled ? "启用" : "停用"}</span>
          <span class="debug-float-npc-badge">${facts.snapshot.discovered ? "已发现" : "未发现"}</span>
          <button type="button" class="debug-float-btn" data-action="discover-npc" ${discoverActionSatisfied ? "disabled" : ""}>${discoverButtonLabel}</button>
        </div>
      </div>
      <div class="debug-float-npc-facts">
        <div><span class="debug-float-npc-facts-label">favor</span><span class="debug-float-npc-facts-value">${facts.snapshot.favor}</span></div>
        <div><span class="debug-float-npc-facts-label">关系</span><span class="debug-float-npc-facts-value">${relationLabel}</span></div>
        <div><span class="debug-float-npc-facts-label">词条</span><span class="debug-float-npc-facts-value">${facts.unlockedCount}/${facts.entries.length}</span></div>
      </div>
      <div class="debug-float-npc-card">
        <div class="debug-float-npc-card-head">
          <div class="debug-float-npc-card-title">favor 调试</div>
          <div class="debug-float-npc-card-sub">正式写回：debug action -> social intent -> social commit</div>
        </div>
        <div class="debug-float-money-row debug-float-npc-favor-row">
          <input type="number" class="debug-float-money-input debug-float-npc-favor-input" min="0" max="100" step="1" value="${facts.snapshot.favor}" />
          <button type="button" class="debug-float-btn" data-action="apply-favor">设定</button>
          <button type="button" class="debug-float-btn" data-action="delta-favor" data-delta="10">+10</button>
          <button type="button" class="debug-float-btn" data-action="delta-favor" data-delta="-10">-10</button>
          <button type="button" class="debug-float-btn" data-action="set-favor" data-value="0">置 0</button>
          <button type="button" class="debug-float-btn" data-action="set-favor" data-value="100">置 100</button>
        </div>
      </div>
      <div class="debug-float-npc-card">
        <div class="debug-float-npc-card-head">
          <div class="debug-float-npc-card-title">档案词条</div>
          <div class="debug-float-npc-card-actions">
            <button type="button" class="debug-float-btn" data-action="unlock-all">全部解锁</button>
            <button type="button" class="debug-float-btn" data-action="lock-all">全部锁定</button>
          </div>
        </div>
        <div class="debug-float-npc-entry-list"></div>
      </div>
    `;

    const favorInput = detailBody.querySelector(".debug-float-npc-favor-input");
    const entryList = detailBody.querySelector(".debug-float-npc-entry-list");
    const entryDefs = facts.entries;

    if (entryDefs.length <= 0) {
      entryList.innerHTML = '<div class="debug-float-npc-empty">该 NPC 当前没有注册档案词条。</div>';
    } else {
      for (const entry of entryDefs) {
        const row = document.createElement("article");
        const unlocked = Array.isArray(facts.snapshot.unlockedDossierEntryIds)
          && facts.snapshot.unlockedDossierEntryIds.includes(entry.id);
        row.className = "debug-float-npc-entry";
        row.innerHTML = `
          <div class="debug-float-npc-entry-head">
            <div class="debug-float-npc-entry-title-wrap">
              <div class="debug-float-npc-entry-title">${entry.title}</div>
              <div class="debug-float-npc-entry-sub">${entry.id} · ${entry.category} · order ${entry.order}</div>
            </div>
            <span class="debug-float-npc-entry-state" data-state="${unlocked ? "unlocked" : "locked"}">${unlocked ? "已解锁" : "已锁定"}</span>
          </div>
          <div class="debug-float-npc-entry-foot">
            <div class="debug-float-npc-entry-policy">unlockPolicy: ${entry.unlockPolicy?.mode || "-"}</div>
            <div class="debug-float-npc-entry-actions">
              <button type="button" class="debug-float-btn" data-entry-action="unlock" ${unlocked ? "disabled" : ""}>解锁</button>
              <button type="button" class="debug-float-btn" data-entry-action="lock" ${unlocked ? "" : "disabled"}>锁定</button>
            </div>
          </div>
        `;
        row.querySelector('[data-entry-action="unlock"]')?.addEventListener("click", () => {
          void runAction("debug_social_unlock_dossier_entry", {
            npcId: definition.id,
            entryId: entry.id
          }, `档案词条已解锁：${entry.id}`);
        });
        row.querySelector('[data-entry-action="lock"]')?.addEventListener("click", () => {
          void runAction("debug_social_lock_dossier_entry", {
            npcId: definition.id,
            entryId: entry.id
          }, `档案词条已锁定：${entry.id}`);
        });
        entryList.appendChild(row);
      }
    }

    detailBody.querySelector('[data-action="discover-npc"]')?.addEventListener("click", () => {
      if (discoverActionSatisfied) return;
      void runAction("debug_social_discover_npc", {
        npcId: definition.id
      }, discoverSuccessMessage);
    });

    detailBody.querySelector('[data-action="apply-favor"]')?.addEventListener("click", () => {
      const favor = Number(String(favorInput?.value || "").trim());
      if (!Number.isFinite(favor)) {
        setFeedback("favor 输入非法。", "error");
        return;
      }
      void runAction("debug_social_set_favor", {
        npcId: definition.id,
        favor
      }, `favor 已设为 ${Math.max(0, Math.min(100, Math.trunc(favor)))}`);
    });

    for (const button of detailBody.querySelectorAll('[data-action="delta-favor"]')) {
      button.addEventListener("click", () => {
        const delta = Number(button.getAttribute("data-delta"));
        void runAction("debug_social_adjust_favor", {
          npcId: definition.id,
          delta
        }, `favor 已调整 ${delta >= 0 ? "+" : ""}${delta}`);
      });
    }

    for (const button of detailBody.querySelectorAll('[data-action="set-favor"]')) {
      button.addEventListener("click", () => {
        const value = Number(button.getAttribute("data-value"));
        void runAction("debug_social_set_favor", {
          npcId: definition.id,
          favor: value
        }, `favor 已设为 ${value}`);
      });
    }

    detailBody.querySelector('[data-action="unlock-all"]')?.addEventListener("click", () => {
      void runAction("debug_social_unlock_all_dossier_entries", {
        npcId: definition.id
      }, `已解锁 ${definition.id} 全部词条`);
    });

    detailBody.querySelector('[data-action="lock-all"]')?.addEventListener("click", () => {
      void runAction("debug_social_lock_all_dossier_entries", {
        npcId: definition.id
      }, `已锁定 ${definition.id} 全部词条`);
    });
  };

  const render = () => {
    const definitions = getDefinitions();
    const catalogRows = filterCatalogRows(getCatalogRows(definitions));
    ensureSelectedNpc(catalogRows);
    const enabledCount = definitions.filter((definition) => getNpcFacts(definition).enabled).length;
    const discoveredCount = definitions.filter((definition) => getNpcFacts(definition).snapshot.discovered).length;
    summary.textContent = `注册 ${definitions.length} · 启用 ${enabledCount} · 已发现 ${discoveredCount}`;
    if (catalogSearchInput && catalogSearchInput.value !== state.searchQuery) {
      catalogSearchInput.value = state.searchQuery;
    }
    renderCatalog(catalogRows);
    renderDetail(definitions.find((definition) => definition.id === state.selectedNpcId) || null);
  };

  catalogSearchInput?.addEventListener("input", () => {
    state.searchQuery = String(catalogSearchInput.value || "").trim();
    render();
  });

  render();
  window.setInterval(() => {
    if (state.busy) return;
    render();
  }, 1500);
  section._debugNpcRefresh = render;

  return section;
}

function createPanelInstance(config) {
  _panelBuildCount += 1;

  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.className = "debug-float-panel";
  panel.setAttribute("aria-hidden", "true");

  const panelHead = document.createElement("div");
  panelHead.className = "debug-float-panel-head";
  panelHead.textContent = "Debug Tools";

  const panelBody = document.createElement("div");
  panelBody.className = "debug-float-panel-body";

  const nav = document.createElement("nav");
  nav.className = "debug-float-panel-nav";
  nav.setAttribute("aria-label", "Debug Tools 目录");

  const contentShell = document.createElement("div");
  contentShell.className = "debug-float-panel-content-shell";

  const contentScroll = document.createElement("div");
  contentScroll.className = "debug-float-panel-content-scroll";
  contentShell.appendChild(contentScroll);

  const sectionEntries = [];

  // Sub-feature switches are centralized in debug_floating_tools_config.
  if (config.enableDebugTeleport) {
    sectionEntries.push({ id: "teleport", label: "传送", element: createTeleportSection() });
  }

  if (config.enableDebugMoneyTools) {
    sectionEntries.push({ id: "money", label: "金额", element: createMoneySection() });
  }

  if (config.enableDebugPlayerStatTools) {
    sectionEntries.push({ id: "stats", label: "状态", element: createPlayerStatSection() });
  }

  sectionEntries.push({ id: "profile_core", label: "属性", element: createProfileCoreSection() });

  sectionEntries.push({ id: "achievements", label: "成就", element: createAchievementsSection() });

  sectionEntries.push({ id: "npc", label: "NPC", element: createNpcSection() });

  sectionEntries.push({ id: "time", label: "时间", element: createTimeSection() });

  if (isDebugItemToolsEnabled()) {
    sectionEntries.push({ id: "items", label: "物品", element: createItemToolsSection() });
  }

  sectionEntries.push({ id: "weather", label: "天气", element: createWeatherSection() });

  const sectionById = new Map(sectionEntries.map((entry) => [entry.id, entry]));
  const orderedSections = DEBUG_PANEL_SECTION_ORDER
    .map((row) => sectionById.get(row.id))
    .filter(Boolean);

  const instance = {
    buildCount: _panelBuildCount,
    panelRoot: panel,
    navRoot: nav,
    contentScroll,
    sectionEntries: orderedSections,
    sectionById: new Map(),
    activeSection: orderedSections[0]?.id || "teleport",
    setActiveSection: null
  };

  const savedActiveSection = readSavedActiveSection();
  if (savedActiveSection && sectionById.has(savedActiveSection)) {
    instance.activeSection = savedActiveSection;
  }

  for (const entry of orderedSections) {
    const navBtn = document.createElement("button");
    navBtn.type = "button";
    navBtn.className = "debug-float-nav-item";
    navBtn.dataset.sectionId = entry.id;
    navBtn.innerHTML = `
      <span class="debug-float-nav-accent" aria-hidden="true"></span>
      <span class="debug-float-nav-label">${entry.label}</span>
    `;
    entry.navButton = navBtn;
    instance.sectionById.set(entry.id, entry);
    navBtn.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    navBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      instance.setActiveSection?.(entry.id);
    });
    nav.appendChild(navBtn);
  }

  for (const entry of orderedSections) {
    entry.element.classList.add("debug-float-section-pane");
    contentScroll.appendChild(entry.element);
  }

  const setActiveSection = (sectionId) => {
    const nextSectionId = sectionById.has(sectionId) ? sectionId : orderedSections[0]?.id || "teleport";
    instance.activeSection = nextSectionId;
    saveActiveSection(instance.activeSection);

    for (const entry of orderedSections) {
      const isActive = entry.id === instance.activeSection;
      entry.navButton?.classList.toggle("is-active", isActive);
      entry.navButton?.setAttribute("aria-current", isActive ? "page" : "false");
      entry.element.classList.toggle("is-active", isActive);
      entry.element.hidden = !isActive;
      entry.element.setAttribute("aria-hidden", isActive ? "false" : "true");
    }

    contentScroll.scrollTop = 0;
    const activeEntry = instance.sectionById.get(instance.activeSection);
    if (typeof activeEntry?.element?._debugTeleportRefresh === "function") {
      void activeEntry.element._debugTeleportRefresh();
    }
    if (typeof activeEntry?.element?._debugAchievementsRefresh === "function") {
      activeEntry.element._debugAchievementsRefresh();
    }
    if (typeof activeEntry?.element?._debugProfileCoreRefresh === "function") {
      activeEntry.element._debugProfileCoreRefresh();
    }
    if (typeof activeEntry?.element?._debugNpcRefresh === "function") {
      activeEntry.element._debugNpcRefresh();
    }
    if (typeof activeEntry?.element?._debugTimeSync === "function") {
      activeEntry.element._debugTimeSync();
    }
  };

  instance.setActiveSection = setActiveSection;
  panel._setActiveSection = setActiveSection;
  panel._debugPanelInstance = instance;

  panelBody.appendChild(nav);
  panelBody.appendChild(contentShell);

  panel.appendChild(panelHead);
  panel.appendChild(panelBody);
  setActiveSection(instance.activeSection);
  return instance;
}

function getOrCreatePanelInstance(config) {
  if (_panelInstance?.panelRoot) return _panelInstance;
  _panelInstance = createPanelInstance(config);
  return _panelInstance;
}

function applyRootPosition(root, x, y) {
  root.style.left = `${Math.round(x)}px`;
  root.style.top = `${Math.round(y)}px`;
}

function initializeDrag(root, button, panel, onOpenPanel) {
  let dragging = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  let suppressClick = false;

  const getRootRect = () => {
    const rect = root.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    originX = Number.parseFloat(root.style.left || "0") || 0;
    originY = Number.parseFloat(root.style.top || "0") || 0;
    dragging = false;
    suppressClick = false;
    button.setPointerCapture(pointerId);
  });

  button.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      dragging = true;
      root.classList.add("is-dragging");
      suppressClick = true;
      setPanelOpenState(root, panel, false);
    }
    if (!dragging) return;

    const rect = getRootRect();
    const next = clampPosition(
      originX + dx,
      originY + dy,
      window.innerWidth,
      window.innerHeight,
      rect.width,
      rect.height
    );
    applyRootPosition(root, next.x, next.y);
  });

  button.addEventListener("pointerup", (event) => {
    if (pointerId !== event.pointerId) return;
    if (dragging) {
      const rect = getRootRect();
      const x = Number.parseFloat(root.style.left || "0") || 0;
      const y = Number.parseFloat(root.style.top || "0") || 0;
      const clamped = clampPosition(x, y, window.innerWidth, window.innerHeight, rect.width, rect.height);
      applyRootPosition(root, clamped.x, clamped.y);
      savePosition(clamped.x, clamped.y);
    } else {
      const isOpen = isPanelExpanded(root);
      setPanelOpenState(root, panel, !isOpen);
      if (!isOpen && typeof onOpenPanel === "function") {
        onOpenPanel();
      }
    }

    root.classList.remove("is-dragging");
    pointerId = null;
    dragging = false;
  });

  button.addEventListener("pointercancel", () => {
    root.classList.remove("is-dragging");
    pointerId = null;
    dragging = false;
  });

  button.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  });
}

export function setupDebugFloatingTools() {
  if (_initialized) return;

  const config = getDebugFloatingToolsConfig();
  if (!config.enableDebugFloatingTools) {
    _initialized = true;
    return;
  }

  if (document.getElementById(ROOT_ID)) {
    _initialized = true;
    return;
  }

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "debug-float-root";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "debug-float-toggle";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "打开调试工具");
  button.textContent = "DEBUG";

  const panelInstance = getOrCreatePanelInstance(config);
  const panel = panelInstance.panelRoot;

  root.appendChild(button);
  root.appendChild(panel);
  ensureFloatingHost().appendChild(root);

  const rootRect = root.getBoundingClientRect();
  const saved = readSavedPosition();
  const initial = saved
    ? clampPosition(saved.x, saved.y, window.innerWidth, window.innerHeight, rootRect.width, rootRect.height)
    : getDefaultPosition(rootRect.width, rootRect.height);
  applyRootPosition(root, initial.x, initial.y);

  const syncExpanded = () => {
    button.setAttribute("aria-expanded", isPanelExpanded(root) ? "true" : "false");
  };

  const closePanel = () => {
    setPanelOpenState(root, panel, false);
    syncExpanded();
  };

  const onOpenPanel = () => {
    window.requestAnimationFrame(() => {
      clampOpenPanelIntoViewport(root, panel);
    });
  };

  const openStateObserver = new MutationObserver(syncExpanded);
  openStateObserver.observe(root, { attributes: true, attributeFilter: ["class"] });

  initializeDrag(root, button, panel, onOpenPanel);

  window.addEventListener("pointerdown", (event) => {
    if (!isPanelExpanded(root)) return;
    if (root.contains(event.target)) return;
    closePanel();
  }, true);

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closePanel();
  });

  window.addEventListener("resize", () => {
    const rect = root.getBoundingClientRect();
    const clamped = clampPosition(rect.left, rect.top, window.innerWidth, window.innerHeight, rect.width, rect.height);
    applyRootPosition(root, clamped.x, clamped.y);
    clampOpenPanelIntoViewport(root, panel);
    savePosition(clamped.x, clamped.y);
  });

  _initialized = true;
}

export function getDebugFloatingToolsRuntimeSnapshotForTest() {
  const itemEntry = _panelInstance?.sectionById?.get("items") || null;
  return {
    buildCount: _panelBuildCount,
    hasPanelInstance: !!_panelInstance,
    activeSection: String(_panelInstance?.activeSection || ""),
    sectionIds: Array.isArray(_panelInstance?.sectionEntries)
      ? _panelInstance.sectionEntries.map((entry) => entry.id)
      : [],
    itemSearchValue: String(itemEntry?.element?._debugItemSearchInput?.value || "")
  };
}

export function setDebugFloatingToolsActiveSectionForTest(sectionId) {
  _panelInstance?.setActiveSection?.(sectionId);
  return getDebugFloatingToolsRuntimeSnapshotForTest();
}

export function setDebugFloatingToolsItemSearchForTest(value) {
  const itemEntry = _panelInstance?.sectionById?.get("items") || null;
  const input = itemEntry?.element?._debugItemSearchInput || null;
  if (!input) return getDebugFloatingToolsRuntimeSnapshotForTest();
  input.value = String(value || "");
  if (typeof itemEntry.element._debugItemApplyFilter === "function") {
    itemEntry.element._debugItemApplyFilter();
  }
  return getDebugFloatingToolsRuntimeSnapshotForTest();
}
