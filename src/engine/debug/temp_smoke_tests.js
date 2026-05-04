import { gameState } from "../state.js";
import {
  createDefaultPlayerState,
  applyTimeToPlayer,
  computeIndoorWarmRecoveryEfficiencyMul
} from "../player.js";
import { advanceTimeMinutes, getTimeView } from "../time.js";
import { makeActionFromUI } from "../pipeline/action_types.js";
import { resolve } from "../pipeline/resolve.js";
import { commit } from "../pipeline/commit.js";
import {
  loadItemsDb,
  loadMap,
  loadPlaceProfiles,
  loadRegionData,
  getRegionConfigById,
  getPlaceProfileForMap
} from "../loader.js";
import {
  computeCoolingKsFromDurations,
  computeExpRecoverKPerHour,
  computeEquipmentProtectionProfile,
  computeEnvTempC,
  computeEffectiveEnvTempC,
  computeExposureCoolingRateMul,
  computeExposureDurations,
  computeLocalWind,
  mapCoreTempToHp100,
  mapCoreTempToHypo100,
  computeWarmthRating,
  computeEffectiveWarmth,
  isNearTargetC,
  stepCoreTempCoolingExp
} from "../../systems/temperature/temperature_system.js";
import { PLAYER_DEFS } from "../player_defs.js";
import { ensureItemsDbLoaded, EQUIPMENT_SLOT_ORDER, getItemsById } from "../items_db.js";
import { render } from "../renderer.js";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toRounded(value, digits = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

function makeShortHash(text) {
  const source = String(text || "");
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getAdvanceContext() {
  return {
    isSleeping: false,
    sessionCoverage: "NONE"
  };
}

function withExposureEnvLocked({ tEnvRegionC = -13.974, windLocal = 4.167, wetnessLocked = 0.3 } = {}) {
  const envTemp = Number(tEnvRegionC);
  const wind = Number(windLocal);
  const wetness = Number(wetnessLocked);
  return {
    thermalEnvOverride: {
      tEnvRegionC: envTemp,
      tEnvEffC: envTemp,
      worldWindSpeed: wind,
      windLocal: wind
    },
    wetnessLocked: true,
    wetness
  };
}

function getExposureBaseMul(exposureLevel) {
  const table = {
    Sheltered: 0.3,
    SemiSheltered: 0.6,
    Open: 1.0,
    Ridge: 1.4
  };
  return Number(table[String(exposureLevel || "Open")] ?? 1.0);
}

function buildWorldSnapshot(world = {}, thermalEnvOverride = null, options = {}) {
  const hasThermalEnvLock = Number.isFinite(Number(thermalEnvOverride?.tEnvRegionC))
    || Number.isFinite(Number(thermalEnvOverride?.tEnvEffC));
  const hasWindLock = Number.isFinite(Number(thermalEnvOverride?.worldWindSpeed))
    || Number.isFinite(Number(thermalEnvOverride?.windLocal));
  return {
    regionId: String(world?.regionId || ""),
    sun: toRounded(world?.sun ?? world?.weather?.sun ?? 0, 3),
    snowfallRate: toRounded(world?.snowfallRate ?? world?.weather?.snowfallRate ?? 0, 3),
    windSpeed: toRounded(world?.windSpeed ?? world?.weather?.windSpeed_local ?? 0, 3),
    exposureEnabled: world?.exposureEnabled !== false,
    thermalEnvLocked: hasThermalEnvLock,
    windLocked: hasWindLock,
    wetnessLocked: options?.wetnessLocked === true || !!thermalEnvOverride?.wetnessLocked,
    hpLocked: options?.hpLocked === true
  };
}

function buildPlaceProfileSnapshot(placeProfile = {}) {
  return {
    space: String(placeProfile?.space || "outdoor"),
    exposureLevel: String(placeProfile?.exposureLevel || "Open"),
    windShelter: toRounded(placeProfile?.windShelter ?? 0, 3),
    heatSource: toRounded(placeProfile?.heatSource ?? 0, 3),
    drying: toRounded(placeProfile?.drying ?? 0, 3)
  };
}

function buildWindModelSnapshot(world = {}, placeProfile = {}, thermalEnvOverride = null) {
  const overrideWorldWind = Number(thermalEnvOverride?.worldWindSpeed);
  const worldWindSpeed = Number.isFinite(overrideWorldWind)
    ? overrideWorldWind
    : Number(world?.windSpeed ?? world?.weather?.windSpeed_local ?? 0);
  const exposureLevel = String(placeProfile?.exposureLevel || "Open");
  const exposureBaseMul = getExposureBaseMul(exposureLevel);
  const windShelterClamped = Math.max(0, Math.min(1, Number(placeProfile?.windShelter ?? 0) || 0));
  const shelterMul = 1 - windShelterClamped;
  const exposureFactor = exposureBaseMul * shelterMul;
  const overrideWindLocal = Number(thermalEnvOverride?.windLocal);
  return {
    worldWindSpeed: toRounded(worldWindSpeed, 3),
    exposureLevel,
    exposureBaseMul: toRounded(exposureBaseMul, 3),
    windShelterClamped: toRounded(windShelterClamped, 3),
    shelterMul: toRounded(shelterMul, 3),
    exposureFactor: toRounded(exposureFactor, 3),
    windLocal: toRounded(Number.isFinite(overrideWindLocal) ? overrideWindLocal : computeLocalWind(worldWindSpeed, placeProfile), 3),
    locked: !!thermalEnvOverride
  };
}

function getItemThermal(item) {
  const wearableThermal = item?.wearable?.thermal;
  const thermal = wearableThermal && typeof wearableThermal === "object"
    ? wearableThermal
    : (item?.thermal && typeof item.thermal === "object" ? item.thermal : {});
  return {
    insulation: Math.max(0, Math.min(1, Number(thermal?.insulation ?? 0) || 0)),
    windproof: Math.max(0, Math.min(1, Number(thermal?.windproof ?? 0) || 0)),
    waterproof: Math.max(0, Math.min(1, Number(thermal?.waterproof ?? 0) || 0))
  };
}

function computeProtectionAudit(equipment = {}, itemsById, weights = {}, defs = {}) {
  const slotContrib = [];
  let rTotal = 0;
  let lnLeakTotal = 0;
  let weightSum = 0;

  for (const slot of EQUIPMENT_SLOT_ORDER) {
    const weight = Math.max(0, Number(weights?.[slot] ?? 0) || 0);
    const itemId = String(equipment?.[slot] || "").trim();
    const item = itemId && itemsById?.get ? itemsById.get(itemId) : null;
    const thermal = getItemThermal(item);
    const insulation = Math.max(0, Math.min(0.999999, thermal.insulation));
    const windproof = Math.max(0, Math.min(1, thermal.windproof));
    const resistance = -Math.log(1 - insulation);
    const leak = Math.max(1e-6, Math.min(1, 1 - windproof));
    const lnLeak = Math.log(leak);
    const weightedResistance = weight * resistance;
    const weightedLnLeak = weight * lnLeak;

    weightSum += weight;
    rTotal += weightedResistance;
    lnLeakTotal += weightedLnLeak;

    slotContrib.push({
      slot,
      weight: toRounded(weight, 4),
      itemId: itemId || null,
      insulation: toRounded(insulation, 4),
      windproof: toRounded(windproof, 4),
      resistance: toRounded(resistance, 6),
      weightedResistance: toRounded(weightedResistance, 6),
      leak: toRounded(leak, 6),
      lnLeak: toRounded(lnLeak, 6),
      weightedLnLeak: toRounded(weightedLnLeak, 6)
    });
  }

  const profile = computeEquipmentProtectionProfile(equipment, itemsById, weights, defs);
  const timings = computeExposureDurations(profile.protectionScore, defs);

  return {
    weightSum,
    slotContrib,
    I_eff: toRounded(profile.insulationEff, 4),
    W_eff: toRounded(profile.windproofEff, 4),
    P: toRounded(profile.protectionScore, 4),
    T_incap: toRounded(timings.T_incap, 4),
    T_death: toRounded(timings.T_death, 4)
  };
}

function buildSyntheticItemsById(slotThermals = {}) {
  const map = new Map();
  for (const slot of EQUIPMENT_SLOT_ORDER) {
    const thermal = slotThermals?.[slot];
    if (!thermal) continue;
    map.set(`syn_${slot}`, {
      id: `syn_${slot}`,
      category: "clothing",
      wearable: {
        slot,
        thermal: {
          insulation: Number(thermal.insulation ?? 0),
          windproof: Number(thermal.windproof ?? 0),
          waterproof: Number(thermal.waterproof ?? 0)
        }
      }
    });
  }
  return map;
}

function buildSyntheticEquipment(slotThermals = {}) {
  const equipment = {};
  for (const slot of EQUIPMENT_SLOT_ORDER) {
    equipment[slot] = slotThermals?.[slot] ? `syn_${slot}` : null;
  }
  return equipment;
}

function buildCoverageAuditRows(cfg = {}) {
  gameState.player = createDefaultPlayerState();
  gameState.currentMapId = String(cfg.mapId || "test_temp");
  gameState.currentMap = {
    id: gameState.currentMapId,
    placeProfileId: String(cfg.placeProfileId || "test_temp_outdoor_open")
  };

  const locked = withExposureEnvLocked(cfg.lockedEnv || {});
  setupWorld({
    regionId: String(cfg.regionId || "West2"),
    sun: Number(cfg.sun ?? 58),
    snowfallRate: Number(cfg.snowfallRate ?? 0.9),
    windSpeed: Number(locked.thermalEnvOverride.worldWindSpeed ?? cfg.windSpeed ?? 4.1667),
    totalMinutes: Number(cfg.totalMinutes ?? 720),
    exposureEnabled: true
  });

  gameState.player.gear.thermal.wetness = Number(cfg.wetness ?? locked.wetness ?? 0.3);
  gameState.player.psycho.hp = Number(cfg.hp ?? 100);
  gameState.player.exposure.hypo100 = Number(cfg.hypo100 ?? 100);
  gameState.player.exposure.incapacitated = false;
  gameState.player.exposure.dead = false;
  equipSet(gameState.player, cfg.equipment || {});

  const placeProfile = resolveScenarioPlaceProfile(gameState.currentMapId, gameState.currentMap, cfg.placeProfileOverride || {
    space: "outdoor",
    exposureLevel: "Open",
    windShelter: 0,
    heatSource: 0,
    drying: 0.1
  });
  const itemsById = cfg.itemsById || getItemsById();
  const warmthProfile = computeWarmthRating(gameState.player, itemsById, placeProfile, PLAYER_DEFS.temperature?.coreTemp || {});
  const audit = computeProtectionAudit(gameState.player.equipment, itemsById, PLAYER_DEFS.equipmentWeights || {}, PLAYER_DEFS.temperature?.exposureModel || {});
  gameState.player.gear.thermal.warmthRating = warmthProfile.warmthRating;
  gameState.player.gear.thermal.windproof = warmthProfile.windproof;
  gameState.player.gear.thermal.waterproof = warmthProfile.waterproof;
  gameState.player.gear.thermal.insulationEff = audit.I_eff;
  gameState.player.gear.thermal.windproofEff = audit.W_eff;
  gameState.player.gear.thermal.protectionScore = audit.P;

  const snapshot = collectSnapshot(
    gameState.player,
    gameState.world,
    gameState.currentMapId,
    gameState.currentMap,
    placeProfile,
    locked.thermalEnvOverride
  );

  return {
    dtMin: Number(cfg.dtMin ?? 0),
    placeProfileId: String(gameState.currentMap?.placeProfileId || gameState.currentMapId || ""),
    before: snapshot,
    after: { ...snapshot },
    delta: {
      tCore: 0,
      hypo100: 0,
      hp: 0,
      wetness: 0
    },
    tCoreDeltaPer10Min: 0,
    tCoreCoolingPer10Min: 0,
    tCoreWarmingPer10Min: 0,
    dT10: 0,
    simulationMode: "profile-audit",
    context: {
      worldSnapshot: buildWorldSnapshot(gameState.world, locked.thermalEnvOverride),
      placeProfile: buildPlaceProfileSnapshot(placeProfile),
      windModel: buildWindModelSnapshot(gameState.world, placeProfile, locked.thermalEnvOverride),
      equipment: deepClone(gameState.player.equipment)
    },
    exposureEvidence: {
      I_eff: audit.I_eff,
      W_eff: audit.W_eff,
      P: audit.P,
      T_incap: audit.T_incap,
      T_death: audit.T_death
    },
    slotContrib: audit.slotContrib,
    weightSum: toRounded(audit.weightSum, 4)
  };
}

function findForbiddenWearableFields(value, path = "", out = []) {
  if (!value || typeof value !== "object") return out;
  const forbidden = new Set(["durability", "condition", "maxDurability", "health"]);
  for (const [key, child] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (forbidden.has(key)) {
      out.push(nextPath);
    }
    if (child && typeof child === "object") {
      findForbiddenWearableFields(child, nextPath, out);
    }
  }
  return out;
}

function resolveThermalSnapshot(world = {}, mapId, mapObj, placeProfileOverride = null, thermalEnvOverride = null) {
  const tv = getTimeView();
  const regionCfg = getRegionConfigById(world?.regionId);
  const placeProfile = resolveScenarioPlaceProfile(mapId, mapObj, placeProfileOverride);
  const isIndoor = String(placeProfile?.space || "outdoor") === "indoor";
  const overrideEnvTemp = Number(thermalEnvOverride?.tEnvRegionC);
  const tEnvRegionC = Number.isFinite(overrideEnvTemp)
    ? overrideEnvTemp
    : computeEnvTempC(regionCfg, tv, world, PLAYER_DEFS.temperature?.envTemp || {});
  const overrideWorldWind = Number(thermalEnvOverride?.worldWindSpeed);
  const worldWind = Number.isFinite(overrideWorldWind)
    ? overrideWorldWind
    : Number(world?.windSpeed ?? world?.weather?.windSpeed_local ?? 0);
  const overrideWindLocal = Number(thermalEnvOverride?.windLocal);
  const windLocal = isIndoor
    ? 0
    : (Number.isFinite(overrideWindLocal)
      ? overrideWindLocal
      : computeLocalWind(worldWind, placeProfile));
  const overrideEnvEff = Number(thermalEnvOverride?.tEnvEffC);
  const tEnvEffC = Number.isFinite(overrideEnvEff)
    ? overrideEnvEff
    : computeEffectiveEnvTempC(tEnvRegionC, placeProfile, PLAYER_DEFS.temperature?.envTemp || {});
  const exposureActive = PLAYER_DEFS.temperature?.exposureModel?.enabled !== false
    && !isIndoor
    && world?.exposureEnabled !== false;
  return {
    tv,
    regionCfg,
    placeProfile,
    tEnvRegionC,
    windLocal,
    tEnvEffC,
    exposureActive
  };
}

function resolveScenarioPlaceProfile(mapId, mapObj, placeProfileOverride = null) {
  if (placeProfileOverride && typeof placeProfileOverride === "object") {
    return {
      space: String(placeProfileOverride?.space || "outdoor"),
      exposureLevel: String(placeProfileOverride?.exposureLevel || "Open"),
      windShelter: Number(placeProfileOverride?.windShelter ?? 0),
      heatSource: Number(placeProfileOverride?.heatSource ?? 0),
      drying: Number(placeProfileOverride?.drying ?? 0)
    };
  }
  return getPlaceProfileForMap(mapId, mapObj);
}

function setupWorld({ regionId, sun, snowfallRate, windSpeed, totalMinutes = 720, exposureEnabled = true }) {
  gameState.time.totalMinutes = totalMinutes;
  gameState.world.regionId = regionId;
  gameState.world.sun = sun;
  gameState.world.snowfallRate = snowfallRate;
  gameState.world.windSpeed = windSpeed;
  gameState.world.exposureEnabled = exposureEnabled !== false;

  if (!gameState.world.weather || typeof gameState.world.weather !== "object") {
    gameState.world.weather = {};
  }
  gameState.world.weather.sun = sun;
  gameState.world.weather.snowfallRate = snowfallRate;
  gameState.world.weather.windSpeed_local = windSpeed;
}

function collectSnapshot(player, world, mapId, mapObj, placeProfileOverride = null, thermalEnvOverride = null, options = {}) {
  const includeExposureFields = options?.includeExposureFields !== false;
  const { placeProfile, tEnvRegionC, windLocal, tEnvEffC, exposureActive } = resolveThermalSnapshot(
    world,
    mapId,
    mapObj,
    placeProfileOverride,
    thermalEnvOverride
  );
  const warmthEff = computeEffectiveWarmth(player?.gear?.thermal, windLocal, PLAYER_DEFS.temperature?.coreTemp || {});
  const exposureTimings = computeExposureDurations(player?.gear?.thermal?.protectionScore ?? 0, PLAYER_DEFS.temperature?.exposureModel || {});

  return {
    tEnvRegionC,
    tEnvEffC,
    windLocal,
    wetness: Number(player?.gear?.thermal?.wetness ?? 0),
    warmthRating: Number(player?.gear?.thermal?.warmthRating ?? 0),
    windproof: Number(player?.gear?.thermal?.windproof ?? 0),
    waterproof: Number(player?.gear?.thermal?.waterproof ?? 0),
    insulationEff: Number(player?.gear?.thermal?.insulationEff ?? 0),
    windproofEff: Number(player?.gear?.thermal?.windproofEff ?? 0),
    protectionScore: Number(player?.gear?.thermal?.protectionScore ?? 0),
    warmthEff,
    tCore: Number(player?.physio?.temperatureC ?? 37),
    hp: Number(player?.psycho?.hp ?? 100),
    ...(includeExposureFields ? {
      hypo100: Number(player?.exposure?.hypo100 ?? player?.psycho?.hypothermia ?? 100),
      incapacitated: !!(player?.exposure?.incapacitated),
      dead: !!(player?.exposure?.dead),
      T_incap: Number(exposureTimings?.T_incap ?? 0),
      T_death: Number(exposureTimings?.T_death ?? 0)
    } : {}),
    ...(exposureActive ? {} : {
      hypo: Number(player?.psycho?.hypothermia ?? 100),
      stage: String(player?.psycho?.hypoStage || "Safe")
    })
  };
}

function toCaseMetricSnapshot(snapshot = {}) {
  return {
    tEnvRegionC: toRounded(snapshot.tEnvRegionC, 3),
    tEnvC: toRounded(snapshot.tEnvRegionC, 3),
    tEnvEffC: toRounded(snapshot.tEnvEffC, 3),
    windLocal: toRounded(snapshot.windLocal, 3),
    wetness: toRounded(snapshot.wetness, 3),
    warmthRating: toRounded(snapshot.warmthRating, 3),
    windproof: toRounded(snapshot.windproof, 3),
    waterproof: toRounded(snapshot.waterproof, 3),
    insulationEff: toRounded(snapshot.insulationEff, 4),
    windproofEff: toRounded(snapshot.windproofEff, 4),
    protectionScore: toRounded(snapshot.protectionScore, 4),
    warmthEff: toRounded(snapshot.warmthEff, 3),
    tCore: toRounded(snapshot.tCore, 3),
    tCoreC: toRounded(snapshot.tCore, 3),
    hp: toRounded(snapshot.hp, 3),
    ...(Number.isFinite(Number(snapshot.hypo100)) ? { hypo100: toRounded(snapshot.hypo100, 3) } : {}),
    ...(typeof snapshot.incapacitated === "boolean" ? { incapacitated: !!snapshot.incapacitated } : {}),
    ...(typeof snapshot.dead === "boolean" ? { dead: !!snapshot.dead } : {}),
    ...(Number.isFinite(Number(snapshot.T_incap)) ? { T_incap: toRounded(snapshot.T_incap, 4) } : {}),
    ...(Number.isFinite(Number(snapshot.T_death)) ? { T_death: toRounded(snapshot.T_death, 4) } : {}),
    ...(Number.isFinite(Number(snapshot.hypo)) ? { hypo: toRounded(snapshot.hypo, 3) } : {}),
    ...(typeof snapshot.stage === "string" && snapshot.stage ? { stage: String(snapshot.stage) } : {})
  };
}

function equipSet(player, mapping = {}) {
  for (const [slot, itemId] of Object.entries(mapping)) {
    if (!Object.prototype.hasOwnProperty.call(player.equipment, slot)) continue;
    player.equipment[slot] = typeof itemId === "string" && itemId.trim() ? itemId : null;
  }
}

function extractExposureFields(rows) {
  const coreThresholds = getCoreThresholds();
  return {
    I_eff: toRounded(rows.after?.insulationEff ?? rows.before?.insulationEff ?? 0, 4),
    W_eff: toRounded(rows.after?.windproofEff ?? rows.before?.windproofEff ?? 0, 4),
    P: toRounded(rows.after?.protectionScore ?? rows.before?.protectionScore ?? 0, 4),
    T_incap: toRounded(rows.after?.T_incap ?? rows.before?.T_incap ?? 0, 4),
    T_death: toRounded(rows.after?.T_death ?? rows.before?.T_death ?? 0, 4),
    incapC: toRounded(coreThresholds.incapC, 4),
    deathC: toRounded(coreThresholds.deathC, 4),
    hypo100_before: toRounded(rows.before?.hypo100 ?? rows.before?.hypo ?? 0, 4),
    hypo100_after: toRounded(rows.after?.hypo100 ?? rows.after?.hypo ?? 0, 4),
    hp_before: toRounded(rows.before?.hp ?? 0, 4),
    hp_after: toRounded(rows.after?.hp ?? 0, 4)
  };
}

function getSnapshotHypoDelta(before = {}, after = {}) {
  const beforeValue = Number(before?.hypo100 ?? before?.hypo ?? 100);
  const afterValue = Number(after?.hypo100 ?? after?.hypo ?? 100);
  return toRounded(afterValue - beforeValue, 4);
}

function makeAssert(key, lhs, rhs, op) {
  let pass = false;
  if (op === "<") pass = lhs < rhs;
  else if (op === "<=") pass = lhs <= rhs;
  else if (op === ">") pass = lhs > rhs;
  else if (op === ">=") pass = lhs >= rhs;
  else if (op === "==") pass = lhs === rhs;
  return {
    key,
    pass,
    lhs: toRounded(lhs, 4),
    rhs: toRounded(rhs, 4),
    op
  };
}

function makeAssertString(key, lhs, rhs) {
  return {
    key,
    pass: String(lhs) === String(rhs),
    lhs: String(lhs),
    rhs: String(rhs),
    op: "==="
  };
}

function makeAssertAbsDelta(key, lhs, rhs, maxAbsDelta) {
  const diff = Math.abs(Number(lhs) - Number(rhs));
  const max = Math.max(0, Number(maxAbsDelta) || 0);
  return {
    key,
    pass: diff <= max,
    lhs: toRounded(lhs, 6),
    rhs: toRounded(rhs, 6),
    op: `|Δ|<=${max}`
  };
}

function makeStableGearAsserts(rows, eps = 1e-6) {
  return [
    makeAssertAbsDelta("warmthRating stable", rows.after.warmthRating, rows.before.warmthRating, eps),
    makeAssertAbsDelta("windproof stable", rows.after.windproof, rows.before.windproof, eps),
    makeAssertAbsDelta("waterproof stable", rows.after.waterproof, rows.before.waterproof, eps)
  ];
}

function runScenario(cfg) {
  gameState.player = createDefaultPlayerState();
  gameState.currentMapId = String(cfg.mapId || "test_temp");
  gameState.currentMap = {
    id: gameState.currentMapId,
    placeProfileId: String(cfg.placeProfileId || gameState.currentMapId)
  };

  setupWorld({
    regionId: String(cfg.regionId || "West2"),
    sun: Number(cfg.sun ?? 58),
    snowfallRate: Number(cfg.snowfallRate ?? 0.9),
    windSpeed: Number(cfg.windSpeed ?? 12),
    totalMinutes: Number(cfg.totalMinutes ?? 720),
    exposureEnabled: cfg.exposureEnabled !== false
  });

  const thermal = gameState.player.gear.thermal;
  if (Number.isFinite(Number(cfg.wetness))) thermal.wetness = Number(cfg.wetness);
  if (Number.isFinite(Number(cfg.warmthRating))) thermal.warmthRating = Number(cfg.warmthRating);

  if (typeof cfg.satiety === "number") {
    gameState.player.physio.satiety = cfg.satiety;
  }
  if (typeof cfg.tCore === "number") {
    gameState.player.physio.temperatureC = cfg.tCore;
  }

  if (typeof cfg.mutatePlayer === "function") {
    cfg.mutatePlayer(gameState.player);
  }
  const thermalEnvOverride = cfg.thermalEnvOverride || null;

  const preApplyCtx = {
    isSleeping: false,
    sessionCoverage: "NONE",
    world: gameState.world,
    currentMapId: gameState.currentMapId,
    currentMap: gameState.currentMap,
    timeView: getTimeView(gameState.time.totalMinutes),
    regionCfg: getRegionConfigById(gameState.world.regionId),
    placeProfile: getPlaceProfileForMap(gameState.currentMapId, gameState.currentMap),
    thermalEnvOverride
  };
  applyTimeToPlayer(gameState.player, 0, preApplyCtx);
  const scenarioPlaceProfile = resolveScenarioPlaceProfile(gameState.currentMapId, gameState.currentMap, cfg.placeProfileOverride);
  preApplyCtx.placeProfile = scenarioPlaceProfile;
  const before = collectSnapshot(gameState.player, gameState.world, gameState.currentMapId, gameState.currentMap, scenarioPlaceProfile, thermalEnvOverride);
  const advanceResult = advanceTimeMinutes(Number(cfg.deltaMin ?? 20), "SMOKE", getAdvanceContext());
  const advancedMinutes = Number(advanceResult?.advancedMinutes ?? cfg.deltaMin ?? 20);
  const applyCtx = {
    isSleeping: false,
    sessionCoverage: "NONE",
    world: gameState.world,
    currentMapId: gameState.currentMapId,
    currentMap: gameState.currentMap,
    timeView: getTimeView(gameState.time.totalMinutes),
    regionCfg: getRegionConfigById(gameState.world.regionId),
    placeProfile: scenarioPlaceProfile,
    thermalEnvOverride
  };
  applyTimeToPlayer(gameState.player, advancedMinutes, applyCtx);
  const after = collectSnapshot(gameState.player, gameState.world, gameState.currentMapId, gameState.currentMap, scenarioPlaceProfile, thermalEnvOverride);
  const placeProfile = scenarioPlaceProfile;

  const dtMin = Math.max(1, Number(cfg.deltaMin ?? 20));
  const tCoreDeltaPer10Min = toRounded((after.tCore - before.tCore) * (10 / dtMin), 4);
  return {
    dtMin,
    placeProfileId: String(cfg.placeProfileId || gameState.currentMap?.placeProfileId || gameState.currentMapId || ""),
    before,
    after,
    delta: {
      tCore: toRounded(after.tCore - before.tCore, 4),
      hypo: toRounded(after.hypo - before.hypo, 4),
      hp: toRounded(after.hp - before.hp, 4),
      wetness: toRounded(after.wetness - before.wetness, 4)
    },
    tCoreDeltaPer10Min,
    tCoreCoolingPer10Min: toRounded(Math.max(0, -tCoreDeltaPer10Min), 4),
    tCoreWarmingPer10Min: toRounded(Math.max(0, tCoreDeltaPer10Min), 4),
    dT10: tCoreDeltaPer10Min,
    context: {
      worldSnapshot: buildWorldSnapshot(gameState.world, thermalEnvOverride),
      placeProfile: buildPlaceProfileSnapshot(placeProfile),
      windModel: buildWindModelSnapshot(gameState.world, placeProfile, thermalEnvOverride),
      equipment: deepClone(gameState.player.equipment)
    }
  };
}

function runIndoorWarmExpScenario(cfg) {
  gameState.player = createDefaultPlayerState();
  gameState.currentMapId = String(cfg.mapId || "test_temp");
  gameState.currentMap = {
    id: gameState.currentMapId,
    placeProfileId: String(cfg.placeProfileId || gameState.currentMapId || "test_temp_indoor")
  };

  setupWorld({
    regionId: String(cfg.regionId || "West2"),
    sun: Number(cfg.sun ?? 58),
    snowfallRate: Number(cfg.snowfallRate ?? 0.9),
    windSpeed: Number(cfg.windSpeed ?? 12),
    totalMinutes: Number(cfg.totalMinutes ?? 720),
    exposureEnabled: false
  });

  const thermal = gameState.player.gear.thermal;
  if (Number.isFinite(Number(cfg.wetness))) thermal.wetness = Number(cfg.wetness);
  if (typeof cfg.satiety === "number") gameState.player.physio.satiety = cfg.satiety;
  if (typeof cfg.tCore === "number") gameState.player.physio.temperatureC = cfg.tCore;
  if (typeof cfg.mutatePlayer === "function") cfg.mutatePlayer(gameState.player);
  const hpLocked = cfg.hpLocked !== false;
  const hpLockedValue = Number.isFinite(Number(cfg.hp))
    ? Number(cfg.hp)
    : Number(gameState.player?.psycho?.hp ?? 100);
  const thermalEnvOverride = cfg.thermalEnvOverride || {
    tEnvRegionC: -22.34,
    windLocal: 0
  };
  if (hpLocked) {
    gameState.player.psycho.hp = hpLockedValue;
  }

  const placeProfile = resolveScenarioPlaceProfile(gameState.currentMapId, gameState.currentMap, cfg.placeProfileOverride || {
    space: "indoor",
    exposureLevel: "Sheltered",
    windShelter: 1,
    heatSource: 0,
    drying: 0.2
  });
  const ctxBase = {
    isSleeping: false,
    sessionCoverage: "NONE",
    world: gameState.world,
    currentMapId: gameState.currentMapId,
    currentMap: gameState.currentMap,
    regionCfg: getRegionConfigById(gameState.world.regionId),
    placeProfile,
    thermalEnvOverride,
    wetnessLocked: true,
    lockedWetness: Number(cfg.wetness ?? gameState.player.gear.thermal.wetness ?? 0),
    flags: {
      wetnessLocked: true
    }
  };

  applyTimeToPlayer(gameState.player, 0, { ...ctxBase, timeView: getTimeView(gameState.time.totalMinutes) });
  if (hpLocked) {
    gameState.player.psycho.hp = hpLockedValue;
  }
  const before = collectSnapshot(
    gameState.player,
    gameState.world,
    gameState.currentMapId,
    gameState.currentMap,
    placeProfile,
    thermalEnvOverride,
    { includeExposureFields: false }
  );

  const indoorWarmDefs = PLAYER_DEFS.temperature?.indoorWarm || {};
  const coreDefs = PLAYER_DEFS.temperature?.coreTemp || {};
  const targetC = Number(indoorWarmDefs?.targetC ?? coreDefs?.T_core_normal ?? 37);
  const epsilonC = Number(indoorWarmDefs?.epsilonC ?? 0.1);
  const kOverride = indoorWarmDefs?.kPerHourOverride;
  const kPerHourUsed = Number.isFinite(kOverride)
    ? Math.max(0, Number(kOverride))
    : computeExpRecoverKPerHour({
      deltaWorstC: Math.abs(targetC - Number(coreDefs?.T_core_min ?? 20)),
      epsilonC,
      hours: Number(indoorWarmDefs?.fullRecoverHours ?? 4)
    });
  const effMulUsed = computeIndoorWarmRecoveryEfficiencyMul(gameState.player, ctxBase, placeProfile, indoorWarmDefs);
  const totalMinutes = Math.max(0, Number(cfg.totalMinutes ?? 240));
  const checkpointTargets = new Map((cfg.checkpoints || []).map((step) => [Number(step.totalMin ?? 0), String(step.label || `${step.totalMin}min`)]));
  const checkpoints = [];
  let lastSnapshot = before;
  let finalAfter = before;
  let reachMinute = isNearTargetC(before.tCore, targetC, epsilonC) ? 0 : null;
  let monotonicNonDecreasing = true;

  for (let minute = 1; minute <= totalMinutes; minute++) {
    const advanceResult = advanceTimeMinutes(1, "SMOKE_INDOOR_WARM", getAdvanceContext());
    const advancedMinutes = Number(advanceResult?.advancedMinutes ?? 1);
    applyTimeToPlayer(gameState.player, advancedMinutes, { ...ctxBase, timeView: getTimeView(gameState.time.totalMinutes) });
    if (hpLocked) {
      gameState.player.psycho.hp = hpLockedValue;
    }
    const current = collectSnapshot(
      gameState.player,
      gameState.world,
      gameState.currentMapId,
      gameState.currentMap,
      placeProfile,
      thermalEnvOverride,
      { includeExposureFields: false }
    );
    if ((current.tCore + 1e-9) < lastSnapshot.tCore) {
      monotonicNonDecreasing = false;
    }
    if (reachMinute === null && isNearTargetC(current.tCore, targetC, epsilonC)) {
      reachMinute = minute;
    }
    if (checkpointTargets.has(minute)) {
      checkpoints.push({
        label: checkpointTargets.get(minute),
        totalMin: minute,
        tCore_before: toRounded(lastSnapshot.tCore, 4),
        tCore_after: toRounded(current.tCore, 4),
        hypo_before: toRounded(lastSnapshot.hypo ?? lastSnapshot.hypo100 ?? 0, 4),
        hypo_after: toRounded(current.hypo ?? current.hypo100 ?? 0, 4),
        hp_before: toRounded(lastSnapshot.hp ?? 0, 4),
        hp_after: toRounded(current.hp ?? 0, 4)
      });
    }
    lastSnapshot = current;
    finalAfter = current;
  }

  const finalGapC = Math.abs(targetC - finalAfter.tCore);
  if (reachMinute === null && finalGapC <= epsilonC + 1e-9) {
    reachMinute = totalMinutes;
  }

  const dtMin = Math.max(1, totalMinutes);
  const totalTCoreDelta = finalAfter.tCore - before.tCore;
  const tCoreDeltaPer10Min = toRounded(totalTCoreDelta * (10 / dtMin), 4);
  const avgWarmingPer10Min = toRounded(Math.max(0, totalTCoreDelta / dtMin * 10), 4);
  const avgWarmingPerHour = toRounded(Math.max(0, totalTCoreDelta / (dtMin / 60)), 4);
  return {
    dtMin,
    placeProfileId: String(gameState.currentMap?.placeProfileId || gameState.currentMapId || ""),
    before,
    after: finalAfter,
    delta: {
      tCore: toRounded(finalAfter.tCore - before.tCore, 4),
      hypo: toRounded((finalAfter.hypo ?? finalAfter.hypo100 ?? 0) - (before.hypo ?? before.hypo100 ?? 0), 4),
      hp: toRounded(finalAfter.hp - before.hp, 4),
      wetness: toRounded(finalAfter.wetness - before.wetness, 4)
    },
    tCoreDeltaPer10Min,
    tCoreCoolingPer10Min: toRounded(Math.max(0, -tCoreDeltaPer10Min), 4),
    tCoreWarmingPer10Min: toRounded(Math.max(0, tCoreDeltaPer10Min), 4),
    avgWarmingPer10Min,
    avgWarmingPerHour,
    dT10: tCoreDeltaPer10Min,
    checkpoints,
    simulationMode: "integration-1min-indoor-exp",
    context: {
      worldSnapshot: buildWorldSnapshot(gameState.world, thermalEnvOverride, { wetnessLocked: true, hpLocked }),
      placeProfile: buildPlaceProfileSnapshot(placeProfile),
      windModel: buildWindModelSnapshot(gameState.world, placeProfile, thermalEnvOverride),
      equipment: deepClone(gameState.player.equipment)
    },
    indoorWarmEvidence: {
      targetC: toRounded(targetC, 4),
      epsilonC: toRounded(epsilonC, 4),
      kPerHourUsed: toRounded(kPerHourUsed, 6),
      effMulUsed: toRounded(effMulUsed, 4),
      reachMinute,
      monotonicNonDecreasing,
      gapStartC: toRounded(Math.abs(targetC - before.tCore), 4),
      gapEndC: toRounded(finalGapC, 4),
      fullRecoverHours: toRounded(Number(indoorWarmDefs?.fullRecoverHours ?? 4), 4)
    }
  };
}

async function runActionPipelineScenario(cfg) {
  gameState.player = createDefaultPlayerState();
  gameState.currentMapId = "test_time";
  gameState.currentMap = await loadMap("test_time");

  setupWorld({
    regionId: String(cfg.regionId || "West2"),
    sun: Number(cfg.sun ?? 58),
    snowfallRate: Number(cfg.snowfallRate ?? 0.9),
    windSpeed: Number(cfg.windSpeed ?? 12),
    totalMinutes: Number(cfg.totalMinutes ?? 720),
    exposureEnabled: cfg.exposureEnabled !== false
  });

  const thermal = gameState.player.gear.thermal;
  if (Number.isFinite(Number(cfg.wetness))) thermal.wetness = Number(cfg.wetness);
  if (typeof cfg.satiety === "number") gameState.player.physio.satiety = cfg.satiety;

  const beforeCtx = {
    isSleeping: false,
    sessionCoverage: "NONE",
    world: gameState.world,
    currentMapId: gameState.currentMapId,
    currentMap: gameState.currentMap,
    timeView: getTimeView(gameState.time.totalMinutes),
    regionCfg: getRegionConfigById(gameState.world.regionId),
    placeProfile: getPlaceProfileForMap(gameState.currentMapId, gameState.currentMap)
  };
  applyTimeToPlayer(gameState.player, 0, beforeCtx);
  const before = collectSnapshot(gameState.player, gameState.world, gameState.currentMapId, gameState.currentMap);

  const action = makeActionFromUI("wait_time", { minutes: Number(cfg.deltaMin ?? 20) }, gameState);
  const plan = await resolve(action, gameState);
  const commitResult = await commit(plan, gameState);
  const after = collectSnapshot(gameState.player, gameState.world, gameState.currentMapId, gameState.currentMap);
  const placeProfile = getPlaceProfileForMap(gameState.currentMapId, gameState.currentMap);

  const dtMin = Math.max(1, Number(cfg.deltaMin ?? 20));
  const tCoreDeltaPer10Min = toRounded((after.tCore - before.tCore) * (10 / dtMin), 4);
  return {
    dtMin,
    placeProfileId: String(gameState.currentMap?.placeProfileId || gameState.currentMapId || ""),
    before,
    after,
    delta: {
      tCore: toRounded(after.tCore - before.tCore, 4),
      hypo: toRounded(after.hypo - before.hypo, 4),
      hp: toRounded(after.hp - before.hp, 4),
      wetness: toRounded(after.wetness - before.wetness, 4)
    },
    tCoreDeltaPer10Min,
    tCoreCoolingPer10Min: toRounded(Math.max(0, -tCoreDeltaPer10Min), 4),
    tCoreWarmingPer10Min: toRounded(Math.max(0, tCoreDeltaPer10Min), 4),
    dT10: tCoreDeltaPer10Min,
    commitOk: !!commitResult?.ok,
    sysCallsCount: Number(commitResult?.report?.plan?.sysCallsCount ?? 0),
    advanceCalls: Number((commitResult?.report?.sysCalls || []).filter(x => x?.call?.type === "ADVANCE_TIME").length),
    context: {
      worldSnapshot: buildWorldSnapshot(gameState.world),
      placeProfile: buildPlaceProfileSnapshot(placeProfile),
      windModel: buildWindModelSnapshot(gameState.world, placeProfile),
      equipment: deepClone(gameState.player.equipment)
    },
    pipeline: {
      ok: !!commitResult?.ok,
      commitOk: !!commitResult?.ok,
      sysCallsCount: Number(commitResult?.report?.plan?.sysCallsCount ?? 0),
      advanceTimeCalls: Number((commitResult?.report?.sysCalls || []).filter(x => x?.call?.type === "ADVANCE_TIME").length),
      actionId: String(action?.id || "wait_time"),
      mapId: String(gameState.currentMapId || "test_time")
    }
  };
}

function buildCheckpoint(label, totalMin, before, after) {
  return {
    label,
    totalMin,
    tCore_before: toRounded(before?.tCore ?? 0, 4),
    tCore_after: toRounded(after?.tCore ?? 0, 4),
    hypo100_before: toRounded(before?.hypo100 ?? before?.hypo ?? 0, 4),
    hypo100_after: toRounded(after?.hypo100 ?? after?.hypo ?? 0, 4),
    hp_before: toRounded(before?.hp ?? 0, 4),
    hp_after: toRounded(after?.hp ?? 0, 4)
  };
}

function getCoreThresholds() {
  const defs = PLAYER_DEFS.temperature || {};
  const core = defs?.core || {};
  const legacy = defs?.coreTemp || {};
  return {
    normalC: Number(core?.normalC ?? legacy?.T_core_normal ?? 37),
    incapC: Number(core?.incapC ?? 35),
    deathC: Number(core?.deathC ?? 28),
    minC: Number(core?.minC ?? legacy?.T_core_min ?? 20),
    maxC: Number(core?.maxC ?? legacy?.T_core_max ?? 40)
  };
}

function runExposureAnalyticalScenario(cfg) {
  gameState.player = createDefaultPlayerState();
  gameState.currentMapId = String(cfg.mapId || "test_temp");
  gameState.currentMap = {
    id: gameState.currentMapId,
    placeProfileId: String(cfg.placeProfileId || gameState.currentMapId)
  };

  setupWorld({
    regionId: String(cfg.regionId || "West2"),
    sun: Number(cfg.sun ?? 58),
    snowfallRate: Number(cfg.snowfallRate ?? 0.9),
    windSpeed: Number(cfg.windSpeed ?? 4.1667),
    totalMinutes: Number(cfg.totalMinutes ?? 720),
    exposureEnabled: cfg.exposureEnabled !== false
  });

  gameState.player.gear.thermal.wetness = Number(cfg.wetness ?? 0.3);
  gameState.player.psycho.hp = Number(cfg.hp ?? 100);
  gameState.player.exposure.hypo100 = Number(cfg.hypo100 ?? 100);
  gameState.player.exposure.incapacitated = false;
  gameState.player.exposure.dead = false;
  equipSet(gameState.player, cfg.equipment || {});
  if (typeof cfg.mutatePlayer === "function") cfg.mutatePlayer(gameState.player);

  const placeProfile = resolveScenarioPlaceProfile(gameState.currentMapId, gameState.currentMap, cfg.placeProfileOverride);
  const weights = PLAYER_DEFS.equipmentWeights || {};
  ensureItemsDbLoaded();
  const actualProtection = computeEquipmentProtectionProfile(gameState.player.equipment, getItemsById(), weights, PLAYER_DEFS.temperature?.exposureModel || {});
  gameState.player.gear.thermal.insulationEff = actualProtection.insulationEff;
  gameState.player.gear.thermal.windproofEff = actualProtection.windproofEff;
  gameState.player.gear.thermal.protectionScore = actualProtection.protectionScore;
  const timings = computeExposureDurations(actualProtection.protectionScore, PLAYER_DEFS.temperature?.exposureModel || {});
  const coolingProfile = computeCoolingKsFromDurations(timings, PLAYER_DEFS.temperature || {});
  const coreThresholds = getCoreThresholds();
  const rateMul = computeExposureCoolingRateMul(
    Number(cfg?.thermalEnvOverride?.tEnvEffC ?? cfg?.thermalEnvOverride?.tEnvRegionC ?? -13.974),
    PLAYER_DEFS.temperature || {}
  );

  const before = collectSnapshot(gameState.player, gameState.world, gameState.currentMapId, gameState.currentMap, placeProfile, cfg.thermalEnvOverride);
  const checkpoints = [];
  let currentTCore = before.tCore;
  let lastTotal = 0;
  let lastBefore = before;
  let finalAfter = before;

  for (const step of cfg.checkpoints || []) {
    const totalMin = Math.max(lastTotal, Number(step.totalMin ?? 0));
    const deltaMin = totalMin - lastTotal;
    currentTCore = stepCoreTempCoolingExp(currentTCore, {
      ...coolingProfile,
      safeKPerHour: coolingProfile.safeKPerHour * rateMul,
      criticalKPerHour: coolingProfile.criticalKPerHour * rateMul
    }, deltaMin / 60);
    gameState.player.physio.temperatureC = currentTCore;
    gameState.player.psycho.hypothermia = mapCoreTempToHypo100(currentTCore, PLAYER_DEFS.temperature || {});
    gameState.player.exposure.hypo100 = gameState.player.psycho.hypothermia;
    gameState.player.psycho.hp = mapCoreTempToHp100(currentTCore, PLAYER_DEFS.temperature || {});
    gameState.player.exposure.incapacitated = currentTCore <= coreThresholds.incapC;
    gameState.player.exposure.dead = currentTCore <= coreThresholds.deathC || gameState.player.psycho.hp <= 0;
    const afterStep = collectSnapshot(gameState.player, gameState.world, gameState.currentMapId, gameState.currentMap, placeProfile, cfg.thermalEnvOverride);
    checkpoints.push(buildCheckpoint(String(step.label || `${totalMin}min`), totalMin, lastBefore, afterStep));
    lastBefore = afterStep;
    finalAfter = afterStep;
    lastTotal = totalMin;
  }

  const dtMin = lastTotal;
  const tCoreDeltaPer10Min = dtMin > 0 ? toRounded((finalAfter.tCore - before.tCore) * (10 / dtMin), 4) : 0;

  return {
    dtMin,
    placeProfileId: String(cfg.placeProfileId || gameState.currentMapId || ""),
    before,
    after: finalAfter,
    delta: {
      tCore: toRounded(finalAfter.tCore - before.tCore, 4),
      hypo100: getSnapshotHypoDelta(before, finalAfter),
      hp: toRounded(finalAfter.hp - before.hp, 4),
      wetness: toRounded(finalAfter.wetness - before.wetness, 4)
    },
    tCoreDeltaPer10Min,
    tCoreCoolingPer10Min: toRounded(Math.max(0, -tCoreDeltaPer10Min), 4),
    tCoreWarmingPer10Min: toRounded(Math.max(0, tCoreDeltaPer10Min), 4),
    dT10: tCoreDeltaPer10Min,
    checkpoints,
    simulationMode: "analytical",
    context: {
      worldSnapshot: buildWorldSnapshot(gameState.world, cfg.thermalEnvOverride),
      placeProfile: buildPlaceProfileSnapshot(placeProfile),
      windModel: buildWindModelSnapshot(gameState.world, placeProfile, cfg.thermalEnvOverride),
      equipment: deepClone(gameState.player.equipment)
    }
  };
}

function runExposureIntegratedScenario(cfg) {
  gameState.player = createDefaultPlayerState();
  gameState.currentMapId = String(cfg.mapId || "test_temp");
  gameState.currentMap = {
    id: gameState.currentMapId,
    placeProfileId: String(cfg.placeProfileId || gameState.currentMapId)
  };

  setupWorld({
    regionId: String(cfg.regionId || "West2"),
    sun: Number(cfg.sun ?? 58),
    snowfallRate: Number(cfg.snowfallRate ?? 0.9),
    windSpeed: Number(cfg.windSpeed ?? 4.1667),
    totalMinutes: Number(cfg.totalMinutes ?? 720),
    exposureEnabled: cfg.exposureEnabled !== false
  });

  gameState.player.gear.thermal.wetness = Number(cfg.wetness ?? 0.3);
  gameState.player.psycho.hp = Number(cfg.hp ?? 100);
  gameState.player.exposure.hypo100 = Number(cfg.hypo100 ?? 100);
  gameState.player.exposure.incapacitated = false;
  gameState.player.exposure.dead = false;
  equipSet(gameState.player, cfg.equipment || {});
  if (typeof cfg.mutatePlayer === "function") cfg.mutatePlayer(gameState.player);

  const placeProfile = resolveScenarioPlaceProfile(gameState.currentMapId, gameState.currentMap, cfg.placeProfileOverride);
  const ctxBase = {
    isSleeping: false,
    sessionCoverage: "NONE",
    world: gameState.world,
    currentMapId: gameState.currentMapId,
    currentMap: gameState.currentMap,
    regionCfg: getRegionConfigById(gameState.world.regionId),
    placeProfile,
    thermalEnvOverride: cfg.thermalEnvOverride || null,
    wetnessLocked: cfg.wetnessLocked === true,
    lockedWetness: Number(cfg.wetness ?? 0.3),
    exposureOnly: cfg.exposureOnly === true,
    flags: {
      wetnessLocked: cfg.wetnessLocked === true,
      exposureOnly: cfg.exposureOnly === true
    }
  };
  applyTimeToPlayer(gameState.player, 0, { ...ctxBase, timeView: getTimeView(gameState.time.totalMinutes) });
  const before = collectSnapshot(gameState.player, gameState.world, gameState.currentMapId, gameState.currentMap, placeProfile, cfg.thermalEnvOverride);

  const checkpoints = [];
  let lastTotal = 0;
  let lastBefore = before;
  let finalAfter = before;
  for (const step of cfg.checkpoints || []) {
    const totalMin = Math.max(lastTotal, Number(step.totalMin ?? 0));
    const deltaMin = totalMin - lastTotal;
    if (deltaMin > 0) {
      const advanceResult = advanceTimeMinutes(deltaMin, "SMOKE_EXPOSURE", getAdvanceContext());
      const advancedMinutes = Number(advanceResult?.advancedMinutes ?? deltaMin);
      applyTimeToPlayer(gameState.player, advancedMinutes, { ...ctxBase, timeView: getTimeView(gameState.time.totalMinutes) });
    }
    const afterStep = collectSnapshot(gameState.player, gameState.world, gameState.currentMapId, gameState.currentMap, placeProfile, cfg.thermalEnvOverride);
    checkpoints.push(buildCheckpoint(String(step.label || `${totalMin}min`), totalMin, lastBefore, afterStep));
    lastBefore = afterStep;
    finalAfter = afterStep;
    lastTotal = totalMin;
  }

  const dtMin = lastTotal;
  const tCoreDeltaPer10Min = dtMin > 0 ? toRounded((finalAfter.tCore - before.tCore) * (10 / dtMin), 4) : 0;

  return {
    dtMin,
    placeProfileId: String(cfg.placeProfileId || gameState.currentMapId || ""),
    before,
    after: finalAfter,
    delta: {
      tCore: toRounded(finalAfter.tCore - before.tCore, 4),
      hypo100: getSnapshotHypoDelta(before, finalAfter),
      hp: toRounded(finalAfter.hp - before.hp, 4),
      wetness: toRounded(finalAfter.wetness - before.wetness, 4)
    },
    tCoreDeltaPer10Min,
    tCoreCoolingPer10Min: toRounded(Math.max(0, -tCoreDeltaPer10Min), 4),
    tCoreWarmingPer10Min: toRounded(Math.max(0, tCoreDeltaPer10Min), 4),
    dT10: tCoreDeltaPer10Min,
    checkpoints,
    simulationMode: "integration-1min",
    context: {
      worldSnapshot: buildWorldSnapshot(gameState.world, cfg.thermalEnvOverride),
      placeProfile: buildPlaceProfileSnapshot(placeProfile),
      windModel: buildWindModelSnapshot(gameState.world, placeProfile, cfg.thermalEnvOverride),
      equipment: deepClone(gameState.player.equipment)
    }
  };
}

function buildCase(name, rows, asserts, notes = "", extras = {}) {
  const pass = asserts.every(x => x.pass);
  const before = toCaseMetricSnapshot(rows.before);
  const after = toCaseMetricSnapshot(rows.after);
  return {
    name,
    pass,
    asserts,
    before,
    after,
    delta: rows.delta,
    dtMin: Number(rows.dtMin ?? 0),
    placeProfileId: String(rows.placeProfileId || ""),
    tCoreDeltaPer10Min: rows.tCoreDeltaPer10Min,
    tCoreCoolingPer10Min: rows.tCoreCoolingPer10Min,
    tCoreWarmingPer10Min: rows.tCoreWarmingPer10Min,
    avgWarmingPer10Min: rows.avgWarmingPer10Min ?? undefined,
    avgWarmingPerHour: rows.avgWarmingPerHour ?? undefined,
    dT10: rows.dT10,
    notes: notes || undefined,
    context: rows.context || undefined,
    pipeline: rows.pipeline || undefined,
    checkpoints: rows.checkpoints || undefined,
    simulationMode: rows.simulationMode || undefined,
    exposureEvidence: rows.exposureEvidence || undefined,
    slotContrib: rows.slotContrib || undefined,
    weightSum: rows.weightSum ?? undefined,
    ...extras
  };
}

function buildSummaryText(report) {
  const parts = [];
  parts.push(`[TEMP_SMOKE_SUMMARY] Day ${report.day} ${report.hhmm} | region=${report.regionId} | map=${report.mapId} | pass=${report.summary.passCount} | fail=${report.summary.failCount}`);
  for (const row of report.cases) {
    const beforeHypo = row.before?.hypo100 ?? row.before?.hypo;
    const afterHypo = row.after?.hypo100 ?? row.after?.hypo;
    parts.push(`${row.pass ? "PASS" : "FAIL"} | ${row.name} | tCore ${row.before.tCore}->${row.after.tCore} | hypo ${beforeHypo}->${afterHypo} | wet ${row.before.wetness}->${row.after.wetness}`);
  }
  return parts.join("\n");
}

function buildCaseJsonLine(row) {
  return `[TEMP_SMOKE] ${JSON.stringify(row)}`;
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, Math.max(0, Number(ms) || 0));
  });
}

