import type { Timestamp } from "firebase/firestore";

export const NOTICIAS_CATEGORIAS = ["economia", "infraestrutura", "logistica", "inovacao", "institucional"] as const;

export type NoticiaCategoria = (typeof NOTICIAS_CATEGORIAS)[number];
export type NoticiaOrigem = "externa" | "institucional";
export type NoticiaStatus = "publicada" | "rascunho";

export type NoticiaAutorRef = {
  uid: string;
  nome?: string;
  email?: string;
};

export type NoticiaDoc = {
  id: string;
  titulo: string;
  resumo: string;
  conteudo?: string | null;
  url: string | null;
  imagemUrl: string | null;
  categoria: NoticiaCategoria;
  fonte: string;
  publicadoEm: Timestamp;
  origem: NoticiaOrigem;
  status: NoticiaStatus;
  tags: string[];
  destaque: boolean;
  hashDedupe: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  criadoPor?: NoticiaAutorRef | null;
  atualizadoPor?: NoticiaAutorRef | null;
};

export type NoticiaCreateInput = {
  titulo: string;
  resumo: string;
  conteudo?: string | null;
  url?: string | null;
  imagemUrl?: string | null;
  status: NoticiaStatus;
  tags: string[];
  destaque: boolean;
  publicadoEm: Date;
};

export type NoticiaUpdateInput = Partial<NoticiaCreateInput>;

export type NoticiasPorCategoria = Record<NoticiaCategoria, NoticiaDoc[]>;

export const NEWS_CATEGORY_LABELS: Record<NoticiaCategoria, string> = {
  economia: "Economia",
  infraestrutura: "Infraestrutura",
  logistica: "Logística",
  inovacao: "Inovação",
  institucional: "Institucional",
};