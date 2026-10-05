import express from 'express';
import cors from 'cors';
import { adminAuthMiddleware, type AdminRequest } from './adminAuth.js';
import { mondayApiToken, queryMonday } from './mondayClient.js';
import { db } from './firebaseAdmin.js';
import { syncMondayParentToFirestore, type FirestoreProjector, type ParentSyncResult } from './mondayProjector.js';

export const SUBITEM_BOARD_ID = '8615383923';
export const STATUS_COLUMN_ID = 'color_mknqcdnw';
export const PARENT_BOARD_ID = '8515762377';
export type MondaySubitemStatus = 'EM_ANDAMENTO' | 'FINALIZADO' | 'PARADA' | 'PROXIMA_A_INICIAR' | 'REVISAR_ESCOPO' | 'NAO_INICIADA';
export const MONDAY_SUBITEM_STATUS = {
  EM_ANDAMENTO: { label: 'Em andamento', labelId: 0 },
  FINALIZADO: { label: 'Finalizado', labelId: 1 },
  PARADA: { label: 'Parada', labelId: 2 },
  PROXIMA_A_INICIAR: { label: 'Próxima a Iniciar', labelId: 3 },
  REVISAR_ESCOPO: { label: 'Revisar escopo', labelId: 4 },
  NAO_INICIADA: { label: 'Não iniciada', labelId: 5 },
} as const satisfies Record<MondaySubitemStatus, { label: string; labelId: number }>;

type AnyRecord = Record<string, any>;
type StatusDetail = { code: MondaySubitemStatus; label: string; labelId: number };
type UpdateRequest = { subitemId: string; novoStatus: MondaySubitemStatus; dryRun: boolean };
type UpdateErrorCode = 'INVALID_REQUEST' | 'SUBITEM_NOT_FOUND' | 'SUBITEM_BOARD_MISMATCH' | 'PARENT_ITEM_MISSING' | 'PARENT_BOARD_MISMATCH' | 'STATUS_COLUMN_MISSING' | 'UNKNOWN_CURRENT_STATUS' | 'POST_WRITE_VERIFICATION_FAILED' | 'SNAPSHOT_UPDATE_FAILED';

class UpdateStatusError extends Error {
  constructor(readonly code: UpdateErrorCode, readonly httpStatus: number) { super(code); }
}
class SnapshotUpdateError extends UpdateStatusError {
  constructor(readonly mondayUpdated: boolean, readonly subitemId: string, readonly statusAtual: StatusDetail) { super('SNAPSHOT_UPDATE_FAILED', 500); }
}

const byLabelId = new Map<number, StatusDetail>(Object.entries(MONDAY_SUBITEM_STATUS).map(([code, status]) => [status.labelId, { code: code as MondaySubitemStatus, ...status }]));
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

export function parseUpdateRequest(body: unknown): UpdateRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new UpdateStatusError('INVALID_REQUEST', 400);
  const input = body as AnyRecord; const allowed = new Set(['subitemId', 'novoStatus', 'dryRun']);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new UpdateStatusError('INVALID_REQUEST', 400);
  if (typeof input.subitemId !== 'string' || !/^\d+$/.test(input.subitemId)) throw new UpdateStatusError('INVALID_REQUEST', 400);
  if (typeof input.novoStatus !== 'string' || !own(MONDAY_SUBITEM_STATUS, input.novoStatus)) throw new UpdateStatusError('INVALID_REQUEST', 400);
  if (own(input, 'dryRun') && typeof input.dryRun !== 'boolean') throw new UpdateStatusError('INVALID_REQUEST', 400);
  return { subitemId: input.subitemId, novoStatus: input.novoStatus as MondaySubitemStatus, dryRun: input.dryRun !== false };
}

function labelIdFromValue(column: AnyRecord): number | null {
  if (typeof column.index === 'number' && Number.isInteger(column.index)) return column.index;
  try {
    const value = JSON.parse(String(column.value ?? ''));
    return typeof value?.index === 'number' && Number.isInteger(value.index) ? value.index : null;
  } catch { return null; }
}

function labelIdFromSchemaLabel(column: AnyRecord, schemaColumn: AnyRecord | undefined): number | null {
  if (typeof column.label !== 'string' || !column.label.trim()) return null;
  const settings = typeof schemaColumn?.settings === 'string' ? JSON.parse(schemaColumn.settings) : schemaColumn?.settings;
  const label = Array.isArray(settings?.labels) ? settings.labels.find((candidate: AnyRecord) => candidate?.label === column.label) : undefined;
  return typeof label?.id === 'number' && Number.isInteger(label.id) ? label.id : null;
}

