import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { cleanupMondayWebhookCanaryDuplicates, createMondayWebhookProvisionApp, ensureMondayWebhookCanary, isCanary, recreateMondayWebhookCanary } from '../lib/mondayWebhookProvision.js';

const canonicalUrl = 'https://southamerica-east1-app-motor-api.cloudfunctions.net/mondayWebhook';
// Real AUDIT payloads list id, board_id and event but provide no usable URL in config.
const hook = (id, extra = {}) => ({ id: String(id), event: 'change_subitem_column_value', board_id: '8515762377', config: {}, ...extra });
const listen = async app => { const server = http.createServer(app); await new Promise(resolve => server.listen(0, resolve)); return { server, url: `http://127.0.0.1:${server.address().port}/` }; };
const auth = async (_req, _res, next) => next();

test('provision permits only fixed modes and rejects client targets', async () => {
  const calls = []; const query = async (_token, graph) => { calls.push(graph); return { webhooks: [] }; };
  const { server, url } = await listen(createMondayWebhookProvisionApp({ authMiddleware: auth, accessToken: async () => 'temporary-access', query }));
  try {
    const invalid = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'CLEANUP_CANARY_DUPLICATES', webhookId: '1' }) });
    assert.equal(invalid.status, 400);
    const audit = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'AUDIT' }) });
    assert.equal(audit.status, 200); assert.match(calls[0], /app_webhooks_only: true/); assert.doesNotMatch(calls[0], /temporary-access|mutation.*item/i);
  } finally { server.close(); }
});

test('equivalence accepts the real config-without-url payload and validates a supplied URL', () => {
  assert.equal(isCanary(hook('1')), true);
  assert.equal(isCanary(hook('1', { config: JSON.stringify({ url: `${canonicalUrl}/` }) })), true);
  assert.equal(isCanary(hook('1', { config: JSON.stringify({ url: 'https://other.test/mondayWebhook' }) })), false);
  assert.equal(isCanary(hook('1', { event: 'change_name' })), false);
  assert.equal(isCanary(hook('1', { board_id: '9' })), false);
});

test('ensure creates once for zero, recognizes one, and stops on duplicates', async () => {
  let creates = 0;
  const created = await ensureMondayWebhookCanary('token', async (_token, graph) => { if (graph.startsWith('query')) return { webhooks: [] }; creates++; return { create_webhook: { id: '7' } }; });
  assert.equal(created.result, 'CREATED'); assert.equal(creates, 1);
  const one = await ensureMondayWebhookCanary('token', async () => ({ webhooks: [hook('7')] }));
  assert.equal(one.result, 'ALREADY_EXISTS'); assert.equal(one.webhookId, '7');
  for (const count of [2, 3]) {
    let mutations = 0; const result = await ensureMondayWebhookCanary('token', async (_token, graph) => { if (!graph.startsWith('query')) mutations++; return { webhooks: Array.from({ length: count }, (_, i) => hook(i + 1)) }; });
    assert.equal(result.result, 'DUPLICATES_DETECTED'); assert.equal(result.count, count); assert.equal(mutations, 0);
  }
});

test('cleanup has no mutation for zero or one equivalent', async () => {
  assert.deepEqual(await cleanupMondayWebhookCanaryDuplicates('token', async () => ({ webhooks: [] })), { result: 'NOT_FOUND', remainingCount: 0 });
  assert.deepEqual(await cleanupMondayWebhookCanaryDuplicates('token', async () => ({ webhooks: [hook('9')] })), { result: 'ALREADY_CLEAN', keptWebhookId: '9', remainingCount: 1 });
});

test('cleanup preserves numerically smallest ID, deletes duplicates, and rereads', async () => {
  let hooks = [hook('646289246'), hook('646243445'), hook('646289119')]; const mutations = [];
  const result = await cleanupMondayWebhookCanaryDuplicates('token', async (_token, graph) => {
    if (graph.startsWith('query')) return { webhooks: hooks };
    mutations.push(graph); const id = graph.match(/id: (\d+)/)?.[1]; hooks = hooks.filter((item) => item.id !== id); return { delete_webhook: { id } };
  });
  assert.deepEqual(result, { result: 'CLEANED', keptWebhookId: '646243445', deletedWebhookIds: ['646289119', '646289246'], remainingCount: 1 });
  assert.equal(mutations.length, 2); assert.ok(mutations.every((graph) => /delete_webhook/.test(graph) && !/create_webhook|item|subitem/i.test(graph)));
});

test('cleanup reports partial deletion failure without recreation', async () => {
  let hooks = [hook('1'), hook('2'), hook('3')]; let deletes = 0;
  const result = await cleanupMondayWebhookCanaryDuplicates('token', async (_token, graph) => {
    if (graph.startsWith('query')) return { webhooks: hooks };
    deletes++; if (deletes === 2) throw new Error('delete failed'); const id = graph.match(/id: (\d+)/)?.[1]; hooks = hooks.filter((item) => item.id !== id); return { delete_webhook: { id } };
  });
  assert.equal(result.result, 'PARTIAL_FAILURE'); assert.equal(result.keptWebhookId, '1'); assert.deepEqual(result.deletedWebhookIds, ['2']); assert.equal(result.failedWebhookId, '3'); assert.equal(result.remainingCount, 2);
});

test('recreate requires exactly one backend-selected webhook and verifies every stage', async () => {
  assert.deepEqual(await recreateMondayWebhookCanary('token', async () => ({ webhooks: [] })), { result: 'NOT_FOUND', remainingCount: 0 });
  const duplicate = await recreateMondayWebhookCanary('token', async () => ({ webhooks: [hook('1'), hook('2')] }));
  assert.equal(duplicate.result, 'DUPLICATES_DETECTED');
  let hooks = [hook('646243445')]; const calls = [];
  const result = await recreateMondayWebhookCanary('token', async (_token, graph) => {
    calls.push(graph); if (graph.startsWith('query')) return { webhooks: hooks };
    if (graph.includes('delete_webhook')) { hooks = []; return { delete_webhook: { id: '646243445' } }; }
    assert.match(graph, /create_webhook.*8515762377.*change_subitem_column_value/); hooks = [hook('646300000')]; return { create_webhook: { id: '646300000' } };
  });
  assert.deepEqual(result, { result: 'RECREATED', deletedWebhookId: '646243445', createdWebhookId: '646300000', remainingCount: 1 });
  assert.equal(calls.filter((graph) => graph.includes('delete_webhook')).length, 1); assert.equal(calls.filter((graph) => graph.includes('create_webhook')).length, 1);
});

test('recreate never creates when deletion is not confirmed', async () => {
  let creates = 0; const result = await recreateMondayWebhookCanary('token', async (_token, graph) => {
    if (graph.startsWith('query')) return { webhooks: [hook('1')] }; if (graph.includes('create_webhook')) creates++; return { delete_webhook: { id: '1' } };
  });
  assert.equal(result.result, 'DELETE_VERIFICATION_FAILED'); assert.equal(creates, 0);
});