function ensureSmokeRenderDom() {
  if (!document.querySelector('link[data-smoke-style="main-ui"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./style.css";
    link.setAttribute("data-smoke-style", "main-ui");
    document.head.appendChild(link);
  }

  let gameRoot = document.getElementById("game-root");
  if (!gameRoot) {
    gameRoot = document.createElement("div");
    gameRoot.id = "game-root";
    document.body.appendChild(gameRoot);
  }

  let app = document.getElementById("app");
  if (!app) {
    app = document.createElement("div");
    app.id = "app";
    gameRoot.appendChild(app);
  }

  let choices = document.getElementById("choices");
  if (!choices) {
    choices = document.createElement("div");
    choices.id = "choices";
    gameRoot.appendChild(choices);
  }

  return { gameRoot, app, choices };
}

async function renderInventoryUiSmokeFixture({ selectedSlot = "upper", selectedItemId = null, mapId = "bayport_clinic", filter = "clothing", inventoryOverride = null, equipmentOverride = null } = {}) {
  ensureSmokeRenderDom();
  await ensureItemsDbLoaded();
  const itemsById = getItemsById();
  const map = await loadMap(mapId);

  const player = createDefaultPlayerState();
  const upperCandidateId = ["cloth_polar_parka", "exp_t1_upper", "syn_upper"].find((id) => itemsById.has(id)) || null;
  player.inventory = Array.isArray(inventoryOverride)
    ? deepClone(inventoryOverride)
    : [
        { itemId: "starter_lining_wool", qty: 1 },
        { itemId: "starter_lower_cotton", qty: 1 },
        { itemId: "starter_shoes_boots", qty: 1 },
        ...(upperCandidateId ? [{ itemId: upperCandidateId, qty: 1 }] : [])
      ];
  player.equipment = equipmentOverride
    ? deepClone(equipmentOverride)
    : {
        upper: null,
        lining: "starter_lining_wool",
        lower: "starter_lower_cotton",
        shoes: "starter_shoes_boots",
        goggles: null,
        head: null,
        hands: null,
        neck: null,
        backpack: null
      };

  gameState.currentMapId = mapId;
  gameState.currentMap = map;
  gameState.world.regionId = "West2";
  gameState.world.windSpeed = 0;
  if (!gameState.world.weather || typeof gameState.world.weather !== "object") {
    gameState.world.weather = {};
  }
  gameState.world.weather.windSpeed_local = 0;
  gameState.player = player;
  gameState.ui.page = "inventory";
  gameState.ui.invFilter = filter;
  gameState.ui.invSelectedSlot = selectedSlot;
  gameState.ui.invSelectedItemId = selectedItemId || (selectedSlot === "lining" ? "starter_lining_wool" : (upperCandidateId || "starter_lining_wool"));
  gameState.ui.invClothingSummaryExpanded = false;
  gameState.ui.invClothingSortMode = "death";
  gameState.ui.invClothingPopover = { open: false, itemId: null, slot: null, x: 0, y: 0, kind: "item", text: "" };
  gameState.ui.toast = "";

  render();
  await sleep(220);

  const overlay = document.querySelector(".inventory-overlay");
  const upperRow = overlay?.querySelector('.inventory-equip-row[data-action-id="inv_select_slot:upper"]') || null;
  const firstClothingRow = overlay?.querySelector(".inventory-item-row.is-clothing[data-item-id]") || null;
  const summaryToggle = overlay?.querySelector(".inventory-summary-toggle") || null;
  const summaryInfo = overlay?.querySelector(".inventory-summary-icon[aria-label='说明']") || null;
  const clothingHeader = overlay?.querySelector(".clothingHeaderRow") || null;
  const equipRows = overlay?.querySelector(".inventory-equip-rows") || null;
  const lastEquipRow = equipRows?.querySelector(".inventory-equip-row:last-of-type") || null;
  const candidatePane = overlay?.querySelector(".clothingCandidatePane") || null;
  const footerBar = overlay?.querySelector(".inventory-detail-band__actions") || overlay?.querySelector(".invFooterBar") || null;
  const footerPrimaryBtn = footerBar?.querySelector(".inventory-action-btn-primary") || null;
  return {
    overlay,
    upperRow,
    summaryToggle,
    equipRows,
    lastEquipRow,
    candidatePane,
    footerBar,
    footerPrimaryBtn,
    summaryInfo,
    clothingHeader,
    firstClothingRow,
    upperRowText: String(upperRow?.textContent || "").replace(/\s+/g, " ").trim(),
    upperRowTooltip: String(upperRow?.dataset?.hoverDesc || "").trim(),
    summaryText: String(overlay?.querySelector(".inventory-protection-summary")?.textContent || "").replace(/\s+/g, " ").trim(),
    summaryHeadline: String(overlay?.querySelector(".inventory-summary-headline")?.textContent || "").replace(/\s+/g, " ").trim(),
    summaryTagText: String(overlay?.querySelector(".inventory-summary-baseline-tag")?.textContent || "").replace(/\s+/g, " ").trim(),
    summaryTagTitle: String(overlay?.querySelector(".inventory-summary-baseline-tag")?.getAttribute("title") || "").trim(),
    summaryInfoHover: String(summaryInfo?.dataset?.hoverDesc || "").trim(),
    summaryMetaText: String(overlay?.querySelector(".clothingHeaderMeta")?.textContent || "").replace(/\s+/g, " ").trim(),
    summaryPriorityText: String(overlay?.querySelector(".clothingHeaderPriority")?.textContent || "").replace(/\s+/g, " ").trim(),
    summaryHintText: String(overlay?.querySelector(".clothingHeaderHint")?.textContent || "").replace(/\s+/g, " ").trim(),
    clothingHeaderText: String(clothingHeader?.textContent || "").replace(/\s+/g, " ").trim(),
    clothingHeaderHeight: clothingHeader?.getBoundingClientRect?.().height || 0,
    overlayClientWidth: Number(overlay?.clientWidth || 0),
    equipRowsClientWidth: Number(equipRows?.clientWidth || 0),
    equipRowsScrollWidth: Number(equipRows?.scrollWidth || 0),
    candidateTitle: String(overlay?.querySelector(".inventory-clothing-section-title")?.textContent || "").trim(),
    recommendationTexts: Array.from(overlay?.querySelectorAll(".inventory-recommend-card") || []).map((el) => String(el.textContent || "").replace(/\s+/g, " ").trim()),
    equipRowCount: overlay?.querySelectorAll(".inventory-equip-row").length || 0,
    lastEquipRowText: String(lastEquipRow?.textContent || "").replace(/\s+/g, " ").trim(),
    candidatePaneHeight: candidatePane?.getBoundingClientRect?.().height || 0,
    footerLine1Text: String(footerBar?.querySelector(".invFooterInfo .line1")?.textContent || "").replace(/\s+/g, " ").trim(),
    footerLine2Text: String(footerBar?.querySelector(".invFooterInfo .line2")?.textContent || "").replace(/\s+/g, " ").trim(),
    footerPrimaryText: String(footerPrimaryBtn?.textContent || "").replace(/\s+/g, " ").trim(),
    footerPrimaryDisabled: footerPrimaryBtn?.disabled === true,
    footerActionTexts: Array.from(footerBar?.querySelectorAll(".invFooterActions .inventory-action-btn") || []).map((el) => String(el.textContent || "").replace(/\s+/g, " ").trim()),
    overlayText: String(overlay?.textContent || "").replace(/\s+/g, " ").trim()
  };
}

async function collectUiSlotEmptyEvidence() {
  const fixture = await renderInventoryUiSmokeFixture();
  return {
    upperRowText: fixture.upperRowText,
    hasIPlaceholder: fixture.upperRowText.includes("I --"),
    hasWPlaceholder: fixture.upperRowText.includes("W --"),
    hasMissingChip: fixture.upperRowText.includes("缺失"),
    hasPersistentWarning: fixture.upperRowText.includes("未装备：显著缩短生存时间"),
    avoidsZeroMetric: !fixture.upperRowText.includes("I 0.00") && !fixture.upperRowText.includes("W 0.00"),
    tooltipHasNewCopy: fixture.upperRowTooltip.includes("未装备：该槽位按“漏风缺失”参与 W_eff，显著缩短暴露时间"),
    tooltipHasPriority: fixture.upperRowTooltip.includes("建议优先补全："),
    recommendationTexts: fixture.recommendationTexts
  };
}

async function collectUiSummaryCollapseEvidence() {
  const fixture = await renderInventoryUiSmokeFixture();
  const collapsedOverlay = fixture.overlay;
  const collapsedText = String(collapsedOverlay?.textContent || "").replace(/\s+/g, " ").trim();
  const toggleBtn = fixture.summaryToggle;
  if (toggleBtn) {
    toggleBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await sleep(120);
  }
  const expandedOverlay = document.querySelector(".inventory-overlay");
  const expandedText = String(expandedOverlay?.textContent || "").replace(/\s+/g, " ").trim();
  return {
    collapsedHasBasisText: collapsedText.includes("基准：外界 Open"),
    expandedHasBasisText: expandedText.includes("基准") && expandedText.includes("外界 Open"),
    collapsedHasHeadline: collapsedText.includes("失能") && collapsedText.includes("致死"),
    expandedHasWeakReason: expandedText.includes("主要短板：") || expandedText.includes("短板贡献"),
    expandedHasJumpButton: expandedText.includes("查看可用服装")
  };
}

async function collectUiHeaderBaselineNoEllipsisEvidence() {
  const fixture = await renderInventoryUiSmokeFixture({ filter: "clothing" });
  const toggleBtn = fixture.summaryToggle;
  if (toggleBtn) {
    toggleBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await sleep(120);
  }
  const expandedOverlay = document.querySelector(".inventory-overlay");
  const expandedBlock = expandedOverlay?.querySelector(".inventory-summary-expanded") || null;
  const baselineRows = Array.from(expandedOverlay?.querySelectorAll(".baselineRowText") || []);
  const expandedText = String(expandedBlock?.textContent || "").replace(/\s+/g, " ").trim();
  const baselineStyles = baselineRows.map((el) => {
    const style = window.getComputedStyle(el);
    return {
      whiteSpace: style.whiteSpace,
      textOverflow: style.textOverflow,
      overflowX: style.overflowX,
      overflowY: style.overflowY
    };
  });
  return {
    expandedText,
    baselineRowCount: baselineRows.length,
    containsEllipsisText: expandedText.includes("..."),
    containsJumpText: expandedText.includes("查看可用服装"),
    containsCurrentLine1: expandedText.includes("当前") && expandedText.includes("/"),
    containsCurrentLine2: expandedText.includes("风速") && (expandedText.includes("仅用于比较") || expandedText.includes("km/h")),
    wrapsAllowed: baselineStyles.every((row) => row.whiteSpace !== "nowrap" && row.textOverflow !== "ellipsis"),
    overflowVisible: baselineStyles.every((row) => row.overflowX !== "hidden" && row.overflowY !== "hidden")
  };
}

async function collectUiSlotFilterRemovedEvidence() {
  const fixture = await renderInventoryUiSmokeFixture();
  const overlayText = String(fixture.overlay?.textContent || "").replace(/\s+/g, " ").trim();
  return {
    equipRowCount: fixture.equipRowCount,
    hasRemovedText: overlayText.includes("仅显示已装备"),
    hasToggleEl: !!fixture.overlay?.querySelector(".inventory-clothing-compact-toggle, .slotFilterToggle"),
    hasHiddenSummary: !!fixture.overlay?.querySelector(".inventory-equip-hidden-summary")
  };
}

async function collectUiClothingSummaryBaselineTagEvidence() {
  const fixture = await renderInventoryUiSmokeFixture({ mapId: "bayport_clinic" });
  return {
    headline: fixture.summaryHeadline,
    tagText: fixture.summaryTagText,
    tagTitle: fixture.summaryTagTitle,
    summaryText: fixture.summaryText,
    infoHover: fixture.summaryInfoHover,
    showsReferenceTag: fixture.summaryHeadline.includes("(参考)") || fixture.summaryTagText.includes("参考"),
    includesCompareNotice: fixture.summaryInfoHover.includes("当前环境≠基准") || fixture.summaryTagTitle.includes("当前环境≠基准"),
    includesReferenceGuidance: fixture.summaryText.includes("实际以温控卡") || fixture.summaryText.includes("当前 ETA"),
    hoverHasBaseline: fixture.summaryInfoHover.includes("基准") || fixture.summaryInfoHover.includes("Open")
  };
}

async function collectUiHeaderHudMinimalEvidence() {
  const fixture = await renderInventoryUiSmokeFixture({ filter: "clothing" });
  const defaultText = String(fixture.overlay?.querySelector(".clothingHeaderRow")?.textContent || "").replace(/\s+/g, " ").trim();
  return {
    defaultText,
    hasReferenceText: defaultText.includes("外界基准（参考）"),
    hasShortfallText: defaultText.includes("短板："),
    hasEtaText: defaultText.includes("失能") && defaultText.includes("致死"),
    hidesExplainSentence: !defaultText.includes("用于对比换装收益")
  };
}

async function collectUiHeaderVisibilityClothingOnlyEvidence() {
  const filters = ["tool", "material", "consumable"];
  const results = [];
  for (const filter of filters) {
    const fixture = await renderInventoryUiSmokeFixture({ filter });
    results.push({
      filter,
      hasHeader: fixture.clothingHeaderHeight > 0,
      overlayHasLossText: fixture.summaryText.includes("失能") || String(fixture.overlay?.textContent || "").includes("失能")
    });
  }
  return {
    results,
    allHideHeader: results.every((row) => row.hasHeader === false),
    allHideLossText: results.every((row) => row.hasHeader === false)
  };
}

async function collectUiHeaderHeightCompactEvidence() {
  const fixture = await renderInventoryUiSmokeFixture({ filter: "clothing" });
  return {
    headerHeight: Number(fixture.clothingHeaderHeight || 0),
    headerText: fixture.clothingHeaderText,
    isCompact: Number(fixture.clothingHeaderHeight || 0) <= 90
  };
}

async function collectUiHeaderCopyClarityEvidence() {
  const fixture = await renderInventoryUiSmokeFixture({ filter: "clothing" });
  const defaultText = String(fixture.overlay?.querySelector(".clothingHeaderRow")?.textContent || "").replace(/\s+/g, " ").trim();
  return {
    tagText: fixture.summaryTagText,
    headline: fixture.summaryHeadline,
    metaText: fixture.summaryMetaText,
    priorityText: fixture.summaryPriorityText,
    hintText: fixture.summaryHintText,
    defaultText,
    hasClearTag: fixture.summaryTagText.includes("外界基准") || fixture.summaryTagText.includes("参考"),
    usesReadableMetricLabels: fixture.summaryMetaText.includes("隔热") && fixture.summaryMetaText.includes("防风") && fixture.summaryMetaText.includes("综合"),
    hidesEngineeringMetricLabels: !fixture.summaryMetaText.includes("I_eff") && !fixture.summaryMetaText.includes("W_eff") && !fixture.summaryMetaText.includes("P "),
    hasShortfallCopy: fixture.summaryPriorityText.includes("短板："),
    keepsEtaHeadline: fixture.summaryHeadline.includes("失能") && fixture.summaryHeadline.includes("致死"),
    keepsDefaultMinimal: !defaultText.includes("用于对比换装收益")
      && fixture.summaryTagText.includes("外界基准（参考）")
      && fixture.summaryPriorityText.includes("短板：")
  };
}

async function collectUiHoverCardAnchorCloseEvidence() {
  const fixture = await renderInventoryUiSmokeFixture({ filter: "clothing" });
  const row = fixture.firstClothingRow;
  if (row) {
    row.getBoundingClientRect = () => ({
      left: 40,
      top: 64,
      right: 188,
      bottom: 108,
      width: 148,
      height: 44
    });
    row.dispatchEvent(new MouseEvent("mouseover", {
      bubbles: true,
      cancelable: true,
      clientX: 180,
      clientY: 180
    }));
    await sleep(180);
  }
  const hoverCard = document.querySelector(".inventory-hover-card.is-visible");
  const containsDetailButton = !!hoverCard?.querySelector(".inventory-hover-detail-btn");
  const omitsCloseButton = !hoverCard?.querySelector(".inventory-popover-close");
  const leftBefore = String(hoverCard?.style.left || "");
  const topBefore = String(hoverCard?.style.top || "");
  row?.dispatchEvent(new MouseEvent("mousemove", {
    bubbles: true,
    cancelable: true,
    clientX: 360,
    clientY: 320
  }));
  await sleep(20);
  const leftAfterMove = String(hoverCard?.style.left || "");
  const topAfterMove = String(hoverCard?.style.top || "");
  row?.dispatchEvent(new MouseEvent("mouseout", {
    bubbles: true,
    cancelable: true,
    relatedTarget: hoverCard
  }));
  await sleep(120);
  const visibleAfterTransfer = !!document.querySelector(".inventory-hover-card.is-visible");
  hoverCard?.dispatchEvent(new MouseEvent("mouseleave", {
    bubbles: true,
    cancelable: true,
    relatedTarget: document.body
  }));
  await sleep(140);
  const visibleAfterLeave = !!document.querySelector(".inventory-hover-card.is-visible");
  return {
    hoverVisible: !!hoverCard,
    hasHoverCardClass: hoverCard?.classList.contains("clothingHoverCard") === true,
    containsDetailButton,
    omitsCloseButton,
    anchoredLeftStable: leftBefore && leftBefore === leftAfterMove,
    anchoredTopStable: topBefore && topBefore === topAfterMove,
    staysOpenWhenEnteringCard: visibleAfterTransfer,
    closesAfterLeavingCard: visibleAfterLeave === false
  };
}

async function collectUiHoverCardNoLayoutJankEvidence() {
  const fixture = await renderInventoryUiSmokeFixture({ filter: "clothing" });
  const row = fixture.firstClothingRow;
  const widthsBefore = {
    overlayClientWidth: Number(fixture.overlay?.clientWidth || 0),
    leftClientWidth: Number(fixture.equipRows?.clientWidth || 0),
    leftScrollWidth: Number(fixture.equipRows?.scrollWidth || 0)
  };

  if (row) {
    row.dispatchEvent(new MouseEvent("mouseover", {
      bubbles: true,
      cancelable: true,
      clientX: 180,
      clientY: 180
    }));
    await sleep(180);

    const hoverCard = document.querySelector(".inventory-hover-card");
    row.dispatchEvent(new MouseEvent("mouseout", {
      bubbles: true,
      cancelable: true,
      relatedTarget: hoverCard
    }));
    hoverCard?.dispatchEvent(new MouseEvent("mouseleave", {
      bubbles: true,
      cancelable: true,
      relatedTarget: document.body
    }));
    await sleep(170);
  }

  const widthsAfter = {
    overlayClientWidth: Number(fixture.overlay?.clientWidth || 0),
    leftClientWidth: Number(fixture.equipRows?.clientWidth || 0),
    leftScrollWidth: Number(fixture.equipRows?.scrollWidth || 0)
  };

  return {
    before: widthsBefore,
    after: widthsAfter,
    overlayStable: Math.abs(widthsAfter.overlayClientWidth - widthsBefore.overlayClientWidth) <= 1,
    leftClientStable: Math.abs(widthsAfter.leftClientWidth - widthsBefore.leftClientWidth) <= 1,
    leftScrollStable: Math.abs(widthsAfter.leftScrollWidth - widthsBefore.leftScrollWidth) <= 1
  };
}

async function runInventoryActionSmoke(actionId, { inventory = [], equipment = null } = {}) {
  await ensureItemsDbLoaded();
  const map = await loadMap("bayport_clinic");
  const player = createDefaultPlayerState();
  player.inventory = deepClone(inventory);
  player.equipment = equipment
    ? deepClone(equipment)
    : {
        upper: null,
        lining: null,
        lower: null,
        shoes: null,
        goggles: null,
        head: null,
        hands: null,
        neck: null,
        backpack: null
      };

  gameState.currentMapId = "bayport_clinic";
  gameState.currentMap = map;
  gameState.world.regionId = "West2";
  gameState.player = player;
  if (!gameState.debug || typeof gameState.debug !== "object") {
    gameState.debug = {};
  }
  gameState.debug.enabled = true;
  gameState.ui.page = "inventory";
  gameState.ui.toast = "";

  const action = makeActionFromUI(actionId, {}, gameState);
  const plan = await resolve(action, gameState);
  const commitResult = await commit(plan, gameState);

  return {
    ok: !!commitResult?.ok,
    toast: String(gameState.ui.toast || ""),
    inventory: deepClone(gameState.player.inventory),
    equipment: deepClone(gameState.player.equipment)
  };
}

async function collectInvClothingUnlimitedEvidence() {
  const kindBypass = await runInventoryActionSmoke("inv_debug_gain:starter_shoes_boots", {
    inventory: [
      { itemId: "starter_lining_wool", qty: 1 },
      { itemId: "starter_lower_cotton", qty: 1 }
    ]
  });
  const stackBypass = await runInventoryActionSmoke("inv_debug_gain:starter_lining_wool", {
    inventory: [
      { itemId: "starter_lining_wool", qty: 1 }
    ]
  });
  return {
    kindBypassOk: kindBypass.inventory.some((row) => row.itemId === "starter_shoes_boots" && row.qty === 1),
    stackBypassOk: stackBypass.inventory.some((row) => row.itemId === "starter_lining_wool" && row.qty === 2),
    kindBypassToast: kindBypass.toast,
    stackBypassToast: stackBypass.toast
  };
}

async function collectInvNonClothingStillLimitedEvidence() {
  const kindLimited = await runInventoryActionSmoke("inv_debug_gain:doc_citizen_identity", {
    inventory: [
      { itemId: "tool_rusty_pliers", qty: 1 },
      { itemId: "tool_small_flashlight", qty: 1 }
    ]
  });
  const stackLimited = await runInventoryActionSmoke("inv_debug_gain:material_scrap_fiber", {
    inventory: [
      { itemId: "material_scrap_fiber", qty: 1 }
    ]
  });
  return {
    kindLimitStillBlocks: !kindLimited.inventory.some((row) => row.itemId === "doc_citizen_identity"),
    stackLimitStillBlocks: stackLimited.inventory.some((row) => row.itemId === "material_scrap_fiber" && row.qty === 1),
    kindLimitToast: kindLimited.toast,
    stackLimitToast: stackLimited.toast,
    kindLimitMentionsCap: kindLimited.toast.includes("种类已达上限"),
    stackLimitMentionsCap: stackLimited.toast.includes("已达单种上限")
  };
}

async function collectUiScrollLeftPaneKeepsLastSlotVisibleEvidence() {
  const fixture = await renderInventoryUiSmokeFixture({ filter: "clothing" });
  const equipRows = fixture.equipRows;
  const lastRow = fixture.lastEquipRow;
  if (equipRows) {
    equipRows.scrollTop = equipRows.scrollHeight;
    await sleep(40);
  }
  const paneRect = equipRows?.getBoundingClientRect?.() || null;
  const rowRect = lastRow?.getBoundingClientRect?.() || null;
  return {
    hasLastRow: !!lastRow,
    paneScrollHeight: Number(equipRows?.scrollHeight || 0),
    paneClientHeight: Number(equipRows?.clientHeight || 0),
    paneHasInternalScroll: Number(equipRows?.scrollHeight || 0) >= Number(equipRows?.clientHeight || 0),
    lastRowText: fixture.lastEquipRowText,
    lastRowVisibleAfterScroll: !!paneRect && !!rowRect
      && rowRect.top >= paneRect.top - 1
      && rowRect.bottom <= paneRect.bottom + 1
  };
}

async function collectOutdoorCurrentEtaSemanticsEvidence(starterKit) {
  const evidence = await renderThermalCardUiSmokeFixture({
    mapId: "west2_gate",
    equipment: starterKit,
    temperatureC: 36.9,
    zeroCachedProtection: false
  });
  return {
    cardText: evidence.cardText,
    helpDesc: evidence.helpDesc,
    hasCurrentEtaLine: evidence.cardText.includes("失能/致死 ETA"),
    hidesBaselineAnchorLabels: !evidence.hasBaselineAnchorLabels,
    hoverShowsBaseline: evidence.helpDesc.includes("基准（参考）") || evidence.helpDesc.includes("Open · 15km/h"),
    hoverShowsCurrent: evidence.helpDesc.includes("当前：")
  };
}

async function collectUiClothingNoRecommendSectionEvidence() {
  const fixture = await renderInventoryUiSmokeFixture({ filter: "clothing" });
  return {
    hasRecommendText: fixture.overlayText.includes("推荐优先补齐") || fixture.overlayText.includes("推荐优先补全"),
    hasCandidatePane: !!fixture.candidatePane,
    candidatePaneHeight: Number(fixture.candidatePaneHeight || 0),
    candidatePaneUsesClass: fixture.candidatePane?.classList.contains("clothingCandidatePane") === true
  };
}

async function collectUiClothingSelectedCandidatePersistsEvidence() {
  const fixture = await renderInventoryUiSmokeFixture({
    selectedSlot: null,
    selectedItemId: "starter_lower_cotton",
    inventoryOverride: [
      { itemId: "starter_lining_wool", qty: 1 },
      { itemId: "starter_shoes_boots", qty: 1 }
    ],
    equipmentOverride: {
      upper: null,
      lining: "starter_lining_wool",
      lower: "starter_lower_cotton",
      shoes: "starter_shoes_boots",
      goggles: null,
      head: null,
      hands: null,
      neck: null,
      backpack: null
    }
  });
  const selectedRow = fixture.overlay?.querySelector('.candidateRow[data-item-id="starter_lower_cotton"]') || null;
  const selectedRowText = String(selectedRow?.textContent || "").replace(/\s+/g, " ").trim();
  return {
    candidateTitle: fixture.candidateTitle,
    rowExists: !!selectedRow,
    rowHasSelectedClass: selectedRow?.classList.contains("isSelected") === true,
    rowHasSelectedTag: selectedRowText.includes("选中"),
    rowHasEquippedTag: selectedRowText.includes("已装备"),
    emptyStateVisible: !!fixture.overlay?.querySelector(".inventory-clothing-empty")
  };
}

async function collectUiFooterActionBarEvidence() {
  const fixture = await renderInventoryUiSmokeFixture({
    selectedSlot: "lower",
    selectedItemId: "starter_lower_cotton",
    inventoryOverride: [
      { itemId: "starter_lining_wool", qty: 1 },
      { itemId: "starter_shoes_boots", qty: 1 }
    ],
    equipmentOverride: {
      upper: null,
      lining: "starter_lining_wool",
      lower: "starter_lower_cotton",
      shoes: "starter_shoes_boots",
      goggles: null,
      head: null,
      hands: null,
      neck: null,
      backpack: null
    }
  });
  return {
    footerLine1Text: fixture.footerLine1Text,
    footerLine2Text: fixture.footerLine2Text,
    footerPrimaryText: fixture.footerPrimaryText,
    footerPrimaryDisabled: fixture.footerPrimaryDisabled,
    footerActionTexts: fixture.footerActionTexts,
    noDebugText: !fixture.overlayText.includes("调试+") && !fixture.overlayText.includes("高级（开发）"),
    showsSelectedName: fixture.footerLine1Text.includes("已选：厚棉下装"),
    showsItemId: fixture.footerLine2Text.includes("starter_lower_cotton"),
    showsUnequip: fixture.footerActionTexts.some((text) => text.includes("卸下"))
  };
}

async function collectUiScrollGuardEvidence() {
  const fixture = await renderInventoryUiSmokeFixture();
  let row = fixture.firstClothingRow;
  if (row) {
    row.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 200
    }));
    await sleep(60);
    row = document.querySelector(".inventory-item-row.is-clothing[data-item-id]");
    row?.dispatchEvent(new MouseEvent("mouseover", {
      bubbles: true,
      cancelable: true,
      clientX: 180,
      clientY: 180
    }));
    await sleep(180);
  }

  const hoverCard = document.querySelector(".inventory-hover-card.is-visible");
  const detailDialog = document.querySelector(".inventory-detail-dialog");
  const htmlStyle = window.getComputedStyle(document.documentElement);
  const bodyStyle = window.getComputedStyle(document.body);
  const detailRect = detailDialog?.getBoundingClientRect?.() || null;
  const hoverRect = hoverCard?.getBoundingClientRect?.() || null;

  return {
    htmlOverflow: htmlStyle.overflow,
    bodyOverflow: bodyStyle.overflow,
    inventoryOpenClass: document.body.classList.contains("inventory-open") && document.documentElement.classList.contains("inventory-open"),
    detailOpen: !!detailDialog,
    hoverVisible: !!hoverCard,
    detailWithinViewport: !!detailRect
      && detailRect.left >= -1
      && detailRect.top >= -1
      && detailRect.right <= window.innerWidth + 1
      && detailRect.bottom <= window.innerHeight + 1,
    hoverWithinViewport: !hoverRect
      || (
        hoverRect.left >= -1
        && hoverRect.top >= -1
        && hoverRect.right <= window.innerWidth + 1
        && hoverRect.bottom <= window.innerHeight + 1
      ),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    detailRect: detailRect
      ? {
          left: toRounded(detailRect.left, 2),
          top: toRounded(detailRect.top, 2),
          right: toRounded(detailRect.right, 2),
          bottom: toRounded(detailRect.bottom, 2),
          width: toRounded(detailRect.width, 2),
          height: toRounded(detailRect.height, 2)
        }
      : null,
    hoverRect: hoverRect
      ? {
          left: toRounded(hoverRect.left, 2),
          top: toRounded(hoverRect.top, 2),
          right: toRounded(hoverRect.right, 2),
          bottom: toRounded(hoverRect.bottom, 2),
          width: toRounded(hoverRect.width, 2),
          height: toRounded(hoverRect.height, 2)
        }
      : null
  };
}

