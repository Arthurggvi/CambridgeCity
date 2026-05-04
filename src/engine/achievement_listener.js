import { subscribeSignal } from "./achievement_signal_bus.js";
import { unlockAchievement } from "./achievement_store.js";
import { enqueueAchievementUnlockFeedback } from "../ui/achievement_unlock_feedback.js";

const SIGNAL_TO_ACHIEVEMENT_ID = Object.freeze({
  theseus_departure_complete: "ach_farwinter_farewell",
  money_million_reached: "ach_money_millionaire",
  cambcity_november_reached: "ach_spring_return"
});

let _registered = false;

function handleAchievementSignal(event) {
  const signal = event?.signal;
  if (!signal || signal.type !== "achievement.signal") return;
  const key = String(signal.key || "").trim();
  if (!key) return;
  const achievementId = SIGNAL_TO_ACHIEVEMENT_ID[key] || null;
  if (!achievementId) return;
  const result = unlockAchievement(achievementId);
  if (result?.reason === "first_unlock") {
    enqueueAchievementUnlockFeedback(result.achievementId, {
      createdAt: Date.now()
    });
  }
}

export function ensureAchievementListenerRegistration() {
  if (_registered) return;
  subscribeSignal(handleAchievementSignal);
  _registered = true;
}