import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMondayManagedPatch } from '../lib/mondayProjector.js';

const parent = (status = 'Obra em Andamento') => ({ id: '12808776050', nome: 'DOIS IRMÃOS DAS MISSÕES 46/2026', status, ordemInicio: null, confirmacaoRecurso: null, numeroContrato: '46/2026', ano: 2026, empresa: 'LEDUR', inicio: null, fim: null, updatedAt: '2026-10-02T00:00:00Z', subitems: [{ id: '13044433147', nome: 'LOTE 4', status: 'Em andamento' }] });
const current = (status = 'Obra não iniciada') => ({ obraV2Id: 'local-v2', semObraV2: false, local: { retained: true }, raw: { id: '12808776050', nome: 'DOIS IRMÃOS DAS MISSÕES 46/2026', status, ordemInicio: null, confirmacaoRecurso: null, numeroContrato: '46/2026', ano: 2026, empresa: 'LEDUR', inicio: null, fim: null, subitems: [{ id: '13044433147', nome: 'LOTE 4', status: 'Em andamento' }] }, sincronizacao: { itemId: '12808776050', boardId: '8515762377', apiVersion: '2026-07', mondayUpdatedAt: '2026-10-02T00:00:00Z' } });

test('formula divergence projects only Monday-owned fields and is idempotent', () => {
  const first = buildMondayManagedPatch(current(), parent());
  assert.equal(first.changed, true); assert.ok(first.changedReasons.includes('STATUS_FORMULA_ATUALIZAR')); assert.deepEqual(first.changedFields, ['raw']);
  assert.equal('obraV2Id' in first.patch, false); assert.equal('local' in first.patch, false); assert.equal(first.patch.raw.status, 'Obra em Andamento');
  const second = buildMondayManagedPatch({ ...current('Obra em Andamento'), raw: first.patch.raw }, parent());
  assert.equal(second.changed, false); assert.deepEqual(second.changedFields, []);
});
