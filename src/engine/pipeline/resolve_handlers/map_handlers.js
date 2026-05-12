import { shouldRejectGameplayAction } from "./gameplay_precheck.js";
import { getCanonicalCurrentMap } from "../../map_context.js";
import { getStopById } from "../../transit/transit_service.js";
import { handleTransitActions } from "../../transit/transit_session.js";
import { getCalendarViewFromTotalMinutes } from "../../calendar_model.js";
import { buildStableCalendarDayKey, hashStableString } from "../../stable_daily.js";
import { getLibraryReadingBlockerReason, resolveLibraryReadingAction } from "../../library_reading/service.js";
import { resolveNightKitchenFoodPurchase } from "../../night_kitchen_food_defs.js";
import { resolveShopGoodsCatalog, findShopGoodsCatalogItem } from "../../shop_goods_catalog.js";
import {
  resolveShopGoodsPurchaseDef,
  SHOP_GOODS_PURCHASE_ACTION_ID,
  SHOP_GOODS_PURCHASE_MODES
} from "../../shop_goods_defs.js";
import {
  billCentsToWalletMoney,
  formatWalletMoney,
  normalizeWalletMoney,
  walletMoneyToBillCents
} from "../../medical_bill_money.js";
import {
  findNightKitchenCatalogPurchaseItem,
  resolveNightKitchenMenuCatalog
} from "../../night_kitchen_menu_catalog.js";
import { isMapContentV2 } from "../../map_content_v2.js";
import { buildSocialIntentFromEffectRow, isSocialEffectType } from "../social_effect_rows.js";
import { handleSceneInteractionV2 } from "./map_handlers_v2.js";
import { isOneShotBusinessSemantic, queueOneShotBusinessFromBuilder, queueOneShotBusinessFromMapAction } from "./one_shot_business_map_action.js";
import { addWildernessPipelineIntent } from "../plan_types.js";
import { resolveWildernessEndSessionReadOnly } from "../../wilderness/wilderness_action_plans.js";
import { getWildernessAreaSpec } from "../../wilderness/wilderness_area_registry.js";
import { resolveWildernessMovePlanReadOnly } from "../../wilderness/wilderness_movement_resolver.js";
import { WILDERNESS_MOVE_DIRECTIONS } from "../../wilderness/wilderness_movement_cost.js";
import { buildWildernessEventOpportunityContext } from "../../wilderness/events/wilderness_event_move_integration.js";
import { validateWildernessEventActionResolve } from "../../wilderness/events/wilderness_event_action_integration.js";
import {
  ETHAN_RESCUE_AGREE_ACTION_ID,
  ETHAN_RESCUE_OFFER_DECISION_MAP_ID,
  ETHAN_RESCUE_REFUSE_CONFIRM_ACTION_ID,
  ETHAN_RESCUE_REFUSE_STAY_MAP_ID
} from "../../wilderness/wilderness_ethan_rescue_service.js";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const REAR_ZONE_ROOM_CARD_LABEL = "后区房卡";
const REAR_ZONE_LODGING_CHECKOUT_MINUTE_OF_DAY = 9 * 60;
const NIGHT_KITCHEN_PURCHASE_ACTION_IDS = new Set([
  "night_kitchen_submit_dine_purchase",
  "night_kitchen_submit_takeout_purchase"
]);
const NEW_FOUR_MISC_MANUSCRIPT_GOODS_ID = "doc_researcher_manuscript";
const NEW_FOUR_MISC_MANUSCRIPT_CLAIMED_FLAG_PATH = "world.flags.newFourMisc.researcherManuscriptClaimed";

function applyMapActionEffects({ mapAction, map, gameState, actionId, plan, addEffect, addSocialIntent, addNote }) {
  const effectRows = [];
  if (Array.isArray(mapAction?.effects)) {
    effectRows.push(...mapAction.effects);
  }
  if (Array.isArray(mapAction?.socialEffects)) {
    effectRows.push(...mapAction.socialEffects);
  }
  for (const effect of effectRows) {
    const effectType = String(effect?.type || "").trim().toLowerCase();
    if (!isSocialEffectType(effectType)) {
      addEffect(plan, effect);
      continue;
    }
    const built = buildSocialIntentFromEffectRow(effect, {
      mapId: String(map?.id || gameState?.currentMapId || "").trim() || null,
      actionId: String(actionId || "").trim() || null,
      sceneId: String(gameState?.currentScene?.id || gameState?.currentSceneId || "").trim() || null,
      atMinute: Number(gameState?.time?.totalMinutes ?? 0),
      reason: `${String(map?.id || "")}.${String(actionId || "")}:${effectType}`
    });
    if (!built?.ok || !built.intent) {
      addNote(plan, `${built?.error || `social effect 归一失败：${effectType}`}，已跳过`);
      continue;
    }
    addSocialIntent(plan, built.intent);
    addNote(plan, `social 意图：${effectType} -> ${built.intent.npcId}`);
  }
}

function normalizeNightKitchenPurchaseMenuMode(actionId, payload) {
  const payloadMode = String(payload?.mode || payload?.menuMode || "").trim().toLowerCase();
  if (payloadMode === "dine" || payloadMode === "takeout") return payloadMode;
  if (String(actionId || "").trim() === "night_kitchen_submit_dine_purchase") return "dine";
  if (String(actionId || "").trim() === "night_kitchen_submit_takeout_purchase") return "takeout";
  return "";
}

