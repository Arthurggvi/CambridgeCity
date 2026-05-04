import { getCalendarViewFromTotalMinutes, resolveTotalMinutesFromCalendarFields } from "./calendar_model.js";

export const THESEUS_ARRIVAL_SCHEDULE = Object.freeze([
  Object.freeze({
    batchId: "theseus_arrival_1106",
    arrivalMonth: 11,
    arrivalDay: 6,
    arrivalHour: 6,
    arrivalMinute: 0,
    departureMonth: 11,
    departureDay: 8,
    departureHour: 6,
    departureMinute: 0
  }),
  Object.freeze({
    batchId: "theseus_arrival_1201",
    arrivalMonth: 12,
    arrivalDay: 1,
    arrivalHour: 6,
    arrivalMinute: 0,
    departureMonth: 12,
    departureDay: 3,
    departureHour: 6,
    departureMinute: 0
  }),
  Object.freeze({
    batchId: "theseus_arrival_1229",
    arrivalMonth: 12,
    arrivalDay: 29,
    arrivalHour: 6,
    arrivalMinute: 0,
    departureMonth: 1,
    departureDay: 1,
    departureHour: 6,
    departureMinute: 0
  }),
  Object.freeze({
    batchId: "theseus_arrival_0126",
    arrivalMonth: 1,
    arrivalDay: 26,
    arrivalHour: 6,
    arrivalMinute: 0,
    departureMonth: 1,
    departureDay: 28,
    departureHour: 6,
    departureMinute: 0
  }),
  Object.freeze({
    batchId: "theseus_arrival_0223",
    arrivalMonth: 2,
    arrivalDay: 23,
    arrivalHour: 6,
    arrivalMinute: 0,
    departureMonth: 2,
    departureDay: 26,
    departureHour: 6,
    departureMinute: 0
  }),
  Object.freeze({
    batchId: "theseus_arrival_0313_final",
    arrivalMonth: 3,
    arrivalDay: 13,
    arrivalHour: 6,
    arrivalMinute: 0,
    departureMonth: 3,
    departureDay: 15,
    departureHour: 6,
    departureMinute: 0,
    boardingMonth: 3,
    boardingDay: 13
  })
]);

function normalizeTotalMinutes(totalMinutes) {
  return Math.max(0, Math.trunc(Number(totalMinutes ?? 0) || 0));
}

function getDepartureYear(arrivalYear, spec) {
  const arrivalCode = spec.arrivalMonth * 100 + spec.arrivalDay;
  const departureCode = spec.departureMonth * 100 + spec.departureDay;
  return departureCode < arrivalCode ? arrivalYear + 1 : arrivalYear;
}

function buildResolvedWindow(arrivalYear, spec, world = {}) {
  if (!Number.isInteger(arrivalYear) || arrivalYear < 1) return null;

  const arrivalResolved = resolveTotalMinutesFromCalendarFields(0, {
    year: arrivalYear,
    month: spec.arrivalMonth,
    day: spec.arrivalDay,
    hour: spec.arrivalHour,
    minute: spec.arrivalMinute
  }, world);
  if (!arrivalResolved?.ok || !Number.isFinite(arrivalResolved?.totalMinutes)) {
    return null;
  }

  const departureYear = getDepartureYear(arrivalYear, spec);
  const departureResolved = resolveTotalMinutesFromCalendarFields(0, {
    year: departureYear,
    month: spec.departureMonth,
    day: spec.departureDay,
    hour: spec.departureHour,
    minute: spec.departureMinute
  }, world);
  if (!departureResolved?.ok || !Number.isFinite(departureResolved?.totalMinutes)) {
    return null;
  }

  return Object.freeze({
    batchId: spec.batchId,
    arrivalYear,
    departureYear,
    arrivalMonth: spec.arrivalMonth,
    arrivalDay: spec.arrivalDay,
    arrivalHour: spec.arrivalHour,
    arrivalMinute: spec.arrivalMinute,
    departureMonth: spec.departureMonth,
    departureDay: spec.departureDay,
    departureHour: spec.departureHour,
    departureMinute: spec.departureMinute,
    boardingMonth: Number.isFinite(spec.boardingMonth) ? spec.boardingMonth : null,
    boardingDay: Number.isFinite(spec.boardingDay) ? spec.boardingDay : null,
    arrivalAtMinutes: arrivalResolved.totalMinutes,
    closeAtMinutes: departureResolved.totalMinutes
  });
}

export function resolveTheseusArrivalWindows(totalMinutes, world = {}) {
  const calendarView = getCalendarViewFromTotalMinutes(normalizeTotalMinutes(totalMinutes), world);
  const years = [calendarView.year - 1, calendarView.year, calendarView.year + 1];
  const windows = [];

  for (const year of years) {
    for (const spec of THESEUS_ARRIVAL_SCHEDULE) {
      const resolved = buildResolvedWindow(year, spec, world);
      if (resolved) windows.push(resolved);
    }
  }

  windows.sort((left, right) => left.arrivalAtMinutes - right.arrivalAtMinutes);
  return windows;
}

export function resolveTheseusArrivalWindowInfo(totalMinutes, world = {}) {
  const normalizedTotalMinutes = normalizeTotalMinutes(totalMinutes);
  const windows = resolveTheseusArrivalWindows(normalizedTotalMinutes, world);
  const activeWindow = windows.find((window) => (
    normalizedTotalMinutes >= window.arrivalAtMinutes
    && normalizedTotalMinutes < window.closeAtMinutes
  )) || null;

  return {
    windows,
    activeWindow,
    isOpen: !!activeWindow,
    closeAtMinutes: activeWindow?.closeAtMinutes ?? normalizedTotalMinutes
  };
}

export function isTheseusBoardingDate(totalMinutes, world = {}) {
  const calendarView = getCalendarViewFromTotalMinutes(normalizeTotalMinutes(totalMinutes), world);
  return THESEUS_ARRIVAL_SCHEDULE.some((spec) => (
    Number.isFinite(spec.boardingMonth)
    && Number.isFinite(spec.boardingDay)
    && Number(calendarView?.month) === Number(spec.boardingMonth)
    && Number(calendarView?.day) === Number(spec.boardingDay)
  ));
}