const STATUS_EFFECT_STACK_POLICIES = Object.freeze({
  REPLACE_SAME_BUCKET: "replace_same_bucket",
  STACK: "stack",
  REFRESH_SAME_SOURCE: "refresh_same_source"
});

const STATUS_EFFECT_KINDS = Object.freeze({
  MODIFIER: "modifier",
  PERIODIC: "periodic"
});

const STATUS_EFFECT_KEYS = Object.freeze({
  STAMINA_DECAY_RATE: "staminaDecayRate",
  SATIETY_DECAY_RATE: "satietyDecayRate",
  BODY_TEMPERATURE_DECAY_RATE: "bodyTemperatureDecayRate",
  COOLING_RATE: "coolingRate",
  WARMING_RATE: "warmingRate",
  HP_DECAY_RATE: "hpDecayRate",
  STAMINA: "stamina",
  SATIETY: "satiety",
  HP: "hp",
  FATIGUE: "fatigue",
  TEMPERATURE_C: "temperatureC"
});

const STATUS_EFFECT_BUCKETS = Object.freeze({
  SATIETY: "satiety",
  HEALTH: "health",
  TEMPERATURE: "temperature",
  OTHER: "other"
});

const LEGACY_MODIFIER_KEY_MAP = Object.freeze({
  staminaDecay: STATUS_EFFECT_KEYS.STAMINA_DECAY_RATE,
  satietyDecay: STATUS_EFFECT_KEYS.SATIETY_DECAY_RATE,
  bodyTemperatureDecay: STATUS_EFFECT_KEYS.BODY_TEMPERATURE_DECAY_RATE,
  coolingRate: STATUS_EFFECT_KEYS.COOLING_RATE,
  warmingRate: STATUS_EFFECT_KEYS.WARMING_RATE,
  hpDecay: STATUS_EFFECT_KEYS.HP_DECAY_RATE,
  staminaDecayRate: STATUS_EFFECT_KEYS.STAMINA_DECAY_RATE,
  satietyDecayRate: STATUS_EFFECT_KEYS.SATIETY_DECAY_RATE,
  bodyTemperatureDecayRate: STATUS_EFFECT_KEYS.BODY_TEMPERATURE_DECAY_RATE,
  hpDecayRate: STATUS_EFFECT_KEYS.HP_DECAY_RATE
});

const LEGACY_CONSUMABLE_MODIFIER_FIELDS = Object.freeze({
  staminaDecayModifier: STATUS_EFFECT_KEYS.STAMINA_DECAY_RATE,
  satietyDecayModifier: STATUS_EFFECT_KEYS.SATIETY_DECAY_RATE,
  bodyTemperatureDecayModifier: STATUS_EFFECT_KEYS.BODY_TEMPERATURE_DECAY_RATE,
  coolingRateMultiplier: STATUS_EFFECT_KEYS.COOLING_RATE,
  warmingRateMultiplier: STATUS_EFFECT_KEYS.WARMING_RATE,
  hpDecayRateMultiplier: STATUS_EFFECT_KEYS.HP_DECAY_RATE
});

const LEGACY_CONSUMABLE_PERIODIC_FIELDS = Object.freeze({
  staminaRecoveryPerHour: STATUS_EFFECT_KEYS.STAMINA
});

const REPLACE_SCOPE_KEYS = Object.freeze({
  SATIETY: "satiety",
  HEALTH: "health",
  TEMPERATURE: "temperature",
  OTHER: "other"
});

