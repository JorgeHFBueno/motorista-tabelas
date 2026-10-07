import KeyboardArrowDownRounded from "@mui/icons-material/KeyboardArrowDownRounded";
import MoreVertRounded from "@mui/icons-material/MoreVertRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import { memo, useMemo, useState } from "react";
import type { ContratoCronograma, ObraCronograma } from "../domain/models";
import { formatDateShort, inclusiveCivilDays, todayCivil } from "../domain/temporal";
import { startedMasterPeriods } from "../domain/masterPlanningDetails";
import { getMestreColor, normalizeMestreKey } from "../domain/mestres";
import { OBRA_COLUMN_WIDTH, obraPanelLayout } from "../domain/obraGridColumns";
import { MondaySubitemStatusControl } from "./MondaySubitemStatusControl";
import { ContractAnalysisRequest } from "./ContractAnalysisRequest";
import type { MondaySubitemStatus } from "../../../services/mondaySubitemStatusService";
import {
  buildFlatWorkGroupsByWorkType,
  groupContractGroupsByWorkType,
  groupObrasByContract,
} from "../domain/contractGroups";
import { requiresContractReview } from "../data/source/rawCronogramaAdapter";
import { countCronogramaRender, measureCronogramaCompute } from "../debug/cronogramaPerf";

const missing = "—";
const colorStyle = (key: string): React.CSSProperties =>
  ({ "--co-master-color": getMestreColor(key).background }) as React.CSSProperties;

export function displayRawValue(value: unknown): string {
  if (value === null || value === undefined) return missing;
  if (typeof value === "string") return value.trim() || missing;
  if (["number", "boolean", "bigint"].includes(typeof value)) return String(value);
  try {
    const serialized = JSON.stringify(value);
    return serialized && serialized !== "{}" ? serialized : missing;
  } catch {
    return String(value) || missing;
  }
}

type Props = {
  obras: readonly ObraCronograma[];
  contratos: ReadonlyMap<string, ContratoCronograma>;
  viewMode?: "contracts" | "flat";
  onOpenContract: (contrato: ContratoCronograma) => void;
  onSelect: (obra: ObraCronograma) => void;
  onSelectMasters: (obra: ObraCronograma) => void;
  onStatusConfirmed: (mondaySubitemId: string, status: MondaySubitemStatus) => void;
  sectionTitle: string;
  sectionCount: number;
  sectionExpanded: boolean;
  onToggleSection: () => void;
  variant?: "finished" | "not-started";
};

function MastersCell({ obras, onSelectMasters }: { obras: readonly ObraCronograma[]; onSelectMasters?: (obra: ObraCronograma) => void }) {
  const masters = obras.flatMap((obra) => startedMasterPeriods(obra, todayCivil()));
  return (
    <span
      className="co-masters-cell"
      onClick={(event) => {
        event.stopPropagation();
        if (obras[0] && onSelectMasters) onSelectMasters(obras[0]);
      }}
    >
      {masters.length ? masters.map((mestre) => (
        <i className="co-master-name-chip" key={`${mestre.key}-${mestre.nome}`} style={colorStyle(mestre.key)}>{mestre.nome}</i>
      )) : <em>Sem mestre</em>}
    </span>
  );
}

