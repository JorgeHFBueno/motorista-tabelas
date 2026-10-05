import express from 'express';
import cors from 'cors';
import { db } from './firebaseAdmin.js';
import { adminAuthMiddleware, type AdminRequest } from './adminAuth.js';
import { mondayApiToken, MONDAY_API_VERSION, queryMonday } from './mondayClient.js';
import { buildMondayManagedPatch, normalizeMondayParent, projectMondayParentToFirestore } from './mondayProjector.js';

export { mondayApiToken, MONDAY_API_VERSION, queryMonday, type MondayQueryMeta } from './mondayClient.js';

const BOARD_ID = '8515762377';
const MAX_BATCH_WRITES = 450;

type MondaySubitem = { id: string; nome: string | null; status: string | null };
type MondayItem = { id: string; nome: string | null; status: string | null; ordemInicio: string | null; confirmacaoRecurso: string | null; tipoObra: string | null; numeroContrato: string | null; ano: number | null; empresa: string | null; inicio: string | null; fim: string | null; updatedAt: string | null; subitems: MondaySubitem[] };
type AnyRecord = Record<string, any>;

const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const isoDate = (value: unknown): string | null => { const result = text(value); return result && /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null; };
const columnText = (columns: any[], id: string) => text(columns.find((column) => column?.id === id)?.text);
// FormulaValue exposes its calculated result in display_value. Its text/value fields
// are intentionally not a fallback source for the contractual status.
const formulaDisplayValue = (columns: any[], id: string) => text(columns.find((column) => column?.id === id)?.display_value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function normalizeMondayItem(item: any): MondayItem {
  return normalizeMondayParent(item);
  /* legacy normalization retained below only as unreachable source context during MK6B extraction
  const columns = Array.isArray(item?.column_values) ? item.column_values : [];
  const year = text(columnText(columns, 'text_mkntryg9'));
  return {
    id: String(item.id), nome: text(item.name), status: formulaDisplayValue(columns, 'f_rmula_mknbt1hr'),
    ordemInicio: columnText(columns, 'dropdown_mknrvr7q'), confirmacaoRecurso: columnText(columns, 'dropdown_mknqe4hf'),
    numeroContrato: columnText(columns, 'texto_mknarg02'), ano: year && /^\d{4}$/.test(year) ? Number(year) : null,
    empresa: columnText(columns, 'empresa_mknb1cwy'), inicio: isoDate(columnText(columns, 'data_mknaqn4f')),
    fim: isoDate(columnText(columns, 'fim_mknaarxc')), updatedAt: text(item.updated_at),
    subitems: (Array.isArray(item.subitems) ? item.subitems : []).map((subitem: any) => ({
      id: String(subitem.id), nome: text(subitem.name), status: columnText(Array.isArray(subitem.column_values) ? subitem.column_values : [], 'color_mknqcdnw'),
    })),
  };
  */
}

const selection = `cursor items { id name updated_at column_values(ids: ["f_rmula_mknbt1hr", "texto_mknarg02", "text_mkntryg9", "empresa_mknb1cwy", "data_mknaqn4f", "fim_mknaarxc", "dropdown_mknrvr7q", "dropdown_mknqe4hf", "dropdown_mkvc6z6r"]) { id type text ... on FormulaValue { display_value } } subitems { id name column_values(ids: ["color_mknqcdnw"]) { id text } } }`;
export async function readMondayBoard(token: string): Promise<MondayItem[]> {
  const first = await queryMonday(token, `query ($boardId: ID!) { boards(ids: [$boardId]) { items_page(limit: 100) { ${selection} } } }`, { boardId: BOARD_ID });
  let page = first.boards?.[0]?.items_page;
  if (!page) throw new Error('MONDAY_BOARD_UNAVAILABLE');
  const items = [...(page.items ?? [])];
  while (page.cursor) { const next = await queryMonday(token, `query ($cursor: String!) { next_items_page(cursor: $cursor, limit: 100) { ${selection} } }`, { cursor: page.cursor }); page = next.next_items_page; if (!page) throw new Error('MONDAY_PAGINATION_INVALID'); items.push(...(page.items ?? [])); }
  return items.map(normalizeMondayItem);
}

function project(current: AnyRecord | null, item: MondayItem, obraV2Status: unknown) {
  const projection = buildMondayManagedPatch(current, item);
  const obraV2Id = typeof current?.obraV2Id === 'string' && current.obraV2Id.trim() ? current.obraV2Id : null;
  return { ...projection, details: projection.details, isFinalized: item.status === 'Obra Finalizada' && obraV2Id && obraV2Status !== 'FINALIZADA' ? obraV2Id : null };
}

export function createPlan(mondayItems: MondayItem[], firestoreDocuments: Array<{ id: string; data: AnyRecord }>, obraV2Statuses = new Map<string, unknown>()) {
  const firebase = new Map(firestoreDocuments.map((document) => [document.id, document.data])); const monday = new Map(mondayItems.map((item) => [item.id, item]));
  const summary: any = { itemsMonday: mondayItems.length, itemsFirebase: firestoreDocuments.length, itemsCriar: 0, itemsAtualizar: 0, itemsSemAlteracao: 0, itemsAusentesMonday: 0, subitemsAdicionar: 0, subitemsAtualizar: 0, subitemsAusentesMonday: 0, fimAtualizar: 0, statusAtualizar: 0, formulaStatusVazia: 0, ordemInicioAtualizar: 0, confirmacaoRecursoAtualizar: 0, tipoObraAtualizar: 0, obrasFinalizadasMonday: 0, obrasComObraV2Id: 0, obrasJaFinalizadas: 0, obrasFinalizar: 0, erros: [] as string[] };
  const operations: any[] = []; const details: any[] = [];
  for (const item of mondayItems) { const current = firebase.get(item.id) ?? null; const obraV2Id = typeof current?.obraV2Id === 'string' && current.obraV2Id.trim() ? current.obraV2Id : null; const obraV2Status = obraV2Id ? obraV2Statuses.get(obraV2Id) : undefined; const result = project(current, item, obraV2Status); if (!current) summary.itemsCriar++; else if (result.changed) summary.itemsAtualizar++; else summary.itemsSemAlteracao++;
    for (const detail of result.details) { if (detail.type === 'SUBITEM_ADD') summary.subitemsAdicionar++; if (detail.type === 'SUBITEM_UPDATE') summary.subitemsAtualizar++; if (detail.type === 'SUBITEM_AUSENTE_NO_MONDAY') summary.subitemsAusentesMonday++; }
    const changes = [...result.details];
    if (current?.raw?.status !== item.status) changes.push({ type: 'STATUS_FORMULA_ATUALIZAR', before: current?.raw?.status ?? null, after: item.status });
    if (item.status === null) changes.push({ type: 'STATUS_FORMULA_VAZIA' });
    if (current?.raw?.ordemInicio !== item.ordemInicio) { changes.push({ type: 'ORDEM_INICIO_ATUALIZAR', before: current?.raw?.ordemInicio ?? null, after: item.ordemInicio }); summary.ordemInicioAtualizar++; }
    if (current?.raw?.confirmacaoRecurso !== item.confirmacaoRecurso) { changes.push({ type: 'CONFIRMACAO_RECURSO_ATUALIZAR', before: current?.raw?.confirmacaoRecurso ?? null, after: item.confirmacaoRecurso }); summary.confirmacaoRecursoAtualizar++; }
    if (current?.raw?.tipoObra !== item.tipoObra) { changes.push({ type: 'TIPO_OBRA_ATUALIZAR', before: current?.raw?.tipoObra ?? null, after: item.tipoObra }); summary.tipoObraAtualizar++; }
    if (current?.raw?.fim !== item.fim) summary.fimAtualizar++; if (current?.raw?.status !== item.status) summary.statusAtualizar++; if (item.status === null) summary.formulaStatusVazia++;
    if (item.status === 'Obra Finalizada') { summary.obrasFinalizadasMonday++; if (obraV2Id) { summary.obrasComObraV2Id++; if (obraV2Status === 'FINALIZADA') summary.obrasJaFinalizadas++; } }
    if (result.isFinalized) summary.obrasFinalizar++;
    if (result.changed || result.isFinalized) operations.push({ id: item.id, create: !current, parent: item, ...result }); if (result.changed || changes.length) details.push({ itemId: item.id, nome: item.nome, changes, before: current?.raw?.fim ?? null, after: item.fim });
  }
  for (const document of firestoreDocuments) if (!monday.has(document.id)) { summary.itemsAusentesMonday++; details.push({ itemId: document.id, type: 'ITEM_AUSENTE_NO_MONDAY' }); }
  if (operations.length > MAX_BATCH_WRITES) summary.erros.push(`BATCH_LIMIT_EXCEEDED:${operations.length}`);
  return { summary, operations, details };
}

export async function applyPlan(plan: ReturnType<typeof createPlan>, firestore: any = db) {
  if (plan.summary.erros.length) throw new Error(plan.summary.erros.join(','));
  if (!plan.operations.length) return 0;
  let writes = 0;
  for (const operation of plan.operations) {
    if (operation.changed) { const result = await projectMondayParentToFirestore(firestore, operation.parent); if (result.result === 'UPDATED') writes++; }
    if (operation.isFinalized) { await firestore.collection('obras-v2').doc(operation.isFinalized).update({ status: 'FINALIZADA' }); writes++; }
  }
  return writes;
}

async function execute(mode: 'dry-run' | 'apply', uid: string, token: string) {
  const started = Date.now(); const [mondayItems, snapshot] = await Promise.all([readMondayBoard(token), db.collection('monday-obras').get()]);
  const documents = snapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
  const obraV2Ids = [...new Set(documents.map((document) => document.data?.obraV2Id).filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))];
  const obraV2Documents = obraV2Ids.length ? await db.getAll(...obraV2Ids.map((id) => db.collection('obras-v2').doc(id))) : [];
  const obraV2Statuses = new Map(obraV2Documents.map((document) => [document.id, document.get('status')]));
  const plan = createPlan(mondayItems, documents, obraV2Statuses);
  if (plan.summary.erros.length) throw new Error(plan.summary.erros.join(','));
  const firestoreWrites = mode === 'apply' ? await applyPlan(plan) : 0;
  console.info('MONDAY_SYNC', { uid, boardId: BOARD_ID, mode, durationMs: Date.now() - started, ...plan.summary });
  return { mode, ...plan.summary, details: plan.details, firestoreWrites, mondayWrites: 0 };
}

type SyncAuthMiddleware = typeof adminAuthMiddleware;
type SyncExecutor = typeof execute;

export function createMondaySyncApp(options: { authMiddleware?: SyncAuthMiddleware; token?: () => string | undefined; executor?: SyncExecutor } = {}) {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json());
  app.use(options.authMiddleware ?? adminAuthMiddleware);
  const handler = async (req: AdminRequest, res: express.Response) => {
    const mode = req.body?.mode === 'apply' ? 'apply' : req.body?.mode === 'dry-run' ? 'dry-run' : null;
    if (!mode) { res.status(400).json({ error: 'invalid_mode' }); return; }
    const token = (options.token ?? (() => mondayApiToken.value()))();
    if (!token) { res.status(503).json({ error: 'monday_secret_unavailable' }); return; }
    try { res.json(await (options.executor ?? execute)(mode, req.user!.uid, token)); }
    catch (error) { console.error('MONDAY_SYNC_FAILED', { uid: req.user?.uid, message: error instanceof Error ? error.message : String(error) }); res.status(500).json({ error: 'monday_sync_failed' }); }
  };
  app.post(['/', '/api/monday-sync'], handler);
  return app;
}

const syncApp = createMondaySyncApp();
export default syncApp;
