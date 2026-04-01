const {CURATION_CONFIG} = require("../config");
const {
  jaccardSimilarity,
  normalizeTitle,
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

function countKeywordMatches(text, keyword) {
  if (!text || !keyword) return 0;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(^|\\b)${escaped}(\\b|$)`, "g");
  return Array.from(text.matchAll(regex)).length;
}

function scoreKeywordList(text, keywords, weight) {
  return keywords.reduce((score, keyword) => score + (countKeywordMatches(text, normalizeTitle(keyword)) * weight), 0);
}

function buildScoredText(item) {
  return {
    title: normalizeTitle(item.title),
    summary: normalizeTitle(item.summary),
    sourceName: normalizeTitle(item.sourceName),
    sourceHints: normalizeTitle((item.sourceHints || []).join(" ")),
  };
}

function computeCategoryScore(category, item) {
  const scoring = CURATION_CONFIG.scoring[category];
  const texts = buildScoredText(item);
  const fullText = [texts.title, texts.summary, texts.sourceName, texts.sourceHints].filter(Boolean).join(" ");

  const positiveScore =
    scoreKeywordList(texts.title, scoring.positive, 4) +
    scoreKeywordList(texts.summary, scoring.positive, 2) +
    scoreKeywordList(texts.sourceName, scoring.positive, 1) +
    scoreKeywordList(texts.sourceHints, scoring.positive, 2);

  const negativeScore =
    scoreKeywordList(texts.title, scoring.negative, 5) +
    scoreKeywordList(texts.summary, scoring.negative, 3) +
    scoreKeywordList(fullText, scoring.negative, 1);

  const requiredMatch = scoring.requiredAny.some((keyword) => fullText.includes(normalizeTitle(keyword)));
  const score = positiveScore - negativeScore + (item.imageUrl ? 1 : 0) + (requiredMatch ? 2 : -4);

  return {
    score,
    requiredMatch,
    positiveScore,
    negativeScore,
    matchedTags: scoring.positive.filter((keyword) => fullText.includes(normalizeTitle(keyword))).slice(0, 6),
  };
}

function curateCategoryItems(category, rawItems) {
  const byUrl = new Set();
  const byHash = new Set();
  const selected = [];
  const discarded = [];
  const minimumScore = CURATION_CONFIG.minCategoryScore[category] || 0;

  for (const item of rawItems) {
    const titulo = normalizeWhitespace(item.title);
    const resumo = normalizeWhitespace(item.summary).slice(0, CURATION_CONFIG.maxResumoLength);

    if (!titulo) {
      discarded.push({reason: "missing_title"});
      continue;
    }

    if (!resumo || resumo.length < CURATION_CONFIG.minResumoLength) {
      discarded.push({reason: "short_summary", title: titulo});
      continue;
    }

    const normalizedUrl = normalizeUrl(item.url || "", item.sourceUrl);
    const hashDedupe = stableDedupeHash({category, url: normalizedUrl, title: titulo});

    if (normalizedUrl && byUrl.has(normalizedUrl)) {
      discarded.push({reason: "duplicate_url", title: titulo});
      continue;
    }

    if (byHash.has(hashDedupe)) {
      discarded.push({reason: "duplicate_hash", title: titulo});
      continue;
    }

    const tooSimilar = selected.some((existing) =>
      jaccardSimilarity(existing.titulo, titulo) >= CURATION_CONFIG.titleSimilarityThreshold,
    );
    if (tooSimilar) {
      discarded.push({reason: "similar_title", title: titulo});
      continue;
    }

    const scoring = computeCategoryScore(category, item);
    if (scoring.score < minimumScore) {
      discarded.push({reason: "low_score", title: titulo, score: scoring.score});
      continue;
    }

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
      tags: scoring.matchedTags,
      destaque: false,
      hashDedupe,
      relevanciaScore: scoring.score,
    };

    selected.push(curated);
    if (normalizedUrl) byUrl.add(normalizedUrl);
    byHash.add(hashDedupe);
  }

  selected.sort((a, b) => {
    if (b.relevanciaScore !== a.relevanciaScore) return b.relevanciaScore - a.relevanciaScore;
    return b.publicadoEm.getTime() - a.publicadoEm.getTime();
  });

  return {
    items: selected.slice(0, CURATION_CONFIG.maxPerCategory),
    discarded,
  };
}

module.exports = {
  curateCategoryItems,
  computeCategoryScore,
};
