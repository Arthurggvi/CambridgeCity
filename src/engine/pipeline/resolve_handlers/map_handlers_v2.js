import {
  consumeEquippedFireToolDurability,
  getEquippedFireToolEntry,
  getToolDurabilityStatePath,
  isIgnitionActionId,
  resolveIgnitionSupportSpec
} from "../../ignition_tools.js";
import {
  ARCHIVE_READING_PAGE_MINUTES,
  createArchiveReadingIntent,
  resolveArchiveReadingPageSpecFromScene,
} from "../../archive_reading/service.js";
import {
  collectSceneInteractionsV2,
  createInteractionPayloadV2,
  findInteractionV2,
  isMapContentV2,
  resolveCurrentSceneV2,
  resolveInteractionEdgeV2,
  V2_INTERACTION_TYPES
} from "../../map_content_v2.js";
import { buildInteractionUiFeedback, buildRuntimeInteractionViewModel } from "../../map_content_runtime.js";
import { resolveMargFrontdeskGreetingOutcome } from "../../marg_frontdesk_greeting.js";
import {
  buildMargTransitionAdvanceContext,
  resolveMargTransitionBlockerWithinMinutes
} from "../../marg_transition_blocker_provider.js";
import { getLibraryReadingBlockerReason, resolveLibraryReadingAction } from "../../library_reading/service.js";
import { buildSocialIntentFromEffectRow, isSocialEffectType } from "../social_effect_rows.js";
import { queueOneShotBusinessFromBuilder } from "./one_shot_business_map_action.js";
import { getLibraryBookContentById } from "../../../../data/library/books/index.js";
import { getSupplySubmissionSpec, isSubmittableSupplyItem } from "../../items_db.js";
import { addWildernessPipelineIntent } from "../plan_types.js";
import { resolveWildernessStartSessionReadOnly } from "../../wilderness/wilderness_action_plans.js";

const RUNTIME_INTERACTION_HELPERS = Object.freeze({
  marg_frontdesk_greeting: "marg_frontdesk_greeting",
  rescue_station_submit_supplies: "rescue_station_submit_supplies",
  wilderness_start_session: "wilderness_start_session"
});

const LIBRARY_READING_RESULT_SCENE_ID = "west2_outpost_library_reading_result";

function findSceneById(map, sceneId) {
  if (!map || !Array.isArray(map?.scenes)) return null;
  return map.scenes.find((row) => String(row?.id || "").trim() === String(sceneId || "").trim()) || null;
}

function getLibraryBookBodyByContentId(contentId) {
  const content = getLibraryBookContentById(contentId);
  return String(content?.body || "").trim();
}

function buildLibraryReadingResultMap(map, readingResult, recordBody) {
  if (!map || typeof map !== "object") return map;
  const title = String(readingResult?.selectedBook?.title || "").trim();
  const body = String(recordBody || "").trim();
  const resultText = [
    title ? `你拿了一本书，${title}` : "你拿了一本书。",
    body
  ].filter(Boolean).join("\n\n");
  const existingRows = Array.isArray(map?.descriptionByFlags) ? map.descriptionByFlags : [];
  const nextScenes = Array.isArray(map?.scenes) ? map.scenes.map((row) => ({ ...row })) : [];
  const nextInteractions = Array.isArray(map?.interactions) ? map.interactions.map((row) => ({ ...row })) : [];
  const nextEdges = Array.isArray(map?.edges) ? map.edges.map((row) => ({ ...row })) : [];

  if (!nextScenes.some((row) => String(row?.id || "").trim() === LIBRARY_READING_RESULT_SCENE_ID)) {
    nextScenes.push({
      id: LIBRARY_READING_RESULT_SCENE_ID,
      type: "POINT",
      text: "阅读结果",
      defaultReturnSceneId: "west2_outpost_library_reading"
    });
  }
  if (!nextInteractions.some((row) => String(row?.id || "").trim() === "return_to_library_reading_from_book_result")) {
    nextInteractions.push({
      id: "return_to_library_reading_from_book_result",
      sceneId: LIBRARY_READING_RESULT_SCENE_ID,
      type: "TRANSITION",
      text: "返回阅览区",
      target: {
        toSceneId: "west2_outpost_library_reading",
        minutes: 0,
        kind: "TRANSITION"
      },
      ui: {
        type: "button"
      }
    });
  }
  if (!nextEdges.some((row) => String(row?.fromSceneId || row?.from || "").trim() === LIBRARY_READING_RESULT_SCENE_ID && String(row?.toSceneId || row?.to || "").trim() === "west2_outpost_library_reading")) {
    nextEdges.push({
      id: "west2_outpost_library_reading_result:return_to_library_reading",
      fromSceneId: LIBRARY_READING_RESULT_SCENE_ID,
      toSceneId: "west2_outpost_library_reading",
      minutes: 0,
      kind: "TRANSITION"
    });
  }

  return {
    ...map,
    scenes: nextScenes,
    interactions: nextInteractions,
    edges: nextEdges,
    descriptionByFlags: [
      {
        path: "currentSceneId",
        equals: LIBRARY_READING_RESULT_SCENE_ID,
        text: resultText,
        __libraryReadingResultScene: true
      },
      ...existingRows.filter((row) => row?.__libraryReadingResultScene !== true)
    ]
  };
}

