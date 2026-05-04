import { loadMap } from "../loader.js";
import { buildSocialIntentFromEffectRow, isSocialEffectType } from "./social_effect_rows.js";

const NATURAL_SOCIAL_AUTHORING_MAP_IDS = Object.freeze([
  "bayport_clinic_queue_intro_2",
  "intro_clinic_bed_lin_1",
  "steelcross_market_stall_01_intro_1",
  "steelcross_port_theseus_crew_intro"
]);

function normalizeNpcId(value) {
  return String(value || "").trim();
}

function buildNaturalSocialEffectContexts(mapJson) {
  const rows = [];
  if (!mapJson || typeof mapJson !== "object") return rows;

  if (Array.isArray(mapJson?.onEnterEffects?.socialEffects)) {
    for (const effect of mapJson.onEnterEffects.socialEffects) {
      rows.push({
        effect,
        mapId: String(mapJson.id || "").trim() || null,
        actionId: null,
        source: "map_enter"
      });
    }
  }

  for (const action of Array.isArray(mapJson?.actions) ? mapJson.actions : []) {
    const actionId = String(action?.id || "").trim() || null;
    const effectRows = [];
    if (Array.isArray(action?.effects)) {
      effectRows.push(...action.effects);
    }
    if (Array.isArray(action?.socialEffects)) {
      effectRows.push(...action.socialEffects);
    }
    for (const effect of effectRows) {
      if (!isSocialEffectType(String(effect?.type || "").trim().toLowerCase())) continue;
      rows.push({
        effect,
        mapId: String(mapJson.id || "").trim() || null,
        actionId,
        source: actionId ? "action" : "unknown"
      });
    }
  }

  return rows;
}

let _naturalNameKnownEvidencePromise = null;
let _naturalNameKnownEvidenceCache = new Map();

async function buildNaturalNameKnownEvidenceMap() {
  const evidenceByNpcId = new Map();

  for (const mapId of NATURAL_SOCIAL_AUTHORING_MAP_IDS) {
    const mapJson = await loadMap(mapId);
    if (!mapJson) continue;
    for (const row of buildNaturalSocialEffectContexts(mapJson)) {
      const built = buildSocialIntentFromEffectRow(row.effect, {
        mapId: row.mapId,
        actionId: row.actionId,
        sceneId: null,
        atMinute: 0,
        reason: row.source
      });
      const intent = built?.intent;
      if (!built?.ok || !intent) continue;
      if (intent.type !== "set_dossier_flag") continue;
      if (String(intent.flagId || "").trim() !== "nameKnown") continue;
      if (intent.value !== true) continue;

      const npcId = normalizeNpcId(intent.npcId);
      if (!npcId) continue;
      if (!evidenceByNpcId.has(npcId)) {
        evidenceByNpcId.set(npcId, []);
      }
      evidenceByNpcId.get(npcId).push(Object.freeze({
        npcId,
        mapId: row.mapId,
        actionId: row.actionId,
        reason: String(intent.reason || "").trim() || null
      }));
    }
  }

  for (const [npcId, items] of evidenceByNpcId.entries()) {
    evidenceByNpcId.set(npcId, Object.freeze(items.slice()));
  }

  _naturalNameKnownEvidenceCache = evidenceByNpcId;
  return evidenceByNpcId;
}

export async function getNaturalNameKnownEvidenceByNpcId(npcId) {
  const key = normalizeNpcId(npcId);
  if (!key) return Object.freeze([]);
  if (!_naturalNameKnownEvidencePromise) {
    _naturalNameKnownEvidencePromise = buildNaturalNameKnownEvidenceMap();
  }
  const evidenceByNpcId = await _naturalNameKnownEvidencePromise;
  return evidenceByNpcId.get(key) || Object.freeze([]);
}

export async function hasNaturalNameKnownEvidenceForNpcId(npcId) {
  const entries = await getNaturalNameKnownEvidenceByNpcId(npcId);
  return entries.length > 0;
}
