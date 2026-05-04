import { getDayIndexFromTotalMinutes, getMinuteOfDayFromTotalMinutes, normalizeTotalMinutes } from "./daily_open_window.js";

export const MARG_FRONTDESK_DUTY_PROVIDER_ID = "npc_marg_frontdesk";
export const MARG_FRONTDESK_NPC_ID = "npc_marg";

export const MARG_FRONTDESK_DUTY_BANDS = Object.freeze({
  ON_DUTY: "marg_frontdesk_on_duty",
  READING_ROOM_LADDER: "marg_reading_room_shelving_ladder",
  LUNCH_BREAK: "marg_frontdesk_lunch_break",
  READING_ROOM_FLOOR: "marg_reading_room_shelving_floor",
  OFF_DUTY: "marg_frontdesk_off_duty"
});

const MARG_FRONTDESK_TAG_META_BY_BAND = Object.freeze({
  [MARG_FRONTDESK_DUTY_BANDS.ON_DUTY]: Object.freeze({
    tagId: "marg_frontdesk_on_duty",
    label: "玛格·接待前台上班中"
  }),
  [MARG_FRONTDESK_DUTY_BANDS.READING_ROOM_LADDER]: Object.freeze({
    tagId: "marg_reading_room_shelving_ladder",
    label: "玛格·阅览室整理图书（木梯）"
  }),
  [MARG_FRONTDESK_DUTY_BANDS.LUNCH_BREAK]: Object.freeze({
    tagId: "marg_frontdesk_lunch_break",
    label: "玛格·午休中"
  }),
  [MARG_FRONTDESK_DUTY_BANDS.READING_ROOM_FLOOR]: Object.freeze({
    tagId: "marg_reading_room_shelving_floor",
    label: "玛格·阅览室整理图书（地面）"
  }),
  [MARG_FRONTDESK_DUTY_BANDS.OFF_DUTY]: Object.freeze({
    tagId: "marg_frontdesk_off_duty",
    label: "玛格·当前不在岗"
  })
});

const MARG_WEEKDAY_DUTY_WINDOWS = Object.freeze([
  Object.freeze({ start: 8 * 60, end: 10 * 60, band: MARG_FRONTDESK_DUTY_BANDS.ON_DUTY }),
  Object.freeze({ start: 11 * 60, end: 12 * 60, band: MARG_FRONTDESK_DUTY_BANDS.READING_ROOM_LADDER }),
  Object.freeze({ start: 12 * 60, end: 13 * 60, band: MARG_FRONTDESK_DUTY_BANDS.LUNCH_BREAK }),
  Object.freeze({ start: 13 * 60, end: 14 * 60, band: MARG_FRONTDESK_DUTY_BANDS.READING_ROOM_FLOOR }),
  Object.freeze({ start: 15 * 60, end: 17 * 60, band: MARG_FRONTDESK_DUTY_BANDS.ON_DUTY })
]);

export const MARG_FRONTDESK_DUTY_BOUNDARY_MINUTES = Object.freeze(
  Array.from(new Set(MARG_WEEKDAY_DUTY_WINDOWS.flatMap((windowSpec) => [windowSpec.start, windowSpec.end])))
    .sort((left, right) => left - right)
);

const MARG_READING_ROOM_BANDS = new Set([
  MARG_FRONTDESK_DUTY_BANDS.READING_ROOM_LADDER,
  MARG_FRONTDESK_DUTY_BANDS.READING_ROOM_FLOOR
]);

function isMargReadingRoomUnlocked(gameState) {
  return gameState?.world?.flags?.west2LibraryMargIntroSeen === true;
}

function pickMargDutyBandFromWeekdayWindows(minuteOfDay) {
  const minute = Math.max(0, Math.trunc(Number(minuteOfDay) || 0));
  for (const windowSpec of MARG_WEEKDAY_DUTY_WINDOWS) {
    if (minute >= windowSpec.start && minute < windowSpec.end) {
      return windowSpec.band;
    }
  }
  return MARG_FRONTDESK_DUTY_BANDS.OFF_DUTY;
}

export function getWeekdayIndexFromTotalMinutes(totalMinutes) {
  return getDayIndexFromTotalMinutes(totalMinutes) % 7;
}

export function resolveMargFrontdeskDutyBand({ enabled = true, weekday = 0, minuteOfDay = 0 } = {}) {
  if (enabled !== true) return MARG_FRONTDESK_DUTY_BANDS.OFF_DUTY;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 4) {
    return MARG_FRONTDESK_DUTY_BANDS.OFF_DUTY;
  }

  return pickMargDutyBandFromWeekdayWindows(minuteOfDay);
}

export function resolveMargFrontdeskDutySnapshot({ gameState = null, totalMinutes = null } = {}) {
  const resolvedTotalMinutes = normalizeTotalMinutes(totalMinutes ?? gameState?.time?.totalMinutes);
  const minuteOfDay = getMinuteOfDayFromTotalMinutes(resolvedTotalMinutes);
  const weekday = getWeekdayIndexFromTotalMinutes(resolvedTotalMinutes);
  const enabled = gameState?.world?.npcs?.enabledById?.[MARG_FRONTDESK_NPC_ID] !== false;
  const baseBand = resolveMargFrontdeskDutyBand({ enabled, weekday, minuteOfDay });
  const band = MARG_READING_ROOM_BANDS.has(baseBand) && !isMargReadingRoomUnlocked(gameState)
    ? MARG_FRONTDESK_DUTY_BANDS.OFF_DUTY
    : baseBand;
  const tagMeta = MARG_FRONTDESK_TAG_META_BY_BAND[band] || MARG_FRONTDESK_TAG_META_BY_BAND[MARG_FRONTDESK_DUTY_BANDS.OFF_DUTY];

  return Object.freeze({
    providerId: MARG_FRONTDESK_DUTY_PROVIDER_ID,
    npcId: MARG_FRONTDESK_NPC_ID,
    enabled,
    totalMinutes: resolvedTotalMinutes,
    minuteOfDay,
    weekday,
    band,
    tagId: tagMeta.tagId,
    label: tagMeta.label,
    isOnDuty: band === MARG_FRONTDESK_DUTY_BANDS.ON_DUTY,
    isLunchBreak: band === MARG_FRONTDESK_DUTY_BANDS.LUNCH_BREAK
  });
}