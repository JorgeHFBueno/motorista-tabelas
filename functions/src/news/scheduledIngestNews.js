const logger = require("firebase-functions/logger");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {NEWS_SOURCE_CONFIG, EXTERNAL_CATEGORIES, CURATION_CONFIG} = require("./config");
const {fetchRssNews} = require("./providers/rssProvider");
const {curateCategoryItems} = require("./curation/curateNews");
const {saveCuratedNews} = require("./saveNews");

async function fetchForCategory(category) {
  const sources = NEWS_SOURCE_CONFIG[category] || [];
  const allItems = [];
  const sourceResults = [];

  for (const source of sources) {
    try {
      if (source.type !== "rss") continue;

      const fetched = await fetchRssNews(source, category);
      allItems.push(...fetched);
      sourceResults.push({
        source: source.label,
        fetched: fetched.length,
        fallback: Boolean(source.fallback),
      });
    } catch (error) {
      logger.error("[news-ingest] source failed", {
        category,
        source: source.label,
        message: error instanceof Error ? error.message : String(error),
      });
      sourceResults.push({
        source: source.label,
        fetched: 0,
        fallback: Boolean(source.fallback),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {items: allItems, sourceResults};
}

async function runExternalNewsIngestion(context = {}) {
  const summary = {};
  const contributingSources = new Set();
  const totals = {
    fetched: 0,
    curated: 0,
    discarded: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    contributingSources: 0,
  };
  const affectedCategories = [];

  for (const category of EXTERNAL_CATEGORIES) {
    const {items: rawItems, sourceResults} = await fetchForCategory(category);
    const curatedResult = curateCategoryItems(category, rawItems);
    const curated = curatedResult.items.slice(0, CURATION_CONFIG.maxPerCategory);
    const categoryContributingSources = Array.from(new Set(curated.map((item) => item.fonte)));
    categoryContributingSources.forEach((source) => contributingSources.add(source));

    const persisted = await saveCuratedNews(curated);
    const categorySummary = {
      fetched: rawItems.length,
      curated: curated.length,
      discarded: curatedResult.discarded.length,
      contributingSources: categoryContributingSources.length,
      contributingSourceLabels: categoryContributingSources,
      discardedReasons: curatedResult.discarded.reduce((acc, item) => {
        acc[item.reason] = (acc[item.reason] || 0) + 1;
        return acc;
      }, {}),
      sources: sourceResults,
      ...persisted,
    };

    summary[category] = categorySummary;
    totals.fetched += categorySummary.fetched;
    totals.curated += categorySummary.curated;
    totals.discarded += categorySummary.discarded;
    totals.created += categorySummary.created;
    totals.updated += categorySummary.updated;
    totals.skipped += categorySummary.skipped;

    if (categorySummary.created || categorySummary.updated) {
      affectedCategories.push(category);
    }
  }

  totals.contributingSources = contributingSources.size;

  const result = {
    trigger: context.trigger || "unknown",
    executedAt: new Date().toISOString(),
    totals,
    affectedCategories,
    categories: summary,
  };

  logger.info("[news-ingest] finished", result);
  return result;
}

const scheduledIngestNews = onSchedule(
  {
    schedule: "every 12 hours",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
  },
  async () => runExternalNewsIngestion({trigger: "schedule"}),
);

module.exports = {
  runExternalNewsIngestion,
  scheduledIngestNews,
};
