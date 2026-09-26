import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createKioskAdminService } from '../lib/kiosk/kioskAdmin.js';

function errorCode(action) {
  return assert.rejects(action, (error) => error.code === 'permission-denied' || error.code === 'invalid-argument');
}

function fixture() {
  const employees = new Map([
    ['admin', { ativo: true, perfis: { adm2: true }, nome: 'Admin' }],
    ['common', { ativo: true, perfis: {}, nome: 'Common' }],
    ['inactiveAdmin', { ativo: false, perfis: { adm2: true } }],
    ['target', { ativo: true, nome: 'Target' }],
    ['inactiveTarget', { ativo: false, nome: 'Inactive' }],
    ['JEFERSON_O.M', { ativo: true, nome: 'Jeferson' }],
    ['JORGE_H.F.B', { ativo: true, nome: 'Jorge' }],
    ['ALINE_B.S', { ativo: true, nome: 'Aline' }],
    ['Mixed_Case.Uid', { ativo: true, nome: 'Mixed case' }],
  ]);
  const credentials = new Map();
  const audits = [];
  const store = {
    getEmployee: async (uid) => employees.get(uid),
    getCredential: async (uid) => credentials.get(uid),
    setCredential: async (uid, data) => credentials.set(uid, { ...credentials.get(uid), ...data }),
    audit: async (type, uid, adminUid) => audits.push({ type, uid, adminUid }),
  };
  return { service: createKioskAdminService(store), credentials, audits };
}

test('authorization permits only active funcionarios adm2, with no legacy fallback', async () => {
  const { service } = fixture();
  await assert.rejects(() => service.provision(undefined, { uid: 'target' }), (error) => error.code === 'unauthenticated');
  await assert.rejects(() => service.revoke(undefined, { uid: 'target' }), (error) => error.code === 'unauthenticated');
  await assert.rejects(() => service.status(undefined, { uids: [] }), (error) => error.code === 'unauthenticated');
  await errorCode(() => service.provision('common', { uid: 'target' }));
  await errorCode(() => service.provision('inactiveAdmin', { uid: 'target' }));
  await errorCode(() => service.provision('legacyOnly', { uid: 'target' }));
  await service.provision('admin', { uid: 'target' });
});

