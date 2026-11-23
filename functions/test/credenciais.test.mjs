import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CREDENCIAIS_SO_ADM2, areasDe, areasValidas, credenciaisDe, editaArea, lerAreas, lerCredenciais,
  mesclarCredenciais, mudaCredencialProibida, semCredenciais, temAlgumaCredencial, temCredencial, temCredencialSoAdm2, veArea,
} from '../lib/credenciais.js';

test('each flow checks its own credential and adm2 enters everything', () => {
  assert.equal(temCredencial({ ativo: true, perfis: { frentista: true } }, 'frentista'), true);
  assert.equal(temCredencial({ ativo: true, perfis: { motorista: true } }, 'frentista'), false);
  assert.equal(temCredencial({ ativo: true, perfis: { adm2: true } }, 'mecanico'), true);
  assert.equal(temCredencial({ ativo: true, perfis: { adm1: true } }, 'frentista'), false, 'adm1 is no longer read');
  assert.equal(temCredencial({ ativo: false, perfis: { adm2: true } }), false);
  assert.equal(temCredencial({ ativo: true, perfis: { mecanico: true } }), false, 'no accepted credential: adm2 only');
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
    { adm2: false, motorista: true, frentista: false, mecanico: false, retr0: false });
  assert.deepEqual(lerCredenciais({ escritorio: true, logistica: true }), { adm2: false, motorista: false, frentista: false, mecanico: false, retr0: false }, 'old WEB credentials are ignored');
  assert.equal(lerCredenciais({ motorista: 'sim' }), null);
  assert.equal(lerCredenciais(null), null);
  assert.equal(lerCredenciais([true]), null);
  assert.deepEqual(credenciaisDe(undefined).adm2, false);
});

test('only adm2 manages adm2 and retr0 (Cadastros is also open to non-adm2 people)', () => {
  assert.deepEqual(CREDENCIAIS_SO_ADM2, ['adm2', 'retr0']);
  assert.equal(temCredencialSoAdm2(credenciaisDe({ adm2: true })), true);
  assert.equal(temCredencialSoAdm2(credenciaisDe({ retr0: true })), true);
  assert.equal(temCredencialSoAdm2(credenciaisDe({ motorista: true, frentista: true, mecanico: true })), false);
  assert.equal(temCredencialSoAdm2(null), false);
});

test('PATCH keeps the credentials left out (the app DEV screen sends only the ones it knows)', () => {
  const atuais = { adm2: false, motorista: true, retr0: true };
  // The app still sends the old escritorio and engenharia: ignored.
  const app = { adm2: false, motorista: false, frentista: true, mecanico: false, escritorio: true, engenharia: false };
  assert.deepEqual(mesclarCredenciais(atuais, app), { adm2: false, motorista: false, frentista: true, mecanico: false, retr0: true });
  assert.equal(mesclarCredenciais(atuais, { retr0: false }).retr0, false, 'a key sent replaces the current one');
  assert.equal(mesclarCredenciais(atuais, { retr0: 'nao' }), null);
});

// ---------------------------------------------------------------- WEB areas (2026-11-16)
test('areas in force: only the areas map; old credentials without it give no WEB area (cleanup of 2026-11-16)', () => {
  assert.deepEqual(areasDe({ ativo: true, perfis: { logistica: true, escritorio: true, mecanico: true } }), {});
  assert.equal(veArea({ ativo: true, perfis: { escritorio: true, engenharia: true, autor: true } }, 'cadastros', 'portal', 'engenharia', 'manuscript'), false);
  assert.deepEqual(areasDe({ ativo: true, perfis: { logistica: true }, areas: {} }), {});
  assert.deepEqual(areasDe({ ativo: true, perfis: { logistica: true }, areas: { logistica: 'ver' } }), { logistica: 'ver' });
  assert.deepEqual(areasDe(undefined), {});
});

test('stored areas: unknown keys and levels are dropped; Friday has one level', () => {
  assert.deepEqual(areasValidas({ mecanica: 'ver', x: 'editar', portal: 'admin', friday: 'ver', cadastros: 'editar' }), { mecanica: 'ver', friday: 'editar', cadastros: 'editar' });
  assert.deepEqual(areasValidas(null), {});
  assert.deepEqual(areasValidas(['mecanica']), {});
});

