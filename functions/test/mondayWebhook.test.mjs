import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import test from 'node:test';
import { createMondayWebhookApp, MONDAY_WEBHOOK_AUDIENCE, resolveParentItemId, validateWebhookContext } from '../lib/mondayWebhook.js';

const secret = 'test-signing-secret';
const jwt = (claims = {}) => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode({ exp: Math.floor(Date.now() / 1000) + 300, ...claims });
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
};
const listen = async (app) => { const server = http.createServer(app); await new Promise((resolve) => server.listen(0, resolve)); return { server, url: `http://127.0.0.1:${server.address().port}/` }; };
const post = (url, body, authorization) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body) });

test('challenge echoes exactly and performs no projection', async () => {
  let calls = 0;
  const { server, url } = await listen(createMondayWebhookApp({ signingSecret: () => secret, token: () => 'monday-token', projector: async () => { calls++; throw new Error('must not run'); } }));
  try { const response = await post(url, { challenge: 'a'.repeat(32) }); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { challenge: 'a'.repeat(32) }); assert.equal(calls, 0); } finally { server.close(); }
});

test('prompt challenge value is accepted exactly', async () => {
  const { server, url } = await listen(createMondayWebhookApp({ signingSecret: () => secret, token: () => 'monday-token' }));
  try { const response = await post(url, { challenge: 'mk6c-challenge' }); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { challenge: 'mk6c-challenge' }); } finally { server.close(); }
});

test('missing, invalid, expired and wrong-audience JWTs are rejected without projection', async () => {
  const app = createMondayWebhookApp({ signingSecret: () => secret, token: () => 'monday-token', audience: 'https://expected', projector: async () => { throw new Error('must not run'); } });
  const { server, url } = await listen(app);
  try { for (const auth of [undefined, 'Bearer nope', `Bearer ${jwt({ exp: 1 })}`, `Bearer ${jwt({ aud: 'https://other' })}`]) { const response = await post(url, { event: { type: 'change_name', boardId: '8515762377', itemId: '12808776050' } }, auth); assert.equal(response.status, 401); } } finally { server.close(); }
});

test('allowlist accepts the official subitem context and rejects unrelated boards', () => {
  const subitem = { type: 'change_subitem_name', boardId: '8615383923', parentItemBoardId: '8515762377', parentItemId: 12808776050 };
  assert.equal(resolveParentItemId(subitem), '12808776050');
  assert.deepEqual(validateWebhookContext(subitem), { ignored: false, parentItemId: '12808776050' });
  assert.deepEqual(validateWebhookContext({ ...subitem, parentItemBoardId: '999' }), { ignored: true, reason: 'PARENT_BOARD_NOT_ALLOWED' });
  assert.equal(resolveParentItemId({ type: 'change_name', boardId: '8515762377', pulseId: 12808776050 }), '12808776050');
  assert.deepEqual(validateWebhookContext({ type: 'change_name', boardId: '999', itemId: '1' }), { ignored: true, reason: 'BOARD_NOT_ALLOWED' });
  assert.deepEqual(validateWebhookContext({ type: 'unsupported', boardId: '8515762377', itemId: '1' }), { ignored: true, reason: 'EVENT_NOT_SUPPORTED' });
});

test('every first-version event resolves the parent through identity only', async () => {
  const subitemEvents = ['change_subitem_column_value', 'create_subitem', 'change_subitem_name', 'move_subitem', 'subitem_archived', 'subitem_deleted'];
  for (const type of subitemEvents) assert.equal(resolveParentItemId({ type, boardId: '8615383923', parentItemId: '12808776050', value: { ignored: true } }), '12808776050');
  for (const type of ['change_column_value', 'change_name']) assert.equal(resolveParentItemId({ type, boardId: '8515762377', itemId: '12808776050', value: { ignored: true } }), '12808776050');
});

