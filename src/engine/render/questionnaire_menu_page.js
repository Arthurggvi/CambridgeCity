import { attachQuestionnairePanelRuntime } from "../../ui/questionnaire_menu_controller.js";
import { escapeAttr, escapeHtml } from "./text_escape.js";

function encodeOptionValue(value) {
  return encodeURIComponent(JSON.stringify(value));
}

function renderQuestionHeader(question) {
  return `
    <div class="questionnaire-question__header">
      <div class="questionnaire-question__eyebrow">${escapeHtml(question.id)}</div>
      <div class="questionnaire-question__title-row">
        <h3 class="questionnaire-question__title">${escapeHtml(question.label)}</h3>
        ${question.required ? '<span class="questionnaire-question__required">必填</span>' : '<span class="questionnaire-question__optional">可选</span>'}
      </div>
    </div>
  `;
}

function resolveScaleOptionToneClass(index, total) {
  if (total <= 1) return " is-large";
  if (total === 2) return index === 0 ? " is-medium" : " is-large";
  if (total === 3) return index === 1 ? " is-medium" : " is-small";
  if (total === 4) return index === 1 || index === 2 ? " is-medium" : " is-small";

  const centerIndex = Math.floor(total / 2);
  if (index === centerIndex) return " is-large";
  if (Math.abs(index - centerIndex) === 1) return " is-medium";
  return " is-small";
}

function renderScaleQuestion(question) {
  const currentValue = Number(question.value);
  const optionCount = Array.isArray(question.options) ? question.options.length : 0;
  return `
    <div class="questionnaire-scale-grid" role="radiogroup" aria-label="${escapeAttr(question.label)}">
      ${question.options.map((option, index) => {
        const checked = Number(option.value) === currentValue;
        const toneClass = resolveScaleOptionToneClass(index, optionCount);
        return `
          <label class="questionnaire-option-card questionnaire-option-card--scale${toneClass}${checked ? " is-selected" : ""}">
            <input
              type="radio"
              name="question-${escapeAttr(question.id)}"
              value="${escapeAttr(encodeOptionValue(option.value))}"
              data-questionnaire-input="answer-choice"
              data-question-id="${escapeAttr(question.id)}"
              data-question-type="scale"
              ${checked ? "checked" : ""}
            />
            <span class="questionnaire-option-card__marker" aria-hidden="true"></span>
            <span class="questionnaire-option-card__value">${escapeHtml(String(option.value))}</span>
            <span class="questionnaire-option-card__label">${escapeHtml(String(option.label || option.value))}</span>
          </label>
        `;
      }).join("")}
    </div>
  `;
}

function renderSingleQuestion(question) {
  return `
    <div class="questionnaire-choice-list" role="radiogroup" aria-label="${escapeAttr(question.label)}">
      ${question.options.map((option) => {
        const checked = Object.is(question.value, option.value);
        return `
          <label class="questionnaire-choice-row${checked ? " is-selected" : ""}">
            <input
              type="radio"
              name="question-${escapeAttr(question.id)}"
              value="${escapeAttr(encodeOptionValue(option.value))}"
              data-questionnaire-input="answer-choice"
              data-question-id="${escapeAttr(question.id)}"
              data-question-type="single"
              ${checked ? "checked" : ""}
            />
            <span class="questionnaire-choice-row__label">${escapeHtml(String(option.label || option.value))}</span>
          </label>
        `;
      }).join("")}
    </div>
  `;
}

function renderMultiQuestion(question) {
  const currentValues = Array.isArray(question.value) ? question.value : [];
  return `
    <div class="questionnaire-choice-list" role="group" aria-label="${escapeAttr(question.label)}">
      ${question.options.map((option) => {
        const checked = currentValues.some((value) => Object.is(value, option.value));
        return `
          <label class="questionnaire-choice-row${checked ? " is-selected" : ""}" data-question-block="${escapeAttr(question.id)}">
            <input
              type="checkbox"
              value="${escapeAttr(encodeOptionValue(option.value))}"
              data-questionnaire-input="answer-choice"
              data-question-id="${escapeAttr(question.id)}"
              data-question-type="multi"
              ${checked ? "checked" : ""}
            />
            <span class="questionnaire-choice-row__label">${escapeHtml(String(option.label || option.value))}</span>
          </label>
        `;
      }).join("")}
    </div>
  `;
}

function renderTextQuestion(question) {
  return `
    <textarea
      class="questionnaire-textarea"
      data-questionnaire-input="answer-text"
      data-question-id="${escapeAttr(question.id)}"
      data-question-type="text"
      rows="${question.maxLength && question.maxLength > 600 ? 7 : 5}"
      maxlength="${question.maxLength || ""}"
      placeholder="${escapeAttr(question.placeholder || "")}" 
    >${escapeHtml(String(question.value || ""))}</textarea>
  `;
}

