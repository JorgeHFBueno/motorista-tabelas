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
  statusResumo?: "-" | "Em andamento" | "Concluída" | null;
  statusResumoUpdatedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FirestoreItem {
  id: string;
  [key: string]: unknown;
}