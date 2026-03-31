const logger = require("firebase-functions/logger");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {NEWS_SOURCE_CONFIG, EXTERNAL_CATEGORIES, CURATION_CONFIG} = require("./config");
const {fetchRssNews} = require("./providers/rssProvider");
const {curateCategoryItems} = require("./curation/curateNews");
const {saveCuratedNews} = require("./saveNews");

async function fetchForCategory(category) {
  const sources = NEWS_SOURCE_CONFIG[category] || [];
  const allItems = [];

  for (const source of sources) {
    try {
      if (source.type === "rss") {
        const fetched = await fetchRssNews(source, category);
        allItems.push(...fetched);
      }
    } catch (error) {
      logger.error("[news-ingest] source failed", {
        category,
        source: source.label,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return allItems;
}

const scheduledIngestNews = onSchedule(
  {
    schedule: "every 12 hours",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
  },
  async () => {
    const summary = {};

    for (const category of EXTERNAL_CATEGORIES) {
      const rawItems = await fetchForCategory(category);
      const curated = curateCategoryItems(category, rawItems)
        .sort((a, b) => b.publicadoEm.getTime() - a.publicadoEm.getTime())
        .slice(0, CURATION_CONFIG.maxPerCategory);

      const persisted = await saveCuratedNews(curated);
      summary[category] = {
        fetched: rawItems.length,
        curated: curated.length,
        ...persisted,
      };
    }

    logger.info("[news-ingest] finished", summary);
    return summary;
  },
);

module.exports = {
  scheduledIngestNews,
};