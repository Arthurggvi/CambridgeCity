import { getCalendarViewFromTotalMinutes, resolveTotalMinutesFromCalendarFields } from "../../calendar_model.js";
import {
  resolveTheseusBoardingEligibility,
  THESEUS_CREW_DENIED_EVENT_ID,
  THESEUS_CREW_OPEN_DENIED_ACTION_ID,
  THESEUS_CREW_CONFIRM_BOARDING_ACTION_ID,
  THESEUS_ENDING_FINISH_ACTION_ID,
  THESEUS_ENDING_FINAL_MAP_ID,
  THESEUS_ENDING_MIDPOINT_ACTION_ID,
  THESEUS_ENDING_PAGE_01_MAP_ID,
  THESEUS_ENDING_PAGE_12_MAP_ID
} from "../../theseus_boarding.js";

function resolveTheseusEndingTimeTotalMinutes(gameState, fields) {
  const baseMinutes = Number(gameState?.time?.totalMinutes ?? 0);
  const calendarView = getCalendarViewFromTotalMinutes(baseMinutes, gameState?.world || {});
  const result = resolveTotalMinutesFromCalendarFields(baseMinutes, {
    year: calendarView.year,
    ...fields
  }, gameState?.world || {});
  return result?.ok === true ? result.totalMinutes : baseMinutes;
}

function buildSequenceStateLock(gameState) {
  const limits = gameState?.player?.limits || {};
  return {
    active: true,
    coreVitals: {
      hp: Math.max(0, Number(limits.hpMax ?? 100) || 100),
      satiety: Math.max(0, Number(limits.satietyMax ?? 100) || 100),
      stamina: Math.max(0, Number(limits.staminaMax ?? 100) || 100),
      fatigue: Math.max(0, Number(limits.fatigueMax ?? 100) || 100),
      temperatureC: 37,
      hypothermia: 100,
      hypoStage: "Safe",
      incapacitated: false,
      dead: false
    }
  };
}

export async function handleTheseusActions(ctx) {
  const { id, plan, gameState, addEffect, addNote, addSysCall, Effects, SYSCALL_TYPES } = ctx;

  if (id === THESEUS_CREW_OPEN_DENIED_ACTION_ID) {
    addNote(plan, "Theseus boarding denied: redirect to denied dialogue map");
    addSysCall(plan, SYSCALL_TYPES.LOAD_EVENT, { eventId: THESEUS_CREW_DENIED_EVENT_ID });
    return true;
  }

  if (id === THESEUS_CREW_CONFIRM_BOARDING_ACTION_ID) {
    const eligibility = resolveTheseusBoardingEligibility(gameState);
    if (!eligibility.isEligible) {
      addNote(plan, "Theseus boarding confirm rejected: eligibility not met, redirect to denied dialogue map");
      addSysCall(plan, SYSCALL_TYPES.LOAD_EVENT, { eventId: THESEUS_CREW_DENIED_EVENT_ID });
      return true;
    }

    addNote(plan, "Theseus boarding confirm accepted: enter ending map chain");
    const lock = buildSequenceStateLock(gameState);
    addEffect(plan, Effects.set("player.meta.sequenceStateLock", lock));
    addEffect(plan, Effects.set("player.psycho.hp", lock.coreVitals.hp));
    addEffect(plan, Effects.set("player.physio.satiety", lock.coreVitals.satiety));
    addEffect(plan, Effects.set("player.physio.stamina", lock.coreVitals.stamina));
    addEffect(plan, Effects.set("player.psycho.fatigue", lock.coreVitals.fatigue));
    addEffect(plan, Effects.set("player.physio.temperatureC", lock.coreVitals.temperatureC));
    addEffect(plan, Effects.set("player.psycho.hypothermia", lock.coreVitals.hypothermia));
    addEffect(plan, Effects.set("player.psycho.hypoStage", lock.coreVitals.hypoStage));
    addEffect(plan, Effects.set("player.exposure.hypo100", lock.coreVitals.hypothermia));
    addEffect(plan, Effects.set("player.exposure.incapacitated", false));
    addEffect(plan, Effects.set("player.exposure.dead", false));
    addEffect(plan, Effects.set("time.totalMinutes", resolveTheseusEndingTimeTotalMinutes(gameState, {
      month: 3,
      day: 14,
      hour: 11,
      minute: 28
    })));
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: THESEUS_ENDING_PAGE_01_MAP_ID });
    return true;
  }

  if (id === THESEUS_ENDING_MIDPOINT_ACTION_ID) {
    addEffect(plan, Effects.set("time.totalMinutes", resolveTheseusEndingTimeTotalMinutes(gameState, {
      month: 3,
      day: 15,
      hour: 6,
      minute: 28
    })));
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: THESEUS_ENDING_PAGE_12_MAP_ID });
    return true;
  }

  if (id === THESEUS_ENDING_FINISH_ACTION_ID) {
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: THESEUS_ENDING_FINAL_MAP_ID });
    return true;
  }

  return false;
}