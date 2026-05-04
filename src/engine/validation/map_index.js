// ============================================================================
// Map Index - 启动期扫描 data/maps/ 并建立索引（P0-4）
// ============================================================================

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} when fetching ${url}`);
  }
  return await res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} when fetching ${url}`);
  }
  return await res.json();
}

function normalizeMapsDirUrl(mapsDirUrl) {
  const s = String(mapsDirUrl || "").trim();
  if (!s) return "data/maps/";
  return s.endsWith("/") ? s : `${s}/`;
}

function normalizeExcludedFilenames(excludedFilenames) {
  if (!Array.isArray(excludedFilenames)) return new Set();
  return new Set(
    excludedFilenames
      .map((name) => String(name || "").trim())
      .filter((name) => name.length > 0)
  );
}

function extractJsonFilenamesFromDirectoryListing(html) {
  // 兼容 python -m http.server 的简单目录 listing
  const files = new Set();
  const re = /href\s*=\s*"([^"]+\.json)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const name = href.split("/").pop();
    if (name && name.toLowerCase().endsWith(".json")) {
      files.add(name);
    }
  }
  return Array.from(files).sort();
}

/**
 * @typedef {{filePath: string, message: string}} ParseError
 * @typedef {{mapId: string, files: string[]}} DuplicateId
 */

/**
 * @typedef {Object} MapIndex
 * @property {Map<string, { filePath: string, json: any }>} byId
 * @property {Array<{ filePath: string, json: any }>} all
 * @property {ParseError[]} parseErrors
 * @property {DuplicateId[]} duplicateIds
 */

/**
 * 扫描 mapsDirUrl（如 "data/maps/"）并建立 MapIndex
 * 约束：不硬编码地图列表；依赖目录 listing（开发期）
 * @param {string} mapsDirUrl
 * @param {{ excludedFilenames?: string[] }} [options]
 * @returns {Promise<MapIndex>}
 */
export async function buildMapIndex(mapsDirUrl, options = {}) {
  const dirUrl = normalizeMapsDirUrl(mapsDirUrl);
  const excludedFilenames = normalizeExcludedFilenames(options.excludedFilenames);

  /** @type {MapIndex} */
  const index = {
    byId: new Map(),
    all: [],
    parseErrors: [],
    duplicateIds: []
  };

  let listing;
  try {
    listing = await fetchText(dirUrl);
  } catch (e) {
    index.parseErrors.push({
      filePath: dirUrl,
      message: `无法读取目录 listing（需要本地服务器允许列目录）：${String(e?.message || e)}`
    });
    return index;
  }

  const filenames = extractJsonFilenamesFromDirectoryListing(listing)
    .filter((name) => !excludedFilenames.has(name));

  // 逐个拉取 JSON 并解析
  const idToFiles = new Map();

  for (const name of filenames) {
    const filePath = `${dirUrl}${name}`;
    let json;
    try {
      json = await fetchJson(filePath);
    } catch (e) {
      index.parseErrors.push({ filePath, message: String(e?.message || e) });
      continue;
    }

    if (!json || typeof json !== "object") {
      index.parseErrors.push({ filePath, message: "JSON 顶层必须是对象" });
      continue;
    }

    const mapId = typeof json.id === "string" ? json.id : "";
    if (!mapId) {
      index.parseErrors.push({ filePath, message: "缺少必需字段：id" });
      continue;
    }

    index.all.push({ filePath, json });

    if (!idToFiles.has(mapId)) idToFiles.set(mapId, []);
    idToFiles.get(mapId).push(filePath);

    // byId：不覆盖，保留第一个；重复由 duplicateIds 另行报告
    if (!index.byId.has(mapId)) {
      index.byId.set(mapId, { filePath, json });
    }
  }

  // 生成 duplicateIds
  for (const [mapId, files] of idToFiles.entries()) {
    if (files.length > 1) {
      index.duplicateIds.push({ mapId, files });
    }
  }

  return index;
}
