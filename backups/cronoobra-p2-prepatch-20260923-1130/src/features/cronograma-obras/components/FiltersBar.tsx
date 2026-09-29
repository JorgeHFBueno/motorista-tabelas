import CloseRounded from '@mui/icons-material/CloseRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import TodayRounded from '@mui/icons-material/TodayRounded';
import type { CronogramaFilters } from '../domain/models';

interface Props {
  filters: CronogramaFilters;
  statuses: string[];
  companies: string[];
  masters: string[];
  onChange: (next: CronogramaFilters) => void;
  onToday: () => void;
}

export function FiltersBar({ filters, statuses, companies, masters, onChange, onToday }: Props) {
  const set = (key: keyof CronogramaFilters, value: string) => onChange({ ...filters, [key]: value });
  const clear = () => onChange({ search: '', status: '', empresa: '', mestre: '', period: 'year' });
  return (
    <div className="co-filters" aria-label="Filtros do cronograma">
      <label className="co-search"><SearchRounded fontSize="small" /><span className="co-sr-only">Buscar</span><input value={filters.search} onChange={(event) => set('search', event.target.value)} placeholder="Buscar obra, contrato ou mestre" /></label>
      <label><span>Status</span><select value={filters.status} onChange={(event) => set('status', event.target.value)}><option value="">Todos</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>Empresa</span><select value={filters.empresa} onChange={(event) => set('empresa', event.target.value)}><option value="">Todas</option>{companies.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>Mestre</span><select value={filters.mestre} onChange={(event) => set('mestre', event.target.value)}><option value="">Todos</option>{masters.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>Período</span><select value={filters.period} onChange={(event) => set('period', event.target.value)}><option value="year">Ano inteiro</option><option value="0-11">Jan–Mar</option><option value="12-23">Abr–Jun</option><option value="24-35">Jul–Set</option><option value="36-47">Out–Dez</option></select></label>
      <button className="co-button co-button--secondary" type="button" onClick={onToday}><TodayRounded fontSize="small" />Hoje</button>
      <button className="co-button co-button--ghost" type="button" onClick={clear}><CloseRounded fontSize="small" />Limpar</button>
    </div>
  );
}

