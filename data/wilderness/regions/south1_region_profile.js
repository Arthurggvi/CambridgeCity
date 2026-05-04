export const SOUTH1_REGION_PROFILE = Object.freeze({
  id: "South1",
  label: "南部一区",
  summary: "冰穹观测带，低温、强风、低氧。",
  climate: Object.freeze({
    T_base: -60,
    A_region: 10,
    Pmax: 1.0,
    MoistureIndex: 0.3,
    SunAmp: 1.5,
    SnowWarmAmp: 4.5,
    WindBase: 14,
    WindVar: 7,
    WindDir_prevailing: "SE"
  })
});
