import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createKioskPinAuthService } from '../lib/kiosk/kioskAuth.js';
import { hashPin } from '../lib/kiosk/kioskSecurity.js';

function fixture({ uid = 'employee.uid', active = true, enabled = true } = {}) {
  const credentials = enabled ? [{ uid, data: { pinHash: null, pinEnabled: true } }] : [];
  const employees = new Map([[uid, { ativo: active }]]);
  const audits = [];
  let rate = undefined;
  let transactionQueue = Promise.resolve();
  let timestamp = 1_000_000;
  const store = {
    async listEnabledCredentials() { return credentials; },
    async getEmployee(value) { return employees.get(value); },
    async runRateLimitTransaction(work) {
      const run = transactionQueue.then(async () => {
        const pending = { ...rate };
        const result = await work({
          async getRateLimit() { return rate; },
          setRateLimit(data) { Object.assign(pending, data); },
        });
        rate = Object.keys(pending).length ? pending : undefined;
        return result;
      });
      transactionQueue = run.then(() => undefined, () => undefined);
      return run;
    },
    async audit(type, data) { audits.push({ type, data }); },
  };
  const service = createKioskPinAuthService({
    store,
    now: () => timestamp,
    createCustomToken: async (value, claims) => {
      assert.deepEqual(claims, { kiosk: true });
      return `token:${value}`;
    },
  });
  return { service, credentials, employees, audits, setTime(value) { timestamp = value; }, getRate() { return rate; } };
}

async function configuredFixture(options) {
  const value = fixture(options);
  if (value.credentials[0]) value.credentials[0].data.pinHash = await hashPin('123456');
  return value;
}

async function rejectsCredential(action) {
  await assert.rejects(action, (error) => error.code === 'unauthenticated' || error.code === 'invalid-argument');
}

test('kioskAuthenticatePin preserves Flutter contract and custom-token UID', async () => {
  const value = await configuredFixture({ uid: 'JORGE_H.F.B' });
  const result = await value.service({ pin: '123456', terminalId: 'BOMBA-FABRICA-01' });
  assert.deepEqual(result, { uid: 'JORGE_H.F.B', customToken: 'token:JORGE_H.F.B' });
  assert.equal(value.audits[0].type, 'KIOSK_AUTH_PIN_SUCCESS');
  assert.equal(value.audits[0].data.uid, 'JORGE_H.F.B');
  assert.equal(JSON.stringify(value.audits).includes('123456'), false);
  assert.equal(JSON.stringify(value.audits).includes('scrypt'), false);
});

test('invalid payloads, invalid PINs, disabled PINs, missing and inactive employees reject', async () => {
  for (const payload of [undefined, null, [], {}, { pin: '12345' }, { pin: '1234567' }, { pin: 'abcdef' }]) {
    const value = await configuredFixture();
    await rejectsCredential(() => value.service(payload));
  }
  await rejectsCredential(() => configuredFixture().then((value) => value.service({ pin: '000000', terminalId: 'A' })));
  await rejectsCredential(() => configuredFixture({ enabled: false }).then((value) => value.service({ pin: '123456', terminalId: 'A' })));
  const missing = await configuredFixture();
  missing.employees.delete('employee.uid');
  await rejectsCredential(() => missing.service({ pin: '123456', terminalId: 'A' }));
  await rejectsCredential(() => configuredFixture({ active: false }).then((value) => value.service({ pin: '123456', terminalId: 'A' })));
});

test('five failures lock the global bucket and terminalId cannot bypass it', async () => {
  const value = await configuredFixture();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await rejectsCredential(() => value.service({ pin: '000000', terminalId: `terminal-${attempt}` }));
  }
  assert.equal(value.getRate().failures, 5);
  assert.ok(value.getRate().lockedUntil > 1_000_000);
  await rejectsCredential(() => value.service({ pin: '123456', terminalId: 'new-terminal' }));
  assert.equal(value.audits.filter(({ type }) => type === 'KIOSK_AUTH_PIN_LOCKED').length, 1);
  value.setTime(value.getRate().lockedUntil + 1);
  const result = await value.service({ pin: '123456', terminalId: 'new-terminal' });
  assert.equal(result.uid, 'employee.uid');
});

test('rate limit transaction remains global across concurrent terminal attempts', async () => {
  const value = await configuredFixture();
  await Promise.all(Array.from({ length: 5 }, (_, index) => value.service({ pin: '000000', terminalId: `T-${index}` }).catch(() => undefined)));
  assert.equal(value.getRate().failures, 5);
  await rejectsCredential(() => value.service({ pin: '123456', terminalId: 'sixth-terminal' }));
});
