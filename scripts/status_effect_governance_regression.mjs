import assert from "node:assert/strict";

import { ensureItemsDbLoaded } from "../src/engine/items_db.js";
import {
  applyConsumableEffectsToPlayer,
  createDefaultPlayerState
} from "../src/engine/player.js";
import { getNightKitchenFoodDef } from "../src/engine/night_kitchen_food_defs.js";
import { buildSidebarStatusViewModel } from "../src/engine/render/view_models.js";
import { createDefaultGameState, migrateOldState } from "../src/engine/state.js";
import {
  STATUS_EFFECT_BUCKETS,
  STATUS_EFFECT_KEYS,
  consumeStatusEffectsForTick,
  getStatusEffectRemainingMinutesBySource,
  resolveStatusEffectPeriodicDeltas
} from "../src/engine/status_effect_runtime.js";
import {
  STATUS_EFFECT_DISPLAY_CHANNELS,
  STATUS_EFFECT_PRESENTATION_BY_KEY,
  resolveStatusEffectDisplayChannel,
  resolveStatusEffectBucket
} from "../src/engine/status_effect_view_models.js";

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    return { name, ok: true };
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.stack : error);
    return { name, ok: false, error };
  }
}

const itemsLoad = await ensureItemsDbLoaded();
assert.equal(itemsLoad?.ok, true, itemsLoad?.error || "items db should load for status-effect regressions");

const results = [];

results.push(test("consumable use", () => {
  const player = createDefaultPlayerState();
  const itemDef = {
    id: "governance_test_meal",
    category: "consumable",
    satietyGain: 12,
    intakeLoadCost: 8,
    staminaDecayModifier: {
      multiplier: 0.8,
      durationMinutes: 120,
      source: "governance_test_meal"
    }
  };

  const result = applyConsumableEffectsToPlayer(player, itemDef);
  assert.equal(result.applied, true);
  assert.equal(result.statusEffectApplied, true);
  assert.equal(player.meta.statusEffects.active.length, 1);
  assert.equal(player.meta.statusEffects.active[0].sourceItemId, "governance_test_meal");
  assert.equal("timedModifiers" in player.meta, false);
  assert.equal("uiBucket" in player.meta.statusEffects.active[0], false);
  assert.equal("sourceName" in player.meta.statusEffects.active[0], false);
}));

results.push(test("night-kitchen instant consume", () => {
  const player = createDefaultPlayerState();
  const foodDef = getNightKitchenFoodDef("signature_braised_pork_set");
  assert.ok(foodDef);

  const result = applyConsumableEffectsToPlayer(player, foodDef.effects);
  assert.equal(result.applied, true);
  assert.equal(result.statusEffectApplied, true);
  assert.equal(getStatusEffectRemainingMinutesBySource(player, "signature_braised_pork_set"), 120);

  const sidebarVm = buildSidebarStatusViewModel({ player });
  assert.equal(sidebarVm.satietyStatusEffectTooltipVm.groups[0].name, "金牌卤肉套餐");
  assert.match(sidebarVm.satietyStatusEffectTooltipVm.groups[0].lines[0], /体力衰减速率 -20%（02:00）/);
  assert.equal(sidebarVm.healthStatusEffectTooltipVm.groups.length, 0);
}));

results.push(test("save-load migration", () => {
  const legacyState = createDefaultGameState();
  delete legacyState.player.meta.statusEffects;
  legacyState.player.meta.timedModifiers = {
    activeFoodEffect: {
      modifiers: { satietyDecay: 0.8 },
      remainingMinutes: 90,
      durationMinutes: 120,
      source: "legacy_food",
      sourceName: "旧食物"
    }
  };

  const migrated = migrateOldState(legacyState);
  assert.equal("timedModifiers" in migrated.player.meta, false);
  assert.equal(migrated.player.meta.statusEffects.active.length, 1);
  assert.equal(migrated.player.meta.statusEffects.active[0].sourceItemId, "legacy_food");
  assert.equal(migrated.player.meta.statusEffects.active[0].effects[0].effectKey, STATUS_EFFECT_KEYS.SATIETY_DECAY_RATE);

  const olderState = createDefaultGameState();
  delete olderState.player.meta.statusEffects;
  olderState.player.meta.timedModifiers = {
    staminaDecay: {
      multiplier: 0.75,
      remainingMinutes: 60,
      source: "older_food"
    }
  };
  const olderMigrated = migrateOldState(olderState);
  assert.equal(olderMigrated.player.meta.statusEffects.active.length, 1);
  assert.equal(olderMigrated.player.meta.statusEffects.active[0].effects[0].effectKey, STATUS_EFFECT_KEYS.STAMINA_DECAY_RATE);
}));

