const {CURATION_CONFIG} = require("../config");
const {EXTERNAL_CATEGORIES} = require("../types");
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

function countDistinctMatches(text, keywords) {
  if (!text || !Array.isArray(keywords) || keywords.length === 0) return 0;
  return keywords.reduce((count, keyword) => (
    text.includes(normalizeTitle(keyword)) ? count + 1 : count
  ), 0);
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
  const editorialText = [texts.title, texts.summary, texts.sourceName].filter(Boolean).join(" ");
  const fullText = [editorialText, texts.sourceHints].filter(Boolean).join(" ");

  const positiveScore =
    scoreKeywordList(texts.title, scoring.positive, 4) +
    scoreKeywordList(texts.summary, scoring.positive, 2) +
    scoreKeywordList(texts.sourceName, scoring.positive, 1) +
    scoreKeywordList(texts.sourceHints, scoring.positive, 2);

  const negativeScore =
    scoreKeywordList(texts.title, scoring.negative, 5) +
    scoreKeywordList(texts.summary, scoring.negative, 3) +
    scoreKeywordList(fullText, scoring.negative, 1);

  const requiredMatches = countDistinctMatches(editorialText, scoring.requiredAny);
  const contextMatches = countDistinctMatches(editorialText, scoring.contextAny);
  const requiredMatch = requiredMatches > 0;
  const contextMatch = !Array.isArray(scoring.contextAny) || contextMatches > 0;
  const score =
    positiveScore -
    negativeScore +
    (item.imageUrl ? 1 : 0) +
    (requiredMatches * 2) +
    Math.min(contextMatches, 3) -
    (requiredMatch ? 0 : 6) -
    (contextMatch ? 0 : 6);

  return {
    score,
    requiredMatch,
    contextMatch,
    requiredMatches,
    contextMatches,
    positiveScore,
    negativeScore,
    matchedTags: scoring.positive.filter((keyword) => editorialText.includes(normalizeTitle(keyword))).slice(0, 6),
  };
}

function classifyItem(item) {
  const ranked = EXTERNAL_CATEGORIES
    .map((category) => ({category, ...computeCategoryScore(category, item)}))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.requiredMatches - a.requiredMatches;
    });

  const best = ranked[0];
  const runnerUp = ranked[1] || null;
  const minimumScore = CURATION_CONFIG.minCategoryScore[best.category] || 0;
  const minimumLeadScore = CURATION_CONFIG.classification.minimumLeadScore || 0;

  if (!best.requiredMatch || !best.contextMatch || best.score < minimumScore) {
    return {
      bestCategory: null,
      best,
      runnerUp,
    };
  }

  if (runnerUp && (best.score - runnerUp.score) < minimumLeadScore && runnerUp.score >= (CURATION_CONFIG.minCategoryScore[runnerUp.category] || 0)) {
    return {
      bestCategory: null,
      best,
      runnerUp,
    };
  }

  return {
    bestCategory: best.category,
    best,
    runnerUp,
  };
}

function pickItemsWithSourceDiversity(items) {
  const selected = [];
  const pending = [...items];
  const sourceCounts = new Map();

  while (pending.length > 0 && selected.length < CURATION_CONFIG.maxPerCategory) {
    pending.sort((a, b) => {
      const sourcePenaltyA = (sourceCounts.get(a.fonte) || 0) * CURATION_CONFIG.sourceDiversityPenalty;
      const sourcePenaltyB = (sourceCounts.get(b.fonte) || 0) * CURATION_CONFIG.sourceDiversityPenalty;
      const effectiveA = a.relevanciaScore - sourcePenaltyA;
      const effectiveB = b.relevanciaScore - sourcePenaltyB;

      if (effectiveB !== effectiveA) return effectiveB - effectiveA;
      if (b.relevanciaScore !== a.relevanciaScore) return b.relevanciaScore - a.relevanciaScore;
      return b.publicadoEm.getTime() - a.publicadoEm.getTime();
    });

    const next = pending.shift();
    if (!next) break;

    selected.push(next);
    sourceCounts.set(next.fonte, (sourceCounts.get(next.fonte) || 0) + 1);
  }

  return selected;
}

function curateCategoryItems(category, rawItems) {
  const byUrl = new Set();
  const byHash = new Set();
  const candidates = [];
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

    const tooSimilar = candidates.some((existing) =>
      jaccardSimilarity(existing.titulo, titulo) >= CURATION_CONFIG.titleSimilarityThreshold,
    );
    if (tooSimilar) {
      discarded.push({reason: "similar_title", title: titulo});
      continue;
    }

    const scoring = computeCategoryScore(category, item);
    const classification = classifyItem(item);

    if (!classification.bestCategory) {
      discarded.push({reason: "no_category_match", title: titulo, score: scoring.score});
      continue;
    }

    if (classification.bestCategory !== category) {
      discarded.push({
        reason: "better_fit_other_category",
        title: titulo,
        score: scoring.score,
        bestCategory: classification.bestCategory,
      });
      continue;
    }

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

    candidates.push(curated);
    if (normalizedUrl) byUrl.add(normalizedUrl);
    byHash.add(hashDedupe);
  }

  const selected = pickItemsWithSourceDiversity(candidates);

  return {
    items: selected,
    discarded,
  };
}

module.exports = {
  curateCategoryItems,
  classifyItem,
  computeCategoryScore,
};
