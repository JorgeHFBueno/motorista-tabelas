import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { adminAuth, db } from './firebaseAdmin.js';

// The employee changes their own name and login (phone or e-mail) from the WEB "Meu perfil" page.
// Every copy is updated together: Firebase Auth, funcionarios/{uid} and friday-usuarios/{uid}.
// Contract: Manuscript 02_APIS_FUNCTIONS/01_FUNCTIONS_VIGENTES.md.
type DocumentData = Record<string, unknown>;

// Phone login is a synthetic e-mail (same rule as src/services/loginIdentifier.ts).
export const DOMINIO_CELULAR = '@example.com';
// Changing the login asks for a recent sign-in, like Firebase Auth does for the client.
export const LOGIN_RECENTE_SEGUNDOS = 5 * 60;

export function normalizarNome(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const nome = valor.trim().replace(/\s+/g, ' ');
  return nome.length >= 3 && nome.length <= 120 ? nome : null;
}

export function montarLogin(login: unknown): string | null {
  if (!login || typeof login !== 'object') return null;
  const { tipo, valor } = login as { tipo?: unknown; valor?: unknown };
  if (typeof valor !== 'string') return null;
  if (tipo === 'celular') {
    const digitos = valor.replace(/\D/g, '');
    return digitos.length >= 8 && digitos.length <= 13 ? `${digitos}${DOMINIO_CELULAR}` : null;
  }
  if (tipo === 'email') {
    const email = valor.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith(DOMINIO_CELULAR)) return null;
    return email;
  }
  return null;
}

export interface MeuPerfilStore {
  getEmployee(uid: string): Promise<DocumentData | undefined>;
  getAuthUser(uid: string): Promise<{ email?: string; displayName?: string }>;
  updateAuthUser(uid: string, data: { email?: string; displayName?: string }): Promise<void>;
  saveProfile(uid: string, data: { nome?: string; email?: string }): Promise<void>;
}

export type MeuPerfilAuth = { uid?: string; authTime?: number };

export function createMeuPerfilService(store: MeuPerfilStore, agoraSegundos: () => number = () => Math.floor(Date.now() / 1000)) {
  return async (auth: MeuPerfilAuth, data: unknown): Promise<{ nome: string; email: string }> => {
    const uid = auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    const funcionario = await store.getEmployee(uid);
    if (funcionario?.ativo !== true) throw new HttpsError('permission-denied', 'Acesso não autorizado.');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpsError('invalid-argument', 'Dados inválidos.');

    const input = data as { nome?: unknown; login?: unknown };
    const nome = input.nome === undefined ? undefined : normalizarNome(input.nome);
    if (nome === null) throw new HttpsError('invalid-argument', 'O nome deve ter de 3 a 120 caracteres.');
    const email = input.login === undefined ? undefined : montarLogin(input.login);
    if (email === null) throw new HttpsError('invalid-argument', 'Login inválido.');

    const atual = await store.getAuthUser(uid);
    const nomeAtual = typeof funcionario.nome === 'string' ? funcionario.nome : '';
    const mudaNome = nome !== undefined && nome !== nomeAtual;
    const mudaEmail = email !== undefined && email !== (atual.email ?? '').toLowerCase();
    if (!mudaNome && !mudaEmail) {
      return { nome: nomeAtual, email: (atual.email ?? '').toLowerCase() };
    }
    if (mudaEmail && !(typeof auth.authTime === 'number' && agoraSegundos() - auth.authTime <= LOGIN_RECENTE_SEGUNDOS)) {
      throw new HttpsError('failed-precondition', 'Confirme sua senha para trocar o login.', { motivo: 'requires-recent-login' });
    }

    const novoAuth = { ...(mudaNome ? { displayName: nome } : {}), ...(mudaEmail ? { email } : {}) };
    try {
      await store.updateAuthUser(uid, novoAuth);
    } catch (erro) {
      if ((erro as { code?: unknown })?.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'Este login já está em uso.');
      }
      throw erro;
    }
    try {
      await store.saveProfile(uid, { ...(mudaNome ? { nome } : {}), ...(mudaEmail ? { email } : {}) });
    } catch (erro) {
      // Keep Auth and funcionarios consistent: undo the Auth change before failing.
      await store.updateAuthUser(uid, {
        ...(mudaNome ? { displayName: atual.displayName ?? nomeAtual } : {}),
        ...(mudaEmail && atual.email ? { email: atual.email } : {}),
      }).catch((desfazer: unknown) => logger.error('meu-perfil:desfazer-auth', { uid, erro: String(desfazer) }));
      throw erro;
    }
    logger.info('meu-perfil:atualizado', { uid, nome: mudaNome, login: mudaEmail });
    return { nome: mudaNome ? nome! : nomeAtual, email: mudaEmail ? email! : (atual.email ?? '').toLowerCase() };
  };
}

const service = createMeuPerfilService({
  async getEmployee(uid) {
    const snapshot = await db.collection('funcionarios').doc(uid).get();
    return snapshot.exists ? snapshot.data() : undefined;
  },
  async getAuthUser(uid) {
    const user = await adminAuth.getUser(uid);
    return { email: user.email, displayName: user.displayName };
  },
  async updateAuthUser(uid, data) {
    await adminAuth.updateUser(uid, data);
  },
  async saveProfile(uid, data) {
    const fridayRef = db.collection('friday-usuarios').doc(uid);
    const friday = await fridayRef.get();
    const batch = db.batch();
    batch.update(db.collection('funcionarios').doc(uid), { ...data, updatedAt: FieldValue.serverTimestamp() });
    if (friday.exists) batch.update(fridayRef, data);
    await batch.commit();
  },
});

export const atualizarMeuPerfil = onCall({ region: 'southamerica-east1' }, (request) =>
  service({ uid: request.auth?.uid, authTime: request.auth?.token.auth_time }, request.data));
