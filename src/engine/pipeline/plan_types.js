// ============================================================================
// Plan Types
// ============================================================================
// Plan 是 resolve() 的产物，描述"如何执行 Action"
// 
// 设计原则：
// 1. Plan 必须是纯数据（可 JSON 化），不包含函数
// 2. Plan 包含系统调用（sysCalls）和声明式效果（effects）
// 3. Plan 是 commit() 的输入，commit() 解释执行 Plan
// 4. Plan 应该是幂等的（相同 Plan 在相同状态下产生相同结果）
// ============================================================================

/**
 * Plan 结构定义
 * 
 * @typedef {Object} Plan
 * @property {Action} action - 原始 Action
 * @property {SystemCall[]} sysCalls - 系统级调用列表（按顺序执行）
 * @property {Effect[]} effects - 声明式状态修改列表（按顺序执行）
 * @property {Object} nav - 导航指令（可选）
 * @property {string} nav.toMapId - 跳转到的地图ID
 * @property {boolean} nav.saveHistory - 是否保存历史（用于返回）
 * @property {Object} ui - UI 指令（可选）
 * @property {string} ui.mode - UI 模式（"menu" | "game" | "save_management"）
 * @property {Object|null} rejection - 结构化拒绝信息（可选）
 * @property {string} rejection.source - 拒绝来源（"requires" | "disabledRequires" | "dispatch" | ...）
 * @property {string} rejection.code - 拒绝码（如 "REQUIRES_NOT_MET"）
 * @property {string} rejection.reason - 拒绝原因摘要
 * @property {string[]} rejection.reasons - 详细原因列表
 * @property {Object[]} recordIntents - Record 解锁意图（resolve 收集，commit 消费）
 * @property {Object[]} archiveReadingIntents - 档案阅读意图（resolve 收集，commit 消费）
 * @property {Object[]} socialIntents - Social 变更意图（resolve 收集，commit 消费）
 * @property {Object[]} profileIntents - Profile 成长意图（resolve 收集，commit 消费）
 * @property {string[]} notes - 调试笔记（可选）
 */

/**
 * SystemCall 类型常量
 * 
 * SystemCall 是系统级操作，需要特殊处理（如时间推进、资源加载）
 */
export const SYSCALL_TYPES = {
  NEW_GAME: "NEW_GAME",           // 新游戏：重置状态
  ADVANCE_TIME: "ADVANCE_TIME",   // 推进时间
  LOAD_MAP: "LOAD_MAP",           // 加载地图
  LOAD_EVENT: "LOAD_EVENT",       // 加载事件
  SAVE_GAME: "SAVE_GAME",         // 保存游戏
  LOAD_SLOT: "LOAD_SLOT",         // 读取槽位（整棵替换）
  LOAD_GAME: "LOAD_SLOT",         // 兼容旧命名
  ADD_SLOT: "ADD_SLOT",           // 新增存档槽位（仅注册，不写入存档）
  RENAME_SLOT: "RENAME_SLOT",     // 重命名手动槽位
  DELETE_SLOT: "DELETE_SLOT",     // 删除存档槽位
  EXPORT_SLOT: "EXPORT_SLOT",     // 导出指定槽位
  IMPORT_SLOT: "IMPORT_SLOT",     // 导入到指定槽位
  WRITE_SETTINGS: "WRITE_SETTINGS", // 写入本地设置
  DEBUG_SET_PROFILE_CORE_VALUES: "DEBUG_SET_PROFILE_CORE_VALUES", // 调试写入核心档案数值
  LEGACY: "LEGACY"                // 临时：调用旧代码（过渡用）
};

/**
 * SystemCall 结构定义
 * 
 * @typedef {Object} SystemCall
 * @property {string} type - 调用类型（SYSCALL_TYPES 中的值）
 * @property {Object} params - 参数
 * 
 * @example ADVANCE_TIME
 * {
 *   type: "ADVANCE_TIME",
 *   params: {
 *     minutes: 600,
 *     reason: "wait_confirm",
 *     ctx: { isSleeping: false }
 *   }
 * }
 * 
 * @example LOAD_MAP
 * {
 *   type: "LOAD_MAP",
 *   params: { mapId: "start" }
 * }
 */

/**
 * 创建空 Plan
 * 
 * @param {Action} action - 原始 Action
 * @returns {Plan}
 */
export function makeEmptyPlan(action) {
  return {
    action,
    sysCalls: [],
    effects: [],
    nav: null,
    ui: null,
    uiFeedback: null,
    uiCommands: [],
    rejection: null,
    businessIntents: [],
    supplySubmissionIntents: [],
    recordIntents: [],
    archiveReadingIntents: [],
    socialIntents: [],
    profileIntents: [],
    wildernessPipelineIntents: [],
    notes: []
  };
}

