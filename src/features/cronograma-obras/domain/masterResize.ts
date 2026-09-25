import type { CivilDate, MestrePlanejado, ObraCronograma } from './models';
import { calculatedEnd } from './temporal';

export type MasterResizeEdge = 'start' | 'end';

/** Civil-date resize; it never stores visual geometry or changes the obra plan. */
export function resizeMasterPlanning(obra: Pick<ObraCronograma, 'inicioPlanejado'>, mestre: MestrePlanejado, edge: MasterResizeEdge, targetDate: CivilDate): MestrePlanejado {
  const end = calculatedEnd(mestre.inicio, mestre.tempoPlanejado);
  if (edge === 'start') {
    const inicio = targetDate < obra.inicioPlanejado ? obra.inicioPlanejado : targetDate;
    const finalStart = inicio > end ? end : inicio;
    return { ...mestre, inicio: finalStart, tempoPlanejado: Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${finalStart}T00:00:00Z`)) / 86400000) + 1) };
  }
  const finalEnd = targetDate < mestre.inicio ? mestre.inicio : targetDate;
  return { ...mestre, tempoPlanejado: Math.max(1, Math.round((Date.parse(`${finalEnd}T00:00:00Z`) - Date.parse(`${mestre.inicio}T00:00:00Z`)) / 86400000) + 1) };
}
