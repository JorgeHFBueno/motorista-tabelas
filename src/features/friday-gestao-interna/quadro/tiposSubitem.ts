// Tipos de subitem: uma coluna de status do quadro (ex.: Tipo = PONTE / PAVILHÃO no contrato) decide quais colunas
// os subitens daquele item mostram. Fica no quadro de subitens, em config.tipos:
//   coluna_id  coluna de status do quadro principal que define o tipo;
//   padrao     rótulo que vale para o item sem tipo (ex.: PONTE);
//   colunas    { id da coluna dos subitens: ids dos rótulos em que ela aparece }; coluna fora do mapa = comum (todos os tipos).
// Só a tela muda: os valores ficam guardados, e a API, as automações e a exportação seguem vendo todas as colunas.
// Contrato: The Manuscript, 03_APLICACAO_WEB/13_FRIDAY_GESTAO_INTERNA.md ("Tipos de subitem").
import type { Item } from './tipos.ts';

export type TiposSub = { coluna_id: number; padrao?: string | null; colunas?: Record<string, string[]> };

/** Configuração ativa (com a coluna do tipo escolhida) ou null. */
export function tiposDoSub(config: Record<string, unknown> | undefined): TiposSub | null {
  const t = config?.tipos as TiposSub | undefined;
  return t && Number(t.coluna_id) ? t : null;
}

/** Tipo do item: o rótulo escolhido na coluna do tipo ou, sem rótulo, o padrão. null = sem tipo (mostra todas). */
export function tipoDoItem(t: TiposSub | null, item: Pick<Item, 'valores'> | undefined): string | null {
  if (!t) return null;
  const v = item?.valores?.[t.coluna_id];
  return v != null && v !== '' && String(v) !== '0' ? String(v) : t.padrao ?? null;
}

/** A coluna dos subitens aparece no tipo? Coluna comum (fora do mapa) e item sem tipo mostram sempre. */
export function colunaNoTipo(t: TiposSub | null, colunaId: number, tipo: string | null): boolean {
  const lista = t?.colunas?.[String(colunaId)];
  return !lista || tipo == null || lista.includes(tipo);
}

/**
 * Marca ou desmarca a coluna num tipo. `todos` = ids de todos os tipos: marcada em todos, a coluna volta a ser comum
 * (sai do mapa, e aparece também nos tipos criados depois).
 */
export function marcarColunaNoTipo(t: TiposSub, colunaId: number, tipo: string, marcado: boolean, todos: string[]): TiposSub {
  const atual = t.colunas?.[String(colunaId)] ?? todos;
  const nova = marcado ? [...new Set([...atual, tipo])] : atual.filter(x => x !== tipo);
  const colunas = { ...(t.colunas ?? {}) };
  if (todos.every(x => nova.includes(x))) delete colunas[String(colunaId)];
  else colunas[String(colunaId)] = todos.filter(x => nova.includes(x));
  return { ...t, colunas };
}

/** Deixa a coluna só num tipo (coluna nova criada nos subitens de um item com tipo). */
export const colunaSoNoTipo = (t: TiposSub, colunaId: number, tipo: string): TiposSub =>
  ({ ...t, colunas: { ...(t.colunas ?? {}), [String(colunaId)]: [tipo] } });
