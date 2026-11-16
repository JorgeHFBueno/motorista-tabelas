import CloseRounded from '@mui/icons-material/CloseRounded';
import { Drawer, IconButton } from '@mui/material';
import type { MestrePlanejado, ObraCronograma } from '../domain/models';
import { allocationWarnings, masterOtherObras, masterPeriodsForObra } from '../domain/masterPlanningDetails';
import { desmarcarNaoTrabalhado, normalizarNaoTrabalhados, rotuloDias, type NaoTrabalhado } from '../domain/naoTrabalhados';
import { addDays, formatDateShort } from '../domain/temporal';
import { getMestreColor } from '../domain/mestres';
import { StatusBadge } from './StatusBadge';

const datas = (obra: ObraCronograma, item: MestrePlanejado) => `${formatDateShort(item.inicio)} → ${formatDateShort(allocationWarnings(obra, item).end)}`;
const range = (obra: ObraCronograma, item: MestrePlanejado) => `${datas(obra, item)} · ${rotuloDias(item)}`;
const trechoNT = (item: NaoTrabalhado) => item.dias === 1 ? formatDateShort(item.inicio) : `${formatDateShort(item.inicio)} → ${formatDateShort(addDays(item.inicio, item.dias - 1))}`;

/** One allocated period: dates, total days, its NT stretches and, when editing is allowed, unmark and join. */
function Periodo({ obra, item, next, selected, onSalvarNaoTrabalhados, onJuntar }: { obra: ObraCronograma; item: MestrePlanejado; next?: MestrePlanejado; selected: boolean; onSalvarNaoTrabalhados?: (localId: string, naoTrabalhados: NaoTrabalhado[] | undefined) => void; onJuntar?: (primeiroId: string, segundoId: string) => void }) {
  const nt = normalizarNaoTrabalhados(item) ?? [];
  return <li className={selected ? 'is-selected' : undefined}>
    <div className="co-period-line"><strong>{datas(obra, item)}</strong><span>{rotuloDias(item)}</span></div>
    {nt.length > 0 && <div className="co-nt-list" aria-label="Dias não trabalhados">{nt.map((trecho) => <span key={trecho.inicio} className="co-nt-chip" title={`Não trabalhado: ${trecho.dias} ${trecho.dias === 1 ? 'dia' : 'dias'}`}>NT {trechoNT(trecho)}{onSalvarNaoTrabalhados && <button type="button" aria-label={`Tirar NT ${trechoNT(trecho)}`} title="Tirar este NT" onClick={() => onSalvarNaoTrabalhados(item.localId, desmarcarNaoTrabalhado(item, trecho))}>×</button>}</span>)}</div>}
    {onJuntar && next && <button type="button" className="co-inline-action co-period-join" title="Junta este período com o seguinte num só; os dias entre eles viram NT" onClick={() => onJuntar(item.localId, next.localId)}>Juntar com o próximo período</button>}
  </li>;
}

export function MasterDetailsDrawer({ obra, obras, masterKey, selectedLocalId, allKeys, onClose, onSalvarNaoTrabalhados, onJuntar }: { obra: ObraCronograma | null; obras: ObraCronograma[]; masterKey: string | null; selectedLocalId: string | null; allKeys: string[]; onClose: () => void; onSalvarNaoTrabalhados?: (localId: string, naoTrabalhados: NaoTrabalhado[] | undefined) => void; onJuntar?: (primeiroId: string, segundoId: string) => void }) {
  if (!obra || !masterKey) return null;
  const current = masterPeriodsForObra(obra).find((group) => group.key === masterKey);
  if (!current) return null;
  const color = getMestreColor(masterKey, allKeys);
  const others = masterOtherObras(obras, obra.id, masterKey);
  return <Drawer anchor="right" open onClose={onClose} slotProps={{ paper: { className: 'co-drawer co-drawer--wide' } }}><div className="co-drawer-header"><div><span className="co-eyebrow">Detalhes do mestre</span><h2><i className="co-master-swatch" style={{ background: color.background }} />{current.nome}</h2></div><IconButton onClick={onClose} aria-label="Fechar detalhes do mestre"><CloseRounded /></IconButton></div><div className="co-drawer-body"><section><h3>Obra atual</h3><strong className="co-current-work">{obra.nomeObra}</strong><StatusBadge status={obra.status} /><h4>Períodos alocados</h4><ul className="co-period-details">{current.periods.map((item, index) => <Periodo key={item.localId} obra={obra} item={item} next={current.periods[index + 1]} selected={item.localId === selectedLocalId} onSalvarNaoTrabalhados={onSalvarNaoTrabalhados} onJuntar={onJuntar} />)}</ul>{selectedLocalId && <p className="co-muted co-shortcut-hint"><kbd>Del</kbd> remove o período destacado · <kbd>Ctrl</kbd>+<kbd>Z</kbd> desfaz</p>}{onSalvarNaoTrabalhados && <p className="co-muted co-shortcut-hint">Dia não trabalhado: na escala <strong>Dias</strong>, arraste o <span className="co-nt-chip co-nt-chip--inline">NT</span> da barra de mestres até o dia e estique pelas pontas.</p>}</section><section><h3>Também está</h3>{others.length ? <div className="co-other-works">{others.map(({ obra: other, periods }) => <article key={other.id}><strong>{other.nomeObra}</strong>{periods.map((item) => <span key={item.localId}>{range(other, item)}</span>)}</article>)}</div> : <p className="co-muted">Nenhuma outra obra planejada.</p>}</section></div></Drawer>;
}
