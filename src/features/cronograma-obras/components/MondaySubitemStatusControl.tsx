import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ObraCronograma } from '../domain/models';
import { mondayStatusColor, mondayStatusFromLabel, MONDAY_SUBITEM_STATUS_OPTIONS, MondaySubitemStatusRequestError, type MondaySubitemStatus, type MondaySubitemStatusCode, updateMondaySubitemStatus } from '../../../services/mondaySubitemStatusService';
import { StatusBadge } from './StatusBadge';

/** Operational action; the parent section owns the canonical classification. */
export function MondaySubitemStatusControl({ obra, canStart, canFinish = false, onStatusConfirmed }: { obra: ObraCronograma; canStart: boolean; canFinish?: boolean; onStatusConfirmed?: (mondaySubitemId: string, status: MondaySubitemStatus) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const statusTriggerRef = useRef<HTMLButtonElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const realLote = obra.targetType === 'obra' && Boolean(obra.mondaySubitemId);

  const action = canFinish ? "finish" : canStart ? "start" : null;
  const alreadyFinished = ['Finalizado'].includes(obra.status);
  if (!realLote || !action || alreadyFinished) return <StatusBadge status={obra.status} />;

  const selectStatus = async (novoStatus: MondaySubitemStatusCode) => {
    if (saving) return;
    setSaving(true); setError(null); setUpdated(false);
    try {
      const result = await updateMondaySubitemStatus(obra.mondaySubitemId!, novoStatus);
      if (result.statusAtual) onStatusConfirmed?.(obra.mondaySubitemId!, result.statusAtual);
      if (result.result === 'UPDATED' || result.result === 'NO_CHANGE') setUpdated(true);
    } catch (cause) {
      if (cause instanceof MondaySubitemStatusRequestError && cause.code === 'SNAPSHOT_UPDATE_FAILED' && cause.mondayUpdated) {
        if (cause.statusAtual) onStatusConfirmed?.(obra.mondaySubitemId!, cause.statusAtual);
        setUpdated(true); setError(cause.message);
      } else setError(cause instanceof MondaySubitemStatusRequestError ? cause.message : 'NÃ£o foi possÃ­vel atualizar o Status no Monday.');
    } finally { setSaving(false); }
  };

  const closeMenu = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) statusTriggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) { setMenuPosition(null); return; }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      const clickedTrigger = statusTriggerRef.current?.contains(target);
      const clickedMenu = statusMenuRef.current?.contains(target);
      if (!clickedTrigger && !clickedMenu) closeMenu();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu(true);
    };
    window.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;
    const updateMenuPosition = () => {
      const trigger = statusTriggerRef.current;
      if (!trigger) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuWidth = Math.max(triggerRect.width, 162);
      const menuHeight = 230;
      const viewportMargin = 8;
      const below = window.innerHeight - triggerRect.bottom;
      const above = triggerRect.top;
      const opensAbove = below < menuHeight && above > below;
      setMenuPosition({
        top: opensAbove ? Math.max(viewportMargin, triggerRect.top - menuHeight - 4) : triggerRect.bottom + 4,
        left: Math.max(viewportMargin, Math.min(triggerRect.left, window.innerWidth - menuWidth - viewportMargin)),
        minWidth: menuWidth,
      });
    };
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open]);

  // Started LOTEs use the same callable flow, but expose every canonical
  // Monday status rather than a one-way "Finalizar" action.
  const currentStatus = mondayStatusFromLabel(obra.status);
  const currentIndex = Math.max(0, MONDAY_SUBITEM_STATUS_OPTIONS.findIndex((status) => status.code === currentStatus?.code));
  const openMenu = () => { setUpdated(false); setActiveIndex(currentIndex); setOpen(true); };
  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(event.key === 'ArrowDown' ? currentIndex : (currentIndex + MONDAY_SUBITEM_STATUS_OPTIONS.length - 1) % MONDAY_SUBITEM_STATUS_OPTIONS.length); setOpen(true); }
    if (event.key === 'Escape') closeMenu(true);
  };
  const onOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number, code: MondaySubitemStatusCode) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index + (event.key === 'ArrowDown' ? 1 : MONDAY_SUBITEM_STATUS_OPTIONS.length - 1)) % MONDAY_SUBITEM_STATUS_OPTIONS.length); }
    else if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(false); void selectStatus(code); }
  };

  if (canFinish) return <span className="co-monday-status-control" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    <button ref={statusTriggerRef} type="button" className="co-monday-status-trigger" aria-label={`Status de ${obra.nomeObra}`} aria-haspopup="listbox" aria-expanded={open} disabled={saving} style={{ backgroundColor: mondayStatusColor(obra.status) }} onClick={() => open ? closeMenu() : openMenu()} onKeyDown={onTriggerKeyDown}>{saving ? 'Atualizando…' : <>{obra.status || 'Status'} <span aria-hidden="true">▾</span></>}</button>
    {open && menuPosition && createPortal(<div ref={statusMenuRef} data-monday-status-menu className="co-monday-status-list" role="listbox" aria-label={`Opções de Status de ${obra.nomeObra}`} style={menuPosition}>
      {MONDAY_SUBITEM_STATUS_OPTIONS.map((status, index) => <button key={status.code} ref={(element) => { optionRefs.current[index] = element; }} type="button" className="co-monday-status-option" role="option" aria-selected={status.code === currentStatus?.code} style={{ backgroundColor: mondayStatusColor(status.label) }} onClick={() => { setOpen(false); void selectStatus(status.code); }} onKeyDown={(event) => onOptionKeyDown(event, index, status.code)}>{status.label}{status.code === currentStatus?.code && <span className="co-monday-status-check" aria-hidden="true">✓</span>}</button>)}
    </div>, document.body)}
    {saving && <small className="co-status-feedback" role="status">Salvando…</small>}{error && <small className="co-status-error" role="alert">{error}</small>}{updated && <small className="co-status-feedback" role="status">Status atualizado no Monday.</small>}
  </span>;

  const start = async () => {
    if (saving) return;
    setSaving(true); setError(null); setUpdated(false);
    try {
      const result = await updateMondaySubitemStatus(obra.mondaySubitemId!, action === "finish" ? 'FINALIZADO' : 'EM_ANDAMENTO');
      if (result.statusAtual) onStatusConfirmed?.(obra.mondaySubitemId!, result.statusAtual);
      if (result.result === 'UPDATED' || result.result === 'NO_CHANGE') setUpdated(true);
    } catch (cause) {
      if (cause instanceof MondaySubitemStatusRequestError && cause.code === 'SNAPSHOT_UPDATE_FAILED' && cause.mondayUpdated) {
        if (cause.statusAtual) onStatusConfirmed?.(obra.mondaySubitemId!, cause.statusAtual);
        setUpdated(true); setError(cause.message);
      } else setError(cause instanceof MondaySubitemStatusRequestError ? cause.message : 'Não foi possível atualizar o Status no Monday.');
    } finally { setSaving(false); }
  };

  const verb = action === "finish" ? 'Finalizar' : 'Iniciar';
  return <span className="co-monday-status-control" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><button type="button" className="co-button co-button--primary co-start-button" aria-label={`${verb} ${obra.nomeObra}`} disabled={saving} onClick={() => void start()}>{saving ? `${action === "finish" ? 'Finalizando' : 'Iniciando'}...` : verb}</button>{error && <small className="co-status-error" role="alert">{error}</small>}{updated && <small className="co-status-feedback" role="status">Status atualizado no Monday.</small>}</span>;
}
