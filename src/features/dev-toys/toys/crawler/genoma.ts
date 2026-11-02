import { PADRAO, type ParamsCrawler } from './sim';

// Genoma de um Crawler: sorteado ao chocar o ovo. O plano corporal (centopeia, aranha, polvo, caranguejo) decide a
// forma geral e as faixas dos outros genes; o estágio (Larva → Anciã) decide o quanto disso já aparece.

export const PLANOS = ['centopeia', 'aranha', 'polvo', 'caranguejo'] as const;
export const FORMAS = ['circulo', 'losango', 'quadrado', 'anel', 'caixa'] as const;
export const CABECAS = ['mandibulas', 'antenas', 'olhos', 'chifres'] as const;
export const CAUDAS = ['nenhuma', 'ferrao', 'leque', 'espinhos'] as const;
export const ENFEITES = ['nenhum', 'listras', 'pontos', 'espinhos'] as const;
export const PREENCHIMENTOS = ['vazio', 'cheio', 'hachura', 'duplo'] as const;
export const DETALHES = ['liso', 'janelas', 'paineis'] as const;
export const JUNTAS = ['linha', 'caixas', 'contas'] as const;
export const PES = ['ponto', 'circulo', 'quadrado'] as const;

export type Plano = (typeof PLANOS)[number];
export type Forma = (typeof FORMAS)[number];
export type Cabeca = (typeof CABECAS)[number];
export type Cauda = (typeof CAUDAS)[number];
export type Enfeite = (typeof ENFEITES)[number];
export type Preenchimento = (typeof PREENCHIMENTOS)[number];
export type Detalhe = (typeof DETALHES)[number];
export type Junta = (typeof JUNTAS)[number];
export type Pe = (typeof PES)[number];

export type Genoma = {
  plano: Plano;
  forma: Forma;
  cabeca: Cabeca;
  cauda: Cauda;
  enfeite: Enfeite;
  /** como o corpo é pintado: vazado, cheio, hachurado ou com contorno duplo */
  preenchimento: Preenchimento;
  /** desenho dentro dos segmentos */
  detalhe: Detalhe;
  /** como as juntas das pernas aparecem */
  junta: Junta;
  pe: Pe;
  /** centopeia: segmentos quando Anciã (a Larva nasce com 3 a menos); outros planos: fixo */
  segmentos: number;
  /** distância entre segmentos, px */
  dist: number;
  /** tamanho dos segmentos (1 = centopeia normal) */
  espessura: number;
  /** centopeia: um par de pernas a cada 1 ou 2 segmentos */
  pernasACada: 1 | 2;
  /** outros planos: pares de pernas em leque quando Anciã */
  pares: number;
  /** leque: ângulo (rad) da perna mais da frente */
  abertura: number;
  /** ossos por perna (2 = coxa e canela; mais = perna de muitas juntas ou tentáculo) */
  ossos: number;
  /** tamanho das pernas (1 = centopeia normal) */
  perna: number;
  /** passo mais longo e mais lento (> 1) ou curto e rápido (< 1) */
  passada: number;
  /** velocidade e giro (1 = normal) */
  velocidade: number;
  /** o quanto vaga sem rumo (1 = normal) */
  vagueia: number;
  /** alcance do raio quando Anciã: da boca até a borda da palavra, px */
  alcance: number;
  /** letras escaneadas por segundo quando Anciã */
  varredura: number;
};

type Rng = () => number;
const GENES = [
  'plano', 'forma', 'cabeca', 'cauda', 'enfeite', 'preenchimento', 'detalhe', 'junta', 'pe', 'segmentos', 'dist', 'espessura', 'pernasACada',
  'pares', 'abertura', 'ossos', 'perna', 'passada', 'velocidade', 'vagueia', 'alcance', 'varredura',
] as const;
type Gene = (typeof GENES)[number];
/** O plano não muta: mudar de plano seria virar outro bicho. */
const MUTAVEIS = GENES.filter((g) => g !== 'plano');

const entre = (rng: Rng, min: number, max: number, casas = 2) => Math.round((min + rng() * (max - min)) * 10 ** casas) / 10 ** casas;
const inteiro = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const um = <T,>(rng: Rng, lista: readonly T[]) => lista[Math.floor(rng() * lista.length)];
const por = <T,>(p: Plano, faixas: Record<Plano, T>) => faixas[p];

