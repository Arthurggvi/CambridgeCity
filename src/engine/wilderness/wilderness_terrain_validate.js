import { TERRAIN_BIOME_DEFS } from "../../../data/wilderness/terrain/wilderness_terrain_defs.js";
import { listWildernessAreaSpecs } from "./wilderness_area_registry.js";
import { listWildernessRegionProfiles } from "./wilderness_region_registry.js";

const PASSABILITY_ENUM = new Set(["allowed", "slow", "conditional", "forbidden", "hard_block"]);
const SHAPE_TYPES = new Set(["rect", "circle", "line_band"]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isMoveMult(value) {
  return (typeof value === "number" && Number.isFinite(value)) || value === Infinity;
}

function push(errors, message) {
  errors.push(message);
}

export function validateTerrainBiomeDefs(defs) {
  const errors = [];
  if (defs == null || typeof defs !== "object") {
    return { ok: false, errors: ["terrain defs must be a non-null object"] };
  }

  const ids = [];
  for (const key of Object.keys(defs)) {
    const def = defs[key];
    if (def == null || typeof def !== "object") {
      push(errors, `terrain[${key}]: expected object`);
      continue;
    }
    if (key !== def.id) {
      push(errors, `terrain key "${key}" must equal def.id "${def.id}"`);
    }
    if (typeof def.id !== "string" || def.id.length === 0) {
      push(errors, `terrain[${key}]: id must be a non-empty string`);
    } else {
      ids.push(def.id);
    }
    if (typeof def.label !== "string" || def.label.trim().length === 0) {
      push(errors, `terrain[${def.id || key}]: label must be a non-empty string`);
    }

    const move = def.move;
    if (move == null || typeof move !== "object") {
      push(errors, `terrain[${def.id || key}]: move must be an object`);
    } else {
      if (!("moveTimeMult" in move)) push(errors, `terrain[${def.id || key}]: move.moveTimeMult missing`);
      else if (!isMoveMult(move.moveTimeMult)) push(errors, `terrain[${def.id || key}]: move.moveTimeMult must be a finite number or Infinity`);
      if (!("staminaCostMult" in move)) push(errors, `terrain[${def.id || key}]: move.staminaCostMult missing`);
      else if (!isMoveMult(move.staminaCostMult)) push(errors, `terrain[${def.id || key}]: move.staminaCostMult must be a finite number or Infinity`);
      if (!("vehicleTimeMult" in move)) push(errors, `terrain[${def.id || key}]: move.vehicleTimeMult missing`);
      else if (!isMoveMult(move.vehicleTimeMult)) push(errors, `terrain[${def.id || key}]: move.vehicleTimeMult must be a finite number or Infinity`);
    }

    const pass = def.passability;
    if (pass == null || typeof pass !== "object") {
      push(errors, `terrain[${def.id || key}]: passability must be an object`);
    } else {
      if (!PASSABILITY_ENUM.has(pass.foot)) {
        push(errors, `terrain[${def.id || key}]: passability.foot must be one of allowed|slow|conditional|forbidden|hard_block`);
      }
      if (!PASSABILITY_ENUM.has(pass.vehicle)) {
        push(errors, `terrain[${def.id || key}]: passability.vehicle must be one of allowed|slow|conditional|forbidden|hard_block`);
      }
      if (!("requires" in pass)) push(errors, `terrain[${def.id || key}]: passability.requires missing`);
      else if (!Array.isArray(pass.requires)) push(errors, `terrain[${def.id || key}]: passability.requires must be an array`);
    }

    const surface = def.surface;
    if (surface == null || typeof surface !== "object") {
      push(errors, `terrain[${def.id || key}]: surface must be an object`);
    } else {
      for (const field of ["snowAccumulationMult", "windScourMult", "trailRetentionMult", "slipRiskBase"]) {
        if (!(field in surface)) push(errors, `terrain[${def.id || key}]: surface.${field} missing`);
        else if (!isFiniteNumber(surface[field])) push(errors, `terrain[${def.id || key}]: surface.${field} must be a finite number`);
      }
    }

    const hazard = def.hazard;
    if (hazard == null || typeof hazard !== "object") {
      push(errors, `terrain[${def.id || key}]: hazard must be an object`);
    } else {
      for (const field of ["crevasseRisk", "fallRisk", "collapseRisk", "disorientationRisk", "rescueDifficulty"]) {
        if (!(field in hazard)) push(errors, `terrain[${def.id || key}]: hazard.${field} missing`);
        else if (!isFiniteNumber(hazard[field])) push(errors, `terrain[${def.id || key}]: hazard.${field} must be a finite number`);
      }
    }

    const probe = def.probe;
    if (probe == null || typeof probe !== "object") {
      push(errors, `terrain[${def.id || key}]: probe must be an object`);
    } else {
      if (!("visibilityCue" in probe)) push(errors, `terrain[${def.id || key}]: probe.visibilityCue missing`);
      else if (typeof probe.visibilityCue !== "string" || probe.visibilityCue.trim().length === 0) {
        push(errors, `terrain[${def.id || key}]: probe.visibilityCue must be a non-empty string`);
      }
      for (const field of ["landmarkCueMult", "confidenceMult"]) {
        if (!(field in probe)) push(errors, `terrain[${def.id || key}]: probe.${field} missing`);
        else if (!isFiniteNumber(probe[field])) push(errors, `terrain[${def.id || key}]: probe.${field} must be a finite number`);
      }
    }

    if (!Array.isArray(def.blockers)) {
      push(errors, `terrain[${def.id || key}]: blockers must be an array`);
    }
  }

  const idSet = new Set();
  for (const id of ids) {
    if (idSet.has(id)) push(errors, `duplicate terrainId: ${id}`);
    idSet.add(id);
  }

  return { ok: errors.length === 0, errors };
}

export function validateWildernessAreaSpec(areaSpec, context) {
  const errors = [];
  if (areaSpec == null || typeof areaSpec !== "object") {
    return { ok: false, errors: ["area spec must be a non-null object"] };
  }
  if (context == null || typeof context !== "object") {
    return { ok: false, errors: ["context must be a non-null object"] };
  }
  const regionIds = context.regionIds;
  const terrainIds = context.terrainIds;
  if (!(regionIds instanceof Set)) {
    return { ok: false, errors: ["context.regionIds must be a Set"] };
  }
  if (!(terrainIds instanceof Set)) {
    return { ok: false, errors: ["context.terrainIds must be a Set"] };
  }

  if (typeof areaSpec.id !== "string" || areaSpec.id.length === 0) {
    push(errors, "area.id must be a non-empty string");
  }

  if (!regionIds.has(areaSpec.regionId)) {
    push(errors, `area.regionId "${areaSpec.regionId}" is not a registered region`);
  }

  if (!terrainIds.has(areaSpec.defaultTerrainId)) {
    push(errors, `area.defaultTerrainId "${areaSpec.defaultTerrainId}" is not a registered terrain`);
  }

  const bounds = areaSpec.bounds;
  if (bounds == null || typeof bounds !== "object") {
    push(errors, "area.bounds must be an object");
  } else {
    const { minX, maxX, minY, maxY } = bounds;
    if (!isFiniteNumber(minX) || !isFiniteNumber(maxX) || !isFiniteNumber(minY) || !isFiniteNumber(maxY)) {
      push(errors, "area.bounds must use finite numbers for min/max");
    } else if (minX > maxX || minY > maxY) {
      push(errors, "area.bounds must satisfy minX <= maxX and minY <= maxY");
    }
  }

  if (!Array.isArray(areaSpec.terrainZones)) {
    push(errors, "area.terrainZones must be an array");
    return { ok: false, errors };
  }

  for (let i = 0; i < areaSpec.terrainZones.length; i += 1) {
    const zone = areaSpec.terrainZones[i];
    const path = `area.terrainZones[${i}]`;
    if (zone == null || typeof zone !== "object") {
      push(errors, `${path}: zone must be an object`);
      continue;
    }
    if (!terrainIds.has(zone.terrainId)) {
      push(errors, `${path}: terrainId "${zone.terrainId}" is not registered`);
    }
    if (!isFiniteNumber(zone.priority)) {
      push(errors, `${path}: priority must be a finite number`);
    }
    const shape = zone.shape;
    if (shape == null || typeof shape !== "object") {
      push(errors, `${path}: shape must be an object`);
      continue;
    }
    if (!SHAPE_TYPES.has(shape.type)) {
      push(errors, `${path}: shape.type must be rect|circle|line_band`);
      continue;
    }
    if (shape.type === "rect") {
      for (const k of ["x1", "y1", "x2", "y2"]) {
        if (!isFiniteNumber(shape[k])) push(errors, `${path}: shape.${k} must be a finite number`);
      }
    } else if (shape.type === "circle") {
      for (const k of ["cx", "cy", "r"]) {
        if (!isFiniteNumber(shape[k])) push(errors, `${path}: shape.${k} must be a finite number`);
      }
      if (isFiniteNumber(shape.r) && shape.r < 0) push(errors, `${path}: shape.r must be non-negative`);
    } else if (shape.type === "line_band") {
      if (shape.from == null || typeof shape.from !== "object") push(errors, `${path}: shape.from must be an object`);
      else if (!isFiniteNumber(shape.from.x) || !isFiniteNumber(shape.from.y)) {
        push(errors, `${path}: shape.from must have finite x,y`);
      }
      if (shape.to == null || typeof shape.to !== "object") push(errors, `${path}: shape.to must be an object`);
      else if (!isFiniteNumber(shape.to.x) || !isFiniteNumber(shape.to.y)) {
        push(errors, `${path}: shape.to must have finite x,y`);
      }
      if (!isFiniteNumber(shape.radius) || shape.radius < 0) {
        push(errors, `${path}: shape.radius must be a finite non-negative number`);
      }
    }
  }

  if (!Array.isArray(areaSpec.landmarks)) {
    push(errors, "area.landmarks must be an array");
  }

  return { ok: errors.length === 0, errors };
}

export function validateWildernessStaticContracts() {
  const errors = [];

  const terrainDefsResult = validateTerrainBiomeDefs(TERRAIN_BIOME_DEFS);
  errors.push(...terrainDefsResult.errors);

  const regionIds = new Set(listWildernessRegionProfiles().map((p) => p.id));
  const terrainIds = new Set(Object.keys(TERRAIN_BIOME_DEFS));

  const context = { regionIds, terrainIds };
  for (const area of listWildernessAreaSpecs()) {
    const areaResult = validateWildernessAreaSpec(area, context);
    errors.push(...areaResult.errors.map((e) => `${area.id}: ${e}`));
  }

  return { ok: errors.length === 0, errors };
}