function rejectNightKitchenPurchase(plan, addNote, code, reason, detail, options = {}) {
  const transientToast = options?.transientToast && typeof options.transientToast === "object"
    ? {
        title: String(options.transientToast.title || "状态更新").trim() || "状态更新",
        lines: Array.isArray(options.transientToast.lines)
          ? options.transientToast.lines.map((line) => String(line || "").trim()).filter(Boolean).slice(0, 5)
          : []
      }
    : null;
  plan.rejection = {
    source: "night_kitchen_purchase",
    code,
    reason,
    reasons: detail ? [detail] : [],
    transientToast: transientToast && transientToast.lines.length > 0 ? transientToast : null
  };
  addNote(plan, `夜灶购买拒绝：${reason}${detail ? ` (${detail})` : ""}`);
}

function rejectShopGoodsPurchase(plan, addNote, code, reason, detail, options = {}) {
  const transientToast = options?.transientToast && typeof options.transientToast === "object"
    ? {
        title: String(options.transientToast.title || "商铺货物").trim() || "商铺货物",
        lines: Array.isArray(options.transientToast.lines)
          ? options.transientToast.lines.map((line) => String(line || "").trim()).filter(Boolean).slice(0, 5)
          : []
      }
    : null;
  plan.rejection = {
    source: "shop_goods_purchase",
    code,
    reason,
    reasons: detail ? [detail] : [],
    transientToast: transientToast && transientToast.lines.length > 0 ? transientToast : null
  };
  addNote(plan, `商铺购买拒绝：${reason}${detail ? ` (${detail})` : ""}`);
}

function resolveRearZoneRoomPriceState(gameState) {
  const timeView = getCalendarViewFromTotalMinutes(Number(gameState?.time?.totalMinutes ?? 0), gameState?.world || {});
  const dayKey = buildStableCalendarDayKey(timeView);
  const cachedDayKey = String(gameState?.world?.flags?.rear_zone_room_price_day_key || "");
  const cachedPrice = Math.trunc(Number(gameState?.world?.flags?.rear_zone_room_price_today ?? NaN));

  if (cachedDayKey === dayKey && Number.isFinite(cachedPrice) && cachedPrice >= 60 && cachedPrice <= 150) {
    return { dayKey, price: cachedPrice, reused: true };
  }

  return {
    dayKey,
    price: 60 + (hashStableString(`rear_zone_room_price:${dayKey}`) % 91),
    reused: false
  };
}

function buildRearZoneRoomCardFlags(gameState) {
  const currentFlags = Array.isArray(gameState?.player?.profile?.unlocks?.flags)
    ? gameState.player.profile.unlocks.flags
    : [];
  const next = new Set(currentFlags.map((entry) => String(entry || "").trim()).filter(Boolean));
  next.add(REAR_ZONE_ROOM_CARD_LABEL);
  return Array.from(next.values());
}

function resolveRearZoneLodgingCheckoutAt(totalMinutesRaw) {
  const totalMinutes = Math.max(0, Math.trunc(Number(totalMinutesRaw ?? 0)));
  const minuteOfDay = totalMinutes % 1440;
  const dayStart = totalMinutes - minuteOfDay;
  if (minuteOfDay < REAR_ZONE_LODGING_CHECKOUT_MINUTE_OF_DAY) {
    return dayStart + REAR_ZONE_LODGING_CHECKOUT_MINUTE_OF_DAY;
  }
  return dayStart + 1440 + REAR_ZONE_LODGING_CHECKOUT_MINUTE_OF_DAY;
}

