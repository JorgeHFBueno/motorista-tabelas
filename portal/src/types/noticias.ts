import type { Timestamp } from "firebase/firestore";

// portal-noticias (Manuscript portal.md).
export const NOTICIAS_CATEGORIAS = ["economia", "infraestrutura", "logistica", "inovacao", "institucional"] as const;

export type NoticiaCategoria = (typeof NOTICIAS_CATEGORIAS)[number];
export type NoticiaOrigem = "externa" | "institucional";

export type NoticiaDoc = {
  id: string;
  titulo: string;
  resumo: string;
  conteudo?: string | null;
  url: string | null;
  // External image link, or the download link of the institutional image (asked at read time).
  imagemUrl: string | null;
  categoria: NoticiaCategoria;
  fonte: string;
  publicadoEm?: Timestamp;
  origem: NoticiaOrigem;
  destaque: boolean;
};

export type NoticiasPorCategoria = Record<NoticiaCategoria, NoticiaDoc[]>;

export const NEWS_CATEGORY_LABELS: Record<NoticiaCategoria, string> = {
  economia: "Economia",
  infraestrutura: "Infraestrutura",
  logistica: "Logística",
  inovacao: "Inovação",
  institucional: "Institucional",
};
