// Slot Machine de 3 rolos e uma linha, sem DOM. Cada rolo é a mesma fita de 21 símbolos (os mais comuns pagam menos);
// cada um para numa posição sorteada, e a linha do meio decide o prêmio, vezes a aposta (com a aposta dentro).
//
// Retorno: `retornoTeorico()` conta todas as 21³ paradas; com a tabela abaixo dá ~100%. Para ajustar a vantagem,
// mude PESOS ou PREMIOS (decisão do responsável: ajustável, 2026-11-03); o teste mostra o retorno novo.

export const SIMBOLOS = ['cereja', 'sino', 'barra', 'estrela', 'sete', 'olho'] as const;
export type Simbolo = (typeof SIMBOLOS)[number];

/** Quantas vezes cada símbolo aparece na fita. */
export const PESOS: Record<Simbolo, number> = { cereja: 6, sino: 5, barra: 4, estrela: 3, sete: 2, olho: 1 };

/**
 * A fita: cada cópia de um símbolo no meio da sua fatia da volta, com um pequeno desvio por símbolo, para que nenhum
 * fique ao lado de um igual (nem na emenda, que dá a volta).
 */
export const FITA: Simbolo[] = SIMBOLOS
  .flatMap((s, i) => Array.from({ length: PESOS[s] }, (_, k) => ({ s, lugar: ((k + 0.5) / PESOS[s] + (0.1 * i) / SIMBOLOS.length) % 1 })))
  .sort((a, b) => a.lugar - b.lugar || SIMBOLOS.indexOf(a.s) - SIMBOLOS.indexOf(b.s))
  .map((x) => x.s);

export const PREMIOS: ReadonlyArray<{ nome: string; paga: number; combina: (l: Simbolo[]) => boolean }> = [
  { nome: 'OLHO x3', paga: 500, combina: (l) => tres(l, 'olho') },
  { nome: 'SETE x3', paga: 100, combina: (l) => tres(l, 'sete') },
  { nome: 'ESTRELA x3', paga: 50, combina: (l) => tres(l, 'estrela') },
  { nome: 'BAR x3', paga: 25, combina: (l) => tres(l, 'barra') },
  { nome: 'SINO x3', paga: 14, combina: (l) => tres(l, 'sino') },
  { nome: 'CEREJA x3', paga: 10, combina: (l) => tres(l, 'cereja') },
  { nome: 'CEREJA x2 NO INICIO', paga: 2, combina: (l) => l[0] === 'cereja' && l[1] === 'cereja' },
];

function tres(l: Simbolo[], s: Simbolo) {
  return l[0] === s && l[1] === s && l[2] === s;
}

/** O prêmio da linha (o primeiro da tabela que combina), ou null. */
export const premioDe = (linha: Simbolo[]) => PREMIOS.find((p) => p.combina(linha)) ?? null;

/** Onde cada rolo para (posição na fita). */
export const sortearParadas = (rng: () => number): number[] => [0, 1, 2].map(() => Math.floor(rng() * FITA.length));

/** O símbolo do rolo parado em `parada`, deslocado `d` (-1 em cima, 0 na linha, 1 embaixo). */
export const simboloEm = (parada: number, d = 0) => FITA[(parada + d + FITA.length) % FITA.length];

export const linhaDe = (paradas: number[]) => paradas.map((p) => simboloEm(p));

/** Fichas que voltam (com a aposta) para estas paradas. */
export const retornoDe = (paradas: number[], aposta: number) => aposta * (premioDe(linhaDe(paradas))?.paga ?? 0);

/** Retorno médio por ficha apostada, contando todas as paradas possíveis. */
export function retornoTeorico(): number {
  const n = FITA.length;
  let total = 0;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++) total += retornoDe([a, b, c], 1);
  return total / n ** 3;
}
