import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../firebaseAdmin.js';
import { isValidPin, verifyPin } from './kioskSecurity.js';

const CREDENTIALS = 'kioskCredentials';
const EMPLOYEES = 'funcionarios';
const AUDIT = 'kioskAudit';
const RATE_LIMITS = 'kioskRateLimits';
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
type DocumentData = Record<string, unknown>;

export interface KioskPinAuthTransaction {
  getRateLimit(): Promise<DocumentData | undefined>;
  setRateLimit(data: DocumentData): void;
}

export interface KioskPinAuthStore {
  listEnabledCredentials(): Promise<Array<{ uid: string; data: DocumentData }>>;
  getEmployee(uid: string): Promise<DocumentData | undefined>;
  runRateLimitTransaction<T>(work: (transaction: KioskPinAuthTransaction) => Promise<T>): Promise<T>;
  audit(type: 'KIOSK_AUTH_PIN_SUCCESS' | 'KIOSK_AUTH_PIN_FAILURE' | 'KIOSK_AUTH_PIN_LOCKED' | 'KIOSK_SESSION_STARTED', data: DocumentData): Promise<void>;
}

export interface KioskPinAuthDependencies {
  store: KioskPinAuthStore;
  createCustomToken(uid: string, claims: { kiosk: true }): Promise<string>;
  now?: () => number;
}

function genericCredentialError(): never {
  throw new HttpsError('unauthenticated', 'Credencial inválida.');
}

function requireObject(data: unknown): asserts data is Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Payload inválido.');
  }
}

function terminalMetadata(value: unknown): string {
  return String(value || 'unknown').slice(0, 80);
}

export function createKioskPinAuthService({ store, createCustomToken, now = Date.now }: KioskPinAuthDependencies) {
  const checkRateLimit = async (): Promise<boolean> => store.runRateLimitTransaction(async (transaction) => {
    const current = await transaction.getRateLimit();
    const timestamp = now();
    const lockedUntil = Number(current?.lockedUntil || 0);
    if (lockedUntil > timestamp) return false;
    const windowStarted = Number(current?.windowStarted || timestamp);
    const expired = windowStarted + WINDOW_MS < timestamp
      || (lockedUntil <= timestamp && Number(current?.failures || 0) >= MAX_FAILURES);
    transaction.setRateLimit({
      kind: 'pin',
      windowStarted: expired ? timestamp : windowStarted,
      failures: expired ? 0 : Number(current?.failures || 0),
      lockedUntil: 0,
    });
    return true;
  });

  const registerFailure = async (): Promise<boolean> => store.runRateLimitTransaction(async (transaction) => {
    const current = await transaction.getRateLimit();
    const timestamp = now();
    const windowStarted = Number(current?.windowStarted || 0);
    const lockedUntil = Number(current?.lockedUntil || 0);
    const inWindow = windowStarted + WINDOW_MS >= timestamp;
    const alreadyLocked = lockedUntil > timestamp;
    const failures = (inWindow ? Number(current?.failures || 0) : 0) + 1;
    const locked = alreadyLocked || failures >= MAX_FAILURES;
    transaction.setRateLimit({
      kind: 'pin',
      windowStarted: inWindow ? windowStarted : timestamp,
      failures,
      lockedUntil: locked ? (alreadyLocked ? lockedUntil : timestamp + LOCK_MS) : 0,
    });
    return !alreadyLocked && failures >= MAX_FAILURES;
  });

  const resetRateLimit = async (): Promise<void> => store.runRateLimitTransaction(async (transaction) => {
    if (await transaction.getRateLimit()) {
      transaction.setRateLimit({ failures: 0, lockedUntil: 0, windowStarted: now() });
    }
  });

  return async (data: unknown): Promise<{ uid: string; customToken: string }> => {
    requireObject(data);
    const pin = typeof data.pin === 'string' ? data.pin.trim() : '';
    if (!isValidPin(pin)) genericCredentialError();
    if (!await checkRateLimit()) genericCredentialError();
    const credentials = await store.listEnabledCredentials();
    let match: string | undefined;
    for (const credential of credentials) {
      if (await verifyPin(pin, String(credential.data.pinHash || ''))) match = credential.uid;
    }
    if (!match) {
      const locked = await registerFailure();
      await store.audit(locked ? 'KIOSK_AUTH_PIN_LOCKED' : 'KIOSK_AUTH_PIN_FAILURE', {
        terminalId: terminalMetadata(data.terminalId),
      });
      genericCredentialError();
    }
    const employee = await store.getEmployee(match);
    if (!employee || employee.ativo !== true) genericCredentialError();
    const customToken = await createCustomToken(match, { kiosk: true });
    await resetRateLimit();
    const auditData = { uid: match, terminalId: terminalMetadata(data.terminalId) };
    await store.audit('KIOSK_AUTH_PIN_SUCCESS', auditData);
    await store.audit('KIOSK_SESSION_STARTED', auditData);
    return { uid: match, customToken };
  };
}

const firestoreStore: KioskPinAuthStore = {
  async listEnabledCredentials() {
    const snapshot = await db.collection(CREDENTIALS).where('pinEnabled', '==', true).get();
    return snapshot.docs.map((document) => ({ uid: document.id, data: document.data() }));
  },
  async getEmployee(uid) {
    const snapshot = await db.collection(EMPLOYEES).doc(uid).get();
    return snapshot.exists ? snapshot.data() : undefined;
  },
  async runRateLimitTransaction(work) {
    const ref = db.collection(RATE_LIMITS).doc('pin-global');
    return db.runTransaction(async (transaction) => work({
      async getRateLimit() {
        const snapshot = await transaction.get(ref);
        return snapshot.exists ? snapshot.data() : undefined;
      },
      setRateLimit(data) {
        transaction.set(ref, data, { merge: true });
      },
    }));
  },
  async audit(type, data) {
    await db.collection(AUDIT).add({ type, ...data, createdAt: FieldValue.serverTimestamp() });
  },
};

const service = createKioskPinAuthService({
  store: firestoreStore,
  createCustomToken: (uid, claims) => import('firebase-admin').then(({ default: admin }) => admin.auth().createCustomToken(uid, claims)),
});

export const kioskAuthenticatePin = onCall({ region: 'us-central1' }, (request) => service(request.data));
