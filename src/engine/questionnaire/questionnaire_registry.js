import CLOSED_TEST_V1 from "../../../data/questionnaires/closed_test_v1.js";

const QUESTIONNAIRES = Object.freeze({
  [CLOSED_TEST_V1.questionnaireId]: CLOSED_TEST_V1
});

export function getQuestionnaireDefinition(questionnaireId) {
  return QUESTIONNAIRES[String(questionnaireId || "").trim()] || null;
}

export function getDefaultQuestionnaireDefinition() {
  return CLOSED_TEST_V1;
}

export function listQuestionnaireDefinitions() {
  return Object.values(QUESTIONNAIRES);
}