function normalizeMenuMode(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "dine" || text === "takeout" ? text : "";
}

function normalizeMenuPanel(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "shop_goods" ? "shop_goods" : "night_kitchen";
}

function addInteractionEffects(plan, addEffect, interaction) {
  for (const effect of Array.isArray(interaction?.effects) ? interaction.effects : []) {
    addEffect(plan, effect);
  }
}

function addInteractionSocialEffects(plan, addSocialIntent, addNote, map, gameState, interaction) {
  for (const effect of Array.isArray(interaction?.socialEffects) ? interaction.socialEffects : []) {
    const effectType = String(effect?.type || "").trim().toLowerCase();
    if (!isSocialEffectType(effectType)) {
      addNote(plan, `scene_interaction_v2 social effect 非法，已跳过：${effectType || "(empty)"}`);
      continue;
    }
    const built = buildSocialIntentFromEffectRow(effect, {
      mapId: String(map?.id || gameState?.currentMapId || "").trim() || null,
      actionId: String(interaction?.id || "").trim() || null,
      sceneId: String(gameState?.currentScene?.id || gameState?.currentSceneId || "").trim() || null,
      atMinute: Number(gameState?.time?.totalMinutes ?? 0),
      reason: `${String(map?.id || "")}.${String(interaction?.id || "")}:${effectType}`
    });
    if (!built?.ok || !built.intent) {
      addNote(plan, `${built?.error || `scene_interaction_v2 social effect 归一失败：${effectType}`}，已跳过`);
      continue;
    }
    addSocialIntent(plan, built.intent);
    addNote(plan, `scene_interaction_v2 social 意图：${effectType} -> ${built.intent.npcId}`);
  }
}

function applyRuntimeInteractionHelpers(interaction, gameState) {
  const helperId = String(interaction?.runtime?.helper || "").trim();
  if (!helperId) return interaction;

  if (helperId === RUNTIME_INTERACTION_HELPERS.marg_frontdesk_greeting) {
    const greetingOutcome = resolveMargFrontdeskGreetingOutcome({ gameState, totalMinutes: gameState?.time?.totalMinutes });
    const nextUi = interaction?.ui && typeof interaction.ui === "object" ? { ...interaction.ui } : {};
    const nextFeedback = nextUi.feedback && typeof nextUi.feedback === "object" ? { ...nextUi.feedback } : {};
    if (typeof greetingOutcome?.logLine === "string" && greetingOutcome.logLine.trim()) {
      nextFeedback.message = greetingOutcome.logLine;
      nextUi.feedback = nextFeedback;
    }
    return {
      ...interaction,
      ui: nextUi,
      effects: [
        ...(Array.isArray(interaction?.effects) ? interaction.effects : []),
        ...greetingOutcome.effects
      ],
      socialEffects: [
        ...(Array.isArray(interaction?.socialEffects) ? interaction.socialEffects : []),
        ...greetingOutcome.socialEffects
      ]
    };
  }

  return interaction;
}

