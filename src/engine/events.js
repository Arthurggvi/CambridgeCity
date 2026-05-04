import { gameState, migrateOldState, replaceGameState } from "./state.js";
import { loadMap, loadEvent } from "./loader.js";
import { render, renderError } from "./renderer.js";
import { showConfirmDialog, showInputDialog, showNoticeDialog } from "../ui/dialogs.js";
import { advanceTimeMinutes, getTimeView } from "./time.js";
import { applyStarterKitToPlayer, applyTimeToPlayer, createDefaultPlayerState } from "./player.js";
import { saveManager } from "../save/save_manager.js";
import { getCanonicalMapId, setCanonicalMapContext } from "./map_context.js";
import { syncAchievementMirrorFromStore } from "./achievement_store.js";

async function copyTextWithFallback(text) {
  const raw = String(text || "");
  if (!raw) return { ok: false, message: "无可复制内容" };

  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(raw);
      return { ok: true, message: "已复制到剪贴板" };
    } catch {
      // 回退到 textarea 方案
    }
  }

  try {
    const old = document.querySelector("textarea[data-temp-smoke-copy='1']");
    if (old) old.remove();

    const textarea = document.createElement("textarea");
    textarea.value = raw;
    textarea.dataset.tempSmokeCopy = "1";
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "12px";
    textarea.style.bottom = "12px";
    textarea.style.width = "min(560px, calc(100vw - 24px))";
    textarea.style.height = "120px";
    textarea.style.zIndex = "10050";
    textarea.style.opacity = "0.01";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }

    if (!copied) {
      return { ok: false, message: "已选中文本，请按 Ctrl+C 复制", manualCopy: true };
    }
    textarea.remove();
    return { ok: true, message: "已复制到剪贴板" };
  } finally {
    // 手动复制路径下故意保留 textarea 与选区，避免在提示前丢失 Ctrl+C 上下文。
  }
}

// ============================================================================
// 自动存档（每24小时）
// ============================================================================

/**
 * 检查并执行自动保存（每24小时一次）
 */
function checkAndAutoSave() {
  const currentDay = Math.floor(gameState.time.totalMinutes / 1440) + 1;
  const lastAutoSaveDay = gameState.meta.lastAutoSaveDay || 0;
  
  // 如果当前天数比上次自动保存的天数大，执行自动保存
  if (currentDay > lastAutoSaveDay) {
    const result = saveManager.saveToSlot("auto", gameState);
    if (result.ok) {
      gameState.meta.lastAutoSaveDay = currentDay;
      console.log(`[自动存档] Day ${currentDay} 已自动保存`);
    } else {
      console.error(`[自动存档] 保存失败：${result.error}`);
    }
  }
}

// ============================================================================
// 旧的自动存档节流器（已废弃）
// ============================================================================
let autoSaveTimer = null;
const AUTO_SAVE_DELAY = 500; // 500ms 节流

/**
 * 自动存档（带节流）- 已废弃，改用 checkAndAutoSave
 * @param {boolean} immediate - 是否立即保存（跳过节流）
 */
function autoSave(immediate = false) {
  // 如果没有设置槽位，默认使用槽位 1
  const slotId = gameState.meta?.saveSlotId || 1;
  
  if (immediate) {
    // 立即保存
    const result = saveManager.saveToSlot(slotId, gameState);
    if (result.ok) {
      console.log(`[自动存档] 保存成功到槽位 ${slotId}`);
      gameState.meta.saveSlotId = slotId;
    } else {
      console.error(`[自动存档] 保存失败：${result.error}`);
    }
    return;
  }
  
  // 节流：取消之前的定时器
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  
  // 设置新定时器
  autoSaveTimer = setTimeout(() => {
    const result = saveManager.saveToSlot(slotId, gameState);
    if (result.ok) {
      console.log(`[自动存档] 保存成功到槽位 ${slotId}`);
      gameState.meta.saveSlotId = slotId;
    } else {
      console.error(`[自动存档] 保存失败：${result.error}`);
    }
    autoSaveTimer = null;
  }, AUTO_SAVE_DELAY);
}

/**
 * 玩家点击某个动作时调用
 * @param {string} actionId - 按钮上的 data-action-id
 */
export async function onAction(actionId) {
  // v0.3 管线架构：统一走 dispatch
  // dispatch 会自动处理：
  // - 全局操作（new_game, continue_game, show_more_menu, go_back, save/load/delete）
  // - 地图操作（从 currentMap.actions 读取，或走 LEGACY）
  // - 结构化报告生成
  // - 防重入
  // - 自动保存
  const { dispatch } = await import("./pipeline/dispatch.js");
  await dispatch(actionId, {});
}