function statusFromColumn(column: AnyRecord | undefined, schemaColumn?: AnyRecord): StatusDetail {
  if (!column) throw new UpdateStatusError('STATUS_COLUMN_MISSING', 409);
  let labelId = labelIdFromValue(column);
  if (labelId === null) {
    try { labelId = labelIdFromSchemaLabel(column, schemaColumn); } catch { labelId = null; }
  }
  const status = labelId === null ? undefined : byLabelId.get(labelId);
  if (!status || (typeof column.label === 'string' && column.label !== status.label)) throw new UpdateStatusError('UNKNOWN_CURRENT_STATUS', 409);
  return status;
}

async function readSubitem(token: string, subitemId: string, mondayQuery: typeof queryMonday) {
  const data = await mondayQuery(token, 'query($id:ID!,$boardId:ID!){items(ids:[$id]){id name board{id name} parent_item{id board{id name}} column_values(ids:["color_mknqcdnw"]){id type text value ... on StatusValue{index label}}} boards(ids:[$boardId]){id columns(ids:["color_mknqcdnw"]){id type settings}}}', { id: subitemId, boardId: SUBITEM_BOARD_ID });
  const item = data.items?.[0];
  if (!item) throw new UpdateStatusError('SUBITEM_NOT_FOUND', 404);
  if (String(item.id) !== subitemId || String(item.board?.id ?? '') !== SUBITEM_BOARD_ID) throw new UpdateStatusError('SUBITEM_BOARD_MISMATCH', 409);
  const schemaColumn = (data.boards?.[0]?.columns ?? []).find((column: AnyRecord) => column?.id === STATUS_COLUMN_ID);
  const status = statusFromColumn((item.column_values ?? []).find((column: AnyRecord) => column?.id === STATUS_COLUMN_ID), schemaColumn);
  const parentItemId = typeof item.parent_item?.id === 'string' || typeof item.parent_item?.id === 'number' ? String(item.parent_item.id) : '';
  if (!/^\d+$/.test(parentItemId)) throw new UpdateStatusError('PARENT_ITEM_MISSING', 409);
  if (String(item.parent_item?.board?.id ?? '') !== PARENT_BOARD_ID) throw new UpdateStatusError('PARENT_BOARD_MISMATCH', 409);
  return { item, status, parentItemId };
}

type FirestoreLike = FirestoreProjector;
type ParentProjector = (parentItemId: string, token: string, dependencies: { firestore: FirestoreLike; mondayQuery: typeof queryMonday }) => Promise<ParentSyncResult>;
/** @deprecated Compatibility test helper. Production status writes use the parent projector. */
export async function synchronizeSubitemSnapshot(firestore: FirestoreLike, parentItemId: string, subitemId: string, confirmed: StatusDetail): Promise<'UPDATED' | 'ALREADY_CURRENT'> {
  try { return await firestore.runTransaction(async (transaction) => { const ref = firestore.collection('monday-obras').doc(parentItemId); const snapshot = await transaction.get(ref); const raw = snapshot.exists ? snapshot.get('raw') : null; const subitems = Array.isArray(raw?.subitems) ? raw.subitems as AnyRecord[] : null; if (!subitems) throw new Error('SNAPSHOT_INVALID'); const matches = subitems.map((subitem: AnyRecord, index: number) => ({ subitem, index })).filter(({ subitem }: { subitem: AnyRecord }) => String(subitem?.id) === subitemId); if (matches.length !== 1) throw new Error('SNAPSHOT_INVALID'); const { subitem, index } = matches[0]; if (subitem.status === confirmed.label) return 'ALREADY_CURRENT'; const next = subitems.slice(); next[index] = { ...subitem, status: confirmed.label }; transaction.update(ref, { 'raw.subitems': next }); return 'UPDATED'; }); }
  catch { throw new UpdateStatusError('SNAPSHOT_UPDATE_FAILED', 500); }
}
async function projectSnapshot(parentItemId: string, token: string, firestore: FirestoreLike, mondayQuery: typeof queryMonday, projector: ParentProjector) {
  try { return await projector(parentItemId, token, { firestore, mondayQuery }); }
  catch (error) { if (error instanceof UpdateStatusError) throw error; throw new UpdateStatusError('SNAPSHOT_UPDATE_FAILED', 500); }
}

