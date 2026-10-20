import type { CivilDate, MestrePlanejado, ObraCronograma } from './models';
import { addDays, calculatedEnd, todayCivil } from './temporal';
import { diffDays, situacaoPorDias } from '../../prazos-contratuais/domain/prazos';

/** Linha de Base: mesmas faixas de Prazos Contratuais; forte = decorrido, claro = a decorrer. */
export type ObraTemporalSegmentType = 'vencido' | `${'critico' | 'atencao' | 'folgado'}-${'decorrido' | 'a-decorrer'}`;
export interface ObraTemporalSegment { type: ObraTemporalSegmentType; inicio: CivilDate; fim: CivilDate; }
export function isFinalizedStatus(status: string): boolean { const value = status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase(); return value === 'FINALIZADA' || value === 'FINALIZADO'; }
export function getObraEndDate(obra: Pick<ObraCronograma, 'inicioPlanejado' | 'tempoPlanejado'>): CivilDate | null { return obra.inicioPlanejado && obra.tempoPlanejado ? calculatedEnd(obra.inicioPlanejado, obra.tempoPlanejado) : null; }
export function isObraOverdue(obra: Pick<ObraCronograma, 'inicioPlanejado' | 'tempoPlanejado' | 'status'>, hoje = todayCivil()): boolean { const end = getObraEndDate(obra); return Boolean(end && !isFinalizedStatus(obra.status) && hoje > end); }
export function getMastersForDate(mestres: readonly MestrePlanejado[] | undefined, dia: CivilDate): MestrePlanejado[] { return (mestres ?? []).filter((mestre) => dia >= mestre.inicio && dia <= calculatedEnd(mestre.inicio, mestre.tempoPlanejado)); }
/** Only the contract period is coloured, by its days remaining (Fim − hoje); LOTE status does not change it. */
export function getTemporalStateForDate(obra: ObraCronograma, dia: CivilDate, hoje = todayCivil()): ObraTemporalSegmentType | null {
  if (obra.allocationAllowed === false || !obra.inicioPlanejado || !obra.tempoPlanejado) return null;
  const fim = getObraEndDate(obra)!;
  if (dia < obra.inicioPlanejado || dia > fim) return null;
  const situacao = situacaoPorDias(diffDays(fim, hoje));
  return situacao === 'vencido' ? situacao : `${situacao}-${dia <= hoje ? 'decorrido' : 'a-decorrer'}`;
}
/** Visual-only segments, built day-by-day to retain state precedence at all zooms. */
export function getObraTemporalSegments(obra: ObraCronograma & { hoje?: CivilDate }, hoje = obra.hoje ?? todayCivil()): ObraTemporalSegment[] {
  if (obra.allocationAllowed === false || !obra.inicioPlanejado || !obra.tempoPlanejado) return [];
  const end = getObraEndDate(obra)!; const result: ObraTemporalSegment[] = [];
  for (let dia = obra.inicioPlanejado; dia <= end; dia = addDays(dia, 1)) { const type = getTemporalStateForDate(obra, dia, hoje); const previous = result.at(-1); if (type && previous?.type === type && addDays(previous.fim, 1) === dia) previous.fim = dia; else if (type) result.push({ type, inicio: dia, fim: dia }); }
  return result;
}
export function getTemporalSegmentsInBucket(segments: ObraTemporalSegment[], bucketInicio: CivilDate, bucketDays: number): ObraTemporalSegment[] { const bucketFim = addDays(bucketInicio, bucketDays - 1); return segments.flatMap((segment) => { const inicio = segment.inicio > bucketInicio ? segment.inicio : bucketInicio; const fim = segment.fim < bucketFim ? segment.fim : bucketFim; return inicio <= fim ? [{ ...segment, inicio, fim }] : []; }); }
