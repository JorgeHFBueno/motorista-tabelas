const {XMLParser} = require("fast-xml-parser");
const {stripHtml, normalizeWhitespace} = require("../normalizers/text");

const parser = new XMLParser({ignoreAttributes: false, attributeNamePrefix: ""});

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractImage(item) {
  if (item.enclosure && typeof item.enclosure.url === "string") return item.enclosure.url;
  if (typeof item["media:thumbnail"]?.url === "string") return item["media:thumbnail"].url;
  if (typeof item["media:content"]?.url === "string") return item["media:content"].url;
  return null;
}

async function fetchRssNews(source, category) {
  const response = await fetch(source.url, {headers: {"user-agent": "ledur-news-ingest/1.0"}});
  if (!response.ok) throw new Error(`RSS request failed (${response.status})`);

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel;
  const items = asArray(channel?.item);

  return items.map((item) => ({
    category,
    title: normalizeWhitespace(item.title || ""),
    summary: stripHtml(item.description || item.summary || item.content || ""),
    url: normalizeWhitespace(item.link || "") || null,
    imageUrl: extractImage(item),
    publishedAtRaw: item.pubDate || item.published || item.updated || null,
    sourceName: source.label || normalizeWhitespace(channel?.title || "Fonte RSS"),
  }));
}

module.exports = {
  fetchRssNews,
};