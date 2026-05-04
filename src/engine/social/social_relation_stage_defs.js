export const RELATION_STAGE_DEFS = Object.freeze([
  Object.freeze({ id: "stranger", label: "陌生", minFavor: 0, maxFavor: 24 }),
  Object.freeze({ id: "acquainted", label: "相识", minFavor: 25, maxFavor: 49 }),
  Object.freeze({ id: "familiar", label: "熟悉", minFavor: 50, maxFavor: 74 }),
  Object.freeze({ id: "trusted", label: "信赖", minFavor: 75, maxFavor: 100 })
]);

const RELATION_STAGE_MAP = new Map(RELATION_STAGE_DEFS.map((row) => [row.id, row]));

export function getRelationStageDefinition(stageId) {
  const key = String(stageId || "").trim();
  if (!key) return null;
  return RELATION_STAGE_MAP.get(key) || null;
}

export function resolveRelationStageIdByFavor(favor) {
  const numericFavor = Number(favor);
  const clampedFavor = Number.isFinite(numericFavor)
    ? Math.max(0, Math.min(100, Math.trunc(numericFavor)))
    : 0;
  const matched = RELATION_STAGE_DEFS.find((row) => clampedFavor >= row.minFavor && clampedFavor <= row.maxFavor);
  return matched ? matched.id : "stranger";
}