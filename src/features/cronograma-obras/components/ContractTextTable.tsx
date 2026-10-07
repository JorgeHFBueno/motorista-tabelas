import KeyboardArrowDownRounded from "@mui/icons-material/KeyboardArrowDownRounded";
import MoreVertRounded from "@mui/icons-material/MoreVertRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ContratoCronograma, ObraCronograma } from "../domain/models";
import { formatDateShort, inclusiveCivilDays, todayCivil } from "../domain/temporal";
import { startedMasterPeriods } from "../domain/masterPlanningDetails";
import { getMestreColor, normalizeMestreKey } from "../domain/mestres";
import { clampColumnWidth, OBRA_COLUMN_WIDTH, notStartedPanelLayout, obraPanelLayout, RESIZABLE_COLUMNS, type ObraPanelColumn, type ObraColumnWidths } from "../domain/obraGridColumns";
import { MondaySubitemStatusControl } from "./MondaySubitemStatusControl";
import { ContractAnalysisRequest } from "./ContractAnalysisRequest";
import { ContractRowControls } from "./ContractRowControls";
import type { MondaySubitemStatus } from "../../../services/mondaySubitemStatusService";
import {
  buildFlatWorkGroupsByWorkType,
  groupContractGroupsByWorkType,
  groupObrasByContract,
} from "../domain/contractGroups";
import { requiresContractReview } from "../data/source/rawCronogramaAdapter";
import { countCronogramaRender, measureCronogramaCompute } from "../debug/cronogramaPerf";

const missing = "\u2014";
const invalidDisplayPlaceholders = new Set(["\u2013", "\u2014", "\u00e2\u20ac\u201d"]);
const colorStyle = (key: string): React.CSSProperties =>
  ({ "--co-master-color": getMestreColor(key).background }) as React.CSSProperties;

export function displayRawValue(value: unknown): string {
  if (value === null || value === undefined) return missing;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized && !invalidDisplayPlaceholders.has(normalized) ? normalized : missing;
  }
  if (["number", "boolean", "bigint"].includes(typeof value)) return String(value);
  if (typeof value === "object") {
    const normalized = value as { label?: unknown; name?: unknown; text?: unknown; value?: unknown };
    return displayRawValue(normalized.label ?? normalized.name ?? normalized.text ?? normalized.value);
  }
  return missing;
}

