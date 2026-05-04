import { getAchievementDefById } from "../engine/achievement_defs.js";
import { createAchievementIconElement } from "./achievement_icon.js";
import { TRANSIENT_TIMING_PRESETS } from "./transient/transient_contract.js";
import { enqueueTransientIntent, registerTransientPresenter } from "./transient/transient_runtime.js";

export const ACHIEVEMENT_UNLOCK_TRANSIENT_TYPE = "achievement_unlock";

const ACHIEVEMENT_UNLOCK_TRANSIENT_TIMING = Object.freeze({
  inMs: 240,
  holdMs: 4000,
  outMs: 220
});

let didRegisterAchievementUnlockFeedback = false;

function getDocumentRoot() {
  return typeof document !== "undefined" ? document : null;
}

function normalizeAchievementUnlockPayload(payload = {}) {
  const achievementId = String(payload?.achievementId || "").trim();
  const definition = getAchievementDefById(achievementId) || null;
  const title = String(payload?.title || definition?.title || achievementId || "新成就").trim() || "新成就";
  return {
    achievementId,
    title,
    icon: String(payload?.icon || definition?.icon || "ship").trim() || "ship"
  };
}

function renderAchievementUnlockPresenter({ payload, itemRoot, documentRoot }) {
  const doc = documentRoot || getDocumentRoot();
  if (!doc || !itemRoot) return null;

  const presenterPayload = normalizeAchievementUnlockPayload(payload);
  itemRoot.classList.add("achievement-unlock-transient");

  const frame = doc.createElement("div");
  frame.className = "achievement-unlock-transient-frame";

  const iconShell = doc.createElement("div");
  iconShell.className = "achievement-unlock-transient-icon-shell";
  const iconEl = createAchievementIconElement(
    doc,
    presenterPayload.icon,
    "achievement-unlock-transient-icon",
    { achievementId: presenterPayload.achievementId }
  );
  if (iconEl) iconShell.appendChild(iconEl);

  const copy = doc.createElement("div");
  copy.className = "achievement-unlock-transient-copy";

  const title = doc.createElement("div");
  title.className = "achievement-unlock-transient-title";
  title.textContent = "恭喜获得新成就";

  const subtitle = doc.createElement("div");
  subtitle.className = "achievement-unlock-transient-subtitle";
  subtitle.textContent = presenterPayload.title;

  copy.appendChild(title);
  copy.appendChild(subtitle);
  frame.appendChild(iconShell);
  frame.appendChild(copy);
  itemRoot.appendChild(frame);

  return {
    signalTarget: frame
  };
}

export function ensureAchievementUnlockFeedbackRegistration() {
  if (didRegisterAchievementUnlockFeedback) return true;

  registerTransientPresenter(ACHIEVEMENT_UNLOCK_TRANSIENT_TYPE, {
    render: renderAchievementUnlockPresenter
  });

  didRegisterAchievementUnlockFeedback = true;
  return true;
}

export function enqueueAchievementUnlockFeedback(achievementId, options = {}) {
  const id = String(achievementId || "").trim();
  const definition = getAchievementDefById(id);
  if (!definition) return false;

  ensureAchievementUnlockFeedbackRegistration();
  const createdAt = Number.isFinite(Number(options?.createdAt)) ? Math.trunc(Number(options.createdAt)) : Date.now();

  enqueueTransientIntent({
    id: `achievement_unlock:${id}:${createdAt}`,
    type: ACHIEVEMENT_UNLOCK_TRANSIENT_TYPE,
    lane: "toast",
    priority: "high",
    createdAt,
    dedupeKey: `achievement_unlock:${id}`,
    timing: ACHIEVEMENT_UNLOCK_TRANSIENT_TIMING,
    payload: {
      achievementId: id,
      title: String(definition.title || id),
      icon: String(definition.icon || "ship")
    }
  });
  return true;
}