import { loadMap } from "../loader.js";
import { dispatch } from "../pipeline/dispatch.js";
import { BUS_ONBOARD_MAP_ID } from "../transit/transit_service.js";
import { getTransitRegistry } from "../transit/transit_registry.js";

const GENERIC_TRANSIENT_ACTION_TEXTS = new Set([
  "继续",
  "返回",
  "离开",
  "确认",
  "取消",
  "关闭",
  "摇头",
  "点头",
  "下一步",
  "继续前进"
]);

function normalizeMapId(value) {
  return String(value || "").trim();
}

function normalizeLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getMapsDirUrl() {
  return new URL("../../../data/maps/", import.meta.url);
}

async function readJsonFromUrl(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} when fetching ${url}`);
  }
  return await res.json();
}

async function readDebugMapEntriesFromFileSystem(mapsDirUrl) {
  const { readdir, readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");

  const dirPath = fileURLToPath(mapsDirUrl);
  const fileNames = (await readdir(dirPath))
    .filter((name) => String(name || "").toLowerCase().endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));

  const entries = [];
  for (const fileName of fileNames) {
    try {
      const fileUrl = new URL(fileName, mapsDirUrl);
      const raw = await readFile(fileURLToPath(fileUrl), "utf8");
      const json = JSON.parse(raw);
      if (!json || typeof json !== "object") continue;
      const mapId = normalizeMapId(json.id);
      if (!mapId) continue;
      entries.push({
        mapId,
        filePath: fileUrl.href,
        json
      });
    } catch (error) {
      console.warn(`[debug_teleport] skipped malformed map file: ${fileName} (${String(error?.message || error || "parse_failed")})`);
    }
  }

  return entries;
}

async function readDebugMapEntriesFromMapContentIndex(mapsDirUrl) {
  // Live Server / static hosting usually doesn't provide directory listing for /data/maps/.
  // Instead, reuse the formal story-side map content index to enumerate mapIds, then fetch each map JSON.
  const indexUrl = new URL("../../../data/story/map_content_index.json", import.meta.url);
  const index = await readJsonFromUrl(indexUrl);
  const entriesObj = index && typeof index === "object" ? index.entries : null;
  if (!entriesObj || typeof entriesObj !== "object") {
    throw new Error("map_content_index_missing_entries");
  }

  const mapIds = Object.keys(entriesObj)
    .map((id) => normalizeMapId(id))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  const entries = [];
  for (const mapId of mapIds) {
    const fileName = `${mapId}.json`;
    try {
      const fileUrl = new URL(fileName, mapsDirUrl);
      const json = await readJsonFromUrl(fileUrl);
      if (!json || typeof json !== "object") continue;
      const resolvedMapId = normalizeMapId(json.id);
      if (!resolvedMapId) continue;
      entries.push({
        mapId: resolvedMapId,
        filePath: fileUrl.href,
        json
      });
    } catch (error) {
      console.warn("[debug_teleport_catalog] skip map entry", {
        mapId,
        path: `data/maps/${fileName}`,
        message: String(error?.message || error || "fetch_failed")
      });
    }
  }

  return entries;
}

async function loadDebugMapEntries() {
  const mapsDirUrl = getMapsDirUrl();
  const attempts = [];

  if (mapsDirUrl.protocol === "file:") {
    try {
      return await readDebugMapEntriesFromFileSystem(mapsDirUrl);
    } catch (error) {
      attempts.push(String(error?.message || error || "filesystem_scan_failed"));
    }
  }

  try {
    // Browser environment: do NOT depend on directory listing.
    return await readDebugMapEntriesFromMapContentIndex(mapsDirUrl);
  } catch (error) {
    attempts.push(String(error?.message || error || "map_content_index_scan_failed"));
  }

  throw new Error(attempts.filter(Boolean).join(" | ") || "debug_teleport_catalog_scan_failed");
}

function stripActionTimeSuffix(text) {
  return normalizeLabel(String(text || "").replace(/[（(][^()（）]*\d+:\d+[^()（）]*[)）]\s*$/u, ""));
}

function extractNameRoot(name) {
  const normalized = normalizeLabel(name);
  if (!normalized) return "";
  const segments = normalized.split(/\s*[·•\-|—]\s*/u).map((part) => normalizeLabel(part)).filter(Boolean);
  return segments[0] || normalized;
}

function trimLabelPrefix(label, prefix) {
  const normalizedLabel = normalizeLabel(label);
  const normalizedPrefix = normalizeLabel(prefix);
  if (!normalizedLabel || !normalizedPrefix) return normalizedLabel;
  if (!normalizedLabel.startsWith(normalizedPrefix)) return normalizedLabel;
  const remainder = normalizeLabel(normalizedLabel.slice(normalizedPrefix.length).replace(/^[·•\-|—\s]+/u, ""));
  return remainder.length >= 2 ? remainder : normalizedLabel;
}

function buildMapStats(mapData) {
  const actions = Array.isArray(mapData?.actions) ? mapData.actions.filter(Boolean) : [];
  const interactions = Array.isArray(mapData?.interactions) ? mapData.interactions.filter(Boolean) : [];
  const edges = Array.isArray(mapData?.edges) ? mapData.edges.filter(Boolean) : [];
  const scenes = Array.isArray(mapData?.scenes) ? mapData.scenes.filter(Boolean) : [];

  let transitionCount = 0;
  let transitionMinutesMax = 0;
  let genericTransitionTextCount = 0;
  let structuredWorldActionCount = 0;
  let serviceInteractionCount = 0;
  const transitionTargets = new Set();

  for (const action of actions) {
    const kind = String(action?.kind || "").trim().toUpperCase();
    if (kind === "TRANSITION") {
      transitionCount += 1;
      const toMapId = normalizeMapId(action?.payload?.toMapId || action?.targetMapId);
      if (toMapId) transitionTargets.add(toMapId);
      const minutes = Number(action?.payload?.minutes);
      if (Number.isFinite(minutes)) transitionMinutesMax = Math.max(transitionMinutesMax, minutes);
      const strippedText = stripActionTimeSuffix(action?.text);
      if (GENERIC_TRANSIENT_ACTION_TEXTS.has(strippedText)) {
        genericTransitionTextCount += 1;
      }
      continue;
    }

    if (kind) {
      structuredWorldActionCount += 1;
      continue;
    }
  }

  for (const interaction of interactions) {
    const type = String(interaction?.type || "").trim().toUpperCase();
    if (!type) continue;
    if (type === "TRANSITION") {
      transitionCount += 1;
      continue;
    }
    structuredWorldActionCount += 1;
    if (type === "MENU_OPEN" || type === "SERVICE" || type === "SERVICE_OPEN") {
      serviceInteractionCount += 1;
    }
  }

  for (const edge of edges) {
    const toMapId = normalizeMapId(edge?.toMapId);
    if (!toMapId) continue;
    transitionCount += 1;
    transitionTargets.add(toMapId);
    const minutes = Number(edge?.minutes);
    if (Number.isFinite(minutes)) transitionMinutesMax = Math.max(transitionMinutesMax, minutes);
  }

  return {
    actions,
    interactions,
    edges,
    scenes,
    interactionCount: actions.length + interactions.length,
    transitionCount,
    transitionMinutesMax,
    genericTransitionTextCount,
    structuredWorldActionCount,
    serviceInteractionCount,
    uniqueTransitionTargetCount: transitionTargets.size,
    hasEnvironment: !!(mapData?.environment || mapData?.placeProfile),
    hasDescriptionVariants: !!(
      Array.isArray(mapData?.descriptionByMinuteOfDay)
      || Array.isArray(mapData?.descriptionByFlags)
      || mapData?.descriptionByRuntimeState
    ),
    hasUiActionGroups: Array.isArray(mapData?.ui?.actionGroups) && mapData.ui.actionGroups.length > 0,
    mapType: String(mapData?.mapType || "").trim().toLowerCase()
  };
}

function isPlaceholderLikeMap(mapData) {
  const haystack = `${normalizeLabel(mapData?.id)} ${normalizeLabel(mapData?.name)} ${normalizeLabel(mapData?.description)}`.toLowerCase();
  return /placeholder|acceptance|\btest\b|minimal|占位|验收/u.test(haystack);
}

function isDialogueOnlyMap(mapData, stats = buildMapStats(mapData)) {
  if (stats.structuredWorldActionCount > 0) return false;
  if (stats.serviceInteractionCount > 0) return false;
  if (stats.transitionCount <= 0) return false;
  if (stats.transitionMinutesMax <= 0 && stats.interactionCount <= 2) {
    return true;
  }
  if (stats.transitionCount === 1 && stats.uniqueTransitionTargetCount <= 1) {
    return true;
  }
  return stats.transitionMinutesMax <= 1
    && stats.genericTransitionTextCount >= stats.transitionCount
    && stats.uniqueTransitionTargetCount <= 1;
}

function isTransitVehicleOnlyMap(mapData, stats = buildMapStats(mapData)) {
  const kinds = stats.actions
    .map((action) => String(action?.kind || "").trim().toUpperCase())
    .filter(Boolean);
  if (kinds.length === 0) return false;
  return kinds.every((kind) => kind === "TRANSIT_GET_OFF" || kind === "TRANSIT_CONTINUE");
}

function isEphemeralServiceNode(mapData, stats = buildMapStats(mapData)) {
  if (stats.scenes.length > 1) return false;
  if (stats.serviceInteractionCount <= 0) return false;
  if (stats.edges.length > 1) return false;
  return stats.transitionCount <= 1 && stats.structuredWorldActionCount <= stats.serviceInteractionCount + 1;
}

function isTransientScenelet(mapData, stats = buildMapStats(mapData)) {
  if (stats.scenes.length > 1) return false;
  if (stats.transitionCount !== 1) return false;
  if (stats.structuredWorldActionCount > 0) return false;
  return stats.interactionCount <= 1;
}

function isDebugTeleportableMap(mapData, context = {}) {
  if (!mapData || typeof mapData !== "object") return false;
  const stats = context.stats || buildMapStats(mapData);

  if (isPlaceholderLikeMap(mapData)) return false;
  if (!stats.hasEnvironment && !stats.hasDescriptionVariants && !stats.hasUiActionGroups && stats.transitionCount <= 0) {
    return false;
  }
  if (isTransitVehicleOnlyMap(mapData, stats)) return false;
  if (isDialogueOnlyMap(mapData, stats)) return false;
  if (isEphemeralServiceNode(mapData, stats)) return false;
  if (isTransientScenelet(mapData, stats)) return false;

  return stats.transitionCount > 0 || stats.structuredWorldActionCount > 0;
}

function extractOutboundMapRefs(mapData) {
  const refs = new Set();
  const stopRegistry = getTransitRegistry().stopById;
  const actions = Array.isArray(mapData?.actions) ? mapData.actions : [];

  for (const action of actions) {
    if (!action || typeof action !== "object") continue;
    const kind = String(action.kind || "").trim().toUpperCase();
    const targetMapId = normalizeMapId(action?.payload?.toMapId || action?.targetMapId);
    if (targetMapId) refs.add(targetMapId);

    if (kind === "TRANSIT_STOP_ENTRY") {
      const stopId = normalizeMapId(action?.payload?.stopId);
      const stop = stopRegistry.get(stopId);
      const stopMapId = normalizeMapId(stop?.mapId);
      if (stopMapId) refs.add(stopMapId);
      continue;
    }

    if (kind === "TRANSIT_BOARD") {
      refs.add(BUS_ONBOARD_MAP_ID);
    }

    if (kind === "TRANSIT_GET_OFF") {
      for (const stop of getTransitRegistry().stops) {
        const stopMapId = normalizeMapId(stop?.mapId);
        if (stopMapId) refs.add(stopMapId);
      }
    }
  }

  const transitions = Array.isArray(mapData?.link?.transitions) ? mapData.link.transitions : [];
  for (const transition of transitions) {
    const targetMapId = normalizeMapId(transition?.toMapId);
    if (targetMapId) refs.add(targetMapId);
  }

  const edges = Array.isArray(mapData?.edges) ? mapData.edges : [];
  for (const edge of edges) {
    const targetMapId = normalizeMapId(edge?.toMapId);
    if (targetMapId) refs.add(targetMapId);
  }

  return Array.from(refs);
}

function buildPrefixCounts(records) {
  const counts = new Map();
  for (const record of records) {
    const tokens = String(record.mapId || "").split("_").filter(Boolean);
    if (tokens.length <= 0) continue;
    counts.set(tokens[0], (counts.get(tokens[0]) || 0) + 1);
    if (tokens.length >= 2 && !/^\d+$/.test(tokens[1])) {
      const pairKey = `${tokens[0]}_${tokens[1]}`;
      counts.set(pairKey, (counts.get(pairKey) || 0) + 1);
    }
  }
  return counts;
}

function inferTeleportFamilyKey(record, prefixCounts) {
  const tokens = String(record.mapId || "").split("_").filter(Boolean);
  if (tokens.length <= 0) return record.mapId;
  if (tokens.length >= 2 && !/^\d+$/.test(tokens[1])) {
    const pairKey = `${tokens[0]}_${tokens[1]}`;
    if ((prefixCounts.get(pairKey) || 0) >= 2) {
      return pairKey;
    }
  }
  return tokens[0];
}

function computeCommonNamePrefix(names) {
  const normalized = names.map((name) => normalizeLabel(name)).filter(Boolean);
  if (normalized.length <= 1) return normalized[0] || "";

  let prefix = normalized[0];
  for (let index = 1; index < normalized.length && prefix; index += 1) {
    const current = normalized[index];
    while (prefix && !current.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }

  return normalizeLabel(prefix.replace(/[·•\-|—\s]+$/u, ""));
}

function buildInboundCount(records) {
  const inboundCountByMapId = new Map();
  for (const record of records) {
    for (const targetMapId of record.outboundMapIds) {
      inboundCountByMapId.set(targetMapId, (inboundCountByMapId.get(targetMapId) || 0) + 1);
    }
  }
  return inboundCountByMapId;
}

function inferGroupAnchor(records, familyKey, inboundCountByMapId) {
  return records
    .map((record) => {
      const internalOutbound = record.outboundMapIds.filter((targetMapId) => {
        const target = records.find((candidate) => candidate.mapId === targetMapId);
        return target?.familyKey === familyKey;
      }).length;
      return {
        record,
        score: internalOutbound + (inboundCountByMapId.get(record.mapId) || 0)
      };
    })
    .sort((left, right) => right.score - left.score || left.record.mapId.localeCompare(right.record.mapId))[0]?.record || records[0] || null;
}

function buildGroupLabel(records, anchorRecord) {
  const names = records.map((record) => record.name).filter(Boolean);
  const commonPrefix = computeCommonNamePrefix(names);
  if (commonPrefix.length >= 2) return commonPrefix;

  const rootCounts = new Map();
  for (const name of names) {
    const root = extractNameRoot(name);
    if (!root) continue;
    rootCounts.set(root, (rootCounts.get(root) || 0) + 1);
  }
  const repeatedRoot = Array.from(rootCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  if (repeatedRoot?.[1] >= 2) return repeatedRoot[0];

  return normalizeLabel(anchorRecord?.name || anchorRecord?.mapId || records[0]?.mapId || "未命名区域");
}

function buildChildEntries(records, groupLabel, anchorMapId) {
  const baseEntries = records.map((record) => ({
    mapId: record.mapId,
    name: record.name,
    subtitle: record.mapId,
    label: trimLabelPrefix(record.name, groupLabel),
    isAnchor: record.mapId === anchorMapId
  }));

  const labelCounts = new Map();
  for (const entry of baseEntries) {
    labelCounts.set(entry.label, (labelCounts.get(entry.label) || 0) + 1);
  }

  for (const entry of baseEntries) {
    if ((labelCounts.get(entry.label) || 0) <= 1) continue;
    const tail = entry.mapId.split("_").filter(Boolean).pop() || entry.mapId;
    entry.label = `${entry.label} · ${tail}`;
  }

  return baseEntries.sort((left, right) => {
    if (left.isAnchor !== right.isAnchor) return left.isAnchor ? -1 : 1;
    return left.mapId.localeCompare(right.mapId);
  });
}

export async function buildDebugTeleportCatalog() {
  const mapEntries = await loadDebugMapEntries();
  const baseRecords = mapEntries.map((entry) => {
    const stats = buildMapStats(entry.json);
    return {
      mapId: entry.mapId,
      name: normalizeLabel(entry.json?.name || entry.mapId),
      json: entry.json,
      stats,
      outboundMapIds: extractOutboundMapRefs(entry.json)
    };
  });

  const teleportableRecords = baseRecords.filter((record) => isDebugTeleportableMap(record.json, { stats: record.stats }));
  const prefixCounts = buildPrefixCounts(teleportableRecords);
  const teleportableById = new Map();

  for (const record of teleportableRecords) {
    record.familyKey = inferTeleportFamilyKey(record, prefixCounts);
    teleportableById.set(record.mapId, record);
  }

  const inboundCountByMapId = buildInboundCount(teleportableRecords);
  const groupsById = new Map();
  for (const record of teleportableRecords) {
    if (!groupsById.has(record.familyKey)) {
      groupsById.set(record.familyKey, []);
    }
    groupsById.get(record.familyKey).push(record);
  }

  const groups = Array.from(groupsById.entries())
    .map(([groupId, records]) => {
      const anchorRecord = inferGroupAnchor(records, groupId, inboundCountByMapId);
      const label = buildGroupLabel(records, anchorRecord);
      return {
        id: groupId,
        label,
        anchorMapId: anchorRecord?.mapId || records[0]?.mapId || "",
        nodes: buildChildEntries(records, label, anchorRecord?.mapId || "")
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, "zh-Hans-CN"));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    groupCount: groups.length,
    mapCount: teleportableRecords.length,
    groups,
    mapIds: Array.from(teleportableById.keys())
  };
}

export async function runDebugTeleportByMapId(mapId) {
  const normalizedMapId = normalizeMapId(mapId);
  if (!normalizedMapId) {
    return { ok: false, error: "missing-teleport-map-id" };
  }

  const targetMap = await loadMap(normalizedMapId);
  if (!targetMap) {
    return { ok: false, error: `unknown-teleport-target:${normalizedMapId}` };
  }

  await dispatch("debug_teleport", { mapId: normalizedMapId });
  return {
    ok: true,
    target: {
      mapId: normalizedMapId,
      label: normalizeLabel(targetMap?.name || normalizedMapId)
    }
  };
}

export {
  isDebugTeleportableMap,
  isDialogueOnlyMap
};
