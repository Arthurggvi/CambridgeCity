export function applySidebarLayout(mode = "game") {
  const dock = document.getElementById("statusDock");
  const collapsed = dock
    ? dock.classList.contains("is-collapsed")
    : document.body.classList.contains("sidebar-collapsed");
  const app = document.getElementById("app");
  const choices = document.getElementById("choices");

  if (mode === "menu") {
    if (app) app.style.removeProperty("margin-right");
    if (choices) choices.style.removeProperty("margin-right");
  } else {
    const mr = collapsed ? "36px" : "360px";
    if (app) app.style.marginRight = mr;
    if (choices) choices.style.marginRight = mr;
  }

  const toggle = document.getElementById("sidebar-toggle");
  if (toggle) {
    toggle.textContent = collapsed ? "◀" : "▶";
    toggle.title = collapsed ? "展开状态栏" : "折叠状态栏";
  }
}

export function resetLayoutInlineStylesForMenu() {
  const app = document.getElementById("app");
  const choices = document.getElementById("choices");
  const propsToClear = ["margin-right", "width", "transform", "left", "right"];

  for (const el of [app, choices]) {
    if (!el) continue;
    for (const prop of propsToClear) {
      el.style.removeProperty(prop);
    }
  }

  document.body.classList.remove("has-sidebar", "sidebar-expanded", "sidebar-collapsed");
}

// Resolves the stable content width for a scene text runtime layer mounted
// inside `appHost`. Called before mount so the layer geometry is correct from
// the first frame, even when the sidebar margin-right CSS transition is
// still in-flight at call time.
//
// Returns { stableWidth: number } when a reliable value can be derived from
// the target inline margin-right already written by applySidebarLayout(), or
// { stableWidth: null } when the preconditions are not met (caller falls back
// to live getBoundingClientRect()).
//
// No magic numbers: horizontal padding is read from getComputedStyle(appHost).
export function resolveSceneTextMountGeometry(appHost) {
  if (!appHost) return { stableWidth: null };
  const mrRaw = appHost.style.marginRight;
  if (!mrRaw) return { stableWidth: null };
  const mrPx = parseFloat(mrRaw);
  if (!Number.isFinite(mrPx) || mrPx < 0) return { stableWidth: null };
  const cs = window.getComputedStyle(appHost);
  const pl = parseFloat(cs.paddingLeft) || 0;
  const pr = parseFloat(cs.paddingRight) || 0;
  const stableWidth = Math.round(document.documentElement.clientWidth - mrPx - pl - pr);
  return stableWidth > 0 ? { stableWidth } : { stableWidth: null };
}

export function cubicBezierScalar(p0, p1, p2, p3, u) {
  const t = Math.max(0, Math.min(1, Number(u) || 0));
  const nt = 1 - t;
  return nt * nt * nt * p0
    + 3 * nt * nt * t * p1
    + 3 * nt * t * t * p2
    + t * t * t * p3;
}
