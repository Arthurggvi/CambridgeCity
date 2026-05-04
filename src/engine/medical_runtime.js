import { cloneMedicalState } from "./medical_state.js";

let mapContentByMapId = {};

export function initMedicalRuntime(contentMap) {
  mapContentByMapId = contentMap || {};
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function parseHHMM(hhmm) {
  const s = String(hhmm || "06:00");
  const [hRaw, mRaw] = s.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  const hh = Number.isFinite(h) ? Math.max(0, Math.min(23, Math.trunc(h))) : 6;
  const mm = Number.isFinite(m) ? Math.max(0, Math.min(59, Math.trunc(m))) : 0;
  return hh * 60 + mm;
}

function nextAtMinute(totalMinutes, atMinuteOfDay) {
  const dayStart = totalMinutes - (totalMinutes % 1440);
  const todayAt = dayStart + atMinuteOfDay;
  if (totalMinutes < todayAt) return todayAt;
  return todayAt + 1440;
}

function getCurrentMapId(state) {
  return String(state?.currentMapId || state?.world?.currentMapId || state?.currentMap?.id || "").trim();
}

function getCurrentContent(state) {
  return mapContentByMapId[getCurrentMapId(state)] || null;
}

function getSessionSpecByCoverage(content, coverage) {
  const list = content?.SessionSpec?.sessions;
  if (!Array.isArray(list)) return null;

  if (coverage === "OBS") return list.find(s => s.session_type === "OBS") || null;
  if (coverage === "WARD_BED" || coverage === "WARD_NON_BED") {
    return list.find(s => s.session_type === "WARD") || null;
  }
  return null;
}

function getObsBlocker(content) {
  const blockers = content?.BlockerSpec?.blockers;
  if (!Array.isArray(blockers)) return null;
  return blockers.find(b => b.kind === "TIMEPOINT" && b.hard_stop === true) || null;
}

function createProjection(state) {
  return {
    medical: cloneMedicalState(state?.world?.medical),
    playerHp: toInt(state?.player?.psycho?.hp, 0),
    flagWrites: {}
  };
}

function cloneProjection(projection) {
  return {
    medical: cloneMedicalState(projection?.medical),
    playerHp: toInt(projection?.playerHp, 0),
    flagWrites: { ...(projection?.flagWrites || {}) }
  };
}

function ensureProjection(state, projection) {
  return projection ? cloneProjection(projection) : createProjection(state);
}

function ensureObsSession(medical, nowMinutes, content, spec) {
  const obs = medical.sessions.obs;
  if (obs.active && Number.isInteger(obs.endTimeMinutes)) return obs;

  const blocker = getObsBlocker(content);
  const atMinute = parseHHMM(blocker?.at || spec?.handover_time || "06:00");

  obs.active = true;
  obs.endTimeMinutes = nextAtMinute(nowMinutes, atMinute);
  obs.hpCap = Number(spec?.cap?.hp_max ?? 50);
  obs.healTickMinutes = Number(spec?.tick?.minutes ?? 30);
  obs.priceCentsPerHour = Number(spec?.billing?.cents_per_hour ?? 2500);
  obs.healProgressMinutes = Number(obs.healProgressMinutes || 0);
  obs.billingNumerator = Number(obs.billingNumerator || 0);
  obs.hardStopTriggered = false;

  return obs;
}

function ensureWardSession(medical, spec) {
  const ward = medical.sessions.ward;
  ward.active = true;
  ward.healthPerDay = Number(spec?.heal?.health_per_day ?? 20);
  ward.costPerDayCents = Number(spec?.billing?.per_day_cents ?? 20000);
  ward.dischargeThresholdHealth = Number(spec?.discharge_threshold_health ?? 80);
  return ward;
}

export function createMedicalAdvanceProjection(state) {
  return createProjection(state);
}

export function getMinutesToNextHardStop(state, nowTotalMinutes, advanceContext = {}, projection = null) {
  const nextProjection = ensureProjection(state, projection);

  if (advanceContext?.sessionCoverage !== "OBS") {
    return { minutes: Infinity, projection: nextProjection };
  }

  const content = getCurrentContent(state);
  const spec = getSessionSpecByCoverage(content, "OBS");
  if (!spec) {
    return { minutes: Infinity, projection: nextProjection };
  }

  const obs = ensureObsSession(nextProjection.medical, nowTotalMinutes, content, spec);
  if (!Number.isInteger(obs.endTimeMinutes)) {
    return { minutes: Infinity, projection: nextProjection };
  }

  return {
    minutes: Math.max(0, obs.endTimeMinutes - nowTotalMinutes),
    projection: nextProjection
  };
}

export function applySessionStep(state, stepMinutes, stepContext, advanceContext = {}, projection = null) {
  const nextProjection = ensureProjection(state, projection);
  const coverage = advanceContext?.sessionCoverage || "NONE";
  if (coverage === "NONE") return { hardStopReached: false, projection: nextProjection };

  const content = getCurrentContent(state);
  const spec = getSessionSpecByCoverage(content, coverage);
  if (!spec) return { hardStopReached: false, projection: nextProjection };

  const nowBefore = stepContext.timeBeforeMinutes;
  const nowAfter = stepContext.timeAfterMinutes;

  if (coverage === "OBS") {
    const obs = ensureObsSession(nextProjection.medical, nowBefore, content, spec);

    const endTime = obs.endTimeMinutes;
    const effective = Math.max(0, Math.min(stepMinutes, endTime - nowBefore));

    obs.healProgressMinutes += effective;
    const ticks = Math.floor(obs.healProgressMinutes / obs.healTickMinutes);
    const hp = Number(nextProjection.playerHp ?? 0);
    const hpCap = Number(obs.hpCap ?? 50);
    const hpGain = Math.max(0, Math.min(ticks, hpCap - hp));

    if (hpGain > 0) {
      nextProjection.playerHp += hpGain;
      obs.healProgressMinutes -= hpGain * obs.healTickMinutes;
    } else if (hp >= hpCap) {
      obs.healProgressMinutes = 0;
    }

    obs.billingNumerator += effective * obs.priceCentsPerHour;
    const addCents = Math.floor(obs.billingNumerator / 60);
    if (addCents > 0) {
      obs.billedCents += addCents;
      nextProjection.medical.bills.obsCents += addCents;
      obs.billingNumerator %= 60;
    }

    const hardStopReached = nowAfter >= endTime;
    if (hardStopReached && !obs.hardStopTriggered) {
      obs.hardStopTriggered = true;
      nextProjection.medical.pendingBlocker = {
        blockerId: getObsBlocker(content)?.id || "obs_handover_0600",
        atMinutes: endTime,
        event: getObsBlocker(content)?.event || "handover_dialogue",
        hardStop: true,
        locationId: getCurrentMapId(state)
      };
      nextProjection.flagWrites.obs_handover_pending = true;
    }

    return { hardStopReached, projection: nextProjection };
  }

  if (coverage === "WARD_BED" || coverage === "WARD_NON_BED") {
    const ward = ensureWardSession(nextProjection.medical, spec);

    const effective = Math.max(0, stepMinutes);
    if (coverage === "WARD_BED") {
      ward.wardMinutesTotal += effective;

      const billedDays = Math.ceil(ward.wardMinutesTotal / 1440);
      const newDaysToCharge = Math.max(0, billedDays - ward.alreadyChargedDays);
      if (newDaysToCharge > 0) {
        const add = newDaysToCharge * ward.costPerDayCents;
        ward.billedCents += add;
        nextProjection.medical.bills.wardCents += add;
        ward.alreadyChargedDays = billedDays;
      }
    }

    if (coverage === "WARD_BED") {
      ward.healProgressMinutes += effective;
      const dayTicks = Math.floor(ward.healProgressMinutes / 1440);
      if (dayTicks > 0) {
        const hp = Number(nextProjection.playerHp ?? 0);
        const threshold = Number(ward.dischargeThresholdHealth ?? 80);
        const intended = dayTicks * Number(ward.healthPerDay ?? 20);
        const gain = Math.max(0, Math.min(intended, threshold - hp));
        if (gain > 0) {
          nextProjection.playerHp += gain;
        }
        ward.healProgressMinutes -= dayTicks * 1440;
      }
    }

    return { hardStopReached: false, projection: nextProjection };
  }

  return { hardStopReached: false, projection: nextProjection };
}

export function buildMedicalAdvanceEffects(initialProjection, finalProjection) {
  const effects = [];
  if (JSON.stringify(initialProjection?.medical || null) !== JSON.stringify(finalProjection?.medical || null)) {
    effects.push({
      op: "set",
      path: "world.medical",
      value: cloneMedicalState(finalProjection?.medical)
    });
  }

  if (toInt(initialProjection?.playerHp, 0) !== toInt(finalProjection?.playerHp, 0)) {
    effects.push({
      op: "set",
      path: "player.psycho.hp",
      value: toInt(finalProjection?.playerHp, 0)
    });
  }

  for (const [key, value] of Object.entries(finalProjection?.flagWrites || {})) {
    effects.push({
      op: "set",
      path: `world.flags.${key}`,
      value
    });
  }

  return effects;
}

export function buildOnMapEnteredMedicalEffects(state, mapId) {
  const nextMapId = String(mapId || "");
  if (nextMapId === "bayport_clinic_obs") {
    return [];
  }

  const medical = cloneMedicalState(state?.world?.medical);
  if (medical.sessions.obs.active !== true) {
    return [];
  }

  medical.sessions.obs.active = false;
  return [{ op: "set", path: "world.medical", value: medical }];
}
