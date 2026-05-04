export async function handleSocialUiActions(ctx) {
  const {
    id,
    payload,
    plan,
    gameState,
    addEffect,
    addSocialIntent,
    addNote,
    Effects
  } = ctx;

  const isDeadMode = gameState?.player?.exposure?.dead === true;
  const isCollapseMode = String(gameState?.player?.meta?.sleepEpisode?.mode || "").toUpperCase() === "COLLAPSE";
  const isCriticalMode = isDeadMode || isCollapseMode;
  const rejectByGate = (reason) => {
    addNote(plan, reason);
    return true;
  };

  if (id === "ui_social_open") {
    if (isCriticalMode) return rejectByGate("门禁：DEAD/COLLAPSE 状态下禁止打开人际档案");
    addEffect(plan, Effects.set("ui.page", "map"));
    addEffect(plan, Effects.set("ui.overlay", null));
    addEffect(plan, Effects.set("ui.profileOpen", false));
    addEffect(plan, Effects.set("ui.recordsOpen", false));
    addEffect(plan, Effects.set("ui.socialOpen", true));
    addNote(plan, "打开人际档案");
    return true;
  }

  if (id === "ui_social_close") {
    addEffect(plan, Effects.set("ui.socialOpen", false));
    addNote(plan, "关闭人际档案");
    return true;
  }

  if (id === "ui_social_toggle_favorite") {
    if (isCriticalMode) return rejectByGate("门禁：DEAD/COLLAPSE 状态下禁止操作人际档案收藏");
    const npcId = String(payload?.npcId || "").trim();
    if (!npcId) {
      addNote(plan, "人际收藏切换缺少 npcId，已忽略");
      return true;
    }
    const currentValue = gameState?.player?.social?.byNpcId?.[npcId]?.flags?.isFavorited === true;
    addSocialIntent(plan, {
      type: "set_social_flag",
      npcId,
      flagId: "isFavorited",
      value: !currentValue,
      reason: "ui_social_toggle_favorite"
    });
    addNote(plan, `${currentValue ? "取消收藏" : "收藏"}人物：${npcId}`);
    return true;
  }

  return false;
}