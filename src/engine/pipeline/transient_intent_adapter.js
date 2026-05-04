import {
  TRANSIENT_LANE_KINDS,
  TRANSIENT_PRIORITY,
  TRANSIENT_TIMING_PRESETS,
  normalizeTransientLaneKind,
  normalizeTransientPriority
} from "../../ui/transient/transient_contract.js";
import {
  CRITICAL_STATE_NOTICE_TIMING,
  CRITICAL_STATE_NOTICE_TRANSIENT_TYPE
} from "../../ui/critical_state_notice.js";
import {
  DOSSIER_ATTENTION_FEEDBACK_TIMING,
  DOSSIER_ATTENTION_TRANSIENT_TYPE
} from "../../ui/dossier_attention_feedback.js";
import {
  RECORD_UNLOCK_TRANSIENT_TYPE
} from "../../ui/record_unlock_feedback.js";
import { DOSSIER_ENTRY_EMPHASIS_TARGET } from "../../ui/transient/sidebar_dossier_entry_emphasis.js";
import {
  buildDataDeltaToastPayloadFromReport,
  buildWorldviewReadingToastPayloadFromReport,
  buildRecordUnlockToastPayloadsFromReport,
  getRecentToastMessageEntries,
  ingestToastMessagePayloads,
  DATA_DELTA_TOAST_TRANSIENT_TYPE
} from "../../ui/toast.js";
import { getNpcDefinition } from "../social/npc_registry.js";
import { SYSCALL_TYPES } from "./plan_types.js";

