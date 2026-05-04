import { getWildernessAreaSpec } from "./wilderness_area_registry.js";

/**
 * Resolve-only checks for starting a wilderness session from map data.
 * Must not mutate gameState.
 */
export function resolveWildernessStartSessionReadOnly({ areaId, gameState }) {
  const reasons = [];
  const id = String(areaId || "").trim();
  if (!id) {
    return {
      ok: false,
      code: "WILDERNESS_AREA_ID_MISSING",
      reason: "缺少 wilderness.areaId",
      reasons: ["wilderness.areaId empty"]
    };
  }

  const cur = gameState?.world?.wilderness;
  if (cur && typeof cur === "object" && cur.active === true) {
    return {
      ok: false,
      code: "WILDERNESS_SESSION_ALREADY_ACTIVE",
      reason: "已有进行中的野外会话",
      reasons: ["world.wilderness.active===true"]
    };
  }

  const areaSpec = getWildernessAreaSpec(id);
  if (!areaSpec || typeof areaSpec !== "object") {
    return {
      ok: false,
      code: "WILDERNESS_AREA_UNKNOWN",
      reason: `未知 areaId：${id}`,
      reasons: [`no spec for ${id}`]
    };
  }

  return { ok: true, areaSpec };
}

/**
 * Resolve-only checks for ending an active wilderness session.
 * Must not mutate gameState.
 */
export function resolveWildernessEndSessionReadOnly(gameState) {
  const cur = gameState?.world?.wilderness;
  if (!cur || typeof cur !== "object" || cur.active !== true) {
    return {
      ok: false,
      code: "WILDERNESS_SESSION_NOT_ACTIVE",
      reason: "没有活跃的野外会话",
      reasons: ["world.wilderness.active!==true"]
    };
  }
  return { ok: true };
}
