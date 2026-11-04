import type { Timestamp } from "firebase/firestore";

export type UploadKind = "pdf" | "image";

export type DocumentoTipoPdf =
  | "Contratos"
  | "Aditivos"
  | "Projetos"
  | "ART/RRT"
  | "Licenças"
  | "Notas Fiscais"
  | "Relatórios";

export type FotoTipoImagem = "Fundação" | "Estrutura" | "Cobertura" | "Fechamento";

interface UploadBaseDoc {
  createdAt: Timestamp;
  filename: string;
  contentType: string;
  storagePath: string;
  url: string;
  createdByUid: string;
  createdByNomeSnapshot?: string;
  observacao?: string;
}

export interface DocumentoDoc extends UploadBaseDoc {
  tipo: DocumentoTipoPdf;
}

export interface FotoDoc extends UploadBaseDoc {
  tipo: FotoTipoImagem;
  obraId?: string;
}