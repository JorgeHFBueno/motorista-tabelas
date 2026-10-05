import { useState } from 'react';
import type { ObraCronograma } from '../domain/models';
import { MondaySubitemStatusRequestError, type MondaySubitemStatus, updateMondaySubitemStatus } from '../../../services/mondaySubitemStatusService';
import { StatusBadge } from './StatusBadge';

/** Operational action; the parent section owns the canonical classification. */
export function MondaySubitemStatusControl({ obra, canStart, onStatusConfirmed }: { obra: ObraCronograma; canStart: boolean; onStatusConfirmed?: (mondaySubitemId: string, status: MondaySubitemStatus) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const realLote = obra.targetType === 'obra' && Boolean(obra.mondaySubitemId);

  if (!realLote || !canStart) return <StatusBadge status={obra.status} />;

  const start = async () => {
    if (saving) return;
    setSaving(true); setError(null); setUpdated(false);
    try {
      const result = await updateMondaySubitemStatus(obra.mondaySubitemId!, 'EM_ANDAMENTO');
      if (result.statusAtual) onStatusConfirmed?.(obra.mondaySubitemId!, result.statusAtual);
      if (result.result === 'UPDATED' || result.result === 'NO_CHANGE') setUpdated(true);
    } catch (cause) {
      if (cause instanceof MondaySubitemStatusRequestError && cause.code === 'SNAPSHOT_UPDATE_FAILED' && cause.mondayUpdated) {
        if (cause.statusAtual) onStatusConfirmed?.(obra.mondaySubitemId!, cause.statusAtual);
        setUpdated(true); setError(cause.message);
      } else setError(cause instanceof MondaySubitemStatusRequestError ? cause.message : 'Não foi possível atualizar o Status no Monday.');
    } finally { setSaving(false); }
  };

  return <span className="co-monday-status-control" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><button type="button" className="co-button co-button--primary co-start-button" aria-label={`Iniciar ${obra.nomeObra}`} disabled={saving} onClick={() => void start()}>{saving ? 'Iniciando...' : 'Iniciar'}</button>{error && <small className="co-status-error" role="alert">{error}</small>}{updated && <small className="co-status-feedback" role="status">Status atualizado no Monday.</small>}</span>;
}
