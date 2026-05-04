const HANDLE_DB_NAME = "CambrianQuestionnaireFS";
const HANDLE_STORE_NAME = "handles";
const HANDLE_KEY = "feedback-directory";

const FEEDBACK_DIRECTORY_NAME = "feedback";
const DRAFT_FILE_NAME = "cambrian_questionnaire_v1__draft.json";

function supportsFileSystemAccess() {
  return typeof window !== "undefined"
    && window.isSecureContext !== false
    && typeof window.showDirectoryPicker === "function";
}

function openHandlesDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        db.createObjectStore(HANDLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("打开问卷文件句柄数据库失败"));
  });
}

async function readStoredHandle() {
  if (!supportsFileSystemAccess() || typeof indexedDB === "undefined") return null;
  const db = await openHandlesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, "readonly");
    const store = tx.objectStore(HANDLE_STORE_NAME);
    const request = store.get(HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("读取问卷目录句柄失败"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function writeStoredHandle(handle) {
  if (!supportsFileSystemAccess() || typeof indexedDB === "undefined") return;
  const db = await openHandlesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
    const store = tx.objectStore(HANDLE_STORE_NAME);
    const request = store.put(handle, HANDLE_KEY);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error("保存问卷目录句柄失败"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function clearStoredHandle() {
  if (!supportsFileSystemAccess() || typeof indexedDB === "undefined") return;
  const db = await openHandlesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
    const store = tx.objectStore(HANDLE_STORE_NAME);
    const request = store.delete(HANDLE_KEY);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error("删除问卷目录句柄失败"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function ensureHandlePermission(handle, mode = "readwrite") {
  if (!handle || typeof handle.queryPermission !== "function") return "granted";
  let permission = await handle.queryPermission({ mode });
  if (permission === "granted") return permission;
  if (typeof handle.requestPermission === "function") {
    permission = await handle.requestPermission({ mode });
  }
  return permission;
}

async function resolveFeedbackDirectoryHandle({ prompt } = {}) {
  if (!supportsFileSystemAccess()) {
    return { ok: false, reason: "unsupported" };
  }

  const storedHandle = await readStoredHandle().catch(() => null);
  if (storedHandle) {
    const permission = await ensureHandlePermission(storedHandle, "readwrite").catch(() => "denied");
    if (permission === "granted") {
      return { ok: true, handle: storedHandle, directoryLabel: FEEDBACK_DIRECTORY_NAME, source: "remembered" };
    }
    await clearStoredHandle().catch(() => null);
  }

  if (!prompt) {
    return { ok: false, reason: "permission_required" };
  }

  const pickedHandle = await window.showDirectoryPicker({
    id: "cambrian-feedback-dir",
    mode: "readwrite"
  });
  const feedbackHandle = pickedHandle.name === FEEDBACK_DIRECTORY_NAME
    ? pickedHandle
    : await pickedHandle.getDirectoryHandle(FEEDBACK_DIRECTORY_NAME, { create: true });
  await writeStoredHandle(feedbackHandle).catch(() => null);
  return { ok: true, handle: feedbackHandle, directoryLabel: FEEDBACK_DIRECTORY_NAME, source: "picker" };
}

async function writeTextFile(fileHandle, text) {
  const writable = await fileHandle.createWritable();
  await writable.write(String(text || ""));
  await writable.close();
}

async function readTextFile(fileHandle) {
  const file = await fileHandle.getFile();
  return file.text();
}

async function getUniqueFileHandle(dirHandle, baseName) {
  const normalizedBaseName = String(baseName || "").trim();
  if (!normalizedBaseName) {
    throw new Error("文件名为空");
  }
  const dotIndex = normalizedBaseName.lastIndexOf(".");
  const stem = dotIndex >= 0 ? normalizedBaseName.slice(0, dotIndex) : normalizedBaseName;
  const ext = dotIndex >= 0 ? normalizedBaseName.slice(dotIndex) : "";
  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? `${stem}${ext}` : `${stem}__${index + 1}${ext}`;
    try {
      await dirHandle.getFileHandle(candidate, { create: false });
    } catch {
      return {
        fileName: candidate,
        handle: await dirHandle.getFileHandle(candidate, { create: true })
      };
    }
  }
  throw new Error("无法生成唯一的导出文件名");
}

function downloadTextFile(fileName, text, mimeType) {
  const blob = new Blob([String(text || "")], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = String(fileName || "questionnaire_export.txt");
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildTimestampLabel(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hour = String(now.getUTCHours()).padStart(2, "0");
  const minute = String(now.getUTCMinutes()).padStart(2, "0");
  const second = String(now.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

export function getQuestionnaireFileCapability() {
  return {
    mode: supportsFileSystemAccess() ? "filesystem" : "download",
    supportsFileSystemAccess: supportsFileSystemAccess(),
    feedbackDirectoryName: FEEDBACK_DIRECTORY_NAME,
    draftFileName: DRAFT_FILE_NAME
  };
}

export async function loadQuestionnaireDraftFile({ promptForDirectory = false } = {}) {
  const capability = getQuestionnaireFileCapability();
  if (capability.mode !== "filesystem") {
    return { ok: false, reason: "unsupported_read", capability };
  }

  const directoryResult = await resolveFeedbackDirectoryHandle({ prompt: promptForDirectory });
  if (!directoryResult.ok) {
    return { ok: false, reason: directoryResult.reason, capability };
  }

  try {
    const fileHandle = await directoryResult.handle.getFileHandle(DRAFT_FILE_NAME, { create: false });
    const text = await readTextFile(fileHandle);
    return {
      ok: true,
      capability,
      directoryLabel: directoryResult.directoryLabel,
      fileName: DRAFT_FILE_NAME,
      jsonText: text,
      payload: JSON.parse(text)
    };
  } catch (error) {
    if (String(error?.name || "") === "NotFoundError") {
      return { ok: false, reason: "draft_missing", capability, directoryLabel: directoryResult.directoryLabel };
    }
    return { ok: false, reason: "read_failed", error, capability };
  }
}

export async function saveQuestionnaireDraftFile(payload) {
  const capability = getQuestionnaireFileCapability();
  const jsonText = JSON.stringify(payload, null, 2);

  if (capability.mode !== "filesystem") {
    downloadTextFile(DRAFT_FILE_NAME, jsonText, "application/json");
    return {
      ok: true,
      capability,
      mode: capability.mode,
      directoryLabel: "browser-downloads",
      fileName: DRAFT_FILE_NAME,
      jsonText
    };
  }

  const directoryResult = await resolveFeedbackDirectoryHandle({ prompt: true });
  if (!directoryResult.ok) {
    return { ok: false, reason: directoryResult.reason, capability };
  }

  try {
    const fileHandle = await directoryResult.handle.getFileHandle(DRAFT_FILE_NAME, { create: true });
    await writeTextFile(fileHandle, jsonText);
    return {
      ok: true,
      capability,
      mode: capability.mode,
      directoryLabel: directoryResult.directoryLabel,
      fileName: DRAFT_FILE_NAME,
      jsonText
    };
  } catch (error) {
    return { ok: false, reason: "write_failed", error, capability };
  }
}

export async function clearQuestionnaireDraftFile({ promptForDirectory = false } = {}) {
  const capability = getQuestionnaireFileCapability();
  if (capability.mode !== "filesystem") {
    return { ok: true, capability, mode: capability.mode, directoryLabel: "browser-downloads", fileName: DRAFT_FILE_NAME, removed: false };
  }

  const directoryResult = await resolveFeedbackDirectoryHandle({ prompt: promptForDirectory });
  if (!directoryResult.ok) {
    return { ok: false, reason: directoryResult.reason, capability };
  }

  try {
    await directoryResult.handle.removeEntry(DRAFT_FILE_NAME);
    return { ok: true, capability, mode: capability.mode, directoryLabel: directoryResult.directoryLabel, fileName: DRAFT_FILE_NAME, removed: true };
  } catch (error) {
    if (String(error?.name || "") === "NotFoundError") {
      return { ok: true, capability, mode: capability.mode, directoryLabel: directoryResult.directoryLabel, fileName: DRAFT_FILE_NAME, removed: false };
    }
    return { ok: false, reason: "delete_failed", error, capability };
  }
}

export async function exportQuestionnaireFiles({ responsePayload, summaryText = "", timestamp = buildTimestampLabel() } = {}) {
  const capability = getQuestionnaireFileCapability();
  const jsonFileName = `cambrian_questionnaire_v1__${timestamp}__completed.json`;
  const summaryFileName = `cambrian_questionnaire_v1__${timestamp}__summary.txt`;
  const jsonText = JSON.stringify(responsePayload, null, 2);

  if (capability.mode !== "filesystem") {
    downloadTextFile(jsonFileName, jsonText, "application/json");
    if (String(summaryText || "").trim()) {
      downloadTextFile(summaryFileName, summaryText, "text/plain;charset=utf-8");
    }
    return {
      ok: true,
      capability,
      mode: capability.mode,
      directoryLabel: "browser-downloads",
      jsonFileName,
      summaryFileName: String(summaryText || "").trim() ? summaryFileName : null
    };
  }

  const directoryResult = await resolveFeedbackDirectoryHandle({ prompt: true });
  if (!directoryResult.ok) {
    return { ok: false, reason: directoryResult.reason, capability };
  }

  try {
    const jsonTarget = await getUniqueFileHandle(directoryResult.handle, jsonFileName);
    await writeTextFile(jsonTarget.handle, jsonText);

    let summaryTarget = null;
    if (String(summaryText || "").trim()) {
      summaryTarget = await getUniqueFileHandle(directoryResult.handle, summaryFileName);
      await writeTextFile(summaryTarget.handle, summaryText);
    }

    return {
      ok: true,
      capability,
      mode: capability.mode,
      directoryLabel: directoryResult.directoryLabel,
      jsonFileName: jsonTarget.fileName,
      summaryFileName: summaryTarget?.fileName || null
    };
  } catch (error) {
    return { ok: false, reason: "export_failed", error, capability };
  }
}