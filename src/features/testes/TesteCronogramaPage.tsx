import ScienceRounded from "@mui/icons-material/ScienceRounded";
import { useEffect, useMemo } from "react";
import { CronogramaObrasView } from "../cronograma-obras/CronogramaObrasPage";
import { criarFontesFicticias } from "./fontesFicticias";
import "./testes.css";

/**
 * Base dos testes de visual do CronoObra (hoje, /testes/mki): a página da produção com dados fictícios em memória e
 * um tema. Sem as grades e abas que a produção passa, ela mostra o layout anterior (GanttGrid e barra de indicadores).
 * CSS na pasta de cada teste.
 */
export function TesteCronogramaPage({ tema, nome }: { tema: "mki" | "mkii"; nome: string }) {
  const fontes = useMemo(() => criarFontesFicticias(), []);
  // Drawers and menus render outside the page: the theme class goes on <body> while this page is open.
  useEffect(() => {
    document.body.classList.add(`co-tema-${tema}`);
    return () => document.body.classList.remove(`co-tema-${tema}`);
  }, [tema]);
  return (
    <>
      <div className={`teste-aviso teste-aviso--${tema}`} role="note">
        <ScienceRounded fontSize="small" />
        <strong>Teste de interface · {nome}</strong>
        <span>Dados fictícios em memória: nada é salvo, e recarregar a página volta ao início.</span>
      </div>
      <CronogramaObrasView fontes={fontes} edicaoLiberada tema={tema} />
    </>
  );
}
