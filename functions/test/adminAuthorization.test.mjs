import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminAuthorizationReader } from '../lib/adminAuthorization.js';

const nenhuma = { adm2: false, motorista: false, frentista: false, mecanico: false, escritorio: false, engenharia: false };

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
  assert.deepEqual(result, { exists: true, ativo: true, credenciais: { ...nenhuma, adm2: true, engenharia: true } });
});

test('legacy-only data cannot authorize backend admin access', async () => {
  const reader = createAdminAuthorizationReader(async () => undefined);
  assert.deepEqual(await reader('uid'), { exists: false, ativo: false, credenciais: nenhuma });
});

test('backend requires strict active flags and boolean credentials', async () => {
  const inactive = createAdminAuthorizationReader(async () => ({ ativo: false, perfis: { adm2: true } }));
  const truthy = createAdminAuthorizationReader(async () => ({ ativo: 1, perfis: { adm2: 'true' } }));
  assert.equal((await inactive('uid')).credenciais.adm2, true);
  assert.equal((await inactive('uid')).ativo, false);
  assert.deepEqual(await truthy('uid'), { exists: true, ativo: false, credenciais: nenhuma });
});
