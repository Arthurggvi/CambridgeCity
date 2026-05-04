function normalizeText(rawText) {
  return String(rawText || "").replace(/\r\n?/g, "\n").trim();
}

function splitParagraphs(text) {
  const normalized = normalizeText(text);
  const paragraphs = normalized
    ? normalized.split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean)
    : [];
  return paragraphs.length > 0 ? paragraphs : [""];
}

function splitLines(text) {
  return String(text || "").split(/\n/).map((line) => line.trim()).filter(Boolean);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isAsciiAlphaNum(ch) {
  return /[A-Za-z0-9]/.test(ch);
}

function isAsciiPunctuation(ch) {
  return /[!-/:-@\[-`{-~]/.test(ch);
}

function isCjkFamily(ch) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303F\uFF00-\uFFEF]/u.test(ch);
}

function weightedCharOf(ch) {
  if (/\s/u.test(ch)) return 0;
  if (isAsciiAlphaNum(ch)) return 0.56;
  if (isAsciiPunctuation(ch)) return 0.42;
  if (isCjkFamily(ch)) return 1;
  return 1;
}

function getWeightedCharCount(text) {
  let total = 0;
  for (const ch of String(text || "")) {
    total += weightedCharOf(ch);
  }
  return Number(total.toFixed(3));
}

function splitSentences(text) {
  const source = String(text || "");
  const terminals = new Set(["。", "！", "？", "!", "?", "；", ";", "…"]);
  const sentences = [];
  let start = 0;

  for (let i = 0; i < source.length; i++) {
    if (!terminals.has(source[i])) continue;
    const segment = source.slice(start, i + 1).trim();
    if (segment) sentences.push(segment);
    start = i + 1;
  }

  const tail = source.slice(start).trim();
  if (tail) sentences.push(tail);
  if (sentences.length === 0) {
    sentences.push(source.trim());
  }
  return sentences.filter(Boolean);
}

function startsWithInfoKeywordLine(line) {
  const keywords = [
    "结算", "获得", "失去", "变化", "提示", "注意", "结果", "状态", "进度", "消耗", "收入", "支出", "工资", "报酬", "时间", "体温", "饥饿", "疲劳", "伤口", "任务"
  ];
  const trimmed = String(line || "").trim();
  if (!trimmed) return false;
  for (const keyword of keywords) {
    const pattern = new RegExp(`^${keyword}\\s*[：:]`);
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

function isListInfoLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return false;

  if (/[+\-±]\s*\d/.test(trimmed)) return true;
  if (startsWithInfoKeywordLine(trimmed)) return true;
  if (/^(?:\d+\.|[①②③④⑤⑥⑦⑧⑨⑩]|-|•)\s*/.test(trimmed)) return true;

  if (trimmed.length <= 32 && (/[0-9]/.test(trimmed) || /[：:]/.test(trimmed))) {
    return true;
  }

  return false;
}

function collectDialogueWeightedChars(text) {
  const source = String(text || "");
  let total = 0;

  const pairPatterns = [
    /“([^”]+)”/g,
    /"([^"]+)"/g,
    /‘([^’]+)’/g,
    /『([^』]+)』/g,
    /「([^」]+)」/g
  ];

  for (const pattern of pairPatterns) {
    let match;
    while ((match = pattern.exec(source)) != null) {
      total += getWeightedCharCount(match[1]);
    }
  }

  const lines = splitLines(source);
  for (const line of lines) {
    if (!/^(?:——|—|-)\s*/.test(line)) continue;
    const weighted = getWeightedCharCount(line);
    if (weighted <= 42) total += weighted;
  }

  return total;
}

function getPausePunctCount(text) {
  const matches = String(text || "").match(/[，、：:—（）《》“”‘’]/g);
  return matches ? matches.length : 0;
}

function getSemanticBreakCount(text, paragraphs, sentences) {
  let count = Math.max(paragraphs.length - 1, 0);
  const source = String(text || "");

  const summaryMatches = source.match(/[。！？!?；;…]\s*(然后|之后|最后|于是|结果|结算|提示|记录|变化)/g);
  if (summaryMatches) count += summaryMatches.length;

  const colonMatches = source.match(/[：:][^\n]{1,32}/g);
  if (colonMatches) count += colonMatches.length;

  const lastSentence = sentences[sentences.length - 1] || "";
  const lastSentenceWeighted = getWeightedCharCount(lastSentence);
  if (lastSentenceWeighted > 0 && lastSentenceWeighted <= 18
    && /(结果|结算|提示|记录|变化|获得|失去|状态|进度)/.test(lastSentence)) {
    count += 1;
  }

  return clamp(Math.trunc(count), 0, 6);
}

export function analyzeSceneText(finalText) {
  const normalizedText = normalizeText(finalText);
  const paragraphs = splitParagraphs(normalizedText);
  const nonEmptyParagraphs = paragraphs.filter((part) => part.trim().length > 0);
  const effectiveParagraphs = nonEmptyParagraphs.length > 0 ? nonEmptyParagraphs : [""];

  const weightedCharCount = getWeightedCharCount(normalizedText);
  const paragraphCount = Math.max(1, effectiveParagraphs.length);

  const sentenceList = splitSentences(normalizedText);
  const sentenceWeightedList = sentenceList.map((sentence) => getWeightedCharCount(sentence));
  const sentenceCount = Math.max(1, sentenceWeightedList.filter((value) => value > 0).length || sentenceList.length || 1);
  const totalSentenceWeighted = sentenceWeightedList.reduce((sum, value) => sum + value, 0);
  const avgSentenceLength = sentenceCount > 0 ? Number((totalSentenceWeighted / sentenceCount).toFixed(3)) : 0;
  const maxSentenceLength = sentenceWeightedList.length > 0 ? Number(Math.max(...sentenceWeightedList).toFixed(3)) : 0;

  const explicitLineBreakCount = (normalizedText.match(/\n/g) || []).length;
  const lineEstimate = Math.ceil(weightedCharCount / 26) + explicitLineBreakCount;

  const dialogueWeightedChars = collectDialogueWeightedChars(normalizedText);
  const dialogueRatio = clamp(dialogueWeightedChars / Math.max(weightedCharCount, 1), 0, 1);

  const pausePunctCount = getPausePunctCount(normalizedText);
  const pauseDensity = pausePunctCount / Math.max(sentenceCount, 1);

  const allLines = splitLines(normalizedText);
  const listLineCount = allLines.filter((line) => isListInfoLine(line)).length;

  const tailParagraphs = effectiveParagraphs.slice(Math.max(0, effectiveParagraphs.length - 3));
  const infoTailLineCount = tailParagraphs
    .flatMap((paragraph) => splitLines(paragraph))
    .filter((line) => isListInfoLine(line)).length;

  const semanticBreakCount = getSemanticBreakCount(normalizedText, effectiveParagraphs, sentenceList);

  const rawScore =
    weightedCharCount * 0.095 +
    Math.max(paragraphCount - 1, 0) * 7 +
    avgSentenceLength * 0.55 +
    Math.max(maxSentenceLength - 24, 0) * 0.12 +
    lineEstimate * 0.82 +
    listLineCount * 4.8 +
    infoTailLineCount * 5.6 +
    semanticBreakCount * 3.2 -
    dialogueRatio * 12 -
    pauseDensity * 0.45;

  const readingLoadScore = clamp(Math.round(rawScore), 0, 100);

  return {
    weightedCharCount: Number(weightedCharCount.toFixed(3)),
    paragraphCount,
    sentenceCount,
    avgSentenceLength,
    maxSentenceLength,
    lineEstimate,
    dialogueRatio: Number(dialogueRatio.toFixed(3)),
    pauseDensity: Number(pauseDensity.toFixed(3)),
    listLineCount,
    infoTailLineCount,
    semanticBreakCount,
    readingLoadScore,
    rawScore: Number(rawScore.toFixed(3))
  };
}
