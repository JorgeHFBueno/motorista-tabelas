import assert from 'node:assert/strict';
import test from 'node:test';
import { areaDaRota, autorizaArea, createAdminAuthorizationReader } from '../lib/adminAuthorization.js';

const nenhuma = { adm2: false, motorista: false, frentista: false, mecanico: false, escritorio: false, engenharia: false, logistica: false, autor: false, retr0: false };

test('admin backend reads funcionarios by exact Firebase Auth UID', async () => {
  const calls = [];
  const reader = createAdminAuthorizationReader(async (uid) => {
    calls.push(uid);
    return { ativo: true, perfis: { adm1: true, adm2: true, engenharia: true } };
  });
  const uid = 'JORGE_H.F.B';
  const result = await reader(uid);

  assert.deepEqual(calls, [uid]);
  // adm1 is no longer read; only the independent credentials.
  assert.deepEqual(result, { exists: true, ativo: true, credenciais: { ...nenhuma, adm2: true, engenharia: true }, areas: { engenharia: 'editar', portal: 'editar' } });
});

test('legacy-only data cannot authorize backend admin access', async () => {
  const reader = createAdminAuthorizationReader(async () => undefined);
  assert.deepEqual(await reader('uid'), { exists: false, ativo: false, credenciais: nenhuma, areas: {} });
});

test('backend requires strict active flags and boolean credentials', async () => {
  const inactive = createAdminAuthorizationReader(async () => ({ ativo: false, perfis: { adm2: true } }));
  const truthy = createAdminAuthorizationReader(async () => ({ ativo: 1, perfis: { adm2: 'true' } }));
  assert.equal((await inactive('uid')).credenciais.adm2, true);
  assert.equal((await inactive('uid')).ativo, false);
  assert.deepEqual(await truthy('uid'), { exists: true, ativo: false, credenciais: nenhuma, areas: {} });
});

test('adminApi groups: users = Cadastros (GET ver, rest editar); clientes = Portal editar; the rest adm2 only', () => {
  assert.deepEqual(areaDaRota('/users', 'GET'), { area: 'cadastros', nivel: 'ver' });
  assert.deepEqual(areaDaRota('/users/abc', 'PATCH'), { area: 'cadastros', nivel: 'editar' });
  assert.deepEqual(areaDaRota('/users/register', 'POST'), { area: 'cadastros', nivel: 'editar' });
  assert.deepEqual(areaDaRota('/clientes/abc/senha', 'POST'), { area: 'portal', nivel: 'editar' });
  assert.deepEqual(areaDaRota('/manutencao/credenciais', 'POST'), { area: undefined, nivel: 'editar' });
});

test('area guard: ver accepts ver or editar, editar only editar; adm2 always; no area = adm2 only; inactive never', () => {
  const pessoa = (areas, adm2 = false, ativo = true) => ({ exists: true, ativo, credenciais: { ...nenhuma, adm2 }, areas });
  assert.equal(autorizaArea(pessoa({ cadastros: 'ver' }), 'cadastros', 'ver'), true);
  assert.equal(autorizaArea(pessoa({ cadastros: 'ver' }), 'cadastros', 'editar'), false);
  assert.equal(autorizaArea(pessoa({ cadastros: 'editar' }), 'cadastros', 'ver'), true);
  assert.equal(autorizaArea(pessoa({ portal: 'editar' }), 'cadastros', 'ver'), false);
  assert.equal(autorizaArea(pessoa({ portal: 'editar' }), undefined, 'editar'), false);
  assert.equal(autorizaArea(pessoa({}, true), undefined, 'editar'), true);
  assert.equal(autorizaArea(pessoa({ cadastros: 'editar' }, true, false), 'cadastros', 'ver'), false);
});
