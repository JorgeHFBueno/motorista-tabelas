import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFuncionario, classifyConciliation, computeFuncionarioAtivo, normalizeName } from '../lib/conciliation.js';

test('conciliation statuses cover legacy-source combinations', () => {
  assert.equal(classifyConciliation({ auth: true, authorized: true, motorist: true, motoristCandidates: 1, employee: false }), 'PRONTO');
  assert.equal(classifyConciliation({ auth: true, authorized: true, motorist: false, motoristCandidates: 0, employee: false }), 'PRONTO');
  assert.equal(classifyConciliation({ auth: true, authorized: false, motorist: true, motoristCandidates: 1, employee: false }), 'PRONTO');
  assert.equal(classifyConciliation({ auth: true, authorized: false, motorist: false, motoristCandidates: 0, employee: false }), 'PENDENTE');
  assert.equal(classifyConciliation({ auth: true, authorized: true, motorist: false, motoristCandidates: 2, employee: false }), 'CONFLITO');
  assert.equal(classifyConciliation({ auth: false, authorized: false, motorist: true, motoristCandidates: 0, employee: false }), 'SEM_AUTH');
  assert.equal(classifyConciliation({ auth: true, authorized: false, motorist: false, motoristCandidates: 0, employee: true }), 'JA_CONCILIADO');
});

test('canonical compositions omit motorista when absent and preserve driver order', () => {
  const nonDriver = buildFuncionario({ nome: 'Administrativo', email: 'A@EXAMPLE.COM', authDisabled: false, autorizado: { adm1: true } });
  assert.deepEqual(nonDriver.perfis, { adm1: true, adm2: false, user: false, motorista: false });
  assert.equal('motorista' in nonDriver, false);

  const driver = buildFuncionario({ nome: 'Motorista', email: 'm@example.com', authDisabled: false, motorista: { ordem: 12, ativo: true } });
  assert.deepEqual(driver.perfis, { adm1: false, adm2: false, user: false, motorista: true });
  assert.deepEqual(driver.motorista, { ordem: 12 });
});

test('disabled Auth and inactive motorista cannot reactivate an employee', () => {
  assert.equal(computeFuncionarioAtivo({ authDisabled: true }), false);
  assert.equal(computeFuncionarioAtivo({ authDisabled: false, motorista: { ativo: false } }), false);
});

test('exact name normalization remains accent/case/space insensitive only', () => {
  assert.equal(normalizeName('  Ámilton   Pinheiro-Fortes '), 'amilton pinheiro fortes');
  assert.equal(normalizeName('AMILTON PINHEIRO FORTES'), normalizeName('amilton pinheiro-fortes'));
  assert.notEqual(normalizeName('Ana'), normalizeName('Amanda'));
});
