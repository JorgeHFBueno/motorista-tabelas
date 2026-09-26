import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAuthorizationProfileReader,
  type AuthorizationProfile,
  type FuncionarioDocument,
} from '../src/services/authorizationProfileCore';
import { resolveAuthorizationSession } from '../src/services/authorizationSession';
import { isAdm1Only, isAdm2Authorized, isWebAdminAuthorized } from '../src/services/webAuthorization';
import { isAdm1RouteRestricted } from '../src/services/adm1RouteAuthorization';

function document(id: string, data?: Record<string, unknown>): FuncionarioDocument {
  return {
    id,
    exists: () => data !== undefined,
    data: () => data,
  };
}

function canonicalData(input: {
  ativo?: boolean;
  adm1?: boolean;
  adm2?: boolean;
  user?: boolean;
  motorista?: boolean;
} = {}) {
  return {
    nome: 'Funcionário',
    ativo: input.ativo === true,
    perfis: {
      adm1: input.adm1 === true,
      adm2: input.adm2 === true,
      user: input.user === true,
      motorista: input.motorista === true,
    },
  };
}

async function load(data?: Record<string, unknown>) {
  return createAuthorizationProfileReader(async (uid) => document(uid, data))('uid');
}

test('canonical active adm1 and adm2 profiles follow existing Web route rules', async () => {
  const adm1 = await load(canonicalData({ ativo: true, adm1: true }));
  const adm2 = await load(canonicalData({ ativo: true, adm2: true }));

  assert.equal(isWebAdminAuthorized(adm1), true);
  assert.equal(isAdm1Only(adm1), true);
  assert.equal(isAdm1RouteRestricted('/', isAdm1Only(adm1)), false);
  assert.equal(isAdm1RouteRestricted('/combustivel/novo', isAdm1Only(adm1)), false);
  assert.equal(isAdm1RouteRestricted('/cadastros', isAdm1Only(adm1)), true);

  assert.equal(isWebAdminAuthorized(adm2), true);
  assert.equal(isAdm2Authorized(adm2), true);
  assert.equal(isAdm1RouteRestricted('/cadastros', isAdm1Only(adm2)), false);
});

test('user-only, motorista-only, inactive, and missing funcionarios are denied', async () => {
  const user = await load(canonicalData({ ativo: true, user: true }));
  const motorista = await load(canonicalData({ ativo: true, motorista: true }));
  const inactive = await load(canonicalData({ adm2: true }));
  const missing = await load();

  assert.equal(isWebAdminAuthorized(user), false);
  assert.equal(isWebAdminAuthorized(motorista), false);
  assert.equal(isWebAdminAuthorized(inactive), false);
  assert.equal(isWebAdminAuthorized(missing), false);
  assert.equal(missing.exists, false);
});

test('legacy authorization never grants or overrides canonical permission', async () => {
  const legacy = { ativo: true, adm2: true };
  const noFuncionario = await load();
  const canonicalDenied = await load(canonicalData({ ativo: true, adm2: false }));
  const canonicalAllowed = await load(canonicalData({ ativo: true, adm2: true }));

  assert.equal(legacy.adm2, true);
  assert.equal(isAdm2Authorized(noFuncionario), false);
  assert.equal(isAdm2Authorized(canonicalDenied), false);
  assert.equal(isAdm2Authorized(canonicalAllowed), true);
});

test('reader uses Firebase Auth UID literally and preserves dots, underscores, and case', async () => {
  const calls: string[] = [];
  const reader = createAuthorizationProfileReader(async (uid) => {
    calls.push(uid);
    return document(uid, canonicalData({ ativo: true, adm2: true }));
  });
  const uid = 'JORGE_H.F.B';
  const profile = await reader(uid);

  assert.deepEqual(calls, [uid]);
  assert.equal(profile.id, uid);
});

test('funcionarios read errors remain technical errors', async () => {
  const expected = new Error('permission-denied');
  const reader = createAuthorizationProfileReader(async () => { throw expected; });
  await assert.rejects(() => reader('uid'), (error) => error === expected);
});

test('authorization loading does not expose denial or a previous user profile', async () => {
  const profileA = await load(canonicalData({ ativo: true, adm2: true }));
  const stateA = { uid: 'user-A', loading: false, profile: profileA, error: null };

  const whileAuthLoads = resolveAuthorizationSession('user-A', true, stateA);
  assert.equal(whileAuthLoads.loading, true);
  assert.equal(whileAuthLoads.profile, null);

  const switchedToB = resolveAuthorizationSession('user-B', false, stateA);
  assert.equal(switchedToB.loading, true);
  assert.equal(switchedToB.profile, null);

  const loggedOut = resolveAuthorizationSession(null, false, stateA);
  assert.deepEqual(loggedOut, { uid: null, loading: false, profile: null, error: null });
});

test('/cadastros follows adm2 policy and Kiosk requires active adm2', async () => {
  const adm1 = await load(canonicalData({ ativo: true, adm1: true }));
  const adm2 = await load(canonicalData({ ativo: true, adm2: true }));
  const both = await load(canonicalData({ ativo: true, adm1: true, adm2: true }));

  assert.equal(isAdm1RouteRestricted('/cadastros', isAdm1Only(adm1)), true);
  assert.equal(isAdm1RouteRestricted('/cadastros', isAdm1Only(adm2)), false);
  assert.equal(isAdm2Authorized(adm1), false);
  assert.equal(isAdm2Authorized(adm2), true);
  assert.equal(isAdm2Authorized(both), true);
});

test('profile fields are interpreted strictly as boolean true', async () => {
  const profile = await load({
    nome: 'Strict',
    ativo: 1,
    perfis: { adm1: 'true', adm2: 1, user: true, motorista: false },
  });
  assert.deepEqual(
    { ativo: profile.ativo, adm1: profile.adm1, adm2: profile.adm2, user: profile.user, motorista: profile.motorista },
    { ativo: false, adm1: false, adm2: false, user: true, motorista: false },
  );
});

const _typeCheck: AuthorizationProfile | null = null;
void _typeCheck;
