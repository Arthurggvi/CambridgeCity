import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDefaultGameState, migrateOldState } from "../src/engine/state.js";
import { STATUS_EFFECT_KEYS } from "../src/engine/status_effect_runtime.js";
import { STATUS_EFFECT_PRESENTATION_BY_KEY } from "../src/engine/status_effect_view_models.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SCAN_ROOTS = ["src", "scripts", "data"];
const SEARCH_TERMS = [
  "activeFoodEffect",
  "timedModifiers",
  "buildActiveFoodEffectVm",
  "renderActiveFoodEffectTooltip",
  "uiBucket",
  "uiLabel",
  "sourceName",
  "sourceKind",
  "effectType",
  "multiplier"
];
const LEGACY_PLAYER_META_KEYS = [
  "timedModifiers",
  "activeFoodEffect",
  "staminaDecay",
  "satietyDecay",
  "bodyTemperatureDecay",
  "coolingRate",
  "warmingRate",
  "hpDecay"
];

function normalizePath(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

async function walkFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

async function collectSearchHits() {
  const hits = [];
  for (const root of SCAN_ROOTS) {
    const fullRoot = path.join(REPO_ROOT, root);
    const files = await walkFiles(fullRoot);
    for (const filePath of files) {
      let text;
      try {
        text = await readFile(filePath, "utf8");
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const term of SEARCH_TERMS) {
          if (!line.includes(term)) continue;
          hits.push({
            term,
            filePath: normalizePath(filePath),
            lineNumber: index + 1,
            lineText: line.trim()
          });
        }
      });
    }
  }
  return hits;
}

function classifyHit(hit) {
  const filePath = String(hit.filePath || "");
  const lineText = String(hit.lineText || "");
  const term = String(hit.term || "");
  const isAuditScript = filePath === "scripts/status_effect_signoff_audit.mjs";
  const isRegressionFixture = filePath === "scripts/status_effect_governance_regression.mjs";

  if (isAuditScript) {
    return {
      classCode: "B",
      classLabel: "非本次主题残留",
      reason: "审计脚本字面量，用于签字扫描，不参与运行态 truth / VM / presenter / handler 写回链。"
    };
  }

  if (isRegressionFixture && ["activeFoodEffect", "timedModifiers", "uiBucket", "uiLabel", "sourceName", "sourceKind", "effectType"].includes(term)) {
    return {
      classCode: "B",
      classLabel: "非本次主题残留",
      reason: "治理回归夹具中的旧格式输入/断言，用于验证迁移与归零，不属于正式运行态。"
    };
  }

  if (term === "buildActiveFoodEffectVm" || term === "renderActiveFoodEffectTooltip") {
    return {
      classCode: "C",
      classLabel: "非法残留",
      reason: "旧正式 VM / presenter 名称若仍存在，即表示旧正式链未清干净。"
    };
  }

  if (["uiBucket", "uiLabel", "sourceName", "sourceKind"].includes(term)) {
    return {
      classCode: "C",
      classLabel: "非法残留",
      reason: "这些属于展示语义，若出现在正式代码路径则表示 UI 语义回流进 truth / VM 正式链之外。"
    };
  }

  if (["activeFoodEffect", "timedModifiers", "effectType"].includes(term)) {
    if (
      filePath === "src/engine/status_effect_runtime.js"
      || filePath === "src/engine/state.js"
    ) {
      return {
        classCode: "A",
        classLabel: "合法兼容桥",
        reason: "仅用于 load-time 或一次性运行态自愈迁移；迁移完成后删除旧分支，不回写旧结构。"
      };
    }
    return {
      classCode: "C",
      classLabel: "非法残留",
      reason: "旧链关键字段若出现在兼容桥之外，表示旧 truth 仍在正式链路存活。"
    };
  }

  if (term === "multiplier") {
    if (filePath === "src/engine/status_effect_runtime.js" && lineText.includes("legacyMultiplier")) {
      return {
        classCode: "A",
        classLabel: "合法兼容桥",
        reason: "legacy multiplier 仅用于迁移旧 activeFoodEffect 的兼容读取。"
      };
    }
    return {
      classCode: "B",
      classLabel: "非本次主题残留",
      reason: "通用数值字段或当前正式 modifier 数学量，不等于旧 food/status effect 旧链残留。"
    };
  }

  return {
    classCode: "B",
    classLabel: "非本次主题残留",
    reason: "不落入旧链兼容桥，也不是本次旧链非法残留。"
  };
}

