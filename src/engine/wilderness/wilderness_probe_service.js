/**
 * Phase 8: read-only wilderness move probes (no state writes, no RNG, no clock I/O).
 */

import { queryWildernessCoordinate, listLandmarkCuesForCoordinate } from "./wilderness_area_query.js";
import { getTerrainBiomeDef } from "./wilderness_terrain_registry.js";
import {
  calculateWildernessStaminaCost,
  calculateWildernessStepMinutes,
  getWildernessDirectionDelta,
  WILDERNESS_MOVE_DIRECTIONS
} from "./wilderness_movement_cost.js";
import { buildWildernessSurfaceRuntime } from "./wilderness_surface_runtime.js";

function resolveMinuteOfDayFromTotalMinutes(totalMinutes) {
  if (totalMinutes == null) return null;
  const tm = Number(totalMinutes);
  if (!Number.isFinite(tm)) return null;
  const t = Math.trunc(tm);
  return ((t % 1440) + 1440) % 1440;
}

/**
 * @param {{ areaSpec: object, x: number, y: number }} args
 * @returns {Array<{ id: string, label: string, distance: number, enterable: boolean, gotoMapId: string|null }>}
 */
export function collectLandmarkCuesForCoordinate(args) {
  return listLandmarkCuesForCoordinate(args);
}

function clampIntConfidence(n) {
  const t = Math.trunc(Number(n));
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.min(100, t));
}

/**
 * @param {{
 *   terrainDef: object|null,
 *   surfaceRuntime: object|null,
 *   landmarkCues: Array,
 *   passability: string
 * }} args
 */
export function calculateProbeConfidence({ terrainDef, surfaceRuntime, landmarkCues, passability }) {
  if (passability === "boundary") return 100;

  const baseM = Number(terrainDef?.probe?.confidenceMult);
  const b = Number.isFinite(baseM) && baseM > 0 ? baseM : 1;
  const surfM = Number(surfaceRuntime?.probeConfidenceMult);
  const s = Number.isFinite(surfM) && surfM > 0 ? surfM : 1;
  let lmM = Number(terrainDef?.probe?.landmarkCueMult);
  if (!Number.isFinite(lmM) || lmM <= 0) lmM = 1;
  if (Array.isArray(landmarkCues) && landmarkCues.length > 0) {
    lmM *= 1 + 0.05 * Math.min(landmarkCues.length, 4);
  }
  let conf = Math.round(100 * b * s * lmM);

  const tid = String(terrainDef?.id || "").trim();
  if (tid === "flagged_marker_line") conf = Math.min(100, conf + 20);
  else if (tid === "managed_compacted_route") conf = Math.min(100, conf + 10);
  else if (tid === "rock_outcrop_nunatak") conf = Math.min(100, conf + 10);
  else if (tid === "loose_snowfield") conf -= 10;
  else if (tid === "snow_drift_zone") conf -= 15;
  else if (tid === "sastrugi_field") conf -= 5;

  if (
    tid === "ice_shelf_edge" ||
    tid === "ice_cliff_coast" ||
    tid === "tide_crack_zone"
  ) {
    conf = Math.max(conf, 90);
  }

  return clampIntConfidence(conf);
}

function zhCharCount(s) {
  return Array.from(String(s || "")).length;
}

/**
 * @param {object} probeResultInput partial or full probe-shaped object
 */
