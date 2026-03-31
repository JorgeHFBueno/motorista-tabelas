const {CURATION_CONFIG} = require("../config");
const {
  jaccardSimilarity,
  normalizeUrl,
  normalizeWhitespace,
  stableDedupeHash,
} = require("../normalizers/text");

function parsePublishedAt(rawValue) {
  if (!rawValue) return new Date();
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function curateCategoryItems(category, rawItems) {
  const byUrl = new Set();
  const byHash = new Set();
  const selected = [];

  for (const item of rawItems) {
    const titulo = normalizeWhitespace(item.title);
    const resumo = normalizeWhitespace(item.summary).slice(0, CURATION_CONFIG.maxResumoLength);

    if (!titulo) continue;
    if (!resumo || resumo.length < CURATION_CONFIG.minResumoLength) continue;

    const normalizedUrl = normalizeUrl(item.url || "");
    const hashDedupe = stableDedupeHash({category, url: normalizedUrl, title: titulo});

    if (normalizedUrl && byUrl.has(normalizedUrl)) continue;
    if (byHash.has(hashDedupe)) continue;

    const tooSimilar = selected.some((existing) =>
      jaccardSimilarity(existing.titulo, titulo) >= CURATION_CONFIG.titleSimilarityThreshold,
    );
    if (tooSimilar) continue;

    const curated = {
      titulo,
      resumo,
      url: normalizedUrl || null,
      imagemUrl: item.imageUrl || null,
      categoria: category,
      fonte: item.sourceName || CURATION_CONFIG.defaultSourceName,
      publicadoEm: parsePublishedAt(item.publishedAtRaw),
      origem: "externa",
      status: "publicada",
      tags: [],
      destaque: false,
      hashDedupe,
    };

    selected.push(curated);
    if (normalizedUrl) byUrl.add(normalizedUrl);
    byHash.add(hashDedupe);

    if (selected.length >= CURATION_CONFIG.maxPerCategory) break;
  }

  return selected;
}

module.exports = {
  curateCategoryItems,
};