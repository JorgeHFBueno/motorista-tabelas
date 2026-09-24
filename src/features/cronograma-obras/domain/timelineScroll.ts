import type { CivilDate, ZoomCronograma } from './models';
import { yearDays, weeklyHeader } from './temporal';

export function calculateCenteredScrollLeft(todayX: number, viewportWidth: number, scrollWidth: number): number {
  return Math.max(0, Math.min(todayX - viewportWidth / 2, Math.max(0, scrollWidth - viewportWidth)));
}

export function calculateTimelineCenteredScrollLeft(targetX: number, usefulViewportWidth: number, scrollWidth: number, clientWidth: number): number {
  return Math.max(0, Math.min(targetX - usefulViewportWidth / 2, Math.max(0, scrollWidth - clientWidth)));
}

export function timelineDateRatio(zoom: ZoomCronograma, date: CivilDate, year = 2026): number | null {
  if (!date.startsWith(`${year}-`)) return null;
  if (zoom === 'week') {
    const weeks = weeklyHeader(year);
    const index = weeks.findIndex((start, position) => date >= start && (position === weeks.length - 1 || date < weeks[position + 1]));
    return index < 0 ? null : (index + .5) / weeks.length;
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
  const usefulViewportWidth = Math.max(0, container.clientWidth - timeline.offsetLeft);
  const todayX = timeline.offsetWidth * ratio;
  container.scrollLeft = calculateTimelineCenteredScrollLeft(todayX, usefulViewportWidth, container.scrollWidth, container.clientWidth);
  return true;
}
