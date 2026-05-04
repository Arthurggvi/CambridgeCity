const SIDEBAR_TOOL_ICON_VIEWBOX = "0 0 24 24";

const SIDEBAR_TOOL_ICON_REGISTRY = Object.freeze({
  inventory: [
    '<path d="M4.75 9.2H19.25V19.25H4.75V9.2Z" stroke-width="1.45" stroke-linejoin="round"/>',
    '<path d="M7.75 9.2V7.65C7.75 6.4 8.77 5.35 10.02 5.35H13.98C15.23 5.35 16.25 6.4 16.25 7.65V9.2" stroke-width="1.45" stroke-linecap="round"/>',
    '<path d="M8.9 12.2H15.1" stroke-width="1.08" stroke-linecap="round"/>',
    '<path d="M9.95 14.75H14.05" stroke-width="1.08" stroke-linecap="round"/>'
  ].join(""),
  record: [
    '<path d="M6.15 4.95H15.7L18.55 7.8V18.95H6.15V4.95Z" stroke-width="1.45" stroke-linejoin="round"/>',
    '<path d="M15.7 4.95V7.8H18.55" stroke-width="1.45" stroke-linejoin="round"/>',
    '<path d="M8.45 10.25H15.85" stroke-width="1.08" stroke-linecap="round"/>',
    '<path d="M8.45 13.05H15.85" stroke-width="1.08" stroke-linecap="round"/>',
    '<path d="M8.45 15.85H13.75" stroke-width="1.08" stroke-linecap="round"/>'
  ].join(""),
  dossier: [
    '<circle cx="10.55" cy="10.55" r="5.85" stroke-width="1.45"/>',
    '<circle cx="10.55" cy="10.55" r="4.25" stroke-width="1.08"/>',
    '<path d="M13.6 7.55L14.8 8.75" stroke-width="1" stroke-linecap="round"/>',
    '<path d="M12.15 8.95L12.95 9.75" stroke-width="0.92" stroke-linecap="round"/>',
    '<path d="M14.75 14.75L18.95 18.95" stroke-width="1.45" stroke-linecap="round"/>'
  ].join(""),
  social: [
    '<circle cx="8.9" cy="9.15" r="2.3" stroke-width="1.45"/>',
    '<circle cx="15.65" cy="10.2" r="2.05" stroke-width="1.45"/>',
    '<path d="M5.8 17.15C6.55 14.9 8.45 13.55 10.85 13.55C12.75 13.55 14.25 14.35 15.15 15.95" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>',
    '<path d="M13.65 16.65C14.2 15.2 15.35 14.35 16.85 14.35C18.05 14.35 19.05 14.85 19.75 15.9" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>'
  ].join(""),
  memo: [
    '<g transform="rotate(-45 12 12)">',
    '<path d="M3.7 12L6.9 9.95H8.9L17.2 9.8H19.9V14.2H17.2L8.9 14.05H6.9L3.7 12Z" stroke-width="1.62" stroke-linejoin="round"/>',
    '<path d="M6.9 9.95V14.05" stroke-width="1.08" stroke-linecap="round"/>',
    '<path d="M12.45 10.4V13.6" stroke-width="0.94" stroke-linecap="round"/>',
    '<path d="M16.9 9.85V14.15" stroke-width="1.02" stroke-linecap="round"/>',
    '<path d="M18.35 9.85V14.15" stroke-width="1.02" stroke-linecap="round"/>',
    '</g>'
  ].join(""),
  vault: [
    '<path d="M5.15 8.05H18.85V10.95H5.15V8.05Z" stroke-width="1.45" stroke-linejoin="round"/>',
    '<path d="M4.55 10.95H19.45V19.1H4.55V10.95Z" stroke-width="1.45" stroke-linejoin="round"/>',
    '<path d="M9.1 14.25H14.9" stroke-width="1.08" stroke-linecap="round"/>',
    '<path d="M10.35 16.7H13.65" stroke-width="1.08" stroke-linecap="round"/>'
  ].join("")
});

export function renderSidebarToolIconSvg(iconId, className = "") {
  const markup = SIDEBAR_TOOL_ICON_REGISTRY[String(iconId || "").trim()] || SIDEBAR_TOOL_ICON_REGISTRY.inventory;
  const normalizedClassName = String(className || "").trim();
  const classAttr = normalizedClassName ? ` class="${normalizedClassName}"` : "";
  return `<svg${classAttr} xmlns="http://www.w3.org/2000/svg" viewBox="${SIDEBAR_TOOL_ICON_VIEWBOX}" fill="none" stroke="currentColor" aria-hidden="true" focusable="false">${markup}</svg>`;
}
