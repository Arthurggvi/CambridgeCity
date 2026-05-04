// 负责加载各种 json 数据：地图 / 事件（后续也会扩展到存档等）

import { validateMap } from "./validate/map_validate.js";
import { validateRegionData } from "./validation/region_validate.js";

const DATA_ROOT_URL = new URL("../../", import.meta.url);

const PLACE_EXPOSURE_LEVELS = new Set(["Sheltered", "SemiSheltered", "Open", "Ridge"]);
const PLACE_SPACE_TYPES = new Set(["indoor", "outdoor", "semi"]);

const DEFAULT_PLACE_PROFILE = Object.freeze({
  space: "outdoor",
  exposureLevel: "Open",
  windShelter: 0,
  heatSource: 0,
  drying: 0,
  exposureRateMultiplier: 1,
  exposureProfileTag: ""
});

/**
 * 通用 JSON 拉取器：统一错误处理，避免到处重复 try/catch
 * @param {string} url
 * @returns {Promise<object|null>}
 */
async function fetchJson(url) {
  const resolvedUrl = new URL(String(url || ""), DATA_ROOT_URL);
  if (resolvedUrl.protocol === "file:") {
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(resolvedUrl, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      console.error(`加载时发生错误：${resolvedUrl.href}`, err, { requestedUrl: url });
      return null;
    }
  }
  try {
    const res = await fetch(resolvedUrl, { cache: "no-store" });

    if (!res.ok) {
      console.error(`加载失败：${resolvedUrl.href}，HTTP 状态码：`, res.status, { requestedUrl: url });
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error(`加载时发生错误：${resolvedUrl.href}`, err, { requestedUrl: url });
    return null;
  }
}

/**
 * （可选）简单缓存：开发阶段避免重复 fetch
 * 如果你未来要热更新/编辑器，可在这里加 cache busting 或关闭缓存。
 */
const _mapCache = new Map();
const _eventCache = new Map();
const _regionCache = new Map();
const _regionByIdCache = new Map();
const _placeProfileCache = new Map();
const _placeProfileByIdCache = new Map();
const _mapContentIndexCache = new Map();
const _mapContentCache = new Map();
const _itemsDbCache = new Map();

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function normalizePlaceProfile(raw = {}, fallback = DEFAULT_PLACE_PROFILE) {
  const space = PLACE_SPACE_TYPES.has(raw?.space) ? raw.space : fallback.space;
  const exposureLevel = PLACE_EXPOSURE_LEVELS.has(raw?.exposureLevel)
    ? raw.exposureLevel
    : fallback.exposureLevel;

  return {
    space,
    exposureLevel,
    windShelter: clamp01(raw?.windShelter, fallback.windShelter),
    heatSource: clamp01(raw?.heatSource, fallback.heatSource),
    drying: clamp01(raw?.drying, fallback.drying),
    exposureRateMultiplier: (() => {
      const n = Number(raw?.exposureRateMultiplier);
      const base = Number(fallback?.exposureRateMultiplier);
      if (!Number.isFinite(n)) return Number.isFinite(base) ? base : 1;
      return Math.max(0.2, Math.min(1.4, n));
    })(),
    exposureProfileTag: String(raw?.exposureProfileTag || fallback?.exposureProfileTag || "").trim()
  };
}

function validatePlaceProfilesData(data, fileName = "place_profiles.json") {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.error(`${fileName} -> $: 必须是对象`);
    return false;
  }

  if (!data.profiles || typeof data.profiles !== "object" || Array.isArray(data.profiles)) {
    console.error(`${fileName} -> profiles: 必须是对象（key 为 mapId 或 placeProfileId）`);
    return false;
  }

  const defaults = normalizePlaceProfile(data.defaults || DEFAULT_PLACE_PROFILE, DEFAULT_PLACE_PROFILE);

  for (const [profileId, profile] of Object.entries(data.profiles)) {
    if (typeof profileId !== "string" || profileId.trim() === "") {
      console.error(`${fileName} -> profiles.<id>: 键必须是非空字符串`);
      return false;
    }
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      console.error(`${fileName} -> profiles.${profileId}: 必须是对象`);
      return false;
    }

    if (profile.space != null && !PLACE_SPACE_TYPES.has(profile.space)) {
      console.error(`${fileName} -> profiles.${profileId}.space: 必须是 indoor/outdoor/semi`);
      return false;
    }
    if (profile.exposureLevel != null && !PLACE_EXPOSURE_LEVELS.has(profile.exposureLevel)) {
      console.error(`${fileName} -> profiles.${profileId}.exposureLevel: 必须是 Sheltered/SemiSheltered/Open/Ridge`);
      return false;
    }

    for (const key of ["windShelter", "heatSource", "drying"]) {
      if (profile[key] != null) {
        const value = Number(profile[key]);
        if (!Number.isFinite(value) || value < 0 || value > 1) {
          console.error(`${fileName} -> profiles.${profileId}.${key}: 必须是 0..1`);
          return false;
        }
      }
    }

    if (profile.exposureRateMultiplier != null) {
      const value = Number(profile.exposureRateMultiplier);
      if (!Number.isFinite(value) || value < 0.2 || value > 1.4) {
        console.error(`${fileName} -> profiles.${profileId}.exposureRateMultiplier: 必须是 0.2..1.4`);
        return false;
      }
    }

    if (String(profile.exposureLevel || defaults.exposureLevel) === "Sheltered"
      && Number(profile.windShelter ?? defaults.windShelter ?? 0) > 0.5) {
      console.warn(`${fileName} -> profiles.${profileId}: exposureLevel=Sheltered 且 windShelter>0.5，可能出现双重风衰减`);
    }

    normalizePlaceProfile(profile, defaults);
  }

  return true;
}

