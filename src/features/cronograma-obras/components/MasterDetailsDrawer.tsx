import CloseRounded from '@mui/icons-material/CloseRounded';
import { Drawer, IconButton } from '@mui/material';
import type { ObraCronograma } from '../domain/models';
import { allocationWarnings, masterOtherObras, masterPeriodsForObra } from '../domain/masterPlanningDetails';
import { formatDateShort } from '../domain/temporal';
import { getMestreColor } from '../domain/mestres';
import { StatusBadge } from './StatusBadge';

const range = (inicio: string, fim: string, dias: number) => `${formatDateShort(inicio)} → ${formatDateShort(fim)} · ${dias} dias`;
export function MasterDetailsDrawer({ obra, obras, masterKey, allKeys, onClose }: { obra: ObraCronograma | null; obras: ObraCronograma[]; masterKey: string | null; allKeys: string[]; onClose: () => void }) {
  if (!obra || !masterKey) return null;
  const current = masterPeriodsForObra(obra).find((group) => group.key === masterKey);
  if (!current) return null;
  const color = getMestreColor(masterKey, allKeys);
  const others = masterOtherObras(obras, obra.id, masterKey);
  return <Drawer anchor="right" open onClose={onClose} slotProps={{ paper: { className: 'co-drawer co-drawer--wide' } }}><div className="co-drawer-header"><div><span className="co-eyebrow">Detalhes do mestre</span><h2><i className="co-master-swatch" style={{ background: color.background }} />{current.nome}</h2></div><IconButton onClick={onClose} aria-label="Fechar detalhes do mestre"><CloseRounded /></IconButton></div><div className="co-drawer-body"><section><h3>Obra atual</h3><strong className="co-current-work">{obra.nomeObra}</strong><StatusBadge status={obra.status} /><h4>Períodos alocados</h4><ul className="co-period-details">{current.periods.map((item) => <li key={item.localId}>{range(item.inicio, allocationWarnings(obra, item).end, item.tempoPlanejado)}</li>)}</ul></section><section><h3>Também está</h3>{others.length ? <div className="co-other-works">{others.map(({ obra: other, periods }) => <article key={other.id}><strong>{other.nomeObra}</strong>{periods.map((item) => <span key={item.localId}>{range(item.inicio, allocationWarnings(other, item).end, item.tempoPlanejado)}</span>)}</article>)}</div> : <p className="co-muted">Nenhuma outra obra planejada.</p>}</section></div></Drawer>;
}
