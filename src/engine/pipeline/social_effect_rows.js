const SOCIAL_EFFECT_TYPES = new Set([
  "discover_npc",
  "favor_delta",
  "unlock_dossier_block",
  "unlock_dossier_entry",
  "set_dossier_flag",
  "set_social_flag"
]);

function normalizeText(value) {
  return String(value || "").trim();
}

export function isSocialEffectType(type) {
  return SOCIAL_EFFECT_TYPES.has(normalizeText(type).toLowerCase());
}

export function buildSocialIntentFromEffectRow(effect, options = {}) {
  const effectType = normalizeText(effect?.type).toLowerCase();
  if (!isSocialEffectType(effectType)) return null;

  const npcId = normalizeText(effect?.npcId);
  if (!npcId) {
    return {
      ok: false,
      type: effectType,
      error: `social effect 缺少 npcId：${effectType}`
    };
  }

  const mapId = normalizeText(options?.mapId) || null;
  const actionId = normalizeText(options?.actionId) || null;
  const sceneId = normalizeText(options?.sceneId) || null;
  const sourceReason = normalizeText(options?.reason);

  return {
    ok: true,
    intent: {
      type: effectType,
      npcId,
      delta: Number(effect?.delta || 0),
      blockId: normalizeText(effect?.blockId) || null,
      entryId: normalizeText(effect?.entryId) || null,
      flagId: normalizeText(effect?.flagId) || null,
      value: effect?.value === true,
      reason: normalizeText(effect?.reason) || sourceReason || effectType,
      context: {
        mapId,
        actionId,
        sceneId,
        atMinute: Number(options?.atMinute ?? 0)
      }
    }
  };
}