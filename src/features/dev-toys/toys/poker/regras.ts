// Poker (Texas Hold'em) contra a casa, sem DOM e sem blefe (decisões do responsável, 2026-11-03).
//
// Aposta inicial; você e a casa recebem 2 cartas (a casa mostra uma, como no 21) e a mesa, 5 viradas. Abre o flop
// (3 da mesa) e você decide uma vez: apostar (mais uma aposta igual à inicial), passar ou desistir. A casa só reage:
// se você apostar, ela cobre ou desiste, olhando apenas as próprias 2 cartas (`casaSegue`). Depois abrem o turn e o
// river, e a melhor mão de 5 entre as 7 cartas de cada um ganha. Um baralho novo a cada mão.
//
// Pagamento (com o que você pôs dentro): ganhou, o dobro do que pôs; empate, o que pôs; a casa desistiu, o dobro da
// aposta inicial mais a aposta que ela não cobriu; perdeu ou desistiu, nada. Para ajustar a vantagem, mude
// `casaSegue` (decisão do responsável: ajustável).

import { embaralhar, novoBaralho, type Carta } from '../cartas/baralho';

// ---- mãos ---------------------------------------------------------------------------------------------------------

export const NOMES_MAO = ['CARTA ALTA', 'PAR', 'DOIS PARES', 'TRINCA', 'SEQUENCIA', 'FLUSH', 'FULL HOUSE', 'QUADRA', 'STRAIGHT FLUSH'] as const;

/** Força de uma mão: [categoria (0 carta alta … 8 straight flush), desempates]. Maior na ordem do array, ganha. */
export type Forca = number[];

const alto = (v: number) => (v === 1 ? 14 : v); // ás vale 14 (e 1 na sequência A-2-3-4-5)

function forcaDe5(m: Carta[]): Forca {
  const valores = m.map((c) => alto(c.valor)).sort((a, b) => b - a);
  const contagem = new Map<number, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  // grupos: mais cartas primeiro, depois o valor maior
  const grupos = [...contagem].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const ordem = grupos.map(([v]) => v);
  const flush = m.every((c) => c.naipe === m[0].naipe);
  const distintos = contagem.size === 5;
  const roda = distintos && valores.join() === '14,5,4,3,2';
  const sequencia = distintos && (valores[0] - valores[4] === 4 || roda);
  const topoSeq = roda ? 5 : valores[0];

  if (sequencia && flush) return [8, topoSeq];
  if (grupos[0][1] === 4) return [7, ...ordem];
  if (grupos[0][1] === 3 && grupos[1][1] === 2) return [6, ...ordem];
  if (flush) return [5, ...valores];
  if (sequencia) return [4, topoSeq];
  if (grupos[0][1] === 3) return [3, ...ordem];
  if (grupos[0][1] === 2 && grupos[1][1] === 2) return [2, ...ordem];
  if (grupos[0][1] === 2) return [1, ...ordem];
  return [0, ...valores];
}

export function comparar(a: Forca, b: Forca): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** A melhor mão de 5 entre as cartas dadas (5 a 7). */
export function melhorMao(cartas: Carta[]): Forca {
  if (cartas.length <= 5) return forcaDe5(cartas);
  let melhor: Forca | null = null;
  const n = cartas.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const cinco = cartas.filter((_, i) => i !== a && i !== b);
    if (cinco.length !== 5) continue;
    const f = forcaDe5(cinco);
    if (!melhor || comparar(f, melhor) > 0) melhor = f;
  }
  return melhor ?? forcaDe5(cartas.slice(0, 5));
}

