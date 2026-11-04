const {EXTERNAL_CATEGORIES} = require("./types");

const NEWS_SOURCE_CONFIG = {
  economia: [
    {
      type: "rss",
      label: "Agencia Brasil Economia",
      url: "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml",
      sourceHints: ["economia", "industria", "investimento", "setor produtivo", "infraestrutura"],
    },
    {
      type: "rss",
      label: "InfoMoney",
      url: "https://www.infomoney.com.br/feed/",
      sourceHints: ["mercado", "credito", "inflacao", "investimento", "industria"],
    },
    {
      type: "rss",
      label: "Money Times",
      url: "https://www.moneytimes.com.br/feed/",
      sourceHints: ["mercado", "setor produtivo", "investimento", "industria", "custos"],
    },
    {
      type: "rss",
      label: "Forbes Money",
      url: "https://forbes.com.br/forbes-money/feed/",
      sourceHints: ["mercado", "investimento", "financiamento", "produtividade"],
    },
  ],
  infraestrutura: [
    {
      type: "rss",
      label: "Agencia iNFRA",
      url: "https://agenciainfra.com/blog/feed/",
      sourceHints: ["infraestrutura", "concessao", "rodovia", "ferrovia", "porto", "saneamento", "energia"],
    },
    {
      type: "rss",
      label: "Mobilidade Estadao",
      url: "https://mobilidade.estadao.com.br/feed/",
      sourceHints: ["mobilidade", "transporte", "metro", "ferrovia", "infraestrutura urbana"],
    },
    {
      type: "rss",
      label: "ABDIB",
      url: "https://www.abdib.org.br/feed/",
      sourceHints: ["infraestrutura", "construcao", "obras", "energia", "saneamento", "concessao"],
    },
    {
      type: "rss",
      label: "Cimento Itambe",
      url: "https://www.cimentoitambe.com.br/feed/",
      sourceHints: ["construcao civil", "obra", "cimento", "infraestrutura", "engenharia"],
    },
  ],
  logistica: [
    {
      type: "rss",
      label: "Abralog",
      url: "https://www.abralog.com.br/feed/",
      sourceHints: ["logistica", "supply chain", "armazenagem", "distribuicao", "operacao"],
    },
    {
      type: "rss",
      label: "Transporte Moderno",
      url: "https://transportemoderno.com.br/feed/",
      sourceHints: ["transporte", "frota", "cargas", "rodoviario", "operacao", "logistica"],
    },
    {
      type: "rss",
      label: "Agencia iNFRA",
      url: "https://agenciainfra.com/blog/feed/",
      sourceHints: ["porto", "ferrovia", "terminal", "cargas", "logistica", "transporte"],
    },
    {
      type: "rss",
      label: "Canal Rural",
      url: "https://www.canalrural.com.br/feed/",
      sourceHints: ["escoamento", "transporte", "armazenagem", "logistica", "exportacao"],
    },
  ],
  inovacao: [
    {
      type: "rss",
      label: "IT Forum",
      url: "https://itforum.com.br/feed/",
      sourceHints: ["ia aplicada", "automacao", "transformacao digital", "software empresarial", "industria"],
    },
    {
      type: "rss",
      label: "Olhar Digital",
      url: "https://olhardigital.com.br/feed/",
      sourceHints: ["ia aplicada", "automacao", "industria 4.0", "transformacao digital"],
    },
    {
      type: "rss",
      label: "TI Inside",
      url: "https://tiinside.com.br/feed/",
      sourceHints: ["transformacao digital empresarial", "automacao", "inovacao operacional", "tecnologia industrial"],
    },
    {
      type: "rss",
      label: "Canaltech Noticias",
      url: "https://feeds.feedburner.com/canaltechbr",
      sourceHints: ["ia aplicada", "automacao", "industria", "operacoes"],
    },
  ],
};

