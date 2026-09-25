export const OBRA_COLUMN_WIDTH = { default: 220, min: 140, max: 360 } as const;

const OTHER_OBRA_COLUMN_WIDTHS = [112, 122, 76, 112, 70] as const;
const CORE_OBRA_COLUMN_WIDTHS = OTHER_OBRA_COLUMN_WIDTHS.slice(0, 2);

export function clampObraColumnWidth(width: number): number {
  return Math.min(OBRA_COLUMN_WIDTH.max, Math.max(OBRA_COLUMN_WIDTH.min, width));
}

export function obraGridColumns(obraWidth: number, detailsVisible = true): string {
  const widths = detailsVisible ? OTHER_OBRA_COLUMN_WIDTHS : CORE_OBRA_COLUMN_WIDTHS;
  return `${clampObraColumnWidth(obraWidth)}px ${widths.map((width) => `${width}px`).join(' ')} 22px`;
}

export function obraGridWidth(obraWidth: number, detailsVisible = true): number {
  const widths = detailsVisible ? OTHER_OBRA_COLUMN_WIDTHS : CORE_OBRA_COLUMN_WIDTHS;
  return clampObraColumnWidth(obraWidth) + widths.reduce((total, width) => total + width, 0) + 22;
}
