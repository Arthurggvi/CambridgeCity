import { getWorldTimeContext } from "../time.js";
import { DISPATCH_JOB_STATUS, resolveIndustrialDispatchStatus } from "../industrial_dispatch_status.js";
import { isTimedLocationWindowOpen } from "../timed_location_runtime.js";

function buildAvailabilityShape(status, options = {}) {
  return {
    status: String(status || "unknown").trim() || "unknown",
    available: options.available === true,
    endingSoon: options.endingSoon === true,
    full: options.full === true,
    weatherSuspended: options.weatherSuspended === true,
    visibilitySuspended: options.visibilitySuspended === true,
    nightClosed: options.nightClosed === true
  };
}

function toDispatchAvailabilityShape(status) {
  return buildAvailabilityShape(status, {
    available: status === DISPATCH_JOB_STATUS.OPEN || status === DISPATCH_JOB_STATUS.CLOSING,
    endingSoon: status === DISPATCH_JOB_STATUS.CLOSING,
    full: status === DISPATCH_JOB_STATUS.FULL,
    weatherSuspended: status === DISPATCH_JOB_STATUS.WEATHER_SUSPENDED,
    visibilitySuspended: status === DISPATCH_JOB_STATUS.VISIBILITY_SUSPENDED,
    nightClosed: status === DISPATCH_JOB_STATUS.NIGHT_CLOSED
  });
}

function normalizeMinuteOfDay(totalMinutes) {
  const total = Math.floor(Number(totalMinutes) || 0);
  return ((total % 1440) + 1440) % 1440;
}

function isMinuteInRange(minuteOfDay, startMinute, endMinute) {
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute)) return false;
  if (startMinute <= endMinute) {
    return minuteOfDay >= startMinute && minuteOfDay <= endMinute;
  }
  return minuteOfDay >= startMinute || minuteOfDay <= endMinute;
}

function buildIndustrialRejectionMessage(actionId, status, runtimeRejectText) {
  if (runtimeRejectText) return runtimeRejectText;
  if (status === DISPATCH_JOB_STATUS.NIGHT_CLOSED) {
    return "夜里不新收临工。请白班回工区分流口登记后再来。";
  }
  if (status === DISPATCH_JOB_STATUS.WEATHER_SUSPENDED) {
    if (actionId === "warehouse_subsidy_tag_shift") {
      return "风压太大，补贴标签先挂起。请回工区分流口等下一轮。";
    }
    return "风雪压线，箱单核对先暂停。请回工区分流口等窗口复开。";
  }
  if (status === DISPATCH_JOB_STATUS.VISIBILITY_SUSPENDED) {
    return "外场能见度太差，前场短工暂停受理。请回工区分流口等视线恢复。";
  }
  if (status === DISPATCH_JOB_STATUS.FULL) {
    if (actionId === "warehouse_subsidy_tag_shift") {
      return "补贴标签这批已满。请先回工区分流口看下一轮派工。";
    }
    return "箱单核对这会儿已满。请先回工区分流口等下一轮。";
  }
  return "当前不在受理窗口，请回工区分流口再确认。";
}

const JOB_AVAILABILITY_POLICIES = Object.freeze({
  always_open: Object.freeze({
    id: "always_open",
    type: "always_open",
    dialogTitle: "短工"
  }),
  industrial_dispatch_manifest: Object.freeze({
    id: "industrial_dispatch_manifest",
    type: "custom",
    dialogTitle: "仓储前场短工",
    resolve(gameState) {
      const worldTime = getWorldTimeContext(gameState?.time?.totalMinutes, gameState?.world);
      const dispatchStatus = resolveIndustrialDispatchStatus({
        time: gameState?.time,
        weather: gameState?.world?.weather,
        visibilityBand: worldTime?.illumination?.visibilityBand
      });
      return toDispatchAvailabilityShape(dispatchStatus.manifest);
    },
    buildRejectMessage({ actionId, availability, runtimeRejectText }) {
      return buildIndustrialRejectionMessage(actionId, availability?.status, runtimeRejectText);
    }
  }),
  industrial_dispatch_subsidy_tag: Object.freeze({
    id: "industrial_dispatch_subsidy_tag",
    type: "custom",
    dialogTitle: "仓储前场短工",
    resolve(gameState) {
      const worldTime = getWorldTimeContext(gameState?.time?.totalMinutes, gameState?.world);
      const dispatchStatus = resolveIndustrialDispatchStatus({
        time: gameState?.time,
        weather: gameState?.world?.weather,
        visibilityBand: worldTime?.illumination?.visibilityBand
      });
      return toDispatchAvailabilityShape(dispatchStatus.subsidyTag);
    },
    buildRejectMessage({ actionId, availability, runtimeRejectText }) {
      return buildIndustrialRejectionMessage(actionId, availability?.status, runtimeRejectText);
    }
  }),
  theseus_window_open: Object.freeze({
    id: "theseus_window_open",
    type: "timed_location_window_open",
    dialogTitle: "港口临时杂务",
    windowId: "theseus",
    closedMessage: "忒修斯号这轮靠泊杂务现在不收人。等船靠岸窗口开着时，再来港口登记。"
  })
});

export function getJobAvailabilityPolicyById(policyId) {
  return JOB_AVAILABILITY_POLICIES[String(policyId || "").trim()] || null;
}

export function resolveJobAvailability(gameState, availabilityPolicyId) {
  const policy = getJobAvailabilityPolicyById(availabilityPolicyId);
  if (!policy) {
    return buildAvailabilityShape("open", { available: true });
  }

  if (policy.type === "always_open") {
    return buildAvailabilityShape("open", { available: true });
  }

  if (policy.type === "time_range") {
    const minuteOfDay = normalizeMinuteOfDay(gameState?.time?.totalMinutes);
    const startMinute = Math.floor(Number(policy.startMinute) || 0);
    const endMinute = Math.floor(Number(policy.endMinute) || 0);
    const available = isMinuteInRange(minuteOfDay, startMinute, endMinute);
    return buildAvailabilityShape(available ? "open" : "time_range_closed", { available });
  }

  if (policy.type === "timed_location_window_open") {
    const available = isTimedLocationWindowOpen(policy.windowId, gameState?.time?.totalMinutes, gameState?.world);
    return buildAvailabilityShape(available ? "open" : "window_closed", { available });
  }

  if (policy.type === "custom" && typeof policy.resolve === "function") {
    return policy.resolve(gameState);
  }

  return buildAvailabilityShape("open", { available: true });
}

export function buildJobAvailabilityRejectionMessage(jobDefinition, availability, actionId, runtimeRejectText = "") {
  const policy = getJobAvailabilityPolicyById(jobDefinition?.availabilityPolicyId || jobDefinition?.availabilityPolicyKey);
  if (policy?.buildRejectMessage) {
    return policy.buildRejectMessage({
      jobDefinition,
      availability,
      actionId: String(actionId || "").trim(),
      runtimeRejectText: String(runtimeRejectText || "").trim()
    });
  }
  if (runtimeRejectText) return runtimeRejectText;
  if (policy?.closedMessage) return policy.closedMessage;
  return "当前不在受理窗口，请稍后再来。";
}

export function getJobAvailabilityDialogTitle(jobDefinition) {
  const policy = getJobAvailabilityPolicyById(jobDefinition?.availabilityPolicyId || jobDefinition?.availabilityPolicyKey);
  return String(policy?.dialogTitle || jobDefinition?.displayName || "短工").trim() || "短工";
}
