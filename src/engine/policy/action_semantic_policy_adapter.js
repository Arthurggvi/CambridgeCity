// ============================================================================
// Action Semantic Policy Adapter (draft, NOT wired into main pipeline)
// ============================================================================
// Purpose:
// 1. Provide a single future consumption entry for negotiation/special-cost semantics.
// 2. Keep contract logic isolated before formal schema rollout.
// 3. Do not mutate state directly; return pure decision/result payload.
// ============================================================================

export const ACTION_SEMANTIC_SCHEMA_VERSION = 1;

export const ACTION_SEMANTIC_TYPES = Object.freeze({
  NEGOTIATION: "negotiation",
  NEGOTIATION_LEARN: "negotiation_learn",
  SPECIAL_COST: "special_cost",
  ONE_SHOT_BUSINESS: "one_shot_business"
});

export function normalizeActionSemantic(action) {
  const raw = action?.semantic;
  if (!raw || typeof raw !== "object") return null;

  const type = String(raw.type || "").trim().toLowerCase();
  if (!type) return null;

  const normalized = {
    schemaVersion: Number.isFinite(Number(raw.schemaVersion))
      ? Number(raw.schemaVersion)
      : ACTION_SEMANTIC_SCHEMA_VERSION,
    type,
    category: String(raw.category || "").trim().toLowerCase() || null,
    flags: {
      isLearnEvent: raw?.flags?.isLearnEvent === true,
      isSpecialConsumption: raw?.flags?.isSpecialConsumption === true
    },
    costTargets: Array.isArray(raw.costTargets)
      ? raw.costTargets.map((v) => String(v || "").trim()).filter(Boolean)
      : []
  };

  return normalized;
}

// Unified consumption entry (draft):
// - decision.canPass: for rule-level gate
// - decision.modifiersUsed: which derived modifiers were consumed
// - effects: transformed effects for special-cost style reductions
export function applyActionSemanticPolicy({ action, derivedMods = {}, effects = [] } = {}) {
  const semantic = normalizeActionSemantic(action);
  if (!semantic) {
    return {
      semantic: null,
      decision: {
        canPass: true,
        reason: "NO_SEMANTIC_CONTRACT",
        modifiersUsed: {}
      },
      effects
    };
  }

  const canLearnNegotiationEvents = derivedMods?.canLearnNegotiationEvents !== false;
  const negotiationSkillModifier = toPositiveNumber(derivedMods?.negotiationSkillModifier, 1);
  const specialCostModifier = toPositiveNumber(derivedMods?.specialCostModifier, 1);

  if (semantic.type === ACTION_SEMANTIC_TYPES.NEGOTIATION_LEARN && !canLearnNegotiationEvents) {
    return {
      semantic,
      decision: {
        canPass: false,
        reason: "NEGOTIATION_LEARN_BLOCKED",
        modifiersUsed: {
          canLearnNegotiationEvents
        }
      },
      effects
    };
  }

  if (semantic.type === ACTION_SEMANTIC_TYPES.SPECIAL_COST) {
    return {
      semantic,
      decision: {
        canPass: true,
        reason: "SPECIAL_COST_MODIFIED",
        modifiersUsed: {
          specialCostModifier
        }
      },
      effects: scaleSpecialCostEffects(effects, specialCostModifier, semantic.costTargets)
    };
  }

  if (semantic.type === ACTION_SEMANTIC_TYPES.NEGOTIATION) {
    return {
      semantic,
      decision: {
        canPass: true,
        reason: "NEGOTIATION_MODIFIER_READY",
        modifiersUsed: {
          negotiationSkillModifier
        }
      },
      effects
    };
  }

  return {
    semantic,
    decision: {
      canPass: true,
      reason: "SEMANTIC_TYPE_UNHANDLED",
      modifiersUsed: {}
    },
    effects
  };
}

function toPositiveNumber(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function scaleSpecialCostEffects(effects, specialCostModifier, costTargets = []) {
  const targets = new Set(Array.isArray(costTargets) ? costTargets : []);
  return Array.isArray(effects)
    ? effects.map((effect) => {
        if (!effect || typeof effect !== "object") return effect;
        if (effect.op !== "add") return effect;
        const path = String(effect.path || "");
        if (targets.size > 0 && !targets.has(path)) return effect;
        const value = Number(effect.value);
        if (!Number.isFinite(value) || value >= 0) return effect;
        return {
          ...effect,
          value: Math.round(value * specialCostModifier)
        };
      })
    : [];
}
