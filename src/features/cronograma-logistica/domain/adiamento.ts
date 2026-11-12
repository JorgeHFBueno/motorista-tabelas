import type { CivilDate } from './models';
import { ddmm, diferencaDias } from './semanas';

/** O motivo cabe no campo `adiamento` (até 200 caracteres) junto com "adiada de dd/mm (x dias), pelo motivo de ". */
export const MAX_MOTIVO_ADIAMENTO = 150;

/** Só se pergunta "correção ou adiamento?" quando a linha já tinha fim e ele passa para depois. */
export function perguntarAdiamento(fimAntes: CivilDate | null, fimDepois: CivilDate | null): boolean {
  return fimAntes !== null && fimDepois !== null && fimDepois > fimAntes;
}

/** O que fica gravado em `adiamento` (só o texto, sem data à parte): o fim de antes, quantos dias e o motivo. */
export function textoAdiamento(fimAntes: CivilDate, fimDepois: CivilDate, motivo: string): string {
  const dias = diferencaDias(fimAntes, fimDepois);
  return `adiada de ${ddmm(fimAntes)} (${dias} ${dias === 1 ? 'dia' : 'dias'}), pelo motivo de ${motivo.trim().slice(0, MAX_MOTIVO_ADIAMENTO)}`;
}
