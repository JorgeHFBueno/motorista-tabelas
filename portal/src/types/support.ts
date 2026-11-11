import type { Timestamp } from "firebase/firestore";
import type { PessoaRef } from "@/types/rbac";

// portal-atendimentos and their mensagens (Manuscript portal.md).
export const SUPPORT_TICKET_CATEGORIES = ["tecnico", "financeiro", "comercial", "outro"] as const;
export const SUPPORT_TICKET_PRIORITIES = ["baixa", "media", "alta"] as const;
export const SUPPORT_TICKET_STATUSES = [
  "aberto",
  "em_andamento",
  "aguardando_cliente",
  "resolvido",
  "fechado",
] as const;

export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];
export type SupportAuthorType = "cliente" | "equipe";

// The client does not pick the priority: it follows the category.
export const PRIORIDADE_DA_CATEGORIA: Record<SupportTicketCategory, SupportTicketPriority> = {
  tecnico: "media",
  financeiro: "alta",
  comercial: "alta",
  outro: "baixa",
};

// A ticket about a new construction: commercial, marked novaObra, and linked to the active contract (the Rules ask
// every ticket for a contract of the client).
export const NOVA_OBRA = "nova-obra";
export const NOVA_OBRA_LABEL = "Nova obra";

export interface SupportAttachment {
  nome: string;
  path: string;
  contentType?: string | null;
}

export interface SupportTicket {
  id: string;
  obraId: string;
  // Opened through "Nova obra": about a new construction, not about the linked contract.
  novaObra: boolean;
  clienteDocumento: string;
  criadoPor: PessoaRef | null;
  titulo: string;
  descricaoInicial: string;
  categoria: SupportTicketCategory;
  prioridade: SupportTicketPriority;
  status: SupportTicketStatus;
  responsavel: PessoaRef | null;
  ultimaMensagemResumo: string;
  ultimaMensagemEm?: Timestamp;
  ultimaMensagemPorTipo: SupportAuthorType;
  naoLidasCliente: number;
  naoLidasEquipe: number;
  criadoEm?: Timestamp;
  atualizadoEm?: Timestamp;
}

export interface SupportTicketMessage {
  id: string;
  autorUid: string;
  autorNome: string;
  autorTipo: SupportAuthorType;
  mensagem: string;
  criadoEm?: Timestamp;
  anexos?: SupportAttachment[];
}

export const SUPPORT_CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  tecnico: "Técnico",
  financeiro: "Financeiro",
  comercial: "Comercial",
  outro: "Outro",
};

export const SUPPORT_PRIORITY_LABELS: Record<SupportTicketPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

export const SUPPORT_STATUS_STYLES: Record<SupportTicketStatus, string> = {
  aberto: "bg-amber-500/10 text-amber-700 border-amber-200",
  em_andamento: "bg-sky-500/10 text-sky-700 border-sky-200",
  aguardando_cliente: "bg-violet-500/10 text-violet-700 border-violet-200",
  resolvido: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  fechado: "bg-zinc-500/10 text-zinc-700 border-zinc-200",
};

export const SUPPORT_PRIORITY_STYLES: Record<SupportTicketPriority, string> = {
  baixa: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  media: "bg-amber-500/10 text-amber-700 border-amber-200",
  alta: "bg-rose-500/10 text-rose-700 border-rose-200",
};

export const isSupportTicketClosed = (status?: SupportTicketStatus | null) => status === "fechado";
