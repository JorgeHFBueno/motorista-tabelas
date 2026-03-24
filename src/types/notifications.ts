import type { Timestamp } from "firebase/firestore";

export const NOTIFICATION_TYPES = [
  "foto_nova",
  "documento_novo",
  "progresso_obra",
  "financeiro_nova_parcela",
  "financeiro_boleto_disponivel",
  "financeiro_status_alterado",
  "financeiro_vencimento_proximo",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationMetadata {
  nomeArquivo?: string;
  etapa?: string;
  statusAnterior?: string;
  statusNovo?: string;
  numeroParcela?: number;
  vencimento?: string;
  valor?: number;
  diasParaVencimento?: number;
  rotaDestino?: string;
  warningKey?: string;
  [key: string]: unknown;
}

export interface AppNotification {
  id: string;
  userId: string;
  obraId: string;
  tipo: NotificationType;
  titulo: string;
  mensagem: string;
  lida: boolean;
  createdAt?: Timestamp;
  origemColecao?: string | null;
  origemId?: string | null;
  metadata?: NotificationMetadata;
}