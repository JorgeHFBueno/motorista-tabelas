import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAuthorizationProfileReader,
  type AuthorizationProfile,
  type FuncionarioDocument,
} from '../src/services/authorizationProfileCore';
import { resolveAuthorizationSession } from '../src/services/authorizationSession';
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

test('app credentials: each flow checks its own and adm2 enters everything; WEB areas are in areas-web.test.ts', async () => {
  const adm2 = await load(canonicalData(true, { adm2: true }));
  const frentista = await load(canonicalData(true, { frentista: true }));
  const motorista = await load(canonicalData(true, { motorista: true }));

  assert.equal(temCredencial(adm2), true);
  assert.equal(temCredencial(adm2, 'frentista'), true);
  assert.equal(temCredencial(frentista, 'frentista'), true);
  assert.equal(temCredencial(frentista, 'mecanico'), false);
  assert.equal(temCredencial(frentista), false, 'without accepted credentials, only adm2');

  // App-only credentials still enter the WEB (Meu perfil), but no area.
  assert.equal(temAlgumaCredencial(motorista), true);
  assert.deepEqual(motorista.areas, {});
});

test('retr0 is exclusive: only who holds it enters /dev, not even adm2 (2026-10-30)', async () => {
  const adm2 = await load(canonicalData(true, { adm2: true }));
  const retr0 = await load(canonicalData(true, { retr0: true }));
  const ambos = await load(canonicalData(true, { adm2: true, retr0: true }));
  const inativo = await load(canonicalData(false, { retr0: true }));

  assert.equal(temCredencial(adm2, 'retr0'), false);
  assert.equal(temCredencial(adm2, 'retr0', 'mecanico'), true, 'another accepted credential still lets adm2 in');
  assert.equal(temCredencial(retr0, 'retr0'), true);
  assert.equal(temCredencial(retr0), false, 'retr0 is not adm2');
  assert.equal(temAlgumaCredencial(retr0), true);
  assert.equal(temCredencial(ambos, 'retr0'), true);
  assert.equal(temCredencial(inativo, 'retr0'), false);
});

test('old WEB credentials (escritorio, engenharia, logistica, autor) are no longer read (cleanup of 2026-11-16)', async () => {
  const antigo = await load(canonicalData(true, { escritorio: true, engenharia: true, logistica: true, autor: true }));
  assert.deepEqual(antigo.areas, {});
  assert.equal(temAlgumaCredencial(antigo), false);
});

test('adm1, user, inactive and missing funcionarios have no WEB entry', async () => {
  const adm1 = await load(canonicalData(true, { adm1: true, user: true }));
  const inactive = await load(canonicalData(false, { adm2: true }));
  const missing = await load();

  assert.equal(temAlgumaCredencial(adm1), false, 'adm1 and user are no longer read');
  assert.equal(temCredencial(adm1), false);
  assert.equal(temAlgumaCredencial(inactive), false);
  assert.equal(temCredencial(inactive), false);
  assert.equal(temAlgumaCredencial(missing), false);
  assert.equal(missing.exists, false);
});

test('legacy authorization never grants or overrides canonical permission', async () => {
  const legacy = { ativo: true, adm2: true };
  const noFuncionario = await load();
  const canonicalDenied = await load(canonicalData(true, { adm2: false }));
  const canonicalAllowed = await load(canonicalData(true, { adm2: true }));

  assert.equal(legacy.adm2, true);
  assert.equal(temCredencial(noFuncionario), false);
  assert.equal(temCredencial(canonicalDenied), false);
  assert.equal(temCredencial(canonicalAllowed), true);
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
    perfis: { adm2: 1, frentista: 'true', motorista: true, mecanico: true },
  });
  assert.deepEqual(
    { ativo: profile.ativo, adm2: profile.adm2, frentista: profile.frentista, motorista: profile.motorista, mecanico: profile.mecanico },
    { ativo: false, adm2: false, frentista: false, motorista: true, mecanico: true },
  );
});

const _typeCheck: AuthorizationProfile | null = null;
void _typeCheck;
