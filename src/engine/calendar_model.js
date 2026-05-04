export const MINUTES_PER_DAY = 1440;

export const DEFAULT_START_YEAR = 1;
export const DEFAULT_START_DAY_OF_YEAR = 163;
export const DEFAULT_YEAR_LENGTH = 365;
export const DEFAULT_START_HOUR = 9;
export const DEFAULT_START_MINUTE = 15;
export const DEFAULT_START_TOTAL_MINUTES = DEFAULT_START_HOUR * 60 + DEFAULT_START_MINUTE;

export const LEGACY_DEFAULT_START_DAY_OF_YEAR = 96;
export const LEGACY_DEFAULT_YEAR_LENGTH = 360;

export const YEAR_LENGTH_LIMITS = Object.freeze({
  min: 365,
  max: 365
});

export const PlayerSeason = Object.freeze({
  Summer: "summer",
  Autumn: "autumn",
  Winter: "winter",
  Spring: "spring"
});

export const SeasonSubphase = Object.freeze({
  ThawStart: "thaw_start",
  OpenWaterSummer: "open_water_summer",
  FreezeOnset: "freeze_onset",
  ClosureTransition: "closure_transition",
  DeepClosure: "deep_closure",
  PreBreakup: "pre_breakup"
});

export const GREGORIAN_MONTH_LENGTHS = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

