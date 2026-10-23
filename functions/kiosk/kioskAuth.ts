import { FieldValue } from 'firebase-admin/firestore';
import { temCredencial } from '../credenciais.js';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../firebaseAdmin.js';
import { hashQrToken, isValidPin, verifyPin } from './kioskSecurity.js';

// Kiosk sign-in by PIN (employee or administrator) and by QR. Contract: Manuscript
// 02_APIS_FUNCTIONS/07_FUNCTIONS_DO_APP.md (ported from the app's functions/ on 2026-10-21).
const CREDENTIALS = 'kioskCredentials';
const EMPLOYEES = 'funcionarios';
const AUDIT = 'kioskAudit';
const RATE_LIMITS = 'kioskRateLimits';
// Administrative PIN of the Kiosk; Admin SDK only, it does not represent an employee.
const ADMIN_PIN_DOCUMENT = 'kioskAdminConfig/access';
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const QR_CREDENTIAL = /^LEDUR-KIOSK:1:([A-Za-z0-9_-]{43})$/;
type DocumentData = Record<string, unknown>;
type RateLimitKind = 'pin' | 'qr';

export type KioskAuthAuditType =
  | 'KIOSK_AUTH_PIN_SUCCESS'
  | 'KIOSK_AUTH_PIN_FAILURE'
  | 'KIOSK_AUTH_PIN_LOCKED'
  | 'KIOSK_AUTH_ADMIN_PIN_SUCCESS'
  | 'KIOSK_AUTH_ADMIN_PIN_FAILURE'
  | 'KIOSK_AUTH_QR_SUCCESS'
  | 'KIOSK_AUTH_QR_FAILURE'
  | 'KIOSK_SESSION_STARTED';

export interface KioskRateLimitTransaction {
  getRateLimit(): Promise<DocumentData | undefined>;
  setRateLimit(data: DocumentData): void;
}

export interface KioskAuthStore {
  listEnabledCredentials(): Promise<Array<{ uid: string; data: DocumentData }>>;
  findCredentialByQrHash(qrTokenHash: string): Promise<{ uid: string; data: DocumentData } | undefined>;
  getAdminPinConfig(): Promise<DocumentData | undefined>;
  getEmployee(uid: string): Promise<DocumentData | undefined>;
  runRateLimitTransaction<T>(key: string, work: (transaction: KioskRateLimitTransaction) => Promise<T>): Promise<T>;
  audit(type: KioskAuthAuditType, data: DocumentData): Promise<void>;
}

export interface KioskAuthDependencies {
  store: KioskAuthStore;
  createCustomToken(uid: string, claims: { kiosk: true }): Promise<string>;
  now?: () => number;
}

export type KioskAuthResult = { mode: 'admin' } | { mode: 'user'; uid: string; customToken: string };

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

// PIN attempts share one global bucket; each QR token has its own.
export function rateLimitKey(kind: RateLimitKind, value: string): string {
  return kind === 'pin' ? 'pin-global' : hashQrToken(`${kind}:${value}`).slice(0, 32);
}

function createRateLimiter(store: KioskAuthStore, now: () => number) {
  return {
    // false while the bucket is locked.
    check: (kind: RateLimitKind, key: string): Promise<boolean> => store.runRateLimitTransaction(key, async (transaction) => {
      const current = await transaction.getRateLimit();
      const timestamp = now();
      const lockedUntil = Number(current?.lockedUntil || 0);
      if (lockedUntil > timestamp) return false;
      const windowStarted = Number(current?.windowStarted || timestamp);
      const expired = windowStarted + WINDOW_MS < timestamp
        || (lockedUntil <= timestamp && Number(current?.failures || 0) >= MAX_FAILURES);
      transaction.setRateLimit({
        kind,
        windowStarted: expired ? timestamp : windowStarted,
        failures: expired ? 0 : Number(current?.failures || 0),
        lockedUntil: 0,
      });
      return true;
    }),

    // true when this failure locked the bucket.
    registerFailure: (kind: RateLimitKind, key: string): Promise<boolean> => store.runRateLimitTransaction(key, async (transaction) => {
      const current = await transaction.getRateLimit();
      const timestamp = now();
      const windowStarted = Number(current?.windowStarted || 0);
      const lockedUntil = Number(current?.lockedUntil || 0);
      const inWindow = windowStarted + WINDOW_MS >= timestamp;
      const alreadyLocked = lockedUntil > timestamp;
      const failures = (inWindow ? Number(current?.failures || 0) : 0) + 1;
      const locked = alreadyLocked || failures >= MAX_FAILURES;
      transaction.setRateLimit({
        kind,
        windowStarted: inWindow ? windowStarted : timestamp,
        failures,
        lockedUntil: locked ? (alreadyLocked ? lockedUntil : timestamp + LOCK_MS) : 0,
      });
      return !alreadyLocked && failures >= MAX_FAILURES;
    }),

    reset: (key: string): Promise<void> => store.runRateLimitTransaction(key, async (transaction) => {
      if (await transaction.getRateLimit()) {
        transaction.setRateLimit({ failures: 0, lockedUntil: 0, windowStarted: now() });
      }
    }),
  };
}

