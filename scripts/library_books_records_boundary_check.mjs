import { recordDefinitions } from "../data/records/index.js";
import { normalizeRecordState } from "../src/engine/records/record_state.js";
import { resolveLibraryReadingAction } from "../src/engine/library_reading/service.js";
import { getLibraryReadingCatalog, listLibraryReadingBooks } from "../src/engine/library_reading/catalog.js";
import { getLibraryBookContentById } from "../data/library/books/index.js";
import { makeEmptyPlan } from "../src/engine/pipeline/plan_types.js";
import { commit } from "../src/engine/pipeline/commit.js";
import { Effects } from "../src/engine/pipeline/effects.js";
import { getTransientIntentsFromCommitReport } from "../src/engine/pipeline/transient_intent_adapter.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasBookRecordId(value) {
  return String(value || "").startsWith("west2_library_book_");
}

function makeMockGameState() {
  return {
    currentMapId: "west2_outpost_library_center",
    currentSceneId: "west2_outpost_library_reading",
    currentScene: { id: "west2_outpost_library_reading" },
    time: { totalMinutes: 0 },
    world: { currentMapId: "west2_outpost_library_center", flags: {} },
    player: { meta: {}, profile: {} },
    flags: {},
    logLines: []
  };
}

function testRecordsRegistry() {
  const ids = Array.isArray(recordDefinitions) ? recordDefinitions.map((r) => String(r?.id || "")) : [];
  const bad = ids.filter((id) => hasBookRecordId(id));
  assert(bad.length === 0, `recordDefinitions must not contain west2_library_book_*: ${bad.join(", ")}`);
}

function testRecordStateSanitize() {
  const polluted = {
    byId: {
      west2_library_book_principles_of_geology_001: { recordId: "west2_library_book_principles_of_geology_001", rewardGranted: true, snapshotVersion: 1 },
      west2_reflective_post_001: { recordId: "west2_reflective_post_001", rewardGranted: true, snapshotVersion: 1 }
    },
    order: ["west2_library_book_principles_of_geology_001", "west2_reflective_post_001"]
  };
  const normalized = normalizeRecordState(polluted);
  assert(!normalized.order.some((id) => hasBookRecordId(id)), "normalizeRecordState must drop west2_library_book_* from order");
  assert(!Object.keys(normalized.byId).some((id) => hasBookRecordId(id)), "normalizeRecordState must drop west2_library_book_* from byId");
  assert(normalized.order.includes("west2_reflective_post_001"), "normalizeRecordState must keep normal record ids");
}

function testLibraryReadingNoRecordIdLeak() {
  const mockState = {
    time: { totalMinutes: 0 },
    world: { currentMapId: "west2_outpost_library_center", flags: {} },
    player: {
      meta: {},
    }
  };
  const result = resolveLibraryReadingAction(mockState, {
    mapId: "west2_outpost_library_center",
    actionId: "read_random_library_book",
    sceneId: "west2_outpost_library_reading"
  });
  assert(result && result.ok, `resolveLibraryReadingAction should be ok (reason=${result?.reason || "unknown"})`);
  assert(result.selectedContentId, "library_reading must return selectedContentId");
  assert(result.selectedRecordId == null, "library_reading must not expose selectedRecordId");
  assert(result.reward && result.reward.experience === 10, "first read must return reward.experience=10");
}

function testLibraryBookContentReadable() {
  const entry = getLibraryBookContentById("west2_library_book_robinson_crusoe_001");
  assert(entry && entry.body && entry.body.length > 0, "library book content must be readable");
}

