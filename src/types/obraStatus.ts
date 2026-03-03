import type { Timestamp } from "firebase/firestore";

export interface ObraStatusItem {
  id: string;
  label: string;
  done: boolean;
}

export interface ObraStatusFase {
  id: string;
  titulo: string;
  ordem: number;
  inicio: Timestamp | null;
  fim: Timestamp | null;
  itens: ObraStatusItem[];
  updatedAt?: unknown;
  updatedByUid?: string;
  updatedByNomeSnapshot?: string;
}

export type ObraStatusResumo = "-" | "Em andamento" | "Concluída";