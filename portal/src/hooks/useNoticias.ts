import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PORTAL_COLECOES, toArquivo, toMillis, urlDoArquivo } from "@/lib/portal";
import {
  NOTICIAS_CATEGORIAS,
  type NoticiaCategoria,
  type NoticiaDoc,
  type NoticiasPorCategoria,
} from "@/types/noticias";

const POR_CATEGORIA = 5;

const toNoticia = async (id: string, data: Record<string, unknown>): Promise<NoticiaDoc | null> => {
  if (!NOTICIAS_CATEGORIAS.includes(data.categoria as NoticiaCategoria)) return null;
  const imagemUrl =
    typeof data.imagemUrl === "string" && data.imagemUrl.trim()
      ? data.imagemUrl
      : ((await urlDoArquivo(toArquivo(data.imagem))) ?? null);

  return {
    id,
    titulo: typeof data.titulo === "string" ? data.titulo : "",
    resumo: typeof data.resumo === "string" ? data.resumo : "",
    conteudo: typeof data.conteudo === "string" ? data.conteudo : null,
    url: typeof data.url === "string" ? data.url : null,
    imagemUrl,
    categoria: data.categoria as NoticiaCategoria,
    fonte: typeof data.fonte === "string" ? data.fonte : "Ledur",
    publicadoEm: data.publicadoEm instanceof Timestamp ? data.publicadoEm : undefined,
    origem: data.origem === "externa" ? "externa" : "institucional",
    destaque: data.destaque === true,
  };
};

// Published news outside the trash (the filters the Rules require), newest first, five per category.
// Sorting happens here, so no composite index is needed.
const listNoticiasPublicadas = async (): Promise<NoticiasPorCategoria> => {
  const snapshot = await getDocs(
    query(collection(db, PORTAL_COLECOES.noticias), where("status", "==", "publicada"), where("excluidoEm", "==", null)),
  );
  const noticias = (await Promise.all(snapshot.docs.map((item) => toNoticia(item.id, item.data()))))
    .filter((noticia): noticia is NoticiaDoc => noticia !== null)
    .sort((a, b) => toMillis(b.publicadoEm) - toMillis(a.publicadoEm));

  return Object.fromEntries(
    NOTICIAS_CATEGORIAS.map((categoria) => [
      categoria,
      noticias.filter((noticia) => noticia.categoria === categoria).slice(0, POR_CATEGORIA),
    ]),
  ) as NoticiasPorCategoria;
};

export const usePublicNoticias = () => {
  const noticias = useQuery({
    queryKey: ["noticias", "publicadas"],
    queryFn: listNoticiasPublicadas,
    staleTime: 15 * 1000,
  });

  return {
    ...noticias,
    data: noticias.data ?? (Object.fromEntries(NOTICIAS_CATEGORIAS.map((c) => [c, []])) as unknown as NoticiasPorCategoria),
  };
};
