import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BOARD_ID = '8515762377';
const APPLY = process.argv.includes('--apply');
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const token = Buffer.concat(chunks).toString('utf8').trim();
if (!token) throw new Error('MONDAY_API_TOKEN_REQUIRED_ON_STDIN');

async function monday(query, variables) {
  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': '2026-07' },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) throw new Error(`MONDAY_API: ${payload.errors?.map((error) => error.message).join('; ') ?? response.status}`);
  return payload.data;
}

const schema = await monday('query ($boardId: ID!) { boards(ids: [$boardId]) { id columns { id title type } } }', { boardId: BOARD_ID });
const board = schema.boards?.[0];
const matches = (board?.columns ?? []).filter((column) => column.title?.trim().toLocaleLowerCase('pt-BR') === 'subcentro erp');
if (matches.length !== 1) throw new Error(matches.length ? 'SUBCENTRO_ERP_DUPLICATE_COLUMNS' : 'SUBCENTRO_ERP_COLUMN_NOT_FOUND');
const column = matches[0];

const selection = 'cursor items { id name column_values(ids: [$columnId]) { id type text } }';
let page = (await monday(`query ($boardId: ID!, $columnId: String!) { boards(ids: [$boardId]) { items_page(limit: 100) { ${selection} } } }`, { boardId: BOARD_ID, columnId: column.id })).boards?.[0]?.items_page;
if (!page) throw new Error('MONDAY_BOARD_UNAVAILABLE');
const mondayItems = [...(page.items ?? [])];
while (page.cursor) {
  page = (await monday(`query ($cursor: String!, $columnId: String!) { next_items_page(cursor: $cursor, limit: 100) { ${selection} } }`, { cursor: page.cursor, columnId: column.id })).next_items_page;
  if (!page) throw new Error('MONDAY_PAGINATION_INVALID');
  mondayItems.push(...(page.items ?? []));
}

if (!getApps().length) initializeApp({ projectId: 'app-motor-api', credential: applicationDefault() });
const firestore = getFirestore();
const snapshot = await firestore.collection('monday-obras').get();
const firestoreById = new Map(snapshot.docs.map((document) => [document.id, document.data()]));
const valueOf = (item) => {
  const value = item.column_values?.find((candidate) => candidate?.id === column.id)?.text;
  return typeof value === 'string' && value.trim() ? value : null;
};
const rows = mondayItems.map((item) => {
  const document = firestoreById.get(String(item.id));
  const exists = Boolean(document);
  const raw = document?.raw && typeof document.raw === 'object' ? document.raw : {};
  const hasField = Object.prototype.hasOwnProperty.call(raw, 'subcentroErp');
  const mondayValue = valueOf(item);
  const firestoreValue = hasField ? raw.subcentroErp : undefined;
  return { itemId: String(item.id), nome: item.name ?? null, monday: mondayValue, firestore: firestoreValue, projected: mondayValue, documentExists: exists, hasField, update: exists && firestoreValue !== mondayValue };
});
const mondayIds = new Set(rows.map((row) => row.itemId));
const firestoreOnly = snapshot.docs.filter((document) => !mondayIds.has(document.id)).map((document) => document.id);
const repeatedValues = [...new Map(rows.filter((row) => row.monday !== null).map((row) => [row.monday, rows.filter((other) => other.monday === row.monday).map((other) => other.itemId)]))].filter(([, ids]) => ids.length > 1).map(([value, ids]) => ({ value, itemIds: ids }));
const equivalentFields = snapshot.docs.flatMap((document) => ['subcentroERP', 'subcentro', 'subCentroErp'].filter((key) => Object.prototype.hasOwnProperty.call(document.data()?.raw ?? {}, key)).map((key) => ({ itemId: document.id, key, value: document.data().raw[key] })));
const { readMondayBoard, createPlan } = await import('../functions/lib/mondaySync.js');
const fullMondayItems = await readMondayBoard(token);
const firestoreDocuments = snapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
const obraV2Ids = [...new Set(firestoreDocuments.map((document) => document.data?.obraV2Id).filter((id) => typeof id === 'string' && id.trim()))];
const obraV2Documents = obraV2Ids.length ? await firestore.getAll(...obraV2Ids.map((id) => firestore.collection('obras-v2').doc(id))) : [];
const fullPlan = createPlan(fullMondayItems, firestoreDocuments, new Map(obraV2Documents.map((document) => [document.id, document.get('status')])));
const otherChanges = fullPlan.operations.filter((operation) => operation.changedReasons.some((reason) => reason !== 'SUBCENTRO_ERP_ATUALIZAR'));
const report = {
  mode: APPLY ? 'apply' : 'dry-run', boardId: BOARD_ID, column: { id: column.id, title: column.title, type: column.type, apiField: 'column_values.text' },
  audit: {
    mondayItems: rows.length, firestoreDocuments: snapshot.size, idsCorresponding: rows.filter((row) => row.documentExists).length,
    missingInFirestore: rows.filter((row) => !row.documentExists).map((row) => row.itemId), missingInMonday: firestoreOnly,
    filled: rows.filter((row) => row.monday !== null).length, null: rows.filter((row) => row.monday === null).length,
    fieldMissing: rows.filter((row) => row.documentExists && !row.hasField).length,
    equal: rows.filter((row) => row.documentExists && row.hasField && row.firestore === row.monday).length,
    divergent: rows.filter((row) => row.documentExists && row.hasField && row.firestore !== row.monday).length,
    updates: rows.filter((row) => row.update).length, repeatedValues, equivalentFields,
  },
  samples: rows.slice(0, 12), writes: { firestore: 0, obrasV2: 0, monday: 0 },
  generalDryRun: { totalMondayObrasOperations: fullPlan.operations.filter((operation) => operation.changed).length, subcentroErpOperations: fullPlan.operations.filter((operation) => operation.changedReasons.includes('SUBCENTRO_ERP_ATUALIZAR')).length, otherMondayObrasOperations: otherChanges.map((operation) => ({ itemId: operation.id, reasons: operation.changedReasons.filter((reason) => reason !== 'SUBCENTRO_ERP_ATUALIZAR') })), obrasV2Writes: fullPlan.summary.obrasFinalizar, firestoreWrites: 0, mondayWrites: 0 },
};

