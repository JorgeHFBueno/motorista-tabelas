import CloseRounded from '@mui/icons-material/CloseRounded';
import { Drawer, IconButton } from '@mui/material';
import { useMemo, useState } from 'react';
import { dateLabel, isValidCivilDate, tryCalculatedEnd } from '../domain/temporal';
import type { ObraCatalogo, ObraCronograma } from '../domain/models';

export function AddObraDrawer({ catalog, masters, scheduledIds, onClose, onAdd }: { catalog: ObraCatalogo[]; masters: string[]; scheduledIds: string[]; onClose: () => void; onAdd: (obra: ObraCronograma) => void }) {
  const available = useMemo(() => catalog.filter((obra) => !scheduledIds.includes(obra.id)), [catalog, scheduledIds]);
  const [id, setId] = useState(available[0]?.id ?? '');
  const [inicio, setInicio] = useState('2026-10-05');
  const [tempo, setTempo] = useState(14);
  const [mestreInicial, setMestreInicial] = useState('');
  const selected = available.find((obra) => obra.id === id);
  const fim = tryCalculatedEnd(inicio, tempo);
  const valid = isValidCivilDate(inicio) && tempo > 0;
  return <Drawer anchor="right" open onClose={onClose} slotProps={{ paper: { className: 'co-drawer' } }}>
    <div className="co-drawer-header"><div><span className="co-eyebrow">Adicionar ao cronograma</span><h2>Nova obra local</h2></div><IconButton onClick={onClose} aria-label="Fechar"><CloseRounded /></IconButton></div>
    <form className="co-drawer-body co-plan-form" onSubmit={(event) => { event.preventDefault(); if (selected && valid) { onAdd({ ...selected, mestreInicial: mestreInicial || selected.mestreInicial, inicioPlanejado: inicio, tempoPlanejado: tempo, mestresPlanejados: [] }); onClose(); } }}>
      <section><h3>Identidade da obra</h3><label>Obra<select value={id} onChange={(event) => setId(event.target.value)} required><option value="">Selecione</option>{available.map((obra) => <option value={obra.id} key={obra.id}>{obra.codObra} · {obra.nomeObra}</option>)}</select></label>{selected && <p className="co-form-help">{selected.local} · {selected.status} · {selected.empresa}</p>}</section>
      <section><h3>Planejamento</h3><label>Mestre inicial<select value={mestreInicial} onChange={(event) => setMestreInicial(event.target.value)}><option value="">Não informado</option>{masters.map((master) => <option key={master}>{master}</option>)}</select></label><p className="co-form-help">Mestre inicial é apenas informativo; o planejamento de mestres é definido depois na edição.</p><label>Início planejado<input type="date" value={inicio} onChange={(event) => setInicio(event.target.value)} onBlur={() => setInicio((value) => value.trim())} required /></label><label>Tempo planejado (dias)<input type="number" min="1" value={tempo || ''} onChange={(event) => setTempo(Number(event.target.value))} required /></label><div className="co-calculated-date">Fim calculado: <strong>{dateLabel(fim)}</strong>{!valid && <small> Informe uma data válida para calcular.</small>}</div></section>
      <button className="co-button co-button--primary" type="submit" disabled={!selected || !valid}>Adicionar obra</button>
    </form>
  </Drawer>;
}
