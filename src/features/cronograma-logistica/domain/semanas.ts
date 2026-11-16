import type { CivilDate } from './models';

// Semanas de segunda a domingo, identificadas pela semana ISO 8601 ("2026-W46").

const DIA = 86_400_000;
const parse = (date: CivilDate) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
const format = (ms: number): CivilDate => new Date(ms).toISOString().slice(0, 10);

export function somarDias(date: CivilDate, dias: number): CivilDate {
  return format(parse(date) + dias * DIA);
}

/** Dias entre duas datas (fim − início). */
export function diferencaDias(inicio: CivilDate, fim: CivilDate): number {
  return Math.round((parse(fim) - parse(inicio)) / DIA);
}

/** Hoje no relógio local (a WEB roda em Brasília). */
export function hojeCivil(agora = new Date()): CivilDate {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

/** Segunda-feira da semana da data. */
export function segundaDaSemana(date: CivilDate): CivilDate {
  const diaSemana = new Date(parse(date)).getUTCDay(); // 0 = domingo
  return somarDias(date, -((diaSemana + 6) % 7));
}

export function semanaIdDe(date: CivilDate): string {
  const quinta = somarDias(segundaDaSemana(date), 3); // a quinta decide o ano ISO
  const ano = Number(quinta.slice(0, 4));
  const numero = Math.floor(diferencaDias(`${ano}-01-01`, quinta) / 7) + 1;
  return `${ano}-W${String(numero).padStart(2, '0')}`;
}

export function semanaIdValido(id: string): boolean {
  if (!/^\d{4}-W\d{2}$/.test(id)) return false;
  const numero = Number(id.slice(6));
  return numero >= 1 && semanaIdDe(inicioDaSemanaId(id)) === id;
}

/** Segunda-feira da semana ISO: a semana 1 é a que contém 4 de janeiro. */
export function inicioDaSemanaId(id: string): CivilDate {
  const ano = Number(id.slice(0, 4));
  const numero = Number(id.slice(6));
  return somarDias(segundaDaSemana(`${ano}-01-04`), (numero - 1) * 7);
}

export function semanaDoId(id: string) {
  const inicio = inicioDaSemanaId(id);
  return { id, numero: Number(id.slice(6)), inicio, fim: somarDias(inicio, 6) };
}

export const ddmm = (date: CivilDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

export function rotuloSemana(id: string): string {
  const semana = semanaDoId(id);
  return `Semana ${semana.numero} – ${ddmm(semana.inicio)} a ${ddmm(semana.fim)}`;
}

export function deslocarSemana(id: string, semanas: number): string {
  return semanaIdDe(somarDias(inicioDaSemanaId(id), semanas * 7));
}

/** Quantas semanas à frente da atual podem ser abertas (o alcance do calendário). */
export const SEMANAS_A_FRENTE = 2;

/** A próxima semana que "Iniciar nova semana" abre, ou null quando já chegou ao limite. */
export function proximaSemanaParaAbrir(abertas: readonly string[], hoje: CivilDate): string | null {
  const atual = semanaIdDe(hoje);
  const ultima = [...abertas, atual].sort().at(-1)!;
  const proxima = deslocarSemana(ultima, 1);
  return proxima <= deslocarSemana(atual, SEMANAS_A_FRENTE) ? proxima : null;
}

/** Futuras (a mais distante primeiro), a atual e as anteriores (a mais recente primeiro). */
export function organizarSemanas(abertas: readonly string[], hoje: CivilDate) {
  const atual = semanaIdDe(hoje);
  const ordenadas = [...new Set(abertas)].sort().reverse();
  return {
    futuras: ordenadas.filter((id) => id > atual),
    atual: ordenadas.includes(atual) ? atual : null,
    anteriores: ordenadas.filter((id) => id < atual),
  };
}

/**
 * Programações de semanas anteriores que aparecem também na semana atual: as não encerradas (status diferente de
 * Finalizado e CANCELADO) que terminam na semana atual ou depois, ou que não têm fim. Ordem: semana, depois posição.
 */
export function vindasDeAntes<T extends { id: string; semanaId: string; fim: CivilDate | null; posicao: number }>(
  linhas: readonly T[],
  atualId: string,
  encerrada: (linha: T) => boolean,
): T[] {
  const segunda = inicioDaSemanaId(atualId);
  return linhas
    .filter((linha) => linha.semanaId < atualId && (linha.fim === null || linha.fim >= segunda) && !encerrada(linha))
    .sort((a, b) => a.semanaId.localeCompare(b.semanaId) || a.posicao - b.posicao || a.id.localeCompare(b.id));
}

/** Os 28 dias do calendário: da segunda da semana anterior ao domingo de daqui a duas semanas. */
export function diasDoCalendario(hoje: CivilDate): CivilDate[] {
  const inicio = somarDias(segundaDaSemana(hoje), -7);
  return Array.from({ length: 28 }, (_, index) => somarDias(inicio, index));
}
