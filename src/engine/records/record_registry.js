import { recordDefinitions } from "../../../data/records/index.js";
import { validateRecordDefinitions } from "./record_validate.js";

const ALL_RECORDS = validateRecordDefinitions(recordDefinitions, "data/records/index.js");
const RECORD_MAP = new Map(ALL_RECORDS.map((record) => [record.id, record]));

export function getRecordById(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  return RECORD_MAP.get(key) || null;
}

export function hasRecord(id) {
  const key = String(id || "").trim();
  if (!key) return false;
  return RECORD_MAP.has(key);
}

export function listAllRecords() {
  return ALL_RECORDS.slice();
}

export { ALL_RECORDS as allRecords };