import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../firebaseAdmin.js';
import { hashPin, isValidPin, verifyPin } from './kioskSecurity.js';

// Sets the Kiosk administrative PIN (kioskAdminConfig/access). No client calls it; it is triggered manually.
// Contract: Manuscript 02_APIS_FUNCTIONS/07_FUNCTIONS_DO_APP.md.
type DocumentData = Record<string, unknown>;

export interface KioskAdminPinStore {
  getEmployee(uid: string): Promise<DocumentData | undefined>;
  listEnabledCredentials(): Promise<DocumentData[]>;
  getAdminPinConfig(): Promise<DocumentData | undefined>;
  setAdminPinConfig(data: DocumentData): Promise<void>;
  audit(data: DocumentData): Promise<void>;
}

export function createKioskAdminPinService(store: KioskAdminPinStore) {
  return async (authUid: string | undefined, data: unknown): Promise<{ ok: true }> => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new HttpsError('invalid-argument', 'Payload inválido.');
    }
    const caller = authUid ? await store.getEmployee(authUid) : undefined;
    if (!authUid || caller?.ativo !== true || (caller.perfis as DocumentData | undefined)?.adm2 !== true) {
      throw new HttpsError('permission-denied', 'Operação não permitida.');
    }
    const input = data as { pin?: unknown; enabled?: unknown };
    const pin = typeof input.pin === 'string' ? input.pin.trim() : '';
    const enabled = input.enabled !== false;
    if (!isValidPin(pin)) throw new HttpsError('invalid-argument', 'Dados inválidos.');

    // Refuse a PIN already used by an enabled employee, without saying whose.
    for (const credential of await store.listEnabledCredentials()) {
      if (await verifyPin(pin, String(credential.pinHash || ''))) {
        throw new HttpsError('already-exists', 'PIN indisponível.');
      }
    }
    const current = await store.getAdminPinConfig();
    await store.setAdminPinConfig({
      pinHash: await hashPin(pin),
      enabled,
      version: Number(current?.version || 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: authUid,
    });
    await store.audit({ type: 'KIOSK_ADMIN_PIN_PROVISIONED', enabled, updatedBy: authUid });
    return { ok: true };
  };
}

const ADMIN_PIN = db.doc('kioskAdminConfig/access');

const service = createKioskAdminPinService({
  async getEmployee(uid) {
    const snapshot = await db.collection('funcionarios').doc(uid).get();
    return snapshot.exists ? snapshot.data() : undefined;
  },
  async listEnabledCredentials() {
    const snapshot = await db.collection('kioskCredentials').where('pinEnabled', '==', true).get();
    return snapshot.docs.map((document) => document.data());
  },
  async getAdminPinConfig() {
    const snapshot = await ADMIN_PIN.get();
    return snapshot.exists ? snapshot.data() : undefined;
  },
  async setAdminPinConfig(data) {
    await ADMIN_PIN.set(data);
  },
  async audit(data) {
    await db.collection('kioskAudit').add({ ...data, createdAt: FieldValue.serverTimestamp() });
  },
});

export const provisionKioskAdminPin = onCall({ region: 'us-central1' }, (request) => service(request.auth?.uid, request.data));