function buildSupplySubmissionPreview({ inventory, itemsById, channel }) {
  const normalizedInventory = Array.isArray(inventory) ? inventory : [];
  const tally = new Map();
  for (const row of normalizedInventory) {
    const itemId = String(row?.itemId || "").trim();
    const qty = Math.max(0, Math.floor(Number(row?.qty ?? 0)));
    if (!itemId || qty <= 0) continue;
    const def = itemsById?.get ? itemsById.get(itemId) : null;
    if (!def) continue;
    if (!isSubmittableSupplyItem(def, channel)) continue;
    tally.set(itemId, (tally.get(itemId) || 0) + qty);
  }

  const entries = Array.from(tally.entries())
    .map(([itemId, qty]) => {
      const def = itemsById.get(itemId);
      const spec = getSupplySubmissionSpec(def);
      const unitValue = Math.max(0, Math.trunc(Number(spec?.value ?? 0)));
      return {
        itemId,
        name: String(def?.name || itemId),
        qty,
        quality: String(spec?.quality || ""),
        unitValue,
        totalValue: unitValue * qty
      };
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh-CN"));

  const totalValue = entries.reduce((sum, row) => sum + Math.max(0, Math.trunc(Number(row?.totalValue ?? 0))), 0);
  return { channel, entries, totalValue };
}

function formatSupplySubmissionConfirmMessage(preview) {
  const lines = [];
  lines.push("确认提交——");
  lines.push("");
  for (const row of Array.isArray(preview?.entries) ? preview.entries : []) {
    const name = String(row?.name || "");
    const qty = Math.max(0, Math.trunc(Number(row?.qty ?? 0)));
    const totalValue = Math.max(0, Math.trunc(Number(row?.totalValue ?? 0)));
    if (!name || qty <= 0) continue;
    lines.push(`${name} ×${qty}　${totalValue}`);
  }
  lines.push("");
  lines.push(`合计 ${Math.max(0, Math.trunc(Number(preview?.totalValue ?? 0)))}`);
  lines.push("");
  lines.push("给我吗？");
  return lines.join("\n");
}

async function handleRescueStationSubmitSuppliesInteractionV2(ctx, map, runtimeInteraction, basePayload) {
  const { payload, plan, gameState, addNote, ensureItemsDbLoaded } = ctx;

  const loaded = await ensureItemsDbLoaded();
  if (!loaded.ok) {
    plan.uiFeedback = {
      title: "提交物资",
      message: loaded.error || "物品数据库加载失败",
      variant: "reject"
    };
    addNote(plan, "rescue_station_submit_supplies: items db load failed");
    plan.action.payload = { ...plan.action.payload, ...basePayload };
    return true;
  }

  const channel = "rescue_station";
  const confirmed = payload?.supplySubmissionConfirm && typeof payload.supplySubmissionConfirm === "object"
    ? payload.supplySubmissionConfirm
    : null;

  // Second action: user already confirmed in UI layer.
  if (confirmed && confirmed.confirmed === true && String(confirmed.channel || "") === channel) {
    const rawEntries = Array.isArray(confirmed.entries) ? confirmed.entries : [];
    const intentEntries = rawEntries
      .map((row) => ({
        itemId: String(row?.itemId || "").trim(),
        qty: Math.max(0, Math.floor(Number(row?.qty ?? 0)))
      }))
      .filter((row) => row.itemId && row.qty > 0);

    if (intentEntries.length === 0) {
      plan.uiFeedback = {
        title: "伊森",
        message: "物资清单已经变化。",
        variant: "reject"
      };
      addNote(plan, "rescue_station_submit_supplies: confirm payload empty");
      plan.action.payload = { ...plan.action.payload, ...basePayload };
      return true;
    }

    plan.supplySubmissionIntents.push({
      type: "SUBMIT_SUPPLIES",
      channel,
      entries: intentEntries,
      expectedTotalValue: Math.max(0, Math.trunc(Number(confirmed.expectedTotalValue ?? 0))),
      source: {
        mapId: String(map?.id || gameState?.currentMapId || "").trim(),
        interactionId: String(runtimeInteraction?.id || "").trim(),
        sceneId: String(gameState?.currentScene?.id || gameState?.currentSceneId || "").trim()
      }
    });
    addNote(plan, `rescue_station_submit_supplies: confirmed intent entries=${intentEntries.length}`);
    plan.action.payload = { ...plan.action.payload, ...basePayload };
    return true;
  }

  // First action: build preview and ask dispatch to open dialog.
  const itemsById = loaded.byId;
  const preview = buildSupplySubmissionPreview({
    inventory: gameState?.player?.inventory,
    itemsById,
    channel
  });

  if (!Array.isArray(preview.entries) || preview.entries.length === 0) {
    plan.uiCommands.push({
      type: "OPEN_NOTICE_DIALOG",
      title: "伊森",
      message: "伊森看了看你，又看了看你空荡荡的包。\n“看起来你口袋比我还要空呢。”"
    });
    addNote(plan, "rescue_station_submit_supplies: empty preview -> ui command");
    plan.action.payload = { ...plan.action.payload, ...basePayload, supplySubmissionPreview: preview };
    return true;
  }

  plan.uiCommands.push({
    type: "OPEN_SUPPLY_SUBMISSION_CONFIRM",
    title: "伊森",
    message: "确认提交——\n\n给我吗？",
    channel,
    preview
  });
  addNote(plan, `rescue_station_submit_supplies: preview ready total=${preview.totalValue}`);
  plan.action.payload = { ...plan.action.payload, ...basePayload, supplySubmissionPreview: preview };
  return true;
}

function addInteractionEvent(plan, addSysCall, SYSCALL_TYPES, interaction) {
  const eventId = String(interaction?.eventId || "").trim();
  if (!eventId) return;
  addSysCall(plan, SYSCALL_TYPES.LOAD_EVENT, { eventId });
}

function setInteractionFeedback(plan, map, interaction) {
  const uiFeedback = buildInteractionUiFeedback(String(map?.id || ""), interaction, map);
  if (uiFeedback) {
    plan.uiFeedback = uiFeedback;
  }
}

function addAdvanceTime(plan, addSysCall, SYSCALL_TYPES, minutes, reason, ctx = {}) {
  if (!Number.isInteger(minutes) || minutes <= 0) return;
  addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
    minutes,
    reason,
    ctx: {
      isSleeping: false,
      ...ctx
    }
  });
}