export function displayOptionalValue(value: unknown): string {
  const normalized = displayRawValue(value);
  return normalized === missing || invalidDisplayPlaceholders.has(normalized) ? "-" : normalized;
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
  const [columnWidths, setColumnWidths] = useState<ObraColumnWidths>({});
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => resizeCleanupRef.current?.(), []);
  const notStarted = variant === "not-started";
  const layout = notStarted
    ? notStartedPanelLayout(OBRA_COLUMN_WIDTH.default, viewMode, columnWidths)
    : obraPanelLayout(OBRA_COLUMN_WIDTH.default, viewMode, true, false, columnWidths);
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
  const startColumnResize = (column: ObraPanelColumn) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeCleanupRef.current?.();
    const defaults: Partial<Record<ObraPanelColumn, number>> = { nomeContrato: 230, empresa: 82, status: 100 };
    const startWidth = columnWidths[column] ?? defaults[column] ?? 0;
    const startX = event.clientX;
    const pointerId = event.pointerId;
    const handle = event.currentTarget;
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId === pointerId) setColumnWidths((current) => ({ ...current, [column]: clampColumnWidth(column, startWidth + moveEvent.clientX - startX) }));
    };
    const cleanup = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      document.body.classList.remove("co-is-resizing");
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      resizeCleanupRef.current = null;
    };
    const end = (endEvent: PointerEvent) => { if (endEvent.pointerId === pointerId) cleanup(); };
    handle.setPointerCapture(pointerId);
    document.body.classList.add("co-is-resizing");
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    resizeCleanupRef.current = cleanup;
  };
  const obraCells = (obra: ObraCronograma, contrato: ContratoCronograma | undefined) => {
    const needsContractReview = obra.targetType === "contrato" && requiresContractReview(contrato);
    if (notStarted) return <>
      <span title={contrato?.nome ?? missing}>{contrato?.nome ?? missing}</span>
      <span className="co-work-name" title={obra.nomeObra}>{needsContractReview && contrato ? <ContractAnalysisRequest contrato={contrato} variant="alert" /> : obra.nomeObra}</span>
      <span>{obra.empresa || missing}</span>
      <span><MondaySubitemStatusControl obra={obra} canStart={notStarted} onStatusConfirmed={onStatusConfirmed} /></span>
      <span>{displayOptionalValue(contrato?.ordemInicio)}</span>
      <span>{displayOptionalValue(contrato?.confirmacaoRecurso)}</span>
      <span>{formatDateShort(obra.inicioPlanejado ?? contrato?.inicio ?? null)}</span>
      <span>{obra.tempoPlanejado ?? inclusiveCivilDays(contrato?.inicio, contrato?.fim) ?? missing}</span>
    </>;
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
  const contractChildCells = (obra: ObraCronograma, contrato: ContratoCronograma | undefined) => {
    if (!notStarted) return obraCells(obra, contrato);
    const needsContractReview = obra.targetType === "contrato" && requiresContractReview(contrato);
    return <>
      <span className="co-work-name" title={obra.nomeObra}>{needsContractReview && contrato ? <ContractAnalysisRequest contrato={contrato} variant="alert" /> : obra.nomeObra}</span>
      <span>{obra.empresa || missing}</span>
      <span>{obra.targetType === "obra" && obra.mondaySubitemId
        ? <MondaySubitemStatusControl obra={obra} canStart={notStarted} onStatusConfirmed={onStatusConfirmed} />
        : missing}</span>
      <span>{displayOptionalValue(contrato?.ordemInicio)}</span>
      <span>{displayOptionalValue(contrato?.confirmacaoRecurso)}</span>
      <span>{formatDateShort(obra.inicioPlanejado ?? contrato?.inicio ?? null)}</span>
      <span>{obra.tempoPlanejado ?? inclusiveCivilDays(contrato?.inicio, contrato?.fim) ?? missing}</span>
    </>;
  };
  const flatRows = flatWorkTypeGroups.flatMap((workType) => [
    <div className={`co-work-type-divider co-work-type-divider--${workType.kind}`} key={`work-type-${workType.kind}`}><span>{workType.label}</span></div>,
    ...workType.obras.map((obra) => {
      const contrato = contratos.get(obra.contratoId ?? "");
      const needsContractReview = obra.targetType === "contrato" && requiresContractReview(contrato);
      return <div role="button" tabIndex={0} className={`co-text-row co-text-row--flat ${needsContractReview ? "co-text-row--review" : ""}`} key={obra.id} onClick={() => onSelect(obra)} onKeyDown={(event) => selectOnKey(event, obra)}>{obraCells(obra, contrato)}</div>;
    }),
  ]);
  return (
    <section className={`co-text-table co-text-table--${variant} ${viewMode === "flat" ? "co-text-table--flat" : ""}`} aria-label={sectionTitle} style={tableStyle}>
      <div className="co-text-head">
        {notStarted && <span>Nome contrato{viewMode === "contracts" && RESIZABLE_COLUMNS.notStartedContracts.includes("nomeContrato") && <button type="button" className="co-obra-resize-handle" aria-label="Redimensionar coluna Nome contrato" onPointerDown={startColumnResize("nomeContrato")} />}</span>}
        {notStarted && (viewMode === "flat" ? <><span>Obra</span><span>Emp.</span><span>Status</span><span>Ordem de Ini</span><span>Recurso</span><span>Início</span><span>Dias</span></> : <><span>Emp.{RESIZABLE_COLUMNS.notStartedContracts.includes("empresa") && <button type="button" className="co-obra-resize-handle" aria-label="Redimensionar coluna Emp." onPointerDown={startColumnResize("empresa")} />}</span><span>Status{RESIZABLE_COLUMNS.notStartedContracts.includes("status") && <button type="button" className="co-obra-resize-handle" aria-label="Redimensionar coluna Status" onPointerDown={startColumnResize("status")} />}</span><span>Ordem de Ini</span><span>Recurso</span><span>Início</span><span>Dias</span></>)}
        {!notStarted && <>
        <button type="button" className="co-text-section-toggle" aria-expanded={sectionExpanded} aria-label={`${sectionExpanded ? "Recolher" : "Expandir"} ${sectionTitle}`} title={`${sectionExpanded ? "Recolher" : "Expandir"} ${sectionTitle}`} onClick={onToggleSection}>
          <KeyboardArrowDownRounded className={sectionExpanded ? "" : "is-collapsed"} />
          Nome contrato <small>{sectionTitle} ({sectionCount})</small>
        </button>
        <span>Obra</span><span>Contrato</span><span>Mestres</span><span>Status</span><span>Emp.</span><span>Início</span><span>Dias</span><span className="co-text-toggle-spacer" aria-hidden="true" />
        </>}
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
              <span className="co-contract-name" title={group.name}>
                {notStarted ? <ContractRowControls collapsed={!expanded} count={group.obras.length} contrato={contrato} showReview={needsReview} /> : <><KeyboardArrowDownRounded className={expanded ? "" : "is-collapsed"} /><button type="button" className="co-contract-details" aria-label={`Ver detalhes de ${group.name}`} onClick={(event) => { event.stopPropagation(); if (contrato) onOpenContract(contrato); }}><MoreVertRounded /></button></>}
                {group.name}
                {needsReview && !notStarted && <><WarningAmberRounded className="co-review-icon" fontSize="inherit" /><ContractAnalysisRequest contrato={contrato!} /></>}
              </span>
              {notStarted ? <><span>{contrato?.empresa ?? missing}</span><span>{displayRawValue(contrato?.status)}</span><span>{displayOptionalValue(contrato?.ordemInicio)}</span><span>{displayOptionalValue(contrato?.confirmacaoRecurso)}</span><span>{formatDateShort(contrato?.inicio ?? null)}</span><span>{days ?? missing}</span></> : <><span>{obrasLabel}</span><span>{displayRawValue(contrato?.numeroContrato)}</span><MastersCell obras={group.obras} /><span>{displayRawValue(contrato?.status)}</span><span>{contrato?.empresa ?? missing}</span><span>{formatDateShort(contrato?.inicio ?? null)}</span><span>{days ?? missing}</span><span className="co-text-toggle-spacer" aria-hidden="true" /></>}
            </div>
            {expanded && group.obras.map((obra) => <div role="button" tabIndex={0} className={`co-text-row co-text-row--child ${obra.targetType === "contrato" ? "co-text-row--review" : ""}`} key={obra.id} onClick={() => onSelect(obra)} onKeyDown={(event) => selectOnKey(event, obra)}>{contractChildCells(obra, contratos.get(obra.contratoId ?? group.id))}</div>)}
          </div>;
        }),
      ]))}
      {sectionExpanded && !groups.length && <div className="co-empty">Nenhum contrato nesta situação.</div>}
    </section>
  );
});
