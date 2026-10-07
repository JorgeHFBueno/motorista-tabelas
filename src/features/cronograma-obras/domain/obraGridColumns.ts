export const OBRA_COLUMN_WIDTH = { default: 220, min: 140, max: 360 } as const;

export type ObraPanelColumn = "nomeContrato" | "obra" | "contrato" | "mestres" | "status" | "empresa" | "inicio" | "dias" | "toggle";
type ColumnDefinition = { id: ObraPanelColumn; width: number | "obra" };

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
const COMPACT_COLUMNS: readonly ColumnDefinition[] = [
  ...OBRA_EXPANDED_COLUMNS.slice(0, 5),
  { id: "toggle", width: 22 },
] as const;
export type ObraPanelLayout = { columns: readonly ObraPanelColumn[]; gridTemplateColumns: string; width: string };

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

export function obraPanelLayout(obraWidth: number, viewMode: "contracts" | "flat", detailsVisible: boolean): ObraPanelLayout {
  void viewMode;
  return layoutFor(detailsVisible ? OBRA_EXPANDED_COLUMNS : COMPACT_COLUMNS, obraWidth);
}

function layoutFor(columns: readonly ColumnDefinition[], obraWidth: number): ObraPanelLayout {
  const normalizedObraWidth = clampObraColumnWidth(obraWidth);
  const widths = columns.map((column) => column.width === "obra" ? normalizedObraWidth : column.width);
  return {
    columns: columns.map((column) => column.id),
    gridTemplateColumns: widths.map((width) => `${width}px`).join(" "),
    width: `${widths.reduce((total, width) => total + width, 0)}px`,
  };
}
