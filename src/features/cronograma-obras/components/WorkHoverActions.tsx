import AttachMoneyRounded from "@mui/icons-material/AttachMoneyRounded";
import MoreVertRounded from "@mui/icons-material/MoreVertRounded";
import { createPortal } from "react-dom";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BalanceSummary, ContractBalanceModal, EMPTY_BALANCE } from "./ContractBalanceModal";

type OpenWork = { id: string; contractId: string; contractName: string; anchor: HTMLElement; onMore: () => void };
type HoverContextValue = { enter: (work: OpenWork) => void; leave: () => void; focus: (work: OpenWork) => void };
type OpenModal = { contractId: string; contractName: string; returnFocus: HTMLButtonElement };
const HoverContext = createContext<HoverContextValue | null>(null);
const OPEN_DELAY = 1000;
const CLOSE_GRACE = 150;
export const BALANCE_PREVIEW_OPEN_DELAY_MS = 450;
export const BALANCE_PREVIEW_CLOSE_DELAY_MS = 350;
export const scheduleBalancePreviewOpen = (callback: () => void) => setTimeout(callback, BALANCE_PREVIEW_OPEN_DELAY_MS);
export const scheduleBalancePreviewClose = (callback: () => void) => setTimeout(callback, BALANCE_PREVIEW_CLOSE_DELAY_MS);

function position(anchor: HTMLElement, card: HTMLElement) {
  const target = anchor.getBoundingClientRect(); const rect = card.getBoundingClientRect(); const margin = 8;
  const above = target.top >= rect.height + margin;
  const left = Math.max(margin, Math.min(target.left + target.width / 2 - rect.width / 2, window.innerWidth - rect.width - margin));
  return { left, top: above ? target.top - rect.height - margin : target.bottom + margin, above, arrowLeft: Math.max(14, Math.min(target.left + target.width / 2 - left, rect.width - 14)) };
}