function shouldShortCircuitForMargTransitionBlocker({ gameState, minutes, advanceContext }) {
  if (!Number.isInteger(minutes) || minutes <= 0) return false;
  return !!resolveMargTransitionBlockerWithinMinutes({
    gameState,
    totalMinutes: gameState?.time?.totalMinutes,
    minutes,
    advanceContext
  });
}

function reject(plan, addNote, source, code, reason, details = []) {
  plan.rejection = {
    source,
    code,
    reason,
    reasons: Array.isArray(details) ? details.filter(Boolean) : []
  };
  addNote(plan, `${source}:${code}:${reason}`);
}

async function handleIgnitionInteractionV2(ctx, map, interaction, basePayload) {
  const {
    plan,
    gameState,
    addEffect,
    addNote,
    Effects,
    ensureItemsDbLoaded
  } = ctx;

  const support = resolveIgnitionSupportSpec(interaction);
  if (!support) {
    reject(plan, addNote, "scene_interaction_v2", "IGNITION_NOT_SUPPORTED", `${String(map?.id || "")}.${String(interaction?.id || "")}`, ["这里没有合适的可燃物。"]);
    return true;
  }

  const loaded = await ensureItemsDbLoaded();
  if (!loaded.ok) {
    reject(plan, addNote, "scene_interaction_v2", "ITEMS_DB_LOAD_FAILED", loaded.error || "物品数据库加载失败", [loaded.error || "物品数据库加载失败"]);
    return true;
  }

  const itemsById = loaded.byId;
  const fireTool = getEquippedFireToolEntry(gameState);
  if (!fireTool) {
    reject(plan, addNote, "scene_interaction_v2", "IGNITION_TOOL_MISSING", `${String(map?.id || "")}.${String(interaction?.id || "")}`, ["缺少已装备的生火工具。"]);
    return true;
  }

  const durabilityResult = consumeEquippedFireToolDurability(gameState, { itemsById, amount: 1 });
  if (!durabilityResult.ok) {
    reject(plan, addNote, "scene_interaction_v2", durabilityResult.reason || "IGNITION_FAILED", `${String(map?.id || "")}.${String(interaction?.id || "")}`, [support.failureText]);
    return true;
  }

  addEffect(plan, Effects.push("logLines", support.successText));
  if (durabilityResult.tracked) {
    addEffect(plan, Effects.set(getToolDurabilityStatePath(durabilityResult.itemId), durabilityResult.next));
    if (durabilityResult.broken) {
      addEffect(plan, Effects.set("player.equippedTools", durabilityResult.nextEquippedTools));
      addEffect(plan, Effects.push("logLines", `${durabilityResult.itemName}已失效。`));
    }
  }

  addNote(plan, `scene_interaction_v2 ignition ok:${String(interaction?.id || "")}:${String(fireTool.itemId || "")}`);
  plan.action.payload = {
    ...plan.action.payload,
    ...basePayload
  };
  return true;
}

