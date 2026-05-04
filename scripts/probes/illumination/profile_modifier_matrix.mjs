import { createDefaultPlayerState, applyTimeToPlayer, getPlayerDerived } from "./src/engine/player.js";
import {
  PROFILE_DISPLAY_LEVEL_BANDS,
  PROFILE_WORLDVIEW_AXIS_MAX,
  PROFILE_WORLDVIEW_AXIS_MIN,
  getProfileDisplayLevelByXp
} from "./src/engine/profile/defs.js";
import { PLAYER_DEFS } from "./src/engine/player_defs.js";

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function round(v, p = 6) {
  const n = toNum(v, 0);
  return Number(n.toFixed(p));
}

function magnitude(v) {
  return Math.abs(toNum(v, 0));
}

function ratio(a, b) {
  if (b === 0) return null;
  return a / b;
}

function ratioMatch(actual, expected, tolerance = 0.02) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  const denom = Math.max(Math.abs(expected), 1e-9);
  return Math.abs(actual - expected) / denom <= tolerance;
}

function bandByLabel(label) {
  return PROFILE_DISPLAY_LEVEL_BANDS.find((b) => String(b.label) === String(label)) || null;
}

function midInBand(band) {
  if (!band) return null;
  if (!Number.isFinite(band.maxXp)) {
    return band.minXp + 200;
  }
  const maxInclusive = Math.max(band.minXp, band.maxXp - 1);
  return Math.floor((band.minXp + maxInclusive) / 2);
}

function buildXpSampling() {
  const levelLabelMap = {
    0: "0",
    1: "1",
    3: "3",
    5: "EX"
  };
  const sampling = {};
  for (const [k, label] of Object.entries(levelLabelMap)) {
    const band = bandByLabel(label);
    const totalXp = midInBand(band);
    sampling[k] = {
      profileInput: { level: 0, xp: totalXp },
      totalXp,
      displayLevel: getProfileDisplayLevelByXp(totalXp)
    };
  }
  return sampling;
}

function buildDisplayIoTable(xpSampling) {
  const table = {};
  for (const [k, row] of Object.entries(xpSampling)) {
    table[k] = {
      inputTotalXp: row.totalXp,
      outputDisplayLevel: getProfileDisplayLevelByXp(row.totalXp)
    };
  }
  return table;
}

function normalizeDisplayLevelLabel(label) {
  if (String(label || "").toUpperCase() === "EX") return 5;
  const n = Number(label);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.trunc(n)));
}

function intersectAxisRange(minXp, maxXpExclusive) {
  const low = Math.max(PROFILE_WORLDVIEW_AXIS_MIN, Math.max(0, minXp));
  const highExclusive = Math.min(PROFILE_WORLDVIEW_AXIS_MAX + 1, maxXpExclusive);
  if (low >= highExclusive) return null;
  return { low, highInclusive: highExclusive - 1 };
}

function midInt(low, highInclusive) {
  return Math.floor((low + highInclusive) / 2);
}

function buildWorldviewSampling() {
  const out = {
    "0": 0,
    "1": null,
    "3": null,
    "5": null
  };

  const levelLabelMap = {
    1: "1",
    3: "3",
    5: "EX"
  };

  for (const [k, label] of Object.entries(levelLabelMap)) {
    const band = bandByLabel(label);
    if (!band) continue;
    const maxXpExclusive = Number.isFinite(band.maxXp) ? band.maxXp : Number.POSITIVE_INFINITY;
    const range = intersectAxisRange(band.minXp, maxXpExclusive);
    if (!range) {
      out[k] = {
        positive: null,
        negative: null,
        reachable: false,
        axisClamp: [PROFILE_WORLDVIEW_AXIS_MIN, PROFILE_WORLDVIEW_AXIS_MAX],
        band: { min: band.minXp, maxExclusive: band.maxXp }
      };
      continue;
    }
    const pos = midInt(range.low, range.highInclusive);
    out[k] = {
      positive: pos,
      negative: -pos,
      reachable: true,
      axisClamp: [PROFILE_WORLDVIEW_AXIS_MIN, PROFILE_WORLDVIEW_AXIS_MAX],
      band: { min: band.minXp, maxExclusive: band.maxXp }
    };
  }

  return out;
}

