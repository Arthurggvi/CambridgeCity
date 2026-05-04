const DRAFT_FILE_TYPE = "CambrianQuestionnaireDraft";
const DRAFT_FILE_SCHEMA_VERSION = 1;

function normalizeString(value) {
  return String(value || "").trim();
}

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function getIsoNow() {
  return new Date().toISOString();
}

function getQuestionList(definition) {
  const sections = Array.isArray(definition?.sections) ? definition.sections : [];
  return sections.flatMap((section) => Array.isArray(section?.questions) ? section.questions : []);
}

function getQuestionMap(definition) {
  const questionMap = new Map();
  for (const question of getQuestionList(definition)) {
    questionMap.set(String(question?.id || "").trim(), question);
  }
  return questionMap;
}

function getAllowedOptionValues(question) {
  const options = Array.isArray(question?.options) ? question.options : [];
  return options.map((option) => option?.value);
}

function clampStringLength(value, maxLength) {
  const text = String(value == null ? "" : value);
  const limit = Number(maxLength);
  if (!Number.isFinite(limit) || limit <= 0) return text;
  return text.slice(0, limit);
}

function normalizeBugReportValue(question, rawValue) {
  const fields = Array.isArray(question?.fields) ? question.fields : [];
  const source = rawValue && typeof rawValue === "object" ? rawValue : {};
  const next = {};
  for (const field of fields) {
    const fieldId = normalizeString(field?.id);
    if (!fieldId) continue;
    next[fieldId] = clampStringLength(source[fieldId], field?.maxLength);
  }
  return next;
}

function normalizeAnswerValue(question, rawValue) {
  if (!question || typeof question !== "object") return null;

  if (question.type === "scale") {
    const allowed = new Set(getAllowedOptionValues(question));
    const numericValue = Number(rawValue);
    return allowed.has(numericValue) ? numericValue : null;
  }

  if (question.type === "single") {
    const allowed = getAllowedOptionValues(question);
    return allowed.find((value) => Object.is(value, rawValue)) ?? null;
  }

  if (question.type === "multi") {
    const allowed = getAllowedOptionValues(question);
    const values = Array.isArray(rawValue) ? rawValue : [];
    const picked = [];
    for (const value of values) {
      if (allowed.some((candidate) => Object.is(candidate, value)) && !picked.some((candidate) => Object.is(candidate, value))) {
        picked.push(value);
      }
    }
    return picked;
  }

  if (question.type === "bug_report") {
    return normalizeBugReportValue(question, rawValue);
  }

  return clampStringLength(rawValue, question?.maxLength);
}

function buildAnswerEntry(question, value) {
  if (!question) return null;
  return {
    type: String(question.type || "text"),
    value: deepClone(value)
  };
}

export function isQuestionAnswered(question, answerEntry) {
  if (!question || !answerEntry || typeof answerEntry !== "object") return false;
  const value = answerEntry.value;

  if (question.type === "multi") {
    return Array.isArray(value) && value.length > 0;
  }

  if (question.type === "bug_report") {
    if (!value || typeof value !== "object") return false;
    return Object.values(value).some((fieldValue) => normalizeString(fieldValue).length > 0);
  }

  if (typeof value === "string") {
    return normalizeString(value).length > 0;
  }

  return value != null;
}

export function createQuestionnaireState(definition, seed = {}) {
  const sections = Array.isArray(definition?.sections) ? definition.sections : [];
  const firstSectionId = normalizeString(seed?.currentSectionId) || normalizeString(sections[0]?.id);
  const startedAt = normalizeString(seed?.startedAt) || getIsoNow();
  const updatedAt = normalizeString(seed?.updatedAt) || startedAt;
  const completedAt = normalizeString(seed?.completedAt) || null;
  const answers = {};
  const questionMap = getQuestionMap(definition);
  const rawAnswers = seed?.answers && typeof seed.answers === "object" ? seed.answers : {};

  for (const [questionId, rawAnswer] of Object.entries(rawAnswers)) {
    const question = questionMap.get(normalizeString(questionId));
    if (!question) continue;
    const normalizedValue = normalizeAnswerValue(question, rawAnswer?.value);
    const answerEntry = buildAnswerEntry(question, normalizedValue);
    if (isQuestionAnswered(question, answerEntry)) {
      answers[question.id] = answerEntry;
    }
  }

  const scrollTopBySection = {};
  const rawScrollTop = seed?.scrollTopBySection && typeof seed.scrollTopBySection === "object"
    ? seed.scrollTopBySection
    : {};
  for (const section of sections) {
    const sectionId = normalizeString(section?.id);
    if (!sectionId) continue;
    const scrollTop = Number(rawScrollTop[sectionId]);
    scrollTopBySection[sectionId] = Number.isFinite(scrollTop) && scrollTop > 0 ? Math.round(scrollTop) : 0;
  }

  return {
    questionnaireId: normalizeString(seed?.questionnaireId) || normalizeString(definition?.questionnaireId),
    questionnaireSchemaVersion: Number(definition?.schemaVersion || 1),
    status: seed?.status === "completed" ? "completed" : "draft",
    startedAt,
    updatedAt,
    completedAt,
    currentSectionId: firstSectionId,
    scrollTopBySection,
    answers
  };
}

export function getQuestionnaireProgress(definition, state) {
  const questions = getQuestionList(definition);
  const answers = state?.answers && typeof state.answers === "object" ? state.answers : {};
  const totalCount = questions.length;
  const answeredIds = [];
  const missingRequiredIds = [];

  for (const question of questions) {
    const answerEntry = answers[question.id] || null;
    const answered = isQuestionAnswered(question, answerEntry);
    if (answered) {
      answeredIds.push(question.id);
      continue;
    }
    if (question.required === true) {
      missingRequiredIds.push(question.id);
    }
  }

  const answeredCount = answeredIds.length;
  return {
    answeredCount,
    totalCount,
    requiredMissingIds: missingRequiredIds,
    completionRatio: totalCount > 0 ? answeredCount / totalCount : 0
  };
}

