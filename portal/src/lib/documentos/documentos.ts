import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, Timestamp } from "firebase/firestore";
import { useContrato } from "@/contexts/ObraContext";
import { db } from "@/lib/firebase";
import { PORTAL_COLECOES, filtrosDoContrato, toArquivo, toMillis, type ArquivoPortal } from "@/lib/portal";
import type { ObraDoc } from "@/types/rbac";

// portal-documentos (Manuscript portal.md): sent by adm2, read-only for the client.
export const DOCUMENTO_CATEGORIAS = [
  { id: "contratos", label: "Contratos" },
  { id: "aditivos", label: "Aditivos" },
  { id: "projetos", label: "Projetos" },
  { id: "art_rrt", label: "ART / RRT" },
  { id: "licencas", label: "Licenças" },
  { id: "notas_fiscais", label: "Notas Fiscais" },
  { id: "relatorios", label: "Relatórios" },
] as const;

export type DocumentoCategoria = (typeof DOCUMENTO_CATEGORIAS)[number]["id"];

export const categoriaLabel = (categoria: string) =>
  DOCUMENTO_CATEGORIAS.find((item) => item.id === categoria)?.label ?? "Outros";

export interface Documento {
  id: string;
  titulo: string;
  categoria: string;
  arquivo: ArquivoPortal | null;
  criadoEm?: Timestamp;
}

const listDocumentos = async (obra: ObraDoc): Promise<Documento[]> => {
  const snapshot = await getDocs(query(collection(db, PORTAL_COLECOES.documentos), ...filtrosDoContrato(obra)));
  return snapshot.docs
    .map((item) => {
      const data = item.data();
      return {
        id: item.id,
        titulo: typeof data.titulo === "string" && data.titulo.trim() ? data.titulo : "Documento",
        categoria: typeof data.categoria === "string" ? data.categoria : "",
        arquivo: toArquivo(data.arquivo),
        criadoEm: data.criadoEm instanceof Timestamp ? data.criadoEm : undefined,
      };
    })
    .sort((a, b) => toMillis(b.criadoEm) - toMillis(a.criadoEm));
};

export const useDocumentosList = (obraId?: string | null) => {
  const obra = useContrato(obraId);
  return useQuery({
    queryKey: ["documentos", obraId ?? ""],
    queryFn: () => listDocumentos(obra!),
    enabled: Boolean(obra),
  });
};
