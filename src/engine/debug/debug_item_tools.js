function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase();
}

export function sanitizeDebugItemGrantQuantity(value) {
  const amount = Math.floor(Number(value));
  return Number.isFinite(amount) && amount > 0 ? amount : 1;
}

export function buildDebugItemCatalog(itemsById) {
  if (!(itemsById instanceof Map)) return [];

  const catalog = [];
  for (const [itemId, itemDef] of itemsById.entries()) {
    const id = String(itemId || "").trim();
    if (!id) continue;

    const rawName = String(itemDef?.name || "").trim();
    const displayName = rawName || id;
    const category = String(itemDef?.category || "unknown").trim() || "unknown";
    catalog.push({
      id,
      name: displayName,
      category,
      searchText: normalizeSearchText(`${displayName} ${id}`),
      hasRawName: !!rawName
    });
  }

  catalog.sort((left, right) => {
    const leftPrimary = normalizeSearchText(left.hasRawName ? left.name : left.id);
    const rightPrimary = normalizeSearchText(right.hasRawName ? right.name : right.id);
    if (leftPrimary !== rightPrimary) return leftPrimary.localeCompare(rightPrimary, "zh-CN");
    return normalizeSearchText(left.id).localeCompare(normalizeSearchText(right.id), "zh-CN");
  });

  return catalog;
}

export function filterDebugItemCatalog(catalog, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return Array.isArray(catalog) ? catalog.slice() : [];
  }

  return (Array.isArray(catalog) ? catalog : []).filter((entry) => entry.searchText.includes(normalizedQuery));
}