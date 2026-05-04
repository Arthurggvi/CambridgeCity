import { registerTransientPresenter } from "./transient/transient_runtime.js";
import { TRANSIENT_TIMING_PRESETS } from "./transient/transient_contract.js";
import { formatMinutes } from "./format_minutes.js";
import { formatBillCents, formatWalletMoney, isClinicBillPaymentAction } from "../engine/medical_bill_money.js";
import { getProfileTotalXp } from "../engine/profile/defs.js";
import { appendMessageLedgerEntries, clearMessageLedger, getRecentMessageLedgerEntries } from "./message_ledger.js";

export const DATA_DELTA_TOAST_TRANSIENT_TYPE = "data_delta_toast";
export const DEFAULT_DATA_DELTA_TOAST_TIMING = TRANSIENT_TIMING_PRESETS.DATA_DELTA_TOAST;

let didRegisterDataDeltaToast = false;

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber(value, decimals = 1) {
  const n = toFiniteNumber(value, 0);
  return n.toFixed(decimals);
}

function formatSigned(value, decimals = 1) {
  const n = toFiniteNumber(value, 0);
  const abs = Math.abs(n).toFixed(decimals);
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return `${abs}`;
}

function formatMoneyFromCents(cents) {
  return formatBillCents(cents);
}

