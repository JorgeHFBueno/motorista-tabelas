import type { Timestamp } from "firebase/firestore";

// portal-parcelas (Manuscript portal.md). Values here are in reais and the due date is a Timestamp;
// the service converts from cents and 'AAAA-MM-DD'.
export const FINANCIAL_INSTALLMENT_STATUSES = [
  "pendente",
  "comprovante_enviado",
  "pago",
  "rejeitado",
] as const;

export type FinancialInstallmentStatus = (typeof FINANCIAL_INSTALLMENT_STATUSES)[number];

export interface FinancialActorReference {
  uid?: string;
  nome?: string;
}

export interface FinancialInstallment {
  id: string;
  obraId: string;
  numero: number;
  descricao: string;
  valor: number;
  vencimento?: Timestamp;
  status: FinancialInstallmentStatus;
  // Download URLs asked when the list is loaded; not stored in Firestore.
  boletoUrl?: string;
  comprovanteUrl?: string;
  comprovanteEnviadoEm?: Timestamp;
  comprovanteEnviadoPor?: FinancialActorReference;
  observacaoAdmin?: string;
  observacaoCliente?: string;
  criadoEm?: Timestamp;
  atualizadoEm?: Timestamp;
}

export interface FinancialOverviewUpcomingInstallment {
  id: string;
  numero: number;
  descricao: string;
  valor: number;
  vencimento?: Timestamp;
  status: FinancialInstallmentStatus;
}

export interface FinancialOverview {
  obraId: string;
  valorTotalContrato: number;
  valorPago: number;
  valorEmAberto: number;
  quantidadeParcelas: number;
  quantidadePagas: number;
  quantidadePendentes: number;
  proximaParcela?: FinancialOverviewUpcomingInstallment;
  atualizadoEm?: Timestamp;
}
