#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_EXCLUDE_DIRS = new Set([
  ".git",
  "node_modules",
  "coverage",
  ".turbo",
  ".cache",
]);

const SCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ps1", ".bat"]);
const BINARY_EXTENSIONS = new Set([".exe", ".dll", ".bin", ".wasm", ".node"]);
const GENERATED_OUTPUT_EXTENSIONS = new Set([
  ".json",
  ".html",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".txt",
  ".md",
  ".log",
]);

function parseArgs(argv) {
  const args = {
    root: ".",
    out: "temp/reclaim_audit",
    sizeAuditDir: "temp/size_audit",
    includeHidden: false,
    useDefaultExcludes: true,
    excludeDir: [],
    largeBinaryMinMB: 5,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--root") {
      args.root = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--out") {
      args.out = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--size-audit-dir") {
      args.sizeAuditDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--exclude-dir") {
      args.excludeDir = String(argv[index + 1] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (token === "--large-binary-min-mb") {
      args.largeBinaryMinMB = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--include-hidden") {
      args.includeHidden = true;
      continue;
    }

    if (token === "--no-default-excludes") {
      args.useDefaultExcludes = false;
      continue;
    }
  }

  return args;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function normalizePath(targetPath) {
  return targetPath.split(path.sep).join("/");
}

function shouldSkipDirectory(dirName, args) {
  if (!args.includeHidden && dirName.startsWith(".")) {
    if (!DEFAULT_EXCLUDE_DIRS.has(dirName)) {
      return true;
    }
  }

  if (args.useDefaultExcludes && DEFAULT_EXCLUDE_DIRS.has(dirName)) {
    return true;
  }

  if (args.excludeDir.includes(dirName)) {
    return true;
  }

  return false;
}

function getExtension(fileName) {
  return path.extname(fileName).toLowerCase() || "(no_ext)";
}

function startsWithPathPrefix(filePath, prefix) {
  return filePath === prefix || filePath.startsWith(`${prefix}/`);
}

function summarizeEntries(entries) {
  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  return {
    fileCount: entries.length,
    totalBytes,
    humanBytes: formatBytes(totalBytes),
  };
}

async function safeReadDir(absPath, warnings) {
  try {
    return await fs.readdir(absPath, { withFileTypes: true });
  } catch (error) {
    warnings.push({
      type: "readdir_failed",
      path: absPath,
      message: String(error?.message || error),
    });
    return [];
  }
}

async function safeLstat(absPath, warnings) {
  try {
    return await fs.lstat(absPath);
  } catch (error) {
    warnings.push({
      type: "lstat_failed",
      path: absPath,
      message: String(error?.message || error),
    });
    return null;
  }
}

async function readJsonIfExists(absPath, warnings) {
  try {
    const raw = await fs.readFile(absPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    warnings.push({
      type: "json_read_failed",
      path: absPath,
      message: String(error?.message || error),
    });
    return null;
  }
}

async function readTextIfExists(absPath, warnings) {
  try {
    return await fs.readFile(absPath, "utf8");
  } catch (error) {
    warnings.push({
      type: "text_read_failed",
      path: absPath,
      message: String(error?.message || error),
    });
    return "";
  }
}

function parseMarkdownTablePaths(sectionText) {
  const lines = sectionText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const values = [];

  for (const line of lines) {
    if (!line.startsWith("|")) {
      continue;
    }
    if (line.includes("---") || line.includes("path |")) {
      continue;
    }

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length > 0 && cells[0]) {
      values.push(normalizePath(cells[0]));
    }
  }

  return values;
}

function extractSection(text, header) {
  const pattern = new RegExp(`## ${header}([\\s\\S]*?)(?:\\n## |$)`);
  const match = text.match(pattern);
  return match ? match[1] : "";
}

async function sha256File(absPath) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(absPath);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function buildReasonedEntry(entry, reason, risk, extra = {}) {
  return {
    path: entry.path,
    bytes: entry.bytes,
    humanBytes: entry.humanBytes,
    reason,
    risk,
    ...extra,
  };
}

function getTempCategory(entry, tempKnowledge) {
  const baseName = entry.name;
  const lowerPath = entry.path.toLowerCase();
  const lowerName = baseName.toLowerCase();
  const reasons = [];
  let category = "unknown_need_manual_review";

  if (tempKnowledge.stableKeepExact.has(entry.path) || tempKnowledge.stableKeepBase.has(baseName)) {
    category = "canonical_entry";
    reasons.push("listed_in_temp_cleanup_audit_stable_keep");
  } else if (baseName === "README.md") {
    category = "canonical_entry";
    reasons.push("directory_anchor_document");
  } else if (tempKnowledge.safeDeleteExact.has(entry.path) || tempKnowledge.safeDeleteBase.has(baseName)) {
    category = "generated_output";
    reasons.push("listed_in_temp_cleanup_audit_safe_delete_now");
  } else if (lowerPath.includes("/quarantine/") && SCRIPT_EXTENSIONS.has(entry.ext)) {
    category = "probe_or_temp_script";
    reasons.push("quarantine_script_extension");
  } else if (lowerPath.includes("/quarantine/") && GENERATED_OUTPUT_EXTENSIONS.has(entry.ext)) {
    category = "generated_output";
    reasons.push("quarantine_dump_or_output");
  } else if (SCRIPT_EXTENSIONS.has(entry.ext)) {
    category = "probe_or_temp_script";
    reasons.push("script_extension_under_temp");
  } else if (/(result|summary|report|output|trace|dump|proof|evidence|latest)/i.test(baseName)) {
    category = "generated_output";
    reasons.push("output_like_file_name");
  } else if (tempKnowledge.manualReviewExact.has(entry.path) || tempKnowledge.manualReviewBase.has(baseName)) {
    category = "unknown_need_manual_review";
    reasons.push("listed_in_temp_cleanup_audit_manual_review");
  } else if (lowerName === "node.exe" || BINARY_EXTENSIONS.has(entry.ext)) {
    category = "unknown_need_manual_review";
    reasons.push("binary_copy_inside_temp_requires_manual_confirmation");
  } else {
    category = "unknown_need_manual_review";
    reasons.push("no_static_evidence_for_safe_bucket");
  }

  return {
    category,
    reasons,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootAbs = path.resolve(process.cwd(), args.root);
  const outAbs = path.resolve(process.cwd(), args.out);
  const sizeAuditAbs = path.resolve(process.cwd(), args.sizeAuditDir);
  const warnings = [];
  const largeBinaryMinBytes = Math.max(0, Number(args.largeBinaryMinMB) || 0) * 1024 * 1024;

  const sizeAuditSummary = await readJsonIfExists(path.join(sizeAuditAbs, "summary.json"), warnings);
  const sizeAuditTopFiles = await readJsonIfExists(path.join(sizeAuditAbs, "top_files.json"), warnings);
  const sizeAuditTopDirs = await readJsonIfExists(path.join(sizeAuditAbs, "top_dirs.json"), warnings);
  const sizeAuditSuspects = await readJsonIfExists(path.join(sizeAuditAbs, "suspect_files.json"), warnings);

  const tempCleanupAudit = await readTextIfExists(path.join(rootAbs, "运维", "temp_cleanup_audit.md"), warnings);
  const tempRefactorAudit = await readTextIfExists(path.join(rootAbs, "运维", "temp体系重构审计.md"), warnings);

  const tempKnowledge = {
    stableKeepExact: new Set(parseMarkdownTablePaths(extractSection(tempCleanupAudit, "stable_keep"))),
    stableKeepBase: new Set(),
    manualReviewExact: new Set(parseMarkdownTablePaths(extractSection(tempCleanupAudit, "needs_manual_review"))),
    manualReviewBase: new Set(),
    safeDeleteExact: new Set(parseMarkdownTablePaths(extractSection(tempCleanupAudit, "safe_delete_now"))),
    safeDeleteBase: new Set(),
  };

  for (const key of ["stableKeepExact", "manualReviewExact", "safeDeleteExact"]) {
    const values = tempKnowledge[key];
    const baseKey = key.replace("Exact", "Base");
    for (const entry of values) {
      tempKnowledge[baseKey].add(path.basename(entry));
    }
  }

  const fileEntries = [];

  async function walkDirectory(currentAbs) {
    const dirents = await safeReadDir(currentAbs, warnings);

    for (const dirent of dirents) {
      const absPath = path.join(currentAbs, dirent.name);
      const relativePath = normalizePath(path.relative(rootAbs, absPath) || ".");

      if (dirent.isDirectory()) {
        if (shouldSkipDirectory(dirent.name, args)) {
          continue;
        }
        await walkDirectory(absPath);
        continue;
      }

      if (dirent.isSymbolicLink()) {
        warnings.push({
          type: "symlink_skipped",
          path: absPath,
          message: "symbolic link skipped",
        });
        continue;
      }

      const stat = await safeLstat(absPath, warnings);
      if (!stat || !stat.isFile()) {
        continue;
      }

      fileEntries.push({
        path: relativePath,
        absPath,
        name: dirent.name,
        ext: getExtension(dirent.name),
        bytes: stat.size,
        humanBytes: formatBytes(stat.size),
      });
    }
  }

  await walkDirectory(rootAbs);

  const targetFamilies = {
    dist: fileEntries.filter((entry) => startsWithPathPrefix(entry.path, "dist")),
    launcher: fileEntries.filter((entry) => startsWithPathPrefix(entry.path, "launcher")),
    temp: fileEntries.filter((entry) => startsWithPathPrefix(entry.path, "temp")),
    reports: fileEntries.filter((entry) => startsWithPathPrefix(entry.path, "reports")),
    qa: fileEntries.filter((entry) => startsWithPathPrefix(entry.path, "qa")),
    picture: fileEntries.filter((entry) => startsWithPathPrefix(entry.path, "picture")),
  };

  const filesByNameAndSize = new Map();
  for (const entry of fileEntries) {
    const key = `${entry.name}::${entry.bytes}`;
    if (!filesByNameAndSize.has(key)) {
      filesByNameAndSize.set(key, []);
    }
    filesByNameAndSize.get(key).push(entry);
  }

  const allHashes = [];
  for (const entry of fileEntries) {
    const sha256 = await sha256File(entry.absPath);
    entry.sha256 = sha256;
    allHashes.push(entry);
  }

  const filesByHash = new Map();
  for (const entry of allHashes) {
    if (!filesByHash.has(entry.sha256)) {
      filesByHash.set(entry.sha256, []);
    }
    filesByHash.get(entry.sha256).push(entry);
  }

  const sameNameSameSizeGroups = [...filesByNameAndSize.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => {
      const [name] = key.split("::");
      return {
        duplicateKey: key,
        name,
        bytes: entries[0].bytes,
        humanBytes: entries[0].humanBytes,
        fileCount: entries.length,
        paths: entries.map((entry) => entry.path).sort(),
      };
    })
    .sort((left, right) => {
      if (right.bytes !== left.bytes) {
        return right.bytes - left.bytes;
      }
      return right.fileCount - left.fileCount;
    });

  const sameHashGroups = [...filesByHash.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([sha256, entries]) => ({
      sha256,
      bytes: entries[0].bytes,
      humanBytes: entries[0].humanBytes,
      fileCount: entries.length,
      names: [...new Set(entries.map((entry) => entry.name))].sort(),
      paths: entries.map((entry) => entry.path).sort(),
    }))
    .sort((left, right) => {
      if (right.bytes !== left.bytes) {
        return right.bytes - left.bytes;
      }
      return right.fileCount - left.fileCount;
    });

  const largeBinaryGroups = sameHashGroups
    .filter((group) => {
      const groupEntries = group.paths.map((groupPath) => fileEntries.find((entry) => entry.path === groupPath));
      return group.bytes >= largeBinaryMinBytes
        || group.names.some((name) => name.toLowerCase() === "node.exe")
        || groupEntries.some((entry) => entry && BINARY_EXTENSIONS.has(entry.ext));
    })
    .map((group) => ({
      ...group,
      specialFlags: [
        ...(group.names.some((name) => name.toLowerCase() === "node.exe") ? ["contains_node.exe"] : []),
        ...(group.bytes >= largeBinaryMinBytes ? ["large_binary_group"] : []),
      ],
    }));

  const duplicateBinaries = {
    generatedAt: new Date().toISOString(),
    largeBinaryMinMB: args.largeBinaryMinMB,
    overview: {
      sameNameSameSizeGroupCount: sameNameSameSizeGroups.length,
      sameHashGroupCount: sameHashGroups.length,
      largeBinaryGroupCount: largeBinaryGroups.length,
    },
    specialFocus: {
      nodeExeGroups: largeBinaryGroups.filter((group) => group.names.some((name) => name.toLowerCase() === "node.exe")),
      otherLargeBinaryGroups: largeBinaryGroups.filter((group) => !group.names.some((name) => name.toLowerCase() === "node.exe")),
    },
    sameNameSameSizeGroups: sameNameSameSizeGroups.slice(0, 80),
    sameHashGroups: sameHashGroups.slice(0, 80),
  };

  const rebuildableFamilies = [
    {
      pathPrefix: "dist",
      classification: "build_generated_output",
      summary: summarizeEntries(targetFamilies.dist),
      staticEvidence: [
        "path under dist/ indicates generated bundle output",
        "package.json exposes build:launcher-bundle",
        "launcher README states dist/launcher_bundle is build output",
      ],
      riskNote: "generated output, but parts of dist can also serve as release package; evidence is rebuildability, not deletion safety",
      topFiles: [...targetFamilies.dist]
        .sort((left, right) => right.bytes - left.bytes)
        .slice(0, 20)
        .map((entry) => ({ path: entry.path, bytes: entry.bytes, humanBytes: entry.humanBytes })),
    },
    {
      pathPrefix: "reports",
      classification: "development_or_acceptance_generated_output",
      summary: summarizeEntries(targetFamilies.reports),
      staticEvidence: [
        "path under reports/ indicates generated evidence or debug output",
        "size audit top files include reports/generated artifacts",
      ],
      riskNote: "static evidence points to generated reporting payloads, not runtime launch path",
      topFiles: [...targetFamilies.reports]
        .sort((left, right) => right.bytes - left.bytes)
        .slice(0, 20)
        .map((entry) => ({ path: entry.path, bytes: entry.bytes, humanBytes: entry.humanBytes })),
    },
    {
      pathPrefix: "qa",
      classification: "development_or_acceptance_generated_output",
      summary: summarizeEntries(targetFamilies.qa),
      staticEvidence: [
        "path under qa/ indicates regression or visual acceptance artifacts",
        "package.json test scripts emit reports into qa/ paths",
      ],
      riskNote: "static evidence points to acceptance artifacts, not launcher runtime",
      topFiles: [...targetFamilies.qa]
        .sort((left, right) => right.bytes - left.bytes)
        .slice(0, 20)
        .map((entry) => ({ path: entry.path, bytes: entry.bytes, humanBytes: entry.humanBytes })),
    },
  ];

  const rebuildableOutputs = {
    generatedAt: new Date().toISOString(),
    families: rebuildableFamilies,
    notes: [
      "This file records static rebuildability evidence only.",
      "Entries under dist/ may overlap with release-runtime usage when a packaged bundle is actively used.",
    ],
  };

  const runtimeRequiredCandidates = {
    generatedAt: new Date().toISOString(),
    note: "Only static evidence is recorded here. Files listed below are not safe-to-delete conclusions.",
    families: [
      {
        pathPrefix: "launcher",
        classification: "runtime_required_candidate",
        summary: summarizeEntries(targetFamilies.launcher),
        staticEvidence: [
          "package.json launch:game points to launcher/CambrianLauncher.ps1",
          "launcher README defines launcher/ as startup chain and bundled runtime host",
        ],
        cannotDeleteFromStaticEvidence: true,
        topFiles: [...targetFamilies.launcher]
          .sort((left, right) => right.bytes - left.bytes)
          .slice(0, 20)
          .map((entry) => ({ path: entry.path, bytes: entry.bytes, humanBytes: entry.humanBytes })),
      },
      {
        pathPrefix: "dist/launcher_bundle",
        classification: "release_bundle_runtime_candidate",
        summary: summarizeEntries(targetFamilies.dist.filter((entry) => startsWithPathPrefix(entry.path, "dist/launcher_bundle"))),
        staticEvidence: [
          "launcher README states dist/launcher_bundle is the player-facing packaged output",
          "packaged bundle mirrors launcher and web assets used by release entry",
        ],
        cannotDeleteFromStaticEvidence: true,
        topFiles: [...targetFamilies.dist]
          .filter((entry) => startsWithPathPrefix(entry.path, "dist/launcher_bundle"))
          .sort((left, right) => right.bytes - left.bytes)
          .slice(0, 20)
          .map((entry) => ({ path: entry.path, bytes: entry.bytes, humanBytes: entry.humanBytes })),
      },
      {
        pathPrefix: "picture",
        classification: "runtime_asset_source_candidate",
        summary: summarizeEntries(targetFamilies.picture),
        staticEvidence: [
          "picture/ holds source-facing runtime assets mirrored into dist/launcher_bundle/picture",
          "same-hash duplicate groups show picture/ content is copied into packaged bundle",
        ],
        cannotDeleteFromStaticEvidence: true,
        topFiles: [...targetFamilies.picture]
          .sort((left, right) => right.bytes - left.bytes)
          .slice(0, 20)
          .map((entry) => ({ path: entry.path, bytes: entry.bytes, humanBytes: entry.humanBytes })),
      },
    ],
  };

  const tempMatrixEntries = [...targetFamilies.temp]
    .sort((left, right) => right.bytes - left.bytes)
    .map((entry) => {
      const classification = getTempCategory(entry, tempKnowledge);
      return {
        path: entry.path,
        bytes: entry.bytes,
        humanBytes: entry.humanBytes,
        category: classification.category,
        reasons: classification.reasons,
        tempCleanupAuditSignals: {
          stableKeepMatch: tempKnowledge.stableKeepExact.has(entry.path) || tempKnowledge.stableKeepBase.has(entry.name),
          manualReviewMatch: tempKnowledge.manualReviewExact.has(entry.path) || tempKnowledge.manualReviewBase.has(entry.name),
          safeDeleteMatch: tempKnowledge.safeDeleteExact.has(entry.path) || tempKnowledge.safeDeleteBase.has(entry.name),
        },
      };
    });

  const tempCategorySummary = [
    "canonical_entry",
    "generated_output",
    "probe_or_temp_script",
    "unknown_need_manual_review",
  ].map((category) => {
    const entries = tempMatrixEntries.filter((entry) => entry.category === category);
    return {
      category,
      ...summarizeEntries(entries.map((entry) => ({ bytes: entry.bytes }))),
    };
  });

  const tempAssetRiskMatrix = {
    generatedAt: new Date().toISOString(),
    note: "temp/** is mixed-responsibility according to the existing temp cleanup audits; this file records only static categorization evidence.",
    tempCleanupAuditSource: "运维/temp_cleanup_audit.md",
    tempRefactorAuditSource: "运维/temp体系重构审计.md",
    categorySummary: tempCategorySummary,
    entries: tempMatrixEntries,
  };

  const zeroRiskUpperBoundBytes = summarizeEntries([...targetFamilies.reports, ...targetFamilies.qa]).totalBytes;
  const lowRiskUpperBoundBytes = zeroRiskUpperBoundBytes + summarizeEntries(targetFamilies.dist).totalBytes;

  const reclaimSummary = {
    generatedAt: new Date().toISOString(),
    root: rootAbs,
    sizeAuditInputs: {
      summaryPresent: Boolean(sizeAuditSummary),
      topFilesPresent: Boolean(sizeAuditTopFiles),
      topDirsPresent: Boolean(sizeAuditTopDirs),
      suspectFilesPresent: Boolean(sizeAuditSuspects),
    },
    scanSummary: {
      fileCount: fileEntries.length,
      totalBytes: summarizeEntries(fileEntries).totalBytes,
      humanBytes: formatBytes(summarizeEntries(fileEntries).totalBytes),
    },
    pathFamilyTotals: Object.fromEntries(
      Object.entries(targetFamilies).map(([familyName, entries]) => [familyName, summarizeEntries(entries)]),
    ),
    evidenceClassTotals: {
      runtime_required_candidates: {
        totalBytes:
          summarizeEntries(targetFamilies.launcher).totalBytes
          + summarizeEntries(targetFamilies.picture).totalBytes
          + summarizeEntries(targetFamilies.dist.filter((entry) => startsWithPathPrefix(entry.path, "dist/launcher_bundle"))).totalBytes,
        humanBytes: formatBytes(
          summarizeEntries(targetFamilies.launcher).totalBytes
          + summarizeEntries(targetFamilies.picture).totalBytes
          + summarizeEntries(targetFamilies.dist.filter((entry) => startsWithPathPrefix(entry.path, "dist/launcher_bundle"))).totalBytes,
        ),
        note: "evidence-oriented total; overlaps with build_generated_outputs because packaged release content is also generated",
      },
      build_generated_outputs: {
        ...summarizeEntries(targetFamilies.dist),
        note: "dist/ is generated by build flow, but may also be used as current release package",
      },
      development_acceptance_generated: {
        ...summarizeEntries([...targetFamilies.reports, ...targetFamilies.qa]),
        note: "reports/ and qa/ are static evidence for generated test or acceptance payloads",
      },
      temp_probe_or_duplicate: {
        ...summarizeEntries(targetFamilies.temp),
        note: "temp/ is mixed and cannot be treated as one-risk bucket without file-level evidence",
      },
    },
    duplicateOverview: {
      sameNameSameSizeGroupCount: sameNameSameSizeGroups.length,
      sameHashGroupCount: sameHashGroups.length,
      highlightedLargeBinaryGroups: largeBinaryGroups.length,
    },
    reclaimUpperBounds: {
      zeroRisk: {
        totalBytes: zeroRiskUpperBoundBytes,
        humanBytes: formatBytes(zeroRiskUpperBoundBytes),
        basis: [
          "Only reports/ and qa/ are counted here.",
          "Static evidence marks them as generated reporting, regression, or visual acceptance payloads.",
          "launcher/, picture/, dist/, and temp/ are excluded from zero-risk because static evidence does not prove they are disposable right now.",
        ],
      },
      lowRisk: {
        totalBytes: lowRiskUpperBoundBytes,
        humanBytes: formatBytes(lowRiskUpperBoundBytes),
        basis: [
          "Includes zero-risk upper bound plus dist/ as rebuildable bundle output.",
          "This is low-risk only when the source tree remains intact and release bundle regeneration is acceptable.",
          "launcher/, picture/, and mixed temp/ content remain excluded because static evidence alone cannot justify reclaim.",
        ],
      },
    },
    warnings,
  };

  const reclaimPlanLines = [];
  reclaimPlanLines.push("# Reclaim Plan Evidence");
  reclaimPlanLines.push("");
  reclaimPlanLines.push("This plan records staged evidence only. It is not a deletion instruction.");
  reclaimPlanLines.push("");
  reclaimPlanLines.push("## Phase A: Zero Risk Candidates");
  reclaimPlanLines.push("");
  reclaimPlanLines.push(`- Object: reports/ + qa/`);
  reclaimPlanLines.push(`- Size: ${formatBytes(zeroRiskUpperBoundBytes)}`);
  reclaimPlanLines.push("- Reason: static path evidence identifies generated reports, regression baselines, and visual acceptance payloads outside launcher runtime path.");
  reclaimPlanLines.push("- Risk: low static coupling observed, but this phase is still recorded as evidence rather than action.");
  reclaimPlanLines.push("");
  reclaimPlanLines.push("## Phase B: Low Risk Candidates");
  reclaimPlanLines.push("");
  reclaimPlanLines.push(`- Object: dist/launcher_bundle and other dist/ build outputs`);
  reclaimPlanLines.push(`- Size: ${formatBytes(summarizeEntries(targetFamilies.dist).totalBytes)}`);
  reclaimPlanLines.push("- Reason: build flow and launcher docs identify dist/ as generated package output that can be rebuilt from source.");
  reclaimPlanLines.push("- Risk: current release package may depend on dist/ as a ready-to-run artifact, so this is not zero-risk.");
  reclaimPlanLines.push("");
  reclaimPlanLines.push("## Phase C: Need Manual Confirmation");
  reclaimPlanLines.push("");
  reclaimPlanLines.push(`- Object: temp/ mixed assets and probe copies`);
  reclaimPlanLines.push(`- Size: ${formatBytes(summarizeEntries(targetFamilies.temp).totalBytes)}`);
  reclaimPlanLines.push("- Reason: temp cleanup audits show temp_* is mixed between canonical entries, generated outputs, probe scripts, and unknown items; current temp/ also contains a duplicated node.exe and quarantine dumps.");
  reclaimPlanLines.push("- Risk: static evidence is insufficient to collapse all temp/ content into one reclaim decision.");
  reclaimPlanLines.push("");
  reclaimPlanLines.push(`- Object: picture/ source assets mirrored into dist/launcher_bundle/picture`);
  reclaimPlanLines.push(`- Size: ${formatBytes(summarizeEntries(targetFamilies.picture).totalBytes)}`);
  reclaimPlanLines.push("- Reason: same-hash groups prove picture/ files are copied into dist/, but static evidence alone does not prove whether root picture/ can be reclaimed.");
  reclaimPlanLines.push("- Risk: likely runtime-visible assets or source masters; requires manual confirmation.");
  reclaimPlanLines.push("");
  reclaimPlanLines.push("## Phase D: Do Not Reclaim");
  reclaimPlanLines.push("");
  reclaimPlanLines.push(`- Object: launcher/ startup chain and packaged launcher runtime candidates`);
  reclaimPlanLines.push(`- Size: ${formatBytes(summarizeEntries(targetFamilies.launcher).totalBytes + summarizeEntries(targetFamilies.dist.filter((entry) => startsWithPathPrefix(entry.path, "dist/launcher_bundle/launcher"))).totalBytes)}`);
  reclaimPlanLines.push("- Reason: package.json launch entry and launcher documentation bind launcher/CambrianLauncher.ps1, launcher.config.json, cambrian_static_server.js, and launcher/runtime/node/node.exe into the runtime startup chain.");
  reclaimPlanLines.push("- Risk: static evidence indicates immediate launch breakage risk if reclaimed.");

  await fs.mkdir(outAbs, { recursive: true });

  await fs.writeFile(path.join(outAbs, "duplicate_binaries.json"), JSON.stringify(duplicateBinaries, null, 2), "utf8");
  await fs.writeFile(path.join(outAbs, "rebuildable_outputs.json"), JSON.stringify(rebuildableOutputs, null, 2), "utf8");
  await fs.writeFile(path.join(outAbs, "runtime_required_candidates.json"), JSON.stringify(runtimeRequiredCandidates, null, 2), "utf8");
  await fs.writeFile(path.join(outAbs, "temp_asset_risk_matrix.json"), JSON.stringify(tempAssetRiskMatrix, null, 2), "utf8");
  await fs.writeFile(path.join(outAbs, "reclaim_summary.json"), JSON.stringify(reclaimSummary, null, 2), "utf8");
  await fs.writeFile(path.join(outAbs, "reclaim_plan.md"), reclaimPlanLines.join("\n"), "utf8");

  console.log("=== RECLAIM AUDIT DONE ===");
  console.log(`root: ${rootAbs}`);
  console.log(`files: ${fileEntries.length}`);
  console.log(`out: ${outAbs}`);
  console.log(`zero-risk-upper-bound: ${formatBytes(zeroRiskUpperBoundBytes)}`);
  console.log(`low-risk-upper-bound: ${formatBytes(lowRiskUpperBoundBytes)}`);
}

main().catch((error) => {
  console.error("reclaim audit failed");
  console.error(error);
  process.exitCode = 1;
});