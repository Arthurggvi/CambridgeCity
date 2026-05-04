const REGION_LIGHT_PROFILES = Object.freeze({
  CambCity: Object.freeze({
    polarIndex: 0.55,
    daylightBiasMinutes: 0,
    seasonBias01: 0,
    elevationBiasDeg: 6,
    ambientBias01: 0.1,
    visibilityBias01: 0.04,
    twilightBiasMinutes: 0
  }),
  West2: Object.freeze({
    polarIndex: 0.72,
    daylightBiasMinutes: 40,
    seasonBias01: 0.03,
    elevationBiasDeg: 2,
    ambientBias01: 0.02,
    visibilityBias01: 0,
    twilightBiasMinutes: 20
  }),
  OldCamb: Object.freeze({
    polarIndex: 0.84,
    daylightBiasMinutes: -20,
    seasonBias01: 0.055,
    elevationBiasDeg: -4,
    ambientBias01: -0.05,
    visibilityBias01: -0.04,
    twilightBiasMinutes: 35
  }),
  South1: Object.freeze({
    polarIndex: 0.96,
    daylightBiasMinutes: -50,
    seasonBias01: 0.08,
    elevationBiasDeg: -7,
    ambientBias01: -0.06,
    visibilityBias01: -0.03,
    twilightBiasMinutes: 45
  })
});

export function getRegionLightProfile(regionId) {
  const id = String(regionId || "").trim();
  return REGION_LIGHT_PROFILES[id] || REGION_LIGHT_PROFILES.CambCity;
}

export { REGION_LIGHT_PROFILES };
