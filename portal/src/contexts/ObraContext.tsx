import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { PORTAL_COLECOES } from "@/lib/portal";
import type { ObraDoc } from "@/types/rbac";

// Contracts of the client's CNPJ/CPF (portal-obras.clienteDocumento in users.documentos) and the active one.
interface ObraContextType {
  contratos: ObraDoc[];
  obraAtiva: ObraDoc | null;
  obraAtivaId: string | null;
  setObraAtivaId: (obraId: string) => void;
  isLoading: boolean;
  error: unknown;
}

const ObraContext = createContext<ObraContextType | undefined>(undefined);

const STORAGE_KEY = "portal:contrato-ativo";
// Firestore accepts at most 30 values in an `in` filter.
const IN_LIMIT = 30;

const readStoredId = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const toObraDoc = (id: string, data: Record<string, unknown>): ObraDoc => ({
  ...(data as Omit<ObraDoc, "id">),
  id,
  clienteDocumento: typeof data.clienteDocumento === "string" ? data.clienteDocumento : "",
  nome: typeof data.nome === "string" && data.nome.trim() ? data.nome : "Obra",
});

const listContratos = async (documentos: string[]): Promise<ObraDoc[]> => {
  const chunks = Array.from({ length: Math.ceil(documentos.length / IN_LIMIT) }, (_, index) =>
    documentos.slice(index * IN_LIMIT, (index + 1) * IN_LIMIT),
  );
  const snapshots = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(collection(db, PORTAL_COLECOES.obras), where("clienteDocumento", "in", chunk))),
    ),
  );
  return snapshots
    .flatMap((snapshot) => snapshot.docs.map((item) => toObraDoc(item.id, item.data())))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
};

export const ObraProvider = ({ children }: { children: ReactNode }) => {
  const { user, userDoc } = useAuth();
  const documentos = useMemo(
    () => (userDoc?.ativo ? userDoc.documentos : []),
    [userDoc?.ativo, userDoc?.documentos],
  );
  const [selectedId, setSelectedId] = useState<string | null>(readStoredId);

  const contratosQuery = useQuery({
    queryKey: ["contratos", user?.uid ?? "", documentos.join(",")],
    queryFn: () => listContratos(documentos),
    enabled: Boolean(user) && documentos.length > 0,
  });

  const setObraAtivaId = useCallback((obraId: string) => {
    setSelectedId(obraId);
    try {
      localStorage.setItem(STORAGE_KEY, obraId);
    } catch {
      // Remembering the choice is a convenience only.
    }
  }, []);

  const value = useMemo(() => {
    const contratos = contratosQuery.data ?? [];
    const obraAtiva = contratos.find((contrato) => contrato.id === selectedId) ?? contratos[0] ?? null;
    return {
      contratos,
      obraAtiva,
      obraAtivaId: obraAtiva?.id ?? null,
      setObraAtivaId,
      isLoading: documentos.length > 0 && contratosQuery.isLoading,
      error: contratosQuery.error,
    };
  }, [contratosQuery.data, contratosQuery.error, contratosQuery.isLoading, documentos.length, selectedId, setObraAtivaId]);

  return <ObraContext.Provider value={value}>{children}</ObraContext.Provider>;
};

export const useObra = () => {
  const context = useContext(ObraContext);
  if (!context) {
    throw new Error("useObra must be used within an ObraProvider");
  }
  return context;
};

// One of the client's contracts by ID (the record queries need its clienteDocumento).
export const useContrato = (obraId?: string | null) => {
  const { contratos } = useObra();
  return useMemo(() => contratos.find((contrato) => contrato.id === obraId) ?? null, [contratos, obraId]);
};