/**
 * 加载一个地图 json
 * @param {string} mapId - 比如 "start" / "test_time"
 * @returns {Promise<object|null>} 成功返回 json 对象，失败返回 null
 */
export async function loadMap(mapId) {
  const url = `data/maps/${mapId}.json`;

  _mapCache.delete(url);

  const data = await fetchJson(url);
  if (!data) return null;

  // v0.3：加载后必须通过 schema 校验才允许缓存
  const fileName = `${mapId}.json`;
  const ok = validateMap(data, fileName);
  if (!ok) return null;

  await loadPlaceProfiles();

  const normalized = {
    ...data,
    placeProfileId: typeof data.placeProfileId === "string" && data.placeProfileId.trim() !== ""
      ? data.placeProfileId
      : mapId
  };
  normalized.placeProfile = getPlaceProfileForMap(mapId, normalized);

  _mapCache.set(url, normalized);

  return normalized;
}

/**
 * 加载一个事件 json
 * @param {string} eventId - 比如 "ev_pass_time_0_10_prompt"
 * @returns {Promise<object|null>}
 */
export async function loadEvent(eventId) {
  const url = `data/events/${eventId}.json`;

  _eventCache.delete(url);

  const data = await fetchJson(url);
  if (data) _eventCache.set(url, data);

  return data;
}

/**
 * 加载区域数据
 * @returns {Promise<object|null>}
 */
export async function loadRegionData() {
  const url = "data/regions/regions_winter.json";

  if (_regionCache.has(url)) return _regionCache.get(url);

  const data = await fetchJson(url);
  if (!data) return null;

  const ok = validateRegionData(data, "regions_winter.json");
  if (!ok) return null;

  _regionByIdCache.clear();
  for (const region of data.regions) {
    if (!region || typeof region.RegionId !== "string") continue;
    _regionByIdCache.set(region.RegionId, Object.freeze({ ...region }));
  }

  _regionCache.set(url, data);

  return data;
}

/**
 * 加载地点画像（PlaceProfile）配置。
 * 配置目标：把 indoor/outdoor、遮蔽等级、供暖能力等从地图逻辑中剥离。
 */