function formatArchiveClockText(totalMinutes) {
  const minutes = Number(totalMinutes);
  if (!Number.isFinite(minutes) || minutes < 0) return "时间未知";
  const safeMinutes = Math.trunc(minutes);
  const day = Math.floor(safeMinutes / 1440) + 1;
  const minutesInDay = ((safeMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(minutesInDay / 60);
  const minute = minutesInDay % 60;
  return `Day ${day} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatArchiveLocationText(mapId) {
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

function buildDeathArchiveLogEntries(report) {
  const currentTimeMinutes = Number(report?.after?.time);
  const entries = getRecentToastMessageEntries({
    nowTimeMinutes: Number.isFinite(currentTimeMinutes) ? currentTimeMinutes : null,
    windowMinutes: 24 * 60,
    limit: 6
  });

  if (entries.length === 0) {
    return [{
      timeText: "",
      title: "日志附记",
      bodyText: "过去 24 小时未记录到可归档的消息播报。"
    }];
  }

  return entries.map((entry) => ({
    timeText: Number.isFinite(Number(entry?.gameTimeMinutes)) ? formatArchiveClockText(entry.gameTimeMinutes) : "",
    title: String(entry?.title || "状态更新").trim() || "状态更新",
    bodyText: String(Array.isArray(entry?.lines) ? entry.lines[0] || "" : "").trim() || "无摘要。"
  }));
}

function buildDeathArchivePayload(report) {
  const after = report?.after || {};
  const criticalMode = String(after?.criticalMode || "").trim().toUpperCase();
  if (criticalMode !== "DEAD") return null;

  const timeText = formatArchiveClockText(after?.time);
  const locationText = formatArchiveLocationText(after?.mapId);
  return {
    mode: "death_archive",
    title: "死亡档案",
    timeText,
    locationText,
    statusText: "生命体征已终止。",
    summaryText: "本次生存记录已结束。",
    logEntries: buildDeathArchiveLogEntries(report)
  };
}

function shouldEmitDeathArchive(report) {
  const beforeCriticalMode = String(report?.before?.criticalMode || "NORMAL").trim().toUpperCase();
  const afterCriticalMode = String(report?.after?.criticalMode || "NORMAL").trim().toUpperCase();
  if (afterCriticalMode !== "DEAD") return false;
  if (beforeCriticalMode !== "DEAD") return true;

  const sysCalls = Array.isArray(report?.sysCalls) ? report.sysCalls : [];
  return sysCalls.some((row) => {
    const type = String(row?.call?.type || "").trim().toUpperCase();
    return type === SYSCALL_TYPES.LOAD_SLOT || type === SYSCALL_TYPES.IMPORT_SLOT;
  });
}

function normalizePayload(payload) {
  return payload && typeof payload === "object" ? payload : {};
}

function buildSocialFavorToastPayloadsFromReport(report) {
  const results = Array.isArray(report?.social?.results) ? report.social.results : [];
  const payloads = [];

  for (const row of results) {
    const favorBefore = Number(row?.favorBefore ?? 0);
    const favorAfter = Number(row?.favorAfter ?? 0);
    if (!Number.isFinite(favorBefore) || !Number.isFinite(favorAfter) || favorAfter <= favorBefore) continue;

    const npcId = String(row?.npcId || "").trim();
    const definition = getNpcDefinition(npcId);
    const displayName = String(definition?.profile?.displayName || npcId || "人物").trim() || "人物";
    const delta = Math.trunc(favorAfter - favorBefore);
    if (delta <= 0) continue;

    payloads.push({
      title: "状态更新",
      lines: [`${displayName} 好感 +${delta}`],
      variant: "social_favor",
      semanticType: "social_favor_delta",
      icon: "heart",
      npcId,
      displayName,
      delta
    });
  }

  return payloads;
}

export function buildTransientIntentSeed({
  id = "",
  type = "",
  lane = TRANSIENT_LANE_KINDS.CARD,
  priority = TRANSIENT_PRIORITY.NORMAL,
  createdAt = Date.now(),
  dedupeKey = "",
  payload = {},
  emphasisTargets = [],
  timing = {}
} = {}) {
  return {
    id: String(id || "").trim(),
    type: String(type || "").trim(),
    lane: normalizeTransientLaneKind(lane),
    priority: normalizeTransientPriority(priority),
    createdAt: Number.isFinite(Number(createdAt)) ? Math.trunc(Number(createdAt)) : Date.now(),
    dedupeKey: String(dedupeKey || "").trim(),
    payload: normalizePayload(payload),
    emphasisTargets: Array.isArray(emphasisTargets)
      ? emphasisTargets.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [],
    timing: {
      inMs: Number.isFinite(Number(timing?.inMs)) ? Math.trunc(Number(timing.inMs)) : undefined,
      holdMs: Number.isFinite(Number(timing?.holdMs)) ? Math.trunc(Number(timing.holdMs)) : undefined,
      outMs: Number.isFinite(Number(timing?.outMs)) ? Math.trunc(Number(timing.outMs)) : undefined
    }
  };
}

export function getTransientIntentsFromCommitReport(report, context = {}) {
  void context;
  const results = Array.isArray(report?.records?.results) ? report.records.results : [];
  const intents = [];
  const seenRecordIds = new Set();
  const createdAt = Date.now();
  const beforeCriticalMode = String(report?.before?.criticalMode || "NORMAL").trim().toUpperCase();
  const afterCriticalMode = String(report?.after?.criticalMode || "NORMAL").trim().toUpperCase();
  const beforeDossierAttention = report?.before?.dossierNeedsAttention === true;
  const afterDossierAttention = report?.after?.dossierNeedsAttention === true;

  if (shouldEmitDeathArchive(report)) {
    const deathArchivePayload = buildDeathArchivePayload(report);
    if (deathArchivePayload) {
      intents.push(buildTransientIntentSeed({
        id: `critical_state_notice:death_archive:${createdAt}`,
        type: CRITICAL_STATE_NOTICE_TRANSIENT_TYPE,
        lane: TRANSIENT_LANE_KINDS.CARD,
        priority: TRANSIENT_PRIORITY.HIGH,
        createdAt,
        dedupeKey: "critical_state_notice",
        payload: deathArchivePayload,
        emphasisTargets: [],
        timing: {
          inMs: CRITICAL_STATE_NOTICE_TIMING.inMs,
          holdMs: 5600,
          outMs: CRITICAL_STATE_NOTICE_TIMING.outMs
        }
      }));
    }
  } else if (afterCriticalMode === "COLLAPSE" && beforeCriticalMode !== afterCriticalMode) {
    intents.push(buildTransientIntentSeed({
      id: `critical_state_notice:${afterCriticalMode}:${createdAt}`,
      type: CRITICAL_STATE_NOTICE_TRANSIENT_TYPE,
      lane: TRANSIENT_LANE_KINDS.CARD,
      priority: TRANSIENT_PRIORITY.HIGH,
      createdAt,
      dedupeKey: "critical_state_notice",
      payload: {
        mode: afterCriticalMode
      },
      emphasisTargets: [],
      timing: CRITICAL_STATE_NOTICE_TIMING
    }));
  }

  if (afterDossierAttention && !beforeDossierAttention) {
    intents.push(buildTransientIntentSeed({
      id: `dossier_attention_guide:${createdAt}`,
      type: DOSSIER_ATTENTION_TRANSIENT_TYPE,
      lane: TRANSIENT_LANE_KINDS.CARD,
      priority: TRANSIENT_PRIORITY.LOW,
      createdAt,
      dedupeKey: "dossier_attention_guide",
      payload: {
        title: "查看档案",
        body: "点击“档案”查看角色的属性信息。"
      },
      emphasisTargets: [DOSSIER_ENTRY_EMPHASIS_TARGET],
      timing: DOSSIER_ATTENTION_FEEDBACK_TIMING
    }));
  }

  for (const row of results) {
    if (row?.reason !== "first_unlock" || row?.rewardGrantedAfterCommit !== true) continue;

    const recordId = String(row?.recordId || "").trim();
    if (!recordId || seenRecordIds.has(recordId)) continue;
    seenRecordIds.add(recordId);

    const grantedExpAmount = Number(row?.grantedExpAmount || 0);
    const expAmount = Number.isFinite(grantedExpAmount) && grantedExpAmount > 0
      ? Math.trunc(grantedExpAmount)
      : 0;

    if (expAmount <= 0) continue;

    intents.push(buildTransientIntentSeed({
      id: `record_unlock:${recordId}:${intents.length}`,
      type: RECORD_UNLOCK_TRANSIENT_TYPE,
      lane: TRANSIENT_LANE_KINDS.CARD,
      priority: TRANSIENT_PRIORITY.NORMAL,
      createdAt,
      dedupeKey: `record_unlock:${recordId}`,
      payload: {
        recordId,
        expAmount,
        title: `阅历＋${expAmount}`,
        subtitle: "新纪录已解锁！"
      },
      emphasisTargets: ["records_entry"],
      timing: TRANSIENT_TIMING_PRESETS.RECORD_UNLOCK_CARD
    }));
  }

  const toastMessages = [];
  const worldviewReadingToastPayload = buildWorldviewReadingToastPayloadFromReport(report);
  if (worldviewReadingToastPayload) {
    toastMessages.push({
      idPrefix: "worldview_reading_toast",
      source: "worldview_reading_toast",
      dedupeKey: `worldview_reading_toast:${worldviewReadingToastPayload.lines.map((line) => `${line.label}:${line.delta}`).join("|")}`,
      payload: worldviewReadingToastPayload
    });
  }

  const deltaToastPayload = buildDataDeltaToastPayloadFromReport(report, {
    omitProfileKeys: worldviewReadingToastPayload ? ["experience"] : []
  });
  if (deltaToastPayload) {
    toastMessages.push({
      idPrefix: "data_delta_toast",
      source: "data_delta_toast",
      dedupeKey: `data_delta_toast:${deltaToastPayload.title}:${deltaToastPayload.lines.join("|")}`,
      payload: deltaToastPayload
    });
  }

  const recordUnlockToastPayloads = buildRecordUnlockToastPayloadsFromReport(report);
  for (const payload of recordUnlockToastPayloads) {
    toastMessages.push({
      idPrefix: "record_unlock_toast",
      source: "record_unlock_toast",
      dedupeKey: `record_unlock_toast:${payload.lines.join("|")}`,
      payload
    });
  }

  const socialFavorToastPayloads = buildSocialFavorToastPayloadsFromReport(report);
  for (const payload of socialFavorToastPayloads) {
    toastMessages.push({
      idPrefix: "social_favor_toast",
      source: "social_favor_toast",
      dedupeKey: `social_favor_toast:${payload.lines.join("|")}`,
      payload
    });
  }

  // Rejection-driven lightweight notices reuse the existing toast presenter/runtime.
  // Resolve only stores payload data on report.plan.rejection, so UI feedback stays inside one owner chain.
  const rejectionToast = report?.plan?.rejection?.transientToast;
  const rejectionLines = Array.isArray(rejectionToast?.lines)
    ? rejectionToast.lines.map((line) => String(line || "").trim()).filter(Boolean).slice(0, 5)
    : [];
  if (rejectionLines.length > 0) {
    toastMessages.push({
      idPrefix: "rejection_toast",
      source: "rejection_toast",
      dedupeKey: `rejection_toast:${rejectionLines.join("|")}`,
      payload: {
        title: String(rejectionToast?.title || "状态更新").trim() || "状态更新",
        lines: rejectionLines
      },
    });
  }

  if (toastMessages.length > 0) {
    intents.push(...ingestToastMessagePayloads({
      report,
      messages: toastMessages,
      createdAt,
      intentType: DATA_DELTA_TOAST_TRANSIENT_TYPE,
      timing: TRANSIENT_TIMING_PRESETS.DATA_DELTA_TOAST
    }).map((intent) => buildTransientIntentSeed(intent)));
  }

  return intents;
}