const SORTEIO: { [G in Gene]: (rng: Rng, p: Plano) => Genoma[G] } = {
  plano: (r) => um(r, PLANOS),
  forma: (r, p) => um(r, por<readonly Forma[]>(p, {
    centopeia: FORMAS, aranha: ['circulo', 'losango', 'anel', 'caixa'], polvo: ['circulo', 'anel', 'losango'], caranguejo: ['caixa', 'quadrado'],
  })),
  cabeca: (r) => um(r, CABECAS),
  cauda: (r, p) => um(r, por<readonly Cauda[]>(p, {
    centopeia: CAUDAS, aranha: ['nenhuma', 'ferrao', 'espinhos'], polvo: ['nenhuma'], caranguejo: ['nenhuma', 'leque'],
  })),
  enfeite: (r) => um(r, ENFEITES),
  preenchimento: (r) => um(r, PREENCHIMENTOS),
  detalhe: (r) => um(r, DETALHES),
  junta: (r, p) => um(r, por<readonly Junta[]>(p, { centopeia: ['linha', 'contas'], aranha: JUNTAS, polvo: ['caixas', 'contas'], caranguejo: ['linha', 'contas'] })),
  pe: (r) => um(r, PES),
  segmentos: (r, p) => por(p, { centopeia: inteiro(r, 6, 11), aranha: 2, polvo: 1, caranguejo: 2 }),
  dist: (r, p) => por(p, { centopeia: entre(r, 8, 13, 1), aranha: entre(r, 15, 20, 1), polvo: 10, caranguejo: entre(r, 13, 17, 1) }),
  espessura: (r, p) => por(p, { centopeia: entre(r, 0.7, 1.4), aranha: entre(r, 1.3, 1.9), polvo: entre(r, 1.8, 2.4), caranguejo: entre(r, 1.6, 2.2) }),
  pernasACada: (r) => (r() < 0.35 ? 1 : 2),
  pares: (r, p) => por(p, { centopeia: 0, aranha: inteiro(r, 3, 4), polvo: inteiro(r, 3, 4), caranguejo: inteiro(r, 3, 4) }),
  abertura: (r, p) => por(p, { centopeia: 0, aranha: entre(r, 0.9, 1.2), polvo: entre(r, 0.9, 1.25), caranguejo: entre(r, 0.45, 0.8) }),
  ossos: (r, p) => por(p, { centopeia: r() < 0.25 ? 3 : 2, aranha: inteiro(r, 3, 4), polvo: inteiro(r, 6, 9), caranguejo: inteiro(r, 2, 3) }),
  perna: (r, p) => por(p, { centopeia: entre(r, 0.75, 1.3), aranha: entre(r, 1.5, 2.1), polvo: entre(r, 1.5, 2.1), caranguejo: entre(r, 1, 1.4) }),
  passada: (r) => entre(r, 0.8, 1.3),
  velocidade: (r) => entre(r, 0.7, 1.3),
  vagueia: (r) => entre(r, 0.5, 1.6),
  alcance: (r) => Math.round(entre(r, 12, 28, 0)),
  varredura: (r) => entre(r, 6, 14, 1),
};

export function sortearGenoma(rng: Rng): Genoma {
  const plano = SORTEIO.plano(rng, 'centopeia');
  const g = { plano } as Genoma;
  for (const gene of MUTAVEIS) (g as Record<string, unknown>)[gene] = SORTEIO[gene](rng, plano);
  return g;
}

/** Mutação: um gene (nunca o plano) sorteado de novo dentro das faixas do plano; diferente, quando dá. */
export function mutar(g: Genoma, rng: Rng): { genoma: Genoma; gene: Gene } {
  const gene = um(rng, MUTAVEIS);
  let valor = SORTEIO[gene](rng, g.plano);
  for (let i = 0; i < 8 && valor === g[gene]; i++) valor = SORTEIO[gene](rng, g.plano);
  return { genoma: { ...g, [gene]: valor }, gene };
}

export const ESTAGIOS = ['ovo', 'larva', 'jovem', 'adulta', 'ancia'] as const;
export type Estagio = (typeof ESTAGIOS)[number];
export const NOME_ESTAGIO: Record<Estagio, string> = { ovo: 'OVO', larva: 'LARVA', jovem: 'JOVEM', adulta: 'ADULTA', ancia: 'ANCIA' };
export const NOME_PLANO: Record<Plano, string> = { centopeia: 'CENTOPEIA', aranha: 'ARANHA', polvo: 'POLVO', caranguejo: 'CARANGUEJO' };

/** Experiência mínima de cada estágio depois de chocar. */
export const XP_ESTAGIO = { larva: 0, jovem: 150, adulta: 400, ancia: 900 } as const;

export function estagioDe(xp: number, nasceu: boolean): Estagio {
  if (!nasceu) return 'ovo';
  if (xp >= XP_ESTAGIO.ancia) return 'ancia';
  if (xp >= XP_ESTAGIO.adulta) return 'adulta';
  if (xp >= XP_ESTAGIO.jovem) return 'jovem';
  return 'larva';
}

/** Experiência que falta para o próximo estágio (null na Anciã). */
export function proximoEstagio(xp: number): { estagio: Estagio; xp: number } | null {
  if (xp < XP_ESTAGIO.jovem) return { estagio: 'jovem', xp: XP_ESTAGIO.jovem };
  if (xp < XP_ESTAGIO.adulta) return { estagio: 'adulta', xp: XP_ESTAGIO.adulta };
  if (xp < XP_ESTAGIO.ancia) return { estagio: 'ancia', xp: XP_ESTAGIO.ancia };
  return null;
}

