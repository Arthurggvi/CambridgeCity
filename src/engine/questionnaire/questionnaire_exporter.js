import { BUILD } from "../../version.js";
import { getQuestionById, getQuestionnaireProgress, isQuestionAnswered } from "./questionnaire_state.js";

function normalizeString(value) {
  return String(value || "").trim();
}

function getQuestionList(definition) {
  return Array.isArray(definition?.sections)
    ? definition.sections.flatMap((section) => Array.isArray(section?.questions) ? section.questions : [])
    : [];
}

function getAnswerEntry(state, questionId) {
  return state?.answers && typeof state.answers === "object"
    ? state.answers[questionId] || null
    : null;
}

function getOptionLabel(question, rawValue) {
  const options = Array.isArray(question?.options) ? question.options : [];
  const hit = options.find((option) => Object.is(option?.value, rawValue));
  return String(hit?.label || rawValue || "").trim() || null;
}

function buildAnswerExportMap(definition, state) {
  const answers = {};
  for (const question of getQuestionList(definition)) {
    const answerEntry = getAnswerEntry(state, question.id);
    if (!isQuestionAnswered(question, answerEntry)) continue;
    answers[question.id] = {
      type: String(question.type || "text"),
      value: answerEntry.value
    };
  }
  return answers;
}

function buildPlayerMeta(definition, state) {
  const result = {
    deviceClass: "unknown",
    playDurationBand: "unknown",
    isFirstTimePlayer: false
  };

  for (const question of getQuestionList(definition)) {
    const exportKey = normalizeString(question?.exportKey);
    if (!exportKey) continue;
    const answerEntry = getAnswerEntry(state, question.id);
    if (!isQuestionAnswered(question, answerEntry)) continue;
    if (exportKey === "deviceClass") result.deviceClass = String(answerEntry.value || "unknown");
    if (exportKey === "playDurationBand") result.playDurationBand = String(answerEntry.value || "unknown");
    if (exportKey === "isFirstTimePlayer") result.isFirstTimePlayer = answerEntry.value === true;
  }

  return result;
}

function buildExportSummary(definition, state) {
  const overallFunQuestion = getQuestionById(definition, "B6");
  const playMotivationQuestion = getQuestionById(definition, "B7");
  const replayIntentQuestion = getQuestionById(definition, "B9");
  const topProblemsQuestion = getQuestionById(definition, "C11");

  const overallFunEntry = getAnswerEntry(state, "B6");
  const playMotivationEntry = getAnswerEntry(state, "B7");
  const replayIntentEntry = getAnswerEntry(state, "B9");
  const topProblemsEntry = getAnswerEntry(state, "C11");

  return {
    overallFunScore: isQuestionAnswered(overallFunQuestion, overallFunEntry) ? Number(overallFunEntry.value) : null,
    playMotivationScore: isQuestionAnswered(playMotivationQuestion, playMotivationEntry)
      ? Number(playMotivationEntry.value)
      : null,
    replayIntentScore: isQuestionAnswered(replayIntentQuestion, replayIntentEntry)
      ? Number(replayIntentEntry.value)
      : null,
    topProblems: isQuestionAnswered(topProblemsQuestion, topProblemsEntry)
      ? (Array.isArray(topProblemsEntry.value) ? topProblemsEntry.value.map((value) => String(value)) : [])
      : []
  };
}

export function buildQuestionnaireResponseExport(definition, state) {
  const progress = getQuestionnaireProgress(definition, state);
  return {
    fileType: "CambrianQuestionnaireResponse",
    schemaVersion: 1,
    questionnaireId: String(definition?.questionnaireId || "closed_test_v1"),
    gameVersion: `v${BUILD.gameVersion}`,
    buildId: String(BUILD.buildId || "unknown"),
    status: state?.status === "completed" ? "completed" : "draft",
    startedAt: normalizeString(state?.startedAt) || new Date().toISOString(),
    updatedAt: normalizeString(state?.updatedAt) || new Date().toISOString(),
    completedAt: normalizeString(state?.completedAt) || null,
    playerMeta: buildPlayerMeta(definition, state),
    progress: {
      lastSectionId: normalizeString(state?.currentSectionId) || normalizeString(definition?.sections?.[0]?.id),
      answeredCount: progress.answeredCount,
      totalCount: progress.totalCount
    },
    answers: buildAnswerExportMap(definition, state),
    exportSummary: buildExportSummary(definition, state)
  };
}

export function buildQuestionnaireSummaryText(definition, state) {
  const response = buildQuestionnaireResponseExport(definition, state);
  const lines = [
    `${definition?.title || "Closed Test Feedback Dossier"}`,
    `Questionnaire ID: ${response.questionnaireId}`,
    `Game Version: ${response.gameVersion}`,
    `Build ID: ${response.buildId}`,
    `Status: ${response.status}`,
    `Started At: ${response.startedAt}`,
    `Updated At: ${response.updatedAt}`,
    `Completed At: ${response.completedAt || "-"}`,
    "",
    `[Player Meta]`,
    `Device Class: ${response.playerMeta.deviceClass}`,
    `Play Duration Band: ${response.playerMeta.playDurationBand}`,
    `First Time Player: ${response.playerMeta.isFirstTimePlayer ? "true" : "false"}`,
    "",
    `[Progress]`,
    `Last Section: ${response.progress.lastSectionId}`,
    `Answered: ${response.progress.answeredCount} / ${response.progress.totalCount}`,
    "",
    `[Summary]`,
    `Overall Fun Score: ${response.exportSummary.overallFunScore ?? "-"}`,
    `Play Motivation Score: ${response.exportSummary.playMotivationScore ?? "-"}`,
    `Replay Intent Score: ${response.exportSummary.replayIntentScore ?? "-"}`,
    `Top Problems: ${response.exportSummary.topProblems.length > 0 ? response.exportSummary.topProblems.join(", ") : "-"}`,
    "",
    `[Answered Questions]`
  ];

  for (const question of getQuestionList(definition)) {
    const answerEntry = getAnswerEntry(state, question.id);
    if (!isQuestionAnswered(question, answerEntry)) continue;
    let renderedValue = "";
    if (question.type === "multi") {
      renderedValue = (Array.isArray(answerEntry.value) ? answerEntry.value : [])
        .map((value) => getOptionLabel(question, value) || String(value))
        .join(" / ");
    } else if (question.type === "single" || question.type === "scale") {
      renderedValue = getOptionLabel(question, answerEntry.value) || String(answerEntry.value);
    } else if (question.type === "bug_report") {
      const bugValue = answerEntry.value && typeof answerEntry.value === "object" ? answerEntry.value : {};
      renderedValue = Object.entries(bugValue)
        .filter(([, value]) => normalizeString(value).length > 0)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" | ");
    } else {
      renderedValue = String(answerEntry.value || "").trim();
    }
    lines.push(`${question.id} ${question.label}`);
    lines.push(renderedValue || "-");
    lines.push("");
  }

  return lines.join("\n");
}