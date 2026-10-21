import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createKioskAuthService, rateLimitKey } from '../lib/kiosk/kioskAuth.js';
import { hashPin, hashQrToken } from '../lib/kiosk/kioskSecurity.js';

const QR_TOKEN = 'A'.repeat(43);
const QR_CREDENTIAL = `LEDUR-KIOSK:1:${QR_TOKEN}`;

function fixture({ uid = 'employee.uid', active = true, enabled = true } = {}) {
  const credentials = enabled ? [{ uid, data: { pinHash: null, pinEnabled: true, qrTokenHash: hashQrToken(QR_TOKEN), qrRevoked: false } }] : [];
  const employees = new Map([[uid, { ativo: active }]]);
  const audits = [];
  const rates = new Map();
  let adminPin;
  let transactionQueue = Promise.resolve();
  let timestamp = 1_000_000;
  const store = {
    async listEnabledCredentials() { return credentials; },
    async findCredentialByQrHash(hash) { return credentials.find((credential) => credential.data.qrTokenHash === hash); },
    async getAdminPinConfig() { return adminPin; },
    async getEmployee(value) { return employees.get(value); },
    async runRateLimitTransaction(key, work) {
      const run = transactionQueue.then(async () => {
        const pending = { ...rates.get(key) };
        const result = await work({
          async getRateLimit() { return rates.get(key); },
          setRateLimit(data) { Object.assign(pending, data); },
        });
        if (Object.keys(pending).length) rates.set(key, pending); else rates.delete(key);
        return result;
      });
      transactionQueue = run.then(() => undefined, () => undefined);
      return run;
    },
    async audit(type, data) { audits.push({ type, data }); },
  };
  const service = createKioskAuthService({
    store,
    now: () => timestamp,
    createCustomToken: async (value, claims) => {
      assert.deepEqual(claims, { kiosk: true });
      return `token:${value}`;
    },
  });
  return {
    service, credentials, employees, audits,
    setTime(value) { timestamp = value; },
    getRate(key = 'pin-global') { return rates.get(key); },
    async setAdminPin(pin, enabled = true) { adminPin = { pinHash: await hashPin(pin), enabled, version: 1 }; },
  };
}

async function configuredFixture(options) {
  const value = fixture(options);
  if (value.credentials[0]) value.credentials[0].data.pinHash = await hashPin('123456');
  return value;
}

async function rejectsCredential(action) {
  await assert.rejects(action, (error) => error.code === 'unauthenticated' || error.code === 'invalid-argument');
}

test('kioskAuthenticatePin returns mode "user" and keeps uid/customToken for older clients', async () => {
  const value = await configuredFixture({ uid: 'JORGE_H.F.B' });
  const result = await value.service.authenticatePin({ pin: '123456', terminalId: 'BOMBA-FABRICA-01' });
  assert.deepEqual(result, { mode: 'user', uid: 'JORGE_H.F.B', customToken: 'token:JORGE_H.F.B' });
  assert.deepEqual(value.audits.map(({ type }) => type), ['KIOSK_AUTH_PIN_SUCCESS', 'KIOSK_SESSION_STARTED']);
  assert.deepEqual(value.audits[0].data, { uid: 'JORGE_H.F.B', terminalId: 'BOMBA-FABRICA-01' });
  assert.equal(JSON.stringify(value.audits).includes('123456'), false);
  assert.equal(JSON.stringify(value.audits).includes('scrypt'), false);
});

test('invalid payloads, invalid PINs, disabled PINs, missing and inactive employees reject', async () => {
  for (const payload of [undefined, null, [], {}, { pin: '12345' }, { pin: '1234567' }, { pin: 'abcdef' }, { pin: 123456 }]) {
    const value = await configuredFixture();
    await rejectsCredential(() => value.service.authenticatePin(payload));
  }
  await rejectsCredential(() => configuredFixture().then((value) => value.service.authenticatePin({ pin: '000000', terminalId: 'A' })));
  await rejectsCredential(() => configuredFixture({ enabled: false }).then((value) => value.service.authenticatePin({ pin: '123456', terminalId: 'A' })));
  const missing = await configuredFixture();
  missing.employees.delete('employee.uid');
  await rejectsCredential(() => missing.service.authenticatePin({ pin: '123456', terminalId: 'A' }));
  await rejectsCredential(() => configuredFixture({ active: false }).then((value) => value.service.authenticatePin({ pin: '123456', terminalId: 'A' })));
});

test('five failures lock the global bucket and terminalId cannot bypass it', async () => {
  const value = await configuredFixture();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await rejectsCredential(() => value.service.authenticatePin({ pin: '000000', terminalId: `terminal-${attempt}` }));
  }
  assert.equal(value.getRate().failures, 5);
  assert.ok(value.getRate().lockedUntil > 1_000_000);
  await rejectsCredential(() => value.service.authenticatePin({ pin: '123456', terminalId: 'new-terminal' }));
  assert.equal(value.audits.filter(({ type }) => type === 'KIOSK_AUTH_PIN_LOCKED').length, 1);
  value.setTime(value.getRate().lockedUntil + 1);
  const result = await value.service.authenticatePin({ pin: '123456', terminalId: 'new-terminal' });
  assert.equal(result.uid, 'employee.uid');
});

