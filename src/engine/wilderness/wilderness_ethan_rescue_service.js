/**
 * Phase 12A: passive Ethan rescue after wilderness move survival (stamina / fatigue zero crossings).
 */

import {
  createDeterministicForecastRng,
  hashForecastSeed,
  randomFloat01
} from "./wilderness_weather_forecast_rng.js";
import { normalizeWildernessState } from "./wilderness_state.js";
import { createRecoverWildernessSessionPatch } from "./wilderness_session_service.js";

export const ETHAN_RESCUE_OFFER_MAP_ID = "wilderness_ethan_rescue_offer";
/** Final page of the stamina rescue offer chain (agree / refuse actions). */
export const ETHAN_RESCUE_OFFER_DECISION_MAP_ID = "wilderness_ethan_rescue_offer_4";
/** Narrative page before commit applies stamina +5 and returns to wilderness runtime. */
export const ETHAN_RESCUE_REFUSE_STAY_MAP_ID = "wilderness_ethan_rescue_refuse_stay";
export const ETHAN_RESCUE_AGREE_ACTION_ID = "ethan_rescue_agree_return";
/** Decision-page button: TRANSITION to `ETHAN_RESCUE_REFUSE_STAY_MAP_ID`. */
export const ETHAN_RESCUE_REFUSE_ACTION_ID = "ethan_rescue_refuse_stay";
/** Confirms refuse on the narrative page; queues `WILDERNESS_ETHAN_RESCUE_REFUSE`. */
export const ETHAN_RESCUE_REFUSE_CONFIRM_ACTION_ID = "ethan_rescue_refuse_confirm";
export const ETHAN_RESCUE_BED_MAP_ID = "west2_outpost_rescue_aid_tent_bed";

export function isEthanRescueOfferDecisionMapId(mapId) {
  return String(mapId || "").trim() === ETHAN_RESCUE_OFFER_DECISION_MAP_ID;
}

export const ETHAN_RESCUE_REGION_PROFILES = Object.freeze({
  West2: Object.freeze({
    baseChance: 0.7,
    anchor: Object.freeze({ x: 0, y: 0 }),
    distanceFalloffPerStep: 0.04,
    minChance: 0.1,
    maxChance: 0.9
  }),
  CambCity: Object.freeze({
    baseChance: 0.85,
    anchor: Object.freeze({ x: 0, y: 0 }),
    distanceFalloffPerStep: 0.02,
    minChance: 0.2,
    maxChance: 0.95
  }),
  OldCamb: Object.freeze({
    baseChance: 0.25,
    anchor: Object.freeze({ x: 0, y: 0 }),
    distanceFalloffPerStep: 0.06,
    minChance: 0.02,
    maxChance: 0.55
  }),
  South1: Object.freeze({
    baseChance: 0.15,
    anchor: Object.freeze({ x: 0, y: 0 }),
    distanceFalloffPerStep: 0.07,
    minChance: 0.01,
    maxChance: 0.4
  })
});

const DEFAULT_REGION_KEY = "South1";

/**
 * @param {{ stamina:number,satiety:number,fatigue:number,temperatureC:number,hypothermia:number,hypoStage:string,hp:number }} before
 * @param {{ stamina:number,satiety:number,fatigue:number,temperatureC:number,hypothermia:number,hypoStage:string,hp:number}} after
 * @returns {"fatigue_zero"|"stamina_zero"|null}
 */
export function detectEthanRescueEligibleCollapse({ before, after }) {
  if (!before || typeof before !== "object" || !after || typeof after !== "object") return null;
  if (Number(after.hp) <= 0) return null;

  const bf = Number(before.fatigue);
  const af = Number(after.fatigue);
  const bs = Number(before.stamina);
  const ast = Number(after.stamina);

  const fatigueZero = Number.isFinite(bf) && bf > 0 && Number.isFinite(af) && af <= 0;
  const staminaZero = Number.isFinite(bs) && bs > 0 && Number.isFinite(ast) && ast <= 0;

  if (fatigueZero) return "fatigue_zero";
  if (staminaZero) return "stamina_zero";
  return null;
}

export function buildEthanRescueEventKey({ sessionStartedAt, areaId, x, y, stepsTaken, reason }) {
  const ss = sessionStartedAt == null ? "null" : String(sessionStartedAt);
  const aid = String(areaId ?? "").trim();
  const xi = Number.isFinite(Number(x)) ? Math.trunc(Number(x)) : 0;
  const yi = Number.isFinite(Number(y)) ? Math.trunc(Number(y)) : 0;
  const st = Number.isFinite(Number(stepsTaken)) ? Math.trunc(Number(stepsTaken)) : 0;
  const r = String(reason ?? "").trim();
  return `${ss}:${aid}:${xi}:${yi}:${st}:${r}`;
}

