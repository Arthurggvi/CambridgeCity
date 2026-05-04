import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateBusinessSemanticContract } from "../src/engine/business/business_semantic_validate.js";
import { validateMap } from "../src/engine/validate/map_validate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_JSON = path.join(ROOT, "temp", "business_authoring_contract_check_latest.json");
const OUTPUT_MD = path.join(ROOT, "temp", "business_authoring_contract_check_latest.md");
const SAMPLE_MAP_PATH = path.join(ROOT, "data", "maps", "test_one_shot_authoring_minimal.json");

function assert(condition, message, payload = null) {
  if (!condition) {
    const error = new Error(message);
    if (payload != null) {
      error.payload = payload;
    }
    throw error;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function captureConsoleErrors(callback) {
  const originalError = console.error;
  const lines = [];
  console.error = (...args) => {
    lines.push(args.map((entry) => {
      if (typeof entry === "string") return entry;
      try {
        return JSON.stringify(entry);
      } catch {
        return String(entry);
      }
    }).join(" "));
  };
  try {
    return {
      value: callback(),
      errors: lines.slice()
    };
  } finally {
    console.error = originalError;
  }
}

function buildSemanticSample(semantic, mapId = "synthetic_one_shot_authoring_negative") {
  return {
    id: mapId,
    legacy: true,
    mapType: "link",
    name: "Synthetic One Shot Authoring Sample",
    description: "synthetic authoring sample",
    actions: [
      {
        id: "synthetic_action",
        text: "Synthetic",
        ui: { type: "button" },
        semantic
      }
    ]
  };
}

function summarizePositive(action) {
  return {
    actionId: action.id,
    businessType: action.semantic.businessType,
    executorId: action.semantic.executorId,
    idempotencyMode: action.semantic.idempotencyMode,
    semantic: clone(action.semantic)
  };
}

async function main() {
  const evidence = {
    generatedAt: new Date().toISOString(),
    command: "node ./scripts/business_authoring_contract_check.mjs",
    positiveSamples: [],
    negativeSamples: []
  };

  const raw = await fs.readFile(SAMPLE_MAP_PATH, "utf8");
  const sampleMap = JSON.parse(raw);
  const sampleFileName = path.basename(SAMPLE_MAP_PATH);

  const sampleValidateCapture = captureConsoleErrors(() => validateMap(sampleMap, sampleFileName));
  assert(sampleValidateCapture.value === true, "expected minimal sample map to pass validate", sampleValidateCapture);

  for (const action of sampleMap.actions) {
    const semanticPath = `actions[${sampleMap.actions.indexOf(action)}].semantic`;
    const contractResult = validateBusinessSemanticContract(action.semantic, sampleFileName, semanticPath);
    assert(contractResult.ok === true, `expected positive sample to pass semantic contract: ${action.id}`, contractResult);
    evidence.positiveSamples.push({
      ...summarizePositive(action),
      fileName: sampleFileName,
      semanticPath,
      contractResult,
      validateMapOk: true
    });
  }

  const negativeCases = [
    {
      sampleId: "missing_executorId",
      fileName: "phaseB_semantic_missing_executorId.json",
      expectedErrorIncludes: ".executorId:",
      semantic: {
        schemaVersion: 1,
        type: "one_shot_business",
        businessType: "claim",
        idempotencyMode: "target",
        allowPartialCommit: false,
        claim: {
          flagPath: "world.flags.syntheticClaimed"
        }
      }
    },
    {
      sampleId: "invalid_businessType",
      fileName: "phaseB_semantic_invalid_businessType.json",
      expectedErrorIncludes: ".businessType:",
      semantic: {
        schemaVersion: 1,
        type: "one_shot_business",
        executorId: "claim",
        businessType: "settlement",
        idempotencyMode: "target",
        allowPartialCommit: false,
        claim: {
          flagPath: "world.flags.syntheticClaimed"
        }
      }
    },
    {
      sampleId: "invalid_idempotencyMode",
      fileName: "phaseB_semantic_invalid_idempotencyMode.json",
      expectedErrorIncludes: ".idempotencyMode:",
      semantic: {
        schemaVersion: 1,
        type: "one_shot_business",
        executorId: "bill_payment",
        businessType: "payment",
        idempotencyMode: "session",
        allowPartialCommit: false,
        payment: {
          channel: "gov_fine"
        }
      }
    },
    {
      sampleId: "allowPartialCommit_true",
      fileName: "phaseB_semantic_allowPartialCommit_true.json",
      expectedErrorIncludes: ".allowPartialCommit:",
      semantic: {
        schemaVersion: 1,
        type: "one_shot_business",
        executorId: "claim",
        businessType: "claim",
        idempotencyMode: "target",
        allowPartialCommit: true,
        claim: {
          flagPath: "world.flags.syntheticClaimed"
        }
      }
    },
    {
      sampleId: "forbidden_low_level_field",
      fileName: "phaseB_semantic_forbidden_low_level_field.json",
      expectedErrorIncludes: ".purchase.path:",
      semantic: {
        schemaVersion: 1,
        type: "one_shot_business",
        executorId: "shop_purchase",
        businessType: "purchase",
        idempotencyMode: "request",
        allowPartialCommit: false,
        purchase: {
          channel: "shop_goods",
          goodsId: "clinic_portable_thermometer",
          path: "world.money"
        }
      }
    }
  ];

  for (const sample of negativeCases) {
    const semanticPath = "actions[0].semantic";
    const contractResult = validateBusinessSemanticContract(sample.semantic, sample.fileName, semanticPath);
    const mapJson = buildSemanticSample(sample.semantic, sample.fileName.replace(/\.json$/i, ""));
    const validateCapture = captureConsoleErrors(() => validateMap(mapJson, sample.fileName));
    assert(contractResult.ok === false, `expected semantic contract to reject ${sample.sampleId}`, contractResult);
    assert(validateCapture.value === false, `expected validateMap to reject ${sample.sampleId}`, validateCapture);
    assert(contractResult.errors.some((message) => message.includes(sample.expectedErrorIncludes)), `expected contract errors to mention ${sample.expectedErrorIncludes}`, contractResult);
    assert(validateCapture.errors.some((message) => message.includes(sample.expectedErrorIncludes)), `expected validateMap errors to mention ${sample.expectedErrorIncludes}`, validateCapture);
    evidence.negativeSamples.push({
      sampleId: sample.sampleId,
      fileName: sample.fileName,
      semantic: clone(sample.semantic),
      contractResult,
      validateMapOk: validateCapture.value,
      validateErrors: validateCapture.errors
    });
  }

  await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(evidence, null, 2), "utf8");

  const md = [
    "# Business Authoring Contract Check",
    "",
    `Generated At: ${evidence.generatedAt}`,
    `Command: ${evidence.command}`,
    "",
    "## Positive Samples",
    ...evidence.positiveSamples.map((row) => `- ${row.actionId}: ${row.businessType} (${row.executorId})`),
    "",
    "## Negative Samples",
    ...evidence.negativeSamples.map((row) => `- ${row.sampleId}: rejected`) 
  ].join("\n");
  await fs.writeFile(OUTPUT_MD, md, "utf8");

  console.log(`[business-authoring] wrote ${path.relative(ROOT, OUTPUT_JSON)}`);
  console.log(`[business-authoring] wrote ${path.relative(ROOT, OUTPUT_MD)}`);
  console.log(JSON.stringify({
    positiveSamples: evidence.positiveSamples,
    negativeSamples: evidence.negativeSamples.map((row) => ({
      sampleId: row.sampleId,
      errors: row.contractResult.errors
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error("[business-authoring] contract check failed", error?.message || error);
  if (error?.payload != null) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exitCode = 1;
});