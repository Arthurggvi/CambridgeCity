// ============================================================================
// Validate All Maps - 启动期全量地图引用完整性校验（P0-4）
// ============================================================================

import { buildMapIndex } from "./map_index.js";
import { extractMapReferences } from "./reference_extractor.js";

const STARTUP_MAP_VALIDATION_EXCLUDED_FILENAMES = ["test_broken_ref.json"];

/**
 * @typedef {import('./reference_extractor.js').Reference} Reference
 */

/**
 * @typedef {Object} ValidationReport
 * @property {Reference[]} missingTargets
 * @property {{filePath: string, message: string}[]} parseErrors
 * @property {{mapId: string, files: string[]}[]} duplicateIds
 * @property {{ totalMaps: number, totalRefs: number, missingCount: number }} summary
 */

function printReport(report) {
  const totalMaps = report.summary.totalMaps;
  const totalRefs = report.summary.totalRefs;
  const missing = report.summary.missingCount;
  const duplicates = report.duplicateIds.length;
  const parseErrors = report.parseErrors.length;

  console.error(`[ValidateAllMaps] totalMaps=${totalMaps} totalRefs=${totalRefs} missing=${missing} duplicates=${duplicates} parseErrors=${parseErrors}`);

  for (const pe of report.parseErrors) {
    console.error(`[ValidateAllMaps] ParseError ${pe.filePath}: ${pe.message}`);
  }

  for (const d of report.duplicateIds) {
    console.error(`[ValidateAllMaps] Duplicate mapId "${d.mapId}": ${d.files.join(" | ")}`);
  }

  for (const r of report.missingTargets) {
    console.error(
      `Missing target mapId "${r.targetMapId}" referenced by ${r.sourceFilePath} @ ${r.jsonPath} (mapId=${r.sourceMapId}, refType=${r.refType})`
    );
  }
}

/**
 * validateAllMaps(mapsDirUrl)
 * @param {string} mapsDirUrl - 例如 "data/maps/"
 * @returns {Promise<ValidationReport>}
 */
export async function validateAllMaps(mapsDirUrl) {
  const index = await buildMapIndex(mapsDirUrl, {
    excludedFilenames: STARTUP_MAP_VALIDATION_EXCLUDED_FILENAMES
  });

  const missingTargets = [];
  let totalRefs = 0;

  for (const entry of index.all) {
    const refs = extractMapReferences(entry.json, entry.filePath);
    totalRefs += refs.length;

    for (const ref of refs) {
      const ok = index.byId.has(ref.targetMapId);
      if (!ok) {
        missingTargets.push(ref);
      }
    }
  }

  /** @type {ValidationReport} */
  const report = {
    missingTargets,
    parseErrors: index.parseErrors,
    duplicateIds: index.duplicateIds,
    summary: {
      totalMaps: index.all.length,
      totalRefs,
      missingCount: missingTargets.length
    }
  };

  // 开发期打印（不中断运行）
  if (report.missingTargets.length > 0 || report.parseErrors.length > 0 || report.duplicateIds.length > 0) {
    printReport(report);
  } else {
    console.log(`[ValidateAllMaps] totalMaps=${report.summary.totalMaps} totalRefs=${report.summary.totalRefs} missing=0 duplicates=0 parseErrors=0`);
  }

  return report;
}

// 开发期：便于在控制台手动调用
export const __printValidateAllMapsReport = printReport;
