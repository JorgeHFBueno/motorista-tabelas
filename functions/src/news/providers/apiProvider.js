async function fetchApiNews() {
  throw new Error("API provider not configured yet. Configure source in functions/src/news/config.js");
}

module.exports = {
  fetchApiNews,
};