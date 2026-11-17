import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import { useState, type CSSProperties } from "react";
import type { ContractTextTableProps } from "../../cronograma-obras/components/ContractTextTable";
import { StatusBadge } from "../../cronograma-obras/components/StatusBadge";
import { buildFlatWorkGroupsByWorkType, groupContractGroupsByWorkType, groupObrasByContract, type ContractGroup } from "../../cronograma-obras/domain/contractGroups";
import { startedMasterPeriods } from "../../cronograma-obras/domain/masterPlanningDetails";
import { getMestreColor } from "../../cronograma-obras/domain/mestres";
import type { ContratoCronograma, ObraCronograma } from "../../cronograma-obras/domain/models";
import { nextTableSort, sortContractGroups, sortObras, type ColumnId, type TableSort } from "../../cronograma-obras/domain/tableSort";
import { formatDateShort, inclusiveCivilDays, todayCivil } from "../../cronograma-obras/domain/temporal";

/**
 * /testes/mkiii: Obra finalizada no mesmo padrão da grade de Obra iniciada (sem calendário): Obra com o LOTE e o
 * contrato, Contrato, Emp., Status, Mestres (os que já começaram, como na produção), Início e Dias; ordenável;
 * na visão Contratos, cada contrato abre os seus LOTEs. Recebe as mesmas props da ContractTextTable.
 */
type Coluna = { id: "obra" | "contrato" | "empresa" | "status" | "mestres" | "inicio" | "dias"; rotulo: string; largura: number };
const COLUNAS: readonly Coluna[] = [
  { id: "obra", rotulo: "Obra", largura: 300 },
  { id: "contrato", rotulo: "Contrato", largura: 96 },
  { id: "empresa", rotulo: "Emp.", largura: 80 },
  { id: "status", rotulo: "Status", largura: 150 },
  { id: "mestres", rotulo: "Mestres", largura: 130 },
  { id: "inicio", rotulo: "Início", largura: 84 },
  { id: "dias", rotulo: "Dias", largura: 64 },
];
const GRUPO_NOME: Record<string, string> = { "OBRAS PÚBLICAS": "Obras públicas", "OBRAS PRIVADAS": "Obras privadas" };

export function QuadroLista({ obras, contratos, viewMode = "contracts", onOpenContract, onSelect, onSelectMasters, sectionExpanded }: ContractTextTableProps) {
  const [sort, setSort] = useState<TableSort>({ column: null, direction: null });
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
  const hoje = todayCivil();
  if (!sectionExpanded) return null;
  const largura = COLUNAS.reduce((total, coluna) => total + coluna.largura, 0);
  const estilo = { "--qg-esq": `${largura}px`, "--qg-esq-colunas": COLUNAS.map((coluna) => `${coluna.largura}px`).join(" "), "--qg-total": `${largura}px` } as CSSProperties;

  const chips = (lista: readonly ObraCronograma[]) => {
    const iniciados = [...new Map(lista.flatMap((obra) => startedMasterPeriods(obra, hoje)).map((m) => [m.key, m.nome])).entries()];
    return iniciados.length ? iniciados.map(([chave, nome]) => { const cor = getMestreColor(chave); return <span key={chave} className="qg-mestre" style={{ background: cor.background, color: cor.text }}>{nome}</span>; }) : <span className="qg-sem-mestre">Sem mestre</span>;
  };
  const botaoContrato = (contrato: ContratoCronograma | undefined, titulo = false) => (
    <button type="button" className={`qg-contrato ${titulo ? "qg-contrato--titulo" : ""}`} title={contrato?.nome} onClick={(e) => { e.stopPropagation(); if (contrato) onOpenContract(contrato); }}>{contrato?.nome ?? "—"}</button>
  );

  const linhaObra = (obra: ObraCronograma, filho = false) => {
    const contrato = contratos.get(obra.contratoId ?? "");
    return (
      <div key={obra.id} className={`qg-linha ${filho ? "qg-linha--filho" : ""}`} style={{ minHeight: 48 }}>
        <div className="qg-esq" onClick={() => onSelect(obra)}>
          <div className="qg-obra"><div className="qg-obra-textos"><span className="qg-lote" title={obra.nomeObra}>{obra.nomeObra}</span>{botaoContrato(contrato)}</div></div>
          <span className="qg-numero">{contrato?.numeroContrato ?? "—"}</span>
          <span className="qg-texto">{obra.empresa || contrato?.empresa || "—"}</span>
          <span className="qg-status"><StatusBadge status={obra.status} /></span>
          <button type="button" className="qg-mestres" onClick={(e) => { e.stopPropagation(); onSelectMasters(obra); }}>{chips([obra])}</button>
          <span className="qg-numero">{formatDateShort(obra.inicioPlanejado ?? contrato?.inicio)}</span>
          <span className="qg-numero">{obra.tempoPlanejado ?? inclusiveCivilDays(contrato?.inicio, contrato?.fim) ?? "—"}</span>
        </div>
      </div>
    );
  };

  const linhaContrato = (grupo: ContractGroup) => {
    const contrato = contratos.get(grupo.id);
    const aberto = abertos.has(grupo.id);
    const alternar = () => setAbertos((atual) => { const proximo = new Set(atual); if (proximo.has(grupo.id)) proximo.delete(grupo.id); else proximo.add(grupo.id); return proximo; });
    return [
      <div key={`contrato-${grupo.id}`} className="qg-linha qg-linha--contrato" style={{ minHeight: 48 }}>
        <div className="qg-esq" onClick={alternar}>
          <div className="qg-obra">
            <ExpandMoreRounded className={`qg-seta ${aberto ? "" : "is-fechada"}`} fontSize="small" />
            <div className="qg-obra-textos">{botaoContrato(contrato, true)}<span className="qg-lote">{grupo.obras.length} {grupo.obras.length === 1 ? "LOTE" : "LOTEs"}</span></div>
          </div>
          <span className="qg-numero">{contrato?.numeroContrato ?? "—"}</span>
          <span className="qg-texto">{contrato?.empresa || "—"}</span>
          <span className="qg-status"><StatusBadge status={contrato?.status ?? "Sem status"} /></span>
          <span className="qg-mestres">{chips(grupo.obras)}</span>
          <span className="qg-numero">{formatDateShort(contrato?.inicio)}</span>
          <span className="qg-numero">{inclusiveCivilDays(contrato?.inicio, contrato?.fim) ?? "—"}</span>
        </div>
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
    <section className="qg qg--lista" aria-label="Obra finalizada" style={estilo}>
      <div className="qg-rolagem">
        <div className="qg-cab">
          <div className="qg-esq qg-esq--cab">
            {COLUNAS.map((coluna) => {
              const id = coluna.id as ColumnId;
              const ativo = sort.column === id ? sort.direction : null;
              return (
                <span key={coluna.id} className={`qg-cab-coluna ${ativo ? "is-ordenada" : ""}`} role="button" tabIndex={0} title={`Ordenar por ${coluna.rotulo}`}
                  onClick={() => setSort((atual) => nextTableSort(atual, id))}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSort((atual) => nextTableSort(atual, id)); } }}>
                  {coluna.rotulo}{ativo && <b aria-hidden="true">{ativo === "asc" ? "▲" : "▼"}</b>}
                </span>
              );
            })}
          </div>
        </div>
        {linhas.length ? linhas : <p className="qg-vazio">Nenhuma obra finalizada com estes filtros.</p>}
      </div>
    </section>
  );
}
