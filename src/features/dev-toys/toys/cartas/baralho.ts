// Baralho comum dos jogos de cartas do DEV: 52 cartas, embaralhadas com o sorteio de semente (a mesma semente dá a
// mesma ordem, o que deixa as regras testáveis). Sem DOM.

export const NAIPES = ['espadas', 'copas', 'ouros', 'paus'] as const;
export type Naipe = (typeof NAIPES)[number];

/** 1 = Ás, 11 = Valete, 12 = Dama, 13 = Rei. */
export type Carta = { valor: number; naipe: Naipe };

const ROTULOS: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const NOMES: Record<number, string> = { 1: 'As', 11: 'Valete', 12: 'Dama', 13: 'Rei' };

/** O que vai no canto da carta: A, 2 a 10, J, Q, K. */
export const rotuloDe = (c: Carta) => ROTULOS[c.valor] ?? String(c.valor);
/** Nome por extenso, sem acento (leitores de tela e a fonte do DEV). */
export const nomeDaCarta = (c: Carta) => `${NOMES[c.valor] ?? c.valor} de ${c.naipe}`;

export function novoBaralho(): Carta[] {
  const cartas: Carta[] = [];
  for (const naipe of NAIPES) for (let valor = 1; valor <= 13; valor++) cartas.push({ valor, naipe });
  return cartas;
}

/** Fisher-Yates com o sorteio dado; devolve um baralho novo. */
export function embaralhar(cartas: Carta[], rng: () => number): Carta[] {
  const b = cartas.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
