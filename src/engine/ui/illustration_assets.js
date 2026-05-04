const ILLUSTRATION_ASSETS = Object.freeze({
  clinic_rooftop_far_view: {
    src: "./picture/cambrian_city_skyline_alpha_no_smoke.png",
    alt: "远方"
  }
});

export function getIllustrationAssetByKey(key) {
  const id = String(key || "").trim();
  if (!id) return null;
  const item = ILLUSTRATION_ASSETS[id];
  if (!item || typeof item !== "object") return null;
  const src = String(item.src || "").trim();
  if (!src) return null;
  return {
    src,
    alt: String(item.alt || id)
  };
}
