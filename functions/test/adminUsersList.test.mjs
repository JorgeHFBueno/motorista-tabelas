import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { listarAdminUsers, montarAdminUser } from '../lib/adminUsersList.js';

const conta = (uid, extra = {}) => ({ uid, email: `${uid}@ledur.test`, displayName: uid, disabled: false, metadata: { creationTime: 'Tue, 03 Jun 2025 12:00:00 GMT', lastSignInTime: undefined }, ...extra });

test('the users list reads every employee in a single call, not one read per account', async () => {
  const chamadas = [];
  const ler = async (uids) => {
    chamadas.push(uids);
    return new Map([['a', { nome: 'ANA', ativo: true, perfis: { escritorio: true } }], ['b', undefined]]);
  };
  const users = await listarAdminUsers([conta('a'), conta('b'), conta('cliente')], new Set(['cliente']), ler);
  assert.deepEqual(chamadas, [['a', 'b', 'cliente']]);
  // Client portal login without an employee is left out; an account without an employee stays, with funcionario null.
  assert.deepEqual(users.map((u) => u.uid), ['a', 'b']);
  assert.equal(users[1].funcionario, null);
  assert.equal(users[0].funcionario.nome, 'ANA');
  assert.equal(users[0].funcionario.credenciais.escritorio, true);
});

test('an employee who is also in users/{uid} stays in the list', async () => {
  const users = await listarAdminUsers([conta('x')], new Set(['x']), async () => new Map([['x', { nome: 'X', ativo: true, perfis: {} }]]));
  assert.deepEqual(users.map((u) => u.uid), ['x']);
});

test('montarAdminUser keeps the shape the WEB reads', () => {
  const u = montarAdminUser(conta('a', { disabled: true }), { nome: 7, email: 'a@ledur.test', ativo: 'sim', perfis: { frentista: true }, ultimoAcesso: Timestamp.fromDate(new Date('2026-11-10T13:00:00Z')) });
  assert.equal(u.disabled, true);
  assert.equal(u.createdAt, 'Tue, 03 Jun 2025 12:00:00 GMT');
  assert.equal(u.funcionario.nome, null);
  assert.equal(u.funcionario.ativo, false);
  assert.equal(u.funcionario.credenciais.frentista, true);
  assert.equal(u.funcionario.ultimoAcesso, '2026-11-10T13:00:00.000Z');
});
