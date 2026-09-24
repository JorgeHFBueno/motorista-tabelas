import type { CivilDate, ObraCronograma, ZoomCronograma } from './models';
import { addDays, calculatedEnd, monthDays, weekStart } from './temporal';
import { getObraEndDate, isFinalizedStatus, isObraOverdue } from './obraTemporal';

export interface DropPlanningInterval { inicio: CivilDate; tempoPlanejado: number; }

export function getMasterPlanningEnd(inicio: CivilDate, tempoPlanejado: number): CivilDate { return calculatedEnd(inicio, tempoPlanejado); }
export function getPlanningOverrunDays(obra: Pick<ObraCronograma, 'inicioPlanejado' | 'tempoPlanejado'>, inicio: CivilDate, dias: number): number { const fim = getMasterPlanningEnd(inicio, dias); const previsto = getObraEndDate(obra); return fim > previsto ? Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${previsto}T00:00:00Z`)) / 86400000) : 0; }
export function isValidMasterDropStart(obra: ObraCronograma, inicio: CivilDate, hoje?: CivilDate): boolean { return !isFinalizedStatus(obra.status) && inicio >= obra.inicioPlanejado && (isObraOverdue(obra, hoje) || inicio <= getObraEndDate(obra)); }
/** Resolves one unambiguous start date from a visual bucket; it never creates a duration. */
export function getDropPlanningStart({ obra, zoom, targetDateOrPeriod, hoje }: { obra: ObraCronograma; zoom: ZoomCronograma; targetDateOrPeriod: CivilDate; hoje?: CivilDate }): CivilDate | null {
  const bucketStart = zoom === 'week' ? weekStart(targetDateOrPeriod) : zoom === 'month' ? `${targetDateOrPeriod.slice(0, 7)}-01` : targetDateOrPeriod;
  const bucketDays = zoom === 'week' ? 7 : zoom === 'month' ? monthDays(bucketStart) : 1;
  const start = obra.inicioPlanejado > bucketStart ? obra.inicioPlanejado : bucketStart;
  return start <= addDays(bucketStart, bucketDays - 1) && isValidMasterDropStart(obra, start, hoje) ? start : null;
}
/** Legacy export kept for existing integrations; tempo 0 expressly means confirmation is still required. */
export function getDropPlanningInterval({ obra, zoom, targetDateOrPeriod }: { obra: ObraCronograma; zoom: ZoomCronograma; targetDateOrPeriod: CivilDate }): DropPlanningInterval | null { const bucketStart = zoom === 'week' ? weekStart(targetDateOrPeriod) : zoom === 'month' ? `${targetDateOrPeriod.slice(0, 7)}-01` : targetDateOrPeriod; const bucketDays = zoom === 'week' ? 7 : zoom === 'month' ? monthDays(bucketStart) : 1; const inicio = obra.inicioPlanejado > bucketStart ? obra.inicioPlanejado : bucketStart; const fimBucket = addDays(bucketStart, bucketDays - 1); const fim = getObraEndDate(obra) < fimBucket ? getObraEndDate(obra) : fimBucket; return inicio <= fim ? { inicio, tempoPlanejado: Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000) + 1 } : null; }
