import assert from 'node:assert/strict';
import test from 'node:test';
import { createKioskAdminService, type KioskAdminStore } from './kioskAdmin.js';
import { hashPin, isValidPinHash, verifyPin } from './kioskSecurity.js';

type Doc = Record<string, unknown>;

function makeStore(employees: Record<string, Doc | undefined>, credentials: Record<string, Doc | undefined>) {
  const audits: Doc[] = [];
  const writes: Array<{ uid: string; data: Doc }> = [];
  const store: KioskAdminStore = {
    async getEmployee(uid) { return employees[uid]; },
    async getCredential(uid) { return credentials[uid]; },
    async setCredential(uid, data) { credentials[uid] = { ...credentials[uid], ...data }; writes.push({ uid, data }); },
    async audit(type, uid, adminUid) { audits.push({ type, uid, adminUid }); },
  };
  return { store, audits, writes };
}

async function rejectsCode(action: Promise<unknown>, code: string) {
  await assert.rejects(action, (error: { code?: string }) => error.code === code);
}

test('PIN policy and hash remain compatible with kioskAuthenticatePin', async () => {
  assert.equal(isValidPinHash(await hashPin('123456')), true);
  const encoded = await hashPin('123456');
  assert.match(encoded, /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(await verifyPin('123456', encoded), true);
  assert.equal(await verifyPin('654321', encoded), false);
  assert.equal(await verifyPin('12345', encoded), false);
  assert.notEqual(encoded, '123456');
});

test('admin authorization does not use 00-autorizados and validates target', async () => {
  const { store } = makeStore({
    admin: { ativo: true, perfis: { adm2: true } },
    inactiveAdmin: { ativo: false, perfis: { adm2: true } },
    nonAdmin: { ativo: true, perfis: { adm2: false } },
  }, {});
  const service = createKioskAdminService(store);
  await rejectsCode(service.setPin(undefined, { uid: 'target', pin: '123456' }), 'unauthenticated');
  await rejectsCode(service.setPin('nonAdmin', { uid: 'target', pin: '123456' }), 'permission-denied');
  await rejectsCode(service.setPin('inactiveAdmin', { uid: 'target', pin: '123456' }), 'permission-denied');
  await rejectsCode(service.setPin('00-autorizados', { uid: 'target', pin: '123456' }), 'permission-denied');
  await rejectsCode(service.setPin('admin', { uid: 'missing', pin: '123456' }), 'not-found');
});

test('set PIN hashes, audits, and preserves QR fields', async () => {
  const credentials: Record<string, Doc | undefined> = {
    target: { qrTokenHash: 'qr-hash', qrRevoked: false },
  };
  const { store, audits, writes } = makeStore({
    admin: { ativo: true, perfis: { adm2: true } },
    target: { ativo: true },
    inactive: { ativo: false },
  }, credentials);
  const service = createKioskAdminService(store);
  await rejectsCode(service.setPin('admin', { uid: 'inactive', pin: '123456' }), 'failed-precondition');
  await rejectsCode(service.setPin('admin', { uid: 'target', pin: '12345' }), 'invalid-argument');
  const result = await service.setPin('admin', { uid: 'target', pin: '123456' });
  assert.deepEqual(result, { uid: 'target', pinConfigured: true, pinEnabled: true });
  const hash = credentials.target?.pinHash;
  assert.equal(typeof hash, 'string');
  assert.equal(await verifyPin('123456', String(hash)), true);
  assert.equal(credentials.target?.qrTokenHash, 'qr-hash');
  assert.equal(credentials.target?.qrRevoked, false);
  assert.equal('pin' in (writes.at(-1)?.data ?? {}), false);
  assert.deepEqual(audits.at(-1), { type: 'PIN_SET', uid: 'target', adminUid: 'admin' });
  await service.setPin('admin', { uid: 'target', pin: '654321' });
  assert.equal(await verifyPin('123456', String(credentials.target?.pinHash)), false);
  assert.equal(await verifyPin('654321', String(credentials.target?.pinHash)), true);
  assert.equal(audits.at(-1)?.type, 'PIN_CHANGED');
});

test('disable preserves hash and QR; re-enable requires configured hash and active target', async () => {
  const oldHash = await hashPin('123456');
  const credentials: Record<string, Doc | undefined> = {
    target: { pinHash: oldHash, pinEnabled: true, qrTokenHash: 'qr-hash', qrRevoked: true },
    noPin: { qrTokenHash: 'other' },
  };
  const { store, audits } = makeStore({
    admin: { ativo: true, perfis: { adm2: true } },
    target: { ativo: true },
    inactive: { ativo: false },
    noPin: { ativo: true },
  }, credentials);
  const service = createKioskAdminService(store);
  await service.setPinEnabled('admin', { uid: 'target', enabled: false });
  assert.equal(credentials.target?.pinHash, oldHash);
  assert.equal(credentials.target?.qrTokenHash, 'qr-hash');
  assert.equal(credentials.target?.pinEnabled, false);
  assert.equal(audits.at(-1)?.type, 'PIN_DISABLED');
  await service.setPinEnabled('admin', { uid: 'target', enabled: true });
  assert.equal(credentials.target?.pinEnabled, true);
  assert.equal(audits.at(-1)?.type, 'PIN_ENABLED');
  await rejectsCode(service.setPinEnabled('admin', { uid: 'noPin', enabled: true }), 'failed-precondition');
  credentials.inactive = { pinHash: oldHash, pinEnabled: false };
  await rejectsCode(service.setPinEnabled('admin', { uid: 'inactive', enabled: true }), 'failed-precondition');
  await service.setPinEnabled('admin', { uid: 'inactive', enabled: false });
});
