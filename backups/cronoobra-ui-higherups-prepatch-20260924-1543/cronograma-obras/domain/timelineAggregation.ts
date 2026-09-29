import type { CivilDate, MestrePlanejado, ObraCronograma } from './models';
import { addDays, calculatedEnd, countIntersection, eachDay } from './temporal';
import { getMastersForDate, getTemporalStateForDate, type ObraTemporalSegmentType } from './obraTemporal';

export interface DailyTimelineItem { date: CivilDate; state: ObraTemporalSegmentType | null; masters: MestrePlanejado[]; }
export interface TimelineSegment { type: ObraTemporalSegmentType; offset: number; days: number; }
export interface MasterTimelineSegment { mestre: MestrePlanejado; offset: number; days: number; }
export interface BucketTimelineAggregate { days: number; plannedDays: number; states: TimelineSegment[]; masters: MasterTimelineSegment[]; }
export interface WeeklySegment { startDayIndex: number; dayCount: number; type: ObraTemporalSegmentType; }
export interface WeeklyMasterSegment { mestre: MestrePlanejado; startDayIndex: number; dayCount: number; }

/** Canonical visual source: each bucket is derived from the same daily state used by the Days view. */
export function getDailyTimeline(obra: ObraCronograma & { hoje?: CivilDate }, start: CivilDate, days: number, hoje?: CivilDate): DailyTimelineItem[] {
  return eachDay(start, days).map((date) => ({ date, state: getTemporalStateForDate(obra, date, hoje ?? obra.hoje), masters: getMastersForDate(obra.mestresPlanejados, date) }));
}

export function aggregateConsecutiveStates(days: readonly DailyTimelineItem[]): TimelineSegment[] {
  const result: TimelineSegment[] = [];
  days.forEach((day, offset) => { const previous = result.at(-1); if (day.state && previous?.type === day.state) previous.days += 1; else if (day.state) result.push({ type: day.state, offset, days: 1 }); });
  return result;
}

export function getMasterSegmentsInBucket(masters: readonly MestrePlanejado[], start: CivilDate, days: number): MasterTimelineSegment[] {
  const end = addDays(start, days - 1);
  return masters.flatMap((mestre) => { const inicio = mestre.inicio > start ? mestre.inicio : start; const fimMestre = calculatedEnd(mestre.inicio, mestre.tempoPlanejado); const fim = fimMestre < end ? fimMestre : end; if (inicio > fim) return []; return [{ mestre, offset: eachDay(start, days).indexOf(inicio), days: countIntersection(mestre.inicio, mestre.tempoPlanejado, start, days) }]; });
}

export function getBucketTimelineAggregate(obra: ObraCronograma & { hoje?: CivilDate }, start: CivilDate, days: number, hoje?: CivilDate): BucketTimelineAggregate {
  const daily = getDailyTimeline(obra, start, days, hoje);
  return { days, plannedDays: countIntersection(obra.inicioPlanejado, obra.tempoPlanejado, start, days), states: aggregateConsecutiveStates(daily), masters: getMasterSegmentsInBucket(obra.mestresPlanejados, start, days) };
}

/** A weekly cell owns a fixed internal seven-day coordinate system. */
export function getWeeklyTimeline(obra: ObraCronograma & { hoje?: CivilDate }, weekStart: CivilDate, hoje?: CivilDate): { plannedDays: number; states: WeeklySegment[]; masters: WeeklyMasterSegment[] } {
  const aggregate = getBucketTimelineAggregate(obra, weekStart, 7, hoje);
  return { plannedDays: aggregate.plannedDays, states: aggregate.states.map((segment) => ({ type: segment.type, startDayIndex: segment.offset, dayCount: segment.days })), masters: aggregate.masters.map((segment) => ({ mestre: segment.mestre, startDayIndex: segment.offset, dayCount: segment.days })) };
}
