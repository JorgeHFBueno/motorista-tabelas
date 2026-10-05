import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPlan, createMondaySyncApp, createPlan, normalizeMondayItem } from '../lib/mondaySync.js';
import http from 'node:http';

const monday = (overrides = {}) => ({ id: 'parent-1', nome: 'Contrato', status: 'Em andamento', ordemInicio: null, confirmacaoRecurso: null, tipoObra: null, numeroContrato: '001', ano: 2026, empresa: 'LEDUR', inicio: '2026-01-01', fim: '2026-02-01', updatedAt: '2026-01-01T00:00:00Z', subitems: [], ...overrides });
const document = (overrides = {}) => ({ id: 'parent-1', data: { raw: { id: 'parent-1', nome: 'Contrato', status: 'Em andamento', ordemInicio: null, confirmacaoRecurso: null, tipoObra: null, numeroContrato: '001', ano: 2026, empresa: 'LEDUR', inicio: '2026-01-01', fim: '2026-02-01', subitems: [] }, sincronizacao: { itemId: 'parent-1', boardId: '8515762377', apiVersion: '2026-07', mondayUpdatedAt: '2026-01-01T00:00:00Z', capturadoEm: 'kept' }, obraV2Id: 'internal-v2', internal: { kept: true }, ...overrides } });
const mondayApiItem = (columns) => ({ id: 'parent-1', name: 'Contrato', updated_at: '2026-01-01T00:00:00Z', column_values: columns, subitems: [] });
const formula = (display_value, extras = {}) => ({ id: 'f_rmula_mknbt1hr', type: 'formula', text: '', value: null, display_value, ...extras });
const status1 = (text) => ({ id: 'color_mm7da26y', type: 'status', text });
const tipoObra = (text) => ({ id: 'dropdown_mkvc6z6r', type: 'dropdown', text });

test('parent status uses FormulaValue.display_value, even when formula text and value are empty', () => {
  const item = normalizeMondayItem(mondayApiItem([formula('Obra em Andamento')]));
  assert.equal(item.status, 'Obra em Andamento');
});

test('Status 1 never overrides or falls back for the parent status', () => {
  assert.equal(normalizeMondayItem(mondayApiItem([formula('Obra em Andamento'), status1('Não iniciada')])).status, 'Obra em Andamento');
  assert.equal(normalizeMondayItem(mondayApiItem([formula(''), status1('Obra Finalizada')])).status, null);
});

test('subitem status remains sourced from color_mknqcdnw text', () => {
  const item = normalizeMondayItem({ ...mondayApiItem([formula('Em andamento')]), subitems: [{ id: 'sub-1', name: 'Lote', column_values: [{ id: 'color_mknqcdnw', text: 'Revisar escopo' }] }] });
  assert.equal(item.subitems[0].status, 'Revisar escopo');
});

test('dropdown text is normalized into the two raw fields without persisting Monday JSON', () => {
  const item = normalizeMondayItem(mondayApiItem([{ id: 'dropdown_mknrvr7q', text: 'Ok', value: '{"ids":[1]}' }, { id: 'dropdown_mknqe4hf', text: '', value: '{"ids":[2]}' }, formula('Contrato em andamento')]));
  assert.equal(item.ordemInicio, 'Ok'); assert.equal(item.confirmacaoRecurso, null);
  const plan = createPlan([item], [document()]); assert.equal(plan.operations[0].patch.raw.ordemInicio, 'Ok'); assert.equal(plan.operations[0].patch.raw.confirmacaoRecurso, null);
  assert.doesNotMatch(JSON.stringify(plan.operations[0].patch.raw), /ids/);
});

test('Tipo de Obra preserves the dropdown text exactly, including Publica, Privada and other real values', () => {
  for (const value of ['Publica', 'Privada', 'Pública especial']) {
    const item = normalizeMondayItem(mondayApiItem([formula('Contrato em andamento'), tipoObra(value)]));
    assert.equal(item.tipoObra, value);
    const plan = createPlan([item], [document({ raw: { ...document().data.raw, tipoObra: null } })]);
    assert.equal(plan.operations[0].patch.raw.tipoObra, value);
    assert.ok(plan.operations[0].changedReasons.includes('TIPO_OBRA_ATUALIZAR'));
  }
});

