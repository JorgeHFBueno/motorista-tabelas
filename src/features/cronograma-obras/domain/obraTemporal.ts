import type { CivilDate, MestrePlanejado, ObraCronograma } from './models';
import { addDays, calculatedEnd, todayCivil } from './temporal';

export type ObraTemporalSegmentType = 'planned' | 'mastered' | 'overdue' | 'attention';
export interface ObraTemporalSegment { type: ObraTemporalSegmentType; inicio: CivilDate; fim: CivilDate; }
export function isFinalizedStatus(status: string): boolean { const value = status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase(); return value === 'FINALIZADA' || value === 'FINALIZADO'; }
export function getObraEndDate(obra: Pick<ObraCronograma, 'inicioPlanejado' | 'tempoPlanejado'>): CivilDate { return calculatedEnd(obra.inicioPlanejado, obra.tempoPlanejado); }
export function isObraOverdue(obra: Pick<ObraCronograma, 'inicioPlanejado' | 'tempoPlanejado' | 'status'>, hoje = todayCivil()): boolean { return !isFinalizedStatus(obra.status) && hoje > getObraEndDate(obra); }
export function getMastersForDate(mestres: readonly MestrePlanejado[] | undefined, dia: CivilDate): MestrePlanejado[] { return (mestres ?? []).filter((mestre) => dia >= mestre.inicio && dia <= calculatedEnd(mestre.inicio, mestre.tempoPlanejado)); }
/** Precedence: master > original deadline > elapsed extension > future attention > empty. */
export function getTemporalStateForDate(obra: ObraCronograma, dia: CivilDate, hoje = todayCivil()): ObraTemporalSegmentType | null {
  if (getMastersForDate(obra.mestresPlanejados, dia).length) return 'mastered';
  const fim = getObraEndDate(obra);
  if (dia >= obra.inicioPlanejado && dia <= fim) return 'planned';
  if (!isFinalizedStatus(obra.status) && dia > fim) return dia <= hoje ? 'overdue' : dia <= addDays(hoje, 14) ? 'attention' : null;
  return null;
}
/** Visual-only segments, built day-by-day to retain state precedence at all zooms. */
export function getObraTemporalSegments(obra: ObraCronograma & { hoje?: CivilDate }, hoje = obra.hoje ?? todayCivil()): ObraTemporalSegment[] {
  const end = isFinalizedStatus(obra.status) ? getObraEndDate(obra) : addDays(hoje, 14); const result: ObraTemporalSegment[] = [];
  for (let dia = obra.inicioPlanejado; dia <= end; dia = addDays(dia, 1)) { const type = getTemporalStateForDate(obra, dia, hoje); const previous = result.at(-1); if (type && previous?.type === type && addDays(previous.fim, 1) === dia) previous.fim = dia; else if (type) result.push({ type, inicio: dia, fim: dia }); }
  return result;
}
export function getTemporalSegmentsInBucket(segments: ObraTemporalSegment[], bucketInicio: CivilDate, bucketDays: number): ObraTemporalSegment[] { const bucketFim = addDays(bucketInicio, bucketDays - 1); return segments.flatMap((segment) => { const inicio = segment.inicio > bucketInicio ? segment.inicio : bucketInicio; const fim = segment.fim < bucketFim ? segment.fim : bucketFim; return inicio <= fim ? [{ ...segment, inicio, fim }] : []; }); }
