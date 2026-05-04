import { getAchievementState } from "../engine/achievement_store.js";
import { createAchievementIconElement } from "./achievement_icon.js";
import { buildAchievementPageViewModel } from "./achievement_page_view_model.js";
import { showNoticeDialog } from "./dialogs.js";

function createElement(doc, tagName, className = "", textContent = "") {
  const element = doc.createElement(tagName);
  if (className) element.className = className;
  if (typeof textContent === "string" && textContent.length > 0) {
    element.textContent = textContent;
  }
  return element;
}

function renderDescriptionLines(doc, host, lines) {
  host.replaceChildren();
  const items = Array.isArray(lines) && lines.length > 0 ? lines : ["——"];
  for (const line of items) {
    host.appendChild(createElement(doc, "p", "achievement-body-panel__paragraph", String(line || "——")));
  }
}

function createAchievementPageIconCarrier(doc, carrierClass, iconId, mediaClass, achievementId, unlocked = false) {
  const carrier = createElement(doc, "div", carrierClass);
  carrier.classList.add(unlocked === true ? "is-unlocked" : "is-locked");
  const icon = createAchievementIconElement(doc, iconId, mediaClass, { achievementId });
  if (icon) carrier.appendChild(icon);
  return carrier;
}

function createArchiveRailView(doc, onSelect) {
  const section = createElement(doc, "aside", "achievement-archive-rail");
  section.setAttribute("aria-label", "成就索引栏");

  const header = createElement(doc, "header", "achievement-archive-rail__header");
  const title = createElement(doc, "h2", "achievement-archive-rail__title");
  header.appendChild(title);

  const stats = createElement(doc, "dl", "achievement-archive-rail__stats");
  const statRows = [];
  for (let index = 0; index < 2; index += 1) {
    const row = createElement(doc, "div", "achievement-archive-rail__stat-row");
    const label = createElement(doc, "dt", "achievement-archive-rail__stat-label");
    const value = createElement(doc, "dd", "achievement-archive-rail__stat-value");
    row.appendChild(label);
    row.appendChild(value);
    stats.appendChild(row);
    statRows.push({ label, value });
  }

  const list = createElement(doc, "div", "achievement-archive-rail__list");
  list.setAttribute("role", "list");

  section.appendChild(header);
  section.appendChild(stats);
  section.appendChild(list);

  return {
    element: section,
    render(archiveRail) {
      title.textContent = String(archiveRail?.title || "");
      const statsList = Array.isArray(archiveRail?.stats) ? archiveRail.stats : [];
      statRows.forEach((row, index) => {
        const stat = statsList[index] || {};
        row.label.textContent = String(stat.label || "");
        row.value.textContent = String(stat.value || "");
        row.value.classList.toggle("achievement-page__mono", stat.mono === true);
      });

      list.replaceChildren();
      for (const item of Array.isArray(archiveRail?.items) ? archiveRail.items : []) {
        const button = createElement(doc, "button", "achievement-archive-rail__item");
        button.type = "button";
        button.dataset.achievementId = String(item.id || "");
        button.classList.toggle("is-selected", item.selected === true);
        button.classList.toggle("is-unlocked", item.unlocked === true);
        button.classList.toggle("is-locked", item.unlocked !== true);
        button.setAttribute("aria-pressed", item.selected === true ? "true" : "false");
        button.setAttribute("aria-label", `${String(item.title || item.id || "成就")}，${item.unlocked === true ? "已归档" : "待归档"}`);

        const code = createElement(doc, "div", "achievement-archive-rail__item-code achievement-page__mono", String(item.archiveCode || ""));
        const iconShell = createElement(doc, "div", "achievement-archive-rail__item-icon");
        iconShell.appendChild(createAchievementPageIconCarrier(
          doc,
          "achievement-page__icon-carrier achievement-page__icon-carrier--rail",
          item.icon,
          "achievement-archive-rail__item-icon-media",
          item.id,
          item.unlocked === true
        ));
        const textStack = createElement(doc, "div", "achievement-archive-rail__item-copy");
        textStack.appendChild(createElement(doc, "div", "achievement-archive-rail__item-title", String(item.title || "未命名成就")));
        textStack.appendChild(createElement(doc, "div", "achievement-archive-rail__item-state", String(item.stateLabel || "待归档")));

        button.appendChild(code);
        button.appendChild(iconShell);
        button.appendChild(textStack);
        button.addEventListener("click", () => onSelect(String(item.id || "").trim() || null));
        list.appendChild(button);
      }
    },
    getFocusableElement() {
      return list.querySelector(".achievement-archive-rail__item.is-selected") || list.querySelector(".achievement-archive-rail__item") || null;
    }
  };
}

