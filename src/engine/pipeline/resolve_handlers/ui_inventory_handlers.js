import { applyConsumableEffectsToPlayer } from "../../player.js";
import { sanitizeDebugItemGrantQuantity } from "../../debug/debug_item_tools.js";
import { isDebugItemToolsEnabled } from "../../debug/debug_floating_tools_config.js";
import { getToolTagLabel, isToolEquipItem, normalizeEquippedTools } from "../../items_db.js";
import { buildMargTransitionAdvanceContext } from "../../marg_transition_blocker_provider.js";

function parseDebugItemGrantQuantity(value) {
  if (value == null || String(value).trim() === "") {
    return { ok: true, qty: 1 };
  }
  const amount = Math.floor(Number(value));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "数量无效" };
  }
  return { ok: true, qty: sanitizeDebugItemGrantQuantity(value) };
}

function forceAddInventoryItem(inventory, itemId, qty = 1) {
  const next = Array.isArray(inventory) ? inventory.map((row) => ({ ...row })) : [];
  const normalizedItemId = String(itemId || "").trim();
  const amount = Math.max(0, Math.floor(Number(qty) || 0));
  if (!normalizedItemId || amount <= 0) return next;
  const index = next.findIndex((row) => row.itemId === normalizedItemId);
  if (index >= 0) {
    next[index].qty = Math.max(0, Math.floor(Number(next[index].qty) || 0)) + amount;
    return next;
  }
  next.push({ itemId: normalizedItemId, qty: amount });
  return next;
}