export function WorkHoverActions({ children, closeKey }: { children: ReactNode; closeKey?: string }) {
  const [open, setOpen] = useState<OpenWork | null>(null); const [balanceOpen, setBalanceOpen] = useState(false); const [modal, setModal] = useState<OpenModal | null>(null);
  const [placement, setPlacement] = useState({ left: 0, top: 0, above: true, arrowLeft: 14 });
  const cardRef = useRef<HTMLDivElement>(null); const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const balancePreviewOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const balanceCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const pending = useRef<OpenWork | null>(null); const instanceId = useRef(`work-hover-${Math.random().toString(36).slice(2)}`);
  const clearTimers = useCallback(() => { [openTimer, closeTimer, balancePreviewOpenTimer, balanceCloseTimer].forEach((timer) => { if (timer.current) clearTimeout(timer.current); timer.current = null; }); }, []);
  const close = useCallback(() => { clearTimers(); pending.current = null; setBalanceOpen(false); setOpen(null); }, [clearTimers]);
  const enter = useCallback((work: OpenWork) => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = null; if (open?.id === work.id) return; if (openTimer.current) clearTimeout(openTimer.current); window.dispatchEvent(new CustomEvent("co-work-hover-open", { detail: instanceId.current })); pending.current = work; openTimer.current = setTimeout(() => { setBalanceOpen(false); setOpen(pending.current); openTimer.current = null; }, OPEN_DELAY); }, [open?.id]);
  const leave = useCallback(() => { if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; pending.current = null; } if (open) { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(close, balanceOpen || balanceCloseTimer.current ? BALANCE_PREVIEW_CLOSE_DELAY_MS : CLOSE_GRACE); } }, [balanceOpen, close, open]);
  const focus = useCallback((work: OpenWork) => { window.dispatchEvent(new CustomEvent("co-work-hover-open", { detail: instanceId.current })); clearTimers(); pending.current = null; setBalanceOpen(false); setOpen(work); }, [clearTimers]);
  const keepOpen = useCallback(() => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = null; }, []);
  const openBalance = useCallback(() => {
    keepOpen();
    if (balanceCloseTimer.current) clearTimeout(balanceCloseTimer.current);
    balanceCloseTimer.current = null;
    if (balanceOpen) return;
    if (balancePreviewOpenTimer.current) clearTimeout(balancePreviewOpenTimer.current);
    balancePreviewOpenTimer.current = scheduleBalancePreviewOpen(() => { setBalanceOpen(true); balancePreviewOpenTimer.current = null; });
  }, [balanceOpen, keepOpen]);
  const scheduleBalanceClose = useCallback(() => {
    if (balancePreviewOpenTimer.current) { clearTimeout(balancePreviewOpenTimer.current); balancePreviewOpenTimer.current = null; }
    if (balanceCloseTimer.current) clearTimeout(balanceCloseTimer.current);
    if (!balanceOpen) { balanceCloseTimer.current = null; return; }
    balanceCloseTimer.current = scheduleBalancePreviewClose(() => { setBalanceOpen(false); balanceCloseTimer.current = null; });
  }, [balanceOpen]);
  const updatePosition = useCallback(() => { const card = cardRef.current; if (!open?.anchor.isConnected || !card) { if (open && !open.anchor.isConnected) close(); return; } setPlacement(position(open.anchor, card)); }, [close, open]);
  const closeModal = useCallback(() => { const opener = modal?.returnFocus; setModal(null); requestAnimationFrame(() => opener?.focus()); }, [modal]);
  useLayoutEffect(() => { if (open) requestAnimationFrame(updatePosition); }, [balanceOpen, open, updatePosition]);
  useEffect(() => { close(); }, [closeKey]); useEffect(() => { if (!open) return; window.addEventListener("resize", updatePosition); window.addEventListener("scroll", updatePosition, true); return () => { window.removeEventListener("resize", updatePosition); window.removeEventListener("scroll", updatePosition, true); }; }, [open, updatePosition]); useEffect(() => () => clearTimers(), [clearTimers]);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; document.addEventListener("keydown", onKeyDown); return () => document.removeEventListener("keydown", onKeyDown); }, [close]);
  useEffect(() => { const closeOther = (event: Event) => { if ((event as CustomEvent<string>).detail !== instanceId.current) close(); }; window.addEventListener("co-work-hover-open", closeOther); return () => window.removeEventListener("co-work-hover-open", closeOther); }, [close]);
  return <HoverContext.Provider value={{ enter, leave, focus }}>{children}{open && createPortal(<div ref={cardRef} className={`co-work-hover-card ${balanceOpen ? "is-expanded" : ""} ${placement.above ? "is-above" : "is-below"}`} style={{ left: placement.left, top: placement.top, "--co-work-hover-arrow-left": `${placement.arrowLeft}px` } as React.CSSProperties} role="menu" onPointerEnter={keepOpen} onPointerLeave={leave}>
    <div className="co-work-hover-actions"><button type="button" className="co-work-hover-action" aria-label="Ver detalhes do contrato" title="Ver detalhes do contrato" onClick={(event) => { event.stopPropagation(); open.onMore(); close(); }}><MoreVertRounded fontSize="small" /></button><button type="button" className="co-work-hover-action" aria-label="Saldo" title="Saldo" aria-expanded={balanceOpen} onPointerEnter={openBalance} onPointerLeave={scheduleBalanceClose} onClick={(event) => { event.stopPropagation(); const returnFocus = event.currentTarget; close(); setModal({ contractId: open.contractId, contractName: open.contractName, returnFocus }); }}><AttachMoneyRounded fontSize="small" /></button></div>
    {balanceOpen && <div className="co-work-balance" onPointerEnter={openBalance} onPointerLeave={scheduleBalanceClose}><BalanceSummary summary={EMPTY_BALANCE} variant="preview" /></div>}
  </div>, document.body)}{modal && <ContractBalanceModal contractName={modal.contractName} summary={EMPTY_BALANCE} onClose={closeModal} />}</HoverContext.Provider>;
}

export function WorkHoverTrigger({ id, contractId, contractName, onMore, children }: { id: string; contractId: string; contractName: string; onMore: () => void; children: ReactNode }) {
  const hover = useContext(HoverContext); if (!hover) return <>{children}</>;
  const work = (anchor: HTMLElement): OpenWork => ({ id, contractId, contractName, anchor, onMore });
  return <span className="co-work-hover-trigger" tabIndex={0} onPointerEnter={(event) => hover.enter(work(event.currentTarget))} onPointerLeave={hover.leave} onFocus={(event) => hover.focus(work(event.currentTarget))}>{children}</span>;
}