results.push(test("multi-instance coexistence", () => {
  const player = createDefaultPlayerState();
  applyConsumableEffectsToPlayer(player, {
    id: "health_drug_a",
    category: "consumable",
    hpDecayRateMultiplier: {
      multiplier: 0.8,
      durationMinutes: 60,
      source: "health_drug_a"
    }
  });
  applyConsumableEffectsToPlayer(player, {
    id: "health_drug_b",
    category: "consumable",
    staminaRecoveryPerHour: {
      deltaPerHour: 12,
      durationMinutes: 60,
      source: "health_drug_b"
    }
  });

  assert.equal(player.meta.statusEffects.active.length, 2);
  assert.deepEqual(
    player.meta.statusEffects.active.map((entry) => entry.sourceItemId).sort(),
    ["health_drug_a", "health_drug_b"]
  );
}));

results.push(test("periodic tick correctness", () => {
  const player = createDefaultPlayerState();
  player.physio.stamina = 40;
  applyConsumableEffectsToPlayer(player, {
    id: "stamina_soup",
    category: "consumable",
    staminaRecoveryPerHour: {
      deltaPerHour: 12,
      durationMinutes: 30,
      source: "stamina_soup"
    }
  });

  const firstTick = resolveStatusEffectPeriodicDeltas(player, 15);
  assert.equal(firstTick.stamina, 3);
  consumeStatusEffectsForTick(player, 15);
  assert.equal(getStatusEffectRemainingMinutesBySource(player, "stamina_soup"), 15);

  const secondTick = resolveStatusEffectPeriodicDeltas(player, 15);
  assert.equal(secondTick.stamina, 3);
  consumeStatusEffectsForTick(player, 15);
  assert.equal(getStatusEffectRemainingMinutesBySource(player, "stamina_soup"), null);
}));

results.push(test("tooltip same-origin", () => {
  const player = createDefaultPlayerState();
  applyConsumableEffectsToPlayer(player, getNightKitchenFoodDef("rice_bowl_snack_set").effects);
  applyConsumableEffectsToPlayer(player, {
    id: "doc_researcher_manuscript",
    category: "consumable",
    hpDecayRateMultiplier: {
      multiplier: 0.8,
      durationMinutes: 60,
      source: "doc_researcher_manuscript"
    }
  });

  const sidebarVm = buildSidebarStatusViewModel({ player });
  assert.equal(sidebarVm.satietyStatusEffectTooltipVm.title, "进食效果");
  assert.equal(sidebarVm.healthStatusEffectTooltipVm.title, "药品效果");
  assert.match(sidebarVm.satietyStatusEffectTooltipVm.groups[0].lines[0], /饱腹衰减速率 -15%（02:00）/);
  assert.match(sidebarVm.healthStatusEffectTooltipVm.groups[0].lines[0], /健康衰减速率 -20%（01:00）/);

  const expectedBuckets = {
    [STATUS_EFFECT_KEYS.STAMINA_DECAY_RATE]: STATUS_EFFECT_BUCKETS.HEALTH,
    [STATUS_EFFECT_KEYS.SATIETY_DECAY_RATE]: STATUS_EFFECT_BUCKETS.SATIETY,
    [STATUS_EFFECT_KEYS.BODY_TEMPERATURE_DECAY_RATE]: STATUS_EFFECT_BUCKETS.TEMPERATURE,
    [STATUS_EFFECT_KEYS.COOLING_RATE]: STATUS_EFFECT_BUCKETS.TEMPERATURE,
    [STATUS_EFFECT_KEYS.WARMING_RATE]: STATUS_EFFECT_BUCKETS.TEMPERATURE,
    [STATUS_EFFECT_KEYS.HP_DECAY_RATE]: STATUS_EFFECT_BUCKETS.HEALTH,
    [STATUS_EFFECT_KEYS.STAMINA]: STATUS_EFFECT_BUCKETS.HEALTH,
    [STATUS_EFFECT_KEYS.SATIETY]: STATUS_EFFECT_BUCKETS.SATIETY,
    [STATUS_EFFECT_KEYS.HP]: STATUS_EFFECT_BUCKETS.HEALTH,
    [STATUS_EFFECT_KEYS.FATIGUE]: STATUS_EFFECT_BUCKETS.HEALTH,
    [STATUS_EFFECT_KEYS.TEMPERATURE_C]: STATUS_EFFECT_BUCKETS.TEMPERATURE
  };

  for (const effectKey of Object.values(STATUS_EFFECT_KEYS)) {
    const presentation = STATUS_EFFECT_PRESENTATION_BY_KEY[effectKey];
    assert.ok(presentation, `missing presentation entry for ${effectKey}`);
    assert.equal(presentation.tooltipVisible, true, `expected tooltipVisible for ${effectKey}`);
    assert.equal(resolveStatusEffectBucket(effectKey), expectedBuckets[effectKey], `unexpected bucket for ${effectKey}`);
  }
}));