/**
 * 供 commit 的 LOAD_EVENT syscall 调用：按 eventId 运行事件
 * 注意：这是过渡期桥接。事件系统内部仍会直接修改 gameState。
 *
 * @param {string} eventId
 * @returns {Promise<{ok: boolean, didNavigate?: boolean, error?: string}>}
 */
export async function runEventById(eventId) {
  const id = String(eventId ?? "").trim();
  if (!id) return { ok: false, error: "eventId 为空" };

  const ev = await loadEvent(id);
  if (!ev) return { ok: false, error: `事件加载失败：${id}` };

  const didNavigate = await runEvent(ev);
  return { ok: true, didNavigate };
}

/**
 * 执行一个事件（v0.2 最小解释器：steps 顺序执行）
 * @param {object} ev
 * @returns {Promise<boolean>} 是否发生了地图跳转
 */
async function runEvent(ev) {
  if (!ev || !Array.isArray(ev.steps)) {
    renderError("事件格式错误：缺少 steps[]");
    return false;
  }

  // 事件执行上下文：用于在 steps 间传递临时变量
  const ctx = {
    vars: {
      // 本次事件中“最后一次时间推进的小时数”
      deltaHours: 0
    }
  };

  let didNavigate = false;

  for (const step of ev.steps) {
    if (!step || !step.type) {
      console.warn("跳过无效 step：", step);
      continue;
    }

    // 每个 step handler 返回 true 表示“已跳图/需要终止或已发生导航”
    const r = await runStep(step, ctx);
    if (r === true) {
      didNavigate = true;
      // v0.2：发生跳图后一般可以停止继续执行后续 steps
      // 如果你未来需要“跳图后继续执行”，再引入 allowContinue 等字段
      break;
    }
  }

  return didNavigate;
}

/**
 * 执行单个 step
 * @param {object} step
 * @param {object} ctx
 * @returns {Promise<boolean|void>}
 */
async function runStep(step, ctx) {
  switch (step.type) {
    case "advance_time":
      await handleAdvanceTime(step, ctx);
      return;

    case "alert":
      await handleAlert(step, ctx);
      return;

    case "log":
      handleLog(step, ctx);
      return;

    case "set_flag":
      handleSetFlag(step, ctx);
      return;

    case "goto_map":
      return await handleGotoMap(step, ctx);

    default:
      console.warn("未知 step.type：", step.type, step);
      return;
  }
}

/**
 * step: advance_time
 * 支持：
 * - mode="prompt_int"：弹 prompt 输入整数，并裁剪到范围
 * - mode="random_int"：闭区间随机整数
 * - mode="fixed"：固定值
 * - unit: "hours" | "minutes"（默认 hours）
 */
async function handleAdvanceTime(step, ctx) {
  const unit = step.unit || "hours";
  const min = Number.isFinite(Number(step.minHours)) ? Math.trunc(Number(step.minHours)) : 0;
  const max = Number.isFinite(Number(step.maxHours)) ? Math.trunc(Number(step.maxHours)) : 0;

  // 逐步边界：保证 lo <= hi
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);

  let deltaHours = lo;

  if (step.mode === "prompt_int") {
    const raw = await showInputDialog({
      title: "输入时间",
      message: `输入要消磨的小时数（${lo}–${hi}）`,
      defaultValue: String(lo),
      placeholder: `${lo}-${hi}`,
      confirmLabel: "确认",
      cancelLabel: "取消"
    });
    const n = Number(raw);

    // NaN -> lo；然后裁剪
    deltaHours = Number.isFinite(n) ? Math.trunc(n) : lo;
    if (deltaHours < lo) deltaHours = lo;
    if (deltaHours > hi) deltaHours = hi;
  } else if (step.mode === "random_int") {
    // 闭区间随机整数
    const range = (hi - lo + 1);
    deltaHours = lo + Math.floor(Math.random() * range);
  } else {
    // mode="fixed" 或默认
    deltaHours = lo;
  }

  // 转换为分钟
  const deltaMinutes = unit === "minutes" ? deltaHours : deltaHours * 60;

  // 调用唯一时间推进入口
  const timeResult = advanceTimeMinutes(deltaMinutes, "advance_time step", null);
  const advancedMinutes = Number(timeResult?.advancedMinutes ?? deltaMinutes);

  // 更新上下文变量
  const tv = getTimeView();
  ctx.vars.deltaMinutes = advancedMinutes;
  ctx.vars.deltaHours = (advancedMinutes / 60).toFixed(1);
  ctx.vars.day = tv.day;
  ctx.vars.hour = tv.hour;
  ctx.vars.minute = tv.minute;
  ctx.vars.totalMinutes = tv.totalMinutes;
}

