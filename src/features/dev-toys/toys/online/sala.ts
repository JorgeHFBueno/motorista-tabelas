import { gravar, ler } from '../crawler/memoria';

// Salas online do Xadrez e do NEO (coleção dev-salas, só retr0), sem Firebase: o formato, qual sala mostrar e as
// marcas deste navegador. Partida "de confiança": o estado inteiro do jogo fica na sala, em JSON; as Rules garantem
// quem entra, quem começa e de quem é a vez. Sem fichas: o resultado vai só para o histórico da Carteira.

export type JogoOnline = 'xadrez' | 'neo';
export const MAX_JOGADORES: Record<JogoOnline, number> = { xadrez: 2, neo: 4 };
export type EstadoSala = 'aberta' | 'jogando' | 'fim';

export type Sala = {
  id: string;
  jogo: JogoOnline;
  criadaPor: string;
  /** uids, na ordem dos assentos */
  jogadores: string[];
  /** nomes, na mesma ordem */
  nomes: string[];
  max: number;
  estado: EstadoSala;
  /** a partida em JSON (formato de cada jogo); nula enquanto aberta */
  partida: string | null;
  /** uid de quem joga agora; nula fora do jogo */
  vez: string | null;
  versao: number;
  /** ms desde 1970 */
  atualizadaEm: number;
};

/** Sala aberta parada há mais que isto some da lista (quem criou fechou a janela e não voltou). */
export const SALA_ESQUECIDA_MS = 2 * 60 * 60 * 1000;

/** O nome como aparece no DEV: sem acento, maiúsculo, até dois nomes. */
export function nomeDev(nome: string | null | undefined): string {
  const limpo = (nome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ');
  return limpo.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ').slice(0, 16) || 'SEM NOME';
}

/** Sala válida a partir do documento; outra coisa vira nula. */
export function lerSala(id: string, v: Record<string, unknown>, atualizadaEm: number): Sala | null {
  const lista = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string') : []);
  if (v.jogo !== 'xadrez' && v.jogo !== 'neo') return null;
  if (v.estado !== 'aberta' && v.estado !== 'jogando' && v.estado !== 'fim') return null;
  return {
    id,
    jogo: v.jogo,
    criadaPor: typeof v.criadaPor === 'string' ? v.criadaPor : '',
    jogadores: lista(v.jogadores),
    nomes: lista(v.nomes),
    max: typeof v.max === 'number' ? v.max : MAX_JOGADORES[v.jogo],
    estado: v.estado,
    partida: typeof v.partida === 'string' ? v.partida : null,
    vez: typeof v.vez === 'string' ? v.vez : null,
    versao: typeof v.versao === 'number' ? v.versao : 0,
    atualizadaEm,
  };
}

/** A sala em que estou (a mexida mais recente), menos as que já deixei depois do fim. */
export function minhaSala(salas: Sala[], uid: string, deixadas: readonly string[]): Sala | null {
  const minhas = salas.filter((s) => s.jogadores.includes(uid) && !deixadas.includes(s.id));
  return minhas.sort((a, b) => b.atualizadaEm - a.atualizadaEm)[0] ?? null;
}

/** As salas em que dá para entrar: abertas, com vaga, mexidas há pouco; a mais nova primeiro. */
export function salasLivres(salas: Sala[], uid: string, agora: number): Sala[] {
  return salas
    .filter((s) => s.estado === 'aberta' && !s.jogadores.includes(uid) && s.jogadores.length < s.max && agora - s.atualizadaEm < SALA_ESQUECIDA_MS)
    .sort((a, b) => b.atualizadaEm - a.atualizadaEm);
}

/**
 * Onde cada assento senta na mesa de 4 lugares (0 = você, embaixo; 1 esquerda, 2 em cima, 3 direita, na ordem da
 * vez): com 2, o outro fica em cima; com 3, à esquerda e à direita.
 */
export function lugarNaMesa(assento: number, eu: number, n: number): number {
  const r = (assento - eu + n) % n;
  if (n === 2) return r === 0 ? 0 : 2;
  if (n === 3) return [0, 1, 3][r];
  return r;
}

// Marcas deste navegador: as salas que deixei (para não voltarem) e as que já foram para o histórico.
const CHAVE_MARCAS = 'ledur:dev-online';
const MAX_MARCAS = 50;
type Marcas = { deixadas: string[]; anotadas: string[] };

export function lerMarcas(): Marcas {
  const v = ler(CHAVE_MARCAS) as Partial<Marcas> | null;
  const lista = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string').slice(-MAX_MARCAS) : []);
  return { deixadas: lista(v?.deixadas), anotadas: lista(v?.anotadas) };
}

export function marcar(tipo: keyof Marcas, id: string) {
  const m = lerMarcas();
  if (!m[tipo].includes(id)) gravar(CHAVE_MARCAS, { ...m, [tipo]: [...m[tipo], id].slice(-MAX_MARCAS) });
}

/** Roda `anotar` uma vez por sala neste navegador (o fim chega a cada atualização da sala). */
export function anotarUmaVez(id: string, anotar: () => void) {
  if (lerMarcas().anotadas.includes(id)) return;
  marcar('anotadas', id);
  anotar();
}
