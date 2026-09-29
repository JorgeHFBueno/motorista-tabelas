import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../firebaseAdmin.js';
import { createQrToken, formatQrPayload, hashQrToken } from './kioskSecurity.js';

const EMPLOYEES = 'funcionarios';
const CREDENTIALS = 'kioskCredentials';
const AUDIT = 'kioskAudit';
const MAX_STATUS_UIDS = 200;

type Credential = Record<string, unknown> | undefined;
type Employee = Record<string, unknown> | undefined;

function invalidArgument(): never {
  throw new HttpsError('invalid-argument', 'Dados inválidos.');
}

function requireUid(value: unknown): string {
  const uid = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) invalidArgument();
  return uid;
}

function requireProvisionInput(data: unknown): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) invalidArgument();
  return requireUid((data as { uid?: unknown }).uid);
}

function isActiveAdmin(employee: Employee): boolean {
  return employee?.ativo === true
    && (employee.perfis as Record<string, unknown> | undefined)?.adm2 === true;
}

function isQrConfigured(credential: Credential): boolean {
  return typeof credential?.qrTokenHash === 'string' && credential.qrTokenHash.length > 0;
}

export interface KioskAdminStore {
  getEmployee(uid: string): Promise<Employee>;
  getCredential(uid: string): Promise<Credential>;
  setCredential(uid: string, data: Record<string, unknown>): Promise<void>;
  audit(type: 'QR_PROVISIONED' | 'QR_ROTATED' | 'QR_REVOKED', uid: string, adminUid: string): Promise<void>;
}

export function createKioskAdminService(store: KioskAdminStore) {
  async function requireAdmin(authUid: string | undefined): Promise<string> {
    if (!authUid || !isActiveAdmin(await store.getEmployee(authUid))) {
      throw new HttpsError('permission-denied', 'Operação não permitida.');
    }
    return authUid;
  }

  return {
    async provision(authUid: string | undefined, data: unknown) {
      const adminUid = await requireAdmin(authUid);
      const uid = requireProvisionInput(data);
      const employee = await store.getEmployee(uid);
      if (!employee || employee.ativo !== true) invalidArgument();

      const previous = await store.getCredential(uid);
      const token = createQrToken();
      const qrPayload = formatQrPayload(token);
      await store.setCredential(uid, {
        qrTokenHash: hashQrToken(token),
        qrRevoked: false,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: adminUid,
      });
      await store.audit(isQrConfigured(previous) ? 'QR_ROTATED' : 'QR_PROVISIONED', uid, adminUid);
      return { uid, nome: typeof employee.nome === 'string' ? employee.nome : '', qrPayload, replaced: isQrConfigured(previous) };
    },

    async revoke(authUid: string | undefined, data: unknown) {
      const adminUid = await requireAdmin(authUid);
      const uid = requireProvisionInput(data);
      if (!await store.getEmployee(uid)) invalidArgument();
      await store.setCredential(uid, {
        qrRevoked: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: adminUid,
      });
      await store.audit('QR_REVOKED', uid, adminUid);
      return { uid, qrRevoked: true };
    },

    async status(authUid: string | undefined, data: unknown) {
      await requireAdmin(authUid);
      if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray((data as { uids?: unknown }).uids)) invalidArgument();
      const uids = [...new Set((data as { uids: unknown[] }).uids.map(requireUid))];
      if (uids.length > MAX_STATUS_UIDS) invalidArgument();
      const credentials = await Promise.all(uids.map(async (uid) => {
        const credential = await store.getCredential(uid);
        const qrConfigured = isQrConfigured(credential);
        const pinConfigured = typeof credential?.pinHash === 'string' && credential.pinHash.length > 0;
        return {
          uid,
          qrConfigured,
          qrRevoked: qrConfigured ? credential?.qrRevoked === true : false,
          pinConfigured,
          pinEnabled: pinConfigured ? credential?.pinEnabled === true : false,
          updatedAt: credential?.updatedAt ?? null,
          updatedBy: typeof credential?.updatedBy === 'string' ? credential.updatedBy : null,
        };
      }));
      return { credentials };
    },
  };
}

const firestoreStore: KioskAdminStore = {
  async getEmployee(uid) {
    const snapshot = await db.collection(EMPLOYEES).doc(uid).get();
    return snapshot.exists ? snapshot.data() : undefined;
  },
  async getCredential(uid) {
    const snapshot = await db.collection(CREDENTIALS).doc(uid).get();
    return snapshot.exists ? snapshot.data() : undefined;
  },
  async setCredential(uid, data) {
    await db.collection(CREDENTIALS).doc(uid).set(data, { merge: true });
  },
  async audit(type, uid, adminUid) {
    await db.collection(AUDIT).add({ type, uid, adminUid, createdAt: FieldValue.serverTimestamp() });
  },
};

const service = createKioskAdminService(firestoreStore);

export const provisionKioskCredential = onCall({ region: 'us-central1' }, (request) => service.provision(request.auth?.uid, request.data));
export const revokeKioskQr = onCall({ region: 'us-central1' }, (request) => service.revoke(request.auth?.uid, request.data));
export const getKioskCredentialStatus = onCall({ region: 'us-central1' }, (request) => service.status(request.auth?.uid, request.data));
