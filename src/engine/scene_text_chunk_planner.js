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

function splitLines(text) {
  return String(text || "").split(/\n/).map((line) => line.trim()).filter(Boolean);
}

function startsWithInfoKeywordLine(line) {
  const keywords = [
    "结算", "获得", "失去", "变化", "提示", "注意", "结果", "状态", "进度", "消耗", "收入", "支出", "工资", "报酬", "时间", "体温", "饥饿", "疲劳", "伤口", "任务", "记录"
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
  if (trimmed.length <= 32 && (/[0-9]/.test(trimmed) || /[：:]/.test(trimmed))) return true;

  return false;
}

function isInfoParagraph(paragraphText) {
  const lines = splitLines(paragraphText);
  return lines.some((line) => isListInfoLine(line));
}

function paragraphSignalsTail(paragraphText) {
  const text = String(paragraphText || "").trim();
  if (!text) return false;
  if (isInfoParagraph(text)) return true;
  if (/[+\-±]\s*\d/.test(text)) return true;
  if (/^(结算|提示|结果|变化|记录|状态|消耗|获得|失去)/.test(text)) return true;
  if (text.length <= 32 && (/[0-9]/.test(text) || /[：:]/.test(text))) return true;
  return false;
}

function splitParagraphIntoSentences(paragraphText) {
  const text = String(paragraphText || "");
  const terminals = new Set(["。", "！", "？", "!", "?", "；", ";", "…"]);
  const sentences = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    if (!terminals.has(text[i])) continue;
    const raw = text.slice(start, i + 1);
    const trimmed = raw.trim();
    if (trimmed) {
      sentences.push({
        text: trimmed,
        start,
        end: i + 1,
        weighted: getWeightedCharCount(trimmed)
      });
    }
    start = i + 1;
  }

  const tail = text.slice(start).trim();
  if (tail) {
    sentences.push({
      text: tail,
      start,
      end: text.length,
      weighted: getWeightedCharCount(tail)
    });
  }

  if (sentences.length === 0) {
    const trimmed = text.trim();
    sentences.push({
      text: trimmed,
      start: 0,
      end: text.length,
      weighted: getWeightedCharCount(trimmed)
    });
  }

  return sentences;
}

function buildSentenceStream(paragraphs) {
  const stream = [];
  for (let p = 0; p < paragraphs.length; p++) {
    const paragraphText = paragraphs[p];
    const infoParagraph = isInfoParagraph(paragraphText);
    const sentences = splitParagraphIntoSentences(paragraphText);
    for (const sentence of sentences) {
      stream.push({
        paragraphIndex: p,
        infoParagraph,
        ...sentence
      });
    }
  }
  return stream;
}

function compareBoundary(a, b) {
  if (a.paragraphIndex !== b.paragraphIndex) {
    return a.paragraphIndex - b.paragraphIndex;
  }
  return a.offset - b.offset;
}

function minBoundary(a, b) {
  return compareBoundary(a, b) <= 0 ? a : b;
}

function maxBoundary(a, b) {
  return compareBoundary(a, b) >= 0 ? a : b;
}

function textBetween(paragraphs, startBoundary, endBoundary) {
  if (compareBoundary(startBoundary, endBoundary) >= 0) return "";
  const slices = [];

  for (let p = startBoundary.paragraphIndex; p <= endBoundary.paragraphIndex; p++) {
    const paragraphText = String(paragraphs[p] || "");
    const start = p === startBoundary.paragraphIndex ? startBoundary.offset : 0;
    const end = p === endBoundary.paragraphIndex ? endBoundary.offset : paragraphText.length;
    const segment = paragraphText.slice(start, end).trim();
    if (segment) slices.push(segment);
  }

  return slices.join("\n\n");
}

function findClauseCutOffset(sentenceText, leadTargetChars) {
  const preferredMin = 18;
  const preferredMax = 36;
  const punctuation = new Set(["，", "、", "：", ":", "；", ";", "—"]);

  let weighted = 0;
  const candidates = [];
  const chars = Array.from(String(sentenceText || ""));

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    weighted += weightedCharOf(ch);
    if (weighted < preferredMin || weighted > preferredMax) continue;
    if (!punctuation.has(ch)) continue;
    candidates.push({ index: i + 1, weighted });
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => Math.abs(a.weighted - leadTargetChars) - Math.abs(b.weighted - leadTargetChars));
    return candidates[0].index;
  }

  let hardWeighted = 0;
  for (let i = 0; i < chars.length; i++) {
    hardWeighted += weightedCharOf(chars[i]);
    if (hardWeighted >= preferredMax) return i + 1;
  }
  return chars.length;
}

