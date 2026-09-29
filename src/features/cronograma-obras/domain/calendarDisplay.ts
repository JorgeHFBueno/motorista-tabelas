import type { MestrePlanejado, ZoomCronograma } from './models';
import type { ObraTemporalSegmentType } from './obraTemporal';

export interface CalendarDisplayOptions { liveAlerts: boolean; masterNames: boolean; }
export const DEFAULT_CALENDAR_DISPLAY: CalendarDisplayOptions = { liveAlerts: false, masterNames: true };

export function visibleTemporalState(state: ObraTemporalSegmentType | null, liveAlerts: boolean): ObraTemporalSegmentType | null {
  return liveAlerts ? state : null;
}

const LABEL_HORIZONTAL_PADDING = 5;
const ESTIMATED_CHARACTER_WIDTH = 5;

export function masterNameContent(name: string, showNames: boolean, availableWidth = Number.POSITIVE_INFINITY, masterCount = 1, zoom: ZoomCronograma = 'day'): string | null {
  if (!showNames || masterCount !== 1 || zoom === 'year') return null;
  const fullWidth = name.length * ESTIMATED_CHARACTER_WIDTH + LABEL_HORIZONTAL_PADDING;
  if (availableWidth >= fullWidth) return name;
  const short = name.slice(0, 3).toLocaleUpperCase('pt-BR');
  return availableWidth >= short.length * ESTIMATED_CHARACTER_WIDTH + LABEL_HORIZONTAL_PADDING ? short : null;
}

export function mastersTooltip(masters: readonly MestrePlanejado[]): string | undefined {
  const names = [...new Set(masters.map((mestre) => mestre.nome).filter(Boolean))];
  return names.length ? `Mestres:\n${names.map((name) => `- ${name}`).join('\n')}` : undefined;
}
