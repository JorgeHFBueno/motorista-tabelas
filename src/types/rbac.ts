export type UserType = "cliente" | "funcionario";
export type UserRole = "admin" | "gerente" | "operacional" | "cliente";

export interface UserDoc {
  nome: string;
  tipo: UserType;
  role: UserRole;
  obras: string[];
  ativo: boolean;
  createdAt?: unknown;
}

export interface ObraDoc {
  id: string;
  nome: string;
  descricao?: string;
  status: "ativa" | "concluida";
  statusResumo?: "-" | "Em andamento" | "Concluída" | null;
  statusResumoUpdatedAt?: unknown;
  createdAt?: unknown;
}

export interface FirestoreItem {
  id: string;
  [key: string]: unknown;
}