function countParagraphs(text) {
  if (!String(text || "").trim()) return 0;
  return String(text)
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function estimateLinesFromWeightedChars(weightedChars) {
  return Math.max(0, Math.ceil(Number(weightedChars || 0) / 26));
}

function resolveLeadTargetChars(analysis) {
  return clamp(
    Math.round(42 + Number(analysis?.weightedCharCount || 0) * 0.04 - Number(analysis?.readingLoadScore || 0) * 0.22 + Number(analysis?.dialogueRatio || 0) * 10),
    26,
    72
  );
}

function resolveLeadBoundary(paragraphs, analysis) {
  const stream = buildSentenceStream(paragraphs);
  if (stream.length === 0) {
    return { paragraphIndex: 0, offset: 0 };
  }

  const first = stream[0];
  const leadTargetChars = resolveLeadTargetChars(analysis || {});

  if (first.weighted > 52) {
    const localCut = findClauseCutOffset(first.text, leadTargetChars);
    const cutOffset = first.start + localCut;
    return {
      paragraphIndex: first.paragraphIndex,
      offset: Math.max(first.start + 1, Math.min(first.end, cutOffset))
    };
  }

  let boundary = {
    paragraphIndex: first.paragraphIndex,
    offset: first.end
  };
  let accumulated = first.weighted;
  let forceIncludeNext = first.weighted < 14;

  for (let i = 1; i < stream.length; i++) {
    const sentence = stream[i];
    if (!forceIncludeNext && accumulated >= leadTargetChars) break;
    if (!forceIncludeNext && sentence.infoParagraph) break;

    boundary = {
      paragraphIndex: sentence.paragraphIndex,
      offset: sentence.end
    };
    accumulated += sentence.weighted;

    if (forceIncludeNext) {
      forceIncludeNext = false;
      continue;
    }
    if (accumulated >= leadTargetChars) break;
  }

  return boundary;
}

function findWeightedSplitIndex(text, targetWeightedChars) {
  const chars = Array.from(String(text || ""));
  if (chars.length === 0) return 0;
  const punctuation = new Set(["，", "。", "！", "？", "；", ";", "、", "：", ":", "…", "\n"]);
  const minChars = Math.max(1, Math.floor(chars.length * 0.22));
  let weighted = 0;
  let fallbackIndex = Math.max(1, minChars);
  let punctIndex = 0;

  for (let i = 0; i < chars.length; i++) {
    weighted += weightedCharOf(chars[i]);
    if (weighted >= targetWeightedChars && fallbackIndex < 1) {
      fallbackIndex = i + 1;
    }
    if (weighted >= targetWeightedChars) {
      fallbackIndex = Math.max(1, i + 1);
      if (punctuation.has(chars[i])) {
        punctIndex = i + 1;
        break;
      }
    }
  }

  if (punctIndex > 0) return punctIndex;
  if (fallbackIndex > 0) return fallbackIndex;
  return Math.max(1, Math.floor(chars.length * 0.4));
}

function rebalanceFromEmptyBody(normalizedText, analysis) {
  const weightedTotal = Number(analysis?.weightedCharCount || getWeightedCharCount(normalizedText));
  const leadMaxWeighted = Math.max(26, Math.floor(weightedTotal * 0.4));
  const splitIndex = findWeightedSplitIndex(normalizedText, leadMaxWeighted);
  const leadText = String(normalizedText || "").slice(0, splitIndex).trim();
  const remainderText = String(normalizedText || "").slice(splitIndex).trim();
  const bodyChars = getWeightedCharCount(remainderText);

  return {
    leadText,
    bodyText: remainderText,
    tailText: "",
    hasTail: false,
    bodyChars,
    enoughBodyForLayering: bodyChars >= 52
  };
}

function buildLayeringSnapshot({
  leadText,
  bodyText,
  tailText,
  hasTail,
  leadTargetChars,
  plannerReason
}) {
  const leadChars = getWeightedCharCount(leadText);
  const bodyChars = getWeightedCharCount(bodyText);
  const tailChars = getWeightedCharCount(tailText);
  const bodyEstimatedLines = estimateLinesFromWeightedChars(bodyChars);
  const tailEstimatedLines = estimateLinesFromWeightedChars(tailChars);
  const bodyLayerEnabled = bodyEstimatedLines >= 2;
  const tailLayerEnabled = hasTail === true && tailEstimatedLines >= 2;

  return {
    leadText,
    bodyText,
    tailText,
    hasTail: !!hasTail,
    leadChars,
    bodyChars,
    tailChars,
    leadParagraphCount: countParagraphs(leadText),
    bodyParagraphCount: countParagraphs(bodyText),
    tailParagraphCount: countParagraphs(tailText),
    leadTargetChars,
    bodyEstimatedLines,
    tailEstimatedLines,
    bodyLayerEnabled,
    tailLayerEnabled,
    plannerReason
  };
}

function resolveTailStartIndex(paragraphs) {
  if (paragraphs.length === 0) return -1;
  const start = Math.max(0, paragraphs.length - 3);
  for (let i = paragraphs.length - 1; i >= start; i--) {
    if (paragraphSignalsTail(paragraphs[i])) return i;
  }
  return -1;
}

export function planSceneTextChunks(finalText, analysis) {
  const normalizedText = normalizeText(finalText);
  const paragraphs = splitParagraphs(normalizedText);
  const weightedCharCount = Number(analysis?.weightedCharCount || getWeightedCharCount(normalizedText));
  const leadTargetChars = resolveLeadTargetChars(analysis || {});
  const endBoundary = {
    paragraphIndex: paragraphs.length - 1,
    offset: String(paragraphs[paragraphs.length - 1] || "").length
  };

  const leadBoundary = resolveLeadBoundary(paragraphs, analysis || {});
  const leadStart = { paragraphIndex: 0, offset: 0 };
  const leadText = textBetween(paragraphs, leadStart, leadBoundary);

  const remainderStart = leadBoundary;
  const tailStartParagraphIndex = resolveTailStartIndex(paragraphs);
  const tailStartBoundary = tailStartParagraphIndex >= 0
    ? { paragraphIndex: tailStartParagraphIndex, offset: 0 }
    : endBoundary;

  const candidateTailStart = maxBoundary(remainderStart, tailStartBoundary);
  const candidateTailText = textBetween(paragraphs, candidateTailStart, endBoundary);
  const candidateTailChars = getWeightedCharCount(candidateTailText);

  const hasTail = tailStartParagraphIndex >= 0
    && (candidateTailChars >= 12 || Number(analysis?.infoTailLineCount || 0) >= 2)
    && compareBoundary(candidateTailStart, endBoundary) < 0;

  const bodyEnd = hasTail ? minBoundary(tailStartBoundary, endBoundary) : endBoundary;
  let bodyText = textBetween(paragraphs, remainderStart, bodyEnd);
  let tailText = hasTail ? textBetween(paragraphs, candidateTailStart, endBoundary) : "";
  let plannerReason = "normal_split";

  let bodyChars = getWeightedCharCount(bodyText);
  let tailChars = getWeightedCharCount(tailText);
  let hasTailFinal = hasTail;

  if (weightedCharCount >= 60 && bodyChars === 0) {
    const rebalanced = rebalanceFromEmptyBody(normalizedText, analysis);
    if (!rebalanced.enoughBodyForLayering) {
      return buildLayeringSnapshot({
        leadText: normalizedText,
        bodyText: "",
        tailText: "",
        hasTail: false,
        leadTargetChars,
        plannerReason: "text_too_short_for_visible_body_layering"
      });
    }
    plannerReason = "rebalance_from_empty_body";
    bodyText = rebalanced.bodyText;
    tailText = "";
    hasTailFinal = false;
    bodyChars = getWeightedCharCount(bodyText);
    tailChars = 0;
  }

  if (hasTailFinal) {
    const tailEstimatedLines = estimateLinesFromWeightedChars(tailChars);
    const tailCanStandalone = tailEstimatedLines >= 2;

    if (!tailCanStandalone) {
      bodyText = [String(bodyText || "").trim(), String(tailText || "").trim()]
        .filter(Boolean)
        .join("\n\n");
      tailText = "";
      hasTailFinal = false;
      bodyChars = getWeightedCharCount(bodyText);
      tailChars = 0;
      plannerReason = plannerReason === "normal_split" ? "tail_merged_into_body" : plannerReason;
    }
  }

  const bodyEstimatedLines = estimateLinesFromWeightedChars(bodyChars);
  if (bodyEstimatedLines < 2) {
    plannerReason = "text_too_short_for_visible_body_layering";
  }

  return buildLayeringSnapshot({
    leadText,
    bodyText,
    tailText,
    hasTail: hasTailFinal,
    leadTargetChars,
    plannerReason
  });
}