results.push(test("drug tooltip empty state", () => {
  const player = createDefaultPlayerState();
  const sidebarVm = buildSidebarStatusViewModel({ player });
  assert.equal(sidebarVm.healthStatusEffectTooltipVm.title, "药品效果");
  assert.equal(sidebarVm.healthStatusEffectTooltipVm.groups.length, 0);
  assert.equal(sidebarVm.healthStatusEffectTooltipVm.emptyText, "当前没有生效中的药品效果");
}));

results.push(test("drug tooltip single drug single effect", () => {
  const player = createDefaultPlayerState();
  applyConsumableEffectsToPlayer(player, {
    id: "bandage_single_effect_test",
    category: "consumable",
    hpDecayRateMultiplier: {
      multiplier: 0.8,
      durationMinutes: 60,
      source: "consumable_bandage"
    }
  });

  const sidebarVm = buildSidebarStatusViewModel({ player });
  assert.equal(sidebarVm.satietyStatusEffectTooltipVm.groups.length, 0);
  assert.equal(sidebarVm.healthStatusEffectTooltipVm.groups.length, 1);
  assert.equal(sidebarVm.healthStatusEffectTooltipVm.groups[0].name, "简易绷带");
  assert.deepEqual(sidebarVm.healthStatusEffectTooltipVm.groups[0].lines, ["健康衰减速率 -20%（01:00）"]);
}));

results.push(test("drug tooltip single drug multi effects", () => {
  const player = createDefaultPlayerState();
  applyConsumableEffectsToPlayer(player, {
    id: "drug_multi_effect_test",
    category: "consumable",
    statusEffects: {
      active: [{
        sourceItemId: "doc_researcher_manuscript",
        durationMinutes: 36,
        remainingMinutes: 36,
        effects: [
          {
            kind: "modifier",
            effectKey: STATUS_EFFECT_KEYS.HP_DECAY_RATE,
            multiplier: 0.1
          },
          {
            kind: "periodic",
            effectKey: STATUS_EFFECT_KEYS.STAMINA,
            delta: -1,
            everyMinutes: 3
          }
        ]
      }]
    }
  });

  const sidebarVm = buildSidebarStatusViewModel({ player });
  assert.equal(sidebarVm.healthStatusEffectTooltipVm.groups.length, 1);
  assert.equal(sidebarVm.healthStatusEffectTooltipVm.groups[0].name, "研究员的手稿");
  assert.deepEqual(sidebarVm.healthStatusEffectTooltipVm.groups[0].lines, [
    "健康衰减速率 -90%（00:36）",
    "每3分钟体力-1（00:36）"
  ]);
  assert.equal(sidebarVm.satietyStatusEffectTooltipVm.groups.length, 0);
}));

results.push(test("drug tooltip multiple drugs coexist", () => {
  const player = createDefaultPlayerState();
  applyConsumableEffectsToPlayer(player, {
    id: "bandage_dual_drug_test",
    category: "consumable",
    hpDecayRateMultiplier: {
      multiplier: 0.8,
      durationMinutes: 60,
      source: "consumable_bandage"
    }
  });
  applyConsumableEffectsToPlayer(player, {
    id: "manuscript_dual_drug_test",
    category: "consumable",
    statusEffects: {
      active: [{
        sourceItemId: "doc_researcher_manuscript",
        durationMinutes: 36,
        remainingMinutes: 36,
        effects: [{
          kind: "periodic",
          effectKey: STATUS_EFFECT_KEYS.STAMINA,
          delta: -1,
          everyMinutes: 3
        }]
      }]
    }
  });

  const sidebarVm = buildSidebarStatusViewModel({ player });
  assert.equal(sidebarVm.healthStatusEffectTooltipVm.groups.length, 2);
  assert.deepEqual(
    sidebarVm.healthStatusEffectTooltipVm.groups.map((group) => group.name),
    ["简易绷带", "研究员的手稿"]
  );
  assert.deepEqual(sidebarVm.healthStatusEffectTooltipVm.groups[0].lines, ["健康衰减速率 -20%（01:00）"]);
  assert.deepEqual(sidebarVm.healthStatusEffectTooltipVm.groups[1].lines, ["每3分钟体力-1（00:36）"]);
}));

