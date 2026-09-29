import { CRONOGRAMA_2026_RAW, QUINZENAS_2026_MESTRES } from '../data/cronograma2026.raw';
import { MONTHS, TOTAL_WEEKS, type CronogramaFilters, type DataQualityIssue, type MestreWorkload, type ObraCronograma, type RawCronogramaObra } from './models';

const CONTRACT_PATTERN = /^\d{1,3}\/\d{4}$/;
const MASTER_ALIASES: Record<string, string> = { RUDI: 'RUDIMAR', RUDIMAR: 'RUDI', ANTONIO: 'ANTÔNIO', 'ANTÔNIO': 'ANTONIO' };

function numberOrNull(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function assessDataQuality(raw: RawCronogramaObra): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const progress = raw.progresso ? Number(raw.progresso.replace('%', '').replace(',', '.')) : null;
  if (!raw.mestre) issues.push({ code: 'MISSING_MASTER', message: 'Mestre não informado na fonte.', severity: 'warning' });
  if (!raw.prev) issues.push({ code: 'MISSING_PREV', message: 'Previsão não informada na fonte.', severity: 'info' });
  if (raw.progresso === null || !Number.isFinite(progress)) issues.push({ code: 'INVALID_PROGRESS', message: `Percentual ausente ou inválido${raw.progresso ? ` (${raw.progresso})` : ''}.`, severity: 'warning' });
  else if (progress > 100) issues.push({ code: 'PROGRESS_OVER_100', message: `Percentual acima de 100% (${raw.progresso}).`, severity: 'warning' });
  if (raw.contrato !== null && !CONTRACT_PATTERN.test(raw.contrato)) issues.push({ code: 'INVALID_CONTRACT', message: `Contrato mantido como veio da fonte (${raw.contrato}).`, severity: 'info' });
  if (raw.mestre && MASTER_ALIASES[raw.mestre]) issues.push({ code: 'POSSIBLE_MASTER_ALIAS', message: `Possível equivalência: ${raw.mestre} / ${MASTER_ALIASES[raw.mestre]}. Não normalizada.`, severity: 'info' });
  return issues;
}

export function normalizeObra(raw: RawCronogramaObra): ObraCronograma {
  const parsedProgress = raw.progresso ? Number(raw.progresso.replace('%', '').replace(',', '.')) : NaN;
  return {
    id: `cronograma-2026-r${raw.sourceRow}`,
    sourceRow: raw.sourceRow,
    local: raw.local,
    status: raw.status,
    contrato: raw.contrato,
    empresa: raw.empresa,
    mestre: raw.mestre,
    previsaoDias: numberOrNull(raw.prev),
    diasRealizados: numberOrNull(raw.dias),
    progressRaw: raw.progresso,
    progressPercent: Number.isFinite(parsedProgress) ? parsedProgress : null,
    descricao: raw.descricao,
    allocations: raw.allocations.map(([weekIndex, days]) => ({ weekIndex, monthIndex: Math.floor(weekIndex / 4), weekOfMonth: (weekIndex % 4) + 1, days })),
    issues: assessDataQuality(raw),
  };
}

export const CRONOGRAMA_2026 = CRONOGRAMA_2026_RAW.map(normalizeObra);

export function buildWorkloads(obras: ObraCronograma[]): MestreWorkload[] {
  const names = new Set(obras.flatMap((obra) => obra.mestre ? [obra.mestre] : []));
  return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((mestre) => {
    const masterWorks = obras.filter((obra) => obra.mestre === mestre);
    const weekly = Array.from({ length: TOTAL_WEEKS }, (_, weekIndex) => {
      const active = masterWorks.filter((obra) => obra.allocations.some((item) => item.weekIndex === weekIndex));
      const days = active.reduce((sum, obra) => sum + (obra.allocations.find((item) => item.weekIndex === weekIndex)?.days ?? 0), 0);
      return { weekIndex, days, obras: active, conflict: active.length > 1 };
    });
    const occupiedWeeks = weekly.filter((week) => week.obras.length > 0).length;
    return { mestre, obras: masterWorks, weekly, occupiedWeeks, freeWeeks: TOTAL_WEEKS - occupiedWeeks, conflictWeeks: weekly.filter((week) => week.conflict).length, loadPercent: Math.round((weekly.reduce((sum, week) => sum + Math.min(week.days, 7), 0) / (TOTAL_WEEKS * 7)) * 100) };
  });
}

export function consolidateAllocation(obra: ObraCronograma): string[] {
  const indexes = obra.allocations.map((item) => item.weekIndex).sort((a, b) => a - b);
  if (!indexes.length) return [];
  const ranges: Array<[number, number]> = [];
  let start = indexes[0];
  let end = indexes[0];
  for (const current of indexes.slice(1)) {
    if (current === end + 1) end = current;
    else { ranges.push([start, end]); start = current; end = current; }
  }
  ranges.push([start, end]);
  return ranges.flatMap(([rangeStart, rangeEnd]) => {
    const labels: string[] = [];
    let cursor = rangeStart;
    while (cursor <= rangeEnd) {
      const month = Math.floor(cursor / 4);
      const segmentEnd = Math.min(rangeEnd, month * 4 + 3);
      const firstWeek = (cursor % 4) + 1;
      const lastWeek = (segmentEnd % 4) + 1;
      labels.push(`${MONTHS[month]} · Sem ${firstWeek}${lastWeek > firstWeek ? `–${lastWeek}` : ''}`);
      cursor = segmentEnd + 1;
    }
    return labels;
  });
}

export function filterObras(obras: ObraCronograma[], filters: CronogramaFilters): ObraCronograma[] {
  const term = filters.search.trim().toLocaleLowerCase('pt-BR');
  const [periodStart, periodEnd] = filters.period === 'year' ? [0, TOTAL_WEEKS - 1] : filters.period.split('-').map(Number);
  return obras.filter((obra) => {
    const haystack = [obra.local, obra.mestre, obra.contrato, obra.empresa, obra.descricao].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
    return (!term || haystack.includes(term))
      && (!filters.status || obra.status === filters.status)
      && (!filters.empresa || obra.empresa === filters.empresa)
      && (!filters.mestre || obra.mestre === filters.mestre)
      && (filters.period === 'year' || obra.allocations.some((item) => item.weekIndex >= periodStart && item.weekIndex <= periodEnd));
  });
}

export function knownMasters(): string[] {
  return [...new Set([...CRONOGRAMA_2026.flatMap((obra) => obra.mestre ? [obra.mestre] : []), ...QUINZENAS_2026_MESTRES])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function todayPosition(now = new Date()): number | null {
  if (now.getFullYear() !== 2026) return null;
  const daysInMonth = new Date(2026, now.getMonth() + 1, 0).getDate();
  return now.getMonth() * 4 + ((now.getDate() - 1) / daysInMonth) * 4;
}
