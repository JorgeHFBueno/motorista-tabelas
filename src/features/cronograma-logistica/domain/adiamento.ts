import type { CivilDate } from './models';
import { ddmm, diferencaDias } from './semanas';

/** O motivo cabe no campo `adiamento` (até 200 caracteres) junto com "antecipada de dd/mm (x dias), pelo motivo de ". */
export const MAX_MOTIVO_ADIAMENTO = 150;

/** Pergunta "correção ou adiamento?" sempre que a linha já tinha fim e ele muda para outra data (antes ou depois). */
export function perguntarAdiamento(fimAntes: CivilDate | null, fimDepois: CivilDate | null): boolean {
  return fimAntes !== null && fimDepois !== null && fimDepois !== fimAntes;
}

/**
 * O que fica gravado em `adiamento` (só o texto, sem data à parte): o fim de antes, quantos dias e o motivo.
 * Fim para depois é "adiada"; para antes, "antecipada".
 */
export function textoAdiamento(fimAntes: CivilDate, fimDepois: CivilDate, motivo: string): string {
  const diferenca = diferencaDias(fimAntes, fimDepois);
  const dias = Math.abs(diferenca);
  return `${diferenca < 0 ? 'antecipada' : 'adiada'} de ${ddmm(fimAntes)} (${dias} ${dias === 1 ? 'dia' : 'dias'}), pelo motivo de ${motivo.trim().slice(0, MAX_MOTIVO_ADIAMENTO)}`;
}