export async function handleMapActions(ctx) {
  const {
    action,
    id,
    payload,
    plan,
    gameState,
    addEffect,
    addBusinessIntent,
    addSysCall,
    addNote,
    Effects,
    SYSCALL_TYPES,
    evaluateRequires,
    addRecordIntent,
    addSocialIntent,
    collectProfileIntentsFromPlan,
    mergeProfileIntents,
    getTasksContext,
    createGovHallTaskEntry,
    ensureItemsDbLoaded,
    getInventoryContext,
    getCapacityProfile,
    tryAddItem,
    applyFoodIntakeToPlayer
  } = ctx;

  const map = getCanonicalCurrentMap(gameState, {
    source: `handleMapActions:${String(id || "")}`,
    repairState: true
  });
  if (!map) return false;

  const applyGameplayPrecheck = () => {
    if (plan?.rejection) return;
    const rejection = shouldRejectGameplayAction(gameState, plan);
    if (!rejection) return;
    plan.rejection = rejection;
    addNote(plan, `玩法门禁拒绝：${rejection.code}`);
  };

  if (String(action?.type || "").trim() === "WILDERNESS_EVENT_ACTION") {
    const pipelineWildId = String(id || "").trim();
    if (!pipelineWildId.startsWith("wild_evt:") && pipelineWildId !== "wild_evt_resume_tail") {
      return false;
    }
    const syntheticMapAction = {
      id: pipelineWildId,
      kind: "WILDERNESS_EVENT_ACTION",
      text: "",
      payload: payload && typeof payload === "object" ? { ...payload } : {}
    };
    const r = validateWildernessEventActionResolve({ gameState, map, mapAction: syntheticMapAction });
    if (!r.ok) {
      plan.rejection = r.rejection;
      addNote(plan, "WILDERNESS_EVENT_ACTION rejected");
      applyGameplayPrecheck();
      return true;
    }
    addWildernessPipelineIntent(plan, { type: "WILDERNESS_EVENT_ACTION", eventActionPlan: r.eventActionPlan });
    addNote(plan, "wilderness:event_action intent queued (pipeline)");
    applyGameplayPrecheck();
    return true;
  }

  if (id === SHOP_GOODS_PURCHASE_ACTION_ID) {
    await queueOneShotBusinessFromBuilder({
      action,
      gameState,
      plan,
      addBusinessIntent,
      addNote,
      executorId: "shop_purchase",
      businessType: "purchase",
      idempotencyMode: "request",
      source: {
        origin: "ui_action",
        actionId: String(id || "").trim(),
        mapId: String(map?.id || gameState?.currentMapId || "").trim(),
        sceneId: String(gameState?.currentScene?.id || gameState?.currentSceneId || "").trim()
      },
      buildPayload: (executor) => typeof executor.buildIntentPayloadFromShopGoodsUi === "function"
        ? executor.buildIntentPayloadFromShopGoodsUi({
            mapId: String(payload?.mapId || map?.id || "").trim(),
            goodsId: String(payload?.goodsId || payload?.itemId || "").trim()
          })
        : null,
      payloadInvalidCode: "SHOP_PANEL_PURCHASE_PAYLOAD_INVALID",
      payloadInvalidReason: `无法从 shop panel purchase 构造 business payload: ${String(id || "")}`
    });

    const gameplayRejection = !plan.rejection ? shouldRejectGameplayAction(gameState, plan) : null;
    if (gameplayRejection) {
      plan.rejection = gameplayRejection;
      addNote(plan, `玩法门禁拒绝：${gameplayRejection.code}`);
      return true;
    }

    return true;
  }

  if (isMapContentV2(map)) {
    return handleSceneInteractionV2(ctx);
  }

  if (!map.actions) return false;

  const isGovHallMapId = (mapId) => typeof mapId === "string" && mapId.startsWith("gov_hall_");

  const mapAction = map.actions.find(a => a.id === id);
  if (!mapAction) {
    console.warn("[handleMapActions] action miss on canonical map", {
      actionId: String(id || ""),
      currentMapId: String(gameState?.currentMapId || ""),
      worldCurrentMapId: String(gameState?.world?.currentMapId || ""),
      currentMapObjectId: String(gameState?.currentMap?.id || ""),
      canonicalMapId: String(map?.id || "")
    });
    return false;
  }

  const isSleepingCoverage = (sessionCoverageRaw) => {
    const coverage = String(sessionCoverageRaw || "NONE").trim().toUpperCase();
    return coverage === "WARD_BED";
  };

  const resolveSleepRateMul = (mapAction) => {
    const raw = Number(mapAction?.payload?.sleepRateMul);
    if (!Number.isFinite(raw)) return 1;
    return Math.max(0, Math.min(2, raw));
  };

  const buildThermalAdvanceCtx = () => {
    const thermal = mapAction?.thermal;
    if (!thermal || typeof thermal !== "object") return {};

    const extra = {};
    const exposureMultiplier = Number(thermal.exposureMultiplier);
    if (Number.isFinite(exposureMultiplier)) {
      extra.exposureMultiplier = Math.max(0.2, Math.min(1.4, exposureMultiplier));
    }

    const activity = String(thermal.activity || "").trim().toLowerCase();
    if (activity === "idle" || activity === "transit" || activity === "light_work") {
      extra.thermalActivity = activity;
    }

    return extra;
  };

  addNote(plan, `地图动作：${map.id}.${id}`);

  if (id === "read_random_library_book") {
    const readingResult = resolveLibraryReadingAction(gameState, {
      mapId: String(map?.id || gameState?.currentMapId || "").trim(),
      actionId: String(id || "").trim(),
      sceneId: String(gameState?.currentScene?.id || gameState?.currentSceneId || "").trim()
    });

    if (!readingResult?.ok) {
      plan.rejection = {
        source: "library_reading",
        code: "LIBRARY_READING_UNAVAILABLE",
        reason: "阅览室书目暂不可用"
      };
      addNote(plan, `阅览室阅读不可用：${String(readingResult?.reason || "unknown")}`);
      return true;
    }

    if (readingResult.blocked) {
      plan.rejection = {
        source: "library_reading",
        code: "LIBRARY_READING_DAILY_LIMIT",
        reason: getLibraryReadingBlockerReason()
      };
      plan.uiFeedback = {
        title: "阅览室",
        message: getLibraryReadingBlockerReason(),
        variant: "reject"
      };
      addNote(plan, `阅览室阅读 blocker：dayKey=${readingResult.dayKey}, readCount=${readingResult.dailyState?.readCount || 0}`);
      return true;
    }

    addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
      minutes: 90,
      reason: "map_action:library_reading",
      ctx: {
        isSleeping: false,
        sessionCoverage: mapAction.sessionCoverage || "NONE",
        ...buildThermalAdvanceCtx()
      }
    });
    addEffect(plan, Effects.set("player.meta.libraryReading", readingResult.nextState));
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
      addNote(plan, `阅览室首次阅读：book=${readingResult.selectedBook.id}`);
    } else {
      addNote(plan, `阅览室重复阅读：book=${readingResult.selectedBook.id}`);
    }

    applyGameplayPrecheck();
    return true;
  }

  const recordUnlock = mapAction?.recordUnlock;
  if (recordUnlock && typeof recordUnlock === "object") {
    const recordId = String(recordUnlock.recordId || "").trim();
    if (recordId) {
      // Records keep runtime truth minimal in the pipeline so map data only declares recordId.
      addRecordIntent(plan, {
        type: "UNLOCK_RECORD",
        recordId,
        triggerContext: {
          mapId: String(map?.id || gameState?.currentMapId || "").trim() || null,
          actionId: String(id || "").trim() || null,
          sceneId: String(gameState?.currentScene?.id || gameState?.currentSceneId || "").trim() || null
        }
      });
      addNote(plan, `记录解锁意图：${recordId}`);
    }
  }

  // 从 action 定义中读取 profileIntents/profileTags，只收集到 plan，不在 resolve 直接写 profile。
  const mapProfileIntents = typeof collectProfileIntentsFromPlan === "function"
    ? collectProfileIntentsFromPlan({
      plan: null,
      action: null,
      source: mapAction
    })
    : [];
  if (mapProfileIntents.length > 0) {
    const current = Array.isArray(plan.profileIntents) ? plan.profileIntents : [];
    plan.profileIntents = typeof mergeProfileIntents === "function"
      ? mergeProfileIntents([...current, ...mapProfileIntents])
      : [...current, ...mapProfileIntents];
    addNote(plan, `地图动作成长输入：${mapProfileIntents.length}`);
  }

  if (id === "queue_intro_take_bill") {
    const tasks = getTasksContext(gameState);
    const exists = tasks.some(row => row.id === "task_gov_hall_id");
    if (!exists) {
      const nowMin = Math.max(0, Math.floor(Number(gameState?.time?.totalMinutes ?? 0)));
      addEffect(plan, Effects.set("player.tasks", [...tasks, createGovHallTaskEntry(nowMin)]));
      addEffect(plan, Effects.set("ui.tasksNeedsAttention", true));
      addNote(plan, "新增备忘录：前往政务大厅办理身份证明");
    }
  }

  if (!NIGHT_KITCHEN_PURCHASE_ACTION_IDS.has(id) && mapAction.requires) {
    const r = evaluateRequires(gameState, mapAction.requires);
    if (!r.ok) {
      plan.rejection = {
        source: "requires",
        code: "REQUIRES_NOT_MET",
        reason: `${map.id}.${id}`,
        reasons: Array.isArray(r.reasons) ? [...r.reasons] : []
      };
      addNote(plan, `requires 未满足，拒绝执行：${map.id}.${id}`);
      for (const reason of r.reasons) addNote(plan, reason);
      return true;
    }
  }

  if (!NIGHT_KITCHEN_PURCHASE_ACTION_IDS.has(id) && mapAction?.ui?.disabledRequires) {
    const disabledResult = evaluateRequires(gameState, mapAction.ui.disabledRequires);
    if (disabledResult.ok) {
      plan.rejection = {
        source: "disabledRequires",
        code: "DISABLED_REQUIRES_MATCHED",
        reason: `${map.id}.${id}`,
        reasons: Array.isArray(disabledResult.reasons) ? [...disabledResult.reasons] : []
      };
      addNote(plan, `disabledRequires 命中，拒绝执行：${map.id}.${id}`);
      for (const reason of disabledResult.reasons) addNote(plan, reason);
      return true;
    }
  }

  if (id === "rear_zone_lodging_open_quote") {
    const roomPriceState = resolveRearZoneRoomPriceState(gameState);
    addEffect(plan, Effects.set("world.flags.rear_zone_room_price_today", roomPriceState.price));
    addEffect(plan, Effects.set("world.flags.rear_zone_room_price_day_key", roomPriceState.dayKey));
    addNote(
      plan,
      roomPriceState.reused
        ? `后区住宿报价沿用当日价格：${roomPriceState.price}`
        : `后区住宿报价刷新为当日价格：${roomPriceState.price}`
    );
  }

  if (id === "rear_zone_lodging_quote_accept") {
    const roomPriceState = resolveRearZoneRoomPriceState(gameState);
    const money = Math.max(0, Math.trunc(Number(gameState?.world?.money ?? 0)));
    const checkoutAt = resolveRearZoneLodgingCheckoutAt(gameState?.time?.totalMinutes);

    addEffect(plan, Effects.set("world.flags.rear_zone_room_price_today", roomPriceState.price));
    addEffect(plan, Effects.set("world.flags.rear_zone_room_price_day_key", roomPriceState.dayKey));

    if (money < roomPriceState.price) {
      addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: "rear_zone_lodging_insufficient_01" });
      addNote(plan, `后区住宿余额不足：money=${money}, price=${roomPriceState.price}`);
      applyGameplayPrecheck();
      return true;
    }

    addEffect(plan, Effects.add("world.money", -roomPriceState.price));
    addEffect(plan, Effects.set("world.flags.rear_zone_room_card_owned", true));
    addEffect(plan, Effects.set("world.flags.rear_zone_lodging_checkout_at", checkoutAt));
    addEffect(plan, Effects.set("player.profile.unlocks.flags", buildRearZoneRoomCardFlags(gameState)));
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: "rear_zone_lodging_confirm_01" });
    addNote(plan, `后区住宿办理成功：price=${roomPriceState.price}, checkoutAt=${checkoutAt}`);
    applyGameplayPrecheck();
    return true;
  }

  if (NIGHT_KITCHEN_PURCHASE_ACTION_IDS.has(id)) {
    if (isOneShotBusinessSemantic(mapAction)) {
      await queueOneShotBusinessFromMapAction({
        action,
        payload: {
          ...payload,
          foodId: String(payload?.itemId || payload?.foodId || "").trim(),
          menuMode: normalizeNightKitchenPurchaseMenuMode(id, payload)
        },
        map,
        mapAction,
        gameState,
        plan,
        addBusinessIntent,
        addNote
      });
    }

    if (Array.isArray(mapAction.effects) || Array.isArray(mapAction.socialEffects)) {
      applyMapActionEffects({ mapAction, map, gameState, actionId: id, plan, addEffect, addSocialIntent, addNote });
    }

    applyGameplayPrecheck();
    return true;
  }

  if (isOneShotBusinessSemantic(mapAction) && !mapAction.kind) {
    await queueOneShotBusinessFromMapAction({
      action,
      payload,
      map,
      mapAction,
      gameState,
      plan,
      addBusinessIntent,
      addNote
    });
    if (Array.isArray(mapAction.effects) || Array.isArray(mapAction.socialEffects)) {
      applyMapActionEffects({ mapAction, map, gameState, actionId: id, plan, addEffect, addSocialIntent, addNote });
    }

    addNote(plan, `ONE_SHOT_BUSINESS：dispatch ${String(mapAction?.semantic?.executorId || "")}/${String(mapAction?.semantic?.businessType || "")}`);
    applyGameplayPrecheck();
    return true;
  }

  if (mapAction.kind) {
    if (mapAction.kind === "WILDERNESS_MOVE") {
      if (String(map?.id || "").trim() !== "wilderness_runtime") {
        plan.rejection = {
          source: "wilderness",
          code: "WILDERNESS_MOVE_WRONG_MAP",
          reason: "WILDERNESS_MOVE 仅允许在 wilderness_runtime",
          reasons: [`mapId=${String(map?.id || "")}`]
        };
        addNote(plan, "WILDERNESS_MOVE 地图不匹配");
        applyGameplayPrecheck();
        return true;
      }
      if (gameState?.world?.wilderness?.active !== true) {
        plan.rejection = {
          source: "wilderness",
          code: "WILDERNESS_MOVE_SESSION_INACTIVE",
          reason: "野外会话未激活",
          reasons: ["world.wilderness.active!==true"]
        };
        addNote(plan, "WILDERNESS_MOVE 拒绝：会话未激活");
        applyGameplayPrecheck();
        return true;
      }
      const dir = String(mapAction?.wilderness?.direction || "").trim();
      if (!WILDERNESS_MOVE_DIRECTIONS.includes(dir)) {
        plan.rejection = {
          source: "wilderness",
          code: "WILDERNESS_MOVE_BAD_DIRECTION",
          reason: "非法移动方向",
          reasons: [dir || "(empty)"]
        };
        addNote(plan, "WILDERNESS_MOVE 拒绝：方向非法");
        applyGameplayPrecheck();
        return true;
      }
      const expectedId = `wilderness_move_${dir}`;
      if (String(id || "").trim() !== expectedId) {
        plan.rejection = {
          source: "wilderness",
          code: "WILDERNESS_MOVE_ACTION_ID_MISMATCH",
          reason: "action id 与方向不一致",
          reasons: [`expected ${expectedId} got ${String(id || "")}`]
        };
        addNote(plan, "WILDERNESS_MOVE id/direction mismatch");
        applyGameplayPrecheck();
        return true;
      }
      const areaId = String(gameState.world.wilderness.areaId || "").trim();
      const areaSpec = areaId ? getWildernessAreaSpec(areaId) : null;
      if (!areaSpec) {
        plan.rejection = {
          source: "wilderness",
          code: "WILDERNESS_MOVE_AREA_MISSING",
          reason: "缺少野外区域规格",
          reasons: [areaId || "(empty)"]
        };
        addNote(plan, "WILDERNESS_MOVE 拒绝：area 缺失");
        applyGameplayPrecheck();
        return true;
      }
      const movementPlan = resolveWildernessMovePlanReadOnly({
        wilderness: gameState.world.wilderness,
        areaSpec,
        direction: dir,
        actionId: String(id || "").trim(),
        worldWeather: gameState?.world?.weather && typeof gameState.world.weather === "object" ? gameState.world.weather : {},
        totalMinutes: gameState?.time?.totalMinutes,
        player: gameState?.player,
        rngLike: action?.meta?.wildernessMoveRngLike && typeof action.meta.wildernessMoveRngLike === "object"
          ? action.meta.wildernessMoveRngLike
          : undefined
      });
      const eventOpportunityContext = buildWildernessEventOpportunityContext({
        movementPlan,
        plannedAtMinutes: Math.floor(Number(gameState?.time?.totalMinutes ?? 0))
      });
      addWildernessPipelineIntent(plan, { type: "WILDERNESS_MOVE", movementPlan, eventOpportunityContext });
      addNote(plan, `wilderness:move intent queued ok=${movementPlan.ok} dir=${dir}`);
      applyGameplayPrecheck();
      return true;
    }

    if (mapAction.kind === "WILDERNESS_EVENT_ACTION") {
      const r = validateWildernessEventActionResolve({ gameState, map, mapAction });
      if (!r.ok) {
        plan.rejection = r.rejection;
        addNote(plan, "WILDERNESS_EVENT_ACTION rejected");
        applyGameplayPrecheck();
        return true;
      }
      addWildernessPipelineIntent(plan, { type: "WILDERNESS_EVENT_ACTION", eventActionPlan: r.eventActionPlan });
      addNote(plan, "wilderness:event_action intent queued");
      applyGameplayPrecheck();
      return true;
    }

    if (mapAction.kind === "WILDERNESS_ETHAN_RESCUE_ACCEPT") {
      if (String(map?.id || "").trim() !== ETHAN_RESCUE_OFFER_DECISION_MAP_ID) {
        plan.rejection = {
          source: "wilderness",
          code: "ETHAN_RESCUE_ACCEPT_WRONG_MAP",
          reason: "伊森救援确认仅允许在专用事件地图",
          reasons: [`mapId=${String(map?.id || "")}`]
        };
        addNote(plan, "WILDERNESS_ETHAN_RESCUE_ACCEPT rejected wrong map");
        applyGameplayPrecheck();
        return true;
      }
      if (gameState?.world?.wilderness?.active !== true) {
        plan.rejection = {
          source: "wilderness",
          code: "ETHAN_RESCUE_ACCEPT_SESSION_INACTIVE",
          reason: "野外会话未激活",
          reasons: ["world.wilderness.active!==true"]
        };
        addNote(plan, "WILDERNESS_ETHAN_RESCUE_ACCEPT rejected inactive");
        applyGameplayPrecheck();
        return true;
      }
      if (String(gameState.world.wilderness.state || "").trim() !== "RESCUE_PENDING") {
        plan.rejection = {
          source: "wilderness",
          code: "ETHAN_RESCUE_ACCEPT_BAD_STATE",
          reason: "当前不在搜救接应状态",
          reasons: [`state=${String(gameState.world.wilderness.state || "")}`]
        };
        addNote(plan, "WILDERNESS_ETHAN_RESCUE_ACCEPT rejected state");
        applyGameplayPrecheck();
        return true;
      }
      const fr = gameState.world.wilderness.flags && typeof gameState.world.wilderness.flags === "object"
        ? gameState.world.wilderness.flags
        : {};
      if (String(fr.ethanRescueLastReason || "").trim() !== "stamina_zero") {
        plan.rejection = {
          source: "wilderness",
          code: "ETHAN_RESCUE_ACCEPT_BAD_REASON_FLAG",
          reason: "救援原因标记不匹配",
          reasons: [`ethanRescueLastReason=${String(fr.ethanRescueLastReason || "")}`]
        };
        addNote(plan, "WILDERNESS_ETHAN_RESCUE_ACCEPT rejected reason flag");
        applyGameplayPrecheck();
        return true;
      }
      if (String(id || "").trim() !== ETHAN_RESCUE_AGREE_ACTION_ID) {
        plan.rejection = {
          source: "wilderness",
          code: "ETHAN_RESCUE_ACCEPT_BAD_ACTION_ID",
          reason: "必须使用 ethan_rescue_agree_return",
          reasons: [`actionId=${String(id || "")}`]
        };
        addNote(plan, "WILDERNESS_ETHAN_RESCUE_ACCEPT action id mismatch");
        applyGameplayPrecheck();
        return true;
      }
      addWildernessPipelineIntent(plan, { type: "WILDERNESS_ETHAN_RESCUE_ACCEPT" });
      addNote(plan, "wilderness:ethan_rescue_accept intent queued");
      applyGameplayPrecheck();
      return true;
    }

    if (mapAction.kind === "WILDERNESS_ETHAN_RESCUE_REFUSE") {
      if (String(map?.id || "").trim() !== ETHAN_RESCUE_REFUSE_STAY_MAP_ID) {
        plan.rejection = {
          source: "wilderness",
          code: "ETHAN_RESCUE_REFUSE_WRONG_MAP",
          reason: "伊森救援拒绝确认仅允许在专用叙事地图",
          reasons: [`mapId=${String(map?.id || "")}`]
        };
        addNote(plan, "WILDERNESS_ETHAN_RESCUE_REFUSE rejected wrong map");
        applyGameplayPrecheck();
        return true;
      }
      if (gameState?.world?.wilderness?.active !== true) {
        plan.rejection = {
          source: "wilderness",
          code: "ETHAN_RESCUE_REFUSE_SESSION_INACTIVE",
          reason: "野外会话未激活",
          reasons: ["world.wilderness.active!==true"]
        };
        addNote(plan, "WILDERNESS_ETHAN_RESCUE_REFUSE rejected inactive");
        applyGameplayPrecheck();
        return true;
      }
      if (String(gameState.world.wilderness.state || "").trim() !== "RESCUE_PENDING") {
        plan.rejection = {
          source: "wilderness",
          code: "ETHAN_RESCUE_REFUSE_BAD_STATE",
          reason: "当前不在搜救接应状态",
          reasons: [`state=${String(gameState.world.wilderness.state || "")}`]
        };
        addNote(plan, "WILDERNESS_ETHAN_RESCUE_REFUSE rejected state");
        applyGameplayPrecheck();
        return true;
      }
      const frRef = gameState.world.wilderness.flags && typeof gameState.world.wilderness.flags === "object"
        ? gameState.world.wilderness.flags
        : {};
      if (String(frRef.ethanRescueLastReason || "").trim() !== "stamina_zero") {
        plan.rejection = {
          source: "wilderness",
          code: "ETHAN_RESCUE_REFUSE_BAD_REASON_FLAG",
          reason: "救援原因标记不匹配",
          reasons: [`ethanRescueLastReason=${String(frRef.ethanRescueLastReason || "")}`]
        };
        addNote(plan, "WILDERNESS_ETHAN_RESCUE_REFUSE rejected reason flag");
        applyGameplayPrecheck();
        return true;
      }
      if (String(id || "").trim() !== ETHAN_RESCUE_REFUSE_CONFIRM_ACTION_ID) {
        plan.rejection = {
          source: "wilderness",
          code: "ETHAN_RESCUE_REFUSE_BAD_ACTION_ID",
          reason: "必须使用 ethan_rescue_refuse_confirm",
          reasons: [`actionId=${String(id || "")}`]
        };
        addNote(plan, "WILDERNESS_ETHAN_RESCUE_REFUSE action id mismatch");
        applyGameplayPrecheck();
        return true;
      }
      addWildernessPipelineIntent(plan, { type: "WILDERNESS_ETHAN_RESCUE_REFUSE" });
      addNote(plan, "wilderness:ethan_rescue_refuse intent queued");
      applyGameplayPrecheck();
      return true;
    }

    if (mapAction.kind === "WILDERNESS_RETURN_FROM_LANDMARK") {
      if (String(map?.id || "").trim() === "wilderness_runtime") {
        plan.rejection = {
          source: "wilderness",
          code: "WILDERNESS_RETURN_WRONG_MAP",
          reason: "返回野外动作不允许在 wilderness_runtime",
          reasons: ["mapId=wilderness_runtime"]
        };
        addNote(plan, "WILDERNESS_RETURN_FROM_LANDMARK rejected on wilderness_runtime");
        applyGameplayPrecheck();
        return true;
      }
      if (gameState?.world?.wilderness?.active !== true) {
        plan.rejection = {
          source: "wilderness",
          code: "WILDERNESS_RETURN_SESSION_INACTIVE",
          reason: "没有活跃的野外会话",
          reasons: ["world.wilderness.active!==true"]
        };
        addNote(plan, "WILDERNESS_RETURN_FROM_LANDMARK rejected inactive");
        applyGameplayPrecheck();
        return true;
      }
      if (String(id || "").trim() !== "return_to_wilderness_runtime") {
        plan.rejection = {
          source: "wilderness",
          code: "WILDERNESS_RETURN_BAD_ACTION_ID",
          reason: "返回野外必须使用 return_to_wilderness_runtime",
          reasons: [`actionId=${String(id || "")}`]
        };
        addNote(plan, "WILDERNESS_RETURN_FROM_LANDMARK action id mismatch");
        applyGameplayPrecheck();
        return true;
      }
      addWildernessPipelineIntent(plan, { type: "WILDERNESS_RETURN_FROM_LANDMARK" });
      addNote(plan, "wilderness:return_from_landmark intent queued");
      applyGameplayPrecheck();
      return true;
    }

    if (mapAction.kind === "WILDERNESS_END_SESSION") {
      if (String(map?.id || "").trim() !== "wilderness_runtime") {
        addNote(plan, `WILDERNESS_END_SESSION 仅允许在 wilderness_runtime 地图：当前 ${String(map?.id || "")}`);
        plan.rejection = {
          source: "wilderness",
          code: "WILDERNESS_END_WRONG_MAP",
          reason: "结束野外会话动作不在野外运行时地图",
          reasons: [`mapId=${String(map?.id || "")}`]
        };
        applyGameplayPrecheck();
        return true;
      }
      if (String(id || "").trim() !== "wilderness_end_return_fallback") {
        plan.rejection = {
          source: "wilderness",
          code: "WILDERNESS_END_BAD_ACTION_ID",
          reason: "结束野外会话必须使用 wilderness_end_return_fallback",
          reasons: [`actionId=${String(id || "")}`]
        };
        addNote(plan, "WILDERNESS_END_SESSION action id mismatch");
        applyGameplayPrecheck();
        return true;
      }
      const endRead = resolveWildernessEndSessionReadOnly(gameState);
      if (!endRead.ok) {
        plan.rejection = {
          source: "wilderness",
          code: endRead.code || "WILDERNESS_END_REJECTED",
          reason: endRead.reason || "无法结束野外会话",
          reasons: endRead.reasons || []
        };
        addNote(plan, `wilderness:end_session resolve reject: ${endRead.reason || endRead.code}`);
        applyGameplayPrecheck();
        return true;
      }
      addWildernessPipelineIntent(plan, { type: "WILDERNESS_END_SESSION" });
      addNote(plan, "wilderness:end_session intent queued");
      applyGameplayPrecheck();
      return true;
    }

    if (mapAction.kind === "MENU_OPEN") {
      const menuPanel = String(mapAction?.ui?.panel || mapAction?.panel || "").trim();
      if (menuPanel === "shop_goods") {
        plan.uiCommands.push({
          type: "OPEN_SHOP_GOODS_PANEL",
          mapId: String(map?.id || "")
        });
        addNote(plan, `MENU_OPEN -> shop_goods (${String(map?.id || "")})`);
        return true;
      }

      addNote(plan, `MENU_OPEN 未识别 panel：${menuPanel || "(empty)"}`);
      return true;
    }

    if (mapAction.kind === "TIME_SKIP") {
      const minutes = (payload && Number.isInteger(payload.minutes))
        ? payload.minutes
        : mapAction?.payload?.minutes;

      if (!Number.isInteger(minutes)) {
        addNote(plan, `TIME_SKIP 缺少或非法 payload.minutes：${minutes}`);
        return true;
      }

      if (minutes > 0) {
        const coverage = mapAction.sessionCoverage || "NONE";
        addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
          minutes,
          reason: "map_action:TIME_SKIP",
          ctx: {
            isSleeping: isSleepingCoverage(coverage),
            sessionCoverage: coverage,
            ...buildThermalAdvanceCtx()
          }
        });
      } else {
        addNote(plan, "TIME_SKIP minutes<=0，忽略");
      }

      if (Array.isArray(mapAction.effects) || Array.isArray(mapAction.socialEffects)) {
        applyMapActionEffects({ mapAction, map, gameState, actionId: id, plan, addEffect, addSocialIntent, addNote });
      }

      applyGameplayPrecheck();

      return true;
    }

    if (mapAction.kind === "SLEEP") {
      const minutes = (payload && Number.isInteger(payload.minutes))
        ? payload.minutes
        : mapAction?.payload?.minutes;

      if (!Number.isInteger(minutes)) {
        addNote(plan, `SLEEP 缺少或非法 payload.minutes：${minutes}`);
        return true;
      }

      if (minutes > 0) {
        addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
          minutes,
          reason: "map_action:SLEEP",
          ctx: {
            isSleeping: true,
            sessionCoverage: "NONE",
            sleepRateMul: resolveSleepRateMul(mapAction),
            ...buildThermalAdvanceCtx()
          }
        });
      } else {
        addNote(plan, "SLEEP minutes<=0，忽略");
      }

      if (Array.isArray(mapAction.effects) || Array.isArray(mapAction.socialEffects)) {
        applyMapActionEffects({ mapAction, map, gameState, actionId: id, plan, addEffect, addSocialIntent, addNote });
      }

      applyGameplayPrecheck();
      return true;
    }

    if (mapAction.kind === "TRANSITION") {
      const toMapId = mapAction?.payload?.toMapId;
      if (typeof toMapId !== "string" || toMapId.trim() === "") {
        addNote(plan, `TRANSITION 缺少或非法 payload.toMapId：${toMapId}`);
        return true;
      }

      const minutes = Number.isInteger(mapAction?.payload?.minutes) ? mapAction.payload.minutes : 0;
      if (minutes > 0) {
        addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
          minutes,
          reason: "transition",
          ctx: {
            isSleeping: false,
            ...buildThermalAdvanceCtx()
          }
        });
      }

      if (Array.isArray(mapAction.effects) || Array.isArray(mapAction.socialEffects)) {
        applyMapActionEffects({ mapAction, map, gameState, actionId: id, plan, addEffect, addSocialIntent, addNote });
      }

      const fromMapId = String(map?.id || "");
      if (isGovHallMapId(fromMapId) && !isGovHallMapId(toMapId)) {
        addEffect(plan, Effects.set("world.flags.govHallHasQueueNumber", false));
        addEffect(plan, Effects.set("world.flags.govHallQueueNumber", 0));
      }

      addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: toMapId });
      addNote(plan, `TRANSITION -> ${toMapId} (${minutes}min)`);
      applyGameplayPrecheck();
      return true;
    }

    if (mapAction.kind === "MEDICAL_BILL_PAY") {
      if (isOneShotBusinessSemantic(mapAction)) {
        await queueOneShotBusinessFromMapAction({
          action,
          payload,
          map,
          mapAction,
          gameState,
          plan,
          addBusinessIntent,
          addNote
        });
      }

      const minutes = Number.isInteger(mapAction?.payload?.minutes) ? mapAction.payload.minutes : 0;
      if (minutes > 0) {
        addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
          minutes,
          reason: "map_action:MEDICAL_BILL_PAY",
          ctx: {
            isSleeping: false,
            sessionCoverage: mapAction.sessionCoverage || "NONE"
          }
        });
      }

      if (Array.isArray(mapAction.effects) || Array.isArray(mapAction.socialEffects)) {
        applyMapActionEffects({ mapAction, map, gameState, actionId: id, plan, addEffect, addSocialIntent, addNote });
      }

      addNote(plan, `MEDICAL_BILL_PAY：business intent queued`);
      applyGameplayPrecheck();
      return true;
    }

    if (mapAction.kind === "TRANSIT_STOP_ENTRY") {
      const stopId = String(mapAction?.payload?.stopId || "").trim();
      const stop = getStopById(stopId);
      if (!stop) {
        plan.rejection = {
          source: "transit",
          code: "TRANSIT_STOP_NOT_FOUND",
          reason: `站点不存在：${stopId}`,
          reasons: [`站点不存在：${stopId}`]
        };
        addNote(plan, `TRANSIT_STOP_ENTRY 站点不存在：${stopId}`);
        return true;
      }

      const targetMapId = String(stop.mapId || "").trim();
      if (!targetMapId) {
        plan.rejection = {
          source: "transit",
          code: "TRANSIT_STOP_MAP_MISSING",
          reason: `站点 ${stopId} 缺少站点场景。`,
          reasons: [`站点 ${stopId} 缺少站点场景。`]
        };
        addNote(plan, `TRANSIT_STOP_ENTRY 缺少场景：${stopId}`);
        return true;
      }

      addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: targetMapId });

      if (Array.isArray(mapAction.effects) || Array.isArray(mapAction.socialEffects)) {
        applyMapActionEffects({ mapAction, map, gameState, actionId: id, plan, addEffect, addSocialIntent, addNote });
      }

      addNote(plan, `TRANSIT_STOP_ENTRY -> ${stopId}`);
      applyGameplayPrecheck();
      return true;
    }

    if (mapAction.kind === "TRANSIT_BOARD" || mapAction.kind === "TRANSIT_CONTINUE" || mapAction.kind === "TRANSIT_GET_OFF") {
      const transitActionId = mapAction.kind === "TRANSIT_BOARD"
        ? "transit_board"
        : mapAction.kind === "TRANSIT_CONTINUE"
          ? "transit_continue"
          : "transit_get_off";

      handleTransitActions({
        ...ctx,
        id: transitActionId,
        payload: isPlainObject(mapAction.payload) ? mapAction.payload : {}
      });

      if (Array.isArray(mapAction.effects) || Array.isArray(mapAction.socialEffects)) {
        applyMapActionEffects({ mapAction, map, gameState, actionId: id, plan, addEffect, addSocialIntent, addNote });
      }

      addNote(plan, `${mapAction.kind} -> ${transitActionId}`);
      applyGameplayPrecheck();
      return true;
    }

    addNote(plan, `未迁移 kind=${mapAction.kind}，使用 legacy 处理：${id}`);
    addSysCall(plan, SYSCALL_TYPES.LEGACY, { actionId: id });
    applyGameplayPrecheck();
    return true;
  }

  if (mapAction.eventId) {
    addNote(plan, `触发事件：${mapAction.eventId}`);
    addSysCall(plan, SYSCALL_TYPES.LOAD_EVENT, { eventId: mapAction.eventId });
  }

  if (mapAction.targetMapId) {
    addNote(plan, `跳转地图：${mapAction.targetMapId}`);
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: mapAction.targetMapId });
  }

  if (mapAction.effects || mapAction.socialEffects) {
    applyMapActionEffects({ mapAction, map, gameState, actionId: id, plan, addEffect, addSocialIntent, addNote });
  }

  const hasAnySemantics = !!(mapAction.eventId || mapAction.targetMapId || mapAction.effects || mapAction.socialEffects);
  if (!hasAnySemantics) {
    addNote(plan, `动作未提供语义（无 kind/eventId/targetMapId/effects），使用 legacy：${id}`);
    addSysCall(plan, SYSCALL_TYPES.LEGACY, { actionId: id });
  }

  applyGameplayPrecheck();

  return true;
}