test('empty Tipo de Obra becomes null, equal values avoid an update, and a missing field is projected', () => {
  const empty = normalizeMondayItem(mondayApiItem([formula('Contrato em andamento'), tipoObra('')]));
  assert.equal(empty.tipoObra, null);
  assert.equal(createPlan([empty], [document({ raw: { ...document().data.raw, tipoObra: 'Privada' } })]).operations[0].patch.raw.tipoObra, null);
  const privateItem = normalizeMondayItem(mondayApiItem([formula('Contrato em andamento'), tipoObra('Privada')]));
  const equal = createPlan([privateItem], [document({ raw: { ...document().data.raw, tipoObra: 'Privada' } })]);
  assert.equal(equal.summary.tipoObraAtualizar, 0);
  const missing = createPlan([privateItem], [document()]);
  assert.equal(missing.operations[0].patch.raw.tipoObra, 'Privada');
  assert.equal(missing.operations[0].patch.raw.status, 'Contrato em andamento');
});

test('parent formula status and subitem status stay independent in a dry-run with zero writes', () => {
  const item = normalizeMondayItem({ ...mondayApiItem([formula('Obra em Andamento')]), subitems: [{ id: 'sub-1', name: 'LOTE 1', column_values: [{ id: 'color_mknqcdnw', text: 'Revisar escopo' }] }] });
  const plan = createPlan([item], [document({ raw: { ...document().data.raw, subitems: [{ id: 'sub-1', nome: 'LOTE 1', status: 'Não iniciada' }] } })]);
  assert.equal(plan.operations[0].patch.raw.status, 'Obra em Andamento'); assert.equal(plan.operations[0].patch.raw.subitems[0].status, 'Revisar escopo');
  const fake = fakeFirestore(); assert.equal(fake.calls.set.length + fake.calls.update.length + fake.calls.commit, 0);
});

test('only a formula value of Obra Finalizada plans FINALIZADA in obras-v2 when it is not already finalizada', () => {
  const formulaFinalized = normalizeMondayItem(mondayApiItem([formula('Obra Finalizada')]));
  const status1Only = normalizeMondayItem(mondayApiItem([formula(''), status1('Obra Finalizada')]));
  assert.equal(createPlan([formulaFinalized], [document()], new Map([['internal-v2', 'CONTRATADA']])).summary.obrasFinalizar, 1);
  assert.equal(createPlan([formulaFinalized], [document()], new Map([['internal-v2', 'FINALIZADA']])).summary.obrasFinalizar, 0);
  assert.equal(createPlan([status1Only], [document()]).summary.obrasFinalizar, 0);
});

test('formula-empty dry-run is counted, changes raw.status to null, and makes zero writes', async () => {
  const emptyFormula = normalizeMondayItem(mondayApiItem([formula(''), status1('Não iniciada')])); const plan = createPlan([emptyFormula], [document()]); const fake = fakeFirestore();
  assert.equal(plan.summary.formulaStatusVazia, 1); assert.equal(plan.summary.statusAtualizar, 1); assert.equal(plan.operations[0].patch.raw.status, null);
  assert.ok(plan.details[0].changes.some((change) => change.type === 'STATUS_FORMULA_VAZIA'));
  assert.equal(fake.calls.set.length, 0); assert.equal(fake.calls.update.length, 0); assert.equal(fake.calls.commit, 0);
});

function fakeFirestore() {
  const calls = { set: [], update: [], commit: 0, delete: 0, transactions: 0 }; const documents = new Map();
  const batch = { set: (...args) => calls.set.push(args), update: (...args) => calls.update.push(args), delete: (...args) => calls.delete.push(args), commit: async () => { calls.commit++; } };
  const doc = (name, id) => ({ name, id, update: async (patch) => calls.update.push([{ name, id }, patch]) });
  return { calls, batch: () => batch, collection: (name) => ({ doc: (id) => doc(name, id) }), runTransaction: async (worker) => { calls.transactions++; return worker({ get: async (ref) => ({ exists: documents.has(`${ref.name}/${ref.id}`), data: () => documents.get(`${ref.name}/${ref.id}`) }), update: (ref, patch) => { calls.update.push([ref, patch]); documents.set(`${ref.name}/${ref.id}`, { ...(documents.get(`${ref.name}/${ref.id}`) ?? {}), ...patch }); }, set: (ref, patch) => { calls.set.push([ref, patch]); documents.set(`${ref.name}/${ref.id}`, patch); } }); } };
}

