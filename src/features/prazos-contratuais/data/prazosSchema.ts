/**
 * Prazos Contratuais leem os contratos de `obras-v2` ligados ao Friday (`friday.ok`), a mesma fonte do CronoObra.
 * O quadro GESTÃO DE OBRAS do Friday é onde o contrato é editado; o link de cada obra abre o item nele.
 * Contrato: The Manuscript, 01_FIRESTORE/COLECOES/obras-v2.md.
 */
export const FIRESTORE_COLLECTION = 'obras-v2';
export const FRIDAY_QUADRO_OBRAS = 1792498933823587;

export const SITUACOES_EXCLUIDAS = ['Entregue', 'Finalizada'] as const;

/** Item no quadro do Friday; sem o item (quem não lê o Friday), abre o quadro. */
export function fridayItemUrl(itemId?: number | null): string {
  return `/friday/quadros/${FRIDAY_QUADRO_OBRAS}${itemId != null ? `?item=${itemId}` : ''}`;
}
