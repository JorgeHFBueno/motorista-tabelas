/**
 * Normaliza uma placa exclusivamente para consulta completa no ERP.
 * Ex.: "JBJ-4J22" -> "JBJ4J22".
 */
export function normalizarPlacaParaErp(placa) {
  return String(placa ?? '')
    .toUpperCase()
    .replace(/[-\s]/g, '');
}
