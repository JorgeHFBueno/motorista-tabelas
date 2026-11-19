import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import { useState, type CSSProperties } from "react";
import { ContractAnalysisRequest } from "../components/ContractAnalysisRequest";
import { displayOptionalValue, type ContractTextTableProps } from "../components/ContractTextTable";
import { LoteStatusControl } from "../components/LoteStatusControl";
import { StatusBadge } from "../components/StatusBadge";
import { requiresContractReview } from "../data/source/obrasV2CronogramaAdapter";
import { buildFlatWorkGroupsByWorkType, groupContractGroupsByWorkType, groupObrasByContract, type ContractGroup } from "../domain/contractGroups";
import { startedMasterPeriods } from "../domain/masterPlanningDetails";
import { getMestreColor } from "../domain/mestres";
import type { ContratoCronograma, ObraCronograma } from "../domain/models";
import { nextTableSort, sortContractGroups, sortObras, type ColumnId, type TableSort } from "../domain/tableSort";
import { formatDateShort, inclusiveCivilDays, todayCivil } from "../domain/temporal";

/**
 * CronoObra: listas de Obra não iniciada e Obra finalizada no mesmo padrão da grade de Obra iniciada (sem calendário).
 * Obra com o LOTE e o contrato, Contrato, Emp., Status e, conforme a seção, Ordem de início e Recurso (não iniciada,
 * com o "Iniciar") ou Mestres (finalizada, os que já começaram); Início e Dias; ordenável. Na visão Contratos, cada
 * contrato mostra "n LOTE(s)" e abre os seus LOTEs; contrato sem LOTE leva o "!" de Analisar contrato. Recolhida, a
 * seção não mostra a tabela. Recebe as mesmas props da ContractTextTable.
 */
type Coluna = { id: Extract<ColumnId, "obra" | "contrato" | "empresa" | "status" | "mestres" | "ordemInicio" | "confirmacaoRecurso" | "inicio" | "dias">; rotulo: string; largura: number };
const COLUNAS_FINALIZADA: readonly Coluna[] = [
  { id: "obra", rotulo: "Obra", largura: 300 },
  { id: "contrato", rotulo: "Contrato", largura: 96 },
  { id: "empresa", rotulo: "Emp.", largura: 80 },
  { id: "status", rotulo: "Status", largura: 150 },
  { id: "mestres", rotulo: "Mestres", largura: 130 },
  { id: "inicio", rotulo: "Início", largura: 84 },
  { id: "dias", rotulo: "Dias", largura: 64 },
];
const COLUNAS_NAO_INICIADA: readonly Coluna[] = [
  { id: "obra", rotulo: "Obra", largura: 300 },
  { id: "contrato", rotulo: "Contrato", largura: 96 },
  { id: "empresa", rotulo: "Emp.", largura: 80 },
  { id: "status", rotulo: "Status", largura: 160 },
  { id: "ordemInicio", rotulo: "Ordem de início", largura: 130 },
  { id: "confirmacaoRecurso", rotulo: "Recurso", largura: 130 },
  { id: "inicio", rotulo: "Início", largura: 84 },
  { id: "dias", rotulo: "Dias", largura: 64 },
];
const GRUPO_NOME: Record<string, string> = { "OBRAS PÚBLICAS": "Obras públicas", "OBRAS PRIVADAS": "Obras privadas" };