const nivel = (e: Estagio) => Math.max(0, ESTAGIOS.indexOf(e) - 1); // larva 0 … ancia 3
const crescimento = (n: number) => 0.75 + 0.083 * n; // Larva 75% … Anciã 100%

/** Raio de cada segmento (px), pelo plano: centopeia afina até a cauda; aranha tem abdômen maior; caranguejo, carapaça. */
export function raiosDe(plano: Plano, espessura: number, segmentos: number): number[] {
  return Array.from({ length: segmentos }, (_, i) => {
    if (plano === 'aranha') return (i === 0 ? 5 : 6.5) * espessura;
    if (plano === 'caranguejo') return (i === 0 ? 5.5 : 3.5) * espessura;
    if (plano === 'polvo') return 5 * espessura;
    return Math.max(2, (5 - (i / segmentos) * 3) * espessura);
  });
}

/** Corpo para a física: cresce com o estágio. */
export function paramsDe(g: Genoma, e: Estagio): ParamsCrawler {
  const n = nivel(e);
  const k = crescimento(n);
  const centopeia = g.plano === 'centopeia';
  const comprimento = 32 * g.perna * k; // coxa + canela
  return {
    ...PADRAO,
    segmentos: centopeia ? Math.max(3, g.segmentos - 3 + n) : g.segmentos,
    dist: g.dist * (centopeia ? 1 : k),
    coxa: (comprimento * 14) / 32,
    canela: (comprimento * 18) / 32,
    limitePasso: comprimento * 0.5 * g.passada,
    duracaoPasso: PADRAO.duracaoPasso * g.passada * Math.sqrt(Math.max(1, g.perna)),
    velMax: PADRAO.velMax * g.velocidade * (0.8 + 0.066 * n),
    giroMax: PADRAO.giroMax * g.velocidade,
    pernasACada: g.pernasACada,
    vagueia: g.vagueia,
    pares: centopeia ? 0 : Math.max(2, Math.min(g.pares, g.pares - 3 + n)),
    abertura: g.abertura,
    ossos: g.ossos,
    quadril: centopeia ? 3 : raiosDe(g.plano, g.espessura * k, 1)[0] * 0.8,
  };
}

export type Visual = {
  plano: Plano;
  forma: Forma;
  espessura: number;
  preenchimento: Preenchimento;
  detalhe: Detalhe;
  junta: Junta;
  pe: Pe;
  /** null: a Larva ainda não tem */
  cabeca: Cabeca | null;
  /** aparece na Adulta */
  cauda: Cauda | null;
  /** aparece na Anciã */
  enfeite: Enfeite | null;
  alcance: number;
  varredura: number;
};

/** O que se vê e o raio: a cabeça aparece na Jovem, a cauda na Adulta, os enfeites na Anciã. */
export function visualDe(g: Genoma, e: Estagio): Visual {
  const n = nivel(e);
  return {
    plano: g.plano,
    forma: g.forma,
    espessura: g.espessura * crescimento(n),
    preenchimento: g.preenchimento,
    detalhe: g.detalhe,
    junta: g.junta,
    pe: g.pe,
    cabeca: n >= 1 ? g.cabeca : null,
    cauda: n >= 2 && g.cauda !== 'nenhuma' ? g.cauda : null,
    enfeite: n >= 3 && g.enfeite !== 'nenhum' ? g.enfeite : null,
    alcance: Math.round(g.alcance * crescimento(n)),
    varredura: g.varredura * (0.7 + 0.1 * n),
  };
}

/**
 * Genoma válido a partir do que estava salvo. Sem plano (criaturas de antes dos planos): centopeia. Gene faltando,
 * estragado ou fora das faixas atuais (o alcance antigo ia até 110 px) é sorteado de novo.
 */
export function normalizarGenoma(valor: unknown, rng: Rng): Genoma {
  const v = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  const plano: Plano = PLANOS.includes(v.plano as Plano) ? (v.plano as Plano) : 'centopeia';
  const g = { plano } as Genoma;
  const listas: Partial<Record<Gene, readonly string[]>> = {
    forma: FORMAS, cabeca: CABECAS, cauda: CAUDAS, enfeite: ENFEITES, preenchimento: PREENCHIMENTOS, detalhe: DETALHES, junta: JUNTAS, pe: PES,
  };
  for (const gene of MUTAVEIS) {
    const salvo = v[gene];
    const lista = listas[gene];
    const ok = lista ? typeof salvo === 'string' && lista.includes(salvo)
      : gene === 'pernasACada' ? salvo === 1 || salvo === 2
        : typeof salvo === 'number' && Number.isFinite(salvo) && (gene !== 'alcance' || salvo <= 28);
    (g as Record<string, unknown>)[gene] = ok ? salvo : SORTEIO[gene](rng, plano);
  }
  return g;
}
