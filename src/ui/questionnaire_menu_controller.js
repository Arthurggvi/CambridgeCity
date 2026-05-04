import { showConfirmDialog, showNoticeDialog } from "./dialogs.js";
import { getDefaultQuestionnaireDefinition } from "../engine/questionnaire/questionnaire_registry.js";
import {
  buildPersistenceDigest,
  buildDraftFilePayload,
  clearQuestionnaireAnswers,
  createQuestionnaireState,
  getQuestionnaireProgress,
  hydrateQuestionnaireStateFromDraft,
  listQuestionSections,
  markQuestionnaireCompleted,
  setBugReportField,
  setCurrentSection,
  setQuestionAnswer,
  setSectionScroll
} from "../engine/questionnaire/questionnaire_state.js";
import {
  clearQuestionnaireDraftFile,
  exportQuestionnaireFiles,
  getQuestionnaireFileCapability,
  loadQuestionnaireDraftFile,
  saveQuestionnaireDraftFile
} from "../engine/questionnaire/questionnaire_file_service.js";
import {
  buildQuestionnaireResponseExport,
  buildQuestionnaireSummaryText
} from "../engine/questionnaire/questionnaire_exporter.js";

const DEFAULT_DEFINITION = getDefaultQuestionnaireDefinition();

const DEFAULT_VIEW_STATE = Object.freeze({
  busy: false,
  busyLabel: "",
  lastSavedDraft: null,
  lastExport: null,
  lastLoadedDraft: null,
  creditsViewMode: "landing",
  capability: getQuestionnaireFileCapability()
});

let _sessionState = createQuestionnaireState(DEFAULT_DEFINITION);
let _viewState = { ...DEFAULT_VIEW_STATE };
let _persistedDigest = buildPersistenceDigest(DEFAULT_DEFINITION, _sessionState);
const _listeners = new Set();

function notifyListeners() {
  const snapshot = getSnapshot();
  for (const listener of _listeners) {
    try {
      listener(snapshot);
    } catch {
      // Ignore listener errors to keep local controller resilient.
    }
  }
}

function setSessionState(nextState, { notify = true, updatePersisted = false } = {}) {
  _sessionState = nextState;
  if (updatePersisted) {
    _persistedDigest = buildPersistenceDigest(DEFAULT_DEFINITION, _sessionState);
  }
  if (notify) notifyListeners();
}

function setViewState(partial, { notify = true } = {}) {
  _viewState = {
    ..._viewState,
    ...partial
  };
  if (notify) notifyListeners();
}

function getCurrentDigest() {
  return buildPersistenceDigest(DEFAULT_DEFINITION, _sessionState);
}

function isDirty() {
  return getCurrentDigest() !== _persistedDigest;
}

function buildSectionQuestionViewModels(section) {
  const answers = _sessionState?.answers && typeof _sessionState.answers === "object" ? _sessionState.answers : {};
  const questions = Array.isArray(section?.questions) ? section.questions : [];
  return questions.map((question) => {
    const answerEntry = answers[question.id] || null;
    return {
      id: question.id,
      type: question.type,
      label: question.label,
      required: question.required === true,
      placeholder: question.placeholder || "",
      maxLength: Number(question?.maxLength || 0) || null,
      options: Array.isArray(question?.options) ? question.options : [],
      fields: Array.isArray(question?.fields) ? question.fields : [],
      value: answerEntry?.value ?? (question.type === "multi" ? [] : question.type === "bug_report" ? {} : "")
    };
  });
}

