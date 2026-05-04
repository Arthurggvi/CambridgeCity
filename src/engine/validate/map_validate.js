// ============================================================================
// Map Validate - 地图 JSON 校验（v0.3 / P0-1）
// ============================================================================
// 目标：
// - 把“地图动作渲染”与“地图动作语义”都推向数据驱动
// - loader 在缓存前强校验，避免坏数据把运行时弄崩
//
// 约束：
// - 校验失败：必须 console.error 输出：fileName + 字段路径
// - loader 应返回 null（不缓存）
// ============================================================================

import { hasTransitStopId } from "../transit/transit_validate.js";
import { validateArchiveReadingContract } from "./archive_reading_contract_validate.js";
import { validateActionSemanticContract } from "./action_semantic_contract_validate.js";
import { validateBusinessSemanticContract } from "../business/business_semantic_validate.js";
import { WILDERNESS_MOVE_DIRECTIONS } from "../wilderness/wilderness_movement_cost.js";

function err(fileName, path, message) {
  console.error(`${fileName} -> ${path}: ${message}`);
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isInt(n) {
  return Number.isInteger(n);
}

const MAP_CONTENT_V2 = 2;
const V2_INTERACTION_TYPES = new Set(["OBSERVE", "REST", "TRANSITION", "MENU_OPEN", "PURCHASE", "TIME_SKIP"]);
const GRANDFATHERED_LEGACY_MAP_FILES = new Set([
  "bayport_clinic.json",
  "bayport_clinic_counter_day.json",
  "bayport_clinic_counter_night.json",
  "bayport_clinic_obs.json",
  "bayport_clinic_queue_intro_1.json",
  "bayport_clinic_queue_intro_2.json",
  "bayport_clinic_rooftop.json",
  "bayport_clinic_upstairs_hall.json",
  "bayport_clinic_ward.json",
  "gov_hall_entry_split.json",
  "gov_hall_main_hall.json",
  "gov_hall_side_corridor.json",
  "gov_hall_window_1.json",
  "heatcorridor_bus_stop.json",
  "heatcorridor_night_kitchen_counter.json",
  "heatcorridor_rear_section.json",
  "heatcorridor_shop_window.json",
  "hub_01.json",
  "industrial_bus_stop.json",
  "industrial_maintenance_gate.json",
  "industrial_split.json",
  "industrial_warehouse_gate.json",
  "intro_clinic_bed.json",
  "intro_clinic_bed_lin_1.json",
  "intro_clinic_bed_lin_2.json",
  "intro_clinic_bed_lin_3.json",
  "intro_clinic_bed_lin_4.json",
  "link_01.json",
  "menu.json",
  "menu_credits.json",
  "menu_achievements.json",
  "menu_load.json",
  "menu_main.json",
  "menu_more.json",
  "menu_settings.json",
  "rear_zone_dorm_placeholder.json",
  "rear_zone_lodging_checkout_0900.json",
  "rear_zone_lodging_confirm_01.json",
  "rear_zone_lodging_counter_01.json",
  "rear_zone_lodging_insufficient_01.json",
  "rear_zone_lodging_intro_01.json",
  "rear_zone_lodging_intro_02.json",
  "rear_zone_lodging_quote_01.json",
  "test_broken_ref.json",
  "test_requires.json",
  "test_temp.json",
  "test_time.json",
  "w2_spine_0.json",
  "w2_spine_1.json",
  "w2_spine_2.json",
  "w2_spine_3.json",
  "w2_spine_4.json",
  "w2_spine_5.json",
  "w2_spine_6.json",
  "w2_spine_7.json",
  "west2_bus_onboard.json",
  "west2_gate.json",
  "west2_link_corridor_01.json",
  "winddyke_bus_stop.json",
  "winddyke_street_clinic_segment.json",
  "winddyke_street_corner_notice.json",
  "wilderness_runtime.json"
]);

const REQUIRES_OPS = new Set(["<", "<=", ">", ">=", "==", "!="]);
const MAP_SOCIAL_EFFECT_TYPES = new Set(["discover_npc", "favor_delta", "unlock_dossier_block", "unlock_dossier_entry", "set_dossier_flag", "set_social_flag"]);

function isAllowedRequiresPath(path) {
  if (/^time\.windows\.[A-Za-z0-9_]+\.open$/.test(path)) return true;
  if (/^time\.providers\.[A-Za-z0-9_]+\.band$/.test(path)) return true;
  if (/^presence\.roleSlots\.[A-Za-z0-9_]+$/.test(path)) return true;
  if (/^presence\.presentNpcIds\.[A-Za-z0-9_]+$/.test(path)) return true;
  if (/^player\.social\.[A-Za-z0-9_]+\.favor$/.test(path)) return true;
  if (path === "player.hp") return true;
  if (path === "player.health") return true;
  if (path === "player.stamina") return true;
  if (path === "world.money") return true;
  if (path === "world.medical.bills.obsCents") return true;
  if (path === "world.medical.bills.wardCents") return true;
  if (path === "world.medical.bills.totalCents") return true;
  if (path === "time.minuteOfDay") return true;
  if (path === "time.calendar.month") return true;
  if (path === "time.calendar.day") return true;
  if (path === "time.calendar.monthDayCode") return true;
  return /^world\.flags\.[A-Za-z0-9_]+$/.test(path);
}

function validateRequires(requires, fileName, basePath) {
  if (!isPlainObject(requires)) {
    err(fileName, basePath, "requires 必须是对象");
    return false;
  }

  for (const key of ["all", "any"]) {
    if (!(key in requires)) continue;
    const arr = requires[key];
    const p = `${basePath}.${key}`;
    if (!Array.isArray(arr)) {
      err(fileName, p, "必须是数组");
      return false;
    }

    for (let i = 0; i < arr.length; i++) {
      const cond = arr[i];
      const cp = `${p}[${i}]`;
      if (!isPlainObject(cond)) {
        err(fileName, cp, "条件必须是对象");
        return false;
      }

      if (typeof cond.path !== "string" || cond.path.trim() === "") {
        err(fileName, `${cp}.path`, "必须是非空字符串");
        return false;
      }

      if (!isAllowedRequiresPath(cond.path)) {
        err(fileName, `${cp}.path`, "path 不在白名单（P0-3 仅允许 player.hp/player.health/player.stamina/player.social.<npcId>.favor/world.money/world.medical.bills.(obsCents|wardCents|totalCents)/time.minuteOfDay/time.calendar.(month|day|monthDayCode)/time.windows.<id>.open/time.providers.<id>.band/presence.roleSlots.<slot>/presence.presentNpcIds.<npcId>/world.flags.<key>）");
        return false;
      }

      if (typeof cond.op !== "string" || !REQUIRES_OPS.has(cond.op)) {
        err(fileName, `${cp}.op`, "必须是 < <= > >= == != 之一");
        return false;
      }

      if (!("value" in cond)) {
        err(fileName, `${cp}.value`, "字段缺失");
        return false;
      }

      // 类型约束（最小版）
      if (/^world\.flags\./.test(cond.path) || /^time\.windows\.[A-Za-z0-9_]+\.open$/.test(cond.path) || /^presence\.presentNpcIds\.[A-Za-z0-9_]+$/.test(cond.path)) {
        if (typeof cond.value !== "boolean") {
          err(fileName, `${cp}.value`, "world.flags.<key> / time.windows.<id>.open / presence.presentNpcIds.<npcId> 的 value 必须是 boolean");
          return false;
        }
      } else if (/^time\.providers\.[A-Za-z0-9_]+\.band$/.test(cond.path)) {
        if (typeof cond.value !== "string" || !cond.value.trim()) {
          err(fileName, `${cp}.value`, "time.providers.<id>.band 的 value 必须是非空字符串");
          return false;
        }
        if (cond.op !== "==" && cond.op !== "!=") {
          err(fileName, `${cp}.op`, "time.providers.<id>.band 仅允许 == / !=");
          return false;
        }
      } else if (/^presence\.roleSlots\.[A-Za-z0-9_]+$/.test(cond.path)) {
        if (typeof cond.value !== "string" || !cond.value.trim()) {
          err(fileName, `${cp}.value`, "presence.roleSlots.<slot> 的 value 必须是非空字符串");
          return false;
        }
        if (cond.op !== "==" && cond.op !== "!=") {
          err(fileName, `${cp}.op`, "presence.roleSlots.<slot> 仅允许 == / !=");
          return false;
        }
      } else {
        if (typeof cond.value !== "number" || !Number.isFinite(cond.value)) {
          err(fileName, `${cp}.value`, "数值型 path 的 value 必须是 number");
          return false;
        }
      }
    }
  }

  if ("profile" in requires) {
    const profile = requires.profile;
    const pp = `${basePath}.profile`;
    if (!isPlainObject(profile)) {
      err(fileName, pp, "必须是对象");
      return false;
    }

    const validateGteObj = (obj, path) => {
      if (!isPlainObject(obj)) {
        err(fileName, path, "必须是对象");
        return false;
      }
      if (!("gte" in obj)) {
        err(fileName, `${path}.gte`, "字段缺失");
        return false;
      }
      if (typeof obj.gte !== "number" || !Number.isFinite(obj.gte)) {
        err(fileName, `${path}.gte`, "必须是 number");
        return false;
      }
      return true;
    };

    if ("physique" in profile && !validateGteObj(profile.physique, `${pp}.physique`)) {
      return false;
    }

    if ("experience" in profile && !validateGteObj(profile.experience, `${pp}.experience`)) {
      return false;
    }

    if ("rationality" in profile && !validateGteObj(profile.rationality, `${pp}.rationality`)) {
      return false;
    }

    if ("faith" in profile && !validateGteObj(profile.faith, `${pp}.faith`)) {
      return false;
    }

    if ("worldviewAxis" in profile) {
      const worldviewAxis = profile.worldviewAxis;
      if (!isPlainObject(worldviewAxis)) {
        err(fileName, `${pp}.worldviewAxis`, "必须是对象");
        return false;
      }
      if (!("gte" in worldviewAxis) && !("lte" in worldviewAxis)) {
        err(fileName, `${pp}.worldviewAxis`, "至少需要 gte/lte 之一");
        return false;
      }
      if ("gte" in worldviewAxis && (typeof worldviewAxis.gte !== "number" || !Number.isFinite(worldviewAxis.gte))) {
        err(fileName, `${pp}.worldviewAxis.gte`, "必须是 number");
        return false;
      }
      if ("lte" in worldviewAxis && (typeof worldviewAxis.lte !== "number" || !Number.isFinite(worldviewAxis.lte))) {
        err(fileName, `${pp}.worldviewAxis.lte`, "必须是 number");
        return false;
      }
    }
  }

  return true;
}

function validateTopString(mapJson, fileName, key) {
  if (!(key in mapJson)) {
    err(fileName, key, "字段缺失");
    return false;
  }
  if (typeof mapJson[key] !== "string") {
    err(fileName, key, "必须是字符串");
    return false;
  }
  if (key === "id" && mapJson[key].trim() === "") {
    err(fileName, key, "必须是非空字符串");
    return false;
  }
  return true;
}

function validateSocialEffects(socialEffects, fileName, basePath) {
  if (!Array.isArray(socialEffects)) {
    err(fileName, basePath, "必须是数组");
    return false;
  }

  for (let i = 0; i < socialEffects.length; i++) {
    const effect = socialEffects[i];
    const effectPath = `${basePath}[${i}]`;
    if (!isPlainObject(effect)) {
      err(fileName, effectPath, "social effect 必须是对象");
      return false;
    }

    const effectType = typeof effect.type === "string" ? effect.type.trim().toLowerCase() : "";
    if (!MAP_SOCIAL_EFFECT_TYPES.has(effectType)) {
      err(fileName, `${effectPath}.type`, "必须是 discover_npc/favor_delta/unlock_dossier_block/unlock_dossier_entry/set_dossier_flag/set_social_flag 之一");
      return false;
    }
    if (typeof effect.npcId !== "string" || effect.npcId.trim() === "") {
      err(fileName, `${effectPath}.npcId`, "必须是非空字符串");
      return false;
    }
    if (effectType === "favor_delta" && !Number.isFinite(Number(effect.delta))) {
      err(fileName, `${effectPath}.delta`, "favor_delta 必须提供有限 number");
      return false;
    }
    if (effectType === "unlock_dossier_block" && (typeof effect.blockId !== "string" || effect.blockId.trim() === "")) {
      err(fileName, `${effectPath}.blockId`, "unlock_dossier_block 必须提供非空字符串");
      return false;
    }
    if (effectType === "unlock_dossier_entry" && (typeof effect.entryId !== "string" || effect.entryId.trim() === "")) {
      err(fileName, `${effectPath}.entryId`, "unlock_dossier_entry 必须提供非空字符串");
      return false;
    }
    if (effectType === "set_dossier_flag" || effectType === "set_social_flag") {
      if (typeof effect.flagId !== "string" || effect.flagId.trim() === "") {
        err(fileName, `${effectPath}.flagId`, `${effectType} 必须提供非空字符串`);
        return false;
      }
      if (typeof effect.value !== "boolean") {
        err(fileName, `${effectPath}.value`, `${effectType}.value 必须是 boolean`);
        return false;
      }
    }
    if ("reason" in effect && (typeof effect.reason !== "string" || effect.reason.trim() === "")) {
      err(fileName, `${effectPath}.reason`, "若存在必须是非空字符串");
      return false;
    }
  }

  return true;
}

function validateOnEnterEffects(onEnterEffects, fileName, basePath) {
  if (!isPlainObject(onEnterEffects)) {
    err(fileName, basePath, "必须是对象");
    return false;
  }
  for (const key of Object.keys(onEnterEffects)) {
    if (key !== "socialEffects") {
      err(fileName, `${basePath}.${key}`, "当前仅支持 socialEffects");
      return false;
    }
  }
  if ("socialEffects" in onEnterEffects && !validateSocialEffects(onEnterEffects.socialEffects, fileName, `${basePath}.socialEffects`)) {
    return false;
  }
  return true;
}

function validateV2Edge(edge, fileName, basePath, sceneIds) {
  if (!isPlainObject(edge)) {
    err(fileName, basePath, "edge 必须是对象");
    return false;
  }
  if (typeof edge.id !== "string" || edge.id.trim() === "") {
    err(fileName, `${basePath}.id`, "必须是非空字符串");
    return false;
  }
  if (typeof edge.fromSceneId !== "string" || !sceneIds.has(edge.fromSceneId.trim())) {
    err(fileName, `${basePath}.fromSceneId`, "必须引用已声明 sceneId");
    return false;
  }
  if ("toSceneId" in edge && edge.toSceneId != null) {
    if (typeof edge.toSceneId !== "string" || !sceneIds.has(edge.toSceneId.trim())) {
      err(fileName, `${basePath}.toSceneId`, "若存在必须引用已声明 sceneId");
      return false;
    }
  }
  if ("toMapId" in edge && edge.toMapId != null) {
    if (typeof edge.toMapId !== "string" || edge.toMapId.trim() === "") {
      err(fileName, `${basePath}.toMapId`, "若存在必须是非空字符串");
      return false;
    }
  }
  if ("minutes" in edge && !isInt(edge.minutes)) {
    err(fileName, `${basePath}.minutes`, "若存在必须是整数");
    return false;
  }
  return true;
}

function validateV2Interaction(interaction, fileName, basePath, sceneIds, edgeIds) {
  if (!isPlainObject(interaction)) {
    err(fileName, basePath, "interaction 必须是对象");
    return false;
  }
  if (typeof interaction.id !== "string" || interaction.id.trim() === "") {
    err(fileName, `${basePath}.id`, "必须是非空字符串");
    return false;
  }
  if (typeof interaction.sceneId !== "string" || !sceneIds.has(interaction.sceneId.trim())) {
    err(fileName, `${basePath}.sceneId`, "必须引用已声明 sceneId");
    return false;
  }
  if (typeof interaction.type !== "string" || !V2_INTERACTION_TYPES.has(interaction.type.trim())) {
    err(fileName, `${basePath}.type`, "必须是受支持的 V2 interaction type");
    return false;
  }
  if (typeof interaction.text !== "string") {
    err(fileName, `${basePath}.text`, "必须是字符串");
    return false;
  }
  if ("edgeId" in interaction && interaction.edgeId != null) {
    if (typeof interaction.edgeId !== "string" || !edgeIds.has(interaction.edgeId.trim())) {
      err(fileName, `${basePath}.edgeId`, "若存在必须引用已声明 edgeId");
      return false;
    }
  }
  if (interaction.requires && !validateRequires(interaction.requires, fileName, `${basePath}.requires`)) {
    return false;
  }
  if (interaction?.ui?.disabledRequires && !validateRequires(interaction.ui.disabledRequires, fileName, `${basePath}.ui.disabledRequires`)) {
    return false;
  }
  if ("minutes" in interaction && !isInt(interaction.minutes)) {
    err(fileName, `${basePath}.minutes`, "若存在必须是整数");
    return false;
  }
  const semanticResult = validateActionSemanticContract(interaction, fileName, basePath);
  if (!semanticResult.ok) {
    semanticResult.errors.forEach((message) => console.error(message));
    return false;
  }
  const businessSemanticResult = validateBusinessSemanticContract(interaction?.semantic, fileName, `${basePath}.semantic`);
  if (!businessSemanticResult.ok) {
    businessSemanticResult.errors.forEach((message) => console.error(message));
    return false;
  }
  return true;
}

function validateMapV2(mapJson, fileName) {
  for (const key of ["id", "name", "description", "entrySceneId"]) {
    if (!validateTopString(mapJson, fileName, key)) return false;
  }

  if (!Array.isArray(mapJson.scenes) || mapJson.scenes.length === 0) {
    err(fileName, "scenes", "V2 地图必须声明非空 scenes 数组");
    return false;
  }
  if (!Array.isArray(mapJson.interactions)) {
    err(fileName, "interactions", "V2 地图必须声明 interactions 数组");
    return false;
  }
  if (!Array.isArray(mapJson.edges)) {
    err(fileName, "edges", "V2 地图必须声明 edges 数组");
    return false;
  }
  if (!Array.isArray(mapJson.blockers)) {
    err(fileName, "blockers", "V2 地图必须声明 blockers 数组");
    return false;
  }
  if (!Array.isArray(mapJson.sessions)) {
    err(fileName, "sessions", "V2 地图必须声明 sessions 数组");
    return false;
  }

  if ("actions" in mapJson && Array.isArray(mapJson.actions) && mapJson.actions.length > 0) {
    err(fileName, "actions", "V2 地图不得继续把主动作挂在 root map.actions");
    return false;
  }
  if ("onEnterEffects" in mapJson && !validateOnEnterEffects(mapJson.onEnterEffects, fileName, "onEnterEffects")) {
    return false;
  }

  const sceneIds = new Set();
  for (let i = 0; i < mapJson.scenes.length; i++) {
    const scene = mapJson.scenes[i];
    const basePath = `scenes[${i}]`;
    if (!isPlainObject(scene)) {
      err(fileName, basePath, "scene 必须是对象");
      return false;
    }
    if (typeof scene.id !== "string" || scene.id.trim() === "") {
      err(fileName, `${basePath}.id`, "必须是非空字符串");
      return false;
    }
    if (sceneIds.has(scene.id.trim())) {
      err(fileName, `${basePath}.id`, "sceneId 不能重复");
      return false;
    }
    if (typeof scene.type !== "string" || scene.type.trim() === "") {
      err(fileName, `${basePath}.type`, "必须是非空字符串");
      return false;
    }
    sceneIds.add(scene.id.trim());
  }

  if (!sceneIds.has(mapJson.entrySceneId.trim())) {
    err(fileName, "entrySceneId", "必须引用已声明 sceneId");
    return false;
  }

  const edgeIds = new Set();
  for (let i = 0; i < mapJson.edges.length; i++) {
    const edge = mapJson.edges[i];
    const basePath = `edges[${i}]`;
    if (!validateV2Edge(edge, fileName, basePath, sceneIds)) return false;
    if (edgeIds.has(edge.id.trim())) {
      err(fileName, `${basePath}.id`, "edgeId 不能重复");
      return false;
    }
    edgeIds.add(edge.id.trim());
  }

  for (let i = 0; i < mapJson.interactions.length; i++) {
    if (!validateV2Interaction(mapJson.interactions[i], fileName, `interactions[${i}]`, sceneIds, edgeIds)) {
      return false;
    }
  }

  const interactionsBySceneId = new Map();
  for (const interaction of mapJson.interactions) {
    const sceneId = String(interaction?.sceneId || "").trim();
    if (!sceneId) continue;
    const existing = interactionsBySceneId.get(sceneId) || [];
    existing.push(interaction);
    interactionsBySceneId.set(sceneId, existing);
  }
  const archivePageIds = new Set();
  for (let i = 0; i < mapJson.scenes.length; i++) {
    const scene = mapJson.scenes[i];
    const basePath = `scenes[${i}]`;
    const result = validateArchiveReadingContract(scene, fileName, basePath, { interactionsBySceneId });
    if (!result.ok) {
      result.errors.forEach((message) => console.error(message));
      return false;
    }
    const pageId = String(scene?.archiveReading?.pageId || "").trim();
    if (pageId) {
      if (archivePageIds.has(pageId)) {
        err(fileName, `${basePath}.archiveReading.pageId`, "同一地图内 archive pageId 不能重复");
        return false;
      }
      archivePageIds.add(pageId);
    }
  }

  return true;
}

export function validateMapAuthoringMode(mapJson, fileName) {
  if (Number(mapJson?.contentVersion || 0) === MAP_CONTENT_V2) {
    return validateMapV2(mapJson, fileName);
  }
  if (mapJson?.legacy === true) {
    return validateLegacyMap(mapJson, fileName);
  }
  err(fileName, "legacy", "新增 legacy 风格地图必须显式声明 legacy: true；默认应使用 contentVersion: 2");
  return false;
}

/**
 * 校验地图 JSON（最小 schema）
 *
 * 必须存在：id/name/description/actions
 * actions 必须是数组
 * actions[i] 必须有 id/text
 *
 * ui.type === "slider_minutes" 时：
 * - 必须有 min/max/step/default 且都是整数
 * - min <= default <= max
 * - step > 0
 *
 * @param {object} mapJson
 * @param {string} fileName
 * @returns {boolean}
 */
function validateLegacyMap(mapJson, fileName) {
  if (!isPlainObject(mapJson)) {
    err(fileName, "$", "mapJson 必须是对象");
    return false;
  }

  if (Number(mapJson?.contentVersion || 0) === MAP_CONTENT_V2) {
    return validateMapV2(mapJson, fileName);
  }

  // ========== mapType（可选，缺省 normal）==========
  const mapType = ("mapType" in mapJson) ? mapJson.mapType : "normal";
  if (mapType !== "normal" && mapType !== "link" && mapType !== "wilderness_runtime") {
    err(fileName, "mapType", '若存在必须是 "normal" / "link" / "wilderness_runtime"');
    return false;
  }

  // P0-2：mapType=link 仅作为语义标签，本阶段不强制任何额外结构

  const requiredTop = ["id", "name", "description", "actions"];
  for (const key of requiredTop) {
    if (!(key in mapJson)) {
      err(fileName, key, "字段缺失");
      return false;
    }
  }

  if (typeof mapJson.id !== "string" || mapJson.id.trim() === "") {
    err(fileName, "id", "必须是非空字符串");
    return false;
  }

  if (typeof mapJson.name !== "string") {
    err(fileName, "name", "必须是字符串");
    return false;
  }

  if (typeof mapJson.description !== "string") {
    err(fileName, "description", "必须是字符串");
    return false;
  }

  if ("placeProfileId" in mapJson) {
    if (typeof mapJson.placeProfileId !== "string" || mapJson.placeProfileId.trim() === "") {
      err(fileName, "placeProfileId", "若存在必须是非空字符串");
      return false;
    }
  }

  if (!Array.isArray(mapJson.actions)) {
    err(fileName, "actions", "必须是数组");
    return false;
  }

  if (mapType === "wilderness_runtime") {
    if (mapJson.actions.length !== 9) {
      err(fileName, "actions", "wilderness_runtime 地图必须恰好包含 9 个 action（8 向移动 + 1 结束会话）");
      return false;
    }
    const kinds = mapJson.actions.map((a) => a?.kind);
    const moveCount = kinds.filter((k) => k === "WILDERNESS_MOVE").length;
    const endCount = kinds.filter((k) => k === "WILDERNESS_END_SESSION").length;
    if (moveCount !== 8 || endCount !== 1) {
      err(fileName, "actions", "wilderness_runtime 必须包含 8 个 WILDERNESS_MOVE 与 1 个 WILDERNESS_END_SESSION");
      return false;
    }
    const ids = new Set(mapJson.actions.map((a) => String(a?.id || "").trim()).filter(Boolean));
    if (!ids.has("wilderness_end_return_fallback")) {
      err(fileName, "actions", "缺少 id=wilderness_end_return_fallback 的结束会话 action");
      return false;
    }
    const moveDirs = new Set();
    for (const a of mapJson.actions) {
      if (a?.kind === "WILDERNESS_MOVE") {
        moveDirs.add(String(a?.wilderness?.direction || "").trim());
      }
    }
    for (const need of WILDERNESS_MOVE_DIRECTIONS) {
      if (!moveDirs.has(need)) {
        err(fileName, "actions", `缺少 WILDERNESS_MOVE 方向: ${need}`);
        return false;
      }
    }
    if ("onEnterEffects" in mapJson) {
      err(fileName, "onEnterEffects", "wilderness_runtime 地图不允许 onEnterEffects");
      return false;
    }
    if ("effects" in mapJson) {
      err(fileName, "effects", "wilderness_runtime 地图不允许顶层 effects");
      return false;
    }
    if ("semantic" in mapJson) {
      err(fileName, "semantic", "wilderness_runtime 地图不允许顶层 semantic");
      return false;
    }
    if ("requires" in mapJson) {
      err(fileName, "requires", "wilderness_runtime 地图不允许顶层 requires");
      return false;
    }
  }

  if ("onEnterEffects" in mapJson && !validateOnEnterEffects(mapJson.onEnterEffects, fileName, "onEnterEffects")) {
    return false;
  }

  for (let i = 0; i < mapJson.actions.length; i++) {
    const action = mapJson.actions[i];
    const basePath = `actions[${i}]`;

    if (!isPlainObject(action)) {
      err(fileName, basePath, "action 必须是对象");
      return false;
    }

    if (typeof action.id !== "string" || action.id.trim() === "") {
      err(fileName, `${basePath}.id`, "必须是非空字符串");
      return false;
    }

    if (typeof action.text !== "string") {
      err(fileName, `${basePath}.text`, "必须是字符串");
      return false;
    }

    if (mapType === "wilderness_runtime") {
      const k = String(action.kind || "").trim();
      if (k === "WILDERNESS_MOVE") {
        const moveForbidden = [
          "effects",
          "semantic",
          "requires",
          "payload",
          "goto",
          "target",
          "to",
          "transition",
          "eventId",
          "targetMapId",
          "targetSceneId",
          "onEnterEffects",
          "socialEffects",
          "recordUnlock",
          "ui",
          "minutes"
        ];
        for (const fk of moveForbidden) {
          if (fk in action) {
            err(fileName, `${basePath}.${fk}`, "wilderness_runtime WILDERNESS_MOVE action 不允许该字段");
            return false;
          }
        }
        if (!isPlainObject(action.wilderness)) {
          err(fileName, `${basePath}.wilderness`, "必须是对象");
          return false;
        }
        const wKeys = Object.keys(action.wilderness);
        if (wKeys.length !== 1 || wKeys[0] !== "direction") {
          err(fileName, `${basePath}.wilderness`, "必须仅包含 direction 字段");
          return false;
        }
        const dir = String(action.wilderness.direction || "").trim();
        if (!WILDERNESS_MOVE_DIRECTIONS.includes(dir)) {
          err(fileName, `${basePath}.wilderness.direction`, "非法八向枚举值");
          return false;
        }
        if (action.id !== `wilderness_move_${dir}`) {
          err(fileName, `${basePath}.id`, `必须与 wilderness.direction 一致（期望 wilderness_move_${dir}）`);
          return false;
        }
        const semanticResultMove = validateActionSemanticContract(action, fileName, basePath);
        if (!semanticResultMove.ok) {
          semanticResultMove.errors.forEach((message) => console.error(message));
          return false;
        }
        const businessSemanticResultMove = validateBusinessSemanticContract(action?.semantic, fileName, `${basePath}.semantic`);
        if (!businessSemanticResultMove.ok) {
          businessSemanticResultMove.errors.forEach((message) => console.error(message));
          return false;
        }
        continue;
      }
      if (k === "WILDERNESS_END_SESSION") {
        const allowedKeys = new Set(["id", "text", "kind"]);
        for (const key of Object.keys(action)) {
          if (!allowedKeys.has(key)) {
            err(fileName, `${basePath}.${key}`, "WILDERNESS_END_SESSION action 仅允许 id / text / kind");
            return false;
          }
        }
        if (action.id !== "wilderness_end_return_fallback") {
          err(fileName, `${basePath}.id`, "必须是 wilderness_end_return_fallback");
          return false;
        }
        const semanticResultEnd = validateActionSemanticContract(action, fileName, basePath);
        if (!semanticResultEnd.ok) {
          semanticResultEnd.errors.forEach((message) => console.error(message));
          return false;
        }
        const businessSemanticResultEnd = validateBusinessSemanticContract(action?.semantic, fileName, `${basePath}.semantic`);
        if (!businessSemanticResultEnd.ok) {
          businessSemanticResultEnd.errors.forEach((message) => console.error(message));
          return false;
        }
        continue;
      }
      err(fileName, `${basePath}.kind`, `wilderness_runtime 不允许 action.kind=${k}`);
      return false;
    }

    // ========== kind=TRANSITION 校验（P0-2）==========
    if (action.kind === "TRANSITION") {
      if (!isPlainObject(action.payload)) {
        err(fileName, `${basePath}.payload`, "TRANSITION 必须提供 payload 对象");
        return false;
      }

      if (typeof action.payload.toMapId !== "string" || action.payload.toMapId.trim() === "") {
        err(fileName, `${basePath}.payload.toMapId`, "必须是非空字符串");
        return false;
      }

      if ("minutes" in action.payload) {
        if (!isInt(action.payload.minutes) || action.payload.minutes < 0) {
          err(fileName, `${basePath}.payload.minutes`, "若存在必须是整数且 >= 0");
          return false;
        }
      }

      // 本阶段不支持其他 payload 字段
      const allowedKeys = new Set(["toMapId", "minutes"]);
      for (const k of Object.keys(action.payload)) {
        if (!allowedKeys.has(k)) {
          err(fileName, `${basePath}.payload.${k}`, "P0-2 不支持该字段（仅允许 toMapId / minutes）");
          return false;
        }
      }
    }

    if (action.kind === "TRANSIT_STOP_ENTRY") {
      if (!isPlainObject(action.payload)) {
        err(fileName, `${basePath}.payload`, "TRANSIT_STOP_ENTRY 必须提供 payload 对象");
        return false;
      }

      if (typeof action.payload.stopId !== "string" || action.payload.stopId.trim() === "") {
        err(fileName, `${basePath}.payload.stopId`, "必须是非空字符串");
        return false;
      }

      if (!hasTransitStopId(action.payload.stopId)) {
        err(fileName, `${basePath}.payload.stopId`, `未知公交站点：${action.payload.stopId}`);
        return false;
      }

      const allowedKeys = new Set(["stopId", "intentType"]);
      for (const k of Object.keys(action.payload)) {
        if (!allowedKeys.has(k)) {
          err(fileName, `${basePath}.payload.${k}`, "TRANSIT_STOP_ENTRY 仅允许 stopId / intentType");
          return false;
        }
      }

      if ("intentType" in action.payload && (typeof action.payload.intentType !== "string" || action.payload.intentType.trim() === "")) {
        err(fileName, `${basePath}.payload.intentType`, "若存在必须是非空字符串");
        return false;
      }
    }

    if (action.kind === "TRANSIT_BOARD") {
      if (!isPlainObject(action.payload)) {
        err(fileName, `${basePath}.payload`, "TRANSIT_BOARD 必须提供 payload 对象");
        return false;
      }

      if (typeof action.payload.stopId !== "string" || action.payload.stopId.trim() === "") {
        err(fileName, `${basePath}.payload.stopId`, "必须是非空字符串");
        return false;
      }

      if (!hasTransitStopId(action.payload.stopId)) {
        err(fileName, `${basePath}.payload.stopId`, `未知公交站点：${action.payload.stopId}`);
        return false;
      }

      if ("lineId" in action.payload && (typeof action.payload.lineId !== "string" || action.payload.lineId.trim() === "")) {
        err(fileName, `${basePath}.payload.lineId`, "若存在必须是非空字符串");
        return false;
      }

      if (!isInt(action.payload.direction) || (action.payload.direction !== -1 && action.payload.direction !== 1)) {
        err(fileName, `${basePath}.payload.direction`, "必须是 -1 或 1");
        return false;
      }

      const allowedKeys = new Set(["stopId", "lineId", "direction"]);
      for (const k of Object.keys(action.payload)) {
        if (!allowedKeys.has(k)) {
          err(fileName, `${basePath}.payload.${k}`, "TRANSIT_BOARD 仅允许 stopId / lineId / direction");
          return false;
        }
      }
    }

    if (action.kind === "TRANSIT_CONTINUE" || action.kind === "TRANSIT_GET_OFF") {
      if ("payload" in action && !isPlainObject(action.payload)) {
        err(fileName, `${basePath}.payload`, `${action.kind} 若存在 payload 必须是对象`);
        return false;
      }

      if (isPlainObject(action.payload) && Object.keys(action.payload).length > 0) {
        err(fileName, `${basePath}.payload`, `${action.kind} 不支持额外 payload 字段`);
        return false;
      }
    }

    // ui 默认允许缺省（向后兼容：默认 button）
    if ("ui" in action) {
      if (!isPlainObject(action.ui)) {
        err(fileName, `${basePath}.ui`, "必须是对象");
        return false;
      }

      const uiType = action.ui.type ?? "button";
      if (typeof uiType !== "string") {
        err(fileName, `${basePath}.ui.type`, "必须是字符串");
        return false;
      }

      if (uiType === "slider_minutes") {
        const keys = ["min", "max", "step", "default"];
        for (const k of keys) {
          if (!(k in action.ui)) {
            err(fileName, `${basePath}.ui.${k}`, "字段缺失");
            return false;
          }
          if (!isInt(action.ui[k])) {
            err(fileName, `${basePath}.ui.${k}`, "必须是整数");
            return false;
          }
        }

        const min = action.ui.min;
        const max = action.ui.max;
        const step = action.ui.step;
        const def = action.ui.default;

        if (min > max) {
          err(fileName, `${basePath}.ui.min`, "min 不能大于 max");
          return false;
        }

        if (step <= 0) {
          err(fileName, `${basePath}.ui.step`, "step 必须 > 0");
          return false;
        }

        if (def < min || def > max) {
          err(fileName, `${basePath}.ui.default`, "default 必须落在 [min, max]" );
          return false;
        }
      }

      // P0-3：lockedBehavior
      if ("lockedBehavior" in action.ui) {
        const v = action.ui.lockedBehavior;
        if (v !== "hide" && v !== "show") {
          err(fileName, `${basePath}.ui.lockedBehavior`, '若存在只能是 "hide" 或 "show"');
          return false;
        }
      }
    }

    // P0-3：requires
    if ("requires" in action) {
      const ok = validateRequires(action.requires, fileName, `${basePath}.requires`);
      if (!ok) return false;
    }
    if ("socialEffects" in action && !validateSocialEffects(action.socialEffects, fileName, `${basePath}.socialEffects`)) {
      return false;
    }
    const semanticResult = validateActionSemanticContract(action, fileName, basePath);
    if (!semanticResult.ok) {
      semanticResult.errors.forEach((message) => console.error(message));
      return false;
    }
    const businessSemanticResult = validateBusinessSemanticContract(action?.semantic, fileName, `${basePath}.semantic`);
    if (!businessSemanticResult.ok) {
      businessSemanticResult.errors.forEach((message) => console.error(message));
      return false;
    }
  }

  return true;
}

export function validateMap(mapJson, fileName) {
  if (Number(mapJson?.contentVersion || 0) === MAP_CONTENT_V2) {
    return validateMapV2(mapJson, fileName);
  }
  if (mapJson?.legacy === true) {
    return validateLegacyMap(mapJson, fileName);
  }
  if (!GRANDFATHERED_LEGACY_MAP_FILES.has(String(fileName || ""))) {
    return validateMapAuthoringMode(mapJson, fileName);
  }
  return validateLegacyMap(mapJson, fileName);
}