const mutation = 'mutation($boardId:ID!,$itemId:ID!,$columnValues:JSON!){change_multiple_column_values(board_id:$boardId,item_id:$itemId,column_values:$columnValues){id}}';
export async function updateSubitemStatus(token: string, request: UpdateRequest, mondayQuery: typeof queryMonday = queryMonday, firestore?: FirestoreLike, projector: ParentProjector = syncMondayParentToFirestore) {
  const started = Date.now();
  try {
    const before = await readSubitem(token, request.subitemId, mondayQuery);
    const target: StatusDetail = { code: request.novoStatus, ...MONDAY_SUBITEM_STATUS[request.novoStatus] };
    if (before.status.code === target.code) {
      try {
        const snapshot = firestore ? await projectSnapshot(before.parentItemId, token, firestore, mondayQuery, projector) : { result: 'NO_CHANGE' as const, changedReasons: [], changedFields: [] };
        return { result: 'NO_CHANGE' as const, subitemId: request.subitemId, parentItemId: before.parentItemId, statusAnterior: before.status, statusAtual: before.status, snapshotUpdated: snapshot.result === 'UPDATED' };
      } catch (error) { if (error instanceof UpdateStatusError && error.code === 'SNAPSHOT_UPDATE_FAILED') throw new SnapshotUpdateError(false, request.subitemId, before.status); throw error; }
    }
    if (request.dryRun) return { result: 'DRY_RUN' as const, subitemId: request.subitemId, statusAnterior: before.status, statusProposto: target };
    await mondayQuery(token, mutation, { boardId: SUBITEM_BOARD_ID, itemId: request.subitemId, columnValues: JSON.stringify({ [STATUS_COLUMN_ID]: { index: target.labelId } }) });
    const after = await readSubitem(token, request.subitemId, mondayQuery);
    if (after.status.code !== target.code || after.status.labelId !== target.labelId) throw new UpdateStatusError('POST_WRITE_VERIFICATION_FAILED', 502);
    if (after.parentItemId !== before.parentItemId) throw new UpdateStatusError('PARENT_ITEM_MISSING', 409);
    try {
      const snapshot = firestore ? await projectSnapshot(after.parentItemId, token, firestore, mondayQuery, projector) : { result: 'NO_CHANGE' as const, changedReasons: [], changedFields: [] };
      return { result: 'UPDATED' as const, subitemId: request.subitemId, parentItemId: after.parentItemId, statusAnterior: before.status, statusAtual: after.status, snapshotUpdated: snapshot.result === 'UPDATED' };
    } catch (error) { if (error instanceof UpdateStatusError && error.code === 'SNAPSHOT_UPDATE_FAILED') throw new SnapshotUpdateError(true, request.subitemId, after.status); throw error; }
  } finally { console.info('MONDAY_SUBITEM_STATUS', { subitemId: request.subitemId, requestedStatus: request.novoStatus, durationMs: Date.now() - started }); }
}

type UpdateOptions = { authMiddleware?: typeof adminAuthMiddleware; token?: () => string | undefined; updater?: typeof updateSubitemStatus; firestore?: FirestoreLike };
export function createMondayUpdateSubitemStatusApp(options: UpdateOptions = {}) {
  const app = express(); app.use(cors({ origin: true })); app.use(express.json()); app.use(options.authMiddleware ?? adminAuthMiddleware);
  const handler = async (req: AdminRequest, res: express.Response) => {
    let input: UpdateRequest;
    try { input = parseUpdateRequest(req.body); } catch (error) { res.status(error instanceof UpdateStatusError ? error.httpStatus : 400).json({ error: 'invalid_request' }); return; }
    const token = (options.token ?? (() => mondayApiToken.value()))();
    if (!token) { res.status(503).json({ error: 'monday_secret_unavailable' }); return; }
    try {
      const result = await (options.updater ?? updateSubitemStatus)(token, input, queryMonday, options.firestore ?? db);
      console.info('MONDAY_SUBITEM_STATUS_RESULT', { uid: req.user?.uid, subitemId: input.subitemId, parentItemId: result.parentItemId, requestedStatus: input.novoStatus, confirmedStatus: result.statusAtual?.code, monday: result.result, snapshot: result.snapshotUpdated ? 'UPDATED' : 'ALREADY_CURRENT' }); res.json(result);
    }
    catch (error) {
      const known = error instanceof UpdateStatusError ? error : null;
      console.error('MONDAY_SUBITEM_STATUS_ERROR', { uid: req.user?.uid, subitemId: input.subitemId, requestedStatus: input.novoStatus, code: known?.code ?? 'ERROR' });
      res.status(known?.httpStatus ?? 500).json(known instanceof SnapshotUpdateError ? { error: known.code, mondayUpdated: known.mondayUpdated, subitemId: known.subitemId, statusAtual: known.statusAtual } : { error: known?.code ?? 'monday_subitem_status_failed' });
    }
  };
  app.post(['/', '/api/monday-subitem-status'], handler);
  return app;
}

export const mondayUpdateSubitemStatusApp = createMondayUpdateSubitemStatusApp();
