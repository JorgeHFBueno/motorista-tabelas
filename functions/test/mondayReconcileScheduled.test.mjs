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
