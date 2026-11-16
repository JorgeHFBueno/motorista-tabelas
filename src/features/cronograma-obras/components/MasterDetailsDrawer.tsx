import CloseRounded from '@mui/icons-material/CloseRounded';
import { Drawer, IconButton } from '@mui/material';
import { useState } from 'react';
import type { MestrePlanejado, ObraCronograma } from '../domain/models';
import { allocationWarnings, masterOtherObras, masterPeriodsForObra } from '../domain/masterPlanningDetails';
import { desmarcarNaoTrabalhado, marcarNaoTrabalhado, normalizarNaoTrabalhados, rotuloDias, type NaoTrabalhado } from '../domain/naoTrabalhados';
import { addDays, formatDateShort } from '../domain/temporal';
import { getMestreColor } from '../domain/mestres';
import { StatusBadge } from './StatusBadge';

const range = (obra: ObraCronograma, item: MestrePlanejado) => `${formatDateShort(item.inicio)} → ${formatDateShort(allocationWarnings(obra, item).end)} · ${rotuloDias(item)}`;
const trechoNT = (item: NaoTrabalhado) => item.dias === 1 ? formatDateShort(item.inicio) : `${formatDateShort(item.inicio)} → ${formatDateShort(addDays(item.inicio, item.dias - 1))}`;

/** One allocated period: its NT days and, when editing is allowed, the controls to mark, unmark and join. */
function Periodo({ obra, item, next, selected, onSalvarNaoTrabalhados, onJuntar }: { obra: ObraCronograma; item: MestrePlanejado; next?: MestrePlanejado; selected: boolean; onSalvarNaoTrabalhados?: (localId: string, naoTrabalhados: NaoTrabalhado[] | undefined) => void; onJuntar?: (primeiroId: string, segundoId: string) => void }) {
  const [inicio, setInicio] = useState(item.inicio);
  const [dias, setDias] = useState(1);
  const fim = allocationWarnings(obra, item).end;
  const nt = normalizarNaoTrabalhados(item) ?? [];
  const valido = inicio >= item.inicio && inicio <= fim && Number.isInteger(dias) && dias > 0;
  return <li className={selected ? 'is-selected' : undefined}>
    <div className="co-period-line"><span>{range(obra, item)}</span>{onJuntar && next && <button type="button" className="co-inline-action" title="Junta este período com o seguinte num só; os dias entre eles viram NT" onClick={() => onJuntar(item.localId, next.localId)}>Juntar com o próximo</button>}</div>
    {nt.length > 0 && <div className="co-nt-list" aria-label="Dias não trabalhados">{nt.map((trecho) => <span key={trecho.inicio} className="co-nt-chip">NT {trechoNT(trecho)} · {trecho.dias} {trecho.dias === 1 ? 'dia' : 'dias'}{onSalvarNaoTrabalhados && <button type="button" aria-label={`Tirar NT ${trechoNT(trecho)}`} onClick={() => onSalvarNaoTrabalhados(item.localId, desmarcarNaoTrabalhado(item, trecho))}>×</button>}</span>)}</div>}
    {onSalvarNaoTrabalhados && <form className="co-nt-form" onSubmit={(event) => { event.preventDefault(); if (valido) onSalvarNaoTrabalhados(item.localId, marcarNaoTrabalhado(item, inicio, dias)); }}>
      <label>NT a partir de<input type="date" value={inicio} min={item.inicio} max={fim} onChange={(event) => setInicio(event.target.value)} /></label>
      <label>Dias<input type="number" min={1} value={dias} onChange={(event) => setDias(Number(event.target.value))} /></label>
      <button type="submit" className="co-button co-button--secondary" disabled={!valido}>Marcar NT</button>
    </form>}
  </li>;
}

export function MasterDetailsDrawer({ obra, obras, masterKey, selectedLocalId, allKeys, onClose, onSalvarNaoTrabalhados, onJuntar }: { obra: ObraCronograma | null; obras: ObraCronograma[]; masterKey: string | null; selectedLocalId: string | null; allKeys: string[]; onClose: () => void; onSalvarNaoTrabalhados?: (localId: string, naoTrabalhados: NaoTrabalhado[] | undefined) => void; onJuntar?: (primeiroId: string, segundoId: string) => void }) {
  if (!obra || !masterKey) return null;
  const current = masterPeriodsForObra(obra).find((group) => group.key === masterKey);
  if (!current) return null;
  const color = getMestreColor(masterKey, allKeys);
  const others = masterOtherObras(obras, obra.id, masterKey);
  return <Drawer anchor="right" open onClose={onClose} slotProps={{ paper: { className: 'co-drawer co-drawer--wide' } }}><div className="co-drawer-header"><div><span className="co-eyebrow">Detalhes do mestre</span><h2><i className="co-master-swatch" style={{ background: color.background }} />{current.nome}</h2></div><IconButton onClick={onClose} aria-label="Fechar detalhes do mestre"><CloseRounded /></IconButton></div><div className="co-drawer-body"><section><h3>Obra atual</h3><strong className="co-current-work">{obra.nomeObra}</strong><StatusBadge status={obra.status} /><h4>Períodos alocados</h4><ul className="co-period-details">{current.periods.map((item, index) => <Periodo key={`${item.localId}-${item.inicio}-${item.tempoPlanejado}`} obra={obra} item={item} next={current.periods[index + 1]} selected={item.localId === selectedLocalId} onSalvarNaoTrabalhados={onSalvarNaoTrabalhados} onJuntar={onJuntar} />)}</ul>{selectedLocalId && <p className="co-muted co-shortcut-hint"><kbd>Del</kbd> remove o período destacado · <kbd>Ctrl</kbd>+<kbd>Z</kbd> desfaz</p>}</section><section><h3>Também está</h3>{others.length ? <div className="co-other-works">{others.map(({ obra: other, periods }) => <article key={other.id}><strong>{other.nomeObra}</strong>{periods.map((item) => <span key={item.localId}>{range(other, item)}</span>)}</article>)}</div> : <p className="co-muted">Nenhuma outra obra planejada.</p>}</section></div></Drawer>;
}