test('plan keeps an equal parent unchanged and dry-run has no Firestore operations', () => {
  const plan = createPlan([monday()], [document()]);
  assert.equal(plan.summary.itemsAtualizar, 0); assert.equal(plan.summary.itemsSemAlteracao, 1); assert.equal(plan.operations.length, 0);
});

test('new parent is planned without obraV2Id and is created atomically only on apply', async () => {
  const plan = createPlan([monday({ id: 'new-parent' })], []); const fake = fakeFirestore();
  assert.equal(plan.summary.itemsCriar, 1); assert.equal(plan.operations[0].patch.raw.id, 'new-parent'); assert.equal('obraV2Id' in plan.operations[0].patch, false);
  await applyPlan(plan, fake); assert.equal(fake.calls.set.length, 1); assert.equal(fake.calls.set[0][0].name, 'monday-obras'); assert.equal(fake.calls.update.length, 0); assert.equal(fake.calls.transactions, 1);
});

test('Firebase-only parent is reported and never deleted', () => {
  const plan = createPlan([], [document()]);
  assert.equal(plan.summary.itemsAusentesMonday, 1); assert.equal(plan.details[0].type, 'ITEM_AUSENTE_NO_MONDAY');
});

test('fim equal, changed and empty are projected exactly', () => {
  assert.equal(createPlan([monday()], [document()]).summary.fimAtualizar, 0);
  const changed = createPlan([monday({ fim: '2026-03-01' })], [document()]); assert.equal(changed.operations[0].patch.raw.fim, '2026-03-01');
  const empty = createPlan([monday({ fim: null })], [document()]); assert.equal(empty.operations[0].patch.raw.fim, null);
});

test('subitem update preserves local fields and local order, then appends new Monday subitems', () => {
  const current = document({ raw: { ...document().data.raw, subitems: [{ id: '1', nome: 'LOTE', status: 'Não iniciada', campoLocal: 'X' }, { id: 'old', nome: 'Mantido', local: true }] } });
  const plan = createPlan([monday({ subitems: [{ id: '1', nome: 'LOTE NOVO', status: 'Em andamento' }, { id: '2', nome: 'NOVO', status: 'Revisar escopo' }] })], [current]);
  const subitems = plan.operations[0].patch.raw.subitems;
  assert.deepEqual(subitems.map((item) => item.id), ['1', 'old', '2']);
  assert.deepEqual(subitems[0], { id: '1', nome: 'LOTE NOVO', status: 'Em andamento', campoLocal: 'X' });
  assert.deepEqual(subitems[2], { id: '2', nome: 'NOVO', status: 'Revisar escopo' });
  assert.equal(plan.summary.subitemsAdicionar, 1); assert.equal(plan.summary.subitemsAtualizar, 1); assert.equal(plan.summary.subitemsAusentesMonday, 1);
  assert.ok(plan.details[0].changes.some((change) => change.type === 'SUBITEM_AUSENTE_NO_MONDAY' && change.subitemId === 'old'));
});

test('obraV2Id and unknown document fields are never part of the Monday patch', () => {
  const plan = createPlan([monday({ nome: 'Alterado' })], [document()]);
  assert.equal('obraV2Id' in plan.operations[0].patch, false); assert.equal('internal' in plan.operations[0].patch, false);
});

test('finalization writes only when needed, ignores absent obraV2Id, and never reopens a work', async () => {
  const finalizedRaw = { ...document().data.raw, status: 'Obra Finalizada' };
  const finalize = createPlan([monday({ status: 'Obra Finalizada' })], [document({ raw: finalizedRaw })], new Map([['internal-v2', 'CONTRATADA']])); const fake = fakeFirestore(); await applyPlan(finalize, fake);
  assert.equal(fake.calls.update[0][0].name, 'obras-v2'); assert.equal(fake.calls.update[0][0].id, 'internal-v2'); assert.deepEqual(fake.calls.update[0][1], { status: 'FINALIZADA' });
  const alreadyFinalized = createPlan([monday({ status: 'Obra Finalizada' })], [document({ raw: finalizedRaw })], new Map([['internal-v2', 'FINALIZADA']])); const alreadyFinalizedFirestore = fakeFirestore(); await applyPlan(alreadyFinalized, alreadyFinalizedFirestore);
  assert.equal(alreadyFinalized.summary.obrasFinalizar, 0); assert.equal(alreadyFinalizedFirestore.calls.update.length, 0);
  const withoutObraV2Id = createPlan([monday({ status: 'Obra Finalizada' })], [document({ raw: finalizedRaw, obraV2Id: null })], new Map()); const withoutObraV2Firestore = fakeFirestore(); await applyPlan(withoutObraV2Id, withoutObraV2Firestore);
  assert.equal(withoutObraV2Firestore.calls.update.length, 0);
  const reopened = createPlan([monday({ status: 'Em andamento' })], [document({ raw: finalizedRaw })], new Map([['internal-v2', 'FINALIZADA']])); const second = fakeFirestore(); await applyPlan(reopened, second);
  assert.equal(second.calls.update.length, 0);
});