async function testLibraryReadingRewardPlanAndCommit() {
  const gameState = makeMockGameState();
  const first = resolveLibraryReadingAction(gameState, {
    mapId: "west2_outpost_library_center",
    actionId: "read_random_library_book",
    sceneId: "west2_outpost_library_reading"
  });
  assert(first.ok && first.isFirstRead === true, "first resolve must be first read");

  const plan = makeEmptyPlan({ id: "read_random_library_book" });
  plan.effects.push(Effects.set("player.meta.libraryReading", first.nextState));
  plan.profileIntents.push({
    type: "xp",
    key: "experience",
    amount: Number(first.reward.experience),
    reason: `library_reading:first_read:${first.selectedContentId}`
  });

  assert(Array.isArray(plan.recordIntents) && plan.recordIntents.length === 0, "first read must not create recordIntents");
  assert(plan.profileIntents.some((x) => x?.key === "experience" && x?.amount === 10 && String(x?.reason || "").includes("library_reading")), "first read must create profileIntents experience+10 with library_reading reason");

  const commitResult = await commit(plan, gameState);
  assert(commitResult && commitResult.ok === true, "commit should succeed");
  const xpAfter = Number(commitResult.report?.profile?.apply?.after?.experience?.xp || 0);
  assert(xpAfter === 10, `commit should grant experience.xp +10 (got=${xpAfter})`);
  const results = Array.isArray(commitResult.report?.records?.results) ? commitResult.report.records.results : [];
  assert(!results.some((row) => hasBookRecordId(row?.recordId)), "commit report.records.results must not contain library book rows");

  const transients = getTransientIntentsFromCommitReport(commitResult.report);
  const dataDeltaToasts = transients.filter((x) => String(x?.type || "") === "data_delta_toast");
  assert(dataDeltaToasts.length > 0, "commit should emit at least one data_delta_toast");
  const libraryReadingToasts = dataDeltaToasts.filter((x) => String(x?.payload?.semanticType || "") === "library_reading_delta");
  assert(libraryReadingToasts.length > 0, "must emit library_reading_delta toast");
  const toast = libraryReadingToasts[0];
  assert(String(toast?.payload?.variant || "") === "worldview-reading", "library_reading_delta toast must use worldview-reading variant");
  assert(!Array.isArray(toast.emphasisTargets) || !toast.emphasisTargets.includes("records_entry"), "data_delta_toast must not emphasize records_entry");
  const lines = Array.isArray(toast?.payload?.lines) ? toast.payload.lines : [];
  const hasExpLine = lines.some((line) => String(line?.text || "").includes("阅历＋10"));
  assert(hasExpLine, "library_reading_delta toast must include 阅历＋10 line");

  const genericToasts = dataDeltaToasts.filter((x) => String(x?.payload?.semanticType || "") !== "library_reading_delta");
  const genericText = genericToasts.flatMap((x) => Array.isArray(x?.payload?.lines) ? x.payload.lines : []).map((l) => String(l?.text || ""));
  assert(!genericText.some((t) => t.includes("阅历＋10")), "generic data_delta_toast must not duplicate 阅历＋10");

  // repeat read: force seenBookIds to cover all books, so isFirstRead must be false and reward must be null.
  const catalog = getLibraryReadingCatalog("west2_outpost_library_center");
  const allBookIds = listLibraryReadingBooks(catalog).map((b) => String(b?.id || "")).filter(Boolean);
  assert(allBookIds.length > 0, "catalog must have books");
  const gameStateRepeat = makeMockGameState();
  gameStateRepeat.player.meta.libraryReading = { seenBookIds: allBookIds, readOrder: allBookIds.slice(), daily: { dayKey: "x", readCount: 0 } };
  const second = resolveLibraryReadingAction(gameStateRepeat, {
    mapId: "west2_outpost_library_center",
    actionId: "read_random_library_book",
    sceneId: "west2_outpost_library_reading"
  });
  assert(second.ok === true, "repeat resolve should be ok");
  assert(second.isFirstRead === false, "repeat resolve must not be first read when all seen");
  assert(second.reward == null, "repeat resolve must not return reward");
}

testRecordsRegistry();
testRecordStateSanitize();
testLibraryReadingNoRecordIdLeak();
testLibraryBookContentReadable();
await testLibraryReadingRewardPlanAndCommit();

console.log("OK: library books are detached from records.");

