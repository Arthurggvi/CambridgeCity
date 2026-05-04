export const BUILD = {
  gameVersion: "0.3.5",
  saveSchemaVersion: 12,
  buildId: "2026-03-13.1"
};

export function formatVersionLine(build = BUILD) {
  return `Version v${build.gameVersion} · Save Schema v${build.saveSchemaVersion} · Build ${build.buildId}`;
}

export function formatAutoLastLine(autoSlot) {
  if (!autoSlot || autoSlot.isEmpty) return "Auto Last: —";
  if (autoSlot.corrupted) return "Auto Last: (invalid)";

  const day = Number(autoSlot.day);
  if (Number.isFinite(day) && day > 0) {
    return `Auto Last: Day ${Math.max(1, Math.floor(day))}`;
  }

  const minutes = Number(autoSlot.playtimeMinutes);
  if (Number.isFinite(minutes) && minutes >= 0) {
    return `Auto Last: Day ${Math.floor(minutes / 1440) + 1}`;
  }

  return "Auto Last: —";
}
