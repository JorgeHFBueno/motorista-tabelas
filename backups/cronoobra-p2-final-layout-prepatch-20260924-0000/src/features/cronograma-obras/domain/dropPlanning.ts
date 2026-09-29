import type { CivilDate, ObraCronograma, ZoomCronograma } from './models';
import { addDays, calculatedEnd, monthDays, weekStart } from './temporal';

export interface DropPlanningInterval { inicio: CivilDate; tempoPlanejado: number; }

/** Returns the exact civil-date intersection of an obra and its drop bucket. */
export function getDropPlanningInterval({ obra, zoom, targetDateOrPeriod }: { obra: ObraCronograma; zoom: ZoomCronograma; targetDateOrPeriod: CivilDate }): DropPlanningInterval | null {
  const bucketStart = zoom === 'week' ? weekStart(targetDateOrPeriod) : zoom === 'month' ? `${targetDateOrPeriod.slice(0, 7)}-01` : targetDateOrPeriod;
  const bucketDays = zoom === 'week' ? 7 : zoom === 'month' ? monthDays(bucketStart) : 1;
  const start = obra.inicioPlanejado > bucketStart ? obra.inicioPlanejado : bucketStart;
  const end = calculatedEnd(obra.inicioPlanejado, obra.tempoPlanejado) < addDays(bucketStart, bucketDays - 1) ? calculatedEnd(obra.inicioPlanejado, obra.tempoPlanejado) : addDays(bucketStart, bucketDays - 1);
  return start <= end ? { inicio: start, tempoPlanejado: Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1 } : null;
}
