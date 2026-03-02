import type { Timestamp } from "firebase/firestore";

export const FOTO_ETAPAS = ["FUNDACAO", "ESTRUTURA", "COBERTURA", "FECHAMENTO"] as const;

export type FotoEtapa = (typeof FOTO_ETAPAS)[number];

export const FOTO_ETAPA_LABELS: Record<FotoEtapa, string> = {
  FUNDACAO: "Fundação",
  ESTRUTURA: "Estrutura",
  COBERTURA: "Cobertura",
  FECHAMENTO: "Fechamento",
};

export interface Foto {
  id: string;
  obraId: string;
  obraNomeSnapshot?: string | null;
  etapa: FotoEtapa;
  etapaLabel?: string;
  observacaoTecnica?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  filePath: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

export interface ListFotosInput {
  obraId?: string;
  etapa?: FotoEtapa | null;
  limitCount?: number;
}

export interface UploadFotoInput {
  file: File;
  obraId: string;
  obraNomeSnapshot?: string | null;
  etapa: FotoEtapa;
  observacaoTecnica?: string;
}