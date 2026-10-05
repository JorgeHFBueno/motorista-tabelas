import crypto from 'node:crypto';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import { defineSecret, defineString } from 'firebase-functions/params';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db } from './firebaseAdmin.js';
import { GoogleSecretManagerTokenStore, type MondayRefreshTokenStore } from './mondayOAuthTokenStore.js';

export const mondayOAuthClientSecret = defineSecret('MONDAY_OAUTH_CLIENT_SECRET');
export const mondayOAuthClientId = defineString('MONDAY_OAUTH_CLIENT_ID');

export const MONDAY_OAUTH_REDIRECT_URI = 'https://southamerica-east1-app-motor-api.cloudfunctions.net/mondayOAuthCallback';
export const MONDAY_AUTHORIZE_URL = 'https://auth.monday.com/oauth2/authorize';
export const MONDAY_TOKEN_URL = 'https://auth.monday.com/oauth_ms/oauth/token';
export const MONDAY_OAUTH_SCOPES = ['boards:read', 'webhooks:read', 'webhooks:write'] as const;
export const PENDING_TTL_MS = 10 * 60 * 1000;
export const MONDAY_OAUTH_ALLOWED_ORIGINS = ['https://app-motor-api.web.app', 'https://app-motor-api.firebaseapp.com'] as const;

type Pending = { uid: string; codeVerifier: string; createdAt: number; expiresAt: number; schemaVersion: 1 };
type OAuthDeps = {
  verifyIdToken?: (token: string) => Promise<{ uid: string }>;
  readEmployee?: (uid: string) => Promise<any>;
  pending?: PendingStore;
  tokenStore?: MondayRefreshTokenStore;
  fetch?: typeof fetch;
  now?: () => number;
  clientId?: string;
  clientSecret?: () => string;
};

export interface PendingStore {
  save(stateHash: string, pending: Pending): Promise<void>;
  consume(stateHash: string, now: number): Promise<Pending | null>;
}

const pendingCollection = () => db.collection('integrations-internal').doc('monday').collection('oauth-pending');
const lockRef = () => db.collection('integrations-internal').doc('monday').collection('locks').doc('refresh');

export const firestorePendingStore: PendingStore = {
  async save(stateHash, pending) { await pendingCollection().doc(stateHash).create(pending); },
  async consume(stateHash, now) {
    return db.runTransaction(async transaction => {
      const ref = pendingCollection().doc(stateHash);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const data = snapshot.data() as Pending;
      transaction.delete(ref);
      if (data.expiresAt <= now || data.schemaVersion !== 1 || !data.codeVerifier || !data.uid) return null;
      return data;
    });
  },
};

const hashState = (state: string) => crypto.createHash('sha256').update(state).digest('hex');
export const pkceChallenge = (verifier: string) => crypto.createHash('sha256').update(verifier).digest('base64url');
const authHeader = (req: Request) => {
  const match = String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? '';
};
const genericError = (res: Response) => res.status(400).send('<!doctype html><title>Monday OAuth</title><p>Não foi possível concluir a autorização.</p>');
const success = (res: Response) => res.status(200).send('<!doctype html><title>Monday OAuth</title><p>Autorização Monday concluída com sucesso. Você pode fechar esta janela.</p>');

async function exchange(code: string, verifier: string, deps: OAuthDeps) {
  const response = await (deps.fetch ?? fetch)(MONDAY_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_type: 'authorization_code', client_id: deps.clientId ?? mondayOAuthClientId.value(), client_secret: (deps.clientSecret ?? (() => mondayOAuthClientSecret.value()))(), code, redirect_uri: MONDAY_OAUTH_REDIRECT_URI, code_verifier: verifier }) });
  if (!response.ok) throw new Error('OAUTH_TOKEN_EXCHANGE_FAILED');
  const token = await response.json() as Record<string, unknown>;
  if (typeof token.access_token !== 'string' || !token.access_token || typeof token.refresh_token !== 'string' || !token.refresh_token || typeof token.token_type !== 'string' || typeof token.scope !== 'string') throw new Error('OAUTH_TOKEN_RESPONSE_INVALID');
  const scopes = token.scope.split(/[\s,]+/).filter(Boolean);
  if (!MONDAY_OAUTH_SCOPES.every(scope => scopes.includes(scope))) throw new Error('OAUTH_SCOPES_INSUFFICIENT');
  return { refreshToken: token.refresh_token, scopes };
}

