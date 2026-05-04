import { escapeAttr, escapeHtml } from "./text_escape.js";
import { formatMinutes } from "../../ui/format_minutes.js";

function createTextButton(actionId, text, selected = false, extraClass = "") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.actionId = String(actionId || "");
  btn.className = `inventory-text-btn${selected ? " is-selected" : ""}${extraClass ? ` ${extraClass}` : ""}`;
  btn.textContent = String(text || "");
  return btn;
}

function createQualityItemNameElement({ name, qualityClass = "", baseClass = "inventory-item-name", extraClass = "", tagName = "div" } = {}) {
  const el = document.createElement(String(tagName || "div"));
  el.className = [baseClass, qualityClass, extraClass]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  el.textContent = String(name || "");
  return el;
}

function formatThermalEtaMinutes(minutes) {
  const totalMin = Number(minutes ?? 0);
  if (!Number.isFinite(totalMin)) return "-";
  return formatMinutes(Math.max(0, Math.ceil(totalMin)));
}

function createPanelHead({ eyebrow = "", title = "", metaText = "" } = {}) {
  const head = document.createElement("header");
  head.className = "inventory-panel-head";

  const titleEl = document.createElement("div");
  titleEl.className = "inventory-panel-title";
  titleEl.textContent = String(title || "");

  if (eyebrow) {
    const eyebrowEl = document.createElement("div");
    eyebrowEl.className = "inventory-panel-eyebrow";
    eyebrowEl.textContent = String(eyebrow || "");
    head.appendChild(eyebrowEl);
  }
  head.appendChild(titleEl);

  return head;
}

function makeInventoryMiniMetricBar(label, value) {
  const wrap = document.createElement("div");
  wrap.className = "inventory-mini-metric";

  const top = document.createElement("div");
  top.className = "inventory-mini-metric-top";

  const labelEl = document.createElement("span");
  labelEl.className = "inventory-mini-metric-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "inventory-mini-metric-value";
  valueEl.textContent = Math.max(0, Math.min(1, Number(value || 0))).toFixed(2);

  const bar = document.createElement("div");
  bar.className = "inventory-mini-metric-bar";

  const fill = document.createElement("div");
  fill.className = "inventory-mini-metric-fill";
  fill.style.width = `${(Math.max(0, Math.min(1, Number(value || 0))) * 100).toFixed(1)}%`;

  top.appendChild(labelEl);
  top.appendChild(valueEl);
  bar.appendChild(fill);
  wrap.appendChild(top);
  wrap.appendChild(bar);
  return wrap;
}

