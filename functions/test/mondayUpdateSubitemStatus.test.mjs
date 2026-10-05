import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { MONDAY_SUBITEM_STATUS, SUBITEM_BOARD_ID, STATUS_COLUMN_ID, createMondayUpdateSubitemStatusApp, parseUpdateRequest, synchronizeSubitemSnapshot, updateSubitemStatus } from '../lib/mondayUpdateSubitemStatus.js';

const silent = async (fn) => { const original = console.info; console.info = () => {}; try { return await fn(); } finally { console.info = original; } };
const item = (labelId = 4, label = 'Revisar escopo', boardId = SUBITEM_BOARD_ID) => ({ id: '13149530541', name: 'LOTE', board: { id: boardId }, parent_item: { id: '12808776050', board: { id: '8515762377' } }, column_values: [{ id: STATUS_COLUMN_ID, type: 'status', text: label, value: JSON.stringify({ index: labelId }), index: labelId, label }] });
const schema = () => ({ id: SUBITEM_BOARD_ID, columns: [{ id: STATUS_COLUMN_ID, type: 'status', settings: { labels: [
  { id: 0, index: 1, label: 'Em andamento' }, { id: 1, index: 0, label: 'Finalizado' }, { id: 2, index: 2, label: 'Parada' },
  { id: 3, index: 4, label: 'Próxima a Iniciar' }, { id: 4, index: 5, label: 'Revisar escopo' }, { id: 5, index: 3, label: 'Não iniciada' },
] } }] });
const queryResponse = (current) => async (_token, query) => {
  assert.doesNotMatch(query, /create_labels_if_missing/);
  if (query.startsWith('mutation')) throw new Error('MUTATION_UNEXPECTED');
  return { items: [current] };
};

test('recognizes every stable StatusValue.index, including index zero', async () => {
  for (const [labelId, code, label] of [[0, 'EM_ANDAMENTO', 'Em andamento'], [1, 'FINALIZADO', 'Finalizado'], [2, 'PARADA', 'Parada'], [3, 'PROXIMA_A_INICIAR', 'Próxima a Iniciar'], [4, 'REVISAR_ESCOPO', 'Revisar escopo'], [5, 'NAO_INICIADA', 'Não iniciada']]) {
    const result = await silent(() => updateSubitemStatus('secret', { subitemId: '13149530541', novoStatus: code, dryRun: false }, queryResponse(item(labelId, label))));
    assert.equal(result.result, 'NO_CHANGE', code);
    assert.equal(result.statusAtual.labelId, labelId, code);
  }
});

test('uses value.index only as a fallback when the typed index is absent', async () => {
  const current = item(5, 'Não iniciada'); current.column_values[0].index = null;
  const result = await silent(() => updateSubitemStatus('secret', { subitemId: '13149530541', novoStatus: 'NAO_INICIADA', dryRun: false }, queryResponse(current)));
  assert.equal(result.result, 'NO_CHANGE'); assert.equal(result.statusAtual.labelId, 5);
});

test('uses the current board schema as a guarded fallback for the real 2026-07 null value/index response', async () => {
  const current = item(5, 'Não iniciada'); current.column_values[0].value = null; current.column_values[0].index = null;
  let mutations = 0;
  const query = async (_token, queryText) => {
    if (queryText.startsWith('mutation')) { mutations++; throw new Error('MUTATION_UNEXPECTED'); }
    return { items: [current], boards: [schema()] };
  };
  const result = await silent(() => updateSubitemStatus('secret', { subitemId: '13149530541', novoStatus: 'NAO_INICIADA', dryRun: false }, query));
  assert.equal(result.result, 'NO_CHANGE'); assert.equal(result.statusAtual.labelId, 5); assert.equal(mutations, 0);
});

test('does not mistake the schema visual index for the stable label id', async () => {
  const current = item(5, 'Não iniciada'); current.column_values[0].value = null; current.column_values[0].index = null;
  const query = async (_token, queryText) => queryText.startsWith('mutation') ? (() => { throw new Error('MUTATION_UNEXPECTED'); })() : ({ items: [current], boards: [schema()] });
  const result = await silent(() => updateSubitemStatus('secret', { subitemId: '13149530541', novoStatus: 'NAO_INICIADA', dryRun: false }, query));
  assert.equal(result.statusAtual.labelId, 5);
});