export function computeEthanRescueChance(regionId, x, y) {
  const key = typeof regionId === "string" && regionId.trim() ? regionId.trim() : DEFAULT_REGION_KEY;
  const profile = ETHAN_RESCUE_REGION_PROFILES[key] || ETHAN_RESCUE_REGION_PROFILES[DEFAULT_REGION_KEY];
  const xi = Number.isFinite(Number(x)) ? Math.trunc(Number(x)) : 0;
  const yi = Number.isFinite(Number(y)) ? Math.trunc(Number(y)) : 0;
  const ax = Number(profile.anchor.x);
  const ay = Number(profile.anchor.y);
  const distance = Math.hypot(xi - ax, yi - ay);
  let chance = profile.baseChance - distance * profile.distanceFalloffPerStep;
  chance = Math.min(profile.maxChance, Math.max(profile.minChance, chance));
  return { chance, distance, profileKey: key in ETHAN_RESCUE_REGION_PROFILES ? key : DEFAULT_REGION_KEY };
}

/**
 * @param {object} seedInput
 * @returns {number} in [0,1)
 */
export function createDeterministicEthanRescueRoll(seedInput) {
  const rng = createDeterministicForecastRng(hashForecastSeed(seedInput));
  return randomFloat01(rng);
}

export function applyEthanRescueRecoveryFloor(player) {
  if (!player || typeof player !== "object") return;
  if (!player.physio || typeof player.physio !== "object") player.physio = {};
  if (!player.psycho || typeof player.psycho !== "object") player.psycho = {};

  const floorV = (v) => {
    const n = Number(v);
    const base = Number.isFinite(n) ? n : 0;
    return Math.max(base, 20);
  };

  player.psycho.hp = floorV(player.psycho.hp);
  player.physio.stamina = floorV(player.physio.stamina);
  player.physio.satiety = floorV(player.physio.satiety);
  player.psycho.fatigue = floorV(player.psycho.fatigue);
  player.psycho.hypothermia = floorV(player.psycho.hypothermia);

  const t = Number(player.physio.temperatureC);
  const tSafe = Number.isFinite(t) ? t : 20;
  player.physio.temperatureC = Math.max(tSafe, 20);
}

function mergeWildernessFlags(w, patch) {
  const prev = w && typeof w.flags === "object" && !Array.isArray(w.flags) ? w.flags : {};
  return { ...prev, ...patch };
}

/**
 * @param {object|null|undefined} report
 */
export function collectEthanRescueNoticeDialogs(report) {
  const rows = Array.isArray(report?.wilderness?.results) ? report.wilderness.results : [];
  const out = [];
  for (const row of rows) {
    if (row?.type !== "WILDERNESS_ETHAN_RESCUE_CHECK") continue;
    const n = row.notice;
    if (!n || typeof n !== "object") continue;
    const title = String(n.title || "").trim() || "搜救";
    const message = String(n.message || "").trim();
    if (!message) continue;
    out.push({
      title,
      message,
      actions: Array.isArray(n.actions) && n.actions.length > 0
        ? n.actions
        : [{ id: "ok", label: "知道了", kind: "primary" }]
    });
  }
  return out;
}

/**
 * @param {object} activeState
 * @param {object[]} results
 * @param {{ beforeSurvival: object, afterSurvival: object, mp: object }} ctx
 * @param {object} wildernessExtras
 * @returns {{ skipLandmark: boolean, navigateMapId: string | null }}
 */
