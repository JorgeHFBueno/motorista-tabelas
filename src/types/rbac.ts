import type { ObraStatusData } from "@/types/obraStatus";
import type { Timestamp } from "firebase/firestore";

export type UserType = "cliente" | "funcionario";
export type UserRole = "admin" | "gerente" | "operacional" | "cliente";

export interface UserDoc {
  nome: string;
  email?: string;
  emailLower?: string;
  tipo: UserType;
  role: UserRole;
  obras: string[];
  ativo: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ObraDoc {
  id: string;
  nome: string;
  descricao?: string;
  status: "ativa" | "concluida";
  statusResumo?: "-" | "Em andamento" | "Concluida" | null;
  statusResumoUpdatedAt?: unknown;
  statusObra?: ObraStatusData | null;
  execucaoEquipe?: ExecucaoEquipeConfirmacoes | null;
  valorTotalContrato?: number | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FirestoreItem {
  id: string;
  [key: string]: unknown;
}

export type ExecucaoEquipeTipo = "saida" | "chegada";

export interface ExecucaoEquipeConfirmacao {
  confirmado: true;
  dataHora: Timestamp;
  confirmadoPorUid: string;
  confirmadoPorNome: string;
  updatedAt?: unknown;
}

export interface ExecucaoEquipeConfirmacoes {
  saida?: ExecucaoEquipeConfirmacao | null;
  chegada?: ExecucaoEquipeConfirmacao | null;
}
