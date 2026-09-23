import EngineeringRounded from '@mui/icons-material/EngineeringRounded';
import { useMemo, useState } from 'react';
import { FiltersBar } from './components/FiltersBar';
import { GanttGrid } from './components/GanttGrid';
import { ObraDrawer } from './components/ObraDrawer';
import { WorkloadPanel } from './components/WorkloadPanel';
import { buildWorkloads, CRONOGRAMA_2026, filterObras, knownMasters, todayPosition } from './domain/cronograma';
import type { CronogramaFilters, ObraCronograma } from './domain/models';
import './styles/cronograma-obras.css';

const INITIAL_FILTERS: CronogramaFilters = { search: '', status: '', empresa: '', mestre: '', period: 'year' };

export default function CronogramaObrasPage() {
  const [view, setView] = useState<'obras' | 'mestres'>('obras');
  const [zoom, setZoom] = useState<'compact' | 'week' | 'month'>('week');
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [selected, setSelected] = useState<ObraCronograma | null>(null);
  const filtered = useMemo(() => filterObras(CRONOGRAMA_2026, filters), [filters]);
  const workloads = useMemo(() => buildWorkloads(filtered), [filtered]);
  const allWorkloads = useMemo(() => buildWorkloads(CRONOGRAMA_2026), []);
  const masters = useMemo(knownMasters, []);
  const indicators = useMemo(() => ({
    running: filtered.filter((obra) => obra.status === 'EM ANDAMENTO').length,
    waiting: filtered.filter((obra) => obra.status === 'AGUARDANDO RECURSO').length,
    allocated: new Set(filtered.flatMap((obra) => obra.mestre ? [obra.mestre] : [])).size,
    unassigned: filtered.filter((obra) => !obra.mestre).length,
    conflicts: buildWorkloads(filtered).reduce((sum, item) => sum + item.conflictWeeks, 0),
  }), [filtered]);
  const today = todayPosition();

  const goToday = () => {
    const scroll = document.querySelector<HTMLElement>('.co-gantt-scroll');
    if (!scroll || today === null) return;
    const width = zoom === 'compact' ? 30 : zoom === 'month' ? 22 : 44;
    scroll.scrollTo({ left: Math.max(0, 760 + today * width - scroll.clientWidth / 2), behavior: 'smooth' });
  };

  return (
    <main className={`co-page co-zoom--${zoom}`}>
      <header className="co-page-header">
        <div className="co-title"><span className="co-title-icon"><EngineeringRounded /></span><div><div className="co-title-line"><h1>Cronograma de Obras</h1><span className="co-prototype">Protótipo · dados locais</span></div><p>Planejamento e alocação de Mestres de Obras</p></div></div>
        <div className="co-view-switch" role="group" aria-label="Perspectiva principal"><button type="button" className={view === 'obras' ? 'is-active' : ''} onClick={() => setView('obras')}>Obras</button><button type="button" className={view === 'mestres' ? 'is-active' : ''} onClick={() => setView('mestres')}>Mestres</button></div>
      </header>

      <FiltersBar filters={filters} statuses={[...new Set(CRONOGRAMA_2026.map((obra) => obra.status))]} companies={[...new Set(CRONOGRAMA_2026.map((obra) => obra.empresa))]} masters={masters} onChange={setFilters} onToday={goToday} />

      <section className="co-indicators" aria-label="Indicadores do cronograma">
        <div><span>Em andamento</span><strong>{indicators.running}</strong></div><div><span>Aguardando recurso</span><strong>{indicators.waiting}</strong></div><div><span>Mestres alocados</span><strong>{indicators.allocated}</strong></div><div><span>Obras sem mestre</span><strong>{indicators.unassigned}</strong></div><div className={indicators.conflicts ? 'has-alert' : ''}><span>Conflitos de alocação</span><strong>{indicators.conflicts}</strong></div>
        <div className="co-zoom" role="group" aria-label="Zoom da timeline"><span>Zoom</span><button className={zoom === 'compact' ? 'is-active' : ''} onClick={() => setZoom('compact')}>Compacto</button><button className={zoom === 'week' ? 'is-active' : ''} onClick={() => setZoom('week')}>Semanas</button><button className={zoom === 'month' ? 'is-active' : ''} onClick={() => setZoom('month')}>Meses</button></div>
      </section>

      <div className="co-section-heading"><div><h2>{view === 'obras' ? 'Plano anual de obras' : 'Disponibilidade por mestre'}</h2><p>{view === 'obras' ? `${filtered.length} obras · clique em uma linha para ver detalhes` : `${workloads.length} mestres · sobreposições destacadas por semana`}</p></div><span>2026 · 48 semanas de planejamento</span></div>
      <GanttGrid view={view} obras={filtered} workloads={workloads} selectedId={selected?.id ?? null} today={today} onSelect={setSelected} />
      <WorkloadPanel workloads={filters.search || filters.status || filters.empresa || filters.mestre || filters.period !== 'year' ? workloads : allWorkloads} />
      <ObraDrawer obra={selected} onClose={() => setSelected(null)} />
    </main>
  );
}

