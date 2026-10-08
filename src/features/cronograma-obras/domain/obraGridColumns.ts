export const OBRA_COLUMN_WIDTH = { default: 220, min: 140, max: 360 } as const;

export type ObraPanelColumn = "nomeContrato" | "obra" | "contrato" | "mestres" | "status" | "empresa" | "ordemInicio" | "confirmacaoRecurso" | "inicio" | "dias" | "toggle";
export type ColumnDefinition = { id: ObraPanelColumn; width: number | "obra"; resizable?: boolean };

// This is the single source of truth for both column geometry and panel width.
// The timeline therefore starts exactly after DIAS in every row and the header.
export const OBRA_EXPANDED_COLUMNS: readonly ColumnDefinition[] = [
  { id: "nomeContrato", width: 230 },
  { id: "obra", width: "obra" },
  { id: "contrato", width: 95 },
  { id: "mestres", width: 130 },
  { id: "status", width: 105 },
  { id: "empresa", width: 70 },
  { id: "inicio", width: 92 },
  { id: "dias", width: 55 },
  { id: "toggle", width: 22 },
] as const;
// Obra iniciada intentionally has independent contracts for each view.
// The fixed panel and its header always derive from these exact arrays.
export const STARTED_FLAT_COLUMNS: readonly ColumnDefinition[] = [
  { id: "nomeContrato", width: 230 },
  { id: "obra", width: 285 },
  { id: "empresa", width: 82 },
  { id: "status", width: 120 },
  { id: "mestres", width: 130 },
  { id: "inicio", width: 92 },
  { id: "dias", width: 55 },
  { id: "toggle", width: 22 },
] as const;
export const STARTED_FLAT_COLLAPSED_COLUMNS: readonly ColumnDefinition[] = [
  { id: "nomeContrato", width: 230 },
  { id: "obra", width: "obra" },
  { id: "mestres", width: 130 },
  { id: "inicio", width: 92 },
  { id: "toggle", width: 22 },
] as const;
export const STARTED_CONTRACT_COLUMNS: readonly ColumnDefinition[] = [
  { id: "nomeContrato", width: 230 },
  { id: "empresa", width: 82 },
  { id: "status", width: 185 },
  { id: "mestres", width: 130 },
  { id: "inicio", width: 92 },
  { id: "dias", width: 55 },
  { id: "toggle", width: 22 },
] as const;
export const STARTED_CONTRACT_COLLAPSED_COLUMNS: readonly ColumnDefinition[] = [
  { id: "nomeContrato", width: 230 },
  { id: "mestres", width: 130 },
  { id: "inicio", width: 92 },
  { id: "toggle", width: 22 },
] as const;
// Obra não iniciada has its own presentation contract. These tables do not
// share the started-work columns because their operational status is narrower.
export const NOT_STARTED_FLAT_COLUMNS: readonly ColumnDefinition[] = [
  { id: "nomeContrato", width: 220 },
  { id: "obra", width: 300 },
  { id: "empresa", width: 90 },
  { id: "status", width: 112 },
  { id: "ordemInicio", width: 105 },
  { id: "confirmacaoRecurso", width: 100 },
  { id: "inicio", width: 95 },
  { id: "dias", width: 60 },
] as const;
export const NOT_STARTED_CONTRACT_COLUMNS: readonly ColumnDefinition[] = [
  { id: "nomeContrato", width: 230 },
  { id: "empresa", width: 82 },
  { id: "status", width: 100 },
  { id: "ordemInicio", width: 105 },
  { id: "confirmacaoRecurso", width: 115 },
  { id: "inicio", width: 92 },
  { id: "dias", width: 55 },
] as const;
const COMPACT_COLUMNS: readonly ColumnDefinition[] = [
  ...OBRA_EXPANDED_COLUMNS.slice(0, 5),
  { id: "toggle", width: 22 },
] as const;
export type ObraPanelLayout = { columns: readonly ObraPanelColumn[]; gridTemplateColumns: string; width: string };
export type ObraColumnWidths = Partial<Record<ObraPanelColumn, number>>;
const DATA_COLUMNS = ["nomeContrato", "obra", "contrato", "mestres", "status", "empresa", "ordemInicio", "confirmacaoRecurso", "inicio", "dias"] as const;
export const RESIZABLE_COLUMNS = {
  startedFlat: ["nomeContrato", "obra", "empresa", "status", "mestres", "inicio", "dias"],
  startedContracts: ["nomeContrato", "empresa", "status", "mestres", "inicio", "dias"],
  notStartedFlat: ["nomeContrato", "obra", "empresa", "status", "ordemInicio", "confirmacaoRecurso", "inicio", "dias"],
  notStartedContracts: ["nomeContrato", "empresa", "status", "ordemInicio", "confirmacaoRecurso", "inicio", "dias"],
  finished: DATA_COLUMNS,
} as const satisfies Record<string, readonly ObraPanelColumn[]>;

