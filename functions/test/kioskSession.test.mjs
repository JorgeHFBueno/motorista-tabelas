import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createKioskSessionService } from '../lib/kiosk/kioskSession.js';
import { createKioskAdminPinService } from '../lib/kiosk/kioskAdminPin.js';
import { hashPin, verifyPin } from '../lib/kiosk/kioskSecurity.js';

function rejectsCode(action, code) {
  return assert.rejects(action, (error) => error.code === code);
}

function sessionFixture() {
  const employees = new Map([['active', { ativo: true }], ['inactive', { ativo: false }]]);
  const audits = [];
  const service = createKioskSessionService({
    async getEmployee(uid) { return employees.get(uid); },
    async audit(type, data) { audits.push({ type, data }); },
  });
  return { service, audits };
}

test('kioskSessionEvent audits the three session endings for an active employee', async () => {
  const { service, audits } = sessionFixture();
  for (const event of ['KIOSK_SESSION_CANCELLED', 'KIOSK_SESSION_TIMEOUT', 'KIOSK_SESSION_COMPLETED']) {
    assert.deepEqual(await service('active', { event, terminalId: 'BOMBA-FABRICA-01' }), { ok: true });
  }
  assert.deepEqual(audits.map(({ type }) => type), ['KIOSK_SESSION_CANCELLED', 'KIOSK_SESSION_TIMEOUT', 'KIOSK_SESSION_COMPLETED']);
  assert.deepEqual(audits[0].data, { uid: 'active', terminalId: 'BOMBA-FABRICA-01' });
  await service('active', { event: 'KIOSK_SESSION_COMPLETED', terminalId: 'x'.repeat(200) });
  assert.equal(audits.at(-1).data.terminalId.length, 80);
});

test('kioskSessionEvent requires an active employee and a known event', async () => {
  const { service, audits } = sessionFixture();
  await rejectsCode(service(undefined, { event: 'KIOSK_SESSION_COMPLETED' }), 'unauthenticated');
  await rejectsCode(service('inactive', { event: 'KIOSK_SESSION_COMPLETED' }), 'unauthenticated');
  await rejectsCode(service('missing', { event: 'KIOSK_SESSION_COMPLETED' }), 'unauthenticated');
  for (const data of [null, [], 'x', { event: 'KIOSK_SESSION_STARTED' }, {}]) {
    await rejectsCode(service('active', data), 'invalid-argument');
  }
  assert.equal(audits.length, 0);
});

function adminPinFixture() {
  const employees = new Map([
    ['adm2', { ativo: true, perfis: { adm2: true } }],
    ['inactiveAdm2', { ativo: false, perfis: { adm2: true } }],
    ['common', { ativo: true, perfis: { adm1: true } }],
  ]);
  const credentials = [];
  const audits = [];
  let config;
  const service = createKioskAdminPinService({
    async getEmployee(uid) { return employees.get(uid); },
    async listEnabledCredentials() { return credentials; },
    async getAdminPinConfig() { return config; },
    async setAdminPinConfig(data) { config = data; },
    async audit(data) { audits.push(data); },
  });
  return { service, credentials, audits, getConfig: () => config };
}

test('provisionKioskAdminPin stores a hashed PIN, bumps the version and audits without the PIN', async () => {
  const value = adminPinFixture();
  assert.deepEqual(await value.service('adm2', { pin: '999999' }), { ok: true });
  assert.equal(value.getConfig().enabled, true);
  assert.equal(value.getConfig().version, 1);
  assert.equal(value.getConfig().updatedBy, 'adm2');
  assert.equal(await verifyPin('999999', value.getConfig().pinHash), true);
  await value.service('adm2', { pin: '888888', enabled: false });
  assert.equal(value.getConfig().version, 2);
  assert.equal(value.getConfig().enabled, false);
  assert.deepEqual(value.audits[1], { type: 'KIOSK_ADMIN_PIN_PROVISIONED', enabled: false, updatedBy: 'adm2' });
  assert.equal(JSON.stringify(value.audits).includes('888888'), false);
});

test('provisionKioskAdminPin requires an active adm2, a 6-digit PIN and a PIN no enabled employee uses', async () => {
  const value = adminPinFixture();
  await rejectsCode(value.service(undefined, { pin: '999999' }), 'permission-denied');
  await rejectsCode(value.service('common', { pin: '999999' }), 'permission-denied');
  await rejectsCode(value.service('inactiveAdm2', { pin: '999999' }), 'permission-denied');
  await rejectsCode(value.service('adm2', null), 'invalid-argument');
  for (const pin of ['12345', '1234567', 'abcdef', 999999]) {
    await rejectsCode(value.service('adm2', { pin }), 'invalid-argument');
  }
  value.credentials.push({ pinHash: await hashPin('777777'), pinEnabled: true });
  await assert.rejects(value.service('adm2', { pin: '777777' }), (error) => error.code === 'already-exists' && error.message === 'PIN indisponível.');
  assert.equal(value.getConfig(), undefined);
});
