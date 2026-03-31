const crypto = require("crypto");

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  return normalizeWhitespace(String(value || "").replace(/<[^>]*>/g, " "));
}

function normalizeUrl(rawUrl) {
  if (!rawUrl) return "";

  try {
    const parsed = new URL(rawUrl);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch (error) {
    return normalizeWhitespace(rawUrl);
  }
}

function normalizeTitle(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function tokenize(value) {
  return normalizeTitle(value)
    .split(/\W+/)
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

module.exports = {
  normalizeWhitespace,
  stripHtml,
  normalizeUrl,
  normalizeTitle,
  jaccardSimilarity,
  stableDedupeHash,
};