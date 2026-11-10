import { agir, novaPartida, type Jogada, type Partida } from './regras';

// NEO online, de 2 a 4 pessoas (sala do DEV): a partida que vai na sala, em JSON, com as mãos de todos ("de
// confiança": a tela só mostra a sua). Os assentos são os da sala; quem criou começa. Alguém desistir encerra a
// partida para todos, sem vencedor.

export const LANCES_ONLINE = 6;
export type JogoNeo = {
  p: Partida;
  /** os últimos lances, o mais novo primeiro */
  lances: string[];
  /** o assento que desistiu (encerra a partida) */
  desistiu: number | null;
};

export function novoJogoNeo(nomes: string[], rng: () => number): JogoNeo {
  const p = novaPartida(nomes, rng);
  return { p, lances: [`DISTRIBUIDAS 7 PARA CADA. ${nomes[p.vez]} COMECA`], desistiu: null };
}

export const acabou = (j: JogoNeo) => j.p.vencedor !== null || j.desistiu !== null;

/** A jogada de quem está na vez; jogada que não vale devolve null. */
export function jogadaNeo(j: JogoNeo, a: Jogada, rng: () => number): JogoNeo | null {
  if (acabou(j)) return null;
  const p = agir(j.p, a, rng);
  return p === j.p ? null : { ...j, p, lances: [p.aviso, ...j.lances].slice(0, LANCES_ONLINE) };
}

export function desistirNeo(j: JogoNeo, assento: number): JogoNeo {
  const aviso = `${j.p.jogadores[assento].nome} DESISTIU. PARTIDA ENCERRADA`;
  return { ...j, p: { ...j.p, aviso }, lances: [aviso, ...j.lances].slice(0, LANCES_ONLINE), desistiu: assento };
}

/** Como a partida acabou para o assento (para o histórico), ou null em jogo. */
export function resultadoNeo(j: JogoNeo, assento: number): string | null {
  if (j.p.vencedor !== null) return j.p.vencedor === assento ? 'VOCE ZEROU A MAO' : `${j.p.jogadores[j.p.vencedor].nome} ZEROU A MAO`;
  if (j.desistiu !== null) return j.desistiu === assento ? 'VOCE DESISTIU' : `${j.p.jogadores[j.desistiu].nome} DESISTIU`;
  return null;
}

/** A partida guardada na sala; outra coisa vira nula. */
export function lerJogoNeo(json: string | null): JogoNeo | null {
  try {
    const j = JSON.parse(json ?? 'null') as JogoNeo | null;
    return j && Array.isArray(j.p?.jogadores) && Array.isArray(j.p.monte) && Array.isArray(j.p.descarte) && Array.isArray(j.lances) ? j : null;
  } catch {
    return null;
  }
}