export const ContractTextTable = memo(function ContractTextTable({
  obras, contratos, viewMode = "contracts", onOpenContract, onSelect, onSelectMasters,
  onStatusConfirmed, sectionTitle, sectionCount, sectionExpanded, onToggleSection,
  variant = "finished",
}: Props) {
  countCronogramaRender("ContractTextTable");
  const groups = useMemo(() => measureCronogramaCompute("tableGroupObrasByContract", () => groupObrasByContract(obras)), [obras]);
  const workTypeGroups = useMemo(() => measureCronogramaCompute("tableGroupContractGroupsByWorkType", () => groupContractGroupsByWorkType(groups, contratos)), [groups, contratos]);
  const flatWorkTypeGroups = useMemo(() => measureCronogramaCompute("tableBuildFlatWorkGroupsByWorkType", () => viewMode === "flat" ? buildFlatWorkGroupsByWorkType(obras, contratos) : []), [viewMode, obras, contratos]);
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(() => new Set());
  const notStarted = variant === "not-started";
  const layout = obraPanelLayout(OBRA_COLUMN_WIDTH.default, viewMode, true);
  const tableStyle = {
    "--co-left-columns": layout.gridTemplateColumns,
    "--co-left-width": layout.width,
  } as React.CSSProperties;
  const toggle = (id: string) => setExpandedContracts((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectOnKey = (event: React.KeyboardEvent<HTMLDivElement>, obra: ObraCronograma) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(obra);
    }
  };
  const obraCells = (obra: ObraCronograma, contrato: ContratoCronograma | undefined) => {
    const review = obra.targetType === "contrato";
    return <>
      <span title={contrato?.nome ?? missing}>{contrato?.nome ?? missing}</span>
      <span className="co-work-name" title={obra.nomeObra}>{obra.nomeObra}{review && <WarningAmberRounded className="co-review-icon" fontSize="inherit" titleAccess="Contrato sem LOTEs/subitems. Revisar no Monday." />}</span>
      <span>{displayRawValue(contrato?.numeroContrato)}</span>
      <MastersCell obras={[obra]} onSelectMasters={onSelectMasters} />
      <span><MondaySubitemStatusControl obra={obra} canStart={notStarted} onStatusConfirmed={onStatusConfirmed} /></span>
      <span>{obra.empresa || missing}</span>
      <span>{formatDateShort(obra.inicioPlanejado ?? contrato?.inicio ?? null)}</span>
      <span>{obra.tempoPlanejado ?? inclusiveCivilDays(contrato?.inicio, contrato?.fim) ?? missing}</span>
      <span className="co-text-toggle-spacer" aria-hidden="true" />
    </>;
  };
  const flatRows = flatWorkTypeGroups.flatMap((workType) => [
    <div className={`co-work-type-divider co-work-type-divider--${workType.kind}`} key={`work-type-${workType.kind}`}><span>{workType.label}</span></div>,
    ...workType.obras.map((obra) => {
      const contrato = contratos.get(obra.contratoId ?? "");
      return <div role="button" tabIndex={0} className={`co-text-row co-text-row--flat ${obra.targetType === "contrato" ? "co-text-row--review" : ""}`} key={obra.id} onClick={() => onSelect(obra)} onKeyDown={(event) => selectOnKey(event, obra)}>{obraCells(obra, contrato)}</div>;
    }),
  ]);
  return (
    <section className={`co-text-table ${viewMode === "flat" ? "co-text-table--flat" : ""}`} aria-label={sectionTitle} style={tableStyle}>
      <div className="co-text-head">
        <button type="button" className="co-text-section-toggle" aria-expanded={sectionExpanded} aria-label={`${sectionExpanded ? "Recolher" : "Expandir"} ${sectionTitle}`} title={`${sectionExpanded ? "Recolher" : "Expandir"} ${sectionTitle}`} onClick={onToggleSection}>
          <KeyboardArrowDownRounded className={sectionExpanded ? "" : "is-collapsed"} />
          Nome contrato <small>{sectionTitle} ({sectionCount})</small>
        </button>
        <span>Obra</span><span>Contrato</span><span>Mestres</span><span>Status</span><span>Emp.</span><span>Início</span><span>Dias</span><span className="co-text-toggle-spacer" aria-hidden="true" />
      </div>
      {sectionExpanded && (viewMode === "flat" ? flatRows : workTypeGroups.flatMap((workType) => [
        <div className={`co-work-type-divider co-work-type-divider--${workType.kind}`} key={`work-type-${workType.kind}`}><span>{workType.label}</span></div>,
        ...workType.groups.map((group) => {
          const contrato = contratos.get(group.id);
          const expanded = expandedContracts.has(group.id);
          const needsReview = requiresContractReview(contrato);
          const obrasLabel = `${group.obras.length} ${group.obras.length === 1 ? "obra" : "obras"}`;
          const days = inclusiveCivilDays(contrato?.inicio, contrato?.fim);
          return <div className={`co-text-contract ${needsReview ? "co-text-contract--review" : ""}`} key={group.id}>
            <div className="co-text-row co-text-row--contract" role="button" tabIndex={0} aria-expanded={expanded} onClick={() => toggle(group.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}>
              <span className="co-contract-name" title={group.name}><KeyboardArrowDownRounded className={expanded ? "" : "is-collapsed"} /><button type="button" className="co-contract-details" aria-label={`Ver detalhes de ${group.name}`} onClick={(event) => { event.stopPropagation(); if (contrato) onOpenContract(contrato); }}><MoreVertRounded /></button>{group.name}{needsReview && <><WarningAmberRounded className="co-review-icon" fontSize="inherit" /><ContractAnalysisRequest contrato={contrato!} /></>}</span>
              <span>{obrasLabel}</span><span>{displayRawValue(contrato?.numeroContrato)}</span><MastersCell obras={group.obras} /><span>{displayRawValue(contrato?.status)}</span><span>{contrato?.empresa ?? missing}</span><span>{formatDateShort(contrato?.inicio ?? null)}</span><span>{days ?? missing}</span><span className="co-text-toggle-spacer" aria-hidden="true" />
            </div>
            {expanded && group.obras.map((obra) => <div role="button" tabIndex={0} className={`co-text-row co-text-row--child ${obra.targetType === "contrato" ? "co-text-row--review" : ""}`} key={obra.id} onClick={() => onSelect(obra)} onKeyDown={(event) => selectOnKey(event, obra)}>{obraCells(obra, contratos.get(obra.contratoId ?? group.id))}</div>)}
          </div>;
        }),
      ]))}
      {sectionExpanded && !groups.length && <div className="co-empty">Nenhum contrato nesta situação.</div>}
    </section>
  );
});
