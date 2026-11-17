import ScienceRounded from "@mui/icons-material/ScienceRounded";
import { useEffect, useMemo, type ComponentType } from "react";
import { CronogramaObrasView } from "../cronograma-obras/CronogramaObrasPage";
import type { GanttGridProps } from "../cronograma-obras/components/GanttGrid";
import { criarFontesFicticias } from "./fontesFicticias";
import "./testes.css";

/**
 * Base dos testes de visual do CronoObra (/testes/mki, /testes/mkii): o mesmo componente da produção, com dados
 * fictícios em memória e um tema. O CSS de cada tema fica na pasta do teste, sob .co-tema-<tema>.
 */
export function TesteCronogramaPage({ tema, nome, gradeIniciadas }: { tema: "mki" | "mkii"; nome: string; gradeIniciadas?: ComponentType<GanttGridProps> }) {
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
      <CronogramaObrasView fontes={fontes} edicaoLiberada tema={tema} gradeIniciadas={gradeIniciadas} />
    </>
  );
}