function roundTo3(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

function normalizeEffectKey(raw) {
  const key = String(raw || "").trim();
  return LEGACY_MODIFIER_KEY_MAP[key] || key || null;
}

function normalizeStackPolicy(raw) {
  const value = String(raw || "").trim().toLowerCase();
  return Object.values(STATUS_EFFECT_STACK_POLICIES).includes(value)
    ? value
    : STATUS_EFFECT_STACK_POLICIES.STACK;
}

function normalizeSourceItemId(raw) {
  const value = String(raw || "").trim();
  return value || null;
}

function isFoodLikeConsumable(itemDef = {}) {
  return Number(itemDef?.satietyGain) > 0 || Number(itemDef?.intakeLoadCost) > 0;
}

function resolveDefaultStatusEffectStackPolicyForConsumable(itemDef = {}) {
  return isFoodLikeConsumable(itemDef)
    ? STATUS_EFFECT_STACK_POLICIES.REPLACE_SAME_BUCKET
    : STATUS_EFFECT_STACK_POLICIES.STACK;
}

function resolveConsumableStackPolicy(itemDef = {}) {
  const explicit = String(itemDef?.statusEffectStackPolicy || "").trim().toLowerCase();
  if (Object.values(STATUS_EFFECT_STACK_POLICIES).includes(explicit)) {
    return explicit;
  }
  return resolveDefaultStatusEffectStackPolicyForConsumable(itemDef);
}

function resolveReplaceScopeForEffectKey(effectKey) {
  if ([STATUS_EFFECT_KEYS.SATIETY, STATUS_EFFECT_KEYS.SATIETY_DECAY_RATE].includes(effectKey)) {
    return REPLACE_SCOPE_KEYS.SATIETY;
  }
  if ([STATUS_EFFECT_KEYS.HP, STATUS_EFFECT_KEYS.HP_DECAY_RATE, STATUS_EFFECT_KEYS.STAMINA, STATUS_EFFECT_KEYS.STAMINA_DECAY_RATE, STATUS_EFFECT_KEYS.FATIGUE].includes(effectKey)) {
    return REPLACE_SCOPE_KEYS.HEALTH;
  }
  if ([STATUS_EFFECT_KEYS.BODY_TEMPERATURE_DECAY_RATE, STATUS_EFFECT_KEYS.COOLING_RATE, STATUS_EFFECT_KEYS.WARMING_RATE, STATUS_EFFECT_KEYS.TEMPERATURE_C].includes(effectKey)) {
    return REPLACE_SCOPE_KEYS.TEMPERATURE;
  }
  return REPLACE_SCOPE_KEYS.OTHER;
}

function resolveReplaceScopesForEffects(effects = []) {
  const scopes = new Set();
  for (const effect of effects) {
    const effectKey = String(effect?.effectKey || "").trim();
    if (!effectKey) continue;
    scopes.add(resolveReplaceScopeForEffectKey(effectKey));
  }
  return scopes;
}

function normalizeModifierEffect(raw) {
  const effectKey = normalizeEffectKey(raw?.effectKey);
  const multiplier = Number(raw?.multiplier);
  if (!effectKey) return null;
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
  return {
    kind: STATUS_EFFECT_KINDS.MODIFIER,
    effectKey,
    multiplier: roundTo3(multiplier)
  };
}

function normalizePeriodicEffect(raw) {
  const effectKey = normalizeEffectKey(raw?.effectKey);
  const delta = Number(raw?.delta);
  const everyMinutes = Number(raw?.everyMinutes);
  const carryMinutes = Math.max(0, Number(raw?.carryMinutes) || 0);
  if (!effectKey) return null;
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0001) return null;
  if (!Number.isFinite(everyMinutes) || everyMinutes <= 0) return null;
  return {
    kind: STATUS_EFFECT_KINDS.PERIODIC,
    effectKey,
    delta: roundTo3(delta),
    everyMinutes: roundTo3(everyMinutes),
    carryMinutes: roundTo3(carryMinutes)
  };
}

function normalizeStatusEffectEffect(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = String(raw.kind || "").trim().toLowerCase();
  if (kind === STATUS_EFFECT_KINDS.MODIFIER) return normalizeModifierEffect(raw);
  if (kind === STATUS_EFFECT_KINDS.PERIODIC) return normalizePeriodicEffect(raw);
  return null;
}

function normalizeStatusEffectInstance(raw) {
  if (!raw || typeof raw !== "object") return null;
  const effects = Array.isArray(raw.effects)
    ? raw.effects.map((effect) => normalizeStatusEffectEffect(effect)).filter(Boolean)
    : [];
  const remainingMinutes = Number(raw.remainingMinutes);
  const durationMinutes = Number(raw.durationMinutes);
  if (effects.length === 0) return null;
  if (!Number.isFinite(remainingMinutes) || remainingMinutes <= 0) return null;
  return {
    sourceItemId: normalizeSourceItemId(raw.sourceItemId),
    stackPolicy: normalizeStackPolicy(raw.stackPolicy),
    durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? roundTo3(durationMinutes) : roundTo3(remainingMinutes),
    remainingMinutes: roundTo3(remainingMinutes),
    effects: effects.map((effect) => ({ ...effect }))
  };
}

