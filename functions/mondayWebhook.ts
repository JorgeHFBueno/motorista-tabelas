import crypto from 'node:crypto';
import express from 'express';
import { db } from './firebaseAdmin.js';
import { mondayApiToken, queryMonday } from './mondayClient.js';
import { syncMondayParentToFirestore, type ParentSyncResult } from './mondayProjector.js';
import { defineSecret } from 'firebase-functions/params';

export const mondayWebhookSigningSecret = defineSecret('MONDAY_SIGNING_SECRET');
export const PARENT_BOARD_ID = '8515762377';
export const SUBITEM_BOARD_ID = '8615383923';
export const MONDAY_WEBHOOK_AUDIENCE = 'https://southamerica-east1-app-motor-api.cloudfunctions.net/mondayWebhook';

export const SUPPORTED_EVENTS = new Set([
  'change_subitem_column_value', 'create_subitem', 'change_subitem_name', 'move_subitem',
  'subitem_archived', 'subitem_deleted', 'change_column_value', 'change_name', 'update_column_value',
]);
const SUBITEM_EVENTS = new Set(['change_subitem_column_value', 'create_subitem', 'change_subitem_name', 'move_subitem', 'subitem_archived', 'subitem_deleted']);
export const SUBITEM_COLUMN_UPDATE_KIND = 'SUBITEM_COLUMN_VALUE_CHANGED';
type AnyRecord = Record<string, any>;
type WebhookEvent = {
  type: string;
  boardId?: unknown;
  parentItemId?: unknown;
  parentItemBoardId?: unknown;
  parent_item_id?: unknown;
  parent_item_board_id?: unknown;
  itemId?: unknown;
  pulseId?: unknown;
  columnId?: unknown;
  subscriptionId?: unknown;
  [key: string]: unknown;
};
type WebhookDependencies = { token: string; firestore?: any; query?: typeof queryMonday; projector?: typeof syncMondayParentToFirestore };

const id = (value: unknown) => typeof value === 'string' && /^\d+$/.test(value) ? value : typeof value === 'number' && Number.isInteger(value) ? String(value) : null;
const headerToken = (value: unknown) => typeof value === 'string' ? value.replace(/^Bearer\s+/i, '').trim() : '';
const decodePart = (value: string) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as AnyRecord;

