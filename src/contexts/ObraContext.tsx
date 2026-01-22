import { createContext, useContext, useState, ReactNode } from "react";

// Mock data - em produção viria do backend
const obrasDisponiveis = [
  {
    id: 1,
    nome: "Residência Silva",
    endereco: "Rua das Flores, 123 - Porto Alegre/RS",
  },
  {
    id: 2,
    nome: "Galpão Industrial Metalúrgica ABC",
    endereco: "Av. Industrial, 500 - Canoas/RS",
  },
  {
    id: 3,
    nome: "Centro de Distribuição Logística Norte",
    endereco: "Rod. BR-116, Km 42 - Novo Hamburgo/RS",
  },
];

interface Obra {
  id: number;
  nome: string;
  endereco: string;
}

interface ObraContextType {
  obraAtiva: Obra;
  obras: Obra[];
  setObraAtiva: (obra: Obra) => void;
}

const ObraContext = createContext<ObraContextType | undefined>(undefined);

export const ObraProvider = ({ children }: { children: ReactNode }) => {
  const [obraAtiva, setObraAtiva] = useState<Obra>(obrasDisponiveis[0]);

  return (
    <ObraContext.Provider
      value={{
        obraAtiva,
        obras: obrasDisponiveis,
        setObraAtiva,
      }}
    >
      {children}
    </ObraContext.Provider>
  );
};

export const useObra = () => {
  const context = useContext(ObraContext);
  if (!context) {
    throw new Error("useObra must be used within an ObraProvider");
  }
  return context;
};