function findKeyPaths(root, predicate, prefix = "") {
  const matches = [];
  if (!root || typeof root !== "object") return matches;
  for (const [key, value] of Object.entries(root)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (predicate(key, value, nextPath)) {
      matches.push(nextPath);
    }
    if (value && typeof value === "object") {
      matches.push(...findKeyPaths(value, predicate, nextPath));
    }
  }
  return matches;
}

function summarizeRoundtripInput() {
  return {
    hasTimedModifiers: true,
    activeFoodEffect: {
      modifiers: { satietyDecay: 0.8 },
      remainingMinutes: 90,
      durationMinutes: 120,
      source: "legacy_food",
      sourceName: "旧食物"
    },
    legacyTimedSlot: {
      staminaDecay: {
        multiplier: 0.75,
        remainingMinutes: 60,
        source: "older_food"
      }
    }
  };
}

function runRoundtripAudit() {
  const legacyState = createDefaultGameState();
  delete legacyState.player.meta.statusEffects;
  legacyState.player.meta.timedModifiers = {
    activeFoodEffect: {
      modifiers: { satietyDecay: 0.8 },
      remainingMinutes: 90,
      durationMinutes: 120,
      source: "legacy_food",
      sourceName: "旧食物"
    },
    staminaDecay: {
      multiplier: 0.75,
      remainingMinutes: 60,
      source: "older_food"
    }
  };

  const loadedState = migrateOldState(legacyState);
  const savedSnapshot = JSON.parse(JSON.stringify(loadedState));
  const savedPlayerMeta = savedSnapshot?.player?.meta || {};
  const legacyKeyPaths = findKeyPaths(savedPlayerMeta, (key) => LEGACY_PLAYER_META_KEYS.includes(key));
  const roundtripReintroducesLegacyFields = legacyKeyPaths.length > 0;

  assert(Array.isArray(savedPlayerMeta?.statusEffects?.active), "expected saved statusEffects.active array");
  assert(!Object.prototype.hasOwnProperty.call(savedPlayerMeta, "timedModifiers"), "did not expect saved timedModifiers");
  assert.equal(roundtripReintroducesLegacyFields, false, "legacy fields were reintroduced after roundtrip");

  return {
    oldInputSummary: summarizeRoundtripInput(),
    newSavedSummary: {
      hasStatusEffects: Array.isArray(savedPlayerMeta?.statusEffects?.active),
      statusEffectCount: Array.isArray(savedPlayerMeta?.statusEffects?.active) ? savedPlayerMeta.statusEffects.active.length : 0,
      sourceItemIds: Array.isArray(savedPlayerMeta?.statusEffects?.active)
        ? savedPlayerMeta.statusEffects.active.map((entry) => String(entry?.sourceItemId || "")).filter(Boolean)
        : [],
      hasTimedModifiers: Object.prototype.hasOwnProperty.call(savedPlayerMeta, "timedModifiers"),
      legacyKeyPaths
    },
    roundtrip_reintroduces_legacy_fields: roundtripReintroducesLegacyFields
  };
}

function extractObjectBlock(sourceText, constName) {
  const startToken = `const ${constName} = Object.freeze({`;
  const startIndex = sourceText.indexOf(startToken);
  if (startIndex < 0) return "";
  let depth = 0;
  let started = false;
  for (let index = startIndex; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === "{") {
      depth += 1;
      started = true;
    } else if (char === "}") {
      depth -= 1;
      if (started && depth === 0) {
        return sourceText.slice(startIndex, index + 1);
      }
    }
  }
  return "";
}

function buildStatusEffectKeyTokenMap() {
  return Object.fromEntries(
    Object.entries(STATUS_EFFECT_KEYS).map(([key, value]) => [`STATUS_EFFECT_KEYS.${key}`, value])
  );
}

function parseRuntimeFieldMaps(runtimeSource) {
  const tokenMap = buildStatusEffectKeyTokenMap();
  const parseObjectEntries = (block) => {
    const entries = new Map();
    const regex = /(\w+)\s*:\s*(STATUS_EFFECT_KEYS\.[A-Z_]+)/g;
    let match;
    while ((match = regex.exec(block))) {
      entries.set(match[1], tokenMap[match[2]] || null);
    }
    return entries;
  };

  return {
    legacyModifierKeyMap: parseObjectEntries(extractObjectBlock(runtimeSource, "LEGACY_MODIFIER_KEY_MAP")),
    consumableModifierFields: parseObjectEntries(extractObjectBlock(runtimeSource, "LEGACY_CONSUMABLE_MODIFIER_FIELDS")),
    consumablePeriodicFields: parseObjectEntries(extractObjectBlock(runtimeSource, "LEGACY_CONSUMABLE_PERIODIC_FIELDS"))
  };
}

