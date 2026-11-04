const {XMLParser} = require("fast-xml-parser");
const {CURATION_CONFIG} = require("../config");
const {
  decodeHtmlEntities,
  extractFirstImageFromHtml,
  normalizeUrl,
  normalizeWhitespace,
  stripHtml,
} = require("../normalizers/text");

const parser = new XMLParser({ignoreAttributes: false, attributeNamePrefix: ""});

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function readNestedImageUrl(value, baseUrl) {
  if (!value) return "";

  if (typeof value === "string") {
    return normalizeUrl(value, baseUrl);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readNestedImageUrl(item, baseUrl);
      if (found) return found;
    }
    return "";
  }

  if (typeof value === "object") {
    const direct = value.url || value.href || value.src;
    if (typeof direct === "string") {
      return normalizeUrl(direct, baseUrl);
    }

    const content = value["#text"] || value.content;
    if (typeof content === "string") {
      return normalizeUrl(content, baseUrl);
    }
  }

  return "";
}

function isValidImageUrl(imageUrl) {
  if (!imageUrl) return false;

  try {
    const parsed = new URL(imageUrl);
    const pathname = parsed.pathname.toLowerCase();
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (pathname.endsWith(".svg")) return false;
    return /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(pathname) || pathname.includes("/image") || pathname.includes("/media");
  } catch (error) {
    return false;
  }
}

function extractImageFromItem(item, articleUrl) {
  const candidates = [
    readNestedImageUrl(item.enclosure, articleUrl),
    readNestedImageUrl(item["media:content"], articleUrl),
    readNestedImageUrl(item["media:thumbnail"], articleUrl),
    readNestedImageUrl(item.thumbnail, articleUrl),
    readNestedImageUrl(item.image, articleUrl),
    extractFirstImageFromHtml(item.description, articleUrl),
    extractFirstImageFromHtml(item.summary, articleUrl),
    extractFirstImageFromHtml(item["content:encoded"], articleUrl),
    extractFirstImageFromHtml(item.content, articleUrl),
  ];

  return candidates.find(isValidImageUrl) || "";
}

async function fetchOgImage(articleUrl) {
  if (!articleUrl) return "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CURATION_CONFIG.imageRequestTimeoutMs);

  try {
    const response = await fetch(articleUrl, {
      headers: {"user-agent": "ledur-news-ingest/1.0"},
      signal: controller.signal,
    });

    if (!response.ok) return "";

    const html = await response.text();
    const imageUrl = extractFirstImageFromHtml(html, articleUrl);
    return isValidImageUrl(imageUrl) ? imageUrl : "";
  } catch (error) {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRssNews(source, category) {
  const response = await fetch(source.url, {headers: {"user-agent": "ledur-news-ingest/1.0"}});
  if (!response.ok) throw new Error(`RSS request failed (${response.status})`);

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel || parsed?.feed;
  const items = asArray(channel?.item || channel?.entry).slice(0, CURATION_CONFIG.maxItemsPerSource);

  const normalizedItems = [];
  for (const item of items) {
    const articleUrl = normalizeUrl(
      item.link?.href || item.link || item.id || "",
      source.url,
    );
    const summaryHtml = item.description || item.summary || item["content:encoded"] || item.content || "";
    const imageFromFeed = extractImageFromItem(item, articleUrl);
    const imageUrl = imageFromFeed || await fetchOgImage(articleUrl);

    normalizedItems.push({
      category,
      title: normalizeWhitespace(decodeHtmlEntities(item.title || "")),
      summary: stripHtml(decodeHtmlEntities(summaryHtml)),
      url: articleUrl || null,
      imageUrl: imageUrl || null,
      publishedAtRaw: item.pubDate || item.published || item.updated || item.isoDate || null,
      sourceName: source.label || normalizeWhitespace(channel?.title || "Fonte RSS"),
      sourceHints: Array.isArray(source.sourceHints) ? source.sourceHints : [],
      sourceUrl: source.url,
    });
  }

  return normalizedItems;
}

module.exports = {
  fetchRssNews,
};