async function handlePurchaseInteractionV2(ctx, map, interaction) {
  const {
    action,
    payload,
    plan,
    gameState,
    addBusinessIntent,
    addNote,
  } = ctx;
  await queueOneShotBusinessFromBuilder({
    action,
    gameState,
    plan,
    addBusinessIntent,
    addNote,
    executorId: String(interaction?.semantic?.executorId || "shop_purchase"),
    businessType: String(interaction?.semantic?.businessType || "purchase"),
    idempotencyMode: String(interaction?.semantic?.idempotencyMode || "request"),
    source: {
      origin: "map_action",
      actionId: String(interaction?.id || "").trim(),
      mapId: String(map?.id || "").trim(),
      sceneId: String(gameState?.currentScene?.id || gameState?.currentSceneId || "").trim()
    },
    buildPayload: (executor) => typeof executor.buildIntentPayloadFromNightKitchenRequest === "function"
      ? executor.buildIntentPayloadFromNightKitchenRequest({
          mapId: String(map?.id || "").trim(),
          foodId: String(payload?.itemId || payload?.foodId || interaction?.purchase?.foodId || "").trim(),
          menuMode: normalizeMenuMode(payload?.mode || payload?.menuMode || interaction?.purchase?.menuMode)
        }, interaction)
      : null,
    payloadInvalidCode: "V2_PURCHASE_PAYLOAD_INVALID",
    payloadInvalidReason: `无法从 V2 purchase 构造 business payload: ${String(interaction?.id || "")}`
  });
  return true;
}

function resolveInteractionLookupId(actionId, payload) {
  const payloadInteractionId = String(payload?.interactionId || "").trim();
  if (payloadInteractionId) return payloadInteractionId;
  if (isIgnitionActionId(actionId)) {
    return String(actionId || "").slice("scene_ignite:".length).trim();
  }
  return String(actionId || "").trim();
}

