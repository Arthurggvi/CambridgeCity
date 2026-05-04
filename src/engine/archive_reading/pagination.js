export const ARCHIVE_PAGINATION_MODES = Object.freeze({
  PARAGRAPH: "paragraph",
  LEGAL: "legal"
});

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function splitParagraphs(text) {
  return normalizeText(text)
    .split(/\n\s*\n+/)
    .map((row) => row.trim())
    .filter(Boolean);
}

function countSentences(paragraph) {
  const text = normalizeText(paragraph);
  if (!text) return 0;
  const matches = text.match(/[。！？!?]+/g);
  return matches ? matches.length : 1;
}

function mergeShortParagraphPages(paragraphs) {
  const pages = [];
  for (const paragraph of paragraphs) {
    const text = normalizeText(paragraph);
    if (!text) continue;
    const isSingleSentence = countSentences(text) <= 1;
    if (isSingleSentence && pages.length > 0) {
      pages[pages.length - 1] = `${pages[pages.length - 1]}\n\n${text}`;
      continue;
    }
    pages.push(text);
  }
  if (pages.length >= 2 && countSentences(pages[0]) <= 1) {
    pages[1] = `${pages[0]}\n\n${pages[1]}`;
    pages.shift();
  }
  return pages;
}

function splitLegalSections(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const lines = normalized.split("\n");
  const sections = [];
  let current = [];

  const flushCurrent = () => {
    const joined = current.join("\n").trim();
    if (joined) sections.push(joined);
    current = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      if (current.length > 0) current.push("");
      continue;
    }
    if (/^\d+(?:\.\d+)+\b/.test(line.trim())) {
      flushCurrent();
      current.push(line.trim());
      continue;
    }
    current.push(line.trim());
  }
  flushCurrent();
  return sections;
}

function normalizePageToken(pageToken) {
  return String(pageToken || "")
    .trim()
    .replace(/\s+/g, "_");
}

export function buildArchivePageId(sourceBookId, pageToken) {
  const normalizedSourceBookId = normalizePageToken(sourceBookId);
  const normalizedPageToken = normalizePageToken(pageToken);
  if (!normalizedSourceBookId || !normalizedPageToken) {
    throw new Error("buildArchivePageId requires sourceBookId and pageToken");
  }
  return `archive_page:${normalizedSourceBookId}#${normalizedPageToken}`;
}

export function paginateArchiveText(text, { mode = ARCHIVE_PAGINATION_MODES.PARAGRAPH } = {}) {
  const normalizedMode = String(mode || ARCHIVE_PAGINATION_MODES.PARAGRAPH).trim().toLowerCase();
  if (normalizedMode === ARCHIVE_PAGINATION_MODES.LEGAL) {
    return splitLegalSections(text);
  }
  return mergeShortParagraphPages(splitParagraphs(text));
}

export function buildArchivePageSpecs({
  sourceBookId,
  text,
  mode = ARCHIVE_PAGINATION_MODES.PARAGRAPH,
  tokens = []
} = {}) {
  const pages = paginateArchiveText(text, { mode });
  const normalizedSourceBookId = normalizePageToken(sourceBookId);
  if (!normalizedSourceBookId) {
    throw new Error("buildArchivePageSpecs requires a non-empty sourceBookId");
  }

  return pages.map((pageText, index) => {
    const pageToken = normalizePageToken(tokens[index] || (mode === ARCHIVE_PAGINATION_MODES.LEGAL ? `${index + 1}` : `p${String(index + 1).padStart(3, "0")}`));
    return Object.freeze({
      pageId: buildArchivePageId(normalizedSourceBookId, pageToken),
      sourceBookId: normalizedSourceBookId,
      pageToken,
      text: pageText,
      index,
      isFirstPage: index === 0,
      isLastPage: index === pages.length - 1
    });
  });
}