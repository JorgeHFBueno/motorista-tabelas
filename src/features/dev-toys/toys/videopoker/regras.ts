// Video Poker (Jacks or Better), sem DOM: aposta, recebe 5 cartas, segura as que quiser e troca as outras uma vez.
// Paga pela TABELA, vezes a aposta (com a aposta dentro: "1" devolve a aposta). Um baralho novo a cada rodada.
//
// Retorno: a tabela 9/6 abaixo, com o royal pagando 250, devolve ~98% com a melhor estratégia (menos jogando "de
// ouvido"). Para ajustar a vantagem, mude os números da TABELA (decisão do responsável: ajustável, 2026-11-03).

import { embaralhar, novoBaralho, type Carta } from '../cartas/baralho';

export type Jogo = 'royal' | 'straight-flush' | 'quadra' | 'full-house' | 'flush' | 'sequencia' | 'trinca' | 'dois-pares' | 'par-alto';

export const TABELA: ReadonlyArray<{ jogo: Jogo; nome: string; paga: number }> = [
  { jogo: 'royal', nome: 'ROYAL FLUSH', paga: 250 },
  { jogo: 'straight-flush', nome: 'STRAIGHT FLUSH', paga: 50 },
  { jogo: 'quadra', nome: 'QUADRA', paga: 25 },
  { jogo: 'full-house', nome: 'FULL HOUSE', paga: 9 },
  { jogo: 'flush', nome: 'FLUSH', paga: 6 },
  { jogo: 'sequencia', nome: 'SEQUENCIA', paga: 4 },
  { jogo: 'trinca', nome: 'TRINCA', paga: 3 },
  { jogo: 'dois-pares', nome: 'DOIS PARES', paga: 2 },
  { jogo: 'par-alto', nome: 'PAR DE J OU MAIOR', paga: 1 },
];

export const pagaDe = (j: Jogo | null) => (j ? (TABELA.find((t) => t.jogo === j)?.paga ?? 0) : 0);

/** O melhor jogo de 5 cartas, ou null (nada que pague). Ás vale 1 e 14 na sequência. */
export function avaliar(mao: Carta[]): Jogo | null {
  if (mao.length !== 5) return null;
  const valores = mao.map((c) => c.valor).sort((a, b) => a - b);
  const contagem = new Map<number, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  const grupos = [...contagem.values()].sort((a, b) => b - a);
  const mesmoNaipe = mao.every((c) => c.naipe === mao[0].naipe);
  const distintos = contagem.size === 5;
  const asAlto = distintos && valores.join() === '1,10,11,12,13';
  const sequencia = distintos && (valores[4] - valores[0] === 4 || asAlto);

  if (sequencia && mesmoNaipe) return asAlto ? 'royal' : 'straight-flush';
  if (grupos[0] === 4) return 'quadra';
  if (grupos[0] === 3 && grupos[1] === 2) return 'full-house';
  if (mesmoNaipe) return 'flush';
  if (sequencia) return 'sequencia';
  if (grupos[0] === 3) return 'trinca';
  if (grupos[0] === 2 && grupos[1] === 2) return 'dois-pares';
  if (grupos[0] === 2) {
    const par = [...contagem].find(([, n]) => n === 2)![0];
    if (par === 1 || par >= 11) return 'par-alto';
  }
  return null;
}

export type Fase = 'apostando' | 'segurando' | 'fim';
export type Mesa = {
  baralho: Carta[];
  mao: Carta[];
  segura: boolean[];
  /** já descontada das fichas */
  aposta: number;
  fichas: number;
  fase: Fase;
  jogo: Jogo | null;
};

export const mesaNova = (fichas: number): Mesa => ({ baralho: [], mao: [], segura: [], aposta: 0, fichas, fase: 'apostando', jogo: null });

/** Desconta a aposta e dá 5 cartas de um baralho novo. */
export function distribuir(m: Mesa, aposta: number, rng: () => number): Mesa {
  if (m.fase === 'segurando' || aposta <= 0 || aposta > m.fichas) return m;
  const b = embaralhar(novoBaralho(), rng);
  return { baralho: b.slice(5), mao: b.slice(0, 5), segura: [false, false, false, false, false], aposta, fichas: m.fichas - aposta, fase: 'segurando', jogo: null };
}

export function segurar(m: Mesa, i: number): Mesa {
  if (m.fase !== 'segurando' || i < 0 || i > 4) return m;
  return { ...m, segura: m.segura.map((s, j) => (j === i ? !s : s)) };
}

/** Troca as cartas não seguradas, avalia e paga. */
export function trocar(m: Mesa): Mesa {
  if (m.fase !== 'segurando') return m;
  let k = 0;
  const mao = m.mao.map((c, i) => (m.segura[i] ? c : m.baralho[k++]));
  const jogo = avaliar(mao);
  return { ...m, mao, baralho: m.baralho.slice(k), fase: 'fim', jogo, fichas: m.fichas + m.aposta * pagaDe(jogo) };
}
