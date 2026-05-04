/**
 * 系统注册与 tick 调度
 */

import { gameState } from "./state.js";
import { getTimeView } from "./time.js";

// 已注册的系统列表（固定顺序）
const systems = [];

/**
 * 注册一个系统
 * @param {object} system - 必须实现 onTimeStep(dtHours, context)
 */
export function registerSystem(system) {
  if (typeof system.onTimeStep !== "function") {
    throw new Error("系统必须实现 onTimeStep(dtHours, context) 方法");
  }
  systems.push(system);
}

/**
 * 执行一次时间步进（由 time.js 调用）
 * @param {number} stepMin - 步长（分钟）
 */
export function tick(stepMin) {
  const dtHours = stepMin / 60;

  // 构造上下文
  const context = {
    timeView: getTimeView(),
    world: gameState.world,
    player: gameState.player,
    state: gameState  // 完整状态引用
  };

  // 按固定顺序调用系统
  // 顺序：EnvironmentTemp → CoreTemp → Hypo
  for (const system of systems) {
    try {
      system.onTimeStep(dtHours, context);
    } catch (err) {
      console.error(`系统 ${system.name || "未命名"} 执行失败:`, err);
    }
  }
}

/**
 * 获取已注册系统数量（用于调试）
 */
export function getSystemCount() {
  return systems.length;
}
