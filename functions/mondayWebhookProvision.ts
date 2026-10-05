import express from 'express';
import cors from 'cors';
import { adminAuthMiddleware, type AdminRequest } from './adminAuth.js';
import { getMondayWebhookAccessToken } from './mondayOAuth.js';
import { queryMonday } from './mondayClient.js';

export const WEBHOOK_BOARD_ID = '8515762377';
export const WEBHOOK_EVENT = 'change_subitem_column_value';
export const WEBHOOK_URL = 'https://southamerica-east1-app-motor-api.cloudfunctions.net/mondayWebhook';
const ALLOWED_ORIGINS = new Set(['https://app-motor-api.web.app', 'https://app-motor-api.firebaseapp.com']);

type AnyRecord = Record<string, any>;
type ProvisionDeps = {
  authMiddleware?: typeof adminAuthMiddleware;
  accessToken?: () => Promise<string>;
  query?: typeof queryMonday;
};

const AUDIT_QUERY = `query { webhooks(board_id: ${WEBHOOK_BOARD_ID}, app_webhooks_only: true) { id event board_id config } }`;
const CREATE_QUERY = `mutation { create_webhook(board_id: ${WEBHOOK_BOARD_ID}, url: "${WEBHOOK_URL}", event: ${WEBHOOK_EVENT}) { id } }`;
const numericId = (value: unknown) => typeof value === 'string' && /^\d+$/.test(value) ? value : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : null;

function configFor(webhook: AnyRecord): AnyRecord | null {
  const config = webhook?.config;
  if (config && typeof config === 'object' && !Array.isArray(config)) return config;
  if (typeof config !== 'string') return null;
  try { const parsed = JSON.parse(config); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null; } catch { return null; }
}

function canonicalWebhookUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'southamerica-east1-app-motor-api.cloudfunctions.net' || parsed.search || parsed.hash) return null;
    return parsed.pathname.replace(/\/+$/, '') === '/mondayWebhook' ? WEBHOOK_URL : null;
  } catch { return null; }
}

function safeWebhook(webhook: AnyRecord) {
  return {
    id: webhook?.id == null ? null : String(webhook.id),
    event: typeof webhook?.event === 'string' ? webhook.event : null,
    boardId: webhook?.board_id == null ? null : String(webhook.board_id),
    config: { url: canonicalWebhookUrl(configFor(webhook)?.url) },
  };
}

export function isCanary(webhook: AnyRecord) {
  const suppliedUrl = configFor(webhook)?.url;
  const urlIsAvailable = typeof suppliedUrl === 'string' && suppliedUrl.trim().length > 0;
  const url = canonicalWebhookUrl(suppliedUrl);
  return String(webhook?.event ?? '') === WEBHOOK_EVENT
    && String(webhook?.board_id ?? '') === WEBHOOK_BOARD_ID
    // Monday's app_webhooks_only listing can omit the URL from config. In that
    // case board + event identify the fixed canary safely; if it supplies a
    // URL, it must still be the canonical endpoint.
    && (!urlIsAvailable || url === WEBHOOK_URL);
}

const byWebhookId = (left: AnyRecord, right: AnyRecord) => {
  const a = numericId(left?.id) ?? ''; const b = numericId(right?.id) ?? '';
  return a.length - b.length || a.localeCompare(b);
};
const deleteQuery = (webhookId: string) => `mutation { delete_webhook(id: ${webhookId}) { id } }`;

async function canaryWebhooks(token: string, mondayQuery: typeof queryMonday) {
  const data = await mondayQuery(token, AUDIT_QUERY, {});
  const webhooks: AnyRecord[] = Array.isArray(data?.webhooks) ? data.webhooks : [];
  return { webhooks, equivalents: webhooks.filter(isCanary).sort(byWebhookId) };
}

export async function auditMondayWebhooks(token: string, mondayQuery: typeof queryMonday = queryMonday) {
  const { webhooks, equivalents } = await canaryWebhooks(token, mondayQuery);
  return { webhooks: webhooks.map(safeWebhook), canaryExists: equivalents.length > 0, canaryWebhookIds: equivalents.map((webhook) => numericId(webhook.id)).filter((id): id is string => Boolean(id)) };
}

export async function ensureMondayWebhookCanary(token: string, mondayQuery: typeof queryMonday = queryMonday) {
  const audit = await auditMondayWebhooks(token, mondayQuery);
  if (audit.canaryWebhookIds.length === 1) return { ...audit, result: 'ALREADY_EXISTS' as const, webhookId: audit.canaryWebhookIds[0], event: WEBHOOK_EVENT, boardId: WEBHOOK_BOARD_ID, webhook: null };
  if (audit.canaryWebhookIds.length > 1) return { ...audit, result: 'DUPLICATES_DETECTED' as const, count: audit.canaryWebhookIds.length, webhookIds: audit.canaryWebhookIds, webhook: null };
  const data = await mondayQuery(token, CREATE_QUERY, {});
  const created = data?.create_webhook;
  if (!created?.id) throw new Error('MONDAY_WEBHOOK_CREATE_FAILED');
  return { ...audit, result: 'CREATED' as const, webhookId: String(created.id), event: WEBHOOK_EVENT, boardId: WEBHOOK_BOARD_ID, webhook: safeWebhook({ id: created.id, event: WEBHOOK_EVENT, board_id: WEBHOOK_BOARD_ID, config: { url: WEBHOOK_URL } }) };
}