function touchState(nextState) {
  return {
    ...nextState,
    updatedAt: getIsoNow()
  };
}

export function setCurrentSection(definition, state, sectionId) {
  const normalizedSectionId = normalizeString(sectionId);
  const validSection = Array.isArray(definition?.sections)
    ? definition.sections.find((section) => normalizeString(section?.id) === normalizedSectionId)
    : null;
  if (!validSection || normalizeString(state?.currentSectionId) === normalizedSectionId) {
    return state;
  }
  return touchState({
    ...state,
    currentSectionId: normalizedSectionId
  });
}

export function setSectionScroll(definition, state, sectionId, scrollTop) {
  const normalizedSectionId = normalizeString(sectionId);
  if (!normalizedSectionId) return state;
  const value = Number(scrollTop);
  const nextScrollTop = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  const prevScrollTop = Number(state?.scrollTopBySection?.[normalizedSectionId] || 0);
  if (prevScrollTop === nextScrollTop) return state;
  return {
    ...state,
    scrollTopBySection: {
      ...(state?.scrollTopBySection && typeof state.scrollTopBySection === "object" ? state.scrollTopBySection : {}),
      [normalizedSectionId]: nextScrollTop
    }
  };
}

export function setQuestionAnswer(definition, state, questionId, rawValue) {
  const question = getQuestionMap(definition).get(normalizeString(questionId));
  if (!question) return state;
  const normalizedValue = normalizeAnswerValue(question, rawValue);
  const nextAnswers = {
    ...(state?.answers && typeof state.answers === "object" ? state.answers : {})
  };
  const answerEntry = buildAnswerEntry(question, normalizedValue);
  if (isQuestionAnswered(question, answerEntry)) {
    nextAnswers[question.id] = answerEntry;
  } else {
    delete nextAnswers[question.id];
  }
  return touchState({
    ...state,
    status: "draft",
    completedAt: null,
    answers: nextAnswers
  });
}

export function setBugReportField(definition, state, questionId, fieldId, rawValue) {
  const question = getQuestionMap(definition).get(normalizeString(questionId));
  if (!question || question.type !== "bug_report") return state;
  const currentValue = state?.answers?.[question.id]?.value && typeof state.answers[question.id].value === "object"
    ? state.answers[question.id].value
    : {};
  const nextValue = {
    ...normalizeBugReportValue(question, currentValue),
    [normalizeString(fieldId)]: clampStringLength(rawValue, question.fields?.find((field) => normalizeString(field?.id) === normalizeString(fieldId))?.maxLength)
  };
  return setQuestionAnswer(definition, state, questionId, nextValue);
}

export function clearQuestionnaireAnswers(definition, state) {
  return touchState({
    ...state,
    status: "draft",
    completedAt: null,
    currentSectionId: normalizeString(definition?.sections?.[0]?.id),
    scrollTopBySection: Object.fromEntries(
      (Array.isArray(definition?.sections) ? definition.sections : []).map((section) => [normalizeString(section?.id), 0])
    ),
    answers: {}
  });
}

export function markQuestionnaireCompleted(state) {
  const completedAt = getIsoNow();
  return {
    ...state,
    status: "completed",
    updatedAt: completedAt,
    completedAt
  };
}

export function buildDraftFilePayload(definition, state) {
  return {
    fileType: DRAFT_FILE_TYPE,
    schemaVersion: DRAFT_FILE_SCHEMA_VERSION,
    questionnaireId: String(definition?.questionnaireId || ""),
    questionnaireSchemaVersion: Number(definition?.schemaVersion || 1),
    savedAt: getIsoNow(),
    state: {
      questionnaireId: String(state?.questionnaireId || definition?.questionnaireId || ""),
      questionnaireSchemaVersion: Number(state?.questionnaireSchemaVersion || definition?.schemaVersion || 1),
      status: state?.status === "completed" ? "completed" : "draft",
      startedAt: normalizeString(state?.startedAt) || getIsoNow(),
      updatedAt: normalizeString(state?.updatedAt) || getIsoNow(),
      completedAt: normalizeString(state?.completedAt) || null,
      currentSectionId: normalizeString(state?.currentSectionId) || normalizeString(definition?.sections?.[0]?.id),
      scrollTopBySection: deepClone(state?.scrollTopBySection || {}),
      answers: deepClone(state?.answers || {})
    }
  };
}

export function hydrateQuestionnaireStateFromDraft(definition, draftPayload) {
  if (!draftPayload || typeof draftPayload !== "object") {
    throw new Error("问卷草稿为空");
  }
  if (String(draftPayload.fileType || "") !== DRAFT_FILE_TYPE) {
    throw new Error("不是问卷草稿文件");
  }
  if (String(draftPayload.questionnaireId || "") !== String(definition?.questionnaireId || "")) {
    throw new Error("问卷 ID 不匹配");
  }
  return createQuestionnaireState(definition, draftPayload.state || {});
}

export function buildPersistenceDigest(definition, state) {
  return JSON.stringify(buildDraftFilePayload(definition, state).state);
}

export function getQuestionById(definition, questionId) {
  return getQuestionMap(definition).get(normalizeString(questionId)) || null;
}

export function listQuestionSections(definition) {
  return Array.isArray(definition?.sections) ? definition.sections : [];
}