test('null index and label remains blocked before any mutation', async () => {
  const current = item(5, 'Não iniciada'); current.column_values[0].value = null; current.column_values[0].index = null; current.column_values[0].label = null; current.column_values[0].text = null;
  let mutations = 0;
  const query = async (_token, queryText) => { if (queryText.startsWith('mutation')) mutations++; return { items: [current], boards: [schema()] }; };
  await assert.rejects(() => silent(() => updateSubitemStatus('secret', { subitemId: '13149530541', novoStatus: 'PARADA', dryRun: false }, query)), /UNKNOWN_CURRENT_STATUS/);
  assert.equal(mutations, 0);
});

test('strict request validation defaults dryRun and rejects arbitrary Monday fields', () => {
  assert.deepEqual(parseUpdateRequest({ subitemId: '13149530541', novoStatus: 'REVISAR_ESCOPO' }), { subitemId: '13149530541', novoStatus: 'REVISAR_ESCOPO', dryRun: true });
  for (const body of [{}, { subitemId: 'x', novoStatus: 'REVISAR_ESCOPO' }, { subitemId: '1' }, { subitemId: '1', novoStatus: 'OTHER' }, { subitemId: '1', novoStatus: 'PARADA', dryRun: 'false' }, { subitemId: '1', novoStatus: 'PARADA', boardId: 'x' }, { subitemId: '1', novoStatus: 'PARADA', columnId: 'x' }, { subitemId: '1', novoStatus: 'PARADA', labelId: 2 }, { subitemId: '1', novoStatus: 'PARADA', query: 'mutation' }, { subitemId: '1', novoStatus: 'PARADA', token: 'x' }, { subitemId: '1', novoStatus: 'PARADA', parentItemId: 'x' }]) assert.throws(() => parseUpdateRequest(body), /INVALID_REQUEST/);
});

test('same status returns NO_CHANGE without a mutation regardless of dryRun', async () => {
  const request = { subitemId: '13149530541', novoStatus: 'REVISAR_ESCOPO', dryRun: false };
  const result = await silent(() => updateSubitemStatus('secret', request, queryResponse(item())));
  assert.equal(result.result, 'NO_CHANGE'); assert.equal(result.statusAtual.labelId, 4);
});

test('different status dry-run returns DRY_RUN with zero mutations', async () => {
  const result = await silent(() => updateSubitemStatus('secret', { subitemId: '13149530541', novoStatus: 'PARADA', dryRun: true }, queryResponse(item())));
  assert.equal(result.result, 'DRY_RUN'); assert.equal(result.statusProposto.labelId, 2);
});

test('valid apply uses exactly one fixed mutation with only the StatusLabel.id', async () => {
  const calls = []; let reads = 0;
  const query = async (_token, queryText, variables) => {
    calls.push({ queryText, variables });
    if (queryText.startsWith('mutation')) return { change_multiple_column_values: { id: '13149530541' } };
    reads++; return { items: [item(reads === 1 ? 4 : 2, reads === 1 ? 'Revisar escopo' : 'Parada')] };
  };
  const result = await silent(() => updateSubitemStatus('secret', { subitemId: '13149530541', novoStatus: 'PARADA', dryRun: false }, query));
  assert.equal(result.result, 'UPDATED'); assert.equal(calls.filter((call) => call.queryText.startsWith('mutation')).length, 1);
  const mutation = calls.find((call) => call.queryText.startsWith('mutation'));
  assert.equal(mutation.variables.boardId, SUBITEM_BOARD_ID); assert.equal(mutation.variables.itemId, '13149530541');
  assert.deepEqual(JSON.parse(mutation.variables.columnValues), { [STATUS_COLUMN_ID]: { index: MONDAY_SUBITEM_STATUS.PARADA.labelId } });
  assert.doesNotMatch(mutation.queryText, /create_labels_if_missing/);
});

test('post-write mismatch fails without retrying the mutation', async () => {
  let mutations = 0;
  const query = async (_token, queryText) => { if (queryText.startsWith('mutation')) { mutations++; return { change_multiple_column_values: { id: '13149530541' } }; } return { items: [item()] }; };
  await assert.rejects(() => silent(() => updateSubitemStatus('secret', { subitemId: '13149530541', novoStatus: 'PARADA', dryRun: false }, query)), /POST_WRITE_VERIFICATION_FAILED/);
  assert.equal(mutations, 1);
});

for (const [name, current] of [['missing item', null], ['other board', item(4, 'Revisar escopo', 'other')], ['missing column', { ...item(), column_values: [] }], ['unknown current status', item(99, 'Unknown')]]) {
  test(`${name} is rejected before mutation`, async () => {
    let mutations = 0;
    const query = async (_token, queryText) => { if (queryText.startsWith('mutation')) mutations++; return { items: current ? [current] : [] }; };
    await assert.rejects(() => silent(() => updateSubitemStatus('secret', { subitemId: '13149530541', novoStatus: 'PARADA', dryRun: false }, query)));
    assert.equal(mutations, 0);
  });
}

