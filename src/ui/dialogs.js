function ensureNoticeDialogHost() {
  let host = document.getElementById("notice-dialog-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "notice-dialog-host";
    host.className = "notice-dialog-host";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
  }
  return host;
}

let _modalEscHandler = null;
let _modalOutsideHandler = null;
const NOTICE_DIALOG_CLOSE_ANIM_MS = 280;
const NOTICE_DIALOG_CLOSE_FALLBACK_BUFFER_MS = 120;

function createNoticeTextBlock(text, extraClassName = "") {
  const block = document.createElement("div");
  block.className = `notice-dialog-text-block${extraClassName ? ` ${extraClassName}` : ""}`;
  const paragraphs = String(text || "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length <= 1) {
    const lines = String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      const lineEl = document.createElement("p");
      lineEl.textContent = line;
      block.appendChild(lineEl);
    }
    return block;
  }

  for (const paragraph of paragraphs) {
    const paragraphEl = document.createElement("p");
    paragraphEl.textContent = paragraph.replace(/\n+/g, " ");
    block.appendChild(paragraphEl);
  }
  return block;
}

function createFrontHallBoardPaper(label, text, variant, options = {}) {
  const paper = document.createElement("article");
  paper.className = `front-hall-board-paper front-hall-board-paper-${variant}`;

  const tag = document.createElement("div");
  tag.className = "front-hall-board-paper-tag";
  tag.textContent = label;
  paper.appendChild(tag);

  if (options.marker === "tape") {
    const tape = document.createElement("div");
    tape.className = "front-hall-board-paper-tape";
    paper.appendChild(tape);
  }

  if (options.marker === "curl") {
    const curl = document.createElement("div");
    curl.className = "front-hall-board-paper-curl";
    paper.appendChild(curl);
  }

  const content = createNoticeTextBlock(text, options.contentClassName || "");
  content.classList.add("front-hall-board-paper-content");
  paper.appendChild(content);

  return paper;
}

function buildFrontHallBoardDialog(card, payload) {
  const model = payload?.contentModel && typeof payload.contentModel === "object"
    ? payload.contentModel
    : null;
  if (!model) return null;

  const titleText = String(model.title || payload?.title || "前廊告示板").trim() || "前廊告示板";
  const metaText = String(model.meta || "当日张贴 / 前廊").trim() || "当日张贴 / 前廊";

  const shell = document.createElement("section");
  shell.className = "front-hall-board-shell";

  const header = document.createElement("header");
  header.className = "front-hall-board-header";

  const heading = document.createElement("div");
  heading.className = "front-hall-board-heading";

  const title = document.createElement("h2");
  title.className = "front-hall-board-title";
  title.textContent = titleText;

  const meta = document.createElement("div");
  meta.className = "front-hall-board-meta";
  meta.textContent = metaText;

  heading.appendChild(title);
  heading.appendChild(meta);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "front-hall-board-close";
  closeBtn.setAttribute("aria-label", "关闭前廊告示板");
  closeBtn.textContent = "×";

  header.appendChild(heading);
  header.appendChild(closeBtn);

  const content = document.createElement("div");
  content.className = "front-hall-board-content";

  const boardSurface = document.createElement("div");
  boardSurface.className = "front-hall-board-surface";

  const stickyRow = document.createElement("div");
  stickyRow.className = "front-hall-board-sticky-row";
  stickyRow.appendChild(
    createFrontHallBoardPaper("常驻", model.stickyNotice || "", "sticky", {
      contentClassName: "is-sticky-copy"
    })
  );

  const dailyGrid = document.createElement("div");
  dailyGrid.className = "front-hall-board-daily-grid";
  dailyGrid.appendChild(createFrontHallBoardPaper("通知", model.formalNotice || "", "formal"));
  dailyGrid.appendChild(createFrontHallBoardPaper("便条", model.handwrittenNote || "", "handwritten", {
    marker: "tape",
    contentClassName: "is-note"
  }));
  dailyGrid.appendChild(createFrontHallBoardPaper("残页", model.oldNoticeFragment || "", "fragment", {
    marker: "curl"
  }));

  boardSurface.appendChild(stickyRow);
  boardSurface.appendChild(dailyGrid);
  content.appendChild(boardSurface);

  const footer = document.createElement("div");
  footer.className = "front-hall-board-footer";

  const actionsHost = document.createElement("div");
  actionsHost.className = "front-hall-board-actions";
  footer.appendChild(actionsHost);

  shell.appendChild(header);
  shell.appendChild(content);
  shell.appendChild(footer);
  card.appendChild(shell);

  return {
    closeBtn,
    titleText,
    actionsHost
  };
}

