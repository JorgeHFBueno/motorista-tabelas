import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createAndLinkObraV2, createMondayLinkObraV2App, linkObraV2, LinkError } from '../lib/mondayLinkObraV2.js';

const listen = app => new Promise(resolve => { const server = http.createServer(app); server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })); });
const close = server => new Promise(resolve => server.close(resolve));

function fakeFirestore({ monday = {}, obras = {}, existing = [] } = {}) {
  const calls = { updates: [], creates: [], transactions: 0, collections: [] };
  const state = { monday: structuredClone(monday), obras: structuredClone(obras), existing: structuredClone(existing) };
  const ref = (collection, id) => ({ collection, id });
  const collection = (name) => ({
    name,
    doc: (id) => ref(name, id ?? `new-${calls.creates.length + 1}`),
    async get() {
      const bucket = name === 'monday-obras' ? 'monday' : 'obras';
      return {
        docs: Object.entries(state[bucket]).map(([id, data]) => ({
          id,
          data: () => data,
        })),
      };
    },
    where: (_field, _op, value) => ({ name, value, limit: () => ({ name, value, query: true }) }),
  });
  const firestore = {
    collection(name) { calls.collections.push(name); return collection(name); },
    async runTransaction(worker) {
      calls.transactions++;
      const transaction = {
        async get(target) {
          if (target.query) return { docs: state.existing.filter((doc) => doc.obraV2Id === target.value).map((doc) => ({ id: doc.id })) };
          const bucket = target.collection === 'monday-obras' ? 'monday' : 'obras';
          const data = state[bucket]?.[target.id];
          return { exists: Boolean(data), get: (field) => data?.[field], data: () => data };
        },
        update(target, patch) { calls.updates.push({ target, patch }); state.monday[target.id] = { ...state.monday[target.id], ...patch }; },
        create(target, data) { calls.creates.push({ target, data }); state.obras[target.id] = structuredClone(data); },
      };
      return worker(transaction);
    },
  };
  return { firestore, calls, state };
}

test('free link updates only monday-obras.obraV2Id', async () => {
  const fake = fakeFirestore({ monday: { 125: { nome: 'Contrato' } }, obras: { o1: { nomeObra: 'Obra' } } });
  assert.equal(await linkObraV2('125', 'o1', fake.firestore), 'UPDATED');
  assert.deepEqual(fake.calls.updates[0].patch, { obraV2Id: 'o1' });
  assert.equal(fake.calls.updates[0].target.collection, 'monday-obras');
});

test('CREATE_AND_LINK atomically creates the expected obra-v2 schema and links Monday', async () => {
  const fake = fakeFirestore({ monday: { 125: { raw: { nome: 'CARLOS GOMES 181/2026', numeroContrato: '181', inicio: '2026-08-10', subitems: [{ id: 'untouched' }] }, sincronizacao: { kept: true } } } });
  const result = await createAndLinkObraV2('125', fake.firestore);
  assert.equal(result.result, 'CREATED_AND_LINKED');
  assert.equal(fake.calls.transactions, 1);
  assert.deepEqual(fake.calls.creates[0].data, { codObra: 0, nomeObra: 'CARLOS GOMES 181/2026', siglaObra: 'CARLOS GOMES 181/2026', local: 'CORRIGIR', status: 'CONTRATADA', dataInicial: '2026-08-10T00:00:00', dataFinal: '2026-08-10T00:00:00' });
  assert.deepEqual(fake.calls.updates[0].patch, { obraV2Id: result.obraV2Id });
  assert.deepEqual(fake.state.monday[125].raw.subitems, [{ id: 'untouched' }]);
  assert.deepEqual(fake.state.monday[125].sincronizacao, { kept: true });
});

test('CREATE_AND_LINK uses null dates, blocks invalid or linked Monday, and never creates twice', async () => {
  const fake = fakeFirestore({ monday: { 125: { raw: { nome: 'Sem início', numeroContrato: '22', inicio: null } }, 126: { obraV2Id: 'old', raw: { nome: 'Já vinculada' } }, 127: { raw: {} } } });
  const created = await createAndLinkObraV2('125', fake.firestore);
  assert.equal(created.obra.dataInicial, null); assert.equal(created.obra.dataFinal, null);
  await assert.rejects(() => createAndLinkObraV2('125', fake.firestore), (error) => error instanceof LinkError && error.code === 'already_linked');
  await assert.rejects(() => createAndLinkObraV2('126', fake.firestore), (error) => error instanceof LinkError && error.code === 'already_linked');
  await assert.rejects(() => createAndLinkObraV2('127', fake.firestore), (error) => error instanceof LinkError && error.code === 'monday_missing_required_fields');
  await assert.rejects(() => createAndLinkObraV2('999', fake.firestore), (error) => error instanceof LinkError && error.code === 'monday_not_found');
  assert.equal(fake.calls.creates.length, 1);
});

