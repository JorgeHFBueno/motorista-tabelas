import type { ObraCronograma } from '../domain/models';
/** Operações locais substituíveis por uma fonte de leitura/escrita futura, sem modelar Firestore. */
export function addObraLocal(obras: ObraCronograma[], obra: ObraCronograma): ObraCronograma[] { return [...obras, obra]; }
export function updateObraLocal(obras: ObraCronograma[], obra: ObraCronograma): ObraCronograma[] { return obras.map((item) => item.id === obra.id ? obra : item); }