function renderBugReportQuestion(question) {
  const bugValue = question.value && typeof question.value === "object" ? question.value : {};
  return `
    <div class="questionnaire-bug-grid">
      ${question.fields.map((field) => `
        <label class="questionnaire-bug-field">
          <span class="questionnaire-bug-field__label">${escapeHtml(String(field.label || field.id))}</span>
          <textarea
            class="questionnaire-textarea questionnaire-textarea--bug"
            data-questionnaire-input="bug-report-field"
            data-question-id="${escapeAttr(question.id)}"
            data-question-type="bug_report"
            data-bug-field-id="${escapeAttr(String(field.id || ""))}"
            rows="${field.id === "steps" ? 6 : 3}"
            maxlength="${field.maxLength || ""}"
            placeholder="${escapeAttr(field.placeholder || "")}"
          >${escapeHtml(String(bugValue[field.id] || ""))}</textarea>
        </label>
      `).join("")}
    </div>
  `;
}

function renderQuestionBody(question) {
  if (question.type === "scale") return renderScaleQuestion(question);
  if (question.type === "single") return renderSingleQuestion(question);
  if (question.type === "multi") return renderMultiQuestion(question);
  if (question.type === "bug_report") return renderBugReportQuestion(question);
  return renderTextQuestion(question);
}

function renderQuestionCard(question) {
  return `
    <article class="questionnaire-question-card" data-question-block="${escapeAttr(question.id)}">
      ${renderQuestionHeader(question)}
      <div class="questionnaire-question__body">
        ${renderQuestionBody(question)}
      </div>
    </article>
  `;
}

function renderCreditsArchiveSections(infoSections) {
  return (Array.isArray(infoSections) ? infoSections : []).map((section) => `
    <section class="credits-page__archive-section">
      <h3 class="credits-page__section-title">${escapeHtml(String(section?.title || ""))}</h3>
      <dl class="credits-page__term-list">
        ${(Array.isArray(section?.entries) ? section.entries : []).map((entry) => `
          <dt class="credits-page__term">${escapeHtml(String(entry?.term || ""))}</dt>
          <dd class="credits-page__detail">${escapeHtml(String(entry?.detail || ""))}</dd>
        `).join("")}
      </dl>
    </section>
  `).join("");
}

export function renderQuestionnaireCreditsLanding(landing) {
  const infoSections = Array.isArray(landing?.infoSections) ? landing.infoSections : [];
  const projectSections = infoSections.slice(0, 2);
  const appendixSections = infoSections.slice(2);
  return `
    <div class="credits-page__body credits-page__body--landing">
      <div class="credits-page__archive-grid">
        <section class="credits-page__archive-card credits-page__archive-card--project">
          <div class="credits-page__archive-head">
            <div class="credits-page__archive-title">项目档案</div>
          </div>
          <div class="credits-page__archive-body">
            ${renderCreditsArchiveSections(projectSections)}
          </div>
        </section>
        <section class="credits-page__archive-card credits-page__archive-card--appendix">
          <div class="credits-page__archive-head">
            <div class="credits-page__archive-title">附录档案</div>
          </div>
          <div class="credits-page__archive-body">
            ${renderCreditsArchiveSections(appendixSections)}
          </div>
        </section>
      </div>
      <section class="credits-page__feedback-strip">
        <div class="credits-page__feedback-strip-copy">
          <h3 class="credits-page__section-title">${escapeHtml(String(landing?.feedback?.title || ""))}</h3>
          <p class="credits-page__feedback-description">${escapeHtml(String(landing?.feedback?.description || ""))}</p>
        </div>
        <div class="credits-page__feedback-strip-status">
          <div class="credits-page__feedback-status-item">
            <span class="credits-page__feedback-status-label">当前进度</span>
            <strong class="credits-page__feedback-status-value">${escapeHtml(String(landing?.feedback?.progressLabel || "0 / 0"))}</strong>
          </div>
          <div class="credits-page__feedback-status-item">
            <span class="credits-page__feedback-status-label">本地状态</span>
            <strong class="credits-page__feedback-status-value">${escapeHtml(String(landing?.feedback?.localStatusLabel || ""))}</strong>
          </div>
        </div>
        <div class="credits-page__feedback-strip-action">
          <button type="button" class="journal-action is-primary credits-page__feedback-button" data-local-action="questionnaire-open-credits">${escapeHtml(String(landing?.feedback?.entryLabel || "填写内测问卷"))}</button>
        </div>
      </section>
    </div>
  `;
}

