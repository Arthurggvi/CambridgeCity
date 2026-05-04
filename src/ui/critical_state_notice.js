import { TRANSIENT_TIMING_PRESETS } from "./transient/transient_contract.js";
import { registerTransientPresenter } from "./transient/transient_runtime.js";

export const CRITICAL_STATE_NOTICE_TRANSIENT_TYPE = "critical_state_notice";
export const CRITICAL_STATE_NOTICE_TIMING = TRANSIENT_TIMING_PRESETS.CRITICAL_STATE_CARD;

let didRegisterCriticalStateNotice = false;

function getDocumentRoot() {
  return typeof document !== "undefined" ? document : null;
}

function formatArchiveNumeric(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/u, "");
}

function buildDeathArchiveDisplayLogs(entries = []) {
  const normalized = Array.isArray(entries) ? entries : [];
  const displayLogs = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const entry = normalized[index] || {};
    const timeText = String(entry.timeText || "").trim();
    const title = String(entry.title || "").trim();
    const bodyText = String(entry.bodyText || "").trim();

    const hpMatch = bodyText.match(/^HP\s+([\d.]+)\s*[→\-]+>\s*([\d.]+)\s*\(([-+]?\d+(?:\.\d+)?)\)$/u)
      || bodyText.match(/^HP\s+([\d.]+)\s*→\s*([\d.]+)\s*\(([-+]?\d+(?:\.\d+)?)\)$/u);

    if (hpMatch) {
      let firstFrom = Number(hpMatch[1]);
      let lastTo = Number(hpMatch[2]);
      let steps = 1;
      let lastTimeText = timeText;

      while (index + 1 < normalized.length) {
        const nextBody = String(normalized[index + 1]?.bodyText || "").trim();
        const nextMatch = nextBody.match(/^HP\s+([\d.]+)\s*[→\-]+>\s*([\d.]+)\s*\(([-+]?\d+(?:\.\d+)?)\)$/u)
          || nextBody.match(/^HP\s+([\d.]+)\s*→\s*([\d.]+)\s*\(([-+]?\d+(?:\.\d+)?)\)$/u);
        if (!nextMatch) break;
        lastTo = Number(nextMatch[2]);
        lastTimeText = String(normalized[index + 1]?.timeText || "").trim() || lastTimeText;
        steps += 1;
        index += 1;
      }

      displayLogs.push({
        timeText: lastTimeText || timeText,
        primaryText: steps > 1 ? "健康连续下降" : "健康下降",
        secondaryText: `HP ${formatArchiveNumeric(firstFrom)} → ${formatArchiveNumeric(lastTo)}${steps > 1 ? `，共 ${steps} 次变化` : ""}`
      });
      continue;
    }

    if (bodyText.includes("未记录到可归档")) {
      displayLogs.push({
        timeText,
        primaryText: "未留下可归档记录",
        secondaryText: "过去 24 小时内，没有保留下可供整理的关键播报。"
      });
      continue;
    }

    const primaryText = title && title !== "状态更新"
      ? title
      : (bodyText || "状态有变化");
    const secondaryText = title && title !== primaryText && bodyText
      ? bodyText
      : "";

    displayLogs.push({
      timeText,
      primaryText,
      secondaryText
    });
  }

  return displayLogs.slice(0, 4);
}

function normalizeCriticalStateNoticePayload(payload = {}) {
  const rawMode = String(payload?.mode || "").trim();
  const upperMode = rawMode.toUpperCase();
  const normalizedMode = rawMode === "death_archive"
    ? "death_archive"
    : (upperMode === "DEAD" ? "DEAD" : (upperMode === "COLLAPSE" ? "COLLAPSE" : ""));
  const persistent = payload?.persistent === true || normalizedMode === "death_archive";
  const title = normalizedMode === "DEAD"
    ? "你已死亡"
    : (normalizedMode === "COLLAPSE" ? "你陷入了昏迷" : "");
  return {
    mode: normalizedMode,
    persistent,
    title: String(payload?.title || title).trim() || title,
    timeText: String(payload?.timeText || "").trim(),
    locationText: String(payload?.locationText || "").trim(),
    statusText: String(payload?.statusText || "").trim(),
    summaryText: String(payload?.summaryText || "").trim(),
    logEntries: Array.isArray(payload?.logEntries)
      ? payload.logEntries.map((entry) => ({
          timeText: String(entry?.timeText || "").trim(),
          title: String(entry?.title || "").trim(),
          bodyText: String(entry?.bodyText || "").trim()
        })).filter((entry) => entry.title || entry.bodyText)
      : []
  };
}