function collectFieldBackedEffectKeys(textByFile, fieldMap) {
  const discovered = new Set();
  for (const [fieldName, effectKey] of fieldMap.entries()) {
    if (!effectKey) continue;
    for (const text of textByFile.values()) {
      if (text.includes(fieldName)) {
        discovered.add(effectKey);
        break;
      }
    }
  }
  return discovered;
}

async function collectTextByFile() {
  const result = new Map();
  for (const root of SCAN_ROOTS) {
    const files = await walkFiles(path.join(REPO_ROOT, root));
    for (const filePath of files) {
      try {
        result.set(normalizePath(filePath), await readFile(filePath, "utf8"));
      } catch {}
    }
  }
  return result;
}

async function runEffectKeyAudit() {
  const textByFile = await collectTextByFile();
  const runtimePath = path.join(REPO_ROOT, "src/engine/status_effect_runtime.js");
  const runtimeSource = await readFile(runtimePath, "utf8");
  const maps = parseRuntimeFieldMaps(runtimeSource);
  const runtimeSupportedKeys = new Set(Object.values(STATUS_EFFECT_KEYS));
  const definitionBackedKeys = new Set([
    ...collectFieldBackedEffectKeys(textByFile, maps.consumableModifierFields),
    ...collectFieldBackedEffectKeys(textByFile, maps.consumablePeriodicFields)
  ]);
  const legacyBridgeKeys = new Set([...maps.legacyModifierKeyMap.values()].filter(Boolean));
  const discoveredEffectKeys = [...new Set([
    ...runtimeSupportedKeys,
    ...definitionBackedKeys,
    ...legacyBridgeKeys
  ])].sort();
  const mappedEffectKeys = Object.keys(STATUS_EFFECT_PRESENTATION_BY_KEY).sort();
  const unmappedEffectKeys = discoveredEffectKeys.filter((effectKey) => !mappedEffectKeys.includes(effectKey));
  const missingMetadata = mappedEffectKeys.filter((effectKey) => {
    const meta = STATUS_EFFECT_PRESENTATION_BY_KEY[effectKey] || null;
    return !meta || !meta.bucket || !meta.formatterType || typeof meta.tooltipVisible !== "boolean";
  });

  assert.equal(unmappedEffectKeys.length, 0, `unmapped effect keys: ${unmappedEffectKeys.join(", ")}`);
  assert.equal(missingMetadata.length, 0, `mapped keys missing metadata: ${missingMetadata.join(", ")}`);

  return {
    discoveredEffectKeys,
    mappedEffectKeys,
    unmappedEffectKeys
  };
}

function summarizeResidualAudit(hits) {
  const classifiedHits = hits.map((hit) => ({ ...hit, ...classifyHit(hit) }));
  return {
    legalCompatBridge: classifiedHits.filter((hit) => hit.classCode === "A"),
    nonTopicResidual: classifiedHits.filter((hit) => hit.classCode === "B"),
    illegalResidual: classifiedHits.filter((hit) => hit.classCode === "C")
  };
}

async function main() {
  const hits = await collectSearchHits();
  const residualAudit = summarizeResidualAudit(hits);
  const roundtripAudit = runRoundtripAudit();
  const effectKeyAudit = await runEffectKeyAudit();

  const result = {
    residualAudit: {
      legalCompatBridge: residualAudit.legalCompatBridge,
      nonTopicResidual: residualAudit.nonTopicResidual,
      illegalResidual: residualAudit.illegalResidual,
      illegalResidualCount: residualAudit.illegalResidual.length,
      illegal_residual_equals_zero: residualAudit.illegalResidual.length === 0
    },
    roundtripAudit,
    effectKeyAudit
  };

  assert.equal(result.residualAudit.illegalResidualCount, 0, "illegal residuals detected");
  assert.equal(result.roundtripAudit.roundtrip_reintroduces_legacy_fields, false, "roundtrip reintroduced legacy fields");

  console.log(JSON.stringify(result, null, 2));
}

await main();