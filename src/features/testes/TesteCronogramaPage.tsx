import ScienceRounded from "@mui/icons-material/ScienceRounded";
import { useEffect, useMemo, type ComponentType, type ReactNode } from "react";
import { CronogramaObrasView } from "../cronograma-obras/CronogramaObrasPage";
import type { GanttGridProps } from "../cronograma-obras/components/GanttGrid";
import type { ContractTextTableProps } from "../cronograma-obras/components/ContractTextTable";
import { criarFontesFicticias } from "./fontesFicticias";
import "./testes.css";

/**
 * Base dos testes de visual do CronoObra (/testes/mki, /testes/mkii, /testes/mkiii): a página da produção, com dados
 * fictícios em memória, um tema e, se o teste quiser, outra grade para "Obra iniciada". CSS na pasta de cada teste.
 */
export function TesteCronogramaPage({ tema, nome, gradeIniciadas, gradeMestres, tabelaFinalizadas, abas }: { tema: "mki" | "mkii"; nome: string; gradeIniciadas?: ComponentType<GanttGridProps>; gradeMestres?: ComponentType<GanttGridProps>; tabelaFinalizadas?: ComponentType<ContractTextTableProps>; abas?: { prazos: ReactNode; filtrosCronograma?: ReactNode } }) {
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
      <CronogramaObrasView fontes={fontes} edicaoLiberada tema={tema} gradeIniciadas={gradeIniciadas} gradeMestres={gradeMestres} tabelaFinalizadas={tabelaFinalizadas} abas={abas} />
    </>
  );
}
