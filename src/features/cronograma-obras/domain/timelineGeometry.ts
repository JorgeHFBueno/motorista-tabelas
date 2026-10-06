import type { CivilDate } from './models';
import { addDays } from './temporal';

export interface TimelineGeometry {
  start: CivilDate;
  days: number;
  left: number;
  width: number;
}

function horizontalIndex(clientX: number, left: number, width: number, count: number): number | null {
  if (width <= 0 || count <= 0) return null;
  return Math.min(count - 1, Math.max(0, Math.floor(((clientX - left) / width) * count)));
}

/**
 * Converts a horizontal point in the paint-only timeline into a calendar day.
 * The visual zoom only changes pixels per day; editing always remains daily.
 */
export function clientXToCalendarDay({ clientX, start, days, left, width }: TimelineGeometry & { clientX: number }): CivilDate | null {
  if (!start) return null;
  const dayOffset = horizontalIndex(clientX, left, width, days);
  if (dayOffset === null) return null;
  return addDays(start, dayOffset);
}

/** Converts a point to the first calendar day of a visual bucket (for DnD). */
export function clientXToTimelineBucket({ clientX, unitDays, ...geometry }: TimelineGeometry & { clientX: number; unitDays: number }): CivilDate | null {
  if (unitDays <= 0) return null;
  const bucketCount = Math.ceil(geometry.days / unitDays);
  const bucketIndex = horizontalIndex(clientX, geometry.left, geometry.width, bucketCount);
  return bucketIndex === null ? null : addDays(geometry.start, bucketIndex * unitDays);
}