test('HTTP surface requires authentication, keeps auth denials, and never returns the secret', async () => {
  const runner = async () => ({ result: 'NO_CHANGE', subitemId: '13149530541' });
  const noAuth = createMondayUpdateSubitemStatusApp({ token: () => 'hidden-token', updater: runner });
  assert.equal((await request(noAuth, { subitemId: '1', novoStatus: 'PARADA' })).status, 401);
  for (const denial of ['missing employee', 'inactive', 'not adm2']) {
    const app = createMondayUpdateSubitemStatusApp({ authMiddleware: (_req, res) => res.status(403).json({ error: 'forbidden' }), token: () => 'hidden-token', updater: runner });
    assert.equal((await request(app, { subitemId: '1', novoStatus: 'PARADA' }, 'Bearer test')).status, 403, denial);
  }
  const authorized = createMondayUpdateSubitemStatusApp({ authMiddleware: (req, _res, next) => { req.user = { uid: 'adm2' }; next(); }, token: () => 'hidden-token', updater: runner });
  const response = await request(authorized, { subitemId: '1', novoStatus: 'PARADA' }, 'Bearer test');
  assert.equal(response.status, 200); assert.doesNotMatch(response.body, /hidden-token/);
});

test('implementation has only the scoped snapshot transaction and fixed mutation surface', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../mondayUpdateSubitemStatus.ts', import.meta.url), 'utf8'));
  assert.match(source, /runTransaction/); assert.match(source, /raw\.subitems/); assert.doesNotMatch(source, /obras-v2|mondaySync|create_labels_if_missing/);
  assert.match(source, /change_multiple_column_values/); assert.match(source, /STATUS_COLUMN_ID/); assert.match(source, /SUBITEM_BOARD_ID/);
});

const snapshotFirestore = (data, options = {}) => {
  const calls = { transactions: 0, updates: [], collections: [] };
  const firestore = {
    collection(name) { calls.collections.push(name); return { doc: (id) => ({ name, id }) }; },
    async runTransaction(worker) {
      calls.transactions++;
      if (options.fail) throw new Error('FIRESTORE_DOWN');
      return worker({
        get: async () => ({ exists: data !== null, get: (key) => data?.[key] }),
        update: (_ref, patch) => { calls.updates.push(patch); data.raw.subitems = patch['raw.subitems']; },
      });
    },
  };
  return { firestore, calls, data: () => data };
};
const legacyProjector = async (parentItemId, _token, { firestore }) => { const current = firestore.data?.()?.raw?.subitems?.[0]?.status; const confirmed = current === 'Não iniciada' ? { code: 'EM_ANDAMENTO', label: 'Em andamento', labelId: 0 } : { code: 'PARADA', label: 'Parada', labelId: 2 }; return { result: await synchronizeSubitemSnapshot(firestore, parentItemId, '13149530541', confirmed) === 'UPDATED' ? 'UPDATED' : 'NO_CHANGE', parentItemId, changedReasons: [], changedFields: [] }; };

test('snapshot transaction changes only the confirmed status, retaining raw and sibling subitems', async () => {
  const state = snapshotFirestore({ raw: { untouched: { nested: true }, subitems: [{ id: '13149530541', nome: 'A', status: 'Não iniciada', local: 7 }, { id: 'other', nome: 'B', status: 'Parada', local: 8 }] }, topLevel: 'kept' });
  const result = await synchronizeSubitemSnapshot(state.firestore, '12808776050', '13149530541', { code: 'EM_ANDAMENTO', label: 'Em andamento', labelId: 0 });
  assert.equal(result, 'UPDATED'); assert.equal(state.calls.transactions, 1); assert.deepEqual(state.calls.collections, ['monday-obras']);
  assert.deepEqual(state.calls.updates[0]['raw.subitems'], [{ id: '13149530541', nome: 'A', status: 'Em andamento', local: 7 }, { id: 'other', nome: 'B', status: 'Parada', local: 8 }]);
  assert.deepEqual(state.data().raw.untouched, { nested: true }); assert.equal(state.data().topLevel, 'kept');
});