/**
 * step: alert
 * 支持模板变量：
 * {deltaHours} {deltaMinutes} {day} {hour} {minute} {totalMinutes} {tCore} {hypo} {tEnv}
 */
async function handleAlert(step, ctx) {
  const tv = getTimeView();

  const vars = {
    deltaHours: ctx?.vars?.deltaHours ?? 0,
    deltaMinutes: ctx?.vars?.deltaMinutes ?? 0,
    day: tv.day,
    hour: tv.hour,
    minute: tv.minute,
    totalMinutes: tv.totalMinutes,
    tCore: gameState.player.tCore.toFixed(2),
    hypo: gameState.player.hypo.toFixed(1),
    hypoStage: gameState.player.hypoStage,
    tEnv: gameState.world.tEnv.toFixed(2)
  };

  const text = formatTemplate(String(step.text ?? ""), vars);
  await showNoticeDialog({
    title: "通知",
    message: text,
    actions: [{ id: "ok", label: "返回", kind: "primary" }]
  });
}

/**
 * step: log
 * 把文本塞进 gameState.logLines（未来 renderer 可以渲染出来）
 */
function handleLog(step, ctx) {
  const tv = getTimeView();
  const vars = {
    deltaHours: ctx?.vars?.deltaHours ?? 0,
    deltaMinutes: ctx?.vars?.deltaMinutes ?? 0,
    day: tv.day,
    hour: tv.hour,
    minute: tv.minute,
    totalMinutes: tv.totalMinutes,
    tCore: gameState.player.tCore.toFixed(2),
    hypo: gameState.player.hypo.toFixed(1),
    hypoStage: gameState.player.hypoStage,
    tEnv: gameState.world.tEnv.toFixed(2)
  };

  const line = formatTemplate(String(step.text ?? ""), vars);
  gameState.logLines.push(line);
}

/**
 * step: set_flag
 * { "type":"set_flag", "key":"xxx", "value":true }
 */
function handleSetFlag(step, ctx) {
  const key = String(step.key ?? "").trim();
  if (!key) {
    console.warn("set_flag 缺少 key：", step);
    return;
  }
  gameState.flags[key] = step.value;
}

/**
 * step: goto_map
 * { "type":"goto_map", "mapId":"start" }
 * 可选：nodeId（v0.2 先占位，不强制）
 */
async function handleGotoMap(step, ctx) {
  const mapId = String(step.mapId ?? "").trim();
  if (!mapId) {
    renderError("goto_map 缺少 mapId");
    return false;
  }

  const next = await loadMap(mapId);
  if (!next) {
    renderError(`地图加载失败：${mapId}`);
    return false;
  }

  setCanonicalMapContext(gameState, mapId, next, "events:handleGotoMap");

  render();
  return true;
}

/**
 * 极简模板替换：把 {key} 替换成 vars[key]
 * @param {string} tpl
 * @param {Record<string, any>} vars
 */
function formatTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => {
    if (Object.prototype.hasOwnProperty.call(vars, k)) return String(vars[k]);
    return `{${k}}`;
  });
}

/**
 * 旧硬编码逻辑：保留你原来 start/look/door 的行为，避免老内容立刻报废
 * （等你把 start.json 的 actions 全加上 eventId 后，可以删掉这个函数）
 * 
 * @export 供 commit.js 的 LEGACY syscall 调用
 */
export async function runLegacyAction(actionId) {
  // runLegacyAction 从 gameState 读取 currentMap
  const map = gameState.currentMap;
  if (!map) {
    console.error("[runLegacyAction] currentMap 不存在");
    return;
  }
  return await runLegacyHardcoded(map, actionId);
}

/**
 * 内部实现：硬编码逻辑
 */
