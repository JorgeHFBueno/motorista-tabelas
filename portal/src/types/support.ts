import type { Timestamp } from "firebase/firestore";

export const SUPPORT_TICKET_CATEGORIES = ["tecnico", "financeiro", "comercial", "outro"] as const;
export const SUPPORT_TICKET_PRIORITIES = ["baixa", "media", "alta"] as const;
export const SUPPORT_TICKET_STATUSES = [
  "aberto",
  "em_andamento",
  "aguardando_cliente",
  "resolvido",
  "fechado",
] as const;
export const SUPPORT_AUTHOR_TYPES = ["cliente", "admin"] as const;

export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];
export type SupportAuthorType = (typeof SUPPORT_AUTHOR_TYPES)[number];

export interface SupportAttachment {
  nome: string;
  url: string;
  contentType?: string | null;
}

export interface SupportTicket {
  id: string;
  clienteUid: string;
  clienteNome: string;
  clienteEmail?: string | null;
  obraId?: string | null;
  obraNome?: string | null;
  titulo: string;
  descricaoInicial: string;
  categoria: SupportTicketCategory;
  prioridade: SupportTicketPriority;
  status: SupportTicketStatus;
  criadoEm?: Timestamp;
  atualizadoEm?: Timestamp;
  criadoPorTipo: SupportAuthorType;
  responsavelUid?: string | null;
  responsavelNome?: string | null;
  ultimaMensagemResumo: string;
  ultimaMensagemEm?: Timestamp;
  ultimaMensagemPorTipo: SupportAuthorType;
  naoLidasCliente: number;
  naoLidasAdmin: number;
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

export interface CreateSupportTicketInput {
  clienteUid: string;
  clienteNome: string;
  clienteEmail?: string | null;
  titulo: string;
  descricaoInicial: string;
  categoria: SupportTicketCategory;
  prioridade: SupportTicketPriority;
  obraId?: string | null;
  obraNome?: string | null;
}

export interface ReplySupportTicketInput {
  mensagem: string;
}

export interface UpdateSupportTicketAdminInput {
  status?: SupportTicketStatus;
  categoria?: SupportTicketCategory;
  prioridade?: SupportTicketPriority;
  responsavelUid?: string | null;
  responsavelNome?: string | null;
}

export interface SupportActor {
  uid: string;
  nome: string;
  email?: string | null;
  tipo: SupportAuthorType;
}

export interface SupportTicketFilters {
  status: SupportTicketStatus | "todos";
  categoria: SupportTicketCategory | "todas";
  prioridade: SupportTicketPriority | "todas";
  busca: string;
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

export const isSupportTicketClosed = (status?: SupportTicketStatus | null) =>
  status === "fechado";
