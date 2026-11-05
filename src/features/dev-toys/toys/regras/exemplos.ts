// Exemplos do setor Regras, sem DOM. As contas (pontos do 21, nome das mãos de poker, casas para onde a peça vai)
// saem dos mesmos motores dos jogos, então o exemplo nunca diz uma coisa e o jogo faz outra.

import type { Carta, Naipe } from '../cartas/baralho';
import { NOMES_MAO, descreverMao, melhorCombinacao, melhorMao } from '../poker/maos';
import { pontos } from '../vinteum/regras';
import { deFen, emXeque, fimDe, legais, nomeCasa, type Fim } from '../xadrez/regras';

const NAIPE: Record<string, Naipe> = { e: 'espadas', c: 'copas', o: 'ouros', p: 'paus' };
const VALOR: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };
/** "10e Kc" vira as cartas: valor (A, 2 a 10, J, Q, K) e naipe (e, c, o, p). */
export const cartas = (texto: string): Carta[] =>
  texto.split(' ').map((t) => ({ valor: VALOR[t.slice(0, -1)] ?? Number(t.slice(0, -1)), naipe: NAIPE[t.slice(-1)] }));

// ---- 21 ----------------------------------------------------------------------------------------------------------

/** O que a mão vale no 21, como o jogo conta. */
export function valorNo21(mao: Carta[]): string {
  const { total, macia } = pontos(mao);
  if (total > 21) return `${total} . ESTOUROU`;
  if (mao.length === 2 && total === 21) return '21 . BLACKJACK';
  return macia ? `${total} OU ${total - 10}` : String(total);
}

export const EXEMPLOS_21 = [
  { mao: cartas('7e Qc'), texto: 'Numeros valem o numero; J, Q e K valem 10.' },
  { mao: cartas('Ap 6o'), texto: 'O As vale 11, ou 1 se o 11 estourar.' },
  { mao: cartas('Ae Kc'), texto: 'As e uma de 10 nas duas primeiras: blackjack, paga 3 por 2.' },
  { mao: cartas('10e 6c 9o'), texto: 'Passou de 21: estourou e perde na hora.' },
];

// ---- Poker -------------------------------------------------------------------------------------------------------

/** Uma mão de cada categoria, da maior para a menor, com o que a define. */
export const MAOS_POKER = [
  { mao: cartas('10c Jc Qc Kc Ac'), texto: 'Sequencia do 10 ao As, toda do mesmo naipe.' },
  { mao: cartas('5e 6e 7e 8e 9e'), texto: 'Cinco em sequencia do mesmo naipe.' },
  { mao: cartas('8e 8c 8o 8p Ke'), texto: 'Quatro do mesmo valor.' },
  { mao: cartas('Qe Qc Qo 7p 7c'), texto: 'Uma trinca e um par.' },
  { mao: cartas('2o 7o 9o Jo Ao'), texto: 'Cinco do mesmo naipe, fora de ordem.' },
  { mao: cartas('Ae 2c 3o 4p 5e'), texto: 'Cinco em ordem, naipes quaisquer. O As e alto ou baixo.' },
  { mao: cartas('5e 5c 5o Kp 9e'), texto: 'Tres do mesmo valor.' },
  { mao: cartas('Ke Kc 7o 7p 2e'), texto: 'Dois pares diferentes.' },
  { mao: cartas('10e 10c 3o 8p Ae'), texto: 'Duas do mesmo valor.' },
  { mao: cartas('Je 7c 3o 8p 9e'), texto: 'Nada disso: vale a carta mais alta.' },
].map((x) => {
  const f = melhorMao(x.mao);
  return { ...x, nome: f[0] === 8 && f[1] === 14 ? 'ROYAL FLUSH' : NOMES_MAO[f[0]], descricao: descreverMao(melhorCombinacao(x.mao)) };
});

/** Mesma categoria e mesmo par: decide a carta seguinte (o kicker). */
export const DESEMPATE_POKER = (() => {
  const ganha = cartas('Ae Ac Ko 9p 8e');
  const perde = cartas('Ao Ap Qc 9e 8c');
  return { ganha, perde, descricao: descreverMao(melhorCombinacao(ganha), melhorMao(perde)) };
})();

// ---- Xadrez ------------------------------------------------------------------------------------------------------

export type ExemploXadrez = {
  titulo: string;
  fen: string;
  /** a peça cujos lances aparecem (casa como "d4"); sem ela, só a posição */
  origem: string | null;
  texto: string;
};

export const EXEMPLOS_XADREZ: ExemploXadrez[] = [
  { titulo: 'REI', fen: 'k7/8/8/8/3K4/8/8/8 w - - 0 1', origem: 'd4', texto: 'Uma casa para qualquer lado. Nunca para uma casa atacada.' },
  { titulo: 'DAMA', fen: 'k7/8/8/8/3Q4/8/8/7K w - - 0 1', origem: 'd4', texto: 'Quantas casas quiser, em linha reta ou na diagonal.' },
  { titulo: 'TORRE', fen: 'k7/8/8/8/3R4/8/8/7K w - - 0 1', origem: 'd4', texto: 'Quantas casas quiser, em linha reta.' },
  { titulo: 'BISPO', fen: 'k7/8/8/8/3B4/8/8/7K w - - 0 1', origem: 'd4', texto: 'Quantas casas quiser, na diagonal.' },
  { titulo: 'CAVALO', fen: 'k7/8/8/8/3N4/8/8/7K w - - 0 1', origem: 'd4', texto: 'Em L: duas casas e uma de lado. Pula as outras pecas.' },
  { titulo: 'PEAO', fen: 'k7/8/8/3p4/2P5/8/4P3/7K w - - 0 1', origem: 'c4', texto: 'Anda uma para frente (duas na primeira vez) e captura na diagonal.' },
  { titulo: 'ROQUE', fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', origem: 'e1', texto: 'Rei e torre sem ter mexido, caminho livre e sem xeque: o rei anda duas e a torre passa por ele.' },
  { titulo: 'EN PASSANT', fen: 'k7/8/8/3pP3/8/8/8/7K w - d6 0 1', origem: 'e5', texto: 'O peao preto andou duas e parou ao lado: logo em seguida, da para captura-lo como se tivesse andado uma.' },
  { titulo: 'PROMOCAO', fen: '7k/P7/8/8/8/8/8/7K w - - 0 1', origem: 'a7', texto: 'Peao que chega ao fim vira outra peca. No jogo, o seu vira dama.' },
  { titulo: 'XEQUE-MATE', fen: 'R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1', origem: null, texto: 'Rei atacado e sem lance que o salve: acabou, ganha quem deu o mate.' },
  { titulo: 'AFOGAMENTO', fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', origem: null, texto: 'Sem xeque, mas sem nenhum lance legal: empate.' },
];

/** As casas (indices) para onde a peça de `origem` pode ir, pelos lances legais do motor. */
export function destinosDe(e: ExemploXadrez): number[] {
  if (!e.origem) return [];
  return [...new Set(legais(deFen(e.fen)).filter((m) => nomeCasa(m.de) === e.origem).map((m) => m.para))];
}

/** O rei da vez, se está em xeque (para marcar), e como a posição termina (mate, afogamento ou nada). */
export function situacaoDe(e: ExemploXadrez): { xeque: number; fim: Fim | null } {
  const p = deFen(e.fen);
  const rei = p.tab.indexOf(p.vez === 'b' ? 'K' : 'k');
  return { xeque: emXeque(p) ? rei : -1, fim: fimDe(p) };
}
