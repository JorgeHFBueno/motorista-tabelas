// Tipos de item e de subitem: colunas de status do quadro definem o tipo de cada item e decidem quais colunas aparecem.
//   Tipo do item (quadro.config.tipos_item = { coluna_id, colunas }): as colunas do próprio quadro em cada tipo de item.
//   Tipo do subitem (quadro de subitens, config.tipos = { coluna_item, coluna_id, colunas }): os dois tipos ficam no item
//   (coluna_item = tipo do item, coluna_id = tipo do subitem) e todos os subitens dele seguem a combinação
//   ("1:2" = tipo de item 1 + tipo de subitem 2; com um lado só, a chave é o rótulo dele).
//   colunas = { id da coluna: chaves em que ela aparece }; coluna fora do mapa = comum (todas as chaves).
// Item sem tipo (ou sem um dos dois) mostra todas as colunas. Só a tela muda: os valores ficam guardados, e a API,
// as automações e a exportação seguem vendo todas as colunas.
// Contrato: The Manuscript, 03_APLICACAO_WEB/13_FRIDAY_GESTAO_INTERNA.md ("Tipos de subitem").
import type { Item } from './tipos.ts';

export type MapaTipos = Record<string, string[]>;
export type ComMapa = { colunas?: MapaTipos };
export type TiposItem = { coluna_id: number; colunas?: MapaTipos };
export type TiposSub = { coluna_item?: number | null; coluna_id?: number | null; colunas?: MapaTipos };

/** Tipos de item ativos (com a coluna escolhida) ou null. */
export function tiposItemDo(config: Record<string, unknown> | undefined): TiposItem | null {
  const t = config?.tipos_item as TiposItem | undefined;
  return t && Number(t.coluna_id) ? t : null;
}
/** Tipos de subitem ativos (com a coluna do tipo do item ou do subitem) ou null. */
export function tiposDoSub(config: Record<string, unknown> | undefined): TiposSub | null {
  const t = config?.tipos as TiposSub | undefined;
  return t && (Number(t.coluna_id) || Number(t.coluna_item)) ? t : null;
}

/** Rótulo escolhido no item numa coluna de status (null = vazio). */
export function rotuloDoItem(item: Pick<Item, 'valores'> | undefined, colunaId: number): string | null {
  const v = item?.valores?.[colunaId];
  return v != null && v !== '' && String(v) !== '0' ? String(v) : null;
}
/** Tipo do item (null = sem tipo: mostra todas as colunas). */
export const tipoDoItem = (t: TiposItem | null, item: Pick<Item, 'valores'> | undefined) => (t ? rotuloDoItem(item, t.coluna_id) : null);

/** Chave da combinação que os subitens de um item seguem; null (sem tipo num dos lados) mostra todas as colunas. */
export function chaveDoSubitem(t: TiposSub | null, pai: Pick<Item, 'valores'> | undefined): string | null {
  if (!t) return null;
  const partes: string[] = [];
  for (const c of [t.coluna_item, t.coluna_id]) {
    if (!Number(c)) continue;
    const v = rotuloDoItem(pai, Number(c));
    if (v == null) return null;
    partes.push(v);
  }
  return partes.length ? partes.join(':') : null;
}

/** Combinações (chave e partes) dos tipos de item com os de subitem; um lado vazio (null) fica de fora. */
export function combinacoes<R extends { id: string }>(itens: R[] | null, subs: R[] | null): { chave: string; partes: R[] }[] {
  if (itens && subs) return itens.flatMap(a => subs.map(b => ({ chave: `${a.id}:${b.id}`, partes: [a, b] })));
  return (itens ?? subs ?? []).map(a => ({ chave: a.id, partes: [a] }));
}

/** A coluna aparece na chave? Coluna comum (fora do mapa) e chave null (sem tipo) mostram sempre. */
export function colunaNoTipo(t: ComMapa | null, colunaId: number, chave: string | null): boolean {
  const lista = t?.colunas?.[String(colunaId)];
  return !lista || chave == null || lista.includes(chave);
}

/** Colunas do quadro na tabela: as que algum item mostrado usa (sem itens, ou com item sem tipo, todas). */
export function colunasUsadas<C extends { id: number }>(t: TiposItem | null, colunas: C[], itens: Pick<Item, 'valores'>[]): C[] {
  if (!t || !itens.length) return colunas;
  const chaves = new Set(itens.map(i => tipoDoItem(t, i)));
  if (chaves.has(null)) return colunas;
  return colunas.filter(c => [...chaves].some(k => colunaNoTipo(t, c.id, k)));
}

/**
 * Marca ou desmarca a coluna numa chave. `todos` = todas as chaves: marcada em todas, a coluna volta a ser comum
 * (sai do mapa e aparece também nos tipos criados depois).
 */
export function marcarColunaNoTipo<T extends ComMapa>(t: T, colunaId: number, chave: string, marcado: boolean, todos: string[]): T {
  const atual = t.colunas?.[String(colunaId)] ?? todos;
  const nova = marcado ? [...new Set([...atual, chave])] : atual.filter(x => x !== chave);
  const colunas = { ...(t.colunas ?? {}) };
  if (todos.every(x => nova.includes(x))) delete colunas[String(colunaId)];
  else colunas[String(colunaId)] = todos.filter(x => nova.includes(x));
  return { ...t, colunas };
}

/** Deixa a coluna só numa chave (coluna nova criada nos subitens de um item com tipo). */
export const colunaSoNoTipo = <T extends ComMapa>(t: T, colunaId: number, chave: string): T =>
  ({ ...t, colunas: { ...(t.colunas ?? {}), [String(colunaId)]: [chave] } });

/** Mapa só com chaves válidas; coluna marcada em todas volta a ser comum. */
export function limparMapa(mapa: MapaTipos, validas: string[]): MapaTipos {
  const out: MapaTipos = {};
  for (const [k, l] of Object.entries(mapa)) {
    const f = l.filter(x => validas.includes(x));
    if (!validas.every(x => f.includes(x))) out[k] = f;
  }
  return out;
}