function normalizeLegacyFoodModifierSlot(raw, effectKey) {
  if (!raw || typeof raw !== "object") return null;
  const multiplier = Number(raw.multiplier);
  const remainingMinutes = Number(raw.remainingMinutes);
  const sourceItemId = normalizeSourceItemId(raw?.source);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
  if (!Number.isFinite(remainingMinutes) || remainingMinutes <= 0) return null;
  return normalizeStatusEffectInstance({
    sourceItemId,
    stackPolicy: STATUS_EFFECT_STACK_POLICIES.REPLACE_SAME_BUCKET,
    durationMinutes: remainingMinutes,
    remainingMinutes,
    effects: [{
      kind: STATUS_EFFECT_KINDS.MODIFIER,
      effectKey,
      multiplier
    }]
  });
}

export function createEmptyStatusEffectsState() {
  return { active: [] };
}

export function cloneStatusEffectsState(rawState) {
  const state = rawState && typeof rawState === "object" ? rawState : createEmptyStatusEffectsState();
  const active = Array.isArray(state.active)
    ? state.active.map((entry) => normalizeStatusEffectInstance(entry)).filter(Boolean)
    : [];
  return { active };
}

function normalizeLegacyModifierDescriptor(raw, effectKey, fallbackSourceItemId = null) {
  const multiplier = Number(raw?.multiplier);
  const durationMinutes = Number(raw?.durationMinutes);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  return {
    sourceItemId: normalizeSourceItemId(raw?.source) || normalizeSourceItemId(fallbackSourceItemId),
    durationMinutes: roundTo3(durationMinutes),
    effect: normalizeModifierEffect({
      kind: STATUS_EFFECT_KINDS.MODIFIER,
      effectKey,
      multiplier
    })
  };
}

function normalizeLegacyPeriodicDescriptor(raw, effectKey, fallbackSourceItemId = null) {
  const durationMinutes = Number(raw?.durationMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  const everyMinutes = Number(raw?.everyMinutes || 1);
  let delta = Number(raw?.delta);
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0001) {
    const deltaPerHour = Number(raw?.deltaPerHour);
    if (!Number.isFinite(deltaPerHour) || Math.abs(deltaPerHour) < 0.0001) return null;
    delta = deltaPerHour * (everyMinutes / 60);
  }
  return {
    sourceItemId: normalizeSourceItemId(raw?.source) || normalizeSourceItemId(fallbackSourceItemId),
    durationMinutes: roundTo3(durationMinutes),
    effect: normalizePeriodicEffect({
      kind: STATUS_EFFECT_KINDS.PERIODIC,
      effectKey,
      delta,
      everyMinutes,
      carryMinutes: 0
    })
  };
}

