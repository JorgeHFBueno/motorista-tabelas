// Regras do 21 (blackjack) contra a banca, sem DOM. Um baralho de 52, embaralhado a cada mão. A banca pede até 17
// e para em qualquer 17. Blackjack (21 nas duas primeiras) paga 3:2; dobrar vale só com 2 cartas e compra uma.
// Sem dividir par nem seguro. As fichas são de brincadeira e ficam só neste navegador.

import { embaralhar, novoBaralho, type Carta } from '../cartas/baralho';

export const FICHAS_INICIAIS = 200;
export const APOSTAS = [10, 20, 50] as const;
/** A banca pede carta enquanto tiver menos que isto. */
export const BANCA_PARA = 17;

export type Fase = 'apostando' | 'jogando' | 'fim';
export type Resultado = 'blackjack' | 'ganhou' | 'banca-estourou' | 'empate' | 'perdeu' | 'estourou' | 'banca-blackjack';
export type Mesa = {
  baralho: Carta[];
  jogador: Carta[];
  banca: Carta[];
  /** já descontada das fichas */
  aposta: number;
  fichas: number;
  fase: Fase;
  resultado: Resultado | null;
};

/** Ás vale 11 enquanto não estourar ("mão macia"); figuras valem 10. */
export function pontos(mao: Carta[]): { total: number; macia: boolean } {
  let total = 0;
  let ases = 0;
  for (const c of mao) {
    total += Math.min(10, c.valor);
    if (c.valor === 1) ases++;
  }
  const macia = ases > 0 && total + 10 <= 21;
  return { total: macia ? total + 10 : total, macia };
}

export const ehBlackjack = (mao: Carta[]) => mao.length === 2 && pontos(mao).total === 21;

/** Quanto volta para as fichas ao fim da mão (a aposta já saiu delas). */
export function retorno(r: Resultado, aposta: number): number {
  if (r === 'blackjack') return aposta + Math.floor(aposta * 1.5);
  if (r === 'ganhou' || r === 'banca-estourou') return aposta * 2;
  if (r === 'empate') return aposta;
  return 0;
}

export const venceu = (r: Resultado | null) => r === 'blackjack' || r === 'ganhou' || r === 'banca-estourou';

export const mesaNova = (fichas: number): Mesa => ({ baralho: [], jogador: [], banca: [], aposta: 0, fichas, fase: 'apostando', resultado: null });

function fim(m: Mesa, resultado: Resultado): Mesa {
  return { ...m, fase: 'fim', resultado, fichas: m.fichas + retorno(resultado, m.aposta) };
}

/** Desconta a aposta e dá duas cartas para cada um (jogador, banca, jogador, banca). Blackjack de alguém encerra. */
export function distribuir(m: Mesa, aposta: number, rng: () => number): Mesa {
  if (m.fase === 'jogando' || aposta <= 0 || aposta > m.fichas) return m;
  const b = embaralhar(novoBaralho(), rng);
  const jogador = [b[0], b[2]];
  const banca = [b[1], b[3]];
  const mesa: Mesa = { baralho: b.slice(4), jogador, banca, aposta, fichas: m.fichas - aposta, fase: 'jogando', resultado: null };
  const bj = ehBlackjack(jogador);
  const bjBanca = ehBlackjack(banca);
  if (bj && bjBanca) return fim(mesa, 'empate');
  if (bj) return fim(mesa, 'blackjack');
  if (bjBanca) return fim(mesa, 'banca-blackjack');
  return mesa;
}

/** Compra uma carta; estourou perde, 21 para sozinho. */
export function pedir(m: Mesa): Mesa {
  if (m.fase !== 'jogando') return m;
  const mesa = { ...m, jogador: [...m.jogador, m.baralho[0]], baralho: m.baralho.slice(1) };
  const { total } = pontos(mesa.jogador);
  if (total > 21) return fim(mesa, 'estourou');
  if (total === 21) return parar(mesa);
  return mesa;
}

/** O jogador para; a banca compra até 17 e compara. */
export function parar(m: Mesa): Mesa {
  if (m.fase !== 'jogando') return m;
  let banca = m.banca;
  let baralho = m.baralho;
  while (pontos(banca).total < BANCA_PARA) {
    banca = [...banca, baralho[0]];
    baralho = baralho.slice(1);
  }
  const mesa = { ...m, banca, baralho };
  const eu = pontos(m.jogador).total;
  const ela = pontos(banca).total;
  if (ela > 21) return fim(mesa, 'banca-estourou');
  return fim(mesa, eu > ela ? 'ganhou' : eu < ela ? 'perdeu' : 'empate');
}

export const podeDobrar = (m: Mesa) => m.fase === 'jogando' && m.jogador.length === 2 && m.fichas >= m.aposta;

/** Dobra a aposta, compra uma carta e para. */
export function dobrar(m: Mesa): Mesa {
  if (!podeDobrar(m)) return m;
  const mesa = pedir({ ...m, fichas: m.fichas - m.aposta, aposta: m.aposta * 2 });
  return mesa.fase === 'jogando' ? parar(mesa) : mesa;
}

// ---- placar guardado ----------------------------------------------------------------------------------------------

export type Placar = { fichas: number; aposta: number; recorde: number; maos: number; vitorias: number; emprestimos: number };

export const PLACAR_NOVO: Placar = { fichas: FICHAS_INICIAIS, aposta: APOSTAS[0], recorde: FICHAS_INICIAIS, maos: 0, vitorias: 0, emprestimos: 0 };

export function normalizarPlacar(valor: unknown): Placar {
  const v = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  const inteiro = (x: unknown, padrao: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : padrao);
  const fichas = inteiro(v.fichas, FICHAS_INICIAIS);
  return {
    fichas,
    aposta: (APOSTAS as readonly number[]).includes(v.aposta as number) ? (v.aposta as number) : APOSTAS[0],
    recorde: Math.max(fichas, inteiro(v.recorde, FICHAS_INICIAIS)),
    maos: inteiro(v.maos, 0),
    vitorias: inteiro(v.vitorias, 0),
    emprestimos: inteiro(v.emprestimos, 0),
  };
}

/** Sem fichas para a menor aposta, a casa empresta as fichas iniciais de novo. */
export const precisaEmprestimo = (fichas: number) => fichas < APOSTAS[0];

/** Fim de mão: conta a mão, a vitória e o recorde. */
export function registrar(p: Placar, m: Mesa): Placar {
  if (m.fase !== 'fim') return { ...p, fichas: m.fichas };
  return {
    ...p,
    fichas: m.fichas,
    recorde: Math.max(p.recorde, m.fichas),
    maos: p.maos + 1,
    vitorias: p.vitorias + (venceu(m.resultado) ? 1 : 0),
  };
}