test('rate limit transaction remains global across concurrent terminal attempts', async () => {
  const value = await configuredFixture();
  await Promise.all(Array.from({ length: 5 }, (_, index) => value.service.authenticatePin({ pin: '000000', terminalId: `T-${index}` }).catch(() => undefined)));
  assert.equal(value.getRate().failures, 5);
  await rejectsCredential(() => value.service.authenticatePin({ pin: '123456', terminalId: 'sixth-terminal' }));
});

test('enabled administrative PIN returns mode "admin" without token or session', async () => {
  const value = await configuredFixture();
  await value.setAdminPin('999999');
  await rejectsCredential(() => value.service.authenticatePin({ pin: '000000', terminalId: 'A' }));
  const result = await value.service.authenticatePin({ pin: '999999', terminalId: 'BOMBA-FABRICA-01' });
  assert.deepEqual(result, { mode: 'admin' });
  assert.deepEqual(value.audits.at(-1), { type: 'KIOSK_AUTH_ADMIN_PIN_SUCCESS', data: { terminalId: 'BOMBA-FABRICA-01' } });
  assert.equal(value.audits.some(({ type }) => type === 'KIOSK_SESSION_STARTED'), false);
  assert.equal(value.getRate().failures, 0);
});

test('administrative PIN wins over an employee with the same PIN; disabled, it is refused without falling through', async () => {
  const value = await configuredFixture();
  await value.setAdminPin('123456');
  assert.deepEqual(await value.service.authenticatePin({ pin: '123456', terminalId: 'A' }), { mode: 'admin' });
  await value.setAdminPin('123456', false);
  await rejectsCredential(() => value.service.authenticatePin({ pin: '123456', terminalId: 'A' }));
  assert.equal(value.audits.at(-1).type, 'KIOSK_AUTH_ADMIN_PIN_FAILURE');
  assert.equal(value.audits.some(({ type }) => type === 'KIOSK_AUTH_PIN_SUCCESS'), false);
  assert.equal(value.getRate().failures, 1);
});

test('kioskAuthenticateQr opens an employee session and audits QR success', async () => {
  const value = await configuredFixture();
  const result = await value.service.authenticateQr({ credential: ` ${QR_CREDENTIAL} `, terminalId: 'BOMBA-FABRICA-01' });
  assert.deepEqual(result, { mode: 'user', uid: 'employee.uid', customToken: 'token:employee.uid' });
  assert.deepEqual(value.audits.map(({ type }) => type), ['KIOSK_AUTH_QR_SUCCESS', 'KIOSK_SESSION_STARTED']);
  assert.equal(JSON.stringify(value.audits).includes(QR_TOKEN), false);
});

test('QR rejects bad format, unknown and revoked tokens, and inactive employees', async () => {
  for (const credential of [undefined, '', 'LEDUR-KIOSK:1:short', `LEDUR-KIOSK:2:${QR_TOKEN}`, `${QR_CREDENTIAL}x`]) {
    const value = await configuredFixture();
    await rejectsCredential(() => value.service.authenticateQr({ credential, terminalId: 'A' }));
  }
  const unknown = await configuredFixture();
  await rejectsCredential(() => unknown.service.authenticateQr({ credential: `LEDUR-KIOSK:1:${'B'.repeat(43)}`, terminalId: 'A' }));
  assert.equal(unknown.audits.at(-1).type, 'KIOSK_AUTH_QR_FAILURE');
  const revoked = await configuredFixture();
  revoked.credentials[0].data.qrRevoked = true;
  await rejectsCredential(() => revoked.service.authenticateQr({ credential: QR_CREDENTIAL, terminalId: 'A' }));
  assert.equal(revoked.audits.at(-1).type, 'KIOSK_AUTH_QR_FAILURE');
  await rejectsCredential(() => configuredFixture({ active: false }).then((value) => value.service.authenticateQr({ credential: QR_CREDENTIAL, terminalId: 'A' })));
});

test('QR failures lock only that token, not the PIN bucket', async () => {
  const value = await configuredFixture();
  value.credentials[0].data.qrRevoked = true;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await rejectsCredential(() => value.service.authenticateQr({ credential: QR_CREDENTIAL, terminalId: 'A' }));
  }
  const key = rateLimitKey('qr', QR_TOKEN);
  assert.equal(key, hashQrToken(`qr:${QR_TOKEN}`).slice(0, 32));
  assert.equal(value.getRate(key).failures, 5);
  assert.equal(value.getRate(key).kind, 'qr');
  value.credentials[0].data.qrRevoked = false;
  await rejectsCredential(() => value.service.authenticateQr({ credential: QR_CREDENTIAL, terminalId: 'A' }));
  assert.equal(value.getRate(), undefined);
  assert.equal((await value.service.authenticatePin({ pin: '123456', terminalId: 'A' })).mode, 'user');
});
