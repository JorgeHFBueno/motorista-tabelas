import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import { memo, useMemo, useState } from 'react';
import type { ContratoCronograma, ObraCronograma } from '../domain/models';
import { todayCivil } from '../domain/temporal';
import { startedMasterPeriods } from '../domain/masterPlanningDetails';
import { getMestreColor, normalizeMestreKey } from '../domain/mestres';
import { StatusBadge } from './StatusBadge';
import { groupObrasByContract } from '../domain/contractGroups';

const colorStyle = (key: string): React.CSSProperties => ({ '--co-master-color': getMestreColor(key).background } as React.CSSProperties);

export const ContractTextTable = memo(function ContractTextTable({ obras, contratos, onOpenContract, onSelect, onSelectMasters }: { obras: readonly ObraCronograma[]; contratos: ReadonlyMap<string, ContratoCronograma>; onOpenContract: (contrato: ContratoCronograma) => void; onSelect: (obra: ObraCronograma) => void; onSelectMasters: (obra: ObraCronograma) => void }) {
  const groups = useMemo(() => groupObrasByContract(obras), [obras]);
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(() => new Set());
  return <section className="co-text-table" aria-label="Lista textual de contratos"><div className="co-text-head"><span>Obra</span><span>Mestres</span><span>Status</span></div>{groups.map((group) => {
    const contrato = contratos.get(group.id); const expanded = expandedContracts.has(group.id); const masters = [...new Map(group.obras.flatMap((obra) => obra.mestresPlanejados).map((mestre) => [mestre.nome, mestre])).values()]; const obrasLabel = `${group.obras.length} ${group.obras.length === 1 ? 'obra' : 'obras'}`;
    return <div className="co-text-contract" key={group.id}><div className="co-text-row co-text-row--contract" role="button" tabIndex={0} aria-expanded={expanded} onClick={() => setExpandedContracts((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}><span className="co-contract-name"><KeyboardArrowDownRounded className={expanded ? '' : 'is-collapsed'} /><button type="button" className="co-contract-details" aria-label={`Ver detalhes de ${group.name}`} onClick={(event) => { event.stopPropagation(); if (contrato) onOpenContract(contrato); }}><MoreVertRounded /></button>{group.name}</span><span className="co-masters-cell">{masters.length ? masters.map((mestre) => <i className="co-master-name-chip" key={mestre.nome} style={colorStyle(mestre.mestreKey ?? normalizeMestreKey(mestre.nome))}>{mestre.nome}</i>) : <em>Sem mestre</em>}</span><span className="co-contract-work-count">{obrasLabel}</span></div>{expanded && group.obras.map((obra) => { const active = startedMasterPeriods(obra, todayCivil()); return <button type="button" className="co-text-row co-text-row--child" key={obra.id} onClick={() => onSelect(obra)}><span className="co-work-name" title={obra.nomeObra}>{obra.nomeObra}</span><span className="co-masters-cell" onClick={(event) => { event.stopPropagation(); onSelectMasters(obra); }}>{active.length ? active.map((mestre) => <i className="co-master-name-chip" key={mestre.key} style={colorStyle(mestre.key)}>{mestre.nome}</i>) : <em>Sem mestre</em>}</span><span><StatusBadge status={obra.status} /></span></button>; })}</div>;
  })}{!groups.length && <div className="co-empty">Nenhum contrato nesta situação.</div>}</section>;
});
