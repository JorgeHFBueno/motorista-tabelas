/**
 * Prazos Contratuais leem os contratos de `obras-v2` ligados ao Friday (`friday.ok`), a mesma fonte do CronoObra.
 * O quadro GESTÃO DE OBRAS do Friday é onde o contrato é editado; o link de cada obra abre o item nele.
 * Contrato: The Manuscript, 01_FIRESTORE/COLECOES/obras-v2.md.
 */
export const FIRESTORE_COLLECTION = 'obras-v2';
export const FRIDAY_QUADRO_OBRAS = 1792498933823587;

/** Coluna "Situação" (lista) do quadro: só entram os contratos com ela vazia. */
export const FRIDAY_COLUNA_SITUACAO = 1792498934044675;

/** Item no quadro do Friday; sem o item, abre o quadro. */
export function fridayItemUrl(itemId?: number | null): string {
  return `/friday/quadros/${FRIDAY_QUADRO_OBRAS}${itemId != null ? `?item=${itemId}` : ''}`;
}