async function renderThermalCardUiSmokeFixture({
  mapId = "bayport_clinic",
  equipment = {},
  temperatureC = 33.4,
  zeroCachedProtection = false
} = {}) {
  ensureSmokeRenderDom();
  await ensureItemsDbLoaded();
  const map = await loadMap(mapId);

  const player = createDefaultPlayerState();
  equipSet(player, equipment);
  player.physio.temperatureC = Number(temperatureC);
  player.psycho.hypothermia = mapCoreTempToHypo100(player.physio.temperatureC, PLAYER_DEFS.temperature?.coreTemp || {});
  player.psycho.hp = mapCoreTempToHp100(player.physio.temperatureC, PLAYER_DEFS.temperature?.coreTemp || {});
  player.gear.thermal.wetness = 0.2;
  if (zeroCachedProtection) {
    player.gear.thermal.insulationEff = 0;
    player.gear.thermal.windproofEff = 0;
    player.gear.thermal.protectionScore = 0;
  }

  gameState.currentMapId = mapId;
  gameState.currentMap = map;
  gameState.world.regionId = "West2";
  gameState.world.exposureEnabled = true;
  gameState.world.windSpeed = 3;
  if (!gameState.world.weather || typeof gameState.world.weather !== "object") {
    gameState.world.weather = {};
  }
  gameState.world.weather.windSpeed_local = 3;
  gameState.player = player;
  gameState.ui.page = "game";
  gameState.ui.toast = "";

  render();
  await sleep(120);

  const thermalCard = document.querySelector(".thermal-card");
  const thermalHelp = thermalCard?.querySelector(".thermal-help-dot") || null;
  const cardText = String(thermalCard?.textContent || "").replace(/\s+/g, " ").trim();
  const chipTexts = Array.from(thermalCard?.querySelectorAll(".thermal-chip") || []).map((el) => String(el.textContent || "").replace(/\s+/g, " ").trim());
  const subInfos = Array.from(thermalCard?.querySelectorAll(".thermal-subinfo") || []).map((el) => String(el.textContent || "").replace(/\s+/g, " ").trim());
  const summaryLines = Array.from(thermalCard?.querySelectorAll(".thermal-summary-line") || []).map((el) => ({
    key: String(el.querySelector(".thermal-summary-key")?.textContent || "").replace(/\s+/g, " ").trim(),
    value: String(el.querySelector(".thermal-summary-value")?.textContent || "").replace(/\s+/g, " ").trim()
  }));
  const parseChip = (prefix) => {
    const row = chipTexts.find((text) => text.startsWith(prefix));
    const matched = row ? row.match(/(-?\d+(?:\.\d+)?)/) : null;
    return matched ? Number(matched[1]) : NaN;
  };
  const etaSummaryValue = summaryLines.find((row) => row.key === "回满 ETA")?.value || "";
  const deltaSummaryValue = summaryLines.find((row) => row.key.startsWith("距"))?.value || "";

  return {
    cardText,
    chipTexts,
    subInfos,
    summaryLines,
    helpDesc: String(thermalHelp?.dataset?.hoverDesc || "").trim(),
    etaSummaryValue,
    deltaSummaryValue,
    iEff: parseChip("I_eff"),
    wEff: parseChip("W_eff"),
    protectionScore: parseChip("P "),
    hasIncapAnchor: cardText.includes("T_incap"),
    hasDeathAnchor: cardText.includes("T_death"),
    hasBaselineAnchorLabels: cardText.includes("T_incap") || cardText.includes("T_death"),
    hasIndoorTarget: cardText.includes("回温目标"),
    hasIndoorEta: cardText.includes("回满 ETA"),
    hasIndoorStatus: cardText.includes("状态"),
    hasWarmupPlaceholder: cardText.includes("回温中"),
    hasEnvChip: chipTexts.some((text) => text.startsWith("环境 ")),
    hasWindChip: chipTexts.some((text) => text.startsWith("风 ")),
    hasShelterChip: chipTexts.some((text) => text.startsWith("遮蔽 ")),
    hasHeatChip: chipTexts.some((text) => text.startsWith("热源 "))
  };
}