async function runLegacyHardcoded(map, actionId) {
  if (actionId === "run_temp_smoke_tests") {
    const { runTempSmokeTests } = await import("./debug/temp_smoke_tests.js");
    const result = await runTempSmokeTests();
    if (!gameState.debug || typeof gameState.debug !== "object") {
      gameState.debug = { lastTempSmokeReport: null };
    }
    if (!gameState.ui || typeof gameState.ui !== "object") {
      gameState.ui = { page: "game" };
    }
    gameState.debug.lastTempSmokeReport = result.report;
    gameState.ui.modal = "TEMP_SMOKE_REPORT";
    render();
    return;
  }

  if (actionId === "close_temp_smoke_report") {
    if (gameState.ui && typeof gameState.ui === "object") {
      gameState.ui.modal = null;
    }
    render();
    return;
  }

  if (actionId === "temp_smoke_copy_summary") {
    const { getTempSmokeSummaryText } = await import("./debug/temp_smoke_tests.js");
    const text = getTempSmokeSummaryText(gameState.debug?.lastTempSmokeReport);
    const copied = await copyTextWithFallback(text);
    if (copied.manualCopy) return;
    await showNoticeDialog({
      title: "温度冒烟测试",
      message: copied.message,
      actions: [{ id: "ok", label: "返回", kind: "primary" }]
    });
    return;
  }

  if (actionId === "temp_smoke_copy_json") {
    const { getTempSmokeJsonText } = await import("./debug/temp_smoke_tests.js");
    const text = getTempSmokeJsonText(gameState.debug?.lastTempSmokeReport);
    const copied = await copyTextWithFallback(text);
    if (copied.manualCopy) return;
    await showNoticeDialog({
      title: "温度冒烟测试",
      message: copied.message,
      actions: [{ id: "ok", label: "返回", kind: "primary" }]
    });
    return;
  }

  if (actionId === "temp_smoke_append_log") {
    const report = gameState.debug?.lastTempSmokeReport;
    if (!report) {
      await showNoticeDialog({
        title: "温度冒烟测试",
        message: "没有可追加的测试报告。",
        actions: [{ id: "ok", label: "返回", kind: "primary" }]
      });
      return;
    }
    if (!Array.isArray(gameState.logLines)) gameState.logLines = [];
    gameState.logLines.push(`[TEMP_SMOKE_REPORT] ${JSON.stringify(report)}`);
    await showNoticeDialog({
      title: "温度冒烟测试",
      message: "完整 JSON 已追加到 logLines。",
      actions: [{ id: "ok", label: "返回", kind: "primary" }]
    });
    return;
  }

  if (typeof actionId === "string" && actionId.startsWith("temp_smoke_copy_case_json:")) {
    const report = gameState.debug?.lastTempSmokeReport;
    const index = parseInt(actionId.slice("temp_smoke_copy_case_json:".length), 10);
    const row = Array.isArray(report?.cases) ? report.cases[index] : null;
    const copied = await copyTextWithFallback(row ? JSON.stringify(row, null, 2) : "");
    if (copied.manualCopy) return;
    await showNoticeDialog({
      title: "温度冒烟测试",
      message: copied.message,
      actions: [{ id: "ok", label: "返回", kind: "primary" }]
    });
    return;
  }

  // 导出存档
  if (actionId === "export_save") {
    const slotIdStr = await showInputDialog({
      title: "导出存档",
      message: "请输入要导出的槽位号（1-3）：",
      defaultValue: "1",
      placeholder: "1-3",
      confirmLabel: "导出",
      cancelLabel: "取消"
    });
    if (slotIdStr) {
      const slotId = parseInt(slotIdStr, 10);
      if (slotId >= 1 && slotId <= 3) {
        console.log(`[事件] 导出槽位 ${slotId}`);
        const result = saveManager.exportSlot(slotId);
        console.log(`[事件] 导出结果:`, result);
        if (result.ok) {
          // 创建下载链接
          const blob = new Blob([result.jsonString], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `CambridgeCity_Save_Slot${slotId}_${new Date().toISOString().slice(0,10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
          await showNoticeDialog({
            title: "导出存档",
            message: `✅ 导出成功！\n槽位 ${slotId} 已导出为 JSON 文件`,
            actions: [{ id: "ok", label: "返回", kind: "primary" }]
          });
        } else {
          await showNoticeDialog({
            title: "导出存档",
            message: `❌ 导出失败：${result.error}`,
            actions: [{ id: "ok", label: "返回", kind: "primary" }]
          });
        }
      }
    }
    return;
  }
  
  // 导入存档
  if (actionId === "import_save") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        const text = await file.text();
        const slotIdStr = await showInputDialog({
          title: "导入存档",
          message: "请输入要导入到的槽位号（1-3）：",
          defaultValue: "1",
          placeholder: "1-3",
          confirmLabel: "导入",
          cancelLabel: "取消"
        });
        if (slotIdStr) {
          const slotId = parseInt(slotIdStr, 10);
          if (slotId >= 1 && slotId <= 3) {
            console.log(`[事件] 导入到槽位 ${slotId}`);
            const result = saveManager.importToSlot(slotId, text);
            console.log(`[事件] 导入结果:`, result);
            if (result.ok) {
              await showNoticeDialog({
                title: "导入存档",
                message: `✅ 导入成功！\n已导入到槽位 ${slotId}`,
                actions: [{ id: "ok", label: "返回", kind: "primary" }]
              });
              render(); // 刷新显示
            } else {
              await showNoticeDialog({
                title: "导入存档",
                message: `❌ 导入失败：${result.error}`,
                actions: [{ id: "ok", label: "返回", kind: "primary" }]
              });
            }
          }
        }
      }
    };
    input.click();
    return;
  }

  // start 地图的旧逻辑示例
  if (map.id === "start") {
    if (actionId === "look") {
      await showNoticeDialog({
        title: "观察",
        message: "你环顾四周：墙角堆着旧毛毯，窗沿结霜，空气里有铁锈和潮气。",
        actions: [{ id: "ok", label: "返回", kind: "primary" }]
      });
      return;
    }

    if (actionId === "door") {
      await showNoticeDialog({
        title: "门",
        message: "门把手冻得发冷。你试着用力推了推——这将来会通向下一个场景。",
        actions: [{ id: "ok", label: "返回", kind: "primary" }]
      });
      return;
    }
  }

  console.warn("未处理的动作：", actionId, "当前地图：", map.id);
}

// ============================================================================
// 存档加载
// ============================================================================

/**
 * 从指定槽位加载游戏
 * @param {string|number} slotId - 槽位ID
 */
async function loadFromSlot(slotId) {
  console.log(`[事件] 加载槽位 ${slotId}`);
  const result = saveManager.loadFromSlot(slotId);
  console.log(`[事件] 加载结果:`, result);
  
  if (!result.ok) {
    // 为空的自动存档提供友好提示
    if (slotId === "auto" && result.error.includes("存档不存在")) {
      await showNoticeDialog({
        title: "读档",
        message: `❌ 自动存档为空\n\n游戏会在每个新的一天自动保存。\n请先游戏至少一天后再尝试加载。`,
        actions: [{ id: "ok", label: "返回", kind: "primary" }]
      });
    } else {
      await showNoticeDialog({
        title: "读档",
        message: `❌ 加载失败：${result.error}`,
        actions: [{ id: "ok", label: "返回", kind: "primary" }]
      });
    }
    return;
  }
  
  const slotLabel = slotId === "auto" ? "自动存档" : `槽位 ${slotId}`;
  let successMsg = `✅ 加载成功！\n${slotLabel}`;
  if (result.usedBackup) {
    successMsg += "\n⚠️ 主存档损坏，已从备份恢复";
  }
  
  const snapshotState = result.snapshotState;
  if (!snapshotState || typeof snapshotState !== "object") {
    await showNoticeDialog({
      title: "读档",
      message: "❌ 加载失败：存档缺少 state 数据",
      actions: [{ id: "ok", label: "返回", kind: "primary" }]
    });
    return;
  }

  const loadedState = migrateOldState(JSON.parse(JSON.stringify(snapshotState)));
  setCanonicalMapContext(loadedState, getCanonicalMapId(loadedState) || "menu_main", null, "events:loadFromSlot:loadedState");
  replaceGameState(loadedState);
  
  // 重新加载当前地图
  const map = await loadMap(getCanonicalMapId(gameState));
  if (map) {
    setCanonicalMapContext(gameState, getCanonicalMapId(gameState), map, "events:loadFromSlot:reloadCurrentMap");
  } else {
    // 如果地图加载失败，返回菜单
    console.error(`无法加载地图：${getCanonicalMapId(gameState)}`);
    setCanonicalMapContext(gameState, "menu_main", await loadMap("menu_main"), "events:loadFromSlot:fallbackMenuMain");
  }
  syncAchievementMirrorFromStore(gameState);
  
  // 移除菜单模式样式
  const gameRoot = document.getElementById("game-root");
  if (gameRoot && getCanonicalMapId(gameState) !== "menu_main") {
    gameRoot.classList.remove("menu-mode");
  }
  
  // 渲染
  render();
  
  await showNoticeDialog({
    title: "读档",
    message: successMsg,
    actions: [{ id: "ok", label: "返回", kind: "primary" }]
  });
  console.log(`[存档加载] 成功加载槽位 ${slotId}`);
}

/**
 * 渲染存档选择界面
 */
function renderSaveLoadUI() {
  // 调用 renderer 中的函数
  import("./renderer.js").then(({ renderSaveLoadScreen }) => {
    renderSaveLoadScreen();
  });
}