export function processWildernessEthanRescueAfterMove(activeState, results, ctx, wildernessExtras) {
  const out = { skipLandmark: false, navigateMapId: null };
  if (!wildernessExtras || typeof wildernessExtras !== "object") return out;

  const cur = activeState?.world?.wilderness;
  if (!cur || typeof cur !== "object" || cur.active !== true) return out;

  const { beforeSurvival, afterSurvival } = ctx;
  const reason = detectEthanRescueEligibleCollapse({ before: beforeSurvival, after: afterSurvival });
  if (!reason) return out;

  const sessionStartedAt = cur.sessionStartedAt;
  const areaId = String(cur.areaId || "").trim();
  const regionId = String(cur.regionId || "").trim();
  const x = Number.isInteger(cur.x) ? cur.x : Math.trunc(Number(cur.x) || 0);
  const y = Number.isInteger(cur.y) ? cur.y : Math.trunc(Number(cur.y) || 0);
  const stepsTaken = Math.max(0, Math.trunc(Number(cur.stepsTaken ?? 0)));

  const eventKey = buildEthanRescueEventKey({ sessionStartedAt, areaId, x, y, stepsTaken, reason });
  const prevKey = cur.flags && typeof cur.flags === "object" ? String(cur.flags.ethanRescueLastHandledKey || "").trim() : "";

  if (prevKey === eventKey) {
    results.push({
      type: "WILDERNESS_ETHAN_RESCUE_CHECK",
      ok: true,
      collapseDetected: true,
      reason,
      rescueEligible: true,
      repeatedEventSkipped: true,
      eventKey
    });
    return out;
  }

  const { chance, distance, profileKey } = computeEthanRescueChance(regionId, x, y);
  const nowMin = Math.max(0, Math.floor(Number(activeState?.time?.totalMinutes ?? 0)));
  const seedInput = {
    sessionStartedAt,
    areaId,
    regionId,
    x,
    y,
    stepsTaken,
    reason,
    totalMinutes: nowMin
  };
  const rescueRoll = createDeterministicEthanRescueRoll(seedInput);
  const rescueSuccess = rescueRoll < chance;

  const flagPatch = {
    ethanRescueLastHandledKey: eventKey,
    ethanRescueLastReason: reason,
    ethanRescueLastAt: nowMin
  };

  const baseCheck = {
    type: "WILDERNESS_ETHAN_RESCUE_CHECK",
    ok: true,
    collapseDetected: true,
    reason,
    rescueEligible: true,
    rescueProbability: chance,
    rescueRoll,
    rescueSuccess,
    repeatedEventSkipped: false,
    eventKey,
    regionId: profileKey,
    distanceToEthan: distance
  };

  if (rescueSuccess && reason === "fatigue_zero") {
    const fallbackMapId = String(cur.fallbackMapId || "west2_outpost_rescue_station").trim() || "west2_outpost_rescue_station";
    const patch = createRecoverWildernessSessionPatch({
      currentWilderness: cur,
      fallbackMapId,
      reason: "ethan_rescue_fatigue_zero",
      nowMinutes: nowMin
    });
    if (!patch.ok) {
      results.push({
        ...baseCheck,
        rescueSuccess: false,
        actionMode: "failed",
        notice: {
          title: "搜救落空",
          message: "救援状态无法结算，你只能先在原地缓一缓。"
        }
      });
      activeState.world.wilderness = normalizeWildernessState({
        ...cur,
        active: true,
        state: "RESCUE_PENDING",
        flags: mergeWildernessFlags(cur, flagPatch)
      });
      return out;
    }

    applyEthanRescueRecoveryFloor(activeState.player);
    activeState.world.wilderness = patch.wilderness;
    out.skipLandmark = true;
    out.navigateMapId = ETHAN_RESCUE_BED_MAP_ID;
    wildernessExtras.ethanRescueHandled = true;
    wildernessExtras.suppressGenericCollapseNotice = true;
    results.push({
      ...baseCheck,
      actionMode: "auto_carry",
      destinationMapId: ETHAN_RESCUE_BED_MAP_ID,
      attributeFloorApplied: true,
      notice: {
        title: "急救帐篷",
        message: "你没有撑到自己做决定。\n再醒来时，已经躺在急救帐篷的折叠床上。"
      }
    });
    return out;
  }

  if (rescueSuccess && reason === "stamina_zero") {
    activeState.world.wilderness = normalizeWildernessState({
      ...cur,
      active: true,
      state: "RESCUE_PENDING",
      flags: mergeWildernessFlags(cur, flagPatch)
    });
    out.skipLandmark = true;
    out.navigateMapId = ETHAN_RESCUE_OFFER_MAP_ID;
    wildernessExtras.ethanRescueHandled = true;
    wildernessExtras.suppressGenericCollapseNotice = true;
    results.push({
      ...baseCheck,
      actionMode: "offer",
      destinationMapId: ETHAN_RESCUE_OFFER_MAP_ID,
      attributeFloorApplied: false
    });
    return out;
  }

  activeState.world.wilderness = normalizeWildernessState({
    ...cur,
    active: true,
    state: "RESCUE_PENDING",
    flags: mergeWildernessFlags(cur, flagPatch)
  });
  results.push({
    ...baseCheck,
    rescueSuccess: false,
    actionMode: "failed",
    destinationMapId: null,
    attributeFloorApplied: false,
    notice: {
      title: "风雪里没有回应",
      message: "这一带没有搜救灯回应你的位置。你只能先靠自己稳住状态。"
    }
  });
  return out;
}
