/** Stable, restrained colours shared by palette, Gantt, workload and master view. */
const PALETTE = [
  { background: '#376f55', text: '#ffffff' }, { background: '#245f61', text: '#ffffff' },
  { background: '#654084', text: '#ffffff' }, { background: '#743f78', text: '#ffffff' },
  { background: '#4d548b', text: '#ffffff' }, { background: '#a0522d', text: '#ffffff' },
  { background: '#70483a', text: '#ffffff' }, { background: '#46515b', text: '#ffffff' },
  { background: '#3b6f4e', text: '#ffffff' }, { background: '#6a5136', text: '#ffffff' },
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
