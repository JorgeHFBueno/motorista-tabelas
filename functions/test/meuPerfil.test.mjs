import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMeuPerfilService, montarLogin, normalizarNome } from '../lib/meuPerfil.js';

const AGORA = 1_000_000;

function rejectsCode(action, code) {
  return assert.rejects(action, (error) => error.code === code);
}

function fixture({ saveFails = false, emailInUse = false } = {}) {
  const employees = new Map([
    ['ativo', { ativo: true, nome: 'Jorge Bueno', email: '991662971@example.com' }],
    ['inativo', { ativo: false, nome: 'Fulano' }],
  ]);
  const authUsers = new Map([['ativo', { email: '991662971@example.com', displayName: 'Jorge Bueno' }]]);
  const authUpdates = [];
  const saves = [];
  const service = createMeuPerfilService({
    async getEmployee(uid) { return employees.get(uid); },
    async getAuthUser(uid) { return { ...authUsers.get(uid) }; },
    async updateAuthUser(uid, data) {
      if (emailInUse && data.email) throw Object.assign(new Error('in use'), { code: 'auth/email-already-exists' });
      authUpdates.push(data);
      authUsers.set(uid, { ...authUsers.get(uid), ...data });
    },
    async saveProfile(uid, data) {
      if (saveFails) throw new Error('firestore down');
      saves.push(data);
    },
  }, () => AGORA);
  return { service, authUpdates, saves, authUsers };
}

const recente = { uid: 'ativo', authTime: AGORA - 60 };

test('normalizes the name and builds the phone or e-mail login', () => {
  assert.equal(normalizarNome('  Jorge   Henrique  Bueno '), 'Jorge Henrique Bueno');
  assert.equal(normalizarNome('Jo'), null);
  assert.equal(normalizarNome('x'.repeat(121)), null);
  assert.equal(normalizarNome(5), null);
  assert.equal(montarLogin({ tipo: 'celular', valor: '(51) 99166-2971' }), '51991662971@example.com');
  assert.equal(montarLogin({ tipo: 'celular', valor: '123' }), null);
  assert.equal(montarLogin({ tipo: 'email', valor: ' Jorge@Ledur.com.br ' }), 'jorge@ledur.com.br');
  assert.equal(montarLogin({ tipo: 'email', valor: '991662971@example.com' }), null);
  assert.equal(montarLogin({ tipo: 'email', valor: 'sem-arroba' }), null);
  assert.equal(montarLogin({ tipo: 'outro', valor: 'x' }), null);
});

test('a name change updates Auth and the profile copies, without recent login', async () => {
  const { service, authUpdates, saves } = fixture();
  const result = await service({ uid: 'ativo' }, { nome: ' Jorge  H. F. Bueno ' });
  assert.deepEqual(result, { nome: 'Jorge H. F. Bueno', email: '991662971@example.com' });
  assert.deepEqual(authUpdates, [{ displayName: 'Jorge H. F. Bueno' }]);
  assert.deepEqual(saves, [{ nome: 'Jorge H. F. Bueno' }]);
});

test('a login change requires a recent sign-in and updates every copy', async () => {
  const { service, authUpdates, saves } = fixture();
  await assert.rejects(service({ uid: 'ativo', authTime: AGORA - 600 }, { login: { tipo: 'email', valor: 'jorge@ledur.com.br' } }),
    (error) => error.code === 'failed-precondition' && error.details?.motivo === 'requires-recent-login');
  await rejectsCode(service({ uid: 'ativo' }, { login: { tipo: 'email', valor: 'jorge@ledur.com.br' } }), 'failed-precondition');
  assert.equal(authUpdates.length, 0);
  const result = await service(recente, { login: { tipo: 'email', valor: 'Jorge@Ledur.com.br' } });
  assert.deepEqual(result, { nome: 'Jorge Bueno', email: 'jorge@ledur.com.br' });
  assert.deepEqual(authUpdates, [{ email: 'jorge@ledur.com.br' }]);
  assert.deepEqual(saves, [{ email: 'jorge@ledur.com.br' }]);
});

test('nothing changes when the values are the same', async () => {
  const { service, authUpdates, saves } = fixture();
  const result = await service({ uid: 'ativo' }, { nome: 'Jorge Bueno', login: { tipo: 'celular', valor: '991662971' } });
  assert.deepEqual(result, { nome: 'Jorge Bueno', email: '991662971@example.com' });
  assert.equal(authUpdates.length + saves.length, 0);
});

test('refuses missing, inactive or invalid requests', async () => {
  const { service, authUpdates } = fixture();
  await rejectsCode(service({}, { nome: 'Jorge' }), 'unauthenticated');
  await rejectsCode(service({ uid: 'inativo' }, { nome: 'Jorge' }), 'permission-denied');
  await rejectsCode(service({ uid: 'ausente' }, { nome: 'Jorge' }), 'permission-denied');
  for (const data of [null, [], 'x', { nome: 'Jo' }, { login: { tipo: 'email', valor: 'x' } }]) {
    await rejectsCode(service(recente, data), 'invalid-argument');
  }
  assert.equal(authUpdates.length, 0);
});

test('a login already in use is reported without touching the profile', async () => {
  const { service, saves } = fixture({ emailInUse: true });
  await rejectsCode(service(recente, { login: { tipo: 'email', valor: 'outro@ledur.com.br' } }), 'already-exists');
  assert.equal(saves.length, 0);
});

test('Auth is restored when the profile write fails', async () => {
  const { service, authUpdates, authUsers } = fixture({ saveFails: true });
  await assert.rejects(service(recente, { nome: 'Jorge Novo', login: { tipo: 'email', valor: 'jorge@ledur.com.br' } }), /firestore down/);
  assert.deepEqual(authUpdates, [
    { displayName: 'Jorge Novo', email: 'jorge@ledur.com.br' },
    { displayName: 'Jorge Bueno', email: '991662971@example.com' },
  ]);
  assert.deepEqual(authUsers.get('ativo'), { email: '991662971@example.com', displayName: 'Jorge Bueno' });
});
