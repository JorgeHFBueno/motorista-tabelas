import type { ObraCronograma } from './models';
import { calculatedEnd, countIntersection, yearDays } from './temporal';

function intervalYears(start: string, days: number): number[] {
  const first = Number(start.slice(0, 4));
  const last = Number(calculatedEnd(start, days).slice(0, 4));
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function planningYears(obras: readonly ObraCronograma[], currentYear: number): number[] {
  const relevant = new Set<number>([currentYear]);
  obras.forEach((obra) => {
    intervalYears(obra.inicioPlanejado, obra.tempoPlanejado).forEach((year) => relevant.add(year));
    obra.mestresPlanejados.forEach((mestre) => intervalYears(mestre.inicio, mestre.tempoPlanejado).forEach((year) => relevant.add(year)));
  });
  const ordered = [...relevant].sort((a, b) => a - b);
  if (ordered.length === 1) return [ordered[0] - 1, ordered[0], ordered[0] + 1];
  return Array.from({ length: ordered.at(-1)! - ordered[0] + 1 }, (_, index) => ordered[0] + index);
}

export function yearBucket(year: number) {
  return { start: `${year}-01-01`, days: yearDays(year).length };
}

export function plannedDaysInYear(obra: Pick<ObraCronograma, 'inicioPlanejado' | 'tempoPlanejado'>, year: number): number {
  const bucket = yearBucket(year);
  return countIntersection(obra.inicioPlanejado, obra.tempoPlanejado, bucket.start, bucket.days);
}
