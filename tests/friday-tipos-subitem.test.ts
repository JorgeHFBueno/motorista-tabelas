import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colunaNoTipo, colunaSoNoTipo, marcarColunaNoTipo, tipoDoItem, tiposDoSub } from '../src/features/friday-gestao-interna/quadro/tiposSubitem.ts';

// Tipo = coluna 10 do contrato; rótulos 1 = PONTE, 2 = PAVILHÃO. Colunas dos LOTEs: 20 Status (comum), 21 Longarinas (ponte), 22 Fundação (pavilhão).
const t = { coluna_id: 10, padrao: '1', colunas: { 21: ['1'], 22: ['2'] } };
const todos = ['1', '2'];

test('sem coluna do tipo, nada é escondido', () => {
  assert.equal(tiposDoSub({}), null);
  assert.equal(tiposDoSub({ tipos: null }), null);
  assert.equal(tiposDoSub({ tipos: { coluna_id: 0 } }), null);
  assert.equal(tipoDoItem(null, { valores: { 10: '2' } }), null);
  assert.equal(colunaNoTipo(null, 21, null), true);
});

test('o tipo vem da coluna do contrato; sem rótulo vale o padrão (PONTE)', () => {
  assert.equal(tipoDoItem(t, { valores: { 10: '2' } }), '2');
  assert.equal(tipoDoItem(t, { valores: { 10: 2 } }), '2');
  assert.equal(tipoDoItem(t, { valores: {} }), '1');
  assert.equal(tipoDoItem(t, { valores: { 10: '0' } }), '1');
  assert.equal(tipoDoItem({ ...t, padrao: null }, { valores: {} }), null);
});

test('cada tipo mostra as comuns e as suas', () => {
  const visiveis = (tipo: string | null) => [20, 21, 22].filter(id => colunaNoTipo(t, id, tipo));
  assert.deepEqual(visiveis('1'), [20, 21]);
  assert.deepEqual(visiveis('2'), [20, 22]);
  assert.deepEqual(visiveis(null), [20, 21, 22]);
  assert.deepEqual(visiveis('3'), [20]); // tipo novo: só as comuns
});

test('marcar em todos os tipos volta a ser comum; desmarcar uma comum restringe', () => {
  const a = marcarColunaNoTipo(t, 21, '2', true, todos);
  assert.equal(a.colunas?.['21'], undefined);
  const b = marcarColunaNoTipo(t, 20, '2', false, todos);
  assert.deepEqual(b.colunas?.['20'], ['1']);
  const c = marcarColunaNoTipo(t, 22, '2', false, todos);
  assert.deepEqual(c.colunas?.['22'], []);
  assert.equal(colunaNoTipo(c, 22, '2'), false);
  assert.deepEqual(colunaSoNoTipo(t, 23, '2').colunas?.['23'], ['2']);
});