export function renderQuestionnairePanel(pageViewModel, hostContainer) {
  const section = pageViewModel.currentSection;
  const sections = Array.isArray(pageViewModel.sections) ? pageViewModel.sections : [];
  const currentSectionIndex = sections.findIndex((entry) => entry.id === pageViewModel.currentSectionId);
  const previousSection = currentSectionIndex > 0 ? sections[currentSectionIndex - 1] : null;
  const nextSection = currentSectionIndex >= 0 && currentSectionIndex < sections.length - 1 ? sections[currentSectionIndex + 1] : null;
  const isFinalSection = !nextSection && currentSectionIndex >= 0;
  const canHighlightExport = isFinalSection || pageViewModel.status === "completed" || pageViewModel.progress.requiredMissingIds.length === 0;
  const progressPercent = Number(pageViewModel?.progress?.completionPercent || 0);
  hostContainer.innerHTML = `
    <section class="questionnaire-menu-shell questionnaire-menu-shell--form">
      <header class="questionnaire-form-topbar map-panel">
        <div class="questionnaire-form-topbar__main">
          <h1 class="questionnaire-form-topbar__title">${escapeHtml(String(pageViewModel.title || "内测问卷"))}</h1>
          <div class="questionnaire-form-topbar__progress">
            <span>${pageViewModel.progress.answeredCount} / ${pageViewModel.progress.totalCount}</span>
            <div class="questionnaire-form-topbar__meter" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, progressPercent))}%"></span></div>
          </div>
        </div>
        <div class="questionnaire-form-topbar__actions">
          <button type="button" class="journal-action is-secondary" data-local-action="questionnaire-save-draft" ${pageViewModel.busy ? "disabled" : ""}>保存草稿</button>
          <button type="button" class="journal-action is-secondary" data-local-action="questionnaire-return-credits" ${pageViewModel.busy ? "disabled" : ""}>返回概览</button>
        </div>
      </header>

      <div class="questionnaire-form-layout map-panel">
        <aside class="questionnaire-form-layout__nav" aria-label="问卷分组目录">
          <div class="questionnaire-form-layout__nav-list">
            ${sections.map((entry) => `
              <button
                type="button"
                class="questionnaire-section-tab${entry.isCurrent ? " is-current" : ""}"
                data-local-action="questionnaire-select-section"
                data-section-id="${escapeAttr(entry.id)}"
                aria-pressed="${entry.isCurrent ? "true" : "false"}"
              >
                <span class="questionnaire-section-tab__title">${escapeHtml(entry.title)}</span>
                <span class="questionnaire-section-tab__meta">${entry.answeredCount} / ${entry.questionCount}</span>
              </button>
            `).join("")}
          </div>
        </aside>
        <section class="questionnaire-form-layout__content">
          ${section ? `
            <div class="questionnaire-form-layout__scroll scrollPane" data-questionnaire-scroll-host data-section-id="${escapeAttr(section.id)}">
              ${section.questions.map((question) => renderQuestionCard(question)).join("")}
            </div>
          ` : '<div class="questionnaire-empty-state">当前没有可用问卷内容。</div>'}
        </section>
      </div>

      <footer class="questionnaire-form-footer map-panel">
        <div class="questionnaire-form-footer__nav">
          ${previousSection ? `
            <button
              type="button"
              class="journal-action is-secondary"
              data-local-action="questionnaire-select-section"
              data-section-id="${escapeAttr(previousSection.id)}"
              ${pageViewModel.busy ? "disabled" : ""}
            >上一节</button>
          ` : '<span class="questionnaire-form-footer__spacer" aria-hidden="true"></span>'}
          ${nextSection ? `
            <button
              type="button"
              class="journal-action is-secondary"
              data-local-action="questionnaire-select-section"
              data-section-id="${escapeAttr(nextSection.id)}"
              ${pageViewModel.busy ? "disabled" : ""}
            >下一节</button>
          ` : `
            <button
              type="button"
              class="journal-action${canHighlightExport ? " is-primary" : " is-secondary"}"
              data-local-action="questionnaire-export-complete"
              ${pageViewModel.busy ? "disabled" : ""}
            >完成并导出</button>
          `}
        </div>
        <div class="questionnaire-form-footer__actions">
          <button type="button" class="journal-action is-secondary" data-local-action="questionnaire-save-draft" ${pageViewModel.busy ? "disabled" : ""}>保存草稿</button>
          <button type="button" class="journal-action is-secondary" data-local-action="questionnaire-return-credits" ${pageViewModel.busy ? "disabled" : ""}>返回概览</button>
          <button type="button" class="questionnaire-form-footer__danger" data-local-action="questionnaire-clear-draft" ${pageViewModel.busy ? "disabled" : ""}>清空草稿</button>
        </div>
      </footer>
    </section>
  `;
  attachQuestionnairePanelRuntime(hostContainer);
}