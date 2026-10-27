import type { MestrePlanejado, ObraCronograma } from '../domain/models';
import { normalizeMestreKey } from '../domain/mestres';
/** Operações locais substituíveis por uma fonte de leitura/escrita futura, sem modelar Firestore. */
export function updateObraLocal(obras: ObraCronograma[], obra: ObraCronograma): ObraCronograma[] { return obras.map((item) => item.id === obra.id ? obra : item); }
/** Applies the backend-confirmed LOTE status by its stable key, never by UI position. */
export function updateObraStatusByLoteId(obras: readonly ObraCronograma[], contratoId: string, loteId: string, status: string): ObraCronograma[] {
  return obras.map((obra) => obra.contratoId === contratoId && obra.loteId === loteId && obra.status !== status ? { ...obra, status } : obra);
}
/** True when every projected LOTE field except its hydrated masters is unchanged (name, status, period, contract...). */
export function sameObraExceptMasters(left: ObraCronograma, right: ObraCronograma): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)] as Array<keyof ObraCronograma>);
  keys.delete('mestresPlanejados');
  return [...keys].every((key) => left[key] === right[key]);
}
/** Exact duplicates are ignored; conflicts remain allowed and are derived by workload. */
export function addMestrePlanejadoLocal(obras: ObraCronograma[], obraId: string, mestre: MestrePlanejado): ObraCronograma[] {
  return obras.map((obra) => {
    if (obra.id !== obraId || obra.mestresPlanejados.some((item) => (item.mestreKey ?? normalizeMestreKey(item.nome)) === (mestre.mestreKey ?? normalizeMestreKey(mestre.nome)) && item.inicio === mestre.inicio && item.tempoPlanejado === mestre.tempoPlanejado)) return obra;
    return { ...obra, mestresPlanejados: [...obra.mestresPlanejados, mestre] };
  });
}