function formatCooldownRemainingText(totalMinutes) {
  const minutes = Math.max(0, Math.ceil(Number(totalMinutes) || 0));
  if (minutes <= 0) return "现在";
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours}小时${restMinutes}分钟` : `${hours}小时`;
}

export async function handleUiInventoryActions(ctx) {
  const {
    id,
    payload,
    plan,
    gameState,
    addEffect,
    addSysCall,
    addNote,
    Effects,
    SYSCALL_TYPES,
    ensureItemsDbLoaded,
    INVENTORY_CATEGORIES,
    EQUIPMENT_SLOT_ORDER,
    sortTaskEntries,
    getTasksContext,
    findTaskIndex,
    setInventoryToast,
    getInventoryContext,
    getCapacityProfile,
    tryAddItem,
    tryRemoveOne,
    findInventoryIndex,
    inferSidebarSessionCoverage
  } = ctx;

  const isDeadMode = gameState?.player?.exposure?.dead === true;
  const isCollapseMode = String(gameState?.player?.meta?.sleepEpisode?.mode || "").toUpperCase() === "COLLAPSE";
  const isCriticalMode = isDeadMode || isCollapseMode;
  const rejectByGate = (reason) => {
    addNote(plan, reason);
    return true;
  };

  if (id === "COLLAPSE_TICK_10M") {
    addNote(plan, "COLLAPSE_TICK_10M：推进 10 分钟");
    addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
      minutes: 10,
      reason: "collapse_tick_10m",
      ctx: {
        isSleeping: false,
        sessionCoverage: "NONE"
      }
    });
    return true;
  }

  if (id === "ui_open_inventory") {
    if (isCriticalMode) return rejectByGate("门禁：DEAD/COLLAPSE 状态下禁止打开背包");
    await ensureItemsDbLoaded();
    addEffect(plan, Effects.set("ui.page", "map"));
    addEffect(plan, Effects.set("ui.overlay", "inventory"));
    addEffect(plan, Effects.set("ui.profileOpen", false));
    addEffect(plan, Effects.set("ui.recordsOpen", false));
    addEffect(plan, Effects.set("ui.socialOpen", false));
    addEffect(plan, Effects.set("ui.inventoryNeedsAttention", false));
    if (!INVENTORY_CATEGORIES.includes(String(gameState?.ui?.invFilter || ""))) {
      addEffect(plan, Effects.set("ui.invFilter", "tool"));
    }
    setInventoryToast(plan, "已打开背包页");
    addNote(plan, "打开背包页");
    return true;
  }

  if (id === "ui_map_open") {
    if (isCriticalMode) return rejectByGate("门禁：DEAD/COLLAPSE 状态下禁止打开地图弹层");
    addEffect(plan, Effects.set("ui.page", "map"));
    addEffect(plan, Effects.set("ui.overlay", "map_minimap"));
    addEffect(plan, Effects.set("ui.profileOpen", false));
    addEffect(plan, Effects.set("ui.recordsOpen", false));
    addEffect(plan, Effects.set("ui.socialOpen", false));
    addNote(plan, "打开地图弹层");
    return true;
  }

  if (id === "ui_map_close") {
    addEffect(plan, Effects.set("ui.page", "map"));
    addEffect(plan, Effects.set("ui.overlay", null));
    addNote(plan, "关闭地图弹层");
    return true;
  }

  if (id === "ui_open_inventory_clothing") {
    if (isCriticalMode) return rejectByGate("门禁：DEAD/COLLAPSE 状态下禁止打开服装背包");
    await ensureItemsDbLoaded();
    addEffect(plan, Effects.set("ui.page", "map"));
    addEffect(plan, Effects.set("ui.overlay", "inventory"));
    addEffect(plan, Effects.set("ui.profileOpen", false));
    addEffect(plan, Effects.set("ui.recordsOpen", false));
    addEffect(plan, Effects.set("ui.socialOpen", false));
    addEffect(plan, Effects.set("ui.inventoryNeedsAttention", false));
    addEffect(plan, Effects.set("ui.invFilter", "clothing"));
    addEffect(plan, Effects.set("ui.invSelectedItemId", null));
    addEffect(plan, Effects.set("ui.invSelectedSlot", null));
    setInventoryToast(plan, "已打开背包页（服装）");
    addNote(plan, "打开背包页并切换到服装页");
    return true;
  }

  if (id === "ui_close_inventory") {
    addEffect(plan, Effects.set("ui.page", "map"));
    addEffect(plan, Effects.set("ui.overlay", null));
    setInventoryToast(plan, null);
    addNote(plan, "关闭背包页");
    return true;
  }

  if (id === "ui_tasks_open" || id === "ui_memo_open") {
    if (isCriticalMode) return rejectByGate("门禁：DEAD/COLLAPSE 状态下禁止打开备忘录");
    const tasks = sortTaskEntries(getTasksContext(gameState));
    const preferred = tasks.find(x => x.status !== "archived") || tasks[0] || null;
    addEffect(plan, Effects.set("ui.page", "map"));
    addEffect(plan, Effects.set("ui.overlay", "tasks"));
    addEffect(plan, Effects.set("ui.profileOpen", false));
    addEffect(plan, Effects.set("ui.recordsOpen", false));
    addEffect(plan, Effects.set("ui.socialOpen", false));
    addEffect(plan, Effects.set("ui.taskSelectedId", preferred ? preferred.id : null));
    addEffect(plan, Effects.set("ui.tasksNeedsAttention", false));
    addNote(plan, id === "ui_memo_open" ? "打开备忘录（memo 别名）" : "打开备忘录");
    return true;
  }

  if (id === "ui_tasks_close") {
    addEffect(plan, Effects.set("ui.page", "map"));
    addEffect(plan, Effects.set("ui.overlay", null));
    addNote(plan, "关闭备忘录");
    return true;
  }

  if (id === "ui_profile_open") {
    if (isCriticalMode) return rejectByGate("门禁：DEAD/COLLAPSE 状态下禁止打开档案页");
    const flags = gameState?.world?.flags || gameState?.flags || {};
    const dossierUnlocked = !!flags.dossierUnlocked || !!flags.govHallHasTempId;
    if (!dossierUnlocked) {
      addNote(plan, "档案页未解锁，忽略打开请求");
      return true;
    }
    addEffect(plan, Effects.set("ui.page", "map"));
    addEffect(plan, Effects.set("ui.profileOpen", true));
    addEffect(plan, Effects.set("ui.recordsOpen", false));
    addEffect(plan, Effects.set("ui.socialOpen", false));
    if (!!flags.dossierNeedsAttention) {
      addEffect(plan, Effects.set("world.flags.dossierNeedsAttention", false));
    }
    addNote(plan, "打开档案页");
    return true;
  }

  if (id === "ui_profile_close") {
    addEffect(plan, Effects.set("ui.profileOpen", false));
    addNote(plan, "关闭档案页");
    return true;
  }

  if (id === "ui_records_open") {
    if (isCriticalMode) return rejectByGate("门禁：DEAD/COLLAPSE 状态下禁止打开记录面板");
    addEffect(plan, Effects.set("ui.page", "map"));
    addEffect(plan, Effects.set("ui.overlay", null));
    addEffect(plan, Effects.set("ui.profileOpen", false));
    addEffect(plan, Effects.set("ui.recordsOpen", true));
    addEffect(plan, Effects.set("ui.socialOpen", false));
    addNote(plan, "打开记录面板");
    return true;
  }

  if (id === "ui_records_close") {
    addEffect(plan, Effects.set("ui.recordsOpen", false));
    addNote(plan, "关闭记录面板");
    return true;
  }

  if (id.startsWith("tasks_select:")) {
    if (isCriticalMode) return rejectByGate("门禁：DEAD/COLLAPSE 状态下禁止操作备忘录");
    const taskId = id.slice("tasks_select:".length).trim();
    addEffect(plan, Effects.set("ui.taskSelectedId", taskId || null));
    return true;
  }

  if (id.startsWith("tasks_toggle_done:") || id.startsWith("tasks_delete:") || id.startsWith("tasks_archive:") || id.startsWith("tasks_pin:") || id === "tasks_add") {
    if (isCriticalMode) return rejectByGate("门禁：DEAD/COLLAPSE 状态下禁止操作备忘录");
    const tasks = getTasksContext(gameState);
    const nowMin = Math.max(0, Math.floor(Number(gameState?.time?.totalMinutes ?? 0)));

    if (id === "tasks_add") {
      const rawTitle = String(payload?.title || "").trim();
      const title = rawTitle || "新建备忘";
      const taskId = `task_${nowMin}_${Math.floor(Math.random() * 100000)}`;
      const next = [
        ...tasks,
        {
          id: taskId,
          title,
          status: "open",
          createdAtMin: nowMin,
          updatedAtMin: nowMin,
          body: [{ t: "text", v: title }],
          tags: ["待办事项"],
          pinned: false
        }
      ];
      addEffect(plan, Effects.set("player.tasks", next));
      addEffect(plan, Effects.set("ui.taskSelectedId", taskId));
      return true;
    }

    const prefix = id.startsWith("tasks_toggle_done:")
      ? "tasks_toggle_done:"
      : id.startsWith("tasks_delete:")
        ? "tasks_delete:"
      : id.startsWith("tasks_archive:")
        ? "tasks_archive:"
        : "tasks_pin:";
    const taskId = id.slice(prefix.length).trim();
    const idx = findTaskIndex(tasks, taskId);
    if (idx < 0) {
      return true;
    }

    if (id.startsWith("tasks_delete:") || id.startsWith("tasks_archive:")) {
      const next = tasks.filter(row => row.id !== taskId);
      addEffect(plan, Effects.set("player.tasks", next));

      const selectedId = String(gameState?.ui?.taskSelectedId || "").trim();
      if (!selectedId || selectedId === taskId) {
        const fallback = sortTaskEntries(next).find(x => x.status !== "archived") || next[0] || null;
        addEffect(plan, Effects.set("ui.taskSelectedId", fallback ? fallback.id : null));
      }
      return true;
    }

    const next = tasks.map(row => ({ ...row }));
    const row = { ...next[idx] };
    row.updatedAtMin = nowMin;

    if (id.startsWith("tasks_toggle_done:")) {
      if (row.status === "archived") {
        return true;
      }
      row.status = row.status === "done" ? "open" : "done";
    } else if (id.startsWith("tasks_pin:")) {
      row.pinned = !row.pinned;
    }

    next[idx] = row;
    addEffect(plan, Effects.set("player.tasks", next));

    const selectedId = String(gameState?.ui?.taskSelectedId || "").trim();
    if (!selectedId) {
      addEffect(plan, Effects.set("ui.taskSelectedId", taskId));
    }
    return true;
  }

  if (id.startsWith("inv_filter:")) {
    if (isCriticalMode) return rejectByGate("门禁：DEAD/COLLAPSE 状态下禁止操作背包");
    const category = id.slice("inv_filter:".length);
    if (!INVENTORY_CATEGORIES.includes(category)) {
      setInventoryToast(plan, `未知分类：${category}`);
      return true;
    }
    addEffect(plan, Effects.set("ui.invFilter", category));
    addEffect(plan, Effects.set("ui.invSelectedItemId", null));
    addEffect(plan, Effects.set("ui.invSelectedSlot", null));
    setInventoryToast(plan, `分类切换：${category}`);
    return true;
  }

  if (id.startsWith("inv_select_item:")) {
    if (isCriticalMode) return rejectByGate("门禁：DEAD/COLLAPSE 状态下禁止操作背包");
    const itemId = id.slice("inv_select_item:".length).trim();
    const loaded = await ensureItemsDbLoaded();
    const itemDef = loaded?.ok ? loaded.byId.get(itemId) : null;
    const slot = itemDef && EQUIPMENT_SLOT_ORDER.includes(String(itemDef.equipSlot || "").trim())
      ? String(itemDef.equipSlot).trim()
      : null;
    addEffect(plan, Effects.set("ui.invSelectedItemId", itemId || null));
    addEffect(plan, Effects.set("ui.invSelectedSlot", slot));
    setInventoryToast(plan, itemId ? `已选择物品：${itemId}` : null);
    return true;
  }

  if (id.startsWith("inv_select_slot:")) {
    if (isCriticalMode) return rejectByGate("门禁：DEAD/COLLAPSE 状态下禁止操作背包");
    const slot = id.slice("inv_select_slot:".length).trim();
    if (!EQUIPMENT_SLOT_ORDER.includes(slot)) {
      setInventoryToast(plan, `未知装备位：${slot}`);
      return true;
    }
    addEffect(plan, Effects.set("ui.invFilter", "clothing"));
    addEffect(plan, Effects.set("ui.invSelectedSlot", slot));
    addEffect(plan, Effects.set("ui.invSelectedItemId", null));
    setInventoryToast(plan, `已选择槽位：${slot}`);
    return true;
  }

  if (
    id.startsWith("inv_drop:") ||
    id.startsWith("inv_use:") ||
    id.startsWith("inv_equip:") ||
    id.startsWith("inv_unequip_tool:") ||
    id.startsWith("inv_unequip:") ||
    id.startsWith("inv_debug_gain:")
  ) {
    if (isCriticalMode) return rejectByGate("门禁：DEAD/COLLAPSE 状态下禁止操作背包");
    const loaded = await ensureItemsDbLoaded();
    if (!loaded.ok) {
      setInventoryToast(plan, loaded.error || "物品数据库加载失败");
      return true;
    }

    const itemsById = loaded.byId;
    const { inventory, equipment } = getInventoryContext(gameState);
    const equippedTools = normalizeEquippedTools(gameState?.player?.equippedTools);

    if (id.startsWith("inv_debug_gain:")) {
      if (!isDebugItemToolsEnabled()) {
        setInventoryToast(plan, "获取失败：调试物品入口未开启");
        return true;
      }
      const itemId = id.slice("inv_debug_gain:".length).trim();
      const gainQtyResult = parseDebugItemGrantQuantity(payload?.qty);
      if (!gainQtyResult.ok) {
        setInventoryToast(plan, `获取失败：${gainQtyResult.reason}`);
        return true;
      }
      const gainQty = gainQtyResult.qty;
      if (itemId === "tool_loadout") {
        let nextInventory = inventory;
        for (const toolId of ["tool_thermometer", "tool_vitals_monitor", "tool_small_flashlight"]) {
          nextInventory = forceAddInventoryItem(nextInventory, toolId, 1);
        }
        addEffect(plan, Effects.set("player.inventory", nextInventory));
        addEffect(plan, Effects.set("ui.invSelectedItemId", "tool_thermometer"));
        addEffect(plan, Effects.set("ui.invSelectedSlot", null));
        setInventoryToast(plan, "已注入工具验证包");
        return true;
      }
      const addResult = tryAddItem(inventory, itemId, gainQty, itemsById, getCapacityProfile(equipment, itemsById));
      if (!addResult.ok) {
        setInventoryToast(plan, `获取失败：${addResult.reason}`);
        return true;
      }

      addEffect(plan, Effects.set("player.inventory", addResult.next));
      addEffect(plan, Effects.set("ui.invSelectedItemId", itemId));
      addEffect(plan, Effects.set("ui.invSelectedSlot", null));
      setInventoryToast(plan, `已获取：${itemsById.get(itemId)?.name || itemId} × ${gainQty}`);
      return true;
    }

    if (id.startsWith("inv_drop:")) {
      const itemId = id.slice("inv_drop:".length).trim();
      const removeResult = tryRemoveOne(inventory, itemId);
      if (!removeResult.ok) {
        setInventoryToast(plan, `丢弃失败：${removeResult.reason}`);
        return true;
      }

      addEffect(plan, Effects.set("player.inventory", removeResult.next));
      if (findInventoryIndex(removeResult.next, itemId) < 0) {
        addEffect(plan, Effects.set("ui.invSelectedItemId", null));
      }
      setInventoryToast(plan, `已丢弃 1 个 ${itemsById.get(itemId)?.name || itemId}`);
      return true;
    }

    if (id.startsWith("inv_use:")) {
      const itemId = id.slice("inv_use:".length).trim();
      const itemDef = itemsById.get(itemId);
      if (!itemDef) {
        setInventoryToast(plan, "使用失败：物品不存在");
        return true;
      }
      if (itemDef.category !== "consumable") {
        setInventoryToast(plan, `【${itemDef.name}】不可使用`);
        return true;
      }

      if (itemDef.usable === false) {
        setInventoryToast(plan, String(itemDef.useRejectMessage || "或许未来我会用上它。"));
        return true;
      }

      const nowTotalMinutes = Math.max(0, Math.floor(Number(gameState?.time?.totalMinutes ?? 0) || 0));
      const cooldownMinutes = Math.max(0, Math.floor(Number(itemDef.useCooldownMinutes) || 0));
      const lastUsedAt = Number(gameState?.player?.meta?.itemUseCooldowns?.[itemId]);
      if (cooldownMinutes > 0 && Number.isFinite(lastUsedAt)) {
        const remainingMinutes = lastUsedAt + cooldownMinutes - nowTotalMinutes;
        if (remainingMinutes > 0) {
          const fallback = `还需要等待${formatCooldownRemainingText(remainingMinutes)}`;
          setInventoryToast(plan, String(itemDef.useCooldownRejectMessage || fallback));
          return true;
        }
      }

      const removeResult = tryRemoveOne(inventory, itemId);
      if (!removeResult.ok) {
        setInventoryToast(plan, `使用失败：${removeResult.reason}`);
        return true;
      }

      addEffect(plan, Effects.set("player.inventory", removeResult.next));
      if (itemId === "doc_researcher_manuscript") {
        plan.profileIntents.push({ type: "xp", key: "experience", amount: 30, reason: "researcher_manuscript" });
        addEffect(plan, Effects.push("logLines", `你使用了 ${itemDef.name}`));
        if (findInventoryIndex(removeResult.next, itemId) < 0) {
          addEffect(plan, Effects.set("ui.invSelectedItemId", null));
        }
        setInventoryToast(plan, `已使用：${itemDef.name}`);
        return true;
      }

      const previewPlayer = JSON.parse(JSON.stringify(gameState?.player || {}));
      const intakeResult = applyConsumableEffectsToPlayer(previewPlayer, itemDef);
      if (intakeResult.playerStateChanged) {
        addEffect(plan, Effects.set("player.psycho.hp", intakeResult.hp));
        addEffect(plan, Effects.set("player.physio.satiety", intakeResult.satiety));
        addEffect(plan, Effects.set("player.physio.stamina", intakeResult.stamina));
        addEffect(plan, Effects.set("player.psycho.fatigue", intakeResult.fatigue));
        addEffect(plan, Effects.set("player.physio.temperatureC", intakeResult.temperatureC));
        addEffect(plan, Effects.set("player.physio.intakeLoad", intakeResult.intakeLoad));
        addEffect(plan, Effects.set("player.meta.statusEffects", intakeResult.statusEffects));
      }
      if (cooldownMinutes > 0) {
        addEffect(plan, Effects.set(`player.meta.itemUseCooldowns.${itemId}`, nowTotalMinutes));
      }
      addEffect(plan, Effects.push("logLines", `你使用了 ${itemDef.name}`));
      if (findInventoryIndex(removeResult.next, itemId) < 0) {
        addEffect(plan, Effects.set("ui.invSelectedItemId", null));
      }
      setInventoryToast(plan, `已使用：${itemDef.name}`);
      return true;
    }

    if (id.startsWith("inv_equip:")) {
      const itemId = id.slice("inv_equip:".length).trim();
      const itemDef = itemsById.get(itemId);
      if (!itemDef) {
        setInventoryToast(plan, "穿戴失败：物品不存在");
        return true;
      }

      if (isToolEquipItem(itemDef)) {
        const toolTag = itemDef.toolTag;
        const toolTagLabel = getToolTagLabel(toolTag);
        const existingTool = equippedTools.find((entry) => entry.toolTag === toolTag) || null;
        if (existingTool?.itemId === itemId) {
          setInventoryToast(plan, `【${itemDef.name}】已装备`);
          return true;
        }

        const removeResult = tryRemoveOne(inventory, itemId);
        if (!removeResult.ok) {
          setInventoryToast(plan, `装备失败：背包中没有【${itemDef.name}】`);
          return true;
        }

        let nextInventory = removeResult.next;
        if (existingTool?.itemId) {
          const addOld = tryAddItem(nextInventory, existingTool.itemId, 1, itemsById, getCapacityProfile(equipment, itemsById));
          if (!addOld.ok) {
            setInventoryToast(plan, `替换失败：${addOld.reason}`);
            return true;
          }
          nextInventory = addOld.next;
        }

        const nextEquippedTools = normalizeEquippedTools([
          ...equippedTools.filter((entry) => entry.toolTag !== toolTag),
          { itemId, toolTag }
        ]);

        addEffect(plan, Effects.set("player.inventory", nextInventory));
        addEffect(plan, Effects.set("player.equippedTools", nextEquippedTools));
        addEffect(plan, Effects.set("ui.invSelectedSlot", null));
        addEffect(plan, Effects.set("ui.invSelectedItemId", itemId));
        setInventoryToast(plan, existingTool?.itemId
          ? `已替换${toolTagLabel}工具：${itemDef.name}`
          : `已装备${toolTagLabel}工具：${itemDef.name}`);
        return true;
      }

      const slot = String(itemDef.equipSlot || "").trim();
      if (!EQUIPMENT_SLOT_ORDER.includes(slot)) {
        setInventoryToast(plan, `【${itemDef.name}】不可穿戴`);
        return true;
      }

      const selectedSlot = String(gameState?.ui?.invSelectedSlot || "").trim();
      if (selectedSlot && selectedSlot !== slot) {
        setInventoryToast(plan, `【${itemDef.name}】不属于 ${selectedSlot} 槽位`);
        return true;
      }

      const removeResult = tryRemoveOne(inventory, itemId);
      if (!removeResult.ok) {
        setInventoryToast(plan, `穿戴失败：背包中没有【${itemDef.name}】`);
        return true;
      }

      const nextEquipment = { ...equipment, [slot]: itemId };
      let nextInventory = removeResult.next;
      const oldItemId = equipment[slot];

      if (typeof oldItemId === "string" && oldItemId.trim()) {
        const addOld = tryAddItem(nextInventory, oldItemId, 1, itemsById, getCapacityProfile(nextEquipment, itemsById));
        if (!addOld.ok) {
          setInventoryToast(plan, `替换失败：${addOld.reason}`);
          return true;
        }
        nextInventory = addOld.next;
      }

      addEffect(plan, Effects.set("player.inventory", nextInventory));
      addEffect(plan, Effects.set("player.equipment", nextEquipment));
      addEffect(plan, Effects.set("ui.invSelectedSlot", slot));
      addEffect(plan, Effects.set("ui.invSelectedItemId", itemId));
      setInventoryToast(plan, `已穿上：${itemDef.name}`);
      return true;
    }

    if (id.startsWith("inv_unequip_tool:")) {
      const itemId = id.slice("inv_unequip_tool:".length).trim();
      const equippedEntry = equippedTools.find((entry) => entry.itemId === itemId) || null;
      if (!equippedEntry) {
        setInventoryToast(plan, "卸下失败：该工具未装备");
        return true;
      }

      const addResult = tryAddItem(inventory, itemId, 1, itemsById, getCapacityProfile(equipment, itemsById));
      if (!addResult.ok) {
        setInventoryToast(plan, `卸下失败：${addResult.reason}`);
        return true;
      }

      addEffect(plan, Effects.set("player.inventory", addResult.next));
      addEffect(plan, Effects.set("player.equippedTools", equippedTools.filter((entry) => entry.itemId !== itemId)));
      addEffect(plan, Effects.set("ui.invSelectedSlot", null));
      addEffect(plan, Effects.set("ui.invSelectedItemId", itemId));
      setInventoryToast(plan, `已卸下工具：${itemsById.get(itemId)?.name || itemId}`);
      return true;
    }

    if (id.startsWith("inv_unequip:")) {
      const slot = id.slice("inv_unequip:".length).trim();
      if (!EQUIPMENT_SLOT_ORDER.includes(slot)) {
        setInventoryToast(plan, `卸下失败：未知槽位 ${slot}`);
        return true;
      }

      const itemId = equipment[slot];
      if (typeof itemId !== "string" || !itemId.trim()) {
        setInventoryToast(plan, "该槽位没有装备");
        return true;
      }

      const nextEquipment = { ...equipment, [slot]: null };
      const alreadyOwned = findInventoryIndex(inventory, itemId) >= 0;
      if (!alreadyOwned) {
        const addResult = tryAddItem(inventory, itemId, 1, itemsById, getCapacityProfile(nextEquipment, itemsById));
        if (!addResult.ok) {
          setInventoryToast(plan, `卸下失败：${addResult.reason}`);
          return true;
        }
        addEffect(plan, Effects.set("player.inventory", addResult.next));
      }
      addEffect(plan, Effects.set("player.equipment", nextEquipment));
      addEffect(plan, Effects.set("ui.invSelectedSlot", slot));
      addEffect(plan, Effects.set("ui.invSelectedItemId", itemId));
      setInventoryToast(plan, `已卸下：${itemsById.get(itemId)?.name || itemId}`);
      return true;
    }
  }

  if (id === "sidebar_wait_confirm") {
    if (isDeadMode) return rejectByGate("门禁：DEAD 状态下禁止消磨时间");
    if (isCollapseMode) return rejectByGate("门禁：COLLAPSE 状态下禁止使用消磨时间");
    const n = Number.parseInt(payload?.minutes, 10);
    const minutes = Number.isFinite(n) ? Math.max(0, Math.min(720, n)) : 0;

    if (minutes <= 0) {
      addNote(plan, "sidebar_wait_confirm 分钟数<=0，忽略");
      return true;
    }

    addNote(plan, `侧边栏消磨时间：${minutes} 分钟`);
    const coverage = inferSidebarSessionCoverage(gameState);
    const margTransitionAdvanceContext = buildMargTransitionAdvanceContext({ gameState });
    addSysCall(plan, SYSCALL_TYPES.ADVANCE_TIME, {
      minutes,
      reason: "sidebar_wait_confirm",
      ctx: { isSleeping: false, sessionCoverage: coverage, ...margTransitionAdvanceContext }
    });
    return true;
  }

  return false;
}
