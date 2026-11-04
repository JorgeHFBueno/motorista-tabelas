import { createContext, useContext, useMemo, useState, ReactNode } from "react";
import type { ObraDoc } from "@/types/rbac";

interface ObraContextType {
  obraAtivaId: string | null;
  setObraAtivaId: (obraId: string | null) => void;
  obraAtiva: ObraDoc | null;
  setObraAtiva: (obra: ObraDoc | null) => void;
}

const ObraContext = createContext<ObraContextType | undefined>(undefined);

export const ObraProvider = ({ children }: { children: ReactNode }) => {
  const [obraAtivaId, setObraAtivaId] = useState<string | null>(null);
  const [obraAtiva, setObraAtiva] = useState<ObraDoc | null>(null);

  const value = useMemo(
    () => ({
      obraAtivaId,
      setObraAtivaId,
      obraAtiva,
      setObraAtiva,
    }),
    [obraAtiva, obraAtivaId],
  );
  return <ObraContext.Provider value={value}>{children}</ObraContext.Provider>;
};

export const useObra = () => {
  const context = useContext(ObraContext);
  if (!context) {
    throw new Error("useObra must be used within an ObraProvider");
  }
  return context;
};