test('snapshot transaction is idempotent and rejects missing, duplicate, or unavailable snapshots', async () => {
  const current = snapshotFirestore({ raw: { subitems: [{ id: '13149530541', status: 'Em andamento' }] } });
  assert.equal(await synchronizeSubitemSnapshot(current.firestore, '12808776050', '13149530541', { code: 'EM_ANDAMENTO', label: 'Em andamento', labelId: 0 }), 'ALREADY_CURRENT'); assert.equal(current.calls.updates.length, 0);
  for (const raw of [null, { subitems: [] }, { subitems: [{ id: '13149530541' }, { id: '13149530541' }] }]) await assert.rejects(() => synchronizeSubitemSnapshot(snapshotFirestore(raw && { raw }).firestore, '12808776050', '13149530541', { code: 'EM_ANDAMENTO', label: 'Em andamento', labelId: 0 }), /SNAPSHOT_UPDATE_FAILED/);
});

test('NO_CHANGE repairs an old snapshot without a Monday mutation, while dry-run writes neither system', async () => {
  const snapshot = snapshotFirestore({ raw: { subitems: [{ id: '13149530541', status: 'Não iniciada' }] } }); let mutations = 0;
  const noChange = await silent(() => updateSubitemStatus('secret', { subitemId: '13149530541', novoStatus: 'EM_ANDAMENTO', dryRun: false }, async (_token, query) => { if (query.startsWith('mutation')) mutations++; return { items: [item(0, 'Em andamento')] }; }, snapshot.firestore, legacyProjector));
  assert.equal(noChange.result, 'NO_CHANGE'); assert.equal(noChange.snapshotUpdated, true); assert.equal(mutations, 0); assert.equal(snapshot.calls.updates.length, 1);
  const dry = snapshotFirestore({ raw: { subitems: [{ id: '13149530541', status: 'Revisar escopo' }] } });
  await silent(() => updateSubitemStatus('secret', { subitemId: '13149530541', novoStatus: 'PARADA', dryRun: true }, queryResponse(item()), dry.firestore)); assert.equal(dry.calls.transactions, 0);
});

test('UPDATED persists the post-mutation confirmed value and a snapshot failure never retries or rolls back Monday', async () => {
  const snapshot = snapshotFirestore({ raw: { subitems: [{ id: '13149530541', status: 'Revisar escopo' }] } }); let reads = 0; let mutations = 0;
  const query = async (_token, queryText) => { if (queryText.startsWith('mutation')) { mutations++; return {}; } reads++; return { items: [item(reads === 1 ? 4 : 2, reads === 1 ? 'Revisar escopo' : 'Parada')] }; };
  const result = await silent(() => updateSubitemStatus('secret', { subitemId: '13149530541', novoStatus: 'PARADA', dryRun: false }, query, snapshot.firestore, legacyProjector));
  assert.equal(result.result, 'UPDATED'); assert.equal(snapshot.data().raw.subitems[0].status, 'Parada'); assert.equal(mutations, 1);
  reads = 0; mutations = 0;
  await assert.rejects(() => silent(() => updateSubitemStatus('secret', { subitemId: '13149530541', novoStatus: 'PARADA', dryRun: false }, query, snapshotFirestore({ raw: { subitems: [] } }, { fail: true }).firestore, legacyProjector)), /SNAPSHOT_UPDATE_FAILED/);
  assert.equal(mutations, 1);
});

test('concurrent LOTE snapshot transactions retain both updates from the latest transaction state', async () => {
  const state = { raw: { subitems: [{ id: 'a', status: 'Não iniciada' }, { id: 'b', status: 'Não iniciada' }] } }; let pending = Promise.resolve();
  const firestore = { collection: () => ({ doc: () => ({}) }), runTransaction(worker) {
    const run = pending.then(() => worker({ get: async () => ({ exists: true, get: (key) => state[key] }), update: (_ref, patch) => { state.raw.subitems = patch['raw.subitems']; } })); pending = run.catch(() => {}); return run;
  } };
  await Promise.all([
    synchronizeSubitemSnapshot(firestore, '12808776050', 'a', { code: 'EM_ANDAMENTO', label: 'Em andamento', labelId: 0 }),
    synchronizeSubitemSnapshot(firestore, '12808776050', 'b', { code: 'PARADA', label: 'Parada', labelId: 2 }),
  ]);
  assert.deepEqual(state.raw.subitems, [{ id: 'a', status: 'Em andamento' }, { id: 'b', status: 'Parada' }]);
});

function request(app, body, authorization) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app).listen(0, '127.0.0.1', () => {
      const { port } = server.address(); const req = http.request({ port, path: '/', method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) } }, (res) => { let data = ''; res.on('data', (chunk) => { data += chunk; }); res.on('end', () => { server.close(); resolve({ status: res.statusCode, body: data }); }); });
      req.on('error', (error) => { server.close(); reject(error); }); req.end(JSON.stringify(body));
    });
  });
}
