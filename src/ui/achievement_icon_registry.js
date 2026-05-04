const FAR_WINTER_DEPARTURE_ICON_URL = new URL("../../icon/far_winter_departure_centered_128.png", import.meta.url).href;
const ACHIEVEMENT_MONEY_ICON_URL = new URL("../../icon/achievement_money_icon_128.png", import.meta.url).href;
const ACHIEVEMENT_SPRING_RETURN_ICON_URL = new URL("../../icon/spring_return_icon_recrop_128.png", import.meta.url).href;

const ACHIEVEMENT_IMAGE_ICON_REGISTRY = Object.freeze({
  ach_farwinter_farewell: Object.freeze({
    iconId: "ship",
    type: "image",
    src: FAR_WINTER_DEPARTURE_ICON_URL
  }),
  ach_money_millionaire: Object.freeze({
    iconId: "ship",
    type: "image",
    src: ACHIEVEMENT_MONEY_ICON_URL
  }),
  ach_spring_return: Object.freeze({
    iconId: "ship",
    type: "image",
    src: ACHIEVEMENT_SPRING_RETURN_ICON_URL
  })
});

export function resolveAchievementIconAsset({ achievementId, iconId } = {}) {
  const normalizedAchievementId = String(achievementId || "").trim();
  const normalizedIconId = String(iconId || "ship").trim() || "ship";
  const mappedAsset = normalizedAchievementId
    ? ACHIEVEMENT_IMAGE_ICON_REGISTRY[normalizedAchievementId] || null
    : null;

  if (mappedAsset && mappedAsset.iconId === normalizedIconId) {
    return mappedAsset;
  }

  return {
    type: "svg",
    iconId: normalizedIconId
  };
}