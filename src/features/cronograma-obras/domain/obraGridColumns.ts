export const OBRA_COLUMN_WIDTH = { default: 220, min: 140, max: 360 } as const;

const EXPANDED_LEFT_WIDTH = 'clamp(660px, 43vw, 880px)';
const COMPACT_LEFT_WIDTH = 'clamp(420px, 30vw, 540px)';

// Obra, Mestres, Status, Empresa, Inicio, Dias and the details toggle.
// This is the single geometry used by the header, contract and obra rows.
// Obra keeps a resizable minimum, while the fr tracks share every extra pixel.
const expandedColumns = (obraMinimum: number) => `minmax(${obraMinimum}px, 2.4fr) minmax(110px, 1.2fr) minmax(82px, .75fr) minmax(65px, .55fr) minmax(88px, .70fr) minmax(48px, .35fr) 22px`;
const compactColumns = (obraMinimum: number) => `minmax(${obraMinimum}px, 2.4fr) minmax(110px, 1.2fr) minmax(82px, .75fr) 22px`;

export function clampObraColumnWidth(width: number): number {
  return Math.min(OBRA_COLUMN_WIDTH.max, Math.max(OBRA_COLUMN_WIDTH.min, width));
}

export function obraGridColumns(obraWidth: number, detailsVisible = true): string {
  const obraMinimum = clampObraColumnWidth(obraWidth);
  return detailsVisible ? expandedColumns(obraMinimum) : compactColumns(obraMinimum);
}

export function obraGridWidth(detailsVisible = true): string {
  return detailsVisible ? EXPANDED_LEFT_WIDTH : COMPACT_LEFT_WIDTH;
}
