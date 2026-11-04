// External news of the client portal (portal-noticias, origem 'externa'): sources and curation settings.
// Ported from the old portal Functions (portal/functions/src/news/config.js). Contract: The Manuscript,
// 01_FIRESTORE/COLECOES/portal.md (portal-noticias).

export const CATEGORIAS_EXTERNAS = ['economia', 'infraestrutura', 'logistica', 'inovacao'] as const;
export type CategoriaExterna = (typeof CATEGORIAS_EXTERNAS)[number];

export type FonteRss = { rotulo: string; url: string; dicas: string[] };

export const COLECAO_NOTICIAS = 'portal-noticias';
export const USER_AGENT = 'ledur-news-ingest/1.0';

export const FONTES: Record<CategoriaExterna, FonteRss[]> = {
  economia: [
    { rotulo: 'Agencia Brasil Economia', url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', dicas: ['economia', 'industria', 'investimento', 'setor produtivo', 'infraestrutura'] },
    { rotulo: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/', dicas: ['mercado', 'credito', 'inflacao', 'investimento', 'industria'] },
    { rotulo: 'Money Times', url: 'https://www.moneytimes.com.br/feed/', dicas: ['mercado', 'setor produtivo', 'investimento', 'industria', 'custos'] },
    { rotulo: 'Forbes Money', url: 'https://forbes.com.br/forbes-money/feed/', dicas: ['mercado', 'investimento', 'financiamento', 'produtividade'] },
  ],
  infraestrutura: [
    { rotulo: 'Agencia iNFRA', url: 'https://agenciainfra.com/blog/feed/', dicas: ['infraestrutura', 'concessao', 'rodovia', 'ferrovia', 'porto', 'saneamento', 'energia'] },
    { rotulo: 'Mobilidade Estadao', url: 'https://mobilidade.estadao.com.br/feed/', dicas: ['mobilidade', 'transporte', 'metro', 'ferrovia', 'infraestrutura urbana'] },
    { rotulo: 'ABDIB', url: 'https://www.abdib.org.br/feed/', dicas: ['infraestrutura', 'construcao', 'obras', 'energia', 'saneamento', 'concessao'] },
    { rotulo: 'Cimento Itambe', url: 'https://www.cimentoitambe.com.br/feed/', dicas: ['construcao civil', 'obra', 'cimento', 'infraestrutura', 'engenharia'] },
  ],
  logistica: [
    { rotulo: 'Abralog', url: 'https://www.abralog.com.br/feed/', dicas: ['logistica', 'supply chain', 'armazenagem', 'distribuicao', 'operacao'] },
    { rotulo: 'Transporte Moderno', url: 'https://transportemoderno.com.br/feed/', dicas: ['transporte', 'frota', 'cargas', 'rodoviario', 'operacao', 'logistica'] },
    { rotulo: 'Agencia iNFRA', url: 'https://agenciainfra.com/blog/feed/', dicas: ['porto', 'ferrovia', 'terminal', 'cargas', 'logistica', 'transporte'] },
    { rotulo: 'Canal Rural', url: 'https://www.canalrural.com.br/feed/', dicas: ['escoamento', 'transporte', 'armazenagem', 'logistica', 'exportacao'] },
  ],
  inovacao: [
    { rotulo: 'IT Forum', url: 'https://itforum.com.br/feed/', dicas: ['ia aplicada', 'automacao', 'transformacao digital', 'software empresarial', 'industria'] },
    { rotulo: 'Olhar Digital', url: 'https://olhardigital.com.br/feed/', dicas: ['ia aplicada', 'automacao', 'industria 4.0', 'transformacao digital'] },
    { rotulo: 'TI Inside', url: 'https://tiinside.com.br/feed/', dicas: ['transformacao digital empresarial', 'automacao', 'inovacao operacional', 'tecnologia industrial'] },
    { rotulo: 'Canaltech Noticias', url: 'https://feeds.feedburner.com/canaltechbr', dicas: ['ia aplicada', 'automacao', 'industria', 'operacoes'] },
  ],
};

export type PontuacaoCategoria = { positivas: string[]; negativas: string[]; exigeAlguma: string[]; contexto?: string[] };

export const CURADORIA = {
  maxPorCategoria: 5,
  maxItensPorFonte: 12,
  minResumo: 50,
  maxResumo: 280,
  similaridadeTitulo: 0.9,
  penalidadeMesmaFonte: 3,
  fontePadrao: 'Fonte Externa',
  tempoLimiteMs: 8000,
  maxTags: 6,
  pontuacaoMinima: { economia: 10, infraestrutura: 11, logistica: 11, inovacao: 13 } as Record<CategoriaExterna, number>,
  vantagemMinima: 2,
  pontuacao: {
    economia: {
      positivas: [
        'economia', 'mercado', 'industria', 'industrial', 'investimento', 'credito', 'inflacao',
        'juros', 'producao', 'setor produtivo', 'cadeia produtiva', 'financiamento', 'custo',
        'custos', 'produtividade', 'crescimento', 'setor', 'pib', 'construcao', 'construcao civil',
        'infraestrutura', 'energia', 'saneamento', 'investimentos', 'mercado livre',
      ],
      negativas: [
        'futebol', 'celebridade', 'entretenimento', 'novela', 'bbb', 'filme', 'serie',
        'jogo', 'partida', 'campanha eleitoral', 'reality show',
      ],
      exigeAlguma: ['economia', 'mercado', 'industria', 'investimento', 'credito', 'inflacao', 'custo', 'pib', 'financiamento'],
    },
    infraestrutura: {
      positivas: [
        'infraestrutura', 'obra', 'obras', 'engenharia', 'construcao pesada', 'rodovia', 'ponte',
        'ferrovia', 'porto', 'aeroporto', 'hidrovia', 'saneamento', 'energia', 'transmissao',
        'subestacao', 'concessao', 'duplicacao', 'pavimentacao', 'mobilidade', 'terminal', 'metro',
        'metro', 'viaduto', 'barragem', 'usina', 'linha de transmissao', 'cimento', 'concreto',
      ],
      negativas: [
        'smartphone', 'gadget', 'influencer', 'streaming', 'entretenimento', 'games',
        'review', 'celular', 'rumor', 'vazamento',
      ],
      exigeAlguma: ['infraestrutura', 'obra', 'obras', 'rodovia', 'ferrovia', 'porto', 'ponte', 'saneamento', 'energia', 'concessao', 'engenharia', 'mobilidade'],
    },
    logistica: {
      positivas: [
        'logistica', 'transporte', 'frete', 'armazenagem', 'armazenamento', 'estoque', 'carga',
        'cargas', 'frota', 'cadeia de suprimentos', 'supply chain', 'distribuicao', 'centro de distribuicao',
        'porto', 'ferrovia', 'rodovia', 'terminal', 'expedicao', 'operacao', 'operacoes',
        'escoamento', 'entrega', 'last mile', 'movimentacao', 'teu', 'container',
      ],
      negativas: [
        'passageiro', 'turismo', 'show', 'festival', 'celebridade', 'entretenimento',
        'corrida eleitoral', 'showroom', 'linha de passageiros',
      ],
      exigeAlguma: ['logistica', 'transporte', 'frete', 'armazenagem', 'carga', 'cargas', 'frota', 'cadeia de suprimentos', 'supply chain', 'distribuicao', 'terminal', 'operacoes'],
    },
    inovacao: {
      positivas: [
        'ia aplicada', 'inteligencia artificial', 'automacao', 'industria 4.0', 'bim', 'digital twin',
        'robotica', 'produtividade', 'transformacao digital', 'eficiencia operacional',
        'manutencao preditiva', 'sensoriamento', 'software empresarial', 'erp', 'digitalizacao',
        'engenharia digital', 'inovacao operacional', 'transformacao digital empresarial', 'tecnologia industrial',
        'visao computacional', 'machine learning', 'analitica', 'analytics', 'plataforma corporativa',
      ],
      negativas: [
        'smartphone', 'celular', 'iphone', 'android', 'review', 'analise do produto', 'hands-on',
        'gadget', 'console', 'game', 'games', 'filme', 'serie', 'streaming', 'entretenimento',
        'rede social', 'instagram', 'tiktok', 'whatsapp', 'rumor', 'vazamento', 'camera',
        'eletronico de consumo', 'cultura pop', 'smartband', 'wearable',
      ],
      exigeAlguma: [
        'ia aplicada', 'inteligencia artificial', 'automacao', 'industria 4.0', 'bim', 'digital twin',
        'transformacao digital', 'digitalizacao', 'engenharia digital', 'inovacao operacional', 'tecnologia industrial',
      ],
      contexto: [
        'industria', 'industrial', 'engenharia', 'construcao', 'construcao civil', 'obra', 'canteiro',
        'infraestrutura', 'logistica', 'transporte', 'operacao', 'operacoes', 'supply chain',
        'fabrica', 'manufatura', 'empresarial', 'empresa', 'corporativo', 'terminal',
      ],
    },
  } as Record<CategoriaExterna, PontuacaoCategoria>,
};