/** Nome da mão (com o royal à parte), para mostrar; com menos de 5 cartas, só par/dois pares/trinca/quadra. */
export function nomeDaMao(cartas: Carta[]): string {
  if (cartas.length < 5) {
    const contagem = new Map<number, number>();
    for (const c of cartas) contagem.set(c.valor, (contagem.get(c.valor) ?? 0) + 1);
    const g = [...contagem.values()].sort((a, b) => b - a);
    if (g[0] === 4) return 'QUADRA';
    if (g[0] === 3) return 'TRINCA';
    if (g[0] === 2) return g[1] === 2 ? 'DOIS PARES' : 'PAR';
    return 'CARTA ALTA';
  }
  const f = melhorMao(cartas);
  return f[0] === 8 && f[1] === 14 ? 'ROYAL FLUSH' : NOMES_MAO[f[0]];
}

/** Sem blefe: a casa cobre a sua aposta com par, ás ou rei, ou duas cartas de 10 para cima. */
export function casaSegue(casa: Carta[]): boolean {
  const [a, b] = casa.map((c) => alto(c.valor));
  return a === b || a >= 13 || b >= 13 || (a >= 10 && b >= 10);
}

// ---- mesa ---------------------------------------------------------------------------------------------------------

export type Fase = 'apostando' | 'decidindo' | 'fim';
export type Resultado = 'ganhou' | 'perdeu' | 'empate' | 'casa-desistiu' | 'desistiu';
export type Mesa = {
  baralho: Carta[];
  jogador: Carta[];
  casa: Carta[];
  /** as 5 da mesa; o flop são as 3 primeiras */
  mesa: Carta[];
  /** aposta inicial, já descontada das fichas */
  aposta: number;
  /** a aposta depois do flop (0 se passou), já descontada */
  extra: number;
  fichas: number;
  fase: Fase;
  resultado: Resultado | null;
};

export const mesaNova = (fichas: number): Mesa => ({ baralho: [], jogador: [], casa: [], mesa: [], aposta: 0, extra: 0, fichas, fase: 'apostando', resultado: null });

/** Quanto volta para as fichas no fim (o que você pôs já saiu delas). */
export function retorno(r: Resultado, aposta: number, extra: number): number {
  if (r === 'ganhou') return 2 * (aposta + extra);
  if (r === 'empate') return aposta + extra;
  if (r === 'casa-desistiu') return 2 * aposta + extra;
  return 0;
}

function fim(m: Mesa, resultado: Resultado): Mesa {
  return { ...m, fase: 'fim', resultado, fichas: m.fichas + retorno(resultado, m.aposta, m.extra) };
}

/** Desconta a aposta inicial e dá as cartas: 2 para você, 2 para a casa, 5 para a mesa. */
export function distribuir(m: Mesa, aposta: number, rng: () => number): Mesa {
  if (m.fase === 'decidindo' || aposta <= 0 || aposta > m.fichas) return m;
  const b = embaralhar(novoBaralho(), rng);
  return {
    baralho: b.slice(9), jogador: [b[0], b[2]], casa: [b[1], b[3]], mesa: b.slice(4, 9),
    aposta, extra: 0, fichas: m.fichas - aposta, fase: 'decidindo', resultado: null,
  };
}

/** Compara as 7 cartas de cada um. */
function mostrar(m: Mesa): Mesa {
  const d = comparar(melhorMao([...m.jogador, ...m.mesa]), melhorMao([...m.casa, ...m.mesa]));
  return fim(m, d > 0 ? 'ganhou' : d < 0 ? 'perdeu' : 'empate');
}

export const podeApostar = (m: Mesa) => m.fase === 'decidindo' && m.fichas >= m.aposta;

/** Mais uma aposta igual à inicial; a casa cobre (e vai ao fim) ou desiste. */
export function apostar(m: Mesa): Mesa {
  if (!podeApostar(m)) return m;
  const com = { ...m, extra: m.aposta, fichas: m.fichas - m.aposta };
  return casaSegue(m.casa) ? mostrar(com) : fim(com, 'casa-desistiu');
}

/** Sem aposta: abre o resto da mesa e compara. */
export const passar = (m: Mesa): Mesa => (m.fase === 'decidindo' ? mostrar(m) : m);

export const desistir = (m: Mesa): Mesa => (m.fase === 'decidindo' ? fim(m, 'desistiu') : m);
