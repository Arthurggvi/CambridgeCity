let _tasksEscBound = false;
let _controllerOptions = {};

function getControllerOption(name, fallback = null) {
  const value = _controllerOptions && _controllerOptions[name];
  return typeof value === "undefined" ? fallback : value;
}

function getDispatch() {
  return import("./pipeline/dispatch.js").then((mod) => mod.dispatch);
}

function defaultEscapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showTasksRefTooltip(tooltip, html) {
  if (!tooltip) return;
  if (tooltip._hideTimer) {
    clearTimeout(tooltip._hideTimer);
    tooltip._hideTimer = null;
  }
  tooltip.innerHTML = html;
  tooltip.style.display = "block";
  requestAnimationFrame(() => tooltip.classList.add("is-visible"));
}

function hideTasksRefTooltip(tooltip) {
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
  if (tooltip._hideTimer) clearTimeout(tooltip._hideTimer);
  tooltip._hideTimer = setTimeout(() => {
    tooltip.style.display = "none";
    tooltip._hideTimer = null;
  }, 160);
}

function waitForTasksOverlayCloseSignal(overlay) {
  return new Promise((resolve) => {
    if (!overlay) {
      resolve({ source: "none" });
      return;
    }
    const dialog = overlay.querySelector(".tasks-dialog");
    let done = false;
    const finish = (source) => {
      if (done) return;
      done = true;
      overlay.removeEventListener("transitionend", onEnd);
      overlay.removeEventListener("animationend", onEnd);
      if (dialog) {
        dialog.removeEventListener("transitionend", onEnd);
        dialog.removeEventListener("animationend", onEnd);
      }
      clearTimeout(timer);
      resolve({ source });
    };
    const onEnd = (event) => {
      const target = event?.target;
      if (target !== overlay && target !== dialog) return;
      finish("event");
    };
    overlay.addEventListener("transitionend", onEnd);
    overlay.addEventListener("animationend", onEnd);
    if (dialog) {
      dialog.addEventListener("transitionend", onEnd);
      dialog.addEventListener("animationend", onEnd);
    }
    const timer = setTimeout(() => finish("timeout"), 260);
  });
}

export function showTasksOverlay(host, overlay) {
  if (!host) return;
  host.setAttribute("aria-hidden", "false");
  host.hidden = false;
  host.dataset.active = "true";
  host.dataset.open = "true";
  if (!overlay) return;
  overlay.classList.remove("is-closing");
  requestAnimationFrame(() => {
    if (!overlay.isConnected) return;
    overlay.classList.add("is-visible");
  });
}

export async function closeTasksOverlay() {
  const host = document.getElementById("tasks-overlay-host");
  const overlay = host?.querySelector?.(".tasks-overlay");
  if (!overlay || overlay.classList.contains("is-closing")) {
    if (host) {
      host.innerHTML = "";
      host.setAttribute("aria-hidden", "true");
      host.hidden = true;
      host.dataset.active = "false";
      host.dataset.open = "false";
    }
    const onClosed = getControllerOption("onClosed");
    if (typeof onClosed === "function") onClosed();
    return;
  }
  overlay.classList.add("is-closing");
  overlay.classList.remove("is-visible");
  await waitForTasksOverlayCloseSignal(overlay);
  if (host) {
    host.innerHTML = "";
    host.setAttribute("aria-hidden", "true");
    host.hidden = true;
    host.dataset.active = "false";
    host.dataset.open = "false";
  }
  const onClosed = getControllerOption("onClosed");
  if (typeof onClosed === "function") onClosed();
}

export const closeTasksOverlayWithTransition = closeTasksOverlay;

