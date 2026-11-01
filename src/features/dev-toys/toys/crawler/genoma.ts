import { PADRAO, type ParamsCrawler } from './sim';

// Genoma de um Crawler: sorteado ao chocar o ovo, define o corpo, as pernas, a cabeça, a cauda, os enfeites,
// o raio de varredura e o temperamento. O estágio (Larva → Anciã) decide o quanto disso já aparece.

export const FORMAS = ['circulo', 'losango', 'quadrado', 'anel'] as const;
export const CABECAS = ['mandibulas', 'antenas', 'olhos', 'chifres'] as const;
export const CAUDAS = ['nenhuma', 'ferrao', 'leque', 'espinhos'] as const;
export const ENFEITES = ['nenhum', 'listras', 'pontos', 'espinhos'] as const;

export type Forma = (typeof FORMAS)[number];
export type Cabeca = (typeof CABECAS)[number];
export type Cauda = (typeof CAUDAS)[number];
export type Enfeite = (typeof ENFEITES)[number];

export type Genoma = {
  forma: Forma;
  cabeca: Cabeca;
  cauda: Cauda;
  enfeite: Enfeite;
  /** segmentos quando Anciã (a Larva nasce com 3 a menos) */
  segmentos: number;
  /** distância entre segmentos, px */
  dist: number;
  /** espessura dos segmentos (1 = normal) */
  espessura: number;
  /** um par de pernas a cada 1 ou 2 segmentos */
  pernasACada: 1 | 2;
  /** tamanho das pernas (1 = normal) */
  perna: number;
  /** passo mais longo e mais lento (> 1) ou curto e rápido (< 1) */
  passada: number;
  /** velocidade e giro (1 = normal) */
  velocidade: number;
  /** o quanto vaga sem rumo (1 = normal) */
  vagueia: number;
  /** alcance do raio quando Anciã, px */
  alcance: number;
  /** letras escaneadas por segundo quando Anciã */
  varredura: number;
};

const GENES = ['forma', 'cabeca', 'cauda', 'enfeite', 'segmentos', 'dist', 'espessura', 'pernasACada', 'perna', 'passada', 'velocidade', 'vagueia', 'alcance', 'varredura'] as const;
type Gene = (typeof GENES)[number];

const entre = (rng: () => number, min: number, max: number, casas = 2) => Math.round((min + rng() * (max - min)) * 10 ** casas) / 10 ** casas;
const um = <T,>(rng: () => number, lista: readonly T[]) => lista[Math.floor(rng() * lista.length)];

const SORTEIO: { [G in Gene]: (rng: () => number) => Genoma[G] } = {
  forma: (r) => um(r, FORMAS),
  cabeca: (r) => um(r, CABECAS),
  cauda: (r) => um(r, CAUDAS),
  enfeite: (r) => um(r, ENFEITES),
  segmentos: (r) => 6 + Math.floor(r() * 6),
  dist: (r) => entre(r, 8, 13, 1),
  espessura: (r) => entre(r, 0.7, 1.4),
  pernasACada: (r) => (r() < 0.35 ? 1 : 2),
  perna: (r) => entre(r, 0.75, 1.3),
  passada: (r) => entre(r, 0.8, 1.3),
  velocidade: (r) => entre(r, 0.7, 1.3),
  vagueia: (r) => entre(r, 0.5, 1.6),
  alcance: (r) => Math.round(entre(r, 60, 110, 0)),
  varredura: (r) => entre(r, 6, 14, 1),
};

export function sortearGenoma(rng: () => number): Genoma {
  return Object.fromEntries(GENES.map((g) => [g, SORTEIO[g](rng)])) as Genoma;
}

/** Mutação: um gene sorteado de novo (garantidamente diferente, quando dá). */
export function mutar(g: Genoma, rng: () => number): { genoma: Genoma; gene: Gene } {
  const gene = um(rng, GENES);
  let valor = SORTEIO[gene](rng);
  for (let i = 0; i < 8 && valor === g[gene]; i++) valor = SORTEIO[gene](rng);
  return { genoma: { ...g, [gene]: valor }, gene };
}

export const ESTAGIOS = ['ovo', 'larva', 'jovem', 'adulta', 'ancia'] as const;
export type Estagio = (typeof ESTAGIOS)[number];
export const NOME_ESTAGIO: Record<Estagio, string> = { ovo: 'OVO', larva: 'LARVA', jovem: 'JOVEM', adulta: 'ADULTA', ancia: 'ANCIA' };

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

/** Corpo para a física: cresce com o estágio. */
export function paramsDe(g: Genoma, e: Estagio): ParamsCrawler {
  const n = nivel(e);
  const pernas = g.perna * (0.75 + 0.083 * n);
  return {
    ...PADRAO,
    segmentos: Math.max(3, g.segmentos - 3 + n),
    dist: g.dist,
    coxa: PADRAO.coxa * pernas,
    canela: PADRAO.canela * pernas,
    limitePasso: PADRAO.limitePasso * g.passada,
    duracaoPasso: PADRAO.duracaoPasso * g.passada,
    velMax: PADRAO.velMax * g.velocidade * (0.8 + 0.066 * n),
    giroMax: PADRAO.giroMax * g.velocidade,
    pernasACada: g.pernasACada,
    vagueia: g.vagueia,
  };
}

export type Visual = {
  forma: Forma;
  espessura: number;
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
    forma: g.forma,
    espessura: g.espessura * (0.8 + 0.066 * n),
    cabeca: n >= 1 ? g.cabeca : null,
    cauda: n >= 2 && g.cauda !== 'nenhuma' ? g.cauda : null,
    enfeite: n >= 3 && g.enfeite !== 'nenhum' ? g.enfeite : null,
    alcance: Math.round(g.alcance * (0.7 + 0.1 * n)),
    varredura: g.varredura * (0.7 + 0.1 * n),
  };
}

/** Genoma válido a partir do que estava salvo; gene faltando ou estragado é sorteado de novo. */
export function normalizarGenoma(valor: unknown, rng: () => number): Genoma {
  const v = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  const g = sortearGenoma(rng);
  const lista = (gene: 'forma' | 'cabeca' | 'cauda' | 'enfeite', opcoes: readonly string[]) => {
    if (typeof v[gene] === 'string' && opcoes.includes(v[gene] as string)) (g as Record<string, unknown>)[gene] = v[gene];
  };
  lista('forma', FORMAS);
  lista('cabeca', CABECAS);
  lista('cauda', CAUDAS);
  lista('enfeite', ENFEITES);
  for (const gene of ['segmentos', 'dist', 'espessura', 'perna', 'passada', 'velocidade', 'vagueia', 'alcance', 'varredura'] as const) {
    if (typeof v[gene] === 'number' && Number.isFinite(v[gene])) g[gene] = v[gene] as number;
  }
  if (v.pernasACada === 1 || v.pernasACada === 2) g.pernasACada = v.pernasACada;
  return g;
}
