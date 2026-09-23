import type { CivilDate } from './models';
import { addDays, calculatedEnd, todayCivil } from './temporal';

export type ObraTemporalSegmentType = 'planned' | 'overdue' | 'attention';
export interface ObraTemporalSegment { type: ObraTemporalSegmentType; inicio: CivilDate; fim: CivilDate; }
export function isFinalizedStatus(status: string): boolean { return status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase() === 'FINALIZADA' || status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase() === 'FINALIZADO'; }
/** Visual-only status: it never changes the obra dates or its planned duration. */
export function getObraTemporalSegments({ inicioPlanejado, tempoPlanejado, status, hoje = todayCivil() }: { inicioPlanejado: CivilDate; tempoPlanejado: number; status: string; hoje?: CivilDate }): ObraTemporalSegment[] {
  const fimPlanejado = calculatedEnd(inicioPlanejado, tempoPlanejado);
  if (isFinalizedStatus(status) || hoje <= fimPlanejado) return [{ type: 'planned', inicio: inicioPlanejado, fim: fimPlanejado }];
  return [{ type: 'overdue', inicio: inicioPlanejado, fim: hoje }, { type: 'attention', inicio: addDays(hoje, 1), fim: addDays(hoje, 14) }];
}
export function getTemporalSegmentsInBucket(segments: ObraTemporalSegment[], bucketInicio: CivilDate, bucketDays: number): ObraTemporalSegment[] { const bucketFim = addDays(bucketInicio, bucketDays - 1); return segments.flatMap((segment) => { const inicio = segment.inicio > bucketInicio ? segment.inicio : bucketInicio; const fim = segment.fim < bucketFim ? segment.fim : bucketFim; return inicio <= fim ? [{ ...segment, inicio, fim }] : []; }); }
