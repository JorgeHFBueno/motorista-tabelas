export const OBRA_COLUMN_WIDTH = { default: 220, min: 140, max: 360 } as const;

const OTHER_OBRA_COLUMN_WIDTHS = [112, 122, 76, 112, 70] as const;

export function clampObraColumnWidth(width: number): number {
  return Math.min(OBRA_COLUMN_WIDTH.max, Math.max(OBRA_COLUMN_WIDTH.min, width));
}

export function obraGridColumns(obraWidth: number): string {
  return `${clampObraColumnWidth(obraWidth)}px ${OTHER_OBRA_COLUMN_WIDTHS.map((width) => `${width}px`).join(' ')}`;
}

export function obraGridWidth(obraWidth: number): number {
  return clampObraColumnWidth(obraWidth) + OTHER_OBRA_COLUMN_WIDTHS.reduce((total, width) => total + width, 0);
}
