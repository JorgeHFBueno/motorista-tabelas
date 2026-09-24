import type { CivilDate, ZoomCronograma } from './models';
import { yearDays, weeklyHeader } from './temporal';

export function calculateCenteredScrollLeft(todayX: number, viewportWidth: number, scrollWidth: number): number {
  return Math.max(0, Math.min(todayX - viewportWidth / 2, Math.max(0, scrollWidth - viewportWidth)));
}

export function timelineDateRatio(zoom: ZoomCronograma, date: CivilDate, year = 2026): number | null {
  if (!date.startsWith(`${year}-`)) return null;
  if (zoom === 'week') {
    const first = weeklyHeader(year)[0];
    const totalDays = weeklyHeader(year).length * 7;
    const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86400000);
    return Math.max(0, Math.min(1, (offset + .5) / totalDays));
  }
  const days = yearDays(year);
  const index = days.indexOf(date);
  return index < 0 ? null : (index + .5) / days.length;
}

export function scrollTimelineToToday(container: HTMLElement, zoom: ZoomCronograma, today: CivilDate, year = 2026): boolean {
  if (zoom === 'year') return false;
  const ratio = timelineDateRatio(zoom, today, year);
  const timeline = container.querySelector<HTMLElement>('.co-timeline-header');
  if (ratio === null || !timeline) return false;
  const todayX = timeline.offsetLeft + timeline.offsetWidth * ratio;
  container.scrollLeft = calculateCenteredScrollLeft(todayX, container.clientWidth, container.scrollWidth);
  return true;
}
