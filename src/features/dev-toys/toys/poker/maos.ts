// Mãos de poker, sem DOM: a força da melhor mão de 5 entre as cartas dadas (até 7), com desempate por kicker, e o
// nome dela. Ás alto ou baixo na sequência (A-2-3-4-5 é a menor).

import type { Carta } from '../cartas/baralho';

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

/** A melhor mão de 5 entre as cartas dadas (5 a 7): testa cada combinação de 5. */
export function melhorMao(cartas: Carta[]): Forca {
  if (cartas.length <= 5) return forcaDe5(cartas);
  let melhor: Forca | null = null;
  const escolha: Carta[] = [];
  const andar = (de: number) => {
    if (escolha.length === 5) {
      const f = forcaDe5(escolha);
      if (!melhor || comparar(f, melhor) > 0) melhor = f;
      return;
    }
    for (let i = de; i <= cartas.length - (5 - escolha.length); i++) {
      escolha.push(cartas[i]);
      andar(i + 1);
      escolha.pop();
    }
  };
  andar(0);
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