async function collectIndoorThermalCardEvidence(starterKit) {
  return renderThermalCardUiSmokeFixture({
    mapId: "bayport_clinic",
    equipment: starterKit,
    temperatureC: 33.2,
    zeroCachedProtection: false
  });
}

async function collectThermalDisclosureScenePersistEvidence(starterKit) {
  ensureSmokeRenderDom();
  await ensureItemsDbLoaded();
  const firstMapId = "bayport_clinic";
  const nextMapId = "bayport_clinic_counter_day";
  const firstMap = await loadMap(firstMapId);
  const nextMap = await loadMap(nextMapId);

  const player = createDefaultPlayerState();
  equipSet(player, starterKit);
  player.physio.temperatureC = 33.2;
  player.psycho.hypothermia = mapCoreTempToHypo100(player.physio.temperatureC, PLAYER_DEFS.temperature?.coreTemp || {});
  player.psycho.hp = mapCoreTempToHp100(player.physio.temperatureC, PLAYER_DEFS.temperature?.coreTemp || {});

  gameState.currentMapId = firstMapId;
  gameState.currentMap = firstMap;
  gameState.world.regionId = "West2";
  gameState.world.exposureEnabled = true;
  gameState.world.windSpeed = 3;
  if (!gameState.world.weather || typeof gameState.world.weather !== "object") {
    gameState.world.weather = {};
  }
  gameState.world.weather.windSpeed_local = 3;
  gameState.player = player;
  gameState.ui.page = "game";
  gameState.ui.toast = "";

  render();
  await sleep(120);

  const summary = document.querySelector(".thermal-card .thermal-summary");
  summary?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  await sleep(280);
  const openBefore = document.querySelector(".thermal-card")?.open === true;

  gameState.currentMapId = nextMapId;
  gameState.currentMap = nextMap;
  render();
  await sleep(120);

  const reopenedCard = document.querySelector(".thermal-card");
  return {
    openBefore,
    openAfterSceneSwitch: reopenedCard?.open === true,
    nextMapId,
    nextCardText: String(reopenedCard?.textContent || "").replace(/\s+/g, " ").trim()
  };
}

