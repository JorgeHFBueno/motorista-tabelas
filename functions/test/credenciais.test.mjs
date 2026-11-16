import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CREDENCIAIS_SO_ADM2, areasDasCredenciais, areasDe, areasValidas, credenciaisDe, editaArea, lerAreas, lerCredenciais, limparCredenciaisAntigas,
  mesclarCredenciais, migrarAreas, mudaCredencialProibida, semCredenciais, temAlgumaCredencial, temCredencial, temCredencialSoAdm2, veArea,
} from '../lib/credenciais.js';

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

// ---------------------------------------------------------------- WEB areas (2026-11-16)
test('areas in force: the areas map when present, otherwise the old credentials (all at editar)', () => {
  assert.deepEqual(areasDasCredenciais({ mecanico: true }), { frota: 'editar', combustivel: 'editar', logistica: 'editar', friday: 'editar' });
  assert.deepEqual(areasDasCredenciais({ escritorio: true, engenharia: true }), { friday: 'editar', cadastros: 'editar', portal: 'editar', engenharia: 'editar' });
  assert.deepEqual(areasDasCredenciais({ autor: true, motorista: true }), { manuscript: 'editar' });
  assert.deepEqual(areasDe({ ativo: true, perfis: { logistica: true } }), { frota: 'editar', combustivel: 'editar', logistica: 'editar' });
  // A document with `areas` (even empty) no longer reads the old credentials.
  assert.deepEqual(areasDe({ ativo: true, perfis: { logistica: true }, areas: {} }), {});
  assert.deepEqual(areasDe({ ativo: true, perfis: { logistica: true }, areas: { combustivel: 'ver' } }), { combustivel: 'ver' });
  assert.deepEqual(areasDe(undefined), {});
});

test('stored areas: unknown keys and levels are dropped; Friday has one level', () => {
  assert.deepEqual(areasValidas({ frota: 'ver', x: 'editar', portal: 'admin', friday: 'ver', cadastros: 'editar' }), { frota: 'ver', friday: 'editar', cadastros: 'editar' });
  assert.deepEqual(areasValidas(null), {});
  assert.deepEqual(areasValidas(['frota']), {});
});

test('veArea / editaArea: ver reads, editar reads and writes; adm2 everything; inactive nothing', () => {
  const ver = { ativo: true, perfis: {}, areas: { combustivel: 'ver' } };
  const editar = { ativo: true, perfis: {}, areas: { combustivel: 'editar' } };
  assert.equal(veArea(ver, 'combustivel'), true);
  assert.equal(editaArea(ver, 'combustivel'), false);
  assert.equal(veArea(editar, 'combustivel'), true);
  assert.equal(editaArea(editar, 'combustivel'), true);
  assert.equal(veArea(editar, 'frota'), false);
  assert.equal(veArea(editar, 'frota', 'combustivel'), true);
  assert.equal(editaArea({ ativo: true, perfis: { adm2: true }, areas: {} }, 'manuscript'), true);
  assert.equal(veArea({ ativo: false, perfis: { adm2: true }, areas: { frota: 'editar' } }, 'frota'), false);
  assert.equal(veArea({ ativo: 1, areas: { frota: 'editar' } }, 'frota'), false);
  // Legacy: a document without areas still enters through its old credentials.
  assert.equal(editaArea({ ativo: true, perfis: { escritorio: true } }, 'cadastros'), true);
  assert.equal(veArea({ ativo: true, perfis: { escritorio: true } }, 'combustivel'), false);
});

test('entry to the WEB counts the areas: an office person may have no app credential', () => {
  assert.equal(temAlgumaCredencial({ ativo: true, perfis: {}, areas: { portal: 'ver' } }), true);
  assert.equal(temAlgumaCredencial({ ativo: true, perfis: {}, areas: {} }), false);
  assert.equal(temAlgumaCredencial({ ativo: true, perfis: { engenharia: true } }), true);
});

test('areas sent by the WEB: whole map of known areas at ver or editar; Friday only editar', () => {
  assert.deepEqual(lerAreas({ frota: 'ver', friday: 'editar' }), { frota: 'ver', friday: 'editar' });
  assert.deepEqual(lerAreas({}), {});
  assert.equal(lerAreas({ friday: 'ver' }), null);
  assert.equal(lerAreas({ frota: true }), null);
  assert.equal(lerAreas({ dev: 'editar' }), null);
  assert.equal(lerAreas(['frota']), null);
  assert.equal(lerAreas(null), null);
});

test('non-adm2 Cadastros changes only motorista, frentista and mecanico', () => {
  const antes = credenciaisDe({ motorista: true, escritorio: true });
  assert.equal(mudaCredencialProibida(antes, credenciaisDe({ motorista: false, frentista: true, mecanico: true, escritorio: true })), false);
  assert.equal(mudaCredencialProibida(antes, credenciaisDe({ motorista: true })), true, 'took escritorio away');
  assert.equal(mudaCredencialProibida(antes, credenciaisDe({ motorista: true, escritorio: true, logistica: true })), true);
  assert.equal(mudaCredencialProibida(semCredenciais(), credenciaisDe({ adm2: true })), true);
  assert.equal(mudaCredencialProibida(semCredenciais(), credenciaisDe({ retr0: true })), true);
});

test('migration: areas from the old credentials on documents without them; limpar drops the old keys', () => {
  assert.deepEqual(migrarAreas({ perfis: { escritorio: true } }), { areas: { friday: 'editar', cadastros: 'editar', portal: 'editar' }, mudou: true });
  assert.deepEqual(migrarAreas({ perfis: { motorista: true } }), { areas: {}, mudou: true });
  assert.deepEqual(migrarAreas({ perfis: { escritorio: true }, areas: { portal: 'ver' } }), { areas: { portal: 'ver' }, mudou: false });
  assert.deepEqual(limparCredenciaisAntigas({ adm2: false, motorista: true, escritorio: true, engenharia: false, logistica: true, autor: false, retr0: false }),
    { perfis: { adm2: false, motorista: true, retr0: false }, mudou: true });
  assert.equal(limparCredenciaisAntigas({ motorista: true }).mudou, false);
});