export function ensureTasksOverlayHost(options = {}) {
  _controllerOptions = {
    ..._controllerOptions,
    ...options
  };

  let host = document.getElementById("tasks-overlay-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "tasks-overlay-host";
    host.setAttribute("aria-hidden", "true");

    host.addEventListener("click", async (event) => {
      const closeBtn = event.target.closest(".tasks-close-btn");
      if (closeBtn && host.contains(closeBtn)) {
        await closeTasksOverlay();
        return;
      }

      const actionTarget = event.target.closest("[data-action-id]");
      if (actionTarget && host.contains(actionTarget)) {
        const actionId = actionTarget.dataset.actionId;
        if (!actionId) return;

        const dispatch = await getDispatch();
        if (actionId === "tasks_add") {
          const showInputDialog = getControllerOption("showInputDialog");
          if (typeof showInputDialog !== "function") {
            await dispatch(actionId);
            return;
          }
          const title = await showInputDialog({
            title: "新增备忘",
            message: "输入待办标题",
            placeholder: "例如：去政务大厅问身份证明",
            confirmLabel: "添加",
            cancelLabel: "取消"
          });
          if (title == null) return;
          await dispatch("tasks_add", { title });
          return;
        }

        if (actionId.startsWith("tasks_delete:")) {
          const taskId = actionId.slice("tasks_delete:".length).trim();
          const row = taskId
            ? host.querySelector(`.tasks-list-row[data-action-id="tasks_select:${taskId}"]`)
            : null;
          if (row) {
            row.classList.add("is-removing");
            setTimeout(async () => {
              await dispatch(actionId);
            }, 180);
            return;
          }
        }

        await dispatch(actionId);
        return;
      }

      const backdrop = event.target.closest(".tasks-backdrop");
      if (backdrop && host.contains(backdrop)) {
        await closeTasksOverlay();
      }
    });

    host.addEventListener("mouseover", (event) => {
      const refEl = event.target.closest(".task-ref[data-ref-type][data-ref-id]");
      if (!refEl || !host.contains(refEl)) return;
      const tooltip = host.querySelector(".tasks-ref-tooltip");
      if (!tooltip) return;
      const escapeHtml = getControllerOption("escapeHtml", defaultEscapeHtml);
      const refType = String(refEl.dataset.refType || "");
      if (refType === "ship") {
        const shipTitle = refEl.dataset.refTitle || refEl.textContent || "词条";
        const shipTip = refEl.dataset.refTooltip || "";
        showTasksRefTooltip(
          tooltip,
          `<div class="tasks-ref-tip-title">${escapeHtml(shipTitle)}</div><div class="tasks-ref-tip-sub">${escapeHtml(shipTip || "暂无说明")}</div>`
        );
        return;
      }
      const title = refEl.dataset.refTitle || refEl.textContent || "引用";
      const detail = refEl.dataset.refOpenHours || "暂无营业时间信息";
      const location = refEl.dataset.refLocation || "";
      const locationLine = location
        ? `<div class="tasks-ref-tip-sub">地点：${escapeHtml(location)}</div>`
        : "";
      showTasksRefTooltip(
        tooltip,
        `<div class="tasks-ref-tip-title">${escapeHtml(title)}</div><div class="tasks-ref-tip-sub">营业时间：${escapeHtml(detail)}</div>${locationLine}`
      );
    });

    host.addEventListener("mousemove", (event) => {
      const tooltip = host.querySelector(".tasks-ref-tooltip");
      if (!tooltip || tooltip.style.display !== "block") return;
      const left = Math.min(window.innerWidth - 260, event.clientX + 14);
      const top = Math.max(12, event.clientY - 48);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    });

    host.addEventListener("mouseout", (event) => {
      const refEl = event.target.closest(".task-ref[data-ref-type][data-ref-id]");
      if (!refEl || !host.contains(refEl)) return;
      const tooltip = host.querySelector(".tasks-ref-tooltip");
      hideTasksRefTooltip(tooltip);
    });

    document.body.appendChild(host);
  }

  if (!_tasksEscBound) {
    document.addEventListener("keydown", async (event) => {
      if (event.key !== "Escape") return;
      const getOverlayType = getControllerOption("getOverlayType");
      if (typeof getOverlayType === "function" && getOverlayType() !== "tasks") return;
      const isQuickKeysEnabled = getControllerOption("isQuickKeysEnabled");
      if (typeof isQuickKeysEnabled === "function" && !isQuickKeysEnabled()) return;
      await closeTasksOverlay();
    });
    _tasksEscBound = true;
  }

  if (host.parentElement !== document.body) {
    document.body.appendChild(host);
  }

  return host;
}