function makePlayer({ physiqueXp = 0, experienceXp = 0, worldviewAxis = 0 } = {}) {
  const p = createDefaultPlayerState();
  p.profile.physique.level = 0;
  p.profile.physique.xp = physiqueXp;
  p.profile.experience.level = 0;
  p.profile.experience.xp = experienceXp;
  p.profile.worldview.axis = worldviewAxis;

  // Keep baseline stable and avoid regen branches
  p.physio.satiety = 60;
  p.physio.stamina = 60;
  p.psycho.fatigue = 60;
  p.psycho.hp = 100;
  p.physio.temperatureC = 37;
  p.gear.thermal.warmthRating = 0.8;
  p.gear.thermal.wetness = 0;
  p.gear.thermal.windproof = 0;
  p.gear.thermal.waterproof = 0;
  p.exposure.dead = false;

  return p;
}

function baseContext() {
  return {
    isSleeping: false,
    sessionCoverage: "NONE",
    world: { sun: 0, snowfallRate: 0, windSpeed: 10, exposureEnabled: false },
    regionCfg: { T_base: -10, SunAmp: 0, SnowWarmAmp: 0, Pmax: 1 },
    placeProfile: { space: "outdoor", exposureLevel: "Open", windShelter: 0, heatSource: 0, drying: 0 },
    thermalActivity: "idle"
  };
}

function hpDropContext() {
  return {
    ...baseContext(),
    world: { sun: 0, snowfallRate: 0, windSpeed: 30, exposureEnabled: true },
    regionCfg: { T_base: -40, SunAmp: 0, SnowWarmAmp: 0, Pmax: 1 },
    placeProfile: { space: "outdoor", exposureLevel: "Open", windShelter: 0, heatSource: 0, drying: 0 },
    thermalEnvOverride: {
      tEnvRegionC: -55,
      tEnvEffC: -55,
      windLocal: 28,
      worldWindSpeed: 30
    }
  };
}

function runCase(input, minutes, contextFactory = baseContext) {
  const player = makePlayer(input);
  const context = contextFactory();
  const before = deepClone(player);
  const beforeDerived = getPlayerDerived(player, context);
  const result = applyTimeToPlayer(player, minutes, context);
  const after = deepClone(player);
  const afterDerived = result?.derived || getPlayerDerived(player, context);

  return {
    input: deepClone(input),
    minutes,
    context: {
      isSleeping: !!context.isSleeping,
      sessionCoverage: String(context.sessionCoverage || "NONE"),
      world: deepClone(context.world),
      regionCfg: deepClone(context.regionCfg),
      placeProfile: deepClone(context.placeProfile),
      thermalEnvOverride: deepClone(context.thermalEnvOverride || null)
    },
    before: {
      physio: deepClone(before.physio),
      psycho: deepClone(before.psycho),
      profile: deepClone(before.profile),
      derived: {
        profile: deepClone(beforeDerived.profile),
        mods: deepClone(beforeDerived.mods)
      }
    },
    after: {
      physio: deepClone(after.physio),
      psycho: deepClone(after.psycho),
      profile: deepClone(after.profile),
      derived: {
        profile: deepClone(afterDerived.profile),
        mods: deepClone(afterDerived.mods)
      }
    },
    delta: {
      satiety: round(after.physio.satiety - before.physio.satiety, 6),
      stamina: round(after.physio.stamina - before.physio.stamina, 6),
      hp: round(after.psycho.hp - before.psycho.hp, 6),
      temperatureC: round(after.physio.temperatureC - before.physio.temperatureC, 6)
    },
    events: Array.isArray(result?.events) ? deepClone(result.events) : []
  };
}

function makeConfigUnreachable(item, reason, raw = null) {
  return {
    item,
    status: "CONFIG_UNREACHABLE",
    reason,
    raw
  };
}

function buildLevelResolutionProof(input, minutes, contextFactory = baseContext) {
  const c = runCase(input, minutes, contextFactory);
  return {
    input,
    resolvedProfile: c.before.derived.profile
  };
}

function hpDropModerateContext() {
  return {
    ...baseContext(),
    world: { sun: 0, snowfallRate: 0, windSpeed: 22, exposureEnabled: true },
    regionCfg: { T_base: -32, SunAmp: 0, SnowWarmAmp: 0, Pmax: 1 },
    placeProfile: { space: "outdoor", exposureLevel: "Open", windShelter: 0, heatSource: 0, drying: 0 },
    thermalEnvOverride: {
      tEnvRegionC: -42,
      tEnvEffC: -42,
      windLocal: 20,
      worldWindSpeed: 22
    }
  };
}