export function buildProbeText(probeResultInput) {
  const p = probeResultInput && typeof probeResultInput === "object" ? probeResultInput : {};
  const pass = String(p.passability || "");
  const tid = String(p.terrainId || "");
  const cues = Array.isArray(p.landmarkCues) ? p.landmarkCues : [];
  const tags = Array.isArray(p.warningTags) ? p.warningTags : [];
  const vis = String(p.visibilityLevel || "");

  let text = "";
  if (pass === "boundary") text = "再往前会离开巡查范围。";
  else if (tid === "ice_shelf_edge") text = "前方冰面断开，不能继续。";
  else if (tid === "crevasse_field") text = "前方是裂隙带，不能贸然进入。";
  else if (cues.length > 0) {
    const lab = String(cues[0].label || cues[0].id || "").trim() || "地标";
    text = `能辨认出「${lab}」的方向。`;
  } else if (tid === "sastrugi_field") text = "那边雪脊明显，落脚会慢。";
  else if (tid === "snow_drift_zone") text = "那边积雪更深，推进会费力。";
  else if (tid === "flagged_marker_line") text = "能看见旧标记杆，方向较稳。";
  else if (tid === "managed_compacted_route") text = "压实雪面还算清楚。";
  else if (vis === "whiteout" || tags.includes("whiteout")) text = "能见度很差，只能判断近处轮廓。";
  else text = "前方地貌可通行，但仍需留意风雪。";

  if (zhCharCount(text) > 36) {
    text = Array.from(text).slice(0, 35).join("") + "…";
  }
  return text;
}

function isSlowTerrain(terrainDef, terrainId, stepMinutes, areaBaseMinutes) {
  const foot = String(terrainDef?.passability?.foot || "");
  if (foot === "slow") return true;
  const tid = String(terrainId || "");
  if (tid === "loose_snowfield" || tid === "sastrugi_field") return true;
  const base = Number(areaBaseMinutes);
  if (Number.isFinite(stepMinutes) && Number.isFinite(base) && base > 0 && stepMinutes > base * 1.22) return true;
  return false;
}

function buildWarningTags({
  terrainId,
  terrainDef,
  passability,
  hardBlock,
  surfaceRuntime,
  landmarkCues
}) {
  const tags = [];
  const tid = String(terrainId || "");
  const foot = String(terrainDef?.passability?.foot || "");

  if (passability === "boundary") tags.push("boundary");
  if (passability === "blocked" && (foot === "hard_block" || foot === "forbidden")) tags.push("hard_block");
  if (tid === "crevasse_field") tags.push("crevasse_requirement");
  if (foot === "conditional" && tid !== "crevasse_field") tags.push("requires_check");
  if (passability === "slow") tags.push("slow_surface");
  if (tid === "sastrugi_field") tags.push("sastrugi");
  if (tid === "blue_ice_area") tags.push("poor_trail_retention");
  const vis = String(surfaceRuntime?.visibilityLevel || "");
  if (vis === "reduced" || vis === "low") tags.push("low_visibility");
  if (vis === "whiteout") tags.push("whiteout");
  if (Array.isArray(landmarkCues) && landmarkCues.length > 0) tags.push("landmark_near");
  return tags;
}

/**
 * @param {{
 *   wilderness: object,
 *   areaSpec: object,
 *   regionProfile: object,
 *   direction: string,
 *   worldWeather: object|null|undefined,
 *   totalMinutes: number|null|undefined
 * }} args
 */
