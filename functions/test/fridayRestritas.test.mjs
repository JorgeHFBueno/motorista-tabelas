import { test } from 'node:test';
import assert from 'node:assert/strict';

const r = await import('../lib/fridayRestritasRegras.js');

// 1 Valor do Contrato (restrita a ana), 2 Medições (restrita a ana e beto), 3 Saldo = {@1} - {@2}, 4 Dobro do saldo = {@3}*2, 5 Obs (livre).
const colunas = [
  { id: 1, tipo: 'numero', restrita: { ver: ['ana'] } },
  { id: 2, tipo: 'numero', restrita: { ver: ['ana', 'beto'] } },
  { id: 3, tipo: 'formula', config: { formula: '{@1} - {@2}' } },
  { id: 4, tipo: 'formula', config: { formula: '{@3#Labels} * 2' } },
  { id: 5, tipo: 'texto' },
];
const ids = (l) => l.map(c => c.id);

test('quem está na lista vê a coluna; adm2 vê todas; os demais não veem', () => {
  assert.deepEqual(ids(r.colunasQueVe(colunas, 'ana', false)), [1, 2, 3, 4, 5]);
  assert.deepEqual(ids(r.colunasQueVe(colunas, 'zeca', true)), [1, 2, 3, 4, 5]);
  assert.deepEqual(ids(r.colunasQueVe(colunas, 'zeca', false)), [5]);
});

test('fórmula que usa uma coluna restrita que a pessoa não vê some junto, mesmo por outra fórmula', () => {
  assert.deepEqual(ids(r.colunasQueVe(colunas, 'beto', false)), [2, 5]);
  assert.deepEqual(r.refsDaFormula('IF({@10}, {@11#Start} - {@12}, "")'), [10, 11, 12]);
});

test('valores restritos encaixados no item; sem valor, a coluna sai', () => {
  const restritos = new Map([[1, { 20: 1000 }], [2, {}]]);
  assert.deepEqual(r.comValoresRestritos({ 5: 'x', 2: 'velho' }, 20, restritos), { 5: 'x', 1: 1000 });
  assert.equal(r.ehRestrita(colunas[0]), true);
  assert.equal(r.ehRestrita(colunas[4]), false);
  assert.equal(r.podeVerColuna(colunas[0], 'beto', false), false);
});