export function QuadroLista({ obras, contratos, viewMode = "contracts", onOpenContract, onSelect, onSelectMasters, onStatusConfirmed, sectionTitle, sectionExpanded, variant = "finished" }: ContractTextTableProps) {
  const [sort, setSort] = useState<TableSort>({ column: null, direction: null });
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
  const hoje = todayCivil();
  if (!sectionExpanded) return null;
  const naoIniciada = variant === "not-started";
  const colunas = naoIniciada ? COLUNAS_NAO_INICIADA : COLUNAS_FINALIZADA;
  const largura = colunas.reduce((total, coluna) => total + coluna.largura, 0);
  const estilo = { "--qg-esq": `${largura}px`, "--qg-esq-colunas": colunas.map((coluna) => `${coluna.largura}px`).join(" "), "--qg-total": `${largura}px` } as CSSProperties;

  const chips = (lista: readonly ObraCronograma[]) => {
    const iniciados = [...new Map(lista.flatMap((obra) => startedMasterPeriods(obra, hoje)).map((m) => [m.key, m.nome])).entries()];
    return iniciados.length ? iniciados.map(([chave, nome]) => { const cor = getMestreColor(chave); return <span key={chave} className="qg-mestre" style={{ background: cor.background, color: cor.text }}>{nome}</span>; }) : <span className="qg-sem-mestre">Sem mestre</span>;
  };
  const botaoContrato = (contrato: ContratoCronograma | undefined, titulo = false) => (
    <button type="button" className={`qg-contrato ${titulo ? "qg-contrato--titulo" : ""}`} title={contrato?.nome} onClick={(e) => { e.stopPropagation(); if (contrato) onOpenContract(contrato); }}>{contrato?.nome ?? "—"}</button>
  );

  const linhaObra = (obra: ObraCronograma, filho = false) => {
    const contrato = contratos.get(obra.contratoId ?? "");
    // "Analisar Contrato": the synthetic row of a contract without LOTEs.
    const analisar = obra.targetType === "contrato" && contrato && requiresContractReview(contrato);
    const celula = (coluna: Coluna) => {
      switch (coluna.id) {
        case "obra": return <div key="obra" className="qg-obra"><div className="qg-obra-textos">{analisar ? <span className="qg-lote"><ContractAnalysisRequest contrato={contrato} variant="alert" /></span> : <span className="qg-lote" title={obra.nomeObra}>{obra.nomeObra}</span>}{botaoContrato(contrato)}</div></div>;
        case "contrato": return <span key="contrato" className="qg-numero">{contrato?.numeroContrato ?? "—"}</span>;
        case "empresa": return <span key="empresa" className="qg-texto">{obra.empresa || contrato?.empresa || "—"}</span>;
        case "status": return naoIniciada
          ? <div key="status" className="qg-status" onClick={(e) => e.stopPropagation()}>{obra.targetType === "obra" && obra.loteId ? <LoteStatusControl obra={obra} canStart onStatusConfirmed={onStatusConfirmed} /> : <StatusBadge status={contrato?.status ?? "Sem status"} />}</div>
          : <span key="status" className="qg-status"><StatusBadge status={obra.status} /></span>;
        case "mestres": return <button key="mestres" type="button" className="qg-mestres" onClick={(e) => { e.stopPropagation(); onSelectMasters(obra); }}>{chips([obra])}</button>;
        case "ordemInicio": return <span key="ordemInicio" className="qg-texto">{displayOptionalValue(contrato?.ordemInicio)}</span>;
        case "confirmacaoRecurso": return <span key="confirmacaoRecurso" className="qg-texto">{displayOptionalValue(contrato?.confirmacaoRecurso)}</span>;
        case "inicio": return <span key="inicio" className="qg-numero">{formatDateShort(obra.inicioPlanejado ?? contrato?.inicio)}</span>;
        case "dias": return <span key="dias" className="qg-numero">{obra.tempoPlanejado ?? inclusiveCivilDays(contrato?.inicio, contrato?.fim) ?? "—"}</span>;
      }
    };
    return (
      <div key={obra.id} className={`qg-linha ${filho ? "qg-linha--filho" : ""}`} style={{ minHeight: 48 }}>
        <div className="qg-esq" onClick={() => onSelect(obra)}>{colunas.map(celula)}</div>
      </div>
    );
  };

  const linhaContrato = (grupo: ContractGroup) => {
    const contrato = contratos.get(grupo.id);
    const aberto = abertos.has(grupo.id);
    const lotes = grupo.obras.filter((obra) => obra.targetType === "obra").length;
    const alternar = () => setAbertos((atual) => { const proximo = new Set(atual); if (proximo.has(grupo.id)) proximo.delete(grupo.id); else proximo.add(grupo.id); return proximo; });
    const celula = (coluna: Coluna) => {
      switch (coluna.id) {
        case "obra": return (
          <div key="obra" className="qg-obra">
            <ExpandMoreRounded className={`qg-seta ${aberto ? "" : "is-fechada"}`} fontSize="small" />
            <div className="qg-obra-textos">{botaoContrato(contrato, true)}<span className="qg-lote">{lotes ? `${lotes} ${lotes === 1 ? "LOTE" : "LOTEs"}` : "Sem LOTE"}</span></div>
            {contrato && requiresContractReview(contrato) && <ContractAnalysisRequest contrato={contrato} variant="indicator" />}
          </div>
        );
        case "contrato": return <span key="contrato" className="qg-numero">{contrato?.numeroContrato ?? "—"}</span>;
        case "empresa": return <span key="empresa" className="qg-texto">{contrato?.empresa || "—"}</span>;
        case "status": return <span key="status" className="qg-status"><StatusBadge status={contrato?.status ?? "Sem status"} /></span>;
        case "mestres": return <span key="mestres" className="qg-mestres">{chips(grupo.obras)}</span>;
        case "ordemInicio": return <span key="ordemInicio" className="qg-texto">{displayOptionalValue(contrato?.ordemInicio)}</span>;
        case "confirmacaoRecurso": return <span key="confirmacaoRecurso" className="qg-texto">{displayOptionalValue(contrato?.confirmacaoRecurso)}</span>;
        case "inicio": return <span key="inicio" className="qg-numero">{formatDateShort(contrato?.inicio)}</span>;
        case "dias": return <span key="dias" className="qg-numero">{inclusiveCivilDays(contrato?.inicio, contrato?.fim) ?? "—"}</span>;
      }
    };
    return [
      <div key={`contrato-${grupo.id}`} className="qg-linha qg-linha--contrato" style={{ minHeight: 48 }}>
        <div className="qg-esq" onClick={alternar}>{colunas.map(celula)}</div>
      </div>,
      ...(aberto ? grupo.obras.map((obra) => linhaObra(obra, true)) : []),
    ];
  };

  const linhas = viewMode === "flat"
    ? buildFlatWorkGroupsByWorkType(obras, contratos).flatMap((tipo) => [
      <div key={`tipo-${tipo.kind}`} className="qg-grupo qg-grupo--tipo"><span>{GRUPO_NOME[tipo.label] ?? tipo.label}</span></div>,
      ...sortObras(tipo.obras, contratos, sort).map((obra) => linhaObra(obra)),
    ])
    : groupContractGroupsByWorkType(sortContractGroups(groupObrasByContract(obras), contratos, sort), contratos).flatMap((tipo) => [
      <div key={`tipo-${tipo.kind}`} className="qg-grupo qg-grupo--tipo"><span>{GRUPO_NOME[tipo.label] ?? tipo.label}</span></div>,
      ...tipo.groups.flatMap((grupo) => linhaContrato(grupo)),
    ]);

  return (
    <section className="qg qg--lista" aria-label={sectionTitle} style={estilo}>
      <div className="qg-rolagem">
        <div className="qg-cab">
          <div className="qg-esq qg-esq--cab">
            {colunas.map((coluna) => {
              const ativo = sort.column === coluna.id ? sort.direction : null;
              return (
                <span key={coluna.id} className={`qg-cab-coluna ${ativo ? "is-ordenada" : ""}`} role="button" tabIndex={0} title={`Ordenar por ${coluna.rotulo}`}
                  onClick={() => setSort((atual) => nextTableSort(atual, coluna.id))}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSort((atual) => nextTableSort(atual, coluna.id)); } }}>
                  {coluna.rotulo}{ativo && <b aria-hidden="true">{ativo === "asc" ? "▲" : "▼"}</b>}
                </span>
              );
            })}
          </div>
        </div>
        {linhas.length ? linhas : <p className="qg-vazio">Nenhuma obra {naoIniciada ? "não iniciada" : "finalizada"} com estes filtros.</p>}
      </div>
    </section>
  );
}
