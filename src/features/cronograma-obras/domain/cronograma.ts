import type { CronogramaFilters, CronogramaIndicators, MestreWorkload, ObraCronograma } from './models';
import { addDays, eachDay, intersectsRange, weeklyHeader, yearDays } from './temporal';

export function filterObras(obras: ObraCronograma[], filters: CronogramaFilters): ObraCronograma[] {
  const term = filters.search.trim().toLocaleLowerCase('pt-BR');
  return obras.filter((obra) => {
    const text = [obra.codObra, obra.siglaObra, obra.nomeObra, obra.local, obra.empresa, obra.mestreInicial, ...obra.mestresPlanejados.map((mestre) => mestre.nome), obra.descricao].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
    const [periodStart, periodTempo] = filters.period === 'year' ? ['2026-01-01', 365] : [filters.period.split('/')[0], Number(filters.period.split('/')[1])];
    return (!term || text.includes(term)) && (!filters.status || obra.status === filters.status) && (!filters.empresa || obra.empresa === filters.empresa) && (!filters.mestre || obra.mestresPlanejados.some((mestre) => mestre.nome === filters.mestre)) && intersectsRange(obra.inicioPlanejado, obra.tempoPlanejado, periodStart, periodTempo as number);
  });
}

export function allMasters(obras: ObraCronograma[], catalogMasters: string[] = []): string[] { return [...new Set([...catalogMasters, ...obras.flatMap((obra) => [obra.mestreInicial, ...obra.mestresPlanejados.map((mestre) => mestre.nome)].filter(Boolean) as string[])])].sort((a, b) => a.localeCompare(b, 'pt-BR')); }

export function buildWorkloads(obras: ObraCronograma[], year = 2026): MestreWorkload[] {
  const byMaster = new Map<string, ObraCronograma[]>();
  obras.forEach((obra) => obra.mestresPlanejados.forEach((item) => { if (item.nome && item.tempoPlanejado > 0) byMaster.set(item.nome, [...(byMaster.get(item.nome) ?? []), obra]); }));
  return [...byMaster.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([mestre, works]) => {
    const daily = yearDays(year).map((date) => {
      const active = [...new Map(obras.filter((obra) => obra.mestresPlanejados.some((item) => item.nome === mestre && intersectsRange(item.inicio, item.tempoPlanejado, date, 1))).map((obra) => [obra.id, obra])).values()];
      return { date, obras: active, conflict: active.length > 1 };
    });
    const weekly = weeklyHeader(year).map((start) => {
      const days = daily.filter((day) => day.date >= start && day.date <= addDays(start, 6));
      const active = [...new Map(days.flatMap((day) => day.obras).map((obra) => [obra.id, obra])).values()];
      return { start, days: days.filter((day) => day.obras.length).length, obras: active, conflict: days.some((day) => day.conflict) };
    });
    return { mestre, obras: [...new Map(works.map((obra) => [obra.id, obra])).values()], diasProgramados: daily.filter((day) => day.obras.length).length, freeDays: daily.filter((day) => !day.obras.length).length, conflictDays: daily.filter((day) => day.conflict).length, daily, weekly };
  });
}

export function calculateIndicators(obras: ObraCronograma[]): CronogramaIndicators { const workloads = buildWorkloads(obras); return { running: obras.filter((obra) => obra.status === 'EM ANDAMENTO').length, waiting: obras.filter((obra) => obra.status === 'AGUARDANDO RECURSO').length, allocated: workloads.length, unassigned: obras.filter((obra) => obra.mestresPlanejados.length === 0).length, conflicts: workloads.reduce((sum, item) => sum + item.conflictDays, 0) }; }
export function plannedDays(obra: ObraCronograma) { return eachDay(obra.inicioPlanejado, obra.tempoPlanejado); }
