import { isOneShotBusinessSemantic, queueOneShotBusinessFromMapAction } from "./one_shot_business_map_action.js";

export async function handleGovActions(ctx) {
  const {
    action,
    id,
    plan,
    gameState,
    addEffect,
    addBusinessIntent,
    addSysCall,
    addNote,
    Effects,
    SYSCALL_TYPES,
    hasAnyIdentityProof,
    clearGovHallADialogFlags,
    clearGovHallBDialogFlags,
    clearGovHallCDialogFlags,
    isGovHallBusinessOpen,
    ensureItemsDbLoaded,
    GOV_ITEM_TEMP_ID,
    getInventoryContext,
    getTasksContext,
    addInventoryItemForce,
    hasCitizenIdentity,
    hasInventoryItem,
    GOV_ITEM_CITIZEN_ID,
    tryRemoveOne,
    GOV_ITEM_SHIP_TICKET,
    isSeaQuotaSeason,
    createTheseusBoardingTaskEntry
  } = ctx;

  if (id === "gov_a_to_c") {
    if (!hasAnyIdentityProof(gameState)) {
      addEffect(plan, Effects.set("world.flags.govHallADialogNoId", true));
      addNote(plan, "gov_a_to_c 拒绝：无身份证明");
      return true;
    }

    clearGovHallADialogFlags(plan);

    addEffect(plan, Effects.push("logLines", "你在闸机前停了一秒，屏幕扫过你的证件状态，放行灯亮起。"));

    addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
      minutes: 2,
      reason: "gov_hall:a_to_c",
      ctx: { isSleeping: false }
    });
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: "gov_hall_main_hall" });
    addNote(plan, "gov_a_to_c -> gov_hall_main_hall");
    return true;
  }

  if (id === "gov_a_dialog_return") {
    clearGovHallADialogFlags(plan);
    addNote(plan, "gov_a_dialog_return");
    return true;
  }

  if (id === "gov_b_issue_temp_id") {
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      addNote(plan, "gov_b_window_closed");
      return true;
    }

    if (hasAnyIdentityProof(gameState)) {
      clearGovHallBDialogFlags(plan);
      addEffect(plan, Effects.set("world.flags.govHallBDialogAlreadyHasIdentity", true));
      addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", true));
      addNote(plan, "gov_b_temp_already_has_identity");
      return true;
    }

    clearGovHallBDialogFlags(plan);
    addEffect(plan, Effects.set("world.flags.govHallBDialogTempIssued", true));
    addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", true));
    addNote(plan, "gov_b_temp_issued_dialog_open");
    return true;
  }

  if (id === "gov_b_redirect_to_hall") {
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      addNote(plan, "gov_b_window_closed");
      return true;
    }

    clearGovHallBDialogFlags(plan);
    if (!hasAnyIdentityProof(gameState)) {
      addEffect(plan, Effects.set("world.flags.govHallBDialogNeedIdentityForCitizen", true));
      addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", true));
      addNote(plan, "gov_b_apply_citizen_need_id");
      return true;
    }

    addEffect(plan, Effects.set("world.flags.govHallBDialogCitizenGoHall", true));
    addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", true));
    addNote(plan, "gov_b_apply_citizen_go_hall");
    return true;
  }

  if (id === "gov_b_go_hall") {
    if (!hasAnyIdentityProof(gameState)) {
      clearGovHallBDialogFlags(plan);
      addEffect(plan, Effects.set("world.flags.govHallBDialogNeedIdentityForCitizen", true));
      addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", true));
      addNote(plan, "gov_b_go_hall_reject_no_id");
      return true;
    }

    clearGovHallBDialogFlags(plan);
    addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", false));
    addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
      minutes: 2,
      reason: "gov_hall:b_to_c",
      ctx: { isSleeping: false }
    });
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: "gov_hall_main_hall" });
    addNote(plan, "gov_b_go_hall -> gov_hall_main_hall");
    return true;
  }

  if (id === "gov_b_reissue_citizen") {
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      addNote(plan, "gov_b_window_closed");
      return true;
    }

    const hasCitizen = hasCitizenIdentity(gameState);
    const hasCitizenCard = hasInventoryItem(gameState, GOV_ITEM_CITIZEN_ID);

    if (!hasCitizen) {
      clearGovHallBDialogFlags(plan);
      addEffect(plan, Effects.set("world.flags.govHallBDialogNotCitizen", true));
      addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", true));
      addNote(plan, "gov_b_reissue_not_citizen");
      return true;
    }

    if (hasCitizenCard) {
      clearGovHallBDialogFlags(plan);
      addEffect(plan, Effects.set("world.flags.govHallBDialogAlreadyHasCitizenCard", true));
      addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", true));
      addNote(plan, "gov_b_reissue_already_has_card");
      return true;
    }

    clearGovHallBDialogFlags(plan);
    addEffect(plan, Effects.set("world.flags.govHallBDialogReissuePrompt", true));
    addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", true));
    addNote(plan, "gov_b_reissue_prompt_open");
    return true;
  }

  if (id === "gov_b_dialog_return") {
    clearGovHallBDialogFlags(plan);
    addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", true));
    addNote(plan, "gov_b_dialog_return");
    return true;
  }

  if (id === "gov_b_continue_issue_temp") {
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      addNote(plan, "gov_b_window_closed");
      return true;
    }

    const flags = gameState?.world?.flags || gameState?.flags || {};
    if (flags.govHallBDialogDossierCreated === true) {
      addEffect(plan, Effects.set("world.flags.dossierNeedsAttention", true));
      addEffect(plan, Effects.set("world.flags.govHallBDialogDossierCreated", false));
      addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", false));
      addNote(plan, "gov_b_dossier_dialog_continue");
      return true;
    }

    const loaded = await ensureItemsDbLoaded();
    if (!loaded.ok || !loaded.byId?.has(GOV_ITEM_TEMP_ID)) {
      addEffect(plan, Effects.push("logLines", "办理失败：缺少证件物品配置。"));
      addNote(plan, "gov_b_continue_issue_temp 失败：items db/定义缺失");
      return true;
    }

    const { inventory } = getInventoryContext(gameState);
    const nextInventory = addInventoryItemForce(inventory, GOV_ITEM_TEMP_ID, 1);
    const dossierCreatedAtMinutes = Number.isFinite(Number(gameState?.player?.profile?.dossierCreatedAtMinutes))
      ? Math.max(0, Math.trunc(Number(gameState.player.profile.dossierCreatedAtMinutes)))
      : null;
    const nowMinutes = Math.max(0, Math.floor(Number(gameState?.time?.totalMinutes ?? 0)));
    addEffect(plan, Effects.set("player.inventory", nextInventory));
    addEffect(plan, Effects.set("world.flags.govHallHasTempId", true));
    addEffect(plan, Effects.set("world.flags.govHallHasAnyIdProof", true));
    addEffect(plan, Effects.set("world.flags.dossierUnlocked", true));
    if (dossierCreatedAtMinutes == null) {
      addEffect(plan, Effects.set("player.profile.dossierCreatedAtMinutes", nowMinutes));
    }

    const tasks = getTasksContext(gameState);
    const nextTasks = tasks.map((row) => {
      if (row.id !== "task_gov_hall_id") return row;
      return {
        ...row,
        status: "done",
        updatedAtMin: nowMinutes
      };
    });
    const hasGovHallTask = nextTasks.some((row) => row.id === "task_gov_hall_id");
    if (hasGovHallTask) {
      addEffect(plan, Effects.set("player.tasks", nextTasks));
      addEffect(plan, Effects.set("ui.tasksNeedsAttention", true));
    }

    const dossierDialogShown = !!flags.govHallBDialogDossierCreatedShown;
    clearGovHallBDialogFlags(plan);
    if (!dossierDialogShown) {
      addEffect(plan, Effects.set("world.flags.govHallBDialogDossierCreated", true));
      addEffect(plan, Effects.set("world.flags.govHallBDialogDossierCreatedShown", true));
      addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", true));
    } else {
      addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", false));
    }
    addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
      minutes: 20,
      reason: "gov_hall:temp_id",
      ctx: { isSleeping: false }
    });
    addSysCall(plan, SYSCALL_TYPES.LOAD_MAP, { mapId: "gov_hall_window_1" });
    addNote(plan, "gov_b_temp_issued_by_continue");
    return true;
  }

  if (id === "gov_b_reissue_confirm") {
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      addNote(plan, "gov_b_window_closed");
      return true;
    }

    const money = Math.floor(Number(gameState?.world?.money ?? 0));
    if (money < 200) {
      addNote(plan, "gov_b_reissue_insufficient_money");
      return true;
    }

    const loaded = await ensureItemsDbLoaded();
    if (!loaded.ok || !loaded.byId?.has(GOV_ITEM_CITIZEN_ID)) {
      addEffect(plan, Effects.push("logLines", "补办失败：缺少证件物品配置。"));
      return true;
    }

    const { inventory } = getInventoryContext(gameState);
    let nextInventory = inventory.map(row => ({ ...row }));
    const removeTemp = tryRemoveOne(nextInventory, GOV_ITEM_TEMP_ID);
    if (removeTemp.ok) {
      nextInventory = removeTemp.next;
    }
    nextInventory = addInventoryItemForce(nextInventory, GOV_ITEM_CITIZEN_ID, 1);

    addEffect(plan, Effects.add("world.money", -200));
    addEffect(plan, Effects.set("player.inventory", nextInventory));
    addEffect(plan, Effects.set("world.flags.govHallHasCitizenId", true));
    addEffect(plan, Effects.set("world.flags.govHallHasAnyIdProof", true));
    clearGovHallBDialogFlags(plan);
    addEffect(plan, Effects.set("world.flags.govHallBDialogReissueIssued", true));
    addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", true));
    addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
      minutes: 20,
      reason: "gov_hall:reissue_citizen",
      ctx: { isSleeping: false }
    });
    addNote(plan, "gov_b_reissue_paid");
    return true;
  }

  if (id === "gov_c_queue_take_number") {
    clearGovHallCDialogFlags(plan);

    if (!hasAnyIdentityProof(gameState)) {
      addEffect(plan, Effects.set("world.flags.govHallCDialogQueueRejected", true));
      addEffect(plan, Effects.push("logLines", "取号失败：需先持有任一身份证明。"));
      return true;
    }
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.set("world.flags.govHallCDialogQueueRejected", true));
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      return true;
    }

    if (gameState?.world?.flags?.govHallHasQueueNumber) {
      addEffect(plan, Effects.set("world.flags.govHallCDialogQueueRejected", true));
      addEffect(plan, Effects.push("logLines", "你已经取过号了，无法重复取号。"));
      return true;
    }

    const queueNo = Math.floor(Math.random() * 16);
    addEffect(plan, Effects.set("world.flags.govHallCDialogQueueSuccess", true));
    addEffect(plan, Effects.set("world.flags.govHallHasQueueNumber", true));
    addEffect(plan, Effects.set("world.flags.govHallQueueNumber", queueNo));
    addEffect(plan, Effects.push("logLines", "你在护栏里挪动十分钟。叫号屏刷新得很慢，队列前端的人每次只前进半步。"));
    addEffect(plan, Effects.push("logLines", `取号成功，你的号码为${queueNo}号`));
    addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
      minutes: 10,
      reason: "gov_hall:queue",
      ctx: { isSleeping: false }
    });
    return true;
  }

  if (id === "gov_c_window_enter") {
    clearGovHallCDialogFlags(plan);

    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.set("world.flags.govHallCDialogWindowRejected", true));
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      return true;
    }

    if (!gameState?.world?.flags?.govHallHasQueueNumber) {
      addEffect(plan, Effects.set("world.flags.govHallCDialogWindowRejected", true));
      addEffect(plan, Effects.push("logLines", "没有取号不要捣乱！"));
      return true;
    }

    addEffect(plan, Effects.set("world.flags.govHallWindowMenuOpen", true));
    addEffect(plan, Effects.set("world.flags.govHallHasQueueNumber", false));
    addEffect(plan, Effects.set("world.flags.govHallQueueNumber", 0));
    addEffect(plan, Effects.push("logLines", "你按号码走到对应窗口，玻璃后的工作人员没有多余表情。"));
    addEffect(plan, Effects.push("logLines", "业务员：\"说事。\""));
    addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
      minutes: 2,
      reason: "gov_hall:enter_window",
      ctx: { isSleeping: false }
    });
    return true;
  }

  if (id === "gov_c_window_pay_bill") {
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      return true;
    }

    const currentMap = gameState?.currentMap;
    const mapAction = Array.isArray(currentMap?.actions)
      ? currentMap.actions.find((row) => String(row?.id || "") === id)
      : null;
    if (isOneShotBusinessSemantic(mapAction)) {
      await queueOneShotBusinessFromMapAction({
        action,
        payload: {},
        map: currentMap,
        mapAction,
        gameState,
        plan,
        addBusinessIntent,
        addNote
      });
      addNote(plan, "gov_c_window_pay_bill queued business intent");
    }
    return true;
  }

  if (id === "gov_c_window_view_bill") {
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      return true;
    }
    const unpaidFines = Math.max(0, Math.trunc(Number(gameState?.world?.refData?.accounts?.unpaidFinesCents ?? 0)));
    const otherArrears = 0;
    const total = unpaidFines + otherArrears;
    addEffect(plan, Effects.push("logLines", "业务员（敲键盘）：\"账单在这。\""));
    addEffect(plan, Effects.push("logLines", `未缴罚款：${unpaidFines}`));
    addEffect(plan, Effects.push("logLines", `其它欠费：${otherArrears}`));
    addEffect(plan, Effects.push("logLines", `合计：${total}`));
    return true;
  }

  if (id === "gov_c_window_citizen_no_docs") {
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      return true;
    }

    clearGovHallCDialogFlags(plan);
    addEffect(plan, Effects.set("world.flags.govHallCDialogCitizenApplyIntro", true));
    addEffect(plan, Effects.set("world.flags.govHallSeaOfferActive", false));
    return true;
  }

  if (id === "gov_c_window_citizen_continue") {
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      return true;
    }

    clearGovHallCDialogFlags(plan);
    addEffect(plan, Effects.set("world.flags.govHallCDialogCitizenApplyPaths", true));
    addEffect(plan, Effects.set("world.flags.govHallSeaOfferActive", false));
    return true;
  }

  if (id === "gov_c_window_citizen_continue_ask") {
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      return true;
    }

    clearGovHallCDialogFlags(plan);
    addEffect(plan, Effects.set("world.flags.govHallCDialogCitizenApplyAskDocs", true));
    addEffect(plan, Effects.set("world.flags.govHallSeaOfferActive", false));
    return true;
  }

  if (id === "gov_c_window_citizen_no") {
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      return true;
    }

    clearGovHallCDialogFlags(plan);
    addEffect(plan, Effects.set("world.flags.govHallCDialogCitizenApplyRejected", true));
    addEffect(plan, Effects.set("world.flags.govHallWindowMenuOpen", false));
    addEffect(plan, Effects.set("world.flags.govHallSeaOfferActive", false));
    return true;
  }

  if (id === "gov_c_window_sea_inquire") {
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      return true;
    }

    clearGovHallCDialogFlags(plan);

    if (!isSeaQuotaSeason(gameState)) {
      addEffect(plan, Effects.set("world.flags.govHallSeaOfferActive", false));
      addEffect(plan, Effects.set("world.flags.govHallCDialogSeaOfferUnavailable", true));
      return true;
    }

    addEffect(plan, Effects.set("world.flags.govHallSeaOfferActive", true));
    addEffect(plan, Effects.set("world.flags.govHallCDialogSeaOfferUnavailable", false));
    return true;
  }

  if (id === "gov_c_window_sea_buy_yes") {
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      return true;
    }

    if (!gameState?.world?.flags?.govHallSeaOfferActive) {
      addEffect(plan, Effects.push("logLines", "请先执行名额查询。"));
      return true;
    }

    const money = Math.floor(Number(gameState?.world?.money ?? 0));
    if (money < 16000) {
      clearGovHallCDialogFlags(plan);
      addEffect(plan, Effects.set("world.flags.govHallSeaOfferActive", false));
      addEffect(plan, Effects.set("world.flags.govHallCDialogSeaOfferInsufficient", true));
      return true;
    }

    const loaded = await ensureItemsDbLoaded();
    if (!loaded.ok || !loaded.byId?.has(GOV_ITEM_SHIP_TICKET)) {
      addEffect(plan, Effects.push("logLines", "购票失败：缺少船票物品配置。"));
      return true;
    }

    const alreadyHasTicket = hasInventoryItem(gameState, GOV_ITEM_SHIP_TICKET);
    const { inventory } = getInventoryContext(gameState);
    const nextInventory = addInventoryItemForce(inventory, GOV_ITEM_SHIP_TICKET, 1);
    clearGovHallCDialogFlags(plan);
    addEffect(plan, Effects.add("world.money", -16000));
    addEffect(plan, Effects.set("player.inventory", nextInventory));
    if (!alreadyHasTicket) {
      const tasks = getTasksContext(gameState);
      const hasTheseusTask = tasks.some((row) => row.id === "task_theseus_boarding");
      if (!hasTheseusTask) {
        const nowMin = Math.max(0, Math.floor(Number(gameState?.time?.totalMinutes ?? 0)));
        addEffect(plan, Effects.set("player.tasks", [...tasks, createTheseusBoardingTaskEntry(nowMin)]));
        addEffect(plan, Effects.set("ui.tasksNeedsAttention", true));
      }
    }
    addEffect(plan, Effects.set("world.flags.govHallSeaOfferActive", false));
    addEffect(plan, Effects.set("world.flags.govHallCDialogSeaOfferSuccess", true));
    return true;
  }

  if (id === "gov_c_window_sea_buy_no") {
    clearGovHallCDialogFlags(plan);
    addEffect(plan, Effects.set("world.flags.govHallSeaOfferActive", false));
    addEffect(plan, Effects.set("world.flags.govHallCDialogSeaOfferDeclined", true));
    return true;
  }

  if (id === "gov_c_window_back") {
    clearGovHallCDialogFlags(plan);
    addEffect(plan, Effects.set("world.flags.govHallWindowMenuOpen", false));
    addEffect(plan, Effects.set("world.flags.govHallSeaOfferActive", false));
    addEffect(plan, Effects.set("world.flags.govHallCDialogSeaOfferUnavailable", false));
    addEffect(plan, Effects.push("logLines", "你离开窗口，回到大厅。"));
    return true;
  }

  if (id === "gov_c_dialog_return") {
    clearGovHallCDialogFlags(plan);
    addNote(plan, "gov_c_dialog_return");
    return true;
  }

  if (id === "gov_b_window_intro") {
    if (!isGovHallBusinessOpen(gameState)) {
      addEffect(plan, Effects.push("logLines", "窗口关闭（周一–周六 09:00–18:00）。"));
      addNote(plan, "gov_b_window_closed");
      return true;
    }
    addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
      minutes: 1,
      reason: "gov_hall:b_window_intro",
      ctx: { isSleeping: false }
    });
    clearGovHallBDialogFlags(plan);
    addEffect(plan, Effects.set("world.flags.govHallBWindowOpen", true));
    addEffect(plan, Effects.push("logLines", "你走到玻璃前，投递口边的划痕很密。"));
    addEffect(plan, Effects.push("logLines", "柜台后的业务员抬头扫了你一眼，问你\"你要办理什么业务\""));
    addNote(plan, "gov_b_window_intro_prompt");
    return true;
  }

  return false;
}