function createHeroSectionView(doc, onClose) {
  const section = createElement(doc, "section", "achievement-hero-section");
  section.setAttribute("aria-label", "成就主展示区");

  const badge = createElement(doc, "div", "achievement-hero-section__badge");

  const titleGroup = createElement(doc, "div", "achievement-hero-section__title-group");
  const status = createElement(doc, "div", "achievement-hero-section__status");
  const archiveCode = createElement(doc, "div", "achievement-hero-section__code achievement-page__mono");
  const title = createElement(doc, "h3", "achievement-hero-section__title");
  const meta = createElement(doc, "div", "achievement-hero-section__meta");
  const metaViews = [];
  for (let index = 0; index < 2; index += 1) {
    const item = createElement(doc, "div", "achievement-hero-section__meta-item");
    const label = createElement(doc, "span", "achievement-hero-section__meta-label");
    const value = createElement(doc, "span", "achievement-hero-section__meta-value");
    item.appendChild(label);
    item.appendChild(value);
    meta.appendChild(item);
    metaViews.push({ label, value });
  }
  titleGroup.appendChild(status);
  titleGroup.appendChild(archiveCode);
  titleGroup.appendChild(title);
  titleGroup.appendChild(meta);

  const closeButton = createElement(doc, "button", "achievement-hero-section__close", "×");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "关闭成就弹窗");
  closeButton.addEventListener("click", () => onClose("close"));

  section.appendChild(badge);
  section.appendChild(titleGroup);
  section.appendChild(closeButton);

  return {
    element: section,
    closeButton,
    render(heroSection) {
      status.textContent = String(heroSection?.status || "待归档");
      archiveCode.textContent = String(heroSection?.archiveCode || "");
      title.textContent = String(heroSection?.title || "未命名成就");
      const metaItems = Array.isArray(heroSection?.metaItems) ? heroSection.metaItems : [];
      metaViews.forEach((view, index) => {
        const item = metaItems[index] || {};
        view.label.textContent = String(item.label || "");
        view.value.textContent = String(item.value || "");
        view.value.classList.toggle("achievement-page__mono", item.mono === true);
      });
      badge.replaceChildren();
      badge.appendChild(createAchievementPageIconCarrier(
        doc,
        "achievement-page__icon-carrier achievement-page__icon-carrier--hero",
        heroSection?.icon,
        "achievement-hero-section__badge-media",
        heroSection?.achievementId,
        heroSection?.unlocked === true
      ));
      badge.classList.toggle("is-locked", heroSection?.unlocked !== true);
    }
  };
}

function createBodyPanelView(doc) {
  const section = createElement(doc, "section", "achievement-body-panel");
  section.setAttribute("aria-label", "成就档案说明");
  const label = createElement(doc, "div", "achievement-body-panel__label", "档案说明");
  const copy = createElement(doc, "div", "achievement-body-panel__copy");
  section.appendChild(label);
  section.appendChild(copy);

  return {
    element: section,
    render(bodyPanel) {
      renderDescriptionLines(doc, copy, bodyPanel?.paragraphs);
    }
  };
}

export function openAchievementMenuDialog(options = {}) {
  const achievementsState = options?.achievementsState ?? getAchievementState();
  return showNoticeDialog({
    title: "成就",
    message: "",
    visualVariant: "achievement-panel",
    actions: [],
    modalGuards: {
      closeOnEscape: false,
      closeOnPointerDownOutside: false
    },
    customRenderer: ({ documentRoot, card, requestClose }) => {
      const doc = documentRoot || document;
      let selectedAchievementId = null;

      const root = createElement(doc, "section", "achievement-page-shell");
      root.setAttribute("aria-live", "polite");

      const archiveRailView = createArchiveRailView(doc, (achievementId) => renderFromSelection(achievementId));
      const heroSectionView = createHeroSectionView(doc, requestClose);
      const bodyPanelView = createBodyPanelView(doc);

      root.appendChild(archiveRailView.element);
      root.appendChild(heroSectionView.element);
      root.appendChild(bodyPanelView.element);
      card.appendChild(root);

      function renderFromSelection(nextSelectedAchievementId = selectedAchievementId) {
        const viewModel = buildAchievementPageViewModel({
          achievementsState,
          selectedAchievementId: nextSelectedAchievementId
        });
        selectedAchievementId = viewModel.state.selectedAchievementId;
        archiveRailView.render(viewModel.archiveRail);
        heroSectionView.render(viewModel.heroSection);
        bodyPanelView.render(viewModel.bodyPanel);
      }

      renderFromSelection(null);

      const initialFocus = archiveRailView.getFocusableElement() || heroSectionView.closeButton;
      return {
        closeBtn: heroSectionView.closeButton,
        initialFocus
      };
    }
  });
}