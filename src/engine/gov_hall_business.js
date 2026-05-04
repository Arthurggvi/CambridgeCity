export function getGovHallWeekday(totalMinutes) {
  const normalizedTotalMinutes = Math.max(0, Math.floor(Number(totalMinutes ?? 0) || 0));
  const dayIndex = Math.floor(normalizedTotalMinutes / 1440);
  return ((dayIndex % 7) + 7) % 7;
}

export function getGovHallBusinessState(state) {
  const totalMinutes = Math.max(0, Math.floor(Number(state?.time?.totalMinutes ?? 0) || 0));
  const minuteOfDay = totalMinutes % 1440;
  const weekday = getGovHallWeekday(totalMinutes);
  const isWeekdayOpen = weekday >= 0 && weekday <= 5;
  const isDay = minuteOfDay >= 360 && minuteOfDay <= 1079;
  const isNormalBusiness = isWeekdayOpen && minuteOfDay >= 540 && minuteOfDay <= 1079;
  const flags = state?.world?.flags || state?.flags || {};
  const nightEmergencyOpen = !!flags.govHallNightEmergencyOpen;
  const isEmergencyNightBusiness = !isDay && isWeekdayOpen && nightEmergencyOpen;
  const isOpen = isNormalBusiness || isEmergencyNightBusiness;

  return {
    isOpen,
    minuteOfDay,
    weekday,
    isWeekdayOpen,
    isDay,
    nightEmergencyOpen,
    key: `${isDay ? "day" : "night"}_${isOpen ? "open" : "closed"}`
  };
}

export function isGovHallBusinessOpen(state) {
  return getGovHallBusinessState(state).isOpen;
}