function resetNoticeHostState(host) {
  if (!host) return;
  host.className = "notice-dialog-host";
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = "";
}

function clearNoticeModalLock() {
  document.body.classList.remove("modal-open", "blurred", "dimmed");
  document.body.style.overflow = "";
}

function cleanupStaleNoticeDialog({ preserveHost = true } = {}) {
  detachModalGuards();

  const hosts = Array.from(document.querySelectorAll(".notice-dialog-host"));
  const modalRoots = Array.from(document.querySelectorAll("#modal-root"));
  const modalOverlays = Array.from(document.querySelectorAll("#modal-overlay"));

  for (const node of [...modalRoots, ...modalOverlays]) {
    node.remove();
  }

  for (const host of hosts) {
    if (preserveHost && host.id === "notice-dialog-host") {
      resetNoticeHostState(host);
      continue;
    }
    host.remove();
  }

  clearNoticeModalLock();
}

function activateNoticeHost(host, { modal = true } = {}) {
  cleanupStaleNoticeDialog({ preserveHost: true });
  host.innerHTML = "";
  host.setAttribute("aria-hidden", "false");
  host.classList.toggle("notice-dialog-nonmodal", !modal);
  if (modal) {
    document.body.classList.add("modal-open", "blurred", "dimmed");
    document.body.style.overflow = "hidden";
  } else {
    clearNoticeModalLock();
  }
}

function isReduceMotionEnabled() {
  const bodyReduced = document.body?.classList?.contains("settings-reduce-motion");
  const mediaReduced = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return !!bodyReduced || !!mediaReduced;
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function getNoticeDialogClosingVariantClass(host) {
  const card = host?.querySelector?.(".notice-dialog-card") || null;
  if (!card) return "";
  if (card.classList.contains("notice-dialog-card-front-hall-board")) {
    return "notice-dialog-closing-variant-front-hall-board";
  }
  return "";
}

function getNoticeDialogCloseFallbackMs(transitionName, forceAnimation = false) {
  if (!transitionName || (!forceAnimation && isReduceMotionEnabled())) {
    return 0;
  }
  if (transitionName === "load-success") {
    return 460;
  }
  return NOTICE_DIALOG_CLOSE_ANIM_MS + NOTICE_DIALOG_CLOSE_FALLBACK_BUFFER_MS;
}

function startNoticeDialogCloseTransition(host, transitionName, forceAnimation = false) {
  if (!host) {
    return 0;
  }

  const variantClosingClass = getNoticeDialogClosingVariantClass(host);
  if (!transitionName) {
    if (!variantClosingClass || (!forceAnimation && isReduceMotionEnabled())) {
      return 0;
    }
    host.classList.add("notice-dialog-closing", variantClosingClass);
    return NOTICE_DIALOG_CLOSE_ANIM_MS;
  }

  if (!forceAnimation && isReduceMotionEnabled()) {
    return 0;
  }

  const overlay = host.querySelector(".notice-dialog-overlay");
  const card = host.querySelector(".notice-dialog-card");

  if (transitionName === "load-success" && overlay && card) {
    host.classList.add("notice-dialog-closing", `notice-dialog-closing-${transitionName}`);
    if (variantClosingClass) {
      host.classList.add(variantClosingClass);
    }

    overlay.style.setProperty("will-change", "opacity");
    overlay.style.setProperty("transition", "none", "important");
    overlay.style.setProperty("opacity", "1", "important");

    card.style.setProperty("will-change", "transform, opacity, filter");
    card.style.setProperty("transition", "none", "important");
    card.style.setProperty("transform", "translateY(0) scale(1)", "important");
    card.style.setProperty("opacity", "1", "important");
    card.style.setProperty("filter", "blur(0px)", "important");

    void overlay.offsetWidth;
    void card.offsetWidth;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.setProperty("transition", "opacity 420ms ease", "important");
        card.style.setProperty(
          "transition",
          "transform 420ms cubic-bezier(0.18, 0.88, 0.2, 1), opacity 420ms cubic-bezier(0.18, 0.88, 0.2, 1), filter 420ms cubic-bezier(0.18, 0.88, 0.2, 1)",
          "important"
        );

        overlay.style.setProperty("opacity", "0", "important");
        card.style.setProperty("transform", "translateY(-48px) scale(0.9)", "important");
        card.style.setProperty("opacity", "0", "important");
        card.style.setProperty("filter", "blur(3px)", "important");
      });
    });

    return 460;
  }

  host.classList.add("notice-dialog-closing", `notice-dialog-closing-${transitionName}`);
  if (variantClosingClass) {
    host.classList.add(variantClosingClass);
  }
  return getNoticeDialogCloseFallbackMs(transitionName, forceAnimation);
}

