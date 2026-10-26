import { FieldValue } from 'firebase-admin/firestore';
import { temCredencial } from '../credenciais.js';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../firebaseAdmin.js';

// End of a Kiosk session, reported by the tablet. Contract: Manuscript 02_APIS_FUNCTIONS/07_FUNCTIONS_DO_APP.md.
const SESSION_EVENTS = ['KIOSK_SESSION_CANCELLED', 'KIOSK_SESSION_TIMEOUT', 'KIOSK_SESSION_COMPLETED'] as const;
type SessionEvent = typeof SESSION_EVENTS[number];
type DocumentData = Record<string, unknown>;

export interface KioskSessionStore {
  getEmployee(uid: string): Promise<DocumentData | undefined>;
  audit(type: SessionEvent, data: DocumentData): Promise<void>;
}

export function createKioskSessionService(store: KioskSessionStore) {
  return async (authUid: string | undefined, data: unknown): Promise<{ ok: true }> => {
    const employee = authUid ? await store.getEmployee(authUid) : undefined;
    if (!authUid || !temCredencial(employee, 'frentista')) {
      throw new HttpsError('unauthenticated', 'Sessão inválida.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new HttpsError('invalid-argument', 'Evento inválido.');
    }
    const input = data as { event?: unknown; terminalId?: unknown };
    const event = String(input.event || '');
    if (!(SESSION_EVENTS as readonly string[]).includes(event)) {
      throw new HttpsError('invalid-argument', 'Evento inválido.');
    }
    await store.audit(event as SessionEvent, { uid: authUid, terminalId: String(input.terminalId || 'unknown').slice(0, 80) });
    return { ok: true };
  };
}

const service = createKioskSessionService({
  async getEmployee(uid) {
    const snapshot = await db.collection('funcionarios').doc(uid).get();
    return snapshot.exists ? snapshot.data() : undefined;
  },
  async audit(type, data) {
    await db.collection('kioskAudit').add({ type, ...data, createdAt: FieldValue.serverTimestamp() });
  },
});

// The Cloud Run service was created without the public invoker, so the tablet's calls stopped at Google's IAM (403)
// and never reached kioskAudit. invoker 'public' makes the deploy grant it; the Function itself checks the session.
export const kioskSessionEvent = onCall({ region: 'us-central1', invoker: 'public' }, (request) => service(request.auth?.uid, request.data));
