import { gameState as activeGameState } from "./state.js";
import {
  MARG_FRONTDESK_DUTY_PROVIDER_ID,
  resolveMargFrontdeskDutySnapshot
} from "./marg_frontdesk_duty_provider.js";

function freezeProviderSnapshotEntry(snapshot) {
  return Object.freeze({
    providerId: snapshot.providerId,
    npcId: snapshot.npcId,
    band: snapshot.band,
    tagId: snapshot.tagId,
    label: snapshot.label,
    enabled: snapshot.enabled === true
  });
}

export function buildRuntimeProviderSnapshot(state = activeGameState, totalMinutes = state?.time?.totalMinutes) {
  const margFrontdesk = resolveMargFrontdeskDutySnapshot({ gameState: state, totalMinutes });
  const byId = Object.freeze({
    [MARG_FRONTDESK_DUTY_PROVIDER_ID]: freezeProviderSnapshotEntry(margFrontdesk)
  });
  const providerBands = Object.freeze(Object.fromEntries(
    Object.entries(byId).map(([providerId, snapshot]) => [providerId, snapshot.band])
  ));

  return Object.freeze({
    byId,
    providerBands
  });
}

export function getRuntimeProviderBand(providerId, state = activeGameState, totalMinutes = state?.time?.totalMinutes) {
  const key = String(providerId || "").trim();
  if (!key) return null;
  return buildRuntimeProviderSnapshot(state, totalMinutes).byId[key]?.band || null;
}