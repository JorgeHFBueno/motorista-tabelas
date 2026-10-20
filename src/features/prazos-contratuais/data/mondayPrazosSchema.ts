/**
 * Vínculo da tela de Prazos Contratuais com o Monday (quadro GESTÃO DE OBRAS)
 * e com o espelho no Firestore (`monday-obras`, projetado por functions/mondayProjector.ts).
 *
 * A projeção não traz a coluna Situação, o grupo do item nem a URL do item. A tela
 * usa os equivalentes já projetados: Status (fórmula) para Entregue/Finalizada,
 * Tipo de Obra para Pública/Privada e o ID do item para montar o link.
 */
export const MONDAY_BOARD_ID = '8515762377';
export const FIRESTORE_COLLECTION = 'monday-obras';

/** Coluna do Monday -> campo em `monday-obras/{itemId}.raw`. */
export const MONDAY_COLUMNS = {
  nome: 'name', // raw.nome
  empresa: 'empresa_mknb1cwy', // raw.empresa (LEDUR / ARTEBASE)
  inicio: 'data_mknaqn4f', // raw.inicio (YYYY-MM-DD)
  fim: 'fim_mknaarxc', // raw.fim (YYYY-MM-DD)
  tipoObra: 'dropdown_mkvc6z6r', // raw.tipoObra (Pública / Privada)
  statusFluxo: 'f_rmula_mknbt1hr', // raw.status (fórmula: "Confirmar Recurso", "Obra em Andamento", "Obra Finalizada"...)
  ordemInicio: 'dropdown_mknrvr7q', // raw.ordemInicio (Ok)
  subitens: 'subtasks_mknqe6eg', // raw.subitems[]
  statusSubitem: 'color_mknqcdnw', // raw.subitems[].status
} as const;

export const SITUACOES_EXCLUIDAS = ['Entregue', 'Finalizada'] as const;

/** URL do item no Monday (conta configurável). */
export function mondayItemUrl(itemId: string, accountSlug = import.meta.env?.VITE_MONDAY_ACCOUNT_SLUG || 'ledur'): string {
  return `https://${accountSlug}.monday.com/boards/${MONDAY_BOARD_ID}/pulses/${itemId}`;
}
