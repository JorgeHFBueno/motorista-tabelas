import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, Timestamp } from "firebase/firestore";
import { useContrato } from "@/contexts/ObraContext";
import { db } from "@/lib/firebase";
import { PORTAL_COLECOES, filtrosDoContrato, toArquivo, toMillis, type ArquivoPortal } from "@/lib/portal";
import type { ObraDoc } from "@/types/rbac";

// portal-fotos (Manuscript portal.md): sent by adm2, read-only for the client.
export const FOTO_ETAPAS = ["fundacao", "estrutura", "cobertura", "fechamento"] as const;

export type FotoEtapa = (typeof FOTO_ETAPAS)[number];

export const FOTO_ETAPA_LABELS: Record<FotoEtapa, string> = {
  fundacao: "Fundação",
  estrutura: "Estrutura",
  cobertura: "Cobertura",
  fechamento: "Fechamento",
};

export const etapaLabel = (etapa: string) => FOTO_ETAPA_LABELS[etapa as FotoEtapa] ?? "Outra";

export interface Foto {
  id: string;
  etapa: string;
  observacao: string | null;
  arquivo: ArquivoPortal | null;
  criadoEm?: Timestamp;
}

const listFotos = async (obra: ObraDoc): Promise<Foto[]> => {
  const snapshot = await getDocs(query(collection(db, PORTAL_COLECOES.fotos), ...filtrosDoContrato(obra)));
  return snapshot.docs
    .map((item) => {
      const data = item.data();
      return {
        id: item.id,
        etapa: typeof data.etapa === "string" ? data.etapa : "",
        observacao: typeof data.observacao === "string" && data.observacao.trim() ? data.observacao : null,
        arquivo: toArquivo(data.arquivo),
        criadoEm: data.criadoEm instanceof Timestamp ? data.criadoEm : undefined,
      };
    })
    .sort((a, b) => toMillis(b.criadoEm) - toMillis(a.criadoEm));
};

export const useFotosList = (obraId?: string | null, etapa?: FotoEtapa | null) => {
  const obra = useContrato(obraId);
  const fotos = useQuery({
    queryKey: ["fotos", obraId ?? ""],
    queryFn: () => listFotos(obra!),
    enabled: Boolean(obra),
  });
  return {
    ...fotos,
    data: etapa ? fotos.data?.filter((foto) => foto.etapa === etapa) : fotos.data,
  };
};