function findNonFloorHpPair(inputA, inputB, expectedRatio, contextFactory) {
  const minuteCandidates = [60, 90, 120, 150, 180, 210, 240, 300, 360];
  let best = null;
  for (const m of minuteCandidates) {
    const caseA = runCase(inputA, m, contextFactory);
    const caseB = runCase(inputB, m, contextFactory);
    const da = caseA.delta.hp;
    const db = caseB.delta.hp;
    const aa = caseA.after.psycho.hp;
    const ab = caseB.after.psycho.hp;
    if (!(da < 0 && db < 0)) continue;
    if (!(aa > 0 && ab > 0)) continue;
    const actual = ratio(Math.abs(da), Math.abs(db));
    const err = Number.isFinite(actual) ? Math.abs(actual - expectedRatio) : Number.POSITIVE_INFINITY;
    const score = err + (m * 0.0001);
    if (!best || score < best.score) {
      best = { minutes: m, caseA, caseB, actualRatio: actual, score };
    }
  }
  return best;
}

function buildRatioResult({ item, baselineName, variantName, baselineCase, variantCase, metric, expectedRatio, formula, tolerance = 0.02 }) {
  const baselineMag = magnitude(baselineCase?.delta?.[metric]);
  const variantMag = magnitude(variantCase?.delta?.[metric]);
  const actualRatio = ratio(baselineMag, variantMag);
  const hasTrigger = baselineMag > 0 && variantMag > 0;
  const ok = hasTrigger && Number.isFinite(actualRatio) && ratioMatch(actualRatio, expectedRatio, tolerance);

  return {
    item,
    status: ok ? "CONNECTED_AND_ACTIVE" : (hasTrigger ? "RATIO_MISMATCH" : "NO_TRIGGER_IN_CURRENT_CHAIN"),
    baseline: baselineName,
    variant: variantName,
    expectedRatio: round(expectedRatio, 7),
    actualRatio: Number.isFinite(actualRatio) ? round(actualRatio, 7) : null,
    expectedFormula: formula,
    raw: {
      metric,
      baselineDelta: baselineCase?.delta?.[metric] ?? null,
      variantDelta: variantCase?.delta?.[metric] ?? null,
      baselineMagnitude: round(baselineMag, 6),
      variantMagnitude: round(variantMag, 6),
      baselineCase,
      variantCase
    }
  };
}

function makeNoTrigger(item, reason, raw = null) {
  return {
    item,
    status: "NO_TRIGGER_IN_CURRENT_CHAIN",
    reason,
    raw
  };
}

const sampling = {
  physique: buildXpSampling(),
  experience: buildXpSampling(),
  worldviewAxis: buildWorldviewSampling()
};

const displayIo = {
  physique: buildDisplayIoTable(sampling.physique),
  experience: buildDisplayIoTable(sampling.experience)
};

const physiqueInputs = {
  0: { physiqueXp: sampling.physique[0].totalXp, experienceXp: sampling.experience[0].totalXp, worldviewAxis: 0 },
  2: { physiqueXp: midInBand(bandByLabel("2")), experienceXp: sampling.experience[0].totalXp, worldviewAxis: 0 },
  3: { physiqueXp: sampling.physique[3].totalXp, experienceXp: sampling.experience[0].totalXp, worldviewAxis: 0 },
  5: { physiqueXp: sampling.physique[5].totalXp, experienceXp: sampling.experience[0].totalXp, worldviewAxis: 0 }
};

const worldviewInputs = {
  axis0: { physiqueXp: sampling.physique[0].totalXp, experienceXp: sampling.experience[0].totalXp, worldviewAxis: 0 },
  pos1: sampling.worldviewAxis[1]?.reachable
    ? { physiqueXp: sampling.physique[0].totalXp, experienceXp: sampling.experience[0].totalXp, worldviewAxis: sampling.worldviewAxis[1].positive }
    : null,
  pos5: sampling.worldviewAxis[5]?.reachable
    ? { physiqueXp: sampling.physique[0].totalXp, experienceXp: sampling.experience[0].totalXp, worldviewAxis: sampling.worldviewAxis[5].positive }
    : { physiqueXp: sampling.physique[0].totalXp, experienceXp: sampling.experience[0].totalXp, worldviewAxis: PROFILE_WORLDVIEW_AXIS_MAX },
  neg5: sampling.worldviewAxis[5]?.reachable
    ? { physiqueXp: sampling.physique[0].totalXp, experienceXp: sampling.experience[0].totalXp, worldviewAxis: sampling.worldviewAxis[5].negative }
    : { physiqueXp: sampling.physique[0].totalXp, experienceXp: sampling.experience[0].totalXp, worldviewAxis: PROFILE_WORLDVIEW_AXIS_MIN }
};

