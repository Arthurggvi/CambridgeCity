// ============================================================================
// Effects - 声明式状态修改执行器
// ============================================================================
// Effect 描述"如何修改状态"，是声明式的数据结构
// 
// 设计原则：
// 1. Effect 必须是纯数据，可序列化
// 2. Effect 执行必须是可追踪的（返回 applied/skipped）
// 3. Effect 应该是幂等的（相同 Effect 在相同状态下产生相同结果）
// 4. 路径解析必须安全（不存在的路径要明确处理策略）
// ============================================================================

import { recomputePlayerVitals } from "../player.js";

/**
 * Effect 操作类型
 */
export const EFFECT_OPS = {
  SET: "set",       // 设置值
  ADD: "add",       // 加法
  MUL: "mul",       // 乘法
  PUSH: "push",     // 数组追加
  FLAG: "flag",     // 设置标志位
  CLAMP: "clamp"    // 钳制到范围
};

/**
 * Effect 结构定义
 * 
 * @typedef {Object} Effect
 * @property {string} op - 操作类型（EFFECT_OPS 中的值）
 * @property {string} path - 状态路径（点号分隔）
 * @property {*} value - 操作值
 * @property {number} min - 最小值（用于 clamp）
 * @property {number} max - 最大值（用于 clamp）
 * @property {string} key - 标志位键名（用于 flag）
 * 
 * @example SET
 * { op: "set", path: "player.physio.satiety", value: 80 }
 * 
 * @example ADD
 * { op: "add", path: "time.totalMinutes", value: 10 }
 * 
 * @example CLAMP
 * { op: "clamp", path: "player.psycho.hp", min: 0, max: 100 }
 * 
 * @example FLAG
 * { op: "flag", key: "hasVisitedStart", value: true }
 * 
 * @example PUSH
 * { op: "push", path: "logLines", value: "Day 1: Something happened" }
 */

/**
 * 通过路径获取值
 * 
 * @param {Object} obj - 根对象
 * @param {string} path - 点号分隔的路径
 * @returns {*} 值，不存在返回 undefined
 * 
 * @example
 * getByPath(gameState, "player.physio.satiety") // 返回 satiety 值
 */
export function getByPath(obj, path) {
  const parts = path.split(".");
  let current = obj;
  
  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  
  return current;
}

/**
 * 通过路径设置值
 * 
 * 策略：如果路径中间对象不存在，自动创建空对象
 * 
 * @param {Object} obj - 根对象
 * @param {string} path - 点号分隔的路径
 * @param {*} value - 要设置的值
 * @returns {boolean} 是否成功
 * 
 * @example
 * setByPath(gameState, "player.physio.satiety", 80)
 */
export function setByPath(obj, path, value) {
  const parts = path.split(".");
  const lastPart = parts.pop();
  let current = obj;
  
  // 导航到父对象，自动创建中间对象
  for (const part of parts) {
    if (current[part] == null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  }
  
  // 设置最终值
  current[lastPart] = value;
  return true;
}

/**
 * 应用单个 Effect
 * 
 * @param {Effect} effect - 效果定义
 * @param {Object} state - 游戏状态（会被修改）
 * @returns {Object} { ok: boolean, reason?: string, before?: any, after?: any }
 */
export function applyEffect(effect, state) {
  try {
    switch (effect.op) {
      case EFFECT_OPS.SET: {
        const before = getByPath(state, effect.path);
        setByPath(state, effect.path, effect.value);
        return { ok: true, before, after: effect.value };
      }
      
      case EFFECT_OPS.ADD: {
        const before = getByPath(state, effect.path);
        if (typeof before !== "number") {
          return { ok: false, reason: `路径 ${effect.path} 的值不是数字` };
        }
        const after = before + effect.value;
        setByPath(state, effect.path, after);
        return { ok: true, before, after };
      }
      
      case EFFECT_OPS.MUL: {
        const before = getByPath(state, effect.path);
        if (typeof before !== "number") {
          return { ok: false, reason: `路径 ${effect.path} 的值不是数字` };
        }
        const after = before * effect.value;
        setByPath(state, effect.path, after);
        return { ok: true, before, after };
      }
      
      case EFFECT_OPS.PUSH: {
        const arr = getByPath(state, effect.path);
        if (!Array.isArray(arr)) {
          return { ok: false, reason: `路径 ${effect.path} 的值不是数组` };
        }
        arr.push(effect.value);
        return { ok: true, before: arr.length - 1, after: arr.length };
      }
      
      case EFFECT_OPS.FLAG: {
        if (!state.flags) {
          state.flags = {};
        }
        const before = state.flags[effect.key];
        state.flags[effect.key] = effect.value;
        return { ok: true, before, after: effect.value };
      }
      
      case EFFECT_OPS.CLAMP: {
        const before = getByPath(state, effect.path);
        if (typeof before !== "number") {
          return { ok: false, reason: `路径 ${effect.path} 的值不是数字` };
        }
        const after = Math.max(effect.min, Math.min(effect.max, before));
        setByPath(state, effect.path, after);
        return { ok: true, before, after };
      }
      
      default:
        return { ok: false, reason: `未知的 Effect 操作: ${effect.op}` };
    }
  } catch (error) {
    return { ok: false, reason: `执行失败: ${error.message}` };
  }
}

function shouldRecomputePlayerVitals(effect) {
  if (!effect || typeof effect !== "object") return false;
  const path = String(effect.path || "");
  if (!path) return false;

  return path === "player.psycho.hp"
    || path === "player.psycho.fatigue"
    || path === "player.physio.satiety"
    || path === "player.physio.stamina";
}

/**
 * 批量应用 Effects
 * 
 * @param {Effect[]} effects - 效果列表
 * @param {Object} state - 游戏状态
 * @returns {Object} { applied: Array, skipped: Array }
 */
export function applyEffects(effects, state) {
  const applied = [];
  const skipped = [];
  let vitalsDirty = false;
  
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    const result = applyEffect(effect, state);
    
    if (result.ok) {
      if (shouldRecomputePlayerVitals(effect)) {
        vitalsDirty = true;
      }
      applied.push({
        effect,
        result,
        index: i
      });
    } else {
      skipped.push({
        effect,
        reason: result.reason,
        index: i
      });
      console.warn(`[Effects] 跳过 effect[${i}]:`, effect, result.reason);
    }
  }

  if (vitalsDirty && state?.player) {
    recomputePlayerVitals(state.player);
  }
  
  return { applied, skipped };
}

/**
 * 创建 Effect 工厂函数
 */
export const Effects = {
  set: (path, value) => ({ op: EFFECT_OPS.SET, path, value }),
  add: (path, value) => ({ op: EFFECT_OPS.ADD, path, value }),
  mul: (path, value) => ({ op: EFFECT_OPS.MUL, path, value }),
  push: (path, value) => ({ op: EFFECT_OPS.PUSH, path, value }),
  flag: (key, value) => ({ op: EFFECT_OPS.FLAG, key, value }),
  clamp: (path, min, max) => ({ op: EFFECT_OPS.CLAMP, path, min, max })
};
