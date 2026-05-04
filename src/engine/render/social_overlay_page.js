import { escapeHtml } from "./text_escape.js";

function renderFavoriteIcon(isFavorited) {
  return `
    <svg class="social-archive-index-favorite-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.27 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.77-3.4 6.86-8.55 11.54L12 21.35Z" class="social-archive-index-favorite-heart${isFavorited ? " is-filled" : ""}"></path>
    </svg>
  `;
}

function renderPersonIndexList(dossierVm) {
  const items = Array.isArray(dossierVm?.entries) ? dossierVm.entries : [];
  if (items.length === 0) {
    return `
      <div class="social-archive-index-empty ${escapeHtml(String(dossierVm?.listEmptyState?.debugClassName || "social-archive-debug-empty-dataset"))}" data-social-empty-dataset="left-rail">
        <div class="social-archive-index-empty-title">${escapeHtml(String(dossierVm?.listEmptyState?.label || "当前 0 条"))}</div>
        <div class="social-archive-index-empty-copy">${escapeHtml(String(dossierVm?.listEmptyState?.description || "尚未建立可索引的人际档案。"))}</div>
      </div>
    `;
  }

  return `
    <div class="social-archive-index-list" role="list">
      ${items.map((item) => {
        const selected = String(item?.npcId || "") === String(dossierVm?.selectedEntryId || "");
        return `
          <div class="social-archive-index-row${selected ? " is-selected" : ""}${item?.isDimmed ? " is-dimmed" : ""}" role="listitem">
            <button
              type="button"
              class="social-archive-index-item"
              data-social-select-npc="${escapeHtml(String(item?.npcId || ""))}"
              aria-pressed="${selected ? "true" : "false"}"
            >
              <span class="social-archive-index-text-block">
                <span class="social-archive-index-name">${escapeHtml(String(item?.displayTitle || item?.name || "未知人物"))}</span>
                <span class="social-archive-index-subtitle">${escapeHtml(String(item?.displaySubtitle || "身份未明"))}</span>
              </span>
            </button>
            <button
              type="button"
              class="social-archive-index-favorite-button${item?.isFavorited ? " is-favorited" : ""}"
              data-social-toggle-favorite="${escapeHtml(String(item?.npcId || ""))}"
              aria-label="${escapeHtml(String(item?.favoriteButtonAriaLabel || "切换收藏"))}"
              aria-pressed="${item?.isFavorited ? "true" : "false"}"
            >
              ${renderFavoriteIcon(item?.isFavorited === true)}
            </button>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderProfileHeaderCard(identityHeader, summary, selectedEntry) {
  const favor = Math.max(0, Number(summary?.favor || 0));
  const favorMax = Math.max(1, Number(summary?.favorMax || 100));
  const progress = Math.max(0, Math.min(1, Number(summary?.progress || 0)));
  return `
    <section class="social-archive-card social-archive-profile-header-card" aria-label="人物档案头卡">
      <div class="social-archive-profile-header-main">
        <div class="social-archive-profile-header-left">
          <h2 class="social-archive-identity-title">${escapeHtml(String(identityHeader?.title || selectedEntry?.name || "未知人物"))}</h2>
          <div class="social-archive-identity-subtitle">${escapeHtml(String(selectedEntry?.displaySubtitle || "身份未明"))}</div>
        </div>
        <div class="social-archive-profile-header-right">
          <div class="social-archive-identity-pill-group">
            <span class="social-archive-relation-pill">${escapeHtml(String(summary?.label || identityHeader?.relationLabel || "未建立"))}</span>
          </div>
          <div class="social-archive-profile-header-favor-row">
            <div class="social-archive-favor-metric">
              <div class="social-archive-favor-label">好感度</div>
              <div class="social-archive-relationship-favor">${escapeHtml(`${favor} / ${favorMax}`)}</div>
            </div>
            <div class="social-archive-favor-track social-archive-favor-track-compact" aria-hidden="true">
              <span class="social-archive-favor-track-fill" style="width:${progress * 100}%;"></span>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderDossierEntrySection(dossierEntryListVm) {
  const rows = Array.isArray(dossierEntryListVm?.entries) ? dossierEntryListVm.entries : [];
  const emptyStateLabel = String(dossierEntryListVm?.emptyStateLabel || "待发现");
  return `
    <section class="social-archive-card social-archive-entry-section" aria-label="档案词条">
      <div class="social-archive-section-head">
        <div class="social-archive-section-title">档案词条</div>
      </div>
      <div class="social-archive-entry-scroll scrollPane">
        ${rows.length > 0
          ? `
            <div class="social-archive-entry-list">
              ${rows.map((entry) => `
                <article class="social-archive-entry-card">
                  <h3 class="social-archive-entry-title">${escapeHtml(String(entry?.title || "档案词条"))}</h3>
                  <p class="social-archive-entry-body">${escapeHtml(String(entry?.body || ""))}</p>
                </article>
              `).join("")}
            </div>
          `
          : `<div class="social-archive-entry-empty">${escapeHtml(emptyStateLabel)}</div>`}
      </div>
    </section>
  `;
}

function renderEmptyStateCard(emptyStateVm) {
  return `
    <section class="social-archive-empty-state-wrap">
      <article class="social-archive-empty-state-card" aria-live="polite">
        <div class="social-archive-empty-eyebrow">${escapeHtml(String(emptyStateVm?.eyebrow || "人际档案"))}</div>
        <h2 class="social-archive-empty-title">${escapeHtml(String(emptyStateVm?.title || "当前没有可查阅的人际档案"))}</h2>
        <p class="social-archive-empty-copy">${escapeHtml(String(emptyStateVm?.description || ""))}</p>
      </article>
    </section>
  `;
}

function renderDetailEmptyState(dossierVm, emptyStateVm) {
  const detailState = dossierVm?.detailEmptyState || emptyStateVm || {};
  return `
    <section class="social-archive-card social-archive-detail-empty ${escapeHtml(String(detailState?.debugClassName || "social-archive-debug-empty-dataset"))}" data-social-empty-dataset="detail-panel" aria-live="polite">
      <div class="social-archive-card-kicker">${escapeHtml(String(detailState?.eyebrow || "空数据调试态"))}</div>
      <h2 class="social-archive-empty-title social-archive-detail-empty-title">${escapeHtml(String(detailState?.title || "当前没有可查阅的人际档案"))}</h2>
      <p class="social-archive-empty-copy social-archive-detail-empty-copy">${escapeHtml(String(detailState?.description || "当前数据集为空。"))}</p>
    </section>
  `;
}

function renderDossierLayout(dossierVm, emptyStateVm) {
  const hasVisibleEntries = dossierVm?.hasVisibleEntries === true;
  return `
    <section class="social-archive-dossier-layout" aria-label="人际档案主体">
      <aside class="social-archive-left-rail scrollPane" aria-label="人物索引轨">
        <div class="social-archive-left-rail-head">
          <div class="social-archive-left-rail-title">人物索引</div>
          <div class="social-archive-left-rail-count">${escapeHtml(String((dossierVm?.entries || []).length))}</div>
        </div>
        ${renderPersonIndexList(dossierVm)}
      </aside>
      <article class="social-archive-main-article" aria-label="档案正文">
        ${hasVisibleEntries
          ? [
              renderProfileHeaderCard(dossierVm?.identityHeader, dossierVm?.relationshipSummaryVm, dossierVm?.selectedEntry),
              renderDossierEntrySection(dossierVm?.dossierEntryListVm)
            ].join("")
          : renderDetailEmptyState(dossierVm, emptyStateVm)}
      </article>
    </section>
  `;
}

function ensureSocialOverlayScaffold(hostContainer) {
  let overlay = hostContainer.querySelector(".social-archive-overlay.social-panel-overlay");
  if (overlay) return overlay;

  hostContainer.innerHTML = `
    <div class="social-archive-overlay social-panel-overlay" role="presentation">
      <div class="social-archive-backdrop" data-social-action="backdrop-close"></div>
      <section class="social-archive-shell" role="dialog" aria-modal="true" aria-labelledby="social-panel-title">
        <header class="social-archive-header">
          <div>
            <div class="social-archive-header-eyebrow">Archive</div>
            <div class="social-archive-title" id="social-panel-title">人际档案</div>
          </div>
          <button type="button" class="social-archive-close" data-social-action="close" aria-label="关闭人际档案">×</button>
        </header>
        <div class="social-archive-body"></div>
      </section>
    </div>
  `;
  overlay = hostContainer.querySelector(".social-archive-overlay.social-panel-overlay");
  return overlay;
}

export function renderSocialOverlayPage(viewModel, hostContainer) {
  if (!hostContainer) return;
  ensureSocialOverlayScaffold(hostContainer);
  const bodyHost = hostContainer.querySelector(".social-archive-body");
  if (!bodyHost) return;

  bodyHost.innerHTML = viewModel?.dossierVm?.hasVisibleEntries === true
    ? renderDossierLayout(viewModel?.dossierVm, viewModel?.emptyStateVm)
    : renderEmptyStateCard(viewModel?.emptyStateVm);
}