const SUBPHASE_WINDOWS = Object.freeze([
  Object.freeze({ subphase: SeasonSubphase.OpenWaterSummer, startDayOfYear: 335, endDayOfYear: 59 }),
  Object.freeze({ subphase: SeasonSubphase.FreezeOnset, startDayOfYear: 60, endDayOfYear: 104 }),
  Object.freeze({ subphase: SeasonSubphase.ClosureTransition, startDayOfYear: 105, endDayOfYear: 151 }),
  Object.freeze({ subphase: SeasonSubphase.DeepClosure, startDayOfYear: 152, endDayOfYear: 227 }),
  Object.freeze({ subphase: SeasonSubphase.PreBreakup, startDayOfYear: 228, endDayOfYear: 273 }),
  Object.freeze({ subphase: SeasonSubphase.ThawStart, startDayOfYear: 274, endDayOfYear: 334 })
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(Number(value) || 0, 0, 1);
}

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function roundTo(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function isLegacyDefaultCalendar(calendar = {}) {
  const startDayOfYear = Number(calendar?.startDayOfYear);
  const yearLength = Number(calendar?.yearLength);
  return startDayOfYear === LEGACY_DEFAULT_START_DAY_OF_YEAR && yearLength === LEGACY_DEFAULT_YEAR_LENGTH;
}

export function getDefaultWorldCalendar() {
  return {
    startYear: DEFAULT_START_YEAR,
    startDayOfYear: DEFAULT_START_DAY_OF_YEAR,
    yearLength: DEFAULT_YEAR_LENGTH
  };
}

export function normalizeYearLength(yearLength) {
  return clamp(toInt(yearLength, DEFAULT_YEAR_LENGTH), YEAR_LENGTH_LIMITS.min, YEAR_LENGTH_LIMITS.max);
}

export function normalizeDayOfYear(dayOfYear, yearLength = DEFAULT_YEAR_LENGTH) {
  const normalizedYearLength = normalizeYearLength(yearLength);
  const raw = toInt(dayOfYear, DEFAULT_START_DAY_OF_YEAR);
  return ((raw - 1) % normalizedYearLength + normalizedYearLength) % normalizedYearLength + 1;
}

export function getDayIndexInYear(dayOfYear, yearLength = DEFAULT_YEAR_LENGTH) {
  return normalizeDayOfYear(dayOfYear, yearLength) - 1;
}

export function normalizeWorldCalendar(calendar = {}) {
  if (isLegacyDefaultCalendar(calendar)) {
    return getDefaultWorldCalendar();
  }

  const yearLength = normalizeYearLength(calendar?.yearLength);
  const startDayOfYear = normalizeDayOfYear(calendar?.startDayOfYear, yearLength);
  const startYear = Math.max(1, toInt(calendar?.startYear, DEFAULT_START_YEAR));

  return {
    startYear,
    startDayOfYear,
    yearLength
  };
}

export function getMonthDayFromDayOfYear(dayOfYear, yearLength = DEFAULT_YEAR_LENGTH) {
  const normalizedDayOfYear = normalizeDayOfYear(dayOfYear, yearLength);
  let remaining = normalizedDayOfYear;

  for (let monthIndex = 0; monthIndex < GREGORIAN_MONTH_LENGTHS.length; monthIndex++) {
    const monthLength = GREGORIAN_MONTH_LENGTHS[monthIndex];
    if (remaining <= monthLength) {
      return {
        month: monthIndex + 1,
        day: remaining,
        monthLength
      };
    }
    remaining -= monthLength;
  }

  return {
    month: 12,
    day: 31,
    monthLength: 31
  };
}

export function getDayOfYearFromMonthDay(month, day, yearLength = DEFAULT_YEAR_LENGTH) {
  const normalizedYearLength = normalizeYearLength(yearLength);
  if (normalizedYearLength !== DEFAULT_YEAR_LENGTH) {
    return null;
  }

  const normalizedMonth = clamp(toInt(month, 1), 1, 12);
  const monthLength = GREGORIAN_MONTH_LENGTHS[normalizedMonth - 1] || 31;
  const normalizedDay = clamp(toInt(day, 1), 1, monthLength);
  let dayOfYear = normalizedDay;
  for (let monthIndex = 0; monthIndex < normalizedMonth - 1; monthIndex += 1) {
    dayOfYear += GREGORIAN_MONTH_LENGTHS[monthIndex];
  }
  return dayOfYear;
}

export function getSeasonFromMonth(month) {
  const normalizedMonth = clamp(toInt(month, 1), 1, 12);
  if (normalizedMonth === 12 || normalizedMonth <= 2) return PlayerSeason.Summer;
  if (normalizedMonth <= 5) return PlayerSeason.Autumn;
  if (normalizedMonth <= 8) return PlayerSeason.Winter;
  return PlayerSeason.Spring;
}

function getWrappedInclusiveLength(startDayOfYear, endDayOfYear, yearLength) {
  const startIndex = getDayIndexInYear(startDayOfYear, yearLength);
  const endIndex = getDayIndexInYear(endDayOfYear, yearLength);
  if (startIndex <= endIndex) return endIndex - startIndex + 1;
  return yearLength - startIndex + endIndex + 1;
}

function getWrappedOffset(dayOfYear, startDayOfYear, yearLength) {
  const startIndex = getDayIndexInYear(startDayOfYear, yearLength);
  const dayIndex = getDayIndexInYear(dayOfYear, yearLength);
  return ((dayIndex - startIndex) % yearLength + yearLength) % yearLength;
}

function isDayWithinWindow(dayOfYear, startDayOfYear, endDayOfYear, yearLength) {
  const offset = getWrappedOffset(dayOfYear, startDayOfYear, yearLength);
  const length = getWrappedInclusiveLength(startDayOfYear, endDayOfYear, yearLength);
  return offset < length;
}

function getWindowProgress01(dayOfYear, startDayOfYear, endDayOfYear, yearLength) {
  const length = getWrappedInclusiveLength(startDayOfYear, endDayOfYear, yearLength);
  if (length <= 1) return 1;
  const offset = getWrappedOffset(dayOfYear, startDayOfYear, yearLength);
  return clamp01(offset / (length - 1));
}

export function getSeasonSubphase(dayOfYear, yearLength = DEFAULT_YEAR_LENGTH) {
  const normalizedDayOfYear = normalizeDayOfYear(dayOfYear, yearLength);
  for (const window of SUBPHASE_WINDOWS) {
    if (isDayWithinWindow(normalizedDayOfYear, window.startDayOfYear, window.endDayOfYear, yearLength)) {
      return window.subphase;
    }
  }
  return SeasonSubphase.DeepClosure;
}

export function getClosureSeverity01(dayOfYear, seasonSubphase, yearLength = DEFAULT_YEAR_LENGTH) {
  const normalizedDayOfYear = normalizeDayOfYear(dayOfYear, yearLength);
  const matchedWindow = SUBPHASE_WINDOWS.find((window) => window.subphase === seasonSubphase);
  const phaseProgress01 = matchedWindow
    ? getWindowProgress01(normalizedDayOfYear, matchedWindow.startDayOfYear, matchedWindow.endDayOfYear, yearLength)
    : 0;

  switch (seasonSubphase) {
    case SeasonSubphase.ClosureTransition:
      return roundTo(phaseProgress01);
    case SeasonSubphase.DeepClosure:
      return 1;
    case SeasonSubphase.PreBreakup:
      return roundTo(1 - phaseProgress01);
    default:
      return 0;
  }
}

export function getCalendarDateParts(dayIndex, calendar = {}) {
  const normalizedCalendar = normalizeWorldCalendar(calendar);
  const absoluteDayIndex = getDayIndexInYear(normalizedCalendar.startDayOfYear, normalizedCalendar.yearLength)
    + Math.max(0, toInt(dayIndex, 0));
  const yearOffset = Math.floor(absoluteDayIndex / normalizedCalendar.yearLength);
  const year = normalizedCalendar.startYear + yearOffset;
  const dayIndexInYear = ((absoluteDayIndex % normalizedCalendar.yearLength) + normalizedCalendar.yearLength) % normalizedCalendar.yearLength;
  const dayOfYear = dayIndexInYear + 1;
  const monthDay = getMonthDayFromDayOfYear(dayOfYear, normalizedCalendar.yearLength);

  return {
    year,
    month: monthDay.month,
    day: monthDay.day,
    dayOfYear,
    dayIndexInYear,
    monthLength: monthDay.monthLength
  };
}

export function getCalendarViewFromTotalMinutes(totalMinutes, world = {}) {
  const normalizedTotalMinutes = Math.max(0, toInt(totalMinutes, DEFAULT_START_TOTAL_MINUTES));
  const dayIndex = Math.floor(normalizedTotalMinutes / MINUTES_PER_DAY);
  const minuteOfDay = normalizedTotalMinutes % MINUTES_PER_DAY;
  const calendar = normalizeWorldCalendar(world?.calendar || {});
  const date = getCalendarDateParts(dayIndex, calendar);
  const season = getSeasonFromMonth(date.month);
  const seasonSubphase = getSeasonSubphase(date.dayOfYear, calendar.yearLength);
  const closureSeverity01 = getClosureSeverity01(date.dayOfYear, seasonSubphase, calendar.yearLength);

  return {
    totalMinutes: normalizedTotalMinutes,
    minuteOfDay,
    dayIndex,
    year: date.year,
    month: date.month,
    day: date.day,
    dayOfYear: date.dayOfYear,
    dayIndexInYear: date.dayIndexInYear,
    monthLength: date.monthLength,
    season,
    seasonSubphase,
    isClosureSeason: closureSeverity01 > 0,
    closureSeverity01,
    startYear: calendar.startYear,
    startDayOfYear: calendar.startDayOfYear,
    yearLength: calendar.yearLength
  };
}

export function resolveTotalMinutesFromCalendarFields(baseTotalMinutes, fields = {}, world = {}) {
  const normalizedBase = Math.max(0, toInt(baseTotalMinutes, DEFAULT_START_TOTAL_MINUTES));
  const calendar = normalizeWorldCalendar(world?.calendar || {});
  const currentView = getCalendarViewFromTotalMinutes(normalizedBase, world);
  const rawYear = fields?.year;
  const parsedYear = rawYear === undefined || rawYear === null || rawYear === ""
    ? currentView.year
    : Number(rawYear);

  if (!Number.isFinite(parsedYear) || !Number.isInteger(parsedYear) || parsedYear < 1) {
    return { ok: false, error: "invalid-calendar-year" };
  }

  const month = clamp(toInt(fields?.month, currentView.month), 1, 12);
  const monthLength = GREGORIAN_MONTH_LENGTHS[month - 1] || 31;
  const day = clamp(toInt(fields?.day, currentView.day), 1, monthLength);
  const hour = clamp(toInt(fields?.hour, Math.floor(currentView.minuteOfDay / 60)), 0, 23);
  const minute = clamp(toInt(fields?.minute, currentView.minuteOfDay % 60), 0, 59);
  const dayOfYear = getDayOfYearFromMonthDay(month, day, calendar.yearLength);
  if (!Number.isFinite(dayOfYear)) {
    return { ok: false, error: "invalid-calendar-date" };
  }

  const yearOffset = parsedYear - calendar.startYear;
  const targetAbsoluteDayIndex = yearOffset * calendar.yearLength + (dayOfYear - 1);
  const startAbsoluteDayIndex = getDayIndexInYear(calendar.startDayOfYear, calendar.yearLength);
  const targetDayIndex = targetAbsoluteDayIndex - startAbsoluteDayIndex;

  if (targetDayIndex < 0) {
    return {
      ok: false,
      error: "before-world-start",
      normalized: { year: parsedYear, month, day, hour, minute, monthLength }
    };
  }

  return {
    ok: true,
    totalMinutes: targetDayIndex * MINUTES_PER_DAY + hour * 60 + minute,
    normalized: { year: parsedYear, month, day, hour, minute, monthLength }
  };
}