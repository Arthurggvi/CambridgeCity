/**
 * Phase 6: unified wilderness blocker payload (plain data only; no gameState / DOM).
 */

export const WILDERNESS_BLOCKER_KINDS = Object.freeze([
  "boundary_block",
  "terrain_hard_block",
  "terrain_requirement_block",
  "weather_terrain_block",
  "player_state_block",
  "landmark_intercept",
  "rescue_intercept"
]);

const STAY_ACTION = Object.freeze({ id: "stay", label: "停下" });

function normalizeAt(at) {
  const x = Math.trunc(Number(at?.x));
  const y = Math.trunc(Number(at?.y));
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

function buildNotice(title, message) {
  const t = String(title || "").trim();
  const m = String(message || "").trim();
  return {
    title: t,
    message: m,
    actions: [{ id: "stay", label: "停下" }]
  };
}

/**
 * @param {*} value
 * @returns {boolean}
 */
export function isWildernessBlocker(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const kind = String(value.kind || "").trim();
  if (!WILDERNESS_BLOCKER_KINDS.includes(kind)) return false;
  if (typeof value.blockerId !== "string" || !value.blockerId.trim()) return false;
  const at = value.at;
  if (!at || typeof at !== "object") return false;
  if (!Number.isFinite(Number(at.x)) || !Number.isFinite(Number(at.y))) return false;
  if (typeof value.title !== "string" || typeof value.message !== "string") return false;
  const n = value.notice;
  if (!n || typeof n !== "object") return false;
  if (typeof n.title !== "string" || typeof n.message !== "string") return false;
  if (!Array.isArray(n.actions) || n.actions.length < 1) return false;
  if (String(n.actions[0]?.id || "") !== "stay") return false;
  if (!("fallback" in value) || value.fallback !== null) return false;
  if (!("cleanup" in value) || value.cleanup !== null) return false;
  return true;
}

/**
 * @param {object|null|undefined} rawBlocker
 * @param {{ areaId?: string, regionId?: string, at?: { x: number, y: number } }} context
 * @returns {object}
 */
export function normalizeWildernessBlocker(rawBlocker, context = {}) {
  const ctxArea = String(context.areaId ?? "").trim();
  const ctxRegion = String(context.regionId ?? "").trim();
  const ctxAt = normalizeAt(context.at);

  let raw = rawBlocker && typeof rawBlocker === "object" ? { ...rawBlocker } : {};

  const legacyKind = String(raw.kind || "").trim();
  if (legacyKind === "session_inactive" || legacyKind === "bad_direction") {
    raw = {
      ...raw,
      kind: "player_state_block",
      blockerId:
        legacyKind === "session_inactive"
          ? "wilderness_session_inactive_block"
          : "wilderness_bad_direction_block"
    };
  }

  let kind = String(raw.kind || "").trim();

  if (!WILDERNESS_BLOCKER_KINDS.includes(kind)) {
    kind = "player_state_block";
    raw = {
      kind,
      blockerId: String(raw.blockerId || "").trim() || "wilderness_unknown_blocker",
      title: String(raw.title || "无法移动").trim() || "无法移动",
      message: String(raw.message || "").trim() || "无法完成该野外操作。",
      terrainId: raw.terrainId != null ? raw.terrainId : null
    };
  }

  const areaId = String(raw.areaId ?? ctxArea).trim();
  const regionId = String(raw.regionId ?? ctxRegion).trim();
  const at = raw.at && typeof raw.at === "object" ? normalizeAt(raw.at) : ctxAt;
  const terrainId = raw.terrainId != null && raw.terrainId !== "" ? String(raw.terrainId) : null;
  const blockerId = String(raw.blockerId || "").trim() || `wilderness_${kind}`;
  const title = String(raw.title || "").trim() || "通知";
  const message = String(raw.message || "").trim() || "";

  const notice = raw.notice && typeof raw.notice === "object"
    ? {
        title: String(raw.notice.title || title).trim() || title,
        message: String(raw.notice.message || message).trim() || message,
        actions: Array.isArray(raw.notice.actions) && raw.notice.actions.length > 0
          ? raw.notice.actions.map((a) => ({
              id: String(a?.id || "stay").trim() || "stay",
              label: String(a?.label || "停下").trim() || "停下"
            }))
          : [{ ...STAY_ACTION }]
      }
    : buildNotice(title, message);

  if (!notice.actions?.length) {
    notice.actions = [{ ...STAY_ACTION }];
  }
  if (String(notice.actions[0]?.id || "") !== "stay") {
    notice.actions = [{ ...STAY_ACTION }, ...notice.actions];
  }

  return {
    kind,
    blockerId,
    terrainId,
    areaId,
    regionId,
    at,
    title,
    message,
    notice: {
      title: String(notice.title || title).trim() || title,
      message: String(notice.message || message).trim() || message,
      actions: notice.actions.map((a) => ({
        id: String(a.id || "stay").trim() || "stay",
        label: String(a.label || "停下").trim() || "停下"
      }))
    },
    fallback: null,
    cleanup: null
  };
}

export function createBoundaryWildernessBlocker({ areaId, regionId, at }) {
  const title = "前方超出巡查范围";
  const message = "再往前就离开了旧标记杆巡查线的控制范围。";
  return normalizeWildernessBlocker(
    {
      kind: "boundary_block",
      blockerId: "wilderness_boundary_block",
      terrainId: null,
      title,
      message
    },
    { areaId, regionId, at }
  );
}

export function createTerrainHardWildernessBlocker({ areaId, regionId, terrainId, at }) {
  const tid = String(terrainId || "").trim();
  const isIce = tid === "ice_shelf_edge";
  const title = isIce ? "前方是冰架前缘" : "前方不可通行";
  const message = isIce
    ? "冰面在前方断开，下面是海水和冰崖。不能继续向前走。"
    : "目标地貌不允许徒步通过。";
  const blockerId = isIce ? "ice_shelf_edge_hard_block" : `terrain_hard_block_${tid || "unknown"}`;
  return normalizeWildernessBlocker(
    {
      kind: "terrain_hard_block",
      blockerId,
      terrainId: tid || null,
      title,
      message
    },
    { areaId, regionId, at }
  );
}

export function createTerrainRequirementWildernessBlocker({ areaId, regionId, terrainId, at }) {
  const tid = String(terrainId || "").trim();
  if (tid !== "crevasse_field") {
    return normalizeWildernessBlocker(
      {
        kind: "terrain_requirement_block",
        blockerId: `terrain_requirement_block_${tid || "unknown"}`,
        terrainId: tid || null,
        title: "前方不可进入",
        message: "当前地貌需要额外条件才能进入。"
      },
      { areaId, regionId, at }
    );
  }
  return normalizeWildernessBlocker(
    {
      kind: "terrain_requirement_block",
      blockerId: "crevasse_field_requirement_block",
      terrainId: "crevasse_field",
      title: "前方是裂隙带",
      message: "没有探杆、绳索和同行保护，不能贸然进入裂隙带。"
    },
    { areaId, regionId, at }
  );
}

/**
 * Extract notice payloads for blocked WILDERNESS_MOVE rows (for dispatch / tests).
 * @param {object|null|undefined} report
 * @returns {Array<{ title: string, message: string, actions: Array<{id:string,label:string}> }>}
 */
export function collectWildernessMoveBlockedNoticeDialogs(report) {
  const rows = Array.isArray(report?.wilderness?.results) ? report.wilderness.results : [];
  const out = [];
  for (const row of rows) {
    if (row?.type !== "WILDERNESS_MOVE" || row.ok !== false) continue;
    const n = row.blocker?.notice;
    if (!n || typeof n !== "object") continue;
    out.push({
      title: String(n.title || row.blocker?.title || "").trim() || "通知",
      message: String(n.message || row.blocker?.message || "").trim(),
      actions: Array.isArray(n.actions)
        ? n.actions.map((a) => ({
            id: String(a?.id || "stay").trim() || "stay",
            label: String(a?.label || "停下").trim() || "停下"
          }))
        : [{ id: "stay", label: "停下" }]
    });
  }
  return out;
}
