import ScienceRounded from "@mui/icons-material/ScienceRounded";
import { useEffect, useMemo } from "react";
import { CronogramaObrasView } from "../../cronograma-obras/CronogramaObrasPage";
import { criarFontesFicticias } from "./fontesFicticias";
import "./mki.css";

/**
 * /testes/mki: o CronoObra com a identidade visual do Cronograma Logístico, em teste, com dados fictícios em memória.
 * Mesmo componente da produção; só muda a fonte dos dados e o tema.
 */
export default function TesteMkiPage() {
  const fontes = useMemo(() => criarFontesFicticias(), []);
  // Drawers and menus render outside the page: the theme class goes on <body> while this page is open.
  useEffect(() => {
    document.body.classList.add("co-tema-mki");
    return () => document.body.classList.remove("co-tema-mki");
  }, []);
  return (
    <>
      <div className="mki-aviso" role="note">
        <ScienceRounded fontSize="small" />
        <strong>Teste de interface (MKI)</strong>
        <span>Dados fictícios em memória: nada é salvo, e recarregar a página volta ao início.</span>
      </div>
      <CronogramaObrasView fontes={fontes} edicaoLiberada tema="mki" />
    </>
  );
}
