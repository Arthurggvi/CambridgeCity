export function shouldUseHostClock(map) {
  return !!map && String(map.id || "") === "menu_main";
}

export function getHostClockTimeView() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const minuteOfDay = hour * 60 + minute;
  const day = Math.max(1, now.getDate());
  return {
    day,
    hour,
    minute,
    minuteOfDay,
    dayIndex0: Math.max(0, day - 1),
    totalMinutes: day * 1440 + minuteOfDay
  };
}