test('veArea / editaArea: ver reads, editar reads and writes; adm2 everything; inactive nothing', () => {
  const ver = { ativo: true, perfis: {}, areas: { logistica: 'ver' } };
  const editar = { ativo: true, perfis: {}, areas: { logistica: 'editar' } };
  assert.equal(veArea(ver, 'logistica'), true);
  assert.equal(editaArea(ver, 'logistica'), false);
  assert.equal(veArea(editar, 'logistica'), true);
  assert.equal(editaArea(editar, 'logistica'), true);
  assert.equal(veArea(editar, 'mecanica'), false);
  assert.equal(veArea(editar, 'mecanica', 'logistica'), true);
  assert.equal(editaArea({ ativo: true, perfis: { adm2: true }, areas: {} }, 'manuscript'), true);
  assert.equal(veArea({ ativo: false, perfis: { adm2: true }, areas: { mecanica: 'editar' } }, 'mecanica'), false);
  assert.equal(veArea({ ativo: 1, areas: { mecanica: 'editar' } }, 'mecanica'), false);
  assert.equal(editaArea({ ativo: true, perfis: { escritorio: true } }, 'cadastros'), false, 'old credential, no areas');
});

test('entry to the WEB counts the areas: an office person may have no app credential', () => {
  assert.equal(temAlgumaCredencial({ ativo: true, perfis: {}, areas: { portal: 'ver' } }), true);
  assert.equal(temAlgumaCredencial({ ativo: true, perfis: {}, areas: {} }), false);
  assert.equal(temAlgumaCredencial({ ativo: true, perfis: { engenharia: true } }), false, 'old credential only: no entry');
});

test('areas sent by the WEB: whole map of known areas at ver or editar; Friday only editar', () => {
  assert.deepEqual(lerAreas({ mecanica: 'ver', friday: 'editar' }), { mecanica: 'ver', friday: 'editar' });
  assert.deepEqual(lerAreas({}), {});
  assert.equal(lerAreas({ friday: 'ver' }), null);
  assert.equal(lerAreas({ frota: true }), null);
  assert.equal(lerAreas({ dev: 'editar' }), null);
  assert.equal(lerAreas(['frota']), null);
  assert.equal(lerAreas(null), null);
});

test('non-adm2 Cadastros changes only motorista, frentista and mecanico', () => {
  const antes = credenciaisDe({ motorista: true, retr0: true });
  assert.equal(mudaCredencialProibida(antes, credenciaisDe({ motorista: false, frentista: true, mecanico: true, retr0: true })), false);
  assert.equal(mudaCredencialProibida(antes, credenciaisDe({ motorista: true })), true, 'took retr0 away');
  assert.equal(mudaCredencialProibida(antes, credenciaisDe({ motorista: true, retr0: true, escritorio: true })), false, 'old keys are ignored');
  assert.equal(mudaCredencialProibida(semCredenciais(), credenciaisDe({ adm2: true })), true);
  assert.equal(mudaCredencialProibida(semCredenciais(), credenciaisDe({ retr0: true })), true);
});

test('Tools area (2026-11-19): one level, stored as editar; adm2 grants it', () => {
  assert.deepEqual(areasValidas({ tools: 'ver', friday: 'editar' }), { friday: 'editar', tools: 'editar' });
  assert.deepEqual(lerAreas({ tools: 'editar' }), { tools: 'editar' });
  assert.equal(veArea({ ativo: true, perfis: {}, areas: { tools: 'editar' } }, 'tools'), true);
});

test('Comercial area (2026-11-23): two levels, like the other areas', () => {
  assert.deepEqual(areasValidas({ comercial: 'ver' }), { comercial: 'ver' });
  assert.equal(veArea({ ativo: true, perfis: {}, areas: { comercial: 'ver' } }, 'comercial'), true);
  assert.equal(editaArea({ ativo: true, perfis: {}, areas: { comercial: 'ver' } }, 'comercial'), false);
  assert.equal(editaArea({ ativo: true, perfis: {}, areas: { comercial: 'editar' } }, 'comercial'), true);
});
