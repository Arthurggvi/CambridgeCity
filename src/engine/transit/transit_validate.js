import { getTransitRegistry } from "./transit_registry.js";

function buildIssue(kind, message, meta = {}) {
  return {
    kind,
    message,
    ...meta
  };
}

export function hasTransitStopId(stopId) {
  return getTransitRegistry().stopById.has(String(stopId || ""));
}

export function validateTransitData() {
  const registry = getTransitRegistry();
  const issues = [];

  for (const stop of registry.stops) {
    if (!String(stop?.stopId || "").trim()) {
      issues.push(buildIssue("stop_id_missing", "存在缺少 stopId 的站点资产。"));
    }
    const hasConcreteMap = !!String(stop?.mapId || "").trim();
    const isPlaceholder = !!String(stop?.uiMeta?.unimplementedNotice || "").trim();
    if (!hasConcreteMap && !isPlaceholder) {
      issues.push(buildIssue("stop_map_missing", `站点 ${String(stop?.stopId || "<unknown>")} 缺少 mapId。`));
    }
    for (const lineId of Array.isArray(stop?.lineIds) ? stop.lineIds : []) {
      const line = registry.lineById.get(String(lineId || ""));
      if (!line) {
        issues.push(buildIssue("stop_line_missing", `站点 ${String(stop?.stopId || "<unknown>")} 引用了不存在的线路 ${String(lineId || "")}`));
        continue;
      }
      const index = line.stopIds.indexOf(String(stop.stopId || ""));
      if (index < 0) {
        issues.push(buildIssue("stop_line_topology_mismatch", `站点 ${String(stop.stopId || "<unknown>")} 未出现在 ${line.lineId} 的 stopIds 中。`));
      }
    }
  }

  for (const line of registry.lines) {
    if (!String(line?.lineId || "").trim()) {
      issues.push(buildIssue("line_id_missing", "存在缺少 lineId 的线路资产。"));
    }
    if (!Array.isArray(line?.stopIds) || line.stopIds.length < 2) {
      issues.push(buildIssue("line_stop_count_invalid", `线路 ${String(line?.lineId || "<unknown>")} 至少需要两个站点。`));
    }
    if (!Array.isArray(line?.segmentMinutes) || line.segmentMinutes.length !== Math.max(0, line.stopIds.length - 1)) {
      issues.push(buildIssue("line_segment_minutes_invalid", `线路 ${String(line?.lineId || "<unknown>")} 的 segmentMinutes 与 stopIds 数量不匹配。`));
    }
    for (const stopId of Array.isArray(line?.stopIds) ? line.stopIds : []) {
      if (!registry.stopById.has(String(stopId || ""))) {
        issues.push(buildIssue("line_stop_missing", `线路 ${String(line?.lineId || "<unknown>")} 引用了不存在的站点 ${String(stopId || "")}`));
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues
  };
}