const cases = {
  satiety: {
    m60: {
      p0: runCase(physiqueInputs[0], 60, baseContext),
      p3: runCase(physiqueInputs[3], 60, baseContext),
      p5: runCase(physiqueInputs[5], 60, baseContext)
    },
    m240: {
      p0: runCase(physiqueInputs[0], 240, baseContext),
      p3: runCase(physiqueInputs[3], 240, baseContext),
      p5: runCase(physiqueInputs[5], 240, baseContext)
    }
  },
  stamina: {
    m60: {
      p0: runCase(physiqueInputs[0], 60, baseContext),
      p2: runCase(physiqueInputs[2], 60, baseContext),
      p5: runCase(physiqueInputs[5], 60, baseContext)
    },
    m240: {
      p0: runCase(physiqueInputs[0], 240, baseContext),
      p2: runCase(physiqueInputs[2], 240, baseContext),
      p5: runCase(physiqueInputs[5], 240, baseContext)
    },
    m480: {
      p0: runCase(physiqueInputs[0], 480, baseContext),
      p2: runCase(physiqueInputs[2], 480, baseContext),
      p5: runCase(physiqueInputs[5], 480, baseContext)
    }
  },
  hpPhysique: {
    m240: {
      p0: runCase(physiqueInputs[0], 240, hpDropContext),
      p5: runCase(physiqueInputs[5], 240, hpDropContext)
    },
    m480: {
      p0: runCase(physiqueInputs[0], 480, hpDropContext),
      p5: runCase(physiqueInputs[5], 480, hpDropContext)
    }
  },
  thermoWorldview: {
    m240: {
      axis0: runCase(worldviewInputs.axis0, 240, baseContext),
      pos1: worldviewInputs.pos1 ? runCase(worldviewInputs.pos1, 240, baseContext) : null,
      pos5: runCase(worldviewInputs.pos5, 240, baseContext),
      neg5: runCase(worldviewInputs.neg5, 240, baseContext)
    }
  },
  hpWorldview: {
    m480: {
      axis0: runCase(worldviewInputs.axis0, 480, hpDropContext),
      pos5: runCase(worldviewInputs.pos5, 480, hpDropContext),
      neg5: runCase(worldviewInputs.neg5, 480, hpDropContext)
    }
  }
};

const results = [];

const levelResolutionProof = {
  physique: {
    "0": buildLevelResolutionProof(physiqueInputs[0], 60).resolvedProfile.physiqueLevel,
    "1": buildLevelResolutionProof({ ...physiqueInputs[0], physiqueXp: sampling.physique[1].totalXp }, 60).resolvedProfile.physiqueLevel,
    "3": buildLevelResolutionProof(physiqueInputs[3], 60).resolvedProfile.physiqueLevel,
    "5": buildLevelResolutionProof(physiqueInputs[5], 60).resolvedProfile.physiqueLevel
  },
  experience: {
    "0": buildLevelResolutionProof(physiqueInputs[0], 60).resolvedProfile.experienceLevel,
    "1": buildLevelResolutionProof({ ...physiqueInputs[0], experienceXp: sampling.experience[1].totalXp }, 60).resolvedProfile.experienceLevel,
    "3": buildLevelResolutionProof({ ...physiqueInputs[0], experienceXp: sampling.experience[3].totalXp }, 60).resolvedProfile.experienceLevel,
    "5": buildLevelResolutionProof({ ...physiqueInputs[0], experienceXp: sampling.experience[5].totalXp }, 60).resolvedProfile.experienceLevel
  }
};

results.push(buildRatioResult({
  item: "physique.satiety.60m.ratio_0_vs_5",
  baselineName: "physique_l0",
  variantName: "physique_l5",
  baselineCase: cases.satiety.m60.p0,
  variantCase: cases.satiety.m60.p5,
  metric: "satiety",
  expectedRatio: 1.0 / 0.88,
  formula: "1.00 / 0.88"
}));

