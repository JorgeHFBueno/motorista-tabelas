import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { memo } from 'react';
import { TimelineHeader } from './TimelineHeader';
import { StatusBadge } from './StatusBadge';
import { TOTAL_WEEKS, type MestreWorkload, type ObraCronograma } from '../domain/models';

interface Props {
  view: 'obras' | 'mestres';
  obras: ObraCronograma[];
  workloads: MestreWorkload[];
  selectedId: string | null;
  today: number | null;
  onSelect: (obra: ObraCronograma) => void;
}

function colorIndex(name: string | null): number {
  if (!name) return 0;
  return [...name].reduce((value, char) => value + char.charCodeAt(0), 0) % 8;
}

function TodayLine({ position }: { position: number | null }) {
  if (position === null) return null;
  return <div className="co-today-track"><div className="co-today-line" style={{ left: `${(position / TOTAL_WEEKS) * 100}%` }}><span>Hoje</span></div></div>;
}

function ObraCells({ obra }: { obra: ObraCronograma }) {
  const byWeek = new Map(obra.allocations.map((item) => [item.weekIndex, item]));
  return <div className="co-week-cells">{Array.from({ length: TOTAL_WEEKS }, (_, index) => {
    const item = byWeek.get(index);
    const before = byWeek.has(index - 1);
    const after = byWeek.has(index + 1);
    return <div className="co-week-cell" key={index} title={item ? `${obra.local} · ${item.days} dia${item.days === 1 ? '' : 's'}` : undefined}>{item && <span className={`co-allocation co-color-${colorIndex(obra.mestre)} ${before ? 'is-connected-left' : ''} ${after ? 'is-connected-right' : ''}`} style={{ width: `${Math.max(18, item.days / 7 * 100)}%` }}>{item.days < 7 ? item.days : ''}</span>}</div>;
  })}</div>;
}

function MasterCells({ workload }: { workload: MestreWorkload }) {
  return <div className="co-week-cells">{workload.weekly.map((week) => <div className={`co-week-cell co-resource-cell ${week.conflict ? 'is-conflict' : ''}`} key={week.weekIndex} title={week.obras.length ? `${week.obras.map((obra) => obra.local).join(' + ')} · ${week.days} dias programados` : 'Livre'}>{week.obras.map((obra, position) => <span key={obra.id} className={`co-resource-block co-color-${colorIndex(obra.local)}`} style={{ '--stack': position, '--count': week.obras.length } as React.CSSProperties} />)}{week.conflict && <WarningAmberRounded className="co-conflict-icon" />}</div>)}</div>;
}

export const GanttGrid = memo(function GanttGrid({ view, obras, workloads, selectedId, today, onSelect }: Props) {
  const rows = view === 'obras' ? obras.length : workloads.length;
  return (
    <section className={`co-gantt co-gantt--${view}`} aria-label={view === 'obras' ? 'Cronograma anual por obra' : 'Carga anual por mestre'}>
      <div className="co-gantt-scroll">
        <div className="co-gantt-grid" style={{ '--row-count': rows } as React.CSSProperties}>
          <div className="co-left-header">{view === 'obras' ? <><span>Obra</span><span>Mestre</span><span>Status</span><span>Contrato</span><span>Emp.</span><span>Prev.</span><span>Dias</span><span>Progresso</span></> : <><span>Mestre</span><span>Obras</span><span>Carga</span><span>Livres</span><span>Conflitos</span></>}</div>
          <TimelineHeader />
          {view === 'obras' ? obras.map((obra) => <button type="button" className={`co-grid-row ${selectedId === obra.id ? 'is-selected' : ''}`} key={obra.id} onClick={() => onSelect(obra)}>
            <div className="co-left-row"><span className="co-work-name" title={obra.local}>{obra.local}{obra.issues.length > 0 && <span className="co-quality-dot" title={`${obra.issues.length} alerta(s) de qualidade`}>{obra.issues.length}</span>}</span><span>{obra.mestre ?? <em>Sem mestre</em>}</span><span><StatusBadge status={obra.status} /></span><span>{obra.contrato ?? '—'}</span><span>{obra.empresa}</span><span>{obra.previsaoDias ?? '—'}</span><span>{obra.diasRealizados ?? '—'}</span><span className={obra.progressPercent !== null && obra.progressPercent > 100 ? 'co-invalid-value' : ''}>{obra.progressRaw ?? '—'}</span></div>
            <ObraCells obra={obra} />
          </button>) : workloads.map((workload) => <div className="co-grid-row co-grid-row--resource" key={workload.mestre}>
            <div className="co-left-row"><span className="co-master-name"><i className={`co-master-swatch co-color-${colorIndex(workload.mestre)}`} />{workload.mestre}</span><span>{workload.obras.length}</span><span>{workload.loadPercent}%</span><span>{workload.freeWeeks} sem.</span><span className={workload.conflictWeeks ? 'co-invalid-value' : ''}>{workload.conflictWeeks}</span></div>
            <MasterCells workload={workload} />
          </div>)}
          <TodayLine position={today} />
        </div>
      </div>
      {!rows && <div className="co-empty">Nenhum resultado para os filtros selecionados.</div>}
    </section>
  );
});
