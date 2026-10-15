import assert from 'node:assert/strict';
import test from 'node:test';
import { consolidateMeasurements, validRows } from '../lib/mondaySerpMeasurements.js';

const unexpected = (value) => assert.throws(
  () => validRows(value),
  (error) => error?.message === 'ERP_RESPONSE_CONTRACT_UNEXPECTED',
);

test('Query 55 null is a confirmed empty result', () => {
  assert.deepEqual(validRows(null), []);
  assert.deepEqual(consolidateMeasurements(validRows(null)), { qtd_notas: 0, valor_bruto_servico: 0 });
});

test('Query 55 empty array is a confirmed zero', () => {
  assert.deepEqual(consolidateMeasurements(validRows([])), { qtd_notas: 0, valor_bruto_servico: 0 });
});

test('Query 55 consolidates one or several valid rows', () => {
  assert.deepEqual(consolidateMeasurements(validRows([{ qtd_notas: 7, valor_bruto_servico: 1083888.83 }])), { qtd_notas: 7, valor_bruto_servico: 1083888.83 });
  assert.deepEqual(consolidateMeasurements(validRows([{ qtd_notas: 2, valor_bruto_servico: 10 }, { qtd_notas: 5, valor_bruto_servico: 20.5 }])), { qtd_notas: 7, valor_bruto_servico: 30.5 });
});

test('Query 55 rejects every non-array shape except null', () => {
  unexpected({});
  unexpected('texto');
  unexpected(123);
  unexpected({ data: [] });
  assert.throws(
    () => consolidateMeasurements(validRows([{ qtd_notas: 1 }])),
    (error) => error?.message === 'ERP_RESPONSE_CONTRACT_UNEXPECTED',
  );
});

test('Query 55 rejects invalid numeric fields', () => {
  for (const row of [
    { qtd_notas: '1', valor_bruto_servico: 10 },
    { qtd_notas: 1, valor_bruto_servico: '10' },
    { qtd_notas: Number.NaN, valor_bruto_servico: 10 },
    { qtd_notas: 1, valor_bruto_servico: Number.POSITIVE_INFINITY },
  ]) {
    assert.throws(() => consolidateMeasurements(validRows([row])), (error) => error?.message === 'ERP_RESPONSE_CONTRACT_UNEXPECTED');
  }
});
