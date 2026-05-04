const MOVEMENT_ACTION_KINDS = new Set([
  "TRANSITION",
  "TRANSIT_STOP_ENTRY",
  "TRANSIT_BOARD",
  "TRANSIT_GET_OFF",
  "LOAD_MAP",
  "WILDERNESS_MOVE"
]);

export function isMovementAction(action) {
  if (!action || typeof action !== "object") return false;

  const kind = String(action.kind || "").trim().toUpperCase();
  if (MOVEMENT_ACTION_KINDS.has(kind)) {
    return true;
  }

  const toMapId = action?.payload?.toMapId;
  if (typeof toMapId === "string" && toMapId.trim() !== "") {
    return true;
  }

  const targetMapId = action?.targetMapId;
  return typeof targetMapId === "string" && targetMapId.trim() !== "";
}