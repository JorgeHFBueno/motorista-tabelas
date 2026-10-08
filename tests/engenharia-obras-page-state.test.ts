import test from 'node:test';
import assert from 'node:assert/strict';
import { engenhariaObrasRenderState, normalizeEngenhariaObrasCollections } from '../src/pages/engenhariaObrasPageState';

test('engenharia obras first render is safe while response collections are undefined', () => {
  assert.deepEqual(normalizeEngenhariaObrasCollections(undefined), { monday: [], obrasV2: [] });
  assert.equal(engenhariaObrasRenderState({ authLoading: false, loading: true, authorized: true, error: null }), 'loading');
});

test('engenharia obras displays controlled loading and error states', () => {
  assert.equal(engenhariaObrasRenderState({ authLoading: true, loading: false, authorized: false, error: null }), 'loading');
  assert.equal(engenhariaObrasRenderState({ authLoading: false, loading: false, authorized: true, error: 'list_failed' }), 'error');
});

test('engenharia obras preserves loaded arrays and represents an empty response safely', () => {
  const monday = [{ documentId: '100', nome: 'Obra Monday' }];
  const obrasV2 = [{ documentId: 'obra-1', nomeObra: 'Obra V2' }];
  assert.deepEqual(normalizeEngenhariaObrasCollections({ monday, obrasV2 }), { monday, obrasV2 });
  assert.deepEqual(normalizeEngenhariaObrasCollections({ monday: [], obrasV2: [] }), { monday: [], obrasV2: [] });
  assert.equal(engenhariaObrasRenderState({ authLoading: false, loading: false, authorized: true, error: null }), 'ready');
});
