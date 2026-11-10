import { INICIAL, aplicar, chave, deFen, fimDe, legais, type Cor, type Fim, type Lance, type Posicao } from './regras';

// Xadrez online entre duas pessoas (sala do DEV): a partida que vai na sala, em JSON. Os assentos são os da sala
// (0 = quem criou); as cores são sorteadas ao começar. Empate combinado: quem joga pode oferecer junto com o lance,
// e o outro aceita na vez dele (jogar outro lance recusa).

export type FimOnline = Fim | 'desistiu' | 'acordo';
export type JogoXadrez = {
  pos: Posicao;
  historico: string[];
  ultimo: Lance | null;
  /** o assento das brancas */
  brancas: number;
  /** a cor que ofereceu empate no último lance */
  oferta: Cor | null;
  fim: FimOnline | null;
  /** o assento que ganhou (nulo no empate ou em jogo) */
  vencedor: number | null;
};

export function novoJogoXadrez(rng: () => number): JogoXadrez {
  const pos = deFen(INICIAL);
  return { pos, historico: [chave(pos)], ultimo: null, brancas: rng() < 0.5 ? 0 : 1, oferta: null, fim: null, vencedor: null };
}

export const corDoAssento = (j: JogoXadrez, assento: number): Cor => (assento === j.brancas ? 'b' : 'p');
export const assentoDaVez = (j: JogoXadrez) => (j.pos.vez === 'b' ? j.brancas : 1 - j.brancas);

/** O lance de quem está na vez (lance que não vale devolve null); fecha a partida no mate ou num empate. */
export function lanceOnline(j: JogoXadrez, m: Lance, oferecer: boolean): JogoXadrez | null {
  if (j.fim || !legais(j.pos).some((l) => l.de === m.de && l.para === m.para && l.promocao === m.promocao)) return null;
  const quem = assentoDaVez(j);
  const pos = aplicar(j.pos, m);
  const historico = [...j.historico, chave(pos)];
  const fim = fimDe(pos, historico);
  return { ...j, pos, historico, ultimo: m, oferta: !fim && oferecer ? j.pos.vez : null, fim, vencedor: fim === 'mate' ? quem : null };
}

/** Aceita o empate oferecido pelo outro (na sua vez). */
export const aceitarEmpate = (j: JogoXadrez): JogoXadrez | null =>
  !j.fim && j.oferta && j.oferta !== j.pos.vez ? { ...j, oferta: null, fim: 'acordo', vencedor: null } : null;

/** Desistir: o outro assento ganha. */
export const desistirXadrez = (j: JogoXadrez, assento: number): JogoXadrez => ({ ...j, oferta: null, fim: 'desistiu', vencedor: 1 - assento });

export function resultadoXadrez(j: JogoXadrez, assento: number): 'ganhou' | 'perdeu' | 'empate' | null {
  if (!j.fim) return null;
  return j.vencedor === null ? 'empate' : j.vencedor === assento ? 'ganhou' : 'perdeu';
}

/** A partida guardada na sala; outra coisa vira nula. */
export function lerJogoXadrez(json: string | null): JogoXadrez | null {
  try {
    const j = JSON.parse(json ?? 'null') as JogoXadrez | null;
    return j && Array.isArray(j.pos?.tab) && j.pos.tab.length === 64 && (j.brancas === 0 || j.brancas === 1) ? j : null;
  } catch {
    return null;
  }
}
