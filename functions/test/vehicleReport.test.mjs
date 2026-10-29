import test from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLE_ERP_QUERY_ALLOWLIST, erpResponseExcerpt } from '../lib/vehicleReport.js';

test('gateway ERP veicular permite exclusivamente Query 47', () => {
  assert.deepEqual(VEHICLE_ERP_QUERY_ALLOWLIST, [47]);
  assert.equal(VEHICLE_ERP_QUERY_ALLOWLIST.includes(46), false);
});

test('trecho da resposta do ERP no log e no erro fica limitado a 500 caracteres', () => {
  assert.equal(erpResponseExcerpt('  falha  '), 'falha');
  assert.equal(erpResponseExcerpt('x'.repeat(900)).length, 500);
});
