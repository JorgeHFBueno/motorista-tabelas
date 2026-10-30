import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAuthorizationProfileReader,
  type AuthorizationProfile,
  type FuncionarioDocument,
} from '../src/services/authorizationProfileCore';
import { resolveAuthorizationSession } from '../src/services/authorizationSession';
import { isAdm2Authorized } from '../src/services/webAuthorization';
import { temAlgumaCredencial, temCredencial } from '../src/services/credenciais';
import { isKioskCredentialEligible } from '../src/services/kioskCredentialEligibility';

function document(id: string, data?: Record<string, unknown>): FuncionarioDocument {
  return {
    id,
    exists: () => data !== undefined,
    data: () => data,
  };
}

function canonicalData(ativo: boolean, perfis: Record<string, unknown> = {}) {
  return { nome: 'Funcionário', ativo, perfis };
}

async function load(data?: Record<string, unknown>) {
  return createAuthorizationProfileReader(async (uid) => document(uid, data))('uid');
}

test('credentials: each WEB area checks its own and adm2 enters everything (credenciais 2026-10-23)', async () => {
  const adm2 = await load(canonicalData(true, { adm2: true }));
  const escritorio = await load(canonicalData(true, { escritorio: true }));
  const engenharia = await load(canonicalData(true, { engenharia: true }));
  const motorista = await load(canonicalData(true, { motorista: true }));

  assert.equal(isAdm2Authorized(adm2), true);
  assert.equal(temCredencial(adm2, 'escritorio'), true);
  assert.equal(temCredencial(adm2, 'engenharia'), true);

  assert.equal(temCredencial(escritorio, 'escritorio'), true);
  assert.equal(temCredencial(escritorio, 'engenharia'), false);
  assert.equal(temCredencial(escritorio), false, 'without accepted credentials, only adm2');
  assert.equal(isAdm2Authorized(escritorio), false);

  assert.equal(temCredencial(engenharia, 'engenharia'), true);
  assert.equal(temCredencial(engenharia, 'escritorio'), false);

  // App-only credentials still enter the WEB (Meu perfil), but no area.
  assert.equal(temAlgumaCredencial(motorista), true);
  assert.equal(temCredencial(motorista, 'escritorio', 'engenharia'), false);
});

test('retr0 is exclusive: only who holds it enters /dev, not even adm2 (2026-10-30)', async () => {
  const adm2 = await load(canonicalData(true, { adm2: true }));
  const retr0 = await load(canonicalData(true, { retr0: true }));
  const ambos = await load(canonicalData(true, { adm2: true, retr0: true }));
  const inativo = await load(canonicalData(false, { retr0: true }));

  assert.equal(temCredencial(adm2, 'retr0'), false);
  assert.equal(temCredencial(adm2, 'retr0', 'escritorio'), true, 'another accepted credential still lets adm2 in');
  assert.equal(temCredencial(retr0, 'retr0'), true);
  assert.equal(temCredencial(retr0), false, 'retr0 is not adm2');
  assert.equal(temAlgumaCredencial(retr0), true);
  assert.equal(temCredencial(ambos, 'retr0'), true);
  assert.equal(temCredencial(inativo, 'retr0'), false);
});

test('adm1, user, inactive and missing funcionarios have no WEB entry', async () => {
  const adm1 = await load(canonicalData(true, { adm1: true, user: true }));
  const inactive = await load(canonicalData(false, { adm2: true }));
  const missing = await load();

  assert.equal(temAlgumaCredencial(adm1), false, 'adm1 and user are no longer read');
  assert.equal(isAdm2Authorized(adm1), false);
  assert.equal(temAlgumaCredencial(inactive), false);
  assert.equal(isAdm2Authorized(inactive), false);
  assert.equal(temAlgumaCredencial(missing), false);
  assert.equal(missing.exists, false);
});

test('legacy authorization never grants or overrides canonical permission', async () => {
  const legacy = { ativo: true, adm2: true };
  const noFuncionario = await load();
  const canonicalDenied = await load(canonicalData(true, { adm2: false }));
  const canonicalAllowed = await load(canonicalData(true, { adm2: true }));

  assert.equal(legacy.adm2, true);
  assert.equal(isAdm2Authorized(noFuncionario), false);
  assert.equal(isAdm2Authorized(canonicalDenied), false);
  assert.equal(isAdm2Authorized(canonicalAllowed), true);
});

test('reader uses Firebase Auth UID literally and preserves dots, underscores, and case', async () => {
  const calls: string[] = [];
  const reader = createAuthorizationProfileReader(async (uid) => {
    calls.push(uid);
    return document(uid, canonicalData(true, { adm2: true }));
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
  const profileA = await load(canonicalData(true, { adm2: true }));
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

test('Kiosk credentials are for active frentista or adm2', () => {
  const user = (ativo: boolean, credenciais: Record<string, boolean>) => ({ uid: 'u', funcionario: { ativo, credenciais } });
  assert.equal(isKioskCredentialEligible(user(true, { frentista: true })), true);
  assert.equal(isKioskCredentialEligible(user(true, { adm2: true })), true);
  assert.equal(isKioskCredentialEligible(user(true, { motorista: true })), false);
  assert.equal(isKioskCredentialEligible(user(false, { frentista: true })), false);
  assert.equal(isKioskCredentialEligible({ uid: 'u', funcionario: null }), false);
});

test('profile fields are interpreted strictly as boolean true', async () => {
  const profile = await load({
    nome: 'Strict',
    ativo: 1,
    perfis: { adm2: 1, frentista: 'true', motorista: true, escritorio: true },
  });
  assert.deepEqual(
    { ativo: profile.ativo, adm2: profile.adm2, frentista: profile.frentista, motorista: profile.motorista, escritorio: profile.escritorio },
    { ativo: false, adm2: false, frentista: false, motorista: true, escritorio: true },
  );
});

const _typeCheck: AuthorizationProfile | null = null;
void _typeCheck;
