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

export type MestreColor = { background: string; text: string };
let activeKeys: string[] = [];
export function setActiveMestreColorKeys(keys: readonly string[]) { activeKeys = [...new Set(keys.map(normalizeMestreKey))].sort((a, b) => a.localeCompare(b, 'pt-BR')); }

/**
 * Deterministic, injective registry for the current master set. Sorting by the
 * stable key means every surface resolves the same colour without randomness.
 */
export function getMestreColor(mestreKey: string, currentKeys: readonly string[] = activeKeys): MestreColor {
  const key = normalizeMestreKey(mestreKey);
  const keys = [...new Set([...currentKeys.map(normalizeMestreKey), key])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const index = keys.indexOf(key);
  if (index < PALETTE.length) return PALETTE[index];
  // Hues intentionally avoid the semantic blue/yellow/red range used by obras.
  const hue = (index * 137.508 + 112) % 360;
  return { background: `hsl(${hue.toFixed(1)} 42% 34%)`, text: '#ffffff' };
}
export function mestreColorRegistry(keys: readonly string[]) { const normalized = [...new Set(keys.map(normalizeMestreKey))].sort((a, b) => a.localeCompare(b, 'pt-BR')); return new Map(normalized.map((key) => [key, getMestreColor(key, normalized)])); }

export { PALETTE as MESTRE_COLORS };
