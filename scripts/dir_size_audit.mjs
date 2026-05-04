#!/usr/bin/env node

/**
 * 目录体积审计脚本
 *
 * 用途：
 * 1. 递归遍历项目目录
 * 2. 统计文件逻辑大小（fs.stat.size）
 * 3. 汇总目录累计体积
 * 4. 输出扩展名占比
 * 5. 标记可疑大文件 / 临时产物
 *
 * 设计原则：
 * - 只取证，不修改业务代码
 * - 不引入第三方依赖
 * - 输出结果可机器读取，也可人工快速阅读
 *
 * 说明：
 * - 本脚本统计的是“逻辑大小”，不是文件系统簇占用大小
 * - 目录大小通过其所有子文件 size 累加得到
 * - 默认跳过 .git / node_modules 等高噪声目录
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/** -----------------------------
 *  CLI 参数解析
 * ------------------------------*/

/**
 * 将类似 "--foo bar --x 1 --flag" 的参数解析成简单对象
 * 不引入 minimist 等外部包，避免额外依赖。
 */
function parseArgs(argv) {
  const args = {
    root: ".",
    out: "temp/size_audit",
    top: 200,
    suspectMinMB: 5,
    useDefaultExcludes: true,
    excludeDir: [],
    includeHidden: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--root") {
      args.root = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === "--out") {
      args.out = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === "--top") {
      args.top = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (token === "--suspect-min-mb") {
      args.suspectMinMB = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (token === "--exclude-dir") {
      args.excludeDir = String(argv[i + 1] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      i += 1;
      continue;
    }

    if (token === "--no-default-excludes") {
      args.useDefaultExcludes = false;
      continue;
    }

    if (token === "--include-hidden") {
      args.includeHidden = true;
      continue;
    }
  }

  return args;
}

/** -----------------------------
 *  常量与工具函数
 * ------------------------------*/

const DEFAULT_EXCLUDE_DIRS = new Set([
  ".git",
  "node_modules",
  "coverage",
  ".turbo",
  ".cache",
]);

/**
 * 用于把大文件归到“可疑”列表中的扩展名。
 * 这些通常与瘦身直接相关：临时文件、source map、设计源文件、媒体、压缩包等。
 */
const SUSPECT_EXTENSIONS = new Set([
  ".map",
  ".psd",
  ".ai",
  ".blend",
  ".fbx",
  ".obj",
  ".mp4",
  ".mov",
  ".webm",
  ".wav",
  ".flac",
  ".zip",
  ".7z",
  ".rar",
  ".sqlite",
  ".db",
  ".wasm",
  ".bin",
]);

/**
 * 将字节转换成人类可读格式。
 */
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

/**
 * 统一生成目录统计对象。
 */
function createDirStat(dirPath) {
  return {
    path: dirPath,
    totalBytes: 0,
    fileCount: 0,
  };
}

/**
 * 统一生成扩展名统计对象。
 */
function createExtStat(ext) {
  return {
    ext,
    totalBytes: 0,
    fileCount: 0,
  };
}

/**
 * 判断目录是否应被跳过。
 */
function shouldSkipDirectory(dirName, args) {
  if (!args.includeHidden && dirName.startsWith(".")) {
    // 隐藏目录默认跳过，但允许用户显式要求包含
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

/**
 * 返回文件扩展名。
 * 无扩展名时统一记为 "(no_ext)"，便于统计。
 */
function getNormalizedExtension(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return ext || "(no_ext)";
}

/**
 * 将一个文件的体积累加到目录链上。
 * 例如：
 *   文件 a/b/c.txt
 * 会累加到：
 *   "."
 *   "a"
 *   "a/b"
 */
function accumulateToDirectories(dirStatsMap, relativeFilePath, bytes) {
  const normalized = relativeFilePath.split(path.sep).join("/");
  const parts = normalized.split("/");

  // 根目录
  if (!dirStatsMap.has(".")) {
    dirStatsMap.set(".", createDirStat("."));
  }
  dirStatsMap.get(".").totalBytes += bytes;
  dirStatsMap.get(".").fileCount += 1;

  // 逐级父目录
  for (let i = 1; i < parts.length; i += 1) {
    const dirPath = parts.slice(0, i).join("/");
    if (!dirStatsMap.has(dirPath)) {
      dirStatsMap.set(dirPath, createDirStat(dirPath));
    }
    dirStatsMap.get(dirPath).totalBytes += bytes;
    dirStatsMap.get(dirPath).fileCount += 1;
  }
}

/**
 * 将文件归到根级 bucket，便于判断“哪个大区最肥”。
 * 例如：
 *   src/a.js -> src
 *   assets/img/a.png -> assets
 *   package.json -> (root_files)
 */
function getTopLevelBucket(relativeFilePath) {
  const normalized = relativeFilePath.split(path.sep).join("/");
  const parts = normalized.split("/");

  if (parts.length <= 1) {
    return "(root_files)";
  }

  return parts[0];
}

/**
 * 根据文件特征给出“可疑原因”。
 * 这里只做标记，不做删改建议。
 */
function classifySuspect(relativePath, fileName, ext, bytes, suspectMinBytes) {
  const reasons = [];
  const lowerPath = relativePath.toLowerCase();
  const lowerName = fileName.toLowerCase();

  // 1) temp_* 和 temp/ 目录，是本项目已知高风险噪声区
  if (lowerName.startsWith("temp_")) {
    reasons.push("temp_prefix");
  }
  if (lowerPath.includes("/temp/") || lowerPath.startsWith("temp/")) {
    reasons.push("temp_directory");
  }

  // 2) source map
  if (ext === ".map") {
    reasons.push("source_map");
  }

  // 3) 重设计/媒体/压缩等重资源
  if (SUSPECT_EXTENSIONS.has(ext)) {
    reasons.push("heavy_extension");
  }

  // 4) 超阈值大文件
  if (bytes >= suspectMinBytes) {
    reasons.push("large_file");
  }

  return reasons;
}

/**
 * 安全读目录。
 * 遇到权限/损坏等错误时只记录 warning，不直接中断整轮取证。
 */
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

/**
 * 安全 stat。
 */
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

/** -----------------------------
 *  主扫描逻辑
 * ------------------------------*/

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const rootAbs = path.resolve(process.cwd(), args.root);
  const outAbs = path.resolve(process.cwd(), args.out);
  const suspectMinBytes = Math.max(0, Number(args.suspectMinMB) || 0) * 1024 * 1024;

  // 输出数据容器
  const fileEntries = [];
  const dirStatsMap = new Map();
  const extStatsMap = new Map();
  const bucketStatsMap = new Map();
  const suspectEntries = [];
  const warnings = [];

  // 根目录统计对象预置，避免后续空指针
  dirStatsMap.set(".", createDirStat("."));

  /**
   * 递归遍历目录
   */
  async function walkDirectory(currentAbs) {
    const dirents = await safeReadDir(currentAbs, warnings);

    for (const dirent of dirents) {
      const absPath = path.join(currentAbs, dirent.name);
      const relativePath = path.relative(rootAbs, absPath) || ".";

      // 目录：先过滤，再递归
      if (dirent.isDirectory()) {
        if (shouldSkipDirectory(dirent.name, args)) {
          continue;
        }
        await walkDirectory(absPath);
        continue;
      }

      // 符号链接：直接跳过，避免循环
      if (dirent.isSymbolicLink()) {
        warnings.push({
          type: "symlink_skipped",
          path: absPath,
          message: "symbolic link skipped",
        });
        continue;
      }

      // 普通文件：读取体积
      const stat = await safeLstat(absPath, warnings);
      if (!stat || !stat.isFile()) {
        continue;
      }

      const fileName = dirent.name;
      const ext = getNormalizedExtension(fileName);
      const bytes = stat.size;

      const normalizedRelPath = relativePath.split(path.sep).join("/");

      // 记录单文件
      const fileEntry = {
        path: normalizedRelPath,
        name: fileName,
        ext,
        bytes,
        humanBytes: formatBytes(bytes),
      };
      fileEntries.push(fileEntry);

      // 累加目录统计
      accumulateToDirectories(dirStatsMap, relativePath, bytes);

      // 累加扩展名统计
      if (!extStatsMap.has(ext)) {
        extStatsMap.set(ext, createExtStat(ext));
      }
      extStatsMap.get(ext).totalBytes += bytes;
      extStatsMap.get(ext).fileCount += 1;

      // 累加顶层 bucket
      const bucket = getTopLevelBucket(relativePath);
      if (!bucketStatsMap.has(bucket)) {
        bucketStatsMap.set(bucket, {
          bucket,
          totalBytes: 0,
          fileCount: 0,
        });
      }
      bucketStatsMap.get(bucket).totalBytes += bytes;
      bucketStatsMap.get(bucket).fileCount += 1;

      // 可疑文件识别
      const reasons = classifySuspect(
        normalizedRelPath,
        fileName,
        ext,
        bytes,
        suspectMinBytes,
      );

      if (reasons.length > 0) {
        suspectEntries.push({
          path: normalizedRelPath,
          name: fileName,
          ext,
          bytes,
          humanBytes: formatBytes(bytes),
          reasons,
        });
      }
    }
  }

  // 跑扫描
  await walkDirectory(rootAbs);

  /** -----------------------------
   *  结果整理
   * ------------------------------*/

  // 排序：大到小
  const topFiles = [...fileEntries]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, args.top);

  const topDirs = [...dirStatsMap.values()]
    .sort((a, b) => b.totalBytes - a.totalBytes)
    .map((item) => ({
      ...item,
      humanBytes: formatBytes(item.totalBytes),
    }))
    .slice(0, args.top);

  const extStats = [...extStatsMap.values()]
    .sort((a, b) => b.totalBytes - a.totalBytes)
    .map((item) => ({
      ...item,
      humanBytes: formatBytes(item.totalBytes),
    }));

  const topBuckets = [...bucketStatsMap.values()]
    .sort((a, b) => b.totalBytes - a.totalBytes)
    .map((item) => ({
      ...item,
      humanBytes: formatBytes(item.totalBytes),
    }));

  const suspectFiles = [...suspectEntries]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, args.top);

  const totalBytes = fileEntries.reduce((sum, item) => sum + item.bytes, 0);

  const summary = {
    root: rootAbs,
    scannedAt: new Date().toISOString(),
    fileCount: fileEntries.length,
    dirCount: dirStatsMap.size,
    totalBytes,
    humanBytes: formatBytes(totalBytes),
    topCount: args.top,
    suspectMinMB: args.suspectMinMB,
    defaultExcludesEnabled: args.useDefaultExcludes,
    excludedDirs: args.excludeDir,
    includeHidden: args.includeHidden,
    topLevelBuckets: topBuckets.slice(0, 20),
    warnings,
  };

  /** -----------------------------
   *  输出落盘
   * ------------------------------*/

  await fs.mkdir(outAbs, { recursive: true });

  await fs.writeFile(
    path.join(outAbs, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );

  await fs.writeFile(
    path.join(outAbs, "top_files.json"),
    JSON.stringify(topFiles, null, 2),
    "utf8",
  );

  await fs.writeFile(
    path.join(outAbs, "top_dirs.json"),
    JSON.stringify(topDirs, null, 2),
    "utf8",
  );

  await fs.writeFile(
    path.join(outAbs, "ext_stats.json"),
    JSON.stringify(extStats, null, 2),
    "utf8",
  );

  await fs.writeFile(
    path.join(outAbs, "suspect_files.json"),
    JSON.stringify(suspectFiles, null, 2),
    "utf8",
  );

  // 生成人类快速阅读的 markdown 报告
  const reportLines = [];
  reportLines.push("# Size Audit Report");
  reportLines.push("");
  reportLines.push(`- Root: \`${rootAbs}\``);
  reportLines.push(`- Scanned At: \`${summary.scannedAt}\``);
  reportLines.push(`- Total Files: **${summary.fileCount}**`);
  reportLines.push(`- Total Dirs: **${summary.dirCount}**`);
  reportLines.push(`- Total Size: **${summary.humanBytes}**`);
  reportLines.push(`- Suspect Threshold: **${args.suspectMinMB} MB**`);
  reportLines.push("");

  reportLines.push("## Top Level Buckets");
  reportLines.push("");
  reportLines.push("| Bucket | Files | Size |");
  reportLines.push("|---|---:|---:|");
  for (const item of topBuckets.slice(0, 20)) {
    reportLines.push(`| ${item.bucket} | ${item.fileCount} | ${item.humanBytes} |`);
  }
  reportLines.push("");

  reportLines.push("## Top Directories");
  reportLines.push("");
  reportLines.push("| Directory | Files | Size |");
  reportLines.push("|---|---:|---:|");
  for (const item of topDirs.slice(0, 30)) {
    reportLines.push(`| ${item.path} | ${item.fileCount} | ${item.humanBytes} |`);
  }
  reportLines.push("");

  reportLines.push("## Top Files");
  reportLines.push("");
  reportLines.push("| File | Ext | Size |");
  reportLines.push("|---|---:|---:|");
  for (const item of topFiles.slice(0, 30)) {
    reportLines.push(`| ${item.path} | ${item.ext} | ${item.humanBytes} |`);
  }
  reportLines.push("");

  reportLines.push("## Extension Stats");
  reportLines.push("");
  reportLines.push("| Ext | Files | Size |");
  reportLines.push("|---|---:|---:|");
  for (const item of extStats.slice(0, 30)) {
    reportLines.push(`| ${item.ext} | ${item.fileCount} | ${item.humanBytes} |`);
  }
  reportLines.push("");

  reportLines.push("## Suspect Files");
  reportLines.push("");
  reportLines.push("| File | Ext | Size | Reasons |");
  reportLines.push("|---|---:|---:|---|");
  for (const item of suspectFiles.slice(0, 50)) {
    reportLines.push(
      `| ${item.path} | ${item.ext} | ${item.humanBytes} | ${item.reasons.join(", ")} |`,
    );
  }
  reportLines.push("");

  if (warnings.length > 0) {
    reportLines.push("## Warnings");
    reportLines.push("");
    for (const warning of warnings.slice(0, 50)) {
      reportLines.push(
        `- [${warning.type}] \`${warning.path}\` - ${warning.message}`,
      );
    }
    reportLines.push("");
  }

  await fs.writeFile(
    path.join(outAbs, "report.md"),
    reportLines.join("\n"),
    "utf8",
  );

  // 控制台摘要，便于 Copilot 直接复制回传
  console.log("");
  console.log("=== SIZE AUDIT DONE ===");
  console.log(`root: ${rootAbs}`);
  console.log(`files: ${summary.fileCount}`);
  console.log(`dirs: ${summary.dirCount}`);
  console.log(`total: ${summary.humanBytes}`);
  console.log(`out: ${outAbs}`);
  console.log("");

  console.log("Top 10 buckets:");
  for (const item of topBuckets.slice(0, 10)) {
    console.log(`- ${item.bucket}: ${item.humanBytes} (${item.fileCount} files)`);
  }

  console.log("");
  console.log("Top 10 files:");
  for (const item of topFiles.slice(0, 10)) {
    console.log(`- ${item.humanBytes}  ${item.path}`);
  }

  console.log("");
  console.log("Top 10 suspect files:");
  for (const item of suspectFiles.slice(0, 10)) {
    console.log(`- ${item.humanBytes}  ${item.path}  [${item.reasons.join(", ")}]`);
  }
}

main().catch((error) => {
  console.error("size audit failed");
  console.error(error);
  process.exitCode = 1;
});