export async function handleSceneInteractionV2(ctx) {
  const {
    action,
    id,
    payload,
    plan,
    gameState,
    addEffect,
    addArchiveReadingIntent,
    addBusinessIntent,
    addSysCall,
    addSocialIntent,
    addNote,
    Effects,
    SYSCALL_TYPES,
    evaluateRequires
  } = ctx;
  const map = gameState?.currentMap;
  if (!isMapContentV2(map)) return false;

  const { scene, sceneId } = resolveCurrentSceneV2(gameState, map);
  if (!scene || !sceneId) {
    reject(plan, addNote, "scene_interaction_v2", "SCENE_MISSING", "当前场景不存在", ["当前场景不存在"]);
    return true;
  }

  const interaction = findInteractionV2(map, {
    interactionId: resolveInteractionLookupId(id, payload),
    sceneId: payload?.sceneId || sceneId,
    actionId: id
  });
  if (!interaction) return false;

  const currentSceneInteractions = collectSceneInteractionsV2(gameState, map, scene);
  const sameScene = currentSceneInteractions.find((row) => String(row?.id || "") === String(interaction?.id || ""));
  if (!sameScene) {
    reject(plan, addNote, "scene_interaction_v2", "INTERACTION_SCENE_MISMATCH", "动作不属于当前场景", ["动作不属于当前场景"]);
    return true;
  }

  const runtimeInteraction = applyRuntimeInteractionHelpers(
    buildRuntimeInteractionViewModel(String(map?.id || ""), interaction, map) || interaction,
    gameState
  );
  const requireSpec = runtimeInteraction?.requires;
  if (requireSpec) {
    const requireResult = evaluateRequires(gameState, requireSpec);
    if (!requireResult.ok) {
      reject(plan, addNote, "requires", "REQUIRES_NOT_MET", `${String(map?.id || "")}.${String(interaction?.id || "")}`, requireResult.reasons || []);
      return true;
    }
  }

  if (runtimeInteraction?.ui?.disabledRequires) {
    const disabledResult = evaluateRequires(gameState, runtimeInteraction.ui.disabledRequires);
    if (disabledResult.ok) {
      reject(plan, addNote, "disabledRequires", "DISABLED_REQUIRES_MATCHED", `${String(map?.id || "")}.${String(interaction?.id || "")}`, disabledResult.reasons || []);
      return true;
    }
  }

  const basePayload = createInteractionPayloadV2(map, scene, interaction);
  const margTransitionAdvanceContext = buildMargTransitionAdvanceContext({
    gameState,
    mapId: String(map?.id || ""),
    sceneId
  });
  addNote(plan, `scene_interaction_v2:${String(map?.id || "")}.${String(interaction?.id || "")}`);

  if (String(runtimeInteraction?.runtime?.helper || "").trim() === RUNTIME_INTERACTION_HELPERS.rescue_station_submit_supplies) {
    return handleRescueStationSubmitSuppliesInteractionV2(ctx, map, runtimeInteraction, basePayload);
  }

  if (String(runtimeInteraction?.runtime?.helper || "").trim() === RUNTIME_INTERACTION_HELPERS.wilderness_start_session) {
    const areaId = String(runtimeInteraction?.wilderness?.areaId || "").trim();
    const startRead = resolveWildernessStartSessionReadOnly({ areaId, gameState });
    if (!startRead.ok) {
      reject(
        plan,
        addNote,
        "wilderness",
        startRead.code || "WILDERNESS_START_REJECTED",
        startRead.reason || "wilderness start rejected",
        startRead.reasons || []
      );
      plan.action.payload = { ...plan.action.payload, ...basePayload };
      return true;
    }
    const rawStartX = runtimeInteraction?.wilderness?.x;
    const rawStartY = runtimeInteraction?.wilderness?.y;
    const hasStartX = Number.isInteger(rawStartX);
    const hasStartY = Number.isInteger(rawStartY);
    addWildernessPipelineIntent(plan, {
      type: "WILDERNESS_START_SESSION",
      areaSpec: startRead.areaSpec,
      originMapId: String(map?.id || "").trim(),
      ...(hasStartX && hasStartY ? { startAt: { x: rawStartX, y: rawStartY } } : {})
    });
    addNote(plan, `wilderness:start_session intent queued area=${String(startRead.areaSpec?.id || "")}`);
    plan.action.payload = { ...plan.action.payload, ...basePayload };
    return true;
  }

  if (String(runtimeInteraction?.id || "").trim() === "read_random_library_book") {
    const readingResult = resolveLibraryReadingAction(gameState, {
      mapId: String(map?.id || "").trim(),
      actionId: String(runtimeInteraction?.id || id || "").trim(),
      sceneId: String(sceneId || gameState?.currentScene?.id || gameState?.currentSceneId || "").trim()
    });

    if (!readingResult?.ok) {
      reject(plan, addNote, "library_reading", "LIBRARY_READING_UNAVAILABLE", "阅览室书目暂不可用");
      plan.uiFeedback = {
        title: "阅览室",
        message: "阅览室书目暂不可用",
        variant: "reject"
      };
      plan.action.payload = {
        ...plan.action.payload,
        ...basePayload
      };
      return true;
    }

    if (readingResult.blocked) {
      reject(plan, addNote, "library_reading", "LIBRARY_READING_DAILY_LIMIT", getLibraryReadingBlockerReason());
      plan.uiFeedback = {
        title: "阅览室",
        message: getLibraryReadingBlockerReason(),
        variant: "reject"
      };
      plan.action.payload = {
        ...plan.action.payload,
        ...basePayload
      };
      return true;
    }

    addAdvanceTime(
      plan,
      addSysCall,
      SYSCALL_TYPES,
      90,
      "scene_interaction_v2:library_reading",
      margTransitionAdvanceContext
    );
    if (shouldShortCircuitForMargTransitionBlocker({ gameState, minutes: 90, advanceContext: margTransitionAdvanceContext })) {
      plan.action.payload = {
        ...plan.action.payload,
        ...basePayload
      };
      return true;
    }
    const recordBody = getLibraryBookBodyByContentId(readingResult.selectedContentId);
    const resultMap = buildLibraryReadingResultMap(map, readingResult, recordBody);
    const resultScene = findSceneById(resultMap, LIBRARY_READING_RESULT_SCENE_ID);
    addEffect(plan, Effects.set("player.meta.libraryReading", readingResult.nextState));
    addEffect(plan, Effects.set("currentMap", resultMap));
    addEffect(plan, Effects.set("currentSceneId", LIBRARY_READING_RESULT_SCENE_ID));
    addEffect(plan, Effects.set("currentScene", resultScene ? { ...resultScene } : null));
    addEffect(
      plan,
      Effects.push(
        "logLines",
        readingResult.isFirstRead
          ? `你在阅览区静下来看完了${readingResult.selectedBook.title}。`
          : `你又一次翻开了${readingResult.selectedBook.title}。`
      )
    );
    if (readingResult.isFirstRead && readingResult.reward) {
      const rewardExp = Number(readingResult?.reward?.experience || 0);
      const expAmount = Number.isFinite(rewardExp) ? Math.trunc(rewardExp) : 0;
      if (expAmount > 0) {
      const current = Array.isArray(plan.profileIntents) ? plan.profileIntents : [];
      plan.profileIntents = [
        ...current,
        {
          type: "xp",
          key: "experience",
          amount: expAmount,
          reason: `library_reading:first_read:${readingResult.selectedContentId || readingResult.selectedBook.id}`
        }
      ];
      }
      addNote(plan, `scene_interaction_v2 library_reading:first:${readingResult.selectedBook.id}`);
    } else {
      addNote(plan, `scene_interaction_v2 library_reading:repeat:${readingResult.selectedBook.id}`);
    }
    plan.action.payload = {
      ...plan.action.payload,
      ...basePayload,
      bookId: readingResult.selectedBook.id,
      contentId: readingResult.selectedContentId,
      isFirstRead: readingResult.isFirstRead === true,
      resultSceneId: LIBRARY_READING_RESULT_SCENE_ID
    };
    return true;
  }

  if (isIgnitionActionId(id)) {
    return handleIgnitionInteractionV2(ctx, map, runtimeInteraction, basePayload);
  }

  switch (String(runtimeInteraction?.type || "").trim()) {
    case V2_INTERACTION_TYPES.OBSERVE:
    case V2_INTERACTION_TYPES.REST:
    case V2_INTERACTION_TYPES.TIME_SKIP: {
      const minutes = Number.isInteger(payload?.minutes)
        ? payload.minutes
        : (Number.isInteger(runtimeInteraction?.minutes) ? runtimeInteraction.minutes : Number(runtimeInteraction?.payload?.minutes || 0));
      const resolvedMinutes = Number.isInteger(minutes) ? minutes : 0;
      addAdvanceTime(
        plan,
        addSysCall,
        SYSCALL_TYPES,
        resolvedMinutes,
        `scene_interaction_v2:${runtimeInteraction.type.toLowerCase()}`,
        margTransitionAdvanceContext
      );
      if (shouldShortCircuitForMargTransitionBlocker({ gameState, minutes: resolvedMinutes, advanceContext: margTransitionAdvanceContext })) {
        plan.action.payload = {
          ...plan.action.payload,
          ...basePayload
        };
        return true;
      }
      addInteractionEffects(plan, addEffect, runtimeInteraction);
      addInteractionSocialEffects(plan, addSocialIntent, addNote, map, gameState, runtimeInteraction);
      addInteractionEvent(plan, addSysCall, SYSCALL_TYPES, runtimeInteraction);
      setInteractionFeedback(plan, map, runtimeInteraction);
      if (plan.uiFeedback && !plan.uiFeedback.variant) {
        plan.uiFeedback.variant = String(runtimeInteraction.type || "").trim().toLowerCase();
      }
      plan.action.payload = {
        ...plan.action.payload,
        ...basePayload
      };
      return true;
    }
    case V2_INTERACTION_TYPES.TRANSITION: {
      const edge = resolveInteractionEdgeV2(map, runtimeInteraction);
      if (!edge) {
        reject(plan, addNote, "scene_interaction_v2", "EDGE_MISSING", "TRANSITION 缺少有效 edge", ["TRANSITION 缺少有效 edge"]);
        return true;
      }
      const nextScene = edge.toSceneId && Array.isArray(map?.scenes)
        ? map.scenes.find((row) => String(row?.id || "") === String(edge.toSceneId || "")) || null
        : null;
      const archiveReadingPageSpec = resolveArchiveReadingPageSpecFromScene(nextScene);
      const minutes = archiveReadingPageSpec
        ? ARCHIVE_READING_PAGE_MINUTES
        : (Number.isInteger(edge?.minutes) ? edge.minutes : 0);
      addAdvanceTime(plan, addSysCall, SYSCALL_TYPES, minutes, "scene_interaction_v2:transition", margTransitionAdvanceContext);
      if (shouldShortCircuitForMargTransitionBlocker({ gameState, minutes, advanceContext: margTransitionAdvanceContext })) {
        plan.action.payload = {
          ...plan.action.payload,
          ...basePayload
        };
        return true;
      }
      addInteractionEffects(plan, addEffect, runtimeInteraction);
      addInteractionSocialEffects(plan, addSocialIntent, addNote, map, gameState, runtimeInteraction);
      if (edge.toSceneId) {
        addEffect(plan, Effects.set("currentSceneId", edge.toSceneId));
        addEffect(plan, Effects.set("currentScene", nextScene ? { ...nextScene } : null));
        if (archiveReadingPageSpec) {
          const archiveReadingIntent = createArchiveReadingIntent({
            pageSpec: archiveReadingPageSpec,
            mapId: String(map?.id || "").trim(),
            actionId: String(runtimeInteraction?.id || id || "").trim(),
            sceneId: String(edge.toSceneId || "").trim()
          });
          if (archiveReadingIntent) {
            addArchiveReadingIntent(plan, archiveReadingIntent);
            addNote(plan, `scene_interaction_v2 archive_reading:${archiveReadingPageSpec.pageId}`);
          }
        }
      }
      if (edge.toMapId) {
        addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: edge.toMapId });
      }
      plan.action.payload = {
        ...plan.action.payload,
        ...basePayload,
        pageId: archiveReadingPageSpec?.pageId || undefined,
        sourceBookId: archiveReadingPageSpec?.sourceBookId || undefined
      };
      return true;
    }
    case V2_INTERACTION_TYPES.MENU_OPEN: {
      const menuPanel = normalizeMenuPanel(runtimeInteraction?.ui?.panel || runtimeInteraction?.panel);
      if (menuPanel === "shop_goods") {
        plan.uiCommands.push({
          type: "OPEN_SHOP_GOODS_PANEL",
          mapId: String(map?.id || "")
        });
      } else {
        plan.uiCommands.push({
          type: "OPEN_NIGHT_KITCHEN_MENU",
          mapId: String(map?.id || ""),
          mode: normalizeMenuMode(runtimeInteraction?.menuMode || runtimeInteraction?.ui?.menuMode || payload?.mode)
        });
      }
      plan.action.payload = {
        ...plan.action.payload,
        ...basePayload
      };
      return true;
    }
    case V2_INTERACTION_TYPES.PURCHASE:
      plan.action.payload = {
        ...plan.action.payload,
        ...basePayload
      };
      return handlePurchaseInteractionV2(ctx, map, runtimeInteraction);
    default:
      return false;
  }
}