export function verifyMondayJwt(authorization: unknown, signingSecret: string, audience?: string): AnyRecord {
  const token = headerToken(authorization);
  const parts = token.split('.');
  if (!signingSecret || parts.length !== 3) throw new Error('JWT_INVALID');
  let header: AnyRecord, payload: AnyRecord;
  try { header = decodePart(parts[0]); payload = decodePart(parts[1]); } catch { throw new Error('JWT_INVALID'); }
  if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('JWT_INVALID');
  const expected = crypto.createHmac('sha256', signingSecret).update(`${parts[0]}.${parts[1]}`).digest();
  const actual = Buffer.from(parts[2], 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new Error('JWT_INVALID');
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('JWT_EXPIRED');
  if (payload.aud !== undefined) {
    const matches = Array.isArray(payload.aud) ? payload.aud.includes(audience) : payload.aud === audience;
    if (!audience || !matches) throw new Error('JWT_AUDIENCE_INVALID');
  }
  return payload;
}

export function resolveParentItemId(event: WebhookEvent): string | null {
  const eventType = String(event.type ?? '');
  if (!SUPPORTED_EVENTS.has(eventType)) return null;
  if (eventType === 'update_column_value') return id(event.parentItemId);
  if (SUBITEM_EVENTS.has(eventType)) return id(event.parentItemId ?? event.parent_item_id);
  return id(event.itemId ?? event.pulseId);
}

export function validateWebhookContext(event: WebhookEvent): { parentItemId: string; ignored: false } | { ignored: true; reason: string } {
  const boardId = id(event.boardId);
  const eventType = String(event.type ?? '');
  if (!SUPPORTED_EVENTS.has(eventType)) return { ignored: true, reason: 'EVENT_NOT_SUPPORTED' };
  const realSubitemColumnUpdate = eventType === 'update_column_value';
  if ((SUBITEM_EVENTS.has(eventType) || realSubitemColumnUpdate) && boardId !== SUBITEM_BOARD_ID) return { ignored: true, reason: 'BOARD_NOT_ALLOWED' };
  if ((SUBITEM_EVENTS.has(eventType) || realSubitemColumnUpdate) && id(event.parentItemBoardId ?? event.parent_item_board_id) !== PARENT_BOARD_ID) return { ignored: true, reason: 'PARENT_BOARD_NOT_ALLOWED' };
  if (!SUBITEM_EVENTS.has(eventType) && !realSubitemColumnUpdate && boardId !== PARENT_BOARD_ID) return { ignored: true, reason: 'BOARD_NOT_ALLOWED' };
  const parentItemId = resolveParentItemId(event);
  if (!parentItemId) return { ignored: true, reason: 'PARENT_ID_MISSING' };
  return { parentItemId, ignored: false };
}

export async function handleMondayWebhook(body: AnyRecord, dependencies: WebhookDependencies): Promise<{ result: ParentSyncResult; parentItemId: string }> {
  const event = body?.event as WebhookEvent | undefined;
  if (!event) throw new Error('EVENT_MISSING');
  const context = validateWebhookContext(event);
  if (context.ignored) throw new Error(context.reason);
  const result = await (dependencies.projector ?? syncMondayParentToFirestore)(context.parentItemId, dependencies.token, {
    firestore: dependencies.firestore ?? db,
    mondayQuery: dependencies.query ?? queryMonday,
  });
  return { result, parentItemId: context.parentItemId };
}

export function createMondayWebhookApp(options: { token?: () => string | undefined; signingSecret?: () => string | undefined; audience?: string; firestore?: any; query?: typeof queryMonday; projector?: typeof syncMondayParentToFirestore } = {}) {
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.post(['/', '/api/monday-webhook'], async (req, res) => {
    const challenge = req.body?.challenge;
    if (challenge !== undefined) {
      if (typeof challenge !== 'string' || challenge.length < 1 || challenge.length > 512) { res.status(400).json({ error: 'invalid_challenge' }); return; }
      res.status(200).json({ challenge });
      return;
    }
    try {
      verifyMondayJwt(req.headers.authorization, (options.signingSecret ?? (() => mondayWebhookSigningSecret.value()))() ?? '', options.audience ?? process.env.MONDAY_WEBHOOK_AUDIENCE ?? MONDAY_WEBHOOK_AUDIENCE);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'JWT_INVALID';
      console.warn('MONDAY_WEBHOOK_AUTH_REJECTED', { code });
      res.status(code === 'JWT_EXPIRED' ? 401 : 401).json({ error: 'unauthorized' });
      return;
    }
    const token = (options.token ?? (() => mondayApiToken.value()))();
    if (!token) { res.status(503).json({ error: 'monday_secret_unavailable' }); return; }
    try {
      const event = req.body?.event as WebhookEvent | undefined;
      const context = event ? validateWebhookContext(event) : { ignored: true as const, reason: 'EVENT_MISSING' };
      if (context.ignored) {
        console.info('MONDAY_WEBHOOK_IGNORED', { rawEventType: event?.type ?? null, boardId: id(event?.boardId), reason: context.reason });
        res.status(200).json({ result: 'IGNORED', reason: context.reason });
        return;
      }
      const result = await handleMondayWebhook(req.body, { token, firestore: options.firestore, query: options.query, projector: options.projector });
      console.info('MONDAY_WEBHOOK_RESULT', { rawEventType: event?.type, normalizedKind: event?.type === 'update_column_value' ? SUBITEM_COLUMN_UPDATE_KIND : null, boardId: id(event?.boardId), parentItemBoardId: id(event?.parentItemBoardId ?? event?.parent_item_board_id), parentItemId: result.parentItemId, subitemId: id(event?.pulseId ?? event?.itemId), columnId: typeof event?.columnId === 'string' ? event.columnId : null, subscriptionId: id(event?.subscriptionId), result: result.result.result, changedReasons: result.result.changedReasons });
      res.status(200).json(result.result);
    } catch (error) {
      console.error('MONDAY_WEBHOOK_FAILED', { eventType: req.body?.event?.type ?? null, parentItemId: resolveParentItemId(req.body?.event ?? {}), error: error instanceof Error ? error.message : 'ERROR' });
      res.status(500).json({ error: 'monday_webhook_failed' });
    }
  });
  return app;
}

export const mondayWebhookApp = createMondayWebhookApp();