test('same link is idempotent without a write', async () => {
  const fake = fakeFirestore({ monday: { 125: { obraV2Id: 'o1' } }, obras: { o1: {} } });
  assert.equal(await linkObraV2('125', 'o1', fake.firestore), 'NO_CHANGE');
  assert.equal(fake.calls.updates.length, 0);
});

for (const [name, setup, code] of [
  ['missing monday', { monday: {}, obras: { o1: {} } }, 'monday_not_found'],
  ['missing obra-v2', { monday: { 125: {} }, obras: {} }, 'obra_v2_not_found'],
  ['monday already linked elsewhere', { monday: { 125: { obraV2Id: 'old' } }, obras: { o1: {} } }, 'monday_already_linked'],
  ['obra-v2 already used by another monday', { monday: { 125: {} }, obras: { o1: {} }, existing: [{ id: '126', obraV2Id: 'o1' }] }, 'obra_v2_already_linked'],
]) test(`${name} is blocked`, async () => {
  const fake = fakeFirestore(setup);
  await assert.rejects(() => linkObraV2('125', 'o1', fake.firestore), (error) => error instanceof LinkError && error.code === code && error.httpStatus >= 400);
  assert.equal(fake.calls.updates.length, 0);
});

test('GET returns 401 unauthenticated and 403 without adm2', async () => {
  const fake = fakeFirestore({ monday: { 125: {} }, obras: { o1: {} } });
  const authMiddleware = (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ error: 'missing_authorization' });
    return res.status(403).json({ error: 'forbidden' });
  };
  const { server, url } = await listen(createMondayLinkObraV2App({ firestore: fake.firestore, authMiddleware }));
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: 'Bearer authenticated-without-adm2' } })).status, 403);
    assert.equal(fake.calls.updates.length, 0);
  } finally { await close(server); }
});

test('GET with adm2 returns normalized monday and obrasV2 arrays without writes', async () => {
  const fake = fakeFirestore({
    monday: { 125: { raw: { nome: 'Contrato', status: 'Ativo' }, obraV2Id: 'o1' } },
    obras: { o1: { nomeObra: 'Obra V2', siglaObra: 'OV2' } },
  });
  const authMiddleware = (req, _res, next) => { req.user = { uid: 'adm2' }; next(); };
  const { server, url } = await listen(createMondayLinkObraV2App({ firestore: fake.firestore, authMiddleware }));
  try {
    const response = await fetch(`${url}/api/monday-link-obra-v2`, { headers: { Authorization: 'Bearer adm2' } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      monday: [{ documentId: '125', nome: 'Contrato', numeroContrato: null, empresa: null, status: 'Ativo', tipoObra: null, obraV2Id: 'o1', raw: { nome: 'Contrato', status: 'Ativo' } }],
      obrasV2: [{ documentId: 'o1', codObra: null, siglaObra: 'OV2', nomeObra: 'Obra V2', local: null, status: null, data: { nomeObra: 'Obra V2', siglaObra: 'OV2' } }],
    });
    assert.equal(fake.calls.updates.length, 0);
  } finally { await close(server); }
});

test('POST returns 401 unauthenticated and 403 without adm2', async () => {
  const fake = fakeFirestore({ monday: { 125: {} }, obras: { o1: {} } });
  const authMiddleware = (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ error: 'missing_authorization' });
    return res.status(403).json({ error: 'forbidden' });
  };
  const { server, url } = await listen(createMondayLinkObraV2App({ firestore: fake.firestore, authMiddleware }));
  try {
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mondayItemId: '125', obraV2Id: 'o1' }) })).status, 401);
    assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer authenticated-without-adm2', 'Content-Type': 'application/json' }, body: JSON.stringify({ mondayItemId: '125', obraV2Id: 'o1' }) })).status, 403);
    assert.equal(fake.calls.updates.length, 0);
  } finally { await close(server); }
});
