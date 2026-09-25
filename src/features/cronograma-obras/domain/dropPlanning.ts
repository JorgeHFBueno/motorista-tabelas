import type { CivilDate, ObraCronograma, ZoomCronograma } from './models';
import { addDays, calculatedEnd, monthDays, weekStart } from './temporal';
import { getObraEndDate, isFinalizedStatus, isObraOverdue } from './obraTemporal';

export interface DropPlanningInterval { inicio: CivilDate; tempoPlanejado: number; }

export function getMasterPlanningEnd(inicio: CivilDate, tempoPlanejado: number): CivilDate { return calculatedEnd(inicio, tempoPlanejado); }
export function getPlanningOverrunDays(obra: Pick<ObraCronograma, 'inicioPlanejado' | 'tempoPlanejado'>, inicio: CivilDate, dias: number): number { const fim = getMasterPlanningEnd(inicio, dias); const previsto = getObraEndDate(obra); return fim > previsto ? Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${previsto}T00:00:00Z`)) / 86400000) : 0; }
export function isValidMasterDropStart(obra: ObraCronograma, inicio: CivilDate, hoje?: CivilDate): boolean { return !isFinalizedStatus(obra.status) && (isObraOverdue(obra, hoje) || inicio <= getObraEndDate(obra)); }
/** Resolves one unambiguous start date from a visual bucket; it never creates a duration. */
export function getDropPlanningStart({ obra, zoom, targetDateOrPeriod, hoje }: { obra: ObraCronograma; zoom: ZoomCronograma; targetDateOrPeriod: CivilDate; hoje?: CivilDate }): CivilDate | null {
  if (zoom === 'year') return null;
  const bucketStart = zoom === 'week' ? weekStart(targetDateOrPeriod) : zoom === 'month' ? `${targetDateOrPeriod.slice(0, 7)}-01` : targetDateOrPeriod;
  const bucketDays = zoom === 'week' ? 7 : zoom === 'month' ? monthDays(bucketStart) : 1;
  const start = bucketStart;
  return start <= addDays(bucketStart, bucketDays - 1) && isValidMasterDropStart(obra, start, hoje) ? start : null;
}
/**
 * Direct palette drops always allocate the calendar week containing the target
 * (Monday through Sunday). It may begin before the obra and may extend after
 * it; those conditions are informational rather than blocking.
 */
export function getDirectMasterDropInterval({ obra, targetDate, hoje }: { obra: ObraCronograma; targetDate: CivilDate; hoje: CivilDate }): DropPlanningInterval | null {
  const week = weekStart(targetDate);
  if (isFinalizedStatus(obra.status)) return null;
  return { inicio: week, tempoPlanejado: 7 };
}
/** Legacy export kept for existing integrations; tempo 0 expressly means confirmation is still required. */
export function getDropPlanningInterval({ obra, zoom, targetDateOrPeriod }: { obra: ObraCronograma; zoom: ZoomCronograma; targetDateOrPeriod: CivilDate }): DropPlanningInterval | null { if (zoom === 'year' || isFinalizedStatus(obra.status)) return null; const inicio = zoom === 'week' ? weekStart(targetDateOrPeriod) : zoom === 'month' ? `${targetDateOrPeriod.slice(0, 7)}-01` : targetDateOrPeriod; const tempoPlanejado = zoom === 'week' ? 7 : zoom === 'month' ? monthDays(inicio) : 1; return { inicio, tempoPlanejado }; }
