/** Stable, restrained colours shared by palette, Gantt, workload and master view. */
const PALETTE = [
  { background: '#2f6b98', text: '#ffffff' }, { background: '#587a5e', text: '#ffffff' },
  { background: '#856a9b', text: '#ffffff' }, { background: '#a26949', text: '#ffffff' },
  { background: '#347d7a', text: '#ffffff' }, { background: '#596fa5', text: '#ffffff' },
  { background: '#8a6b54', text: '#ffffff' }, { background: '#607d8b', text: '#ffffff' },
] as const;

export function normalizeMestreKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, '-');
}

/** uid should be supplied by a future catalog; normalized name keeps local fixtures stable. */
export function getMestreKey(mestre: { uid?: string | null; nome: string }): string { return mestre.uid || normalizeMestreKey(mestre.nome); }

export function getMestreColor(mestreKey: string) {
  const hash = [...normalizeMestreKey(mestreKey)].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 7);
  return PALETTE[hash % PALETTE.length];
}

export { PALETTE as MESTRE_COLORS };
