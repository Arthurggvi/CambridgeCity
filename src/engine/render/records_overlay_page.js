import { escapeHtml } from "./text_escape.js";

function withRevealAttrs(className, index) {
  const classes = [className, "records-panel-detail-reveal"].filter(Boolean).join(" ");
  return `class="${classes}" style="--records-reveal-index:${Math.max(0, Number(index) || 0)}"`;
}

function renderTags(tags) {
  const items = Array.isArray(tags) ? tags : [];
  if (items.length === 0) return "";
  return items
    .map((tag) => `<span class="records-panel-tag">${escapeHtml(String(tag || ""))}</span>`)
    .join("");
}

function renderParagraphs(text, attrsBuilder = null) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const attrs = typeof attrsBuilder === "function"
        ? attrsBuilder("records-panel-paragraph")
        : 'class="records-panel-paragraph"';
      return `<p ${attrs}>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

function renderSources(sources, attrsBuilder = null) {
  const items = Array.isArray(sources) ? sources : [];
  if (items.length === 0) return "";
  const rows = items.map((source) => {
    const label = escapeHtml(String(source?.label || ""));
    const org = String(source?.org || "").trim();
    const type = String(source?.type || "").trim();
    const note = String(source?.note || "").trim();
    const metaParts = [org, type].filter(Boolean).map((value) => escapeHtml(value));
    const metaHtml = metaParts.length > 0
      ? `<div class="records-panel-source-meta">${metaParts.join(" · ")}</div>`
      : "";
    const noteHtml = note
      ? `<div class="records-panel-source-note">${escapeHtml(note)}</div>`
      : "";
    const attrs = typeof attrsBuilder === "function"
      ? attrsBuilder("records-panel-source-item")
      : 'class="records-panel-source-item"';
    return `<li ${attrs}><div class="records-panel-source-label">${label}</div>${metaHtml}${noteHtml}</li>`;
  }).join("");
  return `<ul class="records-panel-sources">${rows}</ul>`;
}

function renderReferences(references, attrsBuilder = null) {
  const items = Array.isArray(references) ? references : [];
  if (items.length === 0) return "";
  const rows = items.map((reference) => {
    const label = escapeHtml(String(reference?.source || ""));
    const excerpts = Array.isArray(reference?.excerpts) ? reference.excerpts : [];
    const swapEnabled = String(reference?.displayMode || "") === "hover-translation-swap";
    const excerptsHtml = excerpts.map((excerpt) => {
      const original = String(excerpt?.original || "").trim();
      const translation = String(excerpt?.translation || "").trim();
      const note = String(excerpt?.note || "").trim();
      if (!original && !translation && !note) return "";
      if (swapEnabled && original && translation) {
        return `
          <div class="record-ref-excerpt records-reference-excerpt" tabindex="0">
            <div class="record-ref-excerpt-original records-reference-excerpt-inner records-reference-excerpt-original">${escapeHtml(original)}</div>
            <div class="record-ref-excerpt-translation records-reference-excerpt-inner records-reference-excerpt-translation">${escapeHtml(translation)}</div>
          </div>
        `;
      }
      const primary = original || translation;
      const noteHtml = note
        ? `<div class="records-panel-source-note">${escapeHtml(note)}</div>`
        : "";
      return `<div class="record-ref-excerpt records-reference-excerpt"><div class="record-ref-excerpt-original records-reference-excerpt-inner records-reference-excerpt-original">${escapeHtml(primary)}</div>${noteHtml}</div>`;
    }).filter(Boolean).join("");
    const attrs = typeof attrsBuilder === "function"
      ? attrsBuilder("records-reference-source")
      : 'class="records-reference-source"';
    const excerptListHtml = excerptsHtml
      ? `<div class="records-reference-source-body">${excerptsHtml}</div>`
      : "";
    return `<section ${attrs}><div class="records-reference-source-tag">${label}</div>${excerptListHtml}</section>`;
  }).join("");
  return `<div class="records-reference-section">${rows}</div>`;
}

function renderTreeRecordItem(item, selectedRecordId) {
  const selected = String(item?.recordId || "") === String(selectedRecordId || "");
  const selectedClass = selected ? " is-selected" : "";
  return `
    <button
      type="button"
      class="records-panel-tree-item${selectedClass}"
      data-local-action="records-select-record"
      data-record-id="${escapeHtml(String(item?.recordId || ""))}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      <span class="records-panel-tree-item-title">${escapeHtml(String(item?.title || ""))}</span>
    </button>
  `;
}

function renderList(viewModel) {
  const recordGroups = Array.isArray(viewModel?.recordGroups) ? viewModel.recordGroups : [];
  if (recordGroups.length === 0) {
    return '<div class="records-panel-list-empty" aria-live="polite"></div>';
  }

  const groupsHtml = recordGroups.map((group) => {
    const groupId = String(group?.groupId || "");
    const items = Array.isArray(group?.items) ? group.items : [];
    const expanded = group?.expanded !== false;
    const expandedClass = expanded ? " is-expanded" : "";
    const treeHtml = expanded
      ? `<div class="records-panel-group-children" role="group" aria-label="${escapeHtml(String(group?.label || ""))}">${items.map((item) => renderTreeRecordItem(item, viewModel?.selectedRecordId)).join("")}</div>`
      : "";
    return `
      <section class="records-panel-group${expandedClass}">
        <button
          type="button"
          class="records-panel-group-toggle${expandedClass}"
          data-records-group-toggle="${escapeHtml(groupId)}"
          aria-expanded="${expanded ? "true" : "false"}"
        >
          <span class="records-panel-group-toggle-icon" aria-hidden="true"></span>
          <span class="records-panel-group-label">${escapeHtml(String(group?.label || "未归档区域"))}</span>
          <span class="records-panel-group-count">${items.length}</span>
        </button>
        ${treeHtml}
      </section>
    `;
  }).join("");

  return `<div class="records-panel-tree">${groupsHtml}</div>`;
}

function renderDetail(viewModel) {
  const detailResult = viewModel?.detailResult;
  if (!detailResult || detailResult.ok !== true || !detailResult.view) {
    return '<div class="records-panel-detail-empty" aria-hidden="true"></div>';
  }

  const detail = detailResult.view;
  const detailRecordId = escapeHtml(String(detail?.recordId || detailResult?.recordId || ""));
  const regionLabel = String(detail?.uiMeta?.regionLabel || "").trim();
  let revealIndex = 0;
  const nextRevealAttrs = (className = "") => withRevealAttrs(className, revealIndex++);
  const hasGroupedReferences = Array.isArray(detail?.references) && detail.references.length > 0;
  const scienceBlock = !hasGroupedReferences && (String(detail?.scienceTitle || "").trim() || String(detail?.scienceBody || "").trim())
    ? `
      <section class="records-panel-section">
        <div ${nextRevealAttrs("records-panel-section-label")}>参考</div>
        <h3 ${nextRevealAttrs("records-panel-section-title")}>${escapeHtml(String(detail?.scienceTitle || ""))}</h3>
        ${renderParagraphs(detail?.scienceBody, nextRevealAttrs)}
      </section>
    `
    : "";
  const referenceContent = hasGroupedReferences
    ? renderReferences(detail.references, nextRevealAttrs)
    : renderSources(detail.sources, nextRevealAttrs);
  const sourcesBlock = referenceContent
    ? `
      <section class="records-panel-section records-panel-section-reference">
        <div ${nextRevealAttrs("records-panel-section-label")}>参考</div>
        <div ${nextRevealAttrs("records-reference-divider")}></div>
        ${referenceContent}
      </section>
    `
    : "";

  return `
    <article class="records-panel-detail-card" data-record-id="${detailRecordId}">
      <div class="records-panel-detail-head">
        <div ${nextRevealAttrs("records-panel-detail-kicker")}>${escapeHtml(regionLabel || String(detail?.category || "记录"))}</div>
        <h2 ${nextRevealAttrs("records-panel-detail-title")}>${escapeHtml(String(detail?.title || ""))}</h2>
        <div ${nextRevealAttrs("records-panel-detail-summary")}>${escapeHtml(String(detail?.summary || ""))}</div>
        <div ${nextRevealAttrs("records-panel-detail-meta-row")}>
          <span class="records-panel-detail-category">${escapeHtml(String(detail?.category || "记录"))}</span>
        </div>
        <div ${nextRevealAttrs("records-panel-detail-tags")}>${renderTags(detail?.tags)}</div>
      </div>
      <section class="records-panel-section">
        <div ${nextRevealAttrs("records-panel-section-label")}>正文</div>
        ${renderParagraphs(detail?.body, nextRevealAttrs)}
      </section>
      ${scienceBlock}
      ${sourcesBlock}
    </article>
  `;
}

function renderDetailContent(viewModel, animated = false) {
  const detailResult = viewModel?.detailResult;
  const detailRecordId = String(detailResult?.recordId || detailResult?.view?.recordId || "").trim();
  const animatedClass = animated ? " is-record-switch-enter" : "";
  const recordAttr = escapeHtml(detailRecordId);
  return `<div class="records-panel-detail-content${animatedClass}" data-detail-record-id="${recordAttr}">${renderDetail(viewModel)}</div>`;
}

function ensureRecordsOverlayScaffold(hostContainer) {
  let overlay = hostContainer.querySelector(".records-panel-overlay");
  if (overlay) return overlay;

  hostContainer.innerHTML = `
    <div class="records-panel-overlay" role="presentation">
      <div class="records-panel-backdrop" data-ui-action="records-backdrop-close"></div>
      <section class="records-panel-dialog" role="dialog" aria-modal="true" aria-labelledby="records-panel-title">
        <header class="records-panel-header">
          <div class="records-panel-title" id="records-panel-title">记录</div>
          <button type="button" class="records-panel-close" data-ui-action="records-close" aria-label="关闭记录面板">×</button>
        </header>
        <div class="records-panel-body">
          <aside class="records-panel-list scrollPane" aria-label="已解锁记录目录"></aside>
          <section class="records-panel-detail scrollPane" aria-label="记录详情">
            <div class="records-panel-detail-shell"></div>
          </section>
        </div>
      </section>
    </div>
  `;
  overlay = hostContainer.querySelector(".records-panel-overlay");
  return overlay;
}

export function renderRecordsOverlayPage(viewModel, hostContainer) {
  if (!hostContainer) return;
  ensureRecordsOverlayScaffold(hostContainer);

  const listHost = hostContainer.querySelector(".records-panel-list");
  if (listHost) {
    listHost.innerHTML = renderList(viewModel);
  }

  const detailShell = hostContainer.querySelector(".records-panel-detail-shell");
  if (detailShell) {
    const nextRecordId = String(viewModel?.detailResult?.recordId || viewModel?.detailResult?.view?.recordId || "").trim();
    const currentContent = detailShell.querySelector(".records-panel-detail-content");
    const currentRecordId = String(currentContent?.dataset?.detailRecordId || "").trim();
    const shouldAnimateSwitch = !!currentContent && !!nextRecordId && currentRecordId !== nextRecordId;
    detailShell.innerHTML = renderDetailContent(viewModel, shouldAnimateSwitch);
  }
}