const CURATION_CONFIG = {
  maxPerCategory: 5,
  maxItemsPerSource: 12,
  minResumoLength: 50,
  maxResumoLength: 280,
  titleSimilarityThreshold: 0.9,
  sourceDiversityPenalty: 3,
  defaultSourceName: "Fonte Externa",
  institutionalSourceName: "Ledur",
  imageRequestTimeoutMs: 8000,
  minCategoryScore: {
    economia: 10,
    infraestrutura: 11,
    logistica: 11,
    inovacao: 13,
  },
  classification: {
    minimumLeadScore: 2,
  },
  scoring: {
    economia: {
      positive: [
        "economia", "mercado", "industria", "industrial", "investimento", "credito", "inflacao",
        "juros", "producao", "setor produtivo", "cadeia produtiva", "financiamento", "custo",
        "custos", "produtividade", "crescimento", "setor", "pib", "construcao", "construcao civil",
        "infraestrutura", "energia", "saneamento", "investimentos", "mercado livre",
      ],
      negative: [
        "futebol", "celebridade", "entretenimento", "novela", "bbb", "filme", "serie",
        "jogo", "partida", "campanha eleitoral", "reality show",
      ],
      requiredAny: ["economia", "mercado", "industria", "investimento", "credito", "inflacao", "custo", "pib", "financiamento"],
    },
    infraestrutura: {
      positive: [
        "infraestrutura", "obra", "obras", "engenharia", "construcao pesada", "rodovia", "ponte",
        "ferrovia", "porto", "aeroporto", "hidrovia", "saneamento", "energia", "transmissao",
        "subestacao", "concessao", "duplicacao", "pavimentacao", "mobilidade", "terminal", "metro",
        "metro", "viaduto", "barragem", "usina", "linha de transmissao", "cimento", "concreto",
      ],
      negative: [
        "smartphone", "gadget", "influencer", "streaming", "entretenimento", "games",
        "review", "celular", "rumor", "vazamento",
      ],
      requiredAny: ["infraestrutura", "obra", "obras", "rodovia", "ferrovia", "porto", "ponte", "saneamento", "energia", "concessao", "engenharia", "mobilidade"],
    },
    logistica: {
      positive: [
        "logistica", "transporte", "frete", "armazenagem", "armazenamento", "estoque", "carga",
        "cargas", "frota", "cadeia de suprimentos", "supply chain", "distribuicao", "centro de distribuicao",
        "porto", "ferrovia", "rodovia", "terminal", "expedicao", "operacao", "operacoes",
        "escoamento", "entrega", "last mile", "movimentacao", "teu", "container",
      ],
      negative: [
        "passageiro", "turismo", "show", "festival", "celebridade", "entretenimento",
        "corrida eleitoral", "showroom", "linha de passageiros",
      ],
      requiredAny: ["logistica", "transporte", "frete", "armazenagem", "carga", "cargas", "frota", "cadeia de suprimentos", "supply chain", "distribuicao", "terminal", "operacoes"],
    },
    inovacao: {
      positive: [
        "ia aplicada", "inteligencia artificial", "automacao", "industria 4.0", "bim", "digital twin",
        "robotica", "produtividade", "transformacao digital", "eficiencia operacional",
        "manutencao preditiva", "sensoriamento", "software empresarial", "erp", "digitalizacao",
        "engenharia digital", "inovacao operacional", "transformacao digital empresarial", "tecnologia industrial",
        "visao computacional", "machine learning", "analitica", "analytics", "plataforma corporativa",
      ],
      negative: [
        "smartphone", "celular", "iphone", "android", "review", "analise do produto", "hands-on",
        "gadget", "console", "game", "games", "filme", "serie", "streaming", "entretenimento",
        "rede social", "instagram", "tiktok", "whatsapp", "rumor", "vazamento", "camera",
        "eletronico de consumo", "cultura pop", "smartband", "wearable",
      ],
      requiredAny: [
        "ia aplicada", "inteligencia artificial", "automacao", "industria 4.0", "bim", "digital twin",
        "transformacao digital", "digitalizacao", "engenharia digital", "inovacao operacional", "tecnologia industrial",
      ],
      contextAny: [
        "industria", "industrial", "engenharia", "construcao", "construcao civil", "obra", "canteiro",
        "infraestrutura", "logistica", "transporte", "operacao", "operacoes", "supply chain",
        "fabrica", "manufatura", "empresarial", "empresa", "corporativo", "terminal",
      ],
    },
  },
};

module.exports = {
  NEWS_SOURCE_CONFIG,
  CURATION_CONFIG,
  EXTERNAL_CATEGORIES,
};
