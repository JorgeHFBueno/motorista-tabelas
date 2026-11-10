import { semanaDoId } from './semanas';

/**
 * Código da linha: número da semana, dia da segunda, dia do domingo e a ordem de criação na semana, com dois
 * dígitos cada (a ordem cresce para três depois de 99). A primeira da semana 46 (09/11 a 15/11) é "46091501".
 */
export function codigoDaProgramacao(semanaId: string, numero: number): string {
  const semana = semanaDoId(semanaId);
  return `${String(semana.numero).padStart(2, '0')}${semana.inicio.slice(8, 10)}${semana.fim.slice(8, 10)}${String(numero).padStart(2, '0')}`;
}

/** Ordem em que as linhas sem código recebem um: a ordem da tela (posição), depois o id. */
export function semCodigoEmOrdem<T extends { id: string; cod: string | null; posicao: number }>(linhas: readonly T[]): T[] {
  return linhas.filter((linha) => !linha.cod).sort((a, b) => a.posicao - b.posicao || a.id.localeCompare(b.id));
}
