export function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function getAtmospherePhaseKey(phase) {
  switch (phase) {
    case "Morning":
      return "morning";
    case "Noon":
      return "noon";
    case "Afternoon":
      return "afternoon";
    case "Evening":
      return "evening";
    case "Midnight":
      return "midnight";
    case "Dawn":
    default:
      return "dawn";
  }
}