function buildQuestionnairePanelViewModel() {
  const definition = DEFAULT_DEFINITION;
  const progress = getQuestionnaireProgress(definition, _sessionState);
  const sections = listQuestionSections(definition);
  const currentSection = sections.find((section) => section.id === _sessionState.currentSectionId) || sections[0] || null;
  const currentQuestions = currentSection ? buildSectionQuestionViewModels(currentSection) : [];

  return {
    title: definition.title,
    subtitle: definition.subtitle,
    intro: definition.intro,
    status: _sessionState.status,
    busy: _viewState.busy,
    busyLabel: _viewState.busyLabel,
    dirty: isDirty(),
    capability: _viewState.capability,
    progress: {
      ...progress,
      completionPercent: Math.round(progress.completionRatio * 100)
    },
    currentSectionId: _sessionState.currentSectionId,
    currentSectionScrollTop: Number(_sessionState.scrollTopBySection?.[_sessionState.currentSectionId] || 0),
    sections: sections.map((section) => {
      const sectionQuestions = Array.isArray(section?.questions) ? section.questions : [];
      const answeredCount = sectionQuestions.filter((question) => {
        const answerEntry = _sessionState.answers?.[question.id] || null;
        return answerEntry && question && answerEntry.type === question.type
          ? true
          : !!answerEntry;
      }).length;
      return {
        id: section.id,
        title: section.title,
        description: section.description || "",
        questionCount: sectionQuestions.length,
        answeredCount,
        isCurrent: section.id === _sessionState.currentSectionId
      };
    }),
    currentSection: currentSection
      ? {
          id: currentSection.id,
          title: currentSection.title,
          description: currentSection.description || "",
          questions: currentQuestions
        }
      : null,
    meta: {
      startedAt: _sessionState.startedAt,
      updatedAt: _sessionState.updatedAt,
      completedAt: _sessionState.completedAt,
      lastSavedDraft: _viewState.lastSavedDraft,
      lastExport: _viewState.lastExport,
      lastLoadedDraft: _viewState.lastLoadedDraft
    }
  };
}

export function buildQuestionnaireCreditsViewModel() {
  const panel = buildQuestionnairePanelViewModel();
  return {
    active: String(_viewState.creditsViewMode || "landing") === "questionnaire",
    entryLabel: "填写内测问卷",
    entryTitle: "内测回执",
    entryDescription: "问卷会独立保存到 feedback/，不会进入正式存档。可以继续草稿，也可以导出 completed JSON/TXT 直接发给开发者。",
    progress: panel.progress,
    lastSavedDraft: panel.meta.lastSavedDraft,
    lastExport: panel.meta.lastExport,
    panel
  };
}

