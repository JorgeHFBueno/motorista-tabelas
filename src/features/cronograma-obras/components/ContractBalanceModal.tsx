import CloseRounded from "@mui/icons-material/CloseRounded";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { loadMondaySerpSnapshot, syncMondaySerpMeasurements, type MondaySerpSnapshot } from "../../../services/monday-serp.service";

export type WorkBalanceSummary = { totalContrato: number | null; totalDisponivel: number | null; medicoes: number | null; saldoDisponivel: number | null; saldoContrato: number | null };
export const EMPTY_BALANCE: WorkBalanceSummary = { totalContrato: null, totalDisponivel: null, medicoes: null, saldoDisponivel: null, saldoContrato: null };
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

function BalanceValue({ label, value }: { label: string; value: number | null }) { return <div className="co-balance-summary-value"><span>{label}</span><strong>{value === null ? "R$ --,--" : formatBRL(value)}</strong></div>; }

const measurementsSummary = (snapshot: MondaySerpSnapshot | null): WorkBalanceSummary => ({ ...EMPTY_BALANCE, medicoes: snapshot?.valor_bruto_servico ?? null });

export function ContractBalanceModal({ contractName, idObra, subcentroErp, onClose }: { contractName: string; idObra: string; subcentroErp: string | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [snapshot, setSnapshot] = useState<MondaySerpSnapshot | null>(null);
  const [updating, setUpdating] = useState(Boolean(subcentroErp));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", onKeyDown); closeRef.current?.focus(); return () => document.removeEventListener("keydown", onKeyDown); }, [onClose]);
  useEffect(() => {
    let active = true;
    if (!subcentroErp) { setSnapshot(null); setUpdating(false); return () => { active = false; }; }
    void loadMondaySerpSnapshot(idObra).then((known) => { if (active && known) setSnapshot(known); }).catch(() => { /* A remote refresh can still recover this snapshot. */ });
    void syncMondaySerpMeasurements({ idObra, subcentroErp }).then((fresh) => { if (active && fresh) setSnapshot(fresh); if (active) setUpdating(false); }).catch(() => { if (active) { setUpdating(false); setError("Não foi possível atualizar as medições."); } });
    return () => { active = false; };
  }, [idObra, subcentroErp]);
  return createPortal(<div className="co-balance-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="co-balance-modal" role="dialog" aria-modal="true" aria-labelledby="co-balance-modal-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><p>SALDO DO CONTRATO</p><h2 id="co-balance-modal-title">{contractName}</h2></div><button ref={closeRef} type="button" aria-label="Fechar saldo do contrato" title="Fechar" onClick={onClose}><CloseRounded /></button></header>
      <BalanceSummary summary={measurementsSummary(snapshot)} variant="modal" />
      <p className="co-balance-modal-status" role="status">{!subcentroErp ? "Não há Subcentro ERP vinculado." : updating ? "Atualizando..." : error}</p>
    </section>
  </div>, document.body);
}