export async function cleanupMondayWebhookCanaryDuplicates(token: string, mondayQuery: typeof queryMonday = queryMonday) {
  const initial = await canaryWebhooks(token, mondayQuery);
  const ids = initial.equivalents.map((webhook) => numericId(webhook.id)).filter((id): id is string => Boolean(id));
  if (!ids.length) return { result: 'NOT_FOUND' as const, remainingCount: 0 };
  if (ids.length === 1) return { result: 'ALREADY_CLEAN' as const, keptWebhookId: ids[0], remainingCount: 1 };
  const keptWebhookId = ids[0]; const deletedWebhookIds: string[] = [];
  for (const webhookId of ids.slice(1)) {
    try { await mondayQuery(token, deleteQuery(webhookId), {}); deletedWebhookIds.push(webhookId); }
    catch (error) {
      const afterFailure = await canaryWebhooks(token, mondayQuery);
      return { result: 'PARTIAL_FAILURE' as const, keptWebhookId, deletedWebhookIds, failedWebhookId: webhookId, remainingCount: afterFailure.equivalents.length, error: error instanceof Error ? error.message : 'DELETE_WEBHOOK_FAILED' };
    }
  }
  const after = await canaryWebhooks(token, mondayQuery);
  if (after.equivalents.length !== 1 || numericId(after.equivalents[0]?.id) !== keptWebhookId) return { result: 'PARTIAL_FAILURE' as const, keptWebhookId, deletedWebhookIds, failedWebhookId: null, remainingCount: after.equivalents.length, error: 'CLEANUP_VERIFICATION_FAILED' };
  return { result: 'CLEANED' as const, keptWebhookId, deletedWebhookIds, remainingCount: 1 };
}

export async function recreateMondayWebhookCanary(token: string, mondayQuery: typeof queryMonday = queryMonday) {
  const initial = await canaryWebhooks(token, mondayQuery);
  const ids = initial.equivalents.map((webhook) => numericId(webhook.id)).filter((id): id is string => Boolean(id));
  if (!ids.length) return { result: 'NOT_FOUND' as const, remainingCount: 0 };
  if (ids.length > 1) return { result: 'DUPLICATES_DETECTED' as const, count: ids.length, webhookIds: ids };
  const deletedWebhookId = ids[0];
  await mondayQuery(token, deleteQuery(deletedWebhookId), {});
  const afterDelete = await canaryWebhooks(token, mondayQuery);
  if (afterDelete.equivalents.length !== 0) return { result: 'DELETE_VERIFICATION_FAILED' as const, deletedWebhookId, remainingCount: afterDelete.equivalents.length };
  const created = await mondayQuery(token, CREATE_QUERY, {});
  const createdWebhookId = numericId(created?.create_webhook?.id);
  if (!createdWebhookId || createdWebhookId === deletedWebhookId) return { result: 'CREATE_VERIFICATION_FAILED' as const, deletedWebhookId, createdWebhookId, remainingCount: 0 };
  const afterCreate = await canaryWebhooks(token, mondayQuery);
  if (afterCreate.equivalents.length !== 1 || numericId(afterCreate.equivalents[0]?.id) !== createdWebhookId) return { result: 'CREATE_VERIFICATION_FAILED' as const, deletedWebhookId, createdWebhookId, remainingCount: afterCreate.equivalents.length };
  return { result: 'RECREATED' as const, deletedWebhookId, createdWebhookId, remainingCount: 1 };
}

export function createMondayWebhookProvisionApp(options: ProvisionDeps = {}) {
  const app = express();
  app.use(cors({ origin: (origin, callback) => callback(null, !origin || ALLOWED_ORIGINS.has(origin)), methods: ['POST', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type'], optionsSuccessStatus: 204 }));
  app.use(express.json({ limit: '2kb' }));
  app.use(options.authMiddleware ?? adminAuthMiddleware);
  app.post('/', async (req: AdminRequest, res) => {
    const body = req.body ?? {};
    const mode = body.mode;
    if ((mode !== 'AUDIT' && mode !== 'ENSURE_CANARY' && mode !== 'CLEANUP_CANARY_DUPLICATES' && mode !== 'RECREATE_CANARY') || Object.keys(body).length !== 1) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      const token = await (options.accessToken ?? getMondayWebhookAccessToken)();
      const result = mode === 'AUDIT' ? await auditMondayWebhooks(token, options.query)
        : mode === 'ENSURE_CANARY' ? await ensureMondayWebhookCanary(token, options.query)
        : mode === 'CLEANUP_CANARY_DUPLICATES' ? await cleanupMondayWebhookCanaryDuplicates(token, options.query)
        : await recreateMondayWebhookCanary(token, options.query);
      res.json(result);
    } catch (error) {
      console.error('MONDAY_WEBHOOK_PROVISION_FAILED', { uid: req.user?.uid, mode, message: error instanceof Error ? error.message : 'ERROR' });
      res.status(502).json({ error: 'monday_webhook_provision_failed' });
    }
  });
  return app;
}

export const mondayWebhookProvisionApp = createMondayWebhookProvisionApp();