export async function loadPlaceProfiles() {
  const url = "data/places/place_profiles.json";

  if (_placeProfileCache.has(url)) return _placeProfileCache.get(url);

  const data = await fetchJson(url);
  if (!data) return null;

  const ok = validatePlaceProfilesData(data, "place_profiles.json");
  if (!ok) return null;

  const defaults = normalizePlaceProfile(data.defaults || DEFAULT_PLACE_PROFILE, DEFAULT_PLACE_PROFILE);
  _placeProfileByIdCache.clear();
  for (const [profileId, profile] of Object.entries(data.profiles || {})) {
    _placeProfileByIdCache.set(profileId, Object.freeze(normalizePlaceProfile(profile, defaults)));
  }

  const normalized = {
    schema: data.schema || "PlaceProfile/v1",
    defaults,
    profiles: data.profiles || {}
  };

  _placeProfileCache.set(url, normalized);
  return normalized;
}

/**
 * 同步读取 Region 配置（仅返回缓存数据，不触发网络请求）。
 */
export function getRegionConfigById(regionId) {
  const id = String(regionId || "").trim();
  if (!id) return null;
  return _regionByIdCache.get(id) || null;
}

/**
 * 同步读取 PlaceProfile（优先 map.placeProfileId，其次 mapId）。
 * 读取失败时返回默认 outdoor profile，保证调用方永远得到可用对象。
 */
export function getPlaceProfileForMap(mapId, mapData = null) {
  const profileId = String(mapData?.placeProfileId || mapId || "").trim();
  const byId = profileId ? _placeProfileByIdCache.get(profileId) : null;
  if (byId) return byId;

  const byMapId = mapId ? _placeProfileByIdCache.get(String(mapId)) : null;
  if (byMapId) return byMapId;

  const fallback = _placeProfileCache.get("data/places/place_profiles.json")?.defaults;
  return fallback || DEFAULT_PLACE_PROFILE;
}

/**
 * 加载地图内容索引（LocationSpec/SceneList/BlockerSpec 等）
 * @returns {Promise<object|null>}
 */
export async function loadMapContentIndex() {
  const url = "data/story/map_content_index.json";

  _mapContentIndexCache.delete(url);

  const data = await fetchJson(url);
  if (data) _mapContentIndexCache.set(url, data);
  return data;
}

/**
 * 按 locationId 加载结构化地图内容
 * @param {string} locationId
 * @returns {Promise<object|null>}
 */
export async function loadMapContent(locationId) {
  const index = await loadMapContentIndex();
  if (!index || !index.entries || typeof index.entries !== "object") return null;

  const rel = index.entries[locationId];
  if (typeof rel !== "string" || rel.trim() === "") return null;

  const url = `data/story/${rel}`;
  _mapContentCache.delete(url);

  const data = await fetchJson(url);
  if (data) _mapContentCache.set(url, data);
  return data;
}

/**
 * 加载物品数据库
 * @returns {Promise<object|null>}
 */
export async function loadItemsDb() {
  const indexUrl = "data/items/index.json";

  if (_itemsDbCache.has(indexUrl)) return _itemsDbCache.get(indexUrl);

  const index = await fetchJson(indexUrl);
  if (index && Array.isArray(index.sources) && index.sources.length > 0) {
    let seed = null;
    const byId = new Map();
    for (const rawSource of index.sources) {
      const rel = String(rawSource || "").trim();
      if (!rel) continue;
      const data = await fetchJson(`data/items/${rel}`);
      if (!data || !Array.isArray(data.items)) {
        console.error(`加载物品分包失败：data/items/${rel}`);
        return null;
      }
      if (!seed) {
        seed = { ...data };
        delete seed.items;
      }
      for (const item of data.items) {
        if (!item || typeof item.id !== "string" || !item.id.trim()) continue;
        byId.set(item.id, item);
      }
    }
    const merged = {
      ...(seed || {}),
      items: Array.from(byId.values())
    };
    _itemsDbCache.set(indexUrl, merged);
    return merged;
  }

  const url = "data/items/items.json";
  if (_itemsDbCache.has(url)) return _itemsDbCache.get(url);

  const data = await fetchJson(url);
  if (!data || !Array.isArray(data.items)) return null;

  _itemsDbCache.set(url, data);
  return data;
}
