import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { provisionMondayWebhook, sanitizeProvisionResult, MondayWebhookProvisionError } from '../src/services/mondayWebhookProvisionService';

const pageSource = readFileSync(new URL('../src/features/cronograma-obras/CronogramaObrasPage.tsx', import.meta.url), 'utf8');

test('AUDIT is sanitized to webhook metadata and never exposes token or secret fields', () => {
  const result = sanitizeProvisionResult('AUDIT', { access_token: 'secret', refresh_token: 'secret', webhooks: [{ id: 1, event: 'change_subitem_column_value', board_id: 8515762377, config: JSON.stringify({ url: 'https://example.test', secret: 'hidden' }) }] });
  assert.deepEqual(result, { canaryExists: false, canaryWebhookIds: [], webhooks: [{ id: '1', event: 'change_subitem_column_value', boardId: '8515762377', config: { url: 'https://example.test' } }] });
  assert.doesNotMatch(JSON.stringify(result), /token|secret|authorization/i);
});

test('ENSURE_CANARY preserves only CREATED/ALREADY_EXISTS and safe metadata', () => {
  for (const result of ['CREATED', 'ALREADY_EXISTS']) {
    const safe = sanitizeProvisionResult('ENSURE_CANARY', { result, webhook: { id: '42', event: 'change_subitem_column_value', board_id: '8515762377', config: { url: 'https://example.test' }, graphql: 'hidden' } });
    assert.equal(safe.result, result);
    assert.equal(safe.webhook?.id, '42');
    assert.doesNotMatch(JSON.stringify(safe), /graphql|token|secret/i);
  }
});

test('duplicate and cleanup results preserve only administrative webhook IDs', () => {
  const duplicates = sanitizeProvisionResult('ENSURE_CANARY', { result: 'DUPLICATES_DETECTED', count: 3, webhookIds: ['1', '2', '3'], token: 'hidden' });
  assert.equal(duplicates.result, 'DUPLICATES_DETECTED');
  assert.deepEqual(duplicates.webhookIds, ['1', '2', '3']);
  const cleaned = sanitizeProvisionResult('CLEANUP_CANARY_DUPLICATES', { result: 'CLEANED', keptWebhookId: '1', deletedWebhookIds: ['2', '3'], remainingCount: 1, graphql: 'hidden' });
  assert.equal(cleaned.result, 'CLEANED');
  assert.equal(cleaned.keptWebhookId, '1');
  assert.doesNotMatch(JSON.stringify({ duplicates, cleaned }), /token|graphql|secret/i);
});

test('frontend sends only the fixed mode and Firebase Bearer', async () => {
  const requests: RequestInit[] = [];
  const user = { getIdToken: async () => 'firebase-id-token' } as any;
  const fetchMock = async (_url: string | URL | Request, init?: RequestInit) => { requests.push(init ?? {}); return new Response(JSON.stringify({ result: 'CREATED', webhook: { id: '7', event: 'change_subitem_column_value', board_id: '8515762377', config: { url: 'safe' } }, webhooks: [] }), { status: 200 }); };
  await provisionMondayWebhook('ENSURE_CANARY', { currentUser: user, fetch: fetchMock });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers && (requests[0].headers as Record<string, string>).Authorization, 'Bearer firebase-id-token');
  assert.deepEqual(JSON.parse(String(requests[0].body)), { mode: 'ENSURE_CANARY' });
  assert.doesNotMatch(String(requests[0].body), /uid|boardId|event|graphql|token|secret|url/i);
});

test('cleanup sends only its mode and no webhook IDs', async () => {
  const requests: RequestInit[] = []; const user = { getIdToken: async () => 'firebase-id-token' } as any;
  await provisionMondayWebhook('CLEANUP_CANARY_DUPLICATES', { currentUser: user, fetch: async (_url, init) => { requests.push(init ?? {}); return new Response(JSON.stringify({ result: 'ALREADY_CLEAN', keptWebhookId: '1', remainingCount: 1 }), { status: 200 }); } });
  assert.deepEqual(JSON.parse(String(requests[0].body)), { mode: 'CLEANUP_CANARY_DUPLICATES' });
  assert.doesNotMatch(String(requests[0].body), /id|board|event|graphql|url/i);
});

test('recreate sends only its fixed mode and result remains safe', async () => {
  const requests: RequestInit[] = []; const user = { getIdToken: async () => 'firebase-id-token' } as any;
  const result = await provisionMondayWebhook('RECREATE_CANARY', { currentUser: user, fetch: async (_url, init) => { requests.push(init ?? {}); return new Response(JSON.stringify({ result: 'RECREATED', deletedWebhookId: '1', createdWebhookId: '2', remainingCount: 1, token: 'hidden' }), { status: 200 }); } });
  assert.deepEqual(JSON.parse(String(requests[0].body)), { mode: 'RECREATE_CANARY' });
  assert.equal(result.result, 'RECREATED'); assert.doesNotMatch(JSON.stringify(result), /token|secret|graphql/i);
});

test('frontend maps 401 and 403 to safe errors', async () => {
  const user = { getIdToken: async () => 'firebase-id-token' } as any;
  for (const [status, message] of [[401, 'Sessão inválida ou expirada.'], [403, 'Seu usuário não possui permissão para esta operação.']] as const) {
    await assert.rejects(() => provisionMondayWebhook('AUDIT', { currentUser: user, fetch: async () => new Response('{}', { status }) }), (error: unknown) => error instanceof MondayWebhookProvisionError && error.status === status && error.message === message);
  }
});

test('controls use the existing adm2 gate, independent loading, confirmation and safe labels', () => {
  assert.match(pageSource, /canSyncMonday && .*Auditar webhooks/s);
  assert.match(pageSource, /canSyncMonday && .*Criar webhook canário/s);
  assert.match(pageSource, /disabled=\{Boolean\(provisioningMode\)\}/);
  assert.match(pageSource, /Criar\/garantir webhook canário change_subitem_column_value\?/);
  assert.match(pageSource, /Limpar webhooks duplicados/);
  assert.match(pageSource, /Remover subscriptions canário duplicadas e preservar somente uma\?/);
  assert.match(pageSource, /Recriar webhook canário/);
  assert.match(pageSource, /Excluir o webhook canário atual e criar uma nova subscription\?/);
  assert.match(pageSource, /Auditando…/);
  assert.match(pageSource, /Criando webhook…/);
  assert.doesNotMatch(pageSource, /access_token|refresh_token|MONDAY_SIGNING_SECRET|MONDAY_OAUTH_CLIENT_SECRET/);
});