function createClothingInventoryRow(rowView) {
  const isSelected = rowView?.isSelected === true;
  const isEquipped = rowView?.isEquipped === true;
  const isNewGain = rowView?.isNewGain === true;
  const rowBtn = document.createElement("button");
  rowBtn.type = "button";
  rowBtn.dataset.actionId = String(rowView?.actionId || "");
  rowBtn.dataset.itemId = String(rowView?.itemId || "");
  rowBtn.dataset.slot = String(rowView?.slot || "");
  rowBtn.className = `inventory-item-row candidateRow is-clothing${isSelected ? " is-selected isSelected" : ""}${isNewGain ? " is-new-gain" : ""}`;

  const left = document.createElement("div");
  left.className = "inventory-item-left";

  const titleRow = document.createElement("div");
  titleRow.className = "inventory-item-title-row";

  const nameEl = createQualityItemNameElement({
    name: String(rowView?.name || ""),
    qualityClass: String(rowView?.qualityClass || ""),
    baseClass: "inventory-item-name"
  });
  titleRow.appendChild(nameEl);

  if (isSelected) {
    const selectedTag = document.createElement("span");
    selectedTag.className = "inventory-item-tag selectedTag";
    selectedTag.textContent = "选中";
    titleRow.appendChild(selectedTag);
  }

  if (isEquipped) {
    const equippedTag = document.createElement("span");
    equippedTag.className = "inventory-item-tag";
    equippedTag.textContent = "已装备";
    titleRow.appendChild(equippedTag);
  }

  const metaEl = document.createElement("div");
  metaEl.className = "inventory-item-meta";
  metaEl.textContent = `${String(rowView?.slotLabel || "服装")} · x${Math.max(0, Number(rowView?.qty || 0))}`;

  const descText = String(rowView?.descText || "").trim();
  const exposureEl = document.createElement("div");
  exposureEl.className = "inventory-item-exposure";

  const exposureGrid = document.createElement("div");
  exposureGrid.className = "inventory-item-exposure-grid";
  if (isEquipped) {
    const equippedWord = document.createElement("span");
    equippedWord.className = "inventory-item-delta-label";
    equippedWord.textContent = "当前已装备";
    exposureGrid.appendChild(equippedWord);
  } else if (rowView?.preview) {
    const incapLabel = document.createElement("span");
    incapLabel.className = "inventory-item-delta-label";
    incapLabel.textContent = "Δ失能";
    const incapValue = document.createElement("span");
    incapValue.className = `inventory-item-delta ${String(rowView.preview.deltaIncapTone || "is-neutral")}`;
    incapValue.textContent = String(rowView.preview.deltaIncapText || "±0m");

    const deathLabel = document.createElement("span");
    deathLabel.className = "inventory-item-delta-label";
    deathLabel.textContent = "Δ致死";
    const deathValue = document.createElement("span");
    deathValue.className = `inventory-item-delta ${String(rowView.preview.deltaDeathTone || "is-neutral")}`;
    deathValue.textContent = String(rowView.preview.deltaDeathText || "±0m");

    exposureGrid.appendChild(incapLabel);
    exposureGrid.appendChild(incapValue);
    exposureGrid.appendChild(deathLabel);
    exposureGrid.appendChild(deathValue);
  }
  exposureEl.appendChild(exposureGrid);
  if (descText) {
    const desc = document.createElement("div");
    desc.className = "inventory-item-desc itemDescClamp2";
    desc.textContent = descText;
    exposureEl.appendChild(desc);
  }

  left.appendChild(titleRow);
  left.appendChild(metaEl);
  left.appendChild(exposureEl);

  const right = document.createElement("div");
  right.className = "inventory-item-right";
  const thermal = rowView?.thermal || { insulation: 0, windproof: 0 };
  right.appendChild(makeInventoryMiniMetricBar("I", thermal.insulation));
  right.appendChild(makeInventoryMiniMetricBar("W", thermal.windproof));

  rowBtn.appendChild(left);
  rowBtn.appendChild(right);
  return rowBtn;
}