export function createMondayOAuthStartApp(deps: OAuthDeps = {}) {
  const app = express();
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || MONDAY_OAUTH_ALLOWED_ORIGINS.includes(origin as typeof MONDAY_OAUTH_ALLOWED_ORIGINS[number])),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    optionsSuccessStatus: 204,
  }));
  app.use(express.json());
  const handler = async (req: Request, res: Response) => {
    const token = authHeader(req);
    if (!token) { res.status(401).json({ error: 'missing_authorization' }); return; }
    try {
      const decoded = await (deps.verifyIdToken ?? (value => adminAuth.verifyIdToken(value)))(token);
      const employee = await (deps.readEmployee ?? (async uid => { const snapshot = await db.collection('funcionarios').doc(uid).get(); return snapshot.exists ? snapshot.data() : undefined; }))(decoded.uid);
      if (!employee || employee.ativo !== true || employee.perfis?.adm2 !== true) { res.status(403).json({ error: 'forbidden' }); return; }
      const clientId = deps.clientId ?? mondayOAuthClientId.value();
      if (!clientId) { res.status(503).json({ error: 'oauth_client_unavailable' }); return; }
      const verifier = crypto.randomBytes(32).toString('base64url');
      const state = crypto.randomBytes(32).toString('base64url');
      const now = deps.now?.() ?? Date.now();
      await (deps.pending ?? firestorePendingStore).save(hashState(state), { uid: decoded.uid, codeVerifier: verifier, createdAt: now, expiresAt: now + PENDING_TTL_MS, schemaVersion: 1 });
      const url = new URL(MONDAY_AUTHORIZE_URL);
      url.search = new URLSearchParams({ client_id: clientId, redirect_uri: MONDAY_OAUTH_REDIRECT_URI, response_type: 'code', state, code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256', scope: MONDAY_OAUTH_SCOPES.join(' ') }).toString();
      console.info('MONDAY_OAUTH_START', { uid: decoded.uid, timestamp: new Date(now).toISOString() });
      res.json({ authorizationUrl: url.toString() });
    } catch (error) { console.error('MONDAY_OAUTH_START_FAILED', { message: error instanceof Error ? error.message : 'ERROR' }); res.status(503).json({ error: 'oauth_start_unavailable' }); }
  };
  app.get('/', handler);
  app.post('/', handler);
  return app;
}

export function createMondayOAuthCallbackApp(deps: OAuthDeps = {}) {
  const app = express();
  app.get('/', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) { genericError(res); return; }
    const now = deps.now?.() ?? Date.now();
    const pending = await (deps.pending ?? firestorePendingStore).consume(hashState(state), now);
    if (!pending) { genericError(res); return; }
    try {
      const result = await exchange(code, pending.codeVerifier, deps);
      await (deps.tokenStore ?? new GoogleSecretManagerTokenStore()).writeRotated(result.refreshToken);
      console.info('MONDAY_OAUTH_CALLBACK_SUCCESS', { uid: pending.uid, scopes: result.scopes, timestamp: new Date(now).toISOString() });
      success(res);
    } catch (error) { console.error('MONDAY_OAUTH_CALLBACK_FAILED', { uid: pending.uid, message: error instanceof Error ? error.message : 'ERROR' }); genericError(res); }
  });
  return app;
}

export async function getMondayWebhookAccessToken(options: { tokenStore?: MondayRefreshTokenStore; fetch?: typeof fetch; clientId?: string; clientSecret?: () => string } = {}): Promise<string> {
  const tokenStore = options.tokenStore ?? new GoogleSecretManagerTokenStore();
  const lease = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const expires = Date.now() + 30_000;
  await db.runTransaction(async transaction => {
    const ref = lockRef(); const snapshot = await transaction.get(ref); const current = snapshot.data();
    if (current?.leaseUntil > Date.now()) throw new Error('MONDAY_REFRESH_BUSY');
    transaction.set(ref, { lease, leaseUntil: expires, updatedAt: FieldValue.serverTimestamp() });
  });
  try {
    return await refreshMondayAccessToken({ ...options, tokenStore });
  } finally {
    await db.runTransaction(async transaction => { transaction.delete(lockRef()); });
  }
}

export async function refreshMondayAccessToken(options: { tokenStore: MondayRefreshTokenStore; fetch?: typeof fetch; clientId?: string; clientSecret?: () => string }): Promise<string> {
  const refreshToken = await options.tokenStore.read();
  const response = await (options.fetch ?? fetch)(MONDAY_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_type: 'refresh_token', client_id: options.clientId ?? mondayOAuthClientId.value(), client_secret: (options.clientSecret ?? (() => mondayOAuthClientSecret.value()))(), refresh_token: refreshToken }) });
  if (!response.ok) throw new Error('OAUTH_REFRESH_FAILED');
  const token = await response.json() as Record<string, unknown>;
  if (typeof token.access_token !== 'string' || !token.access_token || typeof token.refresh_token !== 'string' || !token.refresh_token) throw new Error('OAUTH_REFRESH_RESPONSE_INVALID');
  await options.tokenStore.writeRotated(token.refresh_token);
  return token.access_token;
}

export const mondayOAuthStartApp = createMondayOAuthStartApp();
export const mondayOAuthCallbackApp = createMondayOAuthCallbackApp();
