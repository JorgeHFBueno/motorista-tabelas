import type { DocumentoTipoPdf, FotoTipoImagem } from "@/types/upload";

export const DOCUMENTO_TIPOS_PDF: DocumentoTipoPdf[] = [
  "Contratos",
  "Aditivos",
  "Projetos",
  "ART/RRT",
  "Licenças",
  "Notas Fiscais",
  "Relatórios",
];

export const FOTO_TIPOS_IMAGEM: FotoTipoImagem[] = ["Fundação", "Estrutura", "Cobertura", "Fechamento"];

export const ACCEPTED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpg",
  "image/jpeg",
  "image/webp",
] as const;