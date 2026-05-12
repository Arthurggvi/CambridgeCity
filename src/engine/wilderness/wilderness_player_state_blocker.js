/**
 * Phase 10B: read-only player state gates for wilderness movement (resolve-time only).
 *
 * Bug3 (stamina soft-lock fix, round 2): the entire `stamina_insufficient`
 * blocker path has been removed. Stamina cases — including
 * `0 < stamina < cost`, `stamina <= 0`, AND defensive `staminaCost === Infinity`
 * — must NEVER surface as a `player_state_block` dialog. They are routed
 * through the resolver's `staminaInsufficient` plan marker into commit,
 * which clamps stamina to 0 and feeds the existing Ethan rescue / collapse
 * chain (with a holdout fallback notice for `before <= 0` cases that cannot
 * cross the stamina_zero threshold). This module therefore only gates on
 * `hp_too_low`, `severe_hypothermia`, and `player_state_missing`.
 */

import { normalizeWildernessBlocker } from "./wilderness_blocker.js";

export const WILDERNESS_PLAYER_STATE_BLOCK_REASONS = Object.freeze([
  "hp_too_low",
  "severe_hypothermia",
  "player_state_missing"
]);

/**
 * Public "still has any stamina at all" floor; the value MUST remain truthy
 * (>0) so external callers can keep using `stamina >= MIN_STAMINA_TO_ATTEMPT_MOVE`
 * as a positivity test. This module no longer compares against it directly
 * because stamina is now handled exclusively by the staminaInsufficient plan
 * path in the resolver / commit pair.
 */
export const MIN_STAMINA_TO_ATTEMPT_MOVE = 1;
export const MIN_HP_TO_ATTEMPT_MOVE = 5;
export const SEVERE_HYPO_STAGE_BLOCK = 3;
/**
 * `player.psycho.hypothermia` is a **hypothermia safety index** (roughly 0..100): higher = safer, lower = worse cold exposure.
 * Block wilderness moves when the index has fallen to this value or below (severe cold risk).
 */
export const MIN_HYPOTHERMIA_SAFETY_TO_MOVE = 25;

const HYPO_STAGE_ORDER = Object.freeze(["Safe", "Mild", "Moderate", "Severe", "Critical"]);

function hypoStageRankFromRaw(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  if (typeof raw === "string" && /^\s*\d+\s*$/.test(raw)) {
    return Math.trunc(Number(raw));
  }
  const s = String(raw ?? "").trim();
  const idx = HYPO_STAGE_ORDER.indexOf(s);
  return idx >= 0 ? idx : 0;
}

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Defensive read-only snapshot; never mutates `player`.
 * @param {object|null|undefined} player
 * @returns {{ stamina: number, hp: number, hypothermia: number, hypoStageRank: number, temperatureC: number }}
 */
export function getWildernessPlayerStateSnapshot(player) {
  if (!player || typeof player !== "object") {
    return {
      stamina: 0,
      hp: 0,
      hypothermia: 0,
      hypoStageRank: 0,
      temperatureC: 0
    };
  }
  const phys = player.physio && typeof player.physio === "object" ? player.physio : {};
  const psycho = player.psycho && typeof player.psycho === "object" ? player.psycho : {};
  const hypoRaw = psycho.hypoStage;
  return {
    stamina: finiteOr(phys.stamina, 0),
    hp: finiteOr(psycho.hp, 0),
    hypothermia: finiteOr(psycho.hypothermia, 0),
    hypoStageRank: hypoStageRankFromRaw(hypoRaw),
    temperatureC: finiteOr(phys.temperatureC, 0)
  };
}

/**
 * @param {object} params
 * @param {"hp_too_low"|"severe_hypothermia"|"player_state_missing"} params.reason
 * @param {object|null|undefined} params.player
 * @param {object} params.movementPlanDraft
 * @param {object} params.wilderness
 * @param {object} params.areaSpec
 * @param {object|null|undefined} params.terrainDef
 * @returns {object}
 */