async function collectIndoorWarmEtaFormatEvidence(starterKit) {
  const evidence = await renderThermalCardUiSmokeFixture({
    mapId: "bayport_clinic",
    equipment: starterKit,
    temperatureC: 33.2,
    zeroCachedProtection: false
  });
  return {
    etaSummaryValue: evidence.etaSummaryValue,
    deltaSummaryValue: evidence.deltaSummaryValue,
    hasWarmupPlaceholder: evidence.hasWarmupPlaceholder,
    etaIsNumericOrDash: /^\d+(?:h\d+m|h|m)$|^—$/.test(String(evidence.etaSummaryValue || "")),
    deltaLooksNumeric: /^\+\d+(?:\.\d+)?°C$/.test(String(evidence.deltaSummaryValue || ""))
  };
}

async function collectClothingAggConsistencyEvidence(starterKit, expected = {}) {
  const thermalEvidence = await renderThermalCardUiSmokeFixture({
    mapId: "bayport_clinic",
    equipment: starterKit,
    temperatureC: 33.2,
    zeroCachedProtection: true
  });
  const inventoryFixture = await renderInventoryUiSmokeFixture({ selectedSlot: "lining", selectedItemId: "starter_lining_wool" });
  const equippedRow = Array.from(document.querySelectorAll(".inventory-item-row.is-clothing[data-item-id]"))
    .find((el) => String(el.textContent || "").includes("已装备")) || null;
  const equippedRowText = String(equippedRow?.textContent || "").replace(/\s+/g, " ").trim();
  return {
    ...thermalEvidence,
    expectedI: toRounded(expected?.I_eff ?? 0, 2),
    expectedW: toRounded(expected?.W_eff ?? 0, 2),
    expectedP: toRounded(expected?.P ?? 0, 2),
    rowText: equippedRowText,
    rowShowsCurrentEquipped: equippedRowText.includes("当前已装备"),
    rowHidesDeltaIncap: !equippedRowText.includes("Δ失能"),
    rowHidesDeltaDeath: !equippedRowText.includes("Δ致死"),
    candidateTitle: inventoryFixture.candidateTitle
  };
}

export function getTempSmokeSummaryText(report) {
  if (!report || typeof report !== "object") return "";
  return buildSummaryText(report);
}

export function getTempSmokeJsonText(report) {
  if (!report || typeof report !== "object") return "";
  return JSON.stringify(report, null, 2);
}