function buildStatusEffectInstancesFromDescriptors({ descriptors = [], fallbackSourceItemId = null, stackPolicy = STATUS_EFFECT_STACK_POLICIES.STACK } = {}) {
  const grouped = new Map();
  for (const descriptor of descriptors) {
    if (!descriptor?.effect) continue;
    const sourceItemId = normalizeSourceItemId(descriptor.sourceItemId) || normalizeSourceItemId(fallbackSourceItemId);
    const durationKey = String(roundTo3(descriptor.durationMinutes));
    const groupKey = `${sourceItemId || ""}::${durationKey}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        sourceItemId,
        durationMinutes: Number(durationKey),
        effects: []
      });
    }
    grouped.get(groupKey).effects.push(descriptor.effect);
  }

  const instances = [];
  for (const group of grouped.values()) {
    instances.push(normalizeStatusEffectInstance({
      sourceItemId: group.sourceItemId,
      stackPolicy,
      durationMinutes: group.durationMinutes,
      remainingMinutes: group.durationMinutes,
      effects: group.effects
    }));
  }
  return instances.filter(Boolean);
}

export function buildStatusEffectInstancesFromConsumable(itemDef = {}) {
  const canonicalInstances = Array.isArray(itemDef?.statusEffects?.active)
    ? itemDef.statusEffects.active.map((entry) => normalizeStatusEffectInstance({
        ...entry,
        sourceItemId: normalizeSourceItemId(entry?.sourceItemId) || normalizeSourceItemId(itemDef?.id)
      })).filter(Boolean)
    : [];
  if (canonicalInstances.length > 0) {
    return canonicalInstances;
  }

  const descriptors = [];
  for (const [fieldName, effectKey] of Object.entries(LEGACY_CONSUMABLE_MODIFIER_FIELDS)) {
    const descriptor = normalizeLegacyModifierDescriptor(itemDef?.[fieldName], effectKey, itemDef?.id);
    if (descriptor) descriptors.push(descriptor);
  }
  for (const [fieldName, effectKey] of Object.entries(LEGACY_CONSUMABLE_PERIODIC_FIELDS)) {
    const descriptor = normalizeLegacyPeriodicDescriptor(itemDef?.[fieldName], effectKey, itemDef?.id);
    if (descriptor) descriptors.push(descriptor);
  }
  if (descriptors.length === 0) return [];

  const stackPolicy = resolveConsumableStackPolicy(itemDef);
  return buildStatusEffectInstancesFromDescriptors({
    descriptors,
    fallbackSourceItemId: itemDef?.id,
    stackPolicy
  });
}

export function migrateLegacyTimedModifiersToStatusEffects(timedModifiers) {
  const legacy = timedModifiers?.activeFoodEffect;
  if (!legacy || typeof legacy !== "object") {
    const fallbackEntries = [
      normalizeLegacyFoodModifierSlot(timedModifiers?.staminaDecay, STATUS_EFFECT_KEYS.STAMINA_DECAY_RATE),
      normalizeLegacyFoodModifierSlot(timedModifiers?.satietyDecay, STATUS_EFFECT_KEYS.SATIETY_DECAY_RATE),
      normalizeLegacyFoodModifierSlot(timedModifiers?.bodyTemperatureDecay, STATUS_EFFECT_KEYS.BODY_TEMPERATURE_DECAY_RATE),
      normalizeLegacyFoodModifierSlot(timedModifiers?.coolingRate, STATUS_EFFECT_KEYS.COOLING_RATE),
      normalizeLegacyFoodModifierSlot(timedModifiers?.warmingRate, STATUS_EFFECT_KEYS.WARMING_RATE),
      normalizeLegacyFoodModifierSlot(timedModifiers?.hpDecay, STATUS_EFFECT_KEYS.HP_DECAY_RATE)
    ].filter(Boolean);
    if (fallbackEntries.length === 0) return createEmptyStatusEffectsState();

    fallbackEntries.sort((left, right) => {
      const remainingDiff = Number(right?.remainingMinutes || 0) - Number(left?.remainingMinutes || 0);
      if (remainingDiff !== 0) return remainingDiff;
      const rightKey = String(right?.effects?.[0]?.effectKey || "");
      const leftKey = String(left?.effects?.[0]?.effectKey || "");
      return rightKey.localeCompare(leftKey);
    });

    return { active: [fallbackEntries[0]] };
  }

  const remainingMinutes = Number(legacy.remainingMinutes);
  if (!Number.isFinite(remainingMinutes) || remainingMinutes <= 0) return createEmptyStatusEffectsState();

  const durationMinutes = Number(legacy.durationMinutes);
  const sourceItemId = normalizeSourceItemId(legacy?.source);
  const descriptors = [];
  const modifiers = legacy?.modifiers && typeof legacy.modifiers === "object" ? legacy.modifiers : null;

  if (modifiers) {
    for (const [key, rawMultiplier] of Object.entries(modifiers)) {
      const effectKey = normalizeEffectKey(key);
      const multiplier = Number(rawMultiplier);
      if (!effectKey || !Number.isFinite(multiplier) || multiplier <= 0) continue;
      descriptors.push({
        sourceItemId,
        durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? roundTo3(durationMinutes) : roundTo3(remainingMinutes),
        effect: normalizeModifierEffect({
          kind: STATUS_EFFECT_KINDS.MODIFIER,
          effectKey,
          multiplier
        })
      });
    }
  }

  const legacyEffectKey = normalizeEffectKey(legacy?.effectType);
  const legacyMultiplier = Number(legacy?.multiplier);
  if (descriptors.length === 0 && legacyEffectKey && Number.isFinite(legacyMultiplier) && legacyMultiplier > 0) {
    descriptors.push({
      sourceItemId,
      durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? roundTo3(durationMinutes) : roundTo3(remainingMinutes),
      effect: normalizeModifierEffect({
        kind: STATUS_EFFECT_KINDS.MODIFIER,
        effectKey: legacyEffectKey,
        multiplier: legacyMultiplier
      })
    });
  }

  const deltaPerHour = legacy?.deltaPerHour && typeof legacy.deltaPerHour === "object" ? legacy.deltaPerHour : null;
  if (deltaPerHour) {
    for (const [key, rawValue] of Object.entries(deltaPerHour)) {
      const value = Number(rawValue);
      if (!Number.isFinite(value) || Math.abs(value) < 0.0001) continue;
      descriptors.push({
        sourceItemId,
        durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? roundTo3(durationMinutes) : roundTo3(remainingMinutes),
        effect: normalizePeriodicEffect({
          kind: STATUS_EFFECT_KINDS.PERIODIC,
          effectKey: key,
          delta: value / 60,
          everyMinutes: 1,
          carryMinutes: 0
        })
      });
    }
  }

  if (descriptors.length === 0) return createEmptyStatusEffectsState();
  return {
    active: buildStatusEffectInstancesFromDescriptors({
      descriptors,
      fallbackSourceItemId: sourceItemId,
      stackPolicy: STATUS_EFFECT_STACK_POLICIES.REPLACE_SAME_BUCKET
    })
  };
}

export function ensureStatusEffectsState(player) {
  if (!player || typeof player !== "object") return createEmptyStatusEffectsState();
  if (!player.meta || typeof player.meta !== "object") player.meta = {};

  const state = cloneStatusEffectsState(player.meta.statusEffects);
  if (state.active.length === 0 && player.meta.timedModifiers && typeof player.meta.timedModifiers === "object") {
    const migrated = migrateLegacyTimedModifiersToStatusEffects(player.meta.timedModifiers);
    state.active.push(...migrated.active);
  }

  player.meta.statusEffects = cloneStatusEffectsState(state);
  if (Object.prototype.hasOwnProperty.call(player.meta, "timedModifiers")) {
    delete player.meta.timedModifiers;
  }
  return player.meta.statusEffects;
}

export function getActiveStatusEffects(player) {
  const state = ensureStatusEffectsState(player);
  return Array.isArray(state.active) ? state.active : [];
}

export function getStatusEffectRemainingMinutesBySource(player, sourceItemId) {
  const normalizedSourceItemId = normalizeSourceItemId(sourceItemId);
  if (!normalizedSourceItemId) return null;
  const matches = getActiveStatusEffects(player)
    .filter((instance) => normalizeSourceItemId(instance?.sourceItemId) === normalizedSourceItemId)
    .map((instance) => Number(instance?.remainingMinutes))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (matches.length === 0) return null;
  return Math.max(...matches);
}

function shouldReplaceByScope(current, incoming) {
  if (incoming.stackPolicy !== STATUS_EFFECT_STACK_POLICIES.REPLACE_SAME_BUCKET) return false;
  const incomingScopes = resolveReplaceScopesForEffects(incoming.effects);
  const currentScopes = resolveReplaceScopesForEffects(current.effects);
  for (const scope of incomingScopes) {
    if (currentScopes.has(scope)) return true;
  }
  return false;
}

function upsertStatusEffectInstance(state, instance) {
  const normalized = normalizeStatusEffectInstance(instance);
  if (!normalized) return false;

  const next = [];
  for (const current of Array.isArray(state.active) ? state.active : []) {
    if (normalized.sourceItemId && current.sourceItemId && normalized.sourceItemId === current.sourceItemId) {
      continue;
    }
    if (shouldReplaceByScope(current, normalized)) {
      continue;
    }
    next.push(current);
  }
  next.push(normalized);
  state.active = next;
  return true;
}

export function applyConsumableStatusEffects(player, itemDef = {}) {
  const state = ensureStatusEffectsState(player);
  const instances = buildStatusEffectInstancesFromConsumable(itemDef);
  if (instances.length === 0) {
    return {
      applied: false,
      instances: [],
      statusEffects: cloneStatusEffectsState(state)
    };
  }
  for (const instance of instances) {
    upsertStatusEffectInstance(state, instance);
  }
  player.meta.statusEffects = cloneStatusEffectsState(state);
  return {
    applied: true,
    instances,
    statusEffects: cloneStatusEffectsState(player.meta.statusEffects)
  };
}

function getModifierSegments(instances, tickMinutes) {
  const totalMinutes = Math.max(0, Number(tickMinutes) || 0);
  if (totalMinutes <= 0) return [];
  const boundaries = new Set([0, totalMinutes]);
  for (const instance of instances) {
    const activeMinutes = Math.min(totalMinutes, Math.max(0, Number(instance.remainingMinutes) || 0));
    if (activeMinutes > 0) boundaries.add(roundTo3(activeMinutes));
  }
  const sorted = [...boundaries].sort((a, b) => a - b);
  const segments = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (end - start > 0) {
      segments.push({ start, duration: end - start });
    }
  }
  return segments;
}

export function resolveStatusEffectModifier(player, effectKey, tickMinutes = 0) {
  const normalizedKey = normalizeEffectKey(effectKey);
  if (!normalizedKey) return 1;
  const instances = getActiveStatusEffects(player).filter((instance) =>
    Array.isArray(instance.effects) && instance.effects.some((effect) => effect.kind === STATUS_EFFECT_KINDS.MODIFIER && effect.effectKey === normalizedKey)
  );
  if (instances.length === 0) return 1;
  const totalMinutes = Math.max(0, Number(tickMinutes) || 0);
  if (totalMinutes <= 0) {
    return instances.reduce((accumulator, instance) => (
      accumulator * instance.effects
        .filter((effect) => effect.kind === STATUS_EFFECT_KINDS.MODIFIER && effect.effectKey === normalizedKey)
        .reduce((product, effect) => product * Math.max(0, Number(effect.multiplier) || 1), 1)
    ), 1);
  }
  const segments = getModifierSegments(instances, totalMinutes);
  let weighted = 0;
  for (const segment of segments) {
    let segmentMultiplier = 1;
    for (const instance of instances) {
      if (Number(instance.remainingMinutes) <= segment.start) continue;
      for (const effect of instance.effects) {
        if (effect.kind === STATUS_EFFECT_KINDS.MODIFIER && effect.effectKey === normalizedKey) {
          segmentMultiplier *= Math.max(0, Number(effect.multiplier) || 1);
        }
      }
    }
    weighted += segment.duration * segmentMultiplier;
  }
  return weighted > 0 ? weighted / totalMinutes : 1;
}

export function resolveStatusEffectPeriodicDeltas(player, tickMinutes = 0) {
  const totalMinutes = Math.max(0, Number(tickMinutes) || 0);
  const deltas = {};
  if (totalMinutes <= 0) return deltas;
  for (const instance of getActiveStatusEffects(player)) {
    const activeMinutes = Math.min(totalMinutes, Math.max(0, Number(instance.remainingMinutes) || 0));
    if (activeMinutes <= 0) continue;
    for (const effect of instance.effects) {
      if (effect.kind !== STATUS_EFFECT_KINDS.PERIODIC) continue;
      const everyMinutes = Math.max(0.001, Number(effect.everyMinutes) || 0);
      const carryMinutes = Math.max(0, Number(effect.carryMinutes) || 0);
      const triggers = Math.floor((carryMinutes + activeMinutes) / everyMinutes);
      if (triggers <= 0) continue;
      deltas[effect.effectKey] = roundTo3((deltas[effect.effectKey] || 0) + triggers * Number(effect.delta || 0));
    }
  }
  return deltas;
}

export function consumeStatusEffectsForTick(player, tickMinutes = 0) {
  const totalMinutes = Math.max(0, Number(tickMinutes) || 0);
  const state = ensureStatusEffectsState(player);
  if (totalMinutes <= 0) {
    player.meta.statusEffects = cloneStatusEffectsState(state);
    return player.meta.statusEffects;
  }
  const next = [];
  for (const instance of Array.isArray(state.active) ? state.active : []) {
    const remainingBefore = Math.max(0, Number(instance.remainingMinutes) || 0);
    if (remainingBefore <= 0) continue;
    const activeMinutes = Math.min(totalMinutes, remainingBefore);
    const remainingMinutes = roundTo3(Math.max(0, remainingBefore - totalMinutes));
    const effects = instance.effects.map((effect) => {
      if (effect.kind !== STATUS_EFFECT_KINDS.PERIODIC) return { ...effect };
      const everyMinutes = Math.max(0.001, Number(effect.everyMinutes) || 0);
      const carryMinutes = Math.max(0, Number(effect.carryMinutes) || 0);
      const triggers = Math.floor((carryMinutes + activeMinutes) / everyMinutes);
      return {
        ...effect,
        carryMinutes: remainingMinutes > 0 ? roundTo3(carryMinutes + activeMinutes - triggers * everyMinutes) : 0
      };
    });
    if (remainingMinutes > 0) {
      next.push({
        ...instance,
        remainingMinutes,
        effects
      });
    }
  }
  state.active = next;
  player.meta.statusEffects = cloneStatusEffectsState(state);
  return player.meta.statusEffects;
}

export {
  STATUS_EFFECT_BUCKETS,
  STATUS_EFFECT_KEYS,
  STATUS_EFFECT_KINDS,
  STATUS_EFFECT_STACK_POLICIES
};