function buildClothingSummaryExpandedMarkup(summaryView = {}) {
  return `
    <div class="inventory-summary-expanded clothingHeaderExpanded is-expanded" data-summary-expanded="true" aria-hidden="false">
      <div class="inventory-summary-block clothingHeaderExpandedBaseline baselineBlock">
        <div class="inventory-summary-block-title">基准条件</div>
        <div class="baselineRows">
          <div class="baselineRow">
            <div class="baselineLabel">基准</div>
            <div class="baselineValue">
              <div class="baselineRowText">${escapeHtml(summaryView.exposureBaseline?.basisLine1 || "外界 Open")}</div>
              <div class="baselineRowText baselineRowSub">${escapeHtml(summaryView.exposureBaseline?.basisLine2 || "风速 15km/h · 湿度适中")}</div>
            </div>
          </div>
          <div class="baselineRow">
            <div class="baselineLabel">当前</div>
            <div class="baselineValue">
              <div class="baselineRowText">${escapeHtml(summaryView.exposureBaseline?.currentLine1 || summaryView.exposureBaseline?.currentText || "")}</div>
              <div class="baselineRowText baselineRowSub">${escapeHtml(summaryView.exposureBaseline?.currentLine2 || summaryView.exposureBaseline?.compareNotice || "")}</div>
            </div>
          </div>
        </div>
        ${Array.isArray(summaryView.exposureBaseline?.lockTags) && summaryView.exposureBaseline.lockTags.length ? `<div class="inventory-summary-locks">${summaryView.exposureBaseline.lockTags.map((text) => `<span class="inventory-summary-lock-tag">${escapeHtml(text)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="inventory-summary-block clothingHeaderExpandedWeak">
        <div class="inventory-summary-block-title">短板贡献</div>
        <div class="clothingHeaderExpandedWeakList">${(summaryView.expandedWeakRows || []).map((row) => `
          <div class="clothingHeaderExpandedWeakRow" data-hover-desc="${escapeAttr(String(row.hoverDesc || ""))}">
            <span class="clothingHeaderExpandedWeakSlot">${escapeHtml(String(row.slotLabel || ""))}</span>
            <span class="clothingHeaderExpandedWeakMeta">${escapeHtml(String(row.metaText || ""))}</span>
          </div>
        `).join("") || `<div class="clothingHeaderExpandedWeakRow is-empty"><span class="clothingHeaderExpandedWeakSlot">当前无明显短板</span></div>`}</div>
      </div>
    </div>
  `;
}

function renderConsumableDetailBlock(consumableDetailPresentation) {
  if (!consumableDetailPresentation || (consumableDetailPresentation.effectLines.length === 0 && consumableDetailPresentation.infoLines.length === 0)) {
    return null;
  }

  const detailBlock = document.createElement("div");
  detailBlock.className = "inventory-consumable-detail";

  const detailHeader = document.createElement("div");
  detailHeader.className = "inventory-consumable-detail__header";

  const detailTitle = document.createElement("div");
  detailTitle.className = "inventory-consumable-detail__title";
  detailTitle.textContent = String(consumableDetailPresentation.title || "效果");
  detailHeader.appendChild(detailTitle);

  if (consumableDetailPresentation.statusTag) {
    const statusTag = document.createElement("span");
    statusTag.className = "inventory-consumable-detail__tag";
    statusTag.textContent = String(consumableDetailPresentation.statusTag);
    detailHeader.appendChild(statusTag);
  }

  detailBlock.appendChild(detailHeader);

  if (consumableDetailPresentation.effectLines.length > 0) {
    const effectList = document.createElement("div");
    effectList.className = "inventory-consumable-detail__list inventory-consumable-detail__list-effects";
    for (const line of consumableDetailPresentation.effectLines) {
      const row = document.createElement("div");
      row.className = "inventory-consumable-detail__line is-effect";
      row.textContent = line;
      effectList.appendChild(row);
    }
    detailBlock.appendChild(effectList);
  }

  if (consumableDetailPresentation.infoLines.length > 0) {
    const infoList = document.createElement("div");
    infoList.className = "inventory-consumable-detail__list inventory-consumable-detail__list-info";
    for (const line of consumableDetailPresentation.infoLines) {
      const row = document.createElement("div");
      row.className = "inventory-consumable-detail__line is-info";
      row.textContent = line;
      infoList.appendChild(row);
    }
    detailBlock.appendChild(infoList);
  }

  return detailBlock;
}

export function renderInventoryEquipmentPanel({ equipmentRows = [], equipmentGroups = [], toolSection = {}, vitalsMonitorEnabled = false, shouldAnimateIn = false } = {}) {
  const panel = document.createElement("section");
  panel.className = `inventory-equip-panel inventory-equip-rack invPane${shouldAnimateIn ? " inventory-section-enter" : ""}`;
  panel.appendChild(createPanelHead({
    title: "穿戴"
  }));

  const equipRowsHost = document.createElement("div");
  equipRowsHost.className = "inventory-equip-rows invPaneBody scrollPane";

  const groups = Array.isArray(equipmentGroups) && equipmentGroups.length > 0
    ? equipmentGroups
    : [{ id: "default", label: "挂板", tone: "", rows: equipmentRows }];

  for (const group of groups) {
    const groupEl = document.createElement("section");
    groupEl.className = `inventory-equip-group${group.tone ? ` ${String(group.tone)}` : ""}`;

    const groupHead = document.createElement("div");
    groupHead.className = "inventory-equip-group-head";
    groupHead.innerHTML = `<span class="inventory-equip-group-title">${escapeHtml(String(group.label || "装备组"))}</span>`;
    groupEl.appendChild(groupHead);

    const groupRows = document.createElement("div");
    groupRows.className = "inventory-equip-group-rows";

    for (const row of Array.isArray(group.rows) ? group.rows : []) {
      const rowBtn = document.createElement("button");
      rowBtn.type = "button";
      rowBtn.dataset.actionId = String(row.actionId || "");
      rowBtn.dataset.slot = String(row.slot || "");
      rowBtn.className = `inventory-equip-row${row.isSelected ? " is-selected" : ""}${row.isMissing ? " is-missing" : " is-equipped"}`;
      if (row.itemId) rowBtn.dataset.itemId = String(row.itemId);
      if (row.hoverDesc) rowBtn.dataset.hoverDesc = String(row.hoverDesc);

      const main = document.createElement("div");
      main.className = "inventory-equip-main";

      const topLine = document.createElement("div");
      topLine.className = "inventory-equip-topline";

      const slotLabel = document.createElement("span");
      slotLabel.className = "inventory-equip-slot";
      slotLabel.textContent = String(row.slotLabel || "");

      const stateTag = document.createElement("span");
      stateTag.className = `inventory-equip-state-tag${row.stateTone ? ` ${String(row.stateTone)}` : ""}`;
      stateTag.textContent = String(row.stateTag || (row.isMissing ? "缺件" : "已装备"));

      topLine.appendChild(slotLabel);
      topLine.appendChild(stateTag);

      const valueLabel = document.createElement("span");
      valueLabel.className = "inventory-equip-value";
      valueLabel.textContent = String(row.itemName || "");

      main.appendChild(topLine);
      if (row.itemName) {
        main.appendChild(valueLabel);

        const metrics = document.createElement("span");
        metrics.className = "inventory-equip-metric-line";
        metrics.textContent = String(row.metricText || "");
        main.appendChild(metrics);
      }

      rowBtn.appendChild(main);
      groupRows.appendChild(rowBtn);
    }

    groupEl.appendChild(groupRows);
    equipRowsHost.appendChild(groupEl);
  }

  const toolSectionEl = document.createElement("details");
  toolSectionEl.className = "inventory-tool-section";
  toolSectionEl.open = true;

  const toolSummary = document.createElement("summary");
  toolSummary.className = "inventory-tool-summary";

  const toolSummaryLabel = document.createElement("span");
  toolSummaryLabel.className = "inventory-tool-summary-label";
  toolSummaryLabel.textContent = "工具挂板";

  const toolSummaryCount = document.createElement("span");
  toolSummaryCount.className = "inventory-tool-summary-count";
  toolSummaryCount.textContent = `${Array.isArray(toolSection.entries) ? toolSection.entries.length : 0}`;

  toolSummary.appendChild(toolSummaryLabel);
  toolSummary.appendChild(toolSummaryCount);
  toolSectionEl.appendChild(toolSummary);

  const toolBody = document.createElement("div");
  toolBody.className = "inventory-tool-body";

  if (!Array.isArray(toolSection.entries) || toolSection.entries.length === 0) {
    const emptyToolState = document.createElement("div");
    emptyToolState.className = "inventory-tool-empty";
    emptyToolState.textContent = String(toolSection.emptyText || "（当前未装备工具）");
    toolBody.appendChild(emptyToolState);
  } else {
    for (const entry of toolSection.entries) {
      const toolRow = document.createElement("div");
      toolRow.className = "inventory-equip-row inventory-tool-row";

      const toolMain = document.createElement("div");
      toolMain.className = "inventory-equip-main";

      const toolTag = document.createElement("span");
      toolTag.className = "inventory-equip-slot";
      toolTag.textContent = `${String(entry.toolTagLabel || "")}工具`;

      const toolName = document.createElement("span");
      toolName.className = "inventory-equip-value";
      toolName.textContent = String(entry.itemName || entry.itemId || "");

      const toolNote = document.createElement("span");
      toolNote.className = "inventory-equip-note";
      toolNote.textContent = String(entry.noteText || "已装备工具");

      toolMain.appendChild(toolTag);
      toolMain.appendChild(toolName);
      toolMain.appendChild(toolNote);

      const toolActions = document.createElement("div");
      toolActions.className = "inventory-tool-actions";
      const toolUnequipBtn = createTextButton(String(entry.unequipActionId || ""), "卸下", false, "inventory-action-btn inventory-tool-action-btn");
      toolActions.appendChild(toolUnequipBtn);

      toolRow.appendChild(toolMain);
      toolRow.appendChild(toolActions);
      toolBody.appendChild(toolRow);
    }
  }

  if (vitalsMonitorEnabled) {
    const toolHint = document.createElement("div");
    toolHint.className = "inventory-tool-hint";
    toolHint.textContent = String(toolSection.hintText || "已启用扩展监测");
    toolBody.appendChild(toolHint);
  }

  toolSectionEl.appendChild(toolBody);
  equipRowsHost.appendChild(toolSectionEl);
  panel.appendChild(equipRowsHost);
  return panel;
}

export function renderInventoryManifestPanel({ tabsView = [], listView = {}, summaryView = {}, shouldAnimateIn = false } = {}) {
  const filter = String(listView.filter || "tool");
  const panel = document.createElement("section");
  panel.className = `inventory-manifest-panel invPane${shouldAnimateIn ? " inventory-section-enter" : ""}`;
  panel.appendChild(createPanelHead({
    title: "舱单"
  }));

  if (filter === "clothing" && summaryView.showPanel) {
    const protectionSummary = document.createElement("div");
    protectionSummary.className = `clothingHeaderRow clothHudWrap${summaryView.expanded ? " is-expanded" : ""}`;
    protectionSummary.innerHTML = `
      <div class="clothHudTop clothingHeaderMain clothingHeaderMainRow">
        <div class="clothingHeaderLead"><span class="inventory-summary-baseline-tag clothingHeaderTag" title="${escapeAttr(String(summaryView.exposureBaseline?.basisText || ""))}">外界基准（参考）</span></div>
        <div class="inventory-summary-actions clothingHeaderActions">
          <div class="clothingHeaderPriority clothHudShortfalls" title="${escapeAttr(String(summaryView.shortfallText || ""))}">${escapeHtml(String(summaryView.shortfallText || ""))}</div>
          <button type="button" class="inventory-summary-icon" aria-label="说明" data-hover-desc="${escapeAttr(String(summaryView.infoHoverText || ""))}">i</button>
          <button type="button" class="inventory-summary-icon inventory-summary-toggle${summaryView.expanded ? " is-expanded" : ""}" data-local-action="toggle-summary" aria-label="展开详情" aria-expanded="${summaryView.expanded ? "true" : "false"}">v</button>
        </div>
      </div>
      <div class="inventory-summary-copy clothingHeaderCopy clothHudBody">
        <div class="inventory-summary-headline clothingHeaderTitle clothHudTitle">${escapeHtml(String(summaryView.headlineText || ""))}</div>
        <div class="clothingHeaderMetaRow clothHudMetaRow">
          <div class="inventory-summary-subline clothingHeaderMeta clothHudMeta">${escapeHtml(String(summaryView.metaText || ""))}</div>
        </div>
      </div>
      ${summaryView.expanded ? buildClothingSummaryExpandedMarkup(summaryView) : ""}
    `;
    panel.appendChild(protectionSummary);
  }

  const tabs = document.createElement("div");
  tabs.className = "inventory-tabs";
  for (const tabView of tabsView) {
    tabs.appendChild(createTextButton(String(tabView.actionId || ""), String(tabView.label || ""), tabView.isSelected === true, "inventory-tab"));
  }
  panel.appendChild(tabs);

  const scroll = document.createElement("div");
  scroll.className = "inventory-list-scroll invPaneBody scrollPane";

  if (filter === "clothing") {
    scroll.classList.add("inventory-list-scroll-clothing");
    const workspace = document.createElement("div");
    workspace.className = `inventory-clothing-workspace clothingRightPane${shouldAnimateIn ? " inventory-section-enter" : ""}`;

    const candidateSection = document.createElement("section");
    candidateSection.className = "inventory-clothing-section";
    candidateSection.id = "inventory-clothing-candidates";
    const candidateHeader = document.createElement("div");
    candidateHeader.className = "inventory-candidate-header";
    candidateHeader.innerHTML = `<div class="inventory-clothing-section-title">${listView.clothing?.activeSlotLabel ? `可装备：${escapeHtml(listView.clothing.activeSlotLabel)}` : "可装备"}</div>`;
    candidateSection.appendChild(candidateHeader);

    const candidatePane = document.createElement("div");
    candidatePane.className = "clothingCandidatePane scrollPane";

    if (listView.clothing?.activeSlot && Array.isArray(listView.clothing?.candidates) && listView.clothing.candidates.length > 0) {
      const sortBar = document.createElement("div");
      sortBar.className = "inventory-candidate-sortbar";
      sortBar.innerHTML = `<button type="button" class="inventory-candidate-sorttoggle" data-local-action="toggle-clothing-sort" aria-label="切换候选排序">${escapeHtml(String(listView.clothing.sortModeLabel || "Δ致死"))}</button>`;
      candidateHeader.appendChild(sortBar);

      const candidateList = document.createElement("div");
      candidateList.className = "inventory-clothing-candidate-list scrollPane";
      for (const entry of listView.clothing.candidates) {
        candidateList.appendChild(createClothingInventoryRow(entry));
      }
      candidatePane.appendChild(candidateList);
    } else {
      const empty = document.createElement("div");
      empty.className = "inventory-empty inventory-clothing-empty";
      empty.textContent = String(listView.clothing?.emptyTitle || "该分类暂无物品");
      candidatePane.appendChild(empty);
    }

    candidateSection.appendChild(candidatePane);
    workspace.appendChild(candidateSection);
    scroll.appendChild(workspace);
  } else if (!Array.isArray(listView.standardRows) || listView.standardRows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "inventory-empty inventory-manifest-empty";
    empty.textContent = String(listView.standardEmptyText || "该分类暂无物品");
    scroll.appendChild(empty);
  } else {
    for (const row of listView.standardRows) {
      const rowBtn = document.createElement("button");
      rowBtn.type = "button";
      rowBtn.dataset.actionId = String(row.actionId || "");
      rowBtn.dataset.itemId = String(row.itemId || "");
      rowBtn.className = `inventory-item-row${row.isSelected ? " is-selected" : ""}${row.isNewGain ? " is-new-gain" : ""}`;

      const main = document.createElement("div");
      main.className = "inventory-manifest-row-main";

      const eyebrowEl = document.createElement("div");
      eyebrowEl.className = "inventory-manifest-row-eyebrow";
      eyebrowEl.textContent = String(row.eyebrow || "物品");

      const nameEl = createQualityItemNameElement({
        name: String(row.name || ""),
        qualityClass: String(row.qualityClass || ""),
        baseClass: "inventory-item-name"
      });

      const noteEl = document.createElement("div");
      noteEl.className = "inventory-manifest-row-note";
      noteEl.textContent = String(row.noteText || row.stateText || "");

      main.appendChild(eyebrowEl);
      main.appendChild(nameEl);
      main.appendChild(noteEl);

      const side = document.createElement("div");
      side.className = "inventory-manifest-row-side";

      const qtyEl = document.createElement("span");
      qtyEl.className = "inventory-item-qty";
      qtyEl.textContent = String(row.qtyText || "");

      const stateEl = document.createElement("span");
      stateEl.className = `inventory-item-state${row.stateTone ? ` ${String(row.stateTone)}` : ""}`;
      stateEl.textContent = String(row.stateText || "-");

      side.appendChild(qtyEl);
      side.appendChild(stateEl);

      rowBtn.appendChild(main);
      rowBtn.appendChild(side);
      scroll.appendChild(rowBtn);
    }
  }

  panel.appendChild(scroll);
  return panel;
}

export function renderInventoryDossierPanel({ dossierView = {}, shouldAnimateIn = false } = {}) {
  const panel = document.createElement("section");
  panel.className = `inventory-dossier-panel invPane${shouldAnimateIn ? " inventory-section-enter" : ""}`;
  panel.appendChild(createPanelHead({
    title: String(dossierView.panelTitle || "档案")
  }));

  const body = document.createElement("div");
  body.className = "inventory-dossier-body invPaneBody scrollPane";

  if (dossierView.empty) {
    const empty = document.createElement("div");
    empty.className = "inventory-dossier-empty";
    empty.innerHTML = `
      <div class="inventory-dossier-empty-title">${escapeHtml(String(dossierView.title || "未选择物品"))}</div>
      <div class="inventory-dossier-empty-copy">${escapeHtml(String(dossierView.summaryText || "选中后显示档案"))}</div>
    `;

    body.appendChild(empty);
    panel.appendChild(body);
    return panel;
  }

  const hero = document.createElement("section");
  hero.className = "inventory-dossier-hero";

  const recordEl = document.createElement("div");
  recordEl.className = "inventory-dossier-record";
  recordEl.textContent = String(dossierView.recordText || "");

  const nameEl = createQualityItemNameElement({
    name: String(dossierView.title || ""),
    qualityClass: String(dossierView.qualityClass || ""),
    baseClass: "inventory-dossier-name"
  });

  const subtitleEl = document.createElement("div");
  subtitleEl.className = "inventory-dossier-subtitle";
  subtitleEl.textContent = String(dossierView.subtitle || "");

  const summaryEl = document.createElement("div");
  summaryEl.className = "inventory-dossier-summary";
  summaryEl.textContent = String(dossierView.summaryText || "");

  hero.appendChild(recordEl);
  hero.appendChild(nameEl);
  hero.appendChild(subtitleEl);
  hero.appendChild(summaryEl);

  if (dossierView.bodyText) {
    const bodyCopy = document.createElement("div");
    bodyCopy.className = "inventory-dossier-bodycopy";
    bodyCopy.textContent = String(dossierView.bodyText);
    hero.appendChild(bodyCopy);
  }

  if (Array.isArray(dossierView.statusChips) && dossierView.statusChips.length > 0) {
    const chips = document.createElement("div");
    chips.className = "inventory-dossier-chips";
    for (const chip of dossierView.statusChips) {
      const chipEl = document.createElement("span");
      chipEl.className = `inventory-dossier-chip${chip?.tone ? ` ${String(chip.tone)}` : ""}`;
      chipEl.textContent = String(chip?.text || "");
      chips.appendChild(chipEl);
    }
    hero.appendChild(chips);
  }

  body.appendChild(hero);

  if (Array.isArray(dossierView.metricBars) && dossierView.metricBars.length > 0) {
    const metrics = document.createElement("section");
    metrics.className = "inventory-dossier-section inventory-dossier-metrics";
    const title = document.createElement("div");
    title.className = "inventory-dossier-section-title";
    title.textContent = "材质指标";
    metrics.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "inventory-dossier-metric-grid";
    for (const metric of dossierView.metricBars) {
      const block = document.createElement("div");
      block.className = "inventory-dossier-metric-block";
      block.appendChild(makeInventoryMiniMetricBar(String(metric.label || ""), Number(metric.value || 0)));
      grid.appendChild(block);
    }
    metrics.appendChild(grid);
    body.appendChild(metrics);
  }

  if (Array.isArray(dossierView.ledgerRows) && dossierView.ledgerRows.length > 0) {
    const ledger = document.createElement("section");
    ledger.className = "inventory-dossier-section";
    const title = document.createElement("div");
    title.className = "inventory-dossier-section-title";
    title.textContent = "档案字段";
    ledger.appendChild(title);

    const rows = document.createElement("div");
    rows.className = "inventory-dossier-ledger";
    for (const row of dossierView.ledgerRows) {
      const rowEl = document.createElement("div");
      rowEl.className = "inventory-dossier-ledger-row";
      rowEl.innerHTML = `
        <span class="inventory-dossier-ledger-label">${escapeHtml(String(row.label || ""))}</span>
        <span class="inventory-dossier-ledger-value">${escapeHtml(String(row.value || ""))}</span>
      `;
      rows.appendChild(rowEl);
    }
    ledger.appendChild(rows);
    body.appendChild(ledger);
  }

  if (Array.isArray(dossierView.descriptionLines) && dossierView.descriptionLines.length > 0) {
    const desc = document.createElement("section");
    desc.className = "inventory-dossier-section";
    const title = document.createElement("div");
    title.className = "inventory-dossier-section-title";
    title.textContent = "摘要描述";
    desc.appendChild(title);

    const list = document.createElement("div");
    list.className = "inventory-dossier-description";
    for (const line of dossierView.descriptionLines) {
      const lineEl = document.createElement("div");
      lineEl.className = "inventory-dossier-description-line";
      lineEl.textContent = String(line || "");
      list.appendChild(lineEl);
    }
    desc.appendChild(list);
    body.appendChild(desc);
  }

  if (Array.isArray(dossierView.weaknessRows) && dossierView.weaknessRows.length > 0) {
    const weakness = document.createElement("section");
    weakness.className = "inventory-dossier-section";
    const title = document.createElement("div");
    title.className = "inventory-dossier-section-title";
    title.textContent = "弱点记录";
    weakness.appendChild(title);

    const list = document.createElement("div");
    list.className = "inventory-dossier-weak-list";
    for (const row of dossierView.weaknessRows) {
      const rowEl = document.createElement("div");
      rowEl.className = `inventory-dossier-weak-row${row.missing ? " is-missing" : ""}`;
      rowEl.innerHTML = `
        <span class="inventory-dossier-weak-rank">${escapeHtml(String(row.rankText || ""))}</span>
        <span class="inventory-dossier-weak-slot">${escapeHtml(String(row.slotLabel || ""))}</span>
        <span class="inventory-dossier-weak-item">${escapeHtml(String(row.itemName || ""))}</span>
        <span class="inventory-dossier-weak-term">${escapeHtml(String(row.termText || ""))}</span>
      `;
      list.appendChild(rowEl);
    }
    weakness.appendChild(list);
    body.appendChild(weakness);
  }

  if ((Array.isArray(dossierView.effectLines) && dossierView.effectLines.length > 0) || (Array.isArray(dossierView.infoLines) && dossierView.infoLines.length > 0)) {
    body.appendChild(renderConsumableDetailBlock({
      title: "作用记录",
      statusTag: dossierView.effectTag || "摘要",
      effectLines: Array.isArray(dossierView.effectLines) ? dossierView.effectLines : [],
      infoLines: Array.isArray(dossierView.infoLines) ? dossierView.infoLines : []
    }));
  }

  panel.appendChild(body);
  return panel;
}

export function renderInventoryFooterPanel({ footerView = {}, shouldAnimateIn = false } = {}) {
  const footer = document.createElement("footer");
  footer.className = `inventory-dialog-footer${shouldAnimateIn ? " inventory-section-enter" : ""}`;
  if (footerView.isIdle) {
    footer.classList.add("is-idle");
  }

  const shell = document.createElement("div");
  shell.className = "inventory-footer-shell";

  const meta = document.createElement("div");
  meta.className = "inventory-footer-meta";
  const targetLine = document.createElement("div");
  targetLine.className = "inventory-footer-meta-target";
  if (footerView.targetName) {
    targetLine.textContent = "当前目标 · ";
    targetLine.appendChild(createQualityItemNameElement({
      name: String(footerView.targetName || ""),
      qualityClass: String(footerView.targetQualityClass || ""),
      baseClass: "inventory-footer-meta-target-name",
      tagName: "span"
    }));
  } else {
    targetLine.textContent = String(footerView.targetLabel || "当前目标 · 未选择");
  }
  meta.appendChild(targetLine);

  const summaryText = footerView.disabledReason || footerView.effectSummary || "";
  if (summaryText) {
    const summaryLine = document.createElement("div");
    summaryLine.className = `inventory-footer-meta-summary${footerView.disabledReason ? " is-restriction" : ""}`;
    summaryLine.textContent = String(summaryText);
    meta.appendChild(summaryLine);
  }
  shell.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "inventory-footer-actions";
  const stack = document.createElement("div");
  stack.className = "inventory-footer-action-stack";

  if (footerView.primaryAction) {
    const primaryWrap = document.createElement("div");
    primaryWrap.className = "inventory-footer-primary-wrap";
    const btn = createTextButton(
      String(footerView.primaryAction.actionId || ""),
      String(footerView.primaryAction.text || "执行"),
      false,
      `${String(footerView.primaryAction.className || "inventory-action-btn")} inventory-action-btn-emphasis`
    );
    if (footerView.primaryAction.disabled) {
      btn.disabled = true;
      delete btn.dataset.actionId;
    }
    if (footerView.primaryAction.hoverDesc) {
      btn.dataset.hoverDesc = String(footerView.primaryAction.hoverDesc);
    }
    primaryWrap.appendChild(btn);
    stack.appendChild(primaryWrap);
  }

  const opRow = document.createElement("div");
  opRow.className = "inventory-actions invFooterActions";
  for (const actionView of Array.isArray(footerView.secondaryActions) ? footerView.secondaryActions : []) {
    const btn = createTextButton(String(actionView.actionId || ""), String(actionView.text || ""), false, String(actionView.className || "inventory-action-btn"));
    if (actionView.disabled) {
      btn.disabled = true;
      delete btn.dataset.actionId;
    }
    if (actionView.hoverDesc) {
      btn.dataset.hoverDesc = String(actionView.hoverDesc);
    }
    opRow.appendChild(btn);
  }
  if (opRow.childElementCount) {
    stack.appendChild(opRow);
  }
  actions.appendChild(stack);
  shell.appendChild(actions);

  footer.appendChild(shell);
  return footer;
}