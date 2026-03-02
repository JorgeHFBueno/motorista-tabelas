import type { Timestamp } from "firebase/firestore";

export const DOCUMENT_CATEGORIES = [
  "Contratos",
  "Aditivos",
  "Projetos",
  "ART / RRT",
  "Licenças",
  "Notas Fiscais",
  "Relatórios",
] as const;

export type DocumentoCategoria = (typeof DOCUMENT_CATEGORIES)[number];

export type DocumentoStatus = "Finalizado" | "Aguardando" | "Requer assinatura";

export type AssinaturaStatus = "ASSINADO" | "AGUARDANDO" | "REQUER_ASSINATURA";

export interface DocumentoCertificado {
  id: string;
  validadeJuridica: string;
  hash: string;
  algoritmo: "SHA-256";
}

export interface DocumentoAssinaturasResumo {
  total: number;
  assinadas: number;
  pendentes: number;
}

export interface DocumentoAuditoriaResumo {
  ultimoEventoTitulo?: string;
  ultimoEventoEm?: Timestamp;
}

export interface DocumentoVersoesResumo {
  atual?: string;
  total?: number;
}

export interface Documento {
  id: string;
  titulo: string;
  categoria: DocumentoCategoria;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  obraId?: string;
  obraNomeSnapshot?: string;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  mimeType: string;
  status: DocumentoStatus;
  requerAssinatura: boolean;
  assinaturaStatus: AssinaturaStatus;
  certificado?: DocumentoCertificado;
  assinaturasResumo?: DocumentoAssinaturasResumo;
  auditoriaResumo?: DocumentoAuditoriaResumo;
  versoesResumo?: DocumentoVersoesResumo;
}

export interface AuditoriaEvento {
  id: string;
  titulo: string;
  por: string;
  ip?: string;
  createdAt?: Timestamp;
  meta?: Record<string, unknown>;
}

export interface VersaoDocumento {
  id: string;
  versao: string;
  descricao: string;
  por: string;
  createdAt?: Timestamp;
}

export interface AssinaturaDocumento {
  id: string;
  nome: string;
  papel: string;
  metodo?: string;
  ip?: string;
  status: "ASSINADO" | "PENDENTE";
  assinadoEm?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ListDocumentosInput {
  obraId?: string;
  categoria: DocumentoCategoria | null;
  searchText: string;
}

export interface UploadDocumentoInput {
  file: File;
  categoria: DocumentoCategoria;
  titulo: string;
  obraId?: string;
  obraNomeSnapshot?: string;
  requerAssinatura?: boolean;
}

export interface AddAuditoriaEventInput {
  titulo: string;
  por: string;
  ip?: string;
  meta?: Record<string, unknown>;
}

export interface AddVersaoInput {
  versao: string;
  descricao: string;
  por: string;
}

export interface AddAssinaturaInput {
  nome: string;
  papel: string;
  metodo?: string;
  ip?: string;
  status?: "ASSINADO" | "PENDENTE";
  assinadoEm?: Timestamp;
}