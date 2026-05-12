import west2ReflectivePost001 from "./facilities/west2_reflective_post_001.js";
import steelcrossPortMarket001 from "./facilities/steelcross_port_market_001.js";
import west2Windbreak001 from "./facilities/west2_windbreak_001.js";
import industrialManifestPost001 from "./institutions/industrial_manifest_post_001.js";
import steelcrossPortTheseusLuggageShift001 from "./institutions/steelcross_port_theseus_luggage_shift_001.js";

const recordDefinitionMetaByKey = Object.freeze({
  west2ReflectivePost001: Object.freeze({
    id: "west2_reflective_post_001",
    category: "facilities",
    region: "WEST2",
    tags: Object.freeze(["WEST2", "风堤街", "导向设施", "低能见度", "工程走廊"]),
    reward: Object.freeze({
      firstUnlock: Object.freeze({
        socialExp: 10
      })
    }),
    unlockToast: "新增记录：风堤街反光杆",
    importance: "normal"
  }),
  industrialManifestPost001: Object.freeze({
    id: "industrial_manifest_post_001",
    category: "institutions",
    region: "CambCity",
    tags: Object.freeze(["CambCity", "工区分流口", "仓储前场", "箱单核对", "短工岗位"]),
    order: 210,
    reward: Object.freeze({
      firstUnlock: Object.freeze({
        socialExp: 10
      })
    }),
    unlockToast: "新增记录：箱单核对岗位",
    importance: "normal"
  }),
  steelcrossPortMarket001: Object.freeze({
    id: "steelcross_port_market_001",
    category: "facilities",
    region: "WEST2",
    tags: Object.freeze(["WEST2", "钢十字", "港口", "临时集市", "补缺供给"]),
    order: 310,
    reward: Object.freeze({
      firstUnlock: Object.freeze({
        socialExp: 10
      })
    }),
    unlockToast: "新增记录：到港集市",
    importance: "normal"
  }),
  steelcrossPortTheseusLuggageShift001: Object.freeze({
    id: "steelcross_port_theseus_luggage_shift_001",
    category: "institutions",
    region: "WEST2",
    tags: Object.freeze(["WEST2", "钢十字港口", "忒修斯号", "码头杂务", "临时劳务"]),
    order: 320,
    reward: Object.freeze({
      firstUnlock: Object.freeze({
        socialExp: 10
      })
    }),
    unlockToast: "新增记录：忒修斯号码头杂务",
    importance: "normal"
  }),
});

function summarizeBody(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  const firstParagraph = normalized.split(/\n{2,}/)[0] || normalized;
  return firstParagraph.length > 64 ? `${firstParagraph.slice(0, 64).trim()}...` : firstParagraph;
}

function buildLegacySourcesFromReferences(references) {
  if (!Array.isArray(references) || references.length === 0) return Object.freeze([]);
  return Object.freeze(references.map((entry) => Object.freeze({
    label: String(entry?.label || entry?.source || "").trim(),
    ...(entry?.quote != null
      ? { note: String(entry.quote).trim() }
      : Array.isArray(entry?.excerpts) && entry.excerpts[0]?.original != null
        ? { note: String(entry.excerpts[0].original).trim() }
        : {}),
    ...(entry?.url != null ? { url: String(entry.url).trim() } : {})
  })));
}

function buildLegacyScienceBody(references) {
  if (!Array.isArray(references) || references.length === 0) return "参考资料见下。";
  const firstQuote = references
    .map((entry) => {
      if (entry?.quote != null) return String(entry.quote).trim();
      if (Array.isArray(entry?.excerpts) && entry.excerpts[0]?.original != null) {
        return String(entry.excerpts[0].original).trim();
      }
      return "";
    })
    .find((quote) => quote.length > 0);
  return firstQuote || "参考资料见下。";
}

function buildRecordDefinition(asset, meta = {}) {
  const tags = Array.isArray(meta.tags) ? Object.freeze(meta.tags.map((tag) => String(tag || ""))) : Object.freeze([]);
  const references = Array.isArray(asset?.references)
    ? Object.freeze(asset.references.map((entry) => Object.freeze({ ...entry })))
    : Object.freeze([]);
  const sources = buildLegacySourcesFromReferences(references);
  return Object.freeze({
    id: String(meta.id || "").trim(),
    order: Number.isFinite(Number(meta.order)) ? Math.trunc(Number(meta.order)) : 0,
    title: String(asset?.title || "").trim(),
    category: String(meta.category || "").trim(),
    tags,
    summary: summarizeBody(asset?.body),
    body: String(asset?.body || "").trim(),
    scienceTitle: "参考",
    scienceBody: buildLegacyScienceBody(references),
    sources,
    references,
    reward: meta.reward || Object.freeze({ firstUnlock: Object.freeze({ socialExp: 0 }) }),
    unlockToast: String(meta.unlockToast || "").trim(),
    uiMeta: Object.freeze({
      region: String(meta.region || "").trim(),
      importance: String(meta.importance || "normal").trim() || "normal",
      order: Number.isFinite(Number(meta.order)) ? Math.trunc(Number(meta.order)) : 0
    })
  });
}

export const recordDefinitions = Object.freeze([
  buildRecordDefinition(west2ReflectivePost001, recordDefinitionMetaByKey.west2ReflectivePost001),
  buildRecordDefinition(industrialManifestPost001, recordDefinitionMetaByKey.industrialManifestPost001),
  buildRecordDefinition(steelcrossPortMarket001, recordDefinitionMetaByKey.steelcrossPortMarket001),
  buildRecordDefinition(steelcrossPortTheseusLuggageShift001, recordDefinitionMetaByKey.steelcrossPortTheseusLuggageShift001),
  west2Windbreak001
]);

export default recordDefinitions;