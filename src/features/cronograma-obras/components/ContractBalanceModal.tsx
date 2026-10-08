import CloseRounded from "@mui/icons-material/CloseRounded";
import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";

export type WorkBalanceSummary = { totalContrato: number; totalDisponivel: number; medicoes: number; saldoDisponivel: number; saldoContrato: number };
export const EMPTY_BALANCE: WorkBalanceSummary = { totalContrato: 0, totalDisponivel: 0, medicoes: 0, saldoDisponivel: 0, saldoContrato: 0 };
const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatBRL = (value: number) => brlFormatter.format(value);

export function BalanceSummary({ summary, variant }: { summary: WorkBalanceSummary; variant: "preview" | "modal" }) {
  const total = [["TOTAL DO CONTRATO", summary.totalContrato], ["TOTAL DISPONÍVEL", summary.totalDisponivel], ["MEDIÇÕES", summary.medicoes]] as const;
  const saldo = [["SALDO DISPONÍVEL", summary.saldoDisponivel], ["SALDO CONTRATO", summary.saldoContrato]] as const;
  return <div className={`co-balance-summary co-balance-summary--${variant}`} aria-label="Resumo de saldo">
    <section><h3>TOTAL</h3><div className="co-balance-summary-grid co-balance-summary-grid--total">{total.map(([label, value]) => <BalanceValue key={label} label={label} value={value} />)}</div></section>
    <section><h3>SALDO</h3><div className="co-balance-summary-grid co-balance-summary-grid--saldo">{saldo.map(([label, value]) => <BalanceValue key={label} label={label} value={value} />)}</div></section>
  </div>;
}

function BalanceValue({ label, value }: { label: string; value: number }) { return <div className="co-balance-summary-value"><span>{label}</span><strong>{formatBRL(value)}</strong></div>; }

export function ContractBalanceModal({ contractName, summary, onClose }: { contractName: string; summary: WorkBalanceSummary; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", onKeyDown); closeRef.current?.focus(); return () => document.removeEventListener("keydown", onKeyDown); }, [onClose]);
  return createPortal(<div className="co-balance-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="co-balance-modal" role="dialog" aria-modal="true" aria-labelledby="co-balance-modal-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><p>SALDO DO CONTRATO</p><h2 id="co-balance-modal-title">{contractName}</h2></div><button ref={closeRef} type="button" aria-label="Fechar saldo do contrato" title="Fechar" onClick={onClose}><CloseRounded /></button></header>
      <BalanceSummary summary={summary} variant="modal" />
    </section>
  </div>, document.body);
}