results.push(buildRatioResult({
  item: "physique.satiety.60m.ratio_3_vs_5",
  baselineName: "physique_l3",
  variantName: "physique_l5",
  baselineCase: cases.satiety.m60.p3,
  variantCase: cases.satiety.m60.p5,
  metric: "satiety",
  expectedRatio: 0.97 / 0.88,
  formula: "0.97 / 0.88"
}));

results.push(buildRatioResult({
  item: "physique.satiety.240m.ratio_0_vs_5",
  baselineName: "physique_l0",
  variantName: "physique_l5",
  baselineCase: cases.satiety.m240.p0,
  variantCase: cases.satiety.m240.p5,
  metric: "satiety",
  expectedRatio: 1.0 / 0.88,
  formula: "1.00 / 0.88"
}));

results.push(buildRatioResult({
  item: "physique.satiety.240m.ratio_3_vs_5",
  baselineName: "physique_l3",
  variantName: "physique_l5",
  baselineCase: cases.satiety.m240.p3,
  variantCase: cases.satiety.m240.p5,
  metric: "satiety",
  expectedRatio: 0.97 / 0.88,
  formula: "0.97 / 0.88"
}));

const staminaMagnitudes = [
  magnitude(cases.stamina.m60.p0.delta.stamina),
  magnitude(cases.stamina.m60.p2.delta.stamina),
  magnitude(cases.stamina.m60.p5.delta.stamina),
  magnitude(cases.stamina.m240.p0.delta.stamina),
  magnitude(cases.stamina.m240.p2.delta.stamina),
  magnitude(cases.stamina.m240.p5.delta.stamina),
  magnitude(cases.stamina.m480.p0.delta.stamina),
  magnitude(cases.stamina.m480.p2.delta.stamina),
  magnitude(cases.stamina.m480.p5.delta.stamina)
];
const staminaAnyTrigger = staminaMagnitudes.some((v) => v > 0);

if (!staminaAnyTrigger) {
  results.push(makeNoTrigger(
    "physique.stamina",
    "stamina delta is zero for all cases: 60/240/480 min with physique l0/l2/l5",
    cases.stamina
  ));
} else {
  results.push(buildRatioResult({
    item: "physique.stamina.ratio_0_vs_5",
    baselineName: "physique_l0",
    variantName: "physique_l5",
    baselineCase: cases.stamina.m480.p0,
    variantCase: cases.stamina.m480.p5,
    metric: "stamina",
    expectedRatio: 1.05 / 0.70,
    formula: "1.05 / 0.70"
  }));
  results.push(buildRatioResult({
    item: "physique.stamina.ratio_2_vs_5",
    baselineName: "physique_l2",
    variantName: "physique_l5",
    baselineCase: cases.stamina.m480.p2,
    variantCase: cases.stamina.m480.p5,
    metric: "stamina",
    expectedRatio: 0.92 / 0.70,
    formula: "0.92 / 0.70"
  }));
}

const hpPhysiqueWindow = findNonFloorHpPair(
  physiqueInputs[0],
  physiqueInputs[5],
  1.0 / 0.90,
  hpDropModerateContext
);

if (!hpPhysiqueWindow) {
  results.push(makeNoTrigger(
    "physique.hpDrain",
    "no non-floor negative hp pair found under scanned minutes",
    {
      scannedMinutes: [60, 90, 120, 150, 180, 210, 240, 300, 360],
      contextPreset: "hpDropModerateContext"
    }
  ));
} else {
  results.push(buildRatioResult({
    item: `physique.hpDrain.${hpPhysiqueWindow.minutes}m.ratio_0_vs_5`,
    baselineName: "physique_l0",
    variantName: "physique_l5",
    baselineCase: hpPhysiqueWindow.caseA,
    variantCase: hpPhysiqueWindow.caseB,
    metric: "hp",
    expectedRatio: 1.0 / 0.90,
    formula: "1.00 / 0.90",
    tolerance: 0.01
  }));
}

const worldviewPos5DerivedLevel = cases.thermoWorldview.m240.pos5?.before?.derived?.profile?.worldviewLevel;
const worldviewNeg5DerivedLevel = cases.thermoWorldview.m240.neg5?.before?.derived?.profile?.worldviewLevel;
const worldviewLevel5Reachable = sampling.worldviewAxis[5]?.reachable === true;

