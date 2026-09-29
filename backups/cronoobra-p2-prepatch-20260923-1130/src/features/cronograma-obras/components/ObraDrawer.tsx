import CloseRounded from '@mui/icons-material/CloseRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import { Drawer, IconButton } from '@mui/material';
import { consolidateAllocation } from '../domain/cronograma';
import type { ObraCronograma } from '../domain/models';
import { StatusBadge } from './StatusBadge';

export function ObraDrawer({ obra, onClose }: { obra: ObraCronograma | null; onClose: () => void }) {
  const periods = obra ? consolidateAllocation(obra) : [];
  return <Drawer anchor="right" open={Boolean(obra)} onClose={onClose} slotProps={{ paper: { className: 'co-drawer' } }}>{obra && <>
    <div className="co-drawer-header"><div><span className="co-eyebrow">Detalhe da obra</span><h2>{obra.local}</h2><StatusBadge status={obra.status} /></div><IconButton onClick={onClose} aria-label="Fechar detalhes"><CloseRounded /></IconButton></div>
    <div className="co-drawer-body">
      <dl className="co-detail-grid"><div><dt>Mestre</dt><dd>{obra.mestre ?? 'Não informado'}</dd></div><div><dt>Empresa</dt><dd>{obra.empresa}</dd></div><div><dt>Contrato</dt><dd>{obra.contrato ?? 'Não informado'}</dd></div><div><dt>Previsão</dt><dd>{obra.previsaoDias !== null ? `${obra.previsaoDias} dias` : 'Não informada'}</dd></div><div><dt>Dias realizados</dt><dd>{obra.diasRealizados ?? 'Não informado'}</dd></div><div><dt>Progresso</dt><dd className={obra.progressPercent !== null && obra.progressPercent > 100 ? 'co-invalid-value' : ''}>{obra.progressRaw ?? 'Não informado'}</dd></div></dl>
      <section><h3>Descrição dos serviços</h3><p>{obra.descricao ?? 'Sem descrição na fonte.'}</p></section>
      <section><h3>Programação</h3>{periods.length ? <ul className="co-period-list">{periods.map((period) => <li key={period}>{period}</li>)}</ul> : <p className="co-muted">Sem semanas programadas.</p>}</section>
      <section><h3>Qualidade dos dados <span className="co-count">{obra.issues.length}</span></h3>{obra.issues.length ? <ul className="co-issues">{obra.issues.map((issue) => <li key={issue.code}><ErrorOutlineRounded /><span><strong>{issue.code}</strong>{issue.message}</span></li>)}</ul> : <p className="co-muted">Nenhum alerta detectado nesta linha.</p>}</section>
      <p className="co-source-note">Fonte: CRONOGRAMA · linha {obra.sourceRow} · valores preservados sem correção automática.</p>
    </div>
  </>}</Drawer>;
}