function renderCriticalStateNoticePresenter({ payload, itemRoot, documentRoot }) {
  const doc = documentRoot || getDocumentRoot();
  if (!doc || !itemRoot) return null;
  const body = doc.body || null;

  const presenterPayload = normalizeCriticalStateNoticePayload(payload);
  if (!presenterPayload.mode || !presenterPayload.title) return null;

  itemRoot.classList.add("critical-state-notice-transient");
  itemRoot.dataset.transientPersistent = presenterPayload.persistent ? "true" : "false";
  if (presenterPayload.mode === "death_archive") {
    itemRoot.classList.add("is-death-archive");
  } else {
    itemRoot.classList.add(presenterPayload.mode === "DEAD" ? "is-dead" : "is-collapse");
  }

  const card = doc.createElement("div");
  card.className = "critical-state-notice-transient-frame";

  if (presenterPayload.mode === "death_archive") {
    const layout = doc.createElement("div");
    layout.className = "critical-state-notice-archive-layout";

    const headerBlock = doc.createElement("div");
    headerBlock.className = "critical-state-notice-archive-header";

    const titleEl = doc.createElement("div");
    titleEl.className = "critical-state-notice-archive-title";
    titleEl.textContent = presenterPayload.title;
    headerBlock.appendChild(titleEl);

    const metaParts = [presenterPayload.timeText, presenterPayload.locationText].filter(Boolean);
    if (metaParts.length > 0) {
      const metaEl = doc.createElement("div");
      metaEl.className = "critical-state-notice-archive-meta";
      metaEl.textContent = metaParts.join(" · ");
      headerBlock.appendChild(metaEl);
    }
    layout.appendChild(headerBlock);

    const statusBlock = doc.createElement("div");
    statusBlock.className = "critical-state-notice-archive-status";

    for (const text of [presenterPayload.statusText, presenterPayload.summaryText]) {
      if (!text) continue;
      const lineEl = doc.createElement("div");
      lineEl.className = "critical-state-notice-archive-line";
      lineEl.textContent = text;
      statusBlock.appendChild(lineEl);
    }
    if (statusBlock.childElementCount > 0) {
      layout.appendChild(statusBlock);
    }

    const logsSection = doc.createElement("div");
    logsSection.className = "critical-state-notice-archive-log-section";

    const logsWrap = doc.createElement("div");
    logsWrap.className = "critical-state-notice-archive-logs";

    const logsTitle = doc.createElement("div");
    logsTitle.className = "critical-state-notice-archive-logs-title";
    logsTitle.textContent = "最后日志";
    logsSection.appendChild(logsTitle);

    for (const entry of buildDeathArchiveDisplayLogs(presenterPayload.logEntries)) {
      const itemEl = doc.createElement("div");
      itemEl.className = "critical-state-notice-archive-log-item";

      if (entry.timeText) {
        const timeEl = doc.createElement("div");
        timeEl.className = "critical-state-notice-archive-log-time";
        timeEl.textContent = entry.timeText;
        itemEl.appendChild(timeEl);
      }

      const headEl = doc.createElement("div");
      headEl.className = "critical-state-notice-archive-log-head";
      headEl.textContent = entry.primaryText;
      itemEl.appendChild(headEl);

      if (entry.secondaryText) {
        const bodyEl = doc.createElement("div");
        bodyEl.className = "critical-state-notice-archive-log-body";
        bodyEl.textContent = entry.secondaryText;
        itemEl.appendChild(bodyEl);
      }

      logsWrap.appendChild(itemEl);
    }

    logsSection.appendChild(logsWrap);
    layout.appendChild(logsSection);
    card.appendChild(layout);
  } else {
    card.textContent = presenterPayload.title;
  }
  itemRoot.appendChild(card);

  if (presenterPayload.mode === "death_archive" && body) {
    body.classList.add("death-archive-active");
  }

  return {
    signalTarget: card,
    cleanup: () => {
      if (presenterPayload.mode === "death_archive" && body) {
        body.classList.remove("death-archive-active");
      }
    }
  };
}

export function ensureCriticalStateNoticeRegistration() {
  if (didRegisterCriticalStateNotice) return true;

  registerTransientPresenter(CRITICAL_STATE_NOTICE_TRANSIENT_TYPE, {
    render: renderCriticalStateNoticePresenter
  });

  didRegisterCriticalStateNotice = true;
  return true;
}
