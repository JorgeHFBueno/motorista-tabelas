import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileMondayBoard } from '../lib/mondayReconcileScheduled.js';

const fakeFirestore = { collection: () => ({ doc: () => ({}) }), runTransaction: async (worker) => worker({ get: async () => ({ exists: false, data: () => null }), set: () => {} }) };
test('scheduler reads board once, projects all parents, and summarizes writes', async () => {
  let reads = 0;
  const result = await reconcileMondayBoard({ token: 'memory-only', firestore: fakeFirestore, readBoard: async () => { reads++; return [
    { id: '1', nome: 'A', status: null, ordemInicio: null, confirmacaoRecurso: null, numeroContrato: null, ano: null, empresa: null, inicio: null, fim: null, updatedAt: null, subitems: [] },
    { id: '2', nome: 'B', status: null, ordemInicio: null, confirmacaoRecurso: null, numeroContrato: null, ano: null, empresa: null, inicio: null, fim: null, updatedAt: null, subitems: [] },
  ]; } });
  assert.equal(reads, 1); assert.equal(result.parents, 2); assert.equal(result.UPDATED, 2); assert.equal(result.NO_CHANGE, 0); assert.equal(result.ERROR, 0);
});

test('scheduler isolates one parent error and continues reconciling the rest', async () => {
  const firestore = { collection: () => ({ doc: (id) => ({ id }) }), runTransaction: async (worker) => worker({ get: async (ref) => { if (ref.id === '2') throw new Error('temporary'); return { exists: false, data: () => null }; }, set: () => {} }) };
  const result = await reconcileMondayBoard({ token: 'memory-only', firestore, readBoard: async () => [
    { id: '1', nome: 'A', status: null, ordemInicio: null, confirmacaoRecurso: null, numeroContrato: null, ano: null, empresa: null, inicio: null, fim: null, updatedAt: null, subitems: [] },
    { id: '2', nome: 'B', status: null, ordemInicio: null, confirmacaoRecurso: null, numeroContrato: null, ano: null, empresa: null, inicio: null, fim: null, updatedAt: null, subitems: [] },
    { id: '3', nome: 'C', status: null, ordemInicio: null, confirmacaoRecurso: null, numeroContrato: null, ano: null, empresa: null, inicio: null, fim: null, updatedAt: null, subitems: [] },
  ] });
  assert.deepEqual(result, { parents: 3, UPDATED: 2, NO_CHANGE: 0, ERROR: 1 });
});

test('scheduler mirrors LOTEs created, renamed and deleted in Monday and does not rewrite an unchanged parent', async () => {
  const docs = new Map([['1', { obraV2Id: 'local-v2', raw: { id: '1', nome: 'A', subitems: [{ id: '10', nome: 'LOTE 1', status: 'Em andamento', ordem: 2 }, { id: '11', nome: 'LOTE 2', status: null }] }, sincronizacao: { itemId: '1', boardId: '8515762377' } }]]);
  const writes = [];
  const firestore = { collection: () => ({ doc: (id) => ({ id }) }), runTransaction: async (worker) => worker({ get: async (ref) => ({ exists: docs.has(ref.id), data: () => docs.get(ref.id) }), update: (ref, patch) => { writes.push(ref.id); docs.set(ref.id, { ...docs.get(ref.id), ...patch }); }, set: () => { throw new Error('must update the existing parent'); } }) };
  const readBoard = async () => [{ id: '1', nome: 'A', status: null, ordemInicio: null, confirmacaoRecurso: null, tipoObra: null, subcentroErp: null, numeroContrato: null, ano: null, empresa: null, inicio: null, fim: null, updatedAt: '2026-10-19T00:00:00Z', subitems: [{ id: '10', nome: 'LOTE 1 renomeado', status: 'Em andamento' }, { id: '12', nome: 'LOTE 3', status: null }] }];
  assert.deepEqual(await reconcileMondayBoard({ token: 'memory-only', firestore, readBoard }), { parents: 1, UPDATED: 1, NO_CHANGE: 0, ERROR: 0 });
  assert.deepEqual(docs.get('1').raw.subitems, [{ id: '10', nome: 'LOTE 1 renomeado', status: 'Em andamento', ordem: 2 }, { id: '12', nome: 'LOTE 3', status: null }]);
  assert.equal(docs.get('1').obraV2Id, 'local-v2');
  assert.deepEqual(await reconcileMondayBoard({ token: 'memory-only', firestore, readBoard }), { parents: 1, UPDATED: 0, NO_CHANGE: 1, ERROR: 0 });
  assert.deepEqual(writes, ['1']);
});
