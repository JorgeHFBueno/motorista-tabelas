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

export interface DocumentoAssinatura {
  nome: string;
  papel: "Contratante" | "Contratada" | string;
  assinadoEm?: Timestamp;
  ip?: string;
  metodo?: string;
  status: "ASSINADO" | "PENDENTE";
}

export interface DocumentoAuditoria {
  titulo: string;
  em?: Timestamp;
  por: string;
  ip?: string;
}

export interface DocumentoVersao {
  versao: string;
  descricao: string;
  em?: Timestamp;
  por: string;
}

export interface DocumentoCertificado {
  id: string;
  validadeJuridica: string;
  hash: string;
  algoritmo: "SHA-256";
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
  assinaturas?: DocumentoAssinatura[];
  auditoria?: DocumentoAuditoria[];
  versoes?: DocumentoVersao[];
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