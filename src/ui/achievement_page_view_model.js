import { ACHIEVEMENT_ORDER, getAchievementDefById } from "../engine/achievement_defs.js";
import { normalizeAchievementState } from "../engine/achievement_store.js";

function formatArchiveTime(isoString) {
  const raw = String(isoString || "").trim();
  if (!raw) return "未归档";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const yyyy = String(parsed.getFullYear());
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  const hh = String(parsed.getHours()).padStart(2, "0");
  const mi = String(parsed.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}

function formatArchiveCode(index) {
  const serial = Number.isInteger(index) && index >= 0 ? index + 1 : 0;
  return `CCA-ACH-${String(serial).padStart(2, "0")}`;
}

function buildArchiveParagraphs(definition, entry) {
  if (entry?.unlocked !== true) {
    return Object.freeze(["达成本成就后解锁"]);
  }

  if (definition?.id === "ach_money_millionaire") {
    return Object.freeze([
      "“管家，我的钱去哪儿了？！”"
    ]);
  }

  if (definition?.id === "ach_spring_return") {
    return Object.freeze([
      "迎着轮船的呼啸，再度城市的第二春"
    ]);
  }

  return Object.freeze([
    "恭喜告别凛冬！",
    "感谢您的游玩！"
  ]);
}

function buildArchiveItems(achievementsState, selectedAchievementId) {
  return ACHIEVEMENT_ORDER
    .map((achievementId, index) => {
      const definition = getAchievementDefById(achievementId);
      if (!definition) return null;
      const entry = achievementsState[achievementId] || null;
      const unlocked = entry?.unlocked === true;
      return {
        id: achievementId,
        archiveCode: formatArchiveCode(index),
        title: String(definition.title || definition.subtitle || achievementId),
        icon: String(definition.icon || "ship"),
        unlocked,
        selected: achievementId === selectedAchievementId,
        stateLabel: unlocked ? "已归档" : "待归档"
      };
    })
    .filter(Boolean);
}

function buildActiveRecord(achievementsState, selectedAchievementId) {
  const definition = getAchievementDefById(selectedAchievementId);
  const index = ACHIEVEMENT_ORDER.indexOf(selectedAchievementId);
  const entry = definition ? achievementsState[selectedAchievementId] || null : null;
  if (!definition) {
    return Object.freeze({
      id: null,
      archiveCode: formatArchiveCode(0),
      title: "未命名成就",
      icon: "ship",
      unlocked: false,
      requirementText: "——",
      collectedAtText: "未归档",
      bodyParagraphs: Object.freeze(["档案页尚未载入可显示的成就记录。"])
    });
  }

  return Object.freeze({
    id: definition.id,
    archiveCode: formatArchiveCode(index),
    title: String(definition.title || definition.subtitle || definition.id),
    icon: String(definition.icon || "ship"),
    unlocked: entry?.unlocked === true,
    requirementText: String(definition.requirementText || "——"),
    collectedAtText: formatArchiveTime(entry?.unlockedAtSystemTime),
    bodyParagraphs: Array.from(buildArchiveParagraphs(definition, entry))
  });
}

export function buildAchievementPageViewModel({ achievementsState, selectedAchievementId = null } = {}) {
  const normalizedState = normalizeAchievementState(achievementsState);
  const fallbackId = ACHIEVEMENT_ORDER[0] || null;
  const firstUnlockedId = ACHIEVEMENT_ORDER.find((achievementId) => normalizedState[achievementId]?.unlocked === true) || null;
  const effectiveSelectedId = selectedAchievementId && ACHIEVEMENT_ORDER.includes(selectedAchievementId)
    ? selectedAchievementId
    : (firstUnlockedId || fallbackId);

  const archiveItems = buildArchiveItems(normalizedState, effectiveSelectedId);
  const activeRecord = buildActiveRecord(normalizedState, effectiveSelectedId);
  const unlockedCount = archiveItems.filter((item) => item.unlocked === true).length;

  return Object.freeze({
    archiveRail: Object.freeze({
      title: "成就档案",
      stats: Object.freeze([
        Object.freeze({ label: "归档件数", value: `${String(unlockedCount).padStart(2, "0")} / ${String(archiveItems.length).padStart(2, "0")}`, mono: true }),
        Object.freeze({ label: "当前件号", value: activeRecord.archiveCode, mono: true })
      ]),
      items: Object.freeze(archiveItems)
    }),
    heroSection: Object.freeze({
      achievementId: activeRecord.id,
      status: activeRecord.unlocked ? "已归档" : "待归档",
      archiveCode: activeRecord.archiveCode,
      title: activeRecord.title,
      icon: activeRecord.icon,
      unlocked: activeRecord.unlocked,
      metaItems: Object.freeze([
        Object.freeze({ label: "达成条件", value: activeRecord.requirementText, mono: false }),
        Object.freeze({ label: "收集时间", value: activeRecord.collectedAtText, mono: true })
      ])
    }),
    bodyPanel: Object.freeze({
      paragraphs: Object.freeze(activeRecord.bodyParagraphs)
    }),
    state: Object.freeze({
      selectedAchievementId: effectiveSelectedId
    })
  });
}