function formatMapLabel(mapId) {
  const id = String(mapId || "").trim();
  if (!id) return "未知地点";

  const menuLabels = {
    menu_main: "主菜单",
    menu_load: "读取存档",
    menu_settings: "设置",
    menu_credits: "制作信息",
    menu_more: "更多菜单"
  };
  if (menuLabels[id]) return menuLabels[id];

  const cleaned = id
    .replace(/^menu_/u, "")
    .replace(/_/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (!cleaned) return "未知地点";
  return cleaned.replace(/\b([a-z])/gu, (all, c) => c.toUpperCase());
}

function fmtDelta(name, before, after, options = {}) {
  const decimals = Number.isFinite(options.decimals) ? options.decimals : 1;
  const suffix = String(options.suffix || "");
  const useMoney = !!options.money;
  const formatValue = typeof options.formatValue === "function"
    ? options.formatValue
    : (value) => (useMoney ? formatMoneyFromCents(value) : formatNumber(value, decimals));
  const formatDeltaValue = typeof options.formatDeltaValue === "function"
    ? options.formatDeltaValue
    : (value) => (useMoney ? formatMoneyFromCents(value) : Math.abs(toFiniteNumber(value, 0)).toFixed(decimals));
  const b = formatValue(before);
  const a = formatValue(after);
  const deltaRaw = toFiniteNumber(after, 0) - toFiniteNumber(before, 0);
  const d = `${deltaRaw >= 0 ? "+" : "-"}${formatDeltaValue(Math.abs(deltaRaw))}`;
  return `${name} ${b}${suffix} → ${a}${suffix} (${d}${suffix})`;
}

function normalizeDeltaToastPayload(payload = {}) {
  const hasExplicitTitle = Object.prototype.hasOwnProperty.call(payload || {}, "title");
  const normalizedTitle = String(payload?.title || "").trim();
  const title = hasExplicitTitle ? normalizedTitle : "状态更新";
  const lines = Array.isArray(payload?.lines)
    ? payload.lines.map((line) => {
      if (line && typeof line === "object") {
        const label = String(line.label || "").trim();
        const deltaRaw = Number(line.delta);
        const decimals = Number.isFinite(Number(line.decimals)) ? Math.max(0, Math.trunc(Number(line.decimals))) : 0;
        const text = String(line.text || "").trim();
        const delta = Number.isFinite(deltaRaw) ? deltaRaw : null;
        const absDelta = delta === null ? "" : Math.abs(delta).toFixed(decimals);
        const signedDelta = delta === null ? "" : `${delta > 0 ? "+" : delta < 0 ? "-" : ""}${absDelta || "0"}`;
        const derivedText = text || (label && signedDelta ? `${label} ${signedDelta}` : text);
        return derivedText
          ? {
              label: label || null,
              delta,
              decimals,
              text: derivedText
            }
          : null;
      }
      const text = String(line || "").trim();
      return text ? { label: null, delta: null, decimals: 0, text } : null;
    }).filter((line) => line && line.text).slice(0, 5)
    : [];
  const variant = String(payload?.variant || "").trim().toLowerCase();
  const semanticType = String(payload?.semanticType || "").trim().toLowerCase();
  const icon = String(payload?.icon || "").trim().toLowerCase();
  const npcId = String(payload?.npcId || "").trim() || null;
  const displayName = String(payload?.displayName || "").trim() || null;
  const deltaRaw = Number(payload?.delta);
  return {
    title,
    lines,
    variant: variant || null,
    semanticType: semanticType || null,
    icon: icon || null,
    npcId,
    displayName,
    delta: Number.isFinite(deltaRaw) ? deltaRaw : null
  };
}

function appendToastSemanticIcon(doc, frame, normalizedPayload) {
  if (!doc || !frame) return null;

  if (normalizedPayload?.icon === "heart" && normalizedPayload?.semanticType === "social_favor_delta") {
    const iconWrap = doc.createElement("div");
    iconWrap.className = "delta-toast-transient-icon delta-toast-transient-icon-heart";
    iconWrap.setAttribute("aria-hidden", "true");
    iconWrap.textContent = "♥";
    frame.appendChild(iconWrap);
    return iconWrap;
  }

  if (normalizedPayload?.icon !== "book-abstract") return null;

  const iconWrap = doc.createElement("div");
  iconWrap.className = "delta-toast-transient-icon delta-toast-transient-icon-book";
  iconWrap.setAttribute("aria-hidden", "true");

  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  for (const d of [
    "M4.5 6.5C4.5 5.4 5.4 4.5 6.5 4.5H10.25C11.5 4.5 12.5 5.5 12.5 6.75V19.5C11.95 18.85 11.1 18.5 10.25 18.5H6.75C5.5 18.5 4.5 17.5 4.5 16.25V6.5Z",
    "M19.5 6.5C19.5 5.4 18.6 4.5 17.5 4.5H13.75C12.5 4.5 11.5 5.5 11.5 6.75V19.5C12.05 18.85 12.9 18.5 13.75 18.5H17.25C18.5 18.5 19.5 17.5 19.5 16.25V6.5Z",
    "M12 6.25V18.25"
  ]) {
    const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }

  iconWrap.appendChild(svg);
  frame.appendChild(iconWrap);
  return iconWrap;
}

function appendToastBody(doc, frame, normalizedPayload) {
  const body = doc.createElement("div");
  body.className = "delta-toast-transient-body";

  if (normalizedPayload.title) {
    const titleEl = doc.createElement("div");
    titleEl.className = "delta-toast-transient-title";
    titleEl.textContent = normalizedPayload.title;
    body.appendChild(titleEl);
  }

  for (const line of normalizedPayload.lines) {
    const row = doc.createElement("div");
    row.className = "delta-toast-transient-line";
    row.textContent = line.text;
    body.appendChild(row);
  }

  frame.appendChild(body);
  return body;
}

function normalizeRecordUnlockExpAmount(value) {
  const amount = Math.max(0, Math.trunc(Number(value || 0)));
  return amount > 0 ? amount : 10;
}

function collectProfileDeltaLines(report) {
  const beforeProfile = report?.profile?.apply?.before;
  const afterProfile = report?.profile?.apply?.after;
  if (!beforeProfile || !afterProfile) return [];

  const defs = [
    { key: "physique", label: "体格经验" },
    { key: "experience", label: "社会阅历" }
  ];

  const lines = [];
  for (const def of defs) {
    const beforeTotalXp = getProfileTotalXp(def.key, beforeProfile?.[def.key]?.level, beforeProfile?.[def.key]?.xp);
    const afterTotalXp = getProfileTotalXp(def.key, afterProfile?.[def.key]?.level, afterProfile?.[def.key]?.xp);
    if (beforeTotalXp === afterTotalXp) continue;
    lines.push({
      key: def.key,
      delta: afterTotalXp - beforeTotalXp,
      text: fmtDelta(def.label, beforeTotalXp, afterTotalXp, { decimals: 0 })
    });
  }

  return lines;
}

function getWorldviewAxisDelta(report) {
  const beforeAxis = Number(report?.profile?.apply?.before?.worldview?.axis ?? 0);
  const afterAxis = Number(report?.profile?.apply?.after?.worldview?.axis ?? 0);
  if (!Number.isFinite(beforeAxis) || !Number.isFinite(afterAxis)) return 0;
  return Math.trunc(afterAxis - beforeAxis);
}

export function buildWorldviewReadingToastPayloadFromReport(report) {
  const worldviewAxisDelta = getWorldviewAxisDelta(report);
  if (!Number.isFinite(worldviewAxisDelta) || worldviewAxisDelta === 0) {
    return null;
  }

  const profileDeltaLines = collectProfileDeltaLines(report);
  const experienceLine = profileDeltaLines.find((line) => line?.key === "experience") || null;
  const lines = [{
    label: "理性",
    delta: worldviewAxisDelta,
    decimals: 0
  }];

  if (experienceLine && Number.isFinite(Number(experienceLine.delta)) && Number(experienceLine.delta) !== 0) {
    lines.push({
      label: "社会阅历",
      delta: Number(experienceLine.delta),
      decimals: 0
    });
  }

  return {
    title: "",
    variant: "worldview-reading",
    semanticType: "worldview_delta",
    icon: "book-abstract",
    lines
  };
}

export function ingestToastMessagePayloads({
  report = null,
  messages = [],
  createdAt = Date.now(),
  intentType = DATA_DELTA_TOAST_TRANSIENT_TYPE,
  timing = DEFAULT_DATA_DELTA_TOAST_TIMING
} = {}) {
  const baseCreatedAt = Number.isFinite(Number(createdAt)) ? Math.trunc(Number(createdAt)) : Date.now();
  const gameTimeMinutes = Number(report?.after?.time);
  const intents = [];
  const ledgerEntries = [];
  let offset = 0;

  for (const message of Array.isArray(messages) ? messages : []) {
    const normalizedPayload = normalizeDeltaToastPayload(message?.payload ?? message);
    if (normalizedPayload.lines.length === 0) continue;
    const lineTexts = normalizedPayload.lines.map((line) => line.text);

    const entryCreatedAt = baseCreatedAt + offset;
    const source = String(message?.source || "toast").trim() || "toast";
    const idPrefix = String(message?.idPrefix || source).trim() || "toast";
    const messageId = `${idPrefix}:${entryCreatedAt}:${offset}`;
    const dedupeKey = String(message?.dedupeKey || `${source}:${normalizedPayload.title}:${lineTexts.join("|")}`).trim();

    ledgerEntries.push({
      id: messageId,
      source,
      title: normalizedPayload.title,
      lines: lineTexts,
      variant: normalizedPayload.variant,
      gameTimeMinutes: Number.isFinite(gameTimeMinutes) ? Math.trunc(gameTimeMinutes) : null,
      createdAt: entryCreatedAt
    });

    intents.push({
      id: messageId,
      type: intentType,
      lane: "toast",
      priority: "normal",
      createdAt: entryCreatedAt,
      dedupeKey,
      payload: normalizedPayload,
      emphasisTargets: [],
      timing
    });

    offset += 1;
  }

  appendMessageLedgerEntries(ledgerEntries);
  return intents;
}

export function getRecentToastMessageEntries(options = {}) {
  return getRecentMessageLedgerEntries(options);
}

export function clearToastMessageLedger() {
  return clearMessageLedger();
}

function renderDataDeltaToastPresenter({ payload, itemRoot, documentRoot }) {
  const doc = documentRoot || (typeof document !== "undefined" ? document : null);
  if (!doc || !itemRoot) return null;

  const normalizedPayload = normalizeDeltaToastPayload(payload);
  if (normalizedPayload.lines.length === 0) return null;

  itemRoot.classList.add("delta-toast-transient");
  if (normalizedPayload.variant === "record-unlock") {
    itemRoot.classList.add("delta-toast--record-unlock");
  }
  if (normalizedPayload.variant === "worldview-reading") {
    itemRoot.classList.add("delta-toast--worldview-reading");
  }
  if (normalizedPayload.semanticType === "social_favor_delta") {
    itemRoot.classList.add("delta-toast--social-favor");
  }

  const frame = doc.createElement("div");
  frame.className = "delta-toast-transient-frame";

  appendToastSemanticIcon(doc, frame, normalizedPayload);
  appendToastBody(doc, frame, normalizedPayload);

  itemRoot.appendChild(frame);
  return {
    signalTarget: frame
  };
}

export function buildDataDeltaToastPayloadFromReport(report, options = {}) {
  if (!report || !report.before || !report.after) return null;

  const omitProfileKeys = new Set(
    Array.isArray(options?.omitProfileKeys)
      ? options.omitProfileKeys.map((key) => String(key || "").trim()).filter(Boolean)
      : []
  );

  const before = report.before;
  const after = report.after;
  const clinicBillPayment = isClinicBillPaymentAction(report?.action?.id);
  const numericLines = [];
  if (before.time !== after.time) {
    numericLines.push(fmtDelta("时间", before.time, after.time, {
      formatValue: (value) => formatMinutes(value),
      formatDeltaValue: (value) => formatMinutes(value)
    }));
  }
  if (before.money !== after.money) {
    numericLines.push(fmtDelta("货币", before.money, after.money, clinicBillPayment
      ? {
          formatValue: (value) => formatWalletMoney(value),
          formatDeltaValue: (value) => formatWalletMoney(value)
        }
      : { decimals: 0 }));
  }
  if (before.hp !== after.hp) numericLines.push(fmtDelta("HP", before.hp, after.hp, { decimals: 1 }));
  if (before.satiety !== after.satiety) numericLines.push(fmtDelta("饱腹", before.satiety, after.satiety, { decimals: 1 }));
  if (before.stamina !== after.stamina) numericLines.push(fmtDelta("体力", before.stamina, after.stamina, { decimals: 1 }));
  if (before.fatigue !== after.fatigue) numericLines.push(fmtDelta("疲劳", before.fatigue, after.fatigue, { decimals: 1 }));
  if (before.totalBillCents !== after.totalBillCents) {
    numericLines.push(fmtDelta("医疗账单", before.totalBillCents, after.totalBillCents, { money: true }));
  }

  numericLines.push(...collectProfileDeltaLines(report)
    .filter((line) => !omitProfileKeys.has(String(line?.key || "").trim()))
    .map((line) => line.text));

  if (numericLines.length === 0) {
    return null;
  }

  const lines = [];
  if (before.mapId !== after.mapId) {
    lines.push(`地点 ${formatMapLabel(before.mapId)} → ${formatMapLabel(after.mapId)}`);
  }
  lines.push(...numericLines);

  return {
    title: "状态更新",
    lines: lines.slice(0, 5)
  };
}

export function buildRecordUnlockToastPayloadsFromReport(report) {
  const results = Array.isArray(report?.records?.results) ? report.records.results : [];
  const seenRecordIds = new Set();
  const payloads = [];

  for (const row of results) {
    if (row?.reason !== "first_unlock" || row?.rewardGrantedAfterCommit !== true) continue;

    const recordId = String(row?.recordId || "").trim();
    if (recordId && seenRecordIds.has(recordId)) continue;
    if (recordId) seenRecordIds.add(recordId);

    const expAmount = normalizeRecordUnlockExpAmount(row?.grantedExpAmount);
    payloads.push({
      title: "状态更新",
      variant: "record-unlock",
      lines: [`社会阅历+${expAmount}，新纪录解锁！`]
    });
  }

  return payloads;
}

export function ensureDataDeltaToastRegistration() {
  if (didRegisterDataDeltaToast) return true;

  registerTransientPresenter(DATA_DELTA_TOAST_TRANSIENT_TYPE, {
    render: renderDataDeltaToastPresenter
  });

  didRegisterDataDeltaToast = true;
  return true;
}
