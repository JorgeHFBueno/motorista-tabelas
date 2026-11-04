import type { Timestamp } from "firebase/firestore";

export const FINANCIAL_INSTALLMENT_STATUSES = [
  "pendente",
  "comprovante_enviado",
  "pago",
  "rejeitado",
] as const;

export type FinancialInstallmentStatus = (typeof FINANCIAL_INSTALLMENT_STATUSES)[number];
export type ParcelaFinanceiraStatus = FinancialInstallmentStatus;

export interface FinancialFileReference {
  url?: string;
  path?: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
}

export interface FinancialActorReference {
  uid?: string;
  nome?: string;
  email?: string;
}

export interface FinancialInstallment {
  id: string;
  obraId: string;
  numero: number;
  descricao: string;
  valor: number;
  vencimento?: Timestamp;
  status: FinancialInstallmentStatus;
  boletoUrl?: string;
  boletoPath?: string;
  comprovanteUrl?: string;
  comprovantePath?: string;
  comprovanteEnviadoEm?: Timestamp;
  comprovanteEnviadoPor?: FinancialActorReference;
  confirmadoPagoEm?: Timestamp;
  confirmadoPagoPor?: FinancialActorReference;
  observacaoAdmin?: string;
  observacaoCliente?: string;
  criadoEm?: Timestamp;
  atualizadoEm?: Timestamp;
  boleto?: FinancialFileReference;
  comprovante?: FinancialFileReference;
}

export type ParcelaFinanceira = FinancialInstallment;

export interface FinancialOverviewUpcomingInstallment {
  id: string;
  numero: number;
  descricao: string;
  valor: number;
  vencimento?: Timestamp;
  status: FinancialInstallmentStatus;
}

export interface ObraFinancialSummary {
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

export type FinancialOverview = ObraFinancialSummary;

export interface ListFinancialInstallmentsInput {
  obraId?: string;
  includeRejected?: boolean;
}

export interface CreateFinancialInstallmentInput {
  obraId: string;
  numero: number;
  descricao: string;
  valor: number;
  vencimento?: Timestamp | Date | null;
  status?: FinancialInstallmentStatus;
  boletoUrl?: string;
  boletoPath?: string;
  observacaoAdmin?: string;
}

export interface UpdateFinancialInstallmentInput {
  numero?: number;
  descricao?: string;
  valor?: number;
  vencimento?: Timestamp | Date | null;
  status?: FinancialInstallmentStatus;
  boletoUrl?: string | null;
  boletoPath?: string | null;
  observacaoAdmin?: string | null;
  observacaoCliente?: string | null;
}

export interface UploadFinancialBoletoPayload {
  parcelaId: string;
  obraId: string;
  fileName: string;
  contentType?: string;
  sizeBytes?: number;
  boletoUrl?: string;
  boletoPath: string;
}

export interface SubmitFinancialReceiptPayload {
  parcelaId: string;
  obraId: string;
  comprovanteUrl?: string;
  comprovantePath: string;
  observacaoCliente?: string;
  comprovanteEnviadoPor?: FinancialActorReference;
  comprovanteEnviadoEm?: Timestamp | Date | null;
}

export interface ReviewFinancialReceiptPayload {
  parcelaId: string;
  obraId: string;
  aprovado: boolean;
  observacaoAdmin?: string;
  confirmadoPagoPor?: FinancialActorReference;
  confirmadoPagoEm?: Timestamp | Date | null;
}