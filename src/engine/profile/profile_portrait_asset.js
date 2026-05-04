const DOSSIER_PORTRAIT_PLACEHOLDER = Object.freeze({
  viewBox: "0 0 160 160",
  palette: Object.freeze({
    shell: "#D7D9DE",
    head: "#C4C8CF",
    neck: "#B2B7BF",
    coat: "#787D86"
  }),
  geometry: Object.freeze({
    shell: Object.freeze({ x: 18, y: 18, width: 124, height: 124, radius: 16 }),
    head: Object.freeze({ cx: 80, cy: 60, r: 22 }),
    neck: Object.freeze({ x: 71, y: 82, width: 18, height: 7, radius: 3 }),
    coat: Object.freeze({ d: "M44 142L50 112L62 95H98L110 112L116 142H44Z" }),
    liner: Object.freeze({ x: 69, y: 94, width: 22, height: 7, radius: 4 })
  })
});

export function getDossierPortraitPlaceholder() {
  return DOSSIER_PORTRAIT_PLACEHOLDER;
}

export function buildInstitutionalPortraitSvg(portrait = DOSSIER_PORTRAIT_PLACEHOLDER) {
  const palette = portrait?.palette && typeof portrait.palette === "object"
    ? portrait.palette
    : DOSSIER_PORTRAIT_PLACEHOLDER.palette;
  const geometry = portrait?.geometry && typeof portrait.geometry === "object"
    ? portrait.geometry
    : DOSSIER_PORTRAIT_PLACEHOLDER.geometry;
  const viewBox = String(portrait?.viewBox || DOSSIER_PORTRAIT_PLACEHOLDER.viewBox).trim() || DOSSIER_PORTRAIT_PLACEHOLDER.viewBox;

  return `
    <svg class="dossier-portrait-svg" viewBox="${viewBox}" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
      <rect x="${geometry.shell.x}" y="${geometry.shell.y}" width="${geometry.shell.width}" height="${geometry.shell.height}" rx="${geometry.shell.radius}" fill="${palette.shell}"/>
      <path d="${geometry.coat.d}" fill="${palette.coat}"/>
      <rect x="${geometry.liner.x}" y="${geometry.liner.y}" width="${geometry.liner.width}" height="${geometry.liner.height}" rx="${geometry.liner.radius}" fill="${palette.neck}"/>
      <rect x="${geometry.neck.x}" y="${geometry.neck.y}" width="${geometry.neck.width}" height="${geometry.neck.height}" rx="${geometry.neck.radius}" fill="${palette.neck}"/>
      <circle cx="${geometry.head.cx}" cy="${geometry.head.cy}" r="${geometry.head.r}" fill="${palette.head}"/>
    </svg>
  `;
}