export function addWildernessPipelineIntent(plan, intent) {
  if (!plan || typeof plan !== "object") return;
  if (!intent || typeof intent !== "object") return;
  if (!Array.isArray(plan.wildernessPipelineIntents)) {
    plan.wildernessPipelineIntents = [];
  }
  plan.wildernessPipelineIntents.push({ ...intent });
}

export function setUiFeedback(plan, uiFeedback) {
  plan.uiFeedback = uiFeedback && typeof uiFeedback === "object"
    ? { ...uiFeedback }
    : null;
}

export function addUiCommand(plan, command) {
  if (!command || typeof command !== "object") return;
  plan.uiCommands.push({ ...command });
}

/**
 * 添加 SystemCall 到 Plan
 * 
 * @param {Plan} plan
 * @param {string} type - SystemCall 类型
 * @param {Object} params - 参数
 */
export function addSysCall(plan, type, params) {
  plan.sysCalls.push({ type, params });
}

/**
 * 添加 Effect 到 Plan
 * 
 * @param {Plan} plan
 * @param {Effect} effect
 */
export function addEffect(plan, effect) {
  plan.effects.push(effect);
}

/**
 * 设置导航指令
 * 
 * @param {Plan} plan
 * @param {string} toMapId - 目标地图ID
 * @param {boolean} saveHistory - 是否保存历史
 */
export function setNav(plan, toMapId, saveHistory = false) {
  plan.nav = { toMapId, saveHistory };
}

/**
 * 设置 UI 指令
 * 
 * @param {Plan} plan
 * @param {string} mode - UI 模式
 */
export function setUIMode(plan, mode) {
  plan.ui = { mode };
}

export function addRecordIntent(plan, intent) {
  plan.recordIntents.push(intent);
}

export function addArchiveReadingIntent(plan, intent) {
  plan.archiveReadingIntents.push(intent);
}

export function addSocialIntent(plan, intent) {
  plan.socialIntents.push(intent);
}

export function addBusinessIntent(plan, intent) {
  plan.businessIntents.push(intent);
}

/**
 * 添加调试笔记
 * 
 * @param {Plan} plan
 * @param {string} note
 */
export function addNote(plan, note) {
  plan.notes.push(note);
}

/**
 * 验证 Plan 结构
 * 
 * @param {Plan} plan
 * @returns {boolean}
 * @throws {Error} 验证失败时抛出
 */
export function validatePlan(plan) {
  if (!plan) {
    throw new Error("[Plan验证] Plan 不能为 null/undefined");
  }
  
  if (!plan.action) {
    throw new Error("[Plan验证] Plan.action 必需");
  }
  
  if (!Array.isArray(plan.sysCalls)) {
    throw new Error("[Plan验证] Plan.sysCalls 必须是数组");
  }
  
  if (!Array.isArray(plan.effects)) {
    throw new Error("[Plan验证] Plan.effects 必须是数组");
  }

  if (!Array.isArray(plan.recordIntents)) {
    throw new Error("[Plan验证] Plan.recordIntents 必须是数组");
  }

  if (!Array.isArray(plan.archiveReadingIntents)) {
    throw new Error("[Plan验证] Plan.archiveReadingIntents 必须是数组");
  }

  if (!Array.isArray(plan.businessIntents)) {
    throw new Error("[Plan验证] Plan.businessIntents 必须是数组");
  }

  if (!Array.isArray(plan.supplySubmissionIntents)) {
    throw new Error("[Plan验证] Plan.supplySubmissionIntents 必须是数组");
  }

  if (!Array.isArray(plan.socialIntents)) {
    throw new Error("[Plan验证] Plan.socialIntents 必须是数组");
  }

  if (!Array.isArray(plan.uiCommands)) {
    throw new Error("[Plan验证] Plan.uiCommands 必须是数组");
  }

  if (!Array.isArray(plan.profileIntents)) {
    throw new Error("[Plan验证] Plan.profileIntents 必须是数组");
  }

  if (!Array.isArray(plan.wildernessPipelineIntents)) {
    throw new Error("[Plan验证] Plan.wildernessPipelineIntents 必须是数组");
  }
  
  // 验证 sysCalls
  for (let i = 0; i < plan.sysCalls.length; i++) {
    const call = plan.sysCalls[i];
    if (!call.type || !Object.values(SYSCALL_TYPES).includes(call.type)) {
      throw new Error(`[Plan验证] sysCalls[${i}].type 无效: ${call.type}`);
    }
    if (!call.params || typeof call.params !== "object") {
      throw new Error(`[Plan验证] sysCalls[${i}].params 必须是对象`);
    }
  }
  
  // 检查是否可序列化
  try {
    JSON.stringify(plan);
  } catch (error) {
    throw new Error(`[Plan验证] Plan 必须可序列化: ${error.message}`);
  }
  
  return true;
}