function detachModalGuards() {
  if (_modalEscHandler) {
    window.removeEventListener("keydown", _modalEscHandler, true);
    _modalEscHandler = null;
  }
  if (_modalOutsideHandler) {
    window.removeEventListener("pointerdown", _modalOutsideHandler, true);
    _modalOutsideHandler = null;
  }
}

function activateModalHost(host) {
  activateNoticeHost(host, { modal: true });
}

function bindModalGuards(card, onCancel) {
  detachModalGuards();
  _modalEscHandler = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onCancel();
  };
  _modalOutsideHandler = (event) => {
    const target = event.target;
    if (card && card.contains(target)) return;
    onCancel();
  };
  window.addEventListener("keydown", _modalEscHandler, true);
  window.addEventListener("pointerdown", _modalOutsideHandler, true);
}

export function closeModal() {
  cleanupStaleNoticeDialog({ preserveHost: true });
}

/**
 * 显示游戏内通知对话框（替代原生 alert/confirm）
 * @param {Object} payload
 * @param {string} payload.title
 * @param {string} payload.message
 * @param {Array<{id:string,label:string,kind?:"primary"|"secondary"}>} payload.actions
 * @returns {Promise<string>} 点击的 action id
 */
export function showNoticeDialog(payload = {}) {
  const {
    title = "通知",
    message = "",
    illustration = null,
    contentModel = null,
    customRenderer = null,
    actions = [{ id: "back", label: "返回", kind: "primary" }],
    closeTransition = "",
    visualVariant = "",
    forceAnimation = false,
    nonModal = false,
    autoCloseMs = 0,
    modalGuards = null
  } = payload;

  const allowEscapeClose = modalGuards?.closeOnEscape !== false;
  const allowPointerDownOutsideClose = modalGuards?.closeOnPointerDownOutside !== false;

  const host = ensureNoticeDialogHost();
  activateNoticeHost(host, { modal: !nonModal });
  host.classList.toggle("notice-dialog-force-animation", !!forceAnimation);

  const overlay = document.createElement("div");
  overlay.id = "modal-overlay";
  overlay.className = "notice-dialog-overlay";

  const card = document.createElement("div");
  card.id = "modal-root";
  card.className = "notice-dialog-card";
  if (visualVariant) {
    card.classList.add(`notice-dialog-card-${String(visualVariant)}`);
  }
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", title);

  const isFrontHallBoard = visualVariant === "front-hall-board" && contentModel && typeof contentModel === "object";
  if (isFrontHallBoard) {
    card.classList.add("notice-dialog-card-front-hall-board");
  }

  const titleEl = document.createElement("div");
  titleEl.className = "notice-dialog-title";
  titleEl.textContent = title;

  const bodyEl = document.createElement("div");
  bodyEl.className = "notice-dialog-body";
  bodyEl.textContent = message;

  let illustrationWrap = null;
  const illustrationSrc = String(illustration?.src || "").trim();
  if (illustrationSrc) {
    illustrationWrap = document.createElement("div");
    illustrationWrap.className = "notice-dialog-illustration";

    const img = document.createElement("img");
    img.className = "notice-dialog-illustration-image";
    img.src = illustrationSrc;
    img.alt = String(illustration?.alt || title || "插图");
    img.loading = "eager";
    img.decoding = "async";
    illustrationWrap.appendChild(img);
  }

  const footer = document.createElement("div");
  footer.className = "notice-dialog-actions";

  let variantRefs = null;
  if (isFrontHallBoard) {
    variantRefs = buildFrontHallBoardDialog(card, { ...payload, contentModel });
    if (variantRefs?.titleText) {
      card.setAttribute("aria-label", variantRefs.titleText);
    }
  } else if (typeof customRenderer !== "function") {
    card.appendChild(titleEl);
    if (illustrationWrap) {
      card.appendChild(illustrationWrap);
    }
    card.appendChild(bodyEl);
    card.appendChild(footer);
  }
  overlay.appendChild(card);
  host.appendChild(overlay);

  return new Promise((resolve) => {
    let done = false;
    let closing = false;
    let autoCloseTimer = null;
    let closeFallbackTimer = null;
    const restoreFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const clearCloseFallbackTimer = () => {
      if (closeFallbackTimer) {
        clearTimeout(closeFallbackTimer);
        closeFallbackTimer = null;
      }
    };

    const cleanupCloseListeners = [];

    const removeCloseListeners = () => {
      while (cleanupCloseListeners.length > 0) {
        const dispose = cleanupCloseListeners.pop();
        try {
          dispose?.();
        } catch (_error) {
          // ignore teardown listener errors
        }
      }
    };

    const finalizeClose = (id) => {
      if (done) return;
      done = true;
      clearCloseFallbackTimer();
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
      }
      removeCloseListeners();
      cleanupStaleNoticeDialog({ preserveHost: true });
      if (restoreFocusTarget && restoreFocusTarget.isConnected && typeof restoreFocusTarget.focus === "function") {
        try {
          restoreFocusTarget.focus({ preventScroll: true });
        } catch (_error) {
          try {
            restoreFocusTarget.focus();
          } catch (_ignored) {
            // ignore focus restore failure
          }
        }
      }
      resolve(id);
    };

    const finish = (id) => {
      if (done || closing) return;
      closing = true;
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
      }
      detachModalGuards();
      const transitionName = String(closeTransition || "").trim();
      const fallbackMs = startNoticeDialogCloseTransition(host, transitionName, !!forceAnimation);
      const complete = () => finalizeClose(id);

      if (fallbackMs <= 0) {
        complete();
        return;
      }

      closeFallbackTimer = setTimeout(complete, fallbackMs + NOTICE_DIALOG_CLOSE_FALLBACK_BUFFER_MS);

      for (const target of [host.querySelector(".notice-dialog-card"), host.querySelector(".notice-dialog-overlay")]) {
        if (!target) continue;
        const onDone = () => complete();
        target.addEventListener("animationend", onDone, { once: true });
        target.addEventListener("transitionend", onDone, { once: true });
        cleanupCloseListeners.push(() => target.removeEventListener("animationend", onDone));
        cleanupCloseListeners.push(() => target.removeEventListener("transitionend", onDone));
      }
    };

    if (!nonModal && allowEscapeClose && allowPointerDownOutsideClose) {
      bindModalGuards(card, () => finish(actions[0]?.id || "back"));
    } else {
      detachModalGuards();
      if (!nonModal && allowEscapeClose) {
        _modalEscHandler = (event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          finish(actions[0]?.id || "back");
        };
        window.addEventListener("keydown", _modalEscHandler, true);
      }
      if (!nonModal && allowPointerDownOutsideClose) {
        _modalOutsideHandler = (event) => {
          const target = event.target;
          if (card && card.contains(target)) return;
          finish(actions[0]?.id || "back");
        };
        window.addEventListener("pointerdown", _modalOutsideHandler, true);
      }
    }

    if (typeof customRenderer === "function") {
      const customResult = customRenderer({
        documentRoot: document,
        host,
        overlay,
        card,
        payload,
        requestClose: finish
      });
      variantRefs = customResult && typeof customResult === "object" ? customResult : null;
    }

    if (variantRefs?.closeBtn) {
      variantRefs.closeBtn.addEventListener("click", () => finish("close"));
    }

    const actionHost = variantRefs?.actionsHost?.isConnected ? variantRefs.actionsHost : footer;
    if (actionHost?.isConnected) {
      for (const action of Array.isArray(actions) ? actions : []) {
        const btn = document.createElement("button");
        btn.type = "button";
        const isBoardAction = actionHost === variantRefs?.actionsHost;
        btn.className = isBoardAction
          ? `front-hall-board-return ${action?.kind === "secondary" ? "is-secondary" : "is-primary"}`
          : `notice-dialog-btn ${action?.kind === "secondary" ? "is-secondary" : "is-primary"}`;
        btn.textContent = String(action?.label || "确定");
        btn.addEventListener("click", () => finish(String(action?.id || "ok")));
        actionHost.appendChild(btn);
      }
    }

    const firstBtn = actionHost?.querySelector("button") || footer.querySelector("button");
    if (!nonModal) {
      if (variantRefs?.initialFocus && typeof variantRefs.initialFocus.focus === "function") {
        variantRefs.initialFocus.focus();
      } else if (variantRefs?.closeBtn) {
        variantRefs.closeBtn.focus();
      } else if (firstBtn) {
        firstBtn.focus();
      }
    }

    if (Number(autoCloseMs) > 0) {
      autoCloseTimer = setTimeout(() => {
        finish(actions[0]?.id || "back");
      }, Math.max(0, Number(autoCloseMs) || 0));
    }
  });
}

