// ============================================================================
// LocalStorage 存储适配器
// ============================================================================
// 设计原则：
// 1. 封装 localStorage API，提供统一接口
// 2. 支持未来替换为 IndexedDB 或其他存储方案
// 3. 提供错误处理，避免 quota exceeded 等异常崩溃页面
// ============================================================================

/**
 * LocalStorage 存储适配器
 */
export class LocalStorageAdapter {
  /**
   * 读取数据
   * @param {string} key - 键名
   * @returns {string|null} 值，不存在返回 null
   */
  read(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error(`[存储] 读取失败：${key}`, error);
      return null;
    }
  }
  
  /**
   * 写入数据
   * @param {string} key - 键名
   * @param {string} value - 值（必须是字符串）
   * @returns {boolean} 是否成功
   */
  write(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      // 可能是 quota exceeded
      console.error(`[存储] 写入失败：${key}`, error);
      
      // 尝试清理旧数据（可选）
      if (error.name === "QuotaExceededError") {
        console.warn("[存储] 存储空间不足，建议清理旧存档");
      }
      
      return false;
    }
  }
  
  /**
   * 删除数据
   * @param {string} key - 键名
   * @returns {boolean} 是否成功
   */
  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`[存储] 删除失败：${key}`, error);
      return false;
    }
  }
  
  /**
   * 检查键是否存在
   * @param {string} key - 键名
   * @returns {boolean} 是否存在
   */
  has(key) {
    return this.read(key) !== null;
  }
  
  /**
   * 列出所有匹配前缀的键
   * @param {string} prefix - 键名前缀
   * @returns {string[]} 键名列表
   */
  listKeys(prefix) {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keys.push(key);
        }
      }
      return keys;
    } catch (error) {
      console.error(`[存储] 列举键失败：${prefix}`, error);
      return [];
    }
  }
  
  /**
   * 获取存储使用情况（估算）
   * @returns {object} { used: number, available: number }
   */
  getUsage() {
    try {
      let used = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            // 粗略估算：key + value 的字符数 * 2 bytes（UTF-16）
            used += (key.length + value.length) * 2;
          }
        }
      }
      
      // localStorage 通常限制 5-10MB
      const available = 10 * 1024 * 1024; // 假设 10MB
      
      return { used, available };
    } catch (error) {
      console.error("[存储] 获取使用情况失败", error);
      return { used: 0, available: 0 };
    }
  }
}

/**
 * 默认存储实例（单例）
 */
export const storage = new LocalStorageAdapter();
