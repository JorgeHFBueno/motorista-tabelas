import express from 'express';
import cors from 'cors';
import { defineSecret } from 'firebase-functions/params';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { adminAuthMiddleware, type AdminRequest } from './adminAuth.js';

export const mondayApiToken = defineSecret('MONDAY_API_TOKEN');
const BOARD_ID = '8515762377';
const API_VERSION = '2026-07';
const MONDAY_URL = 'https://api.monday.com/v2';
const MAX_BATCH_WRITES = 450;

type MondaySubitem = { id: string; nome: string | null; status: string | null };
type MondayItem = { id: string; nome: string | null; status: string | null; numeroContrato: string | null; ano: number | null; empresa: string | null; inicio: string | null; fim: string | null; updatedAt: string | null; subitems: MondaySubitem[] };
type AnyRecord = Record<string, any>;

const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const isoDate = (value: unknown): string | null => { const result = text(value); return result && /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null; };
const columnText = (columns: any[], id: string) => text(columns.find((column) => column?.id === id)?.text);
// FormulaValue exposes its calculated result in display_value. Its text/value fields
// are intentionally not a fallback source for the contractual status.
const formulaDisplayValue = (columns: any[], id: string) => text(columns.find((column) => column?.id === id)?.display_value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function normalizeMondayItem(item: any): MondayItem {
  const columns = Array.isArray(item?.column_values) ? item.column_values : [];
  const year = text(columnText(columns, 'text_mkntryg9'));
  return {
    id: String(item.id), nome: text(item.name), status: formulaDisplayValue(columns, 'f_rmula_mknbt1hr'),
    numeroContrato: columnText(columns, 'texto_mknarg02'), ano: year && /^\d{4}$/.test(year) ? Number(year) : null,
    empresa: columnText(columns, 'empresa_mknb1cwy'), inicio: isoDate(columnText(columns, 'data_mknaqn4f')),
    fim: isoDate(columnText(columns, 'fim_mknaarxc')), updatedAt: text(item.updated_at),
    subitems: (Array.isArray(item.subitems) ? item.subitems : []).map((subitem: any) => ({
      id: String(subitem.id), nome: text(subitem.name), status: columnText(Array.isArray(subitem.column_values) ? subitem.column_values : [], 'color_mknqcdnw'),
    })),
  };
}

async function queryMonday(token: string, query: string, variables: AnyRecord) {
  const response = await fetch(MONDAY_URL, { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const payload = await response.json().catch(() => ({})) as AnyRecord;
  if (!response.ok || payload.errors?.length) throw new Error(`MONDAY_API: ${payload.errors?.map((error: any) => error.message).join('; ') || payload.error_message || response.status}`);
  return payload.data;
}

const selection = `cursor items { id name updated_at column_values(ids: ["f_rmula_mknbt1hr", "texto_mknarg02", "text_mkntryg9", "empresa_mknb1cwy", "data_mknaqn4f", "fim_mknaarxc"]) { id type text ... on FormulaValue { display_value } } subitems { id name column_values(ids: ["color_mknqcdnw"]) { id text } } }`;
export async function readMondayBoard(token: string): Promise<MondayItem[]> {
  const first = await queryMonday(token, `query ($boardId: ID!) { boards(ids: [$boardId]) { items_page(limit: 100) { ${selection} } } }`, { boardId: BOARD_ID });
  let page = first.boards?.[0]?.items_page;
  if (!page) throw new Error('MONDAY_BOARD_UNAVAILABLE');
  const items = [...(page.items ?? [])];
  while (page.cursor) { const next = await queryMonday(token, `query ($cursor: String!) { next_items_page(cursor: $cursor, limit: 100) { ${selection} } }`, { cursor: page.cursor }); page = next.next_items_page; if (!page) throw new Error('MONDAY_PAGINATION_INVALID'); items.push(...(page.items ?? [])); }
  return items.map(normalizeMondayItem);
}

function project(current: AnyRecord | null, item: MondayItem) {
  const raw = current?.raw && typeof current.raw === 'object' ? current.raw : {};
  const previous = Array.isArray(raw.subitems) ? raw.subitems : [];
  const byId = new Map(previous.map((subitem: AnyRecord) => [String(subitem?.id), subitem]));
  const mondayIds = new Set(item.subitems.map((subitem) => subitem.id));
  const details: any[] = [];
  const subitems = [...previous];
  for (const subitem of item.subitems) {
    const existing = byId.get(subitem.id);
    const next = existing ? { ...existing, id: subitem.id, nome: subitem.nome, status: subitem.status } : { id: subitem.id, nome: subitem.nome, status: subitem.status };
    if (!existing) details.push({ type: 'SUBITEM_ADD', subitemId: subitem.id, after: next });
    else if (!same(existing, next)) details.push({ type: 'SUBITEM_UPDATE', subitemId: subitem.id, before: existing, after: next });
    if (existing) subitems[previous.indexOf(existing)] = next; else subitems.push(next);
  }
  for (const subitem of previous) if (!mondayIds.has(String(subitem?.id))) details.push({ type: 'SUBITEM_AUSENTE_NO_MONDAY', subitemId: String(subitem?.id) });
  const nextRaw = { ...raw, id: item.id, nome: item.nome, status: item.status, numeroContrato: item.numeroContrato, ano: item.ano, empresa: item.empresa, inicio: item.inicio, fim: item.fim, subitems };
  const metadata = { ...(current?.sincronizacao ?? {}), itemId: item.id, boardId: BOARD_ID, apiVersion: API_VERSION, mondayUpdatedAt: item.updatedAt };
  // capturadoEm is a server timestamp and must not create write churn by itself.
  const currentMetadata = current?.sincronizacao ? { itemId: current.sincronizacao.itemId, boardId: current.sincronizacao.boardId, apiVersion: current.sincronizacao.apiVersion, mondayUpdatedAt: current.sincronizacao.mondayUpdatedAt } : null;
  const expectedMetadata = { itemId: metadata.itemId, boardId: metadata.boardId, apiVersion: metadata.apiVersion, mondayUpdatedAt: metadata.mondayUpdatedAt };
  const changed = !current || !same(raw, nextRaw) || !same(currentMetadata, expectedMetadata);
  return { changed, details, patch: { raw: nextRaw, sincronizacao: metadata }, isFinalized: item.status === 'Obra Finalizada' && typeof current?.obraV2Id === 'string' ? current.obraV2Id : null };
}

export function createPlan(mondayItems: MondayItem[], firestoreDocuments: Array<{ id: string; data: AnyRecord }>) {
  const firebase = new Map(firestoreDocuments.map((document) => [document.id, document.data])); const monday = new Map(mondayItems.map((item) => [item.id, item]));
  const summary: any = { itemsMonday: mondayItems.length, itemsFirebase: firestoreDocuments.length, itemsCriar: 0, itemsAtualizar: 0, itemsSemAlteracao: 0, itemsAusentesMonday: 0, subitemsAdicionar: 0, subitemsAtualizar: 0, subitemsAusentesMonday: 0, fimAtualizar: 0, statusAtualizar: 0, formulaStatusVazia: 0, obrasFinalizar: 0, erros: [] as string[] };
  const operations: any[] = []; const details: any[] = [];
  for (const item of mondayItems) { const current = firebase.get(item.id) ?? null; const result = project(current, item); if (!current) summary.itemsCriar++; else if (result.changed) summary.itemsAtualizar++; else summary.itemsSemAlteracao++;
    for (const detail of result.details) { if (detail.type === 'SUBITEM_ADD') summary.subitemsAdicionar++; if (detail.type === 'SUBITEM_UPDATE') summary.subitemsAtualizar++; if (detail.type === 'SUBITEM_AUSENTE_NO_MONDAY') summary.subitemsAusentesMonday++; }
    const changes = [...result.details];
    if (current?.raw?.status !== item.status) changes.push({ type: 'STATUS_FORMULA_ATUALIZAR', before: current?.raw?.status ?? null, after: item.status });
    if (item.status === null) changes.push({ type: 'STATUS_FORMULA_VAZIA' });
    if (current?.raw?.fim !== item.fim) summary.fimAtualizar++; if (current?.raw?.status !== item.status) summary.statusAtualizar++; if (item.status === null) summary.formulaStatusVazia++; if (result.isFinalized) summary.obrasFinalizar++;
    if (result.changed || result.isFinalized) operations.push({ id: item.id, create: !current, ...result }); if (result.changed || changes.length) details.push({ itemId: item.id, nome: item.nome, changes, before: current?.raw?.fim ?? null, after: item.fim });
  }
  for (const document of firestoreDocuments) if (!monday.has(document.id)) { summary.itemsAusentesMonday++; details.push({ itemId: document.id, type: 'ITEM_AUSENTE_NO_MONDAY' }); }
  if (operations.length > MAX_BATCH_WRITES) summary.erros.push(`BATCH_LIMIT_EXCEEDED:${operations.length}`);
  return { summary, operations, details };
}

export async function applyPlan(plan: ReturnType<typeof createPlan>, firestore: any = db) {
  if (plan.summary.erros.length) throw new Error(plan.summary.erros.join(','));
  if (!plan.operations.length) return 0;
  const batch = firestore.batch(); let writes = 0;
  for (const operation of plan.operations) {
    const ref = firestore.collection('monday-obras').doc(operation.id);
    batch.set(ref, { ...operation.patch, sincronizacao: { ...operation.patch.sincronizacao, capturadoEm: FieldValue.serverTimestamp() } }, { merge: true }); writes++;
    if (operation.isFinalized) { batch.update(firestore.collection('obras-v2').doc(operation.isFinalized), { status: 'FINALIZADA' }); writes++; }
  }
  await batch.commit();
  return writes;
}

async function execute(mode: 'dry-run' | 'apply', uid: string, token: string) {
  const started = Date.now(); const [mondayItems, snapshot] = await Promise.all([readMondayBoard(token), db.collection('monday-obras').get()]);
  const plan = createPlan(mondayItems, snapshot.docs.map((document) => ({ id: document.id, data: document.data() })));
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