/**
 * 显示确认对话框
 * @param {Object} payload
 * @param {string} payload.title
 * @param {string} payload.message
 * @param {string} payload.confirmLabel
 * @param {string} payload.cancelLabel
 * @returns {Promise<boolean>}
 */
export async function showConfirmDialog(payload = {}) {
  const {
    title = "确认",
    message = "请确认操作",
    confirmLabel = "确认",
    cancelLabel = "取消"
  } = payload;

  const picked = await showNoticeDialog({
    title,
    message,
    actions: [
      { id: "cancel", label: cancelLabel, kind: "secondary" },
      { id: "confirm", label: confirmLabel, kind: "primary" }
    ]
  });

  return picked === "confirm";
}

/**
 * 显示输入对话框
 * @param {Object} payload
 * @param {string} payload.title
 * @param {string} payload.message
 * @param {string} payload.defaultValue
 * @param {string} payload.placeholder
 * @param {string} payload.confirmLabel
 * @param {string} payload.cancelLabel
 * @returns {Promise<string|null>} 取消返回 null
 */
export function showInputDialog(payload = {}) {
  const {
    title = "输入",
    message = "",
    defaultValue = "",
    placeholder = "",
    confirmLabel = "确认",
    cancelLabel = "取消"
  } = payload;

  const host = ensureNoticeDialogHost();
  activateModalHost(host);

  const overlay = document.createElement("div");
  overlay.id = "modal-overlay";
  overlay.className = "notice-dialog-overlay";

  const card = document.createElement("div");
  card.id = "modal-root";
  card.className = "notice-dialog-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", title);

  const titleEl = document.createElement("div");
  titleEl.className = "notice-dialog-title";
  titleEl.textContent = title;

  const bodyEl = document.createElement("div");
  bodyEl.className = "notice-dialog-body";
  bodyEl.textContent = message;

  const inputEl = document.createElement("input");
  inputEl.type = "text";
  inputEl.className = "notice-dialog-input";
  inputEl.value = String(defaultValue ?? "");
  inputEl.placeholder = String(placeholder ?? "");

  const footer = document.createElement("div");
  footer.className = "notice-dialog-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "notice-dialog-btn is-secondary";
  cancelBtn.textContent = cancelLabel;

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "notice-dialog-btn is-primary";
  confirmBtn.textContent = confirmLabel;

  footer.appendChild(cancelBtn);
  footer.appendChild(confirmBtn);

  card.appendChild(titleEl);
  card.appendChild(bodyEl);
  card.appendChild(inputEl);
  card.appendChild(footer);
  overlay.appendChild(card);
  host.appendChild(overlay);

  return new Promise((resolve) => {
    let done = false;
    let onKeyDown = null;

    const finish = (value) => {
      if (done) return;
      done = true;
      if (onKeyDown) {
        window.removeEventListener("keydown", onKeyDown, true);
      }
      closeModal();
      resolve(value);
    };

    onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        finish(inputEl.value);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    bindModalGuards(card, () => finish(null));

    cancelBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      finish(null);
    });
    confirmBtn.addEventListener("click", () => finish(inputEl.value));

    inputEl.focus();
    inputEl.select();
  });
}

