import { NOTICIAS_CATEGORIAS, type NoticiaCategoria, type NoticiasPorCategoria } from "@/types/noticias";

// Color of each news category: the chip in the category bar and the section title use the same one.
export const COR_CATEGORIA: Record<NoticiaCategoria, string> = {
  institucional: "bg-primary text-primary-foreground",
  economia: "bg-emerald-600 text-white",
  infraestrutura: "bg-secondary text-secondary-foreground",
  logistica: "bg-orange-500 text-white",
  inovacao: "bg-violet-600 text-white",
};

export const idDaCategoria = (categoria: NoticiaCategoria) => `noticias-${categoria}`;

// Institucional comes first when it has news; otherwise it goes last, after the external categories.
export const ordenarCategorias = (data: NoticiasPorCategoria): NoticiaCategoria[] => {
  const externas = NOTICIAS_CATEGORIAS.filter((categoria) => categoria !== "institucional");
  return (data.institucional?.length ?? 0) > 0 ? ["institucional", ...externas] : [...externas, "institucional"];
};
