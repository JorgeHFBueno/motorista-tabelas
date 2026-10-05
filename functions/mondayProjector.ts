import { FieldValue } from 'firebase-admin/firestore';
import { MONDAY_API_VERSION, queryMonday } from './mondayClient.js';

export const MONDAY_PARENT_BOARD_ID = '8515762377';
export type AnyRecord = Record<string, any>;
export type MondaySubitem = { id: string; nome: string | null; status: string | null };
export type MondayParent = { id: string; nome: string | null; status: string | null; ordemInicio: string | null; confirmacaoRecurso: string | null; tipoObra: string | null; numeroContrato: string | null; ano: number | null; empresa: string | null; inicio: string | null; fim: string | null; updatedAt: string | null; subitems: MondaySubitem[] };
export type MondayProjection = { changed: boolean; patch: { raw: AnyRecord; sincronizacao: AnyRecord }; changedFields: string[]; changedReasons: string[]; details: AnyRecord[] };

const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const isoDate = (value: unknown): string | null => { const result = text(value); return result && /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null; };
const columnText = (columns: any[], id: string) => text(columns.find((column) => column?.id === id)?.text);
const formulaDisplayValue = (columns: any[], id: string) => text(columns.find((column) => column?.id === id)?.display_value);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as AnyRecord).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
  return value === undefined ? null : value;
}
export const semanticallyEqual = (left: unknown, right: unknown) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

/** Canonical, side-effect-free representation of the Monday-owned parent fields. */
export function normalizeMondayParent(item: any): MondayParent {
  const columns = Array.isArray(item?.column_values) ? item.column_values : [];
  const year = text(columnText(columns, 'text_mkntryg9'));
  return {
    id: String(item.id), nome: text(item.name), status: formulaDisplayValue(columns, 'f_rmula_mknbt1hr'),
    ordemInicio: columnText(columns, 'dropdown_mknrvr7q'), confirmacaoRecurso: columnText(columns, 'dropdown_mknqe4hf'), tipoObra: columnText(columns, 'dropdown_mkvc6z6r'),
    numeroContrato: columnText(columns, 'texto_mknarg02'), ano: year && /^\d{4}$/.test(year) ? Number(year) : null,
    empresa: columnText(columns, 'empresa_mknb1cwy'), inicio: isoDate(columnText(columns, 'data_mknaqn4f')),
    fim: isoDate(columnText(columns, 'fim_mknaarxc')), updatedAt: text(item.updated_at),
    subitems: (Array.isArray(item.subitems) ? item.subitems : []).map((subitem: any) => ({
      id: String(subitem.id), nome: text(subitem.name), status: columnText(Array.isArray(subitem.column_values) ? subitem.column_values : [], 'color_mknqcdnw'),
    })),
  };
}

function projectSubitems(previous: AnyRecord[], subitems: MondaySubitem[]) {
  const byId = new Map(previous.map((subitem) => [String(subitem?.id), subitem])); const mondayIds = new Set(subitems.map((subitem) => subitem.id)); const details: AnyRecord[] = []; const next = [...previous];
  for (const subitem of subitems) {
    const existing = byId.get(subitem.id); const projected = existing ? { ...existing, id: subitem.id, nome: subitem.nome, status: subitem.status } : { id: subitem.id, nome: subitem.nome, status: subitem.status };
    if (!existing) details.push({ type: 'SUBITEM_ADD', subitemId: subitem.id, after: projected }); else if (!semanticallyEqual(existing, projected)) details.push({ type: 'SUBITEM_UPDATE', subitemId: subitem.id, before: existing, after: projected });
    if (existing) next[previous.indexOf(existing)] = projected; else next.push(projected);
  }
  for (const subitem of previous) if (!mondayIds.has(String(subitem?.id))) details.push({ type: 'SUBITEM_AUSENTE_NO_MONDAY', subitemId: String(subitem?.id) });
  return { subitems: next, details };
}

