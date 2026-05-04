export function hashStableString(value) {
  const source = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildStableCalendarDayKey(calendarLike = {}) {
  const year = Number(calendarLike?.year || 0);
  const dayOfYear = Number(calendarLike?.dayOfYear || 0);
  return `${year}:${dayOfYear}`;
}