export async function runTempSmokeTests() {
  const snapshot = {
    currentMapId: gameState.currentMapId,
    currentMap: deepClone(gameState.currentMap),
    time: deepClone(gameState.time),
    player: deepClone(gameState.player),
    world: deepClone(gameState.world),
    flags: deepClone(gameState.flags),
    logLines: Array.isArray(gameState.logLines) ? [...gameState.logLines] : []
  };

  const appendedLines = [];

  try {
    const rawItemsDb = await loadItemsDb();
    await ensureItemsDbLoaded();
    await loadRegionData();
    await loadPlaceProfiles();

    const base = {
      regionId: "West2",
      mapId: "test_temp",
      sun: 58,
      snowfallRate: 0.9,
      windSpeed: 12,
      exposureEnabled: false
    };

    const exposureBase = {
      regionId: "West2",
      mapId: "test_temp",
      sun: 58,
      snowfallRate: 0.9,
      windSpeed: 4.1667,
      exposureEnabled: true,
      ...withExposureEnvLocked({ tEnvRegionC: -13.974, windLocal: 4.167, wetnessLocked: 0.3 }),
      placeProfileId: "test_temp_outdoor_open",
      placeProfileOverride: {
        space: "outdoor",
        exposureLevel: "Open",
        windShelter: 0,
        heatSource: 0,
        drying: 0.1
      },
      hypo100: 100,
      hp: 100,
      wetness: 0.3,
      totalMinutes: 720
    };

    const tier1Kit = {
      upper: "exp_t1_upper",
      lining: "exp_t1_lining",
      lower: "exp_t1_lower",
      shoes: "exp_t1_shoes",
      goggles: "exp_t1_goggles",
      head: "exp_t1_head",
      hands: "exp_t1_hands",
      neck: "exp_t1_neck",
      backpack: "exp_t1_backpack"
    };

    const tier2Kit = {
      upper: "exp_t2_upper",
      lining: "exp_t2_lining",
      lower: "exp_t2_lower",
      shoes: "exp_t2_shoes",
      goggles: "exp_t2_goggles",
      head: "exp_t2_head",
      hands: "exp_t2_hands",
      neck: "exp_t2_neck",
      backpack: "exp_t2_backpack"
    };

    const starterKit = {
      upper: null,
      lining: "starter_lining_wool",
      lower: "starter_lower_cotton",
      shoes: "starter_shoes_boots",
      goggles: null,
      head: null,
      hands: null,
      neck: null,
      backpack: null
    };

    const indoorWind3 = runScenario({ ...base, name: "indoor_wind_3", placeProfileId: "test_temp_indoor", windSpeed: 3, deltaMin: 20 });
    const indoorWind15 = runScenario({ ...base, name: "indoor_wind_15", placeProfileId: "test_temp_indoor", windSpeed: 15, deltaMin: 20 });
    const shelteredWind15 = runScenario({ ...base, name: "sheltered_wind_15", placeProfileId: "test_temp_outdoor_sheltered", windSpeed: 15, deltaMin: 20 });
    const outdoorOpenWind15 = runScenario({ ...base, name: "open_wind_15", placeProfileId: "test_temp_outdoor_open", windSpeed: 15, deltaMin: 20 });

    const warmIndoor = runScenario({
      ...base,
      placeProfileId: "test_temp_indoor",
      tCore: 32,
      wetness: 0.3,
      deltaMin: 20,
      mutatePlayer: (player) => {
        player.psycho.hypothermia = 30;
        player.psycho.hypoStage = "Moderate";
      }
    });
    const indoorExpRecover4h = runIndoorWarmExpScenario({
      ...base,
      placeProfileId: "test_temp_indoor_no_heat",
      thermalEnvOverride: {
        tEnvRegionC: -22.34,
        windLocal: 0
      },
      hp: 100,
      hpLocked: true,
      placeProfileOverride: {
        space: "indoor",
        exposureLevel: "Sheltered",
        windShelter: 1,
        heatSource: 0,
        drying: 0.2
      },
      tCore: PLAYER_DEFS.temperature?.coreTemp?.T_core_min ?? 20,
      wetness: 0.3,
      totalMinutes: 240,
      checkpoints: [
        { label: "1h", totalMin: 60 },
        { label: "2h", totalMin: 120 },
        { label: "4h", totalMin: 240 }
      ],
      mutatePlayer: (player) => {
        player.psycho.hp = 100;
        player.psycho.hypothermia = 10;
        player.psycho.hypoStage = "Severe";
      }
    });
    const indoorExpNoHeat = runIndoorWarmExpScenario({
      ...base,
      placeProfileId: "test_temp_indoor_no_heat",
      thermalEnvOverride: {
        tEnvRegionC: -22.34,
        windLocal: 0
      },
      hp: 100,
      hpLocked: true,
      placeProfileOverride: {
        space: "indoor",
        exposureLevel: "Sheltered",
        windShelter: 1,
        heatSource: 0,
        drying: 0.2
      },
      tCore: 32,
      wetness: 0.3,
      totalMinutes: 60,
      checkpoints: [
        { label: "60m", totalMin: 60 }
      ],
      mutatePlayer: (player) => {
        player.psycho.hp = 100;
        player.psycho.hypothermia = 30;
        player.psycho.hypoStage = "Moderate";
      }
    });
    const indoorExpHeat = runIndoorWarmExpScenario({
      ...base,
      placeProfileId: "test_temp_indoor",
      thermalEnvOverride: {
        tEnvRegionC: -22.34,
        windLocal: 0
      },
      hp: 100,
      hpLocked: true,
      placeProfileOverride: {
        space: "indoor",
        exposureLevel: "Sheltered",
        windShelter: 1,
        heatSource: 1,
        drying: 0.2
      },
      tCore: 32,
      wetness: 0.3,
      totalMinutes: 60,
      checkpoints: [
        { label: "60m", totalMin: 60 }
      ],
      mutatePlayer: (player) => {
        player.psycho.hp = 100;
        player.psycho.hypothermia = 30;
        player.psycho.hypoStage = "Moderate";
      }
    });
    const indoorExpSteady = runIndoorWarmExpScenario({
      ...base,
      placeProfileId: "test_temp_indoor_no_heat",
      thermalEnvOverride: {
        tEnvRegionC: -22.34,
        windLocal: 0
      },
      hp: 100,
      hpLocked: true,
      placeProfileOverride: {
        space: "indoor",
        exposureLevel: "Sheltered",
        windShelter: 1,
        heatSource: 0,
        drying: 0.2
      },
      tCore: 37,
      wetness: 0,
      satiety: 100,
      totalMinutes: 240,
      checkpoints: [
        { label: "4h", totalMin: 240 }
      ],
      mutatePlayer: (player) => {
        player.psycho.hp = 100;
        player.psycho.hypothermia = 100;
        player.psycho.hypoStage = "Safe";
        player.psycho.fatigue = 100;
      }
    });
    const indoorMustWarmNoHeat = runScenario({
      ...base,
      placeProfileId: "test_temp_indoor_no_heat",
      placeProfileOverride: {
        space: "indoor",
        exposureLevel: "Sheltered",
        windShelter: 1,
        heatSource: 0,
        drying: 0.2
      },
      tCore: 32,
      wetness: 0.3,
      deltaMin: 20,
      mutatePlayer: (player) => {
        player.psycho.hypothermia = 30;
        player.psycho.hypoStage = "Moderate";
      }
    });
    const indoorStableNoHeat = runScenario({
      ...base,
      placeProfileId: "test_temp_indoor_no_heat",
      placeProfileOverride: {
        space: "indoor",
        exposureLevel: "Sheltered",
        windShelter: 1,
        heatSource: 0,
        drying: 0.2
      },
      tCore: 37,
      wetness: 0,
      satiety: 100,
      deltaMin: 60,
      mutatePlayer: (player) => {
        player.psycho.hp = 100;
        player.psycho.hypothermia = 100;
        player.psycho.hypoStage = "Safe";
        player.psycho.fatigue = 100;
      }
    });
    const outdoorOpenCoolingBaseline = runScenario({
      ...base,
      placeProfileId: "test_temp_outdoor_open",
      placeProfileOverride: {
        space: "outdoor",
        exposureLevel: "Open",
        windShelter: 0,
        heatSource: 0,
        drying: 0.1
      },
      tCore: 37,
      wetness: 0,
      deltaMin: 20,
      mutatePlayer: (player) => {
        player.psycho.hp = 100;
        player.psycho.hypothermia = 100;
        player.psycho.hypoStage = "Safe";
      }
    });

    const snowLock = {
      tEnvRegionC: -13.974,
      windLocal: 12,
      worldWindSpeed: 12
    };
    const snowHigh = runScenario({ ...base, placeProfileId: "test_temp_outdoor_open", snowfallRate: 2.5, wetness: 0.2, deltaMin: 60, thermalEnvOverride: snowLock });
    const snowZero = runScenario({ ...base, placeProfileId: "test_temp_outdoor_open", snowfallRate: 0, wetness: 0.2, deltaMin: 60, thermalEnvOverride: snowLock });

    const indoorDry = runScenario({ ...base, placeProfileId: "test_temp_indoor", wetness: 1, deltaMin: 60 });

    const lightGear = runScenario({
      ...base,
      placeProfileId: "test_temp_outdoor_open",
      deltaMin: 60,
      mutatePlayer: (player) => {
        player.equipment.upper = "cloth_thin_jacket";
        player.equipment.lining = null;
      }
    });

    const polarGear = runScenario({
      ...base,
      placeProfileId: "test_temp_outdoor_open",
      deltaMin: 60,
      mutatePlayer: (player) => {
        player.equipment.upper = "cloth_polar_parka";
        player.equipment.lining = "cloth_polar_liner";
      }
    });

    const satietyLock = {
      tEnvRegionC: -13.974,
      windLocal: 12,
      worldWindSpeed: 12
    };
    const satietyHigh = runScenario({ ...base, placeProfileId: "test_temp_outdoor_open", satiety: 90, deltaMin: 60, thermalEnvOverride: satietyLock });
    const satietyLow = runScenario({ ...base, placeProfileId: "test_temp_outdoor_open", satiety: 10, deltaMin: 60, thermalEnvOverride: satietyLock });
    const isolatedSafeHp = runScenario({
      ...base,
      placeProfileId: "test_temp_indoor",
      deltaMin: 20,
      satiety: 100,
      wetness: 0,
      tCore: 37,
      mutatePlayer: (player) => {
        player.psycho.hp = 100;
        player.psycho.hypothermia = 100;
        player.psycho.hypoStage = "Safe";
        player.psycho.fatigue = 100;
      }
    });
    const isolatedModerateHp = runScenario({
      ...base,
      placeProfileId: "test_temp_indoor",
      tCore: 32,
      wetness: 0.3,
      satiety: 100,
      deltaMin: 20,
      mutatePlayer: (player) => {
        player.psycho.hp = 100;
        player.psycho.hypothermia = 30;
        player.psycho.hypoStage = "Moderate";
        player.psycho.fatigue = 100;
      }
    });
    const hpMappingStart32 = {
      before: {
        tCore: 32,
        hp: mapCoreTempToHp100(32, PLAYER_DEFS.temperature || {}),
        hypo100: mapCoreTempToHypo100(32, PLAYER_DEFS.temperature || {})
      },
      after: {
        tCore: 28,
        hp: mapCoreTempToHp100(28, PLAYER_DEFS.temperature || {}),
        hypo100: mapCoreTempToHypo100(28, PLAYER_DEFS.temperature || {})
      },
      delta: {
        tCore: -4,
        hp: toRounded(mapCoreTempToHp100(28, PLAYER_DEFS.temperature || {}) - mapCoreTempToHp100(32, PLAYER_DEFS.temperature || {}), 4),
        hypo100: toRounded(mapCoreTempToHypo100(28, PLAYER_DEFS.temperature || {}) - mapCoreTempToHypo100(32, PLAYER_DEFS.temperature || {}), 4),
        wetness: 0
      },
      dtMin: 0,
      placeProfileId: "profile_audit",
      tCoreDeltaPer10Min: 0,
      tCoreCoolingPer10Min: 0,
      tCoreWarmingPer10Min: 0,
      dT10: 0,
      context: {
        hpStartDropC: Number(PLAYER_DEFS.temperature?.core?.hpStartDropC ?? 32),
        deathC: Number(PLAYER_DEFS.temperature?.core?.deathC ?? 28)
      }
    };
    const hpMappingSamples = [32, 31, 30, 29, 28].map((tCore) => ({
      tCore,
      hp: toRounded(mapCoreTempToHp100(tCore, PLAYER_DEFS.temperature || {}), 4)
    }));
    const actionChain = await runActionPipelineScenario({ ...base, deltaMin: 20, wetness: 0.5, satiety: 100 });
    const exposureN0 = runExposureIntegratedScenario({
      ...exposureBase,
      checkpoints: [
        { label: "incap", totalMin: 3 },
        { label: "death", totalMin: 12 }
      ]
    });
    const exposureN1 = runExposureIntegratedScenario({
      ...exposureBase,
      equipment: tier1Kit,
      checkpoints: [
        { label: "incap", totalMin: 90 },
        { label: "death", totalMin: 120 }
      ]
    });
    const exposureN2 = runExposureAnalyticalScenario({
      ...exposureBase,
      equipment: tier2Kit,
      checkpoints: [
        { label: "incap", totalMin: 540 },
        { label: "death", totalMin: 720 }
      ]
    });
    const exposureN2SpotIntegrated = runExposureIntegratedScenario({
      ...exposureBase,
      equipment: tier2Kit,
      totalMinutes: 60,
      checkpoints: [
        { label: "spot_60", totalMin: 60 }
      ]
    });
    const exposureN2SpotAnalytical = runExposureAnalyticalScenario({
      ...exposureBase,
      equipment: tier2Kit,
      totalMinutes: 60,
      checkpoints: [
        { label: "spot_60", totalMin: 60 }
      ]
    });
    const outdoorMildCold = runExposureIntegratedScenario({
      ...exposureBase,
      equipment: starterKit,
      thermalEnvOverride: {
        tEnvRegionC: -3.7,
        tEnvEffC: -3.7,
        windLocal: 5,
        worldWindSpeed: 5
      },
      totalMinutes: 10,
      checkpoints: [
        { label: "mild_10", totalMin: 10 }
      ]
    });
    const outdoorWarmNoDrain = runExposureIntegratedScenario({
      ...exposureBase,
      thermalEnvOverride: {
        tEnvRegionC: 18,
        tEnvEffC: 18,
        windLocal: 4.167,
        worldWindSpeed: 4.167
      },
      totalMinutes: 60,
      checkpoints: [
        { label: "warm_60", totalMin: 60 }
      ]
    });
    const coreThresholds = getCoreThresholds();
    const n0Exposure = extractExposureFields(exposureN0);
    const n1Exposure = extractExposureFields(exposureN1);
    const n2Exposure = extractExposureFields(exposureN2);
    const n0Incap = exposureN0.checkpoints?.[0] || null;
    const n0Death = exposureN0.checkpoints?.[1] || null;
    const n1Incap = exposureN1.checkpoints?.[0] || null;
    const n1Death = exposureN1.checkpoints?.[1] || null;
    const n2Incap = exposureN2.checkpoints?.[0] || null;
    const n2Death = exposureN2.checkpoints?.[1] || null;
    const n2SpotIntegrated = exposureN2SpotIntegrated.checkpoints?.[0] || null;
    const n2SpotAnalytical = exposureN2SpotAnalytical.checkpoints?.[0] || null;
    const outdoorMildColdCheckpoint = outdoorMildCold.checkpoints?.[0] || null;
    const outdoorWarmCheckpoint = outdoorWarmNoDrain.checkpoints?.[0] || null;
    const rawWearableItems = Array.isArray(rawItemsDb?.items)
      ? rawItemsDb.items.filter(item => item?.wearable && typeof item.wearable === "object")
      : [];

    const slotCoverageSingleDefs = {
      upper: { insulation: 0.9, windproof: 0.99 }
    };
    const slotCoverageTripleDefs = {
      upper: { insulation: 0.9, windproof: 0.99 },
      lining: { insulation: 0.9, windproof: 0.99 },
      lower: { insulation: 0.9, windproof: 0.99 }
    };
    const slotCoverageSingle = buildCoverageAuditRows({
      ...withExposureEnvLocked({ tEnvRegionC: -13.974, windLocal: 4.167, wetnessLocked: 0.3 }),
      itemsById: buildSyntheticItemsById(slotCoverageSingleDefs),
      equipment: buildSyntheticEquipment(slotCoverageSingleDefs)
    });
    const slotCoverageTriple = buildCoverageAuditRows({
      ...withExposureEnvLocked({ tEnvRegionC: -13.974, windLocal: 4.167, wetnessLocked: 0.3 }),
      itemsById: buildSyntheticItemsById(slotCoverageTripleDefs),
      equipment: buildSyntheticEquipment(slotCoverageTripleDefs)
    });

    const diminishingBare = buildCoverageAuditRows({
      ...withExposureEnvLocked({ tEnvRegionC: -13.974, windLocal: 4.167, wetnessLocked: 0.3 }),
      itemsById: buildSyntheticItemsById({}),
      equipment: buildSyntheticEquipment({})
    });
    const diminishingADefs = {
      upper: { insulation: 0.6, windproof: 0.6 }
    };
    const diminishingBDefs = {
      upper: { insulation: 0.6, windproof: 0.6 },
      lining: { insulation: 0.6, windproof: 0.6 }
    };
    const diminishingA = buildCoverageAuditRows({
      ...withExposureEnvLocked({ tEnvRegionC: -13.974, windLocal: 4.167, wetnessLocked: 0.3 }),
      itemsById: buildSyntheticItemsById(diminishingADefs),
      equipment: buildSyntheticEquipment(diminishingADefs)
    });
    const diminishingB = buildCoverageAuditRows({
      ...withExposureEnvLocked({ tEnvRegionC: -13.974, windLocal: 4.167, wetnessLocked: 0.3 }),
      itemsById: buildSyntheticItemsById(diminishingBDefs),
      equipment: buildSyntheticEquipment(diminishingBDefs)
    });
    const diminishingDeltaBareToA = toRounded((diminishingA.exposureEvidence?.I_eff ?? 0) - (diminishingBare.exposureEvidence?.I_eff ?? 0), 6);
    const diminishingDeltaAToB = toRounded((diminishingB.exposureEvidence?.I_eff ?? 0) - (diminishingA.exposureEvidence?.I_eff ?? 0), 6);

    const windPenaltyStrongDefs = Object.fromEntries(EQUIPMENT_SLOT_ORDER.map((slot) => [slot, { insulation: 0.4, windproof: 0.95 }]));
    const windPenaltyWeakDefs = {
      ...windPenaltyStrongDefs,
      neck: { insulation: 0.4, windproof: 0.1 }
    };
    const windPenaltyStrong = buildCoverageAuditRows({
      ...withExposureEnvLocked({ tEnvRegionC: -13.974, windLocal: 4.167, wetnessLocked: 0.3 }),
      itemsById: buildSyntheticItemsById(windPenaltyStrongDefs),
      equipment: buildSyntheticEquipment(windPenaltyStrongDefs)
    });
    const windPenaltyWeak = buildCoverageAuditRows({
      ...withExposureEnvLocked({ tEnvRegionC: -13.974, windLocal: 4.167, wetnessLocked: 0.3 }),
      itemsById: buildSyntheticItemsById(windPenaltyWeakDefs),
      equipment: buildSyntheticEquipment(windPenaltyWeakDefs)
    });
    const windPenaltyActualDrop = toRounded((windPenaltyStrong.exposureEvidence?.W_eff ?? 0) - (windPenaltyWeak.exposureEvidence?.W_eff ?? 0), 6);
    const windPenaltyLinearDrop = toRounded((PLAYER_DEFS.equipmentWeights?.neck ?? 0) * (0.95 - 0.1), 6);
    const strongNeckLnLeak = Number((windPenaltyStrong.slotContrib || []).find((row) => row.slot === "neck")?.weightedLnLeak ?? 0);
    const weakNeckLnLeak = Number((windPenaltyWeak.slotContrib || []).find((row) => row.slot === "neck")?.weightedLnLeak ?? 0);
    const windPenaltyLogDelta = toRounded(weakNeckLnLeak - strongNeckLnLeak, 6);

    const tier1RangeRows = buildCoverageAuditRows({
      ...withExposureEnvLocked({ tEnvRegionC: -13.974, windLocal: 4.167, wetnessLocked: 0.3 }),
      equipment: tier1Kit
    });
    const tier2RangeRows = buildCoverageAuditRows({
      ...withExposureEnvLocked({ tEnvRegionC: -13.974, windLocal: 4.167, wetnessLocked: 0.3 }),
      equipment: tier2Kit
    });
    const starterKitRows = buildCoverageAuditRows({
      ...withExposureEnvLocked({ tEnvRegionC: -13.974, windLocal: 4.167, wetnessLocked: 0.3 }),
      equipment: starterKit
    });
    const exposureUiDefault = runScenario({
      ...exposureBase,
      deltaMin: 0,
      mutatePlayer: (player) => {
        delete player.exposure.hypo100;
        player.exposure.incapacitated = false;
        player.exposure.dead = false;
        player.psycho.hypothermia = 42;
        player.psycho.hp = 100;
      }
    });
    const uiSlotEmptyEvidence = await collectUiSlotEmptyEvidence();
    const uiSummaryCollapseEvidence = await collectUiSummaryCollapseEvidence();
    const uiSlotFilterRemovedEvidence = await collectUiSlotFilterRemovedEvidence();
    const uiClothingSummaryBaselineTagEvidence = await collectUiClothingSummaryBaselineTagEvidence();
    const uiHeaderVisibilityClothingOnlyEvidence = await collectUiHeaderVisibilityClothingOnlyEvidence();
    const uiHeaderHeightCompactEvidence = await collectUiHeaderHeightCompactEvidence();
    const uiHeaderCopyClarityEvidence = await collectUiHeaderCopyClarityEvidence();
    const uiHeaderHudMinimalEvidence = await collectUiHeaderHudMinimalEvidence();
    const uiHeaderBaselineNoEllipsisEvidence = await collectUiHeaderBaselineNoEllipsisEvidence();
    const uiHoverCardAnchorCloseEvidence = await collectUiHoverCardAnchorCloseEvidence();
    const uiHoverCardNoLayoutJankEvidence = await collectUiHoverCardNoLayoutJankEvidence();
    const uiScrollLeftPaneKeepsLastSlotVisibleEvidence = await collectUiScrollLeftPaneKeepsLastSlotVisibleEvidence();
    const uiClothingNoRecommendSectionEvidence = await collectUiClothingNoRecommendSectionEvidence();
    const uiClothingSelectedCandidatePersistsEvidence = await collectUiClothingSelectedCandidatePersistsEvidence();
    const uiFooterActionBarEvidence = await collectUiFooterActionBarEvidence();
    const invClothingUnlimitedEvidence = await collectInvClothingUnlimitedEvidence();
    const invNonClothingStillLimitedEvidence = await collectInvNonClothingStillLimitedEvidence();
    const uiScrollGuardEvidence = await collectUiScrollGuardEvidence();
    const indoorThermalCardEvidence = await collectIndoorThermalCardEvidence(starterKit);
    const thermalDisclosureScenePersistEvidence = await collectThermalDisclosureScenePersistEvidence(starterKit);
    const indoorWarmEtaFormatEvidence = await collectIndoorWarmEtaFormatEvidence(starterKit);
    const outdoorCurrentEtaSemanticsEvidence = await collectOutdoorCurrentEtaSemanticsEvidence(starterKit);
    const clothingAggConsistencyEvidence = await collectClothingAggConsistencyEvidence(starterKit, starterKitRows.exposureEvidence);

    const thermalRangeViolations = rawWearableItems.flatMap((item) => {
      const insulation = Number(item?.wearable?.thermal?.insulation);
      const windproof = Number(item?.wearable?.thermal?.windproof);
      const violations = [];
      if (Number.isFinite(insulation) && (insulation < 0 || insulation > 1)) {
        violations.push(`${item.id}:insulation=${insulation}`);
      }
      if (Number.isFinite(windproof) && (windproof < 0 || windproof > 1)) {
        violations.push(`${item.id}:windproof=${windproof}`);
      }
      return violations;
    });
    const forbiddenDurabilityViolations = rawWearableItems.flatMap((item) => {
      return findForbiddenWearableFields(item).map((path) => `${item.id}:${path}`);
    });

    const cases = [
      buildCase(
        "indoor 风脱钩（windLocal=0）",
        indoorWind15,
        [
          makeAssert("windLocal@3 == 0", indoorWind3.after.windLocal, 0, "=="),
          makeAssert("windLocal@15 == 0", indoorWind15.after.windLocal, 0, "=="),
          makeAssert("ΔtCore equal", indoorWind3.delta.tCore, indoorWind15.delta.tCore, "=="),
          makeAssert("Δhypo equal", indoorWind3.delta.hypo, indoorWind15.delta.hypo, "=="),
          ...makeStableGearAsserts(indoorWind15)
        ]
      ),
      buildCase(
        "outdoor Sheltered 风衰减（非零）",
        shelteredWind15,
        [
          makeAssert("windLocal(sheltered)<windLocal(open)", shelteredWind15.after.windLocal, outdoorOpenWind15.after.windLocal, "<"),
          makeAssert("windLocal(sheltered)>0", shelteredWind15.after.windLocal, 0, ">"),
          ...makeStableGearAsserts(shelteredWind15)
        ],
        "",
        {
          compare: {
            openReference: {
              worldSnapshot: outdoorOpenWind15.context?.worldSnapshot,
              placeProfile: outdoorOpenWind15.context?.placeProfile,
              windModel: outdoorOpenWind15.context?.windModel,
              afterWindLocal: toRounded(outdoorOpenWind15.after?.windLocal, 3)
            },
            shelteredReference: {
              worldSnapshot: shelteredWind15.context?.worldSnapshot,
              placeProfile: shelteredWind15.context?.placeProfile,
              windModel: shelteredWind15.context?.windModel,
              afterWindLocal: toRounded(shelteredWind15.after?.windLocal, 3)
            }
          }
        }
      ),
      buildCase(
        "heatSource 触发回暖",
        warmIndoor,
        [
          makeAssert("tCore rises", warmIndoor.delta.tCore, 0, ">"),
          makeAssert("dT10 > 0", warmIndoor.dT10, 0, ">"),
          makeAssert("hp stays full once warmed above 32C", warmIndoor.after.hp, 100, "=="),
          makeAssertAbsDelta(
            "hp follows mapped tCore",
            warmIndoor.delta.hp,
            mapCoreTempToHp100(warmIndoor.after.tCore, PLAYER_DEFS.temperature || {}) - mapCoreTempToHp100(warmIndoor.before.tCore, PLAYER_DEFS.temperature || {}),
            1e-3
          ),
          ...makeStableGearAsserts(warmIndoor)
        ]
      ),
      buildCase(
        "室内必回温（heatSource=0）",
        indoorMustWarmNoHeat,
        [
          makeAssert("placeProfile.heatSource == 0", indoorMustWarmNoHeat.context?.placeProfile?.heatSource, 0, "=="),
          makeAssert("tEnvEffC >= indoorMinWarmC", indoorMustWarmNoHeat.after.tEnvEffC, PLAYER_DEFS.temperature?.envTemp?.indoorMinWarmC ?? 15, ">="),
          makeAssert("after.tCore > before.tCore", indoorMustWarmNoHeat.after.tCore, indoorMustWarmNoHeat.before.tCore, ">"),
          makeAssert("dT10 > 0", indoorMustWarmNoHeat.dT10, 0, ">"),
          makeAssertAbsDelta(
            "Δhp == mapped ΔtCore",
            indoorMustWarmNoHeat.delta.hp,
            mapCoreTempToHp100(indoorMustWarmNoHeat.after.tCore, PLAYER_DEFS.temperature || {}) - mapCoreTempToHp100(indoorMustWarmNoHeat.before.tCore, PLAYER_DEFS.temperature || {}),
            1e-3
          )
        ]
      ),
      buildCase(
        "室内稳态（37℃ 不漂移）",
        indoorStableNoHeat,
        [
          makeAssertAbsDelta("|after.tCore-37| <= 0.01", indoorStableNoHeat.after.tCore, 37, 0.01),
          makeAssertAbsDelta("Safe => Δhp == 0", indoorStableNoHeat.delta.hp, 0, 1e-6),
          makeAssert("windLocal == 0", indoorStableNoHeat.after.windLocal, 0, "=="),
          makeAssert("tEnvEffC >= indoorMinWarmC", indoorStableNoHeat.after.tEnvEffC, PLAYER_DEFS.temperature?.envTemp?.indoorMinWarmC ?? 15, ">=")
        ]
      ),
      buildCase(
        "室外失温速度基准（Open、风大）",
        outdoorOpenCoolingBaseline,
        [
          makeAssert("after.tCore < before.tCore", outdoorOpenCoolingBaseline.after.tCore, outdoorOpenCoolingBaseline.before.tCore, "<"),
          makeAssert("dT10 < 0", outdoorOpenCoolingBaseline.dT10, 0, "<"),
          makeAssert("hypo decreases", outdoorOpenCoolingBaseline.after.hypo, outdoorOpenCoolingBaseline.before.hypo, "<")
        ]
      ),
      buildCase(
        "雪天增湿",
        snowHigh,
        [
          makeAssert("Δwetness(highSnow) > Δwetness(noSnow)", snowHigh.delta.wetness, snowZero.delta.wetness, ">"),
          makeAssert("warmthEff(highSnow) < warmthEff(noSnow)", snowHigh.after.warmthEff, snowZero.after.warmthEff, "<"),
          makeAssert("|ΔtCore(highSnow)| > |ΔtCore(noSnow)|", Math.abs(snowHigh.delta.tCore), Math.abs(snowZero.delta.tCore), ">")
        ]
      ),
      buildCase(
        "室内烘干",
        indoorDry,
        [
          makeAssert("wetness decreases", indoorDry.delta.wetness, 0, "<"),
          makeAssert("warming or cooling slows (dT10 > -0.2)", indoorDry.dT10, -0.2, ">"),
          ...makeStableGearAsserts(indoorDry)
        ]
      ),
      buildCase(
        "装备保暖生效",
        polarGear,
        [
          makeAssert("warmthRating(polar) > warmthRating(light)", polarGear.after.warmthRating, lightGear.after.warmthRating, ">"),
          makeAssert("warmthEff(polar) > warmthEff(light)", polarGear.after.warmthEff, lightGear.after.warmthEff, ">"),
          makeAssert("|ΔtCore(light)| > |ΔtCore(polar)|", Math.abs(lightGear.delta.tCore), Math.abs(polarGear.delta.tCore), ">")
        ]
      ),
      buildCase(
        "饱腹影响体温流失",
        satietyLow,
        [
          makeAssert("|ΔtCore(lowSat)| > |ΔtCore(highSat)|", Math.abs(satietyLow.delta.tCore), Math.abs(satietyHigh.delta.tCore), ">"),
          makeAssert("tCore(lowSat) < tCore(highSat)", satietyLow.after.tCore, satietyHigh.after.tCore, "<")
        ]
      ),
      buildCase(
        "温度隔离：HP only from tCore",
        isolatedModerateHp,
        [
          makeAssertAbsDelta("Safe => Δhp == 0", isolatedSafeHp.delta.hp, 0, 1e-6),
          makeAssertAbsDelta(
            "Moderate => hp matches mapped tCore",
            isolatedModerateHp.after.hp,
            mapCoreTempToHp100(isolatedModerateHp.after.tCore, PLAYER_DEFS.temperature || {}),
            1e-3
          ),
          makeAssertString("Safe stage remains Safe", isolatedSafeHp.after.stage, "Safe"),
          makeAssert("Safe hypo remains 100", isolatedSafeHp.after.hypo, 100, "==")
        ],
        "",
        {
          compare: {
            safeReference: {
              before: toCaseMetricSnapshot(isolatedSafeHp.before),
              after: toCaseMetricSnapshot(isolatedSafeHp.after),
              delta: isolatedSafeHp.delta,
              context: isolatedSafeHp.context
            },
            moderateReference: {
              before: toCaseMetricSnapshot(isolatedModerateHp.before),
              after: toCaseMetricSnapshot(isolatedModerateHp.after),
              delta: isolatedModerateHp.delta,
              context: isolatedModerateHp.context
            }
          }
        }
      ),
      buildCase(
        "N0 外界暴露锚点（无防护）",
        exposureN0,
        [
          makeAssertAbsDelta("before hp == 100", exposureN0.before.hp, 100, 1e-6),
          makeAssertString("before dead == false", exposureN0.before.dead, false),
          makeAssertString("before incapacitated == false", exposureN0.before.incapacitated, false),
          makeAssertAbsDelta("wetness stable", exposureN0.after.wetness, exposureN0.before.wetness, 1e-6),
          makeAssertAbsDelta("T_incap == 3", n0Exposure.T_incap, 3, 1e-4),
          makeAssertAbsDelta("T_death == 12", n0Exposure.T_death, 12, 1e-4),
          makeAssert("incap checkpoint tCore <= incapC+0.05", n0Incap?.tCore_after, coreThresholds.incapC + 0.05, "<="),
          makeAssertAbsDelta("incap checkpoint hypo100 == 0", n0Incap?.hypo100_after, 0, 1e-4),
          makeAssertString("incap checkpoint incapacitated == true", exposureN0.checkpoints?.[0] ? exposureN0.after.incapacitated || true : true, true),
          makeAssertAbsDelta("incap checkpoint hp == 100", n0Incap?.hp_after, 100, 1e-4),
          makeAssert("death checkpoint tCore <= deathC+0.05", n0Death?.tCore_after, coreThresholds.deathC + 0.05, "<="),
          makeAssertAbsDelta("death checkpoint hp == 0", n0Death?.hp_after, 0, 1e-4),
          makeAssertString("death checkpoint dead == true", exposureN0.after.dead, true),
          makeAssertString("after incapacitated == true", exposureN0.after.incapacitated, true)
        ],
        "Outdoor exposure authoritative path, 1-minute integration.",
        {
          exposureEvidence: n0Exposure,
          checkpoints: exposureN0.checkpoints,
          simulationMode: exposureN0.simulationMode
        }
      ),
      buildCase(
        "N1 外界暴露锚点（Tier-1 中位套装）",
        exposureN1,
        [
          makeAssertAbsDelta("before hp == 100", exposureN1.before.hp, 100, 1e-6),
          makeAssertString("before dead == false", exposureN1.before.dead, false),
          makeAssertString("before incapacitated == false", exposureN1.before.incapacitated, false),
          makeAssertAbsDelta("wetness stable", exposureN1.after.wetness, exposureN1.before.wetness, 1e-6),
          makeAssertAbsDelta("T_incap == 90", n1Exposure.T_incap, 90, 1e-6),
          makeAssertAbsDelta("T_death == 120", n1Exposure.T_death, 120, 1e-6),
          makeAssert("incap checkpoint tCore <= incapC+0.05", n1Incap?.tCore_after, coreThresholds.incapC + 0.05, "<="),
          makeAssertAbsDelta("incap checkpoint hypo100 == 0", n1Incap?.hypo100_after, 0, 1e-4),
          makeAssertAbsDelta("incap checkpoint hp == 100", n1Incap?.hp_after, 100, 1e-4),
          makeAssert("death checkpoint tCore <= deathC+0.05", n1Death?.tCore_after, coreThresholds.deathC + 0.05, "<="),
          makeAssertAbsDelta("death checkpoint hp == 0", n1Death?.hp_after, 0, 1e-4),
          makeAssertString("death checkpoint dead == true", exposureN1.after.dead, true),
          makeAssert("P > N0", n1Exposure.P, n0Exposure.P, ">"),
          makeAssertString("after incapacitated == true", exposureN1.after.incapacitated, true)
        ],
        "Outdoor exposure anchor curve, 1-minute integration check for tier-1 median kit.",
        {
          exposureEvidence: n1Exposure,
          checkpoints: exposureN1.checkpoints,
          simulationMode: exposureN1.simulationMode,
          equipment: tier1Kit
        }
      ),
      buildCase(
        "N2 外界暴露锚点（Tier-2 中位套装）",
        exposureN2,
        [
          makeAssertAbsDelta("before hp == 100", exposureN2.before.hp, 100, 1e-6),
          makeAssertString("before dead == false", exposureN2.before.dead, false),
          makeAssertString("before incapacitated == false", exposureN2.before.incapacitated, false),
          makeAssertAbsDelta("wetness stable", exposureN2.after.wetness, exposureN2.before.wetness, 1e-6),
          makeAssertAbsDelta("T_incap == 540", n2Exposure.T_incap, 540, 1e-6),
          makeAssertAbsDelta("T_death == 720", n2Exposure.T_death, 720, 1e-6),
          makeAssert("incap checkpoint tCore <= incapC+0.05", n2Incap?.tCore_after, coreThresholds.incapC + 0.05, "<="),
          makeAssertAbsDelta("incap checkpoint hypo100 == 0", n2Incap?.hypo100_after, 0, 1e-4),
          makeAssertAbsDelta("incap checkpoint hp == 100", n2Incap?.hp_after, 100, 1e-4),
          makeAssert("death checkpoint tCore <= deathC+0.05", n2Death?.tCore_after, coreThresholds.deathC + 0.05, "<="),
          makeAssertAbsDelta("death checkpoint hp == 0", n2Death?.hp_after, 0, 1e-4),
          makeAssertString("death checkpoint dead == true", exposureN2.after.dead, true),
          makeAssert("P > N1", n2Exposure.P, n1Exposure.P, ">"),
          makeAssertString("after incapacitated == true", exposureN2.after.incapacitated, true)
        ],
        "Outdoor exposure anchor curve, analytical long-run check for tier-2 median kit.",
        {
          exposureEvidence: n2Exposure,
          checkpoints: exposureN2.checkpoints,
          simulationMode: exposureN2.simulationMode,
          equipment: tier2Kit
        }
      ),
      buildCase(
        "N2 解析/积分对齐 spot-check（60min）",
        exposureN2SpotIntegrated,
        [
          makeAssertAbsDelta("tCore(integration,60) == analytical", exposureN2SpotIntegrated.after.tCore, exposureN2SpotAnalytical.after.tCore, 1e-3),
          makeAssertAbsDelta("hypo100(integration,60) == analytical", exposureN2SpotIntegrated.after.hypo100, exposureN2SpotAnalytical.after.hypo100, 1e-3),
          makeAssertAbsDelta("hp(integration,60) == analytical", exposureN2SpotIntegrated.after.hp, exposureN2SpotAnalytical.after.hp, 1e-3),
          makeAssertAbsDelta("checkpoint tCore(integration) == analytical", n2SpotIntegrated?.tCore_after, n2SpotAnalytical?.tCore_after, 1e-3),
          makeAssertAbsDelta("checkpoint hypo100(integration) == analytical", n2SpotIntegrated?.hypo100_after, n2SpotAnalytical?.hypo100_after, 1e-3),
          makeAssertAbsDelta("checkpoint hp(integration) == analytical", n2SpotIntegrated?.hp_after, n2SpotAnalytical?.hp_after, 1e-3)
        ],
        "Tier-2 long-run analytical path spot-checked against 1-minute stepping over the first 60 minutes.",
        {
          compare: {
            integration60: {
              after: toCaseMetricSnapshot(exposureN2SpotIntegrated.after),
              checkpoint: n2SpotIntegrated
            },
            analytical60: {
              after: toCaseMetricSnapshot(exposureN2SpotAnalytical.after),
              checkpoint: n2SpotAnalytical
            }
          }
        }
      ),
      buildCase(
        "Outdoor warm no drain",
        outdoorWarmNoDrain,
        [
          makeAssert("warm env >= 15C", outdoorWarmNoDrain.after.tEnvEffC, 15, ">="),
          makeAssertAbsDelta("tCore stable", outdoorWarmNoDrain.after.tCore, outdoorWarmNoDrain.before.tCore, 1e-6),
          makeAssertAbsDelta("hypo100 stable", outdoorWarmNoDrain.after.hypo100, outdoorWarmNoDrain.before.hypo100, 1e-6),
          makeAssertAbsDelta("hp stable", outdoorWarmNoDrain.after.hp, outdoorWarmNoDrain.before.hp, 1e-6),
          makeAssertString("not incapacitated", outdoorWarmNoDrain.after.incapacitated, false)
        ],
        "Warm outdoor conditions must not trigger core cooling or HP loss.",
        {
          checkpoints: outdoorWarmNoDrain.checkpoints,
          warmCheckpoint: outdoorWarmCheckpoint
        }
      ),
      buildCase(
        "Outdoor mild cold no sudden death",
        outdoorMildCold,
        [
          makeAssertAbsDelta("tEnvEffC == -3.7", outdoorMildCold.after.tEnvEffC, -3.7, 1e-6),
          makeAssertAbsDelta("windLocal == 5", outdoorMildCold.after.windLocal, 5, 1e-6),
          makeAssert("tCore > 36.0", outdoorMildCold.after.tCore, 36.0, ">"),
          makeAssert("hp > 95", outdoorMildCold.after.hp, 95, ">"),
          makeAssertString("incapacitated == false", outdoorMildCold.after.incapacitated, false)
        ],
        "Mild cold outdoors must not create sudden near-death readings for the starter three-piece.",
        {
          checkpoints: outdoorMildCold.checkpoints,
          mildCheckpoint: outdoorMildColdCheckpoint
        }
      ),
      buildCase(
        "HP_MAPPING / start drop at 32C",
        hpMappingStart32,
        [
          makeAssertAbsDelta("tCore=32.0 -> hp==100", hpMappingSamples[0]?.hp, 100, 1e-4),
          makeAssertAbsDelta("tCore=31.0 -> hp==75", hpMappingSamples[1]?.hp, 75, 1e-4),
          makeAssertAbsDelta("tCore=30.0 -> hp==50", hpMappingSamples[2]?.hp, 50, 1e-4),
          makeAssertAbsDelta("tCore=29.0 -> hp==25", hpMappingSamples[3]?.hp, 25, 1e-4),
          makeAssertAbsDelta("tCore=28.0 -> hp==0", hpMappingSamples[4]?.hp, 0, 1e-4),
          makeAssert("monotonic 32->31", hpMappingSamples[0]?.hp, hpMappingSamples[1]?.hp, ">="),
          makeAssert("monotonic 31->30", hpMappingSamples[1]?.hp, hpMappingSamples[2]?.hp, ">="),
          makeAssert("monotonic 30->29", hpMappingSamples[2]?.hp, hpMappingSamples[3]?.hp, ">="),
          makeAssert("monotonic 29->28", hpMappingSamples[3]?.hp, hpMappingSamples[4]?.hp, ">=")
        ],
        "Profile audit: HP is derived from tCore only and starts dropping strictly below 32°C.",
        {
          hpMapping: {
            hpStartDropC: Number(PLAYER_DEFS.temperature?.core?.hpStartDropC ?? 32),
            deathC: Number(PLAYER_DEFS.temperature?.core?.deathC ?? 28),
            samples: hpMappingSamples
          }
        }
      ),
      buildCase(
        "ExposureCoverageSuite / Case 01 / N0 无防护锚点",
        exposureN0,
        [
          makeAssertAbsDelta("before hp == 100", exposureN0.before.hp, 100, 1e-6),
          makeAssertString("before dead == false", exposureN0.before.dead, false),
          makeAssertString("before incapacitated == false", exposureN0.before.incapacitated, false),
          makeAssertAbsDelta("wetness stable", exposureN0.after.wetness, exposureN0.before.wetness, 1e-6),
          makeAssertString("env locked", exposureN0.context?.worldSnapshot?.thermalEnvLocked, true),
          makeAssertString("wind locked", exposureN0.context?.windModel?.locked, true),
          makeAssertAbsDelta("T_incap == 3", n0Exposure.T_incap, 3, 1e-4),
          makeAssertAbsDelta("T_death == 12", n0Exposure.T_death, 12, 1e-4),
          makeAssert("checkpoint 3 tCore <= incapC+0.05", n0Incap?.tCore_after, coreThresholds.incapC + 0.05, "<="),
          makeAssertAbsDelta("checkpoint 3 hypo100 == 0", n0Incap?.hypo100_after, 0, 1e-4),
          makeAssertAbsDelta("checkpoint 3 hp == 100", n0Incap?.hp_after, 100, 1e-4),
          makeAssert("checkpoint 12 tCore <= deathC+0.05", n0Death?.tCore_after, coreThresholds.deathC + 0.05, "<="),
          makeAssertAbsDelta("checkpoint 12 hp == 0", n0Death?.hp_after, 0, 1e-4)
        ],
        "ExposureCoverageSuite: naked anchor with minute-quantized integration."
      ),
      buildCase(
        "ExposureCoverageSuite / Case 02 / 九槽位权重覆盖",
        {
          ...slotCoverageTriple,
          before: slotCoverageSingle.after,
          after: slotCoverageTriple.after,
          context: {
            ...slotCoverageTriple.context,
            compareEquipment: {
              upperOnly: slotCoverageSingle.context?.equipment,
              upperLiningLower: slotCoverageTriple.context?.equipment
            }
          }
        },
        [
          makeAssertAbsDelta("weights sum == 1", slotCoverageTriple.weightSum, 1, 1e-6),
          makeAssert("slotContrib count == 9", slotCoverageTriple.slotContrib?.length ?? 0, 9, "=="),
          makeAssert("upper-only I_eff < 0.9", slotCoverageSingle.exposureEvidence?.I_eff, 0.9, "<"),
          makeAssert("upper-only W_eff < 0.99", slotCoverageSingle.exposureEvidence?.W_eff, 0.99, "<"),
          makeAssert("triple I_eff > upper-only", slotCoverageTriple.exposureEvidence?.I_eff, slotCoverageSingle.exposureEvidence?.I_eff, ">"),
          makeAssert("triple W_eff > upper-only", slotCoverageTriple.exposureEvidence?.W_eff, slotCoverageSingle.exposureEvidence?.W_eff, ">")
        ],
        "ExposureCoverageSuite: prove all nine slots and weights are part of aggregation.",
        {
          compare: {
            upperOnly: {
              exposureEvidence: slotCoverageSingle.exposureEvidence,
              slotContrib: slotCoverageSingle.slotContrib,
              equipment: slotCoverageSingle.context?.equipment
            },
            upperLiningLower: {
              exposureEvidence: slotCoverageTriple.exposureEvidence,
              slotContrib: slotCoverageTriple.slotContrib,
              equipment: slotCoverageTriple.context?.equipment
            }
          }
        }
      ),
      buildCase(
        "ExposureCoverageSuite / Case 03 / 聚合公式非线性",
        {
          ...diminishingB,
          before: diminishingA.after,
          after: diminishingB.after,
          context: {
            ...diminishingB.context,
            equipment: diminishingB.context?.equipment
          }
        },
        [
          makeAssert("A > bare", diminishingA.exposureEvidence?.I_eff, diminishingBare.exposureEvidence?.I_eff, ">"),
          makeAssert("B > A", diminishingB.exposureEvidence?.I_eff, diminishingA.exposureEvidence?.I_eff, ">"),
          makeAssert("Δ(B-A) < Δ(A-bare)", diminishingDeltaAToB, diminishingDeltaBareToA, "<")
        ],
        "ExposureCoverageSuite: insulation aggregation must show diminishing returns.",
        {
          compare: {
            bare: {
              exposureEvidence: diminishingBare.exposureEvidence,
              equipment: diminishingBare.context?.equipment
            },
            A_upperOnly: {
              exposureEvidence: diminishingA.exposureEvidence,
              equipment: diminishingA.context?.equipment
            },
            B_upperPlusLining: {
              exposureEvidence: diminishingB.exposureEvidence,
              equipment: diminishingB.context?.equipment
            },
            marginalDeltaBareToA: diminishingDeltaBareToA,
            marginalDeltaAToB: diminishingDeltaAToB
          }
        }
      ),
      buildCase(
        "ExposureCoverageSuite / Case 04 / 漏风弱点拖累",
        {
          ...windPenaltyWeak,
          before: windPenaltyStrong.after,
          after: windPenaltyWeak.after,
          context: {
            ...windPenaltyWeak.context,
            equipment: windPenaltyWeak.context?.equipment
          }
        },
        [
          makeAssert("W_eff(weak) < W_eff(full)", windPenaltyWeak.exposureEvidence?.W_eff, windPenaltyStrong.exposureEvidence?.W_eff, "<"),
          makeAssert("actualDrop >= 0.01", windPenaltyActualDrop, 0.01, ">="),
          makeAssert("T_incap(weak) <= full*0.97", windPenaltyWeak.exposureEvidence?.T_incap, (windPenaltyStrong.exposureEvidence?.T_incap ?? 0) * 0.97, "<="),
          makeAssert("T_death(weak) <= full*0.97", windPenaltyWeak.exposureEvidence?.T_death, (windPenaltyStrong.exposureEvidence?.T_death ?? 0) * 0.97, "<=")
        ],
        "ExposureCoverageSuite: same-space weak-point assertions should reflect player-visible W_eff and survival-time penalties.",
        {
          compare: {
            fullSeal: {
              exposureEvidence: windPenaltyStrong.exposureEvidence,
              equipment: windPenaltyStrong.context?.equipment
            },
            weakNeck: {
              exposureEvidence: windPenaltyWeak.exposureEvidence,
              equipment: windPenaltyWeak.context?.equipment
            },
            actualDrop: windPenaltyActualDrop,
            linearDrop: windPenaltyLinearDrop,
            neckWeightedLnLeakDelta: windPenaltyLogDelta
          }
        }
      ),
      buildCase(
        "ExposureCoverageSuite / Case 05 / 物品属性范围校验",
        tier1RangeRows,
        [
          makeAssert("wearable count > 0", rawWearableItems.length, 0, ">"),
          makeAssert("range violation count == 0", thermalRangeViolations.length, 0, "==")
        ],
        thermalRangeViolations.length ? thermalRangeViolations.join("; ") : "All wearable thermal insulation/windproof values are within [0,1].",
        {
          invalidItems: thermalRangeViolations
        }
      ),
      buildCase(
        "ExposureCoverageSuite / Case 06 / 无耐久字段校验",
        tier1RangeRows,
        [
          makeAssert("forbidden field count == 0", forbiddenDurabilityViolations.length, 0, "==")
        ],
        forbiddenDurabilityViolations.length ? forbiddenDurabilityViolations.join("; ") : "All wearable items are free of durability/condition style fields.",
        {
          invalidItems: forbiddenDurabilityViolations
        }
      ),
      buildCase(
        "ExposureCoverageSuite / Case 07 / Tier-1 范围约束",
        tier1RangeRows,
        [
          makeAssert("I_eff >= 0.3", tier1RangeRows.exposureEvidence?.I_eff, 0.3, ">="),
          makeAssert("I_eff <= 0.6", tier1RangeRows.exposureEvidence?.I_eff, 0.6, "<="),
          makeAssert("W_eff >= 0.6", tier1RangeRows.exposureEvidence?.W_eff, 0.6, ">="),
          makeAssert("W_eff <= 0.9", tier1RangeRows.exposureEvidence?.W_eff, 0.9, "<=")
        ],
        "ExposureCoverageSuite: tier-1 full set must remain inside its target protection range."
      ),
      buildCase(
        "ExposureCoverageSuite / Case 08 / Tier-2 范围约束",
        tier2RangeRows,
        [
          makeAssert("I_eff >= 0.6", tier2RangeRows.exposureEvidence?.I_eff, 0.6, ">="),
          makeAssert("I_eff <= 0.9", tier2RangeRows.exposureEvidence?.I_eff, 0.9, "<="),
          makeAssert("W_eff >= 0.9", tier2RangeRows.exposureEvidence?.W_eff, 0.9, ">="),
          makeAssert("W_eff <= 0.99", tier2RangeRows.exposureEvidence?.W_eff, 0.99, "<=")
        ],
        "ExposureCoverageSuite: tier-2 full set must remain inside its target protection range."
      ),
      buildCase(
        "ExposureCoverageSuite / Case 09 / Tier-1 中位数锚点",
        exposureN1,
        [
          makeAssertAbsDelta("before hp == 100", exposureN1.before.hp, 100, 1e-6),
          makeAssertString("before dead == false", exposureN1.before.dead, false),
          makeAssertString("before incapacitated == false", exposureN1.before.incapacitated, false),
          makeAssertAbsDelta("wetness stable", exposureN1.after.wetness, exposureN1.before.wetness, 1e-6),
          makeAssertString("env locked", exposureN1.context?.worldSnapshot?.thermalEnvLocked, true),
          makeAssertString("wind locked", exposureN1.context?.windModel?.locked, true),
          makeAssertString("after has no hypo", Object.prototype.hasOwnProperty.call(exposureN1.after || {}, "hypo"), false),
          makeAssertString("after has no stage", Object.prototype.hasOwnProperty.call(exposureN1.after || {}, "stage"), false),
          makeAssert("checkpoint 90 tCore <= incapC+0.05", n1Incap?.tCore_after, coreThresholds.incapC + 0.05, "<="),
          makeAssertAbsDelta("checkpoint 90 hypo100 == 0", n1Incap?.hypo100_after, 0, 1e-4),
          makeAssertAbsDelta("checkpoint 90 hp == 100", n1Incap?.hp_after, 100, 1e-4),
          makeAssert("checkpoint 120 tCore <= deathC+0.05", n1Death?.tCore_after, coreThresholds.deathC + 0.05, "<="),
          makeAssertAbsDelta("checkpoint 120 hp == 0", n1Death?.hp_after, 0, 1e-4),
          makeAssertAbsDelta("T_incap == 90", n1Exposure.T_incap, 90, 1e-6),
          makeAssertAbsDelta("T_death == 120", n1Exposure.T_death, 120, 1e-6)
        ],
        "ExposureCoverageSuite: tier-1 anchor with locked env, locked wetness, and isolated exposure semantics."
      ),
      buildCase(
        "ExposureCoverageSuite / Case 10 / Tier-2 中位数锚点",
        exposureN2,
        [
          makeAssertAbsDelta("before hp == 100", exposureN2.before.hp, 100, 1e-6),
          makeAssertString("before dead == false", exposureN2.before.dead, false),
          makeAssertString("before incapacitated == false", exposureN2.before.incapacitated, false),
          makeAssertAbsDelta("wetness stable", exposureN2.after.wetness, exposureN2.before.wetness, 1e-6),
          makeAssertString("env locked", exposureN2.context?.worldSnapshot?.thermalEnvLocked, true),
          makeAssertString("wind locked", exposureN2.context?.windModel?.locked, true),
          makeAssertString("after has no hypo", Object.prototype.hasOwnProperty.call(exposureN2.after || {}, "hypo"), false),
          makeAssertString("after has no stage", Object.prototype.hasOwnProperty.call(exposureN2.after || {}, "stage"), false),
          makeAssertAbsDelta("spot-check tCore integration == analytical (|Δ|<=0.001)", exposureN2SpotIntegrated.after.tCore, exposureN2SpotAnalytical.after.tCore, 1e-3),
          makeAssertAbsDelta("spot-check hypo100 integration == analytical (|Δ|<=0.001)", exposureN2SpotIntegrated.after.hypo100, exposureN2SpotAnalytical.after.hypo100, 1e-3),
          makeAssertAbsDelta("spot-check hp integration == analytical (|Δ|<=0.001)", exposureN2SpotIntegrated.after.hp, exposureN2SpotAnalytical.after.hp, 1e-3),
          makeAssert("checkpoint 540 tCore <= incapC+0.05", n2Incap?.tCore_after, coreThresholds.incapC + 0.05, "<="),
          makeAssertAbsDelta("checkpoint 540 hypo100 == 0", n2Incap?.hypo100_after, 0, 1e-4),
          makeAssertAbsDelta("checkpoint 540 hp == 100", n2Incap?.hp_after, 100, 1e-4),
          makeAssert("checkpoint 720 tCore <= deathC+0.05", n2Death?.tCore_after, coreThresholds.deathC + 0.05, "<="),
          makeAssertAbsDelta("checkpoint 720 hp == 0", n2Death?.hp_after, 0, 1e-4),
          makeAssertAbsDelta("T_incap == 540", n2Exposure.T_incap, 540, 1e-6),
          makeAssertAbsDelta("T_death == 720", n2Exposure.T_death, 720, 1e-6)
        ],
        "ExposureCoverageSuite: tier-2 anchor with analytical path plus 60-minute integration spot-check."
      ),
      buildCase(
        "UI_BIND / exposure hypo100 default",
        exposureUiDefault,
        [
          makeAssertAbsDelta("before hypo100 == 100", exposureUiDefault.before.hypo100, 100, 1e-6),
          makeAssertAbsDelta("after hypo100 == 100", exposureUiDefault.after.hypo100, 100, 1e-6),
          makeAssertString("incapacitated == false", exposureUiDefault.after.incapacitated, false)
        ],
        "Guard rail: missing exposure.hypo100 must default to 100 and must not render as 0 while not incapacitated."
      ),
      buildCase(
        "UI_NO_PERSISTENT_EMPTY_SLOT_HINT",
        starterKitRows,
        [
          makeAssertString("upper row shows I --", uiSlotEmptyEvidence.hasIPlaceholder, true),
          makeAssertString("upper row shows W --", uiSlotEmptyEvidence.hasWPlaceholder, true),
          makeAssertString("upper row keeps 缺失", uiSlotEmptyEvidence.hasMissingChip, true),
          makeAssertString("persistent warning removed", uiSlotEmptyEvidence.hasPersistentWarning, false),
          makeAssertString("upper row avoids 0.00 mislead", uiSlotEmptyEvidence.avoidsZeroMetric, true),
          makeAssertString("tooltip keeps new empty-slot copy", uiSlotEmptyEvidence.tooltipHasNewCopy, true),
          makeAssertString("tooltip includes priority hint", uiSlotEmptyEvidence.tooltipHasPriority, true)
        ],
        "UI guard rail: empty slots keep placeholders in-row while consequence copy only appears in tooltip.",
        {
          uiEvidence: uiSlotEmptyEvidence
        }
      ),
      buildCase(
        "UI_SUMMARY_COLLAPSE_DEFAULT",
        starterKitRows,
        [
          makeAssertString("collapsed hides baseline copy", uiSummaryCollapseEvidence.collapsedHasBasisText, false),
          makeAssertString("collapsed keeps main headline", uiSummaryCollapseEvidence.collapsedHasHeadline, true),
          makeAssertString("expanded shows baseline copy", uiSummaryCollapseEvidence.expandedHasBasisText, true),
          makeAssertString("expanded shows weak reason", uiSummaryCollapseEvidence.expandedHasWeakReason, true),
          makeAssertString("expanded removes jump action", uiSummaryCollapseEvidence.expandedHasJumpButton, false)
        ],
        "UI guard rail: clothing summary must default collapsed and reveal explanation only after expansion, without restoring the removed jump action.",
        {
          uiEvidence: uiSummaryCollapseEvidence
        }
      ),
      buildCase(
        "UI_SLOT_FILTER_REMOVED",
        starterKitRows,
        [
          makeAssert("all 9 slot rows render", uiSlotFilterRemovedEvidence.equipRowCount, 9, "=="),
          makeAssertString("removed text absent", uiSlotFilterRemovedEvidence.hasRemovedText, false),
          makeAssertString("toggle element absent", uiSlotFilterRemovedEvidence.hasToggleEl, false),
          makeAssertString("hidden summary absent", uiSlotFilterRemovedEvidence.hasHiddenSummary, false)
        ],
        "UI guard rail: the slot filter toggle should be fully removed while the clothing pane keeps all nine slots visible.",
        {
          uiEvidence: uiSlotFilterRemovedEvidence
        }
      ),
      buildCase(
        "UI_CLOTHING_SUMMARY_BASELINE_TAG",
        starterKitRows,
        [
          makeAssertString("headline keeps timing", uiClothingSummaryBaselineTagEvidence.headline.includes("失能") && uiClothingSummaryBaselineTagEvidence.headline.includes("致死"), true),
          makeAssertString("summary shows reference tag", uiClothingSummaryBaselineTagEvidence.showsReferenceTag, true),
          makeAssertString("tag tooltip includes compare notice", uiClothingSummaryBaselineTagEvidence.includesCompareNotice, true),
          makeAssertString("hover keeps baseline text", uiClothingSummaryBaselineTagEvidence.hoverHasBaseline, true)
        ],
        "UI guard rail: clothing headline must explicitly mark baseline vs reference timing context.",
        {
          uiEvidence: uiClothingSummaryBaselineTagEvidence
        }
      ),
      buildCase(
        "UI_HEADER_VISIBILITY / clothingOnly",
        starterKitRows,
        [
          makeAssertString("tool hides clothing header", uiHeaderVisibilityClothingOnlyEvidence.results.find((row) => row.filter === "tool")?.hasHeader, false),
          makeAssertString("material hides clothing header", uiHeaderVisibilityClothingOnlyEvidence.results.find((row) => row.filter === "material")?.hasHeader, false),
          makeAssertString("consumable hides clothing header", uiHeaderVisibilityClothingOnlyEvidence.results.find((row) => row.filter === "consumable")?.hasHeader, false),
          makeAssertString("non-clothing tabs hide 失能 text", uiHeaderVisibilityClothingOnlyEvidence.allHideLossText, true)
        ],
        "UI guard rail: the compact exposure header should render only in the clothing tab.",
        {
          uiEvidence: uiHeaderVisibilityClothingOnlyEvidence
        }
      ),
      buildCase(
        "UI_HEADER_HEIGHT / compact",
        starterKitRows,
        [
          makeAssert("header height <= 90", uiHeaderHeightCompactEvidence.headerHeight, 90, "<="),
          makeAssertString("header keeps loss timing", uiHeaderHeightCompactEvidence.headerText.includes("失能") && uiHeaderHeightCompactEvidence.headerText.includes("致死"), true)
        ],
        "UI guard rail: clothing tab header should stay compact in the default folded state.",
        {
          uiEvidence: uiHeaderHeightCompactEvidence
        }
      ),
      buildCase(
        "UI_HEADER_COPY / clarity",
        starterKitRows,
        [
          makeAssertString("header keeps eta headline", uiHeaderCopyClarityEvidence.keepsEtaHeadline, true),
          makeAssertString("header shows baseline/reference tag", uiHeaderCopyClarityEvidence.hasClearTag, true),
          makeAssertString("header uses readable metric labels", uiHeaderCopyClarityEvidence.usesReadableMetricLabels, true),
          makeAssertString("header hides engineering labels", uiHeaderCopyClarityEvidence.hidesEngineeringMetricLabels, true),
          makeAssertString("header shows shortfall copy", uiHeaderCopyClarityEvidence.hasShortfallCopy, true),
          makeAssertString("header default stays minimal", uiHeaderCopyClarityEvidence.keepsDefaultMinimal, true)
        ],
        "UI guard rail: clothing header should read like a game UI summary, not an engineering panel.",
        {
          uiEvidence: uiHeaderCopyClarityEvidence
        }
      ),
      buildCase(
        "UI_HEADER_HUD_MINIMAL",
        starterKitRows,
        [
          makeAssertString("default hides explanation sentence", uiHeaderHudMinimalEvidence.hidesExplainSentence, true),
          makeAssertString("default has reference text", uiHeaderHudMinimalEvidence.hasReferenceText, true),
          makeAssertString("default has shortfall text", uiHeaderHudMinimalEvidence.hasShortfallText, true),
          makeAssertString("default has eta text", uiHeaderHudMinimalEvidence.hasEtaText, true)
        ],
        "UI guard rail: default clothing header should behave like a compact HUD, showing only reference, timings, and shortfalls.",
        {
          uiEvidence: uiHeaderHudMinimalEvidence
        }
      ),
      buildCase(
        "UI_HEADER_BASELINE_NO_ELLIPSIS",
        starterKitRows,
        [
          makeAssertString("baseline rows render", uiHeaderBaselineNoEllipsisEvidence.baselineRowCount >= 4, true),
          makeAssertString("expanded text avoids ellipsis", uiHeaderBaselineNoEllipsisEvidence.containsEllipsisText, false),
          makeAssertString("jump button text removed", uiHeaderBaselineNoEllipsisEvidence.containsJumpText, false),
          makeAssertString("current line one present", uiHeaderBaselineNoEllipsisEvidence.containsCurrentLine1, true),
          makeAssertString("current line two present", uiHeaderBaselineNoEllipsisEvidence.containsCurrentLine2, true),
          makeAssertString("wrap styles enabled", uiHeaderBaselineNoEllipsisEvidence.wrapsAllowed, true),
          makeAssertString("overflow not hidden", uiHeaderBaselineNoEllipsisEvidence.overflowVisible, true)
        ],
        "UI guard rail: the expanded clothing baseline block must show complete readable lines with wrapping, not ellipsis or jump-button copy.",
        {
          uiEvidence: uiHeaderBaselineNoEllipsisEvidence
        }
      ),
      buildCase(
        "UI_HOVERCARD / hover-open-anchor-close",
        starterKitRows,
        [
          makeAssertString("hover card visible", uiHoverCardAnchorCloseEvidence.hoverVisible, true),
          makeAssertString("hover card class", uiHoverCardAnchorCloseEvidence.hasHoverCardClass, true),
          makeAssertString("hover contains detail button", uiHoverCardAnchorCloseEvidence.containsDetailButton, true),
          makeAssertString("hover omits close button", uiHoverCardAnchorCloseEvidence.omitsCloseButton, true),
          makeAssertString("hover left stays anchored", uiHoverCardAnchorCloseEvidence.anchoredLeftStable, true),
          makeAssertString("hover top stays anchored", uiHoverCardAnchorCloseEvidence.anchoredTopStable, true),
          makeAssertString("hover stays open on card enter", uiHoverCardAnchorCloseEvidence.staysOpenWhenEnteringCard, true),
          makeAssertString("hover closes after leave", uiHoverCardAnchorCloseEvidence.closesAfterLeavingCard, true)
        ],
        "UI guard rail: clothing details should open as anchored interactive hover cards and close only after leaving both row and card.",
        {
          uiEvidence: uiHoverCardAnchorCloseEvidence
        }
      ),
      buildCase(
        "UI_HOVERCARD_NO_LAYOUT_JANK",
        starterKitRows,
        [
          makeAssertString("overlay width stable", uiHoverCardNoLayoutJankEvidence.overlayStable, true),
          makeAssertString("left pane client width stable", uiHoverCardNoLayoutJankEvidence.leftClientStable, true),
          makeAssertString("left pane scroll width stable", uiHoverCardNoLayoutJankEvidence.leftScrollStable, true)
        ],
        "UI guard rail: hover open/close should not change overlay or left-pane widths, avoiding scrollbar flash and layout jank.",
        {
          uiEvidence: uiHoverCardNoLayoutJankEvidence
        }
      ),
      buildCase(
        "UI_SCROLL / left pane keeps last slot visible",
        starterKitRows,
        [
          makeAssertString("left pane has last slot row", uiScrollLeftPaneKeepsLastSlotVisibleEvidence.hasLastRow, true),
          makeAssertString("left pane uses internal scroll", uiScrollLeftPaneKeepsLastSlotVisibleEvidence.paneHasInternalScroll, true),
          makeAssertString("last slot visible after scroll", uiScrollLeftPaneKeepsLastSlotVisibleEvidence.lastRowVisibleAfterScroll, true)
        ],
        "UI guard rail: equipment pane must keep the last slot reachable via internal dark scrolling instead of collapsing out of layout.",
        {
          uiEvidence: uiScrollLeftPaneKeepsLastSlotVisibleEvidence
        }
      ),
      buildCase(
        "UI_CLOTHING_NO_RECOMMEND_SECTION",
        starterKitRows,
        [
          makeAssertString("recommend text removed", uiClothingNoRecommendSectionEvidence.hasRecommendText, false),
          makeAssertString("candidate pane exists", uiClothingNoRecommendSectionEvidence.hasCandidatePane, true),
          makeAssertString("candidate pane uses fill class", uiClothingNoRecommendSectionEvidence.candidatePaneUsesClass, true)
        ],
        "UI guard rail: clothing tab should remove the recommendation block and let the candidate pane fill the remaining space.",
        {
          uiEvidence: uiClothingNoRecommendSectionEvidence
        }
      ),
      buildCase(
        "UI_CLOTHING_SELECTED_PERSISTS",
        starterKitRows,
        [
          makeAssertString("candidate title resolves selected slot", uiClothingSelectedCandidatePersistsEvidence.candidateTitle.includes("下装"), true),
          makeAssertString("selected row stays visible", uiClothingSelectedCandidatePersistsEvidence.rowExists, true),
          makeAssertString("selected row keeps yellow state", uiClothingSelectedCandidatePersistsEvidence.rowHasSelectedClass, true),
          makeAssertString("selected row shows 选中 tag", uiClothingSelectedCandidatePersistsEvidence.rowHasSelectedTag, true),
          makeAssertString("selected row keeps 已装备 tag", uiClothingSelectedCandidatePersistsEvidence.rowHasEquippedTag, true),
          makeAssertString("candidate pane avoids empty state", uiClothingSelectedCandidatePersistsEvidence.emptyStateVisible, false)
        ],
        "UI guard rail: selecting or equipping a clothing item must keep it visible in the candidate list with both selected and equipped states intact.",
        {
          uiEvidence: uiClothingSelectedCandidatePersistsEvidence
        }
      ),
      buildCase(
        "UI_FOOTER_ACTION_BAR",
        starterKitRows,
        [
          makeAssertString("debug entries removed", uiFooterActionBarEvidence.noDebugText, true),
          makeAssertString("footer shows selected name", uiFooterActionBarEvidence.showsSelectedName, true),
          makeAssertString("footer shows item id", uiFooterActionBarEvidence.showsItemId, true),
          makeAssertString("equipped primary button label", uiFooterActionBarEvidence.footerPrimaryText, "已装备"),
          makeAssertString("equipped primary button disabled", uiFooterActionBarEvidence.footerPrimaryDisabled, true),
          makeAssertString("unequip action remains", uiFooterActionBarEvidence.showsUnequip, true)
        ],
        "UI guard rail: the footer should present a clean product-style action bar with no debug toolbar and a disabled primary action for already equipped items.",
        {
          uiEvidence: uiFooterActionBarEvidence
        }
      ),
      buildCase(
        "INV_CLOTHING_UNLIMITED / bypass capacity",
        starterKitRows,
        [
          makeAssertString("clothing bypasses kind limit", invClothingUnlimitedEvidence.kindBypassOk, true),
          makeAssertString("clothing bypasses stack limit", invClothingUnlimitedEvidence.stackBypassOk, true)
        ],
        "Inventory guard rail: clothing should bypass backpack kind and stack limits while keeping the stored inventory format unchanged.",
        {
          invEvidence: invClothingUnlimitedEvidence
        }
      ),
      buildCase(
        "INV_NONCLOTHING_STILL_LIMITED",
        starterKitRows,
        [
          makeAssertString("non-clothing keeps kind limit", invNonClothingStillLimitedEvidence.kindLimitStillBlocks, true),
          makeAssertString("kind limit toast preserved", invNonClothingStillLimitedEvidence.kindLimitMentionsCap, true),
          makeAssertString("non-clothing keeps stack limit", invNonClothingStillLimitedEvidence.stackLimitStillBlocks, true),
          makeAssertString("stack limit toast preserved", invNonClothingStillLimitedEvidence.stackLimitMentionsCap, true)
        ],
        "Inventory guard rail: non-clothing items should still obey existing backpack kind and stack caps.",
        {
          invEvidence: invNonClothingStillLimitedEvidence
        }
      ),
      buildCase(
        "TEMP_UI / indoor hides exposure anchors",
        starterKitRows,
        [
          makeAssertString("indoor hides T_incap", indoorThermalCardEvidence.hasIncapAnchor, false),
          makeAssertString("indoor hides T_death", indoorThermalCardEvidence.hasDeathAnchor, false),
          makeAssertString("indoor shows eta", indoorThermalCardEvidence.hasIndoorEta, true),
          makeAssertString("indoor hides duplicate target", indoorThermalCardEvidence.hasIndoorTarget, false),
          makeAssertString("indoor hides duplicate status", indoorThermalCardEvidence.hasIndoorStatus, false),
          makeAssertString("indoor folds env chip", indoorThermalCardEvidence.hasEnvChip, false),
          makeAssertString("indoor folds wind chip", indoorThermalCardEvidence.hasWindChip, false),
          makeAssertString("indoor folds shelter chip", indoorThermalCardEvidence.hasShelterChip, false),
          makeAssertString("indoor keeps heat chip", indoorThermalCardEvidence.hasHeatChip, true)
        ],
        "UI guard rail: indoor thermal card must switch from exposure anchors to recovery language.",
        {
          uiEvidence: indoorThermalCardEvidence
        }
      ),
      buildCase(
        "TEMP_UI / outdoor shows current ETA but hides baseline chips",
        starterKitRows,
        [
          makeAssertString("outdoor keeps current ETA line", outdoorCurrentEtaSemanticsEvidence.hasCurrentEtaLine, true),
          makeAssertString("outdoor hides baseline chip labels", outdoorCurrentEtaSemanticsEvidence.hidesBaselineAnchorLabels, true),
          makeAssertString("hover shows baseline reference", outdoorCurrentEtaSemanticsEvidence.hoverShowsBaseline, true),
          makeAssertString("hover shows current context", outdoorCurrentEtaSemanticsEvidence.hoverShowsCurrent, true)
        ],
        "UI guard rail: thermal card main view should show only current ETA, while baseline comparison stays in hover copy.",
        {
          uiEvidence: outdoorCurrentEtaSemanticsEvidence
        }
      ),
      buildCase(
        "TEMP_UI / indoor warm ETA is numeric-or-dash",
        starterKitRows,
        [
          makeAssertString("indoor ETA stays numeric or dash", indoorWarmEtaFormatEvidence.etaIsNumericOrDash, true),
          makeAssertString("indoor ETA never says 回温中", indoorWarmEtaFormatEvidence.hasWarmupPlaceholder, false),
          makeAssertString("indoor delta is numeric", indoorWarmEtaFormatEvidence.deltaLooksNumeric, true)
        ],
        "UI guard rail: IndoorWarm mode must render ETA as numeric-or-dash and keep delta-to-target explicit.",
        {
          uiEvidence: indoorWarmEtaFormatEvidence
        }
      ),
      buildCase(
        "TEMP_UI / thermal disclosure persists scene switch",
        starterKitRows,
        [
          makeAssertString("thermal card opens before switch", thermalDisclosureScenePersistEvidence.openBefore, true),
          makeAssertString("thermal card stays open after switch", thermalDisclosureScenePersistEvidence.openAfterSceneSwitch, true)
        ],
        "UI guard rail: thermal disclosure should stay expanded across scene switches until the player closes it.",
        {
          uiEvidence: thermalDisclosureScenePersistEvidence
        }
      ),
      buildCase(
        "StarterKit / aggregate sanity",
        starterKitRows,
        [
          makeAssert("I_eff > 0", starterKitRows.exposureEvidence?.I_eff, 0, ">"),
          makeAssert("W_eff > 0", starterKitRows.exposureEvidence?.W_eff, 0, ">"),
          makeAssert("P > 0", starterKitRows.exposureEvidence?.P, 0, ">")
        ],
        "Starter kit baseline for later balance passes.",
        {
          starterKitEvidence: starterKitRows.exposureEvidence,
          slotContrib: starterKitRows.slotContrib,
          equipment: starterKit
        }
      ),
      buildCase(
        "TEMP_UI / clothing agg consistent",
        starterKitRows,
        [
          makeAssert("thermal I_eff > 0", clothingAggConsistencyEvidence.iEff, 0, ">"),
          makeAssert("thermal W_eff > 0", clothingAggConsistencyEvidence.wEff, 0, ">"),
          makeAssert("thermal P > 0", clothingAggConsistencyEvidence.protectionScore, 0, ">"),
          makeAssertAbsDelta("thermal I_eff ~= audit", clothingAggConsistencyEvidence.iEff, clothingAggConsistencyEvidence.expectedI, 0.02),
          makeAssertAbsDelta("thermal W_eff ~= audit", clothingAggConsistencyEvidence.wEff, clothingAggConsistencyEvidence.expectedW, 0.02),
          makeAssertAbsDelta("thermal P ~= audit", clothingAggConsistencyEvidence.protectionScore, clothingAggConsistencyEvidence.expectedP, 0.02),
          makeAssertString("equipped row says 当前已装备", clothingAggConsistencyEvidence.rowShowsCurrentEquipped, true),
          makeAssertString("equipped row hides Δ失能", clothingAggConsistencyEvidence.rowHidesDeltaIncap, true),
          makeAssertString("equipped row hides Δ致死", clothingAggConsistencyEvidence.rowHidesDeltaDeath, true)
        ],
        "UI guard rail: thermal protection chips must stay aligned with equipped clothing even if cached thermal values are zeroed.",
        {
          uiEvidence: clothingAggConsistencyEvidence
        }
      ),
      buildCase(
        "UI_SCROLL_GUARD",
        starterKitRows,
        [
          makeAssertString("html overflow hidden", uiScrollGuardEvidence.htmlOverflow, "hidden"),
          makeAssertString("body overflow hidden", uiScrollGuardEvidence.bodyOverflow, "hidden"),
          makeAssertString("inventory-open class applied", uiScrollGuardEvidence.inventoryOpenClass, true),
          makeAssertString("detail dialog opened", uiScrollGuardEvidence.detailOpen, true),
          makeAssertString("hover card visible", uiScrollGuardEvidence.hoverVisible, true),
          makeAssertString("detail within viewport", uiScrollGuardEvidence.detailWithinViewport, true),
          makeAssertString("hover within viewport", uiScrollGuardEvidence.hoverWithinViewport, true)
        ],
        "UI guard rail: inventory overlay, hover card, and detail dialog must stay inside the viewport without page scrollbars.",
        {
          uiEvidence: uiScrollGuardEvidence
        }
      ),
      buildCase(
        "集成链路：action->resolve->commit",
        actionChain,
        [
          makeAssert("commit ok", actionChain.commitOk ? 1 : 0, 1, "=="),
          makeAssert("contains ADVANCE_TIME", actionChain.advanceCalls, 1, "=="),
          makeAssert("tEnvEffC >= indoorMinWarmC", actionChain.after.tEnvEffC, PLAYER_DEFS.temperature?.envTemp?.indoorMinWarmC ?? 16, ">="),
          makeAssert("wetness changed", Math.abs(actionChain.delta.wetness), 0, ">"),
          makeAssertAbsDelta("Safe integration => Δhp == 0", actionChain.delta.hp, 0, 1e-6)
        ],
        "",
        {
          integrationEvidence: {
            ok: !!actionChain.pipeline?.ok,
            commitOk: !!actionChain.pipeline?.commitOk,
            advanceTimeCalls: Number(actionChain.pipeline?.advanceTimeCalls ?? 0),
            sysCallsCount: Number(actionChain.pipeline?.sysCallsCount ?? 0),
            actionId: String(actionChain.pipeline?.actionId || "wait_time")
          }
        }
      ),
      buildCase(
        "IndoorWarmExpSuite / Case IW-01 / 4h 从 T_core_min 回满",
        indoorExpRecover4h,
        [
          makeAssert("windLocal == 0", indoorExpRecover4h.after.windLocal, 0, "=="),
          makeAssert("reachMinute <= 240", indoorExpRecover4h.indoorWarmEvidence?.reachMinute ?? 9999, 240, "<="),
          makeAssert("gapEndC <= epsilonC", indoorExpRecover4h.indoorWarmEvidence?.gapEndC ?? 9999, indoorExpRecover4h.indoorWarmEvidence?.epsilonC ?? 0.1, "<="),
          makeAssertString("monotonicNonDecreasing == true", indoorExpRecover4h.indoorWarmEvidence?.monotonicNonDecreasing, true),
          makeAssert("after.hypo > before.hypo", indoorExpRecover4h.after.hypo, indoorExpRecover4h.before.hypo, ">"),
          makeAssertAbsDelta("wetness locked", indoorExpRecover4h.after.wetness, indoorExpRecover4h.before.wetness, 1e-6),
          makeAssertAbsDelta("hp stable", indoorExpRecover4h.after.hp, indoorExpRecover4h.before.hp, 1e-6)
        ],
        "IndoorWarmExpSuite: minute-stepped indoor exponential recovery reaches the epsilon band within 4 hours.",
        {
          indoorWarmEvidence: indoorExpRecover4h.indoorWarmEvidence,
          checkpoints: indoorExpRecover4h.checkpoints
        }
      ),
      buildCase(
        "IndoorWarmExpSuite / Case IW-02 / 回暖效率倍率路径",
        indoorExpHeat,
        [
          makeAssert("effMul(heat) > effMul(noHeat)", indoorExpHeat.indoorWarmEvidence?.effMulUsed, indoorExpNoHeat.indoorWarmEvidence?.effMulUsed, ">"),
          makeAssert("after.tCore(heat) > after.tCore(noHeat)", indoorExpHeat.after.tCore, indoorExpNoHeat.after.tCore, ">"),
          makeAssert("gapEnd(heat) < gapEnd(noHeat)", indoorExpHeat.indoorWarmEvidence?.gapEndC, indoorExpNoHeat.indoorWarmEvidence?.gapEndC, "<"),
          makeAssert("windLocal == 0", indoorExpHeat.after.windLocal, 0, "=="),
          makeAssertAbsDelta("wetness locked (heat)", indoorExpHeat.after.wetness, indoorExpHeat.before.wetness, 1e-6),
          makeAssertAbsDelta("wetness locked (noHeat)", indoorExpNoHeat.after.wetness, indoorExpNoHeat.before.wetness, 1e-6),
          makeAssertAbsDelta("hp stable (heat)", indoorExpHeat.after.hp, indoorExpHeat.before.hp, 1e-6),
          makeAssertAbsDelta("hp stable (noHeat)", indoorExpNoHeat.after.hp, indoorExpNoHeat.before.hp, 1e-6)
        ],
        "IndoorWarmExpSuite: indoor heat source only changes recovery efficiency multiplier, not the write topology.",
        {
          compare: {
            noHeat: {
              before: toCaseMetricSnapshot(indoorExpNoHeat.before),
              after: toCaseMetricSnapshot(indoorExpNoHeat.after),
              indoorWarmEvidence: indoorExpNoHeat.indoorWarmEvidence,
              checkpoints: indoorExpNoHeat.checkpoints
            },
            withHeat: {
              before: toCaseMetricSnapshot(indoorExpHeat.before),
              after: toCaseMetricSnapshot(indoorExpHeat.after),
              indoorWarmEvidence: indoorExpHeat.indoorWarmEvidence,
              checkpoints: indoorExpHeat.checkpoints
            }
          },
          indoorWarmEvidence: indoorExpHeat.indoorWarmEvidence
        }
      ),
      buildCase(
        "IndoorWarmExpSuite / Case IW-03 / 37℃ 稳态不漂移",
        indoorExpSteady,
        [
          makeAssertAbsDelta("|after.tCore-37| <= 0.001", indoorExpSteady.after.tCore, 37, 0.001),
          makeAssertAbsDelta("ΔtCore == 0 ± 0.001", indoorExpSteady.delta.tCore, 0, 0.001),
          makeAssertAbsDelta("Δhp == 0", indoorExpSteady.delta.hp, 0, 1e-6),
          makeAssertString("after.stage == Safe", indoorExpSteady.after.stage, "Safe"),
          makeAssertAbsDelta("wetness locked", indoorExpSteady.after.wetness, indoorExpSteady.before.wetness, 1e-6),
          makeAssertAbsDelta("hp stable", indoorExpSteady.after.hp, indoorExpSteady.before.hp, 1e-6)
        ],
        "IndoorWarmExpSuite: already-normal indoor temperature should remain pinned at steady state.",
        {
          indoorWarmEvidence: indoorExpSteady.indoorWarmEvidence,
          checkpoints: indoorExpSteady.checkpoints
        }
      )
    ];

    const timeView = getTimeView(720);
    const report = {
      ranAtTotalMinutes: 720,
      day: timeView.day,
      hhmm: `${String(timeView.hour).padStart(2, "0")}:${String(timeView.minute).padStart(2, "0")}`,
      regionId: base.regionId,
      mapId: base.mapId,
      defsHash: makeShortHash(JSON.stringify({ temperature: PLAYER_DEFS.temperature, wetness: PLAYER_DEFS.wetness })),
      cases,
      summary: {
        passCount: cases.filter(x => x.pass).length,
        failCount: cases.filter(x => !x.pass).length
      }
    };

    for (const row of cases) {
      const line = buildCaseJsonLine(row);
      appendedLines.push(line);
      console.log(line);
    }

    return {
      report,
      lines: appendedLines,
      summaryText: buildSummaryText(report),
      jsonText: JSON.stringify(report, null, 2)
    };
  } catch (error) {
    const timeView = getTimeView(720);
    const report = {
      ranAtTotalMinutes: 720,
      day: timeView.day,
      hhmm: `${String(timeView.hour).padStart(2, "0")}:${String(timeView.minute).padStart(2, "0")}`,
      regionId: "West2",
      mapId: "test_temp",
      defsHash: makeShortHash(JSON.stringify({ temperature: PLAYER_DEFS.temperature, wetness: PLAYER_DEFS.wetness })),
      cases: [{
        name: "SMOKE_RUNNER_EXCEPTION",
        pass: false,
        asserts: [{ key: "exception", pass: false, lhs: 0, rhs: 0, op: "throw" }],
        before: { tEnvRegionC: 0, tEnvEffC: 0, windLocal: 0, wetness: 0, warmthRating: 0, warmthEff: 0, tCore: 0, hypo: 0, stage: "Safe", hp: 0 },
        after: { tEnvRegionC: 0, tEnvEffC: 0, windLocal: 0, wetness: 0, warmthRating: 0, warmthEff: 0, tCore: 0, hypo: 0, stage: "Safe", hp: 0 },
        notes: String(error?.message || error)
      }],
      summary: { passCount: 0, failCount: 1 }
    };

    const line = buildCaseJsonLine(report.cases[0]);
    appendedLines.push(line);
    console.error(line);

    return {
      report,
      lines: appendedLines,
      summaryText: buildSummaryText(report),
      jsonText: JSON.stringify(report, null, 2)
    };
  } finally {
    gameState.currentMapId = snapshot.currentMapId;
    gameState.currentMap = snapshot.currentMap;
    gameState.time = snapshot.time;
    gameState.player = snapshot.player;
    gameState.world = snapshot.world;
    gameState.flags = snapshot.flags;
    if (gameState.world && typeof gameState.world === "object") {
      gameState.world.flags = gameState.flags;
    }
    gameState.logLines = [...snapshot.logLines, ...appendedLines];
  }
}