export function clampColumnWidth(column: ObraPanelColumn, width: number): number {
  const bounds: Partial<Record<ObraPanelColumn, readonly [number, number]>> = {
    nomeContrato: [180, 420], obra: [OBRA_COLUMN_WIDTH.min, 480], contrato: [70, 220],
    mestres: [110, 300], empresa: [60, 220], status: [100, 320],
    ordemInicio: [95, 260], confirmacaoRecurso: [95, 280], inicio: [84, 180], dias: [52, 130],
  };
  const [min, max] = bounds[column] ?? [40, 360];
  return Math.min(max, Math.max(min, width));
}

export function clampObraColumnWidth(width: number): number {
  return Math.min(
    OBRA_COLUMN_WIDTH.max,
    Math.max(OBRA_COLUMN_WIDTH.min, width),
  );
}

export function obraGridColumns(
  obraWidth: number,
  detailsVisible = true,
): string {
  return layoutFor(detailsVisible ? OBRA_EXPANDED_COLUMNS : COMPACT_COLUMNS, obraWidth).gridTemplateColumns;
}

export function obraGridWidth(obraWidth = OBRA_COLUMN_WIDTH.default, detailsVisible = true): string {
  return layoutFor(detailsVisible ? OBRA_EXPANDED_COLUMNS : COMPACT_COLUMNS, obraWidth).width;
}

export function obraPanelLayout(obraWidth: number, viewMode: "contracts" | "flat", detailsVisible: boolean, started = false, widths: ObraColumnWidths = {}): ObraPanelLayout {
  if (!started) return layoutFor(detailsVisible ? OBRA_EXPANDED_COLUMNS : COMPACT_COLUMNS, obraWidth, widths);
  if (viewMode === "flat")
    return layoutFor(
      detailsVisible ? STARTED_FLAT_COLUMNS : STARTED_FLAT_COLLAPSED_COLUMNS,
      obraWidth, widths,
    );
  return layoutFor(
    detailsVisible ? STARTED_CONTRACT_COLUMNS : STARTED_CONTRACT_COLLAPSED_COLUMNS,
    obraWidth, widths,
  );
}

export function notStartedPanelLayout(obraWidth: number, viewMode: "contracts" | "flat", widths: ObraColumnWidths = {}): ObraPanelLayout {
  return layoutFor(viewMode === "flat" ? NOT_STARTED_FLAT_COLUMNS : NOT_STARTED_CONTRACT_COLUMNS, obraWidth, widths);
}

function layoutFor(columns: readonly ColumnDefinition[], obraWidth: number, overrides: ObraColumnWidths = {}): ObraPanelLayout {
  const normalizedObraWidth = clampObraColumnWidth(obraWidth);
  const widths = columns.map((column) => clampColumnWidth(column.id, overrides[column.id] ?? (column.width === "obra" ? normalizedObraWidth : column.width)));
  return {
    columns: columns.map((column) => column.id),
    gridTemplateColumns: widths.map((width) => `${width}px`).join(" "),
    width: `${widths.reduce((total, width) => total + width, 0)}px`,
  };
}
