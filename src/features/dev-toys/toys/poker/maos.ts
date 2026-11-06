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
  return melhorDe(cartas).forca;
}

/** As 5 cartas na ordem em que se lê a mão: os grupos maiores primeiro (a trinca, depois o par), depois o valor. */
function ordenar(m: Carta[], f: Forca): Carta[] {
  const roda = (f[0] === 4 || f[0] === 8) && f[1] === 5; // A-2-3-4-5: o ás é a menor
  const valor = (c: Carta) => (roda && c.valor === 1 ? 1 : alto(c.valor));
  const vezes = (c: Carta) => m.filter((x) => x.valor === c.valor).length;
  return m.slice().sort((a, b) => vezes(b) - vezes(a) || valor(b) - valor(a));
}

/** A melhor mão e as 5 cartas que a formam, na ordem em que se lê. */
export function melhorCombinacao(cartas: Carta[]): { forca: Forca; cartas: Carta[] } {
  const r = melhorDe(cartas);
  return { forca: r.forca, cartas: ordenar(r.cartas, r.forca) };
}

function melhorDe(cartas: Carta[]): { forca: Forca; cartas: Carta[] } {
  if (cartas.length <= 5) return { forca: forcaDe5(cartas), cartas: cartas.slice() };
  let melhor: { forca: Forca; cartas: Carta[] } | null = null;
  const escolha: Carta[] = [];
  const andar = (de: number) => {
    if (escolha.length === 5) {
      const f = forcaDe5(escolha);
      if (!melhor || comparar(f, melhor.forca) > 0) melhor = { forca: f, cartas: escolha.slice() };
      return;
    }
    for (let i = de; i <= cartas.length - (5 - escolha.length); i++) {
      escolha.push(cartas[i]);
      andar(i + 1);
      escolha.pop();
    }
  };
  andar(0);
  return melhor ?? { forca: forcaDe5(cartas.slice(0, 5)), cartas: cartas.slice(0, 5) };
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

// valor alto (2 a 14) por extenso, sem acento
const UM: Record<number, string> = { 14: 'AS', 13: 'REI', 12: 'DAMA', 11: 'VALETE', 10: 'DEZ', 9: 'NOVE', 8: 'OITO', 7: 'SETE', 6: 'SEIS', 5: 'CINCO', 4: 'QUATRO', 3: 'TRES', 2: 'DOIS' };
const VARIOS: Record<number, string> = { 14: 'ASES', 13: 'REIS', 12: 'DAMAS', 11: 'VALETES', 10: 'DEZ', 9: 'NOVES', 8: 'OITOS', 7: 'SETES', 6: 'SEIS', 5: 'CINCOS', 4: 'QUATROS', 3: 'TRES', 2: 'DOIS' };
export const valorPorExtenso = (v: number) => UM[v] ?? String(v);

/**
 * As cartas que fazem a mão, entre as 5: o par, os dois pares, a trinca, a quadra; as 5 na sequência, no flush e no
 * full house; na carta alta, só ela. Os kickers ficam de fora, a não ser o que desempatou contra `contra`.
 */
export function cartasQueFazem(combinacao: { forca: Forca; cartas: Carta[] }, contra?: Forca): Carta[] {
  const { forca, cartas } = combinacao;
  const cat = forca[0];
  const vezes = (c: Carta) => cartas.filter((x) => x.valor === c.valor).length;
  let fazem = cat === 4 || cat === 5 || cat === 6 || cat === 8 ? cartas.slice() : cat === 0 ? cartas.slice(0, 1) : cartas.filter((c) => vezes(c) > 1);
  if (contra && contra[0] === cat) {
    const k = forca.findIndex((x, i) => x !== contra[i]);
    if (k >= 2) fazem = [...fazem, ...cartas.filter((c) => alto(c.valor) === forca[k] && !fazem.includes(c))];
  }
  return fazem;
}

/**
 * A mão por extenso: "PAR DE DEZ", "DOIS PARES: REIS E SETES", "FLUSH DE COPAS ATE AS"... `contra`, a força da mão
 * que perdeu por pouco: com a mesma categoria e o mesmo valor principal, diz a carta que desempatou.
 */
export function descreverMao(combinacao: { forca: Forca; cartas: Carta[] }, contra?: Forca): string {
  const [cat, a, b] = combinacao.forca;
  const naipe = combinacao.cartas[0]?.naipe.toUpperCase() ?? '';
  const texto = [
    `CARTA ALTA: ${UM[a]}`,
    `PAR DE ${VARIOS[a]}`,
    `DOIS PARES: ${VARIOS[a]} E ${VARIOS[b]}`,
    `TRINCA DE ${VARIOS[a]}`,
    `SEQUENCIA ATE ${UM[a]}`,
    `FLUSH DE ${naipe} ATE ${UM[a]}`,
    `FULL HOUSE: ${VARIOS[a]} COM ${VARIOS[b]}`,
    `QUADRA DE ${VARIOS[a]}`,
    a === 14 ? 'ROYAL FLUSH' : `STRAIGHT FLUSH ATE ${UM[a]}`,
  ][cat];
  if (!contra || contra[0] !== cat) return texto;
  const k = combinacao.forca.findIndex((x, i) => x !== contra[i]);
  return k >= 2 ? `${texto}, DESEMPATE: ${UM[combinacao.forca[k]]}` : texto;
}