test('supported event calls canonical projector and does not persist webhook value', async () => {
  const calls = [];
  const { server, url } = await listen(createMondayWebhookApp({ signingSecret: () => secret, token: () => 'monday-token', projector: async (parentItemId, token) => { calls.push({ parentItemId, token }); return { result: 'UPDATED', parentItemId, changedReasons: ['SUBITEM_UPDATE'], changedFields: ['raw'] }; } }));
  const event = { type: 'change_subitem_column_value', boardId: 8615383923, pulseId: 13044433147, itemId: 13044433147, parentItemId: '12808776050', parentItemBoardId: '8515762377', columnId: 'status', subscriptionId: 646243445, value: { fake: 'do-not-persist' } };
  try { const response = await post(url, { event }, `Bearer ${jwt({ aud: MONDAY_WEBHOOK_AUDIENCE })}`); assert.equal(response.status, 200); assert.equal((await response.json()).result, 'UPDATED'); assert.deepEqual(calls, [{ parentItemId: '12808776050', token: 'monday-token' }]); } finally { server.close(); }
});

test('real update_column_value subitem payload resolves parent and projects once', async () => {
  const calls = [];
  const { server, url } = await listen(createMondayWebhookApp({ signingSecret: () => secret, token: () => 'monday-token', projector: async (parentItemId, token) => { calls.push({ parentItemId, token }); return { result: 'UPDATED', parentItemId, changedReasons: ['SUBITEM_UPDATE'], changedFields: ['raw'] }; } }));
  const event = { type: 'update_column_value', boardId: 8615383923, pulseId: 13044433147, itemId: 13044433147, parentItemId: '12808776050', parentItemBoardId: '8515762377', columnId: 'color_mknqcdnw', subscriptionId: 646540228, value: { text: 'ignored-not-persisted' } };
  try { assert.equal(resolveParentItemId(event), '12808776050'); assert.deepEqual(validateWebhookContext(event), { ignored: false, parentItemId: '12808776050' }); const response = await post(url, { event }, `Bearer ${jwt({ aud: MONDAY_WEBHOOK_AUDIENCE })}`); assert.equal(response.status, 200); assert.equal((await response.json()).result, 'UPDATED'); assert.deepEqual(calls, [{ parentItemId: '12808776050', token: 'monday-token' }]); } finally { server.close(); }
});

test('real update_column_value requires both subitem and parent board context', () => {
  const event = { type: 'update_column_value', boardId: 8615383923, parentItemId: '12808776050', parentItemBoardId: '8515762377' };
  assert.deepEqual(validateWebhookContext({ ...event, boardId: 999 }), { ignored: true, reason: 'BOARD_NOT_ALLOWED' });
  assert.deepEqual(validateWebhookContext({ ...event, parentItemBoardId: 999 }), { ignored: true, reason: 'PARENT_BOARD_NOT_ALLOWED' });
  assert.deepEqual(validateWebhookContext({ ...event, parentItemId: undefined }), { ignored: true, reason: 'PARENT_ID_MISSING' });
  assert.deepEqual(validateWebhookContext({ type: 'update_column_value', boardId: 8515762377, itemId: '12808776050' }), { ignored: true, reason: 'BOARD_NOT_ALLOWED' });
});

test('ignored board returns success and projector errors allow retry', async () => {
  let calls = 0;
  const { server, url } = await listen(createMondayWebhookApp({ signingSecret: () => secret, token: () => 'monday-token', projector: async () => { calls++; throw new Error('temporary'); } }));
  try { const ignored = await post(url, { event: { type: 'change_name', boardId: '999', itemId: '1' } }, `Bearer ${jwt()}`); assert.equal(ignored.status, 200); assert.equal(calls, 0); const failed = await post(url, { event: { type: 'change_name', boardId: '8515762377', itemId: '12808776050' } }, `Bearer ${jwt()}`); assert.equal(failed.status, 500); assert.equal(calls, 1); } finally { server.close(); }
});
