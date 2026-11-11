import CloseRounded from '@mui/icons-material/CloseRounded'; import SearchRounded from '@mui/icons-material/SearchRounded'; import type { CronogramaFilters } from '../domain/models';
import { loteStatusColor, LOTE_STATUS_OPTIONS } from '../../../services/loteStatusService';
interface Props { filters: CronogramaFilters; statuses: string[]; companies: string[]; masters: string[]; onChange: (next: CronogramaFilters) => void; }
const ORDEM_STATUS = LOTE_STATUS_OPTIONS.map((status) => status.label);
/** The 6 LOTE statuses first, in the Friday order; any other status (e.g. a contract's situação) after, alphabetically. */
const ordenarStatus = (statuses: string[]) => [...new Set(statuses)].filter(Boolean).sort((a, b) => { const ia = ORDEM_STATUS.indexOf(a); const ib = ORDEM_STATUS.indexOf(b); return (ia < 0 ? ORDEM_STATUS.length : ia) - (ib < 0 ? ORDEM_STATUS.length : ib) || a.localeCompare(b, 'pt-BR'); });
export function FiltersBar({ filters, statuses, companies, masters, onChange }: Props) {
  const set = (key: 'search' | 'empresa' | 'mestre', value: string) => onChange({ ...filters, [key]: value });
  const toggleStatus = (status: string) => onChange({ ...filters, status: filters.status.includes(status) ? filters.status.filter((item) => item !== status) : [...filters.status, status] });
  return <div className="co-filters" aria-label="Filtros do cronograma">
    <label className="co-search"><SearchRounded fontSize="small" /><input value={filters.search} onChange={(event) => set('search', event.target.value)} placeholder="Buscar obra, local ou mestre" /></label>
    <div className="co-status-filter" role="group" aria-label="Status (marque um ou mais; nenhum marcado mostra todos)"><span>Status</span><div className="co-status-chips">{ordenarStatus(statuses).map((status) => { const active = filters.status.includes(status); return <button key={status} type="button" className={`co-status-chip ${active ? 'is-active' : ''}`} aria-pressed={active} style={{ '--co-status-color': loteStatusColor(status) } as React.CSSProperties} onClick={() => toggleStatus(status)}><i aria-hidden="true" />{status}</button>; })}</div></div>
    <label><span>Empresa</span><select value={filters.empresa} onChange={(event) => set('empresa', event.target.value)}><option value="">Todas</option>{companies.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label><span>Mestre planejado</span><select value={filters.mestre} onChange={(event) => set('mestre', event.target.value)}><option value="">Todos</option>{masters.map((item) => <option key={item}>{item}</option>)}</select></label>
    <div className="co-filter-actions"><button className="co-button co-button--ghost" type="button" onClick={() => onChange({ search: '', status: [], empresa: '', mestre: '' })}><CloseRounded fontSize="small" />Limpar</button></div>
  </div>;
}
