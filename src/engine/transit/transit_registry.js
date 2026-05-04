import transitData, { transitLines, transitStops } from "../../../data/transit/index.js";

const stopById = new Map();
const lineById = new Map();

for (const stop of transitStops) {
  stopById.set(String(stop.stopId || ""), stop);
}

for (const line of transitLines) {
  lineById.set(String(line.lineId || ""), line);
}

const registrySnapshot = Object.freeze({
  data: transitData,
  stops: transitStops,
  lines: transitLines,
  stopById,
  lineById
});

export function getTransitRegistry() {
  return registrySnapshot;
}

export function getTransitStopRegistry() {
  return stopById;
}

export function getTransitLineRegistry() {
  return lineById;
}