results.push(buildRatioResult({
  item: "worldview.thermo.240m.ratio_0_vs_pos1",
  baselineName: "axis_0",
  variantName: "axis_pos_l1",
  baselineCase: cases.thermoWorldview.m240.axis0,
  variantCase: cases.thermoWorldview.m240.pos1,
  metric: "temperatureC",
  expectedRatio: 1.0 / 0.98,
  formula: "1.00 / 0.98",
  tolerance: 0.005
}));

if (!worldviewLevel5Reachable) {
  results.push(makeConfigUnreachable(
    "worldview.thermo.240m.ratio_0_vs_pos5",
    "worldview level 5 cannot be reached under axis clamp [-100,100] with current level bands",
    {
      attemptedInputAxis: worldviewInputs.pos5.worldviewAxis,
      derivedWorldviewLevel: worldviewPos5DerivedLevel,
      case: cases.thermoWorldview.m240.pos5
    }
  ));
  results.push(makeConfigUnreachable(
    "worldview.thermo.240m.ratio_pos5_vs_neg5",
    "worldview level 5 cannot be reached under axis clamp [-100,100] with current level bands",
    {
      attemptedInputAxisPositive: worldviewInputs.pos5.worldviewAxis,
      attemptedInputAxisNegative: worldviewInputs.neg5.worldviewAxis,
      derivedWorldviewLevelPositive: worldviewPos5DerivedLevel,
      derivedWorldviewLevelNegative: worldviewNeg5DerivedLevel,
      posCase: cases.thermoWorldview.m240.pos5,
      negCase: cases.thermoWorldview.m240.neg5
    }
  ));
} else {
  results.push(buildRatioResult({
    item: "worldview.thermo.240m.ratio_0_vs_pos5",
    baselineName: "axis_0",
    variantName: "axis_pos_l5",
    baselineCase: cases.thermoWorldview.m240.axis0,
    variantCase: cases.thermoWorldview.m240.pos5,
    metric: "temperatureC",
    expectedRatio: 1.0 / 0.88,
    formula: "1.00 / 0.88"
  }));
  results.push(buildRatioResult({
    item: "worldview.thermo.240m.ratio_pos5_vs_neg5",
    baselineName: "axis_pos_l5",
    variantName: "axis_neg_l5",
    baselineCase: cases.thermoWorldview.m240.pos5,
    variantCase: cases.thermoWorldview.m240.neg5,
    metric: "temperatureC",
    expectedRatio: 1,
    formula: "1.0"
  }));
}

if (!worldviewLevel5Reachable) {
  results.push(makeConfigUnreachable(
    "worldview.hpDrain.480m.ratio_0_vs_pos5",
    "worldview level 5 cannot be reached under axis clamp [-100,100] with current level bands",
    {
      attemptedInputAxis: worldviewInputs.pos5.worldviewAxis,
      derivedWorldviewLevel: cases.hpWorldview.m480.pos5?.before?.derived?.profile?.worldviewLevel,
      case: cases.hpWorldview.m480.pos5
    }
  ));
  results.push(makeConfigUnreachable(
    "worldview.hpDrain.480m.ratio_pos5_vs_neg5",
    "worldview level 5 cannot be reached under axis clamp [-100,100] with current level bands",
    {
      attemptedInputAxisPositive: worldviewInputs.pos5.worldviewAxis,
      attemptedInputAxisNegative: worldviewInputs.neg5.worldviewAxis,
      derivedWorldviewLevelPositive: cases.hpWorldview.m480.pos5?.before?.derived?.profile?.worldviewLevel,
      derivedWorldviewLevelNegative: cases.hpWorldview.m480.neg5?.before?.derived?.profile?.worldviewLevel,
      posCase: cases.hpWorldview.m480.pos5,
      negCase: cases.hpWorldview.m480.neg5
    }
  ));
} else {
  results.push(buildRatioResult({
    item: "worldview.hpDrain.480m.ratio_0_vs_pos5",
    baselineName: "axis_0",
    variantName: "axis_pos_l5",
    baselineCase: cases.hpWorldview.m480.axis0,
    variantCase: cases.hpWorldview.m480.pos5,
    metric: "hp",
    expectedRatio: 1.0 / 0.88,
    formula: "1.00 / 0.88"
  }));
  results.push(buildRatioResult({
    item: "worldview.hpDrain.480m.ratio_pos5_vs_neg5",
    baselineName: "axis_pos_l5",
    variantName: "axis_neg_l5",
    baselineCase: cases.hpWorldview.m480.pos5,
    variantCase: cases.hpWorldview.m480.neg5,
    metric: "hp",
    expectedRatio: 1,
    formula: "1.0"
  }));
}

