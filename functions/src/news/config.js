const {EXTERNAL_CATEGORIES} = require("./types");

const NEWS_SOURCE_CONFIG = {
  economia: [
    {type: "rss", label: "Agência Brasil Economia", url: "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml"},
  ],
  infraestrutura: [
    {type: "rss", label: "Agência Brasil Geral", url: "https://agenciabrasil.ebc.com.br/rss/geral/feed.xml"},
  ],
  logistica: [
    {type: "rss", label: "CNN Brasil Economia", url: "https://www.cnnbrasil.com.br/economia/feed/"},
  ],
  inovacao: [
    {type: "rss", label: "Canaltech Notícias", url: "https://feeds.feedburner.com/canaltechbr"},
  ],
};

const CURATION_CONFIG = {
  maxPerCategory: 5,
  minResumoLength: 50,
  maxResumoLength: 280,
  titleSimilarityThreshold: 0.9,
  defaultSourceName: "Fonte Externa",
  institutionalSourceName: "Ledur",
};

module.exports = {
  NEWS_SOURCE_CONFIG,
  CURATION_CONFIG,
  EXTERNAL_CATEGORIES,
};