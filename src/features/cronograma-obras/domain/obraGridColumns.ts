export const OBRA_COLUMN_WIDTH = { default: 220, min: 140, max: 360 } as const;

const EXPANDED_LEFT_WIDTH = "clamp(660px, 43vw, 880px)";
const COMPACT_LEFT_WIDTH = "clamp(420px, 30vw, 540px)";

export type ObraPanelColumn = "obra" | "contrato" | "nomeContrato" | "mestres" | "status" | "empresa" | "inicio" | "dias" | "toggle";
export type ObraPanelLayout = { columns: readonly ObraPanelColumn[]; gridTemplateColumns: string; width: string };

// This is the canonical geometry used by the header and every obra row.
// The extra flat columns only exist while the informative panel is expanded.
const expandedColumns = (obraMinimum: number, flat: boolean) =>
  `minmax(${obraMinimum}px, 2.15fr)${flat ? " minmax(82px, .7fr) minmax(130px, 1.25fr)" : ""} minmax(110px, 1.2fr) minmax(82px, .75fr) minmax(65px, .55fr) minmax(88px, .70fr) minmax(48px, .35fr) 22px`;
const compactColumns = (obraMinimum: number) =>
  `minmax(${obraMinimum}px, 2.4fr) minmax(110px, 1.2fr) minmax(82px, .75fr) 22px`;

export function clampObraColumnWidth(width: number): number {
  return Math.min(
    OBRA_COLUMN_WIDTH.max,
    Math.max(OBRA_COLUMN_WIDTH.min, width),
  );
}

export function obraGridColumns(
  obraWidth: number,
  detailsVisible = true,
  flat = false,
): string {
  const obraMinimum = clampObraColumnWidth(obraWidth);
  return detailsVisible
    ? expandedColumns(obraMinimum, flat)
    : compactColumns(obraMinimum);
}

export function obraGridWidth(detailsVisible = true): string {
  return detailsVisible ? EXPANDED_LEFT_WIDTH : COMPACT_LEFT_WIDTH;
}

export function obraPanelLayout(obraWidth: number, viewMode: "contracts" | "flat", detailsVisible: boolean): ObraPanelLayout {
  const flatExpanded = viewMode === "flat" && detailsVisible;
  const columns: readonly ObraPanelColumn[] = detailsVisible
    ? ["obra", ...(flatExpanded ? (["contrato", "nomeContrato"] as const) : []), "mestres", "status", "empresa", "inicio", "dias", "toggle"]
    : ["obra", "mestres", "status", "toggle"];
  return { columns, gridTemplateColumns: obraGridColumns(obraWidth, detailsVisible, flatExpanded), width: obraGridWidth(detailsVisible) };
}
