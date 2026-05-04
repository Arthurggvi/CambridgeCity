const MINUTES_PER_DAY = 1440;

function normalizeMinuteOfDay(value) {
  const numeric = Math.trunc(Number(value) || 0);
  return ((numeric % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function normalizeTotalMinutes(totalMinutes) {
  return Math.max(0, Math.trunc(Number(totalMinutes ?? 0) || 0));
}

export function getMinuteOfDayFromTotalMinutes(totalMinutes) {
  const normalized = normalizeTotalMinutes(totalMinutes);
  return normalizeMinuteOfDay(normalized);
}

export function getDayIndexFromTotalMinutes(totalMinutes) {
  const normalized = normalizeTotalMinutes(totalMinutes);
  return Math.floor(normalized / MINUTES_PER_DAY);
}

export function resolveDailyOpenWindow(totalMinutes, openMinuteOfDay, closeMinuteOfDay) {
  const normalizedTotalMinutes = normalizeTotalMinutes(totalMinutes);
  const minuteOfDay = getMinuteOfDayFromTotalMinutes(normalizedTotalMinutes);
  const dayStartMinutes = normalizedTotalMinutes - minuteOfDay;
  const openMinute = normalizeMinuteOfDay(openMinuteOfDay);
  const closeMinute = normalizeMinuteOfDay(closeMinuteOfDay);

  if (openMinute === closeMinute) {
    return {
      isOpen: true,
      closeAtMinutes: dayStartMinutes + MINUTES_PER_DAY,
      activeWindow: {
        openAtMinutes: dayStartMinutes,
        closeAtMinutes: dayStartMinutes + MINUTES_PER_DAY
      },
      windows: [{ openAtMinutes: dayStartMinutes, closeAtMinutes: dayStartMinutes + MINUTES_PER_DAY }]
    };
  }

  if (openMinute < closeMinute) {
    const openAtMinutes = dayStartMinutes + openMinute;
    const closeAtMinutes = dayStartMinutes + closeMinute;
    const isOpen = minuteOfDay >= openMinute && minuteOfDay < closeMinute;
    return {
      isOpen,
      closeAtMinutes: isOpen ? closeAtMinutes : normalizedTotalMinutes,
      activeWindow: isOpen
        ? { openAtMinutes, closeAtMinutes }
        : null,
      windows: [{ openAtMinutes, closeAtMinutes }]
    };
  }

  const overnightOpenAtMinutes = minuteOfDay >= openMinute
    ? dayStartMinutes + openMinute
    : dayStartMinutes - MINUTES_PER_DAY + openMinute;
  const overnightCloseAtMinutes = minuteOfDay >= openMinute
    ? dayStartMinutes + MINUTES_PER_DAY + closeMinute
    : dayStartMinutes + closeMinute;
  const isOpen = minuteOfDay >= openMinute || minuteOfDay < closeMinute;

  return {
    isOpen,
    closeAtMinutes: isOpen ? overnightCloseAtMinutes : normalizedTotalMinutes,
    activeWindow: isOpen
      ? {
          openAtMinutes: overnightOpenAtMinutes,
          closeAtMinutes: overnightCloseAtMinutes
        }
      : null,
    windows: [{ openAtMinutes: overnightOpenAtMinutes, closeAtMinutes: overnightCloseAtMinutes }]
  };
}