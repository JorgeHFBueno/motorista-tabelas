const crypto = require("crypto");

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  return normalizeWhitespace(String(value || "").replace(/<[^>]*>/g, " "));
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripAccents(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeUrl(rawUrl, baseUrl) {
  if (!rawUrl) return "";

  try {
    const parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch (error) {
    return normalizeWhitespace(rawUrl);
  }
}

function normalizeTitle(value) {
  return stripAccents(normalizeWhitespace(value)).toLowerCase();
}

function tokenize(value) {
  return normalizeTitle(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function jaccardSimilarity(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (!setA.size && !setB.size) return 1;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function stableDedupeHash({category, url, title}) {
  const normalizedUrl = normalizeUrl(url);
  const base = normalizedUrl
    ? `${category}::${normalizedUrl}`
    : `${category}::${normalizeTitle(title)}`;

  return crypto.createHash("sha256").update(base).digest("hex");
}

function extractFirstImageFromHtml(value, baseUrl) {
  const html = String(value || "");
  const imagePatterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<img[^>]+src=["']([^"']+)["']/i,
  ];

  for (const pattern of imagePatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return normalizeUrl(match[1], baseUrl);
    }
  }

  return "";
}

module.exports = {
  decodeHtmlEntities,
  extractFirstImageFromHtml,
  jaccardSimilarity,
  normalizeTitle,
  normalizeUrl,
  normalizeWhitespace,
  stableDedupeHash,
  stripAccents,
  stripHtml,
  tokenize,
};
