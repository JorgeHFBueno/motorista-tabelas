import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminAuthorizationReader } from '../lib/adminAuthorization.js';

test('admin backend reads funcionarios by exact Firebase Auth UID', async () => {
  const calls = [];
  const reader = createAdminAuthorizationReader(async (uid) => {
    calls.push(uid);
    return { ativo: true, perfis: { adm1: false, adm2: true } };
  });
  const uid = 'JORGE_H.F.B';
  const result = await reader(uid);

  assert.deepEqual(calls, [uid]);
  assert.deepEqual(result, { exists: true, ativo: true, adm1: false, adm2: true });
});

test('legacy-only data cannot authorize backend admin access', async () => {
  const legacy = { ativo: true, adm2: true };
  const reader = createAdminAuthorizationReader(async () => undefined);
  assert.equal(legacy.adm2, true);
  assert.deepEqual(await reader('uid'), { exists: false, ativo: false, adm1: false, adm2: false });
});

test('backend requires strict active adm2 flags', async () => {
  const inactive = createAdminAuthorizationReader(async () => ({ ativo: false, perfis: { adm2: true } }));
  const truthy = createAdminAuthorizationReader(async () => ({ ativo: 1, perfis: { adm2: 'true' } }));
  assert.equal((await inactive('uid')).adm2, true);
  assert.equal((await inactive('uid')).ativo, false);
  assert.deepEqual(await truthy('uid'), { exists: true, ativo: false, adm1: false, adm2: false });
});
