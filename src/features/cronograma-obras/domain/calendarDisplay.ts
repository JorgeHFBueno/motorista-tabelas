import type { ObraTemporalSegmentType } from './obraTemporal';

export interface CalendarDisplayOptions { liveAlerts: boolean; masterNames: boolean; }
export const DEFAULT_CALENDAR_DISPLAY: CalendarDisplayOptions = { liveAlerts: true, masterNames: true };

export function visibleTemporalState(state: ObraTemporalSegmentType | null, liveAlerts: boolean): ObraTemporalSegmentType | null {
  return !liveAlerts && (state === 'overdue' || state === 'attention') ? null : state;
}

export function masterNameContent(name: string, showNames: boolean): string | null {
  return showNames ? name : null;
}
