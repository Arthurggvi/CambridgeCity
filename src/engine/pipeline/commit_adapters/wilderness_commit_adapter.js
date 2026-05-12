import {
  createDefaultWildernessEventQueue,
  normalizeWildernessEventQueue
} from "../../wilderness/events/wilderness_event_queue_state.js";
import { integrateWildernessEventQueueAfterSuccessfulMove } from "../../wilderness/events/wilderness_event_move_integration.js";

/**
 * After a successful wilderness move commit, enter event runtime when an active frame was drained on-screen.
 * Skipped when Ethan rescue or landmark navigation already changed maps.
 */
export async function maybeNavigateToWildernessEventRuntimeAfterMove({
  activeState,
  moveRowWildernessQueue,
  ethanNav,
  gotoLandmarkId,
  loadMap,
  applyCommittedMapState,
  deriveTransitUiStateFromRuntimeTruth
}) {
  const tookEthanNav = Boolean(ethanNav?.navigateMapId);
  const tookLandmark = Boolean(gotoLandmarkId && !ethanNav?.skipLandmark);
  if (tookEthanNav || tookLandmark) return false;
  const af = moveRowWildernessQueue?.activeFrameId;
  if (!af) return false;
  const evtMap = await loadMap("wilderness_event_runtime");
  if (!evtMap) return false;
  applyCommittedMapState(activeState, "wilderness_event_runtime", evtMap, {
    clearOverlay: true,
    clearModal: true,
    resetScene: true
  });
  if (!activeState.ui || typeof activeState.ui !== "object") {
    activeState.ui = {};
  }
  activeState.ui.transit = deriveTransitUiStateFromRuntimeTruth(activeState);
  return true;
}

export function mergeWildernessCoreWithEventQueue(prevWildernessSlice, normalizedWildernessCore) {
  const eq = normalizeWildernessEventQueue(
    prevWildernessSlice?.eventQueue != null ? prevWildernessSlice.eventQueue : createDefaultWildernessEventQueue()
  );
  return { ...normalizedWildernessCore, eventQueue: eq };
}

export { integrateWildernessEventQueueAfterSuccessfulMove };
