const {EXTERNAL_CATEGORIES} = require("./types");

const NEWS_SOURCE_CONFIG = {
  economia: [
    {
      type: "rss",
      label: "Agencia Brasil Economia",
      url: "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml",
      sourceHints: ["economia", "industria", "investimento", "setor produtivo"],
    },
    {
      type: "rss",
      label: "CNN Brasil Economia",
      url: "https://www.cnnbrasil.com.br/economia/feed/",
      sourceHints: ["mercado", "credito", "inflacao", "industria"],
    },
    {
      type: "rss",
      label: "Agencia Brasil Geral",
      url: "https://agenciabrasil.ebc.com.br/rss/geral/feed.xml",
      sourceHints: ["obras", "infraestrutura", "investimento"],
      fallback: true,
    },
  ],
  infraestrutura: [
    {
      type: "rss",
      label: "Agencia Brasil Geral",
      url: "https://agenciabrasil.ebc.com.br/rss/geral/feed.xml",
      sourceHints: ["infraestrutura", "obras", "rodovia", "ferrovia", "porto", "saneamento", "energia"],
    },
    {
      type: "rss",
      label: "Agencia Brasil Economia",
      url: "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml",
      sourceHints: ["concessao", "investimento", "infraestrutura"],
    },
    {
      type: "rss",
      label: "CNN Brasil Economia",
      url: "https://www.cnnbrasil.com.br/economia/feed/",
      sourceHints: ["rodovia", "energia", "concessao", "obras"],
      fallback: true,
    },
  ],
  logistica: [
    {
      type: "rss",
      label: "CNN Brasil Economia",
      url: "https://www.cnnbrasil.com.br/economia/feed/",
      sourceHints: ["logistica", "transporte", "frete", "cadeia de suprimentos", "armazenagem"],
    },
    {
      type: "rss",
      label: "Agencia Brasil Geral",
      url: "https://agenciabrasil.ebc.com.br/rss/geral/feed.xml",
      sourceHints: ["porto", "ferrovia", "carga", "mobilidade", "transporte"],
    },
    {
      type: "rss",
      label: "Agencia Brasil Economia",
      url: "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml",
      sourceHints: ["industria", "cadeia de suprimentos", "operacoes"],
      fallback: true,
    },
  ],
  inovacao: [
    {
      type: "rss",
      label: "Canaltech Noticias",
      url: "https://feeds.feedburner.com/canaltechbr",
      sourceHints: ["ia aplicada", "automacao", "industria", "operacoes"],
    },
    {
      type: "rss",
      label: "Olhar Digital",
      url: "https://olhardigital.com.br/feed/",
      sourceHints: ["transformacao digital", "automacao", "industria 4.0"],
    },
    {
      type: "rss",
      label: "CNN Brasil Economia",
      url: "https://www.cnnbrasil.com.br/economia/feed/",
      sourceHints: ["inovacao industrial", "produtividade", "ia aplicada"],
      fallback: true,
    },
  ],
};

const CURATION_CONFIG = {
  maxPerCategory: 5,
  maxItemsPerSource: 12,
  minResumoLength: 50,
  maxResumoLength: 280,
  titleSimilarityThreshold: 0.9,
  defaultSourceName: "Fonte Externa",
  institutionalSourceName: "Ledur",
  imageRequestTimeoutMs: 8000,
  minCategoryScore: {
    economia: 8,
    infraestrutura: 10,
    logistica: 9,
    inovacao: 11,
  },
  // Ajuste aqui os sinais editoriais por categoria.
  scoring: {
    economia: {
      positive: [
        "economia", "mercado", "industria", "industrial", "investimento", "credito", "inflacao",
        "juros", "producao", "setor produtivo", "cadeia produtiva", "cimento", "concreto",
        "construcao", "construcao civil", "infraestrutura", "saneamento", "energia", "obras",
      ],
      negative: [
        "futebol", "celebridade", "entretenimento", "novela", "bbb", "filme", "serie",
      ],
      requiredAny: ["economia", "industria", "investimento", "credito", "inflacao", "construcao", "infraestrutura"],
    },
    infraestrutura: {
      positive: [
        "infraestrutura", "obra", "obras", "engenharia", "construcao pesada", "rodovia", "ponte",
        "ferrovia", "porto", "aeroporto", "hidrovia", "saneamento", "energia", "transmissao",
        "subestacao", "concessao", "duplicacao", "pavimentacao", "cimento", "concreto",
      ],
      negative: [
        "smartphone", "gadget", "influencer", "streaming", "entretenimento", "games",
      ],
      requiredAny: ["infraestrutura", "obra", "obras", "rodovia", "ferrovia", "porto", "saneamento", "energia", "engenharia"],
    },
    logistica: {
      positive: [
        "logistica", "transporte", "frete", "armazenagem", "armazenamento", "estoque", "carga",
        "frota", "cadeia de suprimentos", "supply chain", "distribuicao", "centro de distribuicao",
        "porto", "ferrovia", "rodovia", "terminal", "operacoes", "mobilidade de cargas",
      ],
      negative: [
        "passageiro", "turismo", "show", "festival", "celebridade", "entretenimento",
      ],
      requiredAny: ["logistica", "transporte", "frete", "armazenagem", "carga", "frota", "cadeia de suprimentos", "operacoes"],
    },
    inovacao: {
      positive: [
        "ia aplicada", "inteligencia artificial", "automacao", "industria 4.0", "bim", "digital twin",
        "robotica", "produtividade", "transformacao digital", "eficiencia operacional",
        "engenharia", "industria", "industrial", "construcao", "canteiro", "logistica",
        "transporte", "manutencao preditiva", "sensoriamento", "software empresarial", "erp",
      ],
      negative: [
        "smartphone", "celular", "iphone", "android", "review", "analise do produto", "hands-on",
        "gadget", "console", "game", "games", "filme", "serie", "streaming", "entretenimento",
        "rede social", "instagram", "tiktok", "whatsapp", "rumor", "vazamento", "camera",
      ],
      requiredAny: ["ia aplicada", "automacao", "industria", "engenharia", "construcao", "logistica", "operacoes", "transformacao digital"],
    },
  },
};

module.exports = {
  NEWS_SOURCE_CONFIG,
  CURATION_CONFIG,
  EXTERNAL_CATEGORIES,
};
