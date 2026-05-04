import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_JSON = path.join(ROOT, "temp", "business_phase1_grep_audit_latest.json");

const TARGET_FILES = [
  "src/engine/pipeline/resolve_handlers/map_handlers.js",
  "src/engine/pipeline/resolve_handlers/map_handlers_v2.js",
  "src/engine/pipeline/resolve_handlers/gov_handlers.js",
  "src/engine/business/executors/shop_purchase_executor.js",
  "src/engine/business/executors/bill_payment_executor.js",
  "src/engine/business/executors/claim_executor.js"
];

const CHECKS = [
  { key: "directMoneyEffect", label: "直接扣钱 effect", pattern: /Effects\.add\("world\.money"/g },
  { key: "directInventoryEffect", label: "直接入包 effect", pattern: /Effects\.set\("player\.inventory"/g },
  { key: "directBillEffect", label: "直接 bill 支付 effect", pattern: /world\.medical\.bills\.(obsCents|wardCents)|world\.refData\.accounts\.unpaidFinesCents/g },
  { key: "directClaimFlagEffect", label: "直接 claimed flag 写入", pattern: /researcherManuscriptClaimed|world\.flags\.newFourMisc\.researcherManuscriptClaimed/g }
];

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function findLineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

async function main() {
  const report = {};
  for (const relPath of TARGET_FILES) {
    const absPath = path.join(ROOT, relPath);
    const text = await fs.readFile(absPath, "utf8");
    report[normalizePath(relPath)] = CHECKS.map((check) => {
      const matches = [];
      const regex = new RegExp(check.pattern.source, check.pattern.flags);
      for (const match of text.matchAll(regex)) {
        matches.push({
          line: findLineNumber(text, match.index || 0),
          text: String(match[0] || "")
        });
      }
      return {
        key: check.key,
        label: check.label,
        count: matches.length,
        matches
      };
    });
  }

  await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(report, null, 2), "utf8");
  console.log(`[business-phase1-grep] wrote ${normalizePath(path.relative(ROOT, OUTPUT_JSON))}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("[business-phase1-grep] failed", error?.message || error);
  process.exitCode = 1;
});