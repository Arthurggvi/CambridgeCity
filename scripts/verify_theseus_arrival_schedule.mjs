import {
  THESEUS_ARRIVAL_SCHEDULE,
  isTheseusBoardingDate,
  resolveTheseusArrivalWindowInfo
} from "../src/engine/theseus_arrival_schedule.js";
import { getDefaultWorldCalendar, resolveTotalMinutesFromCalendarFields } from "../src/engine/calendar_model.js";

const LEGACY_WINDOWS = Object.freeze([
  Object.freeze({ arrivalMonth: 11, arrivalDay: 6, departureMonth: 11, departureDay: 8 }),
  Object.freeze({ arrivalMonth: 12, arrivalDay: 1, departureMonth: 12, departureDay: 3 }),
  Object.freeze({ arrivalMonth: 12, arrivalDay: 29, departureMonth: 1, departureDay: 1 }),
  Object.freeze({ arrivalMonth: 1, arrivalDay: 26, departureMonth: 1, departureDay: 28 }),
  Object.freeze({ arrivalMonth: 2, arrivalDay: 23, departureMonth: 2, departureDay: 26 }),
  Object.freeze({ arrivalMonth: 3, arrivalDay: 13, departureMonth: 3, departureDay: 15 })
]);

const LEGACY_BOARDING_DATE = Object.freeze({ month: 3, day: 13 });
const WORLD = Object.freeze({ calendar: getDefaultWorldCalendar() });

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getDepartureYear(arrivalYear, spec) {
  const arrivalCode = spec.arrivalMonth * 100 + spec.arrivalDay;
  const departureCode = spec.departureMonth * 100 + spec.departureDay;
  return departureCode < arrivalCode ? arrivalYear + 1 : arrivalYear;
}

function resolveMinutes(fields) {
  const result = resolveTotalMinutesFromCalendarFields(0, fields, WORLD);
  assert(result?.ok === true && Number.isFinite(result?.totalMinutes), `Failed to resolve calendar fields: ${JSON.stringify(fields)}`);
  return result.totalMinutes;
}

function buildLegacyWindowInfo(totalMinutes) {
  const windows = [];
  for (const year of [1, 2, 3]) {
    for (const spec of LEGACY_WINDOWS) {
      const arrivalResolved = resolveTotalMinutesFromCalendarFields(0, {
        year,
        month: spec.arrivalMonth,
        day: spec.arrivalDay,
        hour: 6,
        minute: 0
      }, WORLD);
      if (arrivalResolved?.ok !== true || !Number.isFinite(arrivalResolved?.totalMinutes)) {
        continue;
      }

      const departureResolved = resolveTotalMinutesFromCalendarFields(0, {
          year: getDepartureYear(year, spec),
          month: spec.departureMonth,
          day: spec.departureDay,
          hour: 6,
          minute: 0
        }, WORLD);
      assert(departureResolved?.ok === true && Number.isFinite(departureResolved?.totalMinutes), `Failed to resolve legacy departure for year ${year}: ${JSON.stringify(spec)}`);

      windows.push({
        arrivalAtMinutes: arrivalResolved.totalMinutes,
        closeAtMinutes: departureResolved.totalMinutes
      });
    }
  }
  windows.sort((left, right) => left.arrivalAtMinutes - right.arrivalAtMinutes);
  const activeWindow = windows.find((window) => totalMinutes >= window.arrivalAtMinutes && totalMinutes < window.closeAtMinutes) || null;
  return {
    isOpen: !!activeWindow,
    activeWindow
  };
}

function buildWindowProbe(year, month, day, hour, minute) {
  return {
    year,
    month,
    day,
    hour,
    minute,
    totalMinutes: resolveMinutes({ year, month, day, hour, minute })
  };
}

const expectedScheduleShape = LEGACY_WINDOWS.map((spec) => `${spec.arrivalMonth}-${spec.arrivalDay}->${spec.departureMonth}-${spec.departureDay}`);
const actualScheduleShape = THESEUS_ARRIVAL_SCHEDULE.map((spec) => `${spec.arrivalMonth}-${spec.arrivalDay}->${spec.departureMonth}-${spec.departureDay}`);
assert(JSON.stringify(actualScheduleShape) === JSON.stringify(expectedScheduleShape), "Theseus arrival schedule no longer matches legacy window pairs");

const boardingRows = THESEUS_ARRIVAL_SCHEDULE.filter((spec) => Number.isFinite(spec.boardingMonth) && Number.isFinite(spec.boardingDay));
assert(boardingRows.length === 1, "Theseus arrival schedule must contain exactly one boarding date row");
assert(boardingRows[0].boardingMonth === LEGACY_BOARDING_DATE.month && boardingRows[0].boardingDay === LEGACY_BOARDING_DATE.day, "Theseus boarding date no longer matches legacy implementation");

const probes = [
  buildWindowProbe(1, 11, 5, 23, 59),
  buildWindowProbe(1, 11, 6, 6, 0),
  buildWindowProbe(1, 12, 30, 12, 0),
  buildWindowProbe(2, 3, 13, 12, 0),
  buildWindowProbe(2, 3, 15, 6, 0)
];

const results = probes.map((probe) => {
  const legacy = buildLegacyWindowInfo(probe.totalMinutes);
  const current = resolveTheseusArrivalWindowInfo(probe.totalMinutes, WORLD);
  assert(current.isOpen === legacy.isOpen, `Open-state mismatch at ${probe.year}-${probe.month}-${probe.day} ${probe.hour}:${probe.minute}`);
  assert((current.activeWindow?.arrivalAtMinutes ?? null) === (legacy.activeWindow?.arrivalAtMinutes ?? null), `Arrival mismatch at ${probe.year}-${probe.month}-${probe.day} ${probe.hour}:${probe.minute}`);
  assert((current.activeWindow?.closeAtMinutes ?? null) === (legacy.activeWindow?.closeAtMinutes ?? null), `Close mismatch at ${probe.year}-${probe.month}-${probe.day} ${probe.hour}:${probe.minute}`);
  return {
    probe: `${probe.year}-${String(probe.month).padStart(2, "0")}-${String(probe.day).padStart(2, "0")} ${String(probe.hour).padStart(2, "0")}:${String(probe.minute).padStart(2, "0")}`,
    isOpen: current.isOpen,
    arrivalAtMinutes: current.activeWindow?.arrivalAtMinutes ?? null,
    closeAtMinutes: current.activeWindow?.closeAtMinutes ?? null
  };
});

const boardingChecks = [
  { year: 2, month: 3, day: 12, expected: false },
  { year: 2, month: 3, day: 13, expected: true },
  { year: 2, month: 3, day: 14, expected: false }
].map((entry) => {
  const totalMinutes = resolveMinutes({ ...entry, hour: 12, minute: 0 });
  const actual = isTheseusBoardingDate(totalMinutes, WORLD);
  assert(actual === entry.expected, `Boarding-date mismatch at ${entry.year}-${entry.month}-${entry.day}`);
  return {
    probe: `${entry.year}-${String(entry.month).padStart(2, "0")}-${String(entry.day).padStart(2, "0")}`,
    expected: entry.expected,
    actual
  };
});

console.log(JSON.stringify({
  scheduleFile: "src/engine/theseus_arrival_schedule.js",
  verifiedWindowPairs: actualScheduleShape,
  windowProbes: results,
  boardingChecks
}, null, 2));