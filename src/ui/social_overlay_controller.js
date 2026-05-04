import { gameState } from "../engine/state.js";
import { buildSocialViewModel } from "../engine/social/social_view_model.js";
import { renderSocialOverlayPage } from "../engine/render/social_overlay_page.js";

let _controllerOptions = {};
let _selectedNpcId = null;
let _socialEscBound = false;
let _socialClosePromise = null;

function getControllerOption(name, fallback = null) {
  const value = _controllerOptions && _controllerOptions[name];
  return typeof value === "undefined" ? fallback : value;
}

function normalizeNpcId(value) {
  const key = String(value || "").trim();
  return key || null;
}

function waitForSocialOverlayCloseSignal(overlay) {
  return new Promise((resolve) => {
    if (!overlay) {
      resolve({ source: "none" });
      return;
    }
    const dialog = overlay.querySelector(".social-archive-shell");
    const backdrop = overlay.querySelector(".social-archive-backdrop");
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
      if (backdrop) {
        backdrop.removeEventListener("transitionend", onEnd);
        backdrop.removeEventListener("animationend", onEnd);
      }
      clearTimeout(timer);
      resolve({ source });
    };
    const onEnd = (event) => {
      const target = event?.target;
      if (target !== overlay && target !== dialog && target !== backdrop) return;
      finish("event");
    };
    overlay.addEventListener("transitionend", onEnd);
    overlay.addEventListener("animationend", onEnd);
    if (dialog) {
      dialog.addEventListener("transitionend", onEnd);
      dialog.addEventListener("animationend", onEnd);
    }
    if (backdrop) {
      backdrop.addEventListener("transitionend", onEnd);
      backdrop.addEventListener("animationend", onEnd);
    }
    const timer = setTimeout(() => finish("timeout"), 280);
  });
}

function showSocialOverlay(host, overlay) {
  if (!host || !overlay) return;
  host.dataset.socialClosing = "false";
  host.setAttribute("aria-hidden", "false");
  host.hidden = false;
  overlay.classList.remove("is-closing");
  if (overlay.classList.contains("is-visible")) return;
  // Force layout once so the overlay enters from its defined initial state
  // without waiting extra frames or popping in from an incorrect layer.
  void overlay.offsetWidth;
  overlay.classList.add("is-visible");
}

export function isSocialOverlayClosing(host) {
  return !!host && host.dataset.socialClosing === "true";
}

export async function closeSocialOverlay(host, options = {}) {
  if (!host) {
    if (typeof options.dispatchClose === "function") {
      await options.dispatchClose();
    }
    return;
  }
  if (_socialClosePromise) {
    await _socialClosePromise;
    return;
  }
  _socialClosePromise = (async () => {
    const overlay = host.querySelector(".social-archive-overlay.social-panel-overlay");
    host.dataset.socialClosing = "true";
    if (overlay) {
      overlay.classList.add("is-closing");
      overlay.classList.remove("is-visible");
      await waitForSocialOverlayCloseSignal(overlay);
    }
    if (typeof options.dispatchClose === "function") {
      await options.dispatchClose();
    }
    host.innerHTML = "";
    host.setAttribute("aria-hidden", "true");
    host.hidden = true;
    host.dataset.socialClosing = "false";
  })();
  try {
    await _socialClosePromise;
  } finally {
    _socialClosePromise = null;
  }
}

function buildSocialOverlayRenderModel() {
  const viewModel = buildSocialViewModel(gameState, _selectedNpcId);
  _selectedNpcId = normalizeNpcId(viewModel?.dossierVm?.selectedEntryId || null);
  return viewModel;
}

export function renderActiveSocialOverlay(host = document.getElementById("social-overlay-host"), map = gameState.currentMap || null) {
  if (!host || gameState.ui?.socialOpen !== true) return;
  const viewModel = buildSocialOverlayRenderModel(map);
  renderSocialOverlayPage(viewModel, host);
  const overlay = host.querySelector(".social-archive-overlay.social-panel-overlay");
  showSocialOverlay(host, overlay);
}

export function ensureSocialOverlayHost(options = {}) {
  _controllerOptions = {
    ..._controllerOptions,
    ...options
  };

  let host = document.getElementById("social-overlay-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "social-overlay-host";
    host.setAttribute("aria-hidden", "true");
    host.hidden = true;
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = "11970";
    host.style.overflow = "hidden";
    host.addEventListener("click", async (event) => {
      const favoriteTarget = event.target instanceof Element
        ? event.target.closest("[data-social-toggle-favorite]")
        : null;
      if (favoriteTarget && host.contains(favoriteTarget)) {
        event.preventDefault();
        event.stopPropagation();
        const npcId = normalizeNpcId(favoriteTarget.getAttribute("data-social-toggle-favorite"));
        if (npcId) {
          const { dispatch } = await import("../engine/pipeline/dispatch.js");
          await dispatch("ui_social_toggle_favorite", { npcId });
        }
        return;
      }

      const selectTarget = event.target instanceof Element
        ? event.target.closest("[data-social-select-npc]")
        : null;
      if (selectTarget && host.contains(selectTarget)) {
        _selectedNpcId = normalizeNpcId(selectTarget.getAttribute("data-social-select-npc"));
        renderActiveSocialOverlay(host);
        return;
      }

      const closeTarget = event.target instanceof Element
        ? event.target.closest('[data-social-action="close"], [data-social-action="backdrop-close"]')
        : null;
      if (closeTarget && host.contains(closeTarget)) {
        await closeSocialOverlay(host, {
          dispatchClose: getControllerOption("dispatchClose")
        });
      }
    });
    document.body.appendChild(host);
  }

  if (!_socialEscBound) {
    document.addEventListener("keydown", async (event) => {
      if (event.key !== "Escape") return;
      const isOpen = typeof getControllerOption("isOpen") === "function" ? getControllerOption("isOpen")() : false;
      if (!isOpen) return;
      const isQuickKeysEnabled = typeof getControllerOption("isQuickKeysEnabled") === "function"
        ? getControllerOption("isQuickKeysEnabled")()
        : true;
      if (!isQuickKeysEnabled) return;
      await closeSocialOverlay(host, {
        dispatchClose: getControllerOption("dispatchClose")
      });
    });
    _socialEscBound = true;
  }

  if (host.parentElement !== document.body) {
    document.body.appendChild(host);
  }
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "11970";
  host.style.overflow = "hidden";
  return host;
}