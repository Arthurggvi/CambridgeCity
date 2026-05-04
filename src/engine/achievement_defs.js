export const ACHIEVEMENT_DEFS = Object.freeze({
  ach_farwinter_farewell: Object.freeze({
    id: "ach_farwinter_farewell",
    icon: "ship",
    subtitle: "远冬别离",
    title: "远冬别离",
    descriptionLines: Object.freeze([
      "恭喜走出暴雪！",
      "感谢你的游玩体验！"
    ]),
    requirementText: "登上忒修斯号离开寒武城"
  }),
  ach_money_millionaire: Object.freeze({
    id: "ach_money_millionaire",
    icon: "ship",
    subtitle: "腰缠万贯",
    title: "腰缠万贯",
    descriptionLines: Object.freeze([
      "你已经积累起惊人的财富。"
    ]),
    requirementText: "拥有 1,000,000 货币时解锁"
  }),
  ach_spring_return: Object.freeze({
    id: "ach_spring_return",
    icon: "ship",
    subtitle: "春回大地",
    title: "春回大地",
    descriptionLines: Object.freeze([
      "迎着轮船的呼啸，再度城市的第二春"
    ]),
    requirementText: "在寒武城生存直到 11 月"
  })
});

export const ACHIEVEMENT_ORDER = Object.freeze([
  "ach_farwinter_farewell",
  "ach_money_millionaire",
  "ach_spring_return"
]);

export function getAchievementDefById(achievementId) {
  const id = String(achievementId || "").trim();
  return ACHIEVEMENT_DEFS[id] || null;
}

export function listAchievementDefs() {
  return ACHIEVEMENT_ORDER
    .map((achievementId) => ACHIEVEMENT_DEFS[achievementId] || null)
    .filter(Boolean);
}