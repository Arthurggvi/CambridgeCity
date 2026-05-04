import { buildArchivePageId } from "../archive_reading/pagination.js";

export const ARCHIVE_PAGE_TOKEN_PATTERN = /^(?:p\d{3}|\d+(?:\.\d+)+|[A-Za-z][A-Za-z0-9_-]*)$/;

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function pushError(errors, fileName, path, message) {
  errors.push(`${fileName} -> ${path}: ${message}`);
}

export function validateArchiveReadingContract(scene, fileName, basePath, context = {}) {
  const errors = [];
  const archiveReading = scene?.archiveReading;
  if (archiveReading == null) {
    return { ok: true, errors };
  }

  if (!isPlainObject(archiveReading)) {
    pushError(errors, fileName, `${basePath}.archiveReading`, "必须是对象");
    return { ok: false, errors };
  }

  if (normalizeText(scene?.type) !== "POINT") {
    pushError(errors, fileName, `${basePath}.type`, "archiveReading 仅允许挂在 POINT 场景");
  }

  const pageId = normalizeText(archiveReading.pageId);
  const sourceBookId = normalizeText(archiveReading.sourceBookId);
  const pageToken = normalizeText(archiveReading.pageToken);
  const isLeafPage = archiveReading.isLeafPage;
  const grantFirstViewReward = archiveReading.grantFirstViewReward;

  if (!pageId) {
    pushError(errors, fileName, `${basePath}.archiveReading.pageId`, "必须是非空字符串");
  }
  if (!sourceBookId) {
    pushError(errors, fileName, `${basePath}.archiveReading.sourceBookId`, "必须是非空字符串");
  }
  if (!pageToken) {
    pushError(errors, fileName, `${basePath}.archiveReading.pageToken`, "必须是非空字符串");
  } else if (!ARCHIVE_PAGE_TOKEN_PATTERN.test(pageToken)) {
    pushError(errors, fileName, `${basePath}.archiveReading.pageToken`, "命名非法；仅允许 p001 / 2.1 / 3.2 / author_token 这类稳定 token");
  }
  if (typeof isLeafPage !== "boolean") {
    pushError(errors, fileName, `${basePath}.archiveReading.isLeafPage`, "必须是 boolean");
  }
  if (typeof grantFirstViewReward !== "boolean") {
    pushError(errors, fileName, `${basePath}.archiveReading.grantFirstViewReward`, "必须是 boolean");
  }

  if (pageId && sourceBookId && pageToken) {
    const expectedPageId = buildArchivePageId(sourceBookId, pageToken);
    if (pageId !== expectedPageId) {
      pushError(errors, fileName, `${basePath}.archiveReading.pageId`, `必须与 sourceBookId/pageToken 对齐，期望 ${expectedPageId}`);
    }
  }

  if (grantFirstViewReward === true && isLeafPage !== true) {
    pushError(errors, fileName, `${basePath}.archiveReading.grantFirstViewReward`, "仅允许正文叶子页挂首读奖励");
  }

  const sceneId = normalizeText(scene?.id);
  const interactionsBySceneId = context?.interactionsBySceneId instanceof Map ? context.interactionsBySceneId : new Map();
  const sceneInteractions = interactionsBySceneId.get(sceneId) || [];
  if (isLeafPage === true) {
    if (sceneInteractions.length !== 2) {
      pushError(errors, fileName, `${basePath}.archiveReading`, "正文叶子页必须且只能有两个动作：返回/继续");
    } else {
      const texts = sceneInteractions.map((row) => normalizeText(row?.text)).sort();
      if (texts[0] !== "继续" || texts[1] !== "返回") {
        pushError(errors, fileName, `${basePath}.archiveReading`, "正文叶子页动作文本必须严格为 返回 / 继续");
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}