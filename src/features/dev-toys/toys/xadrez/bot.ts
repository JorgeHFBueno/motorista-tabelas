// Bot do xadrez, sem DOM: busca negamax com poda alfa-beta sobre material e tabelas de posição (as da "Simplified
// Evaluation Function", de domínio público no Chess Programming Wiki). Três níveis, cada um com a sua aposta:
// FACIL olha 1 lance e erra de propósito; MEDIO olha 2 e erra pouco; DIFICIL olha 3, segue as trocas até acalmar
// (quiescência) e não erra de propósito.

import { aplicar, emXeque, legais, type Lance, type Posicao } from './regras';

export const NIVEIS = [
  { nome: 'FACIL', aposta: 10, profundidade: 1, ruido: 120, quiescencia: false },
  { nome: 'MEDIO', aposta: 50, profundidade: 2, ruido: 25, quiescencia: false },
  { nome: 'DIFICIL', aposta: 100, profundidade: 3, ruido: 0, quiescencia: true },
] as const;
export type Nivel = (typeof NIVEIS)[number];

/** ALEATORIA: um dos três níveis, sorteado às cegas; não custa nada para entrar e a vitória paga PREMIO. */
export const ALEATORIA = { nome: 'ALEATORIA', aposta: 0, premio: 30 } as const;
export const sortearNivel = (rng: () => number) => Math.floor(rng() * NIVEIS.length);

/** O que volta para a carteira no fim: vitória paga o dobro da aposta (na ALEATORIA, o prêmio), empate devolve. */
export function retornoDe(resultado: 'ganhou' | 'perdeu' | 'empate', aposta: number, aleatoria = false): number {
  if (aleatoria) return resultado === 'ganhou' ? ALEATORIA.premio : 0;
  return resultado === 'ganhou' ? 2 * aposta : resultado === 'empate' ? aposta : 0;
}

const VALOR: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100000;

// tabelas do ponto de vista das brancas, casa 0 = a8
const TABELAS: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

/** Avaliação estática, do ponto de vista de quem joga agora (positivo: bom para ele). */
export function avaliar(p: Posicao): number {
  let brancas = 0;
  for (let i = 0; i < 64; i++) {
    const x = p.tab[i];
    if (x === '.') continue;
    const t = x.toLowerCase();
    const branca = x !== t;
    // as pretas usam a tabela espelhada (a linha 0 delas é a 1ª fileira)
    const idx = branca ? i : (7 - (i >> 3)) * 8 + (i & 7);
    const v = VALOR[t] + (TABELAS[t]?.[idx] ?? 0);
    brancas += branca ? v : -v;
  }
  return p.vez === 'b' ? brancas : -brancas;
}

/** Ordem de busca: promoções e capturas boas primeiro (vítima valiosa, atacante barato). */
function ordenar(ls: Lance[]): Lance[] {
  const nota = (m: Lance) => (m.promocao ? 2000 : 0) + (m.captura ? 10 * VALOR[m.captura.toLowerCase()] - VALOR[m.peca.toLowerCase()] + 1000 : 0);
  return ls.sort((a, b) => nota(b) - nota(a));
}

function quiescencia(p: Posicao, alfa: number, beta: number, resta: number): number {
  const parado = avaliar(p);
  if (parado >= beta) return beta;
  if (parado > alfa) alfa = parado;
  if (resta === 0) return alfa;
  for (const m of ordenar(legais(p).filter((x) => x.captura || x.promocao))) {
    const v = -quiescencia(aplicar(p, m), -beta, -alfa, resta - 1);
    if (v >= beta) return beta;
    if (v > alfa) alfa = v;
  }
  return alfa;
}

function negamax(p: Posicao, prof: number, alfa: number, beta: number, ply: number, q: boolean): number {
  const ls = legais(p);
  if (!ls.length) return emXeque(p) ? -MATE + ply : 0;
  if (prof === 0) return q ? quiescencia(p, alfa, beta, 4) : avaliar(p);
  for (const m of ordenar(ls)) {
    const v = -negamax(aplicar(p, m), prof - 1, -beta, -alfa, ply + 1, q);
    if (v >= beta) return beta;
    if (v > alfa) alfa = v;
  }
  return alfa;
}

/**
 * O lance do bot. Os lances começam embaralhados (a mesma posição não dá sempre a mesma partida); nos níveis com
 * ruído, cada lance ganha um erro sorteado na nota, e o bot às vezes escolhe pior.
 */
export function escolherLance(p: Posicao, nivel: Nivel, rng: () => number): Lance | null {
  const ls = legais(p);
  if (!ls.length) return null;
  for (let i = ls.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ls[i], ls[j]] = [ls[j], ls[i]];
  }
  let melhor: Lance | null = null;
  let melhorNota = -Infinity;
  let alfa = -Infinity;
  for (const m of nivel.ruido ? ls : ordenar(ls)) {
    // com ruído, cada lance precisa da nota exata (janela cheia); sem ruído, a poda vale também na raiz
    const v = -negamax(aplicar(p, m), nivel.profundidade - 1, -Infinity, nivel.ruido ? Infinity : -alfa, 1, nivel.quiescencia);
    const nota = v + (nivel.ruido ? (rng() * 2 - 1) * nivel.ruido : 0);
    if (nota > melhorNota) { melhorNota = nota; melhor = m; }
    if (!nivel.ruido && v > alfa) alfa = v;
  }
  return melhor;
}
