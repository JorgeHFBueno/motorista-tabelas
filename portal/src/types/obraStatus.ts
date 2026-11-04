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

export interface ObraStatusData {
  etapas: ObraStatusEtapa[];
  // Progresso geral por media simples das etapas; cada etapa ja e media simples dos itens.
  progressoGeral: number;
  updatedAt?: unknown;
  updatedByUid?: string;
  updatedByNomeSnapshot?: string;
}

export type ObraStatusResumo = "-" | "Em andamento" | "Concluida";