export function subscribeQuestionnaireMenu(listener) {
  if (typeof listener !== "function") return () => {};
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

export function getSnapshot() {
  return {
    definition: DEFAULT_DEFINITION,
    sessionState: _sessionState,
    viewState: _viewState,
    dirty: isDirty()
  };
}

export function selectQuestionnaireSection(sectionId) {
  setSessionState(setCurrentSection(DEFAULT_DEFINITION, _sessionState, sectionId));
}

export function setQuestionnaireAnswer(questionId, value) {
  setSessionState(setQuestionAnswer(DEFAULT_DEFINITION, _sessionState, questionId, value));
}

export function setQuestionnaireBugReportField(questionId, fieldId, value) {
  setSessionState(setBugReportField(DEFAULT_DEFINITION, _sessionState, questionId, fieldId, value));
}

export function setQuestionnaireSectionScroll(sectionId, scrollTop) {
  setSessionState(setSectionScroll(DEFAULT_DEFINITION, _sessionState, sectionId, scrollTop), { notify: false });
}

export function openQuestionnaireInCredits() {
  if (String(_viewState.creditsViewMode || "landing") === "questionnaire") return;
  setViewState({ creditsViewMode: "questionnaire" });
}

export function showQuestionnaireCreditsLanding() {
  if (String(_viewState.creditsViewMode || "landing") === "landing") return;
  setViewState({ creditsViewMode: "landing" });
}

export async function loadQuestionnaireDraft({ promptForDirectory = true } = {}) {
  setViewState({ busy: true, busyLabel: "读取草稿中..." });
  try {
    const result = await loadQuestionnaireDraftFile({ promptForDirectory });
    if (!result.ok) {
      if (result.reason === "draft_missing") {
        await showNoticeDialog({
          title: "未找到草稿",
          message: "feedback/ 目录下没有发现问卷草稿文件。",
          actions: [{ id: "ok", label: "返回", kind: "primary" }]
        });
      } else if (result.reason === "permission_required") {
        await showNoticeDialog({
          title: "需要目录权限",
          message: "请先允许问卷访问 feedback/ 目录，之后才能继续读取草稿。",
          actions: [{ id: "ok", label: "返回", kind: "primary" }]
        });
      } else if (result.reason !== "unsupported_read") {
        await showNoticeDialog({
          title: "读取失败",
          message: `问卷草稿读取失败：${result.error?.message || result.reason || "unknown_error"}`,
          actions: [{ id: "ok", label: "返回", kind: "primary" }]
        });
      }
      return result;
    }

    const hydrated = hydrateQuestionnaireStateFromDraft(DEFAULT_DEFINITION, result.payload);
    setSessionState(hydrated, { notify: false, updatePersisted: true });
    setViewState({
      busy: false,
      busyLabel: "",
      lastLoadedDraft: {
        directoryLabel: result.directoryLabel,
        fileName: result.fileName,
        loadedAt: new Date().toISOString()
      },
      capability: result.capability
    }, { notify: false });
    notifyListeners();
    await showNoticeDialog({
      title: "已恢复草稿",
      message: `已从 ${result.directoryLabel}/${result.fileName} 继续填写。`,
      actions: [{ id: "ok", label: "继续填写", kind: "primary" }]
    });
    return result;
  } finally {
    setViewState({ busy: false, busyLabel: "" });
  }
}

export async function saveQuestionnaireDraft() {
  setViewState({ busy: true, busyLabel: "保存草稿中..." });
  try {
    const payload = buildDraftFilePayload(DEFAULT_DEFINITION, _sessionState);
    const result = await saveQuestionnaireDraftFile(payload);
    if (!result.ok) {
      await showNoticeDialog({
        title: "保存失败",
        message: `问卷草稿保存失败：${result.error?.message || result.reason || "unknown_error"}`,
        actions: [{ id: "ok", label: "返回", kind: "primary" }]
      });
      return result;
    }

    setViewState({
      lastSavedDraft: {
        directoryLabel: result.directoryLabel,
        fileName: result.fileName,
        savedAt: new Date().toISOString()
      },
      capability: result.capability
    }, { notify: false });
    _persistedDigest = getCurrentDigest();
    notifyListeners();
    await showNoticeDialog({
      title: "草稿已保存",
      message: result.mode === "filesystem"
        ? `已保存到 ${result.directoryLabel}/${result.fileName}。`
        : `当前环境不支持直接写入 feedback/，已改为浏览器下载 ${result.fileName}。`,
      actions: [{ id: "ok", label: "继续填写", kind: "primary" }]
    });
    return result;
  } finally {
    setViewState({ busy: false, busyLabel: "" });
  }
}

export async function clearQuestionnaireDraft() {
  const ok = await showConfirmDialog({
    title: "清空本地草稿",
    message: "这会清空当前问卷填写内容，并删除 feedback/ 下的草稿文件。正式存档不会受影响。",
    confirmLabel: "确认清空",
    cancelLabel: "取消"
  });
  if (!ok) return { ok: false, reason: "cancelled" };

  setViewState({ busy: true, busyLabel: "清空草稿中..." });
  try {
    const deleteResult = await clearQuestionnaireDraftFile({ promptForDirectory: false });
    if (!deleteResult.ok) {
      await showNoticeDialog({
        title: "删除失败",
        message: `问卷草稿删除失败：${deleteResult.error?.message || deleteResult.reason || "unknown_error"}`,
        actions: [{ id: "ok", label: "返回", kind: "primary" }]
      });
      return deleteResult;
    }

    setSessionState(clearQuestionnaireAnswers(DEFAULT_DEFINITION, _sessionState), { notify: false, updatePersisted: true });
    setViewState({
      lastSavedDraft: null,
      lastLoadedDraft: null,
      capability: deleteResult.capability
    }, { notify: false });
    notifyListeners();
    await showNoticeDialog({
      title: "已清空草稿",
      message: deleteResult.mode === "filesystem"
        ? `已清空当前内容，并处理 ${deleteResult.directoryLabel}/${deleteResult.fileName}。`
        : "当前环境没有 feedback/ 直写能力，已仅清空当前问卷内容。",
      actions: [{ id: "ok", label: "返回", kind: "primary" }]
    });
    return deleteResult;
  } finally {
    setViewState({ busy: false, busyLabel: "" });
  }
}

export async function exportQuestionnaireCompleted() {
  const progress = getQuestionnaireProgress(DEFAULT_DEFINITION, _sessionState);
  if (progress.requiredMissingIds.length > 0) {
    await showNoticeDialog({
      title: "仍有必填项未完成",
      message: `请先完成这些题目：${progress.requiredMissingIds.join(", ")}。`,
      actions: [{ id: "ok", label: "返回问卷", kind: "primary" }]
    });
    return { ok: false, reason: "required_missing", missingIds: progress.requiredMissingIds };
  }

  const confirmed = await showConfirmDialog({
    title: "完成并导出",
    message: "导出会生成独立 completed JSON 与 summary TXT，不会写入正式存档。",
    confirmLabel: "确认导出",
    cancelLabel: "继续检查"
  });
  if (!confirmed) return { ok: false, reason: "cancelled" };

  setViewState({ busy: true, busyLabel: "导出回执中..." });
  try {
    const previousState = _sessionState;
    const completedState = markQuestionnaireCompleted(_sessionState);
    setSessionState(completedState, { notify: false });
    const responsePayload = buildQuestionnaireResponseExport(DEFAULT_DEFINITION, completedState);
    const summaryText = buildQuestionnaireSummaryText(DEFAULT_DEFINITION, completedState);
    const result = await exportQuestionnaireFiles({ responsePayload, summaryText });
    if (!result.ok) {
      setSessionState(previousState, { notify: false });
      await showNoticeDialog({
        title: "导出失败",
        message: `问卷回执导出失败：${result.error?.message || result.reason || "unknown_error"}`,
        actions: [{ id: "ok", label: "返回", kind: "primary" }]
      });
      return result;
    }

    _sessionState = completedState;
    _persistedDigest = buildPersistenceDigest(DEFAULT_DEFINITION, completedState);
    setViewState({
      lastExport: {
        directoryLabel: result.directoryLabel,
        jsonFileName: result.jsonFileName,
        summaryFileName: result.summaryFileName,
        exportedAt: new Date().toISOString()
      },
      capability: result.capability
    }, { notify: false });
    notifyListeners();
    await showNoticeDialog({
      title: "问卷已导出",
      message: result.mode === "filesystem"
        ? `导出目录：${result.directoryLabel}/\nJSON：${result.jsonFileName}\nTXT：${result.summaryFileName || "未生成"}\n可直接把该文件发给开发者。`
        : `当前环境不支持直接写入 feedback/，已改为浏览器下载 ${result.jsonFileName}。可直接把该文件发给开发者。`,
      actions: [{ id: "ok", label: "返回问卷", kind: "primary" }]
    });
    return result;
  } finally {
    setViewState({ busy: false, busyLabel: "" });
  }
}

export async function requestQuestionnaireReturnToCredits() {
  if (isDirty()) {
    const leave = await showConfirmDialog({
      title: "返回开发组信息",
      message: "当前问卷有未保存修改。返回开发组信息后，这些改动会丢失，但不会影响正式存档。",
      confirmLabel: "仍然返回",
      cancelLabel: "继续填写"
    });
    if (!leave) return false;
  }
  setViewState({ creditsViewMode: "landing" });
  return true;
}

export async function requestQuestionnaireExitCredits(exitToMain) {
  if (String(_viewState.creditsViewMode || "landing") === "questionnaire" && isDirty()) {
    const leave = await showConfirmDialog({
      title: "离开开发组信息",
      message: "当前问卷有未保存修改。离开开发组信息后，这些改动会丢失，但不会影响正式存档。",
      confirmLabel: "仍然离开",
      cancelLabel: "继续填写"
    });
    if (!leave) return false;
  }
  setViewState({ creditsViewMode: "landing" }, { notify: false });
  if (typeof exitToMain === "function") {
    await exitToMain();
  }
  return true;
}

export function attachQuestionnairePanelRuntime(hostContainer) {
  const scrollHost = hostContainer?.querySelector?.("[data-questionnaire-scroll-host]");
  if (!scrollHost) return;

  const currentSectionId = String(scrollHost.dataset.sectionId || "").trim();
  const expectedScrollTop = Number(_sessionState.scrollTopBySection?.[currentSectionId] || 0);
  if (scrollHost.scrollTop !== expectedScrollTop) {
    scrollHost.scrollTop = expectedScrollTop;
  }

  scrollHost.addEventListener("scroll", () => {
    setQuestionnaireSectionScroll(currentSectionId, scrollHost.scrollTop);
  }, { passive: true });
}