if (APPLY) {
  if (equivalentFields.length) throw new Error('SEMANTICALLY_EQUIVALENT_FIELD_EXISTS');
  const updates = rows.filter((row) => row.update);
  // Re-read the target documents immediately before writing. A changed field makes
  // the dry-run stale, so abort rather than overwriting a concurrent update.
  const before = new Map();
  for (const row of updates) {
    const document = await firestore.collection('monday-obras').doc(row.itemId).get();
    if (!document.exists) throw new Error(`MONDAY_OBRAS_DOCUMENT_MISSING:${row.itemId}`);
    const raw = document.data()?.raw ?? {};
    if (Object.prototype.hasOwnProperty.call(raw, 'subcentroErp') && raw.subcentroErp !== row.firestore) throw new Error(`STALE_SUBCENTRO_ERP_PLAN:${row.itemId}`);
    before.set(row.itemId, document.data());
  }
  for (let index = 0; index < updates.length; index += 450) {
    const batch = firestore.batch();
    for (const row of updates.slice(index, index + 450)) batch.update(firestore.collection('monday-obras').doc(row.itemId), 'raw.subcentroErp', row.projected);
    await batch.commit();
  }
  report.writes.firestore = updates.length;
  const reread = await firestore.getAll(...updates.map((row) => firestore.collection('monday-obras').doc(row.itemId)));
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const validation = reread.map((document) => {
    const row = updates.find((candidate) => candidate.itemId === document.id);
    const previous = before.get(document.id);
    const current = document.data();
    const beforeRaw = { ...(previous?.raw ?? {}) }; delete beforeRaw.subcentroErp;
    const afterRaw = { ...(current?.raw ?? {}) }; delete afterRaw.subcentroErp;
    return { itemId: document.id, exactValue: current?.raw?.subcentroErp === row.projected, correctType: current?.raw?.subcentroErp === null || typeof current?.raw?.subcentroErp === 'string', rawUnchangedExceptSubcentroErp: same(beforeRaw, afterRaw), obraV2IdPreserved: same(previous?.obraV2Id, current?.obraV2Id), sincronizacaoPreservada: same(previous?.sincronizacao, current?.sincronizacao), subitemsPreserved: same(previous?.raw?.subitems, current?.raw?.subitems) };
  });
  report.postWriteValidation = { reread: validation.length, valid: validation.filter((item) => Object.values(item).every((value) => value === true || typeof value === 'string')).length, failures: validation.filter((item) => !item.exactValue || !item.correctType || !item.rawUnchangedExceptSubcentroErp || !item.obraV2IdPreserved || !item.sincronizacaoPreservada || !item.subitemsPreserved) };
  report.secondDryRun = { pending: validation.filter((item) => !item.exactValue).length, writes: validation.filter((item) => !item.exactValue).length };
}
console.log(JSON.stringify(report, null, 2));
