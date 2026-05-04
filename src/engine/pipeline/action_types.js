import { getCanonicalMapId } from "../map_context.js";

// ============================================================================
// Action Types & Factories
// ============================================================================
// Action 是"意图"（Intent），不是"效果"（Effect）
// Action 描述"用户/系统想做什么"，不描述"如何修改状态"
// 
// 设计原则：
// 1. Action 必须是纯数据，可序列化为 JSON
// 2. Action 不包含任何副作用（不修改状态、不调用API）
// 3. Action 应该包含足够的上下文信息供 resolve() 使用
// ============================================================================

/**
 * Action 结构定义
 * 
 * @typedef {Object} Action
 * @property {string} type - Action 类型（"MAP_ACTION" | "GLOBAL_ACTION" | "SYSTEM_ACTION"）
 * @property {string} id - 原始 actionId（来自按钮的 data-action-id）
 * @property {Object} payload - UI 采集到的参数（如滑条的 minutes 值）
 * @property {Object} meta - 元数据：时间戳、来源、当前地图等
 * @property {string} meta.atMs - 动作触发时间戳（毫秒）
 * @property {string} meta.source - 来源标识（"ui" | "system" | "auto"）
 * @property {string} meta.mapId - 触发时所在地图ID
 */

/**
 * Action 类型常量
 */
export const ACTION_TYPES = {
  MAP_ACTION: "MAP_ACTION",       // 地图上的普通按钮动作
  GLOBAL_ACTION: "GLOBAL_ACTION", // 全局动作（菜单、存档等）
  SYSTEM_ACTION: "SYSTEM_ACTION"  // 系统级动作（自动存档、时间推进等）
};

/**
 * 从 UI 创建 Action
 * 
 * @param {string} actionId - 原始 actionId（来自 data-action-id）
 * @param {Object} payload - UI 采集的参数
 * @param {Object} gameState - 当前游戏状态（只读，用于采集上下文）
 * @returns {Action} 标准化的 Action 对象
 * 
 * @example
 * // 按钮点击
 * makeActionFromUI("wait_confirm", { minutes: 600 }, gameState)
 * 
 * // 菜单操作
 * makeActionFromUI("new_game", {}, gameState)
 */
export function makeActionFromUI(actionId, payload = {}, gameState) {
  // 确定 Action 类型
  let type = ACTION_TYPES.MAP_ACTION;
  
  // 全局动作列表（与地图无关的操作）
  const globalActions = [
    "new_game",
    "continue_game",
    "show_more_menu",
    "go_back",
    "show_settings",
    "menu_continue_auto",
    "menu_new_game",
    "menu_go_load",
    "menu_go_achievements",
    "ui_open_save_menu",
    "menu_go_settings",
    "menu_go_credits",
    "menu_back_main",
    "menu_exit_main",
    "debug_teleport",
    "debug_set_money",
    "debug_set_player_stat_value"
  ];
  
  // 存档相关动作
  const saveActions = actionId.match(/^(save_to_slot_|load_slot_|delete_slot_|menu_save:|menu_load:|menu_delete:)/);
  const exportImportActions = actionId.match(/^(export_save|import_save|menu_export:|menu_import:)/);
  const settingsActions = actionId.match(/^(settings_set:|settings_toggle:|settings_reset_defaults)/);
  // inv_unequip_tool:* is part of the formal inventory feature.
  // inv_debug_gain:* stays routable here, but individual handlers must keep it dev-only.
  const inventoryActions = actionId.match(/^(ui_open_inventory|ui_close_inventory|ui_map_open|ui_map_close|inv_filter:|inv_select_item:|inv_select_slot:|inv_drop:|inv_use:|inv_equip:|inv_unequip:|inv_unequip_tool:|inv_debug_gain:)/);
  const tasksActions = actionId.match(/^(ui_tasks_open|ui_tasks_close|ui_memo_open|tasks_select:|tasks_toggle_done:|tasks_delete:|tasks_archive:|tasks_pin:|tasks_add)/);
  const transitActions = actionId.match(/^(transit_board|transit_continue|transit_get_off)$/);
  
  if (globalActions.includes(actionId) || saveActions || exportImportActions || settingsActions || inventoryActions || tasksActions || transitActions) {
    type = ACTION_TYPES.GLOBAL_ACTION;
  }
  
  // 构建 Action
  const action = {
    type,
    id: actionId,
    payload: { ...payload },
    meta: {
      atMs: Date.now(),
      source: "ui",
      mapId: getCanonicalMapId(gameState) || "unknown"
    }
  };
  
  return action;
}

/**
 * 验证 Action 结构
 * 
 * 开发期检查，确保 Action 符合约定
 * 
 * @param {Action} action - 待验证的 Action
 * @returns {boolean} 是否有效
 * @throws {Error} 验证失败时抛出详细错误
 */
export function validateAction(action) {
  // 必需字段检查
  if (!action) {
    throw new Error("[Action验证] Action 不能为 null/undefined");
  }
  
  if (!action.type) {
    throw new Error("[Action验证] Action.type 必需");
  }
  
  if (!Object.values(ACTION_TYPES).includes(action.type)) {
    throw new Error(`[Action验证] 未知的 Action.type: ${action.type}`);
  }
  
  if (!action.id || typeof action.id !== "string") {
    throw new Error("[Action验证] Action.id 必须是非空字符串");
  }
  
  if (!action.payload || typeof action.payload !== "object") {
    throw new Error("[Action验证] Action.payload 必须是对象");
  }
  
  if (!action.meta || typeof action.meta !== "object") {
    throw new Error("[Action验证] Action.meta 必须是对象");
  }
  
  if (!action.meta.atMs || typeof action.meta.atMs !== "number") {
    throw new Error("[Action验证] Action.meta.atMs 必须是数字");
  }
  
  if (!action.meta.source) {
    throw new Error("[Action验证] Action.meta.source 必需");
  }
  
  // 检查是否可序列化（开发期检查）
  try {
    JSON.stringify(action);
  } catch (error) {
    throw new Error(`[Action验证] Action 必须可序列化为 JSON: ${error.message}`);
  }
  
  return true;
}

/**
 * 创建系统级 Action
 * 
 * 用于自动触发的系统操作（如自动存档、定时事件等）
 * 
 * @param {string} actionId - 系统动作ID
 * @param {Object} payload - 参数
 * @param {Object} gameState - 游戏状态
 * @returns {Action}
 */
export function makeSystemAction(actionId, payload = {}, gameState) {
  return {
    type: ACTION_TYPES.SYSTEM_ACTION,
    id: actionId,
    payload: { ...payload },
    meta: {
      atMs: Date.now(),
      source: "system",
      mapId: getCanonicalMapId(gameState) || "system"
    }
  };
}
