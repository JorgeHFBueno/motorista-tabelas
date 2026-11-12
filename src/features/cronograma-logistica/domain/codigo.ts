import { semanaDoId } from './semanas';

const doisDigitos = (numero: number) => String(numero).padStart(2, '0');

/**
 * Código da linha, gravado como número: semana, ano (os dois últimos dígitos do ano da semana ISO) e a ordem de
 * criação na semana, com dois dígitos cada (a ordem cresce para três depois de 99). A primeira da semana 46 de 2026
 * é 462601; a tela mostra "LOG-462601" (textoCodigo).
 */
export function codigoDaProgramacao(semanaId: string, numero: number): number {
  return Number(`${doisDigitos(semanaDoId(semanaId).numero)}${semanaId.slice(2, 4)}${doisDigitos(numero)}`);
}

/**
 * Código do formato anterior (texto: semana, dia da segunda, dia do domingo e ordem, "46091501") no formato atual,
 * com a mesma ordem; null quando o texto não é desse formato.
 */
export function codigoConvertido(semanaId: string, antigo: string): number | null {
  if (!/^\d{8,9}$/.test(antigo)) return null;
  const ordem = Number(antigo.slice(6));
  return ordem >= 1 ? codigoDaProgramacao(semanaId, ordem) : null;
}

/** "LOG-" só na tela; as semanas 1 a 9 voltam o zero da frente que o número perde (12601 → "LOG-012601"). */
export const textoCodigo = (cod: number) => `LOG-${String(cod).padStart(6, '0')}`;

/** Ordem em que as linhas sem código recebem um: a ordem da tela (posição), depois o id. */
export function semCodigoEmOrdem<T extends { id: string; cod: number | null; posicao: number }>(linhas: readonly T[]): T[] {
  return linhas.filter((linha) => linha.cod === null).sort((a, b) => a.posicao - b.posicao || a.id.localeCompare(b.id));
}
