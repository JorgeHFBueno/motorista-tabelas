import test from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLE_ERP_QUERY_ALLOWLIST, erpResponseExcerpt, normalizePlate, rows } from '../lib/vehicleReport.js';

test('gateway ERP veicular permite exclusivamente Query 47', () => {
  assert.deepEqual(VEHICLE_ERP_QUERY_ALLOWLIST, [47]);
  assert.equal(VEHICLE_ERP_QUERY_ALLOWLIST.includes(46), false);
});

test('trecho da resposta do ERP no log e no erro fica limitado a 500 caracteres', () => {
  assert.equal(erpResponseExcerpt('  falha  '), 'falha');
  assert.equal(erpResponseExcerpt('x'.repeat(900)).length, 500);
});

test('resposta null do ERP é lista vazia; outro formato continua recusado', () => {
  assert.deepEqual(rows(null, 'null'), []);
  assert.deepEqual(rows([{ a: 1 }], ''), [{ a: 1 }]);
  assert.deepEqual(rows({ data: [] }, ''), []);
  assert.throws(() => rows({ x: 1 }, '{"x":1}'), /ERP_RESPONSE_CONTRACT_UNEXPECTED/);
});

test('placa: sem hífen, e identificador com sufixo vira só a placa', () => {
  assert.equal(normalizePlate('APG-6A02'), 'APG6A02');
  assert.equal(normalizePlate('ILW-2A23 - MICRO'), 'ILW2A23');
  assert.equal(normalizePlate('IUZ-8C09 - CAVALO SCANIA'), 'IUZ8C09');
  assert.equal(normalizePlate('TQW3A52'), 'TQW3A52');
  assert.equal(normalizePlate('GERADOR 991'), 'GERADOR991');
});
