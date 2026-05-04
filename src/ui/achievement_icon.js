import { resolveAchievementIconAsset } from "./achievement_icon_registry.js";

function getShipIconMarkup(className = "") {
  const cls = className ? ` class="${String(className).trim()}"` : "";
  return `
    <svg${cls} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 15.5 12 6l8 9.5-1.5 2.5H5.5Z" fill="currentColor" opacity="0.22"></path>
      <path d="M12 4.5 8.7 9h2.1v4.1H6.4L4 17.4h16L17.6 13h-4.4V9h2.1L12 4.5Zm-5.2 14c1.2 0 1.9-.5 2.6-1 .7.5 1.4 1 2.6 1s1.9-.5 2.6-1c.7.5 1.4 1 2.6 1 1 0 1.6-.3 2.1-.6v1.5c-.5.3-1.2.6-2.1.6-1.2 0-1.9-.5-2.6-1-.7.5-1.4 1-2.6 1s-1.9-.5-2.6-1c-.7.5-1.4 1-2.6 1s-1.9-.5-2.6-1c-.7.5-1.4 1-2.6 1-.9 0-1.6-.3-2.1-.6V18c.5.3 1.1.5 2.1.5 1.2 0 1.9-.5 2.6-1 .7.5 1.4 1 2.6 1Z" fill="currentColor"></path>
    </svg>
  `;
}

function getImageIconMarkup(src, className = "") {
  const cls = className ? ` class="${String(className).trim()}"` : "";
  return `<img${cls} src="${String(src || "").trim()}" alt="" aria-hidden="true">`;
}

export function renderAchievementIconMarkup(iconId, className = "", options = {}) {
  const iconAsset = resolveAchievementIconAsset({
    achievementId: options?.achievementId,
    iconId
  });

  if (iconAsset.type === "image" && iconAsset.src) {
    return getImageIconMarkup(iconAsset.src, className);
  }

  const normalizedIconId = String(iconAsset.iconId || "ship").trim() || "ship";
  if (normalizedIconId === "ship") {
    return getShipIconMarkup(className);
  }
  return getShipIconMarkup(className);
}

export function createAchievementIconElement(documentRoot, iconId, className = "", options = {}) {
  const doc = documentRoot || (typeof document !== "undefined" ? document : null);
  if (!doc) return null;
  const iconAsset = resolveAchievementIconAsset({
    achievementId: options?.achievementId,
    iconId
  });
  const template = doc.createElement("template");
  template.innerHTML = renderAchievementIconMarkup(iconId, className, options).trim();
  const element = template.content.firstElementChild || null;
  if (!element) return null;
  if (options?.achievementId) {
    element.dataset.achievementId = String(options.achievementId).trim();
  }
  element.dataset.achievementIconKind = String(iconAsset.type || "svg").trim() || "svg";
  return element;
}