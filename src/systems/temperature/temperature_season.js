import { DEFAULT_YEAR_LENGTH, getDayIndexInYear, normalizeDayOfYear, normalizeWorldCalendar } from "../../engine/calendar_model.js";

const TWO_PI = Math.PI * 2;
const DEFAULT_WINTER_PEAK_DAY_OF_YEAR = 191;

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundTo(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

export function getSeasonTemperatureDelta(regionCfg = {}, dayOfYear, worldCalendar = null, defs = {}) {
  const yearLength = normalizeWorldCalendar(worldCalendar || { yearLength: DEFAULT_YEAR_LENGTH }).yearLength;
  const normalizedDayOfYear = normalizeDayOfYear(dayOfYear, yearLength);
  const amplitude = toFinite(regionCfg?.A_region, 0);
  const winterPeakDayOfYear = normalizeDayOfYear(defs?.winterPeakDayOfYear ?? DEFAULT_WINTER_PEAK_DAY_OF_YEAR, yearLength);
  const seasonAngle = TWO_PI * (getDayIndexInYear(normalizedDayOfYear, yearLength) - getDayIndexInYear(winterPeakDayOfYear, yearLength)) / yearLength;
  return roundTo(-amplitude * Math.cos(seasonAngle));
}