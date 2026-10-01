import CloseRounded from '@mui/icons-material/CloseRounded';
import { Drawer, IconButton } from '@mui/material';
import { useEffect, useState } from 'react';
import type { ContratoCronograma } from '../domain/models';
import { formatDateShort, inclusiveCivilDays } from '../domain/temporal';

function rawJson(value: unknown): string { return JSON.stringify(value, (_key, current) => current && typeof current === 'object' && typeof (current as { toDate?: unknown }).toDate === 'function' ? { __type: 'Timestamp', seconds: (current as { seconds?: unknown }).seconds, nanoseconds: (current as { nanoseconds?: unknown }).nanoseconds } : current, 2); }
export function ContractDetailsDrawer({ contrato, onClose }: { contrato: ContratoCronograma | null; onClose: () => void }) {
  const [showRaw, setShowRaw] = useState(false); useEffect(() => setShowRaw(false), [contrato?.id]); if (!contrato) return null;
  const days = inclusiveCivilDays(contrato.inicio, contrato.fim);
  const details: Array<[string, string | number | null]> = [['Nome', contrato.nome], ['ID do contrato', contrato.id], ['Empresa', contrato.empresa], ['Número do contrato', contrato.numeroContrato], ['Ano', contrato.ano], ['Status', contrato.status], ['Início', formatDateShort(contrato.inicio)], ['Fim', formatDateShort(contrato.fim)], ['Dias', days ?? '—'], ['obraV2Id', contrato.obraV2Id], ['LOTEs/subitems', contrato.obras.filter((obra) => obra.targetType === 'obra').length]];
  return <Drawer anchor="right" open onClose={onClose} slotProps={{ paper: { className: 'co-drawer co-drawer--wide' } }}><div className="co-drawer-header"><div><span className="co-eyebrow">Detalhes do contrato</span><h2>{contrato.nome}</h2></div><IconButton onClick={onClose} aria-label="Fechar detalhes do contrato"><CloseRounded /></IconButton></div><div className="co-drawer-body">{showRaw ? <><button type="button" className="co-inline-action" onClick={() => setShowRaw(false)}>Voltar aos detalhes</button><pre className="co-contract-raw">{rawJson(contrato.rawDocument)}</pre></> : <><dl className="co-detail-grid">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null || value === '' ? '—' : value}</dd></div>)}</dl><button type="button" className="co-button co-button--secondary" onClick={() => setShowRaw(true)}>Ver bruto</button><p className="co-source-note">Visualização somente leitura do documento monday-obras/{contrato.id}.</p></>}</div></Drawer>;
}