results.push(test("food tooltip shows temperature-only effect", () => {
  const player = createDefaultPlayerState();
  const itemDef = {
    id: "food_temp_only_test",
    category: "consumable",
    satietyGain: 8,
    bodyTemperatureDecayModifier: {
      multiplier: 0.94,
      durationMinutes: 60,
      source: "takeout_braised_ribs_rice_box"
    }
  };

  const result = applyConsumableEffectsToPlayer(player, itemDef);
  assert.equal(result.statusEffectApplied, true);
  assert.equal(player.meta.statusEffects.active.length, 1);
  assert.equal(resolveStatusEffectDisplayChannel(player.meta.statusEffects.active[0]), STATUS_EFFECT_DISPLAY_CHANNELS.FOOD);

  const tooltipVm = buildSidebarStatusViewModel({ player }).satietyStatusEffectTooltipVm;
  assert.equal(tooltipVm.groups.length, 1);
  assert.match(tooltipVm.groups[0].lines[0], /体温下降速率 -6%（01:00）/);
}));

results.push(test("food tooltip shows mixed food effects", () => {
  const player = createDefaultPlayerState();
  applyConsumableEffectsToPlayer(player, {
    id: "food_mixed_effect_test",
    category: "consumable",
    satietyGain: 10,
    satietyDecayModifier: {
      multiplier: 0.9,
      durationMinutes: 60,
      source: "rice_bowl_snack_set"
    },
    bodyTemperatureDecayModifier: {
      multiplier: 0.94,
      durationMinutes: 60,
      source: "rice_bowl_snack_set"
    }
  });

  const tooltipVm = buildSidebarStatusViewModel({ player }).satietyStatusEffectTooltipVm;
  assert.equal(tooltipVm.groups.length, 1);
  assert.equal(tooltipVm.groups[0].lines.length, 2);
  assert.ok(tooltipVm.groups[0].lines.some((line) => /饱腹衰减速率 -10%（01:00）/.test(line)));
  assert.ok(tooltipVm.groups[0].lines.some((line) => /体温下降速率 -6%（01:00）/.test(line)));
}));

results.push(test("drug tooltip does not bleed into food tooltip", () => {
  const player = createDefaultPlayerState();
  applyConsumableEffectsToPlayer(player, {
    id: "doc_researcher_manuscript",
    category: "consumable",
    hpDecayRateMultiplier: {
      multiplier: 0.8,
      durationMinutes: 60,
      source: "doc_researcher_manuscript"
    }
  });

  const sidebarVm = buildSidebarStatusViewModel({ player });
  assert.equal(resolveStatusEffectDisplayChannel(player.meta.statusEffects.active[0]), STATUS_EFFECT_DISPLAY_CHANNELS.DRUG);
  assert.equal(sidebarVm.satietyStatusEffectTooltipVm.groups.length, 0);
  assert.equal(sidebarVm.healthStatusEffectTooltipVm.groups.length, 1);
  assert.match(sidebarVm.healthStatusEffectTooltipVm.groups[0].lines[0], /健康衰减速率 -20%（01:00）/);
  applyConsumableEffectsToPlayer(player, getNightKitchenFoodDef("rice_bowl_snack_set").effects);
  const mixedVm = buildSidebarStatusViewModel({ player });
  assert.equal(mixedVm.satietyStatusEffectTooltipVm.groups.length, 1);
  assert.equal(mixedVm.healthStatusEffectTooltipVm.groups.length, 1);
}));

results.push(test("status effect truth remains unpolluted", () => {
  const player = createDefaultPlayerState();
  applyConsumableEffectsToPlayer(player, {
    id: "food_truth_guard_test",
    category: "consumable",
    satietyGain: 8,
    bodyTemperatureDecayModifier: {
      multiplier: 0.94,
      durationMinutes: 60,
      source: "food_truth_guard_test"
    }
  });
  applyConsumableEffectsToPlayer(player, {
    id: "drug_truth_guard_test",
    category: "consumable",
    hpDecayRateMultiplier: {
      multiplier: 0.8,
      durationMinutes: 60,
      source: "drug_truth_guard_test"
    }
  });

  for (const entry of player.meta.statusEffects.active) {
    assert.equal("uiBucket" in entry, false);
    assert.equal("uiLabel" in entry, false);
    assert.equal("sourceName" in entry, false);
    assert.equal("sourceKind" in entry, false);
    assert.equal("displayChannel" in entry, false);
  }
}));

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  console.error(`status-effect governance regression failed: ${failed.length}`);
  process.exit(1);
}

console.log(`status-effect governance regression passed: ${results.length}`);