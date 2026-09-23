import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import type { MestreWorkload } from '../domain/models';

export function WorkloadPanel({ workloads }: { workloads: MestreWorkload[] }) {
  return (
    <details className="co-workload" open>
      <summary><span><strong>Carga dos Mestres</strong><small>Leitura consolidada do mesmo cronograma</small></span><span className="co-workload-legend"><i className="is-free" />Livre <i className="is-busy" />Ocupado <i className="is-over" />Conflito</span><ExpandMoreRounded /></summary>
      <div className="co-workload-table">
        <div className="co-workload-head"><span>Mestre</span><span>Semanas ocupadas</span><span>Obras</span><span>Conflitos</span><span>Disponibilidade</span><span>Jan–Dez</span></div>
        {workloads.map((item) => <div className="co-workload-row" key={item.mestre}><strong>{item.mestre}</strong><span>{item.occupiedWeeks} / 48</span><span>{item.obras.length}</span><span className={item.conflictWeeks ? 'co-invalid-value' : ''}>{item.conflictWeeks}</span><span>{item.freeWeeks} semanas livres</span><div className="co-mini-heatmap" aria-label={`Carga semanal de ${item.mestre}`}>{item.weekly.map((week) => <i key={week.weekIndex} className={week.conflict ? 'is-over' : week.obras.length ? 'is-busy' : 'is-free'} title={`S${week.weekIndex + 1}: ${week.obras.length ? week.obras.map((obra) => obra.local).join(', ') : 'livre'}`} />)}</div></div>)}
      </div>
    </details>
  );
}

