import EngineeringRounded from '@mui/icons-material/EngineeringRounded';
import FilterListRounded from '@mui/icons-material/FilterListRounded';
import { useMemo, useState } from 'react';
import { addMestrePlanejadoLocal, updateObraLocal } from './application/localPlanner';
import { CalendarToggles, type CalendarDisplayOptions } from './components/CalendarToggles';
import { FiltersBar } from './components/FiltersBar';
import { GanttGrid } from './components/GanttGrid';
import { MasterPalette } from './components/MasterPalette';
import { MasterPlanningDialog } from './components/MasterPlanningDialog';
import { ObraDrawer } from './components/ObraDrawer';
import { WorkloadPanel } from './components/WorkloadPanel';
import { FixtureCronogramaDataSource } from './data/fixtures/fixtureCronogramaDataSource';
import { allMasters, buildWorkloads, calculateIndicators, filterObras } from './domain/cronograma';
import { getDropPlanningStart } from './domain/dropPlanning';
import { DEFAULT_CALENDAR_DISPLAY } from './domain/calendarDisplay';
import { planningYears } from './domain/calendarYears';
import { normalizeMestreKey } from './domain/mestres';
import type { CivilDate, CronogramaFilters, ObraCronograma, ZoomCronograma } from './domain/models';
import { todayCivil } from './domain/temporal';
import './styles/cronograma-obras.css';

const source = new FixtureCronogramaDataSource();
const INITIAL_FILTERS: CronogramaFilters = { search: '', status: '', empresa: '', mestre: '', period: 'year' };

export default function CronogramaObrasPage() {
  const [view, setView] = useState<'obras' | 'mestres'>('obras');
  const [zoom, setZoomState] = useState<ZoomCronograma>('week');
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [display, setDisplay] = useState<CalendarDisplayOptions>(DEFAULT_CALENDAR_DISPLAY);
  const [centerRequest, setCenterRequest] = useState(1);
  const [obras, setObras] = useState<ObraCronograma[]>(() => source.listarItensCronograma());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingMaster, setDraggingMaster] = useState<string | null>(null);
  const [pending, setPending] = useState<{ obra: ObraCronograma; mestre: string; inicio: CivilDate } | null>(null);
  const masters = useMemo(() => allMasters(obras, source.listarMestres()), [obras]);
  const filtered = useMemo(() => filterObras(obras, filters), [obras, filters]);
  const workloads = useMemo(() => buildWorkloads(filtered), [filtered]);
  const indicators = useMemo(() => calculateIndicators(filtered), [filtered]);
  const years = useMemo(() => planningYears(obras, Number(todayCivil().slice(0, 4))), [obras]);
  const selected = obras.find((obra) => obra.id === selectedId) ?? null;

  const setZoom = (next: ZoomCronograma) => { setZoomState(next); setCenterRequest((request) => request + 1); };
  const goToday = () => { setFilters((current) => current.period === 'year' ? current : { ...current, period: 'year' }); setCenterRequest((request) => request + 1); };
  const save = (next: ObraCronograma) => setObras((current) => updateObraLocal(current, next));
  const dropMaster = (obra: ObraCronograma, mestre: string, target: string) => {
    if (zoom === 'year') return;
    const inicio = getDropPlanningStart({ obra, zoom, targetDateOrPeriod: target });
    if (inicio) setPending({ obra, mestre, inicio });
    setDraggingMaster(null);
  };

  return <main className={`co-page co-zoom--${zoom}`}>
    <header className="co-page-header"><div className="co-title"><span className="co-title-icon"><EngineeringRounded /></span><div><div className="co-title-line"><h1>Cronograma de Obras</h1><span className="co-prototype">Planejador local · MK2</span></div><p>Planejamento e alocação de Mestres de Obras</p></div></div><div className="co-header-actions"><button className={`co-button co-button--secondary co-filter-toggle ${filtersOpen ? 'is-active' : ''}`} type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><FilterListRounded fontSize="small" />Filtros</button><CalendarToggles options={display} onChange={setDisplay} /><div className="co-view-switch"><button type="button" className={view === 'obras' ? 'is-active' : ''} onClick={() => setView('obras')}>Obras</button><button type="button" className={view === 'mestres' ? 'is-active' : ''} onClick={() => setView('mestres')}>Mestres</button></div></div></header>
    {filtersOpen && <aside className="co-filters-panel"><FiltersBar filters={filters} statuses={[...new Set(obras.map((obra) => obra.status))]} companies={[...new Set(obras.map((obra) => obra.empresa))]} masters={masters} onChange={setFilters} onToday={goToday} /></aside>}
    <section className="co-indicators"><div><span>Em andamento</span><strong>{indicators.running}</strong></div><div><span>Aguardando recurso</span><strong>{indicators.waiting}</strong></div><div><span>Mestres alocados</span><strong>{indicators.allocated}</strong></div><div><span>Obras sem mestre planejado</span><strong>{indicators.unassigned}</strong></div><div className={indicators.conflicts ? 'has-alert' : ''}><span>Conflitos de alocação</span><strong>{indicators.conflicts}</strong></div><div className="co-zoom"><span>Zoom</span>{([['day', 'Dias'], ['week', 'Semanas'], ['month', 'Meses'], ['year', 'Ano']] as const).map(([value, label]) => <button type="button" key={value} className={zoom === value ? 'is-active' : ''} onClick={() => setZoom(value)}>{label}</button>)}</div></section>
    <MasterPalette masters={masters} draggingMaster={draggingMaster} disabled={zoom === 'year'} onDragStart={setDraggingMaster} onDragEnd={() => setDraggingMaster(null)} />
    <GanttGrid view={view} zoom={zoom} years={years} obras={filtered} workloads={workloads} selectedId={selectedId} draggingMaster={draggingMaster} display={display} centerRequest={centerRequest} onSelect={(obra) => setSelectedId(obra.id)} onDropMaster={dropMaster} />
    {view === 'mestres' && <WorkloadPanel workloads={workloads} />}
    <ObraDrawer obra={selected} masters={masters} onClose={() => setSelectedId(null)} onSave={save} />
    {pending && <MasterPlanningDialog obra={pending.obra} mestre={pending.mestre} inicio={pending.inicio} onClose={() => setPending(null)} onConfirm={(dias) => { setObras((current) => addMestrePlanejadoLocal(current, pending.obra.id, { localId: crypto.randomUUID(), mestreKey: normalizeMestreKey(pending.mestre), nome: pending.mestre, inicio: pending.inicio, tempoPlanejado: dias })); setPending(null); }} />}
  </main>;
}