export function buildWildernessProbeResultForDirection({
  wilderness,
  areaSpec,
  regionProfile,
  direction,
  worldWeather,
  totalMinutes
}) {
  const dir = String(direction || "").trim();
  const wx = Number.isInteger(wilderness?.x) ? wilderness.x : 0;
  const wy = Number.isInteger(wilderness?.y) ? wilderness.y : 0;
  const delta = getWildernessDirectionDelta(dir);
  const dx = delta ? delta.x : 0;
  const dy = delta ? delta.y : 0;
  const toX = wx + dx;
  const toY = wy + dy;

  const q = queryWildernessCoordinate(areaSpec, toX, toY);
  // True boundary (target lies outside authored area bounds). The optional
  // active-cell mask is *not* a boundary cause here.
  if (q.kind === "boundary" && q.boundaryKind === "out_of_bounds") {
    const base = {
      direction: dir,
      terrainId: null,
      terrainLabel: null,
      confidence: 100,
      passability: "boundary",
      timeCostPreview: Infinity,
      staminaCostPreview: Infinity,
      hardBlock: true,
      blockerStyle: "void",
      warningTags: ["boundary"],
      landmarkCues: [],
      text: ""
    };
    base.text = buildProbeText({ ...base, landmarkCues: [] });
    return base;
  }

  const terrainId = q.terrainId != null ? String(q.terrainId) : null;
  const terrainDef = q.terrainDef || (terrainId ? getTerrainBiomeDef(terrainId) : null);
  const terrainLabel = terrainDef?.label != null ? String(terrainDef.label) : null;

  const landmarkCues = collectLandmarkCuesForCoordinate({ areaSpec, x: toX, y: toY });

  const minuteOfDay = resolveMinuteOfDayFromTotalMinutes(totalMinutes);
  const weatherInput = worldWeather && typeof worldWeather === "object" ? worldWeather : undefined;
  const surfaceRuntime =
    regionProfile && terrainDef
      ? buildWildernessSurfaceRuntime({
          regionProfile,
          terrainDef,
          worldWeather: weatherInput,
          minuteOfDay
        })
      : null;

  let passability = "allowed";
  let hardBlock = false;
  let timeCostPreview = 0;
  let staminaCostPreview = 0;

  if (terrainId === "crevasse_field") {
    passability = "blocked";
    hardBlock = true;
    timeCostPreview = Infinity;
    staminaCostPreview = Infinity;
  } else {
    const foot = String(terrainDef?.passability?.foot || "").trim();
    if (foot === "hard_block" || foot === "forbidden") {
      passability = "blocked";
      hardBlock = true;
      timeCostPreview = Infinity;
      staminaCostPreview = Infinity;
    } else if (foot === "conditional") {
      passability = "conditional";
      timeCostPreview = calculateWildernessStepMinutes({ areaSpec, terrainDef, surfaceRuntime, direction: dir });
      staminaCostPreview = calculateWildernessStaminaCost({ areaSpec, terrainDef, surfaceRuntime, direction: dir });
    } else {
      timeCostPreview = calculateWildernessStepMinutes({ areaSpec, terrainDef, surfaceRuntime, direction: dir });
      staminaCostPreview = calculateWildernessStaminaCost({ areaSpec, terrainDef, surfaceRuntime, direction: dir });
      if (isSlowTerrain(terrainDef, terrainId, timeCostPreview, areaSpec?.step?.baseMinutes)) {
        passability = "slow";
      } else {
        passability = "allowed";
      }
    }
  }

  const warningTags = buildWarningTags({
    terrainId,
    terrainDef,
    passability,
    hardBlock,
    surfaceRuntime,
    landmarkCues
  });

  const confidence = calculateProbeConfidence({
    terrainDef,
    surfaceRuntime,
    landmarkCues,
    passability
  });

  const visibilityLevel = surfaceRuntime ? String(surfaceRuntime.visibilityLevel || "") : "";

  const text = buildProbeText({
    direction: dir,
    terrainId,
    passability,
    landmarkCues,
    warningTags,
    visibilityLevel
  });

  let blockerStyle = null;
  if (hardBlock) {
    if (terrainId === "open_water" || terrainId === "coastal_open_water") {
      blockerStyle = "sea";
    } else {
      blockerStyle = "hard_terrain";
    }
  }

  return {
    direction: dir,
    terrainId,
    terrainLabel,
    confidence,
    passability,
    timeCostPreview,
    staminaCostPreview,
    hardBlock,
    blockerStyle,
    warningTags,
    landmarkCues,
    text
  };
}

/**
 * @param {{
 *   wilderness: object,
 *   areaSpec: object,
 *   regionProfile: object,
 *   worldWeather: object|null|undefined,
 *   totalMinutes: number|null|undefined
 * }} args
 */
export function buildWildernessProbeResults({
  wilderness,
  areaSpec,
  regionProfile,
  worldWeather,
  totalMinutes
}) {
  return WILDERNESS_MOVE_DIRECTIONS.map((direction) =>
    buildWildernessProbeResultForDirection({
      wilderness,
      areaSpec,
      regionProfile,
      direction,
      worldWeather,
      totalMinutes
    })
  );
}
