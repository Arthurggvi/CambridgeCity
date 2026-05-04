export function formatMinutes(minutes) {
  const totalMinutes = Number(minutes);
  const safeMinutes = Number.isFinite(totalMinutes)
    ? Math.max(0, Math.trunc(totalMinutes))
    : 0;

  if (safeMinutes <= 60) {
    return `${safeMinutes}分钟`;
  }

  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours}h${mins}m`;
}