test('apply is one batch, does not commit an empty plan, and blocks preflight errors', async () => {
  const fake = fakeFirestore(); await applyPlan(createPlan([monday()], [document()]), fake); assert.equal(fake.calls.commit, 0);
  const tooMany = createPlan(Array.from({ length: 451 }, (_, index) => monday({ id: `n-${index}` })), []); await assert.rejects(() => applyPlan(tooMany, fake), /BATCH_LIMIT_EXCEEDED/); assert.equal(fake.calls.commit, 0);
});

test('the public sync surface keeps authorization, server secret, dry-run and token isolation contracts', async () => {
  const [{ readFile }, source] = await Promise.all([import('node:fs/promises'), import('node:fs/promises').then(({ readFile }) => readFile(new URL('../mondaySync.ts', import.meta.url), 'utf8'))]);
  const client = await readFile(new URL('../mondayClient.ts', import.meta.url), 'utf8');
  assert.match(source, /app\.use\(options\.authMiddleware \?\? adminAuthMiddleware\)/); assert.match(client, /defineSecret\('MONDAY_API_TOKEN'\)/); assert.match(source, /req\.body\?\.mode/); assert.match(source, /app\.post\(\['\/', '\/api\/monday-sync'\]/);
  assert.doesNotMatch(source, /req\.body\?\.token|MONDAY_API_TOKEN.*res\./); assert.match(source, /mode === 'apply' \? await applyPlan\(plan\) : 0/);
  assert.match(source, /f_rmula_mknbt1hr/); assert.match(source, /\.\.\. on FormulaValue \{ display_value \}/); assert.doesNotMatch(source, /status: columnText\(columns, 'color_mm7da26y'\)/);
});

function request(app, path, body, authorization) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app).listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const req = http.request({ port, path, method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) } }, (res) => {
        let data = ''; res.setEncoding('utf8'); res.on('data', (chunk) => { data += chunk; }); res.on('end', () => { server.close(); resolve({ status: res.statusCode, body: data }); });
      });
      req.on('error', (error) => { server.close(); reject(error); }); req.end(JSON.stringify(body));
    });
  });
}

const result = { mode: 'dry-run', itemsMonday: 0, itemsFirebase: 0, itemsCriar: 0, itemsAtualizar: 0, itemsSemAlteracao: 0, itemsAusentesMonday: 0, subitemsAdicionar: 0, subitemsAtualizar: 0, subitemsAusentesMonday: 0, fimAtualizar: 0, obrasFinalizar: 0, erros: [], details: [], firestoreWrites: 0, mondayWrites: 0 };
const authOk = (req, _res, next) => { req.user = { uid: 'test-adm2' }; next(); };
const authForbidden = (_req, res) => res.status(403).json({ error: 'forbidden' });
const testApp = createMondaySyncApp({ authMiddleware: authOk, token: () => 'test-token', executor: async () => result });
const forbiddenApp = createMondaySyncApp({ authMiddleware: authForbidden, token: () => 'test-token', executor: async () => result });

test('route regression keeps both direct and Hosting paths behind authentication', async () => {
  const unauthenticated = createMondaySyncApp({ token: () => 'test-token', executor: async () => result });
  assert.equal((await request(unauthenticated, '/', { mode: 'dry-run' })).status, 401);
  assert.equal((await request(unauthenticated, '/api/monday-sync', { mode: 'dry-run' })).status, 401);
  assert.equal((await request(testApp, '/', { mode: 'dry-run' }, 'Bearer mocked')).status, 200);
  assert.equal((await request(testApp, '/api/monday-sync', { mode: 'dry-run' }, 'Bearer mocked')).status, 200);
  assert.equal((await request(forbiddenApp, '/', { mode: 'dry-run' }, 'Bearer mocked')).status, 403);
  assert.equal((await request(forbiddenApp, '/api/monday-sync', { mode: 'dry-run' }, 'Bearer mocked')).status, 403);
});
