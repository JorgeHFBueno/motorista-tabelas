import type { MestrePlanejado, ObraCronograma } from './models';
import { addDays, calculatedEnd } from './temporal';
import { getMestreKey } from './mestres';

export type MasterPeriods = { key: string; nome: string; periods: MestrePlanejado[] };
export type MasterSelection = { obraId: string; mestreKey: string; periods: MestrePlanejado[] };
const periodStart = (item: MestrePlanejado) => item.inicio;
const hasRealPeriod = (item: MestrePlanejado) => Boolean(item.nome.trim()) && /^\d{4}-\d{2}-\d{2}$/.test(item.inicio) && item.tempoPlanejado > 0;
function groupRealMasterPeriods(periods: readonly MestrePlanejado[]): MasterPeriods[] {
  const groups = new Map<string, MasterPeriods>();
  periods.filter(hasRealPeriod).forEach((item) => { const key = item.mestreKey ?? getMestreKey(item); const group = groups.get(key) ?? { key, nome: item.nome, periods: [] }; group.periods.push(item); groups.set(key, group); });
  return [...groups.values()].map((group) => ({ ...group, periods: [...group.periods].sort((a, b) => periodStart(a).localeCompare(periodStart(b))) })).sort((a, b) => a.periods[0].inicio.localeCompare(b.periods[0].inicio) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
export function masterPeriodsForObra(obra: ObraCronograma): MasterPeriods[] { return groupRealMasterPeriods(obra.mestresPlanejados); }
/** Masters shown in the regular column: every real allocation, ordered by first allocation. */
export const mastersWithRealPeriods = masterPeriodsForObra;
/** Same semantic contract as the work row, aggregated and ordered across a contract. */
export function aggregateMastersWithRealPeriods(obras: readonly ObraCronograma[]): MasterPeriods[] { return groupRealMasterPeriods(obras.flatMap((obra) => mastersWithRealPeriods(obra).flatMap((group) => group.periods))); }
export function masterSelectionForPeriod(obra: ObraCronograma, mestre: MestrePlanejado): MasterSelection {
  const mestreKey = mestre.mestreKey ?? getMestreKey(mestre);
  return { obraId: obra.id, mestreKey, periods: masterPeriodsForObra(obra).find((group) => group.key === mestreKey)?.periods ?? [] };
}
export function startedMasterPeriods(obra: ObraCronograma, today: string): MasterPeriods[] { return masterPeriodsForObra(obra).filter((group) => group.periods.some((item) => item.inicio <= today)); }
export function recentStartedMaster(obra: ObraCronograma, today: string): MasterPeriods | null { return startedMasterPeriods(obra, today).sort((a, b) => b.periods.filter((p) => p.inicio <= today).at(-1)!.inicio.localeCompare(a.periods.filter((p) => p.inicio <= today).at(-1)!.inicio))[0] ?? null; }
export function allocationWarnings(obra: ObraCronograma, item: MestrePlanejado) { const end = calculatedEnd(item.inicio, item.tempoPlanejado); if (!obra.inicioPlanejado || !obra.tempoPlanejado) return { beforeDays: 0, afterDays: 0, end }; const obraEnd = calculatedEnd(obra.inicioPlanejado, obra.tempoPlanejado); return { beforeDays: item.inicio < obra.inicioPlanejado ? Math.round((Date.parse(`${obra.inicioPlanejado}T00:00:00Z`) - Date.parse(`${item.inicio}T00:00:00Z`)) / 86400000) : 0, afterDays: end > obraEnd ? Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${obraEnd}T00:00:00Z`)) / 86400000) : 0, end }; }
export function masterOtherObras(obras: ObraCronograma[], obraId: string, key: string): Array<{ obra: ObraCronograma; periods: MestrePlanejado[] }> { return obras.filter((obra) => obra.id !== obraId).map((obra) => ({ obra, periods: obra.mestresPlanejados.filter((item) => (item.mestreKey ?? getMestreKey(item)) === key).sort((a, b) => a.inicio.localeCompare(b.inicio)) })).filter((item) => item.periods.length).sort((a, b) => a.periods[0].inicio.localeCompare(b.periods[0].inicio)); }
export const allocationEnd = (item: MestrePlanejado) => addDays(item.inicio, item.tempoPlanejado - 1);