const output = {
  sampling: {
    physique: {
      "0": {
        storedLevelField: sampling.physique[0].profileInput.level,
        xp: sampling.physique[0].profileInput.xp,
        displayLevel: sampling.physique[0].displayLevel,
        normalizedLevel: normalizeDisplayLevelLabel(sampling.physique[0].displayLevel)
      },
      "1": {
        storedLevelField: sampling.physique[1].profileInput.level,
        xp: sampling.physique[1].profileInput.xp,
        displayLevel: sampling.physique[1].displayLevel,
        normalizedLevel: normalizeDisplayLevelLabel(sampling.physique[1].displayLevel)
      },
      "3": {
        storedLevelField: sampling.physique[3].profileInput.level,
        xp: sampling.physique[3].profileInput.xp,
        displayLevel: sampling.physique[3].displayLevel,
        normalizedLevel: normalizeDisplayLevelLabel(sampling.physique[3].displayLevel)
      },
      "5": {
        storedLevelField: sampling.physique[5].profileInput.level,
        xp: sampling.physique[5].profileInput.xp,
        displayLevel: sampling.physique[5].displayLevel,
        normalizedLevel: normalizeDisplayLevelLabel(sampling.physique[5].displayLevel)
      }
    },
    experience: {
      "0": {
        storedLevelField: sampling.experience[0].profileInput.level,
        xp: sampling.experience[0].profileInput.xp,
        displayLevel: sampling.experience[0].displayLevel,
        normalizedLevel: normalizeDisplayLevelLabel(sampling.experience[0].displayLevel)
      },
      "1": {
        storedLevelField: sampling.experience[1].profileInput.level,
        xp: sampling.experience[1].profileInput.xp,
        displayLevel: sampling.experience[1].displayLevel,
        normalizedLevel: normalizeDisplayLevelLabel(sampling.experience[1].displayLevel)
      },
      "3": {
        storedLevelField: sampling.experience[3].profileInput.level,
        xp: sampling.experience[3].profileInput.xp,
        displayLevel: sampling.experience[3].displayLevel,
        normalizedLevel: normalizeDisplayLevelLabel(sampling.experience[3].displayLevel)
      },
      "5": {
        storedLevelField: sampling.experience[5].profileInput.level,
        xp: sampling.experience[5].profileInput.xp,
        displayLevel: sampling.experience[5].displayLevel,
        normalizedLevel: normalizeDisplayLevelLabel(sampling.experience[5].displayLevel)
      }
    },
    worldviewAxis: {
      "0": 0,
      "1": sampling.worldviewAxis[1],
      "3": sampling.worldviewAxis[3],
      "5": sampling.worldviewAxis[5]
    }
  },
  sourceDetection: {
    physiqueAndExperienceLevelSource: "getProfileDisplayLevelByXp(getProfileTotalXp(key, profile[key].level, profile[key].xp))",
    worldviewLevelSource: "worldview.axis -> clamp[-100,100] -> rationalityDisplay/faithDisplay -> getProfileDisplayLevelByXp(abs(sideDisplay))",
    exNormalization: "normalizeProfileDisplayLevel('EX') => 5",
    worldviewClamp: [PROFILE_WORLDVIEW_AXIS_MIN, PROFILE_WORLDVIEW_AXIS_MAX],
    worldviewBands: PROFILE_DISPLAY_LEVEL_BANDS,
    displayLevelIo: displayIo,
    matrixLevelResolutionProof: levelResolutionProof,
    hpPhysiqueWindowSelection: hpPhysiqueWindow
      ? {
          minutes: hpPhysiqueWindow.minutes,
          baselineAfterHp: hpPhysiqueWindow.caseA.after.psycho.hp,
          variantAfterHp: hpPhysiqueWindow.caseB.after.psycho.hp,
          baselineDeltaHp: hpPhysiqueWindow.caseA.delta.hp,
          variantDeltaHp: hpPhysiqueWindow.caseB.delta.hp
        }
      : null
  },
  activeModifierRows: {
    stamina: PLAYER_DEFS.profileModifiers.staminaLevelModifiers,
    experience: PLAYER_DEFS.profileModifiers.experienceLevelModifiers,
    worldview: PLAYER_DEFS.profileModifiers.rationalFaithSharedModifiers
  },
  matrix: cases,
  results
};

console.log(JSON.stringify(output, null, 2));
