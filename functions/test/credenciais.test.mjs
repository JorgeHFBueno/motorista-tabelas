import assert from 'node:assert/strict';
import test from 'node:test';
import { CREDENCIAIS_SO_ADM2, credenciaisDe, lerCredenciais, mesclarCredenciais, migrarPerfis, temAlgumaCredencial, temCredencial, temCredencialSoAdm2 } from '../lib/credenciais.js';

test('each flow checks its own credential and adm2 enters everything', () => {
  assert.equal(temCredencial({ ativo: true, perfis: { frentista: true } }, 'frentista'), true);
  assert.equal(temCredencial({ ativo: true, perfis: { motorista: true } }, 'frentista'), false);
  assert.equal(temCredencial({ ativo: true, perfis: { adm2: true } }, 'escritorio'), true);
  assert.equal(temCredencial({ ativo: true, perfis: { adm1: true } }, 'frentista'), false, 'adm1 is no longer read');
  assert.equal(temCredencial({ ativo: false, perfis: { adm2: true } }), false);
  assert.equal(temCredencial({ ativo: true, perfis: { engenharia: true } }), false, 'no accepted credential: adm2 only');
});

test('retr0 is exclusive: adm2 does not get it for free', () => {
  assert.equal(temCredencial({ ativo: true, perfis: { adm2: true } }, 'retr0'), false);
  assert.equal(temCredencial({ ativo: true, perfis: { retr0: true } }, 'retr0'), true);
  assert.equal(temCredencial({ ativo: true, perfis: { retr0: true } }), false);
  assert.equal(temAlgumaCredencial({ ativo: true, perfis: { retr0: true } }), true);
});

test('entry needs an active employee with at least one credential', () => {
  assert.equal(temAlgumaCredencial({ ativo: true, perfis: { mecanico: true } }), true);
  assert.equal(temAlgumaCredencial({ ativo: true, perfis: { user: true, adm1: false } }), false);
  assert.equal(temAlgumaCredencial({ ativo: false, perfis: { mecanico: true } }), false);
  assert.equal(temAlgumaCredencial(undefined), false);
});

test('credentials sent by the WEB are booleans; unknown keys are dropped', () => {
  assert.deepEqual(lerCredenciais({ motorista: true, frentista: false, inventado: true }),
    { adm2: false, motorista: true, frentista: false, mecanico: false, escritorio: false, engenharia: false, logistica: false, autor: false, retr0: false });
  assert.equal(lerCredenciais({ motorista: 'sim' }), null);
  assert.equal(lerCredenciais(null), null);
  assert.equal(lerCredenciais([true]), null);
  assert.deepEqual(credenciaisDe(undefined).adm2, false);
});

test('migration: frentista comes from adm1; adm1 and user leave the document', () => {
  assert.deepEqual(migrarPerfis({ adm1: true, adm2: false, user: false, motorista: true }),
    { perfis: { adm2: false, motorista: true, frentista: true, mecanico: false, escritorio: false, engenharia: false, logistica: false, autor: false, retr0: false }, mudou: true });
  assert.equal(migrarPerfis({ adm2: true, user: false }).mudou, true);
  assert.equal(migrarPerfis({ adm2: true, motorista: false, frentista: false, mecanico: false, escritorio: false, engenharia: false, logistica: false, autor: false, retr0: false }).mudou, false);
  assert.equal(migrarPerfis({ frentista: true }).mudou, false);
});

test('area credentials of 2026-11-06: logistica and autor are plain credentials adm2 gets for free', () => {
  assert.equal(temCredencial({ ativo: true, perfis: { logistica: true } }, 'mecanico', 'logistica'), true);
  assert.equal(temCredencial({ ativo: true, perfis: { autor: true } }, 'retr0', 'autor'), true, 'Manuscript chat');
  assert.equal(temCredencial({ ativo: true, perfis: { adm2: true } }, 'retr0', 'autor'), true, 'adm2 enters the chat through autor');
  assert.equal(temCredencial({ ativo: true, perfis: { logistica: true } }), false, 'logistica is not adm2');
  assert.equal(temAlgumaCredencial({ ativo: true, perfis: { autor: true } }), true);
});

test('only adm2 manages adm2 and retr0 (Cadastros is also open to escritorio)', () => {
  assert.deepEqual(CREDENCIAIS_SO_ADM2, ['adm2', 'retr0']);
  assert.equal(temCredencialSoAdm2(credenciaisDe({ adm2: true })), true);
  assert.equal(temCredencialSoAdm2(credenciaisDe({ retr0: true })), true);
  assert.equal(temCredencialSoAdm2(credenciaisDe({ escritorio: true, logistica: true, autor: true })), false);
  assert.equal(temCredencialSoAdm2(null), false);
});

test('PATCH keeps the credentials left out (the app DEV screen sends only the ones it knows)', () => {
  const atuais = { adm2: false, motorista: true, retr0: true, autor: true, logistica: true };
  const app = { adm2: false, motorista: false, frentista: true, mecanico: false, escritorio: false, engenharia: false };
  assert.deepEqual(mesclarCredenciais(atuais, app),
    { adm2: false, motorista: false, frentista: true, mecanico: false, escritorio: false, engenharia: false, logistica: true, autor: true, retr0: true });
  assert.equal(mesclarCredenciais(atuais, { autor: false }).autor, false, 'a key sent replaces the current one');
  assert.equal(mesclarCredenciais(atuais, { autor: 'nao' }), null);
});