export function createKioskAuthService({ store, createCustomToken, now = Date.now }: KioskAuthDependencies) {
  const rateLimit = createRateLimiter(store, now);

  // Active employee with frentista (or adm2); the custom token carries the kiosk claim.
  async function startSession(uid: string, method: 'PIN' | 'QR', rateKey: string, terminalId: string): Promise<KioskAuthResult> {
    const employee = await store.getEmployee(uid);
    if (!temCredencial(employee, 'frentista')) genericCredentialError();
    const customToken = await createCustomToken(uid, { kiosk: true });
    await rateLimit.reset(rateKey);
    const auditData = { uid, terminalId };
    await store.audit(method === 'PIN' ? 'KIOSK_AUTH_PIN_SUCCESS' : 'KIOSK_AUTH_QR_SUCCESS', auditData);
    await store.audit('KIOSK_SESSION_STARTED', auditData);
    // uid and customToken stay at the top level for clients that predate the mode field.
    return { mode: 'user', uid, customToken };
  }

  async function authenticatePin(data: unknown): Promise<KioskAuthResult> {
    requireObject(data);
    const pin = typeof data.pin === 'string' ? data.pin.trim() : '';
    const terminalId = terminalMetadata(data.terminalId);
    const key = rateLimitKey('pin', pin);
    if (!isValidPin(pin)) genericCredentialError();
    if (!await rateLimit.check('pin', key)) genericCredentialError();

    // The administrative PIN wins: it never opens an employee session, and a disabled one is refused instead of
    // falling through to an employee with the same PIN.
    const adminPin = await store.getAdminPinConfig();
    if (await verifyPin(pin, String(adminPin?.pinHash || ''))) {
      if (adminPin?.enabled !== true) {
        await rateLimit.registerFailure('pin', key);
        await store.audit('KIOSK_AUTH_ADMIN_PIN_FAILURE', { terminalId });
        genericCredentialError();
      }
      await rateLimit.reset(key);
      await store.audit('KIOSK_AUTH_ADMIN_PIN_SUCCESS', { terminalId });
      return { mode: 'admin' };
    }

    const credentials = await store.listEnabledCredentials();
    let match: string | undefined;
    for (const credential of credentials) {
      if (await verifyPin(pin, String(credential.data.pinHash || ''))) match = credential.uid;
    }
    if (!match) {
      const locked = await rateLimit.registerFailure('pin', key);
      await store.audit(locked ? 'KIOSK_AUTH_PIN_LOCKED' : 'KIOSK_AUTH_PIN_FAILURE', { terminalId });
      genericCredentialError();
    }
    return startSession(match, 'PIN', key, terminalId);
  }

  async function authenticateQr(data: unknown): Promise<KioskAuthResult> {
    requireObject(data);
    const raw = typeof data.credential === 'string' ? data.credential.trim() : '';
    const terminalId = terminalMetadata(data.terminalId);
    const token = QR_CREDENTIAL.exec(raw)?.[1];
    if (!token) genericCredentialError();
    const key = rateLimitKey('qr', token);
    if (!await rateLimit.check('qr', key)) genericCredentialError();
    const credential = await store.findCredentialByQrHash(hashQrToken(token));
    if (!credential || credential.data.qrRevoked === true) {
      await rateLimit.registerFailure('qr', key);
      await store.audit('KIOSK_AUTH_QR_FAILURE', { terminalId });
      genericCredentialError();
    }
    return startSession(credential.uid, 'QR', key, terminalId);
  }

  return { authenticatePin, authenticateQr };
}

const firestoreStore: KioskAuthStore = {
  async listEnabledCredentials() {
    const snapshot = await db.collection(CREDENTIALS).where('pinEnabled', '==', true).get();
    return snapshot.docs.map((document) => ({ uid: document.id, data: document.data() }));
  },
  async findCredentialByQrHash(qrTokenHash) {
    const snapshot = await db.collection(CREDENTIALS).where('qrTokenHash', '==', qrTokenHash).limit(1).get();
    const document = snapshot.docs[0];
    return document ? { uid: document.id, data: document.data() } : undefined;
  },
  async getAdminPinConfig() {
    const snapshot = await db.doc(ADMIN_PIN_DOCUMENT).get();
    return snapshot.exists ? snapshot.data() : undefined;
  },
  async getEmployee(uid) {
    const snapshot = await db.collection(EMPLOYEES).doc(uid).get();
    return snapshot.exists ? snapshot.data() : undefined;
  },
  async runRateLimitTransaction(key, work) {
    const ref = db.collection(RATE_LIMITS).doc(key);
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

const service = createKioskAuthService({
  store: firestoreStore,
  createCustomToken: (uid, claims) => import('firebase-admin').then(({ default: admin }) => admin.auth().createCustomToken(uid, claims)),
});

export const kioskAuthenticatePin = onCall({ region: 'us-central1' }, (request) => service.authenticatePin(request.data));
export const kioskAuthenticateQr = onCall({ region: 'us-central1' }, (request) => service.authenticateQr(request.data));
