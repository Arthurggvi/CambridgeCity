// ============================================================================
// Requires - 通用条件门禁（P0-3）
// ============================================================================
// 设计目标：
// - 纯函数：evaluateRequires(state, requires) 不修改 state
// - 白名单 path/op，避免任意路径执行/注入
// - reasons 可读，用于 console / report

import { checkProfileRequires } from "./profile/read.js";
import { getRuntimeProviderBand } from "./runtime_provider_context.js";
import { getCalendarView } from "./time.js";
import { isTimedLocationWindowOpen } from "./timed_location_runtime.js";
import { getNpcPresenceSnapshot } from "./social/npc_presence_provider.js";

const OPS = Object.freeze(["<", "<=", ">", ">=", "==", "!="]);

function fmtValue(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function getCurrentValue(state, path) {
  if (!state || typeof path !== "string") return undefined;

  const timedLocationMatch = /^time\.windows\.([A-Za-z0-9_]+)\.open$/.exec(path);
  if (timedLocationMatch) {
    return isTimedLocationWindowOpen(timedLocationMatch[1], state.time?.totalMinutes, state.world);
  }

  const runtimeProviderMatch = /^time\.providers\.([A-Za-z0-9_]+)\.band$/.exec(path);
  if (runtimeProviderMatch) {
    return getRuntimeProviderBand(runtimeProviderMatch[1], state, state?.time?.totalMinutes);
  }

  const calendarView = path.startsWith("time.calendar.")
    ? getCalendarView(state.time?.totalMinutes, state.world)
    : null;
  const presenceSnapshot = path.startsWith("presence.")
    ? getNpcPresenceSnapshot({
      gameState: state,
      mapId: state?.currentMapId,
      sceneId: state?.currentSceneId
    })
    : null;

  const socialFavorMatch = /^player\.social\.([A-Za-z0-9_]+)\.favor$/.exec(path);
  if (socialFavorMatch) {
    const npcId = socialFavorMatch[1];
    return Number(state.player?.social?.byNpcId?.[npcId]?.favor ?? 0);
  }

  const presenceRoleSlotMatch = /^presence\.roleSlots\.([A-Za-z0-9_]+)$/.exec(path);
  if (presenceRoleSlotMatch) {
    return presenceSnapshot?.roleSlots?.[presenceRoleSlotMatch[1]];
  }

  const presenceNpcMatch = /^presence\.presentNpcIds\.([A-Za-z0-9_]+)$/.exec(path);
  if (presenceNpcMatch) {
    return Array.isArray(presenceSnapshot?.presentNpcIds)
      ? presenceSnapshot.presentNpcIds.includes(presenceNpcMatch[1])
      : false;
  }

  switch (path) {
    case "player.hp":
    case "player.health":
      return state.player?.psycho?.hp ?? state.player?.hp;

    case "player.stamina":
      return state.player?.physio?.stamina;

    case "world.money":
      return state.world?.money;

    case "world.medical.bills.obsCents":
      return state.world?.medical?.bills?.obsCents;

    case "world.medical.bills.wardCents":
      return state.world?.medical?.bills?.wardCents;

    case "world.medical.bills.totalCents": {
      const obs = Number(state.world?.medical?.bills?.obsCents ?? 0);
      const ward = Number(state.world?.medical?.bills?.wardCents ?? 0);
      return obs + ward;
    }

    case "time.minuteOfDay": {
      const total = Number(state.time?.totalMinutes ?? 0);
      const norm = ((Math.trunc(total) % 1440) + 1440) % 1440;
      return norm;
    }

    case "time.calendar.month":
      return calendarView?.month;

    case "time.calendar.day":
      return calendarView?.day;

    case "time.calendar.monthDayCode": {
      const month = Number(calendarView?.month);
      const day = Number(calendarView?.day);
      if (!Number.isFinite(month) || !Number.isFinite(day)) return undefined;
      return month * 100 + day;
    }

    default: {
      // world.flags.<key>
      const m = /^world\.flags\.([A-Za-z0-9_]+)$/.exec(path);
      if (m) {
        const key = m[1];
        const raw = state.world?.flags?.[key] ?? state.flags?.[key];
        return typeof raw === "boolean" ? raw : false;
      }
      return undefined;
    }
  }
}

function compare(cur, op, expected) {
  switch (op) {
    case "<":
      return cur < expected;
    case "<=":
      return cur <= expected;
    case ">":
      return cur > expected;
    case ">=":
      return cur >= expected;
    case "==":
      // eslint-disable-next-line eqeqeq
      return cur == expected;
    case "!=":
      // eslint-disable-next-line eqeqeq
      return cur != expected;
    default:
      return false;
  }
}

function normalizeRequires(requires) {
  if (!requires || typeof requires !== "object") return null;

  const all = Array.isArray(requires.all) ? requires.all : [];
  const any = Array.isArray(requires.any) ? requires.any : [];
  const profile = requires.profile && typeof requires.profile === "object"
    ? requires.profile
    : null;

  return { all, any, profile };
}

function evalCond(state, cond) {
  const path = cond?.path;
  const op = cond?.op;
  const expected = cond?.value;

  if (typeof path !== "string" || typeof op !== "string") {
    return {
      ok: false,
      reason: "requires 条件格式错误"
    };
  }

  if (!OPS.includes(op)) {
    return {
      ok: false,
      reason: `requires 不支持的 op：${op}`
    };
  }

  const cur = getCurrentValue(state, path);

  // path 不在白名单时，cur 会是 undefined
  // 这里不抛异常，只返回 false 并给 reason
  const ok = compare(cur, op, expected);
  const reason = `需要 ${path} ${op} ${fmtValue(expected)}（当前 ${fmtValue(cur)}）`;

  return { ok, reason };
}

/**
 * evaluateRequires(state, requires)
 * @param {object} state - gameState（只读）
 * @param {object} requires - { all?: Condition[], any?: Condition[] }
 * @returns {{ok: boolean, reasons: string[]}}
 */
export function evaluateRequires(state, requires) {
  const norm = normalizeRequires(requires);
  if (!norm) return { ok: true, reasons: [] };

  const reasons = [];

  const profileResult = checkProfileRequires(state?.player?.profile, norm.profile);
  if (!profileResult.ok) {
    reasons.push(...profileResult.reasons);
  }

  // all：全部满足
  let allOk = true;
  for (const cond of norm.all) {
    const r = evalCond(state, cond);
    if (!r.ok) {
      allOk = false;
      reasons.push(r.reason);
    }
  }

  // any：至少一个满足；若 any 为空视为通过
  let anyOk = true;
  if (norm.any.length > 0) {
    anyOk = false;
    const anyReasons = [];
    for (const cond of norm.any) {
      const r = evalCond(state, cond);
      if (r.ok) {
        anyOk = true;
      } else {
        anyReasons.push(r.reason);
      }
    }

    if (!anyOk) {
      // any 条件全部失败时，把原因也带上
      reasons.push(...anyReasons);
    }
  }

  return {
    ok: allOk && anyOk && profileResult.ok,
    reasons
  };
}

export const REQUIRES_OPS = OPS;
