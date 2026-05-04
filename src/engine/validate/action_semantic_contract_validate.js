// ============================================================================
// Action Semantic Contract Validate (draft, NOT wired into map loader yet)
// ============================================================================

import { ACTION_SEMANTIC_SCHEMA_VERSION, ACTION_SEMANTIC_TYPES } from "../policy/action_semantic_policy_adapter.js";

export function validateActionSemanticContract(action, fileName = "<unknown>", actionPath = "action") {
  const errors = [];
  const semantic = action?.semantic;
  if (semantic == null) return { ok: true, errors };

  if (!isPlainObject(semantic)) {
    errors.push(`${fileName} -> ${actionPath}.semantic: 必须是对象`);
    return { ok: false, errors };
  }

  const schemaVersion = Number(semantic.schemaVersion ?? ACTION_SEMANTIC_SCHEMA_VERSION);
  if (!Number.isInteger(schemaVersion) || schemaVersion <= 0) {
    errors.push(`${fileName} -> ${actionPath}.semantic.schemaVersion: 必须是正整数`);
  }

  const type = String(semantic.type || "").trim().toLowerCase();
  if (!Object.values(ACTION_SEMANTIC_TYPES).includes(type)) {
    errors.push(
      `${fileName} -> ${actionPath}.semantic.type: 必须是 ${Object.values(ACTION_SEMANTIC_TYPES).join("/")}`
    );
  }

  if ("category" in semantic && typeof semantic.category !== "string") {
    errors.push(`${fileName} -> ${actionPath}.semantic.category: 若存在必须是字符串`);
  }

  if ("flags" in semantic) {
    if (!isPlainObject(semantic.flags)) {
      errors.push(`${fileName} -> ${actionPath}.semantic.flags: 若存在必须是对象`);
    } else {
      for (const key of ["isLearnEvent", "isSpecialConsumption"]) {
        if (key in semantic.flags && typeof semantic.flags[key] !== "boolean") {
          errors.push(`${fileName} -> ${actionPath}.semantic.flags.${key}: 若存在必须是 boolean`);
        }
      }
    }
  }

  if ("costTargets" in semantic) {
    if (!Array.isArray(semantic.costTargets)) {
      errors.push(`${fileName} -> ${actionPath}.semantic.costTargets: 若存在必须是字符串数组`);
    } else {
      for (let i = 0; i < semantic.costTargets.length; i += 1) {
        const v = semantic.costTargets[i];
        if (typeof v !== "string" || !v.trim()) {
          errors.push(`${fileName} -> ${actionPath}.semantic.costTargets[${i}]: 必须是非空字符串`);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
