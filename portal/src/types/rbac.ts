import type { Timestamp } from "firebase/firestore";

// Portal client profile: users/{uid} (Manuscript 01_FIRESTORE/COLECOES/users.md).
export interface UserDoc {
  nome: string;
  email?: string;
  // CNPJ/CPF (digits only) the login represents; decides which contracts the client sees.
  documentos: string[];
  ativo: boolean;
}

export interface PessoaRef {
  uid: string;
  nome: string;
}

export type ExecucaoEquipeTipo = "saida" | "chegada";

export interface ExecucaoEquipeConfirmacao {
  dataHora: Timestamp;
  confirmadoPor: PessoaRef;
  confirmadoEm?: Timestamp;
}

export interface ExecucaoEquipeConfirmacoes {
  saida?: ExecucaoEquipeConfirmacao | null;
  chegada?: ExecucaoEquipeConfirmacao | null;
}

// Contract shown in the portal: portal-obras/{obras-v2 id} (Manuscript 01_FIRESTORE/COLECOES/portal.md).
export interface ObraDoc {
  id: string;
  clienteDocumento: string;
  nome: string;
  local?: string | null;
  numeroContrato?: string | null;
  previsao?: { inicio: string | null; fim: string | null } | null;
  // Cents.
  valorContrato?: number | null;
  progresso?: unknown;
  equipe?: ExecucaoEquipeConfirmacoes | null;
}
