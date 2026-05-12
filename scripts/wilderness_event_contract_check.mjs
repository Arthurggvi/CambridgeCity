/**
 * Static contract check for wilderness random-event data (terrain tags, pools, defs).
 * Exit 0 when valid; exit 1 with error list otherwise.
 */
import assert from "node:assert/strict";

import { WILDERNESS_EVENT_DEFS } from "../data/wilderness/events/wilderness_event_defs.js";
import { WILDERNESS_EVENT_POOLS } from "../data/wilderness/events/wilderness_event_pools.js";
import { WILDERNESS_TERRAIN_EVENT_TAGS } from "../data/wilderness/events/wilderness_terrain_event_tags.js";
import { ensureItemsDbLoaded } from "../src/engine/items_db.js";
import { validateWildernessEventData } from "../src/engine/wilderness/events/wilderness_event_validate.js";

const itemsLoad = await ensureItemsDbLoaded();
if (!itemsLoad.ok) {
  console.error("wilderness_event_contract_check: FAILED");
  console.error(`  - items db load failed: ${itemsLoad.error || "unknown"}`);
  process.exit(1);
}

const { ok, errors } = validateWildernessEventData({
  terrainTags: WILDERNESS_TERRAIN_EVENT_TAGS,
  pools: WILDERNESS_EVENT_POOLS,
  defs: WILDERNESS_EVENT_DEFS,
  itemDefsById: itemsLoad.byId
});

assert.equal(WILDERNESS_EVENT_DEFS.snow_glint_debris_001, undefined);
assert.ok(WILDERNESS_EVENT_DEFS.west2_surface_debris_glint_001);
assert.ok(WILDERNESS_EVENT_DEFS.west2_hidden_snow_hollow_001);
assert.ok(WILDERNESS_EVENT_DEFS.west2_loose_marker_plate_001);
assert.ok(WILDERNESS_EVENT_DEFS.west2_torn_marker_tape_001);
assert.ok(WILDERNESS_EVENT_DEFS.west2_crossing_old_footprints_001);
assert.ok(WILDERNESS_EVENT_DEFS.west2_distant_metal_ping_001);
assert.ok(WILDERNESS_EVENT_DEFS.west2_faded_tape_mismatch_001);
assert.ok(WILDERNESS_EVENT_DEFS.west2_old_maintenance_cache_001);
assert.ok(!JSON.stringify(WILDERNESS_EVENT_DEFS).includes("west2_common_reward_pool"));
assert.ok(!JSON.stringify(WILDERNESS_EVENT_DEFS).includes("brass_commemorative_figurine"));
assert.ok(!JSON.stringify(WILDERNESS_EVENT_DEFS).includes("sealed_identity_tag_case"));
assert.ok(!JSON.stringify(WILDERNESS_EVENT_DEFS).includes("iridescent"));
assert.equal(
  WILDERNESS_EVENT_POOLS.west2_old_marker_patrol_line_event_pool.entries.find((entry) => entry.eventId === "west2_hidden_snow_hollow_001")?.weight,
  20
);

function makeGrantIntentEvent(resultIntents) {
  return {
    grant_item_contract_event: {
      id: "grant_item_contract_event",
      title: "grant item contract",
      presentation: {
        body: "contract body",
        logLine: "contract log"
      },
      actions: [
        {
          id: "take",
          label: "take",
          outcome: {
            resultText: "result",
            logLine: "log",
            resultIntents,
            continuation: { mode: "resume" }
          }
        }
      ]
    }
  };
}

function validateGrantFixture(resultIntents) {
  return validateWildernessEventData({
    terrainTags: {},
    pools: {},
    defs: makeGrantIntentEvent(resultIntents),
    itemDefsById: itemsLoad.byId
  });
}

assert.equal(validateGrantFixture([
  { type: "grant_item", itemId: "broken_marker_pole_clamp", qty: 1, reason: "contract" }
]).ok, true);
assert.equal(validateGrantFixture([
  { type: "grant_item", itemId: "broken_marker_pole_clamp" }
]).ok, true);
assert.equal(validateGrantFixture([
  { type: "unknown", itemId: "broken_marker_pole_clamp", qty: 1 }
]).ok, false);
assert.equal(validateGrantFixture([
  { type: "grant_item", qty: 1 }
]).ok, false);
assert.equal(validateGrantFixture([
  { type: "grant_item", itemId: "broken_marker_pole_clamp", qty: 0 }
]).ok, false);
assert.equal(validateGrantFixture([
  { type: "grant_item", itemId: "missing_wilderness_contract_item", qty: 1 }
]).ok, false);
assert.equal(validateGrantFixture([
  { type: "grant_item", itemId: "broken_marker_pole_clamp", qty: 1, extra: true }
]).ok, false);
assert.equal(validateGrantFixture([
  { type: "apply_player_delta", hp: -6, reason: "contract_hp" }
]).ok, true);
assert.equal(validateGrantFixture([
  { type: "apply_player_delta", stamina: -32, reason: "contract_stamina" }
]).ok, true);
assert.equal(validateGrantFixture([
  { type: "apply_player_delta", hp: -6, stamina: -32, reason: "contract_both" }
]).ok, true);
assert.equal(validateGrantFixture([
  { type: "apply_player_delta", reason: "missing_delta" }
]).ok, false);
assert.equal(validateGrantFixture([
  { type: "apply_player_delta", hp: "bad" }
]).ok, false);
assert.equal(validateGrantFixture([
  { type: "apply_player_delta", stamina: "bad" }
]).ok, false);
assert.equal(validateGrantFixture([
  { type: "apply_player_delta", hp: -1, fatigue: 10 }
]).ok, false);

if (ok) {
  console.log("wilderness_event_contract_check: OK");
  process.exit(0);
}

console.error("wilderness_event_contract_check: FAILED");
for (const msg of errors) {
  console.error(`  - ${msg}`);
}
process.exit(1);
