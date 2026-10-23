import assert from 'node:assert/strict';
import test from 'node:test';
import { credenciaisDe, lerCredenciais, migrarPerfis, temAlgumaCredencial, temCredencial } from '../lib/credenciais.js';

test('each flow checks its own credential and adm2 enters everything', () => {
  assert.equal(temCredencial({ ativo: true, perfis: { frentista: true } }, 'frentista'), true);
  assert.equal(temCredencial({ ativo: true, perfis: { motorista: true } }, 'frentista'), false);
  assert.equal(temCredencial({ ativo: true, perfis: { adm2: true } }, 'escritorio'), true);
  assert.equal(temCredencial({ ativo: true, perfis: { adm1: true } }, 'frentista'), false, 'adm1 is no longer read');
  assert.equal(temCredencial({ ativo: false, perfis: { adm2: true } }), false);
  assert.equal(temCredencial({ ativo: true, perfis: { engenharia: true } }), false, 'no accepted credential: adm2 only');
});

test('entry needs an active employee with at least one credential', () => {
  assert.equal(temAlgumaCredencial({ ativo: true, perfis: { mecanico: true } }), true);
  assert.equal(temAlgumaCredencial({ ativo: true, perfis: { user: true, adm1: false } }), false);
  assert.equal(temAlgumaCredencial({ ativo: false, perfis: { mecanico: true } }), false);
  assert.equal(temAlgumaCredencial(undefined), false);
});

test('credentials sent by the WEB are booleans; unknown keys are dropped', () => {
  assert.deepEqual(lerCredenciais({ motorista: true, frentista: false, inventado: true }),
    { adm2: false, motorista: true, frentista: false, mecanico: false, escritorio: false, engenharia: false });
  assert.equal(lerCredenciais({ motorista: 'sim' }), null);
  assert.equal(lerCredenciais(null), null);
  assert.equal(lerCredenciais([true]), null);
  assert.deepEqual(credenciaisDe(undefined).adm2, false);
});

test('migration: frentista comes from adm1; adm1 and user leave the document', () => {
  assert.deepEqual(migrarPerfis({ adm1: true, adm2: false, user: false, motorista: true }),
    { perfis: { adm2: false, motorista: true, frentista: true, mecanico: false, escritorio: false, engenharia: false }, mudou: true });
  assert.equal(migrarPerfis({ adm2: true, user: false }).mudou, true);
  assert.equal(migrarPerfis({ adm2: true, motorista: false, frentista: false, mecanico: false, escritorio: false, engenharia: false }).mudou, false);
  assert.equal(migrarPerfis({ frentista: true }).mudou, false);
});