export function createWildernessPlayerStateBlocker({
  reason,
  player: _player,
  movementPlanDraft,
  wilderness: _wilderness,
  areaSpec,
  terrainDef
}) {
  const areaId = String(areaSpec?.id || "").trim();
  const regionId = String(areaSpec?.regionId || "").trim();
  const to = movementPlanDraft?.to && typeof movementPlanDraft.to === "object"
    ? {
        x: Math.trunc(finiteOr(movementPlanDraft.to.x, 0)),
        y: Math.trunc(finiteOr(movementPlanDraft.to.y, 0))
      }
    : { x: 0, y: 0 };
  let terrainId = null;
  if (movementPlanDraft?.terrainId != null && movementPlanDraft.terrainId !== "") {
    terrainId = String(movementPlanDraft.terrainId);
  } else if (terrainDef && terrainDef.id != null && String(terrainDef.id).trim() !== "") {
    terrainId = String(terrainDef.id).trim();
  }

  let blockerId;
  let title;
  let message;
  if (reason === "hp_too_low") {
    blockerId = "player_hp_too_low_block";
    title = "状态过差";
    message = "你的生命状态过差，不能继续冒险深入。";
  } else if (reason === "severe_hypothermia") {
    blockerId = "player_severe_hypothermia_block";
    title = "失温风险过高";
    message = "你的体温状态已经过低，继续行动会带来严重风险。";
  } else if (reason === "player_state_missing") {
    blockerId = "player_state_missing_block";
    title = "状态数据缺失";
    message = "当前缺少玩家状态数据，不能执行野外移动。";
  } else {
    // Bug3: `stamina_insufficient` is no longer accepted here. Stamina cases
    // are handled exclusively via the resolver's `staminaInsufficient` plan
    // marker (commit clamps stamina to 0 and the Ethan rescue / holdout
    // collector surfaces the consequence).
    blockerId = "player_state_block_unknown";
    title = "无法移动";
    message = "当前状态不允许这次野外移动。";
  }

  return normalizeWildernessBlocker(
    {
      kind: "player_state_block",
      blockerId,
      terrainId,
      title,
      message
    },
    { areaId, regionId, at: to }
  );
}

/**
 * @param {object} params
 * @param {object|null|undefined} params.player
 * @param {{ minutes?: number, staminaCost?: number, terrainId?: string|null, to?: {x:number,y:number}, from?: {x:number,y:number} }} params.movementPlanDraft
 * @param {object} params.wilderness
 * @param {object} params.areaSpec
 * @param {object|null|undefined} params.terrainDef
 * @returns {object|null} normalized blocker or null
 */
export function evaluateWildernessPlayerStateBlocker({
  player,
  movementPlanDraft,
  wilderness,
  areaSpec,
  terrainDef
}) {
  if (player == null) return null;

  const snap = getWildernessPlayerStateSnapshot(player);

  if (snap.hp <= MIN_HP_TO_ATTEMPT_MOVE) {
    return createWildernessPlayerStateBlocker({
      reason: "hp_too_low",
      player,
      movementPlanDraft,
      wilderness,
      areaSpec,
      terrainDef
    });
  }

  const hypoColdEnough = snap.hypothermia <= MIN_HYPOTHERMIA_SAFETY_TO_MOVE;
  if (snap.hypoStageRank >= SEVERE_HYPO_STAGE_BLOCK || hypoColdEnough) {
    return createWildernessPlayerStateBlocker({
      reason: "severe_hypothermia",
      player,
      movementPlanDraft,
      wilderness,
      areaSpec,
      terrainDef
    });
  }

  // Bug3 (round 2): stamina cases are intentionally NOT blocked here.
  //   - `0 < stamina < cost` → resolver attaches `staminaInsufficient: true`
  //     plan marker; commit clamps stamina to 0 and the Ethan rescue chain
  //     fires via the stamina_zero crossing detector.
  //   - `stamina <= 0` → same staminaInsufficient marker; commit re-clamps
  //     to 0 (no-op) and a holdout notice is surfaced (no Ethan crossing,
  //     since `before == 0`).
  //   - `staminaCost === Infinity` → identical handling, defensively
  //     treated as the staminaInsufficient path.
  // Surfacing any of those as a `player_state_block` here would re-open the
  // removed stamina blocker dialog (the user-facing copy this module no
  // longer ships — see the createWildernessPlayerStateBlocker branch above).
  return null;
}
