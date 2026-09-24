import type { MestrePlanejado, ObraCronograma } from '../domain/models';
import { normalizeMestreKey } from '../domain/mestres';
/** Operações locais substituíveis por uma fonte de leitura/escrita futura, sem modelar Firestore. */
export function updateObraLocal(obras: ObraCronograma[], obra: ObraCronograma): ObraCronograma[] { return obras.map((item) => item.id === obra.id ? obra : item); }
/** Exact duplicates are ignored; conflicts remain allowed and are derived by workload. */
export function addMestrePlanejadoLocal(obras: ObraCronograma[], obraId: string, mestre: MestrePlanejado): ObraCronograma[] {
  return obras.map((obra) => {
    if (obra.id !== obraId || obra.mestresPlanejados.some((item) => (item.mestreKey ?? normalizeMestreKey(item.nome)) === (mestre.mestreKey ?? normalizeMestreKey(mestre.nome)) && item.inicio === mestre.inicio && item.tempoPlanejado === mestre.tempoPlanejado)) return obra;
    return { ...obra, mestresPlanejados: [...obra.mestresPlanejados, mestre] };
  });
}
