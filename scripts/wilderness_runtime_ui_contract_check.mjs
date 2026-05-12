import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(process.cwd());
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function includesAll(hay, needles, ctx) {
  for (const n of needles) {
    assert(hay.includes(n), `${ctx} missing: ${JSON.stringify(n)}`);
  }
}

const rendererSrc = read("src/engine/renderer.js");
const wildernessVmSrc = read("src/engine/wilderness/wilderness_view_model.js");
const runtimeFragSrc = read("src/engine/render/wilderness_runtime_fragments.js");
const css = read("style.css");

// Static: movement accordion + compact 3x3 pad (inline panel, capture toggle; no absolute popover).
includesAll(
  rendererSrc,
  [
    "wilderness-move-accordion",
    "wilderness-move-toggle",
    "wilderness-move-panel",
    "data-wilderness-move-toggle",
    "ensureWildernessRuntimeMoveChoicesCapture",
    "stopImmediatePropagation"
  ],
  "renderer wilderness move UI"
);
assert(!rendererSrc.includes("wilderness-move-popover"), "renderer must not use absolute popover class");
assert(!rendererSrc.includes("wilderness-move-foldout"), "renderer must not use legacy move foldout");
assert(!rendererSrc.includes("toggle-wilderness-move-foldout"), "renderer must not wire legacy foldout uiAction");

includesAll(
  css,
  [
    ".wilderness-move-accordion",
    ".wilderness-move-toggle",
    ".wilderness-move-panel",
    ".wilderness-move-pad",
    ".wilderness-console-output-wrap",
    ".wilderness-console-output",
    ".wilderness-console-output__desc",
    "grid-template-columns: repeat(3, 36px)",
    "grid-template-rows: repeat(3, 36px)"
  ],
  "move CSS"
);
assert(!css.includes(".wilderness-move-popover"), "move CSS must not define absolute popover");
assert(!css.includes("lightgray") && !css.includes("#bbb") && !css.includes("#ccc"), "move CSS should not use light gray panel colors");
{
  const idx = css.indexOf("#choices .wilderness-move-panel");
  assert(idx >= 0, "move CSS must include #choices .wilderness-move-panel block");
  const slice = css.slice(idx, idx + 900);
  assert(!slice.includes("overflow: auto"), "move panel must not use overflow:auto");
  assert(!slice.includes("overflow-y: scroll"), "move panel must not use overflow-y:scroll");
}
includesAll(css, ["#choices.choices--wilderness-runtime", "scrollbar-color"], "wilderness runtime dark scrollbar");

includesAll(
  css,
  [".wilderness-local-minimap-sample-frame", ".wilderness-local-minimap-boundary", ".wilderness-local-minimap-world"],
  "wilderness local minimap CSS"
);
includesAll(
  rendererSrc,
  [
    "wilderness-local-minimap-sample-frame",
    "wilderness-local-minimap-boundary",
    "wilderness-local-minimap-world",
    "wildernessHeadingToAngleDeg",
    "scheduleWildernessLocalMinimapArrowMotion",
    "WILDERNESS_MINIMAP_ARROW_LEAD_MS",
    "scheduleWildernessLocalMinimapWorldSlideDelayed",
    "resolveWildernessMoveHoverDescription"
  ],
  "wilderness local minimap renderer"
);

// Static: 3x3 slot rows (8 directions + center placeholder).
includesAll(rendererSrc, ['["NW", "N", "NE"]', '"W", null, "E"', '"SW", "S", "SE"]'], "renderer dir slots");

// Static: move actions carry kind/direction metadata in wilderness VM.
includesAll(wildernessVmSrc, ['kind: "WILDERNESS_MOVE"', "direction: dir", 'uiGroup: "wilderness_movement"', "footprintDirection"], "wilderness_view_model move metadata");

// Entry is list-only: fragment must not render standalone entry card/anchor.
assert(!runtimeFragSrc.includes("wilderness-entry-card"), "runtime fragment must not render legacy entry card");
assert(!runtimeFragSrc.includes("wilderness-entry-anchor"), "runtime fragment must not render entry anchor strip");
assert(!runtimeFragSrc.includes("location.href") && !runtimeFragSrc.includes("currentMapId ="), "runtime fragment must not navigate directly");

includesAll(
  runtimeFragSrc,
  [
    "wilderness-tool-readouts-close",
    "wilderness_tools_close",
    "setWildernessReadoutGameSurfaceInert(false)",
    "Do not stopPropagation on the panel"
  ],
  "wilderness tool readouts overlay close wiring"
);

const interactionSrc = read("src/ui/interaction.js");
includesAll(
  interactionSrc,
  ["wilderness-tool-readouts-close", "setWildernessReadoutGameSurfaceInert(false)"],
  "interaction wilderness tool readouts close"
);

console.log("OK: wilderness_runtime_ui_contract_check passed.");