test('provision validates targets, creates a 256-bit payload, hashes only its token, and preserves PIN', async () => {
  const { service, credentials, audits } = fixture();
  credentials.set('target', { pinHash: 'existing-pin', pinEnabled: true, extra: 'kept' });
  await errorCode(() => service.provision('admin', { uid: 'missing' }));
  await errorCode(() => service.provision('admin', { uid: 'inactiveTarget' }));
  const first = await service.provision('admin', { uid: 'target' });
  const token = first.qrPayload.slice('LEDUR-KIOSK:1:'.length);
  const stored = credentials.get('target');
  assert.match(first.qrPayload, /^LEDUR-KIOSK:1:[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(token, 'base64url').length, 32);
  assert.equal(stored.qrTokenHash, createHash('sha256').update(token).digest('hex'));
  assert.notEqual(stored.qrTokenHash, token);
  assert.equal(stored.qrRevoked, false);
  assert.equal(stored.updatedBy, 'admin');
  assert.equal(stored.pinHash, 'existing-pin');
  assert.equal(stored.pinEnabled, true);
  assert.equal(first.replaced, false);
  assert.deepEqual(audits.at(-1), { type: 'QR_PROVISIONED', uid: 'target', adminUid: 'admin' });
  const second = await service.provision('admin', { uid: 'target' });
  assert.notEqual(second.qrPayload, first.qrPayload);
  assert.notEqual(credentials.get('target').qrTokenHash, stored.qrTokenHash);
  assert.equal(second.replaced, true);
  assert.deepEqual(audits.at(-1), { type: 'QR_ROTATED', uid: 'target', adminUid: 'admin' });
});

test('revoke preserves QR/PIN data and permits revoking an inactive employee', async () => {
  const { service, credentials, audits } = fixture();
  credentials.set('inactiveTarget', { qrTokenHash: 'hash', pinHash: 'pin', pinEnabled: true });
  await errorCode(() => service.revoke('common', { uid: 'inactiveTarget' }));
  const result = await service.revoke('admin', { uid: 'inactiveTarget' });
  assert.deepEqual(result, { uid: 'inactiveTarget', qrRevoked: true });
  const stored = credentials.get('inactiveTarget');
  assert.equal(stored.qrTokenHash, 'hash');
  assert.equal(stored.pinHash, 'pin');
  assert.equal(stored.pinEnabled, true);
  assert.equal(stored.qrRevoked, true);
  assert.equal(stored.updatedBy, 'admin');
  assert.deepEqual(audits.at(-1), { type: 'QR_REVOKED', uid: 'inactiveTarget', adminUid: 'admin' });
});

test('status is admin-only, deduplicated, bounded, and never returns hashes', async () => {
  const { service, credentials } = fixture();
  credentials.set('target', { qrTokenHash: 'q', qrRevoked: false, pinHash: 'p', pinEnabled: true, updatedBy: 'admin', updatedAt: 'stamp' });
  credentials.set('inactiveTarget', { qrTokenHash: 'q2', qrRevoked: true, pinHash: 'p2', pinEnabled: false });
  await errorCode(() => service.status('common', { uids: ['target'] }));
  await errorCode(() => service.status('admin', { uids: Array.from({ length: 201 }, (_, i) => `u${i}`) }));
  const result = await service.status('admin', { uids: ['target', 'target', 'inactiveTarget', 'missing'] });
  assert.equal(result.credentials.length, 3);
  assert.deepEqual(result.credentials[0], { uid: 'target', qrConfigured: true, qrRevoked: false, pinConfigured: true, pinEnabled: true, updatedAt: 'stamp', updatedBy: 'admin' });
  assert.deepEqual(result.credentials[1], { uid: 'inactiveTarget', qrConfigured: true, qrRevoked: true, pinConfigured: true, pinEnabled: false, updatedAt: null, updatedBy: null });
  assert.deepEqual(result.credentials[2], { uid: 'missing', qrConfigured: false, qrRevoked: false, pinConfigured: false, pinEnabled: false, updatedAt: null, updatedBy: null });
  assert.equal(JSON.stringify(result).includes('qrTokenHash'), false);
  assert.equal(JSON.stringify(result).includes('pinHash'), false);
});

test('provision accepts canonical dotted UIDs and preserves dots, underscores, and case', async () => {
  const { service, credentials, audits } = fixture();

  for (const uid of ['JEFERSON_O.M', 'JORGE_H.F.B', 'Mixed_Case.Uid']) {
    const result = await service.provision('admin', { uid });
    assert.equal(result.uid, uid);
    assert.equal(credentials.has(uid), true);
    assert.equal(audits.at(-1).uid, uid);
  }

  assert.equal(credentials.has('jeferson_o.m'), false);
  assert.equal(credentials.has('MIXED_CASE.UID'), false);
});

test('status accepts canonical dotted UIDs mixed with a Firebase-style UID', async () => {
  const { service, credentials } = fixture();
  const firebaseUid = 'OTablknvEOV7Yxo5SjTdzk5AbCdEfGhIjKlMnOpQrSt';
  credentials.set('JORGE_H.F.B', {
    qrTokenHash: 'local-placeholder-hash',
    qrRevoked: false,
    updatedBy: 'admin',
    updatedAt: 'stamp',
  });

  const result = await service.status('admin', {
    uids: ['JORGE_H.F.B', 'JEFERSON_O.M', 'ALINE_B.S', firebaseUid],
  });

  assert.deepEqual(result.credentials.map(({ uid }) => uid), [
    'JORGE_H.F.B',
    'JEFERSON_O.M',
    'ALINE_B.S',
    firebaseUid,
  ]);
  assert.deepEqual(result.credentials[0], {
    uid: 'JORGE_H.F.B',
    qrConfigured: true,
    qrRevoked: false,
    pinConfigured: false,
    pinEnabled: false,
    updatedAt: 'stamp',
    updatedBy: 'admin',
  });
});

test('UID validation rejects unsafe or malformed callable payloads', async () => {
  const { service } = fixture();
  const invalidProvisionPayloads = [
    undefined,
    null,
    [],
    {},
    { uid: '' },
    { uid: 'path/segment' },
    { uid: '.' },
    { uid: '..' },
    { uid: '__reserved__' },
    { uid: 'a'.repeat(129) },
    { uid: 123 },
  ];

  for (const payload of invalidProvisionPayloads) {
    await assert.rejects(
      () => service.provision('admin', payload),
      (error) => error.code === 'invalid-argument',
    );
  }

  for (const payload of [undefined, null, [], {}, { uids: 'JEFERSON_O.M' }, { uids: [null] }, { uids: ['bad/path'] }]) {
    await assert.rejects(
      () => service.status('admin', payload),
      (error) => error.code === 'invalid-argument',
    );
  }
});

test('status preserves exact UID values, deduplicates, and enforces the 200 UID limit', async () => {
  const { service } = fixture();
  const exactLimit = Array.from({ length: 200 }, (_, index) => `uid.${index}_Case`);
  const exactLimitResult = await service.status('admin', { uids: exactLimit });
  assert.equal(exactLimitResult.credentials.length, 200);

  await assert.rejects(
    () => service.status('admin', { uids: [...exactLimit, 'uid.200_Case'] }),
    (error) => error.code === 'invalid-argument',
  );

  const deduplicated = await service.status('admin', {
    uids: ['JEFERSON_O.M', 'JEFERSON_O.M', 'Mixed_Case.Uid', 'Mixed_Case.Uid'],
  });
  assert.deepEqual(deduplicated.credentials.map(({ uid }) => uid), ['JEFERSON_O.M', 'Mixed_Case.Uid']);
});
