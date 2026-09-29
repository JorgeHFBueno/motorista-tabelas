import type { CivilDate, ZoomCronograma } from './models';
import { addDays, weekStart, yearDays, weeklyHeader } from './temporal';

export function calculateCenteredScrollLeft(todayX: number, viewportWidth: number, scrollWidth: number): number {
  return Math.max(0, Math.min(todayX - viewportWidth / 2, Math.max(0, scrollWidth - viewportWidth)));
}

export function calculateTimelineCenteredScrollLeft(targetX: number, usefulViewportWidth: number, scrollWidth: number, clientWidth: number): number {
  return Math.max(0, Math.min(targetX - usefulViewportWidth / 2, Math.max(0, scrollWidth - clientWidth)));
}

export function calculateTimelineContextScrollLeft(zoom: ZoomCronograma, todayX: number, timelineWidth: number, usefulViewportWidth: number, scrollWidth: number, clientWidth: number, year = 2026, pastContextDays = 15): number {
  if (zoom === 'month') return calculateTimelineCenteredScrollLeft(todayX, usefulViewportWidth, scrollWidth, clientWidth);
  if (zoom === 'week') return clampTimelineScrollLeft(todayX, scrollWidth, clientWidth);
  const timelineDays = yearDays(year).length;
  const contextWidth = timelineWidth / timelineDays * pastContextDays;
  return clampTimelineScrollLeft(todayX - contextWidth, scrollWidth, clientWidth);
}

export function clampTimelineScrollLeft(scrollLeft: number, scrollWidth: number, clientWidth: number): number {
  return Math.max(0, Math.min(scrollLeft, Math.max(0, scrollWidth - clientWidth)));
}

export function weeklyContextStart(today: CivilDate, pastContextDays = 15): CivilDate {
  return addDays(today, -pastContextDays);
}

export function weeklyContextWeekStart(today: CivilDate, pastContextDays = 15): CivilDate {
  return weekStart(weeklyContextStart(today, pastContextDays));
}

export function weeklyContextWeekIndex(today: CivilDate, year = 2026, pastContextDays = 15): number | null {
  const index = weeklyHeader(year).indexOf(weeklyContextWeekStart(today, pastContextDays));
  return index < 0 ? null : index;
}

export function weeklyContextScrollLeft(today: CivilDate, timelineWidth: number, scrollWidth: number, clientWidth: number, year = 2026, pastContextDays = 15): number | null {
  const contextWeekIndex = weeklyContextWeekIndex(today, year, pastContextDays);
  return contextWeekIndex === null ? null : clampTimelineScrollLeft(timelineWidth * contextWeekIndex / weeklyHeader(year).length, scrollWidth, clientWidth);
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

export function scrollTimelineToToday(container: HTMLElement, { mode, today, year = 2026, pastContextDays = 15 }: { mode: ZoomCronograma; today: CivilDate; year?: number; pastContextDays?: number }): boolean {
  if (mode === 'year') return false;
  const timeline = container.querySelector<HTMLElement>('.co-timeline-header');
  if (!timeline) return false;
  if (mode === 'week') {
    const contextScrollLeft = weeklyContextScrollLeft(today, timeline.offsetWidth, container.scrollWidth, container.clientWidth, year, pastContextDays);
    if (contextScrollLeft === null) return false;
    container.scrollLeft = contextScrollLeft;
    return true;
  }
  const ratio = timelineDateRatio(mode, today, year);
  if (ratio === null) return false;
  const usefulViewportWidth = Math.max(0, container.clientWidth - timeline.offsetLeft);
  const todayX = timeline.offsetWidth * ratio;
  container.scrollLeft = calculateTimelineContextScrollLeft(mode, todayX, timeline.offsetWidth, usefulViewportWidth, container.scrollWidth, container.clientWidth, year, pastContextDays);
  return true;
}

export function scrollTimelineToDate(container: HTMLElement, { mode, date, year = 2026 }: { mode: ZoomCronograma; date: CivilDate; year?: number }): boolean {
  if (mode === 'year') return false;
  const timeline = container.querySelector<HTMLElement>('.co-timeline-header');
  const ratio = timeline ? timelineDateRatio(mode, date, year) : null;
  if (ratio === null || !timeline) return false;
  const usefulViewportWidth = Math.max(0, container.clientWidth - timeline.offsetLeft);
  container.scrollLeft = calculateTimelineCenteredScrollLeft(timeline.offsetWidth * ratio, usefulViewportWidth, container.scrollWidth, container.clientWidth);
  return true;
}