/** Builds only Monday-managed fields; top-level local-owned fields are never included. */
export function buildMondayManagedPatch(existing: AnyRecord | null, parent: MondayParent): MondayProjection {
  const currentRaw = existing?.raw && typeof existing.raw === 'object' ? existing.raw : {};
  const previousSubitems = Array.isArray(currentRaw.subitems) ? currentRaw.subitems : [];
  const { subitems, details } = projectSubitems(previousSubitems, parent.subitems);
  const raw = { ...currentRaw, id: parent.id, nome: parent.nome, status: parent.status, ordemInicio: parent.ordemInicio, confirmacaoRecurso: parent.confirmacaoRecurso, tipoObra: parent.tipoObra, numeroContrato: parent.numeroContrato, ano: parent.ano, empresa: parent.empresa, inicio: parent.inicio, fim: parent.fim, subitems };
  const sincronizacao = { ...(existing?.sincronizacao && typeof existing.sincronizacao === 'object' ? existing.sincronizacao : {}), itemId: parent.id, boardId: MONDAY_PARENT_BOARD_ID, apiVersion: MONDAY_API_VERSION, mondayUpdatedAt: parent.updatedAt };
  const currentMetadata = existing?.sincronizacao ? { itemId: existing.sincronizacao.itemId, boardId: existing.sincronizacao.boardId, apiVersion: existing.sincronizacao.apiVersion, mondayUpdatedAt: existing.sincronizacao.mondayUpdatedAt } : null;
  const expectedMetadata = { itemId: sincronizacao.itemId, boardId: sincronizacao.boardId, apiVersion: sincronizacao.apiVersion, mondayUpdatedAt: sincronizacao.mondayUpdatedAt };
  const changedFields: string[] = []; const changedReasons = details.map((detail) => detail.type);
  if (!existing) { changedFields.push('raw', 'sincronizacao'); changedReasons.push('PARENT_CREATE'); }
  else { if (!semanticallyEqual(currentRaw, raw)) changedFields.push('raw'); if (!semanticallyEqual(currentMetadata, expectedMetadata)) changedFields.push('sincronizacao'); }
  if (!semanticallyEqual(currentRaw.status, parent.status)) changedReasons.push('STATUS_FORMULA_ATUALIZAR');
  if (!semanticallyEqual(currentRaw.ordemInicio, parent.ordemInicio)) changedReasons.push('ORDEM_INICIO_ATUALIZAR');
  if (!semanticallyEqual(currentRaw.confirmacaoRecurso, parent.confirmacaoRecurso)) changedReasons.push('CONFIRMACAO_RECURSO_ATUALIZAR');
  if (!semanticallyEqual(currentRaw.tipoObra, parent.tipoObra)) changedReasons.push('TIPO_OBRA_ATUALIZAR');
  return { changed: changedFields.length > 0, patch: { raw, sincronizacao }, changedFields, changedReasons: [...new Set(changedReasons)], details };
}

export type FirestoreProjector = { collection: (name: string) => { doc: (id: string) => any }; runTransaction: (worker: (transaction: any) => Promise<any>) => Promise<any> };
export type ParentSyncResult = { result: 'UPDATED' | 'NO_CHANGE'; parentItemId: string; changedReasons: string[]; changedFields: string[] };

/** Uses a transaction so concurrent local-owned updates cannot be lost. */
export async function projectMondayParentToFirestore(firestore: FirestoreProjector, parent: MondayParent): Promise<ParentSyncResult> {
  return firestore.runTransaction(async (transaction) => {
    const ref = firestore.collection('monday-obras').doc(parent.id); const snapshot = await transaction.get(ref); const projection = buildMondayManagedPatch(snapshot.exists ? snapshot.data?.() ?? snapshot.get?.() : null, parent);
    if (!projection.changed) return { result: 'NO_CHANGE' as const, parentItemId: parent.id, changedReasons: [], changedFields: [] };
    const patch = { ...projection.patch, sincronizacao: { ...projection.patch.sincronizacao, capturadoEm: FieldValue.serverTimestamp() } };
    if (snapshot.exists) transaction.update(ref, patch); else transaction.set(ref, patch, { merge: true });
    return { result: 'UPDATED' as const, parentItemId: parent.id, changedReasons: projection.changedReasons, changedFields: projection.changedFields };
  });
}

const selection = `items { id name updated_at column_values(ids: ["f_rmula_mknbt1hr", "texto_mknarg02", "text_mkntryg9", "empresa_mknb1cwy", "data_mknaqn4f", "fim_mknaarxc", "dropdown_mknrvr7q", "dropdown_mknqe4hf", "dropdown_mkvc6z6r"]) { id type text ... on FormulaValue { display_value } } subitems { id name column_values(ids: ["color_mknqcdnw"]) { id text } } }`;
export async function readMondayParent(token: string, parentItemId: string, mondayQuery: typeof queryMonday = queryMonday): Promise<MondayParent> {
  const data = await mondayQuery(token, `query ($id: ID!) { ${selection.replace('items', 'items(ids: [$id])')} }`, { id: parentItemId }); const item = data.items?.[0];
  if (!item || String(item.id) !== parentItemId) throw new Error('MONDAY_PARENT_NOT_FOUND');
  return normalizeMondayParent(item);
}
export async function syncMondayParentToFirestore(parentItemId: string, token: string, dependencies: { firestore: FirestoreProjector; mondayQuery?: typeof queryMonday } ): Promise<ParentSyncResult> {
  return projectMondayParentToFirestore(dependencies.firestore, await readMondayParent(token, parentItemId, dependencies.mondayQuery));
}