/**
 * 显示导入存档对话框（文件选择 + 槽位选择）
 * @param {Object} payload
 * @param {string} payload.title
 * @param {string} payload.message
 * @param {Array<{slotId:(number|"auto"),isAuto?:boolean,isEmpty?:boolean,corrupted?:boolean}>} payload.slots
 * @param {number|null} payload.fixedSlotId
 * @returns {Promise<null|{jsonString:string,slotId:number}>}
 */
export function showImportSaveDialog(payload = {}) {
  const {
    title = "导入存档",
    message = "选择存档文件并指定目标槽位（会覆盖目标槽位数据）。",
    slots = [],
    fixedSlotId = null
  } = payload;

  const host = ensureNoticeDialogHost();
  activateModalHost(host);

  const overlay = document.createElement("div");
  overlay.id = "modal-overlay";
  overlay.className = "notice-dialog-overlay";

  const card = document.createElement("div");
  card.id = "modal-root";
  card.className = "notice-dialog-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", title);

  const titleEl = document.createElement("div");
  titleEl.className = "notice-dialog-title";
  titleEl.textContent = title;

  const bodyEl = document.createElement("div");
  bodyEl.className = "notice-dialog-body";
  bodyEl.textContent = message;

  const form = document.createElement("div");
  form.className = "notice-dialog-form";

  const fileRow = document.createElement("div");
  fileRow.className = "notice-dialog-form-row";
  const fileBtn = document.createElement("button");
  fileBtn.type = "button";
  fileBtn.className = "notice-dialog-btn is-secondary";
  fileBtn.textContent = "选择文件";
  const fileHint = document.createElement("div");
  fileHint.className = "notice-dialog-form-hint";
  fileHint.textContent = "未选择文件";
  fileRow.appendChild(fileBtn);
  fileRow.appendChild(fileHint);

  const slotRow = document.createElement("div");
  slotRow.className = "notice-dialog-form-row";
  const slotLabel = document.createElement("div");
  slotLabel.className = "notice-dialog-form-label";
  slotLabel.textContent = "目标槽位";
  const slotSelect = document.createElement("select");
  slotSelect.className = "notice-dialog-input notice-dialog-select";

  const numericSlots = Array.isArray(slots)
    ? slots
      .map(s => s?.slotId)
      .filter(id => id !== "auto")
      .map(id => (typeof id === "number" ? id : parseInt(String(id), 10)))
      .filter(n => Number.isFinite(n) && n > 0)
    : [];
  const unique = Array.from(new Set(numericSlots)).sort((a, b) => a - b);

  if (fixedSlotId != null && Number.isFinite(Number(fixedSlotId))) {
    const fixed = Math.trunc(Number(fixedSlotId));
    slotSelect.disabled = true;
    const opt = document.createElement("option");
    opt.value = String(fixed);
    opt.textContent = `槽位 ${fixed}`;
    slotSelect.appendChild(opt);
  } else {
    if (unique.length === 0) {
      unique.push(1);
    }
    for (const id of unique) {
      const opt = document.createElement("option");
      opt.value = String(id);
      opt.textContent = `槽位 ${id}`;
      slotSelect.appendChild(opt);
    }
  }

  slotRow.appendChild(slotLabel);
  slotRow.appendChild(slotSelect);

  const errLine = document.createElement("div");
  errLine.className = "notice-dialog-form-error";
  errLine.textContent = "";

  const footer = document.createElement("div");
  footer.className = "notice-dialog-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "notice-dialog-btn is-secondary";
  cancelBtn.textContent = "取消";

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "notice-dialog-btn is-primary";
  confirmBtn.textContent = "导入";

  footer.appendChild(cancelBtn);
  footer.appendChild(confirmBtn);

  form.appendChild(fileRow);
  form.appendChild(slotRow);
  form.appendChild(errLine);

  card.appendChild(titleEl);
  card.appendChild(bodyEl);
  card.appendChild(form);
  card.appendChild(footer);
  overlay.appendChild(card);
  host.appendChild(overlay);

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json,text/plain";
  input.style.display = "none";
  card.appendChild(input);

  let selectedText = null;
  let selectedName = "";

  const readFileAsText = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });

  return new Promise((resolve) => {
    let done = false;

    const finish = (value) => {
      if (done) return;
      done = true;
      window.removeEventListener("keydown", onKeyDown, true);
      closeModal();
      resolve(value);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
      if (event.key === "Enter") {
        if (selectedText) {
          event.preventDefault();
          const slotId = parseInt(String(slotSelect.value), 10);
          finish({ jsonString: selectedText, slotId });
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    bindModalGuards(card, () => finish(null));

    fileBtn.addEventListener("click", () => {
      errLine.textContent = "";
      input.value = "";
      input.click();
    });

    input.addEventListener("change", async () => {
      errLine.textContent = "";
      const file = input.files && input.files[0];
      if (!file) return;
      selectedName = file.name || "";
      fileHint.textContent = selectedName ? `已选择：${selectedName}` : "已选择文件";
      selectedText = await readFileAsText(file);
      if (!selectedText) {
        errLine.textContent = "读取文件失败，请重试。";
      }
    });

    cancelBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      finish(null);
    });
    confirmBtn.addEventListener("click", () => {
      errLine.textContent = "";
      if (!selectedText) {
        errLine.textContent = "请先选择一个存档 JSON 文件。";
        return;
      }
      const slotId = parseInt(String(slotSelect.value), 10);
      if (!Number.isFinite(slotId) || slotId <= 0) {
        errLine.textContent = "目标槽位无效。";
        return;
      }
      finish({ jsonString: selectedText, slotId });
    });

    fileBtn.focus();
  });
}
