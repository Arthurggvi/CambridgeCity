import { createBusinessIntent, createBusinessRequestId, buildBusinessSource } from "../../business/business_intent.js";
import { getBusinessExecutor } from "../../business/business_registry.js";
import { buildBusinessIntentRejection, isBusinessRejection } from "../../business/business_rejection.js";

function normalizeText(value) {
  return String(value || "").trim();
}

export function isOneShotBusinessSemantic(subject) {
  return normalizeText(subject?.semantic?.type).toLowerCase() === "one_shot_business";
}

export async function queueBusinessIntentPreview({ gameState, plan, addBusinessIntent, addNote, intent }) {
  const executor = getBusinessExecutor(intent?.executorId);
  if (!executor) {
    plan.rejection = buildBusinessIntentRejection(intent, "business_preview", "EXECUTOR_NOT_FOUND", `未注册的 business executor: ${normalizeText(intent?.executorId)}`, []);
    addNote(plan, `business preview reject: missing executor ${normalizeText(intent?.executorId)}`);
    return { handled: true, queued: false, executor: null, intent };
  }

  const preview = await executor.previewEligibility(gameState, intent);
  if (!preview?.ok) {
    plan.rejection = isBusinessRejection(preview?.rejection)
      ? preview.rejection
      : buildBusinessIntentRejection(intent, "business_preview", preview?.code || "BUSINESS_PREVIEW_REJECTED", preview?.reason || "业务预检失败", preview?.reasons || [], {
          uiHint: preview?.uiHint || null
        });
    addNote(plan, `business preview reject: ${String(plan?.rejection?.code || "BUSINESS_PREVIEW_REJECTED")}`);
    return { handled: true, queued: false, executor, intent };
  }

  addBusinessIntent(plan, intent);
  addNote(plan, `business intent queued: ${intent.executorId}/${intent.businessType}`);
  return { handled: true, queued: true, executor, intent };
}

function createRejectedIntentSkeleton({ action, executorId, businessType, idempotencyMode, source }) {
  return createBusinessIntent({
    requestId: createBusinessRequestId({
      action,
      executorId,
      businessType,
      payload: {}
    }),
    executorId,
    businessType,
    idempotencyMode,
    source: buildBusinessSource(source),
    payload: {},
    allowPartialCommit: false
  });
}

export async function queueOneShotBusinessIntent({
  action,
  gameState,
  plan,
  addBusinessIntent,
  addNote,
  executorId,
  businessType,
  idempotencyMode,
  source,
  payload,
  allowPartialCommit = false
} = {}) {
  const intent = createBusinessIntent({
    requestId: createBusinessRequestId({
      action,
      executorId,
      businessType,
      payload
    }),
    executorId,
    businessType,
    idempotencyMode,
    source: buildBusinessSource(source),
    payload,
    allowPartialCommit
  });

  const previewResult = await queueBusinessIntentPreview({
    gameState,
    plan,
    addBusinessIntent,
    addNote,
    intent
  });
  return {
    handled: true,
    queued: previewResult.queued,
    intent,
    executor: previewResult.executor
  };
}

export async function queueOneShotBusinessFromBuilder({
  action,
  gameState,
  plan,
  addBusinessIntent,
  addNote,
  executorId,
  businessType,
  idempotencyMode,
  source,
  allowPartialCommit = false,
  buildPayload,
  payloadInvalidCode = "BUSINESS_PAYLOAD_INVALID",
  payloadInvalidReason = `无法构造 business payload: ${normalizeText(executorId)}/${normalizeText(businessType)}`
} = {}) {
  const normalizedExecutorId = normalizeText(executorId);
  const normalizedBusinessType = normalizeText(businessType);
  const normalizedIdempotencyMode = normalizeText(idempotencyMode);
  const normalizedSource = buildBusinessSource(source);
  const executor = getBusinessExecutor(normalizedExecutorId);

  if (!executor) {
    const missingIntent = createRejectedIntentSkeleton({
      action,
      executorId: normalizedExecutorId,
      businessType: normalizedBusinessType,
      idempotencyMode: normalizedIdempotencyMode,
      source: normalizedSource
    });
    plan.rejection = buildBusinessIntentRejection(missingIntent, "business_preview", "EXECUTOR_NOT_FOUND", `未注册的 business executor: ${normalizedExecutorId || "<empty>"}`, []);
    addNote(plan, `one_shot_business reject: missing executor ${normalizedExecutorId || "<empty>"}`);
    return { handled: true, queued: false, intent: missingIntent, executor: null };
  }

  const builtPayload = typeof buildPayload === "function"
    ? buildPayload(executor)
    : null;
  if (!builtPayload || typeof builtPayload !== "object") {
    const invalidIntent = createRejectedIntentSkeleton({
      action,
      executorId: normalizedExecutorId,
      businessType: normalizedBusinessType,
      idempotencyMode: normalizedIdempotencyMode,
      source: normalizedSource
    });
    plan.rejection = buildBusinessIntentRejection(invalidIntent, "business_preview", payloadInvalidCode, payloadInvalidReason, []);
    addNote(plan, `one_shot_business reject: payload build failed ${normalizedExecutorId}/${normalizedBusinessType}`);
    return { handled: true, queued: false, intent: invalidIntent, executor };
  }

  return queueOneShotBusinessIntent({
    action,
    gameState,
    plan,
    addBusinessIntent,
    addNote,
    executorId: normalizedExecutorId,
    businessType: normalizedBusinessType,
    idempotencyMode: normalizedIdempotencyMode,
    source: normalizedSource,
    payload: builtPayload,
    allowPartialCommit
  });
}

export async function queueOneShotBusinessFromMapAction({
  action,
  payload,
  map,
  mapAction,
  gameState,
  plan,
  addBusinessIntent,
  addNote
} = {}) {
  if (!isOneShotBusinessSemantic(mapAction)) {
    return { handled: false, queued: false, intent: null, executor: null };
  }

  const semantic = mapAction?.semantic || {};
  const executorId = normalizeText(semantic.executorId);
  const businessType = normalizeText(semantic.businessType);
  const idempotencyMode = normalizeText(semantic.idempotencyMode);
  return queueOneShotBusinessFromBuilder({
    action,
    gameState,
    plan,
    addBusinessIntent,
    addNote,
    executorId,
    businessType,
    idempotencyMode,
    source: {
      origin: "map_action",
      actionId: normalizeText(action?.id),
      mapId: normalizeText(map?.id || gameState?.currentMapId),
      sceneId: normalizeText(gameState?.currentScene?.id || gameState?.currentSceneId)
    },
    buildPayload: (executor) => typeof executor.buildIntentPayloadFromMapAction === "function"
      ? executor.buildIntentPayloadFromMapAction({ action, payload, map, mapAction, gameState })
      : null,
    payloadInvalidCode: "MAP_ACTION_BUSINESS_PAYLOAD_INVALID",
    payloadInvalidReason: `无法从 map action 构造 business payload: ${executorId}/${businessType}`
  });
}