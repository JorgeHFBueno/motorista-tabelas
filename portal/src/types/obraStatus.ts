import type { PessoaRef } from "@/types/rbac";

export type ObraStatusProgressLabel =
  | "pendente"
  | "em_andamento"
  | "finalizando"
  | "completo";

export type ObraStatusControlMode = "percentual" | "checklist";

export interface ObraStatusItem {
  id: string;
  nome: string;
  ordem: number;
  progresso: number;
  status: ObraStatusProgressLabel;
}

export interface ObraStatusEtapa {
  id: string;
  nome: string;
  ordem: number;
  modoControle: ObraStatusControlMode;
  progresso: number;
  status: ObraStatusProgressLabel;
  itens: ObraStatusItem[];
}

// portal-obras/{id}.progresso (Manuscript portal.md), written by adm2.
export interface ObraStatusData {
  etapas: ObraStatusEtapa[];
  // Progresso geral por média simples das etapas; cada etapa já é média simples dos itens.
  progressoGeral: number;
  atualizadoEm?: unknown;
  atualizadoPor?: PessoaRef | null;
}
